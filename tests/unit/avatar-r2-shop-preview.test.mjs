// ── Shop-preview: FORCE_ALL_SHOP_PREVIEWS_TO_C2 (pilot) unit tests ────────────
// The shop-preview decision (shopPreviewModeFor) now returns "c2" for EVERY slot, so every
// product card forces the WHOLE C2 preview (mountC2Avatar forceC2) with the item visible — no
// per-card R2, no mixed grid. These tests prove: shopPreviewModeFor is "c2" for all slots (incl.
// the former R2-safe aura/back) under every flag/opt-in state; the C2 preview shows the item and
// leaks no R2 layer; and the avatar/hub/quiz render path (default mount, no forceC2) STILL renders
// R2 under opt-in (unaffected).
// Node-runnable via a minimal fake DOM (tint feature-detect is off in node, so
// tinted layers render as plain <img> — src assertions are unaffected).
//
// Run: npm run test:unit   (node --test tests/unit/*.test.mjs)

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  AVATAR_R2,
  R2_MANIFEST,
  R2_PHASE1_SAFE_SLOTS,
  shopPreviewModeFor,
  isAvatarR2ActiveFor,
} from "../../js/avatar-layers.js";
import { mountC2Avatar, c2CosmeticLayers } from "../../js/avatar-render-c2.js";

// Simulates the per-browser localStorage opt-in (read at call time).
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

// ── Minimal fake DOM (enough for mountC2Avatar) ───────────────────────────────

function el() {
  return {
    children: [], parentNode: null, className: "", src: "", alt: "", innerHTML: "",
    attrs: {},
    style: { setProperty(k, v) { this[k] = v; } },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    removeAttribute(k) { delete this.attrs[k]; },
    appendChild(c) { c.parentNode = this; this.children.push(c); },
    querySelectorAll() { return []; },
  };
}

async function withDom(fn) {
  globalThis.document = { createElement: () => el(), createElementNS: () => el() };
  try { return await fn(el()); } finally { delete globalThis.document; }
}

const AURA_COSMETIC = { aura: "/x/aura.svg" };
// C2 slot model uses "headwear" (ALL_SLOTS) — the crown's real slot.
const HAT_COSMETIC = { headwear: "/assets/avatar/hat/crown-golden.svg" };
const resolve = (id) => id;

function srcsOf(root) {
  return root.children.map((c) => c.src).filter(Boolean);
}
function faceLayersOf(root) {
  return root.children.filter((c) => c.attrs["data-c2-layer"] === "face");
}

// ── Central decision: shopPreviewModeFor ─────────────────────────────────────

test("safety: AVATAR_R2 stays false", () => {
  assert.equal(AVATAR_R2, false);
});

test("flag off: every slot previews as C2 (production unchanged)", () => {
  for (const slot of ["aura", "back", "hat", "face", "eyes", "torso"]) {
    assert.equal(shopPreviewModeFor(slot), "c2", slot);
  }
});

test("FORCE_ALL_SHOP_PREVIEWS_TO_C2: every slot previews as C2 even under R2 opt-in", () => {
  withR2OptIn(() => {
    assert.equal(isAvatarR2ActiveFor(null), true); // the R2 runtime IS active for the identity…
    // …but the shop preview is forced to C2 for EVERY slot — including the former R2-safe aura/back.
    for (const slot of [...R2_PHASE1_SAFE_SLOTS, "hat", "headwear", "face", "eyes", "torso", "body", "neck", undefined, null]) {
      assert.equal(shopPreviewModeFor(slot), "c2", String(slot));
    }
  });
});

test("opt-in + incomplete stack: C2 preview even for safe slots (no half stack)", () => {
  withR2OptIn(() => {
    withoutManifestEntry("base", "neutral-medium", () => {
      assert.equal(shopPreviewModeFor("aura"), "c2");
    });
  });
});

// ── Renderer override: mountC2Avatar forceC2 ─────────────────────────────────

test("forceC2 under opt-in renders the WHOLE C2 preview with the item visible", async () => {
  await withR2OptIn(() => withDom(async (root) => {
    const cosmetics = c2CosmeticLayers(HAT_COSMETIC, resolve);
    await mountC2Avatar(root, null, { layerClass: "preview-layer", cosmetics, forceC2: true });
    const srcs = srcsOf(root);
    assert.ok(!srcs.some((s) => s.includes("avatar-r2")), "no R2 layer may leak into a forced C2 preview");
    assert.ok(srcs.includes(HAT_COSMETIC.headwear), "the previewed item must be visible in the C2 preview");
  }));
});

test("aura/back under opt-in now preview as C2 with the item visible (no R2 base)", async () => {
  await withR2OptIn(async () => {
    for (const [slot, src] of [["aura", "/x/aura.svg"], ["back", "/x/wings.svg"]]) {
      assert.equal(shopPreviewModeFor(slot), "c2", slot);
      await withDom(async (root) => {
        const cosmetics = c2CosmeticLayers({ [slot]: src }, resolve);
        // The shop drives forceC2 from previewMode !== "r2" → always true now.
        await mountC2Avatar(root, null, { layerClass: "preview-layer", cosmetics, forceC2: shopPreviewModeFor(slot) !== "r2" });
        const srcs = srcsOf(root);
        assert.ok(!srcs.some((s) => s.includes("avatar-r2")), slot + ": no R2 layer may leak into the shop preview");
        assert.ok(srcs.includes(src), slot + " item must be visible in the C2 preview");
      });
    }
  });
});

test("item is ALWAYS visible: the shop decision never yields R2-without-item", async () => {
  await withR2OptIn(async () => {
    for (const [slot, src] of [["aura", "/x/aura.svg"], ["back", "/x/wings.svg"], ["headwear", "/x/hat.svg"], ["face", "/x/mask.svg"]]) {
      const mode = shopPreviewModeFor(slot);
      await withDom(async (root) => {
        const cosmetics = c2CosmeticLayers({ [slot]: src }, resolve);
        await mountC2Avatar(root, null, { layerClass: "preview-layer", cosmetics, forceC2: mode !== "r2" });
        assert.ok(srcsOf(root).includes(src), slot + " item must be visible in mode " + mode);
      });
    }
  });
});

test("R2 preview carries exactly ONE face layer (no double-draw source)", async () => {
  await withR2OptIn(() => withDom(async (root) => {
    const cosmetics = c2CosmeticLayers(AURA_COSMETIC, resolve);
    await mountC2Avatar(root, null, { layerClass: "preview-layer", cosmetics });
    assert.equal(faceLayersOf(root).length, 1);
  }));
});

test("flag off: C2 preview output is unchanged by the new option (default + explicit)", async () => {
  for (const opts of [{}, { forceC2: false }, { forceC2: true }]) {
    await withDom(async (root) => {
      const cosmetics = c2CosmeticLayers(HAT_COSMETIC, resolve);
      await mountC2Avatar(root, null, { layerClass: "preview-layer", cosmetics, ...opts });
      const srcs = srcsOf(root);
      assert.ok(!srcs.some((s) => s.includes("avatar-r2")));
      assert.ok(srcs.includes(HAT_COSMETIC.headwear));
    });
  }
});

test("regression: default mount (no forceC2) still renders R2 under opt-in (app/hub/avatar unchanged)", async () => {
  await withR2OptIn(() => withDom(async (root) => {
    await mountC2Avatar(root, { body_type: "neutral", skin_tone: "medium" }, { layerClass: "avatar-layer" });
    assert.ok(srcsOf(root).some((s) => s.includes("avatar-r2/base/")), "surfaces without forceC2 keep the R2 path");
  }));
});
