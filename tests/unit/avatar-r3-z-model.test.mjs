// D-135 — the R3 z-model and the R3/R2/C2 coexistence contract.
//
// This is CONTRACT coverage. D-135 creates no runtime constant, no resolver and no compositor
// wiring, so nothing here may assert that R3_STACK_Z, R3_COSMETIC_Z or a three-way stack
// selection already exist — the tests below check what the contract REQUIRES of them, and one
// test asserts they are still absent so a reader cannot mistake the contract for the wiring.
//
// Two things are easy to get wrong later and are guarded structurally:
//   1. uniqueness. The rule is NOT that every layer has a unique z. Independently sorted LOGICAL
//      SLOTS must not collide, while approved sublayers of one slot may share a z with a binding
//      DOM order. A blanket-uniqueness test would fail the approved eyes tie, so it is not written.
//   2. cross-stack overlap. The same number may appear in the R3, R2 and C2 maps. That is
//      permitted, not a defect, because the three stacks never share a DOM.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const C = JSON.parse(readFileSync(join(REPO, "tools", "avatar", "fixtures", "r3", "r3-shadow-contract-v1.json"), "utf8"));
const Z = C.zModel;
const REGISTER = readFileSync(join(REPO, "docs", "project-state.md"), "utf8");
const zOf = (slot) => {
  const s = Z.slots.find((x) => x.slot === slot);
  assert.ok(s, "missing slot " + slot);
  return s.z;
};

test("the z-model is D-135's and is contract only", () => {
  assert.equal(Z.decision, "D-135");
  assert.equal(Z.adoptedOn, "2026-09-10");
  assert.match(Z.status, /CONTRACT ONLY/);
  assert.match(Z.status, /NO RUNTIME CONSTANT, RESOLVER, COMPOSITOR OR MANIFEST WIRING IS CREATED/);
  assert.match(Z.authorisation, /authorises no image request and creates or consumes no claim/);
});

test("every pinned z is exactly the approved value", () => {
  const approved = {
    aura: -30, back: -20, base: 0, blush: 2, face: 3, eyes: 4, blink: 5,
    eyesCosmetic: 6, faceCosmetic: 8, tee: 10, trousers: 11, shoes: 12,
    torso: 20, hair: 40, headwear: 45,
  };
  for (const [slot, z] of Object.entries(approved)) assert.equal(zOf(slot), z, `${slot} must be pinned to ${z}`);
  assert.equal(Z.slots.length, Object.keys(approved).length, "no extra or missing logical slot");
  const fc = Z.slots.find((x) => x.slot === "faceCosmetic");
  assert.equal(fc.perItemOverrides["panda-mask"], 41, "the panda override is part of the approved map");
});

test("the binding relative order holds, and the clothing order is intentional", () => {
  const order = ["base", "tee", "trousers", "shoes", "torso", "hair", "headwear"];
  for (let i = 0; i < order.length - 1; i++)
    assert.ok(zOf(order[i]) < zOf(order[i + 1]), `${order[i]} must paint below ${order[i + 1]}`);
  assert.equal(Z.paintOrder.bindingBoundaryOrder, "base < tee < trousers < shoes < torso < hair < headwear");
  const c = Z.paintOrder.consequences.join(" | ");
  assert.match(c, /trousers paint over the tee/i);
  assert.match(c, /shoes paint over the trousers/i);
  assert.match(c, /torso garment or equipment asset may paint over all three default clothing layers/i);
  assert.match(Z.paintOrder.intentional, /deliberate, not incidental/i);
  // the head stack keeps its existing relative sense too
  assert.ok(zOf("eyes") > zOf("face"), "eyes above the expression");
  assert.ok(zOf("blink") > zOf("eyes"), "the blink lids above the eyes");
  assert.ok(zOf("eyesCosmetic") > zOf("blink"), "glasses above the lids");
  assert.ok(zOf("eyesCosmetic") < zOf("hair"), "glasses below the hair, so the fringe covers the rim");
  assert.ok(zOf("headwear") > zOf("hair"), "headwear above the hair");
});

test("independently sorted logical slots have no unintended z collision", () => {
  const zs = Z.slots.map((s) => s.z);
  assert.equal(new Set(zs).size, zs.length, "two logical slots may not share a z");
  // a per-item override is an alternative value for ONE slot, so it must not clash either
  for (const s of Z.slots) {
    for (const [item, z] of Object.entries(s.perItemOverrides ?? {})) {
      const clash = Z.slots.find((o) => o.slot !== s.slot && o.z === z);
      assert.ok(!clash, `${s.slot} override ${item} at ${z} clashes with ${clash?.slot}`);
    }
  }
  assert.match(Z.uniqueness.rule, /INDEPENDENTLY SORTED LOGICAL SLOTS/);
  assert.match(Z.uniqueness.rule, /Approved internal SUBLAYERS of one logical slot MAY share a z/);
});

test("blanket uniqueness is explicitly rejected, because the eyes tie is approved", () => {
  assert.match(Z.uniqueness.notBlanketUniqueness, /NOT a claim that every raster layer has a unique z/i);
  assert.match(Z.uniqueness.notBlanketUniqueness, /must not be written/i);
  assert.match(Z.uniqueness.perItemOverridesAreNotTies, /not a tie/i);
});

test("the approved eyes tie at z=4 pins both its sublayers and their DOM order", () => {
  assert.equal(Z.approvedTies.length, 1, "exactly one tie is approved");
  const tie = Z.approvedTies[0];
  assert.equal(tie.slot, "eyes");
  assert.equal(tie.z, 4);
  assert.equal(tie.z, zOf("eyes"), "the tie must sit on the eyes slot's own z");
  assert.deepEqual(tie.sublayers, ["iris", "eyes-fixed"]);
  assert.match(tie.domOrder, /iris is inserted FIRST/);
  assert.match(tie.domOrder, /eyes-fixed SECOND/);
  assert.equal(tie.binding, true);
  assert.match(tie.why, /DOM order decides/i);
  assert.match(tie.why, /fixed highlight must paint on top/i);
});

test("the face slot at z=3 is one logical slot, verified against the engine", () => {
  const f = Z.faceSlotSemantics;
  assert.match(f.verified, /Verified read-only/i);
  assert.match(f.verified, /avatar-expression-engine\.js/);
  assert.match(f.finding, /does NOT create an overlay/i);
  assert.match(f.finding, /_ownsOverlay = false/);
  assert.match(f.finding, /only on the C2\/SVG path/i);
  assert.match(f.conclusion, /OPERATIVE REPRESENTATION OF THE SAME LOGICAL FACE SLOT/i);
  assert.match(f.conclusion, /not a second element at z=3/i);
  assert.match(f.requirement, /must be fixed explicitly by a new decision/i);
  // no second face-ish slot may have crept into the map at 3
  assert.equal(Z.slots.filter((s) => s.z === 3).length, 1, "z=3 belongs to exactly one logical slot");
});

test("R3's maps are independent and may not be imported or derived from R2/C2", () => {
  assert.match(Z.independence.rule, /R3_STACK_Z, R3_COSMETIC_Z/);
  assert.match(Z.independence.rule, /must not import, alias or dynamically derive/i);
  assert.match(Z.independence.rule, /R2_STACK_Z, R2_COSMETIC_Z or C2_LAYER_Z/);
  assert.match(Z.independence.sameNumberIsNotInheritance, /INDEPENDENTLY PINNED/);
  assert.match(Z.independence.sameNumberIsNotInheritance, /not inherited/i);
  assert.match(Z.independence.notCreatedHere, /does not create the constants/i);
  // the contract must never describe an R3 value as inherited
  assert.ok(!/inherited/i.test(JSON.stringify(Z.slots)), "no slot may be described as inherited");
});

test("cross-stack numeric overlap is permitted and must not be treated as a defect", () => {
  const x = Z.crossStackOverlap;
  assert.equal(x.permitted, true);
  assert.match(x.rule, /NOT an error and must not be tested as one/i);
  assert.match(x.why, /never mounted as independent avatar stacks at the same time/i);
  assert.match(x.correctionOfAnEarlierNote, /That framing was wrong/i);
  assert.match(x.correctionOfAnEarlierNote, /INSIDE R3's own map/);
  // the R3 numbers that also exist in the live R2 map are fine, and the contract says so
  assert.equal(zOf("eyesCosmetic"), 6, "R3 pins 6 independently, as R2 also uses 6");
  assert.equal(zOf("faceCosmetic"), 8, "R3 pins 8 independently, as R2 also uses 8");
});

test("stack selection is atomic, complete-or-null, and never mixes geometry-bound layers", () => {
  const s = Z.stackSelection;
  assert.match(s.semantics, /completeR3Layers \?\? completeR2Layers \?\? composeC2Layers/);
  assert.match(s.isSemanticsNotSyntax, /concrete later syntax may differ/i);
  assert.match(s.resolverContract, /complete, validated R3 layer list OR null/i);
  assert.match(s.resolverContract, /never return an empty or partial list as success/i);
  assert.match(s.noMixing, /No geometry-bound R2 and R3 layers may be mixed/i);
  assert.match(s.noMixing, /WHOLE avatar stack falls back to R2, and then to C2/i);
  assert.match(s.atomicity, /one stack is mounted, never a blend of two/i);
  assert.match(s.doesNotWidenReuse, /does not widen which existing cosmetics or assets are approved for reuse/i);
});

test("D-134 still governs the z order", () => {
  assert.match(Z.d134StillApplies.rule, /NEVER overrides D-134/i);
  assert.match(Z.d134StillApplies.rule, /R3_ARM_HAND_PROTECT\(asset\)/);
  assert.match(Z.d134StillApplies.explicit, /may not be used to bypass/i);
  assert.match(Z.d134StillApplies.explicit, /intentional-coverage decision/i);
  // and the D-134 contract itself is untouched by D-135
  assert.equal(C.armHandOcclusionContract.decision, "D-134");
  assert.deepEqual(C.armHandOcclusionContract.regions.R3_INTENTIONAL_ARM_HAND_COVERAGE.approvedNonEmptyRegions, []);
});

test("the external expression and blink surfaces are a requirement, not an implementation", () => {
  assert.match(Z.externalSurfaces.requirement, /stack that was ACTUALLY mounted/i);
  assert.match(Z.externalSurfaces.requirement, /never leaves a stale overlay/i);
  assert.match(Z.externalSurfaces.notImplementedHere, /does not implement it/i);
});

test("nothing is wired yet: no R3 constants and no three-way selection exist in the code", () => {
  const layers = readFileSync(join(REPO, "js", "avatar-layers.js"), "utf8");
  const render = readFileSync(join(REPO, "js", "avatar-render-c2.js"), "utf8");
  for (const name of ["R3_STACK_Z", "R3_COSMETIC_Z", "composeR3Layers", "r3Layers"])
    assert.ok(!layers.includes(name) && !render.includes(name), `${name} must not exist yet — D-135 is contract only`);
  // the live selection is still the two-way one, unchanged by this decision
  assert.match(render, /const layers = r2Layers \|\| composeC2Layers\(identity, cosmetics\);/);
  assert.equal(C.layerContract.zIndices.decision, "D-135");
  assert.match(C.layerContract.zIndices.status, /APPROVED by D-135/);
});

test("the two decisions moved from open to closed, leaving exactly three open", () => {
  const closed = C.closedOwnerDecisions.filter((d) => d.decision === "D-135");
  assert.equal(closed.length, 2, "D-135 closes exactly two decisions");
  const wasJoined = closed.map((d) => d.was).join(" | ");
  assert.match(wasJoined, /final z-index values for the three new clothing slots/i);
  assert.match(wasJoined, /coexist with the current R2\/C2 cosmetic stack/i);

  const open = C.openOwnerDecisions;
  assert.equal(open.length, 3, "exactly three owner decisions may remain open");
  const joined = open.join(" | ");
  assert.match(joined, /whether blush is part of the first slice/i);
  assert.match(joined, /whether the iris is a colour token/i);
  assert.match(joined, /VALID_HAIRSTYLES/);
  assert.ok(!/z-index values|cosmetic stack/i.test(joined), "a closed decision may not still be listed as open");
  assert.equal(C.closedOwnerDecisions.length, 5, "two gaps, the occlusion contract and these two");
});

test("D-135 is append-only and rewrites nothing before it", () => {
  const rows = REGISTER.split("\n").filter((l) => l.startsWith("| **D-135** |"));
  assert.equal(rows.length, 1, "D-135 must appear exactly once");
  for (const d of ["D-132", "D-133", "D-134"])
    assert.equal(REGISTER.split("\n").filter((l) => l.startsWith("| **" + d + "** |")).length, 1, d + " must appear exactly once");
  const row = rows[0];
  assert.match(row, /D-120 through D-134 are not rewritten/);
  assert.match(row, /no image request or claim is authorised/i);
  assert.match(row, /tee 10/);
  assert.match(row, /trousers 11/);
  assert.match(row, /shoes 12/);
  assert.match(row, /blanket-uniqueness test would be wrong/i);
  assert.match(row, /completeR3Layers \?\? completeR2Layers \?\? composeC2Layers/);
  assert.match(row, /overrides the arm\/hand occlusion contract/i);   // the row bolds "never"
});
