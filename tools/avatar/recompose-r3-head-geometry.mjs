// recompose-r3-head-geometry — D-148.
//
// Recomposition for the deterministic R3 head geometry (G1V3 + E2 + K4) with the P2 regions.
// It composes; it never generates. No image call, no model, no network, no claim.
//
// Contract (differs from D-133 in ONE respect: the geometry decides alpha, not the source):
//   CORE₂ ∩ GEOM   -> alpha 255; RGB = K4 contour over the source RGB
//   CORE₂ \ GEOM   -> alpha 0 (the old head and its semi-transparent rim are removed)
//   TRANSITION     -> alpha = H1 byte-identical; RGB = D-133's integer ramp (imported, unchanged)
//   PROTECT₂       -> H1 RGBA byte-identical
//
// Gates. Every failure refuses the output; nothing is written.
//   PRE  pre.transition-uncovered : pixels in TRANSITION that H1 declares solid but the source does
//        NOT cover. Each one would put the colour of a non-solid source pixel into a visible H1
//        neck pixel (the D-139/D-143 "double chin"). Must be exactly 0.
//        Source pixels that are solid where H1 is not solid (the source is WIDER) are classified, not
//        tolerated: they are only ignored if every one of them lies outside EDIT₂ — PROTECT₂ is H1 by
//        construction, so such a pixel can never reach the output. A wider pixel inside EDIT₂ fails as
//        pre.transition-wider-inside-edit. No numeric tolerance exists.
//   PRE  pre.core-uncovered       : geometry pixels the source does not cover (no colour to use). 0.
//   PRE  pre.join-continuity      : D-141's handover rule, measured on the geometry (unchanged rule).
//   POST post.protected-bytes     : 0 differing RGBA bytes inside PROTECT₂
//   POST post.transition-alpha    : 0 alpha changes inside TRANSITION
//   POST post.residue-outside-geometry : 0 pixels with alpha > 0 in rows <= 424 outside GEOM
//        (no ghost arc, no H1 rest along the new edge, no parallel jaw/neck arc)
//   POST post.asymmetry           : 0 asymmetric alpha pixels in rows <= 424
//
// The historical D-133 gate pre.transition-silhouette (whole rows 425–445, both directions) is left
// unchanged in recompose-r3-head-edit.mjs so the D-140/D-147 numbers (644 / 210) stay reproducible.
import { OUT_W, OUT_H, SOLID_ALPHA } from "./build-r3-head-edit-masks.mjs";
import { generatedWeightNumerator, blendChannel, joinContinuity, RAMP } from "./recompose-r3-head-edit.mjs";

export const TOOL = "recompose-r3-head-geometry";
export const TOOL_VERSION = "1.0.0";
export const DECISION = "D-148";
const N = OUT_W * OUT_H, HEAD_MAX_Y = 424;
const yOf = (p) => (p / OUT_W) | 0;
const solid = (rgba, p) => rgba[p * 4 + 3] >= SOLID_ALPHA;

export class GateError extends Error {
  constructor(gate, message, report) { super(`hard gate FAILED [${gate}]: ${message}`); this.gate = gate; this.report = report; }
}

/**
 * The classified transition gate. Returns the three classes separately:
 *   uncovered        — TRANSITION ∧ solid(H1) ∧ ¬solid(src)         (the defect; must be 0)
 *   widerInsideEdit  — rows 425–445 ∧ ¬solid(H1) ∧ solid(src) ∧ EDIT (must be 0)
 *   widerOutsideEdit — rows 425–445 ∧ ¬solid(H1) ∧ solid(src) ∧ ¬EDIT (provably discarded; reported)
 */
export function transitionUncovered(h1Rgba, srcRgba, transition, edit, yTop = RAMP.yTop, yBot = RAMP.yBot) {
  let uncovered = 0, widerInsideEdit = 0, widerOutsideEdit = 0; const sample = [];
  for (let y = yTop; y <= yBot; y++) for (let x = 0; x < OUT_W; x++) {
    const p = y * OUT_W + x, a = solid(h1Rgba, p), b = solid(srcRgba, p);
    if (transition[p] && a && !b) { uncovered++; if (sample.length < 8) sample.push([x, y]); }
    if (!a && b) { if (edit[p]) widerInsideEdit++; else widerOutsideEdit++; }
  }
  return { uncovered, widerInsideEdit, widerOutsideEdit, sample };
}
export function coreUncovered(srcRgba, geom) {
  let n = 0; for (let p = 0; p < N; p++) if (geom[p] && yOf(p) <= HEAD_MAX_Y && !solid(srcRgba, p)) n++;
  return n;
}

const kOver = (c, line, rgb) => [0, 1, 2].map((i) => Math.floor((c * line[i] + (255 - c) * rgb[i] + 127) / 255));

/** Post-gates on ANY output (written by this tool or not). */
export function verifyOutput({ outRgba, h1Rgba, geom, regions }) {
  let protectedBytes = 0, transitionAlpha = 0, residue = 0, asym = 0;
  for (let p = 0; p < N; p++) {
    const i = p * 4, y = yOf(p);
    if (regions.PROTECT[p]) for (let k = 0; k < 4; k++) if (outRgba[i + k] !== h1Rgba[i + k]) protectedBytes++;
    if (regions.TRANSITION[p] && outRgba[i + 3] !== h1Rgba[i + 3]) transitionAlpha++;
    if (y <= HEAD_MAX_Y) {
      if (!geom[p] && outRgba[i + 3] > 0) residue++;
      const q = y * OUT_W + (OUT_W - 1 - (p % OUT_W));
      if (outRgba[i + 3] !== outRgba[q * 4 + 3]) asym++;
    }
  }
  return { protectedBytes, transitionAlpha, residueOutsideGeometry: residue, asymmetryPx: asym };
}

/** The full v2 recomposition for a future colour source. Throws GateError on any failure. */
export function recomposeGeometry({ h1Rgba, srcRgba, geom, contour, regions, line }) {
  if (h1Rgba.length !== N * 4 || srcRgba.length !== N * 4) throw new GateError("input", "buffers do not match the 1024x1536 canvas");
  const tu = transitionUncovered(h1Rgba, srcRgba, regions.TRANSITION, regions.EDIT);
  if (tu.uncovered) throw new GateError("pre.transition-uncovered",
    `${tu.uncovered} pixel(s) inside TRANSITION are solid in H1 but not covered by the source; first: ${JSON.stringify(tu.sample)}`, tu);
  if (tu.widerInsideEdit) throw new GateError("pre.transition-wider-inside-edit",
    `${tu.widerInsideEdit} source pixel(s) are solid outside H1's transition silhouette but inside EDIT`, tu);
  const cu = coreUncovered(srcRgba, geom);
  if (cu) throw new GateError("pre.core-uncovered", `${cu} geometry pixel(s) are not covered by the source`, { coreUncovered: cu });
  const out = composeCore({ h1Rgba, geom, contour, regions, line, rgbAt: (p) => [srcRgba[p * 4], srcRgba[p * 4 + 1], srcRgba[p * 4 + 2]] });
  for (let p = 0; p < N; p++) if (regions.TRANSITION[p]) {
    const i = p * 4, num = generatedWeightNumerator(yOf(p));
    for (let k = 0; k < 3; k++) out[i + k] = blendChannel(srcRgba[i + k], h1Rgba[i + k], num);
    out[i + 3] = h1Rgba[i + 3];
  }
  const jc = joinContinuity(h1Rgba, out);
  if (!jc.pass) throw new GateError("pre.join-continuity", `${jc.observed} px across y424/y425, above H1's own ${jc.bound}`, jc);
  const post = verifyOutput({ outRgba: out, h1Rgba, geom, regions });
  for (const [gate, v] of [["post.protected-bytes", post.protectedBytes], ["post.transition-alpha", post.transitionAlpha],
    ["post.residue-outside-geometry", post.residueOutsideGeometry], ["post.asymmetry", post.asymmetryPx]])
    if (v) throw new GateError(gate, `${v} (must be 0)`, post);
  return { rgba: out, report: { transition: tu, coreUncovered: cu, join: jc, ...post } };
}

function composeCore({ h1Rgba, geom, contour, regions, line, rgbAt }) {
  const out = Buffer.from(h1Rgba);
  for (let p = 0; p < N; p++) {
    if (!regions.CORE[p]) continue;
    const i = p * 4;
    if (geom[p] && yOf(p) <= HEAD_MAX_Y) {
      const rgb = rgbAt(p), c = contour[p], col = c ? kOver(c, line, rgb) : rgb;
      out[i] = col[0]; out[i + 1] = col[1]; out[i + 2] = col[2]; out[i + 3] = 255;
    } else { out[i] = 0; out[i + 1] = 0; out[i + 2] = 0; out[i + 3] = 0; }
  }
  return out;
}

/** The canonical geometry candidate: flat review stand-in skin, no source; rows >= 425 stay H1. */
export function composeGeometryCandidate({ h1Rgba, geom, contour, regions, skin, line }) {
  return composeCore({ h1Rgba, geom, contour, regions, line, rgbAt: () => skin });
}

/** Every binding gate for the canonical candidate, plus the locked-geometry facts. */
export function candidateGates({ h1Rgba, outRgba, geom, regions, G1V3 }) {
  const tu = transitionUncovered(h1Rgba, outRgba, regions.TRANSITION, regions.EDIT);
  const jc = joinContinuity(h1Rgba, outRgba);
  const post = verifyOutput({ outRgba, h1Rgba, geom, regions });
  let rows425to445Bytes = 0; for (let p = 425 * OUT_W; p < 446 * OUT_W; p++) for (let k = 0; k < 4; k++) if (outRgba[p * 4 + k] !== h1Rgba[p * 4 + k]) rows425to445Bytes++;
  let lockedGeomPx = 0; for (let p = 0; p < N; p++) { const y = yOf(p); if (((y >= 309 && y <= 373) || (y >= 390 && y <= HEAD_MAX_Y)) && geom[p] !== G1V3[p]) lockedGeomPx++; }
  const g = {
    preTransitionUncovered: tu.uncovered, preTransitionWiderInsideEdit: tu.widerInsideEdit, widerOutsideEditDiscarded: tu.widerOutsideEdit,
    join: { observed: jc.observed, bound: jc.bound, pass: jc.pass },
    ghostResidueOutsideGeometry: post.residueOutsideGeometry, protectedBytes: post.protectedBytes, transitionAlphaChanges: post.transitionAlpha,
    asymmetryPx: post.asymmetryPx, rows425to445BytesVsH1: rows425to445Bytes, lockedGeometryRowsChangedPx: lockedGeomPx,
  };
  g.allPass = !g.preTransitionUncovered && !g.preTransitionWiderInsideEdit && g.join.pass && !g.ghostResidueOutsideGeometry && !g.protectedBytes &&
    !g.transitionAlphaChanges && !g.asymmetryPx && !g.rows425to445BytesVsH1 && !g.lockedGeometryRowsChangedPx;
  return g;
}
