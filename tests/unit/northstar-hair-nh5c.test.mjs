// D-379 NH-5C — the nape locks on D-373's shared head base: design C, its layer order, the call's inputs and the post-processing
// (tools/avatar/northstar-hair-nh5c.mjs), the frozen plan (plan-nh5c-v1.json) and one one-shot call (authorisation-nh5c-v1.json,
// tools/avatar/openai-send-northstar-hair-nh5c.mjs). The static tests run everywhere. The input images and the mocked sends need the private
// files kept outside the clones: they run only where those exist — skipped in CI, never faked. The twelve-case rehearsal decodes the
// published layers with a vendored program, so it is not a unit test (D-094): it is the private command in plan-nh5c-v1.json rehearsal. A dummy key and a mocked
// fetch only; the real key is never read (D-142). 0 image calls.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, copyFileSync, realpathSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join, dirname, relative, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir, homedir } from "node:os";
import { encodePng, decodePng } from "../../tools/avatar/r3-hair-tool-v2.mjs";
import * as NH5 from "../../tools/avatar/northstar-hair-nh5.mjs";
import * as C from "../../tools/avatar/northstar-hair-nh5c.mjs";

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = resolve(HERE, "..", "..");
const sha256 = (b) => createHash("sha256").update(b).digest("hex"), repoFile = (rel) => join(REPO, ...rel.split("/")), FX = "tools/avatar/fixtures/northstar-hair-d379/";
const ADAPTER_REL = "tools/avatar/openai-send-northstar-hair-nh5c.mjs", LEDGER_REL = "tools/avatar/r3-face-neutral-attempt-ledger.mjs", LEGACY_REL = "docs/project-state.md";
const DECISION_REL = "docs/decisions/D-379.md", BASE_REL = "docs/decisions/D-373.md", AUTH_REL = FX + "authorisation-nh5c-v1.json", PLAN_REL = FX + "plan-nh5c-v1.json";
const SRC = readFileSync(repoFile(ADAPTER_REL), "utf8"), CODE = SRC.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
const json = (rel) => JSON.parse(readFileSync(repoFile(rel), "utf8"));
const AUTH = json(AUTH_REL), PLAN = json(PLAN_REL), DECISION = readFileSync(repoFile(DECISION_REL), "utf8");
const MODEL = "gpt-image-2.5-sunburst-2026-09-08", ID = "NH-5C-hair-nape-locks", METHOD_FILES = Object.keys(PLAN.method.files);
const ARGS = ["--call-id=" + ID, "--claim-identity=" + ID + "-claim"], SEND = ["--send", "--owner-approval=D-379-NH-5C"], KEY = { ["OPENAI_API" + "_KEY"]: "sk-nh5c-sandbox-dummy-key-not-a-credential" };
const KEY_READ = "process.env." + "OPENAI_API" + "_KEY";   // spelt in parts so this file never reads it (the D-142 guard)
const TOKEN = "D-379 NH-5C: 1 CALL BOUND (NAPE LOCKS, D-373 BASE)";
const REFS = join(homedir(), "Documents", "DenSejeApp-artefacts", "hair-nh5-round", "references");
const have = (list) => list.every((i) => existsSync(join(REFS, i.name)) && sha256(readFileSync(join(REFS, i.name))) === i.sha256);
const SKIP_SEND = have(PLAN.request.images) ? false : "the three input images are kept outside the clones; write them with northstar-hair-nh5c.mjs --inputs to run the mocked sends";
const SKIP_POST = have(PLAN.post.inputs) && have(PLAN.request.images) ? false : "D-373's base, the ear mask and NH-4's layer are kept outside the clones";
const isInside = (c, p) => { const r = relative(p, c); return r === "" || (!r.startsWith("..") && !isAbsolute(r)); };
const plain = (o) => JSON.parse(JSON.stringify(o));
const priv = (name) => decodePng(readFileSync(join(REFS, name))).px;
const { W, N } = C;

test("NH-5C layer order: the locks lie behind the face, the front hair over the skull, each ear once on top; the hair continues behind a soft edge", () => {
  const base = new Uint8ClampedArray(N * 4), ear = new Uint8ClampedArray(N * 4), HL = new Uint8ClampedArray(N * 4), at = (x, y) => (y * W + x) * 4;
  base.set([230, 180, 140, 255], at(500, 350)); base.set([230, 180, 140, 255], at(500, 300));             // face skin below and above the ear tops
  base.set([20, 20, 20, 128], at(340, 340)); ear.set([255, 255, 255, 255], at(340, 340));                // an ear's soft outline pixel
  base.set([240, 190, 150, 255], at(345, 340)); ear.set([255, 255, 255, 255], at(345, 345));             // an opaque ear pixel
  for (const [x, y] of [[500, 350], [500, 300], [338, 340], [339, 340], [341, 340], [337, 341]]) HL.set([90, 70, 50, 255], at(x, y));
  const r = C.composeC(base, ear, HL);
  assert.deepEqual([...r.pic.subarray(at(500, 350), at(500, 350) + 4)], [230, 180, 140, 255], "a lock under the ear tops lies BEHIND the face");
  assert.equal(r.VIS[500 * 0 + 350 * W + 500], 0, "and is not counted as seen");
  assert.deepEqual([...r.pic.subarray(at(500, 300), at(500, 300) + 4)], [90, 70, 50, 255], "the front hair above the ear tops lies over the base");
  assert.equal(r.HL[at(340, 340) + 3], 255, "the hair continues behind the ear's soft edge");
  const p = r.pic.subarray(at(340, 340), at(340, 340) + 4); assert.equal(p[3], 255); assert.ok(p[0] < 90 && p[0] > 20, "the soft edge shows the ear's outline over the hair: " + [...p]);
  assert.deepEqual([r.ears.earSoft, r.ears.earSoftOver], [1, 1]);
  assert.deepEqual([...r.pic.subarray(at(345, 340), at(345, 340) + 4)], [240, 190, 150, 255]);
  for (let i = 0; i < N; i++) if (r.HL[i * 4 + 3] === 0 && i % 9973 === 0) assert.deepEqual([...r.pic.subarray(i * 4, i * 4 + 4)], [...base.subarray(i * 4, i * 4 + 4)]);
});

test("NH-5C design: the parting's V opens the forehead, the locks end at the jawline above the clothes, the zone mirrors about the ears' centre", () => {
  assert.equal(C.hairlineY(512), 188); assert.ok(C.hairlineY(430) > 215 && C.hairlineY(594) > 215, "the hair falls from the parting to the temples");
  assert.ok(C.DESIGN.lockEnd <= 424 && C.DESIGN.lockEnd + 30 <= 455, "the tips end at the jawline, well above the collar (y ≥ 455)");
  assert.equal(C.EAR_TOP, 306); assert.equal(C.MIRROR, 1018);
  assert.deepEqual(C.NAMES, { base: NH5.NAMES.base, head: NH5.NAMES.head, guide: "nh5c-guide-1024.png", style: NH5.NAMES.style });
  assert.deepEqual(C.REHEARSAL.map((c) => c.key), ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"]);
  assert.deepEqual(C.REHEARSAL.filter((c) => c.cutAt).map((c) => c.cutAt), ["parting", "right temple", "right nape"]);
  assert.deepEqual(C.REHEARSAL.filter((c) => c.dress).map((c) => [c.key, c.dress]), [["A", "passes"], ["G", "rejected"]]);
  assert.deepEqual(C.TOPS.map((t) => t[1]), ["top-tee-hip-cream", "top-tank-navy", "top-sweater-ls2-heather"]);
});

test("NH-5C inputs: Image 1 and Image 3 are NH-5B's own files; Image 2 is the tool's guide from the private base and ear mask", { skip: SKIP_POST }, () => {
  const base = priv(C.NAMES.base), ear = priv("clean-head-ear-on-top-mask.png");
  assert.equal(sha256(encodePng(1024, 1024, NH5.inputImages(base, ear).head)), PLAN.request.images[0].sha256);
  assert.equal(sha256(encodePng(1024, 1024, C.guideImage(base, ear))), PLAN.request.images[1].sha256);
  assert.equal(sha256(readFileSync(join(REFS, C.NAMES.style))), PLAN.request.images[2].sha256);
  const nh5b = json("tools/avatar/fixtures/northstar-hair-d375/plan-nh5b-v1.json"); assert.deepEqual([PLAN.request.images[0], PLAN.request.images[2]].map((i) => i.sha256), [nh5b.request.images[0].sha256, nh5b.request.images[2].sha256]);
});

test("NH-5C plan: design C, the frozen prompt, the three private images in order, no hair input, the layer order, the post-processing and P1–P13, the locked method", () => {
  assert.deepEqual([PLAN.decision, PLAN.callId, PLAN.design, PLAN.authorisesImageRequest], ["D-379", ID, "C", false]);
  assert.deepEqual([PLAN.prompt.sha256, PLAN.prompt.bytes], [sha256(Buffer.from(PLAN.prompt.text, "utf8")), Buffer.byteLength(PLAN.prompt.text, "utf8")]); assert.ok(!/[{}]|undefined|null|NaN|\r/.test(PLAN.prompt.text));
  assert.equal(PLAN.prompt.sha256, "b57068ada2f2b41c685758d1f402a0a057605e92043956119d631bc5e28c5753");
  for (const re of [/Edit Image 1: add a new hairstyle on the head and change nothing else/, /no shift, no zoom, no tilt, no crop/, /soft nape locks with a centre parting/, /hang behind the ear and behind the jaw/, /the jaw's outline stays in front of the locks/, /exactly ON the dark-blue line, with no band of bare skull/, /neutral greyscale only/, /Nothing in the red areas/, /Image 3 contains no hair/, /16 pixels of empty transparent margin/]) assert.match(PLAN.prompt.text, re);
  assert.ok(!/current hair|its current|hair reference|northstar-hair-reference|top knot/i.test(PLAN.prompt.text), "the prompt names no earlier hair");
  assert.deepEqual([PLAN.request.model, PLAN.request.parameters, PLAN.request.neverSent], [MODEL, { size: "1024x1024", quality: "high", n: 1, output_format: "png", background: "transparent" }, ["mask", "input_fidelity", "any other image"]]);
  assert.deepEqual(PLAN.request.images.map((i) => [i.role, i.name, i.tracked]), [["Image 1", C.NAMES.head, false], ["Image 2", C.NAMES.guide, false], ["Image 3", C.NAMES.style, false]]);
  for (const i of PLAN.request.images) assert.ok(!/reference|nh4|kort|sidesweep|standard|sketch|skitse/i.test(i.name), "no hair layer, sketch or earlier candidate is an input: " + i.name);
  assert.deepEqual(PLAN.request.fieldOrder, ["model", "image[]", "image[]", "image[]", "prompt", "size", "quality", "n", "output_format", "background"]);
  for (const f of METHOD_FILES) assert.equal(sha256(readFileSync(repoFile(f))), PLAN.method.files[f], f + " changed after the lock: a changed method is a new plan version");
  for (const f of ["tools/avatar/northstar-hair-nh5c.mjs", "tools/avatar/northstar-hair-nh5.mjs", "tools/avatar/northstar-hair-nh4-post.mjs", "tools/avatar/northstar-hair-nh4-exception-d372.mjs", "tools/avatar/northstar-hair-template-d371.mjs", NH5.D373_FIXTURE, C.TOPKNOT_HEAD]) assert.ok(METHOD_FILES.includes(f), f);
  assert.ok(!METHOD_FILES.includes("js/avatar-layers.js"), "the app module is read by the rehearsal only, never by the post-processing");
  assert.deepEqual(plain(PLAN.post.gates), plain(C.GATES)); assert.equal(PLAN.post.tool, "tools/avatar/northstar-hair-nh5c.mjs");
  assert.deepEqual(Object.keys(C.GATES), ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9", "P10", "P11", "P12", "P13"]);
  assert.deepEqual([C.GATES.P2.min, C.GATES.P3.minGap, C.GATES.P4.maxRaw, C.GATES.P4.maxLayer, C.GATES.P8.max, C.GATES.P8.minDesign, C.GATES.P9.max, C.GATES.P10.maxRun, C.GATES.P11.max, C.GATES.P12.max, C.GATES.P13.min, C.GATES.P13.endFrom, C.GATES.P13.endTo], [0.98, 6, 10, 20, 0.75, 0.6, 0.03, 6, 60, 40, 0.7, 405, 432]);
  assert.deepEqual(PLAN.post.inputs.map((i) => [i.role, i.tracked]), [["D-373 base", false], ["ear mask", false], ["NH-4 layer", false]]);
  assert.match(PLAN.layerOrder.headImage[0], /BEHIND the base/); assert.match(PLAN.layerOrder.headImage[3], /on top/); assert.match(PLAN.layerOrder.softEdges, /no light seam/);
  assert.equal(Object.keys(PLAN.rehearsal.cases).length, 12); assert.deepEqual(plain(PLAN.rehearsal.assembly.gates), plain(C.DRESS_GATES)); assert.ok(PLAN.visualStop.some((v) => /nothing is retouched to pass/.test(v)));
});

test("NH-5C authorisation: one call, its own budget, the frozen plan; sent once and spent, the locked extraction rejected with its measurements and the thresholds unchanged; the decision carries the token and every pin", () => {
  assert.deepEqual([AUTH.decision, AUTH.callId, AUTH.meta.authorisesImageRequest, AUTH.budget.authorised, AUTH.budget.reserve, AUTH.budget.retries, AUTH.budget.fallback, AUTH.budget.reusesEarlierPermissions, AUTH.budget.actuallySent], ["D-379", ID, false, 1, 0, 0, false, false, 1]);
  // NH-5C was sent once (2026-11-16); it is never an active permission again; its locked extraction is rejected
  assert.deepEqual([AUTH.call.callId, AUTH.call.style, AUTH.call.mandateState, AUTH.call.outcome, AUTH.call.neverReuse, AUTH.call.prompt.sha256], [ID, "nape-locks", "SPENT", "RECEIVED_FOR_PLACEMENT", true, PLAN.prompt.sha256]);
  const r = AUTH.call.result, x = r.extractionV1;
  assert.deepEqual([r.httpStatus, r.retries, r.originMainSha, r.image.tracked, r.neverPromoted, r.assessment, r.receipt.verdict], [200, 0, "87ac52a30a4b84b8f4c12f34eee3ed887072817a", false, true, "EXTRACTION_V1_REJECTED", "RECEIVED_FOR_PLACEMENT"]);
  assert.deepEqual([x.verdict, x.failed, x.passed, x.thresholdsUnchanged], ["REJECTED", ["P3", "P4", "P5", "P8", "P9", "P10", "P11", "P12", "P13"], ["P1", "P2", "P6", "P7"], true]);
  assert.deepEqual(Object.keys(x.checks).sort(), Object.keys(C.GATES).sort(), "every gate's measurement is recorded");
  for (const [k, v] of Object.entries(x.checks)) assert.equal(v.pass, !x.failed.includes(k), k);
  const k = x.checks, Gt = C.GATES;
  assert.deepEqual([k.P3.rawOnBrowsPx, k.P5.largestShare, k.P8.iou.design, k.P10.longestRun, k.P11.largestSpillClusterPx, k.P12.largestHolePx, k.P13.left.shown, k.P13.right.shown], [571, 0.9181, 0.563, 38, 945, 66, 0.221, 0.2282]);
  assert.ok(k.P3.rawOnBrowsPx > Gt.P3.maxRaw && k.P5.largestShare < Gt.P5.min && k.P8.iou.design < Gt.P8.minDesign && k.P9.spillShare > Gt.P9.max && k.P10.longestRun > Gt.P10.maxRun
    && k.P11.largestSpillClusterPx > Gt.P11.max && k.P12.largestHolePx > Gt.P12.max && k.P13.left.shown < Gt.P13.min && k.P13.right.shown < Gt.P13.min, "the recorded rejection holds against the unchanged thresholds");
  assert.ok(r.assembly.allPass && Object.keys(r.assembly.tops).length === 3 && Object.values(r.assembly.tops).every((t) => t.G1_locksOverClothesPx === 0 && t.G6_minGapToClothesPx >= 20));
  assert.deepEqual(AUTH.call.claim, { identity: ID + "-claim", filename: ID + ".claim.json", eventsFilename: ID + ".events.jsonl" });
  assert.equal(AUTH.frozen.plan.sha256, sha256(readFileSync(repoFile(PLAN_REL)))); assert.deepEqual(AUTH.frozen.methodFiles, PLAN.method.files);
  assert.deepEqual(AUTH.request.images, PLAN.request.images.map((i) => ({ role: i.role, name: i.name, bytes: i.bytes, sha256: i.sha256, tracked: false })));
  const status = /^status: (.*)$/m.exec(DECISION)[1].split(" — ").map((x) => x.trim()); assert.ok(status.includes(TOKEN), TOKEN); assert.ok(status.some((s) => /NH-5C SENT 2026-11-16 \(MANDATE SPENT, NEVER RESENT\)/.test(s)));
  for (const n of ["req_8e8ce0b13d644e8792465242b1e22f65", r.image.sha256, r.receipt.sha256, "87ac52a30a4b84b8f4c12f34eee3ed887072817a"]) assert.ok(DECISION.includes(n), n);
  for (const n of [ID, "--owner-approval=D-379-NH-5C", MODEL, ADAPTER_REL, AUTH.frozen.plan.sha256, "1024x1024", PLAN.prompt.sha256, PLAN.method.files["tools/avatar/northstar-hair-nh5c.mjs"], ...PLAN.request.images.map((i) => i.sha256)]) assert.ok(DECISION.includes(n), n);
  assert.ok(AUTH.budget.price.perCallUpperEstimate <= 0.09); assert.match(AUTH.budget.price.note, /estimate, not a guaranteed maximum/);
  assert.deepEqual([AUTH.adapterImplementations.adapter, AUTH.adapterImplementations.ownerApprovalFlag, AUTH.adapterImplementations.status, AUTH.adapterImplementations.mergeIsNotAnInstruction], [ADAPTER_REL, "--owner-approval=D-379-NH-5C", "IMPLEMENTED — NOT EXECUTED", true]);
});

test("the NH-5C adapter: no exports, only node built-ins and the ledger, exactly one fetch, the key once, three images in order, every check before any claim", () => {
  assert.ok(!/^\s*export\b/m.test(CODE));
  for (const m of CODE.matchAll(/^\s*import\b[^;]*?from\s+"([^"]+)"/gm)) assert.ok(m[1].startsWith("node:") || m[1] === "./r3-face-neutral-attempt-ledger.mjs", m[1]);
  assert.equal([...CODE.matchAll(/\bfetch\s*\(/g)].length, 1); assert.equal(CODE.split(KEY_READ).length - 1, 1); assert.equal([...CODE.matchAll(/fd\.append\(IMAGE_FIELD/g)].length, 1);
  const body = CODE.slice(CODE.indexOf("async function main(argv)")); let last = -1;
  for (const k of ["parseArgs(argv)", "resolveRefs()", "readOriginBlobs(", "verifyPrompts(blobs)", "verifyDecisions(", "verifyAuthorisation(", "verifyImplementation(", "readImages(", "resolveClaimLocation(call)", "verifyOrderAndStops(", "resolveOutputs(call)", "buildBody(", "if (!args.sendMode)", KEY_READ, "createClaim(", "globalThis.fetch("]) {
    const at = body.indexOf(k); assert.ok(at > last, k + " comes after the previous check"); last = at; }
  assert.match(CODE, /const MAX_CALLS = 1;/); assert.match(CODE, /const OUT_DIR_NAME = "hair-nh5-round";/); assert.match(CODE, /const CALL_ID = "NH-5C-hair-nape-locks";/);
  assert.ok(!/NH-5B-hair-topknot|D-375-NH-5B|plan-nh5b|NH-4-hair-soft-texture|D371_|nh1bCalls|d371Calls/.test(CODE), "no earlier call machinery left");
  for (const r of AUTH.stopRules) assert.ok(SRC.includes(JSON.stringify(r)), "the adapter carries the stop rule: " + r);
  for (const f of METHOD_FILES) assert.ok(SRC.includes(JSON.stringify(f)), "the adapter locks " + f);
  assert.ok(SRC.includes(`const PLAN_SHA256 = "${AUTH.frozen.plan.sha256}";`)); assert.ok(SRC.includes(`const PROMPT_SHA256 = "${PLAN.prompt.sha256}";`));
  for (const i of PLAN.request.images) assert.ok(SRC.includes(`name: "${i.name}", bytes: ${i.bytes}, sha256: "${i.sha256}"`), i.name);
});

// ── sandbox: a throw-away git repository, a mocked fetch, the three images copied in ───────────────────────────────────
const ROOTS = []; after(() => { for (const r of ROOTS) if (isInside(r, realpathSync.native(tmpdir())) && /nh5c-sandbox-/.test(r)) rmSync(r, { recursive: true, force: true }); });
const MOCK_SRC = [
  "import { appendFileSync, readFileSync } from \"node:fs\"; import { createHash } from \"node:crypto\";",
  "const LOG = process.env.NH5_MOCK_LOG, PNG = process.env.NH5_MOCK_PNG, MODE = process.env.NH5_MOCK_MODE;",
  "if (!LOG || !PNG || !MODE) throw new Error(\"nh5 mock: not configured — refusing to run\");",
  "const h = async (f) => createHash(\"sha256\").update(Buffer.from(await f.arrayBuffer())).digest(\"hex\");",
  "globalThis.fetch = async function nh5MockFetch(url, init) {",
  "  const b = init.body; appendFileSync(LOG, JSON.stringify({ url: String(url), redirect: init.redirect, fields: [...b.keys()], imageSha: await Promise.all(b.getAll(\"image[]\").map(h)), imageNames: b.getAll(\"image[]\").map((f) => f.name), prompt: b.get(\"prompt\"), size: b.get(\"size\"), n: b.get(\"n\"), mask: b.has(\"mask\") }) + \"\\n\");",
  "  if (MODE === \"throw\") throw new TypeError(\"fetch failed (mock transport error)\");",
  "  return new Response(JSON.stringify({ created: 1, data: [{ b64_json: readFileSync(PNG).toString(\"base64\") }] }), { status: 200, headers: { \"content-type\": \"application/json\", \"x-request-id\": \"req_mockok\" } });",
  "};"].join("\n");
const TRACKED = [ADAPTER_REL, LEDGER_REL, LEGACY_REL, DECISION_REL, BASE_REL, AUTH_REL, PLAN_REL, ...METHOD_FILES];
const png = (w2, h2) => { const px = new Uint8ClampedArray(w2 * h2 * 4); for (let i = 0; i < w2 * h2; i++) px.set([150, 150, 150, 255], i * 4); return encodePng(w2, h2, px); };
function envFor(sb, extra) { const env = {}; for (const k of ["PATH", "Path", "SystemRoot", "windir", "COMSPEC", "PATHEXT", "SystemDrive"]) if (typeof process.env[k] === "string") env[k] = process.env[k];
  return Object.assign(env, { LOCALAPPDATA: sb.state, XDG_STATE_HOME: sb.state, HOME: sb.home, USERPROFILE: sb.home, TEMP: sb.tmp, TMP: sb.tmp, TMPDIR: sb.tmp, HTTP_PROXY: "http://127.0.0.1:9", HTTPS_PROXY: "http://127.0.0.1:9",
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: sb.gitconfig, NH5_MOCK_LOG: sb.log, NH5_MOCK_PNG: sb.png, NH5_MOCK_MODE: "ok" }, extra || {}); }
function sgit(sb, args) { const r = spawnSync("git", ["-C", sb.repo, "-c", "user.name=nh5c-sandbox", "-c", "user.email=sandbox@example.invalid", "-c", "core.autocrlf=false", ...args], { env: envFor(sb), encoding: "utf8", windowsHide: true }); if (r.status !== 0) throw new Error("sandbox git " + args.join(" ") + ": " + r.stderr); return r.stdout.trim(); }
function sandbox({ base: mod } = {}) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "nh5c-sandbox-"))); ROOTS.push(root);
  const sb = { root, repo: join(root, "repo"), state: join(root, "state"), tmp: join(root, "tmp"), home: join(root, "home"), log: join(root, "fetch.log"), gitconfig: join(root, "gitconfig"), png: join(root, "out.png"), mock: join(root, "mock.mjs") };
  sb.out = join(sb.home, "Documents", "DenSejeApp-artefacts", "hair-nh5-round"); for (const d of [sb.repo, sb.state, sb.tmp, sb.home]) mkdirSync(d, { recursive: true });
  writeFileSync(sb.gitconfig, "[core]\n\tautocrlf = false\n[init]\n\tdefaultBranch = main\n"); writeFileSync(sb.mock, MOCK_SRC); writeFileSync(sb.log, ""); writeFileSync(sb.png, png(1024, 1024));
  const rd = join(sb.out, "references"); mkdirSync(rd, { recursive: true }); for (const i of PLAN.request.images) copyFileSync(join(REFS, i.name), join(rd, i.name));
  for (const rel of TRACKED) { const dst = join(sb.repo, ...rel.split("/")); mkdirSync(dirname(dst), { recursive: true }); copyFileSync(repoFile(rel), dst); }
  // the adapter's behaviour is tested on the authorisation as merged, before NH-5C was spent (2026-11-16)
  { const p = join(sb.repo, ...AUTH_REL.split("/")), a = JSON.parse(readFileSync(p, "utf8")), e = a.call; a.budget.actuallySent = 0;
    e.mandateState = "UNSPENT"; e.outcome = "NOT YET ATTEMPTED"; for (const k of ["neverReuse", "closedBy", "result"]) delete e[k]; writeFileSync(p, JSON.stringify(a, null, 2) + "\n"); }
  if (mod) mod(sb);
  sgit(sb, ["init", "-q", "-b", "main"]); sgit(sb, ["add", "-A"]); sgit(sb, ["commit", "-q", "-m", "base"]); sgit(sb, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  return sb; }
const run = (sb, args, extra) => { const r = spawnSync(process.execPath, ["--import", pathToFileURL(sb.mock).href, join(sb.repo, ...ADAPTER_REL.split("/")), ...args], { cwd: sb.repo, env: envFor(sb, extra), encoding: "utf8", windowsHide: true, timeout: 180000 }); return { status: r.status, out: (r.stdout || "") + (r.stderr || "") }; };
const fetchLog = (sb) => readFileSync(sb.log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
function refused(sb, r, stage, sends = 0) { assert.equal(r.status, 1, r.out); assert.match(r.out, new RegExp("REFUSED \\[" + stage + "\\]"), r.out); assert.equal(fetchLog(sb).length, sends); }

test("NH-5C dry run passes; the one send carries the three images in order and the frozen prompt, no mask, and is never repeated", { skip: SKIP_SEND }, () => {
  const sb = sandbox(); const d = run(sb, ARGS); assert.equal(d.status, 0, d.out); assert.match(d.out, /DRY RUN PASSED/); assert.equal(fetchLog(sb).length, 0);
  for (const other of ["NH-5B-hair-topknot", "NH-5A-hair-quiff", "NH-4-hair-soft-texture"]) { const r = run(sb, ["--call-id=" + other, "--claim-identity=" + other + "-claim"]); assert.equal(r.status, 1); assert.match(r.out, /REFUSED \[arguments\]/); }
  refused(sb, run(sb, [...ARGS, "--send", "--owner-approval=D-375-NH-5B"], KEY), "arguments");
  refused(sb, run(sb, [...ARGS, "--send"], KEY), "arguments");
  const r = run(sb, [...ARGS, ...SEND], KEY); assert.equal(r.status, 0, r.out); const Lg = fetchLog(sb); assert.equal(Lg.length, 1);
  assert.deepEqual([Lg[0].fields, Lg[0].imageSha, Lg[0].imageNames, Lg[0].size, Lg[0].n, Lg[0].redirect, Lg[0].mask], [AUTH.request.fieldOrder, PLAN.request.images.map((i) => i.sha256), PLAN.request.images.map((i) => i.name), "1024x1024", "1", "error", false]);
  assert.equal(Lg[0].prompt, PLAN.prompt.text);
  assert.ok(existsSync(join(sb.out, ID, "nh.image-1.png")) && existsSync(join(sb.out, ID, "nh.receipt.json"))); assert.equal(sgit(sb, ["status", "--porcelain"]), "");
  assert.match(JSON.parse(readFileSync(join(sb.out, ID, "nh.receipt.json"), "utf8")).next, /northstar-hair-nh5c\.mjs --post --result/);
  refused(sb, run(sb, [...ARGS, ...SEND], KEY), "claim-exists", 1);
});

test("NH-5C is refused before any claim when the stop file exists, an image or a method file changed, the token is missing, or the call is already spent; an uncertain send is never repeated", { skip: SKIP_SEND }, () => {
  const stop = sandbox({ base: (s) => writeFileSync(join(s.out, "NH-STOP.json"), "{}\n") }); refused(stop, run(stop, [...ARGS, ...SEND], KEY), "stopped");
  const img = sandbox({ base: (s) => writeFileSync(join(s.out, "references", PLAN.request.images[1].name), png(1024, 1024)) }); refused(img, run(img, [...ARGS, ...SEND], KEY), "images");
  const changed = sandbox({ base: (s) => { const p = join(s.repo, ..."tools/avatar/northstar-hair-nh5c.mjs".split("/")); writeFileSync(p, readFileSync(p, "utf8").replace("maxRun: 6 },", "maxRun: 60 },")); } });
  refused(changed, run(changed, [...ARGS, ...SEND], KEY), "pins");
  const noToken = sandbox({ base: (s) => { const p = join(s.repo, ...DECISION_REL.split("/")); writeFileSync(p, readFileSync(p, "utf8").replace(TOKEN, "D-379 NH-5C: PREPARED")); } }); refused(noToken, run(noToken, [...ARGS, ...SEND], KEY), "decision");
  const spent = sandbox({ base: (s) => { const p = join(s.repo, ...AUTH_REL.split("/")), a = JSON.parse(readFileSync(p, "utf8")); a.call.mandateState = "SPENT"; writeFileSync(p, JSON.stringify(a, null, 2) + "\n"); } });
  refused(spent, run(spent, [...ARGS, ...SEND], KEY), "authorisation");
  const u = sandbox(); assert.equal(run(u, [...ARGS, ...SEND], { ...KEY, NH5_MOCK_MODE: "throw" }).status, 3); refused(u, run(u, [...ARGS, ...SEND], KEY), "claim-exists", 1);
});
