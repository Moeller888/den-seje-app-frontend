// D-156 — OVERSCAN / BLEED geometry for a possible R3 head-colour request, and its deterministic clip back to E2.
// NO NETWORK, NO MODEL, NO CLAIM, NO CALL-ID. Nothing here can send, writes a file or builds a request package.
//
// Four sets, kept strictly apart (all in the 1024×1536 output canvas, rows 0–1535, x 0–1023):
//   FINAL  = E2's head geometry, rows ≤ 424 (FINAL_MODEL_RGB_REGION, 66,162 px). Final alpha and the only pixels whose
//            final RGB may come from the model. NEVER changed by this module.
//   BLEED  = pixels within Euclidean distance B of FINAL, outside it, in rows ≤ 424, and allowed by the existing
//            protection rules (not TRANSITION, not H1-visible outside EDIT₂). Painted by the model, then DISCARDED.
//   PAINT  = FINAL ∪ BLEED — the hypothetical area a model would be asked to colour (the API mask's editable set).
//   KEEP   = everything else: TRANSITION (rows 425–445), PROTECT₂, rows ≥ 425 and every pixel beyond the bleed. The
//            processor copies H1 there byte for byte; the model never owns it.
// The row-424 → 425 handover into H1's neck is NOT a silhouette edge (K4 does not contour it), and no bleed can cross it:
// rows ≥ 425 are protected. Those edge pixels are reported separately as "neck handover", never as bleed.
// Mask semantics are unchanged from D-149: alpha 0 = EDITABLE, alpha 255 = PROTECTED.
import { OUT_W, OUT_H } from "./build-r3-head-edit-masks.mjs";
import { HEAD_MAX_Y } from "./build-r3-head-geometry.mjs";
import { REGIONS, regionOf } from "./build-r3-head-colour-fixtures.mjs";

const W = OUT_W, N = OUT_W * OUT_H;
const yOf = (p) => (p / W) | 0;

export const OVERSCAN_RULE = Object.freeze({
  name: "d156-overscan",
  metric: "Euclidean distance to the nearest FINAL pixel",
  rows: "bleed only in rows <= " + HEAD_MAX_Y + " (rows >= 425 are TRANSITION / H1 neck / body: protected)",
  forbidden: "TRANSITION, H1-visible pixels outside EDIT₂, rows >= 425, outside the canvas",
  maskSemantics: "alpha 0 = EDITABLE, alpha 255 = PROTECTED (unchanged from D-149)",
});

/** The pixels no bleed may ever touch. */
export function forbiddenSet({ transition, edit }, h1Rgba) {
  const f = new Uint8Array(N);
  for (let p = 0; p < N; p++) if (yOf(p) > HEAD_MAX_Y || transition[p] || (h1Rgba[p * 4 + 3] > 0 && !edit[p])) f[p] = 1;
  return f;
}

/** OUTSIDE for distance purposes: rows ≤ 424 that are not FINAL. Rows ≥ 425 are neither inside nor outside. */
const isOutside = (head, p) => !head[p] && yOf(p) <= HEAD_MAX_Y;

/**
 * Signed Euclidean distance field around FINAL, plus the nearest boundary pixel of the other side:
 *   inside FINAL:  sd > 0 = distance to the nearest OUTSIDE pixel (rows ≤ 424);
 *   outside:       sd < 0 = −distance to the nearest FINAL pixel, computed up to `reach` px;
 *   elsewhere 0 (rows ≥ 425, or farther than `reach`). `foot` holds the nearest pixel index of the other side, −1 if none.
 */
export function signedDistance(head, reach = 64) {
  const inB = [], outB = [];
  for (let p = 0; p < N; p++) {
    const x = p % W, y = yOf(p); if (y > HEAD_MAX_Y) continue;
    const nb = [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < HEAD_MAX_Y ? p + W : -1];
    if (head[p] && nb.some((q) => q >= 0 && isOutside(head, q))) inB.push(p);
    if (isOutside(head, p) && nb.some((q) => q >= 0 && head[q])) outB.push(p);
  }
  const sd = new Float32Array(N), foot = new Int32Array(N).fill(-1);
  let x0 = W, y0 = OUT_H, x1 = 0, y1 = 0;
  for (const p of inB) { const x = p % W, y = yOf(p); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const bx = outB.map((p) => p % W), by = outB.map(yOf), ix = inB.map((p) => p % W), iy = inB.map(yOf);
  for (let y = Math.max(0, y0 - reach); y <= Math.min(HEAD_MAX_Y, y1 + reach); y++) for (let x = Math.max(0, x0 - reach); x <= Math.min(W - 1, x1 + reach); x++) {
    const p = y * W + x; let best = Infinity, arg = -1;
    if (head[p]) { for (let k = 0; k < outB.length; k++) { const d = (bx[k] - x) ** 2 + (by[k] - y) ** 2; if (d < best) { best = d; arg = outB[k]; } } sd[p] = Math.sqrt(best) - 0.5; }
    else { for (let k = 0; k < inB.length; k++) { const d = (ix[k] - x) ** 2 + (iy[k] - y) ** 2; if (d < best) { best = d; arg = inB[k]; } } if (Math.sqrt(best) > reach) continue; sd[p] = -(Math.sqrt(best) - 0.5); }
    foot[p] = arg;
  }
  return { sd, foot };
}

/** FINAL, BLEED, PAINT and the forbidden pixels the bleed would have reached without the protection rules. */
export function overscanSets(head, sdf, forbidden, B) {
  if (!Number.isInteger(B) || B < 0 || B > 63) throw new Error("bleed width must be an integer 0..63");
  const bleed = new Uint8Array(N), paint = new Uint8Array(N); let blocked = 0;
  for (let p = 0; p < N; p++) {
    if (head[p]) { paint[p] = 1; continue; }
    if (sdf.sd[p] < 0 && -sdf.sd[p] <= B) { if (forbidden[p]) { blocked++; continue; } bleed[p] = 1; paint[p] = 1; }
  }
  return { bleed, paint, blocked };
}

/**
 * Per E2 edge pixel and outward axis direction: how deep does PAINT reach (capped at B)? Directions into rows ≥ 425
 * are the neck handover and reported apart. Returns per-region counts; the ears are always separate regions.
 */
export function bleedReach(head, paint, B) {
  const reg = Object.fromEntries(REGIONS.map((r) => [r, { edges: 0, full: 0, minReach: B }]));
  let neckHandover = 0;
  for (let p = 0; p < N; p++) {
    if (!head[p]) continue; const x = p % W, y = yOf(p);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || xx >= W || yy < 0) continue;
      if (yy > HEAD_MAX_Y) { neckHandover++; continue; }
      if (head[yy * W + xx]) continue;
      let k = 0; while (k < B) { const ax = x + (k + 1) * dx, ay = y + (k + 1) * dy; if (ax < 0 || ax >= W || ay < 0 || ay > HEAD_MAX_Y || !paint[ay * W + ax]) break; k++; }
      const r = reg[regionOf(x, y)]; r.edges++; if (k === B) r.full++; r.minReach = Math.min(r.minReach, k);
    }
  }
  return { byRegion: reg, neckHandoverEdgePx: neckHandover };
}

/** Bleed pixels that fill a notch of the silhouette (FINAL pixels both above and below in the same column within B). */
export function notchFill(head, bleed, B) {
  const r = { left: 0, right: 0 };
  for (let p = 0; p < N; p++) {
    if (!bleed[p]) continue; const x = p % W, y = yOf(p); let up = false, down = false;
    for (let k = 1; k <= B && !(up && down); k++) { if (y - k >= 0 && head[(y - k) * W + x]) up = true; if (y + k <= HEAD_MAX_Y && head[(y + k) * W + x]) down = true; }
    if (up && down) r[x < W / 2 ? "left" : "right"]++;
  }
  return r;
}

/** Validates a PAINT set against the existing protection rules and against its own definition. */
export function validatePaint(paint, { head, forbidden, sdf, B }) {
  const problems = []; let forb = 0, missingHead = 0, beyond = 0;
  for (let p = 0; p < N; p++) {
    if (head[p] && !paint[p]) missingHead++;
    if (!paint[p] || head[p]) continue;
    if (forbidden[p]) forb++;
    if (!(sdf.sd[p] < 0 && -sdf.sd[p] <= B)) beyond++;
  }
  if (missingHead) problems.push(missingHead + " FINAL px are not editable");
  if (forb) problems.push(forb + " editable px are protected (TRANSITION, rows >= 425 or H1-visible outside EDIT₂)");
  if (beyond) problems.push(beyond + " editable px lie beyond the bleed width " + B);
  return { ok: problems.length === 0, problems };
}

/**
 * Deterministic diagnostic warp (SIMULATION ONLY): the model's own edge profile moved B px outward, fading to 0 at depth L.
 * A pixel at signed depth δ takes the source pixel at depth g(δ) along its inward normal:
 *   g(δ) = δ + B                  for δ ≤ 0      (bleed: the source edge lands B px outside E2)
 *   g(δ) = δ + B·(1 − δ/L)        for 0 < δ < L  (continuous, monotonic for B < L)
 *   g(δ) = δ                      for δ ≥ L      (interior unchanged)
 * Pixels in rows ≥ 425, or outside the bleed range, keep the source. It answers one question only: if a model kept its
 * observed shortfall relative to a silhouette B px larger, would E2 be covered? It is NOT a prediction of a model.
 */
export function warpOutward(src, sdf, B, { L = 60, shift = [0, 0] } = {}) {
  if (!(B < L)) throw new Error("the warp needs B < L");
  const out = Buffer.from(src);
  for (let p = 0; p < N; p++) {
    const y = yOf(p); if (y > HEAD_MAX_Y) continue;
    const d = sdf.sd[p], f = sdf.foot[p]; if (f < 0 || d >= L) continue;
    const x = p % W, fx = f % W, fy = yOf(f);
    let nx = d >= 0 ? x - fx : fx - x, ny = d >= 0 ? y - fy : fy - y; const len = Math.hypot(nx, ny) || 1; nx /= len; ny /= len;
    const g = d <= 0 ? d + B : d + B * (1 - d / L), step = g - d;
    const qx = Math.round(x + nx * step) - shift[0], qy = Math.round(y + ny * step) - shift[1];
    if (qx < 0 || qx >= W || qy < 0 || qy >= OUT_H) continue;
    src.copy(out, p * 4, (qy * W + qx) * 4, (qy * W + qx) * 4 + 4);
  }
  if (shift[0] || shift[1]) {
    // a uniform translation of the whole painted head (deep interior included) on top of the warp
    const t = Buffer.from(out);
    for (let p = 0; p < N; p++) { const y = yOf(p); if (y > HEAD_MAX_Y || sdf.foot[p] >= 0 && sdf.sd[p] < L) continue; const qx = (p % W) - shift[0], qy = y - shift[1]; if (qx < 0 || qx >= W || qy < 0 || qy > HEAD_MAX_Y) continue; out.set(t.subarray((qy * W + qx) * 4, (qy * W + qx) * 4 + 4), p * 4); }
  }
  return out;
}
