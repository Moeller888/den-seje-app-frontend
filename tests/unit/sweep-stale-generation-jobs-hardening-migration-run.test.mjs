// RUNTIME proof for migration 20261027090000_sweep_stale_generation_jobs_hardening (D-227). The SQL file is
// executed UNMODIFIED against a real PostgreSQL (PGlite, in-process — no Docker, no network) on a fixture
// built from the repository's own definitions, verbatim:
//   avatar_generation_jobs        tests/fixtures/avatar-generation-jobs.schema.sql (columns + 24 CHECKs)
//   avatar_generation_events      20260430000000_avatar_generation_pipeline.sql (table + immutability trigger)
//   recover_stuck_job_atomic      20260508020000_recover_stuck_job_atomic_rpc.sql
//   sweep_stale_generation_jobs   20260511000000_stuck_job_sweeper.sql (and its cron command)
// with production's open EXECUTE grants (PUBLIC, anon, authenticated, service_role), table grants and the
// two RLS policies on the jobs table. The function bodies are asserted to have production's md5.
//
// Roles as in production: the owner is a NON-superuser with BYPASSRLS (Supabase's postgres), and pg_cron
// runs the job as that owner — modelled as a session of the owner running the cron command verbatim.
// API calls are modelled as PostgREST makes them (session user authenticator, SET ROLE, verified claims).
// Synthetic jobs only.
//
// HONEST LIMITS: PGlite is PostgreSQL 18, production 17.6; pg_cron itself is not in the loop (its
// command and run-as role are); the jobs fixture predates the 'cancelled' status, which the sweeper
// never reads or writes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...p) => readFileSync(join(ROOT, ...p), "utf8").split("\r\n").join("\n");
const MIG = (f) => read("supabase", "migrations", f);
const FILE = "20261027090000_sweep_stale_generation_jobs_hardening.sql";
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
const STALE_A = uuid(1), STALE_B = uuid(2), FRESH = uuid(3), PENDING = uuid(4), DONE = uuid(5), RETRY = uuid(6);

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
    CREATE POLICY "debug read access" ON public.avatar_generation_jobs FOR SELECT TO public USING (true);
    CREATE POLICY service_role_full_access ON public.avatar_generation_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);
    CREATE POLICY service_role_full_access ON public.avatar_generation_events FOR ALL TO service_role USING (true) WITH CHECK (true);
    RESET ROLE;`);
  await seed(db);
  return db;
}

// Fixed timestamps far in the past are stale; FRESH is claimed 14 minutes ago (inside the 15-minute window).
async function seed(db) {
  const job = (id, status, claimed, extra = "") => `INSERT INTO public.avatar_generation_jobs
    (id, target_asset_id, slot, generation_prompt, policy_prompt, model_provider, model_version, status,
     initiated_by, initiated_at, claimed_at, version${extra ? ", " + extra.split("=")[0] : ""})
    VALUES ('${id}', 'hat_${id.slice(-2)}', 'hat', 'p', 'pp', 'prov', 'v1', '${status}', 'admin',
     '2026-01-01T00:00:00Z', ${claimed}, 3${extra ? ", " + extra.split("=")[1] : ""});`;
  await db.exec([
    job(STALE_A, "generating", "'2026-01-02T00:00:00Z'"),
    job(STALE_B, "generating", "'2026-01-03T00:00:00Z'"),
    job(FRESH, "generating", "now() - interval '14 minutes'"),
    job(PENDING, "pending", "NULL"),
    job(DONE, "complete", "'2026-01-02T00:00:00Z'", "completed_at, resulting_asset_id='2026-01-04T00:00:00Z', 'hat_05'"),
    job(RETRY, "failed_retryable", "'2026-01-02T00:00:00Z'"),
  ].join("\n"));
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
const SWEEP = "SELECT public.sweep_stale_generation_jobs() AS n";

async function jobs(db) {
  return (await db.query(`SELECT id, status, version, failure_stage, failure_reason, failure_details, claimed_at, completed_at
    FROM public.avatar_generation_jobs ORDER BY id`)).rows;
}
async function events(db) {
  return (await db.query(`SELECT job_id, stage, outcome, message, details FROM public.avatar_generation_events ORDER BY job_id`)).rows;
}
async function state(db) { return { jobs: await jobs(db), events: await events(db) }; }
const recovered = (rows) => rows.filter((r) => r.status === "failed_retryable" && r.failure_stage === "timeout-recovery").map((r) => r.id).sort();

test("fixture = production: both function bodies have production's md5", async () => {
  const db = await freshDb();
  for (const [name, md5] of Object.entries(PROD_MD5)) {
    const r = await db.query(`SELECT md5(prosrc) m FROM pg_proc WHERE proname = '${name}'`);
    assert.equal(r.rows[0].m, md5, name);
  }
  assert.equal(CRON, "SELECT public.sweep_stale_generation_jobs()");
});

test("BEFORE: the fixture reproduces the problem — anon runs the sweeper as the owner", async () => {
  const db = await freshDb();
  const r = await api(db, ANON, SWEEP);
  assert.equal(r.ok, true, r.message);
  assert.equal(r.rows[0].n, 2);
  assert.deepEqual(recovered(await jobs(db)), [STALE_A, STALE_B]);
});

for (const [label, claims] of [["anon", ANON], ["a signed-in user (authenticated)", PUPIL], ["service_role", SERVICE]]) {
  test(`${label} through the API is refused (no EXECUTE) and changes nothing`, async () => {
    const db = await migrated();
    const before = await state(db);
    const r = await api(db, claims, SWEEP);
    assert.equal(r.ok, false);
    assert.equal(r.code, "42501", r.message);
    assert.match(r.message, /permission denied for function sweep_stale_generation_jobs/);
    assert.deepEqual(await state(db), before);
  });
}

test("PUBLIC gives no indirect EXECUTE: no PUBLIC entry, and a role outside the API roles gets nothing", async () => {
  const db = await migrated();
  const fn = (await db.query(`SELECT oid, proacl::text acl FROM pg_proc WHERE proname = 'sweep_stale_generation_jobs'`)).rows[0];
  assert.equal(fn.acl, "{dbowner=X/dbowner}");
  const pub = await db.query(`SELECT count(*)::int n FROM pg_proc p, aclexplode(p.proacl) a WHERE p.oid = ${fn.oid} AND a.grantee = 0`);
  assert.equal(pub.rows[0].n, 0);
  await db.exec("CREATE ROLE stranger NOLOGIN");
  for (const [role, want] of [["anon", false], ["authenticated", false], ["service_role", false], ["authenticator", false], ["stranger", false], ["dbowner", true]]) {
    assert.equal((await db.query(`SELECT has_function_privilege('${role}', ${fn.oid}, 'EXECUTE') x`)).rows[0].x, want, role);
  }
});

test("pg_cron (the owner, not a superuser) still runs the job and recovers exactly the stale jobs", async () => {
  const db = await migrated();
  const before = await jobs(db);
  const r = await cron(db);
  assert.equal(r.ok, true, r.message);
  assert.equal(r.rows[0].sweep_stale_generation_jobs, 2);
  const after = await jobs(db);
  assert.deepEqual(recovered(after), [STALE_A, STALE_B]);
  for (const id of [STALE_A, STALE_B]) {
    const a = after.find((x) => x.id === id), b = before.find((x) => x.id === id);
    assert.equal(a.version, b.version + 1);
    assert.equal(a.failure_reason, "Job timed out — claimed_at exceeded stale threshold");
    assert.equal(a.completed_at, null);
    assert.deepEqual(Object.keys(a.failure_details).sort(), ["original_claimed_at", "recovered_at"]);
  }
  const ev = await events(db);
  assert.deepEqual(ev.map((e) => e.job_id).sort(), [STALE_A, STALE_B]);
  for (const e of ev) {
    assert.equal(e.stage, "timeout-recovery");
    assert.equal(e.outcome, "failed");
    assert.equal(e.details.recovered_by, "sweep_stale_generation_jobs");
    assert.equal(e.details.previous_version, 3);
  }
  // A second run finds nothing left to recover.
  assert.equal((await cron(db)).rows[0].sweep_stale_generation_jobs, 0);
});

test("jobs outside the rule are untouched: claimed 14 min ago, pending, complete, already failed", async () => {
  const db = await migrated();
  const before = await jobs(db);
  await cron(db);
  const after = await jobs(db);
  for (const id of [FRESH, PENDING, DONE, RETRY]) {
    assert.deepEqual(after.find((x) => x.id === id), before.find((x) => x.id === id), id);
  }
});

test("recovery is identical to the old function on the same data", async () => {
  const strip = (s) => ({
    jobs: s.jobs.map(({ failure_details, ...j }) => ({ ...j, fd: failure_details && failure_details.original_claimed_at })),
    events: s.events.map(({ details, ...e }) => ({ ...e, d: details && [details.recovered_by, details.original_claimed_at, details.previous_version] })),
  });
  const oldDb = await freshDb();
  const newDb = await migrated();
  const o = await cron(oldDb);
  const n = await cron(newDb);
  assert.equal(o.ok, true, o.message);
  assert.equal(n.ok, true, n.message);
  assert.equal(n.rows[0].sweep_stale_generation_jobs, o.rows[0].sweep_stale_generation_jobs);
  // FRESH's claimed_at is relative to now() in each database; compare it as "still generating, unchanged".
  const drop = (s) => ({ ...s, jobs: s.jobs.map((j) => (j.id === FRESH ? { ...j, claimed_at: "now-14m" } : j)) });
  assert.deepEqual(drop(strip(await state(newDb))), drop(strip(await state(oldDb))));
});

test("a failure during recovery behaves as before: the run errors and rolls back, nothing half-done", async () => {
  // An event the audit table refuses (a constraint added for the test only) must abort the whole run.
  const block = "ALTER TABLE public.avatar_generation_events ADD CONSTRAINT test_block CHECK (stage <> 'timeout-recovery');";
  const results = [];
  for (const db of [await freshDb(), await migrated()]) {
    await db.exec(block);
    const before = await state(db);
    const r = await cron(db);
    assert.equal(r.ok, false);
    results.push(r.code);
    assert.deepEqual(await state(db), before, "no job recovered without its event");
  }
  assert.deepEqual(results, ["23514", "23514"]);
});

test("search_path: sweeper '' and DEFINER with its body unchanged; recover_stuck_job_atomic pinned to public", async () => {
  const db = await migrated();
  const f = Object.fromEntries((await db.query(`SELECT proname, prosecdef, proconfig, md5(prosrc) m, proacl::text acl,
      pg_get_function_identity_arguments(oid) args, pg_get_function_result(oid) res
    FROM pg_proc WHERE proname IN ('sweep_stale_generation_jobs', 'recover_stuck_job_atomic')`)).rows.map((r) => [r.proname, r]));
  assert.equal(f.sweep_stale_generation_jobs.prosecdef, true);
  assert.deepEqual(f.sweep_stale_generation_jobs.proconfig, ['search_path=""']);
  assert.equal(f.sweep_stale_generation_jobs.m, PROD_MD5.sweep_stale_generation_jobs, "sweeper logic unchanged");
  assert.equal(f.sweep_stale_generation_jobs.args, "");
  assert.equal(f.sweep_stale_generation_jobs.res, "integer");
  assert.equal(f.recover_stuck_job_atomic.prosecdef, false);
  assert.deepEqual(f.recover_stuck_job_atomic.proconfig, ["search_path=public"]);
  assert.equal(f.recover_stuck_job_atomic.m, PROD_MD5.recover_stuck_job_atomic);
  assert.equal(f.recover_stuck_job_atomic.acl, "{=X/dbowner,dbowner=X/dbowner,anon=X/dbowner,authenticated=X/dbowner,service_role=X/dbowner}",
    "recover_stuck_job_atomic grants are out of scope and unchanged");
  // Every relation and function the sweeper names is schema-qualified.
  const body = fnStatement(SWEEPER, "sweep_stale_generation_jobs").replace(/--[^\n]*/g, "");
  for (const name of ["avatar_generation_jobs", "avatar_generation_events", "recover_stuck_job_atomic"]) {
    const all = [...body.matchAll(new RegExp(String.raw`([.\w]*)\b` + name + String.raw`\b`, "g"))].filter((m) => !/^'/.test(body.slice(m.index - 1, m.index)));
    assert.ok(all.length > 0, name);
    for (const m of all) assert.equal(m[1], "public.", `${name} unqualified`);
  }
});

test("the avatar-generation Edge Function path is unaffected: service_role still calls recover_stuck_job_atomic", async () => {
  const db = await migrated();
  const j = (await jobs(db)).find((x) => x.id === STALE_A);
  const r = await api(db, SERVICE, `SELECT public.recover_stuck_job_atomic('${STALE_A}', ${j.version}, now(), '${j.claimed_at.toISOString()}', now()) AS n`);
  assert.equal(r.ok, true, r.message);
  assert.equal(r.rows[0].n, 1);
});

test("the migration changes only these two functions' settings and the sweeper's grants", async () => {
  const sig = async (db) => (await db.query(`SELECT p.proname, md5(p.prosrc) m, p.proacl::text acl, p.proconfig::text c, p.prosecdef
      FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname NOT IN ('sweep_stale_generation_jobs', 'recover_stuck_job_atomic') ORDER BY 1`)).rows;
  const rel = async (db) => (await db.query(`SELECT c.relname, c.relacl::text acl, c.relrowsecurity,
      (SELECT string_agg(polname || ':' || polcmd::text, ',' ORDER BY polname) FROM pg_policy WHERE polrelid = c.oid) pol,
      (SELECT string_agg(tgname, ',' ORDER BY tgname) FROM pg_trigger WHERE tgrelid = c.oid AND NOT tgisinternal) trg,
      (SELECT string_agg(conname, ',' ORDER BY conname) FROM pg_constraint WHERE conrelid = c.oid) con
    FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace ORDER BY 1`)).rows;
  const a = await freshDb();
  const b = await migrated();
  assert.deepEqual(await sig(b), await sig(a));
  assert.deepEqual(await rel(b), await rel(a));
  // FRESH's claimed_at is relative to now() in each database.
  const mask = (s) => ({ ...s, jobs: s.jobs.map((j) => (j.id === FRESH ? { ...j, claimed_at: "now-14m" } : j)) });
  assert.deepEqual(mask(await state(b)), mask(await state(a)));
  const stmts = MIG(FILE).replace(/--[^\n]*/g, "");
  assert.doesNotMatch(stmts, /\b(CREATE|DROP|TRUNCATE|DELETE|INSERT|UPDATE|GRANT|cron)\b/i);
  assert.equal((stmts.match(/\bALTER FUNCTION\b/g) || []).length, 2);
  assert.equal((stmts.match(/\bREVOKE\b/g) || []).length, 1);
});

test("re-running the migration is harmless", async () => {
  const db = await migrated();
  const once = (await db.query(`SELECT proname, proacl::text, proconfig::text FROM pg_proc
    WHERE proname IN ('sweep_stale_generation_jobs', 'recover_stuck_job_atomic') ORDER BY 1`)).rows;
  await db.exec(MIG(FILE));
  const twice = (await db.query(`SELECT proname, proacl::text, proconfig::text FROM pg_proc
    WHERE proname IN ('sweep_stale_generation_jobs', 'recover_stuck_job_atomic') ORDER BY 1`)).rows;
  assert.deepEqual(twice, once);
  const r = await cron(db);
  assert.equal(r.ok, true, r.message);
  assert.equal(r.rows[0].sweep_stale_generation_jobs, 2);
});

test("nothing in the repository calls the sweeper except the cron job", () => {
  const fn = read("supabase", "functions", "avatar-generation", "database.ts");
  assert.doesNotMatch(fn, /sweep_stale_generation_jobs/);
  assert.match(fn, /rpc\("recover_stuck_job_atomic"/);
});
