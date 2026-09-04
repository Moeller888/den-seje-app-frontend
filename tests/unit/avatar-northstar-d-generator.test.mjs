// The D-120 request adapter spends money exactly once. These tests guard the contract that
// decides what that one request contains.
//
// Like the hair generator's tests, this is deliberately a mix of BEHAVIOUR (the body it assembles)
// and SOURCE assertions (that there is no retry loop and no fallback model). A retry is not
// observable from the outside without paying for the failure it retries, so reading the code is
// the only cheap way to prove it cannot happen.
//
// Everything here runs on a FRESH CLONE. The four input images and the master prompt live under
// tools/avatar/build/, which is gitignored, so nothing below depends on them existing: the body
// guards are exercised on a synthetic preflight object, and the locked hashes are asserted as the
// contract constants D-120 records. That is the point of exporting buildBody at all — a guard that
// can only run on the paid path is a guard nobody has ever seen work.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";
import {
  ENDPOINT, MODEL, SIZE, QUALITY, OUTPUT_FORMAT, BACKGROUND, N,
  INPUTS, PROMPT_FILE, FORBIDDEN_FIELDS, extractPrompt, buildBody, requestConfig,
} from "../../tools/avatar/openai-generate-northstar-d.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const SRC = readFileSync(join(REPO, "tools", "avatar", "openai-generate-northstar-d.mjs"), "utf8");
const CODE = SRC.replace(/^\s*\/\/.*$/gm, "");   // comments are documentation, not behaviour

/** A preflight result that is structurally valid but carries no real bytes. */
const syntheticPreflight = (over = {}) => ({
  ok: true,
  prompt: [
    "Produce a single full-body character illustration of a friendly boy.",
    "Image 1 is the geometry. Image 2 is the silhouette. Image 3 is the volume plate.",
    "Image 4 is the head reference.",
  ].join("\n"),
  files: INPUTS.map((i) => ({ ...i, buf: Buffer.from("not-a-real-png") })),
  ...over,
});

// ── the request contract (D-120 §2) ──────────────────────────────────────────────────────────

test("the endpoint is images/edits, not images/generations", () => {
  assert.equal(ENDPOINT, "https://api.openai.com/v1/images/edits");
});

test("the model is the dated snapshot, never the floating alias", () => {
  assert.equal(MODEL, "gpt-image-2-2026-04-21");
  assert.notEqual(MODEL, "gpt-image-2", "the floating alias is not reproducible");
  assert.ok(!/gpt-image-1/.test(CODE), "a fallback to gpt-image-1 has appeared");
  assert.ok(!/fallback\s*[:=]\s*["'][^"']+["']/.test(CODE), "a fallback model has appeared");
});

test("the fixed parameters are exactly what D-120 records", () => {
  assert.equal(N, 1);
  assert.equal(SIZE, "1024x1536");
  assert.equal(QUALITY, "high");
  assert.equal(OUTPUT_FORMAT, "png");
  assert.equal(BACKGROUND, "transparent");
});

test("mask and input_fidelity are named as forbidden and never appended", () => {
  assert.deepEqual([...FORBIDDEN_FIELDS].sort(), ["input_fidelity", "mask"]);
  assert.ok(!/\.append\(\s*["'`]mask/.test(CODE), "a mask is being appended");
  assert.ok(!/\.append\(\s*["'`]input_fidelity/.test(CODE), "input_fidelity is being appended");
});

test("there is exactly one request and no loop around it", () => {
  assert.equal((CODE.match(/\bawait fetch\(/g) || []).length, 1, "more than one fetch call");
  assert.ok(!/for\s*\([^)]*\)\s*\{[^}]*await fetch/s.test(CODE), "fetch sits inside a loop");
  assert.ok(!/while\s*\([^)]*\)\s*\{[^}]*await fetch/s.test(CODE), "fetch sits inside a loop");
});

test("the API key is read for existence only and never printed", () => {
  assert.ok(/process\.env\.OPENAI_API_KEY/.test(CODE), "the key must come from the environment");
  assert.ok(!/console\.(log|error)\([^)]*process\.env\.OPENAI_API_KEY[^)]*\)/.test(CODE),
    "the key value reaches a log call");
});

// ── the four inputs, in a binding order ──────────────────────────────────────────────────────

test("there are exactly four inputs, addressed as Image 1-4 in order", () => {
  assert.equal(INPUTS.length, 4);
  assert.deepEqual(INPUTS.map((i) => i.role), ["Image 1", "Image 2", "Image 3", "Image 4"]);
});

test("each input is locked to the byte count and hash D-120 records", () => {
  assert.deepEqual(INPUTS.map((i) => [basename(i.rel), i.bytes, i.sha256]), [
    ["geometry-reference-transparent.png", 40247, "e3c44a512bec3f3780e5b9d99a61cba473364e6889c1a5a6a7b0b99bca552dc7"],
    ["geometry-silhouette.png", 26362, "0e760fb1b0ced293654ece10027c1fbdf68ee15aee4beaedf6fcbc81b7bf602a"],
    ["geometry-plate-bald-nude.png", 26826, "d3a855fc50afe634f135bf306a68404a7a6b4bd4ac52d8a931cf65510b413e11"],
    ["style-identity-reference-head.png", 367948, "abf551ae169d6b2c8e1253d971c6bb9b9571260fcfd95d7676bb600ff33b6640"],
  ]);
});

test("the old full-body North Star is not an input", () => {
  // It shows the star, green top, wristbands, cargo pocket, green shoes and the OLD body geometry.
  const rels = INPUTS.map((i) => i.rel).join(" ");
  assert.ok(!/style-identity-reference\.png/.test(rels), "the full-body reference is an input");
  assert.ok(!/crop-documentation/.test(rels), "documentation is an input");
  assert.ok(!/technical-overlay|region-masks/.test(rels), "documentation is an input");
});

test("the master prompt is locked by byte count and hash", () => {
  assert.equal(PROMPT_FILE.bytes, 12431);
  assert.equal(PROMPT_FILE.sha256, "8b88559687115fd6decda641ed323dd99c06e71661f7dd597a38deb4bb1fdd1a");
});

// ── prompt extraction ────────────────────────────────────────────────────────────────────────

const goodMd = [
  "# heading", "prose", "```",
  "Produce a single full-body character illustration of a friendly boy.",
  "Image 1 geometry. Image 2 silhouette. Image 3 volume. Image 4 head.",
  "```", "trailing prose",
].join("\n");

test("the prompt is taken from the fenced block, not retyped", () => {
  const r = extractPrompt(goodMd);
  assert.equal(r.ok, true, r.why);
  assert.match(r.prompt, /^Produce a single full-body character illustration/);
  assert.ok(!r.prompt.includes("```"), "the fence leaked into the prompt");
  assert.ok(!r.prompt.includes("trailing prose"), "prose outside the fence leaked in");
});

test("extraction is deterministic", () => {
  assert.equal(extractPrompt(goodMd).prompt, extractPrompt(goodMd).prompt);
});

test("extraction refuses anything it does not recognise", () => {
  assert.equal(extractPrompt(goodMd.replace("```", "~~~")).ok, false, "a missing fence must refuse");
  assert.equal(extractPrompt(goodMd + "\n```\nextra\n```").ok, false, "extra fences must refuse");
  assert.equal(extractPrompt(goodMd.replace("Produce a single", "Draw a single")).ok, false,
    "a changed first line must refuse");
  for (const n of [1, 2, 3, 4]) {
    assert.equal(extractPrompt(goodMd.replace("Image " + n, "Picture " + n)).ok, false,
      "a prompt that stops addressing Image " + n + " must refuse");
  }
});

// ── the body guards, exercised without spending the request ──────────────────────────────────

test("the body carries exactly four images in the binding order", () => {
  const fd = buildBody(syntheticPreflight());
  const images = fd.getAll("image[]");
  assert.equal(images.length, 4);
  assert.deepEqual(images.map((f) => f.name), INPUTS.map((i) => basename(i.rel)));
});

test("the body carries no mask and no input_fidelity", () => {
  const fd = buildBody(syntheticPreflight());
  for (const bad of FORBIDDEN_FIELDS) assert.equal(fd.has(bad), false, bad + " is in the body");
});

test("the body carries the pinned model and the fixed parameters", () => {
  const fd = buildBody(syntheticPreflight());
  assert.equal(fd.get("model"), "gpt-image-2-2026-04-21");
  assert.equal(fd.get("n"), "1");
  assert.equal(fd.get("size"), SIZE);
  assert.equal(fd.get("quality"), QUALITY);
  assert.equal(fd.get("output_format"), OUTPUT_FORMAT);
  assert.equal(fd.get("background"), BACKGROUND);
});

test("the body refuses a wrong number of images", () => {
  const pf = syntheticPreflight();
  assert.throws(() => buildBody({ ...pf, files: pf.files.slice(0, 3) }), /expected 4 images/);
  assert.throws(() => buildBody({ ...pf, files: [...pf.files, pf.files[0]] }), /expected 4 images/);
});

test("the body refuses a broken image order", () => {
  const pf = syntheticPreflight();
  const swapped = [pf.files[1], pf.files[0], pf.files[2], pf.files[3]];
  assert.throws(() => buildBody({ ...pf, files: swapped }), /image order broken/);
});

test("the body refuses to assemble on a failed preflight or a missing prompt", () => {
  assert.throws(() => buildBody(syntheticPreflight({ ok: false })), /failed preflight/);
  assert.throws(() => buildBody(syntheticPreflight({ prompt: null })), /without a prompt/);
});

// ── the recorded configuration ───────────────────────────────────────────────────────────────

test("the request config records the contract and carries no secret", () => {
  const pf = syntheticPreflight();
  const cfg = requestConfig({ ...pf, promptMeta: { promptBytes: 1, promptSha256: "x" } });
  assert.equal(cfg.contract, "D-120");
  assert.equal(cfg.endpoint, ENDPOINT);
  assert.equal(cfg.model, MODEL);
  assert.equal(cfg.policy.retry, false);
  assert.equal(cfg.policy.fallbackModel, false);
  assert.equal(cfg.policy.requests, 1);
  assert.equal(cfg.inputs.length, 4);
  const serialised = JSON.stringify(cfg);
  assert.ok(!/sk-[A-Za-z0-9]/.test(serialised), "something key-shaped is in the config");
  assert.ok(!/OPENAI_API_KEY/.test(serialised), "the key name is in the config");
});

// ── the send path cannot be reached by accident ───────────────────────────────────────────────

test("sending requires both the send flag and the owner approval", () => {
  assert.ok(/--send/.test(CODE), "the send flag must exist");
  assert.ok(/--owner-approval=D-120/.test(CODE), "the approval flag must exist");
  assert.ok(/if\s*\(!send\s*\|\|\s*!approved\)/.test(CODE),
    "both flags must be required before the request is made");
});

test("an existing candidate is never overwritten", () => {
  assert.ok(/refusing to overwrite/.test(SRC), "the overwrite guard is gone");
});

test("the raw bytes are persisted before anything else is done with them", () => {
  // D-113: the one approved artefact was lost because it existed only in a gitignored directory.
  const write = SRC.indexOf("writeFileSync(rawPath, png)");
  const verify = SRC.indexOf("decodePng(png,");
  assert.ok(write > 0 && verify > 0, "the persist and verify steps must both exist");
  assert.ok(write < verify, "the raw candidate must be written before it is inspected");
});
