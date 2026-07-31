// Unit tests for the D-076 pilot-observability helper. node:test, no DOM, no backend,
// no browser, no real token. localStorage + console are stubbed; roots are plain objects
// (WeakSet keys). Verifies gating, validation, schema/PII, dedup, console contract, fail-soft.
import { test } from "node:test";
import assert from "node:assert/strict";
import { emitR2RenderObservability } from "../../js/avatar-r2-observability.js";

// Run `fn(calls)` with stubbed localStorage + console; always restores globals.
function withEnv(opts, fn) {
  const { optIn = true, lsThrows = false, infoThrows = false, warnThrows = false } = opts || {};
  const origLS = globalThis.localStorage;
  const origInfo = console.info, origWarn = console.warn, origError = console.error;
  const calls = { info: [], warn: [], error: [] };
  globalThis.localStorage = lsThrows
    ? { getItem() { throw new Error("ls boom"); } }
    : { getItem(k) { return (k === "avatar_r2" && optIn) ? "1" : null; } };
  console.info = (...a) => { calls.info.push(a); if (infoThrows) throw new Error("info boom"); };
  console.warn = (...a) => { calls.warn.push(a); if (warnThrows) throw new Error("warn boom"); };
  console.error = (...a) => { calls.error.push(a); };
  try { fn(calls); } finally {
    globalThis.localStorage = origLS; console.info = origInfo; console.warn = origWarn; console.error = origError;
  }
}
const PREFIX = "[avatar-r2-observability]";

test("opt-in + r2 → exactly one console.info with correct prefix + payload", () => {
  withEnv({ optIn: true }, (calls) => {
    emitR2RenderObservability({ surface: "avatar", result: "r2", reason: "unknown", root: {} });
    assert.equal(calls.info.length, 1);
    assert.equal(calls.warn.length, 0);
    assert.equal(calls.info[0][0], PREFIX);
    assert.deepEqual(calls.info[0][1], { event: "avatar_r2_render", version: 1, surface: "avatar", result: "r2", reason: "unknown" });
  });
});

test("opt-in + c2_fallback → exactly one console.info", () => {
  withEnv({ optIn: true }, (calls) => {
    emitR2RenderObservability({ surface: "hub", result: "c2_fallback", reason: "required_asset_failed", root: {} });
    assert.equal(calls.info.length, 1);
    assert.equal(calls.warn.length, 0);
    assert.equal(calls.info[0][1].result, "c2_fallback");
    assert.equal(calls.info[0][1].reason, "required_asset_failed");
  });
});

test("opt-in + render_failed → exactly one console.warn (never info/error)", () => {
  withEnv({ optIn: true }, (calls) => {
    emitR2RenderObservability({ surface: "quiz", result: "render_failed", reason: "render_exception", root: {} });
    assert.equal(calls.warn.length, 1);
    assert.equal(calls.info.length, 0);
    assert.equal(calls.error.length, 0);
    assert.equal(calls.warn[0][0], PREFIX);
    assert.equal(calls.warn[0][1].result, "render_failed");
    assert.equal(calls.warn[0][1].reason, "render_exception");
  });
});

test("no opt-in → no event for any result", () => {
  withEnv({ optIn: false }, (calls) => {
    emitR2RenderObservability({ surface: "avatar", result: "r2", reason: "unknown", root: {} });
    emitR2RenderObservability({ surface: "hub", result: "c2_fallback", reason: "unknown", root: {} });
    emitR2RenderObservability({ surface: "quiz", result: "render_failed", reason: "render_exception", root: {} });
    assert.equal(calls.info.length + calls.warn.length + calls.error.length, 0);
  });
});

test("invalid surface → no event", () => {
  withEnv({ optIn: true }, (calls) => {
    emitR2RenderObservability({ surface: "shop", result: "r2", reason: "unknown", root: {} });
    assert.equal(calls.info.length + calls.warn.length, 0);
  });
});

test("missing surface → no event", () => {
  withEnv({ optIn: true }, (calls) => {
    emitR2RenderObservability({ result: "r2", reason: "unknown", root: {} });
    assert.equal(calls.info.length + calls.warn.length, 0);
  });
});

test("invalid result → no event", () => {
  withEnv({ optIn: true }, (calls) => {
    emitR2RenderObservability({ surface: "avatar", result: "nope", reason: "unknown", root: {} });
    assert.equal(calls.info.length + calls.warn.length, 0);
  });
});

test("invalid reason → event uses 'unknown'", () => {
  withEnv({ optIn: true }, (calls) => {
    emitR2RenderObservability({ surface: "avatar", result: "c2_fallback", reason: "totally_made_up", root: {} });
    assert.equal(calls.info.length, 1);
    assert.equal(calls.info[0][1].reason, "unknown");
  });
});

test("render_exception with a non-render_failed result → reason downgraded to 'unknown'", () => {
  withEnv({ optIn: true }, (calls) => {
    emitR2RenderObservability({ surface: "avatar", result: "c2_fallback", reason: "render_exception", root: {} });
    assert.equal(calls.info.length, 1);
    assert.equal(calls.info[0][1].reason, "unknown");
  });
});

test("dedup: two calls with the same root → one event; two roots → one each", () => {
  withEnv({ optIn: true }, (calls) => {
    const root = {};
    emitR2RenderObservability({ surface: "avatar", result: "r2", reason: "unknown", root });
    emitR2RenderObservability({ surface: "avatar", result: "r2", reason: "unknown", root });
    assert.equal(calls.info.length, 1);
    emitR2RenderObservability({ surface: "hub", result: "r2", reason: "unknown", root: {} });
    emitR2RenderObservability({ surface: "quiz", result: "r2", reason: "unknown", root: {} });
    assert.equal(calls.info.length, 3);
  });
});

test("a not-opted-in call does not mark the root; a later valid call still emits once", () => {
  const root = {};
  withEnv({ optIn: false }, (calls) => {
    emitR2RenderObservability({ surface: "avatar", result: "r2", reason: "unknown", root });
    assert.equal(calls.info.length, 0);
  });
  withEnv({ optIn: true }, (calls) => {
    emitR2RenderObservability({ surface: "avatar", result: "r2", reason: "unknown", root });
    assert.equal(calls.info.length, 1);
  });
});

test("missing/invalid root → no event", () => {
  withEnv({ optIn: true }, (calls) => {
    emitR2RenderObservability({ surface: "avatar", result: "r2", reason: "unknown" });
    emitR2RenderObservability({ surface: "avatar", result: "r2", reason: "unknown", root: null });
    emitR2RenderObservability({ surface: "avatar", result: "r2", reason: "unknown", root: "x" });
    assert.equal(calls.info.length + calls.warn.length, 0);
  });
});

test("console.info throwing does not throw out of the helper", () => {
  withEnv({ optIn: true, infoThrows: true }, () => {
    assert.doesNotThrow(() => emitR2RenderObservability({ surface: "avatar", result: "r2", reason: "unknown", root: {} }));
  });
});

test("console.warn throwing does not throw out of the helper", () => {
  withEnv({ optIn: true, warnThrows: true }, () => {
    assert.doesNotThrow(() => emitR2RenderObservability({ surface: "avatar", result: "render_failed", reason: "render_exception", root: {} }));
  });
});

test("localStorage.getItem throwing does not throw out of the helper (and emits nothing)", () => {
  withEnv({ lsThrows: true }, (calls) => {
    assert.doesNotThrow(() => emitR2RenderObservability({ surface: "avatar", result: "r2", reason: "unknown", root: {} }));
    assert.equal(calls.info.length + calls.warn.length, 0);
  });
});

test("payload is frozen", () => {
  withEnv({ optIn: true }, (calls) => {
    emitR2RenderObservability({ surface: "avatar", result: "r2", reason: "unknown", root: {} });
    assert.equal(Object.isFrozen(calls.info[0][1]), true);
  });
});

test("payload has EXACTLY {event,version,surface,result,reason} and no PII fields", () => {
  withEnv({ optIn: true }, (calls) => {
    emitR2RenderObservability({ surface: "avatar", result: "r2", reason: "unknown", root: {} });
    const p = calls.info[0][1];
    assert.deepEqual(Object.keys(p).sort(), ["event", "reason", "result", "surface", "version"]);
    for (const forbidden of ["uid", "email", "token", "session", "error", "stack", "timestamp", "localStorage", "message", "path", "url", "account", "userId"]) {
      assert.equal(Object.prototype.hasOwnProperty.call(p, forbidden), false, "must not contain " + forbidden);
    }
  });
});

test("console.error is never used", () => {
  withEnv({ optIn: true }, (calls) => {
    emitR2RenderObservability({ surface: "avatar", result: "r2", reason: "unknown", root: {} });
    emitR2RenderObservability({ surface: "hub", result: "c2_fallback", reason: "required_asset_failed", root: {} });
    emitR2RenderObservability({ surface: "quiz", result: "render_failed", reason: "render_exception", root: {} });
    assert.equal(calls.error.length, 0);
  });
});

test("each valid reason passes through unchanged (with a compatible result)", () => {
  withEnv({ optIn: true }, (calls) => {
    emitR2RenderObservability({ surface: "avatar", result: "r2", reason: "unknown", root: {} });
    emitR2RenderObservability({ surface: "hub", result: "c2_fallback", reason: "required_asset_failed", root: {} });
    emitR2RenderObservability({ surface: "quiz", result: "c2_fallback", reason: "identity_ineligible", root: {} });
    emitR2RenderObservability({ surface: "avatar", result: "c2_fallback", reason: "forced_c2", root: {} });
    // D-082 option B: an equipped cosmetic the R2 stack cannot render (torso) → whole-avatar C2.
    emitR2RenderObservability({ surface: "quiz", result: "c2_fallback", reason: "unsupported_cosmetic_equipped", root: {} });
    emitR2RenderObservability({ surface: "hub", result: "render_failed", reason: "render_exception", root: {} });
    const reasons = [...calls.info.map((c) => c[1].reason), ...calls.warn.map((c) => c[1].reason)];
    assert.deepEqual(reasons.sort(), ["forced_c2", "identity_ineligible", "render_exception", "required_asset_failed", "unknown", "unsupported_cosmetic_equipped"]);
  });
});
