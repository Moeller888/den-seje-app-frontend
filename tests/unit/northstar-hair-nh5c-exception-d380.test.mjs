// D-380 — the one-time exception for D-379 NH-5C V2, Nakkelokker in grey and brown (northstar-hair-nh5c-exception-d380.mjs,
// exception-d380-v1.json). Static tests, run everywhere: the exception is bound to full hashes of NH-5C's one raw image, its pinned inputs,
// the locked V1 layer, V2's layers and both heads (PNG and the WebP the owner saw in the picker); D-379's thresholds and recorded rejection
// stand; the deviations (P10's shortened tips, G3's ear strands, P13's narrower locks) are recorded against the unchanged limits; the tool
// calls nothing. The rebuild itself needs the private images and the vendored libwebp (the WebP heads), so it is checked by the tool's
// command line — it exits 1 unless every output is byte for byte the bound file — not by a unit test (D-094). 0 image calls.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as C from "../../tools/avatar/northstar-hair-nh5c.mjs";
import * as X from "../../tools/avatar/northstar-hair-nh5c-exception-d380.mjs";

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = resolve(HERE, "..", ".."), repoFile = (rel) => join(REPO, ...rel.split("/"));
const FX = "tools/avatar/fixtures/northstar-hair-d379/", TOOL_REL = "tools/avatar/northstar-hair-nh5c-exception-d380.mjs", DECISION_REL = "docs/decisions/D-380.md";
const json = (rel) => JSON.parse(readFileSync(repoFile(rel), "utf8"));
const EX = json(X.FIXTURE), AUTH = json(FX + "authorisation-nh5c-v1.json"), PLAN = json(FX + "plan-nh5c-v1.json"), DECISION = readFileSync(repoFile(DECISION_REL), "utf8");
const D379 = readFileSync(repoFile("docs/decisions/D-379.md"), "utf8");
const SRC = readFileSync(repoFile(TOOL_REL), "utf8"), CODE = SRC.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
const hex = /^[0-9a-f]{64}$/;
const sorted = (a) => [...a].sort();

test("D-380 exception: one call, the two variants the owner tried, bound to full hashes of the raw image, the locked V1 layer, V2's layers and both heads (PNG and WebP); nothing tracked, nothing activated", () => {
  assert.equal(X.FIXTURE, FX + "exception-d380-v1.json");
  assert.deepEqual([EX.decision, EX.relatesTo, EX.callId, EX.kind, EX.newImageCall, EX.tool, EX.neverPromoted], ["D-380", "D-379", AUTH.callId, "ONE_TIME_EXCEPTION", false, TOOL_REL, true]);
  assert.match(EX.status, /NOT APPROVED, NOT PROMOTED, NOT ACTIVATED/); assert.match(EX.activation, /activates nothing/); assert.match(EX.ownerVisualApproval, /^2026-11-17/);
  assert.deepEqual(EX.inputs.map((i) => i.role), ["raw", "base", "ear", "nh4"]);
  for (const i of EX.inputs) { assert.match(i.sha256, hex, i.role); assert.equal(i.tracked, false, i.role); }
  assert.equal(EX.inputs[0].sha256, AUTH.call.result.image.sha256, "the raw image is NH-5C's one returned image");
  const post = Object.fromEntries(PLAN.post.inputs.map((i) => [i.name, i.sha256]));
  for (const role of ["base", "ear", "nh4"]) { const i = EX.inputs.find((j) => j.role === role); assert.equal(i.sha256, post[i.name], role + " is D-379's pinned post input"); }
  assert.deepEqual(Object.keys(EX.outputs), ["v1GreyLayer", "greyLayer", "brownLayer", "greyHeadPng", "brownHeadPng", "greyHeadWebp", "brownHeadWebp"]);
  for (const [k, o] of Object.entries(EX.outputs)) { assert.match(o.sha256, hex, k); assert.equal(o.tracked, false, k); assert.equal(o.bound, true, k); }
  assert.equal(new Set(Object.values(EX.outputs).map((o) => o.sha256)).size, 7);
  assert.deepEqual(sorted([EX.outputs.greyHeadWebp.name, EX.outputs.brownHeadWebp.name]), ["head-nh5c-v2-brown.webp", "head-nh5c-v2-grey.webp"]);
  for (const s of [...EX.inputs, ...Object.values(EX.outputs)].map((o) => o.sha256)) assert.ok(DECISION.includes(s), "D-380 names " + s);
  assert.deepEqual([EX.rebuild.runs, EX.rebuild.byteIdentical, EX.rebuild.matchesTrialHeads], [2, true, true]);
  assert.deepEqual(X.bindingMismatches(EX, Object.fromEntries(Object.keys(EX.outputs).map((k) => [k, undefined]))).length, 7, "a build without the files is refused");
});

test("D-380 exception: D-379's thresholds, its pinned tool and its recorded rejection stand unchanged; the raw image's own checks are not re-scored", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(C.GATES)), PLAN.post.gates, "D-379's gates are the plan's");
  assert.equal(PLAN.method.files["tools/avatar/northstar-hair-nh5c.mjs"], AUTH.frozen.methodFiles["tools/avatar/northstar-hair-nh5c.mjs"]);
  assert.match(SRC, /import \* as C from "\.\/northstar-hair-nh5c\.mjs"/); assert.ok(!/GATES\s*=|DRESS_GATES\s*=/.test(CODE), "the exception defines no threshold of its own");
  assert.match(CODE, /C\.postProcessC\(/, "V2 starts from the locked extraction, run unchanged");
  const x = AUTH.call.result.extractionV1, H = EX.historical;
  assert.deepEqual([AUTH.call.mandateState, x.verdict, x.thresholdsUnchanged, AUTH.call.result.assessment], ["SPENT", "REJECTED", true, "EXTRACTION_V1_REJECTED"]);
  assert.deepEqual([H.extractionV1.failed, H.extractionV1.passed, H.extractionV1.assessment], [x.failed, x.passed, AUTH.call.result.assessment]);
  const r = H.rawImageChecks, k = x.checks;
  assert.deepEqual([r.P3rawOnBrowsPx, r.P4rawOnEarsPx, r.P4rawOverFacePx, r.P9spillShare, r.P11largestSpillClusterPx], [k.P3.rawOnBrowsPx, k.P4.rawOnEarsPx, k.P4.rawOverFacePx, k.P9.spillShare, k.P11.largestSpillClusterPx]);
  assert.match(D379, /EXTRACTION_V1_REJECTED|afvist/i, "D-379 still records the rejection");
});

test("D-380 deviations: P10's shortened tips (92 px), G3's ear strands (66 px) and P13's narrower locks (22.1 % / 22.8 %) fail D-379's unchanged limits and are recorded, not hidden", () => {
  const v = EX.v2, Gt = C.GATES;
  assert.deepEqual(sorted(v.layerChecksFailed), sorted(["P5", "P8", "P10", "P12", "P13"]));
  for (const p of v.layerChecksFailed) assert.ok(p in EX.exceptedChecks, p + " is named as excepted");
  assert.deepEqual(sorted(Object.keys(EX.exceptedChecks)), sorted(["P5", "P8", "P10", "P12", "P13", "G3"]));
  assert.deepEqual([v.P10.longestRun, v.P10.cutEdgePx, v.P10.maxRun], [92, 265, Gt.P10.maxRun]); assert.ok(v.P10.longestRun > Gt.P10.maxRun);
  assert.deepEqual([v.P13.left.shown, v.P13.right.shown, v.P13.min, v.P13.shownPx, v.P13.lockZonePx], [0.221, 0.2282, Gt.P13.min, 1631, 7263]);
  const k = AUTH.call.result.extractionV1.checks; assert.deepEqual([v.P13.left.shown, v.P13.right.shown, v.P13.left.lowestY], [k.P13.left.shown, k.P13.right.shown, k.P13.left.lowestY], "P13 is the raw image's, as in V1");
  assert.equal(v.P12.largestHolePx, k.P12.largestHolePx, "P12's hole is V1's");
  assert.ok(v.P5.largestShare < Gt.P5.min && v.P8.iou.design < Gt.P8.minDesign);
  for (const t of ["T-shirt", "tanktop", "sweater"]) {
    const a = v.assembly;
    assert.deepEqual([a.G1_locksOverClothesPx[t], a.G2_opaqueEarPxChanged[t], a.G3_facePxChangedOutsideTheEarStrands[t], a.G4_changedOutsideHairPx[t]], [0, 0, 0, 0], t);
    assert.equal(a.G3_facePxChangedByTheEarStrands[t], EX.adjust.counts.earStrandFrontPx, t + ": G3 counts exactly the ear strands");
    assert.ok(a.G6_minGapToClothesPx[t] >= 20, t + ": room to the collar");
  }
  assert.ok(v.P3layer.gapPx.left >= Gt.P3.minGap && v.P3layer.gapPx.right >= Gt.P3.minGap && v.P3layer.layerOnBrowsPx === 0 && v.P3layer.layerOnEyesPx === 0);
  assert.deepEqual([v.P4layer.layerOnEarsPx, v.P4layer.earOpaqueSame, v.P4layer.layerBelowJawlinePx], [0, v.P4layer.earOpaque, 0]);
  assert.deepEqual([X.ADJUST.brows.shiftUpPx, X.ADJUST.brows.sideShiftPx, X.ADJUST.earStrands.columns.map((c) => [...c]), [...X.ADJUST.earStrands.rows]], [EX.adjust.browShiftUpPx, EX.adjust.browSideShiftPx, EX.adjust.earStrandColumns, EX.adjust.earStrandRows]);
  assert.equal(X.ADJUST.earStrands.rows[0], C.EAR_TOP);
  const f = EX.finished; assert.deepEqual([f.alphaDiffGreyVsBrownPx, f.greyLayerNonNeutralPx, f.earOpaqueIdenticalBrown, f.earOpaqueIdenticalGrey], [0, 0, f.earOpaquePx, f.earOpaquePx]);
  const p = EX.pickerCheck.perFigure;
  assert.deepEqual([EX.pickerCheck.pageErrors, p.headOpaquePxNotTheBoundHead, p.earOpaqueChangedPx, p.earSoftEdgeDiffersWithoutHairBehindPx, p.belowY430DiffersFromNH4Px], [0, 0, 0, 0, 0]);
});

test("the D-380 tool calls nothing: no fetch, no key, no randomness, no clock, no environment; it reads only node built-ins and the locked avatar tools", () => {
  for (const re of [/\bfetch\s*\(/, /https?:\/\//, /OPENAI/, /process\.env/, /Math\.random/, /Date\.now|new Date/]) assert.ok(!re.test(CODE), "the tool uses " + re);
  const specs = [...CODE.matchAll(/^\s*import\b[^;]*?from\s+"([^"]+)"/gm)].map((m) => m[1]);
  assert.equal(specs.length, 14, "the imports are found");
  assert.deepEqual([...CODE.matchAll(/\bimport\(/g)].length, 1, "one dynamic import: the app's own js/avatar-layers.js");
  assert.match(CODE, /import\(pathToFileURL\(join\(ROOT, "js", "avatar-layers\.js"\)\)\.href\)/);
  const allowed = ["node:fs", "node:path", "node:url", "node:crypto", "node:child_process", "node:os", "./northstar-hair-nh5c.mjs", "./northstar-hair-nh5.mjs", "./northstar-hair-template-d371.mjs", "./r3-northstar-figure.mjs", "./r3-northstar-layers.mjs", "./r3-hair-tool-v2.mjs", "./northstar-hair-nh4-post.mjs", "./build-northstar-hair-heads-d373.mjs"];
  for (const s of specs) assert.ok(allowed.includes(s), s);
  assert.match(CODE, /the images and the output stay outside the repository/); assert.match(CODE, /is not the pinned file/); assert.match(CODE, /not the excepted heads/);
});

test("D-380 decision file: the exception, its bound hashes, the deviations, the picker check and the stop before activation", () => {
  assert.match(DECISION, /^---\nd: D-380\n/);
  for (const s of ["D-379", "92 px", "66 px", "22,1 %", "22,8 %", "T-shirt", "tanktop", "sweater", "5.065", "321", "y 430", "16 px"]) assert.ok(DECISION.includes(s), s);
  assert.match(DECISION, /aktiver/i);
});
