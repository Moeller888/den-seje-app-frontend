// Contract guards for repeating questions once a pupil's unserved pool is exhausted.
// Offline, source-only: no network, no database, no production call.
//
// THE PROBLEM THESE GUARD AGAINST
// get_unserved_questions() excludes every question already instanced for a pupil. Once a pupil has
// answered all the questions available at their grade — 490 at grade 7 — it returns nothing and
// the quiz shows "ingen flere spørgsmål" permanently.
//
// THE RISK THE FIX INTRODUCES
// Re-serving an answered question means re-awarding for it. A pupil who has exhausted the pool
// knows every answer, so a full award would be an unbounded XP and coin faucet. These guards pin
// the reduced award and the things a repeat must NOT touch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATION = "supabase/migrations/20260928000000_quiz_repeat_when_pool_exhausted.sql";
const EDGE = "supabase/functions/get-next-question/index.ts";
const sql = () => readFileSync(join(REPO, MIGRATION), "utf8");
// Assertions run against EXECUTABLE SQL: the comments quote the old behaviour and name the things
// this migration must not do, so reading the prose would test the wrong text.
const stmts = () => sql()
  .split(/\r?\n/)
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");
const edge = () => readFileSync(join(REPO, EDGE), "utf8");

// ── A model of the award rules ───────────────────────────────────────────────
// Deliberately not the real function: the smallest faithful model of the decision, so the
// difference between a first attempt and a repeat shows as behaviour rather than as a diff.
function award({ correct, repeatCount }) {
  const isRepeat = (repeatCount ?? 0) > 0;
  if (!correct) {
    return { xp: 0, coins: 0, accuracyCounters: false, questProgress: !isRepeat, streak: true };
  }
  return isRepeat
    ? { xp: 2,  coins: 0, accuracyCounters: false, questProgress: false, streak: true }
    : { xp: 10, coins: 5, accuracyCounters: true,  questProgress: true,  streak: true };
}

test("a first correct answer is unchanged: 10 XP, 5 coins, counters, quest progress", () => {
  assert.deepEqual(award({ correct: true, repeatCount: 0 }),
    { xp: 10, coins: 5, accuracyCounters: true, questProgress: true, streak: true });
});

test("a correct repeat earns 2 XP and nothing else", () => {
  const r = award({ correct: true, repeatCount: 1 });
  assert.equal(r.xp, 2);
  assert.equal(r.coins, 0, "coins would make the shop farmable on known answers");
  assert.equal(r.accuracyCounters, false,
    "counters feed the accuracy figure teachers read — re-answers must not inflate it");
  assert.equal(r.questProgress, false, "quest rewards are coins; repeats must not advance them");
});

test("the streak still counts a repeat — it measures showing up", () => {
  assert.equal(award({ correct: true,  repeatCount: 3 }).streak, true);
  assert.equal(award({ correct: false, repeatCount: 3 }).streak, true);
});

test("farming is bounded: repeating all 490 known answers yields XP only, never coins", () => {
  let xp = 0, coins = 0;
  for (let i = 0; i < 490; i++) {
    const r = award({ correct: true, repeatCount: 1 });
    xp += r.xp; coins += r.coins;
  }
  assert.equal(coins, 0, "no coin inflation is possible through repetition");
  assert.equal(xp, 980, "XP accrues at the reduced rate only");
  // The same 490 at the first-attempt rate would have been 4900 XP and 2450 coins.
  assert.ok(xp < 4900);
});

// ── Selection order ──────────────────────────────────────────────────────────

function pickRepeat(instances) {
  // incorrect first, then oldest answer first
  return [...instances]
    .filter((i) => i.answered && i.autoGraded && i.teacherScore == null)
    .sort((a, b) =>
      (a.wasCorrect === false ? 0 : 1) - (b.wasCorrect === false ? 0 : 1) ||
      new Date(a.answeredAt) - new Date(b.answeredAt))[0] ?? null;
}

test("an incorrectly answered question is chosen before a correct one", () => {
  const chosen = pickRepeat([
    { id: "old-correct",   answered: true, autoGraded: true, teacherScore: null, wasCorrect: true,  answeredAt: "2026-01-01" },
    { id: "new-incorrect", answered: true, autoGraded: true, teacherScore: null, wasCorrect: false, answeredAt: "2026-09-01" },
  ]);
  assert.equal(chosen.id, "new-incorrect",
    "pedagogy beats recency: what the pupil got wrong comes first");
});

test("within incorrect answers the oldest comes first", () => {
  const chosen = pickRepeat([
    { id: "recent", answered: true, autoGraded: true, teacherScore: null, wasCorrect: false, answeredAt: "2026-09-01" },
    { id: "oldest", answered: true, autoGraded: true, teacherScore: null, wasCorrect: false, answeredAt: "2026-02-01" },
  ]);
  assert.equal(chosen.id, "oldest");
});

test("teacher-graded and non-auto-graded work is never chosen", () => {
  assert.equal(pickRepeat([
    { id: "graded", answered: true, autoGraded: true,  teacherScore: 3,    wasCorrect: null, answeredAt: "2026-01-01" },
    { id: "long",   answered: true, autoGraded: false, teacherScore: null, wasCorrect: null, answeredAt: "2026-01-01" },
  ]), null, "reopening those would revert a graded answer to ungraded");
});

test("an unanswered question is never chosen as a repeat", () => {
  assert.equal(pickRepeat([
    { id: "open", answered: false, autoGraded: true, teacherScore: null, wasCorrect: null, answeredAt: null },
  ]), null);
});

// ── The migration ────────────────────────────────────────────────────────────

test("repeat_count is added as a non-null counter defaulting to zero", () => {
  assert.match(stmts(),
    /ALTER TABLE public\.question_instances\s*\n\s*ADD COLUMN IF NOT EXISTS repeat_count integer NOT NULL DEFAULT 0;/,
    "a constant default avoids a table rewrite on a live table");
});

test("the repeat RPC is SECURITY DEFINER with the project's pinned search_path", () => {
  const s = stmts();
  const at = s.indexOf("CREATE OR REPLACE FUNCTION public.request_repeat_question");
  assert.ok(at !== -1);
  const block = s.slice(at, s.indexOf("$$;", at));
  assert.match(block, /SECURITY DEFINER/);
  assert.match(block, /SET search_path = public, pg_temp/);
  assert.match(block, /v_uid\s+uuid\s*:=\s*\(SELECT auth\.uid\(\)\)/,
    "the identity must come from the verified JWT, never a parameter");
});

test("EXECUTE on the repeat RPC is closed by default and opened only to authenticated", () => {
  const s = stmts();
  assert.match(s, /REVOKE EXECUTE ON FUNCTION public\.request_repeat_question\(smallint, text\[\]\) FROM PUBLIC;/);
  assert.match(s, /REVOKE EXECUTE ON FUNCTION public\.request_repeat_question\(smallint, text\[\]\) FROM anon;/);
  assert.match(s, /GRANT\s+EXECUTE ON FUNCTION public\.request_repeat_question\(smallint, text\[\]\) TO authenticated;/);
  assert.ok(!/GRANT[^;]*request_repeat_question[^;]*TO\s+(anon|PUBLIC)/i.test(s));
});

test("a repeat is refused while the pupil already has an open question", () => {
  const s = stmts();
  assert.match(s, /IF EXISTS \(\s*\n\s*SELECT 1 FROM public\.question_instances qi\s*\n\s*WHERE qi\.student_id = v_uid AND qi\.answered = false\s*\n\s*\) THEN\s*\n\s*RETURN NULL;/,
    "otherwise the reset would violate idx_one_open_question");
});

test("a repeat is refused while any unserved question remains — verified server-side", () => {
  const s = stmts();
  const at = s.indexOf("Repeats are a last resort");
  // the guard mirrors get_unserved_questions' predicate and returns NULL if anything is left
  assert.match(s, /AND NOT EXISTS \(\s*\n\s*SELECT 1 FROM public\.question_instances qi\s*\n\s*WHERE qi\.student_id = v_uid AND qi\.question_id = q\.id\s*\n\s*\)\s*\n\s*\) THEN\s*\n\s*RETURN NULL;/,
    "a client must not be able to skip straight to repeats");
});

test("the candidate query keeps teacher-owned work out", () => {
  const s = stmts();
  assert.match(s, /AND qi\.teacher_score IS NULL/);
  assert.match(s, /AND q\.answer_format <> 'text'/);
  assert.match(s, /AND coalesce\(q\.answer_type, 'short'\) <> 'long'/);
  assert.match(s, /AND q\.is_active/);
});

test("the candidate order is incorrect-first, then oldest", () => {
  const s = stmts();
  assert.match(s, /ORDER BY\s*\n\s*\(qi\.was_correct IS NOT FALSE\),[\s\S]{0,120}qi\.answered_at ASC NULLS FIRST/,
    "false sorts before true, then oldest answer");
});

test("the reset clears the previous attempt and bumps the counter", () => {
  const s = stmts();
  const at = s.indexOf("UPDATE public.question_instances");
  const block = s.slice(at, s.indexOf(";", s.indexOf("IF NOT FOUND", at)));
  for (const clause of [
    /answered\s+= false/, /user_answer\s+= NULL/, /was_correct\s+= NULL/,
    /answered_at\s+= NULL/, /next_review_at = now\(\)/, /repeat_count\s+= repeat_count \+ 1/,
  ]) assert.match(block, clause);
  assert.match(block, /AND answered = true;/,
    "a lost race must not double-bump the counter");
  assert.match(s, /IF NOT FOUND THEN\s*\n\s*RETURN NULL;/);
});

test("process_question_attempt keeps its idempotency guard", () => {
  const s = stmts();
  assert.match(s, /IF v_instance\.answered = true THEN[\s\S]{0,400}RETURN json_build_object/,
    "an already answered instance must return the previous result and award nothing");
  assert.match(s, /GET DIAGNOSTICS v_rows_updated = ROW_COUNT;/);
  assert.match(s, /IF v_rows_updated = 0 THEN[\s\S]{0,300}RETURN json_build_object/,
    "a concurrent scorer must not be double-awarded");
  assert.match(s, /WHERE id\s+= v_instance\.id\s*\n\s*AND answered = false;/);
});

test("the reduced award is driven by repeat_count, not an implicit marker", () => {
  const s = stmts();
  assert.match(s, /v_is_repeat\s*:=\s*coalesce\(v_instance\.repeat_count, 0\) > 0;/,
    "an implicit marker such as answered_at could be cleared, silently restoring the full award");
  assert.match(s, /IF v_is_repeat THEN[\s\S]{0,400}v_xp\s*:=\s*2;/);
  assert.match(s, /v_xp\s+:=\s*10;[\s\S]{0,80}v_coins := 5;/);
});

test("a repeat updates xp only — no coins, no accuracy counters", () => {
  const s = stmts();
  const at = s.indexOf("IF v_is_repeat THEN", s.indexOf("IF v_correct THEN"));
  const repeatBranch = s.slice(at, s.indexOf("ELSE", at));
  assert.match(repeatBranch, /SET xp = COALESCE\(xp, 0\) \+ v_xp/);
  assert.ok(!/coins/.test(repeatBranch), "a repeat must not award coins");
  assert.ok(!/correct_answers/.test(repeatBranch),
    "a repeat must not move the counters teachers read as accuracy");
});

test("quest progress is skipped for repeats, streak is not", () => {
  const s = stmts();
  assert.match(s, /PERFORM public\.update_streak\(p_student_id\);/);
  assert.match(s, /IF NOT v_is_repeat THEN[\s\S]{0,600}update_quest_progress_for_answer[\s\S]{0,400}update_weekly_quest_progress_for_answer[\s\S]{0,200}END IF;/,
    "quest rewards are coins, so repeats must not advance them");
  // the streak call must sit outside that guard
  const streakAt = s.indexOf("update_streak");
  const guardAt = s.indexOf("IF NOT v_is_repeat THEN");
  assert.ok(streakAt < guardAt, "the streak is updated for every answer, repeat or not");
});

test("the text-answer path is untouched", () => {
  const s = stmts();
  assert.match(s, /IF v_instance\.answer_format = 'text' THEN[\s\S]{0,400}RETURN json_build_object\('status', 'pending', 'correct_answer', null\);/,
    "teacher-graded submissions must still go to the pending path unchanged");
});

test("no RLS policy, table, index, view or data change", () => {
  const s = stmts();
  for (const stmt of ["CREATE POLICY", "DROP POLICY", "ALTER POLICY", "CREATE TABLE",
                      "DROP TABLE", "CREATE INDEX", "DROP INDEX", "CREATE VIEW", "DROP VIEW",
                      "INSERT INTO", "DELETE FROM", "TRUNCATE"]) {
    assert.ok(!s.includes(stmt), `the migration must not contain ${stmt.trim()}`);
  }
  // the only UPDATE statements are inside the two functions, against question_instances
  // and student_progress — never a bulk data fix.
  assert.ok(!/UPDATE public\.question_instances\s+SET[^;]*WHERE student_id = v_uid;\s*$/m.test(s));
  assert.ok(!s.includes("get_unserved_questions"), "the existing selection RPC stays untouched");
});

test("only the two intended functions are defined", () => {
  const fns = [...stmts().matchAll(/FUNCTION public\.(\w+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(fns)].sort(),
    ["process_question_attempt", "request_repeat_question"]);
});

test("the migration sorts after every migration that touches these objects", () => {
  const dir = join(REPO, "supabase", "migrations");
  const executable = (body) => body
    .split(/\r?\n/).filter((l) => !l.trim().startsWith("--")).join("\n");
  const touching = readdirSync(dir)
    .filter((n) => /^\d{14}_.*\.sql$/.test(n))
    .filter((n) => /process_question_attempt|request_repeat_question|repeat_count/i.test(
      executable(readFileSync(join(dir, n), "utf8"))))
    .sort();
  assert.ok(touching.includes("20260928000000_quiz_repeat_when_pool_exhausted.sql"));
  assert.equal(touching[touching.length - 1],
    "20260928000000_quiz_repeat_when_pool_exhausted.sql", "it must apply last among them");
});

// ── The Edge Function ────────────────────────────────────────────────────────

test("the repeat step runs after due questions and after new questions", () => {
  const s = edge();
  const due    = s.indexOf("1. DUE QUESTIONS");
  const fresh  = s.indexOf("2. NEW QUESTIONS");
  const repeat = s.indexOf("3. REPEAT");
  const none   = s.indexOf('step: "no_questions"');
  assert.ok(due !== -1 && fresh !== -1 && repeat !== -1 && none !== -1);
  assert.ok(due < fresh && fresh < repeat && repeat < none,
    "a repeat is the last resort, reached only when nothing else can be served");
});

test("the Edge Function only attempts a repeat when nothing was inserted", () => {
  const s = edge();
  assert.match(s, /if \(!inserted\) \{[\s\S]{0,600}request_repeat_question/,
    "the repeat path must be gated on the new-question path having failed");
  assert.match(s, /\{ p_grade: selectedGrade, p_domains: activeDomains \}/,
    "the same grade and domain scope as the unserved query");
});

test("the repeat response is marked, and errors are not swallowed", () => {
  const s = edge();
  assert.match(s, /is_repeat: true/, "the client can tell a repeat from a fresh question");
  assert.match(s, /if \(repeatError\) throw repeatError;/);
  assert.match(s, /if \(repeatFetchError\) throw repeatFetchError;/);
});

test("the embedded question is normalised for both shapes, and the row is null-checked", () => {
  const s = edge();
  assert.match(s, /Array\.isArray\(embedded\) \? embedded\[0\] : embedded/,
    "PostgREST returns a to-one embed as an object while supabase-js types it as an array");
  assert.match(s, /Array\.isArray\(repeatRows\) && repeatRows\.length > 0/,
    "arrays are not data — length must be checked before [0]");
  assert.match(s, /if \(repeatRow\) \{/);
  assert.match(s, /rq && rq\.is_active !== false/,
    "an inactive question must never be re-served");
});
