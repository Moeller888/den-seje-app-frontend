// build-r3-head-colour-fixtures — PREPARATION for a possible later colour call on the D-148 head.
//
// Builds, deterministically and from tracked inputs only (no H1, no network, no model):
//   U1  the technical-underlay underpainting: the D-148 head geometry (G1V3 + E2, rows <= 424) filled
//       with ONE Northstar-matched skin colour. Bald, blank face, both ears.
//   U2  the same colour with a very faint, symmetric, distance-to-edge volume shade (<= 6 % darker,
//       fading over 14 px). No interior marks of any kind: everything further than 15 px from the
//       silhouette edge is exactly the U1 colour.
//   API mask  derived from the merged P2 fixtures, in the Images-edit semantics the repository already
//       documents (build-r3-api-mask.mjs): alpha 0 = EDITABLE, alpha 255 = PROTECTED, RGB 0,0,0.
//       EDITABLE = dilate8²(GEOM) ∩ CORE₂, CORE₂ = EDIT₂ \ TRANSITION. TRANSITION and PROTECT₂ are
//       protected; the two-pixel margin lets the model's own edge antialiasing fall OUTSIDE the
//       geometry, so the geometry itself can be fully covered.
//
// R3 LAYER CONTRACT (D-132/D-135, unchanged): the base slot is the technical underlay — BALD, BLANK
// FACE. Face, eyes, iris, blush, expressions and hair are separate layers and are NOT read, built or
// touched here.
//
// Usage:
//   node tools/avatar/build-r3-head-colour-fixtures.mjs           write the fixtures
//   node tools/avatar/build-r3-head-colour-fixtures.mjs --check   verify, write nothing
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { decodePng, encodePngRGBA } from "./build-r2-torso-occlusion-mask.mjs";
import { OUT_W, OUT_H, pngToMask, MARKER as MARKER_V1, countOf, bboxOf, componentCount, readIfExists, exitCodeFor } from "./build-r3-head-edit-masks.mjs";
import { FIXTURE_DIR as GEO_DIR, FILES as GEO_FILES, MARKER as GEO_MARKER, HEAD_MAX_Y } from "./build-r3-head-geometry.mjs";

export const TOOL = "build-r3-head-colour-fixtures";
export const TOOL_VERSION = "1.0.0";
export const STATUS = "PREPARED — NOT AUTHORISED";
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const N = OUT_W * OUT_H;
export const sha256 = (b) => createHash("sha256").update(b).digest("hex");

export const FIXTURE_DIR = join("tools", "avatar", "fixtures", "r3-head-colour");
export const FILES = Object.freeze({
  u1: "r3-head-underpainting-u1-v1.png",
  u2: "r3-head-underpainting-u2-v1.png",
  mask: "r3-head-colour-api-mask-v2.png",
  margin: "r3-head-colour-api-context-margin-v1.png",
  prompt: "r3-head-colour-prompt-v1.md",
  spec: "r3-head-colour-preparation-spec-v1.json",
});
/** The merged D-148 inputs, pinned. */
export const D148 = Object.freeze({
  geometry: { path: [GEO_DIR, GEO_FILES.geometry].join("/").split("\\").join("/"), sha256: "a7ba877560d5e9ff179b532c241aae383c12281b3a1f09eb74f77ad4704fbe43" },
  contour:  { path: [GEO_DIR, GEO_FILES.contour].join("/").split("\\").join("/"),  sha256: "8e8efe590cf2ffd5fc30a7bf52a56c5cffb62d117b274fa6abbd6d3cc5d7766b" },
  edit:     { path: [GEO_DIR, GEO_FILES.edit].join("/").split("\\").join("/"),     sha256: "7c52a7cf0e80cc9362b64e5078346b6f0a470e9fc9aa629ad5e48f0588f4b651" },
  protect:  { path: [GEO_DIR, GEO_FILES.protect].join("/").split("\\").join("/"),  sha256: "f3a5d89bc3648ae91a98319c75ddaddb576758c6d512dd4205104e598a906292" },
  g1v3:     { path: [GEO_DIR, GEO_FILES.g1v3].join("/").split("\\").join("/"),     sha256: "b57c2f5db8aaf9a3d02b990fdcafe0213dedfbb038b3cb012f594c817d516c76" },
  spec:     { path: [GEO_DIR, GEO_FILES.spec].join("/").split("\\").join("/"),     sha256: "f4d71ca3a11b4f93ba6a51ffdc36ad293aea3777542becf10e04ea61d484b3b7" },
  transition: { path: "tools/avatar/fixtures/r3-head-edit/r3-head-transition-v1.png", sha256: "8f7a6f4c703adc52adbf12d7ee9357d6c0fd85721f8e46ae92f5f508a7ddb9f3" },
});
export const NORTHSTAR = Object.freeze({ path: "assets/avatar/reference/Northstar Master v2.png", sha256: "3daf32e76bff9a53ec7d25cf148a230073cfd0da6a003d02a23c4292d139ff50" });

/** Skin sampling: the recorded rule of the G1V3 contour review, re-derived here from Northstar. */
export const SKIN_RULE = Object.freeze({
  classifier: "CIELAB (D65, 8-bit sRGB): skin ⇔ 30° ≤ h ≤ 90° ∧ L* ≥ 72",
  patches: Object.freeze([[425, 372, 445, 382], [579, 372, 599, 382]]),   // [x0, y0, x1, y1], inclusive — left and right cheek
  statistic: "per-channel median of the skin-class pixels in both patches",
  expected: Object.freeze([254, 197, 128]),
});
export const U2_SHADE = Object.freeze({ maxDarken: 0.06, fadePx: 14, window: 16,
  rule: "factor = 1 − 0.06 · max(0, 1 − (d − 1) / 14), d = Euclidean distance to the nearest pixel outside the head geometry, rows > 424 counted as inside so the neck continues unshaded (window 16); rgb = round(skin · factor)" });
export const MASK_RULE = Object.freeze({ dilation: 2, semantics: "alpha 0 = EDITABLE, alpha 255 = PROTECTED, RGB 0,0,0 everywhere (Images edit endpoint; same as build-r3-api-mask.mjs)",
  apiEdit: "API_EDIT = FINAL_MODEL_RGB_REGION ∪ API_CONTEXT_MARGIN",
  finalModelRgbRegion: "FINAL_MODEL_RGB_REGION = GEOM (the D-148 head, rows ≤ 424) — the only pixels whose final RGB comes from the model",
  apiContextMargin: "API_CONTEXT_MARGIN = { y ≤ 424 : p ∉ GEOM ∧ Chebyshev distance to GEOM ≤ 2 } — request-time working room only, discarded entirely by the post-processing",
  p2Edit2: "P2 EDIT₂ (D-148) is NOT changed and is NOT the API mask",
  previous: "v1 of this mask (sha 246546f2…) was dilate8²(GEOM) ∩ (EDIT₂ \\ TRANSITION); it left 139 of 734 head-edge px without a 2-px margin",
  editable: "dilate8^2(GEOM) ∩ CORE₂ where CORE₂ = EDIT₂ \\ TRANSITION" });

// ── colour science: sRGB → linear → XYZ (D65) → CIELAB; CIEDE2000 (Sharma, Wu & Dalal 2005) ──
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

// ── tone continuity (head row 424 ↔ preserved H1 neck row 425) ──────────────────────────────────
// S2 — a mild deterministic interior transition: ONLY head pixels in rows 417–424 are blended toward the
//      measured H1 neck skin, integer round-half-up, out = floor((w·neck + (9 − w)·rgb + 4) / 9), w = y − 416.
//      Applied to the model RGB BEFORE K4. TRANSITION, alpha, geometry, ears, the upper face and every separate
//      layer are untouched. D-133's ramp (rows 425–445, TRANSITION, generated → H1, denominator 20) has another
//      purpose and another region (TRANSITION stays H1 here) and is therefore NOT reused; only its integer
//      round-half-up form is shared.
// S1 — a palette gate with a different purpose: the median of the model's head skin (rows 300–416, K4
//      excluded) must lie within ΔE00 4.50 of the Northstar skin median. 4.50 = the 95th percentile of ΔE00
//      between every Northstar skin-class pixel of the head (x 380–644, y 300–420) and their median — the
//      reference's own natural skin spread. It keeps the whole head on the palette of H1's body; it does not
//      measure the seam.
export const SEAM = Object.freeze({
  S2: Object.freeze({ top: 417, bottom: 424, denominator: 9, neckTargetExpected: Object.freeze([253, 197, 128]),
    neckTargetRule: "per-channel median of H1 skin-class pixels (CIELAB h 30–90°, L* ≥ 72) inside TRANSITION, rows 425–433",
    formula: "out = floor((w·neck + (9 − w)·rgb + 4) / 9), w = y − 416, head pixels of rows 417–424 only, before K4" }),
  S1: Object.freeze({ thresholdDE00: 4.5, nsBox: Object.freeze([380, 300, 644, 420]), headRows: Object.freeze([300, 416]),
    derivation: "p95 of CIEDE2000(Northstar skin-class pixel, Northstar skin median) over x 380–644, y 300–420", expectedNsMedianRGB: Object.freeze([254, 197, 128]) }),
});
const medianRGB = (lists) => lists.map((a) => { const s = [...a].sort((p, q) => p - q); return s[s.length >> 1]; });
export function northstarSkinStats(nsRgba) {
  const [x0, y0, x1, y1] = SEAM.S1.nsBox, ch = [[], [], []], px = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = (y * OUT_W + x) * 4, rgb = [nsRgba[i], nsRgba[i + 1], nsRgba[i + 2]]; if (nsRgba[i + 3] >= 128 && isSkin(rgb)) { px.push(rgb); for (let k = 0; k < 3; k++) ch[k].push(rgb[k]); } }
  if (!px.length) return { medianRGB: null, n: 0, p95DE00: null };              // explicit: no Northstar skin found
  const med = medianRGB(ch), mLab = toLab(med), d = px.map((c) => deltaE00(toLab(c), mLab)).sort((a, b) => a - b);
  return { medianRGB: med, n: px.length, p95DE00: +d[Math.floor(0.95 * d.length)].toFixed(2) };
}
export function neckTarget(h1Rgba, transition) {
  const ch = [[], [], []];
  for (let y = 425; y <= 433; y++) for (let x = 0; x < OUT_W; x++) { const p = y * OUT_W + x; if (!transition[p]) continue; const rgb = [h1Rgba[p * 4], h1Rgba[p * 4 + 1], h1Rgba[p * 4 + 2]]; if (isSkin(rgb)) for (let k = 0; k < 3; k++) ch[k].push(rgb[k]); }
  return medianRGB(ch);
}

// ── geometric regions of the head (used for coverage; NOT facial-feature regions) ───────────────
//   ear-left  = GEOM ∧ x < 366          ear-right  = GEOM ∧ x > 657           (366 = narrowest cranium edge)
//   crown     = GEOM ∧ y ≤ 259 (not ear)
//   side-left = GEOM ∧ 260 ≤ y ≤ 380 ∧ 366 ≤ x ≤ 446     side-right = mirror (577 ≤ x ≤ 657)
//   face-plane= GEOM ∧ 260 ≤ y ≤ 380 ∧ 447 ≤ x ≤ 576     lower-head = GEOM ∧ 381 ≤ y ≤ 424 (cheek/chin area, geometric)
export const REGIONS = Object.freeze(["crown", "side-left", "side-right", "ear-left", "ear-right", "face-plane", "lower-head"]);
export function regionOf(x, y) {
  if (x < 366) return "ear-left";
  if (x > 657) return "ear-right";
  if (y <= 259) return "crown";
  if (y >= 381) return "lower-head";
  if (x <= 446) return "side-left";
  if (x >= 577) return "side-right";
  return "face-plane";
}

// ── loading ──────────────────────────────────────────────────────────────────
function pinned(rel, want, repoRoot) {
  const p = join(repoRoot, rel);
  if (!existsSync(p)) throw new Error(`${rel} not found`);
  const b = readFileSync(p), h = sha256(b);
  if (h !== want) throw new Error(`${rel} sha256 ${h} != pinned ${want}`);
  return b;
}
export function loadInputs(repoRoot = REPO) {
  const geom = pngToMask(pinned(D148.geometry.path, D148.geometry.sha256, repoRoot), "geometry", GEO_MARKER.geometry);
  const edit = pngToMask(pinned(D148.edit.path, D148.edit.sha256, repoRoot), "edit₂", GEO_MARKER.edit);
  const protect = pngToMask(pinned(D148.protect.path, D148.protect.sha256, repoRoot), "protect₂", GEO_MARKER.protect);
  const transition = pngToMask(pinned(D148.transition.path, D148.transition.sha256, repoRoot), "transition", MARKER_V1.transition);
  const ns = decodePng(pinned(NORTHSTAR.path, NORTHSTAR.sha256, repoRoot), "Northstar");
  if (ns.w !== OUT_W || ns.h !== OUT_H) throw new Error("Northstar is not 1024x1536");
  for (const k of ["contour", "g1v3", "spec"]) pinned(D148[k].path, D148[k].sha256, repoRoot);   // identity only
  return { geom, edit, protect, transition, ns: ns.rgba };
}

// ── skin ─────────────────────────────────────────────────────────────────────
export function lab([r, g, b]) {
  const f = (c) => { c /= 255; return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92; };
  const R = f(r), G = f(g), B = f(b);
  let X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047, Y = 0.2126 * R + 0.7152 * G + 0.0722 * B, Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const t = (v) => (v > 216 / 24389 ? Math.cbrt(v) : (24389 / 27 * v + 16) / 116); X = t(X); Y = t(Y); Z = t(Z);
  const L = 116 * Y - 16, a = 500 * (X - Y), bb = 200 * (Y - Z);
  return { L, C: Math.hypot(a, bb), h: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360 };
}
const isSkin = (rgb) => { const c = lab(rgb); return c.h >= 30 && c.h <= 90 && c.L >= 72; };
const median = (a) => { const s = [...a].sort((p, q) => p - q), m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
export function sampleSkin(nsRgba, patches = SKIN_RULE.patches) {
  const ch = [[], [], []]; let n = 0;
  for (const [x0, y0, x1, y1] of patches) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = (y * OUT_W + x) * 4, rgb = [nsRgba[i], nsRgba[i + 1], nsRgba[i + 2]];
    if (nsRgba[i + 3] >= 128 && isSkin(rgb)) { for (let k = 0; k < 3; k++) ch[k].push(rgb[k]); n++; }
  }
  return { rgb: ch.map(median), n };
}

// ── builders ─────────────────────────────────────────────────────────────────
function inHead(geom, p) { return geom[p] === 1 && ((p / OUT_W) | 0) <= HEAD_MAX_Y; }
export function buildU1(geom, skin) {
  const rgba = Buffer.alloc(N * 4);
  for (let p = 0; p < N; p++) if (inHead(geom, p)) { rgba[p * 4] = skin[0]; rgba[p * 4 + 1] = skin[1]; rgba[p * 4 + 2] = skin[2]; rgba[p * 4 + 3] = 255; }
  return rgba;
}
export function edgeDistance(geom, transition, p, win = U2_SHADE.window) {
  const x = p % OUT_W, y = (p / OUT_W) | 0; let d = Infinity;
  for (let dy = -win; dy <= win; dy++) for (let dx = -win; dx <= win; dx++) {
    const xx = x + dx, yy = y + dy;
    // rows below the head count as inside: the neck continues there, and H1's (asymmetric) neck
    // must not make the shade asymmetric
    const inside = xx >= 0 && xx < OUT_W && yy >= 0 && yy < OUT_H && (yy > HEAD_MAX_Y || geom[yy * OUT_W + xx] === 1);
    if (!inside) d = Math.min(d, Math.hypot(dx, dy));
  }
  return d;
}
export function buildU2(geom, transition, skin) {
  const rgba = buildU1(geom, skin);
  for (let p = 0; p < N; p++) {
    if (!inHead(geom, p)) continue;
    const d = edgeDistance(geom, transition, p);
    if (!isFinite(d)) continue;
    const f = 1 - U2_SHADE.maxDarken * Math.max(0, 1 - (d - 1) / U2_SHADE.fadePx);
    for (let k = 0; k < 3; k++) rgba[p * 4 + k] = Math.round(skin[k] * f);
  }
  return rgba;
}
function dilate8(set) {
  const out = new Uint8Array(N);
  for (let p = 0; p < N; p++) { if (!set[p]) continue; const x = p % OUT_W, y = (p / OUT_W) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && xx < OUT_W && yy >= 0 && yy < OUT_H) out[yy * OUT_W + xx] = 1; } }
  return out;
}
/** FINAL_MODEL_RGB_REGION — the only pixels whose final RGB comes from the model: the D-148 head (rows ≤ 424). */
export function finalModelRgbRegion(geom) {
  const s = new Uint8Array(N); for (let p = 0; p < N; p++) s[p] = inHead(geom, p) ? 1 : 0; return s;
}
/**
 * API_CONTEXT_MARGIN — request-time working room ONLY: every pixel within Chebyshev distance 2 of the head,
 * outside it, in rows ≤ 424. Rows ≥ 425 (TRANSITION, the neck rim, shoulders, clothing) are never in it, and
 * every pixel of it is discarded by the post-processing (final alpha = E2, final RGB only inside the head).
 * P2 already moved every visible H1 pixel of rows ≤ 424 into EDIT₂, so the margin can only meet empty
 * background or the removed old head — never body, clothing or neck. No P2 fixture is changed by it.
 */
export function apiContextMargin(geom, dilation = MASK_RULE.dilation) {
  let d = finalModelRgbRegion(geom);
  for (let k = 0; k < dilation; k++) d = dilate8(d);
  const m = new Uint8Array(N); for (let p = 0; p < N; p++) m[p] = d[p] && !inHead(geom, p) && ((p / OUT_W) | 0) <= HEAD_MAX_Y ? 1 : 0;
  return m;
}
/** API_EDIT = FINAL_MODEL_RGB_REGION ∪ API_CONTEXT_MARGIN (what the API mask marks editable). */
export function buildEditable({ geom }) {
  const head = finalModelRgbRegion(geom), m = apiContextMargin(geom), ed = new Uint8Array(N);
  for (let p = 0; p < N; p++) ed[p] = head[p] || m[p] ? 1 : 0;
  return ed;
}
/** The documented exceptions: four jaw-corner edge pixels (mirror pairs) whose 2nd outward neighbour lies in
 *  row 425 — a row API_CONTEXT_MARGIN never enters (TRANSITION, H1 neck rim, neck/clothing side). They keep a 1-px margin. */
export const MARGIN_EXCEPTIONS = Object.freeze([[453, 423], [454, 423], [569, 423], [570, 423]].map((xy) => Object.freeze(xy)));
/** For every outer head-edge pixel: is each outward 4-neighbour at distance 1 and 2 editable? */
export function edgeMarginStudy(editable, geom) {
  const head = (x, y) => x >= 0 && x < OUT_W && y >= 0 && y <= HEAD_MAX_Y && geom[y * OUT_W + x] === 1;
  const lacking = []; let edges = 0;
  for (let y = 0; y <= HEAD_MAX_Y; y++) for (let x = 0; x < OUT_W; x++) {
    if (!head(x, y)) continue;
    const out = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => !head(x + dx, y + dy) && y + dy <= HEAD_MAX_Y);
    if (!out.length) continue; edges++;
    let m = 2; for (const [dx, dy] of out) for (const k of [2, 1]) { const xx = x + k * dx, yy = y + k * dy; if (!editable[yy * OUT_W + xx]) m = Math.min(m, k - 1); }
    if (m < 2) lacking.push({ x, y, margin: m, region: regionOf(x, y) });
  }
  return { edges, lacking };
}
export function editableToApiMask(editable) {
  const rgba = Buffer.alloc(N * 4);
  for (let p = 0; p < N; p++) rgba[p * 4 + 3] = editable[p] ? 0 : 255;
  return encodePngRGBA(OUT_W, OUT_H, rgba);
}
/** Reads an API mask back: alpha must be strictly 0/255 and RGB strictly 0. Returns the editable set. */
export function apiMaskToEditable(buf) {
  const img = decodePng(buf, "api mask");
  if (img.w !== OUT_W || img.h !== OUT_H) throw new Error(`api mask: expected ${OUT_W}x${OUT_H}, got ${img.w}x${img.h}`);
  const ed = new Uint8Array(N);
  for (let p = 0; p < N; p++) { const i = p * 4, a = img.rgba[i + 3];
    if (a !== 0 && a !== 255) throw new Error("api mask: alpha is not binary");
    if (img.rgba[i] || img.rgba[i + 1] || img.rgba[i + 2]) throw new Error("api mask: RGB carries data");
    ed[p] = a === 0 ? 1 : 0; }
  return ed;
}

/**
 * Validates API_EDIT: it is exactly FINAL_MODEL_RGB_REGION ∪ API_CONTEXT_MARGIN; nothing of TRANSITION or of
 * rows ≥ 425 (neck, shoulders, clothing) is editable; every head region (both ears in particular) is fully
 * editable; and every outer head-edge pixel has the full 2-px request-time margin except the documented
 * MARGIN_EXCEPTIONS. Returns { ok, problems, perRegion, stats }.
 */
export function validateEditable(editable, { geom, transition }) {
  const problems = [], perRegion = Object.fromEntries(REGIONS.map((r) => [r, { geom: 0, editable: 0 }]));
  const head = finalModelRgbRegion(geom), margin = apiContextMargin(geom);
  let inTransition = 0, belowHead = 0, geomNotEditable = 0, notInRule = 0, marginMissing = 0, marginPx = 0;
  for (let p = 0; p < N; p++) {
    const y = (p / OUT_W) | 0, x = p % OUT_W;
    if (editable[p]) { if (transition[p]) inTransition++; if (y > HEAD_MAX_Y) belowHead++; if (!head[p] && !margin[p]) notInRule++; if (margin[p]) marginPx++; }
    else if (margin[p]) marginMissing++;
    if (head[p]) { const r = perRegion[regionOf(x, y)]; r.geom++; if (editable[p]) r.editable++; else geomNotEditable++; }
  }
  if (inTransition) problems.push(`${inTransition} editable px inside TRANSITION`);
  if (belowHead) problems.push(`${belowHead} editable px below row ${HEAD_MAX_Y} (neck, shoulders or clothing)`);
  if (notInRule) problems.push(`${notInRule} editable px outside FINAL_MODEL_RGB_REGION ∪ API_CONTEXT_MARGIN`);
  if (geomNotEditable) problems.push(`${geomNotEditable} head-geometry px are not editable`);
  if (marginMissing) problems.push(`API_CONTEXT_MARGIN too narrow: ${marginMissing} margin px are not editable`);
  for (const [r, s] of Object.entries(perRegion)) if (s.geom === 0 || s.editable !== s.geom) problems.push(`region ${r}: ${s.editable}/${s.geom} editable`);
  const study = edgeMarginStudy(editable, geom);
  const exc = new Set(MARGIN_EXCEPTIONS.map(([x, y]) => `${x},${y}`));
  const unexpected = study.lacking.filter((l) => !exc.has(`${l.x},${l.y}`) || l.margin < 1);
  if (unexpected.length) problems.push(`${unexpected.length} head-edge px lack the 2-px request-time margin: ${JSON.stringify(unexpected.slice(0, 6))}`);
  return { ok: problems.length === 0, problems, perRegion, edgeMargin: { edgePx: study.edges, lacking: study.lacking },
    stats: { editablePx: countOf(editable), bbox: bboxOf(editable), marginPx, headPx: countOf(head) } };
}

/** Underpainting check: covers the whole head geometry opaquely, nothing outside, and no interior marks. */
export function validateUnderpainting(rgba, geom, transition, skin) {
  const problems = []; let holes = 0, outside = 0, interiorMarks = 0, asym = 0;
  for (let p = 0; p < N; p++) {
    const a = rgba[p * 4 + 3], head = inHead(geom, p);
    if (head && a !== 255) holes++;
    if (!head && a !== 0) outside++;
    if (head) {
      const q = ((p / OUT_W) | 0) * OUT_W + (OUT_W - 1 - (p % OUT_W));
      for (let k = 0; k < 4; k++) if (rgba[p * 4 + k] !== rgba[q * 4 + k]) { asym++; break; }
      if (edgeDistance(geom, transition, p, 15) > 15 + 1e-9) for (let k = 0; k < 3; k++) if (rgba[p * 4 + k] !== skin[k]) { interiorMarks++; break; }
    }
  }
  if (holes) problems.push(`${holes} transparent/semi-transparent holes inside the head geometry`);
  if (outside) problems.push(`${outside} px painted outside the head geometry`);
  if (interiorMarks) problems.push(`${interiorMarks} interior px differ from the flat skin colour (drawn marks)`);
  if (asym) problems.push(`${asym} asymmetric px`);
  return { ok: problems.length === 0, problems };
}

export function buildAll(repoRoot = REPO) {
  const inp = loadInputs(repoRoot);
  const s = sampleSkin(inp.ns);
  if (JSON.stringify(s.rgb) !== JSON.stringify([...SKIN_RULE.expected])) throw new Error(`Northstar skin sample ${JSON.stringify(s.rgb)} != recorded ${JSON.stringify(SKIN_RULE.expected)}`);
  const u1 = buildU1(inp.geom, s.rgb), u2 = buildU2(inp.geom, inp.transition, s.rgb);
  for (const [k, img] of [["U1", u1], ["U2", u2]]) { const v = validateUnderpainting(img, inp.geom, inp.transition, s.rgb); if (!v.ok) throw new Error(`${k}: ${v.problems.join("; ")}`); }
  const editable = buildEditable(inp);
  const ve = validateEditable(editable, inp);
  if (!ve.ok) throw new Error("API mask: " + ve.problems.join("; "));
  const ns = northstarSkinStats(inp.ns);
  if (ns.p95DE00 !== SEAM.S1.thresholdDE00 || JSON.stringify(ns.medianRGB) !== JSON.stringify([...SEAM.S1.expectedNsMedianRGB])) throw new Error(`Northstar skin statistics drifted: ${JSON.stringify(ns)}`);
  const margin = apiContextMargin(inp.geom), mrgba = Buffer.alloc(N * 4);
  for (let p = 0; p < N; p++) if (margin[p]) mrgba.set([0, 210, 220, 255], p * 4);
  const png = { u1: encodePngRGBA(OUT_W, OUT_H, u1), u2: encodePngRGBA(OUT_W, OUT_H, u2), mask: editableToApiMask(editable), margin: encodePngRGBA(OUT_W, OUT_H, mrgba) };
  return { inp, skin: s, u1, u2, editable, ve, png, ns, margin };
}

export function buildSpec({ skin, ve, png, promptBytes, ns, margin }) {
  const f = (k) => ({ file: FILES[k], sha256: sha256(png[k]), bytes: png[k].length });
  return {
    tool: TOOL, toolVersion: TOOL_VERSION, status: STATUS,
    purpose: "Preparation for ONE possible later colour call that produces only the hidden technical skin underlay of the D-148 R3 head. Nothing here authorises a call.",
    layerContract: {
      source: "tools/avatar/fixtures/r3/r3-shadow-contract-v1.json — layerContract.slots[base] and zModel (D-132/D-135), unchanged",
      underlay: "BALD, BLANK FACE — the hidden technical skin underlay; featureless",
      modelMayProduce: ["warm tan skin matched to Northstar", "very discreet natural skin variation", "soft, style-consistent volume shading", "restrained inner-ear shading", "an even, fully covering head surface"],
      modelMayNotProduce: ["eyes", "irises", "eye whites", "eyelashes", "eyebrows", "nose", "nostrils", "mouth", "lips", "teeth", "smile", "blush", "freckles", "hair", "hairline", "beard", "expression", "clothing", "neck/shoulder/body changes", "background", "text", "objects"],
      separateLayersUntouched: ["face", "eyes", "iris", "blush", "expressions", "hair"],
    },
    pipelineResponsibility: {
      model: "RGB of the head surface only, inside the API mask's editable area",
      deterministic: ["E2 silhouette (D-148)", "final alpha", "K4 outer contour applied AFTER the model", "P2 EDIT₂/PROTECT₂ split", "TRANSITION and PROTECT₂ byte-identical to H1", "canvas size and placement", "rejection on missing coverage, uncovered transition, residue/ghost pixels or any failed gate"],
    },
    inputs: { d148: D148, northstar: NORTHSTAR },
    skin: { rule: SKIN_RULE, sampledPixels: skin.n, rgb: skin.rgb },
    underpainting: { u1: { ...f("u1"), rule: "D-148 head geometry (rows ≤ 424) filled with the sampled skin colour, alpha 255; everything else alpha 0" },
                     u2: { ...f("u2"), rule: U2_SHADE.rule } },
    apiMask: { ...f("mask"), name: "API_EDIT", rule: MASK_RULE, editablePx: ve.stats.editablePx, bbox: ve.stats.bbox, perRegion: ve.perRegion,
      edgeMargin: { headEdgePx: ve.edgeMargin.edgePx, withFull2pxMargin: ve.edgeMargin.edgePx - ve.edgeMargin.lacking.length, exceptions: ve.edgeMargin.lacking,
        exceptionReason: "four jaw-corner px (two mirror pairs): the 2nd outward neighbour is in row 425, which API_CONTEXT_MARGIN never enters; each keeps a 1-px margin" } },
    apiContextMargin: { ...f("margin"), name: "API_CONTEXT_MARGIN", px: countOf(margin), bbox: bboxOf(margin), markerRGB: [0, 210, 220], rule: MASK_RULE.apiContextMargin,
      fate: "request-time working room only — the post-processing never copies one of these pixels into the candidate" },
    finalModelRgbRegion: { name: "FINAL_MODEL_RGB_REGION", px: ve.stats.headPx, rule: MASK_RULE.finalModelRgbRegion, sameAs: D148.geometry },
    toneContinuity: { S2: SEAM.S2, S1: { ...SEAM.S1, measuredNorthstar: ns }, recommendation: "S2 (local chin/neck continuity) + S1 (whole-head palette) — distinct purposes" },
    regions: { names: REGIONS, rule: "ear-left x<366 · ear-right x>657 · crown y≤259 · lower-head y≥381 · side-left 366≤x≤446 · side-right 577≤x≤657 · face-plane otherwise — geometric coverage regions, not facial features" },
    prompt: { file: FILES.prompt, sha256: promptBytes ? sha256(promptBytes) : null, bytes: promptBytes ? promptBytes.length : null },
    callId: "UNASSIGNED", claimIdentity: "NONE", decision: "NONE — a later owner decision must assign a call-id, a claim identity and a mechanical approval value",
    prohibitions: { noImageRequest: "No image or API call is authorised. The preparation adapter has no send path.", noClaim: "No claim exists or may be created by these tools.", noRuntime: "Nothing is wired into runtime; R3 stays default OFF; no R2 asset is touched." },
  };
}

export const fixturePath = (k, repoRoot = REPO) => join(repoRoot, FIXTURE_DIR, FILES[k]);
export function run({ check, repoRoot = REPO, log = console.log } = {}) {
  const b = buildAll(repoRoot);
  const promptBytes = readIfExists(fixturePath("prompt", repoRoot));
  if (!promptBytes) throw new Error(`${FILES.prompt} is missing — it is a hand-written, reviewed fixture, not generated`);
  const specText = JSON.stringify(buildSpec({ ...b, promptBytes }), null, 2) + "\n";
  const keys = ["u1", "u2", "mask", "margin"];
  if (check) {
    const results = keys.map((k) => { const cur = readIfExists(fixturePath(k, repoRoot)); return { file: FILES[k], status: cur === null ? "missing" : Buffer.from(cur).equals(b.png[k]) ? "same" : "differs" }; });
    const cs = readIfExists(fixturePath("spec", repoRoot));
    results.push({ file: FILES.spec, status: cs === null ? "missing" : cs.toString("utf8") === specText ? "same" : "differs" });
    const ok = results.every((r) => r.status === "same");
    for (const r of results) log(`  ${r.status === "same" ? "✓" : "✖"} ${r.file} ${r.status}`);
    log(ok ? "check: PASS — nothing written" : "check: FAIL — nothing written");
    return { ok, results, ...b };
  }
  mkdirSync(join(repoRoot, FIXTURE_DIR), { recursive: true });
  for (const k of keys) writeFileSync(fixturePath(k, repoRoot), b.png[k]);
  writeFileSync(fixturePath("spec", repoRoot), specText);
  for (const k of keys) log(`  wrote ${FILES[k]}  sha256 ${sha256(b.png[k])}`);
  log(`  wrote ${FILES.spec}`);
  return { ok: true, ...b };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { process.exitCode = exitCodeFor(run({ check: process.argv.includes("--check") })); }
  catch (err) { console.error("✖ " + err.message); process.exitCode = 1; }
}
