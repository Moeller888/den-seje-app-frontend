// REAL concurrency proof for migration 20261031230000_claim_daily_reward_exactly_once (D-284) on a real
// PostgreSQL server with several simultaneous sessions — what PGlite (one connection) cannot show.
//
// Runs only when LEVEL_ENGINE_PG_URL points at a disposable PostgreSQL server where the user may create
// databases and roles, and the `pg` client can be resolved. Otherwise every test is SKIPPED with the
// reason — unless LEVEL_ENGINE_PG_REQUIRED=1 (CI's unit job, PostgreSQL 17 service), where a missing
// server FAILS. It creates its own database and drops it afterwards. Same harness rules as
// question-attempts-v2-concurrency.test.mjs.
//
// How simultaneity is forced: a blocker session holds a lock; every claim is started; the test waits
// until pg_stat_activity shows all of them waiting on a lock; only then is the blocker released.
//
// What this proves:
//   0. NEGATIVE CONTROL: production's body (installed from the documented rollback) pays SEVERAL times
//      when calls overlap — the defect is real, and the harness can see it.
//   1. Existing claim row, 8 simultaneous calls: exactly one 'claimed', seven 'already_claimed', coins
//      paid once, total_claims + 1.
//   2. A pupil's FIRST claim (no row yet), 8 simultaneous calls racing to create it: exactly one payout.
//   3. 16 pupils × 4 simultaneous calls each: every pupil paid exactly once, no error, no deadlock.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const URL = process.env.LEVEL_ENGINE_PG_URL ?? "";

function loadPg() {
  for (const base of [process.env.LEVEL_ENGINE_PG_MODULE_DIR, ROOT].filter(Boolean)) {
    try { return createRequire(join(base, "package.json"))("pg"); } catch { /* next */ }
  }
  return null;
}
const pg = URL ? loadPg() : null;
const SKIP = !URL ? "LEVEL_ENGINE_PG_URL is not set (needs a disposable real PostgreSQL server)"
  : !pg ? "the `pg` client cannot be resolved (set LEVEL_ENGINE_PG_MODULE_DIR)" : false;
const REQUIRED = process.env.LEVEL_ENGINE_PG_REQUIRED === "1";

test("a real PostgreSQL server is present where it is required (CI)", { skip: !REQUIRED }, () => {
  assert.equal(SKIP, false, `LEVEL_ENGINE_PG_REQUIRED=1, but: ${SKIP}`);
});

const MIGRATION = "supabase/migrations/20261031230000_claim_daily_reward_exactly_once.sql";
function rollbackSql() {
  const m = /```sql\n([\s\S]*?)```/.exec(read("docs/operations/daily-reward-race-rollback.md"));
  assert.ok(m && /ROLLBACK D-284/.test(m[1]));
  return m[1];
}
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// Roles are cluster-wide; create them only if absent (other suites may share the server).
const ROLES = `
  DO $$ BEGIN
    BEGIN CREATE ROLE anon NOLOGIN NOINHERIT; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END;
    BEGIN CREATE ROLE authenticated NOLOGIN NOINHERIT; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END;
    BEGIN CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END;
  END $$;`;
const SCHEMA = `
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  CREATE TABLE public.profiles (id uuid PRIMARY KEY);
  CREATE TABLE public.student_progress (student_id uuid PRIMARY KEY, coins int, current_streak int);
  ALTER TABLE public.student_progress ENABLE ROW LEVEL SECURITY;
  CREATE TABLE public.daily_login_rewards (
    student_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    last_claimed_date date,
    total_claims integer NOT NULL DEFAULT 0);
  ALTER TABLE public.daily_login_rewards ENABLE ROW LEVEL SECURITY;
  CREATE POLICY dlr_select_own ON public.daily_login_rewards FOR SELECT TO authenticated USING (auth.uid() = student_id);
  GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
`;

let dbName;
let dbUrl;
const opened = [];
async function setup() {
  const admin = new pg.Client({ connectionString: URL });
  await admin.connect();
  await admin.query(ROLES);
  dbName = `daily_reward_conc_${Date.now()}`;
  await admin.query(`CREATE DATABASE ${dbName} ENCODING 'UTF8' TEMPLATE template0`);
  await admin.end();
  const u = new globalThis.URL(URL);
  u.pathname = `/${dbName}`;
  dbUrl = u.toString();
  const c = await connect();
  await c.query(SCHEMA);
  return c;
}
async function teardown() {
  await Promise.all(opened.splice(0).map((c) => c.end().catch(() => {})));
  if (!dbName) return;
  const admin = new pg.Client({ connectionString: URL });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
}
async function connect() {
  const c = new pg.Client({ connectionString: dbUrl });
  opened.push(c);
  await c.connect();
  return c;
}
async function done(...clients) {
  for (const c of clients) {
    const i = opened.indexOf(c);
    if (i >= 0) opened.splice(i, 1);
    await c.end().catch(() => {});
  }
}
// One pupil session, as PostgREST runs it: SET ROLE authenticated + the verified claims.
async function pupilSession(id) {
  const c = await connect();
  await c.query("SELECT set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: id, role: "authenticated" })]);
  await c.query("SET ROLE authenticated");
  return c;
}
async function waitForLockWaiters(su, n) {
  const deadline = Date.now() + 20000;
  for (;;) {
    const { rows } = await su.query(`SELECT count(*)::int AS n FROM pg_stat_activity
      WHERE datname = $1 AND wait_event_type = 'Lock'`, [dbName]);
    if (rows[0].n >= n) return;
    if (Date.now() > deadline) throw new Error(`only ${rows[0].n} of ${n} sessions are waiting on a lock`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

test("real PostgreSQL: claim_daily_reward pays exactly once per pupil per day under simultaneous calls",
  { skip: SKIP, timeout: 180000 }, async (t) => {
  t.after(teardown);
  const su = await setup();
  let n = 7000;
  const pupil = async ({ streak = 3, row = true } = {}) => {
    const id = uid(n++);
    await su.query("INSERT INTO public.profiles VALUES ($1)", [id]);
    await su.query("INSERT INTO public.student_progress VALUES ($1, 100, $2)", [id, streak]);
    if (row) await su.query("INSERT INTO public.daily_login_rewards VALUES ($1, current_date - 1, 5)", [id]);
    return id;
  };
  const state = async (id) => (await su.query(`SELECT sp.coins, d.total_claims AS n, d.last_claimed_date = current_date AS today
    FROM public.student_progress sp LEFT JOIN public.daily_login_rewards d ON d.student_id = sp.student_id
    WHERE sp.student_id = $1`, [id])).rows[0];
  const statuses = (results) => results.map((r) => r.rows[0].r.status).sort();

  await t.test("0. NEGATIVE CONTROL: production's body pays more than once", async () => {
    await su.query(rollbackSql());
    const id = await pupil();
    const blocker = await connect();
    await blocker.query("BEGIN");
    await blocker.query("SELECT 1 FROM public.student_progress WHERE student_id = $1 FOR UPDATE", [id]);
    const sessions = await Promise.all(Array.from({ length: 8 }, () => pupilSession(id)));
    const calls = sessions.map((c) => c.query("SELECT public.claim_daily_reward() AS r"));
    await waitForLockWaiters(su, 8);
    await blocker.query("COMMIT");
    const results = await Promise.all(calls);
    const paid = results.filter((r) => r.rows[0].r.status === "claimed").length;
    assert.ok(paid > 1, `expected the defect to pay several times, paid ${paid}`);
    assert.equal((await state(id)).coins, 100 + paid * 70);
    await done(blocker, ...sessions);
  });

  await su.query(read(MIGRATION));

  await t.test("1. existing claim row: 8 simultaneous calls → exactly one payout", async () => {
    const id = await pupil();
    const blocker = await connect();
    await blocker.query("BEGIN");
    await blocker.query("SELECT 1 FROM public.daily_login_rewards WHERE student_id = $1 FOR UPDATE", [id]);
    const sessions = await Promise.all(Array.from({ length: 8 }, () => pupilSession(id)));
    const calls = sessions.map((c) => c.query("SELECT public.claim_daily_reward() AS r"));
    await waitForLockWaiters(su, 8);
    await blocker.query("COMMIT");
    const results = await Promise.all(calls);
    assert.deepEqual(statuses(results), ["already_claimed", "already_claimed", "already_claimed", "already_claimed",
      "already_claimed", "already_claimed", "already_claimed", "claimed"]);
    assert.deepEqual(await state(id), { coins: 170, n: 6, today: true });
    await done(blocker, ...sessions);
  });

  await t.test("2. first-ever claim (no row): 8 simultaneous calls racing to create it → exactly one payout", async () => {
    const id = await pupil({ row: false });
    const blocker = await connect();
    await blocker.query("BEGIN");
    await blocker.query("INSERT INTO public.daily_login_rewards VALUES ($1, NULL, 0)", [id]);
    const sessions = await Promise.all(Array.from({ length: 8 }, () => pupilSession(id)));
    const calls = sessions.map((c) => c.query("SELECT public.claim_daily_reward() AS r"));
    await waitForLockWaiters(su, 8);
    await blocker.query("ROLLBACK");                                       // now they race to create the row
    const results = await Promise.all(calls);
    assert.equal(results.filter((r) => r.rows[0].r.status === "claimed").length, 1);
    assert.deepEqual(await state(id), { coins: 170, n: 1, today: true });
    await done(blocker, ...sessions);
  });

  await t.test("3. 16 pupils × 4 simultaneous calls: every pupil paid exactly once, no error", async () => {
    const ids = [];
    for (let i = 0; i < 16; i++) ids.push(await pupil({ streak: i % 12, row: i % 2 === 0 }));
    const sessions = [];
    for (const id of ids) for (let k = 0; k < 4; k++) sessions.push({ id, c: await pupilSession(id) });
    const results = await Promise.all(sessions.map(({ c }) => c.query("SELECT public.claim_daily_reward() AS r")));
    for (const id of ids) {
      const mine = results.filter((_, i) => sessions[i].id === id).map((r) => r.rows[0].r);
      const claimed = mine.filter((r) => r.status === "claimed");
      assert.equal(claimed.length, 1, id);
      assert.equal((await state(id)).coins, 100 + claimed[0].coins, id);
    }
    await done(...sessions.map((s) => s.c));
  });

  await done(su);
});
