// D-257 HYPOTHESIS r1-c1 (offline; no image call): the cut owns geometry AND construction, the generated output owns the design.
// D-256 found that one uniform scale places R1-1 within a few px, but the output's OWN edge and outline then clash with the cut's
// (armpit holes, a neck sliver, a double contour, a clipped cuff). r1-c1 separates three kinds of things:
//   1. MATERIAL and PATTERN — from the output, painted with a BLEED beyond the silhouette and no outer outline; it may run past
//      the crop edge, because the cut's alpha crops it;
//   2. CONSTRUCTION tied to openings and edges — the neck rib, the cuffs, the hem stitch, the outer contour — from the cut's
//      CONSTRUCTION LAYER: band masks (where trim fabric lies) and line art (Northstar ink), made once per cut by fixed rules from the
//      cut and C (the neck opening; where a sleeve meets C's arm; the bottom edge), never per design. The output paints the bands'
//      FABRIC (it sees them marked on its canvas); the cut draws their EDGES;
//   3. the fixed SILHOUETTE, contour, sleeve split and covering on C — from the cut, as in r1-v1.
// Nothing is filled: a core pixel without the output's own paint is a hole and rejects the item. The checks say whether the
// output's trim lies where the cut's bands are (band agreement), whether the bleed is real (coverage before crop), whether the
// output drew its own outline or seams anyway (second outline), and whether a free detail runs into the crop (clipped details).
import * as WR from "./northstar-wardrobe.mjs";
import * as BF from "./northstar-base-figure.mjs";
import * as S1 from "./northstar-r1-similarity.mjs";

const { W, N } = WR, H = N / W, Mo = WR.maskOps;
export const REVISION = "r1-c1";
// the tee-hip cut's construction constants (per CUT, never per design): band widths and the hem stitch, in px of C's canvas
export const CUT_SPECS = Object.freeze({ "tee-hip": { neckBand: 11, cuffBand: 9, hemStitch: 7, bleed: 16 } });
export const LIMITS = Object.freeze({
  coverageRing: 4,            // the bleed must cover the core grown by 4 px …
  coverage: 0.999,            // … to at least 99.9 % before any crop
  bandAgreement: 0.97,        // trim fabric inside the cut's bands, body fabric next to them (2 px edge zone excluded)
  boundaryZone: 2,            // px on each side of a band edge that the cut's 2 px line covers
  secondOutline: 0.005,       // the output's own ink along the edges and band lines, relative to the band area
  clippedDetailPx: 0,         // no free detail (ink component) may run out of the core
  trimOffsetP90: 2,           // the output's own trim edge within 2 px of the cut's band edge in 90 % of the sectors
  sectorPx: 24,               // a band is measured in sectors of 24 px along its edge
});
const ink = (P, i) => P[i * 4 + 3] >= 128 && BF.classify(P, i) === "ink";

/** Edge segments of the cut's core: neck (facing the neck opening), cuff (facing C's arm below a sleeve), hem (facing down from
 *  the body), outer (the rest). Rules on the cut and C only. */
export function segments(t, base) {
  const g = S1.geometry(t.core), [x0, y0, x1] = g.bbox, neckBottom = y0 + g.neck.depth + 2, seg = new Uint8Array(N);   // 1 neck, 2 cuff, 3 hem, 4 outer
  const rowL = new Int32Array(H).fill(-1), rowR = new Int32Array(H).fill(-1); for (let i = 0; i < N; i++) if (t.core[i]) { const y = (i / W) | 0, x = i % W; if (rowL[y] < 0) rowL[y] = x; rowR[y] = x; }
  const neckHole = (j) => { const y = (j / W) | 0, x = j % W; return y >= y0 - 2 && y <= neckBottom && x > x0 && x < x1 && rowL[y] >= 0 && x > rowL[y] && x < rowR[y]; };
  for (let i = W; i < N - W; i++) { if (!t.core[i]) continue; const nb = [i - 1, i + 1, i - W, i + W].filter((j) => !t.core[j]); if (!nb.length) continue;
    if (nb.some((j) => neckHole(j) || ((j / W) | 0) < y0 + g.neck.depth && Math.abs((j % W) - (x0 + x1) / 2) < g.neck.topWidth / 2 + 4)) seg[i] = 1;
    else if (base.arms[i * 4 + 3] >= 128 && nb.some((j) => base.arms[j * 4 + 3] >= 128)) seg[i] = 2;
    else if (base.arms[i * 4 + 3] < 128 && !t.core[i + W] && ((i / W) | 0) > y0 + g.sleeveEndRow) seg[i] = 3;
    else seg[i] = 4; }
  return seg;
}
/** Distance inward (4-connected steps inside the core) from the edge pixels of one segment, up to max. */
function inward(t, seg, k, max) { const d = new Int16Array(N).fill(-1), q = []; for (let i = 0; i < N; i++) if (seg[i] === k) { d[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) { const i = q[h]; if (d[i] >= max) continue; for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < N && t.core[j] && d[j] < 0) { d[j] = d[i] + 1; q.push(j); } } return d; }

/** The cut's construction layer: band masks, line art (contour, band edges, hem stitch) in the cut's own ink. */
export function constructionLayer(t, base, cut = "tee-hip") {
  const spec = CUT_SPECS[cut]; if (!spec) throw new Error("no construction spec for cut " + cut);
  const seg = segments(t, base), dn = inward(t, seg, 1, spec.neckBand + 2), dc = inward(t, seg, 2, spec.cuffBand + 2), dh = inward(t, seg, 3, spec.hemStitch + 2);
  const band = new Uint8Array(N), edgeLine = new Uint8Array(N); // band: 1 neck, 2 cuff
  for (let i = 0; i < N; i++) { if (dn[i] >= 0 && dn[i] < spec.neckBand) band[i] = 1; else if (dc[i] >= 0 && dc[i] < spec.cuffBand) band[i] = 2;
    if ((dn[i] >= spec.neckBand - 1 && dn[i] <= spec.neckBand) || (dc[i] >= spec.cuffBand - 1 && dc[i] <= spec.cuffBand)) edgeLine[i] = 1; }
  // the cut's ink colour: the median of its contour
  const cs = []; for (let i = 0; i < N; i++) if (t.contour[i * 4 + 3] >= 200) cs.push(i); const med = (k) => { const v = cs.map((i) => t.contour[i * 4 + k]).sort((a, b) => a - b); return v.length ? v[v.length >> 1] : 30; };
  const inkRgb = [med(0), med(1), med(2)], lines = new Uint8ClampedArray(N * 4);
  for (let i = 0; i < N; i++) if (t.contour[i * 4 + 3]) lines.set(t.contour.subarray(i * 4, i * 4 + 4), i * 4);
  for (let i = 0; i < N; i++) if (edgeLine[i] && !lines[i * 4 + 3]) lines.set([...inkRgb, 230], i * 4);
  // the hem stitch: a dashed line (6 on, 4 off along x) at hemStitch px above the hem, half strength
  for (let i = 0; i < N; i++) if (dh[i] === spec.hemStitch && (i % W) % 10 < 6 && !lines[i * 4 + 3]) lines.set([...inkRgb, 120], i * 4);
  let nb = 0, cb = 0; for (let i = 0; i < N; i++) { if (band[i] === 1) nb++; else if (band[i] === 2) cb++; }
  return { revision: REVISION, cut, spec, seg, band, edgeLine, lines, inkRgb, dist: { neck: dn, cuff: dc }, counts: { neckBandPx: nb, cuffBandPx: cb } };
}

/** What a call would send as Image 1: the silhouette grown by the bleed, body fabric light grey in the cut's fold shade, the
 *  bands darker grey, both continued outward through the bleed (each bleed pixel takes the tone of the nearest core pixel). No
 *  outline anywhere. */
export function bleedCanvas(t, cl) {
  const spec = cl.spec, grow = Mo.dilate(t.core, spec.bleed), tone = new Int8Array(N).fill(-1), sh = new Float32Array(N), q = [];
  for (let i = 0; i < N; i++) if (t.core[i]) { tone[i] = cl.band[i] ? 1 : 0; sh[i] = t.shade[i]; q.push(i); }
  for (let h = 0; h < q.length; h++) { const i = q[h], x = i % W; for (const j of [i - 1, i + 1, i - W, i + W]) { if (j < 0 || j >= N || Math.abs((j % W) - x) > 1 || !grow[j] || tone[j] >= 0) continue; tone[j] = tone[i]; sh[j] = sh[i]; q.push(j); } }
  const o = new Uint8ClampedArray(N * 4);
  for (let i = 0; i < N; i++) { if (tone[i] < 0) continue; const g = Math.round(255 * (tone[i] ? 0.22 + 0.22 * sh[i] : 0.45 + 0.35 * sh[i])); o.set([g, g, g, 255], i * 4); }
  return { canvas: o, bleedMask: grow };
}

/** Coverage before crop: the share of the core grown by the coverage ring that the output's opaque paint covers, and the realised
 *  margin (5th percentile of the distance from the core edge to the output's edge, per segment). */
export function coverage(fitted, t, cl) {
  const ring = Mo.dilate(t.core, LIMITS.coverageRing); let n = 0, c = 0; for (let i = 0; i < N; i++) if (ring[i]) { n++; if (fitted[i * 4 + 3] >= 128) c++; }
  // the outward margin: steps from each core edge pixel along the outside until the output's paint ends (capped at 2·bleed)
  const cap = 2 * cl.spec.bleed, margin = { 1: [], 2: [], 3: [], 4: [] };
  for (let i = W; i < N - W; i++) { const k = cl.seg[i]; if (!k) continue; for (const d of [-1, 1, -W, W]) { if (t.core[i + d]) continue; let s = 0, j = i + d; while (s < cap && j >= 0 && j < N && fitted[j * 4 + 3] >= 128) { s++; j += d; } margin[k].push(s); break; } }
  const p5 = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length * 0.05)]; };
  return { share: +(c / n).toFixed(5), marginP5: { neck: p5(margin[1]), cuff: p5(margin[2]), hem: p5(margin[3]), outer: p5(margin[4]) }, ok: c / n >= LIMITS.coverage };
}

/** Band agreement: the output's colours inside the core split into trim and body by two medians (the band interiors and the body
 *  next to them, the 2 px zones at the band edges excluded); the share of band pixels nearer trim and of near-body pixels nearer
 *  body; and the offset of the colour edge (the distance, inside the band zone, where trim turns to body). */
export function bandAgreement(fitted, t, cl) {
  const z = LIMITS.boundaryZone, inBand = (i) => cl.band[i], dEdge = Mo.dilate(cl.edgeLine, z), near = Mo.dilate(Uint8Array.from(cl.band, (v) => (v ? 1 : 0)), 12);
  const col = (i) => [fitted[i * 4], fitted[i * 4 + 1], fitted[i * 4 + 2]], bandIdx = [], bodyIdx = [];
  for (let i = 0; i < N; i++) { if (!t.core[i] || fitted[i * 4 + 3] < 128 || dEdge[i] || t.contour[i * 4 + 3] || ink(fitted, i)) continue; if (inBand(i)) bandIdx.push(i); else if (near[i]) bodyIdx.push(i); }
  const median = (idx) => [0, 1, 2].map((k) => { const v = idx.map((i) => fitted[i * 4 + k]).sort((a, b) => a - b); return v.length ? v[v.length >> 1] : 0; });
  const mT = median(bandIdx), mB = median(bodyIdx), dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), sep = dist(mT, mB);
  const isTrim = (i) => dist(col(i), mT) < dist(col(i), mB);
  const a1 = bandIdx.filter(isTrim).length / Math.max(1, bandIdx.length), a2 = bodyIdx.filter((i) => !isTrim(i)).length / Math.max(1, bodyIdx.length);
  return { trimRgb: mT, bodyRgb: mB, separation: +sep.toFixed(1), plainTrim: sep < 12, bandAsTrim: +a1.toFixed(4), nearBodyAsBody: +a2.toFixed(4),
    ok: sep < 12 || (a1 >= LIMITS.bandAgreement && a2 >= LIMITS.bandAgreement) };
}

/** Where the output's OWN trim edge lies against the cut's band edge, by shape, not by a colour class: per sector of a band
 *  (24 px along its outer edge), the mean colour of the output at each inward distance d; the trim edge is the distance with the
 *  largest colour step beyond 2 px; its offset from the band width is reported per sector (positive = the output's trim is wider).
 *  Fold shading averages out along a ring; a plain trim (no step) is reported as such. */
export function trimOffset(fitted, t, cl) {
  const res = {};
  for (const [name, k, width] of [["neck", 1, cl.spec.neckBand], ["cuff", 2, cl.spec.cuffBand]]) {
    const d = cl.dist[name], maxD = width + 10, sector = new Int32Array(N).fill(-1);
    // sectors: the segment's edge pixels in scan order, cut into runs of sectorPx; every inner pixel takes its nearest edge pixel's sector
    const edge = []; for (let i = 0; i < N; i++) if (cl.seg[i] === k) edge.push(i); edge.sort((a, b) => (a % W) - (b % W) || a - b);
    const q = []; edge.forEach((i, n) => { sector[i] = Math.floor(n / LIMITS.sectorPx); q.push(i); });
    for (let h = 0; h < q.length; h++) { const i = q[h]; for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < N && t.core[j] && sector[j] < 0 && d[j] >= 0) { sector[j] = sector[i]; q.push(j); } }
    // d of each pixel up to maxD (the construction map stops at width + 2: extend it here)
    const dd = new Int16Array(N).fill(-1), qq = []; for (const i of edge) { dd[i] = 0; qq.push(i); }
    for (let h = 0; h < qq.length; h++) { const i = qq[h]; if (dd[i] >= maxD) continue; for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < N && t.core[j] && dd[j] < 0) { dd[j] = dd[i] + 1; qq.push(j); if (sector[j] < 0) sector[j] = sector[i]; } }
    const nS = Math.ceil(edge.length / LIMITS.sectorPx), sum = new Float64Array(nS * (maxD + 1) * 3), cnt = new Float64Array(nS * (maxD + 1));
    for (let i = 0; i < N; i++) { const s = sector[i], di = dd[i]; if (s < 0 || di < 0 || fitted[i * 4 + 3] < 128 || ink(fitted, i)) continue; const b = s * (maxD + 1) + di; cnt[b]++; for (let c = 0; c < 3; c++) sum[b * 3 + c] += fitted[i * 4 + c]; }
    const offs = []; let plain = 0;
    for (let s = 0; s < nS; s++) { const m = (di) => { const b = s * (maxD + 1) + di; return cnt[b] ? [0, 1, 2].map((c) => sum[b * 3 + c] / cnt[b]) : null; };
      let best = -1, at = -1; for (let di = 3; di < maxD - 1; di++) { const a = m(di - 1), b2 = m(di), c2 = m(di + 1), e = m(di + 2); if (!a || !b2 || !c2 || !e) continue;
        const step = Math.hypot(...[0, 1, 2].map((c) => (c2[c] + e[c]) / 2 - (a[c] + b2[c]) / 2)); if (step > best) { best = step; at = di + 0.5; } }
      if (best < 6) plain++; else offs.push(+(at - width).toFixed(1)); }
    const abs = offs.map(Math.abs).sort((a, b) => a - b), p90 = abs.length ? abs[Math.floor(abs.length * 0.9)] : null;
    res[name] = { width, sectors: nS, measured: offs.length, plainSectors: plain, offsets: offs, medianOffset: offs.length ? offs.slice().sort((a, b) => a - b)[offs.length >> 1] : null, p90AbsOffset: p90,
      ok: offs.length === 0 ? true : p90 <= LIMITS.trimOffsetP90 }; }
  return { ...res, ok: Object.values(res).every((r) => r.ok) };
}

/** The output's own ink along the outer edge (2–10 px inside) and along the band edges (outside the cut's 2 px line): a second
 *  outline or seam the cut already draws. */
export function secondOutline(fitted, t, cl) {
  const outside = Uint8Array.from(t.core, (v) => (v ? 0 : 1)), o10 = Mo.dilate(outside, 10), o2 = Mo.dilate(outside, 2), eZone = Mo.dilate(cl.edgeLine, 4), eLine = Mo.dilate(cl.edgeLine, 1);
  let n = 0, bandPx = 0; for (let i = 0; i < N; i++) { if (cl.band[i]) bandPx++; if (!t.core[i] || !ink(fitted, i)) continue; if ((o10[i] && !o2[i]) || (eZone[i] && !eLine[i])) n++; }
  return { inkPx: n, share: +(n / Math.max(1, bandPx)).toFixed(4), ok: n / Math.max(1, bandPx) <= LIMITS.secondOutline };
}

/** Free details clipped by the crop: ink components of the output that lie partly inside the core (away from its edge) and partly
 *  outside the cut. */
export function clippedDetails(fitted, t) {
  const seen = new Uint8Array(N), inner = Mo.not(Mo.dilate(Uint8Array.from(t.core, (v) => (v ? 0 : 1)), 6)); let clipped = 0, comps = 0;
  for (let s = 0; s < N; s++) { if (seen[s] || !ink(fitted, s)) continue; const st = [s]; seen[s] = 1; let inIn = false, out = false, n = 0;
    while (st.length) { const i = st.pop(); n++; if (inner[i]) inIn = true; if (!t.alpha[i]) out = true; for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < N && !seen[j] && ink(fitted, j)) { seen[j] = 1; st.push(j); } }
    if (n >= 12) { comps++; if (inIn && out) clipped++; } }
  return { components: comps, clipped, ok: clipped <= LIMITS.clippedDetailPx };
}

/** The r1-c1 layer: the output's own pixels inside the cut's alpha (no fill), the construction lines over them. */
export function composeC1(fitted, t, cl, base) {
  // every core pixel without the output's own paint is a hole — also where a construction line will be drawn over it: the lines
  // never hide missing material
  const layer = new Uint8ClampedArray(N * 4); let holes = 0, holesUnderLines = 0;
  for (let i = 0; i < N; i++) { if (!t.alpha[i]) continue; if (fitted[i * 4 + 3] >= 128) { layer.set(fitted.subarray(i * 4, i * 4 + 3), i * 4); layer[i * 4 + 3] = t.alpha[i]; } else if (t.core[i]) { holes++; if (cl.lines[i * 4 + 3]) holesUnderLines++; } }
  for (let i = 0; i < N; i++) { const a = cl.lines[i * 4 + 3]; if (!a || !t.alpha[i]) continue; const k = a / 255; for (let c = 0; c < 3; c++) layer[i * 4 + c] = Math.round(cl.lines[i * 4 + c] * k + layer[i * 4 + c] * (1 - k)); layer[i * 4 + 3] = t.alpha[i]; }
  let layers; if (t.category === "top") { const tb = new Uint8ClampedArray(N * 4), sl = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) if (layer[i * 4 + 3]) (base.arms[i * 4 + 3] >= 128 ? sl : tb).set(layer.subarray(i * 4, i * 4 + 4), i * 4); layers = { topBody: tb, sleeves: sl }; }
  else layers = t.category === "bottom" ? { pants: layer } : { shoes: layer };
  return { layers, holes, holesUnderLines, ok: holes === 0 };
}
