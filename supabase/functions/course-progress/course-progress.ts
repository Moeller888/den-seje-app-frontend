// Lærligverse (Arkivskabet): the course-progress Edge Function's pure half — the switch, the request contract,
// the one privileged RPC and how its jsonb becomes the HTTP reply. Pure TypeScript with no Deno or network
// imports, so the Node unit suite imports exactly what the function runs (same arrangement as
// request-hint/hint-request.ts on the L3 branch and process-event/answer-v2.ts).
//
// WHY A SEPARATE FUNCTION (not a route in process-event or get-next-question): both have release gates and their
// own deploy history, and process-event is being changed elsewhere. A course reward is neither an answer nor a
// served question: it is computed AFTER the answer, from what the server already recorded. A separate function
// keeps both answer paths byte for byte unchanged, is deployed and switched on independently, and can be removed
// without touching them.
//
// SWITCH: the Edge secret LAERLIGVERSE_COURSE_REWARDS. Exactly "on" enables it; anything else (unset in
// production) answers 404 { outcome: "course_rewards_disabled" } before any client is built — no user lookup,
// nothing read or written. It may only be turned on after migration 20261108171500 is applied
// (award_course_milestones does not exist before).
//
// REQUEST (POST, the pupil's JWT in Authorization, like every other function):
//   { learning_objective: string (1–200 characters after trimming) }
// Every other body field — a student id, a step, a claimed result — is ignored. The pupil is the verified user.
// The client never says WHAT was earned: the database recomputes it from the pupil's own server history.
//
// THE RPC: public.award_course_milestones (SECURITY INVOKER, EXECUTE for service_role only) through the backend
// admin client — no pupil Authorization header, no session — with p_student_id = the verified user.id.
//
// OUTCOMES → HTTP
//   awarded / nothing_new      200 { outcome, learning_objective, awarded: [...], xp_awarded, coins_awarded }
//   not_a_course_objective     404 { outcome, error }
//   not_a_student              403 { outcome, error }
//   no_progress_row            409 { outcome, error }
//   reward_path_not_ready      503 { outcome, error } — the double-pay guard: the reward RPCs still pay course
//                              answers per answer (docs/laerligverse/forslag-k1-belonning-kursussvar.md); nothing
//                              is written
//   invalid_request            400 { outcome, error, reason? }
// Anything else — an unknown outcome, a malformed result, a database error — is a 500 that names no database
// detail. A reply is validated before it leaves: amounts are non-negative integers and add up.

export const COURSE_REWARDS_ENV = "LAERLIGVERSE_COURSE_REWARDS";

export function courseRewardsEnabled(value: string | undefined | null): boolean {
  return value === "on";
}

export const COURSE_REWARDS_DISABLED = Object.freeze({ outcome: "course_rewards_disabled", error: "Course rewards are not enabled" });
export const UNEXPECTED_RESULT = Object.freeze({ error: "Could not process course progress" });

const MAX_OBJECTIVE = 200;
const KINDS: ReadonlySet<string> = new Set(["step_completed", "check_passed", "sequence_completed", "course_milestone"]);

export function parseCourseProgressRequest(body: unknown):
  | { ok: true; objective: string }
  | { ok: false; reason: "invalid_body" | "invalid_objective" } {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return { ok: false, reason: "invalid_body" };
  const v = (body as Record<string, unknown>).learning_objective;
  if (typeof v !== "string") return { ok: false, reason: "invalid_objective" };
  const objective = v.trim();
  if (objective.length === 0 || objective.length > MAX_OBJECTIVE) return { ok: false, reason: "invalid_objective" };
  return { ok: true, objective };
}

export type RpcResult = { data: unknown; error: unknown };
export type RpcClient = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<RpcResult> };

export const ADMIN_CLIENT_OPTIONS = Object.freeze({
  auth: Object.freeze({ persistSession: false, autoRefreshToken: false }),
});

// makeAdminClient is invoked only here; if the key cannot be resolved it throws, and so does this — never a
// fallback to the user client.
export async function callAwardCourseMilestones(
  makeAdminClient: () => RpcClient,
  studentId: string,
  objective: string,
): Promise<RpcResult> {
  const admin = makeAdminClient();
  return await admin.rpc("award_course_milestones", { p_student_id: studentId, p_objective: objective });
}

const isAmount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

export type Reply = { status: number; body: Record<string, unknown>; problem?: string };

export function replyForAward(data: unknown, objective: string): Reply {
  const fail = (problem: string): Reply => ({ status: 500, body: { ...UNEXPECTED_RESULT }, problem });
  if (data === null || typeof data !== "object" || Array.isArray(data)) return fail("not_an_object");
  const d = data as Record<string, unknown>;
  switch (d.outcome) {
    case "awarded":
    case "nothing_new": {
      if (d.learning_objective !== objective) return fail("objective_mismatch");
      if (!Array.isArray(d.awarded)) return fail("awarded_not_array");
      if (!isAmount(d.xp_awarded) || !isAmount(d.coins_awarded)) return fail("bad_totals");
      const awarded: Record<string, unknown>[] = [];
      let xp = 0;
      let coins = 0;
      for (const a of d.awarded) {
        if (a === null || typeof a !== "object" || Array.isArray(a)) return fail("bad_milestone");
        const m = a as Record<string, unknown>;
        if (typeof m.milestone_key !== "string" || m.milestone_key.length === 0) return fail("bad_milestone_key");
        if (typeof m.kind !== "string" || !KINDS.has(m.kind)) return fail("bad_milestone_kind");
        if (m.learning_step !== null && m.learning_step !== undefined && typeof m.learning_step !== "string") return fail("bad_milestone_step");
        if (!isAmount(m.xp) || !isAmount(m.coins)) return fail("bad_milestone_amount");
        xp += m.xp;
        coins += m.coins;
        awarded.push({ milestone_key: m.milestone_key, kind: m.kind, learning_step: m.learning_step ?? null, xp: m.xp, coins: m.coins });
      }
      if (xp !== d.xp_awarded || coins !== d.coins_awarded) return fail("totals_do_not_add_up");
      if ((d.outcome === "awarded") !== (awarded.length > 0)) return fail("outcome_does_not_match_awards");
      return {
        status: 200,
        body: { outcome: d.outcome, learning_objective: objective, awarded, xp_awarded: xp, coins_awarded: coins },
      };
    }
    case "not_a_course_objective":
      return { status: 404, body: { outcome: d.outcome, error: "Not a course objective" } };
    case "not_a_student":
      return { status: 403, body: { outcome: d.outcome, error: "Only pupils earn course rewards" } };
    case "no_progress_row":
      return { status: 409, body: { outcome: d.outcome, error: "No progress record" } };
    case "reward_path_not_ready":
      return { status: 503, body: { outcome: d.outcome, error: "Course rewards are blocked until course answers are no longer paid per answer" } };
    case "invalid_request":
      return {
        status: 400,
        body: { outcome: d.outcome, error: "Invalid request", ...(typeof d.reason === "string" ? { reason: d.reason } : {}) },
      };
    default:
      return fail("unknown_outcome");
  }
}

// The whole request, with every outside effect injected — index.ts wires Deno and supabase-js; the unit suite
// wires spies. Order: switch → method → verified user → body → RPC → validated reply.
export type CourseProgressDeps = {
  env: (name: string) => string | undefined;
  getUser: (authorization: string) => Promise<{ id: string } | null>;
  makeAdminClient: () => RpcClient;
  log?: (message: string, detail: Record<string, unknown>) => void;
};
export type CourseProgressRequest = { method: string; authorization: string; json: () => Promise<unknown> };

export async function handleCourseProgress(req: CourseProgressRequest, deps: CourseProgressDeps): Promise<Reply> {
  const log = deps.log ?? (() => {});
  // Off (the default): nothing is built, read or written.
  if (!courseRewardsEnabled(deps.env(COURSE_REWARDS_ENV))) return { status: 404, body: { ...COURSE_REWARDS_DISABLED } };
  if (req.method !== "POST") return { status: 405, body: { error: "Method not allowed" } };

  const user = await deps.getUser(req.authorization);
  if (!user || typeof user.id !== "string" || user.id.length === 0) return { status: 401, body: { error: "Unauthorized" } };

  const body = await req.json().catch(() => null);
  const parsed = parseCourseProgressRequest(body);
  if (!parsed.ok) return { status: 400, body: { outcome: "invalid_request", reason: parsed.reason, error: "Invalid request" } };

  let result: RpcResult;
  try {
    result = await callAwardCourseMilestones(deps.makeAdminClient, user.id, parsed.objective);
  } catch (keyError) {
    // The shared key resolver's messages name the variables, never their values.
    log("COURSE PROGRESS ADMIN CLIENT ERROR", { message: String((keyError as { message?: unknown })?.message ?? keyError) });
    return { status: 500, body: { error: "Server configuration error" } };
  }
  if (result.error) {
    const code = (result.error as { code?: unknown })?.code;
    log("COURSE PROGRESS RPC ERROR", { code: typeof code === "string" ? code : "unknown" });
    return { status: 500, body: { ...UNEXPECTED_RESULT } };
  }
  const reply = replyForAward(result.data, parsed.objective);
  if (reply.problem) log("COURSE PROGRESS RPC UNEXPECTED", { problem: reply.problem });
  return reply;
}
