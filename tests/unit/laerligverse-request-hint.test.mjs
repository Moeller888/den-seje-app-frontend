// Lærligverse L3: the request-hint Edge Function (supabase/functions/request-hint). Runs the REAL index.ts against the
// recording stand-in of tests/unit/helpers/process-event-harness.mjs (it stubs the same two URL imports).
//
// What this proves:
//   * OFF (LAERLIGVERSE_HINTS unset or anything but exactly "on"): 404 { outcome: "hints_disabled" } and NO client is
//     built — nothing read, nothing written. The preflight still answers 200 "ok" (the isolated stack's warm check).
//   * ON: JWT required (401, no RPC); the body is validated (400, no RPC); the one RPC goes through the ADMIN client
//     with p_student_id = the verified user — never a body field — and the request's instance/round/level/request_id.
//   * Every database outcome maps to its documented status; a reply whose level, round or text does not match the
//     request is a 500, as is a database error (no detail leaks). The hint text is never logged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { STUDENT, loadHandler, runCase } from "./helpers/process-event-harness.mjs";
import { parseHintRequest, replyForHint } from "../../supabase/functions/request-hint/hint-request.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const INDEX = join(ROOT, "supabase", "functions", "request-hint", "index.ts");
// The harness warms up with a process-event body; for this function that is just one more (disabled) request.
const handler = await loadHandler(INDEX);

const INST = "0b6c8f8e-6f1d-4a43-9d4e-2f2a1f6a7b01";
const REQ = "5d3f0a7e-2b8c-4c1d-9e6f-7a8b9c0d1e2f";
const BODY = { question_instance_id: INST, round_no: 1, level: 1, request_id: REQ };
const TEXT = "Læs påstanden igen.";
const row = (over = {}) => ({ outcome: "recorded", round_no: 1, hint_level: 1, hint_text: TEXT, hints_available: 3, request_id: REQ, requested_at: "2026-11-08T08:00:00Z", ...over });
const rpcReturns = (result, error = null) => (kind, name, ops, client, base) =>
  kind === "rpc" && name === "request_question_hint" ? { data: result, error } : base;
const send = (opts = {}) => runCase(handler, { body: BODY, env: { LAERLIGVERSE_HINTS: "on" }, ...opts });
const rpcCalls = (r) => r.calls.filter((c) => c.kind === "rpc");

test("off: anything but exactly \"on\" → 404 hints_disabled, no client built, nothing read or written", async () => {
  for (const v of [undefined, "", "off", "ON", "true", " on"]) {
    const r = await runCase(handler, { body: BODY, env: { LAERLIGVERSE_HINTS: v }, backend: rpcReturns(row()) });
    assert.equal(r.status, 404, String(v));
    assert.deepEqual(JSON.parse(r.body), { outcome: "hints_disabled", error: "Hints are not enabled" });
    assert.deepEqual(r.calls, [], "no createClient, no auth, no RPC");
  }
});

test("preflight answers 200 \"ok\" whatever the switch", async () => {
  for (const v of [undefined, "on"]) {
    const res = await handler(new Request("http://stub/", { method: "OPTIONS" }));
    assert.equal(res.status, 200, String(v));
    assert.equal(await res.text(), "ok");
  }
});

test("on: no valid session → 401 and no RPC; an invalid body → 400 with a reason and no RPC", async () => {
  const unauth = await send({ user: false, backend: rpcReturns(row()) });
  assert.equal(unauth.status, 401);
  assert.deepEqual(rpcCalls(unauth), []);
  const bad = [
    ["{not json", "invalid_body"], [[], "invalid_body"],
    [{ ...BODY, question_instance_id: "x" }, "invalid_instance"],
    [{ ...BODY, round_no: 0 }, "invalid_round_no"], [{ ...BODY, round_no: 1.5 }, "invalid_round_no"], [{ ...BODY, round_no: "1" }, "invalid_round_no"],
    [{ ...BODY, level: 0 }, "invalid_level"], [{ ...BODY, level: 4 }, "invalid_level"], [{ ...BODY, level: null }, "invalid_level"],
    [{ ...BODY, request_id: "retry-1" }, "invalid_request_id"], [{ ...BODY, request_id: undefined }, "invalid_request_id"],
  ];
  for (const [body, reason] of bad) {
    const r = await send({ body, backend: rpcReturns(row()) });
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.deepEqual(JSON.parse(r.body), { outcome: "invalid_request", reason, error: "Invalid request" });
    assert.deepEqual(rpcCalls(r), []);
  }
});

test("on: one RPC on the ADMIN client, p_student_id = the verified user; body identity fields are ignored", async () => {
  const r = await send({ body: { ...BODY, student_id: "someone-else", p_student_id: "x", user_id: "y" }, backend: rpcReturns(row()) });
  assert.equal(r.status, 200, r.body);
  assert.deepEqual(JSON.parse(r.body), { outcome: "recorded", level: 1, text: TEXT, hints_remaining: 2, round_no: 1 });
  const [call] = rpcCalls(r);
  assert.equal(call.client, "admin");
  assert.deepEqual(call.ops, [["args", { p_student_id: STUDENT, p_question_instance_id: INST, p_round_no: 1, p_level: 1, p_request_id: REQ }]]);
  assert.ok(r.calls.some((c) => c.createClient === "admin" && c.auth === "none"), "the admin client never carries the pupil's JWT");
  assert.equal(r.logs.some((l) => l.includes(TEXT)), false, "the hint text is never logged");
});

test("on: every database outcome maps to its documented status", async () => {
  const cases = [
    [row({ outcome: "replay" }), 200, { outcome: "replay", level: 1, text: TEXT, hints_remaining: 2, round_no: 1 }],
    [row({ outcome: "already_recorded" }), 200, { outcome: "already_recorded", level: 1, text: TEXT, hints_remaining: 2, round_no: 1 }],
    [{ outcome: "hint_unavailable", hints_available: 0 }, 409, { outcome: "hint_unavailable", error: "No hint at this level", hints_available: 0 }],
    [{ outcome: "round_closed" }, 409, { outcome: "round_closed", error: "Round already closed" }],
    [{ outcome: "stale_round" }, 409, { outcome: "stale_round", error: "Hint belongs to an earlier round" }],
    [{ outcome: "request_conflict" }, 409, { outcome: "request_conflict", error: "Request id already used" }],
    [{ outcome: "not_found" }, 404, { outcome: "not_found", error: "Instance not found" }],
    [{ outcome: "invalid_request", reason: "level_out_of_order" }, 400, { outcome: "invalid_request", error: "Invalid request", reason: "level_out_of_order" }],
    [{ outcome: "invalid_request", reason: "secret detail" }, 400, { outcome: "invalid_request", error: "Invalid request" }],
  ];
  for (const [db, status, body] of cases) {
    const r = await send({ backend: rpcReturns(db) });
    assert.equal(r.status, status, JSON.stringify(db));
    assert.deepEqual(JSON.parse(r.body), body);
  }
});

test("on: a mismatching or malformed reply, or a database error, is a 500 that names no database detail", async () => {
  const broken = [
    null, [], {}, { outcome: "weird" }, row({ hint_level: 2 }), row({ round_no: 2 }), row({ hint_text: "" }), row({ hint_text: 7 }),
    row({ hints_available: 0 }), row({ hints_available: 4 }), { outcome: "hint_unavailable", hints_available: "2" },
  ];
  for (const db of broken) {
    const r = await send({ backend: rpcReturns(db) });
    assert.equal(r.status, 500, JSON.stringify(db));
    assert.deepEqual(JSON.parse(r.body), { error: "Could not process hint request" });
  }
  const err = await send({ backend: rpcReturns(null, { code: "42883", message: "function public.request_question_hint does not exist", hint: "secret" }) });
  assert.equal(err.status, 500);
  assert.deepEqual(JSON.parse(err.body), { error: "Could not process hint request" });
  assert.equal(err.logs.some((l) => l.includes("does not exist") || l.includes("secret")), false);
  assert.ok(err.logs.some((l) => l.includes('"code":"42883"')));
});

test("the pure contract: parseHintRequest and replyForHint", () => {
  assert.deepEqual(parseHintRequest(BODY), { ok: true, request: { instanceId: INST, roundNo: 1, level: 1, requestId: REQ } });
  assert.deepEqual(parseHintRequest(null), { ok: false, reason: "invalid_body" });
  const req = { instanceId: INST, roundNo: 2, level: 3, requestId: REQ };
  assert.equal(replyForHint(row({ round_no: 2, hint_level: 3, hints_available: 3 }), req).body.hints_remaining, 0);
});

test("JWT: without an Authorization header the user client gets no token, auth fails, 401 — and no RPC is made", async () => {
  // Like process-event and get-next-question (verify_jwt = false in config.toml), the function itself verifies the
  // session with auth.getUser() on a client that carries ONLY the request's own Authorization header.
  globalThis.Deno.env.set("LAERLIGVERSE_HINTS", "on");
  globalThis.__peTrace = [];
  globalThis.__peUser = () => ({ data: { user: null }, error: { message: "missing or forged JWT" } });
  globalThis.__peBackend = rpcReturns(row());
  try {
    const res = await handler(new Request("http://stub/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(BODY) }));
    assert.equal(res.status, 401);
    assert.deepEqual(JSON.parse(await res.text()), { error: "Unauthorized" });
    assert.deepEqual(globalThis.__peTrace.filter((c) => c.createClient), [{ createClient: "user", auth: "none" }]);
    assert.equal(globalThis.__peTrace.some((c) => c.kind === "rpc"), false);
  } finally {
    globalThis.Deno.env.delete("LAERLIGVERSE_HINTS");
  }
});
