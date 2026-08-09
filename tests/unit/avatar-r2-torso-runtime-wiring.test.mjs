// ── D-090 (A3.2): the accepted Ridderdragt wired into the R2 runtime ─────────────────────────
// A3.1 put the artwork in git. This is the step that makes an opted-in student actually SEE it on
// the R2 figure, and the risk it carries is the mirror image of D-082: instead of an item silently
// missing, a wrong wiring could show an R2 avatar wearing nothing, or leak a half-R2/half-C2 stack.
//
// The load-bearing cases here are therefore the negative ones — a torso item WITHOUT R2 artwork, and
// a torso asset that fails to load — because those are the paths where a paid item can disappear.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  AVATAR_R2, R2_MANIFEST, R2_SUPPORTED_COSMETIC_SLOTS, R2_COSMETIC_Z, R2_STACK_Z,
  R2_ITEM_ASSET_SLOTS, r2SlotNeedsItemAsset, r2ItemAssetSrcFor, r2CosmeticRenderable,
  r2UnrenderableCosmeticSlots, r2RequiresC2Fallback, torsoSrcForR2, isR2SupportedCosmeticSlot,
} from "../../js/avatar-layers.js";
import { mountC2Avatar, composeR2Layers, c2CosmeticLayers } from "../../js/avatar-render-c2.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const ASSET_REL = "/assets/avatar-r2/torso/armor-knight-r2-v1.webp";
const ARMOR = "/assets/avatar/shirt/armor-knight.svg";
const UNWIRED = "/assets/avatar/shirt/future-robe.svg";
const HAT = "/assets/avatar/hat/crown-golden.svg";
const GLASSES = "/assets/avatar/glasses/glasses-round-basic-v1.svg";
const NM = { v: 1, body_type: "neutral", skin_tone: "medium", hairstyle: "tousled", hair_color: "brown" };
const resolve = (x) => x;

function el() {
  return {
    children: [], parentNode: null, className: "", src: "", alt: "", innerHTML: "",
    attrs: {}, style: { setProperty(k, v) { this[k] = v; } },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    removeAttribute(k) { delete this.attrs[k]; },
    appendChild(c) { c.parentNode = this; this.children.push(c); },
    remove() {
      const p = this.parentNode; if (!p) return;
      const i = p.children.indexOf(this); if (i !== -1) p.children.splice(i, 1);
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
async function withR2OptIn(fn) {
  globalThis.localStorage = { getItem: (k) => (k === "avatar_r2" ? "1" : null) };
  try { return await fn(); } finally { delete globalThis.localStorage; }
}
async function withEvents(fn) {
  const events = [];
  const oi = console.info, ow = console.warn, oe = console.error;
  const cap = (level) => (...a) => { if (String(a[0]).includes("[avatar-r2-observability]")) events.push({ level, payload: a[1] }); };
  console.info = cap("info"); console.warn = cap("warn"); console.error = cap("error");
  try { await fn(events); } finally { console.info = oi; console.warn = ow; console.error = oe; }
  return events;
}
const srcsOf = (root) => root.children.map((c) => c.src).filter(Boolean);
const hasR2 = (root) => srcsOf(root).some((s) => s.includes("avatar-r2/"));

// ── manifest + resolver ──────────────────────────────────────────────────────────────────────

test("the garment is registered on the SAME catalog item id, per render path", () => {
  assert.equal(R2_MANIFEST.torso["armor-knight"], 1);
  assert.equal(R2_MANIFEST.version, 5, "a registration change must bump the manifest version");
  assert.equal(torsoSrcForR2("armor-knight"), ASSET_REL);
  // The C2 path is untouched: nothing here rewrites or replaces the SVG the C2 render uses.
  assert.ok(existsSync(join(REPO, "assets", "avatar", "shirt", "armor-knight.svg")));
  assert.ok(existsSync(join(REPO, "assets", "avatar-r2", "torso", "armor-knight-r2-v1.webp")));
});

test("the resolved path is derived from the manifest version, not hardcoded", () => {
  // If the version were ignored, a promoted v2 would ship while the runtime still asked for v1.
  const original = R2_MANIFEST.torso["armor-knight"];
  try {
    R2_MANIFEST.torso["armor-knight"] = 2;
    assert.equal(torsoSrcForR2("armor-knight"), "/assets/avatar-r2/torso/armor-knight-r2-v2.webp");
  } finally {
    R2_MANIFEST.torso["armor-knight"] = original;
  }
  assert.equal(torsoSrcForR2("armor-knight"), ASSET_REL, "restored");
});

test("an unregistered torso item resolves to null, and junk never throws", () => {
  assert.equal(torsoSrcForR2("future-robe"), null);
  for (const junk of [null, undefined, "", 0, {}, []]) {
    assert.equal(torsoSrcForR2(junk), null, JSON.stringify(junk));
  }
});

test("armor-knight is the ONLY R2-supported torso item today", () => {
  assert.deepEqual(Object.keys(R2_MANIFEST.torso), ["armor-knight"]);
});

// ── per-item gating: the mechanism that keeps future items safe ──────────────────────────────

test("torso is the one slot gated per ITEM rather than per slot", () => {
  assert.deepEqual(R2_ITEM_ASSET_SLOTS, ["torso"]);
  assert.equal(r2SlotNeedsItemAsset("torso"), true);
  for (const s of ["aura", "back", "headwear", "eyes", "face"]) {
    assert.equal(r2SlotNeedsItemAsset(s), false, s);
    // the re-seated slots keep using the C2 asset — no item asset is looked up for them
    assert.equal(r2ItemAssetSrcFor(s, HAT), null, s);
  }
});

test("torso is in the supported slot list, but support is decided per item", () => {
  assert.ok(R2_SUPPORTED_COSMETIC_SLOTS.includes("torso"));
  assert.equal(isR2SupportedCosmeticSlot("torso"), true);
  assert.equal(r2CosmeticRenderable({ slot: "torso", src: ARMOR, z: 20 }), true);
  assert.equal(r2CosmeticRenderable({ slot: "torso", src: UNWIRED, z: 20 }), false,
    "a torso item without R2 artwork is NOT renderable just because the slot is listed");
});

test("r2CosmeticRenderable rejects what neither path could render", () => {
  for (const bad of [null, undefined, {}, { slot: "torso" }, { slot: "torso", src: ARMOR }, { slot: "torso", src: "", z: 2 }, { slot: "torso", src: ARMOR, z: "2" }]) {
    assert.equal(r2CosmeticRenderable(bad), false, JSON.stringify(bad));
  }
});

test("an unwired torso item still forces the whole avatar to C2 (D-083 intact)", () => {
  assert.deepEqual(r2UnrenderableCosmeticSlots([{ slot: "torso", src: UNWIRED, z: 20 }]), ["torso"]);
  assert.equal(r2RequiresC2Fallback([{ slot: "torso", src: UNWIRED, z: 20 }]), true);
  assert.equal(r2RequiresC2Fallback([{ slot: "torso", src: ARMOR, z: 20 }]), false);
});

// ── composition ──────────────────────────────────────────────────────────────────────────────

test("composeR2Layers puts the R2 artwork on the stack — not the C2 SVG", () => {
  const layers = composeR2Layers(NM, c2CosmeticLayers({ torso: ARMOR }, resolve));
  assert.ok(Array.isArray(layers), "the armour no longer refuses the R2 stack");
  const torso = layers.find((l) => l.marker === "torso-cosmetic");
  assert.ok(torso, "a torso layer is present");
  assert.equal(torso.src, ASSET_REL);
  assert.ok(!layers.some((l) => l.src === ARMOR), "the C2 SVG must never appear on the R2 stack");
  assert.equal(torso.transform, undefined, "the raster is authored on the R2 canvas — no re-seating");
});

test("the garment sits above the base and below every face layer and the hair", () => {
  assert.equal(R2_COSMETIC_Z.torso, 1);
  assert.ok(R2_COSMETIC_Z.torso > R2_STACK_Z.base, "above the base it replaces");
  assert.ok(R2_COSMETIC_Z.torso < R2_STACK_Z.blush);
  assert.ok(R2_COSMETIC_Z.torso < R2_STACK_Z.hair, "D-084 §5: below the hair");
  assert.ok(R2_COSMETIC_Z.torso < R2_COSMETIC_Z.headwear);
  const layers = composeR2Layers(NM, c2CosmeticLayers({ torso: ARMOR }, resolve));
  const z = Object.fromEntries(layers.map((l) => [l.marker || "base", l.z]));
  assert.ok(z["torso-cosmetic"] > z.base && z["torso-cosmetic"] < z["hair-r2"]);
});

test("the armour composes together with the other supported cosmetics", () => {
  const layers = composeR2Layers(NM, c2CosmeticLayers({ torso: ARMOR, headwear: HAT, eyes: GLASSES }, resolve));
  assert.ok(Array.isArray(layers));
  const markers = layers.map((l) => l.marker);
  for (const m of ["torso-cosmetic", "headwear", "eyes-cosmetic"]) assert.ok(markers.includes(m), m);
});

test("one unwired torso item refuses the stack even next to the wired one", () => {
  const mixed = [
    { slot: "torso", src: ARMOR, z: 20 },
    { slot: "torso", src: UNWIRED, z: 20 },
  ];
  assert.equal(composeR2Layers(NM, mixed), null, "no partial stack: the whole avatar goes to C2");
});

// ── the atomic contract: a failed garment must not vanish quietly ─────────────────────────────

test("the torso garment is a MANDATORY layer, so a load failure drops the WHOLE stack", () => {
  // This is the difference between D-090 and the D-082 defect. Every other cosmetic is optional
  // (its asset is the same file C2 uses); this one exists only on the R2 path, so if it fails the
  // complete C2 avatar — armour included — must render instead of an R2 figure without it.
  const src = readFileSync(join(REPO, "js", "avatar-render-c2.js"), "utf8");
  const set = src.match(/_R2_MANDATORY_MARKERS = new Set\(\[([^\]]*)\]\)/);
  assert.ok(set, "mandatory marker set not found");
  assert.ok(/["']torso-cosmetic["']/.test(set[1]), "torso-cosmetic must be mandatory");
  for (const optional of ["aura", "back"]) {
    assert.ok(!new RegExp(`["']${optional}["']`).test(set[1]), `${optional} must stay optional`);
  }
});

test("mountC2Avatar: opted in, the armour renders on the R2 stack with no C2 leak", async () => {
  await withR2OptIn(() => withDom(async (root) => {
    const rp = await mountC2Avatar(root, NM, { layerClass: "avatar-layer", cosmetics: c2CosmeticLayers({ torso: ARMOR }, resolve), surface: "avatar" });
    assert.equal(rp, "r2");
    assert.ok(srcsOf(root).includes(ASSET_REL), "the R2 garment is mounted");
    assert.ok(!srcsOf(root).includes(ARMOR), "the C2 SVG must not leak into the R2 render");
    assert.ok(hasR2(root));
  }));
});

test("mountC2Avatar: an unwired torso item still yields whole-avatar C2 with the item visible", async () => {
  await withR2OptIn(() => withDom(async (root) => {
    const rp = await mountC2Avatar(root, NM, { layerClass: "avatar-layer", cosmetics: c2CosmeticLayers({ torso: UNWIRED }, resolve), surface: "hub" });
    assert.equal(rp, "c2");
    assert.ok(srcsOf(root).includes(UNWIRED), "the student still sees what they bought");
    assert.ok(!hasR2(root), "no partial R2");
  }));
});

test("unequipping the armour leaves a clean R2 render behind", async () => {
  await withR2OptIn(() => withDom(async (root) => {
    const withArmour = await mountC2Avatar(root, NM, { layerClass: "avatar-layer", cosmetics: c2CosmeticLayers({ torso: ARMOR }, resolve) });
    assert.equal(withArmour, "r2");
    const without = await mountC2Avatar(root, NM, { layerClass: "avatar-layer", cosmetics: [] });
    assert.equal(without, "r2");
    assert.ok(!srcsOf(root).includes(ASSET_REL), "the garment is gone from the DOM, no sticky layer");
    assert.ok(hasR2(root), "the figure still renders on R2");
  }));
});

test("every surface behaves the same — the wiring is not per page", async () => {
  for (const surface of ["avatar", "hub", "quiz"]) {
    await withR2OptIn(() => withDom(async (root) => {
      const rp = await mountC2Avatar(root, NM, { layerClass: "avatar-layer", cosmetics: c2CosmeticLayers({ torso: ARMOR }, resolve), surface });
      assert.equal(rp, "r2", surface);
      assert.ok(srcsOf(root).includes(ASSET_REL), surface);
    }));
  }
});

// ── observability ────────────────────────────────────────────────────────────────────────────

test("a rendering armour emits no fallback event at all", async () => {
  const events = await withEvents(async () => {
    await withR2OptIn(() => withDom(async (root) => {
      const rp = await mountC2Avatar(root, NM, { layerClass: "avatar-layer", cosmetics: c2CosmeticLayers({ torso: ARMOR }, resolve), surface: "quiz" });
      assert.equal(rp, "r2");
    }));
  });
  const fallbacks = events.filter((e) => e.payload && e.payload.result === "c2_fallback");
  assert.equal(fallbacks.length, 0, "unsupported_cosmetic_equipped must not be reported for a wired item");
});

test("an unwired torso item still reports the distinct unsupported reason", async () => {
  const events = await withEvents(async () => {
    await withR2OptIn(() => withDom(async (root) => {
      await mountC2Avatar(root, NM, { layerClass: "avatar-layer", cosmetics: c2CosmeticLayers({ torso: UNWIRED }, resolve), surface: "quiz" });
    }));
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].payload.reason, "unsupported_cosmetic_equipped");
  assert.equal(events[0].payload.result, "c2_fallback");
});

test("forceC2 still takes precedence over everything (the shop path)", async () => {
  const events = await withEvents(async () => {
    await withR2OptIn(() => withDom(async (root) => {
      // surface "avatar": the emitter only recognises the three avatar surfaces, so the shop's own
      // previews never emit at all. The point being proven is the PRECEDENCE of forceC2.
      const rp = await mountC2Avatar(root, NM, { layerClass: "preview-layer", cosmetics: c2CosmeticLayers({ torso: ARMOR }, resolve), surface: "avatar", forceC2: true });
      assert.equal(rp, "c2");
      assert.ok(!hasR2(root), "D-077: a forceC2 caller stays C2 even now that the armour could render");
    }));
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].payload.reason, "forced_c2");
});

test("the observability vocabulary is unchanged — no new reason was needed", async () => {
  const obs = readFileSync(join(REPO, "js", "avatar-r2-observability.js"), "utf8");
  const m = obs.match(/_REASONS\s*=\s*\[([^\]]*)\]/);
  assert.ok(m);
  assert.deepEqual(
    m[1].split(",").map((s) => s.trim().replace(/["']/g, "")).filter(Boolean),
    ["unknown", "required_asset_failed", "identity_ineligible", "forced_c2", "unsupported_cosmetic_equipped", "render_exception"],
    "a missing/corrupt garment reuses required_asset_failed; the event schema is untouched",
  );
  assert.match(obs, /version: 1/, "the event version must not drift for a wiring change");
});

// ── boundaries ───────────────────────────────────────────────────────────────────────────────

// D-101: R2 is the default, so "no R2 and no events" is now what an OPTED-OUT browser gets.
// The observability event stays gated on the explicit pilot opt-in ("1"), so an opted-out
// browser must still be completely silent.
test("opted out (\"0\") means no R2 and no events, armour or not", async () => {
  const saved = globalThis.localStorage;
  globalThis.localStorage = { getItem: (k) => (k === "avatar_r2" ? "0" : null) };
  try {
    const events = await withEvents(async () => {
      await withDom(async (root) => {
        const rp = await mountC2Avatar(root, NM, { layerClass: "avatar-layer", cosmetics: c2CosmeticLayers({ torso: ARMOR }, resolve), surface: "quiz" });
        assert.equal(rp, "c2");
        assert.ok(srcsOf(root).includes(ARMOR));
        assert.ok(!hasR2(root));
      });
    });
    assert.equal(events.length, 0);
  } finally {
    if (saved === undefined) delete globalThis.localStorage; else globalThis.localStorage = saved;
  }
});

test("this wires a slot; the render path is activated separately (D-101)", () => {
  assert.equal(AVATAR_R2, true);
});

test("the shop preview contract is untouched by this change", () => {
  const shop = readFileSync(join(REPO, "shop.html"), "utf8");
  assert.match(shop, /forceC2:/, "shop previews still pass forceC2 (D-077)");
  assert.ok(!shop.includes("armor-knight-r2"), "the shop must not reach for the R2 asset");
});

test("purchase, ownership and equipped_slots are untouched", () => {
  // The wiring reads what is equipped; it must never write it, and it introduces no new item id.
  for (const f of ["avatar-layers.js", "avatar-render-c2.js"]) {
    // Comments stripped: naming the catalog row in a comment is documentation, not a dependency.
    const code = readFileSync(join(REPO, "js", f), "utf8").replace(/\/\/.*$/gm, "");
    for (const forbidden of ["equipped_slots", "shop_items", "user_items", "coins", "buy-item"]) {
      assert.ok(!code.includes(forbidden), `${f} must not touch ${forbidden}`);
    }
  }
});
