// R3 face-neutral — the PROPOSED one-shot send adapter for D-160-r3-face-neutral-v1, its attempt ledger and its
// inactive call specification, tested without ever reaching the real world.
//
// The lessons of D-142 and D-145 apply unchanged:
//   · The send adapter is NEVER imported. This file reads its source as text, or runs it as a CLI in a child process
//     inside a TEMPORARY git repository that this file builds per scenario, with its own origin/main.
//   · Every child gets an environment built from an explicit ALLOWLIST: no inherited key, no real LOCALAPPDATA or
//     XDG_STATE_HOME, and TEMP/TMP/TMPDIR inside the sandbox. The key is a dummy literal.
//   · globalThis.fetch is replaced from OUTSIDE by `node --import <mock>`. The mock refuses to load unconfigured, never
//     delegates to a real fetch, and logs one line per call. Proxy variables point at a closed local port as a further
//     layer. The crash windows (claim → dispatch record → fetch) are simulated by the same mock patching node:fs from
//     outside; the adapter knows nothing about it.
//   · No test reads, lists or checks the real claim register, a real key or the real build area.
// Guide A′ is PRIVATE (H1-derived, gitignored). Scenarios that must get past the guide check need
// R3_FACE_GUIDE_A_PRIME_PATH and are skipped without it; every refusal before the guide stage runs without it.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, readdirSync, statSync, copyFileSync, realpathSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync, spawn } from "node:child_process";
import { join, dirname, relative, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { encodePngRGBA } from "../../tools/avatar/build-r2-torso-occlusion-mask.mjs";
import { formatEvent, parseEvents, deriveAttempt, EVENTS as LEDGER_EVENTS } from "../../tools/avatar/r3-face-neutral-attempt-ledger.mjs";
import { buildPreview, parseArgs as prepParseArgs, STATUS as PREP_STATUS } from "../../tools/avatar/prepare-r3-face-neutral-request.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const repoFile = (rel) => join(REPO, ...rel.split("/"));
const ADAPTER_REL = "tools/avatar/openai-send-r3-face-neutral-d160.mjs";
const LEDGER_REL = "tools/avatar/r3-face-neutral-attempt-ledger.mjs";
const CHECKER_REL = "tools/avatar/check-r3-face-neutral-output.mjs";
const PREP_REL = "tools/avatar/prepare-r3-face-neutral-request.mjs";
const SPEC_REL = "tools/avatar/fixtures/r3-face-neutral/send-call-spec-prepared-v1.json";
const CONTRACT_REL = "tools/avatar/fixtures/r3/r3-shadow-contract-v1.json";
const REGISTER_REL = "docs/project-state.md";
const PROMPT_REL = "tools/avatar/fixtures/r3-face-neutral/prompt-text.exact.txt";
const NORTHSTAR_REL = "assets/avatar/reference/Northstar Master v2.png";
const SRC = readFileSync(repoFile(ADAPTER_REL), "utf8");
const CODE = SRC.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
const SPEC = JSON.parse(readFileSync(repoFile(SPEC_REL), "utf8"));
const LIVE = JSON.parse(readFileSync(repoFile(CONTRACT_REL), "utf8"));
const REGISTER = readFileSync(repoFile(REGISTER_REL), "utf8");

const CALL = "D-160-r3-face-neutral-v1";
const CLAIM_ID = "D-160-r3-face-neutral-v1-claim";
const CLAIM_FILE = "D-160-r3-face-neutral-v1.claim.json";
const EVENTS_FILE = "D-160-r3-face-neutral-v1.events.jsonl";
const DUMMY_KEY = "sk-d160-sandbox-dummy-key-not-a-credential";
const APPROVAL = "--owner-approval=D-160";
const GOOD_ARGS = ["--call-id=" + CALL, "--claim-identity=" + CLAIM_ID];
const SEND = ["--send", APPROVAL];
const GUIDE_SHA = "aed1745ecf5c82472774509546bdeeef7463dd7fad57a3a83933a5bcab613dcf";
const NORTHSTAR_SHA = "3daf32e76bff9a53ec7d25cf148a230073cfd0da6a003d02a23c4292d139ff50";
const PROMPT_SHA = "9c0b26496ce693dfe0d958fc34c60e68d3eddab98e48bb7b1f11af94e07d2413";
const MODEL = "gpt-image-2.5-sunburst-2026-09-08";
const SPENT_IDS = ["D-139-r3-underlay-head-only-v1", "D-142-r3-underlay-core-v1", "D-143-r3-underlay-core-v2", "D-151-r3-head-colour-u1-v1", "D-153-r3-head-colour-u1-opaque-v1"];
const GUIDE_PATH = process.env.R3_FACE_GUIDE_A_PRIME_PATH;
const GUIDE_OK = typeof GUIDE_PATH === "string" && existsSync(GUIDE_PATH) && sha256(readFileSync(GUIDE_PATH)) === GUIDE_SHA;

function isInside(child, parent) {
  if (typeof child !== "string" || typeof parent !== "string" || child === "" || parent === "") return false;
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}
const stripComments = (s) => s.split("\n").filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*")).join("\n");

// ── static: the adapter's shape ─────────────────────────────────────────────────────────────────────────────────

test("the adapter exports nothing and imports only node built-ins, the ledger and the D-159 checker", () => {
  assert.ok(!/^\s*export\b/m.test(CODE), "the send adapter must export nothing, so no test can import its send path");
  const imports = [...CODE.matchAll(/^\s*import\b[^;]*?from\s+"([^"]+)"/gm)].map((m) => m[1]);
  for (const spec of imports) assert.ok(spec.startsWith("node:") || ["./r3-face-neutral-attempt-ledger.mjs", "./check-r3-face-neutral-output.mjs"].includes(spec), "unexpected import " + spec);
  assert.ok(!/\bimport\s*\(/.test(CODE) && !/\brequire\s*\(/.test(CODE), "no dynamic import, no require");
  for (const bad of ["openai", "undici", "axios", "node-fetch", "got", "node:http", "node:https", "node:net", "node:tls", "node:dns"]) assert.ok(!imports.includes(bad), "no client library: " + bad);
  for (const rel of [LEDGER_REL, CHECKER_REL]) {
    const s = stripComments(readFileSync(repoFile(rel), "utf8"));
    const imp = [...s.matchAll(/^\s*import\b[^;]*?from\s+"([^"]+)"/gm)].map((m) => m[1]);
    assert.ok(imp.every((x) => x === "node:zlib"), rel + " imports nothing but node:zlib: " + JSON.stringify(imp));
    for (const bad of ["fetch(", "process.env", "readFileSync", "writeFileSync", "openSync", "node:http", "XMLHttpRequest", "WebSocket"]) assert.ok(!s.includes(bad), rel + " must not contain " + bad);
  }
});

test("exactly one fetch call site, with redirect \"error\", not in a loop, and git never touches the network", () => {
  assert.equal([...CODE.matchAll(/\bfetch\s*\(/g)].length, 1, "exactly one fetch call site");
  assert.equal([...CODE.matchAll(/globalThis\.fetch\s*\(/g)].length, 1, "and it is globalThis.fetch");
  assert.match(CODE, /globalThis\.fetch\(ENDPOINT, \{ method: "POST", redirect: "error", headers: \{ Authorization: "Bearer " \+ apiKey \}, body: built\.body \}\)/);
  assert.ok(!/\b(for|while)\s*\([^)]*\)\s*\{[^}]*globalThis\.fetch/.test(CODE), "the fetch is not inside a loop");
  assert.ok(!/["'](fetch|pull|push|remote|ls-remote|clone)["']/.test(CODE), "git is used read-only and never over the network");
  for (const word of ["retry", "maxRetries", "retries", "backoff", "fallback"]) {
    const prose = /no retry, no fallback|No outcome permits an automatic retry|there is no fallback|automaticRetry: false|NO RETRY/gi;   // the adapter's own prohibitions, longest first
    assert.ok(!new RegExp("\\b" + word + "\\b", "i").test(CODE.replace(prose, "")), "no " + word);
  }
});

test("the adapter has no injection point, and the key is read once, in a send, after every check", () => {
  for (const hook of ["fetchImpl", "claimPath", "outDir:", "registerPath", "contractPath", "gitRef", "fetchModule", "specPath"]) assert.ok(!CODE.includes(hook), "no injection point " + hook);
  for (const flag of ["--claim-path", "--force", "--retry", "--reset", "--out", "--ref", "--contract", "--register", "--model", "--mask", "--spec"]) assert.ok(!CODE.includes("\"" + flag), "no CLI flag " + flag);
  const envUses = [...CODE.matchAll(/process\.env(\.[A-Za-z_][A-Za-z0-9_]*|\[[^\]]*\]|\))?/g)].map((m) => m[0]);
  const allowed = new Set(["process.env.OPENAI_API" + "_KEY", "process.env.LOCALAPPDATA", "process.env.XDG_STATE_HOME", "process.env)"]);
  for (const u of envUses) assert.ok(allowed.has(u), "unexpected environment read: " + u);
  assert.equal([...CODE.matchAll(/process\.env\.OPENAI_API_KEY/g)].length, 1, "the key is read in exactly one place");
  assert.ok(!/console\.(log|error)\([^)]*apiKey/.test(CODE), "the key is never logged");
  assert.ok(!/apiKey[^;\n]*(writeAtomic|createClaim|appendEvent|writeFileSync|manifest\.)/.test(CODE), "the key is never written");
  assert.ok(!CODE.includes("send-call-spec-prepared"), "the adapter never reads the inactive specification as a permission");
  assert.ok(!/preparedRequest\.sendable|preparedCall/.test(CODE), "no preparation record is read as a permission");
});

test("the adapter deletes nothing; its exclusive opens are the claim and the first event record; it writes only into the gitignored build area", () => {
  for (const del of ["unlinkSync", "rmSync", "rmdirSync", "unlink(", "rm(", "truncateSync", "ftruncate", "copyFileSync"]) assert.ok(!CODE.includes(del), "must not contain " + del);
  assert.equal([...CODE.matchAll(/openSync\(/g)].length, 2, "two openSync: the claim and the event log");
  assert.match(CODE, /function createClaim\(file, record\) \{\n[^\n]*\n\s*const fd = openSync\(file, "wx"\);/);
  assert.match(CODE, /event\("dispatch", \{[^\n]*\}, "wx"\);/, "the dispatch record creates the log exclusively");
  assert.deepEqual([...CODE.matchAll(/writeFileSync\(([^)]*)\)/g)].map((m) => m[1]), ["partial, data, { flag: \"wx\" }"]);
  assert.match(CODE, /const OUT_DIR = "tools\/avatar\/build\/r3-face-neutral-d160";/);
  assert.match(readFileSync(repoFile(".gitignore"), "utf8"), /^tools\/avatar\/build\/$/m, "the build area is gitignored");
  assert.ok(!/candidate\.png|\.candidate\./.test(CODE), "no candidate file name exists in the adapter");
  assert.ok(!/["']assets\//.test(CODE.replace(/northstar: "assets\/avatar\/reference\/Northstar Master v2\.png"/, "")), "no runtime asset path is ever a target");
});

test("inside main(), every check precedes the key and the claim; between the claim and the fetch there is only the dispatch record", () => {
  const body = CODE.slice(CODE.indexOf("async function main(argv)"));
  const order = ["parseArgs(argv)", "resolveRefs()", "readOriginBlobs(refs.originSha)", "verifyPins(blobs)", "verifyRegister(blobs.register)",
    "verifyAuthorisation(parsed.contract)", "verifyImplementation(parsed.contract)", "resolveClaimLocation()", "pathExists(loc.claim)", "pathExists(loc.events)",
    "occupiedOutputs()", "readGuide(args.guide)", "buildBody(guide.buf, blobs, pins.prompt)", "if (!args.sendMode)", "const again = resolveRefs()",
    "process.env.OPENAI_API" + "_KEY", "claim = createClaim(", "event(\"dispatch\"", "globalThis.fetch("];
  let last = -1;
  for (const k of order) { const i = body.indexOf(k); assert.ok(i > last, k + " must come after the previous step"); last = i; }
  const between = body.slice(body.indexOf("claim = createClaim("), body.indexOf("res = await globalThis.fetch("));
  assert.ok(body.includes("res = await globalThis.fetch("), "the fetch is awaited directly");
  assert.ok(!/writeAtomic|readFileSync|readGuide|verify/.test(between), "no other I/O or check between the claim and the fetch");
  assert.equal([...between.matchAll(/\bawait\b/g)].length, 0, "nothing else is awaited between the claim and the fetch");
  assert.match(between, /event\("stop", /, "a failed dispatch record leads to a stop record");
  assert.match(between, /return finish\("NOT_DISPATCHED"/, "and to a return before the fetch");
});

test("the adapter's constants equal the inactive specification and the D-159 contract section", () => {
  const S = SPEC, P = LIVE.faceNeutralPreparation.preparedRequest;
  for (const v of [S.proposedIdentity.callId, S.proposedIdentity.claimIdentity, S.proposedIdentity.claimFilename, S.proposedIdentity.eventsFilename,
    S.proposedIdentity.ownerApprovalFlag, S.sendAdapter.file, S.request.model, S.request.endpoint, GUIDE_SHA, NORTHSTAR_SHA, PROMPT_SHA]) assert.ok(SRC.includes(v), "the adapter carries " + v);
  assert.equal(S.request.model, P.model); assert.deepEqual(S.request.parameters, P.parameters); assert.deepEqual(S.request.fieldOrder, P.fieldOrder);
  assert.deepEqual(S.request.neverSentFields, P.omitted);
  assert.equal(S.request.inputs[0].sha256, P.inputs[0].sha256); assert.equal(S.request.inputs[1].sha256, P.inputs[1].sha256);
  assert.equal(S.request.prompt.sha256, P.prompt.sha256); assert.equal(S.request.prompt.bytes, P.prompt.bytes);
  assert.equal(sha256(readFileSync(repoFile(PROMPT_REL))), PROMPT_SHA); assert.equal(sha256(readFileSync(repoFile(NORTHSTAR_REL))), NORTHSTAR_SHA);
  assert.match(SRC, /const PARAMETERS = Object\.freeze\(\{ size: "1024x1536", quality: "high", n: 1, output_format: "png", background: "transparent" \}\);/);
  assert.match(SRC, /const FIELD_ORDER = Object\.freeze\(\["model", "image\[\]", "image\[\]", "prompt", "size", "quality", "n", "output_format", "background"\]\);/);
  for (const id of SPENT_IDS) assert.ok(SRC.includes(id), "the adapter lists " + id + " as never-reuse");
});

// ── the specification is inactive, and the live repository carries no permission ─────────────────────────────────

test("the specification is PREPARED — NOT AUTHORISED, and its proposed identity is unused in the live contract and register", () => {
  assert.equal(SPEC.status, "PREPARED — NOT AUTHORISED");
  assert.deepEqual([SPEC.isAuthorisation, SPEC.authorisesImageRequest, SPEC.authorisesUpload, SPEC.claimCreated], [false, false, false, false]);
  assert.match(SPEC.whatThisFileIs, /never reads this file/);
  const live = JSON.stringify(LIVE);
  for (const v of [CALL, CLAIM_ID, CLAIM_FILE, EVENTS_FILE, "D-160", ADAPTER_REL]) assert.ok(!live.includes(v), "the live contract does not carry " + v);
  assert.equal(REGISTER.split("\n").filter((l) => l.startsWith("| **D-160** |")).length, 0, "no D-160 register row");
  for (const v of [CALL, CLAIM_ID]) assert.ok(!REGISTER.includes(v), "the register does not carry " + v);
  assert.equal(LIVE.authorisedCalls.calls.filter((e) => e.mandateState === "UNSPENT").length, 0, "no active permission exists");
  assert.deepEqual(Object.keys(LIVE.imageCallBudget.callsActuallySentSoFar).filter((k) => typeof LIVE.imageCallBudget.callsActuallySentSoFar[k] === "number"), ["underlay"]);
  assert.equal(LIVE.imageCallBudget.callsActuallySentSoFar.underlay, 5, "the historical underlay figure is unchanged");
  assert.equal(LIVE.meta.authorisesImageRequest, false);
  assert.ok(!existsSync(repoFile("tools/avatar/fixtures/r3-face-neutral/input-1-placement-guide-A-prime.png")), "the private guide is never tracked");
});

test("the D-159 preparation-only adapter still cannot send", () => {
  const prep = stripComments(readFileSync(repoFile(PREP_REL), "utf8"));
  assert.ok(!/\bfetch\s*\(/.test(prep) && !/process\.env/.test(prep), "no fetch and no environment read in the preparation adapter");
  for (const flag of ["--send", APPROVAL, "--call-id=" + CALL, "--claim=" + CLAIM_ID]) assert.throws(() => prepParseArgs(["--guide=x", flag]), /REFUSED/);
  assert.match(PREP_STATUS, /NOT SENDABLE/);
  assert.equal(typeof buildPreview, "function");
});

// ── the ledger: D-159's three axes, derived from real record lines ───────────────────────────────────────────────

const rec = (seq, ev, f) => formatEvent(CALL, seq, ev, f);
const LOGS = {
  stop: rec(1, "stop", { reason: "x" }),
  crash: "",
  dispatchCrash: rec(1, "dispatch", {}),
  dispatchTransport: rec(1, "dispatch", {}) + rec(2, "transport-error", { error: "x" }),
  dispatchHttpError: rec(1, "dispatch", {}) + rec(2, "answer", { httpStatus: 500 }),
  dispatchResponse: rec(1, "dispatch", {}) + rec(2, "answer", { httpStatus: 200 }),
};

test("the ledger derives exactly D-159's five registered cases from the adapter's record format", () => {
  const cases = LIVE.faceNeutralPreparation.laterAttemptRules.callCounting.cases;
  const logs = [LOGS.stop, LOGS.crash, LOGS.dispatchCrash, LOGS.dispatchHttpError, LOGS.dispatchResponse];
  assert.equal(cases.length, 5);
  cases.forEach((c, i) => {
    const d = deriveAttempt({ claimPresent: true, eventsText: logs[i], callId: CALL });
    for (const k of ["claimState", "dispatch", "result", "actuallySent", "dispatchUndetermined", "serverAnswered", "automaticRetry"]) assert.equal(d[k], c[k], `case ${i + 1} (${c.case}) — ${k}`);
    assert.equal(d.logConsistent, true);
  });
  const t = deriveAttempt({ claimPresent: true, eventsText: LOGS.dispatchTransport, callId: CALL });
  assert.deepEqual([t.dispatch, t.result, t.actuallySent, t.serverAnswered], ["started", "unknown", 1, false], "a transport error never downgrades a documented dispatch");
  const none = deriveAttempt({ claimPresent: false, eventsText: null, callId: CALL });
  assert.deepEqual([none.claimState, none.dispatch, none.result, none.actuallySent, none.dispatchUndetermined], ["unconsumed", "not-started", "none", 0, 0]);
});

test("the ledger claims no knowledge the log does not give: torn, foreign and inconsistent records", () => {
  const torn = rec(1, "dispatch", {}).slice(0, -1);   // no terminating newline: a torn write
  let d = deriveAttempt({ claimPresent: true, eventsText: torn, callId: CALL });
  assert.deepEqual([d.dispatch, d.result, d.actuallySent, d.dispatchUndetermined, d.damagedLines.length], ["undetermined", "unknown", 0, 1, 1]);
  d = deriveAttempt({ claimPresent: true, eventsText: rec(1, "dispatch", {}) + "{\"v\":1,\"callId\":\"" + CALL + "\",\"seq\":2,\"event\":\"answ", callId: CALL });
  assert.deepEqual([d.dispatch, d.result, d.actuallySent], ["started", "unknown", 1], "a torn answer leaves a documented dispatch with an unknown result");
  d = deriveAttempt({ claimPresent: true, eventsText: formatEvent("D-999-other", 1, "dispatch", {}), callId: CALL });
  assert.equal(d.dispatch, "undetermined", "another call's record is no evidence");
  d = deriveAttempt({ claimPresent: true, eventsText: rec(1, "answer", { httpStatus: 200 }), callId: CALL });
  assert.deepEqual([d.logConsistent, d.dispatch, d.result, d.actuallySent], [false, "undetermined", "unknown", 0], "an answer without a dispatch record is inconsistent, never silently sent");
  d = deriveAttempt({ claimPresent: true, eventsText: rec(1, "stop", {}) + rec(2, "dispatch", {}), callId: CALL });
  assert.equal(d.logConsistent, false); assert.equal(d.dispatch, "undetermined");
  d = deriveAttempt({ claimPresent: false, eventsText: rec(1, "dispatch", {}), callId: CALL });
  assert.equal(d.logConsistent, false, "records without a claim are inconsistent");
  assert.throws(() => formatEvent(CALL, 1, "retry", {}), /unknown event/);
  assert.throws(() => formatEvent(CALL, 1, "answer", {}), /httpStatus/);
  assert.deepEqual([...LEDGER_EVENTS], ["dispatch", "stop", "answer", "transport-error"]);
  assert.equal(parseEvents(LOGS.dispatchResponse, CALL).records.length, 2);
  for (const t of Object.values(LOGS)) assert.equal(deriveAttempt({ claimPresent: true, eventsText: t, callId: CALL }).automaticRetry, false);
});

// ── sandbox: a temporary git repository per scenario ────────────────────────────────────────────────────────────

const SANDBOX_ROOTS = [];
after(() => {
  // Removes ONLY sandboxes this run created: mkdtemp directories inside temp with this suite's prefix.
  for (const root of SANDBOX_ROOTS) if (isInside(root, realpathSync.native(tmpdir())) && /d160-sandbox-/.test(root)) rmSync(root, { recursive: true, force: true });
});

const MOCK_SRC = [
  "// D-160 test mock: replaces globalThis.fetch (and, for the crash windows, node:fs) for one child process. Refuses to load unconfigured.",
  "import fs, { appendFileSync, existsSync, readFileSync, writeFileSync } from \"node:fs\";",
  "import { syncBuiltinESMExports } from \"node:module\";",
  "import { resolve } from \"node:path\";",
  "const LOG = process.env.D160_MOCK_LOG, MODE = process.env.D160_MOCK_MODE, CLAIM = process.env.D160_MOCK_CLAIM, EVENTS = process.env.D160_MOCK_EVENTS,",
  "  PNG = process.env.D160_MOCK_PNG, BODY = process.env.D160_MOCK_BODY;",
  "if (!LOG || !MODE || !CLAIM || !EVENTS || !PNG || !BODY) throw new Error(\"d160 mock: not configured — refusing to run\");",
  "const KEY = \"sk-d160-sandbox-dummy-key-not-a-credential\";",
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
  "globalThis.fetch = async function d160MockFetch(url, init) {",
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

const TRACKED = [ADAPTER_REL, LEDGER_REL, CHECKER_REL, REGISTER_REL, CONTRACT_REL, PROMPT_REL, NORTHSTAR_REL];

/** A face-feature-like RGBA output: a small solid block inside the broad envelope; optionally one stray pixel outside it. */
function outputPng({ outside }) {
  const w = 1024, h = 1536, px = Buffer.alloc(w * h * 4, 0);
  for (let y = 345; y < 365; y++) for (let x = 480; x < 530; x++) px.set([90, 60, 50, 255], (y * w + x) * 4);
  if (outside) px.set([90, 60, 50, 255], (10 * w + 10) * 4);
  return encodePngRGBA(w, h, px);
}

function envFor(sb, extra) {
  // An explicit allowlist. Nothing of this process's environment is passed on wholesale.
  const env = {};
  for (const k of ["PATH", "Path", "SystemRoot", "windir", "COMSPEC", "PATHEXT", "SystemDrive"]) if (typeof process.env[k] === "string") env[k] = process.env[k];
  Object.assign(env, { LOCALAPPDATA: sb.state, XDG_STATE_HOME: sb.state, HOME: sb.home, USERPROFILE: sb.home, TEMP: sb.tmp, TMP: sb.tmp, TMPDIR: sb.tmp,
    HTTP_PROXY: "http://127.0.0.1:9", HTTPS_PROXY: "http://127.0.0.1:9", NO_PROXY: "", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: sb.gitconfig,
    D160_MOCK_LOG: sb.log, D160_MOCK_MODE: "ok", D160_MOCK_CLAIM: sb.claim, D160_MOCK_EVENTS: sb.events, D160_MOCK_PNG: sb.png, D160_MOCK_BODY: sb.body }, extra || {});
  return env;
}

function sgit(sb, args) {
  const r = spawnSync("git", ["-C", sb.repo, "-c", "user.name=d160-sandbox", "-c", "user.email=sandbox@example.invalid", "-c", "core.autocrlf=false", ...args],
    { env: envFor(sb), encoding: "utf8", windowsHide: true });
  if (r.status !== 0) throw new Error("sandbox git " + args.join(" ") + ": " + r.stderr);
  return r.stdout.trim();
}

const contractPath = (sb) => join(sb.repo, ...CONTRACT_REL.split("/"));
const registerPath = (sb) => join(sb.repo, ...REGISTER_REL.split("/"));
const editContract = (sb, fn) => { const c = JSON.parse(readFileSync(contractPath(sb), "utf8")); fn(c); writeFileSync(contractPath(sb), JSON.stringify(c, null, 2) + "\n"); };
const D160_ROW = "| **D-160** | SANDBOX TEST ROW — not a decision. " + SPEC.toBeAddedByTheOwnerDecision.registerRowMustName.join(" · ") + " |";

/** Writes the D-160 authorisation — exactly the inert objects of the specification — into the sandbox's files. */
function authorise(sb, { entry = (e) => e, impl = (x) => x, row = D160_ROW } = {}) {
  editContract(sb, (c) => {
    c.authorisedCalls.calls.push(entry(structuredClone(SPEC.toBeAddedByTheOwnerDecision.authorisedCallsEntry)));
    const x = impl(structuredClone(SPEC.toBeAddedByTheOwnerDecision.adapterImplementationsEntry));
    if (x) c.adapterImplementations.entries.push(x);
  });
  if (row !== null) {
    const lines = readFileSync(registerPath(sb), "utf8").split("\n");
    const at = lines.findIndex((l) => l.startsWith("| **D-159** |"));
    lines.splice(at + 1, 0, row);
    writeFileSync(registerPath(sb), lines.join("\n"));
  }
}

/**
 * A fresh sandbox repository. `base` edits the files that become origin/main. `layout` decides where HEAD is:
 *   "main"      HEAD = origin/main on refs/heads/main (the only layout that can send)
 *   "worktree"  origin/main = the live state; `top` is applied to the working tree and NOT committed
 *   "branch"    `top` is committed on a local branch on top of origin/main
 *   "detached"  `top` is committed on a detached HEAD on top of origin/main
 */
function sandbox({ base, layout = "main", top } = {}) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "d160-sandbox-")));
  SANDBOX_ROOTS.push(root);
  const sb = { root, repo: join(root, "repo"), state: join(root, "state"), tmp: join(root, "tmp"), home: join(root, "home"), log: join(root, "fetch.log"),
    gitconfig: join(root, "gitconfig"), png: join(root, "mock-output.png"), body: join(root, "mock-body.json"), mock: join(root, "mock.mjs") };
  const reg = join(sb.state, "DenSejeApp", "one-shot-claims", "Moeller888-den-seje-app-frontend");
  sb.claim = join(reg, CLAIM_FILE); sb.events = join(reg, EVENTS_FILE);
  for (const d of [sb.repo, sb.state, sb.tmp, sb.home]) mkdirSync(d, { recursive: true });
  writeFileSync(sb.gitconfig, "[core]\n\tautocrlf = false\n[init]\n\tdefaultBranch = main\n");
  writeFileSync(sb.mock, MOCK_SRC);
  writeFileSync(sb.log, "");
  writeFileSync(sb.png, outputPng({ outside: false }));
  writeFileSync(sb.png + ".outside.png", outputPng({ outside: true }));
  for (const rel of [...TRACKED, ".gitignore"]) { const dst = join(sb.repo, ...rel.split("/")); mkdirSync(dirname(dst), { recursive: true }); copyFileSync(repoFile(rel), dst); }
  if (base) base(sb);
  sgit(sb, ["init", "-q", "-b", "main"]);
  sgit(sb, ["add", "-A"]);
  sgit(sb, ["commit", "-q", "-m", "base"]);
  sgit(sb, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  if (layout === "worktree") top(sb);
  else if (layout === "branch" || layout === "detached") {
    if (layout === "branch") sgit(sb, ["checkout", "-q", "-b", "local-d160"]); else sgit(sb, ["checkout", "-q", "--detach"]);
    top(sb); sgit(sb, ["add", "-A"]); sgit(sb, ["commit", "-q", "-m", "D-160 not merged"]);
  }
  return sb;
}

function runAdapter(sb, args, extra) {
  // the env is built from an allowlist at this call site; the real key never reaches the child
  const r = spawnSync(process.execPath, ["--import", pathToFileURL(sb.mock).href, join(sb.repo, ...ADAPTER_REL.split("/")), ...args],
    { cwd: sb.repo, env: envFor(sb, extra), encoding: "utf8", windowsHide: true, timeout: 120000 });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
const fetchLog = (sb) => readFileSync(sb.log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const outDir = (sb) => join(sb.repo, "tools", "avatar", "build", "r3-face-neutral-d160");
const outFile = (sb, n) => join(outDir(sb), "r3-face-neutral-d160." + n);
const KEY_ENV = { OPENAI_API_KEY: DUMMY_KEY };
const onDisk = (sb) => deriveAttempt({ claimPresent: existsSync(sb.claim), eventsText: existsSync(sb.events) ? readFileSync(sb.events, "utf8") : null, callId: CALL });
const BAD_GUIDE = () => { const p = join(mkdtempSync(join(tmpdir(), "d160-sandbox-")), "not-the-guide.png"); SANDBOX_ROOTS.push(dirname(p)); writeFileSync(p, outputPng({ outside: false })); return p; };

function assertRefusedBeforeClaim(sb, r, stage) {
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, new RegExp("REFUSED \\[" + stage.replace(/[-[\]]/g, "\\$&") + "\\]"), r.out);
  assert.equal(existsSync(sb.claim), false, "no claim");
  assert.equal(existsSync(sb.events), false, "no event log");
  assert.equal(fetchLog(sb).length, 0, "no fetch");
  assert.equal(existsSync(outDir(sb)), false, "no output");
}

test("isolation is proven first: every derived path is inside the sandbox, and the mock refuses to run unconfigured", () => {
  const sb = sandbox();
  for (const p of [sb.repo, sb.state, sb.tmp, sb.claim, sb.events, sb.log]) assert.ok(isInside(p, sb.root), p);
  const env = envFor(sb, KEY_ENV);
  assert.equal(env.OPENAI_API_KEY, DUMMY_KEY);
  for (const k of ["LOCALAPPDATA", "XDG_STATE_HOME", "TEMP", "TMP", "TMPDIR"]) assert.ok(isInside(env[k], sb.root), k);
  const r = spawnSync(process.execPath, ["--import", pathToFileURL(sb.mock).href, "-e", "0"], { env: { PATH: env.PATH || "", SystemRoot: env.SystemRoot || "" }, encoding: "utf8" });
  assert.notEqual(r.status, 0); assert.match(r.stderr, /not configured/);
});

// ── refusals before the claim that need no guide ─────────────────────────────────────────────────────────────────

test("THE LIVE STATE CANNOT SEND: origin/main as it is today is refused before any claim, dry run and send alike", () => {
  const sb = sandbox();
  const dry = runAdapter(sb, [...GOOD_ARGS, "--guide", BAD_GUIDE()]);
  assertRefusedBeforeClaim(sb, dry, "register");
  assert.match(dry.out, /D-160 appears 0 times/);
  assertRefusedBeforeClaim(sb, runAdapter(sb, [...GOOD_ARGS, ...SEND, "--guide", BAD_GUIDE()], KEY_ENV), "register");
});

test("an authorisation only in the working tree (not committed, not in origin/main) is refused before the claim", () => {
  const sb = sandbox({ layout: "worktree", top: (s) => authorise(s) });
  assertRefusedBeforeClaim(sb, runAdapter(sb, [...GOOD_ARGS, ...SEND, "--guide", BAD_GUIDE()], KEY_ENV), "blob-divergence");
});

test("an authorisation committed on a local branch, or on a detached HEAD on top of origin/main, is refused before the claim", () => {
  const branch = sandbox({ layout: "branch", top: (s) => authorise(s) });
  assertRefusedBeforeClaim(branch, runAdapter(branch, [...GOOD_ARGS, ...SEND, "--guide", BAD_GUIDE()], KEY_ENV), "branch");
  const detached = sandbox({ layout: "detached", top: (s) => authorise(s) });
  assertRefusedBeforeClaim(detached, runAdapter(detached, [...GOOD_ARGS, ...SEND, "--guide", BAD_GUIDE()], KEY_ENV), "head-not-origin-main");
});

test("with the authorisation in origin/main, the checks pass up to the guide — a wrong guide is refused there, before the key is even read", () => {
  const sb = sandbox({ base: (s) => authorise(s) });
  const r = runAdapter(sb, [...GOOD_ARGS, ...SEND, "--guide", BAD_GUIDE()]);   // no key in the environment
  assertRefusedBeforeClaim(sb, r, "guide");
  assert.match(r.out, /authorisation : exactly one active, unspent D-160-r3-face-neutral-v1 entry/);
  assertRefusedBeforeClaim(sb, runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV), "guide");
  assertRefusedBeforeClaim(sb, runAdapter(sb, [...GOOD_ARGS, ...SEND, "--guide", join(sb.root, "missing.png")], KEY_ENV), "guide");
});

for (const [label, args] of [
  ["a wrong call-id", ["--call-id=D-160-r3-face-neutral-v2", "--claim-identity=" + CLAIM_ID, ...SEND]],
  ...SPENT_IDS.map((id) => ["the spent call-id " + id, ["--call-id=" + id, "--claim-identity=" + CLAIM_ID, ...SEND]]),
  ["a spent claim identity", ["--call-id=" + CALL, "--claim-identity=D-153-r3-head-colour-u1-opaque-v1-claim", ...SEND]],
  ["a wrong claim identity", ["--call-id=" + CALL, "--claim-identity=D-160-other-claim", ...SEND]],
  ["a missing call-id", ["--claim-identity=" + CLAIM_ID, ...SEND]],
  ["--send without the approval", [...GOOD_ARGS, "--send"]],
  ["the approval without --send", [...GOOD_ARGS, APPROVAL]],
  ["a wrong approval", [...GOOD_ARGS, "--send", "--owner-approval=D-159"]],
  ["a second --send", [...GOOD_ARGS, ...SEND, "--send"]],
  ["--retry", [...GOOD_ARGS, ...SEND, "--retry"]],
  ["--model", [...GOOD_ARGS, ...SEND, "--model=gpt-image-1"]],
  ["--mask", [...GOOD_ARGS, ...SEND, "--mask=x.png"]],
  ["two guides", [...GOOD_ARGS, ...SEND, "--guide=a.png", "--guide=b.png"]],
]) {
  test("refused before the claim: " + label, () => { const sb = sandbox({ base: (s) => authorise(s) }); assertRefusedBeforeClaim(sb, runAdapter(sb, args, KEY_ENV), "arguments"); });
}

test("refused before the claim: an inactive, spent, closed or second permission in origin/main", () => {
  for (const [label, opts] of [
    ["mandate SPENT", { entry: (e) => ({ ...e, mandateState: "SPENT" }) }],
    ["status PREPARED", { entry: (e) => ({ ...e, status: "PREPARED — NOT AUTHORISED" }) }],
    ["already attempted", { entry: (e) => ({ ...e, outcome: "EXECUTED ONCE" }) }],
    ["neverReuse", { entry: (e) => ({ ...e, neverReuse: true }) }],
    ["closed", { entry: (e) => ({ ...e, closedBy: "D-161" }) }],
    ["notAnActivePermission", { entry: (e) => ({ ...e, notAnActivePermission: true }) }],
    ["another decision number", { entry: (e) => ({ ...e, decision: "D-161" }) }],
    ["no implementation entry", { impl: () => null }],
    ["implementation already executed", { impl: (x) => ({ ...x, adapter: { ...x.adapter, status: "IMPLEMENTED — EXECUTED ONCE — SPENT" } }) }],
    ["implementation pins an adapter hash", { impl: (x) => ({ ...x, adapter: { ...x.adapter, sha256: "0".repeat(64) } }) }],
    ["merge read as an instruction", { impl: (x) => ({ ...x, mergeIsNotAnInstruction: false }) }],
  ]) {
    const sb = sandbox({ base: (s) => authorise(s, opts) });
    const r = runAdapter(sb, [...GOOD_ARGS, ...SEND, "--guide", BAD_GUIDE()], KEY_ENV);
    assert.equal(r.status, 1, label + "\n" + r.out);
    assert.match(r.out, /REFUSED \[(authorisation|implementation)\]/, label);
    assert.equal(existsSync(sb.claim), false, label); assert.equal(fetchLog(sb).length, 0, label);
  }
  for (const [label, fn] of [
    ["a second UNSPENT entry", (c) => { c.authorisedCalls.calls.push({ callId: "D-161-other", mandateState: "UNSPENT" }); }],
    ["D-153 reopened", (c) => { c.authorisedCalls.calls.find((e) => e.decision === "D-153").mandateState = "UNSPENT"; }],
    ["the general flag flipped", (c) => { c.meta.authorisesImageRequest = true; }],
    ["two entries for the call", (c) => { c.authorisedCalls.calls.push(structuredClone(c.authorisedCalls.calls.at(-1))); }],
    ["D-159's preparedRequest changed", (c) => { c.faceNeutralPreparation.preparedRequest.parameters.quality = "medium"; }],
  ]) {
    const sb = sandbox({ base: (s) => { authorise(s); editContract(s, fn); } });
    const r = runAdapter(sb, [...GOOD_ARGS, ...SEND, "--guide", BAD_GUIDE()], KEY_ENV);
    assert.equal(r.status, 1, label); assert.match(r.out, /REFUSED \[authorisation\]/, label + "\n" + r.out);
    assert.equal(existsSync(sb.claim), false, label); assert.equal(fetchLog(sb).length, 0, label);
  }
});

test("refused before the claim: any changed pin in the authorisation entry, including the input order", () => {
  for (const [label, entry] of [
    ["model", (e) => ({ ...e, model: "gpt-image-2-2026-04-21" })],
    ["background", (e) => ({ ...e, parameters: { ...e.parameters, background: "opaque" } })],
    ["n = 2", (e) => ({ ...e, parameters: { ...e.parameters, n: 2 } })],
    ["an extra parameter", (e) => ({ ...e, parameters: { ...e.parameters, input_fidelity: "high" } })],
    ["the inputs swapped", (e) => ({ ...e, inputs: [e.inputs[1], e.inputs[0]] })],
    ["the input order swapped", (e) => ({ ...e, inputOrder: ["Image 2", "Image 1"] })],
    ["the guide hash", (e) => ({ ...e, inputs: [{ ...e.inputs[0], sha256: "0".repeat(64) }, e.inputs[1]] })],
    ["the prompt hash", (e) => ({ ...e, prompt: { ...e.prompt, sha256: "0".repeat(64) } })],
    ["a mask in the field order", (e) => ({ ...e, fieldOrder: [...e.fieldOrder, "mask"] })],
    ["mask no longer never-sent", (e) => ({ ...e, neverSentFields: e.neverSentFields.filter((f) => f !== "mask") })],
    ["the claim identity", (e) => ({ ...e, claim: { ...e.claim, identity: "D-160-other-claim" } })],
    ["the adapter file", (e) => ({ ...e, adapter: { file: "tools/avatar/openai-send-r3-head-colour-d153.mjs" } })],
    ["two outputs", (e) => ({ ...e, outputs: { ...e.outputs, count: 2 } })],
    ["no one-fetch binding", (e) => ({ ...e, prohibitions: { ...e.prohibitions, noRetry: "one call" } })],
    ["counted as underlay", (e) => ({ ...e, accounting: { slot: "underlay" } })],
  ]) {
    const sb = sandbox({ base: (s) => authorise(s, { entry }) });
    const r = runAdapter(sb, [...GOOD_ARGS, ...SEND, "--guide", BAD_GUIDE()], KEY_ENV);
    assert.equal(r.status, 1, label); assert.match(r.out, /REFUSED \[authorisation\]/, label + "\n" + r.out);
    assert.equal(existsSync(sb.claim), false, label); assert.equal(fetchLog(sb).length, 0, label);
  }
});

test("refused before the claim: a register row that is missing, doubled or does not name every pin", () => {
  for (const [label, row] of [["no row", null], ["a row without the guide hash", D160_ROW.replace(GUIDE_SHA, "")], ["a row without the adapter", D160_ROW.replace(ADAPTER_REL, "")]]) {
    const sb = sandbox({ base: (s) => authorise(s, { row }) });
    assertRefusedBeforeClaim(sb, runAdapter(sb, [...GOOD_ARGS, ...SEND, "--guide", BAD_GUIDE()], KEY_ENV), "register");
  }
  const twice = sandbox({ base: (s) => { authorise(s); const p = registerPath(s); writeFileSync(p, readFileSync(p, "utf8") + "\n" + D160_ROW + "\n"); } });
  assertRefusedBeforeClaim(twice, runAdapter(twice, [...GOOD_ARGS, ...SEND, "--guide", BAD_GUIDE()], KEY_ENV), "register");
});

test("refused before the claim: a changed prompt or North Star committed to origin/main — the adapter sends only its pinned bytes", () => {
  const prompt = sandbox({ base: (s) => { authorise(s); const p = join(s.repo, ...PROMPT_REL.split("/")); writeFileSync(p, readFileSync(p, "utf8").replace("brow", "brows")); } });
  assertRefusedBeforeClaim(prompt, runAdapter(prompt, [...GOOD_ARGS, ...SEND, "--guide", BAD_GUIDE()], KEY_ENV), "pins");
  const crlf = sandbox({ base: (s) => { authorise(s); const p = join(s.repo, ...PROMPT_REL.split("/")); writeFileSync(p, readFileSync(p, "utf8") + "\n"); } });
  assertRefusedBeforeClaim(crlf, runAdapter(crlf, [...GOOD_ARGS, ...SEND, "--guide", BAD_GUIDE()], KEY_ENV), "pins");
  const ns = sandbox({ base: (s) => { authorise(s); const p = join(s.repo, ...NORTHSTAR_REL.split("/")); const b = readFileSync(p); b[b.length - 20] ^= 0xff; writeFileSync(p, b); } });
  assertRefusedBeforeClaim(ns, runAdapter(ns, [...GOOD_ARGS, ...SEND, "--guide", BAD_GUIDE()], KEY_ENV), "pins");
});

test("refused before the claim: a changed adapter, ledger or checker in the working tree", () => {
  for (const rel of [ADAPTER_REL, LEDGER_REL, CHECKER_REL]) {
    const sb = sandbox({ base: (s) => authorise(s) });
    const p = join(sb.repo, ...rel.split("/")); writeFileSync(p, readFileSync(p, "utf8") + "\n// local edit\n");
    assertRefusedBeforeClaim(sb, runAdapter(sb, [...GOOD_ARGS, ...SEND, "--guide", BAD_GUIDE()], KEY_ENV), "blob-divergence");
  }
});

test("refused before the claim: an existing claim or event log (used or closed mandate), which is never touched", () => {
  for (const which of ["claim", "events"]) {
    const sb = sandbox({ base: (s) => authorise(s) });
    mkdirSync(dirname(sb.claim), { recursive: true }); writeFileSync(sb[which], "{}");
    const before = sha256(readFileSync(sb[which]));
    const r = runAdapter(sb, [...GOOD_ARGS, ...SEND, "--guide", BAD_GUIDE()], KEY_ENV);
    assert.equal(r.status, 1); assert.match(r.out, which === "claim" ? /REFUSED \[claim-exists\]/ : /REFUSED \[events-exist\]/);
    assert.equal(sha256(readFileSync(sb[which])), before, "untouched");
    assert.equal(existsSync(sb[which === "claim" ? "events" : "claim"]), false);
    assert.equal(fetchLog(sb).length, 0);
  }
});

test("refused before the claim: outputs of this call already present", () => {
  for (const n of ["request.json", "image-1.png.partial", "response.json"]) {
    const sb = sandbox({ base: (s) => authorise(s) });
    mkdirSync(outDir(sb), { recursive: true }); writeFileSync(outFile(sb, n), "x");
    const r = runAdapter(sb, [...GOOD_ARGS, ...SEND, "--guide", BAD_GUIDE()], KEY_ENV);
    assert.equal(r.status, 1); assert.match(r.out, /REFUSED \[outputs-not-empty\]/, n);
    assert.equal(existsSync(sb.claim), false); assert.equal(fetchLog(sb).length, 0);
  }
});

// ── with guide A′: the dry run and the mocked send scenarios ────────────────────────────────────────────────────
const NEED_GUIDE = { skip: !GUIDE_OK && "R3_FACE_GUIDE_A_PRIME_PATH (the pinned private guide A′) is not available" };
const G = () => ["--guide", GUIDE_PATH];
const sendSandbox = () => sandbox({ base: (s) => authorise(s) });
const manifest = (sb) => JSON.parse(readFileSync(outFile(sb, "request.json"), "utf8"));
// Every file in the sandbox except the mock, which holds the dummy literal it compares against.
const allSandboxText = (sb) => { const out = []; const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (n === ".git" || p === sb.mock) continue; if (statSync(p).isDirectory()) walk(p); else if (statSync(p).size < 8e6) out.push(readFileSync(p, "latin1")); } }; walk(sb.root); return out.join("\n"); };

test("with guide A′: the dry run passes every check, writes nothing and reads no credential", NEED_GUIDE, () => {
  const sb = sendSandbox();
  const r = runAdapter(sb, [...GOOD_ARGS, ...G()]);
  assert.equal(r.status, 0, r.out); assert.match(r.out, /DRY RUN PASSED/);
  assert.equal(existsSync(sb.claim), false); assert.equal(existsSync(sb.events), false); assert.equal(fetchLog(sb).length, 0); assert.equal(existsSync(outDir(sb)), false);
});

test("with guide A′: a send without a key is refused at the key, after every check and before the claim", NEED_GUIDE, () => {
  const sb = sendSandbox();
  assertRefusedBeforeClaim(sb, runAdapter(sb, [...GOOD_ARGS, ...SEND, ...G()]), "key");
});

test("with guide A′: a normal response — claim, then dispatch record, then ONE fetch; everything stored; through the checks; no candidate", NEED_GUIDE, () => {
  const sb = sendSandbox();
  const r = runAdapter(sb, [...GOOD_ARGS, ...SEND, ...G()], KEY_ENV);
  assert.equal(r.status, 0, r.out);
  const log = fetchLog(sb);
  assert.equal(log.length, 1, "exactly one request");
  const L = log[0];
  assert.equal(L.claimExistedAtCall, true, "the claim existed when the fetch was made");
  const atCall = parseEvents(L.eventsAtCall, CALL).records;
  assert.deepEqual(atCall.map((x) => x.event), ["dispatch"], "the dispatch record — and only it — existed when the fetch was made");
  assert.equal(L.url, "https://api.openai.com/v1/images/edits"); assert.equal(L.method, "POST"); assert.equal(L.redirect, "error"); assert.equal(L.dummyKey, true);
  assert.deepEqual(L.fields, ["model", "image[]", "image[]", "prompt", "size", "quality", "n", "output_format", "background"]);
  assert.deepEqual(L.images, ["input-1-placement-guide-A-prime.png", "Northstar Master v2.png"]);
  assert.deepEqual(L.imageSha, [GUIDE_SHA, NORTHSTAR_SHA], "the ordered inputs are exactly the pinned bytes");
  assert.equal(L.prompt, readFileSync(repoFile(PROMPT_REL), "utf8"), "the exact prompt");
  assert.equal(L.background, "transparent"); assert.equal(L.hasMask, false); assert.equal(L.hasInputFidelity, false);
  const m = manifest(sb);
  assert.deepEqual([m.outcome.classification, m.outcome.stage, m.outcome.fetches, m.outcome.automaticRetry, m.outcome.candidateWritten], ["PASS_TO_VISUAL_REVIEW", "done", 1, false, false]);
  assert.deepEqual([m.accounting.claimState, m.accounting.dispatch, m.accounting.result, m.accounting.actuallySent, m.accounting.dispatchUndetermined, m.accounting.serverAnswered],
    ["consumed", "started", "response", 1, 0, true]);
  assert.equal(m.response.requestId, "req_mockok"); assert.equal(m.images.count, 1); assert.equal(m.slot, "face-neutral (never an underlay call)");
  assert.equal(sha256(readFileSync(outFile(sb, "response.json"))), sha256(readFileSync(sb.body)), "the raw response is stored byte for byte");
  assert.equal(m.response.bodySha256, sha256(readFileSync(sb.body)));
  assert.equal(sha256(readFileSync(outFile(sb, "image-1.png"))), sha256(readFileSync(sb.png)), "the image is stored byte for byte");
  assert.equal(m.images.items[0].sha256, sha256(readFileSync(sb.png)));
  const check = JSON.parse(readFileSync(outFile(sb, "check.json"), "utf8"));
  assert.equal(check.verdict, "PASS_TO_VISUAL_REVIEW"); assert.equal(check.candidateWritten, false);
  assert.deepEqual(readdirSync(outDir(sb)).sort(), ["r3-face-neutral-d160.check.json", "r3-face-neutral-d160.image-1.png", "r3-face-neutral-d160.request.json", "r3-face-neutral-d160.response.json"]);
  assert.deepEqual(parseEvents(readFileSync(sb.events, "utf8"), CALL).records.map((x) => x.event), ["dispatch", "answer"]);
  assert.ok(!allSandboxText(sb).includes(DUMMY_KEY.slice(3)) && !r.out.includes(DUMMY_KEY.slice(3)), "the key appears in no log and no file");
  assert.ok(!JSON.stringify(m).includes(sb.root) && !readFileSync(sb.claim, "utf8").includes(sb.root), "no absolute path is recorded");
  const again = runAdapter(sb, [...GOOD_ARGS, ...SEND, ...G()], KEY_ENV);
  assert.equal(again.status, 1); assert.match(again.out, /REFUSED \[claim-exists\]/);
  assert.equal(fetchLog(sb).length, 1, "the request counter never exceeds one");
});

test("with guide A′: documented dispatch + HTTP error — sent, answered, no image, no retry", NEED_GUIDE, () => {
  const sb = sendSandbox();
  const r = runAdapter(sb, [...GOOD_ARGS, ...SEND, ...G()], { ...KEY_ENV, D160_MOCK_MODE: "http500" });
  assert.equal(r.status, 3, r.out);
  const m = manifest(sb);
  assert.deepEqual([m.outcome.classification, m.response.httpStatus, m.response.requestId], ["HTTP_ERROR", 500, "req_mock500"]);
  assert.deepEqual([m.accounting.dispatch, m.accounting.result, m.accounting.actuallySent, m.accounting.serverAnswered], ["started", "http-error", 1, true]);
  assert.equal(sha256(readFileSync(outFile(sb, "response.json"))), sha256(readFileSync(sb.body)));
  assert.equal(existsSync(outFile(sb, "image-1.png")), false); assert.equal(fetchLog(sb).length, 1);
});

test("with guide A′: documented dispatch + transport error — sent, result UNKNOWN, never downgraded, no retry", NEED_GUIDE, () => {
  const sb = sendSandbox();
  const r = runAdapter(sb, [...GOOD_ARGS, ...SEND, ...G()], { ...KEY_ENV, D160_MOCK_MODE: "throw" });
  assert.equal(r.status, 3, r.out);
  const m = manifest(sb);
  assert.equal(m.outcome.classification, "DISPATCHED_RESULT_UNKNOWN");
  assert.deepEqual([m.accounting.dispatch, m.accounting.result, m.accounting.actuallySent, m.accounting.dispatchUndetermined, m.accounting.serverAnswered], ["started", "unknown", 1, 0, false]);
  assert.equal(runAdapter(sb, [...GOOD_ARGS, ...SEND, ...G()], KEY_ENV).status, 1);
  assert.equal(fetchLog(sb).length, 1);
});

test("with guide A′: a crash inside the network call — the log documents the dispatch, the result stays UNKNOWN", NEED_GUIDE, () => {
  const sb = sendSandbox();
  const r = runAdapter(sb, [...GOOD_ARGS, ...SEND, ...G()], { ...KEY_ENV, D160_MOCK_MODE: "die-in-fetch" });
  assert.equal(r.status, 137, r.out);
  assert.equal(existsSync(outFile(sb, "request.json")), false, "the crash left no manifest");
  const d = onDisk(sb);
  assert.deepEqual([d.claimState, d.dispatch, d.result, d.actuallySent, d.dispatchUndetermined, d.serverAnswered, d.automaticRetry], ["consumed", "started", "unknown", 1, 0, false, false]);
  assert.equal(runAdapter(sb, [...GOOD_ARGS, ...SEND, ...G()], KEY_ENV).status, 1, "no retry");
  assert.equal(fetchLog(sb).length, 1);
});

test("with guide A′: a crash between the claim and the dispatch record — dispatch UNDETERMINED, nothing fetched, no retry", NEED_GUIDE, () => {
  const sb = sendSandbox();
  const r = runAdapter(sb, [...GOOD_ARGS, ...SEND, ...G()], { ...KEY_ENV, D160_MOCK_MODE: "die-at-dispatch" });
  assert.equal(r.status, 137, r.out);
  assert.equal(existsSync(sb.claim), true); assert.equal(existsSync(sb.events), false); assert.equal(fetchLog(sb).length, 0);
  const d = onDisk(sb);
  assert.deepEqual([d.claimState, d.dispatch, d.result, d.actuallySent, d.dispatchUndetermined, d.serverAnswered], ["consumed", "undetermined", "unknown", 0, 1, false],
    "the log cannot prove that no request started, so it is neither sent nor not sent");
  const again = runAdapter(sb, [...GOOD_ARGS, ...SEND, ...G()], KEY_ENV);
  assert.equal(again.status, 1); assert.match(again.out, /REFUSED \[claim-exists\]/);
  assert.equal(fetchLog(sb).length, 0);
});

test("with guide A′: the dispatch record cannot be written — a documented STOP, nothing fetched, no retry", NEED_GUIDE, () => {
  const sb = sendSandbox();
  const r = runAdapter(sb, [...GOOD_ARGS, ...SEND, ...G()], { ...KEY_ENV, D160_MOCK_MODE: "fail-dispatch" });
  assert.equal(r.status, 3, r.out);
  assert.equal(fetchLog(sb).length, 0, "no fetch");
  const m = manifest(sb);
  assert.equal(m.outcome.classification, "NOT_DISPATCHED"); assert.equal(m.outcome.fetches, 0);
  assert.deepEqual([m.accounting.claimState, m.accounting.dispatch, m.accounting.result, m.accounting.actuallySent, m.accounting.dispatchUndetermined], ["consumed", "not-started", "none", 0, 0]);
  assert.deepEqual(parseEvents(readFileSync(sb.events, "utf8"), CALL).records.map((x) => x.event), ["stop"]);
  assert.equal(runAdapter(sb, [...GOOD_ARGS, ...SEND, ...G()], KEY_ENV).status, 1, "a consumed claim excludes a retry even though nothing was sent");
});

test("with guide A′: two images — UNEXPECTED, both kept unchanged, none selected, no check", NEED_GUIDE, () => {
  const sb = sendSandbox();
  const r = runAdapter(sb, [...GOOD_ARGS, ...SEND, ...G()], { ...KEY_ENV, D160_MOCK_MODE: "two" });
  assert.equal(r.status, 0, r.out);
  const m = manifest(sb);
  assert.equal(m.outcome.classification, "UNEXPECTED"); assert.equal(m.images.count, 2);
  assert.equal(sha256(readFileSync(outFile(sb, "image-1.png"))), sha256(readFileSync(sb.png)));
  assert.equal(sha256(readFileSync(outFile(sb, "image-2.png"))), sha256(readFileSync(sb.png + ".outside.png")));
  assert.deepEqual(m.images.items.map((i) => i.sha256), [sha256(readFileSync(sb.png)), sha256(readFileSync(sb.png + ".outside.png"))]);
  assert.equal(existsSync(outFile(sb, "check.json")), false, "no check, no selection"); assert.equal(m.check, null);
  assert.equal(sha256(readFileSync(outFile(sb, "response.json"))), sha256(readFileSync(sb.body)));
});

test("with guide A′: zero images — UNEXPECTED, the raw response kept", NEED_GUIDE, () => {
  const sb = sendSandbox();
  assert.equal(runAdapter(sb, [...GOOD_ARGS, ...SEND, ...G()], { ...KEY_ENV, D160_MOCK_MODE: "zero" }).status, 0);
  const m = manifest(sb);
  assert.equal(m.outcome.classification, "UNEXPECTED"); assert.equal(m.images.count, 0);
  assert.deepEqual(readdirSync(outDir(sb)).sort(), ["r3-face-neutral-d160.request.json", "r3-face-neutral-d160.response.json"]);
});

test("with guide A′: alpha outside the broad envelope — TECHNICAL_REJECT at AUTO-5, the raw image kept, no candidate", NEED_GUIDE, () => {
  const sb = sendSandbox();
  assert.equal(runAdapter(sb, [...GOOD_ARGS, ...SEND, ...G()], { ...KEY_ENV, D160_MOCK_MODE: "outside" }).status, 0);
  const m = manifest(sb);
  assert.equal(m.outcome.classification, "TECHNICAL_REJECT"); assert.equal(m.check.firstFailure, "AUTO-5"); assert.equal(m.outcome.candidateWritten, false);
  assert.equal(sha256(readFileSync(outFile(sb, "image-1.png"))), sha256(readFileSync(sb.png + ".outside.png")), "the raw output is kept unchanged");
  assert.ok(!readdirSync(outDir(sb)).some((n) => /candidate/i.test(n)), "no candidate file");
});

test("with guide A′: two simultaneous processes cannot send two requests", NEED_GUIDE, async () => {
  const sb = sendSandbox();
  const one = () => new Promise((res) => {
    const c = spawn(process.execPath, ["--import", pathToFileURL(sb.mock).href, join(sb.repo, ...ADAPTER_REL.split("/")), ...GOOD_ARGS, ...SEND, ...G()],
      { cwd: sb.repo, env: envFor(sb, { ...KEY_ENV, D160_MOCK_MODE: "slow" }), windowsHide: true });
    let out = ""; c.stdout.on("data", (d) => { out += d; }); c.stderr.on("data", (d) => { out += d; });
    c.on("close", (code) => res({ code, out }));
  });
  const [a, b] = await Promise.all([one(), one()]);
  assert.equal(fetchLog(sb).length, 1, "exactly one request across both processes");
  assert.deepEqual([a.code, b.code].sort(), [0, 1], a.out + "\n----\n" + b.out);
});
