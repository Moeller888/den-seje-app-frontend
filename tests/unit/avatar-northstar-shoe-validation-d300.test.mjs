// D-299/D-300 — the shoe validation: the locked method (sv-plan-v1.json pins D-297's files and parameters), the validation evaluator's
// verdict rules, and ONE one-shot call (sv-authorisation-v1.json, tools/avatar/openai-send-northstar-shoe-validation-d300.mjs). The
// static tests run everywhere. The mocked sends need the layout reference, kept outside the clones: they run only where it exists —
// skipped in CI, never faked. A dummy key and a mocked fetch only; the real key is never read (D-142). Nothing here approves a shoe.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, copyFileSync, realpathSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join, dirname, relative, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir, homedir } from "node:os";
import { encodePng } from "../../tools/avatar/r3-hair-tool-v2.mjs";
import * as SM from "../../tools/avatar/northstar-shoe-master.mjs";
import * as SS from "../../tools/avatar/northstar-shoe-source.mjs";
import * as E2 from "../../tools/avatar/northstar-shoe-eval-v2.mjs";
import * as V from "../../tools/avatar/northstar-shoe-validation-evaluate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = resolve(HERE, "..", "..");
const sha256 = (b) => createHash("sha256").update(b).digest("hex"), repoFile = (rel) => join(REPO, ...rel.split("/")), FX = "tools/avatar/fixtures/northstar-wardrobe/shoe-source/";
const ADAPTER_REL = "tools/avatar/openai-send-northstar-shoe-validation-d300.mjs", LEDGER_REL = "tools/avatar/r3-face-neutral-attempt-ledger.mjs", LEGACY_REL = "docs/project-state.md";
const DECISION_REL = "docs/decisions/D-300.md", PLAN_DECISION_REL = "docs/decisions/D-299.md", AUTH_REL = FX + "sv-authorisation-v1.json", PLAN_REL = FX + "sv-plan-v1.json";
const SRC = readFileSync(repoFile(ADAPTER_REL), "utf8"), CODE = SRC.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
const json = (rel) => JSON.parse(readFileSync(repoFile(rel), "utf8"));
const AUTH = json(AUTH_REL), PLAN = json(PLAN_REL), DECISION = readFileSync(repoFile(DECISION_REL), "utf8"), OLD_PLAN = json(FX + "ss-plan-v1.json");
const MODEL = "gpt-image-2.5-sunburst-2026-09-08", ID = "SV-1-shoes-sneakers-low-tight-k4", METHOD_FILES = Object.keys(PLAN.method.files);
const argsOf = (id) => ["--call-id=" + id, "--claim-identity=" + id + "-claim"], SEND = ["--send", "--owner-approval=D-300"], KEY = { ["OPENAI_API" + "_KEY"]: "sk-d300-sandbox-dummy-key-not-a-credential" };
const KEY_READ = "process.env." + "OPENAI_API" + "_KEY";   // spelt in parts so this file never reads it (the D-142 guard)
const LAYOUT = AUTH.request.canvases["sneaker-low-k4"], LAYOUT_FILE = join(homedir(), "Documents", "DenSejeApp-artefacts", "sv-calls", "references", "sneaker-low-k4", LAYOUT.name);
const HAVE = existsSync(LAYOUT_FILE) && sha256(readFileSync(LAYOUT_FILE)) === LAYOUT.sha256;
const SKIP = HAVE ? false : "the layout reference is kept outside the clones; copy D-294's reference to run the mocked sends";
const isInside = (c, p) => { const r = relative(p, c); return r === "" || (!r.startsWith("..") && !isAbsolute(r)); };
const plain = (o) => JSON.parse(JSON.stringify(o));

test("D-299 the locked method: every pinned file is the working tree's, every pinned parameter is the code's; SS-1 is excluded", () => {
  assert.deepEqual(METHOD_FILES, ["tools/avatar/northstar-shoe-master.mjs", "tools/avatar/northstar-shoe-eval-v2.mjs", "tools/avatar/northstar-shoe-source.mjs", "tools/avatar/northstar-shoe-validation-evaluate.mjs", "tools/avatar/northstar-shoe-master-study.mjs", "tools/avatar/northstar-shoe-edge-study.mjs", "tools/avatar/northstar-r1-garment.mjs"]);
  for (const f of METHOD_FILES) assert.equal(sha256(readFileSync(repoFile(f))), PLAN.method.files[f], f + " changed after the lock: a changed method is a new plan version and a new validation");
  const p = PLAN.method.parameters; assert.equal(PLAN.method.revision, "shoe-master-v4-line");
  assert.deepEqual([p.SPEC_V4, p.DETAIL_RULE, p.COLLAR_RULE, p.COLLAR_ZONE, p.HALO_RULE, p.LINE_RULE, p.VOLUME_RULE, p.AA_RULE, p.SKIN_DE], plain([SM.SPEC_V4, SS.DETAIL_RULE, E2.COLLAR_RULE, E2.COLLAR_ZONE, E2.HALO_RULE, E2.LINE_RULE, V.VOLUME_RULE, V.AA_RULE, SS.SKIN_DE]));
  for (const k of Object.keys(p.GEOMETRY_RULE_SHAPE)) assert.deepEqual(p.GEOMETRY_RULE_SHAPE[k], plain(SS.GEOMETRY_RULE[k]), k);
  assert.deepEqual(PLAN.acceptance.combination.combo2.known, plain(V.KNOWN_COMBO2)); assert.equal(V.KNOWN_COMBO2.length, 9); assert.deepEqual(PLAN.acceptance.variant.designs, plain(V.DESIGNS));
  assert.equal(PLAN.authorisesImageRequest, false); assert.match(PLAN.frozen.excluded, /^SS-1 .* development material/); assert.match(PLAN.frozen.noRepair, /no repair, retouch, free deformation/);
  assert.match(PLAN.acceptance.rawImageIsNotAMaster, /not an approved master/);
});

test("D-299 the prompt: D-294's text word for word plus ONE collar bullet; the reference, request and geometry are D-294's", () => {
  const t = PLAN.call.prompt.text, o = OLD_PLAN.call.prompt.text; assert.equal(PLAN.call.prompt.sha256, sha256(Buffer.from(t, "utf8")));
  const added = t.split("\n").filter((l) => !o.split("\n").includes(l)); assert.equal(added.length, 1); assert.match(added[0], /^- the same collar line:/);
  assert.equal(t.split("\n").filter((l) => l !== added[0]).join("\n"), o); assert.equal(PLAN.call.promptChange.from.sha256, OLD_PLAN.call.prompt.sha256);
  assert.deepEqual([PLAN.request.endpoint, PLAN.request.model, PLAN.request.parameters], [OLD_PLAN.request.endpoint, OLD_PLAN.request.model, OLD_PLAN.request.parameters]);
  assert.deepEqual([PLAN.request.images.length, PLAN.request.images[0].sha256, PLAN.request.images[0].bytes], [1, OLD_PLAN.request.images[0].sha256, OLD_PLAN.request.images[0].bytes]); assert.deepEqual(PLAN.geometry, OLD_PLAN.geometry);
});

test("D-299 the verdict: automatic FAIL stays FAIL whatever the visual says; PASS needs a visual OK; the method is confirmed only on agreement", () => {
  const ok = "USABLE SOURCE (automatic)", vOk = "USABLE VARIANT (automatic)", vars = (v) => Object.fromEntries(V.DESIGNS.map((n) => [n, { verdict: v }]));
  const units = { ["contrast navy + white (SYNTHETIC) | bottom-trousers-square-sand"]: { verdict: "FAIL", technical: "FAIL", failed: ["COMBO-2-DOUBLE-CONTOUR [KNOWN_D291]"] }, ["original colour | bottom-shorts-navy"]: { verdict: "USABLE COMBINATION (automatic)", technical: "PASS", failed: [] } };
  const allOk = Object.fromEntries(["source", ...V.DESIGNS.map((n) => "variant: " + n), ...Object.keys(units).map((k) => "combination: " + k)].map((k) => [k, { verdict: "OK", diagnosis: "laces and seams read correctly" }]));
  const r = V.conclude({ verdict: ok }, { measurable: true, variants: vars(vOk) }, { measurable: true, units }, allOk);
  assert.equal(r.method, "METHOD CONFIRMED"); assert.equal(r.source.usable, true);
  const k = r.combinations["contrast navy + white (SYNTHETIC) | bottom-trousers-square-sand"]; assert.deepEqual([k.automatic, k.visual, k.usable], ["FAIL", "OK", false], "a visual OK never turns an automatic FAIL into PASS");
  assert.equal(r.combinations["original colour | bottom-shorts-navy"].usable, true);
  const none = V.conclude({ verdict: ok }, { measurable: true, variants: vars(vOk) }, { measurable: true, units }, null); assert.match(none.method, /^INCOMPLETE/); assert.equal(none.source.usable, false, "no automatic PASS is usable without the visual review");
  const dis = V.conclude({ verdict: "REJECTED SOURCE" }, { measurable: true, variants: vars("NOT USABLE") }, null, allOk); assert.match(dis.method, /^METHOD DISAGREES: source \(automatic FAIL, visual OK\)/); assert.equal(dis.source.usable, false);
  const bad = Object.fromEntries(Object.entries(allOk).map(([kk]) => [kk, { verdict: "NOT OK" }])), rej = V.conclude({ verdict: "REJECTED SOURCE" }, { measurable: false }, null, bad); assert.equal(rej.method, "METHOD CONFIRMED");
});

test("D-299 antialiasing is measured on the source: a binary-alpha drawing fails although its downscale looks antialiased", () => {
  const s4 = SS.synthShoe(4), bin = { w: s4.w, h: s4.h, px: Uint8ClampedArray.from(s4.px) }; for (let i = 3; i < bin.px.length; i += 4) bin.px[i] = bin.px[i] >= 128 ? 255 : 0;
  assert.ok(V.sourceEdgeAntialiased(s4) >= V.AA_RULE.minEdgeShare); assert.equal(V.sourceEdgeAntialiased(bin), 0);
  const p = SS.place(SS.downscale(bin)); assert.ok(E2.haloInAvatar(p, p).edgeAntialiased > 0.5, "the downscale alone makes partial alpha");
});

test("D-300 authorisation: one unspent one-shot call of the locked plan, its own budget, no reserve, retry, fallback or earlier permission; C never sent", () => {
  assert.deepEqual([AUTH.decision, AUTH.meta.authorisesImageRequest, AUTH.budget.authorised, AUTH.budget.reserve, AUTH.budget.retries, AUTH.budget.fallback, AUTH.budget.reusesEarlierPermissions, AUTH.budget.actuallySent], ["D-300", false, 1, 0, 0, false, false, 0]);
  assert.deepEqual(AUTH.calls.map((e) => [e.callId, e.order, e.mandateState, e.outcome]), [[ID, 1, "UNSPENT", "NOT YET ATTEMPTED"]]);
  assert.equal(AUTH.frozen.plan.sha256, sha256(readFileSync(repoFile(PLAN_REL)))); assert.equal(AUTH.frozen.prompt.sha256, PLAN.call.prompt.sha256); assert.deepEqual(AUTH.frozen.methodFiles, PLAN.method.files);
  assert.deepEqual([AUTH.request.model, AUTH.request.parameters.size, AUTH.request.images.length, AUTH.calls[0].canvas], [MODEL, "1536x1024", 1, LAYOUT.sha256]);
  assert.match(AUTH.privacy.cSentToApi, /^never/); assert.ok(!/d202-base-figure/.test(SRC), "the adapter never names C");
  const status = /^status: (.*)$/m.exec(DECISION)[1]; assert.ok(status.split(" — ").map((x) => x.trim()).includes("D-300 SV: 1 CALL AUTHORISED")); assert.match(status, /NOT EXECUTED/);
  for (const n of [ID, "--owner-approval=D-300", MODEL, ADAPTER_REL, AUTH.frozen.prompt.sha256, AUTH.frozen.plan.sha256, "1536x1024", LAYOUT.sha256]) assert.ok(DECISION.includes(n), n);
  for (const id of ["D-299", "D-300"]) assert.ok(!readFileSync(repoFile(LEGACY_REL), "utf8").split("\n").some((l) => l.startsWith("| **" + id + "** |")));
  for (const t of [JSON.stringify(AUTH), JSON.stringify(PLAN), SRC]) assert.ok(!/fitting-base|H1\.png/.test(t), "no H1");
  assert.equal(AUTH.budget.price.verifiedAt, "2026-11-01"); assert.match(AUTH.budget.price.note, /estimate, not a guaranteed maximum/); assert.ok(AUTH.budget.price.perCallUpperEstimate <= 0.07);
});

test("the adapter: no exports, only node built-ins and the ledger, exactly one fetch, the key once, one image, every check (the method lock included) before any claim", () => {
  assert.ok(!/^\s*export\b/m.test(CODE));
  for (const m of CODE.matchAll(/^\s*import\b[^;]*?from\s+"([^"]+)"/gm)) assert.ok(m[1].startsWith("node:") || m[1] === "./r3-face-neutral-attempt-ledger.mjs", m[1]);
  assert.equal([...CODE.matchAll(/\bfetch\s*\(/g)].length, 1); assert.equal(CODE.split(KEY_READ).length - 1, 1); assert.equal([...CODE.matchAll(/fd\.append\(IMAGE_FIELD/g)].length, 1);
  const body = CODE.slice(CODE.indexOf("async function main(argv)")); let last = -1;
  for (const k of ["parseArgs(argv)", "resolveRefs()", "readOriginBlobs(", "verifyPrompts(blobs)", "verifyDecisions(", "verifyAuthorisation(", "verifyImplementation(", "readCanvas(", "resolveClaimLocation(call)", "verifyOrderAndStops(", "resolveOutputs(call)", "buildBody(", "if (!args.sendMode)", KEY_READ, "createClaim(", "globalThis.fetch("]) {
    const at = body.indexOf(k); assert.ok(at > last, k + " comes after the previous check"); last = at; }
  assert.match(CODE, /const MAX_CALLS = 1;/); assert.match(CODE, /const OUT_DIR_NAME = "sv-calls";/); assert.ok(!/SS-1-shoes|ss-authorisation|D-295 SS/.test(CODE), "no D-295 identity left");
  for (const r of AUTH.stopRules) assert.ok(SRC.includes(JSON.stringify(r)), "the adapter carries the stop rule: " + r);
  for (const f of METHOD_FILES) assert.ok(SRC.includes(JSON.stringify(f)), "the adapter locks " + f);
});

// ── sandbox: a throw-away git repository, a mocked fetch, the layout reference copied in ─────────────────────────────────
const ROOTS = []; after(() => { for (const r of ROOTS) if (isInside(r, realpathSync.native(tmpdir())) && /d300-sandbox-/.test(r)) rmSync(r, { recursive: true, force: true }); });
const MOCK_SRC = [
  "import { appendFileSync, readFileSync } from \"node:fs\"; import { createHash } from \"node:crypto\";",
  "const LOG = process.env.D300_MOCK_LOG, PNG = process.env.D300_MOCK_PNG, MODE = process.env.D300_MOCK_MODE;",
  "if (!LOG || !PNG || !MODE) throw new Error(\"d300 mock: not configured — refusing to run\");",
  "const h = async (f) => createHash(\"sha256\").update(Buffer.from(await f.arrayBuffer())).digest(\"hex\");",
  "globalThis.fetch = async function d300MockFetch(url, init) {",
  "  const b = init.body; appendFileSync(LOG, JSON.stringify({ url: String(url), redirect: init.redirect, fields: [...b.keys()], imageSha: await Promise.all(b.getAll(\"image[]\").map(h)), imageNames: b.getAll(\"image[]\").map((f) => f.name), prompt: b.get(\"prompt\"), size: b.get(\"size\"), n: b.get(\"n\") }) + \"\\n\");",
  "  if (MODE === \"throw\") throw new TypeError(\"fetch failed (mock transport error)\");",
  "  return new Response(JSON.stringify({ created: 1, data: [{ b64_json: readFileSync(PNG).toString(\"base64\") }] }), { status: 200, headers: { \"content-type\": \"application/json\", \"x-request-id\": \"req_mockok\" } });",
  "};"].join("\n");
const TRACKED = [ADAPTER_REL, LEDGER_REL, LEGACY_REL, DECISION_REL, PLAN_DECISION_REL, AUTH_REL, PLAN_REL, ...METHOD_FILES];
const png = (w2, h2) => { const px = new Uint8ClampedArray(w2 * h2 * 4); for (let i = 0; i < w2 * h2; i++) px.set([150, 150, 150, 255], i * 4); return encodePng(w2, h2, px); };
function envFor(sb, extra) { const env = {}; for (const k of ["PATH", "Path", "SystemRoot", "windir", "COMSPEC", "PATHEXT", "SystemDrive"]) if (typeof process.env[k] === "string") env[k] = process.env[k];
  return Object.assign(env, { LOCALAPPDATA: sb.state, XDG_STATE_HOME: sb.state, HOME: sb.home, USERPROFILE: sb.home, TEMP: sb.tmp, TMP: sb.tmp, TMPDIR: sb.tmp, HTTP_PROXY: "http://127.0.0.1:9", HTTPS_PROXY: "http://127.0.0.1:9",
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: sb.gitconfig, D300_MOCK_LOG: sb.log, D300_MOCK_PNG: sb.png, D300_MOCK_MODE: "ok" }, extra || {}); }
function sgit(sb, args) { const r = spawnSync("git", ["-C", sb.repo, "-c", "user.name=d300-sandbox", "-c", "user.email=sandbox@example.invalid", "-c", "core.autocrlf=false", ...args], { env: envFor(sb), encoding: "utf8", windowsHide: true }); if (r.status !== 0) throw new Error("sandbox git " + args.join(" ") + ": " + r.stderr); return r.stdout.trim(); }
function sandbox({ base: mod, layout } = {}) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "d300-sandbox-"))); ROOTS.push(root);
  const sb = { root, repo: join(root, "repo"), state: join(root, "state"), tmp: join(root, "tmp"), home: join(root, "home"), log: join(root, "fetch.log"), gitconfig: join(root, "gitconfig"), png: join(root, "out.png"), mock: join(root, "mock.mjs") };
  sb.out = join(sb.home, "Documents", "DenSejeApp-artefacts", "sv-calls"); for (const d of [sb.repo, sb.state, sb.tmp, sb.home]) mkdirSync(d, { recursive: true });
  writeFileSync(sb.gitconfig, "[core]\n\tautocrlf = false\n[init]\n\tdefaultBranch = main\n"); writeFileSync(sb.mock, MOCK_SRC); writeFileSync(sb.log, ""); writeFileSync(sb.png, png(1536, 1024));
  const rd = join(sb.out, "references", "sneaker-low-k4"); mkdirSync(rd, { recursive: true }); writeFileSync(join(rd, LAYOUT.name), layout || readFileSync(LAYOUT_FILE));
  for (const rel of TRACKED) { const dst = join(sb.repo, ...rel.split("/")); mkdirSync(dirname(dst), { recursive: true }); copyFileSync(repoFile(rel), dst); }
  if (mod) mod(sb);
  sgit(sb, ["init", "-q", "-b", "main"]); sgit(sb, ["add", "-A"]); sgit(sb, ["commit", "-q", "-m", "base"]); sgit(sb, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  return sb; }
const run = (sb, args, extra) => { const r = spawnSync(process.execPath, ["--import", pathToFileURL(sb.mock).href, join(sb.repo, ...ADAPTER_REL.split("/")), ...args], { cwd: sb.repo, env: envFor(sb, extra), encoding: "utf8", windowsHide: true, timeout: 180000 }); return { status: r.status, out: (r.stdout || "") + (r.stderr || "") }; };
const fetchLog = (sb) => readFileSync(sb.log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
function refused(sb, r, stage, sends = 0) { assert.equal(r.status, 1, r.out); assert.match(r.out, new RegExp("REFUSED \\[" + stage + "\\]"), r.out); assert.equal(fetchLog(sb).length, sends); }

test("the dry run passes; the one send carries the layout reference only and the locked prompt, outside the repository, never twice; other ids are refused", { skip: SKIP }, () => {
  const sb = sandbox(); const d = run(sb, argsOf(ID)); assert.equal(d.status, 0, d.out); assert.match(d.out, /DRY RUN PASSED/);
  for (const old of ["SS-1-shoes-sneakers-low-tight-k4", "SV-2-other"]) { const r = run(sb, argsOf(old)); assert.equal(r.status, 1); assert.match(r.out, /REFUSED \[arguments\]/); }
  const r = run(sb, [...argsOf(ID), ...SEND], KEY); assert.equal(r.status, 0, r.out); const Lg = fetchLog(sb); assert.equal(Lg.length, 1);
  assert.deepEqual([Lg[0].fields, Lg[0].imageSha, Lg[0].imageNames, Lg[0].size, Lg[0].n, Lg[0].redirect], [AUTH.request.fieldOrder, [LAYOUT.sha256], [LAYOUT.name], "1536x1024", "1", "error"]);
  assert.equal(Lg[0].prompt, PLAN.call.prompt.text);
  assert.ok(existsSync(join(sb.out, ID, "sv.image-1.png")) && existsSync(join(sb.out, ID, "sv.request.json"))); assert.equal(sgit(sb, ["status", "--porcelain"]), "");
  assert.equal(run(sb, [...argsOf(ID), ...SEND], KEY).status, 1); assert.equal(fetchLog(sb).length, 1, "never twice");
});

test("a changed method file, an uncertain dispatch, the stop file, a changed reference, a missing token or no owner flag is refused before any claim", { skip: SKIP }, () => {
  const changed = sandbox({ base: (s) => { const p = join(s.repo, ..."tools/avatar/northstar-shoe-eval-v2.mjs".split("/")); writeFileSync(p, readFileSync(p, "utf8").replace("maxOffsetPx: 3", "maxOffsetPx: 5")); } });
  refused(changed, run(changed, [...argsOf(ID), ...SEND], KEY), "pins");
  const u = sandbox(); assert.equal(run(u, [...argsOf(ID), ...SEND], { ...KEY, D300_MOCK_MODE: "throw" }).status, 3); assert.equal(run(u, [...argsOf(ID), ...SEND], KEY).status, 1); assert.equal(fetchLog(u).length, 1);
  const stop = sandbox({ base: (s) => { mkdirSync(s.out, { recursive: true }); writeFileSync(join(s.out, "SV-STOP.json"), "{}\n"); } }); refused(stop, run(stop, [...argsOf(ID), ...SEND], KEY), "stopped");
  const wrong = sandbox({ layout: png(1536, 1024) }); refused(wrong, run(wrong, [...argsOf(ID), ...SEND], KEY), "reference-canvas");
  const noToken = sandbox({ base: (s) => { const p = join(s.repo, ...DECISION_REL.split("/")); writeFileSync(p, readFileSync(p, "utf8").replace("D-300 SV: 1 CALL AUTHORISED", "D-300 SV: PREPARED")); } }); refused(noToken, run(noToken, [...argsOf(ID), ...SEND], KEY), "decision");
  const noFlag = sandbox(); refused(noFlag, run(noFlag, [...argsOf(ID), "--send"], KEY), "arguments");
});
