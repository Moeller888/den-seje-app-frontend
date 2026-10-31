// H5 PR 3: Match par (#377) graded by process_question_attempt_v2 exactly as by the live
// process_question_attempt — proven on PGlite with production's function bodies, not assumed.
//
// process-event canonicalises the pupil's connections (canonicalMatchAnswer, the real
// _shared/match-pairs.ts) and hands the same string to either function. This file runs the migration
// 20261030211428 UNMODIFIED on top of production's answer chain (helpers/answer-chain-schema.mjs pins
// every md5, process_question_attempt included) and grades every answer twice, once per function, on
// separate pupils with identical instances: verdict, the key returned, XP, coins, both counters, streak,
// daily and weekly quests, and the answered instance must be the same — for 2–6 pairs, every
// permutation up to 4 pairs, first rounds and repeats. Then the H5 rules for Match par: a retry with
// the same canonical answer replays, a changed one conflicts, a stale round is refused, nothing is paid
// twice.
//
// TEST-ONLY SCHEMA CHANGE: production's questions table cannot hold a Match par row yet —
// questions_answer_format_check has no 'match', and content_valid_check / auto_requires_correct demand
// content.correct and a type of mc, text or number. #377 added no migration for that (it is built,
// not servable). To grade a Match instance, this test database drops those three constraints on
// questions only. Nothing here says production may: making Match par servable needs its own reviewed
// migration and owner GO.
//
// HONEST LIMITS: PGlite is PostgreSQL 18.x and runs as superuser; calls run under SET ROLE service_role,
// as process-event's admin client does.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { answerChainSql, LIVE_PROSRC_MD5, readMigration, ATTEMPTS_MIGRATION_FILE } from "./helpers/answer-chain-schema.mjs";
import { canonicalMatchAnswer } from "../../supabase/functions/_shared/match-pairs.ts";

const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const KEYS = { 2: "0:1,1:0", 3: "0:2,1:0,2:1", 4: "0:3,1:2,2:0,3:1", 5: "0:4,1:0,2:3,3:1,4:2", 6: "0:5,1:3,2:1,3:0,4:4,5:2" };
const QUESTION = Object.fromEntries(Object.keys(KEYS).map((n) => [n, uid(9100 + Number(n))]));

function permutations(n) {
  if (n === 1) return [[0]];
  return permutations(n - 1).flatMap((p) => Array.from({ length: n }, (_, i) => [...p.slice(0, i), n - 1, ...p.slice(i)]));
}
// Every permutation up to 4 pairs (all possible complete answers); for 5 and 6 the key plus wrong ones.
function answersFor(n) {
  const key = KEYS[n].split(",").map((p) => Number(p.split(":")[1]));
  const perms = n <= 4 ? permutations(n) : [key, [...key].reverse(), [key[1], key[0], ...key.slice(2)], key.map((r) => (r + 1) % n)];
  // The browser's JSON, connections in reverse order, so canonicalisation is exercised every time.
  return perms.map((rights) => canonicalMatchAnswer(JSON.stringify(rights.map((r, l) => [l, r]).reverse()), KEYS[n]));
}

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
  for (const n of Object.keys(KEYS)) {
    const pairs = Array.from({ length: Number(n) }, (_, i) => ({ left: `Venstre ${i}`, right: `Højre ${i}` }));
    await db.query(`INSERT INTO public.questions (id, type, content, difficulty, is_active, question_type, learning_objective,
        answer_format, answer_type, metadata, difficulty_level)
      VALUES ($1, 'match', $2, 1, true, 'auto', 'geografi', 'match', 'short', '{}', 1000)`,
      [QUESTION[n], JSON.stringify({ question: `Forbind de ${n} par`, pairs })]);
  }
  await db.exec(readMigration(ATTEMPTS_MIGRATION_FILE));
  return db;
}

let nextPupil = 500;
async function addPupil(db) {
  const id = uid(nextPupil++);
  await db.exec(`INSERT INTO auth.users VALUES ('${id}');
    INSERT INTO public.profiles (id, role, selected_grade) VALUES ('${id}', 'student', 5);
    INSERT INTO public.student_progress (student_id, xp, coins, correct_answers, total_correct_answers,
      current_streak, longest_streak, last_activity_date) VALUES ('${id}', 100, 50, 7, 7, 1, 1, current_date - 1);`);
  return id;
}
async function serve(db, pupil, n, repeatCount) {
  return (await db.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, repeat_count,
      answered, next_review_at) VALUES ($1, $2, $3, $4, false, now()) RETURNING id`,
    [pupil, QUESTION[n], KEYS[n], repeatCount])).rows[0].id;
}
async function as(db, sql, params) {
  await db.exec("SET ROLE service_role");
  try { return (await db.query(sql, params)).rows[0].r; } finally { await db.exec("RESET ROLE"); }
}
const live = (db, p, qi, answer) =>
  as(db, "SELECT public.process_question_attempt($1, $2, $3, 0) AS r", [p, qi, answer]);
const v2 = (db, p, qi, answer, round, sub) =>
  as(db, "SELECT public.process_question_attempt_v2($1, $2, $3, $4, $5, NULL, NULL) AS r", [p, qi, answer, round, sub]);

// Everything an answer can change for its pupil, without ids and timestamps.
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
    milestones: await rows(`SELECT milestone_day FROM public.streak_milestones WHERE student_id = $1 ORDER BY 1`),
  };
}

let db;
before(async () => { db = await freshDb(); });

test("the chain is production's: process_question_attempt has its live md5, and _v2 routes 'match' to the MC path", async () => {
  const md5 = (await db.query(`SELECT md5(prosrc) AS h FROM pg_proc
    WHERE oid = 'public.process_question_attempt(uuid,uuid,text,bigint)'::regprocedure`)).rows[0].h;
  assert.equal(md5, LIVE_PROSRC_MD5["public.process_question_attempt(uuid,uuid,text,bigint)"]);
  const p = await addPupil(db);
  const qi = await serve(db, p, 3, 0);
  const r = await v2(db, p, qi, KEYS[3], 1, randomUUID());
  assert.equal(r.outcome, "recorded", "not refused as another answer path");
});

test("canonical Match par answers, 2–6 pairs, first round: _v2 grades and pays exactly as the live function", async () => {
  let correct = 0;
  let wrong = 0;
  for (const n of Object.keys(KEYS)) {
    for (const answer of answersFor(n)) {
      assert.notEqual(answer, null, `${n}: a complete answer canonicalises`);
      const pl = await addPupil(db);
      const pv = await addPupil(db);
      const rl = await live(db, pl, await serve(db, pl, n, 0), answer);
      const rv = await v2(db, pv, await serve(db, pv, n, 0), answer, 1, randomUUID());
      const label = `${n} pairs, ${answer}`;
      assert.equal(rv.outcome, "recorded", label);
      assert.deepEqual({ status: rv.status, correct_answer: rv.correct_answer }, rl, label);
      assert.deepEqual(await effects(db, pv), await effects(db, pl), `${label}: rewards, counters, streak, quests, instance`);
      assert.equal(rl.status, answer === KEYS[n] ? "correct" : "incorrect", label);
      assert.deepEqual([rv.xp_awarded, rv.coins_awarded], rl.status === "correct" ? [10, 5] : [0, 0], label);
      if (rl.status === "correct") correct++; else wrong++;
    }
  }
  assert.equal(correct, 5, "exactly one correct answer per size");
  assert.ok(wrong >= 1 + 5 + 23 + 3 + 3, "every wrong permutation up to 4 pairs, and wrong ones for 5 and 6");
});

test("canonical Match par answers on a repeat: the same reduced award (2 XP + 1 coin, no counters, no quests)", async () => {
  for (const n of Object.keys(KEYS)) {
    for (const answer of [KEYS[n], answersFor(n).find((a) => a !== KEYS[n])]) {
      const pl = await addPupil(db);
      const pv = await addPupil(db);
      const rl = await live(db, pl, await serve(db, pl, n, 1), answer);
      const rv = await v2(db, pv, await serve(db, pv, n, 1), answer, 2, randomUUID());
      const label = `${n} pairs repeat, ${answer}`;
      assert.deepEqual({ status: rv.status, correct_answer: rv.correct_answer }, rl, label);
      assert.deepEqual(await effects(db, pv), await effects(db, pl), label);
      assert.deepEqual([rv.xp_awarded, rv.coins_awarded], rl.status === "correct" ? [2, 1] : [0, 0], label);
    }
  }
});

test("H5 for Match par: same canonical answer replays, a changed one conflicts, a stale round is refused — paid once", async () => {
  const p = await addPupil(db);
  const qi = await serve(db, p, 4, 0);
  const sub = randomUUID();
  const same = canonicalMatchAnswer(JSON.stringify([[3, 1], [2, 0], [1, 2], [0, 3]]), KEYS[4]);
  assert.equal(same, KEYS[4], "another connection order gives the same canonical string");
  const first = await v2(db, p, qi, KEYS[4], 1, sub);
  const afterFirst = await effects(db, p);
  const replay = await v2(db, p, qi, same, 1, sub);
  assert.equal(first.outcome, "recorded");
  assert.deepEqual({ ...replay, outcome: "recorded" }, first, "the frozen result");
  const changed = await v2(db, p, qi, answersFor(4).find((a) => a !== KEYS[4]), 1, sub);
  assert.deepEqual(changed, { outcome: "submission_conflict" });
  const other = await v2(db, p, qi, KEYS[4], 1, randomUUID());
  assert.deepEqual(other, { outcome: "round_closed" });
  // A repeat opens round 2; a late answer for round 1 is stale.
  await db.query("UPDATE public.question_instances SET answered = false, repeat_count = 1 WHERE id = $1", [qi]);
  const stale = await v2(db, p, qi, KEYS[4], 1, randomUUID());
  assert.deepEqual(stale, { outcome: "stale_round" });
  const after = await effects(db, p);
  assert.deepEqual(after.progress, afterFirst.progress, "XP, coins, counters and streak paid once");
  assert.deepEqual(after.daily, afterFirst.daily, "quests advanced once");
  const attempts = (await db.query("SELECT attempt_no, user_answer, status FROM public.question_attempts WHERE student_id = $1", [p])).rows;
  assert.deepEqual(attempts, [{ attempt_no: 1, user_answer: KEYS[4], status: "correct" }]);
});
