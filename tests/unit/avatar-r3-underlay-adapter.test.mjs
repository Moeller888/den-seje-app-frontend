// D-139 — the send path for the ONE head-only underlay call, proved fail-closed WITHOUT a network.
//
// Every request here is a stub. Nothing in this file can reach the API: the only fetch the adapter
// makes is injected, and the tests assert on whether it was called at all. The point is not that
// the happy path works — it is that every way of getting the call wrong stops BEFORE the fetch, and
// that once the fetch has happened nothing tries again.
//
// H1 is external (D-127 §2) and absent in CI, so the inputs are synthetic and the preflight is
// exercised through its injection points. The one thing a synthetic input can never do is pass the
// pinned hash — which is itself one of the guarantees, and is asserted as such.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as A from "../../tools/avatar/openai-generate-r3-underlay.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const FIX = join(REPO, "tools", "avatar", "fixtures", "r3-underlay");
const SRC = readFileSync(join(REPO, "tools", "avatar", "openai-generate-r3-underlay.mjs"), "utf8");
/** The same file with whole-line comments removed. The header legitimately NAMES the flags and the
 *  sibling adapters it refuses to have, so a prose mention must not read as an implementation. */
const CODE = SRC.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
const CONTRACT_PATH = join(REPO, "tools", "avatar", "fixtures", "r3", "r3-shadow-contract-v1.json");
const CONTRACT = JSON.parse(readFileSync(CONTRACT_PATH, "utf8"));
const MASK_BUF = readFileSync(join(FIX, A.API_MASK.name));
const PROMPT_TEXT = A.extractPrompt(readFileSync(join(FIX, A.PROMPT_FILE.name), "utf8")).prompt;
const sha = (b) => createHash("sha256").update(b).digest("hex");

let scratch = null;
const tmp = () => {
  if (!scratch) scratch = mkdtempSync(join(tmpdir(), "d139-"));
  return mkdtempSync(join(scratch, "case-"));
};

/** A PASSING preflight, assembled by hand. The real one needs H1, which CI does not have. */
function fakePreflight(over) {
  const files = A.INPUTS.map((i) => ({ ...i, buf: Buffer.from("png-" + i.name), actualBytes: i.bytes,
    actualSha256: i.sha256, ok: true, header: { width: 1024, height: 1536, bitDepth: 8, colourType: 6 } }));
  return {
    ok: true, problems: [], files,
    mask: { ...A.API_MASK, buf: MASK_BUF, actualBytes: MASK_BUF.length, actualSha256: sha(MASK_BUF),
      semantics: { ok: true, problems: [], counts: { editable: 125423, protected: 1447441 } }, ok: true },
    prompt: PROMPT_TEXT,
    promptMeta: { file: A.PROMPT_FILE.name, promptBytes: A.PROMPT_BODY.bytes, promptSha256: A.PROMPT_BODY.sha256 },
    authorisation: A.verifyAuthorisation(CONTRACT),
    paths: A.outputPaths(join(tmpdir(), "unused")),
    ...over,
  };
}

const okResponse = (buf) => ({
  status: 200,
  headers: { get: (k) => (k === "x-request-id" ? "req_test" : null) },
  text: async () => JSON.stringify({ data: [{ b64_json: buf.toString("base64") }] }),
});

/** A 1024x1536 RGBA8 PNG header followed by nothing — enough for validatePngHeader. */
function fakePngHeader() {
  const b = Buffer.alloc(64);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write("IHDR", 12, "ascii");
  b.writeUInt32BE(1024, 16); b.writeUInt32BE(1536, 20);
  b[24] = 8; b[25] = 6; b[28] = 0;
  return b;
}

// ── the frozen request contract ──────────────────────────────────────────────────────────────

test("the endpoint, model and parameters are exactly what D-139 pinned", () => {
  assert.equal(A.ENDPOINT, "https://api.openai.com/v1/images/edits");
  assert.equal(A.MODEL, "gpt-image-2-2026-04-21");
  assert.equal(A.SIZE, "1024x1536");
  assert.equal(A.QUALITY, "high");
  assert.equal(A.OUTPUT_FORMAT, "png");
  assert.equal(A.BACKGROUND, "transparent");
  assert.equal(A.N, 1);
  assert.equal(A.RETRY, false);
  assert.equal(A.FALLBACK_MODEL, false);
});

test("input_fidelity is omitted deliberately, and cannot creep back in", () => {
  assert.deepEqual(A.FORBIDDEN_FIELDS, ["input_fidelity"]);
  const fd = A.buildBody(fakePreflight());
  assert.equal(fd.has("input_fidelity"), false);
});

test("the body carries two images in the pinned order, plus exactly one mask", () => {
  const fd = A.buildBody(fakePreflight());
  const images = fd.getAll(A.IMAGE_FIELD);
  assert.equal(images.length, 2);
  assert.equal(images[0].name, "fitting-base.H1.png", "H1 must be image 1 — the mask applies to image 1");
  assert.equal(images[1].name, "Northstar Master v2.png");
  const masks = fd.getAll(A.MASK_FIELD);
  assert.equal(masks.length, 1);
  assert.equal(masks[0].name, A.API_MASK.name);
  assert.equal(fd.get("model"), A.MODEL);
  assert.equal(fd.get("n"), "1");
  assert.equal(fd.get("size"), A.SIZE);
  assert.equal(fd.get("quality"), A.QUALITY);
  assert.equal(fd.get("output_format"), A.OUTPUT_FORMAT);
  assert.equal(fd.get("background"), A.BACKGROUND);
  assert.equal(fd.get("prompt"), PROMPT_TEXT);
});

test("SWAPPED INPUTS are refused — the mask would land on the reference figure", () => {
  const pf = fakePreflight();
  pf.files = [pf.files[1], pf.files[0]];
  assert.throws(() => A.buildBody(pf), /is not the pinned input/);
});

test("a D-133 marker fixture sent as the mask is refused", () => {
  const pf = fakePreflight();
  pf.mask = { ...pf.mask, name: "r3-head-edit-v1.png" };
  assert.throws(() => A.buildBody(pf), /not the pinned API mask|marker fixture/);
});

test("a missing mask is refused rather than silently sent maskless", () => {
  const pf = fakePreflight();
  pf.mask = null;
  assert.throws(() => A.buildBody(pf), /without the API mask/);
});

test("buildBody refuses to run on a failed preflight at all", () => {
  assert.throws(() => A.buildBody(fakePreflight({ ok: false })), /failed preflight/);
  assert.throws(() => A.buildBody(fakePreflight({ prompt: null })), /without a prompt/);
});

// ── the narrow authorisation ─────────────────────────────────────────────────────────────────

test("the contract authorises exactly one call, by id, and every pin matches the adapter", () => {
  const v = A.verifyAuthorisation(CONTRACT);
  assert.equal(v.ok, true, v.problems.join("; "));
  assert.equal(v.call.callId, A.CALL_ID);
  // D-142 added a spent record and D-143 a live permission for a DIFFERENT call. D-139's own
  // entry must still verify, and the adapter must still match on its OWN call id rather than on
  // being the only entry present — a D-143 permission must never make this adapter sendable.
  assert.equal(CONTRACT.authorisedCalls.calls.length, 3);
  assert.equal(CONTRACT.authorisedCalls.count, 3);
  assert.equal(A.verifyAuthorisation(CONTRACT).call.decision, "D-139", "it matches D-139's entry, not D-143's");
  assert.equal(CONTRACT.authorisedCalls.calls.filter((x) => x.callId === A.CALL_ID).length, 1);
});

test("the authorisation is NOT a global boolean", () => {
  assert.equal(CONTRACT.meta.authorisesImageRequest, false,
    "the general flag must stay false — a true here would read as consent to every R3 call");
  assert.match(CONTRACT.meta.authorisationModel, /stays false permanently/);
  assert.match(CONTRACT.authorisedCalls.shape, /A LIST, not a boolean/);
  // and a contract that tried to say yes globally is refused
  const global = JSON.parse(JSON.stringify(CONTRACT));
  global.meta.authorisesImageRequest = true;
  const v = A.verifyAuthorisation(global);
  assert.equal(v.ok, false);
  assert.ok(v.problems.some((p) => /general boolean/.test(p)), v.problems.join("; "));
});

test("a contract with no authorisedCalls, or the wrong call id, authorises nothing", () => {
  const none = JSON.parse(JSON.stringify(CONTRACT));
  delete none.authorisedCalls;
  assert.equal(A.verifyAuthorisation(none).ok, false);

  const renamed = JSON.parse(JSON.stringify(CONTRACT));
  renamed.authorisedCalls.calls[0].callId = "D-139-something-else";
  const v = A.verifyAuthorisation(renamed);
  assert.equal(v.ok, false);
  assert.match(v.problems.join("; "), /authorises 0 calls with id/);
});

test("a contract that disagrees with the adapter about ANY pin is refused", () => {
  const cases = [
    ["model", (c) => { c.authorisedCalls.calls[0].model = "gpt-image-2"; }],
    ["endpoint", (c) => { c.authorisedCalls.calls[0].endpoint = "https://api.openai.com/v1/images/generations"; }],
    ["prompt hash", (c) => { c.authorisedCalls.calls[0].prompt.transmittedSha256 = "0".repeat(64); }],
    ["mask hash", (c) => { c.authorisedCalls.calls[0].mask.sha256 = "0".repeat(64); }],
    ["input hash", (c) => { c.authorisedCalls.calls[0].inputs[0].sha256 = "0".repeat(64); }],
    ["input order", (c) => { c.authorisedCalls.calls[0].inputOrder = ["Image 2", "Image 1"]; }],
    ["mask target", (c) => { c.authorisedCalls.calls[0].inputs[0].maskAppliesToThis = false; }],
    ["output count", (c) => { c.authorisedCalls.calls[0].outputs.count = 2; }],
    ["n", (c) => { c.authorisedCalls.calls[0].parameters.n = 2; }],
    ["claim identity", (c) => { c.authorisedCalls.calls[0].claim.filename = "D-129.claim.json"; }],
  ];
  for (const [label, mutate] of cases) {
    const c = JSON.parse(JSON.stringify(CONTRACT));
    mutate(c);
    assert.equal(A.verifyAuthorisation(c).ok, false, "a wrong " + label + " must refuse the call");
  }
});

test("more than one entry with this call id is refused, not resolved by picking one", () => {
  const dup = JSON.parse(JSON.stringify(CONTRACT));
  dup.authorisedCalls.calls.push(JSON.parse(JSON.stringify(dup.authorisedCalls.calls[0])));
  const v = A.verifyAuthorisation(dup);
  assert.equal(v.ok, false);
  assert.match(v.problems.join("; "), /authorises 2 calls with id/);
});

// ── the register bar ─────────────────────────────────────────────────────────────────────────

test("the authorising rows must be in the register, exactly once each", () => {
  assert.deepEqual(A.REQUIRED_DECISIONS, ["D-132", "D-133", "D-139"]);
  for (const id of A.REQUIRED_DECISIONS) {
    assert.equal(A.decisionExists(id).found, true, id + " must be a row in the register");
  }
  const dir = tmp();
  const empty = join(dir, "empty.md");
  writeFileSync(empty, "| **D-132** | x |\n", "utf8");
  assert.equal(A.decisionExists("D-139", empty).found, false, "a missing D-139 must refuse the call");

  const twice = join(dir, "twice.md");
  writeFileSync(twice, "| **D-139** | a |\n| **D-139** | b |\n", "utf8");
  const d = A.decisionExists("D-139", twice);
  assert.equal(d.found, false);
  assert.match(d.why, /appears 2 times/);
});

// ── the one-shot claim ───────────────────────────────────────────────────────────────────────

test("the claim is D-139's own, and lives outside the repository and outside temp", () => {
  assert.equal(A.CLAIM_FILENAME, "D-139.claim.json");
  // The synthetic root has to be ABSOLUTE on the platform actually running this: a Windows-shaped
  // string is a RELATIVE path to POSIX `path`, which would resolve against the working directory —
  // i.e. inside the repository — and the resolver would then correctly refuse it for the wrong
  // reason. So each branch is exercised with a root that is absolute where it is evaluated.
  const r = process.platform === "win32"
    ? A.resolveClaimPath({ env: { LOCALAPPDATA: "C:\\synthetic\\AppData\\Local" }, platform: "win32" })
    : A.resolveClaimPath({ env: { XDG_STATE_HOME: "/synthetic/state" }, platform: "linux" });
  assert.equal(r.ok, true, r.why || "");
  assert.ok(r.path.includes("D-139.claim.json"));
  assert.ok(r.path.includes(A.REPO_IDENTITY), "the claim is scoped by repository identity, not by clone");
  assert.ok(!r.path.includes("D-121") && !r.path.includes("D-129"),
    "D-121's and D-129's mandates must never be reachable from here");
  assert.equal(A.isInside(r.path, REPO), false);
  assert.equal(A.isInside(r.path, tmpdir()), false);
});

test("the claim filename is D-139's on every platform branch, resolvable or not", () => {
  // Independent of absoluteness: whatever root is offered, the FILE is never another decision's.
  // each environment is written out at the call site, so the injection is visible to the guard
  for (const r of [
    A.resolveClaimPath({ env: { LOCALAPPDATA: "C:\\x" }, platform: "win32" }),
    A.resolveClaimPath({ env: { XDG_STATE_HOME: "/x" }, platform: "linux" }),
    A.resolveClaimPath({ env: {}, platform: "linux", homeDir: "/home/someone" }),
  ]) {
    assert.ok(r.path.endsWith(A.CLAIM_FILENAME), "resolved to " + r.path);
  }
});

test("a claim inside the repository or inside temp is refused, not used", () => {
  const inRepo = A.resolveClaimPath({ env: { LOCALAPPDATA: REPO }, platform: "win32", repoRoot: REPO });
  assert.equal(inRepo.ok, false);
  assert.match(inRepo.why, /inside the repository/);

  const t = tmpdir();
  const inTmp = A.resolveClaimPath({ env: { LOCALAPPDATA: t }, platform: "win32", tmpDir: t });
  assert.equal(inTmp.ok, false);
  assert.match(inTmp.why, /inside the temp directory/);
});

test("no unresolvable claim location silently falls back to somewhere writable", () => {
  const r = A.resolveClaimPath({ env: {}, platform: "win32" });
  assert.equal(r.ok, false);
  assert.match(r.why, /LOCALAPPDATA is not set/);
});

test("ANY existing claim file means SPENT — empty, truncated or unparseable alike", () => {
  const dir = tmp();
  for (const [name, body] of [["empty.json", ""], ["garbage.json", "{not json"], ["ok.json", "{\"a\":1}"]]) {
    const p = join(dir, name);
    writeFileSync(p, body, "utf8");
    const s = A.claimState(p);
    assert.equal(s.claimed, true, name + " must count as spent");
    assert.equal(s.detail.mandate, "SPENT");
  }
  assert.equal(A.claimState(join(dir, "absent.json")).claimed, false);
});

test("the claim file exists BEFORE its content is written", () => {
  const dir = tmp();
  const p = join(dir, "D-139.claim.json");
  const rec = A.createClaim({ startedAt: "t" }, p);
  assert.ok(existsSync(p));
  assert.equal(rec.contract, "D-139");
  assert.equal(rec.callId, A.CALL_ID);
  assert.equal(rec.mandate, "SPENT");
  assert.throws(() => A.createClaim({}, p), /EEXIST/, "a second exclusive create must fail");
});

test("the claim never records a secret", () => {
  const dir = tmp();
  const rec = A.createClaim({ endpoint: A.ENDPOINT, model: A.MODEL }, join(dir, "c.json"));
  const text = JSON.stringify(rec);
  assert.ok(!/sk-[A-Za-z0-9]/.test(text));
  assert.ok(!text.includes("Bearer"));
  assert.ok(!text.includes("OPENAI_API_KEY"));
});

// ── the refusals that happen BEFORE the fetch ────────────────────────────────────────────────

async function attempt(over) {
  const dir = tmp();
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return okResponse(fakePngHeader()); };
  const result = await A.performSingleRequest({
    pf: fakePreflight(over), fetchImpl, apiKey: "test-key",
    outDir: join(dir, "out"), claimPath: join(dir, "D-139.claim.json"),
  });
  return { result, calls, dir };
}

test("a failed preflight never reaches the fetch and never creates a claim", async () => {
  const { result, calls, dir } = await attempt({ ok: false });
  assert.equal(result.ok, false);
  assert.equal(result.stage, "preflight");
  assert.equal(calls, 0);
  assert.equal(result.claimCreated, false);
  assert.equal(existsSync(join(dir, "D-139.claim.json")), false);
});

test("a missing API key never reaches the fetch", async () => {
  const dir = tmp();
  let calls = 0;
  const r = await A.performSingleRequest({ pf: fakePreflight(), fetchImpl: async () => { calls += 1; },
    apiKey: "", outDir: join(dir, "out"), claimPath: join(dir, "c.json") });
  assert.equal(r.ok, false);
  assert.equal(r.stage, "key");
  assert.equal(calls, 0);
});

test("an unauthorised contract never reaches the fetch", async () => {
  const { result, calls } = await attempt({ authorisation: { ok: false, problems: ["nope"], call: null } });
  assert.equal(result.ok, false);
  assert.equal(result.stage, "authorisation");
  assert.equal(calls, 0);
});

test("AN EXISTING CLAIM never reaches the fetch — the mandate is already spent", async () => {
  const dir = tmp();
  const claimPath = join(dir, "D-139.claim.json");
  writeFileSync(claimPath, "{}", "utf8");
  let calls = 0;
  const r = await A.performSingleRequest({ pf: fakePreflight(), fetchImpl: async () => { calls += 1; },
    apiKey: "k", outDir: join(dir, "out"), claimPath });
  assert.equal(r.ok, false);
  assert.equal(r.stage, "claim-exists");
  assert.equal(calls, 0);
});

test("AN EXISTING OUTPUT never reaches the fetch — nothing is overwritten", async () => {
  const dir = tmp();
  const out = join(dir, "out");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "r3-underlay.raw.png"), "previous", "utf8");
  let calls = 0;
  const r = await A.performSingleRequest({ pf: fakePreflight(), fetchImpl: async () => { calls += 1; },
    apiKey: "k", outDir: out, claimPath: join(dir, "c.json") });
  assert.equal(r.ok, false);
  assert.equal(r.stage, "output-exists");
  assert.equal(calls, 0);
  assert.equal(readFileSync(join(out, "r3-underlay.raw.png"), "utf8"), "previous");
});

test("a body the guards reject never reaches the fetch and never creates a claim", async () => {
  const pf = fakePreflight();
  pf.files = [pf.files[1], pf.files[0]];
  const dir = tmp();
  let calls = 0;
  const r = await A.performSingleRequest({ pf, fetchImpl: async () => { calls += 1; }, apiKey: "k",
    outDir: join(dir, "out"), claimPath: join(dir, "c.json") });
  assert.equal(r.ok, false);
  assert.equal(r.stage, "body");
  assert.equal(calls, 0);
  assert.equal(existsSync(join(dir, "c.json")), false);
});

// ── exactly one fetch, and the claim is spent before it ──────────────────────────────────────

test("the claim exists at the moment the fetch runs, not after it", async () => {
  const dir = tmp();
  const claimPath = join(dir, "D-139.claim.json");
  let claimSeen = null;
  const fetchImpl = async () => { claimSeen = existsSync(claimPath); return okResponse(fakePngHeader()); };
  const r = await A.performSingleRequest({ pf: fakePreflight(), fetchImpl, apiKey: "k",
    outDir: join(dir, "out"), claimPath });
  assert.equal(claimSeen, true, "the mandate must be spent BEFORE the request leaves");
  assert.equal(r.claimCreated, true);
  assert.equal(r.fetches, 1);
});

test("a successful call fetches exactly once and writes exactly one image", async () => {
  const { result, calls, dir } = await attempt();
  assert.equal(result.ok, true, result.reason);
  assert.equal(calls, 1);
  assert.equal(result.fetches, 1);
  assert.ok(existsSync(join(dir, "out", "r3-underlay.raw.png")));
  const manifest = JSON.parse(readFileSync(join(dir, "out", "r3-underlay.request.json"), "utf8"));
  assert.equal(manifest.callId, A.CALL_ID);
  assert.equal(manifest.outcome.retried, false);
  assert.equal(manifest.outcome.fetches, 1);
  assert.equal(manifest.request.parameters.n, 1);
  assert.equal(manifest.request.mask.sentToApi, true);
  assert.deepEqual(manifest.request.inputOrder, ["Image 1", "Image 2"]);
});

test("MORE THAN ONE FETCH is impossible, not merely absent", () => {
  let n = 0;
  const wrapped = A.oneShotFetch(() => { n += 1; return "first"; });
  assert.equal(wrapped(), "first");
  assert.equal(wrapped.callCount(), 1);
  assert.throws(() => wrapped(), /a second fetch was attempted/);
  assert.equal(n, 1, "the second attempt must not reach the underlying fetch");
});

test("there is exactly ONE fetch call site in the whole adapter", () => {
  const sites = SRC.split("await doFetch(").length - 1;
  assert.equal(sites, 1, "one call site; a second would spend an unauthorised request");
  assert.ok(!/for\s*\(.*fetch/i.test(SRC), "no loop around a fetch");
  assert.ok(!/while\s*\(.*fetch/i.test(SRC), "no loop around a fetch");
  assert.ok(!SRC.includes("setTimeout"), "no backoff, because there is no retry to back off from");
});

// ── after the fetch: every failure keeps the claim and never retries ─────────────────────────

const failures = [
  ["transport error", async () => { throw new Error("socket hang up"); }, "transport"],
  ["HTTP 400", async () => ({ status: 400, headers: { get: () => null },
    text: async () => JSON.stringify({ error: { type: "invalid_request_error", code: "x", message: "bad" } }) }), "http"],
  ["moderation refusal", async () => ({ status: 400, headers: { get: () => null },
    text: async () => JSON.stringify({ error: { type: "image_generation_user_error", code: "moderation_blocked", message: "refused" } }) }), "http"],
  ["non-JSON body", async () => ({ status: 200, headers: { get: () => null }, text: async () => "<html>" }), "parse"],
  ["two images returned", async () => ({ status: 200, headers: { get: () => null },
    text: async () => JSON.stringify({ data: [{ b64_json: "AAAA" }, { b64_json: "AAAA" }] }) }), "payload"],
  ["a non-PNG result", async () => ({ status: 200, headers: { get: () => null },
    text: async () => JSON.stringify({ data: [{ b64_json: Buffer.from("not a png at all!").toString("base64") }] }) }), "decode"],
];

for (const [label, fetchImpl, stage] of failures) {
  test(`${label}: the claim stays SPENT, nothing retries, no image is kept`, async () => {
    const dir = tmp();
    const claimPath = join(dir, "D-139.claim.json");
    let calls = 0;
    const counted = async (...a) => { calls += 1; return fetchImpl(...a); };
    const r = await A.performSingleRequest({ pf: fakePreflight(), fetchImpl: counted, apiKey: "k",
      outDir: join(dir, "out"), claimPath });
    assert.equal(r.ok, false);
    assert.equal(r.stage, stage, r.reason);
    assert.equal(calls, 1, "exactly one attempt, whatever went wrong");
    assert.equal(existsSync(claimPath), true, "the mandate must stay spent");
    assert.equal(existsSync(join(dir, "out", "r3-underlay.raw.png")), false, "no image is kept");
    const manifest = JSON.parse(readFileSync(join(dir, "out", "r3-underlay.request.json"), "utf8"));
    assert.equal(manifest.outcome.mandate, "SPENT");
    assert.equal(manifest.outcome.retried, false);
    assert.equal(manifest.claim.status, "SPENT_BEFORE_FETCH");
  });
}

test("a moderation refusal is recorded as such, and is not treated as a reason to try again", async () => {
  const dir = tmp();
  const r = await A.performSingleRequest({ pf: fakePreflight(),
    fetchImpl: async () => ({ status: 400, headers: { get: () => null },
      text: async () => JSON.stringify({ error: { type: "image_generation_user_error", code: "moderation_blocked", message: "refused" } }) }),
    apiKey: "k", outDir: join(dir, "out"), claimPath: join(dir, "c.json") });
  assert.match(r.reason, /no retry, no fallback/);
  const manifest = JSON.parse(readFileSync(join(dir, "out", "r3-underlay.request.json"), "utf8"));
  assert.equal(manifest.response.error.code, "moderation_blocked");
});

// ── the source-level prohibitions ────────────────────────────────────────────────────────────

test("there is no flag that can force, reset or relocate the mandate", () => {
  for (const flag of ["--force", "--reset-claim", "--claim-path", "--retry", "--no-verify"]) {
    assert.ok(!CODE.includes(flag), "the adapter must not implement " + flag);
  }
  // it may only say so in prose, and it does
  assert.match(SRC, /deliberately NO[\s/]+--claim-path, NO --force and NO --reset-claim/);
});

test("sending needs BOTH flags, and the approval value is exact", () => {
  assert.equal(A.OWNER_APPROVAL_FLAG, "--owner-approval=D-139");
  assert.match(SRC, /const send = argv\.includes\("--send"\)/);
  assert.match(SRC, /const approved = argv\.includes\(OWNER_APPROVAL_FLAG\)/);
  assert.match(SRC, /if \(!send \|\| !approved\)/, "either flag alone must stop at the dry run");
  // a near-miss value is not the flag
  assert.ok(!["--owner-approval=d-139", "--owner-approval", "--owner-approval=D-129"]
    .includes(A.OWNER_APPROVAL_FLAG));
});

test("the D-121 and D-129 adapters are neither imported nor modified", () => {
  assert.ok(!CODE.includes("openai-refine-northstar-d"), "D-121's adapter must not be imported");
  assert.ok(!CODE.includes("openai-generate-fitting-base"), "D-129's adapter must not be imported");
  assert.ok(!CODE.includes("D-129.claim.json"), "D-129's mandate must be unreachable from here");
  assert.ok(!CODE.includes("D-121.claim.json"), "D-121's mandate must be unreachable from here");
  const imports = CODE.split("\n").filter((l) => l.startsWith("import "));
  for (const line of imports) {
    assert.ok(!/openai-/.test(line), "no other OpenAI adapter may be imported: " + line);
  }
});

test("H1 is external and is never resolved from a guessed default", () => {
  assert.equal(A.INPUTS[0].external, true);
  assert.equal(A.INPUTS[1].external, false);
  const none = A.resolveH1Path({ argv: [], env: {} });
  assert.equal(none.ok, false);
  assert.match(none.why, /--h1|FITTING_BASE_V1_PATH/);
  assert.equal(A.resolveH1Path({ argv: ["--h1=/x/h1.png"], env: {} }).path, "/x/h1.png");
  assert.equal(A.resolveH1Path({ argv: ["--h1", "/y/h1.png"], env: {} }).path, "/y/h1.png");
  assert.equal(A.resolveH1Path({ argv: [], env: { FITTING_BASE_V1_PATH: "/z/h1.png" } }).path, "/z/h1.png");
});

test("H1 is never copied into the repository by this tool", () => {
  assert.ok(!SRC.includes("copyFileSync"), "nothing here copies an input anywhere");
  assert.match(A.INPUTS[0].purpose, /approved authoring base/);
  const call = CONTRACT.authorisedCalls.calls[0];
  assert.equal(call.inputs[0].tracked, false);
  assert.match(call.inputs[0].storage, /never copied into the repository/);
});

test("a synthetic input can never pass the pinned hash — the pin is the gate", () => {
  const dir = tmp();
  const fake = join(dir, "fitting-base.H1.png");
  writeFileSync(fake, fakePngHeader());
  const pf = A.preflight({ h1Path: fake, apiKey: "k", outDir: join(dir, "out"),
    claimPath: join(dir, "c.json"), argv: [] });
  assert.equal(pf.ok, false);
  assert.ok(pf.problems.some((p) => /Image 1: sha /.test(p)), pf.problems.join("; "));
});

test("preflight refuses when the API mask has drifted", () => {
  const dir = tmp();
  const fixtures = join(dir, "fixtures");
  mkdirSync(fixtures, { recursive: true });
  const drifted = Buffer.from(MASK_BUF);
  drifted[drifted.length - 1] ^= 0xff;
  writeFileSync(join(fixtures, A.API_MASK.name), drifted);
  writeFileSync(join(fixtures, A.PROMPT_FILE.name), readFileSync(join(FIX, A.PROMPT_FILE.name)));
  const pf = A.preflight({ fixturesDir: fixtures, apiKey: "k", outDir: join(dir, "out"),
    claimPath: join(dir, "c.json"), argv: [], h1Path: join(dir, "missing.png") });
  assert.equal(pf.ok, false);
  assert.ok(pf.problems.some((p) => /API mask/.test(p)), pf.problems.join("; "));
});

test("the real preflight refuses cleanly when H1 is absent, as it is in CI", () => {
  const dir = tmp();
  const pf = A.preflight({ apiKey: "k", outDir: join(dir, "out"), claimPath: join(dir, "c.json"),
    argv: [], env: {} });
  assert.equal(pf.ok, false);
  assert.ok(pf.problems.some((p) => /H1 is external/.test(p)), pf.problems.join("; "));
  assert.equal(existsSync(join(dir, "c.json")), false, "a failed preflight creates nothing");
});

// ── D-145: this suite never reaches a real claim, output, key or fetch — proven statically ─────
//
// The test that used to stand here looked at the REAL claim and output paths to show nothing had
// happened there. That is exactly what D-143 §8 forbids, and after D-139's call was made it could
// not even pass on the owner's machine. It is replaced by a property that needs no real path: every
// in-process call to performSingleRequest names its own fetch, claim path, output directory and a
// literal dummy key, so the adapter's fallbacks to the real environment are unreachable from here.

/** Source with the CONTENTS of strings, template literals, regex literals and comments blanked,
 *  preserving length and newlines, so structure can be read without matching text inside them. */
function blankLiterals(src) {
  const out = src.split("");
  const n = src.length;
  const blank = (a, b) => { for (let k = a; k < b && k < n; k++) if (out[k] !== "\n") out[k] = " "; };
  let i = 0;
  let last = "";
  while (i < n) {
    const ch = src[i];
    const nx = src[i + 1];
    if (ch === "/" && nx === "/") { const e = src.indexOf("\n", i); const end = e < 0 ? n : e; blank(i, end); i = end; continue; }
    if (ch === "/" && nx === "*") { const e = src.indexOf("*/", i + 2); const end = e < 0 ? n : e + 2; blank(i, end); i = end; continue; }
    if (ch === "\"" || ch === "'" || ch === "`") {
      let j = i + 1;
      while (j < n && src[j] !== ch) j += src[j] === "\\" ? 2 : 1;
      blank(i + 1, j); i = j + 1; last = ch; continue;
    }
    if (ch === "/" && (last === "" || "(,=:[!&|?{};+-*%<>~^".includes(last))) {
      let j = i + 1;
      let inClass = false;
      while (j < n && src[j] !== "\n") {
        const c = src[j];
        if (c === "\\") { j += 2; continue; }
        if (c === "[") inClass = true; else if (c === "]") inClass = false; else if (c === "/" && !inClass) break;
        j++;
      }
      blank(i + 1, j); i = j + 1; last = "/"; continue;
    }
    if (!/\s/.test(ch)) last = ch;
    i++;
  }
  return out.join("");
}

/** Every call `fnName(...)` in src, with the raw and blanked text of its top-level properties. */
function callProperties(src, fnName) {
  const b = blankLiterals(src);
  const re = new RegExp("\\b" + fnName + "\\s*\\(", "g");
  const calls = [];
  let m;
  while ((m = re.exec(b))) {
    const start = m.index + m[0].length;
    let depth = 1;
    let j = start;
    while (j < b.length && depth > 0) {
      if ("({[".includes(b[j])) depth++; else if (")}]".includes(b[j])) depth--;
      j++;
    }
    const argB = b.slice(start, j - 1);
    const lead = argB.length - argB.trimStart().length;
    const line = b.slice(0, m.index).split("\n").length;
    if (!argB.trim().startsWith("{") || !argB.trim().endsWith("}")) { calls.push({ line, objectLiteral: false, props: [] }); continue; }
    const open = start + lead + 1;
    const close = start + argB.trimEnd().length - 1;
    const props = [];
    let d = 0;
    let cur = open;
    for (let k = open; k <= close; k++) {
      const c = k === close ? "," : b[k];
      if ("({[".includes(c)) d++; else if (")}]".includes(c)) d--;
      else if (c === "," && d === 0) {
        const rawP = src.slice(cur, k).trim();
        const blP = b.slice(cur, k).trim();
        if (blP !== "") {
          const colon = blP.search(/:/);
          const key = colon < 0 ? blP : blP.slice(0, colon).trim();
          props.push({ key, raw: colon < 0 ? rawP : rawP.slice(colon + 1).trim(), blank: colon < 0 ? blP : blP.slice(colon + 1).trim() });
        }
        cur = k + 1;
      }
    }
    calls.push({ line, objectLiteral: true, props });
  }
  return calls;
}

/** Why one in-process send call could reach the real environment, or [] when every injection is explicit. */
function unsafeSendCall(call, src) {
  if (!call.objectLiteral) return ["the argument is not an object literal, so its injections cannot be proven"];
  const problems = [];
  const byKey = new Map(call.props.map((p) => [p.key, p]));
  for (const p of call.props) if (p.key.startsWith("...")) problems.push("a spread can override an injection");
  for (const key of ["fetchImpl", "claimPath", "outDir", "apiKey"]) if (!byKey.has(key)) problems.push("no explicit " + key);
  const real = /process\.env|resolveClaimPath|proposedClaimPath|outputPaths|homedir|LOCALAPPDATA|XDG_STATE_HOME|\bOUT\b/;
  const f = byKey.get("fetchImpl");
  if (f && (/^(globalThis\.)?fetch$/.test(f.blank) || real.test(f.blank))) problems.push("fetchImpl is the real fetch");
  for (const key of ["claimPath", "outDir"]) {
    const p = byKey.get(key);
    if (p && real.test(p.blank)) problems.push(key + " is derived from the real environment");
  }
  const k = byKey.get("apiKey");
  if (k) {
    const literal = /^(["'`])[^"'`]*\1$/.test(k.raw);
    const constant = /^[A-Za-z_$][\w$]*$/.test(k.raw)
      && new RegExp("\\bconst\\s+" + k.raw + "\\s*=\\s*[\"'`][^\"'`]*[\"'`]").test(src);
    if (!literal && !constant) problems.push("apiKey is not a literal dummy value");
  }
  return problems;
}

test("every in-process performSingleRequest call injects fetch, claim path, output directory and a dummy key", () => {
  const self = readFileSync(fileURLToPath(import.meta.url), "utf8");
  const calls = callProperties(self, "performSingleRequest");
  assert.ok(calls.length >= 8, "the check must see this suite's send calls, found " + calls.length);
  const offenders = calls.map((c) => [c.line, unsafeSendCall(c, self)]).filter(([, p]) => p.length > 0);
  assert.deepEqual(offenders, [], "every send call must inject all four");
  // and nothing here resolves the real claim or output location without injected inputs
  const b = blankLiterals(self);
  assert.ok(!/\boutputPaths\s*\(\s*\)/.test(b), "no call resolves the real output directory");
  assert.ok(!/\bresolveClaimPath\s*\(\s*\{\s*repoRoot\s*:\s*REPO\s*\}\s*\)/.test(b), "no call resolves the real claim path");
  assert.ok(!/\bclaimState\s*\(\s*(A\.)?resolveClaimPath/.test(b), "no call inspects the real claim");

  // non-vacuity: the rule rejects each way a call could fall back to the real environment
  const q = "\"";
  const bad = [
    "A.performSingleRequest({ pf, apiKey: " + q + "k" + q + ", outDir: o, claimPath: c });",
    "A.performSingleRequest({ pf, fetchImpl: fetch, apiKey: " + q + "k" + q + ", outDir: o, claimPath: c });",
    "A.performSingleRequest({ pf, fetchImpl: f, apiKey: process.env.KEY, outDir: o, claimPath: c });",
    "A.performSingleRequest({ pf, fetchImpl: f, apiKey: " + q + "k" + q + ", outDir: A.OUT, claimPath: c });",
    "A.performSingleRequest({ pf, fetchImpl: f, apiKey: " + q + "k" + q + ", outDir: o, claimPath: A.resolveClaimPath().path });",
    "A.performSingleRequest({ pf, fetchImpl: f, apiKey: " + q + "k" + q + ", outDir: o, claimPath: c, ...opts });",
    "A.performSingleRequest(options);",
  ];
  for (const s of bad) {
    const [c] = callProperties(s, "performSingleRequest");
    assert.ok(unsafeSendCall(c, s).length > 0, "must be rejected: " + s);
  }
  const good = "A.performSingleRequest({ pf, fetchImpl: async () => ({ status: 1 }), apiKey: " + q + "k" + q + ", outDir: join(d, " + q + "o" + q + "), claimPath });";
  assert.deepEqual(unsafeSendCall(callProperties(good, "performSingleRequest")[0], good), []);
});

test("the scratch directory is cleaned up", () => {
  if (scratch && existsSync(scratch)) rmSync(scratch, { recursive: true, force: true });
  assert.ok(true);
});
