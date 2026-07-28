// ── PR C unit tests: decomposed neutral Avatar R2 stack ───────────────────────
// Pure-function coverage of the U2 identity gate, whole-stack-or-nothing fallback,
// binding layer order/blend modes, U1 iris tint constant and the granular engine
// gate — all node-runnable (no DOM). The full Playwright suite remains the
// browser-level merge gate; PR E owns goldens.
//
// Run: npm run test:unit   (node --test tests/unit/*.test.mjs)

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  AVATAR_R2,
  R2_MANIFEST,
  R2_STACK_Z,
  R2_IRIS_DEFAULT,
  r2StackSrcsFor,
  baseSrcForR2,
  isAvatarR2,
  isAvatarR2ActiveFor,
  r2ExpressionOverlayAllowedFor,
  r2BlinkAllowedFor,
} from "../../js/avatar-layers.js";
import { composeR2Layers, composeC2Layers } from "../../js/avatar-render-c2.js";

const NEUTRAL_MEDIUM = { body_type: "neutral", skin_tone: "medium" };

// Simulates the per-browser localStorage opt-in (isAvatarR2 reads it at call time).
function withR2OptIn(fn) {
  globalThis.localStorage = { getItem: (k) => (k === "avatar_r2" ? "1" : null) };
  try { return fn(); } finally { delete globalThis.localStorage; }
}

// Temporarily removes a manifest entry; always restores (the manifest is module
// state shared across tests).
function withoutManifestEntry(slot, key, fn) {
  const saved = R2_MANIFEST[slot][key];
  delete R2_MANIFEST[slot][key];
  try { return fn(); } finally { R2_MANIFEST[slot][key] = saved; }
}

test("safety: AVATAR_R2 stays false (C2 is production default)", () => {
  assert.equal(AVATAR_R2, false);
  assert.equal(isAvatarR2(), false); // no localStorage in node → flag alone decides
});

test("U1: the iris default is the measured Master-brown", () => {
  assert.equal(R2_IRIS_DEFAULT, "#A34A0F");
});

test("base entry resolves to the promoted decomposed v2 WebP", () => {
  assert.equal(baseSrcForR2(NEUTRAL_MEDIUM), "/assets/avatar-r2/base/body-neutral-medium-v2.webp");
});

test("U2: exactly neutral × medium resolves the full stack", () => {
  const s = r2StackSrcsFor(NEUTRAL_MEDIUM);
  assert.ok(s, "neutral × medium must resolve");
  assert.deepEqual(s, {
    base:      "/assets/avatar-r2/base/body-neutral-medium-v2.webp",
    blush:     "/assets/avatar-r2/face/face-blush-multiply-v1.webp",
    face:      "/assets/avatar-r2/face/face-neutral-v1.webp",
    eyesIris:  "/assets/avatar-r2/eyes/eyes-neutral-iris-v1.webp",
    eyesFixed: "/assets/avatar-r2/eyes/eyes-neutral-fixed-v1.webp",
    hair:      "/assets/avatar-r2/hair/hair-northstar-v1.webp",
  });
});

test("U2: other explicit body types fall back (no aliasing)", () => {
  assert.equal(r2StackSrcsFor({ body_type: "male",   skin_tone: "medium" }), null);
  assert.equal(r2StackSrcsFor({ body_type: "female", skin_tone: "medium" }), null);
});

test("U2: dark skin tone falls back (no dark-on-medium mapping)", () => {
  assert.equal(r2StackSrcsFor({ body_type: "neutral", skin_tone: "dark" }), null);
});

test("defensive defaults mirror C2: null/garbage identity resolves neutral-medium", () => {
  assert.ok(r2StackSrcsFor(null));
  assert.ok(r2StackSrcsFor({ body_type: "banana", skin_tone: 42 }));
});

test("whole-stack-or-nothing: any missing mandatory entry kills the stack", () => {
  for (const [slot, key] of [
    ["base", "neutral-medium"],
    ["blush", "multiply"],
    ["face", "neutral"],
    ["eyesIris", "neutral"],
    ["eyesFixed", "neutral"],
    ["hair", "northstar"],
  ]) {
    withoutManifestEntry(slot, key, () => {
      assert.equal(r2StackSrcsFor(NEUTRAL_MEDIUM), null, slot + "." + key + " missing must → null");
      assert.equal(composeR2Layers(NEUTRAL_MEDIUM), null, slot + "." + key + " missing must → C2 fallback");
    });
  }
});

test("binding layer order and blend modes (integration composite §6)", () => {
  const layers = composeR2Layers(NEUTRAL_MEDIUM);
  assert.ok(Array.isArray(layers));
  assert.equal(layers.length, 6); // no cosmetics passed
  const [base, blush, face, iris, fixed, hair] = layers;

  assert.equal(base.isBase, true);
  assert.equal(base.z, R2_STACK_Z.base);

  assert.equal(blush.z, R2_STACK_Z.blush);
  assert.equal(blush.blend, "multiply");
  assert.match(blush.src, /face-blush-multiply-v1\.webp$/);

  assert.equal(face.z, R2_STACK_Z.face);
  assert.equal(face.blend, undefined);

  assert.equal(iris.z, R2_STACK_Z.eyes);
  assert.equal(iris.tint, "iris");
  assert.equal(fixed.z, R2_STACK_Z.eyes);
  assert.equal(fixed.tint, undefined);
  assert.ok(layers.indexOf(iris) < layers.indexOf(fixed), "iris must be emitted before eyes-fixed (same z → DOM order)");

  assert.equal(hair.z, R2_STACK_Z.hair);
  assert.equal(hair.tint, "hair");
  assert.match(hair.src, /hair-northstar-v1\.webp$/, "runtime hair must be the luminance map, never hair-pl1-color");
});

test("cosmetic slot-gate: aura/back/headwear pass; eyes/face/neck/torso/body stay gated (D-079)", () => {
  const cosmetics = [
    { slot: "aura", src: "/x/aura.svg", z: -30 },
    { slot: "back", src: "/x/wings.svg", z: -20 },
    { slot: "headwear", src: "/x/hat.svg", z: 50 },
    { slot: "eyes", src: "/x/glasses.svg", z: 55 },
    { slot: "face", src: "/x/mask.svg", z: 50 },
    { slot: "torso", src: "/x/armor.svg", z: 20 },
    { slot: "body", src: "/x/suit.svg", z: 10 },
    { slot: "neck", src: "/x/chain.svg", z: 30 },
  ];
  const layers = composeR2Layers(NEUTRAL_MEDIUM, cosmetics);
  const srcs = layers.map((l) => l.src);
  assert.ok(srcs.includes("/x/aura.svg"), "aura passes");
  assert.ok(srcs.includes("/x/wings.svg"), "back passes");
  assert.ok(srcs.includes("/x/hat.svg"), "headwear passes (D-079)");
  for (const s of ["/x/glasses.svg", "/x/mask.svg", "/x/armor.svg", "/x/suit.svg", "/x/chain.svg"]) {
    assert.ok(!srcs.includes(s), s + " must stay gated");
  }
  // headwear gets its DEDICATED R2 z (above the R2 hair, 40), not the raw incoming c.z
  const hw = layers.find((l) => l.src === "/x/hat.svg");
  assert.ok(hw.z > 40, "headwear z above the R2 hair");
});

test("engine gate with flag OFF: C2 behaviour unchanged (both engines allowed)", () => {
  assert.equal(r2ExpressionOverlayAllowedFor(NEUTRAL_MEDIUM), true);
  assert.equal(r2BlinkAllowedFor(NEUTRAL_MEDIUM), true);
});

test("engine gate with opt-in: expression OFF on the R2 stack, blink allowed (PR D)", () => {
  withR2OptIn(() => {
    assert.equal(isAvatarR2(), true);
    assert.equal(isAvatarR2ActiveFor(NEUTRAL_MEDIUM), true);
    assert.equal(r2ExpressionOverlayAllowedFor(NEUTRAL_MEDIUM), false);
    assert.equal(r2BlinkAllowedFor(NEUTRAL_MEDIUM), true); // PR D: blink runs with the R2 profile
  });
});

test("engine gate with opt-in but unsupported identity: C2 engines stay on", () => {
  withR2OptIn(() => {
    const male = { body_type: "male", skin_tone: "medium" };
    assert.equal(isAvatarR2ActiveFor(male), false);
    assert.equal(r2ExpressionOverlayAllowedFor(male), true);
    assert.equal(r2BlinkAllowedFor(male), true);
  });
});

test("C2 compose path is structurally unchanged (base + hair inline)", () => {
  const layers = composeC2Layers(NEUTRAL_MEDIUM);
  assert.equal(layers.length, 2);
  assert.equal(layers[0].isBase, true);
  assert.equal(layers[1].inline, true);
});
