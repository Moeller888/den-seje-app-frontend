// D-132 — the R3 shadow contract is a contract, so these tests guard the things a later step
// could quietly get wrong: the reference pins, the fallback direction, default-OFF, the head-only
// scope of the first call, the byte-identity requirement of its recomposition, and the rule that
// nothing here authorises an image request.
//
// They also guard the two ways a contract quietly stops being a contract: an OPEN owner decision
// silently becoming binding somewhere else in the same file, and an UNAPPROVED number being read
// as a runtime value. Both are asserted structurally, not by re-reading a string.
//
// H1 is external (D-127 §2). The contract stores its hash and measurements, never the image —
// one test asserts exactly that, because copying it in would publish a drawn child figure on two
// public surfaces.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const CONTRACT_PATH = join(REPO, "tools", "avatar", "fixtures", "r3", "r3-shadow-contract-v1.json");
const REGISTER_PATH = join(REPO, "docs", "project-state.md");
const C = JSON.parse(readFileSync(CONTRACT_PATH, "utf8"));
const sha256 = (b) => createHash("sha256").update(b).digest("hex");

const TARGET_SHA = "3daf32e76bff9a53ec7d25cf148a230073cfd0da6a003d02a23c4292d139ff50";
const H1_SHA = "72875565ecd62b542a91156dbcca1399a434fe04634f4e737df71337be0d5af4";
const RAW_SHA = "fa4c705e05b7832c1308f15dcecb28a47ec61416c91486a3930de3b4eaf854c1";
const HEAD_MASK_SHA = "cc9c8b7a68dab60ab5c2914644d28676eefcb29e917a05f7bf4ce44093b737b3";

/** The single D-132 row, so register and contract can be checked against each other. */
function d132Row() {
  const rows = readFileSync(REGISTER_PATH, "utf8").split("\n").filter((l) => l.startsWith("| **D-132** |"));
  assert.equal(rows.length, 1, "D-132 must appear exactly once");
  return rows[0];
}

/** The text of one numbered clause of the D-132 row, e.g. section("(10) THE FIRST SLICE", "(11)"). */
function section(row, from, to) {
  const a = row.indexOf(from);
  assert.ok(a >= 0, "the register is missing the clause " + from);
  const b = row.indexOf(to, a);
  assert.ok(b > a, "the register is missing the clause after " + from);
  return row.slice(a, b);
}

test("the schema is the one the tooling expects", () => {
  assert.equal(C.meta.schema, "r3-shadow-contract");
  assert.equal(C.meta.schemaVersion, 1);
  assert.equal(C.meta.decision, "D-132");
});

test("no image request is authorised, anywhere in the contract", () => {
  assert.equal(C.meta.authorisesImageRequest, false);
  assert.equal(C.imageCallBudget.isAuthorisation, false);
  assert.match(C.prohibitions.noImageRequestAuthorised, /authorise no image request/);
  assert.match(C.prohibitions.noAutomaticRepair, /never warped, retried or repaired automatically/);
  assert.match(C.prohibitions.noMaskWork, /creates, changes, derives and promotes no mask/);
});

test("the reference pair is pinned by full sha256, and the target's pin matches the tracked file", () => {
  assert.equal(C.referencePair.targetFigure.sha256, TARGET_SHA);
  assert.equal(C.referencePair.authoringBase.sha256, H1_SHA);
  assert.equal(C.referencePair.rawProvenance.sha256, RAW_SHA);
  const tracked = join(REPO, C.referencePair.targetFigure.path);
  assert.ok(existsSync(tracked), "the target figure must be referenced at its existing tracked path");
  assert.equal(sha256(readFileSync(tracked)), TARGET_SHA, "the tracked target figure has changed");
});

test("H1 is external and is NOT copied into the repository", () => {
  assert.equal(C.referencePair.authoringBase.tracked, false);
  assert.match(C.prohibitions.noH1InRepository, /must not be copied into the repository/);
  const files = execFileSync("git", ["-C", REPO, "ls-files"], { encoding: "utf8" }).split("\n");
  const offenders = files.filter((p) => /fitting-base\.H1|refined\.raw/i.test(p));
  assert.deepEqual(offenders, [], "neither H1 nor the raw provenance image may be tracked");
  const r3dir = join(REPO, "tools", "avatar", "fixtures", "r3");
  const images = readdirSync(r3dir).filter((f) => /\.(png|webp|jpe?g)$/i.test(f));
  assert.deepEqual(images, [], "the r3 fixture directory holds the contract only, never an image");
});

test("H1's storage separates the binding policy from the observed location", () => {
  const a = C.referencePair.authoringBase;
  // The BINDING part: never tracked, never published, never deployable.
  assert.match(a.storagePolicy, /BINDING/);
  assert.match(a.storagePolicy, /NEVER be tracked/i);
  assert.match(a.storagePolicy, /never published/i);
  assert.match(a.storagePolicy, /assets\//);
  // The INTENDED archive of D-127 §2, kept distinct from what was actually observed.
  assert.match(a.storageIntended, /D-127/);
  assert.match(a.storageIntended, /external/i);
  // The OBSERVED state must not claim the file already sits outside the clones.
  assert.match(a.storageObserved, /VERIFIED READ-ONLY/);
  // D-133 §1 corrected this observation: the canonical H1 IS in D-127 §2's external archive,
  // and the copy inside the clone is a gitignored working/review copy, not the canonical store.
  assert.match(a.storageObserved, /IS in the external archive/i);
  assert.match(a.storageObserved, /WORKING[/]REVIEW copy/i);
  assert.ok(!/NOT yet in the external archive/i.test(a.storageObserved),
    "the withdrawn D-132 observation must not survive anywhere in this field");
  assert.match(a.storageCorrectedBy, /D-133/);
  assert.ok(!/\bEXTERNAL — outside both repositories\b/.test(JSON.stringify(a)),
    "the contract must not state as observed fact that H1 lies outside both repositories");
  assert.match(a.storageNoMoveAuthorised, /moves, copies and deletes nothing/);
});

test("H1 is recorded as an authoring model, never anatomical ground truth", () => {
  assert.match(C.referencePair.authoringBase.notAnatomicalGroundTruth, /never ground truth/);
  assert.match(C.referencePair.authoringBase.role, /AUTHORING/);
  assert.match(C.referencePair.targetFigure.role, /CLOTHED TARGET FIGURE/);
});

test("the geometric conclusion is stated no more broadly than the evidence", () => {
  assert.match(C.referencePair.pairEvidence.statement, /No material geometric drift has been demonstrated/);
  assert.match(C.referencePair.pairEvidence.notClaimed, /NOT a claim/);
  assert.equal(C.referencePair.pairEvidence.headBytesDifferingInsideHeadProtectMask, 0);
});

test("the crotch proxy is recorded as a diagnostic, never as a gate", () => {
  const c = C.referencePair.pairEvidence.crotchProxy;
  assert.match(String(c.measuredDeltaPx), /12/);
  assert.equal(c.status, "DIAGNOSTIC ONLY");
  assert.equal(c.isHardGate, false);
  assert.equal(c.isEvidenceOfMaterialDrift, false);
  assert.match(c.nature, /[Cc]lothing-sensitive/);
  assert.match(c.nature, /ambiguous/);
  assert.match(c.triggers, /must not trigger generation, warp, repair or promotion/);
  assert.match(c.noTolerance, /No tolerance is defined/);
  // and no tolerance was invented anywhere else for it: every OTHER field must stay silent about one
  const otherFields = Object.entries(c).filter(([k]) => k !== "noTolerance")
    .map(([k, v]) => k + ": " + String(v)).join(" | ");
  assert.ok(!/toleran/i.test(otherFields), "the crotch proxy must not carry a tolerance of its own");
});

test("the soft-alpha measurement states its definition and gates nothing", () => {
  const r = C.referencePair.rawProvenance;
  assert.match(r.softAlphaDefinition, /0 < alpha < 128/);
  assert.match(r.softAlphaDefinition, /alpha >= 128/, "it must anchor on the D-071 solid threshold");
  assert.match(r.softAlphaStatus, /PROVENANCE/);
  assert.match(r.softAlphaStatus, /NOT a new universal R3 acceptance threshold/);
  assert.match(r.softAlphaStatus, /gates nothing/);
  assert.match(r.relationToTarget, /27195 -> 6910/);
});

test("R3 is a shadow stack: default OFF, R2 untouched, fallback R3 -> R2 -> C2", () => {
  assert.equal(C.architecture.defaultEnabled, false);
  assert.deepEqual(C.architecture.fallbackChain, ["R3", "R2", "C2"]);
  assert.match(C.architecture.r2Guarantee, /byte-identical/);
  assert.match(C.architecture.rollback, /no data migration/);
  assert.equal(C.architecture.identityCoverage.bodyType, "neutral");
  assert.equal(C.architecture.identityCoverage.skinTone, "medium");
});

test("the layer contract carries every slot, and the three clothing slots are new", () => {
  const slots = C.layerContract.slots;
  const byName = Object.fromEntries(slots.map((s) => [s.slot, s]));
  for (const s of ["base", "blush", "face", "eyes", "tee", "trousers", "shoes", "torso", "hair"])
    assert.ok(byName[s], "missing slot " + s);
  for (const s of ["tee", "trousers", "shoes"]) assert.equal(byName[s].newInR3, true, s + " must be marked new");
  for (const s of ["base", "blush", "face", "eyes", "torso", "hair"]) assert.equal(byName[s].newInR3, false);
  assert.deepEqual(C.layerContract.canvas.master, [1024, 1536]);
  assert.deepEqual(C.layerContract.canvas.served, [512, 768]);
  assert.match(C.layerContract.alphaRule, /alpha >= 128/);
});

test("the BINDING layer rule is the relative paint order, and the slot list follows it", () => {
  const p = C.layerContract.paintOrder;
  assert.equal(p.binding, true);
  assert.match(p.rule, /RELATIVE paint order/);
  assert.match(p.rule, /Numeric z-index values are NOT part of it/);
  const order = p.bottomToTop;
  assert.equal(new Set(order).size, order.length, "a slot may appear once in the paint order");
  assert.deepEqual(C.layerContract.slots.map((s) => s.slot), order,
    "the slot list must be written in the binding paint order");
  const at = (s) => order.indexOf(s);
  assert.ok(at("base") === 0, "the underlay is the bottom layer");
  for (const s of ["tee", "trousers", "shoes"]) assert.ok(at(s) > at("base"), s + " paints above the underlay");
  assert.ok(at("torso") > at("tee"), "a cosmetic garment must sit above the default tee");
  assert.ok(at("hair") === order.length - 1, "hair paints above every face and clothing layer");
  assert.ok(p.invariants.length >= 4);
});

test("the numeric z values are provisional, unapproved, and not implementable", () => {
  const z = C.layerContract.zIndices;
  assert.equal(z.binding, false);
  assert.equal(z.mayBeImplemented, false);
  assert.match(z.status, /PROVISIONAL/);
  assert.match(z.status, /NOT OWNER-APPROVED/);
  assert.match(z.status, /NOT RUNTIME VALUES/);
  // the three new clothing slots must not carry an approved-looking number anywhere else
  for (const s of C.layerContract.slots)
    assert.ok(!("z" in s), "slot " + s.slot + " must not carry a bare z value that reads as binding");
  for (const s of ["tee", "trousers", "shoes", "torso"])
    assert.ok(s in z.provisional.values, s + " must be listed as provisional, not inherited");
  for (const s of ["base", "blush", "face", "eyes", "hair"])
    assert.ok(s in z.inherited.values, s + " is carried over from the existing R2 stack");
  // the known collision with the live stack must be recorded, not discovered later
  assert.match(z.knownCollision, /R2_COSMETIC_Z/);
  assert.match(z.knownCollision, /avatar-layers\.js/);
  assert.match(z.knownCollision, /eyes cosmetic \(glasses\) is 6/);
  assert.match(z.knownCollision, /face cosmetic \(mask\) is 8/);
  assert.match(z.knownCollision, /torso-garment z, which is 1/);
  assert.match(z.knownCollision, /may be implemented without a separate owner decision/);
});

test("an R3 garment may never paint over exposed arms or hands", () => {
  const o = C.occlusionContract;
  assert.equal(o.binding, true);
  assert.match(o.armHandInvariant, /NEVER unintentionally paint over exposed arms or hands/);
  assert.match(o.armHandInvariant, /stay visible/);
  assert.match(o.prerequisite, /PRE-REGISTERED and owner-approved BEFORE armor-knight/);
  assert.match(o.prerequisite, /precondition/);
  assert.match(o.fittingBaseMaskIsNotRuntime, /NOT automatically an R3 runtime mask/);
  assert.match(o.fittingBaseMaskIsNotRuntime, /no runtime authority/);
  assert.match(o.authorisation, /authorises no mask to be created, changed, derived or promoted/);
});

test("old R2 assets may never be a pixel source or a geometric authority", () => {
  for (const forbidden of ["a pixel source", "a geometric authority", "a basis for automatic warp"])
    assert.ok(C.pixelSourcePolicy.oldR2AssetsMayNotBe.includes(forbidden), "missing prohibition: " + forbidden);
  for (const forbidden of ["a finished garment mask", "automatic segmentation", "a pixel source for the tee, trousers or shoes"])
    assert.ok(C.pixelSourcePolicy.differenceAnalysisMayNotBe.includes(forbidden), "missing prohibition: " + forbidden);
});

test("the difference evidence is the qualitative conclusion, with no unreproducible counts", () => {
  const p = C.pixelSourcePolicy;
  assert.match(p.why, /ONE DOMINANT CONNECTED REGION/);
  assert.match(p.why, /neck to the feet/);
  assert.match(p.why, /mixes t-shirt, trousers, shoes, skin, body contour, alpha antialiasing and generative variation/);
  assert.match(p.why, /cannot be inverted into overlapping layers/);
  // no pinned pixel or component count may survive here, in the contract, or in the register
  assert.ok(!/\d[\d,.]{2,}/.test(p.why), "the rationale must carry no unreproducible pixel or component count");
  assert.match(p.whyNoExactFigure, /not independently reproducible/);
  assert.match(p.whyNoExactFigure, /metric, alpha threshold, colour threshold and connectivity/);
  const blob = JSON.stringify(C);
  for (const stale of ["215,300", "215300", "428 smaller components"])
    assert.ok(!blob.includes(stale), "the contract still carries the withdrawn figure " + stale);
  for (const stale of ["215,300", "215300", "428 smaller components"])
    assert.ok(!d132Row().includes(stale), "the D-132 register row still carries the withdrawn figure " + stale);
});

test("the asset list covers every reproduced layer, with unique names", () => {
  assert.equal(C.assets.length, 17);
  const names = C.assets.map((a) => a.name);
  for (const n of ["r3-base-neutral-medium", "r3-tee-default", "r3-trousers-default", "r3-shoes-default",
                   "r3-face-neutral", "r3-hair-northstar", "r3-torso-armor-knight"])
    assert.ok(names.includes(n), "missing asset " + n);
  assert.equal(new Set(names).size, names.length, "asset names must be unique");
  assert.equal(new Set(C.assets.map((a) => a.id)).size, C.assets.length, "asset ids must be unique");
});

test("the call budget is DERIVED from assets[].calls, and is a plan rather than consent", () => {
  let min = 0, max = 0;
  for (const a of C.assets) {
    if (typeof a.calls === "number") {
      assert.ok(Number.isInteger(a.calls) && a.calls >= 0, a.name + " has a bad call count");
      min += a.calls; max += a.calls;
      continue;
    }
    const m = /^(\d+)-(\d+)$/.exec(String(a.calls));
    assert.ok(m, a.name + " has an unreadable calls value: " + JSON.stringify(a.calls));
    const lo = Number(m[1]), hi = Number(m[2]);
    assert.ok(lo <= hi, a.name + " has an inverted call range");
    min += lo; max += hi;
  }
  assert.ok(min <= max, "the derived budget must not be inverted");
  assert.equal(min, 14, "the assets must sum to a minimum of exactly 14 calls");
  assert.equal(max, 16, "the assets must sum to a maximum of exactly 16 calls");
  assert.equal(C.imageCallBudget.minimum, min, "the declared minimum must match the assets");
  assert.equal(C.imageCallBudget.maximum, max, "the declared maximum must match the assets");
  assert.equal(C.imageCallBudget.isAuthorisation, false);
  assert.match(C.imageCallBudget.derivedFrom, /sum of assets\[\]\.calls/);
});

test("the production order is enforced by its dependencies, not by its length", () => {
  const steps = C.productionOrder, ids = C.productionOrderIds;
  assert.equal(ids.length, steps.length, "every production step needs exactly one id");
  assert.equal(new Set(ids).size, ids.length, "production step ids must be unique");
  steps.forEach((s, i) => assert.ok(s.startsWith(String(i + 1) + " "), "step " + (i + 1) + " is out of order: " + s));

  const at = Object.fromEntries(ids.map((id, i) => [id, i]));
  for (const c of C.productionOrderConstraints) {
    assert.ok(c.before in at, "unknown constraint id: " + c.before);
    assert.ok(c.after in at, "unknown constraint id: " + c.after);
    assert.ok(c.why && c.why.length > 0, c.before + " -> " + c.after + " needs a reason");
    assert.ok(at[c.before] < at[c.after],
      "the approved order violates its own dependency: " + c.before + " must precede " + c.after);
  }

  // the dependencies that actually matter must be present, not merely consistent
  const has = (b, a) => C.productionOrderConstraints.some((c) => c.before === b && c.after === a);
  for (const a of ["face-neutral", "eyes-fixed", "iris", "hair-northstar", "tee", "trousers", "shoes"])
    assert.ok(has("underlay", a), "the underlay must precede " + a);
  for (const b of ["tee", "trousers", "shoes"])
    assert.ok(has(b, "runtime-masks"), b + " must precede the runtime masks");
  for (const b of ["underlay", "face-neutral", "eyes-fixed", "hair-northstar", "tee", "trousers", "shoes", "runtime-masks"])
    assert.ok(has(b, "default-composition"), b + " must precede the default composition");
  assert.ok(has("default-composition", "automatic-check"), "the composition must precede the automatic check");
  assert.ok(has("automatic-check", "owner-visual-review"), "the automatic check must precede the owner review");
  for (const a of ["other-expressions", "other-hairstyles", "armor-knight"])
    assert.ok(has("owner-visual-review", a), "the owner review must precede " + a);
  for (const b of ["other-expressions", "other-hairstyles", "armor-knight"])
    assert.ok(has(b, "integration-canary-rollback"), b + " must precede integration and canary");
});

test("the first call is a head-only edit of H1 with a pre-defined recomposition", () => {
  const f = C.firstCall;
  assert.match(f.scope, /HEAD-ONLY EDIT/);
  assert.equal(f.inputs.image1.sha256, H1_SHA);
  assert.equal(f.inputs.image2.sha256, TARGET_SHA);
  assert.match(f.inputs.image2.binding, /must NOT be copied/);
  assert.match(f.recomposition.contract, /PRE-DEFINED/);
  const r = f.recomposition.rules.join(" ");
  assert.match(r, /byte-identically everywhere outside/);
  assert.match(r, /no generated pixel outside the permitted head region survives/);
});

test("the first call's gates demand byte identity, not a new tolerance", () => {
  const g = C.firstCall.gates;
  assert.match(g.hardMachine.protectedBody, /exactly 0 differing RGBA bytes/);
  assert.match(g.hardMachine.protectedTransition, /exactly 0 differing bytes/);
  assert.match(g.hardMachine.background, /alpha = 0/);
  assert.match(g.noNewTolerances, /0 differing pixels, not a tolerance/);
  assert.match(g.notCompared, /must NOT be compared directly with H1/);
  assert.ok(Array.isArray(g.ownerVisual) && g.ownerVisual.length >= 6);
});

test("the 50 KB size budget is documented as a torso gate that does not apply here", () => {
  const s = C.firstCall.gates.sizeBudget;
  assert.equal(s.applies, false);
  assert.match(s.finding, /promote-r2-torso-asset\.mjs/);
  assert.match(s.finding, /67,174 B and already exceeds it/);
  const base = join(REPO, "assets", "avatar-r2", "base", "body-neutral-medium-v2.webp");
  assert.ok(readFileSync(base).length > 50 * 1024, "the active base must still exceed 50 KB for this finding to hold");
});

test("the head mask check is recorded read-only, with both gaps, and no new mask was made", () => {
  const h = C.headMaskSuitability;
  assert.equal(h.checkedReadOnly, true);
  assert.equal(h.mask.sha256, HEAD_MASK_SHA);
  const mask = join(REPO, "tools", "avatar", "fixtures", "fitting-base", "head-protect-mask-v1.png");
  assert.equal(sha256(readFileSync(mask)), HEAD_MASK_SHA, "the head mask must be untouched");
  assert.deepEqual(h.semantics.alphaValues, [0, 255]);
  assert.equal(h.semantics.binary, true);
  assert.equal(h.geometry.px, 124099);
  assert.deepEqual(h.geometry.bbox, [292, 20, 732, 433]);
  assert.equal(h.gaps.length, 2);
  assert.match(h.gaps[0].finding, /445 H1 solid pixels/);
  assert.match(h.gaps[1].finding, /no transition ring/);
  assert.match(h.consequence, /No new mask has been created/);
  assert.match(h.prohibition, /NOT automatically promoted to runtime masks/);
});

test("the deterministic operations are only the four with documented precedent", () => {
  assert.equal(C.deterministicOperations.length, 4);
  for (const op of C.deterministicOperations) assert.ok(op.precedent && op.precedent.length > 0, op.op + " needs a precedent");
});

test("the first slice is neutral + medium + northstar and needs no difference algorithm", () => {
  const s = C.firstSlice;
  assert.equal(s.identity.bodyType, "neutral");
  assert.equal(s.identity.skinTone, "medium");
  assert.equal(s.identity.hairstyle, "northstar");
  assert.equal(s.equipment, "none");
  assert.match(s.mustNotDependOn, /difference algorithm/);
  assert.deepEqual(s.layers,
    ["technical underlay", "neutral face", "eyes fixed", "iris", "northstar hair", "tee", "trousers", "shoes"],
    "the first slice is the underlay, the neutral face and eyes, northstar hair and the default clothing");
});

test("no layer that is still an OPEN owner decision may appear as settled in the first slice", () => {
  const open = C.openOwnerDecisions.join(" | ");
  // blush is the live case: it must be open, and therefore absent from the first slice
  assert.match(open, /whether blush is part of the first slice/i,
    "the blush question must still be recorded as an open owner decision");
  assert.ok(!C.firstSlice.layers.some((l) => /blush/i.test(l)),
    "blush must not appear in firstSlice.layers while the question is open");
  assert.match(C.firstSlice.excluded.blush, /DELIBERATELY NOT in the first slice/);
  assert.match(C.firstSlice.excluded.blush, /open owner decision/i);
  // the register must describe the same first slice, so the two artefacts cannot drift apart:
  // it may only mention blush in order to exclude it.
  const s10 = section(d132Row(), "(10) THE FIRST SLICE", "(11) THE TECHNICAL UNDERLAY");
  assert.match(s10, /blush is deliberately not part of it/i,
    "the register's first slice must say in so many words that blush is excluded");
  assert.ok(!/\+ *blush/i.test(s10), "the register must not list blush among the first-slice layers");

  // and the same rule generalised: any slot whose membership of the first slice is still open
  // must not be listed as one of its layers.
  for (const slot of C.layerContract.paintOrder.bottomToTop) {
    const isOpen = new RegExp("whether " + slot + " is part of the first slice", "i").test(open);
    if (!isOpen) continue;
    assert.ok(!C.firstSlice.layers.some((l) => new RegExp(slot, "i").test(l)),
      slot + " is an open first-slice decision and must not be listed as a first-slice layer");
  }
});

test("the two mask gaps are closed by D-133; the z values, occlusion and hairstyles stay open", () => {
  const joined = C.openOwnerDecisions.join(" | ");
  const closed = C.closedOwnerDecisions.map((d) => d.was).join(" | ");
  assert.match(closed, /GAP-1/, "GAP-1 is closed, and the record of it must survive");
  assert.match(closed, /GAP-2/, "GAP-2 is closed, and the record of it must survive");
  for (const d of C.closedOwnerDecisions) assert.equal(d.decision, "D-133");
  assert.ok(!/GAP-1|GAP-2/.test(joined), "a closed gap may not still be listed as open");
  assert.equal(C.openOwnerDecisions.length, 6, "the other six decisions are untouched by D-133");
  assert.match(joined, /VALID_HAIRSTYLES/);
  assert.match(joined, /final z-index values for the three new clothing slots/i);
  assert.match(joined, /R2_COSMETIC_Z/, "the z collision must be an explicit open decision");
  assert.match(joined, /occlusion\/protect contract/i, "the arm\/hand occlusion contract must be an explicit open decision");
  assert.match(joined, /whether blush is part of the first slice/i);
});

test("the D-132 row exists in the register exactly once and is not rewritten by anything here", () => {
  const reg = readFileSync(REGISTER_PATH, "utf8");
  const row = d132Row();
  for (const d of ["D-129", "D-130", "D-131"]) {
    const n = reg.split("\n").filter((l) => l.startsWith("| **" + d + "** |")).length;
    assert.ok(n <= 1, d + " must not be duplicated");
  }
  assert.match(row, /R3/);
  assert.match(row, /no image request/i);
});
