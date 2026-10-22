// R3 HAIR SHEET — D-180: one further authorised hair call, the first under registration v2 (hairMethod.methodV2, D-179), with
// the frozen prompt v3 (assets[8] 2 -> 3, budget 24-25 -> 25-26, no reserve) and its separate send adapter, tested without
// ever reaching the real world. Derived from the D-177 suite; the lessons of D-142 and D-145 apply unchanged:
//   · The send adapter is NEVER imported. This file reads its source as text, or runs it as a CLI in a child process
//     inside a TEMPORARY git repository that this file builds per scenario, with its own origin/main.
//   · Every child gets an environment built from an explicit ALLOWLIST: no inherited key, no real LOCALAPPDATA or
//     XDG_STATE_HOME, and TEMP/TMP/TMPDIR inside the sandbox. The key is a dummy literal.
//   · globalThis.fetch (and, for the crash windows, node:fs) is replaced from OUTSIDE by `node --import <mock>`. The
//     mock refuses to load unconfigured, never delegates to a real fetch, and logs one line per call.
//   · No test reads, lists or checks the real claim register, a real key or the real build area.
// The returned sheets are synthetic technical shapes (a grey ellipse), never a hair design.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, readdirSync, statSync, copyFileSync, realpathSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync, spawn } from "node:child_process";
import { join, dirname, relative, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { parseEvents, deriveAttempt } from "../../tools/avatar/r3-face-neutral-attempt-ledger.mjs";
import { encodePng, THRESHOLDS, checkHairSheet } from "../../tools/avatar/r3-hair-tool.mjs";
import { preD181Contract, PRE_D181_CONTRACT_CANONICAL_SHA256, PRE_D181, PRE_D181_COMMIT, preD180Contract, PRE_D180_CONTRACT_CANONICAL_SHA256, PRE_D180, PRE_D180_COMMIT, preD179Contract, PRE_D179_CONTRACT_CANONICAL_SHA256, preD178Contract, PRE_D178_CONTRACT_CANONICAL_SHA256, preD177Contract, PRE_D177_CONTRACT_CANONICAL_SHA256 } from "./avatar-r3-d147-closure.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const repoFile = (rel) => join(REPO, ...rel.split("/"));
const ADAPTER_REL = "tools/avatar/openai-send-r3-hair-d180.mjs";
const PREV_ADAPTER_REL = "tools/avatar/openai-send-r3-hair-d177.mjs";
const LEDGER_REL = "tools/avatar/r3-face-neutral-attempt-ledger.mjs";
const HAIR_TOOL_REL = "tools/avatar/r3-hair-tool.mjs";
const EYES_TOOL_REL = "tools/avatar/r3-eyes-tool.mjs";
const PARTS_TOOL_REL = "tools/avatar/r3-face-parts-tool.mjs";
const CONTRACT_REL = "tools/avatar/fixtures/r3/r3-shadow-contract-v1.json";
const REGISTER_REL = "docs/project-state.md";
const PROMPT_REL = "tools/avatar/fixtures/r3-hair/prompt-hair-sheet-v3.txt";
const PREV_PROMPT_REL = "tools/avatar/fixtures/r3-hair/prompt-hair-sheet-v2.txt";
const PROMPT_V1_REL = "tools/avatar/fixtures/r3-hair/prompt-hair-sheet-v1.txt";
const TARGETS_REL = "tools/avatar/fixtures/r3-hair/targets-hair-v2.json";
const PREV_TARGETS_REL = "tools/avatar/fixtures/r3-hair/targets-hair-v1.json";
const EYE_TARGETS_REL = "tools/avatar/fixtures/r3-eyes/targets-eyes-v2.json";
const NORTHSTAR_REL = "assets/avatar/reference/Northstar Master v2.png";
const SRC = readFileSync(repoFile(ADAPTER_REL), "utf8");
const CODE = SRC.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
// D-181 later recorded D-180's one send and closed its entry in place. LIVE is the contract exactly as D-180 committed it
// (D-181's closure reversed, proven canonical below); the closed state itself is tested at the end of this file.
const LIVE_NOW = JSON.parse(readFileSync(repoFile(CONTRACT_REL), "utf8"));
const LIVE = preD181Contract(LIVE_NOW);
const REGISTER = readFileSync(repoFile(REGISTER_REL), "utf8");
const PRE = preD180Contract(LIVE);
const PRE_REGISTER = REGISTER.split("\n").filter((l) => !l.startsWith("| **D-180** |")).join("\n");
const CALL = "D-180-r3-hair-northstar-v3";
const CLAIM_ID = CALL + "-claim";
const CLAIM_FILE = CALL + ".claim.json";
const EVENTS_FILE = CALL + ".events.jsonl";
const DUMMY_KEY = "sk-d180-sandbox-dummy-key-not-a-credential";
const APPROVAL = "--owner-approval=D-180";
const GOOD_ARGS = ["--call-id=" + CALL, "--claim-identity=" + CLAIM_ID];
const SEND = ["--send", APPROVAL];
const PROMPT_SHA = "5c80c5761dd2f36e888670b3bfdca204d290e122ef0f74b3ae411b73d9b0fd49";
const PROMPT_V2_SHA = "a9304fafea781fa2f679be4c977952f8b159e6302b3b93cd3b30391490d851a1";
const PROMPT_V1_SHA = "43084da7dae90e154126d7c507f2eacae1dc205648dbe8d3614adc02f0495728";
const TARGETS_SHA = "8c3b24e8404d3ccf44160108eaf13cd58cdb66c6705f503a6415b49a151864cc";
const TARGETS_V1_SHA = "c50356b36e4c52246269523bb9247ad21544e0cc57efd54c4b9c60fde12b24c6";
const NORTHSTAR_SHA = "3daf32e76bff9a53ec7d25cf148a230073cfd0da6a003d02a23c4292d139ff50";
const MODEL = "gpt-image-2.5-sunburst-2026-09-08";
const D177_ADAPTER_SHA = "eea4a3ee6e0c854f4e9659b362747a4fe5d41fb1a2866f45e98c635ca435ec0d";   // the D-177 adapter as it ran (D-178 execution.sentBy)
const D179_ROW_SHA_AT_D179 = "efc4c69f76e36559239cb1300ceeabd38da067d2d5aeba1f527ce7e1b99cc0e4";
const SPENT_IDS = ["D-139-r3-underlay-head-only-v1", "D-142-r3-underlay-core-v1", "D-143-r3-underlay-core-v2", "D-151-r3-head-colour-u1-v1",
  "D-153-r3-head-colour-u1-opaque-v1", "D-160-r3-face-neutral-v1", "D-162-r3-face-neutral-guide-b-v1", "D-165-r3-face-parts-sheet-v1", "D-167-r3-face-parts-nose-v1",
  "D-170-r3-eyes-fixed-v1", "D-172-r3-eyes-fixed-v2", "D-175-r3-hair-northstar-v1", "D-177-r3-hair-northstar-v2"];
const E = LIVE.authorisedCalls.calls.find((e) => e.callId === CALL);
const IMPL = LIVE.adapterImplementations.entries.find((e) => e.decision === "D-180");
const ROW = REGISTER.split("\n").find((l) => l.startsWith("| **D-180** |"));
const V2 = LIVE.hairMethod.methodV2;

function isInside(child, parent) {
  if (typeof child !== "string" || typeof parent !== "string" || child === "" || parent === "") return false;
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

// ── the decision itself ───────────────────────────────────────────────────────────────────────────────────────
test("D-180 adds exactly one authorisation, its implementation, one planned hair call and freezes prompt v3: the contract at the D-179 merge is reproduced canonically", () => {
  assert.equal(sha256(JSON.stringify(PRE)), PRE_D180_CONTRACT_CANONICAL_SHA256, "canonical contract at " + PRE_D180_COMMIT);
  assert.equal(sha256(JSON.stringify(preD179Contract(LIVE))), PRE_D179_CONTRACT_CANONICAL_SHA256, "and the older chain still holds");
  assert.equal(sha256(JSON.stringify(preD178Contract(LIVE))), PRE_D178_CONTRACT_CANONICAL_SHA256);
  assert.equal(sha256(JSON.stringify(preD177Contract(LIVE))), PRE_D177_CONTRACT_CANONICAL_SHA256);
  assert.deepEqual(Object.keys(LIVE), Object.keys(PRE), "no top-level key is added");
  assert.deepEqual([PRE.authorisedCalls.count, LIVE.authorisedCalls.count, LIVE.authorisedCalls.calls.length], [13, 14, 14]);
  assert.deepEqual(LIVE.authorisedCalls.calls.slice(0, 13), PRE.authorisedCalls.calls, "the thirteen earlier entries are unchanged");
  assert.deepEqual(LIVE.adapterImplementations.entries.slice(0, -1), PRE.adapterImplementations.entries, "the earlier implementations are unchanged");
  assert.deepEqual([PRE.assets[8].calls, LIVE.assets[8].calls], [2, 3], "hair capacity 2 -> 3");
  for (let i = 0; i < LIVE.assets.length; i++) if (i !== 8) assert.deepEqual(LIVE.assets[i], PRE.assets[i], "asset " + i + " is unchanged");
  const b = LIVE.imageCallBudget;
  assert.deepEqual([b.minimum, b.maximum, b.callsPlannedAndAuthorised.derivedBudget, b.callsPlannedAndAuthorised.hair], [25, 26, "25-26", 3]);
  assert.deepEqual([PRE.imageCallBudget.minimum, PRE.imageCallBudget.maximum, PRE_D180.minimum, PRE_D180.maximum], [24, 25, 24, 25]);
  let min = 0, max = 0; for (const x of LIVE.assets) { if (typeof x.calls === "number") { min += x.calls; max += x.calls; } else { const m = /^(\d+)-(\d+)$/.exec(x.calls); min += +m[1]; max += +m[2]; } }
  assert.deepEqual([min, max], [25, 26], "the budget is derived arithmetically: +1");
  assert.deepEqual(b.callsActuallySentSoFar, PRE.imageCallBudget.callsActuallySentSoFar, "actually sent is unchanged");
  const s = b.callsActuallySentSoFar; assert.deepEqual([s.underlay, s.faceNeutral, s.eyesFixed, s.hair], [5, 4, 2, 2]);
  const { methodV2, ...v1Now } = LIVE.hairMethod, { methodV2: preV2, ...v1Pre } = PRE.hairMethod;
  assert.deepEqual(v1Now, v1Pre, "D-174's v1 hair method (thresholds, targets, prompts v1/v2, checks) is unchanged");
  const strip = (m) => ({ ...m, status: null, promptV3: { ...m.promptV3, status: null } });
  assert.deepEqual(strip(methodV2), strip(preV2), "methodV2 is unchanged except the frozen prompt v3 status: targets, thresholds, checks, registration");
  assert.match(preV2.promptV3.status, /^DRAFT — NOT FROZEN/);
  assert.match(methodV2.promptV3.status, /^FROZEN by D-180 — the exact bytes of the one authorised hair call D-180-r3-hair-northstar-v3, byte-identical to D-179's tracked draft\./);
  assert.deepEqual([methodV2.promptV3.file, methodV2.promptV3.sha256, methodV2.promptV3.bytes], [PROMPT_REL, PROMPT_SHA, 1537]);
  assert.match(methodV2.status, /PROMPT V3 FROZEN BY D-180 — METHOD V2 ITSELF AUTHORISES NO IMAGE REQUEST/);
  assert.deepEqual([methodV2.isAuthorisation, methodV2.authorisesImageRequest, methodV2.authorisesUpload], [false, false, false]);
  assert.deepEqual([LIVE.hairMethod.thresholds.borderPx, methodV2.thresholds], [16, preV2.thresholds], "H2's border and every D-179 threshold are unchanged");
  for (const k of ["eyesPartsMethod", "irisContract", "deterministicOperations", "zModel", "layerContract", "hairstyleContract", "productionOrder"]) assert.deepEqual(LIVE[k], PRE[k], k + " is unchanged");
  assert.equal(LIVE.meta.authorisesImageRequest, false);
  assert.equal(LIVE.architecture.defaultEnabled, false, "R3 stays default OFF");
  assert.ok(!/AVATAR_R3\s*=\s*true/.test(readFileSync(repoFile("js/avatar-layers.js"), "utf8")), "R3 stays OFF at runtime");
});

test("prompt v3 is frozen byte for byte as D-179's draft; prompts v1 and v2 are unchanged; no review header is sent", () => {
  const v3 = readFileSync(repoFile(PROMPT_REL));
  assert.deepEqual([sha256(v3), v3.length], [PROMPT_SHA, 1537]);
  assert.equal(sha256(readFileSync(repoFile(PREV_PROMPT_REL))), PROMPT_V2_SHA, "D-177's prompt v2 is unchanged");
  assert.equal(sha256(readFileSync(repoFile(PROMPT_V1_REL))), PROMPT_V1_SHA, "D-175's prompt v1 is unchanged");
  const t = v3.toString("utf8");
  assert.ok(Buffer.from(t, "utf8").equals(v3) && !t.includes("\r") && t.endsWith("\n") && !t.endsWith("\n\n"), "UTF-8, LF only, one final LF");
  assert.ok(!/DRAFT|NOT FROZEN|D-1\d\d/.test(t), "no review header or decision id is sent to the model");
  assert.match(t, /TWO clearly separate temple locks/);
  assert.match(t, /clearly readable ear transition/);
  assert.match(t, /Do NOT draw any lock below the ears and no lock at the neck/);
  assert.match(t, /no separate small pieces/);
  assert.match(t, /at least 64 pixels/);
  assert.match(t, /V-shaped parting/);
});

test("D-180's entry is the ONLY live permission: the locked request, Northstar only, prompt v3, targets v2, H1..H5 only; merge is not a run instruction", () => {
  assert.deepEqual(LIVE.authorisedCalls.calls.filter((e) => e.mandateState === "UNSPENT").map((e) => e.callId), [CALL]);
  for (const id of SPENT_IDS.slice(1)) { const x = LIVE.authorisedCalls.calls.find((e) => e.callId === id); assert.equal(x.mandateState, "SPENT", id); }
  assert.deepEqual([E.decision, E.preparedBy, E.status, E.mandateState, E.outcome], ["D-180", "D-180", "AUTHORISED — ONE CALL — NOT YET ATTEMPTED", "UNSPENT", "NOT YET ATTEMPTED"]);
  for (const k of ["neverReuse", "notAnActivePermission", "closedBy", "closure", "execution"]) assert.ok(!(k in E), "no " + k);
  assert.deepEqual([E.claim.identity, E.claim.filename, E.claim.eventsFilename, E.adapter.file], [CLAIM_ID, CLAIM_FILE, EVENTS_FILE, ADAPTER_REL]);
  assert.deepEqual([E.runInstruction.mergeIsNotAnInstruction, E.runInstruction.requiresSeparateExplicitOwnerInstruction], [true, true]);
  assert.match(E.runInstruction.rule, /after D-180 is merged/);
  const d177 = LIVE.authorisedCalls.calls.find((e) => e.decision === "D-177");
  assert.deepEqual([E.model, E.endpoint, E.operation, E.parameters, E.fieldOrder, E.neverSentFields, E.inputs, E.inputOrder], [d177.model, d177.endpoint, d177.operation, d177.parameters, d177.fieldOrder, d177.neverSentFields, d177.inputs, d177.inputOrder], "the locked request of D-175 and D-177");
  assert.deepEqual([E.model, E.endpoint], [MODEL, "https://api.openai.com/v1/images/edits"]);
  assert.deepEqual(E.parameters, { size: "1024x1024", quality: "high", n: 1, output_format: "png", background: "transparent" });
  assert.deepEqual(E.inputs, [{ order: 1, role: "Image 1", purpose: "the only reference: style, identity and the boy's hairstyle", name: "Northstar Master v2.png", repoPath: NORTHSTAR_REL, bytes: 761394, sha256: NORTHSTAR_SHA, tracked: true }]);
  assert.equal(sha256(readFileSync(repoFile(NORTHSTAR_REL))), NORTHSTAR_SHA);
  assert.deepEqual([E.prompt.file, E.prompt.sha256, E.prompt.bytes], [PROMPT_REL, PROMPT_SHA, 1537]);
  assert.deepEqual([E.targets.file, E.targets.sha256, E.targets.version, E.targets.status], [TARGETS_REL, TARGETS_SHA, "r3-hair-targets-v2", "APPROVED"]);
  assert.deepEqual([V2.targets.sha256, sha256(readFileSync(repoFile(TARGETS_REL)))], [TARGETS_SHA, TARGETS_SHA], "D-179's approved targets v2, unchanged");
  assert.deepEqual([E.outputs.dir, E.outputs.sheet, E.outputs.count, E.outputs.sheetType], ["tools/avatar/build/r3-hair-d180", [1024, 1024], 1, "r3-hair-sheet-v1"]);
  assert.match(E.otherHairstyles, /NOT authorised/);
  assert.match(E.outputHandling.technicalChecks, /H1\.\.H5 .*H2's 16 px border is unchanged\. No placement or shape check — neither D-179's \(HP1v2, HP2, HP-LOCK, HP4v2\.\.HP8, HP-FRAG\)/);
  assert.match(E.outputHandling.passMeaning, /never means that a D-179 placement or shape check has passed: those need an owner-APPROVED v2 source annotation and are never evaluated on the raw sheet alone/);
  assert.match(E.outputHandling.annotation, /DRAFT .*A9 and rightEarTopJunction A10 each read twice under the same point definition, the second time with the first reading hidden, each with its marked crop.*Only the owner sets APPROVED\.$/);
  assert.match(E.outputHandling.composition, /^Placement is done ONLY by tools\/avatar\/r3-hair-compose-v2\.mjs .*only after that separate owner approval.* No free manual moving, scaling or pixel repair\.$/);
  assert.match(E.prohibitions.noMethodChange, /No D-179 threshold, target, point definition or check is changed, before or after the output\. D-177 keeps its historical status \(kept for review, D-178\) and is never approved or reclassified under v2\./);
  assert.match(E.accounting.slot, /never an underlay, face-neutral or eyes call; the third hair attempt and the first under registration v2/);
  assert.match(E.counters, /underlay 5, faceNeutral 4, eyesFixed 2, hair 2\)\. assets\[8\] planned capacity moves 2 -> 3 .* 24-25 -> 25-26/);
  assert.match(E.ownerDecision, /freeze prompt v3 unchanged, byte for byte \(5c80c576.*exactly one further planned hair call with no reserve.*one PR.*NOT a run instruction\.$/);
  assert.deepEqual([IMPL.adapter.file, IMPL.adapter.status, IMPL.adapter.ownerApprovalFlag, IMPL.mandateState, IMPL.mergeIsNotAnInstruction], [ADAPTER_REL, "IMPLEMENTED — NOT EXECUTED", APPROVAL, "UNSPENT", true]);
  assert.ok(!Object.keys(IMPL.adapter).some((k) => /sha-?256/i.test(k)), "no adapter hash pinned (D-145)");
  const P = LIVE.prohibitions.noImageRequestAuthorised;
  assert.match(P, /holds FOURTEEN entries/);
  assert.match(P, /\(13\) D-177-r3-hair-northstar-v2 — NO LONGER a permission/);
  assert.match(P, /\(14\) D-180-r3-hair-northstar-v3 — THE ONLY active send permission/);
  assert.match(P, /Apart from D-180's single attempt, no entry in this list is an active send permission .*D-175's or D-177's call id or claim identity, no fourth hair call, and no other call in the R3 plan\.$/);
  const pre = PRE_D180.noImageRequestAuthorised;
  assert.equal(P.slice(0, P.indexOf(" (14) ")), pre.slice(0, pre.indexOf(" No entry in this list is an active send permission")).replace("THIRTEEN", "FOURTEEN"), "every earlier restriction is kept word for word");
  assert.match(LIVE.authorisedCalls.budgetAccounting, /D-180 adds ONE further planned hair call \(assets\[8\] 2 -> 3\) for the third hair sheet \(registration v2, prompt v3\), authorised and not yet sent\. The derived budget is 25-26\./);
  const d177Now = LIVE.authorisedCalls.calls.find((e) => e.decision === "D-177");
  assert.deepEqual([d177Now.mandateState, d177Now.neverReuse, d177Now.closure.closedBy], ["SPENT", true, "D-178"], "D-177 keeps its historical status");
});

test("the D-180 register row: once, directly after D-179, D-179 verbatim, every pin named, no mojibake; the docs describe it", () => {
  const lines = REGISTER.split("\n");
  assert.equal(lines.filter((l) => l.startsWith("| **D-180** |")).length, 1);
  assert.equal(lines.findIndex((l) => l.startsWith("| **D-180** |")), lines.findIndex((l) => l.startsWith("| **D-179** |")) + 1);
  assert.equal(sha256(lines.find((l) => l.startsWith("| **D-179** |"))), D179_ROW_SHA_AT_D179, "D-179 is not rewritten");
  for (const needle of [CALL, CLAIM_ID, CLAIM_FILE, EVENTS_FILE, MODEL, ADAPTER_REL, APPROVAL, NORTHSTAR_SHA, PROMPT_SHA, PROMPT_REL, TARGETS_SHA, "1024x1024", "tools/avatar/build/r3-hair-d180/",
    "AUTHORISED — ONE CALL — NOT YET ATTEMPTED`", "IKKE EN KØRSELSINSTRUKS", "byte for byte", "24–25 → 25–26", "2 → 3", "H1–H5", "`hair` = 2", "`eyesFixed` = 2", "`faceNeutral` = 4", "`underlay` = 5",
    "anden gang med første aflæsning skjult", "særskilt ejergodkendelse", "beskrives aldrig som bestået på råarket alene", "genklassificeres aldrig",
    "særskilt eksekveringsbesked", "R3 forbliver default OFF"]) assert.ok(ROW.includes(needle), "the D-180 row carries " + JSON.stringify(needle));
  assert.ok(!/[ÃÂ]\S|�/.test(ROW), "no mojibake in the Danish row");
  const doc = readFileSync(repoFile("docs/AVATAR_SYSTEM.md"), "utf8");
  assert.match(doc, /\*\*D-180 \(2026-10-22\)\*\* authorised exactly ONE further hair call, the first under registration v2/);
  // the status line is current state: D-181 later closed the permission (tested below)
});

// ── static: the adapter's shape ─────────────────────────────────────────────────────────────────────────────────
test("the D-177 adapter is unchanged; the D-180 adapter exports nothing and imports only node built-ins, the ledger and the hair tool", () => {
  assert.equal(sha256(readFileSync(repoFile(PREV_ADAPTER_REL))), D177_ADAPTER_SHA, "the D-177 adapter is byte-identical to what ran");
  assert.ok(!/^\s*export\b/m.test(CODE));
  const imports = [...CODE.matchAll(/^\s*import\b[^;]*?from\s+"([^"]+)"/gm)].map((m) => m[1]);
  for (const s of imports) assert.ok(s.startsWith("node:") || ["./r3-face-neutral-attempt-ledger.mjs", "./r3-hair-tool.mjs"].includes(s), "unexpected import " + s);
  assert.ok(!/\bimport\s*\(/.test(CODE) && !/\brequire\s*\(/.test(CODE));
  assert.ok(CODE.includes("checkHairSheet(imgBuf)"), "the output check is D-174's H1..H5");
  for (const x of ["checkFixedSheet", "checkPartialSheet", "checkRawSheet", "checkPlacedHair", "composeHair", "fitSeat", "checkLocks", "checkFragments", "proposeA4", "r3-hair-tool-v2", "applyTonalRampB", "check-r3-face-neutral-output"]) assert.ok(!CODE.includes(x), "no " + x + " in the adapter");
  assert.ok(!/THRESHOLDS\s*=|THRESHOLDS\.[a-zA-Z]+\s*=/.test(CODE), "the adapter never defines or changes a threshold");
  assert.ok(!/report\.verdict = "PASS/.test(CODE), "a failure can never be turned into a pass");
});
test("exactly one fetch, with redirect \"error\", not in a loop; no retry, no fallback; git never touches the network", () => {
  assert.equal([...CODE.matchAll(/\bfetch\s*\(/g)].length, 1);
  assert.match(CODE, /globalThis\.fetch\(ENDPOINT, \{ method: "POST", redirect: "error", headers: \{ Authorization: "Bearer " \+ apiKey \}, body: built\.body \}\)/);
  assert.ok(!/["'](fetch|pull|push|remote|ls-remote|clone)["']/.test(CODE));
  const prose = /no retry, no fallback|No outcome permits an automatic retry|there is no fallback|automaticRetry: false|NO RETRY/gi;
  for (const w of ["retry", "maxRetries", "retries", "backoff", "fallback"]) assert.ok(!new RegExp("\\b" + w + "\\b", "i").test(CODE.replace(prose, "")), "no " + w);
});
test("no injection point, no bypass flag; the key is read once, after every check; the order of the checks", () => {
  for (const hook of ["fetchImpl", "claimPath", "outDir:", "registerPath", "contractPath", "gitRef", "specPath", "--guide"]) assert.ok(!CODE.includes(hook), "no injection point " + hook);
  for (const flag of ["--claim-path", "--force", "--retry", "--reset", "--out", "--ref", "--contract", "--register", "--model", "--mask", "--pin", "--sha", "--size", "--targets", "--threshold"]) assert.ok(!CODE.includes("\"" + flag), "no CLI flag " + flag);
  const envUses = [...CODE.matchAll(/process\.env(\.[A-Za-z_][A-Za-z0-9_]*|\[[^\]]*\]|\))?/g)].map((m) => m[0]);
  for (const u of envUses) assert.ok(new Set(["process.env.OPENAI_API" + "_KEY", "process.env.LOCALAPPDATA", "process.env.XDG_STATE_HOME", "process.env)"]).has(u), "unexpected environment read " + u);
  assert.equal([...CODE.matchAll(/process\.env\.OPENAI_API_KEY/g)].length, 1);
  const body = CODE.slice(CODE.indexOf("async function main(argv)"));
  let last = -1;
  for (const k of ["parseArgs(argv)", "resolveRefs()", "readOriginBlobs(refs.originSha)", "verifyPins(blobs)", "verifyRegister(blobs.register)", "verifyAuthorisation(parsed.contract)",
    "verifyImplementation(parsed.contract)", "resolveClaimLocation()", "pathExists(loc.claim)", "pathExists(loc.events)", "occupiedOutputs()", "buildBody(blobs, pins.prompt)",
    "if (!args.sendMode)", "const again = resolveRefs()", "process.env.OPENAI_API" + "_KEY", "claim = createClaim(", "event(\"dispatch\"", "res = await globalThis.fetch(", "checkHairSheet(imgBuf)"]) { const i = body.indexOf(k); assert.ok(i > last, k + " in order"); last = i; }
  for (const del of ["unlinkSync", "rmSync", "rmdirSync", "truncateSync", "copyFileSync"]) assert.ok(!CODE.includes(del), "must not contain " + del);
  assert.ok(!/candidate\.png|\.candidate\./.test(CODE), "no candidate file");
  assert.match(CODE, /const OUT_DIR = "tools\/avatar\/build\/r3-hair-d180";/);
  for (const id of SPENT_IDS) assert.ok(SRC.includes(id), "lists " + id + " as never-reuse");
  for (const v of [CALL, CLAIM_ID, CLAIM_FILE, EVENTS_FILE, APPROVAL, ADAPTER_REL, PROMPT_REL, PROMPT_SHA, TARGETS_REL, TARGETS_SHA, NORTHSTAR_SHA, MODEL]) assert.ok(SRC.includes(v), "the adapter carries " + v);
  assert.match(SRC, /const REQUIRED_DECISIONS = Object\.freeze\(\["D-142", "D-159", "D-174", "D-178", "D-179", "D-180"\]\);/);
  assert.match(SRC, /const PARAMETERS = Object\.freeze\(\{ size: "1024x1024", quality: "high", n: 1, output_format: "png", background: "transparent" \}\);/);
});

// ── sandbox: a temporary git repository per scenario ─────────────────────────────────────────────────────────────
const SANDBOX_ROOTS = [];
after(() => { for (const root of SANDBOX_ROOTS) if (isInside(root, realpathSync.native(tmpdir())) && /d180-sandbox-/.test(root)) rmSync(root, { recursive: true, force: true }); });

const MOCK_SRC = [
  "// D-180 test mock: replaces globalThis.fetch (and, for the crash windows, node:fs) for one child process. Refuses to load unconfigured.",
  "import fs, { appendFileSync, existsSync, readFileSync, writeFileSync } from \"node:fs\";",
  "import { syncBuiltinESMExports } from \"node:module\";",
  "import { resolve } from \"node:path\";",
  "const LOG = process.env.D180_MOCK_LOG, MODE = process.env.D180_MOCK_MODE, CLAIM = process.env.D180_MOCK_CLAIM, EVENTS = process.env.D180_MOCK_EVENTS,",
  "  PNG = process.env.D180_MOCK_PNG, BODY = process.env.D180_MOCK_BODY;",
  "if (!LOG || !MODE || !CLAIM || !EVENTS || !PNG || !BODY) throw new Error(\"d180 mock: not configured — refusing to run\");",
  "const KEY = \"sk-d180-sandbox-dummy-key-not-a-credential\";",
  "const norm = (p) => { const r = resolve(String(p)); return process.platform === \"win32\" ? r.toLowerCase() : r; };",
  "if (MODE === \"die-at-dispatch\" || MODE === \"fail-dispatch\") {",
  "  const orig = fs.openSync; let failed = false;",
  "  fs.openSync = function (p, ...rest) {",
  "    if (!failed && norm(p) === norm(EVENTS)) {",
  "      if (MODE === \"die-at-dispatch\") process.exit(137);",
  "      failed = true; const e = new Error(\"EIO: mock dispatch-record failure\"); e.code = \"EIO\"; throw e;",
  "    }",
  "    return orig.call(fs, p, ...rest);",
  "  };",
  "  syncBuiltinESMExports();",
  "}",
  "if (MODE === \"torn-dispatch\") {",
  "  const origOpen = fs.openSync, origWrite = fs.writeSync; let eventsFd = null, torn = false;",
  "  fs.openSync = function (p, ...rest) { const fd = origOpen.call(fs, p, ...rest); if (norm(p) === norm(EVENTS)) eventsFd = fd; return fd; };",
  "  fs.writeSync = function (fd, data, ...rest) {",
  "    if (!torn && fd === eventsFd && typeof data === \"string\") { torn = true; origWrite.call(fs, fd, data.slice(0, data.length >> 1)); const e = new Error(\"ENOSPC: mock torn write\"); e.code = \"ENOSPC\"; throw e; }",
  "    return origWrite.call(fs, fd, data, ...rest);",
  "  };",
  "  syncBuiltinESMExports();",
  "}",
  "globalThis.fetch = async function d180MockFetch(url, init) {",
  "  const headers = init && init.headers ? init.headers : {};",
  "  const body = init ? init.body : null;",
  "  appendFileSync(LOG, JSON.stringify({ url: String(url), method: init && init.method, redirect: init && init.redirect, dummyKey: headers.Authorization === \"Bearer \" + KEY,",
  "    claimExistedAtCall: existsSync(CLAIM), eventsAtCall: existsSync(EVENTS) ? readFileSync(EVENTS, \"utf8\") : null,",
  "    fields: body && typeof body.keys === \"function\" ? [...body.keys()] : null,",
  "    images: body && typeof body.getAll === \"function\" ? body.getAll(\"image[]\").map((f) => f.name) : null,",
  "    imageSha: body && typeof body.getAll === \"function\" ? await Promise.all(body.getAll(\"image[]\").map(async (f) => (await import(\"node:crypto\")).createHash(\"sha256\").update(Buffer.from(await f.arrayBuffer())).digest(\"hex\"))) : null,",
  "    prompt: body && typeof body.get === \"function\" ? body.get(\"prompt\") : null, size: body && typeof body.get === \"function\" ? body.get(\"size\") : null,",
  "    background: body && typeof body.get === \"function\" ? body.get(\"background\") : null,",
  "    hasMask: body && typeof body.has === \"function\" ? body.has(\"mask\") : null, hasInputFidelity: body && typeof body.has === \"function\" ? body.has(\"input_fidelity\") : null, pid: process.pid }) + \"\\n\");",
  "  if (MODE === \"slow\") await new Promise((r) => setTimeout(r, 1500));",
  "  if (MODE === \"die-in-fetch\") process.exit(137);",
  "  if (MODE === \"throw\") throw new TypeError(\"fetch failed (mock transport error)\");",
  "  const send = (text, status, id) => { writeFileSync(BODY, text); return new Response(text, { status, headers: { \"content-type\": \"application/json\", \"x-request-id\": id } }); };",
  "  if (MODE === \"http500\") return send(JSON.stringify({ error: { type: \"server_error\", code: null, message: \"mock 500\" } }), 500, \"req_mock500\");",
  "  const pick = (suffix) => readFileSync(PNG + suffix).toString(\"base64\");",
  "  const named = { border: \".border.png\", colour: \".colour.png\", island: \".island.png\", wrongsize: \".wrongsize.png\", low: \".low.png\" };",
  "  const b64 = pick(named[MODE] || \"\");",
  "  const data = MODE === \"two\" ? [{ b64_json: b64 }, { b64_json: pick(\".border.png\") }] : MODE === \"zero\" ? [] : [{ b64_json: b64 }];",
  "  return send(JSON.stringify({ created: 1, data, usage: { total_tokens: 1 } }), 200, \"req_mockok\");",
  "};",
].join("\n");

// The D-177 adapter and its own pinned prompt v2 and targets v1 are copied too, so its refusal of the closed mandate is a real
// authorisation refusal.
const TRACKED = [ADAPTER_REL, PREV_ADAPTER_REL, LEDGER_REL, HAIR_TOOL_REL, EYES_TOOL_REL, PARTS_TOOL_REL, REGISTER_REL, CONTRACT_REL, PROMPT_REL, PREV_PROMPT_REL, TARGETS_REL, PREV_TARGETS_REL, NORTHSTAR_REL];
const at = (x, y) => (y * 1024 + x) * 4;
/** A technical test shape: one grey achromatic ellipse on a transparent 1024x1024 sheet (not a hair design). */
function hairSheet(mutate) {
  const px = new Uint8ClampedArray(1024 * 1024 * 4);
  for (let y = 0; y < 1024; y++) for (let x = 0; x < 1024; x++) if (((x + 0.5 - 512) / 300) ** 2 + ((y + 0.5 - 512) / 260) ** 2 <= 1) px.set([150, 150, 150, 255], at(x, y));
  if (mutate) mutate(px);
  return encodePng(1024, 1024, px);
}
const PNGS = {
  ok: hairSheet(),
  border: hairSheet((px) => px.set([150, 150, 150, 255], at(5, 5))),                                        // H2
  low: hairSheet((px) => px.set([150, 150, 150, 15], at(5, 5))),                                            // alpha 15: reported only
  colour: hairSheet((px) => px.set([170, 150, 150, 255], at(512, 512))),                                    // H3
  island: hairSheet((px) => { for (let y = 800; y < 1000; y++) for (let x = 30; x < 170; x++) px.set([150, 150, 150, 255], at(x, y)); }), // H4
  wrongsize: encodePng(1536, 1024, new Uint8ClampedArray(1536 * 1024 * 4)),                                 // H1
};
function envFor(sb, extra) {
  const env = {};
  for (const k of ["PATH", "Path", "SystemRoot", "windir", "COMSPEC", "PATHEXT", "SystemDrive"]) if (typeof process.env[k] === "string") env[k] = process.env[k];
  Object.assign(env, { LOCALAPPDATA: sb.state, XDG_STATE_HOME: sb.state, HOME: sb.home, USERPROFILE: sb.home, TEMP: sb.tmp, TMP: sb.tmp, TMPDIR: sb.tmp,
    HTTP_PROXY: "http://127.0.0.1:9", HTTPS_PROXY: "http://127.0.0.1:9", NO_PROXY: "", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: sb.gitconfig,
    D180_MOCK_LOG: sb.log, D180_MOCK_MODE: "ok", D180_MOCK_CLAIM: sb.claim, D180_MOCK_EVENTS: sb.events, D180_MOCK_PNG: sb.png, D180_MOCK_BODY: sb.body }, extra || {});
  return env;
}
function sgit(sb, args) {
  const r = spawnSync("git", ["-C", sb.repo, "-c", "user.name=d180-sandbox", "-c", "user.email=sandbox@example.invalid", "-c", "core.autocrlf=false", ...args], { env: envFor(sb), encoding: "utf8", windowsHide: true });
  if (r.status !== 0) throw new Error("sandbox git " + args.join(" ") + ": " + r.stderr);
  return r.stdout.trim();
}
const contractPath = (sb) => join(sb.repo, ...CONTRACT_REL.split("/"));
const registerPath = (sb) => join(sb.repo, ...REGISTER_REL.split("/"));
const editContract = (sb, fn) => { const c = JSON.parse(readFileSync(contractPath(sb), "utf8")); fn(c); writeFileSync(contractPath(sb), JSON.stringify(c, null, 2) + "\n"); };
const editEntry = (fn) => (sb) => editContract(sb, (c) => { const i = c.authorisedCalls.calls.findIndex((e) => e.callId === CALL); c.authorisedCalls.calls[i] = fn(structuredClone(c.authorisedCalls.calls[i])); });
const editImpl = (fn) => (sb) => editContract(sb, (c) => { const i = c.adapterImplementations.entries.findIndex((e) => e.decision === "D-180"); const x = fn(structuredClone(c.adapterImplementations.entries[i])); if (x) c.adapterImplementations.entries[i] = x; else c.adapterImplementations.entries.splice(i, 1); });
const toLive = (sb) => { writeFileSync(contractPath(sb), JSON.stringify(LIVE, null, 2) + "\n"); copyFileSync(repoFile(REGISTER_REL), registerPath(sb)); };

/** A fresh sandbox. Default: the state D-180 committed (D-180 active) as origin/main. `pre`: before D-180 (the D-179 merge). `closed`: since D-181. */
function sandbox({ base, layout = "main", top, pre = false, closed = false } = {}) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "d180-sandbox-")));
  SANDBOX_ROOTS.push(root);
  const sb = { root, repo: join(root, "repo"), state: join(root, "state"), tmp: join(root, "tmp"), home: join(root, "home"), log: join(root, "fetch.log"),
    gitconfig: join(root, "gitconfig"), png: join(root, "mock-output.png"), body: join(root, "mock-body.json"), mock: join(root, "mock.mjs") };
  const reg = join(sb.state, "DenSejeApp", "one-shot-claims", "Moeller888-den-seje-app-frontend");
  sb.claim = join(reg, CLAIM_FILE); sb.events = join(reg, EVENTS_FILE);
  for (const d of [sb.repo, sb.state, sb.tmp, sb.home]) mkdirSync(d, { recursive: true });
  writeFileSync(sb.gitconfig, "[core]\n\tautocrlf = false\n[init]\n\tdefaultBranch = main\n");
  writeFileSync(sb.mock, MOCK_SRC); writeFileSync(sb.log, "");
  writeFileSync(sb.png, PNGS.ok);
  for (const k of ["border", "low", "colour", "island", "wrongsize"]) writeFileSync(sb.png + "." + k + ".png", PNGS[k]);
  for (const rel of [...TRACKED, ".gitignore"]) { const dst = join(sb.repo, ...rel.split("/")); mkdirSync(dirname(dst), { recursive: true }); copyFileSync(repoFile(rel), dst); }
  if (pre) { writeFileSync(contractPath(sb), JSON.stringify(PRE, null, 2) + "\n"); writeFileSync(registerPath(sb), PRE_REGISTER); }
  else if (!closed) writeFileSync(contractPath(sb), JSON.stringify(LIVE, null, 2) + "\n");   // D-180 as committed, before D-181 closed it
  else writeFileSync(contractPath(sb), JSON.stringify(LIVE_NOW, null, 2) + "\n");             // since D-181
  if (base) base(sb);
  sgit(sb, ["init", "-q", "-b", "main"]); sgit(sb, ["add", "-A"]); sgit(sb, ["commit", "-q", "-m", "base"]); sgit(sb, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  if (layout === "worktree") top(sb);
  else if (layout === "branch" || layout === "detached") {
    if (layout === "branch") sgit(sb, ["checkout", "-q", "-b", "local-d180"]); else sgit(sb, ["checkout", "-q", "--detach"]);
    top(sb); sgit(sb, ["add", "-A"]); sgit(sb, ["commit", "-q", "-m", "D-180 not merged"]);
  }
  return sb;
}
function runFile(sb, rel, args, extra) {
  const r = spawnSync(process.execPath, ["--import", pathToFileURL(sb.mock).href, join(sb.repo, ...rel.split("/")), ...args], { cwd: sb.repo, env: envFor(sb, extra), encoding: "utf8", windowsHide: true, timeout: 180000 });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
const runAdapter = (sb, args, extra) => runFile(sb, ADAPTER_REL, args, extra);
const fetchLog = (sb) => readFileSync(sb.log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const outDir = (sb) => join(sb.repo, "tools", "avatar", "build", "r3-hair-d180");
const outFile = (sb, n) => join(outDir(sb), "r3-hair-d180." + n);
const KEY_ENV = { OPENAI_API_KEY: DUMMY_KEY };
const onDisk = (sb) => deriveAttempt({ claimPresent: existsSync(sb.claim), eventsText: existsSync(sb.events) ? readFileSync(sb.events, "utf8") : null, callId: CALL });
const manifest = (sb) => JSON.parse(readFileSync(outFile(sb, "request.json"), "utf8"));
const checkDoc = (sb) => JSON.parse(readFileSync(outFile(sb, "check.json"), "utf8"));
function assertRefusedBeforeClaim(sb, r, stage) {
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, new RegExp("REFUSED \\[" + stage.replace(/[-[\]]/g, "\\$&") + "\\]"), r.out);
  assert.equal(existsSync(sb.claim), false, "no claim"); assert.equal(existsSync(sb.events), false, "no event log");
  assert.equal(fetchLog(sb).length, 0, "no fetch"); assert.equal(existsSync(outDir(sb)), false, "no output");
}
const allSandboxText = (sb) => { const out = []; const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (n === ".git" || p === sb.mock) continue; if (statSync(p).isDirectory()) walk(p); else if (statSync(p).size < 8e6) out.push(readFileSync(p, "latin1")); } }; walk(sb.root); return out.join("\n"); };

test("isolation is proven first: every derived path is inside the sandbox, the mock refuses to run unconfigured, and the synthetic sheets do what they claim", () => {
  const sb = sandbox();
  for (const p of [sb.repo, sb.state, sb.tmp, sb.claim, sb.events, sb.log]) assert.ok(isInside(p, sb.root), p);
  const r = spawnSync(process.execPath, ["--import", pathToFileURL(sb.mock).href, "-e", "0"], { env: { PATH: process.env.PATH || "", SystemRoot: process.env.SystemRoot || "" }, encoding: "utf8" });
  assert.notEqual(r.status, 0); assert.match(r.stderr, /not configured/);
  assert.equal(checkHairSheet(Buffer.from(PNGS.ok)).verdict, "PASS_TO_ANNOTATION");
  for (const [k, id] of [["border", "H2"], ["colour", "H3"], ["island", "H4"], ["wrongsize", "H1"]]) assert.equal(checkHairSheet(Buffer.from(PNGS[k])).firstFailure, id, k);
});

// ── the committed state ─────────────────────────────────────────────────────────────────────────────────────────
test("THE LIVE D-180 STATE: the dry run passes with the real tracked pins and NO credential, writes nothing, claims nothing, sends nothing", () => {
  const sb = sandbox();
  const r = runAdapter(sb, GOOD_ARGS);
  assert.equal(r.status, 0, r.out); assert.match(r.out, /DRY RUN PASSED/);
  assert.match(r.out, /authorisation : exactly one active, unspent D-180-r3-hair-northstar-v3 entry and one D-180 implementation entry in origin\/main/);
  assert.match(r.out, /size 1024x1024/);
  assert.equal(existsSync(sb.claim), false); assert.equal(existsSync(sb.events), false); assert.equal(fetchLog(sb).length, 0); assert.equal(existsSync(outDir(sb)), false);
  assert.equal(readdirSync(sb.state).length, 0, "the claim register was not even created");
});
test("BEFORE D-180 nothing could send: the reconstructed pre-D-180 state is refused before any claim", () => {
  const sb = sandbox({ pre: true });
  const r = runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV);
  assertRefusedBeforeClaim(sb, r, "register"); assert.match(r.out, /D-180 appears 0 times/);
  // with the register row but the D-179 contract, the authorisation is missing and prompt v3 is still a DRAFT
  const c = sandbox({ base: (s) => writeFileSync(contractPath(s), JSON.stringify(PRE, null, 2) + "\n") });
  const rc = runAdapter(c, [...GOOD_ARGS, ...SEND], KEY_ENV);
  assertRefusedBeforeClaim(c, rc, "authorisation"); assert.match(rc.out, /the hair prompt v3 is not FROZEN by D-180/); assert.match(rc.out, /authorises 0 entries for D-180-r3-hair-northstar-v3/);
});
test("an authorisation only in the working tree, on a local branch or on a detached HEAD is refused before the claim", () => {
  const wt = sandbox({ pre: true, layout: "worktree", top: toLive }); assertRefusedBeforeClaim(wt, runAdapter(wt, [...GOOD_ARGS, ...SEND], KEY_ENV), "blob-divergence");
  const br = sandbox({ pre: true, layout: "branch", top: toLive }); assertRefusedBeforeClaim(br, runAdapter(br, [...GOOD_ARGS, ...SEND], KEY_ENV), "branch");
  const dt = sandbox({ pre: true, layout: "detached", top: toLive }); assertRefusedBeforeClaim(dt, runAdapter(dt, [...GOOD_ARGS, ...SEND], KEY_ENV), "head-not-origin-main");
});
test("D-177 STAYS CLOSED: in the live D-180 state, the D-177 adapter is refused before any claim", () => {
  const sb = sandbox();
  const r = runFile(sb, PREV_ADAPTER_REL, ["--call-id=D-177-r3-hair-northstar-v2", "--claim-identity=D-177-r3-hair-northstar-v2-claim", "--send", "--owner-approval=D-177"], KEY_ENV);
  assert.equal(r.status, 1, r.out); assert.match(r.out, /REFUSED \[authorisation\]/); assert.match(r.out, /mandateState: "SPENT", expected "UNSPENT"/);
  assert.equal(fetchLog(sb).length, 0); assert.equal(readdirSync(sb.state).length, 0, "the D-177 adapter created nothing in the claim register");
});

for (const [label, args] of [
  ["a wrong call-id", ["--call-id=D-180-r3-hair-northstar-v4", "--claim-identity=" + CLAIM_ID, ...SEND]],
  ["an afro call-id", ["--call-id=D-180-r3-hair-afro-v1", "--claim-identity=" + CLAIM_ID, ...SEND]],
  ...SPENT_IDS.map((id) => ["the spent call-id " + id, ["--call-id=" + id, "--claim-identity=" + CLAIM_ID, ...SEND]]),
  ["D-177's spent claim identity", ["--call-id=" + CALL, "--claim-identity=D-177-r3-hair-northstar-v2-claim", ...SEND]],
  ["a wrong claim identity", ["--call-id=" + CALL, "--claim-identity=D-180-other-claim", ...SEND]],
  ["--send without the approval", [...GOOD_ARGS, "--send"]],
  ["the approval without --send", [...GOOD_ARGS, APPROVAL]],
  ["D-177's approval", [...GOOD_ARGS, "--send", "--owner-approval=D-177"]],
  ["D-179's approval", [...GOOD_ARGS, "--send", "--owner-approval=D-179"]],
  ["--retry", [...GOOD_ARGS, ...SEND, "--retry"]],
  ["--size", [...GOOD_ARGS, ...SEND, "--size=1536x1024"]],
  ["--targets", [...GOOD_ARGS, ...SEND, "--targets=" + PREV_TARGETS_REL]],
  ["--prompt", [...GOOD_ARGS, ...SEND, "--prompt=" + PREV_PROMPT_REL]],
  ["a duplicate --send", [...GOOD_ARGS, ...SEND, "--send"]],
]) test("refused before the claim: " + label, () => { const sb = sandbox(); assertRefusedBeforeClaim(sb, runAdapter(sb, args, KEY_ENV), "arguments"); });

test("refused before the claim: an inactive, spent, closed, duplicated or second permission, or a bent D-174 or D-179 hair method", () => {
  for (const [label, base] of [
    ["mandate SPENT", editEntry((e) => ({ ...e, mandateState: "SPENT" }))],
    ["status PREPARED", editEntry((e) => ({ ...e, status: "PREPARED — NOT AUTHORISED" }))],
    ["already attempted", editEntry((e) => ({ ...e, outcome: "EXECUTED ONCE" }))],
    ["neverReuse", editEntry((e) => ({ ...e, neverReuse: true }))],
    ["closed", editEntry((e) => ({ ...e, closedBy: "D-181" }))],
    ["another decision", editEntry((e) => ({ ...e, decision: "D-181" }))],
    ["prepared by D-179", editEntry((e) => ({ ...e, preparedBy: "D-179" }))],
    ["H1..H5 not bound", editEntry((e) => ({ ...e, outputHandling: { ...e.outputHandling, technicalChecks: "E1..E5" } }))],
    ["placement not left to the compose tool", editEntry((e) => ({ ...e, outputHandling: { ...e.outputHandling, composition: "placed by hand" } }))],
    ["placement by the v1 compose tool", editEntry((e) => ({ ...e, outputHandling: { ...e.outputHandling, composition: "Placement is done ONLY by tools/avatar/r3-hair-compose.mjs" } }))],
    ["a v1 annotation", editEntry((e) => ({ ...e, outputHandling: { ...e.outputHandling, annotation: "the four fit anchors as DRAFT (annotation-hair-v1)" } }))],
    ["no hidden second reading", editEntry((e) => ({ ...e, outputHandling: { ...e.outputHandling, annotation: "DRAFT annotation-hair-v2, A9 and A10 read once" } }))],
    ["other hairstyles no longer excluded", editEntry((e) => ({ ...e, otherHairstyles: "authorised" }))],
    ["no implementation entry", editImpl(() => null)],
    ["implementation executed", editImpl((x) => ({ ...x, adapter: { ...x.adapter, status: "IMPLEMENTED — EXECUTED ONCE — SPENT" } }))],
    ["implementation pins a hash", editImpl((x) => ({ ...x, adapter: { ...x.adapter, sha256: "0".repeat(64) } }))],
    ["D-177 reopened", (sb) => editContract(sb, (c) => { const d = c.authorisedCalls.calls.find((e) => e.decision === "D-177"); d.mandateState = "UNSPENT"; })],
    ["D-175 reopened", (sb) => editContract(sb, (c) => { const d = c.authorisedCalls.calls.find((e) => e.decision === "D-175"); d.mandateState = "UNSPENT"; })],
    ["a second live permission", (sb) => editContract(sb, (c) => { const d = c.authorisedCalls.calls.find((e) => e.decision === "D-160"); d.mandateState = "UNSPENT"; delete d.neverReuse; })],
    ["the general flag flipped", (sb) => editContract(sb, (c) => { c.meta.authorisesImageRequest = true; })],
    ["two entries for the call", (sb) => editContract(sb, (c) => { c.authorisedCalls.calls.push(structuredClone(c.authorisedCalls.calls.find((e) => e.callId === CALL))); })],
    ["D-174 method missing", (sb) => editContract(sb, (c) => { delete c.hairMethod; })],
    ["D-174 method is an authorisation", (sb) => editContract(sb, (c) => { c.hairMethod.isAuthorisation = true; })],
    ["prompt v3 still a draft", (sb) => editContract(sb, (c) => { c.hairMethod.methodV2.promptV3.status = PRE_D180.promptV3Status; })],
    ["prompt v3 frozen by another decision", (sb) => editContract(sb, (c) => { c.hairMethod.methodV2.promptV3.status = "FROZEN by D-177"; })],
    ["the method's prompt v3 pin changed", (sb) => editContract(sb, (c) => { c.hairMethod.methodV2.promptV3.sha256 = "0".repeat(64); })],
    ["prompt v3 missing", (sb) => editContract(sb, (c) => { delete c.hairMethod.methodV2.promptV3; })],
    ["targets v2 back to DRAFT", (sb) => editContract(sb, (c) => { c.hairMethod.methodV2.targets.status = "DRAFT"; })],
    ["targets v2 pin changed", (sb) => editContract(sb, (c) => { c.hairMethod.methodV2.targets.sha256 = TARGETS_V1_SHA; })],
    ["methodV2 missing", (sb) => editContract(sb, (c) => { delete c.hairMethod.methodV2; })],
    ["methodV2 is an authorisation", (sb) => editContract(sb, (c) => { c.hairMethod.methodV2.isAuthorisation = true; })],
    ["the hidden repeated reading weakened", (sb) => editContract(sb, (c) => { c.hairMethod.methodV2.registration.repeatedReading = "OPTIONAL"; })],
    ["a threshold changed", (sb) => editContract(sb, (c) => { c.hairMethod.thresholds.chromaMax = 40; })],
    ["an H-check dropped", (sb) => editContract(sb, (c) => { c.hairMethod.checks.rawSheet.binding.pop(); })],
    ["the sheet size in the method changed", (sb) => editContract(sb, (c) => { c.hairMethod.rawSheet.size = [1536, 1024]; })],
    ["D-159's section missing", (sb) => editContract(sb, (c) => { delete c.faceNeutralPreparation; })],
  ]) {
    const sb = sandbox({ base }); const r = runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV);
    assert.equal(r.status, 1, label + "\n" + r.out); assert.match(r.out, /REFUSED \[(authorisation|implementation)\]/, label + "\n" + r.out);
    assert.equal(existsSync(sb.claim), false, label); assert.equal(fetchLog(sb).length, 0, label);
  }
});

test("refused before the claim: any changed pin or input in the authorisation entry", () => {
  for (const [label, fn] of [
    ["model", (e) => ({ ...e, model: "gpt-image-2-2026-04-21" })],
    ["a landscape size", (e) => ({ ...e, parameters: { ...e.parameters, size: "1536x1024" } })],
    ["background", (e) => ({ ...e, parameters: { ...e.parameters, background: "opaque" } })],
    ["n = 2", (e) => ({ ...e, parameters: { ...e.parameters, n: 2 } })],
    ["extra parameter", (e) => ({ ...e, parameters: { ...e.parameters, input_fidelity: "high" } })],
    ["a second input", (e) => ({ ...e, inputs: [...e.inputs, { ...e.inputs[0], order: 2, role: "Image 2" }] })],
    ["the eyes prompt", (e) => ({ ...e, prompt: { ...e.prompt, sha256: "eb51a3eac075cc3144c99c0d237bde4a1251015420a4baee2d2906a41620f281", bytes: 2466 } })],
    ["the eye targets", (e) => ({ ...e, targets: { ...e.targets, sha256: "b67c7ade689a3641ea7e51c7994c30012a40c6b30c65c63fa845885653d24d5f" } })],
    ["D-175's prompt v1", (e) => ({ ...e, prompt: { ...e.prompt, sha256: PROMPT_V1_SHA, bytes: 1029 } })],
    ["D-177's prompt v2", (e) => ({ ...e, prompt: { ...e.prompt, file: PREV_PROMPT_REL, sha256: PROMPT_V2_SHA, bytes: 1289 } })],
    ["the v1 targets", (e) => ({ ...e, targets: { ...e.targets, file: PREV_TARGETS_REL, sha256: TARGETS_V1_SHA } })],
    ["a second model", (e) => ({ ...e, model: MODEL + "-fallback" })],
    ["a mask in the field order", (e) => ({ ...e, fieldOrder: [...e.fieldOrder, "mask"] })],
    ["claim identity", (e) => ({ ...e, claim: { ...e.claim, identity: "D-177-r3-hair-northstar-v2-claim" } })],
    ["adapter file", (e) => ({ ...e, adapter: { file: PREV_ADAPTER_REL } })],
    ["two outputs", (e) => ({ ...e, outputs: { ...e.outputs, count: 2 } })],
    ["counted as eyes", (e) => ({ ...e, accounting: { slot: "eyes-fixed" } })],
  ]) {
    const sb = sandbox({ base: editEntry(fn) }); const r = runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV);
    assert.equal(r.status, 1, label); assert.match(r.out, /REFUSED \[authorisation\]/, label + "\n" + r.out);
    assert.equal(existsSync(sb.claim), false, label); assert.equal(fetchLog(sb).length, 0, label);
  }
});
test("refused before the claim: changed prompt, targets or North Star bytes committed to origin/main — only the pinned bytes are used", () => {
  for (const [rel, mutate] of [[PROMPT_REL, (b) => Buffer.from(b.toString("utf8").replace("greyscale", "colour"), "utf8")], [PROMPT_REL, (b) => b.subarray(0, b.length - 1)],
    [TARGETS_REL, (b) => Buffer.concat([b, Buffer.from("\n")])], [NORTHSTAR_REL, (b) => { b[b.length - 20] ^= 0xff; return b; }]]) {
    const sb = sandbox({ base: (s) => { const p = join(s.repo, ...rel.split("/")); writeFileSync(p, mutate(readFileSync(p))); } });
    assertRefusedBeforeClaim(sb, runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV), "pins");
  }
});
test("refused before the claim: a register row that is missing or doubled", () => {
  const none = sandbox({ base: (s) => writeFileSync(registerPath(s), readFileSync(registerPath(s), "utf8").split("\n").filter((l) => !l.startsWith("| **D-174** |")).join("\n")) });
  assertRefusedBeforeClaim(none, runAdapter(none, [...GOOD_ARGS, ...SEND], KEY_ENV), "register");
  const twice = sandbox({ base: (s) => writeFileSync(registerPath(s), readFileSync(registerPath(s), "utf8") + "\n" + ROW + "\n") });
  assertRefusedBeforeClaim(twice, runAdapter(twice, [...GOOD_ARGS, ...SEND], KEY_ENV), "register");
});
test("refused before the claim: a local edit of the adapter, the ledger, the hair tool or a library it imports in the working tree", () => {
  for (const rel of [ADAPTER_REL, LEDGER_REL, HAIR_TOOL_REL, EYES_TOOL_REL, PARTS_TOOL_REL]) {
    const sb = sandbox(); const p = join(sb.repo, ...rel.split("/"));
    writeFileSync(p, readFileSync(p, "utf8") + "\n// local edit\n");
    assertRefusedBeforeClaim(sb, runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV), "blob-divergence");
  }
});
test("refused before the claim: an existing claim or event log (another clone's), never touched; existing outputs", () => {
  for (const which of ["claim", "events"]) {
    const sb = sandbox(); mkdirSync(dirname(sb.claim), { recursive: true }); writeFileSync(sb[which], "{}"); const before = sha256(readFileSync(sb[which]));
    const r = runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV);
    assert.equal(r.status, 1); assert.match(r.out, which === "claim" ? /REFUSED \[claim-exists\]/ : /REFUSED \[events-exist\]/);
    assert.equal(sha256(readFileSync(sb[which])), before); assert.equal(fetchLog(sb).length, 0);
  }
  const sb = sandbox(); mkdirSync(outDir(sb), { recursive: true }); writeFileSync(outFile(sb, "request.json"), "x");
  const r = runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV); assert.equal(r.status, 1); assert.match(r.out, /REFUSED \[outputs-not-empty\]/); assert.equal(fetchLog(sb).length, 0);
});
test("a send without a key is refused at the key, after every check and before the claim", () => {
  const sb = sandbox(); assertRefusedBeforeClaim(sb, runAdapter(sb, [...GOOD_ARGS, ...SEND]), "key");
});

// ── the mocked send, with the PRODUCTION adapter and the REAL tracked pins ─────────────────────────────────────────
test("a normal hair sheet — claim, dispatch record, ONE fetch of exactly the pinned bytes; H1..H5 pass; stored; no candidate, no placement; no retry", () => {
  const sb = sandbox();
  const r = runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV);
  assert.equal(r.status, 0, r.out);
  const log = fetchLog(sb); assert.equal(log.length, 1); const L = log[0];
  assert.equal(L.claimExistedAtCall, true);
  assert.deepEqual(parseEvents(L.eventsAtCall, CALL).records.map((x) => x.event), ["dispatch"]);
  assert.deepEqual([L.url, L.method, L.redirect, L.dummyKey], ["https://api.openai.com/v1/images/edits", "POST", "error", true]);
  assert.deepEqual(L.fields, ["model", "image[]", "prompt", "size", "quality", "n", "output_format", "background"]);
  assert.deepEqual([L.images, L.imageSha, L.size], [["Northstar Master v2.png"], [NORTHSTAR_SHA], "1024x1024"]);
  assert.equal(L.prompt, readFileSync(repoFile(PROMPT_REL), "utf8"), "the frozen prompt v3, byte for byte");
  assert.deepEqual([L.background, L.hasMask, L.hasInputFidelity], ["transparent", false, false]);
  const m = manifest(sb);
  assert.deepEqual([m.outcome.classification, m.outcome.fetches, m.outcome.automaticRetry, m.outcome.candidateWritten, m.outcome.promoted, m.outcome.runtimeChanged], ["PASS_TO_VISUAL_REVIEW_AND_ANNOTATION", 1, false, false, false, false]);
  assert.deepEqual([m.accounting.claimState, m.accounting.dispatch, m.accounting.result, m.accounting.actuallySent, m.accounting.serverAnswered], ["consumed", "started", "response", 1, true]);
  assert.match(m.slot, /never an underlay, face-neutral or eyes call/);
  const c = checkDoc(sb);
  assert.equal(c.verdict, "PASS_TO_ANNOTATION"); assert.deepEqual(c.auto.map((a) => a.id), ["H1", "H2", "H3", "H4", "H5"]);
  assert.deepEqual(c.thresholds, JSON.parse(JSON.stringify(THRESHOLDS)));
  assert.match(c.note, /does not approve its appearance/); assert.match(c.placement, /ONLY by tools\/avatar\/r3-hair-compose-v2\.mjs/);
  assert.match(c.placement, /need that owner-APPROVED annotation and are NOT run on the raw sheet/);
  assert.match(c.annotation, /DRAFT, bound to this image's SHA-256/); assert.match(c.annotation, /the second time with the first reading hidden/); assert.match(c.annotation, /only the owner sets APPROVED/);
  assert.match(m.outcome.reason, /no D-179 placement or shape check/);
  assert.ok(!("px" in c), "no pixel array in the check document");
  assert.ok(!/"HP|E1|RAW-4|AUTO-5/.test(JSON.stringify(c.auto)), "neither a placement, shape, eyes or face check");
  assert.equal(sha256(readFileSync(outFile(sb, "response.json"))), sha256(readFileSync(sb.body)));
  assert.equal(sha256(readFileSync(outFile(sb, "image-1.png"))), sha256(readFileSync(sb.png)));
  assert.deepEqual(readdirSync(outDir(sb)).sort(), ["r3-hair-d180.check.json", "r3-hair-d180.image-1.png", "r3-hair-d180.request.json", "r3-hair-d180.response.json"]);
  assert.ok(!allSandboxText(sb).includes(DUMMY_KEY.slice(3)) && !r.out.includes(DUMMY_KEY.slice(3)), "the key appears nowhere");
  const again = runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV);
  assert.equal(again.status, 1); assert.match(again.out, /REFUSED \[claim-exists\]/); assert.equal(fetchLog(sb).length, 1);
});
test("the sheet's own checks: a border pixel, a coloured pixel, a second island or a wrong size is a TECHNICAL_REJECT; alpha 15 is only reported", () => {
  for (const [mode, first] of [["border", "H2"], ["colour", "H3"], ["island", "H4"], ["wrongsize", "H1"]]) {
    const sb = sandbox(); const r = runAdapter(sb, [...GOOD_ARGS, ...SEND], { ...KEY_ENV, D180_MOCK_MODE: mode });
    assert.equal(r.status, 0, mode + "\n" + r.out);
    const m = manifest(sb); assert.deepEqual([m.outcome.classification, m.check.firstFailure, m.outcome.candidateWritten], ["TECHNICAL_REJECT", first, false], mode);
    assert.ok(existsSync(outFile(sb, "image-1.png")), mode + ": the rejected sheet is still kept unchanged");
    assert.equal(runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV).status, 1, "no retry after " + mode); assert.equal(fetchLog(sb).length, 1);
  }
  const low = sandbox(); assert.equal(runAdapter(low, [...GOOD_ARGS, ...SEND], { ...KEY_ENV, D180_MOCK_MODE: "low" }).status, 0);
  const c = checkDoc(low); assert.equal(c.verdict, "PASS_TO_ANNOTATION");
  assert.equal(c.diag.find((d) => d.id === "H-LOWALPHA").value, 1);
});
test("HTTP error, transport error and a crash inside the network call — sent, no retry, the result never downgrades the dispatch", () => {
  for (const [mode, code, cls, result, answered] of [["http500", 3, "HTTP_ERROR", "http-error", true], ["throw", 3, "DISPATCHED_RESULT_UNKNOWN", "unknown", false], ["die-in-fetch", 137, null, "unknown", false]]) {
    const sb = sandbox(); const r = runAdapter(sb, [...GOOD_ARGS, ...SEND], { ...KEY_ENV, D180_MOCK_MODE: mode });
    assert.equal(r.status, code, mode + "\n" + r.out);
    const d = onDisk(sb); assert.deepEqual([d.dispatch, d.result, d.actuallySent, d.serverAnswered], ["started", result, 1, answered], mode);
    if (cls) assert.equal(manifest(sb).outcome.classification, cls);
    assert.equal(runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV).status, 1, "no retry after " + mode); assert.equal(fetchLog(sb).length, 1);
  }
});
test("crash windows before the network: claim → dispatch undetermined; dispatch record fails or is torn → documented stop; nothing fetched", () => {
  const a = sandbox(); assert.equal(runAdapter(a, [...GOOD_ARGS, ...SEND], { ...KEY_ENV, D180_MOCK_MODE: "die-at-dispatch" }).status, 137);
  assert.deepEqual([onDisk(a).dispatch, onDisk(a).dispatchUndetermined, fetchLog(a).length], ["undetermined", 1, 0]);
  assert.equal(runAdapter(a, [...GOOD_ARGS, ...SEND], KEY_ENV).status, 1, "no retry");
  for (const mode of ["fail-dispatch", "torn-dispatch"]) {
    const sb = sandbox(); assert.equal(runAdapter(sb, [...GOOD_ARGS, ...SEND], { ...KEY_ENV, D180_MOCK_MODE: mode }).status, 3, mode);
    const m = manifest(sb); assert.deepEqual([m.outcome.classification, m.accounting.dispatch, m.accounting.actuallySent, fetchLog(sb).length], ["NOT_DISPATCHED", "not-started", 0, 0], mode);
    assert.deepEqual(parseEvents(readFileSync(sb.events, "utf8"), CALL).records.map((x) => x.event), ["stop"], mode);
  }
});
test("an unexpected image count is kept whole without selection or check", () => {
  const two = sandbox(); assert.equal(runAdapter(two, [...GOOD_ARGS, ...SEND], { ...KEY_ENV, D180_MOCK_MODE: "two" }).status, 0);
  const m2 = manifest(two); assert.deepEqual([m2.outcome.classification, m2.images.count, m2.check], ["UNEXPECTED", 2, null]);
  assert.ok(existsSync(outFile(two, "image-1.png")) && existsSync(outFile(two, "image-2.png")) && !existsSync(outFile(two, "check.json")));
  const zero = sandbox(); assert.equal(runAdapter(zero, [...GOOD_ARGS, ...SEND], { ...KEY_ENV, D180_MOCK_MODE: "zero" }).status, 0);
  assert.equal(manifest(zero).outcome.classification, "UNEXPECTED");
});
test("two simultaneous processes cannot send two requests", async () => {
  const sb = sandbox();
  const one = () => new Promise((res) => { const c = spawn(process.execPath, ["--import", pathToFileURL(sb.mock).href, join(sb.repo, ...ADAPTER_REL.split("/")), ...GOOD_ARGS, ...SEND],
    { cwd: sb.repo, env: envFor(sb, { ...KEY_ENV, D180_MOCK_MODE: "slow" }), windowsHide: true }); let out = ""; c.stdout.on("data", (d) => { out += d; }); c.stderr.on("data", (d) => { out += d; }); c.on("close", (code) => res({ code, out })); });
  const [a, b] = await Promise.all([one(), one()]);
  assert.equal(fetchLog(sb).length, 1); assert.deepEqual([a.code, b.code].sort(), [0, 1], a.out + "\n----\n" + b.out);
});
test("two clones share one claim register: a claim made from one clone refuses the send from another", () => {
  const first = sandbox(); assert.equal(runAdapter(first, [...GOOD_ARGS, ...SEND], KEY_ENV).status, 0);
  const second = sandbox();
  const r = runAdapter(second, [...GOOD_ARGS, ...SEND], { ...KEY_ENV, LOCALAPPDATA: first.state, XDG_STATE_HOME: first.state, D180_MOCK_CLAIM: first.claim, D180_MOCK_EVENTS: first.events });
  assert.equal(r.status, 1, r.out); assert.match(r.out, /REFUSED \[claim-exists\]/);
  assert.equal(fetchLog(second).length, 0, "the second clone sent nothing");
});

// ── D-181: the one send is recorded and the mandate is closed (disposition: kept for review, not visually approved) ──
const D181_ROW = REGISTER.split("\n").find((l) => l.startsWith("| **D-181** |"));
const E_NOW = LIVE_NOW.authorisedCalls.calls.find((e) => e.callId === CALL);
const IMPL_NOW = LIVE_NOW.adapterImplementations.entries.find((e) => e.decision === "D-180");
const RAW_SHA_D180 = "e310112edb92913c2c5acfbb3a7af418be118c52583f21fe475d91cdfd5b1d4a";
const REQUEST_ID_D180 = "req_35b74ddf9bf74236ae703007ff0c9a08";
const D180_ROW_SHA_AT_D180 = "7bc2e562f1fc62f578c8451fc3a350d3a72c88ea0969d1bb287c82b72b042813";   // the D-180 row at the D-180 merge (1440ddb)

test("D-181 changes exactly the closure: the contract as D-180 committed it is reproduced canonically", () => {
  assert.equal(sha256(JSON.stringify(LIVE)), PRE_D181_CONTRACT_CANONICAL_SHA256, "LIVE_NOW with D-181's closure reversed is the contract at " + PRE_D181_COMMIT);
  assert.equal(sha256(JSON.stringify(preD180Contract(LIVE_NOW))), PRE_D180_CONTRACT_CANONICAL_SHA256, "and the older chain still holds");
  assert.deepEqual(Object.keys(LIVE_NOW), Object.keys(LIVE), "no top-level key is added");
  assert.deepEqual(LIVE_NOW.authorisedCalls.calls.slice(0, 13), LIVE.authorisedCalls.calls.slice(0, 13), "the thirteen earlier entries are unchanged");
  assert.deepEqual(LIVE_NOW.adapterImplementations.entries.slice(0, -1), LIVE.adapterImplementations.entries.slice(0, -1));
  assert.deepEqual([LIVE_NOW.authorisedCalls.count, LIVE_NOW.authorisedCalls.calls.length], [14, 14], "no entry is added");
  for (const k of ["assets", "hairMethod", "eyesPartsMethod", "deterministicOperations", "layerContract", "zModel", "meta", "architecture", "irisContract"]) assert.deepEqual(LIVE_NOW[k], LIVE[k], k + " is unchanged — no target, threshold, definition or check moves");
  assert.deepEqual([LIVE_NOW.imageCallBudget.minimum, LIVE_NOW.imageCallBudget.maximum, LIVE_NOW.imageCallBudget.callsPlannedAndAuthorised], [LIVE.imageCallBudget.minimum, LIVE.imageCallBudget.maximum, LIVE.imageCallBudget.callsPlannedAndAuthorised], "no new capacity");
  assert.equal(sha256(JSON.stringify(LIVE.authorisedCalls.calls.find((e) => e.callId === CALL))), E_NOW.closure.snapshotCanonicalSha256BeforeClosure);
  for (const k of Object.keys(E)) { if (["status", "mandateState", "outcome"].includes(k)) continue; assert.deepEqual(E_NOW[k], E[k], "D-180's authorisation field " + k + " is preserved"); }
  assert.deepEqual([PRE_D181.d180.mandateState, PRE_D181.d180impl.mandateState], ["UNSPENT", "UNSPENT"]);
});

test("D-181 closes D-180 in place: SPENT, never reused, not a permission; H1..H5 passed, D-179 checks not evaluated, no annotation; kept for review, not visually approved", () => {
  assert.deepEqual([E_NOW.mandateState, E_NOW.neverReuse, E_NOW.notAnActivePermission, E_NOW.closure.closedBy], ["SPENT", true, true, "D-181"]);
  assert.match(E_NOW.status, /^SPENT — SENT ONCE, HTTP 200, ONE IMAGE RECEIVED, H1\.\.H5 PASSED, D-179 PLACEMENT AND SHAPE CHECKS NOT EVALUATED, NO SOURCE ANNOTATION, NO CANDIDATE, NOTHING PROMOTED$/);
  assert.match(E_NOW.outcome, /H1\.\.H5 PASSED .*D-179 PLACEMENT AND SHAPE CHECKS NOT EVALUATED .*NO SOURCE ANNOTATION .*NO VISUAL APPROVAL .*NO CANDIDATE .*DISPOSITION: KEPT FOR REVIEW$/);
  assert.match(E_NOW.closure.disposition, /^KEPT FOR REVIEW, NOT VISUALLY APPROVED — .*byte for byte where they are and untracked.*approves nothing: no source anchor, no annotation, no placement, no candidate\.$/);
  const x = E_NOW.execution;
  assert.deepEqual([x.request.fetches, x.request.retried, x.request.requestId, x.response.httpStatus, x.response.imagesReturned], [1, false, REQUEST_ID_D180, 200, 1]);
  assert.deepEqual([x.raw.sha256, x.raw.bytes, x.request.promptSha256], [RAW_SHA_D180, 907454, PROMPT_SHA]);
  assert.deepEqual(x.request.parameters, { size: "1024x1024", quality: "high", n: 1, output_format: "png", background: "transparent" });
  assert.deepEqual(x.accounting, { claimState: "consumed", dispatch: "started", result: "response", actuallySent: 1, dispatchUndetermined: 0, serverAnswered: true, automaticRetry: false, logConsistent: true });
  assert.match(x.sentBy, /1440ddbf7f92ec4348004d274b3d3af9c612ba29.*46e2865d0d2f57cc4a18eed228b84c739aabac13e29f294ec736cadf95003a8b/);
  assert.deepEqual([x.claim.sha256, x.eventLog.sha256, x.response.bodySha256, x.manifest.sha256], ["f2767eb4fb7849159d839632fff67bf5bf4c962f8240305ac41b50377193d04d", "88e8cccd9f78333df61e02b60fe29c104fa202bbbf5cf4b835bdedf1fd863998", "2e66f5cef516b79fc20172cd0abe21a193210411856a0dd173fea17dfadeaf2e", "2ed3b1ee5b23d5e617f713b55dc9daab6dab6411a4848105f1e1f699142c9fda"]);
  assert.match(x.runCircumstances.ciAtSendTime, /Main CI on 1440ddb was not awaited before the send/);
  const t = E_NOW.technicalObservations;
  assert.match(t.passed, /^H1 .*H2 0 px .*H3 max chroma 10 .*H4 1 component, 290695 of 290695 .*H5 visible area fraction 0\.2772\. Verdict PASS_TO_ANNOTATION\.$/);
  assert.match(t.proves, /prove nothing about the hairstyle's form, the fit points, the temple locks, a placement or the appearance/);
  assert.match(t.notEvaluated, /^D-179's placement and shape checks \(HP1v2 seat residual and aspect, HP2, HP-LOCK, HP4v2\.\.HP8, HP-FRAG\) were not evaluated/);
  const r = t.identifiabilityReview;
  assert.match(r.status, /not an owner approval and not an annotation/);
  for (const k of ["centreHairlineA4", "leftEarTopJunctionA9", "rightEarTopJunctionA10"]) assert.match(r[k], /^NOT_IDENTIFIABLE/, k);
  assert.match(r.consequence, /no reduced fit\. No v2 DRAFT annotation was made and compose-v2 was not run\./);
  assert.match(r.templeLocks, /Image-right: no separate temple lock/);
  assert.match(t.halo, /no visible halo on light or dark/);
  assert.ok(!/(HP1v2|HP2|HP-LOCK|HP-FRAG|HP[4-8]v?2?)[^.]{0,20}\b(passed|PASS)\b/.test(JSON.stringify(t)), "no D-179 check is recorded as passed");
  assert.match(E_NOW.visualReview.status, /no V-shaped parting and no long central lock.*no short lower edge with a readable ear transition on either side.*image-right temple lock is not a separate lock/);
  assert.match(E_NOW.visualReview.ownerDecision, /^Disposition: KEPT FOR REVIEW, NOT VISUALLY APPROVED\. No candidate, no source annotation and no visual approval are given\./);
  assert.deepEqual([IMPL_NOW.adapter.status, IMPL_NOW.mandateState, IMPL_NOW.neverReuse, IMPL_NOW.closedBy], ["IMPLEMENTED — EXECUTED ONCE — SPENT", "SPENT", true, "D-181"]);
});

test("D-181's accounting: hair 2 -> 3 exactly once, the other figures and the budget 25-26 unchanged; no entry is a live permission", () => {
  const b = LIVE_NOW.imageCallBudget, s = b.callsActuallySentSoFar, p = PRE_D181.callsActuallySentSoFar;
  assert.deepEqual([p.hair, s.hair], [2, 3]);
  assert.deepEqual([s.underlay, s.faceNeutral, s.eyesFixed], [5, 4, 2]);
  assert.deepEqual(s.hairRecord.attempts.slice(0, 2), p.hairRecord.attempts, "D-175's and D-177's records are unchanged");
  assert.equal(s.hairRecord.attempts.length, 3);
  assert.match(s.hairRecord.attempts[2], /^D-180-r3-hair-northstar-v3 — .*H1\.\.H5 passed, D-179 placement and shape checks not evaluated, .*kept for review, nothing promoted \(recorded by D-181\)$/);
  assert.deepEqual([s.hairRecord.dispatchUndetermined, s.hairRecord.serverAnswered], [0, 3]);
  const { hair, hairRecord, ...rest } = s, { hair: ph, hairRecord: phr, ...prest } = p; assert.deepEqual(rest, prest, "underlay, faceNeutral and eyesFixed records are untouched");
  assert.deepEqual([b.minimum, b.maximum, b.callsPlannedAndAuthorised.derivedBudget, b.callsPlannedAndAuthorised.hair, LIVE_NOW.assets[8].calls], [25, 26, "25-26", 3, 3]);
  assert.deepEqual(LIVE_NOW.authorisedCalls.calls.filter((e) => e.mandateState === "UNSPENT"), [], "no live permission remains");
  assert.match(LIVE_NOW.authorisedCalls.budgetAccounting, /D-180 added ONE further planned hair call \(assets\[8\] 2 -> 3\) for the third hair sheet \(registration v2, prompt v3\), sent once \(recorded by D-181\), so actually sent is hair 3 and the planned hair capacity \(3\) is used up\. The derived budget is 25-26\./);
  const P = LIVE_NOW.prohibitions.noImageRequestAuthorised;
  assert.match(P, /\(14\) D-180-r3-hair-northstar-v3 — NO LONGER a permission/);
  assert.match(P, /No entry in this list is an active send permission — .*D-177's or D-180's call id or claim identity, no fourth hair call, and no other call in the R3 plan\.$/);
  assert.ok(!/THE ONLY active send permission/.test(P));
  assert.equal(P.slice(0, P.indexOf(" (14) ")), PRE_D181.noImageRequestAuthorised.slice(0, PRE_D181.noImageRequestAuthorised.indexOf(" (14) ")), "every earlier restriction is kept word for word");
  assert.equal(LIVE_NOW.architecture.defaultEnabled, false, "R3 stays default OFF");
});

test("THE SPENT D-180 PERMISSION IS REFUSED BEFORE THE CLAIM: in the closed D-181 state the adapter neither dry-runs nor sends", () => {
  const sb = sandbox({ closed: true });
  const dry = runAdapter(sb, GOOD_ARGS);
  assert.equal(dry.status, 1, dry.out); assert.match(dry.out, /REFUSED \[authorisation\]/); assert.match(dry.out, /mandateState: "SPENT", expected "UNSPENT"/);
  assert.equal(existsSync(sb.claim), false); assert.equal(fetchLog(sb).length, 0);
  const send = runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV);
  assertRefusedBeforeClaim(sb, send, "authorisation");
  assert.match(send.out, /the entry carries neverReuse; it is not an active, unspent permission/);
  assert.equal(readdirSync(sb.state).length, 0, "the claim register was not even created");
});

test("the D-181 register row: once, directly after D-180, D-180 verbatim, the outcome and the accounting named, no mojibake; the docs describe it", () => {
  const lines = REGISTER.split("\n");
  assert.equal(lines.filter((l) => l.startsWith("| **D-181** |")).length, 1);
  assert.equal(lines.findIndex((l) => l.startsWith("| **D-181** |")), lines.findIndex((l) => l.startsWith("| **D-180** |")) + 1);
  assert.equal(sha256(lines.find((l) => l.startsWith("| **D-180** |"))), D180_ROW_SHA_AT_D180, "D-180 is not rewritten");
  for (const needle of [CALL, CLAIM_ID, REQUEST_ID_D180, RAW_SHA_D180, "HTTP 200", "H1–H5", "ikke vurderet", "beholdt til review", "ikke visuelt godkendt", "RECORDED — D-180 SPENT — NO LIVE PERMISSION",
    "NOT_IDENTIFIABLE", "`hair` = 3", "`eyesFixed` = 2", "`faceNeutral` = 4", "`underlay` = 5", "25–26", "R3 forbliver default OFF"]) assert.ok(D181_ROW.includes(needle), "the D-181 row carries " + JSON.stringify(needle));
  assert.ok(!/[ÃÂ]\S|�/.test(D181_ROW), "no mojibake in the Danish row");
  assert.match(readFileSync(repoFile("docs/AVATAR_SYSTEM.md"), "utf8"), /\*\*D-181 \(2026-10-22\)\*\* recorded that one hair send/);
  assert.match(readFileSync(repoFile("docs/AVATAR_SYSTEM.md"), "utf8"), /the third hair call \(D-180, the first under v2\) sent once, H1–H5 passed, fit points not identifiable under v2, kept for review; no live permission \(D-174 … D-181, as of 2026-10-22\)/);
});
