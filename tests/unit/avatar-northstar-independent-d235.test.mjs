// D-235 — the independent validation of method d232 and seam-contract-v2: its send adapter
// (tools/avatar/openai-send-northstar-independent-d235.mjs), its authorisation, its frozen method, prompts, reference sheets and
// 48-outfit matrix, and the pre-registered acceptance. The static and file tests run everywhere; the v2 sheets are drawn on the
// CI stand-in. The pinned sheets and the mocked sends need C and the sheets, which are private (D-127 §2); they run only where
// ITEM_PILOT_C_PATH points at C and the sheets exist — skipped in CI, never faked. Mock tests prove the adapter, never the model.
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
const ADAPTER_REL = "tools/avatar/openai-send-northstar-independent-d235.mjs", LEDGER_REL = "tools/avatar/r3-face-neutral-attempt-ledger.mjs", LEGACY_REL = "docs/project-state.md";
const DECISION_REL = "docs/decisions/D-235.md", PLAN_DECISION_REL = "docs/decisions/D-232.md", CALLS_REL = FX + "independent-validation-calls-v1.json";
const PROMPTS_REL = FX + "independent-validation-prompts-v1.json", CONTRACT_REL = FX + "seam-contract-v2.json", FREEZE_REL = FX + "base-figure-c-v1.json", PROC_REL = "tools/avatar/northstar-item-pilot.mjs", SHEETS_REL = "tools/avatar/northstar-seam-templates.mjs";
const SRC = readFileSync(repoFile(ADAPTER_REL), "utf8"), CODE = SRC.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
const json = (rel) => JSON.parse(readFileSync(repoFile(rel), "utf8"));
const CALLS = json(CALLS_REL), PROMPTS = json(PROMPTS_REL), CONTRACT = json(CONTRACT_REL), P207 = json(FX + "item-pilot-prompts-v1.json"), P228 = json(FX + "seam-validation-prompts-v1.json");
const D228 = json(FX + "seam-validation-calls-v1.json"), M232 = json(FX + "item-pipeline-manifest-d232-validation.json"), R232 = json(FX + "seam-limits-results-d232.json");
const DECISION = readFileSync(repoFile(DECISION_REL), "utf8");
const C_SHA = "10f4a4b9baf9886e8f230e09b2ab4e69bfebd6795c2a1222eb84f8db3884e818", MODEL = "gpt-image-2.5-sunburst-2026-09-08";
const C_PATH = process.env.ITEM_PILOT_C_PATH, C_BUF = C_PATH && existsSync(C_PATH) ? readFileSync(C_PATH) : null;
const SHEET_ROOT = join(homedir(), "Documents", "DenSejeApp-artefacts", "d-235-independent-validation", "references", "v2");
const sheetFile = (cat) => join(SHEET_ROOT, cat, CALLS.request.references[cat].name);
const HAVE = !!C_BUF && sha256(C_BUF) === C_SHA && ["top", "bottom", "shoes"].every((c) => existsSync(sheetFile(c)) && sha256(readFileSync(sheetFile(c))) === CALLS.request.references[c].sha256);
const SKIP = HAVE ? false : "C and the v2 reference sheets are private (D-127 §2); set ITEM_PILOT_C_PATH and keep the sheets outside the clones to run the mocked sends";
const isInside = (c, p) => { const r = relative(p, c); return r === "" || (!r.startsWith("..") && !isAbsolute(r)); };
const ids = ["N1", "N2", "N3", "N4", "N5", "N6"].map((v) => "D-235-new-" + v), argsOf = (id) => ["--call-id=" + id, "--claim-identity=" + id + "-claim"], SEND = ["--send", "--owner-approval=D-235"], KEY = { OPENAI_API_KEY: "sk-d235-sandbox-dummy-key-not-a-credential" };

test("D-235 authorisation: six new calls N1 … N6, D-228's request with the v2 sheets, no earlier permission reused; the token in D-235's status", () => {
  assert.deepEqual([CALLS.decision, CALLS.meta.authorisesImageRequest, CALLS.budget.authorised, CALLS.budget.reserve, CALLS.budget.retries, CALLS.budget.fallback, CALLS.budget.actuallySent, CALLS.budget.reusesEarlierPermissions], ["D-235", false, 6, 0, 0, 0, 0, false]);
  assert.deepEqual(CALLS.calls.map((e) => e.callId), ids); assert.deepEqual(CALLS.calls.map((e) => e.order), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(CALLS.calls.map((e) => e.category), ["top", "top", "bottom", "bottom", "shoes", "shoes"], "two tops, two bottoms, two shoes");
  for (const e of CALLS.calls) { assert.deepEqual([e.mandateState, e.outcome], ["UNSPENT", "NOT YET ATTEMPTED"]); assert.equal(e.reference, e.category); assert.equal(e.prompt.sha256, PROMPTS.items[e.item].sha256);
    assert.equal(IP.ITEM_CATEGORY[e.item], e.category, "registered in the pipeline"); assert.ok(!(e.item in IP.ITEMS) && !(e.item in IP.VALIDATION_ITEMS), e.item + " is a new design");
    if (e.category === "shoes") { assert.equal(IP.COVERING[e.item], "closed-footwear"); assert.equal(IP.COVERING_BY_TYPE[e.type], "closed-footwear", "closed footwear only"); } }
  assert.deepEqual(CALLS.calls.map((e) => e.tone).sort(), ["dark", "dark", "dark", "light", "light", "light"]);
  // D-228's permissions are spent and closed; none of its ids is known here
  assert.ok(D228.calls.every((e) => e.mandateState === "SPENT" && e.closedBy === "D-231")); for (const e of D228.calls) assert.ok(!SRC.includes(e.callId), e.callId);
  assert.deepEqual([CALLS.request.model, CALLS.request.parameters, CALLS.request.fieldOrder, CALLS.request.neverSentFields, CALLS.request.images], [MODEL, D228.request.parameters, D228.request.fieldOrder, D228.request.neverSentFields, D228.request.images]);
  assert.equal(CALLS.request.prompts.sha256, sha256(readFileSync(repoFile(PROMPTS_REL))));
  for (const [cat, s] of Object.entries(CALLS.request.references)) { assert.equal(s.tracked, false); assert.ok(SRC.includes(s.sha256) && DECISION.includes(s.sha256), cat); }
  assert.notEqual(CALLS.request.references.top.sha256, D228.request.references.top.sha256, "the top sheet is v2's"); assert.notEqual(CALLS.request.references.bottom.sha256, D228.request.references.bottom.sha256, "the bottom sheet is v2's");
  assert.equal(CALLS.request.references.shoes.sha256, D228.request.references.shoes.sha256, "no shoe rule changed: the shoe sheet is D-228's");
  assert.ok(SRC.includes(CALLS.request.prompts.sha256) && DECISION.includes(CALLS.request.prompts.sha256));
  const status = /^status: (.*)$/m.exec(DECISION)[1]; assert.ok(status.split(" — ").map((x) => x.trim()).includes("D-235 INDEPENDENT VALIDATION: 6 NEW CALLS AUTHORISED"));
  for (const n of [...ids, "--owner-approval=D-235", MODEL, ADAPTER_REL, C_SHA, "1024x1536"]) assert.ok(DECISION.includes(n), n);
  assert.ok(!readFileSync(repoFile(LEGACY_REL), "utf8").split("\n").some((l) => l.startsWith("| **D-235** |")), "no row in the frozen legacy table (D-224)");
  for (const t of [JSON.stringify(CALLS), JSON.stringify(PROMPTS), SRC]) assert.ok(!/fitting-base|H1\.png/.test(t), "no H1");
});

test("D-235 frozen: method d232 as D-232 defined it, seam-contract-v2, the code pinned; the 48-outfit matrix with old items technically OK under d232", () => {
  const F = CALLS.frozen; assert.deepEqual([F.method, F.contract, F.outfitRevision], ["d232", "seam-contract-v2", "d225"]);
  assert.deepEqual(F.methodDefinition, JSON.parse(JSON.stringify(IP.METHODS.d232)), "d232 is unchanged"); assert.deepEqual(F.contractParameters, { ...BC.SEAM_CONTRACT_V2 });
  assert.deepEqual(Object.keys(F.code).sort(), Object.keys(R232.runs.code).sort()); for (const [k, v] of Object.entries(F.code)) assert.match(v, /^[0-9a-f]{64}$/, k);
  assert.match(F.afterRun, /never counts as a validation of d232/);
  const M = CALLS.matrix; assert.equal(M.tops.length * M.bottoms.length * M.shoes.length, 48); assert.equal(M.outfits, 48);
  const isNew = (id) => id in PROMPTS.items; let withNew = 0; for (const t of M.tops) for (const b of M.bottoms) for (const s of M.shoes) if ([t, b, s].some(isNew)) withNew++; assert.equal(withNew, M.withNewItem);
  assert.deepEqual([...M.tops, ...M.bottoms, ...M.shoes].filter(isNew).sort(), Object.keys(PROMPTS.items).sort(), "every new item is in the matrix");
  for (const it of M.oldItems) { const m = M232.items.find((x) => x.id === it.id); assert.ok(m, it.id); assert.equal(it.rawSha256, m.rawSha256, it.id);
    assert.equal(R232.validation.items[it.id].status, "technically-ok", it.id + " is technically OK under d232"); }
});

test("D-235 acceptance is pre-registered: five axes apart, missing items in the denominator, the decision rule, the stop rules", () => {
  const A = CALLS.acceptance; assert.deepEqual(Object.keys(A.axes), ["technical", "contract", "combinationFit", "manualFindings", "visualQuality"]);
  assert.match(A.axes.combinationFit, /all 48 planned outfits/); assert.match(A.axes.combinationFit, /missing or technically rejected item counts as NOT passing/); assert.match(A.axes.technical, /missing .* counts as rejected/);
  assert.deepEqual(Object.keys(A.decision), ["largerBatch", "fundamentalMethodChange", "otherwise"]); assert.match(A.decision.largerBatch, /T ≥ 5 AND K ≥ 39/); assert.match(A.decision.fundamentalMethodChange, /T ≤ 3 OR K < 24/);
  assert.ok(A.failureClasses.check && A.failureClasses.generation && A.failureClasses.extraction); assert.match(A.noExpansion, /no further calls/);
  assert.equal(CALLS.stopRules.length, 6); for (const r of CALLS.stopRules) assert.ok(SRC.includes(JSON.stringify(r)), "the adapter carries the stop rule: " + r);
  assert.deepEqual(CALLS.stopRules.slice(0, 5), D228.stopRules.slice(0, 5), "D-228's stop rules, unchanged");
  assert.ok(CALLS.differencesFromD228.length >= 6 && CALLS.differencesFromD228.some((d) => /no D-228 permission is reused/.test(d)));
});

test("D-235 prompts: D-207's template and coverage, v2's modelDraws (v1's text), D-228's sheet sentences — only the garments are new", () => {
  assert.equal(PROMPTS.template, P207.template); assert.deepEqual(PROMPTS.coverage, P207.coverage); assert.deepEqual(PROMPTS.modelDraws, CONTRACT.modelDraws); assert.deepEqual(PROMPTS.reference, P228.reference);
  assert.deepEqual(CONTRACT.modelDraws, json(FX + "seam-contract-v1.json").modelDraws, "v2's instructions are v1's words");
  for (const [id, e] of Object.entries(PROMPTS.items)) {
    const want = P207.template.replace("{GARMENT}", e.garment).replace("{COVERAGE}", P207.coverage[e.category]) + " " + CONTRACT.modelDraws[e.category] + " " + PROMPTS.reference[e.category];
    assert.equal(e.prompt, want, id); assert.equal(sha256(Buffer.from(e.prompt, "utf8")), e.sha256, id); assert.ok(!Object.values(P228.items).some((x) => x.garment === e.garment), id + " is a new garment"); }
});

test("D-235 consistency on the stand-in: each category's v2 sheet draws exactly the colours its sentence names; top and bottom differ from v1 at the hips, the shoe sheet is v1's", () => {
  const w = WR.buildWardrobe(), L = w.base.layers, A = w.anchors, { W, N } = WR;
  const legs = new Uint8ClampedArray(L.pants); for (let i = 0; i < (A.crotchY + 10) * W; i++) legs[i * 4 + 3] = 0;
  const base = BC.prepareBase(w, NL.overStack([w.fg.master, recolour(legs, { h: 33, s: 0.51, vScale: 1.3 })])), T = BC.templatesC(w, base, { revision: "d213" }), R = base.R;
  for (const cat of ["top", "bottom", "shoes"]) {
    const v2 = ST.seamReferenceSheet(w, base, T, cat, { contract: BC.SEAM_CONTRACT_V2 }), v1 = ST.seamReferenceSheet(w, base, T, cat), drawn = new Set();
    // a mark is its colour (a line) or half its colour over C's pixel (a band) — as seamReferenceSheet's put() mixes them, alpha included
    // (over transparent background a mark is its colour exactly)
    for (let i = 0; i < N; i++) { const k = R[i * 4 + 3] / 255, p = [v2[i * 4], v2[i * 4 + 1], v2[i * 4 + 2]]; if (v2[i * 4 + 3] === R[i * 4 + 3] && p.every((v, c) => v === R[i * 4 + c])) continue;
      for (const [name, col] of Object.entries(ST.SHEET_COLOURS)) if (p.every((v, c) => Math.abs(v - col[c]) <= 1) || (k >= 0.98 && p.every((v, c) => Math.abs(v - Math.round(0.5 * col[c] + 0.5 * (k * R[i * 4 + c] + (1 - k) * col[c]))) <= 1))) drawn.add(name); }
    const named = Object.keys(ST.SHEET_COLOURS).filter((c) => new RegExp("\\b" + c + "\\b").test(PROMPTS.reference[cat]));
    assert.deepEqual([...drawn].sort(), named.sort(), cat + ": drawn " + [...drawn] + ", named " + named);
    assert.equal(sha256(v2) === sha256(v1), cat === "shoes", cat + (cat === "shoes" ? " is v1's" : " differs from v1")); }
});

test("the adapter: no exports, only node built-ins and the ledger, exactly one fetch, no retry, the key once, every check before any claim", () => {
  assert.ok(!/^\s*export\b/m.test(CODE));
  for (const m of CODE.matchAll(/^\s*import\b[^;]*?from\s+"([^"]+)"/gm)) assert.ok(m[1].startsWith("node:") || m[1] === "./r3-face-neutral-attempt-ledger.mjs", m[1]);
  assert.equal([...CODE.matchAll(/\bfetch\s*\(/g)].length, 1);
  const prose = /no retry, no fallback|No outcome permits an automatic retry|there is no fallback|automaticRetry: false|NO RETRY|eq\("budget\.retries", get\(c, "budget", "retries"\), 0\)/gi;
  for (const x of ["retry", "retries", "backoff", "fallback"]) assert.ok(!new RegExp("\\b" + x + "\\b", "i").test(CODE.replace(prose, "")), x);
  assert.equal([...CODE.matchAll(/process\.env\.OPENAI_API_KEY/g)].length, 1);
  const body = CODE.slice(CODE.indexOf("async function main(argv)")); let last = -1;
  for (const k of ["parseArgs(argv)", "resolveRefs()", "readOriginBlobs(", "verifyPrompts(blobs)", "readC()", "verifyDecisions(", "verifyAuthorisation(", "verifyImplementation(", "readSheet(", "resolveClaimLocation(call)", "verifyOrderAndStops(", "resolveOutputs(call)", "buildBody(", "if (!args.sendMode)", "process.env.OPENAI_API" + "_KEY", "claim = createClaim(", "event(\"dispatch\"", "res = await globalThis.fetch("]) {
    const at = body.indexOf(k); assert.ok(at > last, k + " comes after the previous check"); last = at; }
  assert.match(CODE, /const MAX_CALLS = 6;/); assert.match(CODE, /const MODEL = "gpt-image-2\.5-sunburst-2026-09-08";/); assert.match(CODE, /"references", "v2", category/);
});

test("the pinned v2 sheets are C's: redrawn from C with seam-contract-v2 they are byte for byte the pinned files", { skip: SKIP }, () => {
  const w = WR.buildWardrobe(), px = Uint8ClampedArray.from(decodePng(C_BUF).px), base = BC.prepareBase(w, px), T = BC.templatesC(w, base, { revision: "d213" });
  for (const cat of ["top", "bottom", "shoes"]) assert.equal(sha256(encodePng(WR.W, WR.H, ST.seamReferenceSheet(w, base, T, cat, { contract: BC.SEAM_CONTRACT_V2, img: px }))), CALLS.request.references[cat].sha256, cat);
});

// ── sandbox: a throw-away git repository, a mocked fetch, the private C and sheets copied in ─────────────────────────────
const ROOTS = []; after(() => { for (const r of ROOTS) if (isInside(r, realpathSync.native(tmpdir())) && /d235-sandbox-/.test(r)) rmSync(r, { recursive: true, force: true }); });
const MOCK_SRC = [
  "import { appendFileSync, readFileSync } from \"node:fs\"; import { createHash } from \"node:crypto\";",
  "const LOG = process.env.D235_MOCK_LOG, PNG = process.env.D235_MOCK_PNG, MODE = process.env.D235_MOCK_MODE;",
  "if (!LOG || !PNG || !MODE) throw new Error(\"d235 mock: not configured — refusing to run\");",
  "const h = async (f) => createHash(\"sha256\").update(Buffer.from(await f.arrayBuffer())).digest(\"hex\");",
  "const err = (status, code, type) => new Response(JSON.stringify({ error: { type, code, message: \"mock \" + code } }), { status, headers: { \"content-type\": \"application/json\", \"x-request-id\": \"req_mock\" + status } });",
  "globalThis.fetch = async function d235MockFetch(url, init) {",
  "  const b = init.body; appendFileSync(LOG, JSON.stringify({ url: String(url), redirect: init.redirect, fields: [...b.keys()], imageSha: await Promise.all(b.getAll(\"image[]\").map(h)), imageNames: b.getAll(\"image[]\").map((f) => f.name), prompt: b.get(\"prompt\"), n: b.get(\"n\") }) + \"\\n\");",
  "  if (MODE === \"throw\") throw new TypeError(\"fetch failed (mock transport error)\");",
  "  if (MODE === \"quota\") return err(429, \"insufficient_quota\", \"insufficient_quota\");",
  "  if (MODE === \"moderation\") return err(400, \"moderation_blocked\", \"image_generation_user_error\");",
  "  return new Response(JSON.stringify({ created: 1, data: [{ b64_json: readFileSync(PNG).toString(\"base64\") }] }), { status: 200, headers: { \"content-type\": \"application/json\", \"x-request-id\": \"req_mockok\" } });",
  "};"].join("\n");
const TRACKED = [ADAPTER_REL, LEDGER_REL, LEGACY_REL, DECISION_REL, PLAN_DECISION_REL, CALLS_REL, PROMPTS_REL, CONTRACT_REL, FREEZE_REL, PROC_REL, SHEETS_REL];
const shape = () => { const px = new Uint8ClampedArray(1024 * 1536 * 4); for (let i = 0; i < 1024 * 1536; i++) px.set([150, 150, 150, 255], i * 4); return encodePng(1024, 1536, px); };
function envFor(sb, extra) { const env = {}; for (const k of ["PATH", "Path", "SystemRoot", "windir", "COMSPEC", "PATHEXT", "SystemDrive"]) if (typeof process.env[k] === "string") env[k] = process.env[k];
  return Object.assign(env, { LOCALAPPDATA: sb.state, XDG_STATE_HOME: sb.state, HOME: sb.home, USERPROFILE: sb.home, TEMP: sb.tmp, TMP: sb.tmp, TMPDIR: sb.tmp, HTTP_PROXY: "http://127.0.0.1:9", HTTPS_PROXY: "http://127.0.0.1:9",
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: sb.gitconfig, D235_MOCK_LOG: sb.log, D235_MOCK_PNG: sb.png, D235_MOCK_MODE: "ok" }, extra || {}); }
function sgit(sb, args) { const r = spawnSync("git", ["-C", sb.repo, "-c", "user.name=d235-sandbox", "-c", "user.email=sandbox@example.invalid", "-c", "core.autocrlf=false", ...args], { env: envFor(sb), encoding: "utf8", windowsHide: true }); if (r.status !== 0) throw new Error("sandbox git " + args.join(" ") + ": " + r.stderr); return r.stdout.trim(); }
const decisionPath = (sb) => join(sb.repo, ...DECISION_REL.split("/"));
function sandbox({ base, sheet } = {}) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "d235-sandbox-"))); ROOTS.push(root);
  const sb = { root, repo: join(root, "repo"), state: join(root, "state"), tmp: join(root, "tmp"), home: join(root, "home"), log: join(root, "fetch.log"), gitconfig: join(root, "gitconfig"), png: join(root, "out.png"), mock: join(root, "mock.mjs") };
  sb.claimDir = join(sb.state, "DenSejeApp", "one-shot-claims", "Moeller888-den-seje-app-frontend"); sb.out = join(sb.home, "Documents", "DenSejeApp-artefacts", "d-235-independent-validation");
  for (const d of [sb.repo, sb.state, sb.tmp, sb.home]) mkdirSync(d, { recursive: true });
  writeFileSync(sb.gitconfig, "[core]\n\tautocrlf = false\n[init]\n\tdefaultBranch = main\n"); writeFileSync(sb.mock, MOCK_SRC); writeFileSync(sb.log, ""); writeFileSync(sb.png, shape());
  const cd = join(sb.home, "Documents", "DenSejeApp-artefacts", "d-202-northstar-base-figure"); mkdirSync(cd, { recursive: true }); writeFileSync(join(cd, "d202-base-figure-v2.image-1.png"), C_BUF);
  for (const cat of ["top", "bottom", "shoes"]) { const d = join(sb.out, "references", "v2", cat); mkdirSync(d, { recursive: true }); writeFileSync(join(d, CALLS.request.references[cat].name), sheet && sheet[cat] ? sheet[cat] : readFileSync(sheetFile(cat))); }
  for (const rel of [...TRACKED, ".gitignore"]) { const dst = join(sb.repo, ...rel.split("/")); mkdirSync(dirname(dst), { recursive: true }); copyFileSync(repoFile(rel), dst); }
  if (base) base(sb);
  sgit(sb, ["init", "-q", "-b", "main"]); sgit(sb, ["add", "-A"]); sgit(sb, ["commit", "-q", "-m", "base"]); sgit(sb, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  return sb; }
const run = (sb, args, extra) => { const r = spawnSync(process.execPath, ["--import", pathToFileURL(sb.mock).href, join(sb.repo, ...ADAPTER_REL.split("/")), ...args], { cwd: sb.repo, env: envFor(sb, extra), encoding: "utf8", windowsHide: true, timeout: 180000 }); return { status: r.status, out: (r.stdout || "") + (r.stderr || "") }; };
const fetchLog = (sb) => readFileSync(sb.log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
function refused(sb, r, stage, sends = 0) { assert.equal(r.status, 1, r.out); assert.match(r.out, new RegExp("REFUSED \\[" + stage + "\\]"), r.out); assert.equal(fetchLog(sb).length, sends); }

test("the first dry run passes; the one send carries C then the v2 top sheet and the frozen prompt, outside the repository, never twice; the order holds; D-228's ids are refused", { skip: SKIP }, () => {
  const sb = sandbox();
  const d1 = run(sb, argsOf(ids[0])); assert.equal(d1.status, 0, d1.out); assert.match(d1.out, /DRY RUN PASSED/);
  refused(sb, run(sb, argsOf(ids[1])), "stopped");
  const old = run(sb, ["--call-id=D-228-seam-V1", "--claim-identity=D-228-seam-V1-claim"]); assert.equal(old.status, 1); assert.match(old.out, /REFUSED \[arguments\]/);
  const e = CALLS.calls[0], r = run(sb, [...argsOf(e.callId), ...SEND], KEY); assert.equal(r.status, 0, r.out);
  const L = fetchLog(sb); assert.equal(L.length, 1);
  assert.deepEqual([L[0].fields, L[0].imageSha, L[0].imageNames, L[0].n, L[0].redirect], [CALLS.request.fieldOrder, [C_SHA, CALLS.request.references.top.sha256], ["d202-base-figure-v2.image-1.png", "seam-reference-top.png"], "1", "error"]);
  assert.equal(L[0].prompt, PROMPTS.items[e.item].prompt);
  assert.ok(existsSync(join(sb.out, e.callId, "d235.image-1.png")) && existsSync(join(sb.out, e.callId, "d235.request.json"))); assert.equal(sgit(sb, ["status", "--porcelain"]), "");
  assert.equal(run(sb, [...argsOf(e.callId), ...SEND], KEY).status, 1); assert.equal(fetchLog(sb).length, 1, "never twice");
  const d2 = run(sb, argsOf(ids[1])); assert.equal(d2.status, 0, d2.out); assert.match(d2.out, /1 of 6 claims consumed/);
});

test("the stop rules: a quota rejection or an uncertain dispatch stops every later call; one moderation block does not, a second does; the stop file stops", { skip: SKIP }, () => {
  for (const mode of ["quota", "throw"]) { const sb = sandbox(); assert.equal(run(sb, [...argsOf(ids[0]), ...SEND], { ...KEY, D235_MOCK_MODE: mode }).status, 3, mode); refused(sb, run(sb, [...argsOf(ids[1]), ...SEND], KEY), "stopped", 1); }
  const mod = sandbox(); assert.equal(run(mod, [...argsOf(ids[0]), ...SEND], { ...KEY, D235_MOCK_MODE: "moderation" }).status, 3); assert.equal(run(mod, argsOf(ids[1])).status, 0);
  assert.equal(run(mod, [...argsOf(ids[1]), ...SEND], { ...KEY, D235_MOCK_MODE: "moderation" }).status, 3); refused(mod, run(mod, [...argsOf(ids[2]), ...SEND], KEY), "stopped", 2);
  const stop = sandbox(); assert.equal(run(stop, [...argsOf(ids[0]), ...SEND], KEY).status, 0); writeFileSync(join(stop.out, "D-235-STOP.json"), "{\"reason\":\"common method failure\"}\n"); refused(stop, run(stop, [...argsOf(ids[1]), ...SEND], KEY), "stopped", 1);
});

test("a v1 sheet in place of the v2 sheet or a missing token is refused before any claim; six sends are the hard cap", { skip: SKIP }, () => {
  const v1top = join(homedir(), "Documents", "DenSejeApp-artefacts", "d-228-seam-validation", "references", "v1", "top", "seam-reference-top.png");
  if (existsSync(v1top)) { const wrong = sandbox({ sheet: { top: readFileSync(v1top) } }); refused(wrong, run(wrong, [...argsOf(ids[0]), ...SEND], KEY), "reference-sheet"); }
  const noToken = sandbox({ base: (s) => writeFileSync(decisionPath(s), readFileSync(decisionPath(s), "utf8").replace("D-235 INDEPENDENT VALIDATION: 6 NEW CALLS AUTHORISED", "D-235 INDEPENDENT VALIDATION: PREPARED")) });
  refused(noToken, run(noToken, [...argsOf(ids[0]), ...SEND], KEY), "decision");
  const sb = sandbox(); for (const id of ids) assert.equal(run(sb, [...argsOf(id), ...SEND], KEY).status, 0, id);
  assert.equal(fetchLog(sb).length, 6); for (const id of ids) assert.equal(run(sb, [...argsOf(id), ...SEND], KEY).status, 1); assert.equal(fetchLog(sb).length, 6, "six sends at most");
});
