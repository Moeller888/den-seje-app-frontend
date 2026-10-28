// D-246 — batch b1's send adapter (tools/avatar/openai-send-northstar-batch-b1.mjs) and its authorisation. The static tests and the
// prompt checks run everywhere (a sandbox repository without C: every call must get PAST the prompt check and stop at C). The
// mocked sends need C and the v2 sheets, which are private (D-127 §2): they run only where ITEM_PILOT_C_PATH points at C and the
// sheets exist — skipped in CI, never faked. Mock tests prove the adapter, never the model.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, copyFileSync, realpathSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join, dirname, relative, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir, homedir } from "node:os";
import { encodePng } from "../../tools/avatar/r3-hair-tool-v2.mjs";
import * as NB from "../../tools/avatar/northstar-batch.mjs";

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = resolve(HERE, "..", "..");
const sha256 = (b) => createHash("sha256").update(b).digest("hex"), repoFile = (rel) => join(REPO, ...rel.split("/")), FX = "tools/avatar/fixtures/northstar-wardrobe/";
const ADAPTER_REL = "tools/avatar/openai-send-northstar-batch-b1.mjs", DECISION_REL = "docs/decisions/D-246.md";
const AUTH_REL = FX + "batches/b1-authorisation-v1.json", PLAN_REL = FX + "batches/b1-calls-v1.json", PROMPTS_REL = FX + "batches/b1-prompts-v1.json", DESIGNS_REL = FX + "batches/b1-designs-v1.json";
const TRACKED = [ADAPTER_REL, "tools/avatar/r3-face-neutral-attempt-ledger.mjs", "docs/project-state.md", DECISION_REL, "docs/decisions/D-245.md", AUTH_REL, PLAN_REL, PROMPTS_REL, DESIGNS_REL,
  FX + "independent-validation-prompts-v1.json", FX + "seam-contract-v2.json", FX + "base-figure-c-v1.json", "tools/avatar/northstar-item-pilot.mjs", "tools/avatar/northstar-seam-templates.mjs"];
const SRC = readFileSync(repoFile(ADAPTER_REL), "utf8"), CODE = SRC.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
const json = (rel) => JSON.parse(readFileSync(repoFile(rel), "utf8"));
const AUTH = json(AUTH_REL), PLAN = json(PLAN_REL), PROMPTS = json(PROMPTS_REL), B1 = NB.loadBatch("b1"), DECISION = readFileSync(repoFile(DECISION_REL), "utf8");
const TOKEN = "D-246 BATCH b1: 24 CALLS AND 4 RESERVE CALLS AUTHORISED", C_SHA = "10f4a4b9baf9886e8f230e09b2ab4e69bfebd6795c2a1222eb84f8db3884e818";
const C_PATH = process.env.ITEM_PILOT_C_PATH, C_BUF = C_PATH && existsSync(C_PATH) ? readFileSync(C_PATH) : null;
const SHEET_ROOT = join(homedir(), "Documents", "DenSejeApp-artefacts", "d-235-independent-validation", "references", "v2");
const sheetFile = (cat) => join(SHEET_ROOT, cat, AUTH.request.references[cat].name);
const HAVE = !!C_BUF && sha256(C_BUF) === C_SHA && ["top", "bottom", "shoes"].every((c) => existsSync(sheetFile(c)) && sha256(readFileSync(sheetFile(c))) === AUTH.request.references[c].sha256);
const SKIP = HAVE ? false : "C and the v2 reference sheets are private (D-127 §2); set ITEM_PILOT_C_PATH and keep the sheets outside the clones to run the mocked sends";
const isInside = (c, p) => { const r = relative(p, c); return r === "" || (!r.startsWith("..") && !isAbsolute(r)); };
const DESIGN_IDS = PLAN.calls.map((c) => c.callId), RESERVES = ["B1-reserve-1", "B1-reserve-2", "B1-reserve-3", "B1-reserve-4"];
const argsOf = (id, forId) => ["--call-id=" + id, "--claim-identity=" + id + "-claim", ...(forId ? ["--for=" + forId] : [])], SEND = ["--send", "--owner-approval=D-246"], KEY = { OPENAI_API_KEY: "sk-d246-sandbox-dummy-key-not-a-credential" };

test("D-246 the adapter: only node built-ins and the ledger, exactly one fetch, the key once, every check before the claim; 28 calls, no export", () => {
  const imports = [...SRC.matchAll(/^import .* from "([^"]+)";/gm)].map((m) => m[1]);
  assert.deepEqual(imports.filter((m) => !m.startsWith("node:")), ["./r3-face-neutral-attempt-ledger.mjs"]);
  assert.ok(!/^export /m.test(CODE)); assert.equal([...CODE.matchAll(/\bfetch\s*\(/g)].length, 1); assert.equal([...CODE.matchAll(/process\.env\.OPENAI_API_KEY/g)].length, 1);
  const body = CODE.slice(CODE.indexOf("async function main(argv)")); let last = -1;
  for (const k of ["parseArgs(argv)", "resolveRefs()", "readOriginBlobs(", "verifyPrompts(blobs", "readC()", "verifyDecisions(", "verifyAuthorisation(", "verifyImplementation(", "readSheet(", "resolveClaimLocation(call)", "verifyOrderAndStops(", "resolveOutputs(call)", "buildBody(", "if (!args.sendMode)", "process.env.OPENAI_API" + "_KEY", "claim = createClaim(", "event(\"dispatch\"", "res = await globalThis.fetch("]) {
    const at = body.indexOf(k); assert.ok(at > last, k + " comes after the previous check"); last = at; }
  assert.match(CODE, /const MAX_CALLS = 28;/); assert.match(CODE, /const MAX_TECHNICAL_REJECTIONS = 9;/); assert.match(CODE, /const MODEL = "gpt-image-2\.5-sunburst-2026-09-08";/);
  assert.match(CODE, /const MODEL_DRAWS_KEY = Object\.freeze\(\{ top: "top", bottom: "bottoms", shoes: "shoes" \}\);/);
  for (const id of [...DESIGN_IDS, ...RESERVES]) assert.ok(SRC.includes("\"" + id + "\""), id);
});

test("D-246 the authorisation: 24 design entries in the plan's order and 4 reserves, all unspent; the plan stays unauthorised; the stop rules are the adapter's", () => {
  assert.deepEqual(AUTH, NB.buildAuthorisation(B1, PROMPTS, PLAN, { decision: "D-246", token: TOKEN, adapter: ADAPTER_REL }), "regenerated byte for byte");
  assert.deepEqual(AUTH.calls.map((c) => c.callId), [...DESIGN_IDS, ...RESERVES]); assert.ok(AUTH.calls.every((c) => c.mandateState === "UNSPENT" && c.outcome === "NOT YET ATTEMPTED"));
  assert.deepEqual([AUTH.budget.authorised, AUTH.budget.designs, AUTH.budget.reserve, AUTH.budget.retries, AUTH.budget.automaticExtension], [28, 24, 4, 0, false]);
  assert.equal(AUTH.meta.authorisesImageRequest, false); assert.equal(PLAN.budget.authorised, 0); assert.ok(PLAN.calls.every((c) => c.mandateState === "UNAUTHORISED"));
  const m = SRC.match(/const STOP_RULES = Object\.freeze\(\[([\s\S]*?)\]\);/)[1]; assert.deepEqual(JSON.parse("[" + m.trim().replace(/,\s*$/, "") + "]"), AUTH.stopRules);
  assert.deepEqual(AUTH.stopRules, NB.adapterStopRules(B1)); assert.deepEqual(AUTH.checkpoint.rules, [...NB.CHECKPOINT_RULES]); assert.deepEqual(AUTH.checkpoint.designs, B1.checkpoint);
  for (const f of ["b1-designs-v1.json", "b1-prompts-v1.json", "b1-prompts-v1.md", "b1-calls-v1.json"]) assert.equal(AUTH.frozen.files[f], sha256(readFileSync(join(NB.BATCHES, f))), f);
  assert.equal(sha256(readFileSync(repoFile(PROMPTS_REL))), SRC.match(/const PROMPTS_SHA256 = "([0-9a-f]{64})";/)[1]);
  assert.match(DECISION, new RegExp("^status: AUTHORISED — " + TOKEN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + " — ", "m"));
});

// ── sandbox: a throw-away git repository, a mocked fetch, C and the sheets copied in when they exist ─────────────────────
const ROOTS = []; after(() => { for (const r of ROOTS) if (isInside(r, realpathSync.native(tmpdir())) && /d246-sandbox-/.test(r)) rmSync(r, { recursive: true, force: true }); });
const MOCK_SRC = [
  "import { appendFileSync, readFileSync } from \"node:fs\";",
  "const LOG = process.env.D246_MOCK_LOG, PNG = process.env.D246_MOCK_PNG, BAD = process.env.D246_MOCK_BAD, MODE = process.env.D246_MOCK_MODE;",
  "if (!LOG || !PNG || !MODE) throw new Error(\"d246 mock: not configured — refusing to run\");",
  "const err = (status, code, type) => new Response(JSON.stringify({ error: { type, code, message: \"mock \" + code } }), { status, headers: { \"content-type\": \"application/json\" } });",
  "globalThis.fetch = async function d246MockFetch(url, init) {",
  "  const b = init.body; appendFileSync(LOG, JSON.stringify({ url: String(url), fields: [...b.keys()], imageNames: b.getAll(\"image[]\").map((f) => f.name), prompt: b.get(\"prompt\") }) + \"\\n\");",
  "  if (MODE === \"throw\") throw new TypeError(\"fetch failed (mock transport error)\");",
  "  if (MODE === \"moderation\") return err(400, \"moderation_blocked\", \"image_generation_user_error\");",
  "  const usage = { input_tokens: 3450, input_tokens_details: { image_tokens: 3072, text_tokens: 378 }, output_tokens: 1372, output_tokens_details: { image_tokens: 1372, text_tokens: 0 } };",
  "  return new Response(JSON.stringify({ created: 1, data: [{ b64_json: readFileSync(MODE === \"badpng\" ? BAD : PNG).toString(\"base64\") }], usage }), { status: 200, headers: { \"content-type\": \"application/json\", \"x-request-id\": \"req_mockok\" } });",
  "};"].join("\n");
const png = (w, h) => { const px = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i++) px.set([150, 150, 150, 255], i * 4); return encodePng(w, h, px); };
function envFor(sb, extra) { const env = {}; for (const k of ["PATH", "Path", "SystemRoot", "windir", "COMSPEC", "PATHEXT", "SystemDrive"]) if (typeof process.env[k] === "string") env[k] = process.env[k];
  return Object.assign(env, { LOCALAPPDATA: sb.state, XDG_STATE_HOME: sb.state, HOME: sb.home, USERPROFILE: sb.home, TEMP: sb.tmp, TMP: sb.tmp, TMPDIR: sb.tmp, HTTP_PROXY: "http://127.0.0.1:9", HTTPS_PROXY: "http://127.0.0.1:9",
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: sb.gitconfig, D246_MOCK_LOG: sb.log, D246_MOCK_PNG: sb.png, D246_MOCK_BAD: sb.bad, D246_MOCK_MODE: "ok" }, extra || {}); }
function sgit(sb, args) { const r = spawnSync("git", ["-C", sb.repo, "-c", "user.name=d246-sandbox", "-c", "user.email=sandbox@example.invalid", "-c", "core.autocrlf=false", ...args], { env: envFor(sb), encoding: "utf8", windowsHide: true }); if (r.status !== 0) throw new Error("sandbox git " + args.join(" ") + ": " + r.stderr); return r.stdout.trim(); }
function sandbox({ base, withC = true } = {}) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "d246-sandbox-"))); ROOTS.push(root);
  const sb = { root, repo: join(root, "repo"), state: join(root, "state"), tmp: join(root, "tmp"), home: join(root, "home"), log: join(root, "fetch.log"), gitconfig: join(root, "gitconfig"), png: join(root, "out.png"), bad: join(root, "bad.png"), mock: join(root, "mock.mjs") };
  sb.claimDir = join(sb.state, "DenSejeApp", "one-shot-claims", "Moeller888-den-seje-app-frontend"); sb.out = join(sb.home, "Documents", "DenSejeApp-artefacts", "b1-batch");
  for (const d of [sb.repo, sb.state, sb.tmp, sb.home]) mkdirSync(d, { recursive: true });
  writeFileSync(sb.gitconfig, "[core]\n\tautocrlf = false\n[init]\n\tdefaultBranch = main\n"); writeFileSync(sb.mock, MOCK_SRC); writeFileSync(sb.log, ""); writeFileSync(sb.png, png(1024, 1536)); writeFileSync(sb.bad, png(512, 512));
  if (withC && C_BUF) { const cd = join(sb.home, "Documents", "DenSejeApp-artefacts", "d-202-northstar-base-figure"); mkdirSync(cd, { recursive: true }); writeFileSync(join(cd, "d202-base-figure-v2.image-1.png"), C_BUF);
    for (const cat of ["top", "bottom", "shoes"]) { const d = join(sb.home, "Documents", "DenSejeApp-artefacts", "d-235-independent-validation", "references", "v2", cat); mkdirSync(d, { recursive: true }); copyFileSync(sheetFile(cat), join(d, AUTH.request.references[cat].name)); } }
  for (const rel of [...TRACKED, ".gitignore"]) { const dst = join(sb.repo, ...rel.split("/")); mkdirSync(dirname(dst), { recursive: true }); copyFileSync(repoFile(rel), dst); }
  if (base) base(sb);
  sgit(sb, ["init", "-q", "-b", "main"]); sgit(sb, ["add", "-A"]); sgit(sb, ["commit", "-q", "-m", "base"]); sgit(sb, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  return sb; }
const run = (sb, args, extra) => { const r = spawnSync(process.execPath, ["--import", pathToFileURL(sb.mock).href, join(sb.repo, ...ADAPTER_REL.split("/")), ...args], { cwd: sb.repo, env: envFor(sb, extra), encoding: "utf8", windowsHide: true, timeout: 180000 }); return { status: r.status, out: (r.stdout || "") + (r.stderr || "") }; };
const fetchLog = (sb) => readFileSync(sb.log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
function refused(sb, r, stage, sends = 0, why) { assert.equal(r.status, 1, r.out); assert.match(r.out, new RegExp("REFUSED \\[" + stage + "\\]"), r.out); if (why) assert.match(r.out, why); assert.equal(fetchLog(sb).length, sends); }
const itemOf = (id) => PLAN.calls.find((c) => c.callId === id).item;
const record = (sb, id, item, extra) => writeFileSync(join(sb.out, id, "b1.pipeline.json"), JSON.stringify({ callId: id, item: item || itemOf(id), method: "d240", ok: true, faultClass: null, faults: {}, g1: false, ...(extra || {}) }));
const checkpoint = (sb, verdict, failing) => writeFileSync(join(sb.out, "B1-CHECKPOINT.json"), JSON.stringify({ batch: "b1", verdict, calls: B1.checkpoint, rules: Object.fromEntries(["C1", "C2", "C3", "C4", "C5"].map((r) => [r, { pass: r !== failing }])) }));
// a sandbox adapter whose prompt pin is moved to a mutated prompts file — to reach the re-composition and validation behind the pin
const repin = (sb, mutate) => { const pf = join(sb.repo, ...PROMPTS_REL.split("/")), p = JSON.parse(readFileSync(pf, "utf8")); mutate(p);
  for (const it of Object.values(p.items)) it.sha256 = sha256(Buffer.from(it.prompt, "utf8")); const buf = JSON.stringify(p, null, 2) + "\n"; writeFileSync(pf, buf);
  const af = join(sb.repo, ...ADAPTER_REL.split("/")); writeFileSync(af, readFileSync(af, "utf8").replace(/const PROMPTS_SHA256 = "[0-9a-f]{64}";/, "const PROMPTS_SHA256 = \"" + sha256(Buffer.from(buf)) + "\";")); };

test("D-246 every one of the 24 frozen prompts passes the adapter's re-composition and validation (a sandbox without C stops at C)", () => {
  const sb = sandbox({ withC: false });
  for (const id of DESIGN_IDS) { const r = run(sb, argsOf(id)); refused(sb, r, "reference-c", 0); assert.match(r.out, /prompt\s+: re-composed from the origin\/main parts and validated/, id); }
  refused(sb, run(sb, argsOf("B1-reserve-1")), "arguments", 0, /--for=/);
  refused(sb, run(sb, argsOf(DESIGN_IDS[0], DESIGN_IDS[1])), "arguments", 0, /--for is only for a reserve call/);
  refused(sb, run(sb, ["--call-id=D-235-new-N1", "--claim-identity=D-235-new-N1-claim"]), "arguments");
});

test("D-246 a defective prompt is refused before any claim: \"undefined\" for the instruction, another category's instruction, a misspelled lookup, an edited prompt", () => {
  const P = NB.frozenParts(), jeans = "bottom-jeans-straight-indigo", jeansCall = "B1-" + jeans;
  const und = sandbox({ withC: false, base: (sb) => repin(sb, (p) => { p.items[jeans].prompt = p.items[jeans].prompt.replace(P.C.modelDraws.bottoms, "undefined"); }) });
  refused(und, run(und, argsOf(jeansCall)), "prompt", 0, /not the prompt re-composed[\s\S]*unresolved or missing part: "undefined"/);
  const other = sandbox({ withC: false, base: (sb) => repin(sb, (p) => { p.items[jeans].prompt += " " + P.C.modelDraws.top; }) });
  refused(other, run(other, argsOf(jeansCall)), "prompt", 0, /holds the top contract instruction/);
  const key = sandbox({ withC: false, base: (sb) => { const cf = join(sb.repo, ...(FX + "seam-contract-v2.json").split("/")), c = JSON.parse(readFileSync(cf, "utf8")); c.modelDraws.bottom = c.modelDraws.bottoms; delete c.modelDraws.bottoms; const buf = JSON.stringify(c, null, 2) + "\n"; writeFileSync(cf, buf);
    const af = join(sb.repo, ...ADAPTER_REL.split("/")); writeFileSync(af, readFileSync(af, "utf8").replace(/const CONTRACT_SHA256 = "[0-9a-f]{64}";/, "const CONTRACT_SHA256 = \"" + sha256(Buffer.from(buf)) + "\";")); } });
  refused(key, run(key, argsOf(jeansCall)), "prompt", 0, /prompt part missing: modelDraws\["bottoms"\]/);
  const edited = sandbox({ withC: false, base: (sb) => { const pf = join(sb.repo, ...PROMPTS_REL.split("/")); writeFileSync(pf, readFileSync(pf, "utf8").replace("navy-blue", "navy blue")); } });
  refused(edited, run(edited, argsOf("B1-top-polo-navy")), "prompt", 0, /expected the frozen/);
});

test("D-246 with C: the first dry run passes; one send; the next call needs the picture's pipeline record; never twice", { skip: SKIP }, () => {
  const sb = sandbox(), [c1, c2] = DESIGN_IDS;
  const d1 = run(sb, argsOf(c1)); assert.equal(d1.status, 0, d1.out); assert.match(d1.out, /DRY RUN PASSED/); refused(sb, run(sb, argsOf(c2)), "stopped", 0, /order/);
  assert.equal(run(sb, [...argsOf(c1), ...SEND], KEY).status, 0); const L = fetchLog(sb); assert.equal(L.length, 1);
  assert.deepEqual(L[0].imageNames, ["d202-base-figure-v2.image-1.png", "seam-reference-top.png"]); assert.equal(L[0].prompt, PROMPTS.items[itemOf(c1)].prompt);
  refused(sb, run(sb, argsOf(c2)), "stopped", 1, /no valid pipeline record/); record(sb, c1);
  assert.equal(run(sb, argsOf(c2)).status, 0); assert.equal(run(sb, [...argsOf(c1), ...SEND], KEY).status, 1); assert.equal(fetchLog(sb).length, 1, "never twice");
});

test("D-246 with C: no call after the six checkpoint calls without a CONTINUE verdict with C1–C5 passed", { skip: SKIP }, () => {
  const sb = sandbox(); for (const id of DESIGN_IDS.slice(0, 6)) { assert.equal(run(sb, [...argsOf(id), ...SEND], KEY).status, 0, id); record(sb, id); }
  refused(sb, run(sb, argsOf(DESIGN_IDS[6])), "stopped", 6, /B1-CHECKPOINT\.json is missing/);
  checkpoint(sb, "STOP", "C2"); refused(sb, run(sb, argsOf(DESIGN_IDS[6])), "stopped", 6, /verdict is "STOP"[\s\S]*C2 did not pass/);
  rmSync(join(sb.out, "B1-CHECKPOINT.json")); checkpoint(sb, "CONTINUE"); assert.equal(run(sb, argsOf(DESIGN_IDS[6])).status, 0);
});

test("D-246 with C: a reserve only resends a format failure, a moderation block or a G-1 — once; never a received picture or an uncertain dispatch; the second of a kind stops", { skip: SKIP }, () => {
  const [c1, c2, c3] = DESIGN_IDS;
  const mod = sandbox(); assert.equal(run(mod, [...argsOf(c1), ...SEND], { ...KEY, D246_MOCK_MODE: "moderation" }).status, 3);
  assert.equal(run(mod, argsOf("B1-reserve-1", c1)).status, 0, "a first moderation block may be resent");
  assert.equal(run(mod, [...argsOf("B1-reserve-1", c1), ...SEND], KEY).status, 0); record(mod, "B1-reserve-1", itemOf(c1));
  refused(mod, run(mod, argsOf("B1-reserve-2", c1)), "stopped", 2, /already resent by B1-reserve-1/);
  assert.equal(run(mod, [...argsOf(c2), ...SEND], { ...KEY, D246_MOCK_MODE: "moderation" }).status, 3); refused(mod, run(mod, argsOf(c3)), "stopped", 3, /2 calls were blocked by moderation/);
  const ok = sandbox(); assert.equal(run(ok, [...argsOf(c1), ...SEND], KEY).status, 0); record(ok, c1); refused(ok, run(ok, argsOf("B1-reserve-1", c1)), "stopped", 1, /ended RECEIVED_FOR_BF_CHECK/);
  const fmt = sandbox(); assert.equal(run(fmt, [...argsOf(c1), ...SEND], { ...KEY, D246_MOCK_MODE: "badpng" }).status, 0); assert.equal(run(fmt, argsOf("B1-reserve-1", c1)).status, 0, "a first format failure may be resent");
  assert.equal(run(fmt, [...argsOf(c2), ...SEND], { ...KEY, D246_MOCK_MODE: "badpng" }).status, 0); refused(fmt, run(fmt, argsOf(c3)), "stopped", 2, /2 received pictures are not 1024x1536/);
  const g = sandbox(); assert.equal(run(g, [...argsOf(c1), ...SEND], KEY).status, 0); record(g, c1, null, { ok: false, faultClass: "generation", g1: true }); assert.equal(run(g, argsOf("B1-reserve-1", c1)).status, 0, "a G-1 may be resent");
  const un = sandbox(); assert.equal(run(un, [...argsOf(c1), ...SEND], { ...KEY, D246_MOCK_MODE: "throw" }).status, 3); refused(un, run(un, argsOf("B1-reserve-1", c1)), "stopped", 1, /uncertain dispatch[\s\S]*never resent/); refused(un, run(un, argsOf(c2)), "stopped", 1, /uncertain dispatch/);
});

test("D-246 with C: 9 technical rejections stop; the stop file stops; 28 claims are the hard cap", { skip: SKIP }, () => {
  const sb = sandbox(); for (const id of DESIGN_IDS.slice(0, 6)) { assert.equal(run(sb, [...argsOf(id), ...SEND], KEY).status, 0, id); record(sb, id, null, { ok: false, faultClass: "fit" }); }
  checkpoint(sb, "CONTINUE"); for (const id of DESIGN_IDS.slice(6, 9)) { assert.equal(run(sb, [...argsOf(id), ...SEND], KEY).status, 0, id); record(sb, id, null, { ok: false, faultClass: "fit" }); }
  refused(sb, run(sb, argsOf(DESIGN_IDS[9])), "stopped", 9, /9 of the pipeline records/);
  const st = sandbox(); writeFileSync(join(mkdirSync(st.out, { recursive: true }) || st.out, "B1-STOP.json"), "{\"reason\":\"reference marks in two pictures\"}"); refused(st, run(st, argsOf(DESIGN_IDS[0])), "stopped", 0, /B1-STOP\.json exists/);
  // the cap is the 28 ids themselves: once all are claimed, every one is refused, and no 29th id exists
  const cap = sandbox(); mkdirSync(cap.claimDir, { recursive: true }); for (const id of [...DESIGN_IDS, ...RESERVES]) writeFileSync(join(cap.claimDir, id + ".claim.json"), "{}");
  for (const id of [DESIGN_IDS[0], DESIGN_IDS[23], "B1-reserve-4"]) refused(cap, run(cap, argsOf(id, id.includes("reserve") ? DESIGN_IDS[0] : null)), "claim-exists", 0, /already spent/);
  refused(cap, run(cap, ["--call-id=B1-reserve-5", "--claim-identity=B1-reserve-5-claim", "--for=" + DESIGN_IDS[0]]), "arguments", 0, /24 design call ids or 4 reserve ids/);
});

test("D-246 the checkpoint verdict: C1–C5 computed from records, the run, usage and the receipt check; any failure or a missing call is STOP", () => {
  const cp = B1.checkpoint, okRec = (id) => ({ callId: "B1-" + id, item: id, ok: true, faultClass: null, g1: false });
  const outfits = {}; const tops = ["top-tee-hip-cream", ...cp.filter((x) => x.startsWith("top-"))], bots = ["bottom-shorts-navy", ...cp.filter((x) => x.startsWith("bottom-"))], shoes = ["shoes-sneakers-white", ...cp.filter((x) => x.startsWith("shoes-"))];
  for (const t of tops) for (const b of bots) for (const s of shoes) outfits[[t, b, s].join("+")] = { status: "technically-ok" };
  const run = { items: Object.fromEntries(cp.map((id) => [id, { seamContract: { failed: [] } }])), package: { outfits } };
  const u = { input_tokens_details: { image_tokens: 3072, text_tokens: 400 }, output_tokens_details: { image_tokens: 1372 } };
  const base = () => ({ outcomes: Object.fromEntries(cp.map((id) => [id, "RECEIVED_FOR_BF_CHECK"])), records: Object.fromEntries(cp.map((id) => [id, okRec(id)])), run: JSON.parse(JSON.stringify(run)), usage: cp.map(() => u), marks: [] });
  const ok = NB.evaluateCheckpoint(B1, base(), PLAN); assert.equal(ok.verdict, "CONTINUE"); assert.ok(Object.values(ok.rules).every((r) => r.pass));
  const c1 = base(); c1.records[cp[0]] = { ...okRec(cp[0]), ok: false, faultClass: "extraction" }; c1.records[cp[3]] = { ...okRec(cp[3]), ok: false, faultClass: "extraction" }; assert.equal(NB.evaluateCheckpoint(B1, c1, PLAN).rules.C1.pass, false, "two of one class");
  const c2 = base(); c2.run.items["bottom-jeans-straight-indigo"].seamContract.failed = [{ id: "SC-L1-HEM-BAND" }]; const v2 = NB.evaluateCheckpoint(B1, c2, PLAN); assert.equal(v2.rules.C2.pass, false); assert.equal(v2.verdict, "STOP");
  const c2b = base(); c2b.run.items["bottom-pleated-skirt-tartan"].seamContract.failed = [{ id: "SC-W1-TOP-HEM-STATION" }]; assert.equal(NB.evaluateCheckpoint(B1, c2b, PLAN).rules.C2.pass, true, "a rule the bottoms instruction does not name");
  const c3 = base(); c3.marks = [cp[0], cp[1]]; assert.equal(NB.evaluateCheckpoint(B1, c3, PLAN).rules.C3.pass, false);
  const c4 = base(); for (const n of Object.keys(c4.run.package.outfits)) if (n.includes(cp[1])) c4.run.package.outfits[n].status = "rejected"; for (const n of Object.keys(c4.run.package.outfits)) if (n.includes(cp[4])) c4.run.package.outfits[n].status = "rejected";
  assert.equal(NB.evaluateCheckpoint(B1, c4, PLAN).rules.C4.pass, false);
  const c5 = base(); c5.usage = cp.map(() => ({ input_tokens_details: { image_tokens: 9000, text_tokens: 400 }, output_tokens_details: { image_tokens: 4000 } })); assert.equal(NB.evaluateCheckpoint(B1, c5, PLAN).rules.C5.pass, false);
  const miss = base(); delete miss.outcomes[cp[5]]; delete miss.records[cp[5]]; const vm = NB.evaluateCheckpoint(B1, miss, PLAN); assert.equal(vm.complete, false); assert.equal(vm.verdict, "STOP");
});

test("D-246 the pipeline record: from the item pipeline's report — ok, fault class, G-1; refuses another item's report", () => {
  const rep = { item: "top-polo-navy", method: "d240", ok: false, faults: { generation: ["G-1 registration: …"], extraction: [], fit: [] }, registration: { ok: false }, raw: { sha256: "x" } };
  assert.deepEqual(NB.pipelineRecord("B1-top-polo-navy", "top-polo-navy", rep), { callId: "B1-top-polo-navy", item: "top-polo-navy", method: "d240", ok: false, faultClass: "generation", faults: rep.faults, g1: true, rawSha256: "x" });
  assert.equal(NB.pipelineRecord("B1-x", "top-polo-navy", { ...rep, ok: true, faults: { generation: [], extraction: [], fit: [] }, registration: { ok: true } }).faultClass, null);
  assert.throws(() => NB.pipelineRecord("B1-x", "top-flannel-check", rep), /the report is not top-flannel-check's/);
});
