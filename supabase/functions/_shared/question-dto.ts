// The browser-facing question payload: the ONLY shape a question may have when it leaves the server
// before the pupil has answered.
//
// WHY A WHITELIST
// questions.content mixes what is needed to SHOW a question with what is needed to GRADE it:
// `correct`, `accepted_answers`, `facit`, `tolerance`, `criteria`, and `review_text` (the explanation
// shown after a wrong answer). get-next-question used to return content almost as stored, so the
// answer key reached the browser with every question (audit finding E1, 2026-10-16). Removing named
// fields one by one would leave the next new key field exposed by default, so the payload is BUILT
// from an explicit list of display fields instead: anything not listed here never leaves.
//
// THE CONTRACT
//   content.question    string, required, non-empty
//   content.options     MC only: the visible choices, strings only, at least two — never a marker of
//                       which one is right
//   content.option_details  MC only, when present (D-332): one description per option, same order —
//                       the "back of the document" a source-criticism task shows (sender, time, recipient,
//                       purpose, context). Display text, like the options themselves; never a marker of
//                       which option is right. Malformed → the question is refused as bad content.
//   content.type        string display hint, when present
//   content.force_text  true, when present (renderer flag)
//   content.match       Match par only: { left, right } — two lists of item texts, the right list in
//                       the instance's shuffled order (_shared/match-pairs.ts). Never content.pairs,
//                       which names the right partner of every item.
//   content.stimulus    when present: the material shown before the question — a source excerpt, an
//                       image or an audio clip — built field by field by _shared/stimulus.ts (F-07).
//                       Any format may carry one; it never changes grading.
//   (Sandt/falsk)       answer_format "true_false" sends content.question (the statement) and nothing
//                       else of its own: the two answers are fixed ("Sandt", "Falsk", _shared/true-false.ts)
//                       and never carry a marker. The stored content is checked against the contract
//                       here, before the instance is inserted, so a row with a bad key is skipped.
//   metadata            only the pedagogical tags listed in PUBLIC_METADATA_KEYS
// Grading data stays server-side: process-event grades against question_instances.correct_answer
// and questions.content read through the backend client, and only reveals the correct answer and
// review text in its response AFTER the answer has been recorded.
//
// A new interaction type that needs more display data extends this file deliberately — and its
// test — rather than passing content through.
//
// Pure TypeScript with no Deno or network imports, so the Node unit suite tests exactly what the
// Edge Functions run.

import { matchLayout, type MatchLayout } from "./match-pairs.ts";
import { orderLayout, type OrderLayout } from "./order-items.ts";
import { publicStimulus, type PublicStimulus } from "./stimulus.ts";
import { parseTrueFalseContent, TRUE_FALSE_FORMAT } from "./true-false.ts";

export const PUBLIC_CONTENT_KEYS = Object.freeze(["question", "options", "option_details", "type", "force_text", "match", "order", "stimulus"] as const);

/** D-332: upper bound per option description — the same bound the Lærligverse bridge protocol enforces. */
export const MAX_OPTION_DETAIL_CHARS = 400;

export const PUBLIC_METADATA_KEYS = Object.freeze([
  "difficulty_type",
  "cognitive_skill",
  "challenge_role",
  "insight_type",
  "concepts",
  "domain",
] as const);

export type PublicContent = {
  question: string;
  options?: string[];
  option_details?: string[];
  type?: string;
  force_text?: true;
  match?: MatchLayout;
  order?: OrderLayout;
  stimulus?: PublicStimulus;
};

export type PublicQuestion = {
  content: PublicContent;
  metadata: Record<string, unknown> | null;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function publicMetadata(raw: unknown): Record<string, unknown> | null {
  if (!isPlainObject(raw)) return null;
  const out: Record<string, unknown> = {};
  for (const key of PUBLIC_METADATA_KEYS) {
    const value = raw[key];
    if (typeof value === "string") out[key] = value;
    else if (Array.isArray(value) && value.every((v) => typeof v === "string")) out[key] = [...value];
  }
  return Object.keys(out).length > 0 ? out : null;
}

// Builds the public payload for one question. `format` is the mapped answer format ("mc", "number",
// "text", "match", "true_false"). `instanceKey` is the instance's question_instances.correct_answer; only "match"
// reads it, to lay out the shuffled right column — it is never copied into the payload. Throws on
// content the client could not render, exactly like the server-side normalisation it sits next to, so a
// bad row is skipped rather than served half-built.
export function toPublicQuestion(rawContent: unknown, format: string, rawMetadata: unknown, instanceKey?: unknown): PublicQuestion {
  if (!isPlainObject(rawContent)) {
    throw new Error("Invalid content");
  }

  const question = rawContent.question;
  if (typeof question !== "string" || question.trim().length === 0) {
    throw new Error("Missing question text");
  }

  const content: PublicContent = { question };

  if (format === "mc") {
    const options = rawContent.options;
    if (!Array.isArray(options) || options.length < 2) {
      throw new Error("MC question missing valid options");
    }
    if (!options.every((o) => typeof o === "string")) {
      // An option that is not plain text could carry a marker of the right answer.
      throw new Error("MC question has a non-text option");
    }
    content.options = [...options];
    // D-332: optional per-option descriptions. Absent on every existing question → payload unchanged.
    const details = rawContent.option_details;
    if (details !== undefined) {
      if (
        !Array.isArray(details) || details.length !== options.length ||
        !details.every((t) => typeof t === "string" && t.trim().length > 0 && t.length <= MAX_OPTION_DETAIL_CHARS)
      ) {
        throw new Error("MC question has invalid option_details");
      }
      content.option_details = [...details];
    }
  }

  if (format === "match") {
    content.match = matchLayout(rawContent, instanceKey);
  }

  if (format === TRUE_FALSE_FORMAT) {
    // Validation only: the statement is content.question above; the key never leaves.
    parseTrueFalseContent(rawContent);
  }

  // Rækkefølge: the item texts in the instance's SHOWN order and the kind of sequence — never
  // content.items, whose order is the facit (_shared/order-items.ts).
  if (format === "order") {
    content.order = orderLayout(rawContent, instanceKey);
  }

  if (typeof rawContent.type === "string") content.type = rawContent.type;
  if (rawContent.force_text === true) content.force_text = true;
  // A stimulus that breaks its contract throws here, so the row is skipped, never served without it.
  if (rawContent.stimulus !== undefined) content.stimulus = publicStimulus(rawContent.stimulus);

  return { content, metadata: publicMetadata(rawMetadata) };
}
