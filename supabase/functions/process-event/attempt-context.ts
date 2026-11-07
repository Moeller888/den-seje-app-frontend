// Lærligverse L5 + L3 in process-event: the activity mode and the hints used that the H5 _v2 functions (K1,
// migration 20261103110000) record in question_attempts — derived from SERVER facts only (migration
// 20261108043500), never from the request body (docs/learning-progression-l1-contracts.md, Grundregel).
//
// SWITCH: the Edge secret LAERLIGVERSE_ATTEMPT_CONTEXT. Exactly "on" enables it; anything else (unset in
// production) keeps today's constants, ./text-answer-rpc.ts L1_ATTEMPT_CONTEXT { quiz_v1, 0 }, and process-event
// makes exactly the calls it made before (same grading read, same _v2 arguments, no extra read). It may only be
// turned on after migration 20261108043500 (and K1 before it) is applied: the read below names a column and a
// table that do not exist before — switched on too early, every H5 answer is a 500 and nothing is recorded.
//
// ON (H5 path only — the legacy path has no mode or hints parameters), one separate backend read right before
// the _v2 call, scoped to the instance, the verified pupil and the round the answer names:
//   * mode       = question_instances.served_mode (written by get-next-question with LAERLIGVERSE_SERVED_MODE=on
//                  for a server-directed sequence step; NULL for every other round) → NULL gives "quiz_v1", which
//                  is never evidence. Any other value is a server contract break (500), never a silent default.
//   * hints_used = the number of DISTINCT hint levels in question_hint_requests for (instance, pupil, round_no)
//                  at the moment of the read, i.e. requested before the answer is processed, capped at 3.
// The request body is not an input here: nothing in this module receives it, so `mode`, `served_mode` or
// `hints_used` sent by a client are ignored (tests/unit/laerligverse-attempt-context-process-event.test.mjs).
//
// KNOWN LIMIT (documented, not hidden): the count is read in its own statement before the _v2 call. A hint request
// that commits in the milliseconds between that read and _v2's transaction is logged but not counted in this
// attempt. request_question_hint locks the instance row and refuses an answered round, so a hint can never be
// logged AFTER the answer; closing the window completely needs the count inside _v2's transaction (a K1-owner
// change). The log itself stays complete, so a teacher view can always recount from it.
//
// Pure TypeScript with no Deno or network imports, so the Node unit suite imports exactly this file.

import { L1_ATTEMPT_CONTEXT } from "./text-answer-rpc.ts";

export const ATTEMPT_CONTEXT_ENV = "LAERLIGVERSE_ATTEMPT_CONTEXT";

export function attemptContextEnabled(value: string | undefined | null): boolean {
  return value === "on";
}

export type AttemptContext = { readonly mode: string; readonly hintsUsed: number };

const SERVED_MODES: ReadonlySet<string> = new Set(["quiz_v1", "practice", "check", "review", "application"]);

/** served_mode → the attempt's mode. NULL/absent → quiz_v1; an unknown value → null (a contract break). */
export function attemptModeOf(servedMode: unknown): string | null {
  if (servedMode === null || servedMode === undefined) return L1_ATTEMPT_CONTEXT.mode;
  return typeof servedMode === "string" && SERVED_MODES.has(servedMode) ? servedMode : null;
}

/** Hint log rows → the number of distinct levels 1..3 (capped at 3), or null when a row is malformed. */
export function hintsUsedOf(rows: unknown): number | null {
  if (!Array.isArray(rows)) return null;
  const levels = new Set<number>();
  for (const r of rows) {
    const level = typeof r === "object" && r !== null ? (r as Record<string, unknown>).hint_level : undefined;
    if (typeof level !== "number" || !Number.isInteger(level) || level < 1 || level > 3) return null;
    levels.add(level);
  }
  return Math.min(3, levels.size);
}

export type AttemptFacts = { instance: unknown; hintRows: unknown; error: unknown };

export type FactsClient = {
  from: (table: string) => {
    // deno-lint-ignore no-explicit-any
    select: (columns: string) => any;
  };
};

// The two server facts, through a freshly built backend admin client (the hint log has no client privileges at
// all, and served_mode none for the API roles). The instance read is scoped to id AND the verified pupil; the
// hint read to instance, pupil and round. A failed first read skips the second.
export async function readAttemptFacts(
  makeAdminClient: () => FactsClient,
  key: { instanceId: string; studentId: string; roundNo: number },
): Promise<AttemptFacts> {
  const admin = makeAdminClient();
  const inst = await admin
    .from("question_instances")
    .select("served_mode")
    .eq("id", key.instanceId)
    .eq("student_id", key.studentId)
    .maybeSingle();
  if (inst.error) return { instance: null, hintRows: null, error: inst.error };
  const hints = await admin
    .from("question_hint_requests")
    .select("hint_level")
    .eq("question_instance_id", key.instanceId)
    .eq("student_id", key.studentId)
    .eq("round_no", key.roundNo);
  return { instance: inst.data, hintRows: hints.data, error: hints.error };
}

export function attemptContextOf(facts: AttemptFacts):
  | { ok: true; mode: string; hintsUsed: number }
  | { ok: false; problem: "read failed" | "instance missing" | "unknown served_mode" | "malformed hint log" } {
  if (facts.error) return { ok: false, problem: "read failed" };
  if (typeof facts.instance !== "object" || facts.instance === null) return { ok: false, problem: "instance missing" };
  const mode = attemptModeOf((facts.instance as Record<string, unknown>).served_mode);
  if (mode === null) return { ok: false, problem: "unknown served_mode" };
  const hintsUsed = hintsUsedOf(facts.hintRows);
  if (hintsUsed === null) return { ok: false, problem: "malformed hint log" };
  return { ok: true, mode, hintsUsed };
}
