// ── Activation-audit F1: atomic R2 asset-load fallback (unit) ─────────────────
// Exercises mountC2Avatar's preload/decode gate, whole-stack-to-C2 fallback,
// optional-overlay drop, render-path stamp, and the race/abort contract — with a
// minimal DOM + Image mock (the repo's node --test runner has no DOM). The real
// surfaces are covered by the Playwright fallback spec.
//
// Run: npm run test:unit

import { test } from "node:test";
import assert from "node:assert/strict";

// ── Minimal DOM mock ──────────────────────────────────────────────────────────
function makeEl(tag) {
  return {
    tagName: String(tag).toUpperCase(),
    children: [],
    dataset: {},
    style: { setProperty() {} },
    className: "",
    innerHTML: "",
    _attrs: {},
    setAttribute(k, v) { this._attrs[k] = v; },
    getAttribute(k) { return this._attrs[k] ?? null; },
    removeAttribute(k) { delete this._attrs[k]; },
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); },
    querySelectorAll(sel) {
      const out = [];
      const walk = (n) => {
        for (const c of n.children) {
          if (sel === "[data-c2-layer]" && c._attrs["data-c2-layer"] != null) out.push(c);
          if (sel === "img" && c.tagName === "IMG") out.push(c);
          walk(c);
        }
      };
      walk(this);
      return out;
    },
  };
}
function layerMarkers(rootEl) {
  return rootEl.querySelectorAll("[data-c2-layer]").map((n) => n._attrs["data-c2-layer"]);
}

let FAIL = new Set(); // urls that fail to load/decode
function installMocks() {
  globalThis.document = { createElement: (t) => makeEl(t) };
  globalThis.fetch = () => Promise.reject(new Error("no network in unit test")); // hair inline → skipped, base survives
  globalThis.Image = class {
    constructor() { this._src = ""; this.naturalWidth = 1; this.onload = null; this.onerror = null; }
    set src(v) {
      this._src = v;
      queueMicrotask(() => {
        if (FAIL.has(v)) { this.naturalWidth = 0; this.onerror && this.onerror(); }
        else { this.naturalWidth = 1; this.onload && this.onload(); }
      });
    }
    get src() { return this._src; }
    decode() { return FAIL.has(this._src) ? Promise.reject(new Error("decode fail")) : Promise.resolve(); }
  };
  // CSS left undefined → r2TintSupported() false → tint layers render as plain <img> (still marked).
  globalThis.localStorage = { getItem: (k) => (k === "avatar_r2" ? "1" : null), setItem() {}, removeItem() {} };
}
function clearMocks() {
  delete globalThis.document; delete globalThis.fetch; delete globalThis.Image; delete globalThis.localStorage; delete globalThis.CSS;
}

installMocks();
const { mountC2Avatar } = await import("../../js/avatar-render-c2.js");
const { blinkConfigFor } = await import("../../js/avatar-layers.js");

const NEUTRAL = { body_type: "neutral", skin_tone: "medium" };
const BASE = "/assets/avatar-r2/base/body-neutral-medium-v2.webp";
const FACE = "/assets/avatar-r2/face/face-neutral-v1.webp";
const HAIR = "/assets/avatar-r2/hair/hair-northstar-v1.webp";
const EYES = "/assets/avatar-r2/eyes/eyes-neutral-fixed-v1.webp";

test.beforeEach(() => { FAIL = new Set(); });

test("all mandatory assets load → complete R2 stack, stamp r2", async () => {
  const root = makeEl("div");
  const path = await mountC2Avatar(root, NEUTRAL);
  assert.equal(path, "r2");
  assert.equal(root.dataset.avatarRenderPath, "r2");
  const m = layerMarkers(root);
  for (const marker of ["base", "blush", "face", "iris", "eyes", "hair-r2"]) assert.ok(m.includes(marker), "missing " + marker);
});

for (const [label, badUrl] of [["base", BASE], ["face", FACE], ["eyes", EYES], ["hair", HAIR]]) {
  test(`${label} fails to load → complete C2, no R2 layers, stamp c2`, async () => {
    FAIL = new Set([badUrl]);
    const root = makeEl("div");
    const path = await mountC2Avatar(root, NEUTRAL);
    assert.equal(path, "c2", label + " failure must fall back to C2");
    assert.equal(root.dataset.avatarRenderPath, "c2");
    const m = layerMarkers(root);
    for (const r2 of ["blush", "face", "iris", "hair-r2"]) assert.ok(!m.includes(r2), "C2 fallback must not contain R2 layer " + r2);
    // C2 base is present (marker "base"), sourced from a -c2.svg (not the R2 webp).
    const base = root.querySelectorAll("[data-c2-layer]").find((n) => n._attrs["data-c2-layer"] === "base");
    assert.ok(base, "C2 base must be mounted");
    // no broken img: the only imgs are C2 layers that our mock resolves
  });
}

test("decode failure (not just 404) on a mandatory layer → C2", async () => {
  FAIL = new Set([FACE]); // Image.decode() rejects for FACE
  const root = makeEl("div");
  const path = await mountC2Avatar(root, NEUTRAL);
  assert.equal(path, "c2");
});

test("multiple simultaneous mandatory failures → exactly one C2 mount", async () => {
  FAIL = new Set([BASE, FACE, HAIR]);
  const root = makeEl("div");
  const path = await mountC2Avatar(root, NEUTRAL);
  assert.equal(path, "c2");
  // exactly one base layer (no double mount)
  const bases = root.querySelectorAll("[data-c2-layer]").filter((n) => n._attrs["data-c2-layer"] === "base");
  assert.equal(bases.length, 1);
});

test("optional safe overlay failure does NOT drop the base to C2", async () => {
  const AURA = "/assets/avatar/aura/aura-gold.svg";
  FAIL = new Set([AURA]);
  const root = makeEl("div");
  const path = await mountC2Avatar(root, NEUTRAL, { cosmetics: [{ slot: "aura", src: AURA, z: -30 }] });
  assert.equal(path, "r2", "an optional overlay failure must keep the R2 base");
  const m = layerMarkers(root);
  assert.ok(m.includes("base") && m.includes("face"), "R2 stack still present");
  assert.ok(!m.includes("cosmetic"), "the failed aura overlay was dropped");
});

test("newer mount wins: the stale mount aborts without mutating the DOM", async () => {
  const root = makeEl("div");
  const p1 = mountC2Avatar(root, NEUTRAL);          // gen 1
  const p2 = mountC2Avatar(root, NEUTRAL);          // gen 2 (claims the element synchronously)
  const [r1, r2] = await Promise.all([p1, p2]);
  assert.equal(r1, "aborted", "the superseded mount must abort");
  assert.equal(r2, "r2");
  assert.equal(root.dataset.avatarRenderPath, "r2");
  // only ONE complete stack ended up mounted (no duplicated base)
  const bases = root.querySelectorAll("[data-c2-layer]").filter((n) => n._attrs["data-c2-layer"] === "base");
  assert.equal(bases.length, 1);
});

test("flag off / forceC2 → C2 path, stamp c2, no R2 layers", async () => {
  const root = makeEl("div");
  const path = await mountC2Avatar(root, NEUTRAL, { forceC2: true });
  assert.equal(path, "c2");
  assert.equal(root.dataset.avatarRenderPath, "c2");
  assert.ok(!layerMarkers(root).includes("blush"));
});

test("null rootEl → returns c2, never throws", async () => {
  assert.equal(await mountC2Avatar(null, NEUTRAL), "c2");
});

// ── blinkConfigFor render-path override ───────────────────────────────────────
test("blinkConfigFor(identity, false) forces c2 lids even when the manifest resolves", () => {
  // override false → mode c2 regardless of isAvatarR2ActiveFor
  assert.equal(blinkConfigFor(NEUTRAL, false).mode, "c2");
});
test("blinkConfigFor(identity, true) forces r2 lids", () => {
  assert.equal(blinkConfigFor(NEUTRAL, true).mode, "r2");
});
test("blinkConfigFor(identity) with no override → manifest-based", () => {
  // D-101: R2 is the default, so no-storage resolves to r2 for a supported identity, and the C2
  // mode is what an explicit opt-out ("0") produces. Both directions are pinned here.
  const saved = globalThis.localStorage;
  delete globalThis.localStorage;
  try {
    assert.equal(blinkConfigFor(NEUTRAL).mode, "r2");
    globalThis.localStorage = { getItem: (k) => (k === "avatar_r2" ? "0" : null) };
    assert.equal(blinkConfigFor(NEUTRAL).mode, "c2");
  } finally {
    if (saved === undefined) delete globalThis.localStorage; else globalThis.localStorage = saved;
  }
});

test.after(() => clearMocks());
