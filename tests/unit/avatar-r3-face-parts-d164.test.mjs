// D-164 — the parts method for r3-face-neutral in the R3 contract: exactly what was added, the pinned files it names,
// the owner-approved target points, and that it authorises nothing (no call, no permission, no budget change, R3 OFF).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { preD164Contract, PRE_D164_CONTRACT_CANONICAL_SHA256, preD163Contract, PRE_D163_CONTRACT_CANONICAL_SHA256, D164_ADDED_OPERATION } from "./avatar-r3-d147-closure.mjs";
import { LAYOUT, PART_POINTS, MODES } from "../../tools/avatar/r3-face-parts-tool.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const file = (rel) => readFileSync(join(REPO, ...rel.split("/")));
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const LIVE = JSON.parse(file("tools/avatar/fixtures/r3/r3-shadow-contract-v1.json").toString("utf8"));
const PRE = preD164Contract(LIVE);
const S = LIVE.faceNeutralPartsMethod;
const REGISTER = file("docs/project-state.md").toString("utf8");
const ROW = REGISTER.split("\n").find((l) => l.startsWith("| **D-164** |"));
const D163_ROW_SHA = "800293b0d9656e1e9e67fdf21390f7a1dfc4f945782b7b38d2d84efbcbcf763b";
const TARGETS = JSON.parse(file(S.targets.file).toString("utf8"));

test("D-164 adds exactly the parts method: the contract at the D-163 merge is reproduced canonically", () => {
  assert.equal(sha256(JSON.stringify(PRE)), PRE_D164_CONTRACT_CANONICAL_SHA256);
  assert.equal(sha256(JSON.stringify(preD163Contract(LIVE))), PRE_D163_CONTRACT_CANONICAL_SHA256, "and the older chain still holds");
  assert.deepEqual(Object.keys(LIVE).filter((k) => !(k in PRE)), ["faceNeutralPartsMethod"]);
  assert.deepEqual(LIVE.deterministicOperations.slice(0, -1), PRE.deterministicOperations);
  assert.equal(LIVE.deterministicOperations.at(-1).op, D164_ADDED_OPERATION);
  assert.deepEqual([PRE.assets[4].method, LIVE.assets[4].method, LIVE.assets[4].calls], ["generated", "generated-parts-sheet+point-anchored-composition", 2]);
});

test("D-164 authorises nothing: no call entry, no live permission, no budget or counter change, R3 OFF", () => {
  assert.deepEqual([S.isAuthorisation, S.authorisesImageRequest, S.authorisesUpload], [false, false, false]);
  assert.deepEqual(LIVE.authorisedCalls, PRE.authorisedCalls);
  assert.deepEqual(LIVE.adapterImplementations, PRE.adapterImplementations);
  assert.deepEqual(LIVE.authorisedCalls.calls.filter((e) => e.mandateState === "UNSPENT"), []);
  assert.deepEqual(LIVE.imageCallBudget, PRE.imageCallBudget);
  assert.deepEqual([LIVE.imageCallBudget.callsActuallySentSoFar.faceNeutral, LIVE.imageCallBudget.callsActuallySentSoFar.underlay], [2, 5]);
  assert.deepEqual(LIVE.prohibitions, PRE.prohibitions);
  assert.equal(LIVE.meta.authorisesImageRequest, false);
  assert.equal(LIVE.architecture.defaultEnabled, false);
  assert.ok(!/AVATAR_R3\s*=\s*true/.test(file("js/avatar-layers.js").toString("utf8")), "R3 stays OFF at runtime");
  assert.match(S.budget, /adds no planned call/);
  for (const k of ["layerContract", "zModel", "faceNeutralPreparation", "faceNeutralGuideBPreparation"]) assert.deepEqual(LIVE[k], PRE[k], k + " is unchanged");
});

test("the pinned files exist and match: targets, prompt, annotation schema, and the CLI's own targets pin", () => {
  assert.equal(sha256(file(S.targets.file)), S.targets.sha256);
  assert.equal(sha256(file(S.prompt.file)), S.prompt.sha256);
  assert.equal(file(S.prompt.file).length, S.prompt.bytes);
  assert.equal(sha256(file(S.annotation.schemaFile)), S.annotation.schemaSha256);
  const cli = file(S.tools.cli).toString("utf8");
  assert.equal(/TARGETS_SHA256 = "([0-9a-f]{64})"/.exec(cli)[1], S.targets.sha256, "the CLI pins the same targets file");
  assert.match(cli, new RegExp(S.targets.file.replace(/[./]/g, "\\$&")));
  for (const k of ["library", "cli", "test"]) assert.ok(existsSync(join(REPO, ...S.tools[k].split("/"))), S.tools[k]);
  assert.match(S.prompt.status, /^FROZEN DRAFT — not a request/);
  assert.match(file(S.prompt.file).toString("utf8"), /the mouth line is TILTED: its right end is clearly higher/);
});

test("the target points: owner-approved, identical in contract and file, six measured and two reconstructed", () => {
  assert.deepEqual([TARGETS.status, TARGETS.version, TARGETS.approval.decision, TARGETS.approval.approvedBy, TARGETS.approval.approvedOn], ["APPROVED", S.targets.version, "D-164", "owner", "2026-10-19"]);
  assert.deepEqual([S.targets.status, S.targets.approvedBy, S.targets.approvedOn], ["APPROVED", "owner", "2026-10-19"]);
  for (const part of LAYOUT.order) for (const k of PART_POINTS[part]) assert.deepEqual(TARGETS.points[part][k].xy, S.targets.points[part][k], `${part}.${k}`);
  const kinds = Object.values(TARGETS.points).flatMap((p) => Object.values(p).map((x) => x.kind));
  assert.deepEqual([kinds.filter((k) => k === "MEASURED_ANNOTATION").length, kinds.filter((k) => k === "RECONSTRUCTED_DESIGN").length], [6, 2]);
  assert.deepEqual(Object.values(TARGETS.points.browLeft).map((p) => p.kind), ["RECONSTRUCTED_DESIGN", "RECONSTRUCTED_DESIGN"]);
  for (const p of Object.values(TARGETS.points.browLeft)) assert.match(p.rationale, /NOT measured|not a measurement/);
  assert.equal(TARGETS.reference.sha256, "3daf32e76bff9a53ec7d25cf148a230073cfd0da6a003d02a23c4292d139ff50");
  assert.match(TARGETS.reference.readingMethod, /No automatic feature extraction/);
});

test("the author operation and the checks: uniform scale + translation only, residual review-only, the envelope stays binding", () => {
  const op = S.authorOperation;
  for (const x of ["rotation", "per-axis scale", "shear", "inpainting, reconstruction or pixel repair", "a crop to pass a check", "stray-pixel or matte removal"]) assert.ok(op.excluded.includes(x), x);
  assert.ok(op.excluded.some((x) => /^reflection/.test(x)) && op.excluded.some((x) => /^warp/.test(x)));
  assert.match(op.bboxRole, /never set s or t/);
  assert.match(op.residualPolicy.decision, /^REVIEW-ONLY/);
  assert.match(op.residualPolicy.noThreshold, /No numeric residual limit rejects a composition/);
  assert.match(op.orientation, /never rotated or deformed/);
  assert.equal(S.checks.rawSheet.binding.length, 5);
  assert.match(S.checks.rawSheet.globalEnvelopeNotApplied, /never applied to a parts sheet/);
  assert.match(S.checks.composedLayer.binding, /AUTO-1\.\.5, including the broad envelope \[384, 230, 632, 412\] as a binding technical rejection/);
  assert.match(S.rawOutputRule, /stays in force unchanged: the raw sheet is never written/);
  assert.deepEqual(S.rawSheet.layout.cells, Object.fromEntries(Object.entries(LAYOUT.cells).map(([k, v]) => [k, [...v]])));
  assert.deepEqual(S.rawSheet.layout.compositingOrder, [...LAYOUT.order]);
  assert.deepEqual(MODES.production, { annotation: ["APPROVED"], targets: ["APPROVED"] }, "production accepts owner approval only");
});

test("the tools have no network, credential or claim path; the library writes no file", () => {
  const lib = file(S.tools.library).toString("utf8"), cli = file(S.tools.cli).toString("utf8");
  for (const src of [lib, cli]) {
    assert.ok(!/\bfetch\s*\(|node:https?|node:net|OPENAI|API_KEY|\.claim\.json|one-shot-claims/.test(src));
    assert.ok(!/child_process/.test(src));
  }
  assert.ok(!/node:fs/.test(lib), "the library imports no file system module");
  assert.match(cli, /OUT_NOT_IN_BUILD/); assert.match(cli, /TARGETS_NOT_PINNED/); assert.match(cli, /OUT_EXISTS/);
});

test("the D-164 register row: once, directly after D-163, D-163 verbatim, the decisions named, no mojibake", () => {
  const lines = REGISTER.split("\n");
  assert.equal(lines.filter((l) => l.startsWith("| **D-164** |")).length, 1);
  assert.equal(lines.findIndex((l) => l.startsWith("| **D-164** |")), lines.findIndex((l) => l.startsWith("| **D-163** |")) + 1);
  assert.equal(sha256(lines.find((l) => l.startsWith("| **D-163** |"))), D163_ROW_SHA, "D-163 is not rewritten");
  for (const needle of [S.targets.sha256, S.prompt.sha256, S.annotation.schemaSha256, S.targets.file, S.tools.library, S.tools.cli,
    "(534,0; 269,5)", "(397,3; 272,5)", "(550,5; 380,0)", "rekonstrueret design", "kun review", "[384, 230, 632, 412]", "Ingen billedanmodning",
    "`callsActuallySentSoFar.faceNeutral` forbliver **2**", "R3 forbliver default OFF"]) assert.ok(ROW.includes(needle), "the D-164 row carries " + JSON.stringify(needle));
  assert.ok(!/[ÃÂ]\S|�/.test(ROW), "no mojibake in the Danish row");
});
