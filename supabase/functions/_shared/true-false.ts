// Sandt/falsk (true_false, F-02): the pupil reads one statement and answers "Sandt" or "Falsk". This
// file is the SERVER contract for the kind — stored content, the answer key and what an answer looks
// like. It decides nothing about rewards and does not grade: correctness is decided by
// public.process_question_attempt, exactly as for multiple choice (see "GRADING" below), so Sandt/falsk
// has no grading or reward path of its own.
//
// STORED CONTENT (questions row: answer_format "true_false", answer_type "short")
//   content.question     string, the STATEMENT the pupil judges ("Danmark erklærede Tyskland krig")
//   content.correct      exactly "Sandt" or "Falsk" — the option text, like an MC row's content.correct
//   review_text          recommended (metadata.review_text or content.review_text, as for every kind): WHY
//                        the statement is true or false. It is shown through the existing explanation flow
//                        after a wrong answer (process-event extractReviewText).
//   content.options      must be ABSENT: get-next-question's v1 path maps an unknown format to "mc", and a
//                        true_false row without options then fails the MC payload check and is skipped —
//                        it is never shown as plain multiple choice (and never padded with legacy years,
//                        js/answer-options.js).
// Nothing else in content is read.
//
// THE ANSWER KEY (question_instances.correct_answer, server-only)
// The key is content.correct itself, "Sandt" or "Falsk". get-next-question's normalizeContent already
// returns content.correct for any format that is not "mc" or "match", and toPublicQuestion (question-
// dto.ts) runs parseTrueFalseContent() BEFORE the instance is inserted, so a row with any other key is
// skipped, never served. The two options are shown in a fixed order (Sandt, Falsk) that says nothing
// about which one is right, so the browser receives only the statement.
//
// GRADING
// The browser sends the chosen option text. process-event routes answer_format "true_false" to the
// same RPC as MC (it is neither long, nor "text", nor "match"), and process_question_attempt /
// process_question_attempt_v2 grade it with public.normalize_choice_answer on both sides (the format
// contains neither "number" nor "text"), then award XP, coins, streak, quests and the reduced repeat
// award exactly as for MC. Proven offline in tests/unit/true-false-grading.test.mjs.
//
// EVIDENCE
// A random guess is right half the time (INTERACTION_KINDS.true_false.guessFloor = 0.5), so one correct
// answer is route information, never evidence of mastery (docs/learning-progression-design.md, the
// guess-floor table).
//
// Pure TypeScript with no Deno or network imports, so the Node unit suite tests exactly what the Edge
// Functions run.

export const TRUE_FALSE_FORMAT = "true_false";

// The two answers, in the order the browser shows them. js/true-false.js holds the same list; a unit
// test pins that they are identical.
export const TRUE_FALSE_OPTIONS: readonly ["Sandt", "Falsk"] = Object.freeze(["Sandt", "Falsk"] as const);

export type TrueFalseOption = (typeof TRUE_FALSE_OPTIONS)[number];
export type TrueFalseContent = { statement: string; correct: TrueFalseOption };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isTrueFalseOption(value: unknown): value is TrueFalseOption {
  return typeof value === "string" && (TRUE_FALSE_OPTIONS as readonly string[]).includes(value);
}

// The statement and the key, or a thrown Error naming what is wrong. Used when the public payload is
// built, so a row that breaks the contract is skipped rather than served.
export function parseTrueFalseContent(rawContent: unknown): TrueFalseContent {
  if (!isPlainObject(rawContent)) throw new Error("Invalid content");
  if (rawContent.options !== undefined) throw new Error("True/false question must not carry options");
  const statement = rawContent.question;
  if (typeof statement !== "string" || statement.trim().length === 0) throw new Error("Missing question text");
  // Exactly the option text: a key like "sandt", "true" or a boolean would still be graded by
  // normalize_choice_answer, but only one spelling may be stored, so every row means the same thing.
  if (!isTrueFalseOption(rawContent.correct)) throw new Error('True/false question needs correct "Sandt" or "Falsk"');
  return { statement, correct: rawContent.correct };
}

// The instance key (question_instances.correct_answer) for a stored row. Throws like parseTrueFalseContent.
export function trueFalseKey(rawContent: unknown): TrueFalseOption {
  return parseTrueFalseContent(rawContent).correct;
}

// Authoring check: contract errors (the row would be skipped) and warnings (it would be served, but does
// not follow the guidance). Never throws.
export function validateTrueFalseContent(rawContent: unknown, rawMetadata?: unknown): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  try {
    parseTrueFalseContent(rawContent);
  } catch (e) {
    errors.push((e as Error).message);
  }
  if (errors.length === 0) {
    const hasText = (v: unknown) => typeof v === "string" && v.trim().length > 0;
    const fromMeta = isPlainObject(rawMetadata) && hasText(rawMetadata.review_text);
    if (!fromMeta && !hasText((rawContent as Record<string, unknown>).review_text)) {
      warnings.push("review_text is recommended: explain why the statement is true or false");
    }
  }
  return { errors, warnings };
}
