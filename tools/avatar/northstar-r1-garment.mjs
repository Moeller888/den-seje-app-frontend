// D-253 R1 — GARMENT GENERATED APART FROM THE BODY: the deterministic half of the method (templates, registration, composition,
// measures). No image call is made here. The idea: a CUT is a fixed garment form in C's coordinates (a template: silhouette, alpha,
// fold shading, layer split, shadow and covering), taken once from an existing extracted item; a generated garment only supplies
// the MATERIAL, pattern and details inside that form. So placement, proportions, alpha and seams come from the template and the
// layer contract, never from a prompt, and the fit never depends on telling the garment's colour from skin.
//   template  — from an item's production layers (the pipeline's own extraction, which the runtime layers of D-242 equal byte for
//               byte): alpha = the layers' union alpha with enclosed holes of the solid core closed; shade = their luminance
//               normalised over the core (folds, not colour); the item's shadow and covering are kept with the cut.
//   canvas    — what a call would send as Image 1: the silhouette painted in its fold shading, flat grey, background transparent.
//   register  — the ONLY geometric correction allowed: one integer translation (|dx|, |dy| ≤ maxShift) maximising the template
//               core covered by the output's opaque paint (ties: their middle). No scaling, rotation, warp or per-item parameter.
//   contour   — the cut's own drawn outline (the template item's ink at the silhouette edge) belongs to the cut, so the seams
//               behave as the cut's whatever outline the output draws.
//   compose   — the layer: alpha = the template's alpha; colour = the output's own pixel (shifted) where it is opaque, else the
//               nearest opaque output pixel within EDGE_PX for the template's edge antialias only; an unpainted core pixel is a
//               HOLE (measured, never filled).
//               A top is split into body and sleeves by C's arms (the production rule).
// Every measure is about the method, not the model: simulated outputs prove the composition only.
import * as WR from "./northstar-wardrobe.mjs";
import * as BF from "./northstar-base-figure.mjs";
import * as BC from "./northstar-base-figure-c.mjs";
import * as IP from "./northstar-item-pilot.mjs";

const { W, N } = WR, H = N / W;
export const R1_REVISION = "r1-v1";
export const LIMITS = Object.freeze({
  maxShift: 16,              // px, the registration search window
  holeShare: 0.005,          // template core pixels the output leaves unpainted after registration: at most 0.5 %
  outsideShare: 0.25,        // output paint outside the template, relative to the core: above this it is not the cut's garment
  edgePx: 2,                 // edge antialias: colour from the nearest opaque output pixel within 2 px
  contourPx: 3,              // the cut's own drawn outline: ink pixels of the template item within 3 px of the silhouette edge
  stopCoverage: 0.80,        // a call covering less of the core than this ignored the template: the remaining calls stop
});
export const RULES = Object.freeze({
  placement: "from the template only; one integer translation (|dx|,|dy| ≤ " + LIMITS.maxShift + ") maximising the template core covered by the output's opaque paint, the middle of the tied shifts; no scaling, rotation or warp",
  contour: "the cut's own drawn outline (the template item's ink pixels within " + LIMITS.contourPx + " px of the silhouette edge) is part of the cut and replaces the output there: seams behave as the cut's",
  alpha: "the template's alpha, never the output's",
  colour: "the output's own pixels inside the template; edge pixels take the nearest opaque output pixel within " + LIMITS.edgePx + " px; anything else is a hole, measured and never filled",
  outside: "output paint outside the template is discarded and measured",
  split: "a top's pixels over C's arms are its sleeves (production rule)",
  shadowAndCovering: "the cut's own (from the template item), unchanged",
  forbidden: "no per-item painting, mask, deformation, threshold or retouch",
});

const lum = (P, i) => 0.299 * P[i * 4] + 0.587 * P[i * 4 + 1] + 0.114 * P[i * 4 + 2];

/** A cut's template from an item's layers (RGBA, 1024×1536 each). */
export function templateFromLayers(layers, { shadow = null, covering = "none", category, cut } = {}) {
  const alpha = new Uint8Array(N), core = new Uint8Array(N);
  for (const L of Object.values(layers)) for (let i = 0; i < N; i++) { const a = L[i * 4 + 3]; if (a > alpha[i]) alpha[i] = a; }
  for (let i = 0; i < N; i++) if (alpha[i] >= 128) core[i] = 1;
  // close holes enclosed by the core (a buttonhole of the old design is not part of the cut)
  const outside = new Uint8Array(N), st = []; for (let x = 0; x < W; x++) for (const y of [0, H - 1]) { const i = y * W + x; if (!core[i] && !outside[i]) { outside[i] = 1; st.push(i); } }
  for (let y = 0; y < H; y++) for (const x of [0, W - 1]) { const i = y * W + x; if (!core[i] && !outside[i]) { outside[i] = 1; st.push(i); } }
  while (st.length) { const i = st.pop(), x = i % W; for (const j of [i - 1, i + 1, i - W, i + W]) { if (j < 0 || j >= N || Math.abs((j % W) - x) > 1 || core[j] || outside[j]) continue; outside[j] = 1; st.push(j); } }
  let closed = 0; for (let i = 0; i < N; i++) if (!core[i] && !outside[i]) { core[i] = 1; alpha[i] = 255; closed++; }
  // fold shading: the luminance of the item's own pixels over the core, normalised to 0..1 (5th..95th percentile)
  const src = new Uint8ClampedArray(N * 4); for (const L of Object.values(layers)) for (let i = 0; i < N; i++) if (L[i * 4 + 3] >= 128) src.set(L.subarray(i * 4, i * 4 + 4), i * 4);
  const vals = []; for (let i = 0; i < N; i++) if (core[i] && src[i * 4 + 3]) vals.push(lum(src, i)); vals.sort((a, b) => a - b);
  const lo = vals.length ? vals[Math.floor(vals.length * 0.05)] : 0, hi = vals.length ? vals[Math.floor(vals.length * 0.95)] : 255, shade = new Float32Array(N);
  for (let i = 0; i < N; i++) if (core[i]) shade[i] = src[i * 4 + 3] ? Math.min(1, Math.max(0, (lum(src, i) - lo) / Math.max(1, hi - lo))) : 0.5;
  // the cut's contour: the item's own ink within contourPx of the silhouette edge (its outline at free edges and at seams)
  const notCore = new Uint8Array(N); for (let i = 0; i < N; i++) notCore[i] = core[i] ? 0 : 1;
  const band = WR.maskOps.dilate(notCore, LIMITS.contourPx), contour = new Uint8ClampedArray(N * 4); let contourPx = 0;
  for (let i = 0; i < N; i++) if (alpha[i] && band[i] && src[i * 4 + 3] && BF.classify(src, i) === "ink") { contour.set(src.subarray(i * 4, i * 4 + 3), i * 4); contour[i * 4 + 3] = alpha[i]; contourPx++; }
  let corePx = 0; for (let i = 0; i < N; i++) if (core[i]) corePx++;
  return { revision: R1_REVISION, category, cut, alpha, core, shade, contour, shadow, covering, closedHolePx: closed, corePx, contourPx };
}

/** Image 1 of a call: the silhouette in its fold shading, neutral grey (0.35..0.75 grey), alpha = the template's. */
export function templateCanvas(t) {
  const o = new Uint8ClampedArray(N * 4);
  for (let i = 0; i < N; i++) { if (!t.alpha[i]) continue; const g = Math.round(255 * (0.35 + 0.4 * t.shade[i])); o[i * 4] = o[i * 4 + 1] = o[i * 4 + 2] = g; o[i * 4 + 3] = t.alpha[i]; }
  return o;
}

/** The integer translation of the output onto the template: the most template core covered by the output's opaque paint. A
 *  uniform spill covers the core at a whole disc of shifts: the middle of that tied set is taken (exact for a uniform spill). */
export function register(out, t, { maxShift = LIMITS.maxShift } = {}) {
  const om = new Uint8Array(N); let oPx = 0; for (let i = 0; i < N; i++) if (out[i * 4 + 3] >= 128) { om[i] = 1; oPx++; }
  const core = []; for (let i = 0; i < N; i++) if (t.core[i]) core.push(i);
  const covAt = (dx, dy, step = 1) => { let inter = 0, n = 0; for (let k = 0; k < core.length; k += step) { n++; const i = core[k], x = (i % W) - dx, y = ((i / W) | 0) - dy; if (x >= 0 && x < W && y >= 0 && y < H && om[y * W + x]) inter++; } return inter / Math.max(1, n); };
  let c0 = { dx: 0, dy: 0, cov: -1 };
  for (let dy = -maxShift; dy <= maxShift; dy += 4) for (let dx = -maxShift; dx <= maxShift; dx += 4) { const v = covAt(dx, dy, 7); if (v > c0.cov) c0 = { dx, dy, cov: v }; }
  const fine = []; let top = -1;
  for (let dy = Math.max(-maxShift, c0.dy - 6); dy <= Math.min(maxShift, c0.dy + 6); dy++) for (let dx = Math.max(-maxShift, c0.dx - 6); dx <= Math.min(maxShift, c0.dx + 6); dx++) { const v = covAt(dx, dy); fine.push({ dx, dy, cov: v }); if (v > top) top = v; }
  const tied = fine.filter((f) => f.cov >= top - 1e-6), mx = tied.reduce((s, f) => s + f.dx, 0) / tied.length, my = tied.reduce((s, f) => s + f.dy, 0) / tied.length;
  const best = tied.reduce((b, f) => (Math.hypot(f.dx - mx, f.dy - my) < Math.hypot(b.dx - mx, b.dy - my) ? f : b), tied[0]);
  const inter = best.cov * core.length, iou = inter / Math.max(1, core.length + oPx - inter);
  return { dx: best.dx, dy: best.dy, coverage: +best.cov.toFixed(4), iou: +iou.toFixed(4), tiedShifts: tied.length, atWindowEdge: Math.abs(best.dx) === maxShift || Math.abs(best.dy) === maxShift, outputOpaquePx: oPx };
}

/** The layer(s) of an output on a template, with the measures. base supplies C's arms for a top's split. */
export function compose(out, t, base, { shift = null, edgePx = LIMITS.edgePx } = {}) {
  const reg = shift || register(out, t), { dx, dy } = reg, at = (x, y) => (x - dx >= 0 && x - dx < W && y - dy >= 0 && y - dy < H ? (y - dy) * W + (x - dx) : -1);
  const layer = new Uint8ClampedArray(N * 4), hole = new Uint8Array(N); let holes = 0, edgeFilled = 0, outsidePx = 0;
  for (let i = 0; i < N; i++) { if (!t.alpha[i]) continue; const x = i % W, y = (i / W) | 0, j = at(x, y);
    if (j >= 0 && out[j * 4 + 3] >= 128) { layer.set(out.subarray(j * 4, j * 4 + 3), i * 4); layer[i * 4 + 3] = t.alpha[i]; continue; }
    if (t.core[i]) { hole[i] = 1; holes++; continue; }                     // the solid core is the output's own paint or a hole
    let src = -1, bd = 1e9; for (let ey = -edgePx; ey <= edgePx; ey++) for (let ex = -edgePx; ex <= edgePx; ex++) { const k = at(x + ex, y + ey), d = ex * ex + ey * ey; if (k >= 0 && out[k * 4 + 3] >= 128 && d < bd) { bd = d; src = k; } }
    if (src >= 0) { layer.set(out.subarray(src * 4, src * 4 + 3), i * 4); layer[i * 4 + 3] = t.alpha[i]; edgeFilled++; }
    else hole[i] = 1; }
  let contourSet = 0; for (let i = 0; i < N; i++) if (t.contour[i * 4 + 3]) { layer.set(t.contour.subarray(i * 4, i * 4 + 4), i * 4); if (hole[i]) { hole[i] = 0; if (t.core[i]) holes--; } contourSet++; }
  for (let j = 0; j < N; j++) { if (out[j * 4 + 3] < 128) continue; const x = (j % W) + dx, y = ((j / W) | 0) + dy; if (x < 0 || x >= W || y < 0 || y >= H || !t.alpha[y * W + x]) outsidePx++; }
  let layers;
  if (t.category === "top") { const tb = new Uint8ClampedArray(N * 4), sl = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) if (layer[i * 4 + 3]) (base.arms[i * 4 + 3] >= 128 ? sl : tb).set(layer.subarray(i * 4, i * 4 + 4), i * 4); layers = { topBody: tb, sleeves: sl }; }
  else layers = t.category === "bottom" ? { pants: layer } : { shoes: layer };
  const holeShare = holes / Math.max(1, t.corePx), outsideShare = outsidePx / Math.max(1, t.corePx);
  const placement = reg.atWindowEdge || outsideShare > LIMITS.outsideShare ? "rejected" : holeShare <= LIMITS.holeShare ? "accepted" : "rejected";
  return { layers, registration: reg, placement, masks: { hole }, measures: { holeCorePx: holes, holeShare: +holeShare.toFixed(5), edgeFilledPx: edgeFilled, contourPx: contourSet, outsidePx, outsideShare: +outsideShare.toFixed(4) },
    stop: reg.coverage < LIMITS.stopCoverage, ok: placement === "accepted" };
}

/** Is the output's material more than a recolour of the template's shading? (correlation of luminance with the fold shade over
 *  the core, and edge density relative to the template's). Reported for review, never a gate. */
export function designMeasure(layer, t) {
  let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, eL = 0, eT = 0;
  for (let i = W; i < N - W; i++) { if (!t.core[i] || !layer[i * 4 + 3]) continue; const a = lum(layer, i) / 255, b = t.shade[i]; n++; sx += a; sy += b; sxx += a * a; syy += b * b; sxy += a * b;
    if (Math.abs(lum(layer, i) - lum(layer, i + 1)) > 24 || Math.abs(lum(layer, i) - lum(layer, i + W)) > 24) eL++; if (Math.abs(t.shade[i] - t.shade[i + 1]) * 255 > 24 || Math.abs(t.shade[i] - t.shade[i + W]) * 255 > 24) eT++; }
  const r = n ? (n * sxy - sx * sy) / Math.sqrt(Math.max(1e-9, (n * sxx - sx * sx) * (n * syy - sy * sy))) : 0;
  return { shadeCorrelation: +r.toFixed(3), edgeDensity: +(eL / Math.max(1, n)).toFixed(4), templateEdgeDensity: +(eT / Math.max(1, n)).toFixed(4), recolourOnly: r > 0.95 && eL <= eT * 1.1 };
}

/** The production checks on R1 layers: fitCheck (method d240's fit revision) with the cut's shadow and covering. */
export function checkItem(w, base, T, t, layers) {
  const M = IP.METHODS[IP.METHOD], covering = t.covering || "none", hide = BC.regionsC(w, base, T, t.category, { covering }).hidden(layers);
  const fit = BC.fitCheck(w, base, T, t.category, layers, { revision: M.fitRevision, shadow: t.shadow, hide });
  return { ok: fit.checks.filter((c) => c.axis === "fit" && !c.ok).length === 0, failed: fit.checks.filter((c) => c.axis === "fit" && !c.ok).map((c) => c.id), hide, composite: fit.composite };
}

/** One outfit with the production outfit check (method d240's outfit revision). items: [{category, layers, covering}] */
export function checkOutfit(w, base, items) {
  const min = BF.minimumItems(base.R, base.sep.lab), shoe = items.find((k) => k.category === "shoes");
  const hide = shoe && shoe.covering === "closed-footwear" ? BC.closedFootwearHidden(base, shoe.layers.shoes) : null;
  const P = BF.layerProof(w, base.R, base.Z, Object.assign({}, min, ...items.map((k) => k.layers)), { sep: base.sep, headSeam: "d201", hide, enclosure: "c-exterior" });
  const oc = BC.outfitCheck(w, base, P, { revision: IP.METHODS[IP.METHOD].outfitRevision || "d223" });
  return { ok: oc.ok, failed: oc.checks.filter((c) => !c.ok).map((c) => c.id), proof: P };
}
