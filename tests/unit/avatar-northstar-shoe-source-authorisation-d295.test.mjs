// D-295 — the shoe-source authorisation: ONE one-shot call of ss-plan-v1.json (D-294) and its send adapter
// (tools/avatar/openai-send-northstar-shoe-source-d295.mjs). The static tests run everywhere. The mocked sends need the layout
// reference, kept outside the clones: they run only where it exists — skipped in CI, never faked. A dummy key and a mocked fetch only;
// the real key is never read (D-142).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, copyFileSync, realpathSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join, dirname, relative, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir, homedir } from "node:os";
import { encodePng } from "../../tools/avatar/r3-hair-tool-v2.mjs";

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = resolve(HERE, "..", "..");
const sha256 = (b) => createHash("sha256").update(b).digest("hex"), repoFile = (rel) => join(REPO, ...rel.split("/")), FX = "tools/avatar/fixtures/northstar-wardrobe/shoe-source/";
const ADAPTER_REL = "tools/avatar/openai-send-northstar-shoe-source-d295.mjs", LEDGER_REL = "tools/avatar/r3-face-neutral-attempt-ledger.mjs", LEGACY_REL = "docs/project-state.md";
const DECISION_REL = "docs/decisions/D-295.md", PLAN_DECISION_REL = "docs/decisions/D-294.md", AUTH_REL = FX + "ss-authorisation-v1.json", PLAN_REL = FX + "ss-plan-v1.json";
const METHOD_REL = "tools/avatar/northstar-shoe-source.mjs", EVAL_REL = "tools/avatar/northstar-shoe-source-evaluate.mjs";
const SRC = readFileSync(repoFile(ADAPTER_REL), "utf8"), CODE = SRC.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
const json = (rel) => JSON.parse(readFileSync(repoFile(rel), "utf8"));
const AUTH = json(AUTH_REL), PLAN = json(PLAN_REL), DECISION = readFileSync(repoFile(DECISION_REL), "utf8");
const MODEL = "gpt-image-2.5-sunburst-2026-09-08", ID = "SS-1-shoes-sneakers-low-tight-k4";
const argsOf = (id) => ["--call-id=" + id, "--claim-identity=" + id + "-claim"], SEND = ["--send", "--owner-approval=D-295"], KEY = { ["OPENAI_API" + "_KEY"]: "sk-d295-sandbox-dummy-key-not-a-credential" };
const KEY_READ = "process.env." + "OPENAI_API" + "_KEY";   // spelt in parts so this file never reads it (the D-142 guard)
const LAYOUT = AUTH.request.canvases["sneaker-low-k4"], LAYOUT_FILE = join(homedir(), "Documents", "DenSejeApp-artefacts", "ss-calls", "references", "sneaker-low-k4", LAYOUT.name);
const HAVE = existsSync(LAYOUT_FILE) && sha256(readFileSync(LAYOUT_FILE)) === LAYOUT.sha256;
const SKIP = HAVE ? false : "the layout reference is kept outside the clones; build it with northstar-shoe-source.mjs layoutCanvas to run the mocked sends";
const isInside = (c, p) => { const r = relative(p, c); return r === "" || (!r.startsWith("..") && !isAbsolute(r)); };

test("D-295 authorisation: one one-shot call of the frozen plan (spent and received, D-296), no reserve, retry, fallback or earlier permission; the token in D-295's status; C never sent", () => {
  assert.deepEqual([AUTH.decision, AUTH.meta.authorisesImageRequest, AUTH.budget.authorised, AUTH.budget.reserve, AUTH.budget.retries, AUTH.budget.fallback, AUTH.budget.reusesEarlierPermissions], ["D-295", false, 1, 0, 0, false, false]);
  assert.deepEqual(AUTH.calls.map((e) => [e.callId, e.order, e.mandateState, e.outcome, e.recordedBy]), [[ID, 1, "SPENT", "RECEIVED_FOR_BF_CHECK", "D-296"]]);
  // the recorded execution and closure (D-296): spent once, received, rejected by the D-294 check; nothing open
  assert.deepEqual([AUTH.calls[0].result.httpStatus, AUTH.calls[0].result.fetches, AUTH.budget.actuallySent, AUTH.budget.closed.by, AUTH.budget.closed.spent, AUTH.budget.closed.uncertain], [200, 1, 1, "D-296", 1, 0]);
  assert.match(AUTH.calls[0].result.imageSha256, /^[0-9a-f]{64}$/); assert.match(AUTH.calls[0].result.evaluation, /^rejected by the D-294 check/);
  assert.equal(AUTH.frozen.plan.sha256, sha256(readFileSync(repoFile(PLAN_REL)))); assert.equal(PLAN.call.prompt.sha256, sha256(Buffer.from(PLAN.call.prompt.text, "utf8"))); assert.equal(AUTH.frozen.prompt.sha256, PLAN.call.prompt.sha256);
  assert.deepEqual([AUTH.request.model, AUTH.request.parameters.size, AUTH.request.images.length, AUTH.calls[0].canvas], [MODEL, "1536x1024", 1, LAYOUT.sha256]); assert.equal(PLAN.request.images[0].sha256, LAYOUT.sha256);
  assert.match(AUTH.privacy.cSentToApi, /^never/); assert.ok(!/d202-base-figure/.test(SRC), "the adapter never names C");
  const status = /^status: (.*)$/m.exec(DECISION)[1]; assert.ok(status.split(" — ").map((x) => x.trim()).includes("D-295 SS: 1 CALL AUTHORISED")); assert.match(status, /CLOSED BY D-296/);
  for (const n of [ID, "--owner-approval=D-295", MODEL, ADAPTER_REL, AUTH.frozen.prompt.sha256, AUTH.frozen.plan.sha256, "1536x1024", LAYOUT.sha256]) assert.ok(DECISION.includes(n), n);
  assert.ok(!readFileSync(repoFile(LEGACY_REL), "utf8").split("\n").some((l) => l.startsWith("| **D-295** |")));
  for (const t of [JSON.stringify(AUTH), SRC]) assert.ok(!/fitting-base|H1\.png/.test(t), "no H1");
  assert.equal(AUTH.budget.price.verifiedAt, "2026-11-01"); assert.match(AUTH.budget.price.note, /estimate, not a guaranteed maximum/);
});

test("the adapter: no exports, only node built-ins and the ledger, exactly one fetch, the key once, one image, every check before any claim", () => {
  assert.ok(!/^\s*export\b/m.test(CODE));
  for (const m of CODE.matchAll(/^\s*import\b[^;]*?from\s+"([^"]+)"/gm)) assert.ok(m[1].startsWith("node:") || m[1] === "./r3-face-neutral-attempt-ledger.mjs", m[1]);
  assert.equal([...CODE.matchAll(/\bfetch\s*\(/g)].length, 1); assert.equal(CODE.split(KEY_READ).length - 1, 1); assert.equal([...CODE.matchAll(/fd\.append\(IMAGE_FIELD/g)].length, 1);
  const body = CODE.slice(CODE.indexOf("async function main(argv)")); let last = -1;
  for (const k of ["parseArgs(argv)", "resolveRefs()", "readOriginBlobs(", "verifyPrompts(blobs)", "verifyDecisions(", "verifyAuthorisation(", "verifyImplementation(", "readCanvas(", "resolveClaimLocation(call)", "verifyOrderAndStops(", "resolveOutputs(call)", "buildBody(", "if (!args.sendMode)", KEY_READ, "createClaim(", "globalThis.fetch("]) {
    const at = body.indexOf(k); assert.ok(at > last, k + " comes after the previous check"); last = at; }
  assert.match(CODE, /const MAX_CALLS = 1;/); assert.match(CODE, /const MODEL = "gpt-image-2\.5-sunburst-2026-09-08";/);
  for (const r of AUTH.stopRules) assert.ok(SRC.includes(JSON.stringify(r)), "the adapter carries the stop rule: " + r);
});

// ── sandbox: a throw-away git repository, a mocked fetch, the layout reference copied in ─────────────────────────────────
const ROOTS = []; after(() => { for (const r of ROOTS) if (isInside(r, realpathSync.native(tmpdir())) && /d295-sandbox-/.test(r)) rmSync(r, { recursive: true, force: true }); });
const MOCK_SRC = [
  "import { appendFileSync, readFileSync } from \"node:fs\"; import { createHash } from \"node:crypto\";",
  "const LOG = process.env.D295_MOCK_LOG, PNG = process.env.D295_MOCK_PNG, MODE = process.env.D295_MOCK_MODE;",
  "if (!LOG || !PNG || !MODE) throw new Error(\"d295 mock: not configured — refusing to run\");",
  "const h = async (f) => createHash(\"sha256\").update(Buffer.from(await f.arrayBuffer())).digest(\"hex\");",
  "globalThis.fetch = async function d295MockFetch(url, init) {",
  "  const b = init.body; appendFileSync(LOG, JSON.stringify({ url: String(url), redirect: init.redirect, fields: [...b.keys()], imageSha: await Promise.all(b.getAll(\"image[]\").map(h)), imageNames: b.getAll(\"image[]\").map((f) => f.name), prompt: b.get(\"prompt\"), size: b.get(\"size\"), n: b.get(\"n\") }) + \"\\n\");",
  "  if (MODE === \"throw\") throw new TypeError(\"fetch failed (mock transport error)\");",
  "  return new Response(JSON.stringify({ created: 1, data: [{ b64_json: readFileSync(PNG).toString(\"base64\") }] }), { status: 200, headers: { \"content-type\": \"application/json\", \"x-request-id\": \"req_mockok\" } });",
  "};"].join("\n");
const TRACKED = [ADAPTER_REL, LEDGER_REL, LEGACY_REL, DECISION_REL, PLAN_DECISION_REL, AUTH_REL, PLAN_REL, METHOD_REL, EVAL_REL];
const png = (w2, h2) => { const px = new Uint8ClampedArray(w2 * h2 * 4); for (let i = 0; i < w2 * h2; i++) px.set([150, 150, 150, 255], i * 4); return encodePng(w2, h2, px); };
function envFor(sb, extra) { const env = {}; for (const k of ["PATH", "Path", "SystemRoot", "windir", "COMSPEC", "PATHEXT", "SystemDrive"]) if (typeof process.env[k] === "string") env[k] = process.env[k];
  return Object.assign(env, { LOCALAPPDATA: sb.state, XDG_STATE_HOME: sb.state, HOME: sb.home, USERPROFILE: sb.home, TEMP: sb.tmp, TMP: sb.tmp, TMPDIR: sb.tmp, HTTP_PROXY: "http://127.0.0.1:9", HTTPS_PROXY: "http://127.0.0.1:9",
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: sb.gitconfig, D295_MOCK_LOG: sb.log, D295_MOCK_PNG: sb.png, D295_MOCK_MODE: "ok" }, extra || {}); }
function sgit(sb, args) { const r = spawnSync("git", ["-C", sb.repo, "-c", "user.name=d295-sandbox", "-c", "user.email=sandbox@example.invalid", "-c", "core.autocrlf=false", ...args], { env: envFor(sb), encoding: "utf8", windowsHide: true }); if (r.status !== 0) throw new Error("sandbox git " + args.join(" ") + ": " + r.stderr); return r.stdout.trim(); }
function sandbox({ base: mod, layout } = {}) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "d295-sandbox-"))); ROOTS.push(root);
  const sb = { root, repo: join(root, "repo"), state: join(root, "state"), tmp: join(root, "tmp"), home: join(root, "home"), log: join(root, "fetch.log"), gitconfig: join(root, "gitconfig"), png: join(root, "out.png"), mock: join(root, "mock.mjs") };
  sb.out = join(sb.home, "Documents", "DenSejeApp-artefacts", "ss-calls"); for (const d of [sb.repo, sb.state, sb.tmp, sb.home]) mkdirSync(d, { recursive: true });
  writeFileSync(sb.gitconfig, "[core]\n\tautocrlf = false\n[init]\n\tdefaultBranch = main\n"); writeFileSync(sb.mock, MOCK_SRC); writeFileSync(sb.log, ""); writeFileSync(sb.png, png(1536, 1024));
  const rd = join(sb.out, "references", "sneaker-low-k4"); mkdirSync(rd, { recursive: true }); writeFileSync(join(rd, LAYOUT.name), layout || readFileSync(LAYOUT_FILE));
  for (const rel of TRACKED) { const dst = join(sb.repo, ...rel.split("/")); mkdirSync(dirname(dst), { recursive: true }); copyFileSync(repoFile(rel), dst); }
  // the sandbox starts from the authorisation as merged by D-295: the recorded execution (D-296) is undone in the copy only
  { const cp = join(sb.repo, ...AUTH_REL.split("/")), c = JSON.parse(readFileSync(cp, "utf8")); delete c.budget.actuallySent; delete c.budget.closed;
    for (const e of c.calls) { e.mandateState = "UNSPENT"; e.outcome = "NOT YET ATTEMPTED"; delete e.result; delete e.recordedBy; } writeFileSync(cp, JSON.stringify(c, null, 2) + "\n"); }
  if (mod) mod(sb);
  sgit(sb, ["init", "-q", "-b", "main"]); sgit(sb, ["add", "-A"]); sgit(sb, ["commit", "-q", "-m", "base"]); sgit(sb, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  return sb; }
const run = (sb, args, extra) => { const r = spawnSync(process.execPath, ["--import", pathToFileURL(sb.mock).href, join(sb.repo, ...ADAPTER_REL.split("/")), ...args], { cwd: sb.repo, env: envFor(sb, extra), encoding: "utf8", windowsHide: true, timeout: 180000 }); return { status: r.status, out: (r.stdout || "") + (r.stderr || "") }; };
const fetchLog = (sb) => readFileSync(sb.log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
function refused(sb, r, stage, sends = 0) { assert.equal(r.status, 1, r.out); assert.match(r.out, new RegExp("REFUSED \\[" + stage + "\\]"), r.out); assert.equal(fetchLog(sb).length, sends); }

test("the dry run passes; the one send carries the layout reference only and the frozen prompt, outside the repository, never twice; other ids are refused", { skip: SKIP }, () => {
  const sb = sandbox(); const d = run(sb, argsOf(ID)); assert.equal(d.status, 0, d.out); assert.match(d.out, /DRY RUN PASSED/);
  for (const old of ["R1C-1-top-tee-hip-apricot-bleed", "SS-2-other"]) { const r = run(sb, argsOf(old)); assert.equal(r.status, 1); assert.match(r.out, /REFUSED \[arguments\]/); }
  const r = run(sb, [...argsOf(ID), ...SEND], KEY); assert.equal(r.status, 0, r.out); const Lg = fetchLog(sb); assert.equal(Lg.length, 1);
  assert.deepEqual([Lg[0].fields, Lg[0].imageSha, Lg[0].imageNames, Lg[0].size, Lg[0].n, Lg[0].redirect], [AUTH.request.fieldOrder, [LAYOUT.sha256], [LAYOUT.name], "1536x1024", "1", "error"]);
  assert.equal(Lg[0].prompt, PLAN.call.prompt.text);
  assert.ok(existsSync(join(sb.out, ID, "ss.image-1.png")) && existsSync(join(sb.out, ID, "ss.request.json"))); assert.equal(sgit(sb, ["status", "--porcelain"]), "");
  assert.equal(run(sb, [...argsOf(ID), ...SEND], KEY).status, 1); assert.equal(fetchLog(sb).length, 1, "never twice");
});

test("an uncertain dispatch is spent and never resent; the stop file, a changed reference, a missing token or no owner flag is refused before any claim", { skip: SKIP }, () => {
  const u = sandbox(); assert.equal(run(u, [...argsOf(ID), ...SEND], { ...KEY, D295_MOCK_MODE: "throw" }).status, 3); assert.equal(run(u, [...argsOf(ID), ...SEND], KEY).status, 1); assert.equal(fetchLog(u).length, 1);
  const stop = sandbox({ base: (s) => { mkdirSync(s.out, { recursive: true }); writeFileSync(join(s.out, "SS-STOP.json"), "{}\n"); } }); refused(stop, run(stop, [...argsOf(ID), ...SEND], KEY), "stopped");
  const wrong = sandbox({ layout: png(1536, 1024) }); refused(wrong, run(wrong, [...argsOf(ID), ...SEND], KEY), "reference-canvas");
  const noToken = sandbox({ base: (s) => { const p = join(s.repo, ...DECISION_REL.split("/")); writeFileSync(p, readFileSync(p, "utf8").replace("D-295 SS: 1 CALL AUTHORISED", "D-295 SS: PREPARED")); } }); refused(noToken, run(noToken, [...argsOf(ID), ...SEND], KEY), "decision");
  const noFlag = sandbox(); refused(noFlag, run(noFlag, [...argsOf(ID), "--send"], KEY), "arguments");
});

test("after D-296 the spent call is refused before any claim: the authorisation as recorded admits no further send", { skip: SKIP }, () => {
  const sb = sandbox({ base: (x) => copyFileSync(repoFile(AUTH_REL), join(x.repo, ...AUTH_REL.split("/"))) });
  refused(sb, run(sb, [...argsOf(ID), ...SEND], KEY), "authorisation");
});
