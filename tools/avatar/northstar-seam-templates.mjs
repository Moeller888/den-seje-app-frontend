// D-225 SEAM TEMPLATES — clearly marked TEMPLATE items (never generated pictures, never a GPT item) built from C's own geometry and
// the seam contract (BC.SEAM_CONTRACT_V1): flat fabric with a 2 px painted outline. They show that items following the contract
// combine at every seam (BC.outfitCheck), and that each kind of violation shows in some combination. A template proves the RULES
// combine; it does not prove that a model can draw such an item. Runs on C (outside the clones) or on the CI stand-in.
import * as WR from "./northstar-wardrobe.mjs";
import * as BF from "./northstar-base-figure.mjs";
import * as BC from "./northstar-base-figure-c.mjs";
const { W, H, N } = WR, Mo = WR.maskOps, INK = [24, 18, 14, 255];
/** A layer from a mask: flat colour, a 2 px ink outline where the mask meets its outside. */
export function paintMask(m, rgb) { const o = new Uint8ClampedArray(N * 4), edge = Mo.and(m, Mo.dilate(Mo.not(m), 2)); for (let i = 0; i < N; i++) if (m[i]) o.set(edge[i] ? INK : [...rgb, 255], i * 4); return o; }
export function seamTemplates(w, base, T, { contract = BC.SEAM_CONTRACT_V1 } = {}) {
  const K = contract, Ln = BC.seamLines(w, base, T), lab = base.sep.lab, min = BF.minimumItems(base.R, lab), cols = Object.keys(Ln.waist).map(Number), lo = Math.min(...cols), hi = Math.max(...cols);
  const mOf = (L) => Mo.toMask(L, 128), sideOf = (x) => (x < W / 2 ? "left" : "right");
  // TOPS: C's base top (corners included) carried down to W + hemOff in every waist column; sleeves = C's base sleeves
  const top = (hemOff, rgb, overhang = K.topHipOverhangPx + 2) => { const m = Mo.or(mOf(min.topBody), new Uint8Array(N)); for (let i = 0; i < N; i++) if (lab[i] === 1) m[i] = 1;
    for (const x of cols) for (let y = Ln.waist[x] - 30; y <= Ln.waist[x]; y++) m[y * W + x] = 1;
    // at a hip station: down to W + hemOff, as wide as C's base-shorts outline ± (topHipOverhangPx + 2), a straight hem
    // (the hem parallel to C's waist line: column x ends at W(x) + hemOff; beyond the waist columns, the nearest one's W)
    if (hemOff > 0) { const Wc = (x) => Ln.waist[Math.min(hi, Math.max(lo, x))], y0 = Math.min(...cols.map((x) => Ln.waist[x])), y1 = Math.max(...cols.map((x) => Ln.waist[x])) + hemOff;
      for (let y = y0; y <= y1; y++) { const h = Ln.hip[y]; const xa = h ? Math.min(lo, h[0] - overhang) : lo, xb = h ? Math.max(hi, h[1] + overhang) : hi;
        for (let x = xa; x <= xb; x++) { if (y > Wc(x) && y <= Wc(x) + hemOff && (!h || (x >= h[0] - overhang && x <= h[1] + overhang) || (x >= lo && x <= hi && overhang >= 0))) m[y * W + x] = 1; } }
      // the sides flare over the 24 rows above the waist line at the sides (its lowest rows) to the hip width — no step
      const ys = Math.max(...cols.map((x) => Ln.waist[x])), h1 = Ln.hip[ys + 1] || Ln.hip[y0 + 1]; if (h1 && overhang > 0) for (let y = ys - 24; y <= ys; y++) { const t = (y - (ys - 24)) / 24; let x0 = W, x1 = -1; for (let x = 0; x < W; x++) if (m[y * W + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); } if (x1 < 0) continue;
        const a0 = Math.round(x0 + (h1[0] - overhang - x0) * t), a1 = Math.round(x1 + (h1[1] + overhang - x1) * t); for (let x = a0; x < x0; x++) m[y * W + x] = 1; for (let x = x1 + 1; x <= a1; x++) m[y * W + x] = 1; } }   // outward only
    return { topBody: paintMask(m, rgb), sleeves: paintMask(mOf(min.sleeves), rgb) }; };
  // BOTTOMS: C's base shorts (cropped), optionally with a horizontal detail line at W + lineOff; FULL: down to A + hemBelow, C's leg ± overhang
  const shorts = () => mOf(min.pants);
  const cropped = (rgb, lineOff = null) => { const L = paintMask(shorts(), rgb); if (lineOff !== null) for (const x of cols) { const i = (Ln.waist[x] + lineOff) * W + x; if (L[i * 4 + 3] && x > lo + 4 && x < hi - 4) L.set(INK, i * 4); } return { pants: L }; };
  // C's leg outline per row; where C has no leg row (between its base shorts and its legs), the nearest row below
  const legAt = (side, y) => { for (let d = 0; d < 40; d++) if (Ln.leg[side][y + d]) return Ln.leg[side][y + d]; return null; };
  const full = (rgb, { hemBelow = 9, overhang = K.trouserOverhangPx + 2, roundPx = 0 } = {}) => { const m = shorts();
    for (const side of ["left", "right"]) { const A = Ln.ankle[side], end = A + hemBelow; for (let y = w.anchors.crotchY + 1; y <= end; y++) { const lg = legAt(side, y); if (!lg) continue; const r = y > end - 12 ? roundPx : 0;
      for (let x = lg[0] - overhang + r; x <= lg[1] + overhang - r; x++) m[y * W + x] = 1; } }
    // the crotch: where the two legs meet, the fabric between them is one piece (no enclosed gap below the crotch)
    for (let y = w.anchors.crotchY + 1; y < H; y++) { const l = legAt("left", y), r = legAt("right", y); if (!l || !r || l[1] + overhang < r[0] - overhang - 1) continue; for (let x = l[1]; x <= r[0]; x++) m[y * W + x] = 1; }
    return { pants: paintMask(m, rgb) }; };
  // SHOES: C's foot from collarOff above the ankle down to C's sole + 12, within C's leg ± width; a BOOT has its shaft from A − shaft
  const shoe = (rgb, { collar = 2, width = K.shoeEnvelopePx - 2, sole = 12 } = {}) => { const m = new Uint8Array(N), foot = Mo.toMask(base.body, 128);
    for (const side of ["left", "right"]) { const A = Ln.ankle[side]; let fb = 0; for (let i = 0; i < N; i++) if (foot[i] && sideOf(i % W) === side && ((i / W) | 0) > A) fb = Math.max(fb, (i / W) | 0);
      for (let y = A - collar; y <= fb + sole; y++) { const lg = Ln.leg[side][Math.min(y, fb)] || Ln.leg[side][A]; let x0 = lg[0] - width, x1 = lg[1] + width;
        if (y > A + K.fullHemMinBelowAnklePx) { let f0 = W, f1 = -1; for (let x = side === "left" ? 0 : W / 2; x < (side === "left" ? W / 2 : W); x++) if (foot[Math.min(y, fb) * W + x]) { f0 = Math.min(f0, x); f1 = Math.max(f1, x); } if (f1 >= 0) { x0 = Math.min(x0, f0 - 4); x1 = Math.max(x1, f1 + 4); } }
        for (let x = x0; x <= x1; x++) m[y * W + x] = 1; } }
    return { shoes: paintMask(m, rgb) }; };
  return {
    compliant: { "TEMPLATE-top-waist": top(0, [70, 110, 170]), "TEMPLATE-top-hip": top(K.topHemMinPx + 6, [170, 70, 70]), "TEMPLATE-bottom-cropped": cropped([60, 60, 90]), "TEMPLATE-bottom-waistband": cropped([90, 50, 80], K.waistbandMaxPx),
      "TEMPLATE-bottom-full": full([150, 130, 90]), "TEMPLATE-shoes-low": shoe([235, 235, 235]), "TEMPLATE-shoes-boot": shoe([40, 38, 40], { collar: K.shaftMaxAboveAnklePx - 6 }) },
    violating: { "VIOLATION-top-hem-W+10": { item: top(K.waistbandMaxPx - 2, [120, 160, 80]), breaks: "SC-W1 (hem off station)", partner: "TEMPLATE-bottom-waistband" },
      "VIOLATION-bottom-line-at-hip-station": { item: cropped([90, 50, 80], K.topHemMinPx + 8), breaks: "SC-W4 (a line where tops end)", partner: "TEMPLATE-top-hip" },
      "VIOLATION-top-hip-narrow": { item: top(K.topHemMinPx + 6, [170, 70, 70], -6), breaks: "SC-W5 (a hip-length top narrower than the bottoms)", partner: "TEMPLATE-bottom-cropped" },
      "VIOLATION-bottom-full-rounded": { item: full([150, 130, 90], { roundPx: K.trouserOverhangPx + 2 }), breaks: "SC-L1 (hem not square)", partner: "TEMPLATE-shoes-low" },
      "VIOLATION-shoes-boot-wide": { item: shoe([190, 150, 100], { collar: K.shaftMaxAboveAnklePx - 6, width: K.trouserOverhangPx + 7 }), breaks: "SC-L3 (shaft wider than the full hem's overhang)", partner: "TEMPLATE-bottom-full" } } };
}
export const CATEGORY_OF = (id) => (/top/.test(id) ? "top" : /bottom/.test(id) ? "bottom" : "shoes");
