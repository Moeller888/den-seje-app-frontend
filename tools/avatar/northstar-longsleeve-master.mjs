// D-333 PROTOTYPE — ONE REUSABLE MASTER FOR A LONG-SLEEVED TOP (offline; no image call; not the production method; nothing published).
// The cut is the existing green sweater (top-sweater-green, D-207's pilot item processed by method d239 in D-239's final1-pilot run,
// technically OK): a long-sleeved crew-neck top with drawn set-in armhole seams, rib bands at the neck, the cuffs and the hem, and
// clear fold strokes on a mid-tone fabric (median luminance about 96). It is the only long-sleeved source with a usable basis (D-333).
// The master is D-264's tee master, unchanged in method, with the per-cut data of this cut:
//   seams, armpit and warp  — the one-time per-cut SPEC below (the armhole seams entered once by hand as a polyline per side, then
//                             refined to the darkest thin pixel of each row in the cut item, exactly as D-264);
//   buildMasterFor(spec,…)  — D-264's buildMaster with the per-cut data as a parameter. northstar-tee-master.mjs is pinned by D-267's and
//                             D-270's plans and stays byte-identical; buildMasterFor(TM.SPEC, …) reproduces TM.buildMaster exactly
//                             (tested on a synthetic cut), so only the data differ;
//   render                  — TM.render unchanged (body colour or swatch; the cut's own contour on top; split by C's arms into the
//                             body and sleeve layers, the production rule);
//   chest print             — D-269's placement and size rule unchanged (PF.placementBox "chest-center", PF.prepareFor, PF.placePrint):
//                             ONE placement rule, the same fractions of the cut's geometry as on the tee.
// Per design only the colour and the print change.
import * as WR from "./northstar-wardrobe.mjs";
import * as TM from "./northstar-tee-master.mjs";

const { W, N } = WR, H = N / W;
export const REVISION = "ls-master-v1";
/** The cut's source: the existing processed item (private; its report pins every layer by sha256). */
export const SOURCE = Object.freeze({ item: "top-sweater-green", run: "d-239-targeted-correction/final1-pilot", method: "d239", cut: "sweater-long" });
/** The one-time per-cut data (entered by hand once, then refined automatically; never per design). */
export const SPEC = Object.freeze({
  cut: "sweater-long", source: SOURCE.item,
  // the drawn armhole seams (canvas px): shoulder point → armpit, where the sleeve and the body part below it
  seams: { left: [[380, 500], [392, 540], [399, 560], [405, 585], [408, 620], [408, 650]], right: [[642, 500], [631, 540], [624, 560], [616, 585], [613, 620], [613, 650]] },
  seamSearchPx: 8, extendPx: 14,
  // below the armpit the sleeve hangs beside the body with a gap: the seam is closed straight down into it
  armpitOut: { left: [0, 1], right: [0, 1] },
  warp: { cylinder: 0.10, foldMaxPx: 3, foldBlur: 14 },
  anchors: Object.freeze({}),
});

const lumOf = (P, i) => 0.299 * P[i * 4] + 0.587 * P[i * 4 + 1] + 0.114 * P[i * 4 + 2];
const union = (layers) => { const u = new Uint8ClampedArray(N * 4); for (const L of Object.values(layers)) for (let i = 0; i < N; i++) if (L[i * 4 + 3]) u.set(L.subarray(i * 4, i * 4 + 4), i * 4); return u; };

/** D-264's buildMaster with the per-cut data as a parameter (the lines are TM.buildMaster's; only SPEC → spec). */
export function buildMasterFor(spec, t, src) {
  const item = union(src.layers), core = t.core;
  const seams = { left: TM.seamLine(item, core, spec.seams.left, { search: spec.seamSearchPx, extend: spec.extendPx, armpitOut: spec.armpitOut.left }), right: TM.seamLine(item, core, spec.seams.right, { search: spec.seamSearchPx, extend: spec.extendPx, armpitOut: spec.armpitOut.right }) }, barrier = new Uint8Array(N);
  for (const line of Object.values(seams)) for (let k = 0; k + 1 < line.length; k++) { const [ax, ay] = line[k], [bx, by] = line[k + 1], n = Math.max(Math.abs(bx - ax), Math.abs(by - ay), 1);
    for (let s2 = 0; s2 <= n; s2++) { const x = Math.round(ax + ((bx - ax) * s2) / n), y = Math.round(ay + ((by - ay) * s2) / n); for (const d of [0, 1]) { const i = y * W + x + d; if (i >= 0 && i < N) barrier[i] = 1; } } }
  const comp = new Int32Array(N).fill(-1), sizes = []; for (let s = 0; s < N; s++) { if (!core[s] || barrier[s] || comp[s] >= 0) continue; const id = sizes.length, q = [s]; comp[s] = id; let n = 0;
    while (q.length) { const i = q.pop(), x = i % W; n++; for (const j of [i - 1, i + 1, i - W, i + W]) { if (j < 0 || j >= N || Math.abs((j % W) - x) > 1 || !core[j] || barrier[j] || comp[j] >= 0) continue; comp[j] = id; q.push(j); } } sizes.push(n); }
  const outsideOf = (line, sign) => { const [x, y] = line[Math.floor(line.length / 2)]; let best = -1; for (let d = 3; d < 90; d++) { const i = y * W + x + sign * d; if (core[i] && comp[i] >= 0 && (best < 0 || sizes[comp[i]] > sizes[best])) best = comp[i]; } return best; };
  const cl = outsideOf(seams.left, -1), cr = outsideOf(seams.right, 1), panel = new Int8Array(N).fill(-1);
  for (let i = 0; i < N; i++) if (core[i]) panel[i] = comp[i] === cl ? 1 : comp[i] === cr ? 2 : 0;
  for (let i = 0; i < N; i++) if (core[i] && panel[i] < 0) panel[i] = 0;
  const v = []; for (let i = 0; i < N; i++) if (panel[i] === 0 && !t.contour[i * 4 + 3]) v.push(lumOf(item, i)); v.sort((a, b) => a - b); const base = v[Math.floor(v.length * 0.6)] || 1;
  const ratio = new Float32Array(N); for (let i = 0; i < N; i++) if (t.alpha[i]) ratio[i] = item[i * 4 + 3] ? Math.min(1.12, Math.max(0.25, lumOf(item, i) / base)) : 1;
  const r = spec.warp.foldBlur, src0 = new Float32Array(N); for (let i = 0; i < N; i++) src0[i] = core[i] && !t.contour[i * 4 + 3] ? Math.min(1, ratio[i]) : 1;
  const I = new Float64Array((W + 1) * (H + 1)), C = new Float64Array((W + 1) * (H + 1)); for (let y = 0; y < H; y++) { let rs = 0, rc = 0; for (let x = 0; x < W; x++) { const i = y * W + x, ok = core[i] ? 1 : 0; rs += src0[i] * ok; rc += ok; const k = (y + 1) * (W + 1) + x + 1; I[k] = I[k - W - 1] + rs; C[k] = C[k - W - 1] + rc; } }
  const box = (A, x0, y0, x1, y1) => A[y1 * (W + 1) + x1] - A[y0 * (W + 1) + x1] - A[y1 * (W + 1) + x0] + A[y0 * (W + 1) + x0];
  const soft = new Float32Array(N); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (!core[i]) continue; const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r), x1 = Math.min(W, x + r + 1), y1 = Math.min(H, y + r + 1), c = box(C, x0, y0, x1, y1); soft[i] = c ? box(I, x0, y0, x1, y1) / c : 1; }
  const ext = [0, 1, 2].map(() => ({ x0: W, x1: 0 })); for (let i = 0; i < N; i++) if (panel[i] >= 0) { const e = ext[panel[i]], x = i % W; if (x < e.x0) e.x0 = x; if (x > e.x1) e.x1 = x; }
  const gxy = new Float32Array(N * 2); let gmax = 1e-6; for (let i = 4 * W; i < N - 4 * W; i++) { if (!core[i]) continue; const a = core[i - 4] ? soft[i - 4] : soft[i], b = core[i + 4] ? soft[i + 4] : soft[i], c2 = core[i - 4 * W] ? soft[i - 4 * W] : soft[i], d = core[i + 4 * W] ? soft[i + 4 * W] : soft[i];
    gxy[i * 2] = (b - a) / 8; gxy[i * 2 + 1] = (d - c2) / 8; gmax = Math.max(gmax, Math.hypot(gxy[i * 2], gxy[i * 2 + 1])); }
  const disp = new Float32Array(N * 2); for (let i = 0; i < N; i++) { if (panel[i] < 0) continue; const x = i % W, e = ext[panel[i]], c = (e.x0 + e.x1) / 2, hw = Math.max(1, (e.x1 - e.x0) / 2), u = (x - c) / hw;
    disp[i * 2 + 1] = spec.warp.cylinder * hw * (1 - Math.cos(Math.min(1, Math.abs(u)) * Math.PI / 2)) * (panel[i] === 0 ? 1 : 0.5);
    disp[i * 2] += (spec.warp.foldMaxPx * gxy[i * 2]) / gmax; disp[i * 2 + 1] += (spec.warp.foldMaxPx * gxy[i * 2 + 1]) / gmax; }
  const axes = [1, 2].map((k) => { let n = 0, sx = 0, sy = 0, xx = 0, yy = 0, xy = 0; for (let i = 0; i < N; i++) if (panel[i] === k) { const x = i % W, y = (i / W) | 0; n++; sx += x; sy += y; xx += x * x; yy += y * y; xy += x * y; }
    const mx = sx / n, my = sy / n; return { angle: 0.5 * Math.atan2(2 * (xy / n - mx * my), xx / n - mx * mx - (yy / n - my * my)), origin: (k === 1 ? seams.left : seams.right)[Math.floor((k === 1 ? seams.left : seams.right).length / 2)], px: n }; });
  return { revision: spec === TM.SPEC ? TM.REVISION : REVISION, spec, seams, panel, ratio, disp, axes, base, sizes: { body: (() => { let n = 0; for (let i = 0; i < N; i++) if (panel[i] === 0) n++; return n; })(), ...Object.fromEntries([1, 2].map((k) => [k === 1 ? "left" : "right", axes[k - 1].px])) } };
}
