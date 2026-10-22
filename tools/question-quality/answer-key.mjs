// Answer key of a multiple-choice question: the stored correct answer must be gradable, i.e. a
// pupil clicking one of the options must be able to be scored correct.
//
// process_question_attempt compares the clicked option with question_instances.correct_answer
// (copied from content.correct by get-next-question) after
//   trim(regexp_replace(lower(x), '[^a-z0-9]', '', 'g'))
// so æ/ø/å, spaces and punctuation are dropped before comparing. gradingKey() mirrors that; the
// regression test pins the SQL expression it mirrors.
//
// Found 2026-10-22: two active questions whose correct answer differed from the intended option by
// one character ("velfærdstat"/"velfærdsstat", "tok"/"tog"), so no pupil could ever answer them
// correctly.

export function gradingKey(s) {
  if (typeof s !== "string") throw new Error("answer-key: value must be a string");
  return s.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

// True when at least one option grades as the correct answer.
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
  const key = gradingKey(correct);
  return options.some((o) => gradingKey(o) === key);
}
