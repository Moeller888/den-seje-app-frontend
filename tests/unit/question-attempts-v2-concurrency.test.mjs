// REAL concurrency proof for migration 20261030211428_question_attempts_v2 (D-266, H5 — PR 1 of 6) on
// a real PostgreSQL server with several simultaneous sessions — what PGlite (one connection) cannot
// show. The chain is production's (helpers/answer-chain-schema.mjs pins every function body's md5).
//
// Runs only when LEVEL_ENGINE_PG_URL points at a disposable PostgreSQL server where the user may create
// databases and roles (superuser), and the `pg` client can be resolved — from the repo (devDependency),
// or from LEVEL_ENGINE_PG_MODULE_DIR. Otherwise every test is SKIPPED with that reason (never passed
// silently) — unless LEVEL_ENGINE_PG_REQUIRED=1, as in CI (the unit job's PostgreSQL 17 service), where
// a missing server or client FAILS. It creates its own database and drops it afterwards.
//
// How simultaneity is forced: a blocker session holds the instance row (SELECT … FOR UPDATE in an open
// transaction); every call under test is started, and the test waits until pg_stat_activity shows all
// of them waiting on a lock. Only then is the blocker released, so they really contend.
//
// What this proves:
//   0. ACLs on the real server, including PG17's MAINTAIN: the log has no privilege for anon or
//      authenticated, SELECT only for service_role; the _v2 functions EXECUTE for service_role only.
//   1. Eight simultaneous calls with the SAME submission: one attempt, one payout (XP, coins, counters,
//      streak, quests), seven replays of the identical result.
//   2. Eight simultaneous calls with DIFFERENT submissions for the same round: one attempt, one payout,
//      seven round_closed.
//   3. The row lock is real: a second call WAITS for the first; after COMMIT it replays and writes
//      nothing; after ROLLBACK it registers the answer itself.
//   4. A late answer racing with a reopen: it waits for the reopen and is then refused (stale_round);
//      an answer racing ahead of a reopen leaves the reopen with nothing to reopen (deterministic).
//   5. The defensive branch: one submission_id racing on two open instances (only reachable when the
//      one-open-question index is absent, so the test drops it in its own database): one attempt, the
//      other call submission_conflict with nothing kept.
//   6. The live function and _v2 racing on the same round: one payout in total.
//   7. Sixteen pupils in parallel: every payout exactly once, no deadlock.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { answerChainSql, readMigration, ATTEMPTS_MIGRATION_FILE, LIVE_PROSRC_MD5 } from "./helpers/answer-chain-schema.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
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

const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const QM = uid(9101);
const QT = uid(9102);
const SEED = `
  INSERT INTO public.questions (id, type, content, difficulty, is_active, question_type, learning_objective,
    answer_format, answer_type, metadata, difficulty_level) VALUES
  ('${QM}', 'mc', '{"type":"mc","question":"Hovedstad i Frankrig?","options":["Paris","Rom"],"correct":"Paris"}',
    1, true, 'auto', 'geografi', 'mc', 'short', '{}', 1000),
  ('${QT}', 'text', '{"type":"text","question":"Dog på dansk?","correct":"hund"}',
    1, true, 'auto', 'engelsk-ord', 'text', 'short', '{}', 1000);
  INSERT INTO public.daily_quests (quest_key, label, type, target, reward_coins) VALUES
    ('d_answers', 'Svar', 'answer_count', 5, 10), ('d_correct', 'Rigtige', 'correct_count', 5, 10);
  INSERT INTO public.weekly_quests (quest_key, label, type, target, reward_coins) VALUES
    ('w_answers', 'Svar', 'answer_count', 50, 50);
`;

let dbName;
let dbUrl;
const opened = [];
async function setup() {
  const admin = new pg.Client({ connectionString: URL });
  await admin.connect();
  dbName = `attempts_conc_${Date.now()}`;
  await admin.query(`CREATE DATABASE ${dbName} ENCODING 'UTF8' TEMPLATE template0`);
  await admin.end();
  const u = new globalThis.URL(URL);
  u.pathname = `/${dbName}`;
  dbUrl = u.toString();
  const c = await connect(false);
  for (const sql of answerChainSql({ realServer: true })) await c.query(sql);
  await c.query(SEED);
  await c.query(readMigration(ATTEMPTS_MIGRATION_FILE));
}
async function teardown() {
  await Promise.all(opened.splice(0).map((c) => c.end().catch(() => {})));
  if (!dbName) return;
  const admin = new pg.Client({ connectionString: URL });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
}
// Close sessions a subtest no longer needs, so the suite stays far below max_connections.
async function done(...clients) {
  for (const c of clients) {
    const i = opened.indexOf(c);
    if (i >= 0) opened.splice(i, 1);
    await c.end().catch(() => {});
  }
}
async function connect(asService = true) {
  const c = new pg.Client({ connectionString: dbUrl });
  opened.push(c);
  await c.connect();
  if (asService) await c.query("SET ROLE service_role");
  return c;
}

const MC = "SELECT public.process_question_attempt_v2($1, $2, $3, $4, $5, null, null) AS r";
const TEXT = "SELECT public.process_text_answer_v2($1, $2, $3, $4, $5, $6, null, null) AS r";

test("real PostgreSQL 17: question_attempts _v2 is exactly-once under simultaneous sessions", { skip: SKIP, timeout: 180000 }, async (t) => {
  t.after(teardown);
  await setup();
  const su = await connect(false);
  let n = 500;
  const pupil = async ({ streak = 1 } = {}) => {
    const id = uid(n++);
    await su.query("INSERT INTO auth.users VALUES ($1)", [id]);
    await su.query("INSERT INTO public.profiles (id, role, selected_grade) VALUES ($1, 'student', 5)", [id]);
    await su.query(`INSERT INTO public.student_progress (student_id, xp, coins, correct_answers, total_correct_answers,
      current_streak, longest_streak, last_activity_date) VALUES ($1, 100, 50, 7, 7, $2, $2, current_date - 1)`, [id, streak]);
    return id;
  };
  const serve = async (p, q, key) => (await su.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer,
    next_review_at) VALUES ($1, $2, $3, now()) RETURNING id`, [p, q, key])).rows[0].id;
  const state = async (p) => ({
    progress: (await su.query(`SELECT xp, coins, correct_answers AS c, total_correct_answers AS t, current_streak AS s
      FROM public.student_progress WHERE student_id = $1`, [p])).rows[0],
    attempts: (await su.query("SELECT count(*)::int AS n FROM public.question_attempts WHERE student_id = $1", [p])).rows[0].n,
    daily: (await su.query(`SELECT d.quest_key, p.progress FROM public.student_quest_progress p
      JOIN public.daily_quests d ON d.id = p.quest_id WHERE p.student_id = $1 ORDER BY 1`, [p])).rows,
    weekly: (await su.query("SELECT progress FROM public.student_weekly_quest_progress WHERE student_id = $1", [p])).rows,
  });
  // Hold the row, start the calls, wait until all of them wait on a lock, then release.
  const contend = async (qi, calls) => {
    const blocker = await connect(false);
    await blocker.query("BEGIN");
    await blocker.query("SELECT 1 FROM public.question_instances WHERE id = $1 FOR UPDATE", [qi]);
    const sessions = await Promise.all(calls.map(() => connect()));
    const running = calls.map((call, i) => call(sessions[i]));
    await waitForLockWaiters(calls.length);
    await blocker.query("COMMIT");
    try { return await Promise.all(running); } finally { await done(blocker, ...sessions); }
  };
  const waitForLockWaiters = async (count) => {
    for (let i = 0; i < 400; i++) {
      const w = (await su.query(`SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'`)).rows[0].n;
      if (w >= count) return;
      await new Promise((r) => setTimeout(r, 25));
    }
    assert.fail(`expected ${count} sessions waiting on a lock`);
  };

  await t.test("the chain is production's on this server too (md5 of every function body)", async () => {
    for (const [sig, md5] of Object.entries(LIVE_PROSRC_MD5)) {
      assert.equal((await su.query("SELECT md5(prosrc) AS h FROM pg_proc WHERE oid = to_regprocedure($1)", [sig])).rows[0]?.h, md5, sig);
    }
  });

  await t.test("0. ACLs on PostgreSQL 17, including MAINTAIN", async () => {
    const privs = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER", "MAINTAIN"];
    for (const role of ["anon", "authenticated", "service_role"]) {
      for (const priv of privs) {
        const has = (await su.query("SELECT has_table_privilege($1, 'public.question_attempts', $2) AS h", [role, priv])).rows[0].h;
        assert.equal(has, role === "service_role" && priv === "SELECT", `${role} ${priv}`);
      }
      for (const fn of ["public.process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text)",
        "public.process_text_answer_v2(uuid,uuid,text,boolean,integer,uuid,text,text)"]) {
        const has = (await su.query("SELECT has_function_privilege($1, $2, 'EXECUTE') AS h", [role, fn])).rows[0].h;
        assert.equal(has, role === "service_role", `${role} EXECUTE ${fn}`);
      }
    }
  });

  await t.test("1. eight simultaneous calls with the same submission: one attempt, one payout, seven replays", async () => {
    const p = await pupil();
    const qi = await serve(p, QM, "Paris");
    const sub = randomUUID();
    const results = await contend(qi, Array.from({ length: 8 }, () => async (c) => (await c.query(MC, [p, qi, "Paris", 1, sub])).rows[0].r));
    const outcomes = results.map((r) => r.outcome).sort();
    assert.deepEqual(outcomes, ["recorded", ...Array(7).fill("replay")]);
    for (const r of results) assert.deepEqual({ ...r, outcome: undefined }, { ...results[0], outcome: undefined });
    assert.deepEqual(await state(p), { progress: { xp: 110, coins: 55, c: 8, t: 8, s: 2 }, attempts: 1,
      daily: [{ quest_key: "d_answers", progress: 1 }, { quest_key: "d_correct", progress: 1 }], weekly: [{ progress: 1 }] });
  });

  await t.test("2. eight simultaneous calls with different submissions for one round: one attempt, one payout", async () => {
    const p = await pupil();
    const qi = await serve(p, QM, "Paris");
    const results = await contend(qi, Array.from({ length: 8 }, (_, i) => async (c) =>
      (await c.query(MC, [p, qi, i % 2 ? "Rom" : "Paris", 1, randomUUID()])).rows[0].r));
    assert.deepEqual(results.map((r) => r.outcome).sort(), ["recorded", ...Array(7).fill("round_closed")]);
    const winner = results.find((r) => r.outcome === "recorded");
    const s = await state(p);
    assert.equal(s.attempts, 1);
    assert.deepEqual(s.progress, winner.status === "correct"
      ? { xp: 110, coins: 55, c: 8, t: 8, s: 2 } : { xp: 100, coins: 50, c: 7, t: 7, s: 2 });
    assert.equal(s.daily.find((d) => d.quest_key === "d_answers").progress, 1);
  });

  await t.test("2. the same for short text", async () => {
    const p = await pupil();
    const qi = await serve(p, QT, "hund");
    const results = await contend(qi, Array.from({ length: 8 }, () => async (c) =>
      (await c.query(TEXT, [qi, p, "hund", true, 1, randomUUID()])).rows[0].r));
    assert.deepEqual(results.map((r) => r.outcome).sort(), ["recorded", ...Array(7).fill("round_closed")]);
    assert.deepEqual((await state(p)).progress, { xp: 110, coins: 55, c: 8, t: 8, s: 2 });
  });

  await t.test("3. the lock is real: the second call waits; after COMMIT it replays, after ROLLBACK it registers", async () => {
    for (const end of ["COMMIT", "ROLLBACK"]) {
      const p = await pupil();
      const qi = await serve(p, QM, "Paris");
      const sub = randomUUID();
      const a = await connect();
      const b = await connect();
      await a.query("BEGIN");
      assert.equal((await a.query(MC, [p, qi, "Paris", 1, sub])).rows[0].r.outcome, "recorded");
      const second = b.query(MC, [p, qi, "Paris", 1, sub]);
      await waitForLockWaiters(1);
      await a.query(end);
      const r = (await second).rows[0].r;
      assert.equal(r.outcome, end === "COMMIT" ? "replay" : "recorded", end);
      assert.deepEqual((await state(p)).progress, { xp: 110, coins: 55, c: 8, t: 8, s: 2 }, end);
      assert.equal((await state(p)).attempts, 1, end);
      await done(a, b);
    }
  });

  await t.test("4. a late round-1 answer racing with a reopen waits for it and is refused; the original submission still replays", async () => {
    const p = await pupil();
    const qi = await serve(p, QM, "Paris");
    const sub = randomUUID();
    const s0 = await connect();
    const original = (await s0.query(MC, [p, qi, "Rom", 1, sub])).rows[0].r;
    await done(s0);
    const a = await connect();
    const b = await connect();
    await a.query("BEGIN");
    assert.equal((await a.query(`SELECT public.request_repeat_question_servable_for_student($1, 5::smallint, ARRAY['geografi']) AS id`, [p])).rows[0].id, qi);
    const late = b.query(MC, [p, qi, "Paris", 1, randomUUID()]);
    await waitForLockWaiters(1);
    await a.query("COMMIT");
    assert.deepEqual((await late).rows[0].r, { outcome: "stale_round" });
    const retry = (await b.query(MC, [p, qi, "Rom", 1, sub])).rows[0].r;
    assert.deepEqual({ ...retry, outcome: "replay" }, { ...original, outcome: "replay" });
    assert.deepEqual((await su.query("SELECT answered, repeat_count FROM public.question_instances WHERE id = $1", [qi])).rows[0],
      { answered: false, repeat_count: 1 }, "round 2 is open and untouched");
    assert.equal((await state(p)).attempts, 1);
    await done(a, b);
  });

  await t.test("4. an answer racing ahead of a reopen: the reopen finds the question still open and reopens nothing", async () => {
    const p = await pupil();
    const qi = await serve(p, QM, "Paris");
    const a = await connect();
    const b = await connect();
    await a.query("BEGIN");
    assert.equal((await a.query(MC, [p, qi, "Paris", 1, randomUUID()])).rows[0].r.outcome, "recorded");
    const reopen = (await b.query(`SELECT public.request_repeat_question_servable_for_student($1, 5::smallint, ARRAY['geografi']) AS id`, [p])).rows[0].id;
    assert.equal(reopen, null, "the uncommitted answer is invisible: the pupil still has an open question");
    await a.query("COMMIT");
    assert.equal((await b.query(`SELECT public.request_repeat_question_servable_for_student($1, 5::smallint, ARRAY['geografi']) AS id`, [p])).rows[0].id, qi);
    await done(a, b);
  });

  await t.test("5. one submission_id racing on two open instances: one attempt, the other submission_conflict, nothing kept", async () => {
    await su.query("DROP INDEX public.idx_one_open_question");          // only to reach the defensive branch
    try {
      const p = await pupil();
      const q1 = await serve(p, QM, "Paris");
      const q2 = await serve(p, QT, "hund");
      const sub = randomUUID();
      const a = await connect();
      const b = await connect();
      await a.query("BEGIN");
      assert.equal((await a.query(MC, [p, q1, "Paris", 1, sub])).rows[0].r.outcome, "recorded");
      const other = b.query(TEXT, [q2, p, "hund", true, 1, sub]);
      await waitForLockWaiters(1);
      await a.query("COMMIT");
      assert.deepEqual((await other).rows[0].r, { outcome: "submission_conflict" });
      assert.deepEqual((await su.query("SELECT answered FROM public.question_instances WHERE id = $1", [q2])).rows[0], { answered: false });
      assert.deepEqual((await state(p)).progress, { xp: 110, coins: 55, c: 8, t: 8, s: 2 }, "only the first payout");
      assert.equal((await state(p)).attempts, 1);
      await done(a, b);
    } finally {
      await su.query("CREATE UNIQUE INDEX idx_one_open_question ON public.question_instances USING btree (student_id) WHERE (answered = false)");
    }
  });

  await t.test("6. the live function and _v2 racing on the same round: one payout in total", async () => {
    const p = await pupil();
    const qi = await serve(p, QM, "Paris");
    const results = await contend(qi, Array.from({ length: 8 }, (_, i) => async (c) => (i % 2
      ? (await c.query("SELECT public.process_question_attempt($1, $2, 'Paris', 0) AS r", [p, qi])).rows[0].r
      : (await c.query(MC, [p, qi, "Paris", 1, randomUUID()])).rows[0].r)));
    assert.equal(results.length, 8);
    const s = await state(p);
    assert.deepEqual(s.progress, { xp: 110, coins: 55, c: 8, t: 8, s: 2 });
    assert.ok(s.attempts <= 1, "at most the one _v2 winner is logged (a live winner logs nothing)");
    assert.equal(s.daily.find((d) => d.quest_key === "d_answers").progress, 1);
  });

  await t.test("7. sixteen pupils in parallel: each paid exactly once, no deadlock", async () => {
    const pupils = await Promise.all(Array.from({ length: 16 }, () => pupil()));
    const instances = [];
    for (const p of pupils) instances.push(await serve(p, QM, "Paris"));
    const sessions = await Promise.all(pupils.map(() => connect()));
    const results = await Promise.all(pupils.map((p, i) => sessions[i].query(MC, [p, instances[i], "Paris", 1, randomUUID()])));
    await done(...sessions);
    assert.ok(results.every((r) => r.rows[0].r.outcome === "recorded"));
    for (const p of pupils) assert.deepEqual((await state(p)).progress, { xp: 110, coins: 55, c: 8, t: 8, s: 2 });
  });
});
