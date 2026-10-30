// D-267 — generated material on the locked D-264 tee master: TWO one-shot calls of tm-material-plan-v1.json (a seamless gingham swatch,
// a standalone chest print), their send adapter (tools/avatar/openai-send-northstar-tee-material-d267.mjs) and the evaluation
// (tools/avatar/northstar-tee-material.mjs): the lock, the fixed post-processing, the material checks on positive and negative
// examples, the local twin. Neither call sends an image or C, so the mocked sends run everywhere. A dummy key and a mocked fetch only.
// The checks decide only what they measure: the drawn quality is a visual review, never an automatic pass.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, copyFileSync, realpathSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join, dirname, relative, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { encodePng } from "../../tools/avatar/r3-hair-tool-v2.mjs";
import * as WR from "../../tools/avatar/northstar-wardrobe.mjs";
import * as BC from "../../tools/avatar/northstar-base-figure-c.mjs";
import * as IP from "../../tools/avatar/northstar-item-pilot.mjs";
import * as R1 from "../../tools/avatar/northstar-r1-garment.mjs";
import * as S1 from "../../tools/avatar/northstar-r1-similarity.mjs";
import * as C1 from "../../tools/avatar/northstar-r1-construction.mjs";
import * as TM from "../../tools/avatar/northstar-tee-master.mjs";
import * as TMM from "../../tools/avatar/northstar-tee-material.mjs";
import { recolour } from "../../tools/avatar/northstar-wardrobe-poc.mjs";
import * as NL from "../../tools/avatar/r3-northstar-layers.mjs";

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = resolve(HERE, "..", "..");
const sha256 = (b) => createHash("sha256").update(b).digest("hex"), repoFile = (rel) => join(REPO, ...rel.split("/")), FX = "tools/avatar/fixtures/northstar-wardrobe/tee-master/";
const ADAPTER_REL = "tools/avatar/openai-send-northstar-tee-material-d267.mjs", LEDGER_REL = "tools/avatar/r3-face-neutral-attempt-ledger.mjs", LEGACY_REL = "docs/project-state.md";
const DECISION_REL = "docs/decisions/D-267.md", MASTER_DECISION_REL = "docs/decisions/D-264.md", AUTH_REL = FX + "tm-material-authorisation-v1.json", PLAN_REL = FX + "tm-material-plan-v1.json";
const MASTER_REL = "tools/avatar/northstar-tee-master.mjs", EVAL_REL = "tools/avatar/northstar-tee-material.mjs";
const SRC = readFileSync(repoFile(ADAPTER_REL), "utf8"), CODE = SRC.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
const json = (rel) => JSON.parse(readFileSync(repoFile(rel), "utf8"));
const AUTH = json(AUTH_REL), PLAN = json(PLAN_REL), DECISION = readFileSync(repoFile(DECISION_REL), "utf8");
const MODEL = "gpt-image-2.5-sunburst-2026-09-08", [ID1, ID2] = [TMM.CALL_IDS.swatch, TMM.CALL_IDS.print];
const argsOf = (id) => ["--call-id=" + id, "--claim-identity=" + id + "-claim"], SEND = ["--send", "--owner-approval=D-267"], KEY = { ["OPENAI_API" + "_KEY"]: "sk-d267-sandbox-dummy-key-not-a-credential" };
const KEY_READ = "process.env." + "OPENAI_API" + "_KEY";   // spelt in parts so this file never reads it (the D-142 guard)
const CHILD_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/API_?KEY/i.test(k)));
const isInside = (c, p) => { const r = relative(p, c); return r === "" || (!r.startsWith("..") && !isAbsolute(r)); };

test("D-267 authorisation: two one-shot calls (spent and received, D-268), a separate budget, no reserve, retry, fallback or earlier permission; the token in D-267's status; no image and no C sent", () => {
  assert.deepEqual([AUTH.decision, AUTH.meta.authorisesImageRequest, AUTH.budget.authorised, AUTH.budget.reserve, AUTH.budget.retries, AUTH.budget.fallback, AUTH.budget.reusesEarlierPermissions], ["D-267", false, 2, 0, 0, false, false]);
  assert.deepEqual(AUTH.calls.map((e) => [e.callId, e.order, e.delivery, e.background]), [[ID1, 1, "swatch", "opaque"], [ID2, 2, "print", "transparent"]]);
  // the recorded execution and closure (D-268): each call spent once and received; nothing open
  for (const e of AUTH.calls) { assert.deepEqual([e.mandateState, e.outcome, e.result.httpStatus, e.recordedBy], ["SPENT", "RECEIVED_FOR_CHECK", 200, "D-268"]);
    assert.match(e.result.imageSha256, /^[0-9a-f]{64}$/); assert.match(e.result.evaluation, /^requires visual review/); }
  assert.deepEqual([AUTH.budget.actuallySent, AUTH.budget.closed.by, AUTH.budget.closed.spent, AUTH.budget.closed.uncertain, AUTH.budget.closed.refusedBeforeSend, AUTH.budget.closed.closedUnused], [2, "D-268", 2, 0, 0, 0]);
  for (const old of ["r1c-authorisation-v1.json", "r1-authorisation-v1.json"]) { const o = json("tools/avatar/fixtures/northstar-wardrobe/r1/" + old); for (const e of o.calls) { assert.ok(!SRC.includes(e.callId), e.callId + " is not known here"); assert.notEqual(e.mandateState, "UNSPENT"); } }
  assert.equal(AUTH.frozen.plan.sha256, sha256(readFileSync(repoFile(PLAN_REL)))); assert.equal(PLAN.authorisesImageRequest, false);
  for (const c of PLAN.calls) { assert.equal(sha256(Buffer.from(c.prompt.text, "utf8")), c.prompt.sha256); assert.deepEqual(c.references, []); assert.equal(AUTH.calls.find((e) => e.callId === c.callId).prompt.sha256, c.prompt.sha256);
    assert.deepEqual([c.endpoint, c.parameters.size, c.parameters.quality, c.parameters.n], ["https://api.openai.com/v1/images/generations", "1024x1024", "high", 1]); assert.ok(SRC.includes(c.prompt.sha256)); }
  assert.deepEqual([AUTH.request.model, AUTH.request.images, AUTH.privacy.cSentToApi.startsWith("never")], [MODEL, [], true]);
  assert.match(PLAN.calls[0].prompt.text, /exactly 4 full repeats across and exactly 4 full repeats down/); assert.match(PLAN.calls[0].prompt.text, /No shading, folds/);
  assert.match(PLAN.calls[1].prompt.text, /fully transparent background/); assert.match(PLAN.calls[1].prompt.text, /no drop shadow/); assert.ok(!/T-shirt with|wearing|body of the avatar/.test(PLAN.calls[1].prompt.text));
  const status = /^status: (.*)$/m.exec(DECISION)[1]; assert.ok(status.split(" — ").map((x) => x.trim()).includes("D-267 TM-MATERIAL: 2 CALLS AUTHORISED"));
  for (const n of [ID1, ID2, "--owner-approval=D-267", MODEL, ADAPTER_REL, AUTH.frozen.plan.sha256, PLAN.calls[0].prompt.sha256, PLAN.calls[1].prompt.sha256, "1024x1024", "https://api.openai.com/v1/images/generations", PLAN.lock.masterFingerprint]) assert.ok(DECISION.includes(n), n);
  assert.ok(!readFileSync(repoFile(LEGACY_REL), "utf8").split("\n").some((l) => l.startsWith("| **D-267** |")));
  for (const t of [JSON.stringify(AUTH), JSON.stringify(PLAN), SRC]) assert.ok(!/fitting-base|H1\.png/.test(t), "no H1");
  assert.equal(AUTH.budget.price.verifiedAt, "2026-10-30"); assert.match(AUTH.budget.price.note, /estimate, not a guaranteed maximum/);
});

test("D-267 the lock: the plan pins the tracked modules' bytes, the master's revision and spec, and the fingerprint; the rules and thresholds are the module's", () => {
  for (const [rel, want] of Object.entries(PLAN.lock.modules)) assert.equal(sha256(readFileSync(repoFile(rel))), want, rel + " is locked");
  assert.deepEqual(Object.keys(PLAN.lock.modules).sort(), [MASTER_REL, EVAL_REL, "tools/avatar/northstar-tee-master-study.mjs", "tools/avatar/northstar-r1c-evaluate.mjs", "tools/avatar/northstar-r1-construction.mjs", "tools/avatar/northstar-r1-material.mjs", "tools/avatar/northstar-r1-similarity.mjs"].sort());
  assert.deepEqual([PLAN.lock.master.revision, PLAN.lock.master.specSha256], [TM.REVISION, sha256(Buffer.from(JSON.stringify(TM.SPEC)))]); assert.match(PLAN.lock.masterFingerprint, /^[0-9a-f]{64}$/);
  assert.deepEqual(TMM.verifyLock(PLAN), []); assert.equal(TMM.verifyLock(PLAN, "0".repeat(64)).length, 1, "a different fingerprint is refused");
  const { statement, ...rules } = PLAN.rules; assert.deepEqual(rules, JSON.parse(JSON.stringify(TMM.RULES))); assert.ok(statement.length > 50);
  assert.deepEqual(PLAN.accept.automatic, JSON.parse(JSON.stringify(TMM.ACCEPT))); assert.deepEqual(PLAN.accept.visual, [...TMM.VISUAL]); assert.equal(PLAN.accept.visualIsNeverAutomatic, true);
  assert.ok(PLAN.knownLimits.some((l) => /unevenness in straight stripes/.test(l)), "D-264's stripe unevenness is a known limit");
});

test("the adapter: no exports, only node built-ins and the ledger, exactly one fetch, no retry, the key once, a JSON body with no image, every check before any claim", () => {
  assert.ok(!/^\s*export\b/m.test(CODE));
  for (const m of CODE.matchAll(/^\s*import\b[^;]*?from\s+"([^"]+)"/gm)) assert.ok(m[1].startsWith("node:") || m[1] === "./r3-face-neutral-attempt-ledger.mjs", m[1]);
  assert.equal([...CODE.matchAll(/\bfetch\s*\(/g)].length, 1); assert.equal(CODE.split(KEY_READ).length - 1, 1); assert.ok(!/FormData|new File\(/.test(CODE), "no multipart, no image");
  const body = CODE.slice(CODE.indexOf("async function main(argv)")); let last = -1;
  for (const k of ["parseArgs(argv)", "resolveRefs()", "readOriginBlobs(", "verifyPrompts(blobs)", "verifyDecisions(", "verifyAuthorisation(", "verifyImplementation(", "resolveClaimLocation(call)", "verifyOrderAndStops(", "resolveOutputs(call)", "buildBody(", "if (!args.sendMode)", KEY_READ, "createClaim(", "globalThis.fetch("]) {
    const at = body.indexOf(k); assert.ok(at > last, k + " comes after the previous check"); last = at; }
  assert.match(CODE, /const MAX_CALLS = 2;/); assert.match(CODE, /const MODEL = "gpt-image-2\.5-sunburst-2026-09-08";/);
  for (const r of AUTH.stopRules) assert.ok(SRC.includes(JSON.stringify(r)), "the adapter carries the stop rule: " + r);
});

test("D-267 the material checks on SYNTHETIC positive and negative examples: each negative fails by the check made for it", () => {
  const ex = TMM.examples(), want = { "N-not seamless (tile cut off-period)": "seamless", "N-baked shading (vignette)": "noBakedShading", "N-unintended detail (a drawn label)": "noDetails", "N-wrong repeat count (8x8)": "repeats", "N-transparent pixels": "opaque",
    "N-white background": "transparentBackground", "N-drop shadow": "noShadowOrGlow", "N-light matte fringe": "noLightFringe", "N-gradient shading": "flatColours", "N-specks": "noSpecks", "N-touches the edge": "transparentBorder" };
  for (const [kind, fn] of [["swatch", TMM.swatchChecks], ["print", TMM.printChecks]]) for (const [name, e] of Object.entries(ex[kind])) { const c = fn(e.img);
    assert.equal(c.ok, e.pass, name + ": " + c.problems.join(",")); if (!e.pass) assert.ok(c.problems.includes(want[name]), name + " is caught by " + want[name] + ": " + c.problems.join(",")); }
});

// ── the post-processing, the twin and the fingerprint on the CI stand-in ─────────────────────────────────────────────
const w = WR.buildWardrobe(), L = w.base.layers, A = w.anchors, M = w.fg.master, { W, N } = WR;
const LEGS = (() => { const legs = new Uint8ClampedArray(L.pants); for (let i = 0; i < (A.crotchY + 10) * W; i++) legs[i * 4 + 3] = 0; return NL.overStack([M, recolour(legs, { h: 33, s: 0.51, vScale: 1.3 })]); })();
const base = BC.prepareBase(w, LEGS), T = BC.templatesC(w, base, { revision: "d213" });
const only = (k, P = LEGS) => { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) if (base.sep.lab[i] === k) o.set(P.subarray(i * 4, i * 4 + 4), i * 4); return o; };
const top = IP.processItem(w, base, T, "top", NL.overStack([LEGS, recolour(only(1), { h: 175, s: 0.55 })]));
const t = R1.templateFromLayers(top.layers, { category: "top" }), cl = C1.constructionLayer(t, base, "tee-hip");

test("D-267 the fixed post-processing: the swatch to half the body width, still seamless; the print to the anchor width around its alpha box; the same rule for every design", () => {
  const bw = S1.geometry(t.core).bodyWidthBelowSleeves, ex = TMM.examples(), g = ex.swatch["P-gingham (SYNTHETIC, 4x4, seamless)"].img, s = TMM.prepareSwatch(g, bw);
  assert.equal(s.w, Math.round(0.5 * bw)); assert.equal(s.h, s.w); for (let i = 0; i < s.w * s.h; i++) assert.equal(s.px[i * 4 + 3], 255);
  // seamless in, seamless out: a source rolled by half a tile gives exactly the result rolled by half (no footprint straddles the tile edge)
  const roll = (im, d) => { const o = new Uint8ClampedArray(im.px.length); for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) o.set(im.px.subarray((y * im.w + ((x + d) % im.w)) * 4, (y * im.w + ((x + d) % im.w)) * 4 + 4), (y * im.w + x) * 4); return { ...im, px: o }; };
  const nz = { w: 1024, h: 1024, px: new Uint8ClampedArray(1024 * 1024 * 4) }; for (let i = 0; i < 1024 * 1024; i++) { const v = (Math.imul(i ^ (i >>> 7), 2654435761) >>> 24) & 255; nz.px.set([v, (v * 7) & 255, 255 - v, 255], i * 4); }
  const r0 = TMM.resample(nz, 130, 130, { wrap: true }), r1 = TMM.resample(roll(nz, 512), 130, 130, { wrap: true }); assert.ok(Buffer.from(r1.px).equals(Buffer.from(roll(r0, 65).px)), "the tile's own seam is carried exactly");
  const p = ex.print["P-flat badge (SYNTHETIC, D-264's print)"].img, a = TMM.preparePrint(p, bw), wA = Math.round(TM.SPEC.anchors["chest-left"].width * bw); assert.deepEqual([a.w, a.h], [wA, wA]);
  // the graphic fills its square: the same print shifted on its sheet gives the same prepared print
  const shifted = { w: 1024, h: 1024, px: new Uint8ClampedArray(1024 * 1024 * 4) }; for (let y = 0; y < 1024 - 60; y++) for (let x = 0; x < 1024 - 80; x++) shifted.px.set(p.px.subarray((y * 1024 + x) * 4, (y * 1024 + x) * 4 + 4), ((y + 60) * 1024 + x + 80) * 4);
  assert.ok(Buffer.from(TMM.preparePrint(shifted, bw).px).equals(Buffer.from(a.px)), "placement on the sheet does not matter");
  const c = TMM.twinGingham(g).colours; assert.deepEqual([c.dark, c.mid, c.light], [[30, 84, 52], [128, 160, 132], [244, 238, 222]], "the twin takes the swatch's own colours");
  assert.throws(() => TMM.preparePrint({ w: 1024, h: 1024, px: new Uint8ClampedArray(1024 * 1024 * 4) }, bw), /no opaque pixel/);
});

test("D-267 the fingerprint: deterministic for the same master; any change to the mapping data changes it", () => {
  const src = { layers: top.layers }, m1 = TM.buildMaster(t, src), m2 = TM.buildMaster(t, src), f = TMM.masterFingerprint(m1, t, cl.band);
  assert.equal(TMM.masterFingerprint(m2, t, cl.band), f); m2.disp[12345] += 0.01; assert.notEqual(TMM.masterFingerprint(m2, t, cl.band), f);
  const m3 = TM.buildMaster(t, src); m3.panel[m3.panel.findIndex((v) => v === 1)] = 0; assert.notEqual(TMM.masterFingerprint(m3, t, cl.band), f);
});

test("D-267 the evaluation decodes 8-bit RGB and RGBA, refuses to write inside the repository, and its study does too", () => {
  const px = new Uint8ClampedArray(6 * 4 * 4); for (let i = 0; i < 24; i++) px.set([i * 9, 255 - i * 5, i * 3, i % 3 ? 255 : 40], i * 4); assert.ok(Buffer.from(TMM.decodeRgba(encodePng(6, 4, px)).px).equals(Buffer.from(px)));
  for (const mode of ["--study", "--from-calls"]) { const r = spawnSync(process.execPath, [repoFile(EVAL_REL), mode, "--out", repoFile("tools/avatar/build/d267")], { encoding: "utf8", env: CHILD_ENV }); assert.equal(r.status, 1); assert.match(r.stderr, /REFUSED/); }
});

// ── sandbox: a throw-away git repository and a mocked fetch; nothing private is needed (no image is sent) ─────────────────
const ROOTS = []; after(() => { for (const r of ROOTS) if (isInside(r, realpathSync.native(tmpdir())) && /d267-sandbox-/.test(r)) rmSync(r, { recursive: true, force: true }); });
const MOCK_SRC = [
  "import { appendFileSync, readFileSync } from \"node:fs\";",
  "const LOG = process.env.D267_MOCK_LOG, PNG = process.env.D267_MOCK_PNG, MODE = process.env.D267_MOCK_MODE;",
  "if (!LOG || !PNG || !MODE) throw new Error(\"d267 mock: not configured — refusing to run\");",
  "globalThis.fetch = async function d267MockFetch(url, init) {",
  "  const b = JSON.parse(init.body); appendFileSync(LOG, JSON.stringify({ url: String(url), redirect: init.redirect, contentType: init.headers[\"Content-Type\"], fields: Object.keys(b), body: b }) + \"\\n\");",
  "  if (MODE === \"throw\") throw new TypeError(\"fetch failed (mock transport error)\");",
  "  if (MODE === \"moderation\") return new Response(JSON.stringify({ error: { type: \"invalid_request_error\", code: \"moderation_blocked\", message: \"blocked\" } }), { status: 400, headers: { \"content-type\": \"application/json\" } });",
  "  return new Response(JSON.stringify({ created: 1, data: [{ b64_json: readFileSync(PNG).toString(\"base64\") }] }), { status: 200, headers: { \"content-type\": \"application/json\", \"x-request-id\": \"req_mockok\" } });",
  "};"].join("\n");
const TRACKED = [ADAPTER_REL, LEDGER_REL, LEGACY_REL, DECISION_REL, MASTER_DECISION_REL, AUTH_REL, PLAN_REL, MASTER_REL, EVAL_REL];
const png = (w2, h2) => { const p = new Uint8ClampedArray(w2 * h2 * 4); for (let i = 0; i < w2 * h2; i++) p.set([150, 150, 150, 255], i * 4); return encodePng(w2, h2, p); };
function envFor(sb, extra) { const env = {}; for (const k of ["PATH", "Path", "SystemRoot", "windir", "COMSPEC", "PATHEXT", "SystemDrive"]) if (typeof process.env[k] === "string") env[k] = process.env[k];
  return Object.assign(env, { LOCALAPPDATA: sb.state, XDG_STATE_HOME: sb.state, HOME: sb.home, USERPROFILE: sb.home, TEMP: sb.tmp, TMP: sb.tmp, TMPDIR: sb.tmp, HTTP_PROXY: "http://127.0.0.1:9", HTTPS_PROXY: "http://127.0.0.1:9",
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: sb.gitconfig, D267_MOCK_LOG: sb.log, D267_MOCK_PNG: sb.png, D267_MOCK_MODE: "ok" }, extra || {}); }
function sgit(sb, args) { const r = spawnSync("git", ["-C", sb.repo, "-c", "user.name=d267-sandbox", "-c", "user.email=sandbox@example.invalid", "-c", "core.autocrlf=false", ...args], { env: envFor(sb), encoding: "utf8", windowsHide: true }); if (r.status !== 0) throw new Error("sandbox git " + args.join(" ") + ": " + r.stderr); return r.stdout.trim(); }
function sandbox({ base: mod } = {}) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "d267-sandbox-"))); ROOTS.push(root);
  const sb = { root, repo: join(root, "repo"), state: join(root, "state"), tmp: join(root, "tmp"), home: join(root, "home"), log: join(root, "fetch.log"), gitconfig: join(root, "gitconfig"), png: join(root, "out.png"), mock: join(root, "mock.mjs") };
  sb.out = join(sb.home, "Documents", "DenSejeApp-artefacts", "tm-material-calls"); for (const d of [sb.repo, sb.state, sb.tmp, sb.home]) mkdirSync(d, { recursive: true });
  writeFileSync(sb.gitconfig, "[core]\n\tautocrlf = false\n[init]\n\tdefaultBranch = main\n"); writeFileSync(sb.mock, MOCK_SRC); writeFileSync(sb.log, ""); writeFileSync(sb.png, png(1024, 1024));
  for (const rel of TRACKED) { const dst = join(sb.repo, ...rel.split("/")); mkdirSync(dirname(dst), { recursive: true }); copyFileSync(repoFile(rel), dst); }
  // the sandbox starts from the authorisation as merged by D-267: the recorded execution (D-268) is undone in the copy only
  { const cp = join(sb.repo, ...AUTH_REL.split("/")), c = JSON.parse(readFileSync(cp, "utf8")); delete c.budget.actuallySent; delete c.budget.closed;
    for (const e of c.calls) { e.mandateState = "UNSPENT"; e.outcome = "NOT YET ATTEMPTED"; delete e.result; delete e.recordedBy; } writeFileSync(cp, JSON.stringify(c, null, 2) + "\n"); }
  if (mod) mod(sb);
  sgit(sb, ["init", "-q", "-b", "main"]); sgit(sb, ["add", "-A"]); sgit(sb, ["commit", "-q", "-m", "base"]); sgit(sb, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  return sb; }
const run = (sb, args, extra) => { const r = spawnSync(process.execPath, ["--import", pathToFileURL(sb.mock).href, join(sb.repo, ...ADAPTER_REL.split("/")), ...args], { cwd: sb.repo, env: envFor(sb, extra), encoding: "utf8", windowsHide: true, timeout: 120000 }); return { status: r.status, out: (r.stdout || "") + (r.stderr || "") }; };
const fetchLog = (sb) => readFileSync(sb.log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
function refused(sb, r, stage, sends = 0) { assert.equal(r.status, 1, r.out); assert.match(r.out, new RegExp("REFUSED \\[" + stage + "\\]"), r.out); assert.equal(fetchLog(sb).length, sends); }

test("the dry runs pass; the two sends go in order, each once, with the frozen prompt, its background and no image, outside the repository; a third is refused", () => {
  const sb = sandbox(), d1 = run(sb, argsOf(ID1)); assert.equal(d1.status, 0, d1.out); assert.match(d1.out, /DRY RUN PASSED/);
  // the order: TMG-2 is refused (dry run and send) until TMG-1 is claimed and has a written outcome
  refused(sb, run(sb, argsOf(ID2)), "stopped"); refused(sb, run(sb, [...argsOf(ID2), ...SEND], KEY), "stopped");
  for (const old of ["R1C-1-top-tee-hip-apricot-bleed"]) { const r = run(sb, argsOf(old)); assert.equal(r.status, 1); assert.match(r.out, /REFUSED \[arguments\]/); }
  const r1 = run(sb, [...argsOf(ID1), ...SEND], KEY); assert.equal(r1.status, 0, r1.out); const d2 = run(sb, argsOf(ID2)); assert.equal(d2.status, 0, d2.out); assert.match(d2.out, /DRY RUN PASSED/);
  const r2 = run(sb, [...argsOf(ID2), ...SEND], KEY); assert.equal(r2.status, 0, r2.out);
  const Lg = fetchLog(sb); assert.equal(Lg.length, 2);
  for (const [k, id] of [[0, ID1], [1, ID2]]) { const c = PLAN.calls.find((x) => x.callId === id);
    assert.deepEqual([Lg[k].url, Lg[k].redirect, Lg[k].contentType, Lg[k].fields], ["https://api.openai.com/v1/images/generations", "error", "application/json", AUTH.request.fieldOrder]);
    assert.deepEqual(Lg[k].body, { model: MODEL, prompt: c.prompt.text, size: "1024x1024", quality: "high", n: 1, output_format: "png", background: c.parameters.background });
    assert.ok(existsSync(join(sb.out, id, "tmm.image-1.png")) && existsSync(join(sb.out, id, "tmm.request.json"))); assert.equal(JSON.parse(readFileSync(join(sb.out, id, "tmm.receipt.json"), "utf8")).verdict, "RECEIVED_FOR_CHECK"); }
  assert.equal(sgit(sb, ["status", "--porcelain"]), "");
  for (const id of [ID1, ID2]) assert.equal(run(sb, [...argsOf(id), ...SEND], KEY).status, 1); assert.equal(fetchLog(sb).length, 2, "never again");
});

test("an uncertain dispatch or a moderation block of the first call is spent, never resent, and stops the second; the stop file, a missing token and a changed master are refused before any claim", () => {
  const u = sandbox(); assert.equal(run(u, [...argsOf(ID1), ...SEND], { ...KEY, D267_MOCK_MODE: "throw" }).status, 3); assert.equal(run(u, [...argsOf(ID1), ...SEND], KEY).status, 1); refused(u, run(u, [...argsOf(ID2), ...SEND], KEY), "stopped", 1);
  const m = sandbox(); assert.equal(run(m, [...argsOf(ID1), ...SEND], { ...KEY, D267_MOCK_MODE: "moderation" }).status, 3); refused(m, run(m, [...argsOf(ID2), ...SEND], KEY), "stopped", 1);
  const stop = sandbox({ base: (s) => { mkdirSync(s.out, { recursive: true }); writeFileSync(join(s.out, "TMM-STOP.json"), "{}\n"); } }); refused(stop, run(stop, [...argsOf(ID1), ...SEND], KEY), "stopped");
  const noToken = sandbox({ base: (s) => { const p = join(s.repo, ...DECISION_REL.split("/")); writeFileSync(p, readFileSync(p, "utf8").replace("D-267 TM-MATERIAL: 2 CALLS AUTHORISED", "D-267 TM-MATERIAL: PREPARED")); } }); refused(noToken, run(noToken, [...argsOf(ID1), ...SEND], KEY), "decision");
  const changed = sandbox({ base: (s) => { const p = join(s.repo, ...MASTER_REL.split("/")); writeFileSync(p, readFileSync(p, "utf8") + "\n// changed\n"); } }); refused(changed, run(changed, [...argsOf(ID1), ...SEND], KEY), "pins");
});

test("a format reject of the swatch does not stop the print: the deliveries are independent", () => {
  const sb = sandbox(); writeFileSync(sb.png, png(512, 512)); const r1 = run(sb, [...argsOf(ID1), ...SEND], KEY); assert.equal(r1.status, 0, r1.out); assert.match(r1.out, /TECHNICAL_REJECT/);
  writeFileSync(sb.png, png(1024, 1024)); const r2 = run(sb, [...argsOf(ID2), ...SEND], KEY); assert.equal(r2.status, 0, r2.out); assert.equal(fetchLog(sb).length, 2);
});

test("after D-268 both spent calls are refused before any claim: the authorisation as recorded admits no further send", () => {
  const sb = sandbox({ base: (x) => copyFileSync(repoFile(AUTH_REL), join(x.repo, ...AUTH_REL.split("/"))) });
  refused(sb, run(sb, [...argsOf(ID1), ...SEND], KEY), "authorisation"); refused(sb, run(sb, argsOf(ID1)), "authorisation");
});
