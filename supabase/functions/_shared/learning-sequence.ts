// Server-directed learning sequence for ONE learning objective (Lærligverse F6, D-338). Pure TypeScript with
// no Deno or network imports: get-next-question runs it, the Node unit suite tests it, and the local
// demo's test adapter runs the very same file (generated JS), so the demo cannot drift from the server.
//
// WHAT IT DECIDES. Given the pupil's own SERVER history in the objective (question_instances joined with the
// question's step tag), which learning step comes next — or that the pupil must wait (revisit), or that the
// sequence is complete. The client never decides the step: a client that asks for another step is refused.
//
// WHAT IT DOES NOT DECIDE. Mastery, level, evidence, reward. A step being "complete" means only "an answer
// for that step has been recorded"; it says nothing about learning (D-330: a correct answer is not
// documented learning). There is no skipping rule: every step is served, except revision, which the policy
// inserts only after an incorrect guided-practice answer.
//
// STATUS. The transitions below are an explicit, PROVISIONAL TEST POLICY ("laerligverse-test-policy-v0").
// The real rules are an owner decision (LP-13). The step ids are this prototype's; the activity modes are
// D-277's enum (quiz_v1 | diagnostic | practice | check | review | application), the vocabulary L1 K1 (#536)
// records in question_attempts.mode.
//
// Introduction and exploration are NOT server steps: the server records no exposure today (LPD §5.3), so it
// cannot know them, and it must not pretend to.

export const POLICY_ID = "laerligverse-test-policy-v0";

export type StepId = "guided_practice" | "revision" | "independent_application" | "transfer" | "revisit";
export type Mode = "practice" | "check" | "review" | "application";

export interface StepDef {
  readonly id: StepId;
  /** D-277 activity mode the server declares for an item of this step. */
  readonly mode: Mode;
  /** Teaching / practice / assessment — what the step is FOR. */
  readonly kind: "practice" | "assessment";
  /** May an answer in this step ever become learning evidence (subject to K4/K5 and registered help)? */
  readonly mayBecomeEvidence: boolean;
}

export const STEPS: readonly StepDef[] = Object.freeze([
  { id: "guided_practice", mode: "practice", kind: "practice", mayBecomeEvidence: false },
  { id: "revision", mode: "practice", kind: "practice", mayBecomeEvidence: false },
  { id: "independent_application", mode: "check", kind: "assessment", mayBecomeEvidence: true },
  { id: "transfer", mode: "application", kind: "assessment", mayBecomeEvidence: true },
  { id: "revisit", mode: "review", kind: "assessment", mayBecomeEvidence: true },
] as const);

export const STEP_IDS: readonly StepId[] = Object.freeze(STEPS.map((s) => s.id));

/** PROPOSAL (LPD §4.3, a heuristic): the revisit is due this long after the transfer was answered. */
export const REVISIT_AFTER_HOURS = 20;

export function stepDef(id: StepId): StepDef {
  return STEPS.find((s) => s.id === id) as StepDef;
}

/** The step tag of a question (questions.metadata.learning_step), or null when untagged/unknown. */
export function stepOf(metadata: unknown): StepId | null {
  if (typeof metadata !== "object" || metadata === null) return null;
  const v = (metadata as Record<string, unknown>).learning_step;
  return typeof v === "string" && (STEP_IDS as readonly string[]).includes(v) ? (v as StepId) : null;
}

/** One SERVER fact: an instance the pupil was served in this objective. */
export interface HistoryEntry {
  readonly step: StepId | null;
  readonly answered: boolean;
  readonly wasCorrect: boolean | null;
  readonly answeredAt: string | null;
}

export type SequenceDecision =
  | { readonly state: "step"; readonly step: StepId; readonly mode: Mode; readonly policy: string }
  | { readonly state: "waiting"; readonly step: "revisit"; readonly dueAt: string; readonly policy: string }
  | { readonly state: "complete"; readonly policy: string };

const answeredIn = (h: readonly HistoryEntry[], step: StepId) =>
  h.filter((e) => e.step === step && e.answered).sort((a, b) => Date.parse(a.answeredAt ?? "") - Date.parse(b.answeredAt ?? ""));

const at = (step: StepId): SequenceDecision => ({ state: "step", step, mode: stepDef(step).mode, policy: POLICY_ID });

/**
 * The next step for the pupil, from the server's own history only. Deterministic; unanswered instances
 * do not move the sequence (an open round is resumed in its own step by the caller).
 */
export function nextStep(history: readonly HistoryEntry[], nowMs: number): SequenceDecision {
  const practice = answeredIn(history, "guided_practice");
  if (practice.length === 0) return at("guided_practice");
  // Revision is inserted only when the LATEST guided-practice answer was incorrect (test policy v0).
  const latestPractice = practice[practice.length - 1] as HistoryEntry;
  if (latestPractice.wasCorrect === false && answeredIn(history, "revision").length === 0) return at("revision");
  if (answeredIn(history, "independent_application").length === 0) return at("independent_application");
  const transfer = answeredIn(history, "transfer");
  if (transfer.length === 0) return at("transfer");
  if (answeredIn(history, "revisit").length > 0) return { state: "complete", policy: POLICY_ID };
  const due = Date.parse((transfer[0] as HistoryEntry).answeredAt ?? "") + REVISIT_AFTER_HOURS * 3_600_000;
  if (!Number.isFinite(due)) return { state: "waiting", step: "revisit", dueAt: "unknown", policy: POLICY_ID };
  return nowMs >= due ? at("revisit") : { state: "waiting", step: "revisit", dueAt: new Date(due).toISOString(), policy: POLICY_ID };
}

/**
 * A client may NAME the step it expects (to detect a stale view), never CHOOSE one. Anything but the
 * server's current step is refused.
 */
export function checkRequestedStep(requested: unknown, decision: SequenceDecision):
  | { ok: true }
  | { ok: false; status: 400 | 409; error: "invalid_learning_step" | "learning_step_not_current" } {
  if (requested === undefined || requested === null) return { ok: true };
  if (typeof requested !== "string" || !(STEP_IDS as readonly string[]).includes(requested)) return { ok: false, status: 400, error: "invalid_learning_step" };
  if (decision.state !== "step" || decision.step !== requested) return { ok: false, status: 409, error: "learning_step_not_current" };
  return { ok: true };
}

/** question_instances rows (answered, was_correct, answered_at, questions{metadata}) → history. */
export function historyFromRows(rows: unknown): HistoryEntry[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => {
    const row = (typeof r === "object" && r !== null ? r : {}) as Record<string, unknown>;
    const q = (typeof row.questions === "object" && row.questions !== null ? row.questions : {}) as Record<string, unknown>;
    return {
      step: stepOf(q.metadata),
      answered: row.answered === true,
      wasCorrect: typeof row.was_correct === "boolean" ? row.was_correct : null,
      answeredAt: typeof row.answered_at === "string" ? row.answered_at : null,
    };
  });
}

// ── LP-13 / K9 PROTOTYPE: an introduction step (OFF unless a caller passes { introduction: true }) ────────────
// docs/laerligverse/eksponering-datakontrakt.md. Nothing above changes: STEPS, stepOf, nextStep and historyFromRows
// behave byte for byte as before, and get-next-question does not call anything below (no flag reads it yet).
//
// The introduction is a server step WITHOUT an answer: it is "done" when the server registered that its content was
// PRESENTED (question_instances.presented_at, set by mark_presented, migration 20261109043500) — never because a
// client says it was read. "Presented" is not "understood" and is never evidence (D-330); it only lets the sequence
// move on. A row counts only when its question is tagged learning_step = "introduction" AND presented_at is set.

export const INTRODUCTION_STEP = "introduction" as const;

export interface IntroductionOptions {
  readonly introduction?: boolean;
}

export type IntroductionDecision = { readonly state: "introduction"; readonly step: typeof INTRODUCTION_STEP; readonly policy: string };

/** question_instances rows (presented_at, questions{metadata}) → has an introduction of this objective been presented? */
export function introductionPresented(rows: unknown): boolean {
  if (!Array.isArray(rows)) return false;
  return rows.some((r) => {
    const row = (typeof r === "object" && r !== null ? r : {}) as Record<string, unknown>;
    const q = (typeof row.questions === "object" && row.questions !== null ? row.questions : {}) as Record<string, unknown>;
    const meta = (typeof q.metadata === "object" && q.metadata !== null ? q.metadata : {}) as Record<string, unknown>;
    return meta.learning_step === INTRODUCTION_STEP && typeof row.presented_at === "string" && row.presented_at.length > 0;
  });
}

/**
 * With { introduction: true }: a pupil whose introduction has not been PRESENTED gets the introduction first; after
 * that, exactly nextStep. Without the option (or false): exactly nextStep(historyFromRows(rows), nowMs).
 */
export function nextStepWithIntroduction(rows: unknown, nowMs: number, options: IntroductionOptions = {}): SequenceDecision | IntroductionDecision {
  if (options.introduction === true && !introductionPresented(rows)) {
    return { state: "introduction", step: INTRODUCTION_STEP, policy: POLICY_ID };
  }
  return nextStep(historyFromRows(rows), nowMs);
}
