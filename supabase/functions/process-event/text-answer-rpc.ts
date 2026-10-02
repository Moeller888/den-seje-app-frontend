// The privileged half of process-event: ownership of the answered instance, and the one RPC that
// runs with the backend key.
//
// WHY A SEPARATE CLIENT
// process_text_answer trusts its caller: it takes p_user_id and p_is_correct as parameters and
// awards XP, coins, streak and quest progress from them. Calling it with the pupil's own JWT means
// EXECUTE has to stay granted to `authenticated`, and then a pupil can call it directly through the
// public REST endpoint with p_is_correct = true. The fix is to make it backend-only (a separate D-110
// migration revokes EXECUTE from PUBLIC, anon and authenticated). This module is the backend side:
// the RPC goes through an admin client built from the shared resolver's backend key, and only from here.
//
// WHAT STAYS USER-SCOPED
// Everything else in process-event — auth.getUser(), reading the question instance (RLS), the MC /
// number RPC and the long-answer save — keeps the pupil's own client. Only this one call is
// privileged, so RLS still decides what the pupil can see.
//
// SAFETY RULES ENFORCED HERE
//   * The admin client never receives the pupil's Authorization header. If it did, PostgREST would
//     run the call as `authenticated`, which the lockdown denies — and before the lockdown it would
//     silently keep the hole open.
//   * p_user_id and p_is_correct come only from the caller's server-side values (the verified
//     user.id and the evaluator's boolean). Nothing is read from the request body here.
//   * If the admin client cannot be built — the resolver throws on a missing or broken key
//     configuration — the error propagates. There is deliberately no fallback to the user client.
//
// Pure TypeScript with no Deno or network imports, so the Node unit suite can import exactly what
// the Edge Function runs (same arrangement as _shared/answer-evaluation.ts).

export type RpcResult = { data: unknown; error: unknown };
export type RpcClient = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<RpcResult> };

// Options for the admin client: a server-side, single-request client that never stores or refreshes
// a session. Global headers are intentionally absent — see "SAFETY RULES" above.
export const ADMIN_CLIENT_OPTIONS = Object.freeze({
  auth: Object.freeze({ persistSession: false, autoRefreshToken: false }),
});

// The answered instance must belong to the signed-in pupil. RLS already limits what the user client
// can read, but RLS also lets a teacher read their pupils' instances, and the admin client bypasses
// RLS entirely — so ownership is checked explicitly, before any answer path runs.
export function isInstanceOwner(instanceStudentId: unknown, userId: unknown): boolean {
  return typeof instanceStudentId === "string"
    && typeof userId === "string"
    && userId.length > 0
    && instanceStudentId === userId;
}

export type TextAnswerAward = {
  instanceId: string;
  userId: string;
  answer: string;
  isCorrect: boolean;
};

// Calls process_text_answer through a freshly built admin client. makeAdminClient is invoked only
// here, so the backend key is resolved only on the short-text path; if it throws, so does this.
export async function callProcessTextAnswer(
  makeAdminClient: () => RpcClient,
  award: TextAnswerAward,
): Promise<RpcResult> {
  const admin = makeAdminClient();
  return await admin.rpc("process_text_answer", {
    p_instance_id: award.instanceId,
    p_user_id: award.userId,
    p_user_answer: award.answer,
    p_is_correct: award.isCorrect === true,
  });
}
