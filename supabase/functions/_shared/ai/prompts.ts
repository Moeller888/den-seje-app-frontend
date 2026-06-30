// ── AI prompts (versioned) (157K) ────────────────────────────────────────────
// Prompts live HERE, versioned, not inlined ad hoc (AI_GUIDELINES.md §4/§6). Each
// built prompt carries its version so a suggestion can be audited back to the exact
// prompt that produced it. Deterministic posture: the facade calls providers at
// temperature 0; prompts demand strict JSON-only, advisory output.

import type { GradeRequest, DraftFeedbackRequest } from "./types.ts";

export interface BuiltPrompt {
  text: string;
  version: string;
}

export const GRADE_PROMPT_VERSION = "grade.v1";
export const DRAFT_FEEDBACK_PROMPT_VERSION = "draft_feedback.v1";

function section(label: string, value?: string): string {
  return value && value.trim().length > 0 ? label + ":\n" + value.trim() + "\n\n" : "";
}

/** Build the advisory grading prompt. JSON-only, advisory, never authoritative. */
export function buildGradePrompt(input: GradeRequest): BuiltPrompt {
  const text = [
    "Du er en hjælpsom lærerassistent. Vurdér elevsvaret nedenfor RÅDGIVENDE.",
    "Du må ALDRIG tildele point, ændre data eller afgøre noget — du foreslår KUN til læreren.",
    "Returnér KUN gyldig JSON og intet andet:",
    '{"score": <heltal 1-4 eller null>, "label": <kort tekst>, "rationale": <kort begrundelse på dansk>, "confidence": <tal 0-1>}',
    "",
    section("Spørgsmål", input.questionText) +
      section("Rubrik", input.rubric) +
      section("Elevsvar", input.answer),
  ].join("\n");
  return { text, version: GRADE_PROMPT_VERSION };
}

/** Build the draft-feedback prompt. Plain text feedback for a teacher to edit. */
export function buildDraftFeedbackPrompt(input: DraftFeedbackRequest): BuiltPrompt {
  const text = [
    "Du er en hjælpsom lærerassistent. Skriv et UDKAST til venlig, opbyggelig feedback",
    "til eleven på dansk (aldrig nedladende). Det er KUN et udkast som læreren retter og godkender.",
    "Returnér KUN selve feedback-teksten, uden overskrifter.",
    "",
    section("Spørgsmål", input.questionText) +
      section("Rubrik", input.rubric) +
      section("Elevsvar", input.answer),
  ].join("\n");
  return { text, version: DRAFT_FEEDBACK_PROMPT_VERSION };
}
