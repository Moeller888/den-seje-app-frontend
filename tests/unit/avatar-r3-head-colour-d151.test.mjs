// D-151 — the ONE R3 head-colour call: its authorisation, its send adapter and its evaluator, tested
// without ever reaching the real world.
//
// The lessons of D-142 and D-145 apply unchanged:
//   · The send adapter is NEVER imported. This file reads its source as text, or runs it as a CLI in a
//     child process inside a TEMPORARY git repository that this file builds per scenario.
//   · Every child gets an environment built from an explicit ALLOWLIST: no inherited key, no real
//     LOCALAPPDATA/XDG_STATE_HOME, and TEMP/TMP/TMPDIR inside the sandbox. The key is a dummy literal.
//   · globalThis.fetch is replaced from OUTSIDE by `node --import <mock>`. The mock refuses to load unless
//     it is configured, never delegates to a real fetch, and logs one line per call. Proxy variables
//     point at a closed local port as a further layer.
//   · No test reads, lists or checks the real claim register or the real build area.
// H1 is external (D-127 §2). Scenarios that must build Image 1 need FITTING_BASE_V1_PATH and are skipped
// without it; every refusal that happens before the inputs stage runs without H1.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, readdirSync, statSync, copyFileSync, realpathSync, rmSync, appendFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync, spawn } from "node:child_process";
import { join, dirname, relative, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { encodePngRGBA } from "../../tools/avatar/build-r2-torso-occlusion-mask.mjs";
import { attemptSend, CALL_ID as PREP_CALL_ID } from "../../tools/avatar/prepare-r3-head-colour-call.mjs";
import { evaluate, FILES as EVAL_FILES } from "../../tools/avatar/evaluate-r3-head-colour-d151.mjs";
import { preD151Contract, PRE_D151_CONTRACT_CANONICAL_SHA256 } from "./avatar-r3-d147-closure.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const repoFile = (rel) => join(REPO, ...rel.split("/"));
const ADAPTER_REL = "tools/avatar/openai-send-r3-head-colour-d151.mjs";
const EVALUATOR_REL = "tools/avatar/evaluate-r3-head-colour-d151.mjs";
const PREP_REL = "tools/avatar/prepare-r3-head-colour-call.mjs";
const SRC = readFileSync(repoFile(ADAPTER_REL), "utf8");
const CODE = SRC.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
const CONTRACT_REL = "tools/avatar/fixtures/r3/r3-shadow-contract-v1.json";
const REGISTER_REL = "docs/project-state.md";
const C = JSON.parse(readFileSync(repoFile(CONTRACT_REL), "utf8"));
const D151 = C.authorisedCalls.calls.find((e) => e.decision === "D-151");

const CALL = "D-151-r3-head-colour-u1-v1";
const CLAIM_ID = "D-151-r3-head-colour-u1-v1-claim";
const CLAIM_FILE = "D-151-r3-head-colour-u1-v1.claim.json";
const DUMMY_KEY = "sk-d151-sandbox-dummy-key-not-a-credential";
const APPROVAL = "--owner-approval=D-151";
const GOOD_ARGS = ["--call-id=" + CALL, "--claim-identity=" + CLAIM_ID, "--underpainting=u1"];
const H1_SHA = "72875565ecd62b542a91156dbcca1399a434fe04634f4e737df71337be0d5af4";
const H1_PATH = process.env.FITTING_BASE_V1_PATH;
const H1_OK = typeof H1_PATH === "string" && existsSync(H1_PATH) && sha256(readFileSync(H1_PATH)) === H1_SHA;
const PINS = {
  "tools/avatar/fixtures/r3-head-colour/r3-head-colour-prompt-v1.md": "21bff18f001ea4ad9d0cdf79766f0f1879f2caf246003ea04c5728c03f8c65de",
  "tools/avatar/fixtures/r3-head-colour/r3-head-colour-api-mask-v2.png": "33790c5decd357aa1c9ec2bcebef60fe941a05826c55ccc81d6d54d31a6eb5d1",
  "tools/avatar/fixtures/r3-head-colour/r3-head-colour-api-context-margin-v1.png": "1bb3ca1b2fa307c023c26ce52f93b989320c0707e2c7d0f10694901788248e03",
  "tools/avatar/fixtures/r3-head-colour/r3-head-colour-preparation-spec-v1.json": "041fb1aec10a271cb1c08a83010bd0df9cc4533dcc3d9aacaec13b461cff1cc5",
  "tools/avatar/fixtures/r3-head-colour/r3-head-underpainting-u1-v1.png": "e67e2cccb25d914dfd016fd1ed3d9d36fa883bfc75457426b59f8d1204ba217d",
  "assets/avatar/reference/Northstar Master v2.png": "3daf32e76bff9a53ec7d25cf148a230073cfd0da6a003d02a23c4292d139ff50",
};
const IMAGE1_SHA = "9fc32bf5f16eacca3646a6a6776367f7577291816f33b7128140032be003bbbb";
const MANIFEST_U1_SHA = "7ece128fad5a63acc5864db2813895e14a1354fbeb63446a0f5b99a40789bbce";

function isInside(child, parent) {
  if (typeof child !== "string" || typeof parent !== "string" || child === "" || parent === "") return false;
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/** The repository modules reachable from a file by static or literal dynamic import. */
function importChain(entryRel) {
  const seen = new Map();
  const walk = (abs) => {
    if (seen.has(abs)) return;
    const s = readFileSync(abs, "utf8"); seen.set(abs, s);
    for (const m of s.matchAll(/(?:import|export)\s[^;]*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)) {
      const t = m[1] || m[2]; if (t.startsWith(".")) walk(resolve(dirname(abs), t));
    }
  };
  walk(repoFile(entryRel));
  return [...seen.entries()].map(([abs, src]) => ({ rel: relative(REPO, abs).split(sep).join("/"), src }));
}
const stripComments = (s) => s.split("\n").filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*")).join("\n");

// ── static: the adapter's shape ──────────────────────────────────────────────────────────────

test("the adapter exports nothing, and imports only node built-ins and the D-149 deterministic code", () => {
  assert.ok(!/^\s*export\b/m.test(CODE), "the send adapter must export nothing, so no test can import its send path");
  const imports = [...CODE.matchAll(/^\s*import\b[^;]*?from\s+"([^"]+)"/gm)].map((m) => m[1]);
  for (const spec of imports) assert.ok(spec.startsWith("node:") || ["./prepare-r3-head-colour-call.mjs", "./build-r2-torso-occlusion-mask.mjs"].includes(spec), "unexpected import " + spec);
  assert.ok(!/\bimport\s*\(/.test(CODE) && !/\brequire\s*\(/.test(CODE), "no dynamic import, no require");
  for (const sdk of ["openai", "undici", "axios", "node-fetch", "got", "node:http", "node:https", "node:net", "node:tls"]) {
    assert.ok(!imports.includes(sdk), "no client library: " + sdk);
  }
});

test("exactly one fetch call site in the whole reachable chain; every other one is unreachable from an import", () => {
  assert.equal([...CODE.matchAll(/\bfetch\s*\(/g)].length, 1, "exactly one fetch call site in the adapter");
  assert.equal([...CODE.matchAll(/globalThis\.fetch\s*\(/g)].length, 1, "and it is globalThis.fetch");
  assert.ok(!/\b(for|while)\s*\([^)]*\)\s*\{[^}]*globalThis\.fetch/.test(CODE), "the fetch is not inside a loop");
  assert.ok(!/["'](fetch|pull|push|remote|ls-remote|clone)["']/.test(CODE), "git is used read-only and never over the network");
  for (const word of ["retry", "maxRetries", "retries", "backoff"]) assert.ok(!new RegExp("\\b" + word + "\\b", "i").test(CODE.replace(/NO RETRY|no retry|retried: false/g, "")), "no " + word);
  const chain = importChain(ADAPTER_REL);
  const withFetch = chain.filter((m) => /\bfetch\s*\(/.test(stripComments(m.src))).map((m) => m.rel).sort();
  assert.deepEqual(withFetch, [ADAPTER_REL, "tools/avatar/fetch-dwebp.mjs"].sort(), "only the adapter and fetch-dwebp contain a fetch call");
  // fetch-dwebp's download lives in main(), and main() runs only when that file itself is the entry point
  const dw = readFileSync(repoFile("tools/avatar/fetch-dwebp.mjs"), "utf8");
  assert.match(dw, /async function main\(\) \{\n[^\n]*\n\s*const res = await fetch\(URL\);/);
  assert.equal([...stripComments(dw).matchAll(/\bmain\(\)/g)].length, 2, "main is defined once and called once");
  assert.match(dw, /if \(invokedDirectly\) \{\n\s*main\(\)/, "and that one call is behind the invokedDirectly guard");
  for (const m of chain) for (const bad of ["node:http", "node:https", "node:net", "node:tls", "undici", "XMLHttpRequest", "WebSocket", "OPENAI_API_KEY"]) {
    if (m.rel === ADAPTER_REL && bad === "OPENAI_API_KEY") continue;
    assert.ok(!stripComments(m.src).includes(bad), m.rel + " must not contain " + bad);
  }
});

test("the adapter has no injection point and reads only the allowed environment", () => {
  for (const hook of ["fetchImpl", "claimPath", "outDir", "registerPath", "contractPath", "gitRef", "fetchModule"]) assert.ok(!CODE.includes(hook), "no injection point " + hook);
  for (const flag of ["--claim-path", "--force", "--retry", "--reset", "--out", "--ref", "--contract", "--register", "--model"]) assert.ok(!CODE.includes(flag), "no CLI flag " + flag);
  const envUses = [...CODE.matchAll(/process\.env(\.[A-Za-z_][A-Za-z0-9_]*|\[[^\]]*\]|\))?/g)].map((m) => m[0]);
  const allowed = new Set(["process.env.OPENAI_API" + "_KEY", "process.env.LOCALAPPDATA", "process.env.XDG_STATE_HOME", "process.env[H1.envVar]", "process.env)"]);
  for (const u of envUses) assert.ok(allowed.has(u), "unexpected environment read: " + u);
  assert.equal([...CODE.matchAll(/process\.env\.OPENAI_API_KEY/g)].length, 1, "the key is read in exactly one place");
  assert.ok(!/console\.(log|error)\([^)]*apiKey/.test(CODE), "the key is never logged");
  assert.ok(!/apiKey[^;\n]*(writeAtomic|createClaim|writeFileSync|manifest\.)/.test(CODE), "the key is never written");
});

test("the adapter deletes nothing; its only exclusive open is the claim; it writes only into the gitignored build area", () => {
  for (const del of ["unlinkSync", "rmSync", "rmdirSync", "unlink(", "rm(", "truncateSync", "ftruncate", "copyFileSync"]) assert.ok(!CODE.includes(del), "must not contain " + del);
  assert.equal([...CODE.matchAll(/openSync\(/g)].length, 1, "one openSync");
  assert.match(CODE, /function createClaim\(file, record\) \{\n[^\n]*\n\s*const fd = openSync\(file, "wx"\);/);
  assert.deepEqual([...CODE.matchAll(/writeFileSync\(([^)]*)\)/g)].map((m) => m[1]), ["partial, data, { flag: \"wx\" }"]);
  assert.match(CODE, /const OUT_DIR = "tools\/avatar\/build\/r3-head-colour-d151";/);
  assert.ok(!/["']assets\//.test(CODE.replace(/path: "assets\/avatar\/reference\/Northstar Master v2\.png"/, "")), "no runtime asset path is ever a target");
  assert.match(readFileSync(repoFile(".gitignore"), "utf8"), /^tools\/avatar\/build\/$/m, "the build area is gitignored");
  const ev = stripComments(readFileSync(repoFile(EVALUATOR_REL), "utf8"));
  assert.match(ev, /const OUT_DIR = "tools\/avatar\/build\/r3-head-colour-d151";/);
  for (const del of ["unlinkSync", "rmSync", "rmdirSync", "copyFileSync", "fetch("]) assert.ok(!ev.includes(del), "the evaluator must not contain " + del);
  assert.ok(!/["']assets\//.test(ev), "the evaluator never targets a runtime asset");
});

test("inside main(), every check precedes the claim, and the one fetch directly follows it", () => {
  const body = CODE.slice(CODE.indexOf("async function main(argv)"));
  const order = ["parseArgs(argv)", "process.env.OPENAI_API" + "_KEY", "resolveRefs()", "verifyAuthorisation()", "verifyPins()", "resolveClaimPath()",
    "pathExists(claimLoc.path)", "outputPaths()", "prepareInputs(", "buildBody(prepared)", "if (!args.sendMode)", "const again = resolveRefs()", "claim = createClaim(", "globalThis.fetch("];
  let last = -1;
  for (const k of order) { const i = body.indexOf(k); assert.ok(i > last, k + " must come after the previous check"); last = i; }
  const between = body.slice(body.indexOf("claim = createClaim("), body.indexOf("globalThis.fetch(") + "globalThis.fetch(".length);
  assert.ok(!/writeAtomic|readFileSync/.test(between), "no I/O but the claim stands between the claim and the fetch");
  assert.equal([...between.matchAll(/\bawait\b/g)].length, 1, "the only await there is the fetch itself");
  assert.match(between, /await globalThis\.fetch\($/, "and it is the fetch");
});

test("the adapter's pins equal the D-151 contract entry, the D-151 register row and the files on disk", () => {
  for (const [rel, want] of Object.entries(PINS)) {
    assert.equal(sha256(readFileSync(repoFile(rel))), want, rel);
    assert.ok(SRC.includes(want), "the adapter pins " + rel);
  }
  assert.ok(D151, "the contract carries the D-151 entry");
  assert.equal(D151.callId, CALL); assert.equal(D151.claim.identity, CLAIM_ID); assert.equal(D151.claim.filename, CLAIM_FILE);
  assert.equal(D151.adapter.file, ADAPTER_REL);
  assert.equal(D151.prompt.fileSha256, PINS["tools/avatar/fixtures/r3-head-colour/r3-head-colour-prompt-v1.md"]);
  assert.equal(D151.mask.sha256, PINS["tools/avatar/fixtures/r3-head-colour/r3-head-colour-api-mask-v2.png"]);
  assert.equal(D151.mask.contextMargin.sha256, PINS["tools/avatar/fixtures/r3-head-colour/r3-head-colour-api-context-margin-v1.png"]);
  assert.equal(D151.preparation.spec.sha256, PINS["tools/avatar/fixtures/r3-head-colour/r3-head-colour-preparation-spec-v1.json"]);
  assert.equal(D151.inputs[0].builtFrom.underpainting.sha256, PINS["tools/avatar/fixtures/r3-head-colour/r3-head-underpainting-u1-v1.png"]);
  assert.equal(D151.inputs[0].builtFrom.underpainting.choice, "U1");
  assert.equal(D151.inputs[0].builtFrom.h1.sha256, H1_SHA);
  assert.equal(D151.inputs[0].sha256, IMAGE1_SHA);
  assert.equal(D151.inputs[1].sha256, PINS["assets/avatar/reference/Northstar Master v2.png"]);
  assert.equal(D151.preparation.requestManifestU1Sha256, MANIFEST_U1_SHA);
  assert.deepEqual(D151.parameters, { n: 1, size: "1024x1536", quality: "high", output_format: "png", background: "transparent" });
  assert.equal(D151.model, "gpt-image-2-2026-04-21"); assert.equal(D151.endpoint, "https://api.openai.com/v1/images/edits");
  for (const v of [CALL, CLAIM_ID, CLAIM_FILE, IMAGE1_SHA, MANIFEST_U1_SHA, D151.prompt.transmittedSha256]) assert.ok(SRC.includes(v), "the adapter pins " + v);
});

// ── the authorisation itself ─────────────────────────────────────────────────────────────────

test("D-151 adds exactly one authorisation: the pre-D-151 contract is reproduced canonically, nothing else changed", () => {
  assert.equal(sha256(JSON.stringify(preD151Contract(C))), PRE_D151_CONTRACT_CANONICAL_SHA256);
  assert.equal(C.authorisedCalls.count, 4);
  assert.deepEqual(C.authorisedCalls.calls.map((e) => e.decision), ["D-139", "D-142", "D-143", "D-151"]);
  assert.equal(C.adapterImplementations.entries.length, 1, "no new implementation entry");
  assert.equal(C.meta.authorisesImageRequest, false, "the general flag stays false");
  assert.ok(!/D-148/.test(JSON.stringify(C)), "the contract still says nothing about D-148");
});

test("D-151's entry is the ONLY live permission, and it is bound to exactly one fetch", () => {
  const live = C.authorisedCalls.calls.filter((e) => e.mandateState === "UNSPENT");
  assert.deepEqual(live.map((e) => e.callId), [CALL]);
  assert.equal(D151.neverReuse, undefined);
  assert.match(D151.prohibitions.noRetry, /Exactly one fetch/);
  assert.match(D151.prohibitions.noRetry, /No automatic or manual retry, no fallback request, no other model/);
  assert.match(D151.claim.furtherAttempt, /NEW owner decision and a NEW claim identity/);
  assert.match(D151.claim.creation, /"wx", IMMEDIATELY before the single fetch/);
  assert.match(D151.claim.spentOn, /unknown network outcome/);
  assert.match(D151.prohibitions.noPromotion, /promotes nothing/);
  assert.match(D151.prohibitions.noRuntimeChange, /R3 stays default OFF/);
  assert.match(D151.prohibitions.noFacialFeatures, /bald, blank and featureless/);
  assert.match(D151.outputs.extraImages, /only data\[0\] is recorded/);
  for (const k of ["raw", "manifest", "candidate", "evaluation"]) assert.ok(D151.outputs[k].startsWith("tools/avatar/build/r3-head-colour-d151/"), k + " stays in the build area");
  const text = C.prohibitions.noImageRequestAuthorised;
  assert.match(text, /holds FOUR entries/);
  assert.match(text, /\(4\) D-151-r3-head-colour-u1-v1 — THE ONLY active send permission/);
});

test("the budget: planned capacity 4 for assets[0] (18-19), actually sent still 3", () => {
  let min = 0, max = 0;
  for (const a of C.assets) { if (typeof a.calls === "number") { min += a.calls; max += a.calls; continue; } const m = /^(\d+)-(\d+)$/.exec(String(a.calls)); min += Number(m[1]); max += Number(m[2]); }
  assert.deepEqual([min, max], [18, 19]);
  assert.equal(C.imageCallBudget.minimum, 18); assert.equal(C.imageCallBudget.maximum, 19);
  assert.equal(C.assets[0].calls, 4);
  assert.equal(C.imageCallBudget.callsPlannedAndAuthorised.underlay, 4);
  assert.equal(C.imageCallBudget.callsPlannedAndAuthorised.derivedBudget, "18-19");
  assert.equal(C.imageCallBudget.callsActuallySentSoFar.underlay, 3, "D-151's call is not counted before it is sent");
  assert.equal(C.imageCallBudget.isAuthorisation, false);
});

test("the D-151 register row exists once, after D-150, and names the call, the claim and every pin", () => {
  const lines = readFileSync(repoFile(REGISTER_REL), "utf8").split("\n");
  const rows = lines.filter((l) => l.startsWith("| **D-151** |"));
  assert.equal(rows.length, 1);
  assert.equal(lines.findIndex((l) => l.startsWith("| **D-151** |")), lines.findIndex((l) => l.startsWith("| **D-150** |")) + 1);
  const row = rows[0];
  for (const needle of [CALL, CLAIM_ID, CLAIM_FILE, H1_SHA, IMAGE1_SHA, MANIFEST_U1_SHA, ADAPTER_REL, ...Object.values(PINS),
    "Præcis én request, ingen retry", "`UNKNOWN_AFTER_FETCH`", "default OFF", "Ingen promotion", "helt ny ejerbeslutning", "U2 kan ikke vælges"]) {
    assert.ok(row.includes(needle), "the D-151 row must carry " + JSON.stringify(needle));
  }
  assert.ok(!/[ÃÂ]\S|\uFFFD/.test(row), "no mojibake in the Danish row");
});

test("the D-149 preparation adapter still cannot send, and R3 is still default OFF with nothing promoted", () => {
  const prep = stripComments(readFileSync(repoFile(PREP_REL), "utf8"));
  assert.ok(!/\bfetch\s*\(/.test(prep), "no fetch in the preparation adapter");
  const r = attemptSend(); assert.equal(r.allowed, false);
  assert.equal(PREP_CALL_ID, "UNASSIGNED", "the preparation adapter keeps no call-id");
  const shipped = [];
  const walk = (dir) => { for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) { if (!["node_modules", ".git", "tools", "tests", "docs", "supabase"].includes(n)) walk(p); } else if (/\.(html|js|mjs|css)$/.test(n)) shipped.push(p); } };
  walk(REPO);
  for (const p of shipped) {
    const s = readFileSync(p, "utf8");
    assert.ok(!/r3-head-colour|openai-send-r3|head-colour-d151/.test(s), relative(REPO, p) + " must not reference the R3 head-colour work");
  }
});

// ── sandbox: a temporary git repository per scenario ─────────────────────────────────────────

const SANDBOX_ROOTS = [];
after(() => {
  // Removes ONLY sandboxes this run created: mkdtemp directories inside temp with this suite's prefix.
  for (const root of SANDBOX_ROOTS) if (isInside(root, realpathSync.native(tmpdir())) && /d151-sandbox-/.test(root)) rmSync(root, { recursive: true, force: true });
});

const MOCK_SRC = [
  "// D-151 test mock: replaces globalThis.fetch for one child process. Refuses to load unconfigured.",
  "import { appendFileSync, existsSync, readFileSync } from \"node:fs\";",
  "const LOG = process.env.D151_MOCK_LOG, MODE = process.env.D151_MOCK_MODE, CLAIM = process.env.D151_MOCK_CLAIM, PNG = process.env.D151_MOCK_PNG;",
  "if (!LOG || !MODE || !CLAIM || !PNG) throw new Error(\"d151 mock: not configured — refusing to run\");",
  "const KEY = \"sk-d151-sandbox-dummy-key-not-a-credential\";",
  "globalThis.fetch = async function d151MockFetch(url, init) {",
  "  const headers = init && init.headers ? init.headers : {};",
  "  const body = init ? init.body : null;",
  "  const fields = body && typeof body.keys === \"function\" ? [...body.keys()] : null;",
  "  const images = body && typeof body.getAll === \"function\" ? body.getAll(\"image[]\").map((f) => f.name) : null;",
  "  appendFileSync(LOG, JSON.stringify({ url: String(url), method: init && init.method, dummyKey: headers.Authorization === \"Bearer \" + KEY,",
  "    claimExistedAtCall: existsSync(CLAIM), fields, images, pid: process.pid }) + \"\\n\");",
  "  if (MODE === \"slow\") await new Promise((r) => setTimeout(r, 1500));",
  "  if (MODE === \"throw\") throw new TypeError(\"fetch failed (mock transport error)\");",
  "  if (MODE === \"http500\") return new Response(JSON.stringify({ error: { type: \"server_error\", code: null, message: \"mock 500\" } }), { status: 500, headers: { \"content-type\": \"application/json\", \"x-request-id\": \"req_mock500\" } });",
  "  const b64 = readFileSync(PNG).toString(\"base64\");",
  "  const data = MODE === \"two\" ? [{ b64_json: b64 }, { b64_json: b64 }] : [{ b64_json: b64 }];",
  "  return new Response(JSON.stringify({ data, usage: { total_tokens: 1 } }), { status: 200, headers: { \"content-type\": \"application/json\", \"x-request-id\": \"req_mockok\" } });",
  "};",
].join("\n");

const SANDBOX_DIRS = ["tools/avatar/fixtures/r3", "tools/avatar/fixtures/r3-head-colour", "tools/avatar/fixtures/r3-head-geometry", "tools/avatar/fixtures/r3-head-edit"];
const SANDBOX_FILES = () => [...new Set([
  ...importChain(ADAPTER_REL).map((m) => m.rel), ...importChain(EVALUATOR_REL).map((m) => m.rel),
  REGISTER_REL, ".gitignore", "assets/avatar/reference/Northstar Master v2.png",
  ...SANDBOX_DIRS.flatMap((d) => readdirSync(repoFile(d)).filter((n) => statSync(join(repoFile(d), n)).isFile()).map((n) => d + "/" + n)),
])];

function envFor(sb, extra) {
  // An explicit allowlist. Nothing of this process's environment is passed on wholesale.
  const env = {};
  for (const k of ["PATH", "Path", "SystemRoot", "windir", "COMSPEC", "PATHEXT", "SystemDrive"]) if (typeof process.env[k] === "string") env[k] = process.env[k];
  Object.assign(env, { LOCALAPPDATA: sb.state, XDG_STATE_HOME: sb.state, HOME: sb.home, USERPROFILE: sb.home, TEMP: sb.tmp, TMP: sb.tmp, TMPDIR: sb.tmp,
    HTTP_PROXY: "http://127.0.0.1:9", HTTPS_PROXY: "http://127.0.0.1:9", NO_PROXY: "", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: sb.gitconfig,
    D151_MOCK_LOG: sb.log, D151_MOCK_MODE: "ok", D151_MOCK_CLAIM: sb.claim, D151_MOCK_PNG: sb.png }, extra || {});
  return env;
}

function sgit(sb, args) {
  const r = spawnSync("git", ["-C", sb.repo, "-c", "user.name=d151-sandbox", "-c", "user.email=sandbox@example.invalid", "-c", "core.autocrlf=false", ...args],
    { env: envFor(sb), encoding: "utf8", windowsHide: true });
  if (r.status !== 0) throw new Error("sandbox git " + args.join(" ") + ": " + r.stderr);
  return r.stdout.trim();
}

/** A fresh sandbox: a git repository with the D-151 inputs as origin/main and one commit on top. */
function sandbox({ mutateBase, onTop = true } = {}) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "d151-sandbox-")));
  SANDBOX_ROOTS.push(root);
  const sb = { root, repo: join(root, "repo"), state: join(root, "state"), tmp: join(root, "tmp"), home: join(root, "home"), log: join(root, "fetch.log"),
    gitconfig: join(root, "gitconfig"), png: join(root, "mock-output.png"), mock: join(root, "mock.mjs") };
  sb.claim = join(sb.state, "DenSejeApp", "one-shot-claims", "Moeller888-den-seje-app-frontend", CLAIM_FILE);
  for (const d of [sb.repo, sb.state, sb.tmp, sb.home]) mkdirSync(d, { recursive: true });
  writeFileSync(sb.gitconfig, "[core]\n\tautocrlf = false\n[init]\n\tdefaultBranch = main\n");
  writeFileSync(sb.mock, MOCK_SRC);
  writeFileSync(sb.log, "");
  writeFileSync(sb.png, encodePngRGBA(1024, 1536, Buffer.alloc(1024 * 1536 * 4, 0x7f)));
  for (const rel of SANDBOX_FILES()) { const dst = join(sb.repo, ...rel.split("/")); mkdirSync(dirname(dst), { recursive: true }); copyFileSync(repoFile(rel), dst); }
  if (mutateBase) mutateBase(sb);
  sgit(sb, ["init", "-q", "-b", "main"]);
  sgit(sb, ["add", "-A"]);
  sgit(sb, ["commit", "-q", "-m", "base"]);
  sgit(sb, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  if (onTop) sgit(sb, ["commit", "-q", "--allow-empty", "-m", "D-151"]);
  return sb;
}

function runAdapter(sb, args, extra) {
  // the env is built from an allowlist at this call site; the real key never reaches the child
  const r = spawnSync(process.execPath, ["--import", pathToFileURL(sb.mock).href, join(sb.repo, ...ADAPTER_REL.split("/")), ...args],
    { cwd: sb.repo, env: envFor(sb, extra), encoding: "utf8", windowsHide: true, timeout: 120000 });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
const fetchLog = (sb) => readFileSync(sb.log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const outDir = (sb) => join(sb.repo, "tools", "avatar", "build", "r3-head-colour-d151");
const KEY_ENV = { OPENAI_API_KEY: DUMMY_KEY };
const SEND = ["--send", APPROVAL];

function assertRefusedBeforeClaim(sb, r, stage) {
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, new RegExp("REFUSED \\[" + stage.replace(/[-[\]]/g, "\\$&") + "\\]"), r.out);
  assert.equal(existsSync(sb.claim), false, "no claim");
  assert.equal(fetchLog(sb).length, 0, "no fetch");
  assert.equal(existsSync(outDir(sb)), false, "no output");
}

test("isolation is proven first: every derived path is inside the sandbox, and the mock refuses to run unconfigured", () => {
  const sb = sandbox();
  for (const p of [sb.repo, sb.state, sb.tmp, sb.claim, sb.log]) assert.ok(isInside(p, sb.root), p);
  const env = envFor(sb, KEY_ENV);
  assert.equal(env.OPENAI_API_KEY, DUMMY_KEY);
  for (const k of ["LOCALAPPDATA", "XDG_STATE_HOME", "TEMP", "TMP", "TMPDIR"]) assert.ok(isInside(env[k], sb.root), k);
  const r = spawnSync(process.execPath, ["--import", pathToFileURL(sb.mock).href, "-e", "0"], { env: { PATH: env.PATH || "", SystemRoot: env.SystemRoot || "" }, encoding: "utf8" });
  assert.notEqual(r.status, 0); assert.match(r.stderr, /not configured/);
});

for (const [label, args, stage] of [
  ["a wrong call-id", ["--call-id=D-151-r3-head-colour-u2-v1", "--claim-identity=" + CLAIM_ID, "--underpainting=u1", ...SEND], "arguments"],
  ["a reused call-id", ["--call-id=D-143-r3-underlay-core-v2", "--claim-identity=" + CLAIM_ID, "--underpainting=u1", ...SEND], "arguments"],
  ["a wrong claim identity", ["--call-id=" + CALL, "--claim-identity=D-151-other-claim", "--underpainting=u1", ...SEND], "arguments"],
  ["U2", ["--call-id=" + CALL, "--claim-identity=" + CLAIM_ID, "--underpainting=u2", ...SEND], "arguments"],
  ["--send without the approval", [...GOOD_ARGS, "--send"], "arguments"],
  ["a wrong approval", [...GOOD_ARGS, "--send", "--owner-approval=D-143"], "arguments"],
  ["an unknown flag", [...GOOD_ARGS, ...SEND, "--retry"], "arguments"],
  ["a second --send", [...GOOD_ARGS, ...SEND, "--send"], "arguments"],
]) {
  test("refused before the claim: " + label, () => { const sb = sandbox(); assertRefusedBeforeClaim(sb, runAdapter(sb, args, KEY_ENV), stage); });
}

test("refused before the claim: no key in send mode", () => { const sb = sandbox(); assertRefusedBeforeClaim(sb, runAdapter(sb, [...GOOD_ARGS, ...SEND]), "key"); });

test("refused before the claim: HEAD is origin/main itself (no committed D-151 state on top)", () => {
  const sb = sandbox({ onTop: false }); assertRefusedBeforeClaim(sb, runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV), "head-not-on-origin-main");
});

test("refused before the claim: an uncommitted change or an untracked file", () => {
  const sb = sandbox(); writeFileSync(join(sb.repo, "stray.txt"), "x");
  assertRefusedBeforeClaim(sb, runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV), "worktree-dirty");
});

test("refused before the claim: a changed prompt (committed) — the adapter cannot change or accept another prompt", () => {
  const sb = sandbox({ mutateBase: (s) => { const p = join(s.repo, "tools", "avatar", "fixtures", "r3-head-colour", "r3-head-colour-prompt-v1.md"); writeFileSync(p, readFileSync(p, "utf8").replace("bald", "bold")); } });
  assertRefusedBeforeClaim(sb, runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV), "pins");
});

test("refused before the claim: a changed input hash (U1, mask)", () => {
  for (const f of ["r3-head-underpainting-u1-v1.png", "r3-head-colour-api-mask-v2.png"]) {
    const sb = sandbox({ mutateBase: (s) => { const p = join(s.repo, "tools", "avatar", "fixtures", "r3-head-colour", f); const b = readFileSync(p); b[b.length - 9] ^= 0xff; writeFileSync(p, b); } });
    assertRefusedBeforeClaim(sb, runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV), "pins");
  }
});

test("refused before the claim: no D-151 register row, or a contract entry that is not UNSPENT", () => {
  const noRow = sandbox({ mutateBase: (s) => { const p = join(s.repo, "docs", "project-state.md"); writeFileSync(p, readFileSync(p, "utf8").split("\n").filter((l) => !l.startsWith("| **D-151** |")).join("\n")); } });
  assertRefusedBeforeClaim(noRow, runAdapter(noRow, [...GOOD_ARGS, ...SEND], KEY_ENV), "authorisation");
  const spent = sandbox({ mutateBase: (s) => { const p = join(s.repo, ...CONTRACT_REL.split("/")); writeFileSync(p, readFileSync(p, "utf8").replace("\"mandateState\": \"UNSPENT\"", "\"mandateState\": \"SPENT\"")); } });
  assertRefusedBeforeClaim(spent, runAdapter(spent, [...GOOD_ARGS, ...SEND], KEY_ENV), "authorisation");
});

test("refused before the claim: an existing claim, which is never touched", () => {
  const sb = sandbox(); mkdirSync(dirname(sb.claim), { recursive: true }); writeFileSync(sb.claim, "{}");
  const before = sha256(readFileSync(sb.claim));
  const r = runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV);
  assert.equal(r.status, 1); assert.match(r.out, /REFUSED \[claim-exists\]/);
  assert.equal(sha256(readFileSync(sb.claim)), before, "the claim is untouched");
  assert.equal(fetchLog(sb).length, 0);
});

test("refused before the claim: outputs already present", () => {
  const sb = sandbox(); mkdirSync(outDir(sb), { recursive: true }); writeFileSync(join(outDir(sb), "r3-head-colour-d151.raw.png"), "x");
  const r = runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV);
  assert.equal(r.status, 1); assert.match(r.out, /REFUSED \[outputs-not-empty\]/);
  assert.equal(existsSync(sb.claim), false); assert.equal(fetchLog(sb).length, 0);
});

test("refused before the claim: no H1", () => { const sb = sandbox(); assertRefusedBeforeClaim(sb, runAdapter(sb, [...GOOD_ARGS, ...SEND], KEY_ENV), "inputs"); });

// ── with H1: the dry run and the mocked send scenarios ───────────────────────────────────────
const NEED_H1 = { skip: !H1_OK && "FITTING_BASE_V1_PATH (the pinned H1) is not available" };
const H1_ARGS = () => ["--h1", H1_PATH];
// Every file in the sandbox except the mock, which holds the dummy literal it compares against.
const allSandboxText = (sb) => { const out = []; const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (n === ".git" || p === sb.mock) continue; if (statSync(p).isDirectory()) walk(p); else if (statSync(p).size < 4e6) out.push(readFileSync(p, "latin1")); } }; walk(sb.root); return out.join("\n"); };

test("with H1: the dry run passes every check, writes nothing and needs no key", NEED_H1, () => {
  const sb = sandbox();
  const r = runAdapter(sb, [...GOOD_ARGS, ...H1_ARGS()]);
  assert.equal(r.status, 0, r.out); assert.match(r.out, /DRY RUN PASSED/);
  assert.match(r.out, new RegExp(IMAGE1_SHA)); assert.match(r.out, new RegExp(MANIFEST_U1_SHA));
  assert.equal(existsSync(sb.claim), false); assert.equal(fetchLog(sb).length, 0); assert.equal(existsSync(outDir(sb)), false);
});

test("with H1: the send writes the claim BEFORE the one fetch, records the output byte for byte, and never leaks the key", NEED_H1, () => {
  const sb = sandbox();
  const r = runAdapter(sb, [...GOOD_ARGS, ...SEND, ...H1_ARGS()], KEY_ENV);
  assert.equal(r.status, 0, r.out);
  const log = fetchLog(sb);
  assert.equal(log.length, 1, "exactly one request");
  assert.equal(log[0].claimExistedAtCall, true, "the claim existed when the fetch was made");
  assert.equal(log[0].url, "https://api.openai.com/v1/images/edits"); assert.equal(log[0].method, "POST"); assert.equal(log[0].dummyKey, true);
  assert.deepEqual(log[0].fields, ["model", "image[]", "image[]", "mask", "prompt", "size", "quality", "n", "output_format", "background"]);
  assert.deepEqual(log[0].images, ["image1-u1.png", "Northstar Master v2.png"]);
  const claim = JSON.parse(readFileSync(sb.claim, "utf8"));
  assert.equal(claim.callId, CALL); assert.equal(claim.claimIdentity, CLAIM_ID); assert.equal(claim.mandate, "SPENT");
  const m = JSON.parse(readFileSync(join(outDir(sb), "r3-head-colour-d151.request.json"), "utf8"));
  assert.deepEqual([m.outcome.classification, m.outcome.stage, m.outcome.fetches, m.outcome.retried], ["RESPONSE_RECEIVED", "done", 1, false]);
  assert.equal(m.request.inputs[0].sha256, IMAGE1_SHA);
  assert.equal(sha256(readFileSync(join(outDir(sb), "r3-head-colour-d151.raw.png"))), sha256(readFileSync(sb.png)), "the raw output is byte-identical");
  assert.ok(!allSandboxText(sb).includes(DUMMY_KEY.slice(3)) && !r.out.includes(DUMMY_KEY.slice(3)), "the key appears in no log and no file");
  assert.ok(!JSON.stringify(m).includes(sb.root) && !JSON.stringify(claim).includes(sb.state), "no absolute path is recorded");
  const again = runAdapter(sb, [...GOOD_ARGS, ...SEND, ...H1_ARGS()], KEY_ENV);
  assert.equal(again.status, 1); assert.match(again.out, /REFUSED \[claim-exists\]/);
  assert.equal(fetchLog(sb).length, 1, "the request counter never exceeds one");
});

test("with H1: an API error leaves the claim spent, one fetch, no retry", NEED_H1, () => {
  const sb = sandbox();
  const r = runAdapter(sb, [...GOOD_ARGS, ...SEND, ...H1_ARGS()], { ...KEY_ENV, D151_MOCK_MODE: "http500" });
  assert.equal(r.status, 3, r.out);
  assert.equal(fetchLog(sb).length, 1); assert.equal(existsSync(sb.claim), true);
  const m = JSON.parse(readFileSync(join(outDir(sb), "r3-head-colour-d151.request.json"), "utf8"));
  assert.deepEqual([m.outcome.classification, m.outcome.stage, m.response.httpStatus], ["RESPONSE_RECEIVED", "http", 500]);
  assert.equal(existsSync(join(outDir(sb), "r3-head-colour-d151.raw.png")), false);
});

test("with H1: an unknown network outcome is UNKNOWN_AFTER_FETCH, the claim stays, and a second run cannot retry", NEED_H1, () => {
  const sb = sandbox();
  const r = runAdapter(sb, [...GOOD_ARGS, ...SEND, ...H1_ARGS()], { ...KEY_ENV, D151_MOCK_MODE: "throw" });
  assert.equal(r.status, 3, r.out);
  const m = JSON.parse(readFileSync(join(outDir(sb), "r3-head-colour-d151.request.json"), "utf8"));
  assert.equal(m.outcome.classification, "UNKNOWN_AFTER_FETCH"); assert.equal(m.outcome.retried, false);
  const again = runAdapter(sb, [...GOOD_ARGS, ...SEND, ...H1_ARGS()], KEY_ENV);
  assert.equal(again.status, 1);
  assert.equal(fetchLog(sb).length, 1);
});

test("with H1: two returned images — only data[0] is recorded", NEED_H1, () => {
  const sb = sandbox();
  const r = runAdapter(sb, [...GOOD_ARGS, ...SEND, ...H1_ARGS()], { ...KEY_ENV, D151_MOCK_MODE: "two" });
  assert.equal(r.status, 0, r.out);
  const m = JSON.parse(readFileSync(join(outDir(sb), "r3-head-colour-d151.request.json"), "utf8"));
  assert.equal(m.response.imagesReturned, 2); assert.equal(m.response.extraImagesIgnored, 1);
  assert.deepEqual(readdirSync(outDir(sb)).filter((n) => n.endsWith(".png")), ["r3-head-colour-d151.raw.png"]);
});

test("with H1: two simultaneous processes cannot send two requests", NEED_H1, async () => {
  const sb = sandbox();
  const one = () => new Promise((res) => {
    const c = spawn(process.execPath, ["--import", pathToFileURL(sb.mock).href, join(sb.repo, ...ADAPTER_REL.split("/")), ...GOOD_ARGS, ...SEND, ...H1_ARGS()],
      { cwd: sb.repo, env: envFor(sb, { ...KEY_ENV, D151_MOCK_MODE: "slow" }), windowsHide: true });
    let out = ""; c.stdout.on("data", (d) => { out += d; }); c.stderr.on("data", (d) => { out += d; });
    c.on("close", (code) => res({ code, out }));
  });
  const [a, b] = await Promise.all([one(), one()]);
  assert.equal(fetchLog(sb).length, 1, "exactly one request across both processes");
  assert.deepEqual([a.code, b.code].sort(), [0, 1], a.out + "\n----\n" + b.out);
});

// ── the evaluator (no network) ───────────────────────────────────────────────────────────────

function evalSandbox(rawPng) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "d151-sandbox-")));
  SANDBOX_ROOTS.push(root);
  for (const rel of SANDBOX_FILES()) { const dst = join(root, ...rel.split("/")); mkdirSync(dirname(dst), { recursive: true }); copyFileSync(repoFile(rel), dst); }
  const dir = join(root, ...EVAL_FILES.raw.split("/").slice(0, -1));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(root, ...EVAL_FILES.raw.split("/")), rawPng);
  writeFileSync(join(root, ...EVAL_FILES.manifest.split("/")), JSON.stringify({ callId: CALL, result: { sha256: sha256(rawPng), bytes: rawPng.length } }));
  return root;
}

test("with H1: the evaluator passes a covering on-palette output, writes the candidate once, and refuses to overwrite", NEED_H1, async () => {
  const { loadAll, buildImage1 } = await import("../../tools/avatar/prepare-r3-head-colour-call.mjs");
  const all = loadAll({ repoRoot: REPO, h1Path: H1_PATH, underpainting: "u1" });
  const img1 = encodePngRGBA(1024, 1536, buildImage1(all.h1, all.up, all.inp));
  assert.equal(sha256(img1), IMAGE1_SHA);
  const root = evalSandbox(img1);
  const r = evaluate({ root, h1Path: H1_PATH });
  assert.match(r.verdict, /^PASSED_ALL_MACHINE_GATES/);
  assert.equal(r.gates.s1.pass, true); assert.ok(r.gates.s1.de00Exact <= 4.5);
  assert.equal(r.gates.alphaEqualsGeometry.value, 0); assert.equal(r.gates.rows425to445BytesVsH1.value, 0); assert.equal(r.gates.residueOutsideGeometry.value, 0);
  for (const v of Object.values(r.gates.coverage)) assert.equal(v.uncovered, 0);
  assert.equal(r.promoted, false); assert.equal(r.runtimeChanged, false);
  assert.ok(existsSync(join(root, ...EVAL_FILES.candidate.split("/"))));
  assert.throws(() => evaluate({ root, h1Path: H1_PATH }), /refusing to overwrite/);
});

test("with H1: the evaluator rejects an off-palette output at S1 and writes no candidate", NEED_H1, async () => {
  const { loadAll, buildImage1 } = await import("../../tools/avatar/prepare-r3-head-colour-call.mjs");
  const all = loadAll({ repoRoot: REPO, h1Path: H1_PATH, underpainting: "u1" });
  const rgba = buildImage1(all.h1, all.up, all.inp);
  for (let p = 0; p < 1024 * 425; p++) if (all.inp.geom[p]) rgba.set([120, 80, 50], p * 4);
  const root = evalSandbox(encodePngRGBA(1024, 1536, rgba));
  const r = evaluate({ root, h1Path: H1_PATH });
  assert.equal(r.verdict, "REJECTED"); assert.equal(r.rejectedAt, "s1.palette");
  assert.equal(existsSync(join(root, ...EVAL_FILES.candidate.split("/"))), false, "no candidate after a rejection");
});
