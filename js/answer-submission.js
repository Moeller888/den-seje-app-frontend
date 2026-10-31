// H5 PR 4 (D-266, D-273): the browser half of the protection against stale and repeated submissions.
//
// WHAT H5 IS
// Every deliberate answer gets one submission_id (a UUID made here, once) and carries the round_no the
// server handed out with the question. process-event then answers through the _v2 database functions,
// which register the attempt once: a technical retry with the same submission_id returns the ORIGINAL
// result ("replay") and pays nothing twice; an answer for a closed or earlier round is refused.
//
// OFF BY DEFAULT — AND NOTHING IN THE BROWSER CAN TURN IT ON
// ENABLE_H5_SUBMISSIONS is a constant. There is deliberately no localStorage key, URL parameter,
// cookie or user setting that enables it (unlike the avatar flags): a pupil's browser must never send
// H5 requests to a backend that is not ready. Turning it on is a one-line, reviewed commit with the
// owner's separate GO, and only after migration 20261030211428 is applied and process-event (H5 PR 3)
// and get-next-question with round_no (H5 PR 2) are deployed — see docs/157r-feature-flags.md.
// While it is off, app.js sends exactly the request it sent before this module existed.
//
// WHAT THIS MODULE IS
// DOM-free and side-effect-free on import, so the Node unit suite tests exactly what the page runs
// (tests/unit/answer-submission.test.mjs):
//   * validation of round_no and submission_id,
//   * the pending submission kept in sessionStorage — one per tab, bound to the signed-in pupil, the
//     instance, the round, the UUID and the exact answer; never a token, never the answer key,
//   * the request body,
//   * reading what supabase.functions.invoke returned. A non-2xx reply arrives as `error` (a
//     FunctionsHttpError whose `context` is the unread Response), not as `data`, so the body of a
//     400 / 409 / 426 is read from there.
// The server's reply is authoritative: this module never decides whether an answer was saved. When the
// reply is missing or unreadable the result is "uncertain", and the only safe next step is to send the
// SAME submission again — which the database turns into a replay if the first one did arrive.

export const ENABLE_H5_SUBMISSIONS = false;

/** Whether H5 submissions are on. No override of any kind. */
export function isH5SubmissionsEnabled() {
  return ENABLE_H5_SUBMISSIONS === true;
}

export const PENDING_STORAGE_KEY = "laerlig_h5_pending_v1";
// A pending submission older than this is discarded unread. Dropping one is always safe: if the server
// registered it, the instance is answered and is not served again; if not, it is served again.
export const PENDING_MAX_AGE_MS = 12 * 60 * 60 * 1000;
// Bounds what one tab can keep. Short text is capped at 100 characters by its input and a Match par
// answer at 200 by the server; long answers never take this path.
export const MAX_ANSWER_LENGTH = 2000;
const MAX_ROUND_NO = 2147483647;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isValidRoundNo = (v) => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= MAX_ROUND_NO;
export const isUuid = (v) => typeof v === "string" && UUID.test(v);
const isNonEmptyString = (v) => typeof v === "string" && v.length > 0;

/**
 * Whether a question takes the H5 path. Long answers keep the teacher path: H4 is open and the history
 * does not cover them, so they are never sent or stored as protected submissions.
 */
export function isH5Eligible(answerType) {
  return (typeof answerType === "string" ? answerType.trim().toLowerCase() : "short") !== "long";
}

function defaultNewId() {
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (!c || typeof c.randomUUID !== "function") return null;
  return c.randomUUID();
}

/**
 * One deliberate answer → one locked submission. Fails closed: without a valid round_no from the
 * server's question, or without crypto.randomUUID, there is no H5 submission (and no legacy fallback).
 * @returns {{ ok: true, record: object } | { ok: false, reason: string }}
 */
export function createSubmission({ studentId, instanceId, roundNo, answer, now = Date.now(), newId = defaultNewId } = {}) {
  if (!isNonEmptyString(studentId)) return { ok: false, reason: "no_student" };
  if (!isNonEmptyString(instanceId)) return { ok: false, reason: "no_instance" };
  if (!isValidRoundNo(roundNo)) return { ok: false, reason: "invalid_round_no" };
  if (!isNonEmptyString(answer)) return { ok: false, reason: "empty_answer" };
  if (answer.length > MAX_ANSWER_LENGTH) return { ok: false, reason: "answer_too_long" };
  let id = null;
  try { id = newId(); } catch (_e) { id = null; }
  if (!isUuid(id)) return { ok: false, reason: "no_uuid" };
  return {
    ok: true,
    record: Object.freeze({
      v: 1,
      student_id: studentId,
      question_instance_id: instanceId,
      round_no: roundNo,
      submission_id: id.toLowerCase(),
      answer,
      created_at: now,
    }),
  };
}

/** A stored value back to a record, or null when it is anything but a complete, current record. */
export function parseRecord(raw, now = Date.now()) {
  let r;
  try { r = typeof raw === "string" ? JSON.parse(raw) : null; } catch (_e) { return null; }
  if (!r || typeof r !== "object" || Array.isArray(r)) return null;
  const keys = Object.keys(r).sort().join(",");
  if (keys !== "answer,created_at,question_instance_id,round_no,student_id,submission_id,v") return null;
  if (r.v !== 1 || !isNonEmptyString(r.student_id) || !isNonEmptyString(r.question_instance_id)) return null;
  if (!isValidRoundNo(r.round_no) || !isUuid(r.submission_id)) return null;
  if (!isNonEmptyString(r.answer) || r.answer.length > MAX_ANSWER_LENGTH) return null;
  if (typeof r.created_at !== "number" || !Number.isFinite(r.created_at)) return null;
  if (r.created_at > now + 60 * 1000 || now - r.created_at > PENDING_MAX_AGE_MS) return null;
  return Object.freeze(r);
}

/** Stores the pending submission. Never throws: a full or blocked storage only loses reload recovery. */
export function savePending(storage, record) {
  try {
    storage.setItem(PENDING_STORAGE_KEY, JSON.stringify(record));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e && e.name ? e.name : "storage_error" };
  }
}

/** Removes the pending submission. Never throws. */
export function clearPending(storage) {
  try {
    if (storage) storage.removeItem(PENDING_STORAGE_KEY);
    return true;
  } catch (_e) {
    return false;
  }
}

/**
 * The pending submission of THIS pupil, or null. Anything else found under the key — another pupil's,
 * corrupt, expired — is removed, and the reason is returned so the caller can log it.
 * @returns {{ record: object | null, discarded: string | null }}
 */
export function loadPending(storage, studentId, now = Date.now()) {
  let raw;
  try { raw = storage ? storage.getItem(PENDING_STORAGE_KEY) : null; } catch (_e) { return { record: null, discarded: "storage_unavailable" }; }
  if (raw === null || raw === undefined) return { record: null, discarded: null };
  const record = parseRecord(raw, now);
  if (!record) { clearPending(storage); return { record: null, discarded: "invalid" }; }
  if (record.student_id !== studentId) { clearPending(storage); return { record: null, discarded: "other_student" }; }
  return { record, discarded: null };
}

/** The process-event body for an H5 submission: the legacy fields plus round_no and submission_id. */
export function h5RequestBody(record, questionShownAt) {
  return {
    student_id: record.student_id,
    question_instance_id: record.question_instance_id,
    answer: record.answer,
    question_shown_at: questionShownAt ?? null,
    round_no: record.round_no,
    submission_id: record.submission_id,
  };
}

// process-event's refusals (H5 PR 3): the answer was NOT registered and NOT paid.
export const REFUSED_OUTCOMES = Object.freeze(["round_closed", "stale_round", "submission_conflict", "not_found", "invalid_request"]);

async function readErrorBody(error) {
  const ctx = error && error.context;
  if (!ctx || typeof ctx.status !== "number") return { status: null, body: null };
  let body = null;
  try {
    const res = typeof ctx.clone === "function" ? ctx.clone() : ctx;
    const text = await res.text();
    try { body = JSON.parse(text); } catch (_e) { body = null; }
  } catch (_e) { body = null; }
  return { status: ctx.status, body: body && typeof body === "object" && !Array.isArray(body) ? body : null };
}

const isGradedStatus = (s) => s === "correct" || s === "incorrect";

/**
 * What one process-event call means, from the { data, error } supabase.functions.invoke returned.
 *   graded            200 recorded / replay: show the result (replay = the original, frozen result)
 *   graded_unprotected 200 correct/incorrect WITHOUT outcome: a backend without H5 graded it — authoritative
 *   pending           200 long answer saved for the teacher
 *   refused           the server refused the submission; nothing was registered or paid
 *   invalid_answer    400 { status: "invalid" } (e.g. an incomplete Match par): change the answer
 *   client_outdated   426: the legacy answer path is closed (M2); reload the page
 *   unauthorized      401: the session is gone
 *   uncertain         no reply, a 5xx, or an unreadable reply: resend the SAME submission
 */
export async function classifyResponse(result) {
  const data = result ? result.data : undefined;
  const error = result ? result.error : undefined;

  if (error) {
    const name = typeof error.name === "string" ? error.name : "";
    if (name !== "FunctionsHttpError") return { kind: "uncertain", reason: name || "error" };
    const { status, body } = await readErrorBody(error);
    if (status === null) return { kind: "uncertain", reason: "http_no_status" };
    if (status >= 500) return { kind: "uncertain", reason: `http_${status}` };
    if (status === 426 && body && body.outcome === "client_outdated") return { kind: "client_outdated" };
    if (status === 401) return { kind: "unauthorized" };
    if (body && REFUSED_OUTCOMES.includes(body.outcome)) {
      return { kind: "refused", outcome: body.outcome, reason: typeof body.reason === "string" ? body.reason : null };
    }
    if (status === 400 && body && body.status === "invalid") {
      return { kind: "invalid_answer", message: typeof body.error === "string" ? body.error : null };
    }
    if (status === 403) return { kind: "refused", outcome: "not_found", reason: "forbidden" };
    if (status === 400 || status === 404) return { kind: "refused", outcome: status === 404 ? "not_found" : "invalid_request", reason: null };
    return { kind: "uncertain", reason: `http_${status}` };
  }

  let body = data;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (_e) { return { kind: "uncertain", reason: "unreadable" }; }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return { kind: "uncertain", reason: "empty" };

  if ((body.outcome === "recorded" || body.outcome === "replay") && isGradedStatus(body.status)) {
    return { kind: "graded", replay: body.outcome === "replay", data: body };
  }
  if (REFUSED_OUTCOMES.includes(body.outcome)) return { kind: "refused", outcome: body.outcome, reason: null };
  if (body.outcome === undefined && isGradedStatus(body.status)) return { kind: "graded_unprotected", data: body };
  if (body.outcome === undefined && body.status === "pending") return { kind: "pending", data: body };
  return { kind: "uncertain", reason: "unexpected_response" };
}

/**
 * Legacy path (H5 off): whether a failed answer means "this client is outdated" — process-event's 426
 * after M2. Only that exact reply counts; every other error keeps today's handling.
 */
export async function isClientOutdatedError(error) {
  if (!error || error.name !== "FunctionsHttpError") return false;
  const { status, body } = await readErrorBody(error);
  return status === 426 && !!body && body.outcome === "client_outdated";
}

// The pupil-facing text for each refusal. None of them says right or wrong: nothing was graded.
export const REFUSAL_TEXT = Object.freeze({
  round_closed: "Dette spørgsmål er allerede besvaret. Vi henter et nyt.",
  stale_round: "Svaret hørte til en tidligere runde. Vi henter et nyt spørgsmål.",
  submission_conflict: "Svaret kunne ikke registreres. Vi henter et nyt spørgsmål.",
  not_found: "Spørgsmålet findes ikke længere. Vi henter et nyt.",
  invalid_request: "Svaret kunne ikke behandles. Vi henter et nyt spørgsmål.",
});
export const UNCERTAIN_TEXT = "⚠️ Forbindelsen svigtede, så vi ved ikke, om dit svar nåede frem. Tryk «Send igen» — det samme svar sendes, og det tæller kun én gang.";
export const CLIENT_OUTDATED_TEXT = "Lærlig er blevet opdateret. Genindlæs siden for at fortsætte.";
export const MISSING_ROUND_TEXT = "⚠️ Spørgsmålet kunne ikke sendes sikkert. Genindlæs siden og prøv igen.";
