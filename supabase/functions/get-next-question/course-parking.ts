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
// ROLLBACK SAFETY (proven in laerligverse-rollback-matrix-migrations-run, scenarios 2/3/6b): parking sets next_review_at =
// 'infinity', so EVERY version of this function (also those before D-384) skips a parked round in its due loop — the
// ORDINARY quiz is safe with any version. The COURSE is not: an older version (or this one with the switch off) cannot
// resume a parked round and answers 409 in the course (open_question_exists), and a7450b0f serves an ordinary task there.
// The safe rollback target with parked rounds is THIS function with the switch on and the Lærligverse flags off. With the
// switch on before migration 20261124120000, every request fails (500): the switch follows the migration. See
// docs/decisions/D-384.md "Udrulning, tilbageførsel og nødstop".
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

// THE ACTIVATION (question_instances.activation_no, bumped by every resume). The SAME round — same id, same round_no — can
// be on screen in a tab opened BEFORE it was parked and in a tab that resumed it; neither round_no (H5) nor submission_id
// tells the two apart, and the production answer path (H5 off) carries neither. So the response carries the activation,
// the browser sends it back with the answer, and process-event (./../process-event/round-activation.ts) refuses an answer
// from an earlier activation before any answer function runs. A row without a valid number is a server fault (the
// migration is missing while the switch is on): it throws (500) instead of serving a round whose answer would be refused.
export function activationOf(row: { id?: unknown; activation_no?: unknown } | null | undefined): { activation_no: number } {
  const n = row?.activation_no;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0) {
    throw new Error(`Invalid activation_no on question instance ${String(row?.id ?? "?")}`);
  }
  return { activation_no: n };
}
