// D-371 NH-4 — one short hairstyle with a soft texture on the CLEAN head: the model edits the clean head and only its grey hair is kept
// (northstar-hair-nh4-post.mjs); the input images (northstar-hair-nh4-inputs.mjs), the zones (northstar-hair-nh4-zones.mjs), the frozen plan
// (plan-nh4-v1.json) and one one-shot call (authorisation-nh4-v1.json, tools/avatar/openai-send-northstar-hair-nh4.mjs). NH-2 and NH-3 stay
// paused. The static tests run everywhere. The input images, the post-processing rehearsal and the mocked sends need the private files kept
// outside the clones: they run only where those exist — skipped in CI, never faked. A dummy key and a mocked fetch only; the real key is
// never read (D-142). 0 image calls.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, copyFileSync, realpathSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join, dirname, relative, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir, homedir } from "node:os";
import { encodePng, decodePng, pixelSha256 } from "../../tools/avatar/r3-hair-tool-v2.mjs";
import * as T from "../../tools/avatar/northstar-hair-template-d371.mjs";
import * as PP from "../../tools/avatar/northstar-hair-nh4-post.mjs";
import * as IN from "../../tools/avatar/northstar-hair-nh4-inputs.mjs";
import { toGrey } from "../../tools/avatar/northstar-hair-trial-d368.mjs";

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = resolve(HERE, "..", "..");
const sha256 = (b) => createHash("sha256").update(b).digest("hex"), repoFile = (rel) => join(REPO, ...rel.split("/")), FX = "tools/avatar/fixtures/northstar-hair-d371/";
const ADAPTER_REL = "tools/avatar/openai-send-northstar-hair-nh4.mjs", LEDGER_REL = "tools/avatar/r3-face-neutral-attempt-ledger.mjs", LEGACY_REL = "docs/project-state.md";
const DECISION_REL = "docs/decisions/D-371.md", TRIAL_REL = "docs/decisions/D-368.md", AUTH_REL = FX + "authorisation-nh4-v1.json", PLAN_REL = FX + "plan-nh4-v1.json";
const D371_AUTH_REL = FX + "authorisation-v1.json", NH1B_AUTH_REL = FX + "authorisation-nh1b-v1.json";
const SRC = readFileSync(repoFile(ADAPTER_REL), "utf8"), CODE = SRC.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
const json = (rel) => JSON.parse(readFileSync(repoFile(rel), "utf8"));
const AUTH = json(AUTH_REL), PLAN = json(PLAN_REL), D371 = json(D371_AUTH_REL), NH1B = json(NH1B_AUTH_REL), DECISION = readFileSync(repoFile(DECISION_REL), "utf8");
const MODEL = "gpt-image-2.5-sunburst-2026-09-08", ID = "NH-4-hair-soft-texture", METHOD_FILES = Object.keys(PLAN.method.files);
const ARGS = ["--call-id=" + ID, "--claim-identity=" + ID + "-claim"], SEND = ["--send", "--owner-approval=D-371-NH-4"], KEY = { ["OPENAI_API" + "_KEY"]: "sk-nh4-sandbox-dummy-key-not-a-credential" };
const KEY_READ = "process.env." + "OPENAI_API" + "_KEY";   // spelt in parts so this file never reads it (the D-142 guard)
const TOKEN = "D-371 NH-4: 1 CALL AUTHORISED (SOFT TEXTURE, CLEAN HEAD)";
const REFS = join(homedir(), "Documents", "DenSejeApp-artefacts", "hair-d371-calls", "references");
const have = (list) => list.every((i) => existsSync(join(REFS, i.name)) && sha256(readFileSync(join(REFS, i.name))) === i.sha256);
const SKIP_SEND = have(PLAN.request.images) ? false : "the three input images are kept outside the clones; write Image 1 and Image 3 with northstar-hair-nh4-inputs.mjs to run the mocked sends";
const SKIP_POST = have(PLAN.post.inputs) ? false : "the clean head layer, its ear mask and the side-swept layer are kept outside the clones";
const isInside = (c, p) => { const r = relative(p, c); return r === "" || (!r.startsWith("..") && !isAbsolute(r)); };
const plain = (o) => JSON.parse(JSON.stringify(o));
const postInput = (role) => decodePng(readFileSync(join(REFS, PLAN.post.inputs.find((i) => i.role === role).name))).px;

test("NH-4 input images: Image 1 and Image 3 are the tool's output from the pinned clean head and its ear mask", { skip: SKIP_POST }, () => {
  const img = IN.inputImages(T.buildTemplate(), postInput("clean head"), postInput("ear mask"));
  assert.equal(pixelSha256(img.head), PLAN.request.images[0].pixelSha256); assert.equal(pixelSha256(img.guide), PLAN.request.images[2].pixelSha256);
});

test("NH-4 post-processing, dress rehearsal: results made from the side-swept trial are lifted and judged as expected (P8 sees the side-swept trial itself)", { skip: SKIP_POST }, () => {
  const t = T.buildTemplate(), base = postInput("clean head"), ear = postInput("ear mask"), swept = postInput("side-swept"), grey = toGrey(swept), N = 1024 * 1536;
  const paint = (h, x0, y0, x1, y1, g, ell) => { const o = new Uint8ClampedArray(h); for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { if (ell && ((x - (x0 + x1) / 2) / ((x1 - x0) / 2)) ** 2 + ((y - (y0 + y1) / 2) / ((y1 - y0) / 2)) ** 2 > 1) continue; o.set([g, g, g, 255], (y * 1024 + x) * 4); } return o; };
  const run = (img) => PP.postProcess({ result: img, base, ear, swept, t });
  const A = run(PP.onHead(base, ear, grey));
  assert.deepEqual(A.report.failed, ["P8"], JSON.stringify(A.report.checks)); assert.ok(A.report.checks.P8.iouSideSwept > 0.9, "it IS the side-swept trial");
  let I = 0, U = 0; for (let i = 0; i < N; i++) { const e = A.HL[i * 4 + 3] >= 128, tr = swept[i * 4 + 3] >= 128 && !ear[i * 4 + 3]; if (e && tr) I++; if (e || tr) U++; } assert.ok(I / U >= 0.97, "lifted hair IoU " + I / U);
  assert.deepEqual([A.report.checks.P4.softIdentical, A.report.checks.P6.pass], [A.report.checks.P4.softEdges, true], "the ears' soft edges and the clean head outside the hair are untouched");
  const B = run(PP.drift(PP.onHead(base, ear, grey), 1.02, 10, -6));
  assert.deepEqual(B.report.failed, ["P8"]); assert.deepEqual([B.report.checks.P1.scale, B.report.checks.P1.dx, B.report.checks.P1.dy], [1.02, 10, -6], "the registration finds the drift");
  assert.deepEqual([...run(PP.onHead(base, ear, paint(grey, 420, 244, 462, 266, 90, true))).report.failed].sort(), ["P3", "P8"], "hair on a brow is rejected, not trimmed");
  assert.deepEqual([...run(PP.onHead(base, ear, new Uint8ClampedArray(N * 4))).report.failed].sort(), ["P2", "P5", "P7"]);
  assert.deepEqual([...run(PP.onHead(base, ear, swept)).report.failed].sort(), ["P2", "P5", "P7", "P9"], "coloured hair is not lifted");
  assert.deepEqual([...run(PP.onHead(base, ear, paint(grey, 480, 40, 560, 72, 110, false))).report.failed].sort(), ["P8", "P9"], "hair outside the zone is rejected, not trimmed");
});

test("NH-4 plan: the frozen prompt, the three private images in order, the post-processing and its checks, the locked method", () => {
  assert.deepEqual([PLAN.decision, PLAN.callId, PLAN.authorisesImageRequest], ["D-371", ID, false]);
  assert.deepEqual([PLAN.prompt.sha256, PLAN.prompt.bytes], [sha256(Buffer.from(PLAN.prompt.text, "utf8")), Buffer.byteLength(PLAN.prompt.text, "utf8")]); assert.ok(!/[{}]|undefined|null|NaN|\r/.test(PLAN.prompt.text));
  for (const re of [/Edit Image 1: add a new hairstyle on the head and change nothing else/, /no shift, no zoom, no tilt, no crop/, /soft, uneven texture and a clear silhouette/, /no single dominant forehead lock and no side parting/, /neutral greyscale only/, /Nothing in the red areas/, /16 pixels of empty transparent margin/]) assert.match(PLAN.prompt.text, re);
  assert.deepEqual([PLAN.request.model, PLAN.request.parameters, PLAN.request.neverSent], [MODEL, { size: "1024x1024", quality: "high", n: 1, output_format: "png", background: "transparent" }, ["mask", "input_fidelity", "any other image"]]);
  assert.deepEqual(PLAN.request.images.map((i) => [i.role, i.name, i.tracked]), [["Image 1", IN.NAMES.head, false], ["Image 2", "northstar-hair-reference-1024.png", false], ["Image 3", IN.NAMES.guide, false]]);
  assert.equal(PLAN.request.images[1].sha256, json(FX + "plan-v1.json").request.images[0].sha256, "Image 2 is D-371's Northstar reference, unchanged");
  assert.deepEqual(PLAN.request.fieldOrder, ["model", "image[]", "image[]", "image[]", "prompt", "size", "quality", "n", "output_format", "background"]);
  for (const f of METHOD_FILES) assert.equal(sha256(readFileSync(repoFile(f))), PLAN.method.files[f], f + " changed after the lock: a changed method is a new plan version");
  for (const f of ["tools/avatar/northstar-hair-nh4-zones.mjs", "tools/avatar/northstar-hair-nh4-inputs.mjs", "tools/avatar/northstar-hair-nh4-post.mjs", T.FIXTURE]) assert.ok(METHOD_FILES.includes(f), f);
  assert.deepEqual(plain(PLAN.post.gates), plain(PP.GATES)); assert.deepEqual(PLAN.post.tint.stops, plain(PP.NORTHSTAR_STOPS)); assert.equal(PLAN.post.tool, "tools/avatar/northstar-hair-nh4-post.mjs");
  assert.deepEqual(PLAN.post.inputs.map((i) => [i.role, i.tracked]), [["clean head", false], ["ear mask", false], ["side-swept", false]]);
  assert.deepEqual([PP.GATES.P2.min, PP.GATES.P3.minGap, PP.GATES.P8.max, PP.GATES.P9.max], [0.98, 6, 0.75, 0.03]);
  assert.deepEqual(PLAN.paused, ["NH-2-hair-curls", "NH-3-hair-sidepart"]); assert.ok(PLAN.visualStop.some((v) => /nothing is retouched to pass/.test(v)));
});

test("NH-4 authorisation: one call, its own budget, spent; the first extraction rejected on P3, P4 and P8; NH-1 and NH-1B spent, NH-2 and NH-3 paused; the decision carries the token and every pin", () => {
  assert.deepEqual([AUTH.decision, AUTH.callId, AUTH.meta.authorisesImageRequest, AUTH.budget.authorised, AUTH.budget.reserve, AUTH.budget.retries, AUTH.budget.fallback, AUTH.budget.reusesEarlierPermissions, AUTH.budget.actuallySent], ["D-371", ID, false, 1, 0, 0, false, false, 1]);
  // NH-4 was sent once (2026-11-12); it is never an active permission again; its first extraction is rejected
  assert.deepEqual([AUTH.call.callId, AUTH.call.style, AUTH.call.mandateState, AUTH.call.outcome, AUTH.call.prompt.sha256], [ID, "short-soft", "SPENT", "RECEIVED_FOR_PLACEMENT", PLAN.prompt.sha256]);
  const r = AUTH.call.result; assert.deepEqual([AUTH.call.neverReuse, r.assessment, r.extractionV1.verdict, r.extractionV1.failed, r.image.tracked, r.neverPromoted], [true, "EXTRACTION_V1_REJECTED", "REJECTED", ["P3", "P4", "P8"], false, true]);
  assert.deepEqual([r.privateCandidate, r.extractionV2.status, r.extractionV2.newImageCall, r.extractionV2.failed, r.extractionV2.P8.iouSideSwept, r.extractionV2.P10.v2.longestRun], ["extractionV2", "PRIVATE_CANDIDATE", false, ["P3", "P4", "P8"], 0.766, 1], "V2 is a private candidate from the same raw image, with its actual results");
  assert.deepEqual(AUTH.call.claim, { identity: ID + "-claim", filename: ID + ".claim.json", eventsFilename: ID + ".events.jsonl" });
  assert.equal(AUTH.frozen.plan.sha256, sha256(readFileSync(repoFile(PLAN_REL)))); assert.deepEqual(AUTH.frozen.methodFiles, PLAN.method.files);
  assert.deepEqual(AUTH.request.images, PLAN.request.images.map((i) => ({ role: i.role, name: i.name, bytes: i.bytes, sha256: i.sha256, tracked: false })));
  assert.deepEqual(D371.calls.map((e) => [e.callId, e.mandateState]), [["NH-1-hair-short", "SPENT"], ["NH-2-hair-curls", "UNSPENT"], ["NH-3-hair-sidepart", "UNSPENT"]]); assert.equal(D371.afterShort.verdict, "PENDING");
  assert.deepEqual([NH1B.callId, NH1B.call.mandateState], ["NH-1B-hair-short-silhouette", "SPENT"]);
  const status = /^status: (.*)$/m.exec(DECISION)[1].split(" — ").map((x) => x.trim());
  for (const tk of [TOKEN, "D-371 HAIR: 3 CALLS AUTHORISED (1 PER STYLE)", "D-371 NH-1B: 1 CALL AUTHORISED (KORT, FIXED COMPOSITION)"]) assert.ok(status.includes(tk), tk);
  for (const n of [ID, "--owner-approval=D-371-NH-4", MODEL, ADAPTER_REL, AUTH.frozen.plan.sha256, "1024x1024", PLAN.prompt.sha256, ...PLAN.request.images.map((i) => i.sha256)]) assert.ok(DECISION.includes(n), n);
  assert.ok(AUTH.budget.price.perCallUpperEstimate <= 0.09); assert.match(AUTH.budget.price.note, /estimate, not a guaranteed maximum/);
  assert.deepEqual([AUTH.adapterImplementations.adapter, AUTH.adapterImplementations.ownerApprovalFlag, AUTH.adapterImplementations.status], [ADAPTER_REL, "--owner-approval=D-371-NH-4", "IMPLEMENTED — NOT EXECUTED"]);
});

test("the NH-4 adapter: no exports, only node built-ins and the ledger, exactly one fetch, the key once, three images in order, every check before any claim", () => {
  assert.ok(!/^\s*export\b/m.test(CODE));
  for (const m of CODE.matchAll(/^\s*import\b[^;]*?from\s+"([^"]+)"/gm)) assert.ok(m[1].startsWith("node:") || m[1] === "./r3-face-neutral-attempt-ledger.mjs", m[1]);
  assert.equal([...CODE.matchAll(/\bfetch\s*\(/g)].length, 1); assert.equal(CODE.split(KEY_READ).length - 1, 1); assert.equal([...CODE.matchAll(/fd\.append\(IMAGE_FIELD/g)].length, 1);
  const body = CODE.slice(CODE.indexOf("async function main(argv)")); let last = -1;
  for (const k of ["parseArgs(argv)", "resolveRefs()", "readOriginBlobs(", "verifyPrompts(blobs)", "verifyDecisions(", "verifyAuthorisation(", "verifyImplementation(", "readImages(", "resolveClaimLocation(call)", "verifyOrderAndStops(", "resolveOutputs(call)", "buildBody(", "if (!args.sendMode)", KEY_READ, "createClaim(", "globalThis.fetch("]) {
    const at = body.indexOf(k); assert.ok(at > last, k + " comes after the previous check"); last = at; }
  assert.match(CODE, /const MAX_CALLS = 1;/); assert.match(CODE, /const OUT_DIR_NAME = "hair-d371-calls";/); assert.ok(!/NH-2-hair-curls"\s*:|CASES|FIRST_CALL|AFTER_SHORT_OK/.test(CODE), "no D-371 call machinery left");
  assert.ok(!/const CALL_ID = "NH-1B/.test(CODE) && !/composition-nh1b/.test(CODE), "no NH-1B identity or composition left");
  for (const r of AUTH.stopRules) assert.ok(SRC.includes(JSON.stringify(r)), "the adapter carries the stop rule: " + r);
  for (const f of METHOD_FILES) assert.ok(SRC.includes(JSON.stringify(f)), "the adapter locks " + f);
  assert.ok(SRC.includes(`const PLAN_SHA256 = "${AUTH.frozen.plan.sha256}";`)); assert.ok(SRC.includes(`const PROMPT_SHA256 = "${PLAN.prompt.sha256}";`));
  for (const i of PLAN.request.images) assert.ok(SRC.includes(`name: "${i.name}", bytes: ${i.bytes}, sha256: "${i.sha256}"`), i.name);
});

// ── sandbox: a throw-away git repository, a mocked fetch, the three images copied in ───────────────────────────────────
const ROOTS = []; after(() => { for (const r of ROOTS) if (isInside(r, realpathSync.native(tmpdir())) && /nh4-sandbox-/.test(r)) rmSync(r, { recursive: true, force: true }); });
const MOCK_SRC = [
  "import { appendFileSync, readFileSync } from \"node:fs\"; import { createHash } from \"node:crypto\";",
  "const LOG = process.env.NH4_MOCK_LOG, PNG = process.env.NH4_MOCK_PNG, MODE = process.env.NH4_MOCK_MODE;",
  "if (!LOG || !PNG || !MODE) throw new Error(\"nh4 mock: not configured — refusing to run\");",
  "const h = async (f) => createHash(\"sha256\").update(Buffer.from(await f.arrayBuffer())).digest(\"hex\");",
  "globalThis.fetch = async function nh4MockFetch(url, init) {",
  "  const b = init.body; appendFileSync(LOG, JSON.stringify({ url: String(url), redirect: init.redirect, fields: [...b.keys()], imageSha: await Promise.all(b.getAll(\"image[]\").map(h)), imageNames: b.getAll(\"image[]\").map((f) => f.name), prompt: b.get(\"prompt\"), size: b.get(\"size\"), n: b.get(\"n\"), mask: b.has(\"mask\") }) + \"\\n\");",
  "  if (MODE === \"throw\") throw new TypeError(\"fetch failed (mock transport error)\");",
  "  return new Response(JSON.stringify({ created: 1, data: [{ b64_json: readFileSync(PNG).toString(\"base64\") }] }), { status: 200, headers: { \"content-type\": \"application/json\", \"x-request-id\": \"req_mockok\" } });",
  "};"].join("\n");
const TRACKED = [ADAPTER_REL, LEDGER_REL, LEGACY_REL, DECISION_REL, TRIAL_REL, AUTH_REL, PLAN_REL, D371_AUTH_REL, NH1B_AUTH_REL, ...METHOD_FILES];
const png = (w2, h2) => { const px = new Uint8ClampedArray(w2 * h2 * 4); for (let i = 0; i < w2 * h2; i++) px.set([150, 150, 150, 255], i * 4); return encodePng(w2, h2, px); };
function envFor(sb, extra) { const env = {}; for (const k of ["PATH", "Path", "SystemRoot", "windir", "COMSPEC", "PATHEXT", "SystemDrive"]) if (typeof process.env[k] === "string") env[k] = process.env[k];
  return Object.assign(env, { LOCALAPPDATA: sb.state, XDG_STATE_HOME: sb.state, HOME: sb.home, USERPROFILE: sb.home, TEMP: sb.tmp, TMP: sb.tmp, TMPDIR: sb.tmp, HTTP_PROXY: "http://127.0.0.1:9", HTTPS_PROXY: "http://127.0.0.1:9",
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: sb.gitconfig, NH4_MOCK_LOG: sb.log, NH4_MOCK_PNG: sb.png, NH4_MOCK_MODE: "ok" }, extra || {}); }
function sgit(sb, args) { const r = spawnSync("git", ["-C", sb.repo, "-c", "user.name=nh4-sandbox", "-c", "user.email=sandbox@example.invalid", "-c", "core.autocrlf=false", ...args], { env: envFor(sb), encoding: "utf8", windowsHide: true }); if (r.status !== 0) throw new Error("sandbox git " + args.join(" ") + ": " + r.stderr); return r.stdout.trim(); }
function sandbox({ base: mod } = {}) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "nh4-sandbox-"))); ROOTS.push(root);
  const sb = { root, repo: join(root, "repo"), state: join(root, "state"), tmp: join(root, "tmp"), home: join(root, "home"), log: join(root, "fetch.log"), gitconfig: join(root, "gitconfig"), png: join(root, "out.png"), mock: join(root, "mock.mjs") };
  sb.out = join(sb.home, "Documents", "DenSejeApp-artefacts", "hair-d371-calls"); for (const d of [sb.repo, sb.state, sb.tmp, sb.home]) mkdirSync(d, { recursive: true });
  writeFileSync(sb.gitconfig, "[core]\n\tautocrlf = false\n[init]\n\tdefaultBranch = main\n"); writeFileSync(sb.mock, MOCK_SRC); writeFileSync(sb.log, ""); writeFileSync(sb.png, png(1024, 1024));
  const rd = join(sb.out, "references"); mkdirSync(rd, { recursive: true }); for (const i of PLAN.request.images) copyFileSync(join(REFS, i.name), join(rd, i.name));
  for (const rel of TRACKED) { const dst = join(sb.repo, ...rel.split("/")); mkdirSync(dirname(dst), { recursive: true }); copyFileSync(repoFile(rel), dst); }
  // the adapter's behaviour is tested on the authorisation as merged, before NH-4 was spent (2026-11-12)
  { const p = join(sb.repo, ...AUTH_REL.split("/")), a = JSON.parse(readFileSync(p, "utf8")), e = a.call; a.budget.actuallySent = 0;
    e.mandateState = "UNSPENT"; e.outcome = "NOT YET ATTEMPTED"; for (const k of ["neverReuse", "closedBy", "result"]) delete e[k]; writeFileSync(p, JSON.stringify(a, null, 2) + "\n"); }
  if (mod) mod(sb);
  sgit(sb, ["init", "-q", "-b", "main"]); sgit(sb, ["add", "-A"]); sgit(sb, ["commit", "-q", "-m", "base"]); sgit(sb, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  return sb; }
const run = (sb, args, extra) => { const r = spawnSync(process.execPath, ["--import", pathToFileURL(sb.mock).href, join(sb.repo, ...ADAPTER_REL.split("/")), ...args], { cwd: sb.repo, env: envFor(sb, extra), encoding: "utf8", windowsHide: true, timeout: 180000 }); return { status: r.status, out: (r.stdout || "") + (r.stderr || "") }; };
const fetchLog = (sb) => readFileSync(sb.log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
function refused(sb, r, stage, sends = 0) { assert.equal(r.status, 1, r.out); assert.match(r.out, new RegExp("REFUSED \\[" + stage + "\\]"), r.out); assert.equal(fetchLog(sb).length, sends); }
const editJson = (rel, f) => (s) => { const p = join(s.repo, ...rel.split("/")), a = JSON.parse(readFileSync(p, "utf8")); f(a); writeFileSync(p, JSON.stringify(a, null, 2) + "\n"); };

test("NH-4 dry run passes; the one send carries the three images in order and the frozen prompt, no mask, and is never repeated", { skip: SKIP_SEND }, () => {
  const sb = sandbox(); const d = run(sb, ARGS); assert.equal(d.status, 0, d.out); assert.match(d.out, /DRY RUN PASSED/); assert.equal(fetchLog(sb).length, 0);
  for (const other of ["NH-1-hair-short", "NH-1B-hair-short-silhouette", "NH-2-hair-curls", "NH-3-hair-sidepart"]) { const r = run(sb, ["--call-id=" + other, "--claim-identity=" + other + "-claim"]); assert.equal(r.status, 1); assert.match(r.out, /REFUSED \[arguments\]/); }
  refused(sb, run(sb, [...ARGS, "--send", "--owner-approval=D-371-NH-1B"], KEY), "arguments");
  const r = run(sb, [...ARGS, ...SEND], KEY); assert.equal(r.status, 0, r.out); const Lg = fetchLog(sb); assert.equal(Lg.length, 1);
  assert.deepEqual([Lg[0].fields, Lg[0].imageSha, Lg[0].imageNames, Lg[0].size, Lg[0].n, Lg[0].redirect, Lg[0].mask], [AUTH.request.fieldOrder, PLAN.request.images.map((i) => i.sha256), PLAN.request.images.map((i) => i.name), "1024x1024", "1", "error", false]);
  assert.equal(Lg[0].prompt, PLAN.prompt.text);
  assert.ok(existsSync(join(sb.out, ID, "nh.image-1.png")) && existsSync(join(sb.out, ID, "nh.receipt.json"))); assert.equal(sgit(sb, ["status", "--porcelain"]), "");
  assert.match(JSON.parse(readFileSync(join(sb.out, ID, "nh.receipt.json"), "utf8")).next, /northstar-hair-nh4-post\.mjs --result/);
  refused(sb, run(sb, [...ARGS, ...SEND], KEY), "claim-exists", 1);
});

test("NH-4 is refused before any claim when NH-1 or NH-1B is not spent, NH-2/NH-3 are released, the stop file exists, Image 3 or a method file changed, or the token is missing", { skip: SKIP_SEND }, () => {
  const notSpent = sandbox({ base: editJson(D371_AUTH_REL, (a) => { a.calls[0].mandateState = "UNSPENT"; }) }); refused(notSpent, run(notSpent, [...ARGS, ...SEND], KEY), "authorisation");
  const nh1b = sandbox({ base: editJson(NH1B_AUTH_REL, (a) => { a.call.mandateState = "UNSPENT"; }) }); refused(nh1b, run(nh1b, [...ARGS, ...SEND], KEY), "authorisation");
  const released = sandbox({ base: editJson(D371_AUTH_REL, (a) => { a.afterShort.verdict = "NO_COMMON_FAULT"; }) }); refused(released, run(released, [...ARGS, ...SEND], KEY), "authorisation");
  const stop = sandbox({ base: (s) => writeFileSync(join(s.out, "NH-STOP.json"), "{}\n") }); refused(stop, run(stop, [...ARGS, ...SEND], KEY), "stopped");
  const img = sandbox({ base: (s) => writeFileSync(join(s.out, "references", PLAN.request.images[2].name), png(1024, 1024)) }); refused(img, run(img, [...ARGS, ...SEND], KEY), "images");
  const changed = sandbox({ base: (s) => { const p = join(s.repo, ..."tools/avatar/northstar-hair-nh4-post.mjs".split("/")); writeFileSync(p, readFileSync(p, "utf8").replace("min: 0.98 },", "min: 0.5 },")); } });
  refused(changed, run(changed, [...ARGS, ...SEND], KEY), "pins");
  const noToken = sandbox({ base: (s) => { const p = join(s.repo, ...DECISION_REL.split("/")); writeFileSync(p, readFileSync(p, "utf8").replace(TOKEN, "D-371 NH-4: PREPARED")); } }); refused(noToken, run(noToken, [...ARGS, ...SEND], KEY), "decision");
  const u = sandbox(); assert.equal(run(u, [...ARGS, ...SEND], { ...KEY, NH4_MOCK_MODE: "throw" }).status, 3); refused(u, run(u, [...ARGS, ...SEND], KEY), "claim-exists", 1);
});
