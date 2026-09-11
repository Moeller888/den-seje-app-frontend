// D-136 — the R3 iris method.
//
// Contract coverage. D-136 produces no iris map and creates no runtime constant, so nothing here
// may assert that R3_IRIS_DEFAULT or a tint implementation already exists — one test asserts the
// opposite, so the contract cannot be mistaken for the wiring.
//
// Two things are easy to get wrong later and are guarded explicitly:
//   1. the token is NOT derivable from finished pixels. The displayed colour is a product of the
//      token AND the map's luminance, so no rendered pixel yields it. A future test that claims
//      to measure the token from a figure would be unsound.
//   2. R2's untinted fail-soft is NOT inherited. A grey iris is not the approved R3 appearance,
//      so missing tint support means the R3 stack is incomplete, not degraded.
//
// Deliberately absent: any assertion pinning the LIVE R2_IRIS_DEFAULT. R2's value is this
// decision's documented precedent, not its dependency — R3's pin must stand even if R2 changes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const C = JSON.parse(readFileSync(join(REPO, "tools", "avatar", "fixtures", "r3", "r3-shadow-contract-v1.json"), "utf8"));
const I = C.irisContract;
const REGISTER = readFileSync(join(REPO, "docs", "project-state.md"), "utf8");
const d136Row = () => {
  const rows = REGISTER.split("\n").filter((l) => l.startsWith("| **D-136** |"));
  assert.equal(rows.length, 1, "D-136 must appear exactly once");
  return rows[0];
};

test("the iris contract is D-136's and produces nothing", () => {
  assert.equal(I.decision, "D-136");
  assert.equal(I.adoptedOn, "2026-09-10");
  assert.match(I.status, /CONTRACT ONLY/);
  assert.match(I.status, /NO IRIS MAP PRODUCED/);
  assert.match(I.status, /NO RUNTIME CONSTANT CREATED/);
  assert.match(I.status, /NO IMAGE REQUEST AUTHORISED/);
});

test("the method is one achromatic luminance map times one token, and nothing else", () => {
  const m = I.method;
  assert.match(m.binding, /ACHROMATIC/);
  assert.match(m.binding, /greyscale\/luminance map/i);
  assert.match(m.binding, /independently pinned R3 colour token/i);
  assert.match(m.isOneAssetPlusOneToken, /One visual asset plus one deterministic design token/i);
  assert.match(m.notFullColour, /NOT a full-colour iris asset/i);
  assert.match(m.notProcedural, /NOT a procedurally drawn iris/i);
  assert.equal(m.assetMethod, "generated-luminance-map-plus-token");
});

test("asset 7 carries that method and exactly one planned call", () => {
  const a7 = C.assets.find((a) => a.id === 7);
  assert.ok(a7, "asset 7 must exist");
  assert.equal(a7.name, "r3-eyes-neutral-iris");
  assert.equal(a7.slot, "eyes");
  assert.equal(a7.method, "generated-luminance-map-plus-token", "the old generated-or-token ambiguity is gone");
  assert.equal(a7.calls, 1, "exactly one planned call, not a 0-1 range");
  assert.equal(I.method.assetId, 7);
  assert.equal(I.method.plannedCalls, 1);
});

test("R3_IRIS_DEFAULT is #A34A0F and is pinned independently of R2", () => {
  const t = I.token;
  assert.equal(t.name, "R3_IRIS_DEFAULT");
  assert.equal(t.value, "#A34A0F");
  assert.match(t.independentlyPinned, /never be imported from, aliased to, or dynamically derived from R2_IRIS_DEFAULT/i);
  assert.match(t.whySameValue, /documented Master-brown DESIGN value/i);
  assert.match(t.whySameValue, /not using an old R2 asset as a pixel source/i);
  assert.match(t.notCreatedHere, /does not create the runtime constant/i);
  // NOTE: the live R2_IRIS_DEFAULT is deliberately NOT asserted here. It is the precedent this
  // decision cites, not a value R3 depends on, and R3's pin must survive a change to R2's.
});

test("the token is not claimed to be measurable from finished pixels", () => {
  const t = I.token;
  assert.match(t.notMeasuredFromFinishedPixels, /NOT claimed to be derivable from the finished iris pixels/i);
  assert.match(t.notMeasuredFromFinishedPixels, /product of BOTH the token AND the map's luminance/i);
  assert.match(t.notMeasuredFromFinishedPixels, /own decision/i);
  // and the register says the same, so neither artefact can drift into the stronger claim
  assert.match(d136Row(), /No measurement of the target figure was performed/i);
  assert.match(d136Row(), /no rendered pixel yields it/i);
});

test("colour fidelity is judged on the composed pair, later, with no invented tolerance", () => {
  const r = I.renderPair;
  assert.match(r.rule, /token alone guarantees nothing/i);
  assert.match(r.rule, /ONE render pair/i);
  const later = r.laterApproval.join(" | ");
  assert.match(later, /finished, composed and tinted iris result/i);
  assert.match(later, /against Northstar Master v2/i);
  assert.match(later, /automatic format and layer checks/i);
  assert.match(later, /owner visual review/i);
  assert.match(r.noAfterTheFactTolerance, /No tolerance may be invented after the result is seen/i);
  assert.match(r.noAfterTheFactTolerance, /no automatic recolour, warp or repair/i);
  assert.match(r.doesNotAuthoriseTheCall, /does not authorise the later image call/i);
  assert.match(r.doesNotAuthoriseTheCall, /no candidate-specific pixel thresholds/i);
});

test("iris and fixed-eyes keep D-135's binding order on the eyes slot at z=4", () => {
  assert.match(I.method.layerOrder, /iris sublayer is composited first/i);
  assert.match(I.method.layerOrder, /fixed-eyes sublayer second/i);
  // the z model is the authority, and D-136 must agree with it rather than restate it loosely
  const tie = C.zModel.approvedTies.find((t) => t.slot === "eyes");
  assert.ok(tie, "the eyes tie must still exist in the z model");
  assert.equal(tie.z, 4);
  assert.deepEqual(tie.sublayers, ["iris", "eyes-fixed"]);
  assert.match(tie.domOrder, /iris is inserted FIRST/);
  assert.equal(C.zModel.slots.find((s) => s.slot === "eyes").z, 4);
});

test("an untinted R3 iris is forbidden, and missing tint support means an incomplete stack", () => {
  const t = I.tintSupport;
  assert.match(t.noUntintedFallback, /NOT carried over to R3/i);
  assert.match(t.noUntintedFallback, /must never be shown/i);
  assert.match(t.incompleteMeansNull, /mask\/multiply mechanism is unsupported/i);
  assert.match(t.incompleteMeansNull, /R3 stack is NOT complete/i);
  assert.match(t.incompleteMeansNull, /must return null/i);
  assert.match(t.fallbackChain, /R3 -> R2 -> C2/);
  assert.match(t.noMixing, /No R3 and R2 eyes layers may be mixed/i);
  assert.match(t.contractNotImplementation, /contract now, not runtime implementation/i);
  // and it must line up with D-135's atomic selection rather than inventing a second rule
  assert.match(C.zModel.stackSelection.resolverContract, /complete, validated R3 layer list OR null/i);
  assert.match(C.zModel.stackSelection.noMixing, /No geometry-bound R2 and R3 layers may be mixed/i);
});

test("no eye-colour feature, identity field or persistence is authorised", () => {
  const n = I.noEyeColourSystem;
  for (const re of [/user-selectable eye colour/i, /no new identity field/i, /persistence or Supabase field/i,
                    /no additional iris colours/i, /no eye-colour UI/i])
    assert.match(n.rule, re, "missing prohibition " + re);
  assert.match(n.scopeOfTheToken, /only the fixed neutral default value/i);
  assert.match(n.separateDecision, /own later owner decision/i);
});

test("the image-call budget is derived arithmetically and is now 15-16", () => {
  let min = 0, max = 0;
  for (const a of C.assets) {
    if (typeof a.calls === "number") { min += a.calls; max += a.calls; continue; }
    const m = /^(\d+)-(\d+)$/.exec(String(a.calls));
    assert.ok(m, a.name + " has an unreadable calls value: " + JSON.stringify(a.calls));
    min += Number(m[1]); max += Number(m[2]);
  }
  assert.ok(min <= max, "the derived budget must not be inverted");
  assert.equal(min, 15, "locking the iris to one call makes the minimum 15");
  assert.equal(max, 16);
  assert.equal(C.imageCallBudget.minimum, min, "the declared minimum must match the assets");
  assert.equal(C.imageCallBudget.maximum, max, "the declared maximum must match the assets");
  assert.equal(C.imageCallBudget.isAuthorisation, false);
  assert.match(I.budget.effect, /from 14-16 to 15-16/);
  assert.match(I.budget.stillNotAuthorisation, /planning, never consent/i);
});

test("nothing is wired yet: no R3 iris constant or tint implementation exists", () => {
  const layers = readFileSync(join(REPO, "js", "avatar-layers.js"), "utf8");
  const render = readFileSync(join(REPO, "js", "avatar-render-c2.js"), "utf8");
  for (const name of ["R3_IRIS_DEFAULT", "r3TintSupported", "composeR3Layers"])
    assert.ok(!layers.includes(name) && !render.includes(name), `${name} must not exist yet — D-136 is contract only`);
  assert.match(I.prohibitions.noRuntimeCode, /no runtime constant, resolver, compositor, manifest wiring or tint implementation/i);
  assert.match(I.prohibitions.noAssetProduced, /produces no iris map/i);
  assert.match(I.prohibitions.noImageRequestOrClaim, /authorises no image request and creates or consumes no claim/i);
});

test("the iris decision is closed under D-136; no owner decision remains open", () => {
  const closed = C.closedOwnerDecisions.filter((d) => d.decision === "D-136");
  assert.equal(closed.length, 1, "D-136 closes exactly one decision");
  assert.match(closed[0].was, /whether the iris is a colour token/i);
  assert.match(closed[0].resolution, /achromatic luminance map/i);
  assert.match(closed[0].resolution, /15-16/);

  const open = C.openOwnerDecisions;
  assert.deepEqual(open, [], "D-138 closed the last one: no owner decision may remain open");
  const joined = open.join(" | ");
  assert.ok(C.closedOwnerDecisions.some((d) => d.decision === "D-138" && /blush/i.test(d.was)),
    "blush is closed by D-138, not open");
  assert.ok(!/iris/i.test(joined), "a closed decision may not still be listed as open");
});

test("D-136 is append-only and rewrites nothing before it", () => {
  for (const d of ["D-132", "D-133", "D-134", "D-135", "D-136"])
    assert.equal(REGISTER.split("\n").filter((l) => l.startsWith("| **" + d + "** |")).length, 1, d + " must appear exactly once");
  const row = d136Row();
  assert.match(row, /D-120 through D-135 are not rewritten/);
  assert.match(row, /R3_IRIS_DEFAULT = #A34A0F/);
  assert.match(row, /generated-luminance-map-plus-token/);
  assert.match(row, /15–16/, "the row must state the new budget");
  assert.match(row, /no image request or claim is authorised/i);
  assert.match(row, /never be shown/i, "the untinted map must be forbidden in the register too");
});
