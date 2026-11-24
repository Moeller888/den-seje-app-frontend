// D-384 (F8): an answer to a PARKED course round (migration 20261124120000) — how the database's refusal becomes a
// controlled HTTP reply in process-event.
//
// THE ENFORCEMENT IS IN THE DATABASE, NOT HERE
// The trigger question_instances_parked_guard refuses every write that would answer a parked round, with SQLSTATE LQ409
// and the message 'course_round_parked' (the CHECK question_instances_parked_is_open is the hard floor behind it). The
// error happens inside the answer function's transaction, so nothing was recorded or paid when process-event sees it.
// This module only recognises the error and shapes the reply; it decides nothing. A client calling the backend directly
// hits the same trigger.
//
// WHEN IT HAPPENS: the round was served in one tab, and the pupil then left the course in another (the ordinary quiz
// parked it). The answer is refused; the course resumes the same round later, where it can be answered once.
//
// THE REPLY (stable, machine-readable; js/answer-submission.js lists it as a refusal):
//   409 { outcome: "round_parked", error: "Round parked" }
//
// Pure TypeScript with no Deno or network imports, so the Node tests import exactly what the function runs.

export const ROUND_PARKED_SQLSTATE = "LQ409";
export const ROUND_PARKED_MESSAGE = "course_round_parked";

export function isRoundParkedError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return code === ROUND_PARKED_SQLSTATE || message === ROUND_PARKED_MESSAGE;
}

export function roundParkedReply(): { status: number; body: Record<string, unknown> } {
  return { status: 409, body: { outcome: "round_parked", error: "Round parked" } };
}
