// D-319/D-320 — the ankle-boot source attempt: the locked plan (ab-plan-v1.json pins the shoe cut kit, the contract, the cut evaluation,
// its reference builder and master v5), and ONE one-shot call (ab-authorisation-v1.json, tools/avatar/openai-send-northstar-ankleboot-
// source-d320.mjs). The static tests run everywhere. The mocked sends need the layout reference, kept outside the clones: they run only
// where it exists — skipped in CI, never faked. A dummy key and a mocked fetch only; the real key is never read (D-142). Nothing here
// approves a shoe; 0 image calls.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, copyFileSync, realpathSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join, dirname, relative, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir, homedir } from "node:os";
import { encodePng } from "../../tools/avatar/r3-hair-tool-v2.mjs";
import * as E2 from "../../tools/avatar/northstar-shoe-eval-v2.mjs";
import * as V5 from "../../tools/avatar/northstar-shoe-master-v5.mjs";
import * as KIT from "../../tools/avatar/northstar-shoe-cut-kit.mjs";
import * as EV from "../../tools/avatar/northstar-shoe-cut-evaluate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = resolve(HERE, "..", "..");
const sha256 = (b) => createHash("sha256").update(b).digest("hex"), repoFile = (rel) => join(REPO, ...rel.split("/")), FX = "tools/avatar/fixtures/northstar-wardrobe/shoe-source/";
const ADAPTER_REL = "tools/avatar/openai-send-northstar-ankleboot-source-d320.mjs", LEDGER_REL = "tools/avatar/r3-face-neutral-attempt-ledger.mjs", LEGACY_REL = "docs/project-state.md";
const DECISION_REL = "docs/decisions/D-320.md", PLAN_DECISION_REL = "docs/decisions/D-319.md", AUTH_REL = FX + "ab-authorisation-v1.json", PLAN_REL = FX + "ab-plan-v1.json";
const SRC = readFileSync(repoFile(ADAPTER_REL), "utf8"), CODE = SRC.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
const json = (rel) => JSON.parse(readFileSync(repoFile(rel), "utf8"));
const AUTH = json(AUTH_REL), PLAN = json(PLAN_REL), DECISION = readFileSync(repoFile(DECISION_REL), "utf8");
const MODEL = "gpt-image-2.5-sunburst-2026-09-08", ID = "AB-1-shoes-ankleboot-tight-k4", METHOD_FILES = Object.keys(PLAN.method.files);
const argsOf = (id) => ["--call-id=" + id, "--claim-identity=" + id + "-claim"], SEND = ["--send", "--owner-approval=D-320"], KEY = { ["OPENAI_API" + "_KEY"]: "sk-d320-sandbox-dummy-key-not-a-credential" };
const KEY_READ = "process.env." + "OPENAI_API" + "_KEY";   // spelt in parts so this file never reads it (the D-142 guard)
const LAYOUT = AUTH.request.canvases["ankle-boot-k4"], LAYOUT_FILE = join(homedir(), "Documents", "DenSejeApp-artefacts", "ab-calls", "references", "ankle-boot-k4", LAYOUT.name);
const HAVE = existsSync(LAYOUT_FILE) && sha256(readFileSync(LAYOUT_FILE)) === LAYOUT.sha256;
const SKIP = HAVE ? false : "the layout reference is kept outside the clones; build it with northstar-shoe-cut-reference.mjs to run the mocked sends";
const isInside = (c, p) => { const r = relative(p, c); return r === "" || (!r.startsWith("..") && !isAbsolute(r)); };
const plain = (o) => JSON.parse(JSON.stringify(o));

test("D-319 the locked method: every pinned file is the working tree's; the contract, the acceptance rules and the designs are the code's", () => {
  assert.deepEqual(METHOD_FILES, ["tools/avatar/northstar-shoe-cut-kit.mjs", "tools/avatar/northstar-shoe-cut-evaluate.mjs", "tools/avatar/northstar-shoe-cut-reference.mjs", "tools/avatar/fixtures/northstar-wardrobe/shoe-cuts/ankle-boot.json", "tools/avatar/northstar-shoe-master.mjs", "tools/avatar/northstar-shoe-master-v5.mjs", "tools/avatar/northstar-shoe-eval-v2.mjs", "tools/avatar/northstar-shoe-source.mjs", "tools/avatar/northstar-shoe-master-study.mjs", "tools/avatar/northstar-r1-garment.mjs"]);
  for (const f of METHOD_FILES) assert.equal(sha256(readFileSync(repoFile(f))), PLAN.method.files[f], f + " changed after the lock: a changed method is a new plan version");
  const cut = KIT.loadCut("ankle-boot"); assert.equal(cut.contractVersion, 2); assert.deepEqual(Object.keys(cut.fields), ["upper", "rim", "sole"]); assert.deepEqual(PLAN.geometry.crop, plain(cut.source.crop));
  assert.deepEqual(PLAN.acceptance.accept, plain(EV.ACCEPT)); assert.deepEqual(PLAN.acceptance.verdict, plain(EV.VERDICT)); assert.deepEqual(PLAN.acceptance.bottoms, plain(cut.evaluation.bottoms));
  assert.deepEqual(Object.keys(PLAN.acceptance.designs), ["original colour", "light sand suede (SYNTHETIC)", "contrast black + gum (SYNTHETIC)"]); for (const [n, d] of Object.entries(PLAN.acceptance.designs)) if (d !== "original") assert.deepEqual(Object.keys(d), ["upper", "rim", "sole"], n);
  assert.match(PLAN.method.revision, new RegExp(V5.SPEC_V5.revision)); assert.equal(PLAN.authorisesImageRequest, false); assert.match(PLAN.purpose, /not a general validation/); assert.match(PLAN.acceptance.afterReceipt, /development material/);
});

test("D-319 the prompt keeps the reference's geometry and names the four defects to avoid; the reference is the guide, labelled as guidance", () => {
  const t = PLAN.call.prompt.text; assert.equal(PLAN.call.prompt.sha256, sha256(Buffer.from(t, "utf8"))); assert.ok(!/[{}]|undefined|null|NaN/.test(t));
  for (const re of [/same places, at the same size and angle/, /rim band .* one continuous, unbroken seam line/, /sole is separated from the upper by one continuous, unbroken welt line/, /nothing sticks up from the shaft's corners/, /no skin-coloured, orange, cream or light specks/, /clearly lighter than Image 1 but clearly darker than skin/, /opening at the top of each shaft is EMPTY and fully transparent/, /do not copy its colours, its darkness or its flaws/]) assert.match(t, re);
  assert.deepEqual([PLAN.request.model, PLAN.request.parameters], [MODEL, { size: "1536x1024", quality: "high", n: 1, output_format: "png", background: "transparent" }]);
  assert.equal(PLAN.request.images.length, 1); assert.match(PLAN.request.images[0].made, /GUIDANCE/); assert.deepEqual(PLAN.request.neverSent, ["C", "any other image", "mask", "input_fidelity"]);
});

test("D-320 authorisation: one one-shot call of the locked plan, UNSPENT, its own budget, no reserve, retry, fallback or earlier permission; C never sent", () => {
  assert.deepEqual([AUTH.decision, AUTH.meta.authorisesImageRequest, AUTH.budget.authorised, AUTH.budget.reserve, AUTH.budget.retries, AUTH.budget.fallback, AUTH.budget.reusesEarlierPermissions, AUTH.budget.actuallySent], ["D-320", false, 1, 0, 0, false, false, 0]);
  assert.deepEqual(AUTH.calls.map((e) => [e.callId, e.order, e.mandateState, e.outcome]), [[ID, 1, "UNSPENT", "NOT YET ATTEMPTED"]]); assert.ok(!("result" in AUTH.calls[0]) && !AUTH.budget.closed);
  assert.equal(AUTH.frozen.plan.sha256, sha256(readFileSync(repoFile(PLAN_REL)))); assert.equal(AUTH.frozen.prompt.sha256, PLAN.call.prompt.sha256); assert.deepEqual(AUTH.frozen.methodFiles, PLAN.method.files);
  assert.deepEqual([AUTH.request.model, AUTH.request.parameters.size, AUTH.request.images.length, AUTH.calls[0].canvas], [MODEL, "1536x1024", 1, LAYOUT.sha256]); assert.equal(PLAN.request.images[0].sha256, LAYOUT.sha256);
  assert.ok(!/d202-base-figure/.test(SRC), "the adapter never names C");
  const status = /^status: (.*)$/m.exec(DECISION)[1]; assert.ok(status.split(" — ").map((x) => x.trim()).includes("D-320 AB: 1 CALL AUTHORISED")); assert.match(status, /NOT EXECUTED/);
  for (const n of [ID, "--owner-approval=D-320", MODEL, ADAPTER_REL, AUTH.frozen.prompt.sha256, AUTH.frozen.plan.sha256, "1536x1024", LAYOUT.sha256]) assert.ok(DECISION.includes(n), n);
  for (const id of ["D-319", "D-320"]) assert.ok(!readFileSync(repoFile(LEGACY_REL), "utf8").split("\n").some((l) => l.startsWith("| **" + id + "** |")));
  for (const t of [JSON.stringify(AUTH), JSON.stringify(PLAN), SRC]) assert.ok(!/fitting-base|H1\.png/.test(t), "no H1");
  assert.equal(AUTH.budget.price.verifiedAt, "2026-11-02"); assert.match(AUTH.budget.price.note, /estimate, not a guaranteed maximum/); assert.ok(AUTH.budget.price.perCallUpperEstimate <= 0.07);
});

test("the adapter: no exports, only node built-ins and the ledger, exactly one fetch, the key once, one image, every check (the method lock included) before any claim", () => {
  assert.ok(!/^\s*export\b/m.test(CODE));
  for (const m of CODE.matchAll(/^\s*import\b[^;]*?from\s+"([^"]+)"/gm)) assert.ok(m[1].startsWith("node:") || m[1] === "./r3-face-neutral-attempt-ledger.mjs", m[1]);
  assert.equal([...CODE.matchAll(/\bfetch\s*\(/g)].length, 1); assert.equal(CODE.split(KEY_READ).length - 1, 1); assert.equal([...CODE.matchAll(/fd\.append\(IMAGE_FIELD/g)].length, 1);
  const body = CODE.slice(CODE.indexOf("async function main(argv)")); let last = -1;
  for (const k of ["parseArgs(argv)", "resolveRefs()", "readOriginBlobs(", "verifyPrompts(blobs)", "verifyDecisions(", "verifyAuthorisation(", "verifyImplementation(", "readCanvas(", "resolveClaimLocation(call)", "verifyOrderAndStops(", "resolveOutputs(call)", "buildBody(", "if (!args.sendMode)", KEY_READ, "createClaim(", "globalThis.fetch("]) {
    const at = body.indexOf(k); assert.ok(at > last, k + " comes after the previous check"); last = at; }
  assert.match(CODE, /const MAX_CALLS = 1;/); assert.match(CODE, /const OUT_DIR_NAME = "ab-calls";/); assert.ok(!/SV-1-shoes|sv-authorisation|D-300 SV|SS-1-shoes/.test(CODE), "no earlier identity left");
  for (const r of AUTH.stopRules) assert.ok(SRC.includes(JSON.stringify(r)), "the adapter carries the stop rule: " + r);
  for (const f of METHOD_FILES) assert.ok(SRC.includes(JSON.stringify(f)), "the adapter locks " + f);
});

// ── sandbox: a throw-away git repository, a mocked fetch, the layout reference copied in ─────────────────────────────────
const ROOTS = []; after(() => { for (const r of ROOTS) if (isInside(r, realpathSync.native(tmpdir())) && /d320-sandbox-/.test(r)) rmSync(r, { recursive: true, force: true }); });
const MOCK_SRC = [
  "import { appendFileSync, readFileSync } from \"node:fs\"; import { createHash } from \"node:crypto\";",
  "const LOG = process.env.D320_MOCK_LOG, PNG = process.env.D320_MOCK_PNG, MODE = process.env.D320_MOCK_MODE;",
  "if (!LOG || !PNG || !MODE) throw new Error(\"d320 mock: not configured — refusing to run\");",
  "const h = async (f) => createHash(\"sha256\").update(Buffer.from(await f.arrayBuffer())).digest(\"hex\");",
  "globalThis.fetch = async function d320MockFetch(url, init) {",
  "  const b = init.body; appendFileSync(LOG, JSON.stringify({ url: String(url), redirect: init.redirect, fields: [...b.keys()], imageSha: await Promise.all(b.getAll(\"image[]\").map(h)), imageNames: b.getAll(\"image[]\").map((f) => f.name), prompt: b.get(\"prompt\"), size: b.get(\"size\"), n: b.get(\"n\") }) + \"\\n\");",
  "  if (MODE === \"throw\") throw new TypeError(\"fetch failed (mock transport error)\");",
  "  return new Response(JSON.stringify({ created: 1, data: [{ b64_json: readFileSync(PNG).toString(\"base64\") }] }), { status: 200, headers: { \"content-type\": \"application/json\", \"x-request-id\": \"req_mockok\" } });",
  "};"].join("\n");
const TRACKED = [ADAPTER_REL, LEDGER_REL, LEGACY_REL, DECISION_REL, PLAN_DECISION_REL, AUTH_REL, PLAN_REL, ...METHOD_FILES];
const png = (w2, h2) => { const px = new Uint8ClampedArray(w2 * h2 * 4); for (let i = 0; i < w2 * h2; i++) px.set([150, 150, 150, 255], i * 4); return encodePng(w2, h2, px); };
function envFor(sb, extra) { const env = {}; for (const k of ["PATH", "Path", "SystemRoot", "windir", "COMSPEC", "PATHEXT", "SystemDrive"]) if (typeof process.env[k] === "string") env[k] = process.env[k];
  return Object.assign(env, { LOCALAPPDATA: sb.state, XDG_STATE_HOME: sb.state, HOME: sb.home, USERPROFILE: sb.home, TEMP: sb.tmp, TMP: sb.tmp, TMPDIR: sb.tmp, HTTP_PROXY: "http://127.0.0.1:9", HTTPS_PROXY: "http://127.0.0.1:9",
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: sb.gitconfig, D320_MOCK_LOG: sb.log, D320_MOCK_PNG: sb.png, D320_MOCK_MODE: "ok" }, extra || {}); }
function sgit(sb, args) { const r = spawnSync("git", ["-C", sb.repo, "-c", "user.name=d320-sandbox", "-c", "user.email=sandbox@example.invalid", "-c", "core.autocrlf=false", ...args], { env: envFor(sb), encoding: "utf8", windowsHide: true }); if (r.status !== 0) throw new Error("sandbox git " + args.join(" ") + ": " + r.stderr); return r.stdout.trim(); }
function sandbox({ base: mod, layout } = {}) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "d320-sandbox-"))); ROOTS.push(root);
  const sb = { root, repo: join(root, "repo"), state: join(root, "state"), tmp: join(root, "tmp"), home: join(root, "home"), log: join(root, "fetch.log"), gitconfig: join(root, "gitconfig"), png: join(root, "out.png"), mock: join(root, "mock.mjs") };
  sb.out = join(sb.home, "Documents", "DenSejeApp-artefacts", "ab-calls"); for (const d of [sb.repo, sb.state, sb.tmp, sb.home]) mkdirSync(d, { recursive: true });
  writeFileSync(sb.gitconfig, "[core]\n\tautocrlf = false\n[init]\n\tdefaultBranch = main\n"); writeFileSync(sb.mock, MOCK_SRC); writeFileSync(sb.log, ""); writeFileSync(sb.png, png(1536, 1024));
  const rd = join(sb.out, "references", "ankle-boot-k4"); mkdirSync(rd, { recursive: true }); writeFileSync(join(rd, LAYOUT.name), layout || readFileSync(LAYOUT_FILE));
  for (const rel of TRACKED) { const dst = join(sb.repo, ...rel.split("/")); mkdirSync(dirname(dst), { recursive: true }); copyFileSync(repoFile(rel), dst); }
  if (mod) mod(sb);
  sgit(sb, ["init", "-q", "-b", "main"]); sgit(sb, ["add", "-A"]); sgit(sb, ["commit", "-q", "-m", "base"]); sgit(sb, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  return sb; }
const run = (sb, args, extra) => { const r = spawnSync(process.execPath, ["--import", pathToFileURL(sb.mock).href, join(sb.repo, ...ADAPTER_REL.split("/")), ...args], { cwd: sb.repo, env: envFor(sb, extra), encoding: "utf8", windowsHide: true, timeout: 180000 }); return { status: r.status, out: (r.stdout || "") + (r.stderr || "") }; };
const fetchLog = (sb) => readFileSync(sb.log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
function refused(sb, r, stage, sends = 0) { assert.equal(r.status, 1, r.out); assert.match(r.out, new RegExp("REFUSED \\[" + stage + "\\]"), r.out); assert.equal(fetchLog(sb).length, sends); }

test("the dry run passes; the one send carries the layout reference only and the locked prompt, outside the repository, never twice; other ids are refused", { skip: SKIP }, () => {
  const sb = sandbox(); const d = run(sb, argsOf(ID)); assert.equal(d.status, 0, d.out); assert.match(d.out, /DRY RUN PASSED/);
  for (const old of ["SV-1-shoes-sneakers-low-tight-k4", "AB-2-other"]) { const r = run(sb, argsOf(old)); assert.equal(r.status, 1); assert.match(r.out, /REFUSED \[arguments\]/); }
  const r = run(sb, [...argsOf(ID), ...SEND], KEY); assert.equal(r.status, 0, r.out); const Lg = fetchLog(sb); assert.equal(Lg.length, 1);
  assert.deepEqual([Lg[0].fields, Lg[0].imageSha, Lg[0].imageNames, Lg[0].size, Lg[0].n, Lg[0].redirect], [AUTH.request.fieldOrder, [LAYOUT.sha256], [LAYOUT.name], "1536x1024", "1", "error"]);
  assert.equal(Lg[0].prompt, PLAN.call.prompt.text);
  assert.ok(existsSync(join(sb.out, ID, "ab.image-1.png")) && existsSync(join(sb.out, ID, "ab.request.json"))); assert.equal(sgit(sb, ["status", "--porcelain"]), "");
  assert.equal(run(sb, [...argsOf(ID), ...SEND], KEY).status, 1); assert.equal(fetchLog(sb).length, 1, "never twice");
});

test("a changed method file, an uncertain dispatch, the stop file, a changed reference, a missing token or no owner flag is refused before any claim", { skip: SKIP }, () => {
  const changed = sandbox({ base: (s) => { const p = join(s.repo, ..."tools/avatar/northstar-shoe-cut-evaluate.mjs".split("/")); writeFileSync(p, readFileSync(p, "utf8").replace("minLineContrast: 0.2", "minLineContrast: 0.1")); } });
  refused(changed, run(changed, [...argsOf(ID), ...SEND], KEY), "pins");
  const u = sandbox(); assert.equal(run(u, [...argsOf(ID), ...SEND], { ...KEY, D320_MOCK_MODE: "throw" }).status, 3); assert.equal(run(u, [...argsOf(ID), ...SEND], KEY).status, 1); assert.equal(fetchLog(u).length, 1);
  const stop = sandbox({ base: (s) => { mkdirSync(s.out, { recursive: true }); writeFileSync(join(s.out, "AB-STOP.json"), "{}\n"); } }); refused(stop, run(stop, [...argsOf(ID), ...SEND], KEY), "stopped");
  const wrong = sandbox({ layout: png(1536, 1024) }); refused(wrong, run(wrong, [...argsOf(ID), ...SEND], KEY), "reference-canvas");
  const noToken = sandbox({ base: (s) => { const p = join(s.repo, ...DECISION_REL.split("/")); writeFileSync(p, readFileSync(p, "utf8").replace("D-320 AB: 1 CALL AUTHORISED", "D-320 AB: PREPARED")); } }); refused(noToken, run(noToken, [...argsOf(ID), ...SEND], KEY), "decision");
  const noFlag = sandbox(); refused(noFlag, run(noFlag, [...argsOf(ID), "--send"], KEY), "arguments");
});
