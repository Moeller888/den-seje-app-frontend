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
//   content.type        string display hint, when present
//   content.force_text  true, when present (renderer flag)
//   content.match       Match par only: { left, right } — two lists of item texts, the right list in
//                       the instance's shuffled order (_shared/match-pairs.ts). Never content.pairs,
//                       which names the right partner of every item.
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

export const PUBLIC_CONTENT_KEYS = Object.freeze(["question", "options", "type", "force_text", "match"] as const);

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
  type?: string;
  force_text?: true;
  match?: MatchLayout;
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
// "text", "match"). `instanceKey` is the instance's question_instances.correct_answer; only "match"
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
  }

  if (format === "match") {
    content.match = matchLayout(rawContent, instanceKey);
  }

  if (typeof rawContent.type === "string") content.type = rawContent.type;
  if (rawContent.force_text === true) content.force_text = true;

  return { content, metadata: publicMetadata(rawMetadata) };
}
