// R3 HAIR SHEET — D-175: one authorised hair call (assets[8] r3-hair-northstar, its one planned call, no reserve) and its
// separate send adapter, tested without ever reaching the real world. Derived from the D-172 suite; the lessons of D-142 and
// D-145 apply unchanged:
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
import { preD175Contract, PRE_D175_CONTRACT_CANONICAL_SHA256, PRE_D175, preD174Contract, PRE_D174_CONTRACT_CANONICAL_SHA256, preD173Contract, PRE_D173_CONTRACT_CANONICAL_SHA256, preD176Contract, PRE_D176_CONTRACT_CANONICAL_SHA256, PRE_D176 } from "./avatar-r3-d147-closure.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const repoFile = (rel) => join(REPO, ...rel.split("/"));
const ADAPTER_REL = "tools/avatar/openai-send-r3-hair-d175.mjs";
const PREV_ADAPTER_REL = "tools/avatar/openai-send-r3-eyes-fixed-d172.mjs";
const LEDGER_REL = "tools/avatar/r3-face-neutral-attempt-ledger.mjs";
const HAIR_TOOL_REL = "tools/avatar/r3-hair-tool.mjs";
const EYES_TOOL_REL = "tools/avatar/r3-eyes-tool.mjs";
const PARTS_TOOL_REL = "tools/avatar/r3-face-parts-tool.mjs";
const CONTRACT_REL = "tools/avatar/fixtures/r3/r3-shadow-contract-v1.json";
const REGISTER_REL = "docs/project-state.md";
const PROMPT_REL = "tools/avatar/fixtures/r3-hair/prompt-hair-sheet-v1.txt";
const TARGETS_REL = "tools/avatar/fixtures/r3-hair/targets-hair-v1.json";
const PREV_PROMPT_REL = "tools/avatar/fixtures/r3-eyes/prompt-eyes-fixed-sheet-v2.txt";
const PREV_TARGETS_REL = "tools/avatar/fixtures/r3-eyes/targets-eyes-v2.json";
const NORTHSTAR_REL = "assets/avatar/reference/Northstar Master v2.png";
const SRC = readFileSync(repoFile(ADAPTER_REL), "utf8");
const CODE = SRC.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
// D-176 later recorded D-175's one send and closed its entry in place. LIVE is the contract exactly as D-175 committed it
// (D-176's closure reversed, proven canonical below); the closed state itself is tested at the end of this file.
const LIVE_NOW = JSON.parse(readFileSync(repoFile(CONTRACT_REL), "utf8"));
const LIVE = preD176Contract(LIVE_NOW);
const REGISTER = readFileSync(repoFile(REGISTER_REL), "utf8");
const PRE = preD175Contract(LIVE);
const PRE_REGISTER = REGISTER.split("\n").filter((l) => !l.startsWith("| **D-175** |")).join("\n");
const CALL = "D-175-r3-hair-northstar-v1";
const CLAIM_ID = CALL + "-claim";
const CLAIM_FILE = CALL + ".claim.json";
const EVENTS_FILE = CALL + ".events.jsonl";
const DUMMY_KEY = "sk-d175-sandbox-dummy-key-not-a-credential";
const APPROVAL = "--owner-approval=D-175";
const GOOD_ARGS = ["--call-id=" + CALL, "--claim-identity=" + CLAIM_ID];
const SEND = ["--send", APPROVAL];
const PROMPT_SHA = "43084da7dae90e154126d7c507f2eacae1dc205648dbe8d3614adc02f0495728";
const TARGETS_SHA = "c50356b36e4c52246269523bb9247ad21544e0cc57efd54c4b9c60fde12b24c6";
const NORTHSTAR_SHA = "3daf32e76bff9a53ec7d25cf148a230073cfd0da6a003d02a23c4292d139ff50";
const MODEL = "gpt-image-2.5-sunburst-2026-09-08";
const D172_ADAPTER_SHA = "35c56a61ead1a20920c192aa6fcb105e1f287a4f3d0f4b8fe4855d9e3401c2be";
const D174_ROW_SHA_AT_D174 = "0101667b56fa6afece079416c9723796d67cdf46a896899953442dd69fd6eaa5";
const SPENT_IDS = ["D-139-r3-underlay-head-only-v1", "D-142-r3-underlay-core-v1", "D-143-r3-underlay-core-v2", "D-151-r3-head-colour-u1-v1",
  "D-153-r3-head-colour-u1-opaque-v1", "D-160-r3-face-neutral-v1", "D-162-r3-face-neutral-guide-b-v1", "D-165-r3-face-parts-sheet-v1", "D-167-r3-face-parts-nose-v1",
  "D-170-r3-eyes-fixed-v1", "D-172-r3-eyes-fixed-v2"];
const E = LIVE.authorisedCalls.calls.find((e) => e.callId === CALL);
const IMPL = LIVE.adapterImplementations.entries.find((e) => e.decision === "D-175");
const ROW = REGISTER.split("\n").find((l) => l.startsWith("| **D-175** |"));

function isInside(child, parent) {
  if (typeof child !== "string" || typeof parent !== "string" || child === "" || parent === "") return false;
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

// ── the decision itself ───────────────────────────────────────────────────────────────────────────────────────
test("D-175 adds exactly one authorisation, its implementation, a hair axis and the frozen prompt: the contract at the D-174 merge is reproduced canonically", () => {
  assert.equal(sha256(JSON.stringify(PRE)), PRE_D175_CONTRACT_CANONICAL_SHA256);
  assert.equal(sha256(JSON.stringify(preD174Contract(LIVE))), PRE_D174_CONTRACT_CANONICAL_SHA256, "and the older chain still holds");
  assert.equal(sha256(JSON.stringify(preD173Contract(LIVE))), PRE_D173_CONTRACT_CANONICAL_SHA256);
  assert.deepEqual(Object.keys(LIVE), Object.keys(PRE), "no top-level key is added");
  assert.deepEqual([PRE.authorisedCalls.count, LIVE.authorisedCalls.count, LIVE.authorisedCalls.calls.length], [11, 12, 12]);
  assert.deepEqual(LIVE.authorisedCalls.calls.slice(0, 11), PRE.authorisedCalls.calls, "the eleven earlier entries are unchanged");
  assert.deepEqual(LIVE.adapterImplementations.entries.slice(0, -1), PRE.adapterImplementations.entries, "the earlier implementations are unchanged");
  assert.deepEqual(LIVE.assets, PRE.assets, "no asset and no planned capacity changes");
  assert.equal(LIVE.assets[8].calls, 1);
  const b = LIVE.imageCallBudget;
  assert.deepEqual([b.minimum, b.maximum, b.callsPlannedAndAuthorised.derivedBudget, b.callsPlannedAndAuthorised.hair], [23, 24, "23-24", 1]);
  assert.match(b.callsPlannedAndAuthorised.hairWhy, /No new capacity: assets\[8\]\.calls stays 1 and the derived budget stays 23-24\. No reserve/);
  assert.deepEqual(b.callsActuallySentSoFar, PRE.imageCallBudget.callsActuallySentSoFar, "actually sent is unchanged");
  assert.deepEqual([b.callsActuallySentSoFar.underlay, b.callsActuallySentSoFar.faceNeutral, b.callsActuallySentSoFar.eyesFixed, "hair" in b.callsActuallySentSoFar], [5, 4, 2, false]);
  const { prompt: pNow, ...restNow } = LIVE.hairMethod.rawSheet, { prompt: pPre, ...restPre } = PRE.hairMethod.rawSheet;
  assert.deepEqual(restNow, restPre);
  assert.deepEqual([pNow.file, pNow.sha256, pNow.bytes], [pPre.file, pPre.sha256, pPre.bytes], "the prompt pin is unchanged");
  assert.deepEqual([pPre.status, pNow.status], [PRE_D175.promptStatus, "FROZEN by D-175 — the exact bytes of the one authorised hair call D-175-r3-hair-northstar-v1, byte-identical to D-174's tracked draft."]);
  assert.deepEqual({ ...LIVE.hairMethod, rawSheet: null }, { ...PRE.hairMethod, rawSheet: null }, "the rest of D-174's hair method is unchanged");
  assert.equal(sha256(readFileSync(repoFile(PROMPT_REL))), PROMPT_SHA, "the prompt bytes are D-174's");
  for (const k of ["eyesPartsMethod", "irisContract", "deterministicOperations", "zModel", "layerContract", "hairstyleContract", "productionOrder"]) assert.deepEqual(LIVE[k], PRE[k], k + " is unchanged");
  assert.equal(LIVE.meta.authorisesImageRequest, false);
  assert.equal(LIVE.architecture.defaultEnabled, false, "R3 stays default OFF");
  assert.ok(!/AVATAR_R3\s*=\s*true/.test(readFileSync(repoFile("js/avatar-layers.js"), "utf8")), "R3 stays OFF at runtime");
});

test("D-175's entry is the ONLY live permission: the locked request, Northstar only, prompt v1 frozen, H1..H5 only; merge is not a run instruction", () => {
  assert.deepEqual(LIVE.authorisedCalls.calls.filter((e) => e.mandateState === "UNSPENT").map((e) => e.callId), [CALL]);
  for (const id of SPENT_IDS.slice(1)) { const x = LIVE.authorisedCalls.calls.find((e) => e.callId === id); assert.equal(x.mandateState, "SPENT", id); }
  assert.deepEqual([E.decision, E.preparedBy, E.status, E.mandateState, E.outcome], ["D-175", "D-175", "AUTHORISED — ONE CALL — NOT YET ATTEMPTED", "UNSPENT", "NOT YET ATTEMPTED"]);
  for (const k of ["neverReuse", "notAnActivePermission", "closedBy", "closure", "execution"]) assert.ok(!(k in E), "no " + k);
  assert.deepEqual([E.claim.identity, E.claim.filename, E.claim.eventsFilename, E.adapter.file], [CLAIM_ID, CLAIM_FILE, EVENTS_FILE, ADAPTER_REL]);
  assert.deepEqual([E.runInstruction.mergeIsNotAnInstruction, E.runInstruction.requiresSeparateExplicitOwnerInstruction], [true, true]);
  assert.match(E.runInstruction.rule, /after D-175 is merged/);
  const d172 = LIVE.authorisedCalls.calls.find((e) => e.decision === "D-172");
  assert.deepEqual([E.model, E.endpoint, E.operation, E.fieldOrder, E.neverSentFields], [d172.model, d172.endpoint, d172.operation, d172.fieldOrder, d172.neverSentFields], "the established request shape");
  assert.deepEqual(E.parameters, { size: "1024x1024", quality: "high", n: 1, output_format: "png", background: "transparent" });
  assert.deepEqual([E.inputs.length, E.inputs[0].sha256, E.inputOrder], [1, NORTHSTAR_SHA, ["Image 1"]]);
  assert.deepEqual([E.prompt.file, E.prompt.sha256, E.prompt.bytes], [PROMPT_REL, PROMPT_SHA, 1029]);
  assert.deepEqual([E.targets.file, E.targets.sha256, E.targets.status], [TARGETS_REL, TARGETS_SHA, "APPROVED"]);
  assert.deepEqual([E.outputs.dir, E.outputs.sheet, E.outputs.count, E.outputs.sheetType], ["tools/avatar/build/r3-hair-d175", [1024, 1024], 1, "r3-hair-sheet-v1"]);
  assert.match(E.otherHairstyles, /NOT authorised/);
  assert.match(E.outputHandling.technicalChecks, /H1\.\.H5/);
  assert.match(E.outputHandling.technicalChecks, /No placement check \(HP1\.\.HP8\), no ramp-B colouring/);
  assert.match(E.outputHandling.technicalChecks, /No threshold is changed after the result/);
  assert.match(E.outputHandling.annotation, /proposed as DRAFT .* Only the owner sets APPROVED/);
  assert.match(E.outputHandling.composition, /ONLY by tools\/avatar\/r3-hair-compose\.mjs .* No free manual moving, scaling or pixel repair/);
  assert.match(E.accounting.slot, /never an underlay, face-neutral or eyes call/);
  assert.match(E.counters, /underlay 5, faceNeutral 4, eyesFixed 2/);
  assert.deepEqual([IMPL.adapter.file, IMPL.adapter.status, IMPL.adapter.ownerApprovalFlag, IMPL.mandateState, IMPL.mergeIsNotAnInstruction], [ADAPTER_REL, "IMPLEMENTED — NOT EXECUTED", APPROVAL, "UNSPENT", true]);
  assert.ok(!Object.keys(IMPL.adapter).some((k) => /sha-?256/i.test(k)), "no adapter hash pinned (D-145)");
  const P = LIVE.prohibitions.noImageRequestAuthorised;
  assert.match(P, /holds TWELVE entries/);
  assert.match(P, /\(11\) D-172-r3-eyes-fixed-v2 — NO LONGER a permission/);
  assert.match(P, /\(12\) D-175-r3-hair-northstar-v1 — THE ONLY active send permission/);
  assert.match(P, /Apart from D-175's single attempt, no entry in this list is an active send permission .* no second hair call, and no other call in the R3 plan\.$/);
  assert.equal(P.replace(/ \(12\) D-175.*$/, ""), PRE_D175.noImageRequestAuthorised.replace(/ No entry in this list is an active send permission.*$/, "").replace("ELEVEN", "TWELVE"), "every earlier restriction is kept word for word");
  assert.match(LIVE.authorisedCalls.budgetAccounting, /D-175 authorises exactly that one hair sheet, not yet sent, with no reserve\. The derived budget is 23-24\./);
});

test("the D-175 register row: once, directly after D-174, D-174 verbatim, every pin named, no mojibake", () => {
  const lines = REGISTER.split("\n");
  assert.equal(lines.filter((l) => l.startsWith("| **D-175** |")).length, 1);
  assert.equal(lines.findIndex((l) => l.startsWith("| **D-175** |")), lines.findIndex((l) => l.startsWith("| **D-174** |")) + 1);
  assert.equal(sha256(lines.find((l) => l.startsWith("| **D-174** |"))), D174_ROW_SHA_AT_D174, "D-174 is not rewritten");
  for (const needle of [CALL, CLAIM_ID, CLAIM_FILE, EVENTS_FILE, MODEL, ADAPTER_REL, APPROVAL, NORTHSTAR_SHA, PROMPT_SHA, TARGETS_SHA, "1024x1024", "tools/avatar/build/r3-hair-d175/",
    "AUTHORISED — ONE CALL — NOT YET ATTEMPTED`", "IKKE EN KØRSELSINSTRUKS", "H1–H5", "23–24", "uden reserve", "`eyesFixed` = 2", "`faceNeutral` = 4", "`underlay` = 5",
    "særskilt eksekveringsbesked", "R3 forbliver default OFF"]) assert.ok(ROW.includes(needle), "the D-175 row carries " + JSON.stringify(needle));
  assert.ok(!/[ÃÂ]\S|�/.test(ROW), "no mojibake in the Danish row");
  assert.match(readFileSync(repoFile("docs/AVATAR_SYSTEM.md"), "utf8"), /\*\*D-175 \(2026-10-21\)\*\* authorised exactly ONE hair call/);
});

// ── static: the adapter's shape ─────────────────────────────────────────────────────────────────────────────────
test("the D-172 adapter is unchanged; the D-175 adapter exports nothing and imports only node built-ins, the ledger and the hair tool", () => {
  assert.equal(sha256(readFileSync(repoFile(PREV_ADAPTER_REL))), D172_ADAPTER_SHA, "the D-172 adapter is byte-identical to what ran");
  assert.ok(!/^\s*export\b/m.test(CODE));
  const imports = [...CODE.matchAll(/^\s*import\b[^;]*?from\s+"([^"]+)"/gm)].map((m) => m[1]);
  for (const s of imports) assert.ok(s.startsWith("node:") || ["./r3-face-neutral-attempt-ledger.mjs", "./r3-hair-tool.mjs"].includes(s), "unexpected import " + s);
  assert.ok(!/\bimport\s*\(/.test(CODE) && !/\brequire\s*\(/.test(CODE));
  assert.ok(CODE.includes("checkHairSheet(imgBuf)"), "the output check is D-174's H1..H5");
  for (const x of ["checkFixedSheet", "checkPartialSheet", "checkRawSheet", "checkPlacedHair", "composeHair", "applyTonalRampB", "check-r3-face-neutral-output"]) assert.ok(!CODE.includes(x), "no " + x + " in the adapter");
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
  assert.match(CODE, /const OUT_DIR = "tools\/avatar\/build\/r3-hair-d175";/);
  for (const id of SPENT_IDS) assert.ok(SRC.includes(id), "lists " + id + " as never-reuse");
  for (const v of [CALL, CLAIM_ID, CLAIM_FILE, EVENTS_FILE, APPROVAL, ADAPTER_REL, PROMPT_REL, PROMPT_SHA, TARGETS_REL, TARGETS_SHA, NORTHSTAR_SHA, MODEL]) assert.ok(SRC.includes(v), "the adapter carries " + v);
  assert.match(SRC, /const REQUIRED_DECISIONS = Object\.freeze\(\["D-142", "D-159", "D-173", "D-174", "D-175"\]\);/);
  assert.match(SRC, /const PARAMETERS = Object\.freeze\(\{ size: "1024x1024", quality: "high", n: 1, output_format: "png", background: "transparent" \}\);/);
});

// ── sandbox: a temporary git repository per scenario ─────────────────────────────────────────────────────────────
const SANDBOX_ROOTS = [];
after(() => { for (const root of SANDBOX_ROOTS) if (isInside(root, realpathSync.native(tmpdir())) && /d175-sandbox-/.test(root)) rmSync(root, { recursive: true, force: true }); });

const MOCK_SRC = [
  "// D-175 test mock: replaces globalThis.fetch (and, for the crash windows, node:fs) for one child process. Refuses to load unconfigured.",
  "import fs, { appendFileSync, existsSync, readFileSync, writeFileSync } from \"node:fs\";",
  "import { syncBuiltinESMExports } from \"node:module\";",
  "import { resolve } from \"node:path\";",
  "const LOG = process.env.D175_MOCK_LOG, MODE = process.env.D175_MOCK_MODE, CLAIM = process.env.D175_MOCK_CLAIM, EVENTS = process.env.D175_MOCK_EVENTS,",
  "  PNG = process.env.D175_MOCK_PNG, BODY = process.env.D175_MOCK_BODY;",
  "if (!LOG || !MODE || !CLAIM || !EVENTS || !PNG || !BODY) throw new Error(\"d175 mock: not configured — refusing to run\");",
  "const KEY = \"sk-d175-sandbox-dummy-key-not-a-credential\";",
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
  "globalThis.fetch = async function d175MockFetch(url, init) {",
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

// The D-172 adapter and its own pinned files are copied too, so its refusal of the closed mandate is a real authorisation refusal.
const TRACKED = [ADAPTER_REL, PREV_ADAPTER_REL, LEDGER_REL, HAIR_TOOL_REL, EYES_TOOL_REL, PARTS_TOOL_REL, REGISTER_REL, CONTRACT_REL, PROMPT_REL, TARGETS_REL, PREV_PROMPT_REL, PREV_TARGETS_REL, NORTHSTAR_REL];
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
    D175_MOCK_LOG: sb.log, D175_MOCK_MODE: "ok", D175_MOCK_CLAIM: sb.claim, D175_MOCK_EVENTS: sb.events, D175_MOCK_PNG: sb.png, D175_MOCK_BODY: sb.body }, extra || {});
  return env;
}
function sgit(sb, args) {
  const r = spawnSync("git", ["-C", sb.repo, "-c", "user.name=d175-sandbox", "-c", "user.email=sandbox@example.invalid", "-c", "core.autocrlf=false", ...args], { env: envFor(sb), encoding: "utf8", windowsHide: true });
  if (r.status !== 0) throw new Error("sandbox git " + args.join(" ") + ": " + r.stderr);
  return r.stdout.trim();
}
const contractPath = (sb) => join(sb.repo, ...CONTRACT_REL.split("/"));
const registerPath = (sb) => join(sb.repo, ...REGISTER_REL.split("/"));
const editContract = (sb, fn) => { const c = JSON.parse(readFileSync(contractPath(sb), "utf8")); fn(c); writeFileSync(contractPath(sb), JSON.stringify(c, null, 2) + "\n"); };
const editEntry = (fn) => (sb) => editContract(sb, (c) => { const i = c.authorisedCalls.calls.findIndex((e) => e.callId === CALL); c.authorisedCalls.calls[i] = fn(structuredClone(c.authorisedCalls.calls[i])); });
const editImpl = (fn) => (sb) => editContract(sb, (c) => { const i = c.adapterImplementations.entries.findIndex((e) => e.decision === "D-175"); const x = fn(structuredClone(c.adapterImplementations.entries[i])); if (x) c.adapterImplementations.entries[i] = x; else c.adapterImplementations.entries.splice(i, 1); });
const toLive = (sb) => { writeFileSync(contractPath(sb), JSON.stringify(LIVE, null, 2) + "\n"); copyFileSync(repoFile(REGISTER_REL), registerPath(sb)); };

/** A fresh sandbox. Default: the state D-175 committed (D-175 active) as origin/main. `pre`: before D-175. `closed`: since D-176. */
function sandbox({ base, layout = "main", top, pre = false, closed = false } = {}) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "d175-sandbox-")));
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
  else if (!closed) writeFileSync(contractPath(sb), JSON.stringify(LIVE, null, 2) + "\n");   // D-175 as committed, before D-176 closed it
  if (base) base(sb);
  sgit(sb, ["init", "-q", "-b", "main"]); sgit(sb, ["add", "-A"]); sgit(sb, ["commit", "-q", "-m", "base"]); sgit(sb, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  if (layout === "worktree") top(sb);
  else if (layout === "branch" || layout === "detached") {
    if (layout === "branch") sgit(sb, ["checkout", "-q", "-b", "local-d175"]); else sgit(sb, ["checkout", "-q", "--detach"]);
    top(sb); sgit(sb, ["add", "-A"]); sgit(sb, ["commit", "-q", "-m", "D-175 not merged"]);
  }
  return sb;
}
function runFile(sb, rel, args, extra) {
  const r = spawnSync(process.execPath, ["--import", pathToFileURL(sb.mock).href, join(sb.repo, ...rel.split("/")), ...args], { cwd: sb.repo, env: envFor(sb, extra), encoding: "utf8", windowsHide: true, timeout: 180000 });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
const runAdapter = (sb, args, extra) => runFile(sb, ADAPTER_REL, args, extra);
const fetchLog = (sb) => readFileSync(sb.log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const outDir = (sb) => join(sb.repo, "tools", "avatar", "build", "r3-hair-d175");
const outFile = (sb, n) => join(outDir(sb), "r3-hair-d175." + n);
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
test("THE LIVE D-175 STATE: the dry run passes with the real tracked pins and NO credential, writes nothing, claims nothing, sends nothing", () => {
  const sb = sandbox();
  const r = runAdapter(sb, GOOD_ARGS);
  assert.equal(r.status, 0, r.out); assert.match(r.out, /DRY RUN PASSED/);
  assert.match(r.out, /authorisation : exactly one active, unspent D-175-r3-hair-northstar-v1 entry and one D-175 implementation entry in origin\/main/);
  assert.match(r.out, /size 1024x1024/);
  assert.equal(existsSync(sb.claim), false); assert.equal(existsSync(sb.events), false); assert.equal(fetchLog(sb).length, 0); assert.equal(existsSync(outDir(sb)), false);
  assert.equal(readdirSync(sb.state).length, 0, "the claim register was not even created");
});
test("BEFORE D-175 nothing could send: the reconstructed pre-D-175 state is refused before any claim", () => {
  const sb = sandbox({ pre: true });
  const r = runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV);
  assertRefusedBeforeClaim(sb, r, "register"); assert.match(r.out, /D-175 appears 0 times/);
});
test("an authorisation only in the working tree, on a local branch or on a detached HEAD is refused before the claim", () => {
  const wt = sandbox({ pre: true, layout: "worktree", top: toLive }); assertRefusedBeforeClaim(wt, runAdapter(wt, [...GOOD_ARGS, ...SEND], KEY_ENV), "blob-divergence");
  const br = sandbox({ pre: true, layout: "branch", top: toLive }); assertRefusedBeforeClaim(br, runAdapter(br, [...GOOD_ARGS, ...SEND], KEY_ENV), "branch");
  const dt = sandbox({ pre: true, layout: "detached", top: toLive }); assertRefusedBeforeClaim(dt, runAdapter(dt, [...GOOD_ARGS, ...SEND], KEY_ENV), "head-not-origin-main");
});
test("D-172 STAYS CLOSED: in the live D-175 state, the D-172 adapter is refused before any claim", () => {
  const sb = sandbox();
  const r = runFile(sb, PREV_ADAPTER_REL, ["--call-id=D-172-r3-eyes-fixed-v2", "--claim-identity=D-172-r3-eyes-fixed-v2-claim", "--send", "--owner-approval=D-172"], KEY_ENV);
  assert.equal(r.status, 1, r.out); assert.match(r.out, /REFUSED \[authorisation\]/); assert.match(r.out, /mandateState: "SPENT", expected "UNSPENT"/);
  assert.equal(fetchLog(sb).length, 0); assert.equal(readdirSync(sb.state).length, 0, "the D-172 adapter created nothing in the claim register");
});

for (const [label, args] of [
  ["a wrong call-id", ["--call-id=D-175-r3-hair-northstar-v2", "--claim-identity=" + CLAIM_ID, ...SEND]],
  ["an afro call-id", ["--call-id=D-175-r3-hair-afro-v1", "--claim-identity=" + CLAIM_ID, ...SEND]],
  ...SPENT_IDS.map((id) => ["the spent call-id " + id, ["--call-id=" + id, "--claim-identity=" + CLAIM_ID, ...SEND]]),
  ["D-172's spent claim identity", ["--call-id=" + CALL, "--claim-identity=D-172-r3-eyes-fixed-v2-claim", ...SEND]],
  ["a wrong claim identity", ["--call-id=" + CALL, "--claim-identity=D-175-other-claim", ...SEND]],
  ["--send without the approval", [...GOOD_ARGS, "--send"]],
  ["the approval without --send", [...GOOD_ARGS, APPROVAL]],
  ["D-172's approval", [...GOOD_ARGS, "--send", "--owner-approval=D-172"]],
  ["--retry", [...GOOD_ARGS, ...SEND, "--retry"]],
  ["--size", [...GOOD_ARGS, ...SEND, "--size=1536x1024"]],
  ["--targets", [...GOOD_ARGS, ...SEND, "--targets=" + PREV_TARGETS_REL]],
  ["a duplicate --send", [...GOOD_ARGS, ...SEND, "--send"]],
]) test("refused before the claim: " + label, () => { const sb = sandbox(); assertRefusedBeforeClaim(sb, runAdapter(sb, args, KEY_ENV), "arguments"); });

test("refused before the claim: an inactive, spent, closed, duplicated or second permission, or a bent D-174 hair method", () => {
  for (const [label, base] of [
    ["mandate SPENT", editEntry((e) => ({ ...e, mandateState: "SPENT" }))],
    ["status PREPARED", editEntry((e) => ({ ...e, status: "PREPARED — NOT AUTHORISED" }))],
    ["already attempted", editEntry((e) => ({ ...e, outcome: "EXECUTED ONCE" }))],
    ["neverReuse", editEntry((e) => ({ ...e, neverReuse: true }))],
    ["closed", editEntry((e) => ({ ...e, closedBy: "D-176" }))],
    ["another decision", editEntry((e) => ({ ...e, decision: "D-176" }))],
    ["prepared by D-174", editEntry((e) => ({ ...e, preparedBy: "D-174" }))],
    ["H1..H5 not bound", editEntry((e) => ({ ...e, outputHandling: { ...e.outputHandling, technicalChecks: "E1..E5" } }))],
    ["placement not left to the compose tool", editEntry((e) => ({ ...e, outputHandling: { ...e.outputHandling, composition: "placed by hand" } }))],
    ["other hairstyles no longer excluded", editEntry((e) => ({ ...e, otherHairstyles: "authorised" }))],
    ["no implementation entry", editImpl(() => null)],
    ["implementation executed", editImpl((x) => ({ ...x, adapter: { ...x.adapter, status: "IMPLEMENTED — EXECUTED ONCE — SPENT" } }))],
    ["implementation pins a hash", editImpl((x) => ({ ...x, adapter: { ...x.adapter, sha256: "0".repeat(64) } }))],
    ["D-172 reopened", (sb) => editContract(sb, (c) => { const d = c.authorisedCalls.calls.find((e) => e.decision === "D-172"); d.mandateState = "UNSPENT"; })],
    ["a second live permission", (sb) => editContract(sb, (c) => { const d = c.authorisedCalls.calls.find((e) => e.decision === "D-160"); d.mandateState = "UNSPENT"; delete d.neverReuse; })],
    ["the general flag flipped", (sb) => editContract(sb, (c) => { c.meta.authorisesImageRequest = true; })],
    ["two entries for the call", (sb) => editContract(sb, (c) => { c.authorisedCalls.calls.push(structuredClone(c.authorisedCalls.calls.find((e) => e.callId === CALL))); })],
    ["D-174 method missing", (sb) => editContract(sb, (c) => { delete c.hairMethod; })],
    ["D-174 method is an authorisation", (sb) => editContract(sb, (c) => { c.hairMethod.isAuthorisation = true; })],
    ["the prompt not frozen", (sb) => editContract(sb, (c) => { c.hairMethod.rawSheet.prompt.status = PRE_D175.promptStatus; })],
    ["the method's prompt pin changed", (sb) => editContract(sb, (c) => { c.hairMethod.rawSheet.prompt.sha256 = "0".repeat(64); })],
    ["targets back to DRAFT", (sb) => editContract(sb, (c) => { c.hairMethod.targets.status = "DRAFT"; })],
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
    ["a mask in the field order", (e) => ({ ...e, fieldOrder: [...e.fieldOrder, "mask"] })],
    ["claim identity", (e) => ({ ...e, claim: { ...e.claim, identity: "D-172-r3-eyes-fixed-v2-claim" } })],
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
    [TARGETS_REL, (b) => Buffer.from(b.toString("utf8").replace("525", "526"), "utf8")], [NORTHSTAR_REL, (b) => { b[b.length - 20] ^= 0xff; return b; }]]) {
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
  assert.equal(L.prompt, readFileSync(repoFile(PROMPT_REL), "utf8"), "the frozen prompt v1, byte for byte");
  assert.deepEqual([L.background, L.hasMask, L.hasInputFidelity], ["transparent", false, false]);
  const m = manifest(sb);
  assert.deepEqual([m.outcome.classification, m.outcome.fetches, m.outcome.automaticRetry, m.outcome.candidateWritten, m.outcome.promoted, m.outcome.runtimeChanged], ["PASS_TO_VISUAL_REVIEW_AND_ANNOTATION", 1, false, false, false, false]);
  assert.deepEqual([m.accounting.claimState, m.accounting.dispatch, m.accounting.result, m.accounting.actuallySent, m.accounting.serverAnswered], ["consumed", "started", "response", 1, true]);
  assert.match(m.slot, /never an underlay, face-neutral or eyes call/);
  const c = checkDoc(sb);
  assert.equal(c.verdict, "PASS_TO_ANNOTATION"); assert.deepEqual(c.auto.map((a) => a.id), ["H1", "H2", "H3", "H4", "H5"]);
  assert.deepEqual(c.thresholds, JSON.parse(JSON.stringify(THRESHOLDS)));
  assert.match(c.note, /does not approve its appearance/); assert.match(c.placement, /ONLY by tools\/avatar\/r3-hair-compose\.mjs/); assert.match(c.annotation, /DRAFT/);
  assert.ok(!("px" in c), "no pixel array in the check document");
  assert.ok(!/"HP[1-8]"|E1|RAW-4|AUTO-5/.test(JSON.stringify(c.auto)), "neither a placement, eyes or face check");
  assert.equal(sha256(readFileSync(outFile(sb, "response.json"))), sha256(readFileSync(sb.body)));
  assert.equal(sha256(readFileSync(outFile(sb, "image-1.png"))), sha256(readFileSync(sb.png)));
  assert.deepEqual(readdirSync(outDir(sb)).sort(), ["r3-hair-d175.check.json", "r3-hair-d175.image-1.png", "r3-hair-d175.request.json", "r3-hair-d175.response.json"]);
  assert.ok(!allSandboxText(sb).includes(DUMMY_KEY.slice(3)) && !r.out.includes(DUMMY_KEY.slice(3)), "the key appears nowhere");
  const again = runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV);
  assert.equal(again.status, 1); assert.match(again.out, /REFUSED \[claim-exists\]/); assert.equal(fetchLog(sb).length, 1);
});
test("the sheet's own checks: a border pixel, a coloured pixel, a second island or a wrong size is a TECHNICAL_REJECT; alpha 15 is only reported", () => {
  for (const [mode, first] of [["border", "H2"], ["colour", "H3"], ["island", "H4"], ["wrongsize", "H1"]]) {
    const sb = sandbox(); const r = runAdapter(sb, [...GOOD_ARGS, ...SEND], { ...KEY_ENV, D175_MOCK_MODE: mode });
    assert.equal(r.status, 0, mode + "\n" + r.out);
    const m = manifest(sb); assert.deepEqual([m.outcome.classification, m.check.firstFailure, m.outcome.candidateWritten], ["TECHNICAL_REJECT", first, false], mode);
    assert.ok(existsSync(outFile(sb, "image-1.png")), mode + ": the rejected sheet is still kept unchanged");
    assert.equal(runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV).status, 1, "no retry after " + mode); assert.equal(fetchLog(sb).length, 1);
  }
  const low = sandbox(); assert.equal(runAdapter(low, [...GOOD_ARGS, ...SEND], { ...KEY_ENV, D175_MOCK_MODE: "low" }).status, 0);
  const c = checkDoc(low); assert.equal(c.verdict, "PASS_TO_ANNOTATION");
  assert.equal(c.diag.find((d) => d.id === "H-LOWALPHA").value, 1);
});
test("HTTP error, transport error and a crash inside the network call — sent, no retry, the result never downgrades the dispatch", () => {
  for (const [mode, code, cls, result, answered] of [["http500", 3, "HTTP_ERROR", "http-error", true], ["throw", 3, "DISPATCHED_RESULT_UNKNOWN", "unknown", false], ["die-in-fetch", 137, null, "unknown", false]]) {
    const sb = sandbox(); const r = runAdapter(sb, [...GOOD_ARGS, ...SEND], { ...KEY_ENV, D175_MOCK_MODE: mode });
    assert.equal(r.status, code, mode + "\n" + r.out);
    const d = onDisk(sb); assert.deepEqual([d.dispatch, d.result, d.actuallySent, d.serverAnswered], ["started", result, 1, answered], mode);
    if (cls) assert.equal(manifest(sb).outcome.classification, cls);
    assert.equal(runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV).status, 1, "no retry after " + mode); assert.equal(fetchLog(sb).length, 1);
  }
});
test("crash windows before the network: claim → dispatch undetermined; dispatch record fails or is torn → documented stop; nothing fetched", () => {
  const a = sandbox(); assert.equal(runAdapter(a, [...GOOD_ARGS, ...SEND], { ...KEY_ENV, D175_MOCK_MODE: "die-at-dispatch" }).status, 137);
  assert.deepEqual([onDisk(a).dispatch, onDisk(a).dispatchUndetermined, fetchLog(a).length], ["undetermined", 1, 0]);
  assert.equal(runAdapter(a, [...GOOD_ARGS, ...SEND], KEY_ENV).status, 1, "no retry");
  for (const mode of ["fail-dispatch", "torn-dispatch"]) {
    const sb = sandbox(); assert.equal(runAdapter(sb, [...GOOD_ARGS, ...SEND], { ...KEY_ENV, D175_MOCK_MODE: mode }).status, 3, mode);
    const m = manifest(sb); assert.deepEqual([m.outcome.classification, m.accounting.dispatch, m.accounting.actuallySent, fetchLog(sb).length], ["NOT_DISPATCHED", "not-started", 0, 0], mode);
    assert.deepEqual(parseEvents(readFileSync(sb.events, "utf8"), CALL).records.map((x) => x.event), ["stop"], mode);
  }
});
test("an unexpected image count is kept whole without selection or check", () => {
  const two = sandbox(); assert.equal(runAdapter(two, [...GOOD_ARGS, ...SEND], { ...KEY_ENV, D175_MOCK_MODE: "two" }).status, 0);
  const m2 = manifest(two); assert.deepEqual([m2.outcome.classification, m2.images.count, m2.check], ["UNEXPECTED", 2, null]);
  assert.ok(existsSync(outFile(two, "image-1.png")) && existsSync(outFile(two, "image-2.png")) && !existsSync(outFile(two, "check.json")));
  const zero = sandbox(); assert.equal(runAdapter(zero, [...GOOD_ARGS, ...SEND], { ...KEY_ENV, D175_MOCK_MODE: "zero" }).status, 0);
  assert.equal(manifest(zero).outcome.classification, "UNEXPECTED");
});
test("two simultaneous processes cannot send two requests", async () => {
  const sb = sandbox();
  const one = () => new Promise((res) => { const c = spawn(process.execPath, ["--import", pathToFileURL(sb.mock).href, join(sb.repo, ...ADAPTER_REL.split("/")), ...GOOD_ARGS, ...SEND],
    { cwd: sb.repo, env: envFor(sb, { ...KEY_ENV, D175_MOCK_MODE: "slow" }), windowsHide: true }); let out = ""; c.stdout.on("data", (d) => { out += d; }); c.stderr.on("data", (d) => { out += d; }); c.on("close", (code) => res({ code, out })); });
  const [a, b] = await Promise.all([one(), one()]);
  assert.equal(fetchLog(sb).length, 1); assert.deepEqual([a.code, b.code].sort(), [0, 1], a.out + "\n----\n" + b.out);
});
test("two clones share one claim register: a claim made from one clone refuses the send from another", () => {
  const first = sandbox(); assert.equal(runAdapter(first, [...GOOD_ARGS, ...SEND], KEY_ENV).status, 0);
  const second = sandbox();
  const r = runAdapter(second, [...GOOD_ARGS, ...SEND], { ...KEY_ENV, LOCALAPPDATA: first.state, XDG_STATE_HOME: first.state, D175_MOCK_CLAIM: first.claim, D175_MOCK_EVENTS: first.events });
  assert.equal(r.status, 1, r.out); assert.match(r.out, /REFUSED \[claim-exists\]/);
  assert.equal(fetchLog(second).length, 0, "the second clone sent nothing");
});

// ── D-176: the one send is recorded and the mandate is closed ───────────────────────────────────────────────────
const D176_ROW = REGISTER.split("\n").find((l) => l.startsWith("| **D-176** |"));
const E_NOW = LIVE_NOW.authorisedCalls.calls.find((e) => e.callId === CALL);
const IMPL_NOW = LIVE_NOW.adapterImplementations.entries.find((e) => e.decision === "D-175");
const RAW_SHA_D175 = "24bf9f70ba4d7fe436962db49eba9f5400a37a646e06a6906c813313d78a174d";
const REQUEST_ID_D175 = "req_06b406050c254e07a172b9c0797ea68e";

test("D-176 changes exactly the closure: the contract as D-175 committed it is reproduced canonically", () => {
  assert.equal(sha256(JSON.stringify(LIVE)), PRE_D176_CONTRACT_CANONICAL_SHA256, "LIVE_NOW with D-176's closure reversed is the contract at ce54884");
  assert.equal(sha256(JSON.stringify(preD175Contract(LIVE_NOW))), PRE_D175_CONTRACT_CANONICAL_SHA256, "and the older chain still holds");
  assert.deepEqual(Object.keys(LIVE_NOW), Object.keys(LIVE), "no top-level key is added");
  assert.deepEqual(LIVE_NOW.authorisedCalls.calls.slice(0, 11), LIVE.authorisedCalls.calls.slice(0, 11), "the eleven earlier entries are unchanged");
  assert.deepEqual(LIVE_NOW.adapterImplementations.entries.slice(0, -1), LIVE.adapterImplementations.entries.slice(0, -1));
  assert.deepEqual([LIVE_NOW.authorisedCalls.count, LIVE_NOW.authorisedCalls.calls.length], [12, 12], "no entry is added");
  for (const k of ["assets", "hairMethod", "eyesPartsMethod", "deterministicOperations", "layerContract", "zModel", "meta", "architecture", "irisContract"]) assert.deepEqual(LIVE_NOW[k], LIVE[k], k + " is unchanged — no threshold, pin, prompt or capacity changes");
  assert.deepEqual(LIVE_NOW.imageCallBudget.callsPlannedAndAuthorised, LIVE.imageCallBudget.callsPlannedAndAuthorised, "no new capacity");
  assert.equal(sha256(JSON.stringify(LIVE.authorisedCalls.calls.find((e) => e.callId === CALL))), E_NOW.closure.snapshotCanonicalSha256BeforeClosure);
  for (const k of Object.keys(E)) { if (["status", "mandateState", "outcome"].includes(k)) continue; assert.deepEqual(E_NOW[k], E[k], "D-175's authorisation field " + k + " is preserved"); }
  assert.deepEqual([PRE_D176.d175.mandateState, PRE_D176.d175impl.mandateState], ["UNSPENT", "UNSPENT"]);
});

test("D-176 closes D-175 in place: SPENT, never reused, not a permission; H1 passed, H2 first binding rejection, H3..H5 not evaluated, HP not run; no candidate", () => {
  assert.deepEqual([E_NOW.mandateState, E_NOW.neverReuse, E_NOW.notAnActivePermission, E_NOW.closure.closedBy], ["SPENT", true, true, "D-176"]);
  assert.match(E_NOW.status, /^SPENT — SENT ONCE, HTTP 200, ONE IMAGE RECEIVED, TECHNICAL_REJECT AT H2, NO CANDIDATE, NOTHING PROMOTED$/);
  assert.match(E_NOW.outcome, /H1 PASSED — H2 REJECTED .*column x 1008.* — H3\.\.H5 NOT EVALUATED .* — HP1\.\.HP8 NOT RUN — NO SOURCE ANNOTATION — NO CANDIDATE/);
  assert.match(E_NOW.closure.noAfterTheFactTolerance, /never cropped, moved or repaired to pass H2/);
  const x = E_NOW.execution;
  assert.deepEqual([x.request.fetches, x.request.retried, x.request.requestId, x.response.httpStatus, x.response.imagesReturned], [1, false, REQUEST_ID_D175, 200, 1]);
  assert.deepEqual([x.raw.sha256, x.raw.bytes, x.request.promptSha256], [RAW_SHA_D175, 1029136, PROMPT_SHA]);
  assert.deepEqual(x.request.parameters, { size: "1024x1024", quality: "high", n: 1, output_format: "png", background: "transparent" });
  assert.deepEqual(x.accounting, { claimState: "consumed", dispatch: "started", result: "response", actuallySent: 1, dispatchUndetermined: 0, serverAnswered: true, automaticRetry: false, logConsistent: true });
  assert.match(x.sentBy, /ce548845d2b22f191ce7af30a153ee1acf4ddce4/);
  const t = E_NOW.technicalObservations;
  assert.match(t.passed, /^H1 /);
  assert.match(t.rejected, /\(1008, 557\) alpha 18, \(1008, 598\) alpha 35, \(1008, 599\) alpha 70/);
  assert.match(t.rejected, /the image edge itself does not cut the hair/);
  assert.match(t.notEvaluated, /H3, H4 and H5 were NOT evaluated as binding checks/);
  assert.match(t.firstBindingRejection, /FIRST binding technical rejection\. It does not prove that every other technical or visual requirement is met/);
  assert.match(t.diagnosticsNotBinding, /never as a pass.*are not H3\.\.H5 results and change no verdict/);
  assert.ok(!/H[345] (passed|PASS)/i.test(JSON.stringify(t)), "no diagnostic is recorded as a passed binding check");
  assert.match(E_NOW.visualReview.status, /recognisable .* greyscale tones are promising.* fringe and the temple locks deviates.* ear transitions and the placement are not validated.* final acceptance is not possible/);
  assert.deepEqual([IMPL_NOW.adapter.status, IMPL_NOW.mandateState, IMPL_NOW.neverReuse, IMPL_NOW.closedBy], ["IMPLEMENTED — EXECUTED ONCE — SPENT", "SPENT", true, "D-176"]);
});

test("D-176's accounting: hair 1, the other figures and the budget unchanged; no entry is a live permission", () => {
  const b = LIVE_NOW.imageCallBudget, s = b.callsActuallySentSoFar;
  assert.deepEqual([s.underlay, s.faceNeutral, s.eyesFixed, s.hair], [5, 4, 2, 1]);
  assert.deepEqual([s.hairRecord.attempts.length, s.hairRecord.dispatchUndetermined, s.hairRecord.serverAnswered], [1, 0, 1]);
  assert.match(s.hairRecord.attempts[0], /^D-175-r3-hair-northstar-v1 — .*TECHNICAL_REJECT at H2 .*H3\.\.H5 not evaluated, nothing promoted \(recorded by D-176\)$/);
  const { hair, hairRecord, ...rest } = s; assert.deepEqual(rest, PRE_D176.callsActuallySentSoFar, "underlay, faceNeutral and eyesFixed records are untouched");
  assert.deepEqual([b.minimum, b.maximum, b.callsPlannedAndAuthorised.derivedBudget, b.callsPlannedAndAuthorised.hair, LIVE_NOW.assets[8].calls], [23, 24, "23-24", 1, 1]);
  assert.deepEqual(LIVE_NOW.authorisedCalls.calls.filter((e) => e.mandateState === "UNSPENT"), [], "no live permission remains");
  assert.match(LIVE_NOW.authorisedCalls.budgetAccounting, /D-175's one hair sheet, sent once \(recorded by D-176\), so actually sent is hair 1 and the planned hair capacity \(1\) is used up\. The derived budget is 23-24\./);
  const P = LIVE_NOW.prohibitions.noImageRequestAuthorised;
  assert.match(P, /\(12\) D-175-r3-hair-northstar-v1 — NO LONGER a permission/);
  assert.match(P, /No entry in this list is an active send permission — .*D-172's or D-175's call id or claim identity, no second hair call, and no other call in the R3 plan\.$/);
  assert.ok(!/THE ONLY active send permission/.test(P));
  assert.equal(P.slice(0, P.indexOf(" (12) ")), PRE_D176.noImageRequestAuthorised.slice(0, PRE_D176.noImageRequestAuthorised.indexOf(" (12) ")), "every earlier restriction is kept word for word");
});

test("THE SPENT D-175 PERMISSION IS REFUSED BEFORE THE CLAIM: in the closed D-176 state the adapter neither dry-runs nor sends", () => {
  const sb = sandbox({ closed: true });
  const dry = runAdapter(sb, GOOD_ARGS);
  assert.equal(dry.status, 1, dry.out); assert.match(dry.out, /REFUSED \[authorisation\]/); assert.match(dry.out, /mandateState: "SPENT", expected "UNSPENT"/);
  const send = runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV);
  assertRefusedBeforeClaim(sb, send, "authorisation");
  assert.match(send.out, /the entry carries neverReuse; it is not an active, unspent permission/);
  assert.equal(readdirSync(sb.state).length, 0, "the claim register was not even created");
});

test("the D-176 register row: once, directly after D-175, the outcome and the accounting named, no mojibake; the docs describe it", () => {
  const lines = REGISTER.split("\n");
  assert.equal(lines.filter((l) => l.startsWith("| **D-176** |")).length, 1);
  assert.equal(lines.findIndex((l) => l.startsWith("| **D-176** |")), lines.findIndex((l) => l.startsWith("| **D-175** |")) + 1);
  for (const needle of [CALL, CLAIM_ID, REQUEST_ID_D175, RAW_SHA_D175, "HTTP 200", "x = 1008", "H3–H5", "HP1–HP8", "første bindende", "RECORDED — D-175 SPENT — NO LIVE PERMISSION",
    "`hair` = 1", "`eyesFixed` = 2", "`faceNeutral` = 4", "`underlay` = 5", "23–24", "R3 forbliver default OFF"]) assert.ok(D176_ROW.includes(needle), "the D-176 row carries " + JSON.stringify(needle));
  assert.ok(!/[ÃÂ]\S|�/.test(D176_ROW), "no mojibake in the Danish row");
  assert.match(readFileSync(repoFile("docs/AVATAR_SYSTEM.md"), "utf8"), /\*\*D-176 \(2026-10-21\)\*\* recorded that one hair send/);
});
