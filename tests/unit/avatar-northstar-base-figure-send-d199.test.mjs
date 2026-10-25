// NORTHSTAR BASE FIGURE — D-199: at most two authorised image calls for D-198's base figure (A, and B as a reserve that only
// opens after A is recorded as rejected), and their separate send adapter, tested without ever reaching the real world.
// Derived from the D-183 suite; the lessons of D-142 and D-145 apply unchanged:
//   · The send adapter is NEVER imported. This file reads its source as text, or runs it as a CLI in a child process inside a
//     TEMPORARY git repository that this file builds per scenario, with its own origin/main.
//   · Every child gets an environment built from an explicit ALLOWLIST: no inherited key, no real LOCALAPPDATA, HOME or
//     USERPROFILE (so the external output directory lies inside the sandbox too), TEMP inside the sandbox. The key is a dummy.
//   · globalThis.fetch is replaced from OUTSIDE by `node --import <mock>`; the mock refuses to load unconfigured.
// The returned images are synthetic technical shapes (a grey ellipse), never a figure.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, readdirSync, statSync, copyFileSync, realpathSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync, spawn } from "node:child_process";
import { join, dirname, relative, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { parseEvents, deriveAttempt } from "../../tools/avatar/r3-face-neutral-attempt-ledger.mjs";
import { encodePng } from "../../tools/avatar/r3-hair-tool.mjs";
import { isOutsideRepo } from "../../tools/avatar/northstar-base-figure.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const repoFile = (rel) => join(REPO, ...rel.split("/"));
const ADAPTER_REL = "tools/avatar/openai-send-northstar-base-figure-d199.mjs";
const LEDGER_REL = "tools/avatar/r3-face-neutral-attempt-ledger.mjs";
const CALLS_REL = "tools/avatar/fixtures/northstar-wardrobe/base-figure-calls-v1.json";
const SPEC_REL = "tools/avatar/fixtures/northstar-wardrobe/base-figure-spec-v1.json";
const PROMPT_REL = "tools/avatar/fixtures/northstar-wardrobe/base-figure-prompt-v1.txt";
const CHECKER_REL = "tools/avatar/northstar-base-figure.mjs";
const REGISTER_REL = "docs/project-state.md";
const NORTHSTAR_REL = "assets/avatar/reference/Northstar Master v2.png";
const SRC = readFileSync(repoFile(ADAPTER_REL), "utf8");
const CODE = SRC.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
const CALLS_FILE = JSON.parse(readFileSync(repoFile(CALLS_REL), "utf8"));
const REGISTER = readFileSync(repoFile(REGISTER_REL), "utf8");
const ROW = REGISTER.split("\n").find((l) => l.startsWith("| **D-199** |"));
const A = { call: "D-199-northstar-base-figure-a", claimId: "D-199-northstar-base-figure-a-claim", approval: "--owner-approval=D-199-A", slot: "a" };
const B = { call: "D-199-northstar-base-figure-b", claimId: "D-199-northstar-base-figure-b-claim", approval: "--owner-approval=D-199-B", slot: "b" };
for (const x of [A, B]) { x.claimFile = x.call + ".claim.json"; x.eventsFile = x.call + ".events.jsonl"; x.args = ["--call-id=" + x.call, "--claim-identity=" + x.claimId]; x.send = ["--send", x.approval]; }
const DUMMY_KEY = "sk-d199-sandbox-dummy-key-not-a-credential";
const PROMPT_SHA = "8076c3d1a6f7fd141af3fbacd9f7a8f21b8aa6bc8d6ead0dd018a2172f61fd99";
const NORTHSTAR_SHA = "3daf32e76bff9a53ec7d25cf148a230073cfd0da6a003d02a23c4292d139ff50";
const MODEL = "gpt-image-2.5-sunburst-2026-09-08";
const D183_ADAPTER_SHA_AT_MAIN = sha256(readFileSync(repoFile("tools/avatar/openai-send-r3-hair-d183.mjs")));

function isInside(child, parent) {
  if (typeof child !== "string" || typeof parent !== "string" || child === "" || parent === "") return false;
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

// ── the decision itself ─────────────────────────────────────────────────────────────────────────────────────────
test("D-199 authorises at most two calls for the base figure: A, and B as a locked reserve with the SAME frozen request", () => {
  assert.equal(CALLS_FILE.decision, "D-199"); assert.equal(CALLS_FILE.meta.authorisesImageRequest, false);
  assert.equal(CALLS_FILE.budget.authorised, 2); assert.equal(CALLS_FILE.budget.actuallySent, 0);
  const [a, b] = CALLS_FILE.authorisedCalls.calls;
  assert.deepEqual([a.slot, a.callId, a.mandateState, b.slot, b.callId, b.mandateState], ["A", A.call, "UNSPENT", "B", B.call, "UNSPENT"]);
  assert.match(b.status, /RESERVE, locked until A is recorded as rejected/);
  assert.deepEqual(b.requiresA.outcomeOneOf, ["TECHNICAL_REJECT", "OWNER_VISUAL_REJECT"]);
  for (const k of ["endpoint", "operation", "model", "parameters", "fieldOrder", "neverSentFields", "inputs", "prompt"]) assert.deepEqual(b[k], a[k], "B sends exactly A's request: " + k);
  assert.equal(a.model, MODEL); assert.deepEqual(a.parameters, { size: "1024x1536", quality: "high", n: 1, output_format: "png", background: "transparent" });
  assert.deepEqual(a.inputs.map((i) => i.sha256), [NORTHSTAR_SHA]); assert.equal(a.prompt.sha256, PROMPT_SHA);
  assert.equal(sha256(readFileSync(repoFile(PROMPT_REL))), PROMPT_SHA, "the frozen D-198 prompt is unchanged");
  for (const e of [a, b]) { assert.match(e.outputs.storage, /OUTSIDE both clones \(D-127 §2\)/); assert.match(e.outputHandling.visual, /only by the owner/); }
  assert.ok(!JSON.stringify(CALLS_FILE).includes("fitting-base"), "no H1 anywhere");
  const pilot = JSON.parse(readFileSync(repoFile("tools/avatar/fixtures/northstar-wardrobe/pilot-plan-v2.json"), "utf8"));
  assert.match(pilot.phases[0].status, /AUTHORISED by D-199/); assert.match(pilot.phases.find((p) => p.id === "P2-clothing-pilot").calls, /NOT REQUESTED/);
});
test("the D-199 register row: once, directly after D-198, every pin named, merge is not a run instruction", () => {
  const lines = REGISTER.split("\n"), i = lines.findIndex((l) => l.startsWith("| **D-199** |"));
  assert.equal(lines.filter((l) => l.startsWith("| **D-199** |")).length, 1); assert.ok(lines[i - 1].startsWith("| **D-198** |"));
  for (const v of [A.call, A.claimId, A.claimFile, A.approval, B.call, B.claimId, B.claimFile, B.approval, MODEL, ADAPTER_REL, NORTHSTAR_SHA, PROMPT_SHA, "1024x1536"]) assert.ok(ROW.includes(v), "the row carries " + v);
  assert.match(ROW, /særskilt eksekveringsbesked/); assert.ok(!/Ã|�/.test(ROW), "no mojibake");
});
test("the D-183 adapter is untouched; the D-199 adapter exports nothing and imports only node built-ins and the ledger", () => {
  assert.equal(sha256(readFileSync(repoFile("tools/avatar/openai-send-r3-hair-d183.mjs"))), D183_ADAPTER_SHA_AT_MAIN);
  assert.ok(!/^\s*export\b/m.test(CODE));
  const imports = [...CODE.matchAll(/^\s*import\b[^;]*?from\s+"([^"]+)"/gm)].map((m) => m[1]);
  for (const s of imports) assert.ok(s.startsWith("node:") || s === "./r3-face-neutral-attempt-ledger.mjs", "unexpected import " + s);
  assert.ok(!/\bimport\s*\(/.test(CODE) && !/\brequire\s*\(/.test(CODE));
  assert.ok(!/fitting-base|H1\.png/.test(CODE), "no H1");
});
test("exactly one fetch, with redirect \"error\", not in a loop; no retry, no fallback; git never touches the network", () => {
  assert.equal([...CODE.matchAll(/\bfetch\s*\(/g)].length, 1);
  assert.match(CODE, /globalThis\.fetch\(ENDPOINT, \{ method: "POST", redirect: "error", headers: \{ Authorization: "Bearer " \+ apiKey \}, body: built\.body \}\)/);
  assert.ok(!/["'](fetch|pull|push|remote|ls-remote|clone)["']/.test(CODE));
  const prose = /no retry, no fallback|No outcome permits an automatic retry|there is no fallback|automaticRetry: false|NO RETRY/gi;
  for (const w of ["retry", "maxRetries", "retries", "backoff", "fallback"]) assert.ok(!new RegExp("\\b" + w + "\\b", "i").test(CODE.replace(prose, "")), "no " + w);
});
test("no injection point, no bypass flag; the key is read once, after every check; the order of the checks", () => {
  for (const hook of ["fetchImpl", "claimPath", "registerPath", "contractPath", "gitRef", "specPath"]) assert.ok(!CODE.includes(hook), "no injection point " + hook);
  for (const flag of ["--claim-path", "--force", "--retry", "--reset", "--out", "--ref", "--contract", "--register", "--model", "--mask", "--pin", "--sha", "--size", "--threshold", "--prompt"]) assert.ok(!CODE.includes("\"" + flag), "no CLI flag " + flag);
  const envUses = [...CODE.matchAll(/process\.env(\.[A-Za-z_][A-Za-z0-9_]*|\[[^\]]*\]|\))?/g)].map((m) => m[0]);
  for (const u of envUses) assert.ok(new Set(["process.env.OPENAI_API" + "_KEY", "process.env.LOCALAPPDATA", "process.env.XDG_STATE_HOME", "process.env)"]).has(u), "unexpected environment read " + u);
  assert.equal([...CODE.matchAll(/process\.env\.OPENAI_API_KEY/g)].length, 1);
  const body = CODE.slice(CODE.indexOf("async function main(argv)"));
  let last = -1;
  for (const k of ["parseArgs(argv)", "resolveRefs()", "readOriginBlobs(refs.originSha)", "verifyPins(blobs)", "verifyRegister(blobs.register)", "verifyAuthorisation(parsed.value, call, register.lines)",
    "verifyImplementation(parsed.value, call)", "resolveClaimLocation(call)", "pathExists(loc.claim)", "pathExists(loc.events)", "resolveOutputs(call)", "buildBody(blobs, pins.prompt)",
    "if (!args.sendMode)", "const again = resolveRefs()", "process.env.OPENAI_API" + "_KEY", "claim = createClaim(", "event(\"dispatch\"", "res = await globalThis.fetch(", "receiptProblems("]) { const i = body.indexOf(k); assert.ok(i > last, k + " in order"); last = i; }
  for (const del of ["unlinkSync", "rmSync", "rmdirSync", "truncateSync", "copyFileSync"]) assert.ok(!CODE.includes(del), "must not contain " + del);
  assert.match(CODE, /resolve\(home, "Documents", "DenSejeApp-artefacts", "d-199-northstar-base-figure", call\.slot\.toLowerCase\(\)\)/);
  assert.match(CODE, /if \(isInside\(dir, REPO\)\) return \{ ok: false, why: "the output directory resolves inside the repository/);
  assert.match(SRC, /const FIELD_ORDER = Object\.freeze\(\["model", "image\[\]", "prompt", "size", "quality", "n", "output_format", "background"\]\);/);
  assert.match(SRC, /const PARAMETERS = Object\.freeze\(\{ size: "1024x1536", quality: "high", n: 1, output_format: "png", background: "transparent" \}\);/);
  assert.match(SRC, /const REQUIRED_DECISIONS = Object\.freeze\(\["D-127", "D-159", "D-197", "D-198", "D-199"\]\);/);
});
test("the review tool refuses to write a base figure inside the repository (D-127 §2)", () => {
  assert.equal(isOutsideRepo(join(REPO, "tools", "avatar", "build", "x")), false);
  assert.equal(isOutsideRepo(REPO), false);
  assert.equal(isOutsideRepo(join(REPO, "..", "DenSejeApp-artefacts-test")), true);
  const r = spawnSync(process.execPath, [repoFile(CHECKER_REL), "--review", repoFile(NORTHSTAR_REL), "--out", join(REPO, "tools", "avatar", "build", "d199-refusal-probe")], { env: { PATH: process.env.PATH || "", SystemRoot: process.env.SystemRoot || "" }, encoding: "utf8" });
  assert.equal(r.status, 1); assert.match(r.stderr, /REFUSED: --out is inside the repository/);
  assert.equal(existsSync(join(REPO, "tools", "avatar", "build", "d199-refusal-probe")), false);
});

// ── sandbox: a temporary git repository per scenario ─────────────────────────────────────────────────────────────
const SANDBOX_ROOTS = [];
after(() => { for (const root of SANDBOX_ROOTS) if (isInside(root, realpathSync.native(tmpdir())) && /d199-sandbox-/.test(root)) rmSync(root, { recursive: true, force: true }); });

const MOCK_SRC = [
  "// D-199 test mock: replaces globalThis.fetch for one child process. Refuses to load unconfigured.",
  "import { appendFileSync, existsSync, readFileSync, writeFileSync } from \"node:fs\";",
  "const LOG = process.env.D199_MOCK_LOG, MODE = process.env.D199_MOCK_MODE, CLAIM = process.env.D199_MOCK_CLAIM, EVENTS = process.env.D199_MOCK_EVENTS,",
  "  PNG = process.env.D199_MOCK_PNG, BODY = process.env.D199_MOCK_BODY;",
  "if (!LOG || !MODE || !CLAIM || !EVENTS || !PNG || !BODY) throw new Error(\"d199 mock: not configured — refusing to run\");",
  "const KEY = \"sk-d199-sandbox-dummy-key-not-a-credential\";",
  "globalThis.fetch = async function d199MockFetch(url, init) {",
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
  "  if (MODE === \"throw\") throw new TypeError(\"fetch failed (mock transport error)\");",
  "  const send = (text, status, id) => { writeFileSync(BODY, text); return new Response(text, { status, headers: { \"content-type\": \"application/json\", \"x-request-id\": id } }); };",
  "  if (MODE === \"http500\") return send(JSON.stringify({ error: { type: \"server_error\", code: null, message: \"mock 500\" } }), 500, \"req_mock500\");",
  "  const b64 = readFileSync(PNG + (MODE === \"wrongsize\" ? \".wrongsize.png\" : \"\")).toString(\"base64\");",
  "  const data = MODE === \"two\" ? [{ b64_json: b64 }, { b64_json: b64 }] : [{ b64_json: b64 }];",
  "  return send(JSON.stringify({ created: 1, data, usage: { total_tokens: 1 } }), 200, \"req_mockok\");",
  "};",
].join("\n");

const TRACKED = [ADAPTER_REL, LEDGER_REL, REGISTER_REL, CALLS_REL, SPEC_REL, PROMPT_REL, CHECKER_REL, NORTHSTAR_REL];
/** A technical test shape: one grey ellipse on a transparent 1024x1536 canvas (not a figure). */
function shape(w = 1024, h = 1536) { const px = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (((x + 0.5 - w / 2) / 300) ** 2 + ((y + 0.5 - h / 2) / 600) ** 2 <= 1) px.set([150, 150, 150, 255], (y * w + x) * 4); return encodePng(w, h, px); }
const PNGS = { ok: shape(), wrongsize: shape(1024, 1024) };
function envFor(sb, extra) {
  const env = {};
  for (const k of ["PATH", "Path", "SystemRoot", "windir", "COMSPEC", "PATHEXT", "SystemDrive"]) if (typeof process.env[k] === "string") env[k] = process.env[k];
  Object.assign(env, { LOCALAPPDATA: sb.state, XDG_STATE_HOME: sb.state, HOME: sb.home, USERPROFILE: sb.home, TEMP: sb.tmp, TMP: sb.tmp, TMPDIR: sb.tmp,
    HTTP_PROXY: "http://127.0.0.1:9", HTTPS_PROXY: "http://127.0.0.1:9", NO_PROXY: "", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: sb.gitconfig,
    D199_MOCK_LOG: sb.log, D199_MOCK_MODE: "ok", D199_MOCK_CLAIM: sb.claimA, D199_MOCK_EVENTS: sb.eventsA, D199_MOCK_PNG: sb.png, D199_MOCK_BODY: sb.body }, extra || {});
  return env;
}
function sgit(sb, args) {
  const r = spawnSync("git", ["-C", sb.repo, "-c", "user.name=d199-sandbox", "-c", "user.email=sandbox@example.invalid", "-c", "core.autocrlf=false", ...args], { env: envFor(sb), encoding: "utf8", windowsHide: true });
  if (r.status !== 0) throw new Error("sandbox git " + args.join(" ") + ": " + r.stderr);
  return r.stdout.trim();
}
const callsPath = (sb) => join(sb.repo, ...CALLS_REL.split("/"));
const registerPath = (sb) => join(sb.repo, ...REGISTER_REL.split("/"));
const editCalls = (sb, fn) => { const c = JSON.parse(readFileSync(callsPath(sb), "utf8")); fn(c); writeFileSync(callsPath(sb), JSON.stringify(c, null, 2) + "\n"); };
/** A recorded as rejected by a later decision row (the state in which the reserve B opens). */
const recordARejected = (outcome = "TECHNICAL_REJECT", row = true) => (sb) => {
  editCalls(sb, (c) => { const a = c.authorisedCalls.calls[0]; a.mandateState = "SPENT"; a.outcome = outcome; a.recordedBy = "D-200"; a.neverReuse = true; c.adapterImplementations.entries[0].mandateState = "SPENT"; });
  if (row) writeFileSync(registerPath(sb), readFileSync(registerPath(sb), "utf8") + "| **D-200** | sandbox record: " + A.call + " sent once, " + outcome + ". |\n");
};

function sandbox({ base, layout = "main", top } = {}) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "d199-sandbox-")));
  SANDBOX_ROOTS.push(root);
  const sb = { root, repo: join(root, "repo"), state: join(root, "state"), tmp: join(root, "tmp"), home: join(root, "home"), log: join(root, "fetch.log"),
    gitconfig: join(root, "gitconfig"), png: join(root, "mock-output.png"), body: join(root, "mock-body.json"), mock: join(root, "mock.mjs") };
  const reg = join(sb.state, "DenSejeApp", "one-shot-claims", "Moeller888-den-seje-app-frontend");
  sb.claimA = join(reg, A.claimFile); sb.eventsA = join(reg, A.eventsFile); sb.claimB = join(reg, B.claimFile); sb.eventsB = join(reg, B.eventsFile);
  sb.out = (slot) => join(sb.home, "Documents", "DenSejeApp-artefacts", "d-199-northstar-base-figure", slot);
  for (const d of [sb.repo, sb.state, sb.tmp, sb.home]) mkdirSync(d, { recursive: true });
  writeFileSync(sb.gitconfig, "[core]\n\tautocrlf = false\n[init]\n\tdefaultBranch = main\n");
  writeFileSync(sb.mock, MOCK_SRC); writeFileSync(sb.log, "");
  writeFileSync(sb.png, PNGS.ok); writeFileSync(sb.png + ".wrongsize.png", PNGS.wrongsize);
  for (const rel of [...TRACKED, ".gitignore"]) { const dst = join(sb.repo, ...rel.split("/")); mkdirSync(dirname(dst), { recursive: true }); copyFileSync(repoFile(rel), dst); }
  if (base) base(sb);
  sgit(sb, ["init", "-q", "-b", "main"]); sgit(sb, ["add", "-A"]); sgit(sb, ["commit", "-q", "-m", "base"]); sgit(sb, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  if (layout === "worktree") top(sb);
  else if (layout === "branch") { sgit(sb, ["checkout", "-q", "-b", "local-d199"]); top(sb); sgit(sb, ["add", "-A"]); sgit(sb, ["commit", "-q", "-m", "not merged"]); }
  return sb;
}
function runAdapter(sb, args, extra) {
  const r = spawnSync(process.execPath, ["--import", pathToFileURL(sb.mock).href, join(sb.repo, ...ADAPTER_REL.split("/")), ...args], { cwd: sb.repo, env: envFor(sb, extra), encoding: "utf8", windowsHide: true, timeout: 180000 });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
const fetchLog = (sb) => readFileSync(sb.log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const outFile = (sb, slot, n) => join(sb.out(slot), "d199-base-figure-" + slot + "." + n);
const KEY_ENV = { OPENAI_API_KEY: DUMMY_KEY };
const manifest = (sb, slot = "a") => JSON.parse(readFileSync(outFile(sb, slot, "request.json"), "utf8"));
function assertRefusedBeforeClaim(sb, r, stage) {
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, new RegExp("REFUSED \\[" + stage.replace(/[-[\]]/g, "\\$&") + "\\]"), r.out);
  for (const p of [sb.claimA, sb.eventsA, sb.claimB, sb.eventsB]) assert.equal(existsSync(p), false, "no claim or event log");
  assert.equal(fetchLog(sb).length, 0, "no fetch"); assert.equal(existsSync(join(sb.home, "Documents")), false, "no output");
}
const allSandboxText = (sb) => { const out = []; const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (n === ".git" || p === sb.mock) continue; if (statSync(p).isDirectory()) walk(p); else if (statSync(p).size < 8e6) out.push(readFileSync(p, "latin1")); } }; walk(sb.root); return out.join("\n"); };

test("isolation first: every derived path is inside the sandbox, the outputs outside the sandbox repository, the mock refuses unconfigured", () => {
  const sb = sandbox();
  for (const p of [sb.repo, sb.state, sb.tmp, sb.claimA, sb.claimB, sb.log, sb.out("a"), sb.out("b")]) assert.ok(isInside(p, sb.root), p);
  assert.ok(!isInside(sb.out("a"), sb.repo), "the external output lies outside the repository");
  const r = spawnSync(process.execPath, ["--import", pathToFileURL(sb.mock).href, "-e", "0"], { env: { PATH: process.env.PATH || "", SystemRoot: process.env.SystemRoot || "" }, encoding: "utf8" });
  assert.notEqual(r.status, 0); assert.match(r.stderr, /not configured/);
});
test("THE LIVE D-199 STATE: A's dry run passes with the real pins and NO credential, writes nothing; B is locked as a reserve", () => {
  const sb = sandbox();
  const r = runAdapter(sb, A.args);
  assert.equal(r.status, 0, r.out); assert.match(r.out, /DRY RUN PASSED/);
  assert.match(r.out, new RegExp("Image 1 North Star " + NORTHSTAR_SHA + " \\(the only image\\) · prompt " + PROMPT_SHA + " · size 1024x1536 · background transparent"));
  assert.equal(existsSync(sb.claimA) || existsSync(sb.eventsA) || existsSync(join(sb.home, "Documents")), false); assert.equal(fetchLog(sb).length, 0);
  const rb = runAdapter(sb, B.args); assertRefusedBeforeClaim(sb, rb, "authorisation"); assert.match(rb.out, /B is a RESERVE: A must be SPENT and recorded first/);
  assertRefusedBeforeClaim(sb, runAdapter(sb, [...B.args, ...B.send], KEY_ENV), "authorisation");
});
test("arguments: a call id with the other call's claim or approval, or an approval without --send, is refused", () => {
  const sb = sandbox();
  assertRefusedBeforeClaim(sb, runAdapter(sb, ["--call-id=" + A.call, "--claim-identity=" + B.claimId]), "arguments");
  assertRefusedBeforeClaim(sb, runAdapter(sb, [...A.args, "--send", B.approval], KEY_ENV), "arguments");
  assertRefusedBeforeClaim(sb, runAdapter(sb, [...A.args, A.approval], KEY_ENV), "arguments");
  assertRefusedBeforeClaim(sb, runAdapter(sb, [...A.args, "--send"], KEY_ENV), "arguments");
});
test("an authorisation only on a local branch or only in the working tree is refused before the claim", () => {
  const branch = sandbox({ layout: "branch", top: (s) => editCalls(s, (c) => { c.authorisedCalls.calls[0].note = "not merged"; }) });
  assertRefusedBeforeClaim(branch, runAdapter(branch, [...A.args, ...A.send], KEY_ENV), "branch");
  const wt = sandbox({ layout: "worktree", top: (s) => editCalls(s, (c) => { c.authorisedCalls.calls[0].note = "local"; }) });
  assertRefusedBeforeClaim(wt, runAdapter(wt, [...A.args, ...A.send], KEY_ENV), "blob-divergence");
});
test("refused before the claim: a missing register row, a changed pin, a second image or a bent field in the entry", () => {
  const none = sandbox({ base: (s) => writeFileSync(registerPath(s), readFileSync(registerPath(s), "utf8").split("\n").filter((l) => !l.startsWith("| **D-199** |")).join("\n")) });
  assertRefusedBeforeClaim(none, runAdapter(none, [...A.args, ...A.send], KEY_ENV), "register");
  for (const bend of [(e) => { e.prompt.sha256 = "0".repeat(64); }, (e) => { e.inputs.push({ ...e.inputs[0], order: 2, role: "Image 2" }); }, (e) => { e.parameters.size = "1024x1024"; },
    (e) => { e.model = "gpt-image-2-2026-04-21"; }, (e) => { e.mandateState = "SPENT"; }, (e) => { e.outputs.dir = "tools/avatar/build/d199"; }]) {
    const sb = sandbox({ base: (s) => editCalls(s, (c) => bend(c.authorisedCalls.calls[0])) });
    assertRefusedBeforeClaim(sb, runAdapter(sb, [...A.args, ...A.send], KEY_ENV), "authorisation");
  }
  const flag = sandbox({ base: (s) => editCalls(s, (c) => { c.meta.authorisesImageRequest = true; }) });
  assertRefusedBeforeClaim(flag, runAdapter(flag, [...A.args, ...A.send], KEY_ENV), "authorisation");
});
test("refused before the claim: a local edit of the adapter, the ledger or the checker; an existing claim; existing outputs", () => {
  for (const rel of [ADAPTER_REL, LEDGER_REL, CHECKER_REL]) {
    const sb = sandbox(); const p = join(sb.repo, ...rel.split("/")); writeFileSync(p, readFileSync(p, "utf8") + "\n// local edit\n");
    assertRefusedBeforeClaim(sb, runAdapter(sb, [...A.args, ...A.send], KEY_ENV), "blob-divergence");
  }
  const c = sandbox(); mkdirSync(dirname(c.claimA), { recursive: true }); writeFileSync(c.claimA, "{}"); const before = sha256(readFileSync(c.claimA));
  const rc = runAdapter(c, [...A.args, ...A.send], KEY_ENV); assert.equal(rc.status, 1); assert.match(rc.out, /REFUSED \[claim-exists\]/); assert.equal(sha256(readFileSync(c.claimA)), before); assert.equal(fetchLog(c).length, 0);
  const o = sandbox(); mkdirSync(o.out("a"), { recursive: true }); writeFileSync(outFile(o, "a", "request.json"), "x");
  const ro = runAdapter(o, [...A.args, ...A.send], KEY_ENV); assert.equal(ro.status, 1); assert.match(ro.out, /REFUSED \[outputs-not-empty\]/); assert.equal(fetchLog(o).length, 0);
});
test("a send without a key is refused at the key, after every check and before the claim", () => {
  const sb = sandbox(); assertRefusedBeforeClaim(sb, runAdapter(sb, [...A.args, ...A.send]), "key");
});

// ── the mocked send, with the PRODUCTION adapter and the REAL tracked pins ─────────────────────────────────────────
test("call A — claim, dispatch record, ONE fetch of exactly the pinned bytes; one image stored OUTSIDE the repository; no retry", () => {
  const sb = sandbox();
  const r = runAdapter(sb, [...A.args, ...A.send], KEY_ENV);
  assert.equal(r.status, 0, r.out);
  const log = fetchLog(sb); assert.equal(log.length, 1); const L = log[0];
  assert.equal(L.claimExistedAtCall, true);
  assert.deepEqual(parseEvents(L.eventsAtCall, A.call).records.map((x) => x.event), ["dispatch"]);
  assert.deepEqual([L.url, L.method, L.redirect, L.dummyKey], ["https://api.openai.com/v1/images/edits", "POST", "error", true]);
  assert.deepEqual(L.fields, ["model", "image[]", "prompt", "size", "quality", "n", "output_format", "background"]);
  assert.deepEqual([L.images, L.imageSha, L.size], [["Northstar Master v2.png"], [NORTHSTAR_SHA], "1024x1536"], "exactly one image, Northstar, with its pinned bytes");
  assert.equal(L.prompt, readFileSync(repoFile(PROMPT_REL), "utf8"), "the frozen prompt, byte for byte");
  assert.deepEqual([L.background, L.hasMask, L.hasInputFidelity], ["transparent", false, false]);
  const m = manifest(sb);
  assert.deepEqual([m.outcome.classification, m.outcome.fetches, m.outcome.automaticRetry, m.outcome.visuallyApproved, m.outcome.tracked, m.outcome.runtimeChanged], ["RECEIVED_FOR_BF_CHECK", 1, false, false, false, false]);
  assert.deepEqual([m.accounting.claimState, m.accounting.dispatch, m.accounting.result, m.accounting.actuallySent, m.accounting.serverAnswered], ["consumed", "started", "response", 1, true]);
  assert.match(m.storage, /outside both clones \(D-127 §2\)/);
  assert.equal(sha256(readFileSync(outFile(sb, "a", "response.json"))), sha256(readFileSync(sb.body)));
  assert.equal(sha256(readFileSync(outFile(sb, "a", "image-1.png"))), sha256(readFileSync(sb.png)), "the image is stored byte for byte");
  assert.deepEqual(readdirSync(sb.out("a")).sort(), ["d199-base-figure-a.image-1.png", "d199-base-figure-a.receipt.json", "d199-base-figure-a.request.json", "d199-base-figure-a.response.json"]);
  assert.equal(sgit(sb, ["status", "--porcelain"]), "", "nothing was written into the repository");
  assert.ok(!allSandboxText(sb).includes(DUMMY_KEY.slice(3)) && !r.out.includes(DUMMY_KEY.slice(3)), "the key appears nowhere");
  const again = runAdapter(sb, [...A.args, ...A.send], KEY_ENV);
  assert.equal(again.status, 1); assert.match(again.out, /REFUSED \[claim-exists\]/); assert.equal(fetchLog(sb).length, 1);
});
test("a wrong-size image is a TECHNICAL_REJECT kept unchanged; HTTP and transport errors are sent once, never retried", () => {
  const w = sandbox(); assert.equal(runAdapter(w, [...A.args, ...A.send], { ...KEY_ENV, D199_MOCK_MODE: "wrongsize" }).status, 0);
  assert.equal(manifest(w).outcome.classification, "TECHNICAL_REJECT"); assert.ok(existsSync(outFile(w, "a", "image-1.png")));
  assert.equal(runAdapter(w, [...A.args, ...A.send], KEY_ENV).status, 1); assert.equal(fetchLog(w).length, 1);
  for (const [mode, cls] of [["http500", "HTTP_ERROR"], ["throw", "DISPATCHED_RESULT_UNKNOWN"]]) {
    const sb = sandbox(); assert.equal(runAdapter(sb, [...A.args, ...A.send], { ...KEY_ENV, D199_MOCK_MODE: mode }).status, 3, mode);
    assert.equal(manifest(sb).outcome.classification, cls);
    const d = deriveAttempt({ claimPresent: existsSync(sb.claimA), eventsText: readFileSync(sb.eventsA, "utf8"), callId: A.call }); assert.equal(d.actuallySent, 1, mode);
    assert.equal(runAdapter(sb, [...A.args, ...A.send], KEY_ENV).status, 1, "no retry after " + mode); assert.equal(fetchLog(sb).length, 1);
  }
  const two = sandbox(); assert.equal(runAdapter(two, [...A.args, ...A.send], { ...KEY_ENV, D199_MOCK_MODE: "two" }).status, 0);
  assert.deepEqual([manifest(two).outcome.classification, manifest(two).images.count, manifest(two).receipt], ["UNEXPECTED", 2, null]);
});
test("two simultaneous processes cannot send call A twice", async () => {
  const sb = sandbox();
  const one = () => new Promise((res) => { const c = spawn(process.execPath, ["--import", pathToFileURL(sb.mock).href, join(sb.repo, ...ADAPTER_REL.split("/")), ...A.args, ...A.send],
    { cwd: sb.repo, env: envFor(sb, { ...KEY_ENV, D199_MOCK_MODE: "slow" }), windowsHide: true }); let out = ""; c.stdout.on("data", (d) => { out += d; }); c.stderr.on("data", (d) => { out += d; }); c.on("close", (code) => res({ code, out })); });
  const [a, b] = await Promise.all([one(), one()]);
  assert.equal(fetchLog(sb).length, 1); assert.deepEqual([a.code, b.code].sort(), [0, 1], a.out + "\n----\n" + b.out);
});
test("THE RESERVE: B opens only after A is recorded as rejected in the register; then B sends the same request under its own claim, and A stays closed", () => {
  const unrecorded = sandbox({ base: recordARejected("TECHNICAL_REJECT", false) });
  assertRefusedBeforeClaim(unrecorded, runAdapter(unrecorded, [...B.args, ...B.send], KEY_ENV), "authorisation");
  const passed = sandbox({ base: (s) => { recordARejected()(s); editCalls(s, (c) => { c.authorisedCalls.calls[0].outcome = "RECEIVED_FOR_BF_CHECK"; }); } });
  assertRefusedBeforeClaim(passed, runAdapter(passed, [...B.args, ...B.send], KEY_ENV), "authorisation");
  for (const outcome of ["TECHNICAL_REJECT", "OWNER_VISUAL_REJECT"]) {
    const sb = sandbox({ base: recordARejected(outcome) });
    assert.equal(runAdapter(sb, B.args).status, 0, outcome);
    assertRefusedBeforeClaim(sb, runAdapter(sb, [...A.args, ...A.send], KEY_ENV), "authorisation");
    const r = runAdapter(sb, [...B.args, ...B.send], { ...KEY_ENV, D199_MOCK_CLAIM: sb.claimB, D199_MOCK_EVENTS: sb.eventsB });
    assert.equal(r.status, 0, r.out);
    const L = fetchLog(sb); assert.equal(L.length, 1); assert.equal(L[0].claimExistedAtCall, true);
    assert.deepEqual([L[0].images, L[0].imageSha, L[0].size, L[0].prompt], [["Northstar Master v2.png"], [NORTHSTAR_SHA], "1024x1536", readFileSync(repoFile(PROMPT_REL), "utf8")], "B sends A's frozen request");
    assert.equal(manifest(sb, "b").callId, B.call); assert.equal(existsSync(sb.claimA), false, "B never touches A's claim");
    assert.equal(runAdapter(sb, [...B.args, ...B.send], KEY_ENV).status, 1, "B is one-shot too"); assert.equal(fetchLog(sb).length, 1);
  }
});
