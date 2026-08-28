// R2 hair candidate — deterministic orphan-dust removal (NON-AI, no network, no randomness)
// ---------------------------------------------------------------------------------------------
// WHAT THIS REMOVES, AND NOTHING ELSE
// A generated hair candidate carries thousands of isolated pixels at 1–3 % opacity: numerical dust
// from the model's encoder, not artwork. Measured on the afro candidate: 5 938 orphan-soft pixels
// at authoring scale, mean alpha 2.4/255, 97 % of them at alpha <= 8. They are invisible, and they
// are the only reason a geometrically correct candidate cannot pass `alpha-clean-no-halo`.
//
// A pixel is cleared if and ONLY if BOTH hold ON THE ORIGINAL INPUT:
//   1. alpha < ALPHA_FLOOR (24)
//   2. it is orphan-soft by the hair gate's OWN definition — 0 < alpha < ALPHA_INK (128) and none
//      of its four orthogonal neighbours is ink, edges clamped
// A cleared pixel becomes 0,0,0,0. Every other byte is copied unchanged.
//
// WHY 24, AND WHY IT WAS NOT TUNED HERE
// ALPHA_FLOOR = 24 is this project's existing threshold, from
// `tools/avatar/openai-generate-torso-item.mjs`: "below this, a pixel is background glow rather
// than artwork". It was chosen for the torso work, before any hair candidate existed, and is
// reused unchanged. It was deliberately NOT fitted to the afro's numbers — a threshold picked to
// make one asset pass would prove nothing about the next one.
//
// WHY GEOMETRY CANNOT MOVE
// Ink is alpha >= 128. This tool only ever clears pixels below 24, so no ink pixel, envelope,
// component count or geometric gate can change. The report proves it by measuring before and
// after rather than asserting it.
//
// WHAT THIS IS NOT
// Not a repair, not a fit, not an approval. Passing the alpha gate afterwards is a PRECONDITION
// for owner review at real render scale (D-059), never a substitute for it.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng, encodePngRGBA } from "./build-r2-torso-occlusion-mask.mjs";
import { downscaleHalf } from "./promote-r2-torso-asset.mjs";
import { analyse, ALPHA_INK } from "./check-r2-hair-candidate.mjs";

export const TOOL = "clean-r2-hair-alpha";
export const TOOL_VERSION = "1.0.0";

// Reused unchanged from openai-generate-torso-item.mjs. Do not tune.
export const ALPHA_FLOOR = 24;

export const SRC_W = 1024, SRC_H = 1536;

// Output may never land where a runtime asset, a protected fixture or production code lives.
const FORBIDDEN_OUT = [
  ["assets", "avatar-r2"], ["assets", "avatar"], ["js"], ["supabase"],
  ["tools", "avatar", "fixtures"],
];

export function isForbiddenOutput(outPath, repoRoot) {
  const rel = resolve(outPath).slice(resolve(repoRoot).length + 1).split(sep);
  return FORBIDDEN_OUT.some((f) => f.every((seg, i) => rel[i] === seg));
}

// The hair gate's own orphan test, mirrored exactly so the two can never disagree.
export function isOrphanSoft(rgba, w, h, x, y) {
  const a = rgba[(y * w + x) * 4 + 3];
  if (a === 0 || a >= ALPHA_INK) return false;
  const inkAt = (px, py) => rgba[(py * w + px) * 4 + 3] >= ALPHA_INK;
  const near = inkAt(Math.max(0, x - 1), y) || inkAt(Math.min(w - 1, x + 1), y) ||
               inkAt(x, Math.max(0, y - 1)) || inkAt(x, Math.min(h - 1, y + 1));
  return !near;
}

export function countOrphanSoft(rgba, w, h) {
  let n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (isOrphanSoft(rgba, w, h, x, y)) n++;
  return n;
}

/**
 * Pure. Returns { rgba, report }; never mutates `src`.
 * Every decision reads `src`, so clearing one pixel can never make a neighbour newly orphaned
 * within the same run: no cascade, and the result does not depend on scan order.
 */
export function cleanAlpha(src, w, h) {
  const out = Buffer.from(src);
  const histogram = new Map();
  let changed = 0, maxRemovedAlpha = 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = src[i + 3];
      if (a >= ALPHA_FLOOR) continue;                 // rule 1, against the ORIGINAL
      if (!isOrphanSoft(src, w, h, x, y)) continue;   // rule 2, against the ORIGINAL
      out[i] = 0; out[i + 1] = 0; out[i + 2] = 0; out[i + 3] = 0;
      changed++;
      if (a > maxRemovedAlpha) maxRemovedAlpha = a;
      histogram.set(a, (histogram.get(a) ?? 0) + 1);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  // 4-connected components of the removed set — dust should be scattered, not a solid region.
  let components = 0;
  if (changed > 0) {
    const removed = new Uint8Array(w * h);
    for (let p = 0; p < w * h; p++) if (src[p * 4 + 3] !== 0 && out[p * 4 + 3] === 0) removed[p] = 1;
    const seen = new Uint8Array(w * h);
    for (let p = 0; p < w * h; p++) {
      if (!removed[p] || seen[p]) continue;
      components++;
      seen[p] = 1;
      const stack = [p];
      while (stack.length) {
        const q = stack.pop(), qx = q % w, qy = (q / w) | 0;
        for (const [nx, ny] of [[qx - 1, qy], [qx + 1, qy], [qx, qy - 1], [qx, qy + 1]]) {
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const r = ny * w + nx;
          if (removed[r] && !seen[r]) { seen[r] = 1; stack.push(r); }
        }
      }
    }
  }

  // Independent audit: recomputed from src vs out, not trusted from the loop above.
  let atOrAboveFloor = 0, atOrAboveInk = 0, withInkNeighbour = 0, notFullyCleared = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (out[i] === src[i] && out[i + 1] === src[i + 1] &&
          out[i + 2] === src[i + 2] && out[i + 3] === src[i + 3]) continue;
      const a = src[i + 3];
      if (a >= ALPHA_FLOOR) atOrAboveFloor++;
      if (a >= ALPHA_INK) atOrAboveInk++;
      if (!isOrphanSoft(src, w, h, x, y)) withInkNeighbour++;
      if (!(out[i] === 0 && out[i + 1] === 0 && out[i + 2] === 0 && out[i + 3] === 0)) notFullyCleared++;
    }
  }

  return {
    rgba: out,
    report: {
      alphaFloor: ALPHA_FLOOR,
      inkThreshold: ALPHA_INK,
      pixelsChanged: changed,
      maxRemovedAlpha,
      removedAlphaHistogram: Object.fromEntries([...histogram.entries()].sort((a, b) => a[0] - b[0])),
      removedBoundingBox: changed ? { minX, minY, maxX, maxY } : null,
      removedComponents: components,
      invariants: {
        changedAtOrAboveAlphaFloor: atOrAboveFloor,
        changedAtOrAboveInk: atOrAboveInk,
        changedWithInkNeighbour: withInkNeighbour,
        changedToSomethingOtherThanFullyTransparent: notFullyCleared,
      },
    },
  };
}

const sha = (b) => createHash("sha256").update(b).digest("hex");

function geometryOf(rgba, w, h) {
  const a = analyse(rgba, w, h);
  return { ink: a.ink, envelope: a.envelope, components: a.components, meanSat: a.meanSat, peakSat: a.peakSat };
}

export function run(inPath, outPath, repoRoot) {
  const inAbs = resolve(inPath), outAbs = resolve(outPath);
  if (inAbs === outAbs) throw new Error("REFUSED: in-place overwrite; give a distinct output path");
  if (isForbiddenOutput(outAbs, repoRoot)) throw new Error(`REFUSED: output under a runtime/protected path: ${outPath}`);
  if (!existsSync(inAbs)) throw new Error(`input not found: ${inPath}`);

  const srcBuf = readFileSync(inAbs);
  const png = decodePng(srcBuf, "candidate");
  if (png.w !== SRC_W || png.h !== SRC_H) {
    throw new Error(`REFUSED: expected ${SRC_W}x${SRC_H} authoring canvas, got ${png.w}x${png.h}`);
  }

  // downscaleHalf returns a raw RGBA Buffer; the served canvas is w>>1 by h>>1.
  const sw = png.w >> 1, sh = png.h >> 1;

  const before = geometryOf(png.rgba, png.w, png.h);
  const beforeAuthoring = countOrphanSoft(png.rgba, png.w, png.h);
  const beforeServed = countOrphanSoft(downscaleHalf(png.w, png.h, png.rgba), sw, sh);

  const { rgba, report } = cleanAlpha(png.rgba, png.w, png.h);

  const after = geometryOf(rgba, png.w, png.h);
  const afterAuthoring = countOrphanSoft(rgba, png.w, png.h);
  const afterServed = countOrphanSoft(downscaleHalf(png.w, png.h, rgba), sw, sh);

  const outBuf = encodePngRGBA(png.w, png.h, rgba);
  mkdirSync(dirname(outAbs), { recursive: true });
  writeFileSync(outAbs, outBuf);

  const sidecar = {
    tool: TOOL,
    toolVersion: TOOL_VERSION,
    input: { path: inPath, sha256: sha(srcBuf), width: png.w, height: png.h },
    output: { path: outPath, sha256: sha(outBuf), width: png.w, height: png.h },
    ...report,
    orphanSoft: {
      authoring: { before: beforeAuthoring, after: afterAuthoring, tolerance: 64, size: `${png.w}x${png.h}` },
      served: {
        before: beforeServed, after: afterServed, tolerance: 16, size: `${sw}x${sh}`,
        downscale: "premultiplied 2x2 box average — promote-r2-torso-asset.downscaleHalf, reused verbatim",
      },
    },
    geometry: { before, after, identical: JSON.stringify(before) === JSON.stringify(after) },
    note: "Dust removal is a PRECONDITION for owner review, never a visual approval (D-059).",
  };
  writeFileSync(outAbs.replace(/\.png$/i, ".alpha-report.json"), JSON.stringify(sidecar, null, 2), "utf8");
  return sidecar;
}

const HERE = dirname(fileURLToPath(import.meta.url));

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [, , inP, outP] = process.argv;
  if (!inP || !outP) {
    console.error(`usage: node tools/avatar/${TOOL}.mjs <in.png> <out.png>`);
    process.exit(2);
  }
  try {
    const r = run(inP, outP, join(HERE, "..", ".."));
    console.log(`${TOOL} v${TOOL_VERSION}`);
    console.log(`  in  ${r.input.sha256.slice(0, 16)}…  out ${r.output.sha256.slice(0, 16)}…`);
    console.log(`  cleared ${r.pixelsChanged} px in ${r.removedComponents} components, max removed alpha ${r.maxRemovedAlpha} (floor ${r.alphaFloor})`);
    console.log(`  orphan authoring ${r.orphanSoft.authoring.before} → ${r.orphanSoft.authoring.after} (max ${r.orphanSoft.authoring.tolerance})`);
    console.log(`  orphan served    ${r.orphanSoft.served.before} → ${r.orphanSoft.served.after} (max ${r.orphanSoft.served.tolerance})`);
    console.log(`  geometry identical: ${r.geometry.identical}`);
    console.log(`  changed at alpha>=24: ${r.invariants.changedAtOrAboveAlphaFloor} · at alpha>=128: ${r.invariants.changedAtOrAboveInk} · with ink neighbour: ${r.invariants.changedWithInkNeighbour}`);
  } catch (e) {
    console.error(String(e.message ?? e));
    process.exit(1);
  }
}
