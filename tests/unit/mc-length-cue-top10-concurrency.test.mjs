// REAL concurrency proof for D-280 — 20261031194600_mc_length_cue_answer_paths.sql, applied and
// committed first (as production must), then 20261031194700_mc_length_cue_top10.sql — on a real
// PostgreSQL server with several simultaneous sessions — what PGlite (one connection) cannot show.
// The chain is production's (helpers/answer-chain-schema.mjs pins every function body's md5); the ten
// questions are production's before-state (fixtures/mc-length-cue-top10-before.json). Ids synthetic.
//
// Same switch as the other real-server suites: runs only when LEVEL_ENGINE_PG_URL points at a
// disposable PostgreSQL server where the user may create databases and roles; otherwise SKIPPED with
// the reason, unless LEVEL_ENGINE_PG_REQUIRED=1 (CI's PostgreSQL 17 service), where a missing server
// FAILS. Each scenario creates its own database and drops it afterwards.
//
// What this proves (pupil activity around the migration's locks):
//   1. A pupil answer holding an open instance: the migration WAITS (seen in pg_stat_activity); the
//      answered instance keeps its result, and afterwards no open instance of the ten has an old key.
//   2. The migration holding its locks: a reopen through each of the three live repeat paths WAITS,
//      and the reopened instance gets the NEW key — its key is read after the wait, not before.
//   3. A new instance whose question was read BEFORE the migration (get-next-question reads, then
//      inserts): the insert waits and lands with the earlier key. Grading uses the new key (aliases),
//      the pupil is told the new key, and a re-run of the migration re-keys it.
//   4. An answer submitted while the migration holds its locks waits, and is graded as the pupil saw it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { answerChainSql, readMigration } from "./helpers/answer-chain-schema.mjs";

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

const PATHS = readMigration("20261031194600_mc_length_cue_answer_paths.sql");
const MIGRATION = readMigration("20261031194700_mc_length_cue_top10.sql");
const BEFORE = JSON.parse(readFileSync(join(ROOT, "tests", "unit", "fixtures", "mc-length-cue-top10-before.json"), "utf8"));
const PATCHES = JSON.parse(/\$patches\$([\s\S]*?)\$patches\$/.exec(MIGRATION)[1]);
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const QID = BEFORE.map((_, i) => uid(9100 + i));
const idx = (q) => BEFORE.findIndex((r) => r.content.question === q);
const patchOf = (i) => PATCHES.find((p) => p.question_before === BEFORE[i].content.question);
const lit = (v) => `'${JSON.stringify(v).replace(/'/g, "''")}'`;
const FLINT = idx("Hvad lavede folk redskaber af i Stenalderen?");
const GRUNDLOV = idx("Hvad er Grundloven?");
const PROPAGANDA = idx("Hvad var formålet med propaganda under Første Verdenskrig?");
const PREHISTORIC = BEFORE.map((r, i) => (r.learning_objective === "prehistoric_denmark" ? i : -1)).filter((i) => i >= 0);

// Roles are cluster-wide on a real server: answerChainSql({ realServer: true }) creates them only if missing.
const SEED = [
  `INSERT INTO public.questions (id, type, content, metadata, difficulty, is_active, question_type, learning_objective,
     answer_format, answer_type, target_grade, difficulty_band, difficulty_level) VALUES ` +
  BEFORE.map((r, i) => `('${QID[i]}', '${r.type}', ${lit(r.content)}::jsonb, ${lit(r.metadata)}::jsonb, ${r.difficulty}, true,
     '${r.question_type}', '${r.learning_objective}', '${r.answer_format}', '${r.answer_type}', ${r.target_grade},
     ${r.difficulty_band}, ${r.difficulty_level})`).join(",\n") + ";",
  `INSERT INTO public.daily_quests (quest_key, label, type, target, reward_coins) VALUES
     ('d_answers', 'Svar', 'answer_count', 5, 10), ('d_correct', 'Rigtige', 'correct_count', 5, 10);
   INSERT INTO public.weekly_quests (quest_key, label, type, target, reward_coins) VALUES
     ('w_answers', 'Svar', 'answer_count', 50, 50);`,
];

const opened = [];
const databases = [];
async function freshDatabase() {
  const admin = new pg.Client({ connectionString: URL });
  await admin.connect();
  const name = `lc10_conc_${Date.now()}_${databases.length}`;
  await admin.query(`CREATE DATABASE ${name} ENCODING 'UTF8' TEMPLATE template0`);
  await admin.end();
  databases.push(name);
  const u = new globalThis.URL(URL);
  u.pathname = `/${name}`;
  const dbUrl = u.toString();
  // A statement_timeout turns a wrong expectation into a failure instead of a hung job. The backend
  // pid is read at connect: the client queues queries, so a later pid query would wait behind a block.
  const connect = async (role = null) => {
    const c = new pg.Client({ connectionString: dbUrl });
    opened.push(c);
    await c.connect();
    await c.query("SET statement_timeout = '30s'");
    c.pid = (await c.query("SELECT pg_backend_pid() AS p")).rows[0].p;
    if (role) await c.query(`SET ROLE ${role}`);
    return c;
  };
  const su = await connect();
  for (const sql of answerChainSql({ realServer: true })) await su.query(sql);
  for (const sql of SEED) await su.query(sql);
  await su.query(PATHS);   // part 1, committed: every later session runs the D-280 answer paths
  let next = 100;
  const pupil = async () => {
    const id = uid(next++);
    await su.query(`INSERT INTO auth.users VALUES ('${id}');
      INSERT INTO public.profiles (id, role, selected_grade) VALUES ('${id}', 'student', 9);
      INSERT INTO public.student_progress (student_id, xp, coins, correct_answers, total_correct_answers,
        current_streak, longest_streak, last_activity_date) VALUES ('${id}', 100, 50, 7, 7, 1, 1, current_date - 1);`);
    return id;
  };
  const instance = async (p, q, key, { answered = false, wasCorrect = null, answer = null } = {}) =>
    (await su.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, answered,
        answered_at, was_correct, user_answer, next_review_at)
      VALUES ($1, $2, $3, $4, CASE WHEN $4 THEN now() - interval '1 day' END, $5, $6, now()) RETURNING id`,
      [p, q, key, answered, wasCorrect, answer])).rows[0].id;
  return { connect, su, pupil, instance };
}
async function teardown() {
  await Promise.all(opened.splice(0).map((c) => c.end().catch(() => {})));
  const admin = new pg.Client({ connectionString: URL });
  await admin.connect();
  for (const name of databases.splice(0)) await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.end();
}
async function waitsOnLock(observer, pid) {
  for (let i = 0; i < 200; i++) {
    const r = (await observer.query("SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1", [pid])).rows[0];
    if (r?.wait_event_type === "Lock") return true;
    await new Promise((res) => setTimeout(res, 50));
  }
  return false;
}
const settle = (promise) => promise.then((r) => r, (e) => e);
const staleOpen = async (su) => (await su.query(`SELECT count(*)::int AS n FROM public.question_instances qi
  JOIN public.questions q ON q.id = qi.question_id
  WHERE qi.answered = false AND qi.question_id = ANY($1::uuid[]) AND qi.correct_answer IS DISTINCT FROM q.content ->> 'correct'`,
  [QID])).rows[0].n;
const ATTEMPT = "SELECT public.process_question_attempt($1, $2, $3, 0) AS r";

test("real PostgreSQL: D-280 under simultaneous pupil activity", { skip: SKIP, timeout: 240000 }, async (t) => {
  t.after(teardown);

  await t.test("1. a pupil answer holding an open instance: the migration waits; no open instance keeps an old key", async () => {
    const { connect, su, pupil, instance } = await freshDatabase();
    const p1 = await pupil(), p2 = await pupil(), p3 = await pupil();
    const answering = await instance(p1, QID[GRUNDLOV], BEFORE[GRUNDLOV].content.correct);
    const open2 = await instance(p2, QID[PROPAGANDA], BEFORE[PROPAGANDA].content.correct);
    const open3 = await instance(p3, QID[FLINT], BEFORE[FLINT].metadata.danish_orthography_correct_aliases[0]);
    const pupilConn = await connect("service_role"), migr = await connect();
    await pupilConn.query("BEGIN");
    const r = (await pupilConn.query(ATTEMPT, [p1, answering, BEFORE[GRUNDLOV].content.correct])).rows[0].r;
    assert.equal(r.status, "correct");
    const running = settle(migr.query(MIGRATION));
    assert.equal(await waitsOnLock(su, migr.pid), true, "the migration must wait for the pupil's transaction");
    await pupilConn.query("COMMIT");
    const outcome = await running;
    assert.ok(!(outcome instanceof Error), String(outcome));
    const rows = Object.fromEntries((await su.query(
      "SELECT id, answered, was_correct, correct_answer FROM public.question_instances WHERE id = ANY($1::uuid[])",
      [[answering, open2, open3]])).rows.map((x) => [x.id, x]));
    assert.deepEqual(rows[answering], { id: answering, answered: true, was_correct: true, correct_answer: BEFORE[GRUNDLOV].content.correct },
      "the answered instance keeps its result and its key");
    assert.equal(rows[open2].correct_answer, patchOf(PROPAGANDA).correct_after);
    assert.equal(rows[open3].correct_answer, patchOf(FLINT).correct_after, "an old spelling is re-keyed too");
    assert.equal(await staleOpen(su), 0);
    const pr = (await su.query("SELECT xp, coins FROM public.student_progress WHERE student_id = $1", [p1])).rows[0];
    assert.deepEqual(pr, { xp: 110, coins: 55 }, "the answer was paid exactly once");
  });

  const REPEATS = [
    ["request_repeat_question_for_student", "SELECT public.request_repeat_question_for_student($1, 9::smallint, ARRAY['prehistoric_denmark']) AS id"],
    ["request_repeat_question_servable_for_student", "SELECT public.request_repeat_question_servable_for_student($1, 9::smallint, ARRAY['prehistoric_denmark']) AS id"],
    ["request_repeat_level_question_for_student", "SELECT public.request_repeat_level_question_for_student($1, ARRAY['prehistoric_denmark']) AS id"],
  ];
  for (const [name, sql] of REPEATS) {
    await t.test(`2. ${name}: a reopen waiting on the migration gets the NEW key`, async () => {
      const { connect, su, pupil, instance } = await freshDatabase();
      const p = await pupil();
      for (const i of PREHISTORIC) {
        const wrong = i === FLINT;
        await instance(p, QID[i], BEFORE[i].content.correct,
          { answered: true, wasCorrect: !wrong, answer: wrong ? BEFORE[i].content.options[1] : BEFORE[i].content.correct });
      }
      const migr = await connect(), gnq = await connect("service_role");
      await migr.query("BEGIN");
      await migr.query(MIGRATION);
      const reopening = settle(gnq.query(sql, [p]));
      assert.equal(await waitsOnLock(su, gnq.pid), true, "the reopen must wait for the migration");
      await migr.query("COMMIT");
      const res = await reopening;
      assert.ok(!(res instanceof Error), String(res));
      const id = res.rows[0].id;
      const row = (await su.query("SELECT question_id, answered, repeat_count, correct_answer FROM public.question_instances WHERE id = $1", [id])).rows[0];
      assert.equal(row.question_id, QID[FLINT]);
      assert.equal(row.answered, false);
      assert.equal(row.repeat_count, 1);
      assert.equal(row.correct_answer, patchOf(FLINT).correct_after, "never the old key with the new options");
      assert.equal(await staleOpen(su), 0);
    });
  }

  await t.test("3. a new instance read before the migration: graded and answered with the new key; a re-run re-keys it", async () => {
    const { connect, su, pupil } = await freshDatabase();
    const p1 = await pupil(), p2 = await pupil();
    const gnq = await connect("service_role"), migr = await connect();
    // get-next-question reads the question (and its key) first …
    const key = (await gnq.query("SELECT content ->> 'correct' AS k FROM public.questions WHERE id = $1", [QID[FLINT]])).rows[0].k;
    assert.equal(key, BEFORE[FLINT].content.correct);
    await migr.query("BEGIN");
    await migr.query(MIGRATION);
    // … and inserts after the migration took its locks.
    const insert = (p) => settle(gnq.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, answered, next_review_at)
      VALUES ($1, $2, $3, false, now()) RETURNING id`, [p, QID[FLINT], key]));
    const ins1 = insert(p1);
    assert.equal(await waitsOnLock(su, gnq.pid), true, "the insert must wait for the migration");
    await migr.query("COMMIT");
    const a = await ins1;
    assert.ok(!(a instanceof Error), String(a));
    const b = await insert(p2);
    const [qa, qb] = [a.rows[0].id, b.rows[0].id];
    // The pupil saw the old options: the old text is right, and so is the new one; the key shown is new.
    const r = (await gnq.query(ATTEMPT, [p1, qa, BEFORE[FLINT].content.correct])).rows[0].r;
    assert.deepEqual(r, { status: "correct", correct_answer: patchOf(FLINT).correct_after });
    // A re-run of the migration (all ten already corrected) re-keys the instance still open.
    assert.equal(await staleOpen(su), 1);
    await migr.query(MIGRATION);
    assert.equal(await staleOpen(su), 0);
    const rb = (await su.query("SELECT correct_answer FROM public.question_instances WHERE id = $1", [qb])).rows[0];
    assert.equal(rb.correct_answer, patchOf(FLINT).correct_after);
  });

  await t.test("4. an answer submitted while the migration holds its locks waits and is graded as the pupil saw it", async () => {
    const { connect, su, pupil, instance } = await freshDatabase();
    const p = await pupil();
    const qi = await instance(p, QID[GRUNDLOV], BEFORE[GRUNDLOV].content.correct);
    const migr = await connect(), pupilConn = await connect("service_role");
    await migr.query("BEGIN");
    await migr.query(MIGRATION);
    const answering = settle(pupilConn.query(ATTEMPT, [p, qi, BEFORE[GRUNDLOV].content.correct]));
    assert.equal(await waitsOnLock(su, pupilConn.pid), true, "the answer must wait for the migration");
    await migr.query("COMMIT");
    const res = await answering;
    assert.ok(!(res instanceof Error), String(res));
    assert.equal(res.rows[0].r.status, "correct");
    const pr = (await su.query("SELECT xp, coins, correct_answers FROM public.student_progress WHERE student_id = $1", [p])).rows[0];
    assert.deepEqual(pr, { xp: 110, coins: 55, correct_answers: 8 });
    assert.equal(await staleOpen(su), 0);
  });
});
