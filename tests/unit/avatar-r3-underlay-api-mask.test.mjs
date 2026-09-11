// D-139 §5 — the API guidance mask.
//
// The failure this file exists to prevent is a QUIET INVERSION. D-133's fixtures and the Images
// edit endpoint mean opposite things by alpha: in a marker fixture 255 says "this is the region",
// to the endpoint 255 says "do not touch this pixel". Sending a D-133 fixture unchanged would
// therefore ask the model to repaint the whole body and protect the head — a request that looks
// plausible, costs a spent mandate, and returns a ruined image.
//
// A pinned hash alone cannot catch that: a hash proves the file did not drift, not that it means
// the right thing. So the direction is re-derived from PIXELS against the D-133 EDIT fixture, here
// and again in the adapter's preflight.
//
// The second thing guarded here is a claim nobody should be able to make: that this mask is what
// keeps the body byte-identical. It is not. D-133's deterministic recomposition is.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as M from "../../tools/avatar/build-r3-api-mask.mjs";
import * as A from "../../tools/avatar/openai-generate-r3-underlay.mjs";
import { decodePng } from "../../tools/avatar/build-r2-torso-occlusion-mask.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const FIX = join(REPO, "tools", "avatar", "fixtures", "r3-underlay");
const D133 = join(REPO, "tools", "avatar", "fixtures", "r3-head-edit");
const CONTRACT = JSON.parse(readFileSync(join(REPO, "tools", "avatar", "fixtures", "r3", "r3-shadow-contract-v1.json"), "utf8"));
const sha = (b) => createHash("sha256").update(b).digest("hex");

const MASK_BUF = readFileSync(join(FIX, M.FILES.mask));
const EDIT_BUF = readFileSync(join(D133, "r3-head-edit-v1.png"));
const SPEC = JSON.parse(readFileSync(join(FIX, M.FILES.spec), "utf8"));
const MASK = decodePng(MASK_BUF, "API mask");
const EDIT = decodePng(EDIT_BUF, "D-133 EDIT");
const N = 1024 * 1536;

function authorisedCall() {
  const calls = CONTRACT.authorisedCalls.calls.filter((c) => c.callId === A.CALL_ID);
  assert.equal(calls.length, 1);
  return calls[0];
}

test("the tracked mask matches its pin, and the adapter pins the same bytes", () => {
  assert.equal(MASK_BUF.length, A.API_MASK.bytes);
  assert.equal(sha(MASK_BUF), A.API_MASK.sha256);
  assert.equal(SPEC.mask.sha256, A.API_MASK.sha256);
  assert.equal(authorisedCall().mask.sha256, A.API_MASK.sha256);
  assert.equal(authorisedCall().mask.bytes, A.API_MASK.bytes);
});

test("it is a 1024x1536 RGBA8 PNG — the same canvas as H1", () => {
  const h = A.readPngHeader(MASK_BUF);
  assert.equal(h.ok, true);
  assert.equal(h.width, 1024);
  assert.equal(h.height, 1536);
  assert.equal(h.bitDepth, 8);
  assert.equal(h.colourType, 6);
  assert.deepEqual(SPEC.mask.png, { width: 1024, height: 1536, bitDepth: 8, colourType: 6 });
});

test("alpha is strictly binary, and the two classes partition the canvas exactly", () => {
  let zero = 0, full = 0, other = 0;
  for (let i = 0; i < N; i++) {
    const a = MASK.rgba[i * 4 + 3];
    if (a === 0) zero++; else if (a === 255) full++; else other++;
  }
  assert.equal(other, 0, "no soft alpha anywhere");
  assert.equal(zero, 125423, "editable px must equal D-133 EDIT");
  assert.equal(full, 1447441, "protected px must equal D-133 PROTECT");
  assert.equal(zero + full, N);
});

test("alpha = 0 on exactly the D-133 EDIT region, and 255 on exactly its complement", () => {
  let wrongInside = 0, wrongOutside = 0;
  for (let i = 0; i < N; i++) {
    const inEdit = EDIT.rgba[i * 4 + 3] >= 128;
    const a = MASK.rgba[i * 4 + 3];
    if (inEdit && a !== 0) wrongInside++;
    if (!inEdit && a !== 255) wrongOutside++;
  }
  assert.equal(wrongInside, 0);
  assert.equal(wrongOutside, 0);
});

test("the direction is the INVERSE of D-133's marker convention — the whole point of the file", () => {
  // Sampled where the two conventions must disagree: one pixel in the region, one outside it.
  let insideIdx = -1, outsideIdx = -1;
  for (let i = 0; i < N && (insideIdx < 0 || outsideIdx < 0); i++) {
    if (insideIdx < 0 && EDIT.rgba[i * 4 + 3] >= 128) insideIdx = i;
    if (outsideIdx < 0 && EDIT.rgba[i * 4 + 3] < 128) outsideIdx = i;
  }
  assert.ok(insideIdx >= 0 && outsideIdx >= 0);
  assert.equal(EDIT.rgba[insideIdx * 4 + 3], 255, "D-133: alpha 255 marks the region");
  assert.equal(MASK.rgba[insideIdx * 4 + 3], 0, "API mask: alpha 0 means editable");
  assert.equal(EDIT.rgba[outsideIdx * 4 + 3], 0);
  assert.equal(MASK.rgba[outsideIdx * 4 + 3], 255);
});

test("RGB is 0,0,0 on every pixel — the mask carries no pixel of the figure", () => {
  let coloured = 0;
  for (let i = 0; i < N; i++) {
    if (MASK.rgba[i * 4] !== 0 || MASK.rgba[i * 4 + 1] !== 0 || MASK.rgba[i * 4 + 2] !== 0) coloured++;
  }
  assert.equal(coloured, 0);
});

test("the mask is NOT byte-identical to any D-133 fixture", () => {
  for (const f of ["r3-head-edit-v1.png", "r3-head-transition-v1.png", "r3-head-protect-v1.png"]) {
    assert.notEqual(sha(readFileSync(join(D133, f))), A.API_MASK.sha256,
      f + " must never be reused as the API mask — its alpha means the opposite");
  }
});

test("the builder reproduces the tracked fixtures byte-identically", () => {
  const result = M.run({ check: true });
  assert.equal(result.verdict.ok, true, (result.verdict.problems || []).join("; "));
  assert.equal(result.reproduction.maskExisted, true);
  assert.equal(result.reproduction.maskMatches, true, "the tracked mask is not what the builder produces");
  assert.equal(result.reproduction.specExisted, true);
  assert.equal(result.reproduction.specMatches, true, "the tracked spec is not what the builder produces");
  assert.equal(result.wrote, false, "--check must write nothing");
  assert.equal(M.exitCodeFor(result), 0);
});

test("--check reports a NON-ZERO exit code when a fixture does not reproduce", () => {
  // The failure mode being prevented: a check that prints FAIL and exits 0, so CI goes green.
  const drifted = { check: true, verdict: { ok: true, problems: [] },
    reproduction: { maskExisted: true, maskMatches: false, specExisted: true, specMatches: true } };
  assert.equal(M.exitCodeFor(drifted), 1);
  const failedVerify = { check: false, verdict: { ok: false, problems: ["x"] }, reproduction: {} };
  assert.equal(M.exitCodeFor(failedVerify), 1);
});

test("the builder refuses a drifted source instead of re-fitting the region", () => {
  assert.throws(() => M.run({ repoRoot: join(REPO, "tests") }), /missing tracked input/);
});

test("verifyApiMask catches an INVERTED mask", () => {
  const editSet = new Uint8Array(N);
  for (let i = 0; i < N; i++) editSet[i] = EDIT.rgba[i * 4 + 3] >= 128 ? 1 : 0;
  const good = M.buildApiMask(editSet);
  assert.equal(M.verifyApiMask(good, editSet).ok, true);

  const inverted = Buffer.from(good);
  for (let i = 0; i < N; i++) inverted[i * 4 + 3] = 255 - inverted[i * 4 + 3];
  const v = M.verifyApiMask(inverted, editSet);
  assert.equal(v.ok, false);
  assert.ok(v.problems.some((p) => /inverted or misaligned/i.test(p)), v.problems.join("; "));
});

test("verifyApiMask catches soft alpha and stray colour", () => {
  const editSet = new Uint8Array(N);
  for (let i = 0; i < N; i++) editSet[i] = EDIT.rgba[i * 4 + 3] >= 128 ? 1 : 0;
  const soft = Buffer.from(M.buildApiMask(editSet));
  soft[3] = 128;
  assert.match(M.verifyApiMask(soft, editSet).problems.join("; "), /alpha is not binary/);

  const painted = Buffer.from(M.buildApiMask(editSet));
  painted[0] = 7;
  assert.match(M.verifyApiMask(painted, editSet).problems.join("; "), /RGB is not 0,0,0/);
});

test("the adapter re-derives the direction from pixels, not from the hash", () => {
  const good = A.verifyMaskSemantics(MASK_BUF, EDIT_BUF);
  assert.equal(good.ok, true, good.problems.join("; "));
  assert.equal(good.counts.editable, 125423);
  assert.equal(good.counts.protected, 1447441);

  // The D-133 EDIT fixture handed over as if it were the API mask: same size, right hash for ITS
  // own family, and the exact inverse meaning. This must be refused.
  const wrong = A.verifyMaskSemantics(EDIT_BUF, EDIT_BUF);
  assert.equal(wrong.ok, false);
  assert.ok(wrong.problems.some((p) => /INVERTED or misaligned/.test(p)), wrong.problems.join("; "));
});

test("the mask is documented as GUIDANCE, never as the byte-identity guarantee", () => {
  assert.match(SPEC.semantics.guidanceOnly, /MODEL GUIDANCE ONLY/);
  assert.match(SPEC.semantics.guidanceOnly, /recomposition/);
  assert.match(SPEC.semantics.guidanceOnly, /never from this mask/);
  assert.match(SPEC.prohibitions.notTheByteIdentityGate, /NOT the guarantee of 0 changed pixels/);
  assert.match(authorisedCall().mask.guidanceOnly, /NOT the guarantee that 0 pixels change/);
  assert.match(authorisedCall().mask.guidanceOnly, /deterministic recomposition/);
});

test("the spec records where the mask came from, so it is reproducible on a fresh clone", () => {
  assert.equal(SPEC.derivedFrom.path, "tools/avatar/fixtures/r3-head-edit/r3-head-edit-v1.png");
  assert.equal(SPEC.derivedFrom.sha256, "5e843a9a217966e80affdc2b8783cf8926941ff4ab6d62d1e424c795f4885156");
  assert.equal(SPEC.derivedFrom.decision, "D-133");
  assert.ok(!SPEC.derivedFrom.path.includes("\\"), "paths must be portable, not Windows-shaped");
});

test("the mask needs no external file, so CI can verify every byte of it", () => {
  const src = readFileSync(join(REPO, "tools", "avatar", "build-r3-api-mask.mjs"), "utf8");
  assert.ok(!src.includes("FITTING_BASE_V1_PATH"), "the mask builder must not depend on H1");
  assert.ok(!src.includes("--h1"), "the mask builder must not take an H1 path");
});

test("the mask builder sends nothing and creates no claim", () => {
  const src = readFileSync(join(REPO, "tools", "avatar", "build-r3-api-mask.mjs"), "utf8");
  // It may NAME the endpoint in the recorded semantics; it may not call one, and it may not
  // create the one-shot mandate that only the adapter is allowed to spend.
  for (const forbidden of ["fetch(", "OPENAI_API_KEY", "Authorization", "createClaim", "\"wx\""]) {
    assert.ok(!src.includes(forbidden), "the mask builder must not contain " + JSON.stringify(forbidden));
  }
});
