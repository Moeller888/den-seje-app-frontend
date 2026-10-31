// D-260 HYPOTHESIS r1-m1 (offline; no image call): GEOMETRY-FREE MATERIAL LAID ON BY THE CUT. D-255 and D-259 showed that the image
// model delivers new design (fabric, colour, pocket, stitching, soft folds) and follows style instructions, but never the
// reference's geometry (placement, bleed, band widths). r1-m1 therefore takes NO geometry from the model at all:
//   the model would deliver   — a flat MATERIAL swatch (fabric and pattern, no garment shape), optionally a TRIM swatch, and
//                               separate DETAILS (a pocket, a print) on their own, each with a declared anchor;
//   the cut supplies          — the silhouette and alpha, the fold shading, the sleeve split, the bands, the construction lines
//                               (D-257's construction layer) and the ANCHORS where details go (fixed rules per cut);
//   laying on (deterministic) — each region of the cut samples the swatch (mirror-tiled, at a declared scale; a sleeve's swatch
//                               turned along its arm), the bands sample the trim swatch, everything is multiplied by the cut's
//                               fold shade, the details are placed at their anchors, the construction lines go on top.
// Nothing is filled, warped or painted by hand; every pixel comes from a swatch or a detail, the cut's shade and the cut's lines.
import * as WR from "./northstar-wardrobe.mjs";
import * as S1 from "./northstar-r1-similarity.mjs";
import * as RC from "./northstar-r1c-evaluate.mjs";

const { W, N } = WR, H = N / W;
export const REVISION = "r1-m1";
// the anchors of the tee-hip cut, by rule from its geometry (never per design): the wearer's left chest (the viewer's right)
export const ANCHORS = Object.freeze({ "tee-hip": { "chest-left": { x: 0.2, y: 0.3, width: 0.17 } } });
export const SHADE = Object.freeze({ base: 0.76, gain: 0.34 });   // out = material · (base + gain · shade), shade 0..1 from the cut

/** A swatch {w, h, px} from a canvas-sized RGBA picture and a rectangle. */
export function swatchFrom(P, [x0, y0, w, h]) { const px = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y0 + y) * W + x0 + x; px.set(P.subarray(i * 4, i * 4 + 4), (y * w + x) * 4); } return { w, h, px }; }

/** Flat-field: the swatch's broad shading (a 2r+1 box mean of luminance) divided out, so that only fabric and pattern remain
 *  and the cut's own fold shade can be laid on without doubling the source's folds. */
export function flatten(s, r = 24) {
  const lum = new Float64Array(s.w * s.h); let tot = 0; for (let i = 0; i < s.w * s.h; i++) { lum[i] = 0.299 * s.px[i * 4] + 0.587 * s.px[i * 4 + 1] + 0.114 * s.px[i * 4 + 2]; tot += lum[i]; }
  const mean = tot / (s.w * s.h), I = new Float64Array((s.w + 1) * (s.h + 1));
  for (let y = 0; y < s.h; y++) { let rs = 0; for (let x = 0; x < s.w; x++) { rs += lum[y * s.w + x]; I[(y + 1) * (s.w + 1) + x + 1] = I[y * (s.w + 1) + x + 1] + rs; } }
  const o = new Uint8ClampedArray(s.px.length);
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) { const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r), x1 = Math.min(s.w, x + r + 1), y1 = Math.min(s.h, y + r + 1);
    const m = (I[y1 * (s.w + 1) + x1] - I[y0 * (s.w + 1) + x1] - I[y1 * (s.w + 1) + x0] + I[y0 * (s.w + 1) + x0]) / ((x1 - x0) * (y1 - y0)), k = mean / Math.max(1, m), i = y * s.w + x;
    for (let c = 0; c < 3; c++) o[i * 4 + c] = Math.round(s.px[i * 4 + c] * k); o[i * 4 + 3] = 255; }
  return { w: s.w, h: s.h, px: o };
}

/** The largest axis-aligned square (side ≤ max) fully inside a mask, on a 4 px grid: [x, y, side, side]. */
export function largestSquare(mask, max = 256) {
  const g = 4, gw = Math.floor(W / g), gh = Math.floor(H / g), ok = new Uint8Array(gw * gh); for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { let a = 1; for (let dy = 0; dy < g && a; dy++) for (let dx = 0; dx < g && a; dx++) if (!mask[(y * g + dy) * W + x * g + dx]) a = 0; ok[y * gw + x] = a; }
  const d = new Int32Array(gw * gh); let best = 0, bx = 0, by = 0;
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { const i = y * gw + x; if (!ok[i]) continue; d[i] = x && y ? 1 + Math.min(d[i - 1], d[i - gw], d[i - gw - 1]) : 1; if (d[i] > best) { best = d[i]; bx = x; by = y; } }
  const side = Math.min(max, best * g); return [(bx + 1) * g - side, (by + 1) * g - side, side, side];
}

/** The cut's fold shade 0..1, as the bleed canvas v2 shows it (closed, softened, no drawn line). */
export function shadeOf(t, cl) { const cv = RC.canvasV2(t, cl).canvas, s = new Float32Array(N); for (let i = 0; i < N; i++) { if (!t.core[i]) continue; const g = cv[i * 4] / 255; s[i] = Math.min(1, Math.max(0, cl.band[i] ? (g - 0.22) / 0.22 : (g - 0.45) / 0.35)); } return s; }

/** D-262 — a CRISP fold shade: the cut item's own shade with only its thin drawn lines removed (a 3 px grey closing inside the core),
 *  without the 9×9 softening of the canvas; the cel-shaded fold shapes keep their edges. 0..1. */
export function shadeCrisp(t) {
  const R = 3, sh = Float32Array.from(t.shade), tmp = new Float32Array(N);
  const pass = (src, dst, dx, dy, fn) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (!t.core[i]) { dst[i] = src[i]; continue; } let v = src[i];
    for (let k = -R; k <= R; k++) { const xx = x + k * dx, yy = y + k * dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const j = yy * W + xx; if (t.core[j]) v = fn(v, src[j]); } dst[i] = v; } };
  pass(sh, tmp, 1, 0, Math.max); pass(tmp, sh, 0, 1, Math.max); pass(sh, tmp, 1, 0, Math.min); pass(tmp, sh, 0, 1, Math.min);
  return sh;
}

/** D-262 — the cut item's own SHADING RATIO: its luminance (thin lines closed out, as in shadeCrisp) divided by its median over
 *  the core, clamped 0.5…1.15 — the original's shading strength, not a normalised map. Used directly as the factor (no base+gain). */
export function shadeRatio(t, src) {
  const lum = new Float32Array(N), core = []; for (let i = 0; i < N; i++) if (t.core[i]) { let c = null; for (const L of Object.values(src.layers)) if (L[i * 4 + 3] >= 128) c = L; if (c) { lum[i] = 0.299 * c[i * 4] + 0.587 * c[i * 4 + 1] + 0.114 * c[i * 4 + 2]; core.push(lum[i]); } }
  const R = 3, tmp = new Float32Array(N), pass = (a, b, dx, dy, fn) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (!t.core[i]) { b[i] = a[i]; continue; } let v = a[i];
    for (let k = -R; k <= R; k++) { const xx = x + k * dx, yy = y + k * dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const j = yy * W + xx; if (t.core[j]) v = fn(v, a[j]); } b[i] = v; } };
  pass(lum, tmp, 1, 0, Math.max); pass(tmp, lum, 0, 1, Math.max); pass(lum, tmp, 1, 0, Math.min); pass(tmp, lum, 0, 1, Math.min);
  core.sort((a, b) => a - b); const med = core[core.length >> 1] || 1, f = new Float32Array(N); for (let i = 0; i < N; i++) if (t.core[i]) f[i] = Math.min(1.15, Math.max(0.5, lum[i] / med)); return f;
}

/** The regions of a top: the body, and each sleeve with its arm's direction (principal axis of the sleeve's pixels). */
export function regions(t, base) {
  const reg = new Int8Array(N).fill(-1), acc = [0, 1].map(() => ({ n: 0, x: 0, y: 0, xx: 0, yy: 0, xy: 0 })), cx = W / 2;
  for (let i = 0; i < N; i++) { if (!t.core[i]) continue; if (base.arms[i * 4 + 3] >= 128) { const k = i % W < cx ? 0 : 1, x = i % W, y = (i / W) | 0, a = acc[k]; reg[i] = 1 + k; a.n++; a.x += x; a.y += y; a.xx += x * x; a.yy += y * y; a.xy += x * y; } else reg[i] = 0; }
  const axes = acc.map((a) => { if (!a.n) return { angle: 0, cx: 0, cy: 0 }; const mx = a.x / a.n, my = a.y / a.n, sxx = a.xx / a.n - mx * mx, syy = a.yy / a.n - my * my, sxy = a.xy / a.n - mx * my;
    return { angle: 0.5 * Math.atan2(2 * sxy, sxx - syy), cx: mx, cy: my }; });
  return { reg, axes };
}

// tiling: "mirror" (D-260's default: any swatch, but a visible symmetry axis) or "wrap" (a seamless swatch repeats without an axis)
const sample = (s, u, v, tiling = "mirror") => { const m = tiling === "wrap" ? (a, n) => ((Math.floor(a) % n) + n) % n : (a, n) => { const p = ((Math.floor(a) % (2 * n)) + 2 * n) % (2 * n); return p < n ? p : 2 * n - 1 - p; }; const j = (m(v, s.h) * s.w + m(u, s.w)) * 4; return [s.px[j], s.px[j + 1], s.px[j + 2]]; };

/** Lay a design on the cut. design = { body: swatch, scale, tiling?: "mirror" | "wrap", shade?: "soft" | "crisp" | "ratio" (ratio needs src: the cut's template item), trim?: swatch, trimScale?, details?: [{ img: {w,h,px RGBA}, anchor, cut }] }
 *  (scale = cut px per swatch px). Returns the layer (alpha = the cut's), its split, and where each detail went. */
export function lay(t, cl, base, design, { cut = "tee-hip" } = {}) {
  const ratio = design.shade === "ratio" ? shadeRatio(t, design.src) : null, sh = design.shade === "crisp" ? shadeCrisp(t) : shadeOf(t, cl), { reg, axes } = regions(t, base), g = S1.geometry(t.core), mat = new Uint8ClampedArray(N * 4), [bx0, by0] = g.bbox;
  for (let i = 0; i < N; i++) { if (!t.alpha[i]) continue; const x = i % W, y = (i / W) | 0, r = reg[i] < 0 ? 0 : reg[i];
    let u = x - bx0, v = y - by0;
    if (r > 0) { const a = axes[r - 1], th = a.angle - Math.PI / 2, dx = x - a.cx, dy = y - a.cy; u = dx * Math.cos(-th) - dy * Math.sin(-th); v = dx * Math.sin(-th) + dy * Math.cos(-th); }
    const useTrim = cl.band[i] && design.trim, s = useTrim ? design.trim : design.body, k = useTrim ? design.trimScale || design.scale : design.scale, c = sample(s, u / k, v / k, design.tiling || "mirror"), f = ratio ? (t.core[i] ? ratio[i] : 1) : SHADE.base + SHADE.gain * (t.core[i] ? sh[i] : 0.5);
    for (let q = 0; q < 3; q++) mat[i * 4 + q] = Math.round(c[q] * f); mat[i * 4 + 3] = t.alpha[i]; }
  // details at the cut's anchors: scaled to the anchor's width share of the body, alpha-composited, shaded like the fabric under them
  const placed = [];
  for (const d of design.details || []) { const A = ANCHORS[cut] && ANCHORS[cut][d.anchor]; if (!A) throw new Error("no anchor " + d.anchor + " on cut " + cut);
    const bw = g.bodyWidthBelowSleeves, cxm = (g.bbox[0] + g.bbox[2]) / 2, w = Math.round(A.width * bw), k = w / d.img.w, h = Math.round(d.img.h * k), x0 = Math.round(cxm + A.x * bw - w / 2), y0 = Math.round(g.bbox[1] + A.y * g.height - h / 2);
    let inside = 0, total = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const sx = Math.min(d.img.w - 1, Math.floor(x / k)), sy = Math.min(d.img.h - 1, Math.floor(y / k)), j = (sy * d.img.w + sx) * 4, al = d.img.px[j + 3] / 255; if (!al) continue; total++;
      const i = (y0 + y) * W + x0 + x; if (!t.core[i]) continue; inside++; const f = ratio ? ratio[i] : SHADE.base + SHADE.gain * sh[i]; for (let q = 0; q < 3; q++) mat[i * 4 + q] = Math.round(mat[i * 4 + q] * (1 - al) + d.img.px[j + q] * f * al); }
    placed.push({ anchor: d.anchor, box: [x0, y0, w, h], inside: +(inside / Math.max(1, total)).toFixed(4) }); }
  const layer = new Uint8ClampedArray(mat);
  for (let i = 0; i < N; i++) { const a = cl.lines[i * 4 + 3]; if (!a || !t.alpha[i]) continue; const k = a / 255; for (let c = 0; c < 3; c++) layer[i * 4 + c] = Math.round(cl.lines[i * 4 + c] * k + layer[i * 4 + c] * (1 - k)); }
  const tb = new Uint8ClampedArray(N * 4), sl = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) if (layer[i * 4 + 3]) (base.arms[i * 4 + 3] >= 128 ? sl : tb).set(layer.subarray(i * 4, i * 4 + 4), i * 4);
  return { material: mat, layer, layers: { topBody: tb, sleeves: sl }, placed };
}

/** D-262 — automatic checks on a swatch ITSELF (the fixed alpha says nothing about what is painted inside it):
 *  seam: the step across each wrap-around edge against the swatch's own large steps in the same direction (its 90th percentile):
 *        a seamless tile wraps like its inside does (a stripe boundary at the edge is fine); a cut-out picture does not;
 *  flatness: the spread of the four quadrants' mean luminance — broad shading or baked folds; a pattern whose period fits the
 *        swatch is flat by this measure (narrow pleats are not caught: they are a visual question);
 *  details: faint drawn shapes on the swatch itself — pixels at least 12 below their 7×7 mean and 6 below both sides 3 px away
 *        (thin, ≤ 4 px), grouped; a group whose box is ≥ 10 px and ≤ half the swatch on both axes is a detail (a pocket edge, a
 *        print); an all-over pattern's lines span the swatch and are not counted. A detail found is a fault; one not found is not
 *        proof of absence. */
export function swatchChecks(s) {
  const lum = new Float64Array(s.w * s.h); for (let i = 0; i < s.w * s.h; i++) lum[i] = 0.299 * s.px[i * 4] + 0.587 * s.px[i * 4 + 1] + 0.114 * s.px[i * 4 + 2];
  const L = (x, y) => lum[y * s.w + x], p90 = (a) => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length * 0.9)]; };
  const rowStep = (y1, y2) => { let t = 0; for (let x = 0; x < s.w; x++) t += Math.abs(L(x, y1) - L(x, y2)); return t / s.w; }, colStep = (x1, x2) => { let t = 0; for (let y = 0; y < s.h; y++) t += Math.abs(L(x1, y) - L(x2, y)); return t / s.h; };
  const rows = [], cols = []; for (let y = 0; y < s.h - 1; y++) rows.push(rowStep(y, y + 1)); for (let x = 0; x < s.w - 1; x++) cols.push(colStep(x, x + 1));
  const wrapV = rowStep(s.h - 1, 0), wrapH = colStep(s.w - 1, 0), limV = Math.max(2, 1.5 * p90(rows)), limH = Math.max(2, 1.5 * p90(cols));
  const hw = s.w >> 1, hh = s.h >> 1, q = [[0, 0], [hw, 0], [0, hh], [hw, hh]].map(([x0, y0]) => { let t = 0; for (let y = y0; y < y0 + hh; y++) for (let x = x0; x < x0 + hw; x++) t += L(x, y); return t / (hw * hh); });
  const broad = Math.max(...q) - Math.min(...q);
  const mean = (x, y) => { let t = 0, n = 0; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < s.w && yy < s.h) { t += L(xx, yy); n++; } } return t / n; };
  const thin = (x, y, dx, dy) => { const xa = x - 3 * dx, ya = y - 3 * dy, xb = x + 3 * dx, yb = y + 3 * dy; if (xa < 0 || ya < 0 || xb < 0 || yb < 0 || xa >= s.w || xb >= s.w || ya >= s.h || yb >= s.h) return false;
    if (!(L(x, y) <= Math.min(L(xa, ya), L(xb, yb)) - 6)) return false; let run = 1; for (const sg of [-1, 1]) for (let k = 1; k <= 4; k++) { const xx = x + sg * k * dx, yy = y + sg * k * dy; if (xx < 0 || yy < 0 || xx >= s.w || yy >= s.h || L(xx, yy) > L(x, y) + 6) break; run++; } return run <= 4; };
  const m = new Uint8Array(s.w * s.h); for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (L(x, y) <= mean(x, y) - 12 && (thin(x, y, 1, 0) || thin(x, y, 0, 1) || (thin(x, y, 1, 1) && thin(x, y, 1, -1)))) m[y * s.w + x] = 1;
  const seen = new Uint8Array(m.length), details = [];
  for (let st = 0; st < m.length; st++) { if (!m[st] || seen[st]) continue; const qq = [st]; seen[st] = 1; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, n = 0;
    while (qq.length) { const i = qq.pop(), x = i % s.w, y = (i / s.w) | 0; n++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if ((dx || dy) && xx >= 0 && yy >= 0 && xx < s.w && yy < s.h && m[yy * s.w + xx] && !seen[yy * s.w + xx]) { seen[yy * s.w + xx] = 1; qq.push(yy * s.w + xx); } } }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1; if (n >= 12 && bw >= 10 && bh >= 10 && bw <= s.w / 2 && bh <= s.h / 2) details.push({ box: [x0, y0, bw, bh], px: n }); }
  return { seam: { vertical: +wrapV.toFixed(2), verticalLimit: +limV.toFixed(2), horizontal: +wrapH.toFixed(2), horizontalLimit: +limH.toFixed(2) }, broadLuminance: +broad.toFixed(1), details: details.length, detailBoxes: details.slice(0, 5),
    seamless: wrapV <= limV && wrapH <= limH, flat: broad <= 8, noDetails: details.length === 0 };
}
