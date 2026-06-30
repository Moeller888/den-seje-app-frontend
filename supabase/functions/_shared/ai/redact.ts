// ── AI input minimisation (157K) ─────────────────────────────────────────────
// Data minimisation before anything is sent to a provider (AI_GUIDELINES.md §3).
// We send ONLY what grading needs (answer + optional rubric/question), never names,
// emails, ids or surrounding context. The answer text is the content being graded,
// so it is sent — but obvious incidental PII patterns (email/phone) are redacted.

import type { GradeRequest, DraftFeedbackRequest } from "./types.ts";

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/g;
const MAX_ANSWER_CHARS = 8000;
const MAX_CONTEXT_CHARS = 4000;

function scrub(value: string): string {
  try {
    return value.replace(EMAIL_RE, "[redacted-email]").replace(PHONE_RE, "[redacted-number]");
  } catch (_e) {
    return value;
  }
}

function clampStr(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  return scrub(trimmed.slice(0, max));
}

/** Reduce a grade request to the minimal, scrubbed payload sent to a provider. */
export function minimiseGradeInput(req: GradeRequest): GradeRequest {
  const r = req && typeof req === "object" ? req : ({} as GradeRequest);
  return {
    answer: clampStr(r.answer, MAX_ANSWER_CHARS) ?? "",
    rubric: clampStr(r.rubric, MAX_CONTEXT_CHARS),
    questionText: clampStr(r.questionText, MAX_CONTEXT_CHARS),
    language: typeof r.language === "string" && r.language.length > 0 ? r.language : "da",
  };
}

/** Reduce a draft-feedback request to the minimal, scrubbed payload. */
export function minimiseFeedbackInput(req: DraftFeedbackRequest): DraftFeedbackRequest {
  return minimiseGradeInput(req as GradeRequest) as DraftFeedbackRequest;
}
