// D-371 NH-1B — one new Kort attempt by FIXED COMPOSITION (owner-approved method): the Kort silhouette (northstar-kort-silhouette-d371.mjs),
// the composition and its gates (northstar-hair-compose-d371.mjs, composition-nh1b-v1.json), the frozen plan (plan-nh1b-v1.json) and one
// one-shot call (authorisation-nh1b-v1.json, tools/avatar/openai-send-northstar-hair-nh1b.mjs). NH-2 and NH-3 stay paused. The static tests
// and the dry run of the gates run everywhere. The mocked sends need the two input images, kept outside the clones: they run only where they
// exist — skipped in CI, never faked. A dummy key and a mocked fetch only; the real key is never read (D-142). 0 image calls.
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
import * as C from "../../tools/avatar/northstar-hair-compose-d371.mjs";

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = resolve(HERE, "..", "..");
const sha256 = (b) => createHash("sha256").update(b).digest("hex"), repoFile = (rel) => join(REPO, ...rel.split("/")), FX = "tools/avatar/fixtures/northstar-hair-d371/";
const ADAPTER_REL = "tools/avatar/openai-send-northstar-hair-nh1b.mjs", LEDGER_REL = "tools/avatar/r3-face-neutral-attempt-ledger.mjs", LEGACY_REL = "docs/project-state.md";
const DECISION_REL = "docs/decisions/D-371.md", TRIAL_REL = "docs/decisions/D-368.md", AUTH_REL = FX + "authorisation-nh1b-v1.json", PLAN_REL = FX + "plan-nh1b-v1.json", D371_AUTH_REL = FX + "authorisation-v1.json";
const SRC = readFileSync(repoFile(ADAPTER_REL), "utf8"), CODE = SRC.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
const json = (rel) => JSON.parse(readFileSync(repoFile(rel), "utf8"));
const AUTH = json(AUTH_REL), PLAN = json(PLAN_REL), D371 = json(D371_AUTH_REL), DECISION = readFileSync(repoFile(DECISION_REL), "utf8");
const MODEL = "gpt-image-2.5-sunburst-2026-09-08", ID = "NH-1B-hair-short-silhouette", METHOD_FILES = Object.keys(PLAN.method.files);
const ARGS = ["--call-id=" + ID, "--claim-identity=" + ID + "-claim"], SEND = ["--send", "--owner-approval=D-371-NH-1B"], KEY = { ["OPENAI_API" + "_KEY"]: "sk-nh1b-sandbox-dummy-key-not-a-credential" };
const KEY_READ = "process.env." + "OPENAI_API" + "_KEY";   // spelt in parts so this file never reads it (the D-142 guard)
const TOKEN = "D-371 NH-1B: 1 CALL AUTHORISED (KORT, FIXED COMPOSITION)";
const REFS = join(homedir(), "Documents", "DenSejeApp-artefacts", "hair-d371-calls", "references");
const HAVE = PLAN.request.images.every((i) => existsSync(join(REFS, i.name)) && sha256(readFileSync(join(REFS, i.name))) === i.sha256);
const SKIP = HAVE ? false : "the two input images are kept outside the clones; write Image 2 with northstar-hair-compose-d371.mjs --inputs to run the mocked sends";
const isInside = (c, p) => { const r = relative(p, c); return r === "" || (!r.startsWith("..") && !isAbsolute(r)); };
const plain = (o) => JSON.parse(JSON.stringify(o));
const TPL = T.buildTemplate(), L = C.compositionLayers(TPL);

test("NH-1B composition: the fixture is the tools' output — silhouette, corrected ear mask, strip and Image 2's pixels", () => {
  assert.deepEqual(plain(C.fixtureSpec(TPL, L)), json(C.FIXTURE));
  const f = json(C.FIXTURE);
  assert.deepEqual([f.earOnTop.bowl.left.px, f.earOnTop.bowl.right.px, f.earOnTop.bowl.right.rows, f.earOnTop.slipPx, f.earOnTop.frontLinePx], [0, 151, [341, 353], 15, 39], "the right ear's front bowl (the hook's cause) and the left flap's 1-row slip");
  assert.equal(PLAN.request.images[1].pixelSha256, f.guide.pixels); assert.equal(pixelSha256(C.guideImage(TPL, L)), f.guide.pixels);
  // the silhouette alone passes D-371's gates and covers both flaps; the ear on top always covers the template's ear except the removed strips
  const sil = T.measureHair(TPL, NLover(L.sil.BEHIND, L.sil.FRONT)); assert.ok(sil.pass, JSON.stringify(sil.gates)); assert.deepEqual([sil.gates.M4.flapShare.left, sil.gates.M4.flapShare.right], [1, 1]);
});
function NLover(a, b) { const o = new Uint8ClampedArray(a); for (let i = 0; i < o.length / 4; i++) if (b[i * 4 + 3]) o.set(b.subarray(i * 4, i * 4 + 4), i * 4); return o; }

test("NH-1B gates, dry run: the unshifted Kort drawing passes M1–M11; moved 2 px right it is rejected by M11 (the box at the right sideburn); moved 8 px left, M10 rejects it too", () => {
  const ok = C.judge(TPL, L, T.cropOut(C.simulatedKort(L), 2));
  assert.deepEqual(ok.failed, [], JSON.stringify({ M10: ok.M10, M11: ok.M11 })); assert.equal(ok.M11.flatShare, 0);
  assert.deepEqual([ok.gates.M2.earInnerPx, ok.gates.M4.flapShare], [{ left: 0, right: 0 }, { left: 1, right: 1 }]);
  const right = C.judge(TPL, L, T.cropOut(C.simulatedKort(L, 2, 0), 2));
  assert.deepEqual(right.failed, ["M11"]); assert.ok(right.M11.flatShare > C.GATES.M11.maxFlatShare && right.M10.pass, "M10 passes on the raw drawing; the flat strip is what rejects it");
  const far = C.judge(TPL, L, T.cropOut(C.simulatedKort(L, -8, 0), 2));
  assert.ok(far.failed.includes("M10") && far.failed.includes("M11"), JSON.stringify(far.failed));
  // nothing at all is not a hairstyle; an opaque square fails M10 and the margin
  const empty = C.judge(TPL, L, new Uint8ClampedArray(1024 * 1024 * 4)); assert.ok(empty.failed.includes("M10"));
  const square = C.judge(TPL, L, new Uint8ClampedArray(1024 * 1024 * 4).fill(128)); assert.ok(square.failed.includes("M10") && square.failed.includes("M8"));
});

test("NH-1B plan: the frozen prompt, the two private images, the composition, the gates (M10 raw, M1–M9 and M11 composite) and the locked method", () => {
  assert.deepEqual([PLAN.decision, PLAN.callId, PLAN.authorisesImageRequest], ["D-371", ID, false]);
  assert.deepEqual([PLAN.prompt.sha256, PLAN.prompt.bytes], [sha256(Buffer.from(PLAN.prompt.text, "utf8")), Buffer.byteLength(PLAN.prompt.text, "utf8")]); assert.ok(!/[{}]|undefined|null|NaN/.test(PLAN.prompt.text));
  for (const re of [/fills the light-grey shape in Image 2 exactly/, /same position, same scale, no shift, no zoom, no tilt/, /neutral greyscale only/, /continue a few pixels BEHIND the ear/, /16 pixels of empty transparent margin/, /KORT/]) assert.match(PLAN.prompt.text, re);
  assert.deepEqual([PLAN.request.model, PLAN.request.parameters, PLAN.request.neverSent], [MODEL, { size: "1024x1024", quality: "high", n: 1, output_format: "png", background: "transparent" }, ["mask", "input_fidelity", "any other image"]]);
  assert.deepEqual(PLAN.request.images.map((i) => [i.role, i.name, i.tracked]), [["Image 1", "northstar-hair-reference-1024.png", false], ["Image 2", C.GUIDE_NAME, false]]);
  assert.equal(PLAN.request.images[0].sha256, json(FX + "plan-v1.json").request.images[0].sha256, "Image 1 is D-371's Northstar reference, unchanged");
  for (const f of METHOD_FILES) assert.equal(sha256(readFileSync(repoFile(f))), PLAN.method.files[f], f + " changed after the lock: a changed method is a new plan version");
  for (const f of ["tools/avatar/northstar-kort-silhouette-d371.mjs", "tools/avatar/northstar-hair-compose-d371.mjs", C.FIXTURE, T.FIXTURE]) assert.ok(METHOD_FILES.includes(f), f);
  assert.equal(PLAN.composition.sha256, PLAN.method.files[C.FIXTURE]);
  assert.deepEqual(plain(PLAN.gates.M10), plain(C.GATES.M10)); assert.deepEqual(plain(PLAN.gates.M11), plain(C.GATES.M11)); assert.match(PLAN.gates["M1–M9"], /VISIBLE hair of the composite/);
  assert.deepEqual([C.GATES.M10.tolerancePx, C.GATES.M10.maxOutsideShare, C.GATES.M10.maxCoreMissingShare, C.GATES.M10.minIoU, C.GATES.M11.maxFlatShare], [4, 0.01, 0.01, 0.9, 0.03]);
  assert.deepEqual(PLAN.paused, ["NH-2-hair-curls", "NH-3-hair-sidepart"]); assert.ok(PLAN.visualStop.some((v) => /hook.*double line.*seam.*flat patch/.test(v)));
});

test("NH-1B authorisation: one call, its own budget, spent and rejected; D-371's NH-1 spent, NH-2 and NH-3 paused; the decision carries the token and every pin", () => {
  assert.deepEqual([AUTH.decision, AUTH.callId, AUTH.meta.authorisesImageRequest, AUTH.budget.authorised, AUTH.budget.reserve, AUTH.budget.retries, AUTH.budget.fallback, AUTH.budget.reusesEarlierPermissions, AUTH.budget.actuallySent], ["D-371", ID, false, 1, 0, 0, false, false, 1]);
  // NH-1B was sent once (2026-11-11) and rejected; it is never an active permission again
  assert.deepEqual([AUTH.call.callId, AUTH.call.style, AUTH.call.mandateState, AUTH.call.outcome, AUTH.call.prompt.sha256], [ID, "short", "SPENT", "RECEIVED_FOR_PLACEMENT", PLAN.prompt.sha256]);
  const r = AUTH.call.result; assert.deepEqual([AUTH.call.neverReuse, r.assessment, r.gates.pass, r.gates.failed, r.image.tracked, r.neverPromoted], [true, "REJECTED", false, ["M10", "M8", "M11"], false, true]);
  assert.deepEqual(AUTH.call.claim, { identity: ID + "-claim", filename: ID + ".claim.json", eventsFilename: ID + ".events.jsonl" });
  assert.equal(AUTH.frozen.plan.sha256, sha256(readFileSync(repoFile(PLAN_REL)))); assert.deepEqual(AUTH.frozen.methodFiles, PLAN.method.files);
  assert.deepEqual(AUTH.request.images, PLAN.request.images.map((i) => ({ role: i.role, name: i.name, bytes: i.bytes, sha256: i.sha256, tracked: false })));
  assert.deepEqual(D371.calls.map((e) => [e.callId, e.mandateState]), [["NH-1-hair-short", "SPENT"], ["NH-2-hair-curls", "UNSPENT"], ["NH-3-hair-sidepart", "UNSPENT"]]); assert.equal(D371.afterShort.verdict, "PENDING");
  const status = /^status: (.*)$/m.exec(DECISION)[1].split(" — ").map((x) => x.trim());
  assert.ok(status.includes(TOKEN)); assert.ok(status.includes("D-371 HAIR: 3 CALLS AUTHORISED (1 PER STYLE)"), "D-371's own token is kept");
  for (const n of [ID, "--owner-approval=D-371-NH-1B", MODEL, ADAPTER_REL, AUTH.frozen.plan.sha256, "1024x1024", PLAN.prompt.sha256, ...PLAN.request.images.map((i) => i.sha256)]) assert.ok(DECISION.includes(n), n);
  assert.ok(AUTH.budget.price.perCallUpperEstimate <= 0.08); assert.match(AUTH.budget.price.note, /estimate, not a guaranteed maximum/);
  assert.deepEqual([AUTH.adapterImplementations.adapter, AUTH.adapterImplementations.ownerApprovalFlag, AUTH.adapterImplementations.status], [ADAPTER_REL, "--owner-approval=D-371-NH-1B", "IMPLEMENTED — NOT EXECUTED"]);
});

test("the NH-1B adapter: no exports, only node built-ins and the ledger, exactly one fetch, the key once, two images in order, every check before any claim", () => {
  assert.ok(!/^\s*export\b/m.test(CODE));
  for (const m of CODE.matchAll(/^\s*import\b[^;]*?from\s+"([^"]+)"/gm)) assert.ok(m[1].startsWith("node:") || m[1] === "./r3-face-neutral-attempt-ledger.mjs", m[1]);
  assert.equal([...CODE.matchAll(/\bfetch\s*\(/g)].length, 1); assert.equal(CODE.split(KEY_READ).length - 1, 1); assert.equal([...CODE.matchAll(/fd\.append\(IMAGE_FIELD/g)].length, 1);
  const body = CODE.slice(CODE.indexOf("async function main(argv)")); let last = -1;
  for (const k of ["parseArgs(argv)", "resolveRefs()", "readOriginBlobs(", "verifyPrompts(blobs)", "verifyDecisions(", "verifyAuthorisation(", "verifyImplementation(", "readImages(", "resolveClaimLocation(call)", "verifyOrderAndStops(", "resolveOutputs(call)", "buildBody(", "if (!args.sendMode)", KEY_READ, "createClaim(", "globalThis.fetch("]) {
    const at = body.indexOf(k); assert.ok(at > last, k + " comes after the previous check"); last = at; }
  assert.match(CODE, /const MAX_CALLS = 1;/); assert.match(CODE, /const OUT_DIR_NAME = "hair-d371-calls";/); assert.ok(!/NH-2-hair-curls"\s*:|CASES|FIRST_CALL|AFTER_SHORT_OK/.test(CODE), "no D-371 call machinery left");
  for (const r of AUTH.stopRules) assert.ok(SRC.includes(JSON.stringify(r)), "the adapter carries the stop rule: " + r);
  for (const f of METHOD_FILES) assert.ok(SRC.includes(JSON.stringify(f)), "the adapter locks " + f);
  assert.ok(SRC.includes(`const PLAN_SHA256 = "${AUTH.frozen.plan.sha256}";`)); assert.ok(SRC.includes(`const PROMPT_SHA256 = "${PLAN.prompt.sha256}";`));
  for (const i of PLAN.request.images) assert.ok(SRC.includes(`name: "${i.name}", bytes: ${i.bytes}, sha256: "${i.sha256}"`), i.name);
});

// ── sandbox: a throw-away git repository, a mocked fetch, the two images copied in ─────────────────────────────────────
const ROOTS = []; after(() => { for (const r of ROOTS) if (isInside(r, realpathSync.native(tmpdir())) && /nh1b-sandbox-/.test(r)) rmSync(r, { recursive: true, force: true }); });
const MOCK_SRC = [
  "import { appendFileSync, readFileSync } from \"node:fs\"; import { createHash } from \"node:crypto\";",
  "const LOG = process.env.NH1B_MOCK_LOG, PNG = process.env.NH1B_MOCK_PNG, MODE = process.env.NH1B_MOCK_MODE;",
  "if (!LOG || !PNG || !MODE) throw new Error(\"nh1b mock: not configured — refusing to run\");",
  "const h = async (f) => createHash(\"sha256\").update(Buffer.from(await f.arrayBuffer())).digest(\"hex\");",
  "globalThis.fetch = async function nh1bMockFetch(url, init) {",
  "  const b = init.body; appendFileSync(LOG, JSON.stringify({ url: String(url), redirect: init.redirect, fields: [...b.keys()], imageSha: await Promise.all(b.getAll(\"image[]\").map(h)), imageNames: b.getAll(\"image[]\").map((f) => f.name), prompt: b.get(\"prompt\"), size: b.get(\"size\"), n: b.get(\"n\"), mask: b.has(\"mask\") }) + \"\\n\");",
  "  if (MODE === \"throw\") throw new TypeError(\"fetch failed (mock transport error)\");",
  "  return new Response(JSON.stringify({ created: 1, data: [{ b64_json: readFileSync(PNG).toString(\"base64\") }] }), { status: 200, headers: { \"content-type\": \"application/json\", \"x-request-id\": \"req_mockok\" } });",
  "};"].join("\n");
const TRACKED = [ADAPTER_REL, LEDGER_REL, LEGACY_REL, DECISION_REL, TRIAL_REL, AUTH_REL, PLAN_REL, D371_AUTH_REL, ...METHOD_FILES];
const png = (w2, h2) => { const px = new Uint8ClampedArray(w2 * h2 * 4); for (let i = 0; i < w2 * h2; i++) px.set([150, 150, 150, 255], i * 4); return encodePng(w2, h2, px); };
function envFor(sb, extra) { const env = {}; for (const k of ["PATH", "Path", "SystemRoot", "windir", "COMSPEC", "PATHEXT", "SystemDrive"]) if (typeof process.env[k] === "string") env[k] = process.env[k];
  return Object.assign(env, { LOCALAPPDATA: sb.state, XDG_STATE_HOME: sb.state, HOME: sb.home, USERPROFILE: sb.home, TEMP: sb.tmp, TMP: sb.tmp, TMPDIR: sb.tmp, HTTP_PROXY: "http://127.0.0.1:9", HTTPS_PROXY: "http://127.0.0.1:9",
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: sb.gitconfig, NH1B_MOCK_LOG: sb.log, NH1B_MOCK_PNG: sb.png, NH1B_MOCK_MODE: "ok" }, extra || {}); }
function sgit(sb, args) { const r = spawnSync("git", ["-C", sb.repo, "-c", "user.name=nh1b-sandbox", "-c", "user.email=sandbox@example.invalid", "-c", "core.autocrlf=false", ...args], { env: envFor(sb), encoding: "utf8", windowsHide: true }); if (r.status !== 0) throw new Error("sandbox git " + args.join(" ") + ": " + r.stderr); return r.stdout.trim(); }
function sandbox({ base: mod } = {}) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "nh1b-sandbox-"))); ROOTS.push(root);
  const sb = { root, repo: join(root, "repo"), state: join(root, "state"), tmp: join(root, "tmp"), home: join(root, "home"), log: join(root, "fetch.log"), gitconfig: join(root, "gitconfig"), png: join(root, "out.png"), mock: join(root, "mock.mjs") };
  sb.out = join(sb.home, "Documents", "DenSejeApp-artefacts", "hair-d371-calls"); for (const d of [sb.repo, sb.state, sb.tmp, sb.home]) mkdirSync(d, { recursive: true });
  writeFileSync(sb.gitconfig, "[core]\n\tautocrlf = false\n[init]\n\tdefaultBranch = main\n"); writeFileSync(sb.mock, MOCK_SRC); writeFileSync(sb.log, ""); writeFileSync(sb.png, png(1024, 1024));
  const rd = join(sb.out, "references"); mkdirSync(rd, { recursive: true }); for (const i of PLAN.request.images) copyFileSync(join(REFS, i.name), join(rd, i.name));
  for (const rel of TRACKED) { const dst = join(sb.repo, ...rel.split("/")); mkdirSync(dirname(dst), { recursive: true }); copyFileSync(repoFile(rel), dst); }
  // the adapter's behaviour is tested on the authorisation as merged, before NH-1B was spent (2026-11-11)
  { const p = join(sb.repo, ...AUTH_REL.split("/")), a = JSON.parse(readFileSync(p, "utf8")), e = a.call; a.budget.actuallySent = 0;
    e.mandateState = "UNSPENT"; e.outcome = "NOT YET ATTEMPTED"; for (const k of ["neverReuse", "closedBy", "result"]) delete e[k]; writeFileSync(p, JSON.stringify(a, null, 2) + "\n"); }
  if (mod) mod(sb);
  sgit(sb, ["init", "-q", "-b", "main"]); sgit(sb, ["add", "-A"]); sgit(sb, ["commit", "-q", "-m", "base"]); sgit(sb, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  return sb; }
const run = (sb, args, extra) => { const r = spawnSync(process.execPath, ["--import", pathToFileURL(sb.mock).href, join(sb.repo, ...ADAPTER_REL.split("/")), ...args], { cwd: sb.repo, env: envFor(sb, extra), encoding: "utf8", windowsHide: true, timeout: 180000 }); return { status: r.status, out: (r.stdout || "") + (r.stderr || "") }; };
const fetchLog = (sb) => readFileSync(sb.log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
function refused(sb, r, stage, sends = 0) { assert.equal(r.status, 1, r.out); assert.match(r.out, new RegExp("REFUSED \\[" + stage + "\\]"), r.out); assert.equal(fetchLog(sb).length, sends); }
const editJson = (rel, f) => (s) => { const p = join(s.repo, ...rel.split("/")), a = JSON.parse(readFileSync(p, "utf8")); f(a); writeFileSync(p, JSON.stringify(a, null, 2) + "\n"); };

test("NH-1B dry run passes; the one send carries the two images in order and the frozen prompt, no mask, and is never repeated", { skip: SKIP }, () => {
  const sb = sandbox(); const d = run(sb, ARGS); assert.equal(d.status, 0, d.out); assert.match(d.out, /DRY RUN PASSED/); assert.equal(fetchLog(sb).length, 0);
  for (const other of ["NH-1-hair-short", "NH-2-hair-curls", "NH-3-hair-sidepart"]) { const r = run(sb, ["--call-id=" + other, "--claim-identity=" + other + "-claim"]); assert.equal(r.status, 1); assert.match(r.out, /REFUSED \[arguments\]/); }
  refused(sb, run(sb, [...ARGS, "--send", "--owner-approval=D-371"], KEY), "arguments");
  const r = run(sb, [...ARGS, ...SEND], KEY); assert.equal(r.status, 0, r.out); const Lg = fetchLog(sb); assert.equal(Lg.length, 1);
  assert.deepEqual([Lg[0].fields, Lg[0].imageSha, Lg[0].imageNames, Lg[0].size, Lg[0].n, Lg[0].redirect, Lg[0].mask], [AUTH.request.fieldOrder, PLAN.request.images.map((i) => i.sha256), PLAN.request.images.map((i) => i.name), "1024x1024", "1", "error", false]);
  assert.equal(Lg[0].prompt, PLAN.prompt.text);
  assert.ok(existsSync(join(sb.out, ID, "nh.image-1.png")) && existsSync(join(sb.out, ID, "nh.receipt.json"))); assert.equal(sgit(sb, ["status", "--porcelain"]), "");
  assert.match(JSON.parse(readFileSync(join(sb.out, ID, "nh.receipt.json"), "utf8")).next, /northstar-hair-compose-d371\.mjs --measure/);
  refused(sb, run(sb, [...ARGS, ...SEND], KEY), "claim-exists", 1);
});

test("NH-1B is refused before any claim when NH-1 is not spent, NH-2/NH-3 are released, the stop file exists, Image 2 or a method file changed, or the token is missing", { skip: SKIP }, () => {
  const notSpent = sandbox({ base: editJson(D371_AUTH_REL, (a) => { a.calls[0].mandateState = "UNSPENT"; }) }); refused(notSpent, run(notSpent, [...ARGS, ...SEND], KEY), "authorisation");
  const released = sandbox({ base: editJson(D371_AUTH_REL, (a) => { a.afterShort.verdict = "NO_COMMON_FAULT"; }) }); refused(released, run(released, [...ARGS, ...SEND], KEY), "authorisation");
  const stop = sandbox({ base: (s) => writeFileSync(join(s.out, "NH-STOP.json"), "{}\n") }); refused(stop, run(stop, [...ARGS, ...SEND], KEY), "stopped");
  const img = sandbox({ base: (s) => writeFileSync(join(s.out, "references", PLAN.request.images[1].name), png(1024, 1024)) }); refused(img, run(img, [...ARGS, ...SEND], KEY), "images");
  const changed = sandbox({ base: (s) => { const p = join(s.repo, ..."tools/avatar/northstar-hair-compose-d371.mjs".split("/")); writeFileSync(p, readFileSync(p, "utf8").replace("maxFlatShare: 0.03", "maxFlatShare: 0.3")); } });
  refused(changed, run(changed, [...ARGS, ...SEND], KEY), "pins");
  const noToken = sandbox({ base: (s) => { const p = join(s.repo, ...DECISION_REL.split("/")); writeFileSync(p, readFileSync(p, "utf8").replace(TOKEN, "D-371 NH-1B: PREPARED")); } }); refused(noToken, run(noToken, [...ARGS, ...SEND], KEY), "decision");
  const u = sandbox(); assert.equal(run(u, [...ARGS, ...SEND], { ...KEY, NH1B_MOCK_MODE: "throw" }).status, 3); refused(u, run(u, [...ARGS, ...SEND], KEY), "claim-exists", 1);
});
