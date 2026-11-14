// ATOMIC ATTEMPT CONTEXT + SECURITY REVIEW for migration 20261108043500 (Lærligverse L5 + L3), PGlite.
//
// Database: the FULL isolated replay → L1 K1 (20261103110000) → this file → the anti-guess cooldown (20261105130000,
// #610) on top, so every existing quiz path is exercised with all three present. All files run UNMODIFIED.
//
// What this proves (one connection — see HONEST LIMITS):
//   * The wrappers (process_question_attempt_with_context / process_text_answer_with_context) register through K1's
//     _v2 with mode = served_mode (NULL → quiz_v1) and hints_used = the distinct hint levels of THAT round:
//       - hint then answer: counted; two requests with the same request_id count once; a level asked twice counts once;
//       - answer then hint: refused (round_closed), and the stored attempt is unchanged;
//       - a replay of the same submission returns `replay` with the ORIGINAL values, and writes nothing;
//       - a client cannot supply hints: the wrappers have no such parameter, and API roles cannot call them;
//       - the wrapper's jsonb is _v2's jsonb (the same answer on a twin pupil gives the same result);
//       - after a repeat reopen, only the new round's hints count, and the reopened round has no served mode.
//   * LEARNING INTEGRITY (mastery and level): a pupil with a known mastery and level state is unchanged — in EVERY
//     public row that carries their id — by valid hints, replayed and repeated hints and late hints (closed round,
//     stale round); a twin who answers the same way WITHOUT hints ends with exactly the same XP, coins, streak,
//     mastery and subject level, fold by fold. A negative control (a planted hint side effect, rolled back) proves
//     the check would catch a hint that moved mastery or level.
//   * question_attempts is immutable: no role (not service_role, not even the table owner) can UPDATE hints_used.
//   * SECURITY (positive and negative), as the roles the paths really run as:
//       - a pupil can neither read nor change served_mode, nor UPDATE any instance (RLS: 0 rows), nor read or write
//         the hint log, nor call request_question_hint or the wrappers; anon even less;
//       - a teacher still reads their pupils' instances (the existing policy) but not served_mode or the log;
//       - the legacy answer functions, K1's _v2, the cooldown (#610, LQ429 through the wrapper), request_repeat_
//         question_for_student and release_open_question_outside (which deletes an open round WITH logged hints)
//         keep working with the privileges they had;
//       - every SECURITY DEFINER function these paths rely on has a pinned search_path.
// HONEST LIMITS: PGlite is one connection, so the ORDERING under contention (the shared FOR UPDATE row lock) is not
// raced here; laerligverse-l3-l5-concurrency.test.mjs races it on real PostgreSQL 17 (CI's service; skipped locally
// without LEVEL_ENGINE_PG_URL). PGlite is PostgreSQL 18.x; production is 17.6.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { replaySchema, readMigration } from "../isolated/schema/replay.mjs";
import { bootstrapMarkerSql } from "../isolated/seed/seed-guard.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PLATFORM = readFileSync(join(ROOT, "tests", "isolated", "schema", "pglite-platform.sql"), "utf8");

let db;
before(async () => {
  db = new PGlite();
  await db.exec(PLATFORM);
  await db.exec(bootstrapMarkerSql("0123456789abcdef0123456789abcdef"));
  const r = await replaySchema({ exec: (s) => db.exec(s), query: async (s) => (await db.query(s)).rows });
  assert.deepEqual(r.failures, []);
  await db.exec(readMigration("20261103110000_l1_k1_attempt_context.sql"));
  await db.exec(readMigration("20261108043500_laerligverse_served_mode_hint_log.sql"));
  await db.exec(readMigration("20261105130000_quiz_anti_guess_cooldown.sql"));
});

const code = async (p) => { try { await p; return null; } catch (e) { return e.code ?? String(e.message); } };
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
let n = 0;
async function addPupil({ teacher = null } = {}) {
  const id = randomUUID();
  await db.query(`INSERT INTO auth.users (id) VALUES ($1)`, [id]);
  await db.query(`INSERT INTO public.profiles (id, role, selected_grade, teacher_id) VALUES ($1, 'student', 7, $2)`, [id, teacher]);
  await db.query(`INSERT INTO public.student_progress (student_id, xp, coins) VALUES ($1, 100, 50) ON CONFLICT (student_id) DO UPDATE SET xp = 100, coins = 50`, [id]);
  return id;
}
async function addTeacher() {
  const id = randomUUID();
  await db.query(`INSERT INTO auth.users (id) VALUES ($1)`, [id]);
  await db.query(`INSERT INTO public.profiles (id, role) VALUES ($1, 'teacher')`, [id]);
  return id;
}
async function addQuestion({ step = "independent_application", objective = "test_l35w", format = "mc" } = {}) {
  n++;
  const content = format === "mc"
    ? { question: `L3/L5-wrapper ${n}`, options: ["a", "b"], correct: "a", hints: ["Første.", "Anden.", "Tredje."] }
    : { question: `L3/L5-tekst ${n}`, correct: "Paris", accepted_answers: ["Paris"], hints: ["Hovedstad."] };
  return (await one(`INSERT INTO public.questions (type, content, difficulty, is_active, question_type, learning_objective,
      answer_format, answer_type, metadata, target_grade) VALUES ($1, $2::jsonb, 1, true, 'auto', $3, $1, 'short', $4::jsonb, 7)
      RETURNING id`, [format, JSON.stringify(content), objective, JSON.stringify(step ? { learning_step: step } : {})])).id;
}
const MODE_OF = { guided_practice: "practice", revision: "practice", independent_application: "check", transfer: "application", revisit: "review" };
async function serve(pupil, q, { mode = "check", key = "a" } = {}) {
  return (await one(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, difficulty_at_time, mastery_snapshot,
      next_review_at, served_mode) VALUES ($1, $2, $3, 1, 1, now(), $4) RETURNING id`, [pupil, q, key, mode])).id;
}
async function as(role, sql, params = [], sub = null) {
  await db.exec(`SET ROLE ${role}`);
  if (sub) await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [sub]);
  try { return (await db.query(sql, params)).rows; } finally {
    await db.exec("RESET ROLE");
    await db.exec(`SELECT set_config('request.jwt.claim.sub', '', false)`);
  }
}
const hint = async (p, qi, round, level, rid = randomUUID()) =>
  (await as("service_role", `SELECT public.request_question_hint($1, $2, $3, $4, $5) AS r`, [p, qi, round, level, rid]))[0].r;
const answerMc = async (p, qi, a, round, sub = randomUUID()) =>
  (await as("service_role", `SELECT public.process_question_attempt_with_context($1, $2, $3, $4, $5, NULL, NULL) AS r`, [p, qi, a, round, sub]))[0].r;
const answerText = async (p, qi, a, ok, round, sub = randomUUID()) =>
  (await as("service_role", `SELECT public.process_text_answer_with_context($1, $2, $3, $4, $5, $6, NULL, NULL) AS r`, [qi, p, a, ok, round, sub]))[0].r;
const attempts = async (qi) => (await db.query(`SELECT attempt_no, mode, hints_used, status, xp_awarded, coins_awarded, submission_id::text s
  FROM public.question_attempts WHERE question_instance_id = $1 ORDER BY attempt_no`, [qi])).rows;

// ── Atomic attempt context ─────────────────────────────────────────────────────────────────────────────
test("hint then answer: the round's distinct levels are counted, with the served mode", async () => {
  const p = await addPupil();
  const qi = await serve(p, await addQuestion());
  const rid = randomUUID();
  assert.equal((await hint(p, qi, 1, 1, rid)).outcome, "recorded");
  assert.equal((await hint(p, qi, 1, 1, rid)).outcome, "replay", "the same request id again");
  assert.equal((await hint(p, qi, 1, 1)).outcome, "already_recorded", "the same level under another id");
  assert.equal((await hint(p, qi, 1, 2)).outcome, "recorded");
  const r = await answerMc(p, qi, "a", 1);
  assert.equal(r.outcome, "recorded");
  assert.deepEqual((await attempts(qi)).map(({ attempt_no, mode, hints_used }) => ({ attempt_no, mode, hints_used })),
    [{ attempt_no: 1, mode: "check", hints_used: 2 }], "two distinct levels, however often they were asked");
});

test("answer then hint: the hint is refused (round_closed) and the stored attempt is unchanged", async () => {
  const p = await addPupil();
  const qi = await serve(p, await addQuestion());
  assert.equal((await answerMc(p, qi, "b", 1)).outcome, "recorded");
  const before = await attempts(qi);
  assert.deepEqual(await hint(p, qi, 1, 1), { outcome: "round_closed" });
  assert.deepEqual(await attempts(qi), before);
  assert.equal(before[0].hints_used, 0);
  assert.equal((await one(`SELECT count(*)::int c FROM public.question_hint_requests WHERE question_instance_id = $1`, [qi])).c, 0);
});

test("replay of the same submission returns the ORIGINAL result and values; nothing is written or re-counted", async () => {
  const p = await addPupil();
  const qi = await serve(p, await addQuestion());
  await hint(p, qi, 1, 1);
  const sub = randomUUID();
  const first = await answerMc(p, qi, "a", 1, sub);
  const progress = await one(`SELECT xp, coins FROM public.student_progress WHERE student_id = $1`, [p]);
  const again = await answerMc(p, qi, "a", 1, sub);
  assert.equal(again.outcome, "replay");
  assert.deepEqual({ ...again, outcome: "recorded" }, first, "the frozen result");
  assert.deepEqual(await one(`SELECT xp, coins FROM public.student_progress WHERE student_id = $1`, [p]), progress, "paid once");
  assert.deepEqual((await attempts(qi)).map((a) => a.hints_used), [1]);
});

test("the wrapper's jsonb is _v2's: the same answer on a twin pupil gives the same result", async () => {
  const q = await addQuestion();
  const a = await addPupil();
  const b = await addPupil();
  const qa = await serve(a, q);
  const qb = await serve(b, q);
  const viaWrapper = await answerMc(a, qa, "b", 1);
  const viaV2 = (await as("service_role", `SELECT public.process_question_attempt_v2($1, $2, 'b', 1, $3, NULL, NULL, 'check', 0) AS r`, [b, qb, randomUUID()]))[0].r;
  assert.deepEqual(viaWrapper, viaV2);
  for (const bad of [[null, qa, "a", 1], [a, qa, "a", null], [a, randomUUID(), "a", 1], [a, qa, "", 1]]) {
    const w = await as("service_role", `SELECT public.process_question_attempt_with_context($1, $2, $3, $4, $5, NULL, NULL) AS r`, [...bad, randomUUID()]);
    assert.ok(["invalid_request", "not_found", "round_closed"].includes(w[0].r.outcome), JSON.stringify(bad));
  }
});

test("text wrapper: served mode NULL → quiz_v1, the round's hint counted; the text grading verdict is process-event's", async () => {
  const p = await addPupil();
  const qi = await serve(p, await addQuestion({ format: "text" }), { mode: null, key: "Paris" });
  await hint(p, qi, 1, 1);
  assert.equal((await answerText(p, qi, "Paris", true, 1)).outcome, "recorded");
  assert.deepEqual((await attempts(qi)).map(({ mode, hints_used, status }) => ({ mode, hints_used, status })),
    [{ mode: "quiz_v1", hints_used: 1, status: "correct" }]);
});

test("a client cannot supply hints or mode: no such wrapper parameter, and no API role may call the wrappers", async () => {
  const p = await addPupil();
  const qi = await serve(p, await addQuestion());
  assert.equal(await code(as("service_role", `SELECT public.process_question_attempt_with_context($1, $2, 'a', 1, $3, NULL, NULL, 'check', 0)`, [p, qi, randomUUID()])), "42883");
  for (const role of ["authenticated", "anon"]) {
    assert.equal(await code(as(role, `SELECT public.process_question_attempt_with_context($1, $2, 'a', 1, $3, NULL, NULL)`, [p, qi, randomUUID()], p)), "42501", role);
    assert.equal(await code(as(role, `SELECT public.process_text_answer_with_context($1, $2, 'a', true, 1, $3, NULL, NULL)`, [qi, p, randomUUID()], p)), "42501", role);
    assert.equal(await code(as(role, `SELECT public.process_question_attempt_v2($1, $2, 'a', 1, $3, NULL, NULL, 'check', 0)`, [p, qi, randomUUID()], p)), "42501", `${role} _v2`);
  }
  assert.deepEqual(await attempts(qi), []);
});

test("question_attempts is immutable: no role can change hints_used (or anything) after registration", async () => {
  const p = await addPupil();
  const qi = await serve(p, await addQuestion());
  await answerMc(p, qi, "a", 1);
  for (const role of ["service_role", "authenticated", "anon"]) {
    assert.ok(await code(as(role, `UPDATE public.question_attempts SET hints_used = 3 WHERE question_instance_id = $1`, [qi], p)), role);
    assert.ok(await code(as(role, `DELETE FROM public.question_attempts WHERE question_instance_id = $1`, [qi], p)), `${role} delete`);
  }
  assert.ok(await code(db.query(`UPDATE public.question_attempts SET hints_used = 3 WHERE question_instance_id = $1`, [qi])), "even the owner: the append-only trigger");
  assert.deepEqual((await attempts(qi)).map((a) => a.hints_used), [0]);
  const t = await one(`SELECT pg_get_triggerdef(oid) d FROM pg_trigger WHERE tgname = 'question_attempts_append_only'`);
  assert.match(t.d, /BEFORE UPDATE ON public\.question_attempts FOR EACH ROW/);
});

test("repeat: request_repeat_question_for_student reopens the round without a served mode; only round 2's hints count", async () => {
  const p = await addPupil();
  const objective = `test_l35_rep_${++n}`;
  const q = await addQuestion({ step: "guided_practice", objective });
  const qi = await serve(p, q, { mode: "practice" });
  await hint(p, qi, 1, 1);
  await hint(p, qi, 1, 2);
  assert.equal((await answerMc(p, qi, "b", 1)).status, "incorrect");
  const reopened = await as("service_role", `SELECT public.request_repeat_question_for_student($1, 7::smallint, $2) AS id`, [p, [objective]]);
  assert.equal(reopened[0].id, qi, "the existing repeat function still reopens it");
  const row = await one(`SELECT repeat_count, answered, served_mode FROM public.question_instances WHERE id = $1`, [qi]);
  assert.deepEqual(row, { repeat_count: 1, answered: false, served_mode: null });
  assert.deepEqual(await hint(p, qi, 1, 1), { outcome: "stale_round" });
  assert.equal((await hint(p, qi, 2, 1)).outcome, "recorded");
  assert.equal((await answerMc(p, qi, "a", 2)).outcome, "recorded");
  assert.deepEqual((await attempts(qi)).map(({ attempt_no, mode, hints_used }) => ({ attempt_no, mode, hints_used })),
    [{ attempt_no: 1, mode: "practice", hints_used: 2 }, { attempt_no: 2, mode: "quiz_v1", hints_used: 1 }]);
});

test("the anti-guess cooldown (#610) works through the wrapper: LQ429 inside the same transaction, nothing written", async () => {
  const p = await addPupil();
  const qs = [];
  for (let i = 0; i < 11; i++) qs.push(await addQuestion());
  let refused = null;
  for (let i = 0; i < qs.length && refused === null; i++) {
    const qi = await serve(p, qs[i]);
    try {
      await answerMc(p, qi, "b", 1);
    } catch (e) {
      refused = { code: e.code, qi };
    }
  }
  assert.ok(refused, "the threshold of wrong answers starts the pause");
  assert.equal(refused.code, "LQ429");
  assert.deepEqual(await attempts(refused.qi), [], "the refused answer registered nothing");
  assert.equal((await one(`SELECT answered FROM public.question_instances WHERE id = $1`, [refused.qi])).answered, false);
});

// ── Learning integrity: a hint never moves mastery, level or any reward ────────────────────────────────
// Every public table (and profiles) that carries the pupil's id, except the hint log itself. Read as the owner,
// so RLS hides nothing. A hint that touched ANY of these rows — student_progress (xp, coins, level, mastery_level,
// mastery_balance, mastery_score, streaks), student_subject_level, student_level_fold_log, quests, achievements,
// events, attempts, instances — changes the fingerprint.
async function pupilFingerprint(p) {
  const tables = (await db.query(`SELECT c.table_name t, c.column_name k FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE' AND c.table_name <> 'question_hint_requests'
      AND ((c.column_name = 'student_id' AND c.data_type = 'uuid') OR (c.table_name = 'profiles' AND c.column_name = 'id'))
    ORDER BY 1`)).rows;
  const out = {};
  for (const { t, k } of tables) {
    out[t] = (await one(`SELECT count(*)::int n, md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) m
      FROM public.${t} x WHERE x.${k} = $1`, [p]));
  }
  return out;
}
// The learning state that may legitimately move on an ANSWER, without identities or wall-clock times, so two
// twin pupils can be compared value for value.
async function learningState(p) {
  const progress = await one(`SELECT xp, coins, level, correct_answers, total_correct_answers, total_attempts,
      mastery_level, mastery_balance, mastery_score::text mastery_score, current_streak, longest_streak,
      best_session_streak, prestige_score FROM public.student_progress WHERE student_id = $1`, [p]);
  const subject = (await db.query(`SELECT subject, level, answered FROM public.student_subject_level
    WHERE student_id = $1 ORDER BY subject`, [p])).rows;
  const folds = (await db.query(`SELECT subject, was_correct, level_before, level_after FROM public.student_level_fold_log
    WHERE student_id = $1 ORDER BY folded_at, level_before, level_after`, [p])).rows;
  const counts = {};
  for (const [t, f] of Object.entries(await pupilFingerprint(p))) counts[t] = f.n;
  return { progress, subject, folds, counts };
}
const fold = async (p) => (await as("service_role", `SELECT * FROM public.advance_student_level($1, 'historie', 7::smallint)`, [p]))[0];
async function knownState(p) {
  // A known, non-default mastery and level state: the seed fold creates the subject level (grade 7 → band 1).
  await db.query(`UPDATE public.student_progress SET level = 4, mastery_level = 3, mastery_balance = 2, mastery_score = 1234,
    current_streak = 2, longest_streak = 5, correct_answers = 7, total_correct_answers = 9, total_attempts = 12 WHERE student_id = $1`, [p]);
  await fold(p);
}

test("learning integrity: hints — valid, replayed, repeated, out of order, out of round or late — change no mastery, level, XP, coins or streak", async () => {
  const p = await addPupil();
  await knownState(p);
  const q1 = await addQuestion();
  const q2 = await addQuestion();
  const qi = await serve(p, q1);
  const before = await pupilFingerprint(p);
  const stateBefore = await learningState(p);
  assert.ok(stateBefore.subject.length === 1 && stateBefore.subject[0].level > 0, "a known subject level exists");
  assert.equal(stateBefore.progress.mastery_level, 3);

  // Valid hints, the same request replayed (a retried connection), the same level under a new id, a skipped level.
  const rid = randomUUID();
  const outcomes = [];
  outcomes.push((await hint(p, qi, 1, 1, rid)).outcome);
  outcomes.push((await hint(p, qi, 1, 1, rid)).outcome);
  outcomes.push((await hint(p, qi, 1, 1)).outcome);
  outcomes.push((await hint(p, qi, 1, 3)).outcome);
  outcomes.push((await hint(p, qi, 1, 2)).outcome);
  outcomes.push((await hint(p, qi, 1, 3)).outcome);
  outcomes.push((await hint(p, qi, 1, 3)).outcome);
  outcomes.push((await hint(p, qi, 2, 1)).outcome);
  assert.deepEqual(outcomes, ["recorded", "replay", "already_recorded", "invalid_request", "recorded", "recorded",
    "already_recorded", "invalid_request"]);
  assert.equal((await one(`SELECT count(*)::int c FROM public.question_hint_requests WHERE question_instance_id = $1`, [qi])).c, 3);
  assert.deepEqual(await pupilFingerprint(p), before, "hints alone: every row carrying the pupil's id is byte-identical");
  assert.deepEqual(await fold(p).then(() => learningState(p)), stateBefore, "a fold after hints alone moves no level");

  // The answer is processed by the existing rules and does move progression (the test does not block learning).
  const r = await answerMc(p, qi, "a", 1);
  assert.equal(r.status, "correct");
  await fold(p);
  const afterAnswer = await learningState(p);
  assert.ok(afterAnswer.progress.xp > stateBefore.progress.xp, "a correct answer still pays XP");
  assert.ok(afterAnswer.subject[0].level > stateBefore.subject[0].level, "a correct first answer still raises the level");
  assert.equal(afterAnswer.folds.length, 1);
  assert.deepEqual((await attempts(qi)).map((a) => a.hints_used), [3], "the hints are recorded as evidence, nothing more");

  // Late and delayed hints: a replayed request and new requests after the answer (closed round), and a request for
  // a round that has not started — none of them changes anything, and a later fold folds nothing new. (A stale round
  // after a repeat reopen is refused in the repeat test above.)
  const settled = await pupilFingerprint(p);
  const late = [];
  late.push((await hint(p, qi, 1, 1, rid)).outcome);
  late.push((await hint(p, qi, 1, 1)).outcome);
  late.push((await hint(p, qi, 1, 2)).outcome);
  late.push((await hint(p, qi, 2, 1)).outcome);
  for (const o of late) assert.ok(["replay", "already_recorded", "round_closed", "invalid_request"].includes(o), o);
  assert.equal(late[2], "round_closed", "a new hint after the answer is refused");
  assert.equal((await fold(p)).newly_folded, 0);
  assert.deepEqual(await pupilFingerprint(p), settled, "late hints and a re-fold change nothing");

  // A second round that is answered wrong: hints before, then the answer moves the level DOWN by the usual rule.
  const qj = await serve(p, q2);
  const beforeHints2 = await pupilFingerprint(p);
  await hint(p, qj, 1, 1);
  await hint(p, qj, 1, 2);
  assert.deepEqual(await pupilFingerprint(p), beforeHints2);
  assert.equal((await answerMc(p, qj, "b", 1)).status, "incorrect");
  await fold(p);
  const afterWrong = await learningState(p);
  assert.ok(afterWrong.subject[0].level < afterAnswer.subject[0].level, "a wrong first answer still lowers the level");
});

test("learning integrity: a twin who answers the same way WITHOUT hints ends with identical XP, coins, streak, mastery and level", async () => {
  const withHints = await addPupil();
  const without = await addPupil();
  await knownState(withHints);
  await knownState(without);
  const start = await learningState(withHints);
  assert.deepEqual(start, await learningState(without), "identical starting points");
  const sequence = [["a", "correct"], ["b", "incorrect"], ["a", "correct"]];
  for (const [answer, status] of sequence) {
    const q = await addQuestion();
    const qh = await serve(withHints, q);
    const qn = await serve(without, q);
    const rid = randomUUID();
    await hint(withHints, qh, 1, 1, rid);
    await hint(withHints, qh, 1, 1, rid);
    await hint(withHints, qh, 1, 2);
    await hint(withHints, qh, 1, 3);
    const sh = randomUUID();
    const rh = await answerMc(withHints, qh, answer, 1, sh);
    const rn = await answerMc(without, qn, answer, 1);
    assert.equal(rh.status, status);
    assert.deepEqual(rh, rn, `the answer's result is the same with and without hints (${answer})`);
    // A replayed submission (a retried request) returns the original result and pays nothing again.
    assert.deepEqual({ ...(await answerMc(withHints, qh, answer, 1, sh)), outcome: "recorded" }, rh);
    await hint(withHints, qh, 1, 1);
    await fold(withHints);
    await fold(without);
    assert.deepEqual(await learningState(withHints), await learningState(without), `after the ${status} answer`);
    assert.deepEqual((await attempts(qh)).map((a) => a.hints_used), [3]);
    assert.deepEqual((await attempts(qn)).map((a) => a.hints_used), [0]);
  }
  const end = await learningState(withHints);
  assert.equal(end.folds.length, 3, "every first answer folded once");
  assert.notEqual(end.subject[0].level, start.subject[0].level, "the sequence really moved the level");
  assert.ok(end.progress.xp > start.progress.xp, "and paid XP: the comparison is not between two untouched states");
});

test("learning integrity, negative control: a planted hint side effect on mastery or level IS detected (rolled back)", async () => {
  const p = await addPupil();
  await knownState(p);
  const qi = await serve(p, await addQuestion());
  const before = await pupilFingerprint(p);
  const stateBefore = await learningState(p);
  await db.exec("BEGIN");
  try {
    await db.exec(`CREATE FUNCTION public.zz_planted_hint_side_effect() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
      SET search_path = public AS $f$ BEGIN
        UPDATE public.student_progress SET mastery_level = mastery_level + 1 WHERE student_id = NEW.student_id;
        UPDATE public.student_subject_level SET level = level + 1 WHERE student_id = NEW.student_id;
        RETURN NEW; END $f$`);
    await db.exec(`CREATE TRIGGER zz_planted AFTER INSERT ON public.question_hint_requests
      FOR EACH ROW EXECUTE FUNCTION public.zz_planted_hint_side_effect()`);
    assert.equal((await hint(p, qi, 1, 1)).outcome, "recorded");
    assert.notDeepEqual(await pupilFingerprint(p), before, "the fingerprint catches it");
    const s = await learningState(p);
    assert.equal(s.progress.mastery_level, stateBefore.progress.mastery_level + 1);
    assert.equal(s.subject[0].level, stateBefore.subject[0].level + 1);
  } finally {
    await db.exec("ROLLBACK");
  }
  assert.deepEqual(await pupilFingerprint(p), before, "rolled back: the database is as before");
  assert.equal((await one(`SELECT count(*)::int c FROM pg_proc WHERE proname = 'zz_planted_hint_side_effect'`)).c, 0);
});

// ── Security review: who can do what, as the roles the paths run as ─────────────────────────────────────
test("a pupil cannot UPDATE any instance (own or another pupil's), nor set served_mode, nor touch the hint log", async () => {
  const p = await addPupil();
  const other = await addPupil();
  const mine = await serve(p, await addQuestion());
  const theirs = await serve(other, await addQuestion());
  for (const qi of [mine, theirs]) {
    assert.deepEqual(await as("authenticated", `UPDATE public.question_instances SET answered = true, was_correct = true WHERE id = $1 RETURNING id`, [qi], p), [], "RLS: 0 rows");
    assert.equal(await code(as("authenticated", `UPDATE public.question_instances SET served_mode = 'check' WHERE id = $1`, [qi], p)), "42501");
    assert.deepEqual(await as("authenticated", `DELETE FROM public.question_instances WHERE id = $1 RETURNING id`, [qi], p), [], "no DELETE policy");
  }
  assert.deepEqual(await as("authenticated", `SELECT id FROM public.question_instances WHERE id = $1`, [theirs], p), [], "another pupil's row is invisible");
  assert.deepEqual((await as("authenticated", `SELECT id FROM public.question_instances WHERE id = $1`, [mine], p)).length, 1, "own row stays readable");
  for (const [sql, args] of [
    [`SELECT * FROM public.question_hint_requests`, []],
    [`INSERT INTO public.question_hint_requests (student_id, question_instance_id, round_no, hint_level, request_id) VALUES ($1, $2, 1, 1, $3)`, [p, mine, randomUUID()]],
    [`SELECT public.request_question_hint($1, $2, 1, 1, $3)`, [p, mine, randomUUID()]],
    [`SELECT public.request_question_hint($1, $2, 1, 1, $3)`, [other, theirs, randomUUID()]],
  ]) {
    assert.equal(await code(as("authenticated", sql, args, p)), "42501", sql);
    assert.equal(await code(as("anon", sql, args)), "42501", `anon ${sql}`);
  }
  assert.equal(await code(as("anon", `SELECT id FROM public.question_instances`)), "42501", "anon reads nothing");
  // request-hint passes the VERIFIED user: naming another pupil's instance with one's own id is not_found.
  assert.deepEqual(await hint(p, theirs, 1, 1), { outcome: "not_found" });
  assert.equal((await one(`SELECT count(*)::int c FROM public.question_hint_requests WHERE question_instance_id = $1`, [theirs])).c, 0);
});

test("a teacher still reads their pupils' instances (existing policy) but neither served_mode nor the hint log", async () => {
  const t = await addTeacher();
  const p = await addPupil({ teacher: t });
  const stranger = await addPupil();
  const qi = await serve(p, await addQuestion());
  const foreign = await serve(stranger, await addQuestion());
  await hint(p, qi, 1, 1);
  assert.equal((await as("authenticated", `SELECT id, answered, was_correct FROM public.question_instances WHERE id = $1`, [qi], t)).length, 1);
  assert.deepEqual(await as("authenticated", `SELECT id FROM public.question_instances WHERE id = $1`, [foreign], t), []);
  assert.equal(await code(as("authenticated", `SELECT served_mode FROM public.question_instances WHERE id = $1`, [qi], t)), "42501");
  assert.equal(await code(as("authenticated", `SELECT * FROM public.question_hint_requests`, [], t)), "42501");
});

test("existing paths keep their privileges: legacy answers, K1's _v2, release_open_question_outside with logged hints", async () => {
  const p = await addPupil();
  const qi = await serve(p, await addQuestion());
  const legacy = await as("service_role", `SELECT public.process_question_attempt($1, $2, 'a', 0::bigint) AS r`, [p, qi]);
  assert.equal(legacy[0].r.status, "correct", "legacy MC path");
  const p2 = await addPupil();
  const qt = await serve(p2, await addQuestion({ format: "text" }), { mode: null, key: "Paris" });
  await as("service_role", `SELECT public.process_text_answer($1, $2, 'Paris', true)`, [qt, p2]);
  assert.equal((await one(`SELECT answered, was_correct FROM public.question_instances WHERE id = $1`, [qt])).was_correct, true, "legacy text path");
  const p3 = await addPupil();
  const qv = await serve(p3, await addQuestion());
  assert.equal((await as("service_role", `SELECT public.process_question_attempt_v2($1, $2, 'a', 1, $3, NULL, NULL, 'quiz_v1', 0) AS r`, [p3, qv, randomUUID()]))[0].r.outcome, "recorded", "K1 _v2 directly (flag off)");
  // Subject switch: the pupil's open round-1 instance, with two logged hints, is deleted — the log cascades with it.
  const p4 = await addPupil();
  const open = await serve(p4, await addQuestion({ objective: "test_l35_switch" }));
  await hint(p4, open, 1, 1);
  await hint(p4, open, 1, 2);
  const released = await as("authenticated", `SELECT public.release_open_question_outside($1) AS n`, [["some_other_subject"]], p4);
  assert.equal(released[0].n, 1);
  assert.equal((await one(`SELECT count(*)::int c FROM public.question_instances WHERE id = $1`, [open])).c, 0);
  assert.equal((await one(`SELECT count(*)::int c FROM public.question_hint_requests WHERE question_instance_id = $1`, [open])).c, 0);
});

test("every SECURITY DEFINER these paths rely on pins its search_path; the new functions are all SECURITY INVOKER", async () => {
  const rows = (await db.query(`SELECT p.oid::regprocedure::text sig, p.prosecdef d, p.proconfig c FROM pg_proc p
    JOIN pg_namespace s ON s.oid = p.pronamespace WHERE s.nspname = 'public' AND p.proname IN (
      'process_question_attempt_v2', 'process_text_answer_v2', 'process_question_attempt', 'process_text_answer',
      'question_instances_served_snapshot', 'question_instances_round_guard', 'guard_open_round_requires_active_question',
      'quiz_cooldown_guard', 'quiz_cooldown_register', 'release_open_question_outside', 'request_repeat_question_for_student',
      'request_question_hint', 'question_instances_served_mode', 'process_question_attempt_with_context', 'process_text_answer_with_context')
    ORDER BY 1`)).rows;
  const NEW = ["request_question_hint", "question_instances_served_mode", "process_question_attempt_with_context", "process_text_answer_with_context"];
  for (const r of rows) {
    if (NEW.some((f) => r.sig.startsWith(`${f}(`))) assert.equal(r.d, false, `${r.sig}: invoker`);
    if (r.d) assert.ok(Array.isArray(r.c) && r.c.some((x) => x.startsWith("search_path=")), `${r.sig}: definer without a pinned search_path`);
  }
  assert.ok(rows.length >= 15, `all relied-on functions present (${rows.length})`);
});
