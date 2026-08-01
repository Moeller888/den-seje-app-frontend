// ── R2 headwear cosmetic (D-079): unit tests ─────────────────────────────────
// First R2 item-equipment slice. Proves: headwear is an R2-supported cosmetic slot with its own R2 z
// ABOVE the hair and a wrapper transform (source untouched); aura/back stay byte-functional; every
// still-gated slot (eyes/face/neck/torso/body) is filtered OUT of the R2 stack; the C2 path is
// unchanged; AVATAR_R2=false. Node-runnable via a minimal fake DOM (no tint in node → tinted layers
// render as plain <img>; src/marker/z/transform assertions are unaffected).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AVATAR_R2, R2_STACK_Z, C2_LAYER_Z,
  R2_SUPPORTED_COSMETIC_SLOTS, isR2SupportedCosmeticSlot, R2_COSMETIC_Z,
  r2HeadwearTransformFor, r2CosmeticBasename,
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
const HAT = "/assets/avatar/hat/crown-golden.svg";
const resolve = (x) => x;
const layerBy = (root, m) => root.children.filter((c) => c.attrs["data-c2-layer"] === m);
const srcsOf = (root) => root.children.map((c) => c.src).filter(Boolean);

test("safety: AVATAR_R2 stays false", () => { assert.equal(AVATAR_R2, false); });

test("headwear is an R2-supported cosmetic slot; still-gated slots are NOT", () => {
  assert.deepEqual(R2_SUPPORTED_COSMETIC_SLOTS, ["aura", "back", "headwear", "eyes", "face", "torso"]);   // torso added by D-090
  for (const s of ["aura", "back", "headwear"]) assert.equal(isR2SupportedCosmeticSlot(s), true, s);
  // `torso` left this list in D-090 (per-ITEM gating, owned by the torso wiring suite). The rest
  // stay false: neck/body have no catalog content, and hat/glasses/mask are legacy names that are
  // not slot keys at all.
  for (const s of ["neck", "body", "hat", "glasses", "mask", undefined, null]) assert.equal(isR2SupportedCosmeticSlot(s), false, String(s));
});

test("R2 headwear z sits ABOVE the R2 hair", () => {
  assert.ok(R2_COSMETIC_Z.headwear > R2_STACK_Z.hair, `headwear ${R2_COSMETIC_Z.headwear} > hair ${R2_STACK_Z.hair}`);
  // aura/back keep their exact prior behind-base z
  assert.equal(R2_COSMETIC_Z.aura, C2_LAYER_Z.aura);
  assert.equal(R2_COSMETIC_Z.back, C2_LAYER_Z.back);
});

test("headwear renders on R2: marker 'headwear', dedicated z, transform applied, source untouched", async () => {
  await withR2OptIn(() => withDom(async (root) => {
    const cosmetics = c2CosmeticLayers({ headwear: HAT }, resolve);
    const rp = await mountC2Avatar(root, NM, { layerClass: "avatar-layer", cosmetics });
    assert.equal(rp, "r2");
    const hw = layerBy(root, "headwear");
    assert.equal(hw.length, 1, "exactly one headwear layer");
    assert.equal(hw[0].src, HAT, "source src is the original asset (untouched)");
    assert.equal(hw[0].style.zIndex, String(R2_COSMETIC_Z.headwear));
    assert.equal(hw[0].style.transform, r2HeadwearTransformFor(HAT).transform);
    assert.ok(srcsOf(root).some((s) => s.includes("avatar-r2/base/")), "R2 base still renders");
  }));
});

test("aura/back stay byte-functional on R2 (cosmetic marker, prior z, no transform)", async () => {
  await withR2OptIn(() => withDom(async (root) => {
    const cosmetics = c2CosmeticLayers({ aura: "/x/aura.svg", back: "/x/wings.svg" }, resolve);
    await mountC2Avatar(root, NM, { layerClass: "avatar-layer", cosmetics });
    const cos = layerBy(root, "cosmetic");
    const auraL = cos.find((c) => c.src === "/x/aura.svg");
    const backL = cos.find((c) => c.src === "/x/wings.svg");
    assert.ok(auraL && backL, "aura + back render as cosmetic layers");
    assert.equal(auraL.style.zIndex, String(C2_LAYER_Z.aura));
    assert.equal(backL.style.zIndex, String(C2_LAYER_Z.back));
    assert.equal(auraL.style.transform, undefined, "aura carries no transform");
    assert.equal(backL.style.transform, undefined, "back carries no transform");
  }));
});

test("unsupported slots (neck/torso/body) drop the WHOLE avatar to C2 with the items visible (D-082)", async () => {
  await withR2OptIn(() => withDom(async (root) => {
    const cosmetics = c2CosmeticLayers({ neck: "/x/chain.svg", torso: "/x/armor.svg", body: "/x/suit.svg" }, resolve);
    const rp = await mountC2Avatar(root, NM, { layerClass: "avatar-layer", cosmetics });
    assert.equal(rp, "c2", "an item the R2 stack cannot render forces the whole avatar to C2");
    for (const s of ["/x/chain.svg", "/x/armor.svg", "/x/suit.svg"]) {
      assert.ok(srcsOf(root).includes(s), s + " must stay VISIBLE on the C2 path (never silently dropped)");
    }
    assert.ok(!srcsOf(root).some((x) => x.includes("avatar-r2/")), "no R2 layer in the forced C2 render");
  }));
});

test("transform resolver is deterministic; unknown item → default; basename extraction", () => {
  const t1 = r2HeadwearTransformFor(HAT);
  const t2 = r2HeadwearTransformFor("/assets/avatar/hat/totally-unknown-hat.svg");
  assert.deepEqual(t1, t2, "unknown item falls back to the standard transform");
  assert.equal(typeof t1.transform, "string");
  assert.equal(typeof t1.origin, "string");
  assert.equal(r2CosmeticBasename(HAT), "crown-golden");
  assert.equal(r2CosmeticBasename("/a/b/pirate-hat.svg"), "pirate-hat");
  assert.equal(r2CosmeticBasename(null), "");
});

test("unknown headwear item is fail-soft: still renders on R2, no throw", async () => {
  await withR2OptIn(() => withDom(async (root) => {
    const cosmetics = c2CosmeticLayers({ headwear: "/assets/avatar/hat/does-not-exist.svg" }, resolve);
    let rp;
    await assert.doesNotReject(async () => { rp = await mountC2Avatar(root, NM, { layerClass: "avatar-layer", cosmetics }); });
    assert.equal(rp, "r2");
    const hw = layerBy(root, "headwear");
    assert.equal(hw.length, 1);
    assert.equal(hw[0].style.transform, r2HeadwearTransformFor("/x/does-not-exist.svg").transform);
  }));
});

test("C2 path unchanged: forceC2 renders headwear as C2 with no R2 leak", async () => {
  await withR2OptIn(() => withDom(async (root) => {
    const cosmetics = c2CosmeticLayers({ headwear: HAT }, resolve);
    const rp = await mountC2Avatar(root, null, { layerClass: "preview-layer", cosmetics, forceC2: true });
    assert.equal(rp, "c2");
    assert.ok(!srcsOf(root).some((s) => s.includes("avatar-r2")), "no R2 layer in a forced-C2 render");
    assert.ok(srcsOf(root).includes(HAT), "headwear item visible on the C2 render");
    // On C2 the headwear layer carries NO R2 transform (C2 path untouched).
    const c2hw = root.children.find((c) => c.src === HAT);
    assert.equal(c2hw.style.transform, undefined);
  }));
});

test("default C2 mount (no forceC2, no opt-in read as R2) is unaffected by the new option", async () => {
  await withDom(async (root) => {
    const cosmetics = c2CosmeticLayers({ headwear: HAT }, resolve);
    const rp = await mountC2Avatar(root, NM, { layerClass: "avatar-layer", cosmetics }); // no opt-in → C2
    assert.equal(rp, "c2");
    assert.ok(!srcsOf(root).some((s) => s.includes("avatar-r2")));
    assert.ok(srcsOf(root).includes(HAT));
  });
});
