// D-269 — A PRINT FAMILY ON THE D-264 TEE MASTER (offline; no image call; no authorisation; not the production method). D-268 found the
// generated chest print usable but small: D-267's rule scales the SQUARE around the print's alpha box to the anchor's width (62 px on C),
// so a wide motif (a planet with its ring and sparkles) gets a small body. This module fixes, once per cut, two print placements and ONE
// general size rule, and evaluates them on the existing TMG-2 planet and on SYNTHETIC control motifs (compact, wide, tall):
//   placements  fixed boxes on the body panel, as fractions of the cut's geometry like the master's anchor (one-time data per placement,
//               never per motif): chest-left (around the master's own anchor) and chest-center (a larger box below the neck rib). Each box
//               must lie inside the SAFE AREA: the master's body panel, at least MARGIN px from the rib bands (neck, hem), the armhole
//               seams (the panel boundary), the cut's contour and C's arms;
//   size rule   the motif's VISIBLE content (its alpha >= 8 bounding box, never the transparent canvas) is scaled as large as the box
//               allows (contain, aspect kept, nothing cut), but no larger than covering RULE.inkShare of the box's area with ink (the
//               alpha sum). The whole illustration is kept; no part is chosen as the "main" part; one constant for every motif;
//   rendering   the master's own print path (through the same displacement, multiplied by the same shading ratio, under the cut's own
//               contour) at the placement's box; the master, its geometry and the cut's alpha are unchanged (the layers' alpha is
//               compared with the plain shirt on every render).
// The checks measure placement (safe area, clearance of the placed footprint, nothing clipped), colour fringe of the prepared print and
// that the alpha is untouched. Contrast and app-size footprints are MEASURES that help the visual review; they decide nothing. The visual
// review (legibility, silhouette, Northstar quality) is never automatic, and no design is approved here.
// Usage:
//   node tools/avatar/northstar-tee-print-family.mjs --out <dir outside the repo>     sheets, a local preview (index.html) and record.json (needs C)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { encodePng, decodePng } from "./r3-hair-tool-v2.mjs";
import * as WR from "./northstar-wardrobe.mjs";
import * as BF from "./northstar-base-figure.mjs";
import * as BC from "./northstar-base-figure-c.mjs";
import * as IP from "./northstar-item-pilot.mjs";
import * as R1 from "./northstar-r1-garment.mjs";
import * as S1 from "./northstar-r1-similarity.mjs";
import * as RC from "./northstar-r1c-evaluate.mjs";
import * as M1 from "./northstar-r1-material.mjs";
import * as TM from "./northstar-tee-master.mjs";
import * as TMM from "./northstar-tee-material.mjs";
import { fromItem } from "./northstar-r1-material-study.mjs";
import { syntheticPrint } from "./northstar-tee-master-study.mjs";
import { flat, crop, grid, down } from "./northstar-wardrobe-poc.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const ART = join(homedir(), "Documents", "DenSejeApp-artefacts"), { W, N } = WR;
const sha = (b) => createHash("sha256").update(b).digest("hex");
const lumOf = (P, i) => 0.299 * P[i * 4] + 0.587 * P[i * 4 + 1] + 0.114 * P[i * 4 + 2];

export const REVISION = "tee-print-v1";
/** The existing illustrated print (D-267's TMG-2, private, read byte for byte) and the master it is placed on. */
export const PLANET = Object.freeze({ file: "tm-material-calls/TMG-2-tee-hip-chest-print-planet/tmm.image-1.png", sha256: "608b45398c959708caaa09991f1544032b5dd4b12273c04f29a222e4e9ffe458" });
export const MASTER_FINGERPRINT = "e50483aa973d7181db0b8a8e7e8f09acc03ca6f162da96fcf3ec8729e7e8e026";
/** The placements: the box's centre (x from the body's centre in body widths, y from the cut's top in cut heights, as the master's
 *  anchor) and its size in body widths. One-time data per placement. */
export const PLACEMENTS = Object.freeze({
  "chest-left": { x: 0.2, y: 0.3, width: 0.3, height: 0.3 },
  "chest-center": { x: 0, y: 0.39, width: 0.58, height: 0.52 },
});
/** The size rule (one constant for every motif and placement) and the safe area's margin. */
export const RULE = Object.freeze({ alphaBox: 8, inkShare: 0.5, samples: 8 });
export const MARGIN = 10;
/** A small set of shirt colours, the same placement rules on each (cream is the cut's own fabric, measured on C). */
export const COLOURS = Object.freeze({ cream: null, heather: [158, 160, 164], coral: [214, 96, 82], navy: [38, 50, 92] });
/** The app's avatar sizes (the whole 1024x1536 canvas, as D-194/D-267). */
export const APP_SIZES = Object.freeze([[110, 165], [52, 78]]);
export const VISUAL = Object.freeze([
  "legibility per app size: what is still read at 110x165 and at 52x78 (the overall shape, the colours, the detail) — judged honestly, a lost detail is allowed, a lost shape is reported",
  "silhouette and contrast: the motif's outline and fill against each shirt colour",
  "placement: clear of the neck rib, the armhole seams and the armpits; balanced on the chest; nothing cut",
  "fabric: the print takes the fabric's light and folds where the master has them (D-264: the chest is drawn almost flat), no colour rim",
  "Northstar quality: line weight and flat cel colours sit with the figure's painted look",
]);
export const KNOWN_LIMITS = Object.freeze([
  "D-264: near-planar mapping over broad areas; on C the chest carries no drawn fold, so a chest print stays flat (shading ratio about 0.99 to 1.0 over the boxes)",
  "D-264: luminance-only shading; the master's print path samples nearest-neighbour after the displacement (as the anchor), so a print edge is not anti-aliased against a sub-pixel shift",
  "the app sizes: one canvas pixel is about 0.107 app px at 110x165 and 0.051 at 52x78",
  "the control motifs are SYNTHETIC (drawn here) and not designs; the planet is the only illustrated print",
]);

const outDir = (OUT) => { const r = relative(ROOT, resolve(OUT || ".")); if (!OUT || !(r.startsWith("..") || isAbsolute(r))) throw new Error("--out must be outside the repository (the sheets show C)"); mkdirSync(OUT, { recursive: true }); return OUT; };

// ── the motifs ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** SYNTHETIC control motifs on a transparent n x n canvas (flat cel colours, a dark outline, analytic anti-aliasing): compact (D-264's
 *  badge), wide (a 3:1 banner) and tall (a 1:3 rocket-like capsule). Controls of FORMAT only; none is a design. */
export function controlMotifs(n = 1024) {
  const cov = (d) => Math.min(1, Math.max(0, 0.5 - d)), ow = n * 0.018, NAVY = [24, 34, 74];
  const img = () => ({ w: n, h: n, px: new Uint8ClampedArray(n * n * 4) });
  const over = (im, i, c, a) => { if (a <= 0) return; const o = i * 4, da = im.px[o + 3] / 255, oa = a + da * (1 - a); for (let k = 0; k < 3; k++) im.px[o + k] = Math.round((c[k] * a + im.px[o + k] * da * (1 - a)) / oa); im.px[o + 3] = Math.round(oa * 255); };
  const capsule = (x, y, cx, cy, a, r, vertical) => { const px = vertical ? y - cy : x - cx, py = vertical ? x - cx : y - cy, q = Math.max(-a, Math.min(a, px)); return Math.hypot(px - q, py) - r; };
  const draw = (shape, fill, extra) => { const im = img(); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const i = y * n + x, X = x + 0.5, Y = y + 0.5, d = shape(X, Y); if (d > 1) continue; over(im, i, NAVY, cov(d)); over(im, i, fill, cov(d + ow)); if (extra) for (const [sd, c] of extra) over(im, i, c, Math.min(cov(sd(X, Y)), cov(d + ow))); } return im; };
  const pr = syntheticPrint(96), compact = img(), off = Math.round(n * 0.11), sc = (n - 2 * off) / 96;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const u = Math.floor((x - off) / sc), v = Math.floor((y - off) / sc); if (u < 0 || v < 0 || u >= 96 || v >= 96) continue; compact.px.set(pr.px.subarray((v * 96 + u) * 4, (v * 96 + u) * 4 + 4), (y * n + x) * 4); }
  const c = n / 2, wide = draw((x, y) => capsule(x, y, c, c, n * 0.25, n * 0.125, false), [64, 186, 190], [[(x, y) => Math.abs(y - c) - n * 0.03, [244, 238, 222]], [(x, y) => Math.hypot(x - (c - n * 0.25), y - c) - n * 0.055, [250, 214, 72]]]);
  const tall = draw((x, y) => capsule(x, y, c, c, n * 0.25, n * 0.125, true), [232, 96, 80], [[(x, y) => Math.hypot(x - c, y - (c - n * 0.13)) - n * 0.06, [244, 238, 222]], [(x, y) => Math.max(Math.abs(x - c) - n * 0.07, Math.abs(y - (c + n * 0.2)) - n * 0.018), [250, 214, 72]]]);
  return { "compact (SYNTHETIC, D-264 badge)": compact, "wide (SYNTHETIC 3:1)": wide, "tall (SYNTHETIC 1:3)": tall };
}

/** The visible content: the bounding box of alpha >= RULE.alphaBox, the ink (alpha sum in pixels) and the alpha mass outside the box. */
export function visible(img) {
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1; for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) if (img.px[(y * img.w + x) * 4 + 3] >= RULE.alphaBox) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) throw new Error("the motif has no visible pixel");
  let ink = 0, outside = 0; for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) { const a = img.px[(y * img.w + x) * 4 + 3] / 255; ink += a; if (x < x0 || x > x1 || y < y0 || y > y1) outside += a; }
  return { box: [x0, y0, x1 - x0 + 1, y1 - y0 + 1], ink, outside };
}

/** THE SIZE RULE: the visible content as large as the box allows (contain), but at most RULE.inkShare of the box's area in ink. */
export function sizeFor(img, [bw, bh]) {
  const v = visible(img), [, , vw, vh] = v.box, fit = Math.min(bw / vw, bh / vh), byInk = Math.sqrt((RULE.inkShare * bw * bh) / v.ink), s = Math.min(fit, byInk);
  return { scale: s, w: Math.max(1, Math.round(vw * s)), h: Math.max(1, Math.round(vh * s)), limitedBy: fit <= byInk ? "box" : "ink", visible: v };
}

/** The motif prepared for a box: its visible content cropped and resampled (premultiplied area mean) to the rule's size. */
export function prepareFor(img, box) {
  const z = sizeFor(img, box), [x0, y0, vw, vh] = z.visible.box, c = new Uint8ClampedArray(vw * vh * 4);
  for (let y = 0; y < vh; y++) c.set(img.px.subarray(((y0 + y) * img.w + x0) * 4, ((y0 + y) * img.w + x0 + vw) * 4), y * vw * 4);
  return { img: TMM.resample({ w: vw, h: vh, px: c }, z.w, z.h, { samples: RULE.samples }), size: z };
}

/** The colour fringe of a prepared print: the mean luminance of its semi-transparent edge minus that of its opaque edge (a light matte
 *  rim is positive and large). D-267's limit (fringeLumMax) applies. */
export function fringe(p) {
  const n = p.w * p.h, op = new Uint8Array(n); for (let i = 0; i < n; i++) op[i] = p.px[i * 4 + 3] >= 248 ? 1 : 0;
  let sL = 0, sN = 0, oL = 0, oN = 0; for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) { const i = y * p.w + x, a = p.px[i * 4 + 3];
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const u = x + dx, v = y + dy; return u < 0 || v < 0 || u >= p.w || v >= p.h || p.px[(v * p.w + u) * 4 + 3] < 248; });
    if (a >= 8 && a < 248) { sL += lumOf(p.px, i); sN++; } else if (op[i] && nb) { oL += lumOf(p.px, i); oN++; } }
  return { semiLum: sN ? +(sL / sN).toFixed(1) : null, edgeLum: oN ? +(oL / oN).toFixed(1) : null, fringe: sN && oN ? +(sL / sN - oL / oN).toFixed(1) : 0, ok: !(sN && oN) || sL / sN - oL / oN <= TMM.ACCEPT.print.fringeLumMax };
}

/** A placement's box on the cut (canvas px): [x0, y0, w, h]. */
export function placementBox(g, name) {
  const P = PLACEMENTS[name], bw = g.bodyWidthBelowSleeves, cx = (g.bbox[0] + g.bbox[2]) / 2, w = Math.round(P.width * bw), h = Math.round(P.height * bw);
  return [Math.round(cx + P.x * bw - w / 2), Math.round(g.bbox[1] + P.y * g.height - h / 2), w, h];
}

/** The safe area's clearance: the chessboard distance (capped) from everything a print must not touch. */
export function clearance(master, t, bands, arms, cap = 40) {
  const bad = new Uint8Array(N); for (let i = 0; i < N; i++) bad[i] = !t.core[i] || master.panel[i] !== 0 || bands[i] || t.contour[i * 4 + 3] || arms[i * 4 + 3] >= 128 ? 1 : 0;
  const d = new Uint8Array(N).fill(cap); let cur = bad; for (let k = 0; k < cap; k++) { for (let i = 0; i < N; i++) if (cur[i] && d[i] === cap) d[i] = k; cur = WR.maskOps.dilate(cur, 1); }
  return d;
}
const boxMin = (d, [x0, y0, w, h]) => { let m = 1e9; for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) m = Math.min(m, d[y * W + x]); return m; };

/** The master's print path at a box (the same lines as TM.render's anchor print: the same displacement, the same shading ratio,
 *  nearest sample, then the cut's contour on top), on a rendered plain layer; the layers split by C's arms as TM.render does. */
export function placePrint(master, t, base, plain, img, [bx, by, bw, bh]) {
  const out = Uint8ClampedArray.from(plain), x0 = Math.round(bx + (bw - img.w) / 2), y0 = Math.round(by + (bh - img.h) / 2), foot = [];
  let mass = 0; for (let y = y0 - 8; y < y0 + img.h + 8; y++) for (let x = x0 - 8; x < x0 + img.w + 8; x++) { const i = y * W + x; if (!t.core[i]) continue; const sx = x - x0 + master.disp[i * 2], sy = y - y0 + master.disp[i * 2 + 1];
    if (sx < 0 || sy < 0 || sx >= img.w || sy >= img.h) continue; const j = ((sy | 0) * img.w + (sx | 0)) * 4, al = img.px[j + 3] / 255; if (!al) continue; foot.push(i); mass += al;
    for (let q = 0; q < 3; q++) out[i * 4 + q] = Math.min(255, Math.round(out[i * 4 + q] * (1 - al) + img.px[j + q] * master.ratio[i] * al)); }
  // the plain layer carries the contour already: it is laid again only where the print changed a pixel (a print on the contour is a
  // placement fault, counted; the safe area keeps it off)
  let onContour = 0; for (const i of foot) { const a = t.contour[i * 4 + 3]; if (!a) continue; onContour++; const kk = a / 255; for (let q = 0; q < 3; q++) out[i * 4 + q] = Math.round(t.contour[i * 4 + q] * kk + out[i * 4 + q] * (1 - kk)); }
  const tb = new Uint8ClampedArray(N * 4), sl = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) if (out[i * 4 + 3]) (base.arms[i * 4 + 3] >= 128 ? sl : tb).set(out.subarray(i * 4, i * 4 + 4), i * 4);
  return { layer: out, layers: { topBody: tb, sleeves: sl }, at: [x0, y0, img.w, img.h], footprint: foot, mass, onContour };
}

/** WCAG-style luminance contrast of two colours (a MEASURE for the visual review). */
export function contrast(a, b) { const l = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); }; const [p, q] = [l(a), l(b)].sort((x, y) => y - x); return +((p + 0.05) / (q + 0.05)).toFixed(2); }
/** The prepared print's outline colour (the median of its outermost opaque pixels) and its fill (alpha-weighted mean of the rest). */
export function motifColours(p) {
  const o = [], f = [0, 0, 0], at = (x, y) => (x < 0 || y < 0 || x >= p.w || y >= p.h ? 0 : p.px[(y * p.w + x) * 4 + 3]); let fa = 0;
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) { const i = (y * p.w + x) * 4, a = p.px[i + 3]; if (a < 248) continue; if ([[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]].some(([dx, dy]) => at(x + dx, y + dy) < 248)) o.push([p.px[i], p.px[i + 1], p.px[i + 2]]); else { for (let k = 0; k < 3; k++) f[k] += p.px[i + k]; fa++; } }
  const med = (k) => { const v = o.map((c) => c[k]).sort((a, b) => a - b); return v.length ? v[v.length >> 1] : 0; };
  return { outline: [0, 1, 2].map(med), fill: fa ? f.map((v) => Math.round(v / fa)) : [0, 1, 2].map(med) };
}

// ── the study on C ────────────────────────────────────────────────────────────────────────────────────────────────────────────
function prepareC() { const w = WR.buildWardrobe(), base = BC.prepareBase(w, Uint8ClampedArray.from(decodePng(IP.readC()).px)), T = BC.templatesC(w, base, { revision: "d213" }); return { w, base, T }; }
const FIGURE_CROP = [380, 450, 644, 830], CLOSE_CROP = [400, 470, 640, 700];
const nearest = (im, k) => { const o = new Uint8ClampedArray(im.w * k * im.h * k * 4); for (let y = 0; y < im.h * k; y++) for (let x = 0; x < im.w * k; x++) o.set(im.px.subarray((((y / k) | 0) * im.w + ((x / k) | 0)) * 4, (((y / k) | 0) * im.w + ((x / k) | 0)) * 4 + 4), (y * im.w * k + x) * 4); return { w: im.w * k, h: im.h * k, px: o }; };
const onGrey = (im, bg = [128, 128, 128]) => { const o = new Uint8ClampedArray(im.w * im.h * 4); for (let i = 0; i < im.w * im.h; i++) { const a = im.px[i * 4 + 3] / 255; for (let c = 0; c < 3; c++) o[i * 4 + c] = Math.round(im.px[i * 4 + c] * a + bg[c] * (1 - a)); o[i * 4 + 3] = 255; } return { w: im.w, h: im.h, px: o }; };
const slug = (s) => s.split(" ")[0];

async function study(OUT) {
  outDir(OUT); if (existsSync(join(OUT, "record.json"))) throw new Error("already studied into " + OUT + "; a record is never rewritten");
  const env = prepareC(), { w, base, T } = env, { t, src, cl } = RC.cutOf(env), master = TM.buildMaster(t, src), fp = TMM.masterFingerprint(master, t, cl.band);
  if (fp !== MASTER_FINGERPRINT) throw new Error("the master's fingerprint " + fp + " is not D-267's locked " + MASTER_FINGERPRINT + " — the master changed");
  const g = S1.geometry(t.core), bw = g.bodyWidthBelowSleeves, bg = [236, 233, 226], min = BF.minimumItems(base.R, base.sep.lab), dressed = (layers) => BF.layerProof(w, base.R, base.Z, { ...min, ...layers }, { sep: base.sep, headSeam: "d201", enclosure: "c-exterior" }).dressedRuntime;
  const pbuf = readFileSync(join(ART, ...PLANET.file.split("/"))); if (sha(pbuf) !== PLANET.sha256) throw new Error("the planet print is not TMG-2's received picture");
  const motifs = { "planet (TMG-2)": TMM.decodeRgba(pbuf), ...controlMotifs() }, clr = clearance(master, t, cl.band, base.arms);
  const cream = (() => { const s = M1.flatten(fromItem(env, "top-tee-hip-cream", "topBody")); return [0, 1, 2].map((k) => { const a = []; for (let i = 0; i < s.w * s.h; i++) a.push(s.px[i * 4 + k]); a.sort((x, y) => x - y); return a[a.length >> 1]; }); })();
  const colours = Object.fromEntries(Object.entries(COLOURS).map(([k, v]) => [k, v || cream]));
  const boxes = Object.fromEntries(Object.keys(PLACEMENTS).map((p) => [p, placementBox(g, p)])), anchorW = Math.round(TM.SPEC.anchors["chest-left"].width * bw);
  const record = { decision: "D-269", revision: REVISION, fingerprint: fp, bodyWidth: bw, cutHeight: g.height, margin: MARGIN, rule: RULE, placements: {}, colours, motifs: {}, renders: {}, visual: VISUAL, knownLimits: KNOWN_LIMITS, visualIsNeverAutomatic: true, approved: "nothing" };
  for (const [p, b] of Object.entries(boxes)) { let ratioMin = 9, ratioMax = 0; for (let y = b[1]; y < b[1] + b[3]; y++) for (let x = b[0]; x < b[0] + b[2]; x++) { const r = master.ratio[y * W + x]; ratioMin = Math.min(ratioMin, r); ratioMax = Math.max(ratioMax, r); }
    record.placements[p] = { spec: PLACEMENTS[p], box: b, minClearance: boxMin(clr, b), inSafeArea: boxMin(clr, b) >= MARGIN, shadingRatio: [+ratioMin.toFixed(3), +ratioMax.toFixed(3)] }; }
  const original = { box: null, anchorWidth: anchorW };
  // the plain shirts (one render per colour); every placed print must leave their alpha byte for byte
  const plain = Object.fromEntries(Object.entries(colours).map(([k, c]) => [k, TM.render(master, t, base, cl.band, { body: c })]));
  const alphaSame = (a, b) => { for (let i = 0; i < N; i++) if (a[i * 4 + 3] !== b[i * 4 + 3]) return false; return true; };
  // consistency: the module's print path at the original anchor reproduces TM.render's own anchor print byte for byte
  { const pr0 = TMM.preparePrint(motifs["planet (TMG-2)"], bw), a = TM.render(master, t, base, cl.band, { body: cream, print: { img: pr0, anchor: "chest-left" } }), b = placePrint(master, t, base, plain.cream.layer, pr0, a.placed[0].box);
    let diff = 0; for (let i = 0; i < N * 4; i++) if (a.layer[i] !== b.layer[i]) diff++; record.consistency = { anchorBox: a.placed[0].box, bytesDifferent: diff, ok: diff === 0 }; if (diff) throw new Error("the module's print path differs from the master's at the anchor (" + diff + " bytes)"); }
  const variants = [["original", "the D-267 rule: the square around the alpha box at the anchor's width (" + anchorW + " px)"], ["chest-left", "the size rule in the chest-left box"], ["chest-center", "the size rule in the chest-center box"]];
  const files = {}, sheet = { compare: [], close: [], app: [], appX3: [], colours: [] };
  mkdirSync(join(OUT, "preview"), { recursive: true }); const save = (n, im) => writeFileSync(join(OUT, n), encodePng(im.w, im.h, im.px));
  let fitDone = false;
  for (const [mName, img] of Object.entries(motifs)) {
    const v = visible(img); record.motifs[mName] = { synthetic: !mName.startsWith("planet"), visibleBox: v.box, ink: Math.round(v.ink), inkShareOfBox: +(v.ink / (v.box[2] * v.box[3])).toFixed(3), alphaOutsideBox: +v.outside.toFixed(2), aspect: +(v.box[2] / v.box[3]).toFixed(3), sizes: {} };
    for (const [variant] of variants) {
      const prep = variant === "original" ? { img: TMM.preparePrint(img, bw), size: { w: anchorW, h: anchorW, limitedBy: "anchor square", scale: null } } : prepareFor(img, [boxes[variant][2], boxes[variant][3]]);
      const vis = visible(prep.img), fr = fringe(prep.img), mc = motifColours(prep.img);
      record.motifs[mName].sizes[variant] = { prepared: [prep.img.w, prep.img.h], visible: [vis.box[2], vis.box[3]], limitedBy: prep.size.limitedBy, inkPx: Math.round(vis.ink), app: APP_SIZES.map(([aw]) => [+(vis.box[2] * aw / W).toFixed(1), +(vis.box[3] * aw / W).toFixed(1)]), fringe: fr, outline: mc.outline, fill: mc.fill };
      for (const [cName, col] of Object.entries(colours)) {
        const P = plain[cName], at = variant === "original" ? null : boxes[variant];
        const L = variant === "original" ? (() => { const r = TM.render(master, t, base, cl.band, { body: col, print: { img: prep.img, anchor: "chest-left" } }); const b = r.placed[0].box; const foot = []; for (let i = 0; i < N; i++) if (r.layer[i * 4] !== P.layer[i * 4] || r.layer[i * 4 + 1] !== P.layer[i * 4 + 1] || r.layer[i * 4 + 2] !== P.layer[i * 4 + 2]) foot.push(i); return { ...r, at: b, footprint: foot, mass: null }; })() : placePrint(master, t, base, P.layer, prep.img, at);
        let fMin = 1e9, rMin = 9, rMax = 0, dMax = 0; for (const i of L.footprint) { fMin = Math.min(fMin, clr[i]); rMin = Math.min(rMin, master.ratio[i]); rMax = Math.max(rMax, master.ratio[i]); dMax = Math.max(dMax, Math.hypot(master.disp[i * 2], master.disp[i * 2 + 1])); }
        const intended = variant === "original" ? null : vis.ink, placedShare = L.mass !== null && intended ? +(L.mass / intended).toFixed(3) : null;
        const checks = { alphaUnchanged: alphaSame(L.layer, P.layer), footprintInSafeArea: fMin >= 1, offContour: L.onContour === undefined ? null : L.onContour === 0,boxInSafeArea: at ? boxMin(clr, at) >= MARGIN : null, notClipped: placedShare === null ? null : placedShare >= 0.97, noFringe: fr.ok };
        if (!fitDone && checks.alphaUnchanged) { const f = R1.checkItem(w, base, T, t, L.layers); record.fit = { ok: f.ok, failed: f.failed, note: "the alpha is the plain shirt's on every render, so the fit and the outfits are the plain shirt's" }; fitDone = true; }
        const on = flat(dressed(L.layers), bg), key = slug(mName) + "-" + variant + "-" + cName;
        record.renders[key] = { motif: mName, placement: variant, colour: cName, at: L.at, footprintPx: L.footprint.length, footprintMinClearance: fMin === 1e9 ? null : fMin, shadingRatioUnderPrint: [+rMin.toFixed(3), +rMax.toFixed(3)], displacementMaxPx: +dMax.toFixed(2), placedInkShare: placedShare,
          contrast: { outline: contrast(mc.outline, col), fill: contrast(mc.fill, col) }, checks, ok: Object.values(checks).every((x) => x !== false) };
        const torso = crop(on, FIGURE_CROP, 2), close = crop(on, CLOSE_CROP, 2), a110 = down(on, 110, 165), a52 = down(on, 52, 78);
        for (const [suffix, im] of [["torso", torso], ["close", close], ["app110", a110], ["app52", a52]]) save(join("preview", key + "-" + suffix + ".png"), im);
        files[key] = true;
        if (cName === "cream") { sheet.compare.push(torso); sheet.close.push(close); sheet.app.push(a110, a52); sheet.appX3.push(nearest(a110, 3), nearest(a52, 3)); }
        if (mName.startsWith("planet")) sheet.colours.push({ c: cName, v: variant, tiles: [crop(on, FIGURE_CROP, 1), nearest(a110, 2), nearest(a52, 2)] });
      }
    }
  }
  save("tpf-motifs.png", grid(Object.values(motifs).map((m) => onGrey(TMM.resample(m, 256, 256, { samples: 4 }))), 4, 8));
  save("tpf-compare-torsos-x2.png", grid(sheet.compare, 3, 8)); save("tpf-closeups-x2.png", grid(sheet.close, 3, 8));
  save("tpf-app-actual.png", grid(sheet.app, 6, 6)); save("tpf-app-x3.png", grid(sheet.appX3, 6, 8)); save("tpf-colours-planet.png", grid(Object.keys(colours).flatMap((c) => variants.flatMap(([v]) => sheet.colours.find((x) => x.c === c && x.v === v).tiles)), 9, 6));
  record.sheets = {
    "tpf-motifs.png": "the four motifs on grey: planet (TMG-2), compact, wide, tall (SYNTHETIC controls)",
    "tpf-compare-torsos-x2.png": "rows: motifs (planet, compact, wide, tall); columns: original (D-267 rule), chest-left, chest-center; cream; torso at 2x",
    "tpf-closeups-x2.png": "the same order; print, neck rib and the chest at 2x",
    "tpf-app-actual.png": "the same rows; per column pair: 110x165 and 52x78 at ACTUAL size, for original, chest-left, chest-center",
    "tpf-app-x3.png": "the same as tpf-app-actual.png, enlarged 3x nearest-neighbour for inspection only",
    "tpf-colours-planet.png": "the planet; rows: cream, heather, coral, navy; per placement (original, chest-left, chest-center): torso 1x, 110x165 2x, 52x78 2x",
  };
  writeFileSync(join(OUT, "index.html"), previewHtml(record, Object.keys(motifs), variants, Object.keys(colours)));
  writeFileSync(join(OUT, "record.json"), JSON.stringify(record, null, 2) + "\n");
  const bad = Object.entries(record.renders).filter(([, r]) => !r.ok).map(([k, r]) => k + ":" + Object.entries(r.checks).filter(([, v]) => v === false).map(([c]) => c).join(","));
  console.log(JSON.stringify({ fingerprint: fp, placements: record.placements, consistency: record.consistency, fit: record.fit, renders: Object.keys(record.renders).length, failed: bad }));
}

/** The local preview: two panels side by side, each with its own motif, placement and colour (pre-rendered, private, file://). */
function previewHtml(record, motifs, variants, colours) {
  const opt = (vals, lab) => vals.map((v) => `<option value="${v}">${lab ? lab(v) : v}</option>`).join("");
  const VL = { original: "Original (D-267: 62 px-kvadrat ved ankeret)", "chest-left": "Lille brystmotiv (venstre bryst, ny regel)", "chest-center": "Stort motiv (midt på brystet, ny regel)" };
  const panel = (id, m, p, c) => `<section class="panel" id="${id}"><div class="ctl"><label>Motiv <select data-k="m">${opt(motifs.map(slug), (s) => motifs.find((x) => slug(x) === s))}</select></label>
  <label>Placering <select data-k="p">${opt(variants.map(([v]) => v), (v) => VL[v])}</select></label><label>T-shirt <select data-k="c">${opt(colours)}</select></label></div>
  <div class="imgs"><figure><img data-s="torso"><figcaption>Torso 2×</figcaption></figure><figure><img data-s="close"><figcaption>Nærbillede 2× (tryk, hals, bryst)</figcaption></figure>
  <figure class="app"><img data-s="app110" class="a1"><img data-s="app110" class="x3"><figcaption>110×165: faktisk størrelse og 3× forstørret</figcaption></figure>
  <figure class="app"><img data-s="app52" class="a1"><img data-s="app52" class="x4"><figcaption>52×78: faktisk størrelse og 4× forstørret</figcaption></figure></div><pre class="m"></pre></section>
  <script>init(${JSON.stringify(id)}, ${JSON.stringify(slug(m))}, ${JSON.stringify(p)}, ${JSON.stringify(c)});</script>`;
  return `<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Trykfamilie D-269</title>
<style>:root{--bg:#f4f2ee;--fg:#1d1d1f;--mut:#5b5b60;--card:#fff;--line:#d9d5cc}@media (prefers-color-scheme:dark){:root{--bg:#18181a;--fg:#eee;--mut:#a5a5ab;--card:#232326;--line:#3a3a3e}}
body{margin:0;padding:16px;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif}h1{font-size:18px;margin:0 0 4px}p.note{color:var(--mut);margin:0 0 12px;max-width:70em}
.wrap{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,560px),1fr));gap:16px}.panel{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px}
.ctl{display:flex;flex-wrap:wrap;gap:8px 16px;margin-bottom:8px}select{font:inherit}.imgs{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start}figure{margin:0}figcaption{color:var(--mut);font-size:12px}
.imgs img{display:block;max-width:100%;height:auto}.app img{display:inline-block;vertical-align:bottom;margin-right:8px;image-rendering:pixelated}.x3{width:330px}.x4{width:208px}.m{white-space:pre-wrap;font-size:12px;color:var(--mut);margin:8px 0 0}</style>
<script>const R=${JSON.stringify(record.renders)};function init(id,m,p,c){const s=document.getElementById(id),set=()=>{const v={};s.querySelectorAll("select").forEach(x=>v[x.dataset.k]=x.value);const k=v.m+"-"+v.p+"-"+v.c;
s.querySelectorAll("img").forEach(i=>i.src="preview/"+k+"-"+i.dataset.s+".png");const r=R[k];s.querySelector(".m").textContent=r?("Kontroller: "+Object.entries(r.checks).map(([a,b])=>a+" "+(b===null?"–":b?"ok":"FEJL")).join(" · ")+"\\nKontrast (måling, ikke dom): kontur "+r.contrast.outline+" · fyld "+r.contrast.fill+" · fodaftryk "+r.footprintPx+" px, mindste afstand til usikker flade "+r.footprintMinClearance+" px"):"";};
const d={m,p,c};s.querySelectorAll("select").forEach(x=>{x.value=d[x.dataset.k];x.onchange=set;});set();}</script></head><body>
<h1>Trykfamilie på T-shirt-masteren (D-269) — privat forhåndsvisning</h1>
<p class="note">Lokal og privat; viser C og må ikke offentliggøres. Planeten er D-267's TMG-2; de øvrige motiver er SYNTETISKE formatkontroller, ikke designs. Størrelsesregel: motivets synlige indhold så stort, som feltet tillader, dog højst ${RULE.inkShare * 100} % af feltets areal dækket af blæk. Intet er godkendt; vurderingen er visuel.</p>
<div class="wrap">${panel("A", motifs[0], "original", "cream")}${panel("B", motifs[0], "chest-center", "cream")}</div></body></html>
`;
}

async function main() {
  const args = process.argv.slice(2), at = (k) => args[args.indexOf(k) + 1];
  if (args.includes("--out")) return study(at("--out"));
  throw new Error("--out <dir outside the repo>");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error("REFUSED: " + e.message); process.exit(1); });
