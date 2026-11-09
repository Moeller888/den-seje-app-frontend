// REAL concurrency proof for migration 20261108171500_course_progress_rewards (Lærligverse course rewards) on
// a real PostgreSQL server with several simultaneous sessions — what PGlite (one connection) cannot show.
//
// Same switch and harness as achievement-reward-concurrency.test.mjs: runs only when LEVEL_ENGINE_PG_URL points
// at a disposable PostgreSQL server where the user may create databases and roles, and the `pg` client can be
// resolved. Otherwise every test is SKIPPED with the reason — unless LEVEL_ENGINE_PG_REQUIRED=1 (CI's unit job,
// PostgreSQL 17 service), where a missing server FAILS. It creates its own database and drops it afterwards.
// The fixture holds only the columns the award function reads; the migration file runs UNMODIFIED. The award's
// double-pay guard requires the reward functions' bodies from the H5/K1-track PROPOSAL
// (docs/laerligverse/forslag-k1-belonning-kursussvar.sql, not a migration): the fixture creates exactly those
// bodies, review_answer included (byte for byte, so their md5 is the reviewed one), with check_function_bodies off —
// they are never called.
//
// How simultaneity is forced: a blocker session holds the pupil's student_progress row lock; every call is
// started; the test waits until pg_stat_activity shows all of them waiting on a lock; only then is the blocker
// released.
//
// What this proves:
//   1. One pupil with a complete sequence, 8 simultaneous calls: exactly one call reports the 9 ledger rows,
//      XP/coins are credited exactly once (+61 XP, +26 coins), the ledger holds each milestone once, no error.
//   2. 12 pupils × 4 simultaneous calls each: every pupil paid exactly once, no error, no deadlock.
//   3. The ≥1-passed-check rule under contention: completed with all checks wrong → steps once, the completion
//      registered once, never a sequence bonus.
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

const MIGRATION = "supabase/migrations/20261108171500_course_progress_rewards.sql";
// The proposal's statements after its md5 guard block: four CREATE OR REPLACE and the DROP + CREATE of
// review_answer (4 arguments), for which the fixture provides a placeholder to drop.
const proposalBodies = () => {
  const sql = read("docs/laerligverse/forslag-k1-belonning-kursussvar.sql");
  const marker = "$guard$;\n";
  const at = sql.indexOf(marker);
  assert.ok(at > 0, "the proposal has its guard block");
  const placeholder = "CREATE FUNCTION public.review_answer(uuid, integer, text, uuid) RETURNS void LANGUAGE sql AS 'SELECT NULL';";
  return `SET check_function_bodies = off;\n${placeholder}\n${sql.slice(at + marker.length)}\nRESET check_function_bodies;`;
};
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
  CREATE TABLE auth.users (id uuid PRIMARY KEY);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  CREATE TABLE public.profiles (id uuid PRIMARY KEY REFERENCES auth.users(id), role text NOT NULL);
  CREATE TABLE public.student_progress (student_id uuid PRIMARY KEY, xp integer NOT NULL DEFAULT 0, coins integer NOT NULL DEFAULT 0);
  ALTER TABLE public.student_progress ENABLE ROW LEVEL SECURITY;
  CREATE TABLE public.questions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), learning_objective text, metadata jsonb,
    answer_type text DEFAULT 'short');
  CREATE TABLE public.question_instances (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_id uuid NOT NULL,
    question_id uuid NOT NULL REFERENCES public.questions(id), answered boolean NOT NULL DEFAULT false,
    was_correct boolean, answered_at timestamptz);
  ALTER TABLE public.question_instances ENABLE ROW LEVEL SECURITY;
  GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
  INSERT INTO public.questions (learning_objective, metadata) VALUES
    ('lv_conc', '{"learning_step":"guided_practice"}'), ('lv_conc', '{"learning_step":"independent_application"}'),
    ('lv_conc', '{"learning_step":"transfer"}'), ('lv_conc', '{"learning_step":"revisit"}');
`;

let dbName;
let dbUrl;
const opened = [];
async function setup() {
  const admin = new pg.Client({ connectionString: URL });
  await admin.connect();
  await admin.query(ROLES);
  dbName = `course_rewards_conc_${Date.now()}`;
  await admin.query(`CREATE DATABASE ${dbName} ENCODING 'UTF8' TEMPLATE template0`);
  await admin.end();
  const u = new globalThis.URL(URL);
  u.pathname = `/${dbName}`;
  dbUrl = u.toString();
  const c = await connect();
  await c.query(SCHEMA);
  await c.query(proposalBodies());
  await c.query(read(MIGRATION));
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
// The backend session course-progress uses: the service role, no pupil claims.
async function serviceSession() {
  const c = await connect();
  await c.query("SET ROLE service_role");
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
const CALL = "SELECT public.award_course_milestones($1::uuid, 'lv_conc') AS r";

test("real PostgreSQL: award_course_milestones pays each milestone exactly once under simultaneous calls",
  { skip: SKIP, timeout: 180000 }, async (t) => {
  t.after(teardown);
  const su = await setup();
  let n = 7000;
  // checksPassed = false: every assessed step answered wrong (guided practice right) — completed, not passed.
  const pupil = async (checksPassed = true) => {
    const id = uid(n++);
    await su.query("INSERT INTO auth.users VALUES ($1)", [id]);
    await su.query("INSERT INTO public.profiles VALUES ($1, 'student')", [id]);
    await su.query("INSERT INTO public.student_progress VALUES ($1, 100, 50)", [id]);
    await su.query(`INSERT INTO public.question_instances (student_id, question_id, answered, was_correct, answered_at)
      SELECT $1, q.id, true, ($2 OR q.metadata->>'learning_step' = 'guided_practice'), now() FROM public.questions q`, [id, checksPassed]);
    return id;
  };
  const state = async (id) => (await su.query(`SELECT sp.xp, sp.coins,
      (SELECT count(*)::int FROM public.course_progress_rewards r WHERE r.student_id = sp.student_id) AS rows
    FROM public.student_progress sp WHERE sp.student_id = $1`, [id])).rows[0];
  const awardedCount = (results) => results.reduce((s, r) => s + r.rows[0].r.awarded.length, 0);

  await t.test("1. 8 simultaneous calls for one pupil → one payout (9 ledger rows), +61 XP, +26 coins", async () => {
    const id = await pupil();
    const blocker = await connect();
    await blocker.query("BEGIN");
    await blocker.query("SELECT 1 FROM public.student_progress WHERE student_id = $1 FOR UPDATE", [id]);
    const sessions = await Promise.all(Array.from({ length: 8 }, () => serviceSession()));
    const calls = sessions.map((c) => c.query(CALL, [id]));
    await waitForLockWaiters(su, 8);
    await blocker.query("COMMIT");
    const results = await Promise.all(calls);
    assert.equal(awardedCount(results), 9, "9 ledger rows reported in total (8 paying + the 0-valued completion registration)");
    assert.equal(results.filter((r) => r.rows[0].r.outcome === "awarded").length, 1, "by exactly one call");
    assert.deepEqual(await state(id), { xp: 161, coins: 76, rows: 9 });
    await done(blocker, ...sessions);
  });

  await t.test("2. 12 pupils × 4 simultaneous calls → every pupil paid exactly once, no error", async () => {
    const ids = [];
    for (let i = 0; i < 12; i++) ids.push(await pupil());
    const blocker = await connect();
    await blocker.query("BEGIN");
    await blocker.query("SELECT 1 FROM public.student_progress WHERE student_id = ANY($1::uuid[]) FOR UPDATE", [ids]);
    const sessions = await Promise.all(Array.from({ length: 48 }, () => serviceSession()));
    const calls = sessions.map((c, i) => c.query(CALL, [ids[i % 12]]));
    await waitForLockWaiters(su, 48);
    await blocker.query("COMMIT");
    const results = await Promise.all(calls);
    assert.equal(awardedCount(results), 12 * 9);
    for (const id of ids) assert.deepEqual(await state(id), { xp: 161, coins: 76, rows: 9 }, id);
    await done(blocker, ...sessions);
  });

  await t.test("3. completed with all checks wrong, 8 simultaneous calls → steps paid once (+12 XP, +4 coins), completion registered once, no bonus", async () => {
    const id = await pupil(false);
    const blocker = await connect();
    await blocker.query("BEGIN");
    await blocker.query("SELECT 1 FROM public.student_progress WHERE student_id = $1 FOR UPDATE", [id]);
    const sessions = await Promise.all(Array.from({ length: 8 }, () => serviceSession()));
    const calls = sessions.map((c) => c.query(CALL, [id]));
    await waitForLockWaiters(su, 8);
    await blocker.query("COMMIT");
    const results = await Promise.all(calls);
    assert.equal(awardedCount(results), 5, "4 step rows + the completion registration");
    assert.deepEqual(await state(id), { xp: 112, coins: 54, rows: 5 });
    const kinds = (await su.query("SELECT kind FROM public.course_progress_rewards WHERE student_id = $1 ORDER BY kind", [id])).rows.map((r) => r.kind);
    assert.equal(kinds.includes("sequence_bonus"), false);
    assert.equal(kinds.filter((k) => k === "sequence_completed").length, 1);
    await done(blocker, ...sessions);
  });
});
