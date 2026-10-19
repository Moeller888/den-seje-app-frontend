// R3 face-neutral PARTS SHEET — D-165: the one authorised attempt and its separate send adapter, tested without ever
// reaching the real world. Derived from the D-162 suite; the lessons of D-142 and D-145 apply unchanged:
//   · The send adapter is NEVER imported. This file reads its source as text, or runs it as a CLI in a child process
//     inside a TEMPORARY git repository that this file builds per scenario, with its own origin/main.
//   · Every child gets an environment built from an explicit ALLOWLIST: no inherited key, no real LOCALAPPDATA or
//     XDG_STATE_HOME, and TEMP/TMP/TMPDIR inside the sandbox. The key is a dummy literal.
//   · globalThis.fetch (and, for the crash windows, node:fs) is replaced from OUTSIDE by `node --import <mock>`. The
//     mock refuses to load unconfigured, never delegates to a real fetch, and logs one line per call.
//   · No test reads, lists or checks the real claim register, a real key or the real build area.
// The prompt and North Star are TRACKED and not private, so every scenario runs the PRODUCTION adapter with the REAL pins.
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
import { encodePng, LAYOUT } from "../../tools/avatar/r3-face-parts-tool.mjs";
import { mainSheet, buildSheet, renderCell, ellipseF, COL } from "./avatar-r3-face-parts-synthetic.mjs";
import { preD165Contract, PRE_D165_CONTRACT_CANONICAL_SHA256, preD164Contract, PRE_D164_CONTRACT_CANONICAL_SHA256, preD166Contract, PRE_D166_CONTRACT_CANONICAL_SHA256 } from "./avatar-r3-d147-closure.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const repoFile = (rel) => join(REPO, ...rel.split("/"));
const ADAPTER_REL = "tools/avatar/openai-send-r3-face-parts-d165.mjs";
const D162_ADAPTER_REL = "tools/avatar/openai-send-r3-face-neutral-d162.mjs";
const LEDGER_REL = "tools/avatar/r3-face-neutral-attempt-ledger.mjs";
const PARTS_TOOL_REL = "tools/avatar/r3-face-parts-tool.mjs";
const CONTRACT_REL = "tools/avatar/fixtures/r3/r3-shadow-contract-v1.json";
const REGISTER_REL = "docs/project-state.md";
const PROMPT_REL = "tools/avatar/fixtures/r3-face-parts/prompt-parts-sheet-v1.txt";
const NORTHSTAR_REL = "assets/avatar/reference/Northstar Master v2.png";
const SRC = readFileSync(repoFile(ADAPTER_REL), "utf8");
const CODE = SRC.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
const LIVE_NOW = JSON.parse(readFileSync(repoFile(CONTRACT_REL), "utf8"));
// D-166 later recorded D-165's one send and closed its entry in place. LIVE is the contract exactly as D-165 committed
// it (D-166's closure reversed, proven canonical below); the closed state itself is tested at the end of this file.
const LIVE = preD166Contract(LIVE_NOW);
const REGISTER = readFileSync(repoFile(REGISTER_REL), "utf8");
const PRE = preD165Contract(LIVE);
const PRE_REGISTER = REGISTER.split("\n").filter((l) => !l.startsWith("| **D-165** |")).join("\n");
const CALL = "D-165-r3-face-parts-sheet-v1";
const CLAIM_ID = CALL + "-claim";
const CLAIM_FILE = CALL + ".claim.json";
const EVENTS_FILE = CALL + ".events.jsonl";
const DUMMY_KEY = "sk-d165-sandbox-dummy-key-not-a-credential";
const APPROVAL = "--owner-approval=D-165";
const GOOD_ARGS = ["--call-id=" + CALL, "--claim-identity=" + CLAIM_ID];
const SEND = ["--send", APPROVAL];
const PROMPT_SHA = "85b8500fbaca1a8ce87c3b3296818f1b3e8fd89719e97fc96a3cd9c33735c61c";
const NORTHSTAR_SHA = "3daf32e76bff9a53ec7d25cf148a230073cfd0da6a003d02a23c4292d139ff50";
const MODEL = "gpt-image-2.5-sunburst-2026-09-08";
const D164_ROW_SHA = "d38d06a729bb19ea7359a9ce9e63d7741599c20fb05fdaca4a419d645a307387";
const SPENT_IDS = ["D-139-r3-underlay-head-only-v1", "D-142-r3-underlay-core-v1", "D-143-r3-underlay-core-v2", "D-151-r3-head-colour-u1-v1",
  "D-153-r3-head-colour-u1-opaque-v1", "D-160-r3-face-neutral-v1", "D-162-r3-face-neutral-guide-b-v1"];
const E = LIVE.authorisedCalls.calls.find((e) => e.callId === CALL);
const IMPL = LIVE.adapterImplementations.entries.find((e) => e.decision === "D-165");
const ROW = REGISTER.split("\n").find((l) => l.startsWith("| **D-165** |"));

function isInside(child, parent) {
  if (typeof child !== "string" || typeof parent !== "string" || child === "" || parent === "") return false;
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

// ── the decision itself ───────────────────────────────────────────────────────────────────────────────────────
test("D-165 adds exactly one authorisation and the capacity for it: the contract at the D-164 merge is reproduced canonically", () => {
  assert.equal(sha256(JSON.stringify(PRE)), PRE_D165_CONTRACT_CANONICAL_SHA256);
  assert.equal(sha256(JSON.stringify(preD164Contract(LIVE))), PRE_D164_CONTRACT_CANONICAL_SHA256, "and the older chain still holds");
  assert.deepEqual([PRE.authorisedCalls.count, LIVE.authorisedCalls.count, LIVE.authorisedCalls.calls.length], [7, 8, 8]);
  assert.deepEqual(LIVE.authorisedCalls.calls.slice(0, 7), PRE.authorisedCalls.calls, "the seven earlier entries are unchanged");
  assert.deepEqual(LIVE.adapterImplementations.entries.slice(0, 3), PRE.adapterImplementations.entries, "the earlier implementations are unchanged");
  assert.deepEqual([PRE.assets[4].calls, LIVE.assets[4].calls, LIVE.assets[4].name], [2, 3, "r3-face-neutral"], "the planned face capacity moves 2 -> 3");
  const b = LIVE.imageCallBudget;
  assert.deepEqual([b.minimum, b.maximum, b.callsPlannedAndAuthorised.derivedBudget, b.callsPlannedAndAuthorised.faceNeutral], [21, 22, "21-22", 3]);
  let min = 0, max = 0; for (const a of LIVE.assets) { if (typeof a.calls === "number") { min += a.calls; max += a.calls; } else { const m = /^(\d+)-(\d+)$/.exec(a.calls); min += +m[1]; max += +m[2]; } }
  assert.deepEqual([min, max], [21, 22], "the budget is derived arithmetically");
  assert.deepEqual(b.callsActuallySentSoFar, PRE.imageCallBudget.callsActuallySentSoFar, "actually sent is unchanged");
  assert.deepEqual([b.callsActuallySentSoFar.faceNeutral, b.callsActuallySentSoFar.underlay], [2, 5]);
  for (let i = 0; i < LIVE.assets.length; i++) if (i !== 4) assert.deepEqual(LIVE.assets[i], PRE.assets[i], "asset " + i + " is unchanged");
  for (const k of ["faceNeutralPartsMethod", "faceNeutralPreparation", "faceNeutralGuideBPreparation", "deterministicOperations", "layerContract", "zModel"]) assert.deepEqual(LIVE[k], PRE[k], k + " is unchanged");
  assert.equal(LIVE.meta.authorisesImageRequest, false);
  assert.equal(LIVE.architecture.defaultEnabled, false, "R3 stays default OFF");
  assert.ok(!/AVATAR_R3\s*=\s*true/.test(readFileSync(repoFile("js/avatar-layers.js"), "utf8")), "R3 stays OFF at runtime");
});

test("D-165's entry is the ONLY live permission: one image, the frozen D-164 prompt, 1024x1024, RAW-1..5, merge is not a run instruction", () => {
  assert.deepEqual(LIVE.authorisedCalls.calls.filter((e) => e.mandateState === "UNSPENT").map((e) => e.callId), [CALL]);
  for (const id of SPENT_IDS.slice(5)) { const x = LIVE.authorisedCalls.calls.find((e) => e.callId === id); assert.deepEqual([x.mandateState, x.neverReuse], ["SPENT", true], id); }
  assert.deepEqual([E.decision, E.preparedBy, E.status, E.mandateState, E.outcome], ["D-165", "D-164", "AUTHORISED — ONE CALL — NOT YET ATTEMPTED", "UNSPENT", "NOT YET ATTEMPTED"]);
  for (const k of ["neverReuse", "notAnActivePermission", "closedBy", "closure", "execution"]) assert.ok(!(k in E), "no " + k);
  assert.deepEqual([E.claim.identity, E.claim.filename, E.claim.eventsFilename, E.adapter.file], [CLAIM_ID, CLAIM_FILE, EVENTS_FILE, ADAPTER_REL]);
  assert.deepEqual([E.runInstruction.mergeIsNotAnInstruction, E.runInstruction.requiresSeparateExplicitOwnerInstruction], [true, true]);
  assert.deepEqual([E.model, E.endpoint, E.operation], [MODEL, "https://api.openai.com/v1/images/edits", "images.edits"]);
  assert.deepEqual(E.parameters, { size: "1024x1024", quality: "high", n: 1, output_format: "png", background: "transparent" });
  const d162 = LIVE.authorisedCalls.calls.find((e) => e.decision === "D-162");
  for (const k of ["quality", "n", "output_format", "background"]) assert.equal(E.parameters[k], d162.parameters[k], "the established " + k + " is reused");
  assert.deepEqual([E.model, E.endpoint], [d162.model, d162.endpoint], "the established model and endpoint are reused");
  assert.deepEqual(E.fieldOrder, ["model", "image[]", "prompt", "size", "quality", "n", "output_format", "background"]);
  assert.deepEqual(E.neverSentFields, ["mask", "input_fidelity", "output_compression", "response_format", "moderation"]);
  assert.deepEqual(E.inputs.map((i) => [i.order, i.repoPath, i.sha256, i.tracked]), [[1, NORTHSTAR_REL, NORTHSTAR_SHA, true]], "North Star is the only image");
  assert.deepEqual([E.prompt.file, E.prompt.sha256, E.prompt.bytes], [PROMPT_REL, PROMPT_SHA, 2413]);
  assert.deepEqual([E.prompt.file, E.prompt.sha256, E.prompt.bytes], [LIVE.faceNeutralPartsMethod.prompt.file, LIVE.faceNeutralPartsMethod.prompt.sha256, LIVE.faceNeutralPartsMethod.prompt.bytes], "D-164's frozen prompt, adopted unchanged");
  assert.match(E.prohibitions.noRetry, /Exactly one fetch/);
  assert.match(E.prohibitions.noPixelReuse, /D-160 and D-162 images are never production parts/);
  assert.match(E.accounting.slot, /never an underlay call/);
  assert.match(E.outputHandling.technicalChecks, /RAW-1\.\.5/);
  assert.match(E.outputHandling.technicalChecks, /face envelope and AUTO-1\.\.5 are NOT applied to the sheet/);
  assert.match(E.outputHandling.passMeaning, /does not approve its appearance/);
  assert.match(E.outputHandling.annotation, /DRAFT, bound to the exact raw sheet's SHA-256/);
  assert.match(E.outputHandling.annotation, /Nothing sets APPROVED automatically/);
  assert.match(E.outputHandling.composition, /AUTO-1\.\.5 including the broad envelope/);
  assert.match(E.outputHandling.review[0], /never a stump/);
  assert.deepEqual([IMPL.adapter.file, IMPL.adapter.status, IMPL.adapter.ownerApprovalFlag, IMPL.mandateState, IMPL.mergeIsNotAnInstruction, IMPL.executionRequiresSeparateOwnerInstruction],
    [ADAPTER_REL, "IMPLEMENTED — NOT EXECUTED", APPROVAL, "UNSPENT", true, true]);
  assert.ok(!Object.keys(IMPL.adapter).some((k) => /sha-?256/i.test(k)), "no adapter hash pinned (D-145)");
  assert.match(LIVE.prohibitions.noImageRequestAuthorised, /holds EIGHT entries/);
  assert.match(LIVE.prohibitions.noImageRequestAuthorised, /\(8\) D-165-r3-face-parts-sheet-v1 — THE ONLY active send permission/);
  assert.match(LIVE.prohibitions.noImageRequestAuthorised, /\(7\) D-162-r3-face-neutral-guide-b-v1 — NO LONGER a permission/);
});

test("the D-165 register row: once, directly after D-164, D-164 verbatim, every pin named, no mojibake", () => {
  const lines = REGISTER.split("\n");
  assert.equal(lines.filter((l) => l.startsWith("| **D-165** |")).length, 1);
  assert.equal(lines.findIndex((l) => l.startsWith("| **D-165** |")), lines.findIndex((l) => l.startsWith("| **D-164** |")) + 1);
  assert.equal(sha256(lines.find((l) => l.startsWith("| **D-164** |"))), D164_ROW_SHA, "D-164 is not rewritten");
  for (const needle of [CALL, CLAIM_ID, CLAIM_FILE, EVENTS_FILE, MODEL, ADAPTER_REL, APPROVAL, NORTHSTAR_SHA, PROMPT_SHA, PROMPT_REL, "1024x1024",
    "`AUTHORISED — ONE CALL — NOT YET ATTEMPTED`", "IKKE EN KØRSELSINSTRUKS", "RAW-1..5", "ingen retry", "stump", "DRAFT",
    "`faceNeutral` = 2", "`underlay` = 5", "fra 2 til 3", "R3 forbliver default OFF"]) assert.ok(ROW.includes(needle), "the D-165 row carries " + JSON.stringify(needle));
  assert.ok(!/[ÃÂ]\S|\uFFFD/.test(ROW), "no mojibake in the Danish row");
});

test("the frozen prompt is the D-164 bytes: UTF-8, LF only, one trailing LF; it demands full brows and the reference orientation", () => {
  const p = readFileSync(repoFile(PROMPT_REL)), t = p.toString("utf8");
  assert.deepEqual([sha256(p), p.length], [PROMPT_SHA, 2413]);
  assert.ok(Buffer.from(t, "utf8").equals(p) && !t.includes("\r") && t.endsWith("\n") && !t.endsWith("\n\n"));
  for (const s of ["1024 x 1024 pixels", "fully transparent background", "INVISIBLE quadrants", "Both eyebrows are COMPLETE", "never shape it around hair",
    "the mouth line is TILTED", "Draw ONLY these four features"]) assert.ok(t.includes(s), "the prompt says " + JSON.stringify(s));
});

// ── static: the adapter's shape ─────────────────────────────────────────────────────────────────────────────────
test("the D-162 adapter is unchanged; the D-165 adapter exports nothing and imports only node built-ins, the ledger and the parts tool", () => {
  assert.equal(sha256(readFileSync(repoFile(D162_ADAPTER_REL))), "f6ead6853341392f4d6e244aa5e41d3c11cd20929660ae01914218d3a50b6f4e", "the D-162 adapter is byte-identical to what ran");
  assert.ok(!/^\s*export\b/m.test(CODE));
  const imports = [...CODE.matchAll(/^\s*import\b[^;]*?from\s+"([^"]+)"/gm)].map((m) => m[1]);
  for (const s of imports) assert.ok(s.startsWith("node:") || ["./r3-face-neutral-attempt-ledger.mjs", "./r3-face-parts-tool.mjs"].includes(s), "unexpected import " + s);
  assert.ok(!/\bimport\s*\(/.test(CODE) && !/\brequire\s*\(/.test(CODE));
  assert.ok(!CODE.includes("check-r3-face-neutral-output") && !CODE.includes("checkFaceNeutralOutput"), "the master-canvas checker is never applied to the sheet");
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
  for (const flag of ["--claim-path", "--force", "--retry", "--reset", "--out", "--ref", "--contract", "--register", "--model", "--mask", "--pin", "--sha", "--size"]) assert.ok(!CODE.includes("\"" + flag), "no CLI flag " + flag);
  const envUses = [...CODE.matchAll(/process\.env(\.[A-Za-z_][A-Za-z0-9_]*|\[[^\]]*\]|\))?/g)].map((m) => m[0]);
  for (const u of envUses) assert.ok(new Set(["process.env.OPENAI_API" + "_KEY", "process.env.LOCALAPPDATA", "process.env.XDG_STATE_HOME", "process.env)"]).has(u), "unexpected environment read " + u);
  assert.equal([...CODE.matchAll(/process\.env\.OPENAI_API_KEY/g)].length, 1);
  const body = CODE.slice(CODE.indexOf("async function main(argv)"));
  let last = -1;
  for (const k of ["parseArgs(argv)", "resolveRefs()", "readOriginBlobs(refs.originSha)", "verifyPins(blobs)", "verifyRegister(blobs.register)", "verifyAuthorisation(parsed.contract)",
    "verifyImplementation(parsed.contract)", "resolveClaimLocation()", "pathExists(loc.claim)", "pathExists(loc.events)", "occupiedOutputs()", "buildBody(blobs, pins.prompt)",
    "if (!args.sendMode)", "const again = resolveRefs()", "process.env.OPENAI_API" + "_KEY", "claim = createClaim(", "event(\"dispatch\"", "res = await globalThis.fetch(", "checkRawSheet(imgBuf)"]) { const i = body.indexOf(k); assert.ok(i > last, k + " in order"); last = i; }
  for (const del of ["unlinkSync", "rmSync", "rmdirSync", "truncateSync", "copyFileSync"]) assert.ok(!CODE.includes(del), "must not contain " + del);
  assert.ok(!/candidate\.png|\.candidate\./.test(CODE), "no candidate file");
  assert.match(CODE, /const OUT_DIR = "tools\/avatar\/build\/r3-face-parts-d165";/);
  for (const id of SPENT_IDS) assert.ok(SRC.includes(id), "lists " + id + " as never-reuse");
  for (const v of [CALL, CLAIM_ID, CLAIM_FILE, EVENTS_FILE, APPROVAL, ADAPTER_REL, PROMPT_REL, PROMPT_SHA, NORTHSTAR_SHA, MODEL]) assert.ok(SRC.includes(v), "the adapter carries " + v);
  assert.match(SRC, /const REQUIRED_DECISIONS = Object\.freeze\(\["D-142", "D-159", "D-163", "D-164", "D-165"\]\);/);
  assert.match(SRC, /const PARAMETERS = Object\.freeze\(\{ size: "1024x1024", quality: "high", n: 1, output_format: "png", background: "transparent" \}\);/);
});

// ── sandbox: a temporary git repository per scenario ─────────────────────────────────────────────────────────────
const SANDBOX_ROOTS = [];
after(() => { for (const root of SANDBOX_ROOTS) if (isInside(root, realpathSync.native(tmpdir())) && /d165-sandbox-/.test(root)) rmSync(root, { recursive: true, force: true }); });

const MOCK_SRC = [
  "// D-165 test mock: replaces globalThis.fetch (and, for the crash windows, node:fs) for one child process. Refuses to load unconfigured.",
  "import fs, { appendFileSync, existsSync, readFileSync, writeFileSync } from \"node:fs\";",
  "import { syncBuiltinESMExports } from \"node:module\";",
  "import { resolve } from \"node:path\";",
  "const LOG = process.env.D165_MOCK_LOG, MODE = process.env.D165_MOCK_MODE, CLAIM = process.env.D165_MOCK_CLAIM, EVENTS = process.env.D165_MOCK_EVENTS,",
  "  PNG = process.env.D165_MOCK_PNG, BODY = process.env.D165_MOCK_BODY;",
  "if (!LOG || !MODE || !CLAIM || !EVENTS || !PNG || !BODY) throw new Error(\"d165 mock: not configured — refusing to run\");",
  "const KEY = \"sk-d165-sandbox-dummy-key-not-a-credential\";",
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
  "globalThis.fetch = async function d165MockFetch(url, init) {",
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
  "  const b64 = MODE === \"cut\" ? pick(\".cut.png\") : MODE === \"master\" ? pick(\".master.png\") : MODE === \"empty-cell\" ? pick(\".empty.png\") : pick(\"\");",
  "  const data = MODE === \"two\" ? [{ b64_json: b64 }, { b64_json: pick(\".cut.png\") }] : MODE === \"zero\" ? [] : [{ b64_json: b64 }];",
  "  return send(JSON.stringify({ created: 1, data, usage: { total_tokens: 1 } }), 200, \"req_mockok\");",
  "};",
].join("\n");

// The D-162 adapter's own inputs are copied too, so its refusal of the closed mandate is a real authorisation refusal.
const D162_INPUTS = ["tools/avatar/check-r3-face-neutral-output.mjs", "tools/avatar/fixtures/r3-face-neutral/guide-b-v1.png", "tools/avatar/fixtures/r3-face-neutral/prompt-guide-b-v1.txt"];
const TRACKED = [ADAPTER_REL, D162_ADAPTER_REL, LEDGER_REL, PARTS_TOOL_REL, REGISTER_REL, CONTRACT_REL, PROMPT_REL, NORTHSTAR_REL, ...D162_INPUTS];
const SHEET = mainSheet({ tiltMouth: true });   // a synthetic technical parts sheet that passes RAW-1..5
const cells = Object.fromEntries(LAYOUT.order.map((p) => [p, null]));
function sheetPngs() {
  const cut = buildSheet({ browLeft: renderCell([{ value: ellipseF(480, 250, 70, 30), rgb: COL.browLeft }]), browRight: renderCell([{ value: ellipseF(256, 256, 90, 30), rgb: COL.browRight }]),
    nose: renderCell([{ value: ellipseF(256, 256, 30, 50), rgb: COL.nose }]), mouth: renderCell([{ value: ellipseF(256, 256, 100, 15), rgb: COL.mouth }]) });
  const empty = buildSheet({ browLeft: renderCell([{ value: ellipseF(256, 256, 90, 30), rgb: COL.browLeft }]), browRight: renderCell([{ value: ellipseF(256, 256, 90, 30), rgb: COL.browRight }]),
    nose: renderCell([{ value: ellipseF(256, 256, 30, 50), rgb: COL.nose }]) });
  const master = new Uint8ClampedArray(1024 * 1536 * 4); for (let y = 345; y < 365; y++) for (let x = 480; x < 530; x++) master.set([90, 60, 50, 255], (y * 1024 + x) * 4);
  return { ok: SHEET.png, cut: encodePng(1024, 1024, cut), empty: encodePng(1024, 1024, empty), master: encodePng(1024, 1536, master) };
}
const PNGS = sheetPngs(); void cells;
function envFor(sb, extra) {
  const env = {};
  for (const k of ["PATH", "Path", "SystemRoot", "windir", "COMSPEC", "PATHEXT", "SystemDrive"]) if (typeof process.env[k] === "string") env[k] = process.env[k];
  Object.assign(env, { LOCALAPPDATA: sb.state, XDG_STATE_HOME: sb.state, HOME: sb.home, USERPROFILE: sb.home, TEMP: sb.tmp, TMP: sb.tmp, TMPDIR: sb.tmp,
    HTTP_PROXY: "http://127.0.0.1:9", HTTPS_PROXY: "http://127.0.0.1:9", NO_PROXY: "", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: sb.gitconfig,
    D165_MOCK_LOG: sb.log, D165_MOCK_MODE: "ok", D165_MOCK_CLAIM: sb.claim, D165_MOCK_EVENTS: sb.events, D165_MOCK_PNG: sb.png, D165_MOCK_BODY: sb.body }, extra || {});
  return env;
}
function sgit(sb, args) {
  const r = spawnSync("git", ["-C", sb.repo, "-c", "user.name=d165-sandbox", "-c", "user.email=sandbox@example.invalid", "-c", "core.autocrlf=false", ...args], { env: envFor(sb), encoding: "utf8", windowsHide: true });
  if (r.status !== 0) throw new Error("sandbox git " + args.join(" ") + ": " + r.stderr);
  return r.stdout.trim();
}
const contractPath = (sb) => join(sb.repo, ...CONTRACT_REL.split("/"));
const registerPath = (sb) => join(sb.repo, ...REGISTER_REL.split("/"));
const editContract = (sb, fn) => { const c = JSON.parse(readFileSync(contractPath(sb), "utf8")); fn(c); writeFileSync(contractPath(sb), JSON.stringify(c, null, 2) + "\n"); };
const editEntry = (fn) => (sb) => editContract(sb, (c) => { const i = c.authorisedCalls.calls.findIndex((e) => e.callId === CALL); c.authorisedCalls.calls[i] = fn(structuredClone(c.authorisedCalls.calls[i])); });
const editImpl = (fn) => (sb) => editContract(sb, (c) => { const i = c.adapterImplementations.entries.findIndex((e) => e.decision === "D-165"); const x = fn(structuredClone(c.adapterImplementations.entries[i])); if (x) c.adapterImplementations.entries[i] = x; else c.adapterImplementations.entries.splice(i, 1); });
const toLive = (sb) => { writeFileSync(contractPath(sb), JSON.stringify(LIVE, null, 2) + "\n"); copyFileSync(repoFile(REGISTER_REL), registerPath(sb)); };

/** A fresh sandbox. Default: the state D-165 committed (D-165 active) as origin/main. `pre`: before D-165. `closed`: since D-166. */
function sandbox({ base, layout = "main", top, pre = false, closed = false } = {}) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "d165-sandbox-")));
  SANDBOX_ROOTS.push(root);
  const sb = { root, repo: join(root, "repo"), state: join(root, "state"), tmp: join(root, "tmp"), home: join(root, "home"), log: join(root, "fetch.log"),
    gitconfig: join(root, "gitconfig"), png: join(root, "mock-output.png"), body: join(root, "mock-body.json"), mock: join(root, "mock.mjs") };
  const reg = join(sb.state, "DenSejeApp", "one-shot-claims", "Moeller888-den-seje-app-frontend");
  sb.claim = join(reg, CLAIM_FILE); sb.events = join(reg, EVENTS_FILE);
  for (const d of [sb.repo, sb.state, sb.tmp, sb.home]) mkdirSync(d, { recursive: true });
  writeFileSync(sb.gitconfig, "[core]\n\tautocrlf = false\n[init]\n\tdefaultBranch = main\n");
  writeFileSync(sb.mock, MOCK_SRC); writeFileSync(sb.log, "");
  writeFileSync(sb.png, PNGS.ok); writeFileSync(sb.png + ".cut.png", PNGS.cut); writeFileSync(sb.png + ".empty.png", PNGS.empty); writeFileSync(sb.png + ".master.png", PNGS.master);
  for (const rel of [...TRACKED, ".gitignore"]) { const dst = join(sb.repo, ...rel.split("/")); mkdirSync(dirname(dst), { recursive: true }); copyFileSync(repoFile(rel), dst); }
  if (pre) { writeFileSync(contractPath(sb), JSON.stringify(PRE, null, 2) + "\n"); writeFileSync(registerPath(sb), PRE_REGISTER); }
  else if (!closed) writeFileSync(contractPath(sb), JSON.stringify(LIVE, null, 2) + "\n");   // D-165 as committed, before D-166 closed it
  if (base) base(sb);
  sgit(sb, ["init", "-q", "-b", "main"]); sgit(sb, ["add", "-A"]); sgit(sb, ["commit", "-q", "-m", "base"]); sgit(sb, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  if (layout === "worktree") top(sb);
  else if (layout === "branch" || layout === "detached") {
    if (layout === "branch") sgit(sb, ["checkout", "-q", "-b", "local-d165"]); else sgit(sb, ["checkout", "-q", "--detach"]);
    top(sb); sgit(sb, ["add", "-A"]); sgit(sb, ["commit", "-q", "-m", "D-165 not merged"]);
  }
  return sb;
}
function runFile(sb, rel, args, extra) {
  const r = spawnSync(process.execPath, ["--import", pathToFileURL(sb.mock).href, join(sb.repo, ...rel.split("/")), ...args], { cwd: sb.repo, env: envFor(sb, extra), encoding: "utf8", windowsHide: true, timeout: 120000 });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
const runAdapter = (sb, args, extra) => runFile(sb, ADAPTER_REL, args, extra);
const fetchLog = (sb) => readFileSync(sb.log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const outDir = (sb) => join(sb.repo, "tools", "avatar", "build", "r3-face-parts-d165");
const outFile = (sb, n) => join(outDir(sb), "r3-face-parts-d165." + n);
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
test("THE LIVE D-165 STATE: the dry run passes with the real tracked pins and NO credential, writes nothing, claims nothing, sends nothing", () => {
  const sb = sandbox();
  const r = runAdapter(sb, GOOD_ARGS);
  assert.equal(r.status, 0, r.out); assert.match(r.out, /DRY RUN PASSED/);
  assert.match(r.out, /authorisation : exactly one active, unspent D-165-r3-face-parts-sheet-v1 entry and one D-165 implementation entry in origin\/main/);
  assert.match(r.out, /size 1024x1024/);
  assert.equal(existsSync(sb.claim), false); assert.equal(existsSync(sb.events), false); assert.equal(fetchLog(sb).length, 0); assert.equal(existsSync(outDir(sb)), false);
  assert.equal(readdirSync(sb.state).length, 0, "the claim register was not even created");
});
test("BEFORE D-165 nothing could send: the reconstructed pre-D-165 state is refused before any claim", () => {
  const sb = sandbox({ pre: true });
  const r = runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV);
  assertRefusedBeforeClaim(sb, r, "register"); assert.match(r.out, /D-165 appears 0 times/);
});
test("an authorisation only in the working tree, on a local branch or on a detached HEAD is refused before the claim", () => {
  const wt = sandbox({ pre: true, layout: "worktree", top: toLive }); assertRefusedBeforeClaim(wt, runAdapter(wt, [...GOOD_ARGS, ...SEND], KEY_ENV), "blob-divergence");
  const br = sandbox({ pre: true, layout: "branch", top: toLive }); assertRefusedBeforeClaim(br, runAdapter(br, [...GOOD_ARGS, ...SEND], KEY_ENV), "branch");
  const dt = sandbox({ pre: true, layout: "detached", top: toLive }); assertRefusedBeforeClaim(dt, runAdapter(dt, [...GOOD_ARGS, ...SEND], KEY_ENV), "head-not-origin-main");
});
test("D-162 STAYS CLOSED: in the live D-165 state, the D-162 adapter is refused before any claim", () => {
  const sb = sandbox();
  const r = runFile(sb, D162_ADAPTER_REL, ["--call-id=D-162-r3-face-neutral-guide-b-v1", "--claim-identity=D-162-r3-face-neutral-guide-b-v1-claim", "--send", "--owner-approval=D-162"], KEY_ENV);
  assert.equal(r.status, 1, r.out); assert.match(r.out, /REFUSED \[authorisation\]/); assert.match(r.out, /mandateState: "SPENT", expected "UNSPENT"/);
  assert.equal(fetchLog(sb).length, 0); assert.equal(readdirSync(sb.state).length, 0, "the D-162 adapter created nothing in the claim register");
});

for (const [label, args] of [
  ["a wrong call-id", ["--call-id=D-165-r3-face-parts-sheet-v2", "--claim-identity=" + CLAIM_ID, ...SEND]],
  ...SPENT_IDS.map((id) => ["the spent call-id " + id, ["--call-id=" + id, "--claim-identity=" + CLAIM_ID, ...SEND]]),
  ["D-162's spent claim identity", ["--call-id=" + CALL, "--claim-identity=D-162-r3-face-neutral-guide-b-v1-claim", ...SEND]],
  ["a wrong claim identity", ["--call-id=" + CALL, "--claim-identity=D-165-other-claim", ...SEND]],
  ["--send without the approval", [...GOOD_ARGS, "--send"]],
  ["the approval without --send", [...GOOD_ARGS, APPROVAL]],
  ["D-162's approval", [...GOOD_ARGS, "--send", "--owner-approval=D-162"]],
  ["--retry", [...GOOD_ARGS, ...SEND, "--retry"]],
  ["--size", [...GOOD_ARGS, ...SEND, "--size=1024x1536"]],
  ["--model", [...GOOD_ARGS, ...SEND, "--model=gpt-image-1"]],
  ["a duplicate --send", [...GOOD_ARGS, ...SEND, "--send"]],
]) test("refused before the claim: " + label, () => { const sb = sandbox(); assertRefusedBeforeClaim(sb, runAdapter(sb, args, KEY_ENV), "arguments"); });

test("refused before the claim: an inactive, spent, closed, duplicated or second permission, or a bent D-164 method", () => {
  for (const [label, base] of [
    ["mandate SPENT", editEntry((e) => ({ ...e, mandateState: "SPENT" }))],
    ["status PREPARED", editEntry((e) => ({ ...e, status: "PREPARED — NOT AUTHORISED" }))],
    ["already attempted", editEntry((e) => ({ ...e, outcome: "EXECUTED ONCE" }))],
    ["neverReuse", editEntry((e) => ({ ...e, neverReuse: true }))],
    ["closed", editEntry((e) => ({ ...e, closedBy: "D-166" }))],
    ["another decision", editEntry((e) => ({ ...e, decision: "D-166" }))],
    ["prepared by D-162", editEntry((e) => ({ ...e, preparedBy: "D-162" }))],
    ["no RAW check bound", editEntry((e) => ({ ...e, outputHandling: { ...e.outputHandling, technicalChecks: "the broad envelope" } }))],
    ["no implementation entry", editImpl(() => null)],
    ["implementation executed", editImpl((x) => ({ ...x, adapter: { ...x.adapter, status: "IMPLEMENTED — EXECUTED ONCE — SPENT" } }))],
    ["implementation pins a hash", editImpl((x) => ({ ...x, adapter: { ...x.adapter, sha256: "0".repeat(64) } }))],
    ["D-162 reopened", (sb) => editContract(sb, (c) => { const d = c.authorisedCalls.calls.find((e) => e.decision === "D-162"); d.mandateState = "UNSPENT"; })],
    ["a second live permission", (sb) => editContract(sb, (c) => { const d = c.authorisedCalls.calls.find((e) => e.decision === "D-160"); d.mandateState = "UNSPENT"; delete d.neverReuse; })],
    ["the general flag flipped", (sb) => editContract(sb, (c) => { c.meta.authorisesImageRequest = true; })],
    ["two entries for the call", (sb) => editContract(sb, (c) => { c.authorisedCalls.calls.push(structuredClone(c.authorisedCalls.calls.find((e) => e.callId === CALL))); })],
    ["D-164 method missing", (sb) => editContract(sb, (c) => { delete c.faceNeutralPartsMethod; })],
    ["D-164 prompt pin changed", (sb) => editContract(sb, (c) => { c.faceNeutralPartsMethod.prompt.sha256 = "0".repeat(64); })],
    ["D-164 targets not approved", (sb) => editContract(sb, (c) => { c.faceNeutralPartsMethod.targets.status = "DRAFT"; })],
    ["D-164 sheet size changed", (sb) => editContract(sb, (c) => { c.faceNeutralPartsMethod.rawSheet.size = [1024, 1536]; })],
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
    ["the guide-B prompt", (e) => ({ ...e, prompt: { ...e.prompt, sha256: "7b9323155241bae8894b3e615d696350983aeef78f89e6f6c748492a8ae103c3" } })],
    ["a mask in the field order", (e) => ({ ...e, fieldOrder: [...e.fieldOrder, "mask"] })],
    ["claim identity", (e) => ({ ...e, claim: { ...e.claim, identity: "D-162-r3-face-neutral-guide-b-v1-claim" } })],
    ["adapter file", (e) => ({ ...e, adapter: { file: D162_ADAPTER_REL } })],
    ["two outputs", (e) => ({ ...e, outputs: { ...e.outputs, count: 2 } })],
    ["counted as underlay", (e) => ({ ...e, accounting: { slot: "underlay" } })],
  ]) {
    const sb = sandbox({ base: editEntry(fn) }); const r = runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV);
    assert.equal(r.status, 1, label); assert.match(r.out, /REFUSED \[authorisation\]/, label + "\n" + r.out);
    assert.equal(existsSync(sb.claim), false, label); assert.equal(fetchLog(sb).length, 0, label);
  }
});

test("refused before the claim: changed prompt or North Star bytes committed to origin/main — only the pinned bytes are sent", () => {
  for (const [rel, mutate] of [[PROMPT_REL, (b) => Buffer.from(b.toString("utf8").replace("eyebrow", "eyebrows"), "utf8")], [PROMPT_REL, (b) => b.subarray(0, b.length - 1)], [NORTHSTAR_REL, (b) => { b[b.length - 20] ^= 0xff; return b; }]]) {
    const sb = sandbox({ base: (s) => { const p = join(s.repo, ...rel.split("/")); writeFileSync(p, mutate(readFileSync(p))); } });
    assertRefusedBeforeClaim(sb, runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV), "pins");
  }
});
test("refused before the claim: a register row that is missing or doubled", () => {
  const none = sandbox({ base: (s) => writeFileSync(registerPath(s), readFileSync(registerPath(s), "utf8").split("\n").filter((l) => !l.startsWith("| **D-165** |")).join("\n")) });
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
test("a normal sheet — claim, dispatch record, ONE fetch of exactly the pinned bytes; RAW-1..5 pass; stored; no candidate; no retry", () => {
  const sb = sandbox();
  const r = runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV);
  assert.equal(r.status, 0, r.out);
  const log = fetchLog(sb); assert.equal(log.length, 1); const L = log[0];
  assert.equal(L.claimExistedAtCall, true);
  assert.deepEqual(parseEvents(L.eventsAtCall, CALL).records.map((x) => x.event), ["dispatch"]);
  assert.deepEqual([L.url, L.method, L.redirect, L.dummyKey], ["https://api.openai.com/v1/images/edits", "POST", "error", true]);
  assert.deepEqual(L.fields, ["model", "image[]", "prompt", "size", "quality", "n", "output_format", "background"]);
  assert.deepEqual([L.images, L.imageSha, L.size], [["Northstar Master v2.png"], [NORTHSTAR_SHA], "1024x1024"], "exactly one image, North Star, and the sheet size");
  assert.equal(L.prompt, readFileSync(repoFile(PROMPT_REL), "utf8"), "the frozen prompt, byte for byte (its trailing LF included)");
  assert.deepEqual([L.background, L.hasMask, L.hasInputFidelity], ["transparent", false, false]);
  const m = manifest(sb);
  assert.deepEqual([m.outcome.classification, m.outcome.fetches, m.outcome.automaticRetry, m.outcome.candidateWritten, m.outcome.promoted], ["PASS_TO_VISUAL_REVIEW_AND_ANNOTATION", 1, false, false, false]);
  assert.deepEqual([m.accounting.claimState, m.accounting.dispatch, m.accounting.result, m.accounting.actuallySent, m.accounting.serverAnswered], ["consumed", "started", "response", 1, true]);
  const c = checkDoc(sb);
  assert.equal(c.verdict, "PASS_TO_ANNOTATION"); assert.deepEqual(c.auto.map((a) => a.id), ["RAW-1", "RAW-2", "RAW-3", "RAW-4", "RAW-5"]);
  assert.match(c.note, /does not approve its appearance/); assert.match(c.annotation, /only the owner sets APPROVED/);
  assert.ok(!JSON.stringify(c).includes("AUTO-5") && !JSON.stringify(c).includes("envelope"), "no face envelope or AUTO check on the sheet");
  assert.equal(sha256(readFileSync(outFile(sb, "response.json"))), sha256(readFileSync(sb.body)));
  assert.equal(sha256(readFileSync(outFile(sb, "image-1.png"))), sha256(readFileSync(sb.png)));
  assert.deepEqual(readdirSync(outDir(sb)).sort(), ["r3-face-parts-d165.check.json", "r3-face-parts-d165.image-1.png", "r3-face-parts-d165.request.json", "r3-face-parts-d165.response.json"]);
  assert.ok(!allSandboxText(sb).includes(DUMMY_KEY.slice(3)) && !r.out.includes(DUMMY_KEY.slice(3)), "the key appears nowhere");
  const again = runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV);
  assert.equal(again.status, 1); assert.match(again.out, /REFUSED \[claim-exists\]/); assert.equal(fetchLog(sb).length, 1);
});
test("the sheet's own checks: a part cut at a cell boundary, an empty cell or a master-size image is a TECHNICAL_REJECT with no candidate", () => {
  for (const [mode, first] of [["cut", "RAW-5"], ["empty-cell", "RAW-4"], ["master", "RAW-2"]]) {
    const sb = sandbox(); const r = runAdapter(sb, [...GOOD_ARGS, ...SEND], { ...KEY_ENV, D165_MOCK_MODE: mode });
    assert.equal(r.status, 0, mode + "\n" + r.out);
    const m = manifest(sb); assert.deepEqual([m.outcome.classification, m.check.firstFailure, m.outcome.candidateWritten], ["TECHNICAL_REJECT", first, false], mode);
    assert.ok(existsSync(outFile(sb, "image-1.png")), mode + ": the rejected sheet is still kept unchanged");
    assert.ok(!readdirSync(outDir(sb)).some((n) => /candidate/i.test(n)));
    assert.equal(runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV).status, 1, "no retry after " + mode); assert.equal(fetchLog(sb).length, 1);
  }
});
test("the master-canvas envelope is NOT applied: parts far outside [384, 230, 632, 412] still pass RAW-1..5", () => {
  const sb = sandbox(); assert.equal(runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV).status, 0);
  const c = checkDoc(sb); assert.equal(c.verdict, "PASS_TO_ANNOTATION");
  assert.ok(c.cells.browLeft.supportBox[1] < 230 && c.cells.mouth.supportBox[3] + 512 > 412, "the synthetic parts lie well outside the face envelope's rows");
});
test("HTTP error, transport error and a crash inside the network call — sent, no retry, the result never downgrades the dispatch", () => {
  for (const [mode, code, cls, result, answered] of [["http500", 3, "HTTP_ERROR", "http-error", true], ["throw", 3, "DISPATCHED_RESULT_UNKNOWN", "unknown", false], ["die-in-fetch", 137, null, "unknown", false]]) {
    const sb = sandbox(); const r = runAdapter(sb, [...GOOD_ARGS, ...SEND], { ...KEY_ENV, D165_MOCK_MODE: mode });
    assert.equal(r.status, code, mode + "\n" + r.out);
    const d = onDisk(sb); assert.deepEqual([d.dispatch, d.result, d.actuallySent, d.serverAnswered], ["started", result, 1, answered], mode);
    if (cls) assert.equal(manifest(sb).outcome.classification, cls);
    assert.equal(runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV).status, 1, "no retry after " + mode); assert.equal(fetchLog(sb).length, 1);
  }
});
test("crash windows before the network: claim → dispatch undetermined; dispatch record fails or is torn → documented stop; nothing fetched", () => {
  const a = sandbox(); assert.equal(runAdapter(a, [...GOOD_ARGS, ...SEND], { ...KEY_ENV, D165_MOCK_MODE: "die-at-dispatch" }).status, 137);
  assert.deepEqual([onDisk(a).dispatch, onDisk(a).dispatchUndetermined, fetchLog(a).length], ["undetermined", 1, 0]);
  assert.equal(runAdapter(a, [...GOOD_ARGS, ...SEND], KEY_ENV).status, 1, "no retry");
  for (const mode of ["fail-dispatch", "torn-dispatch"]) {
    const sb = sandbox(); assert.equal(runAdapter(sb, [...GOOD_ARGS, ...SEND], { ...KEY_ENV, D165_MOCK_MODE: mode }).status, 3, mode);
    const m = manifest(sb); assert.deepEqual([m.outcome.classification, m.accounting.dispatch, m.accounting.actuallySent, fetchLog(sb).length], ["NOT_DISPATCHED", "not-started", 0, 0], mode);
    assert.deepEqual(parseEvents(readFileSync(sb.events, "utf8"), CALL).records.map((x) => x.event), ["stop"], mode);
  }
});
test("an unexpected image count is kept whole without selection or check", () => {
  const two = sandbox(); assert.equal(runAdapter(two, [...GOOD_ARGS, ...SEND], { ...KEY_ENV, D165_MOCK_MODE: "two" }).status, 0);
  const m2 = manifest(two); assert.deepEqual([m2.outcome.classification, m2.images.count, m2.check], ["UNEXPECTED", 2, null]);
  assert.ok(existsSync(outFile(two, "image-1.png")) && existsSync(outFile(two, "image-2.png")) && !existsSync(outFile(two, "check.json")));
  const zero = sandbox(); assert.equal(runAdapter(zero, [...GOOD_ARGS, ...SEND], { ...KEY_ENV, D165_MOCK_MODE: "zero" }).status, 0);
  assert.equal(manifest(zero).outcome.classification, "UNEXPECTED");
});
test("two simultaneous processes cannot send two requests", async () => {
  const sb = sandbox();
  const one = () => new Promise((res) => { const c = spawn(process.execPath, ["--import", pathToFileURL(sb.mock).href, join(sb.repo, ...ADAPTER_REL.split("/")), ...GOOD_ARGS, ...SEND],
    { cwd: sb.repo, env: envFor(sb, { ...KEY_ENV, D165_MOCK_MODE: "slow" }), windowsHide: true }); let out = ""; c.stdout.on("data", (d) => { out += d; }); c.stderr.on("data", (d) => { out += d; }); c.on("close", (code) => res({ code, out })); });
  const [a, b] = await Promise.all([one(), one()]);
  assert.equal(fetchLog(sb).length, 1); assert.deepEqual([a.code, b.code].sort(), [0, 1], a.out + "\n----\n" + b.out);
});
test("two clones share one claim register: a claim made from one clone refuses the send from another", () => {
  const first = sandbox(); assert.equal(runAdapter(first, [...GOOD_ARGS, ...SEND], KEY_ENV).status, 0);
  const second = sandbox();
  const r = runAdapter(second, [...GOOD_ARGS, ...SEND], { ...KEY_ENV, LOCALAPPDATA: first.state, XDG_STATE_HOME: first.state, D165_MOCK_CLAIM: first.claim, D165_MOCK_EVENTS: first.events });
  assert.equal(r.status, 1, r.out); assert.match(r.out, /REFUSED \[claim-exists\]/);
  assert.equal(fetchLog(second).length, 0, "the second clone sent nothing");
});

// ── D-166: the one send is recorded and the mandate is closed ───────────────────────────────────────────────────
const D166_ROW = REGISTER.split("\n").find((l) => l.startsWith("| **D-166** |"));
const E_NOW = LIVE_NOW.authorisedCalls.calls.find((e) => e.callId === CALL);
const IMPL_NOW = LIVE_NOW.adapterImplementations.entries.find((e) => e.decision === "D-165");
const D165_ROW_SHA_AT_PRE_D166 = "bb565a53a3f8d32fea94d68e093abc83a3a2136c2602a35aa80db2c7e9d54830";
const RAW_SHA = "d300466081acf9595fd06b73a04682815d5248c6f3c4204f0a77aeb0a424055d";
const REQUEST_ID = "req_ab32359e7096450e97de8e9a26d32b2a";

test("D-166 changes exactly the closure: the contract as D-165 committed it is reproduced canonically", () => {
  assert.equal(sha256(JSON.stringify(LIVE)), PRE_D166_CONTRACT_CANONICAL_SHA256, "LIVE_NOW with D-166's closure reversed is the contract at 6b873bf");
  assert.equal(sha256(JSON.stringify(preD165Contract(LIVE_NOW))), PRE_D165_CONTRACT_CANONICAL_SHA256, "and the older chain still holds");
  assert.deepEqual(LIVE_NOW.authorisedCalls.calls.slice(0, 7), LIVE.authorisedCalls.calls.slice(0, 7), "the seven earlier entries are unchanged");
  assert.deepEqual(LIVE_NOW.adapterImplementations.entries.slice(0, 3), LIVE.adapterImplementations.entries.slice(0, 3));
  assert.deepEqual([LIVE_NOW.authorisedCalls.count, LIVE_NOW.authorisedCalls.calls.length], [8, 8], "no entry is added");
  for (const k of ["assets", "faceNeutralPartsMethod", "faceNeutralPreparation", "deterministicOperations", "meta", "architecture"]) assert.deepEqual(LIVE_NOW[k], LIVE[k], k + " is unchanged");
  for (const k of Object.keys(E)) { if (["status", "mandateState", "outcome"].includes(k)) continue; assert.deepEqual(E_NOW[k], E[k], "D-165's authorisation field " + k + " is preserved"); }
});

test("D-166 closes D-165 in place: SPENT, never reused, not a permission, with the recorded execution and the owner's split verdict", () => {
  assert.deepEqual([E_NOW.mandateState, E_NOW.neverReuse, E_NOW.notAnActivePermission, E_NOW.closure.closedBy], ["SPENT", true, true, "D-166"]);
  assert.match(E_NOW.status, /^SPENT — SENT ONCE, HTTP 200, ONE IMAGE RECEIVED, RAW-1\.\.5 PASSED, NOSE REJECTED BY THE OWNER/);
  assert.equal(E_NOW.closure.snapshotCanonicalSha256BeforeClosure, sha256(JSON.stringify(E)), "the closure names the committed entry's snapshot");
  const x = E_NOW.execution;
  assert.deepEqual([x.request.fetches, x.request.retried, x.request.requestId, x.response.httpStatus, x.response.imagesReturned], [1, false, REQUEST_ID, 200, 1]);
  assert.equal(x.raw.sha256, RAW_SHA); assert.equal(x.request.promptSha256, PROMPT_SHA); assert.ok(x.request.inputs.length === 1 && x.request.inputs[0].includes(NORTHSTAR_SHA));
  assert.deepEqual(x.request.parameters, E.parameters);
  assert.deepEqual(x.accounting, { claimState: "consumed", dispatch: "started", result: "response", actuallySent: 1, dispatchUndetermined: 0, serverAnswered: true, automaticRetry: false, logConsistent: true });
  assert.match(x.sentBy, /6b873bf37f226e365d3bde03e89331fd1570f50f/);
  assert.match(E_NOW.technicalObservations.passed, /RAW-5 0 px/);
  assert.match(E_NOW.technicalObservations.notApplied, /face envelope and AUTO-1\.\.5 were not applied/);
  assert.match(E_NOW.visualReview.ownerDecision, /rejects the NOSE visually \(wrong orientation and a skin-coloured fill\)/);
  assert.match(E_NOW.visualReview.ownerDecision, /BROWS and the MOUTH are kept for further review; that is not a production approval/);
  assert.match(E_NOW.visualReview.ownerDecision, /stay DRAFT: six non-nose points/);
  assert.match(E_NOW.visualReview.ownerDecision, /never mirrored, retouched, de-skinned or otherwise repaired/);
  assert.deepEqual([IMPL_NOW.adapter.status, IMPL_NOW.mandateState, IMPL_NOW.neverReuse, IMPL_NOW.closedBy], ["IMPLEMENTED — EXECUTED ONCE — SPENT", "SPENT", true, "D-166"]);
});

test("D-166: faceNeutral rises to 3, underlay stays 5, the budget text is true to the figures, no live permission remains, R3 OFF", () => {
  const sent = LIVE_NOW.imageCallBudget.callsActuallySentSoFar, then = LIVE.imageCallBudget.callsActuallySentSoFar;
  assert.deepEqual([sent.faceNeutral, sent.faceNeutralRecord.serverAnswered, sent.faceNeutralRecord.dispatchUndetermined], [3, 3, 0]);
  assert.deepEqual(sent.faceNeutralRecord.attempts.slice(0, 2), then.faceNeutralRecord.attempts, "the D-160 and D-162 records are unchanged");
  assert.match(sent.faceNeutralRecord.attempts[2], /^D-165-r3-face-parts-sheet-v1 — .*\(recorded by D-166\)$/);
  for (const k of ["underlay", "which", "note"]) assert.deepEqual(sent[k], then[k], "underlay accounting field " + k + " is unchanged");
  assert.equal(sent.underlay, 5);
  const { callsActuallySentSoFar: a, ...restNow } = LIVE_NOW.imageCallBudget, { callsActuallySentSoFar: b, ...restThen } = LIVE.imageCallBudget;
  assert.deepEqual(restNow, restThen, "no other budget field changed");
  assert.equal(LIVE_NOW.imageCallBudget.callsPlannedAndAuthorised.faceNeutral, sent.faceNeutral, "the planned face capacity (3) is used up");
  const ba = LIVE_NOW.authorisedCalls.budgetAccounting;
  assert.match(ba, /The derived budget is 21-22\./); assert.match(ba, /actually sent is underlay 5 and faceNeutral 3/);
  assert.equal(`${LIVE_NOW.imageCallBudget.minimum}-${LIVE_NOW.imageCallBudget.maximum}`, "21-22", "the text matches the contract's figures");
  assert.deepEqual(LIVE_NOW.authorisedCalls.calls.filter((e) => e.mandateState === "UNSPENT"), [], "no live permission remains");
  assert.match(LIVE_NOW.prohibitions.noImageRequestAuthorised, /\(8\) D-165-r3-face-parts-sheet-v1 — NO LONGER a permission/);
  assert.match(LIVE_NOW.prohibitions.noImageRequestAuthorised, /No entry in this list is an active send permission/);
  assert.equal(LIVE_NOW.meta.authorisesImageRequest, false); assert.equal(LIVE_NOW.architecture.defaultEnabled, false);
  assert.ok(!/AVATAR_R3\s*=\s*true/.test(readFileSync(repoFile("js/avatar-layers.js"), "utf8")), "R3 stays OFF at runtime");
});

test("the D-166 register row: once, directly after D-165, D-165 verbatim, the outcome and the owner's verdict named", () => {
  const lines = REGISTER.split("\n");
  assert.equal(lines.filter((l) => l.startsWith("| **D-166** |")).length, 1);
  assert.equal(lines.findIndex((l) => l.startsWith("| **D-166** |")), lines.findIndex((l) => l.startsWith("| **D-165** |")) + 1);
  assert.equal(sha256(ROW), D165_ROW_SHA_AT_PRE_D166, "D-165's row is not rewritten");
  for (const needle of [CALL, CLAIM_ID, "6b873bf37f226e365d3bde03e89331fd1570f50f", REQUEST_ID, "**HTTP 200**", RAW_SHA, "RAW-1..5", "Næsen er afvist", "Begge bryn og munden bevares til videre review",
    "seks ikke-næse-punkter", "DRAFT", "`callsActuallySentSoFar.faceNeutral` = **3**", "`callsActuallySentSoFar.underlay` forbliver **5**", "ingen aktiv", "R3 forbliver default OFF"])
    assert.ok(D166_ROW.includes(needle), "the D-166 row carries " + JSON.stringify(needle));
  assert.ok(!/[ÃÂ]\S|�/.test(D166_ROW), "no mojibake in the Danish row");
});

test("since D-166 the LIVE contract refuses the D-165 adapter before any claim: its mandate is closed", () => {
  const sb = sandbox({ closed: true });
  assertRefusedBeforeClaim(sb, runAdapter(sb, GOOD_ARGS), "authorisation");
  const r = runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV);
  assertRefusedBeforeClaim(sb, r, "authorisation");
  assert.match(r.out, /mandateState: "SPENT", expected "UNSPENT"/);
});
