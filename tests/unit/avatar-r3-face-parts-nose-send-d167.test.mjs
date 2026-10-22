// R3 face-neutral NOSE (partial sheet) — D-167: the one authorised attempt and its separate send adapter, tested without
// ever reaching the real world. Derived from the D-165 suite; the lessons of D-142 and D-145 apply unchanged:
//   · The send adapter is NEVER imported. This file reads its source as text, or runs it as a CLI in a child process
//     inside a TEMPORARY git repository that this file builds per scenario, with its own origin/main.
//   · Every child gets an environment built from an explicit ALLOWLIST: no inherited key, no real LOCALAPPDATA or
//     XDG_STATE_HOME, and TEMP/TMP/TMPDIR inside the sandbox. The key is a dummy literal.
//   · globalThis.fetch (and, for the crash windows, node:fs) is replaced from OUTSIDE by `node --import <mock>`. The
//     mock refuses to load unconfigured, never delegates to a real fetch, and logs one line per call.
//   · No test reads, lists or checks the real claim register, a real key or the real build area.
// The returned sheets are synthetic technical shapes (tests/unit/avatar-r3-face-parts-synthetic.mjs), never a face.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, readdirSync, statSync, copyFileSync, realpathSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync, spawn } from "node:child_process";
import { join, dirname, relative, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { parseEvents, deriveAttempt } from "../../tools/avatar/r3-face-neutral-attempt-ledger.mjs";
import { encodePng } from "../../tools/avatar/r3-face-parts-tool.mjs";
import { mainSheet, buildSheet, renderCell, ellipseF, COL } from "./avatar-r3-face-parts-synthetic.mjs";
import { preD167Contract, PRE_D167_CONTRACT_CANONICAL_SHA256, preD166Contract, PRE_D166_CONTRACT_CANONICAL_SHA256, preD168Contract, PRE_D168_CONTRACT_CANONICAL_SHA256, preD169Contract } from "./avatar-r3-d147-closure.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const repoFile = (rel) => join(REPO, ...rel.split("/"));
const ADAPTER_REL = "tools/avatar/openai-send-r3-face-parts-nose-d167.mjs";
const PREV_ADAPTER_REL = "tools/avatar/openai-send-r3-face-parts-d165.mjs";
const LEDGER_REL = "tools/avatar/r3-face-neutral-attempt-ledger.mjs";
const PARTS_TOOL_REL = "tools/avatar/r3-face-parts-tool.mjs";
const CONTRACT_REL = "tools/avatar/fixtures/r3/r3-shadow-contract-v1.json";
const REGISTER_REL = "docs/project-state.md";
const PROMPT_REL = "tools/avatar/fixtures/r3-face-parts/prompt-nose-partial-sheet-v1.txt";
const PREV_PROMPT_REL = "tools/avatar/fixtures/r3-face-parts/prompt-parts-sheet-v1.txt";
const NORTHSTAR_REL = "assets/avatar/reference/Northstar Master v2.png";
const SRC = readFileSync(repoFile(ADAPTER_REL), "utf8");
const CODE = SRC.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
// D-169 later added the eyes method (eyesPartsMethod). LIVE_NOW is the contract exactly as D-168 left it (D-169's
// additions removed, proven canonical in avatar-r3-eyes-d169.test.mjs).
const LIVE_NOW = preD169Contract(JSON.parse(readFileSync(repoFile(CONTRACT_REL), "utf8")));
// D-168 later recorded D-167's one send and closed its entry in place. LIVE is the contract exactly as D-167 committed
// it (D-168's closure reversed, proven canonical below); the closed state itself is tested at the end of this file.
const LIVE = preD168Contract(LIVE_NOW);
const REGISTER = readFileSync(repoFile(REGISTER_REL), "utf8");
const PRE = preD167Contract(LIVE);
const PRE_REGISTER = REGISTER.split("\n").filter((l) => !l.startsWith("| **D-167** |")).join("\n");
const CALL = "D-167-r3-face-parts-nose-v1";
const CLAIM_ID = CALL + "-claim";
const CLAIM_FILE = CALL + ".claim.json";
const EVENTS_FILE = CALL + ".events.jsonl";
const DUMMY_KEY = "sk-d167-sandbox-dummy-key-not-a-credential";
const APPROVAL = "--owner-approval=D-167";
const GOOD_ARGS = ["--call-id=" + CALL, "--claim-identity=" + CLAIM_ID];
const SEND = ["--send", APPROVAL];
const PROMPT_SHA = "ed73b60af4e895b3e846d4f4d262cf4de532fe67a7ad6250fa02c7fc0e2a6a18";
const NORTHSTAR_SHA = "3daf32e76bff9a53ec7d25cf148a230073cfd0da6a003d02a23c4292d139ff50";
const MODEL = "gpt-image-2.5-sunburst-2026-09-08";
const D166_ROW_SHA = "da0c842f17db39151b84540e5eb3e2795a9886df1a627f33e5fc93b5bc69cb1c";
const SPENT_IDS = ["D-139-r3-underlay-head-only-v1", "D-142-r3-underlay-core-v1", "D-143-r3-underlay-core-v2", "D-151-r3-head-colour-u1-v1",
  "D-153-r3-head-colour-u1-opaque-v1", "D-160-r3-face-neutral-v1", "D-162-r3-face-neutral-guide-b-v1", "D-165-r3-face-parts-sheet-v1"];
const E = LIVE.authorisedCalls.calls.find((e) => e.callId === CALL);
const IMPL = LIVE.adapterImplementations.entries.find((e) => e.decision === "D-167");
const EXT = LIVE.faceNeutralPartsExtension;
const ROW = REGISTER.split("\n").find((l) => l.startsWith("| **D-167** |"));

function isInside(child, parent) {
  if (typeof child !== "string" || typeof parent !== "string" || child === "" || parent === "") return false;
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

// ── the decision itself ───────────────────────────────────────────────────────────────────────────────────────
test("D-167 adds exactly the extension, one authorisation and the capacity for it: the contract at the D-166 merge is reproduced canonically", () => {
  assert.equal(sha256(JSON.stringify(PRE)), PRE_D167_CONTRACT_CANONICAL_SHA256);
  assert.equal(sha256(JSON.stringify(preD166Contract(LIVE))), PRE_D166_CONTRACT_CANONICAL_SHA256, "and the older chain still holds");
  assert.deepEqual(Object.keys(LIVE).filter((k) => !(k in PRE)), ["faceNeutralPartsExtension"]);
  assert.deepEqual([PRE.authorisedCalls.count, LIVE.authorisedCalls.count, LIVE.authorisedCalls.calls.length], [8, 9, 9]);
  assert.deepEqual(LIVE.authorisedCalls.calls.slice(0, 8), PRE.authorisedCalls.calls, "the eight earlier entries are unchanged");
  assert.deepEqual(LIVE.adapterImplementations.entries.slice(0, 4), PRE.adapterImplementations.entries, "the earlier implementations are unchanged");
  assert.deepEqual([PRE.assets[4].calls, LIVE.assets[4].calls], [3, 4], "the planned face capacity moves 3 -> 4");
  const b = LIVE.imageCallBudget;
  assert.deepEqual([b.minimum, b.maximum, b.callsPlannedAndAuthorised.derivedBudget, b.callsPlannedAndAuthorised.faceNeutral], [22, 23, "22-23", 4]);
  let min = 0, max = 0; for (const a of LIVE.assets) { if (typeof a.calls === "number") { min += a.calls; max += a.calls; } else { const m = /^(\d+)-(\d+)$/.exec(a.calls); min += +m[1]; max += +m[2]; } }
  assert.deepEqual([min, max], [22, 23], "the budget is derived arithmetically");
  assert.match(LIVE.authorisedCalls.budgetAccounting, /The derived budget is 22-23\./);
  assert.deepEqual(b.callsActuallySentSoFar, PRE.imageCallBudget.callsActuallySentSoFar, "actually sent is unchanged");
  assert.deepEqual([b.callsActuallySentSoFar.faceNeutral, b.callsActuallySentSoFar.underlay], [3, 5]);
  for (let i = 0; i < LIVE.assets.length; i++) if (i !== 4) assert.deepEqual(LIVE.assets[i], PRE.assets[i], "asset " + i + " is unchanged");
  for (const k of ["faceNeutralPartsMethod", "faceNeutralPreparation", "faceNeutralGuideBPreparation", "deterministicOperations", "layerContract", "zModel"]) assert.deepEqual(LIVE[k], PRE[k], k + " is unchanged");
  assert.equal(LIVE.meta.authorisesImageRequest, false);
  assert.equal(LIVE.architecture.defaultEnabled, false, "R3 stays default OFF");
  assert.ok(!/AVATAR_R3\s*=\s*true/.test(readFileSync(repoFile("js/avatar-layers.js"), "utf8")), "R3 stays OFF at runtime");
});

test("the extension: partial nose sheet with RAW-4′, composition from several sources, D-165's nose refused, DRAFT anchors stay DRAFT", () => {
  assert.deepEqual([EXT.decision, EXT.isAuthorisation, EXT.authorisesImageRequest, EXT.authorisesUpload], ["D-167", false, false, false]);
  assert.deepEqual([EXT.partialSheet.sheetType, EXT.partialSheet.contentCells, EXT.partialSheet.emptyCells, EXT.partialSheet.size], ["partial-nose-v1", ["nose"], ["browLeft", "browRight", "mouth"], [1024, 1024]]);
  assert.match(EXT.partialSheet.checks.binding.join(" "), /RAW-4′ content \(alpha > 0\) in the nose cell AND alpha = 0 everywhere in the three other cells — RGB under alpha 0 is not visible content/);
  assert.match(EXT.partialSheet.fullSheetUnchanged, /RAW-4 is not weakened/);
  assert.match(EXT.partialSheet.globalEnvelopeNotApplied, /never applied to a partial sheet/);
  assert.deepEqual(EXT.multiSourceComposition.perPart, ["raw.file", "raw.sha256 (full SHA-256)", "sheetType", "layoutId", "cell", "coordinateSpace", "annotation.file", "annotation.sha256", "annotation.status"]);
  assert.match(EXT.multiSourceComposition.rules.join(" "), /No combined "raw sheet" is ever written/);
  assert.match(EXT.multiSourceComposition.rules.join(" "), /DRAFT, REJECTED and synthetic statuses are refused/);
  assert.deepEqual(EXT.rejectedSourceParts.map((r) => [r.rawSha256, r.part, r.decision]), [["d300466081acf9595fd06b73a04682815d5248c6f3c4204f0a77aeb0a424055d", "nose", "D-166"]]);
  for (const p of ["browLeft", "browRight", "mouth"]) { assert.equal(EXT.plannedSources[p].rawSha256, "d300466081acf9595fd06b73a04682815d5248c6f3c4204f0a77aeb0a424055d"); assert.match(EXT.plannedSources[p].annotation, /^DRAFT/); }
  assert.equal(EXT.plannedSources.nose.sheetType, "partial-nose-v1");
  assert.match(EXT.noseAttempt.skinToneReview, /NOT approved for every skin tone automatically/);
  assert.match(EXT.noseAttempt.skinToneReview, /light, medium and dark skin backgrounds/);
  assert.match(EXT.noseAttempt.colourDiagnostics, /review support, never proof/);
  assert.deepEqual([EXT.noseAttempt.prompt.file, EXT.noseAttempt.prompt.sha256, EXT.noseAttempt.prompt.bytes], [PROMPT_REL, PROMPT_SHA, 1913]);
});

test("D-167's entry is the ONLY live permission: one image, the frozen nose prompt, 1024x1024, RAW-4′, merge is not a run instruction", () => {
  assert.deepEqual(LIVE.authorisedCalls.calls.filter((e) => e.mandateState === "UNSPENT").map((e) => e.callId), [CALL]);
  for (const id of SPENT_IDS.slice(5)) { const x = LIVE.authorisedCalls.calls.find((e) => e.callId === id); assert.deepEqual([x.mandateState, x.neverReuse], ["SPENT", true], id); }
  assert.deepEqual([E.decision, E.preparedBy, E.status, E.mandateState, E.outcome], ["D-167", "D-167", "AUTHORISED — ONE CALL — NOT YET ATTEMPTED", "UNSPENT", "NOT YET ATTEMPTED"]);
  for (const k of ["neverReuse", "notAnActivePermission", "closedBy", "closure", "execution"]) assert.ok(!(k in E), "no " + k);
  assert.deepEqual([E.claim.identity, E.claim.filename, E.claim.eventsFilename, E.adapter.file], [CLAIM_ID, CLAIM_FILE, EVENTS_FILE, ADAPTER_REL]);
  assert.deepEqual([E.runInstruction.mergeIsNotAnInstruction, E.runInstruction.requiresSeparateExplicitOwnerInstruction], [true, true]);
  const d165 = LIVE.authorisedCalls.calls.find((e) => e.decision === "D-165");
  assert.deepEqual([E.model, E.endpoint, E.operation, E.parameters, E.fieldOrder, E.neverSentFields], [d165.model, d165.endpoint, d165.operation, d165.parameters, d165.fieldOrder, d165.neverSentFields], "the established model and parameters, 1024x1024");
  assert.deepEqual(E.parameters, { size: "1024x1024", quality: "high", n: 1, output_format: "png", background: "transparent" });
  assert.deepEqual(E.inputs.map((i) => [i.order, i.repoPath, i.sha256, i.tracked]), [[1, NORTHSTAR_REL, NORTHSTAR_SHA, true]], "North Star is the only image");
  assert.deepEqual([E.prompt.file, E.prompt.sha256, E.prompt.bytes], [PROMPT_REL, PROMPT_SHA, 1913]);
  assert.match(E.prohibitions.noRetry, /Exactly one fetch/);
  assert.match(E.prohibitions.noPixelReuse, /D-165's rejected nose/);
  assert.match(E.accounting.slot, /never an underlay call/);
  assert.match(E.outputHandling.technicalChecks, /RAW-4′ \(content in the nose cell, alpha = 0 in the three other cells\)/);
  assert.match(E.outputHandling.technicalChecks, /D-164's four-cell RAW-4, the master-canvas face envelope and AUTO-1\.\.5 are NOT applied to the partial sheet/);
  assert.match(E.outputHandling.passMeaning, /does not approve its appearance/);
  assert.match(E.outputHandling.skinTones, /light, medium and dark skin backgrounds/);
  assert.match(E.outputHandling.annotation, /DRAFT, bound to the exact partial sheet's SHA-256/);
  assert.match(E.outputHandling.composition, /AUTO-1\.\.5 including the broad envelope/);
  assert.deepEqual([IMPL.adapter.file, IMPL.adapter.status, IMPL.adapter.ownerApprovalFlag, IMPL.mandateState, IMPL.mergeIsNotAnInstruction, IMPL.executionRequiresSeparateOwnerInstruction],
    [ADAPTER_REL, "IMPLEMENTED — NOT EXECUTED", APPROVAL, "UNSPENT", true, true]);
  assert.ok(!Object.keys(IMPL.adapter).some((k) => /sha-?256/i.test(k)), "no adapter hash pinned (D-145)");
  assert.match(LIVE.prohibitions.noImageRequestAuthorised, /holds NINE entries/);
  assert.match(LIVE.prohibitions.noImageRequestAuthorised, /\(9\) D-167-r3-face-parts-nose-v1 — THE ONLY active send permission/);
  assert.match(LIVE.prohibitions.noImageRequestAuthorised, /\(8\) D-165-r3-face-parts-sheet-v1 — NO LONGER a permission/);
});

test("the D-167 register row: once, directly after D-166, D-166 verbatim, every pin named, no mojibake", () => {
  const lines = REGISTER.split("\n");
  assert.equal(lines.filter((l) => l.startsWith("| **D-167** |")).length, 1);
  assert.equal(lines.findIndex((l) => l.startsWith("| **D-167** |")), lines.findIndex((l) => l.startsWith("| **D-166** |")) + 1);
  assert.equal(sha256(lines.find((l) => l.startsWith("| **D-166** |"))), D166_ROW_SHA, "D-166 is not rewritten");
  for (const needle of [CALL, CLAIM_ID, CLAIM_FILE, EVENTS_FILE, MODEL, ADAPTER_REL, APPROVAL, NORTHSTAR_SHA, PROMPT_SHA, PROMPT_REL, "1024x1024",
    "AUTHORISED — ONE CALL — NOT YET ATTEMPTED`", "IKKE EN KØRSELSINSTRUKS", "RAW-4′", "RAW-4 svækkes ikke", "kildemanifest", "DRAFT", "hudtone",
    "`faceNeutral` = 3", "`underlay` = 5", "fra 3 til 4", "22–23", "R3 forbliver default OFF"]) assert.ok(ROW.includes(needle), "the D-167 row carries " + JSON.stringify(needle));
  assert.ok(!/[ÃÂ]\S|\uFFFD/.test(ROW), "no mojibake in the Danish row");
});

test("the frozen nose prompt: UTF-8, LF only, one trailing LF; self-contained; the reference orientation; no filled body", () => {
  const p = readFileSync(repoFile(PROMPT_REL)), t = p.toString("utf8");
  assert.deepEqual([sha256(p), p.length], [PROMPT_SHA, 1913]);
  assert.ok(Buffer.from(t, "utf8").equals(p) && !t.includes("\r") && t.endsWith("\n") && !t.endsWith("\n\n"));
  for (const s of ["1024 x 1024 pixels", "fully transparent background", "INVISIBLE quadrants of 512 x 512 pixels: top-left, top-right, bottom-left and", "Draw ONLY in the bottom-left quadrant",
    "completely empty and fully transparent", "do not mirror or flip it", "DARK OUTLINE STROKE on the RIGHT", "discreet WARM SHADING on the LEFT", "small white highlight just to the RIGHT",
    "The nose has NO filled body", "skin patch or face surface", "Draw ONLY the nose"]) assert.ok(t.includes(s), "the prompt says " + JSON.stringify(s));
  assert.ok(!/\b(as before|previous|earlier|the same .* as before)\b/i.test(t), "no reference to a sheet the model does not receive");
});

// ── static: the adapter's shape ─────────────────────────────────────────────────────────────────────────────────
test("the D-165 adapter is unchanged; the D-167 adapter exports nothing and imports only node built-ins, the ledger and the parts tool", () => {
  assert.equal(sha256(readFileSync(repoFile(PREV_ADAPTER_REL))), "ed91751107e3298fe98276bba0b90a1fdafe3b4235fd1f47fcc4f0930eae2960", "the D-165 adapter is byte-identical to what ran");
  assert.ok(!/^\s*export\b/m.test(CODE));
  const imports = [...CODE.matchAll(/^\s*import\b[^;]*?from\s+"([^"]+)"/gm)].map((m) => m[1]);
  for (const s of imports) assert.ok(s.startsWith("node:") || ["./r3-face-neutral-attempt-ledger.mjs", "./r3-face-parts-tool.mjs"].includes(s), "unexpected import " + s);
  assert.ok(!/\bimport\s*\(/.test(CODE) && !/\brequire\s*\(/.test(CODE));
  assert.ok(!CODE.includes("checkRawSheet") && !CODE.includes("check-r3-face-neutral-output"), "neither the four-cell RAW-4 nor the master-canvas checker is applied to the partial sheet");
  assert.ok(!/384, 230, 632, 412|BROAD_ENVELOPE/.test(CODE), "the face envelope is not in the sheet path");
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
  for (const flag of ["--claim-path", "--force", "--retry", "--reset", "--out", "--ref", "--contract", "--register", "--model", "--mask", "--pin", "--sha", "--size", "--cells"]) assert.ok(!CODE.includes("\"" + flag), "no CLI flag " + flag);
  const envUses = [...CODE.matchAll(/process\.env(\.[A-Za-z_][A-Za-z0-9_]*|\[[^\]]*\]|\))?/g)].map((m) => m[0]);
  for (const u of envUses) assert.ok(new Set(["process.env.OPENAI_API" + "_KEY", "process.env.LOCALAPPDATA", "process.env.XDG_STATE_HOME", "process.env)"]).has(u), "unexpected environment read " + u);
  assert.equal([...CODE.matchAll(/process\.env\.OPENAI_API_KEY/g)].length, 1);
  const body = CODE.slice(CODE.indexOf("async function main(argv)"));
  let last = -1;
  for (const k of ["parseArgs(argv)", "resolveRefs()", "readOriginBlobs(refs.originSha)", "verifyPins(blobs)", "verifyRegister(blobs.register)", "verifyAuthorisation(parsed.contract)",
    "verifyImplementation(parsed.contract)", "resolveClaimLocation()", "pathExists(loc.claim)", "pathExists(loc.events)", "occupiedOutputs()", "buildBody(blobs, pins.prompt)",
    "if (!args.sendMode)", "const again = resolveRefs()", "process.env.OPENAI_API" + "_KEY", "claim = createClaim(", "event(\"dispatch\"", "res = await globalThis.fetch(", "checkPartialSheet(imgBuf"]) { const i = body.indexOf(k); assert.ok(i > last, k + " in order"); last = i; }
  for (const del of ["unlinkSync", "rmSync", "rmdirSync", "truncateSync", "copyFileSync"]) assert.ok(!CODE.includes(del), "must not contain " + del);
  assert.ok(!/candidate\.png|\.candidate\./.test(CODE), "no candidate file");
  assert.match(CODE, /const OUT_DIR = "tools\/avatar\/build\/r3-face-parts-nose-d167";/);
  assert.match(CODE, /const CONTENT_CELLS = Object\.freeze\(\["nose"\]\);/);
  for (const id of SPENT_IDS) assert.ok(SRC.includes(id), "lists " + id + " as never-reuse");
  for (const v of [CALL, CLAIM_ID, CLAIM_FILE, EVENTS_FILE, APPROVAL, ADAPTER_REL, PROMPT_REL, PROMPT_SHA, NORTHSTAR_SHA, MODEL]) assert.ok(SRC.includes(v), "the adapter carries " + v);
  assert.match(SRC, /const REQUIRED_DECISIONS = Object\.freeze\(\["D-142", "D-159", "D-164", "D-166", "D-167"\]\);/);
  assert.match(SRC, /const PARAMETERS = Object\.freeze\(\{ size: "1024x1024", quality: "high", n: 1, output_format: "png", background: "transparent" \}\);/);
});

// ── sandbox: a temporary git repository per scenario ─────────────────────────────────────────────────────────────
const SANDBOX_ROOTS = [];
after(() => { for (const root of SANDBOX_ROOTS) if (isInside(root, realpathSync.native(tmpdir())) && /d167-sandbox-/.test(root)) rmSync(root, { recursive: true, force: true }); });

const MOCK_SRC = [
  "// D-167 test mock: replaces globalThis.fetch (and, for the crash windows, node:fs) for one child process. Refuses to load unconfigured.",
  "import fs, { appendFileSync, existsSync, readFileSync, writeFileSync } from \"node:fs\";",
  "import { syncBuiltinESMExports } from \"node:module\";",
  "import { resolve } from \"node:path\";",
  "const LOG = process.env.D167_MOCK_LOG, MODE = process.env.D167_MOCK_MODE, CLAIM = process.env.D167_MOCK_CLAIM, EVENTS = process.env.D167_MOCK_EVENTS,",
  "  PNG = process.env.D167_MOCK_PNG, BODY = process.env.D167_MOCK_BODY;",
  "if (!LOG || !MODE || !CLAIM || !EVENTS || !PNG || !BODY) throw new Error(\"d167 mock: not configured — refusing to run\");",
  "const KEY = \"sk-d167-sandbox-dummy-key-not-a-credential\";",
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
  "globalThis.fetch = async function d167MockFetch(url, init) {",
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
  "  const named = { cut: \".cut.png\", visible: \".visible.png\", full: \".full.png\", master: \".master.png\", \"hidden-rgb\": \".hidden.png\" };",
  "  const b64 = pick(named[MODE] || \"\");",
  "  const data = MODE === \"two\" ? [{ b64_json: b64 }, { b64_json: pick(\".cut.png\") }] : MODE === \"zero\" ? [] : [{ b64_json: b64 }];",
  "  return send(JSON.stringify({ created: 1, data, usage: { total_tokens: 1 } }), 200, \"req_mockok\");",
  "};",
].join("\n");

// The D-165 adapter's own prompt is copied too, so its refusal of the closed mandate is a real authorisation refusal.
const TRACKED = [ADAPTER_REL, PREV_ADAPTER_REL, LEDGER_REL, PARTS_TOOL_REL, REGISTER_REL, CONTRACT_REL, PROMPT_REL, PREV_PROMPT_REL, NORTHSTAR_REL];
const noseCell = (cx = 260, cy = 250) => renderCell([{ value: ellipseF(cx, cy, 36, 58), rgb: COL.nose }]);
function sheetPngs() {
  const ok = buildSheet({ nose: noseCell() });
  const cut = buildSheet({ nose: noseCell(500, 250) });
  const visible = buildSheet({ nose: noseCell() }); visible.set([10, 10, 10, 1], ((100 * 1024) + 600) * 4);   // alpha 1 in browRight's cell
  const hidden = buildSheet({ nose: noseCell() }); for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) hidden.set([200, 120, 60, 0], (y * 1024 + x) * 4);   // RGB under alpha 0
  const master = new Uint8ClampedArray(1024 * 1536 * 4); for (let y = 345; y < 365; y++) for (let x = 480; x < 530; x++) master.set([90, 60, 50, 255], (y * 1024 + x) * 4);
  return { ok: encodePng(1024, 1024, ok), cut: encodePng(1024, 1024, cut), visible: encodePng(1024, 1024, visible), hidden: encodePng(1024, 1024, hidden), full: mainSheet().png, master: encodePng(1024, 1536, master) };
}
const PNGS = sheetPngs();
function envFor(sb, extra) {
  const env = {};
  for (const k of ["PATH", "Path", "SystemRoot", "windir", "COMSPEC", "PATHEXT", "SystemDrive"]) if (typeof process.env[k] === "string") env[k] = process.env[k];
  Object.assign(env, { LOCALAPPDATA: sb.state, XDG_STATE_HOME: sb.state, HOME: sb.home, USERPROFILE: sb.home, TEMP: sb.tmp, TMP: sb.tmp, TMPDIR: sb.tmp,
    HTTP_PROXY: "http://127.0.0.1:9", HTTPS_PROXY: "http://127.0.0.1:9", NO_PROXY: "", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: sb.gitconfig,
    D167_MOCK_LOG: sb.log, D167_MOCK_MODE: "ok", D167_MOCK_CLAIM: sb.claim, D167_MOCK_EVENTS: sb.events, D167_MOCK_PNG: sb.png, D167_MOCK_BODY: sb.body }, extra || {});
  return env;
}
function sgit(sb, args) {
  const r = spawnSync("git", ["-C", sb.repo, "-c", "user.name=d167-sandbox", "-c", "user.email=sandbox@example.invalid", "-c", "core.autocrlf=false", ...args], { env: envFor(sb), encoding: "utf8", windowsHide: true });
  if (r.status !== 0) throw new Error("sandbox git " + args.join(" ") + ": " + r.stderr);
  return r.stdout.trim();
}
const contractPath = (sb) => join(sb.repo, ...CONTRACT_REL.split("/"));
const registerPath = (sb) => join(sb.repo, ...REGISTER_REL.split("/"));
const editContract = (sb, fn) => { const c = JSON.parse(readFileSync(contractPath(sb), "utf8")); fn(c); writeFileSync(contractPath(sb), JSON.stringify(c, null, 2) + "\n"); };
const editEntry = (fn) => (sb) => editContract(sb, (c) => { const i = c.authorisedCalls.calls.findIndex((e) => e.callId === CALL); c.authorisedCalls.calls[i] = fn(structuredClone(c.authorisedCalls.calls[i])); });
const editImpl = (fn) => (sb) => editContract(sb, (c) => { const i = c.adapterImplementations.entries.findIndex((e) => e.decision === "D-167"); const x = fn(structuredClone(c.adapterImplementations.entries[i])); if (x) c.adapterImplementations.entries[i] = x; else c.adapterImplementations.entries.splice(i, 1); });
const toLive = (sb) => { writeFileSync(contractPath(sb), JSON.stringify(LIVE, null, 2) + "\n"); copyFileSync(repoFile(REGISTER_REL), registerPath(sb)); };

/** A fresh sandbox. Default: the state D-167 committed (D-167 active) as origin/main. `pre`: before D-167. `closed`: since D-168. */
function sandbox({ base, layout = "main", top, pre = false, closed = false } = {}) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "d167-sandbox-")));
  SANDBOX_ROOTS.push(root);
  const sb = { root, repo: join(root, "repo"), state: join(root, "state"), tmp: join(root, "tmp"), home: join(root, "home"), log: join(root, "fetch.log"),
    gitconfig: join(root, "gitconfig"), png: join(root, "mock-output.png"), body: join(root, "mock-body.json"), mock: join(root, "mock.mjs") };
  const reg = join(sb.state, "DenSejeApp", "one-shot-claims", "Moeller888-den-seje-app-frontend");
  sb.claim = join(reg, CLAIM_FILE); sb.events = join(reg, EVENTS_FILE);
  for (const d of [sb.repo, sb.state, sb.tmp, sb.home]) mkdirSync(d, { recursive: true });
  writeFileSync(sb.gitconfig, "[core]\n\tautocrlf = false\n[init]\n\tdefaultBranch = main\n");
  writeFileSync(sb.mock, MOCK_SRC); writeFileSync(sb.log, "");
  writeFileSync(sb.png, PNGS.ok);
  for (const [k, suffix] of [["cut", ".cut.png"], ["visible", ".visible.png"], ["hidden", ".hidden.png"], ["full", ".full.png"], ["master", ".master.png"]]) writeFileSync(sb.png + suffix, PNGS[k]);
  for (const rel of [...TRACKED, ".gitignore"]) { const dst = join(sb.repo, ...rel.split("/")); mkdirSync(dirname(dst), { recursive: true }); copyFileSync(repoFile(rel), dst); }
  if (pre) { writeFileSync(contractPath(sb), JSON.stringify(PRE, null, 2) + "\n"); writeFileSync(registerPath(sb), PRE_REGISTER); }
  else if (!closed) writeFileSync(contractPath(sb), JSON.stringify(LIVE, null, 2) + "\n");   // D-167 as committed, before D-168 closed it
  if (base) base(sb);
  sgit(sb, ["init", "-q", "-b", "main"]); sgit(sb, ["add", "-A"]); sgit(sb, ["commit", "-q", "-m", "base"]); sgit(sb, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  if (layout === "worktree") top(sb);
  else if (layout === "branch" || layout === "detached") {
    if (layout === "branch") sgit(sb, ["checkout", "-q", "-b", "local-d167"]); else sgit(sb, ["checkout", "-q", "--detach"]);
    top(sb); sgit(sb, ["add", "-A"]); sgit(sb, ["commit", "-q", "-m", "D-167 not merged"]);
  }
  return sb;
}
function runFile(sb, rel, args, extra) {
  const r = spawnSync(process.execPath, ["--import", pathToFileURL(sb.mock).href, join(sb.repo, ...rel.split("/")), ...args], { cwd: sb.repo, env: envFor(sb, extra), encoding: "utf8", windowsHide: true, timeout: 120000 });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
const runAdapter = (sb, args, extra) => runFile(sb, ADAPTER_REL, args, extra);
const fetchLog = (sb) => readFileSync(sb.log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const outDir = (sb) => join(sb.repo, "tools", "avatar", "build", "r3-face-parts-nose-d167");
const outFile = (sb, n) => join(outDir(sb), "r3-face-parts-nose-d167." + n);
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
test("THE LIVE D-167 STATE: the dry run passes with the real tracked pins and NO credential, writes nothing, claims nothing, sends nothing", () => {
  const sb = sandbox();
  const r = runAdapter(sb, GOOD_ARGS);
  assert.equal(r.status, 0, r.out); assert.match(r.out, /DRY RUN PASSED/);
  assert.match(r.out, /authorisation : exactly one active, unspent D-167-r3-face-parts-nose-v1 entry and one D-167 implementation entry in origin\/main/);
  assert.match(r.out, /size 1024x1024/);
  assert.equal(existsSync(sb.claim), false); assert.equal(existsSync(sb.events), false); assert.equal(fetchLog(sb).length, 0); assert.equal(existsSync(outDir(sb)), false);
  assert.equal(readdirSync(sb.state).length, 0, "the claim register was not even created");
});
test("BEFORE D-167 nothing could send: the reconstructed pre-D-167 state is refused before any claim", () => {
  const sb = sandbox({ pre: true });
  const r = runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV);
  assertRefusedBeforeClaim(sb, r, "register"); assert.match(r.out, /D-167 appears 0 times/);
});
test("an authorisation only in the working tree, on a local branch or on a detached HEAD is refused before the claim", () => {
  const wt = sandbox({ pre: true, layout: "worktree", top: toLive }); assertRefusedBeforeClaim(wt, runAdapter(wt, [...GOOD_ARGS, ...SEND], KEY_ENV), "blob-divergence");
  const br = sandbox({ pre: true, layout: "branch", top: toLive }); assertRefusedBeforeClaim(br, runAdapter(br, [...GOOD_ARGS, ...SEND], KEY_ENV), "branch");
  const dt = sandbox({ pre: true, layout: "detached", top: toLive }); assertRefusedBeforeClaim(dt, runAdapter(dt, [...GOOD_ARGS, ...SEND], KEY_ENV), "head-not-origin-main");
});
test("D-165 STAYS CLOSED: in the live D-167 state, the D-165 adapter is refused before any claim", () => {
  const sb = sandbox();
  const r = runFile(sb, PREV_ADAPTER_REL, ["--call-id=D-165-r3-face-parts-sheet-v1", "--claim-identity=D-165-r3-face-parts-sheet-v1-claim", "--send", "--owner-approval=D-165"], KEY_ENV);
  assert.equal(r.status, 1, r.out); assert.match(r.out, /REFUSED \[authorisation\]/); assert.match(r.out, /mandateState: "SPENT", expected "UNSPENT"/);
  assert.equal(fetchLog(sb).length, 0); assert.equal(readdirSync(sb.state).length, 0, "the D-165 adapter created nothing in the claim register");
});

for (const [label, args] of [
  ["a wrong call-id", ["--call-id=D-167-r3-face-parts-nose-v2", "--claim-identity=" + CLAIM_ID, ...SEND]],
  ...SPENT_IDS.map((id) => ["the spent call-id " + id, ["--call-id=" + id, "--claim-identity=" + CLAIM_ID, ...SEND]]),
  ["D-165's spent claim identity", ["--call-id=" + CALL, "--claim-identity=D-165-r3-face-parts-sheet-v1-claim", ...SEND]],
  ["a wrong claim identity", ["--call-id=" + CALL, "--claim-identity=D-167-other-claim", ...SEND]],
  ["--send without the approval", [...GOOD_ARGS, "--send"]],
  ["the approval without --send", [...GOOD_ARGS, APPROVAL]],
  ["D-165's approval", [...GOOD_ARGS, "--send", "--owner-approval=D-165"]],
  ["--retry", [...GOOD_ARGS, ...SEND, "--retry"]],
  ["--size", [...GOOD_ARGS, ...SEND, "--size=1024x1536"]],
  ["--cells", [...GOOD_ARGS, ...SEND, "--cells=browLeft"]],
  ["a duplicate --send", [...GOOD_ARGS, ...SEND, "--send"]],
]) test("refused before the claim: " + label, () => { const sb = sandbox(); assertRefusedBeforeClaim(sb, runAdapter(sb, args, KEY_ENV), "arguments"); });

test("refused before the claim: an inactive, spent, closed, duplicated or second permission, or a bent D-164/D-167 section", () => {
  for (const [label, base] of [
    ["mandate SPENT", editEntry((e) => ({ ...e, mandateState: "SPENT" }))],
    ["status PREPARED", editEntry((e) => ({ ...e, status: "PREPARED — NOT AUTHORISED" }))],
    ["already attempted", editEntry((e) => ({ ...e, outcome: "EXECUTED ONCE" }))],
    ["neverReuse", editEntry((e) => ({ ...e, neverReuse: true }))],
    ["closed", editEntry((e) => ({ ...e, closedBy: "D-168" }))],
    ["another decision", editEntry((e) => ({ ...e, decision: "D-168" }))],
    ["prepared by D-164", editEntry((e) => ({ ...e, preparedBy: "D-164" }))],
    ["no RAW-4′ bound", editEntry((e) => ({ ...e, outputHandling: { ...e.outputHandling, technicalChecks: "RAW-1..5" } }))],
    ["no implementation entry", editImpl(() => null)],
    ["implementation executed", editImpl((x) => ({ ...x, adapter: { ...x.adapter, status: "IMPLEMENTED — EXECUTED ONCE — SPENT" } }))],
    ["implementation pins a hash", editImpl((x) => ({ ...x, adapter: { ...x.adapter, sha256: "0".repeat(64) } }))],
    ["D-165 reopened", (sb) => editContract(sb, (c) => { const d = c.authorisedCalls.calls.find((e) => e.decision === "D-165"); d.mandateState = "UNSPENT"; })],
    ["a second live permission", (sb) => editContract(sb, (c) => { const d = c.authorisedCalls.calls.find((e) => e.decision === "D-160"); d.mandateState = "UNSPENT"; delete d.neverReuse; })],
    ["the general flag flipped", (sb) => editContract(sb, (c) => { c.meta.authorisesImageRequest = true; })],
    ["two entries for the call", (sb) => editContract(sb, (c) => { c.authorisedCalls.calls.push(structuredClone(c.authorisedCalls.calls.find((e) => e.callId === CALL))); })],
    ["D-164 method missing", (sb) => editContract(sb, (c) => { delete c.faceNeutralPartsMethod; })],
    ["D-164 targets not approved", (sb) => editContract(sb, (c) => { c.faceNeutralPartsMethod.targets.status = "DRAFT"; })],
    ["D-167 extension missing", (sb) => editContract(sb, (c) => { delete c.faceNeutralPartsExtension; })],
    ["D-167 extension is an authorisation", (sb) => editContract(sb, (c) => { c.faceNeutralPartsExtension.isAuthorisation = true; })],
    ["D-167 prompt pin changed", (sb) => editContract(sb, (c) => { c.faceNeutralPartsExtension.noseAttempt.prompt.sha256 = "0".repeat(64); })],
    ["D-167 content cells changed", (sb) => editContract(sb, (c) => { c.faceNeutralPartsExtension.partialSheet.contentCells = ["nose", "mouth"]; })],
    ["D-167 envelope rule removed", (sb) => editContract(sb, (c) => { c.faceNeutralPartsExtension.partialSheet.globalEnvelopeNotApplied = ""; })],
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
    ["the master size", (e) => ({ ...e, parameters: { ...e.parameters, size: "1024x1536" } })],
    ["background", (e) => ({ ...e, parameters: { ...e.parameters, background: "opaque" } })],
    ["n = 2", (e) => ({ ...e, parameters: { ...e.parameters, n: 2 } })],
    ["extra parameter", (e) => ({ ...e, parameters: { ...e.parameters, input_fidelity: "high" } })],
    ["a second input", (e) => ({ ...e, inputs: [...e.inputs, { ...e.inputs[0], order: 2, role: "Image 2" }] })],
    ["the D-165 parts-sheet prompt", (e) => ({ ...e, prompt: { ...e.prompt, sha256: "85b8500fbaca1a8ce87c3b3296818f1b3e8fd89719e97fc96a3cd9c33735c61c" } })],
    ["a mask in the field order", (e) => ({ ...e, fieldOrder: [...e.fieldOrder, "mask"] })],
    ["claim identity", (e) => ({ ...e, claim: { ...e.claim, identity: "D-165-r3-face-parts-sheet-v1-claim" } })],
    ["adapter file", (e) => ({ ...e, adapter: { file: PREV_ADAPTER_REL } })],
    ["two outputs", (e) => ({ ...e, outputs: { ...e.outputs, count: 2 } })],
    ["counted as underlay", (e) => ({ ...e, accounting: { slot: "underlay" } })],
  ]) {
    const sb = sandbox({ base: editEntry(fn) }); const r = runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV);
    assert.equal(r.status, 1, label); assert.match(r.out, /REFUSED \[authorisation\]/, label + "\n" + r.out);
    assert.equal(existsSync(sb.claim), false, label); assert.equal(fetchLog(sb).length, 0, label);
  }
});
test("refused before the claim: changed prompt or North Star bytes committed to origin/main — only the pinned bytes are sent", () => {
  for (const [rel, mutate] of [[PROMPT_REL, (b) => Buffer.from(b.toString("utf8").replace("NOSE", "NOSES"), "utf8")], [PROMPT_REL, (b) => b.subarray(0, b.length - 1)], [NORTHSTAR_REL, (b) => { b[b.length - 20] ^= 0xff; return b; }]]) {
    const sb = sandbox({ base: (s) => { const p = join(s.repo, ...rel.split("/")); writeFileSync(p, mutate(readFileSync(p))); } });
    assertRefusedBeforeClaim(sb, runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV), "pins");
  }
});
test("refused before the claim: a register row that is missing or doubled", () => {
  const none = sandbox({ base: (s) => writeFileSync(registerPath(s), readFileSync(registerPath(s), "utf8").split("\n").filter((l) => !l.startsWith("| **D-167** |")).join("\n")) });
  assertRefusedBeforeClaim(none, runAdapter(none, [...GOOD_ARGS, ...SEND], KEY_ENV), "register");
  const twice = sandbox({ base: (s) => writeFileSync(registerPath(s), readFileSync(registerPath(s), "utf8") + "\n" + ROW + "\n") });
  assertRefusedBeforeClaim(twice, runAdapter(twice, [...GOOD_ARGS, ...SEND], KEY_ENV), "register");
});
test("refused before the claim: a local edit of the adapter, the ledger or the parts tool in the working tree", () => {
  for (const rel of [ADAPTER_REL, LEDGER_REL, PARTS_TOOL_REL]) {
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
test("a normal partial sheet — claim, dispatch record, ONE fetch of exactly the pinned bytes; RAW-4′ passes; stored; no candidate; no retry", () => {
  const sb = sandbox();
  const r = runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV);
  assert.equal(r.status, 0, r.out);
  const log = fetchLog(sb); assert.equal(log.length, 1); const L = log[0];
  assert.equal(L.claimExistedAtCall, true);
  assert.deepEqual(parseEvents(L.eventsAtCall, CALL).records.map((x) => x.event), ["dispatch"]);
  assert.deepEqual([L.url, L.method, L.redirect, L.dummyKey], ["https://api.openai.com/v1/images/edits", "POST", "error", true]);
  assert.deepEqual(L.fields, ["model", "image[]", "prompt", "size", "quality", "n", "output_format", "background"]);
  assert.deepEqual([L.images, L.imageSha, L.size], [["Northstar Master v2.png"], [NORTHSTAR_SHA], "1024x1024"]);
  assert.equal(L.prompt, readFileSync(repoFile(PROMPT_REL), "utf8"), "the frozen nose prompt, byte for byte");
  assert.deepEqual([L.background, L.hasMask, L.hasInputFidelity], ["transparent", false, false]);
  const m = manifest(sb);
  assert.deepEqual([m.outcome.classification, m.outcome.fetches, m.outcome.automaticRetry, m.outcome.candidateWritten, m.outcome.promoted], ["PASS_TO_VISUAL_REVIEW_AND_ANNOTATION", 1, false, false, false]);
  assert.deepEqual([m.accounting.claimState, m.accounting.dispatch, m.accounting.result, m.accounting.actuallySent, m.accounting.serverAnswered], ["consumed", "started", "response", 1, true]);
  const c = checkDoc(sb);
  assert.equal(c.verdict, "PASS_TO_ANNOTATION"); assert.deepEqual(c.auto.map((a) => a.id), ["RAW-1", "RAW-2", "RAW-3", "RAW-4′", "RAW-5"]);
  assert.match(c.note, /does not approve its appearance/); assert.match(c.skinToneReview, /light, medium and dark skin backgrounds/);
  assert.ok(!JSON.stringify(c).includes("AUTO-5") && !JSON.stringify(c).includes("\"RAW-4\""), "neither the face envelope nor the four-cell RAW-4");
  assert.equal(sha256(readFileSync(outFile(sb, "response.json"))), sha256(readFileSync(sb.body)));
  assert.equal(sha256(readFileSync(outFile(sb, "image-1.png"))), sha256(readFileSync(sb.png)));
  assert.deepEqual(readdirSync(outDir(sb)).sort(), ["r3-face-parts-nose-d167.check.json", "r3-face-parts-nose-d167.image-1.png", "r3-face-parts-nose-d167.request.json", "r3-face-parts-nose-d167.response.json"]);
  assert.ok(!allSandboxText(sb).includes(DUMMY_KEY.slice(3)) && !r.out.includes(DUMMY_KEY.slice(3)), "the key appears nowhere");
  const again = runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV);
  assert.equal(again.status, 1); assert.match(again.out, /REFUSED \[claim-exists\]/); assert.equal(fetchLog(sb).length, 1);
});
test("the partial sheet's own checks: a visible pixel in an empty cell, a full four-part sheet, a cut nose or a master-size image is a TECHNICAL_REJECT", () => {
  for (const [mode, first] of [["visible", "RAW-4′"], ["full", "RAW-4′"], ["cut", "RAW-5"], ["master", "RAW-2"]]) {
    const sb = sandbox(); const r = runAdapter(sb, [...GOOD_ARGS, ...SEND], { ...KEY_ENV, D167_MOCK_MODE: mode });
    assert.equal(r.status, 0, mode + "\n" + r.out);
    const m = manifest(sb); assert.deepEqual([m.outcome.classification, m.check.firstFailure, m.outcome.candidateWritten], ["TECHNICAL_REJECT", first, false], mode);
    assert.ok(existsSync(outFile(sb, "image-1.png")), mode + ": the rejected sheet is still kept unchanged");
    assert.equal(runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV).status, 1, "no retry after " + mode); assert.equal(fetchLog(sb).length, 1);
  }
});
test("RGB under alpha 0 in the empty cells is not visible content: the sheet passes RAW-4′", () => {
  const sb = sandbox(); assert.equal(runAdapter(sb, [...GOOD_ARGS, ...SEND], { ...KEY_ENV, D167_MOCK_MODE: "hidden-rgb" }).status, 0);
  assert.equal(checkDoc(sb).verdict, "PASS_TO_ANNOTATION");
});
test("HTTP error, transport error and a crash inside the network call — sent, no retry, the result never downgrades the dispatch", () => {
  for (const [mode, code, cls, result, answered] of [["http500", 3, "HTTP_ERROR", "http-error", true], ["throw", 3, "DISPATCHED_RESULT_UNKNOWN", "unknown", false], ["die-in-fetch", 137, null, "unknown", false]]) {
    const sb = sandbox(); const r = runAdapter(sb, [...GOOD_ARGS, ...SEND], { ...KEY_ENV, D167_MOCK_MODE: mode });
    assert.equal(r.status, code, mode + "\n" + r.out);
    const d = onDisk(sb); assert.deepEqual([d.dispatch, d.result, d.actuallySent, d.serverAnswered], ["started", result, 1, answered], mode);
    if (cls) assert.equal(manifest(sb).outcome.classification, cls);
    assert.equal(runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV).status, 1, "no retry after " + mode); assert.equal(fetchLog(sb).length, 1);
  }
});
test("crash windows before the network: claim → dispatch undetermined; dispatch record fails or is torn → documented stop; nothing fetched", () => {
  const a = sandbox(); assert.equal(runAdapter(a, [...GOOD_ARGS, ...SEND], { ...KEY_ENV, D167_MOCK_MODE: "die-at-dispatch" }).status, 137);
  assert.deepEqual([onDisk(a).dispatch, onDisk(a).dispatchUndetermined, fetchLog(a).length], ["undetermined", 1, 0]);
  assert.equal(runAdapter(a, [...GOOD_ARGS, ...SEND], KEY_ENV).status, 1, "no retry");
  for (const mode of ["fail-dispatch", "torn-dispatch"]) {
    const sb = sandbox(); assert.equal(runAdapter(sb, [...GOOD_ARGS, ...SEND], { ...KEY_ENV, D167_MOCK_MODE: mode }).status, 3, mode);
    const m = manifest(sb); assert.deepEqual([m.outcome.classification, m.accounting.dispatch, m.accounting.actuallySent, fetchLog(sb).length], ["NOT_DISPATCHED", "not-started", 0, 0], mode);
    assert.deepEqual(parseEvents(readFileSync(sb.events, "utf8"), CALL).records.map((x) => x.event), ["stop"], mode);
  }
});
test("an unexpected image count is kept whole without selection or check", () => {
  const two = sandbox(); assert.equal(runAdapter(two, [...GOOD_ARGS, ...SEND], { ...KEY_ENV, D167_MOCK_MODE: "two" }).status, 0);
  const m2 = manifest(two); assert.deepEqual([m2.outcome.classification, m2.images.count, m2.check], ["UNEXPECTED", 2, null]);
  assert.ok(existsSync(outFile(two, "image-1.png")) && existsSync(outFile(two, "image-2.png")) && !existsSync(outFile(two, "check.json")));
  const zero = sandbox(); assert.equal(runAdapter(zero, [...GOOD_ARGS, ...SEND], { ...KEY_ENV, D167_MOCK_MODE: "zero" }).status, 0);
  assert.equal(manifest(zero).outcome.classification, "UNEXPECTED");
});
test("two simultaneous processes cannot send two requests", async () => {
  const sb = sandbox();
  const one = () => new Promise((res) => { const c = spawn(process.execPath, ["--import", pathToFileURL(sb.mock).href, join(sb.repo, ...ADAPTER_REL.split("/")), ...GOOD_ARGS, ...SEND],
    { cwd: sb.repo, env: envFor(sb, { ...KEY_ENV, D167_MOCK_MODE: "slow" }), windowsHide: true }); let out = ""; c.stdout.on("data", (d) => { out += d; }); c.stderr.on("data", (d) => { out += d; }); c.on("close", (code) => res({ code, out })); });
  const [a, b] = await Promise.all([one(), one()]);
  assert.equal(fetchLog(sb).length, 1); assert.deepEqual([a.code, b.code].sort(), [0, 1], a.out + "\n----\n" + b.out);
});
test("two clones share one claim register: a claim made from one clone refuses the send from another", () => {
  const first = sandbox(); assert.equal(runAdapter(first, [...GOOD_ARGS, ...SEND], KEY_ENV).status, 0);
  const second = sandbox();
  const r = runAdapter(second, [...GOOD_ARGS, ...SEND], { ...KEY_ENV, LOCALAPPDATA: first.state, XDG_STATE_HOME: first.state, D167_MOCK_CLAIM: first.claim, D167_MOCK_EVENTS: first.events });
  assert.equal(r.status, 1, r.out); assert.match(r.out, /REFUSED \[claim-exists\]/);
  assert.equal(fetchLog(second).length, 0, "the second clone sent nothing");
});

// ── D-168: the one send is recorded and the mandate is closed ───────────────────────────────────────────────────
const D168_ROW = REGISTER.split("\n").find((l) => l.startsWith("| **D-168** |"));
const E_NOW = LIVE_NOW.authorisedCalls.calls.find((e) => e.callId === CALL);
const IMPL_NOW = LIVE_NOW.adapterImplementations.entries.find((e) => e.decision === "D-167");
const D167_ROW_SHA_AT_PRE_D168 = "46d34839c0ccd2f96db8632f8eecbf3e83ecc066a34b03116265707afaa04503";
const RAW_SHA_D167 = "8e309b67a3304ff95682b53932e807d035d8ccb421729855fa66be96b0f0c9a0";
const REQUEST_ID_D167 = "req_1fbd147c8a804b5e9e01ce854c5ced74";

test("D-168 changes exactly the closure: the contract as D-167 committed it is reproduced canonically", () => {
  assert.equal(sha256(JSON.stringify(LIVE)), PRE_D168_CONTRACT_CANONICAL_SHA256, "LIVE_NOW with D-168's closure reversed is the contract at a21f40d");
  assert.equal(sha256(JSON.stringify(preD167Contract(LIVE_NOW))), PRE_D167_CONTRACT_CANONICAL_SHA256, "and the older chain still holds");
  assert.deepEqual(LIVE_NOW.authorisedCalls.calls.slice(0, 8), LIVE.authorisedCalls.calls.slice(0, 8), "the eight earlier entries are unchanged");
  assert.deepEqual(LIVE_NOW.adapterImplementations.entries.slice(0, 4), LIVE.adapterImplementations.entries.slice(0, 4));
  assert.deepEqual([LIVE_NOW.authorisedCalls.count, LIVE_NOW.authorisedCalls.calls.length], [9, 9], "no entry is added");
  for (const k of ["assets", "faceNeutralPartsMethod", "faceNeutralPartsExtension", "deterministicOperations", "meta", "architecture"]) assert.deepEqual(LIVE_NOW[k], LIVE[k], k + " is unchanged — no tolerance, no new capacity");
  for (const k of Object.keys(E)) { if (["status", "mandateState", "outcome"].includes(k)) continue; assert.deepEqual(E_NOW[k], E[k], "D-167's authorisation field " + k + " is preserved"); }
});

test("D-168 closes D-167 in place: SPENT, never reused, not a permission, the RAW-4′ rejection recorded without an after-the-fact tolerance", () => {
  assert.deepEqual([E_NOW.mandateState, E_NOW.neverReuse, E_NOW.notAnActivePermission, E_NOW.closure.closedBy], ["SPENT", true, true, "D-168"]);
  assert.match(E_NOW.status, /^SPENT — SENT ONCE, HTTP 200, ONE IMAGE RECEIVED, TECHNICAL_REJECT AT RAW-4′/);
  assert.equal(E_NOW.closure.snapshotCanonicalSha256BeforeClosure, sha256(JSON.stringify(E)));
  assert.match(E_NOW.closure.noAfterTheFactTolerance, /No tolerance is introduced after the result/);
  const x = E_NOW.execution;
  assert.deepEqual([x.request.fetches, x.request.retried, x.request.requestId, x.response.httpStatus, x.response.imagesReturned], [1, false, REQUEST_ID_D167, 200, 1]);
  assert.equal(x.raw.sha256, RAW_SHA_D167); assert.equal(x.request.promptSha256, PROMPT_SHA);
  assert.deepEqual(x.accounting, { claimState: "consumed", dispatch: "started", result: "response", actuallySent: 1, dispatchUndetermined: 0, serverAnswered: true, automaticRetry: false, logConsistent: true });
  assert.match(x.sentBy, /a21f40d628462cf1acf4fbbd09800ed4da3cbc0b/);
  assert.match(E_NOW.technicalObservations.passed, /RAW-1 the PNG decodes; RAW-2 1024x1024; RAW-3 8-bit RGBA/);
  assert.match(E_NOW.technicalObservations.failed, /RAW-4′: 5 px with alpha > 0 outside the nose cell/);
  assert.match(E_NOW.technicalObservations.raw5, /not evaluated as a binding check/);
  assert.match(E_NOW.visualReview.ownerDecision, /No nose is visually approved/);
  assert.deepEqual([IMPL_NOW.adapter.status, IMPL_NOW.mandateState, IMPL_NOW.neverReuse, IMPL_NOW.closedBy], ["IMPLEMENTED — EXECUTED ONCE — SPENT", "SPENT", true, "D-168"]);
});

test("D-168: faceNeutral rises to 4, underlay stays 5, no new capacity, the budget text is true to the figures, no live permission, R3 OFF", () => {
  const sent = LIVE_NOW.imageCallBudget.callsActuallySentSoFar, then = LIVE.imageCallBudget.callsActuallySentSoFar;
  assert.deepEqual([sent.faceNeutral, sent.faceNeutralRecord.serverAnswered, sent.faceNeutralRecord.dispatchUndetermined], [4, 4, 0]);
  assert.deepEqual(sent.faceNeutralRecord.attempts.slice(0, 3), then.faceNeutralRecord.attempts);
  assert.match(sent.faceNeutralRecord.attempts[3], /^D-167-r3-face-parts-nose-v1 — .*\(recorded by D-168\)$/);
  for (const k of ["underlay", "which", "note"]) assert.deepEqual(sent[k], then[k]);
  const { callsActuallySentSoFar: a, ...restNow } = LIVE_NOW.imageCallBudget, { callsActuallySentSoFar: b, ...restThen } = LIVE.imageCallBudget;
  assert.deepEqual(restNow, restThen, "no other budget field changed (planned stays 4, budget 22-23)");
  assert.deepEqual([LIVE_NOW.imageCallBudget.callsPlannedAndAuthorised.faceNeutral, LIVE_NOW.assets[4].calls], [4, 4]);
  assert.match(LIVE_NOW.authorisedCalls.budgetAccounting, /actually sent is underlay 5 and faceNeutral 4 and the planned face capacity is used up\. The derived budget is 22-23\./);
  assert.deepEqual(LIVE_NOW.authorisedCalls.calls.filter((e) => e.mandateState === "UNSPENT"), [], "no live permission remains");
  assert.match(LIVE_NOW.prohibitions.noImageRequestAuthorised, /\(9\) D-167-r3-face-parts-nose-v1 — NO LONGER a permission/);
  assert.equal(LIVE_NOW.meta.authorisesImageRequest, false); assert.equal(LIVE_NOW.architecture.defaultEnabled, false);
});

test("the D-168 register row: once, directly after D-167, D-167 verbatim, the outcome named", () => {
  const lines = REGISTER.split("\n");
  assert.equal(lines.filter((l) => l.startsWith("| **D-168** |")).length, 1);
  assert.equal(lines.findIndex((l) => l.startsWith("| **D-168** |")), lines.findIndex((l) => l.startsWith("| **D-167** |")) + 1);
  assert.equal(sha256(ROW), D167_ROW_SHA_AT_PRE_D168, "D-167's row is not rewritten");
  for (const needle of [CALL, CLAIM_ID, "a21f40d628462cf1acf4fbbd09800ed4da3cbc0b", REQUEST_ID_D167, "**HTTP 200**", RAW_SHA_D167, "RAW-1..3", "RAW-4′", "fem pixels", "alfa 1",
    "RAW-5", "ikke vurderet bindende", "ingen efterfølgende tolerance", "`callsActuallySentSoFar.faceNeutral` = **4**", "`callsActuallySentSoFar.underlay` forbliver **5**", "R3 forbliver default OFF"])
    assert.ok(D168_ROW.includes(needle), "the D-168 row carries " + JSON.stringify(needle));
  assert.ok(!/[ÃÂ]\S|�/.test(D168_ROW), "no mojibake in the Danish row");
});

test("since D-168 the LIVE contract refuses the D-167 adapter before any claim: its mandate is closed", () => {
  const sb = sandbox({ closed: true });
  assertRefusedBeforeClaim(sb, runAdapter(sb, GOOD_ARGS), "authorisation");
  const r = runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV);
  assertRefusedBeforeClaim(sb, r, "authorisation");
  assert.match(r.out, /mandateState: "SPENT", expected "UNSPENT"/);
});
