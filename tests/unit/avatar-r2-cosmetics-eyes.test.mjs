// ── R2 eyes/glasses cosmetic (D-080): unit tests ─────────────────────────────
// Second R2 item-equipment slice. Proves: the eyes COSMETIC slot renders on the R2 stack with its own
// R2 z (above the internal eye stack + blink lid, under the hair) and a wrapper transform re-seating
// the C2-canvas glasses onto the R2 eye-line (source SVG untouched); its DOM marker "eyes-cosmetic" is
// DISTINCT from the mandatory internal "eyes" layer (no marker collision); aura/back/headwear stay
// unchanged; the still-gated slots (face/neck/torso/body) are filtered OUT; the C2 path is unchanged;
// AVATAR_R2=false. Node-runnable via a minimal fake DOM (no tint in node → tinted layers render as
// plain <img>; src/marker/z/transform assertions are unaffected).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AVATAR_R2, R2_STACK_Z,
  R2_SUPPORTED_COSMETIC_SLOTS, isR2SupportedCosmeticSlot, R2_COSMETIC_Z,
  r2EyesTransformFor, R2_EYES_TRANSFORM_DEFAULT, R2_EYES_TRANSFORM_OVERRIDES, r2CosmeticBasename,
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
const GLASSES = "/assets/avatar/glasses/glasses-round.svg"; // the ONLY active eyes item
const resolve = (x) => x;
const layerBy = (root, m) => root.children.filter((c) => c.attrs["data-c2-layer"] === m);
const srcsOf = (root) => root.children.map((c) => c.src).filter(Boolean);

test("safety: AVATAR_R2 stays false", () => { assert.equal(AVATAR_R2, false); });

test("eyes is an R2-supported cosmetic slot (D-080)", () => {
  assert.deepEqual(R2_SUPPORTED_COSMETIC_SLOTS, ["aura", "back", "headwear", "eyes"]);
  assert.equal(isR2SupportedCosmeticSlot("eyes"), true);
});

test("R2 eyes-cosmetic z sits ABOVE the internal eye stack (z4) + blink lid (z5) but BELOW the hair", () => {
  assert.ok(R2_COSMETIC_Z.eyes > R2_STACK_Z.eyes, `eyes cosmetic ${R2_COSMETIC_Z.eyes} > internal eyes ${R2_STACK_Z.eyes}`);
  assert.ok(R2_COSMETIC_Z.eyes > 5, "eyes cosmetic above the blink lid (z5)");
  assert.ok(R2_COSMETIC_Z.eyes < R2_STACK_Z.hair, `eyes cosmetic ${R2_COSMETIC_Z.eyes} < hair ${R2_STACK_Z.hair}`);
  // and below the headwear cosmetic (45) — glasses never sit on top of a hat
  assert.ok(R2_COSMETIC_Z.eyes < R2_COSMETIC_Z.headwear, "eyes cosmetic below headwear");
});

test("glasses render on R2: marker 'eyes-cosmetic', dedicated z, transform applied, source untouched", async () => {
  await withR2OptIn(() => withDom(async (root) => {
    const cosmetics = c2CosmeticLayers({ eyes: GLASSES }, resolve);
    const rp = await mountC2Avatar(root, NM, { layerClass: "avatar-layer", cosmetics });
    assert.equal(rp, "r2");
    const g = layerBy(root, "eyes-cosmetic");
    assert.equal(g.length, 1, "exactly one eyes-cosmetic layer");
    assert.equal(g[0].src, GLASSES, "source src is the original asset (untouched)");
    assert.equal(g[0].style.zIndex, String(R2_COSMETIC_Z.eyes));
    assert.equal(g[0].style.transform, r2EyesTransformFor(GLASSES).transform);
    assert.ok(srcsOf(root).some((s) => s.includes("avatar-r2/base/")), "R2 base still renders");
  }));
});

test("cosmetic marker is DISTINCT from the mandatory internal 'eyes' layer (no collision)", async () => {
  await withR2OptIn(() => withDom(async (root) => {
    const cosmetics = c2CosmeticLayers({ eyes: GLASSES }, resolve);
    await mountC2Avatar(root, NM, { layerClass: "avatar-layer", cosmetics });
    const internal = layerBy(root, "eyes");          // the mandatory R2 eyes-fixed layer
    const cosmetic = layerBy(root, "eyes-cosmetic"); // the glasses overlay
    assert.equal(internal.length, 1, "exactly one internal 'eyes' layer remains");
    assert.equal(cosmetic.length, 1, "exactly one 'eyes-cosmetic' layer");
    assert.notEqual(internal[0], cosmetic[0], "they are two different DOM nodes");
    assert.ok(!internal.some((n) => n.src === GLASSES), "the glasses never land on the internal eyes marker");
  }));
});

test("standard transform + deterministic per-item override; unknown item → default", () => {
  // glasses-round has a version-controlled override (oversized/wide → downscale)
  const rounded = r2EyesTransformFor(GLASSES);
  assert.equal(rounded.transform, R2_EYES_TRANSFORM_OVERRIDES["glasses-round"]);
  assert.ok(/scale\(/.test(rounded.transform), "glasses-round downscale applied");
  // a future/unknown front-glasses asset gets the STANDARD vertical re-seat
  const other = r2EyesTransformFor("/assets/avatar/glasses/some-future-glasses.svg");
  assert.equal(other.transform, R2_EYES_TRANSFORM_DEFAULT);
  // deterministic
  assert.deepEqual(r2EyesTransformFor(GLASSES), r2EyesTransformFor(GLASSES));
  assert.equal(typeof rounded.origin, "string");
  assert.equal(r2CosmeticBasename(GLASSES), "glasses-round");
});

test("still-gated slots (face/neck/torso/body) stay filtered OUT alongside an equipped eyes item", async () => {
  await withR2OptIn(() => withDom(async (root) => {
    const cosmetics = c2CosmeticLayers({ eyes: GLASSES, face: "/x/mask.svg", neck: "/x/chain.svg", torso: "/x/armor.svg", body: "/x/suit.svg" }, resolve);
    await mountC2Avatar(root, NM, { layerClass: "avatar-layer", cosmetics });
    assert.ok(srcsOf(root).includes(GLASSES), "eyes/glasses passes");
    for (const s of ["/x/mask.svg", "/x/chain.svg", "/x/armor.svg", "/x/suit.svg"]) {
      assert.ok(!srcsOf(root).includes(s), s + " must NOT leak into the R2 stack");
    }
  }));
});

test("headwear + glasses render simultaneously with the correct z-order (headwear above hair, glasses below)", async () => {
  await withR2OptIn(() => withDom(async (root) => {
    const cosmetics = c2CosmeticLayers({ eyes: GLASSES, headwear: "/assets/avatar/hat/hat-blue.svg" }, resolve);
    await mountC2Avatar(root, NM, { layerClass: "avatar-layer", cosmetics });
    const g = layerBy(root, "eyes-cosmetic")[0];
    const hw = layerBy(root, "headwear")[0];
    assert.ok(g && hw, "both cosmetic layers present");
    assert.ok(Number(hw.style.zIndex) > Number(g.style.zIndex), "headwear paints above the glasses");
    assert.ok(Number(g.style.zIndex) < R2_STACK_Z.hair, "glasses paint under the hair");
  }));
});

test("unknown eyes item is fail-soft: still renders on R2, no throw, standard transform", async () => {
  await withR2OptIn(() => withDom(async (root) => {
    const cosmetics = c2CosmeticLayers({ eyes: "/assets/avatar/glasses/does-not-exist.svg" }, resolve);
    let rp;
    await assert.doesNotReject(async () => { rp = await mountC2Avatar(root, NM, { layerClass: "avatar-layer", cosmetics }); });
    assert.equal(rp, "r2");
    const g = layerBy(root, "eyes-cosmetic");
    assert.equal(g.length, 1);
    assert.equal(g[0].style.transform, R2_EYES_TRANSFORM_DEFAULT);
  }));
});

test("C2 path unchanged: forceC2 renders glasses as C2 with no R2 leak and no R2 transform", async () => {
  await withR2OptIn(() => withDom(async (root) => {
    const cosmetics = c2CosmeticLayers({ eyes: GLASSES }, resolve);
    const rp = await mountC2Avatar(root, null, { layerClass: "preview-layer", cosmetics, forceC2: true });
    assert.equal(rp, "c2");
    assert.ok(!srcsOf(root).some((s) => s.includes("avatar-r2")), "no R2 layer in a forced-C2 render");
    assert.ok(srcsOf(root).includes(GLASSES), "glasses item visible on the C2 render");
    const c2g = root.children.find((c) => c.src === GLASSES);
    assert.equal(c2g.style.transform, undefined, "no R2 transform on the C2 path");
    assert.notEqual(c2g.attrs["data-c2-layer"], "eyes-cosmetic", "C2 uses the generic cosmetic marker, not the R2 one");
  }));
});

test("default C2 mount (no opt-in) is unaffected — glasses render on C2", async () => {
  await withDom(async (root) => {
    const cosmetics = c2CosmeticLayers({ eyes: GLASSES }, resolve);
    const rp = await mountC2Avatar(root, NM, { layerClass: "avatar-layer", cosmetics }); // no opt-in → C2
    assert.equal(rp, "c2");
    assert.ok(!srcsOf(root).some((s) => s.includes("avatar-r2")));
    assert.ok(srcsOf(root).includes(GLASSES));
  });
});
