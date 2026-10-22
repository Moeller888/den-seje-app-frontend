// D-169 — the eyes method in the R3 contract: exactly what was added, the pinned files it names, the DRAFT target points,
// the thresholds as the tool enforces them, and that it authorises nothing (no call, no permission, no budget change, R3 OFF).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { preD170Contract, preD169Contract, PRE_D169_CONTRACT_CANONICAL_SHA256, preD168Contract, PRE_D168_CONTRACT_CANONICAL_SHA256, preD164Contract, PRE_D164_CONTRACT_CANONICAL_SHA256, D169_ADDED_OPERATION } from "./avatar-r3-d147-closure.mjs";
import { THRESHOLDS, EYE_ZONES, IRIS_TOKEN, MODES, EYES, FIT_POINTS, CHECK_POINTS } from "../../tools/avatar/r3-eyes-tool.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const file = (rel) => readFileSync(join(REPO, ...rel.split("/")));
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
// D-170 later approved the eye targets (a new pinned version) and authorised call A. NOW is the contract as it is; LIVE is
// the contract exactly as D-169 left it (D-170's changes removed, proven canonical in avatar-r3-eyes-fixed-send-d170.test.mjs).
const NOW = JSON.parse(file("tools/avatar/fixtures/r3/r3-shadow-contract-v1.json").toString("utf8"));
const LIVE = preD170Contract(NOW);
const PRE = preD169Contract(LIVE);
const S = LIVE.eyesPartsMethod;
const REGISTER = file("docs/project-state.md").toString("utf8");
const ROW = REGISTER.split("\n").find((l) => l.startsWith("| **D-169** |"));
const D168_ROW_SHA = "773a0cfbd865cb6b6070819124e1d7d02e61d408427e63b23a54a97c2c0ec823"; // the D-168 row at the D-168 merge
const TARGETS = JSON.parse(file(S.targets.file).toString("utf8"));

test("D-169 adds exactly the eyes method: the contract at the D-168 merge is reproduced canonically", () => {
  assert.equal(sha256(JSON.stringify(PRE)), PRE_D169_CONTRACT_CANONICAL_SHA256);
  assert.equal(sha256(JSON.stringify(preD168Contract(LIVE))), PRE_D168_CONTRACT_CANONICAL_SHA256, "and the older chain still holds");
  assert.equal(sha256(JSON.stringify(preD164Contract(LIVE))), PRE_D164_CONTRACT_CANONICAL_SHA256);
  assert.deepEqual(Object.keys(LIVE).filter((k) => !(k in PRE)), ["eyesPartsMethod"]);
  assert.deepEqual(LIVE.deterministicOperations.slice(0, -1), PRE.deterministicOperations);
  assert.equal(LIVE.deterministicOperations.at(-1).op, D169_ADDED_OPERATION);
  assert.deepEqual([PRE.assets[5].method, LIVE.assets[5].method, LIVE.assets[5].calls], ["generated", "generated-eyes-sheet+anchored-composition", 1]);
  assert.deepEqual(LIVE.assets[6], PRE.assets[6], "the iris asset keeps D-136's method and one call");
  assert.equal(LIVE.assets[6].method, LIVE.irisContract.method.assetMethod);
});

test("D-169 authorises nothing: no call entry, no live permission, no budget or counter change, R3 OFF", () => {
  assert.deepEqual([S.isAuthorisation, S.authorisesImageRequest, S.authorisesUpload], [false, false, false]);
  for (const k of ["authorisedCalls", "adapterImplementations", "imageCallBudget", "prohibitions", "irisContract", "zModel", "layerContract", "productionOrder", "faceNeutralPreparation", "faceNeutralPartsMethod", "faceNeutralPartsExtension"]) assert.deepEqual(LIVE[k], PRE[k], k + " is unchanged");
  assert.deepEqual(LIVE.authorisedCalls.calls.filter((e) => e.mandateState === "UNSPENT"), []);
  assert.deepEqual([LIVE.imageCallBudget.callsActuallySentSoFar.faceNeutral, LIVE.imageCallBudget.callsActuallySentSoFar.underlay], [4, 5]);
  assert.equal(LIVE.meta.authorisesImageRequest, false);
  assert.equal(LIVE.architecture.defaultEnabled, false);
  assert.ok(!/AVATAR_R3\s*=\s*true/.test(file("js/avatar-layers.js").toString("utf8")), "R3 stays OFF at runtime");
  assert.match(S.budget, /adds no call and changes no budget figure or counter/);
  assert.match(S.budget, /no planned capacity for a retake/);
  for (const x of ["an image request or upload", "a call-id or claim", "a send adapter", "the DRAFT eye target points"]) assert.ok(S.notApproved.includes(x), x);
});

test("the pinned files exist and match: targets, both prompts, the annotation schema, and the CLI's own targets pin", () => {
  assert.equal(sha256(file(S.targets.file)), S.targets.sha256);
  for (const k of ["eyesFixed", "iris"]) {
    const p = S.rawSheets[k].prompt;
    assert.equal(sha256(file(p.file)), p.sha256, k);
    assert.equal(file(p.file).length, p.bytes, k);
    assert.match(p.status, /^FROZEN DRAFT — not a request/);
    assert.match(p.plannedInput, /3daf32e76bff9a53ec7d25cf148a230073cfd0da6a003d02a23c4292d139ff50/);
    assert.ok(!/DRAFT v0|NOT FROZEN/.test(file(p.file).toString("utf8")), "no review header is sent to the model");
  }
  assert.match(S.rawSheets.iris.prompt.plannedInput, /never the eyes-fixed sheet \(U4\)/);
  assert.match(file(S.rawSheets.eyesFixed.prompt.file).toString("utf8"), /everything inside the dark iris ring, except the white highlight, must be fully transparent/);
  assert.match(file(S.rawSheets.iris.prompt.file).toString("utf8"), /pure neutral grey: red = green = blue/);
  assert.equal(sha256(file(S.annotation.schemaFile)), S.annotation.schemaSha256);
  const cli = file(S.tools.cli).toString("utf8");
  // D-170 moved the CLI's production pin from D-169's DRAFT v1 to the approved v2; it always pins the contract's current targets.
  assert.equal(/TARGETS_SHA256 = "([0-9a-f]{64})"/.exec(cli)[1], NOW.eyesPartsMethod.targets.sha256, "the CLI pins the contract's current targets file");
  for (const k of ["library", "cli", "test", "syntheticFixtures"]) assert.ok(existsSync(join(REPO, ...S.tools[k].split(" ")[0].split("/"))), S.tools[k]);
});

test("the target points are DRAFT, identical in contract and file, with four fit anchors and two check points", () => {
  assert.deepEqual([TARGETS.status, S.targets.status, TARGETS.version, TARGETS.approval.decision, TARGETS.approval.recordedBy], ["DRAFT", "DRAFT", S.targets.version, null, "D-169"]);
  for (const e of EYES) for (const k of [...FIT_POINTS, ...CHECK_POINTS]) assert.deepEqual(TARGETS.points[e][k].xy, S.targets.points[e][k], `${e}.${k}`);
  assert.deepEqual(EYES.flatMap((e) => FIT_POINTS.map((k) => TARGETS.points[e][k].role)), ["FIT", "FIT", "FIT", "FIT"]);
  assert.deepEqual(EYES.map((e) => TARGETS.points[e].innerCorner.role), ["CHECK", "CHECK"]);
  assert.deepEqual([TARGETS.points.eyeLeft.ringCentre.xy, TARGETS.points.eyeRight.ringCentre.xy], [[448.8, 321.7], [571.0, 320.6]]);
  assert.equal(TARGETS.reference.sha256, "3daf32e76bff9a53ec7d25cf148a230073cfd0da6a003d02a23c4292d139ff50");
  assert.deepEqual(MODES.production, { annotation: ["APPROVED"], targets: ["APPROVED"] }, "production accepts owner approval only");
});

test("the contract's thresholds, zones and token are exactly what the tool enforces", () => {
  assert.deepEqual(S.thresholds, JSON.parse(JSON.stringify(THRESHOLDS)));
  assert.deepEqual(JSON.parse(JSON.stringify(EYE_ZONES)), { eyeZones: LIVE.faceNeutralPreparation.areaModel.excludedZones.eyeZones, foldZones: LIVE.faceNeutralPreparation.areaModel.excludedZones.foldZones });
  assert.deepEqual([IRIS_TOKEN.name, IRIS_TOKEN.hex], [LIVE.irisContract.token.name, LIVE.irisContract.token.value]);
  assert.match(S.thresholdRule, /fixed here BEFORE any eyes call/);
  assert.deepEqual([S.checks.eyesFixedSheet.binding.length, S.checks.irisSheet.binding.length, S.checks.placement.binding.length], [5, 5, 6]);
  assert.match(S.checks.notReused, /\[384, 230, 632, 412\]/);
  assert.match(S.checks.lowAlphaRule, /alpha 1\.\.15 is reported only/);
  assert.match(S.checks.firstFailure, /Nothing is cropped, moved or repaired/);
});

test("the clarifications U1..U6 are binding, U7 is an open review item, and no D-164 permission transfers", () => {
  assert.equal(S.clarifications.binding, true);
  assert.deepEqual(Object.keys(S.clarifications).filter((k) => /^U\d$/.test(k)), ["U1", "U2", "U3", "U4", "U5", "U6"]);
  assert.match(S.clarifications.U4, /ONLY Northstar Master v2/);
  assert.match(S.clarifications.U6, /<= 12/);
  assert.match(S.openReviewItems.U7, /No target changes now/);
  assert.match(S.relationToEarlierDecisions, /NOT extended to the eyes/);
  assert.ok(S.authorOperation.excluded.includes("a separate transform per eye"));
  assert.ok(S.authorOperation.excluded.includes("recolouring or desaturating the iris"));
  assert.match(S.authorOperation.bboxRole, /never set a transform/);
});

test("the tools have no network, credential or claim path; the library writes no file", () => {
  const lib = file(S.tools.library).toString("utf8"), cli = file(S.tools.cli).toString("utf8");
  for (const src of [lib, cli]) {
    assert.ok(!/\bfetch\s*\(|node:https?|node:net|OPENAI|API_KEY|\.claim\.json|one-shot-claims/.test(src));
    assert.ok(!/child_process/.test(src));
  }
  assert.ok(!/node:fs/.test(lib), "the library imports no file system module");
  for (const code of ["OUT_NOT_IN_BUILD", "TARGETS_NOT_PINNED", "OUT_EXISTS"]) assert.match(cli, new RegExp(code));
});

test("the D-169 register row: once, directly after D-168, the decisions named, no mojibake", () => {
  const lines = REGISTER.split("\n");
  assert.equal(lines.filter((l) => l.startsWith("| **D-169** |")).length, 1);
  assert.equal(lines.findIndex((l) => l.startsWith("| **D-169** |")), lines.findIndex((l) => l.startsWith("| **D-168** |")) + 1);
  assert.equal(sha256(lines.find((l) => l.startsWith("| **D-168** |"))), D168_ROW_SHA, "D-168 is not rewritten");
  for (const needle of [S.targets.sha256, S.rawSheets.eyesFixed.prompt.sha256, S.rawSheets.iris.prompt.sha256, S.annotation.schemaSha256, S.targets.file, S.tools.library, S.tools.cli,
    "(448,8; 321,7)", "(571,0; 320,6)", "(402,0; 310,0)", "(617,0; 312,0)", "DRAFT", "U7", "Ingen billedanmodning", "ingen plads til et omkald",
    "`callsActuallySentSoFar.faceNeutral` forbliver **4**", "R3 forbliver default OFF"]) assert.ok(ROW.includes(needle), "the D-169 row carries " + JSON.stringify(needle));
  assert.ok(!/[ÃÂ]\S|�/.test(ROW), "no mojibake in the Danish row");
});
