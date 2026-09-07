// D-129 — focused tests for the fitting-base request adapter.
//
// NOTHING HERE CAN REACH THE NETWORK. Every path that would call out takes an injected fetch, and
// the injected implementations either count calls or throw. `fetch` is never passed through.
//
// NOTHING HERE CAN REACH THE REAL CLAIM. Every call injects an explicit `claimPath` inside a
// throwaway directory created by the test, so `%LOCALAPPDATA%\DenSejeApp\one-shot-claims\...\
// D-129.claim.json` is never created, never opened and never depended upon. The only test that
// exercises the resolver feeds it a fake environment.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import * as A from "../../tools/avatar/openai-generate-fitting-base.mjs";
import * as D121 from "../../tools/avatar/openai-refine-northstar-d.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const sha = (b) => createHash("sha256").update(b).digest("hex");
const REGISTER = join(REPO, "docs", "project-state.md");

/** A throwaway sandbox: an output dir and a claim path, both inside a directory this test made. */
const sandbox = () => {
  const dir = mkdtempSync(join(tmpdir(), "d129-"));
  return { dir, outDir: join(dir, "out"), claimPath: join(dir, "claim", "D-129.claim.json") };
};
const cleanup = (s) => { if (s && s.dir && s.dir.startsWith(tmpdir())) rmSync(s.dir, { recursive: true, force: true }); };
const withSandbox = (fn) => { const s = sandbox(); try { return fn(s); } finally { cleanup(s); } };
const withSandboxAsync = async (fn) => { const s = sandbox(); try { return await fn(s); } finally { cleanup(s); } };

/** A passing preflight that never touches the real claim location or the real output directory. */
const goodPreflight = (s, extra) => A.preflight({
  outDir: s.outDir, claimPath: s.claimPath, apiKey: "test-key-not-a-real-secret", registerPath: REGISTER, ...(extra || {}),
});

const okResponse = (pngBuf) => ({
  status: 200,
  headers: { get: (k) => ({ "x-request-id": "req_test_d129", "content-type": "application/json" }[k.toLowerCase()] ?? null) },
  text: async () => JSON.stringify({ data: [{ b64_json: pngBuf.toString("base64") }] }),
});
/** A minimal but header-valid 1024x1536 8-bit RGBA PNG stub: only the header is ever parsed. */
const stubPng = () => {
  const b = Buffer.alloc(64);
  Buffer.from(A.PNG_SIGNATURE).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write("IHDR", 12, "ascii");
  b.writeUInt32BE(1024, 16); b.writeUInt32BE(1536, 20);
  b[24] = 8; b[25] = 6; b[26] = 0; b[27] = 0; b[28] = 0;
  return b;
};
const explodingFetch = () => { throw new Error("a test reached the network — this must never happen"); };
const countingFetch = (impl) => { const calls = []; const f = async (...args) => { calls.push(args); return impl(...args); }; f.calls = calls; return f; };

// ── 1-2. the dry run is inert ────────────────────────────────────────────────────────────────
test("a dry run performs no network call and creates no claim", () => {
  withSandbox((s) => {
    const pf = goodPreflight(s);
    assert.deepEqual(pf.problems, [], "the tracked fixtures must satisfy the pinned contract");
    assert.equal(pf.ok, true);
    // preflight is read-only: no claim, no output dir, no manifest
    assert.equal(existsSync(s.claimPath), false, "preflight must not create the claim");
    assert.equal(existsSync(s.outDir), false, "preflight must not create the output directory");
    assert.equal(pf.claim.claimed, false);
  });
});

test("building the body performs no network call and creates no claim", () => {
  withSandbox((s) => {
    const pf = goodPreflight(s);
    const fd = A.buildBody(pf);
    assert.ok(fd instanceof FormData);
    assert.equal(existsSync(s.claimPath), false);
    assert.equal(existsSync(s.outDir), false);
  });
});

// ── 3-6. the two flags, and the confirmation value ───────────────────────────────────────────
test("the CLI requires two flags and a correct confirmation value", () => {
  const src = readFileSync(join(REPO, "tools", "avatar", "openai-generate-fitting-base.mjs"), "utf8");
  assert.equal(A.OWNER_APPROVAL_FLAG, "--owner-approval=D-129");
  assert.match(src, /const send = argv\.includes\("--send"\)/, "the send flag must be an exact match");
  assert.match(src, /const approved = argv\.includes\(OWNER_APPROVAL_FLAG\)/, "the approval flag must be an exact match");
  assert.match(src, /if \(!send \|\| !approved\)/, "either flag missing must fall through to the dry run");
  // the send call site must sit AFTER the dry-run early exit
  assert.ok(src.indexOf("if (!send || !approved)") < src.indexOf("performSingleRequest({ pf, fetchImpl: fetch"),
    "the dry-run guard must come before the only real send");
  for (const wrong of ["--owner-approval=D-121", "--owner-approval=d-129", "--owner-approval=D-130", "--owner-approval", "--owner-approval=", "--owner-approval=D-129x"]) {
    assert.equal([wrong].includes(A.OWNER_APPROVAL_FLAG), false, `${wrong} must not satisfy the confirmation`);
  }
  for (const argv of [[], ["--send"], [A.OWNER_APPROVAL_FLAG], ["--send", "--owner-approval=D-121"], ["--send", "--owner-approval=d-129"]]) {
    const send = argv.includes("--send"), approved = argv.includes(A.OWNER_APPROVAL_FLAG);
    assert.equal(send && approved, false, `argv ${JSON.stringify(argv)} must not send`);
  }
  assert.equal(["--send", A.OWNER_APPROVAL_FLAG].every((f) => ["--send", A.OWNER_APPROVAL_FLAG].includes(f)), true);
});

// ── 7. an existing claim blocks ──────────────────────────────────────────────────────────────
test("an existing claim blocks preflight and the send path, and is never modified", async () => {
  await withSandboxAsync(async (s) => {
    mkdirSync(dirname(s.claimPath), { recursive: true });
    writeFileSync(s.claimPath, "{}", "utf8");
    const before = { bytes: statSync(s.claimPath).size, sha: sha(readFileSync(s.claimPath)) };

    const pf = goodPreflight(s);
    assert.equal(pf.ok, false);
    assert.ok(pf.problems.some((p) => p.includes("MANDATE ALREADY SPENT")), pf.problems.join("; "));

    const forced = goodPreflight({ ...s, claimPath: join(s.dir, "unused.json") });
    assert.equal(forced.ok, true, "control: the same preflight passes with an unused claim path");
    const f = countingFetch(explodingFetch);
    const r = await A.performSingleRequest({ pf: forced, fetchImpl: f, apiKey: "k", outDir: s.outDir, claimPath: s.claimPath });
    assert.equal(r.ok, false);
    assert.equal(r.stage, "claim-exists");
    assert.equal(r.fetchCalled, false);
    assert.equal(f.calls.length, 0, "no fetch may happen when the mandate is spent");
    assert.deepEqual({ bytes: statSync(s.claimPath).size, sha: sha(readFileSync(s.claimPath)) }, before,
      "the existing claim must be byte-identical afterwards");
  });
});

// ── 8-10. output guards ──────────────────────────────────────────────────────────────────────
test("an existing output blocks the send path and stays byte-identical", async () => {
  await withSandboxAsync(async (s) => {
    const paths = A.outputPaths(s.outDir);
    mkdirSync(s.outDir, { recursive: true });
    writeFileSync(paths.raw, Buffer.from("an earlier result that must not be overwritten"));
    const before = { bytes: statSync(paths.raw).size, sha: sha(readFileSync(paths.raw)) };

    const pf = goodPreflight(s);
    assert.equal(pf.ok, false);
    assert.ok(pf.problems.some((p) => p.includes("output already exists")), pf.problems.join("; "));

    const clean = goodPreflight({ ...s, outDir: join(s.dir, "fresh") });
    const f = countingFetch(explodingFetch);
    const r = await A.performSingleRequest({ pf: clean, fetchImpl: f, apiKey: "k", outDir: s.outDir, claimPath: s.claimPath });
    assert.equal(r.ok, false);
    assert.equal(r.stage, "output-exists");
    assert.equal(f.calls.length, 0);
    assert.equal(existsSync(s.claimPath), false, "a blocked run must not create the claim");
    assert.deepEqual({ bytes: statSync(paths.raw).size, sha: sha(readFileSync(paths.raw)) }, before,
      "the existing output must be byte-identical afterwards");
  });
});

test("an absent output stays absent through every guard", async () => {
  await withSandboxAsync(async (s) => {
    const paths = A.outputPaths(s.outDir);
    const pf = goodPreflight(s);
    const f = countingFetch(explodingFetch);
    // no api key
    let r = await A.performSingleRequest({ pf, fetchImpl: f, apiKey: "", outDir: s.outDir, claimPath: s.claimPath });
    assert.equal(r.stage, "key");
    // no fetch implementation
    r = await A.performSingleRequest({ pf, fetchImpl: null, apiKey: "k", outDir: s.outDir, claimPath: s.claimPath });
    assert.equal(r.stage, "preflight");
    // a failed preflight
    r = await A.performSingleRequest({ pf: { ok: false }, fetchImpl: f, apiKey: "k", outDir: s.outDir, claimPath: s.claimPath });
    assert.equal(r.stage, "preflight");
    // an unusable claim path
    r = await A.performSingleRequest({ pf, fetchImpl: f, apiKey: "k", outDir: s.outDir, claimPath: "" });
    assert.equal(r.stage, "claim-location");

    assert.equal(f.calls.length, 0, "no guard may reach the network");
    assert.equal(existsSync(paths.raw), false, "the raw output must still be absent");
    assert.equal(existsSync(paths.manifest), false, "the manifest must still be absent");
    assert.equal(existsSync(s.claimPath), false, "the claim must still be absent");
  });
});

// ── 11-16. the request contract ──────────────────────────────────────────────────────────────
test("the request body carries exactly one image[], and it is the pinned v2 input", () => {
  withSandbox((s) => {
    const fd = A.buildBody(goodPreflight(s));
    const images = fd.getAll(A.IMAGE_FIELD);
    assert.equal(images.length, 1, "exactly one API image input — D-129 §1");
    assert.equal(images[0].name, "Northstar Master v2.png");
    assert.equal(A.INPUTS.length, 1);
    assert.equal(A.INPUTS[0].sha256, "3daf32e76bff9a53ec7d25cf148a230073cfd0da6a003d02a23c4292d139ff50");
    assert.equal(A.INPUTS[0].bytes, 761394);
    const onDisk = readFileSync(join(REPO, ...A.INPUTS[0].repoPath));
    assert.equal(sha(onDisk), A.INPUTS[0].sha256, "the pinned hash must match the tracked asset");
    assert.equal(onDisk.length, A.INPUTS[0].bytes);
  });
});

test("no mask and no input_fidelity is ever in the body", () => {
  withSandbox((s) => {
    const fd = A.buildBody(goodPreflight(s));
    assert.deepEqual(A.FORBIDDEN_FIELDS, ["mask", "input_fidelity"]);
    for (const bad of A.FORBIDDEN_FIELDS) assert.equal(fd.has(bad), false, `${bad} must never be sent`);
    // and neither protect mask may appear as an image
    const names = fd.getAll(A.IMAGE_FIELD).map((f) => f.name);
    for (const m of A.LOCAL_ONLY_MASKS) assert.equal(names.includes(m.name), false, `${m.name} must never be sent`);
    assert.equal(A.LOCAL_ONLY_MASKS.length, 2);
  });
});

test("endpoint, model and every request parameter match the pins", () => {
  withSandbox((s) => {
    assert.equal(A.ENDPOINT, "https://api.openai.com/v1/images/edits");
    assert.equal(A.MODEL, "gpt-image-2-2026-04-21");
    assert.equal(A.N, 1);
    assert.equal(A.SIZE, "1024x1536");
    assert.equal(A.QUALITY, "high");
    assert.equal(A.OUTPUT_FORMAT, "png");
    assert.equal(A.BACKGROUND, "transparent");
    assert.equal(A.RETRY, false);
    assert.equal(A.FALLBACK_MODEL, false);
    assert.equal(A.AUTO_PROMPT_EDIT, false);
    const fd = A.buildBody(goodPreflight(s));
    assert.equal(fd.get("model"), A.MODEL);
    assert.equal(fd.get("n"), "1");
    assert.equal(fd.get("size"), A.SIZE);
    assert.equal(fd.get("quality"), A.QUALITY);
    assert.equal(fd.get("output_format"), A.OUTPUT_FORMAT);
    assert.equal(fd.get("background"), A.BACKGROUND);
    // exactly one model id assignment in the source, so the pin cannot be shadowed
    const src = readFileSync(join(REPO, "tools", "avatar", "openai-generate-fitting-base.mjs"), "utf8");
    assert.equal((src.match(/gpt-image-2-2026-04-21/g) || []).length, 1);
  });
});

test("the prompt file and the transmitted text both match their pinned bytes and sha256", () => {
  withSandbox((s) => {
    const pf = goodPreflight(s);
    assert.equal(A.PROMPT_FILE.bytes, 4564);
    assert.equal(A.PROMPT_FILE.sha256, "272b72c6b64f086357d0ae4adc6fd0245f45abaed1f5e6febeb348f6f913ad8e");
    assert.equal(A.PROMPT_BODY.bytes, 2377);
    assert.equal(A.PROMPT_BODY.sha256, "82942367d7c7ba5babaa209b61a6b29ba3679e227d97f37274090d95e0cc2c4c");
    assert.equal(pf.promptMeta.fileBytes, A.PROMPT_FILE.bytes);
    assert.equal(pf.promptMeta.fileSha256, A.PROMPT_FILE.sha256);
    assert.equal(pf.promptMeta.promptBytes, A.PROMPT_BODY.bytes);
    assert.equal(pf.promptMeta.promptSha256, A.PROMPT_BODY.sha256);
    // the text that would go on the wire is exactly the pinned body
    const fd = A.buildBody(pf);
    const sent = Buffer.from(fd.get("prompt"), "utf8");
    assert.equal(sent.length, A.PROMPT_BODY.bytes);
    assert.equal(sha(sent), A.PROMPT_BODY.sha256);
  });
});

test("a drifted prompt fails preflight instead of being sent", () => {
  withSandbox((s) => {
    const fixtures = join(s.dir, "fixtures");
    mkdirSync(fixtures, { recursive: true });
    for (const m of A.LOCAL_ONLY_MASKS) {
      writeFileSync(join(fixtures, m.name), readFileSync(join(REPO, "tools", "avatar", "fixtures", "fitting-base", m.name)));
    }
    const good = readFileSync(join(REPO, "tools", "avatar", "fixtures", "fitting-base", A.PROMPT_FILE.name), "utf8");
    writeFileSync(join(fixtures, A.PROMPT_FILE.name), good.replace("bare feet", "shoes"), "utf8");
    const pf = A.preflight({ fixturesDir: fixtures, outDir: s.outDir, claimPath: s.claimPath, apiKey: "k", registerPath: REGISTER });
    assert.equal(pf.ok, false);
    assert.ok(pf.problems.some((p) => p.includes("prompt file:")), pf.problems.join("; "));
    assert.equal(pf.prompt, null, "a drifted prompt must not be usable");
  });
});

// ── 18-20. the authorised path, mocked ───────────────────────────────────────────────────────
test("an authorised mock run performs exactly one fetch, and the claim is created before it", async () => {
  await withSandboxAsync(async (s) => {
    const png = stubPng();
    const seen = [];
    const f = countingFetch(async (url, init) => {
      seen.push({ url, hadClaim: existsSync(s.claimPath), auth: init.headers.Authorization, method: init.method });
      return okResponse(png);
    });
    const pf = goodPreflight(s);
    const r = await A.performSingleRequest({ pf, fetchImpl: f, apiKey: "k", outDir: s.outDir, claimPath: s.claimPath });
    assert.equal(r.ok, true, r.reason);
    assert.equal(f.calls.length, 1, "exactly one fetch");
    assert.equal(seen[0].url, A.ENDPOINT);
    assert.equal(seen[0].method, "POST");
    assert.equal(seen[0].hadClaim, true, "the claim must already exist when the fetch happens");
    assert.equal(existsSync(s.claimPath), true);
    const claim = JSON.parse(readFileSync(s.claimPath, "utf8"));
    assert.equal(claim.contract, "D-129");
    assert.equal(claim.mandate, "SPENT");
    assert.equal(claim.status, "SPENT_BEFORE_FETCH");
    assert.equal(claim.promptSha256, A.PROMPT_BODY.sha256);
    assert.equal(claim.inputs.length, 1);
    assert.equal(JSON.stringify(claim).includes("k"), true);        // sanity: the object serialises
    assert.equal(/"apiKey"|Bearer/.test(JSON.stringify(claim)), false, "the claim must carry no secret");
    const manifest = JSON.parse(readFileSync(A.outputPaths(s.outDir).manifest, "utf8"));
    assert.equal(manifest.request.inputs.length, 1);
    assert.equal(manifest.request.localOnlyMasks.every((m) => m.sentToApi === false), true);
    assert.equal(manifest.response.requestId, "req_test_d129");
  });
});

test("an HTTP error is not retried and the claim stays spent", async () => {
  await withSandboxAsync(async (s) => {
    const f = countingFetch(async () => ({
      status: 400,
      headers: { get: () => null },
      text: async () => JSON.stringify({ error: { type: "invalid_request_error", code: "bad", message: "nope" } }),
    }));
    const pf = goodPreflight(s);
    const r = await A.performSingleRequest({ pf, fetchImpl: f, apiKey: "k", outDir: s.outDir, claimPath: s.claimPath });
    assert.equal(r.ok, false);
    assert.equal(r.stage, "http");
    assert.equal(f.calls.length, 1, "an HTTP error must not be retried");
    assert.equal(existsSync(s.claimPath), true, "the claim stays spent after an HTTP error");
    const manifest = JSON.parse(readFileSync(A.outputPaths(s.outDir).manifest, "utf8"));
    assert.equal(manifest.outcome.mandate, "SPENT");
    assert.equal(manifest.outcome.retried, false);
    assert.equal(existsSync(A.outputPaths(s.outDir).raw), false, "no raw image is written on an HTTP error");
  });
});

test("a transport error is not retried and the claim stays spent", async () => {
  await withSandboxAsync(async (s) => {
    const f = countingFetch(async () => { throw new Error("socket hang up"); });
    const pf = goodPreflight(s);
    const r = await A.performSingleRequest({ pf, fetchImpl: f, apiKey: "k", outDir: s.outDir, claimPath: s.claimPath });
    assert.equal(r.stage, "transport");
    assert.equal(f.calls.length, 1);
    assert.equal(existsSync(s.claimPath), true);
  });
});

// ── 21. D-121 is untouched ───────────────────────────────────────────────────────────────────
test("the D-121 adapter and its claim logic are unchanged and unshared", () => {
  const d121 = readFileSync(join(REPO, "tools", "avatar", "openai-refine-northstar-d.mjs"));
  assert.equal(d121.length, 39184, "the D-121 adapter's byte count must not change — D-127 §1");
  assert.equal(sha(d121), "25ab3e59db1f28035434b1325b08bb263b13094be464b043871bbf1cc3be5e09",
    "the D-121 adapter must be byte-identical — D-127 §1 forbids modifying it");
  assert.equal(D121.CLAIM_FILENAME, "D-121.claim.json");
  assert.equal(A.CLAIM_FILENAME, "D-129.claim.json");
  assert.notEqual(A.CLAIM_FILENAME, D121.CLAIM_FILENAME, "the two mandates must never share a claim file");
  const src = readFileSync(join(REPO, "tools", "avatar", "openai-generate-fitting-base.mjs"), "utf8");
  assert.ok(!/from\s+["'].*openai-refine-northstar-d/.test(src), "the new adapter must not import the D-121 adapter");
  assert.ok(!src.includes("D-121.claim.json"), "the new adapter must never name D-121's claim file");
});

// ── 22-23. isolation ─────────────────────────────────────────────────────────────────────────
test("the claim resolver names D-129 and never resolves into the repository or temp", () => {
  const fake = join(tmpdir(), "d129-fake-localappdata");
  const r = A.resolveClaimPath({ env: { LOCALAPPDATA: fake }, platform: "win32", repoRoot: REPO, tmpDir: null, homeDir: null });
  assert.equal(r.ok, true, r.why);
  assert.equal(r.path.endsWith("D-129.claim.json"), true);
  assert.ok(r.path.includes("Moeller888-den-seje-app-frontend"), "the claim is keyed by repository identity, not by clone");
  assert.equal(existsSync(r.path), false, "the resolver must not create anything");
  // a claim inside the repository is refused
  const inRepo = A.resolveClaimPath({ env: { LOCALAPPDATA: REPO }, platform: "win32", repoRoot: REPO, tmpDir: null, homeDir: null });
  assert.equal(inRepo.ok, false);
  assert.match(inRepo.why, /inside the repository/);
  // a missing LOCALAPPDATA is refused rather than falling back
  const missing = A.resolveClaimPath({ env: {}, platform: "win32", repoRoot: REPO, tmpDir: null, homeDir: null });
  assert.equal(missing.ok, false);
  assert.match(missing.why, /LOCALAPPDATA is not set/);
  // There is no escape hatch. The check must be about what the CLI READS, not about whether the
  // words appear: the header comment names these flags precisely to say they do not exist, and a
  // plain substring search would fail on that sentence instead of on a real bypass.
  const src = readFileSync(join(REPO, "tools", "avatar", "openai-generate-fitting-base.mjs"), "utf8");
  const argvReads = [...src.matchAll(/argv\.includes\(\s*(?:"([^"]*)"|OWNER_APPROVAL_FLAG)\s*\)/g)]
    .map((m) => m[1] ?? A.OWNER_APPROVAL_FLAG);
  assert.deepEqual(argvReads.sort(), ["--owner-approval=D-129", "--print-prompt", "--send"].sort(),
    "the CLI must read exactly these three arguments and no others");
  for (const flag of ["--claim-path", "--force", "--reset-claim"]) {
    assert.equal(argvReads.includes(flag), false, `the CLI must not offer ${flag}`);
    assert.ok(!new RegExp("argv\\.includes\\(\\s*[\"']" + flag).test(src), `the CLI must not read ${flag}`);
  }
});

test("no test path points at the real user claim location", () => {
  const s = sandbox();
  try {
    assert.ok(s.claimPath.startsWith(tmpdir()), "the test claim must live in a throwaway directory");
    assert.ok(!s.claimPath.includes("LOCALAPPDATA"));
    const real = A.resolveClaimPath({ repoRoot: REPO });
    if (real.ok) {
      assert.notEqual(s.claimPath, real.path, "a test must never use the real claim path");
      assert.ok(!s.claimPath.startsWith(dirname(real.path)), "a test must never write into the real claim directory");
    }
  } finally { cleanup(s); }
});

test("the adapter runs identically with an absent and with a pre-existing output directory", async () => {
  for (const pre of [false, true]) {
    await withSandboxAsync(async (s) => {
      if (pre) mkdirSync(s.outDir, { recursive: true });
      const png = stubPng();
      const f = countingFetch(async () => okResponse(png));
      const pf = goodPreflight(s);
      assert.equal(pf.ok, true, pf.problems.join("; "));
      const r = await A.performSingleRequest({ pf, fetchImpl: f, apiKey: "k", outDir: s.outDir, claimPath: s.claimPath });
      assert.equal(r.ok, true, `pre-existing dir=${pre}: ${r.reason}`);
      assert.equal(f.calls.length, 1);
      assert.equal(existsSync(A.outputPaths(s.outDir).raw), true);
    });
  }
});

// ── the register bar ─────────────────────────────────────────────────────────────────────────
test("a missing authorising row blocks the send path", () => {
  withSandbox((s) => {
    const reg = join(s.dir, "register.md");
    writeFileSync(reg, "| **D-126** | x |\n| **D-127** | x |\n| **D-128** | x |\n", "utf8");
    const pf = goodPreflight(s, { registerPath: reg });
    assert.equal(pf.ok, false);
    assert.ok(pf.problems.some((p) => p.includes("NOT AUTHORISED") && p.includes("D-129")), pf.problems.join("; "));
    assert.deepEqual(A.REQUIRED_DECISIONS, ["D-126", "D-127", "D-128", "D-129"]);
  });
});

test("a duplicated authorising row blocks the send path", () => {
  withSandbox((s) => {
    const reg = join(s.dir, "register.md");
    writeFileSync(reg, "| **D-126** | x |\n| **D-127** | x |\n| **D-128** | x |\n| **D-129** | x |\n| **D-129** | x |\n", "utf8");
    const pf = goodPreflight(s, { registerPath: reg });
    assert.equal(pf.ok, false);
    assert.ok(pf.problems.some((p) => p.includes("appears 2 times")), pf.problems.join("; "));
  });
});

test("the local-only masks are verified by preflight and marked as never sent", () => {
  withSandbox((s) => {
    const pf = goodPreflight(s);
    assert.equal(pf.masks.length, 2);
    for (const m of pf.masks) {
      assert.equal(m.ok, true, `${m.name} must match its pin`);
      assert.equal(m.sent, false);
    }
    const cfg = A.requestConfig(pf);
    assert.equal(cfg.localOnlyMasks.length, 2);
    for (const m of cfg.localOnlyMasks) assert.equal(m.sentToApi, false);
    assert.equal(cfg.policy.secondaryReferenceImages, 0);
    assert.match(cfg.omitted.mask, /never sent/);
  });
});
