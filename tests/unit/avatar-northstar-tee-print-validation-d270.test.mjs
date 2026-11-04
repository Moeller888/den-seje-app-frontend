// D-270 — independent validation of large central tee prints: THREE one-shot calls of tp-validation-plan-v1.json (an animal, an object,
// an emblem; each a separate transparent image), their send adapter (tools/avatar/openai-send-northstar-tee-print-validation-d270.mjs)
// and the evaluation (tools/avatar/northstar-tee-print-validation.mjs): the lock (D-264's master, D-269's box and rule, unchanged), the
// delivery checks and the contrast check on SYNTHETIC good, bad and borderline examples. No call sends an image or C, so the mocked sends
// run everywhere. A dummy key and a mocked fetch only. The checks decide only what they measure; the visual review is never automatic.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, copyFileSync, realpathSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join, dirname, relative, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { encodePng } from "../../tools/avatar/r3-hair-tool-v2.mjs";
import * as TM from "../../tools/avatar/northstar-tee-master.mjs";
import * as PF from "../../tools/avatar/northstar-tee-print-family.mjs";
import * as V from "../../tools/avatar/northstar-tee-print-validation.mjs";

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = resolve(HERE, "..", "..");
const sha256 = (b) => createHash("sha256").update(b).digest("hex"), repoFile = (rel) => join(REPO, ...rel.split("/")), FX = "tools/avatar/fixtures/northstar-wardrobe/tee-master/";
const ADAPTER_REL = "tools/avatar/openai-send-northstar-tee-print-validation-d270.mjs", LEDGER_REL = "tools/avatar/r3-face-neutral-attempt-ledger.mjs", LEGACY_REL = "docs/project-state.md";
const DECISION_REL = "docs/decisions/D-270.md", MASTER_DECISION_REL = "docs/decisions/D-264.md", FAMILY_DECISION_REL = "docs/decisions/D-269.md", AUTH_REL = FX + "tp-validation-authorisation-v1.json", PLAN_REL = FX + "tp-validation-plan-v1.json";
const MASTER_REL = "tools/avatar/northstar-tee-master.mjs", FAMILY_REL = "tools/avatar/northstar-tee-print-family.mjs", EVAL_REL = "tools/avatar/northstar-tee-print-validation.mjs";
const SRC = readFileSync(repoFile(ADAPTER_REL), "utf8"), CODE = SRC.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
const json = (rel) => JSON.parse(readFileSync(repoFile(rel), "utf8"));
const AUTH = json(AUTH_REL), PLAN = json(PLAN_REL), DECISION = readFileSync(repoFile(DECISION_REL), "utf8");
const MODEL = "gpt-image-2.5-sunburst-2026-09-08", IDS = Object.values(V.CALL_IDS), [ID1, ID2, ID3] = IDS;
const argsOf = (id) => ["--call-id=" + id, "--claim-identity=" + id + "-claim"], SEND = ["--send", "--owner-approval=D-270"], KEY = { ["OPENAI_API" + "_KEY"]: "sk-d270-sandbox-dummy-key-not-a-credential" };
const KEY_READ = "process.env." + "OPENAI_API" + "_KEY";   // spelt in parts so this file never reads it (the D-142 guard)
const CHILD_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/API_?KEY/i.test(k)));
const isInside = (c, p) => { const r = relative(p, c); return r === "" || (!r.startsWith("..") && !isAbsolute(r)); };

test("D-270 authorisation: three one-shot calls (spent and received, D-271), a separate budget, no reserve, retry, fallback or earlier permission; the token in D-270's status; no image and no C sent", () => {
  assert.deepEqual([AUTH.decision, AUTH.meta.authorisesImageRequest, AUTH.budget.authorised, AUTH.budget.reserve, AUTH.budget.retries, AUTH.budget.fallback, AUTH.budget.reusesEarlierPermissions], ["D-270", false, 3, 0, 0, false, false]);
  assert.deepEqual(AUTH.calls.map((e) => [e.callId, e.order, e.delivery, e.background]), [[ID1, 1, "print-animal", "transparent"], [ID2, 2, "print-object", "transparent"], [ID3, 3, "print-emblem", "transparent"]]);
  // the recorded execution and closure (D-271): each call spent once and received; nothing open
  for (const e of AUTH.calls) { assert.deepEqual([e.mandateState, e.outcome, e.result.httpStatus, e.recordedBy], ["SPENT", "RECEIVED_FOR_CHECK", 200, "D-271"]);
    assert.match(e.result.imageSha256, /^[0-9a-f]{64}$/); assert.match(e.result.evaluation, /^requires visual review/); }
  assert.deepEqual([AUTH.budget.actuallySent, AUTH.budget.closed.by, AUTH.budget.closed.spent, AUTH.budget.closed.uncertain, AUTH.budget.closed.refusedBeforeSend, AUTH.budget.closed.closedUnused], [3, "D-271", 3, 0, 0, 0]);
  // no earlier permission is known here, and every earlier one is closed
  for (const old of ["tm-material-authorisation-v1.json"]) { const o = json(FX + old); for (const e of o.calls) { assert.ok(!SRC.includes(e.callId), e.callId + " is not known here"); assert.notEqual(e.mandateState, "UNSPENT"); } }
  assert.equal(AUTH.frozen.plan.sha256, sha256(readFileSync(repoFile(PLAN_REL)))); assert.equal(PLAN.authorisesImageRequest, false);
  for (const c of PLAN.calls) { const t = c.prompt.text; assert.equal(sha256(Buffer.from(t, "utf8")), c.prompt.sha256); assert.deepEqual(c.references, []); assert.equal(AUTH.calls.find((e) => e.callId === c.callId).prompt.sha256, c.prompt.sha256);
    assert.deepEqual([c.endpoint, c.parameters.size, c.parameters.quality, c.parameters.n, c.parameters.background], ["https://api.openai.com/v1/images/generations", "1024x1024", "high", 1, "transparent"]); assert.ok(SRC.includes(c.prompt.sha256));
    for (const must of [/fully transparent background/, /One single compact shape/, /No text, letters or numbers/, /no stars, sparkles/, /no drop shadow/, /about as wide as it is tall/]) assert.match(t, must, c.callId); }
  assert.match(PLAN.calls[0].prompt.text, /no mouth, no eyebrows, no whiskers/, "the animal's face is reduced");
  assert.deepEqual([AUTH.request.model, AUTH.request.images, AUTH.privacy.cSentToApi.startsWith("never")], [MODEL, [], true]);
  assert.match(PLAN.advisory, /promising at 110x165/); assert.match(PLAN.advisory, /No item is approved by the owner/);
  const status = /^status: (.*)$/m.exec(DECISION)[1]; assert.ok(status.split(" — ").map((x) => x.trim()).includes("D-270 TP-VALIDATION: 3 CALLS AUTHORISED"));
  for (const n of [...IDS, "--owner-approval=D-270", MODEL, ADAPTER_REL, AUTH.frozen.plan.sha256, ...PLAN.calls.map((c) => c.prompt.sha256), "1024x1024", "https://api.openai.com/v1/images/generations", PLAN.lock.masterFingerprint]) assert.ok(DECISION.includes(n), n);
  assert.ok(!readFileSync(repoFile(LEGACY_REL), "utf8").split("\n").some((l) => l.startsWith("| **D-270** |")));
  for (const t of [JSON.stringify(AUTH), JSON.stringify(PLAN), SRC]) assert.ok(!/fitting-base|H1\.png/.test(t), "no H1");
  assert.equal(AUTH.budget.price.verifiedAt, "2026-10-31"); assert.match(AUTH.budget.price.note, /estimate, not a guaranteed maximum/);
});

test("D-270 the lock: the master, D-269's box and size rule and the evaluation are pinned and unchanged; the plan states the same rule as the family module", () => {
  for (const [rel, want] of Object.entries(PLAN.lock.modules)) assert.equal(sha256(readFileSync(repoFile(rel))), want, rel + " is locked");
  for (const rel of [MASTER_REL, FAMILY_REL, EVAL_REL]) assert.ok(rel in PLAN.lock.modules, rel);
  assert.deepEqual([PLAN.lock.master.revision, PLAN.lock.master.specSha256], [TM.REVISION, sha256(Buffer.from(JSON.stringify(TM.SPEC)))]); assert.equal(PLAN.lock.masterFingerprint, PF.MASTER_FINGERPRINT);
  assert.equal(V.PLACEMENT, "chest-center"); assert.deepEqual(PLAN.lock.placement.spec, { ...PF.PLACEMENTS["chest-center"] }); assert.deepEqual(PLAN.lock.placement.boxOnC, PF.placementBox({ bbox: [331, 462, 692, 827], bodyWidthBelowSleeves: 259, height: 366 }, "chest-center"));
  const { statement, ...rule } = PLAN.lock.sizeRule; assert.deepEqual(rule, { ...PF.RULE }); assert.ok(statement.length > 50);
  assert.deepEqual(V.verifyLock(PLAN), []); assert.equal(V.verifyLock(PLAN, "0".repeat(64)).length, 1, "a different fingerprint is refused");
  assert.deepEqual(PLAN.accept.contrast, JSON.parse(JSON.stringify(V.CONTRAST))); assert.deepEqual(PLAN.accept.visual, [...V.VISUAL]); assert.equal(PLAN.accept.visualIsNeverAutomatic, true);
  assert.deepEqual(Object.keys(PLAN.colours), ["cream", "heather", "navy", "coral", "forest", "mustard"]);
  assert.ok(PLAN.knownLimits.some((l) => /wavy outlines/.test(l)) && PLAN.knownLimits.some((l) => /speck at the neck rib/.test(l)), "D-269's known limits stay recorded");
});

test("the adapter: no exports, only node built-ins and the ledger, exactly one fetch, no retry, the key once, a JSON body with no image, every check before any claim", () => {
  assert.ok(!/^\s*export\b/m.test(CODE));
  for (const m of CODE.matchAll(/^\s*import\b[^;]*?from\s+"([^"]+)"/gm)) assert.ok(m[1].startsWith("node:") || m[1] === "./r3-face-neutral-attempt-ledger.mjs", m[1]);
  assert.equal([...CODE.matchAll(/\bfetch\s*\(/g)].length, 1); assert.equal(CODE.split(KEY_READ).length - 1, 1); assert.ok(!/FormData|new File\(/.test(CODE), "no multipart, no image");
  const body = CODE.slice(CODE.indexOf("async function main(argv)")); let last = -1;
  for (const k of ["parseArgs(argv)", "resolveRefs()", "readOriginBlobs(", "verifyPrompts(blobs)", "verifyDecisions(", "verifyAuthorisation(", "verifyImplementation(", "resolveClaimLocation(call)", "verifyOrderAndStops(", "resolveOutputs(call)", "buildBody(", "if (!args.sendMode)", KEY_READ, "createClaim(", "globalThis.fetch("]) {
    const at = body.indexOf(k); assert.ok(at > last, k + " comes after the previous check"); last = at; }
  assert.match(CODE, /const MAX_CALLS = 3;/); assert.match(CODE, /const MODEL = "gpt-image-2\.5-sunburst-2026-09-08";/); assert.ok(!/D-267|TMG-|tm-material/.test(SRC), "nothing of D-267 is reused");
  for (const r of AUTH.stopRules) assert.ok(SRC.includes(JSON.stringify(r)), "the adapter carries the stop rule: " + r);
});

test("D-270 the delivery checks on SYNTHETIC examples: the compact positive passes; each negative fails by the check made for it", () => {
  for (const [name, e] of Object.entries(V.deliveryExamples())) { const c = V.deliveryChecks(e.img); assert.equal(c.ok, e.pass, name + ": " + c.problems.join(","));
    if (!e.pass) assert.ok(c.problems.includes(e.fails), name + " is caught by " + e.fails + ": " + c.problems.join(",")); }
  assert.deepEqual(V.ACCEPT, { aspect: [0.6, 1 / 0.6], inkShareMin: 0.45, components: 1 });
});

test("D-270 the contrast check on SYNTHETIC good, bad and borderline examples: each gets its expected class; clear is never a pass", () => {
  const ex = V.contrastExamples(); assert.ok(ex.length >= 8); for (const k of ["clear", "weak", "borderline"]) assert.ok(ex.some((e) => e.expect === k), k);
  for (const e of ex) { const c = V.contrastCheck(e.img, e.shirt); assert.equal(c.class, e.expect, e.name + ": " + JSON.stringify(c)); assert.ok(!("pass" in c) && !("ok" in c), "the class is advisory"); }
  assert.ok(V.deltaE([38, 50, 92], [24, 34, 74]) < V.CONTRAST.seenDE, "a navy outline on a navy shirt is not seen"); assert.ok(V.deltaE([232, 120, 52], [250, 238, 210]) > V.CONTRAST.strongDE);
  assert.ok(V.VISUAL.some((v) => /110x165: the motif's main form is recognised/.test(v)) && V.VISUAL.some((v) => /52x78: the motif reads as a small graphic mark/.test(v)));
});

test("D-270 the evaluation decodes the delivered PNG and refuses to write inside the repository (study and calls)", () => {
  const px = new Uint8ClampedArray(6 * 4 * 4); for (let i = 0; i < 24; i++) px.set([i * 9, 255 - i * 5, i * 3, i % 3 ? 255 : 40], i * 4);
  for (const mode of ["--study", "--from-calls"]) { const r = spawnSync(process.execPath, [repoFile(EVAL_REL), mode, "--out", repoFile("tools/avatar/build/d270")], { encoding: "utf8", env: CHILD_ENV, windowsHide: true, timeout: 60000 }); assert.equal(r.status, 1); assert.match(r.stderr, /--out must be outside the repository/); }
  assert.ok(encodePng(6, 4, px).length > 0);
});

// ── sandbox: a throw-away git repository and a mocked fetch; nothing private is needed (no image is sent) ─────────────────
const ROOTS = []; after(() => { for (const r of ROOTS) if (isInside(r, realpathSync.native(tmpdir())) && /d270-sandbox-/.test(r)) rmSync(r, { recursive: true, force: true }); });
const MOCK_SRC = [
  "import { appendFileSync, readFileSync } from \"node:fs\";",
  "const LOG = process.env.D270_MOCK_LOG, PNG = process.env.D270_MOCK_PNG, MODE = process.env.D270_MOCK_MODE;",
  "if (!LOG || !PNG || !MODE) throw new Error(\"d270 mock: not configured — refusing to run\");",
  "globalThis.fetch = async function d270MockFetch(url, init) {",
  "  const b = JSON.parse(init.body); appendFileSync(LOG, JSON.stringify({ url: String(url), redirect: init.redirect, contentType: init.headers[\"Content-Type\"], fields: Object.keys(b), body: b }) + \"\\n\");",
  "  if (MODE === \"throw\") throw new TypeError(\"fetch failed (mock transport error)\");",
  "  if (MODE === \"moderation\") return new Response(JSON.stringify({ error: { type: \"invalid_request_error\", code: \"moderation_blocked\", message: \"blocked\" } }), { status: 400, headers: { \"content-type\": \"application/json\" } });",
  "  return new Response(JSON.stringify({ created: 1, data: [{ b64_json: readFileSync(PNG).toString(\"base64\") }] }), { status: 200, headers: { \"content-type\": \"application/json\", \"x-request-id\": \"req_mockok\" } });",
  "};"].join("\n");
const TRACKED = [ADAPTER_REL, LEDGER_REL, LEGACY_REL, DECISION_REL, MASTER_DECISION_REL, FAMILY_DECISION_REL, AUTH_REL, PLAN_REL, MASTER_REL, FAMILY_REL, EVAL_REL];
const png = (w2, h2) => { const p = new Uint8ClampedArray(w2 * h2 * 4); for (let i = 0; i < w2 * h2; i++) p.set([150, 150, 150, i % 7 ? 0 : 255], i * 4); return encodePng(w2, h2, p); };
function envFor(sb, extra) { const env = {}; for (const k of ["PATH", "Path", "SystemRoot", "windir", "COMSPEC", "PATHEXT", "SystemDrive"]) if (typeof process.env[k] === "string") env[k] = process.env[k];
  return Object.assign(env, { LOCALAPPDATA: sb.state, XDG_STATE_HOME: sb.state, HOME: sb.home, USERPROFILE: sb.home, TEMP: sb.tmp, TMP: sb.tmp, TMPDIR: sb.tmp, HTTP_PROXY: "http://127.0.0.1:9", HTTPS_PROXY: "http://127.0.0.1:9",
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: sb.gitconfig, D270_MOCK_LOG: sb.log, D270_MOCK_PNG: sb.png, D270_MOCK_MODE: "ok" }, extra || {}); }
function sgit(sb, args) { const r = spawnSync("git", ["-C", sb.repo, "-c", "user.name=d270-sandbox", "-c", "user.email=sandbox@example.invalid", "-c", "core.autocrlf=false", ...args], { env: envFor(sb), encoding: "utf8", windowsHide: true }); if (r.status !== 0) throw new Error("sandbox git " + args.join(" ") + ": " + r.stderr); return r.stdout.trim(); }
function sandbox({ base: mod } = {}) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "d270-sandbox-"))); ROOTS.push(root);
  const sb = { root, repo: join(root, "repo"), state: join(root, "state"), tmp: join(root, "tmp"), home: join(root, "home"), log: join(root, "fetch.log"), gitconfig: join(root, "gitconfig"), png: join(root, "out.png"), mock: join(root, "mock.mjs") };
  sb.out = join(sb.home, "Documents", "DenSejeApp-artefacts", "tp-validation-calls"); for (const d of [sb.repo, sb.state, sb.tmp, sb.home]) mkdirSync(d, { recursive: true });
  writeFileSync(sb.gitconfig, "[core]\n\tautocrlf = false\n[init]\n\tdefaultBranch = main\n"); writeFileSync(sb.mock, MOCK_SRC); writeFileSync(sb.log, ""); writeFileSync(sb.png, png(1024, 1024));
  for (const rel of TRACKED) { const dst = join(sb.repo, ...rel.split("/")); mkdirSync(dirname(dst), { recursive: true }); copyFileSync(repoFile(rel), dst); }
  // the sandbox starts from the authorisation as merged by D-270: the recorded execution (D-271) is undone in the copy only
  { const cp = join(sb.repo, ...AUTH_REL.split("/")), c = JSON.parse(readFileSync(cp, "utf8")); delete c.budget.actuallySent; delete c.budget.closed;
    for (const e of c.calls) { e.mandateState = "UNSPENT"; e.outcome = "NOT YET ATTEMPTED"; delete e.result; delete e.recordedBy; } writeFileSync(cp, JSON.stringify(c, null, 2) + "\n"); }
  if (mod) mod(sb);
  sgit(sb, ["init", "-q", "-b", "main"]); sgit(sb, ["add", "-A"]); sgit(sb, ["commit", "-q", "-m", "base"]); sgit(sb, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  return sb; }
const run = (sb, args, extra) => { const r = spawnSync(process.execPath, ["--import", pathToFileURL(sb.mock).href, join(sb.repo, ...ADAPTER_REL.split("/")), ...args], { cwd: sb.repo, env: envFor(sb, extra), encoding: "utf8", windowsHide: true, timeout: 120000 }); return { status: r.status, out: (r.stdout || "") + (r.stderr || "") }; };
const fetchLog = (sb) => readFileSync(sb.log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
function refused(sb, r, stage, sends = 0) { assert.equal(r.status, 1, r.out); assert.match(r.out, new RegExp("REFUSED \\[" + stage + "\\]"), r.out); assert.equal(fetchLog(sb).length, sends); }

test("the dry runs pass; the three sends go in order, each once, with the frozen prompt, a transparent background and no image, outside the repository; a fourth is refused", () => {
  const sb = sandbox(), d1 = run(sb, argsOf(ID1)); assert.equal(d1.status, 0, d1.out); assert.match(d1.out, /DRY RUN PASSED/);
  refused(sb, run(sb, argsOf(ID2)), "stopped"); refused(sb, run(sb, [...argsOf(ID3), ...SEND], KEY), "stopped");
  for (const old of ["TMG-2-tee-hip-chest-print-planet"]) { const r = run(sb, argsOf(old)); assert.equal(r.status, 1); assert.match(r.out, /REFUSED \[arguments\]/); }
  for (const id of IDS) { const d = run(sb, argsOf(id)); assert.equal(d.status, 0, d.out); const r = run(sb, [...argsOf(id), ...SEND], KEY); assert.equal(r.status, 0, r.out); }
  const Lg = fetchLog(sb); assert.equal(Lg.length, 3);
  IDS.forEach((id, k) => { const c = PLAN.calls.find((x) => x.callId === id);
    assert.deepEqual([Lg[k].url, Lg[k].redirect, Lg[k].contentType, Lg[k].fields], ["https://api.openai.com/v1/images/generations", "error", "application/json", AUTH.request.fieldOrder]);
    assert.deepEqual(Lg[k].body, { model: MODEL, prompt: c.prompt.text, size: "1024x1024", quality: "high", n: 1, output_format: "png", background: "transparent" });
    assert.ok(existsSync(join(sb.out, id, "tpv.image-1.png")) && existsSync(join(sb.out, id, "tpv.request.json"))); assert.equal(JSON.parse(readFileSync(join(sb.out, id, "tpv.receipt.json"), "utf8")).verdict, "RECEIVED_FOR_CHECK"); });
  assert.equal(sgit(sb, ["status", "--porcelain"]), "");
  for (const id of IDS) assert.equal(run(sb, [...argsOf(id), ...SEND], KEY).status, 1); assert.equal(fetchLog(sb).length, 3, "never again");
});

test("an uncertain dispatch or an HTTP error is spent, never resent, and stops every later call; the stop file, a missing token and a changed family module are refused before any claim", () => {
  const u = sandbox(); assert.equal(run(u, [...argsOf(ID1), ...SEND], { ...KEY, D270_MOCK_MODE: "throw" }).status, 3); assert.equal(run(u, [...argsOf(ID1), ...SEND], KEY).status, 1);
  refused(u, run(u, [...argsOf(ID2), ...SEND], KEY), "stopped", 1); refused(u, run(u, [...argsOf(ID3), ...SEND], KEY), "stopped", 1);
  const m = sandbox(); assert.equal(run(m, [...argsOf(ID1), ...SEND], KEY).status, 0); assert.equal(run(m, [...argsOf(ID2), ...SEND], { ...KEY, D270_MOCK_MODE: "moderation" }).status, 3); refused(m, run(m, [...argsOf(ID3), ...SEND], KEY), "stopped", 2);
  const stop = sandbox({ base: (s) => { mkdirSync(s.out, { recursive: true }); writeFileSync(join(s.out, "TPV-STOP.json"), "{}\n"); } }); refused(stop, run(stop, [...argsOf(ID1), ...SEND], KEY), "stopped");
  const noToken = sandbox({ base: (s) => { const p = join(s.repo, ...DECISION_REL.split("/")); writeFileSync(p, readFileSync(p, "utf8").replace("D-270 TP-VALIDATION: 3 CALLS AUTHORISED", "D-270 TP-VALIDATION: PREPARED")); } }); refused(noToken, run(noToken, [...argsOf(ID1), ...SEND], KEY), "decision");
  const changed = sandbox({ base: (s) => { const p = join(s.repo, ...FAMILY_REL.split("/")); writeFileSync(p, readFileSync(p, "utf8") + "\n// changed\n"); } }); refused(changed, run(changed, [...argsOf(ID1), ...SEND], KEY), "pins");
});

test("a format reject does not stop the later calls: the deliveries are independent", () => {
  const sb = sandbox(); writeFileSync(sb.png, png(512, 512)); const r1 = run(sb, [...argsOf(ID1), ...SEND], KEY); assert.equal(r1.status, 0, r1.out); assert.match(r1.out, /TECHNICAL_REJECT/);
  writeFileSync(sb.png, png(1024, 1024)); for (const id of [ID2, ID3]) { const r = run(sb, [...argsOf(id), ...SEND], KEY); assert.equal(r.status, 0, r.out); } assert.equal(fetchLog(sb).length, 3);
});

test("after D-271 the spent calls are refused before any claim: the authorisation as recorded admits no further send", () => {
  const sb = sandbox({ base: (x) => copyFileSync(repoFile(AUTH_REL), join(x.repo, ...AUTH_REL.split("/"))) });
  refused(sb, run(sb, [...argsOf(ID1), ...SEND], KEY), "authorisation"); refused(sb, run(sb, argsOf(ID1)), "authorisation");
});
