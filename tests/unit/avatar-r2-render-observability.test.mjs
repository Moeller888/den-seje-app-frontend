// Targeted unit test for the D-076 render_failed emission guard in mountC2Avatar (js/avatar-render-c2.js).
// Proves that a SUPERSEDED/stale mount which then hits an otherwise-unhandled exception:
//   • emits NO observability event,
//   • still re-throws the IDENTICAL error object (Promise rejection unchanged),
//   • does NOT consume the root's dedup slot — so a later CURRENT mount on the same root still
//     emits its own correct final result.
// No DOM (document/Image are stubbed), no backend, no browser, no real token.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mountC2Avatar } from "../../js/avatar-render-c2.js";

const neutralMedium = { v: 1, body_type: "neutral", skin_tone: "medium", hairstyle: "tousled", hair_color: "brown", chosen_at: "2026-06-01T00:00:00Z" };

// Minimal element stub covering exactly what mountC2Avatar touches on the root and on created layers.
function mockEl() {
  return {
    dataset: {}, className: "", src: "", alt: "",
    style: { setProperty() {} },
    querySelectorAll() { return { forEach() {} }; },
    removeAttribute() {}, setAttribute() {}, appendChild() {},
  };
}

test("stale mount that fails: no event, identical re-throw, dedup not consumed; current mount still emits", async () => {
  const origDoc = globalThis.document, origLS = globalThis.localStorage;
  const origInfo = console.info, origWarn = console.warn, origError = console.error;
  const events = [];
  const cap = (level) => (...a) => { if (String(a[0]).includes("[avatar-r2-observability]")) events.push({ level, payload: a[1] }); };
  console.info = cap("info"); console.warn = cap("warn"); console.error = cap("error");
  globalThis.localStorage = { getItem(k) { return k === "avatar_r2" ? "1" : null; } };

  const root = mockEl();
  const injected = new Error("injected-stale-failure");
  let bPromise = null;
  let first = true;
  globalThis.document = {
    createElement() {
      if (first) {
        first = false;
        // Supersede the in-flight mount A: starting mount B on the SAME root bumps the mount
        // generation synchronously (A becomes stale), then throw so A reaches its catch WHILE stale.
        bPromise = mountC2Avatar(root, neutralMedium, { surface: "avatar" });
        throw injected;
      }
      return mockEl();
    },
  };

  try {
    const aPromise = mountC2Avatar(root, neutralMedium, { surface: "avatar" });
    // The stale mount re-throws the IDENTICAL error object, unchanged.
    await assert.rejects(aPromise, (e) => e === injected);
    // The current mount (B) completes normally and emits its own result.
    const bResult = await bPromise;
    assert.equal(bResult, "r2");
    // Exactly one event — from the CURRENT mount, not the stale one.
    assert.equal(events.length, 1);
    assert.equal(events[0].level, "info");
    assert.deepEqual(events[0].payload, { event: "avatar_r2_render", version: 1, surface: "avatar", result: "r2", reason: "unknown" });
    // A render_failed here would mean the stale mount emitted and consumed the dedup slot (the bug).
    assert.notEqual(events[0].payload.result, "render_failed");
  } finally {
    globalThis.document = origDoc; globalThis.localStorage = origLS;
    console.info = origInfo; console.warn = origWarn; console.error = origError;
  }
});
