// Server-side answer evaluation — the authoritative check for typed answers.
//
// Pure functions only: no Deno APIs, no network, no Supabase client. That keeps the rules
// importable from Edge Functions AND from the Node unit suite (tests/unit/answer-evaluation.test.mjs),
// so what is tested is exactly what runs.
//
// Contract for short typed answers (Question Interaction Foundation, docs/ROADMAP.md):
//   - an answer is correct ONLY when it equals the correct answer or one of the question's
//     explicit `accepted_answers`, after normalisation;
//   - no substring/prefix matching ("app" is not "apple"), no fuzzy matching, no AI judgement;
//   - normalisation is deterministic and Unicode-safe, and never removes letters such as æ, ø, å.

// Typographic apostrophes produced by phone keyboards (’ ‘ ʼ) are the same keystroke as ' — a
// pupil typing "don’t" on an iPad has typed "don't". This is a fixed character mapping, not fuzz.
const APOSTROPHES = /[‘’ʼ]/g;

// Sentence punctuation a pupil may add after a one-word or one-sentence answer ("dog.", "Yes!").
// Only stripped at the very ends; punctuation inside the answer is part of the answer.
const EDGE_PUNCTUATION = /^[.,!?;:]+|[.,!?;:]+$/g;

export function normalizeTextAnswer(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFC")            // å typed as a + combining ring equals the precomposed å
    .replace(APOSTROPHES, "'")
    .toLowerCase()               // locale-independent: same result on every server
    .replace(/\s+/gu, " ")       // tabs, newlines, non-breaking spaces → one space
    .trim()
    .replace(EDGE_PUNCTUATION, "")
    .trim();
}

// The full set of normalised answers that count as correct: the correct answer plus every
// explicit accepted variant. Non-string and empty entries are ignored, never matched.
export function acceptedAnswerSet(correct: unknown, acceptedAnswers: unknown): Set<string> {
  const set = new Set<string>();
  const primary = normalizeTextAnswer(correct);
  if (primary) set.add(primary);
  if (Array.isArray(acceptedAnswers)) {
    for (const variant of acceptedAnswers) {
      const normalised = normalizeTextAnswer(variant);
      if (normalised) set.add(normalised);
    }
  }
  return set;
}

export function isTextAnswerCorrect(answer: unknown, correct: unknown, acceptedAnswers?: unknown): boolean {
  const given = normalizeTextAnswer(answer);
  if (!given) return false;
  return acceptedAnswerSet(correct, acceptedAnswers).has(given);
}
