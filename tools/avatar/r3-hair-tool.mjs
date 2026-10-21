// R3 hair TOOL — D-174 (contract: hairMethod). Library only: no side effects, no network, no credentials, no claims, no
// image request. It never writes a file; the CLI r3-hair-compose.mjs does.
//
// Workflow (D-174): one raw 1024x1024 sheet (assets[8] r3-hair-northstar), never modified:
//   H1..H5 (binding raw checks) -> owner-APPROVED annotation of the four fit anchors on THAT sheet (source anchors are
//   unknown until a sheet exists) -> ONE positive uniform scale + translation, least squares onto the four APPROVED target
//   points (targets-hair-v1.json) -> the pinned area filter (D-164 code) -> one achromatic 1024x1536 hair luminance layer
//   -> HP1..HP8 (binding functional placement checks) + diagnostics (zone overlap, broad envelope, nape lock, check points).
//   Colour: tonalRampB() — D-174's planned R3 hair colouring. It is OFFLINE ONLY: no renderer calls it, and the live R2/C2
//   hair keeps multiply x token. bbox / alpha never set a transform; only the annotation does. Nothing is cropped, moved,
//   de-matted, recoloured or repaired to pass a check.
import { createHash } from "node:crypto";
import { decodePng, encodePng, fitUniformScaleTranslate, resampleArea, overInto, quantise, pixelSha256, MASTER } from "./r3-face-parts-tool.mjs";
import { components } from "./r3-eyes-tool.mjs";

export { decodePng, encodePng, pixelSha256 };
export const TOOL_ID = "r3-hair-tool-v1";
export const SHEET = Object.freeze({ w: 1024, h: 1024 });
export const ANNOTATION_SCHEMA = "r3-hair-annotation-v1";
export const TARGETS_SCHEMA = "r3-hair-targets-v1";
export const FIT_POINTS = Object.freeze(["crownTuftTip", "centralLockTip", "leftTempleLockTip", "rightTempleLockTip"]);   // A1, A5, A7, A8
export const CHECK_POINTS = Object.freeze(["leftOuterSpikeTip", "rightOuterSpikeTip", "centreHairline", "rightOfCentreLockTip", "leftEarTopJunction", "rightEarTopJunction"]);
export const MODES = Object.freeze({
  production: { annotation: ["APPROVED"], targets: ["APPROVED"] },
  "synthetic-test": { annotation: ["SYNTHETIC_TEST_APPROVED"], targets: ["SYNTHETIC_TEST_APPROVED", "APPROVED"] },
});
export const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const RESULT = Object.freeze({ ok: "PASS", rejected: "REJECT" });

/** Every numeric threshold, fixed by D-174 BEFORE any hair call. Mirrored verbatim in hairMethod.thresholds. */
export const THRESHOLDS = Object.freeze({
  visibleAlphaMin: 16,              // raw sheet: alpha >= 16 is visible content
  lowAlphaReportedMax: 15,          // raw sheet: alpha 1..15 is reported, never rejected
  borderPx: 16,
  chromaMax: 12,                    // max(R,G,B) - min(R,G,B) at alpha >= 16: achromatic
  dominantComponentMinFraction: 0.95,
  visibleAreaFractionRange: Object.freeze([0.15, 0.8]),
  residualFitMaxPx: 3.0,            // = the targets' documented uncertainty
  scaleRange: Object.freeze([0.35, 0.85]),
  hairTouchAlphaMin: 8,             // placed layer: alpha >= 8 counts as hair over something
  hairSolidAlphaMin: 250,           // placed layer: alpha >= 250 hides what lies beneath
  holeAlphaBelow: 128,              // a scalp hole is head geometry under hair alpha < 128 ...
  crownMaxY: 199,                   // HP4: every head-geometry pixel in rows <= 199 must be under solid hair
  browEndCoveredMinFraction: 0.5,
  earAllowanceGrowPx: 3,
  envelopeGrowPx: 24,               // diagnostic only
  napeGrowPx: 8,                    // diagnostic only
});
/** Geometry fixed by D-174 (master canvas, integer pixel indices, inclusive ranges; distances from the pixel centre). */
export const ZONES = Object.freeze({
  faceSeed: Object.freeze([511, 360]),                                      // HP5: ... not 4-connected to this face pixel
  ear: Object.freeze({ rows: Object.freeze([294, 380]), leftMaxX: 362, rightMinX: 661 }),  // V3 ears; row-293 cranium is x 363..660
  browLeft: Object.freeze({ rows: Object.freeze([240, 280]), outerEnd: Object.freeze([397, 407]), middle: Object.freeze([414, 462]), innerEnd: Object.freeze([469, 483]) }),
  browRight: Object.freeze({ rows: Object.freeze([238, 276]), cols: Object.freeze([528, 626]) }),
  // D-159's eye and fold zones (faceNeutralPreparation.areaModel.excludedZones) — DIAGNOSTIC zone overlap only
  eyeZones: Object.freeze([Object.freeze([401, 277, 479, 357]), Object.freeze([540, 275, 619, 356])]),
  foldZones: Object.freeze([
    Object.freeze({ polyline: Object.freeze([[432, 272], [458, 274], [470, 281], [476, 286]].map(Object.freeze)), halfWidth: 3 }),
    Object.freeze({ polyline: Object.freeze([[541, 288], [549, 280], [556, 274], [565, 272], [582, 272]].map(Object.freeze)), halfWidth: 3 }),
  ]),
});

// ═════════════════════════════════ tonal ramp B (D-174) ═════════════════════════════════
// 8-bit sRGB code values used directly (no linearisation, no colour management, no ICC/gAMA). Integer arithmetic only, so
// the result is exact and platform-independent; every rounding is half up: roundHalfUp(n / d) = floor((2n + d) / (2d)), d > 0.
const rhu = (n, d) => Math.floor((2 * n + d) / (2 * d));
const clamp8 = (v) => Math.min(255, Math.max(0, v));
export const RAMP_B = Object.freeze({ stops: Object.freeze([0, 80, 150, 255]), inkNumerator: 1, inkDenominator: 2, lightPercent: 45 });
const isRgb = (c) => Array.isArray(c) && c.length === 3 && c.every((v) => Number.isInteger(v) && v >= 0 && v <= 255);
export const hexToRgb = (h) => { if (typeof h !== "string" || !/^#[0-9a-fA-F]{6}$/.test(h)) throw new Error(`not a #RRGGBB colour: ${h}`); return [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16)); };
/** The four colour stops for one token { base, shadow } (#RRGGBB or [r, g, b]). */
export function rampStopsB(token) {
  const base = Array.isArray(token?.base) ? token.base : hexToRgb(token?.base), shadow = Array.isArray(token?.shadow) ? token.shadow : hexToRgb(token?.shadow);
  if (!isRgb(base) || !isRgb(shadow)) throw new Error("token needs base and shadow as 8-bit RGB");
  const ink = shadow.map((c) => rhu(c * RAMP_B.inkNumerator, RAMP_B.inkDenominator));
  const m = Math.max(...base);
  // light_c = base_c + roundHalfUp((255 - base_c) * 45 * base_c / (100 * max(base))); a black base (max 0) keeps light = base
  const light = m === 0 ? base.slice() : base.map((c) => clamp8(c + rhu((255 - c) * RAMP_B.lightPercent * c, 100 * m)));
  return [[RAMP_B.stops[0], ink], [RAMP_B.stops[1], shadow.slice()], [RAMP_B.stops[2], base.slice()], [RAMP_B.stops[3], light]];
}
/** Rec. 709 luma of the 8-bit sRGB code values, integer, round half up. The sheet is achromatic, so L ~ R = G = B. */
export const lumaB = (r, g, b) => rhu(2126 * r + 7152 * g + 722 * b, 10000);
/** The ramp colour for one luminance L (0..255): piecewise linear between the stops; L on a stop gives that stop exactly. */
export function rampColourB(stops, L) {
  if (!Number.isInteger(L) || L < 0 || L > 255) throw new Error(`L must be an integer 0..255, got ${L}`);
  for (let k = 1; k < stops.length; k++) {
    const [L0, c0] = stops[k - 1], [L1, c1] = stops[k];
    if (L <= L1) return c0.map((v, j) => clamp8(v + rhu((c1[j] - v) * (L - L0), L1 - L0)));
  }
  return stops[stops.length - 1][1].slice();
}
/**
 * Colour a straight-alpha RGBA luminance layer with ramp B for one token. Alpha is copied unchanged; the colour comes from
 * the pixel's own (unpremultiplied) luma; a pixel with alpha 0 becomes (0, 0, 0, 0). The result is a normal straight-alpha
 * layer for source-over compositing — no multiply, no CSS mask. Pure: never touches the input.
 */
export function applyTonalRampB(px, token) {
  if (!(px instanceof Uint8Array || px instanceof Uint8ClampedArray) || px.length % 4) throw new Error("px must be RGBA bytes");
  const stops = rampStopsB(token), lut = Array.from({ length: 256 }, (_, L) => rampColourB(stops, L)), out = new Uint8ClampedArray(px.length);
  for (let o = 0; o < px.length; o += 4) { const a = px[o + 3]; if (!a) continue; const c = lut[lumaB(px[o], px[o + 1], px[o + 2])]; out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = a; }
  return out;
}

// ═════════════════════════════════ geometry helpers ═════════════════════════════════
const segDist = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
/** Even-odd point-in-polygon for a closed polygon [[x, y], ...]. */
export function insidePolygon(poly, x, y) { let inside = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside; } return inside; }
/** Distance from (x, y) to a closed polygon's outline; 0 inside. */
export function distToPolygon(poly, x, y) { if (insidePolygon(poly, x, y)) return 0; let d = Infinity; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) d = Math.min(d, segDist([x, y], poly[j], poly[i])); return d; }
const inFoldZone = (x, y) => ZONES.foldZones.some((f) => { for (let k = 1; k < f.polyline.length; k++) if (segDist([x + 0.5, y + 0.5], f.polyline[k - 1], f.polyline[k]) <= f.halfWidth) return true; return false; });
const inEyeZone = (x, y) => ZONES.eyeZones.some((z) => x >= z[0] && x <= z[2] && y >= z[1] && y <= z[3]);
export const isEarPixel = (x, y) => y >= ZONES.ear.rows[0] && y <= ZONES.ear.rows[1] && (x <= ZONES.ear.leftMaxX || x >= ZONES.ear.rightMinX);
const isPt = (p) => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === "number" && Number.isFinite(v));
const isPoly = (a) => Array.isArray(a) && a.length >= 3 && a.every(isPt);

// ═════════════════════════════════ raw sheet ═════════════════════════════════
/** The binding raw checks H1..H5 (D-174). The first failure stops. Returns verdict, steps, diagnostics and (on PASS) px. */
export function checkHairSheet(buf) {
  const T = THRESHOLDS, auto = [], diag = [];
  const step = (id, name, ok, detail) => { auto.push({ id, name, result: ok ? RESULT.ok : RESULT.rejected, detail }); return ok; };
  const fail = (id) => ({ verdict: "REJECT", firstFailure: id, auto, diag, rawSha256: sha256(buf) });
  const P = decodePng(buf);
  const okFmt = P.ok && !!P.px && P.header.w === SHEET.w && P.header.h === SHEET.h;
  if (!step("H1", "PNG decodes, 1024x1024, 8-bit RGBA, not interlaced", okFmt, !P.ok ? P.error : `${P.header.w}x${P.header.h}, colour type ${P.header.colourType}, bit depth ${P.header.bitDepth}, interlace ${P.header.interlace}`)) return fail("H1");
  const px = P.px, W = SHEET.w, H = SHEET.h;
  let border = 0, low = 0, visible = 0, chroma = 0; const vis = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, o = i * 4, a = px[o + 3];
    if (a >= 1 && a <= T.lowAlphaReportedMax) low++;
    if (a < T.visibleAlphaMin) continue;
    visible++; vis[i] = 1;
    if (x < T.borderPx || y < T.borderPx || x >= W - T.borderPx || y >= H - T.borderPx) border++;
    chroma = Math.max(chroma, Math.max(px[o], px[o + 1], px[o + 2]) - Math.min(px[o], px[o + 1], px[o + 2]));
  }
  diag.push({ id: "H-LOWALPHA", name: `pixels with alpha 1..${T.lowAlphaReportedMax} (reported, never rejected)`, value: low });
  if (!step("H2", `no pixel with alpha >= ${T.visibleAlphaMin} in the ${T.borderPx} px border`, border === 0, `${border} px`)) return fail("H2");
  if (!step("H3", `achromatic: max(R,G,B) - min(R,G,B) <= ${T.chromaMax} at alpha >= ${T.visibleAlphaMin}`, chroma <= T.chromaMax, `max chroma ${chroma}`)) return fail("H3");
  const { comps } = components(vis, W, H, 8), largest = comps.reduce((m, c) => Math.max(m, c.n), 0), frac = visible ? largest / visible : 0;
  if (!step("H4", `one dominant 8-connected component holds >= ${T.dominantComponentMinFraction} of the visible pixels`, visible > 0 && frac >= T.dominantComponentMinFraction, `${comps.length} components, largest ${largest} of ${visible} (${frac.toFixed(4)})`)) return fail("H4");
  const area = visible / (W * H);
  if (!step("H5", `visible area fraction in ${T.visibleAreaFractionRange[0]}..${T.visibleAreaFractionRange[1]}`, area >= T.visibleAreaFractionRange[0] && area <= T.visibleAreaFractionRange[1], area.toFixed(4))) return fail("H5");
  const hist = [0, 0, 0, 0]; for (let i = 0; i < W * H; i++) if (vis[i]) { const L = lumaB(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]); hist[L < 40 ? 0 : L < 115 ? 1 : L < 200 ? 2 : 3]++; }
  diag.push({ id: "H-TONES", name: "visible pixels by ramp-B tone band (ink < 40, shadow < 115, base < 200, light) — the B convention is judged visually", value: hist });
  diag.push({ id: "H-VISUAL", name: "Northstar's hairstyle incl. the lock under the image-right ear, complete lock tips, clean lower edge at the ears, no face/skin/scalp", value: "visual review only", flagged: null });
  return { verdict: "PASS_TO_ANNOTATION", firstFailure: null, auto, diag, rawSha256: sha256(buf), px };
}

// ═════════════════════════════════ targets + annotation ═════════════════════════════════
export function validateTargets(targets, mode) {
  const m = MODES[mode]; if (!m) return { ok: false, code: "UNKNOWN_MODE" };
  if (!targets || targets.schema !== TARGETS_SCHEMA) return { ok: false, code: "TARGETS_SCHEMA_INVALID" };
  if (!m.targets.includes(targets.status)) return { ok: false, code: "TARGETS_NOT_APPROVED", why: `status ${targets.status} not accepted in ${mode} mode` };
  for (const k of [...FIT_POINTS, ...CHECK_POINTS]) if (!isPt(targets.points?.[k]?.xy)) return { ok: false, code: "TARGETS_POINTS_INVALID", why: k };
  for (const k of FIT_POINTS) if (targets.points[k].role !== "fit") return { ok: false, code: "TARGETS_ROLE_INVALID", why: `${k} must be a fit point` };
  for (const k of CHECK_POINTS) if (targets.points[k].role !== "check") return { ok: false, code: "TARGETS_ROLE_INVALID", why: `${k} must be a check point` };
  if (!isPoly(targets.geometry?.sketchSilhouette) || !isPoly(targets.geometry?.napeLock)) return { ok: false, code: "TARGETS_GEOMETRY_INVALID" };
  return { ok: true };
}
/** Source anchors on ONE generated sheet: unknown until that sheet exists; the four fit points are required, check points optional. */
export function validateAnnotation(ann, rawSha, mode) {
  const m = MODES[mode]; if (!m) return { ok: false, code: "UNKNOWN_MODE" };
  if (!ann) return { ok: false, code: "NO_ANNOTATION" };
  if (ann.schema !== ANNOTATION_SCHEMA) return { ok: false, code: "ANNOTATION_SCHEMA_INVALID" };
  if (ann.raw?.sha256 !== rawSha) return { ok: false, code: "ANNOTATION_RAW_SHA_MISMATCH", why: "the annotation belongs to another hair sheet" };
  if (!m.annotation.includes(ann.status)) return { ok: false, code: "ANNOTATION_NOT_APPROVED", why: `status ${ann.status} not accepted in ${mode} mode` };
  const keys = Object.keys(ann.points ?? {});
  for (const k of FIT_POINTS) if (!isPt(ann.points?.[k])) return { ok: false, code: "ANNOTATION_POINTS_INVALID", why: `${k} is required as a finite [x, y]` };
  for (const k of keys) {
    if (![...FIT_POINTS, ...CHECK_POINTS].includes(k)) return { ok: false, code: "ANNOTATION_POINT_UNKNOWN", why: k };
    if (!isPt(ann.points[k])) return { ok: false, code: "ANNOTATION_POINTS_INVALID", why: k };
    const [x, y] = ann.points[k]; if (x < 0 || y < 0 || x > SHEET.w || y > SHEET.h) return { ok: false, code: "ANNOTATION_POINT_OUTSIDE_SHEET", why: k };
  }
  return { ok: true };
}

// ═════════════════════════════════ placement checks ═════════════════════════════════
/**
 * The functional placement checks HP4..HP8 on a placed 1024x1536 hair layer, plus the diagnostics. Inputs: the hair layer,
 * the adopted head geometry (alpha >= 128 = head), the face layer under review (its brows, never modified), the placed
 * eyes-fixed layer and the iris layer, and the targets (for the ear allowance, the envelope and the nape lock).
 * Returns { checks: [{id, ok, value}], firstFailure, diagnostics }. Pure.
 */
export function checkPlacedHair({ hairPx, headPx, facePx, eyesFixedPx, irisPx, targets }) {
  const T = THRESHOLDS, Z = ZONES, W = MASTER.w, H = MASTER.h, A = (px, x, y) => px[(y * W + x) * 4 + 3];
  const sil = targets.geometry.sketchSilhouette, nape = targets.geometry.napeLock;
  // HP4 crown
  let crownUncovered = 0; for (let y = 0; y <= T.crownMaxY; y++) for (let x = 0; x < W; x++) if (A(headPx, x, y) >= 128 && A(hairPx, x, y) < T.hairSolidAlphaMin) crownUncovered++;
  // HP5 scalp holes: head pixels under hair alpha < 128, 4-connected; every component without the face seed is a hole
  const open = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) if (headPx[i * 4 + 3] >= 128 && hairPx[i * 4 + 3] < T.holeAlphaBelow) open[i] = 1;
  const { labels, comps } = components(open, W, H, 4), seed = Z.faceSeed[1] * W + Z.faceSeed[0], faceId = labels[seed];
  const holes = comps.filter((c) => c.id !== faceId), holePx = holes.reduce((s, c) => s + c.n, 0);
  // HP6 brows (face layer read only)
  const BL = Z.browLeft, BR = Z.browRight, inR = (v, r) => v >= r[0] && v <= r[1];
  const brow = { outer: [0, 0], inner: [0, 0], middleTouched: 0, rightTouched: 0, leftPx: 0, rightPx: 0 };
  for (let y = BL.rows[0]; y <= BL.rows[1]; y++) for (let x = BL.outerEnd[0]; x <= BL.innerEnd[1]; x++) {
    if (A(facePx, x, y) < 128) continue; brow.leftPx++; const h = A(hairPx, x, y);
    if (inR(x, BL.outerEnd)) { brow.outer[0]++; if (h >= T.hairSolidAlphaMin) brow.outer[1]++; }
    if (inR(x, BL.innerEnd)) { brow.inner[0]++; if (h >= T.hairSolidAlphaMin) brow.inner[1]++; }
    if (inR(x, BL.middle) && h >= T.hairTouchAlphaMin) brow.middleTouched++;
  }
  for (let y = BR.rows[0]; y <= BR.rows[1]; y++) for (let x = BR.cols[0]; x <= BR.cols[1]; x++) { if (A(facePx, x, y) < 128) continue; brow.rightPx++; if (A(hairPx, x, y) >= T.hairTouchAlphaMin) brow.rightTouched++; }
  const frac = ([n, c]) => (n ? c / n : 0);
  // HP7 actual eye coverage vs DIAGNOSTIC zone overlap; HP8 ears; diagnostics
  const eye = { eyeWhite: 0, lashOrOutline: 0, foldStroke: 0, otherEyesFixed: 0, iris: 0 }, zone = { eyeZones: 0, foldZones: 0 };
  let earOutside = 0, earInside = 0, envelopeOutside = 0, napeSolid = 0, lowAlpha = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4, h = hairPx[o + 3]; if (!h) continue;
    if (h < T.hairTouchAlphaMin) { lowAlpha++; continue; }
    const cx = x + 0.5, cy = y + 0.5;
    if (inEyeZone(x, y)) zone.eyeZones++;
    const fold = inFoldZone(x, y); if (fold) zone.foldZones++;
    if (eyesFixedPx[o + 3] >= T.hairTouchAlphaMin) { const L = lumaB(eyesFixedPx[o], eyesFixedPx[o + 1], eyesFixedPx[o + 2]); if (fold) eye.foldStroke++; else if (eyesFixedPx[o + 3] >= 128 && L >= 200) eye.eyeWhite++; else if (L < 80) eye.lashOrOutline++; else eye.otherEyesFixed++; }
    else if (irisPx[o + 3] >= T.hairTouchAlphaMin) eye.iris++;
    if (headPx[o + 3] >= 128 && isEarPixel(x, y)) { if (distToPolygon(sil, cx, cy) <= T.earAllowanceGrowPx) earInside++; else earOutside++; }
    if (distToPolygon(sil, cx, cy) > T.envelopeGrowPx && distToPolygon(nape, cx, cy) > T.envelopeGrowPx) envelopeOutside++;
    if (h >= 128 && distToPolygon(nape, cx, cy) <= T.napeGrowPx) napeSolid++;
  }
  const eyeTotal = eye.eyeWhite + eye.lashOrOutline + eye.foldStroke + eye.otherEyesFixed + eye.iris;
  const checks = [
    { id: "HP4", name: `crown: every head pixel in rows <= ${T.crownMaxY} under hair alpha >= ${T.hairSolidAlphaMin}`, ok: crownUncovered === 0, value: crownUncovered },
    { id: "HP5", name: `no scalp hole: head pixels under hair alpha < ${T.holeAlphaBelow} that are not 4-connected to the face pixel (${Z.faceSeed})`, ok: faceId >= 0 && holePx === 0, value: { holePx, holes: holes.length, faceSeedOpen: faceId >= 0 } },
    { id: "HP6", name: `complete brows, hair covers only the ends of the image-left brow: >= ${T.browEndCoveredMinFraction} of each end zone solid, 0 px on its middle x ${BL.middle.join("..")} and on the image-right brow`,
      ok: brow.leftPx > 0 && brow.rightPx > 0 && frac(brow.outer) >= T.browEndCoveredMinFraction && frac(brow.inner) >= T.browEndCoveredMinFraction && brow.middleTouched === 0 && brow.rightTouched === 0,
      value: { leftBrowPx: brow.leftPx, outerEnd: { px: brow.outer[0], solid: brow.outer[1] }, innerEnd: { px: brow.inner[0], solid: brow.inner[1] }, middleTouchedPx: brow.middleTouched, rightBrowPx: brow.rightPx, rightTouchedPx: brow.rightTouched } },
    { id: "HP7", name: `actual eye coverage: 0 px of hair alpha >= ${T.hairTouchAlphaMin} over drawn eyes-fixed content (whites, lashes/outline, fold strokes) or the iris`, ok: eyeTotal === 0, value: eye },
    { id: "HP8", name: `ears: hair alpha >= ${T.hairTouchAlphaMin} on the V3 ear columns only inside the v2 ear-top area (sketch silhouette grown ${T.earAllowanceGrowPx} px)`, ok: earOutside === 0, value: { outsidePx: earOutside, insidePx: earInside } },
  ];
  const firstFailure = checks.find((c) => !c.ok)?.id ?? null;
  const diagnostics = { zoneOverlapPx: zone, zoneOverlapIsDiagnostic: "D-159 zone overlap is reported only; HP7 decides on drawn eye content",
    broadEnvelopeOutsidePx: envelopeOutside, broadEnvelope: `sketch silhouette or nape lock grown ${T.envelopeGrowPx} px — diagnostic, never binding`,
    napeLockSolidPx: napeSolid, napeLock: `solid hair within ${T.napeGrowPx} px of the planned nape lock — its connection is judged against an underlay with a neck`,
    lowAlphaPx: lowAlpha };
  return { checks, firstFailure, diagnostics };
}

// ═════════════════════════════════ compose ═════════════════════════════════
const map = (f, p) => [f.s * p[0] + f.tx, f.s * p[1] + f.ty];
/**
 * Compose the hair. `sheet` is a PASSING checkHairSheet result. Returns the FIRST failure { ok:false, stage, code, why }
 * (nothing else produced) or { ok:true, hairPx, log }. Never modifies a raw sheet or any input layer.
 */
export function composeHair({ sheet, annotation, targets, mode, headPx, facePx, eyesFixedPx, irisPx }) {
  const T = THRESHOLDS;
  if (!sheet || sheet.verdict !== "PASS_TO_ANNOTATION") return { ok: false, stage: "raw", code: "HAIR_SHEET_NOT_PASSED" };
  const vt = validateTargets(targets, mode); if (!vt.ok) return { ok: false, stage: "targets", ...vt };
  const va = validateAnnotation(annotation, sheet.rawSha256, mode); if (!va.ok) return { ok: false, stage: "annotation", ...va };
  for (const [k, v] of Object.entries({ headPx, facePx, eyesFixedPx, irisPx })) if (!v || v.length !== MASTER.w * MASTER.h * 4) return { ok: false, stage: "inputs", code: "LAYER_MISSING", why: k };
  const ff = fitUniformScaleTranslate(FIT_POINTS.map((k) => annotation.points[k]), FIT_POINTS.map((k) => targets.points[k].xy));
  if (!ff.ok) return { ok: false, stage: "fit", code: ff.code, why: ff.why };
  if (ff.residualMaxPx > T.residualFitMaxPx) return { ok: false, stage: "placement", code: "HP1_RESIDUAL", why: `max residual ${ff.residualMaxPx.toFixed(3)} px > ${T.residualFitMaxPx}` };
  if (!(ff.s >= T.scaleRange[0] && ff.s <= T.scaleRange[1])) return { ok: false, stage: "placement", code: "HP2_SCALE", why: `s = ${ff.s}` };
  const layer = resampleArea({ w: SHEET.w, h: SHEET.h, px: sheet.px }, ff.s, ff.tx, ff.ty, MASTER.w, MASTER.h), acc = new Float64Array(MASTER.w * MASTER.h * 4);
  overInto(acc, MASTER.w, layer);
  const hairPx = quantise(acc, MASTER.w, MASTER.h);
  const pc = checkPlacedHair({ hairPx, headPx, facePx, eyesFixedPx, irisPx, targets });
  if (pc.firstFailure) { const c = pc.checks.find((x) => x.id === pc.firstFailure); return { ok: false, stage: "placement", code: `${c.id}_FAILED`, why: JSON.stringify(c.value), checks: pc.checks, diagnostics: pc.diagnostics }; }
  const checkPointResidualPx = Object.fromEntries(CHECK_POINTS.filter((k) => isPt(annotation.points[k])).map((k) => { const p = map(ff, annotation.points[k]); return [k, Math.hypot(p[0] - targets.points[k].xy[0], p[1] - targets.points[k].xy[1])]; }));
  return { ok: true, hairPx, log: { tool: TOOL_ID, mode, thresholds: T, transform: { s: ff.s, tx: ff.tx, ty: ff.ty }, fitPoints: FIT_POINTS, residualVectorsPx: Object.fromEntries(FIT_POINTS.map((k, i) => [k, ff.residuals[i]])),
    residualMaxPx: ff.residualMaxPx, fitDescription: ff.fitDescription, checks: [{ id: "HP1", ok: true, value: ff.residualMaxPx }, { id: "HP2", ok: true, value: ff.s }, { id: "HP3", ok: true, value: { checkPointResidualPx, note: "reported only" } }, ...pc.checks],
    diagnostics: pc.diagnostics, output: { hairPixelSha256: pixelSha256(hairPx) } } };
}
