// D-267 — GENERATED MATERIAL ON THE D-264 TEE MASTER: the lock, the fixed post-processing, the checks and the evaluation (no image call
// here; the send adapter is openai-send-northstar-tee-material-d267.mjs). Two deliveries, kept apart, never one sheet to segment:
//   TMG-1  a seamless patterned fabric swatch (1024x1024, opaque) — repetition, panel transitions, folds;
//   TMG-2  a standalone chest print on a transparent background (1024x1024) — a new detail at the existing anchor.
// THE LOCK: the master (D-264, tee-master-v1) is rebuilt on C and must give the pinned fingerprint (seams, panels, shading ratio,
// displacement, sleeve axes, the cut's alpha and D-257's bands); the tracked modules must have their pinned sha256. Nothing of the
// master, its mapping, the construction layer, the anchor or the post-processing is changed after receipt — a later change is a new
// method version, never a fix for one design.
// THE GENERAL RULES (per cut, never per design):
//   swatch  the tile holds exactly RULES.swatch.repeats x repeats of its motif; the whole tile is resampled (area mean, wrapped) to
//           RULES.swatch.tileOfBodyWidth x the cut's body width, so one repeat is body width / (2 x repeats) on every design;
//   print   the print is cropped to the square around its alpha bounding box (alpha >= 8) and resampled (premultiplied area mean) to
//           the anchor's width (D-264: 0.24 x body width); the anchor itself is the master's, unchanged.
// THE CHECKS are on the delivered material alone (before any mapping): a failure there is a material fault. Faults that also appear on
// the LOCAL TWIN (a synthetic gingham with the swatch's own colours and period, through the same master) are mapping faults — D-264's
// visible stripe unevenness is such a known mapping limit. Visual criteria are never automatic passes.
// Usage:
//   node tools/avatar/northstar-tee-material.mjs --fingerprint                          the master's fingerprint on C (needs C)
//   node tools/avatar/northstar-tee-material.mjs --study --out <dir outside the repo>     the checks on positive and negative examples
//   node tools/avatar/northstar-tee-material.mjs --from-calls --out <dir outside>        evaluate the received TMG-1 / TMG-2
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
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
import { fromItem } from "./northstar-r1-material-study.mjs";
import { syntheticPrint } from "./northstar-tee-master-study.mjs";
import { PARTNERS } from "./northstar-r1-proof.mjs";
import { inputs } from "./northstar-shape-experiment.mjs";
import { flat, crop, grid, down } from "./northstar-wardrobe-poc.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const ART = join(homedir(), "Documents", "DenSejeApp-artefacts"), CALLS_DIR = join(ART, "tm-material-calls"), { W, N } = WR;
const sha = (b) => createHash("sha256").update(b).digest("hex");
export const REVISION = "tm-material-v1";
export const PLAN_FILE = "tools/avatar/fixtures/northstar-wardrobe/tee-master/tm-material-plan-v1.json";
export const CALL_IDS = Object.freeze({ swatch: "TMG-1-tee-hip-swatch-gingham", print: "TMG-2-tee-hip-chest-print-planet" });
/** The general rules (per cut; the same for every design). */
export const RULES = Object.freeze({
  size: 1024,
  swatch: { repeats: 4, tileOfBodyWidth: 0.5, samples: 8 },
  print: { alphaBox: 8, samples: 8 },
});
/** Automatic thresholds (material only; set before any delivery, never changed after receipt). */
export const ACCEPT = Object.freeze({
  swatch: { periodRatioMax: 0.35, halfPeriodRatioMin: 0.6, blockSpreadMax: 6, seamFactor: 1.5, seamSlack: 2 },
  print: { borderPx: 16, borderAlphaMax: 8, transparentShareMin: 0.15, extentMin: 0.5, semiShareMax: 0.08, fringeLumMax: 40, haloShareMax: 0.005, specksMax: 3,
    componentsMax: 6, paletteCoverMin: 0.75 },
});
export const VISUAL = Object.freeze([
  "repetition: no visible tile edge, no repeating blemish or texture block at body or app size",
  "panel transitions: the check turns at the drawn armhole seam, both sleeves; no step down the chest side",
  "folds: the drawn fold strokes and shading cross the check once, not doubled; the check bends with them as far as the master allows (D-264: near-planar over broad areas)",
  "contours: neck rib, armholes, cuffs and hem keep one clean line; no outline of the swatch's own",
  "print: sits at the anchor on the chest, follows the fabric's shading, no white rim, no shadow or glow of its own, reads as printed on the fabric",
  "style: the material and the print belong to Northstar's painted cartoon look (line weight, flat cel colours) at full size, 110x165 and 52x78",
  "material vs mapping: a fault seen on the local twin as well is the master's (mapping); a fault only on the generated swatch is the material's",
  "the value of the call: compared with the local twin and D-264's synthetic print, does the generated material add anything visible",
]);
export const KNOWN_LIMITS = Object.freeze([
  "D-264: visible unevenness in straight stripes (the 3 px fold displacement and the shading ratio waver the band edges); a mapping limit, expected on the twin too",
  "D-264: near-planar mapping over broad areas, clipped highlights, weaker fold strokes on dark fabric, luminance-only shading",
  "the resampling to the body's scale (about 8x for the swatch, about 14x for the print) removes texture finer than a few source pixels",
]);

/** A PNG of 8-bit RGB (colour type 2: opaque) or RGBA (6), not interlaced, as RGBA; anything else is refused. */
export function decodeRgba(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47 || buf.readUInt32BE(4) !== 0x0d0a1a0a) throw new Error("not a PNG");
  let p = 8, hd = null; const idat = []; while (p + 12 <= buf.length) { const len = buf.readUInt32BE(p), type = buf.toString("ascii", p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") hd = { w: d.readUInt32BE(0), h: d.readUInt32BE(4), bitDepth: d[8], colourType: d[9], interlace: d[12] }; else if (type === "IDAT") idat.push(d); else if (type === "IEND") break; p += 12 + len; }
  if (!hd || hd.bitDepth !== 8 || ![2, 6].includes(hd.colourType) || hd.interlace !== 0) throw new Error("not an 8-bit RGB or RGBA PNG: " + JSON.stringify(hd));
  const bpp = hd.colourType === 6 ? 4 : 3, st = hd.w * bpp, raw = inflateSync(Buffer.concat(idat)); if (raw.length !== hd.h * (st + 1)) throw new Error("image data of " + raw.length + " bytes, expected " + hd.h * (st + 1));
  const cur = new Uint8Array(st), prev = new Uint8Array(st), px = new Uint8ClampedArray(hd.w * hd.h * 4);
  for (let y = 0; y < hd.h; y++) { const f = raw[y * (st + 1)], row = raw.subarray(y * (st + 1) + 1, (y + 1) * (st + 1));
    for (let i = 0; i < st; i++) { const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0; let v = row[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; } else if (f !== 0) throw new Error("bad filter " + f);
      cur[i] = v & 255; }
    for (let x = 0; x < hd.w; x++) { const o = (y * hd.w + x) * 4; px[o] = cur[x * bpp]; px[o + 1] = cur[x * bpp + 1]; px[o + 2] = cur[x * bpp + 2]; px[o + 3] = bpp === 4 ? cur[x * bpp + 3] : 255; } prev.set(cur); }
  return { w: hd.w, h: hd.h, px, colourType: hd.colourType };
}

/** An image of any size over a background colour, and its area-mean reduction (for the sheets only). */
const flatImg = (img, bg) => { const o = new Uint8ClampedArray(img.w * img.h * 4); for (let i = 0; i < img.w * img.h; i++) { const a = img.px[i * 4 + 3] / 255; for (let c = 0; c < 3; c++) o[i * 4 + c] = Math.round(img.px[i * 4 + c] * a + bg[c] * (1 - a)); o[i * 4 + 3] = 255; } return { w: img.w, h: img.h, px: o }; };
const lumOf = (P, i) => 0.299 * P[i * 4] + 0.587 * P[i * 4 + 1] + 0.114 * P[i * 4 + 2];

/** The master's fingerprint: everything the mapping uses, as bytes. */
export function masterFingerprint(master, t, bands) {
  const h = createHash("sha256");
  h.update(JSON.stringify({ revision: master.revision, spec: master.spec, seams: master.seams, axes: master.axes, base: master.base, sizes: master.sizes }));
  for (const a of [master.panel, master.ratio, master.disp, t.alpha, bands]) h.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
  return h.digest("hex");
}

/** Area resample by a fixed grid of samples per target pixel; wrap (seamless tile) or clamp; RGBA premultiplied. */
export function resample(img, w2, h2, { wrap = false, samples = 8 } = {}) {
  const out = new Uint8ClampedArray(w2 * h2 * 4), fx = img.w / w2, fy = img.h / h2, k = samples * samples;
  for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) { let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < samples; sy++) for (let sx = 0; sx < samples; sx++) { let u = Math.floor((x + (sx + 0.5) / samples) * fx), v = Math.floor((y + (sy + 0.5) / samples) * fy);
      if (wrap) { u = ((u % img.w) + img.w) % img.w; v = ((v % img.h) + img.h) % img.h; } else { u = Math.min(img.w - 1, Math.max(0, u)); v = Math.min(img.h - 1, Math.max(0, v)); }
      const j = (v * img.w + u) * 4, al = img.px[j + 3]; r += img.px[j] * al; g += img.px[j + 1] * al; b += img.px[j + 2] * al; a += al; }
    const o = (y * w2 + x) * 4; if (a > 0) { out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(b / a); } out[o + 3] = Math.round(a / k); }
  return { w: w2, h: h2, px: out };
}

/** The fixed post-processing of the swatch: the whole tile to RULES.swatch.tileOfBodyWidth x body width (wrapped area mean). */
export function prepareSwatch(img, bodyWidth) { const n = Math.round(RULES.swatch.tileOfBodyWidth * bodyWidth); return resample(img, n, n, { wrap: true, samples: RULES.swatch.samples }); }

/** The fixed post-processing of the print: the square around its alpha box, resampled to the anchor's width. */
export function preparePrint(img, bodyWidth, anchor = "chest-left") {
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1; for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) if (img.px[(y * img.w + x) * 4 + 3] >= RULES.print.alphaBox) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) throw new Error("the print has no opaque pixel");
  const s = Math.max(x1 - x0 + 1, y1 - y0 + 1), cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2, sx0 = Math.round(cx - s / 2), sy0 = Math.round(cy - s / 2), sq = new Uint8ClampedArray(s * s * 4);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) { const u = sx0 + x, v = sy0 + y; if (u >= 0 && v >= 0 && u < img.w && v < img.h) sq.set(img.px.subarray((v * img.w + u) * 4, (v * img.w + u) * 4 + 4), (y * s + x) * 4); }
  const wA = Math.round(TM.SPEC.anchors[anchor].width * bodyWidth); return resample({ w: s, h: s, px: sq }, wA, wA, { samples: RULES.print.samples });
}

/** The step across the tile's wrap edge against the step at the same phase one period in (the repeat boundaries inside the tile):
 *  a pattern edge that falls on the tile edge is no seam; a mismatch at the wrap is. Rows (vertical) and columns (horizontal). */
export function wrapSeam(img, repeats = RULES.swatch.repeats) {
  const n = img.w, p = n / repeats, L = (x, y) => lumOf(img.px, y * n + x), A = ACCEPT.swatch;
  const rowStep = (y1, y2) => { let t = 0; for (let x = 0; x < n; x++) t += Math.abs(L(x, y1) - L(x, y2)); return t / n; }, colStep = (x1, x2) => { let t = 0; for (let y = 0; y < n; y++) t += Math.abs(L(x1, y) - L(x2, y)); return t / n; };
  const inV = [], inH = []; for (let k = 1; k < repeats; k++) { inV.push(rowStep(k * p - 1, k * p)); inH.push(colStep(k * p - 1, k * p)); }
  const mean = (a) => a.reduce((s2, v) => s2 + v, 0) / a.length, v = rowStep(n - 1, 0), h = colStep(n - 1, 0), lv = A.seamFactor * mean(inV) + A.seamSlack, lh = A.seamFactor * mean(inH) + A.seamSlack;
  return { vertical: +v.toFixed(2), verticalLimit: +lv.toFixed(2), horizontal: +h.toFixed(2), horizontalLimit: +lh.toFixed(2), ok: v <= lv && h <= lh };
}

/** The swatch checks (material only): format, opaque, seamless at the wrap (wrapSeam), flat and no details (D-262's, at quarter size), the requested repeat count
 *  (the tile repeats at size/repeats and not at half of it), no baked shading (period-block means). */
export function swatchChecks(img) {
  const problems = [], n = RULES.size, rep = RULES.swatch.repeats, p = n / rep, A = ACCEPT.swatch;
  if (img.w !== n || img.h !== n) return { ok: false, problems: [`size ${img.w}x${img.h}, expected ${n}x${n}`] };
  let transparent = 0; for (let i = 0; i < n * n; i++) if (img.px[i * 4 + 3] < 255) transparent++;
  const q = resample(img, n / 4, n / 4, { wrap: true, samples: 4 }), d262 = M1.swatchChecks(q);
  const L = new Float32Array(n * n); for (let i = 0; i < n * n; i++) L[i] = lumOf(img.px, i);
  const diff = (dx, dy) => { let t = 0, c = 0; for (let y = 0; y < n; y += 3) for (let x = 0; x < n; x += 3) { t += Math.abs(L[y * n + x] - L[((y + dy) % n) * n + ((x + dx) % n)]); c++; } return t / c; };
  const base = (diff(p / 4, 0) + diff(0, p / 4) + diff(p / 2, 0) + diff(0, p / 2) + diff(p / 4, p / 4)) / 5 || 1e-6;
  const period = Math.max(diff(p, 0), diff(0, p)) / base, half = Math.min(diff(p / 2, 0), diff(0, p / 2)) / base;
  const blocks = []; for (let by = 0; by < rep; by++) for (let bx = 0; bx < rep; bx++) { let t = 0; for (let y = by * p; y < (by + 1) * p; y++) for (let x = bx * p; x < (bx + 1) * p; x++) t += L[y * n + x]; blocks.push(t / (p * p)); }
  const spread = Math.max(...blocks) - Math.min(...blocks);
  const seam = wrapSeam(img), checks = { opaque: transparent === 0, seamless: seam.ok, flat: d262.flat, noDetails: d262.noDetails, repeats: period <= A.periodRatioMax && half >= A.halfPeriodRatioMin, noBakedShading: spread <= A.blockSpreadMax };
  for (const [k, v] of Object.entries(checks)) if (!v) problems.push(k);
  return { ok: problems.length === 0, problems, checks, measures: { transparentPx: transparent, seam, d262Seam: d262.seam, broadLuminance: d262.broadLuminance, details: d262.details, detailBoxes: d262.detailBoxes,
    periodRatio: +period.toFixed(3), halfPeriodRatio: +half.toFixed(3), blockSpread: +spread.toFixed(2) } };
}

/** The print checks (material only): a transparent border and background, a sizeable graphic with margin, few semi-transparent
 *  pixels, no light matte fringe, no shadow or glow away from the graphic, no specks, flat colours (palette coverage). */
export function printChecks(img) {
  const problems = [], n = RULES.size, A = ACCEPT.print;
  if (img.w !== n || img.h !== n) return { ok: false, problems: [`size ${img.w}x${img.h}, expected ${n}x${n}`] };
  const a = (x, y) => img.px[(y * n + x) * 4 + 3];
  let border = 0, zero = 0, semi = 0, any = 0, x0 = n, y0 = n, x1 = -1, y1 = -1;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const v = a(x, y); if (v === 0) zero++; if (v >= 8) { any++; if (v < 248) semi++; } if ((x < A.borderPx || y < A.borderPx || x >= n - A.borderPx || y >= n - A.borderPx) && v > A.borderAlphaMax) border++;
    if (v >= 128) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
  const opaque = new Uint8Array(n * n); let nOpaque = 0; for (let i = 0; i < n * n; i++) if (img.px[i * 4 + 3] >= 248) { opaque[i] = 1; nOpaque++; }
  // distance (chessboard, up to 5) from the opaque body: a fringe is semi-transparent within 3 px; a shadow or glow lies farther out
  const near = WR.maskOps.dilate(opaque, 3), far = WR.maskOps.dilate(opaque, 5); let fringeL = 0, fringeN = 0, innerL = 0, innerN = 0, halo = 0;
  const inner = (() => { const e = WR.maskOps.dilate(Uint8Array.from(opaque, (v) => 1 - v), 3); return e; })();
  for (let i = 0; i < n * n; i++) { const v = img.px[i * 4 + 3]; if (v >= 8 && v < 248) { if (near[i]) { fringeL += lumOf(img.px, i); fringeN++; } if (!far[i]) halo++; } if (opaque[i] && inner[i]) { innerL += lumOf(img.px, i); innerN++; } }
  const fringe = fringeN && innerN ? fringeL / fringeN - innerL / innerN : 0;
  // components of alpha >= 128
  const m = new Uint8Array(n * n); for (let i = 0; i < n * n; i++) if (img.px[i * 4 + 3] >= 128) m[i] = 1; const seen = new Uint8Array(n * n), comps = [];
  for (let s = 0; s < n * n; s++) { if (!m[s] || seen[s]) continue; const q = [s]; seen[s] = 1; let c = 0; while (q.length) { const i = q.pop(), x = i % n; c++; for (const j of [i - 1, i + 1, i - n, i + n]) { if (j < 0 || j >= n * n || Math.abs((j % n) - x) > 1 || !m[j] || seen[j]) continue; seen[j] = 1; q.push(j); } } comps.push(c); }
  const total = comps.reduce((s2, c) => s2 + c, 0) || 1, big = comps.filter((c) => c >= 0.002 * total), specks = comps.filter((c) => c < 0.002 * total).length;
  // flat colours: the 12 most frequent colours (4 bits per channel) cover most of the opaque pixels
  const bins = new Map(); for (let i = 0; i < n * n; i++) if (opaque[i]) { const k = ((img.px[i * 4] >> 4) << 8) | ((img.px[i * 4 + 1] >> 4) << 4) | (img.px[i * 4 + 2] >> 4); bins.set(k, (bins.get(k) || 0) + 1); }
  const top = [...bins.values()].sort((p, q) => q - p).slice(0, 12).reduce((s2, c) => s2 + c, 0), cover = nOpaque ? top / nOpaque : 0;
  const extent = x1 < 0 ? 0 : Math.max(x1 - x0 + 1, y1 - y0 + 1) / n;
  const checks = { transparentBorder: border === 0, transparentBackground: zero / (n * n) >= A.transparentShareMin, sizeable: extent >= A.extentMin, fewSemiTransparent: any > 0 && semi / any <= A.semiShareMax,
    noLightFringe: fringe <= A.fringeLumMax, noShadowOrGlow: nOpaque > 0 && halo / nOpaque <= A.haloShareMax, noSpecks: specks <= A.specksMax && big.length <= A.componentsMax, flatColours: cover >= A.paletteCoverMin };
  for (const [k, v] of Object.entries(checks)) if (!v) problems.push(k);
  return { ok: problems.length === 0, problems, checks, measures: { borderPx: border, transparentShare: +(zero / (n * n)).toFixed(3), extent: +extent.toFixed(3), semiShare: any ? +(semi / any).toFixed(4) : null,
    fringeLum: +fringe.toFixed(1), haloShare: nOpaque ? +(halo / nOpaque).toFixed(4) : null, components: big.length, specks, paletteCover: +cover.toFixed(3) } };
}

/** The LOCAL TWIN of a gingham swatch: the same period and the swatch's own light, mid and dark colours, drawn exactly (SYNTHETIC). */
export function twinGingham(img) {
  const n = img.w, p = n / RULES.swatch.repeats, lv = []; for (let i = 0; i < n * n; i += 7) lv.push([lumOf(img.px, i), i]); lv.sort((a2, b2) => a2[0] - b2[0]);
  const med = (lo, hi) => { const part = lv.slice(Math.floor(lv.length * lo), Math.floor(lv.length * hi)); return [0, 1, 2].map((k) => { const v = part.map(([, i]) => img.px[i * 4 + k]).sort((a2, b2) => a2 - b2); return v[v.length >> 1]; }); };
  const dark = med(0, 0.15), mid = med(0.42, 0.58), light = med(0.85, 1), px = new Uint8ClampedArray(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const bx = (x % p) < p / 2, by = (y % p) < p / 2; px.set([...(bx && by ? dark : bx || by ? mid : light), 255], (y * n + x) * 4); }
  return { w: n, h: n, px, colours: { dark, mid, light } };
}

/** SYNTHETIC examples for the checks' own test (positive and negative); none is generated, none is a validation. */
export function examples() {
  const n = RULES.size, p = n / RULES.swatch.repeats, sq = (f) => { const px = new Uint8ClampedArray(n * n * 4); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) px.set(f(x, y), (y * n + x) * 4); return { w: n, h: n, px }; };
  const ging = (x, y, per = p) => { const bx = (x % per) < per / 2, by = (y % per) < per / 2; return bx && by ? [30, 84, 52, 255] : bx || by ? [128, 160, 132, 255] : [244, 238, 222, 255]; };
  const pr = syntheticPrint(96), big = (f) => sq((x, y) => { const u = Math.floor((x - 112) / 8.333), v = Math.floor((y - 112) / 8.333); let c = [0, 0, 0, 0]; if (u >= 0 && v >= 0 && u < 96 && v < 96) { const j = (v * 96 + u) * 4; c = [pr.px[j], pr.px[j + 1], pr.px[j + 2], pr.px[j + 3]]; } return f ? f(x, y, c) : c; });
  return {
    swatch: {
      "P-gingham (SYNTHETIC, 4x4, seamless)": { img: sq((x, y) => ging(x, y)), pass: true },
      "N-not seamless (tile cut off-period)": { img: sq((x, y) => ging(x + 37, y + 53, p * 1.07)), pass: false },
      "N-baked shading (vignette)": { img: sq((x, y) => { const c = ging(x, y), d = Math.hypot(x - n / 2, y - n / 2) / (n / 2), f = 1 - 0.28 * d * d; return [c[0] * f, c[1] * f, c[2] * f, 255]; }), pass: false },
      "N-unintended detail (a drawn label)": { img: sq((x, y) => (x >= 420 && x <= 560 && y >= 430 && y <= 500 && (x <= 423 || x >= 557 || y <= 433 || y >= 497) && (x % p) >= p / 2 && (y % p) >= p / 2 ? [150, 120, 100, 255] : ging(x, y))), pass: false },
      "N-wrong repeat count (8x8)": { img: sq((x, y) => ging(x, y, p / 2)), pass: false },
      "N-transparent pixels": { img: sq((x, y) => (x < 40 ? [0, 0, 0, 0] : ging(x, y))), pass: false },
    },
    print: {
      "P-flat badge (SYNTHETIC, D-264's print)": { img: big(), pass: true },
      "N-white background": { img: big((x, y, c) => (c[3] ? c : [255, 255, 255, 255])), pass: false },
      "N-drop shadow": { img: big((x, y, c) => { if (c[3]) return c; const j = (Math.floor((y - 112 - 24) / 8.333) * 96 + Math.floor((x - 112 - 24) / 8.333)) * 4, u = Math.floor((x - 136) / 8.333), v = Math.floor((y - 136) / 8.333); return u >= 0 && v >= 0 && u < 96 && v < 96 && pr.px[j + 3] ? [20, 20, 30, 90] : c; }), pass: false },
      "N-light matte fringe": { img: (() => { const im = big(), o = Uint8Array.from({ length: n * n }, (_, i) => (im.px[i * 4 + 3] ? 1 : 0)), d = WR.maskOps.dilate(o, 2); for (let i = 0; i < n * n; i++) if (d[i] && !o[i]) im.px.set([250, 250, 250, 160], i * 4); return im; })(), pass: false },
      "N-gradient shading": { img: big((x, y, c) => (c[3] ? [Math.min(255, c[0] * (0.55 + x / 1600)), Math.min(255, c[1] * (0.55 + y / 1600)), Math.min(255, c[2] * (0.6 + (x + y) / 3000)), 255] : c)), pass: false },
      "N-specks": { img: big((x, y, c) => (!c[3] && x > 60 && y > 60 && x < 964 && y < 964 && x % 97 < 2 && y % 89 < 2 ? [30, 42, 96, 255] : c)), pass: false },
      "N-touches the edge": { img: sq((x, y) => { const u = Math.floor((x + 120) / 10.67), v = Math.floor(y / 10.67); if (u >= 96) return [0, 0, 0, 0]; const j = (v * 96 + u) * 4; return [pr.px[j], pr.px[j + 1], pr.px[j + 2], pr.px[j + 3]]; }), pass: false },
    },
  };
}

// ── the evaluation on C ───────────────────────────────────────────────────────────────────────────────────────────────
function prepareC() { const w = WR.buildWardrobe(), base = BC.prepareBase(w, Uint8ClampedArray.from(decodePng(IP.readC()).px)), T = BC.templatesC(w, base, { revision: "d213" }); return { w, base, T }; }
function plan() { return JSON.parse(readFileSync(join(ROOT, ...PLAN_FILE.split("/")), "utf8")); }
/** The lock: the tracked modules' bytes and the master's fingerprint on C. Refuses on any difference. */
export function verifyLock(pl, fingerprint) {
  const problems = []; for (const [rel, want] of Object.entries(pl.lock.modules)) { let got = null; try { got = sha(readFileSync(join(ROOT, ...rel.split("/")))); } catch (_) { /* missing */ } if (got !== want) problems.push(rel + ": " + got + ", locked " + want); }
  if (fingerprint !== undefined && fingerprint !== pl.lock.masterFingerprint) problems.push("the master's fingerprint " + fingerprint + " is not the locked " + pl.lock.masterFingerprint);
  return problems;
}
function outDir(OUT) { const r = relative(ROOT, resolve(OUT || ".")); if (!OUT || !(r.startsWith("..") || isAbsolute(r))) throw new Error("--out must be outside the repository (the sheets show C)"); mkdirSync(OUT, { recursive: true }); return OUT; }

function renderSet(env, parts) {
  const { w, base, T } = env, { t, src, cl, master } = parts, bw = S1.geometry(t.core).bodyWidthBelowSleeves, bg = [236, 233, 226], FIGB = [250, 0, 774, 1536];
  const min = BF.minimumItems(base.R, base.sep.lab), dressed = (layers) => BF.layerProof(w, base.R, base.Z, { ...min, ...layers }, { sep: base.sep, headSeam: "d201", enclosure: "c-exterior" }).dressedRuntime;
  return { bw, bg, FIGB, dressed, render: (d) => TM.render(master, t, base, cl.band, d), fit: (L) => R1.checkItem(w, base, T, t, L), src };
}

async function study(OUT) {
  outDir(OUT); const env = prepareC(), { t, src, cl } = RC.cutOf(env), master = TM.buildMaster(t, src), fp = masterFingerprint(master, t, cl.band), R = renderSet(env, { t, src, cl, master });
  const ex = examples(), report = { decision: "D-267", revision: REVISION, fingerprint: fp, bodyWidth: R.bw, swatch: {}, print: {} };
  const tiles = [], torsos = [], apps = [], cream = (() => { const s = M1.flatten(fromItem(env, "top-tee-hip-cream", "topBody")), v = [0, 1, 2].map((k) => { const a = []; for (let i = 0; i < s.w * s.h; i++) a.push(s.px[i * 4 + k]); a.sort((x, y) => x - y); return a[a.length >> 1]; }); return v; })();
  for (const [name, e] of Object.entries(ex.swatch)) { const c = swatchChecks(e.img); report.swatch[name] = { expected: e.pass, ok: c.ok, problems: c.problems, measures: c.measures }; console.log("swatch", name, c.ok === e.pass ? "AS EXPECTED" : "UNEXPECTED", c.problems.join(",") || "pass");
    const L = R.render({ body: prepareSwatch(e.img, R.bw) }), on = R.dressed(L.layers); torsos.push(crop(flat(on, R.bg), [360, 420, 664, 860], 2)); apps.push(down(flat(on, R.bg), 110, 165), down(flat(on, R.bg), 52, 78)); tiles.push(flatImg(resample(e.img, 256, 256, { samples: 4 }), R.bg)); }
  for (const [name, e] of Object.entries(ex.print)) { const c = printChecks(e.img); report.print[name] = { expected: e.pass, ok: c.ok, problems: c.problems, measures: c.measures }; console.log("print", name, c.ok === e.pass ? "AS EXPECTED" : "UNEXPECTED", c.problems.join(",") || "pass");
    const L = R.render({ body: cream, print: { img: preparePrint(e.img, R.bw), anchor: "chest-left" } }); const on = R.dressed(L.layers); torsos.push(crop(flat(on, R.bg), [460, 500, 660, 660], 3)); }
  const save = (n, g) => writeFileSync(join(OUT, n), encodePng(g.w, g.h, g.px)); save("tmm-study-swatch-tiles.png", grid(tiles, tiles.length, 6)); save("tmm-study-torsos.png", grid(torsos, 6, 6)); save("tmm-study-app.png", grid(apps, 12, 6));
  writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2) + "\n"); console.log("fingerprint", fp, "bodyWidth", R.bw);
}

/** The evaluation of the received calls (each one present is evaluated; a record is never rewritten). */
async function fromCalls(OUT) {
  outDir(OUT); if (existsSync(join(OUT, "record.json"))) throw new Error("already evaluated into " + OUT + "; a record is never rewritten");
  const pl = plan(), lockFiles = verifyLock(pl); if (lockFiles.length) throw new Error("the lock does not hold: " + lockFiles.join("; "));
  const env = prepareC(), { t, src, cl } = RC.cutOf(env), master = TM.buildMaster(t, src), fp = masterFingerprint(master, t, cl.band), lockFp = verifyLock(pl, fp); if (lockFp.length) throw new Error("the lock does not hold: " + lockFp.join("; "));
  const R = renderSet(env, { t, src, cl, master }), record = { decision: "D-267", revision: REVISION, fingerprint: fp, bodyWidth: R.bw, calls: {}, visual: VISUAL, knownLimits: KNOWN_LIMITS, visualIsNeverAutomatic: true };
  const received = (id) => { const dir = join(CALLS_DIR, id), rc = join(dir, "tmm.receipt.json"); if (!existsSync(rc)) return null; const receipt = JSON.parse(readFileSync(rc, "utf8"));
    if (receipt.verdict !== "RECEIVED_FOR_CHECK") return { receipt }; const buf = readFileSync(join(dir, "tmm.image-1.png")); if (sha(buf) !== receipt.image.sha256) throw new Error(id + ": the stored picture is not the one received"); return { receipt, img: decodeRgba(buf), sha256: sha(buf) }; };
  const cream = (() => { const s = M1.flatten(fromItem(env, "top-tee-hip-cream", "topBody")); return [0, 1, 2].map((k) => { const a = []; for (let i = 0; i < s.w * s.h; i++) a.push(s.px[i * 4 + k]); a.sort((x, y) => x - y); return a[a.length >> 1]; }); })();
  const save = (n, g) => writeFileSync(join(OUT, n), encodePng(g.w, g.h, g.px)), orig = R.dressed(src.layers), boxes = { neck: [400, 440, 624, 540], "armhole left": [330, 480, 470, 660], "armhole right": [554, 480, 694, 660], hem: [380, 760, 644, 860], chest: [460, 500, 660, 660] };
  const memo = new Map(), ART2 = ART, itemOf = (id) => { if (memo.has(id)) return memo.get(id); const it = inputs("all").find((x) => x.id === id), b = readFileSync(join(ART2, ...it.raw.split("/"))); const r0 = IP.processItem(env.w, env.base, env.T, it.category, Uint8ClampedArray.from(decodePng(b).px), { itemId: id }); const v = { category: it.category, layers: r0.layers, covering: r0.covering || "none" }; memo.set(id, v); return v; };
  const sw = received(CALL_IDS.swatch);
  if (sw && sw.img) { const img = sw.img, c = swatchChecks(img), tile = prepareSwatch(img, R.bw), twin = twinGingham(img), twinTile = prepareSwatch(twin, R.bw);
    const Lg = R.render({ body: tile }), Lt = R.render({ body: twinTile }), fit = R.fit(Lg.layers); let holes = 0; for (let i = 0; i < N; i++) if (t.core[i] && Lg.layer[i * 4 + 3] < 128) holes++;
    const item = { category: "top", layers: Lg.layers, covering: t.covering, shadow: t.shadow }, outfits = {}; for (const bo of PARTNERS.bottom) for (const sh of PARTNERS.shoes) { const a = R1.checkOutfit(env.w, env.base, [item, itemOf(bo), itemOf(sh)]), o = R1.checkOutfit(env.w, env.base, [src, itemOf(bo), itemOf(sh)]); outfits[bo + "+" + sh] = { ok: a.ok, same: a.ok === o.ok && a.failed.join() === o.failed.join() }; }
    const onG = R.dressed(Lg.layers), onT = R.dressed(Lt.layers), ov = Object.values(outfits);
    save("tmm-swatch-raw.png", flatImg(img, R.bg));
    save("tmm-swatch-wrap-2x2.png", (() => { const n = img.w, h = n / 2, px = new Uint8ClampedArray(n * n * 4); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) px.set(img.px.subarray((((y + h) % n) * n + ((x + h) % n)) * 4, (((y + h) % n) * n + ((x + h) % n)) * 4 + 4), (y * n + x) * 4); return { w: n, h: n, px }; })());
    save("tmm-swatch-torsos-x2.png", grid([crop(flat(orig, R.bg), [360, 420, 664, 860], 2), crop(flat(onT, R.bg), [360, 420, 664, 860], 2), crop(flat(onG, R.bg), [360, 420, 664, 860], 2)], 3, 8));
    save("tmm-swatch-closeups-x3.png", grid(Object.values(boxes).slice(0, 4).flatMap((b) => [crop(flat(onT, R.bg), b, 3), crop(flat(onG, R.bg), b, 3)]), 2, 6));
    save("tmm-swatch-app.png", grid([down(flat(onT, R.bg), 110, 165), down(flat(onG, R.bg), 110, 165), down(flat(onT, R.bg), 52, 78), down(flat(onG, R.bg), 52, 78)], 4, 6));
    record.calls[CALL_IDS.swatch] = { imageSha256: sw.sha256, checks: c, twin: { colours: twin.colours, note: "SYNTHETIC local twin: same period and colours, through the same master" }, holes, fit: { ok: fit.ok, failed: fit.failed }, outfits: { same: ov.filter((v) => v.same).length + "/" + ov.length, detail: outfits },
      classification: !c.checks.opaque || !c.checks.repeats || holes || !fit.ok ? "technically-rejected" : "requires-visual-review", visualReview: "PENDING — never automatic" };
  } else if (sw) record.calls[CALL_IDS.swatch] = { receipt: sw.receipt.verdict, classification: "technically-rejected", reason: "format at receipt" };
  const pr = received(CALL_IDS.print);
  if (pr && pr.img) { const img = pr.img, c = printChecks(img), small = preparePrint(img, R.bw), ref = preparePrint(examples().print["P-flat badge (SYNTHETIC, D-264's print)"].img, R.bw);
    const Lg = R.render({ body: cream, print: { img: small, anchor: "chest-left" } }), Lr = R.render({ body: cream, print: { img: ref, anchor: "chest-left" } }), onG = R.dressed(Lg.layers), onR = R.dressed(Lr.layers);
    save("tmm-print-raw.png", grid([flatImg(img, [128, 128, 128]), flatImg(img, [250, 250, 250]), flatImg(img, [20, 20, 30])], 3, 8));
    save("tmm-print-torsos-x2.png", grid([crop(flat(onR, R.bg), [360, 420, 664, 860], 2), crop(flat(onG, R.bg), [360, 420, 664, 860], 2)], 2, 8));
    save("tmm-print-closeups-x4.png", grid([crop(flat(onR, R.bg), boxes.chest, 4), crop(flat(onG, R.bg), boxes.chest, 4)], 2, 6));
    save("tmm-print-app.png", grid([down(flat(onR, R.bg), 110, 165), down(flat(onG, R.bg), 110, 165), down(flat(onR, R.bg), 52, 78), down(flat(onG, R.bg), 52, 78)], 4, 6));
    record.calls[CALL_IDS.print] = { imageSha256: pr.sha256, checks: c, placed: Lg.placed, classification: !c.checks.transparentBorder || !c.checks.transparentBackground || !c.checks.sizeable ? "technically-rejected" : "requires-visual-review", visualReview: "PENDING — never automatic" };
  } else if (pr) record.calls[CALL_IDS.print] = { receipt: pr.receipt.verdict, classification: "technically-rejected", reason: "format at receipt" };
  writeFileSync(join(OUT, "record.json"), JSON.stringify(record, null, 2) + "\n"); console.log(JSON.stringify(Object.fromEntries(Object.entries(record.calls).map(([k, v]) => [k, { classification: v.classification, problems: v.checks && v.checks.problems }]))));
}

async function main() {
  const args = process.argv.slice(2), at = (k) => args[args.indexOf(k) + 1];
  if (args.includes("--fingerprint")) { const env = prepareC(), { t, src, cl } = RC.cutOf(env), master = TM.buildMaster(t, src); console.log(JSON.stringify({ fingerprint: masterFingerprint(master, t, cl.band), bodyWidth: S1.geometry(t.core).bodyWidthBelowSleeves })); return; }
  if (args.includes("--study")) return study(at("--out"));
  if (args.includes("--from-calls")) return fromCalls(at("--out"));
  throw new Error("one of --fingerprint, --study --out <dir>, --from-calls --out <dir>");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error("REFUSED: " + e.message); process.exit(1); });
