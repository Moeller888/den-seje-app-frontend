// D-384 (F8): an open COURSE round is parked when the pupil leaves the course, and resumed inside it.
//
// WHY. idx_one_open_question allows one unanswered round per pupil, and D-383 keeps an open course round (it is never
// released by a subject switch and only served inside the server sequence). Without parking, a pupil who leaves a course
// in the middle of a task gets "course_round_open" in every other subject — for good when Lærligverset is switched off.
// Closing the round as answered would move the sequence on without an answer; deleting it would lose its hints,
// presentation and snapshot. So the SAME row is parked (migration 20261124120000): it stays unanswered, keeps its id and
// everything served with it, and no longer counts as the pupil's ACTIVE open round.
//
// THE SWITCH. Edge secret LAERLIGVERSE_COURSE_PARKING, exactly "on" (only after migration 20261124120000). Anything else:
// no new RPC is called and no new column is read — the function behaves exactly as without D-384 (D-383's
// "course_round_open"). The switch is NOT a Lærligverse feature toggle: it must stay on while Lærligverset is off, so the
// ordinary quiz can park a course round that is still open.
//
// ROLLBACK SAFETY lives in the database, not here: parking sets next_review_at = 'infinity', so EVERY version of this
// function (also those before D-384) skips a parked round in its due loop (next_review_at <= now()). Switching this flag
// off, or deploying an older function, therefore never blocks a pupil on a parked round; the round simply waits until a
// D-384 function resumes it in its course. See docs/decisions/D-384.md "Tilbageførsel".
//
// Pure TypeScript with no Deno or network imports, so the Node unit suite imports exactly what the function runs.

export const COURSE_PARKING_ENV = "LAERLIGVERSE_COURSE_PARKING";

export function courseParkingEnabled(value: unknown): boolean {
  return value === "on";
}

export type RpcResult = { data: unknown; error: unknown };

const UNIQUE_VIOLATION = "23505";
const codeOf = (error: unknown): unknown => (error && typeof error === "object" ? (error as { code?: unknown }).code : undefined);

export type ParkResult =
  | { kind: "parked"; instanceId: string }
  | { kind: "not_parked" } // no active open course round (or it was answered/parked meanwhile): nothing changed
  | { kind: "conflict" }; // another round of the same course is already parked: nothing changed

/** The answer of park_open_course_round(p_student_id). Any other database error is thrown (500), never guessed. */
export function parkResultOf({ data, error }: RpcResult): ParkResult {
  if (error) {
    if (codeOf(error) === UNIQUE_VIOLATION) return { kind: "conflict" };
    throw error;
  }
  if (data === null || data === undefined) return { kind: "not_parked" };
  if (typeof data !== "string" || data.length === 0) throw new Error(`park_open_course_round: unexpected result ${JSON.stringify(data)}`);
  return { kind: "parked", instanceId: data };
}

export const RESUME_OUTCOMES = Object.freeze(["resumed", "none", "other_active", "wrong_step", "inactive"] as const);
export type ResumeOutcome = typeof RESUME_OUTCOMES[number];

/**
 * The answer of resume_parked_course_round(p_student_id, p_objective, p_step): inside the server sequence it parks an
 * active course round of ANOTHER course, then resumes this course's parked round in the server's step. An unknown answer
 * is a backend error, never a guess.
 */
export function resumeOutcomeOf({ data, error }: RpcResult): ResumeOutcome {
  if (error) throw error;
  if (typeof data !== "string" || !(RESUME_OUTCOMES as readonly string[]).includes(data)) {
    throw new Error(`resume_parked_course_round: unexpected result ${JSON.stringify(data)}`);
  }
  return data as ResumeOutcome;
}
