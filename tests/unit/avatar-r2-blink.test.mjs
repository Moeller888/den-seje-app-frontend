// ── PR D unit tests: countersigned R2 blink wiring ────────────────────────────
// Covers the C2/R2 blink profile split: the Option-A geometry and raster-
// measured fill on the R2 profile, the untouched C2 profile, the central
// blinkConfigFor() decision (profile follows the ACTIVE render path, not the
// raw flag), reduced-motion and dispose regressions. Node-runnable via a
// minimal fake DOM — the full Playwright suite remains the browser-level gate.
//
// Run: npm run test:unit   (node --test tests/unit/*.test.mjs)

import { test } from "node:test";
import assert from "node:assert/strict";

import { BlinkEngine, BLINK_PROFILES } from "../../js/avatar-blink-engine.js";
import {
  R2_MANIFEST,
  blinkConfigFor,
  r2BlinkAllowedFor,
  r2ExpressionOverlayAllowedFor,
} from "../../js/avatar-layers.js";

const NEUTRAL_MEDIUM = { body_type: "neutral", skin_tone: "medium" };

// Simulates the per-browser localStorage opt-in (isAvatarR2 reads it at call time).
function withR2OptIn(fn) {
  globalThis.localStorage = { getItem: (k) => (k === "avatar_r2" ? "1" : null) };
  try { return fn(); } finally { delete globalThis.localStorage; }
}

// Temporarily removes a manifest entry; always restores (module state).
function withoutManifestEntry(slot, key, fn) {
  const saved = R2_MANIFEST[slot][key];
  delete R2_MANIFEST[slot][key];
  try { return fn(); } finally { R2_MANIFEST[slot][key] = saved; }
}

// ── Minimal fake DOM (enough for BlinkEngine's layer build/teardown) ──────────

function fakeEl() {
  return {
    id: "",
    attrs: {},
    style: {},
    children: [],
    parentNode: null,
    setAttribute(k, v) { this.attrs[k] = String(v); },
    appendChild(c) { c.parentNode = this; this.children.push(c); },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); c.parentNode = null; },
  };
}

// Installs window/document stubs for fn's duration; always restores.
// reducedMotion drives the engine's prefers-reduced-motion detection.
function withDom(fn, { reducedMotion = false } = {}) {
  const created = [];
  globalThis.window = { matchMedia: () => ({ matches: reducedMotion }) };
  globalThis.document = {
    createElementNS(_ns, _tag) { const el = fakeEl(); created.push(el); return el; },
    getElementById(id) { return created.find((el) => el.id === id && el.parentNode) || null; },
  };
  try { return fn(fakeEl()); } finally {
    delete globalThis.window;
    delete globalThis.document;
  }
}

// ── Profile constants ─────────────────────────────────────────────────────────

test("C2 profile keeps the existing geometry and Section-152E fills untouched", () => {
  assert.deepEqual(BLINK_PROFILES.c2.eyes, {
    L: { cx: 68, cy: 47, rx: 7.6, ry: 6.6 },
    R: { cx: 92, cy: 47, rx: 7.6, ry: 6.6 },
  });
  assert.deepEqual(BLINK_PROFILES.c2.fill, { medium: "#EDB888", dark: "#865935" });
});

test("R2 profile is exactly the countersigned Option-A geometry", () => {
  assert.deepEqual(BLINK_PROFILES.r2.eyes, {
    L: { cx: 66.7, cy: 60.3, rx: 8.91, ry: 9.06 },
    R: { cx: 90.6, cy: 60.3, rx: 8.91, ry: 9.06 },
  });
});

test("R2 tone map: medium is the raster-measured #FEC183 (not the C2 #EDB888)", () => {
  assert.deepEqual(BLINK_PROFILES.r2.fill, { medium: "#FEC183" });
  assert.notEqual(BLINK_PROFILES.r2.fill.medium, BLINK_PROFILES.c2.fill.medium);
});

// ── blinkConfigFor: the central per-surface decision ─────────────────────────

test("flag off: blink allowed with the C2 profile (production default)", () => {
  assert.deepEqual(blinkConfigFor(NEUTRAL_MEDIUM), { allowed: true, mode: "c2", skinTone: "medium" });
  assert.deepEqual(blinkConfigFor({ body_type: "neutral", skin_tone: "dark" }),
    { allowed: true, mode: "c2", skinTone: "dark" });
  assert.equal(r2BlinkAllowedFor(NEUTRAL_MEDIUM), true);
});

test("opt-in + supported identity: R2 profile; expression stays OFF", () => {
  withR2OptIn(() => {
    assert.deepEqual(blinkConfigFor(NEUTRAL_MEDIUM), { allowed: true, mode: "r2", skinTone: "medium" });
    assert.equal(r2ExpressionOverlayAllowedFor(NEUTRAL_MEDIUM), false);
  });
});

test("opt-in + unsupported identity (C2 fallback render): C2 blink profile", () => {
  withR2OptIn(() => {
    assert.deepEqual(blinkConfigFor({ body_type: "male", skin_tone: "medium" }),
      { allowed: true, mode: "c2", skinTone: "medium" });
    assert.deepEqual(blinkConfigFor({ body_type: "neutral", skin_tone: "dark" }),
      { allowed: true, mode: "c2", skinTone: "dark" });
  });
});

test("opt-in + missing manifest entry (whole-stack C2 fallback): C2 blink profile", () => {
  withR2OptIn(() => {
    withoutManifestEntry("base", "neutral-medium", () => {
      assert.equal(blinkConfigFor(NEUTRAL_MEDIUM).mode, "c2");
    });
  });
});

// ── Engine: lids follow the selected profile ─────────────────────────────────

test("default construction (no options) builds the C2 lids — old call-sites unbroken", () => {
  withDom((container) => {
    const engine = new BlinkEngine(container);
    try {
      const svg = container.children[0];
      const [lidL, lidR] = svg.children;
      assert.equal(lidL.attrs.cx, "68");
      assert.equal(lidL.attrs.cy, "47");
      assert.equal(lidL.attrs.rx, "7.6");
      assert.equal(lidL.attrs.ry, "6.6");
      assert.equal(lidR.attrs.cx, "92");
      assert.equal(lidL.attrs.fill, "#EDB888");
    } finally { engine.destroy(); }
  });
});

test("mode r2 builds the Option-A lids with the raster fill", () => {
  withDom((container) => {
    const engine = new BlinkEngine(container, "medium", { mode: "r2" });
    try {
      const svg = container.children[0];
      const [lidL, lidR] = svg.children;
      assert.equal(lidL.attrs.cx, "66.7");
      assert.equal(lidL.attrs.cy, "60.3");
      assert.equal(lidL.attrs.rx, "8.91");
      assert.equal(lidL.attrs.ry, "9.06");
      assert.equal(lidR.attrs.cx, "90.6");
      assert.equal(lidR.attrs.cy, "60.3");
      assert.equal(lidL.attrs.fill, "#FEC183");
      assert.equal(lidR.attrs.fill, "#FEC183");
    } finally { engine.destroy(); }
  });
});

test("mode r2 with a tone outside the R2 map falls back to measured medium", () => {
  withDom((container) => {
    const engine = new BlinkEngine(container, "dark", { mode: "r2" });
    try {
      const lidL = container.children[0].children[0];
      assert.equal(lidL.attrs.fill, "#FEC183"); // R2 map has no dark entry yet
    } finally { engine.destroy(); }
  });
});

test("setProfile() re-applies geometry + fill on live lids (R2 → C2 hand-back)", () => {
  withDom((container) => {
    const engine = new BlinkEngine(container, "medium", { mode: "r2" });
    try {
      engine.setProfile({ mode: "c2", skinTone: "dark" });
      const [lidL, lidR] = container.children[0].children;
      assert.equal(lidL.attrs.cx, "68");
      assert.equal(lidL.attrs.cy, "47");
      assert.equal(lidL.attrs.rx, "7.6");
      assert.equal(lidL.attrs.ry, "6.6");
      assert.equal(lidR.attrs.cx, "92");
      assert.equal(lidL.attrs.fill, "#865935");
    } finally { engine.destroy(); }
  });
});

test("reduced-motion regression: no lids, no timer, destroy() safe (both modes)", () => {
  for (const mode of ["c2", "r2"]) {
    withDom((container) => {
      const engine = new BlinkEngine(container, "medium", { mode });
      assert.equal(container.children.length, 0, mode + ": no blink layer under reduced motion");
      assert.equal(engine._timer, null);
      engine.destroy(); // must not throw
    }, { reducedMotion: true });
  }
});

test("dispose regression: destroy() clears the timer, removes the layer, is idempotent", () => {
  withDom((container) => {
    const engine = new BlinkEngine(container, "medium", { mode: "r2" });
    assert.equal(container.children.length, 1);
    assert.ok(engine._timer, "a blink must be scheduled");
    engine.destroy();
    assert.equal(engine._timer, null);
    assert.equal(container.children.length, 0, "blink layer must be removed");
    engine.destroy(); // second call must not throw
  });
});
