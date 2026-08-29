// Deterministic conversion of a raw hair candidate into the luminance map the asset contract
// requires (167A production spec §5.1), and nothing else.
// ---------------------------------------------------------------------------------------------
// PROVENANCE. This is the conversion the earlier hair rounds actually ran, recovered from the
// session transcript rather than rewritten:
//   transcript  .claude/projects/C--Users-…-DEN-SEJE-APP/da0e2fb1-9536-4d79-9fb9-47bf3ff8c650.jsonl
//   line 5363   Write tool call
//   originally  DEN SEJE APP-r2hair/tools/avatar/build/r2-hair-first-slice/20260828-131348/to-luminance.mjs
// Line 5374 of the same transcript shows its import being repointed at
// build-r2-torso-occlusion-mask.mjs, line 5386 shows it being executed, and line 5671 hashes the
// `*.candidate.png` files it produced for the next round. It ran; this is not a reconstruction.
//
// THE PIXEL OPERATION IS UNCHANGED from that original. Only the shape around it moved: the
// original hard-coded seven styles and one directory, which is exactly why it was lost with its
// build directory. This one takes an input and an output path.
//
// WHAT IT DOES, exhaustively:
//   1. decode the raw PNG to RGBA
//   2. per pixel, replace R,G,B with the Rec.709 luma: round(0.2126R + 0.7152G + 0.0722B)
//   3. leave ALPHA untouched
//   4. re-encode at the same dimensions as RGBA PNG
//
// WHAT IT MUST NEVER DO, per the task that created it and D-059: no scaling, no cropping, no
// translation, no rotation, no alpha edit, no despeckling, no hole-filling, no edge cleanup. The
// geometry that comes back from the model is the geometry that gets measured. A candidate that
// fails a gate stays failed.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng, encodePngRGBA } from "./build-r2-torso-occlusion-mask.mjs";

export const TOOL = "to-luminance-map";
export const FORMULA = "y = round(0.2126*R + 0.7152*G + 0.0722*B); R=G=B=y; A unchanged";

/** The Rec.709 luma of one 8-bit triple, rounded exactly as the original did. */
export function luma(r, g, b) {
  return Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
}

/**
 * Pure. Returns { rgba, pixelsDesaturated, opaquePixels }; never mutates `src`.
 * Alpha is copied through untouched — the caller can and should verify that byte for byte.
 */
export function toLuminance(src) {
  const rgba = Buffer.from(src);
  let changed = 0, opaque = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] >= 128) opaque++;
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    const y = luma(r, g, b);
    if (r !== y || g !== y || b !== y) changed++;
    rgba[i] = y; rgba[i + 1] = y; rgba[i + 2] = y;   // alpha at i+3 untouched
  }
  return { rgba, pixelsDesaturated: changed, opaquePixels: opaque };
}

/** Converts one file. Refuses to overwrite, and refuses to write over its own input. */
export function convertFile(inPath, outPath) {
  const inAbs = resolve(inPath), outAbs = resolve(outPath);
  if (inAbs === outAbs) throw new Error("REFUSED: input and output are the same file");
  if (existsSync(outAbs)) throw new Error(`REFUSED: output already exists: ${outPath}`);
  if (!existsSync(inAbs)) throw new Error(`input not found: ${inPath}`);

  const srcBuf = readFileSync(inAbs);
  const png = decodePng(srcBuf, inPath);
  const { rgba, pixelsDesaturated, opaquePixels } = toLuminance(png.rgba);

  // The contract this tool exists to keep: alpha survives untouched.
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] !== png.rgba[i]) throw new Error(`REFUSED: alpha changed at byte ${i}`);
  }

  const outBuf = encodePngRGBA(png.w, png.h, rgba);
  writeFileSync(outAbs, outBuf);
  return {
    tool: TOOL, formula: FORMULA,
    input: { path: inPath, w: png.w, h: png.h, sha256: createHash("sha256").update(srcBuf).digest("hex") },
    output: { path: outPath, w: png.w, h: png.h, bytes: outBuf.length, sha256: createHash("sha256").update(outBuf).digest("hex") },
    pixelsDesaturated, opaquePixels,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [, , inP, outP] = process.argv;
  if (!inP || !outP) {
    console.error(`usage: node tools/avatar/${TOOL}.mjs <in.png> <out.png>`);
    process.exit(1);
  }
  try {
    const r = convertFile(inP, outP);
    console.log(`${TOOL}`);
    console.log(`  formula            : ${r.formula}`);
    console.log(`  in                 : ${r.input.w}x${r.input.h}  ${r.input.sha256}`);
    console.log(`  out                : ${r.output.w}x${r.output.h}  ${r.output.sha256}`);
    console.log(`  opaque px          : ${r.opaquePixels}`);
    console.log(`  pixels desaturated : ${r.pixelsDesaturated}`);
  } catch (err) {
    console.error(String(err.message ?? err));
    process.exit(1);
  }
}
