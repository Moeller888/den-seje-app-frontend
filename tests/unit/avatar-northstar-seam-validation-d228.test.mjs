// D-228 — the seam validation's send adapter (tools/avatar/openai-send-northstar-seam-d228.mjs), its authorisation, its frozen
// prompts and the reference sheets (ST.seamReferenceSheet). The static and file tests run everywhere; the sheets are drawn on the
// CI stand-in. The pinned sheets and the mocked sends need C and the sheets, which are private (D-127 §2: derived from C, kept
// outside both clones); they run only where ITEM_PILOT_C_PATH points at C and the sheets exist — skipped in CI, never faked.
// Mock tests prove the adapter, never the model's fit.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, readdirSync, copyFileSync, realpathSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join, dirname, relative, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir, homedir } from "node:os";
import { encodePng, decodePng } from "../../tools/avatar/r3-hair-tool-v2.mjs";
import * as WR from "../../tools/avatar/northstar-wardrobe.mjs";
import * as BC from "../../tools/avatar/northstar-base-figure-c.mjs";
import * as IP from "../../tools/avatar/northstar-item-pilot.mjs";
import * as ST from "../../tools/avatar/northstar-seam-templates.mjs";
import { recolour } from "../../tools/avatar/northstar-wardrobe-poc.mjs";
import * as NL from "../../tools/avatar/r3-northstar-layers.mjs";

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = resolve(HERE, "..", "..");
const sha256 = (b) => createHash("sha256").update(b).digest("hex"), repoFile = (rel) => join(REPO, ...rel.split("/")), FX = "tools/avatar/fixtures/northstar-wardrobe/";
const ADAPTER_REL = "tools/avatar/openai-send-northstar-seam-d228.mjs", LEDGER_REL = "tools/avatar/r3-face-neutral-attempt-ledger.mjs", LEGACY_REL = "docs/project-state.md";
const DECISION_REL = "docs/decisions/D-228.md", PLAN_DECISION_REL = "docs/decisions/D-225.md", CALLS_REL = FX + "seam-validation-calls-v1.json", PLAN_REL = FX + "seam-validation-plan-v1.json";
const PROMPTS_REL = FX + "seam-validation-prompts-v1.json", CONTRACT_REL = FX + "seam-contract-v1.json", FREEZE_REL = FX + "base-figure-c-v1.json", PROC_REL = "tools/avatar/northstar-item-pilot.mjs", SHEETS_REL = "tools/avatar/northstar-seam-templates.mjs";
const SRC = readFileSync(repoFile(ADAPTER_REL), "utf8"), CODE = SRC.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
const json = (rel) => JSON.parse(readFileSync(repoFile(rel), "utf8"));
const CALLS = json(CALLS_REL), PLAN = json(PLAN_REL), PROMPTS = json(PROMPTS_REL), CONTRACT = json(CONTRACT_REL), P207 = json(FX + "item-pilot-prompts-v1.json"), M225 = json(FX + "item-pipeline-manifest-d225.json");
const DECISION = readFileSync(repoFile(DECISION_REL), "utf8");
const C_SHA = "10f4a4b9baf9886e8f230e09b2ab4e69bfebd6795c2a1222eb84f8db3884e818", MODEL = "gpt-image-2.5-sunburst-2026-09-08";
const C_PATH = process.env.ITEM_PILOT_C_PATH, C_BUF = C_PATH && existsSync(C_PATH) ? readFileSync(C_PATH) : null;
const SHEET_ROOT = join(homedir(), "Documents", "DenSejeApp-artefacts", "d-228-seam-validation", "references", "v1");
const sheetFile = (cat) => join(SHEET_ROOT, cat, CALLS.request.references[cat].name);
const HAVE = !!C_BUF && sha256(C_BUF) === C_SHA && ["top", "bottom", "shoes"].every((c) => existsSync(sheetFile(c)) && sha256(readFileSync(sheetFile(c))) === CALLS.request.references[c].sha256);
const SKIP = HAVE ? false : "C and the reference sheets are private (D-127 §2); set ITEM_PILOT_C_PATH and keep the sheets outside the clones to run the mocked sends";
const isInside = (c, p) => { const r = relative(p, c); return r === "" || (!r.startsWith("..") && !isAbsolute(r)); };
const ids = ["V1", "V2", "V3", "V4", "V5", "V6"].map((v) => "D-228-seam-" + v), argsOf = (id) => ["--call-id=" + id, "--claim-identity=" + id + "-claim"], SEND = ["--send", "--owner-approval=D-228"], KEY = { OPENAI_API_KEY: "sk-d228-sandbox-dummy-key-not-a-credential" };

test("D-228 authorisation: six calls in the plan's order, one per plan item, D-207's request with two images and no mask; the token in D-228's status", () => {
  assert.deepEqual([CALLS.decision, CALLS.meta.authorisesImageRequest, CALLS.budget.authorised, CALLS.budget.reserve, CALLS.budget.retries, CALLS.budget.fallback, CALLS.budget.actuallySent], ["D-228", false, 6, 0, 0, 0, 0]);
  assert.deepEqual(CALLS.calls.map((e) => e.callId), ids); assert.deepEqual(CALLS.calls.map((e) => e.plan), PLAN.items.map((p) => p.id)); assert.deepEqual(CALLS.calls.map((e) => e.order), [1, 2, 3, 4, 5, 6]);
  for (const e of CALLS.calls) { const p = PLAN.items.find((x) => x.id === e.plan); assert.equal(e.category, p.category, e.callId); assert.equal(e.reference, e.category);
    assert.deepEqual([e.mandateState, e.outcome], ["UNSPENT", "NOT YET ATTEMPTED"]); assert.equal(e.prompt.sha256, PROMPTS.items[e.item].sha256); assert.equal(IP.ITEM_CATEGORY[e.item], e.category, "registered in the pipeline");
    assert.deepEqual(e.targetRules, p.tests.match(/SC-[A-Z]\d/g)); }
  assert.deepEqual([CALLS.request.model, CALLS.request.parameters], [MODEL, { size: "1024x1536", quality: "high", n: 1, output_format: "png", background: "transparent" }]);
  assert.deepEqual(CALLS.request.fieldOrder, ["model", "image[]", "image[]", "prompt", "size", "quality", "n", "output_format", "background"]); assert.ok(CALLS.request.neverSentFields.includes("mask"));
  assert.equal(CALLS.request.images[0].sha256, C_SHA); assert.equal(CALLS.request.prompts.sha256, sha256(readFileSync(repoFile(PROMPTS_REL))));
  // every pin agrees: the adapter, the authorisation file and D-228's decision
  for (const [cat, s] of Object.entries(CALLS.request.references)) { assert.equal(s.tracked, false); assert.ok(SRC.includes(s.sha256) && DECISION.includes(s.sha256), cat); }
  assert.ok(SRC.includes(CALLS.request.prompts.sha256) && DECISION.includes(CALLS.request.prompts.sha256));
  const status = /^status: (.*)$/m.exec(DECISION)[1]; assert.ok(status.split(" — ").map((x) => x.trim()).includes("D-228 SEAM VALIDATION: 6 CALLS AUTHORISED"), "the token is a segment of D-228's status");
  for (const n of [...ids, "--owner-approval=D-228", MODEL, ADAPTER_REL, C_SHA, "1024x1536"]) assert.ok(DECISION.includes(n), n);
  assert.ok(!readFileSync(repoFile(LEGACY_REL), "utf8").split("\n").some((l) => l.startsWith("| **D-228** |")), "no row in the frozen legacy table (D-224)");
  for (const t of [JSON.stringify(CALLS), JSON.stringify(PROMPTS), SRC]) assert.ok(!/fitting-base|H1\.png/.test(t), "no H1");
});

test("D-228 acceptance is frozen before any call: four axes apart, the pre-registered verdict, the failure classes, the stop rules and the 40-outfit matrix", () => {
  const A = CALLS.acceptance; assert.deepEqual(Object.keys(A.axes), ["technical", "contract", "combinationFit", "visualQuality"]); assert.match(A.separation, /sufficient, not necessary/);
  assert.deepEqual(Object.keys(A.questions), ["Q1", "Q2", "Q3"]); assert.deepEqual(Object.keys(A.verdict), ["improves", "doesNotImprove", "otherwise"]);
  assert.deepEqual(Object.keys(A.failureClasses), ["generation", "extraction", "composition", "contract"]); assert.ok(A.limits.some((l) => /no control without reference sheets/.test(l))); assert.match(A.noExpansion, /no further calls/);
  assert.equal(CALLS.stopRules.length, 6); for (const r of CALLS.stopRules) assert.ok(SRC.includes(JSON.stringify(r)), "the adapter carries the stop rule: " + r);
  const E = CALLS.evaluation, M = E.reuseMatrix; assert.equal(E.method, "d225"); assert.equal(M.tops.length * M.bottoms.length * M.shoes.length, 40); assert.equal(M.outfits, 40);
  for (const it of E.existingItems) { const m = M225.items.find((x) => x.id === it.id); assert.equal(it.rawSha256, m.rawSha256, it.id); assert.equal(it.raw, M225.rawRoot + "/" + m.raw); }
  assert.deepEqual([...E.existingItems, ...E.newItems].map((x) => x.id).sort(), [...M.tops, ...M.bottoms, ...M.shoes].sort());
  assert.equal(IP.COVERING["shoes-ankleboots-brown"], "closed-footwear"); assert.equal(IP.COVERING_BY_TYPE[CALLS.calls[5].type], "closed-footwear");
});

test("D-228 prompts are built only from D-207's template and coverage, the contract's modelDraws and one reference sentence per category", () => {
  assert.equal(PROMPTS.template, P207.template); assert.deepEqual(PROMPTS.coverage, P207.coverage); assert.deepEqual(PROMPTS.modelDraws, CONTRACT.modelDraws);
  for (const [id, e] of Object.entries(PROMPTS.items)) {
    const want = P207.template.replace("{GARMENT}", e.garment).replace("{COVERAGE}", P207.coverage[e.category]) + " " + CONTRACT.modelDraws[e.category] + " " + PROMPTS.reference[e.category];
    assert.equal(e.prompt, want, id); assert.equal(sha256(Buffer.from(e.prompt, "utf8")), e.sha256, id); assert.equal(Buffer.byteLength(e.prompt, "utf8"), e.bytes, id); }
  for (const [cat, s] of Object.entries(PROMPTS.reference)) { assert.match(s, /never draw its colours or marks/, cat); for (const c of Object.keys(ST.SHEET_COLOURS)) if (s.includes(c)) assert.ok(c in ST.SHEET_COLOURS); }
});

test("the adapter: no exports, only node built-ins and the ledger, exactly one fetch, no retry, the key once, every check before any claim", () => {
  assert.ok(!/^\s*export\b/m.test(CODE));
  for (const m of CODE.matchAll(/^\s*import\b[^;]*?from\s+"([^"]+)"/gm)) assert.ok(m[1].startsWith("node:") || m[1] === "./r3-face-neutral-attempt-ledger.mjs", m[1]);
  assert.equal([...CODE.matchAll(/\bfetch\s*\(/g)].length, 1);
  // the budget's own field (retries: 0, enforced) is the one allowed mention besides the prose that forbids them
  const prose = /no retry, no fallback|No outcome permits an automatic retry|there is no fallback|automaticRetry: false|NO RETRY|eq\("budget\.retries", get\(c, "budget", "retries"\), 0\)/gi;
  for (const x of ["retry", "retries", "backoff", "fallback"]) assert.ok(!new RegExp("\\b" + x + "\\b", "i").test(CODE.replace(prose, "")), x);
  assert.equal([...CODE.matchAll(/process\.env\.OPENAI_API_KEY/g)].length, 1);
  const body = CODE.slice(CODE.indexOf("async function main(argv)")); let last = -1;
  for (const k of ["parseArgs(argv)", "resolveRefs()", "readOriginBlobs(", "verifyPrompts(blobs)", "readC()", "verifyDecisions(", "verifyAuthorisation(", "verifyImplementation(", "readSheet(", "resolveClaimLocation(call)", "verifyOrderAndStops(", "resolveOutputs(call)", "buildBody(", "if (!args.sendMode)", "process.env.OPENAI_API" + "_KEY", "claim = createClaim(", "event(\"dispatch\"", "res = await globalThis.fetch("]) {
    const at = body.indexOf(k); assert.ok(at > last, k + " comes after the previous check"); last = at; }
  assert.match(CODE, /const MAX_CALLS = 6;/); assert.match(CODE, /const MODEL = "gpt-image-2\.5-sunburst-2026-09-08";/);
});

test("the reference sheets: C's picture with the category's seam zones as colour marks, deterministic, drawn from C's lines (CI stand-in)", () => {
  const w = WR.buildWardrobe(), L = w.base.layers, A = w.anchors, { W } = WR;
  const legs = new Uint8ClampedArray(L.pants); for (let i = 0; i < (A.crotchY + 10) * W; i++) legs[i * 4 + 3] = 0;
  const base = BC.prepareBase(w, NL.overStack([w.fg.master, recolour(legs, { h: 33, s: 0.51, vScale: 1.3 })])), T = BC.templatesC(w, base, { revision: "d213" }), Ln = BC.seamLines(w, base, T);
  const is = (o, x, y, c) => { const i = (y * W + x) * 4; return o[i] === c[0] && o[i + 1] === c[1] && o[i + 2] === c[2]; }, C = ST.SHEET_COLOURS, x0 = Number(Object.keys(Ln.waist)[40]);
  const top = ST.seamReferenceSheet(w, base, T, "top"), bottom = ST.seamReferenceSheet(w, base, T, "bottom"), shoes = ST.seamReferenceSheet(w, base, T, "shoes");
  assert.equal(top.length, W * WR.H * 4); assert.ok(is(top, x0, Ln.waist[x0], C.cyan), "the waist line is cyan on the top sheet"); assert.ok(is(bottom, x0, Ln.waist[x0], C.cyan), "and on the bottom sheet");
  const lg = Ln.leg.left[Ln.ankle.left]; assert.ok(is(shoes, lg[0], Ln.ankle.left, C.cyan), "the ankle line on the shoe sheet");
  assert.ok(is(shoes, lg[0], Ln.ankle.left - BC.SEAM_CONTRACT_V1.shaftMaxAboveAnklePx, C.magenta) || is(shoes, lg[0] + 1, Ln.ankle.left - BC.SEAM_CONTRACT_V1.shaftMaxAboveAnklePx, C.magenta), "the shaft limit");
  assert.deepEqual(sha256(ST.seamReferenceSheet(w, base, T, "top")), sha256(top), "deterministic");
  let changedOutside = 0; for (let i = 0; i < W * 400; i++) if (top[i * 4 + 3] !== base.R[i * 4 + 3] || top[i * 4] !== base.R[i * 4]) changedOutside++; assert.equal(changedOutside, 0, "the head is C's own pixels");
});

test("the pinned reference sheets are C's: redrawn from C they are byte for byte the pinned files", { skip: SKIP }, () => {
  const w = WR.buildWardrobe(), px = Uint8ClampedArray.from(decodePng(C_BUF).px), base = BC.prepareBase(w, px), T = BC.templatesC(w, base, { revision: "d213" });
  for (const cat of ["top", "bottom", "shoes"]) assert.equal(sha256(encodePng(WR.W, WR.H, ST.seamReferenceSheet(w, base, T, cat, { img: px }))), CALLS.request.references[cat].sha256, cat);
});

// ── sandbox: a throw-away git repository, a mocked fetch, the private C and sheets copied in ─────────────────────────────
const ROOTS = []; after(() => { for (const r of ROOTS) if (isInside(r, realpathSync.native(tmpdir())) && /d228-sandbox-/.test(r)) rmSync(r, { recursive: true, force: true }); });
const MOCK_SRC = [
  "import { appendFileSync, readFileSync } from \"node:fs\"; import { createHash } from \"node:crypto\";",
  "const LOG = process.env.D228_MOCK_LOG, PNG = process.env.D228_MOCK_PNG, MODE = process.env.D228_MOCK_MODE;",
  "if (!LOG || !PNG || !MODE) throw new Error(\"d228 mock: not configured — refusing to run\");",
  "const h = async (f) => createHash(\"sha256\").update(Buffer.from(await f.arrayBuffer())).digest(\"hex\");",
  "const err = (status, code, type) => new Response(JSON.stringify({ error: { type, code, message: \"mock \" + code } }), { status, headers: { \"content-type\": \"application/json\", \"x-request-id\": \"req_mock\" + status } });",
  "globalThis.fetch = async function d228MockFetch(url, init) {",
  "  const b = init.body; appendFileSync(LOG, JSON.stringify({ url: String(url), redirect: init.redirect, fields: [...b.keys()], imageSha: await Promise.all(b.getAll(\"image[]\").map(h)), imageNames: b.getAll(\"image[]\").map((f) => f.name), prompt: b.get(\"prompt\"), n: b.get(\"n\") }) + \"\\n\");",
  "  if (MODE === \"throw\") throw new TypeError(\"fetch failed (mock transport error)\");",
  "  if (MODE === \"quota\") return err(429, \"insufficient_quota\", \"insufficient_quota\");",
  "  if (MODE === \"moderation\") return err(400, \"moderation_blocked\", \"image_generation_user_error\");",
  "  if (MODE === \"shape\") return err(400, \"invalid_value\", \"invalid_request_error\");",
  "  return new Response(JSON.stringify({ created: 1, data: [{ b64_json: readFileSync(PNG).toString(\"base64\") }] }), { status: 200, headers: { \"content-type\": \"application/json\", \"x-request-id\": \"req_mockok\" } });",
  "};"].join("\n");
const TRACKED = [ADAPTER_REL, LEDGER_REL, LEGACY_REL, DECISION_REL, PLAN_DECISION_REL, CALLS_REL, PLAN_REL, PROMPTS_REL, CONTRACT_REL, FREEZE_REL, PROC_REL, SHEETS_REL];
const shape = () => { const px = new Uint8ClampedArray(1024 * 1536 * 4); for (let i = 0; i < 1024 * 1536; i++) px.set([150, 150, 150, 255], i * 4); return encodePng(1024, 1536, px); };
function envFor(sb, extra) { const env = {}; for (const k of ["PATH", "Path", "SystemRoot", "windir", "COMSPEC", "PATHEXT", "SystemDrive"]) if (typeof process.env[k] === "string") env[k] = process.env[k];
  return Object.assign(env, { LOCALAPPDATA: sb.state, XDG_STATE_HOME: sb.state, HOME: sb.home, USERPROFILE: sb.home, TEMP: sb.tmp, TMP: sb.tmp, TMPDIR: sb.tmp, HTTP_PROXY: "http://127.0.0.1:9", HTTPS_PROXY: "http://127.0.0.1:9",
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: sb.gitconfig, D228_MOCK_LOG: sb.log, D228_MOCK_PNG: sb.png, D228_MOCK_MODE: "ok" }, extra || {}); }
function sgit(sb, args) { const r = spawnSync("git", ["-C", sb.repo, "-c", "user.name=d228-sandbox", "-c", "user.email=sandbox@example.invalid", "-c", "core.autocrlf=false", ...args], { env: envFor(sb), encoding: "utf8", windowsHide: true }); if (r.status !== 0) throw new Error("sandbox git " + args.join(" ") + ": " + r.stderr); return r.stdout.trim(); }
const decisionPath = (sb) => join(sb.repo, ...DECISION_REL.split("/"));
function sandbox({ base, sheet } = {}) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "d228-sandbox-"))); ROOTS.push(root);
  const sb = { root, repo: join(root, "repo"), state: join(root, "state"), tmp: join(root, "tmp"), home: join(root, "home"), log: join(root, "fetch.log"), gitconfig: join(root, "gitconfig"), png: join(root, "out.png"), mock: join(root, "mock.mjs") };
  sb.claimDir = join(sb.state, "DenSejeApp", "one-shot-claims", "Moeller888-den-seje-app-frontend"); sb.out = join(sb.home, "Documents", "DenSejeApp-artefacts", "d-228-seam-validation");
  for (const d of [sb.repo, sb.state, sb.tmp, sb.home]) mkdirSync(d, { recursive: true });
  writeFileSync(sb.gitconfig, "[core]\n\tautocrlf = false\n[init]\n\tdefaultBranch = main\n"); writeFileSync(sb.mock, MOCK_SRC); writeFileSync(sb.log, ""); writeFileSync(sb.png, shape());
  const cd = join(sb.home, "Documents", "DenSejeApp-artefacts", "d-202-northstar-base-figure"); mkdirSync(cd, { recursive: true }); writeFileSync(join(cd, "d202-base-figure-v2.image-1.png"), C_BUF);
  for (const cat of ["top", "bottom", "shoes"]) { const d = join(sb.out, "references", "v1", cat); mkdirSync(d, { recursive: true }); writeFileSync(join(d, CALLS.request.references[cat].name), sheet && sheet[cat] ? sheet[cat] : readFileSync(sheetFile(cat))); }
  for (const rel of [...TRACKED, ".gitignore"]) { const dst = join(sb.repo, ...rel.split("/")); mkdirSync(dirname(dst), { recursive: true }); copyFileSync(repoFile(rel), dst); }
  if (base) base(sb);
  sgit(sb, ["init", "-q", "-b", "main"]); sgit(sb, ["add", "-A"]); sgit(sb, ["commit", "-q", "-m", "base"]); sgit(sb, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  return sb; }
const run = (sb, args, extra) => { const r = spawnSync(process.execPath, ["--import", pathToFileURL(sb.mock).href, join(sb.repo, ...ADAPTER_REL.split("/")), ...args], { cwd: sb.repo, env: envFor(sb, extra), encoding: "utf8", windowsHide: true, timeout: 180000 }); return { status: r.status, out: (r.stdout || "") + (r.stderr || "") }; };
const fetchLog = (sb) => readFileSync(sb.log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
function refused(sb, r, stage, sends = 0) { assert.equal(r.status, 1, r.out); assert.match(r.out, new RegExp("REFUSED \\[" + stage + "\\]"), r.out); assert.equal(fetchLog(sb).length, sends); }

test("the first dry run passes; the one send carries C then the category's sheet and the frozen prompt, stored outside the repository, never twice; the order holds", { skip: SKIP }, () => {
  const sb = sandbox();
  const d1 = run(sb, argsOf(ids[0])); assert.equal(d1.status, 0, d1.out); assert.match(d1.out, /DRY RUN PASSED/);
  refused(sb, run(sb, argsOf(ids[1])), "stopped"); assert.match(run(sb, argsOf(ids[1])).out, /order: D-228-seam-V1 comes first/);
  const e = CALLS.calls[0], r = run(sb, [...argsOf(e.callId), ...SEND], KEY); assert.equal(r.status, 0, r.out);
  const L = fetchLog(sb); assert.equal(L.length, 1);
  assert.deepEqual([L[0].fields, L[0].imageSha, L[0].imageNames, L[0].n, L[0].redirect], [CALLS.request.fieldOrder, [C_SHA, CALLS.request.references.top.sha256], ["d202-base-figure-v2.image-1.png", "seam-reference-top.png"], "1", "error"]);
  assert.equal(L[0].prompt, PROMPTS.items[e.item].prompt);
  assert.ok(existsSync(join(sb.out, e.callId, "d228.image-1.png")) && existsSync(join(sb.out, e.callId, "d228.request.json"))); assert.equal(sgit(sb, ["status", "--porcelain"]), "");
  assert.equal(JSON.parse(readFileSync(join(sb.out, e.callId, "d228.request.json"), "utf8")).request.inputs[1].sha256, CALLS.request.references.top.sha256);
  assert.equal(run(sb, [...argsOf(e.callId), ...SEND], KEY).status, 1); assert.equal(fetchLog(sb).length, 1, "never twice");
  const d2 = run(sb, argsOf(ids[1])); assert.equal(d2.status, 0, d2.out); assert.match(d2.out, /1 of 6 claims consumed/);
});

test("the stop rules: a quota rejection, a request-shape rejection, an uncertain dispatch, a second moderation block or the stop file refuses every later call", { skip: SKIP }, () => {
  for (const mode of ["quota", "shape", "throw"]) { const sb = sandbox(); assert.equal(run(sb, [...argsOf(ids[0]), ...SEND], { ...KEY, D228_MOCK_MODE: mode }).status, 3, mode);
    const r = run(sb, [...argsOf(ids[1]), ...SEND], KEY); refused(sb, r, "stopped", 1); assert.match(r.out, /stop \((credit or access|request shape|uncertain dispatch)\)/, mode); }
  const mod = sandbox(); assert.equal(run(mod, [...argsOf(ids[0]), ...SEND], { ...KEY, D228_MOCK_MODE: "moderation" }).status, 3);
  assert.equal(run(mod, argsOf(ids[1])).status, 0, "one moderation block is item-specific; the run goes on");
  assert.equal(run(mod, [...argsOf(ids[1]), ...SEND], { ...KEY, D228_MOCK_MODE: "moderation" }).status, 3);
  const r2 = run(mod, [...argsOf(ids[2]), ...SEND], KEY); refused(mod, r2, "stopped", 2); assert.match(r2.out, /stop \(moderation\)/);
  const stop = sandbox(); assert.equal(run(stop, [...argsOf(ids[0]), ...SEND], KEY).status, 0); writeFileSync(join(stop.out, "D-228-STOP.json"), "{\"reason\":\"common method failure\"}\n");
  refused(stop, run(stop, [...argsOf(ids[1]), ...SEND], KEY), "stopped", 1);
});

test("a wrong sheet or a missing token is refused before any claim; six sends are the hard cap", { skip: SKIP }, () => {
  const altered = sandbox({ sheet: { top: Buffer.concat([readFileSync(sheetFile("top")), Buffer.from([0])]) } }); refused(altered, run(altered, [...argsOf(ids[0]), ...SEND], KEY), "reference-sheet");
  const noToken = sandbox({ base: (s) => writeFileSync(decisionPath(s), readFileSync(decisionPath(s), "utf8").replace("D-228 SEAM VALIDATION: 6 CALLS AUTHORISED", "D-228 SEAM VALIDATION: PREPARED")) });
  refused(noToken, run(noToken, [...argsOf(ids[0]), ...SEND], KEY), "decision");
  const sb = sandbox(); for (const id of ids) assert.equal(run(sb, [...argsOf(id), ...SEND], KEY).status, 0, id);
  assert.equal(fetchLog(sb).length, 6); for (const id of ids) assert.equal(run(sb, [...argsOf(id), ...SEND], KEY).status, 1); assert.equal(fetchLog(sb).length, 6, "six sends at most");
  const bad = run(sb, ["--call-id=D-228-seam-V7", "--claim-identity=D-228-seam-V7-claim"]); assert.equal(bad.status, 1); assert.match(bad.out, /REFUSED \[arguments\]/);
});
