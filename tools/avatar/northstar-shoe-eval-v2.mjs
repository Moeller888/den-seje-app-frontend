// D-297 — THE SHOE EVALUATION, SECOND VERSION (offline; no image call). D-296 found three faults in D-294's evaluation and one in the
// master: (1) the collar rule counted pixels, so a collar line drawn 1–2 px off failed although nothing visible changed, and a real
// fault elsewhere could hide under the count; (2) a faint glow in the source passed every rule; (3) the line measures used the PUBLISHED
// drawing's line positions, invalid for a new drawing; and the "split line" measure could not tell a change ACROSS a line (natural at a
// colour border) from a flip ALONG it (the zigzag). This module measures each apart:
//   collarCheck    — in the collar zone, the 2-D distance between the candidate's and the reference's silhouette edges (symmetric; p95,
//                    max), and the consequence on C, measured perpendicular to the edge: the thickest band painted over C's ankle (its
//                    distance outside the reference shoe), the thickest band of C's skin newly exposed (its depth inside), C's foot exposed INSIDE the shoe (2 px or more inside the reference silhouette: a notch or a hole), and
//                    background showing 2 px or more inside the reference shoe (a slit or a gap). COLLAR_RULE's tolerances: a band or an offset of
//                    up to 2 avatar px is about the drawn outline's own width and, at the largest app view (300x450 CSS at DPR 2, 0.59
//                    device px per avatar px), at most about 1.2 device px; a notch or a gap is never accepted.
//   haloMeasures / dropHalo — the source's partial-alpha pixels by their distance from the solid shoe; the rule keeps the drawn
//                    antialiasing (within HALO_RULE.keepPx source px of a solid pixel) and drops what lies farther out, whatever its alpha.
//   lineMeasures   — on the measured drawing's OWN lines (its own master classes): the line contrast per field, the line inventory
//                    (the share of the drawing's line pixels per field, so a lost seam shows), the inner line sharpness, and splitAlong.
//   splitAlong     — of the drawing's line core pixels, the share whose lightness changes by more than 0.1 ALONG the line (sampled one
//                    pixel either way along the tangent, from the drawing's own gradient): the zigzag, not the change across a line.
import * as WR from "./northstar-wardrobe.mjs";
import * as SM from "./northstar-shoe-master.mjs";
import { edgeMeasures } from "./northstar-shoe-edge-study.mjs";
import { perceptualMeasures } from "./northstar-shoe-master-study.mjs";

const { W, N } = WR, H = N / W;
export const COLLAR_ZONE = Object.freeze({ y0: 1340, y1: 1400 });
export const COLLAR_RULE = Object.freeze({ maxP95OffsetPx: 2, maxOffsetPx: 3, maxAnkleBandPx: 2, maxExposedBandPx: 2, maxInsideExposedPx: 0, maxGapPx: 0, maxCoveringChange: 0.01 });
const op = (P, i) => P[i * 4 + 3] >= 128;

/** The depth of each opaque pixel inside a silhouette (4-neighbour steps to the nearest non-opaque pixel); 0 outside. */
function depthOf(P) { const d = new Int16Array(N), q = []; for (let i = 0; i < N; i++) if (op(P, i)) d[i] = 9999; else q.push(i);
  for (let h = 0; h < q.length; h++) { const i = q[h], x = i % W; for (const j of [i - 1, i + 1, i - W, i + W]) { if (j < 0 || j >= N || Math.abs((j % W) - x) > 1 || d[j] <= d[i] + 1) continue; d[j] = d[i] + 1; q.push(j); } } return d; }
/** The silhouette edge pixels (opaque with a non-opaque 4-neighbour) in the collar zone, and their distance (8-neighbour steps) to the
 *  other shape's edge pixels: symmetric, so a collar line drawn off in either direction counts, and a vertical tip does not blow up. */
function edgeDistances(A, B) { const Z = COLLAR_ZONE, isEdge = (P, i) => op(P, i) && [i - 1, i + 1, i - W, i + W].some((j) => !op(P, j)), inZone = (i) => { const y = (i / W) | 0; return y >= Z.y0 && y < Z.y1; };
  const one = (S, T) => { const dist = new Int16Array(N).fill(9999), q = []; for (let i = W; i < N - W; i++) if (inZone(i) && isEdge(T, i)) { dist[i] = 0; q.push(i); }
    for (let h = 0; h < q.length; h++) { const i = q[h], x = i % W; if (dist[i] >= 12) continue; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const j = i + dy * W + dx; if ((!dx && !dy) || j < 0 || j >= N || Math.abs((j % W) - x) > 1 || dist[j] <= dist[i] + 1) continue; dist[j] = dist[i] + 1; q.push(j); } }
    const out = []; for (let i = W; i < N - W; i++) if (inZone(i) && isEdge(S, i)) out.push(Math.min(dist[i], 12)); return out; };
  return [...one(A, B), ...one(B, A)].sort((a, b) => a - b); }
/** The collar check of a placed candidate against the reference shoe layer, with C (base) and the covering (hidden masks). */
export function collarCheck(cand, ref, base, hidden) {
  const R = COLLAR_RULE, Z = COLLAR_ZONE, p = [], d = edgeDistances(cand, ref), depth = depthOf(ref), body = (i) => base.body[i * 4 + 3] > 0 || base.arms[i * 4 + 3] > 0;
  // the outside distance of each pixel from the reference shoe (8-neighbour steps), for the thickness of a band painted over the ankle
  const outside = new Int16Array(N).fill(9999), q = []; for (let i = 0; i < N; i++) if (op(ref, i)) { outside[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) { const i = q[h], x = i % W; if (outside[i] >= 12) continue; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const j = i + dy * W + dx; if ((!dx && !dy) || j < 0 || j >= N || Math.abs((j % W) - x) > 1 || outside[j] <= outside[i] + 1) continue; outside[j] = outside[i] + 1; q.push(j); } }
  const p95 = d.length ? d[Math.floor(d.length * 0.95)] : 0, max = d.length ? d[d.length - 1] : 0;
  // band thickness PERPENDICULAR to the edge: paint over the ankle by its distance outside the reference shoe, newly exposed skin by its
  // depth inside it (a vertical run along a near-vertical edge would count a 1 px sideways offset as a thick band)
  let ankleBand = 0, exposedBand = 0, ankle = 0, exposed = 0, inside = 0, gap = 0;
  for (let i = (Z.y0 - 20) * W; i < 1420 * W; i++) {
    if (op(cand, i) && ref[i * 4 + 3] < 16 && body(i)) { ankle++; ankleBand = Math.max(ankleBand, Math.min(outside[i], 12)); }
    if (hidden.ref[i] && !hidden.cand[i]) { exposed++; exposedBand = Math.max(exposedBand, Math.min(depth[i], 12)); if (depth[i] >= 2) inside++; } }
  // background showing 2 px or more inside the reference shoe: neither the candidate's paint nor C (C's foot is cut away under a closed shoe)
  for (let i = 0; i < N; i++) if (depth[i] >= 2 && !op(cand, i) && (!body(i) || hidden.cand[i])) gap++;
  let n0 = 0, diff = 0; for (let i = 0; i < N; i++) { if (hidden.ref[i]) n0++; if (hidden.ref[i] !== hidden.cand[i]) diff++; }
  const m = { edgePx: d.length, p95OffsetPx: p95, maxOffsetPx: max, ankleBandPx: ankleBand, anklePx: ankle, exposedBandPx: exposedBand, exposedPx: exposed, insideExposedPx: inside, gapPx: gap, coveringChange: +(diff / Math.max(1, n0)).toFixed(4) };
  if (p95 > R.maxP95OffsetPx) p.push("the collar edge is " + p95 + " px off (p95)"); if (max > R.maxOffsetPx) p.push("the collar edge is up to " + max + " px off");
  if (ankleBand > R.maxAnkleBandPx) p.push("a band " + ankleBand + " px thick is painted over C's ankle"); if (exposedBand > R.maxExposedBandPx) p.push("a band " + exposedBand + " px thick of C's ankle is newly exposed");
  if (inside > R.maxInsideExposedPx) p.push(inside + " px of C's foot exposed inside the shoe (a notch or hole)"); if (gap > R.maxGapPx) p.push(gap + " px of background inside the shoe (a slit or gap)");
  if (m.coveringChange > R.maxCoveringChange) p.push("the covering changes by " + (100 * m.coveringChange).toFixed(1) + " %");
  return { ok: !p.length, problems: p, measures: m };
}

/** The partial-alpha pixels of a source image by their distance (source px) from the nearest solid pixel (alpha >= 250). */
function distanceToSolid(img) { const n = img.w * img.h, dist = new Int16Array(n).fill(9999), q = [];
  for (let i = 0; i < n; i++) if (img.px[i * 4 + 3] >= 250) { dist[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) { const i = q[h], x = i % img.w; for (const j of [i - 1, i + 1, i - img.w, i + img.w]) { if (j < 0 || j >= n || Math.abs((j % img.w) - x) > 1 || dist[j] <= dist[i] + 1) continue; dist[j] = dist[i] + 1; q.push(j); } }
  return dist; }
export const HALO_BINS = Object.freeze([[1, 1], [2, 2], [3, 3], [4, 8], [9, 16], [17, 9998]]);
export function haloMeasures(img) {
  const dist = distanceToSolid(img), bins = HALO_BINS.map(([a, b]) => ({ from: a, to: b, px: 0, alphaSum: 0, alphaMax: 0, lightSum: 0 }));
  for (let i = 0; i < img.w * img.h; i++) { const a = img.px[i * 4 + 3]; if (!a || a >= 250) continue; const b = bins.find((x) => dist[i] >= x.from && dist[i] <= x.to); if (!b) continue; b.px++; b.alphaSum += a; b.alphaMax = Math.max(b.alphaMax, a); b.lightSum += 0.299 * img.px[i * 4] + 0.587 * img.px[i * 4 + 1] + 0.114 * img.px[i * 4 + 2]; }
  return bins.map((b) => ({ distancePx: b.from === b.to ? String(b.from) : b.from + "–" + (b.to > 999 ? "∞" : b.to), px: b.px, meanAlpha: b.px ? +(b.alphaSum / b.px).toFixed(1) : 0, maxAlpha: b.alphaMax, meanLightness: b.px ? Math.round(b.lightSum / b.px) : 0 }));
}
/** The halo rules: "distance" keeps partial alpha within keepPx source px of a solid pixel (the drawn antialiasing) and drops the rest;
 *  "floor" drops alpha below a fixed value everywhere (the D-296 hypothesis, kept for comparison). Colour is untouched; alpha only. */
export const HALO_RULE = Object.freeze({ kind: "distance", keepPx: 3 });
export function dropHalo(img, rule = HALO_RULE) { const o = { w: img.w, h: img.h, px: Uint8ClampedArray.from(img.px) };
  if (rule.kind === "floor") { for (let i = 0; i < img.w * img.h; i++) if (o.px[i * 4 + 3] < rule.alpha) o.px[i * 4 + 3] = 0; return o; }
  const dist = distanceToSolid(img); for (let i = 0; i < img.w * img.h; i++) if (o.px[i * 4 + 3] && o.px[i * 4 + 3] < 250 && dist[i] > rule.keepPx) o.px[i * 4 + 3] = 0; return o; }
/** The halo in the avatar: partial pixels more than 1 px outside the reference's opaque shoe, and the silhouette edge's antialiasing. */
export function haloInAvatar(placed, ref) { const near = new Uint8Array(N); for (let i = 0; i < N; i++) if (op(ref, i) || op(placed, i)) { const x = i % W, y = (i / W) | 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const j = (y + dy) * W + x + dx; if (j >= 0 && j < N) near[j] = 1; } }
  let n = 0, aSum = 0; for (let i = 0; i < N; i++) { const a = placed[i * 4 + 3]; if (a && a < 128 && !near[i]) { n++; aSum += a; } }
  let e = 0, part = 0; for (let i = W; i < N - W; i++) { const a = placed[i * 4 + 3]; if (!a || (placed[(i - 1) * 4 + 3] && placed[(i + 1) * 4 + 3] && placed[(i - W) * 4 + 3] && placed[(i + W) * 4 + 3])) continue; e++; if (a < 240) part++; }
  return { haloPx: n, haloMeanAlpha: n ? +(aSum / n).toFixed(1) : 0, edgeAntialiased: e ? +(part / e).toFixed(3) : 0 }; }

/** The line measures of a rendered layer L on a drawing's own classes (mc: a v3/v4 master built on that drawing). */
export function splitAlong(mc, L) {
  const { w } = mc.edge, Ls = mc.v2.Ls, Lv = new Float32Array(N); for (let i = 0; i < N; i++) if (L[i * 4 + 3]) Lv[i] = SM.oklab([L[i * 4], L[i * 4 + 1], L[i * 4 + 2]])[0];
  const at = (x, y) => { const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, g = (xx, yy) => Lv[yy * W + xx]; return g(x0, y0) * (1 - fx) * (1 - fy) + g(x0 + 1, y0) * fx * (1 - fy) + g(x0, y0 + 1) * (1 - fx) * fy + g(x0 + 1, y0 + 1) * fx * fy; };
  let n = 0, split = 0;
  for (let i = 2 * W; i < N - 2 * W; i++) { if (w[i] < 0.9 || L[i * 4 + 3] < 240 || mc.contour[i]) continue; const x = i % W, y = (i / W) | 0;
    const gx = (Ls[i + 1 - W] + 2 * Ls[i + 1] + Ls[i + 1 + W]) - (Ls[i - 1 - W] + 2 * Ls[i - 1] + Ls[i - 1 + W]), gy = (Ls[i + W - 1] + 2 * Ls[i + W] + Ls[i + W + 1]) - (Ls[i - W - 1] + 2 * Ls[i - W] + Ls[i - W + 1]), g = Math.hypot(gx, gy);
    let tx, ty; if (g < 0.05) { tx = 1; ty = 0; } else { tx = -gy / g; ty = gx / g; }   // the tangent: across the gradient (a line's core has a weak gradient; then any direction)
    const a = [x + tx, y + ty], b = [x - tx, y - ty]; if ([a, b].some(([px, py]) => w[Math.round(py) * W + Math.round(px)] < 0.5)) continue; n++;
    if (Math.max(Math.abs(at(...a) - Lv[i]), Math.abs(at(...b) - Lv[i])) > 0.1) split++; }
  return { corePx: n, splitShare: n ? +(split / n).toFixed(3) : null };
}
/** On the drawing's own classes: per field the line contrast, the line inventory (line pixels / field pixels), the inner line sharpness
 *  (D-293's hard-step share), and splitAlong. A smoothed copy loses sharpness and contrast; a lost seam loses inventory. */
export function lineMeasures(mc, L) {
  const p = perceptualMeasures(mc, L), e = edgeMeasures(mc, L), inv = {};
  SM.GROUPS.forEach((g, k) => { let ln = 0, f = 0; for (let i = 0; i < N; i++) { if (mc.group[i] !== k || L[i * 4 + 3] < 240) continue; if (mc.edge.w[i] >= 0.5) ln++; else f++; } inv[g] = f ? +(ln / (ln + f)).toFixed(3) : null; });
  return { lineContrast: Object.fromEntries(Object.entries(p).map(([g, v]) => [g, v.lineContrastL])), grain: Object.fromEntries(Object.entries(p).map(([g, v]) => [g, v.grainL])), lineInventory: inv, innerHardShare: e["inner line flank"].hardShare, splitAlong: splitAlong(mc, L).splitShare };
}

/** The source's lines against the published drawing's, each on its OWN classes (mcCand on the candidate, mcPub on the published): every
 *  field keeps at least INVENTORY_MIN of the published share of line pixels (a lost seam fails, whatever the contrast), and the source
 *  must be drawn at K (detailVerdict on the source image: a smoothed or enlarged copy fails). The line contrast is reported only: a high
 *  contrast alone never passes a source. */
export const LINE_RULE = Object.freeze({ inventoryMin: 0.8, chainContrastMin: 0.9, chainInventoryMin: 0.9, weightBand: [0.75, 1.35], grainMax: 1.3, splitExcessMax: 0.1 });
export function sourceLineCheck(srcImg, mcCand, candLayer, mcPub, pubLayer, detail) {
  const a = lineMeasures(mcCand, candLayer), b = lineMeasures(mcPub, pubLayer), p = [], ratio = {};
  for (const g of SM.GROUPS) { if (!b.lineInventory[g]) continue; ratio[g] = +((a.lineInventory[g] || 0) / b.lineInventory[g]).toFixed(3); if (ratio[g] < LINE_RULE.inventoryMin) p.push(g + ": " + Math.round(100 * ratio[g]) + " % of the published drawing's line pixels (a lost seam)"); }
  if (!detail.ok) p.push(...detail.problems);
  return { ok: !p.length, problems: p, inventoryRatio: ratio, contrast: { candidate: a.lineContrast, published: b.lineContrast }, candidate: a, published: b };
}
/** The master on a drawing (mc built on it): the original colour must keep the drawing's line contrast and inventory; every design must
 *  keep its line weight within weightBand of the weight-keeping reference (v2 on the same drawing), add no grain beyond grainMax x v2's,
 *  and split no line along itself beyond the drawing's own variation + splitExcessMax. */
export function chainLineCheck(mc, drawing, original, designs) {
  const own = lineMeasures(mc, drawing), o = lineMeasures(mc, original), p = [], R = LINE_RULE;
  for (const g of SM.GROUPS) { if (!own.lineContrast[g]) continue;
    if (o.lineContrast[g] < R.chainContrastMin * own.lineContrast[g]) p.push("original colour, " + g + ": line contrast " + o.lineContrast[g] + " < " + R.chainContrastMin + " x the drawing's " + own.lineContrast[g]);
    if ((o.lineInventory[g] || 0) < R.chainInventoryMin * own.lineInventory[g]) p.push("original colour, " + g + ": lines lost"); }
  const per = {};
  for (const [n, { variant, reference }] of Object.entries(designs)) { const v = lineMeasures(mc, variant), r = lineMeasures(mc, reference), q = [];
    for (const g of ["laces", "toe", "upper", "sole"]) { if (!r.lineContrast[g]) continue; const k = v.lineContrast[g] / r.lineContrast[g]; if (k < R.weightBand[0] || k > R.weightBand[1]) q.push(g + " line weight x" + k.toFixed(2) + " of v2's"); if (v.grain[g] > R.grainMax * r.grain[g] + 0.002) q.push(g + " grain " + v.grain[g] + " > " + R.grainMax + " x v2's " + r.grain[g]); }
    if (v.splitAlong - own.splitAlong > R.splitExcessMax) q.push("lines split along themselves: " + v.splitAlong + " against the drawing's " + own.splitAlong);
    per[n] = { ok: !q.length, problems: q, splitAlong: v.splitAlong, lineContrast: v.lineContrast, grain: v.grain }; p.push(...q.map((x) => n + ": " + x)); }
  return { ok: !p.length, problems: p, drawing: own, original: o, designs: per };
}
