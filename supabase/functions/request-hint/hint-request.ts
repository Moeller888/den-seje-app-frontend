// Lærligverse L3: the request-hint Edge Function's pure half — the switch, the request contract, the one
// privileged RPC and how its jsonb becomes the HTTP reply. Pure TypeScript with no Deno or network imports, so the
// Node unit suite imports exactly what the function runs (same arrangement as process-event/answer-v2.ts).
//
// WHY A SEPARATE FUNCTION (not a route in process-event or get-next-question): both have release gates over their
// module graphs and their own deploy history; a hint is neither an answer nor a served question. A separate
// function keeps both graphs and behaviours untouched, is deployed and switched on independently, and can be
// removed without touching the answer path.
//
// SWITCH: the Edge secret LAERLIGVERSE_HINTS. Exactly "on" enables it; anything else (unset in production) answers
// 404 { outcome: "hints_disabled" } before any client is built — nothing is read or written. It may only be turned
// on after migration 20261108043500 is applied (request_question_hint does not exist before).
//
// REQUEST (POST, the pupil's JWT in Authorization, like every other function):
//   { question_instance_id: uuid, round_no: integer ≥ 1, level: 1..3, request_id: uuid }
// request_id is the HOST's id for this hint request: the same id on every retry, so a retry returns the same log
// row and never counts twice. Every other body field is ignored. The pupil is the verified user, never the body.
//
// THE RPC: public.request_question_hint (SECURITY INVOKER, EXECUTE for service_role only) through the backend admin
// client — no pupil Authorization header, no session — with p_student_id = the verified user.id. The database checks
// that the instance is the pupil's, that the round is current and open, that the level is next in order, and that
// the content offers it; it logs the request and returns the text (see the migration header).
//
// OUTCOMES → HTTP
//   recorded / replay / already_recorded  200 { outcome, level, text, hints_remaining, round_no }
//   hint_unavailable                      409 { outcome, error, hints_available } — nothing logged
//   round_closed / stale_round / request_conflict  409 { outcome, error }
//   not_found                             404 { outcome, error } — a foreign instance looks the same
//   invalid_request                       400 { outcome, error, reason? }
// Anything else — an unknown outcome, a malformed result, a database error — is a 500 that names no database
// detail. A hint reply is validated before it leaves: the level and round must be the requested ones.

export const HINTS_ENV = "LAERLIGVERSE_HINTS";

export function hintsEnabled(value: string | undefined | null): boolean {
  return value === "on";
}

export const HINTS_DISABLED = Object.freeze({ outcome: "hints_disabled", error: "Hints are not enabled" });
export const UNEXPECTED_HINT_RESULT = Object.freeze({ error: "Could not process hint request" });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ROUND_NO = 2147483647;

export type HintRequest = { instanceId: string; roundNo: number; level: number; requestId: string };

export function parseHintRequest(body: unknown):
  | { ok: true; request: HintRequest }
  | { ok: false; reason: "invalid_body" | "invalid_instance" | "invalid_round_no" | "invalid_level" | "invalid_request_id" } {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return { ok: false, reason: "invalid_body" };
  const b = body as Record<string, unknown>;
  if (typeof b.question_instance_id !== "string" || !UUID.test(b.question_instance_id)) return { ok: false, reason: "invalid_instance" };
  if (typeof b.round_no !== "number" || !Number.isInteger(b.round_no) || b.round_no < 1 || b.round_no > MAX_ROUND_NO) {
    return { ok: false, reason: "invalid_round_no" };
  }
  if (typeof b.level !== "number" || !Number.isInteger(b.level) || b.level < 1 || b.level > 3) return { ok: false, reason: "invalid_level" };
  if (typeof b.request_id !== "string" || !UUID.test(b.request_id)) return { ok: false, reason: "invalid_request_id" };
  return { ok: true, request: { instanceId: b.question_instance_id, roundNo: b.round_no, level: b.level, requestId: b.request_id } };
}

export type RpcResult = { data: unknown; error: unknown };
export type RpcClient = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<RpcResult> };

export const ADMIN_CLIENT_OPTIONS = Object.freeze({
  auth: Object.freeze({ persistSession: false, autoRefreshToken: false }),
});

// makeAdminClient is invoked only here; if the key cannot be resolved it throws, and so does this — never a
// fallback to the user client.
export async function callRequestQuestionHint(
  makeAdminClient: () => RpcClient,
  studentId: string,
  request: HintRequest,
): Promise<RpcResult> {
  const admin = makeAdminClient();
  return await admin.rpc("request_question_hint", {
    p_student_id: studentId,
    p_question_instance_id: request.instanceId,
    p_round_no: request.roundNo,
    p_level: request.level,
    p_request_id: request.requestId,
  });
}

export type HttpReply = { status: number; body: Record<string, unknown>; problem: string | null };

const REFUSED: Record<string, { status: number; error: string }> = {
  round_closed: { status: 409, error: "Round already closed" },
  stale_round: { status: 409, error: "Hint belongs to an earlier round" },
  request_conflict: { status: 409, error: "Request id already used" },
  not_found: { status: 404, error: "Instance not found" },
};
const DB_INVALID_REASONS = new Set(["missing_identity", "invalid_round", "invalid_level", "round_ahead", "level_out_of_order"]);
const isLevelCount = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 3;

function unexpected(problem: string): HttpReply {
  return { status: 500, body: { ...UNEXPECTED_HINT_RESULT }, problem };
}

export function replyForHint(data: unknown, request: HintRequest): HttpReply {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return unexpected("result is not an object");
  const r = data as Record<string, unknown>;
  const outcome = r.outcome;
  if (outcome === "recorded" || outcome === "replay" || outcome === "already_recorded") {
    if (r.hint_level !== request.level) return unexpected(`${outcome}: level does not match the request`);
    if (r.round_no !== request.roundNo) return unexpected(`${outcome}: round_no does not match the request`);
    if (typeof r.hint_text !== "string" || r.hint_text.length === 0) return unexpected(`${outcome}: no hint text`);
    if (!isLevelCount(r.hints_available) || (r.hints_available as number) < request.level) return unexpected(`${outcome}: invalid hints_available`);
    return {
      status: 200,
      body: { outcome, level: request.level, text: r.hint_text, hints_remaining: (r.hints_available as number) - request.level, round_no: request.roundNo },
      problem: null,
    };
  }
  if (outcome === "hint_unavailable") {
    if (!isLevelCount(r.hints_available)) return unexpected("hint_unavailable: invalid hints_available");
    return { status: 409, body: { outcome, error: "No hint at this level", hints_available: r.hints_available }, problem: null };
  }
  if (typeof outcome === "string" && Object.prototype.hasOwnProperty.call(REFUSED, outcome)) {
    const { status, error } = REFUSED[outcome];
    return { status, body: { outcome, error }, problem: null };
  }
  if (outcome === "invalid_request") {
    const body: Record<string, unknown> = { outcome, error: "Invalid request" };
    if (typeof r.reason === "string" && DB_INVALID_REASONS.has(r.reason)) body.reason = r.reason;
    return { status: 400, body, problem: null };
  }
  return unexpected("unknown outcome");
}

// A database error code is safe to log (a fixed SQLSTATE or PGRST code); the message may carry details.
export function errorCodeOf(error: unknown): string | null {
  if (error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string") {
    return (error as { code: string }).code;
  }
  return null;
}
