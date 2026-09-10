// D-134 — the R3 arm/hand occlusion contract.
//
// D-134 produces no region, no mask and no asset: the R3 underlay and the default garments it
// would be derived from do not exist yet. So these tests guard the CONTRACT, and they guard the
// two things it would be easiest to get wrong later:
//
//   1. that the protected region is per garment and its exception defaults to EMPTY, so the rule
//      is strict by default but is NOT an unconditional ban on a future approved sleeve or glove;
//   2. that a Y-interval alone is rejected as the arm/hand identification rule.
//
// The set algebra is exercised on small synthetic grids with a local reference implementation.
// That is a check that the stated rule is coherent and non-vacuous — it is deliberately NOT a
// shipped builder, because D-134 registers the builder as a prerequisite rather than writing one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const CONTRACT_PATH = join(REPO, "tools", "avatar", "fixtures", "r3", "r3-shadow-contract-v1.json");
const REGISTER_PATH = join(REPO, "docs", "project-state.md");
const C = JSON.parse(readFileSync(CONTRACT_PATH, "utf8"));
const A = C.armHandOcclusionContract;

function d134Row() {
  const rows = readFileSync(REGISTER_PATH, "utf8").split("\n").filter((l) => l.startsWith("| **D-134** |"));
  assert.equal(rows.length, 1, "D-134 must appear exactly once");
  return rows[0];
}

// ── a reference implementation of the contract's own set algebra ─────────────
const W = 8, H = 8, N = W * H;
const set = (...pixels) => { const s = new Uint8Array(N); for (const [x, y] of pixels) s[y * W + x] = 1; return s; };
const EMPTY = new Uint8Array(N);
/** R3_ARM_HAND_PROTECT(asset) := R3_ARM_HAND_EXPOSED_BASE \ R3_INTENTIONAL_ARM_HAND_COVERAGE(asset) */
const protectFor = (exposedBase, coverage) => {
  const p = new Uint8Array(N);
  for (let i = 0; i < N; i++) p[i] = (exposedBase[i] && !coverage[i]) ? 1 : 0;
  return p;
};
/** The three gates, each counting pixels of one garment layer inside the protected region. */
const violations = (layer, protectSet) => { let n = 0; for (let i = 0; i < N; i++) if (layer[i] && protectSet[i]) n++; return n; };

test("the contract is the D-134 one and produces nothing", () => {
  assert.equal(A.decision, "D-134");
  assert.equal(A.adoptedOn, "2026-09-10");
  assert.match(A.status, /CONTRACT ONLY/);
  assert.match(A.status, /NO REGION COMPUTED/);
  assert.match(A.status, /NO MASK FIXTURE PRODUCED/);
  assert.match(A.status, /NO IMAGE REQUEST AUTHORISED/);
  assert.equal(A.implementationPrerequisites.noneProducedByD134, true);
});

test("D-134 fills in D-132's precondition without rewriting it", () => {
  assert.match(A.relationToD132, /does not rewrite D-132/i);
  // D-132's own allowance must survive: the invariant is about UNINTENTIONAL coverage
  assert.match(C.occlusionContract.armHandInvariant, /NEVER unintentionally paint over/);
  assert.match(C.occlusionContract.armHandInvariant, /unless an approved garment is deliberately authored to cover them/);
  assert.match(C.occlusionContract.prerequisite, /PRE-REGISTERED and owner-approved BEFORE armor-knight/);
});

test("the protected region is the exposed base minus the per-asset intentional coverage", () => {
  assert.match(A.regions.R3_ARM_HAND_PROTECT, /R3_ARM_HAND_EXPOSED_BASE \\ R3_INTENTIONAL_ARM_HAND_COVERAGE\(asset\)/);
  assert.match(A.regions.R3_ARM_HAND_EXPOSED_BASE, /visible/i);
  assert.match(A.regions.R3_ARM_HAND_EXPOSED_BASE, /default clothing \(tee, trousers, shoes\) taken into account/);
  assert.match(A.regions.R3_ARM_HAND_EXPOSED_BASE, /not of any particular garment/i);
});

test("the intentional-coverage exception defaults to empty and needs its own owner decision", () => {
  const cov = A.regions.R3_INTENTIONAL_ARM_HAND_COVERAGE;
  assert.equal(cov.arity, "per garment asset");
  assert.match(cov.default, /THE EMPTY SET/);
  assert.match(cov.mayBeNonEmpty, /only after a separate owner decision/i);
  assert.match(cov.mayBeNonEmpty, /that one specific garment/i);
  assert.deepEqual(cov.approvedNonEmptyRegions, [], "D-134 may approve no non-empty coverage region");
  assert.match(cov.d134ApprovesNone, /approves NO non-empty intentional-coverage region/i);
  assert.match(cov.armorKnight, /EMPTY under D-134/);
  assert.match(A.prohibitions.noNonEmptyCoverageApproved, /armor-knight included/);
});

test("the torso family keeps the existing hard/edit/protect shape", () => {
  const t = A.regions.torsoFamily;
  assert.match(t.hardSubsetOfEdit, /r3-torso-occlusion-hard ⊆ r3-torso-edit-allowed/);
  assert.match(t.protectIsComplement, /r3-torso-protect := complement\(r3-torso-edit-allowed\)/);
  assert.match(t.precedent, /D-084\/D-085/);
  assert.match(t.precedent, /not a new pattern/i);
});

test("all three zero-gates are recorded, per asset", () => {
  const g = A.measurableRule.gates;
  assert.equal(g.length, 3);
  for (const re of [/0 finished garment pixels/, /0 hard-mask pixels/, /0 feather \/ edit-only pixels/])
    assert.ok(g.some((x) => re.test(x)), "missing gate " + re);
  for (const x of g) assert.match(x, /R3_ARM_HAND_PROTECT\(asset\)/, "every gate is measured per asset");
});

test("the rule is strict by default: with no approved coverage, an arm pixel is a violation", () => {
  const exposedBase = set([1, 1], [1, 2], [2, 1], [2, 2]);
  const garment = set([2, 2]);                       // one garment pixel lands on the arm
  const protectSet = protectFor(exposedBase, EMPTY); // default coverage is empty
  assert.equal(violations(garment, protectSet), 1, "with an empty exception the gate must fire");
});

test("the rule is NOT an unconditional ban: an approved coverage permits exactly that area", () => {
  const exposedBase = set([1, 1], [1, 2], [2, 1], [2, 2]);
  const coverage = set([2, 2]);                      // a hypothetical approved sleeve, that pixel only
  const protectSet = protectFor(exposedBase, coverage);
  assert.equal(violations(set([2, 2]), protectSet), 0, "an explicitly covered pixel is allowed");
  assert.equal(violations(set([1, 1]), protectSet), 1, "everything outside the exception stays protected");
  // and the exception is per asset: the same garment pixel is a violation for an asset with no coverage
  assert.equal(violations(set([2, 2]), protectFor(exposedBase, EMPTY)), 1, "the exception may not leak to other assets");
  assert.match(A.measurableRule.notAnUnconditionalBan, /NOT a blanket prohibition/i);
  assert.match(A.measurableRule.notAnUnconditionalBan, /only for that asset/i);
});

test("a Y-interval alone is expressly rejected as the identification rule", () => {
  const id = A.armHandIdentification;
  assert.match(id.yIntervalIsInsufficient, /REJECTED/);
  assert.match(id.yIntervalIsInsufficient, /same rows/i);
  assert.match(id.yIntervalIsInsufficient, /non-conforming/i);
  assert.ok(id.mustNotUse.includes("a Y-interval alone"), "the forbidden list must name it too");
});

test("the identification inputs and prohibitions are the pre-registered ones", () => {
  const id = A.armHandIdentification;
  for (const re of [
    /approved R3 underlay's alpha/,
    /separate alpha layers for tee, trousers and shoes/,
    /pre-registered SPATIAL rule/,
    /8-connected component analysis/,
    /reproducible landmarks/,
  ]) assert.ok(id.mustUse.some((x) => re.test(x)), "missing required input " + re);
  for (const forbidden of [
    "colour classification",
    "a difference against the target figure as segmentation",
    "a Y-interval alone",
    "the D-128 fitting-base arm/hand mask as runtime authority",
    "any threshold or corridor chosen after seeing a candidate result",
  ]) assert.ok(id.mustNotUse.includes(forbidden), "missing prohibition: " + forbidden);
  assert.match(id.noAfterTheFactTuning, /fixed BEFORE the first real derivation/i);
});

test("feather keeps the torso precedent and may never enter the protected region", () => {
  const f = A.feather;
  assert.match(f.rule, /at most 4 Master px/);
  assert.match(f.rule, /dilate\(hard/);
  assert.match(f.neverIntoProtect, /never enter R3_ARM_HAND_PROTECT\(asset\)/);
  assert.match(f.neverIntoProtect, /no blend at all/i);
  assert.match(f.neverIntoProtect, /build-r2-torso-occlusion-mask\.mjs/);
  assert.match(f.exceptionIsPerAsset, /that one asset only/i);
  assert.match(f.noRepair, /No warp, no mask growth, no automatic repair/);
});

test("the derivation may run later without a new image authorisation, but is not acceptance", () => {
  const a = A.authorisation;
  assert.match(a.derivationMayRunWithoutANewImageAuthorisation, /without a further image authorisation/);
  assert.match(a.derivationMayRunWithoutANewImageAuthorisation, /pre-registered with all seeds, corridors, tie-break rules and input hashes/);
  assert.match(a.derivationMayRunWithoutANewImageAuthorisation, /not a generative call/);
  assert.match(a.notAcceptance, /NOT automatic acceptance/);
  const req = a.stillRequired.join(" | ");
  assert.match(req, /every machine gate must pass/);
  assert.match(req, /owner visual review is required/);
  assert.match(req, /before it is approved/);
  assert.match(req, /armor-knight's image call still needs separate authorisation and its own one-shot claim/);
});

test("the regions and builder are registered as prerequisites, not as things that exist", () => {
  const p = A.implementationPrerequisites;
  assert.match(p.note, /NOTHING BELOW EXISTS YET/);
  assert.match(p.note, /No pixel region has been computed and no mask fixture has been written/i);
  assert.match(p.plannedBuilder, /not yet written/);
  assert.match(p.plannedBuilder, /pre-registered in its own spec before the first derivation run/);
  assert.match(p.productionOrder, /step 11/);
  // and the planned files must genuinely not be in the repository yet
  for (const name of p.plannedRegionNames) {
    for (const dir of ["r3-head-edit", "r3-arm-hand", "r3-torso"]) {
      const guess = join(REPO, "tools", "avatar", "fixtures", dir, name + "-v1.png");
      assert.ok(!existsSync(guess), `${name} must not exist yet — D-134 produces no fixture (${guess})`);
    }
  }
});

test("D-134 authorises no image request and no claim, and releases nothing", () => {
  assert.match(A.prohibitions.noRegionOrMask, /creates no mask, no pixel region and no image asset/);
  assert.match(A.prohibitions.noArmorKnightRelease, /does not release armor-knight/);
  assert.match(A.prohibitions.noImageRequestOrClaim, /authorises no image request and creates or consumes no claim/);
  assert.match(A.prohibitions.noOtherDecisionsChanged, /none of the other open owner decisions/);
  assert.match(A.prohibitions.noRuntimeChange, /no runtime, compositor, manifest, existing asset, mask or golden/);
  const row = d134Row();
  assert.match(row, /no image request or claim is authorised/i);
  assert.match(row, /does \*\*not\*\* release armor-knight/i);
  assert.match(row, /D-120 through D-133 are not rewritten/);
});

test("the arm/hand decision is closed under D-134, and only blush stays open", () => {
  const closed = C.closedOwnerDecisions.filter((d) => d.decision === "D-134");
  assert.equal(closed.length, 1, "D-134 closes exactly one decision");
  assert.match(closed[0].was, /occlusion\/protect contract/);
  assert.match(closed[0].resolution, /defaults to the empty set/i);
  assert.match(closed[0].resolution, /not an unconditional ban/i);
  assert.match(closed[0].resolution, /Y-interval alone is expressly rejected/i);

  const open = C.openOwnerDecisions;
  assert.equal(open.length, 1, "only blush may remain open");
  const joined = open.join(" | ");
  assert.ok(!/occlusion\/protect contract/.test(joined), "a closed decision may not still be listed as open");
  for (const [label, re] of [
    ["blush", /whether blush is part of the first slice/i],
  ]) assert.match(joined, re, `${label} must still be open`);
});

test("the register stays append-only around D-134", () => {
  const reg = readFileSync(REGISTER_PATH, "utf8");
  for (const d of ["D-131", "D-132", "D-133", "D-134"])
    assert.equal(reg.split("\n").filter((l) => l.startsWith("| **" + d + "** |")).length, 1, d + " must appear exactly once");
  const row = d134Row();
  assert.match(row, /R3_ARM_HAND_PROTECT\(asset\)/);
  assert.match(row, /THE EMPTY SET/);
  assert.match(row, /Y-INTERVAL IS NOT ENOUGH/);
});
