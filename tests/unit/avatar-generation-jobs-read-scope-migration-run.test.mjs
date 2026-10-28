// RUNTIME proof for migration 20261027110000_avatar_generation_jobs_read_scope (D-229). The SQL file is
// executed UNMODIFIED against a real PostgreSQL (PGlite, in-process — no Docker, no network) on a fixture
// built from the repository's own definitions, verbatim:
//   avatar_generation_jobs        tests/fixtures/avatar-generation-jobs.schema.sql
//   avatar_generation_events      20260430000000_avatar_generation_pipeline.sql
//   auth_profile_role             20260603074307_profiles_self_update_policy.sql
//   recover_stuck_job_atomic / sweep_stale_generation_jobs + D-227 hardening, and the cron command
// with production's grants (anon/authenticated/service_role: all table privileges) and both RLS policies
// on the jobs table ("debug read access" for PUBLIC, service_role_full_access). Synthetic rows only.
//
// API calls are modelled as PostgREST makes them (session user authenticator, SET ROLE, verified
// claims); auth.uid() is Supabase's definition. pg_cron is the owner (a non-superuser with BYPASSRLS)
// running the cron command.
//
// HONEST LIMITS: PGlite is PostgreSQL 18, production 17.6; PostgREST and JWT signature checks are not in
// the loop.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...p) => readFileSync(join(ROOT, ...p), "utf8").split("\r\n").join("\n");
const MIG = (f) => read("supabase", "migrations", f);
const FILE = "20261027110000_avatar_generation_jobs_read_scope.sql";
const PIPELINE = "20260430000000_avatar_generation_pipeline.sql";

function fnStatement(file, name) {
  const src = MIG(file);
  const start = src.search(new RegExp(String.raw`CREATE OR REPLACE FUNCTION (public\.)?` + name + String.raw`\(`));
  assert.ok(start >= 0, `${name} in ${file}`);
  const tag = /AS\s+(\$[a-z_]*\$)/i.exec(src.slice(start));
  const bodyStart = src.indexOf(tag[1], start) + tag[1].length;
  const bodyEnd = src.indexOf(tag[1], bodyStart);
  return src.slice(start, src.indexOf(";", bodyEnd) + 1);
}
function slice(file, from, to) {
  const src = MIG(file);
  const a = src.indexOf(from);
  assert.ok(a >= 0, `${from} in ${file}`);
  const b = src.indexOf(to, a);
  assert.ok(b > a);
  return src.slice(a, b + to.length);
}
const CRON = /cron\.schedule\(\s*'sweep-stale-generation-jobs',\s*'[^']+',\s*'([^']+)'\s*\)/.exec(MIG("20260511000000_stuck_job_sweeper.sql"))[1];
// The exact column list admin.html reads.
const ADMIN_SELECT = /\.from\("avatar_generation_jobs"\)\s*\.select\("([^"]+)"\)/.exec(read("js", "admin.js"))[1];

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ADMIN = uuid(901), TEACHER = uuid(902), PUPIL = uuid(903), NOPROFILE = uuid(904);
const JOBS = [uuid(1), uuid(2), uuid(3)];
const STALE = uuid(4);

async function freshDb() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE dbowner LOGIN NOSUPERUSER BYPASSRLS;
    CREATE ROLE anon NOLOGIN NOINHERIT NOBYPASSRLS;
    CREATE ROLE authenticated NOLOGIN NOINHERIT NOBYPASSRLS;
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
    CREATE ROLE authenticator LOGIN NOINHERIT NOSUPERUSER;
    GRANT anon, authenticated, service_role TO authenticator;
    GRANT CREATE, USAGE ON SCHEMA public TO dbowner;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
    GRANT USAGE ON SCHEMA auth TO PUBLIC;
    GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;
    SET ROLE dbowner;
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text NOT NULL);
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
    CREATE POLICY own ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
    GRANT SELECT ON public.profiles TO anon, authenticated, service_role;
    INSERT INTO public.profiles VALUES ('${ADMIN}', 'super_admin'), ('${TEACHER}', 'teacher'), ('${PUPIL}', 'student');`);
  await db.exec(fnStatement("20260603074307_profiles_self_update_policy.sql", "auth_profile_role"));
  await db.exec(read("tests", "fixtures", "avatar-generation-jobs.schema.sql"));
  await db.exec(slice(PIPELINE, "CREATE TABLE IF NOT EXISTS avatar_generation_events", "\n);"));
  await db.exec(fnStatement("20260508020000_recover_stuck_job_atomic_rpc.sql", "recover_stuck_job_atomic"));
  await db.exec(fnStatement("20260511000000_stuck_job_sweeper.sql", "sweep_stale_generation_jobs"));
  await db.exec(`
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO PUBLIC, anon, authenticated, service_role;
    GRANT ALL ON public.avatar_generation_jobs, public.avatar_generation_events TO anon, authenticated, service_role;
    ALTER TABLE public.avatar_generation_jobs ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.avatar_generation_events ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "debug read access" ON public.avatar_generation_jobs FOR SELECT TO public USING (true);
    CREATE POLICY service_role_full_access ON public.avatar_generation_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);
    CREATE POLICY service_role_full_access ON public.avatar_generation_events FOR ALL TO service_role USING (true) WITH CHECK (true);`);
  await db.exec(MIG("20261027090000_sweep_stale_generation_jobs_hardening.sql"));
  const job = (id, status, claimed) => `INSERT INTO public.avatar_generation_jobs
    (id, target_asset_id, slot, generation_prompt, policy_prompt, model_provider, model_version, status,
     initiated_by, initiated_at, claimed_at, version)
    VALUES ('${id}', 'hat_x', 'hat', 'secret prompt', 'pp', 'prov', 'v1', '${status}', 'batch-seq', '2026-01-01T00:00:00Z', ${claimed}, 1);`;
  await db.exec([job(JOBS[0], "pending", "NULL"), job(JOBS[1], "failed_retryable", "'2026-01-02T00:00:00Z'"),
                 job(JOBS[2], "generating", "now()"), job(STALE, "generating", "'2026-01-02T00:00:00Z'"), "RESET ROLE;"].join("\n"));
  return db;
}
async function migrated() {
  const db = await freshDb();
  await db.exec(MIG(FILE));
  return db;
}

const q = (s) => s.split("'").join("''");
async function api(db, claims, sql) {
  try {
    await db.exec(`SET SESSION AUTHORIZATION authenticator;
      SELECT set_config('request.jwt.claims', '${q(JSON.stringify(claims))}', false);
      SET ROLE ${claims.role};`);
    return { ok: true, rows: (await db.query(sql)).rows };
  } catch (e) {
    return { ok: false, code: e.code, message: e.message };
  } finally {
    await db.exec(`RESET ROLE; SET SESSION AUTHORIZATION postgres; SELECT set_config('request.jwt.claims', '', false);`);
  }
}
async function asOwner(db, sql) {
  try {
    await db.exec("SET SESSION AUTHORIZATION dbowner;");
    return { ok: true, rows: (await db.query(sql)).rows };
  } catch (e) {
    return { ok: false, code: e.code, message: e.message };
  } finally {
    await db.exec("RESET ROLE; SET SESSION AUTHORIZATION postgres;");
  }
}

const ANON = { role: "anon" };
const AS = (sub) => ({ role: "authenticated", sub, aud: "authenticated" });
const SERVICE = { role: "service_role" };
const ADMIN_QUERY = `SELECT ${ADMIN_SELECT} FROM public.avatar_generation_jobs ORDER BY initiated_at DESC LIMIT 20`;
const ALL = "SELECT * FROM public.avatar_generation_jobs";
const snapshot = async (db) => (await db.query("SELECT to_jsonb(j) r FROM public.avatar_generation_jobs j ORDER BY id")).rows;

test("BEFORE: the fixture reproduces the exposure — anon and any signed-in user read every job", async () => {
  const db = await freshDb();
  for (const who of [ANON, AS(PUPIL), AS(TEACHER)]) {
    const r = await api(db, who, ALL);
    assert.equal(r.ok, true, r.message);
    assert.equal(r.rows.length, 4);
    assert.equal(r.rows[0].generation_prompt, "secret prompt");
  }
});

test("anon is refused outright (no table privilege) for read and write", async () => {
  const db = await migrated();
  const before = await snapshot(db);
  for (const sql of [ALL, ADMIN_QUERY, `UPDATE public.avatar_generation_jobs SET retry_count = 1`,
                     `DELETE FROM public.avatar_generation_jobs`, `TRUNCATE public.avatar_generation_jobs`]) {
    const r = await api(db, ANON, sql);
    assert.equal(r.ok, false, sql);
    assert.equal(r.code, "42501", `${sql}: ${r.message}`);
  }
  assert.deepEqual(await snapshot(db), before);
});

test("signed-in pupils, teachers and users without a profile see no jobs", async () => {
  const db = await migrated();
  for (const who of [PUPIL, TEACHER, NOPROFILE]) {
    const r = await api(db, AS(who), ALL);
    assert.equal(r.ok, true, r.message);
    assert.equal(r.rows.length, 0, who);
  }
  const noSub = await api(db, { role: "authenticated" }, ALL);
  assert.equal(noSub.ok, true, noSub.message);
  assert.equal(noSub.rows.length, 0);
});

test("admin.html keeps working: a super_admin runs the page's exact query and gets every job", async () => {
  const db = await migrated();
  assert.equal(ADMIN_SELECT, "id, slot, status, retry_count, initiated_at, claimed_at, completed_at, failure_reason");
  const r = await api(db, AS(ADMIN), ADMIN_QUERY);
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(r.rows.map((x) => x.id).sort(), [...JOBS, STALE].sort());
});

test("authenticated writes stay blocked by RLS exactly as before (super_admin included)", async () => {
  for (const db of [await freshDb(), await migrated()]) {
    const before = await snapshot(db);
    for (const who of [PUPIL, ADMIN]) {
      const u = await api(db, AS(who), `UPDATE public.avatar_generation_jobs SET retry_count = 1 RETURNING id`);
      assert.equal(u.ok, true, u.message);
      assert.equal(u.rows.length, 0);
      const d = await api(db, AS(who), `DELETE FROM public.avatar_generation_jobs RETURNING id`);
      assert.equal(d.rows.length, 0);
    }
    assert.deepEqual(await snapshot(db), before);
  }
});

test("service_role (Edge Function, batch tool) keeps full access", async () => {
  const db = await migrated();
  const r = await api(db, SERVICE, ALL);
  assert.equal(r.ok, true, r.message);
  assert.equal(r.rows.length, 4);
  const u = await api(db, SERVICE, `UPDATE public.avatar_generation_jobs SET retry_count = 2 WHERE id = '${JOBS[1]}' RETURNING id`);
  assert.equal(u.rows.length, 1);
  const j = (await db.query(`SELECT version, claimed_at FROM public.avatar_generation_jobs WHERE id = '${STALE}'`)).rows[0];
  const rec = await api(db, SERVICE, `SELECT public.recover_stuck_job_atomic('${STALE}', ${j.version}, now(), '${j.claimed_at.toISOString()}', now()) AS n`);
  assert.equal(rec.ok, true, rec.message);
  assert.equal(rec.rows[0].n, 1);
});

test("pg_cron (the owner) still recovers stale jobs after the change", async () => {
  const db = await migrated();
  const r = await asOwner(db, CRON);
  assert.equal(r.ok, true, r.message);
  assert.equal(r.rows[0].sweep_stale_generation_jobs, 1);
  const s = (await db.query(`SELECT status FROM public.avatar_generation_jobs WHERE id = '${STALE}'`)).rows[0].status;
  assert.equal(s, "failed_retryable");
});

test("policies and grants afterwards: no PUBLIC read, super_admin_read for authenticated, anon has nothing", async () => {
  const db = await migrated();
  const pol = (await db.query(`SELECT polname, polcmd::text cmd, polroles::regrole[]::text roles, pg_get_expr(polqual, polrelid) q
    FROM pg_policy WHERE polrelid = 'public.avatar_generation_jobs'::regclass ORDER BY 1`)).rows;
  assert.deepEqual(pol.map((p) => p.polname), ["service_role_full_access", "super_admin_read"]);
  const sar = pol.find((p) => p.polname === "super_admin_read");
  assert.equal(sar.cmd, "r");
  assert.equal(sar.roles, "{authenticated}");
  assert.match(sar.q, /auth_profile_role\(\).*'super_admin'/);
  assert.equal((await db.query(`SELECT count(*)::int n FROM pg_policy WHERE polrelid = 'public.avatar_generation_jobs'::regclass AND 0 = ANY(polroles)`)).rows[0].n, 0);
  for (const priv of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
    assert.equal((await db.query(`SELECT has_table_privilege('anon', 'public.avatar_generation_jobs', '${priv}') x`)).rows[0].x, false, priv);
  }
  assert.equal((await db.query(`SELECT has_table_privilege('authenticated', 'public.avatar_generation_jobs', 'SELECT') x`)).rows[0].x, true);
});

test("the migration changes only avatar_generation_jobs' read policy and anon's grants on it", async () => {
  const rel = async (db) => (await db.query(`SELECT c.relname, c.relacl::text acl, c.relrowsecurity,
      (SELECT string_agg(polname || ':' || polcmd::text || ':' || pg_get_expr(polqual, polrelid), ',' ORDER BY polname) FROM pg_policy WHERE polrelid = c.oid) pol
    FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' ORDER BY 1`)).rows;
  const fns = async (db) => (await db.query(`SELECT proname, md5(prosrc), proacl::text, proconfig::text FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace ORDER BY 1`)).rows;
  const a = await freshDb();
  const b = await migrated();
  const ra = await rel(a), rb = await rel(b);
  assert.deepEqual(rb.filter((r) => r.relname !== "avatar_generation_jobs"), ra.filter((r) => r.relname !== "avatar_generation_jobs"));
  assert.deepEqual(await fns(b), await fns(a));
  const rows = async (db) => (await db.query("SELECT id, status, version FROM public.avatar_generation_jobs ORDER BY id")).rows;
  assert.deepEqual(await rows(b), await rows(a));
  const stmts = MIG(FILE).replace(/--[^\n]*/g, "");
  assert.doesNotMatch(stmts, /\b(GRANT|TRUNCATE|DELETE|INSERT|UPDATE|ALTER|FUNCTION)\b/i);
});

test("re-running the migration is harmless", async () => {
  const db = await migrated();
  await db.exec(MIG(FILE));
  const pol = (await db.query(`SELECT polname FROM pg_policy WHERE polrelid = 'public.avatar_generation_jobs'::regclass ORDER BY 1`)).rows;
  assert.deepEqual(pol.map((p) => p.polname), ["service_role_full_access", "super_admin_read"]);
  assert.equal((await api(db, AS(ADMIN), ADMIN_QUERY)).rows.length, 4);
  assert.equal((await api(db, ANON, ALL)).code, "42501");
});

test("admin.js is the only page that reads the table", () => {
  const src = read("js", "admin.js");
  assert.equal((src.match(/from\("avatar_generation_jobs"\)/g) || []).length, 1);
  assert.match(read("admin.html"), /js\/admin\.js/);
});
