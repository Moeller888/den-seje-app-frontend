// D-132 — the R3 shadow contract is a contract, so these tests guard the things a later step
// could quietly get wrong: the reference pins, the fallback direction, default-OFF, the head-only
// scope of the first call, the byte-identity requirement of its recomposition, and the rule that
// nothing here authorises an image request.
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
const C = JSON.parse(readFileSync(CONTRACT_PATH, "utf8"));
const sha256 = (b) => createHash("sha256").update(b).digest("hex");

const TARGET_SHA = "3daf32e76bff9a53ec7d25cf148a230073cfd0da6a003d02a23c4292d139ff50";
const H1_SHA = "72875565ecd62b542a91156dbcca1399a434fe04634f4e737df71337be0d5af4";
const RAW_SHA = "fa4c705e05b7832c1308f15dcecb28a47ec61416c91486a3930de3b4eaf854c1";
const HEAD_MASK_SHA = "cc9c8b7a68dab60ab5c2914644d28676eefcb29e917a05f7bf4ce44093b737b3";

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
  assert.match(C.referencePair.authoringBase.storage, /EXTERNAL/);
  assert.match(C.prohibitions.noH1InRepository, /must not be copied into the repository/);
  const files = execFileSync("git", ["-C", REPO, "ls-files"], { encoding: "utf8" }).split("\n");
  const offenders = files.filter((p) => /fitting-base\.H1|refined\.raw/i.test(p));
  assert.deepEqual(offenders, [], "neither H1 nor the raw provenance image may be tracked");
  const r3dir = join(REPO, "tools", "avatar", "fixtures", "r3");
  const images = readdirSync(r3dir).filter((f) => /\.(png|webp|jpe?g)$/i.test(f));
  assert.deepEqual(images, [], "the r3 fixture directory holds the contract only, never an image");
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
  const z = slots.map((s) => s.z);
  assert.deepEqual(z, [...z].sort((a, b) => a - b), "slots must be listed in ascending z order");
  assert.equal(new Set(z).size, z.length, "z indices must be unique");
  assert.ok(byName.torso.z > byName.tee.z, "a cosmetic garment must sit above the default tee");
  assert.deepEqual(C.layerContract.canvas.master, [1024, 1536]);
  assert.deepEqual(C.layerContract.canvas.served, [512, 768]);
  assert.match(C.layerContract.alphaRule, /alpha >= 128/);
});

test("old R2 assets may never be a pixel source or a geometric authority", () => {
  for (const forbidden of ["a pixel source", "a geometric authority", "a basis for automatic warp"])
    assert.ok(C.pixelSourcePolicy.oldR2AssetsMayNotBe.includes(forbidden), "missing prohibition: " + forbidden);
  for (const forbidden of ["a finished garment mask", "automatic segmentation", "a pixel source for the tee, trousers or shoes"])
    assert.ok(C.pixelSourcePolicy.differenceAnalysisMayNotBe.includes(forbidden), "missing prohibition: " + forbidden);
  assert.match(C.pixelSourcePolicy.why, /215,300/, "the measured evidence against difference-extraction must be recorded");
});

test("the asset list covers every reproduced layer and the call budget is a plan, not consent", () => {
  assert.equal(C.assets.length, 17);
  const names = C.assets.map((a) => a.name);
  for (const n of ["r3-base-neutral-medium", "r3-tee-default", "r3-trousers-default", "r3-shoes-default",
                   "r3-face-neutral", "r3-hair-northstar", "r3-torso-armor-knight"])
    assert.ok(names.includes(n), "missing asset " + n);
  assert.equal(new Set(names).size, names.length, "asset names must be unique");
  assert.ok(C.imageCallBudget.minimum >= 14 && C.imageCallBudget.maximum <= 16);
  assert.equal(C.productionOrder.length, 18);
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
});

test("the open owner decisions include both mask gaps and the hairstyle contract", () => {
  const joined = C.openOwnerDecisions.join(" | ");
  assert.match(joined, /GAP-1/);
  assert.match(joined, /GAP-2/);
  assert.match(joined, /VALID_HAIRSTYLES/);
});

test("the D-132 row exists in the register exactly once and is not rewritten by anything here", () => {
  const reg = readFileSync(join(REPO, "docs", "project-state.md"), "utf8");
  const rows = reg.split("\n").filter((l) => l.startsWith("| **D-132** |"));
  assert.equal(rows.length, 1, "D-132 must appear exactly once");
  for (const d of ["D-129", "D-130", "D-131"]) {
    const n = reg.split("\n").filter((l) => l.startsWith("| **" + d + "** |")).length;
    assert.ok(n <= 1, d + " must not be duplicated");
  }
  assert.match(rows[0], /R3/);
  assert.match(rows[0], /no image request/i);
});
