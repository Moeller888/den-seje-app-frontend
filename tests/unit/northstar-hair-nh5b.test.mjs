// D-375 NH-5B — the top knot on D-373's shared head base: the designs, the call's three inputs and the post-processing
// (tools/avatar/northstar-hair-nh5.mjs), the frozen plan (plan-nh5b-v1.json) and one one-shot call (authorisation-nh5b-v1.json,
// tools/avatar/openai-send-northstar-hair-nh5b.mjs). The static tests run everywhere. The input images, the rehearsal and the mocked sends
// need the private files kept outside the clones: they run only where those exist — skipped in CI, never faked. A dummy key and a mocked
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

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = resolve(HERE, "..", "..");
const sha256 = (b) => createHash("sha256").update(b).digest("hex"), repoFile = (rel) => join(REPO, ...rel.split("/")), FX = "tools/avatar/fixtures/northstar-hair-d375/";
const ADAPTER_REL = "tools/avatar/openai-send-northstar-hair-nh5b.mjs", LEDGER_REL = "tools/avatar/r3-face-neutral-attempt-ledger.mjs", LEGACY_REL = "docs/project-state.md";
const DECISION_REL = "docs/decisions/D-375.md", BASE_REL = "docs/decisions/D-373.md", AUTH_REL = FX + "authorisation-nh5b-v1.json", PLAN_REL = FX + "plan-nh5b-v1.json";
const SRC = readFileSync(repoFile(ADAPTER_REL), "utf8"), CODE = SRC.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
const json = (rel) => JSON.parse(readFileSync(repoFile(rel), "utf8"));
const AUTH = json(AUTH_REL), PLAN = json(PLAN_REL), DECISION = readFileSync(repoFile(DECISION_REL), "utf8");
const MODEL = "gpt-image-2.5-sunburst-2026-09-08", ID = "NH-5B-hair-topknot", METHOD_FILES = Object.keys(PLAN.method.files);
const ARGS = ["--call-id=" + ID, "--claim-identity=" + ID + "-claim"], SEND = ["--send", "--owner-approval=D-375-NH-5B"], KEY = { ["OPENAI_API" + "_KEY"]: "sk-nh5b-sandbox-dummy-key-not-a-credential" };
const KEY_READ = "process.env." + "OPENAI_API" + "_KEY";   // spelt in parts so this file never reads it (the D-142 guard)
const TOKEN = "D-375 NH-5B: 1 CALL BOUND (TOP KNOT, D-373 BASE)";
const REFS = join(homedir(), "Documents", "DenSejeApp-artefacts", "hair-nh5-round", "references");
const have = (list) => list.every((i) => existsSync(join(REFS, i.name)) && sha256(readFileSync(join(REFS, i.name))) === i.sha256);
const SKIP_SEND = have(PLAN.request.images) ? false : "the three input images are kept outside the clones; write them with northstar-hair-nh5.mjs --inputs to run the mocked sends";
const SKIP_POST = have(PLAN.post.inputs) && have(PLAN.request.images) ? false : "D-373's base, the ear mask and NH-4's layer are kept outside the clones";
const isInside = (c, p) => { const r = relative(p, c); return r === "" || (!r.startsWith("..") && !isAbsolute(r)); };
const plain = (o) => JSON.parse(JSON.stringify(o));
const priv = (name) => decodePng(readFileSync(join(REFS, name))).px;

test("NH-5B local pieces: the largest connected piece is found with its size and box (P11, P12)", () => {
  const w = 12, h = 6, m = new Uint8Array(w * h); for (const [x, y] of [[1, 1], [2, 1], [3, 1], [3, 2], [8, 4], [9, 4], [9, 5]]) m[y * w + x] = 1; m[2 * w + 10] = 1;
  const p = NH5.pieces(m, w, h, true); assert.deepEqual(p.map((q) => q.px), [4, 3, 1]); assert.deepEqual(p[0].box, [1, 1, 3, 2]);
  const d = new Uint8Array(w * h); d[0] = 1; d[w + 1] = 1; assert.deepEqual(NH5.pieces(d, w, h, false).map((q) => q.px), [1, 1], "4-connected: a diagonal is two pieces"); assert.deepEqual(NH5.pieces(d, w, h, true).map((q) => q.px), [2]);
});

test("NH-5B inputs: the base, Image 1 and Image 2 are the tool's output from the private base and ear mask; Image 3 is pinned", { skip: SKIP_POST }, () => {
  const img = NH5.inputImages(priv(NH5.NAMES.base), priv("clean-head-ear-on-top-mask.png"));
  assert.equal(sha256(encodePng(1024, 1024, img.head)), PLAN.request.images[0].sha256); assert.equal(sha256(encodePng(1024, 1024, img.guide)), PLAN.request.images[1].sha256);
  assert.equal(sha256(readFileSync(join(REFS, NH5.NAMES.style))), PLAN.request.images[2].sha256);
});

test("NH-5B rehearsal: nine simulated results — the exact ones pass; cuts at the hairline and a temple, loose tufts and scalp holes are found where they are", { skip: SKIP_POST }, () => {
  const r = NH5.rehearsal({ base: priv(NH5.NAMES.base), ear: priv("clean-head-ear-on-top-mask.png"), nh4: NH5.alphaMask(priv("nh4-temple-tip-grey-hair-layer.png")) });
  assert.equal(r.rows.length, 9); for (const row of r.rows) assert.ok(row.asExpected, JSON.stringify(row));
  const by = Object.fromEntries(r.rows.map((x) => [x.case, x]));
  assert.ok(by.C.measured.P10by.forehead > 6 && by.E.measured.P10by["right temple"] > 6, "the cut is found at the hairline and at the temple");
  assert.ok(by.E.measured.P9 <= 0.03 && by.F.measured.P9 <= 0.03 && by.G.measured.P2 >= 0.98, "the aggregate counts alone would have passed E, F and G");
  assert.deepEqual(by.B.measured.P1, [1.02, 10, -6]);
});

test("NH-5B plan: design B, the frozen prompt, the three private images in order, no hair input, the post-processing and P1–P12, the locked method", () => {
  assert.deepEqual([PLAN.decision, PLAN.callId, PLAN.design, PLAN.authorisesImageRequest], ["D-375", ID, "B", false]);
  assert.deepEqual([PLAN.prompt.sha256, PLAN.prompt.bytes], [sha256(Buffer.from(PLAN.prompt.text, "utf8")), Buffer.byteLength(PLAN.prompt.text, "utf8")]); assert.ok(!/[{}]|undefined|null|NaN|\r/.test(PLAN.prompt.text));
  for (const re of [/Edit Image 1: add a new hairstyle on the head and change nothing else/, /no shift, no zoom, no tilt, no crop/, /a top knot/, /gathered into one round bun/, /not a straight cut and no fringe/, /neutral greyscale only/, /Nothing in the red areas/, /Image 3 contains no hair/, /16 pixels of empty transparent margin/]) assert.match(PLAN.prompt.text, re);
  assert.ok(!/current hair|its current|hair reference|northstar-hair-reference/i.test(PLAN.prompt.text), "the prompt names no earlier hair");
  assert.deepEqual([PLAN.request.model, PLAN.request.parameters, PLAN.request.neverSent], [MODEL, { size: "1024x1024", quality: "high", n: 1, output_format: "png", background: "transparent" }, ["mask", "input_fidelity", "any other image"]]);
  assert.deepEqual(PLAN.request.images.map((i) => [i.role, i.name, i.tracked]), [["Image 1", NH5.NAMES.head, false], ["Image 2", NH5.NAMES.guide, false], ["Image 3", NH5.NAMES.style, false]]);
  for (const i of PLAN.request.images) assert.ok(!/reference|nh4|kort|sidesweep|standard/i.test(i.name), "no hair layer, sketch or earlier candidate is an input: " + i.name);
  assert.deepEqual(PLAN.request.fieldOrder, ["model", "image[]", "image[]", "image[]", "prompt", "size", "quality", "n", "output_format", "background"]);
  for (const f of METHOD_FILES) assert.equal(sha256(readFileSync(repoFile(f))), PLAN.method.files[f], f + " changed after the lock: a changed method is a new plan version");
  for (const f of ["tools/avatar/northstar-hair-nh5.mjs", "tools/avatar/northstar-hair-nh4-post.mjs", "tools/avatar/northstar-hair-nh4-exception-d372.mjs", "tools/avatar/northstar-hair-template-d371.mjs", NH5.D373_FIXTURE, "tools/avatar/fixtures/northstar-hair-d371/template-v1.json"]) assert.ok(METHOD_FILES.includes(f), f);
  assert.deepEqual(plain(PLAN.post.gates), plain(NH5.GATES)); assert.equal(PLAN.post.tool, "tools/avatar/northstar-hair-nh5.mjs");
  assert.deepEqual(Object.keys(NH5.GATES), ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9", "P10", "P11", "P12"]);
  assert.deepEqual([NH5.GATES.P2.min, NH5.GATES.P3.minGap, NH5.GATES.P8.max, NH5.GATES.P8.minDesign, NH5.GATES.P9.max, NH5.GATES.P10.maxRun, NH5.GATES.P11.max, NH5.GATES.P12.max], [0.98, 6, 0.75, 0.6, 0.03, 6, 60, 40]);
  assert.deepEqual(PLAN.post.inputs.map((i) => [i.role, i.tracked]), [["D-373 base", false], ["ear mask", false], ["NH-4 layer", false]]);
  const d373 = json(NH5.D373_FIXTURE); assert.equal(PLAN.post.inputs[1].sha256, d373.inputs.find((i) => i.role === "ear").sha256); assert.equal(PLAN.post.inputs[2].sha256, d373.temple.layers.grey.pngSha256);
  assert.equal(Object.keys(PLAN.rehearsal.cases).length, 9); assert.ok(PLAN.visualStop.some((v) => /nothing is retouched to pass/.test(v)));
});

test("NH-5B authorisation: one unspent call, its own budget, the frozen plan; the decision carries the token and every pin", () => {
  assert.deepEqual([AUTH.decision, AUTH.callId, AUTH.meta.authorisesImageRequest, AUTH.budget.authorised, AUTH.budget.reserve, AUTH.budget.retries, AUTH.budget.fallback, AUTH.budget.reusesEarlierPermissions, AUTH.budget.actuallySent], ["D-375", ID, false, 1, 0, 0, false, false, 0]);
  assert.deepEqual([AUTH.call.callId, AUTH.call.style, AUTH.call.mandateState, AUTH.call.outcome, AUTH.call.prompt.sha256], [ID, "topknot", "UNSPENT", "NOT YET ATTEMPTED", PLAN.prompt.sha256]);
  for (const k of ["neverReuse", "closedBy", "result"]) assert.ok(!(k in AUTH.call), k);
  assert.deepEqual(AUTH.call.claim, { identity: ID + "-claim", filename: ID + ".claim.json", eventsFilename: ID + ".events.jsonl" });
  assert.equal(AUTH.frozen.plan.sha256, sha256(readFileSync(repoFile(PLAN_REL)))); assert.deepEqual(AUTH.frozen.methodFiles, PLAN.method.files);
  assert.deepEqual(AUTH.request.images, PLAN.request.images.map((i) => ({ role: i.role, name: i.name, bytes: i.bytes, sha256: i.sha256, tracked: false })));
  const status = /^status: (.*)$/m.exec(DECISION)[1].split(" — ").map((x) => x.trim()); assert.ok(status.includes(TOKEN), TOKEN); assert.ok(status.some((s) => /NOT SENT/.test(s)));
  for (const n of [ID, "--owner-approval=D-375-NH-5B", MODEL, ADAPTER_REL, AUTH.frozen.plan.sha256, "1024x1024", PLAN.prompt.sha256, ...PLAN.request.images.map((i) => i.sha256)]) assert.ok(DECISION.includes(n), n);
  assert.ok(AUTH.budget.price.perCallUpperEstimate <= 0.09); assert.match(AUTH.budget.price.note, /estimate, not a guaranteed maximum/);
  assert.deepEqual([AUTH.adapterImplementations.adapter, AUTH.adapterImplementations.ownerApprovalFlag, AUTH.adapterImplementations.status, AUTH.adapterImplementations.mergeIsNotAnInstruction], [ADAPTER_REL, "--owner-approval=D-375-NH-5B", "IMPLEMENTED — NOT EXECUTED", true]);
});

test("the NH-5B adapter: no exports, only node built-ins and the ledger, exactly one fetch, the key once, three images in order, every check before any claim", () => {
  assert.ok(!/^\s*export\b/m.test(CODE));
  for (const m of CODE.matchAll(/^\s*import\b[^;]*?from\s+"([^"]+)"/gm)) assert.ok(m[1].startsWith("node:") || m[1] === "./r3-face-neutral-attempt-ledger.mjs", m[1]);
  assert.equal([...CODE.matchAll(/\bfetch\s*\(/g)].length, 1); assert.equal(CODE.split(KEY_READ).length - 1, 1); assert.equal([...CODE.matchAll(/fd\.append\(IMAGE_FIELD/g)].length, 1);
  const body = CODE.slice(CODE.indexOf("async function main(argv)")); let last = -1;
  for (const k of ["parseArgs(argv)", "resolveRefs()", "readOriginBlobs(", "verifyPrompts(blobs)", "verifyDecisions(", "verifyAuthorisation(", "verifyImplementation(", "readImages(", "resolveClaimLocation(call)", "verifyOrderAndStops(", "resolveOutputs(call)", "buildBody(", "if (!args.sendMode)", KEY_READ, "createClaim(", "globalThis.fetch("]) {
    const at = body.indexOf(k); assert.ok(at > last, k + " comes after the previous check"); last = at; }
  assert.match(CODE, /const MAX_CALLS = 1;/); assert.match(CODE, /const OUT_DIR_NAME = "hair-nh5-round";/); assert.match(CODE, /const CALL_ID = "NH-5B-hair-topknot";/);
  assert.ok(!/NH-4-hair-soft-texture|NH-2-hair-curls|D371_|nh1bCalls|d371Calls/.test(CODE), "no D-371 call machinery left");
  for (const r of AUTH.stopRules) assert.ok(SRC.includes(JSON.stringify(r)), "the adapter carries the stop rule: " + r);
  for (const f of METHOD_FILES) assert.ok(SRC.includes(JSON.stringify(f)), "the adapter locks " + f);
  assert.ok(SRC.includes(`const PLAN_SHA256 = "${AUTH.frozen.plan.sha256}";`)); assert.ok(SRC.includes(`const PROMPT_SHA256 = "${PLAN.prompt.sha256}";`));
  for (const i of PLAN.request.images) assert.ok(SRC.includes(`name: "${i.name}", bytes: ${i.bytes}, sha256: "${i.sha256}"`), i.name);
});

// ── sandbox: a throw-away git repository, a mocked fetch, the three images copied in ───────────────────────────────────
const ROOTS = []; after(() => { for (const r of ROOTS) if (isInside(r, realpathSync.native(tmpdir())) && /nh5b-sandbox-/.test(r)) rmSync(r, { recursive: true, force: true }); });
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
function sgit(sb, args) { const r = spawnSync("git", ["-C", sb.repo, "-c", "user.name=nh5b-sandbox", "-c", "user.email=sandbox@example.invalid", "-c", "core.autocrlf=false", ...args], { env: envFor(sb), encoding: "utf8", windowsHide: true }); if (r.status !== 0) throw new Error("sandbox git " + args.join(" ") + ": " + r.stderr); return r.stdout.trim(); }
function sandbox({ base: mod } = {}) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "nh5b-sandbox-"))); ROOTS.push(root);
  const sb = { root, repo: join(root, "repo"), state: join(root, "state"), tmp: join(root, "tmp"), home: join(root, "home"), log: join(root, "fetch.log"), gitconfig: join(root, "gitconfig"), png: join(root, "out.png"), mock: join(root, "mock.mjs") };
  sb.out = join(sb.home, "Documents", "DenSejeApp-artefacts", "hair-nh5-round"); for (const d of [sb.repo, sb.state, sb.tmp, sb.home]) mkdirSync(d, { recursive: true });
  writeFileSync(sb.gitconfig, "[core]\n\tautocrlf = false\n[init]\n\tdefaultBranch = main\n"); writeFileSync(sb.mock, MOCK_SRC); writeFileSync(sb.log, ""); writeFileSync(sb.png, png(1024, 1024));
  const rd = join(sb.out, "references"); mkdirSync(rd, { recursive: true }); for (const i of PLAN.request.images) copyFileSync(join(REFS, i.name), join(rd, i.name));
  for (const rel of TRACKED) { const dst = join(sb.repo, ...rel.split("/")); mkdirSync(dirname(dst), { recursive: true }); copyFileSync(repoFile(rel), dst); }
  if (mod) mod(sb);
  sgit(sb, ["init", "-q", "-b", "main"]); sgit(sb, ["add", "-A"]); sgit(sb, ["commit", "-q", "-m", "base"]); sgit(sb, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  return sb; }
const run = (sb, args, extra) => { const r = spawnSync(process.execPath, ["--import", pathToFileURL(sb.mock).href, join(sb.repo, ...ADAPTER_REL.split("/")), ...args], { cwd: sb.repo, env: envFor(sb, extra), encoding: "utf8", windowsHide: true, timeout: 180000 }); return { status: r.status, out: (r.stdout || "") + (r.stderr || "") }; };
const fetchLog = (sb) => readFileSync(sb.log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
function refused(sb, r, stage, sends = 0) { assert.equal(r.status, 1, r.out); assert.match(r.out, new RegExp("REFUSED \\[" + stage + "\\]"), r.out); assert.equal(fetchLog(sb).length, sends); }

test("NH-5B dry run passes; the one send carries the three images in order and the frozen prompt, no mask, and is never repeated", { skip: SKIP_SEND }, () => {
  const sb = sandbox(); const d = run(sb, ARGS); assert.equal(d.status, 0, d.out); assert.match(d.out, /DRY RUN PASSED/); assert.equal(fetchLog(sb).length, 0);
  for (const other of ["NH-4-hair-soft-texture", "NH-5A-hair-quiff", "NH-5C-hair-nape"]) { const r = run(sb, ["--call-id=" + other, "--claim-identity=" + other + "-claim"]); assert.equal(r.status, 1); assert.match(r.out, /REFUSED \[arguments\]/); }
  refused(sb, run(sb, [...ARGS, "--send", "--owner-approval=D-371-NH-4"], KEY), "arguments");
  refused(sb, run(sb, [...ARGS, "--send"], KEY), "arguments");
  const r = run(sb, [...ARGS, ...SEND], KEY); assert.equal(r.status, 0, r.out); const Lg = fetchLog(sb); assert.equal(Lg.length, 1);
  assert.deepEqual([Lg[0].fields, Lg[0].imageSha, Lg[0].imageNames, Lg[0].size, Lg[0].n, Lg[0].redirect, Lg[0].mask], [AUTH.request.fieldOrder, PLAN.request.images.map((i) => i.sha256), PLAN.request.images.map((i) => i.name), "1024x1024", "1", "error", false]);
  assert.equal(Lg[0].prompt, PLAN.prompt.text);
  assert.ok(existsSync(join(sb.out, ID, "nh.image-1.png")) && existsSync(join(sb.out, ID, "nh.receipt.json"))); assert.equal(sgit(sb, ["status", "--porcelain"]), "");
  assert.match(JSON.parse(readFileSync(join(sb.out, ID, "nh.receipt.json"), "utf8")).next, /northstar-hair-nh5\.mjs --post --result/);
  refused(sb, run(sb, [...ARGS, ...SEND], KEY), "claim-exists", 1);
});

test("NH-5B is refused before any claim when the stop file exists, an image or a method file changed, the token is missing, or the call is already spent; an uncertain send is never repeated", { skip: SKIP_SEND }, () => {
  const stop = sandbox({ base: (s) => writeFileSync(join(s.out, "NH-STOP.json"), "{}\n") }); refused(stop, run(stop, [...ARGS, ...SEND], KEY), "stopped");
  const img = sandbox({ base: (s) => writeFileSync(join(s.out, "references", PLAN.request.images[1].name), png(1024, 1024)) }); refused(img, run(img, [...ARGS, ...SEND], KEY), "images");
  const changed = sandbox({ base: (s) => { const p = join(s.repo, ..."tools/avatar/northstar-hair-nh5.mjs".split("/")); writeFileSync(p, readFileSync(p, "utf8").replace("maxRun: 6 },", "maxRun: 60 },")); } });
  refused(changed, run(changed, [...ARGS, ...SEND], KEY), "pins");
  const noToken = sandbox({ base: (s) => { const p = join(s.repo, ...DECISION_REL.split("/")); writeFileSync(p, readFileSync(p, "utf8").replace(TOKEN, "D-375 NH-5B: PREPARED")); } }); refused(noToken, run(noToken, [...ARGS, ...SEND], KEY), "decision");
  const spent = sandbox({ base: (s) => { const p = join(s.repo, ...AUTH_REL.split("/")), a = JSON.parse(readFileSync(p, "utf8")); a.call.mandateState = "SPENT"; writeFileSync(p, JSON.stringify(a, null, 2) + "\n"); } });
  refused(spent, run(spent, [...ARGS, ...SEND], KEY), "authorisation");
  const u = sandbox(); assert.equal(run(u, [...ARGS, ...SEND], { ...KEY, NH5_MOCK_MODE: "throw" }).status, 3); refused(u, run(u, [...ARGS, ...SEND], KEY), "claim-exists", 1);
});
