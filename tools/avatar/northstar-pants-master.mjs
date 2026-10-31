// D-276 PROTOTYPE — THE MASTER METHOD ON ONE TROUSERS CUT (offline; no image call; not the production method). D-264's tee master,
// carried over to the trousers-square cut (R1's bottom template, bottom-trousers-square-olive). ONE-TIME data per cut, never per design:
//   panels      — the waistband (a band of SPEC.waistBand px under the cut's top edge) and the two legs, split by the CENTRE SEAM:
//                 a straight line from the waist centre to the crotch point (the item draws no centre seam, so it is entered once by
//                 hand and never refined — the darkest-pixel refinement of the tee's armhole seams would snag on the crotch fold);
//   contour     — the cut's own outer ink (absolute), as on the tee;
//   shading     — the item's luminance against its fabric base as one multiplicative ratio (the tee's rule): the crotch and knee fold
//                 strokes, the side shadows, the dark waistband rim and the hem stitch are carried onto any material;
//   mapping     — the waistband planar; each leg along its OWN axis (PCA of the leg panel), both legs from ONE origin, the crotch
//                 point: a rotation per leg, never a reflection (no mirror axis), and the two legs' phases meet at the crotch;
//   displacement— the tee's fold displacement (the gradient of the softened shading, at most foldMaxPx) plus a gentle cylinder per
//                 leg ROW (the leg tapers, so the row's own half-width is used instead of the tee's whole-panel width).
// Rendered with the tee master's own render (northstar-tee-master.mjs, unchanged and hash-locked by D-267/D-270): it maps panel 0
// planar and panels 1 and 2 along their axes, multiplies the shading ratio and lays the contour on top; the pants layer is its full
// layer (the tee's split by C's arms is a top's sleeve rule and does not apply to a bottom).
import * as WR from "./northstar-wardrobe.mjs";
import * as S1 from "./northstar-r1-similarity.mjs";
import * as TM from "./northstar-tee-master.mjs";

const { W, N } = WR, H = N / W;
export const REVISION = "pants-master-v1";
/** The one-time per-cut data (entered by hand once from the cut's own drawing; never per design). */
export const SPEC = Object.freeze({
  cut: "trousers-square", source: "bottom-trousers-square-olive",
  center: Object.freeze([[511, 740], [511, 893]]),   // the waist centre (above the top edge) → the crotch point (the legs part at row 896)
  crotch: Object.freeze([511, 893]),
  waistBand: 6,                                         // the dark rim under the top edge measures 4 px; the band is the rim + 2 px
  hemStitch: 17,                                        // the drawn hem stitch, px above each leg's bottom edge (carried by the shading, measured)
  warp: Object.freeze({ cylinder: 0.10, foldMaxPx: 3, foldBlur: 14 }),
});
/** D-279: the successor (v1 above stays as D-276 recorded it). Two general construction rules, the same for every material:
 *   waistTopSpan — the waistband is taken only under the cut's TOP edge (columns whose top lies within waistTopSpan px of the cut's
 *                  top; the waist edge measures 34 px of slope), so the band no longer follows the legs' outer flare (v1: 213 px);
 *   outerEdgeInk — the cut's outer edge is the outline's ink: the outline's own partial edge pixels take the outline's colour (v1 mixed
 *                  the fabric in under them), and the partial fabric pixels just outside the outline (an empty neighbour, within 2 px
 *                  of a solid outline pixel) take the nearest outline colour. Colour only: the alpha — the geometry — is untouched. */
export const SPEC_V2 = Object.freeze({ ...SPEC, revision: "pants-master-v2", waistTopSpan: 40, outerEdgeInk: true });
const lumOf = (P, i) => 0.299 * P[i * 4] + 0.587 * P[i * 4 + 1] + 0.114 * P[i * 4 + 2];

/** The outer-edge pixels and their outline colour (v2's outerEdgeInk), from the cut alone. */
export function outerEdge(t) {
  const idx = [], rgb = [];
  for (let i = 0; i < N; i++) { const a = t.alpha[i]; if (!a || a >= 255) continue; const ca = t.contour[i * 4 + 3], x = i % W, y = (i / W) | 0;
    if (ca > 0 && ca === a) { idx.push(i); rgb.push(t.contour[i * 4], t.contour[i * 4 + 1], t.contour[i * 4 + 2]); continue; } if (ca > 0) continue;
    let ext = false; for (let dy = -1; dy <= 1 && !ext; dy++) for (let dx = -1; dx <= 1; dx++) { const j = (y + dy) * W + x + dx; if (j < 0 || j >= N || !t.alpha[j]) { ext = true; break; } } if (!ext) continue;
    let best = -1, bd = 9; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const j = (y + dy) * W + x + dx, d = Math.max(Math.abs(dx), Math.abs(dy)); if (j >= 0 && j < N && t.contour[j * 4 + 3] >= 128 && d < bd) { bd = d; best = j; } }
    if (best >= 0) { idx.push(i); rgb.push(t.contour[best * 4], t.contour[best * 4 + 1], t.contour[best * 4 + 2]); } }
  return { idx: Int32Array.from(idx), rgb: Uint8ClampedArray.from(rgb) };
}
const union = (layers) => { const u = new Uint8ClampedArray(N * 4); for (const L of Object.values(layers)) for (let i = 0; i < N; i++) if (L[i * 4 + 3]) u.set(L.subarray(i * 4, i * 4 + 4), i * 4); return u; };

/** The master for the cut. t: the cut (R1 template), src: its item. */
export function buildPantsMaster(t, src, spec = SPEC) {
  const item = union(src.layers), core = t.core;
  // the centre seam: the hand-entered line (search 0: never refined), extended until it leaves the core at both ends, 2 px wide
  const line = TM.seamLine(item, core, spec.center, { search: 0, extend: 0 }), barrier = new Uint8Array(N);
  for (const [x, y] of line) for (const d of [0, 1]) { const i = y * W + x + d; if (i >= 0 && i < N) barrier[i] = 1; }
  // the waistband: within waistBand px under the column's top edge
  const g0 = S1.geometry(core), waistLimit = spec.waistTopSpan ? g0.bbox[1] + spec.waistTopSpan : Infinity;
  const waist = new Uint8Array(N); for (let x = 0; x < W; x++) { let top = -1; for (let y = 0; y < H; y++) if (core[y * W + x]) { top = y; break; } if (top < 0 || top > waistLimit) continue; for (let y = top; y < top + spec.waistBand && y < H; y++) if (core[y * W + x]) waist[y * W + x] = 1; }
  // the legs: the components of the core minus the barrier and the waistband; left and right by the crotch point
  const comp = new Int32Array(N).fill(-1), sizes = [], cx = [];
  for (let s = 0; s < N; s++) { if (!core[s] || barrier[s] || waist[s] || comp[s] >= 0) continue; const id = sizes.length, q = [s]; comp[s] = id; let n = 0, sx = 0;
    while (q.length) { const i = q.pop(), x = i % W; n++; sx += x; for (const j of [i - 1, i + 1, i - W, i + W]) { if (j < 0 || j >= N || Math.abs((j % W) - x) > 1 || !core[j] || barrier[j] || waist[j] || comp[j] >= 0) continue; comp[j] = id; q.push(j); } } sizes.push(n); cx.push(sx / n); }
  const big = sizes.map((n, k) => [n, k]).sort((a, b) => b[0] - a[0]).slice(0, 2).map(([, k]) => k);
  if (big.length < 2) throw new Error("the centre seam does not split the cut into two legs");
  const [L, R] = cx[big[0]] < cx[big[1]] ? big : [big[1], big[0]], panel = new Int8Array(N).fill(-1);
  for (let i = 0; i < N; i++) { if (!core[i]) continue; if (waist[i]) panel[i] = 0; else if (comp[i] === L) panel[i] = 1; else if (comp[i] === R) panel[i] = 2; }
  // the seam pixels and any fragment join the leg on their side of the crotch point
  for (let i = 0; i < N; i++) if (core[i] && panel[i] < 0) panel[i] = (i % W) <= spec.crotch[0] ? 1 : 2;
  // the shading ratio against the legs' fabric base (the tee's rule)
  const v = []; for (let i = 0; i < N; i++) if (panel[i] > 0 && !t.contour[i * 4 + 3]) v.push(lumOf(item, i)); v.sort((a, b) => a - b); const base = v[Math.floor(v.length * 0.6)] || 1;
  const ratio = new Float32Array(N); for (let i = 0; i < N; i++) if (t.alpha[i]) ratio[i] = item[i * 4 + 3] ? Math.min(1.12, Math.max(0.25, lumOf(item, i) / base)) : 1;
  // the fold displacement (the tee's: the gradient of the shading softened over foldBlur px, scaled to at most foldMaxPx)
  const r = spec.warp.foldBlur, src0 = new Float32Array(N); for (let i = 0; i < N; i++) src0[i] = core[i] && !t.contour[i * 4 + 3] ? Math.min(1, ratio[i]) : 1;
  const I = new Float64Array((W + 1) * (H + 1)), C = new Float64Array((W + 1) * (H + 1)); for (let y = 0; y < H; y++) { let rs = 0, rc = 0; for (let x = 0; x < W; x++) { const i = y * W + x, ok = core[i] ? 1 : 0; rs += src0[i] * ok; rc += ok; const k = (y + 1) * (W + 1) + x + 1; I[k] = I[k - W - 1] + rs; C[k] = C[k - W - 1] + rc; } }
  const box = (A, x0, y0, x1, y1) => A[y1 * (W + 1) + x1] - A[y0 * (W + 1) + x1] - A[y1 * (W + 1) + x0] + A[y0 * (W + 1) + x0];
  const soft = new Float32Array(N); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (!core[i]) continue; const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r), x1 = Math.min(W, x + r + 1), y1 = Math.min(H, y + r + 1), c = box(C, x0, y0, x1, y1); soft[i] = c ? box(I, x0, y0, x1, y1) / c : 1; }
  const gxy = new Float32Array(N * 2); let gmax = 1e-6; for (let i = 4 * W; i < N - 4 * W; i++) { if (!core[i]) continue; const a = core[i - 4] ? soft[i - 4] : soft[i], b = core[i + 4] ? soft[i + 4] : soft[i], c2 = core[i - 4 * W] ? soft[i - 4 * W] : soft[i], d = core[i + 4 * W] ? soft[i + 4 * W] : soft[i];
    gxy[i * 2] = (b - a) / 8; gxy[i * 2 + 1] = (d - c2) / 8; gmax = Math.max(gmax, Math.hypot(gxy[i * 2], gxy[i * 2 + 1])); }
  // the cylinder per leg ROW (the row's own span of that panel), the waistband flat
  const disp = new Float32Array(N * 2);
  for (let y = 0; y < H; y++) for (const p of [1, 2]) { let x0 = W, x1 = -1; for (let x = 0; x < W; x++) if (panel[y * W + x] === p) { if (x < x0) x0 = x; x1 = x; } if (x1 < 0) continue; const c = (x0 + x1) / 2, hw = Math.max(1, (x1 - x0) / 2);
    for (let x = x0; x <= x1; x++) { const i = y * W + x; if (panel[i] !== p) continue; const u = (x - c) / hw; disp[i * 2 + 1] = spec.warp.cylinder * hw * (1 - Math.cos(Math.min(1, Math.abs(u)) * Math.PI / 2)) * 0.5; } }
  for (let i = 0; i < N; i++) { if (panel[i] < 0) continue; disp[i * 2] += (spec.warp.foldMaxPx * gxy[i * 2]) / gmax; disp[i * 2 + 1] += (spec.warp.foldMaxPx * gxy[i * 2 + 1]) / gmax; }
  // each leg's axis (PCA of the leg panel), both from the crotch point
  const axes = [1, 2].map((k) => { let n = 0, sx = 0, sy = 0, xx = 0, yy = 0, xy = 0; for (let i = 0; i < N; i++) if (panel[i] === k) { const x = i % W, y = (i / W) | 0; n++; sx += x; sy += y; xx += x * x; yy += y * y; xy += x * y; }
    // an axis has no sign: normalised into [0, π) so that both legs point the same way (a PCA angle of −87° and one of +87° are
    // nearly the same line, but read raw they would turn one leg's material by 180°)
    const mx = sx / n, my = sy / n, raw = 0.5 * Math.atan2(2 * (xy / n - mx * my), xx / n - mx * mx - (yy / n - my * my)), angle = ((raw % Math.PI) + Math.PI) % Math.PI;
    return { angle, origin: [spec.crotch[0], spec.crotch[1]], px: n }; });
  const count = (k) => { let n = 0; for (let i = 0; i < N; i++) if (panel[i] === k) n++; return n; };
  return { revision: spec.revision || REVISION, spec, seam: line, panel, ratio, disp, axes, base, waist, edge: spec.outerEdgeInk ? outerEdge(t) : null, sizes: { waistband: count(0), left: count(1), right: count(2) } };
}

/** The material's coordinates at every pixel, exactly as TM.render computes them (for the continuity and orientation checks). */
export function mapping(master, t) {
  const g = S1.geometry(t.core), [bx0, by0] = g.bbox, U = new Float32Array(N), V = new Float32Array(N);
  for (let i = 0; i < N; i++) { if (!t.alpha[i]) continue; const x = i % W, y = (i / W) | 0, p = master.panel[i] < 0 ? 0 : master.panel[i]; let u, v;
    if (p === 0) { u = x - bx0; v = y - by0; } else { const a = master.axes[p - 1], th = a.angle - Math.PI / 2, dx = x - a.origin[0], dy = y - a.origin[1]; u = dx * Math.cos(-th) - dy * Math.sin(-th); v = dx * Math.sin(-th) + dy * Math.cos(-th); }
    U[i] = u + master.disp[i * 2]; V[i] = v + master.disp[i * 2 + 1]; }
  return { U, V };
}

/** The checks that need no eyes: inside a panel the material never jumps (also where C's arms or hands cross the legs: the pattern
 *  does not change at a mask), every jump lies on a panel boundary (the centre seam, the waistband), no leg is mirrored (the panel's
 *  mean orientation), and the legs point the same way. Local folds (the fold displacement folding the mapping over a few pixels) are
 *  counted apart: they are not a mirror. */
export function mappingChecks(master, t, arms, maxStep = 2.5) {
  const { U, V } = mapping(master, t); let inPanelJumps = 0, boundaryPairs = 0, armPairs = 0, armMaxStep = 0, maxIn = 0; const neg = [0, 0, 0], tot = [0, 0, 0], sum = [0, 0, 0];
  for (let i = 0; i < N - W; i++) { if (!t.alpha[i]) continue; const p = master.panel[i];
    for (const j of [i + 1, i + W]) { if (!t.alpha[j] || (j === i + 1 && (j % W) === 0)) continue; const step = Math.max(Math.abs(U[j] - U[i]), Math.abs(V[j] - V[i]));
      if (master.panel[j] !== p) { boundaryPairs++; continue; } maxIn = Math.max(maxIn, step); if (step > maxStep) inPanelJumps++;
      if (arms && (arms[i * 4 + 3] >= 128) !== (arms[j * 4 + 3] >= 128)) { armPairs++; armMaxStep = Math.max(armMaxStep, step); } }
    if (p >= 0 && t.alpha[i + 1] && t.alpha[i + W] && master.panel[i + 1] === p && master.panel[i + W] === p) { const det = (U[i + 1] - U[i]) * (V[i + W] - V[i]) - (U[i + W] - U[i]) * (V[i + 1] - V[i]); tot[p]++; sum[p] += det; if (det <= 0) neg[p]++; } }
  const mirrored = sum.map((s, k) => tot[k] > 0 && s <= 0), legAngles = master.axes.map((a) => a.angle), sameWay = Math.abs(legAngles[0] - legAngles[1]) < Math.PI / 4;
  return { inPanelJumps, maxStepInPanel: +maxIn.toFixed(2), boundaryPairs, armPairs, armMaxStep: +armMaxStep.toFixed(2), mirroredPanels: mirrored, legsSameWay: sameWay,
    localFoldShare: tot.map((n, k) => (n ? +(neg[k] / n).toFixed(4) : 0)), ok: inPanelJumps === 0 && !mirrored.some(Boolean) && sameWay && armMaxStep <= maxStep };
}

/** The SYNTHETIC materials of the study (at the cut's scale, px): two solids, a stripe along the leg, a check. */
export function materials() {
  const tile = (w, h, f) => { const px = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.set([...f(x, y), 255], (y * w + x) * 4); return { w, h, px }; };
  return {
    "solid navy (SYNTHETIC)": [48, 66, 110],
    "solid sand (SYNTHETIC)": [214, 190, 140],
    "stripe (SYNTHETIC, along the leg, 24 px)": tile(24, 1, (x) => (x < 8 ? [44, 56, 92] : [232, 224, 206])),
    "check (SYNTHETIC gingham, 28 px)": tile(28, 28, (x, y) => { const a = x < 14, b = y < 14; return a && b ? [150, 40, 44] : a || b ? [204, 126, 118] : [246, 238, 226]; }),
  };
}

/** The pants layer of a design (the tee master's render, unchanged; its full layer is the bottom's one layer). */
export function renderPants(master, t, base, design) {
  const r = TM.render(master, t, base, master.waist, design), L = r.layer;
  if (master.edge) { const { idx, rgb } = master.edge; for (let k = 0; k < idx.length; k++) { const i = idx[k]; L[i * 4] = rgb[k * 3]; L[i * 4 + 1] = rgb[k * 3 + 1]; L[i * 4 + 2] = rgb[k * 3 + 2]; } }
  return { layer: L, layers: { pants: L } };
}
