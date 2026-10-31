// H5 PR 3 (D-266, D-273): process-event with two answer paths.
//
//   legacy — no round_no and no submission_id: exactly version 34 (golden file below).
//   h5     — both, valid: process_question_attempt_v2 / process_text_answer_v2, the seven outcomes.
//   invalid — one alone or malformed: 400 before anything is read or written; never the legacy path.
//
// Runs the REAL index.ts through tests/unit/helpers/process-event-harness.mjs (recording supabase-js
// stand-in). tests/fixtures/process-event-v34-parity.json was written by the same harness from the
// files deployed as version 34 (byte-identical to commit 03f5954).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { LEGACY_CASES, STUDENT, loadHandler, runCase } from "./helpers/process-event-harness.mjs";
import { answerMode, replyForV2, isRevokedLegacyRpc } from "../../supabase/functions/process-event/answer-v2.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GOLDEN = JSON.parse(readFileSync(join(ROOT, "tests", "fixtures", "process-event-v34-parity.json"), "utf8"));
const loaded = loadHandler(join(ROOT, "supabase", "functions", "process-event", "index.ts"));
loaded.catch(() => {});

const SUB = "6f1c2a9e-4b7d-4e2a-9c3f-0d8b5e7a1c24";
const V2 = { mc: "process_question_attempt_v2", text: "process_text_answer_v2" };
const LEGACY_RPCS = ["process_question_attempt", "process_text_answer"];
const LONG = Array.from({ length: 25 }, (_, i) => "ord" + i).join(" ");

async function send(c) {
  const handler = await loaded;
  const r = await runCase(handler, c);
  let json = null;
  try { json = JSON.parse(r.body); } catch { /* not JSON */ }
  return { ...r, json };
}
const h5Body = (instance, answer, extra = {}) => ({ question_instance_id: instance, answer, round_no: 1, submission_id: SUB, ...extra });
const rpcs = (r) => r.calls.filter((c) => c.kind === "rpc");
const writes = (r) => r.calls.filter((c) => c.kind === "from" && c.ops.some((o) => o[0] === "update"));
const backendCalls = (r) => r.calls.filter((c) => c.kind === "from" || c.kind === "rpc");
const adminCreated = (r) => r.calls.some((c) => c.createClient === "admin");

// A backend whose _v2 functions answer `result` (a function of the call's args, or a value).
const v2Returns = (result) => (kind, name, ops, client, base) => {
  if (kind === "rpc" && (name === V2.mc || name === V2.text)) {
    const value = typeof result === "function" ? result(ops[0][1], name) : result;
    return { data: value, error: null };
  }
  return base;
};
const v2Fails = (error) => (kind, name, ops, client, base) =>
  kind === "rpc" && (name === V2.mc || name === V2.text) ? { data: null, error } : base;

const recorded = (over = {}) => ({
  outcome: "recorded", status: "correct", correct_answer: "a", review_text: null, misconception_type: null,
  xp_awarded: 10, coins_awarded: 5, round_no: 1, ...over,
});

// ── Legacy: version 34, call for call ────────────────────────────────────────────────────────────
test("the golden file is version 34's", () => {
  assert.equal(GOLDEN.source.version, 34);
  assert.equal(GOLDEN.source.ezbr_sha256, "9efa541c4482b0ea593d6a3684e0bf3de0365e6b97f3c35b8137918514f0f11c");
  assert.equal(GOLDEN.source.manifest_sha256, "dbdadf81da912bf4a962e5f2937b3d147f0fc930afeb4663bb89ac2674ceb2ff");
  assert.deepEqual(Object.keys(GOLDEN.cases), Object.keys(LEGACY_CASES));
});

test("legacy requests (no round_no, no submission_id) behave exactly as version 34", async () => {
  for (const [name, c] of Object.entries(LEGACY_CASES)) {
    const r = await send(c);
    const { json, ...actual } = r;
    assert.deepEqual(actual, GOLDEN.cases[name], name);
  }
});

test("the legacy path never calls a _v2 function", async () => {
  for (const [name, c] of Object.entries(LEGACY_CASES)) {
    const r = await send(c);
    assert.ok(!rpcs(r).some((x) => x.name.endsWith("_v2")), name);
  }
});

// ── Choosing the path ────────────────────────────────────────────────────────────────────────────
test("answerMode: both fields → h5, neither → legacy, one or a malformed one → invalid", () => {
  assert.deepEqual(answerMode({ answer: "a" }), { kind: "legacy" });
  assert.deepEqual(answerMode({ answer: "a", round_no: 3, submission_id: SUB }), { kind: "h5", roundNo: 3, submissionId: SUB });
  assert.deepEqual(answerMode({ answer: "a", round_no: 1, submission_id: SUB.toUpperCase() }).kind, "h5");
  const invalid = [
    [{ answer: "a", round_no: 1 }, "incomplete_h5_fields"],
    [{ answer: "a", submission_id: SUB }, "incomplete_h5_fields"],
    [{ answer: "a", round_no: null }, "incomplete_h5_fields"],
    [{ answer: "a", round_no: null, submission_id: null }, "invalid_round_no"],
    [{ answer: "a", round_no: 0, submission_id: SUB }, "invalid_round_no"],
    [{ answer: "a", round_no: -1, submission_id: SUB }, "invalid_round_no"],
    [{ answer: "a", round_no: 1.5, submission_id: SUB }, "invalid_round_no"],
    [{ answer: "a", round_no: "1", submission_id: SUB }, "invalid_round_no"],
    [{ answer: "a", round_no: 2147483648, submission_id: SUB }, "invalid_round_no"],
    [{ answer: "a", round_no: 1, submission_id: null }, "invalid_submission_id"],
    [{ answer: "a", round_no: 1, submission_id: "abc" }, "invalid_submission_id"],
    [{ answer: "a", round_no: 1, submission_id: 123 }, "invalid_submission_id"],
    [{ answer: "a", round_no: 1, submission_id: SUB + "0" }, "invalid_submission_id"],
    [{ answer: 42, round_no: 1, submission_id: SUB }, "invalid_answer"],
  ];
  for (const [body, reason] of invalid) assert.deepEqual(answerMode(body), { kind: "invalid", reason }, JSON.stringify(body));
});

test("an incomplete or malformed H5 request is rejected before anything is read or written", async () => {
  const bodies = [
    { question_instance_id: "mc-1", answer: "a", round_no: 1 },
    { question_instance_id: "mc-1", answer: "a", submission_id: SUB },
    { question_instance_id: "txt-1", answer: "Paris", round_no: 0, submission_id: SUB },
    { question_instance_id: "num-1", answer: "42", round_no: 1, submission_id: "not-a-uuid" },
    { question_instance_id: "long-1", answer: LONG, round_no: 1 },
  ];
  for (const body of bodies) {
    const r = await send({ body });
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.equal(r.json.outcome, "invalid_request");
    assert.equal(typeof r.json.reason, "string");
    assert.equal("status" in r.json, false);
    assert.deepEqual(backendCalls(r), [], "no read, no RPC, no write");
    assert.equal(adminCreated(r), false, "no backend key is even resolved");
  }
});

// ── Routing and arguments ────────────────────────────────────────────────────────────────────────
test("MC, number and short text go to their _v2 function, through the admin client, with the verified user", async () => {
  const cases = [
    ["mc-1", "a", V2.mc, { p_student_id: STUDENT, p_question_instance_id: "mc-1", p_answer: "a", p_round_no: 2, p_submission_id: SUB, p_review_text: "Husk: R", p_misconception_type: "M-type" }],
    ["num-1", "41", V2.mc, { p_student_id: STUDENT, p_question_instance_id: "num-1", p_answer: "41", p_round_no: 2, p_submission_id: SUB, p_review_text: "Husk: R", p_misconception_type: "M-type" }],
    ["txt-1", " paris. ", V2.text, { p_instance_id: "txt-1", p_user_id: STUDENT, p_user_answer: " paris. ", p_is_correct: true, p_round_no: 2, p_submission_id: SUB, p_review_text: "Husk: R", p_misconception_type: "M-type" }],
    ["txt-1", "Lyon", V2.text, { p_instance_id: "txt-1", p_user_id: STUDENT, p_user_answer: "Lyon", p_is_correct: false, p_round_no: 2, p_submission_id: SUB, p_review_text: "Husk: R", p_misconception_type: "M-type" }],
  ];
  for (const [instance, answer, fn, args] of cases) {
    // A manipulated body cannot choose the pupil.
    const body = h5Body(instance, answer, { round_no: 2, student_id: "stu-2", user_id: "stu-2", p_student_id: "stu-2" });
    const r = await send({ body, backend: v2Returns(recorded({ round_no: 2 })) });
    const label = `${instance} ${answer}`;
    assert.equal(r.status, 200, label);
    assert.deepEqual(rpcs(r).map((x) => [x.client, x.name]), [["admin", fn]], label);
    assert.deepEqual(rpcs(r)[0].ops[0][1], args, label);
  }
});

test("a long answer keeps the teacher path even with valid H5 fields", async () => {
  const r = await send({ body: h5Body("long-1", LONG) });
  const legacy = GOLDEN.cases["long saved"];
  assert.equal(r.status, legacy.status);
  assert.equal(r.body, legacy.body);
  assert.deepEqual(r.calls, legacy.calls);
  assert.ok(!rpcs(r).length);
  const short = await send({ body: h5Body("long-1", "for kort svar") });
  assert.equal(short.body, GOLDEN.cases["long too short"].body);
});

// ── The seven outcomes ───────────────────────────────────────────────────────────────────────────
test("recorded: 200 with the database's result and outcome", async () => {
  for (const instance of ["mc-1", "num-1", "txt-1"]) {
    const db = recorded({ status: "incorrect", correct_answer: "K", review_text: "Husk: R", misconception_type: "M-type", xp_awarded: 0, coins_awarded: 0 });
    const r = await send({ body: h5Body(instance, "x"), backend: v2Returns(db) });
    assert.equal(r.status, 200, instance);
    assert.deepEqual(r.json, db, instance);
  }
});

test("replay: the frozen original result, not re-graded against today's answer key", async () => {
  // The instance's key is now "a"; the attempt froze "old-key" and "incorrect".
  const frozen = recorded({ outcome: "replay", status: "incorrect", correct_answer: "old-key", review_text: "gammel", misconception_type: "gammel-M", xp_awarded: 0, coins_awarded: 0 });
  for (const instance of ["mc-1", "txt-1"]) {
    const first = await send({ body: h5Body(instance, "a"), backend: v2Returns(frozen) });
    const again = await send({ body: h5Body(instance, "a"), backend: v2Returns(frozen) });
    for (const r of [first, again]) {
      assert.equal(r.status, 200);
      assert.deepEqual(r.json, frozen);
      assert.deepEqual(writes(r), [], "a replay writes nothing");
      assert.equal(rpcs(r).length, 1);
    }
  }
});

test("refusals: round_closed, stale_round, submission_conflict, not_found, invalid_request", async () => {
  const expected = {
    round_closed:        [409, { outcome: "round_closed", error: "Round already closed" }],
    stale_round:         [409, { outcome: "stale_round", error: "Answer belongs to an earlier round" }],
    submission_conflict: [409, { outcome: "submission_conflict", error: "Submission id already used" }],
    not_found:           [404, { outcome: "not_found", error: "Instance not found" }],
  };
  for (const instance of ["mc-1", "txt-1"]) {
    for (const [outcome, [status, body]] of Object.entries(expected)) {
      const r = await send({ body: h5Body(instance, "a"), backend: v2Returns({ outcome }) });
      assert.equal(r.status, status, `${instance} ${outcome}`);
      assert.deepEqual(r.json, body, `${instance} ${outcome}`);
      assert.deepEqual(writes(r), [], `${instance} ${outcome}: nothing written`);
      assert.ok(!rpcs(r).some((x) => LEGACY_RPCS.includes(x.name)), "no new submission, no legacy retry");
      assert.equal(rpcs(r).length, 1, "submission_conflict never retries with another id");
    }
    for (const reason of ["missing_identity", "invalid_round", "missing_answer", "missing_verdict", "answer_path", "round_ahead"]) {
      const r = await send({ body: h5Body(instance, "a"), backend: v2Returns({ outcome: "invalid_request", reason }) });
      assert.equal(r.status, 400);
      assert.deepEqual(r.json, { outcome: "invalid_request", error: "Invalid request", reason });
    }
    const odd = await send({ body: h5Body(instance, "a"), backend: v2Returns({ outcome: "invalid_request", reason: "relation \"x\" leaked" }) });
    assert.deepEqual(odd.json, { outcome: "invalid_request", error: "Invalid request" }, "an unknown reason is not passed on");
  }
});

test("an instance that does not exist is not_found on the H5 path; a foreign one is 403; a read error 500", async () => {
  const missing = await send({ body: h5Body("nope", "a") });
  assert.equal(missing.status, 404);
  assert.deepEqual(missing.json, { outcome: "not_found", error: "Instance not found" });
  const foreign = await send({ body: h5Body("foreign-1", "a") });
  assert.equal(foreign.status, 403);
  assert.deepEqual(rpcs(foreign), [], "another pupil's instance never reaches an answer function");
  const readError = await send({
    body: h5Body("mc-1", "a"),
    backend: (k, n, o, c, b) => (k === "from" && o.some((x) => x[0] === "maybeSingle") ? { data: null, error: { message: "read failed" } } : b),
  });
  assert.equal(readError.status, 500);
  assert.deepEqual(rpcs(readError), []);
});

test("a malformed or unknown _v2 result is a 500, never a success", async () => {
  const bad = [
    null, [], "recorded", { outcome: "weird" }, {},
    recorded({ status: "pending" }), recorded({ status: undefined }), recorded({ round_no: 2 }),
    recorded({ xp_awarded: -1 }), recorded({ coins_awarded: 1.5 }), recorded({ correct_answer: 7 }),
    recorded({ outcome: "replay", round_no: null }),
  ];
  for (const instance of ["mc-1", "txt-1"]) {
    for (const db of bad) {
      const r = await send({ body: h5Body(instance, "a"), backend: v2Returns(db) });
      assert.equal(r.status, 500, JSON.stringify(db));
      assert.deepEqual(r.json, { error: "Could not process answer" });
      assert.deepEqual(writes(r), [], "nothing written after an unexpected result");
    }
  }
});

// ── Errors ───────────────────────────────────────────────────────────────────────────────────────
test("a missing _v2 function or a missing privilege is a controlled 500: no detail, no fallback", async () => {
  const errors = [
    { code: "PGRST202", message: "Could not find the function public.process_question_attempt_v2(...) in the schema cache", hint: "secret hint" },
    { code: "42501", message: "permission denied for function process_question_attempt_v2" },
    { code: "42501", message: "permission denied for function process_text_answer_v2" },
    { code: "XX000", message: "internal: relation question_attempts", details: "student stu-2" },
  ];
  for (const instance of ["mc-1", "txt-1"]) {
    for (const error of errors) {
      const r = await send({ body: h5Body(instance, "a"), backend: v2Fails(error) });
      assert.equal(r.status, 500);
      assert.deepEqual(r.json, { error: "Could not process answer" });
      assert.ok(!rpcs(r).some((x) => LEGACY_RPCS.includes(x.name)), "never falls back to the legacy function");
      assert.deepEqual(writes(r), []);
      assert.doesNotMatch(r.body, /schema|permission|relation|stu-2|hint/);
      assert.ok(r.logs.some((l) => l.includes(`"code":"${error.code}"`)), "the code is logged");
      assert.ok(!r.logs.some((l) => l.includes(error.message)), "the message is not logged");
    }
  }
});

test("a missing backend key stops the H5 path before any answer function", async () => {
  for (const instance of ["mc-1", "txt-1"]) {
    const r = await send({ body: h5Body(instance, "a"), env: { SUPABASE_SERVICE_ROLE_KEY: undefined } });
    assert.equal(r.status, 500);
    assert.deepEqual(r.json, { error: "Server configuration error" });
    assert.deepEqual(rpcs(r), []);
  }
});

// ── M2: the legacy functions revoked from service_role ───────────────────────────────────────────
test("M2: a legacy request after REVOKE EXECUTE gets 426 client_outdated and nothing is written", async () => {
  const revoked = (kind, name, ops, client, base) =>
    kind === "rpc" && LEGACY_RPCS.includes(name) ? { data: null, error: { code: "42501", message: `permission denied for function ${name}` } } : base;
  for (const [instance, answer] of [["mc-1", "b"], ["num-1", "41"], ["txt-1", "Lyon"]]) {
    const r = await send({ body: { question_instance_id: instance, answer }, backend: revoked });
    assert.equal(r.status, 426, instance);
    assert.deepEqual(r.json, { outcome: "client_outdated", error: "Client outdated" });
    assert.deepEqual(writes(r), [], "no misconception signal, no next_review_at");
    assert.ok(!rpcs(r).some((x) => x.name.endsWith("_v2")), "an old client is not upgraded behind its back");
  }
});

test("isRevokedLegacyRpc matches only the privilege error of that function", () => {
  assert.equal(isRevokedLegacyRpc({ code: "42501", message: "permission denied for function process_question_attempt" }, "process_question_attempt"), true);
  assert.equal(isRevokedLegacyRpc({ code: "42501", message: "permission denied for function public.process_text_answer" }, "process_text_answer"), true);
  assert.equal(isRevokedLegacyRpc({ code: "42501", message: "permission denied for function process_text_answer" }, "process_question_attempt"), false);
  assert.equal(isRevokedLegacyRpc({ code: "42501", message: "permission denied for table question_instances" }, "process_question_attempt"), false);
  assert.equal(isRevokedLegacyRpc({ code: "P0001", message: "permission denied for function process_question_attempt" }, "process_question_attempt"), false);
  assert.equal(isRevokedLegacyRpc(null, "process_question_attempt"), false);
});

test("other legacy errors keep their version 34 response", async () => {
  const otherDenied = (kind, name, ops, client, base) =>
    kind === "rpc" ? { data: null, error: { code: "42501", message: "permission denied for table student_progress" } } : base;
  const r = await send({ body: { question_instance_id: "mc-1", answer: "a" }, backend: otherDenied });
  assert.equal(r.status, 500);
  assert.deepEqual(r.json, { error: "permission denied for table student_progress" });
});

// ── Side effects ─────────────────────────────────────────────────────────────────────────────────
test("H5 writes nothing after the _v2 call: no misconception signal, no next_review_at", async () => {
  // The signal (and, for short text, next_review_at) is written by the _v2 function in its own
  // transaction. The legacy MC path's next_review_at write changes no row (pupil client, no UPDATE
  // policy) and is not repeated on the H5 path.
  const wrong = recorded({ status: "incorrect", correct_answer: "a", review_text: "Husk: R", misconception_type: "M-type", xp_awarded: 0, coins_awarded: 0 });
  for (const [instance, db] of [["mc-1", wrong], ["mc-1", recorded()], ["num-1", wrong], ["txt-1", wrong], ["txt-1", recorded()]]) {
    const r = await send({ body: h5Body(instance, "b"), backend: v2Returns(db) });
    assert.equal(r.status, 200, instance);
    assert.deepEqual(writes(r), [], instance);
    assert.deepEqual(backendCalls(r).map((c) => [c.client, c.kind, c.name]),
      [["admin", "from", "question_instances"], ["admin", "rpc", instance === "txt-1" ? V2.text : V2.mc]],
      `${instance}: the grading read and the one _v2 call, nothing else`);
  }
  // The legacy path still makes its version 34 writes (proven call for call by the golden file).
  const legacy = await send({ body: { question_instance_id: "mc-1", answer: "b" } });
  assert.equal(writes(legacy).length, 2);
});

test("a technical retry (same submission_id) pays and writes nothing new in process-event", async () => {
  // The database answers the first call recorded and every later one replay (its contract);
  // process-event adds nothing on top of a replay.
  let n = 0;
  const backend = v2Returns(() => (n++ === 0 ? recorded() : recorded({ outcome: "replay" })));
  const first = await send({ body: h5Body("mc-1", "a"), backend });
  const retry = await send({ body: h5Body("mc-1", "a"), backend });
  assert.equal(first.json.outcome, "recorded");
  assert.equal(retry.json.outcome, "replay");
  assert.deepEqual(writes(first), []);
  assert.deepEqual(writes(retry), []);
  assert.equal(rpcs(retry).length, 1, "one _v2 call; the database decides it is a replay");
  assert.deepEqual({ ...retry.json, outcome: "recorded" }, first.json, "the same result both times");
});

test("the same submission_id with a changed answer is a conflict: no new id, no second attempt", async () => {
  // The database compares instance, round and answer of the stored attempt (its contract).
  const backend = v2Returns((args) => (args.p_answer === "a" ? recorded() : { outcome: "submission_conflict" }));
  const first = await send({ body: h5Body("mc-1", "a"), backend });
  const changed = await send({ body: h5Body("mc-1", "b"), backend });
  assert.equal(first.json.outcome, "recorded");
  assert.equal(changed.status, 409);
  assert.deepEqual(changed.json, { outcome: "submission_conflict", error: "Submission id already used" });
  assert.deepEqual(rpcs(changed).map((x) => x.ops[0][1].p_submission_id), [SUB], "one call, with the client's own id");
  assert.deepEqual(writes(changed), []);
});

test("replyForV2 is the single mapping: every outcome has a fixed status", () => {
  const statuses = Object.fromEntries(
    ["recorded", "replay", "round_closed", "stale_round", "submission_conflict", "not_found", "invalid_request"]
      .map((o) => [o, replyForV2(o === "recorded" || o === "replay" ? recorded({ outcome: o }) : { outcome: o }, 1).status]));
  assert.deepEqual(statuses, {
    recorded: 200, replay: 200, round_closed: 409, stale_round: 409, submission_conflict: 409, not_found: 404, invalid_request: 400,
  });
});
