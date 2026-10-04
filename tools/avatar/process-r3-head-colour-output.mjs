// process-r3-head-colour-output — deterministic post-processing for a FUTURE colour-call output.
//
// The model's image is a colour PROPOSAL, never geometry. This module:
//   1  decodes the output and checks format (PNG, 1024x1536, 8-bit RGBA)
//   2  measures coverage of the head geometry per geometric region (crown, both head sides, both ears,
//      face plane, lower head) — every region must be fully covered (source alpha >= 128); a total
//      percentage alone is never accepted
//   3  runs D-148's classified pre-gate (pre.transition-uncovered, pre.transition-wider-inside-edit)
//   3a S1 palette gate: the median of the model's head (rows 300–416, K4 excluded) must lie within
//      ΔE00 4.50 of the Northstar skin median (spec toneContinuity.S1)
//   3b S2 tone continuity: head pixels of rows 417–424 are blended toward the measured H1 neck skin with
//      a fixed integer ramp, BEFORE K4 (spec toneContinuity.S2); parameters are pinned and verified
//   4  composes: FINAL_MODEL_RGB_REGION (= head geometry, rows ≤ 424) → K4 contour over the (S2) model RGB,
//      alpha 255; every other pixel of CORE₂ → alpha 0 — the API_CONTEXT_MARGIN is request-time only, so its
//      pixels are never copied from the output;
//      TRANSITION and PROTECT₂ → H1 RGBA byte-identical (the model never touches the neck or body)
//   5  runs every post-gate: join ≤ H1's own bound, protected bytes 0, transition alpha 0, residue /
//      ghost outside the geometry 0, asymmetric alpha 0, rows 425–445 byte-identical to H1, alpha in
//      rows ≤ 424 exactly the geometry
//   6  writeCandidate() writes ONLY when every binding gate passed
// It also reports — never gates on — a dark-pixel count in the geometry interior (beyond the K4
// band). That number is a prompt for VISUAL review, not a facial-feature detector: whether shading
// reads as a face can only be judged by eye.
//
// No network, no model, no claim. Nothing here can be fed back as an input to an image call.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { decodePng, encodePngRGBA } from "./build-r2-torso-occlusion-mask.mjs";
import { OUT_W, OUT_H, SOLID_ALPHA } from "./build-r3-head-edit-masks.mjs";
import { joinContinuity } from "./recompose-r3-head-edit.mjs";
import { transitionUncovered, verifyOutput } from "./recompose-r3-head-geometry.mjs";
import { HEAD_MAX_Y, K4 } from "./build-r3-head-geometry.mjs";
import { REGIONS, regionOf, lab, toLab, deltaE00, SEAM, northstarSkinStats, neckTarget } from "./build-r3-head-colour-fixtures.mjs";

const N = OUT_W * OUT_H;
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const yOf = (p) => (p / OUT_W) | 0;

export class ColourGateError extends Error {
  constructor(gate, message, report) { super(`colour gate FAILED [${gate}]: ${message}`); this.gate = gate; this.report = report; }
}

export function decodeOutput(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47) throw new ColourGateError("format", "not a PNG");
  if (buf.readUInt8(24) !== 8 || buf.readUInt8(25) !== 6) throw new ColourGateError("format", "not 8-bit RGBA");
  const img = decodePng(buf, "output");
  if (img.w !== OUT_W || img.h !== OUT_H) throw new ColourGateError("format", `expected ${OUT_W}x${OUT_H}, got ${img.w}x${img.h}`);
  return img.rgba;
}

export function regionCoverage(src, geom) {
  const r = Object.fromEntries(REGIONS.map((k) => [k, { px: 0, covered: 0 }]));
  for (let p = 0; p < N; p++) {
    if (!geom[p] || yOf(p) > HEAD_MAX_Y) continue;
    const s = r[regionOf(p % OUT_W, yOf(p))]; s.px++; if (src[p * 4 + 3] >= SOLID_ALPHA) s.covered++;
  }
  for (const s of Object.values(r)) s.uncovered = s.px - s.covered;
  return r;
}

/** Interior dark pixels (L* < 40) further than 6 px inside the head edge — a VISUAL-REVIEW prompt only. */
export function interiorDarkPx(out, geom) {
  let n = 0;
  for (let p = 0; p < N; p++) {
    if (!geom[p] || yOf(p) > HEAD_MAX_Y) continue;
    const x = p % OUT_W, y = yOf(p); let near = false;
    for (let dy = -6; dy <= 6 && !near; dy++) for (let dx = -6; dx <= 6; dx++) { const yy = y + dy; if (yy <= HEAD_MAX_Y && !geom[yy * OUT_W + x + dx]) { near = true; break; } }
    if (near) continue;
    if (lab([out[p * 4], out[p * 4 + 1], out[p * 4 + 2]]).L < 40) n++;
  }
  return n;
}

// The S2 parameters are pinned here independently of SEAM, so a drifted constant fails loudly.
export const S2_PIN = "417|424|9|253,197,128";
// S1 is pinned the same way: threshold | Northstar skin median | measured head rows.
export const S1_PIN = "4.5|254,197,128|300-416";
const s1Fingerprint = (s1) => `${s1.thresholdDE00}|${[...s1.expectedNsMedianRGB].join(",")}|${s1.headRows[0]}-${s1.headRows[1]}`;
/** The S1 decision on the UNROUNDED CIEDE2000 value: ΔE00 ≤ 4.50 passes, anything above fails. */
export function s1Passes(de00) { return Number.isFinite(de00) && de00 <= SEAM.S1.thresholdDE00; }
const s2Fingerprint = (s2) => `${s2.top}|${s2.bottom}|${s2.denominator}|${[...s2.neckTargetExpected].join(",")}`;

/** S1: median RGB of the model's head (rows 300–416, geometry, K4 excluded) vs the Northstar skin median. */
export function paletteCheck(src, geom, contour, nsMedianRGB) {
  const [r0, r1] = SEAM.S1.headRows, ch = [[], [], []];
  for (let y = r0; y <= r1; y++) for (let x = 0; x < OUT_W; x++) { const p = y * OUT_W + x; if (!geom[p] || contour[p]) continue; for (let k = 0; k < 3; k++) ch[k].push(src[p * 4 + k]); }
  if (!ch[0].length) throw new ColourGateError("s1.palette", "no head pixels to measure");
  const med = ch.map((a) => { const s = a.sort((p, q) => p - q); return s[s.length >> 1]; });
  const exact = deltaE00(toLab(med), toLab(nsMedianRGB));
  return { headMedianRGB: med, northstarMedianRGB: [...nsMedianRGB], de00: +exact.toFixed(2), de00Exact: exact, threshold: SEAM.S1.thresholdDE00, pass: s1Passes(exact) };
}

/** S2: returns a copy of src with head pixels of rows top–bottom blended toward the neck target (integer, round-half-up). */
export function applyS2(src, geom, target, s2 = SEAM.S2) {
  if (s2Fingerprint(s2) !== S2_PIN) throw new ColourGateError("s2.parameters", `S2 parameters ${s2Fingerprint(s2)} differ from the pinned ${S2_PIN}`);
  if (!Array.isArray(target) || target.length !== 3 || target.join(",") !== [...s2.neckTargetExpected].join(",")) throw new ColourGateError("s2.neck-target", `measured neck target ${JSON.stringify(target)} ≠ expected ${JSON.stringify([...s2.neckTargetExpected])}`);
  const o = Buffer.from(src), d = s2.denominator, half = d >> 1;
  for (let y = s2.top; y <= s2.bottom; y++) { const w = y - (s2.top - 1); for (let x = 0; x < OUT_W; x++) { const p = y * OUT_W + x; if (!geom[p]) continue; for (let k = 0; k < 3; k++) o[p * 4 + k] = Math.floor((w * target[k] + (d - w) * src[p * 4 + k] + half) / d); } }
  return o;
}

/** The whole post-processing. Throws ColourGateError on any binding failure; returns { rgba, report }. */
export function processOutput({ srcRgba, h1Rgba, geom, contour, regions, nsRgba, s2 = SEAM.S2 }) {
  if (!srcRgba || !h1Rgba || !nsRgba || srcRgba.length !== N * 4 || h1Rgba.length !== N * 4 || nsRgba.length !== N * 4) throw new ColourGateError("format", "buffers (output, H1, Northstar) do not match the canvas");
  const coverage = regionCoverage(srcRgba, geom);
  for (const [k, s] of Object.entries(coverage)) if (s.uncovered) throw new ColourGateError(`coverage.${k}`, `${s.uncovered} of ${s.px} geometry px in ${k} are not covered by the output`, { coverage });
  const tu = transitionUncovered(h1Rgba, srcRgba, regions.TRANSITION, regions.EDIT);
  if (tu.uncovered) throw new ColourGateError("pre.transition-uncovered", `${tu.uncovered} TRANSITION px solid in H1 are not covered by the output`, tu);
  if (tu.widerInsideEdit) throw new ColourGateError("pre.transition-wider-inside-edit", `${tu.widerInsideEdit} px`, tu);
  if (s1Fingerprint(SEAM.S1) !== S1_PIN) throw new ColourGateError("s1.parameters", `S1 parameters ${s1Fingerprint(SEAM.S1)} differ from the pinned ${S1_PIN}`);
  const ns = northstarSkinStats(nsRgba);
  if (!ns.medianRGB || ns.medianRGB.join(",") !== [...SEAM.S1.expectedNsMedianRGB].join(",")) throw new ColourGateError("s1.reference", `Northstar skin median ${JSON.stringify(ns.medianRGB)} drifted`, ns);
  const s1 = paletteCheck(srcRgba, geom, contour, ns.medianRGB);
  if (!s1.pass) throw new ColourGateError("s1.palette", `head palette ΔE00 ${s1.de00} > ${s1.threshold}`, s1);
  const target = neckTarget(h1Rgba, regions.TRANSITION);
  const model = applyS2(srcRgba, geom, target, s2);
  const out = Buffer.from(h1Rgba);
  for (let p = 0; p < N; p++) {
    if (!regions.EDIT[p] || regions.TRANSITION[p]) continue;                 // TRANSITION + PROTECT₂ = H1 bytes
    const i = p * 4;
    if (geom[p] && yOf(p) <= HEAD_MAX_Y) {
      const c = contour[p];
      for (let k = 0; k < 3; k++) out[i + k] = c ? Math.floor((c * K4.line[k] + (255 - c) * model[i + k] + 127) / 255) : model[i + k];
      out[i + 3] = 255;
    } else { out[i] = 0; out[i + 1] = 0; out[i + 2] = 0; out[i + 3] = 0; }
  }
  const jc = joinContinuity(h1Rgba, out);
  if (!jc.pass) throw new ColourGateError("pre.join-continuity", `${jc.observed} > ${jc.bound}`, jc);
  const post = verifyOutput({ outRgba: out, h1Rgba, geom, regions });
  let band = 0; for (let p = 425 * OUT_W; p < 446 * OUT_W; p++) for (let k = 0; k < 4; k++) if (out[p * 4 + k] !== h1Rgba[p * 4 + k]) band++;
  let alphaGeom = 0; for (let p = 0; p < (HEAD_MAX_Y + 1) * OUT_W; p++) if ((out[p * 4 + 3] === 255) !== (geom[p] === 1)) alphaGeom++;
  for (const [gate, v] of [["post.protected-bytes", post.protectedBytes], ["post.transition-alpha", post.transitionAlpha], ["post.residue-outside-geometry", post.residueOutsideGeometry],
    ["post.asymmetry", post.asymmetryPx], ["post.transition-bytes", band], ["post.alpha-equals-geometry", alphaGeom]])
    if (v) throw new ColourGateError(gate, `${v} (must be 0)`, { ...post, band, alphaGeom });
  return { rgba: out, report: { coverage, transition: tu, s1: { ...s1, pin: S1_PIN }, s2: { pin: S2_PIN, neckTarget: target }, join: jc, ...post, rows425to445BytesVsH1: band, alphaNotGeometry: alphaGeom,
    interiorDarkPxForVisualReview: interiorDarkPx(out, geom) } };
}

/** Writes the candidate ONLY after processOutput() succeeded. Refuses to overwrite. */
export function writeCandidate(result, outPath) {
  if (!result || !result.rgba || !result.report) throw new ColourGateError("write", "no passing result to write");
  if (existsSync(outPath)) throw new ColourGateError("write", "refusing to overwrite an existing file");
  const png = encodePngRGBA(OUT_W, OUT_H, result.rgba);
  writeFileSync(outPath, png);
  return sha256(png);
}
