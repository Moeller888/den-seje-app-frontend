// F10-B2 (owner GO 2026-11-15, PR #664): the INTRODUCTION FLOW on the replay profile "introduction" (PGlite, the full
// isolated replay with K1 → L3/L5 → K9 → introductions applied UNMODIFIED, exactly as the isolated introduction lane
// builds it). This file runs in the required `unit` check, so a broken introduction contract blocks the merge even
// before the isolated E2E lane runs.
//
// THREE DIFFERENT FACTS, KEPT APART (docs/laerligverse/eksponering-datakontrakt.md):
//   A. shown     — introduction_rounds.presented_at: the server received a "shown" report (optional K9 signal);
//   B. worked    — a question_attempts row: the pupil answered a task;
//   C. mastered  — what the existing, approved rules derive from answers (XP, coins, mastery, level).
// Serving, presenting, completing or replaying an introduction is never B or C.
//
// Proven here:
//   1. The profile builds: the four files applied in their binding order, the production mirror has none of them.
//   2. LEARNING INTEGRITY, step by step (A first serve, A' refresh, B first registration, C the same request id again,
//      D a new request id, E refused requests, F completion and resumption): after EVERY step, every row that carries
//      the pupil's id outside the introduction's own table is byte-identical, and a level fold folds nothing. Then a
//      correct and a wrong answer on the first guided-practice task still follow the existing rules.
//   3. The task's own "presented" (mark_presented, K9) is not an answer: no attempt, the round stays open, nothing paid;
//      the later answer is graded exactly as for a twin who never reported "presented".
//   4. A twin who never sees the introduction, answering the same way, ends with identical XP, coins, mastery and level.
//   5. NEGATIVE CONTROL: a planted introduction side effect on XP, coins and mastery IS detected (rolled back).
//   6. AUTHORISATION: no client role can read the rounds or call any function; another pupil's round is not_found;
//      every function is SECURITY INVOKER with an empty search_path and takes no client progression value.
// Concurrency (simultaneous registrations) needs more than one connection: laerligverse-introduction-concurrency
// .test.mjs races it on real PostgreSQL 17 in CI. HONEST LIMITS: PGlite is PostgreSQL 18.x as superuser; production
// is 17.6. The Edge Functions themselves run in the isolated lane (laerligverse-introduction.isolated.spec.mjs).
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { replaySchema, migrationFiles, readMigration } from "../isolated/schema/replay.mjs";
import { TEST_PROFILES, planReplay } from "../isolated/schema/replay-plan.mjs";
import { bootstrapMarkerSql } from "../isolated/seed/seed-guard.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PLATFORM = readFileSync(join(ROOT, "tests", "isolated", "schema", "pglite-platform.sql"), "utf8");
const FIXTURE = JSON.parse(readFileSync(join(ROOT, "tests", "isolated", "fixtures", "kildekritik-introduction.json"), "utf8"));
const OBJECTIVE = FIXTURE.learning_objective;
const CHAIN = [
  "20261103110000_l1_k1_attempt_context.sql",
  "20261108043500_laerligverse_served_mode_hint_log.sql",
  "20261109043500_laerligverse_presented_at.sql",
  "20261110043500_laerligverse_introductions.sql",
  // D-383: course items out of the ordinary quiz, replayed last in this lane (it needs none of the four above).
  "20261120150000_course_items_out_of_ordinary_quiz.sql",
];

let db;
let replay;
before(async () => {
  db = new PGlite();
  await db.exec(PLATFORM);
  await db.exec(bootstrapMarkerSql("0123456789abcdef0123456789abcdef"));
  replay = await replaySchema({ exec: (s) => db.exec(s), query: async (s) => (await db.query(s)).rows, profile: "introduction" });
  assert.deepEqual(replay.failures, [], "the introduction profile replays without a failure");
  await db.query(`INSERT INTO public.learning_introductions (learning_objective, content) VALUES ($1, $2::jsonb)`,
    [OBJECTIVE, JSON.stringify(FIXTURE.content)]);
});

const code = async (p) => { try { await p; return null; } catch (e) { return e.code ?? String(e.message); } };
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
async function as(role, sql, params = [], sub = null) {
  await db.exec(`SET ROLE ${role}`);
  if (sub) await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [sub]);
  try { return (await db.query(sql, params)).rows; } finally {
    await db.exec("RESET ROLE");
    await db.exec(`SELECT set_config('request.jwt.claim.sub', '', false)`);
  }
}
const svc = async (sql, params) => (await as("service_role", sql, params))[0].r;
const serveIntro = (p, objective = OBJECTIVE) => svc(`SELECT public.serve_introduction($1, $2) AS r`, [p, objective]);
const presentIntro = (p, round, rid) => svc(`SELECT public.mark_introduction_presented($1, $2, $3) AS r`, [p, round, rid]);
const completeIntro = (p, round, rid) => svc(`SELECT public.complete_introduction($1, $2, $3) AS r`, [p, round, rid]);
const presentTask = (p, qi, round) => svc(`SELECT public.mark_presented($1, $2, $3) AS r`, [p, qi, round]);
const answerMc = (p, qi, a, round, sub = randomUUID()) =>
  svc(`SELECT public.process_question_attempt_with_context($1, $2, $3, $4, $5, NULL, NULL) AS r`, [p, qi, a, round, sub]);
const fold = async (p) => (await as("service_role", `SELECT * FROM public.advance_student_level($1, 'historie', 7::smallint)`, [p]))[0];
const round = async (id) => one(`SELECT presented_at, presented_request_id::text, completed_at, completion_request_id::text,
  served_at FROM public.introduction_rounds WHERE id = $1`, [id]);

let n = 0;
async function addPupil() {
  const id = randomUUID();
  await db.query(`INSERT INTO auth.users (id) VALUES ($1)`, [id]);
  await db.query(`INSERT INTO public.profiles (id, role, selected_grade) VALUES ($1, 'student', 7)`, [id]);
  await db.query(`INSERT INTO public.student_progress (student_id, xp, coins) VALUES ($1, 100, 50)
    ON CONFLICT (student_id) DO UPDATE SET xp = 100, coins = 50`, [id]);
  return id;
}
async function addQuestion(step = "guided_practice") {
  n++;
  return (await one(`INSERT INTO public.questions (type, content, difficulty, is_active, question_type, learning_objective,
      answer_format, answer_type, metadata, target_grade) VALUES ('mc', $1::jsonb, 1, true, 'auto', $2, 'mc', 'short', $3::jsonb, 7)
      RETURNING id`, [JSON.stringify({ question: `Introduktionsforløb ${n}`, options: ["a", "b"], correct: "a" }), OBJECTIVE,
    JSON.stringify({ learning_step: step })])).id;
}
// The server's insert of a sequence round (get-next-question, service role), in the step's mode.
const serveTask = async (p, q, mode = "practice") => (await one(`INSERT INTO public.question_instances (student_id, question_id,
  correct_answer, difficulty_at_time, mastery_snapshot, next_review_at, served_mode) VALUES ($1, $2, 'a', 1, 1, now(), $3)
  RETURNING id`, [p, q, mode])).id;

// Every row that carries the pupil's id, in every public base table EXCEPT the introduction's own round table (which
// the flow is supposed to write): progress (XP, coins, mastery, streaks), subject level, fold log, quests,
// achievements, events, attempts, instances, the hint log.
async function pupilFingerprint(p) {
  const tables = (await db.query(`SELECT c.table_name t, c.column_name k FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE' AND c.table_name <> 'introduction_rounds'
      AND ((c.column_name = 'student_id' AND c.data_type = 'uuid') OR (c.table_name = 'profiles' AND c.column_name = 'id'))
    ORDER BY 1`)).rows;
  const out = {};
  for (const { t, k } of tables) {
    out[t] = await one(`SELECT count(*)::int n, md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) m
      FROM public.${t} x WHERE x.${k} = $1`, [p]);
  }
  return out;
}
// The values that may legitimately move on an ANSWER, without identities or wall-clock times (twin comparison).
async function learningState(p) {
  const progress = await one(`SELECT xp, coins, level, correct_answers, total_correct_answers, total_attempts,
      mastery_level, mastery_balance, mastery_score::text mastery_score, current_streak, longest_streak,
      best_session_streak, prestige_score FROM public.student_progress WHERE student_id = $1`, [p]);
  const subject = (await db.query(`SELECT subject, level, answered FROM public.student_subject_level
    WHERE student_id = $1 ORDER BY subject`, [p])).rows;
  const folds = (await db.query(`SELECT subject, was_correct, level_before, level_after FROM public.student_level_fold_log
    WHERE student_id = $1 ORDER BY folded_at, level_before, level_after`, [p])).rows;
  const attempts = (await db.query(`SELECT qa.attempt_no, qa.status, qa.was_correct, qa.xp_awarded, qa.coins_awarded, qa.mode,
      qa.hints_used FROM public.question_attempts qa WHERE qa.student_id = $1 ORDER BY qa.created_at, qa.attempt_no`, [p])).rows;
  return { progress, subject, folds, attempts };
}
// A known, non-default state with real history: one answered task (an attempt and a fold) before the introduction.
async function knownState(p) {
  await db.query(`UPDATE public.student_progress SET level = 4, mastery_level = 3, mastery_balance = 2, mastery_score = 1234,
    current_streak = 2, longest_streak = 5, correct_answers = 7, total_correct_answers = 9, total_attempts = 12 WHERE student_id = $1`, [p]);
  const qi = await serveTask(p, await addQuestion("revision"));
  assert.equal((await answerMc(p, qi, "a", 1)).status, "correct");
  await fold(p);
}

test("1. the introduction profile builds: K1 → L3/L5 → K9 → introductions applied in order; the mirror has none", async () => {
  assert.deepEqual(Object.keys(TEST_PROFILES.introduction), CHAIN);
  const applied = replay.steps.filter((s) => CHAIN.includes(s.name));
  assert.deepEqual(applied.map((s) => s.name), CHAIN, "each applied once, in the binding order");
  assert.ok(applied.every((s) => s.ok));
  const mirror = planReplay(migrationFiles(), readMigration).plan;
  for (const f of CHAIN) assert.equal(mirror.find((p) => p.file === f).action, "skip", `${f} is not replayed in the mirror`);
  const facts = await one(`SELECT to_regclass('public.introduction_rounds') IS NOT NULL rounds,
    to_regprocedure('public.mark_presented(uuid,uuid,integer)') IS NOT NULL k9,
    to_regclass('public.question_hint_requests') IS NOT NULL l3,
    (SELECT count(*)::int FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'question_attempts'
       AND column_name IN ('mode', 'hints_used')) k1`);
  assert.deepEqual(facts, { rounds: true, k9: true, l3: true, k1: 2 });
});

test("2. learning integrity: serving, refreshing, registering, replaying, refused and completed introductions change no XP, coins, mastery, level or attempt", async () => {
  const p = await addPupil();
  const other = await addPupil();
  await knownState(p);
  const before = await pupilFingerprint(p);
  const stateBefore = await learningState(p);
  assert.equal(stateBefore.attempts.length, 1, "the known state has real history");
  assert.equal(stateBefore.progress.mastery_level, 3);
  const unchanged = async (label) => {
    assert.deepEqual(await pupilFingerprint(p), before, `${label}: every row with the pupil's id is byte-identical`);
    assert.equal((await fold(p)).newly_folded, 0, `${label}: a level fold folds nothing`);
    assert.deepEqual(await learningState(p), stateBefore, `${label}: XP, coins, mastery, level and attempts as before`);
  };

  // A. First serve: a new round in server time, with the approved content and no answer key.
  const served = await serveIntro(p);
  assert.equal(served.outcome, "served");
  assert.deepEqual(served.content, FIXTURE.content);
  await unchanged("A first serve");
  // A'. A refresh or a lost reply resumes the SAME round (no second round).
  const resumed = await serveIntro(p);
  assert.equal(resumed.outcome, "resumed");
  assert.equal(resumed.round_id, served.round_id);
  assert.equal((await one(`SELECT count(*)::int c FROM public.introduction_rounds WHERE student_id = $1`, [p])).c, 1);
  await unchanged("A' refresh");

  // B. First registration of "shown": presented_at once, in server time, never before served_at.
  const rid = randomUUID();
  const first = await presentIntro(p, served.round_id, rid);
  assert.equal(first.outcome, "recorded");
  const r1 = await round(served.round_id);
  assert.equal(r1.presented_request_id, rid);
  assert.ok(r1.presented_at >= r1.served_at);
  await unchanged("B registration");
  // C. The same request id again (a retry after a lost connection): the original result, nothing written.
  const again = await presentIntro(p, served.round_id, rid);
  assert.deepEqual({ outcome: again.outcome, at: again.presented_at }, { outcome: "replay", at: first.presented_at });
  assert.deepEqual(await round(served.round_id), r1);
  await unchanged("C replay");
  // D. A new request id for the same round: the time is never moved.
  const other1 = await presentIntro(p, served.round_id, randomUUID());
  assert.deepEqual({ outcome: other1.outcome, at: other1.presented_at }, { outcome: "already_recorded", at: first.presented_at });
  assert.deepEqual(await round(served.round_id), r1);
  await unchanged("D new request id");

  // E. Refused requests: another pupil, an unknown round, missing identities, and every direct way around the functions.
  assert.deepEqual(await presentIntro(other, served.round_id, randomUUID()), { outcome: "not_found" });
  assert.deepEqual(await completeIntro(other, served.round_id, randomUUID()), { outcome: "not_found" });
  assert.deepEqual(await presentIntro(p, randomUUID(), randomUUID()), { outcome: "not_found" });
  assert.equal((await presentIntro(p, served.round_id, null)).outcome, "invalid_request");
  assert.equal((await completeIntro(null, served.round_id, randomUUID())).outcome, "invalid_request");
  assert.equal((await serveIntro(p, null)).outcome, "invalid_request");
  assert.equal(await code(as("service_role", `UPDATE public.introduction_rounds SET presented_at = now() WHERE id = $1`, [served.round_id])),
    "23514", "set once: even the service role cannot move presented_at");
  assert.equal(await code(as("service_role", `DELETE FROM public.introduction_rounds WHERE id = $1`, [served.round_id])), "42501");
  assert.equal(await code(as("authenticated", `SELECT public.mark_introduction_presented($1, $2, $3)`, [p, served.round_id, randomUUID()], p)), "42501");
  assert.deepEqual(await round(served.round_id), r1);
  assert.equal((await one(`SELECT count(*)::int c FROM public.introduction_rounds WHERE student_id = $1`, [other])).c, 0,
    "the refused requests created nothing for the other pupil");
  await unchanged("E refused");

  // F. Completion, its replay, a second id, and resumption: the sequence may move on — nothing is paid or learned.
  const cid = randomUUID();
  const done = await completeIntro(p, served.round_id, cid);
  assert.equal(done.outcome, "recorded");
  assert.equal((await completeIntro(p, served.round_id, cid)).outcome, "replay");
  assert.equal((await completeIntro(p, served.round_id, randomUUID())).outcome, "already_completed");
  assert.equal((await round(served.round_id)).completion_request_id, cid);
  const after = await serveIntro(p);
  assert.deepEqual({ outcome: after.outcome, round: after.round_id }, { outcome: "completed", round: served.round_id },
    "resumption: the server says the introduction is done; no new round, no content again");
  assert.equal(after.content, undefined);
  await unchanged("F completion and resumption");

  // Only now: the first guided-practice task. An answer is graded by the existing rules (correct pays and raises the
  // level, wrong lowers it) — the test does not block learning, it only proves the introduction pays nothing.
  const qi = await serveTask(p, await addQuestion("guided_practice"));
  const right = await answerMc(p, qi, "a", 1);
  assert.equal(right.status, "correct");
  await fold(p);
  const s1 = await learningState(p);
  assert.ok(s1.progress.xp > stateBefore.progress.xp, "a correct answer still pays XP");
  assert.ok(s1.subject[0].level > stateBefore.subject[0].level, "a correct first answer still raises the level");
  assert.equal(s1.attempts.length, 2);
  const qj = await serveTask(p, await addQuestion("guided_practice"));
  assert.equal((await answerMc(p, qj, "b", 1)).status, "incorrect");
  await fold(p);
  assert.ok((await learningState(p)).subject[0].level < s1.subject[0].level, "a wrong first answer still lowers the level");
});

test("3. a task's own 'presented' (K9 mark_presented) is not an answer: no attempt, the round stays open, nothing paid", async () => {
  const p = await addPupil();
  const twin = await addPupil();
  await knownState(p);
  await knownState(twin);
  const q = await addQuestion("guided_practice");
  const qi = await serveTask(p, q);
  const qt = await serveTask(twin, q);
  const stateBefore = await learningState(p);
  const first = await presentTask(p, qi, 1);
  assert.equal(first.outcome, "recorded");
  const replay = await presentTask(p, qi, 1);
  assert.deepEqual({ outcome: replay.outcome, at: replay.presented_at }, { outcome: "replay", at: first.presented_at });
  assert.deepEqual(await presentTask(p, qi, 2), { outcome: "invalid_request", reason: "round_ahead" });
  assert.deepEqual(await presentTask(twin, qi, 1), { outcome: "not_found" }, "another pupil's instance looks missing");
  const inst = await one(`SELECT answered, repeat_count, presented_at FROM public.question_instances WHERE id = $1`, [qi]);
  assert.equal(inst.answered, false, "the round is still open: presenting is not answering");
  assert.equal(inst.repeat_count, 0);
  assert.equal((await fold(p)).newly_folded, 0);
  assert.deepEqual(await learningState(p), stateBefore, "no attempt, no XP, no coins, no mastery, no level");
  // The later answer is graded exactly as for the twin who never reported "presented".
  const rp = await answerMc(p, qi, "a", 1);
  const rt = await answerMc(twin, qt, "a", 1);
  assert.deepEqual(rp, rt);
  await fold(p);
  await fold(twin);
  assert.deepEqual(await learningState(p), await learningState(twin));
  assert.deepEqual(await presentTask(p, qi, 1), { outcome: "replay", round_no: 1, presented_at: first.presented_at },
    "a late report after the answer returns the stored time and writes nothing");
  const twinInst = await one(`SELECT presented_at FROM public.question_instances WHERE id = $1`, [qt]);
  assert.equal(twinInst.presented_at, null);
  assert.deepEqual(await presentTask(twin, qt, 1), { outcome: "round_closed" }, "a first report after the answer is refused");
});

test("4. a twin who never sees the introduction, answering the same way, ends with identical XP, coins, mastery and level", async () => {
  const withIntro = await addPupil();
  const without = await addPupil();
  await knownState(withIntro);
  await knownState(without);
  const start = await learningState(withIntro);
  assert.deepEqual(start, await learningState(without), "identical starting points");
  const s = await serveIntro(withIntro);
  const rid = randomUUID();
  await presentIntro(withIntro, s.round_id, rid);
  await presentIntro(withIntro, s.round_id, rid);
  await presentIntro(withIntro, s.round_id, randomUUID());
  await completeIntro(withIntro, s.round_id, randomUUID());
  await serveIntro(withIntro);
  for (const [answer, status] of [["a", "correct"], ["b", "incorrect"], ["a", "correct"]]) {
    const q = await addQuestion("guided_practice");
    const qw = await serveTask(withIntro, q);
    const qn = await serveTask(without, q);
    const sub = randomUUID();
    const rw = await answerMc(withIntro, qw, answer, 1, sub);
    const rn = await answerMc(without, qn, answer, 1);
    assert.equal(rw.status, status);
    assert.deepEqual(rw, rn, `the same result with and without the introduction (${answer})`);
    assert.deepEqual({ ...(await answerMc(withIntro, qw, answer, 1, sub)), outcome: "recorded" }, rw, "a replayed answer pays nothing again");
    await fold(withIntro);
    await fold(without);
    assert.deepEqual(await learningState(withIntro), await learningState(without), `after the ${status} answer`);
  }
  const end = await learningState(withIntro);
  assert.notEqual(end.subject[0].level, start.subject[0].level, "the answers really moved the level");
  assert.ok(end.progress.xp > start.progress.xp, "and paid XP: the comparison is not between two untouched states");
});

test("5. negative control: a planted introduction side effect on XP, coins and mastery IS detected (rolled back)", async () => {
  const p = await addPupil();
  await knownState(p);
  const s = await serveIntro(p);
  const before = await pupilFingerprint(p);
  const stateBefore = await learningState(p);
  await db.exec("BEGIN");
  try {
    await db.exec(`CREATE FUNCTION public.zz_planted_intro_reward() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
      SET search_path = public AS $f$ BEGIN
        UPDATE public.student_progress SET xp = xp + 10, coins = coins + 5, mastery_level = mastery_level + 1
          WHERE student_id = NEW.student_id;
        RETURN NEW; END $f$`);
    await db.exec(`CREATE TRIGGER zz_planted AFTER UPDATE ON public.introduction_rounds
      FOR EACH ROW EXECUTE FUNCTION public.zz_planted_intro_reward()`);
    assert.equal((await presentIntro(p, s.round_id, randomUUID())).outcome, "recorded");
    assert.notDeepEqual(await pupilFingerprint(p), before, "the fingerprint catches it");
    const st = await learningState(p);
    assert.deepEqual([st.progress.xp, st.progress.coins, st.progress.mastery_level],
      [stateBefore.progress.xp + 10, stateBefore.progress.coins + 5, stateBefore.progress.mastery_level + 1]);
  } finally {
    await db.exec("ROLLBACK");
  }
  assert.deepEqual(await pupilFingerprint(p), before, "rolled back: the database is as before");
  assert.equal((await round(s.round_id)).presented_at, null, "the registration was rolled back with it");
  assert.equal((await one(`SELECT count(*)::int c FROM pg_proc WHERE proname = 'zz_planted_intro_reward'`)).c, 0);
  assert.equal((await one(`SELECT count(*)::int c FROM pg_trigger WHERE tgname = 'zz_planted'`)).c, 0);
});

test("6. authorisation: no client role reads a round or calls a function; SECURITY INVOKER, empty search_path, no client progression value", async () => {
  const p = await addPupil();
  const s = await serveIntro(p);
  for (const role of ["anon", "authenticated"]) {
    assert.equal(await code(as(role, `SELECT * FROM public.introduction_rounds`, [], p)), "42501", `${role}: not even the pupil's own round`);
    assert.equal(await code(as(role, `SELECT * FROM public.learning_introductions`, [], p)), "42501", `${role}: content only through the server`);
    assert.equal(await code(as(role, `UPDATE public.introduction_rounds SET completed_at = now() WHERE id = $1`, [s.round_id], p)), "42501");
    assert.equal(await code(as(role, `INSERT INTO public.introduction_rounds (student_id, introduction_id, content_sha256)
      SELECT $1, introduction_id, content_sha256 FROM public.introduction_rounds LIMIT 1`, [p], p)), "42501");
    for (const call of [`SELECT public.serve_introduction($1, '${OBJECTIVE}')`, `SELECT public.complete_introduction($1, '${s.round_id}', gen_random_uuid())`,
      `SELECT public.mark_introduction_presented($1, '${s.round_id}', gen_random_uuid())`, `SELECT public.mark_presented($1, gen_random_uuid(), 1)`]) {
      assert.equal(await code(as(role, call, [p], p)), "42501", `${role}: ${call}`);
    }
  }
  const fns = (await db.query(`SELECT p.proname, p.prosecdef, p.proconfig::text cfg, pg_get_function_identity_arguments(p.oid) args
    FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN ('serve_introduction', 'mark_introduction_presented', 'complete_introduction', 'mark_presented')
    ORDER BY 1`)).rows;
  assert.deepEqual(fns.map((f) => [f.proname, f.prosecdef, f.cfg]), [
    ["complete_introduction", false, '{"search_path=\\"\\""}'],
    ["mark_introduction_presented", false, '{"search_path=\\"\\""}'],
    ["mark_presented", false, '{"search_path=\\"\\""}'],
    ["serve_introduction", false, '{"search_path=\\"\\""}'],
  ]);
  // The only inputs are identities chosen by the server (the verified pupil) and the client's request ids or round:
  // no XP, coin, mastery, level, step or time parameter exists that a client could set.
  assert.deepEqual(fns.map((f) => f.args), [
    "p_student_id uuid, p_round_id uuid, p_request_id uuid",
    "p_student_id uuid, p_round_id uuid, p_request_id uuid",
    "p_student_id uuid, p_question_instance_id uuid, p_round_no integer",
    "p_student_id uuid, p_learning_objective text",
  ]);
  // No other function, view or trigger of the schema reads the introduction tables (they feed nothing).
  const readers = (await db.query(`SELECT p.proname FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
    AND (p.prosrc ILIKE '%introduction_rounds%' OR p.prosrc ILIKE '%learning_introductions%') ORDER BY 1`)).rows.map((r) => r.proname);
  assert.deepEqual(readers, ["complete_introduction", "introduction_rounds_guard", "learning_introductions_guard",
    "mark_introduction_presented", "serve_introduction"]);
  const views = (await db.query(`SELECT c.relname FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('v', 'm')
    AND (pg_get_viewdef(c.oid) ILIKE '%introduction_rounds%' OR pg_get_viewdef(c.oid) ILIKE '%learning_introductions%')`)).rows;
  assert.deepEqual(views, []);
});
