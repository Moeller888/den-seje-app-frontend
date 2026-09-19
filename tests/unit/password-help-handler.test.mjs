// Section 173: FUNCTIONAL coverage of the password-help HTTP contract.
//
// This replaces a regex scan of index.ts, which asserted nothing about what the handler
// actually returns. Here the real production handler factory is invoked with fakes, given real
// Request objects, and the real Response objects it produces are compared byte for byte.
//
// No serve(), no Supabase client, no network: global fetch is a throwing counter.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import {
  createHandler,
  GENERIC_BODY,
  CORS_HEADERS,
  isPlausibleEmail,
} from "../../supabase/functions/request-password-help/handler.ts";

let fetchCalls = 0;
let realFetch;

before(() => {
  realFetch = globalThis.fetch;
  globalThis.fetch = (...args) => {
    fetchCalls++;
    throw new Error(`network is disabled in this test — fetch() called with ${String(args[0])}`);
  };
});

after(() => {
  globalThis.fetch = realFetch;
});

function post(email) {
  return new Request("https://example.test/functions/v1/request-password-help", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

// `process` stands in for the whole pipeline. Its behaviour must never reach the response, so
// each scenario gives it a different fate.
function makeDeps(processImpl, { canBackground = true } = {}) {
  const state = { scheduled: [], awaited: false, captured: [] };
  const deps = {
    process: processImpl,
    scheduleBackground(work) {
      if (!canBackground) return false;
      state.scheduled.push(work);
      // Swallow here exactly as EdgeRuntime.waitUntil would own it.
      work.catch(() => {});
      return true;
    },
    captureMessage(message, level, extra) {
      state.captured.push({ message, level, extra });
    },
  };
  return { deps, state };
}

async function snapshot(res) {
  return {
    status: res.status,
    body: await res.text(),
    headers: {
      "content-type": res.headers.get("content-type"),
      "access-control-allow-origin": res.headers.get("access-control-allow-origin"),
      "access-control-allow-headers": res.headers.get("access-control-allow-headers"),
    },
  };
}

// ── The contract ─────────────────────────────────────────────────────────────

test("known staff, known student, unknown address and a failing pipeline are byte-identical", async () => {
  const scenarios = {
    staff:    async () => { /* staff recovery sent */ },
    student:  async () => { /* student pipeline ran */ },
    unknown:  async () => { /* nothing happened */ },
    failing:  async () => { throw new Error("pipeline exploded"); },
    slow:     async () => { await new Promise((r) => setTimeout(r, 25)); },
  };

  const seen = [];
  for (const [name, impl] of Object.entries(scenarios)) {
    const { deps } = makeDeps(impl);
    const res = await createHandler(deps)(post(`${name}@example.test`));
    seen.push([name, await snapshot(res)]);
  }

  const [, reference] = seen[0];
  for (const [name, snap] of seen) {
    assert.equal(snap.status, 200, `${name}: status`);
    assert.equal(snap.body, reference.body, `${name}: body must be byte-identical`);
    assert.deepEqual(snap.headers, reference.headers, `${name}: headers must match`);
  }

  // And it is the documented body, not merely a consistent one.
  assert.equal(reference.body, JSON.stringify(GENERIC_BODY));
  assert.equal(reference.headers["access-control-allow-origin"], CORS_HEADERS["Access-Control-Allow-Origin"]);
});

test("the response is produced before the pipeline settles", async () => {
  let resolvePipeline;
  const pending = new Promise((r) => { resolvePipeline = r; });

  const { deps, state } = makeDeps(() => pending);
  const res = await createHandler(deps)(post("student@example.test"));

  // The handler returned while the pipeline is still unresolved — this is the property that
  // removes the timing side-channel.
  assert.equal(res.status, 200);
  assert.equal(state.scheduled.length, 1, "the work was handed to the runtime, not awaited");
  resolvePipeline();
  await pending;
});

test("a rejecting pipeline never changes the response and never escapes", async () => {
  const { deps } = makeDeps(async () => { throw new Error("boom"); });
  const res = await createHandler(deps)(post("student@example.test"));

  assert.equal(res.status, 200);
  assert.equal(await res.text(), JSON.stringify(GENERIC_BODY));
});

test("without background support the work is awaited and the degradation is recorded", async () => {
  let ran = false;
  const { deps, state } = makeDeps(async () => { ran = true; }, { canBackground: false });

  const res = await createHandler(deps)(post("student@example.test"));

  assert.equal(res.status, 200);
  assert.equal(await res.text(), JSON.stringify(GENERIC_BODY));
  assert.equal(ran, true, "the work must still happen — a lost notification is not acceptable");
  assert.match(state.captured[0].message, /waitUntil unavailable/);
});

// ── Input handling ───────────────────────────────────────────────────────────

test("a malformed body is rejected without touching the pipeline", async () => {
  let called = 0;
  const { deps } = makeDeps(async () => { called++; });
  const handler = createHandler(deps);

  for (const body of ["{}", '{"email":123}', '{"email":"not-an-address"}', "not json"]) {
    const res = await handler(new Request("https://example.test/x", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }));
    assert.equal(res.status, 400);
    assert.equal(await res.text(), JSON.stringify({ ok: false, error: "email required" }));
  }

  assert.equal(called, 0, "a malformed request reveals nothing and starts nothing");
});

test("OPTIONS and non-POST methods behave predictably", async () => {
  const { deps } = makeDeps(async () => {});
  const handler = createHandler(deps);

  const preflight = await handler(new Request("https://example.test/x", { method: "OPTIONS" }));
  assert.equal(preflight.status, 200);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "*");

  const get = await handler(new Request("https://example.test/x", { method: "GET" }));
  assert.equal(get.status, 405);
});

test("isPlausibleEmail is a sanity check, not an oracle", () => {
  assert.equal(isPlausibleEmail("a@b.co"), true);
  assert.equal(isPlausibleEmail("  a@b.co  "), true);
  assert.equal(isPlausibleEmail("a@b"), false);
  assert.equal(isPlausibleEmail(""), false);
  assert.equal(isPlausibleEmail(null), false);
  assert.equal(isPlausibleEmail("a".repeat(400) + "@b.co"), false);
});

test("no network call was made by any test in this file", () => {
  assert.equal(fetchCalls, 0);
});
