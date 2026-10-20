// R3 EYES-FIXED SHEET (call A) — D-170: the approved eye targets, the one authorised attempt and its separate send adapter,
// tested without ever reaching the real world. Derived from the D-167 suite; the lessons of D-142 and D-145 apply unchanged:
//   · The send adapter is NEVER imported. This file reads its source as text, or runs it as a CLI in a child process
//     inside a TEMPORARY git repository that this file builds per scenario, with its own origin/main.
//   · Every child gets an environment built from an explicit ALLOWLIST: no inherited key, no real LOCALAPPDATA or
//     XDG_STATE_HOME, and TEMP/TMP/TMPDIR inside the sandbox. The key is a dummy literal.
//   · globalThis.fetch (and, for the crash windows, node:fs) is replaced from OUTSIDE by `node --import <mock>`. The
//     mock refuses to load unconfigured, never delegates to a real fetch, and logs one line per call.
//   · No test reads, lists or checks the real claim register, a real key or the real build area.
// The returned sheets are synthetic technical shapes (tests/unit/avatar-r3-eyes-synthetic.mjs), never an eye design.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, readdirSync, statSync, copyFileSync, realpathSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync, spawn } from "node:child_process";
import { join, dirname, relative, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { parseEvents, deriveAttempt } from "../../tools/avatar/r3-face-neutral-attempt-ledger.mjs";
import { encodePng, THRESHOLDS } from "../../tools/avatar/r3-eyes-tool.mjs";
import { fixedSheet } from "./avatar-r3-eyes-synthetic.mjs";
import { preD170Contract, PRE_D170_CONTRACT_CANONICAL_SHA256, preD169Contract, PRE_D169_CONTRACT_CANONICAL_SHA256 } from "./avatar-r3-d147-closure.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const repoFile = (rel) => join(REPO, ...rel.split("/"));
const ADAPTER_REL = "tools/avatar/openai-send-r3-eyes-fixed-d170.mjs";
const PREV_ADAPTER_REL = "tools/avatar/openai-send-r3-face-parts-nose-d167.mjs";
const LEDGER_REL = "tools/avatar/r3-face-neutral-attempt-ledger.mjs";
const EYES_TOOL_REL = "tools/avatar/r3-eyes-tool.mjs";
const PARTS_TOOL_REL = "tools/avatar/r3-face-parts-tool.mjs";
const CONTRACT_REL = "tools/avatar/fixtures/r3/r3-shadow-contract-v1.json";
const REGISTER_REL = "docs/project-state.md";
const PROMPT_REL = "tools/avatar/fixtures/r3-eyes/prompt-eyes-fixed-sheet-v1.txt";
const PREV_PROMPT_REL = "tools/avatar/fixtures/r3-face-parts/prompt-nose-partial-sheet-v1.txt";
const TARGETS_REL = "tools/avatar/fixtures/r3-eyes/targets-eyes-v2.json";
const TARGETS_V1_REL = "tools/avatar/fixtures/r3-eyes/targets-eyes-v1.json";
const NORTHSTAR_REL = "assets/avatar/reference/Northstar Master v2.png";
const SRC = readFileSync(repoFile(ADAPTER_REL), "utf8");
const CODE = SRC.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
const LIVE = JSON.parse(readFileSync(repoFile(CONTRACT_REL), "utf8"));
const REGISTER = readFileSync(repoFile(REGISTER_REL), "utf8");
const PRE = preD170Contract(LIVE);
const PRE_REGISTER = REGISTER.split("\n").filter((l) => !l.startsWith("| **D-170** |")).join("\n");
const CALL = "D-170-r3-eyes-fixed-v1";
const CLAIM_ID = CALL + "-claim";
const CLAIM_FILE = CALL + ".claim.json";
const EVENTS_FILE = CALL + ".events.jsonl";
const DUMMY_KEY = "sk-d170-sandbox-dummy-key-not-a-credential";
const APPROVAL = "--owner-approval=D-170";
const GOOD_ARGS = ["--call-id=" + CALL, "--claim-identity=" + CLAIM_ID];
const SEND = ["--send", APPROVAL];
const PROMPT_SHA = "aa2c8efc8404e943f44f4cb56d5978b1b82e691cfdab59e25d2ec6ac46591253";
const TARGETS_SHA = "b67c7ade689a3641ea7e51c7994c30012a40c6b30c65c63fa845885653d24d5f";
const TARGETS_V1_SHA = "09848f0e5ae87de1b1fbdf8a9102ec3125cf2e21a1cc6324a7ed1bcbad19a88c";
const NORTHSTAR_SHA = "3daf32e76bff9a53ec7d25cf148a230073cfd0da6a003d02a23c4292d139ff50";
const MODEL = "gpt-image-2.5-sunburst-2026-09-08";
const D169_ROW_SHA = sha256(PRE_REGISTER.split("\n").find((l) => l.startsWith("| **D-169** |")));
const D169_ROW_SHA_AT_MERGE = "ab4f833c94fab3ef89c552fe8a6536cad5144f38fb6fa80110e3745fa86a8d7e";
const SPENT_IDS = ["D-139-r3-underlay-head-only-v1", "D-142-r3-underlay-core-v1", "D-143-r3-underlay-core-v2", "D-151-r3-head-colour-u1-v1",
  "D-153-r3-head-colour-u1-opaque-v1", "D-160-r3-face-neutral-v1", "D-162-r3-face-neutral-guide-b-v1", "D-165-r3-face-parts-sheet-v1", "D-167-r3-face-parts-nose-v1"];
const E = LIVE.authorisedCalls.calls.find((e) => e.callId === CALL);
const IMPL = LIVE.adapterImplementations.entries.find((e) => e.decision === "D-170");
const EYES = LIVE.eyesPartsMethod;
const ROW = REGISTER.split("\n").find((l) => l.startsWith("| **D-170** |"));
const T1 = JSON.parse(readFileSync(repoFile(TARGETS_V1_REL), "utf8")), T2 = JSON.parse(readFileSync(repoFile(TARGETS_REL), "utf8"));

function isInside(child, parent) {
  if (typeof child !== "string" || typeof parent !== "string" || child === "" || parent === "") return false;
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

// ── the decision itself ───────────────────────────────────────────────────────────────────────────────────────
test("D-170 changes exactly the targets pin, one authorisation and its prose: the contract at the D-169 merge is reproduced canonically", () => {
  assert.equal(sha256(JSON.stringify(PRE)), PRE_D170_CONTRACT_CANONICAL_SHA256);
  assert.equal(sha256(JSON.stringify(preD169Contract(LIVE))), PRE_D169_CONTRACT_CANONICAL_SHA256, "and the older chain still holds");
  assert.deepEqual(Object.keys(LIVE), Object.keys(PRE), "no top-level key is added");
  assert.deepEqual([PRE.authorisedCalls.count, LIVE.authorisedCalls.count, LIVE.authorisedCalls.calls.length], [9, 10, 10]);
  assert.deepEqual(LIVE.authorisedCalls.calls.slice(0, 9), PRE.authorisedCalls.calls, "the nine earlier entries are unchanged");
  assert.deepEqual(LIVE.adapterImplementations.entries.slice(0, 5), PRE.adapterImplementations.entries, "the earlier implementations are unchanged");
  assert.deepEqual(LIVE.assets, PRE.assets, "no planned capacity is added: assets[5] keeps 1, assets[6] keeps 1");
  assert.deepEqual([LIVE.assets[5].calls, LIVE.assets[6].calls], [1, 1]);
  const b = LIVE.imageCallBudget;
  assert.deepEqual([b.minimum, b.maximum, b.callsPlannedAndAuthorised.derivedBudget, b.callsPlannedAndAuthorised.eyesFixed], [PRE.imageCallBudget.minimum, PRE.imageCallBudget.maximum, "22-23", 1]);
  let min = 0, max = 0; for (const a of LIVE.assets) { if (typeof a.calls === "number") { min += a.calls; max += a.calls; } else { const m = /^(\d+)-(\d+)$/.exec(a.calls); min += +m[1]; max += +m[2]; } }
  assert.deepEqual([min, max], [22, 23], "the budget is derived arithmetically and unchanged");
  assert.deepEqual(b.callsActuallySentSoFar, PRE.imageCallBudget.callsActuallySentSoFar, "actually sent is unchanged");
  assert.deepEqual([b.callsActuallySentSoFar.faceNeutral, b.callsActuallySentSoFar.underlay], [4, 5]);
  const { targets: tNow, ...eyesRestNow } = LIVE.eyesPartsMethod, { targets: tThen, ...eyesRestThen } = PRE.eyesPartsMethod;
  assert.deepEqual(eyesRestNow, eyesRestThen, "the eyes method, its checks and every threshold are unchanged");
  assert.deepEqual(LIVE.eyesPartsMethod.thresholds, JSON.parse(JSON.stringify(THRESHOLDS)));
  for (const k of ["deterministicOperations", "irisContract", "zModel", "layerContract", "faceNeutralPartsMethod", "faceNeutralPartsExtension", "faceNeutralPreparation"]) assert.deepEqual(LIVE[k], PRE[k], k + " is unchanged");
  assert.equal(LIVE.meta.authorisesImageRequest, false);
  assert.equal(LIVE.architecture.defaultEnabled, false, "R3 stays default OFF");
  assert.ok(!/AVATAR_R3\s*=\s*true/.test(readFileSync(repoFile("js/avatar-layers.js"), "utf8")), "R3 stays OFF at runtime");
});

test("the approved targets: a new pinned version with identical points, definitions and uncertainties; v1 stays DRAFT and unchanged", () => {
  assert.equal(sha256(readFileSync(repoFile(TARGETS_REL))), TARGETS_SHA);
  assert.equal(sha256(readFileSync(repoFile(TARGETS_V1_REL))), TARGETS_V1_SHA, "D-169's DRAFT v1 is byte-identical");
  assert.deepEqual([T2.schema, T2.version, T2.status, T2.approval.decision, T2.approval.approvedBy, T2.approval.approvedOn], ["r3-eyes-targets-v1", "r3-eyes-targets-v2", "APPROVED", "D-170", "owner", "2026-10-20"]);
  assert.deepEqual([T1.status, T1.version], ["DRAFT", "r3-eyes-targets-v1"]);
  for (const k of ["canvas", "coordinates", "reference", "points", "referenceGeometry"]) assert.deepEqual(T2[k], T1[k], k + " is identical — no coordinate changed silently");
  assert.deepEqual([T2.supersedes.sha256, T2.supersedes.version], [TARGETS_V1_SHA, "r3-eyes-targets-v1"]);
  assert.deepEqual([T2.points.eyeLeft.ringCentre.xy, T2.points.eyeRight.ringCentre.xy, T2.points.eyeLeft.outerCorner.xy, T2.points.eyeRight.outerCorner.xy], [[448.8, 321.7], [571.0, 320.6], [402.0, 310.0], [617.0, 312.0]]);
  assert.deepEqual([T2.points.eyeLeft.ringCentre.uncertaintyPx, T2.points.eyeLeft.outerCorner.uncertaintyPx, T2.points.eyeLeft.innerCorner.role, T2.points.eyeRight.innerCorner.role], [1.5, 3, "CHECK", "CHECK"]);
  assert.match(T2.points.eyeLeft.ringCentre.rationale, /RECONSTRUCTED/);
  assert.match(T2.points.eyeLeft.outerCorner.rationale, /ill-defined/);
  assert.match(T2.approval.notMorePrecise, /does not make the readings more precise/);
  assert.match(T2.approval.doesNotApprove, /never a generated eye sheet, a source annotation or a composition/);
  const t = EYES.targets;
  assert.deepEqual([t.file, t.sha256, t.version, t.status, t.approvedBy, t.approvedOn, t.approvedByDecision], [TARGETS_REL, TARGETS_SHA, "r3-eyes-targets-v2", "APPROVED", "owner", "2026-10-20", "D-170"]);
  assert.deepEqual(t.points, PRE.eyesPartsMethod.targets.points);
  assert.deepEqual([t.fitAnchors, t.checkPoints], [PRE.eyesPartsMethod.targets.fitAnchors, PRE.eyesPartsMethod.targets.checkPoints]);
  assert.deepEqual([t.supersedes.sha256, t.supersedes.file], [TARGETS_V1_SHA, TARGETS_V1_REL]);
  assert.equal(/TARGETS_SHA256 = "([0-9a-f]{64})"/.exec(readFileSync(repoFile("tools/avatar/r3-eyes-compose.mjs"), "utf8"))[1], TARGETS_SHA, "the CLI pins the approved version");
});

test("D-170's entry is the ONLY live permission: one image, D-169's frozen prompt, 1536x1024, E1..E5; no iris call; merge is not a run instruction", () => {
  assert.deepEqual(LIVE.authorisedCalls.calls.filter((e) => e.mandateState === "UNSPENT").map((e) => e.callId), [CALL]);
  for (const id of SPENT_IDS.slice(5)) { const x = LIVE.authorisedCalls.calls.find((e) => e.callId === id); assert.deepEqual([x.mandateState, x.neverReuse], ["SPENT", true], id); }
  assert.deepEqual([E.decision, E.preparedBy, E.status, E.mandateState, E.outcome], ["D-170", "D-170", "AUTHORISED — ONE CALL — NOT YET ATTEMPTED", "UNSPENT", "NOT YET ATTEMPTED"]);
  for (const k of ["neverReuse", "notAnActivePermission", "closedBy", "closure", "execution"]) assert.ok(!(k in E), "no " + k);
  assert.deepEqual([E.claim.identity, E.claim.filename, E.claim.eventsFilename, E.adapter.file], [CLAIM_ID, CLAIM_FILE, EVENTS_FILE, ADAPTER_REL]);
  assert.deepEqual([E.runInstruction.mergeIsNotAnInstruction, E.runInstruction.requiresSeparateExplicitOwnerInstruction], [true, true]);
  const d167 = LIVE.authorisedCalls.calls.find((e) => e.decision === "D-167");
  assert.deepEqual([E.model, E.endpoint, E.operation, E.fieldOrder, E.neverSentFields], [d167.model, d167.endpoint, d167.operation, d167.fieldOrder, d167.neverSentFields], "the established model and request shape");
  assert.deepEqual(E.parameters, { size: "1536x1024", quality: "high", n: 1, output_format: "png", background: "transparent" });
  assert.deepEqual(E.inputs.map((i) => [i.order, i.repoPath, i.sha256, i.tracked]), [[1, NORTHSTAR_REL, NORTHSTAR_SHA, true]], "North Star is the only image");
  assert.deepEqual([E.prompt.file, E.prompt.sha256, E.prompt.bytes], [PROMPT_REL, PROMPT_SHA, 1714]);
  assert.deepEqual([E.prompt.file, E.prompt.sha256, E.prompt.bytes], [EYES.rawSheets.eyesFixed.prompt.file, EYES.rawSheets.eyesFixed.prompt.sha256, EYES.rawSheets.eyesFixed.prompt.bytes], "D-169's frozen prompt, adopted unchanged");
  assert.deepEqual([E.targets.sha256, E.targets.status], [TARGETS_SHA, "APPROVED"]);
  assert.deepEqual([E.outputs.count, E.outputs.sheet, E.outputs.sheetType, E.outputs.dir], [1, [1536, 1024], "r3-eyes-fixed-sheet-v1", "tools/avatar/build/r3-eyes-fixed-d170"]);
  assert.match(E.irisCallB, /NOT authorised/);
  assert.match(E.prohibitions.noRetry, /Exactly one fetch/);
  assert.match(E.accounting.slot, /never an underlay call and never a face-neutral call/);
  assert.match(E.outputHandling.technicalChecks, /E1\.\.E5/);
  assert.match(E.outputHandling.technicalChecks, /alpha 1\.\.15 reported only/);
  assert.match(E.outputHandling.technicalChecks, /No threshold is changed after the result/);
  assert.match(E.outputHandling.passMeaning, /does not approve its appearance/);
  assert.match(E.outputHandling.visualReview, /U7/);
  assert.match(E.outputHandling.annotation, /DRAFT, bound to the exact sheet's SHA-256/);
  assert.deepEqual([IMPL.adapter.file, IMPL.adapter.status, IMPL.adapter.ownerApprovalFlag, IMPL.mandateState, IMPL.mergeIsNotAnInstruction, IMPL.executionRequiresSeparateOwnerInstruction],
    [ADAPTER_REL, "IMPLEMENTED — NOT EXECUTED", APPROVAL, "UNSPENT", true, true]);
  assert.ok(!Object.keys(IMPL.adapter).some((k) => /sha-?256/i.test(k)), "no adapter hash pinned (D-145)");
  assert.match(LIVE.prohibitions.noImageRequestAuthorised, /holds TEN entries/);
  assert.match(LIVE.prohibitions.noImageRequestAuthorised, /\(10\) D-170-r3-eyes-fixed-v1 — THE ONLY active send permission/);
  assert.match(LIVE.prohibitions.noImageRequestAuthorised, /The iris call B is not authorised/);
  assert.match(LIVE.authorisedCalls.budgetAccounting, /No eyes call has been sent\. The derived budget is 22-23\./);
  assert.ok(!LIVE.authorisedCalls.calls.some((e) => /iris/i.test(e.callId)), "no iris call entry");
});

test("the D-170 register row: once, directly after D-169, D-169 verbatim, every pin named, no mojibake", () => {
  const lines = REGISTER.split("\n");
  assert.equal(lines.filter((l) => l.startsWith("| **D-170** |")).length, 1);
  assert.equal(lines.findIndex((l) => l.startsWith("| **D-170** |")), lines.findIndex((l) => l.startsWith("| **D-169** |")) + 1);
  assert.equal(D169_ROW_SHA, D169_ROW_SHA_AT_MERGE, "D-169 is not rewritten");
  for (const needle of [CALL, CLAIM_ID, CLAIM_FILE, EVENTS_FILE, MODEL, ADAPTER_REL, APPROVAL, NORTHSTAR_SHA, PROMPT_SHA, PROMPT_REL, TARGETS_SHA, TARGETS_REL, TARGETS_V1_SHA, "1536x1024",
    "(448,8; 321,7)", "(571,0; 320,6)", "(402,0; 310,0)", "(617,0; 312,0)", "AUTHORISED — ONE CALL — NOT YET ATTEMPTED`", "IKKE EN KØRSELSINSTRUKS", "E1–E5", "alfa 1–15", "U7",
    "iris-kald B", "`faceNeutral` = 4", "`underlay` = 5", "22–23", "R3 forbliver default OFF"]) assert.ok(ROW.includes(needle), "the D-170 row carries " + JSON.stringify(needle));
  assert.ok(!/[ÃÂ]\S|\uFFFD/.test(ROW), "no mojibake in the Danish row");
});

test("the frozen eyes-fixed prompt: UTF-8, LF only, one trailing LF; self-contained; the D-169 layer split", () => {
  const p = readFileSync(repoFile(PROMPT_REL)), t = p.toString("utf8");
  assert.deepEqual([sha256(p), p.length], [PROMPT_SHA, 1714]);
  assert.ok(Buffer.from(t, "utf8").equals(p) && !t.includes("\r") && t.endsWith("\n") && !t.endsWith("\n\n"));
  for (const s of ["one 1536x1024 transparent PNG sheet", "Draw both eyes together", "image-left eye in the left half", "Leave a clear empty vertical strip in the middle",
    "the white of the eye", "thick black upper lash line", "thin dark outline ring around the iris", "upper-left of the pupil, at the same place in BOTH eyes", "static eyelid fold line",
    "everything inside the dark iris ring, except the white highlight, must be fully transparent", "No iris colour, no pupil", "Do NOT draw: skin"]) assert.ok(t.includes(s), "the prompt says " + JSON.stringify(s));
  assert.ok(!/\b(as before|previous|earlier)\b/i.test(t), "no reference to anything the model does not receive");
});

// ── static: the adapter's shape ─────────────────────────────────────────────────────────────────────────────────
test("the D-167 adapter is unchanged; the D-170 adapter exports nothing and imports only node built-ins, the ledger and the eyes tool", () => {
  assert.equal(sha256(readFileSync(repoFile(PREV_ADAPTER_REL))), "de8463cdadf87fb093c4f5afac20293de51b46e12f4c6d8978c9c1f07ea625c6", "the D-167 adapter is byte-identical to what ran");
  assert.ok(!/^\s*export\b/m.test(CODE));
  const imports = [...CODE.matchAll(/^\s*import\b[^;]*?from\s+"([^"]+)"/gm)].map((m) => m[1]);
  for (const s of imports) assert.ok(s.startsWith("node:") || ["./r3-face-neutral-attempt-ledger.mjs", "./r3-eyes-tool.mjs"].includes(s), "unexpected import " + s);
  assert.ok(!/\bimport\s*\(/.test(CODE) && !/\brequire\s*\(/.test(CODE));
  assert.ok(CODE.includes("checkFixedSheet(imgBuf)"), "the output check is D-169's E1..E5");
  assert.ok(!CODE.includes("checkPartialSheet") && !CODE.includes("checkRawSheet") && !CODE.includes("check-r3-face-neutral-output"), "no face-parts or master-canvas check");
  assert.ok(!/384, 230, 632, 412|BROAD_ENVELOPE/.test(CODE), "the face envelope is not in the sheet path");
  assert.ok(!/THRESHOLDS\s*=|THRESHOLDS\.[a-zA-Z]+\s*=/.test(CODE), "the adapter never defines or changes a threshold");
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
    "if (!args.sendMode)", "const again = resolveRefs()", "process.env.OPENAI_API" + "_KEY", "claim = createClaim(", "event(\"dispatch\"", "res = await globalThis.fetch(", "checkFixedSheet(imgBuf"]) { const i = body.indexOf(k); assert.ok(i > last, k + " in order"); last = i; }
  for (const del of ["unlinkSync", "rmSync", "rmdirSync", "truncateSync", "copyFileSync"]) assert.ok(!CODE.includes(del), "must not contain " + del);
  assert.ok(!/candidate\.png|\.candidate\./.test(CODE), "no candidate file");
  assert.match(CODE, /const OUT_DIR = "tools\/avatar\/build\/r3-eyes-fixed-d170";/);
  for (const id of SPENT_IDS) assert.ok(SRC.includes(id), "lists " + id + " as never-reuse");
  for (const v of [CALL, CLAIM_ID, CLAIM_FILE, EVENTS_FILE, APPROVAL, ADAPTER_REL, PROMPT_REL, PROMPT_SHA, TARGETS_REL, TARGETS_SHA, NORTHSTAR_SHA, MODEL]) assert.ok(SRC.includes(v), "the adapter carries " + v);
  assert.match(SRC, /const REQUIRED_DECISIONS = Object\.freeze\(\["D-142", "D-159", "D-169", "D-170"\]\);/);
  assert.match(SRC, /const PARAMETERS = Object\.freeze\(\{ size: "1536x1024", quality: "high", n: 1, output_format: "png", background: "transparent" \}\);/);
});

// ── sandbox: a temporary git repository per scenario ─────────────────────────────────────────────────────────────
const SANDBOX_ROOTS = [];
after(() => { for (const root of SANDBOX_ROOTS) if (isInside(root, realpathSync.native(tmpdir())) && /d170-sandbox-/.test(root)) rmSync(root, { recursive: true, force: true }); });

const MOCK_SRC = [
  "// D-170 test mock: replaces globalThis.fetch (and, for the crash windows, node:fs) for one child process. Refuses to load unconfigured.",
  "import fs, { appendFileSync, existsSync, readFileSync, writeFileSync } from \"node:fs\";",
  "import { syncBuiltinESMExports } from \"node:module\";",
  "import { resolve } from \"node:path\";",
  "const LOG = process.env.D170_MOCK_LOG, MODE = process.env.D170_MOCK_MODE, CLAIM = process.env.D170_MOCK_CLAIM, EVENTS = process.env.D170_MOCK_EVENTS,",
  "  PNG = process.env.D170_MOCK_PNG, BODY = process.env.D170_MOCK_BODY;",
  "if (!LOG || !MODE || !CLAIM || !EVENTS || !PNG || !BODY) throw new Error(\"d170 mock: not configured — refusing to run\");",
  "const KEY = \"sk-d170-sandbox-dummy-key-not-a-credential\";",
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
  "globalThis.fetch = async function d170MockFetch(url, init) {",
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
  "  const named = { strip: \".strip.png\", square: \".square.png\", skin: \".skin.png\", low: \".low.png\" };",
  "  const b64 = pick(named[MODE] || \"\");",
  "  const data = MODE === \"two\" ? [{ b64_json: b64 }, { b64_json: pick(\".strip.png\") }] : MODE === \"zero\" ? [] : [{ b64_json: b64 }];",
  "  return send(JSON.stringify({ created: 1, data, usage: { total_tokens: 1 } }), 200, \"req_mockok\");",
  "};",
].join("\n");

// The D-167 adapter and its own prompt are copied too, so its refusal of the closed mandate is a real authorisation refusal.
const TRACKED = [ADAPTER_REL, PREV_ADAPTER_REL, LEDGER_REL, EYES_TOOL_REL, PARTS_TOOL_REL, REGISTER_REL, CONTRACT_REL, PROMPT_REL, PREV_PROMPT_REL, TARGETS_REL, NORTHSTAR_REL];
const at = (x, y) => (y * 1536 + x) * 4;
function sheetPngs() {
  return {
    ok: fixedSheet(),
    strip: fixedSheet((px) => px.set([0, 0, 0, 255], at(760, 500))),                       // E2: visible pixel in the middle strip
    low: fixedSheet((px) => px.set([0, 0, 0, 15], at(760, 500))),                          // alpha 15: reported only, still a PASS
    skin: fixedSheet((px) => { for (let y = 600; y < 604; y++) for (let x = 200; x < 204; x++) px.set([254, 197, 128, 255], at(x, y)); }), // E5
    square: encodePng(1024, 1024, new Uint8ClampedArray(1024 * 1024 * 4)),                 // E1: wrong size
  };
}
const PNGS = sheetPngs();
function envFor(sb, extra) {
  const env = {};
  for (const k of ["PATH", "Path", "SystemRoot", "windir", "COMSPEC", "PATHEXT", "SystemDrive"]) if (typeof process.env[k] === "string") env[k] = process.env[k];
  Object.assign(env, { LOCALAPPDATA: sb.state, XDG_STATE_HOME: sb.state, HOME: sb.home, USERPROFILE: sb.home, TEMP: sb.tmp, TMP: sb.tmp, TMPDIR: sb.tmp,
    HTTP_PROXY: "http://127.0.0.1:9", HTTPS_PROXY: "http://127.0.0.1:9", NO_PROXY: "", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: sb.gitconfig,
    D170_MOCK_LOG: sb.log, D170_MOCK_MODE: "ok", D170_MOCK_CLAIM: sb.claim, D170_MOCK_EVENTS: sb.events, D170_MOCK_PNG: sb.png, D170_MOCK_BODY: sb.body }, extra || {});
  return env;
}
function sgit(sb, args) {
  const r = spawnSync("git", ["-C", sb.repo, "-c", "user.name=d170-sandbox", "-c", "user.email=sandbox@example.invalid", "-c", "core.autocrlf=false", ...args], { env: envFor(sb), encoding: "utf8", windowsHide: true });
  if (r.status !== 0) throw new Error("sandbox git " + args.join(" ") + ": " + r.stderr);
  return r.stdout.trim();
}
const contractPath = (sb) => join(sb.repo, ...CONTRACT_REL.split("/"));
const registerPath = (sb) => join(sb.repo, ...REGISTER_REL.split("/"));
const editContract = (sb, fn) => { const c = JSON.parse(readFileSync(contractPath(sb), "utf8")); fn(c); writeFileSync(contractPath(sb), JSON.stringify(c, null, 2) + "\n"); };
const editEntry = (fn) => (sb) => editContract(sb, (c) => { const i = c.authorisedCalls.calls.findIndex((e) => e.callId === CALL); c.authorisedCalls.calls[i] = fn(structuredClone(c.authorisedCalls.calls[i])); });
const editImpl = (fn) => (sb) => editContract(sb, (c) => { const i = c.adapterImplementations.entries.findIndex((e) => e.decision === "D-170"); const x = fn(structuredClone(c.adapterImplementations.entries[i])); if (x) c.adapterImplementations.entries[i] = x; else c.adapterImplementations.entries.splice(i, 1); });
const toLive = (sb) => { copyFileSync(repoFile(CONTRACT_REL), contractPath(sb)); copyFileSync(repoFile(REGISTER_REL), registerPath(sb)); };

/** A fresh sandbox. Default: the live D-170 state as origin/main. `pre`: before D-170 (the D-169 merge). */
function sandbox({ base, layout = "main", top, pre = false } = {}) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "d170-sandbox-")));
  SANDBOX_ROOTS.push(root);
  const sb = { root, repo: join(root, "repo"), state: join(root, "state"), tmp: join(root, "tmp"), home: join(root, "home"), log: join(root, "fetch.log"),
    gitconfig: join(root, "gitconfig"), png: join(root, "mock-output.png"), body: join(root, "mock-body.json"), mock: join(root, "mock.mjs") };
  const reg = join(sb.state, "DenSejeApp", "one-shot-claims", "Moeller888-den-seje-app-frontend");
  sb.claim = join(reg, CLAIM_FILE); sb.events = join(reg, EVENTS_FILE);
  for (const d of [sb.repo, sb.state, sb.tmp, sb.home]) mkdirSync(d, { recursive: true });
  writeFileSync(sb.gitconfig, "[core]\n\tautocrlf = false\n[init]\n\tdefaultBranch = main\n");
  writeFileSync(sb.mock, MOCK_SRC); writeFileSync(sb.log, "");
  writeFileSync(sb.png, PNGS.ok);
  for (const k of ["strip", "low", "skin", "square"]) writeFileSync(sb.png + "." + k + ".png", PNGS[k]);
  for (const rel of [...TRACKED, ".gitignore"]) { const dst = join(sb.repo, ...rel.split("/")); mkdirSync(dirname(dst), { recursive: true }); copyFileSync(repoFile(rel), dst); }
  if (pre) { writeFileSync(contractPath(sb), JSON.stringify(PRE, null, 2) + "\n"); writeFileSync(registerPath(sb), PRE_REGISTER); }
  if (base) base(sb);
  sgit(sb, ["init", "-q", "-b", "main"]); sgit(sb, ["add", "-A"]); sgit(sb, ["commit", "-q", "-m", "base"]); sgit(sb, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  if (layout === "worktree") top(sb);
  else if (layout === "branch" || layout === "detached") {
    if (layout === "branch") sgit(sb, ["checkout", "-q", "-b", "local-d170"]); else sgit(sb, ["checkout", "-q", "--detach"]);
    top(sb); sgit(sb, ["add", "-A"]); sgit(sb, ["commit", "-q", "-m", "D-170 not merged"]);
  }
  return sb;
}
function runFile(sb, rel, args, extra) {
  const r = spawnSync(process.execPath, ["--import", pathToFileURL(sb.mock).href, join(sb.repo, ...rel.split("/")), ...args], { cwd: sb.repo, env: envFor(sb, extra), encoding: "utf8", windowsHide: true, timeout: 180000 });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
const runAdapter = (sb, args, extra) => runFile(sb, ADAPTER_REL, args, extra);
const fetchLog = (sb) => readFileSync(sb.log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const outDir = (sb) => join(sb.repo, "tools", "avatar", "build", "r3-eyes-fixed-d170");
const outFile = (sb, n) => join(outDir(sb), "r3-eyes-fixed-d170." + n);
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

test("isolation is proven first: every derived path is inside the sandbox, and the mock refuses to run unconfigured", () => {
  const sb = sandbox();
  for (const p of [sb.repo, sb.state, sb.tmp, sb.claim, sb.events, sb.log]) assert.ok(isInside(p, sb.root), p);
  const r = spawnSync(process.execPath, ["--import", pathToFileURL(sb.mock).href, "-e", "0"], { env: { PATH: process.env.PATH || "", SystemRoot: process.env.SystemRoot || "" }, encoding: "utf8" });
  assert.notEqual(r.status, 0); assert.match(r.stderr, /not configured/);
});

// ── the committed state ─────────────────────────────────────────────────────────────────────────────────────────
test("THE LIVE D-170 STATE: the dry run passes with the real tracked pins and NO credential, writes nothing, claims nothing, sends nothing", () => {
  const sb = sandbox();
  const r = runAdapter(sb, GOOD_ARGS);
  assert.equal(r.status, 0, r.out); assert.match(r.out, /DRY RUN PASSED/);
  assert.match(r.out, /authorisation : exactly one active, unspent D-170-r3-eyes-fixed-v1 entry and one D-170 implementation entry in origin\/main/);
  assert.match(r.out, /size 1536x1024/);
  assert.equal(existsSync(sb.claim), false); assert.equal(existsSync(sb.events), false); assert.equal(fetchLog(sb).length, 0); assert.equal(existsSync(outDir(sb)), false);
  assert.equal(readdirSync(sb.state).length, 0, "the claim register was not even created");
});
test("BEFORE D-170 nothing could send: the reconstructed pre-D-170 state is refused before any claim", () => {
  const sb = sandbox({ pre: true });
  const r = runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV);
  assertRefusedBeforeClaim(sb, r, "register"); assert.match(r.out, /D-170 appears 0 times/);
});
test("an authorisation only in the working tree, on a local branch or on a detached HEAD is refused before the claim", () => {
  const wt = sandbox({ pre: true, layout: "worktree", top: toLive }); assertRefusedBeforeClaim(wt, runAdapter(wt, [...GOOD_ARGS, ...SEND], KEY_ENV), "blob-divergence");
  const br = sandbox({ pre: true, layout: "branch", top: toLive }); assertRefusedBeforeClaim(br, runAdapter(br, [...GOOD_ARGS, ...SEND], KEY_ENV), "branch");
  const dt = sandbox({ pre: true, layout: "detached", top: toLive }); assertRefusedBeforeClaim(dt, runAdapter(dt, [...GOOD_ARGS, ...SEND], KEY_ENV), "head-not-origin-main");
});
test("D-167 STAYS CLOSED: in the live D-170 state, the D-167 adapter is refused before any claim", () => {
  const sb = sandbox();
  const r = runFile(sb, PREV_ADAPTER_REL, ["--call-id=D-167-r3-face-parts-nose-v1", "--claim-identity=D-167-r3-face-parts-nose-v1-claim", "--send", "--owner-approval=D-167"], KEY_ENV);
  assert.equal(r.status, 1, r.out); assert.match(r.out, /REFUSED \[authorisation\]/);
  assert.equal(fetchLog(sb).length, 0); assert.equal(readdirSync(sb.state).length, 0, "the D-167 adapter created nothing in the claim register");
});

for (const [label, args] of [
  ["a wrong call-id", ["--call-id=D-170-r3-eyes-fixed-v2", "--claim-identity=" + CLAIM_ID, ...SEND]],
  ["an iris call-id", ["--call-id=D-170-r3-eyes-iris-v1", "--claim-identity=" + CLAIM_ID, ...SEND]],
  ...SPENT_IDS.map((id) => ["the spent call-id " + id, ["--call-id=" + id, "--claim-identity=" + CLAIM_ID, ...SEND]]),
  ["D-167's spent claim identity", ["--call-id=" + CALL, "--claim-identity=D-167-r3-face-parts-nose-v1-claim", ...SEND]],
  ["a wrong claim identity", ["--call-id=" + CALL, "--claim-identity=D-170-other-claim", ...SEND]],
  ["--send without the approval", [...GOOD_ARGS, "--send"]],
  ["the approval without --send", [...GOOD_ARGS, APPROVAL]],
  ["D-169's approval", [...GOOD_ARGS, "--send", "--owner-approval=D-169"]],
  ["--retry", [...GOOD_ARGS, ...SEND, "--retry"]],
  ["--size", [...GOOD_ARGS, ...SEND, "--size=1024x1024"]],
  ["--targets", [...GOOD_ARGS, ...SEND, "--targets=" + TARGETS_V1_REL]],
  ["a duplicate --send", [...GOOD_ARGS, ...SEND, "--send"]],
]) test("refused before the claim: " + label, () => { const sb = sandbox(); assertRefusedBeforeClaim(sb, runAdapter(sb, args, KEY_ENV), "arguments"); });

test("refused before the claim: an inactive, spent, closed, duplicated or second permission, or a bent D-169 method", () => {
  for (const [label, base] of [
    ["mandate SPENT", editEntry((e) => ({ ...e, mandateState: "SPENT" }))],
    ["status PREPARED", editEntry((e) => ({ ...e, status: "PREPARED — NOT AUTHORISED" }))],
    ["already attempted", editEntry((e) => ({ ...e, outcome: "EXECUTED ONCE" }))],
    ["neverReuse", editEntry((e) => ({ ...e, neverReuse: true }))],
    ["closed", editEntry((e) => ({ ...e, closedBy: "D-171" }))],
    ["another decision", editEntry((e) => ({ ...e, decision: "D-171" }))],
    ["prepared by D-169", editEntry((e) => ({ ...e, preparedBy: "D-169" }))],
    ["E1..E5 not bound", editEntry((e) => ({ ...e, outputHandling: { ...e.outputHandling, technicalChecks: "RAW-1..5" } }))],
    ["the iris call no longer excluded", editEntry((e) => ({ ...e, irisCallB: "authorised" }))],
    ["no implementation entry", editImpl(() => null)],
    ["implementation executed", editImpl((x) => ({ ...x, adapter: { ...x.adapter, status: "IMPLEMENTED — EXECUTED ONCE — SPENT" } }))],
    ["implementation pins a hash", editImpl((x) => ({ ...x, adapter: { ...x.adapter, sha256: "0".repeat(64) } }))],
    ["D-167 reopened", (sb) => editContract(sb, (c) => { const d = c.authorisedCalls.calls.find((e) => e.decision === "D-167"); d.mandateState = "UNSPENT"; })],
    ["a second live permission", (sb) => editContract(sb, (c) => { const d = c.authorisedCalls.calls.find((e) => e.decision === "D-160"); d.mandateState = "UNSPENT"; delete d.neverReuse; })],
    ["the general flag flipped", (sb) => editContract(sb, (c) => { c.meta.authorisesImageRequest = true; })],
    ["two entries for the call", (sb) => editContract(sb, (c) => { c.authorisedCalls.calls.push(structuredClone(c.authorisedCalls.calls.find((e) => e.callId === CALL))); })],
    ["D-169 method missing", (sb) => editContract(sb, (c) => { delete c.eyesPartsMethod; })],
    ["D-169 method is an authorisation", (sb) => editContract(sb, (c) => { c.eyesPartsMethod.isAuthorisation = true; })],
    ["targets back to DRAFT", (sb) => editContract(sb, (c) => { c.eyesPartsMethod.targets.status = "DRAFT"; })],
    ["targets pinned to v1", (sb) => editContract(sb, (c) => { c.eyesPartsMethod.targets.sha256 = TARGETS_V1_SHA; })],
    ["a threshold changed", (sb) => editContract(sb, (c) => { c.eyesPartsMethod.thresholds.visibleAlphaMin = 32; })],
    ["a low-alpha rule changed", (sb) => editContract(sb, (c) => { c.eyesPartsMethod.checks.lowAlphaRule = "alpha > 0 rejects"; })],
    ["an E-check dropped", (sb) => editContract(sb, (c) => { c.eyesPartsMethod.checks.eyesFixedSheet.binding.pop(); })],
    ["the prompt pin in the method changed", (sb) => editContract(sb, (c) => { c.eyesPartsMethod.rawSheets.eyesFixed.prompt.sha256 = "0".repeat(64); })],
    ["the sheet size in the method changed", (sb) => editContract(sb, (c) => { c.eyesPartsMethod.rawSheets.eyesFixed.size = [1024, 1024]; })],
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
    ["a square size", (e) => ({ ...e, parameters: { ...e.parameters, size: "1024x1024" } })],
    ["background", (e) => ({ ...e, parameters: { ...e.parameters, background: "opaque" } })],
    ["n = 2", (e) => ({ ...e, parameters: { ...e.parameters, n: 2 } })],
    ["extra parameter", (e) => ({ ...e, parameters: { ...e.parameters, input_fidelity: "high" } })],
    ["a second input", (e) => ({ ...e, inputs: [...e.inputs, { ...e.inputs[0], order: 2, role: "Image 2" }] })],
    ["the iris prompt", (e) => ({ ...e, prompt: { ...e.prompt, sha256: "8acada222bb45bb66427029a3eb3ec184d757481ec76ba42103212460c84a787" } })],
    ["a mask in the field order", (e) => ({ ...e, fieldOrder: [...e.fieldOrder, "mask"] })],
    ["claim identity", (e) => ({ ...e, claim: { ...e.claim, identity: "D-167-r3-face-parts-nose-v1-claim" } })],
    ["adapter file", (e) => ({ ...e, adapter: { file: PREV_ADAPTER_REL } })],
    ["two outputs", (e) => ({ ...e, outputs: { ...e.outputs, count: 2 } })],
    ["counted as face-neutral", (e) => ({ ...e, accounting: { slot: "face-neutral" } })],
  ]) {
    const sb = sandbox({ base: editEntry(fn) }); const r = runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV);
    assert.equal(r.status, 1, label); assert.match(r.out, /REFUSED \[authorisation\]/, label + "\n" + r.out);
    assert.equal(existsSync(sb.claim), false, label); assert.equal(fetchLog(sb).length, 0, label);
  }
});
test("refused before the claim: changed prompt, targets or North Star bytes committed to origin/main — only the pinned bytes are used", () => {
  for (const [rel, mutate] of [[PROMPT_REL, (b) => Buffer.from(b.toString("utf8").replace("EMPTY", "FILLED"), "utf8")], [PROMPT_REL, (b) => b.subarray(0, b.length - 1)],
    [TARGETS_REL, (b) => Buffer.from(b.toString("utf8").replace("448.8", "449.8"), "utf8")], [NORTHSTAR_REL, (b) => { b[b.length - 20] ^= 0xff; return b; }]]) {
    const sb = sandbox({ base: (s) => { const p = join(s.repo, ...rel.split("/")); writeFileSync(p, mutate(readFileSync(p))); } });
    assertRefusedBeforeClaim(sb, runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV), "pins");
  }
});
test("refused before the claim: a register row that is missing or doubled", () => {
  const none = sandbox({ base: (s) => writeFileSync(registerPath(s), readFileSync(registerPath(s), "utf8").split("\n").filter((l) => !l.startsWith("| **D-170** |")).join("\n")) });
  assertRefusedBeforeClaim(none, runAdapter(none, [...GOOD_ARGS, ...SEND], KEY_ENV), "register");
  const twice = sandbox({ base: (s) => writeFileSync(registerPath(s), readFileSync(registerPath(s), "utf8") + "\n" + ROW + "\n") });
  assertRefusedBeforeClaim(twice, runAdapter(twice, [...GOOD_ARGS, ...SEND], KEY_ENV), "register");
});
test("refused before the claim: a local edit of the adapter, the ledger, the eyes tool or the parts tool in the working tree", () => {
  for (const rel of [ADAPTER_REL, LEDGER_REL, EYES_TOOL_REL, PARTS_TOOL_REL]) {
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
test("a normal eyes-fixed sheet — claim, dispatch record, ONE fetch of exactly the pinned bytes; E1..E5 pass; stored; no candidate; no retry", () => {
  const sb = sandbox();
  const r = runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV);
  assert.equal(r.status, 0, r.out);
  const log = fetchLog(sb); assert.equal(log.length, 1); const L = log[0];
  assert.equal(L.claimExistedAtCall, true);
  assert.deepEqual(parseEvents(L.eventsAtCall, CALL).records.map((x) => x.event), ["dispatch"]);
  assert.deepEqual([L.url, L.method, L.redirect, L.dummyKey], ["https://api.openai.com/v1/images/edits", "POST", "error", true]);
  assert.deepEqual(L.fields, ["model", "image[]", "prompt", "size", "quality", "n", "output_format", "background"]);
  assert.deepEqual([L.images, L.imageSha, L.size], [["Northstar Master v2.png"], [NORTHSTAR_SHA], "1536x1024"]);
  assert.equal(L.prompt, readFileSync(repoFile(PROMPT_REL), "utf8"), "the frozen eyes-fixed prompt, byte for byte");
  assert.deepEqual([L.background, L.hasMask, L.hasInputFidelity], ["transparent", false, false]);
  const m = manifest(sb);
  assert.deepEqual([m.outcome.classification, m.outcome.fetches, m.outcome.automaticRetry, m.outcome.candidateWritten, m.outcome.promoted], ["PASS_TO_VISUAL_REVIEW_AND_ANNOTATION", 1, false, false, false]);
  assert.deepEqual([m.accounting.claimState, m.accounting.dispatch, m.accounting.result, m.accounting.actuallySent, m.accounting.serverAnswered], ["consumed", "started", "response", 1, true]);
  assert.match(m.slot, /never an underlay call and never a face-neutral call/);
  const c = checkDoc(sb);
  assert.equal(c.verdict, "PASS_TO_ANNOTATION"); assert.deepEqual(c.auto.map((a) => a.id), ["E1", "E2", "E3", "E4", "E5"]);
  assert.deepEqual(c.thresholds, JSON.parse(JSON.stringify(THRESHOLDS)));
  assert.match(c.note, /does not approve its appearance/); assert.match(c.visualReview, /U7/);
  assert.ok(!("openingLabels" in c) && !("px" in c), "no pixel arrays in the check document");
  assert.ok(!JSON.stringify(c).includes("AUTO-5") && !JSON.stringify(c).includes("RAW-4"), "neither the face envelope nor a face-parts check");
  assert.equal(sha256(readFileSync(outFile(sb, "response.json"))), sha256(readFileSync(sb.body)));
  assert.equal(sha256(readFileSync(outFile(sb, "image-1.png"))), sha256(readFileSync(sb.png)));
  assert.deepEqual(readdirSync(outDir(sb)).sort(), ["r3-eyes-fixed-d170.check.json", "r3-eyes-fixed-d170.image-1.png", "r3-eyes-fixed-d170.request.json", "r3-eyes-fixed-d170.response.json"]);
  assert.ok(!allSandboxText(sb).includes(DUMMY_KEY.slice(3)) && !r.out.includes(DUMMY_KEY.slice(3)), "the key appears nowhere");
  const again = runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV);
  assert.equal(again.status, 1); assert.match(again.out, /REFUSED \[claim-exists\]/); assert.equal(fetchLog(sb).length, 1);
});
test("the sheet's own checks: a visible pixel in the middle strip, a skin patch or a square image is a TECHNICAL_REJECT; alpha 15 is only reported", () => {
  for (const [mode, first] of [["strip", "E2"], ["skin", "E5"], ["square", "E1"]]) {
    const sb = sandbox(); const r = runAdapter(sb, [...GOOD_ARGS, ...SEND], { ...KEY_ENV, D170_MOCK_MODE: mode });
    assert.equal(r.status, 0, mode + "\n" + r.out);
    const m = manifest(sb); assert.deepEqual([m.outcome.classification, m.check.firstFailure, m.outcome.candidateWritten], ["TECHNICAL_REJECT", first, false], mode);
    assert.ok(existsSync(outFile(sb, "image-1.png")), mode + ": the rejected sheet is still kept unchanged");
    assert.equal(runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV).status, 1, "no retry after " + mode); assert.equal(fetchLog(sb).length, 1);
  }
  const low = sandbox(); assert.equal(runAdapter(low, [...GOOD_ARGS, ...SEND], { ...KEY_ENV, D170_MOCK_MODE: "low" }).status, 0);
  const c = checkDoc(low); assert.equal(c.verdict, "PASS_TO_ANNOTATION");
  assert.deepEqual(c.diag.find((d) => d.id === "E2-LOW").value.inStripOrBorder, 1);
});
test("HTTP error, transport error and a crash inside the network call — sent, no retry, the result never downgrades the dispatch", () => {
  for (const [mode, code, cls, result, answered] of [["http500", 3, "HTTP_ERROR", "http-error", true], ["throw", 3, "DISPATCHED_RESULT_UNKNOWN", "unknown", false], ["die-in-fetch", 137, null, "unknown", false]]) {
    const sb = sandbox(); const r = runAdapter(sb, [...GOOD_ARGS, ...SEND], { ...KEY_ENV, D170_MOCK_MODE: mode });
    assert.equal(r.status, code, mode + "\n" + r.out);
    const d = onDisk(sb); assert.deepEqual([d.dispatch, d.result, d.actuallySent, d.serverAnswered], ["started", result, 1, answered], mode);
    if (cls) assert.equal(manifest(sb).outcome.classification, cls);
    assert.equal(runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV).status, 1, "no retry after " + mode); assert.equal(fetchLog(sb).length, 1);
  }
});
test("crash windows before the network: claim → dispatch undetermined; dispatch record fails or is torn → documented stop; nothing fetched", () => {
  const a = sandbox(); assert.equal(runAdapter(a, [...GOOD_ARGS, ...SEND], { ...KEY_ENV, D170_MOCK_MODE: "die-at-dispatch" }).status, 137);
  assert.deepEqual([onDisk(a).dispatch, onDisk(a).dispatchUndetermined, fetchLog(a).length], ["undetermined", 1, 0]);
  assert.equal(runAdapter(a, [...GOOD_ARGS, ...SEND], KEY_ENV).status, 1, "no retry");
  for (const mode of ["fail-dispatch", "torn-dispatch"]) {
    const sb = sandbox(); assert.equal(runAdapter(sb, [...GOOD_ARGS, ...SEND], { ...KEY_ENV, D170_MOCK_MODE: mode }).status, 3, mode);
    const m = manifest(sb); assert.deepEqual([m.outcome.classification, m.accounting.dispatch, m.accounting.actuallySent, fetchLog(sb).length], ["NOT_DISPATCHED", "not-started", 0, 0], mode);
    assert.deepEqual(parseEvents(readFileSync(sb.events, "utf8"), CALL).records.map((x) => x.event), ["stop"], mode);
  }
});
test("an unexpected image count is kept whole without selection or check", () => {
  const two = sandbox(); assert.equal(runAdapter(two, [...GOOD_ARGS, ...SEND], { ...KEY_ENV, D170_MOCK_MODE: "two" }).status, 0);
  const m2 = manifest(two); assert.deepEqual([m2.outcome.classification, m2.images.count, m2.check], ["UNEXPECTED", 2, null]);
  assert.ok(existsSync(outFile(two, "image-1.png")) && existsSync(outFile(two, "image-2.png")) && !existsSync(outFile(two, "check.json")));
  const zero = sandbox(); assert.equal(runAdapter(zero, [...GOOD_ARGS, ...SEND], { ...KEY_ENV, D170_MOCK_MODE: "zero" }).status, 0);
  assert.equal(manifest(zero).outcome.classification, "UNEXPECTED");
});
test("two simultaneous processes cannot send two requests", async () => {
  const sb = sandbox();
  const one = () => new Promise((res) => { const c = spawn(process.execPath, ["--import", pathToFileURL(sb.mock).href, join(sb.repo, ...ADAPTER_REL.split("/")), ...GOOD_ARGS, ...SEND],
    { cwd: sb.repo, env: envFor(sb, { ...KEY_ENV, D170_MOCK_MODE: "slow" }), windowsHide: true }); let out = ""; c.stdout.on("data", (d) => { out += d; }); c.stderr.on("data", (d) => { out += d; }); c.on("close", (code) => res({ code, out })); });
  const [a, b] = await Promise.all([one(), one()]);
  assert.equal(fetchLog(sb).length, 1); assert.deepEqual([a.code, b.code].sort(), [0, 1], a.out + "\n----\n" + b.out);
});
test("two clones share one claim register: a claim made from one clone refuses the send from another", () => {
  const first = sandbox(); assert.equal(runAdapter(first, [...GOOD_ARGS, ...SEND], KEY_ENV).status, 0);
  const second = sandbox();
  const r = runAdapter(second, [...GOOD_ARGS, ...SEND], { ...KEY_ENV, LOCALAPPDATA: first.state, XDG_STATE_HOME: first.state, D170_MOCK_CLAIM: first.claim, D170_MOCK_EVENTS: first.events });
  assert.equal(r.status, 1, r.out); assert.match(r.out, /REFUSED \[claim-exists\]/);
  assert.equal(fetchLog(second).length, 0, "the second clone sent nothing");
});
