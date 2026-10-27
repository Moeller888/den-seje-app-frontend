// D-218 — the masked-edit experiment's send adapter (tools/avatar/openai-send-northstar-mask-d218.mjs) and its authorisation.
// The static and file tests run everywhere. The mocked sends need C and the three API masks, which are private (D-127 §2: derived
// from C, kept outside both clones); they run only where ITEM_PILOT_C_PATH points at C and the masks exist — skipped in CI, never faked.
// Mock tests prove the adapter, never the model's fit.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, readdirSync, copyFileSync, realpathSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join, dirname, relative, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir, homedir } from "node:os";
import { encodePng } from "../../tools/avatar/r3-hair-tool.mjs";

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = resolve(HERE, "..", "..");
const sha256 = (b) => createHash("sha256").update(b).digest("hex"), repoFile = (rel) => join(REPO, ...rel.split("/"));
const ADAPTER_REL = "tools/avatar/openai-send-northstar-mask-d218.mjs", LEDGER_REL = "tools/avatar/r3-face-neutral-attempt-ledger.mjs", REGISTER_REL = "docs/project-state.md";
const CALLS_REL = "tools/avatar/fixtures/northstar-wardrobe/mask-experiment-calls-v1.json", PLAN_REL = "tools/avatar/fixtures/northstar-wardrobe/mask-experiment-plan-v1.json";
const PROMPTS_REL = "tools/avatar/fixtures/northstar-wardrobe/item-pilot-prompts-v1.json", FREEZE_REL = "tools/avatar/fixtures/northstar-wardrobe/base-figure-c-v1.json", PROC_REL = "tools/avatar/northstar-item-pilot.mjs";
const SRC = readFileSync(repoFile(ADAPTER_REL), "utf8"), CODE = SRC.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
const CALLS = JSON.parse(readFileSync(repoFile(CALLS_REL), "utf8")), PLAN = JSON.parse(readFileSync(repoFile(PLAN_REL), "utf8")), PROMPTS = JSON.parse(readFileSync(repoFile(PROMPTS_REL), "utf8"));
const REGISTER = readFileSync(repoFile(REGISTER_REL), "utf8"), ROW = REGISTER.split("\n").find((l) => l.startsWith("| **D-218** |"));
const C_SHA = "10f4a4b9baf9886e8f230e09b2ab4e69bfebd6795c2a1222eb84f8db3884e818";
const C_PATH = process.env.ITEM_PILOT_C_PATH, C_BUF = C_PATH && existsSync(C_PATH) ? readFileSync(C_PATH) : null;
const MASK_ROOT = join(homedir(), "Documents", "DenSejeApp-artefacts", "d-218-mask-experiment", "masks");
const maskFile = (e) => join(MASK_ROOT, e.mask.dir, "api-mask-" + e.category + ".png");
const HAVE = !!C_BUF && sha256(C_BUF) === C_SHA && CALLS.calls.every((e) => existsSync(maskFile(e)) && sha256(readFileSync(maskFile(e))) === e.mask.sha256);
const SKIP = HAVE ? false : "C and the API masks are private (D-127 §2); set ITEM_PILOT_C_PATH and keep the masks outside the clones to run the mocked sends";
const isInside = (c, p) => { const r = relative(p, c); return r === "" || (!r.startsWith("..") && !isAbsolute(r)); };
const ids = ["D-218-mask-M-1", "D-218-mask-M-2", "D-218-mask-M-3"], argsOf = (id) => ["--call-id=" + id, "--claim-identity=" + id + "-claim"], SEND = ["--send", "--owner-approval=D-218"], KEY = { OPENAI_API_KEY: "sk-d218-sandbox-dummy-key-not-a-credential" };

test("D-218 authorisation: exactly three calls, one per plan case, the D-207 request plus ONE mask field; the token in D-218's status code", () => {
  assert.deepEqual([CALLS.decision, CALLS.meta.authorisesImageRequest, CALLS.budget.authorised, CALLS.budget.reserve, CALLS.budget.actuallySent], ["D-218", false, 3, 0, 3]);
  // the recorded result: M-1 blocked by moderation (no image), M-2 rejected, M-3 sent — every mandate spent
  assert.deepEqual(CALLS.calls.map((e) => [e.mandateState, e.outcome, e.result.httpStatus]), [["SPENT", "HTTP_ERROR_NO_IMAGE", 400], ["SPENT", "TECHNICAL_REJECT", 200], ["SPENT", "SENT_ONCE_GENERATION_OK", 200]]);
  assert.deepEqual(CALLS.calls.map((e) => e.callId), ids); assert.equal(new Set(CALLS.calls.map((e) => e.claim.identity)).size, 3);
  assert.deepEqual(CALLS.request.fieldOrder, ["model", "image[]", "mask", "prompt", "size", "quality", "n", "output_format", "background"]); assert.ok(!CALLS.request.neverSentFields.includes("mask"));
  assert.deepEqual([CALLS.request.model, CALLS.request.parameters], ["gpt-image-2.5-sunburst-2026-09-08", { size: "1024x1536", quality: "high", n: 1, output_format: "png", background: "transparent" }]);
  assert.equal(CALLS.request.image.sha256, C_SHA);
  for (const e of CALLS.calls) { const pc = PLAN.cases.find((c) => c.id === e.case); assert.ok(pc, e.case);
    assert.deepEqual([pc.item, pc.prompt.sha256, pc.mask.sha256, pc.mask.bytes], [e.item, e.prompt.sha256, e.mask.sha256, e.mask.bytes], e.callId);
    assert.equal(e.prompt.sha256, PROMPTS.items[e.item].sha256, "the frozen D-207 prompt, unchanged"); assert.equal(e.mask.tracked, false); }
  assert.ok(ROW && /Status \*\*`[^`]*D-218 MASK EXPERIMENT: 3 CALLS AUTHORISED[^`]*`\*\*/.test(ROW), "the token is a segment of D-218's status code");
  for (const n of [...ids, "--owner-approval=D-218", "gpt-image-2.5-sunburst-2026-09-08", ADAPTER_REL, C_SHA, "a23dbedd9e3d76435dc0abe50930da9225a67c49dfa910da9d5d5741b6a472ce", "1024x1536"]) assert.ok(ROW.includes(n), n);
  assert.ok(!JSON.stringify(CALLS).includes("fitting-base"), "no H1");
});

test("the adapter: no exports, only node built-ins and the ledger, exactly one fetch, no retry, the key once, the mask verified before any claim", () => {
  assert.ok(!/^\s*export\b/m.test(CODE));
  for (const m of CODE.matchAll(/^\s*import\b[^;]*?from\s+"([^"]+)"/gm)) assert.ok(m[1].startsWith("node:") || m[1] === "./r3-face-neutral-attempt-ledger.mjs", m[1]);
  assert.equal([...CODE.matchAll(/\bfetch\s*\(/g)].length, 1);
  const prose = /no retry, no fallback|No outcome permits an automatic retry|there is no fallback|automaticRetry: false|NO RETRY/gi;
  for (const x of ["retry", "retries", "backoff", "fallback"]) assert.ok(!new RegExp("\\b" + x + "\\b", "i").test(CODE.replace(prose, "")), x);
  assert.equal([...CODE.matchAll(/process\.env\.OPENAI_API_KEY/g)].length, 1);
  const body = CODE.slice(CODE.indexOf("async function main(argv)")); let last = -1;
  for (const k of ["parseArgs(argv)", "resolveRefs()", "readOriginBlobs(", "verifyPrompts(blobs)", "readC()", "verifyRegister(", "verifyAuthorisation(", "verifyImplementation(", "readMask(", "resolveClaimLocation(call)", "consumedClaims(loc)", "resolveOutputs(call)", "buildBody(", "if (!args.sendMode)", "process.env.OPENAI_API" + "_KEY", "claim = createClaim(", "event(\"dispatch\"", "res = await globalThis.fetch("]) { const i = body.indexOf(k); assert.ok(i > last, k + " in order"); last = i; }
  assert.match(CODE, /const MAX_CALLS = 3;/); assert.ok(!/fitting-base|H1\.png/.test(CODE));
});

// ── sandbox: a throw-away git repository, a mocked fetch, the private C and masks copied in ─────────────────────────────
const ROOTS = []; after(() => { for (const r of ROOTS) if (isInside(r, realpathSync.native(tmpdir())) && /d218-sandbox-/.test(r)) rmSync(r, { recursive: true, force: true }); });
const MOCK_SRC = [
  "import { appendFileSync, readFileSync } from \"node:fs\"; import { createHash } from \"node:crypto\";",
  "const LOG = process.env.D218_MOCK_LOG, PNG = process.env.D218_MOCK_PNG, MODE = process.env.D218_MOCK_MODE;",
  "if (!LOG || !PNG || !MODE) throw new Error(\"d218 mock: not configured — refusing to run\");",
  "const h = async (f) => createHash(\"sha256\").update(Buffer.from(await f.arrayBuffer())).digest(\"hex\");",
  "globalThis.fetch = async function d218MockFetch(url, init) {",
  "  const b = init.body; appendFileSync(LOG, JSON.stringify({ url: String(url), redirect: init.redirect, fields: [...b.keys()], imageSha: await Promise.all(b.getAll(\"image[]\").map(h)), maskSha: await Promise.all(b.getAll(\"mask\").map(h)), prompt: b.get(\"prompt\"), n: b.get(\"n\") }) + \"\\n\");",
  "  if (MODE === \"throw\") throw new TypeError(\"fetch failed (mock transport error)\");",
  "  return new Response(JSON.stringify({ created: 1, data: [{ b64_json: readFileSync(PNG).toString(\"base64\") }] }), { status: 200, headers: { \"content-type\": \"application/json\", \"x-request-id\": \"req_mockok\" } });",
  "};"].join("\n");
const TRACKED = [ADAPTER_REL, LEDGER_REL, REGISTER_REL, CALLS_REL, PLAN_REL, PROMPTS_REL, FREEZE_REL, PROC_REL];
const shape = () => { const px = new Uint8ClampedArray(1024 * 1536 * 4); for (let i = 0; i < 1024 * 1536; i++) px.set([150, 150, 150, 255], i * 4); return encodePng(1024, 1536, px); };
function envFor(sb, extra) { const env = {}; for (const k of ["PATH", "Path", "SystemRoot", "windir", "COMSPEC", "PATHEXT", "SystemDrive"]) if (typeof process.env[k] === "string") env[k] = process.env[k];
  return Object.assign(env, { LOCALAPPDATA: sb.state, XDG_STATE_HOME: sb.state, HOME: sb.home, USERPROFILE: sb.home, TEMP: sb.tmp, TMP: sb.tmp, TMPDIR: sb.tmp, HTTP_PROXY: "http://127.0.0.1:9", HTTPS_PROXY: "http://127.0.0.1:9",
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: sb.gitconfig, D218_MOCK_LOG: sb.log, D218_MOCK_PNG: sb.png, D218_MOCK_MODE: "ok" }, extra || {}); }
function sgit(sb, args) { const r = spawnSync("git", ["-C", sb.repo, "-c", "user.name=d218-sandbox", "-c", "user.email=sandbox@example.invalid", "-c", "core.autocrlf=false", ...args], { env: envFor(sb), encoding: "utf8", windowsHide: true }); if (r.status !== 0) throw new Error("sandbox git " + args.join(" ") + ": " + r.stderr); return r.stdout.trim(); }
const callsPath = (sb) => join(sb.repo, ...CALLS_REL.split("/")), registerPath = (sb) => join(sb.repo, ...REGISTER_REL.split("/"));
const editCalls = (sb, fn) => { const c = JSON.parse(readFileSync(callsPath(sb), "utf8")); fn(c); writeFileSync(callsPath(sb), JSON.stringify(c, null, 2) + "\n"); };
function sandbox({ base, mask } = {}) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "d218-sandbox-"))); ROOTS.push(root);
  const sb = { root, repo: join(root, "repo"), state: join(root, "state"), tmp: join(root, "tmp"), home: join(root, "home"), log: join(root, "fetch.log"), gitconfig: join(root, "gitconfig"), png: join(root, "out.png"), mock: join(root, "mock.mjs") };
  sb.claimDir = join(sb.state, "DenSejeApp", "one-shot-claims", "Moeller888-den-seje-app-frontend"); sb.out = join(sb.home, "Documents", "DenSejeApp-artefacts", "d-218-mask-experiment");
  for (const d of [sb.repo, sb.state, sb.tmp, sb.home]) mkdirSync(d, { recursive: true });
  writeFileSync(sb.gitconfig, "[core]\n\tautocrlf = false\n[init]\n\tdefaultBranch = main\n"); writeFileSync(sb.mock, MOCK_SRC); writeFileSync(sb.log, ""); writeFileSync(sb.png, shape());
  const cd = join(sb.home, "Documents", "DenSejeApp-artefacts", "d-202-northstar-base-figure"); mkdirSync(cd, { recursive: true }); writeFileSync(join(cd, "d202-base-figure-v2.image-1.png"), C_BUF);
  for (const e of CALLS.calls) { const d = join(sb.out, "masks", e.mask.dir); mkdirSync(d, { recursive: true }); const f = join(d, "api-mask-" + e.category + ".png"); writeFileSync(f, mask && mask[e.callId] ? mask[e.callId] : readFileSync(maskFile(e))); }
  for (const rel of [...TRACKED, ".gitignore"]) { const dst = join(sb.repo, ...rel.split("/")); mkdirSync(dirname(dst), { recursive: true }); copyFileSync(repoFile(rel), dst); }
  editCalls(sb, (c) => { c.budget.actuallySent = 0; delete c.budget.recordedBy; delete c.budget.closed; for (const e of c.calls) { e.mandateState = "UNSPENT"; e.outcome = "NOT YET ATTEMPTED"; delete e.recordedBy; delete e.result; } });
  if (base) base(sb);
  sgit(sb, ["init", "-q", "-b", "main"]); sgit(sb, ["add", "-A"]); sgit(sb, ["commit", "-q", "-m", "base"]); sgit(sb, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  return sb; }
const run = (sb, args, extra) => { const r = spawnSync(process.execPath, ["--import", pathToFileURL(sb.mock).href, join(sb.repo, ...ADAPTER_REL.split("/")), ...args], { cwd: sb.repo, env: envFor(sb, extra), encoding: "utf8", windowsHide: true, timeout: 180000 }); return { status: r.status, out: (r.stdout || "") + (r.stderr || "") }; };
const fetchLog = (sb) => readFileSync(sb.log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
function refused(sb, r, stage) { assert.equal(r.status, 1, r.out); assert.match(r.out, new RegExp("REFUSED \\[" + stage + "\\]"), r.out); assert.equal(fetchLog(sb).length, 0); assert.equal(existsSync(sb.claimDir) && readdirSync(sb.claimDir).length > 0, false); }

test("dry runs pass for all three cases; the one send carries C, the case's mask and its frozen prompt, stored outside the repository, never twice", { skip: SKIP }, () => {
  const sb = sandbox();
  for (const id of ids) { const r = run(sb, argsOf(id)); assert.equal(r.status, 0, r.out); assert.match(r.out, /DRY RUN PASSED/); }
  const e = CALLS.calls[0], r = run(sb, [...argsOf(e.callId), ...SEND], KEY); assert.equal(r.status, 0, r.out);
  const L = fetchLog(sb); assert.equal(L.length, 1);
  assert.deepEqual([L[0].fields, L[0].imageSha, L[0].maskSha, L[0].n, L[0].redirect], [CALLS.request.fieldOrder, [C_SHA], [e.mask.sha256], "1", "error"]);
  assert.equal(L[0].prompt, PROMPTS.items[e.item].prompt);
  assert.ok(existsSync(join(sb.out, e.callId, "d218.image-1.png")) && existsSync(join(sb.out, e.callId, "d218.request.json"))); assert.equal(sgit(sb, ["status", "--porcelain"]), "");
  assert.equal(JSON.parse(readFileSync(join(sb.out, e.callId, "d218.request.json"), "utf8")).request.mask.sha256, e.mask.sha256);
  assert.equal(run(sb, [...argsOf(e.callId), ...SEND], KEY).status, 1); assert.equal(fetchLog(sb).length, 1, "never twice");
  assert.match(run(sb, argsOf(ids[1])).out, /1 of 3 claims consumed/);
});

test("a wrong mask is refused before any claim: altered bytes, a partly transparent mask, a pin with another edit count; no token, no send", { skip: SKIP }, () => {
  const e = CALLS.calls[0], m = Buffer.from(readFileSync(maskFile(e)));
  const altered = sandbox({ mask: { [e.callId]: Buffer.concat([m, Buffer.from([0])]) } }); refused(altered, run(altered, [...argsOf(e.callId), ...SEND], KEY), "mask");
  // a partly transparent mask under a matching pin: the pin follows the file, the format check still refuses it
  const px = new Uint8ClampedArray(1024 * 1536 * 4).fill(255); for (let i = 3; i < px.length; i += 400) px[i] = 128; const soft = Buffer.from(encodePng(1024, 1536, px));
  const planPath = (sb) => join(sb.repo, ...PLAN_REL.split("/"));
  const partial = sandbox({ mask: { [e.callId]: soft }, base: (s) => { editCalls(s, (c) => { c.calls[0].mask.sha256 = sha256(soft); c.calls[0].mask.bytes = soft.length; });
    const pl = JSON.parse(readFileSync(planPath(s), "utf8")); const pc = pl.cases.find((x) => x.id === e.case); pc.mask.sha256 = sha256(soft); pc.mask.bytes = soft.length; writeFileSync(planPath(s), JSON.stringify(pl, null, 2) + "\n"); } });
  const pr = run(partial, [...argsOf(e.callId), ...SEND], KEY); refused(partial, pr, "mask"); assert.match(pr.out, /partly transparent/);
  const count = sandbox({ base: (s) => editCalls(s, (c) => { c.calls[0].mask.editPx += 1; }) }); refused(count, run(count, [...argsOf(e.callId), ...SEND], KEY), "mask");
  const noToken = sandbox({ base: (s) => writeFileSync(registerPath(s), readFileSync(registerPath(s), "utf8").replace("D-218 MASK EXPERIMENT: 3 CALLS AUTHORISED", "D-218 MASK EXPERIMENT: PREPARED")) });
  refused(noToken, run(noToken, [...argsOf(e.callId), ...SEND], KEY), "register");
});

test("an uncertain dispatch is spent and never repeated; three claims are the hard cap", { skip: SKIP }, () => {
  const sb = sandbox(); assert.equal(run(sb, [...argsOf(ids[2]), ...SEND], { ...KEY, D218_MOCK_MODE: "throw" }).status, 3);
  assert.equal(run(sb, [...argsOf(ids[2]), ...SEND], KEY).status, 1); assert.equal(fetchLog(sb).length, 1);
  assert.equal(run(sb, [...argsOf(ids[0]), ...SEND], KEY).status, 0); assert.equal(run(sb, [...argsOf(ids[1]), ...SEND], KEY).status, 0);
  assert.equal(fetchLog(sb).length, 3); for (const id of ids) assert.equal(run(sb, [...argsOf(id), ...SEND], KEY).status, 1); assert.equal(fetchLog(sb).length, 3, "three sends at most");
  const bad = run(sb, ["--call-id=D-218-mask-M-4", "--claim-identity=D-218-mask-M-4-claim"]); assert.equal(bad.status, 1); assert.match(bad.out, /REFUSED \[arguments\]/);
});
