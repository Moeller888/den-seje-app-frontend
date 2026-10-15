// D-159 — output checks for a LATER, separately authorised R3 face-neutral attempt. PREPARATION ONLY.
//
// This module never sends, never fetches, never reads credentials or claims and never writes a file. It reads ONE
// delivered PNG (bytes) plus Northstar Master v2 (for the provisional brow target areas) and returns a report:
//
//   AUTO  binding technical rejections (D-159): decode, master canvas, RGBA 8-bit, not empty, and no alpha outside
//         the broad envelope [384, 230, 632, 412]. The first failure stops the check; no candidate file may be
//         written by the caller after a REJECT.
//   DIAG  diagnostic indicators. They flag for the owner's visual review and NEVER reject.
//   The visual owner review itself is not code.
//
// The broad envelope proves nothing about content: pixels inside it can still be skin, eye parts or guide markers.
// Nothing here crops, moves, warps, de-mattes or repairs an output.
//
// COORDINATES (D-159): master canvas 1024x1536, x right, y down, integer pixel indices. A rectangle [x0, y0, x1, y1] is
// INCLUSIVE on all four sides: pixel (x, y) is inside iff x0 <= x <= x1 and y0 <= y <= y1. Fold zones are polylines
// with a half-width measured from the pixel CENTRE (x + 0.5, y + 0.5). Brow target areas are the brow shapes dilated by
// 3 px in the Chebyshev metric.
import { inflateSync } from "node:zlib";

export const MASTER = Object.freeze({ w: 1024, h: 1536 });
export const SOLID = 128;                                            // D-071
export const BROAD_ENVELOPE = Object.freeze([384, 230, 632, 412]);   // inclusive; D-159 binding technical rejection area
export const NOSE_TARGET = Object.freeze([488, 340, 518, 379]);     // inclusive; diagnostic
export const MOUTH_TARGET = Object.freeze([466, 372, 559, 402]);    // inclusive; diagnostic
export const BROW_MARGIN = 3;                                        // Chebyshev; diagnostic
export const EYE_ZONES = Object.freeze([Object.freeze([401, 277, 479, 357]), Object.freeze([540, 275, 619, 356])]);   // inclusive; diagnostic, high priority
export const FOLD_ZONES = Object.freeze([
  Object.freeze({ polyline: [[432, 272], [458, 274], [470, 281], [476, 286]], halfWidth: 3 }),
  Object.freeze({ polyline: [[541, 288], [549, 280], [556, 274], [565, 272], [582, 272]], halfWidth: 3 }),
]);
export const BROW_RULE = Object.freeze({ axis: 510.8997, tx: -5, ty: 4, darkLStar: 45, seedBox: [540, 243, 600, 269], componentBox: [530, 238, 625, 275],
  leftBbox: [397, 247, 482, 273], rightBbox: [534, 243, 619, 269], px: 1120 });
export const MARKER_COLOURS = Object.freeze({ cyan: [0, 255, 255], magenta: [255, 0, 255] });
export const U1_SKIN = Object.freeze([254, 197, 128]);
export const DIAG_PROPOSALS = Object.freeze({ minSolidPx: 400, skinDeltaE: 6, premultLowAlpha: 96, haloLighterL: 15, markerTolerance: 8 });
export const inRect = ([x0, y0, x1, y1], x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const RESULT = Object.freeze({ ok: "PASS", rejected: "REJECT" });

// ── PNG: header read directly (the colour type is reported, never silently converted) ─────────────────────────
const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
export function readPng(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 33) return { ok: false, error: "too short to be a PNG" };
  for (let i = 0; i < 8; i++) if (buf[i] !== SIG[i]) return { ok: false, error: "PNG signature missing" };
  let off = 8, ihdr = null; const idat = [];
  while (off + 12 <= buf.length) { const len = buf.readUInt32BE(off), type = buf.toString("ascii", off + 4, off + 8); if (off + 12 + len > buf.length) return { ok: false, error: "truncated chunk " + type };
    const d = buf.subarray(off + 8, off + 8 + len); if (type === "IHDR") ihdr = { w: d.readUInt32BE(0), h: d.readUInt32BE(4), bitDepth: d[8], colourType: d[9], interlace: d[12] }; else if (type === "IDAT") idat.push(d); else if (type === "IEND") break; off += 12 + len; }
  if (!ihdr) return { ok: false, error: "no IHDR" };
  if (!idat.length) return { ok: false, error: "no IDAT", header: ihdr };
  if (ihdr.bitDepth !== 8 || ihdr.interlace !== 0 || ![2, 6].includes(ihdr.colourType)) return { ok: true, header: ihdr, rgba: null };
  let raw; try { raw = inflateSync(Buffer.concat(idat)); } catch { return { ok: false, error: "IDAT does not inflate", header: ihdr }; }
  const ch = ihdr.colourType === 6 ? 4 : 3, { w, h } = ihdr, stride = w * ch;
  if (raw.length < h * (stride + 1)) return { ok: false, error: "image data too short", header: ihdr };
  const px = Buffer.alloc(h * stride); let prev = Buffer.alloc(stride), p = 0;
  for (let y = 0; y < h; y++) { const f = raw[p++], cur = raw.subarray(p, p + stride); p += stride; if (f > 4) return { ok: false, error: "bad filter byte", header: ihdr }; const o = px.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) { const a = x >= ch ? o[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0; let v = cur[x]; if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) v += paeth(a, b, c); o[x] = v & 255; } prev = o; }
  const rgba = Buffer.alloc(w * h * 4); for (let i = 0; i < w * h; i++) { for (let k = 0; k < 3; k++) rgba[i * 4 + k] = px[i * ch + k]; rgba[i * 4 + 3] = ch === 4 ? px[i * ch + 3] : 255; }
  return { ok: true, header: ihdr, rgba };
}

// ── colour (copied verbatim from build-r3-head-colour-fixtures.mjs so this module imports nothing else) ─────────
const linC = (c) => { c /= 255; return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92; };
export function toLab([r, g, b]) {
  const R = linC(r), G = linC(g), B = linC(b);
  let X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047, Y = 0.2126 * R + 0.7152 * G + 0.0722 * B, Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const t = (v) => (v > 216 / 24389 ? Math.cbrt(v) : (24389 / 27 * v + 16) / 116); X = t(X); Y = t(Y); Z = t(Z);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}
export function deltaE00([L1, a1, b1], [L2, a2, b2]) {
  const rad = Math.PI / 180, C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2, G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2, C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const hue = (b, a) => { const v = Math.atan2(b, a) / rad; return v < 0 ? v + 360 : v; }; const h1p = hue(b1, a1p), h2p = hue(b2, a2p);
  const dL = L2 - L1, dC = C2p - C1p; let dh = 0; if (C1p * C2p) { dh = h2p - h1p; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; }
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin((dh / 2) * rad), Lb = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
  let hb = h1p + h2p; if (C1p * C2p) hb = Math.abs(h1p - h2p) > 180 ? (h1p + h2p + 360) / 2 : (h1p + h2p) / 2;
  const T = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad) + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.2 * Math.cos((4 * hb - 63) * rad);
  const dTh = 30 * Math.exp(-(((hb - 275) / 25) ** 2)), RC = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const SL = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2), SC = 1 + 0.045 * Cbp, SH = 1 + 0.015 * Cbp * T, RT = -Math.sin(2 * dTh * rad) * RC;
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}

// ── provisional geometry ───────────────────────────────────────────────────────────────────────────────────
/** The two brow shapes (sets of pixel indices) from Northstar's RGBA, by the published brow rule. Deterministic. */
export function browShapes(nsRgba) {
  const W = MASTER.w, L = (p) => { const i = p * 4; return nsRgba[i + 3] >= 128 ? toLab([nsRgba[i], nsRgba[i + 1], nsRgba[i + 2]])[0] : -1; };
  const dark = (p) => { const v = L(p); return v >= 0 && v < BROW_RULE.darkLStar; };
  const [sx0, sy0, sx1, sy1] = BROW_RULE.seedBox, [bx0, by0, bx1, by1] = BROW_RULE.componentBox; let seed = -1;
  for (let x = sx0; x < sx1 && seed < 0; x++) for (let y = sy0; y <= sy1; y++) if (dark(y * W + x)) { seed = y * W + x; break; }
  if (seed < 0) throw new Error("brow seed not found");
  const comp = new Set([seed]), st = [seed];
  while (st.length) { const q = st.pop(), x = q % W, y = (q / W) | 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy, r = yy * W + xx; if (xx < bx0 || xx > bx1 || yy < by0 || yy > by1 || comp.has(r) || !dark(r)) continue; comp.add(r); st.push(r); } }
  const cols = new Map(); for (const p of comp) { const x = p % W, y = (p / W) | 0, c = cols.get(x) || [1e9, -1]; cols.set(x, [Math.min(c[0], y), Math.max(c[1], y)]); }
  const right = new Set(); for (const [x, [a, b]] of cols) for (let y = a; y <= b; y++) right.add(y * W + x);
  const left = new Set(); for (let y = 225; y <= 290; y++) for (let x = 385; x <= 505; x++) { const sx = Math.floor(2 * BROW_RULE.axis - (x + 0.5 - BROW_RULE.tx)), sy = Math.floor(y + 0.5 - BROW_RULE.ty); if (right.has(sy * W + sx)) left.add(y * W + x); }
  return { left, right };
}
export const bboxOf = (S) => { const W = MASTER.w; let b = [W, MASTER.h, -1, -1]; for (const p of S) { const x = p % W, y = (p / W) | 0; b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)]; } return b; };
export function dilate(S, r) { const W = MASTER.w, D = new Set(); for (const p of S) { const x = p % W, y = (p / W) | 0; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) D.add((y + dy) * W + x + dx); } return D; }
const segDist = (px, py, [ax, ay], [bx, by]) => { const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))); return Math.hypot(px - ax - t * dx, py - ay - t * dy); };
export const inFold = (x, y) => FOLD_ZONES.some(({ polyline, halfWidth }) => { for (let k = 0; k + 1 < polyline.length; k++) if (segDist(x + 0.5, y + 0.5, polyline[k], polyline[k + 1]) <= halfWidth) return true; return false; });
export const inEye = (x, y) => EYE_ZONES.some((r) => inRect(r, x, y));
/** Target areas (diagnostic): brows dilated by BROW_MARGIN, plus nose and mouth rectangles. */
export function targetAreas(nsRgba) { const { left, right } = browShapes(nsRgba); return { browArea: new Set([...dilate(left, BROW_MARGIN), ...dilate(right, BROW_MARGIN)]), left, right }; }

// ── the check ──────────────────────────────────────────────────────────────────────────────────────────────
/**
 * @param {Buffer} buf     the delivered PNG bytes (read-only; never modified)
 * @param {Buffer} nsRgba  Northstar Master v2 RGBA (for the brow target areas); may be null → DIAG-5 is skipped
 * @returns {{verdict: "REJECT"|"PASS_TO_VISUAL_REVIEW", firstFailure: string|null, auto: object[], diag: object[]}}
 */
export function checkFaceNeutralOutput(buf, nsRgba = null) {
  const auto = [], diag = [];
  const done = (id, name, ok, detail) => { auto.push({ id, name, status: ok ? RESULT.ok : RESULT.rejected, detail }); return ok; };
  const P = readPng(buf);
  if (!done("AUTO-1", "PNG decodes", P.ok, P.ok ? "ok" : P.error)) return { verdict: "REJECT", firstFailure: "AUTO-1", auto, diag };
  const { w, h, colourType, bitDepth, interlace } = P.header;
  if (!done("AUTO-2", "master canvas 1024x1536", w === MASTER.w && h === MASTER.h, `${w}x${h}`)) return { verdict: "REJECT", firstFailure: "AUTO-2", auto, diag };
  if (!done("AUTO-3", "PNG colour type 6 (RGBA), 8-bit, not interlaced", colourType === 6 && bitDepth === 8 && interlace === 0, `colour type ${colourType}, bit depth ${bitDepth}, interlace ${interlace}`)) return { verdict: "REJECT", firstFailure: "AUTO-3", auto, diag };
  const rgba = P.rgba, N = w * h; let anyAlpha = 0, solid = 0, outside = 0; const firstOutside = [];
  for (let p = 0; p < N; p++) { const a = rgba[p * 4 + 3]; if (!a) continue; anyAlpha++; if (a >= SOLID) solid++; const x = p % w, y = (p / w) | 0; if (!inRect(BROAD_ENVELOPE, x, y)) { outside++; if (firstOutside.length < 5) firstOutside.push([x, y]); } }
  if (!done("AUTO-4", "not empty: at least one pixel with alpha > 0", anyAlpha > 0, `${anyAlpha} px with alpha > 0`)) return { verdict: "REJECT", firstFailure: "AUTO-4", auto, diag };
  if (!done("AUTO-5", "alpha = 0 everywhere outside the broad envelope [384,230,632,412] (inclusive)", outside === 0, outside ? `${outside} px outside, first ${JSON.stringify(firstOutside)}` : "0 px outside")) return { verdict: "REJECT", firstFailure: "AUTO-5", auto, diag };

  // diagnostics — never reject
  const rgbAt = (p) => [rgba[p * 4], rgba[p * 4 + 1], rgba[p * 4 + 2]], skinLab = toLab(U1_SKIN), labCache = new Map();
  const labOf = (p) => { const k = (rgba[p * 4] << 16) | (rgba[p * 4 + 1] << 8) | rgba[p * 4 + 2]; let v = labCache.get(k); if (!v) { v = toLab(rgbAt(p)); labCache.set(k, v); } return v; };
  const skinLike = (p) => deltaE00(labOf(p), skinLab) <= DIAG_PROPOSALS.skinDeltaE;
  const soft = [], opaque = []; for (let p = 0; p < N; p++) { const a = rgba[p * 4 + 3]; if (!a) continue; (a < 255 ? soft : opaque).push(p); }
  const flag = (id, name, value, flagged, falsePositives, falseNegatives) => diag.push({ id, name, value, flagged, falsePositives, falseNegatives });
  const sSkin = soft.filter(skinLike).length;
  flag("DIAG-1", "skin-coloured matte in soft pixels", { softPx: soft.length, skinLikeSoftPx: sSkin }, soft.length > 0 && sSkin / soft.length > 0.25, "skin-near feature colours (nose shading, warm mouth lines)", "a matte of another colour or on another tone");
  const low = soft.filter((p) => rgba[p * 4 + 3] <= DIAG_PROPOSALS.premultLowAlpha), inv = low.filter((p) => Math.max(...rgbAt(p)) <= rgba[p * 4 + 3] + 2).length;
  flag("DIAG-2", "premultiplied-RGB pattern (max RGB <= alpha in low-alpha soft pixels)", { lowAlphaSoftPx: low.length, satisfyingInvariant: inv }, low.length > 0 && inv / low.length > 0.9, "dark features (brows) satisfy the invariant without premultiplication", "partial premultiplication");
  const isOpq = new Uint8Array(N); for (const p of opaque) isOpq[p] = 1; let edgeSoft = 0, lighter = 0;
  for (const p of soft) { const x = p % w, y = (p / w) | 0, ls = []; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const q = (y + dy) * w + x + dx; if (q >= 0 && q < N && isOpq[q]) ls.push(labOf(q)[0]); }
    if (ls.length >= 3) { edgeSoft++; ls.sort((a, b) => a - b); if (labOf(p)[0] > ls[ls.length >> 1] + DIAG_PROPOSALS.haloLighterL) lighter++; } }
  flag("DIAG-3", "possible halo: edge soft pixels lighter than their opaque neighbourhood", { edgeSoftPx: edgeSoft, lighterPx: lighter }, lighter > 0.05 * Math.max(1, edgeSoft), "intended highlights", "a matte as light as the feature");
  let eyePx = 0, foldPx = 0; for (let p = 0; p < N; p++) { if (!rgba[p * 4 + 3]) continue; const x = p % w, y = (p / w) | 0; if (inEye(x, y)) eyePx++; if (inFold(x, y)) foldPx++; }
  flag("DIAG-4", "alpha in eye zones or static-fold zones (eyes-fixed) — HIGH PRIORITY for the visual review", { eyeZonePx: eyePx, foldZonePx: foldPx }, eyePx + foldPx > 0, "brow tips or lid-adjacent shading close to a zone (zones are ±2 px readings)", "eye parts just outside a zone");
  if (nsRgba) { const { browArea } = targetAreas(nsRgba); let off = 0; for (let p = 0; p < N; p++) { if (!rgba[p * 4 + 3]) continue; const x = p % w, y = (p / w) | 0; if (!browArea.has(p) && !inRect(NOSE_TARGET, x, y) && !inRect(MOUTH_TARGET, x, y)) off++; }
    flag("DIAG-5", "alpha outside the target areas (brows +3, nose, mouth) but inside the broad envelope", { px: off }, off > 0, "antialiasing or local shading wider than the target, or legitimate stylistic deviation", "a wrong feature drawn inside a target area"); }
  else diag.push({ id: "DIAG-5", name: "target areas", value: "SKIPPED — no Northstar RGBA supplied", flagged: null });
  let grey = 0; for (const p of opaque) { const [r, g, b] = rgbAt(p); if (Math.abs(r - g) <= 4 && Math.abs(g - b) <= 4 && r >= 180 && r <= 250) grey++; }
  flag("DIAG-6", "painted checkerboard / light-grey background", { opaquePx: opaque.length, neutralLightGreyPx: grey }, opaque.length > 0 && grey / opaque.length > 0.02, "grey or white features", "coloured painted backgrounds");
  const oSkin = opaque.filter(skinLike).length;
  flag("DIAG-7", "opaque skin-coloured pixels (skin surface / patch)", { opaquePx: opaque.length, skinLikeOpaquePx: oSkin }, oSkin > 0.1 * Math.max(1, opaque.length), "skin-near features", "a skin surface on a tone far from U1");
  let marker = 0; for (let p = 0; p < N; p++) { if (!rgba[p * 4 + 3]) continue; const c = rgbAt(p); for (const m of Object.values(MARKER_COLOURS)) if (c.every((v, k) => Math.abs(v - m[k]) <= DIAG_PROPOSALS.markerTolerance)) { marker++; break; } }
  flag("DIAG-8", "guide marker colours (cyan / magenta) in the output", { px: marker }, marker > 0, "none expected in a face layer", "markers reproduced in another colour");
  flag("DIAG-9", "few solid pixels (proposal: < 400 at alpha >= 128)", { solidPx: solid }, solid < DIAG_PROPOSALS.minSolidPx, "a legitimately sparse layer", "a large but wrong layer");
  return { verdict: "PASS_TO_VISUAL_REVIEW", firstFailure: null, auto, diag };
}
