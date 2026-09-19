// The R3 CORE-only underlay adapter — preparation only, and these tests hold it to that.
//
// The claim under test is not "sending is discouraged". It is that sending is IMPOSSIBLE from this
// file: no fetch, no request body, no credential, no claim creation, no output writing. That is a
// structural property, so most of these tests read the source and the exports rather than calling
// something and hoping.
//
// Everything runs offline. Nothing here can reach the API, because there is nothing in the adapter
// to reach it with.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync, mkdirSync, readdirSync, statSync, copyFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import * as C from "../../tools/avatar/openai-generate-r3-underlay-core.mjs";
import * as D139 from "../../tools/avatar/openai-generate-r3-underlay.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const ADAPTER = join(REPO, "tools", "avatar", "openai-generate-r3-underlay-core.mjs");
const SRC = readFileSync(ADAPTER, "utf8");
/** The same file with whole-line comments removed: prose may NAME what the code must not contain. */
const CODE = SRC.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
const CONTRACT = JSON.parse(readFileSync(join(REPO, "tools", "avatar", "fixtures", "r3", "r3-shadow-contract-v1.json"), "utf8"));
const FIX = join(REPO, "tools", "avatar", "fixtures", "r3-underlay");
const sha = (b) => createHash("sha256").update(b).digest("hex");
/** Where the adapter WOULD write, as a repository-relative path. Compared as a string; never opened. */
const OUT_RELATIVE = "tools/avatar/build/r3-underlay-core";
assert.equal(relative(REPO, C.OUT).split(sep).join("/"), OUT_RELATIVE);

// ── 1 · there is no send path, structurally ──────────────────────────────────────────────────

test("the adapter contains no fetch, no request body and no credential", () => {
  for (const forbidden of ["fetch(", "FormData", "new File(", "XMLHttpRequest", "https.request",
    "OPENAI_API_KEY", "Authorization", "Bearer "]) {
    assert.ok(!CODE.includes(forbidden), "the adapter must not contain " + JSON.stringify(forbidden));
  }
});

test("the adapter creates no claim and writes no file", () => {
  for (const forbidden of ["writeFileSync", "openSync", "mkdirSync", "renameSync", "appendFileSync", '"wx"', "createClaim"]) {
    assert.ok(!CODE.includes(forbidden), "the adapter must not contain " + JSON.stringify(forbidden));
  }
  // it imports only read-side fs
  const fsImport = CODE.split("\n").find((l) => l.startsWith("import") && l.includes("node:fs"));
  assert.equal(fsImport, 'import { readFileSync, existsSync } from "node:fs";');
});

test("no export can send: there is no performSingleRequest and no fetch injection point", () => {
  assert.equal(typeof C.performSingleRequest, "undefined");
  assert.equal(typeof C.buildBody, "undefined");
  assert.equal(typeof C.createClaim, "undefined");
  assert.equal(C.attemptSend.length <= 1, true, "attemptSend takes options only, never a fetch implementation");
  assert.ok(!/fetchImpl/.test(CODE), "there is no fetch implementation parameter anywhere");
});

// ── 2 · --send is refused, with any flags, and nothing happens ───────────────────────────────

test("attemptSend never sends, and reports it in every field", () => {
  const r = C.attemptSend({ contract: CONTRACT });
  assert.equal(r.sent, false);
  assert.equal(r.allowed, false);
  assert.equal(r.fetchCalled, false);
  assert.equal(r.claimCreated, false);
  assert.equal(r.outputWritten, false);
});

test("the refusal grounds are evaluated, and losing one changes nothing", () => {
  // D-142 changed the contract under this adapter: authorisedCalls now carries an entry for this
  // call id, so ground 2 no longer fires. That entry is a SPENT record of the incident, not a
  // permission — and the difference does not matter here, because ground 3 is unconditional and
  // this file has no send path either way.
  const r = C.attemptSend({ contract: CONTRACT });
  assert.equal(r.sent, false);
  assert.equal(r.allowed, false);
  assert.equal(r.fetchCalled, false);
  assert.deepEqual(r.grounds.slice().sort(), [C.REFUSAL.CONTRACT, C.REFUSAL.STRUCTURAL].sort());
  const byGround = Object.fromEntries(r.refusals.map((x) => [x.ground, x.detail]));
  assert.match(byGround[C.REFUSAL.CONTRACT], /SUPERSEDED BY D-142 — STILL NOT A PERMISSION/);
  assert.match(byGround[C.REFUSAL.CONTRACT], /only recognises the prepared, unauthorised state/);
  assert.match(byGround[C.REFUSAL.STRUCTURAL], /no send path is implemented/);
  // the entry that silenced ground 2 must be a spent record, never a live permission
  const match = CONTRACT.authorisedCalls.calls.filter((x) => x.callId === C.PROPOSED.callId);
  assert.equal(match.length, 1);
  assert.equal(match[0].mandateState, "SPENT");
  assert.equal(match[0].outcome, "UNKNOWN");
  assert.equal(match[0].neverReuse, true);
});

test("THE STRUCTURAL GROUND HOLDS EVEN IF A CONTRACT SATISFIED THE OTHER TWO", () => {
  // The test that makes the other two non-vacuous: hand the gate a contract that would authorise
  // the call, and it must still refuse — because this file cannot send regardless of permission.
  const permissive = JSON.parse(JSON.stringify(CONTRACT));
  permissive.preparedCall = { status: "SUPERSEDED", callId: C.PROPOSED.callId, authorises: "everything" };
  permissive.authorisedCalls = { count: 1, calls: [{ callId: C.PROPOSED.callId, decision: "D-142" }] };
  const r = C.attemptSend({ contract: permissive });
  assert.equal(r.allowed, false, "a permissive contract must not make this file able to send");
  assert.equal(r.sent, false);
  assert.ok(r.grounds.includes(C.REFUSAL.STRUCTURAL), "the structural ground must still be reported");
  // and the other two grounds correctly drop out, so they are genuinely evaluated
  assert.ok(!r.grounds.includes(C.REFUSAL.AUTHORISATION), "ground 2 must be satisfiable in principle");
});

test("sendGate cannot return allowed:true for any contract shape", () => {
  for (const contract of [
    null, undefined, {}, { preparedCall: null }, { authorisedCalls: { calls: [] } },
    { preparedCall: { status: "PREPARED — NOT AUTHORISED" }, authorisedCalls: { count: 1, calls: [{ callId: C.PROPOSED.callId }] } },
    CONTRACT,
  ]) {
    const g = C.sendGate({ contract });
    assert.equal(g.allowed, false, "allowed must be false for every input");
    assert.ok(g.refusals.length >= 1);
    assert.ok(g.grounds.includes(C.REFUSAL.STRUCTURAL));
  }
});

// ── D-145: the CLI is exercised in a SANDBOX, never against the real user identity ────────────
//
// These two tests used to run the CLI with `...process.env` and then look at the REAL D-142 claim
// path and the REAL output directory to show that nothing had appeared there. D-143 §8 forbids a
// test from reading, listing or checking absence on a production path — the D-142 incident began
// with a test that reached the real environment. The property is unchanged and is now proven where
// it can be proven safely: an explicit allowlist environment whose LOCALAPPDATA, XDG_STATE_HOME and
// TEMP/TMP/TMPDIR are sandbox directories, and — for the invariance test — a sandbox COPY of the
// repository, so the claim location and the output directory the CLI computes are both inside it.

/** Only these names are passed through from this process. No key, no user identity, no real paths. */
const SYSTEM_ENV = new Set(["SYSTEMROOT", "SYSTEMDRIVE", "WINDIR", "COMSPEC", "PATHEXT", "PATH",
  "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE", "OS"]);

/** A throwaway user identity: every path the adapter can resolve lands inside `root`. */
function isolated(root) {
  const env = {};
  for (const k of Object.keys(process.env)) if (SYSTEM_ENV.has(k.toUpperCase())) env[k] = process.env[k];
  const state = join(root, "state");
  const temp = join(root, "temp");
  const home = join(root, "home");
  for (const d of [state, temp, home]) mkdirSync(d, { recursive: true });
  Object.assign(env, { LOCALAPPDATA: state, XDG_STATE_HOME: state, TEMP: temp, TMP: temp, TMPDIR: temp,
    HOME: home, USERPROFILE: home, OPENAI_API_KEY: "" });
  // Windows copies these from the parent when a child's environment lacks them, so they are explicit.
  if (process.platform === "win32") {
    Object.assign(env, { HOMEDRIVE: home.slice(0, 2), HOMEPATH: home.slice(2), LOGONSERVER: "\\\\r3-core-sandbox",
      USERDOMAIN: "r3-core-sandbox", USERNAME: "r3-core-sandbox" });
  }
  return { env, state, temp, home };
}

/** The files the CLI reads, copied into a sandbox repository so its REPO and OUT are sandboxed. */
const CLI_INPUTS = [
  "tools/avatar/openai-generate-r3-underlay-core.mjs",
  "tools/avatar/build-r2-torso-occlusion-mask.mjs",
  "tools/avatar/fetch-dwebp.mjs",
  "tools/avatar/fixtures/r3/r3-shadow-contract-v1.json",
  "tools/avatar/fixtures/r3-underlay/r3-underlay-api-mask-core-v1.png",
  "tools/avatar/fixtures/r3-underlay/r3-underlay-prompt-v2.md",
  "tools/avatar/fixtures/r3-head-edit/r3-head-edit-v1.png",
  "tools/avatar/fixtures/r3-head-edit/r3-head-transition-v1.png",
  "assets/avatar/reference/Northstar Master v2.png",
  "docs/project-state.md",
];

function sandboxRepo(root) {
  const repo = join(root, "repo");
  for (const rel of CLI_INPUTS) {
    const dst = join(repo, ...rel.split("/"));
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(join(REPO, ...rel.split("/")), dst);
  }
  return repo;
}

/** Everything under `dir`, as relative paths — a listing that proves a directory did not change. */
function listing(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  const walk = (d, prefix) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      out.push(prefix + name);
      if (statSync(p).isDirectory()) walk(p, prefix + name + "/");
    }
  };
  walk(dir, "");
  return out;
}

test("the CLI refuses --send with any accompanying flags, and exits non-zero", () => {
  // Run the real CLI in a child process, offline, with a sandbox identity. It has no fetch, so this
  // cannot reach the network, and its claim location resolves inside the sandbox rather than at the
  // real per-user path.
  const root = mkdtempSync(join(tmpdir(), "d145-core-cli-"));
  try {
    const iso = isolated(root);
    const flagSets = [
      ["--send"],
      ["--send", "--owner-approval=D-142"],
      ["--send", "--owner-approval=D-141"],
      ["--send", "--force", "--yes", "--owner-approval=D-142-r3-underlay-core-v1"],
      ["--send", "--plan"],
    ];
    for (const flags of flagSets) {
      const r = spawnSync(process.execPath, [ADAPTER, ...flags], { encoding: "utf8", env: iso.env });
      assert.equal(r.status, 1, "exit code must be non-zero for " + flags.join(" "));
      assert.match(r.stdout, /--send WAS REQUESTED AND IS REFUSED/, "for " + flags.join(" "));
      assert.match(r.stdout, /sent: false {3}fetch called: false {3}claim created: false {3}output written: false/);
    }
    assert.deepEqual(listing(iso.state), [], "the sandbox claim location stays empty");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("running the CLI changes nothing about the claim or the output", () => {
  // INVARIANCE, not absence — the original property. The claim location and the output directory
  // are the ones the CLI itself computes, but inside a sandbox copy of the repository, so the real
  // D-142 claim (SPENT since the 2026-09-14 incident) and the real build area are never touched.
  const root = mkdtempSync(join(tmpdir(), "d145-core-run-"));
  try {
    const iso = isolated(root);
    const repo = sandboxRepo(root);
    const adapter = join(repo, "tools", "avatar", "openai-generate-r3-underlay-core.mjs");
    const claim = C.proposedClaimPath({ env: iso.env, platform: process.platform, tmpDir: iso.temp,
      homeDir: iso.home, repoRoot: repo });
    assert.equal(claim.ok, true, claim.why || "");
    assert.ok(claim.path.startsWith(iso.state), "the sandbox claim path stays in the sandbox: " + claim.path);
    const sandboxOut = join(repo, ...OUT_RELATIVE.split("/"));

    const claimBefore = existsSync(claim.path);
    const outBefore = existsSync(sandboxOut);
    const stateBefore = listing(iso.state);
    const repoBefore = listing(join(repo, "tools", "avatar", "build"));
    const r = spawnSync(process.execPath, [adapter, "--send", "--owner-approval=D-142"], { encoding: "utf8", env: iso.env });
    assert.equal(r.status, 1, "the sandboxed CLI must still refuse");
    assert.equal(existsSync(claim.path), claimBefore, "the claim's existence must be unchanged");
    assert.equal(existsSync(sandboxOut), outBefore, "no output directory may appear or disappear");
    assert.deepEqual(listing(iso.state), stateBefore, "nothing may appear in the claim location");
    assert.deepEqual(listing(join(repo, "tools", "avatar", "build")), repoBefore, "nothing may appear in the build area");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// ── 3 · the proposal is a proposal ───────────────────────────────────────────────────────────

test("the call id and claim identity are proposed, not decided", () => {
  assert.equal(C.PROPOSED.decision, "D-142");
  assert.equal(C.PROPOSED.callId, "D-142-r3-underlay-core-v1");
  assert.equal(C.PROPOSED.claimFilename, "D-142.claim.json");
  assert.match(C.PROPOSED.status, /PROPOSAL ONLY/);
  // The adapter's own constants still read as a proposal. The register has since overtaken them:
  // D-142 is decided, and it decided that this call id and this claim identity are SPENT. The
  // proposal is therefore dead, not pending — and neither fact gives this file anything to act on.
  const register = readFileSync(join(REPO, "docs", "project-state.md"), "utf8");
  const rows = register.split("\n").filter((l) => l.startsWith("| **D-142** |"));
  assert.equal(rows.length, 1, "D-142 must be exactly one register row");
  assert.match(rows[0], /MANDAT BRUGT VED HÆNDELSE/, "and that row records the incident");
  const rec = CONTRACT.authorisedCalls.calls.find((c) => c.callId === C.PROPOSED.callId);
  assert.ok(rec, "the call id appears in the contract only as the incident record");
  assert.equal(rec.mandateState, "SPENT");
  assert.equal(rec.neverReuse, true);
});

test("D-139's call id and claim are never reused", () => {
  assert.equal(C.NEVER_REUSE.callId, "D-139-r3-underlay-head-only-v1");
  assert.equal(C.NEVER_REUSE.claimFilename, "D-139.claim.json");
  assert.notEqual(C.PROPOSED.callId, C.NEVER_REUSE.callId);
  assert.notEqual(C.PROPOSED.claimFilename, C.NEVER_REUSE.claimFilename);
  // resolved against a SYNTHETIC identity: the real per-user claim location is never computed (D-145)
  const claim = C.proposedClaimPath({ repoRoot: REPO,
    env: { LOCALAPPDATA: "C:\\synthetic\\AppData\\Local", XDG_STATE_HOME: "/synthetic/state" },
    platform: process.platform, tmpDir: "/synthetic/tmp", homeDir: "/synthetic/home" });
  if (claim.ok) {
    assert.ok(claim.path.includes("D-142.claim.json"));
    assert.ok(!claim.path.includes("D-139"), "the proposed claim path must not point at D-139's");
  }
  // the adapter never reads or touches a D-139 claim
  assert.ok(!/claimState|existsSync\([^)]*D-139/.test(CODE));
});

test("the proposed claim resolves outside the repository and outside temp", () => {
  const win = C.proposedClaimPath({ env: { LOCALAPPDATA: "C:\\synthetic\\AppData\\Local" }, platform: "win32" });
  const posix = C.proposedClaimPath({ env: { XDG_STATE_HOME: "/synthetic/state" }, platform: "linux" });
  const here = process.platform === "win32" ? win : posix;
  assert.equal(here.ok, true, here.why || "");
  assert.equal(C.isInside(here.path, REPO), false);
  assert.equal(C.isInside(here.path, tmpdir()), false);
  for (const r of [win, posix]) assert.ok(r.path.endsWith("D-142.claim.json"));
});

// ── 4 · D-139's adapter is untouched ─────────────────────────────────────────────────────────

test("D-139's adapter is neither imported nor altered", () => {
  assert.ok(!CODE.includes("openai-generate-r3-underlay.mjs"), "the D-139 adapter must not be imported");
  const imports = CODE.split("\n").filter((l) => l.startsWith("import "));
  for (const line of imports) assert.ok(!/openai-/.test(line), "no other OpenAI adapter may be imported: " + line);
  // and D-139's own contract is intact
  assert.equal(D139.CALL_ID, "D-139-r3-underlay-head-only-v1");
  assert.equal(D139.API_MASK.name, "r3-underlay-api-mask-v1.png");
  assert.equal(D139.API_MASK.sha256, "28ff1ac00f6972697411ad29c5618f9ede4b5a0a4fd086a41ec0bfb5fe7561fb");
  assert.equal(D139.PROMPT_FILE.name, "r3-underlay-prompt.md");
  assert.equal(D139.PROMPT_FILE.sha256, "8a5cb283a4cb5803adf45d8d35e68a0c058a6604ffc9869ec58ea1ee514724f6");
});

test("the D-139 output is not reclassified", () => {
  assert.equal(C.D139_OUTPUT.verdict, "REJECTED");
  assert.equal(C.D139_OUTPUT.gate, "pre.transition-silhouette");
  assert.equal(C.D139_OUTPUT.differingPx, 644);
  assert.match(C.D139_OUTPUT.mayNotReclassify, /never reclassify, re-judge or promote/);
  assert.match(C.D139_OUTPUT.mayNotReclassify, /noRefit stands/);
});

// ── 5 · the request plan is bound to exactly the approved artefacts ──────────────────────────

test("the plan pins H1, Northstar, prompt v2, the CORE mask, the model and the parameters", () => {
  const plan = C.requestPlan({});
  assert.equal(plan.status, "PLAN ONLY — NOT AUTHORISED, NOT SENT");
  assert.equal(plan.endpoint, "https://api.openai.com/v1/images/edits");
  assert.equal(plan.model, "gpt-image-2-2026-04-21");
  assert.deepEqual(plan.parameters, { n: 1, quality: "high", size: "1024x1536", output_format: "png", background: "transparent" });
  assert.deepEqual(plan.inputOrder, ["Image 1", "Image 2"]);
  assert.equal(plan.inputs[0].sha256, "72875565ecd62b542a91156dbcca1399a434fe04634f4e737df71337be0d5af4");
  assert.equal(plan.inputs[0].maskApplies, true);
  assert.equal(plan.inputs[1].sha256, "3daf32e76bff9a53ec7d25cf148a230073cfd0da6a003d02a23c4292d139ff50");
  assert.equal(plan.inputs[1].maskApplies, false);
  assert.equal(plan.mask.sha256, "556fb973d6dd623828e4aab42d804bf05ab1df67c037498423afd607cec55dab");
  assert.equal(plan.prompt.fileSha256, "8a4e817f0a9171968211a2b4c90dff3d6507ca9dc6f3e73b5edc2bf9bc9ec141");
  assert.equal(plan.prompt.promptSha256, "76cf56fb408bb65d7458645095469aa9c38c8731d4f9db23872edb30954aa693");
  assert.deepEqual(plan.omitted, { input_fidelity: plan.omitted.input_fidelity });
  assert.match(plan.omitted.input_fidelity, /never sent/);
});

test("the plan describes the ONE permitted fetch, and marks it unimplemented", () => {
  const f = C.requestPlan({}).theOnePermittedFetch;
  assert.equal(f.count, 1);
  assert.equal(f.retry, false);
  assert.equal(f.fallbackModel, false);
  assert.equal(f.implemented, false);
  assert.match(f.claimBefore, /exclusive create \(flag "wx"\) of the claim IMMEDIATELY before the single fetch/);
  assert.match(f.spentOn, /any outcome/);
  assert.match(f.note, /DESCRIBED, NOT IMPLEMENTED/);
  assert.match(f.note, /cannot be switched on by a flag/);
});

test("the masks that must never be sent include D-139's, which marks the band editable", () => {
  assert.deepEqual([...C.NEVER_SENT_MASKS].sort(), [
    "r3-head-edit-v1.png", "r3-head-protect-v1.png", "r3-head-transition-v1.png", "r3-underlay-api-mask-v1.png",
  ].sort());
  assert.ok(C.NEVER_SENT_MASKS.includes("r3-underlay-api-mask-v1.png"),
    "D-139's mask must be on the never-sent list: it offers the band as editable");
});

// ── 6 · the acceptance pipeline a future output must survive ─────────────────────────────────

test("both PRE gates run before recomposition, then the post gates, then the owner review", () => {
  const p = C.ACCEPTANCE_PIPELINE;
  assert.deepEqual(p.map((g) => g.gate), [
    "pre.transition-silhouette",
    "pre.join-continuity",
    "post.protected-bytes",
    "post.transition-silhouette",
    "post.coverage",
    "owner-visual review of the neck seam",
  ]);
  assert.equal(p[0].when, "before recomposition");
  assert.equal(p[1].when, "before recomposition");
  assert.equal(p[1].decision, "D-141");
  for (const g of p.slice(2, 5)) assert.equal(g.when, "after recomposition");
  assert.equal(p[5].when, "after every machine gate is green");
  for (const g of p.slice(0, 2)) assert.match(g.onFailure, /no recomposed output is written/);
});

test("the owner-visual review covers the seam at every scale and background", () => {
  const review = C.ACCEPTANCE_PIPELINE[5];
  for (const s of ["1:1", "52x78", "110x165", "100x150", "180x270"]) assert.ok(review.rule.includes(s), "missing " + s);
  for (const b of ["light", "dark avatar gradient", "checkerboard"]) assert.ok(review.rule.includes(b), "missing " + b);
  assert.match(review.rule, /H1, the raw output and the recomposed output side by side/);
  assert.match(review.onFailure, /the machine gates do not substitute for it/);
});

// ── 7 · preflight verifies the real artefacts ────────────────────────────────────────────────

test("preflight verifies the CORE mask against its pin AND its pixel semantics", () => {
  const maskBuf = readFileSync(join(FIX, C.API_MASK.name));
  assert.equal(sha(maskBuf), C.API_MASK.sha256);
  const editBuf = readFileSync(join(REPO, "tools", "avatar", "fixtures", "r3-head-edit", "r3-head-edit-v1.png"));
  const transBuf = readFileSync(join(REPO, "tools", "avatar", "fixtures", "r3-head-edit", "r3-head-transition-v1.png"));
  const v = C.verifyMaskSemantics(maskBuf, editBuf, transBuf);
  assert.equal(v.ok, true, v.problems.join("; "));
  assert.equal(v.counts.editable, 123721);
  assert.equal(v.counts.protected, 1449143);
  assert.equal(v.counts.bandEditable, 0, "the band must be protected, not editable");
});

test("preflight refuses D-139's mask, which offers the band as editable", () => {
  const d139Mask = readFileSync(join(FIX, "r3-underlay-api-mask-v1.png"));
  const editBuf = readFileSync(join(REPO, "tools", "avatar", "fixtures", "r3-head-edit", "r3-head-edit-v1.png"));
  const transBuf = readFileSync(join(REPO, "tools", "avatar", "fixtures", "r3-head-edit", "r3-head-transition-v1.png"));
  const v = C.verifyMaskSemantics(d139Mask, editBuf, transBuf);
  assert.equal(v.ok, false, "the D-139 mask must not satisfy the CORE adapter");
  assert.ok(v.problems.some((p) => /band px as editable/.test(p)), v.problems.join("; "));
});

test("preflight extracts prompt v2 and matches both pins", () => {
  const raw = readFileSync(join(FIX, C.PROMPT_FILE.name));
  assert.equal(raw.length, 6242);
  assert.equal(sha(raw), C.PROMPT_FILE.sha256);
  const ex = C.extractPrompt(raw.toString("utf8"));
  assert.equal(ex.ok, true, ex.why || "");
  const body = Buffer.from(ex.prompt, "utf8");
  assert.equal(body.length, 2731);
  assert.equal(sha(body), C.PROMPT_BODY.sha256);
  assert.ok(ex.prompt.endsWith("\n") && !ex.prompt.endsWith("\n\n"));
});

test("preflight refuses D-139's prompt: it lacks the v2 sections", () => {
  const v1 = readFileSync(join(FIX, "r3-underlay-prompt.md"), "utf8");
  const ex = C.extractPrompt(v1);
  assert.equal(ex.ok, false);
  assert.match(ex.why, /missing required section/);
});

test("H1 is external and never guessed", () => {
  assert.equal(C.INPUTS[0].external, true);
  assert.equal(C.INPUTS[1].external, false);
  const none = C.resolveH1Path({ argv: [], env: {} });
  assert.equal(none.ok, false);
  assert.match(none.why, /--h1|FITTING_BASE_V1_PATH/);
  assert.equal(C.resolveH1Path({ argv: ["--h1=/x/h1.png"], env: {} }).path, "/x/h1.png");
  assert.equal(C.resolveH1Path({ argv: [], env: { FITTING_BASE_V1_PATH: "/z/h1.png" } }).path, "/z/h1.png");
  assert.ok(!CODE.includes("copyFileSync"), "H1 is never copied into the repository");
});

test("preflight refuses cleanly when H1 is absent, as it is in CI", () => {
  const dir = mkdtempSync(join(tmpdir(), "d142-"));
  const pf = C.preflight({ argv: [], env: {}, claimPath: join(dir, "c.json") });
  assert.equal(pf.ok, false);
  assert.ok(pf.problems.some((p) => /H1 is external/.test(p)), pf.problems.join("; "));
  assert.equal(readdirSync(dir).length, 0, "a failed preflight creates nothing");
  rmSync(dir, { recursive: true, force: true });
});

test("preflight requires every decision this preparation rests on", () => {
  assert.deepEqual([...C.REQUIRED_DECISIONS], ["D-132", "D-133", "D-139", "D-140", "D-141"]);
  for (const id of C.REQUIRED_DECISIONS) assert.equal(C.decisionExists(id).found, true, id + " must be in the register");
  // D-142 is now decided — as an incident record. Being in the register is not a send permission,
  // and this adapter has no send path for one to attach to.
  assert.equal(C.decisionExists("D-142").found, true, "D-142 is a register row");
  assert.ok(!C.REQUIRED_DECISIONS.includes("D-142"), "it is not a precondition of this preparation");
});
