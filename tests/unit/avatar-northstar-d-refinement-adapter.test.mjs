// The D-121 refinement adapter spends money exactly once. These tests guard the contract that
// decides what that one request contains, and the fail-closed rule that decides whether it can ever
// be spent twice.
//
// Everything here runs OFFLINE on a FRESH CLONE. No test contacts OpenAI, no test depends on a real
// OPENAI_API_KEY even when one is set in the environment, and NO TEST EVER WRITES TO THE REAL
// %LOCALAPPDATA% CLAIM LOCATION: the key is always injected as a dummy string, the single fetch is
// always injected as a mock, and every claim write goes to an injected throwaway directory. The
// resolver itself is tested purely functionally, with an injected environment.
//
// All five request inputs are tracked fixtures (D-121 the prompt, D-122 Image 1, D-123 Images 2-4),
// so their real bytes are asserted rather than trusted.
//
// The CLI is exercised as a subprocess, which is the only honest way to prove that a dry run creates
// no directory, no claim, no output and no manifest. Those subprocesses are given a dummy key and
// never the owner-approval token, so no code path can reach the network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, existsSync, copyFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { tmpdir, homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  ENDPOINT, MODEL, SIZE, QUALITY, OUTPUT_FORMAT, BACKGROUND, N,
  RETRY, FALLBACK_MODEL, AUTO_PROMPT_EDIT, FORBIDDEN_FIELDS, IMAGE_FIELD,
  REQUIRED_DECISIONS, OWNER_APPROVAL_FLAG, INPUTS, PROMPT_FILE, PROMPT_BODY,
  FIXTURES, REGISTER, EXPECT_BIT_DEPTH, EXPECT_COLOUR_TYPE,
  REPO_IDENTITY, CLAIM_APP_DIR, CLAIM_SUBDIR, CLAIM_FILENAME,
  isInside, resolveClaimPath, outputPaths, readPngHeader, validatePngHeader, decodeStrictBase64,
  extractPrompt, decisionExists, claimState, createClaim, preflight, requestConfig, buildBody,
  validateResponsePayload, performSingleRequest, adapterSelfSha,
} from "../../tools/avatar/openai-refine-northstar-d.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const ROOT_CLONE = join(REPO, "..");           // the second clone of the same GitHub repository
const ADAPTER = join(REPO, "tools", "avatar", "openai-refine-northstar-d.mjs");
const SRC = readFileSync(ADAPTER, "utf8");
const CODE = SRC.replace(/^\s*\/\/.*$/gm, "");   // comments are documentation, not behaviour

const sha = (b) => createHash("sha256").update(b).digest("hex");
const DUMMY_KEY = "test-key-not-a-real-credential";
let tmpSeq = 0;
const freshDir = (tag) => mkdtempSync(join(tmpdir(), "d121-" + tag + "-" + (tmpSeq++) + "-"));
/** A claim path inside a throwaway directory. The real user location is never written to. */
const throwawayClaim = (tag) => join(freshDir(tag), "D-121.claim.json");

/** A fixtures directory that is a byte copy of the tracked one, so a test can damage one file. */
function copyFixtures(mutate) {
  const dir = freshDir("fix");
  for (const n of [...INPUTS.map((i) => i.name), PROMPT_FILE.name]) copyFileSync(join(FIXTURES, n), join(dir, n));
  if (typeof mutate === "function") mutate(dir);
  return dir;
}

/** A mock fetch that records every call. The real global fetch is never used by any test. */
function mockFetch(impl) {
  const calls = [];
  const fn = async (url, init) => { calls.push({ url, init }); return impl(url, init); };
  fn.calls = calls;
  return fn;
}
const mockResponse = (status, body, headers) => ({
  status, text: async () => body,
  headers: { get: (k) => (headers && Object.prototype.hasOwnProperty.call(headers, k) ? headers[k] : null) },
});

/** A genuinely valid 1024x1536 8-bit RGBA PNG: the tracked Image 1 fixture itself. */
const VALID_PNG = readFileSync(join(FIXTURES, INPUTS[0].name));
const okBody = (buf) => JSON.stringify({ data: [{ b64_json: (buf || VALID_PNG).toString("base64") }] });

/** A passing preflight against the REAL tracked fixtures, writing into throwaway directories. */
const realPreflight = (outDir, claimPath) => preflight({ outDir, claimPath: claimPath || throwawayClaim("pf"), apiKey: DUMMY_KEY });

// ── 1-3: the five tracked fixtures, on a fresh clone ─────────────────────────────────────────

test("1. all five request fixtures are readable from the tracked paths", () => {
  assert.ok(!FIXTURES.includes(join("avatar", "build")), "fixtures must not live under tools/avatar/build/");
  for (const n of [...INPUTS.map((i) => i.name), PROMPT_FILE.name]) {
    assert.ok(existsSync(join(FIXTURES, n)), n + " must exist in the repository");
  }
});

test("2. every byte count and hash matches D-121, D-122 and D-123", () => {
  for (const i of INPUTS) {
    const buf = readFileSync(join(FIXTURES, i.name));
    assert.equal(buf.length, i.bytes, i.role + " byte count");
    assert.equal(sha(buf), i.sha256, i.role + " sha256");
  }
  const raw = readFileSync(join(FIXTURES, PROMPT_FILE.name));
  assert.equal(raw.length, PROMPT_FILE.bytes);
  assert.equal(sha(raw), PROMPT_FILE.sha256);
  const ex = extractPrompt(raw.toString("utf8"));
  assert.equal(ex.ok, true, ex.why);
  const body = Buffer.from(ex.prompt, "utf8");
  assert.equal(body.length, PROMPT_BODY.bytes);
  assert.equal(sha(body), PROMPT_BODY.sha256);
});

test("3. all four PNGs carry the expected IHDR properties", () => {
  for (const i of INPUTS) {
    const h = readPngHeader(readFileSync(join(FIXTURES, i.name)));
    assert.equal(h.ok, true, i.role + ": " + h.why);
    assert.equal(h.width, 1024, i.role + " width");
    assert.equal(h.height, 1536, i.role + " height");
    assert.equal(h.bitDepth, EXPECT_BIT_DEPTH, i.role + " bit depth");
    assert.equal(h.colourType, EXPECT_COLOUR_TYPE, i.role + " colour type");
  }
});

test("the pinned contract values are exactly what D-121 records", () => {
  assert.equal(ENDPOINT, "https://api.openai.com/v1/images/edits");
  assert.equal(MODEL, "gpt-image-2-2026-04-21");
  assert.equal(N, 1);
  assert.equal(SIZE, "1024x1536");
  assert.equal(QUALITY, "high");
  assert.equal(OUTPUT_FORMAT, "png");
  assert.equal(BACKGROUND, "transparent");
  assert.equal(RETRY, false);
  assert.equal(FALLBACK_MODEL, false);
  assert.equal(AUTO_PROMPT_EDIT, false);
  assert.deepEqual(REQUIRED_DECISIONS, ["D-121", "D-122", "D-123"]);
  assert.deepEqual(INPUTS.map((i) => i.role), ["Image 1", "Image 2", "Image 3", "Image 4"]);
  assert.deepEqual(INPUTS.map((i) => i.name),
    ["candidate-input-v1.png", "geometry-plate-bald-nude.png", "geometry-silhouette.png", "geometry-reference-transparent.png"]);
});

test("no request input is read from the gitignored build area", () => {
  const reads = CODE.match(/join\(\s*fixturesDir[^)]*\)/g) || [];
  assert.ok(reads.length >= 2, "inputs must be read from the fixtures directory");
  const buildUses = CODE.match(/"build"/g) || [];
  assert.equal(buildUses.length, 1, "build/ may appear once, as the OUTPUT directory only");
});

// ── 4-8: the multipart body ──────────────────────────────────────────────────────────────────

test("4. the body carries exactly four images, in the binding Image 1-4 order", () => {
  const pf = realPreflight(freshDir("body"));
  assert.equal(pf.ok, true, pf.problems.join("; "));
  const images = buildBody(pf).getAll(IMAGE_FIELD);
  assert.equal(images.length, 4);
  assert.deepEqual(images.map((f) => f.name), INPUTS.map((i) => i.name));
});

test("5. each multipart part carries the BYTES of the right fixture, not just the name", async () => {
  const images = buildBody(realPreflight(freshDir("bytes"))).getAll(IMAGE_FIELD);
  for (let i = 0; i < INPUTS.length; i++) {
    const sent = Buffer.from(await images[i].arrayBuffer());
    const fixture = readFileSync(join(FIXTURES, INPUTS[i].name));
    assert.equal(sent.length, INPUTS[i].bytes, INPUTS[i].role + " length");
    assert.equal(sha(sent), INPUTS[i].sha256, INPUTS[i].role + " hash");
    assert.equal(Buffer.compare(sent, fixture), 0, INPUTS[i].role + " bytes must equal the tracked fixture");
    assert.equal(images[i].type, "image/png");
  }
});

test("6. the prompt in the body is the tracked prompt, byte for byte", () => {
  const sent = buildBody(realPreflight(freshDir("prompt"))).get("prompt");
  const expected = extractPrompt(readFileSync(join(FIXTURES, PROMPT_FILE.name)).toString("utf8")).prompt;
  assert.equal(sent, expected);
  assert.equal(Buffer.byteLength(sent, "utf8"), PROMPT_BODY.bytes);
  assert.equal(sha(Buffer.from(sent, "utf8")), PROMPT_BODY.sha256);
});

test("7. the model and every parameter in the body are exact", () => {
  const fd = buildBody(realPreflight(freshDir("params")));
  assert.equal(fd.get("model"), "gpt-image-2-2026-04-21");
  assert.equal(fd.get("n"), "1");
  assert.equal(fd.get("size"), "1024x1536");
  assert.equal(fd.get("quality"), "high");
  assert.equal(fd.get("output_format"), "png");
  assert.equal(fd.get("background"), "transparent");
});

test("8. mask and input_fidelity are absent from the body", () => {
  const fd = buildBody(realPreflight(freshDir("forbidden")));
  for (const bad of FORBIDDEN_FIELDS) assert.equal(fd.has(bad), false, bad + " is in the body");
  assert.deepEqual([...FORBIDDEN_FIELDS].sort(), ["input_fidelity", "mask"]);
});

test("the body refuses a broken order, a wrong count, or a failed preflight", () => {
  const pf = realPreflight(freshDir("guards"));
  assert.throws(() => buildBody({ ...pf, files: pf.files.slice(0, 3) }), /expected 4 images/);
  assert.throws(() => buildBody({ ...pf, files: [pf.files[1], pf.files[0], pf.files[2], pf.files[3]] }), /image order broken/);
  assert.throws(() => buildBody({ ...pf, ok: false }), /failed preflight/);
  assert.throws(() => buildBody({ ...pf, prompt: null }), /without a prompt/);
  assert.throws(() => buildBody(null), /failed preflight/);
});
// ── the claim LOCATION: one mandate, one file, outside every repository ──────────────────────

const WIN_ENV = { LOCALAPPDATA: "C:\\Users\\Someone\\AppData\\Local" };
const winClaim = (repoRoot) => resolveClaimPath({
  env: WIN_ENV, platform: "win32", repoRoot: repoRoot || "C:\\repo",
  tmpDir: "C:\\Users\\Someone\\AppData\\Local\\Temp", homeDir: "C:\\Users\\Someone",
});

test("CLAIM: the Windows location is exactly the authorised per-user path", () => {
  const r = winClaim();
  assert.equal(r.ok, true, r.why);
  assert.equal(r.scope, "windows-user-local-appdata");
  assert.equal(r.path, join("C:\\Users\\Someone\\AppData\\Local", CLAIM_APP_DIR, CLAIM_SUBDIR, REPO_IDENTITY, CLAIM_FILENAME));
  assert.equal(REPO_IDENTITY, "Moeller888-den-seje-app-frontend");
  assert.equal(CLAIM_APP_DIR, "DenSejeApp");
  assert.equal(CLAIM_SUBDIR, "one-shot-claims");
  assert.equal(CLAIM_FILENAME, "D-121.claim.json");
});

test("CLAIM: a missing or empty LOCALAPPDATA fails, with no fallback anywhere", () => {
  for (const env of [{}, { LOCALAPPDATA: "" }, { LOCALAPPDATA: "   " }, { LOCALAPPDATA: null }]) {
    const r = resolveClaimPath({ env, platform: "win32", repoRoot: "C:\\repo", tmpDir: "C:\\temp", homeDir: "C:\\home" });
    assert.equal(r.ok, false, "a missing LOCALAPPDATA must fail");
    assert.equal(r.path, null, "no path may be produced");
    assert.match(r.why, /LOCALAPPDATA/);
    assert.match(r.why, /refusing to fall back/);
  }
  // and the failure reaches the send preflight, before any claim and before any fetch
  assert.ok(/CLAIM LOCATION UNAVAILABLE/.test(CODE), "preflight must surface an unresolvable claim location");
});

test("CLAIM: other platforms use a deterministic user state directory, never temp or the repo", () => {
  const xdg = resolveClaimPath({ env: { XDG_STATE_HOME: "/home/u/.local/state" }, platform: "linux",
    repoRoot: "/srv/repo", tmpDir: "/tmp", homeDir: "/home/u" });
  assert.equal(xdg.ok, true, xdg.why);
  assert.equal(xdg.scope, "xdg-state-home");
  assert.equal(xdg.path, join("/home/u/.local/state", CLAIM_APP_DIR, CLAIM_SUBDIR, REPO_IDENTITY, CLAIM_FILENAME));

  const home = resolveClaimPath({ env: {}, platform: "linux", repoRoot: "/srv/repo", tmpDir: "/tmp", homeDir: "/home/u" });
  assert.equal(home.ok, true, home.why);
  assert.equal(home.scope, "home-local-state");
  assert.equal(home.path, join("/home/u", ".local", "state", CLAIM_APP_DIR, CLAIM_SUBDIR, REPO_IDENTITY, CLAIM_FILENAME));

  const nothing = resolveClaimPath({ env: {}, platform: "linux", repoRoot: "/srv/repo", tmpDir: "/tmp", homeDir: "" });
  assert.equal(nothing.ok, false, "with no home and no XDG there must be no fallback");
  assert.match(nothing.why, /refusing to fall back/);
});

test("CLAIM: a location that would land inside the repo or temp is refused", () => {
  // Posix-style paths on purpose: they are real containment on BOTH platforms, whereas a
  // Windows-style path is a single filename segment on Linux and would make this guard vacuous
  // there — which is exactly how this test first passed locally and failed on CI.
  const inRepo = resolveClaimPath({ env: { XDG_STATE_HOME: "/srv/repo/state" }, platform: "linux",
    repoRoot: "/srv/repo", tmpDir: "/scratch/tmp", homeDir: "/home/u" });
  assert.equal(inRepo.ok, false, "a claim inside the repository must be refused");
  assert.match(inRepo.why, /inside the repository/);

  const inTemp = resolveClaimPath({ env: { XDG_STATE_HOME: "/scratch/tmp/state" }, platform: "linux",
    repoRoot: "/srv/repo", tmpDir: "/scratch/tmp", homeDir: "/home/u" });
  assert.equal(inTemp.ok, false, "a claim inside temp must be refused");
  assert.match(inTemp.why, /inside the temp directory/);

  // and the same two guards on the Windows branch, where backslash paths are real containment
  if (process.platform === "win32") {
    const winInRepo = resolveClaimPath({ env: { LOCALAPPDATA: "C:\\repo\\state" }, platform: "win32",
      repoRoot: "C:\\repo", tmpDir: "C:\\temp", homeDir: "C:\\home" });
    assert.equal(winInRepo.ok, false, "a claim inside the repository must be refused");
    assert.match(winInRepo.why, /inside the repository/);

    const winInTemp = resolveClaimPath({ env: { LOCALAPPDATA: "C:\\temp\\state" }, platform: "win32",
      repoRoot: "C:\\repo", tmpDir: "C:\\temp", homeDir: "C:\\home" });
    assert.equal(winInTemp.ok, false, "a claim inside temp must be refused");
    assert.match(winInTemp.why, /inside the temp directory/);
  }
});

test("CROSS-CLONE: both clones of the same repository resolve to the SAME claim file", () => {
  // This is the whole point. A repo-local claim gave each clone its own mandate; this one cannot.
  const fromFrontend = winClaim("C:\\Users\\Someone\\Documents\\APP\\APP\\den-seje-app-frontend");
  const fromRoot = winClaim("C:\\Users\\Someone\\Documents\\APP\\APP");
  assert.equal(fromFrontend.ok, true);
  assert.equal(fromRoot.ok, true);
  assert.equal(fromFrontend.path, fromRoot.path, "the two clones must share one claim file");
  // and the path is derived from the REPOSITORY IDENTITY, not from the checkout directory
  // The path is built from the repository identity only; no part of either checkout appears in it.
  const segments = fromFrontend.path.split(/[\\/]/);
  assert.equal(segments.filter((s) => s === REPO_IDENTITY).length, 1, "the identity must appear as exactly one segment");
  for (const checkoutOnly of ["Documents", "APP", "den-seje-app-frontend"]) {
    assert.ok(!segments.includes(checkoutOnly), "a checkout directory segment leaked into the claim path: " + checkoutOnly);
  }
});

test("CROSS-CLONE: on this machine the claim sits outside BOTH repositories and outside temp", () => {
  const r = resolveClaimPath({ repoRoot: REPO });
  assert.equal(r.ok, true, r.why);
  for (const root of [REPO, ROOT_CLONE]) {
    assert.equal(isInside(r.path, root), false, "the claim must not be inside " + root);
  }
  assert.equal(isInside(r.path, tmpdir()), false, "the claim must not be inside the temp directory");
  assert.equal(isInside(r.path, join(REPO, "tools", "avatar", "build")), false, "the claim must not be in the build area");
  // resolving from the other clone's root gives the same file
  assert.equal(resolveClaimPath({ repoRoot: ROOT_CLONE }).path, r.path, "both clones resolve to one claim");
  if (process.platform === "win32") {
    assert.ok(r.path.startsWith(process.env.LOCALAPPDATA), "the claim must live under %LOCALAPPDATA%");
  }
});

test("CROSS-CLONE: a claim taken through one repo root blocks a call made through the other", async () => {
  // Simulated roots, one shared claim file — exactly the situation two clones create.
  const shared = throwawayClaim("shared");
  const outA = freshDir("cloneA");
  const outB = freshDir("cloneB");
  const pfA = realPreflight(outA, shared);
  assert.equal(pfA.ok, true, pfA.problems.join("; "));
  const fetchA = mockFetch(async () => mockResponse(200, okBody()));
  const rA = await performSingleRequest({ pf: pfA, fetchImpl: fetchA, apiKey: DUMMY_KEY, outDir: outA, claimPath: shared });
  assert.equal(rA.ok, true, rA.reason);
  assert.equal(fetchA.calls.length, 1);

  // the second clone sees the same claim and refuses before fetch
  const pfB = preflight({ outDir: outB, claimPath: shared, apiKey: DUMMY_KEY });
  assert.equal(pfB.ok, false, "the second clone must fail preflight on the shared claim");
  assert.ok(pfB.problems.some((p) => /MANDATE ALREADY SPENT/.test(p)));
  const fetchB = mockFetch(async () => mockResponse(200, okBody()));
  const rB = await performSingleRequest({ pf: { ...pfB, ok: true }, fetchImpl: fetchB, apiKey: DUMMY_KEY, outDir: outB, claimPath: shared });
  assert.equal(rB.ok, false);
  assert.equal(rB.stage, "claim-exists");
  assert.equal(fetchB.calls.length, 0, "the second clone must not send");
});

test("CLAIM: there is no CLI bypass — no --claim-path, --force or --reset-claim", () => {
  // The header comment names the flags that deliberately do NOT exist, so assert on the CODE and on
  // the argv surface itself rather than on the prose that explains the decision.
  for (const flag of ["--claim-path", "--force", "--reset-claim", "--clear-claim", "--ignore-claim", "--again"]) {
    assert.ok(!CODE.includes(flag), "a bypass flag exists: " + flag);
  }
  const argvFlags = [...CODE.matchAll(/argv\.includes\(([^)]*)\)/g)].map((m) => m[1].trim());
  assert.deepEqual(argvFlags, ['"--send"', "OWNER_APPROVAL_FLAG", '"--print-prompt"'],
    "the CLI reads exactly three flags, and none of them touches the claim");
  // the CLI never passes a claimPath; only tests may inject one
  assert.ok(!/performSingleRequest\(\{[^}]*claimPath/.test(CODE.slice(CODE.indexOf("isMain"))),
    "the CLI must not pass a claim path");
  assert.ok(/resolveClaimPath\(\{\s*repoRoot:\s*REPO\s*\}\)/.test(CODE), "the real path must come from the resolver");
});

test("CLAIM: nothing in the adapter can remove, rename, reset or overwrite the claim", () => {
  assert.ok(!/unlink/.test(CODE), "something deletes a file");
  assert.ok(!/rmSync|\brmdir/.test(CODE), "something removes a path");
  assert.ok(!/truncateSync|ftruncate/.test(CODE), "something truncates a file");
  assert.ok(!/"w"|'w'|flag:\s*["']w["']/.test(CODE.slice(CODE.indexOf("createClaim"), CODE.indexOf("writeAtomic"))),
    "the claim must never be opened for plain writing");
  // the claim is only ever opened exclusively; it is never opened for writing any other way
  assert.equal((CODE.match(/openSync\(/g) || []).length, 1, "there must be exactly one open of the claim");
  assert.ok(/openSync\(claimPath,\s*"wx"\)/.test(CODE), "the claim must be created with an exclusive wx open");
  // renameSync exists only for the atomic OUTPUT write, and never targets the claim
  const renames = CODE.match(/renameSync\([^)]*\)/g) || [];
  assert.deepEqual(renames, ["renameSync(partial, target)"], "rename may only serve the atomic output write");
});
// ── 9-11: the CLI cannot reach the network by accident ───────────────────────────────────────

/** Runs the real CLI with a dummy key and never the approval token. */
function runCli(args) {
  return spawnSync(process.execPath, [ADAPTER, ...args], {
    cwd: REPO, encoding: "utf8", env: { ...process.env, OPENAI_API_KEY: DUMMY_KEY },
  });
}
const REAL_CLAIM = resolveClaimPath({ repoRoot: REPO });
const realOut = outputPaths();

// WHY THESE THREE TESTS ARE STATE-AWARE
// D-121 authorises exactly ONE request. Once it has been made, the claim file exists on that
// machine FOREVER — that is the whole fail-closed design. These tests originally asserted that the
// claim does not exist, which quietly encoded a precondition they never stated: "the mandate is
// still unspent". The moment the authorised call was made they began to fail, on a tool that was
// behaving exactly as designed.
//
// The fix is not to skip them. It is to assert what is true in BOTH states, which is strictly more
// coverage than before: whatever the mandate's state, a run without both flags must produce NO
// output, NO manifest, and must neither create the claim nor alter one that already exists. Only
// the exit code and the message differ, and each is asserted for its own state.
const MANDATE_SPENT = existsSync(REAL_CLAIM.path);

/** The claim as it is right now: absent, or present with these exact bytes. */
const claimFingerprint = () => (existsSync(REAL_CLAIM.path)
  ? { present: true, bytes: readFileSync(REAL_CLAIM.path).length, sha: sha(readFileSync(REAL_CLAIM.path)) }
  : { present: false, dirExists: existsSync(dirname(REAL_CLAIM.path)) });

/** True in every state: a run without both flags writes no output and no manifest. */
const noOutputs = (label) => {
  for (const p of [realOut.raw, realOut.manifest]) {
    assert.equal(existsSync(p), false, label + ": " + p + " must not exist");
  }
};

/** True in every state: the claim is neither created nor modified by a run that does not send. */
const claimUntouched = (label, before) => {
  const now = claimFingerprint();
  assert.equal(now.present, before.present, label + ": the claim's existence changed");
  if (before.present) {
    assert.equal(now.bytes, before.bytes, label + ": the claim's size changed");
    assert.equal(now.sha, before.sha, label + ": the claim's bytes changed — it must never be rewritten");
  } else {
    assert.equal(now.dirExists, before.dirExists, label + ": the claim directory was created");
    assert.equal(existsSync(REAL_CLAIM.path), false, label + ": a claim was created without sending");
  }
};

/** Asserts the outcome of a run that must not send, for whichever state this machine is in. */
const assertDidNotSend = (r, label) => {
  noOutputs(label);
  if (MANDATE_SPENT) {
    // The mandate is spent, so preflight refuses before anything else. That is the design working.
    assert.equal(r.status, 1, label + ": a spent mandate must fail preflight");
    assert.match(r.stderr, /PREFLIGHT FAILED/, label);
    assert.match(r.stderr, /MANDATE ALREADY SPENT/, label);
    assert.match(r.stdout, /SPENT — the claim file exists/, label);
  } else {
    assert.equal(r.status, 0, label + ": " + r.stderr);
    assert.match(r.stdout, /NOTHING WAS SENT/, label);
    assert.match(r.stdout, /UNSPENT/, label);
  }
};

test("9. a run with no flags sends nothing, whatever the mandate's state", () => {
  const before = claimFingerprint();
  noOutputs("before");
  const r = runCli([]);
  assertDidNotSend(r, "plain dry run");
  claimUntouched("plain dry run", before);
  // these hold in both states — the tool always shows where the claim lives and where inputs come from
  assert.match(r.stdout, /TRACKED FIXTURES ONLY/);
  assert.match(r.stdout, /claim scope\s*:/, "the run must show the claim scope");
  assert.match(r.stdout, /claim path\s*:/, "the run must show the resolved claim path");
  assert.match(r.stdout, /outside repo\s*:\s*true/, "the claim must be outside the repository");
  if (!MANDATE_SPENT) {
    assert.match(r.stdout, /No directory, no claim, no output and no manifest were written/);
  }
});

test("10. one missing flag sends nothing, whatever the mandate's state", () => {
  for (const args of [["--send"], [OWNER_APPROVAL_FLAG]]) {
    const before = claimFingerprint();
    const r = runCli(args);
    assertDidNotSend(r, "single flag " + args.join(" "));
    claimUntouched("single flag " + args.join(" "), before);
  }
});

test("11. a wrong owner token sends nothing, whatever the mandate's state", () => {
  for (const bad of ["--owner-approval=D-999", "--owner-approval=D-122", "--owner-approval="]) {
    const before = claimFingerprint();
    const r = runCli(["--send", bad]);
    assertDidNotSend(r, "wrong token " + bad);
    claimUntouched("wrong token " + bad, before);
  }
});

test("the mandate's state is reported, so a failure here is never a mystery", () => {
  // Not an assertion about which state is right — both are legitimate. It records which one this
  // machine is in, so the three tests above can be read without guessing.
  assert.ok(typeof MANDATE_SPENT === "boolean");
  assert.ok(REAL_CLAIM.ok, "the claim location must resolve: " + REAL_CLAIM.why);
  assert.equal(isInside(REAL_CLAIM.path, REPO), false, "the claim must live outside the repository");
});
// ── 12-14: preflight refuses, before any claim ───────────────────────────────────────────────

test("12. a missing, absent or duplicated register row refuses", () => {
  const dir = freshDir("reg");
  assert.equal(decisionExists("D-121", join(dir, "nope.md")).found, false);
  const empty = join(dir, "empty.md");
  writeFileSync(empty, "# register\n\nno rows\n", "utf8");
  assert.equal(decisionExists("D-121", empty).found, false);
  const dupe = join(dir, "dupe.md");
  writeFileSync(dupe, "| **D-121** | a |\n| **D-121** | b |\n", "utf8");
  const d = decisionExists("D-121", dupe);
  assert.equal(d.found, false, "a duplicated row must refuse; the register is append-only");
  assert.match(d.why, /appears 2 times/);

  for (const missing of REQUIRED_DECISIONS) {
    const reg = join(dir, "without-" + missing + ".md");
    writeFileSync(reg, REQUIRED_DECISIONS.filter((x) => x !== missing).map((x) => "| **" + x + "** | row |").join("\n") + "\n", "utf8");
    const claimPath = throwawayClaim("reg");
    const pf = preflight({ registerPath: reg, outDir: freshDir("reg-out"), claimPath, apiKey: DUMMY_KEY });
    assert.equal(pf.ok, false, "a register without " + missing + " must fail preflight");
    assert.ok(pf.problems.some((p) => p.includes(missing)));
    assert.equal(existsSync(claimPath), false, "preflight must never create a claim");
  }
  const good = join(dir, "all-three.md");
  writeFileSync(good, REQUIRED_DECISIONS.map((x) => "| **" + x + "** | row |").join("\n") + "\n", "utf8");
  const pfOk = preflight({ registerPath: good, outDir: freshDir("reg-ok"), claimPath: throwawayClaim("reg-ok"), apiKey: DUMMY_KEY });
  assert.equal(pfOk.ok, true, pfOk.problems.join("; "));
  for (const id of REQUIRED_DECISIONS) assert.equal(decisionExists(id, REGISTER).found, true, id + " must be in the real register");
});

test("13. a missing fixture refuses without a claim and without fetch", async () => {
  for (const name of [...INPUTS.map((i) => i.name), PROMPT_FILE.name]) {
    const fixturesDir = copyFixtures((d) => { writeFileSync(join(d, name), "gone"); });
    const out = freshDir("miss-out");
    const claimPath = throwawayClaim("miss");
    const pf = preflight({ fixturesDir, outDir: out, claimPath, apiKey: DUMMY_KEY });
    assert.equal(pf.ok, false, name + " damaged must fail preflight");
    const fetchImpl = mockFetch(async () => mockResponse(200, okBody()));
    const r = await performSingleRequest({ pf, fetchImpl, apiKey: DUMMY_KEY, outDir: out, claimPath });
    assert.equal(r.ok, false);
    assert.equal(r.claimCreated, false, "no claim may be taken on a failed preflight");
    assert.equal(fetchImpl.calls.length, 0, "fetch must not be called");
    assert.equal(existsSync(claimPath), false);
  }
});

test("14. a wrong hash, size, dimension or PNG type refuses without a claim and without fetch", async () => {
  const cases = [
    ["one flipped byte", (b) => { const c = Buffer.from(b); c[c.length - 1] ^= 0xff; return c; }],
    ["a truncated file", (b) => b.subarray(0, b.length - 1)],
    ["wrong dimensions", (b) => { const c = Buffer.from(b); c.writeUInt32BE(999, 16); return c; }],
    ["wrong bit depth", (b) => { const c = Buffer.from(b); c[24] = 16; return c; }],
    ["wrong colour type", (b) => { const c = Buffer.from(b); c[25] = 2; return c; }],
    ["a broken signature", (b) => { const c = Buffer.from(b); c[1] = 0x00; return c; }],
  ];
  for (const [label, mutate] of cases) {
    const fixturesDir = copyFixtures((d) => {
      const p = join(d, INPUTS[1].name);
      writeFileSync(p, mutate(readFileSync(p)));
    });
    const out = freshDir("bad-out");
    const claimPath = throwawayClaim("bad");
    const pf = preflight({ fixturesDir, outDir: out, claimPath, apiKey: DUMMY_KEY });
    assert.equal(pf.ok, false, label + " must fail preflight");
    const fetchImpl = mockFetch(async () => mockResponse(200, okBody()));
    const r = await performSingleRequest({ pf, fetchImpl, apiKey: DUMMY_KEY, outDir: out, claimPath });
    assert.equal(r.claimCreated, false, label + ": no claim may be taken");
    assert.equal(fetchImpl.calls.length, 0, label + ": fetch must not be called");
    assert.equal(existsSync(claimPath), false);
  }
});

// ── 15-17: the fail-closed claim ─────────────────────────────────────────────────────────────

test("15. the first exclusive claim succeeds; a second fails with EEXIST and sends nothing", async () => {
  const claimPath = throwawayClaim("excl");
  assert.equal(claimState(claimPath).claimed, false);
  const rec = createClaim({ endpoint: ENDPOINT, model: MODEL }, claimPath);
  assert.equal(rec.contract, "D-121");
  assert.equal(rec.status, "SPENT_BEFORE_FETCH");
  assert.equal(rec.mandate, "SPENT");
  assert.equal(rec.repository, REPO_IDENTITY);
  assert.equal(typeof rec.pid, "number");
  assert.equal(rec.contentWritten, true);
  assert.equal(claimState(claimPath).claimed, true);
  assert.throws(() => createClaim({ endpoint: ENDPOINT, model: MODEL }, claimPath), /EEXIST/,
    "the mandate is not renewable by re-running");
  assert.throws(() => createClaim({}, ""), /explicit claim path/);

  const out = freshDir("excl-out");
  const pf = realPreflight(out, throwawayClaim("excl-pf"));
  const fetchImpl = mockFetch(async () => mockResponse(200, okBody()));
  const r = await performSingleRequest({ pf, fetchImpl, apiKey: DUMMY_KEY, outDir: out, claimPath });
  assert.equal(r.stage, "claim-exists");
  assert.equal(fetchImpl.calls.length, 0, "an existing claim must stop the call before fetch");
});

test("15b. an empty, truncated or corrupt claim still counts as SPENT", async () => {
  for (const [label, content] of [["empty", ""], ["whitespace", "   \n"], ["truncated JSON", '{"contract":"D-1'],
    ["not JSON at all", "<html>"], ["a JSON array", "[1,2,3]"]]) {
    const claimPath = throwawayClaim("corrupt");
    writeFileSync(claimPath, content, "utf8");
    const s = claimState(claimPath);
    assert.equal(s.claimed, true, label + " must read as claimed");
    assert.equal(s.detail.mandate, "SPENT", label + " must read as SPENT");

    const out = freshDir("corrupt-out");
    const pf = preflight({ outDir: out, claimPath, apiKey: DUMMY_KEY });
    assert.equal(pf.ok, false, label + " must fail preflight");
    assert.ok(pf.problems.some((p) => /MANDATE ALREADY SPENT/.test(p)), label);
    const fetchImpl = mockFetch(async () => mockResponse(200, okBody()));
    const r = await performSingleRequest({ pf: { ...pf, ok: true }, fetchImpl, apiKey: DUMMY_KEY, outDir: out, claimPath });
    assert.equal(r.stage, "claim-exists", label + " must block the call");
    assert.equal(fetchImpl.calls.length, 0, label + " must not send");
  }
});

test("16+17. the claim survives every failure mode, and nothing retries", async () => {
  const modes = [
    ["transport error", async () => { throw new Error("socket hang up"); }, "transport"],
    ["timeout", async () => { const e = new Error("The operation timed out"); e.name = "TimeoutError"; throw e; }, "transport"],
    ["HTTP 500", async () => mockResponse(500, JSON.stringify({ error: { type: "server_error", code: "x", message: "boom" } })), "http"],
    ["HTTP 429", async () => mockResponse(429, "slow down"), "http"],
    ["unparseable body", async () => mockResponse(200, "<html>not json</html>"), "parse"],
    ["no data field", async () => mockResponse(200, JSON.stringify({ ok: true })), "payload"],
    ["two images", async () => mockResponse(200, JSON.stringify({ data: [{ b64_json: "AAAA" }, { b64_json: "AAAA" }] })), "payload"],
    ["zero images", async () => mockResponse(200, JSON.stringify({ data: [] })), "payload"],
    ["invalid base64", async () => mockResponse(200, JSON.stringify({ data: [{ b64_json: "not base64!!" }] })), "payload"],
    ["not a PNG", async () => mockResponse(200, JSON.stringify({ data: [{ b64_json: Buffer.alloc(64, 7).toString("base64") }] })), "decode"],
    ["wrong dimensions", async () => {
      const c = Buffer.from(VALID_PNG); c.writeUInt32BE(512, 16);
      return mockResponse(200, JSON.stringify({ data: [{ b64_json: c.toString("base64") }] }));
    }, "decode"],
    ["wrong colour type", async () => {
      const c = Buffer.from(VALID_PNG); c[25] = 2;
      return mockResponse(200, JSON.stringify({ data: [{ b64_json: c.toString("base64") }] }));
    }, "decode"],
  ];
  for (const [label, impl, expectedStage] of modes) {
    const out = freshDir("fail");
    const claimPath = throwawayClaim("fail");
    const pf = realPreflight(out, claimPath);
    assert.equal(pf.ok, true, pf.problems.join("; "));
    const fetchImpl = mockFetch(impl);
    const r = await performSingleRequest({ pf, fetchImpl, apiKey: DUMMY_KEY, outDir: out, claimPath });
    const paths = outputPaths(out);
    assert.equal(r.ok, false, label + " must not succeed");
    assert.equal(r.stage, expectedStage, label + " stage");
    assert.equal(r.claimCreated, true, label + ": the claim must have been taken");
    assert.equal(existsSync(claimPath), true, label + ": the claim must SURVIVE the failure");
    assert.equal(claimState(claimPath).detail.mandate, "SPENT", label + ": the mandate stays spent");
    assert.equal(fetchImpl.calls.length, 1, label + ": exactly one attempt, no retry");
    assert.equal(existsSync(paths.raw), false, label + ": an invalid response must not produce an output");
    assert.equal(existsSync(paths.raw + ".partial"), false, label + ": no half-written file may be left behind");
    assert.equal(existsSync(paths.manifest), true, label + ": the outcome must be recorded");
    const man = JSON.parse(readFileSync(paths.manifest, "utf8"));
    assert.equal(man.outcome.mandate, "SPENT");
    assert.equal(man.outcome.retried, false);
    assert.equal(man.claim.status, "SPENT_BEFORE_FETCH");
    if (expectedStage === "transport") assert.match(man.response.serverState, /UNKNOWN/, label);
  }
});

test("the source carries no retry mechanism and no fallback model", () => {
  assert.ok(!/setTimeout|setInterval|backoff|maxRetries|retryCount|attempt\s*\+\+/.test(CODE), "a retry mechanism has appeared");
  assert.equal((CODE.match(/await fetchImpl\(/g) || []).length, 1, "there must be exactly one fetch call site");
  assert.ok(!/for\s*\([^)]*\)\s*\{[^}]*fetchImpl\(/s.test(CODE), "the call sits inside a loop");
  assert.ok(!/while\s*\([^)]*\)\s*\{[^}]*fetchImpl\(/s.test(CODE), "the call sits inside a loop");
  assert.ok(!/gpt-image-1/.test(CODE), "a fallback to gpt-image-1 has appeared");
  const assigned = CODE.match(/=\s*["']gpt-image[-\w.]*["']/g) || [];
  assert.deepEqual(assigned, ['= "gpt-image-2-2026-04-21"'], "exactly one model id is assigned, the pinned one");
});

test("the order is: verify, assemble, resolve, claim, then exactly one call", () => {
  const body = CODE.indexOf("buildBody(pf)");
  const resolve = CODE.indexOf("resolveClaimPath({ repoRoot: REPO })", body);
  const claim = CODE.indexOf("createClaim({");
  const call = CODE.indexOf("await fetchImpl(");
  assert.ok(body > 0 && resolve > 0 && claim > 0 && call > 0, "every step must exist");
  assert.ok(body < resolve, "the body is assembled before the claim path is resolved");
  assert.ok(resolve < claim, "the path is resolved and validated before the claim is taken");
  assert.ok(claim < call, "the claim is taken before the request is sent");
  assert.ok(/mkdirSync\(dirname\(claimPath\)/.test(CODE), "only the claim's parent directory is created");
  assert.ok(/fsyncSync\(fd\)/.test(CODE), "the claim content must be flushed");
  assert.ok(/closeSync\(fd\)/.test(CODE), "the claim file must be closed");
});
// ── 18-21: the one authorised call, with an injected mock ────────────────────────────────────

test("18+21. exactly one fetch is made, and a valid reply is written atomically", async () => {
  const out = freshDir("ok");
  const claimPath = throwawayClaim("ok");
  const pf = realPreflight(out, claimPath);
  const fetchImpl = mockFetch(async () => mockResponse(200, okBody(), { "x-request-id": "req_test_123", "content-type": "application/json" }));
  const r = await performSingleRequest({ pf, fetchImpl, apiKey: DUMMY_KEY, outDir: out, claimPath });
  const paths = outputPaths(out);

  assert.equal(r.ok, true, r.reason);
  assert.equal(r.stage, "done");
  assert.equal(r.claimPath, claimPath);
  assert.equal(fetchImpl.calls.length, 1, "exactly one request");
  assert.equal(fetchImpl.calls[0].url, ENDPOINT);
  assert.equal(fetchImpl.calls[0].init.method, "POST");
  assert.ok(fetchImpl.calls[0].init.body instanceof FormData, "the body must be the multipart form");

  assert.equal(existsSync(paths.raw), true, "the image must be written");
  assert.equal(existsSync(paths.raw + ".partial"), false, "no .partial file may survive");
  assert.equal(Buffer.compare(readFileSync(paths.raw), VALID_PNG), 0, "the bytes written must be the bytes returned");
  assert.equal(r.verification.sha256, sha(VALID_PNG));
  assert.equal(r.verification.png.width, 1024);
  assert.equal(r.verification.png.height, 1536);
  assert.equal(r.verification.png.bitDepth, EXPECT_BIT_DEPTH);
  assert.equal(r.verification.png.colourType, EXPECT_COLOUR_TYPE);

  const man = JSON.parse(readFileSync(paths.manifest, "utf8"));
  assert.equal(man.outcome.stage, "done");
  assert.equal(man.claim.mandate, "SPENT");
  assert.equal(man.claim.status, "SPENT_BEFORE_FETCH");
  assert.equal(man.claim.file, claimPath);
  assert.equal(man.response.requestId, "req_test_123");
  assert.equal(man.request.inputs.length, 4);
  assert.deepEqual(man.request.inputs.map((i) => i.sha256), INPUTS.map((i) => i.sha256));
  assert.equal(man.request.prompt.promptSha256, PROMPT_BODY.sha256);
  assert.equal(man.request.model, MODEL);
  assert.equal(man.request.policy.retry, false);
  assert.deepEqual(readdirSync(out).filter((f) => f.endsWith(".partial")), [], "no partial files may be left");

  // the claim records what spent the mandate
  const claim = JSON.parse(readFileSync(claimPath, "utf8"));
  assert.equal(claim.contract, "D-121");
  assert.equal(claim.repository, REPO_IDENTITY);
  assert.equal(claim.status, "SPENT_BEFORE_FETCH");
  assert.equal(claim.endpoint, ENDPOINT);
  assert.equal(claim.model, MODEL);
  assert.equal(claim.adapterSha256, adapterSelfSha());
  assert.equal(claim.promptSha256, PROMPT_BODY.sha256);
  assert.deepEqual(claim.inputs.map((i) => i.sha256), INPUTS.map((i) => i.sha256));
  assert.deepEqual(claim.parameters, { n: N, quality: QUALITY, size: SIZE, output_format: OUTPUT_FORMAT, background: BACKGROUND });
  assert.equal(typeof claim.claimedAt, "string");
  assert.equal(typeof claim.pid, "number");
});

test("19+20. the response contract is enforced strictly", () => {
  assert.equal(validateResponsePayload({ data: [{ b64_json: "AAAA" }] }).ok, true);
  for (const bad of [null, undefined, 7, "x", [], {}, { data: {} }, { data: [] },
    { data: [{ b64_json: "A" }, { b64_json: "B" }] }, { data: [null] }, { data: [{ b64_json: 5 }] }]) {
    assert.equal(validateResponsePayload(bad).ok, false, "must reject " + JSON.stringify(bad));
  }
  for (const bad of ["", "not base64!!", "AAA", "AA=A", "====", "A".repeat(5)]) {
    assert.equal(decodeStrictBase64(bad).ok, false, "must reject base64 " + JSON.stringify(bad));
  }
  assert.equal(decodeStrictBase64(VALID_PNG.toString("base64")).ok, true);
  assert.equal(validatePngHeader(Buffer.alloc(10), "x").ok, false, "a stub must not pass as a PNG");
  assert.equal(validatePngHeader(VALID_PNG, "x").ok, true);
});

// ── 22-24: secrets, the closed D-120 contract, and blast radius ──────────────────────────────

test("22. the API key never reaches a log, the claim or the manifest", async () => {
  const out = freshDir("secret");
  const claimPath = throwawayClaim("secret");
  const pf = realPreflight(out, claimPath);
  const SECRET = "sk-do-not-leak-0123456789";
  const fetchImpl = mockFetch(async () => mockResponse(200, okBody()));
  await performSingleRequest({ pf, fetchImpl, apiKey: SECRET, outDir: out, claimPath });
  for (const p of [claimPath, outputPaths(out).manifest]) {
    const txt = readFileSync(p, "utf8");
    assert.ok(!txt.includes(SECRET), p + " contains the key");
    assert.ok(!/sk-[A-Za-z0-9]/.test(txt), p + " contains something key-shaped");
    assert.ok(!txt.includes("OPENAI_API_KEY"), p + " names the key variable");
    assert.ok(!txt.includes("Authorization"), p + " records the Authorization header");
  }
  assert.equal(fetchImpl.calls[0].init.headers.Authorization, "Bearer " + SECRET, "the key reaches the header, and only there");
  assert.ok(!/console\.(log|error)\([^)]*apiKey[^)]*\)/.test(CODE), "the key value reaches a log call");
  assert.ok(!/console\.(log|error)\([^)]*OPENAI_API_KEY[^)]*\)/.test(CODE), "the key value reaches a log call");
  const r = runCli([]);
  assert.ok(!r.stdout.includes(DUMMY_KEY), "the dry run printed the key");
  assert.ok(!r.stderr.includes(DUMMY_KEY), "the dry run printed the key");
});

test("23. the D-120 adapter and its test are byte-identical and untouched", () => {
  const a = readFileSync(join(REPO, "tools", "avatar", "openai-generate-northstar-d.mjs"));
  const t = readFileSync(join(REPO, "tests", "unit", "avatar-northstar-d-generator.test.mjs"));
  assert.equal(a.length, 15633, "the D-120 adapter changed size");
  assert.equal(sha(a), "079942398b76fde6d3a17885d522247faf2c11edd11080c0ff9d2cf94d0b74a7", "the D-120 adapter changed");
  assert.equal(t.length, 11428, "the D-120 test changed size");
  assert.equal(sha(t), "ca119355002e206a81c37aeba61e3dc34abb363d144e2662b1be24c7a07a29a1", "the D-120 test changed");
  assert.ok(!/openai-generate-northstar-d/.test(CODE), "this adapter must not import the D-120 tool");
});

test("24. nothing production, runtime, manifest, resolver or asset is touched", () => {
  for (const forbidden of ["assets/", "R2_MANIFEST", "avatar-r2", "supabase", "index.html", "app.js"]) {
    assert.ok(!CODE.includes(forbidden), "the adapter references " + forbidden);
  }
  const out = freshDir("radius");
  const p = outputPaths(out);
  for (const target of [p.raw, p.manifest]) {
    assert.ok(target.startsWith(out), target + " escapes the output directory");
  }
  assert.ok(outputPaths().dir.includes(join("avatar", "build")), "the default output stays in the gitignored build area");
  assert.ok(!/writeFileSync\(\s*join\(\s*REPO/.test(CODE), "a write targets the repository root directly");
  // the only three things this tool ever writes
  assert.ok(/writeAtomic\(paths\.raw/.test(CODE) && /writeAtomic\(paths\.manifest/.test(CODE),
    "the outputs must go through the atomic writer");
});

test("the recorded config carries the contract, the tracked source and no secret", () => {
  const cfg = requestConfig(realPreflight(freshDir("cfg")));
  assert.equal(cfg.contract, "D-121");
  assert.equal(cfg.model, MODEL);
  assert.equal(cfg.policy.requests, 1);
  assert.match(cfg.policy.failClosed, /D-122/);
  assert.match(cfg.policy.failClosed, /OUTSIDE the repository/);
  assert.match(cfg.inputSource, /tracked fixtures only/i);
  assert.equal(cfg.inputs.length, 4);
  for (const i of cfg.inputs) {
    assert.equal(i.png.width, 1024);
    assert.equal(i.png.height, 1536);
    assert.equal(i.png.colourType, EXPECT_COLOUR_TYPE);
  }
  assert.deepEqual(cfg.inputs.map((i) => i.decision), ["D-122", "D-123", "D-123", "D-123"]);
  const s = JSON.stringify(cfg);
  assert.ok(!/sk-[A-Za-z0-9]/.test(s));
  assert.ok(!s.includes("OPENAI_API_KEY"));
});

test("requestConfig survives an empty preflight", () => {
  const cfg = requestConfig({});
  assert.deepEqual(cfg.inputs, []);
  assert.equal(cfg.prompt, null);
});

test("isInside is a real containment check, not a string prefix test", () => {
  assert.equal(isInside(join("C:\\a\\b", "c.txt"), "C:\\a\\b"), true);
  assert.equal(isInside("C:\\a\\b", "C:\\a\\b"), true);
  assert.equal(isInside("C:\\a\\bc", "C:\\a\\b"), false, "a sibling with a longer name is not inside");
  assert.equal(isInside("C:\\a", "C:\\a\\b"), false);
  assert.equal(isInside("", "C:\\a"), false);
  assert.equal(isInside(null, "C:\\a"), false);
});