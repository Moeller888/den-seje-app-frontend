// Sandt/falsk (true_false, F-02) is graded by production's choice path, unchanged — proven on PGlite with
// production's function bodies, not assumed.
//
// The browser sends the option text ("Sandt"/"Falsk"); process-event sends it as-is to
// process_question_attempt (legacy) or process_question_attempt_v2 (H5), and both compare it with the
// instance key through public.normalize_choice_answer, because "true_false" contains neither "number"
// nor "text". This file runs production's answer chain (helpers/answer-chain-schema.mjs pins every md5,
// process_question_attempt included) plus migration 20261030211428 UNMODIFIED and grades every answer
// twice, once per function, on separate pupils with identical instances: verdict, the key returned, XP,
// coins, both counters, streak, quests and the answered instance must be the same — first rounds and
// repeats — and the award is MC's (10 XP + 5 coins, a repeat 2 + 1, nothing for a wrong answer).
//
// TEST-ONLY SCHEMA CHANGE: production's questions table cannot hold a true_false row yet —
// questions_answer_format_check admits only mc/number/text, and content_valid_check / auto_requires_correct
// demand content.type mc, text or number. This PR adds no migration for that (the kind is built, not
// servable). To grade an instance, this test database drops those three constraints on questions only,
// exactly as tests/unit/question-attempts-v2-match-grading.test.mjs does for Match par. Nothing here says
// production may: making Sandt/falsk servable needs its own reviewed migration and owner GO.
//
// HONEST LIMITS: PGlite is PostgreSQL 18.x and runs as superuser; calls run under SET ROLE service_role,
// as process-event's admin client does.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { answerChainSql, LIVE_PROSRC_MD5, readMigration, ATTEMPTS_MIGRATION_FILE } from "./helpers/answer-chain-schema.mjs";
import { trueFalseKey, TRUE_FALSE_OPTIONS } from "../../supabase/functions/_shared/true-false.ts";
import * as client from "../../js/true-false.js";

const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const QUESTIONS = {
  Sandt: { id: uid(9201), content: { question: "Jorden bevæger sig rundt om Solen.", correct: "Sandt" } },
  Falsk: { id: uid(9202), content: { question: "Danmark erklærede Tyskland krig den 9. april 1940.", correct: "Falsk" } },
};

async function freshDb() {
  const db = new PGlite();
  for (const sql of answerChainSql()) await db.exec(sql);
  await db.exec(`
    ALTER TABLE public.questions DROP CONSTRAINT questions_answer_format_check,
      DROP CONSTRAINT content_valid_check, DROP CONSTRAINT auto_requires_correct;   -- test-only, see header
    INSERT INTO public.daily_quests (quest_key, label, type, target, reward_coins) VALUES
      ('d_answers', 'Svar', 'answer_count', 5, 10), ('d_correct', 'Rigtige', 'correct_count', 5, 10),
      ('d_xp', 'XP', 'xp_earned', 100, 10);
    INSERT INTO public.weekly_quests (quest_key, label, type, target, reward_coins) VALUES
      ('w_answers', 'Svar', 'answer_count', 50, 50), ('w_correct', 'Rigtige', 'correct_count', 50, 50);`);
  for (const q of Object.values(QUESTIONS)) {
    await db.query(`INSERT INTO public.questions (id, type, content, difficulty, is_active, question_type, learning_objective,
        answer_format, answer_type, metadata, difficulty_level)
      VALUES ($1, 'true_false', $2, 1, true, 'auto', 'world_war_2', 'true_false', 'short', '{}', 1000)`,
      [q.id, JSON.stringify(q.content)]);
  }
  await db.exec(readMigration(ATTEMPTS_MIGRATION_FILE));
  return db;
}

let nextPupil = 700;
async function addPupil(db) {
  const id = uid(nextPupil++);
  await db.exec(`INSERT INTO auth.users VALUES ('${id}');
    INSERT INTO public.profiles (id, role, selected_grade) VALUES ('${id}', 'student', 5);
    INSERT INTO public.student_progress (student_id, xp, coins, correct_answers, total_correct_answers,
      current_streak, longest_streak, last_activity_date) VALUES ('${id}', 100, 50, 7, 7, 1, 1, current_date - 1);`);
  return id;
}
// The key is what get-next-question stores: content.correct, validated by the contract.
async function serve(db, pupil, keyName, repeatCount) {
  const q = QUESTIONS[keyName];
  return (await db.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, repeat_count,
      answered, next_review_at) VALUES ($1, $2, $3, $4, false, now()) RETURNING id`,
    [pupil, q.id, trueFalseKey(q.content), repeatCount])).rows[0].id;
}
async function as(db, sql, params) {
  await db.exec("SET ROLE service_role");
  try { return (await db.query(sql, params)).rows[0].r; } finally { await db.exec("RESET ROLE"); }
}
const live = (db, p, qi, answer) =>
  as(db, "SELECT public.process_question_attempt($1, $2, $3, 0) AS r", [p, qi, answer]);
const v2 = (db, p, qi, answer, round, sub) =>
  as(db, "SELECT public.process_question_attempt_v2($1, $2, $3, $4, $5, NULL, NULL) AS r", [p, qi, answer, round, sub]);

async function effects(db, pupil) {
  const rows = async (sql) => (await db.query(sql, [pupil])).rows;
  return {
    progress: await rows(`SELECT xp, coins, correct_answers, total_correct_answers, current_streak, longest_streak,
      last_activity_date::text AS last FROM public.student_progress WHERE student_id = $1`),
    instances: await rows(`SELECT answered, user_answer, was_correct, repeat_count, misconception_signal
      FROM public.question_instances WHERE student_id = $1`),
    daily: await rows(`SELECT d.quest_key, p.progress, p.completed FROM public.student_quest_progress p
      JOIN public.daily_quests d ON d.id = p.quest_id WHERE p.student_id = $1 ORDER BY 1`),
    weekly: await rows(`SELECT w.quest_key, p.progress FROM public.student_weekly_quest_progress p
      JOIN public.weekly_quests w ON w.id = p.quest_id WHERE p.student_id = $1 ORDER BY 1`),
  };
}

let db;
before(async () => { db = await freshDb(); });

test("the chain is production's, and _v2 routes 'true_false' to the choice path (not refused as another path)", async () => {
  const md5 = (await db.query(`SELECT md5(prosrc) AS h FROM pg_proc
    WHERE oid = 'public.process_question_attempt(uuid,uuid,text,bigint)'::regprocedure`)).rows[0].h;
  assert.equal(md5, LIVE_PROSRC_MD5["public.process_question_attempt(uuid,uuid,text,bigint)"]);
  const p = await addPupil(db);
  const r = await v2(db, p, await serve(db, p, "Sandt", 0), "Sandt", 1, randomUUID());
  assert.equal(r.outcome, "recorded");
  assert.equal(r.status, "correct");
});

test("the answers the browser sends, first round: both functions grade and pay exactly like MC", async () => {
  assert.deepEqual([...client.TRUE_FALSE_OPTIONS], [...TRUE_FALSE_OPTIONS], "the browser sends the key's own texts");
  for (const keyName of ["Sandt", "Falsk"]) {
    for (const answer of TRUE_FALSE_OPTIONS) {
      const pl = await addPupil(db);
      const pv = await addPupil(db);
      const rl = await live(db, pl, await serve(db, pl, keyName, 0), answer);
      const rv = await v2(db, pv, await serve(db, pv, keyName, 0), answer, 1, randomUUID());
      const label = `key ${keyName}, answer ${answer}`;
      assert.equal(rv.outcome, "recorded", label);
      assert.deepEqual({ status: rv.status, correct_answer: rv.correct_answer }, rl, label);
      assert.deepEqual(await effects(db, pv), await effects(db, pl), `${label}: rewards, counters, streak, quests, instance`);
      assert.equal(rl.status, answer === keyName ? "correct" : "incorrect", label);
      assert.equal(rl.correct_answer, keyName, "the right answer is revealed only after grading");
      assert.deepEqual([rv.xp_awarded, rv.coins_awarded], answer === keyName ? [10, 5] : [0, 0], label);
    }
  }
});

test("on a repeat: the same reduced award as MC (2 XP + 1 coin), nothing for a wrong answer", async () => {
  for (const keyName of ["Sandt", "Falsk"]) {
    for (const answer of TRUE_FALSE_OPTIONS) {
      const pl = await addPupil(db);
      const pv = await addPupil(db);
      const rl = await live(db, pl, await serve(db, pl, keyName, 1), answer);
      const rv = await v2(db, pv, await serve(db, pv, keyName, 1), answer, 2, randomUUID());
      const label = `repeat, key ${keyName}, answer ${answer}`;
      assert.deepEqual({ status: rv.status, correct_answer: rv.correct_answer }, rl, label);
      assert.deepEqual(await effects(db, pv), await effects(db, pl), label);
      assert.deepEqual([rv.xp_awarded, rv.coins_awarded], answer === keyName ? [2, 1] : [0, 0], label);
    }
  }
});

test("the choice comparison: case and outer spaces do not matter, another word is simply wrong", async () => {
  const cases = [["sandt", "correct"], ["  SANDT ", "correct"], ["Ja", "incorrect"],
    ["true", "incorrect"], ["", "incorrect"], ["Falsk", "incorrect"]];
  for (const [answer, status] of cases) {
    const p = await addPupil(db);
    const r = await live(db, p, await serve(db, p, "Sandt", 0), answer);
    assert.equal(r.status, status, JSON.stringify(answer));
  }
});

test("H5: the same answer replays, a changed one conflicts, paid once", async () => {
  const p = await addPupil(db);
  const qi = await serve(db, p, "Falsk", 0);
  const sub = randomUUID();
  const first = await v2(db, p, qi, "Falsk", 1, sub);
  const afterFirst = await effects(db, p);
  const replay = await v2(db, p, qi, "Falsk", 1, sub);
  assert.equal(first.outcome, "recorded");
  assert.deepEqual({ ...replay, outcome: "recorded" }, first, "the frozen result");
  assert.deepEqual(await v2(db, p, qi, "Sandt", 1, sub), { outcome: "submission_conflict" });
  assert.deepEqual(await v2(db, p, qi, "Falsk", 1, randomUUID()), { outcome: "round_closed" });
  const after = await effects(db, p);
  assert.deepEqual(after.progress, afterFirst.progress, "XP, coins, counters and streak paid once");
  const attempts = (await db.query("SELECT attempt_no, user_answer, status FROM public.question_attempts WHERE student_id = $1", [p])).rows;
  assert.deepEqual(attempts, [{ attempt_no: 1, user_answer: "Falsk", status: "correct" }]);
});
