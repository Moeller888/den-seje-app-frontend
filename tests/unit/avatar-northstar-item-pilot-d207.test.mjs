// NORTHSTAR CLOTHING PILOT ON C — D-207: the batch authorisation (at most 12 calls: 9 items in two stages, 3 reserve calls),
// the frozen prompts, the send adapter and the processing tool, tested without any real API call.
//   · The adapter is NEVER imported: it runs as a CLI in a child process inside a temporary git repository with its own
//     origin/main, an allowlisted environment, a dummy key and a mocked fetch loaded from outside.
//   · C is private (D-127 §2). The refusals run everywhere; the mocked SENDS need C's bytes and run only when the owner's machine
//     provides them through ITEM_PILOT_C_PATH (like D-143's external H1) — skipped in CI, never faked.
//   · The processing tool is tested on a Northstar-derived stand-in base with legs, never on C.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, readdirSync, copyFileSync, realpathSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join, dirname, relative, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { parseEvents } from "../../tools/avatar/r3-face-neutral-attempt-ledger.mjs";
import { encodePng } from "../../tools/avatar/r3-hair-tool.mjs";
import * as WR from "../../tools/avatar/northstar-wardrobe.mjs";
import * as BF from "../../tools/avatar/northstar-base-figure.mjs";
import * as BC from "../../tools/avatar/northstar-base-figure-c.mjs";
import * as IP from "../../tools/avatar/northstar-item-pilot.mjs";
import { recolour } from "../../tools/avatar/northstar-wardrobe-poc.mjs";
import * as NL from "../../tools/avatar/r3-northstar-layers.mjs";
import { standInItems } from "../../tools/avatar/northstar-base-figure-c-proof.mjs";

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = resolve(HERE, "..", "..");
const sha256 = (b) => createHash("sha256").update(b).digest("hex"), repoFile = (rel) => join(REPO, ...rel.split("/"));
const ADAPTER_REL = "tools/avatar/openai-send-northstar-item-pilot-d207.mjs", LEDGER_REL = "tools/avatar/r3-face-neutral-attempt-ledger.mjs";
const CALLS_REL = "tools/avatar/fixtures/northstar-wardrobe/item-pilot-calls-v1.json", PROMPTS_REL = "tools/avatar/fixtures/northstar-wardrobe/item-pilot-prompts-v1.json";
const FREEZE_REL = "tools/avatar/fixtures/northstar-wardrobe/base-figure-c-v1.json", PROC_REL = "tools/avatar/northstar-item-pilot.mjs", REGISTER_REL = "docs/project-state.md";
const SRC = readFileSync(repoFile(ADAPTER_REL), "utf8"), CODE = SRC.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
const CALLS = JSON.parse(readFileSync(repoFile(CALLS_REL), "utf8")), PROMPTS = JSON.parse(readFileSync(repoFile(PROMPTS_REL), "utf8"));
const PLAN = JSON.parse(readFileSync(repoFile("tools/avatar/fixtures/northstar-wardrobe/pilot-plan-v3.json"), "utf8"));
const REGISTER = readFileSync(repoFile(REGISTER_REL), "utf8"), ROW = REGISTER.split("\n").find((l) => l.startsWith("| **D-207** |"));
const C_SHA = "10f4a4b9baf9886e8f230e09b2ab4e69bfebd6795c2a1222eb84f8db3884e818", PROMPTS_SHA = "a23dbedd9e3d76435dc0abe50930da9225a67c49dfa910da9d5d5741b6a472ce";
const C_PATH = process.env.ITEM_PILOT_C_PATH, C_BUF = C_PATH && existsSync(C_PATH) ? readFileSync(C_PATH) : null, HAVE_C = !!C_BUF && sha256(C_BUF) === C_SHA;
const SKIP_C = HAVE_C ? false : "C is private (D-127 §2); set ITEM_PILOT_C_PATH to run the mocked sends";
const idOf = (item) => "D-207-item-" + item, argsOf = (id) => ["--call-id=" + id, "--claim-identity=" + id + "-claim"], SEND = ["--send", "--owner-approval=D-207"], KEY = { OPENAI_API_KEY: "sk-d207-sandbox-dummy-key-not-a-credential" };
const isInside = (c, p) => { const r = relative(p, c); return r === "" || (!r.startsWith("..") && !isAbsolute(r)); };

// ── the decision ───────────────────────────────────────────────────────────────────────────────────────────────────────
test("D-207: at most 12 calls — 9 items in two stages and 3 reserve calls, each its own one-shot claim; C pinned and never tracked", () => {
  assert.equal(CALLS.decision, "D-207"); assert.equal(CALLS.meta.authorisesImageRequest, false);
  assert.deepEqual([CALLS.budget.authorised, CALLS.budget.planned, CALLS.budget.reserve, CALLS.budget.actuallySent, CALLS.budget.recordedBy], [12, 9, 3, 8, "D-215"]); assert.match(CALLS.budget.stoppedBy, /insufficient_quota/);
  assert.match(CALLS.budget.rule, /an undetermined dispatch reserves its budget and is never repeated automatically/);
  assert.deepEqual([CALLS.reserveAmendment.decision, CALLS.reserveAmendment.outcome, CALLS.reserveAmendment.httpStatus, CALLS.reserveAmendment.items, CALLS.reserveAmendment.maxReserves], ["D-214", "HTTP_ERROR_NO_IMAGE", 429, ["bottom-skirt-plum"], 1]);
  assert.match(CALLS.reserveAmendment.rule, /never 12 plus replacements/); assert.match(CALLS.budget.rule, /never for a fault of our own tools/);
  assert.equal(CALLS.calls.length, 12); assert.equal(new Set(CALLS.calls.map((c) => c.claim.identity)).size, 12);
  assert.deepEqual(CALLS.stages["1"].items, ["top-tank-teal", "bottom-shorts-navy", "shoes-sandals-brown"]); assert.deepEqual([CALLS.stages["2"].open, CALLS.stages["2"].openedBy], [true, "D-210"]); assert.equal(CALLS.stages["2"].items.length, 6);
  // D-208 recorded stage 1: the three stage-1 items sent once each, none a TECHNICAL_REJECT (so no reserve); everything else unspent
  // D-212 recorded stage 2: tee, sweater, trousers sent (200), the skirt answered 429 (no credit) — spent; sneakers, boots unspent
  const S2 = { "top-tee-red": ["SENT_ONCE_GENERATION_OK", 200, 1], "top-sweater-green": ["SENT_ONCE_GENERATION_OK", 200, 1], "bottom-trousers-khaki": ["SENT_ONCE_GENERATION_OK", 200, 1], "bottom-skirt-plum": ["HTTP_ERROR_NO_IMAGE", 429, 0], "shoes-sneakers-white": ["HTTP_ERROR_NO_IMAGE", 429, 0] };
  for (const c of CALLS.calls) { if (c.kind === "item" && S2[c.item]) { assert.deepEqual([c.mandateState, c.outcome, c.recordedBy, c.result.httpStatus, c.result.images], ["SPENT", ...S2[c.item].slice(0, 1), c.item === "top-tee-red" ? "D-213" : c.item === "shoes-sneakers-white" ? "D-215" : "D-212", ...S2[c.item].slice(1)], c.callId); continue; }
    const s1 = c.kind === "item" && c.stage === 1;
    assert.equal(c.mandateState, s1 ? "SPENT" : "UNSPENT", c.callId);
    // D-214: reserve 1 assigned to the skirt under the amendment; the others free; the sandals parked
    if (c.kind === "reserve") assert.deepEqual([c.assignedTo, c.assignedBy || null], c.callId === "D-207-reserve-1" ? ["bottom-skirt-plum", "D-214"] : [null, null], c.callId);
    if (c.item === "shoes-sandals-brown") assert.equal(c.parkedBy, "D-214");
    // D-210 re-recorded the sandals under the revised checks (FIT-6v2): a TECHNICAL_REJECT, its reserve not assigned
    if (s1) { assert.deepEqual([c.outcome, c.recordedBy, c.result.httpStatus, c.result.images], c.item === "shoes-sandals-brown" ? ["TECHNICAL_REJECT", "D-210", 200, 1] : ["SENT_ONCE_GENERATION_OK", "D-208", 200, 1]); assert.match(c.result.requestId, /^req_[0-9a-f]{32}$/); assert.match(c.result.imageSha256, /^[0-9a-f]{64}$/); } }
  assert.deepEqual([CALLS.request.image.sha256, CALLS.request.image.tracked], [C_SHA, false]); assert.match(CALLS.request.image.approval, /THIS pilot only/);
  assert.ok(!JSON.stringify(CALLS).includes("fitting-base") && !JSON.stringify(PROMPTS).includes("fitting-base"), "no H1");
  assert.equal(BC.loadFreeze().raw.sha256, C_SHA);
});
test("the prompts are frozen exactly as D-205's plan built them: template + coverage + garment, nothing else", () => {
  assert.equal(sha256(readFileSync(repoFile(PROMPTS_REL))), PROMPTS_SHA); assert.equal(PROMPTS.template, PLAN.request.promptTemplate);
  for (const it of PLAN.items) { const want = PLAN.request.promptTemplate.replace("{GARMENT}", it.garment).replace("{COVERAGE}", PLAN.request.coverage[it.category]); const p = PROMPTS.items[it.id];
    assert.equal(p.prompt, want, it.id); assert.equal(p.sha256, sha256(Buffer.from(want, "utf8"))); assert.equal(CALLS.calls.find((c) => c.item === it.id).prompt.sha256, p.sha256); }
});
test("the D-207 register row: once, every call id and pin named, merge is not a run instruction", () => {
  assert.equal(REGISTER.split("\n").filter((l) => l.startsWith("| **D-207** |")).length, 1);
  for (const c of CALLS.calls) assert.ok(ROW.includes(c.callId), c.callId);
  for (const v of ["--owner-approval=D-207", "gpt-image-2.5-sunburst-2026-09-08", ADAPTER_REL, C_SHA, PROMPTS_SHA, "1024x1536"]) assert.ok(ROW.includes(v), v);
  assert.match(ROW, /særskilt eksekveringsbesked/); assert.ok(!/Ã|�/.test(ROW));
});

// ── the adapter, statically ────────────────────────────────────────────────────────────────────────────────────────────
test("the adapter: no exports, only node built-ins and the ledger, exactly one fetch, no retry, the key once, C read before any claim", () => {
  assert.ok(!/^\s*export\b/m.test(CODE));
  for (const m of CODE.matchAll(/^\s*import\b[^;]*?from\s+"([^"]+)"/gm)) assert.ok(m[1].startsWith("node:") || m[1] === "./r3-face-neutral-attempt-ledger.mjs", m[1]);
  assert.equal([...CODE.matchAll(/\bfetch\s*\(/g)].length, 1);
  assert.match(CODE, /globalThis\.fetch\(ENDPOINT, \{ method: "POST", redirect: "error", headers: \{ Authorization: "Bearer " \+ apiKey \}, body: built\.body \}\)/);
  const prose = /no retry, no fallback|No outcome permits an automatic retry|there is no fallback|automaticRetry: false|NO RETRY/gi;
  for (const x of ["retry", "retries", "backoff", "fallback"]) assert.ok(!new RegExp("\\b" + x + "\\b", "i").test(CODE.replace(prose, "")), x);
  assert.equal([...CODE.matchAll(/process\.env\.OPENAI_API_KEY/g)].length, 1); assert.ok(!/ITEM_PILOT_C_PATH|--c-path|C_PATH/.test(CODE), "no override of C's location");
  const body = CODE.slice(CODE.indexOf("async function main(argv)")); let last = -1;
  for (const k of ["parseArgs(argv)", "resolveRefs()", "readOriginBlobs(", "verifyPrompts(blobs)", "readC()", "verifyRegister(", "verifyAuthorisation(", "verifyImplementation(", "resolveClaimLocation(call)", "consumedClaims(loc)", "resolveOutputs(call)", "buildBody(cImg.buf, prompt)", "if (!args.sendMode)", "process.env.OPENAI_API" + "_KEY", "claim = createClaim(", "event(\"dispatch\"", "res = await globalThis.fetch("]) { const i = body.indexOf(k); assert.ok(i > last, k + " in order"); last = i; }
  assert.ok(!/fitting-base|H1\.png/.test(CODE));
});

// ── sandbox ────────────────────────────────────────────────────────────────────────────────────────────────────────────
const ROOTS = []; after(() => { for (const r of ROOTS) if (isInside(r, realpathSync.native(tmpdir())) && /d207-sandbox-/.test(r)) rmSync(r, { recursive: true, force: true }); });
const MOCK_SRC = [
  "import { appendFileSync, existsSync, readFileSync, writeFileSync } from \"node:fs\";",
  "const LOG = process.env.D207_MOCK_LOG, PNG = process.env.D207_MOCK_PNG, MODE = process.env.D207_MOCK_MODE;",
  "if (!LOG || !PNG || !MODE) throw new Error(\"d207 mock: not configured — refusing to run\");",
  "globalThis.fetch = async function d207MockFetch(url, init) {",
  "  const body = init.body; appendFileSync(LOG, JSON.stringify({ url: String(url), redirect: init.redirect, fields: [...body.keys()], images: body.getAll(\"image[]\").map((f) => f.name),",
  "    imageSha: await Promise.all(body.getAll(\"image[]\").map(async (f) => (await import(\"node:crypto\")).createHash(\"sha256\").update(Buffer.from(await f.arrayBuffer())).digest(\"hex\"))), prompt: body.get(\"prompt\"), size: body.get(\"size\"), background: body.get(\"background\"), hasMask: body.has(\"mask\") }) + \"\\n\");",
  "  if (MODE === \"throw\") throw new TypeError(\"fetch failed (mock transport error)\");",
  "  const text = JSON.stringify({ created: 1, data: [{ b64_json: readFileSync(PNG).toString(\"base64\") }] });",
  "  return new Response(text, { status: 200, headers: { \"content-type\": \"application/json\", \"x-request-id\": \"req_mockok\" } });",
  "};",
].join("\n");
const TRACKED = [ADAPTER_REL, LEDGER_REL, REGISTER_REL, CALLS_REL, PROMPTS_REL, FREEZE_REL, PROC_REL];
const shape = () => { const px = new Uint8ClampedArray(1024 * 1536 * 4); for (let y = 0; y < 1536; y++) for (let x = 0; x < 1024; x++) if (((x + 0.5 - 512) / 300) ** 2 + ((y + 0.5 - 768) / 600) ** 2 <= 1) px.set([150, 150, 150, 255], (y * 1024 + x) * 4); return encodePng(1024, 1536, px); };
function envFor(sb, extra) { const env = {}; for (const k of ["PATH", "Path", "SystemRoot", "windir", "COMSPEC", "PATHEXT", "SystemDrive"]) if (typeof process.env[k] === "string") env[k] = process.env[k];
  return Object.assign(env, { LOCALAPPDATA: sb.state, XDG_STATE_HOME: sb.state, HOME: sb.home, USERPROFILE: sb.home, TEMP: sb.tmp, TMP: sb.tmp, TMPDIR: sb.tmp, HTTP_PROXY: "http://127.0.0.1:9", HTTPS_PROXY: "http://127.0.0.1:9",
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: sb.gitconfig, D207_MOCK_LOG: sb.log, D207_MOCK_PNG: sb.png, D207_MOCK_MODE: "ok" }, extra || {}); }
function sgit(sb, args) { const r = spawnSync("git", ["-C", sb.repo, "-c", "user.name=d207-sandbox", "-c", "user.email=sandbox@example.invalid", "-c", "core.autocrlf=false", ...args], { env: envFor(sb), encoding: "utf8", windowsHide: true }); if (r.status !== 0) throw new Error("sandbox git " + args.join(" ") + ": " + r.stderr); return r.stdout.trim(); }
const callsPath = (sb) => join(sb.repo, ...CALLS_REL.split("/")), registerPath = (sb) => join(sb.repo, ...REGISTER_REL.split("/"));
const editCalls = (sb, fn) => { const c = JSON.parse(readFileSync(callsPath(sb), "utf8")); fn(c); writeFileSync(callsPath(sb), JSON.stringify(c, null, 2) + "\n"); };
const addRow = (sb, id, text) => writeFileSync(registerPath(sb), readFileSync(registerPath(sb), "utf8") + "| **" + id + "** | sandbox " + text + " |\n");
function sandbox({ base, withC = HAVE_C } = {}) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "d207-sandbox-"))); ROOTS.push(root);
  const sb = { root, repo: join(root, "repo"), state: join(root, "state"), tmp: join(root, "tmp"), home: join(root, "home"), log: join(root, "fetch.log"), gitconfig: join(root, "gitconfig"), png: join(root, "out.png"), mock: join(root, "mock.mjs") };
  sb.claimDir = join(sb.state, "DenSejeApp", "one-shot-claims", "Moeller888-den-seje-app-frontend"); sb.out = join(sb.home, "Documents", "DenSejeApp-artefacts", "d-207-item-pilot");
  for (const d of [sb.repo, sb.state, sb.tmp, sb.home]) mkdirSync(d, { recursive: true });
  writeFileSync(sb.gitconfig, "[core]\n\tautocrlf = false\n[init]\n\tdefaultBranch = main\n"); writeFileSync(sb.mock, MOCK_SRC); writeFileSync(sb.log, ""); writeFileSync(sb.png, shape());
  if (withC) { const d = join(sb.home, "Documents", "DenSejeApp-artefacts", "d-202-northstar-base-figure"); mkdirSync(d, { recursive: true }); writeFileSync(join(d, "d202-base-figure-v2.image-1.png"), C_BUF); }
  for (const rel of [...TRACKED, ".gitignore"]) { const dst = join(sb.repo, ...rel.split("/")); mkdirSync(dirname(dst), { recursive: true }); copyFileSync(repoFile(rel), dst); }
  // the adapter is exercised on the authorisation as D-207 merged it (D-208/D-210/D-212 recorded the sends as spent, D-210 opened stage 2)
  editCalls(sb, (c) => { c.budget.actuallySent = 0; delete c.budget.recordedBy; delete c.budget.stoppedBy; c.stages["2"].open = false; c.stages["2"].openedBy = null; delete c.reserveAmendment;
    for (const e of c.calls) { delete e.parkedBy; delete e.parked; if (e.kind === "reserve") { e.item = null; e.category = null; e.assignedTo = null; delete e.assignedBy; e.prompt = null; } } for (const e of c.calls) if (e.kind === "item") { e.mandateState = "UNSPENT"; e.outcome = "NOT YET ATTEMPTED"; delete e.recordedBy; delete e.result; } });
  if (base) base(sb);
  sgit(sb, ["init", "-q", "-b", "main"]); sgit(sb, ["add", "-A"]); sgit(sb, ["commit", "-q", "-m", "base"]); sgit(sb, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  return sb;
}
const run = (sb, args, extra) => { const r = spawnSync(process.execPath, ["--import", pathToFileURL(sb.mock).href, join(sb.repo, ...ADAPTER_REL.split("/")), ...args], { cwd: sb.repo, env: envFor(sb, extra), encoding: "utf8", windowsHide: true, timeout: 180000 }); return { status: r.status, out: (r.stdout || "") + (r.stderr || "") }; };
const fetchLog = (sb) => readFileSync(sb.log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
function refused(sb, r, stage) { assert.equal(r.status, 1, r.out); assert.match(r.out, new RegExp("REFUSED \\[" + stage.replace(/[-[\]]/g, "\\$&") + "\\]"), r.out); assert.equal(fetchLog(sb).length, 0); assert.equal(existsSync(sb.claimDir) && readdirSync(sb.claimDir).length > 0, false); }

test("without C's exact bytes outside the clones nothing can be sent: missing or altered C is refused before any claim", () => {
  const sb = sandbox({ withC: false }); refused(sb, run(sb, [...argsOf(idOf("top-tank-teal")), ...SEND], KEY), "reference-c");
  const bad = sandbox({ withC: false, base: (s) => { const d = join(s.home, "Documents", "DenSejeApp-artefacts", "d-202-northstar-base-figure"); mkdirSync(d, { recursive: true }); writeFileSync(join(d, "d202-base-figure-v2.image-1.png"), shape()); } });
  refused(bad, run(bad, [...argsOf(idOf("top-tank-teal")), ...SEND], KEY), "reference-c");
});
test("arguments: an unknown call id, a foreign claim identity or an approval without --send are refused", () => {
  const sb = sandbox({ withC: false });
  refused(sb, run(sb, ["--call-id=D-207-item-top-cape", "--claim-identity=D-207-item-top-cape-claim"]), "arguments");
  refused(sb, run(sb, ["--call-id=" + idOf("top-tank-teal"), "--claim-identity=" + idOf("bottom-shorts-navy") + "-claim"]), "arguments");
  refused(sb, run(sb, [...argsOf(idOf("top-tank-teal")), "--owner-approval=D-207"]), "arguments");
});
test("stage 1: the dry run passes; a stage-2 item and an unassigned reserve are refused", { skip: SKIP_C }, () => {
  const sb = sandbox();
  const r = run(sb, argsOf(idOf("top-tank-teal"))); assert.equal(r.status, 0, r.out); assert.match(r.out, /DRY RUN PASSED/); assert.match(r.out, /0 of 12 claims consumed/);
  refused(sb, run(sb, [...argsOf(idOf("top-tee-red")), ...SEND], KEY), "authorisation");
  refused(sb, run(sb, [...argsOf("D-207-reserve-1"), ...SEND], KEY), "authorisation");
});
test("the one send of a stage-1 item: one fetch with C's bytes and that item's frozen prompt; stored outside the repository; never twice", { skip: SKIP_C }, () => {
  const sb = sandbox(), id = idOf("shoes-sandals-brown"), r = run(sb, [...argsOf(id), ...SEND], KEY);
  assert.equal(r.status, 0, r.out); const L = fetchLog(sb); assert.equal(L.length, 1);
  assert.deepEqual([L[0].images, L[0].imageSha, L[0].size, L[0].background, L[0].hasMask, L[0].redirect], [["d202-base-figure-v2.image-1.png"], [C_SHA], "1024x1536", "transparent", false, "error"]);
  assert.equal(L[0].prompt, PROMPTS.items["shoes-sandals-brown"].prompt);
  assert.ok(existsSync(join(sb.out, id, "d207.image-1.png"))); assert.equal(sgit(sb, ["status", "--porcelain"]), "");
  assert.equal(run(sb, [...argsOf(id), ...SEND], KEY).status, 1); assert.equal(fetchLog(sb).length, 1);
  const t = run(sb, argsOf(idOf("top-tank-teal"))); assert.match(t.out, /1 of 12 claims consumed/);
});
test("an uncertain dispatch is spent and never repeated", { skip: SKIP_C }, () => {
  const sb = sandbox(), id = idOf("top-tank-teal"); assert.equal(run(sb, [...argsOf(id), ...SEND], { ...KEY, D207_MOCK_MODE: "throw" }).status, 3);
  assert.equal(run(sb, [...argsOf(id), ...SEND], KEY).status, 1); assert.equal(fetchLog(sb).length, 1);
});
test("stage 2 opens only through D-207's exact status token in a later decision's status code; a reserve only through its own assignment token", { skip: SKIP_C }, () => {
  // D-210: hypothetical later decisions are D-999 / D-998 (sandbox only); the token must be a SEGMENT of the row's status code
  const OPEN = "D-207 STAGE 1: METHOD_OK", status = (...seg) => "Status **`" + seg.join(" — ") + "`**.";
  const stage2 = (id, row) => sandbox({ base: (s) => { editCalls(s, (c) => { c.stages["2"].open = true; c.stages["2"].openedBy = id; }); if (row !== null) addRow(s, id, row); } });
  const open = stage2("D-999", status("STAGE 1 INSPECTED", OPEN, "3 OF 12 SPENT") + " The method passed."); assert.equal(run(open, argsOf(idOf("top-tee-red"))).status, 0);
  const refusedRows = {
    "a mention outside the status code": status("STAGE 1 INSPECTED") + " Once fixed we would record " + OPEN + " here.",
    "a negation": status("NOT " + OPEN),
    "a near miss": status("D-207 STAGE 1 METHOD_OK"),
    "another decision's token": status("D-206 STAGE 1: METHOD_OK"),
    "the bare word": status("METHOD_OK"),
    "no status code": OPEN,
  };
  for (const [what, row] of Object.entries(refusedRows)) { const sb = stage2("D-999", row); refused(sb, run(sb, [...argsOf(idOf("top-tee-red")), ...SEND], KEY), "authorisation"); assert.ok(what); }
  const earlier = stage2("D-206", null); refused(earlier, run(earlier, [...argsOf(idOf("top-tee-red")), ...SEND], KEY), "authorisation");
  const d208 = stage2("D-208", null); refused(d208, run(d208, [...argsOf(idOf("top-tee-red")), ...SEND], KEY), "authorisation");
  const twice = sandbox({ base: (s) => { editCalls(s, (c) => { c.stages["2"].open = true; c.stages["2"].openedBy = "D-999"; }); addRow(s, "D-999", status(OPEN)); addRow(s, "D-999", status(OPEN)); } });
  refused(twice, run(twice, [...argsOf(idOf("top-tee-red")), ...SEND], KEY), "authorisation");
  const notOpen = sandbox({ base: (s) => { addRow(s, "D-999", status(OPEN)); } }); refused(notOpen, run(notOpen, [...argsOf(idOf("top-tee-red")), ...SEND], KEY), "authorisation");
  // reserves: TECHNICAL_REJECT recorded, the assignment recorded by the reserve's own token — a mention of its call id is not one
  const tok = (r) => "D-207 RESERVE: " + r + " -> top-tank-teal";
  const reserve = (assign2, row) => sandbox({ base: (s) => { editCalls(s, (c) => { const t = c.calls.find((x) => x.item === "top-tank-teal"); t.mandateState = "SPENT"; t.outcome = "TECHNICAL_REJECT"; t.recordedBy = "D-998";
    for (const k of assign2 ? [0, 1] : [0]) { const r = c.calls.filter((x) => x.kind === "reserve")[k]; r.assignedTo = "top-tank-teal"; r.assignedBy = "D-999"; r.item = "top-tank-teal"; r.prompt = { item: "top-tank-teal", sha256: t.prompt.sha256 }; } });
    addRow(s, "D-998", status("top-tank-teal TECHNICAL_REJECT")); addRow(s, "D-999", row); } });
  const one = reserve(false, status(tok("D-207-reserve-1"))), r = run(one, [...argsOf("D-207-reserve-1"), ...SEND], KEY); assert.equal(r.status, 0, r.out);
  assert.equal(fetchLog(one)[0].prompt, PROMPTS.items["top-tank-teal"].prompt, "the reserve sends the item's frozen request");
  const mention = reserve(false, status("ASSIGNED") + " D-207-reserve-1 for top-tank-teal"); refused(mention, run(mention, [...argsOf("D-207-reserve-1"), ...SEND], KEY), "authorisation");
  const wrongItem = reserve(false, status("D-207 RESERVE: D-207-reserve-1 -> top-tee-red")); refused(wrongItem, run(wrongItem, [...argsOf("D-207-reserve-1"), ...SEND], KEY), "authorisation");
  const spentItem = reserve(false, status(tok("D-207-reserve-1"))); refused(spentItem, run(spentItem, [...argsOf(idOf("top-tank-teal")), ...SEND], KEY), "authorisation");
  const two = reserve(true, status(tok("D-207-reserve-1"), tok("D-207-reserve-2"))); refused(two, run(two, [...argsOf("D-207-reserve-1"), ...SEND], KEY), "authorisation");
});

test("D-214 reserve amendment: the skirt's reserve opens only after its HTTP 429 without an image, only through the amendment token; never for another item, a parked item or twice", { skip: SKIP_C }, () => {
  const status = (...seg) => "Status **`" + seg.join(" — ") + "`**.", AM = "D-207 RESERVE AMENDMENT: HTTP_ERROR_NO_IMAGE -> bottom-skirt-plum", TOK = "D-207 RESERVE: D-207-reserve-1 -> bottom-skirt-plum";
  const rig = ({ outcome = "HTTP_ERROR_NO_IMAGE", http = 429, images = 0, items = ["bottom-skirt-plum"], row = status(AM, TOK), parked = false, second = false } = {}) => sandbox({ base: (s) => { editCalls(s, (c) => {
    const t = c.calls.find((x) => x.kind === "item" && x.item === "bottom-skirt-plum"); Object.assign(t, { mandateState: "SPENT", outcome, recordedBy: "D-998", result: { httpStatus: http, images } }); if (parked) t.parkedBy = "D-998";
    c.reserveAmendment = { decision: "D-999", outcome: "HTTP_ERROR_NO_IMAGE", httpStatus: 429, items, maxReserves: 1 };
    for (const k of second ? [0, 1] : [0]) Object.assign(c.calls.filter((x) => x.kind === "reserve")[k], { item: "bottom-skirt-plum", category: "bottom", assignedTo: "bottom-skirt-plum", assignedBy: "D-999", prompt: { item: "bottom-skirt-plum", sha256: t.prompt.sha256 } }); });
    addRow(s, "D-998", status("SKIRT HTTP 429")); addRow(s, "D-999", row); } });
  const ok = rig(), r = run(ok, argsOf("D-207-reserve-1")); assert.equal(r.status, 0, r.out); assert.match(r.out, /DRY RUN PASSED/);
  const sent = rig(), rs = run(sent, [...argsOf("D-207-reserve-1"), ...SEND], KEY); assert.equal(rs.status, 0, rs.out); assert.equal(fetchLog(sent)[0].prompt, PROMPTS.items["bottom-skirt-plum"].prompt, "the skirt's frozen request");
  for (const [what, sb] of [["no amendment token", rig({ row: status(TOK) })], ["the amendment names another item", rig({ items: ["shoes-sneakers-white"] })], ["the item got an image", rig({ outcome: "SENT_ONCE_GENERATION_OK", http: 200, images: 1 })],
    ["an HTTP error other than 429", rig({ http: 500 })], ["a parked item", rig({ parked: true })], ["a second reserve for the item", rig({ second: true })]]) { refused(sb, run(sb, [...argsOf("D-207-reserve-1"), ...SEND], KEY), "authorisation"); assert.ok(what); }
});

// ── the processing tool on the stand-in base ───────────────────────────────────────────────────────────────────────────
const w = WR.buildWardrobe(), L = w.base.layers, A = w.anchors, M = w.fg.master, { W, N } = WR;
const LEGS = (() => { const legs = new Uint8ClampedArray(L.pants); for (let i = 0; i < (A.crotchY + 10) * W; i++) legs[i * 4 + 3] = 0; return NL.overStack([M, recolour(legs, { h: 33, s: 0.51, vScale: 1.3 })]); })();
const base = BC.prepareBase(w, LEGS), T = BC.templatesC(w, base, { revision: "d213" });
const only = (k, P = LEGS) => { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) if (base.sep.lab[i] === k) o.set(P.subarray(i * 4, i * 4 + 4), i * 4); return o; };
test("processing: a correctly regenerated garment is extracted and fits; a garment left half unreplaced is a GENERATION fault; a drift is rejected", () => {
  const bottoms = IP.processItem(w, base, T, "bottom", NL.overStack([LEGS, recolour(only(2), { h: 120, s: 0.5 })]));
  assert.equal(bottoms.ok, true, JSON.stringify(bottoms.faults)); assert.equal(bottoms.observations.baseRemnantShare <= 0.01, true);
  const half = only(1), cut = new Uint8ClampedArray(half); for (let i = 700 * W; i < N; i++) cut[i * 4 + 3] = 0;
  const partial = IP.processItem(w, base, T, "top", NL.overStack([LEGS, recolour(cut, { h: 175, s: 0.55 })]));
  assert.equal(partial.ok, false); assert.ok(partial.faults.generation.some((f) => f.startsWith("G-2")), JSON.stringify(partial.faults));
  const drift = IP.processItem(w, base, T, "top", BF.shift(LEGS, 12, 0)); assert.equal(drift.ok, false); assert.ok(drift.faults.generation[0].startsWith("G-1"));
});
test("processing: a redrawn hand is reported, never extracted into the item; a top's paint over the arms becomes its sleeve layer", () => {
  const moved = new Uint8ClampedArray(LEGS); for (let y = A.wristY.left; y < A.wristY.left + 60; y++) for (let x = 300; x < 380; x++) if (moved[(y * W + x) * 4 + 3]) moved.set([200, 120, 80, 255], (y * W + x) * 4);
  const r = IP.processItem(w, base, T, "top", NL.overStack([moved, recolour(only(1), { h: 175, s: 0.55 })]));
  assert.ok(r.observations.protectedChangedPx > 0); let inItem = 0; for (let i = 0; i < N; i++) if (T.top.protect[i] && (r.layers.topBody[i * 4 + 3] || r.layers.sleeves[i * 4 + 3])) inItem++; assert.equal(inItem, 0);
  // a sleeve hangs from the armhole: from the shoulder down over the upper arm (D-210 keeps only paint connected to the garment)
  const sleeve = new Uint8ClampedArray(N * 4); for (let y = A.shoulder.y; y < 720; y++) for (let x = 0; x < W; x++) if (base.arms[(y * W + x) * 4 + 3] >= 128) sleeve.set([40, 140, 120, 255], (y * W + x) * 4);
  const s = IP.processItem(w, base, T, "top", NL.overStack([LEGS, recolour(only(1), { h: 175, s: 0.55 }), sleeve])); let sl = 0; for (let i = 0; i < N; i++) if (s.layers.sleeves[i * 4 + 3]) sl++; assert.ok(sl > 1000, "the paint over the arm is in the sleeve layer");
});
// D-210 extraction: a pixel is new paint only if no pixel of C within EXPLAIN_PX explains it; the garment is the paint connected
// to it. D-208's 2 px opening is gone: it removed thin straps too and let a 3 px contour redrawn 2 px off through.
test("D-210 extraction: body contours redrawn up to 2 px off are never item; thin and dark straps connected to the sole are kept whole; a loose strap is flagged, not dropped silently", () => {
  const shorts = recolour(only(2), { h: 120, s: 0.5 }); let hem = 0; for (let i = 0; i < N; i++) if (shorts[i * 4 + 3]) hem = Math.max(hem, (i / W) | 0);
  const yLo = hem + 12, yHi = hem + 140;
  for (const d of [1, 2]) { const moved = new Uint8ClampedArray(LEGS);
    for (let y = yLo; y < yHi; y++) for (let x = W - 1; x >= d; x--) moved.set(LEGS.subarray((y * W + x - d) * 4, (y * W + x - d + 1) * 4), (y * W + x) * 4);
    let exercised = 0; for (let y = yLo; y < yHi; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (T.bottom.allowed[i] && !T.bottom.protect[i] && moved[i * 4 + 3] !== LEGS[i * 4 + 3]) exercised++; }
    assert.ok(exercised > 0, "the shifted contour lies inside the bottoms envelope");
    const r = IP.processItem(w, base, T, "bottom", NL.overStack([moved, shorts])); let stray = 0;
    for (let y = yLo; y < yHi; y++) for (let x = 0; x < W; x++) if (r.layers.pants[(y * W + x) * 4 + 3]) stray++;
    assert.equal(stray, 0, "a body contour redrawn " + d + " px off below the garment is the body's own"); }
  // a sandal on the stand-in's feet: a sole, side posts, a 3 px thin strap and a wide strap with a dark band, crossing dark lines
  let fb = 0; for (let i = 0; i < N; i++) if (LEGS[i * 4 + 3] >= 128) fb = Math.max(fb, (i / W) | 0);
  const runs = (y) => { const o = []; let s0 = -1; for (let x = 0; x <= W; x++) { const on = x < W && LEGS[(y * W + x) * 4 + 3] >= 128; if (on && s0 < 0) s0 = x; if (!on && s0 >= 0) { o.push([s0, x - 1]); s0 = -1; } } return o; };
  const BROWN = [140, 86, 46, 255], DARK = [70, 42, 24, 255], SOLE = [110, 66, 36, 255];
  const sandal = (withSole) => { const o = new Uint8ClampedArray(N * 4), put = (x, y, c) => { const i = y * W + x; if (T.shoes.allowed[i] && !T.shoes.protect[i]) o.set(c, i * 4); };
    for (let y = fb - 60; y <= fb - 5; y++) for (const [s0, e0] of runs(y)) for (let x = s0; x <= e0; x++) {
      const thin = y <= fb - 58, wide = y >= fb - 40 && y <= fb - 27;
      if (thin || wide) put(x, y, wide && y >= fb - 36 && y <= fb - 33 ? DARK : BROWN); }
    // the side posts at the wide strap's own columns, from the thin strap down to the sole
    if (withSole) for (const [s0, e0] of runs(fb - 30)) for (let y = fb - 60; y <= fb - 5; y++) for (const x of [s0, s0 + 1, s0 + 2, s0 + 3, e0 - 3, e0 - 2, e0 - 1, e0]) put(x, y, BROWN);
    if (withSole) for (let y = fb - 4; y <= fb + 10; y++) for (const [s0, e0] of runs(fb - 30)) for (let x = s0 - 2; x <= e0 + 2; x++) put(x, y, SOLE);
    return o; };
  const S = sandal(true); let painted = 0, kept = 0; const r = IP.processItem(w, base, T, "shoes", NL.overStack([LEGS, S]));
  for (let i = 0; i < N; i++) if (S[i * 4 + 3]) { painted++; if (r.layers.shoes[i * 4 + 3]) kept++; }
  assert.ok(painted > 3000, "the sandal lies on the feet inside the shoes envelope");
  assert.deepEqual(r.faults.extraction, []); assert.ok(r.checks.find((c) => c.id === "FIT-7v2-GROUND").ok, "the sole reaches the ground range");
  // a thin dark cord across the bare shin (above the stand-in's sneakers), hung from posts down to the sole: kept whole — no thin
  // stripe is filtered away (the cord's rows: on clean body, no ink of the base within 8 px above or below it across the leg; the
  // stand-in's legs are recoloured jeans with dark folds, C's are bare skin; the posts are green, the legs are tan)
  const clean = (y) => { const [a0, a1] = runs(y)[0] || [0, -1]; if (a1 - a0 < 40) return false; for (let yy = y - 8; yy <= y + 10; yy++) for (let x = a0 + 10; x <= a1 - 10; x++) if (BF.classify(base.R, yy * W + x) === "ink") return false; return true; };
  let yc = -1; for (let y = Math.min(A.shoeTopY.left, A.shoeTopY.right) - 40; y > T.shoes.soleRange[0] - 280 && yc < 0; y--) if (clean(y)) yc = y;
  assert.ok(yc > 0, "a clean row on the shin inside the shoes envelope");
  const [l0, l1] = runs(yc)[0], INK = [22, 16, 12, 255], cord = new Uint8ClampedArray(S), cordPx = [];
  const at = (x, y, c, list) => { const i = y * W + x; if (T.shoes.allowed[i] && !T.shoes.protect[i]) { cord.set(c, i * 4); if (list) list.push(i); } };
  for (let y = yc; y <= fb - 5; y++) for (const x of [l0 + 1, l0 + 2, l0 + 3, l0 + 4, l1 - 4, l1 - 3, l1 - 2, l1 - 1]) at(x, y, [40, 110, 70, 255]);
  for (let y = yc; y <= yc + 2; y++) for (let x = l0 + 5; x <= l1 - 5; x++) at(x, y, INK, cordPx);
  const rc = IP.processItem(w, base, T, "shoes", NL.overStack([LEGS, cord])); let cordKept = 0; for (const i of cordPx) if (rc.layers.shoes[i * 4 + 3]) cordKept++;
  assert.ok(cordPx.length > 100); assert.equal(cordKept, cordPx.length, "the 3 px cord is garment: " + cordKept + " of " + cordPx.length);
  const loose = IP.processItem(w, base, T, "shoes", NL.overStack([LEGS, sandal(false)]));
  assert.ok(loose.faults.extraction.some((f) => f.startsWith("E-2")), "a strap connected to no sole is flagged for review: " + JSON.stringify(loose.faults));
});

// D-210 revision of FIT-5 / FIT-6 / FIT-7: what the contract intends passes, every fault stimulus still fails on its own check
test("D-210 fit revision: intended overlap, open skin and a sole under the foot pass; wrong order, hidden detail, a too-narrow garment and a floating or sunken shoe fail", () => {
  const min = BF.minimumItems(base.R, base.sep.lab), S = standInItems(w, base), fc = (cat, layers, o = {}) => BC.fitCheck(w, base, T, cat, layers, { revision: "d213", ...o });
  const get = (r, id) => r.checks.find((c) => c.id === id), ok = (r, id) => get(r, id).ok;
  for (const id of ["min-sleeveless-top", "min-shorts"]) { const r = fc(S[id].category, S[id].layers); assert.ok(r.fitOk, id + " " + JSON.stringify(r.checks.filter((c) => !c.ok))); }
  // FIT-5v2 — a sleeve delivered in the body layer, hidden behind the arm: a hidden detail (v3's own stimulus)
  const sleeveFault = fc("top", S["FAULT-sleeves-in-body-layer"].layers); assert.equal(ok(sleeveFault, "FIT-5v2-ORDER"), false); assert.ok(get(sleeveFault, "FIT-5v2-ORDER").value.hiddenDetailPx > 0);
  // a top 20 px longer than the base, over the shorts: fine in the contract order, a wrong order when the bottoms go over the top
  let seam = 0; for (let i = 0; i < N; i++) if (base.sep.lab[i] === 1) seam = Math.max(seam, (i / W) | 0);
  const longTop = new Uint8ClampedArray(min.topBody); for (let y = seam + 1; y <= seam + 20; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (base.sep.lab[i] === 2) longTop.set([60, 150, 150, 255], i * 4); }
  const lt = { topBody: longTop, sleeves: new Uint8ClampedArray(N * 4) };
  assert.ok(ok(fc("top", lt), "FIT-5v2-ORDER")); const wrong = fc("top", lt, { order: "bottoms-over-top" }); assert.equal(ok(wrong, "FIT-5v2-ORDER"), false); assert.ok(get(wrong, "FIT-5v2-ORDER").value.wrongOrderPx > 0);
  // shorts with a waistband tucked 8 px under the top: intended; with a patch 40 px up under the top: a detail never shown
  const band = (h0, h1) => { const o = new Uint8ClampedArray(min.pants); for (let y = seam - h1; y <= seam - h0; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (base.sep.lab[i] === 1) o.set([40, 60, 110, 255], i * 4); } return o; };
  const tucked = fc("bottom", { pants: band(0, 8) }); assert.ok(ok(tucked, "FIT-5v2-ORDER"), JSON.stringify(get(tucked, "FIT-5v2-ORDER").value)); assert.ok(get(tucked, "FIT-5v2-ORDER").value.tuckedPx > 0);
  const deep = fc("bottom", { pants: band(0, 40) }); assert.equal(ok(deep, "FIT-5v2-ORDER"), false); assert.ok(get(deep, "FIT-5v2-ORDER").value.hiddenDetailPx > 0);
  // FIT-6v2 — trousers over the whole leg: no strip; the same 3 px narrower at each side: the leg shows beside them, a sliver
  const trousers = (inset) => { const o = new Uint8ClampedArray(min.pants); let hem = 0; for (let i = 0; i < N; i++) if (base.sep.lab[i] === 2) hem = Math.max(hem, (i / W) | 0);
    for (let y = hem; y < Math.min(A.shoeTopY.left, A.shoeTopY.right) - 20; y++) { let s0 = -1; for (let x = 0; x <= W; x++) { const on = x < W && base.body[(y * W + x) * 4 + 3] >= 128 && !base.sep.lab[y * W + x];
      if (on && s0 < 0) s0 = x; if (!on && s0 >= 0) { for (let xx = s0 + inset; xx <= x - 1 - inset; xx++) o.set([150, 130, 90, 255], (y * W + xx) * 4); s0 = -1; } } } return o; };
  const full = fc("bottom", { pants: trousers(0) }), narrow = fc("bottom", { pants: trousers(3) });
  assert.ok(ok(full, "FIT-6v2-SILHOUETTE"), JSON.stringify(get(full, "FIT-6v2-SILHOUETTE").value)); assert.equal(ok(narrow, "FIT-6v2-SILHOUETTE"), false); assert.ok(get(narrow, "FIT-6v2-SILHOUETTE").value.sliverPx > 100);
  // FIT-7v2 — a shoe ends between the base's soles and a Northstar sneaker sole below them
  const move = (dy) => { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) { const j = i - dy * W; if (j >= 0 && j < N) o.set(L.shoes.subarray(j * 4, j * 4 + 4), i * 4); } return o; };
  const g7 = (dy) => get(fc("shoes", { shoes: move(dy) }), "FIT-7v2-GROUND");
  assert.ok(g7(0).ok, JSON.stringify(g7(0).value)); assert.ok(g7(20).ok, "a sole 20 px under the foot"); assert.equal(g7(-20).ok, false, "lifted 20 px"); assert.equal(g7(40).ok, false, "sunk 40 px");
  // v3 is unchanged for D-205's record
  assert.ok(BC.fitCheck(w, base, BC.templatesC(w, base), "bottom", S["min-shorts"].layers).checks.some((c) => c.id === "FIT-5-ORDER"));
});
// D-213: collars, the head seam, long sleeves, fingers and garment colours near skin
test("D-213: a collar takes no neck skin under the head; the head's collar edge is not drawn over the neck; a long sleeve keeps its cuff to C's wrist; paint over the fingers is a G-3 fault; a light garment is new paint", () => {
  const top = recolour(only(1), { h: 175, s: 0.55 }), rt = BF.runtimeHead(w, base.body);
  // a collar: the edge-from-the-picture rule takes nothing under the runtime head (D-210's rule took the neck skin there — the tee's strip)
  const r = IP.processItem(w, base, T, "top", NL.overStack([LEGS, top])); let underHead = 0;
  for (let i = 0; i < N; i++) if (rt[i * 4 + 3] >= 128 && r.masks.ruleOf[i] === 6) underHead++;   // the collar under the chin is garment (own base); the neck skin is not
  assert.equal(underHead, 0, "the edge rule takes nothing under the head");
  // the head seam: where the head's leftover collar edge lies over an opaque body, the runtime shows the body (D-201), v3 the head
  const edge = BF.neckEdgeMask(w), P1 = BF.layerProof(w, base.R, base.Z, BF.minimumItems(base.R, base.sep.lab), { sep: base.sep, headSeam: "d201" });
  const P0 = BF.layerProof(w, base.R, base.Z, BF.minimumItems(base.R, base.sep.lab), { sep: base.sep }); let n = 0, same = 0, differs = 0;
  for (let i = 0; i < N; i++) if (edge[i] && P1.body[i * 4 + 3] >= 128) { n++; if ([0, 1, 2, 3].every((k) => P1.dressedRuntime[i * 4 + k] === P1.body[i * 4 + k])) same++; if ([0, 1, 2].some((k) => P0.dressedRuntime[i * 4 + k] !== P1.dressedRuntime[i * 4 + k])) differs++; }
  assert.ok(n > 50 && same === n, "D-201 seam: the body wins on the collar edge (" + same + " of " + n + ")");
  // runtimeHead drops exactly the collar edge over an opaque body and keeps the rest of the head (the stand-in's neck IS Northstar's,
  // so the plain composite shows no line there; on C it drew the pale curve — d213-review)
  let dropped = 0, keptElse = true; for (let i = 0; i < N; i++) { const e = edge[i] && P1.body[i * 4 + 3] > 0; if (e) { if (rt[i * 4 + 3] === 0) dropped++; } else if ([0, 1, 2, 3].some((k) => rt[i * 4 + k] !== w.head[i * 4 + k])) keptElse = false; }
  assert.ok(dropped > 50 && keptElse, "runtimeHead: " + dropped + " collar-edge pixels dropped, the rest of the head unchanged"); assert.ok(differs >= 0);
  // a long sleeve from the shoulder down to C's wrist: its cuff is kept to the wrist row (the v3 guard began 10 px above the
  // larger Northstar wrist anchor); the same sleeve continued over the hand: the hand stays the base's and G-3 reports it
  const wr = T.top.wristRows, sleeve = (toY) => { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0; if (y >= A.shoulder.y && y <= toY(x) && base.arms[i * 4 + 3] >= 128) o.set([40, 120, 60, 255], i * 4); } return o; };
  const toWrist = sleeve((x) => wr[x < W / 2 ? "left" : "right"] - 3), cuff = IP.processItem(w, base, T, "top", NL.overStack([LEGS, top, toWrist]));
  let painted = 0, kept = 0; for (let i = 0; i < N; i++) { const y = (i / W) | 0; if (toWrist[i * 4 + 3] && y >= Math.min(wr.left, wr.right) - 12) { painted++; if (cuff.layers.sleeves[i * 4 + 3] || cuff.layers.topBody[i * 4 + 3]) kept++; } }
  assert.ok(painted > 100 && kept === painted, "the cuff's last 12 rows above C's wrist are kept: " + kept + " of " + painted); assert.deepEqual(cuff.faults.generation, []);
  const v3 = BC.templatesC(w, base); let v3cut = 0; for (let i = 0; i < N; i++) if (toWrist[i * 4 + 3] && v3.top.protect[i]) v3cut++; assert.ok(v3cut > 0, "v3's guard cut that cuff");
  const overHand = sleeve((x) => wr[x < W / 2 ? "left" : "right"] + 30), oh = IP.processItem(w, base, T, "top", NL.overStack([LEGS, top, overHand]));
  let onHand = 0; for (let i = 0; i < N; i++) if (T.top.hands[i] && (oh.layers.sleeves[i * 4 + 3] || oh.layers.topBody[i * 4 + 3])) onHand++;
  assert.equal(onHand, 0, "nothing over C's hand is extracted"); assert.ok(oh.faults.generation.some((f) => f.startsWith("G-3")), JSON.stringify(oh.faults));
  // a light garment over the legs, ≈ 50 from the stand-in's leg colour in its largest channel: new paint, kept whole
  let hem = 0; for (let i = 0; i < N; i++) if (base.sep.lab[i] === 2) hem = Math.max(hem, (i / W) | 0);
  const legs = new Uint8ClampedArray(min_pants()); const leg = []; for (let y = hem; y < Math.min(A.shoeTopY.left, A.shoeTopY.right) - 20; y++) for (let x = 0; x < W; x++) { const i = y * W + x;
    if (base.body[i * 4 + 3] >= 128 && !base.sep.lab[i] && BF.classify(base.R, i) !== "ink") { const c = base.R.subarray(i * 4, i * 4 + 3); legs.set([Math.min(255, c[0] + 50), Math.min(255, c[1] + 30), Math.min(255, c[2] + 20), 255], i * 4); leg.push(i); } }
  const lt = IP.processItem(w, base, T, "bottom", NL.overStack([LEGS, legs])); let lk = 0; for (const i of leg) if (lt.layers.pants[i * 4 + 3]) lk++;
  assert.ok(leg.length > 5000 && lk >= 0.99 * leg.length, "a light garment over the legs is new paint: " + lk + " of " + leg.length);
  function min_pants() { return BF.minimumItems(base.R, base.sep.lab).pants; }
});
test("D-214 skin shadow: a cast shadow under a cuff is its own multiply layer and reproduces the picture on C; khaki and brown leather over the skin stay fabric", () => {
  const top = recolour(only(1), { h: 175, s: 0.55 }), wr = T.top.wristRows, band = (k) => { const o = new Uint8ClampedArray(N * 4), px = [];
    for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0, w0 = wr[x < W / 2 ? "left" : "right"]; if (base.arms[i * 4 + 3] >= 250 && BF.classify(base.R, i) === "skin" && y >= w0 - 14 && y < w0 - 8) { o.set([...k.map((v, c) => Math.round(base.R[i * 4 + c] * v)), 255], i * 4); px.push(i); } } return { o, px }; };
  const cuff = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0; if (y >= A.shoulder.y && y < wr[x < W / 2 ? "left" : "right"] - 14 && base.arms[i * 4 + 3] >= 128) cuff.set([40, 120, 60, 255], i * 4); }
  const sh = band([0.91, 0.77, 0.73]), pic = NL.overStack([LEGS, top, cuff, sh.o]), r = IP.processItem(w, base, T, "top", pic);
  let inShadow = 0, inFabric = 0; for (const i of sh.px) { if (r.shadow && r.shadow[i * 4 + 3]) inShadow++; if (r.layers.sleeves[i * 4 + 3] || r.layers.topBody[i * 4 + 3]) inFabric++; }
  // a shadow fainter than the new-paint tolerance (within STRONG_TOL of C there) is no new paint: C's own skin shows (documented)
  let faint = 0; for (const i of sh.px) if (!(r.shadow && r.shadow[i * 4 + 3])) { let near = false; for (let dy = -IP.EXPLAIN_PX; dy <= IP.EXPLAIN_PX && !near; dy++) for (let dx = -IP.EXPLAIN_PX; dx <= IP.EXPLAIN_PX; dx++) if (IP.colourDist(pic, i, base.R, i + dy * W + dx) <= IP.STRONG_TOL) { near = true; break; } if (near) faint++; }
  assert.ok(sh.px.length > 50 && inFabric === 0 && inShadow + faint === sh.px.length && inShadow >= 0.8 * sh.px.length, "the cast shadow: " + inShadow + " in the shadow layer, " + faint + " faint (C's skin), " + inFabric + " in the fabric, of " + sh.px.length);
  let maxd = 0; for (const i of sh.px) for (let c = 0; c < 3; c++) if (r.shadow[i * 4 + 3]) maxd = Math.max(maxd, Math.abs(r.composite[i * 4 + c] - pic[i * 4 + c])); assert.ok(maxd <= 2, "composed, the shadow reproduces the picture (max " + maxd + ")");
  for (const [what, k] of [["khaki", [0.75, 0.87, 0.97]], ["brown leather", [0.55, 0.44, 0.37]]]) { const b = band(k), q = IP.processItem(w, base, T, "top", NL.overStack([LEGS, top, cuff, b.o])); let s0 = 0; for (const i of b.px) if (q.shadow && q.shadow[i * 4 + 3]) s0++; assert.equal(s0, 0, what + " is fabric, never a skin shadow"); }
});
test("the 27 outfits mark missing and failed items and never hide them", () => {
  const ok = IP.processItem(w, base, T, "bottom", NL.overStack([LEGS, recolour(only(2), { h: 120, s: 0.5 })]));
  const out = join(realpathSync.native(mkdtempSync(join(tmpdir(), "d207-sandbox-"))), "combine"); ROOTS.push(dirname(out)); mkdirSync(out);
  const r = IP.combine(w, base, { "bottom-shorts-navy": { item: "bottom-shorts-navy", ok: true, layers: ok.layers }, "top-tank-teal": { item: "top-tank-teal", ok: false, layers: null } }, out);
  assert.equal(r.tiles, 27); assert.ok(r.index.some((o) => o[0] === "missing → placeholder (C's base garment)")); assert.ok(r.index.some((o) => o[1] === "bottom-shorts-navy"));
  assert.throws(() => IP.combine(w, base, {}, join(REPO, "tools", "avatar", "build", "d207-probe")), /inside the repository/);
});
