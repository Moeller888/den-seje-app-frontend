// RUNTIME proof for migration 20261027130000_recover_stuck_job_atomic_execute_scope (D-234). The SQL file
// is executed UNMODIFIED against a real PostgreSQL (PGlite, in-process — no Docker, no network) on a
// fixture built from the repository's own definitions, verbatim:
//   avatar_generation_jobs        tests/fixtures/avatar-generation-jobs.schema.sql
//   avatar_generation_events      20260430000000_avatar_generation_pipeline.sql (table + immutability trigger)
//   recover_stuck_job_atomic      20260508020000_recover_stuck_job_atomic_rpc.sql
//   sweep_stale_generation_jobs   20260511000000_stuck_job_sweeper.sql (and its cron command)
// followed by D-227 (20261027090000, live in production) — i.e. production's state, with its open EXECUTE
// grants on recover_stuck_job_atomic (PUBLIC, anon, authenticated, service_role).
//
// Roles as in production: the owner is a NON-superuser with BYPASSRLS (Supabase's postgres), pg_cron
// runs the job as that owner, and API calls are modelled as PostgREST makes them (session user
// authenticator, SET ROLE, verified claims). Synthetic jobs only.
//
// HONEST LIMITS: PGlite is PostgreSQL 18, production 17.6; pg_cron itself is not in the loop (its
// command and run-as role are); the Edge Function is not run — its client choice is asserted from source.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...p) => readFileSync(join(ROOT, ...p), "utf8").split("\r\n").join("\n");
const MIG = (f) => read("supabase", "migrations", f);
const FILE = "20261027130000_recover_stuck_job_atomic_execute_scope.sql";
const D227 = "20261027090000_sweep_stale_generation_jobs_hardening.sql";
const SWEEPER = "20260511000000_stuck_job_sweeper.sql";
const RECOVER = "20260508020000_recover_stuck_job_atomic_rpc.sql";
const PIPELINE = "20260430000000_avatar_generation_pipeline.sql";

// md5(prosrc) of both functions in production, read 2026-10-27.
const PROD_MD5 = { sweep_stale_generation_jobs: "782ba91fdb8759bbc1bc23ab7492775b", recover_stuck_job_atomic: "15cc440841a3e5b282b85ecff139fce9" };
const RECOVER_SIG = "uuid, integer, timestamptz, timestamptz, timestamptz";

// One `CREATE OR REPLACE FUNCTION public.<name>(` statement out of a migration, verbatim.
function fnStatement(file, name) {
  const src = MIG(file);
  const start = src.search(new RegExp(String.raw`CREATE OR REPLACE FUNCTION (public\.)?` + name + String.raw`\(`));
  assert.ok(start >= 0, `${name} in ${file}`);
  const tag = /AS\s+(\$[a-z_]*\$)/i.exec(src.slice(start));
  const bodyStart = src.indexOf(tag[1], start) + tag[1].length;
  const bodyEnd = src.indexOf(tag[1], bodyStart);
  return src.slice(start, src.indexOf(";", bodyEnd) + 1);
}
// A slice of a migration from `from` up to and including the first `to` after it, verbatim.
function slice(file, from, to) {
  const src = MIG(file);
  const a = src.indexOf(from);
  assert.ok(a >= 0, `${from} in ${file}`);
  const b = src.indexOf(to, a);
  assert.ok(b > a, `${to} after ${from} in ${file}`);
  return src.slice(a, b + to.length);
}
// The cron job's command, verbatim from cron.schedule(...).
function cronCommand() {
  const m = /cron\.schedule\(\s*'sweep-stale-generation-jobs',\s*'\*\/5 \* \* \* \*',\s*'([^']+)'\s*\)/.exec(MIG(SWEEPER));
  assert.ok(m, "cron.schedule in the sweeper migration");
  return m[1];
}
const CRON = cronCommand();

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const STALE_A = uuid(1), STALE_B = uuid(2), PENDING = uuid(4);

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
    SET ROLE dbowner;`);
  await db.exec(read("tests", "fixtures", "avatar-generation-jobs.schema.sql"));
  await db.exec(slice(PIPELINE, "CREATE TABLE IF NOT EXISTS avatar_generation_events", "\n);"));
  await db.exec(slice(PIPELINE, "CREATE OR REPLACE FUNCTION prevent_generation_event_modification()",
                      "EXECUTE FUNCTION prevent_generation_event_modification();\n\nCREATE TRIGGER trg_no_delete_generation_events") +
                slice(PIPELINE, "\n  BEFORE DELETE ON avatar_generation_events", "EXECUTE FUNCTION prevent_generation_event_modification();"));
  await db.exec(fnStatement(RECOVER, "recover_stuck_job_atomic"));
  await db.exec(fnStatement(SWEEPER, "sweep_stale_generation_jobs"));
  await db.exec(`
    GRANT EXECUTE ON FUNCTION public.recover_stuck_job_atomic(${RECOVER_SIG}), public.sweep_stale_generation_jobs()
      TO PUBLIC, anon, authenticated, service_role;
    GRANT ALL ON public.avatar_generation_jobs, public.avatar_generation_events TO anon, authenticated, service_role;
    ALTER TABLE public.avatar_generation_jobs ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.avatar_generation_events ENABLE ROW LEVEL SECURITY;
    CREATE POLICY service_role_full_access ON public.avatar_generation_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);
    CREATE POLICY service_role_full_access ON public.avatar_generation_events FOR ALL TO service_role USING (true) WITH CHECK (true);`);
  // D-227 is live in production: apply it, as the owner, before this migration.
  await db.exec(MIG(D227));
  await db.exec("RESET ROLE;");
  await seed(db);
  return db;
}

async function seed(db) {
  const job = (id, status, claimed) => `INSERT INTO public.avatar_generation_jobs
    (id, target_asset_id, slot, generation_prompt, policy_prompt, model_provider, model_version, status,
     initiated_by, initiated_at, claimed_at, version)
    VALUES ('${id}', 'hat_${id.slice(-2)}', 'hat', 'p', 'pp', 'prov', 'v1', '${status}', 'admin',
     '2026-01-01T00:00:00Z', ${claimed}, 3);`;
  await db.exec([
    job(STALE_A, "generating", "'2026-01-02T00:00:00Z'"),
    job(STALE_B, "generating", "'2026-01-03T00:00:00Z'"),
    job(PENDING, "pending", "NULL"),
  ].join("\n"));
}

async function migrated() {
  const db = await freshDb();
  await db.exec("SET ROLE dbowner;");
  await db.exec(MIG(FILE));
  await db.exec("RESET ROLE;");
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
// pg_cron: the job's command, run by the owner (a non-superuser) in a session of its own.
async function cron(db) {
  try {
    await db.exec("SET SESSION AUTHORIZATION dbowner;");
    return { ok: true, rows: (await db.query(CRON)).rows };
  } catch (e) {
    return { ok: false, code: e.code, message: e.message };
  } finally {
    await db.exec("RESET ROLE; SET SESSION AUTHORIZATION postgres;");
  }
}

const ANON = { role: "anon" };
const PUPIL = { role: "authenticated", sub: uuid(900), aud: "authenticated" };
const SERVICE = { role: "service_role" };
// The Edge Function's call, with the job's real version and claimed_at.
async function recoverCall(db, id) {
  const j = (await db.query(`SELECT version, claimed_at FROM public.avatar_generation_jobs WHERE id = '${id}'`)).rows[0];
  return `SELECT public.recover_stuck_job_atomic('${id}', ${j.version}, now(), '${j.claimed_at.toISOString()}', now()) AS n`;
}
async function jobs(db) {
  return (await db.query(`SELECT id, status, version, failure_stage FROM public.avatar_generation_jobs ORDER BY id`)).rows;
}

test("fixture = production after D-227: bodies have production's md5, recover is open to every API role", async () => {
  const db = await freshDb();
  const f = Object.fromEntries((await db.query(`SELECT proname, md5(prosrc) m, proconfig, proacl::text acl
    FROM pg_proc WHERE proname IN ('sweep_stale_generation_jobs', 'recover_stuck_job_atomic')`)).rows.map((r) => [r.proname, r]));
  for (const [name, md5] of Object.entries(PROD_MD5)) assert.equal(f[name].m, md5, name);
  assert.deepEqual(f.recover_stuck_job_atomic.proconfig, ["search_path=public"]);
  assert.equal(f.recover_stuck_job_atomic.acl, "{=X/dbowner,dbowner=X/dbowner,anon=X/dbowner,authenticated=X/dbowner,service_role=X/dbowner}");
  assert.equal(f.sweep_stale_generation_jobs.acl, "{dbowner=X/dbowner}");
});

test("BEFORE: anon and a signed-in user reach the function (RLS alone stops the write)", async () => {
  const db = await freshDb();
  for (const claims of [ANON, PUPIL]) {
    const r = await api(db, claims, await recoverCall(db, STALE_A));
    assert.equal(r.ok, true, r.message);
    assert.equal(r.rows[0].n, 0, claims.role);
  }
});

for (const [label, claims] of [["anon", ANON], ["a signed-in user (authenticated)", PUPIL]]) {
  test(`${label} through the API is refused (no EXECUTE) and changes nothing`, async () => {
    const db = await migrated();
    const before = await jobs(db);
    const r = await api(db, claims, await recoverCall(db, STALE_A));
    assert.equal(r.ok, false);
    assert.equal(r.code, "42501", r.message);
    assert.match(r.message, /permission denied for function recover_stuck_job_atomic/);
    assert.deepEqual(await jobs(db), before);
  });
}

test("the avatar-generation Edge Function path is unaffected: service_role still recovers a stuck job", async () => {
  const db = await migrated();
  const r = await api(db, SERVICE, await recoverCall(db, STALE_A));
  assert.equal(r.ok, true, r.message);
  assert.equal(r.rows[0].n, 1);
  const a = (await jobs(db)).find((x) => x.id === STALE_A);
  assert.equal(a.status, "failed_retryable");
  assert.equal(a.failure_stage, "timeout-recovery");
  assert.equal(a.version, 4);
});

test("pg_cron (the owner, not a superuser) still recovers exactly the stale jobs through the sweeper", async () => {
  const db = await migrated();
  const r = await cron(db);
  assert.equal(r.ok, true, r.message);
  assert.equal(r.rows[0].sweep_stale_generation_jobs, 2);
  const after = await jobs(db);
  assert.deepEqual(after.filter((x) => x.status === "failed_retryable").map((x) => x.id).sort(), [STALE_A, STALE_B]);
  assert.equal(after.find((x) => x.id === PENDING).status, "pending");
});

test("final grants: only the owner and service_role; no PUBLIC entry; a stranger role gets nothing", async () => {
  const db = await migrated();
  const fn = (await db.query(`SELECT oid, proacl::text acl FROM pg_proc WHERE proname = 'recover_stuck_job_atomic'`)).rows[0];
  assert.equal(fn.acl, "{dbowner=X/dbowner,service_role=X/dbowner}");
  await db.exec("CREATE ROLE stranger NOLOGIN");
  for (const [role, want] of [["anon", false], ["authenticated", false], ["authenticator", false], ["stranger", false], ["service_role", true], ["dbowner", true]]) {
    assert.equal((await db.query(`SELECT has_function_privilege('${role}', ${fn.oid}, 'EXECUTE') x`)).rows[0].x, want, role);
  }
});

test("the migration changes only recover_stuck_job_atomic's grants — body, search_path and all else unchanged", async () => {
  const fns = async (db) => (await db.query(`SELECT p.proname, md5(p.prosrc) m, p.proconfig::text c, p.prosecdef,
      CASE WHEN p.proname = 'recover_stuck_job_atomic' THEN NULL ELSE p.proacl::text END acl
    FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace ORDER BY 1`)).rows;
  const rel = async (db) => (await db.query(`SELECT c.relname, c.relacl::text acl, c.relrowsecurity,
      (SELECT string_agg(polname || ':' || polcmd::text, ',' ORDER BY polname) FROM pg_policy WHERE polrelid = c.oid) pol,
      (SELECT string_agg(tgname, ',' ORDER BY tgname) FROM pg_trigger WHERE tgrelid = c.oid AND NOT tgisinternal) trg
    FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace ORDER BY 1`)).rows;
  const a = await freshDb();
  const b = await migrated();
  assert.deepEqual(await fns(b), await fns(a));
  assert.deepEqual(await rel(b), await rel(a));
  assert.deepEqual(await jobs(b), await jobs(a));
  const stmts = MIG(FILE).replace(/--[^\n]*/g, "");
  assert.doesNotMatch(stmts, /\b(CREATE|DROP|ALTER|TRUNCATE|DELETE|INSERT|UPDATE|GRANT|cron)\b/i);
  assert.equal((stmts.match(/\bREVOKE\b/g) || []).length, 1);
  assert.doesNotMatch(stmts, /service_role/, "service_role keeps its grant");
});

test("re-running the migration is harmless", async () => {
  const db = await migrated();
  const acl = async () => (await db.query(`SELECT proacl::text a FROM pg_proc WHERE proname = 'recover_stuck_job_atomic'`)).rows[0].a;
  const once = await acl();
  await db.exec("SET ROLE dbowner;");
  await db.exec(MIG(FILE));
  await db.exec("RESET ROLE;");
  assert.equal(await acl(), once);
  assert.equal((await cron(db)).rows[0].sweep_stale_generation_jobs, 2);
});

test("every caller in the repository uses the service client; no browser code calls it", () => {
  const dbTs = read("supabase", "functions", "avatar-generation", "database.ts");
  assert.equal((dbTs.match(/rpc\("recover_stuck_job_atomic"/g) || []).length, 1);
  const index = read("supabase", "functions", "avatar-generation", "index.ts");
  const worker = read("supabase", "functions", "avatar-generation", "worker.ts");
  assert.match(index, /supabase = getServiceClient\(\);/);
  assert.match(index, /recoverStuckJob\(\s*supabase,/);
  assert.match(worker, /const supabase = getServiceClient\(\);/);
  assert.match(worker, /recoverStuckJob\(supabase,/);
  for (const f of ["app.js", join("js", "admin.js"), join("js", "supabase.js")]) {
    assert.doesNotMatch(read(f), /recover_stuck_job_atomic/, f);
  }
});
