// ── R2 unrenderable-cosmetic fallback (D-082 option B): unit tests ───────────
// The R2 stack cannot render the neck/torso/body slots. Before this change those cosmetics were
// filtered out of composeR2Layers SILENTLY: an equipped Ridderdragt (the only live `torso` item,
// 300 coins) showed on C2 and NOTHING on R2 — no layer, no warning, no fallback (D-082 §6, MAJOR).
// Now such an item refuses the R2 stack for the WHOLE avatar, so the complete C2 path renders with
// the item visible on its proven C2 anchors.
//
// Proves: the pure slot helpers; composeR2Layers returns null for an unrenderable equipped item and
// is otherwise UNCHANGED; mountC2Avatar returns "c2" with every item visible and no R2 leak;
// un-equipping restores R2 (no sticky state); the observability reason is the new, DISTINCT
// `unsupported_cosmetic_equipped` (never `identity_ineligible`); forceC2 still reports `forced_c2`;
// malformed cosmetics never force C2 and never throw; the C2 default path is untouched;
// AVATAR_R2 stays false. Node-runnable via a minimal fake DOM.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AVATAR_R2, R2_SUPPORTED_COSMETIC_SLOTS, isR2SupportedCosmeticSlot,
  r2UnrenderableCosmeticSlots, r2RequiresC2Fallback,
} from "../../js/avatar-layers.js";
import { mountC2Avatar, composeR2Layers, c2CosmeticLayers } from "../../js/avatar-render-c2.js";

// Fake element. Unlike the other R2 unit suites this one models querySelectorAll("[data-c2-layer]")
// + remove(), because the re-render test asserts that mountC2Avatar's layer CLEANUP actually drops
// the previous render's layers (a stub returning [] would make that assertion vacuous).
function el() {
  return {
    children: [], parentNode: null, className: "", src: "", alt: "", innerHTML: "",
    attrs: {}, style: { setProperty(k, v) { this[k] = v; } },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    removeAttribute(k) { delete this.attrs[k]; },
    appendChild(c) { c.parentNode = this; this.children.push(c); },
    remove() {
      const p = this.parentNode;
      if (!p) return;
      const i = p.children.indexOf(this);
      if (i !== -1) p.children.splice(i, 1);
      this.parentNode = null;
    },
    querySelectorAll(sel) {
      if (sel !== "[data-c2-layer]") return [];
      return this.children.filter((c) => c.attrs["data-c2-layer"] != null);
    },
  };
}
async function withDom(fn) {
  globalThis.document = { createElement: () => el(), createElementNS: () => el() };
  try { return await fn(el()); } finally { delete globalThis.document; }
}
// AWAITS fn: the opt-in must survive past the first await, since mountC2Avatar reads it again at
// emission time (after the preload). A sync-return variant would tear it down too early.
async function withR2OptIn(fn) {
  globalThis.localStorage = { getItem: (k) => (k === "avatar_r2" ? "1" : null) };
  try { return await fn(); } finally { delete globalThis.localStorage; }
}
// Capture the advisory observability events emitted during `fn` (opt-in is provided by withR2OptIn).
async function withEvents(fn) {
  const events = [];
  const origInfo = console.info, origWarn = console.warn, origError = console.error;
  const cap = (level) => (...a) => { if (String(a[0]).includes("[avatar-r2-observability]")) events.push({ level, payload: a[1] }); };
  console.info = cap("info"); console.warn = cap("warn"); console.error = cap("error");
  try { await fn(events); } finally { console.info = origInfo; console.warn = origWarn; console.error = origError; }
  return events;
}

const NM = { v: 1, body_type: "neutral", skin_tone: "medium", hairstyle: "tousled", hair_color: "brown" };
// The one live torso item (D-082 §2): id `armor-knight`, "Ridderdragt", 300 coins.
// Since D-090 it HAS R2 artwork and renders on the R2 stack, so it is no longer this suite's
// example of an unrenderable item — the D-090 wiring suite owns its behaviour.
const ARMOR = "/assets/avatar/shirt/armor-knight.svg";
// A hypothetical SECOND torso item with no R2 artwork — the shape of every torso item added to the
// shop from now on, until someone produces and promotes an R2 asset for it. D-083's protection is
// what stands between such an item and a student seeing an R2 avatar without the thing they bought,
// so the whole fallback contract below is exercised through it.
const UNWIRED_TORSO = "/assets/avatar/shirt/future-robe.svg";
const HAT = "/assets/avatar/hat/crown-golden.svg";
const GLASSES = "/assets/avatar/glasses/glasses-round-basic-v1.svg";
const resolve = (x) => x;
const srcsOf = (root) => root.children.map((c) => c.src).filter(Boolean);
const hasR2 = (root) => srcsOf(root).some((s) => s.includes("avatar-r2/"));

test("safety: AVATAR_R2 stays false", () => { assert.equal(AVATAR_R2, false); });

test("the fallback still covers every slot without R2 support", () => {
  // D-083 added no slot; D-090 later added `torso` (per item). neck/body remain slot-gated and are
  // still the plain case this protection exists for.
  assert.deepEqual(R2_SUPPORTED_COSMETIC_SLOTS, ["aura", "back", "headwear", "eyes", "face", "torso"]);
  for (const s of ["neck", "body"]) assert.equal(isR2SupportedCosmeticSlot(s), false, s);
});

test("r2UnrenderableCosmeticSlots: reports the unsupported slots, ignores the supported ones", () => {
  assert.deepEqual(r2UnrenderableCosmeticSlots([{ slot: "torso", src: UNWIRED_TORSO, z: 2 }]), ["torso"]);
  assert.deepEqual(
    r2UnrenderableCosmeticSlots([
      { slot: "headwear", src: HAT, z: 5 },
      { slot: "eyes", src: GLASSES, z: 7 },
      { slot: "torso", src: UNWIRED_TORSO, z: 2 },
      { slot: "neck", src: "/x/chain.svg", z: 3 },
      { slot: "body", src: "/x/suit.svg", z: 1 },
    ]),
    ["torso", "neck", "body"],
    "distinct unsupported slots, in encounter order",
  );
  // A slot repeated does not repeat in the result.
  assert.deepEqual(r2UnrenderableCosmeticSlots([{ slot: "torso", src: UNWIRED_TORSO, z: 2 }, { slot: "torso", src: "/x/other.svg", z: 2 }]), ["torso"]);
  // Only supported slots → nothing to report.
  assert.deepEqual(r2UnrenderableCosmeticSlots([{ slot: "aura", src: "/x/a.svg", z: -30 }, { slot: "face", src: "/x/m.svg", z: 6 }]), []);
  // D-090: the ONE torso item that does have R2 artwork is not reported — that is the whole point
  // of gating this slot per item rather than per slot.
  assert.deepEqual(r2UnrenderableCosmeticSlots([{ slot: "torso", src: ARMOR, z: 2 }]), []);
  // ...and it does not mask a second, unwired torso item equipped alongside it.
  assert.deepEqual(r2UnrenderableCosmeticSlots([{ slot: "torso", src: ARMOR, z: 2 }, { slot: "torso", src: UNWIRED_TORSO, z: 2 }]), ["torso"]);
});

test("r2UnrenderableCosmeticSlots is defensive: junk in, [] out, never throws", () => {
  for (const junk of [null, undefined, 0, "torso", {}, [], [null], [undefined], [{}]]) {
    assert.deepEqual(r2UnrenderableCosmeticSlots(junk), [], JSON.stringify(junk));
  }
  // An entry that cannot render on EITHER path (no src / non-numeric z) must NOT force C2.
  assert.deepEqual(r2UnrenderableCosmeticSlots([{ slot: "torso", src: "", z: 2 }]), []);
  assert.deepEqual(r2UnrenderableCosmeticSlots([{ slot: "torso", src: ARMOR, z: "2" }]), []);
  assert.deepEqual(r2UnrenderableCosmeticSlots([{ slot: "torso", src: ARMOR }]), []);
});

test("r2RequiresC2Fallback mirrors the slot report as a boolean", () => {
  assert.equal(r2RequiresC2Fallback([{ slot: "torso", src: UNWIRED_TORSO, z: 2 }]), true);
  assert.equal(r2RequiresC2Fallback([{ slot: "torso", src: ARMOR, z: 2 }]), false, "D-090: the wired item does not force C2");
  assert.equal(r2RequiresC2Fallback([{ slot: "headwear", src: HAT, z: 5 }]), false);
  assert.equal(r2RequiresC2Fallback([]), false);
  assert.equal(r2RequiresC2Fallback(null), false);
});

test("composeR2Layers: an unrenderable torso item refuses the WHOLE stack; without it the stack is unchanged", () => {
  const supported = c2CosmeticLayers({ headwear: HAT, eyes: GLASSES }, resolve);
  const withUnwired = c2CosmeticLayers({ headwear: HAT, eyes: GLASSES, torso: UNWIRED_TORSO }, resolve);
  const ok = composeR2Layers(NM, supported);
  assert.ok(Array.isArray(ok) && ok.length > 0, "supported cosmetics still compose an R2 stack");
  assert.equal(composeR2Layers(NM, withUnwired), null, "a torso item without R2 artwork refuses the R2 stack");
  // The refusal is driven ONLY by what is equipped — the same identity still composes without it.
  assert.deepEqual(composeR2Layers(NM, supported), ok, "stack for supported cosmetics is byte-identical");
});

test("mountC2Avatar under opt-in: an unrenderable torso item → whole avatar C2, item VISIBLE, no R2 leak", async () => {
  await withR2OptIn(() => withDom(async (root) => {
    const cosmetics = c2CosmeticLayers({ torso: UNWIRED_TORSO }, resolve);
    const rp = await mountC2Avatar(root, NM, { layerClass: "avatar-layer", cosmetics, surface: "avatar" });
    assert.equal(rp, "c2");
    assert.ok(srcsOf(root).includes(UNWIRED_TORSO), "the paid item the student equipped is rendered");
    assert.ok(!hasR2(root), "no R2 layer in the forced C2 render");
    // C2 cosmetics carry no R2 wrapper transform and use the generic marker.
    const armorLayer = root.children.find((c) => c.src === UNWIRED_TORSO);
    assert.equal(armorLayer.style.transform, undefined);
    assert.equal(armorLayer.attrs["data-c2-layer"], "cosmetic");
  }));
});

test("the R2-supported items equipped WITH the armour also render — on C2, all together", async () => {
  await withR2OptIn(() => withDom(async (root) => {
    const cosmetics = c2CosmeticLayers({ torso: UNWIRED_TORSO, headwear: HAT, eyes: GLASSES }, resolve);
    const rp = await mountC2Avatar(root, NM, { layerClass: "avatar-layer", cosmetics, surface: "hub" });
    assert.equal(rp, "c2");
    for (const s of [UNWIRED_TORSO, HAT, GLASSES]) assert.ok(srcsOf(root).includes(s), s + " visible on C2");
    assert.ok(!hasR2(root));
  }));
});

test("no sticky state: un-equipping the unrenderable item restores the R2 render on the same root", async () => {
  await withR2OptIn(() => withDom(async (root) => {
    const withArmor = await mountC2Avatar(root, NM, { layerClass: "avatar-layer", cosmetics: c2CosmeticLayers({ torso: UNWIRED_TORSO }, resolve) });
    assert.equal(withArmor, "c2");
    const without = await mountC2Avatar(root, NM, { layerClass: "avatar-layer", cosmetics: c2CosmeticLayers({ headwear: HAT }, resolve) });
    assert.equal(without, "r2", "R2 returns as soon as no unrenderable item is equipped");
    assert.ok(hasR2(root));
    assert.ok(srcsOf(root).includes(HAT));
    assert.ok(!srcsOf(root).includes(UNWIRED_TORSO), "the removed cosmetic is gone from the DOM");
  }));
});

test("observability: the fallback reports the DISTINCT reason, not identity_ineligible", async () => {
  const events = await withEvents(async () => {
    await withR2OptIn(() => withDom(async (root) => {
      const cosmetics = c2CosmeticLayers({ torso: UNWIRED_TORSO }, resolve);
      await mountC2Avatar(root, NM, { layerClass: "quiz-avatar-layer", cosmetics, surface: "quiz" });
    }));
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].level, "info", "a designed fallback is never a warning/error");
  assert.deepEqual(events[0].payload, {
    event: "avatar_r2_render", version: 1, surface: "quiz",
    result: "c2_fallback", reason: "unsupported_cosmetic_equipped",
  });
});

test("observability: an explicit forceC2 caller (shop) still reports forced_c2, not the new reason", async () => {
  const events = await withEvents(async () => {
    await withR2OptIn(() => withDom(async (root) => {
      const cosmetics = c2CosmeticLayers({ torso: UNWIRED_TORSO }, resolve);
      const rp = await mountC2Avatar(root, NM, { layerClass: "preview-layer", cosmetics, forceC2: true, surface: "avatar" });
      assert.equal(rp, "c2");
    }));
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].payload.reason, "forced_c2");
});

test("an ineligible identity with an unrenderable item still reports the equipped-item reason (checked first)", async () => {
  await withR2OptIn(() => withDom(async (root) => {
    // dark skin has no R2 base (R2 eligibility is neutral × medium) → the stack would be refused anyway.
    const ineligible = { ...NM, skin_tone: "dark" };
    const rp = await mountC2Avatar(root, ineligible, { layerClass: "avatar-layer", cosmetics: c2CosmeticLayers({ torso: UNWIRED_TORSO }, resolve) });
    assert.equal(rp, "c2");
    assert.ok(srcsOf(root).includes(UNWIRED_TORSO), "the item renders regardless of which check refused R2");
  }));
});

test("fail-soft: junk cosmetics never force C2 and never throw", async () => {
  await withR2OptIn(() => withDom(async (root) => {
    for (const junk of [undefined, null, [], [null], [{ slot: "torso" }]]) {
      let rp;
      await assert.doesNotReject(async () => { rp = await mountC2Avatar(root, NM, { layerClass: "avatar-layer", cosmetics: junk }); });
      assert.equal(rp, "r2", "an unrenderable junk entry must not drop a healthy R2 avatar to C2");
    }
  }));
});

test("C2 default (no opt-in) is unchanged: torso items render, no R2, no observability event", async () => {
  const events = await withEvents(async () => {
    await withDom(async (root) => {
      // BOTH torso items: the wired one must not sneak an R2 layer into a browser that never opted
      // in, and the unwired one must render exactly as it always did.
      for (const item of [UNWIRED_TORSO, ARMOR]) {
        const rp = await mountC2Avatar(root, NM, { layerClass: "avatar-layer", cosmetics: c2CosmeticLayers({ torso: item }, resolve), surface: "quiz" });
        assert.equal(rp, "c2");
        assert.ok(srcsOf(root).includes(item), item);
        assert.ok(!hasR2(root), "no R2 asset may appear without the opt-in");
      }
    });
  });
  assert.equal(events.length, 0, "a non-opted-in browser stays completely silent");
});
