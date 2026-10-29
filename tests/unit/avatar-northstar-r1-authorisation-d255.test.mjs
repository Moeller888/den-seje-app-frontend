// D-255 — the R1 authorisation: three one-shot calls of r1-plan-v1.json (D-253), its send adapter
// (tools/avatar/openai-send-northstar-r1-d255.mjs), its frozen plan, prompts, canvases, method and acceptance, and the evaluation the
// adapter requires between calls. The static tests run everywhere. The mocked sends need C and the cut canvases, which are private
// (D-127 §2); they run only where ITEM_PILOT_C_PATH points at C and the canvases exist — skipped in CI, never faked. A dummy key and a
// mocked fetch only: the tests prove the adapter, never the model.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, copyFileSync, realpathSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join, dirname, relative, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir, homedir } from "node:os";
import { encodePng } from "../../tools/avatar/r3-hair-tool-v2.mjs";
import * as IP from "../../tools/avatar/northstar-item-pilot.mjs";
import * as R1 from "../../tools/avatar/northstar-r1-garment.mjs";

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = resolve(HERE, "..", "..");
const sha256 = (b) => createHash("sha256").update(b).digest("hex"), repoFile = (rel) => join(REPO, ...rel.split("/")), FX = "tools/avatar/fixtures/northstar-wardrobe/r1/";
const ADAPTER_REL = "tools/avatar/openai-send-northstar-r1-d255.mjs", LEDGER_REL = "tools/avatar/r3-face-neutral-attempt-ledger.mjs", LEGACY_REL = "docs/project-state.md";
const DECISION_REL = "docs/decisions/D-255.md", PLAN_DECISION_REL = "docs/decisions/D-253.md", AUTH_REL = FX + "r1-authorisation-v1.json", PLAN_REL = FX + "r1-plan-v1.json", PROMPTS_REL = FX + "r1-prompts-v1.json";
const FREEZE_REL = "tools/avatar/fixtures/northstar-wardrobe/base-figure-c-v1.json", METHOD_REL = "tools/avatar/northstar-r1-garment.mjs", EVAL_REL = "tools/avatar/northstar-r1-evaluate.mjs";
const SRC = readFileSync(repoFile(ADAPTER_REL), "utf8"), CODE = SRC.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
const json = (rel) => JSON.parse(readFileSync(repoFile(rel), "utf8"));
const AUTH = json(AUTH_REL), PLAN = json(PLAN_REL), PROMPTS = json(PROMPTS_REL), DECISION = readFileSync(repoFile(DECISION_REL), "utf8");
const C_SHA = "10f4a4b9baf9886e8f230e09b2ab4e69bfebd6795c2a1222eb84f8db3884e818", MODEL = "gpt-image-2.5-sunburst-2026-09-08";
const ids = PLAN.calls.map((c) => c.callId), argsOf = (id) => ["--call-id=" + id, "--claim-identity=" + id + "-claim"], SEND = ["--send", "--owner-approval=D-255"], KEY = { OPENAI_API_KEY: "sk-d255-sandbox-dummy-key-not-a-credential" };
const C_PATH = process.env.ITEM_PILOT_C_PATH, C_BUF = C_PATH && existsSync(C_PATH) ? readFileSync(C_PATH) : null;
const CANVAS_ROOT = join(homedir(), "Documents", "DenSejeApp-artefacts", "r1-calls", "references"), canvasFile = (cut) => join(CANVAS_ROOT, cut, AUTH.request.canvases[cut].name);
const HAVE = !!C_BUF && sha256(C_BUF) === C_SHA && Object.keys(AUTH.request.canvases).every((c) => existsSync(canvasFile(c)) && sha256(readFileSync(canvasFile(c))) === AUTH.request.canvases[c].sha256);
const SKIP = HAVE ? false : "C and the cut canvases are private (D-127 §2); set ITEM_PILOT_C_PATH and keep the canvases outside the clones to run the mocked sends";
const isInside = (c, p) => { const r = relative(p, c); return r === "" || (!r.startsWith("..") && !isAbsolute(r)); };

test("D-255 authorisation: three unspent one-shot calls of the frozen plan, no reserve, no retry, no fallback, no earlier permission; the token in D-255's status", () => {
  assert.deepEqual([AUTH.decision, AUTH.meta.authorisesImageRequest, AUTH.budget.authorised, AUTH.budget.reserve, AUTH.budget.retries, AUTH.budget.fallback, AUTH.budget.reusesEarlierPermissions], ["D-255", false, 3, 0, 0, false, false]);
  assert.deepEqual(AUTH.calls.map((e) => [e.callId, e.order, e.category, e.cut, e.mandateState, e.outcome]), PLAN.calls.map((c, k) => [c.callId, k + 1, c.category, c.cut, "UNSPENT", "NOT YET ATTEMPTED"]));
  for (const e of AUTH.calls) { assert.equal(e.canvas, PLAN.frozen.templates.cuts[e.category].canvasSha256); assert.equal(e.prompt.sha256, PROMPTS.items[e.callId].sha256);
    assert.deepEqual(e.claim, { identity: e.callId + "-claim", filename: e.callId + ".claim.json", eventsFilename: e.callId + ".events.jsonl" }); }
  assert.deepEqual([AUTH.frozen.plan.sha256, AUTH.frozen.prompts.sha256], [sha256(readFileSync(repoFile(PLAN_REL))), sha256(readFileSync(repoFile(PROMPTS_REL)))]);
  assert.deepEqual([AUTH.frozen.method, AUTH.frozen.production, AUTH.frozen.outfitRevision], [R1.R1_REVISION, IP.METHOD, IP.METHODS[IP.METHOD].outfitRevision]);
  assert.deepEqual([AUTH.request.model, AUTH.request.parameters, AUTH.request.images[1].sha256], [MODEL, PLAN.request.parameters, C_SHA]);
  assert.equal(PLAN.authorisesImageRequest, false, "the plan stays unauthorised");
  const status = /^status: (.*)$/m.exec(DECISION)[1]; assert.ok(status.split(" — ").map((x) => x.trim()).includes("D-255 R1: 3 CALLS AUTHORISED"));
  for (const n of [...ids, "--owner-approval=D-255", MODEL, ADAPTER_REL, C_SHA, AUTH.frozen.prompts.sha256, AUTH.frozen.plan.sha256, "1024x1536", ...Object.values(AUTH.request.canvases).map((c) => c.sha256)]) assert.ok(DECISION.includes(n), n);
  assert.ok(!readFileSync(repoFile(LEGACY_REL), "utf8").split("\n").some((l) => l.startsWith("| **D-255** |")), "no row in the frozen legacy table (D-224)");
  for (const old of ["B1-", "D-235-new-", "D-228-seam-"]) assert.ok(!SRC.includes(old), "no earlier call id is known: " + old);
  for (const t of [JSON.stringify(AUTH), JSON.stringify(PROMPTS), SRC]) assert.ok(!/fitting-base|H1\.png/.test(t), "no H1");
  assert.match(AUTH.budget.price.note, /estimate, not a guaranteed maximum/); assert.equal(AUTH.budget.price.verifiedAt, "2026-10-29");
});

test("D-255 prompts: each is the plan's frame with its noun and design, nothing unresolved; acceptance beyond alpha and the COMBO-2 finding are pre-registered", () => {
  assert.equal(PROMPTS.plan.sha256, sha256(readFileSync(repoFile(PLAN_REL))));
  for (const c of PLAN.calls) { const e = PROMPTS.items[c.callId]; assert.equal(e.prompt, PLAN.promptFrame.replace("{noun}", c.noun).replace("{design}", c.design)); assert.equal(sha256(Buffer.from(e.prompt, "utf8")), e.sha256);
    assert.ok(!/[{}]|undefined|null|NaN/.test(e.prompt)); assert.match(e.prompt, /Do not draw the character or any part of a body/); assert.ok(Buffer.byteLength(e.prompt) < 1800); }
  const A = AUTH.acceptance; assert.equal(A.beyondAlpha.length, 5); assert.match(A.beyondAlpha[0], /never filled and never counted as passed/);
  for (const k of ["neckband", "second outline", "pattern is kept across body and sleeves", "skin or background"]) assert.ok(A.beyondAlpha.join(" ").includes(k), k);
  assert.match(A.combo2Pattern, /reported apart/); assert.match(A.combo2Pattern, /check is not changed/); assert.match(AUTH.frozen.noChangeDuringTheExperiment, /new method version/);
  assert.equal(AUTH.stopRules.length, 7); for (const r of AUTH.stopRules) assert.ok(SRC.includes(JSON.stringify(r)), "the adapter carries the stop rule: " + r);
});

test("the adapter: no exports, only node built-ins and the ledger, exactly one fetch, no retry, the key once, the canvas before C, every check before any claim", () => {
  assert.ok(!/^\s*export\b/m.test(CODE));
  for (const m of CODE.matchAll(/^\s*import\b[^;]*?from\s+"([^"]+)"/gm)) assert.ok(m[1].startsWith("node:") || m[1] === "./r3-face-neutral-attempt-ledger.mjs", m[1]);
  assert.equal([...CODE.matchAll(/\bfetch\s*\(/g)].length, 1);
  const prose = /no retry, no fallback|No outcome permits an automatic retry|no reserve and no fallback|there is no fallback|automaticRetry: false|NO RETRY|eq\("budget\.retries", get\(c, "budget", "retries"\), 0\)|eq\("budget\.fallback", get\(c, "budget", "fallback"\), false\)/gi;
  for (const x of ["retry", "retries", "backoff", "fallback"]) assert.ok(!new RegExp("\\b" + x + "\\b", "i").test(CODE.replace(prose, "")), x);
  assert.equal([...CODE.matchAll(/process\.env\.OPENAI_API_KEY/g)].length, 1);
  const body = CODE.slice(CODE.indexOf("async function main(argv)")); let last = -1;
  for (const k of ["parseArgs(argv)", "resolveRefs()", "readOriginBlobs(", "verifyPrompts(blobs)", "readC()", "verifyDecisions(", "verifyAuthorisation(", "verifyImplementation(", "readCanvas(", "resolveClaimLocation(call)", "verifyOrderAndStops(", "resolveOutputs(call)", "buildBody(", "if (!args.sendMode)", "process.env.OPENAI_API_KEY", "createClaim(", "globalThis.fetch("]) {
    const at = body.indexOf(k); assert.ok(at > last, k + " comes after the previous check"); last = at; }
  assert.match(CODE, /const MAX_CALLS = 3;/); assert.match(CODE, /const MODEL = "gpt-image-2\.5-sunburst-2026-09-08";/);
  assert.ok(CODE.indexOf("new File([canvasBuf]") < CODE.indexOf("new File([cBuf]"), "Image 1 is the canvas, Image 2 is C");
  for (const [cut, c] of Object.entries(AUTH.request.canvases)) assert.ok(SRC.includes(c.sha256) && SRC.includes(String(c.bytes)), cut);
});

test("the evaluation is the gate between calls: it refuses an unknown call, never rewrites a record, and holds the stop coverage of the plan", () => {
  const src = readFileSync(repoFile(EVAL_REL), "utf8");
  assert.match(src, /a record is never rewritten/); assert.match(src, /stop: comp\.registration\.coverage < R1\.LIMITS\.stopCoverage/); assert.equal(R1.LIMITS.stopCoverage, 0.8);
  assert.match(src, /canvas !== cut\.canvasSha256/, "the rebuilt template must be the canvas that was sent");
  const r = spawnSync(process.execPath, [repoFile(EVAL_REL), "--call-id", "R1-9-unknown"], { encoding: "utf8" }); assert.equal(r.status, 1); assert.match(r.stderr, /REFUSED/);
});

// ── sandbox: a throw-away git repository, a mocked fetch, the private C and canvases copied in ─────────────────────────────
const ROOTS = []; after(() => { for (const r of ROOTS) if (isInside(r, realpathSync.native(tmpdir())) && /d255-sandbox-/.test(r)) rmSync(r, { recursive: true, force: true }); });
const MOCK_SRC = [
  "import { appendFileSync, readFileSync } from \"node:fs\"; import { createHash } from \"node:crypto\";",
  "const LOG = process.env.D255_MOCK_LOG, PNG = process.env.D255_MOCK_PNG, MODE = process.env.D255_MOCK_MODE;",
  "if (!LOG || !PNG || !MODE) throw new Error(\"d255 mock: not configured — refusing to run\");",
  "const h = async (f) => createHash(\"sha256\").update(Buffer.from(await f.arrayBuffer())).digest(\"hex\");",
  "const err = (status, code, type) => new Response(JSON.stringify({ error: { type, code, message: \"mock \" + code } }), { status, headers: { \"content-type\": \"application/json\", \"x-request-id\": \"req_mock\" + status } });",
  "globalThis.fetch = async function d255MockFetch(url, init) {",
  "  const b = init.body; appendFileSync(LOG, JSON.stringify({ url: String(url), redirect: init.redirect, fields: [...b.keys()], imageSha: await Promise.all(b.getAll(\"image[]\").map(h)), imageNames: b.getAll(\"image[]\").map((f) => f.name), prompt: b.get(\"prompt\"), n: b.get(\"n\") }) + \"\\n\");",
  "  if (MODE === \"throw\") throw new TypeError(\"fetch failed (mock transport error)\");",
  "  if (MODE === \"quota\") return err(429, \"insufficient_quota\", \"insufficient_quota\");",
  "  if (MODE === \"moderation\") return err(400, \"moderation_blocked\", \"image_generation_user_error\");",
  "  return new Response(JSON.stringify({ created: 1, data: [{ b64_json: readFileSync(PNG).toString(\"base64\") }] }), { status: 200, headers: { \"content-type\": \"application/json\", \"x-request-id\": \"req_mockok\" } });",
  "};"].join("\n");
const TRACKED = [ADAPTER_REL, LEDGER_REL, LEGACY_REL, DECISION_REL, PLAN_DECISION_REL, AUTH_REL, PLAN_REL, PROMPTS_REL, FREEZE_REL, METHOD_REL, EVAL_REL];
const png = (w, h) => { const px = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i++) px.set([150, 150, 150, 255], i * 4); return encodePng(w, h, px); };
function envFor(sb, extra) { const env = {}; for (const k of ["PATH", "Path", "SystemRoot", "windir", "COMSPEC", "PATHEXT", "SystemDrive"]) if (typeof process.env[k] === "string") env[k] = process.env[k];
  return Object.assign(env, { LOCALAPPDATA: sb.state, XDG_STATE_HOME: sb.state, HOME: sb.home, USERPROFILE: sb.home, TEMP: sb.tmp, TMP: sb.tmp, TMPDIR: sb.tmp, HTTP_PROXY: "http://127.0.0.1:9", HTTPS_PROXY: "http://127.0.0.1:9",
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: sb.gitconfig, D255_MOCK_LOG: sb.log, D255_MOCK_PNG: sb.png, D255_MOCK_MODE: "ok" }, extra || {}); }
function sgit(sb, args) { const r = spawnSync("git", ["-C", sb.repo, "-c", "user.name=d255-sandbox", "-c", "user.email=sandbox@example.invalid", "-c", "core.autocrlf=false", ...args], { env: envFor(sb), encoding: "utf8", windowsHide: true }); if (r.status !== 0) throw new Error("sandbox git " + args.join(" ") + ": " + r.stderr); return r.stdout.trim(); }
const decisionPath = (sb) => join(sb.repo, ...DECISION_REL.split("/"));
function sandbox({ base, canvas, image } = {}) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "d255-sandbox-"))); ROOTS.push(root);
  const sb = { root, repo: join(root, "repo"), state: join(root, "state"), tmp: join(root, "tmp"), home: join(root, "home"), log: join(root, "fetch.log"), gitconfig: join(root, "gitconfig"), png: join(root, "out.png"), mock: join(root, "mock.mjs") };
  sb.claimDir = join(sb.state, "DenSejeApp", "one-shot-claims", "Moeller888-den-seje-app-frontend"); sb.out = join(sb.home, "Documents", "DenSejeApp-artefacts", "r1-calls");
  for (const d of [sb.repo, sb.state, sb.tmp, sb.home]) mkdirSync(d, { recursive: true });
  writeFileSync(sb.gitconfig, "[core]\n\tautocrlf = false\n[init]\n\tdefaultBranch = main\n"); writeFileSync(sb.mock, MOCK_SRC); writeFileSync(sb.log, ""); writeFileSync(sb.png, image || png(1024, 1536));
  const cd = join(sb.home, "Documents", "DenSejeApp-artefacts", "d-202-northstar-base-figure"); mkdirSync(cd, { recursive: true }); writeFileSync(join(cd, "d202-base-figure-v2.image-1.png"), C_BUF);
  for (const cut of Object.keys(AUTH.request.canvases)) { const d = join(sb.out, "references", cut); mkdirSync(d, { recursive: true }); writeFileSync(join(d, AUTH.request.canvases[cut].name), canvas && canvas[cut] ? canvas[cut] : readFileSync(canvasFile(cut))); }
  for (const rel of TRACKED) { const dst = join(sb.repo, ...rel.split("/")); mkdirSync(dirname(dst), { recursive: true }); copyFileSync(repoFile(rel), dst); }
  if (base) base(sb);
  sgit(sb, ["init", "-q", "-b", "main"]); sgit(sb, ["add", "-A"]); sgit(sb, ["commit", "-q", "-m", "base"]); sgit(sb, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  return sb; }
const run = (sb, args, extra) => { const r = spawnSync(process.execPath, ["--import", pathToFileURL(sb.mock).href, join(sb.repo, ...ADAPTER_REL.split("/")), ...args], { cwd: sb.repo, env: envFor(sb, extra), encoding: "utf8", windowsHide: true, timeout: 180000 }); return { status: r.status, out: (r.stdout || "") + (r.stderr || "") }; };
const fetchLog = (sb) => readFileSync(sb.log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
function refused(sb, r, stage, sends = 0) { assert.equal(r.status, 1, r.out); assert.match(r.out, new RegExp("REFUSED \\[" + stage + "\\]"), r.out); assert.equal(fetchLog(sb).length, sends); }
// what northstar-r1-evaluate.mjs writes after a receipt (the adapter reads only the image hash, the coverage and stop)
const record = (sb, id, coverage) => { const rc = JSON.parse(readFileSync(join(sb.out, id, "r1.receipt.json"), "utf8"));
  writeFileSync(join(sb.out, id, "r1.record.json"), JSON.stringify({ decision: "D-255", callId: id, imageSha256: rc.image.sha256, registration: { coverage }, stop: coverage < 0.8 }) + "\n"); };

test("the first dry run passes; the one send carries the cut's canvas then C and the frozen prompt, outside the repository, never twice; the next call waits for the R1 record", { skip: SKIP }, () => {
  const sb = sandbox();
  const d1 = run(sb, argsOf(ids[0])); assert.equal(d1.status, 0, d1.out); assert.match(d1.out, /DRY RUN PASSED/);
  refused(sb, run(sb, argsOf(ids[1])), "stopped");
  const old = run(sb, ["--call-id=B1-top-breton-longsleeve", "--claim-identity=B1-top-breton-longsleeve-claim"]); assert.equal(old.status, 1); assert.match(old.out, /REFUSED \[arguments\]/);
  const e = AUTH.calls[0], r = run(sb, [...argsOf(e.callId), ...SEND], KEY); assert.equal(r.status, 0, r.out);
  const L = fetchLog(sb); assert.equal(L.length, 1);
  assert.deepEqual([L[0].fields, L[0].imageSha, L[0].imageNames, L[0].n, L[0].redirect], [AUTH.request.fieldOrder, [e.canvas, C_SHA], ["image-1.tee-hip.png", "d202-base-figure-v2.image-1.png"], "1", "error"]);
  assert.equal(L[0].prompt, PROMPTS.items[e.callId].prompt);
  assert.ok(existsSync(join(sb.out, e.callId, "r1.image-1.png")) && existsSync(join(sb.out, e.callId, "r1.request.json"))); assert.equal(sgit(sb, ["status", "--porcelain"]), "");
  assert.equal(run(sb, [...argsOf(e.callId), ...SEND], KEY).status, 1); assert.equal(fetchLog(sb).length, 1, "never twice");
  refused(sb, run(sb, argsOf(ids[1])), "stopped", 1); assert.match(run(sb, argsOf(ids[1])).out, /no R1 record yet/);
  record(sb, ids[0], 0.999); const d2 = run(sb, argsOf(ids[1])); assert.equal(d2.status, 0, d2.out); assert.match(d2.out, /1 of 3 claims consumed/);
});

test("the stop rules: a record below 0.80 coverage, a quota rejection, an uncertain dispatch or one moderation block stops every later call; a format reject does not; the stop file stops; three sends are the cap", { skip: SKIP }, () => {
  const low = sandbox(); assert.equal(run(low, [...argsOf(ids[0]), ...SEND], KEY).status, 0); record(low, ids[0], 0.62); refused(low, run(low, [...argsOf(ids[1]), ...SEND], KEY), "stopped", 1);
  for (const mode of ["quota", "throw", "moderation"]) { const sb = sandbox(); assert.equal(run(sb, [...argsOf(ids[0]), ...SEND], { ...KEY, D255_MOCK_MODE: mode }).status, 3, mode); refused(sb, run(sb, [...argsOf(ids[1]), ...SEND], KEY), "stopped", 1); }
  const fmt = sandbox({ image: png(1024, 1024) }); assert.equal(run(fmt, [...argsOf(ids[0]), ...SEND], KEY).status, 0);
  assert.equal(JSON.parse(readFileSync(join(fmt.out, ids[0], "r1.request.json"), "utf8")).outcome.classification, "TECHNICAL_REJECT"); const d = run(fmt, argsOf(ids[1])); assert.equal(d.status, 0, d.out);
  const stop = sandbox(); assert.equal(run(stop, [...argsOf(ids[0]), ...SEND], KEY).status, 0); record(stop, ids[0], 1); writeFileSync(join(stop.out, "R1-STOP.json"), "{\"reason\":\"executor\"}\n"); refused(stop, run(stop, [...argsOf(ids[1]), ...SEND], KEY), "stopped", 1);
  const sb = sandbox(); for (const id of ids) { assert.equal(run(sb, [...argsOf(id), ...SEND], KEY).status, 0, id); record(sb, id, 1); }
  assert.equal(fetchLog(sb).length, 3); for (const id of ids) assert.equal(run(sb, [...argsOf(id), ...SEND], KEY).status, 1); assert.equal(fetchLog(sb).length, 3, "three sends at most");
});

test("a changed canvas, a changed prompt or a missing token is refused before any claim", { skip: SKIP }, () => {
  const wrong = sandbox({ canvas: { "tee-hip": png(1024, 1536) } }); refused(wrong, run(wrong, [...argsOf(ids[0]), ...SEND], KEY), "reference-canvas");
  const prompt = sandbox({ base: (s) => { const p = join(s.repo, ...PROMPTS_REL.split("/")); writeFileSync(p, readFileSync(p, "utf8").replace("apricot-peach", "apricot peach")); } }); refused(prompt, run(prompt, [...argsOf(ids[0]), ...SEND], KEY), "pins");
  const noToken = sandbox({ base: (s) => writeFileSync(decisionPath(s), readFileSync(decisionPath(s), "utf8").replace("D-255 R1: 3 CALLS AUTHORISED", "D-255 R1: PREPARED")) }); refused(noToken, run(noToken, [...argsOf(ids[0]), ...SEND], KEY), "decision");
});
