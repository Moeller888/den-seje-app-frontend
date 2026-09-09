// recompose-r3-head-edit — D-133 §5.
//
// Deterministic recomposition of a future head-only edit onto H1, using the owner-approved
// R3 head-edit regions. It composes; it never generates. There is no image call here, no
// model, no network, and no way to obtain a candidate from this file — the candidate must be
// supplied by --generated, and none exists yet.
//
// The contract is PRE-DEFINED, not applied as repair:
//   CORE       -> the generated RGBA is used directly
//   TRANSITION -> RGB is interpolated by the fixed integer ramp below; ALPHA is H1's, byte-identical
//   PROTECT    -> H1's RGBA, byte-identical
//
// Ramp (D-133 §5), in 8-bit sRGB channel values, integer only, round-half-up:
//   denominator = 20
//   num(y)      = 445 - y        so num(425) = 20/20 generated, num(445) = 0/20 generated
//   out         = floor((num * generated + (20 - num) * h1 + 10) / 20)
// No floating point anywhere on this path, and no colour correction afterwards.
//
// Hard gates. Any failure refuses the output; nothing is written.
//   PRE  : generated and H1 must have an IDENTICAL solid silhouette (alpha >= 128) across every
//          pixel of rows 425..445. Generated alpha never decides the transition's silhouette.
//   POST : exactly 0 differing RGBA bytes against H1 inside PROTECT
//   POST : exactly 0 solid-silhouette deviations inside TRANSITION
//   POST : output is exactly 1024x1536 RGBA8
//   POST : no pixel outside EDIT originates from the generated image
// No automatic warp, repair, region growth or after-the-fact adjustment exists in this file.
//
// Usage:
//   node tools/avatar/recompose-r3-head-edit.mjs --h1 <path> --generated <path> --out <path>
//   ... --spec <path>   (defaults to the tracked R3 head-edit mask spec)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { decodePng, encodePngRGBA } from "./build-r2-torso-occlusion-mask.mjs";
import { FIXTURE_DIR, FILES, MARKER, OUT_W, OUT_H, SOLID_ALPHA, BAND_Y_TOP, BAND_Y_BOT, H1_SHA256, pngToMask, sha256 } from "./build-r3-head-edit-masks.mjs";

export const TOOL = "recompose-r3-head-edit";
export const TOOL_VERSION = "1.0.0";
export const DECISION = "D-133";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");

/** The owner-approved ramp. These three numbers are the whole blend contract. */
export const RAMP = Object.freeze({ yTop: BAND_Y_TOP, yBot: BAND_Y_BOT, denominator: 20 });

/** Generated weight numerator over the denominator 20. 20/20 at yTop, 0/20 at yBot. */
export function generatedWeightNumerator(y) {
  if (y < RAMP.yTop) return RAMP.denominator;
  if (y > RAMP.yBot) return 0;
  return RAMP.yBot - y;
}

/** One 8-bit sRGB channel, integer interpolation with round-half-up. */
export function blendChannel(generated, h1, num) {
  const d = RAMP.denominator;
  return Math.floor((num * generated + (d - num) * h1 + Math.floor(d / 2)) / d);
}

/** PRE-GATE: identical solid silhouette across every pixel of the band's rows. */
export function transitionSilhouetteDiff(h1Rgba, generatedRgba, width = OUT_W, yTop = RAMP.yTop, yBot = RAMP.yBot) {
  let count = 0; const sample = [];
  for (let y = yTop; y <= yBot; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    const a = h1Rgba[i + 3] >= SOLID_ALPHA, b = generatedRgba[i + 3] >= SOLID_ALPHA;
    if (a !== b) { count++; if (sample.length < 8) sample.push([x, y]); }
  }
  return { count, sample, any: count > 0 };
}

/**
 * The two POST-gates, measured against an ARBITRARY candidate output. Kept separate from
 * recompose() so a composite produced anywhere — including one this tool did not write —
 * can be audited with the same rule, and so the gates are testable on a deliberately
 * corrupted output rather than only on one this function just built correctly itself.
 */
export function verifyRecomposed({ outRgba, h1Rgba, edit, transition, width = OUT_W, height = OUT_H }) {
  const n = width * height;
  let protectedDiffBytes = 0, protectedDiffPixels = 0; const protectedDiffSample = [];
  for (let p = 0; p < n; p++) {
    if (edit[p]) continue;
    let d = 0;
    for (let c = 0; c < 4; c++) if (outRgba[p * 4 + c] !== h1Rgba[p * 4 + c]) d++;
    if (d) {
      protectedDiffBytes += d; protectedDiffPixels++;
      if (protectedDiffSample.length < 8) protectedDiffSample.push([p % width, (p / width) | 0]);
    }
  }
  let transitionSilhouetteDiffPixels = 0;
  for (let p = 0; p < n; p++) {
    if (!transition[p]) continue;
    if ((outRgba[p * 4 + 3] >= SOLID_ALPHA) !== (h1Rgba[p * 4 + 3] >= SOLID_ALPHA)) transitionSilhouetteDiffPixels++;
  }
  return { protectedDiffBytes, protectedDiffPixels, protectedDiffSample, transitionSilhouetteDiffPixels };
}

class GateError extends Error {
  constructor(gate, message, report) { super(`hard gate FAILED [${gate}]: ${message}`); this.gate = gate; this.report = report; }
}

/**
 * The whole algorithm, pure and dependency-free so it can be exercised on synthetic fixtures.
 * Throws GateError on any gate failure; returns { rgba, report } otherwise.
 */
export function recompose({ h1Rgba, generatedRgba, edit, transition, width = OUT_W, height = OUT_H }) {
  const n = width * height;
  if (h1Rgba.length !== n * 4) throw new GateError("input", `H1 buffer is ${h1Rgba.length} bytes, expected ${n * 4}`);
  if (generatedRgba.length !== n * 4) throw new GateError("input", `generated buffer is ${generatedRgba.length} bytes, expected ${n * 4}`);
  if (edit.length !== n || transition.length !== n) throw new GateError("input", "region buffers do not match the canvas");
  for (let i = 0; i < n; i++) if (transition[i] && !edit[i]) throw new GateError("input", "TRANSITION is not a subset of EDIT");

  // PRE-GATE — generated alpha may not decide the transition silhouette.
  const pre = transitionSilhouetteDiff(h1Rgba, generatedRgba, width, RAMP.yTop, RAMP.yBot);
  if (pre.any) {
    throw new GateError("pre.transition-silhouette",
      `${pre.count} pixel(s) differ in solid silhouette across rows ${RAMP.yTop}-${RAMP.yBot}; first: ${JSON.stringify(pre.sample)}`,
      { transitionSilhouetteDiffPixels: pre.count });
  }

  const out = Buffer.alloc(n * 4);
  let corePx = 0, transitionPx = 0, protectPx = 0;
  for (let y = 0; y < height; y++) {
    const num = generatedWeightNumerator(y);
    for (let x = 0; x < width; x++) {
      const p = y * width + x, i = p * 4;
      if (!edit[p]) {                       // PROTECT — H1 byte-identical
        out[i] = h1Rgba[i]; out[i + 1] = h1Rgba[i + 1]; out[i + 2] = h1Rgba[i + 2]; out[i + 3] = h1Rgba[i + 3];
        protectPx++;
      } else if (transition[p]) {           // TRANSITION — ramped RGB, H1 alpha
        out[i]     = blendChannel(generatedRgba[i],     h1Rgba[i],     num);
        out[i + 1] = blendChannel(generatedRgba[i + 1], h1Rgba[i + 1], num);
        out[i + 2] = blendChannel(generatedRgba[i + 2], h1Rgba[i + 2], num);
        out[i + 3] = h1Rgba[i + 3];
        transitionPx++;
      } else {                              // CORE — generated, used directly
        out[i] = generatedRgba[i]; out[i + 1] = generatedRgba[i + 1]; out[i + 2] = generatedRgba[i + 2]; out[i + 3] = generatedRgba[i + 3];
        corePx++;
      }
    }
  }

  const post = verifyRecomposed({ outRgba: out, h1Rgba, edit, transition, width, height });
  const report = {
    canvas: [width, height], corePx, transitionPx, protectPx,
    ...post, preGateSilhouetteDiffPixels: pre.count, outputSha256: sha256(out),
  };
  if (post.protectedDiffBytes !== 0)
    throw new GateError("post.protected-bytes", `${post.protectedDiffBytes} differing RGBA byte(s) in ${post.protectedDiffPixels} protected pixel(s); first: ${JSON.stringify(post.protectedDiffSample)}`, report);
  if (post.transitionSilhouetteDiffPixels !== 0)
    throw new GateError("post.transition-silhouette", `${post.transitionSilhouetteDiffPixels} pixel(s) changed solidity inside TRANSITION`, report);
  if (corePx + transitionPx + protectPx !== n)
    throw new GateError("post.coverage", "CORE + TRANSITION + PROTECT do not cover the canvas exactly", report);
  return { rgba: out, report };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
function argOf(flag) { const i = process.argv.indexOf(flag); return i > 0 ? process.argv[i + 1] : null; }

function loadPinnedPng(path, label, expectSha) {
  if (!path) throw new Error(`--${label} <path> is required`);
  if (!existsSync(path)) throw new Error(`${label} not found at ${path}`);
  const buf = readFileSync(path);
  if (expectSha) {
    const got = sha256(buf);
    if (got !== expectSha) throw new Error(`${label} sha256 ${got} != pinned ${expectSha}`);
  }
  if (buf.readUInt8(24) !== 8 || buf.readUInt8(25) !== 6) throw new Error(`${label}: expected 8-bit RGBA (colour type 6)`);
  const img = decodePng(buf, label);
  if (img.w !== OUT_W || img.h !== OUT_H) throw new Error(`${label}: expected ${OUT_W}x${OUT_H}, got ${img.w}x${img.h}`);
  return img;
}

export function run({ h1Path, generatedPath, outPath, specPath, repoRoot = REPO, log = console.log } = {}) {
  const sp = specPath || join(repoRoot, FIXTURE_DIR, FILES.spec);
  const spec = JSON.parse(readFileSync(sp, "utf8"));
  if (spec.decision !== DECISION) throw new Error(`spec is for ${spec.decision}, expected ${DECISION}`);
  if (spec.inputs.authoringBase.sha256 !== H1_SHA256) throw new Error("spec H1 pin does not match the tool's pin");

  // The regions come from the tracked fixtures, verified against the spec's own hashes.
  const readMask = (key, marker) => {
    const p = join(repoRoot, FIXTURE_DIR, FILES[key]);
    const buf = readFileSync(p);
    const want = spec.masks[key].sha256;
    const got = sha256(buf);
    if (got !== want) throw new Error(`${FILES[key]} sha256 ${got} != spec ${want}`);
    return pngToMask(buf, FILES[key], marker);
  };
  const edit = readMask("edit", MARKER.edit);
  const transition = readMask("transition", MARKER.transition);

  const h1 = loadPinnedPng(h1Path, "h1", H1_SHA256);
  const generated = loadPinnedPng(generatedPath, "generated", null);

  const { rgba, report } = recompose({ h1Rgba: h1.rgba, generatedRgba: generated.rgba, edit, transition });
  const png = encodePngRGBA(OUT_W, OUT_H, rgba);
  if (!outPath) throw new Error("--out <path> is required");
  writeFileSync(outPath, png);
  log(`  core ${report.corePx} px · transition ${report.transitionPx} px · protect ${report.protectPx} px`);
  log(`  protected RGBA diff: ${report.protectedDiffBytes} byte(s) in ${report.protectedDiffPixels} pixel(s)`);
  log(`  transition silhouette diff: ${report.transitionSilhouetteDiffPixels} px (pre-gate ${report.preGateSilhouetteDiffPixels} px)`);
  log(`  wrote ${outPath}  sha256 ${sha256(png)}`);
  return { report, pngSha256: sha256(png) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    run({ h1Path: argOf("--h1"), generatedPath: argOf("--generated"), outPath: argOf("--out"), specPath: argOf("--spec") });
  } catch (err) {
    console.error("✖ " + err.message);
    process.exit(1);
  }
}
