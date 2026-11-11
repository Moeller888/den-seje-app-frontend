// D-371 — Northstar hair drawn from scratch: one template without the extra skin layer (northstar-hair-template-d371.mjs, template-v1.json),
// the frozen plan (plan-v1.json: three prompts, two images, the gates), and at most one one-shot call per hairstyle (authorisation-v1.json,
// tools/avatar/openai-send-northstar-hair-d371.mjs; Kort first). The static tests run everywhere. The mocked sends need the two input
// images, kept outside the clones: they run only where they exist — skipped in CI, never faked. A dummy key and a mocked fetch only; the
// real key is never read (D-142). Nothing here approves a hairstyle; 0 image calls.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, copyFileSync, realpathSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join, dirname, relative, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir, homedir } from "node:os";
import { encodePng, pixelSha256 } from "../../tools/avatar/r3-hair-tool-v2.mjs";
import * as T from "../../tools/avatar/northstar-hair-template-d371.mjs";

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = resolve(HERE, "..", "..");
const sha256 = (b) => createHash("sha256").update(b).digest("hex"), repoFile = (rel) => join(REPO, ...rel.split("/")), FX = "tools/avatar/fixtures/northstar-hair-d371/";
const ADAPTER_REL = "tools/avatar/openai-send-northstar-hair-d371.mjs", LEDGER_REL = "tools/avatar/r3-face-neutral-attempt-ledger.mjs", LEGACY_REL = "docs/project-state.md";
const DECISION_REL = "docs/decisions/D-371.md", TRIAL_REL = "docs/decisions/D-368.md", AUTH_REL = FX + "authorisation-v1.json", PLAN_REL = FX + "plan-v1.json";
const SRC = readFileSync(repoFile(ADAPTER_REL), "utf8"), CODE = SRC.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
const json = (rel) => JSON.parse(readFileSync(repoFile(rel), "utf8"));
const AUTH = json(AUTH_REL), PLAN = json(PLAN_REL), DECISION = readFileSync(repoFile(DECISION_REL), "utf8");
const MODEL = "gpt-image-2.5-sunburst-2026-09-08", IDS = ["NH-1-hair-short", "NH-2-hair-curls", "NH-3-hair-sidepart"], METHOD_FILES = Object.keys(PLAN.method.files);
const argsOf = (id) => ["--call-id=" + id, "--claim-identity=" + id + "-claim"], SEND = ["--send", "--owner-approval=D-371"], KEY = { ["OPENAI_API" + "_KEY"]: "sk-d371-sandbox-dummy-key-not-a-credential" };
const KEY_READ = "process.env." + "OPENAI_API" + "_KEY";   // spelt in parts so this file never reads it (the D-142 guard)
const REFS = join(homedir(), "Documents", "DenSejeApp-artefacts", "hair-d371-calls", "references");
const HAVE = PLAN.request.images.every((i) => existsSync(join(REFS, i.name)) && sha256(readFileSync(join(REFS, i.name))) === i.sha256);
const SKIP = HAVE ? false : "the two input images are kept outside the clones; write them with northstar-hair-template-d371.mjs --inputs to run the mocked sends";
const isInside = (c, p) => { const r = relative(p, c); return r === "" || (!r.startsWith("..") && !isAbsolute(r)); };
const plain = (o) => JSON.parse(JSON.stringify(o));
const TPL = T.buildTemplate();

test("D-371 template: the bald head has no hole, the zones never overlap, and the fixture is the tool's", () => {
  assert.equal(TPL.spec.holes.px, 0);
  assert.deepEqual([TPL.spec.overlap.mustCoverAndKeepClear, TPL.spec.overlap.mustCoverAndEars, TPL.spec.overlap.mustCoverAndBrows], [0, 0, 0]);
  for (const s of ["left", "right"]) { assert.ok(TPL.spec.temples.px[s] > 300, "a flap in front of the " + s + " ear"); assert.ok(TPL.spec.zones.keepClear.earInnerPx[s] > 1500); }
  assert.deepEqual(plain(TPL.spec), json(T.FIXTURE));
  assert.deepEqual(plain(T.CROP), { x: 256, y: 0, size: 512, scale: 2 }); assert.equal(T.CALL_SIZE, "1024x1024"); assert.equal(T.CALL_MARGIN, 16);
});

test("D-371 template, input images and prompts use the same square, scale, size and margin; the images are the plan's pixels", () => {
  const im = T.inputImages(TPL);
  for (const c of PLAN.calls) { const r = T.consistency(TPL, im, c.prompt.text); assert.ok(r.ok, c.callId + " " + JSON.stringify(r.checks)); }
  assert.deepEqual(PLAN.request.images.map((i) => i.pixelSha256), [pixelSha256(im.reference.px), pixelSha256(im.guide.px)]);
  assert.deepEqual(PLAN.request.images.map((i) => [i.role, i.name, i.width, i.height, i.tracked]), [["Image 1", im.reference.name, 1024, 1024, false], ["Image 2", im.guide.name, 1024, 1024, false]]);
});

test("D-371 gates: Northstar's own hair passes M1–M9 (calibration); the zone-only Kort covers both flaps with the ear's inside untouched", () => {
  const ref = T.measureReference(TPL); assert.ok(ref.pass, JSON.stringify(ref.gates));
  const k = T.measureHair(TPL, T.kortEnvelope(TPL)); assert.ok(k.pass, JSON.stringify(k.gates));
  assert.deepEqual([k.gates.M4.flapShare.left, k.gates.M4.flapShare.right, k.gates.M2.earInnerPx.left, k.gates.M2.earInnerPx.right], [1, 1, 0, 0]);
  // a layer shifted by 12 px fails coverage at the ears; an opaque square fails transparency and the ears
  const shifted = new Uint8ClampedArray(T.kortEnvelope(TPL).length), env = T.kortEnvelope(TPL); for (let i = 0; i < env.length / 4 - 12; i++) shifted.set(env.subarray(i * 4, i * 4 + 4), (i + 12) * 4);
  assert.equal(T.measureHair(TPL, shifted).gates.M4.pass, false);
  const square = new Uint8ClampedArray(1024 * 1024 * 4).fill(128); const sq = T.measureHair(TPL, T.mapBack(square), square); assert.equal(sq.gates.M2.pass, false); assert.equal(sq.gates.M8.pass, false);
  assert.deepEqual(plain(PLAN.gates), plain(T.GATES));
});

test("D-371 plan: three frozen prompts (common text + one style each), the request, the order and the locked method", () => {
  assert.equal(PLAN.authorisesImageRequest, false); assert.deepEqual(PLAN.calls.map((c) => [c.callId, c.style, c.order]), [[IDS[0], "short", 1], [IDS[1], "curls", 2], [IDS[2], "sidepart", 3]]);
  for (const c of PLAN.calls) { assert.equal(c.prompt.sha256, sha256(Buffer.from(c.prompt.text, "utf8"))); assert.equal(c.prompt.bytes, Buffer.byteLength(c.prompt.text, "utf8")); assert.ok(c.prompt.text.startsWith(PLAN.prompts.common.text)); assert.ok(!/[{}]|undefined|null|NaN/.test(c.prompt.text)); }
  for (const re of [/Draw ONLY a new hairstyle/, /same position, same scale, no shift, no zoom, no tilt/, /neutral greyscale only/, /covers the narrow strip of skin between the face's outline and the front edge of the ear/, /lies BEHIND it/, /The eyes stay completely clear/, /16 pixels of empty transparent margin/]) assert.match(PLAN.prompts.common.text, re);
  assert.deepEqual([PLAN.request.model, PLAN.request.parameters], [MODEL, { size: "1024x1024", quality: "high", n: 1, output_format: "png", background: "transparent" }]);
  assert.deepEqual(PLAN.request.neverSent, ["mask", "input_fidelity", "any other image"]); assert.equal(PLAN.order.first, IDS[0]);
  for (const f of METHOD_FILES) assert.equal(sha256(readFileSync(repoFile(f))), PLAN.method.files[f], f + " changed after the lock: a changed method is a new plan version");
  assert.equal(PLAN.template.sha256, sha256(readFileSync(repoFile(T.FIXTURE)))); assert.ok(PLAN.visualStop.some((v) => /skin flap .* double line .* seam/.test(v)));
});

test("D-371 authorisation: at most one call per hairstyle, Kort first; Kort spent and rejected, NH-2 and NH-3 unspent and paused; the decision carries the token and every pin", () => {
  assert.deepEqual([AUTH.decision, AUTH.meta.authorisesImageRequest, AUTH.budget.authorised, AUTH.budget.perStyle, AUTH.budget.reserve, AUTH.budget.retries, AUTH.budget.fallback, AUTH.budget.reusesEarlierPermissions, AUTH.budget.actuallySent], ["D-371", false, 3, 1, 0, 0, false, false, 1]);
  // NH-1 was sent once (2026-11-11) and rejected for further use; it is never an active permission again
  assert.deepEqual(AUTH.calls.map((e) => [e.callId, e.order, e.mandateState, e.outcome, e.prompt.sha256]), PLAN.calls.map((c, i) => [c.callId, c.order, i === 0 ? "SPENT" : "UNSPENT", i === 0 ? "RECEIVED_FOR_PLACEMENT" : "NOT YET ATTEMPTED", c.prompt.sha256]));
  const kort = AUTH.calls[0]; assert.deepEqual([kort.neverReuse, kort.result.assessment, kort.result.gates.pass, kort.result.gates.failed, kort.result.image.tracked, kort.result.neverPromoted], [true, "REJECTED_FOR_FURTHER_USE", false, ["M1", "M2", "M3", "M4", "M6", "M8"], false, true]);
  for (const e of AUTH.calls.slice(1)) for (const k of ["neverReuse", "closedBy", "result"]) assert.ok(!(k in e), e.callId + " carries no " + k);
  assert.equal(AUTH.afterShort.verdict, "PENDING", "a common fault at the ears: NH-2 and NH-3 stay paused"); assert.equal(AUTH.frozen.plan.sha256, sha256(readFileSync(repoFile(PLAN_REL)))); assert.deepEqual(AUTH.frozen.methodFiles, PLAN.method.files);
  assert.deepEqual(AUTH.request.images, PLAN.request.images.map((i) => ({ role: i.role, name: i.name, bytes: i.bytes, sha256: i.sha256, tracked: false })));
  const status = /^status: (.*)$/m.exec(DECISION)[1]; assert.ok(status.split(" — ").map((x) => x.trim()).includes("D-371 HAIR: 3 CALLS AUTHORISED (1 PER STYLE)"));
  for (const n of [...IDS, "--owner-approval=D-371", MODEL, ADAPTER_REL, AUTH.frozen.plan.sha256, "1024x1024", ...PLAN.calls.map((c) => c.prompt.sha256), ...PLAN.request.images.map((i) => i.sha256)]) assert.ok(DECISION.includes(n), n);
  assert.ok(!readFileSync(repoFile(LEGACY_REL), "utf8").split("\n").some((l) => l.startsWith("| **D-371** |")));
  assert.ok(AUTH.budget.price.perCallUpperEstimate <= 0.08 && AUTH.budget.price.totalUpperEstimate <= 0.25); assert.match(AUTH.budget.price.note, /estimate, not a guaranteed maximum/);
});

test("the adapter: no exports, only node built-ins and the ledger, exactly one fetch, the key once, two images in order, every check before any claim", () => {
  assert.ok(!/^\s*export\b/m.test(CODE));
  for (const m of CODE.matchAll(/^\s*import\b[^;]*?from\s+"([^"]+)"/gm)) assert.ok(m[1].startsWith("node:") || m[1] === "./r3-face-neutral-attempt-ledger.mjs", m[1]);
  assert.equal([...CODE.matchAll(/\bfetch\s*\(/g)].length, 1); assert.equal(CODE.split(KEY_READ).length - 1, 1); assert.equal([...CODE.matchAll(/fd\.append\(IMAGE_FIELD/g)].length, 1);
  const body = CODE.slice(CODE.indexOf("async function main(argv)")); let last = -1;
  for (const k of ["parseArgs(argv)", "resolveRefs()", "readOriginBlobs(", "verifyPrompts(blobs)", "verifyDecisions(", "verifyAuthorisation(", "verifyImplementation(", "readImages(", "resolveClaimLocation(call)", "verifyOrderAndStops(", "resolveOutputs(call)", "buildBody(", "if (!args.sendMode)", KEY_READ, "createClaim(", "globalThis.fetch("]) {
    const at = body.indexOf(k); assert.ok(at > last, k + " comes after the previous check"); last = at; }
  assert.match(CODE, /const MAX_CALLS = 3;/); assert.match(CODE, /const OUT_DIR_NAME = "hair-d371-calls";/); assert.ok(!/AB-1-shoes|ab-authorisation|ankle-boot-layout|D-320 AB/.test(CODE), "no earlier identity left");
  for (const r of AUTH.stopRules) assert.ok(SRC.includes(JSON.stringify(r)), "the adapter carries the stop rule: " + r);
  for (const f of METHOD_FILES) assert.ok(SRC.includes(JSON.stringify(f)), "the adapter locks " + f);
  assert.ok(SRC.includes(`const PLAN_SHA256 = "${AUTH.frozen.plan.sha256}";`)); for (const c of PLAN.calls) assert.ok(SRC.includes(`"${c.callId}": "${c.prompt.sha256}"`));
});

// ── sandbox: a throw-away git repository, a mocked fetch, the two images copied in ─────────────────────────────────────
const ROOTS = []; after(() => { for (const r of ROOTS) if (isInside(r, realpathSync.native(tmpdir())) && /d371-sandbox-/.test(r)) rmSync(r, { recursive: true, force: true }); });
const MOCK_SRC = [
  "import { appendFileSync, readFileSync } from \"node:fs\"; import { createHash } from \"node:crypto\";",
  "const LOG = process.env.D371_MOCK_LOG, PNG = process.env.D371_MOCK_PNG, MODE = process.env.D371_MOCK_MODE;",
  "if (!LOG || !PNG || !MODE) throw new Error(\"d371 mock: not configured — refusing to run\");",
  "const h = async (f) => createHash(\"sha256\").update(Buffer.from(await f.arrayBuffer())).digest(\"hex\");",
  "globalThis.fetch = async function d371MockFetch(url, init) {",
  "  const b = init.body; appendFileSync(LOG, JSON.stringify({ url: String(url), redirect: init.redirect, fields: [...b.keys()], imageSha: await Promise.all(b.getAll(\"image[]\").map(h)), imageNames: b.getAll(\"image[]\").map((f) => f.name), prompt: b.get(\"prompt\"), size: b.get(\"size\"), n: b.get(\"n\") }) + \"\\n\");",
  "  if (MODE === \"throw\") throw new TypeError(\"fetch failed (mock transport error)\");",
  "  return new Response(JSON.stringify({ created: 1, data: [{ b64_json: readFileSync(PNG).toString(\"base64\") }] }), { status: 200, headers: { \"content-type\": \"application/json\", \"x-request-id\": \"req_mockok\" } });",
  "};"].join("\n");
const TRACKED = [ADAPTER_REL, LEDGER_REL, LEGACY_REL, DECISION_REL, TRIAL_REL, AUTH_REL, PLAN_REL, ...METHOD_FILES];
const png = (w2, h2) => { const px = new Uint8ClampedArray(w2 * h2 * 4); for (let i = 0; i < w2 * h2; i++) px.set([150, 150, 150, 255], i * 4); return encodePng(w2, h2, px); };
function envFor(sb, extra) { const env = {}; for (const k of ["PATH", "Path", "SystemRoot", "windir", "COMSPEC", "PATHEXT", "SystemDrive"]) if (typeof process.env[k] === "string") env[k] = process.env[k];
  return Object.assign(env, { LOCALAPPDATA: sb.state, XDG_STATE_HOME: sb.state, HOME: sb.home, USERPROFILE: sb.home, TEMP: sb.tmp, TMP: sb.tmp, TMPDIR: sb.tmp, HTTP_PROXY: "http://127.0.0.1:9", HTTPS_PROXY: "http://127.0.0.1:9",
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: sb.gitconfig, D371_MOCK_LOG: sb.log, D371_MOCK_PNG: sb.png, D371_MOCK_MODE: "ok" }, extra || {}); }
function sgit(sb, args) { const r = spawnSync("git", ["-C", sb.repo, "-c", "user.name=d371-sandbox", "-c", "user.email=sandbox@example.invalid", "-c", "core.autocrlf=false", ...args], { env: envFor(sb), encoding: "utf8", windowsHide: true }); if (r.status !== 0) throw new Error("sandbox git " + args.join(" ") + ": " + r.stderr); return r.stdout.trim(); }
function sandbox({ base: mod } = {}) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "d371-sandbox-"))); ROOTS.push(root);
  const sb = { root, repo: join(root, "repo"), state: join(root, "state"), tmp: join(root, "tmp"), home: join(root, "home"), log: join(root, "fetch.log"), gitconfig: join(root, "gitconfig"), png: join(root, "out.png"), mock: join(root, "mock.mjs") };
  sb.out = join(sb.home, "Documents", "DenSejeApp-artefacts", "hair-d371-calls"); for (const d of [sb.repo, sb.state, sb.tmp, sb.home]) mkdirSync(d, { recursive: true });
  writeFileSync(sb.gitconfig, "[core]\n\tautocrlf = false\n[init]\n\tdefaultBranch = main\n"); writeFileSync(sb.mock, MOCK_SRC); writeFileSync(sb.log, ""); writeFileSync(sb.png, png(1024, 1024));
  const rd = join(sb.out, "references"); mkdirSync(rd, { recursive: true }); for (const i of PLAN.request.images) copyFileSync(join(REFS, i.name), join(rd, i.name));
  for (const rel of TRACKED) { const dst = join(sb.repo, ...rel.split("/")); mkdirSync(dirname(dst), { recursive: true }); copyFileSync(repoFile(rel), dst); }
  // the adapter's behaviour is tested on the authorisation as merged, before NH-1 was spent (2026-11-11)
  { const p = join(sb.repo, ...AUTH_REL.split("/")), a = JSON.parse(readFileSync(p, "utf8")), e = a.calls[0]; a.budget.actuallySent = 0; delete a.afterShort.assessment;
    e.mandateState = "UNSPENT"; e.outcome = "NOT YET ATTEMPTED"; for (const k of ["neverReuse", "closedBy", "result"]) delete e[k]; writeFileSync(p, JSON.stringify(a, null, 2) + "\n"); }
  if (mod) mod(sb);
  sgit(sb, ["init", "-q", "-b", "main"]); sgit(sb, ["add", "-A"]); sgit(sb, ["commit", "-q", "-m", "base"]); sgit(sb, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  return sb; }
const run = (sb, args, extra) => { const r = spawnSync(process.execPath, ["--import", pathToFileURL(sb.mock).href, join(sb.repo, ...ADAPTER_REL.split("/")), ...args], { cwd: sb.repo, env: envFor(sb, extra), encoding: "utf8", windowsHide: true, timeout: 180000 }); return { status: r.status, out: (r.stdout || "") + (r.stderr || "") }; };
const fetchLog = (sb) => readFileSync(sb.log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
function refused(sb, r, stage, sends = 0) { assert.equal(r.status, 1, r.out); assert.match(r.out, new RegExp("REFUSED \\[" + stage + "\\]"), r.out); assert.equal(fetchLog(sb).length, sends); }
const recordKort = (sb) => { const p = join(sb.repo, ...AUTH_REL.split("/")), a = JSON.parse(readFileSync(p, "utf8")); a.afterShort.verdict = "NO_COMMON_FAULT"; const e = a.calls[0]; e.mandateState = "SPENT"; e.outcome = "RECEIVED_FOR_PLACEMENT"; writeFileSync(p, JSON.stringify(a, null, 2) + "\n");
  sgit(sb, ["commit", "-q", "-am", "record Kort"]); sgit(sb, ["update-ref", "refs/remotes/origin/main", "HEAD"]); };

test("the dry runs: Kort passes, the others wait for Kort; Kort's send carries the two images in order and the locked prompt, never twice", { skip: SKIP }, () => {
  const sb = sandbox(); const d = run(sb, argsOf(IDS[0])); assert.equal(d.status, 0, d.out); assert.match(d.out, /DRY RUN PASSED/);
  for (const id of IDS.slice(1)) refused(sb, run(sb, argsOf(id)), "authorisation");
  for (const old of ["AB-1-shoes-ankleboot-tight-k4", "NH-4-hair-other"]) { const r = run(sb, argsOf(old)); assert.equal(r.status, 1); assert.match(r.out, /REFUSED \[arguments\]/); }
  const r = run(sb, [...argsOf(IDS[0]), ...SEND], KEY); assert.equal(r.status, 0, r.out); const Lg = fetchLog(sb); assert.equal(Lg.length, 1);
  assert.deepEqual([Lg[0].fields, Lg[0].imageSha, Lg[0].imageNames, Lg[0].size, Lg[0].n, Lg[0].redirect], [AUTH.request.fieldOrder, PLAN.request.images.map((i) => i.sha256), PLAN.request.images.map((i) => i.name), "1024x1024", "1", "error"]);
  assert.equal(Lg[0].prompt, PLAN.calls[0].prompt.text);
  assert.ok(existsSync(join(sb.out, IDS[0], "nh.image-1.png")) && existsSync(join(sb.out, IDS[0], "nh.receipt.json"))); assert.equal(sgit(sb, ["status", "--porcelain"]), "");
  assert.equal(run(sb, [...argsOf(IDS[0]), ...SEND], KEY).status, 1); assert.equal(fetchLog(sb).length, 1, "never twice");
  refused(sb, run(sb, [...argsOf(IDS[1]), ...SEND], KEY), "authorisation", 1);
  recordKort(sb); const n2 = run(sb, [...argsOf(IDS[1]), ...SEND], KEY); assert.equal(n2.status, 0, n2.out); assert.equal(fetchLog(sb)[1].prompt, PLAN.calls[1].prompt.text);
});

test("before Kort, an uncertain dispatch, the stop file, a changed image, a changed method file, a missing token or no owner flag is refused before any claim", { skip: SKIP }, () => {
  const early = sandbox({ base: (s) => { const p = join(s.repo, ...AUTH_REL.split("/")), a = JSON.parse(readFileSync(p, "utf8")); a.afterShort.verdict = "NO_COMMON_FAULT"; writeFileSync(p, JSON.stringify(a, null, 2) + "\n"); } });
  refused(early, run(early, [...argsOf(IDS[1]), ...SEND], KEY), "stopped");
  const u = sandbox(); assert.equal(run(u, [...argsOf(IDS[0]), ...SEND], { ...KEY, D371_MOCK_MODE: "throw" }).status, 3); assert.equal(run(u, [...argsOf(IDS[0]), ...SEND], KEY).status, 1);
  recordKort(u); refused(u, run(u, [...argsOf(IDS[1]), ...SEND], KEY), "stopped", 1);
  const stop = sandbox({ base: (s) => writeFileSync(join(s.out, "NH-STOP.json"), "{}\n") }); refused(stop, run(stop, [...argsOf(IDS[0]), ...SEND], KEY), "stopped");
  const img = sandbox({ base: (s) => writeFileSync(join(s.out, "references", PLAN.request.images[1].name), png(1024, 1024)) }); refused(img, run(img, [...argsOf(IDS[0]), ...SEND], KEY), "images");
  const changed = sandbox({ base: (s) => { const p = join(s.repo, ..."tools/avatar/northstar-hair-template-d371.mjs".split("/")); writeFileSync(p, readFileSync(p, "utf8").replace("export const EAR_RIM = 3", "export const EAR_RIM = 4").replace("EYE_CLEAR = 2, EAR_RIM = 3", "EYE_CLEAR = 2, EAR_RIM = 4")); } });
  refused(changed, run(changed, [...argsOf(IDS[0]), ...SEND], KEY), "pins");
  const noToken = sandbox({ base: (s) => { const p = join(s.repo, ...DECISION_REL.split("/")); writeFileSync(p, readFileSync(p, "utf8").replace("D-371 HAIR: 3 CALLS AUTHORISED (1 PER STYLE)", "D-371 HAIR: PREPARED")); } }); refused(noToken, run(noToken, [...argsOf(IDS[0]), ...SEND], KEY), "decision");
  const noFlag = sandbox(); refused(noFlag, run(noFlag, [...argsOf(IDS[0]), "--send"], KEY), "arguments");
});
