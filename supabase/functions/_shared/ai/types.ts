// ── AI abstraction layer — shared types (157K) ───────────────────────────────
// The task-shaped request/result types feature code uses. Feature code depends on
// THESE, never on a provider's native output — so providers stay swappable.
// See docs/AI_GUIDELINES.md (binding rules) and docs/157k-ai-grading-contract.md.

/** Input for an advisory grade suggestion. The answer text is the only required field. */
export interface GradeRequest {
  answer: string;
  rubric?: string;
  questionText?: string;
  language?: string; // default "da"
}

/** A grade SUGGESTION for a teacher to confirm or override. Never applied automatically. */
export interface GradeSuggestion {
  score: number | null;       // suggested score (mirrors review-answer 1..4) or null
  label: string | null;       // short human label
  rationale: string | null;   // brief justification for the teacher
  confidence: number | null;  // 0..1
}

/** Input for draft teacher feedback. */
export interface DraftFeedbackRequest {
  answer: string;
  rubric?: string;
  questionText?: string;
  language?: string;
}

/** Draft feedback text for a teacher to edit. Never shown to a student unreviewed. */
export interface DraftFeedbackResult {
  feedback: string | null;
}

/**
 * The wrapper EVERY facade call returns. `available: false` means "no suggestion —
 * fall back to the human/deterministic path". The call NEVER throws and NEVER writes
 * anything; it is purely advisory.
 */
export interface AdvisoryResult<T> {
  available: boolean;
  data: T | null;
  providerId: string | null;
  model: string | null;
  promptVersion: string | null;
  /** Why unavailable (for logs/audit — not for end users). */
  reason: string | null;
  /** Lightweight audit signal: number of answer chars sent (no PII, no content). */
  inputChars: number | null;
}
