// D-258 — the R1C authorisation: ONE one-shot call of r1c-plan-v1.json (D-257), its send adapter
// (tools/avatar/openai-send-northstar-r1c-d258.mjs), its evaluation (tools/avatar/northstar-r1c-evaluate.mjs): the placement against
// the bleed-grown core with the bleed estimated, the line detector by contrast and valley, the tone-leak check, the canvas v2. The
// static and stand-in tests run everywhere. The mocked sends need C and the canvas, which are private (D-127 §2): they run only where
// ITEM_PILOT_C_PATH points at C and the canvas exists — skipped in CI, never faked. A dummy key and a mocked fetch only.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, copyFileSync, realpathSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join, dirname, relative, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir, homedir } from "node:os";
import { encodePng } from "../../tools/avatar/r3-hair-tool-v2.mjs";
import * as WR from "../../tools/avatar/northstar-wardrobe.mjs";
import * as BC from "../../tools/avatar/northstar-base-figure-c.mjs";
import * as IP from "../../tools/avatar/northstar-item-pilot.mjs";
import * as R1 from "../../tools/avatar/northstar-r1-garment.mjs";
import * as S1 from "../../tools/avatar/northstar-r1-similarity.mjs";
import * as C1 from "../../tools/avatar/northstar-r1-construction.mjs";
import * as RC from "../../tools/avatar/northstar-r1c-evaluate.mjs";
import { recolour } from "../../tools/avatar/northstar-wardrobe-poc.mjs";
import * as NL from "../../tools/avatar/r3-northstar-layers.mjs";

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = resolve(HERE, "..", "..");
const sha256 = (b) => createHash("sha256").update(b).digest("hex"), repoFile = (rel) => join(REPO, ...rel.split("/")), FX = "tools/avatar/fixtures/northstar-wardrobe/r1/";
const ADAPTER_REL = "tools/avatar/openai-send-northstar-r1c-d258.mjs", LEDGER_REL = "tools/avatar/r3-face-neutral-attempt-ledger.mjs", LEGACY_REL = "docs/project-state.md";
const DECISION_REL = "docs/decisions/D-258.md", PLAN_DECISION_REL = "docs/decisions/D-257.md", AUTH_REL = FX + "r1c-authorisation-v1.json", PLAN_REL = FX + "r1c-plan-v1.json";
const FREEZE_REL = "tools/avatar/fixtures/northstar-wardrobe/base-figure-c-v1.json", METHOD_REL = "tools/avatar/northstar-r1-construction.mjs", EVAL_REL = "tools/avatar/northstar-r1c-evaluate.mjs";
const SRC = readFileSync(repoFile(ADAPTER_REL), "utf8"), CODE = SRC.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
const json = (rel) => JSON.parse(readFileSync(repoFile(rel), "utf8"));
const AUTH = json(AUTH_REL), PLAN = json(PLAN_REL), DECISION = readFileSync(repoFile(DECISION_REL), "utf8"), D255 = json(FX + "r1-authorisation-v1.json");
const C_SHA = "10f4a4b9baf9886e8f230e09b2ab4e69bfebd6795c2a1222eb84f8db3884e818", MODEL = "gpt-image-2.5-sunburst-2026-09-08", ID = "R1C-1-top-tee-hip-apricot-bleed";
const argsOf = (id) => ["--call-id=" + id, "--claim-identity=" + id + "-claim"], SEND = ["--send", "--owner-approval=D-258"], KEY = { ["OPENAI_API" + "_KEY"]: "sk-d258-sandbox-dummy-key-not-a-credential" };
const KEY_READ = "process.env." + "OPENAI_API" + "_KEY";   // spelt in parts so this file never reads it (the D-142 guard)
const CHILD_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/API_?KEY/i.test(k)));
const C_PATH = process.env.ITEM_PILOT_C_PATH, C_BUF = C_PATH && existsSync(C_PATH) ? readFileSync(C_PATH) : null;
const CANVAS = AUTH.request.canvases["tee-hip-bleed-v2"], CANVAS_FILE = join(homedir(), "Documents", "DenSejeApp-artefacts", "r1c-calls", "references", "tee-hip-bleed-v2", CANVAS.name);
const HAVE = !!C_BUF && sha256(C_BUF) === C_SHA && existsSync(CANVAS_FILE) && sha256(readFileSync(CANVAS_FILE)) === CANVAS.sha256;
const SKIP = HAVE ? false : "C and the bleed canvas are private (D-127 §2); set ITEM_PILOT_C_PATH and keep the canvas outside the clones to run the mocked sends";
const isInside = (c, p) => { const r = relative(p, c); return r === "" || (!r.startsWith("..") && !isAbsolute(r)); };

test("D-258 authorisation: one one-shot call of the frozen plan (spent and received, D-259), a separate budget, no reserve, retry, fallback or D-255 permission; the token in D-258's status", () => {
  assert.deepEqual([AUTH.decision, AUTH.meta.authorisesImageRequest, AUTH.budget.authorised, AUTH.budget.reserve, AUTH.budget.retries, AUTH.budget.fallback, AUTH.budget.reusesEarlierPermissions], ["D-258", false, 1, 0, 0, false, false]);
  assert.deepEqual(AUTH.calls.map((e) => [e.callId, e.order]), [[ID, 1]]);
  // the recorded execution and closure (D-259): the one call spent once and received, technically rejected; nothing open
  assert.deepEqual([AUTH.calls[0].mandateState, AUTH.calls[0].outcome, AUTH.calls[0].result.httpStatus, AUTH.calls[0].recordedBy], ["SPENT", "RECEIVED_FOR_BF_CHECK", 200, "D-259"]);
  assert.match(AUTH.calls[0].result.imageSha256, /^[0-9a-f]{64}$/); assert.match(AUTH.calls[0].result.evaluation, /^technically rejected/);
  assert.deepEqual([AUTH.budget.actuallySent, AUTH.budget.closed.by, AUTH.budget.closed.spent, AUTH.budget.closed.uncertain, AUTH.budget.closed.refusedBeforeSend], [1, "D-259", 1, 0, 0]); assert.equal(PLAN.call.callId, ID);
  assert.ok(!D255.calls.some((e) => e.callId === ID)); for (const e of D255.calls) assert.ok(!SRC.includes(e.callId), e.callId + " is not known here");
  assert.deepEqual(D255.calls.map((e) => e.mandateState), ["SPENT", "CLOSED_UNUSED", "CLOSED_UNUSED"], "D-255 stays closed");
  assert.equal(AUTH.frozen.plan.sha256, sha256(readFileSync(repoFile(PLAN_REL)))); assert.equal(AUTH.frozen.prompt.sha256, PLAN.call.prompt.sha256);
  const prompt = PLAN.promptFrame.replace("{noun}", PLAN.call.noun).replace("{design}", PLAN.call.design); assert.equal(sha256(Buffer.from(prompt, "utf8")), AUTH.frozen.prompt.sha256);
  assert.deepEqual([AUTH.frozen.method, AUTH.frozen.production, AUTH.request.model, AUTH.request.images[1].sha256], [C1.REVISION, IP.METHOD, MODEL, C_SHA]);
  assert.equal(AUTH.calls[0].canvas, CANVAS.sha256); assert.equal(RC.CANVAS_V2.sha256, CANVAS.sha256); assert.notEqual(CANVAS.sha256, PLAN.frozen.canvas.sha256, "v2 replaces the plan's v1 canvas");
  assert.equal(AUTH.deviationsFromPlanV1.length, 4); assert.equal(AUTH.acceptance.visualIsNeverAutomatic, true); assert.match(AUTH.postProcessing.holes, /BEFORE the construction lines/);
  const status = /^status: (.*)$/m.exec(DECISION)[1]; assert.ok(status.split(" — ").map((x) => x.trim()).includes("D-258 R1C: 1 CALL AUTHORISED"));
  for (const n of [ID, "--owner-approval=D-258", MODEL, ADAPTER_REL, C_SHA, AUTH.frozen.prompt.sha256, AUTH.frozen.plan.sha256, "1024x1536", CANVAS.sha256]) assert.ok(DECISION.includes(n), n);
  assert.ok(!readFileSync(repoFile(LEGACY_REL), "utf8").split("\n").some((l) => l.startsWith("| **D-258** |")));
  for (const t of [JSON.stringify(AUTH), SRC]) assert.ok(!/fitting-base|H1\.png/.test(t), "no H1");
  assert.equal(AUTH.budget.price.verifiedAt, "2026-10-30"); assert.match(AUTH.budget.price.note, /estimate, not a guaranteed maximum/);
});

test("the adapter: no exports, only node built-ins and the ledger, exactly one fetch, no retry, the key once, the canvas before C, every check before any claim", () => {
  assert.ok(!/^\s*export\b/m.test(CODE));
  for (const m of CODE.matchAll(/^\s*import\b[^;]*?from\s+"([^"]+)"/gm)) assert.ok(m[1].startsWith("node:") || m[1] === "./r3-face-neutral-attempt-ledger.mjs", m[1]);
  assert.equal([...CODE.matchAll(/\bfetch\s*\(/g)].length, 1); assert.equal(CODE.split(KEY_READ).length - 1, 1);
  const body = CODE.slice(CODE.indexOf("async function main(argv)")); let last = -1;
  for (const k of ["parseArgs(argv)", "resolveRefs()", "readOriginBlobs(", "verifyPrompts(blobs)", "readC()", "verifyDecisions(", "verifyAuthorisation(", "verifyImplementation(", "readCanvas(", "resolveClaimLocation(call)", "verifyOrderAndStops(", "resolveOutputs(call)", "buildBody(", "if (!args.sendMode)", KEY_READ, "createClaim(", "globalThis.fetch("]) {
    const at = body.indexOf(k); assert.ok(at > last, k + " comes after the previous check"); last = at; }
  assert.match(CODE, /const MAX_CALLS = 1;/); assert.match(CODE, /const MODEL = "gpt-image-2\.5-sunburst-2026-09-08";/); assert.ok(CODE.indexOf("new File([canvasBuf]") < CODE.indexOf("new File([cBuf]"));
  for (const r of AUTH.stopRules) assert.ok(SRC.includes(JSON.stringify(r)), "the adapter carries the stop rule: " + r);
});

// ── the checks on the CI stand-in: a tee cut, its construction layer and canvas v2 ────────────────────────────────────
const w = WR.buildWardrobe(), L = w.base.layers, A = w.anchors, M = w.fg.master, { W, N } = WR;
const LEGS = (() => { const legs = new Uint8ClampedArray(L.pants); for (let i = 0; i < (A.crotchY + 10) * W; i++) legs[i * 4 + 3] = 0; return NL.overStack([M, recolour(legs, { h: 33, s: 0.51, vScale: 1.3 })]); })();
const base = BC.prepareBase(w, LEGS), T = BC.templatesC(w, base, { revision: "d213" });
const only = (k, P = LEGS) => { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) if (base.sep.lab[i] === k) o.set(P.subarray(i * 4, i * 4 + 4), i * 4); return o; };
const sleeve = new Uint8ClampedArray(N * 4); for (let y = A.shoulder.y; y < 720; y++) for (let x = 0; x < W; x++) if (base.arms[(y * W + x) * 4 + 3] >= 128) sleeve.set([40, 140, 120, 255], (y * W + x) * 4);
const top = IP.processItem(w, base, T, "top", NL.overStack([LEGS, recolour(only(1), { h: 175, s: 0.55 }), sleeve]));
const t = R1.templateFromLayers(top.layers, { category: "top" }), cl = C1.constructionLayer(t, base, "tee-hip"), cv = RC.canvasV2(t, cl);
const fill = (mask, rgb) => { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) if (mask[i]) o.set([...rgb, 255], i * 4); return o; };

test("D-258 canvas v2: two grey tones over the bleed-grown core, the trim tone on the bands, no drawn line anywhere", () => {
  // no drawn line in the body: the detector may only answer at the narrow ends of the bands (a band tip is thin), never elsewhere
  const lines = RC.lineMask(cv.canvas), nearBand = WR.maskOps.dilate(Uint8Array.from(cl.band, (v) => (v ? 1 : 0)), 3); let n = 0; for (let i = 0; i < N; i++) if (lines[i] && t.core[i] && !nearBand[i]) n++; assert.equal(n, 0, "no line in the canvas's body");
  for (let i = 0; i < N; i++) { assert.equal(cv.canvas[i * 4 + 3] === 255, !!cv.bleedMask[i]); if (cv.bleedMask[i]) assert.ok(cv.canvas[i * 4] === cv.canvas[i * 4 + 1] && cv.canvas[i * 4 + 1] === cv.canvas[i * 4 + 2]); }
  let tb = 0, tn = 0, bb = 0, bn = 0; for (let i = 0; i < N; i++) { if (!t.core[i]) continue; if (cl.band[i]) { tb += cv.canvas[i * 4]; tn++; } else { bb += cv.canvas[i * 4]; bn++; } } assert.ok(tb / tn < bb / bn - 40, "the bands darker");
});

test("D-258 placement: the bleed is estimated with the scale — a 24 px bleed and no bleed are both placed right; IoU ≥ 0.95 (the study covers 3, 10 and 16 on C)", () => {
  for (const b of [24, 0]) { const g = fill(b ? WR.maskOps.dilate(t.core, b) : t.core, [230, 170, 120]), shot = S1.apply(g, { s: 1.6, tx: -200, ty: -600 }), p = RC.place(shot, t);
    assert.ok(Math.abs(p.s * 1.6 - 1) < 0.01, "b " + b + ": " + JSON.stringify(p)); assert.ok(Math.abs(p.bleedPx - b) <= 3, "b " + b + " estimated " + p.bleedPx); assert.ok(p.ok); }
});

test("D-258 the line detector: a brown 2 px line is found; a colour step (trim against body) and a broad shadow are not", () => {
  const g = fill(WR.maskOps.dilate(t.core, 16), [240, 190, 150]); let cy = 0, cx = 0, n = 0; for (let i = 0; i < N; i++) if (t.core[i]) { cx += i % W; cy += (i / W) | 0; n++; } cx = Math.round(cx / n); cy = Math.round(cy / n);
  for (let y = cy - 40; y < cy + 40; y++) for (let x = cx - 60; x < cx; x++) g.set([200, 130, 90, 255], (y * W + x) * 4);             // a colour step (a broad trim-like field)
  for (let y = cy - 40; y < cy + 40; y++) for (let x = cx + 10; x < cx + 40; x++) g.set([215, 165, 125, 255], (y * W + x) * 4);       // a broad shadow
  for (let y = cy + 50; y < cy + 52; y++) for (let x = cx - 40; x < cx + 40; x++) g.set([150, 100, 70, 255], (y * W + x) * 4);        // a brown line
  const m = RC.lineMask(g); let onLine = 0, elsewhere = 0; for (let i = 0; i < N; i++) if (m[i]) { const y = (i / W) | 0; if (y >= cy + 50 && y < cy + 52) onLine++; else if (t.core[i]) elsewhere++; }
  assert.ok(onLine >= 100, "the brown line is found: " + onLine); assert.equal(elsewhere, 0, "no step or shadow read as a line");
});

test("D-258 the checks on constructed examples: a clean bleed passes; own outline, a pocket across the edge and the canvas's grey are caught", () => {
  const clean = (() => { const o = fill(cv.bleedMask, [240, 190, 150]); for (let i = 0; i < N; i++) if (cl.band[i]) o.set([205, 135, 95, 255], i * 4); return o; })();
  assert.equal(RC.secondOutline(clean, t, cl).ok, true); assert.equal(RC.clippedDetails(clean, t).ok, true); assert.equal(RC.toneLeak(clean, t, cv.canvas).ok, true);
  const outl = new Uint8ClampedArray(clean), out = Uint8Array.from(t.core, (v) => (v ? 0 : 1)), a = WR.maskOps.dilate(out, 6), b = WR.maskOps.dilate(out, 4);
  for (let i = 0; i < N; i++) if (t.core[i] && a[i] && !b[i]) outl.set([120, 80, 60, 255], i * 4); assert.equal(RC.secondOutline(outl, t, cl).ok, false, "a brown own outline at the cut's edge");
  // near the hem (below every sleeve, also the stand-in's long ones), across the body's right side edge
  const g = S1.geometry(t.core), ry = g.bbox[3] - 40, pocket = new Uint8ClampedArray(clean); let rx = -1; for (let x = W - 1; x > 0; x--) if (t.core[ry * W + x]) { rx = x; break; }
  for (let y = ry; y < ry + 24; y++) for (let x = rx - 24; x < rx + 10; x++) if (y === ry || y === ry + 23 || x === rx - 24 || x === rx + 9) if (cv.bleedMask[y * W + x]) pocket.set([110, 70, 50, 255], (y * W + x) * 4);
  assert.equal(RC.clippedDetails(pocket, t).ok, false, "a pocket outline across the side edge");
  const grey = new Uint8ClampedArray(clean); for (let i = 0; i < N; i++) if (cl.band[i]) grey.set([cv.canvas[i * 4], cv.canvas[i * 4 + 1], cv.canvas[i * 4 + 2], 255], i * 4); assert.equal(RC.toneLeak(grey, t, cv.canvas).ok, false, "the bands left grey");
});

test("D-258 the evaluation refuses an unknown call and never rewrites a record; holes are counted before the lines", () => {
  const src = readFileSync(repoFile(EVAL_REL), "utf8"); assert.match(src, /a record is never rewritten/); assert.match(src, /holesBeforeLines/); assert.match(src, /never an automatic pass/);
  const r = spawnSync(process.execPath, [repoFile(EVAL_REL), "--call-id", "R1C-9-unknown"], { encoding: "utf8", env: CHILD_ENV }); assert.equal(r.status, 1); assert.match(r.stderr, /REFUSED/);
  const study = spawnSync(process.execPath, [repoFile("tools/avatar/northstar-r1c-checks-study.mjs"), "--out", repoFile("tools/avatar/build/d258")], { encoding: "utf8", env: CHILD_ENV }); assert.equal(study.status, 1); assert.match(study.stderr, /REFUSED: --out must be outside the repository/);
});

// ── sandbox: a throw-away git repository, a mocked fetch, the private C and canvas copied in ──────────────────────────────
const ROOTS = []; after(() => { for (const r of ROOTS) if (isInside(r, realpathSync.native(tmpdir())) && /d258-sandbox-/.test(r)) rmSync(r, { recursive: true, force: true }); });
const MOCK_SRC = [
  "import { appendFileSync, readFileSync } from \"node:fs\"; import { createHash } from \"node:crypto\";",
  "const LOG = process.env.D258_MOCK_LOG, PNG = process.env.D258_MOCK_PNG, MODE = process.env.D258_MOCK_MODE;",
  "if (!LOG || !PNG || !MODE) throw new Error(\"d258 mock: not configured — refusing to run\");",
  "const h = async (f) => createHash(\"sha256\").update(Buffer.from(await f.arrayBuffer())).digest(\"hex\");",
  "globalThis.fetch = async function d258MockFetch(url, init) {",
  "  const b = init.body; appendFileSync(LOG, JSON.stringify({ url: String(url), redirect: init.redirect, fields: [...b.keys()], imageSha: await Promise.all(b.getAll(\"image[]\").map(h)), imageNames: b.getAll(\"image[]\").map((f) => f.name), prompt: b.get(\"prompt\"), n: b.get(\"n\") }) + \"\\n\");",
  "  if (MODE === \"throw\") throw new TypeError(\"fetch failed (mock transport error)\");",
  "  return new Response(JSON.stringify({ created: 1, data: [{ b64_json: readFileSync(PNG).toString(\"base64\") }] }), { status: 200, headers: { \"content-type\": \"application/json\", \"x-request-id\": \"req_mockok\" } });",
  "};"].join("\n");
const TRACKED = [ADAPTER_REL, LEDGER_REL, LEGACY_REL, DECISION_REL, PLAN_DECISION_REL, AUTH_REL, PLAN_REL, FREEZE_REL, METHOD_REL, EVAL_REL];
const png = (w2, h2) => { const px = new Uint8ClampedArray(w2 * h2 * 4); for (let i = 0; i < w2 * h2; i++) px.set([150, 150, 150, 255], i * 4); return encodePng(w2, h2, px); };
function envFor(sb, extra) { const env = {}; for (const k of ["PATH", "Path", "SystemRoot", "windir", "COMSPEC", "PATHEXT", "SystemDrive"]) if (typeof process.env[k] === "string") env[k] = process.env[k];
  return Object.assign(env, { LOCALAPPDATA: sb.state, XDG_STATE_HOME: sb.state, HOME: sb.home, USERPROFILE: sb.home, TEMP: sb.tmp, TMP: sb.tmp, TMPDIR: sb.tmp, HTTP_PROXY: "http://127.0.0.1:9", HTTPS_PROXY: "http://127.0.0.1:9",
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: sb.gitconfig, D258_MOCK_LOG: sb.log, D258_MOCK_PNG: sb.png, D258_MOCK_MODE: "ok" }, extra || {}); }
function sgit(sb, args) { const r = spawnSync("git", ["-C", sb.repo, "-c", "user.name=d258-sandbox", "-c", "user.email=sandbox@example.invalid", "-c", "core.autocrlf=false", ...args], { env: envFor(sb), encoding: "utf8", windowsHide: true }); if (r.status !== 0) throw new Error("sandbox git " + args.join(" ") + ": " + r.stderr); return r.stdout.trim(); }
function sandbox({ base: mod, canvas } = {}) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "d258-sandbox-"))); ROOTS.push(root);
  const sb = { root, repo: join(root, "repo"), state: join(root, "state"), tmp: join(root, "tmp"), home: join(root, "home"), log: join(root, "fetch.log"), gitconfig: join(root, "gitconfig"), png: join(root, "out.png"), mock: join(root, "mock.mjs") };
  sb.out = join(sb.home, "Documents", "DenSejeApp-artefacts", "r1c-calls"); for (const d of [sb.repo, sb.state, sb.tmp, sb.home]) mkdirSync(d, { recursive: true });
  writeFileSync(sb.gitconfig, "[core]\n\tautocrlf = false\n[init]\n\tdefaultBranch = main\n"); writeFileSync(sb.mock, MOCK_SRC); writeFileSync(sb.log, ""); writeFileSync(sb.png, png(1024, 1536));
  const cd = join(sb.home, "Documents", "DenSejeApp-artefacts", "d-202-northstar-base-figure"); mkdirSync(cd, { recursive: true }); writeFileSync(join(cd, "d202-base-figure-v2.image-1.png"), C_BUF);
  const rd = join(sb.out, "references", "tee-hip-bleed-v2"); mkdirSync(rd, { recursive: true }); writeFileSync(join(rd, CANVAS.name), canvas || readFileSync(CANVAS_FILE));
  for (const rel of TRACKED) { const dst = join(sb.repo, ...rel.split("/")); mkdirSync(dirname(dst), { recursive: true }); copyFileSync(repoFile(rel), dst); }
  // the sandbox starts from the authorisation as merged by D-258: the recorded execution (D-259) is undone in the copy only
  { const cp = join(sb.repo, ...AUTH_REL.split("/")), c = JSON.parse(readFileSync(cp, "utf8")); delete c.budget.actuallySent; delete c.budget.closed;
    for (const e of c.calls) { e.mandateState = "UNSPENT"; e.outcome = "NOT YET ATTEMPTED"; delete e.result; delete e.recordedBy; } writeFileSync(cp, JSON.stringify(c, null, 2) + "\n"); }
  if (mod) mod(sb);
  sgit(sb, ["init", "-q", "-b", "main"]); sgit(sb, ["add", "-A"]); sgit(sb, ["commit", "-q", "-m", "base"]); sgit(sb, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  return sb; }
const run = (sb, args, extra) => { const r = spawnSync(process.execPath, ["--import", pathToFileURL(sb.mock).href, join(sb.repo, ...ADAPTER_REL.split("/")), ...args], { cwd: sb.repo, env: envFor(sb, extra), encoding: "utf8", windowsHide: true, timeout: 180000 }); return { status: r.status, out: (r.stdout || "") + (r.stderr || "") }; };
const fetchLog = (sb) => readFileSync(sb.log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
function refused(sb, r, stage, sends = 0) { assert.equal(r.status, 1, r.out); assert.match(r.out, new RegExp("REFUSED \\[" + stage + "\\]"), r.out); assert.equal(fetchLog(sb).length, sends); }

test("the dry run passes; the one send carries the canvas v2 then C and the frozen prompt, outside the repository, never twice; D-255's ids are refused", { skip: SKIP }, () => {
  const sb = sandbox(); const d = run(sb, argsOf(ID)); assert.equal(d.status, 0, d.out); assert.match(d.out, /DRY RUN PASSED/);
  for (const old of D255.calls) { const r = run(sb, argsOf(old.callId)); assert.equal(r.status, 1); assert.match(r.out, /REFUSED \[arguments\]/); }
  const r = run(sb, [...argsOf(ID), ...SEND], KEY); assert.equal(r.status, 0, r.out); const Lg = fetchLog(sb); assert.equal(Lg.length, 1);
  assert.deepEqual([Lg[0].fields, Lg[0].imageSha, Lg[0].imageNames, Lg[0].n, Lg[0].redirect], [AUTH.request.fieldOrder, [CANVAS.sha256, C_SHA], [CANVAS.name, "d202-base-figure-v2.image-1.png"], "1", "error"]);
  assert.equal(Lg[0].prompt, PLAN.promptFrame.replace("{noun}", PLAN.call.noun).replace("{design}", PLAN.call.design));
  assert.ok(existsSync(join(sb.out, ID, "r1c.image-1.png")) && existsSync(join(sb.out, ID, "r1c.request.json"))); assert.equal(sgit(sb, ["status", "--porcelain"]), "");
  assert.equal(run(sb, [...argsOf(ID), ...SEND], KEY).status, 1); assert.equal(fetchLog(sb).length, 1, "never twice");
});

test("an uncertain dispatch is spent and never resent; the stop file, a changed canvas or a missing token is refused before any claim", { skip: SKIP }, () => {
  const u = sandbox(); assert.equal(run(u, [...argsOf(ID), ...SEND], { ...KEY, D258_MOCK_MODE: "throw" }).status, 3); assert.equal(run(u, [...argsOf(ID), ...SEND], KEY).status, 1); assert.equal(fetchLog(u).length, 1);
  const stop = sandbox({ base: (s) => { mkdirSync(s.out, { recursive: true }); writeFileSync(join(s.out, "R1C-STOP.json"), "{}\n"); } }); refused(stop, run(stop, [...argsOf(ID), ...SEND], KEY), "stopped");
  const wrong = sandbox({ canvas: png(1024, 1536) }); refused(wrong, run(wrong, [...argsOf(ID), ...SEND], KEY), "reference-canvas");
  const noToken = sandbox({ base: (s) => { const p = join(s.repo, ...DECISION_REL.split("/")); writeFileSync(p, readFileSync(p, "utf8").replace("D-258 R1C: 1 CALL AUTHORISED", "D-258 R1C: PREPARED")); } }); refused(noToken, run(noToken, [...argsOf(ID), ...SEND], KEY), "decision");
});

test("after D-259 the spent call is refused before any claim: the authorisation as recorded admits no further send", { skip: SKIP }, () => {
  const sb = sandbox({ base: (x) => copyFileSync(repoFile(AUTH_REL), join(x.repo, ...AUTH_REL.split("/"))) });
  refused(sb, run(sb, [...argsOf(ID), ...SEND], KEY), "authorisation");
});
