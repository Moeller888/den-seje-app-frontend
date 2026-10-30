// D-256 HYPOTHESIS (offline, not a method in use): can a FREE-STANDING generated garment be fitted to a fixed cut by ONE uniform
// scale and ONE translation, computed automatically from the two shapes? D-255's R1-1 came back as a product shot (the right
// garment, about twice the cut's size, elsewhere on the canvas); r1-v1 allows a translation only and rejected it. This module is a
// new hypothesis, not a change of r1-v1 or of D-255's pass rules.
//   geometry — measures of a garment mask: bounding box, area, centroid, the neck opening (gap at the top rows), shoulder line,
//              sleeve span and the row where the sleeves end, body width below them, hem;
//   fit      — s and (tx, ty) maximising the overlap (IoU) of the output's opaque mask with the cut's core: s from the square root
//              of the area ratio, searched ±15 %, coarse to fine; translation from the centroids, refined. Nothing per design;
//   apply    — the output resampled by that similarity (area-averaged, premultiplied alpha): no warp, no new pixels beyond the
//              resampling average, no repair mask. The cut's own alpha and contour are applied only by r1-v1's compose, afterwards.
// Everything is measured BEFORE any cropping: what the fitted garment leaves uncovered of the core, and what lies outside the cut.
import * as WR from "./northstar-wardrobe.mjs";

const { W, N } = WR, H = N / W;
export const REVISION = "s1-hypothesis";
export const RULE = Object.freeze({
  transform: "x' = s·x + tx, y' = s·y + ty (one uniform scale, one translation; no rotation, shear, warp or per-region freedom)",
  scale: "s0 = sqrt(area(core) / area(output opaque)); s searched in [0.85·s0, 1.15·s0]",
  objective: "maximise IoU(output opaque mask after the transform, cut core); coarse at 1/4 resolution, then refined at full resolution",
  translation: "start: the centroids aligned; refined ±8 px coarse, ±3 px fine",
  resampling: "area-averaged over the source footprint (3×3 samples per target pixel), premultiplied alpha",
  manual: "none: no coordinates, scale or offset chosen per design",
});

export const maskOf = (P, thr = 128) => { const m = new Uint8Array(N); for (let i = 0; i < N; i++) if (P[i * 4 + 3] >= thr) m[i] = 1; return m; };


/** Measures of a garment mask (top-like shapes): all in px of the canvas. */
export function geometry(m) {
  let x0 = W, x1 = -1, y0 = H, y1 = -1, area = 0, sx = 0, sy = 0; const rowW = new Int32Array(H), rowL = new Int32Array(H).fill(-1), rowR = new Int32Array(H).fill(-1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m[y * W + x]) { area++; sx += x; sy += y; rowW[y]++; if (rowL[y] < 0) rowL[y] = x; rowR[y] = x; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (!area) return null;
  const h = y1 - y0 + 1, cx = (x0 + x1) / 2;
  // the neck: the deepest row below the top where the centre column is still open (inside the span)
  let neckBottom = y0; for (let y = y0; y < y0 + h * 0.4; y++) { const c = Math.round(cx); if (rowL[y] >= 0 && rowL[y] < c && rowR[y] > c && !m[y * W + c]) neckBottom = y; }
  const gapAt = (y) => { const c = Math.round(cx); let l = c, r = c; if (m[y * W + c]) return 0; while (l > x0 && !m[y * W + l]) l--; while (r < x1 && !m[y * W + r]) r++; return r - l - 1; };
  const neckTopWidth = gapAt(y0 + 2);
  // the sleeves end where the row's span drops sharply below the widest rows; the body width is measured just below
  let maxSpan = 0, maxRow = y0; for (let y = y0; y <= y1; y++) { const s = rowR[y] - rowL[y] + 1; if (rowL[y] >= 0 && s > maxSpan) { maxSpan = s; maxRow = y; } }
  let sleeveEnd = maxRow; for (let y = maxRow; y <= y1; y++) { const s = rowR[y] - rowL[y] + 1; if (rowL[y] >= 0 && s < 0.82 * maxSpan) { sleeveEnd = y; break; } }
  const bodyAt = (y) => (rowL[y] >= 0 ? rowR[y] - rowL[y] + 1 : 0);
  const shoulderRow = Math.min(y1, neckBottom + Math.round(0.04 * h));
  return { bbox: [x0, y0, x1, y1], width: x1 - x0 + 1, height: h, area, centroid: [sx / area, sy / area],
    neck: { topWidth: neckTopWidth, depth: neckBottom - y0 }, shoulderSpan: bodyAt(shoulderRow), sleeveSpan: maxSpan, sleeveSpanRow: maxRow - y0, sleeveEndRow: sleeveEnd - y0,
    bodyWidthBelowSleeves: bodyAt(Math.min(y1, sleeveEnd + 6)), hemWidth: bodyAt(y1 - 3) };
}

/** Every measure divided by the height (shape only, size removed). */
export function normalised(g) { const k = g.height; return { aspect: +(g.width / k).toFixed(4), neckTop: +(g.neck.topWidth / k).toFixed(4), neckDepth: +(g.neck.depth / k).toFixed(4), shoulder: +(g.shoulderSpan / k).toFixed(4),
  sleeveSpan: +(g.sleeveSpan / k).toFixed(4), sleeveEnd: +(g.sleeveEndRow / k).toFixed(4), body: +(g.bodyWidthBelowSleeves / k).toFixed(4), hem: +(g.hemWidth / k).toFixed(4) }; }

/** The uniform similarity mapping the output's opaque mask onto the core (see RULE). */
export function fit(outMask, core) {
  const area = (m) => { let n = 0; for (let i = 0; i < N; i++) if (m[i]) n++; return n; }, cen = (m) => { let x = 0, y = 0, n = 0; for (let i = 0; i < N; i++) if (m[i]) { x += i % W; y += (i / W) | 0; n++; } return [x / n, y / n]; };
  const aO = area(outMask), aT = area(core), s0 = Math.sqrt(aT / aO), [ox, oy] = cen(outMask), [cx, cy] = cen(core);
  const tpx = []; for (let i = 0; i < N; i++) if (core[i]) tpx.push(i);
  // IoU of the transformed output with the core: the output pixel under each target pixel (inverse map), counted over the core
  // and over the output's own transformed area (aO·s²)
  const iou = (s, tx, ty, step) => { let inter = 0, n = 0; for (let k = 0; k < tpx.length; k += step) { n++; const i = tpx[k], x = Math.round(((i % W) - tx) / s), y = Math.round((((i / W) | 0) - ty) / s); if (x >= 0 && x < W && y >= 0 && y < H && outMask[y * W + x]) inter++; }
    const I = (inter / n) * tpx.length; return I / (tpx.length + aO * s * s - I); };
  let best = { s: s0, tx: cx - s0 * ox, ty: cy - s0 * oy, iou: -1 };
  for (let s = 0.85 * s0; s <= 1.15 * s0 + 1e-9; s += 0.01 * s0) { const bx = cx - s * ox, by = cy - s * oy;
    for (let dy = -8; dy <= 8; dy += 2) for (let dx = -8; dx <= 8; dx += 2) { const v = iou(s, bx + dx, by + dy, 9); if (v > best.iou) best = { s, tx: bx + dx, ty: by + dy, iou: v }; } }
  const c = best; best = { ...c, iou: -1 };
  for (let s = c.s - 0.01 * s0; s <= c.s + 0.01 * s0 + 1e-9; s += 0.0025 * s0) for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const v = iou(s, c.tx + dx, c.ty + dy, 1); if (v > best.iou) best = { s, tx: c.tx + dx, ty: c.ty + dy, iou: v }; }
  // ambiguity: how flat the optimum is (the IoU at the neighbouring scales)
  const near = [-0.02, 0.02].map((d) => +iou(best.s + d * s0, best.tx, best.ty, 1).toFixed(4));
  return { s: +best.s.toFixed(5), tx: +best.tx.toFixed(2), ty: +best.ty.toFixed(2), iou: +best.iou.toFixed(4), s0: +s0.toFixed(5), iouAtScaleMinus2pct: near[0], iouAtScalePlus2pct: near[1], outputArea: aO, coreArea: aT };
}

/** The output resampled by the similarity: area-averaged (3×3 samples over the source footprint), premultiplied alpha. */
export function apply(out, { s, tx, ty }) {
  const o = new Uint8ClampedArray(N * 4), foot = 1 / s, offs = [-1 / 3, 0, 1 / 3];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx = (x + 0.5 - tx) / s - 0.5, sy = (y + 0.5 - ty) / s - 0.5; if (sx < -foot || sy < -foot || sx > W + foot || sy > H + foot) continue;
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (const oy of offs) for (const ox of offs) { const px = Math.round(sx + ox * foot), py = Math.round(sy + oy * foot); n++; if (px < 0 || px >= W || py < 0 || py >= H) continue; const j = (py * W + px) * 4, al = out[j + 3] / 255; r += out[j] * al; g += out[j + 1] * al; b += out[j + 2] * al; a += al; }
    if (a <= 0) continue; const i = (y * W + x) * 4; o[i] = Math.round(r / a); o[i + 1] = Math.round(g / a); o[i + 2] = Math.round(b / a); o[i + 3] = Math.round((255 * a) / n); }
  return o;
}

/** Before any cropping: what of the core the fitted garment leaves uncovered, and what lies outside the cut (in px). */
export function beforeCrop(fitted, t) {
  let missing = 0, outside = 0, partial = 0; const missingM = new Uint8Array(N), outsideM = new Uint8Array(N);
  for (let i = 0; i < N; i++) { const a = fitted[i * 4 + 3]; if (t.core[i] && a < 128) { missing++; missingM[i] = 1; } else if (t.core[i] && a < 250) partial++; if (!t.alpha[i] && a >= 128) { outside++; outsideM[i] = 1; } }
  return { missingCorePx: missing, missingShare: +(missing / t.corePx).toFixed(4), outsidePx: outside, outsideShare: +(outside / t.corePx).toFixed(4), partialCorePx: partial, masks: { missing: missingM, outside: outsideM } };
}
