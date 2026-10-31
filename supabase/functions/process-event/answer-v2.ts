// H5 (D-266, D-273) in process-event: which answer path a request takes, and how the outcome of the
// _v2 answer functions becomes the HTTP response.
//
// TWO PATHS, CHOSEN BY THE REQUEST, NEVER MIXED
//   * legacy — neither round_no nor submission_id is in the body (every client deployed today). The
//     request runs exactly as in version 34: process_question_attempt / process_text_answer.
//   * h5     — both are present and valid. MC, number and short text go to process_question_attempt_v2
//     / process_text_answer_v2 (migration 20261030211428). Long answers keep the teacher path
//     (H4 is open); the H5 fields are validated but not used there.
//   * invalid — only one of them is present, or one is malformed. The request is rejected (400) before
//     anything is read or written. It is never downgraded to the legacy path: a client that sends one
//     field means to be protected, and the legacy path would silently drop that protection.
// A key that is present counts as present, even with the value null.
//
// THE _v2 OUTCOMES (the database's contract, see the migration header) → HTTP
//   recorded            200  the answer was registered now; the frozen result
//   replay              200  the same submission was registered before; the frozen original result,
//                            nothing written or paid again (never re-graded from today's content)
//   round_closed        409  the round is already answered or released; nothing written
//   stale_round         409  the answer belongs to an earlier round; nothing written
//   submission_conflict 409  the submission_id was used for another instance, round or answer
//   not_found           404  no such instance for this pupil
//   invalid_request     400  the database rejected the input (reason from a fixed list)
// Anything else — an unknown outcome, a malformed result, a database error — is a 500 that names no
// database detail. It is never turned into a success. Every body carries `outcome`, so the client
// (PR 4) can tell the cases apart without parsing messages.
//
// M2 (the activation, separately approved): EXECUTE on the legacy functions is revoked from
// service_role. A legacy request from a stale browser tab then fails in PostgreSQL's privilege check —
// before the function body runs, so nothing is registered or paid — with SQLSTATE 42501 and the
// message "permission denied for function <name>", which PostgREST passes on as code and message.
// isRevokedLegacyRpc recognises exactly that, and process-event answers 426 client_outdated (a
// proposal for PR 4, not an owner decision). Every other error keeps its version 34 response.
//
// Pure TypeScript with no Deno or network imports, so the Node unit suite can import exactly what the
// Edge Function runs (same arrangement as ./text-answer-rpc.ts).

export type AnswerMode =
  | { kind: "legacy" }
  | { kind: "h5"; roundNo: number; submissionId: string }
  | { kind: "invalid"; reason: "incomplete_h5_fields" | "invalid_round_no" | "invalid_submission_id" | "invalid_answer" };

// round_no is an int4 in the database: a positive integer that fits.
const MAX_ROUND_NO = 2147483647;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const hasKey = (body: unknown, key: string): boolean =>
  body !== null && typeof body === "object" && Object.prototype.hasOwnProperty.call(body, key);

export function answerMode(body: unknown): AnswerMode {
  const hasRound = hasKey(body, "round_no");
  const hasSubmission = hasKey(body, "submission_id");
  if (!hasRound && !hasSubmission) return { kind: "legacy" };
  if (!hasRound || !hasSubmission) return { kind: "invalid", reason: "incomplete_h5_fields" };

  const { round_no, submission_id, answer } = body as Record<string, unknown>;
  if (typeof round_no !== "number" || !Number.isInteger(round_no) || round_no < 1 || round_no > MAX_ROUND_NO) {
    return { kind: "invalid", reason: "invalid_round_no" };
  }
  if (typeof submission_id !== "string" || !UUID.test(submission_id)) {
    return { kind: "invalid", reason: "invalid_submission_id" };
  }
  if (typeof answer !== "string") return { kind: "invalid", reason: "invalid_answer" };
  return { kind: "h5", roundNo: round_no, submissionId: submission_id };
}

export type HttpReply = { status: number; body: Record<string, unknown>; problem: string | null };

const DB_INVALID_REASONS = new Set([
  "missing_identity", "invalid_round", "missing_answer", "missing_verdict", "answer_path", "round_ahead",
]);

const REFUSED: Record<string, { status: number; error: string }> = {
  round_closed:        { status: 409, error: "Round already closed" },
  stale_round:         { status: 409, error: "Answer belongs to an earlier round" },
  submission_conflict: { status: 409, error: "Submission id already used" },
  not_found:           { status: 404, error: "Instance not found" },
};

const isTextOrNull = (v: unknown) => v === null || typeof v === "string";
const isCount = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 0;

export const UNEXPECTED_RESULT = Object.freeze({ error: "Could not process answer" });

function unexpected(problem: string): HttpReply {
  return { status: 500, body: { ...UNEXPECTED_RESULT }, problem };
}

// Turns the jsonb a _v2 function returned into the response. roundNo is the round the request named;
// a registered result for any other round is a contract break, not a success.
export function replyForV2(data: unknown, roundNo: number): HttpReply {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return unexpected("result is not an object");
  const r = data as Record<string, unknown>;
  const outcome = r.outcome;

  if (outcome === "recorded" || outcome === "replay") {
    if (r.status !== "correct" && r.status !== "incorrect") return unexpected(`${outcome}: invalid status`);
    if (r.round_no !== roundNo) return unexpected(`${outcome}: round_no does not match the request`);
    if (!isTextOrNull(r.correct_answer) || !isTextOrNull(r.review_text) || !isTextOrNull(r.misconception_type)) {
      return unexpected(`${outcome}: invalid result text`);
    }
    if (!isCount(r.xp_awarded) || !isCount(r.coins_awarded)) return unexpected(`${outcome}: invalid award`);
    return {
      status: 200,
      body: {
        outcome,
        status: r.status,
        correct_answer: r.correct_answer,
        review_text: r.review_text,
        misconception_type: r.misconception_type,
        round_no: r.round_no,
        xp_awarded: r.xp_awarded,
        coins_awarded: r.coins_awarded,
      },
      problem: null,
    };
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

// M2: the legacy function was called but the backend role may no longer execute it.
export function isRevokedLegacyRpc(error: unknown, fn: string): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return code === "42501"
    && typeof message === "string"
    && (message === `permission denied for function ${fn}` || message === `permission denied for function public.${fn}`);
}

export const CLIENT_OUTDATED = Object.freeze({ outcome: "client_outdated", error: "Client outdated" });

// A database error code is safe to log (a fixed SQLSTATE or PGRST code); the message may carry details.
export function errorCodeOf(error: unknown): string | null {
  if (error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string") {
    return (error as { code: string }).code;
  }
  return null;
}
