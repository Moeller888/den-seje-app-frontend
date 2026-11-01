// D-294 — A SHOE SOURCE WITH MORE REAL DRAWN PIXELS, AND A CHAIN THAT KEEPS ITS EDGES (offline; no image call). D-293 found that the
// low sneaker is drawn at the full figure's resolution (about 140 px per shoe, 2 px lines), that its collar top is a binary extraction
// cut, that v2's binary per-pixel decisions add steps, and that nearest-neighbour review sheets showed the source's pixels as steps.
// This module fixes the geometry of ONE tight source call and the chain from it to the avatar, so a new source can be judged with a
// concrete method, apart from the master:
//   crop        — the avatar's feet region CROP (384x256 avatar px, both shoes, the D-293 regions inside) drawn at K = 4: the call's
//                 1536x1024 image. Avatar (x, y) <- source (K (x − CROP.x0) + i, K (y − CROP.y0) + j), i, j in 0..K−1. No other scale.
//   layout      — Image 1 of the call: the published low sneaker layer's crop, enlarged K times by bilinear interpolation on a
//                 transparent background. It fixes size, angle and placement; it is a LAYOUT reference, never a result (an enlarged
//                 copy adds no detail: detailMeasures reads it as an enlargement).
//   downscale   — the source to the avatar: a premultiplied K x K area average (the colour weighted by alpha, so a transparent
//                 background leaves no light or dark rim), then placed at CROP; one global integer translation (dx, dy) from the
//                 registration may be applied, never a scale, a rotation or a per-shoe move (no free deformation).
//   tiles       — the shoe master (northstar-shoe-master.mjs) works on a 1024x1536 canvas; at K = 4 each shoe gets its own working
//                 canvas: the source's left or right half (768x1024) at its top-left corner. The master runs at the SOURCE's
//                 resolution and the result is downscaled after it, so the master's per-pixel decisions fall on quarter pixels.
//   detail      — detailMeasures: the silhouette's alpha transition width and the inner lines' luminance transition width, in source
//                 pixels (median). A drawing made at K = 4 has transitions of 1–2 px; an enlarged copy of a 1x drawing has ~K.
import * as WR from "./northstar-wardrobe.mjs";
import * as SM from "./northstar-shoe-master.mjs";

const { W, N } = WR, H = N / W;
export const K = 4;
export const CROP = Object.freeze({ x0: 320, y0: 1270, w: 384, h: 256 });
export const OUT = Object.freeze({ w: CROP.w * K, h: CROP.h * K });   // 1536x1024: one of the model's sizes
export const SIDES = Object.freeze({ left: Object.freeze({ x0: 0, w: OUT.w / 2 }), right: Object.freeze({ x0: OUT.w / 2, w: OUT.w / 2 }) });
export const SPLIT_X = CROP.x0 + CROP.w / 2;   // 512 in avatar px: the left shoe lies left of it, the right shoe right of it

/** Image 1: the avatar layer's CROP enlarged K times (premultiplied bilinear), transparent outside the shoes. */
export function layoutCanvas(layer) {
  const o = new Uint8ClampedArray(OUT.w * OUT.h * 4), at = (x, y) => (Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))) * 4;
  for (let y = 0; y < OUT.h; y++) for (let x = 0; x < OUT.w; x++) {
    const sx = CROP.x0 + (x + 0.5) / K - 0.5, sy = CROP.y0 + (y + 0.5) / K - 0.5, x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
    let a = 0; const c = [0, 0, 0];
    for (const [xx, yy, wt] of [[x0, y0, (1 - fx) * (1 - fy)], [x0 + 1, y0, fx * (1 - fy)], [x0, y0 + 1, (1 - fx) * fy], [x0 + 1, y0 + 1, fx * fy]]) { const p = at(xx, yy), al = layer[p + 3] * wt; a += al; for (let k = 0; k < 3; k++) c[k] += layer[p + k] * al; }
    const q = (y * OUT.w + x) * 4; if (a > 0) for (let k = 0; k < 3; k++) o[q + k] = Math.round(c[k] / a); o[q + 3] = Math.round(a); }
  return { w: OUT.w, h: OUT.h, px: o };
}
/** The source (OUT.w x OUT.h) to avatar resolution: a premultiplied K x K area average (CROP.w x CROP.h). */
export function downscale(img, k = K) {
  const w = img.w / k, h = img.h / k, o = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let a = 0; const c = [0, 0, 0];
    for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) { const p = ((y * k + j) * img.w + x * k + i) * 4, al = img.px[p + 3]; a += al; for (let q = 0; q < 3; q++) c[q] += img.px[p + q] * al; }
    const q = (y * w + x) * 4; if (a > 0) for (let t = 0; t < 3; t++) o[q + t] = Math.round(c[t] / a); o[q + 3] = Math.round(a / (k * k)); }
  return { w, h, px: o };
}
/** A CROP-sized image placed into a full 1024x1536 avatar canvas at CROP, moved by one global integer translation. */
export function place(small, dx = 0, dy = 0) {
  const o = new Uint8ClampedArray(N * 4);
  for (let y = 0; y < small.h; y++) for (let x = 0; x < small.w; x++) { const ax = CROP.x0 + x + dx, ay = CROP.y0 + y + dy; if (ax < 0 || ax >= W || ay < 0 || ay >= H) continue; o.set(small.px.subarray((y * small.w + x) * 4, (y * small.w + x) * 4 + 4), (ay * W + ax) * 4); }
  return o;
}
/** One shoe's half of the source in a 1024x1536 working canvas (at its top-left corner), and back. */
export function tileOf(img, side) { const s = SIDES[side], o = new Uint8ClampedArray(N * 4); for (let y = 0; y < img.h; y++) o.set(img.px.subarray((y * img.w + s.x0) * 4, (y * img.w + s.x0 + s.w) * 4), y * W * 4); return o; }
export function untile(tiles) { const o = new Uint8ClampedArray(OUT.w * OUT.h * 4); for (const [side, t] of Object.entries(tiles)) { const s = SIDES[side]; for (let y = 0; y < OUT.h; y++) o.set(t.subarray(y * W * 4, (y * W + s.w) * 4), (y * OUT.w + s.x0) * 4); } return { w: OUT.w, h: OUT.h, px: o }; }
/** The cut's seeds (avatar px) in a side's working canvas at K (each seed in the middle of its K x K block). */
export function seedsFor(side, seeds = SM.SPEC.seeds) {
  const s = SIDES[side], left = side === "left";
  return Object.fromEntries(Object.entries(seeds).map(([g, pts]) => [g, pts.filter(([x]) => (x < SPLIT_X) === left).map(([x, y]) => [K * (x - CROP.x0) - s.x0 + (K >> 1), K * (y - CROP.y0) + (K >> 1)])]));
}
/** The master's spec at the source's resolution: every radius (ink, volume, v3's blend) scaled by K, the side's seeds. */
export function specAtK(spec, side, seeds) { return Object.freeze({ ...spec, inkRadius: spec.inkRadius * K, ...(spec.volumeRadius ? { volumeRadius: spec.volumeRadius * K } : {}), ...(spec.edge ? { edge: Object.freeze({ ...spec.edge, blendRadius: spec.edge.blendRadius * K }) } : {}), seeds: seeds || seedsFor(side, spec.seeds) }); }

/** The detail measures of an image (any size): the median width, in its own pixels, of (a) the silhouette's alpha transitions (from
 *  ≤ 10 % to ≥ 90 % alpha) and (b) the inner lines' luminance transitions (a monotone run from a light to a dark pixel at least 0.25
 *  OKLab L apart, the pixels between 10 % and 90 % of the drop), along rows and columns over opaque pixels. */
export function detailMeasures(img) {
  const { w, h, px } = img, A = (x, y) => px[(y * w + x) * 4 + 3] / 255, L = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) if (px[i * 4 + 3] >= 200) L[i] = SM.oklab([px[i * 4], px[i * 4 + 1], px[i * 4 + 2]])[0]; else L[i] = NaN;
  const alphaW = [], lineW = [];
  const scan = (len, get, getL) => {
    for (let k = 1; k < len; k++) { const a0 = get(k - 1), a1 = get(k); if (a0 <= 0.1 && a1 > 0.1) { let e = k; while (e < len && get(e) < 0.9) e++; if (e < len && e - k <= 16) alphaW.push(e - k); } if (a0 >= 0.9 && a1 < 0.9) { let e = k; while (e < len && get(e) > 0.1) e++; if (e < len && e - k <= 16) alphaW.push(e - k); } }
    let k = 0; while (k < len - 1) { const v = getL(k); if (Number.isNaN(v)) { k++; continue; } let e = k; while (e + 1 < len && !Number.isNaN(getL(e + 1)) && getL(e + 1) < getL(e)) e++;
      const drop = v - getL(e); if (drop >= 0.25 && e - k <= 24) { let n = 0; for (let q = k; q <= e; q++) { const f = (v - getL(q)) / drop; if (f > 0.1 && f < 0.9) n++; } lineW.push(n); } k = Math.max(e, k + 1); } };
  for (let y = 0; y < h; y++) scan(w, (x) => A(x, y), (x) => L[y * w + x]);
  for (let x = 0; x < w; x++) scan(h, (y) => A(x, y), (y) => L[y * w + x]);
  const med = (v) => { if (!v.length) return null; const s = [...v].sort((a, b) => a - b); return s[s.length >> 1]; };
  return { alphaTransitionPx: med(alphaW), lineTransitionPx: med(lineW), alphaSamples: alphaW.length, lineSamples: lineW.length };
}
/** The detail rule: a source drawn at K has sharp transitions in its own pixels; an enlargement of a 1x drawing has transitions of ~K. */
export const DETAIL_RULE = Object.freeze({ maxAlphaTransitionPx: 2, maxLineTransitionPx: 2 });
export function detailVerdict(m) { const p = []; if (m.alphaTransitionPx === null || m.alphaTransitionPx > DETAIL_RULE.maxAlphaTransitionPx) p.push("the silhouette's edges are " + m.alphaTransitionPx + " px wide: an enlargement, not drawn at K");
  if (m.lineTransitionPx === null || m.lineTransitionPx > DETAIL_RULE.maxLineTransitionPx) p.push("the inner lines' edges are " + m.lineTransitionPx + " px wide: an enlargement, not drawn at K"); return { ok: !p.length, problems: p }; }

/** The geometry rules a new source must meet in the avatar (after the fixed downscale and placement): REJECTED when any fails. */
export const GEOMETRY_RULE = Object.freeze({ maxShiftPx: 2, minShoeIoU: 0.95, sizeRatio: [0.96, 1.04], maxCentroidOffsetPx: 2, maxPaintOverAnklePx: 40, maxSkinPx: 3, shoeComponents: 2, maxCoveringChange: 0.01, maxNewlyExposedFootPx: 20 });
export const SKIN_DE = 0.04;
const dE = (a, b) => { const p = SM.oklab([a[0], a[1], a[2]]), q = SM.oklab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
/** C's median skin colour on the legs just above the shoes (y 1240–1330, C's body). */
export function skinOf(base) { const c = [[], [], []]; for (let y = 1240; y < 1330; y++) for (let x = 300; x < 724; x++) { const i = (y * W + x) * 4; if (base.body[i + 3] >= 250 && WR.colourClass(base.body[i], base.body[i + 1], base.body[i + 2]) === "skin") for (let k = 0; k < 3; k++) c[k].push(base.body[i + k]); } return c.map((a) => a.sort((x, y) => x - y)[a.length >> 1]); }
/** The integer translation (within ±maxShift) that best covers the reference's opaque pixels with the candidate's. */
export function register(cand, ref, maxShift = GEOMETRY_RULE.maxShiftPx + 2) {
  let best = { dx: 0, dy: 0, iou: -1 };
  for (let dy = -maxShift; dy <= maxShift; dy++) for (let dx = -maxShift; dx <= maxShift; dx++) { let inter = 0, uni = 0;
    for (let y = CROP.y0; y < CROP.y0 + CROP.h; y++) for (let x = CROP.x0; x < CROP.x0 + CROP.w; x++) { const i = y * W + x, sx = x - dx, sy = y - dy, c = sx >= 0 && sx < W && sy >= 0 && sy < H && cand[(sy * W + sx) * 4 + 3] >= 128, r = ref[i * 4 + 3] >= 128; if (c && r) inter++; if (c || r) uni++; }
    const iou = uni ? inter / uni : 0; if (iou > best.iou) best = { dx, dy, iou }; }
  return best;
}
/** The geometry check of a placed candidate (avatar canvas, already translated) against the reference shoe layer; with base (C), also
 *  the paint over C's ankle (where the reference is empty and C's body lies, above each shoe's solid top) and the covering. */
export function geometryCheck(cand, ref, { base = null, hidden = null, shift = { dx: 0, dy: 0 } } = {}) {
  const R = GEOMETRY_RULE, p = [], m = {}, op = (P, i) => P[i * 4 + 3] >= 128;
  if (Math.abs(shift.dx) > R.maxShiftPx || Math.abs(shift.dy) > R.maxShiftPx) p.push("the registration needs a translation of " + shift.dx + "," + shift.dy + " px");
  for (const [side, inSide] of [["left", (x) => x < SPLIT_X], ["right", (x) => x >= SPLIT_X]]) { let inter = 0, uni = 0; const bb = (P) => { let x0 = W, x1 = -1, y0 = H, y1 = -1, sx = 0, sy = 0, n = 0; for (let i = 0; i < N; i++) { const x = i % W; if (!inSide(x) || !op(P, i)) continue; const y = (i / W) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); sx += x; sy += y; n++; } return { w: x1 - x0 + 1, h: y1 - y0 + 1, cx: sx / Math.max(1, n), cy: sy / Math.max(1, n), n }; };
    for (let i = 0; i < N; i++) { if (!inSide(i % W)) continue; const c = op(cand, i), r = op(ref, i); if (c && r) inter++; if (c || r) uni++; }
    const a = bb(cand), b = bb(ref), iou = uni ? inter / uni : 0, sw = a.w / b.w, sh = a.h / b.h, off = Math.hypot(a.cx - b.cx, a.cy - b.cy);
    m[side] = { iou: +iou.toFixed(4), widthRatio: +sw.toFixed(3), heightRatio: +sh.toFixed(3), centroidOffsetPx: +off.toFixed(2) };
    if (iou < R.minShoeIoU) p.push(side + " shoe: IoU " + iou.toFixed(3) + " < " + R.minShoeIoU);
    if (sw < R.sizeRatio[0] || sw > R.sizeRatio[1] || sh < R.sizeRatio[0] || sh > R.sizeRatio[1]) p.push(side + " shoe: size ratio " + sw.toFixed(3) + " x " + sh.toFixed(3) + " (another scale: the R1 problem)");
    if (off > R.maxCentroidOffsetPx) p.push(side + " shoe: centre moved " + off.toFixed(1) + " px"); }
  // components: exactly the two shoes
  const seen = new Uint8Array(N); let comps = 0; for (let s = 0; s < N; s++) { if (seen[s] || !op(cand, s)) continue; let n = 0; const q = [s]; seen[s] = 1; while (q.length) { const i = q.pop(), x = i % W; n++; for (const j of [i - 1, i + 1, i - W, i + W]) { if (j < 0 || j >= N || Math.abs((j % W) - x) > 1 || seen[j] || !op(cand, j)) continue; seen[j] = 1; q.push(j); } } if (n >= 50) comps++; }
  m.components = comps; if (comps !== R.shoeComponents) p.push(comps + " separate painted pieces (expected the two shoes)");
  // C's own skin at the ankle (not a colour class: a beige shoe would count): pixels within SKIN_DE of C's median skin colour there
  let skin = null; if (base) { skin = 0; const sk = skinOf(base); for (let i = 0; i < N; i++) if (op(cand, i) && dE(cand.subarray(i * 4, i * 4 + 3), sk) < SKIN_DE) skin++; m.skinPx = skin; m.skinRgb = sk; }
  if (skin !== null && skin > R.maxSkinPx) p.push(skin + " skin-coloured pixels in the shoes (the ankle drawn into the shoe)");
  if (base) { let over = 0; for (let i = 0; i < N; i++) if (op(cand, i) && ref[i * 4 + 3] < 16 && (base.body[i * 4 + 3] > 0) && ((i / W) | 0) < 1420) over++; m.paintOverAnklePx = over; if (over > R.maxPaintOverAnklePx) p.push(over + " px painted over C's ankle where the shoe is open (a lining or a collar drawn into the leg)"); }
  if (hidden) { let diff = 0, exposed = 0, n0 = 0; for (let i = 0; i < N; i++) { if (hidden.ref[i]) n0++; if (hidden.ref[i] !== hidden.cand[i]) diff++; if (hidden.ref[i] && !hidden.cand[i]) exposed++; } m.coveringChange = +(diff / Math.max(1, n0)).toFixed(4); m.newlyExposedFootPx = exposed;
    if (diff / Math.max(1, n0) > R.maxCoveringChange) p.push("the covering changes by " + (100 * diff / n0).toFixed(1) + " %"); if (exposed > R.maxNewlyExposedFootPx) p.push(exposed + " px of C's foot newly exposed"); }
  return { ok: !p.length, problems: p, measures: m };
}

/** A SYNTHETIC shoe-like drawing for the controls, rendered with 4x4 supersampling at any scale s (avatar px x s), inside the LEFT
 *  shoe's half of CROP: an outline 2 avatar px wide, an upper and a toe cap split by a 2 px line, a sole band under a 2 px line, a lace
 *  bar with its outline; beige. SYNTH_SEEDS are its field seeds in CROP coordinates. */
export const SYNTH = Object.freeze({ cx: 96, cy: 130, rx: 80, ry: 60 });
export const SYNTH_SEEDS = Object.freeze({ upper: [[130, 110]], toe: [[60, 150]], sole: [[96, 182]], laces: [[106, 112]], tongue: [] });
export function synthShoe(s) {
  const { cx, cy, rx, ry } = SYNTH, w = CROP.w * s, h = CROP.h * s, o = new Uint8ClampedArray(w * h * 4), ss = 4, LINE = [120, 98, 78];
  const shape = (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 && y >= cy - 50;
  const colourAt = (x, y) => { const r = Math.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2);
    if (r > 1 - 2 / ry || y < cy - 48) return [60, 42, 30];
    const toe = Math.hypot((x - (cx - 40)) / 35, (y - (cy + 20)) / 25); if (Math.abs(toe - 1) < 1 / 25) return LINE;
    if (Math.abs(y - (cy + 35)) < 1) return LINE;
    const lx = Math.abs(x - (cx + 10)), ly = Math.abs(y - (cy - 18)); if (lx < 22 && ly < 4) return lx > 20.5 || ly > 2.5 ? LINE : [244, 236, 222];
    return y > cy + 35 ? [236, 226, 210] : toe < 1 ? [228, 214, 196] : [224, 208, 188]; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let a = 0; const c = [0, 0, 0];
    for (let j = 0; j < ss; j++) for (let i = 0; i < ss; i++) { const ax = (x + (i + 0.5) / ss) / s, ay = (y + (j + 0.5) / ss) / s; if (!shape(ax, ay)) continue; const col = colourAt(ax, ay); a++; for (let k = 0; k < 3; k++) c[k] += col[k]; }
    const q = (y * w + x) * 4; if (a) for (let k = 0; k < 3; k++) o[q + k] = Math.round(c[k] / a); o[q + 3] = Math.round(255 * a / (ss * ss)); }
  return { w, h, px: o };
}

/** The chain at K: per shoe side, the master (spec at K, the side's seeds) on the source's half in its working canvas, the design
 *  rendered there, the halves joined, downscaled (premultiplied K x K) and placed in the avatar (one global translation). A side without
 *  seeds is carried through unchanged (no shoe there). Returns the avatar canvas. */
export function renderAtK(img, spec, design, { seedsBySide = null, shift = { dx: 0, dy: 0 }, templateOf } = {}) {
  const tiles = {};
  for (const side of Object.keys(SIDES)) { const t0 = tileOf(img, side), seeds = seedsBySide ? seedsBySide[side] : seedsFor(side, spec.seeds);
    if (!seeds || !Object.values(seeds).some((p) => p.length)) { tiles[side] = t0; continue; }
    const m = SM.buildShoeMaster(t0, templateOf(t0), specAtK(spec, side, seeds)); tiles[side] = design ? SM.renderShoe(m, t0, design) : t0; }
  return place(downscale(untile(tiles)), shift.dx, shift.dy);
}
/** CROP-coordinate seeds (e.g. SYNTH_SEEDS) in a side's working canvas at K, and in the avatar at 1x. */
export function cropSeedsAtK(seeds, side) { const s = SIDES[side], left = side === "left"; return Object.fromEntries(Object.entries(seeds).map(([g, pts]) => [g, pts.filter(([x]) => (x < CROP.w / 2) === left).map(([x, y]) => [K * x - s.x0 + (K >> 1), K * y + (K >> 1)])])); }
export function cropSeedsAt1(seeds) { return Object.fromEntries(Object.entries(seeds).map(([g, pts]) => [g, pts.map(([x, y]) => [x + CROP.x0, y + CROP.y0])])); }
