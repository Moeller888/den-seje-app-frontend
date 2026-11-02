// REAL concurrency proof for migration 20261101170000_achievement_reward_exactly_once (D-292) on a real
// PostgreSQL server with several simultaneous sessions — what PGlite (one connection) cannot show.
//
// Runs only when LEVEL_ENGINE_PG_URL points at a disposable PostgreSQL server where the user may create
// databases and roles, and the `pg` client can be resolved. Otherwise every test is SKIPPED with the
// reason — unless LEVEL_ENGINE_PG_REQUIRED=1 (CI's unit job, PostgreSQL 17 service), where a missing
// server FAILS. It creates its own database and drops it afterwards. Same harness rules as
// claim-daily-reward-concurrency.test.mjs.
//
// How simultaneity is forced: a blocker session holds a row lock; every call is started; the test waits
// until pg_stat_activity shows all of them waiting on a lock; only then is the blocker released.
//
// What this proves:
//   0. NEGATIVE CONTROL: production's body (installed from the documented rollback) pays a coins reward
//      SEVERAL times when calls overlap — the defect is real, and the harness can see it.
//   1. One earned coins achievement, 8 simultaneous calls: exactly one call reports the grant, coins paid
//      once, the row claimed once.
//   2. Two earned coins achievements, 8 simultaneous calls naming them in opposite orders: each paid
//      exactly once, no error, no deadlock.
//   3. 16 pupils × 4 simultaneous calls each: every pupil paid exactly once, no error.
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

const MIGRATION = "supabase/migrations/20261101170000_achievement_reward_exactly_once.sql";
function rollbackSql() {
  const m = /```sql\n([\s\S]*?)```/.exec(read("docs/operations/achievement-reward-race-rollback.md"));
  assert.ok(m && /ROLLBACK D-292/.test(m[1]));
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
  CREATE TABLE public.student_progress (student_id uuid PRIMARY KEY, coins int);
  ALTER TABLE public.student_progress ENABLE ROW LEVEL SECURITY;
  CREATE TABLE public.achievements (id text PRIMARY KEY, reward_type varchar, reward_value text, reward_amount int);
  INSERT INTO public.achievements VALUES ('a_coins', 'coins', NULL, 25), ('b_coins', 'coins', NULL, 10);
  CREATE TABLE public.user_achievements (
    student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    achievement_id text NOT NULL REFERENCES public.achievements(id),
    unlocked_at timestamptz NOT NULL DEFAULT now(),
    reward_claimed boolean NOT NULL DEFAULT false,
    reward_claimed_at timestamptz,
    PRIMARY KEY (student_id, achievement_id));
  ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
  CREATE POLICY ua_select_own ON public.user_achievements FOR SELECT TO authenticated USING (student_id = auth.uid());
  CREATE TABLE public.user_themes (user_id uuid NOT NULL, theme_id text NOT NULL, PRIMARY KEY (user_id, theme_id));
  CREATE TABLE public.user_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, item_id text, UNIQUE (user_id, item_id));
  CREATE TABLE public.user_titles (user_id uuid NOT NULL, title_id text NOT NULL, PRIMARY KEY (user_id, title_id));
  GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
`;

let dbName;
let dbUrl;
const opened = [];
async function setup() {
  const admin = new pg.Client({ connectionString: URL });
  await admin.connect();
  await admin.query(ROLES);
  dbName = `achievement_reward_conc_${Date.now()}`;
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
const CALL = "SELECT public.grant_achievement_rewards($1::text[]) AS r";

test("real PostgreSQL: grant_achievement_rewards pays each achievement exactly once under simultaneous calls",
  { skip: SKIP, timeout: 180000 }, async (t) => {
  t.after(teardown);
  const su = await setup();
  let n = 9000;
  const pupil = async (achievements = ["a_coins"]) => {
    const id = uid(n++);
    await su.query("INSERT INTO public.profiles VALUES ($1)", [id]);
    await su.query("INSERT INTO public.student_progress VALUES ($1, 100)", [id]);
    for (const a of achievements) {
      await su.query("INSERT INTO public.user_achievements (student_id, achievement_id) VALUES ($1, $2)", [id, a]);
    }
    return id;
  };
  const state = async (id) => (await su.query(`SELECT sp.coins,
      (SELECT count(*)::int FROM public.user_achievements ua WHERE ua.student_id = sp.student_id AND ua.reward_claimed) AS claimed
    FROM public.student_progress sp WHERE sp.student_id = $1`, [id])).rows[0];
  const granted = (results) => results.reduce((s, r) => s + r.rows[0].r.length, 0);

  await t.test("0. NEGATIVE CONTROL: production's body pays a coins reward more than once", async () => {
    await su.query(rollbackSql());
    const id = await pupil();
    const blocker = await connect();
    await blocker.query("BEGIN");
    await blocker.query("SELECT 1 FROM public.student_progress WHERE student_id = $1 FOR UPDATE", [id]);
    const sessions = await Promise.all(Array.from({ length: 8 }, () => pupilSession(id)));
    const calls = sessions.map((c) => c.query(CALL, [["a_coins"]]));
    await waitForLockWaiters(su, 8);
    await blocker.query("COMMIT");
    const results = await Promise.all(calls);
    const paid = granted(results);
    assert.ok(paid > 1, `expected the defect to pay several times, paid ${paid}`);
    assert.deepEqual(await state(id), { coins: 100 + paid * 25, claimed: 1 });
    await done(blocker, ...sessions);
  });

  await su.query(read(MIGRATION));

  await t.test("1. one earned coins achievement: 8 simultaneous calls → exactly one payout", async () => {
    const id = await pupil();
    const blocker = await connect();
    await blocker.query("BEGIN");
    await blocker.query("SELECT 1 FROM public.user_achievements WHERE student_id = $1 FOR UPDATE", [id]);
    const sessions = await Promise.all(Array.from({ length: 8 }, () => pupilSession(id)));
    const calls = sessions.map((c) => c.query(CALL, [["a_coins"]]));
    await waitForLockWaiters(su, 8);
    await blocker.query("COMMIT");
    const results = await Promise.all(calls);
    assert.equal(granted(results), 1);
    assert.deepEqual(await state(id), { coins: 125, claimed: 1 });
    await done(blocker, ...sessions);
  });

  await t.test("2. two coins achievements, opposite orders, 8 simultaneous calls → each once, no deadlock", async () => {
    const id = await pupil(["a_coins", "b_coins"]);
    const blocker = await connect();
    await blocker.query("BEGIN");
    await blocker.query("SELECT 1 FROM public.user_achievements WHERE student_id = $1 AND achievement_id = 'a_coins' FOR UPDATE", [id]);
    const sessions = await Promise.all(Array.from({ length: 8 }, () => pupilSession(id)));
    const calls = sessions.map((c, i) => c.query(CALL, [i % 2 ? ["b_coins", "a_coins"] : ["a_coins", "b_coins"]]));
    await waitForLockWaiters(su, 8);
    await blocker.query("COMMIT");
    const results = await Promise.all(calls);
    assert.equal(granted(results), 2);
    assert.deepEqual(await state(id), { coins: 135, claimed: 2 });
    await done(blocker, ...sessions);
  });

  await t.test("3. 16 pupils × 4 simultaneous calls: every pupil paid exactly once, no error", async () => {
    const ids = [];
    for (let i = 0; i < 16; i++) ids.push(await pupil(i % 2 ? ["a_coins", "b_coins"] : ["a_coins"]));
    const sessions = [];
    for (const id of ids) for (let k = 0; k < 4; k++) sessions.push({ id, c: await pupilSession(id) });
    const results = await Promise.all(sessions.map(({ c }) => c.query(CALL, [["a_coins", "b_coins"]])));
    for (const [i, id] of ids.entries()) {
      const mine = results.filter((_, j) => sessions[j].id === id);
      const expected = i % 2 ? 2 : 1;
      assert.equal(granted(mine), expected, id);
      assert.deepEqual(await state(id), { coins: i % 2 ? 135 : 125, claimed: expected }, id);
    }
    await done(...sessions.map((s) => s.c));
  });

  await done(su);
});
