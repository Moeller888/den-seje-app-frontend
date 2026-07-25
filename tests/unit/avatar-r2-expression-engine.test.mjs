// ── D-069: ExpressionEngine R2 mode (face-layer swap) — unit coverage ─────────
// R2 mode drives the EXISTING decomposed z3 face layer (`[data-c2-layer="face"]`) via
// faceSrcForR2 instead of creating its own overlay. Reduced-motion is mocked so _display
// applies instantly (no fade timers), making the src swaps synchronous & deterministic.
// No browser/backend — a minimal DOM mock, matching the repo's node --test convention.
//
// Run: npm run test:unit

import { test } from "node:test";
import assert from "node:assert/strict";
import { ExpressionEngine } from "../../js/avatar-expression-engine.js";

function makeImg() {
  return {
    _src: "", style: {}, onerror: null, alt: "", className: "",
    setAttribute() {}, get src() { return this._src; }, set src(v) { this._src = v; },
  };
}

// Installs a reduced-motion DOM environment (instant swaps), runs fn, restores globals.
function withDom(fn) {
  const saved = { window: globalThis.window, Image: globalThis.Image, document: globalThis.document };
  let created = 0;
  globalThis.window = { matchMedia: () => ({ matches: true }) };
  globalThis.Image = class { set src(_v) {} };
  globalThis.document = { createElement: () => { created++; return makeImg(); } };
  try { return fn(() => created); } finally { Object.assign(globalThis, saved); }
}

function r2Container() {
  const faceEl = makeImg();
  faceEl._src = "/assets/avatar-r2/face/face-neutral-v1.webp";
  return {
    faceEl,
    container: { querySelector: (s) => (s === '[data-c2-layer="face"]' ? faceEl : null) },
  };
}

test("R2 mode borrows the decomposed face layer, creates no overlay", () => {
  withDom((createdCount) => {
    const { faceEl, container } = r2Container();
    const eng = new ExpressionEngine(container, { r2: true });
    assert.equal(eng._overlay, faceEl, "R2 engine must target the [data-c2-layer=face] element");
    assert.equal(eng._ownsOverlay, false, "R2 engine must not own the face layer");
    assert.equal(createdCount(), 0, "R2 mode must not create a new overlay element");
  });
});

test("R2 state changes swap the face layer src via faceSrcForR2", () => {
  withDom(() => {
    const { faceEl, container } = r2Container();
    const eng = new ExpressionEngine(container, { r2: true });
    eng.onStateChange("LOADING_QUESTION"); // → curious
    assert.match(faceEl.src, /face-curious-v1\.webp$/);
    eng.onStateChange("AWAITING_ANSWER");  // → focused
    assert.match(faceEl.src, /face-focused-v2\.webp$/);
    eng.onStateChange("IDLE");             // → neutral
    assert.match(faceEl.src, /face-neutral-v1\.webp$/);
  });
});

test("R2 forceExpression covers all five and sanitises unknown → neutral", () => {
  withDom(() => {
    const { faceEl, container } = r2Container();
    const eng = new ExpressionEngine(container, { r2: true });
    for (const [name, tail] of [
      ["proud", /face-proud-v1\.webp$/],
      ["determined", /face-determined-v2\.webp$/],
      ["focused", /face-focused-v2\.webp$/],
      ["curious", /face-curious-v1\.webp$/],
      ["neutral", /face-neutral-v1\.webp$/],
    ]) { eng.forceExpression(name); assert.match(faceEl.src, tail, name); }
    eng.forceExpression("angry"); // not in the positive-only set → neutral
    assert.match(faceEl.src, /face-neutral-v1\.webp$/);
  });
});

test("R2 destroy leaves the face layer in place and restores neutral", () => {
  withDom(() => {
    const { faceEl, container } = r2Container();
    const eng = new ExpressionEngine(container, { r2: true });
    eng.forceExpression("proud");
    assert.match(faceEl.src, /face-proud-v1\.webp$/);
    eng.destroy();
    assert.match(faceEl.src, /face-neutral-v1\.webp$/, "destroy must restore the face layer to neutral");
    // faceEl was never detached (R2 does not own it) — still a usable element
    assert.equal(typeof faceEl.setAttribute, "function");
  });
});

test("C2 mode still creates its own overlay and never touches a face layer", () => {
  withDom((createdCount) => {
    // C2 container: has a base layer for insertion, no data-c2-layer=face element
    const base = makeImg(); base.className = "quiz-avatar-layer";
    const container = {
      _kids: [base],
      querySelector: (s) => (s === ".quiz-avatar-layer" ? base : null),
      insertBefore() {}, appendChild() {},
    };
    const eng = new ExpressionEngine(container); // C2 (no r2 option)
    assert.equal(eng._ownsOverlay, true, "C2 engine owns its overlay");
    assert.ok(createdCount() >= 1, "C2 mode creates an overlay element");
    assert.notEqual(eng._overlay, base);
  });
});
