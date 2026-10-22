// D-179 — registration v2 for FUTURE R3 hair sheets: exactly one contract addition (hairMethod.methodV2), the v2 targets,
// annotation schema and prompt v3 pinned beside the untouched v1 files, the register and docs, and no call, capacity,
// claim, adapter, promotion or runtime change. R3 stays default OFF.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { preD179Contract, PRE_D179_CONTRACT_CANONICAL_SHA256, PRE_D179_COMMIT, preD178Contract, PRE_D178_CONTRACT_CANONICAL_SHA256, preD180Contract } from "./avatar-r3-d147-closure.mjs";
import { THRESHOLDS, FIT_POINTS, MANDATORY_LOCKS, lockWindowsPx, validateAnnotation, TOOL_ID, encodePng } from "../../tools/avatar/r3-hair-tool-v2.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const file = (rel) => readFileSync(join(REPO, ...rel.split("/")));
// the CLI runs on import, so its pin is read from its source text
const CLI_V2_TARGETS_SHA256 = /export const TARGETS_SHA256 = "([0-9a-f]{64})";/.exec(file("tools/avatar/r3-hair-compose-v2.mjs").toString("utf8"))?.[1];
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
// D-180 later authorised the third hair call and froze prompt v3. LIVE is the contract exactly as D-179 left it (D-180's
// additions removed, proven canonical in avatar-r3-hair-send-d180.test.mjs).
const LIVE = preD180Contract(JSON.parse(file("tools/avatar/fixtures/r3/r3-shadow-contract-v1.json").toString("utf8")));
const PRE = preD179Contract(LIVE);
const V2 = LIVE.hairMethod.methodV2;
// the v2 CLI runs with an explicit allowlist environment, never this process's environment (D-142 / D-145 guard)
const CLI_ENV = Object.freeze({ SystemRoot: process.env.SystemRoot ?? "" });

test("D-179 adds exactly hairMethod.methodV2; the contract minus it is the D-178 merge, and the older chain still holds", () => {
  assert.equal(sha256(JSON.stringify(PRE)), PRE_D179_CONTRACT_CANONICAL_SHA256, `canonical contract at ${PRE_D179_COMMIT}`);
  assert.equal(sha256(JSON.stringify(preD178Contract(LIVE))), PRE_D178_CONTRACT_CANONICAL_SHA256);
  assert.deepEqual(Object.keys(LIVE), Object.keys(PRE));
  for (const k of Object.keys(LIVE)) if (k !== "hairMethod") assert.deepEqual(LIVE[k], PRE[k], k + " is unchanged");
  const { methodV2, ...v1 } = LIVE.hairMethod;
  assert.deepEqual(v1, PRE.hairMethod, "every v1 key of the hair method is unchanged (thresholds, targets, prompts, checks)");
  assert.equal(Object.keys(LIVE.hairMethod).at(-1), "methodV2");
});

test("methodV2 authorises nothing: no call, no capacity, no claim, no adapter; R3 stays default OFF", () => {
  assert.deepEqual([V2.decision, V2.isAuthorisation, V2.authorisesImageRequest, V2.authorisesUpload], ["D-179", false, false, false]);
  assert.match(V2.status, /NO IMAGE REQUEST AUTHORISED/);
  assert.deepEqual(LIVE.authorisedCalls.calls.filter((e) => e.mandateState === "UNSPENT"), [], "no active permission");
  assert.deepEqual([LIVE.assets[8].calls, LIVE.imageCallBudget.minimum, LIVE.imageCallBudget.maximum, LIVE.imageCallBudget.callsActuallySentSoFar.hair], [2, 24, 25, 2]);
  assert.equal(LIVE.architecture.defaultEnabled, false);
  assert.equal(LIVE.meta.authorisesImageRequest, false);
  // D-179 added no adapter; D-180 and D-182 later added the ones for their own authorised calls.
  assert.deepEqual(readdirSync(join(REPO, "tools", "avatar")).filter((f) => /send.*hair|hair.*send/i.test(f)).sort(), ["openai-send-r3-hair-d175.mjs", "openai-send-r3-hair-d177.mjs", "openai-send-r3-hair-d180.mjs", "openai-send-r3-hair-d182.mjs"], "no send adapter except D-175's, D-177's, D-180's and D-182's");
  for (const x of ["an image request or upload", "capacity, a call-id or a claim", "a frozen prompt v3", "the D-177 sheet under v2", "a new runtime layer for the nape lock"]) assert.ok(V2.notApproved.includes(x), x);
});

test("the owner's six principles are recorded; D-177 keeps its historical status and cannot be approved under v2", () => {
  assert.equal(V2.ownerPrinciples.length, 6);
  assert.match(V2.ownerPrinciples.join(" "), /A4, A9 and A10/);
  assert.match(V2.ownerPrinciples.join(" "), /no reduced fit/);
  assert.match(V2.scope, /D-177's sheet keeps its historical status \(kept for review, D-178\) and is never approved/);
  const d177 = LIVE.authorisedCalls.calls.find((e) => e.decision === "D-177");
  assert.deepEqual([d177.mandateState, d177.neverReuse], ["SPENT", true]);
  // a v1-schema annotation (as the D-177 DRAFT) is not a v2 annotation
  assert.equal(validateAnnotation({ schema: "r3-hair-annotation-v1", status: "APPROVED", raw: { sha256: "9d68b54d464e334d5a272c552c0d961fc3c7f786b75c20e7bf13c3e2f904d116" } }, "9d68b54d464e334d5a272c552c0d961fc3c7f786b75c20e7bf13c3e2f904d116", "production").code, "ANNOTATION_SCHEMA_INVALID");
});

test("registration, units and thresholds in the contract mirror the v2 tool exactly", () => {
  assert.deepEqual(V2.registration.fitPoints, ["centreHairline (A4)", "leftEarTopJunction (A9)", "rightEarTopJunction (A10)"]);
  assert.deepEqual(FIT_POINTS, ["centreHairline", "leftEarTopJunction", "rightEarTopJunction"]);
  assert.deepEqual(Object.values(MANDATORY_LOCKS), ["leftTempleLockTip", "rightTempleLockTip"]);
  assert.match(V2.units, /SHEET px/); assert.match(V2.units, /MASTER px/); assert.match(V2.units, /u \* s master px/);
  const t = V2.thresholds;
  assert.deepEqual([t.seatResidualMaxPx, t.aspectMaxAbsDev, t.scaleRange, t.crownMaxY, t.readingAgreementMaxSheetPx, t.lockMinLengthMasterPx, t.lockWindowRule],
    [THRESHOLDS.seatResidualMaxPx, THRESHOLDS.aspectMaxAbsDev, [...THRESHOLDS.scaleRange], THRESHOLDS.crownMaxY, THRESHOLDS.readingAgreementMaxSheetPx, THRESHOLDS.lockMinLengthMasterPx, THRESHOLDS.lockWindowRule]);
  assert.deepEqual(t.fitUncertaintySheetPx, { ...THRESHOLDS.fitUncertaintySheetPx });
  const w = lockWindowsPx(JSON.parse(file("tools/avatar/fixtures/r3-hair/targets-hair-v2.json").toString("utf8")));
  assert.deepEqual(Object.values(t.lockWindowsMasterPx), [Number(w.leftTempleLockTip.toFixed(3)), Number(w.rightTempleLockTip.toFixed(3))]);
  assert.match(V2.registration.a4Proposal.status, /REVIEW AID ONLY/);
  assert.match(V2.registration.a4Proposal.alphaCriterion, /alpha < 16/);
  assert.match(V2.registration.repeatedReading, /^MANDATORY/);
  assert.match(V2.registration.repeatedReading, /second reading is made with the first reading hidden/);
  assert.match(V2.registration.repeatedReading, /guarantees neither correctness nor statistical independence: a systematic misinterpretation can repeat itself/);
  assert.match(V2.registration.repeatedReading, /never an average/);
  assert.deepEqual(Object.values(V2.registration.definitions.definitionIds), ["r3-hair-v2:A9-ear-top-junction", "r3-hair-v2:A10-ear-top-junction"]);
  assert.match(V2.registration.targetProvenance, /A10 is a DESIGN_POINT/);
  assert.match(V2.thresholdStatus.openOwnerDecision, /5\.79 px and 0\.076/);
  assert.match(V2.simulation.status, /never an observed failure rate on a real asset/);
  assert.match(V2.shapeChecks["HP-LOCK"], /The window alone never proves/);
  assert.equal(V2.tools.library, "tools/avatar/r3-hair-tool-v2.mjs");
  assert.equal(TOOL_ID, "r3-hair-tool-v2");
});

test("the owner's closing decisions: thresholds approved (future attempts only, never D-177), mandatory hidden second reading, HP5 unchanged", () => {
  const d = V2.ownerDecisionsClosed;
  assert.match(d.thresholds, /^APPROVED by the owner: seat residual <= 6\.0 master px, \|sx\/sy - 1\| <= 0\.08, scale range 0\.35\.\.0\.85\./);
  assert.match(d.thresholds, /never used to reclassify D-177/);
  assert.match(d.reading, /made with the first reading hidden/);
  assert.match(d.reading, /never an automatic average/);
  assert.match(d.reading, /NOT_IDENTIFIABLE; there is no reduced fit/);
  assert.match(d.scalpHoles, /^HP5 stays unchanged/);
  assert.match(V2.thresholdStatus.status, /^APPROVED by the owner/);
  assert.match(V2.thresholdStatus.openOwnerDecision, /^CLOSED/);
  assert.match(V2.scope, /never used to reclassify D-177/);
  assert.match(V2.simulation.knownLimits, /10 sheet px/, "the noise model's limits stay documented");
  assert.deepEqual([LIVE.hairMethod.thresholds.holeAlphaBelow, LIVE.hairMethod.zones.faceSeed], [128, [511, 360]], "HP5's definition is v1's, unchanged");
  const ear = JSON.parse(file(V2.annotationSchema.file).toString("utf8")).$defs.earJunction.properties.readings;
  assert.deepEqual([ear.prefixItems[0].properties.pass.const, ear.prefixItems[1].properties.pass.const, ear.prefixItems[1].properties.firstReadingHidden.const], [1, 2, true]);
  for (const it of ear.prefixItems) assert.ok(it.required.includes("crop") && it.required.includes("definition"));
});

test("the v2 files are pinned beside the untouched v1 files", () => {
  for (const [k, rel] of [["targets", V2.targets.file], ["annotationSchema", V2.annotationSchema.file], ["promptV3", V2.promptV3.file]]) assert.equal(sha256(file(rel)), V2[k].sha256, k);
  assert.equal(file(V2.promptV3.file).length, V2.promptV3.bytes);
  assert.equal(CLI_V2_TARGETS_SHA256, V2.targets.sha256, "the v2 CLI pins the v2 targets");
  assert.equal(V2.targets.derivedFrom.sha256, LIVE.hairMethod.targets.sha256, "derived from the D-174 targets");
  assert.equal(sha256(file(LIVE.hairMethod.targets.file)), LIVE.hairMethod.targets.sha256, "v1 targets unchanged");
  assert.equal(sha256(file(LIVE.hairMethod.rawSheet.prompt.file)), LIVE.hairMethod.rawSheet.prompt.sha256, "prompt v1 unchanged");
  assert.equal(sha256(file(LIVE.hairMethod.rawSheet.promptV2.file)), LIVE.hairMethod.rawSheet.promptV2.sha256, "prompt v2 unchanged");
  assert.equal(sha256(file(LIVE.hairMethod.sourceAnchors.schemaFile)), LIVE.hairMethod.sourceAnchors.schemaSha256, "annotation schema v1 unchanged");
  const schema = JSON.parse(file(V2.annotationSchema.file).toString("utf8"));
  assert.deepEqual([schema.$id, schema.properties.units.const, schema.properties.fitPoints.required], ["r3-hair-annotation-v2", "sheet-px", ["centreHairline", "leftEarTopJunction", "rightEarTopJunction"]]);
  assert.deepEqual(schema.properties.locks.required, ["leftTempleLock", "rightTempleLock"]);
});

test("prompt v3 is a DRAFT that asks for ear transitions, both temple locks and no nape lock; it authorises no call", () => {
  const p = file(V2.promptV3.file).toString("utf8");
  assert.match(V2.promptV3.status, /^DRAFT — NOT FROZEN/);
  assert.match(p, /TWO clearly separate temple locks/);
  assert.match(p, /clearly readable ear transition/);
  assert.match(p, /Do NOT draw any lock below the ears and no lock at the neck/);
  assert.match(p, /no separate small pieces/);
  assert.match(p, /at least 64 pixels/);
  assert.doesNotMatch(p, /small lock that hangs below/);
  assert.ok(!/[^\x00-\x7F]/.test(p), "plain ASCII prompt");
  const anyFrozenV3 = LIVE.authorisedCalls.calls.some((e) => JSON.stringify(e).includes("prompt-hair-sheet-v3"));
  assert.equal(anyFrozenV3, false, "no call references prompt v3");
});

test("the v2 CLI: the A4 proposal is printed as a review aid; production refuses targets other than the pinned v2 file", () => {
  const dir = mkdtempSync(join(tmpdir(), "r3-hair-v2-cli-"));
  try {
    const px = new Uint8ClampedArray(1024 * 1024 * 4);
    for (let y = 200; y < 600; y++) for (let x = 200; x < 824; x++) { const inV = y > 300 && Math.abs(x - 600) < (y - 300) * 0.5 + 0.5; const inFace = y > 450 && x > 320 && x < 760; if (!inV && !inFace) { const o = (y * 1024 + x) * 4; px[o] = px[o + 1] = px[o + 2] = 150; px[o + 3] = 255; } }
    const sheet = join(dir, "sheet.png"); writeFileSync(sheet, encodePng(1024, 1024, px));
    const r = spawnSync(process.execPath, [join(REPO, "tools/avatar/r3-hair-compose-v2.mjs"), "--propose-a4", sheet, "--a9", "320,450", "--a10", "760,450"], { env: CLI_ENV, encoding: "utf8" });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const out = JSON.parse(r.stdout);
    assert.match(out.status, /A4 PROPOSAL ONLY/);
    assert.deepEqual([out.ok, out.units, out.xy, out.outputWritten], [true, "sheet px", [600.5, 301], false]);
    writeFileSync(join(dir, "ann.json"), "{}");
    const p = spawnSync(process.execPath, [join(REPO, "tools/avatar/r3-hair-compose-v2.mjs"), "--sheet", sheet, "--annotation", join(dir, "ann.json"), "--face", "x", "--eyes-fixed", "x", "--iris", "x", "--out", join(REPO, "tools/avatar/build/never-written"), "--targets", join(REPO, "tools/avatar/fixtures/r3-hair/targets-hair-v1.json")], { env: CLI_ENV, encoding: "utf8" });
    assert.equal(p.status, 2);
    assert.deepEqual([JSON.parse(p.stdout).code, JSON.parse(p.stdout).outputWritten], ["TARGETS_NOT_PINNED", false]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("register and docs record D-179", () => {
  const ps = file("docs/project-state.md").toString("utf8"), av = file("docs/AVATAR_SYSTEM.md").toString("utf8");
  const row = ps.split("\n").find((l) => l.startsWith("| **D-179** |"));
  assert.ok(row, "a D-179 row in the decision register");
  for (const s of ["A4, A9 og A10", "A7 og A8", "ingen reduceret tilpasning", "6,0", "0,08", "≤ 194", "HP-LOCK", "HP-FRAG", "Prompt v3", "D-177", "default OFF", "første aflæsning skjult", "aldrig et automatisk gennemsnit", "godkendt af ejeren", "genklassificere D-177", "HP5 får ingen ny tolerance"]) assert.ok(row.includes(s), s);
  assert.ok(!/Ã¦|Ã¸|Ã¥|�/.test(row), "no mojibake");
  assert.match(av, /D-179/);
});
