// D-341: is L1 K1 (migration 20261103110000, D-334) present in the isolated stack's schema?
//
// WHY: since #536, process-event ALWAYS passes p_mode/p_hints_used to the H5 functions
// (process-event/text-answer-rpc.ts L1_ATTEMPT_CONTEXT). The isolated stack replays the 7-parameter _v2
// (20261030211428, REPO_AHEAD_OF_PRODUCTION) but NOT K1 (NOT_IN_PRODUCTION, tests/isolated/schema/replay-plan.mjs).
// So in that stack every H5 submission (round_no + submission_id) must fail with 500 "Could not process answer",
// record nothing and pay nothing. The fix belongs to the K1/H5 owner (replay-plan or process-event), not here.
//
// The H5 specs keep their assertions unchanged and mark the H5-dependent tests as EXPECTED TO FAIL
// (test.fail) while K1 is absent: if they start passing without K1, the run turns red and the finding must be
// re-examined; once K1 is in the stack they run as ordinary tests again. A separate characterization test
// proves the fail-safe behaviour (500, no attempt, no reward, the round stays open).
export const K1_GAP = "D-341: L1 K1 is not in the isolated stack, so process-event's H5 call (p_mode/p_hints_used) cannot reach the 7-parameter _v2 — expected to fail until the K1/H5 owner closes the gap";

/** true = K1 columns exist; false = absent (PostgREST 400 for the unknown column); anything else fails loud. */
export async function k1InStack(request, supabaseUrl, serviceHeaders) {
  const r = await request.get(`${supabaseUrl}/rest/v1/question_attempts?select=mode,hints_used&limit=0`, { headers: serviceHeaders });
  if (r.status() === 200) return true;
  const body = await r.text();
  if (r.status() === 400 && /mode|hints_used|42703|PGRST204|does not exist/.test(body)) return false;
  throw new Error(`K1 probe: unexpected ${r.status()} ${body.slice(0, 200)}`);
}
