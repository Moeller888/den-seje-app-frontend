// ---------------------------------------------------------------------------------------------
// check-r2-hair-candidate — the acceptance gate for an option-A hair raster (D-102 §4A).
//
// DETERMINISTIC, NO AI, NO NETWORK, WRITES NOTHING ITSELF. It reads one candidate PNG and reports
// whether that artwork can become an R2 hair layer. It does not produce, promote or register
// anything, and it takes no position on WHO or WHAT drew the candidate — that is a separate
// owner decision (see docs/167a-r2-hair-a-production-spec.md §2).
//
//   node tools/avatar/check-r2-hair-candidate.mjs <candidate.png> <style>
//
// ── WHAT IS MEASURED, AND ON WHICH PIXELS (D-115) ────────────────────────────────────────────
// The checks fall into TWO kinds, and conflating them is what this file used to do:
//
//   AUTHORING PRECONDITIONS (2) — properties of the SOURCE the artist/model delivered. They are
//   about the input being a usable input at all, so they are measured on the 1024x1536 candidate:
//       dimensions, luminance-map
//
//   RUNTIME ACCEPTANCE GATES (9) — the VISUAL judgement. A student never sees the authoring
//   canvas, nor the intermediate downscale; they see the decoded 512x768 WebP the browser paints.
//   So that is what these measure, after the WHOLE existing pipeline:
//       authoring alpha cleanup -> downscaleHalf -> served alpha cleanup
//         -> cwebp -lossless -exact -z 9 -metadata none -> dwebp
//       has-ink, covers-the-crown, clears-the-eye-line, respects-the-neck, within-style-envelope,
//       centred-on-the-skull, no-floating-islands, alpha-clean-no-halo, legible-at-render-sizes
//
// WHY THE RUNTIME PIXELS ARE THE ACCEPTANCE BASIS. Judging an intermediate is judging something
// that never ships. It is the same mistake D-059 cost us on the arm fringe: the full-res composite
// flattered the matte, and the defect only existed at render scale on the real surface. The
// downscale and the two cleanup passes are not cosmetic — they merge pixels, remove dust and
// change every count the gates read. A candidate can legitimately fail on the authoring canvas and
// be flawless in the file that ships, and the reverse is equally possible. Only one of those two
// images is the product.
//
// NOTHING WAS LOOSENED TO MAKE THAT TRUE. Every envelope, the ink threshold (128), ALPHA_FLOOR
// (24), the orphan budget (16) and both cleanup algorithms are byte-for-byte what they were. The
// change is WHICH IMAGE the unchanged numbers are read from.
//
// WHY THESE GATES: each one exists because failing it breaks something specific and hard to see
// late — a coloured map silently disables hair colour (D-103), a gap at the crown shows scalp the
// base never had to render, ink below the neck collides with the torso garment (D-090), and a
// style that drifts outside its C2 envelope stops being the style the student picked.
// ---------------------------------------------------------------------------------------------

import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { decodePng } from "./build-r2-torso-occlusion-mask.mjs";
import { RENDER_SIZES, MIN_SCALE_COVERAGE } from "./check-r2-torso-candidate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = join(HERE, "..", "..");

export const TOOL = "check-r2-hair-candidate";
export const TOOL_VERSION = "2.0.0";   // 2.0.0: runtime-pixel gates + 8-neighbour islands (D-115)

// ── the authoring canvas, pinned to the torso pipeline (D-084/D-089) ──────────────────────────
export const SRC_W = 1024, SRC_H = 1536;      // candidate PNG
export const OUT_W = 512, OUT_H = 768;        // served asset after the /2 premultiplied box
export const K = 160 / SRC_W;                 // candidate px -> 160x240 C2 canvas unit (0.15625)

// ── frozen base landmarks, C2 canvas units (measure-r2-hair-fit, body-neutral-medium-v2) ─────
export const BASE = Object.freeze({
  crownY: 31.6,          // top of the bald skull
  skullLo: 50.6, skullHi: 110.3, skullW: 60.0, skullCx: 80.5,
  neckY: 81.6,           // where the head ends and the neck begins
  shoulderY: 83.8,       // the torso garment (D-090) starts here
  eyeLineY: 57.0,        // R2 eye line (D-080) — hair must not reach it
});

// ── per-style envelopes measured from the C2 assets' own path data (D-102 §3.3) ──────────────
// These are the shapes the student already recognises, so a candidate that leaves its envelope
// stops being the style they chose. Tolerance is generous on purpose: this gate catches a wrong
// silhouette, not an artistic difference.
// `highestY` is HOW MUCH CROWN VOLUME the style has, and it was missing until D-116. Without it
// the top was unbounded: `covers-the-crown` is a MINIMUM (reach at least the bald skull),
// `respects-the-neck` bounds the bottom, and `within-style-envelope` bounded only x. A candidate
// could tower arbitrarily far over its style and still pass every check. It happened: the `short`
// candidate reached y 9.4 against short's own 20.5 — a spiky cut wearing the name of a neat one.
//
// All four numbers come from the SAME source and the SAME tool: exact quadratic-Bezier and line
// column crossings of the C2 assets' own path data (measure-r2-hair-fit.measureC2Style). That the
// method is the one that produced the pre-existing values is not asserted, it is PROVEN — a test
// re-derives xLo, xHi and lowestY from the tool and requires them to equal what is written here.
export const STYLE_TARGETS = Object.freeze({
  short:    { xLo: 52, xHi: 108, highestY: 20.50, lowestY: 56,  drapes: false },
  tousled:  { xLo: 50, xHi: 110, highestY: 13.00, lowestY: 55,  drapes: false },
  curly:    { xLo: 44, xHi: 113, highestY: 14.08, lowestY: 61,  drapes: false },
  long:     { xLo: 41, xHi: 119, highestY: 18.50, lowestY: 146, drapes: true  },
  ponytail: { xLo: 52, xHi: 117, highestY: 19.50, lowestY: 123, drapes: true  },
  buzz:     { xLo: 53, xHi: 107, highestY: 21.50, lowestY: 47,  drapes: false },
  afro:     { xLo: 34, xHi: 126, highestY:  6.02, lowestY: 61,  drapes: false },
});
export const STYLES = Object.freeze(Object.keys(STYLE_TARGETS));

export const X_TOLERANCE = 4;        // C2 units the envelope may exceed its target on each side
// The same generosity, applied upward (D-116). Stated as its own constant rather than reusing
// X_TOLERANCE, because the two bound different things and should be free to diverge if a
// measurement ever justifies it — not silently welded together by an alias. The value is 4 for the
// same reason X_TOLERANCE is: it catches a wrong silhouette, not an artistic difference. Checked
// against the two rasters that exist — the approved afro clears it by 3.6 units, and the `short`
// candidate that provoked the decision misses it by 7.1.
export const Y_TOLERANCE = 4;        // C2 units the envelope may rise above its style's own crown
export const ALPHA_INK = 128;        // D-071 render-scale convention: alpha >= 128 is ink
export const MAX_MEAN_SAT = 0.02;    // the shipped hair measures 0.0000
export const MAX_PEAK_SAT = 0.10;    // isolated antialiasing artefacts only
export const MAX_SPECK_PX = 16;      // a component smaller than this is a speck, not a lock
// ORPHAN-SOFT BUDGET — TWO SCALES, because the torso convention is defined at two.
// check-r2-torso-candidate allows MAX_ORPHAN_SOFT_PX = 64 on the 1024x1536 AUTHORING canvas;
// promote-r2-torso-asset allows MAX_ORPHAN_SOFT_PX_SERVED = 16 on the 512x768 SERVED asset,
// documented there as "64 authoring px / 4".
//
// WHERE EACH IS ENFORCED, since D-115 moved the visual gates onto the runtime pixels:
//   HALO_TOLERANCE_SERVED (16)    — the `alpha-clean-no-halo` RUNTIME GATE below, on the decoded
//                                   512x768 asset. Unchanged number, runtime image.
//   HALO_TOLERANCE_AUTHORING (64) — clean-r2-hair-alpha.mjs's `authoringWithinBudget`
//                                   postcondition, which refuses to WRITE a cleaned authoring PNG
//                                   that exceeds it. That is where it has always actually bitten,
//                                   and it is unchanged. It is deliberately NOT re-asserted here:
//                                   this file judges the shipped image, and the authoring canvas
//                                   is not it. The count is still REPORTED, never silently lost.
export const HALO_TOLERANCE_AUTHORING = 64;  // 1024x1536, matches check-r2-torso-candidate
export const HALO_TOLERANCE_SERVED = 16;     // 512x768, the pixels that actually ship

const u = (v) => Math.round(v * 10) / 10;

// ── THE EYES, AS THE ARTWORK ITSELF DEFINES THEM (D-118) ─────────────────────────────────────
// `clears-the-eye-line` used to read ONLY the TOP of each forehead column: "hair must not BEGIN
// below the eye line". It never asked where the hair ENDED. A mass that started at y 33 and
// continued down over the whole face therefore passed — measured on the image-guided `short`
// canary, which covered 100 % of the iris and 79 % of the face and scored a pass on this gate.
//
// The fix needs to know where the eyes actually are, and that is not a number to invent: it is the
// shipped iris layer's own ink. `eye-iris-mask-v1.png` is that layer thresholded at ALPHA_INK and
// tracked as a fixture, so this file stays pure JS and CI-safe — decoding the .webp would need the
// vendored binary and would drag the whole gate suite out of CI.
//
// WHY THE IRIS AND NOT THE WHOLE EYE: the approved afro grazes 4.7 % of the full eye layer (lid and
// lash corner) and 0.0 % of the iris. Gating the full eye at zero would reject an asset the owner
// has already accepted. The iris is the part you see out of, hair renders at z40 in FRONT of the
// eyes (R2_STACK_Z), and there is no defensible amount of hair in front of a pupil — so the limit
// is zero. It is zero on principle, not because zero happens to separate the fixtures: northstar,
// afro, buzz and short all achieve exactly 0, so the bar is demonstrably reachable.
export const IRIS_MASK_FILE = join(HERE, "fixtures", "r2-hair", "eye-iris-mask-v1.png");
export const IRIS_MASK_SHA256 = "8e7f2ff36ee53aa24f0afc0ea5595cacb757e236d8b3ef37b417000067dc5bd5";
export const IRIS_SOURCE = "assets/avatar-r2/eyes/eyes-neutral-iris-v1.webp";
export const IRIS_SOURCE_SHA256 = "0187788c8d2203aa733aebc18e2f9fd8b6af6d171d352c8f6a428b12a5d9f1d7";
// THE THRESHOLD HOLE THIS CLOSES. The first version counted only pixels at alpha >= ALPHA_INK, so
// `0` did not mean "no hair over the iris" — it meant "no OPAQUE hair over the iris". A continuous
// veil at alpha 127 could black out the entire pupil and pass, because not one of its pixels
// reached the ink threshold. The limit is therefore on the MAXIMUM ALPHA any hair pixel has over
// the iris, not on a count above a threshold: alpha 127 over the whole pupil now reads 127, and
// fails.
//
// WHY ZERO, AND WHY THAT IS NOT AN INVENTED NUMBER. Measured on the real decoded runtime assets,
// four layers are IRIS-CLEAN — they put nothing over the iris at any opacity whatsoever:
//
//   northstar 0 · afro 0 · buzz 0 · short 0     (max alpha 0, alpha-weighted 0.00 %)
//   tousled 248 · long 254 · ponytail 254 · guided canary 254
//
// IRIS-CLEAN IS NOT THE SAME AS VISUALLY APPROVED, and the four are not one category:
//   northstar — approved positive control
//   afro      — OWNER-APPROVED positive control
//   buzz      — iris-clean, but VISUALLY REJECTED for the needle tips at the ears
//   short     — iris-clean, but rejected by other geometric gates (the D-116 crown bound)
// Only the first two are approved artwork. The other two merely happen to leave the pupil alone.
//
// The case for a fail-closed zero is therefore:
//   * the two APPROVED positive controls sit at exactly zero alpha over the iris;
//   * the other two iris-clean layers show zero is technically achievable, not aspirational;
//   * hair over the pupil is a visible conflict — it renders at z40, in front of the eyes;
//   * and a future faint overlap pixel should be REPORTED for the owner to judge, rather than
//     automatically loosening the threshold.
//
// Deliberately NOT claimed: that any surviving pixel is intentional artwork. Connected
// antialiasing can survive the served cleanup without an artist ever meaning to put it there.
// That is exactly why the detail carries the exact max alpha and obscured fraction — so a faint
// overlap is a case the owner can weigh, not a silent rejection or a silent relaxation.
export const MAX_IRIS_ALPHA = 0;

let _iris = null;
/** The iris mask, loaded once and SHA-verified. A swapped fixture must not pass unnoticed. */
export function irisMask() {
  if (_iris) return _iris;
  const buf = readFileSync(IRIS_MASK_FILE);
  const got = createHash("sha256").update(buf).digest("hex");
  if (got !== IRIS_MASK_SHA256) {
    throw new Error(`REFUSED: eye-iris-mask-v1.png SHA ${got.slice(0, 16)}… != pinned ` +
      `${IRIS_MASK_SHA256.slice(0, 16)}… — the eye region is not the one this gate was calibrated on`);
  }
  const png = decodePng(buf, "iris mask");
  const m = new Uint8Array(png.w * png.h);
  let count = 0;
  for (let i = 0; i < m.length; i++) if (png.rgba[i * 4 + 3] >= ALPHA_INK) { m[i] = 1; count++; }
  _iris = { m, w: png.w, h: png.h, count };
  return _iris;
}

/**
 * How many of the iris's own pixels the hair covers. Sampled proportionally, so a gate measured on
 * the 512x768 runtime asset and a test measured on a small proportional canvas ask the same
 * question of the same anatomy.
 */
export function irisCoverage(rgba, w, h) {
  const iris = irisMask();
  let covered = 0, inkCovered = 0, maxAlpha = 0, alphaSum = 0;
  for (let i = 0; i < iris.m.length; i++) {
    if (!iris.m[i]) continue;
    const mx = i % iris.w, my = (i / iris.w) | 0;
    const x = Math.min(w - 1, Math.floor((mx + 0.5) * w / iris.w));
    const y = Math.min(h - 1, Math.floor((my + 0.5) * h / iris.h));
    const a = rgba[(y * w + x) * 4 + 3];
    if (a > 0) covered++;
    if (a >= ALPHA_INK) inkCovered++;
    if (a > maxAlpha) maxAlpha = a;
    alphaSum += a;
  }
  // Three different questions, reported together because each one alone can be fooled:
  //   covered / inkCovered — HOW MANY iris pixels have hair over them. Says nothing about opacity,
  //                          which is exactly how a sub-threshold veil slipped through.
  //   maxAlpha            — the DENSEST single point. Catches a small solid blob that an averaged
  //                          figure would dilute to nothing. This is what the gate decides on.
  //   obscuredFraction    — how much of the pupil is ACTUALLY hidden, weighting each pixel by its
  //                          own alpha. The quantity the eye responds to, and the one that makes a
  //                          failure legible: "99 % obscured" and "0.08 % obscured" are different
  //                          problems even though both are non-zero.
  return {
    covered, inkCovered, maxAlpha, total: iris.count,
    obscuredFraction: alphaSum / (255 * iris.count),
  };
}

// ── TWO DIFFERENT 4-vs-8 QUESTIONS. THEY ARE NOT THE SAME QUESTION. ──────────────────────────
// This file asks about neighbourhoods twice, and D-115 changed exactly one of them.
//
//   isOrphanSoft   — "is this faint pixel ATTACHED TO AN EDGE, or is it detached matte residue?"
//                    FOUR orthogonal neighbours. UNCHANGED. It is the shared definition that
//                    decides what the cleanup tools may delete, so widening it would silently
//                    licence deleting more artwork. Not a gate about shape; a rule about dust.
//
//   countComponents — "is the artwork ONE piece of hair, or several detached pieces?"
//                    EIGHT neighbours since D-115. See that function for why.
//
// Conflating the two is the trap: they use the same word "neighbour" for opposite purposes, and
// the safe answer differs. Widening the dust rule REMOVES pixels; widening the island rule only
// changes how existing pixels are GROUPED and removes nothing.

// ── the ONE orphan-soft definition (FOUR orthogonal neighbours — deliberately) ────────────────
// A soft pixel (0 < alpha < ALPHA_INK) with no ink among its FOUR orthogonal neighbours is halo
// left behind by a bad matte. Edge coordinates clamp, so a pixel on the border compares against
// itself rather than falling off the canvas.
//
// This is exported and used by BOTH analyse() below and clean-r2-hair-alpha.mjs. It used to be
// written out twice, with a comment claiming the two could not disagree — which a copy is exactly
// free to do the moment either side is edited. There is now one implementation and no second copy.
// Not the torso definition (eight neighbours, opaque-only): the hair gate's semantics are kept.
export function isOrphanSoft(rgba, w, h, x, y) {
  const a = rgba[(y * w + x) * 4 + 3];
  if (a === 0 || a >= ALPHA_INK) return false;
  const inkAt = (px, py) => rgba[(py * w + px) * 4 + 3] >= ALPHA_INK;
  return !(inkAt(Math.max(0, x - 1), y) || inkAt(Math.min(w - 1, x + 1), y) ||
           inkAt(x, Math.max(0, y - 1)) || inkAt(x, Math.min(h - 1, y + 1)));
}

// Standalone count over a raw RGBA buffer. Always equals analyse(rgba, w, h).orphanSoft — pinned
// by a test, because that equality is the whole reason for sharing the definition.
export function countOrphanSoft(rgba, w, h) {
  let n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (isOrphanSoft(rgba, w, h, x, y)) n++;
  return n;
}

// ── connectivity for `no-floating-islands`: EIGHT neighbours (D-115) ──────────────────────────
// The four sides PLUS the four corners. A pixel joins the component it touches horizontally,
// vertically OR diagonally, so all eight positions are examined.
//
// WHY IT CHANGED. 4-neighbour connectivity sees only the four sides, so two pixels that share a
// corner are "separate" to the algorithm while being visibly, physically joined on screen — there
// is no gap between them to see. On a raster produced by a downscale that is not a rare corner
// case: averaging 2x2 blocks routinely leaves a silhouette's outermost pixel attached to the mass
// only at a corner. Calling that a floating island reports a defect the student cannot see, and
// the only ways to "fix" it are to edit the artwork or to loosen a threshold — both worse than
// counting the corner the eye already counts.
//
// IT ALSO ENDS AN INCONSISTENCY. Every other component algorithm in the R2 asset contract was
// already 8-neighbour: check-r2-torso-candidate.mjs (NEIGH8), promote-r2-torso-asset.mjs's own
// `no-floating-islands`, build-r2-torso-occlusion-mask.mjs, and the torso item generator's
// backfill check. The hair gate was the single outlier, and nothing recorded why. It is now the
// same rule everywhere. (Named without file extensions on purpose: a test guards this file
// against AI-surface tokens, and a generator's filename would trip it.)
//
// THE HONEST CONSEQUENCE, STATED RATHER THAN BURIED: under 8-neighbour, an UNBROKEN DIAGONAL
// CHAIN of ink pixels counts as connected, however long it is and however thin. A one-pixel-wide
// staircase running away from the hair mass would be judged part of it. That is a real widening
// of what "one component" admits, it is not hypothetical, and it is accepted deliberately: such a
// chain is continuous ink on screen, and no gate here has ever claimed to judge whether a shape is
// good hair — that is the owner sign-off D-105 made load-bearing. What 8-neighbour still refuses
// is what it is for: ink separated by at least one whole pixel of non-ink.
export const NEIGHBOURS_8 = Object.freeze([
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
]);

// ── measurement ──────────────────────────────────────────────────────────────────────────────

// Everything the gates need, in ONE pass over the image. Pure: no IO, no globals.
// `k` is derived from the canvas in hand, not from SRC_W, so the SAME function measures the
// 1024x1536 authoring candidate and the 512x768 runtime asset into the same C2 units. That is
// what makes a single gate definition usable on both, and what makes the gates testable on a
// small proportional canvas.
export function analyse(rgba, w, h) {
  const k = 160 / w;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let ink = 0, satSum = 0, satMax = 0, orphanSoft = 0;
  const topByCol = new Array(w).fill(Infinity);
  const botByCol = new Array(w).fill(-Infinity);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = rgba[i + 3];
      if (a === 0) continue;
      if (a < ALPHA_INK) {
        // one shared definition, so this can never drift from the cleanup tool's view
        if (isOrphanSoft(rgba, w, h, x, y)) orphanSoft++;
        continue;
      }
      ink++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (y < topByCol[x]) topByCol[x] = y;
      if (y > botByCol[x]) botByCol[x] = y;
      const R = rgba[i], G = rgba[i + 1], B = rgba[i + 2];
      const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
      const sat = mx === 0 ? 0 : (mx - mn) / mx;
      satSum += sat;
      if (sat > satMax) satMax = sat;
    }
  }
  return {
    w, h, ink,
    envelope: ink ? { xLo: minX * k, xHi: maxX * k, yLo: minY * k, yHi: maxY * k } : null,
    meanSat: ink ? satSum / ink : 0,
    peakSat: satMax,
    orphanSoft,
    topByCol, botByCol, k,
    components: countComponents(rgba, w, h),
  };
}

// Connected components over ink, iterative flood fill (no recursion: 1024x1536 overflows a stack).
// EIGHT-neighbour — see NEIGHBOURS_8 above for the decision and its consequence.
export function countComponents(rgba, w, h) {
  const seen = new Uint8Array(w * h);
  const sizes = [];
  const stack = [];
  for (let s = 0; s < w * h; s++) {
    if (seen[s] || rgba[s * 4 + 3] < ALPHA_INK) continue;
    let size = 0;
    stack.push(s);
    seen[s] = 1;
    while (stack.length) {
      const p = stack.pop();
      size++;
      const px = p % w, py = (p / w) | 0;
      for (const [dx, dy] of NEIGHBOURS_8) {
        const nx = px + dx, ny = py + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (seen[q] || rgba[q * 4 + 3] < ALPHA_INK) continue;
        seen[q] = 1;
        stack.push(q);
      }
    }
    sizes.push(size);
  }
  sizes.sort((a, b) => b - a);
  return { count: sizes.length, largest: sizes[0] || 0, specks: sizes.filter((n) => n < MAX_SPECK_PX).length };
}

// Coverage of the skull cap at each D-071 render size: nearest-neighbour downscale of the ink
// mask, measured against its own footprint — the same shape as the torso legibility gate.
export function legibility(rgba, w, h) {
  const scales = [];
  for (const [sw, sh] of RENDER_SIZES) {
    let drawn = 0, total = 0;
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const sx = Math.min(w - 1, Math.floor((x + 0.5) * w / sw));
        const sy = Math.min(h - 1, Math.floor((y + 0.5) * h / sh));
        total++;
        if (rgba[(sy * w + sx) * 4 + 3] >= ALPHA_INK) drawn++;
      }
    }
    scales.push({ size: `${sw}x${sh}`, coverage: drawn / Math.max(1, total) });
  }
  const ref = scales[0].coverage || 1;
  return scales.map((s) => ({ ...s, ratio: s.coverage / ref }));
}

// ── AUTHORING PRECONDITIONS — measured on the 1024x1536 source ────────────────────────────────
// Not visual judgements. These ask whether the delivered file is a usable INPUT: the right canvas,
// and a greyscale value map rather than coloured artwork. Both are properties of the source that
// the pipeline can neither create nor repair, which is why they stay here and not on the output.
export function authoringPreconditions(a) {
  const out = [];
  const add = (id, pass, detail) => out.push({ id, pass, detail });

  add("dimensions", a.w === SRC_W && a.h === SRC_H,
    { got: `${a.w}x${a.h}`, expect: `${SRC_W}x${SRC_H}` });

  // The one that silently breaks hair colour: the runtime multiplies this map over the token,
  // so any colour baked into the asset fights the student's choice instead of carrying it.
  // A precondition rather than a runtime gate because chroma is a property of what was AUTHORED —
  // no downscale, cleanup or lossless encode can introduce or remove it.
  add("luminance-map", a.meanSat <= MAX_MEAN_SAT && a.peakSat <= MAX_PEAK_SAT,
    { meanSat: +a.meanSat.toFixed(4), peakSat: +a.peakSat.toFixed(4),
      maxMean: MAX_MEAN_SAT, maxPeak: MAX_PEAK_SAT });

  return out;
}

// ── RUNTIME ACCEPTANCE GATES — measured on the DECODED served asset ───────────────────────────
// `rgba` must be the pixels dwebp produced from the shipped WebP, i.e. what a browser paints.
// Everything is expressed in the existing normalised C2 units, so the numbers are directly
// comparable with every measurement taken before D-115; only the image behind them changed.
export function runtimeGates(rgba, w, h, style) {
  const t = STYLE_TARGETS[style];
  if (!t) throw new Error(`unknown style '${style}' — expected one of ${STYLES.join(", ")}`);
  const a = analyse(rgba, w, h);
  const out = [];
  const add = (id, pass, detail) => out.push({ id, pass, detail });

  add("has-ink", a.ink > 0, { inkPx: a.ink });
  if (!a.envelope) return out; // nothing else is measurable on an empty asset

  // Hair has to sit ON the skull, not float above it or start below the crown.
  const crownCols = [];
  for (let x = 0; x < a.w; x++) {
    const cx = x * a.k;
    if (cx < BASE.skullLo || cx > BASE.skullHi) continue;
    if (a.topByCol[x] === Infinity) continue;
    crownCols.push(a.topByCol[x] * a.k);
  }
  const highest = crownCols.length ? Math.min(...crownCols) : Infinity;
  add("covers-the-crown", crownCols.length > 0 && highest <= BASE.crownY,
    { highestInk: u(highest), baseCrown: BASE.crownY,
      note: "hair must reach at least the top of the bald skull, or scalp shows" });

  // ...and must not reach the eyes.
  let lowestForehead = -Infinity;
  for (let x = 0; x < a.w; x++) {
    const cx = x * a.k;
    if (cx < 65 || cx > 95) continue;
    if (a.botByCol[x] === -Infinity) continue;
    const yv = a.topByCol[x] * a.k;
    if (yv > lowestForehead) lowestForehead = yv;
  }
  // TWO conditions, because the name promises the eyes are clear and the first condition alone
  // only promises the hair BEGINS above them (D-118).
  const startsAbove = lowestForehead < BASE.eyeLineY;
  const iris = irisCoverage(rgba, w, h);
  const irisClear = iris.maxAlpha <= MAX_IRIS_ALPHA;
  add("clears-the-eye-line", startsAbove && irisClear,
    { lowestForeheadInk: u(lowestForehead), eyeLine: BASE.eyeLineY, startsAboveEyeLine: startsAbove,
      irisMaxAlpha: iris.maxAlpha, irisAlphaLimit: MAX_IRIS_ALPHA,
      irisPixelsTouched: iris.covered, irisPixelsOpaque: iris.inkCovered, irisPixelsTotal: iris.total,
      irisObscuredPct: +(iris.obscuredFraction * 100).toFixed(2), irisClear,
      note: irisClear ? undefined
        : "hair covers the pupil — it renders at z40, in front of the eyes, so this is not visible " +
          "ambiguity. The limit is on MAX ALPHA, not on a count above the ink threshold: a veil " +
          "just under ink would otherwise black out the whole pupil and pass." });

  // Ink below the neck collides with the torso garment unless the style is declared to drape.
  const lowest = a.envelope.yHi;
  add("respects-the-neck", t.drapes ? lowest <= t.lowestY + 2 : lowest <= BASE.neckY,
    { lowestInk: u(lowest), limit: t.drapes ? t.lowestY + 2 : BASE.neckY, drapes: t.drapes });

  // The silhouette the student recognises — now bounded on BOTH axes (D-116).
  //
  // The name always promised an envelope; until D-116 it delivered an x-span, and the gap was not
  // theoretical. The `short` candidate matched short's width almost exactly (50.3..111.6 against
  // 52..108) while standing 11 units taller than short has any business standing, and passed.
  //
  // The BOTTOM deliberately stays with `respects-the-neck`, which already owns it and knows about
  // draping styles. This gate owns the width and the crown height; that one owns the collision
  // with the torso garment. Two questions, two gates, no overlap.
  const xOk = a.envelope.xLo >= t.xLo - X_TOLERANCE && a.envelope.xHi <= t.xHi + X_TOLERANCE;
  const topLimit = t.highestY - Y_TOLERANCE;
  const topOk = a.envelope.yLo >= topLimit;
  add("within-style-envelope", xOk && topOk,
    { x: `${u(a.envelope.xLo)}..${u(a.envelope.xHi)}`, xTarget: `${t.xLo}..${t.xHi}`,
      xTolerance: X_TOLERANCE, xOk,
      top: u(a.envelope.yLo), topLimit: u(topLimit), styleCrown: t.highestY,
      yTolerance: Y_TOLERANCE, topOk,
      note: topOk ? undefined : "the silhouette rises above this style's own crown — a taller cut wearing its name" });

  add("centred-on-the-skull", Math.abs((a.envelope.xLo + a.envelope.xHi) / 2 - BASE.skullCx) <= 2,
    { centre: u((a.envelope.xLo + a.envelope.xHi) / 2), baseCentre: BASE.skullCx });

  add("no-floating-islands", a.components.count === 1 || a.components.specks === 0,
    { connectivity: 8, components: a.components.count,
      largest: a.components.largest, specks: a.components.specks });

  add("alpha-clean-no-halo", a.orphanSoft <= HALO_TOLERANCE_SERVED,
    { orphanSoftServed: a.orphanSoft, toleranceServed: HALO_TOLERANCE_SERVED });

  const legible = legibility(rgba, w, h);
  const smallest = legible[legible.length - 1];
  add("legible-at-render-sizes", smallest.ratio >= MIN_SCALE_COVERAGE,
    { scales: legible.map((s) => ({ size: s.size, ratio: +s.ratio.toFixed(3) })),
      smallest: smallest.size, minRatio: MIN_SCALE_COVERAGE });

  return out;
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────

/**
 * Reads the candidate, runs the authoring preconditions on it, drives the FULL runtime pipeline,
 * and runs the acceptance gates on the pixels that come back out of the decoder.
 *
 * The pipeline module is imported dynamically. It depends on the cleanup tools, which import this
 * file for the shared orphan-soft definition, so a static import here would close a module cycle.
 * The dynamic import keeps the dependency one-directional at load time and costs nothing: this is
 * the only place that needs it, and it needs the vendored libwebp binaries anyway.
 */
export async function run(candidatePath, style) {
  const log = [];
  const say = (s) => { log.push(s); console.log(s); };
  say(`${TOOL} v${TOOL_VERSION} — READ-ONLY on the candidate; the pipeline writes only to build/`);

  if (!STYLE_TARGETS[style]) {
    throw new Error(`unknown style '${style}' — expected one of ${STYLES.join(", ")}`);
  }
  const abs = resolve(candidatePath);
  if (!existsSync(abs)) throw new Error(`candidate not found: ${abs}`);
  const png = decodePng(readFileSync(abs), "candidate");
  const authoring = analyse(png.rgba, png.w, png.h);

  const pre = authoringPreconditions(authoring);
  say(`  candidate ${candidatePath} · ${png.w}x${png.h} · style '${style}'`);
  say(`\n  AUTHORING PRECONDITIONS (${pre.length}) — measured on the ${png.w}x${png.h} source`);
  for (const g of pre) say(`    ${g.pass ? "✓" : "✖"} ${g.id} ${JSON.stringify(g.detail)}`);
  say(`    · authoring ink ${authoring.ink} px, envelope ` +
      (authoring.envelope ? `x ${u(authoring.envelope.xLo)}..${u(authoring.envelope.xHi)} y ${u(authoring.envelope.yLo)}..${u(authoring.envelope.yHi)}` : "(none)"));
  say(`    · authoring orphan-soft ${authoring.orphanSoft} (reported; the ${HALO_TOLERANCE_AUTHORING}-px budget is`);
  say(`      enforced by clean-r2-hair-alpha.mjs, which refuses to write a cleaned PNG above it)`);

  const { buildRuntimeAsset } = await import("./build-r2-hair-runtime-asset.mjs");
  const built = buildRuntimeAsset(png.rgba, png.w, png.h, { label: style });

  say(`\n  PIPELINE  authoring-cleanup → downscaleHalf → served-cleanup → cwebp → dwebp`);
  say(`    reference ${built.w}x${built.h}  sha ${built.referenceSha}`);
  say(`    webp      ${built.webp.length} bytes  sha ${built.webpSha}`);
  say(`    ${built.byteIdentical ? "✓" : "✖"} decoded-matches-reference-exactly — the encode is lossless and no pixel moved`);

  const runtime = runtimeGates(built.decodedRgba, built.w, built.h, style);
  say(`\n  RUNTIME ACCEPTANCE GATES (${runtime.length}) — measured on the decoded ${built.w}x${built.h} asset`);
  for (const g of runtime) say(`    ${g.pass ? "✓" : "✖"} ${g.id} ${JSON.stringify(g.detail)}`);

  const named = [...pre, ...runtime];
  const passedNamed = named.filter((g) => g.pass).length;
  const pass = named.every((g) => g.pass) && built.byteIdentical;

  say(`\n  ${passedNamed}/${named.length} named checks pass ` +
      `(${pre.length} authoring preconditions + ${runtime.length} runtime acceptance gates)`);
  say(`${pass ? "✓ CANDIDATE PASSES the measurable checks" : "✖ CANDIDATE FAILS"} — this is a PRECONDITION, not an approval.`);
  say("  Owner visual sign-off at real render scale (D-059) is still required, and this tool");
  say("  promotes nothing: registration is a separate, separately authorised step.");
  return { pass, preconditions: pre, runtimeGates: runtime, built, authoring, log };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [, , file, style] = process.argv;
  if (!file || !style) {
    console.error(`usage: node tools/avatar/check-r2-hair-candidate.mjs <candidate.png> <${STYLES.join("|")}>`);
    process.exit(2);
  }
  // NOT `await` at module top level. run() dynamically imports the pipeline, which reaches back to
  // THIS module through the cleanup tools. A top-level await keeps this module's evaluation
  // unfinished, the cycle can never complete, and the process exits on an unsettled promise having
  // printed only the preconditions. Deferring to the microtask queue lets evaluation finish first.
  run(file, style)
    .then((r) => process.exit(r.pass ? 0 : 1))
    .catch((err) => { console.error(String(err.message ?? err)); process.exit(1); });
}
