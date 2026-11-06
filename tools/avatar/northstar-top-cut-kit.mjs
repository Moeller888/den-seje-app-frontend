// D-342 — THE TOP CUT KIT: the shared method for a top (tee, sweater, …), with every cut-specific number in a CONTRACT (one JSON per cut
// under tools/avatar/fixtures/northstar-wardrobe/top-cuts/). Offline; no image call; publishes nothing; no runtime file changes. The locked
// method files are NOT changed (northstar-tee-master.mjs is pinned by D-267/D-270's plans; northstar-longsleeve-master.mjs and -v2.mjs are
// D-333/D-335's recorded versions): this module only calls them, with the contract's data, and proves it by reproducing the owner-approved
// tee (D-274) and sweater (D-336) layers byte for byte (northstar-top-cut-kit-study.mjs --phase control).
//   what is shared (the same code for every cut)
//     master    — LS.buildMasterFor(spec): panels split along the drawn armhole seams, the shading ratio, the fold/cylinder displacement,
//                 the sleeve axes (D-264's method, D-333's parameter). With the tee's data it IS TM.buildMaster (D-333's test).
//     render    — TM.render on a colour (the cut's own contour on top), then PF.placePrint at the print box (D-269/D-271's print path).
//     split     — LS2.splitLayers with the cut's threshold: a fabric pixel goes to the sleeve layer from that alpha of C's arm. With 128 it is
//                 TM.render's/PF.placePrint's production split (tee); with 1 it is D-335's long-sleeve repair.
//     hip seam  — LS2.hipSeamLayer (D-335 v3): C's base top uncovered at the hip, as the cut's ink, in a layer drawn behind the bottom.
//     shadow    — the cut item's skin shadow split by C's figure (D-242): arms where C's arm alpha >= 128, body elsewhere on C's body.
//     print box — D-269's chest-center box held as its box on C (the same on every top, since every top sits on C).
//   what is per cut (the contract) — the source item and how its template is read; the seam polylines (by hand, once) and the armpit
//     direction; the warp; the sleeve kind and split threshold; cuffs; trim bands (for the print's safe area); the print box; the shadow;
//     whether a hip seam is needed. A SLEEVELESS cut has seams: null — the master is then built with both seams placed outside the cut
//     (SLEEVELESS_SEAMS), so the same method leaves one body panel and no sleeve panel (checked).
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng } from "./r3-hair-tool-v2.mjs";
import * as WR from "./northstar-wardrobe.mjs";
import * as BC from "./northstar-base-figure-c.mjs";
import * as IP from "./northstar-item-pilot.mjs";
import * as R1 from "./northstar-r1-garment.mjs";
import * as RC from "./northstar-r1c-evaluate.mjs";
import * as TM from "./northstar-tee-master.mjs";
import * as S1 from "./northstar-r1-similarity.mjs";
import * as LS from "./northstar-longsleeve-master.mjs";
import * as LS2 from "./northstar-longsleeve-master-v2.mjs";
import * as PF from "./northstar-tee-print-family.mjs";
import { loadItems } from "./build-northstar-runtime-assets.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", ".."), { W, N } = WR;
export const CUTS_DIR = "tools/avatar/fixtures/northstar-wardrobe/top-cuts";
export const CONTRACT = "top-cut-v1";
/** The method files this kit calls and does not change (sha256): the tee master is pinned by D-267/D-270's plans; the long-sleeve
 *  master v1/v2 are D-333/D-335's recorded versions; the print family is pinned by D-270's plan. */
export const LOCKED = Object.freeze({
  "tools/avatar/northstar-tee-master.mjs": "6a4b650cb8d8cbd162bc5a8563a59b4b27ac5fa2dfcd0459a359bb405f881038",
  "tools/avatar/northstar-longsleeve-master.mjs": "dbb1037cc45861f879137d877c697ad931867174dbb4e3273fcd7a8eaadaddad",
  "tools/avatar/northstar-longsleeve-master-v2.mjs": "e9e3022eebcbeeb2c26627efbe9c94e1d4821397905e1ee4ddc7bb8b960c6305",
  "tools/avatar/northstar-tee-print-family.mjs": "7155a4193bcf961ce06f948be3e63c1bd8a148f8aa1f9ff52510eefec5e35521",
});
/** A sleeveless cut's seams: two short vertical runs at the canvas edges, far outside any top, so the barrier never meets the cut. */
export const SLEEVELESS_SEAMS = Object.freeze({ left: [[2, 500], [2, 520]], right: [[W - 3, 500], [W - 3, 520]] });
const REQUIRED = ["id", "label", "contract", "family", "source", "panels", "warp", "sleeves", "trim", "print", "shadow", "runtime", "oneTimeWork"];

/** A cut contract, validated. */
export function loadCut(id) { return checkCut(JSON.parse(readFileSync(join(ROOT, CUTS_DIR, id + ".json"), "utf8"))); }
export function checkCut(c) {
  const p = []; for (const k of REQUIRED) if (c[k] === undefined) p.push("missing " + k);
  if (!p.length) {
    if (c.contract !== CONTRACT) p.push("contract must be " + CONTRACT);
    if (!["r1c-cut", "item-layers"].includes(c.source.template)) p.push("source.template: r1c-cut | item-layers");
    if (c.source.template === "item-layers" && !(c.source.run && c.source.method)) p.push("source: an item-layers cut names its run and method");
    const s = c.panels.seams, kind = c.sleeves.kind;
    if (!["short", "long", "none"].includes(kind)) p.push("sleeves.kind: short | long | none");
    if ((kind === "none") !== (s === null)) p.push("a sleeveless cut has seams: null, a sleeved cut has both seams");
    if (s) for (const side of ["left", "right"]) { const l = s[side]; if (!Array.isArray(l) || l.length < 2 || l.some((q, k) => !Number.isInteger(q[0]) || !Number.isInteger(q[1]) || (k && q[1] <= l[k - 1][1]))) p.push("seams." + side + ": integer points, rows going down"); }
    if (s && !(c.panels.armpitOut && c.panels.armpitOut.left && c.panels.armpitOut.right)) p.push("a sleeved cut gives the armpit direction per side");
    if (![1, 128].includes(c.sleeves.layerSplitFromArmAlpha)) p.push("sleeves.layerSplitFromArmAlpha: 128 (production) or 1 (D-335)");
    if (!["r1c-construction", "seam-rule", "none"].includes(c.trim.bands)) p.push("trim.bands: r1c-construction | seam-rule | none");
    if (c.trim.revision !== undefined && ![1, 2].includes(c.trim.revision)) p.push("trim.revision: 1 (D-352) | 2 (D-354)");
    if (c.edges !== undefined && !(c.edges && ["contour-ink", "figure-or-ink"].includes(c.edges.rim))) p.push("edges.rim: contour-ink | figure-or-ink (D-354)");
    if (c.trim.bands === "seam-rule") { const R = c.trim.regions; if (!Array.isArray(R) || !R.length) p.push("a seam-rule cut lists its trim.regions");
      else for (const r of R) { if (!r.name || !["body", "left", "right"].includes(r.panel) || !["top", "bottom", "opening"].includes(r.edge)) p.push("trim region: name, panel body|left|right, edge top|bottom|opening");
        if ((r.edge === "opening") !== (Array.isArray(r.hole) && r.hole.length === 4 && r.hole.every(Number.isInteger))) p.push(r.name + ": an opening region (and only it) gives its hole box [x0, y0, x1, y1]");
        if (!Array.isArray(r.depth) || r.depth.length !== 2 || !r.depth.every(Number.isInteger) || r.depth[0] < 1 || r.depth[1] < r.depth[0]) p.push(r.name + ": depth [min, max] px from the edge");
        if (r.x && !(Array.isArray(r.x) && r.x.length === 2 && r.x.every(Number.isInteger) && r.x[0] < r.x[1])) p.push(r.name + ": x [x0, x1]");
        if (r.edgeY && !(Array.isArray(r.edgeY) && r.edgeY.length === 2 && r.edgeY.every(Number.isInteger) && r.edgeY[0] < r.edgeY[1])) p.push(r.name + ": edgeY [y0, y1]"); } }
    if (c.trim.bands === "r1c-construction" && c.source.template !== "r1c-cut") p.push("trim bands come from the r1c cut only");
    const b = c.print.boxOnC; if (!Array.isArray(b) || b.length !== 4 || !b.every(Number.isInteger)) p.push("print.boxOnC: [x0, y0, w, h]");
    if (c.hipSeam && (c.hipSeam.rule !== "LS2.hipSeamLayer" || JSON.stringify(c.hipSeam.rows) !== JSON.stringify(LS2.HIP_ROWS))) p.push("hipSeam: only LS2.hipSeamLayer with its rows " + JSON.stringify(LS2.HIP_ROWS) + " is implemented");
    const j = c.hemJunction; if (j && (j.rule !== "K.hemJunctionLayer" || !Number.isInteger(j.outlinePx) || j.outlinePx < 1 || !Number.isInteger(j.rowsBelowShortsTop) || j.rowsBelowShortsTop < 0)) p.push("hemJunction: K.hemJunctionLayer with integer outlinePx >= 1 and rowsBelowShortsTop >= 0");
    if (j && !(Number.isInteger(j.opaqueRowsBelowHem) && j.opaqueRowsBelowHem >= 0)) p.push("hemJunction.opaqueRowsBelowHem: an integer >= 0");
    if (j && j.opaqueTaperRows !== undefined && !(Number.isInteger(j.opaqueTaperRows) && j.opaqueTaperRows >= 0)) p.push("hemJunction.opaqueTaperRows: an integer >= 0");
    if (c.hipSeam && j) p.push("a cut has at most one layer behind the bottom (hipSeam or hemJunction)");
    for (const k of ["cylinder", "foldMaxPx", "foldBlur"]) if (typeof c.warp[k] !== "number") p.push("warp." + k);
    if (!Array.isArray(c.oneTimeWork) || !c.oneTimeWork.length) p.push("oneTimeWork: what was done by hand, once");
  }
  if (p.length) throw new Error((c && c.id ? c.id + ": " : "") + p.join("; "));
  return c;
}

/** The master spec the shared method reads (the shape of TM.SPEC / LS.SPEC). */
export function specOf(c) {
  const s = c.panels.seams;
  return { cut: c.id, source: c.source.item, seams: s || SLEEVELESS_SEAMS, seamSearchPx: c.panels.seamSearchPx ?? TM.SPEC.seamSearchPx, extendPx: c.panels.extendPx ?? TM.SPEC.extendPx,
    armpitOut: s ? c.panels.armpitOut : { left: [0, 1], right: [0, 1] }, warp: { ...c.warp }, anchors: {} };
}

/** C, its wardrobe and templates (private: needs ITEM_PILOT_C_PATH). */
export function envC() { const w = WR.buildWardrobe(), base = BC.prepareBase(w, Uint8ClampedArray.from(decodePng(IP.readC()).px)), T = BC.templatesC(w, base, { revision: "d213" }); return { w, base, T }; }

/** The cut's template, source item and trim bands (r1c-construction: the tee's construction layer; seam-rule: seamBands, needs the
 *  master, so prepare() fills them in; none: no band). */
export function cutOf(c, E) {
  if (c.source.template === "r1c-cut") { const r = RC.cutOf(E); return { t: r.t, src: r.src, bands: c.trim.bands === "r1c-construction" ? r.cl.band : new Uint8Array(N), origin: { cut: "RC.cutOf", item: c.source.item } }; }
  const { P, origin } = loadItems({ [c.source.item]: { run: c.source.run, method: c.source.method } }), src = P[c.source.item];
  const t = R1.templateFromLayers(src.layers, { shadow: src.shadow, covering: "none", category: "top", cut: c.id });
  return { t, src, bands: new Uint8Array(N), origin: origin[c.source.item] };
}

/** The master of the cut (the shared method). A sleeveless cut must come out with no sleeve panel. */
export function buildMaster(c, t, src) {
  const m = LS.buildMasterFor(specOf(c), t, src);
  if (c.sleeves.kind === "none" && (m.sizes.left || m.sizes.right)) throw new Error(c.id + ": a sleeveless cut got sleeve panels");
  if (c.sleeves.kind !== "none" && !(m.sizes.left > 0 && m.sizes.right > 0)) throw new Error(c.id + ": a sleeved cut got no sleeve panel");
  return m;
}

/** D-352 — TRIM BANDS BY THE DRAWN SEAM (trim.bands "seam-rule", one-time cut data, no design data): a rib, cuff or binding is the strip
 *  between the cut's edge and the seam line the cut item draws parallel to it. Per region { name, panel: body|left|right, edge: top|bottom,
 *  x?: [x0, x1], edgeY?: [y0, y1], depth: [min, max] }: per column of the panel (within x; a column whose edge pixel lies outside edgeY is
 *  not this edge — e.g. a sleeve's slanted side above its cuff — and is skipped), from the panel's edge pixel inward, the darkest pixel of the
 *  master's shading ratio between depth min and max (off the contour) is the seam; the seam row is median-filtered over 9 columns (one
 *  stray dark pixel never steps the band), and the band is the panel's pixels from the edge to the seam, the seam included (the drawn line
 *  then lies on the trim, and the pattern ends right before it). An OPENING region (a neckline: a curved rib whose width measured down a
 *  column grows toward its sides) is measured along the opening instead: the hole is the background inside its box; the distance of the
 *  panel's pixels from the hole (chamfer 3-4, in px); per 2-degree sector around the hole's centre the distance ring of the darkest mean
 *  ratio within depth is the seam, median-filtered over 9 sectors, and the band is the pixels from the hole out to the seam. Returns
 *  { band: Uint8Array(N) (region index + 1), regions: {name: {px, columns (sectors for an opening), depth: [min, median, max]}} }. */
export function seamBands(c, t, master) {
  const band = new Uint8Array(N), out = {}, P = { body: 0, left: 1, right: 2 };
  (c.trim.regions || []).forEach((r, k) => { const p = P[r.panel], cols = [];
    if (r.edge === "opening") { out[r.name] = openingBand(r, k + 1, p, t, master, band); return; }
    for (let x = r.x ? r.x[0] : 0; x <= (r.x ? r.x[1] : W - 1); x++) { let e = -1; for (let y = 0; y < N / W; y++) { const i = y * W + x; if (t.core[i] && master.panel[i] === p) { if (r.edge === "top") { e = y; break; } e = y; } } if (e < 0 || (r.edgeY && (e < r.edgeY[0] || e > r.edgeY[1]))) continue;
      const dir = r.edge === "top" ? 1 : -1; let best = null, bv = 9; for (let d = r.depth[0]; d <= r.depth[1]; d++) { const y = e + dir * d, i = y * W + x; if (y < 0 || y >= N / W || !t.core[i] || master.panel[i] !== p || t.contour[i * 4 + 3]) continue; if (master.ratio[i] < bv) { bv = master.ratio[i]; best = d; } }
      if (best !== null) cols.push({ x, e, d: best }); }
    const ds = cols.map((q) => q.d); let n = 0;
    if ((c.trim.revision || 1) >= 2 && cols.length >= 5) { n = seamCurveBand(r, k + 1, p, t, master, band, cols); }
    else cols.forEach((q, j) => { const win = ds.slice(Math.max(0, j - 4), j + 5).sort((a, b) => a - b), d = win[win.length >> 1], dir = r.edge === "top" ? 1 : -1;
      for (let s = 0; s <= d; s++) { const i = (q.e + dir * s) * W + q.x; if (t.core[i] && master.panel[i] === p && !band[i]) { band[i] = k + 1; n++; } } });
    const sd = [...ds].sort((a, b) => a - b); out[r.name] = { px: n, columns: cols.length, depth: cols.length ? [sd[0], sd[sd.length >> 1], sd[sd.length - 1]] : null }; });
  if ((c.trim.revision || 1) >= 2) { // the three closures feed each other (a filled corner opens a gap, a gap a soft edge): run them together
    // until nothing changes (at most 8 rounds)
    const openings = (c.trim.regions || []).map((r, k) => (r.edge === "opening" ? { mark: k + 1, box: [r.hole[0] - r.depth[1] - 6, r.hole[1] - r.depth[1] - 6, r.hole[2] + r.depth[1] + 6, r.hole[3] + r.depth[1] + 6] } : null)).filter(Boolean);
    out.cornerPx = 0; out.gapPx = 0; out.softEdgePx = 0;
    // (the soft-edge step only adds soft pixels from the band's CORE pixels, so it cannot creep along the outline; all three are safe
    // to repeat together)
    out.softEdgePx = 0; for (let round = 0; round < 8; round++) { const a = cornerClosure(t, master, band, openings), b = gapClosure(t, master, band), d = softEdgeClosure(t, band); out.cornerPx += a; out.gapPx += b; out.softEdgePx += d; if (!a && !b && !d) break; } }
  return { band, regions: out };
}

/** D-354 (trim.revision 2) — the seam of a column region as ONE smooth curve: the per-column seam rows (edge -+ the darkest depth) are
 *  fitted by least squares with a quadratic in x, columns more than 3 px off the first fit are dropped and the curve refitted; the band
 *  is then every pixel of the panel within the region's x range on the edge side of the curve (the curve's row included), over ALL its
 *  columns — also those whose own edge was skipped (the cuff's rounded corners, D-352's gaps) — so the band ends on one smooth line
 *  instead of a stepped one (D-352's spikes up into the sleeve). */
function seamCurveBand(r, mark, p, t, master, band, cols) {
  const dir = r.edge === "top" ? 1 : -1, pts = cols.map((q) => [q.x, q.e + dir * q.d]);
  const fit = (P) => { let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0, t0 = 0, t1 = 0, t2 = 0; const m = P.reduce((a, q) => a + q[0], 0) / P.length;
    for (const [x0, y] of P) { const x = x0 - m, x2 = x * x; s0++; s1 += x; s2 += x2; s3 += x2 * x; s4 += x2 * x2; t0 += y; t1 += x * y; t2 += x2 * y; }
    const A = [[s4, s3, s2, t2], [s3, s2, s1, t1], [s2, s1, s0, t0]]; for (let i = 0; i < 3; i++) { let b = i; for (let j = i + 1; j < 3; j++) if (Math.abs(A[j][i]) > Math.abs(A[b][i])) b = j; [A[i], A[b]] = [A[b], A[i]];
      for (let j = 0; j < 3; j++) if (j !== i && A[i][i]) { const f = A[j][i] / A[i][i]; for (let k = i; k < 4; k++) A[j][k] -= f * A[i][k]; } }
    const [a, b, c] = [0, 1, 2].map((i) => (A[i][i] ? A[i][3] / A[i][i] : 0)); return (x) => a * (x - m) ** 2 + b * (x - m) + c; };
  let f = fit(pts); const keep = pts.filter(([x, y]) => Math.abs(y - f(x)) <= 3); if (keep.length >= 5) f = fit(keep);
  const x0 = r.x ? r.x[0] : 0, x1 = r.x ? r.x[1] : W - 1; let n = 0;
  for (let x = x0; x <= x1; x++) { const ys = Math.round(f(x)); for (let y = 0; y < N / W; y++) { const i = y * W + x; if (!t.core[i] || master.panel[i] !== p || band[i]) continue; if (dir < 0 ? y >= ys : y <= ys) { band[i] = mark; n++; } } }
  return n;
}

/** D-354 (trim.revision 2) — a band's GAPS: a core pixel with the same band directly above and below it, or directly left and right
 *  of it, joins that band (two passes), whatever its panel (such a gap can sit on a panel's seam, as at the shoulder). The opening's per-sector seam depth can leave a one-row gap where two sectors meet
 *  (a row of fabric across the neck rib at the shoulder in D-352); a band never has such a gap in the drawing. */
export function gapClosure(t, master, band) {
  let n = 0;
  for (let pass = 0; pass < 2; pass++) { const add = [];
    for (let i = W + 1; i < N - W - 1; i++) { if (band[i] || !t.core[i]) continue;
      for (const [a, b] of [[i - W, i + W], [i - 1, i + 1]]) if (band[a] && band[a] === band[b]) { add.push([i, band[a]]); break; } }
    for (const [i, m] of add) { band[i] = m; n++; } }
  return n;
}

/** D-354 (trim.revision 2) — a band's CORNERS: a core pixel of the same panel that touches the band and lies within 2 px of the contour's
 *  ink (alpha >= 128) joins the band (three passes). Where a rib ends at the cut's outline (the neck rib meeting the shoulder) the
 *  opening's distance rule leaves a small wedge of fabric between the band and the outline — the light sliver at the shoulder in D-352;
 *  this closes it up to the outline and never beyond it (the contour itself is not band, and nothing outside the core is added here).
 *  Only OPENING bands, within their hole box widened by the depth (a hem or cuff band must not creep up the side outline). */
function cornerClosure(t, master, band, openings) {
  if (!openings.length) return 0; const inBox = (i, b) => { const x = i % W, y = (i / W) | 0; return x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]; };
  const near = new Uint8Array(N); for (let i = 0; i < N; i++) if (t.contour[i * 4 + 3] >= 128) { const x = i % W; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx, j = i + dy * W + dx; if (xx >= 0 && xx < W && j >= 0 && j < N) near[j] = 1; } }
  let n = 0;
  for (let pass = 0; pass < 3; pass++) { const add = [];
    for (let i = W; i < N - W; i++) { if (band[i] || !t.core[i] || !near[i] || t.contour[i * 4 + 3] >= 128) continue; for (const k of [-1, 1, -W, W]) { const j = i + k, o = openings.find((q) => q.mark === band[j]); if (o && inBox(i, o.box) && master.panel[j] === master.panel[i]) { add.push([i, band[j]]); break; } } }
    for (const [i, m] of add) { band[i] = m; n++; } }
  return n;
}

/** D-354 (trim.revision 2) — a band's SOFT EDGE: the cut's soft outer pixels (alpha > 0, not core) next to a band pixel belong to that
 *  band (one step from the band's core pixels), so the band's colour reaches the cut's own edge instead of leaving the body fabric there (D-352's light specks along
 *  the neckline and the light sliver where the neck rib meets the shoulder). Nothing beyond the cut's alpha is added. */
function softEdgeClosure(t, band) {
  // ONE step from the band's core pixels only: a soft pixel never passes the band on to the next soft pixel, so the band's colour cannot
  // creep along the outline's soft fringe away from the rib
  const add = [];
  for (let i = W; i < N - W; i++) { if (band[i] || !t.alpha[i] || t.core[i]) continue; for (const k of [-W - 1, -W, -W + 1, -1, 1, W - 1, W, W + 1]) if (band[i + k] && t.core[i + k]) { add.push([i, band[i + k]]); break; } }
  for (const [i, m] of add) band[i] = m;
  return add.length;
}

/** D-354 — the cut's RIM outside its contour: a pixel of the layer with alpha > 0 and no contour ink that touches the outside (an
 *  8-neighbour with alpha 0) and lies within 2 px of the contour's ink (alpha >= 128) is the outline's outermost fringe, not fabric. D-352
 *  painted it with the fabric or trim: coloured specks on the skin just outside the neckline.
 *    "contour-ink"       — it takes the median contour ink, alpha unchanged (the first D-354 rule: the specks became dark specks);
 *    "figure-or-ink"     — it takes the mean colour of C itself at its outside neighbours (C's pixels there with alpha >= 128: skin at
 *                          the neck opening, skin or C's shading at an armhole): what is seen right beside it then runs up to the
 *                          drawn outline. It is NOT cleared: C's base garment can lie under it (clearing it failed the fit check,
 *                          FIT-4-COVERAGE, in D-354's first try), so its alpha stays and keeps covering. Where no outside neighbour is
 *                          on C (the background) it takes the contour ink. (D-354's second try coloured only skin and inked the rest:
 *                          dark beads along the tank's armholes.)
 *  Returns { ink, figure }. Nothing is added beyond the cut's alpha. */
export function rimEdge(t, layer, base) {
  const ink = [0, 1, 2].map((k) => { const v = []; for (let i = 0; i < N; i++) if (t.contour[i * 4 + 3] >= 200) v.push(t.contour[i * 4 + k]); v.sort((a, b) => a - b); return v.length ? v[v.length >> 1] : 30; });
  const near = new Uint8Array(N); for (let i = 0; i < N; i++) if (t.contour[i * 4 + 3] >= 128) { const x = i % W; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx, j = i + dy * W + dx; if (xx >= 0 && xx < W && j >= 0 && j < N) near[j] = 1; } }
  const nb = [-W - 1, -W, -W + 1, -1, 1, W - 1, W, W + 1], todo = [];
  for (let i = W; i < N - W; i++) { if (!layer[i * 4 + 3] || t.contour[i * 4 + 3] || !near[i]) continue; const out = nb.filter((k) => !t.alpha[i + k]); if (!out.length) continue;
    const onC = out.filter((k) => base.R[(i + k) * 4 + 3] >= 128); todo.push([i, onC.length ? onC : null]); }
  let inkN = 0, figN = 0;
  for (const [i, onC] of todo) { if (onC) { for (let q = 0; q < 3; q++) layer[i * 4 + q] = Math.round(onC.reduce((a, k) => a + base.R[(i + k) * 4 + q], 0) / onC.length); figN++; }
    else { layer[i * 4] = ink[0]; layer[i * 4 + 1] = ink[1]; layer[i * 4 + 2] = ink[2]; inkN++; } }
  return { ink: inkN, figure: figN };
}
export function rimToContourInk(t, layer) {
  const ink = [0, 1, 2].map((k) => { const v = []; for (let i = 0; i < N; i++) if (t.contour[i * 4 + 3] >= 200) v.push(t.contour[i * 4 + k]); v.sort((a, b) => a - b); return v.length ? v[v.length >> 1] : 30; });
  const near = new Uint8Array(N); for (let i = 0; i < N; i++) if (t.contour[i * 4 + 3] >= 128) { const x = i % W; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx, j = i + dy * W + dx; if (xx >= 0 && xx < W && j >= 0 && j < N) near[j] = 1; } }
  let n = 0; for (let i = W; i < N - W; i++) { if (!layer[i * 4 + 3] || t.contour[i * 4 + 3] || !near[i]) continue; if (![-W - 1, -W, -W + 1, -1, 1, W - 1, W, W + 1].some((k) => !t.alpha[i + k])) continue;
    layer[i * 4] = ink[0]; layer[i * 4 + 1] = ink[1]; layer[i * 4 + 2] = ink[2]; n++; }
  return n;
}

function openingBand(r, mark, p, t, master, band) {
  const [hx0, hy0, hx1, hy1] = r.hole, m = r.depth[1] + 2, X0 = Math.max(0, hx0 - m), X1 = Math.min(W - 1, hx1 + m), Y0 = Math.max(0, hy0 - m), Y1 = Math.min(N / W - 1, hy1 + m), bw = X1 - X0 + 1, bh = Y1 - Y0 + 1;
  const D = new Float32Array(bw * bh).fill(1e9), at = (x, y) => (y - Y0) * bw + (x - X0); let cx = 0, cy = 0, nh = 0;
  for (let y = hy0; y <= hy1; y++) for (let x = hx0; x <= hx1; x++) if (!t.core[y * W + x]) { D[at(x, y)] = 0; cx += x; cy += y; nh++; }
  if (!nh) return { px: 0, columns: 0, depth: null }; cx /= nh; cy /= nh;
  const pass = (ys, xs, nb) => { for (const y of ys) for (const x of xs) { let v = D[at(x, y)]; for (const [dx, dy, w] of nb) { const xx = x + dx, yy = y + dy; if (xx < X0 || xx > X1 || yy < Y0 || yy > Y1) continue; v = Math.min(v, D[at(xx, yy)] + w); } D[at(x, y)] = v; } };
  const xs = [...Array(bw).keys()].map((i) => X0 + i), ys = [...Array(bh).keys()].map((i) => Y0 + i);
  pass(ys, xs, [[-1, 0, 3], [0, -1, 3], [-1, -1, 4], [1, -1, 4]]); pass([...ys].reverse(), [...xs].reverse(), [[1, 0, 3], [0, 1, 3], [1, 1, 4], [-1, 1, 4]]);
  const sec = (x, y) => Math.floor(((Math.atan2(y - cy, x - cx) * 180) / Math.PI + 360) / 2) % 180, sum = new Map();
  for (const y of ys) for (const x of xs) { const i = y * W + x, d = Math.round(D[at(x, y)] / 3); if (!t.core[i] || master.panel[i] !== p || d < r.depth[0] || d > r.depth[1] || t.contour[i * 4 + 3]) continue;
    const key = sec(x, y) * 1000 + d, o = sum.get(key) || [0, 0]; o[0] += master.ratio[i]; o[1]++; sum.set(key, o); }
  const best = new Map(); for (const [key, [s0, n0]] of sum) { const sc = Math.floor(key / 1000), d = key % 1000, v = s0 / n0, b = best.get(sc); if (!b || v < b.v) best.set(sc, { d, v }); }
  const secs = [...best.keys()].sort((a, b) => a - b), ds = secs.map((q) => best.get(q).d), seam = new Map(); secs.forEach((q, j) => { const win = ds.slice(Math.max(0, j - 4), j + 5).sort((a, b) => a - b); seam.set(q, win[win.length >> 1]); });
  let n = 0; for (const y of ys) for (const x of xs) { const i = y * W + x, d = Math.round(D[at(x, y)] / 3), sd = seam.get(sec(x, y)); if (sd === undefined || !t.core[i] || master.panel[i] !== p || d < 1 || d > sd || band[i]) continue; band[i] = mark; n++; }
  const sd = [...ds].sort((a, b) => a - b); return { px: n, columns: secs.length, depth: sd.length ? [sd[0], sd[sd.length >> 1], sd[sd.length - 1]] : null };
}

/** Everything a cut needs to render: { c, E, t, src, bands, master, origin } (+ trimRegions for a seam-rule cut). */
export function prepare(c, E = envC()) { const { t, src, bands, origin } = cutOf(c, E), master = buildMaster(c, t, src);
  if (c.trim.bands !== "seam-rule") return { c, E, t, src, bands, origin, master };
  const sb = seamBands(c, t, master); return { c, E, t, src, bands: sb.band, trimRegions: sb.regions, origin, master }; }

/** D-351 — the kit's FABRIC SAMPLER (FABRIC_SAMPLER): TM.render's material mapping (the same panel coordinates — the body planar from the
 *  cut's bounding box, each sleeve along its axis — the same displacement, the same shading ratio, the cut's contour ink on top), but the
 *  swatch is sampled BILINEARLY (wrapping) instead of at the nearest pixel. TM.render (locked) samples the nearest swatch pixel; with the
 *  fold displacement that steps a pattern's sharp edge by whole pixels (a 1 px staircase on stripes, frayed dots, seen at x3 in D-351's
 *  first pass). A colour design never comes here (renderDesign keeps TM.render for it), so every approved item is rendered as before. */
export const FABRIC_SAMPLER = "kit-fabric-bilinear-v1";
export function renderFabric(master, t, swatch, bands = null, trim = null) {
  const g = S1.geometry(t.core), [bx0, by0] = g.bbox, out = new Uint8ClampedArray(N * 4);
  const m = (a, n) => ((a % n) + n) % n;
  for (let i = 0; i < N; i++) { if (!t.alpha[i]) continue; const x = i % W, y = (i / W) | 0, p = master.panel[i] < 0 ? 0 : master.panel[i];
    let u, v; if (p === 0) { u = x - bx0; v = y - by0; } else { const a = master.axes[p - 1], th = a.angle - Math.PI / 2, dx = x - a.origin[0], dy = y - a.origin[1]; u = dx * Math.cos(-th) - dy * Math.sin(-th); v = dx * Math.sin(-th) + dy * Math.cos(-th); }
    u += master.disp[i * 2]; v += master.disp[i * 2 + 1];
    // the swatch pixel (X, Y) covers [X, X+1): its centre is X + 0.5 (TM.render's nearest pick of floor(u) is the pixel whose cell holds u)
    // D-352: a trim band takes the trim swatch (TM.render's rule: bands[i] && trim), sampled the same way
    const S = bands && bands[i] && trim ? trim : swatch, sw = S.w, sh = S.h, P = S.px;
    const fu = u - 0.5, fv = v - 0.5, x0 = Math.floor(fu), y0 = Math.floor(fv), ax = fu - x0, ay = fv - y0, X0 = m(x0, sw), X1 = m(x0 + 1, sw), Y0 = m(y0, sh), Y1 = m(y0 + 1, sh), f = master.ratio[i];
    for (let q = 0; q < 3; q++) { const c = (P[(Y0 * sw + X0) * 4 + q] * (1 - ax) + P[(Y0 * sw + X1) * 4 + q] * ax) * (1 - ay) + (P[(Y1 * sw + X0) * 4 + q] * (1 - ax) + P[(Y1 * sw + X1) * 4 + q] * ax) * ay; out[i * 4 + q] = Math.min(255, Math.round(c * f)); }
    out[i * 4 + 3] = t.alpha[i]; }
  // the contour: the cut's own outer ink, on top, absolute (TM.render's rule)
  for (let i = 0; i < N; i++) { const a = t.contour[i * 4 + 3]; if (!a) continue; const kk = a / 255; for (let q = 0; q < 3; q++) out[i * 4 + q] = Math.round(t.contour[i * 4 + q] * kk + out[i * 4 + q] * (1 - kk)); }
  return { layer: out };
}

/** D-352 — THE PRINT'S SAFE AREA AS A RULE (PRINT_FIT): a print must keep PF.MARGIN px (chessboard) from everything PF.clearance names —
 *  the cut's edge and contour, sleeve panels, C's arms and the cut's trim bands (a binding is a separate band: the print keeps its margin
 *  from the binding's stitch line, not from the neckline). The motif is first sized for the cut's print box as before (PF.prepareFor);
 *  if its footprint comes closer than the margin, the box is MOVED by the smallest vertical shift (1 px steps, up to maxShift, down
 *  before up at equal size) that clears it; only if no shift does, the box is SCALED down about its centre (2 % steps, to minScale),
 *  each scale tried with the smallest clearing shift — the motif keeps its proportions. The margin is never lowered. Returns the
 *  placement with { fit: { rule, shiftPx, scale, minClearancePx } }, or throws when nothing within the limits clears it. */
export const PRINT_FIT = Object.freeze({ rule: "kit-print-safe-v1", maxShift: 24, minScale: 0.8 });
export function placePrintSafe(ctx, plain, motif) {
  const clear = ctx._clear || (ctx._clear = printClearance(ctx)), [bx, by, bw, bh] = ctx.c.print.boxOnC, margin = PF.MARGIN;
  const tryAt = (scale, dy) => { const w = Math.round(bw * scale), h = Math.round(bh * scale), box = [Math.round(bx + (bw - w) / 2), Math.round(by + (bh - h) / 2) + dy, w, h], img = PF.prepareFor(motif, [w, h]).img;
    const p = PF.placePrint(ctx.master, ctx.t, ctx.E.base, plain, img, box); let m = 99; for (const i of p.footprint) m = Math.min(m, clear[i]); return { p, m, box }; };
  const base = tryAt(1, 0); if (base.m >= margin && base.p.onContour === 0) return { ...base.p, fit: { rule: PRINT_FIT.rule, shiftPx: 0, scale: 1, minClearancePx: base.m, box: base.box } };
  for (let sc = 1; sc >= PRINT_FIT.minScale - 1e-9; sc = Math.round((sc - 0.02) * 100) / 100) for (let k = 1; k <= PRINT_FIT.maxShift; k++) for (const dy of [k, -k]) { const r = tryAt(sc, dy);
    if (r.m >= margin && r.p.onContour === 0) return { ...r.p, fit: { rule: PRINT_FIT.rule, shiftPx: dy, scale: sc, minClearancePx: r.m, box: r.box, clearanceBefore: base.m } }; }
  throw new Error(ctx.c.id + ": no shift up to " + PRINT_FIT.maxShift + " px or scale down to " + PRINT_FIT.minScale + " keeps the print " + margin + " px clear");
}

/** A design on the cut: { rgb: [r,g,b] | swatch: seamless { w, h, px }, trim?: swatch (D-352: laid on the cut's trim bands), print?:
 *  prepared image (PF.prepareFor's img) | printSafe?: the motif itself (decoded), placed by placePrintSafe (D-352) }. Returns the full
 *  layer, its split by the cut's rule and the print's placement. D-351: a swatch (a fabric or pattern recipe, northstar-top-cut-recipes.mjs)
 *  is laid by renderFabric (the same mapping, sampled bilinearly); an rgb design is rendered by TM.render exactly as before. */
export function renderDesign(ctx, design) {
  const { c, t, master, E, bands } = ctx, plain = design.swatch ? renderFabric(master, t, design.swatch, bands, design.trim || null) : TM.render(master, t, E.base, bands, { body: design.rgb });
  // D-354: only a fabric design on a cut with edges.rim (an rgb design — every approved item — is rendered exactly as before)
  const rim = design.swatch && c.edges ? (c.edges.rim === "figure-or-ink" ? rimEdge(t, plain.layer, E.base) : c.edges.rim === "contour-ink" ? { ink: rimToContourInk(t, plain.layer), figure: 0 } : null) : null, rimPx = rim ? rim.ink + rim.figure : 0;
  let layer = plain.layer, print = null;
  if (design.print) { const p = PF.placePrint(master, t, E.base, plain.layer, design.print, c.print.boxOnC); layer = p.layer; print = { at: p.at, footprintPx: p.footprint.length, onContour: p.onContour, footprint: p.footprint }; }
  else if (design.printSafe) { const p = placePrintSafe(ctx, plain.layer, design.printSafe); layer = p.layer; print = { at: p.at, footprintPx: p.footprint.length, onContour: p.onContour, footprint: p.footprint, fit: p.fit }; }
  const sp = LS2.splitLayers(layer, E.base, c.sleeves.layerSplitFromArmAlpha);
  return { layer, layers: sp.layers, movedToSleevesPx: c.sleeves.layerSplitFromArmAlpha < 128 ? sp.moved : 0, print, rimPx, rim };
}

/** The print's safe area on the cut (chessboard distance from the cut's edge, contour, sleeve panels, trim bands and C's arms). */
export function printClearance(ctx) { return PF.clearance(ctx.master, ctx.t, ctx.bands, ctx.E.base.arms); }

/** The cut's hip-seam layer (null when the cut needs none). */
export function hipSeam(ctx) { if (!ctx.c.hipSeam) return null; return LS2.hipSeamLayer(ctx.t, ctx.master, ctx.E.base); }

/** D-343 — the HEM-JUNCTION layer (a cut narrower than C at the side, the tank): drawn where the hip seam is (after the shoes, before the
 *  bottom), it continues the cut's contour ONLY from each side's hem corner down along C's outline, so the top and the bottom meet. It
 *  takes C's base pixels (top or shorts, alpha > 0) that the cut does not cover, from 2 rows above the side's hem corner (the lowest row of
 *  the cut beyond 92 px from the centre) to rowsBelowShortsTop below the top of C's base shorts, that lie within outlinePx of C's exterior
 *  OR belong to C's base top, 4-connected to the cut; ink = the median of the cut's own contour ink. Alpha: OPAQUE in the first
 *  opaqueRowsBelowHem rows below each side's hem corner, where the layer bridges the top and the bottom (the existing bottoms leave their
 *  fill transparent just inside their contour where C's base top lay, so C's soft outline there let the background through as a 1 px light
 *  seam between two dark strokes, D-343); C's own alpha below (opaque there drew a hard stepped edge outside a narrower bottom's contour).
 *  D-345: opaqueTaperRows (default 0, D-343's step) fades the opaque section into C's alpha over that many rows (a 1 px step at the end of
 *  the opaque section, seen from x2 on the long trousers, D-343). Unlike the hip seam it
 *  leaves the side ABOVE the hem alone (there C's 1-2 px outline beyond the cut lies against the background; inking it gave the ragged
 *  extra contour, D-342). One layer for the cut: it looks at no bottom and no design. */
export function hemJunctionLayer(ctx) {
  const j = ctx.c.hemJunction; if (!j) return null; const { t, E } = ctx, base = E.base;
  let shortsTop = N / W; for (let i = 0; i < N; i++) if (base.sep.lab[i] === 2) { shortsTop = Math.floor(i / W); break; }
  const ext = new Uint8Array(N); for (let i = 0; i < N; i++) ext[i] = base.R[i * 4 + 3] === 0 ? 1 : 0; let near = ext; for (let k = 0; k < j.outlinePx; k++) near = WR.maskOps.dilate(near, 1);
  const hem = { left: 0, right: 0 }; for (let i = 0; i < N; i++) if (t.core[i]) { const x = i % W, y = (i / W) | 0; if (x < W / 2 - 92) hem.left = Math.max(hem.left, y); if (x >= W / 2 + 92) hem.right = Math.max(hem.right, y); }
  const cand = (i) => { const x = i % W, y = (i / W) | 0, h = x < W / 2 ? hem.left : hem.right, lab = base.sep.lab[i]; return y >= h - 2 && y <= shortsTop + j.rowsBelowShortsTop && (lab === 1 || lab === 2) && base.R[i * 4 + 3] > 0 && !ext[i] && !t.core[i] && (near[i] || lab === 1); };
  const add = new Uint8Array(N), q = []; for (let i = 0; i < N; i++) { if (!cand(i)) continue; const x = i % W; if ([i - 1, i + 1, i - W, i + W].some((k) => Math.abs((k % W) - x) <= 1 && t.core[k])) { add[i] = 1; q.push(i); } }
  while (q.length) { const i = q.pop(), x = i % W; for (const k of [i - 1, i + 1, i - W, i + W]) { if (Math.abs((k % W) - x) > 1 || add[k] || !cand(k)) continue; add[k] = 1; q.push(k); } }
  const ink = [0, 1, 2].map((k) => { const v = []; for (let i = 0; i < N; i++) if (t.contour[i * 4 + 3] >= 200) v.push(t.contour[i * 4 + k]); v.sort((a, b) => a - b); return v.length ? v[v.length >> 1] : 30; });
  const layer = new Uint8ClampedArray(N * 4); let n = 0, x0 = W, y0 = N, x1 = -1, y1 = -1;
  for (let i = 0; i < N; i++) { if (!add[i]) continue; const yy = (i / W) | 0, hm = i % W < W / 2 ? hem.left : hem.right, r = yy - (hm + j.opaqueRowsBelowHem), T = j.opaqueTaperRows || 0, ca = base.R[i * 4 + 3];
    layer.set([...ink, r <= 0 ? 255 : r <= T ? Math.round(255 + (ca - 255) * (r / (T + 1))) : ca], i * 4); n++; const x = i % W, y = (i / W) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { layer, addedPx: n, box: n ? [x0, y0, x1, y1] : null, ink, hem, shortsTop };
}

/** The cut's one layer behind the bottom (hip seam or hem junction), or null. */
export function behindBottom(ctx) { return ctx.c.hipSeam ? hipSeam(ctx) : ctx.c.hemJunction ? hemJunctionLayer(ctx) : null; }

/** The cut's skin shadow split by C's figure (D-242): { body, arms } (a part without pixels is left out). */
export function shadowParts(ctx) {
  const s = ctx.t.shadow || ctx.src.shadow, base = ctx.E.base, out = {};
  if (!s) return out;
  for (const part of ["body", "arms"]) { const o = new Uint8ClampedArray(N * 4); let n = 0;
    for (let i = 0; i < N; i++) { if (!s[i * 4 + 3]) continue; const arm = base.arms[i * 4 + 3] >= 128, bod = base.body[i * 4 + 3] >= 128; if (part === "arms" ? arm : bod && !arm) { o.set(s.subarray(i * 4, i * 4 + 4), i * 4); n++; } }
    if (n) out[part] = o; }
  return out;
}

/** The runtime item a design of the cut would have (NORTHSTAR_ITEMS shape), for a proposal only (nothing here changes the runtime). */
export function itemShape(c, shadows) {
  const o = { category: "top", layers: [...c.runtime.layers], shadows: [...shadows] };
  if (c.runtime.shadowsOf) o.shadowsOf = c.runtime.shadowsOf; if (c.runtime.hipSeam) o.hipSeam = c.runtime.hipSeam; return o;
}
