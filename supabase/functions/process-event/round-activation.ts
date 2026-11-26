// D-384 (F8): an answer from an EARLIER ACTIVATION of a course round is refused — the stale-tab protection.
//
// THE CASE. A course round is on screen in tab A. The pupil leaves the course (the round is parked), works in another
// subject, and later resumes the course in tab B: the SAME round (same id, same round_no, same snapshot) is active again.
// A delayed or late answer from tab A then names exactly the round tab B is answering. Neither round_no (H5) nor
// submission_id separates them — and the production answer path (H5 off) carries neither. First-answer-wins would let
// whichever arrives first count, which may be the answer to the presentation the pupil had already left.
//
// THE RULE. question_instances.activation_no counts the round's resumes (migration 20261124160000; only
// resume_parked_course_round writes it). get-next-question hands it out with the round (switch on); the browser sends it
// back as `activation_no`. Before ANY answer function is called:
//   * row 0 (never resumed): accepted with no number (every existing client) or with 0;
//   * row n > 0 (resumed):   accepted only with exactly n; no number, or another number → 409 stale_activation.
// Nothing is read, written or paid for a refused answer. The pupil's browser shows a Danish text and loads the round
// again (the current activation), so nothing is lost.
//
// ATOMIC IN THE DATABASE. The check above is a read before the answer function's own transaction, so a park AND a
// resume that both complete inside that gap would otherwise let the older answer through. The answer call therefore
// carries the activation it was checked against in the header ACTIVATION_HEADER (activationClientHeaders); PostgREST
// puts the call's headers in request.headers for that call's transaction, and the trigger question_instances_parked_guard
// (migration 20261124160000) compares it with the LOCKED row's activation_no inside the answer function's own UPDATE.
// A mismatch is SQLSTATE LQ410 'stale_activation': the whole answer is rolled back (nothing recorded or paid), and
// isStaleActivationError turns it into the same 409 as the read check. The read check stays the fast path.
//
// THE SWITCH is the same Edge secret as get-next-question's: LAERLIGVERSE_COURSE_PARKING, exactly "on" (only after
// migration 20261124160000). Off: no column is read and nothing is checked — exactly the behaviour before D-384.
//
// Pure TypeScript with no Deno or network imports, so the Node tests import exactly what the function runs.

export const COURSE_PARKING_ENV = "LAERLIGVERSE_COURSE_PARKING";

export function activationCheckEnabled(value: unknown): boolean {
  return value === "on";
}

// int4: the column's type. A larger number cannot be a real activation.
const INT4_MAX = 2147483647;
const isActivation = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= INT4_MAX;

export type ActivationVerdict =
  | { kind: "accept" }
  | { kind: "stale"; expected: number; given: number | null }
  | { kind: "invalid" } // the request's activation_no is not a whole number ≥ 0
  | { kind: "server_fault" }; // the row has no valid activation_no (migration missing while the switch is on)

/** The request's `activation_no` (absent = null) against the row's. */
export function activationVerdict(given: unknown, rowValue: unknown): ActivationVerdict {
  if (!isActivation(rowValue)) return { kind: "server_fault" };
  const g = given === undefined || given === null ? null : given;
  if (g !== null && !isActivation(g)) return { kind: "invalid" };
  if (g === null ? rowValue === 0 : g === rowValue) return { kind: "accept" };
  return { kind: "stale", expected: rowValue, given: g as number | null };
}

// The header the answer call carries (lower case: PostgREST's request.headers keys are lower case).
export const ACTIVATION_HEADER = "x-laerlig-activation-no";
export const STALE_ACTIVATION_SQLSTATE = "LQ410";
export const STALE_ACTIVATION_MESSAGE = "stale_activation";

/** The headers for the answer call's backend client: the activation the read check accepted (the row's value). */
export function activationClientHeaders(rowValue: unknown): Record<string, string> {
  if (!isActivation(rowValue)) throw new Error("activationClientHeaders: not a valid activation_no");
  return { [ACTIVATION_HEADER]: String(rowValue) };
}

/** The trigger's refusal (the round was resumed between the read check and the answer function's UPDATE). */
export function isStaleActivationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return code === STALE_ACTIVATION_SQLSTATE || message === STALE_ACTIVATION_MESSAGE;
}

/** The reply for a refused stale answer (stable, machine-readable; js/answer-submission.js lists it as a refusal). */
export function staleActivationReply(): { status: number; body: Record<string, unknown> } {
  return { status: 409, body: { outcome: "stale_activation", error: "Stale activation" } };
}
