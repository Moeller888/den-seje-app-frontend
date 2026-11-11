// REAL concurrency proof for migration 20261111120000_review_answer_single_payout on a real PostgreSQL
// server with several simultaneous sessions — what PGlite (one connection) cannot show.
//
// Runs only when LEVEL_ENGINE_PG_URL points at a disposable PostgreSQL server where the user may create
// databases and roles, and the `pg` client can be resolved. Otherwise every test is SKIPPED with the
// reason — unless LEVEL_ENGINE_PG_REQUIRED=1 (CI's unit job, PostgreSQL 17 service), where a missing
// server FAILS. It creates its own database and drops it afterwards. Same harness rules as
// claim-daily-reward-concurrency.test.mjs.
//
// How simultaneity is forced: a blocker session holds the instance row lock; every review call is started
// (as service_role, like the Edge Function); the test waits until pg_stat_activity shows all of them
// waiting on a lock; only then is the blocker released.
//
// What this proves:
//   0. NEGATIVE CONTROL: production's body (tests/support/review-answer-prod-preimage.mjs) pays SEVERAL
//      times when reviews of one instance overlap — the defect is real, and the harness can see it.
//   1. One long answer, 8 simultaneous reviews: exactly one 'rewarded', seven 'already_rewarded', XP paid
//      once, one audit row.
//   2. 12 instances × 3 simultaneous reviews each, two pupils: every instance paid exactly once, the XP
//      total equals the audit total, no error, no deadlock.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PROD_FUNCTION } from "../support/review-answer-prod-preimage.mjs";

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

const MIGRATION = "supabase/migrations/20261111120000_review_answer_single_payout.sql";
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TEACHER = uid(1);
const Q_LONG = uid(2);

// Roles are cluster-wide; create them only if absent (other suites may share the server).
const ROLES = `
  DO $$ BEGIN
    BEGIN CREATE ROLE anon NOLOGIN NOINHERIT; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END;
    BEGIN CREATE ROLE authenticated NOLOGIN NOINHERIT; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END;
    BEGIN CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END;
  END $$;`;
const SCHEMA = `
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  CREATE TABLE public.questions (id uuid PRIMARY KEY, answer_type text, answer_format text);
  CREATE TABLE public.question_instances (
    id uuid PRIMARY KEY, student_id uuid, question_id uuid REFERENCES public.questions(id),
    answered boolean DEFAULT false, user_answer text, was_correct boolean,
    teacher_score integer, teacher_feedback text, reviewed_at timestamp without time zone, reviewed_by uuid);
  CREATE TABLE public.student_progress (student_id uuid PRIMARY KEY, xp integer, coins integer, level integer);
  ALTER TABLE public.question_instances ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.student_progress ENABLE ROW LEVEL SECURITY;
  GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
  INSERT INTO public.questions VALUES ('${Q_LONG}', 'long', 'text');
`;

let dbName;
let dbUrl;
const opened = [];
async function setup() {
  const admin = new pg.Client({ connectionString: URL });
  await admin.connect();
  await admin.query(ROLES);
  dbName = `review_answer_conc_${Date.now()}`;
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
// One Edge Function call: the service client, as the review-answer function runs it.
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

test("real PostgreSQL: review_answer pays exactly once per instance under simultaneous reviews",
  { skip: SKIP, timeout: 180000 }, async (t) => {
  t.after(teardown);
  const su = await setup();
  let n = 9000;
  const pupil = async () => {
    const id = uid(n++);
    await su.query("INSERT INTO public.student_progress VALUES ($1, 0, 0, 1)", [id]);
    return id;
  };
  const longAnswer = async (student) => {
    const id = uid(n++);
    await su.query(`INSERT INTO public.question_instances (id, student_id, question_id, answered, user_answer)
      VALUES ($1, $2, $3, false, 'Et langt svar')`, [id, student, Q_LONG]);
    return id;
  };
  const xpOf = async (id) => (await su.query("SELECT xp FROM public.student_progress WHERE student_id = $1", [id])).rows[0].xp;
  const call = (c, inst, score) => c.query("SELECT public.review_answer($1, $2, 'fb', $3) AS r", [inst, score, TEACHER]);

  await t.test("0. NEGATIVE CONTROL: production's body pays more than once", async () => {
    await su.query(PROD_FUNCTION);
    const p = await pupil();
    const inst = await longAnswer(p);
    const blocker = await connect();
    await blocker.query("BEGIN");
    await blocker.query("SELECT 1 FROM public.question_instances WHERE id = $1 FOR UPDATE", [inst]);
    const sessions = await Promise.all(Array.from({ length: 8 }, () => serviceSession()));
    const calls = sessions.map((c) => call(c, inst, 4));
    await waitForLockWaiters(su, 8);
    await blocker.query("COMMIT");
    await Promise.all(calls);
    const xp = await xpOf(p);
    assert.ok(xp > 50, `expected the defect to pay several times, xp ${xp}`);
    assert.equal(xp % 50, 0);
    await done(blocker, ...sessions);
  });

  await su.query(read(MIGRATION));

  await t.test("1. one long answer, 8 simultaneous reviews → exactly one payout", async () => {
    const p = await pupil();
    const inst = await longAnswer(p);
    const blocker = await connect();
    await blocker.query("BEGIN");
    await blocker.query("SELECT 1 FROM public.question_instances WHERE id = $1 FOR UPDATE", [inst]);
    const sessions = await Promise.all(Array.from({ length: 8 }, () => serviceSession()));
    const calls = sessions.map((c) => call(c, inst, 3));
    await waitForLockWaiters(su, 8);
    await blocker.query("COMMIT");
    const results = await Promise.all(calls);
    const statuses = results.map((r) => r.rows[0].r.status).sort();
    assert.deepEqual(statuses, ["already_rewarded", "already_rewarded", "already_rewarded", "already_rewarded",
      "already_rewarded", "already_rewarded", "already_rewarded", "rewarded"]);
    assert.equal(await xpOf(p), 25);
    const audit = (await su.query("SELECT count(*)::int AS n, sum(xp_awarded)::int AS xp FROM public.teacher_review_payouts WHERE question_instance_id = $1", [inst])).rows[0];
    assert.deepEqual(audit, { n: 1, xp: 25 });
    await done(blocker, ...sessions);
  });

  await t.test("2. 12 instances × 3 simultaneous reviews, two pupils: each paid once, no error", async () => {
    const pupils = [await pupil(), await pupil()];
    const insts = [];
    for (let k = 0; k < 12; k++) insts.push({ inst: await longAnswer(pupils[k % 2]), score: (k % 4) + 1 });
    const sessions = [];
    for (const it of insts) for (let k = 0; k < 3; k++) sessions.push({ it, c: await serviceSession() });
    const results = await Promise.all(sessions.map(({ it, c }) => call(c, it.inst, it.score)));
    const amount = { 1: 0, 2: 10, 3: 25, 4: 50 };
    for (const it of insts) {
      const mine = results.filter((_, k) => sessions[k].it === it).map((r) => r.rows[0].r);
      assert.equal(mine.filter((r) => r.status === "rewarded").length, 1, it.inst);
      assert.equal(mine.reduce((s, r) => s + r.xp_awarded, 0), amount[it.score], it.inst);
    }
    for (const p of pupils) {
      const expected = insts.filter((_, k) => pupils[k % 2] === p).reduce((s, it) => s + amount[it.score], 0);
      assert.equal(await xpOf(p), expected, p);
      const audit = (await su.query("SELECT coalesce(sum(xp_awarded), 0)::int AS xp FROM public.teacher_review_payouts WHERE student_id = $1", [p])).rows[0].xp;
      assert.equal(audit, expected, `audit total equals XP for ${p}`);
    }
    await done(...sessions.map((s) => s.c));
  });

  await done(su);
});
