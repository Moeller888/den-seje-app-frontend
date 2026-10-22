// R3 HAIR — D-185: hybrid derivation as an authoring method and its review candidate r3-hair-hybrid-v2. The tests bind the
// untouched source to the closed D-183 record, reject undocumented edits and wrong annotations, rebuild the derived pixels
// deterministically and run the checks whose inputs are tracked on the ACTUAL derived pixels. HP6 and HP7 need untracked
// DRAFT face parts and eyes: here they must be reported NOT RUN, never passed. No image call, no runtime change.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng, pixelSha256, applyTonalRampB } from "../../tools/avatar/r3-hair-tool.mjs";
import { SOURCE, EDIT_TYPES, CHANGE_CATEGORIES, validateSpec, buildHybrid, constructionAnnotation, validateHybridAnnotation, cornerCrop, runChecks } from "../../tools/avatar/r3-hair-hybrid.mjs";
import { buildGuide, loadTargets } from "../../tools/avatar/r3-hair-guide-v1.mjs";
import { preD185Contract, PRE_D185_CONTRACT_CANONICAL_SHA256, PRE_D185_COMMIT, preD184Contract, PRE_D184_CONTRACT_CANONICAL_SHA256 } from "./avatar-r3-d147-closure.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const file = (rel) => readFileSync(join(REPO, ...rel.split("/")));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const H = "tools/avatar/fixtures/r3-hair/hybrid/";
const LIVE = JSON.parse(file("tools/avatar/fixtures/r3/r3-shadow-contract-v1.json").toString("utf8"));
const HD = LIVE.hairMethod.methodV2.hybridDerivation;
const MANIFEST = JSON.parse(file(H + "hybrid-v2.manifest.json").toString("utf8"));
const P3 = MANIFEST.parts["3 derived sheet and placed review candidate"];
const SPEC_BUF = file(H + "hybrid-v2.edits.json"), SPEC = JSON.parse(SPEC_BUF.toString("utf8"));
const V1_SPEC = JSON.parse(file(H + "hybrid-v1.edits.json").toString("utf8"));
const RAW = decodePng(file(SOURCE.file)).px;
const TARGETS = loadTargets();
const VERTEX_NAMES = Object.keys(buildGuide(TARGETS).vertices);
const BUILT = buildHybrid({ spec: SPEC, rawPx: RAW, targets: TARGETS });
const ANN = JSON.parse(file(H + "hybrid-v2.annotation.json").toString("utf8"));

test("D-185 adds exactly hairMethod.methodV2.hybridDerivation: the contract minus it is the D-184 merge", () => {
  assert.equal(sha(JSON.stringify(preD185Contract(LIVE))), PRE_D185_CONTRACT_CANONICAL_SHA256, "canonical contract at " + PRE_D185_COMMIT);
  assert.equal(sha(JSON.stringify(preD184Contract(LIVE))), PRE_D184_CONTRACT_CANONICAL_SHA256, "and the older chain still holds");
  assert.equal(Object.keys(LIVE.hairMethod.methodV2).at(-1), "hybridDerivation");
  assert.deepEqual([HD.decision, HD.isAuthorisation, HD.authorisesImageRequest], ["D-185", false, false]);
  assert.deepEqual(LIVE.authorisedCalls.calls.filter((e) => e.mandateState === "UNSPENT"), [], "no live permission");
  assert.deepEqual([LIVE.assets[8].calls, LIVE.imageCallBudget.minimum, LIVE.imageCallBudget.maximum, LIVE.imageCallBudget.callsActuallySentSoFar.hair], [4, 26, 27, 4], "no capacity, no call");
  assert.equal(LIVE.architecture.defaultEnabled, false, "R3 stays default OFF");
  assert.ok(!/AVATAR_R3\s*=\s*true/.test(file("js/avatar-layers.js").toString("utf8")), "R3 stays OFF at runtime");
  assert.match(HD.ownerDecision, /not an after-the-fact approval of the raw sheet's fit/);
  assert.match(HD.ownerDecision, /Per cent preserved is traceability, not proof of quality/);
  for (const x of ["a production asset or promotion", "a runtime change or the wiring of ramp B", "an image request, capacity or claim"]) assert.ok(HD.notApproved.includes(x), x);
});

test("the untouched source is bound to the closed D-183 record: bytes, original check report and status", () => {
  const raw = file(SOURCE.file), report = file(SOURCE.report);
  const e183 = LIVE.authorisedCalls.calls.find((e) => e.callId === "D-183-r3-hair-northstar-v4");
  assert.deepEqual([sha(raw), raw.length], [e183.execution.raw.sha256, e183.execution.raw.bytes], "a byte-identical copy of the D-183 sheet");
  assert.equal(sha(report), e183.technicalObservations.checkReport.sha256, "the original check report, byte-identical");
  assert.equal(JSON.parse(report.toString("utf8")).verdict, "PASS_TO_ANNOTATION");
  assert.deepEqual([e183.mandateState, e183.closure.closedBy], ["SPENT", "D-184"], "D-183's historical status is unchanged");
  assert.match(e183.closure.disposition, /^KEPT FOR REVIEW, NOT VISUALLY APPROVED/);
  assert.deepEqual([HD.candidate.source.sha256, HD.candidate.source.reportSha256], [SOURCE.sha256, SOURCE.reportSha256]);
  assert.ok(!/H1|northstar-v2-h1/i.test(JSON.stringify(SPEC)), "no private reference file in the spec");
});

test("only the documented edit types are accepted; undocumented edits and pixel data are rejected", () => {
  assert.deepEqual(Object.keys(EDIT_TYPES), ["remove", "add", "contours"]);
  assert.equal(validateSpec(SPEC, VERTEX_NAMES).ok, true, JSON.stringify(validateSpec(SPEC, VERTEX_NAMES)));
  assert.equal(validateSpec(V1_SPEC, VERTEX_NAMES).ok, true);
  const bad = (mut) => { const s = structuredClone(SPEC); mut(s); return validateSpec(s, VERTEX_NAMES); };
  for (const [label, mut] of [
    ["a pixel edit", (s) => { s.pixels = [{ x: 600, y: 600, rgba: [0, 0, 0, 255] }]; }],
    ["an unknown key in an edit", (s) => { s.remove[0].pixels = [[1, 2]]; }],
    ["an unknown vertex", (s) => { s.contours[0].points[1] = "A99"; }],
    ["a paint field without an integer tone", (s) => { s.add[0].tone = 70.5; }],
    ["a paint field in colour", (s) => { s.add[0].tone = [120, 80, 40]; }],
    ["a contour of one bare point", (s) => { s.contours[0].points = [[600, 600]]; }],
    ["a point outside the sheet", (s) => { s.remove[0].polygon.push([2000, 10]); }],
    ["an extreme bulge", (s) => { s.remove[0].polygon[1].bulge = 3; }],
    ["a missing reason", (s) => { delete s.remove[0].why; }],
    ["another supersampling", (s) => { s.parameters.supersample = 1; }],
  ]) assert.equal(bad(mut).ok, false, label);
  const s = structuredClone(SPEC); s.pixels = [];
  assert.throws(() => buildHybrid({ spec: s, rawPx: RAW, targets: TARGETS }), /invalid edit specification/);
});

test("deterministic rebuild: the tracked generator reproduces the candidate's pixels, its change map and v1's pixels", () => {
  assert.equal(pixelSha256(BUILT.sheetPx), P3.sheet.pixelSha256);
  assert.equal(pixelSha256(decodePng(file(H + "hybrid-v2-sheet.png")).px), P3.sheet.pixelSha256, "the tracked derived sheet holds exactly these pixels");
  assert.equal(pixelSha256(BUILT.changeMapPx), P3.changeMapPixelSha256);
  assert.equal(sha(SPEC_BUF), MANIFEST.parts["2 edits and generator"].specSha256);
  const v1 = buildHybrid({ spec: V1_SPEC, rawPx: RAW, targets: TARGETS });
  assert.equal(pixelSha256(v1.sheetPx), "d6f784d0899a62e40f65092aed308bc431a611732942eac16d0f66e1000e9a58", "hybrid-v1, the prototype, is reproduced unchanged");
  assert.deepEqual([HD.candidate.derivedSheet.pixelSha256, HD.candidate.placedMasterPixelSha256], [P3.sheet.pixelSha256, P3.placedMasterPixelSha256]);
});

test("the change map: every pixel in exactly one category, no unexplained change, untouched pixels keep the raw bytes", () => {
  assert.deepEqual(Object.keys(BUILT.counts), [...CHANGE_CATEGORIES]);
  assert.deepEqual(BUILT.counts, MANIFEST.changeCounts);
  assert.deepEqual(BUILT.counts, HD.candidate.changeCounts);
  assert.equal(Object.values(BUILT.counts).reduce((a, b) => a + b, 0), 1024 * 1024);
  assert.equal(BUILT.counts.other, 0, "no change outside the documented categories");
  assert.ok(BUILT.counts.rawKeptExact > 0.9 * (BUILT.counts.rawKeptExact + BUILT.counts.rawRemoved + BUILT.counts.rawPartlyRemoved + BUILT.counts.rawUnderPainted + BUILT.counts.rawInked), "recorded as traceability, not as a quality claim");
  // far from every edit, the derived sheet is the raw sheet byte for byte (the crown)
  for (let y = 240; y < 400; y++) for (let x = 300; x < 800; x++) { const i = (y * 1024 + x) * 4; for (let c = 0; c < 4; c++) assert.equal(BUILT.sheetPx[i + c], RAW[i + c]); }
  for (const k of CHANGE_CATEGORIES) assert.ok(k in HD.changeCategories, "the contract defines " + k);
});

test("the construction annotation is bound to the drawn geometry and is never a reading", () => {
  const ctx = { specSha256: sha(SPEC_BUF), derivedPixelSha256: P3.sheet.pixelSha256, vertices: BUILT.vertices };
  assert.deepEqual(validateHybridAnnotation(ANN, ctx), { ok: true, problems: [] });
  assert.deepEqual(constructionAnnotation({ spec: SPEC, specSha256: ctx.specSha256, built: BUILT, derivedPixelSha256: ctx.derivedPixelSha256 }), ANN, "the tracked annotation is the generator's output");
  assert.match(ANN.kind, /^CONSTRUCTION/); assert.equal(ANN.reviewStatus, "DRAFT — owner review pending");
  for (const k of ["centreHairline", "leftEarTopJunction", "rightEarTopJunction"]) assert.equal(pixelSha256(cornerCrop(BUILT.sheetPx, ANN.fitPoints[k].xy).px), ANN.fitPoints[k].crop.pixelSha256, k + ": the crop is of the actual rasterised corner");
  const bad = (mut) => { const a = structuredClone(ANN); mut(a); return validateHybridAnnotation(a, ctx).ok; };
  assert.equal(bad((a) => { a.fitPoints.leftEarTopJunction.readings = [{ pass: 1 }, { pass: 2, firstReadingHidden: true }]; }), false, "construction points never carry readings");
  assert.equal(bad((a) => { a.fitPoints.rightEarTopJunction.xy = [760, 770]; }), false, "a point moved off its drawn vertex");
  assert.equal(bad((a) => { a.derivation.derivedPixelSha256 = "0".repeat(64); }), false, "other derived pixels");
  assert.equal(bad((a) => { a.derivation.source.sha256 = "0".repeat(64); }), false, "another source");
  assert.equal(bad((a) => { delete a.fitPoints.centreHairline.crop; }), false, "no crop");
  assert.equal(bad((a) => { a.reviewStatus = "APPROVED"; }), false, "only the defined review statuses");
  assert.equal(bad((a) => { a.validationNote = "the seat fit validates the sheet"; }), false, "a zero residual is never an independent validation");
  assert.match(HD.annotation.notReadings, /D-179's two readings with the first hidden remain a requirement of the raw-sheet method/);
});

test("checks on the ACTUAL derived pixels: raw-sheet H1..H5, HP-LOCK, HP4v2, HP5, HP8, HP-FRAG pass; HP6/HP7 are NOT RUN here", () => {
  const headPx = decodePng(file("tools/avatar/fixtures/r3-head-geometry/r3-head-geometry-g1v3-e2-v1.png")).px;
  const r = runChecks({ built: BUILT, ann: ANN, targets: TARGETS, headPx });
  assert.equal(r.rawSheet.verdict, "PASS_TO_ANNOTATION", JSON.stringify(r.rawSheet));
  assert.ok(r.greyMaxChroma <= 12, "greyscale");
  assert.ok(r.seat.byConstruction && r.seat.residualMaxMasterPx < 1e-9, "the zero residual is a property of the construction");
  assert.ok(r.a4Proposal.offsetFromConstructionSheetPx <= 3, "the A4 proposal finds the drawn apex within its uncertainty");
  assert.deepEqual(r.locks.map((l) => [l.lock, l.ok]), [["leftTempleLock", true], ["rightTempleLock", true]]);
  const byId = Object.fromEntries(r.placed.map((c) => [c.id, c]));
  for (const id of ["HP4", "HP5", "HP8", "HP-FRAG"]) assert.equal(byId[id].ok, true, id + " " + JSON.stringify(byId[id].value));
  for (const id of ["HP6", "HP7"]) { assert.equal(byId[id].ok, null, id + " is not run without the face layer and eyes"); assert.match(byId[id].status, /^NOT RUN/); }
  assert.equal(pixelSha256(r.hairPx), P3.placedMasterPixelSha256, "the placed candidate");
  // the candidate's recorded HP6/HP7 come from local runs with named, hashed inputs — never re-claimed here
  const rec = Object.fromEntries(MANIFEST.checks.placed.map((c) => [c.id, c]));
  assert.deepEqual([rec.HP6.ok, rec.HP7.ok, rec.HP6.value.middleTouchedPx, rec.HP6.value.rightTouchedPx], [true, true, 0, 0]);
  assert.ok(rec.HP6.value.outerEnd.solid / rec.HP6.value.outerEnd.px > 0.6, "the brow's outer end is covered with a margin, not barely");
  assert.match(MANIFEST.checks.localReviewInputs.note, /never re-claimed in CI/);
});

test("ramp B in all eight hair colours keeps the alpha and gives eight distinct renders", () => {
  const headPx = decodePng(file("tools/avatar/fixtures/r3-head-geometry/r3-head-geometry-g1v3-e2-v1.png")).px;
  const hair = runChecks({ built: BUILT, ann: ANN, targets: TARGETS, headPx }).hairPx;
  return import("../../js/avatar-layers.js").then(({ HAIR_COLOR_TOKENS }) => {
    const tokens = Object.keys(HAIR_COLOR_TOKENS); assert.equal(tokens.length, 8);
    const hashes = tokens.map((t) => { const c = applyTonalRampB(hair, HAIR_COLOR_TOKENS[t]); for (let i = 3; i < c.length; i += 4096) assert.equal(c[i], hair[i]); return pixelSha256(c); });
    assert.equal(new Set(hashes).size, 8);
  });
});

test("production gaps stay visible; the candidate is not production-approved", () => {
  assert.match(HD.candidate.reviewStatus, /^REVIEW CANDIDATE — owner visual review pending\. Not a production asset/);
  for (const re of [/face parts are provisional/, /eyes are the v5 prototype/, /U1 is not the finished underlay: it has no ears and no neck/, /nape lock is not authored/, /owner's visual approval of the candidate is pending/]) assert.ok(HD.productionGaps.some((g) => re.test(g)), String(re));
  assert.match(MANIFEST.status, /NOT production-approved/);
});

test("the D-185 register row and the docs: once, directly after D-184, D-184 verbatim, no mojibake", () => {
  const lines = file("docs/project-state.md").toString("utf8").split("\n");
  const row = lines.find((l) => l.startsWith("| **D-185** |"));
  assert.equal(lines.filter((l) => l.startsWith("| **D-185** |")).length, 1);
  assert.equal(lines.findIndex((l) => l.startsWith("| **D-185** |")), lines.findIndex((l) => l.startsWith("| **D-184** |")) + 1);
  for (const needle of ["hybridafledning", "IKKE PRODUKTIONSGODKENDT", SOURCE.sha256, SOURCE.reportSha256, P3.sheet.pixelSha256, P3.placedMasterPixelSha256, "ikke aflæsninger", "procent bevaret er sporbarhed", "IKKE KØRT", "R3 forbliver default OFF"]) assert.ok(row.includes(needle), "the D-185 row carries " + needle);
  assert.ok(!/[ÃÂ]\S|�/.test(row));
  const doc = file("docs/AVATAR_SYSTEM.md").toString("utf8");
  assert.match(doc, /\*\*D-185 \(2026-10-22\)\*\* adopted \*\*hybrid derivation\*\*/);
  assert.match(doc, /hybrid derivation adopted, one review candidate \(r3-hair-hybrid-v2\), not production-approved; no live permission \(D-174 … D-185, as of 2026-10-22\)/);
});
