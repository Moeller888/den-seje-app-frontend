// ── R2 face/mask cosmetic (D-081): unit tests ────────────────────────────────
// Third R2 item-equipment slice. Proves: the face COSMETIC slot (masks) renders on the R2 stack with a
// DISTINCT marker "face-cosmetic" (never the mandatory internal "face" layer), a PER-ITEM z (default 8
// under the hair for ninja/hero; panda 41 ABOVE the hair as a full-face replacement) and a PER-ITEM
// wrapper transform re-seating each C2-canvas mask onto the R2 face (source SVGs untouched);
// aura/back/headwear/eyes stay unchanged; the still-gated slots (neck/torso/body) are filtered OUT; the
// C2 path is unchanged; AVATAR_R2=false. Node-runnable via a minimal fake DOM.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AVATAR_R2, R2_STACK_Z,
  R2_SUPPORTED_COSMETIC_SLOTS, isR2SupportedCosmeticSlot, R2_COSMETIC_Z,
  r2FaceTransformFor, r2FaceZFor, R2_FACE_TRANSFORM_DEFAULT, R2_FACE_TRANSFORM_OVERRIDES, R2_FACE_Z_OVERRIDES, r2CosmeticBasename,
} from "../../js/avatar-layers.js";
import { mountC2Avatar, c2CosmeticLayers } from "../../js/avatar-render-c2.js";

function el() {
  return {
    children: [], parentNode: null, className: "", src: "", alt: "", innerHTML: "",
    attrs: {}, style: { setProperty(k, v) { this[k] = v; } },
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
function withR2OptIn(fn) {
  globalThis.localStorage = { getItem: (k) => (k === "avatar_r2" ? "1" : null) };
  try { return fn(); } finally { delete globalThis.localStorage; }
}
const NM = { v: 1, body_type: "neutral", skin_tone: "medium", hairstyle: "tousled", hair_color: "brown" };
const NINJA = "/assets/avatar/mask/ninja-mask.svg";
const HERO = "/assets/avatar/mask/hero-mask.svg";
const PANDA = "/assets/avatar/mask/panda-mask.svg"; // full-face → z above hair
const resolve = (x) => x;
const layerBy = (root, m) => root.children.filter((c) => c.attrs["data-c2-layer"] === m);
const srcsOf = (root) => root.children.map((c) => c.src).filter(Boolean);

test("safety: AVATAR_R2 stays false", () => { assert.equal(AVATAR_R2, false); });

test("face is an R2-supported cosmetic slot (D-081); neck/body still are NOT", () => {
  assert.deepEqual(R2_SUPPORTED_COSMETIC_SLOTS, ["aura", "back", "headwear", "eyes", "face", "torso"]);   // torso added by D-090
  assert.equal(isR2SupportedCosmeticSlot("face"), true);
  // `torso` moved out of this list in D-090 — but it is gated PER ITEM, not per slot, which the
  // torso wiring suite owns. neck/body have no catalog content and stay slot-gated.
  for (const s of ["neck", "body"]) assert.equal(isR2SupportedCosmeticSlot(s), false, s);
});

test("face-cosmetic default z is above the eye stack (z4) + blink lid (z5) + glasses (z6), under the hair", () => {
  assert.equal(R2_COSMETIC_Z.face, 8);
  assert.ok(R2_COSMETIC_Z.face > R2_STACK_Z.eyes, "above internal eyes z4");
  assert.ok(R2_COSMETIC_Z.face > 5, "above blink lid z5");
  assert.ok(R2_COSMETIC_Z.face > R2_COSMETIC_Z.eyes, "above the eyes cosmetic z6");
  assert.ok(R2_COSMETIC_Z.face < R2_STACK_Z.hair, "under the hair z40");
});

test("all three masks render on R2 with marker 'face-cosmetic', per-item z + transform, source untouched", async () => {
  for (const [src, name] of [[NINJA, "ninja"], [HERO, "hero"], [PANDA, "panda"]]) {
    await withR2OptIn(() => withDom(async (root) => {
      const cosmetics = c2CosmeticLayers({ face: src }, resolve);
      const rp = await mountC2Avatar(root, NM, { layerClass: "avatar-layer", cosmetics });
      assert.equal(rp, "r2", name);
      const m = layerBy(root, "face-cosmetic");
      assert.equal(m.length, 1, name + ": exactly one face-cosmetic layer");
      assert.equal(m[0].src, src, name + ": source src is the original asset (untouched)");
      assert.equal(m[0].style.zIndex, String(r2FaceZFor(src)), name + ": per-item z");
      assert.equal(m[0].style.transform, r2FaceTransformFor(src).transform, name + ": per-item transform");
    }));
  }
});

test("per-item z: ninja/hero under the hair (default 8); panda ABOVE the hair (full-face replacement)", () => {
  assert.equal(r2FaceZFor(NINJA), 8, "ninja under hair");
  assert.equal(r2FaceZFor(HERO), 8, "hero under hair");
  assert.equal(r2FaceZFor(PANDA), R2_FACE_Z_OVERRIDES["panda-mask"], "panda uses its override");
  assert.ok(r2FaceZFor(PANDA) > R2_STACK_Z.hair, "panda z above the hair z40");
  assert.ok(r2FaceZFor(PANDA) < R2_COSMETIC_Z.headwear, "panda z still under headwear z45 (a hat sits on top)");
});

test("per-item transforms are deterministic + distinct; unknown/future mask → default", () => {
  assert.equal(r2FaceTransformFor(NINJA).transform, R2_FACE_TRANSFORM_OVERRIDES["ninja-mask"]);
  assert.equal(r2FaceTransformFor(HERO).transform, R2_FACE_TRANSFORM_OVERRIDES["hero-mask"]);
  assert.equal(r2FaceTransformFor(PANDA).transform, R2_FACE_TRANSFORM_OVERRIDES["panda-mask"]);
  assert.ok(/scale\(/.test(r2FaceTransformFor(PANDA).transform), "panda carries a scale");
  assert.equal(r2FaceTransformFor("/assets/avatar/mask/some-future-mask.svg").transform, R2_FACE_TRANSFORM_DEFAULT);
  assert.equal(r2FaceTransformFor(NINJA).origin, "center");
  assert.deepEqual(r2FaceTransformFor(HERO), r2FaceTransformFor(HERO));
  assert.equal(r2CosmeticBasename(PANDA), "panda-mask");
});

test("face cosmetic marker is DISTINCT from the mandatory internal 'face' layer (no collision)", async () => {
  await withR2OptIn(() => withDom(async (root) => {
    const cosmetics = c2CosmeticLayers({ face: HERO }, resolve);
    await mountC2Avatar(root, NM, { layerClass: "avatar-layer", cosmetics });
    const internal = layerBy(root, "face");           // the mandatory R2 neutral face layer
    const cosmetic = layerBy(root, "face-cosmetic");  // the mask overlay
    assert.equal(internal.length, 1, "exactly one internal 'face' layer remains");
    assert.equal(cosmetic.length, 1, "exactly one 'face-cosmetic' layer");
    assert.notEqual(internal[0], cosmetic[0], "two different DOM nodes");
    assert.ok(!internal.some((n) => n.src === HERO), "the mask never lands on the internal face marker");
  }));
});

test("mask + glasses + headwear compose with the correct z-order (headwear > panda > hair > glasses)", async () => {
  await withR2OptIn(() => withDom(async (root) => {
    const cosmetics = c2CosmeticLayers({ face: PANDA, eyes: "/assets/avatar/glasses/glasses-round-basic-v1.svg", headwear: "/assets/avatar/hat/hat-blue.svg" }, resolve);
    await mountC2Avatar(root, NM, { layerClass: "avatar-layer", cosmetics });
    const panda = layerBy(root, "face-cosmetic")[0];
    const glasses = layerBy(root, "eyes-cosmetic")[0];
    const hw = layerBy(root, "headwear")[0];
    const hairZ = R2_STACK_Z.hair;
    assert.ok(panda && glasses && hw, "all three cosmetics present");
    assert.ok(Number(hw.style.zIndex) > Number(panda.style.zIndex), "headwear above the panda mask");
    assert.ok(Number(panda.style.zIndex) > hairZ, "panda above the hair");
    assert.ok(Number(glasses.style.zIndex) < hairZ, "glasses under the hair");
  }));
});

test("an unsupported slot alongside an equipped mask drops the WHOLE avatar to C2 (D-082)", async () => {
  await withR2OptIn(() => withDom(async (root) => {
    const cosmetics = c2CosmeticLayers({ face: NINJA, neck: "/x/chain.svg", torso: "/x/armor.svg", body: "/x/suit.svg" }, resolve);
    const rp = await mountC2Avatar(root, NM, { layerClass: "avatar-layer", cosmetics });
    assert.equal(rp, "c2", "the R2 stack is refused while an unrenderable item is equipped");
    for (const s of [NINJA, "/x/chain.svg", "/x/armor.svg", "/x/suit.svg"]) {
      assert.ok(srcsOf(root).includes(s), s + " must stay visible on the C2 path");
    }
    assert.ok(!srcsOf(root).some((x) => x.includes("avatar-r2/")), "no R2 layer in the forced C2 render");
  }));
});

test("unknown mask item is fail-soft: still renders on R2, no throw, default transform + default z", async () => {
  await withR2OptIn(() => withDom(async (root) => {
    const cosmetics = c2CosmeticLayers({ face: "/assets/avatar/mask/does-not-exist.svg" }, resolve);
    let rp;
    await assert.doesNotReject(async () => { rp = await mountC2Avatar(root, NM, { layerClass: "avatar-layer", cosmetics }); });
    assert.equal(rp, "r2");
    const m = layerBy(root, "face-cosmetic");
    assert.equal(m.length, 1);
    assert.equal(m[0].style.transform, R2_FACE_TRANSFORM_DEFAULT);
    assert.equal(m[0].style.zIndex, String(R2_COSMETIC_Z.face));
  }));
});

test("C2 path unchanged: forceC2 renders the mask as C2 with no R2 leak and no R2 transform", async () => {
  await withR2OptIn(() => withDom(async (root) => {
    const cosmetics = c2CosmeticLayers({ face: PANDA }, resolve);
    const rp = await mountC2Avatar(root, null, { layerClass: "preview-layer", cosmetics, forceC2: true });
    assert.equal(rp, "c2");
    assert.ok(!srcsOf(root).some((s) => s.includes("avatar-r2")), "no R2 layer in a forced-C2 render");
    assert.ok(srcsOf(root).includes(PANDA), "mask item visible on the C2 render");
    const c2m = root.children.find((c) => c.src === PANDA);
    assert.equal(c2m.style.transform, undefined, "no R2 transform on the C2 path");
    assert.notEqual(c2m.attrs["data-c2-layer"], "face-cosmetic", "C2 uses the generic cosmetic marker, not the R2 one");
  }));
});

test("default C2 mount (no opt-in) is unaffected — mask renders on C2", async () => {
  await withDom(async (root) => {
    const cosmetics = c2CosmeticLayers({ face: NINJA }, resolve);
    const rp = await mountC2Avatar(root, NM, { layerClass: "avatar-layer", cosmetics }); // no opt-in → C2
    assert.equal(rp, "c2");
    assert.ok(!srcsOf(root).some((s) => s.includes("avatar-r2")));
    assert.ok(srcsOf(root).includes(NINJA));
  });
});
