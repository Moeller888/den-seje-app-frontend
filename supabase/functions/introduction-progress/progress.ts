// Lærligverse LP-13 / K9 PROTOTYPE: introduction-progress — the pure half (contract, switch, RPC choice, reply).
// Pure TypeScript with no Deno or network imports, so the Node unit suite imports exactly what the function runs.
//
// REQUESTS (POST, the pupil's JWT in Authorization; the pupil is the VERIFIED user, never a body field):
//   { action: "completed", round_id: uuid, request_id: uuid }  — the explicit "completed" of an introduction round
//        → complete_introduction            (needs LAERLIGVERSE_INTRODUCTION=on)
//   { action: "presented", round_id: uuid, request_id: uuid }  — optional K9 signal for an introduction round
//        → mark_introduction_presented      (needs LAERLIGVERSE_INTRODUCTION=on AND LAERLIGVERSE_PRESENTED=on)
//   { action: "presented", question_instance_id: uuid, round_no: int ≥ 1 } — optional K9 signal for a task round
//        → mark_presented (migration 20261109043500; set once per round, so no request id is needed)
//                                            (needs LAERLIGVERSE_PRESENTED=on)
// request_id is the client's id for this action: the same id on every retry or refresh gives the same result.
// Every other body field is ignored.
//
// MEANING: "completed" = the pupil pressed "completed" and the server registered it; "presented" = the server received
// a "shown" report. Neither proves reading or understanding, and neither is evidence (D-330).
//
// OUTCOMES → HTTP: recorded / replay / already_recorded / already_completed → 200; not_found → 404 (a foreign round
// looks the same); stale_round / round_closed → 409; invalid_request → 400; anything else → 500 without detail.

export const INTRODUCTION_ENV = "LAERLIGVERSE_INTRODUCTION";
export const PRESENTED_ENV = "LAERLIGVERSE_PRESENTED";
export const DISABLED = Object.freeze({ outcome: "disabled", error: "Not enabled" });
export const UNEXPECTED = Object.freeze({ error: "Could not register progress" });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Flags = { introduction: boolean; presented: boolean };
export function flagsOf(get: (name: string) => string | undefined): Flags {
  return { introduction: get(INTRODUCTION_ENV) === "on", presented: get(PRESENTED_ENV) === "on" };
}
/** Off entirely (the default): nothing is built, read or written. */
export const anyOn = (f: Flags): boolean => f.introduction || f.presented;

export type ProgressRequest =
  | { kind: "intro_completed"; roundId: string; requestId: string }
  | { kind: "intro_presented"; roundId: string; requestId: string }
  | { kind: "task_presented"; instanceId: string; roundNo: number };

export function parseProgressRequest(body: unknown): { ok: true; request: ProgressRequest } | { ok: false; reason: string } {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return { ok: false, reason: "invalid_body" };
  const b = body as Record<string, unknown>;
  if (b.action !== "completed" && b.action !== "presented") return { ok: false, reason: "invalid_action" };
  if (b.action === "presented" && b.question_instance_id !== undefined) {
    if (typeof b.question_instance_id !== "string" || !UUID.test(b.question_instance_id)) return { ok: false, reason: "invalid_instance" };
    if (typeof b.round_no !== "number" || !Number.isInteger(b.round_no) || b.round_no < 1 || b.round_no > 2147483647) return { ok: false, reason: "invalid_round_no" };
    return { ok: true, request: { kind: "task_presented", instanceId: b.question_instance_id, roundNo: b.round_no } };
  }
  if (typeof b.round_id !== "string" || !UUID.test(b.round_id)) return { ok: false, reason: "invalid_round_id" };
  if (typeof b.request_id !== "string" || !UUID.test(b.request_id)) return { ok: false, reason: "invalid_request_id" };
  return { ok: true, request: { kind: b.action === "completed" ? "intro_completed" : "intro_presented", roundId: b.round_id, requestId: b.request_id } };
}

/** Is this request allowed under the flags? (introduction rounds need LAERLIGVERSE_INTRODUCTION; presented needs LAERLIGVERSE_PRESENTED) */
export function allowed(req: ProgressRequest, f: Flags): boolean {
  if (req.kind === "intro_completed") return f.introduction;
  if (req.kind === "intro_presented") return f.introduction && f.presented;
  return f.presented;
}

export function rpcFor(req: ProgressRequest, studentId: string): { fn: string; args: Record<string, unknown> } {
  if (req.kind === "intro_completed") return { fn: "complete_introduction", args: { p_student_id: studentId, p_round_id: req.roundId, p_request_id: req.requestId } };
  if (req.kind === "intro_presented") return { fn: "mark_introduction_presented", args: { p_student_id: studentId, p_round_id: req.roundId, p_request_id: req.requestId } };
  return { fn: "mark_presented", args: { p_student_id: studentId, p_question_instance_id: req.instanceId, p_round_no: req.roundNo } };
}

const OK = new Set(["recorded", "replay", "already_recorded", "already_completed"]);
const isTime = (v: unknown) => typeof v === "string" && Number.isFinite(Date.parse(v));

export function replyFor(data: unknown, req: ProgressRequest): { status: number; body: Record<string, unknown>; problem: string | null } {
  const bad = (problem: string) => ({ status: 500, body: { ...UNEXPECTED }, problem });
  if (data === null || typeof data !== "object" || Array.isArray(data)) return bad("result is not an object");
  const r = data as Record<string, unknown>;
  if (typeof r.outcome === "string" && OK.has(r.outcome)) {
    const at = req.kind === "intro_completed" ? r.completed_at : r.presented_at;
    if (!isTime(at)) return bad(`${r.outcome}: no server time`);
    if (req.kind !== "task_presented" && r.round_id !== req.roundId) return bad(`${r.outcome}: round does not match`);
    return { status: 200, body: { outcome: r.outcome, at }, problem: null };
  }
  if (r.outcome === "not_found") return { status: 404, body: { outcome: "not_found", error: "Not found" }, problem: null };
  if (r.outcome === "stale_round" || r.outcome === "round_closed") return { status: 409, body: { outcome: r.outcome, error: "Round not open" }, problem: null };
  if (r.outcome === "invalid_request") return { status: 400, body: { outcome: "invalid_request", error: "Invalid request" }, problem: null };
  return bad("unknown outcome");
}

export function errorCodeOf(error: unknown): string | null {
  if (error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string") return (error as { code: string }).code;
  return null;
}
