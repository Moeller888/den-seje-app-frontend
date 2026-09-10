// D-138 — blush and the first slice.
//
// Contract coverage. D-138 produces no blush, chooses no method and authorises nothing, so
// nothing here may assert that a blush asset or a production path exists.
//
// The two things most easily lost later are guarded structurally rather than by prose:
//   1. the blush-free first slice must never be mistaken for the product. It is not
//      completeR3Layers, not resolver-selectable, and not for canary, deploy or promotion.
//   2. the production order must actually place blush AFTER the first-slice gate. The order
//      previously had blush at step 6, inside what step 12 called the "complete default
//      composition" — the exact contradiction this decision removes — so the ordering is
//      recomputed from the ids here, not read from prose.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const C = JSON.parse(readFileSync(join(REPO, "tools", "avatar", "fixtures", "r3", "r3-shadow-contract-v1.json"), "utf8"));
const B = C.blushContract;
const REGISTER = readFileSync(join(REPO, "docs", "project-state.md"), "utf8");
const stepOf = (id) => {
  const i = C.productionOrderIds.indexOf(id);
  assert.ok(i >= 0, "missing production step " + id);
  return i;
};
const d138Row = () => {
  const rows = REGISTER.split("\n").filter((l) => l.startsWith("| **D-138** |"));
  assert.equal(rows.length, 1, "D-138 must appear exactly once");
  return rows[0];
};

test("the blush contract is D-138's and produces, chooses and authorises nothing", () => {
  assert.equal(B.decision, "D-138");
  assert.equal(B.adoptedOn, "2026-09-10");
  assert.match(B.status, /CONTRACT ONLY/);
  assert.match(B.status, /NO BLUSH PRODUCED/);
  assert.match(B.status, /NO METHOD CHOSEN/);
  assert.match(B.status, /NO IMAGE REQUEST OR CLAIM AUTHORISED/);
  assert.match(B.prohibitions.noAssetProduced, /produces no blush asset/i);
  assert.match(B.prohibitions.noMethodChosen, /chooses no production method/i);
  assert.match(B.prohibitions.noImageRequestOrClaim, /authorises no image request/i);
});

test("blush is out of the first slice, and the layer list agrees", () => {
  assert.match(B.firstSliceMembership.decision, /NOT part of the first slice/i);
  assert.match(B.firstSliceMembership.why, /different failure class/i);
  assert.match(B.firstSliceMembership.why, /blend mode/i);
  assert.ok(!C.firstSlice.layers.some((l) => /blush/i.test(l)), "no first-slice layer may be blush");
  assert.match(C.firstSlice.excluded.blush, /settled by D-138/i);
  assert.match(C.firstSlice.excluded.blush, /MANDATORY layer of the finished complete stack at z=2/i);
});

test("the blush-free first slice may never be mistaken for the product", () => {
  const claims = B.firstSliceMembership.firstSliceIsDeliberatelyIncomplete.join(" | ");
  for (const re of [
    /NOT completeR3Layers/i,
    /may not be selected by the runtime resolver/i,
    /may not be used for canary, deploy or promotion/i,
    /may never be described as the final complete default composition/i,
  ]) assert.match(claims, re, "missing guard " + re);
  // and the firstSlice block itself must carry the same refusal, not only the decision block
  assert.match(C.firstSlice.isNotCompleteR3Layers, /NOT completeR3Layers/);
  assert.match(C.firstSlice.isNotCompleteR3Layers, /runtime resolver/i);
  assert.match(C.firstSlice.isNotCompleteR3Layers, /canary, deploy or promotion/i);
  assert.match(C.firstSlice.purpose, /ISOLATED STRUCTURAL PROOF/i);
  assert.match(C.firstSlice.purpose, /deliberately INCOMPLETE/i);
});

test("D-135 is untouched: blush stays mandatory at z=2 in the finished stack", () => {
  assert.match(B.blushStaysMandatory.rule, /D-135 stands unchanged/i);
  assert.match(B.blushStaysMandatory.rule, /MANDATORY layer of the finished complete R3 stack, at z=2/i);
  assert.match(B.blushStaysMandatory.notWeakened, /without blush is not complete/i);
  assert.match(B.prohibitions.noD135Change, /changes nothing in D-135/i);
  // the z model must still say so itself
  const slot = C.zModel.slots.find((s) => s.slot === "blush");
  assert.equal(slot.z, 2, "blush keeps z=2");
  assert.equal(slot.kind, "mandatory raster");
});

test("the production order puts blush AFTER the first-slice gate, computed from the ids", () => {
  assert.ok(stepOf("owner-visual-review") < stepOf("blush"),
    "blush must be produced only after the blush-free first slice is approved");
  assert.ok(stepOf("blush") < stepOf("default-composition"),
    "the complete default composition is the one that finally includes blush");
  assert.ok(stepOf("first-slice-composition") < stepOf("automatic-check"));
  assert.ok(stepOf("automatic-check") < stepOf("owner-visual-review"));
  assert.ok(stepOf("default-composition") < stepOf("integration-canary-rollback"),
    "only a genuinely complete stack may move towards integration");
  // the labels must not call the blush-free composition the complete one
  const first = C.productionOrder[stepOf("first-slice-composition")];
  assert.match(first, /blush-free first-slice composition/i);
  assert.ok(!/complete/i.test(first), "the first-slice step may not be labelled complete");
  assert.match(C.productionOrder[stepOf("default-composition")], /complete default composition/i);
  assert.match(C.productionOrder[stepOf("owner-visual-review")], /first-slice gate/i);
});

test("the three new dependencies are recorded, not merely implied by the order", () => {
  const has = (b, a) => C.productionOrderConstraints.some((k) => k.before === b && k.after === a);
  assert.ok(has("owner-visual-review", "blush"), "owner-visual-review -> blush must be an explicit constraint");
  assert.ok(has("blush", "default-composition"), "blush -> default-composition must be explicit");
  assert.ok(has("default-composition", "integration-canary-rollback"), "default-composition -> integration must be explicit");
  // and every constraint must still hold against the actual order
  for (const k of C.productionOrderConstraints) {
    assert.ok(stepOf(k.before) < stepOf(k.after), `the order violates ${k.before} -> ${k.after}`);
    assert.ok(k.why && k.why.length > 0, `${k.before} -> ${k.after} needs a reason`);
  }
  assert.equal(C.productionOrderIds.length, C.productionOrder.length);
  C.productionOrder.forEach((s, i) => assert.ok(s.startsWith(String(i + 1) + " "), "step " + (i + 1) + " is misnumbered"));
});

test("blush gets its own sequence after the gate, none of it authorised here", () => {
  const seq = B.sequenceAfterTheFirstSlice.order.join(" | ");
  assert.match(seq, /construction rule is investigated/i);
  assert.match(seq, /0 image calls/i);
  assert.match(seq, /ONE separately authorised image call and its own one-shot claim/i);
  assert.match(seq, /its own separate owner visual review/i);
  assert.match(seq, /only then may the default stack be called complete/i);
  assert.match(B.sequenceAfterTheFirstSlice.noneAuthorisedHere, /authorises none of those steps/i);
});

test("the expected cheek difference is diagnostic only, with nothing invented", () => {
  const e = B.expectedDifference;
  assert.match(e.rule, /blush-bearing cheek zone/i);
  assert.match(e.rule, /QUALITATIVE, DIAGNOSTIC/i);
  assert.match(e.machineCheckMay, /MAY report the difference/i);
  const may_not = e.machineCheckMayNot.join(" | ");
  for (const re of [
    /may not classify the expected missing blush as geometric or structural drift/i,
    /no pixel mask may be invented/i,
    /no fixed number of pixels may be ignored/i,
    /no new tolerance may be set/i,
    /no other facial difference may be exempted/i,
    /cannot|may not be claimed that the difference can be isolated exactly/i,
  ]) assert.match(may_not, re, "missing prohibition " + re);
  assert.equal(e.machineCheckMayNot.length, 6, "all six prohibitions must survive");
  assert.match(e.colourFidelityLater, /only on the later COMPLETE composition/i);
  assert.match(e.colourFidelityLater, /never on the first slice/i);
});

test("the method is deliberately not chosen, and the budget is unchanged at 15-16", () => {
  const a8 = C.assets.find((a) => a.id === 8);
  assert.equal(a8.name, "r3-blush-multiply");
  assert.equal(a8.method, "generated-or-constructed", "D-138 must not lock the method");
  assert.equal(a8.calls, "0-1", "D-138 must not lock the call count");
  assert.match(B.method.unchanged, /chooses no method/i);
  assert.match(B.method.whyNotChosen, /already states a RULE/i);
  assert.match(B.method.whyNotChosen, /documented and proven in advance/i);
  assert.match(B.method.budget, /15-16/);
  assert.match(B.method.authorisesNothing, /neither the construction, nor an image call, nor a claim/i);
  // and the derived budget must genuinely still be 15-16
  let min = 0, max = 0;
  for (const a of C.assets) {
    if (typeof a.calls === "number") { min += a.calls; max += a.calls; continue; }
    const m = /^(\d+)-(\d+)$/.exec(String(a.calls));
    assert.ok(m, a.name + " has an unreadable calls value");
    min += Number(m[1]); max += Number(m[2]);
  }
  assert.equal(min, 15);
  assert.equal(max, 16);
  assert.equal(C.imageCallBudget.minimum, 15);
  assert.equal(C.imageCallBudget.maximum, 16);
});

test("nothing is wired, and the existing blush behaviour is untouched", () => {
  const layers = readFileSync(join(REPO, "js", "avatar-layers.js"), "utf8");
  const render = readFileSync(join(REPO, "js", "avatar-render-c2.js"), "utf8");
  for (const name of ["R3_MANIFEST", "composeR3Layers", "blushSrcForR3"])
    assert.ok(!layers.includes(name) && !render.includes(name), `${name} must not exist yet — D-138 is contract only`);
  // R2's blush is unchanged: still a mandatory multiply layer
  assert.match(layers, /blush:\s*\{ "multiply": 1 \}/);
  assert.match(render, /marker: "blush"/);
  assert.match(render, /_R2_MANDATORY_MARKERS = new Set\(\["base", "blush"/);
  assert.match(B.prohibitions.noRuntimeChange, /changes no runtime, resolver, manifest, mask, golden, asset, deploy or Supabase/i);
});

test("blush was the last open decision: the contract now has zero", () => {
  const closed = C.closedOwnerDecisions.filter((d) => d.decision === "D-138");
  assert.equal(closed.length, 1, "D-138 closes exactly one decision");
  assert.match(closed[0].was, /whether blush is part of the first slice/i);
  assert.match(closed[0].resolution, /isolated structural proof/i);
  assert.match(closed[0].resolution, /never completeR3Layers/i);
  assert.deepEqual(C.openOwnerDecisions, [], "no owner decision may remain open");
  assert.equal(C.closedOwnerDecisions.length, 8, "two gaps, occlusion, z, coexistence, iris, hairstyles and blush");
  for (const d of C.closedOwnerDecisions) {
    assert.match(d.decision, /^D-13[3-8]$/, "each closure names the decision that made it");
    assert.ok(d.was && d.resolution, "each closure keeps the question and its answer");
  }
});

test("D-138 is append-only and rewrites nothing before it", () => {
  for (const d of ["D-132", "D-133", "D-134", "D-135", "D-136", "D-137", "D-138"])
    assert.equal(REGISTER.split("\n").filter((l) => l.startsWith("| **" + d + "** |")).length, 1, d + " must appear exactly once");
  const row = d138Row();
  assert.match(row, /D-120 through D-137 are not rewritten/);
  assert.match(row, /after D-138 there are ZERO/i);
  assert.match(row, /never `completeR3Layers`/);
  assert.match(row, /MANDATORY at z=2/);
  assert.match(row, /blush-free first-slice composition/);
  assert.match(row, /no image request or claim/i);
});
