// Answer key of a multiple-choice question: the stored correct answer must be gradable, i.e. a
// pupil clicking one of the options must be able to be scored correct.
//
// process_question_attempt compares the clicked option with question_instances.correct_answer
// (copied from content.correct by get-next-question) after a normalisation. Two rules exist:
//
//   legacy (production until D-290 G1 is applied, and again after its rollback):
//     trim(regexp_replace(lower(x), '[^a-z0-9]', '', 'g'))
//     so æ/ø/å, spaces and punctuation are dropped before comparing. legacyGradingKey() mirrors it.
//
//   G1 (20261101150000_grading_meaningful_characters, D-290): public.normalize_choice_answer(x),
//     the SQL twin of normalizeChoice() in supabase/functions/_shared/answer-normalize.ts
//     (parity-tested in answer-normalize-sql-parity.test.mjs). Letters (æ, ø, å …), digits,
//     apostrophes and punctuation all count; only case and whitespace runs are folded.
//     gradingKey() IS that function, imported — not a copy.
//
// isGradable() requires a gradable key under BOTH rules: the repository may hold G1 while production
// still runs the legacy rule (G1 needs its own owner authorisation), and a rollback returns to legacy.
// A question that only one rule can grade would be unanswerable on one side of that switch.
//
// Found 2026-10-22: two active questions whose correct answer differed from the intended option by
// one character ("velfærdstat"/"velfærdsstat", "tok"/"tog"), so no pupil could ever answer them
// correctly.

import { normalizeChoice } from "../../supabase/functions/_shared/answer-normalize.ts";

// The legacy rule, character for character.
export function legacyGradingKey(s) {
  if (typeof s !== "string") throw new Error("answer-key: value must be a string");
  return s.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

// The G1 rule: exactly normalizeChoice (SQL twin public.normalize_choice_answer).
export function gradingKey(s) {
  if (typeof s !== "string") throw new Error("answer-key: value must be a string");
  return normalizeChoice(s);
}

// Legacy: plain equality of the two keys, as the legacy SQL compares them.
function gradableLegacy(options, correct) {
  const k = legacyGradingKey(correct);
  return options.some((o) => legacyGradingKey(o) === k);
}

// G1: as isChoiceCorrect — an empty normalised key never matches anything.
function gradableG1(options, correct) {
  const k = gradingKey(correct);
  if (k === "") return false;
  return options.some((o) => gradingKey(o) === k);
}

// True when at least one option grades as the correct answer under the legacy rule AND under G1.
// Throws on malformed input — a question the check cannot read must not pass silently.
export function isGradable(options, correct) {
  if (!Array.isArray(options) || options.length < 2) {
    throw new Error("answer-key: options must be an array with at least 2 entries");
  }
  if (!options.every((o) => typeof o === "string")) {
    throw new Error("answer-key: every option must be a string");
  }
  if (typeof correct !== "string" || correct.trim().length === 0) {
    throw new Error("answer-key: correct must be a non-empty string");
  }
  return gradableLegacy(options, correct) && gradableG1(options, correct);
}
