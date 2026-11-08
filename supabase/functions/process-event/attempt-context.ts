// Lærligverse L5 + L3 in process-event: the activity mode and the hints used that K1's _v2 functions (migration
// 20261103110000) record in question_attempts — derived by the DATABASE from server facts (migration
// 20261108043500), never from the request body (docs/learning-progression-l1-contracts.md, Grundregel).
//
// SWITCH: the Edge secret LAERLIGVERSE_ATTEMPT_CONTEXT. Exactly "on" enables it; anything else (unset in
// production) keeps today's call: K1's _v2 with ./text-answer-rpc.ts L1_ATTEMPT_CONTEXT { quiz_v1, 0 }.
//
// ON (H5 path only — the legacy path has no mode or hints parameters): process-event calls the wrapper
// process_question_attempt_with_context / process_text_answer_with_context instead of _v2, with the same
// arguments minus p_mode and p_hints_used. In ONE transaction the wrapper locks the pupil's question_instances
// row FOR UPDATE (the row request_question_hint locks too), reads served_mode (NULL → quiz_v1) and counts the
// distinct hint levels logged for the round (at most 3), then calls K1's _v2 unchanged and returns its jsonb
// verbatim. So the count and the registration are one consistent operation: a hint that commits first is
// counted; one that waits on the lock finds the round answered and is refused. Process-event makes no extra
// read, and nothing here receives the body: `mode`, `served_mode` or `hints_used` from a client are ignored.
//
// It may only be turned on after migration 20261108043500 (and K1 before it) is applied: without the wrapper the
// call fails, process-event answers 500 and nothing is recorded (the existing _v2 error path).
//
// Pure TypeScript with no Deno or network imports, so the Node unit suite imports exactly this file.

export const ATTEMPT_CONTEXT_ENV = "LAERLIGVERSE_ATTEMPT_CONTEXT";

export function attemptContextEnabled(value: string | undefined | null): boolean {
  return value === "on";
}
