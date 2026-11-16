// LP-13 / K9 prototype: the introduction-progress Edge Function. REAL index.ts, recording stand-in
// (tests/unit/helpers/process-event-harness.mjs stubs the same two URL imports).
//
// Proves: OFF (both flags unset or not exactly "on") → 404 and NO client is built; each action needs its own flag;
// JWT required (401, no RPC; a missing header gives the user client no token); the body is validated and its identity
// fields ignored — the RPC gets the VERIFIED user; retries with the same request id reach the RPC unchanged (the
// database answers replay); every outcome maps to its status; a mismatching reply is a 500.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { STUDENT, loadHandler, runCase } from "./helpers/process-event-harness.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const handler = await loadHandler(join(ROOT, "supabase", "functions", "introduction-progress", "index.ts"));
const ROUND = "0b6c8f8e-6f1d-4a43-9d4e-2f2a1f6a7b01";
const REQ = "5d3f0a7e-2b8c-4c1d-9e6f-7a8b9c0d1e2f";
const INST = "6f1c2a3b-4d5e-4f60-8a71-92b3c4d5e6f7";
const AT = "2026-11-10T08:05:00.123+00:00";
const COMPLETE = { action: "completed", round_id: ROUND, request_id: REQ };
const ON = { LAERLIGVERSE_INTRODUCTION: "on" };
const BOTH = { LAERLIGVERSE_INTRODUCTION: "on", LAERLIGVERSE_PRESENTED: "on" };
const rpcReturns = (result, error = null) => (kind, name, ops, client, base) => (kind === "rpc" ? { data: result, error } : base);
const send = (body, env = ON, opts = {}) => runCase(handler, { body, env, backend: rpcReturns({ outcome: "recorded", round_id: ROUND, completed_at: AT, presented_at: AT }), ...opts });
const rpcs = (r) => r.calls.filter((c) => c.kind === "rpc");

test("off: both flags unset or not exactly \"on\" → 404, no client built, nothing read or written", async () => {
  for (const v of [undefined, "", "off", "ON", " on"]) {
    const r = await send(COMPLETE, { LAERLIGVERSE_INTRODUCTION: v, LAERLIGVERSE_PRESENTED: v });
    assert.equal(r.status, 404, String(v));
    assert.deepEqual(JSON.parse(r.body), { outcome: "disabled", error: "Not enabled" });
    assert.deepEqual(r.calls, []);
  }
});

test("each action needs its own flag: presented needs LAERLIGVERSE_PRESENTED; introduction actions need LAERLIGVERSE_INTRODUCTION", async () => {
  const presentedIntro = { action: "presented", round_id: ROUND, request_id: REQ };
  const presentedTask = { action: "presented", question_instance_id: INST, round_no: 1 };
  for (const [body, env, ok] of [
    [presentedIntro, ON, false], [presentedIntro, BOTH, true], [presentedIntro, { LAERLIGVERSE_PRESENTED: "on" }, false],
    [presentedTask, ON, false], [presentedTask, { LAERLIGVERSE_PRESENTED: "on" }, true],
    [COMPLETE, { LAERLIGVERSE_PRESENTED: "on" }, false], [COMPLETE, ON, true],
  ]) {
    const r = await send(body, env);
    assert.equal(r.status, ok ? 200 : 404, `${JSON.stringify(body)} ${JSON.stringify(env)}`);
    assert.equal(rpcs(r).length, ok ? 1 : 0);
  }
});

test("JWT required: an invalid or missing session → 401 and no RPC", async () => {
  const r = await send(COMPLETE, ON, { user: false });
  assert.equal(r.status, 401);
  assert.deepEqual(rpcs(r), []);
  globalThis.Deno.env.set("LAERLIGVERSE_INTRODUCTION", "on");
  globalThis.__peTrace = [];
  globalThis.__peUser = () => ({ data: { user: null }, error: { message: "missing JWT" } });
  globalThis.__peBackend = rpcReturns({ outcome: "recorded" });
  try {
    const res = await handler(new Request("http://stub/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(COMPLETE) }));
    assert.equal(res.status, 401);
    assert.deepEqual(globalThis.__peTrace.filter((c) => c.createClient), [{ createClient: "user", auth: "none" }]);
    assert.equal(globalThis.__peTrace.some((c) => c.kind === "rpc"), false);
  } finally {
    globalThis.Deno.env.delete("LAERLIGVERSE_INTRODUCTION");
  }
});

test("the RPC gets the VERIFIED user and the request; body identity fields ignored; a retry sends the same request id", async () => {
  const forged = { ...COMPLETE, student_id: "someone-else", p_student_id: "x", completed_at: "2020-01-01T00:00:00Z" };
  const r = await send(forged);
  assert.equal(r.status, 200, r.body);
  assert.deepEqual(JSON.parse(r.body), { outcome: "recorded", at: AT });
  assert.deepEqual(rpcs(r).map((c) => [c.client, c.name, c.ops]), [["admin", "complete_introduction", [["args", { p_student_id: STUDENT, p_round_id: ROUND, p_request_id: REQ }]]]]);
  const retry = await runCase(handler, { body: COMPLETE, env: ON, backend: rpcReturns({ outcome: "replay", round_id: ROUND, completed_at: AT }) });
  assert.deepEqual(JSON.parse(retry.body), { outcome: "replay", at: AT });
  assert.deepEqual(rpcs(retry)[0].ops, rpcs(r)[0].ops, "the same request id reaches the database");
  const task = await send({ action: "presented", question_instance_id: INST, round_no: 2 }, { LAERLIGVERSE_PRESENTED: "on" });
  assert.deepEqual(rpcs(task)[0].ops, [["args", { p_student_id: STUDENT, p_question_instance_id: INST, p_round_no: 2 }]]);
});

test("invalid bodies → 400 without RPC; outcomes map to statuses; mismatching replies and errors → 500 without detail", async () => {
  for (const body of ["{x", { action: "done", round_id: ROUND, request_id: REQ }, { action: "completed", round_id: "x", request_id: REQ },
    { action: "completed", round_id: ROUND }, { action: "presented", question_instance_id: INST, round_no: 0 }]) {
    const r = await send(body, BOTH);
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.deepEqual(rpcs(r), []);
  }
  for (const [db, status] of [[{ outcome: "not_found" }, 404], [{ outcome: "already_completed", round_id: ROUND, completed_at: AT }, 200],
    [{ outcome: "round_closed" }, 409], [{ outcome: "invalid_request" }, 400],
    [{ outcome: "recorded", round_id: "other", completed_at: AT }, 500], [{ outcome: "recorded", round_id: ROUND }, 500], [{ outcome: "weird" }, 500]]) {
    const r = await runCase(handler, { body: COMPLETE, env: ON, backend: rpcReturns(db) });
    assert.equal(r.status, status, JSON.stringify(db));
  }
  const err = await runCase(handler, { body: COMPLETE, env: ON, backend: rpcReturns(null, { code: "42883", message: "secret detail" }) });
  assert.equal(err.status, 500);
  assert.equal(err.body.includes("secret"), false);
  assert.equal(err.logs.some((l) => l.includes("secret detail")), false);
});
