// Lærligverse L5 + L3 in process-event: LAERLIGVERSE_ATTEMPT_CONTEXT derives the _v2 arguments p_mode and
// p_hints_used from the instance's served_mode and the server's hint log (migration 20261108043500). Runs the REAL
// process-event/index.ts against the recording stand-in (tests/unit/helpers/process-event-harness.mjs).
//
// What this proves:
//   * OFF PARITY: unset or anything but exactly "on" → every H5 request is identical (status, body, every backend
//     call with its arguments, every log line) to the switch unset, with p_mode "quiz_v1" and p_hints_used 0 and no
//     extra read; a legacy request is identical with the switch on, too (no mode on that path).
//   * ON: one extra backend read (served_mode scoped to instance + verified pupil; the hint log scoped to instance +
//     pupil + the round the answer names), then p_mode = served_mode (NULL → quiz_v1) and p_hints_used = distinct
//     logged levels (capped at 3). Nothing else in the _v2 call changes.
//   * The body cannot steer it: mode / served_mode / hints_used / hints in the body change nothing, off or on.
//   * Fail loud: an unknown served_mode, a missing instance, a failed or malformed hint read → 500 and NO _v2 call.
//   * Hints cannot pay: in K1's _v2 bodies p_mode and p_hints_used appear only in the validation and in the attempt
//     row's VALUES — never in an amount, a streak, a quest or an instance write.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { STUDENT, loadHandler, runCase } from "./helpers/process-event-harness.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const handler = await loadHandler(join(ROOT, "supabase", "functions", "process-event", "index.ts"));

const SUB = "6f1c2a3b-4d5e-4f60-8a71-92b3c4d5e6f7";
const V2 = { "mc-1": "process_question_attempt_v2", "txt-1": "process_text_answer_v2" };
const recorded = { outcome: "recorded", status: "correct", correct_answer: "a", review_text: null, misconception_type: null, round_no: 1, xp_awarded: 10, coins_awarded: 5 };
const isFacts = (name, ops) => name === "question_instances" && ops.some((o) => o[0] === "select" && o[1] === "served_mode");
const isHints = (name) => name === "question_hint_requests";

function backend({ servedMode = null, hintRows = [], hintError = null, instance = "present" } = {}) {
  return (kind, name, ops, client, base) => {
    if (kind === "rpc" && (name === "process_question_attempt_v2" || name === "process_text_answer_v2")) {
      const round = ops[0][1].p_round_no;
      return { data: { ...recorded, round_no: round }, error: null };
    }
    if (kind === "from" && isFacts(name, ops)) return { data: instance === "present" ? { served_mode: servedMode } : null, error: null };
    if (kind === "from" && isHints(name)) return hintError ? { data: null, error: hintError } : { data: hintRows, error: null };
    return base;
  };
}
const h5Body = (instance, extra = {}) => ({ question_instance_id: instance, answer: instance === "txt-1" ? "Paris" : "a", round_no: 1, submission_id: SUB, ...extra });
const send = (instance, { flag, extra, facts } = {}) =>
  runCase(handler, { body: h5Body(instance, extra), backend: backend(facts), env: { LAERLIGVERSE_ATTEMPT_CONTEXT: flag } });
const v2Args = (r, instance) => r.calls.find((c) => c.kind === "rpc" && c.name === V2[instance])?.ops[0][1] ?? null;
const reads = (r) => r.calls.filter((c) => c.kind === "from" && (isHints(c.name) || isFacts(c.name, c.ops)));

const OFF = [undefined, "", "off", "ON", "On", "true", "1", " on", "on "];

test("off parity: anything but exactly \"on\" → identical to unset, p_mode quiz_v1 / p_hints_used 0, no extra read", async () => {
  for (const instance of Object.keys(V2)) {
    const base = await send(instance, { facts: { servedMode: "check", hintRows: [{ hint_level: 1 }] } });
    assert.equal(base.status, 200, base.body);
    const args = v2Args(base, instance);
    assert.equal(args.p_mode, "quiz_v1");
    assert.equal(args.p_hints_used, 0);
    assert.deepEqual(reads(base), [], "no served_mode or hint-log read while off");
    for (const v of OFF) assert.deepEqual(await send(instance, { flag: v, facts: { servedMode: "check", hintRows: [{ hint_level: 1 }] } }), base, `${instance} ${JSON.stringify(v)}`);
  }
});

test("off: body fields mode / served_mode / hints_used / hints are ignored", async () => {
  const forged = { mode: "check", served_mode: "application", hints_used: 3, hints: 2, p_mode: "review", p_hints_used: 1 };
  for (const instance of Object.keys(V2)) {
    assert.deepEqual(await send(instance, { extra: forged }), await send(instance), instance);
  }
});

test("legacy path (no round_no / submission_id): identical with the switch on", async () => {
  for (const instance of ["mc-1", "txt-1", "long-1"]) {
    const body = { question_instance_id: instance, answer: instance === "long-1" ? "ord ".repeat(25) : "a" };
    const off = await runCase(handler, { body });
    const on = await runCase(handler, { body, env: { LAERLIGVERSE_ATTEMPT_CONTEXT: "on" } });
    assert.deepEqual(on, off, instance);
    assert.deepEqual(reads(on), []);
  }
});

test("on: p_mode = served_mode, p_hints_used = distinct logged levels; nothing else in the _v2 call changes", async () => {
  for (const instance of Object.keys(V2)) {
    const off = await send(instance);
    const on = await send(instance, { flag: "on", facts: { servedMode: "check", hintRows: [{ hint_level: 1 }, { hint_level: 2 }, { hint_level: 2 }] } });
    assert.equal(on.status, 200, on.body);
    const a = v2Args(on, instance);
    assert.equal(a.p_mode, "check");
    assert.equal(a.p_hints_used, 2, "distinct levels, a repeated level counts once");
    assert.deepEqual({ ...a, p_mode: "quiz_v1", p_hints_used: 0 }, v2Args(off, instance), "only p_mode and p_hints_used differ");
    assert.equal(on.body, off.body, "the reply is the database's, unchanged");
    // The facts read: served_mode scoped to the instance AND the verified pupil, the log to instance, pupil, round.
    const [factsCall, hintsCall] = reads(on);
    assert.equal(factsCall.client, "admin");
    assert.deepEqual(factsCall.ops.filter((o) => o[0] === "eq"), [["eq", "id", instance], ["eq", "student_id", STUDENT]]);
    assert.equal(hintsCall.client, "admin");
    assert.deepEqual(hintsCall.ops, [["select", "hint_level"], ["eq", "question_instance_id", instance], ["eq", "student_id", STUDENT], ["eq", "round_no", 1]]);
  }
});

test("on: NULL served_mode → quiz_v1; no hints → 0; three or more levels → 3; the round counted is the answer's", async () => {
  const r0 = await send("mc-1", { flag: "on", facts: { servedMode: null, hintRows: [] } });
  assert.deepEqual([v2Args(r0, "mc-1").p_mode, v2Args(r0, "mc-1").p_hints_used], ["quiz_v1", 0]);
  for (const mode of ["practice", "check", "review", "application", "quiz_v1"]) {
    const r = await send("mc-1", { flag: "on", facts: { servedMode: mode, hintRows: [{ hint_level: 3 }, { hint_level: 1 }, { hint_level: 2 }] } });
    assert.deepEqual([v2Args(r, "mc-1").p_mode, v2Args(r, "mc-1").p_hints_used], [mode, 3]);
  }
  const r2 = await runCase(handler, { body: h5Body("mc-1", { round_no: 2 }), backend: backend({ servedMode: null, hintRows: [{ hint_level: 1 }] }), env: { LAERLIGVERSE_ATTEMPT_CONTEXT: "on" } });
  assert.deepEqual(reads(r2)[1].ops.at(-1), ["eq", "round_no", 2]);
});

test("on: the body cannot steer it — forged mode / hints fields change nothing", async () => {
  const forged = { mode: "application", served_mode: "review", hints_used: 0, hints: 0, p_mode: "check", p_hints_used: 0 };
  for (const instance of Object.keys(V2)) {
    const facts = { servedMode: "practice", hintRows: [{ hint_level: 1 }] };
    const clean = await send(instance, { flag: "on", facts });
    const withForged = await send(instance, { flag: "on", facts, extra: forged });
    assert.deepEqual(withForged, clean, instance);
    assert.deepEqual([v2Args(withForged, instance).p_mode, v2Args(withForged, instance).p_hints_used], ["practice", 1]);
  }
});

test("on, fail loud: unknown served_mode, missing instance, failed or malformed hint log → 500 and no _v2 call", async () => {
  const cases = [
    { servedMode: "diagnostic" }, { servedMode: "independent" }, { servedMode: 7 },
    { instance: "missing" },
    { hintError: { code: "42P01", message: "relation does not exist" } },
    { hintRows: [{ hint_level: 4 }] }, { hintRows: [{ hint_level: "1" }] }, { hintRows: [{}] }, { hintRows: null },
  ];
  for (const instance of Object.keys(V2)) {
    for (const facts of cases) {
      const r = await send(instance, { flag: "on", facts });
      assert.equal(r.status, 500, JSON.stringify(facts));
      assert.deepEqual(JSON.parse(r.body), { error: "Could not process answer" });
      assert.equal(v2Args(r, instance), null, "nothing recorded");
      assert.ok(r.logs.some((l) => l.startsWith("ERR ATTEMPT CONTEXT ERROR:")), "logged");
      assert.equal(r.logs.some((l) => l.includes("relation does not exist")), false, "no database message in the log line");
    }
  }
});

test("hints cannot pay: in K1's _v2 bodies p_mode / p_hints_used are only validated and stored in the attempt row", () => {
  const k1 = readFileSync(join(ROOT, "supabase", "migrations", "20261103110000_l1_k1_attempt_context.sql"), "utf8").split("\r\n").join("\n");
  const bodies = [...k1.matchAll(/CREATE FUNCTION public\.(process_question_attempt_v2|process_text_answer_v2)\([\s\S]*?AS \$function\$([\s\S]*?)\$function\$/g)];
  assert.equal(bodies.length, 2);
  for (const [, fn, body] of bodies) {
    const lines = body.split("\n").filter((l) => /p_hints_used|p_mode/.test(l)).map((l) => l.trim());
    assert.deepEqual(lines, [
      "IF p_mode IS NULL OR p_mode NOT IN ('quiz_v1', 'diagnostic', 'practice', 'check', 'review', 'application') THEN",
      "IF p_hints_used IS NULL OR p_hints_used < 0 OR p_hints_used > 3 THEN",
      "p_mode, p_hints_used, v_interval, v_content_sha)",
    ], fn);
  }
});
