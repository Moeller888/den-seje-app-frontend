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

/** The regions of a top: the body, and each sleeve with its arm's direction (principal axis of the sleeve's pixels). */
export function regions(t, base) {
  const reg = new Int8Array(N).fill(-1), acc = [0, 1].map(() => ({ n: 0, x: 0, y: 0, xx: 0, yy: 0, xy: 0 })), cx = W / 2;
  for (let i = 0; i < N; i++) { if (!t.core[i]) continue; if (base.arms[i * 4 + 3] >= 128) { const k = i % W < cx ? 0 : 1, x = i % W, y = (i / W) | 0, a = acc[k]; reg[i] = 1 + k; a.n++; a.x += x; a.y += y; a.xx += x * x; a.yy += y * y; a.xy += x * y; } else reg[i] = 0; }
  const axes = acc.map((a) => { if (!a.n) return { angle: 0, cx: 0, cy: 0 }; const mx = a.x / a.n, my = a.y / a.n, sxx = a.xx / a.n - mx * mx, syy = a.yy / a.n - my * my, sxy = a.xy / a.n - mx * my;
    return { angle: 0.5 * Math.atan2(2 * sxy, sxx - syy), cx: mx, cy: my }; });
  return { reg, axes };
}

const sample = (s, u, v) => { const m = (a, n) => { const p = ((Math.floor(a) % (2 * n)) + 2 * n) % (2 * n); return p < n ? p : 2 * n - 1 - p; }; const j = (m(v, s.h) * s.w + m(u, s.w)) * 4; return [s.px[j], s.px[j + 1], s.px[j + 2]]; };

/** Lay a design on the cut. design = { body: swatch, scale, trim?: swatch, trimScale?, details?: [{ img: {w,h,px RGBA}, anchor, cut }] }
 *  (scale = cut px per swatch px). Returns the layer (alpha = the cut's), its split, and where each detail went. */
export function lay(t, cl, base, design, { cut = "tee-hip" } = {}) {
  const sh = shadeOf(t, cl), { reg, axes } = regions(t, base), g = S1.geometry(t.core), mat = new Uint8ClampedArray(N * 4), [bx0, by0] = g.bbox;
  for (let i = 0; i < N; i++) { if (!t.alpha[i]) continue; const x = i % W, y = (i / W) | 0, r = reg[i] < 0 ? 0 : reg[i];
    let u = x - bx0, v = y - by0;
    if (r > 0) { const a = axes[r - 1], th = a.angle - Math.PI / 2, dx = x - a.cx, dy = y - a.cy; u = dx * Math.cos(-th) - dy * Math.sin(-th); v = dx * Math.sin(-th) + dy * Math.cos(-th); }
    const useTrim = cl.band[i] && design.trim, s = useTrim ? design.trim : design.body, k = useTrim ? design.trimScale || design.scale : design.scale, c = sample(s, u / k, v / k), f = SHADE.base + SHADE.gain * (t.core[i] ? sh[i] : 0.5);
    for (let q = 0; q < 3; q++) mat[i * 4 + q] = Math.round(c[q] * f); mat[i * 4 + 3] = t.alpha[i]; }
  // details at the cut's anchors: scaled to the anchor's width share of the body, alpha-composited, shaded like the fabric under them
  const placed = [];
  for (const d of design.details || []) { const A = ANCHORS[cut] && ANCHORS[cut][d.anchor]; if (!A) throw new Error("no anchor " + d.anchor + " on cut " + cut);
    const bw = g.bodyWidthBelowSleeves, cxm = (g.bbox[0] + g.bbox[2]) / 2, w = Math.round(A.width * bw), k = w / d.img.w, h = Math.round(d.img.h * k), x0 = Math.round(cxm + A.x * bw - w / 2), y0 = Math.round(g.bbox[1] + A.y * g.height - h / 2);
    let inside = 0, total = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const sx = Math.min(d.img.w - 1, Math.floor(x / k)), sy = Math.min(d.img.h - 1, Math.floor(y / k)), j = (sy * d.img.w + sx) * 4, al = d.img.px[j + 3] / 255; if (!al) continue; total++;
      const i = (y0 + y) * W + x0 + x; if (!t.core[i]) continue; inside++; const f = SHADE.base + SHADE.gain * sh[i]; for (let q = 0; q < 3; q++) mat[i * 4 + q] = Math.round(mat[i * 4 + q] * (1 - al) + d.img.px[j + q] * f * al); }
    placed.push({ anchor: d.anchor, box: [x0, y0, w, h], inside: +(inside / Math.max(1, total)).toFixed(4) }); }
  const layer = new Uint8ClampedArray(mat);
  for (let i = 0; i < N; i++) { const a = cl.lines[i * 4 + 3]; if (!a || !t.alpha[i]) continue; const k = a / 255; for (let c = 0; c < 3; c++) layer[i * 4 + c] = Math.round(cl.lines[i * 4 + c] * k + layer[i * 4 + c] * (1 - k)); }
  const tb = new Uint8ClampedArray(N * 4), sl = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) if (layer[i * 4 + 3]) (base.arms[i * 4 + 3] >= 128 ? sl : tb).set(layer.subarray(i * 4, i * 4 + 4), i * 4);
  return { material: mat, layer, layers: { topBody: tb, sleeves: sl }, placed };
}
