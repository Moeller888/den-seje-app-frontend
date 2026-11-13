// Lærligverse L5 + L3 in process-event: LAERLIGVERSE_ATTEMPT_CONTEXT routes an H5 answer to the database wrapper
// (process_question_attempt_with_context / process_text_answer_with_context, migration 20261108043500), which derives
// mode and hints in the answer's own transaction. Runs the REAL process-event/index.ts against the recording stand-in
// (tests/unit/helpers/process-event-harness.mjs). The wrapper's database behaviour is proven in
// laerligverse-l3-l5-migration-run.test.mjs (PGlite) and laerligverse-l3-l5-concurrency.test.mjs (real PostgreSQL).
//
// What this proves:
//   * OFF PARITY: unset or anything but exactly "on" → every H5 request is identical (status, body, every backend
//     call with its arguments, every log line) to the switch unset: K1's _v2 with p_mode "quiz_v1", p_hints_used 0.
//     A legacy request is identical with the switch on, too (no mode on that path).
//   * ON: the ONE answer call goes to the wrapper with exactly _v2's arguments minus p_mode / p_hints_used — process-
//     event sends no mode or hints at all and makes no extra read; the reply mapping is the _v2 one.
//   * The body cannot steer it: mode / served_mode / hints_used / hints in the body change nothing, off or on.
//   * Fail loud: a wrapper error (e.g. migration not applied) is a 500, never a fallback to _v2; the anti-guess
//     cooldown (#610) raised inside the wrapper's transaction gives the same 429 as through _v2.
//   * Hints cannot pay: in K1's _v2 bodies p_mode and p_hints_used appear only in the validation and in the attempt
//     row's VALUES — never in an amount, a streak, a quest or an instance write.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadHandler, runCase } from "./helpers/process-event-harness.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const handler = await loadHandler(join(ROOT, "supabase", "functions", "process-event", "index.ts"));

const SUB = "6f1c2a3b-4d5e-4f60-8a71-92b3c4d5e6f7";
const V2 = { "mc-1": "process_question_attempt_v2", "txt-1": "process_text_answer_v2" };
const WRAP = { "mc-1": "process_question_attempt_with_context", "txt-1": "process_text_answer_with_context" };
const recorded = { outcome: "recorded", status: "correct", correct_answer: "a", review_text: null, misconception_type: null, round_no: 1, xp_awarded: 10, coins_awarded: 5 };
const ANSWER_RPCS = new Set([...Object.values(V2), ...Object.values(WRAP)]);

function backend({ error = null } = {}) {
  return (kind, name, ops, client, base) => {
    if (kind === "rpc" && ANSWER_RPCS.has(name)) {
      if (error) return { data: null, error };
      return { data: { ...recorded, round_no: ops[0][1].p_round_no }, error: null };
    }
    return base;
  };
}
const h5Body = (instance, extra = {}) => ({ question_instance_id: instance, answer: instance === "txt-1" ? "Paris" : "a", round_no: 1, submission_id: SUB, ...extra });
const send = (instance, { flag, extra, error } = {}) =>
  runCase(handler, { body: h5Body(instance, extra), backend: backend({ error }), env: { LAERLIGVERSE_ATTEMPT_CONTEXT: flag } });
const answerCalls = (r) => r.calls.filter((c) => c.kind === "rpc" && ANSWER_RPCS.has(c.name));

const OFF = [undefined, "", "off", "ON", "On", "true", "1", " on", "on "];

test("off parity: anything but exactly \"on\" → identical to unset: K1's _v2 with quiz_v1 / 0, no wrapper", async () => {
  for (const instance of Object.keys(V2)) {
    const base = await send(instance);
    assert.equal(base.status, 200, base.body);
    const calls = answerCalls(base);
    assert.deepEqual(calls.map((c) => c.name), [V2[instance]]);
    assert.equal(calls[0].ops[0][1].p_mode, "quiz_v1");
    assert.equal(calls[0].ops[0][1].p_hints_used, 0);
    for (const v of OFF) assert.deepEqual(await send(instance, { flag: v }), base, `${instance} ${JSON.stringify(v)}`);
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
    assert.equal(on.calls.some((c) => c.kind === "rpc" && Object.values(WRAP).includes(c.name)), false);
  }
});

test("on: the one answer call goes to the wrapper with _v2's arguments minus p_mode / p_hints_used; nothing else changes", async () => {
  for (const instance of Object.keys(V2)) {
    const off = await send(instance);
    const on = await send(instance, { flag: "on" });
    assert.equal(on.status, 200, on.body);
    const [call] = answerCalls(on);
    assert.equal(answerCalls(on).length, 1);
    assert.equal(call.name, WRAP[instance]);
    assert.equal(call.client, "admin");
    const offArgs = { ...answerCalls(off)[0].ops[0][1] };
    delete offArgs.p_mode;
    delete offArgs.p_hints_used;
    assert.deepEqual(call.ops[0][1], offArgs, "exactly _v2's arguments without mode and hints");
    assert.equal("p_mode" in call.ops[0][1] || "p_hints_used" in call.ops[0][1], false, "process-event sends neither");
    assert.equal(on.body, off.body, "the reply is the database's, mapped as for _v2");
    // Apart from the function name the calls are the same: no extra read of served_mode or the hint log.
    const strip = (r) => r.calls.filter((c) => !(c.kind === "rpc" && ANSWER_RPCS.has(c.name)));
    assert.deepEqual(strip(on), strip(off));
    assert.equal(on.calls.some((c) => c.kind === "from" && c.name === "question_hint_requests"), false);
  }
});

test("on: the body cannot steer it — forged mode / hints fields change nothing", async () => {
  const forged = { mode: "application", served_mode: "review", hints_used: 0, hints: 0, p_mode: "check", p_hints_used: 0 };
  for (const instance of Object.keys(V2)) {
    const clean = await send(instance, { flag: "on" });
    const withForged = await send(instance, { flag: "on", extra: forged });
    assert.deepEqual(withForged, clean, instance);
  }
});

test("on, fail loud: a wrapper error is a 500 with no fallback to _v2; the cooldown from inside the wrapper is the same 429", async () => {
  for (const instance of Object.keys(V2)) {
    const missing = await send(instance, { flag: "on", error: { code: "PGRST202", message: `Could not find the function public.${WRAP[instance]}` } });
    assert.equal(missing.status, 500);
    assert.deepEqual(JSON.parse(missing.body), { error: "Could not process answer" });
    assert.deepEqual(answerCalls(missing).map((c) => c.name), [WRAP[instance]], "never retried on _v2");
    const cooldown = { code: "LQ429", message: "quiz_cooldown_active", details: "2026-11-08T10:02:00Z" };
    const viaWrapper = await send(instance, { flag: "on", error: cooldown });
    const viaV2 = await send(instance, { error: cooldown });
    assert.equal(viaWrapper.status, 429);
    assert.equal(viaWrapper.body, viaV2.body);
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
