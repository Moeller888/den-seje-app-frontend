// D-156 follow-up — offline EVIDENCE review of D-153's background and of D-155's halo reading.
// NO NETWORK, NO MODEL, NO CLAIM, NO CALL-ID, NO REQUEST PACKAGE. Writes no file. It does NOT change any gate:
// the existing D-152 / D-155 gates are only called; every alternative background estimate here is a DIAGNOSTIC comparison.
//
// 1  format: PNG colour type and the alpha actually present (true transparency vs an opaque painted pattern);
// 2  the pattern: a deterministic checkerboard fit (cell size from run lengths, phase by exhaustive search) and its
//    agreement over every H1-transparent background pixel;
// 3  D-155's 5,520 band pixels (2.3 < ΔE00 ≤ 5 to the median background): what each can be explained by, and what
//    the image alone cannot decide;
// 4  gate sensitivity to background sampling on synthetic two-tone backgrounds, independent of D-153.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { SOLID_ALPHA } from "./build-r3-head-edit-masks.mjs";
import { HEAD_MAX_Y } from "./build-r3-head-geometry.mjs";
import { REGIONS, regionOf, toLab, deltaE00, SEAM } from "./build-r3-head-colour-fixtures.mjs";
import { decodeOutputRgbOrRgba, backgroundLeakGate, LEAK_RULE } from "./r3-head-colour-opaque-output.mjs";
import { coverageGate, estimateBackground, backgroundShare, detectors } from "./r3-head-colour-coverage-gate.mjs";
import { PINS } from "./analyse-r3-head-colour-d155.mjs";

export const DECISION = "D-156";
export const STATUS = "D-156 FOLLOW-UP — OFFLINE EVIDENCE REVIEW ONLY — NO IMAGE REQUEST AUTHORISED";
export const CALL_ID = "UNASSIGNED";
export const CLAIM_IDENTITY = "NONE";
const W = 1024, N = W * 1536;
const yOf = (p) => (p / W) | 0;
const sha = (b) => createHash("sha256").update(b).digest("hex");
const JND = LEAK_RULE.jndDE00;
const SKIN = Object.freeze([...SEAM.S1.expectedNsMedianRGB]);

/** 1 — PNG header facts: colour type, bit depth, chunk types; and the alpha the decoder actually yields. */
export function pngFacts(buf) {
  if (!Buffer.isBuffer(buf) || buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  const chunks = new Set(); let i = 8;
  while (i + 8 <= buf.length) { const len = buf.readUInt32BE(i), type = buf.toString("latin1", i + 4, i + 8); chunks.add(type); i += 12 + len; if (type === "IEND") break; }
  const rgba = decodeOutputRgbOrRgba(buf).rgba; let opaque = 0, minA = 255;
  for (let p = 0; p < N; p++) { const a = rgba[p * 4 + 3]; if (a === 255) opaque++; if (a < minA) minA = a; }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bitDepth: buf[24], colourType: buf[25], hasAlphaChannel: buf[25] === 4 || buf[25] === 6,
    hasTRNS: chunks.has("tRNS"), chunks: [...chunks].sort(), opaquePx: opaque, totalPx: N, minAlpha: minA };
}

/** Two-means on the red channel over a mask (deterministic: start at min/max, 20 iterations). */
function twoTones(src, mask) {
  let lo = 255, hi = 0; for (let p = 0; p < N; p++) if (mask[p]) { lo = Math.min(lo, src[p * 4]); hi = Math.max(hi, src[p * 4]); }
  let cut = (lo + hi) / 2, means = null;
  for (let it = 0; it < 20; it++) {
    const s = [[0, 0, 0, 0], [0, 0, 0, 0]];
    for (let p = 0; p < N; p++) if (mask[p]) { const k = src[p * 4] < cut ? 0 : 1; for (let c = 0; c < 3; c++) s[k][c] += src[p * 4 + c]; s[k][3]++; }
    means = s.map((v) => v.slice(0, 3).map((x) => (v[3] ? x / v[3] : 0)));
    const nc = (means[0][0] + means[1][0]) / 2; if (Math.abs(nc - cut) < 1e-9) break; cut = nc;
  }
  return { dark: means[0].map((v) => +v.toFixed(1)), light: means[1].map((v) => +v.toFixed(1)), cut: +cut.toFixed(2) };
}

/**
 * 2 — Checkerboard fit over `mask`: cell size = the modal horizontal run length of the dark/light classes, phase by
 * exhaustive search over all P×P offsets. Agreement is reported over all mask pixels and over pixels not adjacent to a
 * predicted cell boundary. Two brightness groups alone would give ~50 % agreement for a random arrangement.
 */
export function fitChecker(src, mask) {
  const t = twoTones(src, mask), dark = (p) => src[p * 4] < t.cut;
  const runs = new Map();
  for (let y = 0; y < 1536; y++) { let run = 0, prev = null; for (let x = 0; x < W; x++) { const p = y * W + x; if (!mask[p]) { if (prev !== null && run) runs.set(run, (runs.get(run) || 0) + 1); run = 0; prev = null; continue; } const d = dark(p); if (d === prev) run++; else { if (prev !== null && run) runs.set(run, (runs.get(run) || 0) + 1); run = 1; prev = d; } } }
  let P = 0, best = -1; for (const [len, n] of runs) if (len >= 2 && n > best) { best = n; P = len; }
  if (P < 2) return { cell: null, tones: t };
  const pts = []; for (let p = 0; p < N; p++) if (mask[p]) pts.push(p);
  let fit = { agreement: -1 };
  for (let oy = 0; oy < P; oy++) for (let ox = 0; ox < P; ox++) {
    let a = 0; for (const p of pts) { const par = ((((p % W) + ox) / P | 0) + ((yOf(p) + oy) / P | 0)) & 1; if ((par === 0) === dark(p)) a++; }
    const agr = Math.max(a, pts.length - a);
    if (agr > fit.agreement) fit = { agreement: agr, ox, oy, darkParity: a >= pts.length - a ? 0 : 1 };
  }
  const parityOf = (x, y) => ((((x + fit.ox) / P | 0) + ((y + fit.oy) / P | 0)) & 1);
  const nearBoundary = (x, y) => { const mx = (x + fit.ox) % P, my = (y + fit.oy) % P; return mx === 0 || mx === P - 1 || my === 0 || my === P - 1; };
  let inner = 0, innerOk = 0, darkCount = 0;
  for (const p of pts) { const x = p % W, y = yOf(p); if (dark(p)) darkCount++; if (nearBoundary(x, y)) continue; inner++; if ((parityOf(x, y) === fit.darkParity) === dark(p)) innerOk++; }
  return { cell: P, offset: [fit.ox, fit.oy], darkParity: fit.darkParity, px: pts.length, agreement: +(fit.agreement / pts.length).toFixed(5),
    innerPx: inner, innerAgreement: +(innerOk / inner).toFixed(5), darkShare: +(darkCount / pts.length).toFixed(4), tones: t,
    runLengthMode: { length: P, count: best }, parityOf, nearBoundary };
}

/** Minimum ΔE00 from colour c to the straight RGB blend between a and b (33 samples). */
export function blendDistance(c, a, b) {
  const lc = toLab(c); let m = Infinity;
  for (let k = 0; k <= 32; k++) { const t = k / 32; m = Math.min(m, deltaE00(lc, toLab([0, 1, 2].map((i) => Math.round(a[i] * (1 - t) + b[i] * t))))); }
  return m;
}

/**
 * 3 — Each D-155 band pixel (head, 2.3 < ΔE00 ≤ 5 to the median background) gets ONE category, tested in this order:
 *   pattern-tone      — within JND of the tone the fitted checkerboard predicts AT THAT POSITION: a painted background cell
 *                       that falls in the band only because the median background sits on the other tone;
 *   pattern-boundary  — on the blend between the two tones (≤ JND) and adjacent to a predicted cell boundary;
 *   skin-mix          — on a skin↔tone blend (≤ JND), ≤ 2 px from model paint, and not on the outline↔tone blend;
 *   outline-mix       — on the model-outline↔tone blend (≤ JND), ≤ 2 px from model paint, and not on a skin↔tone blend;
 *   tone-misplaced    — a background grey that does not match its predicted cell: the image alone cannot decide why;
 *   ambiguous         — fits several mixes, or a mix that is not next to model paint: undecidable from the image;
 *   unexplained       — fits nothing above.
 * "Model paint" = a pixel more than ΔE00 5 from both tones. Every band pixel lies inside E2, so each one exists only
 * because the model's own silhouette is smaller than E2 or its ears sit elsewhere; the category says what its colour is.
 */
export const BAND_CATEGORIES = Object.freeze(["pattern-tone", "pattern-boundary", "skin-mix", "outline-mix", "tone-misplaced", "ambiguous", "unexplained"]);
export function decomposeBand(raw, { head, background, tones, checker, outline }) {
  const bgLab = toLab(background), dLab = toLab(tones.dark), lLab = toLab(tones.light);
  const paint = new Uint8Array(N);
  for (let p = 0; p < N; p++) { if (yOf(p) > HEAD_MAX_Y) continue; const c = toLab([raw[p * 4], raw[p * 4 + 1], raw[p * 4 + 2]]); if (deltaE00(c, dLab) > 5 && deltaE00(c, lLab) > 5) paint[p] = 1; }
  const dist = new Uint8Array(N).fill(255), q = [];
  for (let p = 0; p < N; p++) if (paint[p]) { dist[p] = 0; q.push(p); }
  for (let h = 0; h < q.length; h++) { const p = q[h], x = p % W; if (dist[p] >= 8) continue; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, r = p + dy * W + dx; if (xx < 0 || xx >= W || r < 0 || r >= N || dist[r] <= dist[p] + 1) continue; dist[r] = dist[p] + 1; q.push(r); } }
  const zero = () => Object.fromEntries(BAND_CATEGORIES.map((k) => [k, 0]));
  const cats = zero(), byRegion = Object.fromEntries(REGIONS.map((r) => [r, zero()])), tone = { dark: 0, light: 0 };
  const label = new Uint8Array(N); let total = 0, nearPaint = 0, neutral = 0;
  for (let p = 0; p < N; p++) {
    if (!head[p]) continue; const c = [raw[p * 4], raw[p * 4 + 1], raw[p * 4 + 2]], lab = toLab(c), de = deltaE00(lab, bgLab);
    if (!(de > JND && de <= 5)) continue; total++;
    if (Math.hypot(lab[1], lab[2]) <= 2) neutral++;
    const x = p % W, y = yOf(p), near = dist[p] <= 2; if (near) nearPaint++;
    const predDark = checker.parityOf(x, y) === checker.darkParity;
    let k;
    if (deltaE00(lab, predDark ? dLab : lLab) <= JND) { k = "pattern-tone"; tone[predDark ? "dark" : "light"]++; }
    else {
      const onTone = blendDistance(c, tones.dark, tones.light) <= JND;
      if (onTone && checker.nearBoundary(x, y)) k = "pattern-boundary";
      else {
        const onSkin = Math.min(blendDistance(c, SKIN, tones.dark), blendDistance(c, SKIN, tones.light)) <= JND;
        const onLine = Math.min(blendDistance(c, outline, tones.dark), blendDistance(c, outline, tones.light)) <= JND;
        if (onSkin && !onLine) k = near ? "skin-mix" : "ambiguous";
        else if (onLine && !onSkin) k = near ? "outline-mix" : "ambiguous";
        else if (onSkin && onLine) k = "ambiguous";
        else k = onTone ? "tone-misplaced" : "unexplained";
      }
    }
    cats[k]++; byRegion[regionOf(x, y)][k]++; label[p] = BAND_CATEGORIES.indexOf(k) + 1;
  }
  return { total, categories: cats, patternToneBy: tone, neutralGreyPx: neutral, byRegion, nearModelPaintPx: nearPaint, farFromModelPaintPx: total - nearPaint, label, paint };
}

/** Background-dependent counts under alternative background estimates — DIAGNOSTIC comparisons only. */
export function backgroundSensitivity(raw, { geom, distance, estimates }) {
  return estimates.map(({ id, rgb }) => {
    const det = detectors(raw, { geom, background: rgb, share: backgroundShare(raw, rgb), distance });
    let core = 0, band = 0, m3 = 0;
    for (let p = 0; p < N; p++) { if (!geom[p] || yOf(p) > HEAD_MAX_Y) continue; if (det.core[p]) core++; if (det.de[p] > JND && det.de[p] <= 5) band++; if (det.m3[p]) m3++; }
    return { id, background: rgb, core, band2_3to5: band, d155Uncovered: m3 };
  });
}

/**
 * A two-tone diagnostic: background-like = within JND of the tone blend; uncovered = 8-connected (through background-like
 * pixels, rows ≤ 424) to background-like pixels outside the head. Comparison only; NOT a gate.
 */
export function twoToneUncovered(src, { head, tones }) {
  const bg = new Uint8Array(N); for (let p = 0; p < (HEAD_MAX_Y + 1) * W; p++) bg[p] = blendDistanceFast(src, p, tones) <= JND ? 1 : 0;
  const seen = new Uint8Array(N), st = []; let n = 0;
  for (let p = 0; p < (HEAD_MAX_Y + 1) * W; p++) if (!head[p] && bg[p]) { seen[p] = 1; st.push(p); }
  while (st.length) { const p = st.pop(), x = p % W; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, q = p + dy * W + dx; if ((!dx && !dy) || xx < 0 || xx >= W || q < 0 || yOf(q) > HEAD_MAX_Y || seen[q] || !bg[q]) continue; seen[q] = 1; st.push(q); if (head[q]) n++; } }
  return n;
}
const toneCache = new Map();
function blendDistanceFast(src, p, tones) {
  const key = (src[p * 4] << 16) | (src[p * 4 + 1] << 8) | src[p * 4 + 2]; let v = toneCache.get(key);
  if (v === undefined) { v = blendDistance([src[p * 4], src[p * 4 + 1], src[p * 4 + 2]], tones.dark, tones.light); toneCache.set(key, v); }
  return v;
}

/** 4 — Synthetic two-tone backgrounds (independent of D-153): which leaks does each gate catch? */
export function syntheticBackgroundCases() {
  return [
    { id: "uniform-clean", bg: "uniform", leak: null, expect: "pass" },
    { id: "uniform-leak", bg: "uniform", leak: "all", expect: "fail" },
    { id: "checker50-clean", bg: "checker", dark: 0.5, leak: null, expect: "pass" },
    { id: "checker50-leak", bg: "checker", dark: 0.5, leak: "all", expect: "fail" },
    { id: "checker50-leak-dark-cells", bg: "checker", dark: 0.5, leak: "dark", expect: "fail" },
    { id: "checker50-leak-light-cells", bg: "checker", dark: 0.5, leak: "light", expect: "fail" },
    { id: "checker62-dark-leak-light-cells", bg: "checker", dark: 0.625, leak: "light", expect: "fail" },
    { id: "checker38-dark-leak-dark-cells", bg: "checker", dark: 0.375, leak: "dark", expect: "fail" },
    { id: "checker50-soft-edges-clean", bg: "checker", dark: 0.5, soft: true, leak: null, expect: "pass" },
  ];
}
export function syntheticBackground(ctx, c, { tones = { dark: [228, 228, 228], light: [250, 250, 249] }, P = 16 } = {}) {
  const darkCols = Math.round(c.dark * 2 * P);
  const toneAt = (x, y) => {
    if (c.bg === "uniform") return [245, 245, 245];
    const mx = x % (2 * P), my = (y / P | 0) & 1, isDark = (mx < darkCols) !== (my === 1);
    let col = isDark ? tones.dark : tones.light;
    if (c.soft && (mx === 0 || mx === darkCols || mx === darkCols - 1 || mx === 2 * P - 1)) col = tones.dark.map((v, k) => Math.round((v + tones.light[k]) / 2));
    return col;
  };
  const o = Buffer.alloc(N * 4);
  for (let p = 0; p < N; p++) {
    const x = p % W, y = yOf(p);
    if (y > HEAD_MAX_Y && ctx.inp.transition[p]) { o.set([253, 197, 128, 255], p * 4); continue; }
    const t = toneAt(x, y), isDarkTone = t[0] === tones.dark[0];
    let col = ctx.head[p] ? [ctx.u1[p * 4], ctx.u1[p * 4 + 1], ctx.u1[p * 4 + 2]] : t;
    if (ctx.head[p] && c.leak && ctx.sdf.sd[p] <= 6 && (c.leak === "all" || (c.leak === "dark") === isDarkTone)) col = t;
    o.set([...col, 255], p * 4);
  }
  return o;
}
export function runSyntheticBackgroundCases(ctx) {
  const tones = { dark: [228, 228, 228], light: [250, 250, 249] };
  return syntheticBackgroundCases().map((c) => {
    const src = syntheticBackground(ctx, c, { tones });
    const est = estimateBackground(src, { h1Rgba: ctx.h1T, apiEdit: ctx.apiEdit });
    const old = backgroundLeakGate(src, { h1Rgba: ctx.h1T, geom: ctx.inp.geom, apiEdit: ctx.apiEdit });
    const g = coverageGate(src, { h1Rgba: ctx.h1T, geom: ctx.inp.geom, apiEdit: ctx.apiEdit, distance: ctx.distance });
    const tt = twoToneUncovered(src, { head: ctx.head, tones: c.bg === "uniform" ? { dark: [245, 245, 245], light: [245, 245, 245] } : tones });
    const v = (pass) => (pass ? "pass" : "fail");
    return { id: c.id, expect: c.expect, median: est.background, old: { verdict: v(old.pass), leaks: old.total ?? 0 }, d155: { verdict: v(g.pass), uncovered: g.uncovered ?? null },
      twoToneDiagnostic: { verdict: v(tt === 0), uncovered: tt } };
  });
}

/** The whole follow-up review on D-153's hash-verified raw output and the pinned H1 (both local, read-only). */
export function review(ctx, { rawBuf, h1Rgba }) {
  if (!Buffer.isBuffer(rawBuf) || sha(rawBuf) !== PINS.raw.sha256) throw new Error("the D-153 raw output does not match its pin");
  const facts = pngFacts(rawBuf), raw = decodeOutputRgbOrRgba(rawBuf).rgba;
  const bgMask = new Uint8Array(N); for (let p = 0; p < N; p++) if (h1Rgba[p * 4 + 3] === 0 && !ctx.apiEdit[p] && !ctx.head[p]) bgMask[p] = 1;
  const probeMask = new Uint8Array(N); for (let y = LEAK_RULE.probeRows[0]; y <= LEAK_RULE.probeRows[1]; y++) for (let x = 0; x < W; x++) { const p = y * W + x; if (h1Rgba[p * 4 + 3] === 0 && !ctx.apiEdit[p]) probeMask[p] = 1; }
  const probeFit = fitChecker(raw, probeMask), checker = probeFit;
  const neutralMask = new Uint8Array(N);
  for (let p = 0; p < N; p++) { const r = raw[p * 4], g = raw[p * 4 + 1], b = raw[p * 4 + 2]; if (bgMask[p] && r >= 215 && Math.abs(r - g) <= 4 && Math.abs(g - b) <= 4) neutralMask[p] = 1; }
  let nAll = 0, nOk = 0, nInner = 0, nInnerOk = 0;
  for (let p = 0; p < N; p++) { if (!neutralMask[p]) continue; const x = p % W, y = yOf(p), dark = raw[p * 4] < probeFit.tones.cut, pred = probeFit.parityOf(x, y) === probeFit.darkParity; nAll++; if (dark === pred) nOk++; if (!probeFit.nearBoundary(x, y)) { nInner++; if (dark === pred) nInnerOk++; } }
  const global = { neutralBackgroundPx: nAll, agreement: +(nOk / nAll).toFixed(5), innerPx: nInner, innerAgreement: +(nInnerOk / nInner).toFixed(5), shareOfH1TransparentBackground: +(nAll / bgMask.reduce((a, v) => a + v, 0)).toFixed(4) };
  const est = estimateBackground(raw, { h1Rgba, apiEdit: ctx.apiEdit });
  const darks = []; for (let p = 0; p < N; p++) if (ctx.head[p] && toLab([raw[p * 4], raw[p * 4 + 1], raw[p * 4 + 2]])[0] < 40) darks.push(p);
  const med = (k) => { const v = darks.map((p) => raw[p * 4 + k]).sort((a, b) => a - b); return v.length ? v[v.length >> 1] : 0; };
  const outline = [med(0), med(1), med(2)];
  const band = decomposeBand(raw, { head: ctx.head, background: est.background, tones: checker.tones, checker, outline });
  const sens = backgroundSensitivity(raw, { geom: ctx.inp.geom, distance: ctx.distance, estimates: [
    { id: "median (the D-152/D-155 estimate)", rgb: est.background }, { id: "light tone (diagnostic)", rgb: checker.tones.light.map(Math.round) }, { id: "dark tone (diagnostic)", rgb: checker.tones.dark.map(Math.round) }] });
  const tt = twoToneUncovered(raw, { head: ctx.head, tones: checker.tones });
  const strip = ({ parityOf, nearBoundary, ...c }) => c;
  return { decision: DECISION, status: STATUS, callId: CALL_ID, claimIdentity: CLAIM_IDENTITY,
    format: facts, background: { median: est.background, probePx: est.probe, checkerProbe: strip(probeFit), checkerWholeCanvas: global },
    outlineColour: outline, band: { total: band.total, categories: band.categories, patternToneBy: band.patternToneBy, neutralGreyPx: band.neutralGreyPx, byRegion: band.byRegion, nearModelPaintPx: band.nearModelPaintPx, farFromModelPaintPx: band.farFromModelPaintPx },
    sensitivity: sens, twoToneDiagnosticUncovered: tt, _maps: { label: band.label, paint: band.paint } };
}
