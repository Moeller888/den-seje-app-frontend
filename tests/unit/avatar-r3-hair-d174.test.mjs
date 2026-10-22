// D-174 — the hair method in the R3 contract: exactly what was added and changed, the pinned files it names, the APPROVED
// placement targets (a byte-identical copy of the v2 review anchors, no coordinate changed), the unknown source anchors,
// colour method B as planned but NOT wired to any runtime, and that it authorises nothing (no call, budget unchanged, R3 OFF).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { preD174Contract, PRE_D174_CONTRACT_CANONICAL_SHA256, preD173Contract, PRE_D173_CONTRACT_CANONICAL_SHA256, D174_ADDED_OPERATION, PRE_D174, preD175Contract } from "./avatar-r3-d147-closure.mjs";
import { FIT_POINTS, CHECK_POINTS, RAMP_B } from "../../tools/avatar/r3-hair-tool.mjs";
import { HAIR_COLOR_TOKENS, DEFAULT_HAIR_COLOR } from "../../js/avatar-layers.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const file = (rel) => readFileSync(join(REPO, ...rel.split("/")));
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
// D-175 later authorised the one hair call (an authorisedCalls entry, its implementation, a hair axis, the frozen prompt).
// LIVE is the contract exactly as D-174 left it (D-175's changes removed, proven canonical in avatar-r3-hair-send-d175.test.mjs).
const LIVE = preD175Contract(JSON.parse(file("tools/avatar/fixtures/r3/r3-shadow-contract-v1.json").toString("utf8")));
const PRE = preD174Contract(LIVE);
const S = LIVE.hairMethod;
const TARGETS = JSON.parse(file(S.targets.file).toString("utf8"));
const SOURCE = JSON.parse(file(S.targets.sourceFile).toString("utf8"));
const REGISTER = file("docs/project-state.md").toString("utf8");
const ROW = REGISTER.split("\n").find((l) => l.startsWith("| **D-174** |"));

test("D-174 adds exactly the hair method: the contract at the D-173 commit is reproduced canonically", () => {
  assert.equal(sha256(JSON.stringify(PRE)), PRE_D174_CONTRACT_CANONICAL_SHA256);
  assert.equal(sha256(JSON.stringify(preD173Contract(LIVE))), PRE_D173_CONTRACT_CANONICAL_SHA256, "and the older chain still holds");
  assert.deepEqual(Object.keys(LIVE).filter((k) => !(k in PRE)), ["hairMethod"]);
  assert.deepEqual(LIVE.deterministicOperations.slice(0, -1), PRE.deterministicOperations);
  assert.equal(LIVE.deterministicOperations.at(-1).op, D174_ADDED_OPERATION);
  assert.match(LIVE.deterministicOperations.at(-1).how, /OFFLINE ONLY: no renderer uses it/);
  assert.deepEqual([PRE.assets[8].method, LIVE.assets[8].method, LIVE.assets[8].calls, LIVE.assets[8].name], [PRE_D174.asset8Method, "generated-hair-sheet+anchored-composition", 1, "r3-hair-northstar"]);
  for (const i of [13, 14]) assert.deepEqual(LIVE.assets[i], PRE.assets[i], "afro and short are not covered");
  const lh = LIVE.layerContract.slots.find((s) => s.slot === "hair"), zh = LIVE.zModel.slots.find((s) => s.slot === "hair");
  assert.match(lh.blend, /^tonal ramp B over the hair token \(D-174\).*no multiply — PLANNED, not wired to any runtime$/);
  assert.match(zh.note, /^tonal ramp B over the hair token \(D-174; planned, not wired to any runtime\)$/);
  assert.equal(zh.z, 40, "the hair stays at z 40");
  assert.deepEqual(LIVE.layerContract.paintOrder, PRE.layerContract.paintOrder);
});

test("D-174 authorises nothing: no call entry, no live permission, no budget or counter change, R3 OFF", () => {
  assert.deepEqual([S.isAuthorisation, S.authorisesImageRequest, S.authorisesUpload], [false, false, false]);
  for (const k of ["authorisedCalls", "adapterImplementations", "imageCallBudget", "prohibitions", "irisContract", "hairstyleContract", "productionOrder", "productionOrderConstraints", "eyesPartsMethod", "eyesFixedRetakePreparation", "faceNeutralPartsMethod"]) assert.deepEqual(LIVE[k], PRE[k], k);
  assert.deepEqual(LIVE.authorisedCalls.calls.filter((e) => e.mandateState === "UNSPENT"), []);
  assert.deepEqual([LIVE.imageCallBudget.minimum, LIVE.imageCallBudget.maximum], [23, 24]);
  const sent = LIVE.imageCallBudget.callsActuallySentSoFar;
  assert.deepEqual([sent.underlay, sent.faceNeutral, sent.eyesFixed], [5, 4, 2]);
  assert.equal(LIVE.meta.authorisesImageRequest, false);
  assert.equal(LIVE.architecture.defaultEnabled, false);
  assert.ok(!/AVATAR_R3\s*=\s*true/.test(file("js/avatar-layers.js").toString("utf8")), "R3 stays OFF at runtime");
  assert.match(S.budget, /keeps 1 planned call/); assert.match(S.budget, /adds no call and changes no budget figure or counter/); assert.match(S.budget, /no planned capacity for a retake/);
  for (const x of ["an image request or upload", "a call-id or claim", "a send adapter", "a frozen prompt", "a source anchor", "a runtime change or the wiring of ramp B", "a token change"]) assert.ok(S.notApproved.includes(x), x);
  // D-174 added no adapter; the only hair send adapters are the ones D-175, D-177 and D-180 later added, one per authorised call.
  assert.deepEqual(readdirSync(join(REPO, "tools", "avatar")).filter((f) => /send.*hair|hair.*send/i.test(f)).sort(), ["openai-send-r3-hair-d175.mjs", "openai-send-r3-hair-d177.mjs", "openai-send-r3-hair-d180.mjs"], "no hair send adapter except D-175's, D-177's and D-180's");
});

test("the approved targets are a byte-identical copy of the v2 review anchors: no coordinate changed, roles and uncertainty documented", () => {
  assert.equal(sha256(file(S.targets.file)), S.targets.sha256);
  assert.equal(sha256(file(S.targets.sourceFile)), S.targets.sourceSha256);
  assert.equal(TARGETS.source.sha256, S.targets.sourceSha256);
  assert.equal(TARGETS.source.bytes, file(S.targets.sourceFile).length);
  assert.deepEqual([TARGETS.status, TARGETS.approval.decision, TARGETS.approval.approvedBy, S.targets.status, S.targets.approvedByDecision], ["APPROVED", "D-174", "owner", "APPROVED", "D-174"]);
  assert.deepEqual(Object.keys(TARGETS.points).sort(), Object.keys(SOURCE.namedPoints).sort());
  assert.equal(Object.keys(TARGETS.points).length, 10);
  for (const [k, xy] of Object.entries(SOURCE.namedPoints)) assert.deepEqual(TARGETS.points[k].xy, xy, k + ": exactly the v2 coordinate");
  for (const k of FIT_POINTS) assert.equal(TARGETS.points[k].role, "fit", k);
  for (const k of CHECK_POINTS) assert.equal(TARGETS.points[k].role, "check", k);
  assert.deepEqual(FIT_POINTS.map((k) => TARGETS.points[k].id), ["A1", "A5", "A7", "A8"]);
  for (const p of Object.values(TARGETS.points)) assert.equal(p.uncertaintyPx, 3);
  assert.equal(TARGETS.points.rightEarTopJunction.kind, "DESIGN_POINT", "the v2 junction is a design point, not a reading");
  assert.deepEqual(TARGETS.geometry.sketchSilhouette, [...SOURCE.outerVolume, ...SOURCE.fringeEdge]);
  assert.deepEqual(TARGETS.geometry.napeLock, SOURCE.designProposals.rightNapeLock.polygon);
  assert.match(TARGETS.approval.scope, /target placement only — NOT the sketch's finished hair form, and NOT any future source anchor/);
  assert.match(TARGETS.geometry.sketchSilhouetteStatus, /NOT approved as a hair form and NOT a binding envelope/);
});

test("source anchors are unknown until a sheet exists; the prompt and the schema are tracked and pinned as drafts", () => {
  assert.match(S.sourceAnchors.status, /^UNKNOWN — no hair sheet exists/);
  assert.match(S.sourceAnchors.rule, /An approved TARGET is never a source anchor/);
  assert.equal(sha256(file(S.sourceAnchors.schemaFile)), S.sourceAnchors.schemaSha256);
  const schema = JSON.parse(file(S.sourceAnchors.schemaFile).toString("utf8"));
  assert.deepEqual(schema.properties.points.required, [...FIT_POINTS]);
  const p = S.rawSheet.prompt;
  assert.equal(sha256(file(p.file)), p.sha256); assert.equal(file(p.file).length, p.bytes);
  assert.match(p.status, /^DRAFT — tracked and pinned, not a request/);
  const text = file(p.file).toString("utf8");
  assert.match(text, /lock that hangs below his left ear/); assert.match(text, /neutral greyscale only/); assert.match(text, /never mirrored/);
  assert.match(p.plannedInput, /3daf32e76bff9a53ec7d25cf148a230073cfd0da6a003d02a23c4292d139ff50/);
  const cli = file("tools/avatar/r3-hair-compose.mjs").toString("utf8");
  assert.ok(cli.includes(`TARGETS_SHA256 = "${S.targets.sha256}"`), "the CLI pins the approved targets");
  assert.equal(sha256(file(S.measurementBasis.headGeometry.file)), S.measurementBasis.headGeometry.sha256);
});

test("colour method B is planned and specified, the tokens are unchanged, and no runtime uses it", () => {
  assert.deepEqual(RAMP_B.stops, [0, 80, 150, 255]);
  assert.match(S.colour.stops, /L 0 -> ink, L 80 -> token.shadow, L 150 -> token.base, L 255 -> light/);
  assert.match(S.colour.rounding, /floor\(\(2n \+ d\) \/ \(2d\)\)/);
  assert.match(S.colour.alpha, /straight alpha copied unchanged/);
  assert.match(S.colour.runtime, /^NOT WIRED/);
  assert.equal(DEFAULT_HAIR_COLOR, "brown");
  assert.deepEqual(HAIR_COLOR_TOKENS.brown, { base: "#5A3D28", shadow: "#3C2818" });
  for (const f of readdirSync(join(REPO, "js")).filter((f) => f.endsWith(".js"))) {
    const t = file(`js/${f}`).toString("utf8");
    assert.ok(!/r3-hair-tool|applyTonalRampB|rampStopsB|tonal ramp/i.test(t), `js/${f} does not use ramp B`);
  }
  assert.match(file("js/avatar-render-c2.js").toString("utf8"), /mix-blend-mode:multiply/, "the live R2 tint path is unchanged");
});

test("the register records D-174 and the canonical docs describe it", () => {
  assert.ok(ROW, "a D-174 row exists");
  for (const re of [/ADOPTED — METHOD BINDING — TARGETS APPROVED — COLOUR B PLANNED, NOT WIRED — NO CALL/, /hair-draft-anchors-v2\.json/, /1cdb33c2/, /c50356b3/, /ikke koblet til runtime/, /PR #357/]) assert.match(ROW, re);
  assert.ok(REGISTER.split("\n").some((l) => l.startsWith("| **D-173** |")), "D-174 follows D-173");
  const sys = file("docs/AVATAR_SYSTEM.md").toString("utf8");
  assert.match(sys, /\*\*D-174 \(2026-10-21\)\*\*/);
});
