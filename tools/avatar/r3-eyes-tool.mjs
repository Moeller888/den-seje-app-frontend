// R3 eyes TOOL — D-169 (contract: eyesPartsMethod). Library only: no side effects, no network, no credentials, no claims,
// no image request. It never writes a file; the CLI r3-eyes-compose.mjs does.
//
// Workflow (D-169): two raw 1536x1024 sheets, never modified, one per asset.
//   A  eyes-fixed sheet (assets[5]) -> E1..E5 (binding) -> owner annotation of Lc, Rc, Lo, Ro (+ check points Li, Ri)
//      -> ONE shared positive uniform scale + translation for BOTH eyes, least squares over the four fit anchors
//      -> pinned area-filter resampling (D-164 code, newly approved for the eyes by D-169) -> one 1024x1536 eyes-fixed layer
//   B  iris sheet (assets[6], only after A is approved) -> I1..I5 (binding)
//      -> each iris' ALPHA-WEIGHTED CENTROID (deterministic, no hand annotation) is mapped onto the PLACED Lc and Rc
//      -> ONE shared positive uniform scale + translation (2 points, 3 parameters: the residual is measurable)
//      -> one 1024x1536 achromatic iris layer
//   then P1..P7 on the placed pair. Both sublayers end on the same anchor set (Lc, Rc).
//   bbox / alpha NEVER set a transform; only the annotation (A) and the iris centroids (B) do. Nothing is cropped,
//   moved, de-matted, recoloured or repaired to pass a check. The prompt does not provide registration.
import { createHash } from "node:crypto";
import { decodePng, encodePng, fitUniformScaleTranslate, resampleArea, overInto, quantise, pixelSha256, MASTER } from "./r3-face-parts-tool.mjs";

export { decodePng, encodePng, pixelSha256 };
export const TOOL_ID = "r3-eyes-tool-v1";
export const SHEET = Object.freeze({ w: 1536, h: 1024, midX: 768 });
export const EYES = Object.freeze(["eyeLeft", "eyeRight"]);            // image left / image right (as browLeft/browRight)
export const FIT_POINTS = Object.freeze(["ringCentre", "outerCorner"]); // per eye: Lc/Rc and Lo/Ro
export const CHECK_POINTS = Object.freeze(["innerCorner"]);            // per eye: Li/Ri (reported, never fitted)
export const ANNOTATION_SCHEMA = "r3-eyes-annotation-v1";
export const TARGETS_SCHEMA = "r3-eyes-targets-v1";
export const IRIS_TOKEN = Object.freeze({ name: "R3_IRIS_DEFAULT", hex: "#A34A0F", rgb: Object.freeze([0xa3, 0x4a, 0x0f]) });
export const MODES = Object.freeze({
  production: { annotation: ["APPROVED"], targets: ["APPROVED"] },
  "synthetic-test": { annotation: ["SYNTHETIC_TEST_APPROVED"], targets: ["SYNTHETIC_TEST_APPROVED"] },
});
/** Every numeric threshold, fixed by D-169 BEFORE any eyes call. Mirrored verbatim in eyesPartsMethod.thresholds. */
export const THRESHOLDS = Object.freeze({
  visibleAlphaMin: 16,              // alpha >= 16 is visible content for E2 and I2
  lowAlphaReportedMax: 15,          // alpha 1..15 is reported, never rejected (owner decision D-169)
  midStripX: Object.freeze([728, 808]),
  borderPx: 32,
  openingAlphaBelow: 8,             // a transparent opening pixel has alpha < 8
  openingMinComponentPx: 2000,      // enclosed transparent components smaller than this are reported only
  openingAreaRange: Object.freeze([0.5, 1.6]),
  openingAreaNominalPx: Object.freeze({ eyeLeft: 31496, eyeRight: 33158 }), // DRAFT geometry at 4x (D-169 prep)
  highlightAlphaMin: 128,
  highlightLuminanceMin: 200,
  highlightMinFractionOfOpening: 0.01,
  skinAlphaMin: 250,
  skinDeltaE76Max: 10,
  irisFillRatioRange: Object.freeze([0.92, 1.05]),
  irisChromaMax: 12,
  irisOpaqueInsetPx: 3,
  pupilDarkestFraction: 0.10,
  pupilMaxNormalisedDistance: 0.2,
  residualFixedMaxPx: 2.0,
  residualIrisMaxPx: 1.5,
  scaleRange: Object.freeze([0.20, 0.30]),
  irisToFixedScaleRatioRange: Object.freeze([0.90, 1.10]),
  coverageIrisAlphaMin: 250,
  containmentIrisAlphaFrom: 8,
  fixedSolidAlphaMin: 250,
  envelopeAlphaFrom: 8,
  envelopeGrowPx: 6,
  centreMaxDistancePx: 3,
});
/** D-159's eye and fold zones (faceNeutralPreparation.areaModel.excludedZones), master canvas. P5 grows them. */
export const EYE_ZONES = Object.freeze({
  eyeZones: Object.freeze([Object.freeze([401, 277, 479, 357]), Object.freeze([540, 275, 619, 356])]),
  foldZones: Object.freeze([
    Object.freeze({ polyline: Object.freeze([[432, 272], [458, 274], [470, 281], [476, 286]].map(Object.freeze)), halfWidth: 3 }),
    Object.freeze({ polyline: Object.freeze([[541, 288], [549, 280], [556, 274], [565, 272], [582, 272]].map(Object.freeze)), halfWidth: 3 }),
  ]),
});
const U1_SKIN = [254, 197, 128];
export const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const RESULT = Object.freeze({ ok: "PASS", rejected: "REJECT" });
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const RGB_LAB = (() => {
  const linC = (c) => { c /= 255; return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92; };
  return (r, g, b) => {
    const R = linC(r), G = linC(g), B = linC(b), t = (v) => (v > 216 / 24389 ? Math.cbrt(v) : (24389 / 27 * v + 16) / 116);
    const X = t((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047), Y = t(0.2126 * R + 0.7152 * G + 0.0722 * B), Z = t((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
    return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
  };
})();
const SKIN_LAB = RGB_LAB(...U1_SKIN);

// ═════════════════════════════════ components and hulls ═════════════════════════════════
/** Connected components of `mask` (Uint8Array, 1 = in). conn 4 or 8. Returns per-component stats and the label map. */
export function components(mask, w, h, conn) {
  const labels = new Int32Array(w * h).fill(-1), comps = [], st = new Int32Array(w * h);
  const nb = conn === 8 ? [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] : [[0, -1], [-1, 0], [1, 0], [0, 1]];
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || labels[i] >= 0) continue;
    const id = comps.length, c = { id, n: 0, minX: w, minY: h, maxX: -1, maxY: -1, sx: 0, sy: 0, touchesBorder: false };
    let sp = 0; st[sp++] = i; labels[i] = id;
    while (sp) {
      const q = st[--sp], x = q % w, y = (q / w) | 0;
      c.n++; c.sx += x + 0.5; c.sy += y + 0.5;
      if (x < c.minX) c.minX = x; if (x > c.maxX) c.maxX = x; if (y < c.minY) c.minY = y; if (y > c.maxY) c.maxY = y;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) c.touchesBorder = true;
      for (const [dx, dy] of nb) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const r = yy * w + xx;
        if (mask[r] && labels[r] < 0) { labels[r] = id; st[sp++] = r; }
      }
    }
    c.cx = c.sx / c.n; c.cy = c.sy / c.n;
    comps.push(c);
  }
  return { labels, comps };
}
/** Convex hull (monotone chain) of the pixel squares of component `id`; returns a counter-clockwise polygon. */
function hullOf(labels, w, comp) {
  const pts = [];
  for (let y = comp.minY; y <= comp.maxY; y++) {
    let a = -1, b = -1;
    for (let x = comp.minX; x <= comp.maxX; x++) if (labels[y * w + x] === comp.id) { if (a < 0) a = x; b = x; }
    if (a >= 0) pts.push([a, y], [b + 1, y], [a, y + 1], [b + 1, y + 1]);
  }
  pts.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop(); lower.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop(); upper.push(p); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
const insideHull = (poly, x, y) => { for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; if ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) < 0) return false; } return true; };

// ═════════════════════════════════ A: eyes-fixed sheet ═════════════════════════════════
const decodeSheet = (buf, step, prefix) => {
  const P = decodePng(buf);
  const ok = P.ok && !!P.px && P.header.w === SHEET.w && P.header.h === SHEET.h;
  const detail = !P.ok ? P.error : `${P.header.w}x${P.header.h}, colour type ${P.header.colourType}, bit depth ${P.header.bitDepth}, interlace ${P.header.interlace}`;
  return step(prefix + "1", "PNG decodes, 1536x1024, 8-bit RGBA, not interlaced", ok, detail) ? P.px : null;
};
const inForbidden = (x, y) => x < THRESHOLDS.borderPx || y < THRESHOLDS.borderPx || x >= SHEET.w - THRESHOLDS.borderPx || y >= SHEET.h - THRESHOLDS.borderPx || (x >= THRESHOLDS.midStripX[0] && x < THRESHOLDS.midStripX[1]);
const halfOf = (cx) => (cx < SHEET.midX ? "eyeLeft" : "eyeRight");

/**
 * The binding raw checks E1..E5 for an eyes-fixed sheet (D-169). The first failure stops. Returns the verdict, the steps,
 * diagnostics, and (on PASS) the decoded pixels and one opening per eye for the composition.
 */
export function checkFixedSheet(buf) {
  const auto = [], diag = [];
  const step = (id, name, ok, detail) => { auto.push({ id, name, status: ok ? RESULT.ok : RESULT.rejected, detail }); return ok; };
  const fail = (id) => ({ verdict: "REJECT", firstFailure: id, auto, diag, rawSha256: Buffer.isBuffer(buf) ? sha256(buf) : null });
  const px = decodeSheet(buf, step, "E");
  if (!px) return fail("E1");
  const { w, h } = SHEET, T = THRESHOLDS;
  // E2 — no visible pixel in the middle strip or the border
  let forbidden = 0, lowForbidden = 0, lowAll = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = px[(y * w + x) * 4 + 3];
    if (a >= 1 && a <= T.lowAlphaReportedMax) lowAll++;
    if (!inForbidden(x, y)) continue;
    if (a >= T.visibleAlphaMin) forbidden++; else if (a >= 1) lowForbidden++;
  }
  diag.push({ id: "E2-LOW", name: "pixels with alpha 1..15: in the strip/border, and on the whole sheet (reported only, D-169)", value: { inStripOrBorder: lowForbidden, wholeSheet: lowAll }, flagged: lowForbidden > 0 });
  if (!step("E2", `no pixel with alpha >= ${T.visibleAlphaMin} in the middle strip x ${T.midStripX[0]}..${T.midStripX[1] - 1} or the ${T.borderPx} px border`, forbidden === 0, `${forbidden} px`)) return fail("E2");
  // E3 — exactly one enclosed transparent opening per half, of plausible area
  const tmask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) tmask[i] = px[i * 4 + 3] < T.openingAlphaBelow ? 1 : 0;
  const T4 = components(tmask, w, h, 4);
  const enclosed = T4.comps.filter((c) => !c.touchesBorder);
  const big = { eyeLeft: [], eyeRight: [] };
  for (const c of enclosed) if (c.n >= T.openingMinComponentPx) big[halfOf(c.cx)].push(c);
  diag.push({ id: "E3-SMALL", name: `enclosed transparent components below ${T.openingMinComponentPx} px (lash gaps etc.; reported only)`, value: enclosed.filter((c) => c.n < T.openingMinComponentPx).length, flagged: null });
  const e3 = EYES.map((e) => {
    const list = big[e];
    if (list.length !== 1) return { eye: e, ok: false, detail: `${list.length} openings >= ${T.openingMinComponentPx} px` };
    const r = list[0].n / T.openingAreaNominalPx[e];
    return { eye: e, ok: r >= T.openingAreaRange[0] && r <= T.openingAreaRange[1], detail: `${list[0].n} px = ${r.toFixed(3)} x nominal ${T.openingAreaNominalPx[e]}` };
  });
  if (!step("E3", `per half exactly one enclosed transparent opening (alpha < ${T.openingAlphaBelow}) with ${T.openingAreaRange[0]}..${T.openingAreaRange[1]} x the nominal area`, e3.every((r) => r.ok), e3.map((r) => `${r.eye}: ${r.detail}`).join("; "))) return fail("E3");
  // E4 — a bright opaque highlight inside each opening's convex hull, upper-left of the region centroid
  const openings = {};
  const e4 = EYES.map((e) => {
    const c = big[e][0], poly = hullOf(T4.labels, w, c);
    let n = 0, sx = 0, sy = 0, rx = c.sx, ry = c.sy, rn = c.n;
    for (let y = c.minY; y <= c.maxY; y++) for (let x = c.minX; x <= c.maxX; x++) {
      const i = y * w + x, o = i * 4;
      if (T4.labels[i] === c.id || px[o + 3] < T.highlightAlphaMin || lum(px[o], px[o + 1], px[o + 2]) < T.highlightLuminanceMin || !insideHull(poly, x + 0.5, y + 0.5)) continue;
      n++; sx += x + 0.5; sy += y + 0.5;
    }
    rx += sx; ry += sy; rn += n;
    const regionC = [rx / rn, ry / rn], hl = n ? [sx / n, sy / n] : null;
    openings[e] = { id: c.id, n: c.n, centroid: [c.cx, c.cy], bbox: [c.minX, c.minY, c.maxX + 1, c.maxY + 1], highlightPx: n, highlightCentroid: hl, regionCentroid: regionC };
    const ok = n >= T.highlightMinFractionOfOpening * c.n && hl[0] < regionC[0] && hl[1] < regionC[1];
    return { eye: e, ok, detail: `${n} bright px${hl ? ` at (${hl[0].toFixed(1)}, ${hl[1].toFixed(1)}) vs region (${regionC[0].toFixed(1)}, ${regionC[1].toFixed(1)})` : ""}` };
  });
  if (!step("E4", `per opening a bright opaque highlight (alpha >= ${T.highlightAlphaMin}, luminance >= ${T.highlightLuminanceMin}, >= ${T.highlightMinFractionOfOpening * 100} % of the opening) upper-left of the region centroid`, e4.every((r) => r.ok), e4.map((r) => `${r.eye}: ${r.detail}`).join("; "))) return fail("E4");
  // E5 — no skin in the layer
  let skin = 0;
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    if (px[o + 3] < T.skinAlphaMin) continue;
    const L = RGB_LAB(px[o], px[o + 1], px[o + 2]);
    if (Math.hypot(L[0] - SKIN_LAB[0], L[1] - SKIN_LAB[1], L[2] - SKIN_LAB[2]) <= T.skinDeltaE76Max) skin++;
  }
  if (!step("E5", `no opaque skin-coloured pixel (alpha >= ${T.skinAlphaMin}, ΔE76 <= ${T.skinDeltaE76Max} to the U1 skin)`, skin === 0, `${skin} px`)) return fail("E5");
  diag.push({ id: "E-VISUAL", name: "style, lashes, folds, gaze, symmetry, no mirrored copy", value: "visual review only", flagged: null });
  return { verdict: "PASS_TO_ANNOTATION", firstFailure: null, auto, diag, rawSha256: sha256(buf), px, openingLabels: T4.labels, openings };
}

// ═════════════════════════════════ D-172: binding shape checks for a further eyes-fixed sheet ═════════════════════════════════
/**
 * Fixed by D-172 BEFORE its call; mirrored verbatim in eyesFixedRetakePreparation.shapeChecks.thresholds. D-169's THRESHOLDS
 * and E1..E5 are unchanged. targetRingCentreSpacingPx is |Lc − Rc| of the APPROVED targets-eyes-v2 (D-170), not a new reading.
 */
export const SHAPE_THRESHOLDS = Object.freeze({
  bandColumnFraction: 0.6,          // F1 scans the column at 60 % of the opening's bbox width (away from the upper-left highlight)
  lightAlphaMin: 128,
  lightLuminanceMin: 200,
  stopAlphaBelow: 8,                // the upward scan stops at the first pixel with alpha < 8 (above the lash line)
  whiteBandLightPxMax: 0,
  targetRingCentreSpacingPx: 122.205,
});
/**
 * F1..F2 on a PASSING checkFixedSheet result (D-172). F1 no white band: in each opening's F1 column, from its topmost opening
 * pixel upward to the first pixel with alpha < 8, no pixel is light (alpha >= 128, luminance >= 200) — the ring's top meets the
 * lash line with no white between. F2 spacing: the implied shared scale targetRingCentreSpacingPx / |region centroid L − R|
 * lies in D-169's scaleRange, so the sheet's eye spacing is compatible with the approved targets before any annotation.
 */
export function checkFixedSheetShape(fixed) {
  const auto = [], diag = [], S = SHAPE_THRESHOLDS;
  const step = (id, name, ok, detail) => { auto.push({ id, name, status: ok ? RESULT.ok : RESULT.rejected, detail }); return ok; };
  const fail = (id) => ({ verdict: "REJECT", firstFailure: id, auto, diag });
  if (!fixed || fixed.verdict !== "PASS_TO_ANNOTATION" || !fixed.px || !fixed.openingLabels || !fixed.openings) return { verdict: "REJECT", firstFailure: "E-CHECKS-NOT-PASSED", auto, diag };
  const { w } = SHEET, px = fixed.px;
  const f1 = EYES.map((e) => {
    const o = fixed.openings[e], [x0, y0, x1, y1] = o.bbox, col = x0 + Math.round(S.bandColumnFraction * (x1 - x0));
    let top = -1; for (let y = y0; y < y1; y++) if (fixed.openingLabels[y * w + col] === o.id) { top = y; break; }
    if (top < 0) return { eye: e, ok: false, detail: `no opening pixel in column ${col}` };
    let light = 0, y = top - 1;
    for (; y >= 0; y--) { const i = (y * w + col) * 4; if (px[i + 3] < S.stopAlphaBelow) break; if (px[i + 3] >= S.lightAlphaMin && lum(px[i], px[i + 1], px[i + 2]) >= S.lightLuminanceMin) light++; }
    return { eye: e, ok: light <= S.whiteBandLightPxMax, detail: `column ${col}: ${light} light px between the opening top (y ${top}) and y ${y + 1}` };
  });
  if (!step("F1", "no white band: the ring's top meets the upper lash line with no light pixel between (D-172)", f1.every((r) => r.ok), f1.map((r) => `${r.eye}: ${r.detail}`).join("; "))) return fail("F1");
  const a = fixed.openings.eyeLeft.regionCentroid, b = fixed.openings.eyeRight.regionCentroid, d = Math.hypot(b[0] - a[0], b[1] - a[1]), implied = S.targetRingCentreSpacingPx / d;
  const ok2 = implied >= THRESHOLDS.scaleRange[0] && implied <= THRESHOLDS.scaleRange[1];
  if (!step("F2", `eye spacing compatible with the approved targets: ${S.targetRingCentreSpacingPx} / |region centroid L − R| in ${THRESHOLDS.scaleRange[0]}..${THRESHOLDS.scaleRange[1]} (D-172)`, ok2, `spacing ${d.toFixed(1)} px, implied s ${implied.toFixed(4)}`)) return fail("F2");
  diag.push({ id: "F-VISUAL", name: "tall oval ring (about 1.3 x), short outer flick only, no inner flick, short fold above the inner half — visual review only", value: "visual review only", flagged: null });
  return { verdict: "PASS_TO_ANNOTATION", firstFailure: null, auto, diag };
}

// ═════════════════════════════════ B: iris sheet ═════════════════════════════════
/** The binding raw checks I1..I5 for an iris sheet (D-169). On PASS, returns one component per eye with its centroid. */
export function checkIrisSheet(buf) {
  const auto = [], diag = [];
  const step = (id, name, ok, detail) => { auto.push({ id, name, status: ok ? RESULT.ok : RESULT.rejected, detail }); return ok; };
  const fail = (id) => ({ verdict: "REJECT", firstFailure: id, auto, diag, rawSha256: Buffer.isBuffer(buf) ? sha256(buf) : null });
  const px = decodeSheet(buf, step, "I");
  if (!px) return fail("I1");
  const { w, h } = SHEET, T = THRESHOLDS;
  const vis = new Uint8Array(w * h); let lowAll = 0;
  for (let i = 0; i < w * h; i++) { const a = px[i * 4 + 3]; vis[i] = a >= T.visibleAlphaMin ? 1 : 0; if (a >= 1 && a <= T.lowAlphaReportedMax) lowAll++; }
  diag.push({ id: "I2-LOW", name: "pixels with alpha 1..15 on the whole sheet (reported only, D-169)", value: lowAll, flagged: lowAll > 0 });
  // I2 — exactly two filled upright ovals, one per half
  const C8 = components(vis, w, h, 8), comps = C8.comps;
  const byEye = {}; let i2 = comps.length === 2, why = `${comps.length} components`;
  if (i2) for (const c of comps) {
    const e = (c.maxX < SHEET.midX) ? "eyeLeft" : (c.minX >= SHEET.midX ? "eyeRight" : null);
    if (!e || byEye[e]) { i2 = false; why = "a component crosses the middle or two are in one half"; break; }
    const bw = c.maxX - c.minX + 1, bh = c.maxY - c.minY + 1, fill = c.n / ((Math.PI / 4) * bw * bh);
    byEye[e] = { ...c, bw, bh, fill };
    if (!(fill >= T.irisFillRatioRange[0] && fill <= T.irisFillRatioRange[1]) || !(bh > bw)) { i2 = false; why = `${e}: fill ${fill.toFixed(3)}, ${bw}x${bh}`; }
  }
  if (i2) why = EYES.map((e) => `${e}: ${byEye[e].bw}x${byEye[e].bh}, fill ${byEye[e].fill.toFixed(3)}`).join("; ");
  if (!step("I2", `exactly two components (alpha >= ${T.visibleAlphaMin}, 8-connected), one per half, each an upright filled oval (fill ${T.irisFillRatioRange[0]}..${T.irisFillRatioRange[1]} of its bbox ellipse, height > width)`, i2, why)) return fail("I2");
  // I3 — achromatic
  let chroma = 0;
  for (let i = 0; i < w * h; i++) { if (!vis[i]) continue; const o = i * 4, c = Math.max(px[o], px[o + 1], px[o + 2]) - Math.min(px[o], px[o + 1], px[o + 2]); if (c > chroma) chroma = c; }
  if (!step("I3", `achromatic: max(R,G,B) − min(R,G,B) <= ${T.irisChromaMax} on every pixel with alpha >= ${T.visibleAlphaMin}`, chroma <= T.irisChromaMax, `max chroma ${chroma}`)) return fail("I3");
  // I4 — fully opaque inside (more than irisOpaqueInsetPx from the component edge)
  const k = T.irisOpaqueInsetPx; let holes = 0;
  for (const e of EYES) {
    const c = byEye[e];
    for (let y = c.minY + k; y <= c.maxY - k; y++) for (let x = c.minX + k; x <= c.maxX - k; x++) {
      let inner = true;
      for (let dy = -k; dy <= k && inner; dy++) for (let dx = -k; dx <= k; dx++) if (C8.labels[(y + dy) * w + x + dx] !== c.id) { inner = false; break; }
      if (inner && px[(y * w + x) * 4 + 3] !== 255) holes++;
    }
  }
  if (!step("I4", `fully opaque: alpha = 255 on every pixel more than ${k} px inside its component`, holes === 0, `${holes} px`)) return fail("I4");
  // I5 — pupil centred (gaze straight ahead) + the alpha-weighted centroid (the registration anchor)
  const irises = {};
  const i5 = EYES.map((e) => {
    const c = byEye[e], dark = []; let sa = 0, sx = 0, sy = 0;
    for (let y = c.minY; y <= c.maxY; y++) for (let x = c.minX; x <= c.maxX; x++) {
      const i = y * w + x; if (C8.labels[i] !== c.id) continue;
      const o = i * 4, a = px[o + 3] / 255; sa += a; sx += a * (x + 0.5); sy += a * (y + 0.5);
      if (px[o + 3] === 255) dark.push([lum(px[o], px[o + 1], px[o + 2]), i]);
    }
    // every opaque pixel at or below the luminance of the darkest-10 % quantile (ties included, so no order bias)
    dark.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    const cut = dark[Math.max(0, Math.round(dark.length * T.pupilDarkestFraction) - 1)][0];
    let m = 0, dx = 0, dy = 0; for (const [L, i] of dark) { if (L > cut) break; m++; dx += (i % w) + 0.5; dy += ((i / w) | 0) + 0.5; }
    const centroid = [sx / sa, sy / sa], pupil = [dx / m, dy / m];
    const d = Math.hypot((pupil[0] - centroid[0]) / (c.bw / 2), (pupil[1] - centroid[1]) / (c.bh / 2));
    irises[e] = { centroid, pupilCentroid: pupil, pupilNormalisedDistance: d, bbox: [c.minX, c.minY, c.maxX + 1, c.maxY + 1], areaPx: c.n, fill: c.fill };
    return { eye: e, ok: d <= T.pupilMaxNormalisedDistance, detail: `${d.toFixed(3)}` };
  });
  if (!step("I5", `pupil (opaque pixels at or below the darkest-${T.pupilDarkestFraction * 100} % luminance, ties included) within ${T.pupilMaxNormalisedDistance} of the half-axes from the iris centroid`, i5.every((r) => r.ok), i5.map((r) => `${r.eye}: ${r.detail}`).join("; "))) return fail("I5");
  diag.push({ id: "I-VISUAL", name: "iris shading like Northstar, no highlight, no ring, no colour", value: "visual review only", flagged: null });
  return { verdict: "PASS_TO_REGISTRATION", firstFailure: null, auto, diag, rawSha256: sha256(buf), px, irises };
}

// ═════════════════════════════════ annotation + targets ═════════════════════════════════
const isPt = (p) => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === "number" && Number.isFinite(v));
const ALL_POINTS = [...FIT_POINTS, ...CHECK_POINTS];
export function validateTargets(targets, mode) {
  const m = MODES[mode]; if (!m) return { ok: false, code: "UNKNOWN_MODE" };
  if (!targets || targets.schema !== TARGETS_SCHEMA) return { ok: false, code: "TARGETS_SCHEMA_INVALID" };
  if (!m.targets.includes(targets.status)) return { ok: false, code: "TARGETS_NOT_APPROVED", why: `status ${targets.status} not accepted in ${mode} mode` };
  for (const e of EYES) for (const k of ALL_POINTS) if (!isPt(targets.points?.[e]?.[k]?.xy)) return { ok: false, code: "TARGETS_POINTS_INVALID", why: `${e}.${k}` };
  return { ok: true };
}
export function validateAnnotation(ann, rawSha, mode) {
  const m = MODES[mode]; if (!m) return { ok: false, code: "UNKNOWN_MODE" };
  if (!ann) return { ok: false, code: "NO_ANNOTATION" };
  if (ann.schema !== ANNOTATION_SCHEMA) return { ok: false, code: "ANNOTATION_SCHEMA_INVALID" };
  if (ann.raw?.sha256 !== rawSha) return { ok: false, code: "ANNOTATION_RAW_SHA_MISMATCH", why: "the annotation belongs to another eyes-fixed sheet" };
  if (!m.annotation.includes(ann.status)) return { ok: false, code: "ANNOTATION_NOT_APPROVED", why: `status ${ann.status} not accepted in ${mode} mode` };
  for (const e of EYES) {
    const keys = Object.keys(ann.points?.[e] ?? {});
    if (keys.length !== ALL_POINTS.length || !ALL_POINTS.every((k) => isPt(ann.points[e][k]))) return { ok: false, code: "ANNOTATION_POINTS_INVALID", why: `${e}: need exactly ${ALL_POINTS.join(" + ")} as finite [x, y]` };
    for (const k of ALL_POINTS) { const [x, y] = ann.points[e][k]; if (x < 0 || y < 0 || x > SHEET.w || y > SHEET.h) return { ok: false, code: "ANNOTATION_POINT_OUTSIDE_SHEET", why: `${e}.${k}` }; }
    if ((e === "eyeLeft") !== (ann.points[e].ringCentre[0] < SHEET.midX)) return { ok: false, code: "ANNOTATION_EYE_IN_WRONG_HALF", why: e };
  }
  return { ok: true };
}

// ═════════════════════════════════ placement ═════════════════════════════════
const place = (sheetPx, f) => { const layer = resampleArea({ w: SHEET.w, h: SHEET.h, px: sheetPx }, f.s, f.tx, f.ty, MASTER.w, MASTER.h); const acc = new Float64Array(MASTER.w * MASTER.h * 4); overInto(acc, MASTER.w, layer); return quantise(acc, MASTER.w, MASTER.h); };
const map = (f, p) => [f.s * p[0] + f.tx, f.s * p[1] + f.ty];
const segDist = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
/** P5's envelope: D-159's eye zones and fold zones grown by envelopeGrowPx; a pixel is inside when its centre is. */
export function inEyeEnvelope(x, y) {
  const g = THRESHOLDS.envelopeGrowPx, cx = x + 0.5, cy = y + 0.5;
  for (const z of EYE_ZONES.eyeZones) if (cx >= z[0] - g && cx <= z[2] + g && cy >= z[1] - g && cy <= z[3] + g) return true;
  for (const f of EYE_ZONES.foldZones) for (let i = 1; i < f.polyline.length; i++) if (segDist([cx, cy], f.polyline[i - 1], f.polyline[i]) <= f.halfWidth + g) return true;
  return false;
}
/** Review-only render of the pair: iris tinted (round(Y/255 x token), alpha unchanged) under the fixed layer. Not an asset. */
export function tintedReviewPair(fixedPx, irisPx) {
  const acc = new Float64Array(MASTER.w * MASTER.h * 4);
  for (let i = 0; i < MASTER.w * MASTER.h; i++) {
    const o = i * 4, a = irisPx[o + 3] / 255; if (!a) continue;
    const Y = lum(irisPx[o], irisPx[o + 1], irisPx[o + 2]) / 255;
    for (let c = 0; c < 3; c++) acc[o + c] = Math.round(Y * IRIS_TOKEN.rgb[c]) * a;
    acc[o + 3] = a;
  }
  for (let i = 0; i < MASTER.w * MASTER.h; i++) {
    const o = i * 4, a = fixedPx[o + 3] / 255; if (!a) continue;
    for (let c = 0; c < 3; c++) acc[o + c] = fixedPx[o + c] * a + acc[o + c] * (1 - a);
    acc[o + 3] = a + acc[o + 3] * (1 - a);
  }
  return quantise(acc, MASTER.w, MASTER.h);
}

/**
 * Compose the eyes. `fixed` is a PASSING checkFixedSheet result, `iris` a PASSING checkIrisSheet result or null (fixed stage
 * only: A is placed and reviewed before B is requested). Returns the FIRST failure { ok:false, stage, code, why } (nothing
 * else produced) or { ok:true, fixedPx, irisPx?, log }. Never modifies a raw sheet.
 */
export function composeEyes({ fixed, iris, annotation, targets, mode }) {
  const T = THRESHOLDS;
  if (!fixed || fixed.verdict !== "PASS_TO_ANNOTATION") return { ok: false, stage: "raw", code: "FIXED_SHEET_NOT_PASSED" };
  if (iris && iris.verdict !== "PASS_TO_REGISTRATION") return { ok: false, stage: "raw", code: "IRIS_SHEET_NOT_PASSED" };
  const vt = validateTargets(targets, mode); if (!vt.ok) return { ok: false, stage: "targets", ...vt };
  const va = validateAnnotation(annotation, fixed.rawSha256, mode); if (!va.ok) return { ok: false, stage: "annotation", ...va };
  // fixed: one shared fit over the four fit anchors (Lc, Lo, Rc, Ro)
  const names = EYES.flatMap((e) => FIT_POINTS.map((k) => [e, k]));
  const ff = fitUniformScaleTranslate(names.map(([e, k]) => annotation.points[e][k]), names.map(([e, k]) => targets.points[e][k].xy));
  if (!ff.ok) return { ok: false, stage: "fit", code: ff.code, why: ff.why };
  const check = (code, ok, why) => (ok ? null : { ok: false, stage: "placement", code, why });
  let r = check("P1_RESIDUAL_FIXED", ff.residualMaxPx <= T.residualFixedMaxPx, `max residual ${ff.residualMaxPx.toFixed(3)} px > ${T.residualFixedMaxPx}`); if (r) return r;
  r = check("P2_SCALE_FIXED", ff.s >= T.scaleRange[0] && ff.s <= T.scaleRange[1], `s = ${ff.s}`); if (r) return r;
  const fixedPx = place(fixed.px, ff);
  let outside = 0;
  for (let y = 0; y < MASTER.h; y++) for (let x = 0; x < MASTER.w; x++) if (fixedPx[(y * MASTER.w + x) * 4 + 3] >= T.envelopeAlphaFrom && !inEyeEnvelope(x, y)) outside++;
  r = check("P5_ENVELOPE", outside === 0, `${outside} px with alpha >= ${T.envelopeAlphaFrom} outside the grown D-159 eye and fold zones`); if (r) return r;
  const placed = Object.fromEntries(EYES.map((e) => [e, Object.fromEntries(ALL_POINTS.map((k) => [k, map(ff, annotation.points[e][k])]))]));
  const centreDist = Object.fromEntries(EYES.map((e) => [e, Math.hypot(placed[e].ringCentre[0] - targets.points[e].ringCentre.xy[0], placed[e].ringCentre[1] - targets.points[e].ringCentre.xy[1])]));
  r = check("P6_CENTRES", EYES.every((e) => centreDist[e] <= T.centreMaxDistancePx), JSON.stringify(centreDist)); if (r) return r;
  const checkPointResidualPx = Object.fromEntries(EYES.map((e) => [e, Object.fromEntries(CHECK_POINTS.map((k) => [k, Math.hypot(placed[e][k][0] - targets.points[e][k].xy[0], placed[e][k][1] - targets.points[e][k].xy[1])]))]));
  const fixedLog = { transform: { s: ff.s, tx: ff.tx, ty: ff.ty }, fitPoints: names.map(([e, k]) => `${e}.${k}`), residualVectorsPx: Object.fromEntries(names.map(([e, k], i) => [`${e}.${k}`, ff.residuals[i]])), residualMaxPx: ff.residualMaxPx, fitDescription: ff.fitDescription, placedPoints: placed, ringCentreDistancePx: centreDist, checkPointResidualPx, envelopeOutsidePx: 0 };
  const P7 = { ringCentreYDifferencePx: Math.abs(placed.eyeLeft.ringCentre[1] - placed.eyeRight.ringCentre[1]) };
  if (!iris) return { ok: true, stage: "fixed", fixedPx, log: { tool: TOOL_ID, mode, stage: "FIXED ONLY — the iris sheet is not part of this run", thresholds: T, fixed: fixedLog, diagnosticsP7: P7, output: { fixedPixelSha256: pixelSha256(fixedPx) } } };
  // iris: centroids -> placed Lc, Rc; one shared fit
  const fi = fitUniformScaleTranslate(EYES.map((e) => iris.irises[e].centroid), EYES.map((e) => placed[e].ringCentre));
  if (!fi.ok) return { ok: false, stage: "fit", code: fi.code, why: fi.why };
  r = check("P1_RESIDUAL_IRIS", fi.residualMaxPx <= T.residualIrisMaxPx, `max residual ${fi.residualMaxPx.toFixed(3)} px > ${T.residualIrisMaxPx}`); if (r) return r;
  const ratio = fi.s / ff.s;
  r = check("P2_SCALE_IRIS", fi.s >= T.scaleRange[0] && fi.s <= T.scaleRange[1] && ratio >= T.irisToFixedScaleRatioRange[0] && ratio <= T.irisToFixedScaleRatioRange[1], `s = ${fi.s}, ratio ${ratio}`); if (r) return r;
  const irisPx = place(iris.px, fi);
  // the placed opening: the two opening components as a binary layer, resampled with the fixed transform
  const om = new Uint8ClampedArray(SHEET.w * SHEET.h * 4), ids = new Set(EYES.map((e) => fixed.openings[e].id));
  for (let i = 0; i < SHEET.w * SHEET.h; i++) if (ids.has(fixed.openingLabels[i])) om[i * 4 + 3] = 255;
  const openingCov = place(om, ff);
  let uncovered = 0, escaped = 0;
  for (let i = 0; i < MASTER.w * MASTER.h; i++) {
    const o = i * 4, inOpening = openingCov[o + 3] > 0;
    if (inOpening && irisPx[o + 3] < T.coverageIrisAlphaMin) uncovered++;
    if (irisPx[o + 3] >= T.containmentIrisAlphaFrom && !inOpening && fixedPx[o + 3] < T.fixedSolidAlphaMin) escaped++;
  }
  r = check("P3_COVERAGE", uncovered === 0, `${uncovered} opening px with iris alpha < ${T.coverageIrisAlphaMin}`); if (r) return r;
  r = check("P4_CONTAINMENT", escaped === 0, `${escaped} px of iris (alpha >= ${T.containmentIrisAlphaFrom}) outside the opening and not under solid eyes-fixed`); if (r) return r;
  const sz = (e) => [iris.irises[e].bbox[2] - iris.irises[e].bbox[0], iris.irises[e].bbox[3] - iris.irises[e].bbox[1]];
  P7.irisSizeRatioLeftToRight = [sz("eyeLeft")[0] / sz("eyeRight")[0], sz("eyeLeft")[1] / sz("eyeRight")[1]];
  return { ok: true, stage: "pair", fixedPx, irisPx, log: { tool: TOOL_ID, mode, stage: "PAIR", thresholds: T, fixed: fixedLog,
    iris: { transform: { s: fi.s, tx: fi.tx, ty: fi.ty }, sourceCentroids: Object.fromEntries(EYES.map((e) => [e, iris.irises[e].centroid])), targets: "the PLACED eyes-fixed ring centres", residualVectorsPx: Object.fromEntries(EYES.map((e, i) => [e, fi.residuals[i]])), residualMaxPx: fi.residualMaxPx, scaleRatioToFixed: ratio },
    coverage: { uncoveredPx: 0 }, containment: { escapedPx: 0 }, diagnosticsP7: P7,
    output: { fixedPixelSha256: pixelSha256(fixedPx), irisPixelSha256: pixelSha256(irisPx) } } };
}
