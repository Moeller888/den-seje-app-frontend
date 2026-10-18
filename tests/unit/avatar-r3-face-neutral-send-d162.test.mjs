// R3 face-neutral (guide B) — D-162: the guide-B preparation, the one authorised attempt and its separate send adapter,
// tested without ever reaching the real world.
//
// The lessons of D-142 and D-145 apply unchanged:
//   · The send adapter is NEVER imported. This file reads its source as text, or runs it as a CLI in a child process
//     inside a TEMPORARY git repository that this file builds per scenario, with its own origin/main.
//   · Every child gets an environment built from an explicit ALLOWLIST: no inherited key, no real LOCALAPPDATA or
//     XDG_STATE_HOME, and TEMP/TMP/TMPDIR inside the sandbox. The key is a dummy literal.
//   · globalThis.fetch (and, for the crash windows, node:fs) is replaced from OUTSIDE by `node --import <mock>`. The
//     mock refuses to load unconfigured, never delegates to a real fetch, and logs one line per call.
//   · No test reads, lists or checks the real claim register, a real key or the real build area.
// Guide B and its prompt are TRACKED and not private, so every scenario — including the full mocked send — runs the
// PRODUCTION adapter with the REAL pins, in CI. No synthetic pin substitution is needed.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, readdirSync, statSync, copyFileSync, realpathSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync, spawn } from "node:child_process";
import { join, dirname, relative, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { encodePngRGBA } from "../../tools/avatar/build-r2-torso-occlusion-mask.mjs";
import { readPng } from "../../tools/avatar/check-r3-face-neutral-output.mjs";
import { parseEvents, deriveAttempt } from "../../tools/avatar/r3-face-neutral-attempt-ledger.mjs";
import { preD162Contract, PRE_D162_CONTRACT_CANONICAL_SHA256, preD161Contract, PRE_D161_CONTRACT_CANONICAL_SHA256 } from "./avatar-r3-d147-closure.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const repoFile = (rel) => join(REPO, ...rel.split("/"));
const ADAPTER_REL = "tools/avatar/openai-send-r3-face-neutral-d162.mjs";
const D160_ADAPTER_REL = "tools/avatar/openai-send-r3-face-neutral-d160.mjs";
const LEDGER_REL = "tools/avatar/r3-face-neutral-attempt-ledger.mjs";
const CHECKER_REL = "tools/avatar/check-r3-face-neutral-output.mjs";
const CONTRACT_REL = "tools/avatar/fixtures/r3/r3-shadow-contract-v1.json";
const REGISTER_REL = "docs/project-state.md";
const GUIDE_REL = "tools/avatar/fixtures/r3-face-neutral/guide-b-v1.png";
const PROMPT_REL = "tools/avatar/fixtures/r3-face-neutral/prompt-guide-b-v1.txt";
const D160_PROMPT_REL = "tools/avatar/fixtures/r3-face-neutral/prompt-text.exact.txt";
const NORTHSTAR_REL = "assets/avatar/reference/Northstar Master v2.png";
const U1_REL = "tools/avatar/fixtures/r3-head-colour/r3-head-underpainting-u1-v1.png";
const SRC = readFileSync(repoFile(ADAPTER_REL), "utf8");
const CODE = SRC.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
const LIVE = JSON.parse(readFileSync(repoFile(CONTRACT_REL), "utf8"));
const REGISTER = readFileSync(repoFile(REGISTER_REL), "utf8");
const PRE = preD162Contract(LIVE);
const PRE_REGISTER = REGISTER.split("\n").filter((l) => !l.startsWith("| **D-162** |")).join("\n");
const CALL = "D-162-r3-face-neutral-guide-b-v1";
const CLAIM_ID = CALL + "-claim";
const CLAIM_FILE = CALL + ".claim.json";
const EVENTS_FILE = CALL + ".events.jsonl";
const DUMMY_KEY = "sk-d162-sandbox-dummy-key-not-a-credential";
const APPROVAL = "--owner-approval=D-162";
const GOOD_ARGS = ["--call-id=" + CALL, "--claim-identity=" + CLAIM_ID];
const SEND = ["--send", APPROVAL];
const GUIDE_SHA = "fdcb8c6d697a1a04666afed4d42f46f8d4946082a7d4dfd7134cca746966377d";
const PROMPT_SHA = "7b9323155241bae8894b3e615d696350983aeef78f89e6f6c748492a8ae103c3";
const NORTHSTAR_SHA = "3daf32e76bff9a53ec7d25cf148a230073cfd0da6a003d02a23c4292d139ff50";
const MODEL = "gpt-image-2.5-sunburst-2026-09-08";
const D160_ADAPTER_SHA = "1636ce357518530890073be908c7a9360cc910e4d77e48a42e2d26859a007bfd";
const D161_ROW_SHA = "db6ce75d945ab68a7c5689c2e741fee2079db9a10feb01308165fbc391c19048";
const SPENT_IDS = ["D-139-r3-underlay-head-only-v1", "D-142-r3-underlay-core-v1", "D-143-r3-underlay-core-v2", "D-151-r3-head-colour-u1-v1", "D-153-r3-head-colour-u1-opaque-v1", "D-160-r3-face-neutral-v1"];
const E = LIVE.authorisedCalls.calls.find((e) => e.callId === CALL);
const IMPL = LIVE.adapterImplementations.entries.find((e) => e.decision === "D-162");
const PREP = LIVE.faceNeutralGuideBPreparation;
const ROW = REGISTER.split("\n").find((l) => l.startsWith("| **D-162** |"));

function isInside(child, parent) {
  if (typeof child !== "string" || typeof parent !== "string" || child === "" || parent === "") return false;
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

// ── the decision itself ───────────────────────────────────────────────────────────────────────────────────────

test("D-162 adds exactly the guide-B preparation and one authorisation: the pre-D-162 contract is reproduced canonically", () => {
  assert.equal(sha256(JSON.stringify(PRE)), PRE_D162_CONTRACT_CANONICAL_SHA256, "LIVE minus D-162's additions is the contract at the D-162 base");
  assert.equal(sha256(JSON.stringify(preD161Contract(LIVE))), PRE_D161_CONTRACT_CANONICAL_SHA256, "and the older chain still holds");
  assert.deepEqual([PRE.authorisedCalls.count, LIVE.authorisedCalls.count], [6, 7]);
  assert.deepEqual(LIVE.authorisedCalls.calls.slice(0, 6), PRE.authorisedCalls.calls, "the six earlier entries — D-160 closed — are unchanged");
  assert.deepEqual(LIVE.adapterImplementations.entries.slice(0, 2), PRE.adapterImplementations.entries, "the D-145 and D-160 implementations are unchanged");
  assert.deepEqual(LIVE.faceNeutralPreparation, PRE.faceNeutralPreparation, "D-159's section, with its old pins, is not rewritten");
  assert.deepEqual(LIVE.imageCallBudget.callsActuallySentSoFar, PRE.imageCallBudget.callsActuallySentSoFar, "actually sent is unchanged");
  assert.deepEqual([LIVE.imageCallBudget.callsActuallySentSoFar.underlay, LIVE.imageCallBudget.callsActuallySentSoFar.faceNeutral], [5, 1]);
  assert.deepEqual([PRE.assets[4].calls, LIVE.assets[4].calls, LIVE.assets[4].name], [1, 2, "r3-face-neutral"], "the planned face-neutral capacity moves 1 -> 2");
  assert.deepEqual([LIVE.imageCallBudget.minimum, LIVE.imageCallBudget.maximum, LIVE.imageCallBudget.callsPlannedAndAuthorised.derivedBudget, LIVE.imageCallBudget.callsPlannedAndAuthorised.faceNeutral], [20, 21, "20-21", 2]);
  let min = 0, max = 0; for (const a of LIVE.assets) { if (typeof a.calls === "number") { min += a.calls; max += a.calls; } else { const m = /^(\d+)-(\d+)$/.exec(a.calls); min += +m[1]; max += +m[2]; } }
  assert.deepEqual([min, max], [20, 21], "the budget is derived arithmetically");
  for (let i = 0; i < LIVE.assets.length; i++) if (i !== 4) assert.deepEqual(LIVE.assets[i], PRE.assets[i], "asset " + i + " is unchanged");
  assert.equal(LIVE.meta.authorisesImageRequest, false);
  assert.equal(LIVE.architecture.defaultEnabled, false, "R3 stays default OFF");
  assert.ok(!/AVATAR_R3\s*=\s*true/.test(readFileSync(repoFile("js/avatar-layers.js"), "utf8")), "R3 stays OFF at runtime");
});

test("D-162's entry is the ONLY live permission: UNSPENT, NOT YET ATTEMPTED, one fetch, merge is not a run instruction; D-160 stays SPENT", () => {
  assert.deepEqual(LIVE.authorisedCalls.calls.filter((e) => e.mandateState === "UNSPENT").map((e) => e.callId), [CALL]);
  const d160 = LIVE.authorisedCalls.calls.find((e) => e.decision === "D-160");
  assert.deepEqual([d160.mandateState, d160.neverReuse, d160.notAnActivePermission, d160.closure.closedBy], ["SPENT", true, true, "D-161"]);
  assert.deepEqual([E.decision, E.preparedBy, E.status, E.mandateState, E.outcome], ["D-162", "D-162", "AUTHORISED — ONE CALL — NOT YET ATTEMPTED", "UNSPENT", "NOT YET ATTEMPTED"]);
  for (const k of ["neverReuse", "notAnActivePermission", "closedBy", "closure", "execution"]) assert.ok(!(k in E), "no " + k);
  assert.deepEqual([E.claim.identity, E.claim.filename, E.claim.eventsFilename, E.adapter.file], [CLAIM_ID, CLAIM_FILE, EVENTS_FILE, ADAPTER_REL]);
  assert.deepEqual([E.runInstruction.mergeIsNotAnInstruction, E.runInstruction.requiresSeparateExplicitOwnerInstruction], [true, true]);
  assert.deepEqual([E.model, E.endpoint, E.operation], [MODEL, "https://api.openai.com/v1/images/edits", "images.edits"]);
  assert.deepEqual(E.parameters, { size: "1024x1536", quality: "high", n: 1, output_format: "png", background: "transparent" });
  assert.deepEqual(E.neverSentFields, ["mask", "input_fidelity", "output_compression", "response_format", "moderation"]);
  assert.deepEqual(E.inputs.map((i) => [i.order, i.repoPath, i.sha256, i.tracked]), [[1, GUIDE_REL, GUIDE_SHA, true], [2, NORTHSTAR_REL, NORTHSTAR_SHA, true]]);
  assert.deepEqual([E.prompt.file, E.prompt.sha256, E.prompt.bytes], [PROMPT_REL, PROMPT_SHA, 3435]);
  assert.match(E.prohibitions.noRetry, /Exactly one fetch/);
  assert.match(E.accounting.slot, /never a sixth underlay call/);
  assert.match(E.outputHandling.review.join(" "), /later approved underlay and with the later R3 eyes and hair \(D-159 productionOrderException, which applies to this attempt as well\)/);
  assert.match(E.outputHandling.review.join(" "), /An eyebrow can lie inside its window and still be wrong/);
  assert.deepEqual([IMPL.adapter.file, IMPL.adapter.status, IMPL.adapter.ownerApprovalFlag, IMPL.mandateState, IMPL.mergeIsNotAnInstruction, IMPL.executionRequiresSeparateOwnerInstruction],
    [ADAPTER_REL, "IMPLEMENTED — NOT EXECUTED", APPROVAL, "UNSPENT", true, true]);
  assert.ok(!Object.keys(IMPL.adapter).some((k) => /sha-?256/i.test(k)), "no adapter hash pinned (D-145)");
  assert.match(LIVE.prohibitions.noImageRequestAuthorised, /holds SEVEN entries/);
  assert.match(LIVE.prohibitions.noImageRequestAuthorised, /\(7\) D-162-r3-face-neutral-guide-b-v1 — THE ONLY active send permission/);
  assert.match(LIVE.prohibitions.noImageRequestAuthorised, /\(6\) D-160-r3-face-neutral-v1 — NO LONGER a permission/);
});

test("the guide-B preparation section: new basis, windows are guidance not limits, findings stay limited to one output", () => {
  assert.deepEqual([PREP.decision, PREP.isAuthorisation], ["D-162", false]);
  assert.deepEqual(PREP.preparedRequest.inputs, E.inputs); assert.deepEqual(PREP.preparedRequest.prompt, E.prompt);
  assert.deepEqual(PREP.preparedRequest.parameters, E.parameters); assert.deepEqual(PREP.preparedRequest.fieldOrder, E.fieldOrder);
  assert.match(PREP.guideB.windowsAreGuidanceNotLimits, /NOT new binding production limits/);
  assert.match(PREP.guideB.windowsAreGuidanceNotLimits, /never permit a clipped feature/);
  assert.match(PREP.relationToD159, /BINDING broad envelope \[384, 230, 632, 412\]/);
  assert.match(PREP.findingsFromD160.hypothesis, /NOT proven/);
  assert.match(PREP.findingsFromD160.noCompensation, /No inverse scaling or offset/);
  assert.match(PREP.findingsFromD160.noseFormProposal, /D-161 is not rewritten/);
  assert.ok(!JSON.stringify(LIVE).includes("D-148"), "the contract still says nothing about D-148");
});

test("the D-162 register row: once, directly after D-161, D-161 verbatim, every pin named, no mojibake", () => {
  const lines = REGISTER.split("\n");
  assert.equal(lines.filter((l) => l.startsWith("| **D-162** |")).length, 1);
  assert.equal(lines.findIndex((l) => l.startsWith("| **D-162** |")), lines.findIndex((l) => l.startsWith("| **D-161** |")) + 1);
  assert.equal(sha256(lines.find((l) => l.startsWith("| **D-161** |"))), D161_ROW_SHA, "D-161 is not rewritten");
  for (const needle of [CALL, CLAIM_ID, CLAIM_FILE, EVENTS_FILE, MODEL, ADAPTER_REL, APPROVAL, GUIDE_SHA, NORTHSTAR_SHA, PROMPT_SHA, GUIDE_REL, PROMPT_REL,
    "`AUTHORISED — ONE CALL — NOT YET ATTEMPTED`", "IKKE EN KØRSELSINSTRUKS", "D-159's rækkefølgeundtagelse gælder også dette forsøg", "ingen retry",
    "Faktisk sendt er uændret: `underlay` = 5, `faceNeutral` = 1.", "ubevist hypotese", "R3 forbliver default OFF"]) assert.ok(ROW.includes(needle), "the D-162 row carries " + JSON.stringify(needle));
  assert.ok(!/[ÃÂ]\S|\uFFFD/.test(ROW), "no mojibake in the Danish row");
});

test("the tracked fixtures are the approved bytes; guide B is binary-alpha, RGB 0 under alpha 0, and only U1 pixels plus markers", () => {
  const g = readFileSync(repoFile(GUIDE_REL)), p = readFileSync(repoFile(PROMPT_REL));
  assert.deepEqual([sha256(g), g.length, sha256(p), p.length], [GUIDE_SHA, 9371, PROMPT_SHA, 3435]);
  const t = p.toString("utf8"); assert.ok(!t.includes("\r") && !t.endsWith("\n") && Buffer.from(t, "utf8").equals(p), "prompt: UTF-8, LF, no trailing newline");
  const G = readPng(g), U = readPng(readFileSync(repoFile(U1_REL))).rgba;
  assert.deepEqual([G.header.w, G.header.h, G.header.bitDepth, G.header.colourType, G.header.interlace], [1024, 1536, 8, 6, 0]);
  let nonBinary = 0, rgbUnder0 = 0, foreign = 0;
  for (let q = 0; q < 1024 * 1536; q++) { const a = G.rgba[q * 4 + 3]; if (a !== 0 && a !== 255) nonBinary++; if (!a) { if (G.rgba[q * 4] || G.rgba[q * 4 + 1] || G.rgba[q * 4 + 2]) rgbUnder0++; continue; }
    const c = [0, 1, 2].map((k) => G.rgba[q * 4 + k]).join(","); if (c === "0,255,255" || c === "255,0,255") continue; if (!(U[q * 4 + 3] === 255 && [0, 1, 2, 3].every((k) => G.rgba[q * 4 + k] === U[q * 4 + k]))) foreign++; }
  assert.deepEqual([nonBinary, rgbUnder0, foreign], [0, 0, 0]);
  for (const s of ["Do not judge the size of the features from the head", "mirrored left-to-right", "follow the outline, not a mirror position",
    "Never cut, clip, flatten or shorten an eyebrow", "not at the edges of the unhatched window", "they are not shapes to fill"]) assert.ok(t.includes(s), "the prompt says " + JSON.stringify(s));
});

// ── static: the adapter's shape ─────────────────────────────────────────────────────────────────────────────────

test("the D-160 adapter is unchanged; the D-162 adapter exports nothing and imports only node built-ins, the ledger and the checker", () => {
  assert.equal(sha256(readFileSync(repoFile(D160_ADAPTER_REL))), D160_ADAPTER_SHA, "the D-160 adapter is byte-identical to what ran");
  assert.ok(!/^\s*export\b/m.test(CODE));
  const imports = [...CODE.matchAll(/^\s*import\b[^;]*?from\s+"([^"]+)"/gm)].map((m) => m[1]);
  for (const s of imports) assert.ok(s.startsWith("node:") || ["./r3-face-neutral-attempt-ledger.mjs", "./check-r3-face-neutral-output.mjs"].includes(s), "unexpected import " + s);
  assert.ok(!/\bimport\s*\(/.test(CODE) && !/\brequire\s*\(/.test(CODE));
});

test("exactly one fetch, with redirect \"error\", not in a loop; no retry, no fallback; git never touches the network", () => {
  assert.equal([...CODE.matchAll(/\bfetch\s*\(/g)].length, 1);
  assert.match(CODE, /globalThis\.fetch\(ENDPOINT, \{ method: "POST", redirect: "error", headers: \{ Authorization: "Bearer " \+ apiKey \}, body: built\.body \}\)/);
  assert.ok(!/["'](fetch|pull|push|remote|ls-remote|clone)["']/.test(CODE));
  const prose = /no retry, no fallback|No outcome permits an automatic retry|there is no fallback|automaticRetry: false|NO RETRY/gi;
  for (const w of ["retry", "maxRetries", "retries", "backoff", "fallback"]) assert.ok(!new RegExp("\\b" + w + "\\b", "i").test(CODE.replace(prose, "")), "no " + w);
});

test("no external guide, no injection point, no bypass flag; the key is read once, after every check", () => {
  for (const s of ["--guide", "readGuide", "args.guide", "guide A′"]) assert.ok(!CODE.includes(s), "no " + s);
  for (const hook of ["fetchImpl", "claimPath", "outDir:", "registerPath", "contractPath", "gitRef", "specPath"]) assert.ok(!CODE.includes(hook), "no injection point " + hook);
  for (const flag of ["--claim-path", "--force", "--retry", "--reset", "--out", "--ref", "--contract", "--register", "--model", "--mask", "--pin", "--sha"]) assert.ok(!CODE.includes("\"" + flag), "no CLI flag " + flag);
  const envUses = [...CODE.matchAll(/process\.env(\.[A-Za-z_][A-Za-z0-9_]*|\[[^\]]*\]|\))?/g)].map((m) => m[0]);
  for (const u of envUses) assert.ok(new Set(["process.env.OPENAI_API" + "_KEY", "process.env.LOCALAPPDATA", "process.env.XDG_STATE_HOME", "process.env)"]).has(u), "unexpected environment read " + u);
  assert.equal([...CODE.matchAll(/process\.env\.OPENAI_API_KEY/g)].length, 1);
  const body = CODE.slice(CODE.indexOf("async function main(argv)"));
  let last = -1;
  for (const k of ["parseArgs(argv)", "resolveRefs()", "readOriginBlobs(refs.originSha)", "verifyPins(blobs)", "verifyRegister(blobs.register)", "verifyAuthorisation(parsed.contract)",
    "verifyImplementation(parsed.contract)", "resolveClaimLocation()", "pathExists(loc.claim)", "pathExists(loc.events)", "occupiedOutputs()", "buildBody(blobs.guide, blobs, pins.prompt)",
    "if (!args.sendMode)", "const again = resolveRefs()", "process.env.OPENAI_API" + "_KEY", "claim = createClaim(", "event(\"dispatch\"", "res = await globalThis.fetch("]) { const i = body.indexOf(k); assert.ok(i > last, k + " in order"); last = i; }
  for (const del of ["unlinkSync", "rmSync", "rmdirSync", "truncateSync", "copyFileSync"]) assert.ok(!CODE.includes(del), "must not contain " + del);
  assert.ok(!/candidate\.png|\.candidate\./.test(CODE), "no candidate file");
  assert.match(CODE, /const OUT_DIR = "tools\/avatar\/build\/r3-face-neutral-d162";/);
  for (const id of SPENT_IDS) assert.ok(SRC.includes(id), "lists " + id + " as never-reuse");
});

test("the adapter's constants equal the entry, the preparation section and the tracked files", () => {
  for (const v of [CALL, CLAIM_ID, CLAIM_FILE, EVENTS_FILE, APPROVAL, ADAPTER_REL, GUIDE_REL, PROMPT_REL, GUIDE_SHA, PROMPT_SHA, NORTHSTAR_SHA, MODEL]) assert.ok(SRC.includes(v), "the adapter carries " + v);
  assert.match(SRC, /const REQUIRED_DECISIONS = Object\.freeze\(\["D-142", "D-159", "D-161", "D-162"\]\);/);
  assert.match(SRC, /const GUIDE = Object\.freeze\(\{ role: "Image 1", name: "guide-b-v1\.png", bytes: 9371,/);
});

// ── sandbox: a temporary git repository per scenario ─────────────────────────────────────────────────────────────
const SANDBOX_ROOTS = [];
after(() => { for (const root of SANDBOX_ROOTS) if (isInside(root, realpathSync.native(tmpdir())) && /d162-sandbox-/.test(root)) rmSync(root, { recursive: true, force: true }); });

const MOCK_SRC = [
  "// D-162 test mock: replaces globalThis.fetch (and, for the crash windows, node:fs) for one child process. Refuses to load unconfigured.",
  "import fs, { appendFileSync, existsSync, readFileSync, writeFileSync } from \"node:fs\";",
  "import { syncBuiltinESMExports } from \"node:module\";",
  "import { resolve } from \"node:path\";",
  "const LOG = process.env.D162_MOCK_LOG, MODE = process.env.D162_MOCK_MODE, CLAIM = process.env.D162_MOCK_CLAIM, EVENTS = process.env.D162_MOCK_EVENTS,",
  "  PNG = process.env.D162_MOCK_PNG, BODY = process.env.D162_MOCK_BODY;",
  "if (!LOG || !MODE || !CLAIM || !EVENTS || !PNG || !BODY) throw new Error(\"d162 mock: not configured — refusing to run\");",
  "const KEY = \"sk-d162-sandbox-dummy-key-not-a-credential\";",
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
  "globalThis.fetch = async function d162MockFetch(url, init) {",
  "  const headers = init && init.headers ? init.headers : {};",
  "  const body = init ? init.body : null;",
  "  appendFileSync(LOG, JSON.stringify({ url: String(url), method: init && init.method, redirect: init && init.redirect, dummyKey: headers.Authorization === \"Bearer \" + KEY,",
  "    claimExistedAtCall: existsSync(CLAIM), eventsAtCall: existsSync(EVENTS) ? readFileSync(EVENTS, \"utf8\") : null,",
  "    fields: body && typeof body.keys === \"function\" ? [...body.keys()] : null,",
  "    images: body && typeof body.getAll === \"function\" ? body.getAll(\"image[]\").map((f) => f.name) : null,",
  "    imageSha: body && typeof body.getAll === \"function\" ? await Promise.all(body.getAll(\"image[]\").map(async (f) => (await import(\"node:crypto\")).createHash(\"sha256\").update(Buffer.from(await f.arrayBuffer())).digest(\"hex\"))) : null,",
  "    prompt: body && typeof body.get === \"function\" ? body.get(\"prompt\") : null, background: body && typeof body.get === \"function\" ? body.get(\"background\") : null,",
  "    hasMask: body && typeof body.has === \"function\" ? body.has(\"mask\") : null, hasInputFidelity: body && typeof body.has === \"function\" ? body.has(\"input_fidelity\") : null, pid: process.pid }) + \"\\n\");",
  "  if (MODE === \"slow\") await new Promise((r) => setTimeout(r, 1500));",
  "  if (MODE === \"die-in-fetch\") process.exit(137);",
  "  if (MODE === \"throw\") throw new TypeError(\"fetch failed (mock transport error)\");",
  "  const send = (text, status, id) => { writeFileSync(BODY, text); return new Response(text, { status, headers: { \"content-type\": \"application/json\", \"x-request-id\": id } }); };",
  "  if (MODE === \"http500\") return send(JSON.stringify({ error: { type: \"server_error\", code: null, message: \"mock 500\" } }), 500, \"req_mock500\");",
  "  const b64 = readFileSync(MODE === \"outside\" ? PNG + \".outside.png\" : PNG).toString(\"base64\");",
  "  const data = MODE === \"two\" ? [{ b64_json: b64 }, { b64_json: readFileSync(PNG + \".outside.png\").toString(\"base64\") }] : MODE === \"zero\" ? [] : [{ b64_json: b64 }];",
  "  return send(JSON.stringify({ created: 1, data, usage: { total_tokens: 1 } }), 200, \"req_mockok\");",
  "};",
].join("\n");

const TRACKED = [ADAPTER_REL, D160_ADAPTER_REL, LEDGER_REL, CHECKER_REL, REGISTER_REL, CONTRACT_REL, GUIDE_REL, PROMPT_REL, D160_PROMPT_REL, NORTHSTAR_REL];
function outputPng({ outside }) {
  const w = 1024, h = 1536, px = Buffer.alloc(w * h * 4, 0);
  for (let y = 345; y < 365; y++) for (let x = 480; x < 530; x++) px.set([90, 60, 50, 255], (y * w + x) * 4);
  if (outside) px.set([90, 60, 50, 255], (10 * w + 10) * 4);
  return encodePngRGBA(w, h, px);
}
function envFor(sb, extra) {
  const env = {};
  for (const k of ["PATH", "Path", "SystemRoot", "windir", "COMSPEC", "PATHEXT", "SystemDrive"]) if (typeof process.env[k] === "string") env[k] = process.env[k];
  Object.assign(env, { LOCALAPPDATA: sb.state, XDG_STATE_HOME: sb.state, HOME: sb.home, USERPROFILE: sb.home, TEMP: sb.tmp, TMP: sb.tmp, TMPDIR: sb.tmp,
    HTTP_PROXY: "http://127.0.0.1:9", HTTPS_PROXY: "http://127.0.0.1:9", NO_PROXY: "", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: sb.gitconfig,
    D162_MOCK_LOG: sb.log, D162_MOCK_MODE: "ok", D162_MOCK_CLAIM: sb.claim, D162_MOCK_EVENTS: sb.events, D162_MOCK_PNG: sb.png, D162_MOCK_BODY: sb.body }, extra || {});
  return env;
}
function sgit(sb, args) {
  const r = spawnSync("git", ["-C", sb.repo, "-c", "user.name=d162-sandbox", "-c", "user.email=sandbox@example.invalid", "-c", "core.autocrlf=false", ...args], { env: envFor(sb), encoding: "utf8", windowsHide: true });
  if (r.status !== 0) throw new Error("sandbox git " + args.join(" ") + ": " + r.stderr);
  return r.stdout.trim();
}
const contractPath = (sb) => join(sb.repo, ...CONTRACT_REL.split("/"));
const registerPath = (sb) => join(sb.repo, ...REGISTER_REL.split("/"));
const editContract = (sb, fn) => { const c = JSON.parse(readFileSync(contractPath(sb), "utf8")); fn(c); writeFileSync(contractPath(sb), JSON.stringify(c, null, 2) + "\n"); };
const editEntry = (fn) => (sb) => editContract(sb, (c) => { const i = c.authorisedCalls.calls.findIndex((e) => e.callId === CALL); c.authorisedCalls.calls[i] = fn(structuredClone(c.authorisedCalls.calls[i])); });
const editImpl = (fn) => (sb) => editContract(sb, (c) => { const i = c.adapterImplementations.entries.findIndex((e) => e.decision === "D-162"); const x = fn(structuredClone(c.adapterImplementations.entries[i])); if (x) c.adapterImplementations.entries[i] = x; else c.adapterImplementations.entries.splice(i, 1); });
const toLive = (sb) => { copyFileSync(repoFile(CONTRACT_REL), contractPath(sb)); copyFileSync(repoFile(REGISTER_REL), registerPath(sb)); };

/** A fresh sandbox. Default: the LIVE committed state (D-162 active) as origin/main. `pre`: the state before D-162. */
function sandbox({ base, layout = "main", top, pre = false } = {}) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "d162-sandbox-")));
  SANDBOX_ROOTS.push(root);
  const sb = { root, repo: join(root, "repo"), state: join(root, "state"), tmp: join(root, "tmp"), home: join(root, "home"), log: join(root, "fetch.log"),
    gitconfig: join(root, "gitconfig"), png: join(root, "mock-output.png"), body: join(root, "mock-body.json"), mock: join(root, "mock.mjs") };
  const reg = join(sb.state, "DenSejeApp", "one-shot-claims", "Moeller888-den-seje-app-frontend");
  sb.claim = join(reg, CLAIM_FILE); sb.events = join(reg, EVENTS_FILE);
  for (const d of [sb.repo, sb.state, sb.tmp, sb.home]) mkdirSync(d, { recursive: true });
  writeFileSync(sb.gitconfig, "[core]\n\tautocrlf = false\n[init]\n\tdefaultBranch = main\n");
  writeFileSync(sb.mock, MOCK_SRC); writeFileSync(sb.log, "");
  writeFileSync(sb.png, outputPng({ outside: false })); writeFileSync(sb.png + ".outside.png", outputPng({ outside: true }));
  for (const rel of [...TRACKED, ".gitignore"]) { const dst = join(sb.repo, ...rel.split("/")); mkdirSync(dirname(dst), { recursive: true }); copyFileSync(repoFile(rel), dst); }
  if (pre) { writeFileSync(contractPath(sb), JSON.stringify(PRE, null, 2) + "\n"); writeFileSync(registerPath(sb), PRE_REGISTER); }
  if (base) base(sb);
  sgit(sb, ["init", "-q", "-b", "main"]); sgit(sb, ["add", "-A"]); sgit(sb, ["commit", "-q", "-m", "base"]); sgit(sb, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  if (layout === "worktree") top(sb);
  else if (layout === "branch" || layout === "detached") {
    if (layout === "branch") sgit(sb, ["checkout", "-q", "-b", "local-d162"]); else sgit(sb, ["checkout", "-q", "--detach"]);
    top(sb); sgit(sb, ["add", "-A"]); sgit(sb, ["commit", "-q", "-m", "D-162 not merged"]);
  }
  return sb;
}
function runFile(sb, rel, args, extra) {
  const r = spawnSync(process.execPath, ["--import", pathToFileURL(sb.mock).href, join(sb.repo, ...rel.split("/")), ...args], { cwd: sb.repo, env: envFor(sb, extra), encoding: "utf8", windowsHide: true, timeout: 120000 });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
const runAdapter = (sb, args, extra) => runFile(sb, ADAPTER_REL, args, extra);
const fetchLog = (sb) => readFileSync(sb.log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const outDir = (sb) => join(sb.repo, "tools", "avatar", "build", "r3-face-neutral-d162");
const outFile = (sb, n) => join(outDir(sb), "r3-face-neutral-d162." + n);
const KEY_ENV = { OPENAI_API_KEY: DUMMY_KEY };
const onDisk = (sb) => deriveAttempt({ claimPresent: existsSync(sb.claim), eventsText: existsSync(sb.events) ? readFileSync(sb.events, "utf8") : null, callId: CALL });
const manifest = (sb) => JSON.parse(readFileSync(outFile(sb, "request.json"), "utf8"));
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
test("THE LIVE D-162 STATE: the production adapter's dry run passes with the real tracked pins, writes nothing, reads no credential, sends nothing", () => {
  const sb = sandbox();
  const r = runAdapter(sb, GOOD_ARGS);
  assert.equal(r.status, 0, r.out); assert.match(r.out, /DRY RUN PASSED/);
  assert.match(r.out, /authorisation : exactly one active, unspent D-162-r3-face-neutral-guide-b-v1 entry and one D-162 implementation entry in origin\/main/);
  assert.equal(existsSync(sb.claim), false); assert.equal(existsSync(sb.events), false); assert.equal(fetchLog(sb).length, 0); assert.equal(existsSync(outDir(sb)), false);
});
test("BEFORE D-162 nothing could send: the reconstructed pre-D-162 state is refused before any claim", () => {
  const sb = sandbox({ pre: true });
  const r = runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV);
  assertRefusedBeforeClaim(sb, r, "register"); assert.match(r.out, /D-162 appears 0 times/);
});
test("an authorisation only in the working tree, on a local branch or on a detached HEAD is refused before the claim", () => {
  const wt = sandbox({ pre: true, layout: "worktree", top: toLive }); assertRefusedBeforeClaim(wt, runAdapter(wt, [...GOOD_ARGS, ...SEND], KEY_ENV), "blob-divergence");
  const br = sandbox({ pre: true, layout: "branch", top: toLive }); assertRefusedBeforeClaim(br, runAdapter(br, [...GOOD_ARGS, ...SEND], KEY_ENV), "branch");
  const dt = sandbox({ pre: true, layout: "detached", top: toLive }); assertRefusedBeforeClaim(dt, runAdapter(dt, [...GOOD_ARGS, ...SEND], KEY_ENV), "head-not-origin-main");
});
test("D-160 STAYS CLOSED: in the live D-162 state, the D-160 adapter is refused before any claim", () => {
  const sb = sandbox();
  const r = runFile(sb, D160_ADAPTER_REL, ["--call-id=D-160-r3-face-neutral-v1", "--claim-identity=D-160-r3-face-neutral-v1-claim", "--send", "--owner-approval=D-160", "--guide", join(sb.root, "x.png")], KEY_ENV);
  assert.equal(r.status, 1, r.out); assert.match(r.out, /REFUSED \[authorisation\]/); assert.match(r.out, /mandateState: "SPENT", expected "UNSPENT"/);
  assert.equal(fetchLog(sb).length, 0); assert.equal(readdirSync(sb.state).length, 0, "the D-160 adapter created nothing in the claim register");
});

for (const [label, args] of [
  ["a wrong call-id", ["--call-id=D-162-r3-face-neutral-guide-b-v2", "--claim-identity=" + CLAIM_ID, ...SEND]],
  ...SPENT_IDS.map((id) => ["the spent call-id " + id, ["--call-id=" + id, "--claim-identity=" + CLAIM_ID, ...SEND]]),
  ["D-160's spent claim identity", ["--call-id=" + CALL, "--claim-identity=D-160-r3-face-neutral-v1-claim", ...SEND]],
  ["a wrong claim identity", ["--call-id=" + CALL, "--claim-identity=D-162-other-claim", ...SEND]],
  ["--send without the approval", [...GOOD_ARGS, "--send"]],
  ["the approval without --send", [...GOOD_ARGS, APPROVAL]],
  ["D-160's approval", [...GOOD_ARGS, "--send", "--owner-approval=D-160"]],
  ["an external --guide", [...GOOD_ARGS, ...SEND, "--guide", "x.png"]],
  ["--retry", [...GOOD_ARGS, ...SEND, "--retry"]],
  ["--model", [...GOOD_ARGS, ...SEND, "--model=gpt-image-1"]],
  ["--mask", [...GOOD_ARGS, ...SEND, "--mask=x.png"]],
]) test("refused before the claim: " + label, () => { const sb = sandbox(); assertRefusedBeforeClaim(sb, runAdapter(sb, args, KEY_ENV), "arguments"); });

test("refused before the claim: an inactive, spent, closed, duplicated or second permission, or a bent preparation section", () => {
  for (const [label, base] of [
    ["mandate SPENT", editEntry((e) => ({ ...e, mandateState: "SPENT" }))],
    ["status PREPARED", editEntry((e) => ({ ...e, status: "PREPARED — NOT AUTHORISED" }))],
    ["already attempted", editEntry((e) => ({ ...e, outcome: "EXECUTED ONCE" }))],
    ["neverReuse", editEntry((e) => ({ ...e, neverReuse: true }))],
    ["closed", editEntry((e) => ({ ...e, closedBy: "D-163" }))],
    ["another decision", editEntry((e) => ({ ...e, decision: "D-163" }))],
    ["prepared by D-159", editEntry((e) => ({ ...e, preparedBy: "D-159" }))],
    ["no implementation entry", editImpl(() => null)],
    ["implementation executed", editImpl((x) => ({ ...x, adapter: { ...x.adapter, status: "IMPLEMENTED — EXECUTED ONCE — SPENT" } }))],
    ["implementation pins a hash", editImpl((x) => ({ ...x, adapter: { ...x.adapter, sha256: "0".repeat(64) } }))],
    ["D-160 reopened", (sb) => editContract(sb, (c) => { const d = c.authorisedCalls.calls.find((e) => e.decision === "D-160"); d.mandateState = "UNSPENT"; })],
    ["the general flag flipped", (sb) => editContract(sb, (c) => { c.meta.authorisesImageRequest = true; })],
    ["two entries for the call", (sb) => editContract(sb, (c) => { c.authorisedCalls.calls.push(structuredClone(c.authorisedCalls.calls.find((e) => e.callId === CALL))); })],
    ["preparation is an authorisation", (sb) => editContract(sb, (c) => { c.faceNeutralGuideBPreparation.isAuthorisation = true; })],
    ["preparation inputs swapped", (sb) => editContract(sb, (c) => { c.faceNeutralGuideBPreparation.preparedRequest.inputs.reverse(); })],
    ["preparation prompt changed", (sb) => editContract(sb, (c) => { c.faceNeutralGuideBPreparation.preparedRequest.prompt.sha256 = "0".repeat(64); })],
    ["D-159's section missing", (sb) => editContract(sb, (c) => { delete c.faceNeutralPreparation; })],
  ]) {
    const sb = sandbox({ base }); const r = runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV);
    assert.equal(r.status, 1, label + "\n" + r.out); assert.match(r.out, /REFUSED \[(authorisation|implementation)\]/, label + "\n" + r.out);
    assert.equal(existsSync(sb.claim), false, label); assert.equal(fetchLog(sb).length, 0, label);
  }
});

test("refused before the claim: any changed pin or input order in the authorisation entry", () => {
  for (const [label, fn] of [
    ["model", (e) => ({ ...e, model: "gpt-image-2-2026-04-21" })],
    ["background", (e) => ({ ...e, parameters: { ...e.parameters, background: "opaque" } })],
    ["n = 2", (e) => ({ ...e, parameters: { ...e.parameters, n: 2 } })],
    ["extra parameter", (e) => ({ ...e, parameters: { ...e.parameters, input_fidelity: "high" } })],
    ["inputs swapped", (e) => ({ ...e, inputs: [e.inputs[1], e.inputs[0]] })],
    ["input order swapped", (e) => ({ ...e, inputOrder: ["Image 2", "Image 1"] })],
    ["the old guide A′", (e) => ({ ...e, inputs: [{ ...e.inputs[0], sha256: "aed1745ecf5c82472774509546bdeeef7463dd7fad57a3a83933a5bcab613dcf" }, e.inputs[1]] })],
    ["the old prompt", (e) => ({ ...e, prompt: { ...e.prompt, sha256: "9c0b26496ce693dfe0d958fc34c60e68d3eddab98e48bb7b1f11af94e07d2413" } })],
    ["a mask in the field order", (e) => ({ ...e, fieldOrder: [...e.fieldOrder, "mask"] })],
    ["claim identity", (e) => ({ ...e, claim: { ...e.claim, identity: "D-160-r3-face-neutral-v1-claim" } })],
    ["adapter file", (e) => ({ ...e, adapter: { file: D160_ADAPTER_REL } })],
    ["two outputs", (e) => ({ ...e, outputs: { ...e.outputs, count: 2 } })],
    ["counted as underlay", (e) => ({ ...e, accounting: { slot: "underlay" } })],
  ]) {
    const sb = sandbox({ base: editEntry(fn) }); const r = runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV);
    assert.equal(r.status, 1, label); assert.match(r.out, /REFUSED \[authorisation\]/, label + "\n" + r.out);
    assert.equal(existsSync(sb.claim), false, label); assert.equal(fetchLog(sb).length, 0, label);
  }
});

test("refused before the claim: changed guide, prompt or North Star bytes committed to origin/main — only the pinned bytes are sent", () => {
  for (const [rel, mutate] of [[GUIDE_REL, (b) => { b[b.length - 20] ^= 0xff; return b; }], [PROMPT_REL, (b) => Buffer.from(b.toString("utf8").replace("eyebrow", "eyebrows"), "utf8")], [NORTHSTAR_REL, (b) => { b[b.length - 20] ^= 0xff; return b; }]]) {
    const sb = sandbox({ base: (s) => { const p = join(s.repo, ...rel.split("/")); writeFileSync(p, mutate(readFileSync(p))); } });
    assertRefusedBeforeClaim(sb, runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV), "pins");
  }
});
test("refused before the claim: a register row that is missing or doubled", () => {
  const none = sandbox({ base: (s) => writeFileSync(registerPath(s), readFileSync(registerPath(s), "utf8").split("\n").filter((l) => !l.startsWith("| **D-162** |")).join("\n")) });
  assertRefusedBeforeClaim(none, runAdapter(none, [...GOOD_ARGS, ...SEND], KEY_ENV), "register");
  const twice = sandbox({ base: (s) => writeFileSync(registerPath(s), readFileSync(registerPath(s), "utf8") + "\n" + ROW + "\n") });
  assertRefusedBeforeClaim(twice, runAdapter(twice, [...GOOD_ARGS, ...SEND], KEY_ENV), "register");
});
test("refused before the claim: a local edit of the adapter, the ledger, the checker or guide B in the working tree", () => {
  for (const rel of [ADAPTER_REL, LEDGER_REL, CHECKER_REL, GUIDE_REL]) {
    const sb = sandbox(); const p = join(sb.repo, ...rel.split("/"));
    writeFileSync(p, rel.endsWith(".png") ? Buffer.concat([readFileSync(p), Buffer.from([0])]) : readFileSync(p, "utf8") + "\n// local edit\n");
    assertRefusedBeforeClaim(sb, runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV), "blob-divergence");
  }
});
test("refused before the claim: an existing claim or event log, never touched; existing outputs", () => {
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
test("a normal response — claim, dispatch record, ONE fetch of exactly the pinned bytes; everything stored; no candidate; no retry", () => {
  const sb = sandbox();
  const r = runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV);
  assert.equal(r.status, 0, r.out);
  const log = fetchLog(sb); assert.equal(log.length, 1); const L = log[0];
  assert.equal(L.claimExistedAtCall, true);
  assert.deepEqual(parseEvents(L.eventsAtCall, CALL).records.map((x) => x.event), ["dispatch"]);
  assert.deepEqual([L.url, L.method, L.redirect, L.dummyKey], ["https://api.openai.com/v1/images/edits", "POST", "error", true]);
  assert.deepEqual(L.fields, ["model", "image[]", "image[]", "prompt", "size", "quality", "n", "output_format", "background"]);
  assert.deepEqual(L.images, ["guide-b-v1.png", "Northstar Master v2.png"]);
  assert.deepEqual(L.imageSha, [GUIDE_SHA, NORTHSTAR_SHA], "the ordered inputs are exactly the tracked, pinned bytes");
  assert.equal(L.prompt, readFileSync(repoFile(PROMPT_REL), "utf8"));
  assert.deepEqual([L.background, L.hasMask, L.hasInputFidelity], ["transparent", false, false]);
  const m = manifest(sb);
  assert.deepEqual([m.outcome.classification, m.outcome.fetches, m.outcome.automaticRetry, m.outcome.candidateWritten], ["PASS_TO_VISUAL_REVIEW", 1, false, false]);
  assert.deepEqual([m.accounting.claimState, m.accounting.dispatch, m.accounting.result, m.accounting.actuallySent, m.accounting.serverAnswered], ["consumed", "started", "response", 1, true]);
  assert.equal(m.request.inputs[0].source, "origin/main blob " + GUIDE_REL);
  assert.equal(sha256(readFileSync(outFile(sb, "response.json"))), sha256(readFileSync(sb.body)));
  assert.equal(sha256(readFileSync(outFile(sb, "image-1.png"))), sha256(readFileSync(sb.png)));
  assert.deepEqual(readdirSync(outDir(sb)).sort(), ["r3-face-neutral-d162.check.json", "r3-face-neutral-d162.image-1.png", "r3-face-neutral-d162.request.json", "r3-face-neutral-d162.response.json"]);
  assert.ok(!allSandboxText(sb).includes(DUMMY_KEY.slice(3)) && !r.out.includes(DUMMY_KEY.slice(3)), "the key appears nowhere");
  const again = runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV);
  assert.equal(again.status, 1); assert.match(again.out, /REFUSED \[claim-exists\]/); assert.equal(fetchLog(sb).length, 1);
});
test("HTTP error, transport error and a crash inside the network call — sent, no retry, the result never downgrades the dispatch", () => {
  for (const [mode, code, cls, result, answered] of [["http500", 3, "HTTP_ERROR", "http-error", true], ["throw", 3, "DISPATCHED_RESULT_UNKNOWN", "unknown", false], ["die-in-fetch", 137, null, "unknown", false]]) {
    const sb = sandbox(); const r = runAdapter(sb, [...GOOD_ARGS, ...SEND], { ...KEY_ENV, D162_MOCK_MODE: mode });
    assert.equal(r.status, code, mode + "\n" + r.out);
    const d = onDisk(sb); assert.deepEqual([d.dispatch, d.result, d.actuallySent, d.serverAnswered], ["started", result, 1, answered], mode);
    if (cls) assert.equal(manifest(sb).outcome.classification, cls);
    assert.equal(runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV).status, 1, "no retry after " + mode); assert.equal(fetchLog(sb).length, 1);
  }
});
test("crash windows before the network: claim → dispatch undetermined; dispatch record fails or is torn → documented stop; nothing fetched", () => {
  const a = sandbox(); assert.equal(runAdapter(a, [...GOOD_ARGS, ...SEND], { ...KEY_ENV, D162_MOCK_MODE: "die-at-dispatch" }).status, 137);
  assert.deepEqual([onDisk(a).dispatch, onDisk(a).dispatchUndetermined, fetchLog(a).length], ["undetermined", 1, 0]);
  assert.equal(runAdapter(a, [...GOOD_ARGS, ...SEND], KEY_ENV).status, 1, "no retry");
  for (const mode of ["fail-dispatch", "torn-dispatch"]) {
    const sb = sandbox(); assert.equal(runAdapter(sb, [...GOOD_ARGS, ...SEND], { ...KEY_ENV, D162_MOCK_MODE: mode }).status, 3, mode);
    const m = manifest(sb); assert.deepEqual([m.outcome.classification, m.accounting.dispatch, m.accounting.actuallySent, fetchLog(sb).length], ["NOT_DISPATCHED", "not-started", 0, 0], mode);
    assert.deepEqual(parseEvents(readFileSync(sb.events, "utf8"), CALL).records.map((x) => x.event), ["stop"], mode);
  }
});
test("an unexpected image count is kept whole without selection; a technical reject writes no candidate", () => {
  const two = sandbox(); assert.equal(runAdapter(two, [...GOOD_ARGS, ...SEND], { ...KEY_ENV, D162_MOCK_MODE: "two" }).status, 0);
  const m2 = manifest(two); assert.deepEqual([m2.outcome.classification, m2.images.count, m2.check], ["UNEXPECTED", 2, null]);
  assert.ok(existsSync(outFile(two, "image-1.png")) && existsSync(outFile(two, "image-2.png")) && !existsSync(outFile(two, "check.json")));
  const zero = sandbox(); assert.equal(runAdapter(zero, [...GOOD_ARGS, ...SEND], { ...KEY_ENV, D162_MOCK_MODE: "zero" }).status, 0);
  assert.equal(manifest(zero).outcome.classification, "UNEXPECTED");
  const out = sandbox(); assert.equal(runAdapter(out, [...GOOD_ARGS, ...SEND], { ...KEY_ENV, D162_MOCK_MODE: "outside" }).status, 0);
  const mo = manifest(out); assert.deepEqual([mo.outcome.classification, mo.check.firstFailure, mo.outcome.candidateWritten], ["TECHNICAL_REJECT", "AUTO-5", false]);
  assert.ok(!readdirSync(outDir(out)).some((n) => /candidate/i.test(n)));
});
test("two simultaneous processes cannot send two requests", async () => {
  const sb = sandbox();
  const one = () => new Promise((res) => { const c = spawn(process.execPath, ["--import", pathToFileURL(sb.mock).href, join(sb.repo, ...ADAPTER_REL.split("/")), ...GOOD_ARGS, ...SEND],
    { cwd: sb.repo, env: envFor(sb, { ...KEY_ENV, D162_MOCK_MODE: "slow" }), windowsHide: true }); let out = ""; c.stdout.on("data", (d) => { out += d; }); c.stderr.on("data", (d) => { out += d; }); c.on("close", (code) => res({ code, out })); });
  const [a, b] = await Promise.all([one(), one()]);
  assert.equal(fetchLog(sb).length, 1); assert.deepEqual([a.code, b.code].sort(), [0, 1], a.out + "\n----\n" + b.out);
});
