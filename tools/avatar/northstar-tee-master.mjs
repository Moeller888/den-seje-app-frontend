// D-264 PROTOTYPE — ONE REUSABLE T-SHIRT MASTER for the tee-hip cut (offline; no image call; not the production method). D-262 found
// three limits of laying flat material on a cut: the pattern breaks where C's arm mask begins (not at the garment's seam), the
// crisp fold strokes are lost, and the pattern lies flat as a print. The master is ONE-TIME data per cut that answers them:
//   panels      — body and two sleeve panels split along the garment's DRAWN armhole seams (a starting polyline per side, entered
//                 once by hand, refined to the darkest thin pixel of each row in the cut item, then closed to the outline);
//   contour     — the cut item's outer ink (absolute colour, the same on every design);
//   shading     — everything else the cut item draws on its fabric (seams, rib edge, hem stitch, fold strokes, broad shadow and
//                 highlight) as ONE multiplicative luminance ratio against the fabric's base: it carries the strokes crisp onto any
//                 material. APPROXIMATION: luminance only (the source's warm tint in its shadows is not carried), and the source's
//                 own colour variations within the fabric are read as shading;
//   mapping     — the material's coordinates per panel: the body planar, each sleeve along its own axis from its seam; a fixed
//                 displacement (a gentle cylinder per panel, plus the gradient of the softened fold shading) so that a pattern
//                 bends with the drawn folds. Only the material's mapping moves; the garment's outline and alpha never do;
//   anchors     — fixed places for details (a chest print), mapped and shaded like the fabric.
// Per DESIGN only the material changes: a colour or a seamless swatch (+ optionally a trim swatch and a chest print).
import * as WR from "./northstar-wardrobe.mjs";
import * as S1 from "./northstar-r1-similarity.mjs";

const { W, N } = WR, H = N / W;
export const REVISION = "tee-master-v1";
/** The one-time per-cut data (entered by hand once, then refined automatically; never per design). */
export const SPEC = Object.freeze({
  cut: "tee-hip", source: "top-tee-hip-cream",
  // the armhole seams as seen in the cut item (canvas px): shoulder point → armpit, a few points per side
  seams: { left: [[381, 500], [390, 530], [398, 565], [404, 600], [408, 638]], right: [[642, 500], [633, 530], [625, 565], [619, 600], [615, 638]] },
  seamSearchPx: 8, extendPx: 14,
  // where each seam leaves the core at the armpit: outward and a little down (the sleeve's underside meets the body there)
  armpitOut: { left: [-1, 0.35], right: [1, 0.35] },
  warp: { cylinder: 0.10, foldMaxPx: 3, foldBlur: 14 },
  anchors: { "chest-left": { x: 0.2, y: 0.3, width: 0.24 } },
});

const lumOf = (P, i) => 0.299 * P[i * 4] + 0.587 * P[i * 4 + 1] + 0.114 * P[i * 4 + 2];
const union = (layers) => { const u = new Uint8ClampedArray(N * 4); for (const L of Object.values(layers)) for (let i = 0; i < N; i++) if (L[i * 4 + 3]) u.set(L.subarray(i * 4, i * 4 + 4), i * 4); return u; };

/** The seam of one side: per row between the polyline's ends, the darkest pixel within seamSearchPx of the interpolated x, in the
 *  cut item, median-filtered over 9 rows; then extended along its end directions until it leaves the core (so that it closes the panel against the outline). */
export function seamLine(item, core, poly, { search = SPEC.seamSearchPx, extend = SPEC.extendPx, armpitOut = null } = {}) {
  const pts = []; const y0 = poly[0][1], y1 = poly[poly.length - 1][1];
  for (let y = y0; y <= y1; y++) { let k = 0; while (k < poly.length - 2 && poly[k + 1][1] < y) k++; const [ax, ay] = poly[k], [bx, by] = poly[k + 1], gx = Math.round(ax + ((bx - ax) * (y - ay)) / Math.max(1, by - ay));
    let best = gx, bl = 1e9; for (let x = gx - search; x <= gx + search; x++) { const i = y * W + x; if (!core[i]) continue; const l = lumOf(item, i); if (l < bl) { bl = l; best = x; } } pts.push([best, y]); }
  // a single row may snag on another dark pixel within the search: the median of 9 rows rejects such a jump (else the barrier zigzags
  // and cuts a small pocket off a panel)
  const raw = pts.map(([x]) => x); for (let k = 0; k < pts.length; k++) { const win = raw.slice(Math.max(0, k - 4), k + 5).sort((p2, q) => p2 - q); pts[k][0] = win[win.length >> 1]; }
  const ext = (p, q, dir = null) => { const out = []; const dx = dir ? dir[0] : p[0] - q[0], dy = dir ? dir[1] : p[1] - q[1], n = Math.hypot(dx, dy) || 1; for (let s = 1; s <= 200; s++) { const x = Math.round(p[0] + (dx / n) * s), y = Math.round(p[1] + (dy / n) * s); out.push([x, y]); if (!core[y * W + x] && s > extend) break; } return out; };
  const top = ext(pts[0], pts[Math.min(10, pts.length - 1)]), bot = ext(pts[pts.length - 1], pts[Math.max(0, pts.length - 11)], armpitOut);
  return [...top.reverse(), ...pts, ...bot];
}

/** The master for the cut: panels, contour, shading ratio, displacement, sleeve axes. t: the cut (R1 template), src: its item. */
export function buildMaster(t, src) {
  const item = union(src.layers), core = t.core;
  // panels: the core cut along both seams (a 2 px wide barrier); the sleeve panels are the components holding a point outside each seam
  const seams = { left: seamLine(item, core, SPEC.seams.left, { armpitOut: SPEC.armpitOut.left }), right: seamLine(item, core, SPEC.seams.right, { armpitOut: SPEC.armpitOut.right }) }, barrier = new Uint8Array(N);
  // the barrier: every pair of consecutive seam points joined by a straight run (the refined points may jump a few px per row)
  for (const line of Object.values(seams)) for (let k = 0; k + 1 < line.length; k++) { const [ax, ay] = line[k], [bx, by] = line[k + 1], n = Math.max(Math.abs(bx - ax), Math.abs(by - ay), 1);
    for (let s2 = 0; s2 <= n; s2++) { const x = Math.round(ax + ((bx - ax) * s2) / n), y = Math.round(ay + ((by - ay) * s2) / n); for (const d of [0, 1]) { const i = y * W + x + d; if (i >= 0 && i < N) barrier[i] = 1; } } }
  const comp = new Int32Array(N).fill(-1), sizes = []; for (let s = 0; s < N; s++) { if (!core[s] || barrier[s] || comp[s] >= 0) continue; const id = sizes.length, q = [s]; comp[s] = id; let n = 0;
    while (q.length) { const i = q.pop(), x = i % W; n++; for (const j of [i - 1, i + 1, i - W, i + W]) { if (j < 0 || j >= N || Math.abs((j % W) - x) > 1 || !core[j] || barrier[j] || comp[j] >= 0) continue; comp[j] = id; q.push(j); } } sizes.push(n); }
  // each sleeve: the largest component met on a ray outward from the seam's middle (fragments between line pixels are skipped)
  const outsideOf = (line, sign) => { const [x, y] = line[Math.floor(line.length / 2)]; let best = -1; for (let d = 3; d < 90; d++) { const i = y * W + x + sign * d; if (core[i] && comp[i] >= 0 && (best < 0 || sizes[comp[i]] > sizes[best])) best = comp[i]; } return best; };
  const cl = outsideOf(seams.left, -1), cr = outsideOf(seams.right, 1), panel = new Int8Array(N).fill(-1);
  for (let i = 0; i < N; i++) if (core[i]) panel[i] = comp[i] === cl ? 1 : comp[i] === cr ? 2 : 0;
  // the seam pixels themselves join the body (their ink is in the shading)
  for (let i = 0; i < N; i++) if (core[i] && panel[i] < 0) panel[i] = 0;
  // contour: the cut's own outer ink (absolute); shading: the item's luminance against the fabric's base (its body median)
  const v = []; for (let i = 0; i < N; i++) if (panel[i] === 0 && !t.contour[i * 4 + 3]) v.push(lumOf(item, i)); v.sort((a, b) => a - b); const base = v[Math.floor(v.length * 0.6)] || 1;
  const ratio = new Float32Array(N); for (let i = 0; i < N; i++) if (t.alpha[i]) ratio[i] = item[i * 4 + 3] ? Math.min(1.12, Math.max(0.25, lumOf(item, i) / base)) : 1;
  // displacement: per panel a gentle cylinder (v moves down toward the panel's sides) + the gradient of the softened shading
  // the fold displacement: the gradient of the shading softened over foldBlur px, scaled so that its largest shift is foldMaxPx —
  // smooth by construction (no tear at a shading edge)
  const r = SPEC.warp.foldBlur, src0 = new Float32Array(N); for (let i = 0; i < N; i++) src0[i] = core[i] && !t.contour[i * 4 + 3] ? Math.min(1, ratio[i]) : 1;
  const I = new Float64Array((W + 1) * (H + 1)), C = new Float64Array((W + 1) * (H + 1)); for (let y = 0; y < H; y++) { let rs = 0, rc = 0; for (let x = 0; x < W; x++) { const i = y * W + x, ok = core[i] ? 1 : 0; rs += src0[i] * ok; rc += ok; const k = (y + 1) * (W + 1) + x + 1; I[k] = I[k - W - 1] + rs; C[k] = C[k - W - 1] + rc; } }
  const box = (A, x0, y0, x1, y1) => A[y1 * (W + 1) + x1] - A[y0 * (W + 1) + x1] - A[y1 * (W + 1) + x0] + A[y0 * (W + 1) + x0];
  const soft = new Float32Array(N); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (!core[i]) continue; const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r), x1 = Math.min(W, x + r + 1), y1 = Math.min(H, y + r + 1), c = box(C, x0, y0, x1, y1); soft[i] = c ? box(I, x0, y0, x1, y1) / c : 1; }
  const ext = [0, 1, 2].map(() => ({ x0: W, x1: 0 })); for (let i = 0; i < N; i++) if (panel[i] >= 0) { const e = ext[panel[i]], x = i % W; if (x < e.x0) e.x0 = x; if (x > e.x1) e.x1 = x; }
  const gxy = new Float32Array(N * 2); let gmax = 1e-6; for (let i = 4 * W; i < N - 4 * W; i++) { if (!core[i]) continue; const a = core[i - 4] ? soft[i - 4] : soft[i], b = core[i + 4] ? soft[i + 4] : soft[i], c2 = core[i - 4 * W] ? soft[i - 4 * W] : soft[i], d = core[i + 4 * W] ? soft[i + 4 * W] : soft[i];
    gxy[i * 2] = (b - a) / 8; gxy[i * 2 + 1] = (d - c2) / 8; gmax = Math.max(gmax, Math.hypot(gxy[i * 2], gxy[i * 2 + 1])); }
  const disp = new Float32Array(N * 2); for (let i = 0; i < N; i++) { if (panel[i] < 0) continue; const x = i % W, e = ext[panel[i]], c = (e.x0 + e.x1) / 2, hw = Math.max(1, (e.x1 - e.x0) / 2), u = (x - c) / hw;
    disp[i * 2 + 1] = SPEC.warp.cylinder * hw * (1 - Math.cos(Math.min(1, Math.abs(u)) * Math.PI / 2)) * (panel[i] === 0 ? 1 : 0.5);
    disp[i * 2] += (SPEC.warp.foldMaxPx * gxy[i * 2]) / gmax; disp[i * 2 + 1] += (SPEC.warp.foldMaxPx * gxy[i * 2 + 1]) / gmax; }
  // sleeve axes (PCA of each sleeve panel) and the seam's midpoint as each sleeve's origin
  const axes = [1, 2].map((k) => { let n = 0, sx = 0, sy = 0, xx = 0, yy = 0, xy = 0; for (let i = 0; i < N; i++) if (panel[i] === k) { const x = i % W, y = (i / W) | 0; n++; sx += x; sy += y; xx += x * x; yy += y * y; xy += x * y; }
    const mx = sx / n, my = sy / n; return { angle: 0.5 * Math.atan2(2 * (xy / n - mx * my), xx / n - mx * mx - (yy / n - my * my)), origin: (k === 1 ? seams.left : seams.right)[Math.floor((k === 1 ? seams.left : seams.right).length / 2)], px: n }; });
  return { revision: REVISION, spec: SPEC, seams, panel, ratio, disp, axes, base, sizes: { body: (() => { let n = 0; for (let i = 0; i < N; i++) if (panel[i] === 0) n++; return n; })(), ...Object.fromEntries([1, 2].map((k) => [k === 1 ? "left" : "right", axes[k - 1].px])) } };
}

const sample = (s, u, v) => { const m = (a, n) => ((Math.floor(a) % n) + n) % n; const j = (m(v, s.h) * s.w + m(u, s.w)) * 4; return [s.px[j], s.px[j + 1], s.px[j + 2]]; };

/** Render a design on the master. design = { body: swatch (seamless) | colour [r,g,b], scale?, trim?: swatch|colour, print?: { img, anchor } }.
 *  bands: the cut's trim bands (D-257's construction layer). Returns the layer (alpha = the cut's) and its split by C's arms
 *  (the layer split is the production rule for sleeves OVER the arms; the PATTERN follows the master's panels). */
export function render(master, t, base, bands, design) {
  const g = S1.geometry(t.core), solid = (c) => ({ w: 1, h: 1, px: Uint8ClampedArray.from([...c, 255]) }), body = Array.isArray(design.body) ? solid(design.body) : design.body;
  const trim = design.trim ? (Array.isArray(design.trim) ? solid(design.trim) : design.trim) : null, k = design.scale || 1, [bx0, by0] = g.bbox, out = new Uint8ClampedArray(N * 4);
  for (let i = 0; i < N; i++) { if (!t.alpha[i]) continue; const x = i % W, y = (i / W) | 0, p = master.panel[i] < 0 ? 0 : master.panel[i];
    let u, v; if (p === 0) { u = x - bx0; v = y - by0; } else { const a = master.axes[p - 1], th = a.angle - Math.PI / 2, dx = x - a.origin[0], dy = y - a.origin[1]; u = dx * Math.cos(-th) - dy * Math.sin(-th); v = dx * Math.sin(-th) + dy * Math.cos(-th); }
    u += master.disp[i * 2]; v += master.disp[i * 2 + 1];
    const s = bands && bands[i] && trim ? trim : body, c = sample(s, u / k, v / k), f = master.ratio[i];
    for (let q = 0; q < 3; q++) out[i * 4 + q] = Math.min(255, Math.round(c[q] * f)); out[i * 4 + 3] = t.alpha[i]; }
  // the chest print: at its anchor, through the same displacement, multiplied by the same shading (it follows the fabric)
  const placed = [];
  if (design.print) { const A = SPEC.anchors[design.print.anchor], img = design.print.img, bw = g.bodyWidthBelowSleeves, cx = (g.bbox[0] + g.bbox[2]) / 2, w = Math.round(A.width * bw), sc = w / img.w, h = Math.round(img.h * sc);
    const x0 = Math.round(cx + A.x * bw - w / 2), y0 = Math.round(g.bbox[1] + A.y * g.height - h / 2); let inside = 0, total = 0;
    for (let y = y0 - 8; y < y0 + h + 8; y++) for (let x = x0 - 8; x < x0 + w + 8; x++) { const i = y * W + x; if (!t.core[i]) continue; const sx = (x - x0 + master.disp[i * 2]) / sc, sy = (y - y0 + master.disp[i * 2 + 1]) / sc;
      if (sx < 0 || sy < 0 || sx >= img.w || sy >= img.h) continue; const j = ((sy | 0) * img.w + (sx | 0)) * 4, al = img.px[j + 3] / 255; if (!al) continue; total++; inside++;
      for (let q = 0; q < 3; q++) out[i * 4 + q] = Math.min(255, Math.round(out[i * 4 + q] * (1 - al) + img.px[j + q] * master.ratio[i] * al)); }
    placed.push({ anchor: design.print.anchor, box: [x0, y0, w, h], px: inside }); }
  // the contour: the cut's own outer ink, on top, absolute
  for (let i = 0; i < N; i++) { const a = t.contour[i * 4 + 3]; if (!a) continue; const kk = a / 255; for (let q = 0; q < 3; q++) out[i * 4 + q] = Math.round(t.contour[i * 4 + q] * kk + out[i * 4 + q] * (1 - kk)); }
  const tb = new Uint8ClampedArray(N * 4), sl = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) if (out[i * 4 + 3]) (base.arms[i * 4 + 3] >= 128 ? sl : tb).set(out.subarray(i * 4, i * 4 + 4), i * 4);
  return { layer: out, layers: { topBody: tb, sleeves: sl }, placed };
}
