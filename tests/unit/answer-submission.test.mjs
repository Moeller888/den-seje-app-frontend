// H5 PR 4 (D-266, D-273): js/answer-submission.js — the browser half of the protection against stale
// and repeated submissions — and its wiring in app.js / js/login.js.
//
// The module is DOM-free, so this suite imports exactly what the page runs. What app.js does with it
// in a real browser (locked retry, reload recovery, refusals) is tests/h5-submission.spec.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ENABLE_H5_SUBMISSIONS, isH5SubmissionsEnabled, isH5Eligible, isValidRoundNo, isUuid,
  createSubmission, parseRecord, savePending, persistAndVerify, loadPending, clearPending, h5RequestBody,
  blockRecord, BLOCKED_INCOMPATIBLE, classifyResponse, isClientOutdatedError, PENDING_STORAGE_KEY,
  PENDING_MAX_AGE_MS, MAX_ANSWER_LENGTH, REFUSED_OUTCOMES, REFUSAL_STATUS, REFUSAL_TEXT,
} from "../../js/answer-submission.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const MODULE = read("../../js/answer-submission.js");
const CODE = MODULE.replace(/\/\/.*$/gm, "");
const APP = read("../../app.js");
const LOGIN = read("../../js/login.js");

const STUDENT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const INSTANCE = "33333333-3333-4333-8333-333333333333";
const SUB = "6f1c2a9e-4b7d-4e2a-9c3f-0d8b5e7a1c24";
const NOW = 1_790_000_000_000;

function memoryStorage({ failSet = false, failGet = false, failRemove = false } = {}) {
  const m = new Map();
  return {
    map: m,
    getItem: (k) => { if (failGet) throw new Error("SecurityError"); return m.has(k) ? m.get(k) : null; },
    setItem: (k, v) => { if (failSet) { const e = new Error("full"); e.name = "QuotaExceededError"; throw e; } m.set(k, String(v)); },
    removeItem: (k) => { if (failRemove) throw new Error("SecurityError"); m.delete(k); },
  };
}
const make = (over = {}) => createSubmission({ studentId: STUDENT, instanceId: INSTANCE, roundNo: 1, answer: "Paris", now: NOW, newId: () => SUB, ...over });
// What supabase-js (functions-js 2.x) hands back for a non-2xx reply: a FunctionsHttpError whose
// context is the unread Response.
const httpError = (status, body) => ({
  data: null,
  error: Object.assign(new Error("Edge Function returned a non-2xx status code"), {
    name: "FunctionsHttpError",
    context: new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  }),
});
const fetchError = () => ({ data: null, error: Object.assign(new Error("Failed to send a request to the Edge Function"), { name: "FunctionsFetchError", context: new TypeError("Failed to fetch") }) });
const relayError = () => ({ data: null, error: Object.assign(new Error("Relay Error invoking the Edge Function"), { name: "FunctionsRelayError", context: {} }) });

// ── OFF by default, and nothing in the browser can turn it on ─────────────────────────────────────
test("H5 is OFF: the constant is false and the accessor says so", () => {
  assert.equal(ENABLE_H5_SUBMISSIONS, false);
  assert.equal(isH5SubmissionsEnabled(), false);
  assert.match(MODULE, /^export const ENABLE_H5_SUBMISSIONS = false;$/m);
});

test("no browser input can enable H5: the module reads no localStorage, URL, cookie or window state", () => {
  for (const forbidden of [/localStorage/, /location/, /URLSearchParams/, /document\.cookie/, /\bwindow\b/, /\bdocument\b/, /getItem\(\s*["'`](?!laerlig_h5_pending_v1)/]) {
    assert.doesNotMatch(CODE, forbidden, String(forbidden));
  }
  // The accessor depends on the constant alone.
  assert.match(CODE, /export function isH5SubmissionsEnabled\(\) \{\s*return ENABLE_H5_SUBMISSIONS === true;\s*\}/);
  // Whatever a page could set, it stays off.
  const saved = { ls: globalThis.localStorage, loc: globalThis.location };
  try {
    globalThis.localStorage = { getItem: () => "1" };
    globalThis.location = { search: "?h5=1&enable_h5=true" };
    assert.equal(isH5SubmissionsEnabled(), false);
  } finally {
    globalThis.localStorage = saved.ls;
    globalThis.location = saved.loc;
  }
});

test("app.js takes the H5 path only when the flag is on, and recovers only when it is on", () => {
  assert.match(APP, /if \(isH5SubmissionsEnabled\(\) && isH5Eligible\(currentAnswerType\)\) \{\s*const h5 = await submitH5\(userAnswer\);/);
  assert.match(APP, /if \(isH5SubmissionsEnabled\(\) && !\(await recoverPendingSubmission\(\)\)\) return;\s*await loadAndRenderQuestion\(\);/);
  assert.equal((APP.match(/submitH5\(/g) ?? []).length, 2, "defined once, called once");
  assert.equal((APP.match(/recoverPendingSubmission\(\)/g) ?? []).length, 3, "defined once, called at start-up and from its own retry");
  assert.equal((APP.match(/h5RequestBody\(/g) ?? []).length, 1, "the H5 body is built in sendSubmission only");
  assert.doesNotMatch(APP, /round_no:/, "app.js never writes round_no into a body itself");
  for (const line of APP.split("\n").filter((l) => l.includes("submission_id:"))) {
    assert.match(line, /log(Event|Error)\(/, `submission_id appears only in log lines: ${line.trim()}`);
  }
});

test("H5 off: app.js sends exactly the request it always sent", () => {
  assert.match(APP, /\(\{ data, error \} = await supabase\.functions\.invoke\(\s*"process-event",\s*\{\s*body: \{\s*student_id: studentId,\s*question_instance_id: currentInstanceId,\s*answer: userAnswer,\s*question_shown_at: questionShownAt\s*\}\s*\}\s*\)\);/);
  assert.equal((APP.match(/functions\.invoke\(\s*"process-event"/g) ?? []).length, 2, "the legacy call and sendSubmission");
});

test("the login page clears the same key the module uses, without importing it", () => {
  assert.equal(PENDING_STORAGE_KEY, "laerlig_h5_pending_v1");
  assert.match(LOGIN, /sessionStorage\.removeItem\("laerlig_h5_pending_v1"\)/);
  assert.doesNotMatch(LOGIN, /import[^;]*answer-submission/, "no module dependency on the login page");
});

// ── round_no, submission_id, eligibility ─────────────────────────────────────────────────────────
test("round_no and submission_id validation", () => {
  for (const ok of [1, 2, 2147483647]) assert.equal(isValidRoundNo(ok), true, String(ok));
  for (const bad of [0, -1, 1.5, "1", null, undefined, NaN, 2147483648]) assert.equal(isValidRoundNo(bad), false, String(bad));
  assert.equal(isUuid(SUB), true);
  assert.equal(isUuid(SUB.toUpperCase()), true);
  for (const bad of ["abc", SUB + "0", 123, null, ""]) assert.equal(isUuid(bad), false, String(bad));
});

test("long answers are never H5 submissions (H4 is open); everything else is", () => {
  assert.equal(isH5Eligible("long"), false);
  assert.equal(isH5Eligible(" LONG "), false);
  for (const t of ["short", undefined, null, ""]) assert.equal(isH5Eligible(t), true, String(t));
});

test("one deliberate answer → one locked submission with the server's round and a fresh UUID", () => {
  const r = make();
  assert.equal(r.ok, true);
  assert.deepEqual({ ...r.record }, { v: 1, student_id: STUDENT, question_instance_id: INSTANCE, round_no: 1, submission_id: SUB, answer: "Paris", created_at: NOW });
  assert.ok(Object.isFrozen(r.record), "a locked submission cannot be edited");
  // The real generator: crypto.randomUUID, a new one per call.
  const a = createSubmission({ studentId: STUDENT, instanceId: INSTANCE, roundNo: 1, answer: "x" });
  const b = createSubmission({ studentId: STUDENT, instanceId: INSTANCE, roundNo: 1, answer: "x" });
  assert.ok(isUuid(a.record.submission_id) && a.record.submission_id !== b.record.submission_id);
});

test("fail closed: no submission without a valid round_no, a UUID source or a usable answer", () => {
  assert.deepEqual(make({ roundNo: undefined }), { ok: false, reason: "invalid_round_no" });
  assert.deepEqual(make({ roundNo: null }), { ok: false, reason: "invalid_round_no" });
  assert.deepEqual(make({ roundNo: "1" }), { ok: false, reason: "invalid_round_no" });
  assert.deepEqual(make({ newId: () => { throw new Error("no crypto"); } }), { ok: false, reason: "no_uuid" });
  assert.deepEqual(make({ newId: () => "not-a-uuid" }), { ok: false, reason: "no_uuid" });
  assert.deepEqual(make({ answer: "" }), { ok: false, reason: "empty_answer" });
  assert.deepEqual(make({ answer: "x".repeat(MAX_ANSWER_LENGTH + 1) }), { ok: false, reason: "answer_too_long" });
  assert.deepEqual(make({ studentId: null }), { ok: false, reason: "no_student" });
  assert.deepEqual(make({ instanceId: "" }), { ok: false, reason: "no_instance" });
});

test("the H5 body is the legacy body plus round_no and submission_id — same UUID and answer on every retry", () => {
  const { record } = make({ answer: '[[1,0],[0,1]]' });
  const first = h5RequestBody(record, 123);
  const retry = h5RequestBody(record, 456);
  assert.deepEqual(first, { student_id: STUDENT, question_instance_id: INSTANCE, answer: '[[1,0],[0,1]]', question_shown_at: 123, round_no: 1, submission_id: SUB });
  assert.deepEqual({ ...retry, question_shown_at: 123 }, first, "a retry differs in nothing that matters");
});

// ── sessionStorage ───────────────────────────────────────────────────────────────────────────────
test("the pending submission is stored bound to the pupil, and only this pupil gets it back", () => {
  const s = memoryStorage();
  const { record } = make();
  assert.deepEqual(savePending(s, record), { ok: true });
  assert.deepEqual(Object.keys(JSON.parse(s.map.get(PENDING_STORAGE_KEY))).sort(),
    ["answer", "created_at", "question_instance_id", "round_no", "student_id", "submission_id", "v"], "no token, no answer key");
  assert.deepEqual(loadPending(s, STUDENT, NOW + 1000).record, record);
  // Another pupil in the same tab: discarded and removed.
  assert.deepEqual(loadPending(s, OTHER, NOW + 1000), { record: null, discarded: "other_student" });
  assert.equal(s.map.size, 0);
});

test("one per tab: a new submission replaces the old key, so nothing accumulates", () => {
  const s = memoryStorage();
  savePending(s, make().record);
  savePending(s, make({ newId: () => "7f1c2a9e-4b7d-4e2a-9c3f-0d8b5e7a1c24", answer: "Rom" }).record);
  assert.equal(s.map.size, 1);
  assert.equal(loadPending(s, STUDENT, NOW).record.answer, "Rom");
});

test("corrupt, incomplete, padded, future or expired data is discarded, never used", () => {
  const { record } = make();
  const bad = [
    "{not json", "null", "[]", "42", JSON.stringify({ ...record, v: 2 }), JSON.stringify({ ...record, round_no: 0 }),
    JSON.stringify({ ...record, submission_id: "x" }), JSON.stringify({ ...record, answer: "" }),
    JSON.stringify({ ...record, access_token: "secret" }), JSON.stringify({ ...record, correct_answer: "Paris" }),
    JSON.stringify((({ answer, ...rest }) => rest)(record)), JSON.stringify({ ...record, created_at: NOW + 3_600_000 }),
    JSON.stringify({ ...record, answer: "x".repeat(MAX_ANSWER_LENGTH + 1) }),
  ];
  for (const raw of bad) {
    const s = memoryStorage();
    s.map.set(PENDING_STORAGE_KEY, raw);
    assert.deepEqual(loadPending(s, STUDENT, NOW), { record: null, discarded: "invalid" }, raw.slice(0, 60));
    assert.equal(s.map.size, 0, "removed");
  }
  const s = memoryStorage();
  savePending(s, record);
  assert.deepEqual(loadPending(s, STUDENT, NOW + PENDING_MAX_AGE_MS + 1), { record: null, discarded: "invalid" }, "expired");
  assert.equal(parseRecord(JSON.stringify(record), NOW).submission_id, SUB);
});

test("the storage helpers never throw on a failing or missing sessionStorage", () => {
  const { record } = make();
  assert.deepEqual(savePending(memoryStorage({ failSet: true }), record), { ok: false, error: "QuotaExceededError" });
  assert.equal(savePending(null, record).ok, false);
  assert.deepEqual(loadPending(memoryStorage({ failGet: true }), STUDENT), { record: null, discarded: "storage_unavailable" });
  assert.deepEqual(loadPending(null, STUDENT), { record: null, discarded: null });
  assert.equal(clearPending(memoryStorage({ failRemove: true })), false);
  assert.equal(clearPending(null), true);
});

// ── Storage before sending: stored AND found again, or not sent ──────────────────────────────────
test("persistAndVerify: a submission counts as stored only when it reads back identically", () => {
  const { record } = make();
  const ok = memoryStorage();
  assert.deepEqual(persistAndVerify(ok, record, NOW), { ok: true });
  assert.deepEqual(loadPending(ok, STUDENT, NOW).record, record);
  assert.deepEqual(persistAndVerify(memoryStorage({ failSet: true }), record, NOW), { ok: false, error: "QuotaExceededError" });
  assert.equal(persistAndVerify(memoryStorage({ failGet: true }), record, NOW).ok, false);
  assert.equal(persistAndVerify(null, record, NOW).ok, false);
  // A storage that accepts the write but keeps nothing (or something else) is caught by the read-back.
  const blackHole = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  assert.deepEqual(persistAndVerify(blackHole, record, NOW), { ok: false, error: "readback_mismatch" });
  const mangler = { getItem: () => JSON.stringify({ ...record, answer: "Rom" }), setItem: () => {}, removeItem: () => {} };
  assert.deepEqual(persistAndVerify(mangler, record, NOW), { ok: false, error: "readback_mismatch" });
});

test("a blocked submission keeps its identity, survives storage, and only the known marker is accepted", () => {
  const { record } = make();
  const blocked = blockRecord(record);
  assert.deepEqual({ ...blocked }, { ...record, blocked: BLOCKED_INCOMPATIBLE });
  assert.ok(Object.isFrozen(blocked));
  const s = memoryStorage();
  assert.deepEqual(persistAndVerify(s, blocked, NOW), { ok: true });
  assert.equal(loadPending(s, STUDENT, NOW).record.blocked, BLOCKED_INCOMPATIBLE);
  s.map.set(PENDING_STORAGE_KEY, JSON.stringify({ ...record, blocked: "anything" }));
  assert.deepEqual(loadPending(s, STUDENT, NOW), { record: null, discarded: "invalid" });
});

// ── What process-event's reply means (strict) ────────────────────────────────────────────────────
const RECORD = make({ roundNo: 2 }).record;
const graded = (outcome, status = "correct", over = {}) => ({ outcome, status, correct_answer: "Paris", review_text: null, misconception_type: null, round_no: 2, xp_awarded: status === "correct" ? 10 : 0, coins_awarded: status === "correct" ? 5 : 0, ...over });
const classify = (r) => classifyResponse(r, RECORD);

test("only a complete recorded / replay for THIS round is a protected success", async () => {
  assert.deepEqual(await classify({ data: graded("recorded"), error: null }), { kind: "graded", replay: false, data: graded("recorded") });
  assert.deepEqual(await classify({ data: graded("replay", "incorrect"), error: null }), { kind: "graded", replay: true, data: graded("replay", "incorrect") });
  assert.equal((await classify({ data: JSON.stringify(graded("recorded")), error: null })).kind, "graded");
});

test("a recorded / replay with a wrong, missing or invalid round_no, or broken fields, is not trusted", async () => {
  for (const over of [{ round_no: 1 }, { round_no: 3 }, { round_no: undefined }, { round_no: "2" }, { round_no: 0 },
    { status: "pending" }, { status: undefined }, { xp_awarded: -1 }, { coins_awarded: 1.5 }, { xp_awarded: undefined },
    { correct_answer: 7 }, { review_text: {} }]) {
    for (const outcome of ["recorded", "replay"]) {
      const r = await classify({ data: graded(outcome, "correct", over), error: null });
      assert.deepEqual(r, { kind: "incompatible_backend", reason: `${outcome}_contract` }, `${outcome} ${JSON.stringify(over)}`);
    }
  }
  assert.equal((await classifyResponse({ data: graded("recorded"), error: null }, undefined)).kind, "incompatible_backend", "no locked submission to compare with");
});

test("H5 on + 200 correct / incorrect / pending WITHOUT outcome (a backend without H5) is incompatible, never a success", async () => {
  for (const status of ["correct", "incorrect", "pending", "already_answered"]) {
    const legacy = { status, correct_answer: "Paris", review_text: null, misconception_type: null };
    assert.deepEqual(await classify({ data: legacy, error: null }), { kind: "incompatible_backend", reason: "no_outcome" }, status);
  }
  for (const outcome of ["round_closed", "stale_round", "not_found", "weird"]) {
    assert.deepEqual(await classify({ data: { outcome }, error: null }), { kind: "incompatible_backend", reason: "outcome_on_200" }, outcome);
  }
});

test("refusals count only with process-event's own outcome AND status", async () => {
  for (const [outcome, status] of Object.entries(REFUSAL_STATUS)) {
    const r = await classify(httpError(status, { outcome, error: "x" }));
    assert.equal(r.kind, "refused", outcome);
    assert.equal(r.outcome, outcome);
    assert.ok(REFUSAL_TEXT[outcome]);
    assert.doesNotMatch(REFUSAL_TEXT[outcome], /rigtig|forkert|korrekt/i, "a refusal never says right or wrong");
    const other = status === 409 ? 400 : 409;
    assert.equal((await classify(httpError(other, { outcome, error: "x" }))).kind, "uncertain", `${outcome} with ${other}`);
  }
  assert.deepEqual([...REFUSED_OUTCOMES].sort(), Object.keys(REFUSAL_TEXT).sort());
  // The classifier clones the Response: the body can still be read afterwards.
  const e = httpError(409, { outcome: "round_closed" });
  await classify(e);
  assert.equal((await e.error.context.json()).outcome, "round_closed");
});

test("generic 400 / 403 / 404 / 405 / 429 without H5's outcome are uncertain, never a safe refusal", async () => {
  for (const [status, body] of [[400, { error: "Missing required fields" }], [400, { error: "Invalid JSON body" }], [403, { error: "Forbidden" }],
    [404, { error: "Instance not found" }], [404, "Requested function was not found"], [405, ""], [429, { message: "rate limited" }]]) {
    assert.deepEqual(await classify(httpError(status, body)), { kind: "uncertain", reason: `http_${status}` }, `${status} ${JSON.stringify(body)}`);
  }
});

test("Match par's 400 { status: 'invalid', error } is an answer to change, and only exactly that shape", async () => {
  assert.deepEqual(await classify(httpError(400, { status: "invalid", error: "Forbind alle par, før du sender." })),
    { kind: "invalid_answer", message: "Forbind alle par, før du sender." });
  assert.equal((await classify(httpError(400, { status: "invalid" }))).kind, "uncertain", "without its message");
  assert.equal((await classify(httpError(422, { status: "invalid", error: "x" }))).kind, "uncertain", "another status");
});

test("426 client_outdated and 401 are definite; 5xx, network, relay and unreadable replies are uncertain", async () => {
  assert.deepEqual(await classify(httpError(426, { outcome: "client_outdated", error: "Client outdated" })), { kind: "client_outdated" });
  assert.equal((await classify(httpError(426, { error: "x" }))).kind, "uncertain", "426 without the outcome is not trusted");
  assert.deepEqual(await classify(httpError(401, { error: "Unauthorized" })), { kind: "unauthorized" });
  for (const status of [500, 502, 503, 504, 546]) {
    assert.deepEqual(await classify(httpError(status, { error: "Could not process answer" })), { kind: "uncertain", reason: `http_${status}` });
  }
  assert.deepEqual(await classify(fetchError()), { kind: "uncertain", reason: "FunctionsFetchError" });
  assert.deepEqual(await classify(relayError()), { kind: "uncertain", reason: "FunctionsRelayError" });
  assert.deepEqual(await classify(httpError(409, "not json")), { kind: "uncertain", reason: "http_409" });
  for (const data of [null, undefined, "", "{", [], {}]) {
    assert.equal((await classify({ data, error: null })).kind, "uncertain", JSON.stringify(data));
  }
});

test("legacy path (H5 off): only process-event's exact 426 client_outdated counts as an outdated client", async () => {
  assert.equal(await isClientOutdatedError(httpError(426, { outcome: "client_outdated" }).error), true);
  for (const e of [httpError(426, { error: "x" }).error, httpError(500, { error: "x" }).error, fetchError().error, null, undefined]) {
    assert.equal(await isClientOutdatedError(e), false);
  }
});

test("app.js: storage is verified before every send, an incompatible backend blocks, and only confirmed outcomes settle", () => {
  assert.match(APP, /if \(!readyToSend\(record\)\) return \{ handled: true \};\s*sentSubmissions\.add\(record\.submission_id\);\s*setAnswerControlsDisabled\(true\);\s*const outcome = await sendSubmission\(record\);/);
  assert.match(APP, /if \(!readyToSend\(record\)\) \{\s*questionElement\.textContent = "Dit sidste svar er ikke afsluttet endnu\.";\s*return false;\s*\}\s*const outcome = await sendSubmission\(record\);/);
  assert.equal((APP.match(/await sendSubmission\(record\)/g) ?? []).length, 2, "two sends, both behind readyToSend");
  assert.equal((APP.match(/readyToSend\(record\)/g) ?? []).length, 3, "defined once, used before both sends");
  // A blocked submission is never sent: checked before a send and on recovery, before any network call.
  assert.match(APP, /if \(pendingSubmission && pendingSubmission\.blocked\) \{\s*showIncompatible\(\);\s*return \{ handled: true \};\s*\}/);
  assert.match(APP, /if \(record\.blocked\) \{[\s\S]{0,200}?showIncompatible\(\);\s*return false;\s*\}/);
  assert.doesNotMatch(APP, /graded_unprotected|outcome\.kind === "pending"/);
  // settleSubmission (which drops the stored submission) follows only a confirmed outcome or a pupil switch.
  const contexts = [...APP.matchAll(/settleSubmission\(\);/g)].map((m) => APP.slice(Math.max(0, m.index - 260), m.index));
  assert.ok(contexts.length >= 6);
  for (const ctx of contexts) {
    assert.match(ctx, /outcome\.kind === "(graded|refused|invalid_answer|client_outdated)"|owner === "other"/, ctx.slice(-140));
  }
});
