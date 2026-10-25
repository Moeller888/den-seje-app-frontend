// NORTHSTAR BASE FIGURE — D-202: the adopted gate revisions (gate set v2: BF4v2, BF9v2, BF14v2), the frozen prompt v2, D-199's
// unused reserve B closed, and ONE new call (the last of the budget) with its separate send adapter, tested without ever
// reaching the real world. The adapter is never imported: it runs as a CLI in a child process inside a temporary git repository
// built per scenario (its own origin/main), with an allowlisted environment, a dummy key and a mocked fetch loaded from outside.
// The returned images are synthetic technical shapes, never a figure. Northstar-derived stimuli only; the private candidate A
// never enters the repository or CI (D-127 §2).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, readdirSync, copyFileSync, realpathSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join, dirname, relative, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { parseEvents, deriveAttempt } from "../../tools/avatar/r3-face-neutral-attempt-ledger.mjs";
import { encodePng } from "../../tools/avatar/r3-hair-tool.mjs";
import * as WR from "../../tools/avatar/northstar-wardrobe.mjs";
import * as BF from "../../tools/avatar/northstar-base-figure.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const repoFile = (rel) => join(REPO, ...rel.split("/"));
const ADAPTER_REL = "tools/avatar/openai-send-northstar-base-figure-d202.mjs";
const OLD_ADAPTER_REL = "tools/avatar/openai-send-northstar-base-figure-d199.mjs";
const LEDGER_REL = "tools/avatar/r3-face-neutral-attempt-ledger.mjs";
const CALLS_REL = "tools/avatar/fixtures/northstar-wardrobe/base-figure-calls-v1.json";
const SPEC_REL = "tools/avatar/fixtures/northstar-wardrobe/base-figure-spec-v1.json";
const PROMPT_REL = "tools/avatar/fixtures/northstar-wardrobe/base-figure-prompt-v2.txt";
const PROMPT_V1_REL = "tools/avatar/fixtures/northstar-wardrobe/base-figure-prompt-v1.txt";
const CHECKER_REL = "tools/avatar/northstar-base-figure.mjs";
const REGISTER_REL = "docs/project-state.md";
const NORTHSTAR_REL = "assets/avatar/reference/Northstar Master v2.png";
const SRC = readFileSync(repoFile(ADAPTER_REL), "utf8");
const CODE = SRC.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
const CALLS = JSON.parse(readFileSync(repoFile(CALLS_REL), "utf8"));
const REGISTER = readFileSync(repoFile(REGISTER_REL), "utf8");
const ROW = REGISTER.split("\n").find((l) => l.startsWith("| **D-202** |"));
const CALL = "D-202-northstar-base-figure-v2", CLAIM_ID = CALL + "-claim", CLAIM_FILE = CALL + ".claim.json", EVENTS_FILE = CALL + ".events.jsonl", APPROVAL = "--owner-approval=D-202";
const ARGS = ["--call-id=" + CALL, "--claim-identity=" + CLAIM_ID], SEND = ["--send", APPROVAL];
const DUMMY_KEY = "sk-d202-sandbox-dummy-key-not-a-credential";
const PROMPT_V2_SHA = "8262452eb0444518db0d435d9e2c203fcbd370a3bdc07597c49dcd3467395dd1", NORTHSTAR_SHA = "3daf32e76bff9a53ec7d25cf148a230073cfd0da6a003d02a23c4292d139ff50";
const w = WR.buildWardrobe(), spec = BF.loadSpec(), Z = BF.zones(w, spec);
const isInside = (child, parent) => { const rel = relative(parent, child); return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel)); };

// ── the decision ─────────────────────────────────────────────────────────────────────────────────────────────────────
test("D-202: B closed unused, ONE new call with prompt v2, the budget at its last call; prompt v2 frozen, v1 unchanged", () => {
  const [a, b, c] = CALLS.authorisedCalls.calls;
  assert.deepEqual([a.outcome, b.mandateState, b.closedBy, c.callId, c.mandateState, c.decision], ["TECHNICAL_REJECT", "CLOSED_UNUSED", "D-202", CALL, "UNSPENT", "D-202"]);
  assert.deepEqual([CALLS.budget.authorised, CALLS.budget.actuallySent, CALLS.budget.remaining], [2, 1, 1]);
  assert.equal(CALLS.authorisedCalls.calls.filter((e) => e.mandateState === "UNSPENT").length, 1);
  for (const k of ["endpoint", "operation", "model", "parameters", "fieldOrder", "neverSentFields", "inputs"]) assert.deepEqual(c[k], a[k], "C sends A's request except the prompt: " + k);
  assert.deepEqual([c.prompt.file, c.prompt.sha256, c.prompt.bytes], [PROMPT_REL, PROMPT_V2_SHA, 2480]);
  assert.equal(sha256(readFileSync(repoFile(PROMPT_REL))), PROMPT_V2_SHA); assert.equal(sha256(readFileSync(repoFile(PROMPT_V1_REL))), "8076c3d1a6f7fd141af3fbacd9f7a8f21b8aa6bc8d6ead0dd018a2172f61fd99");
  assert.equal(existsSync(repoFile("tools/avatar/fixtures/northstar-wardrobe/base-figure-prompt-v2-draft.txt")), false, "one prompt v2 file, frozen");
  assert.match(c.prohibitions.noFurtherCall, /no further send is possible/); assert.match(c.outputHandling.technicalChecks, /gate set v2/);
});
test("the D-202 register row: once, directly after D-201, every pin named, merge is not a run instruction", () => {
  const lines = REGISTER.split("\n"), i = lines.findIndex((l) => l.startsWith("| **D-202** |"));
  assert.equal(lines.filter((l) => l.startsWith("| **D-202** |")).length, 1); assert.ok(lines[i - 1].startsWith("| **D-201** |"));
  for (const v of [CALL, CLAIM_ID, CLAIM_FILE, APPROVAL, "D-199-northstar-base-figure-b", "gpt-image-2.5-sunburst-2026-09-08", ADAPTER_REL, NORTHSTAR_SHA, PROMPT_V2_SHA, "1024x1536", "BF4v2", "BF9v2", "BF14v2"]) assert.ok(ROW.includes(v), v);
  assert.match(ROW, /særskilt eksekveringsbesked/); assert.ok(!/Ã|�/.test(ROW));
});

// ── the gate set v2 ──────────────────────────────────────────────────────────────────────────────────────────────────
test("gate set v2 replaces exactly BF4, BF9 and BF14; v1 stays available and unchanged for A's historical result", () => {
  const v1 = BF.checkBaseFigure(w, w.fg.master, Z, spec, "generated", "v1").checks.map((c) => c.id), v2 = BF.checkBaseFigure(w, w.fg.master, Z, spec, "generated", "v2").checks.map((c) => c.id);
  assert.deepEqual(v2, v1.map((id) => ({ "BF4-POSE": "BF4v2-POSE", "BF9-BASE-TOP": "BF9v2-BASE-TOP", "BF14-ALPHA": "BF14v2-ALPHA" })[id] || id));
  assert.match(spec.gatesV2.status, /ADOPTED/); assert.equal(spec.gatesV2.maxInteriorShare, 0.01);
  assert.equal(spec.gates.groundTolPx, 4); assert.equal(spec.gates.maxHazeShare, 0.06); assert.equal(spec.gates.minCoreCoverage, 0.995);
});
test("gate set v2 still rejects every documented fault: the D-201 controls, a sleeve painted as skin, a soft image, a 12 px drift", () => {
  const S = BF.proposalStimuli(w), gate = { "P-BF4-BARE-FEET": "BF4v2-POSE", "P-BF9-CHEST-BAND": "BF9v2-BASE-TOP", "P-BF14-ALPHA": "BF14v2-ALPHA" };
  for (const [id, s] of Object.entries(S)) { if (s.proposal === "all") continue; const r = BF.checkBaseFigure(w, s.image, Z, spec, "generated", "v2"), c = r.checks.find((x) => x.id === gate[s.proposal]);
    assert.equal(c.ok, s.expect, id + " " + JSON.stringify(c.value)); }
  const nsChecks = BF.checkBaseFigure(w, w.fg.master, Z, spec, "generated", "v2").checks, ns = Object.fromEntries(nsChecks.map((c) => [c.id, c.ok]));
  for (const k of ["BF4v2-POSE", "BF14v2-ALPHA", "BF5-ENVELOPE", "BF15-DRESS-BACK"]) assert.equal(ns[k], true, "Northstar: " + k);
  const bf9 = nsChecks.find((c) => c.id === "BF9v2-BASE-TOP").value;
  assert.ok(bf9.chestBand.coverage >= spec.gates.minCoreCoverage, "Northstar's tee covers its own torso below the armpits"); assert.equal(ns["BF9v2-BASE-TOP"], false, "…but it ends at t-shirt length (hem y " + bf9.hemY + "), not at the natural waist — still no base top");
  for (const k of ["BF6-ARMS", "BF7-LEGS", "BF8-FEET", "BF10-BASE-SHORTS", "BF11-SKIN-TONE"]) assert.equal(ns[k], false, "the clothed Northstar is still no base figure: " + k);
  const st = BF.stimuli(w), v2 = (img) => Object.fromEntries(BF.checkBaseFigure(w, img, Z, spec, "generated", "v2").checks.map((c) => [c.id, c.ok]));
  assert.equal(v2(st["sleeves-as-skin"].image)["BF6-ARMS"], false);
  const blur = v2(st.blur.image); assert.equal(blur["BF12-OUTLINE"], false); assert.equal(blur["BF13-SHARPNESS"], false);
  const drift = BF.checkBaseFigure(w, st["shift-12-0"].image, Z, spec, "generated", "v2"); assert.equal(drift.ok, false); assert.equal(drift.registration.ok, false);
});

// ── the adapter, statically ──────────────────────────────────────────────────────────────────────────────────────────
test("the D-202 adapter: no exports, only node built-ins and the ledger, exactly one fetch with redirect error, no retry, the key read once", () => {
  assert.ok(!/^\s*export\b/m.test(CODE));
  for (const m of CODE.matchAll(/^\s*import\b[^;]*?from\s+"([^"]+)"/gm)) assert.ok(m[1].startsWith("node:") || m[1] === "./r3-face-neutral-attempt-ledger.mjs", m[1]);
  assert.equal([...CODE.matchAll(/\bfetch\s*\(/g)].length, 1);
  assert.match(CODE, /globalThis\.fetch\(ENDPOINT, \{ method: "POST", redirect: "error", headers: \{ Authorization: "Bearer " \+ apiKey \}, body: built\.body \}\)/);
  const prose = /no retry, no fallback|No outcome permits an automatic retry|there is no fallback|automaticRetry: false|NO RETRY/gi;
  for (const x of ["retry", "retries", "backoff", "fallback"]) assert.ok(!new RegExp("\\b" + x + "\\b", "i").test(CODE.replace(prose, "")), x);
  assert.equal([...CODE.matchAll(/process\.env\.OPENAI_API_KEY/g)].length, 1);
  assert.ok(!/fitting-base|H1\.png/.test(CODE));
  assert.match(SRC, /const REQUIRED_DECISIONS = Object\.freeze\(\["D-127", "D-159", "D-197", "D-198", "D-199", "D-200", "D-201", "D-202"\]\);/);
  assert.match(CODE, /resolve\(home, "Documents", "DenSejeApp-artefacts", "d-202-northstar-base-figure"\)/);
});

// ── sandbox ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const ROOTS = [];
after(() => { for (const r of ROOTS) if (isInside(r, realpathSync.native(tmpdir())) && /d202-sandbox-/.test(r)) rmSync(r, { recursive: true, force: true }); });
const MOCK_SRC = [
  "import { appendFileSync, existsSync, readFileSync, writeFileSync } from \"node:fs\";",
  "const LOG = process.env.D202_MOCK_LOG, MODE = process.env.D202_MOCK_MODE, CLAIM = process.env.D202_MOCK_CLAIM, EVENTS = process.env.D202_MOCK_EVENTS, PNG = process.env.D202_MOCK_PNG, BODY = process.env.D202_MOCK_BODY;",
  "if (!LOG || !MODE || !CLAIM || !EVENTS || !PNG || !BODY) throw new Error(\"d202 mock: not configured — refusing to run\");",
  "globalThis.fetch = async function d202MockFetch(url, init) {",
  "  const body = init ? init.body : null, headers = init && init.headers ? init.headers : {};",
  "  appendFileSync(LOG, JSON.stringify({ url: String(url), redirect: init && init.redirect, dummyKey: headers.Authorization === \"Bearer sk-d202-sandbox-dummy-key-not-a-credential\",",
  "    claimExistedAtCall: existsSync(CLAIM), eventsAtCall: existsSync(EVENTS) ? readFileSync(EVENTS, \"utf8\") : null, fields: [...body.keys()],",
  "    images: body.getAll(\"image[]\").map((f) => f.name), imageSha: await Promise.all(body.getAll(\"image[]\").map(async (f) => (await import(\"node:crypto\")).createHash(\"sha256\").update(Buffer.from(await f.arrayBuffer())).digest(\"hex\"))),",
  "    prompt: body.get(\"prompt\"), size: body.get(\"size\"), background: body.get(\"background\"), hasMask: body.has(\"mask\") }) + \"\\n\");",
  "  if (MODE === \"throw\") throw new TypeError(\"fetch failed (mock transport error)\");",
  "  const text = JSON.stringify({ created: 1, data: [{ b64_json: readFileSync(PNG).toString(\"base64\") }] }); writeFileSync(BODY, text);",
  "  return new Response(text, { status: 200, headers: { \"content-type\": \"application/json\", \"x-request-id\": \"req_mockok\" } });",
  "};",
].join("\n");
const TRACKED = [ADAPTER_REL, OLD_ADAPTER_REL, LEDGER_REL, REGISTER_REL, CALLS_REL, SPEC_REL, PROMPT_REL, PROMPT_V1_REL, CHECKER_REL, NORTHSTAR_REL];
function shape() { const W = 1024, H = 1536, px = new Uint8ClampedArray(W * H * 4); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (((x + 0.5 - 512) / 300) ** 2 + ((y + 0.5 - 768) / 600) ** 2 <= 1) px.set([150, 150, 150, 255], (y * W + x) * 4); return encodePng(W, H, px); }
const PNG = shape();
function envFor(sb, extra) {
  const env = {}; for (const k of ["PATH", "Path", "SystemRoot", "windir", "COMSPEC", "PATHEXT", "SystemDrive"]) if (typeof process.env[k] === "string") env[k] = process.env[k];
  return Object.assign(env, { LOCALAPPDATA: sb.state, XDG_STATE_HOME: sb.state, HOME: sb.home, USERPROFILE: sb.home, TEMP: sb.tmp, TMP: sb.tmp, TMPDIR: sb.tmp, HTTP_PROXY: "http://127.0.0.1:9", HTTPS_PROXY: "http://127.0.0.1:9",
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: sb.gitconfig, D202_MOCK_LOG: sb.log, D202_MOCK_MODE: "ok", D202_MOCK_CLAIM: sb.claim, D202_MOCK_EVENTS: sb.events, D202_MOCK_PNG: sb.png, D202_MOCK_BODY: sb.body }, extra || {});
}
function sgit(sb, args) { const r = spawnSync("git", ["-C", sb.repo, "-c", "user.name=d202-sandbox", "-c", "user.email=sandbox@example.invalid", "-c", "core.autocrlf=false", ...args], { env: envFor(sb), encoding: "utf8", windowsHide: true }); if (r.status !== 0) throw new Error("sandbox git " + args.join(" ") + ": " + r.stderr); return r.stdout.trim(); }
const callsPath = (sb) => join(sb.repo, ...CALLS_REL.split("/")), registerPath = (sb) => join(sb.repo, ...REGISTER_REL.split("/"));
const editCalls = (sb, fn) => { const c = JSON.parse(readFileSync(callsPath(sb), "utf8")); fn(c); writeFileSync(callsPath(sb), JSON.stringify(c, null, 2) + "\n"); };
function sandbox({ base, branch = false } = {}) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "d202-sandbox-"))); ROOTS.push(root);
  const sb = { root, repo: join(root, "repo"), state: join(root, "state"), tmp: join(root, "tmp"), home: join(root, "home"), log: join(root, "fetch.log"), gitconfig: join(root, "gitconfig"), png: join(root, "out.png"), body: join(root, "body.json"), mock: join(root, "mock.mjs") };
  const reg = join(sb.state, "DenSejeApp", "one-shot-claims", "Moeller888-den-seje-app-frontend"); sb.claim = join(reg, CLAIM_FILE); sb.events = join(reg, EVENTS_FILE);
  sb.out = join(sb.home, "Documents", "DenSejeApp-artefacts", "d-202-northstar-base-figure");
  for (const d of [sb.repo, sb.state, sb.tmp, sb.home]) mkdirSync(d, { recursive: true });
  writeFileSync(sb.gitconfig, "[core]\n\tautocrlf = false\n[init]\n\tdefaultBranch = main\n"); writeFileSync(sb.mock, MOCK_SRC); writeFileSync(sb.log, ""); writeFileSync(sb.png, PNG);
  for (const rel of [...TRACKED, ".gitignore"]) { const dst = join(sb.repo, ...rel.split("/")); mkdirSync(dirname(dst), { recursive: true }); copyFileSync(repoFile(rel), dst); }
  if (base) base(sb);
  sgit(sb, ["init", "-q", "-b", "main"]); sgit(sb, ["add", "-A"]); sgit(sb, ["commit", "-q", "-m", "base"]); sgit(sb, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  if (branch) { sgit(sb, ["checkout", "-q", "-b", "local-d202"]); editCalls(sb, (c) => { c.note = "not merged"; }); sgit(sb, ["add", "-A"]); sgit(sb, ["commit", "-q", "-m", "not merged"]); }
  return sb;
}
const run = (sb, rel, args, extra) => { const r = spawnSync(process.execPath, ["--import", pathToFileURL(sb.mock).href, join(sb.repo, ...rel.split("/")), ...args], { cwd: sb.repo, env: envFor(sb, extra), encoding: "utf8", windowsHide: true, timeout: 180000 }); return { status: r.status, out: (r.stdout || "") + (r.stderr || "") }; };
const runAdapter = (sb, args, extra) => run(sb, ADAPTER_REL, args, extra);
const fetchLog = (sb) => readFileSync(sb.log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const KEY = { OPENAI_API_KEY: DUMMY_KEY };
function refusedBeforeClaim(sb, r, stage) {
  assert.equal(r.status, 1, r.out); assert.match(r.out, new RegExp("REFUSED \\[" + stage.replace(/[-[\]]/g, "\\$&") + "\\]"), r.out);
  assert.equal(existsSync(sb.claim) || existsSync(sb.events), false); assert.equal(fetchLog(sb).length, 0); assert.equal(existsSync(join(sb.home, "Documents")), false);
}

test("THE LIVE D-202 STATE: the dry run passes with the real pins and no credential, writes nothing; the old adapter sends nothing", () => {
  const sb = sandbox();
  const r = runAdapter(sb, ARGS); assert.equal(r.status, 0, r.out); assert.match(r.out, /DRY RUN PASSED/);
  assert.match(r.out, new RegExp("Image 1 North Star " + NORTHSTAR_SHA + " \\(the only image\\) · prompt " + PROMPT_V2_SHA));
  assert.equal(fetchLog(sb).length, 0); assert.equal(existsSync(sb.claim) || existsSync(join(sb.home, "Documents")), false);
  for (const id of ["a", "b"]) { const x = run(sb, OLD_ADAPTER_REL, ["--call-id=D-199-northstar-base-figure-" + id, "--claim-identity=D-199-northstar-base-figure-" + id + "-claim", "--send", "--owner-approval=D-199-" + id.toUpperCase()], KEY);
    assert.equal(x.status, 1, x.out); assert.match(x.out, /REFUSED \[authorisation\]/); }
  assert.equal(fetchLog(sb).length, 0, "the old B cannot be sent");
});
test("refused before the claim: an unmerged branch, a missing D-202 row, B reopened, the budget bent, a changed prompt pin, no key", () => {
  refusedBeforeClaim(...((sb) => [sb, runAdapter(sb, [...ARGS, ...SEND], KEY), "branch"])(sandbox({ branch: true })));
  refusedBeforeClaim(...((sb) => [sb, runAdapter(sb, [...ARGS, ...SEND], KEY), "register"])(sandbox({ base: (s) => writeFileSync(registerPath(s), readFileSync(registerPath(s), "utf8").split("\n").filter((l) => !l.startsWith("| **D-202** |")).join("\n")) })));
  for (const bend of [(c) => { const b = c.authorisedCalls.calls[1]; b.mandateState = "UNSPENT"; delete b.closedBy; }, (c) => { c.budget.remaining = 2; }, (c) => { c.budget.actuallySent = 0; },
    (c) => { c.authorisedCalls.calls[2].prompt.sha256 = "8076c3d1a6f7fd141af3fbacd9f7a8f21b8aa6bc8d6ead0dd018a2172f61fd99"; }, (c) => { c.authorisedCalls.calls.push({ ...c.authorisedCalls.calls[2], callId: "D-202-extra" }); }])
    refusedBeforeClaim(...((sb) => [sb, runAdapter(sb, [...ARGS, ...SEND], KEY), "authorisation"])(sandbox({ base: (s) => editCalls(s, bend) })));
  refusedBeforeClaim(...((sb) => [sb, runAdapter(sb, [...ARGS, ...SEND]), "key"])(sandbox()));
});
test("the one send: claim, dispatch record, ONE fetch of Northstar and prompt v2, output outside the repository, no second send", () => {
  const sb = sandbox(), r = runAdapter(sb, [...ARGS, ...SEND], KEY);
  assert.equal(r.status, 0, r.out);
  const L = fetchLog(sb); assert.equal(L.length, 1);
  assert.deepEqual([L[0].redirect, L[0].dummyKey, L[0].claimExistedAtCall, L[0].size, L[0].background, L[0].hasMask], ["error", true, true, "1024x1536", "transparent", false]);
  assert.deepEqual(parseEvents(L[0].eventsAtCall, CALL).records.map((x) => x.event), ["dispatch"]);
  assert.deepEqual([L[0].images, L[0].imageSha], [["Northstar Master v2.png"], [NORTHSTAR_SHA]]);
  assert.equal(L[0].prompt, readFileSync(repoFile(PROMPT_REL), "utf8"), "prompt v2, byte for byte");
  const m = JSON.parse(readFileSync(join(sb.out, "d202-base-figure-v2.request.json"), "utf8"));
  assert.deepEqual([m.outcome.classification, m.outcome.fetches, m.outcome.automaticRetry, m.accounting.actuallySent], ["RECEIVED_FOR_BF_CHECK", 1, false, 1]);
  assert.equal(sha256(readFileSync(join(sb.out, "d202-base-figure-v2.image-1.png"))), sha256(PNG));
  assert.equal(sgit(sb, ["status", "--porcelain"]), "", "nothing written into the repository");
  const again = runAdapter(sb, [...ARGS, ...SEND], KEY); assert.equal(again.status, 1); assert.match(again.out, /REFUSED \[claim-exists\]/); assert.equal(fetchLog(sb).length, 1);
});
test("an uncertain dispatch never permits a further send: a transport error counts as sent, and the call stays spent", () => {
  const sb = sandbox(), r = runAdapter(sb, [...ARGS, ...SEND], { ...KEY, D202_MOCK_MODE: "throw" });
  assert.equal(r.status, 3, r.out);
  const d = deriveAttempt({ claimPresent: existsSync(sb.claim), eventsText: readFileSync(sb.events, "utf8"), callId: CALL });
  assert.deepEqual([d.dispatch, d.result, d.actuallySent], ["started", "unknown", 1]);
  assert.equal(runAdapter(sb, [...ARGS, ...SEND], KEY).status, 1); assert.equal(fetchLog(sb).length, 1);
});
