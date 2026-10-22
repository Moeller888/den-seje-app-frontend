// R3 NORTHSTAR LAYER SPLIT (D-188). Splits the tracked Northstar Master v2 into separate review layers whose VISIBLE pixels are
// Northstar's own: head/skin with ears and neck, the hair's cast shadow on the skin, the two brows, nose, mouth, iris, the
// fixed eye parts and the hair. Pixels the original does not show are either reconstructed (skin under the features, iris
// under the highlight, lit skin under the hair shadow — each recorded in a mask) or left missing (everything under the hair).
// REVIEW VARIANT ONLY (D-188): a separate R3 review candidate beside D-187, never a production asset, never promotable by
// passing technical checks. No H1, no image call, no runtime change; R3 stays default OFF. The body layer is rebuilt only for
// the documented comparison with the original and is never an R3 asset; the face layer is a helper export, never composed.
//
// Ported unchanged in behaviour from the local prototype tools/avatar/build/northstar-v2-layers/ (nsl-lib.mjs, labels.mjs,
// build-layers.mjs, make-ora.mjs); the move is recorded in fixtures/r3-northstar-layers/manifest-v1.json and the tests prove
// that this module rebuilds the prototype's tracked layers and masks pixel for pixel.
//
// Usage: node tools/avatar/r3-northstar-layers.mjs --out <empty dir>   (layers, masks, helper exports, composite, .ora)
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng, encodePng, pixelSha256 } from "./r3-hair-tool-v2.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
export const TOOL_ID = "r3-northstar-layers";
export const DECISION = "D-188";
export const FIXTURES = "tools/avatar/fixtures/r3-northstar-layers/";
export const SPEC_FILE = FIXTURES + "spec-v1.json";
export const MANIFEST_FILE = FIXTURES + "manifest-v1.json";
export const SOURCE = Object.freeze({ file: "assets/avatar/reference/Northstar Master v2.png", sha256: "3daf32e76bff9a53ec7d25cf148a230073cfd0da6a003d02a23c4292d139ff50" });
/** The R3 head compositing layers, back to front (zModel: skin 0 < hair shadow < face parts 3 < iris, eyes-fixed 4 < hair 40). */
export const COMPOSITE_ORDER = Object.freeze(["skin", "hairShadow", "browL", "browR", "nose", "mouth", "iris", "eyesFixed", "hair"]);
export const FACE_PARTS = Object.freeze(["browL", "browR", "nose", "mouth"]);
/** Exports that are NOT compositing layers. */
export const HELPER_EXPORTS = Object.freeze({ face: "brows + nose + mouth in one file, for viewing and editing; never composed over the four parts" });
export const COMPARISON_ONLY = Object.freeze({ body: "Northstar's body and clothes, copied only so the composite can be compared with the whole original; not an R3 body asset, not tracked" });
export const MASKS = Object.freeze(["owners", "reconstructed", "shadow-lit-reconstructed", "missing-under-hair", "overlap-ink-hair-features", "overlap-ink-hair-skin"]);
export const REVIEW_STATUS = "REVIEW VARIANT (D-188) — Northstar v2 pixels as a direct source for this review variant only; not approved, not promotable";
const W = 1024, H = 1536, N = W * H;
const sha = (b) => createHash("sha256").update(b).digest("hex");
const rel = (p) => readFileSync(join(REPO, ...p.split("/")));
export const loadSpec = () => JSON.parse(rel(SPEC_FILE).toString("utf8"));

/** Reads the source and refuses anything but the tracked Northstar v2 with its pinned sha256. Never H1. */
export function loadSource(buf = rel(SOURCE.file)) {
  if (sha(buf) !== SOURCE.sha256) throw new Error(`the source is not the tracked Northstar Master v2 (${SOURCE.sha256})`);
  return decodePng(buf).px;
}

/** A variant built by this module is a review candidate only: passing every technical check never makes it promotable. */
export function promotionStatus() {
  return { promotable: false, status: REVIEW_STATUS, reason: "D-188 allows Northstar v2 pixels for this separate review variant only; promotion needs a later, explicit owner decision and is never derived from check results" };
}
export function promote() { throw new Error("the Northstar layer variant is a review candidate (D-188) and cannot be promoted by this tool"); }

// ── pixel helpers ───────────────────────────────────────────────────────────────────────────────────────────────
/** Colour classes: T transparent, K ink, W white, G grey, S light skin, O orange skin shade, B brown. */
export function cls(r, g, b, a) {
  if (a < 8) return "T";
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mx < 50) return "K";
  if (mn > 225) return "W";
  if (mx - mn < 40) return "G";
  if (r > 235 && g > 170) return "S";
  if (r > 200 && g > 110) return "O";
  return "B";
}
/** Even-odd polygon fill (pixel centres). */
export function polyMask(pts) {
  const m = new Uint8Array(N);
  let y0 = Infinity, y1 = -Infinity;
  for (const [, y] of pts) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(H - 1, Math.ceil(y1)); y++) {
    const yc = y + 0.5, xs = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
      if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.max(0, Math.ceil(xs[k] - 0.5)); x <= Math.min(W - 1, Math.floor(xs[k + 1] - 0.5)); x++) m[y * W + x] = 1;
  }
  return m;
}
export function ellipseMask({ c: [cx, cy], r: [rx, ry] }) {
  const m = new Uint8Array(N);
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry; if (dx * dx + dy * dy <= 1) m[y * W + x] = 1;
  }
  return m;
}
/** Square (Chebyshev) dilation of a 0/1 mask. */
export function dilate(m, r) {
  const t = new Uint8Array(N), o = new Uint8Array(N);
  for (let y = 0; y < H; y++) { let run = -1e9; for (let x = 0; x < W; x++) { if (m[y * W + x]) run = x; if (x - run <= r) t[y * W + x] = 1; } run = 1e9; for (let x = W - 1; x >= 0; x--) { if (m[y * W + x]) run = x; if (run - x <= r) t[y * W + x] = 1; } }
  for (let x = 0; x < W; x++) { let run = -1e9; for (let y = 0; y < H; y++) { if (t[y * W + x]) run = y; if (y - run <= r) o[y * W + x] = 1; } run = 1e9; for (let y = H - 1; y >= 0; y--) { if (t[y * W + x]) run = y; if (run - y <= r) o[y * W + x] = 1; } }
  return o;
}
/** 8-connected flood from seeds over pixels where ok(i) holds. */
export function flood(seeds, ok) {
  const m = new Uint8Array(N), st = [];
  for (const [x, y] of seeds) { const i = y * W + x; if (ok(i)) { m[i] = 1; st.push(i); } }
  while (st.length) { const i = st.pop(), x = i % W, y = (i / W) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const j = yy * W + xx; if (!m[j] && ok(j)) { m[j] = 1; st.push(j); } } }
  return m;
}
/** Harmonic (Laplace) fill of RGB inside `unk` from 4-neighbours in `known`; other neighbours are ignored (Neumann). */
export function harmonicFill(px, unk, known, iters = 4000) {
  const idx = []; for (let i = 0; i < N; i++) if (unk[i]) idx.push(i);
  const v = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) if (known[i]) for (let c = 0; c < 3; c++) v[i * 3 + c] = px[i * 4 + c];
  let s = [0, 0, 0], n = 0; for (const i of idx) for (const j of [i - 1, i + 1, i - W, i + W]) if (known[j]) { for (let c = 0; c < 3; c++) s[c] += px[j * 4 + c]; n++; }
  for (const i of idx) for (let c = 0; c < 3; c++) v[i * 3 + c] = n ? s[c] / n : 0;
  for (let it = 0; it < iters; it++) {
    let delta = 0;
    for (const i of idx) { let a = [0, 0, 0], k = 0; for (const j of [i - 1, i + 1, i - W, i + W]) if (known[j] || unk[j]) { for (let c = 0; c < 3; c++) a[c] += v[j * 3 + c]; k++; }
      if (k) for (let c = 0; c < 3; c++) { const nv = v[i * 3 + c] + 1.9 * (a[c] / k - v[i * 3 + c]); delta = Math.max(delta, Math.abs(nv - v[i * 3 + c])); v[i * 3 + c] = nv; } }
    if (delta < 0.02) break;
  }
  return v;
}

// ── stage 1: one owner per pixel ────────────────────────────────────────────────────────────────────────────────
export const ZONES = Object.freeze(["eyeL", "eyeR", "browL", "browR", "nose", "mouth"]);
/** Owners: 0 none · 1 skin · 2 hair · 3 body · 10+k the feature zone ZONES[k] (resolved to feature or skin in stage 2). */
export function computeLabels(px, spec) {
  const C = new Array(N);
  for (let i = 0; i < N; i++) C[i] = cls(px[i * 4], px[i * 4 + 1], px[i * 4 + 2], px[i * 4 + 3]);
  const zone = new Uint8Array(N);
  ZONES.forEach((z, k) => { const m = polyMask(spec.zones[z]); for (let i = 0; i < N; i++) if (m[i]) zone[i] = k + 1; });
  const earIn = polyMask(spec.zones.earInL), earInR = polyMask(spec.zones.earInR);
  for (let i = 0; i < N; i++) if (earInR[i]) earIn[i] = 1;
  const hc = spec.hairColour, yMax = spec.headRegion.yMax;
  const isH = new Uint8Array(N);
  for (let i = 0; i < N; i++) { const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2]; if (px[i * 4 + 3] >= 8 && r < hc.rMax && g < hc.gOverR * r && b < hc.bOverR * r && C[i] !== "K" && !zone[i] && !earIn[i] && ((i / W) | 0) < yMax) isH[i] = 1; }
  const nearH = dilate(isH, spec.hairInkRadius);
  // hair: saturated brown outside the zones, plus ink touching it (ink inside a zone only with hair colour within reach — shared outlines)
  let hair = flood(spec.hairSeeds, (i) => isH[i] || (C[i] === "K" && nearH[i] && !earIn[i] && ((i / W) | 0) < yMax));
  // the outer hair contour: thick ink with no skin or white within 2 px, never into zones or ears
  const skinish = new Uint8Array(N); for (let i = 0; i < N; i++) if (C[i] === "S" || C[i] === "O" || C[i] === "W") skinish[i] = 1;
  const nearSkin = dilate(skinish, 2);
  hair = flood([...hair.keys()].filter((i) => hair[i]).map((i) => [i % W, (i / W) | 0]), (i) => hair[i] || (C[i] === "K" && !nearSkin[i] && !zone[i] && !earIn[i] && ((i / W) | 0) < yMax));
  // body: the grey tee and ink touching it, below the chin
  const grey = new Uint8Array(N); for (let i = 0; i < N; i++) if (C[i] === "G" && Math.max(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]) > 100 && ((i / W) | 0) > 400 && !zone[i]) grey[i] = 1;
  const nearGrey = dilate(grey, 3);
  const own = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const y = (i / W) | 0; if (px[i * 4 + 3] === 0) continue;
    if (y >= yMax) { own[i] = 3; continue; }
    if (hair[i] && !(zone[i] && C[i] !== "K")) { own[i] = 2; continue; }
    if (zone[i]) { own[i] = 10 + zone[i] - 1; continue; }
    if (grey[i] || (y > 400 && nearGrey[i] && (C[i] === "K" || C[i] === "G" || C[i] === "B"))) { own[i] = 3; continue; }
    own[i] = 1;
  }
  // shared ink: opaque zone ink that is also hair outline is duplicated into the hair (overlap)
  const dupHair = new Uint8Array(N); for (let i = 0; i < N; i++) if (hair[i] && zone[i] && C[i] === "K" && px[i * 4 + 3] >= 250) dupHair[i] = 1;
  // semi-transparent (alpha < 128) hair-edge pixels next to hair go to the hair so its edge keeps its antialias
  for (let pass = 0; pass < 4; pass++) for (let i = W; i < N - W; i++) if (own[i] === 1 && px[i * 4 + 3] < 128) { for (const j of [i - 1, i + 1, i - W, i + W]) if (own[j] === 2) { own[i] = 2; break; } }
  // dark antialias of the hair's lower edge on the forehead (brown or ink, within 2 px of hair, above the eyes) belongs to the hair
  { const hm = new Uint8Array(N); for (let i = 0; i < N; i++) if (own[i] === 2) hm[i] = 1; const nh = dilate(hm, 2);
    for (let i = 0; i < N; i++) if (own[i] === 1 && nh[i] && (C[i] === "B" || C[i] === "K") && ((i / W) | 0) < 300) own[i] = 2; }
  return { C, zone, own, dupHair };
}

// ── stage 2: the layers ─────────────────────────────────────────────────────────────────────────────────────────
/** Builds every layer, helper export and mask from the verified source. Pure apart from reading the tracked spec and source. */
export function buildLayers({ srcBuf, spec = loadSpec() } = {}) {
  const src = loadSource(srcBuf);
  if (spec.source?.sha256 !== SOURCE.sha256) throw new Error("the spec does not name the tracked Northstar v2");
  const { C, zone, own, dupHair } = computeLabels(src, spec);
  // skin specks enclosed by hair are hair highlights: small skin components touching only hair
  {
    const seen = new Uint8Array(N);
    for (let s = 0; s < N; s++) {
      if (own[s] !== 1 || seen[s]) continue;
      const comp = [s], st = [s]; seen[s] = 1; let touchHair = false, touchOther = false;
      while (st.length) { const i = st.pop(); for (const j of [i - 1, i + 1, i - W, i + W]) { if (own[j] === 1 && !seen[j]) { seen[j] = 1; st.push(j); comp.push(j); } else if (own[j] === 2) touchHair = true; else if (own[j] !== 1) touchOther = true; } }
      if (comp.length < 150 && touchHair && !touchOther) for (const i of comp) own[i] = 2;
    }
  }
  const layers = {}, L = (n) => (layers[n] ||= new Uint8ClampedArray(N * 4));
  const put = (n, i, r, g, b, a) => { const p = L(n); p[i * 4] = r; p[i * 4 + 1] = g; p[i * 4 + 2] = b; p[i * 4 + 3] = a; };
  const copy = (n, i) => put(n, i, src[i * 4], src[i * 4 + 1], src[i * 4 + 2], src[i * 4 + 3]);
  const m = { reconstructed: new Uint8Array(N), missingUnderHair: new Uint8Array(N), dupSkin: new Uint8Array(N), shadowLit: new Uint8Array(N) };
  for (let i = 0; i < N; i++) { if (own[i] === 2) copy("hair", i); else if (own[i] === 3) copy("body", i); else if (own[i] === 1) copy("skin", i); }
  // the face contour under the sideburns: opaque hair-owned ink next to skin below the brow line is duplicated into the skin
  const skinish = new Uint8Array(N); for (let i = 0; i < N; i++) if (own[i] === 1 && (C[i] === "S" || C[i] === "O")) skinish[i] = 1;
  const nearSkin2 = dilate(skinish, 2);
  for (let i = 0; i < N; i++) if (own[i] === 2 && C[i] === "K" && src[i * 4 + 3] >= 250 && nearSkin2[i] && ((i / W) | 0) > 290 && ((i / W) | 0) < 420) { m.dupSkin[i] = 1; copy("skin", i); }

  // features: reconstruct the skin under each zone, then lift the feature as colour-to-alpha over that skin
  const layerOf = { eyeL: "eyes", eyeR: "eyes", browL: "browL", browR: "browR", nose: "nose", mouth: "mouth" };
  const stats = { zones: {} };
  const skinLike = (i) => (C[i] === "S" || C[i] === "O") && src[i * 4 + 2] < 170 && src[i * 4 + 3] >= 250;
  const eyeInterior = new Uint8Array(N);
  let haloPx = 0, haloSum = 0;
  for (const [k, z] of ZONES.entries()) {
    const Z = new Uint8Array(N), U0 = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (zone[i] === k + 1 && (own[i] === 10 + k || dupHair[i])) Z[i] = 1;
    const keepOrange = z.startsWith("brow"); // next to the brows the orange is the hair's cast shadow: it stays skin
    for (let i = 0; i < N; i++) if (Z[i] && C[i] !== "S" && !(keepOrange && C[i] === "O")) U0[i] = 1;
    const D3 = dilate(U0, 3), U = new Uint8Array(N), known = new Uint8Array(N);
    for (let i = 0; i < N; i++) { if (Z[i] && D3[i]) U[i] = 1; else if ((Z[i] || own[i] === 1) && skinLike(i)) known[i] = 1; }
    if (z.startsWith("eye")) { // the eye opening: flood from the iris centre over non-skin classes inside the zone
      const ir = spec.iris[z.slice(3)], st = [Math.round(ir.c[1]) * W + Math.round(ir.c[0])];
      while (st.length) { const i = st.pop(); if (eyeInterior[i] || !Z[i] || C[i] === "S" || C[i] === "O") continue; eyeInterior[i] = 1; st.push(i - 1, i + 1, i - W, i + W); }
    }
    const S = harmonicFill(src, U, known);
    let nFeat = 0;
    for (let i = 0; i < N; i++) {
      if (Z[i] && !U[i]) { if (!dupHair[i]) copy("skin", i); continue; }
      if (!U[i]) continue;
      const aP = src[i * 4 + 3], s = [S[i * 3], S[i * 3 + 1], S[i * 3 + 2]], p = [src[i * 4], src[i * 4 + 1], src[i * 4 + 2]];
      let af = 0; for (let c = 0; c < 3; c++) { const d = p[c] - s[c]; af = Math.max(af, d > 0 ? d / Math.max(1e-6, 255 - s[c]) : -d / Math.max(1e-6, s[c])); }
      if (af < 0.02) { copy("skin", i); continue; } // indistinguishable from skin: the original pixel stays in the skin
      const ys = 0.299 * s[0] + 0.587 * s[1] + 0.114 * s[2], yp = 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];
      // sharpening halo (lighter than the skin round the ink): lifted with the feature as a faint light alpha, so the bare skin has no ghost outline
      if (yp > ys && af < 0.3 && !eyeInterior[i]) { haloPx++; haloSum += yp - ys; }
      // ink model: alpha from the luminance step to ink (10) or white (255), never below the minimum, so the composite stays exact
      af = Math.min(1, Math.max(af, yp < ys ? (ys - yp) / Math.max(1, ys - 10) : (yp - ys) / Math.max(1, 255 - ys)));
      if (af > 0.75 || eyeInterior[i]) af = 1;
      const f = p.map((pc, c) => Math.round(Math.min(255, Math.max(0, s[c] + (pc - s[c]) / af))));
      put(layerOf[z], i, f[0], f[1], f[2], Math.round(af * aP));
      put("skin", i, Math.round(s[0]), Math.round(s[1]), Math.round(s[2]), aP); m.reconstructed[i] = 1; nFeat++;
    }
    stats.zones[z] = { zonePx: Z.reduce((a, b) => a + b, 0), liftedPx: nFeat, reconstructedSkinPx: nFeat };
  }
  // eyes: iris = inside the measured ring; the highlight is lifted into the fixed layer and the iris under it reconstructed
  {
    const E = L("eyes"), iris = L("iris"), fixed = L("eyesFixed");
    for (const side of ["L", "R"]) {
      const ring = spec.iris[side], ell = ellipseMask({ c: ring.c, r: [ring.r[0] + 0.5, ring.r[1] + 0.5] });
      const hl0 = new Uint8Array(N); for (let i = 0; i < N; i++) if (ell[i] && E[i * 4 + 3] && C[i] === "W") hl0[i] = 1;
      const hlD = dilate(hl0, 1), hl = new Uint8Array(N), known = new Uint8Array(N);
      for (let i = 0; i < N; i++) if (ell[i] && E[i * 4 + 3]) { if (hlD[i]) hl[i] = 1; else known[i] = 1; }
      const I = harmonicFill(E, hl, known);
      let nHl = 0;
      for (let i = 0; i < N; i++) {
        if (!ell[i] || !E[i * 4 + 3]) continue;
        if (!hl[i]) { iris.set(E.subarray(i * 4, i * 4 + 4), i * 4); continue; }
        const s = [I[i * 3], I[i * 3 + 1], I[i * 3 + 2]], p = [E[i * 4], E[i * 4 + 1], E[i * 4 + 2]];
        let af = 0; for (let c = 0; c < 3; c++) { const d = p[c] - s[c]; af = Math.max(af, d > 0 ? d / Math.max(1e-6, 255 - s[c]) : -d / Math.max(1e-6, s[c])); }
        iris.set([Math.round(s[0]), Math.round(s[1]), Math.round(s[2]), E[i * 4 + 3]], i * 4); m.reconstructed[i] = 1;
        if (af >= 0.02) { const f = p.map((pc, c) => Math.round(Math.min(255, Math.max(0, s[c] + (pc - s[c]) / af)))); fixed.set([f[0], f[1], f[2], Math.round(af * E[i * 4 + 3])], i * 4); nHl++; }
      }
      for (let i = 0; i < N; i++) if (!ell[i] && E[i * 4 + 3] && Math.abs((i % W) - ring.c[0]) < 70) fixed.set(E.subarray(i * 4, i * 4 + 4), i * 4);
      stats["highlight" + side] = nHl;
    }
  }
  // the hair's cast shadow on the skin: orange shade near the hair above the cheeks becomes its own layer over reconstructed lit skin
  {
    const hairM = new Uint8Array(N); for (let i = 0; i < N; i++) if (own[i] === 2) hairM[i] = 1;
    const nearHair = dilate(hairM, 14), U = new Uint8Array(N), known = new Uint8Array(N);
    const ear = polyMask(spec.zones.earInL), earR = polyMask(spec.zones.earInR), sk = L("skin");
    for (let i = 0; i < N; i++) {
      const y = (i / W) | 0, k = cls(sk[i * 4], sk[i * 4 + 1], sk[i * 4 + 2], sk[i * 4 + 3]);
      if (sk[i * 4 + 3] >= 250 && y < 345 && nearHair[i] && !ear[i] && !earR[i] && (k === "O" || (k === "B" && own[i] === 1))) U[i] = 1;
    }
    const U2 = dilate(U, 1);
    for (let i = 0; i < N; i++) if (U2[i] && sk[i * 4 + 3] >= 250 && (own[i] === 1 || m.reconstructed[i]) && cls(sk[i * 4], sk[i * 4 + 1], sk[i * 4 + 2], 255) !== "K") U[i] = 1;
    for (let i = 0; i < N; i++) if (!U[i] && sk[i * 4 + 3] >= 250 && cls(sk[i * 4], sk[i * 4 + 1], sk[i * 4 + 2], 255) === "S" && sk[i * 4 + 2] < 170) known[i] = 1;
    const S = harmonicFill(sk, U, known);
    let n = 0;
    for (let i = 0; i < N; i++) {
      if (!U[i]) continue;
      const s = [S[i * 3], S[i * 3 + 1], S[i * 3 + 2]], p = [sk[i * 4], sk[i * 4 + 1], sk[i * 4 + 2]];
      let af = 0; for (let c = 0; c < 3; c++) { const d = p[c] - s[c]; af = Math.max(af, d > 0 ? d / Math.max(1e-6, 255 - s[c]) : -d / Math.max(1e-6, s[c])); }
      if (af < 0.02) continue;
      if (af > 0.75) af = 1;
      const f = p.map((pc, c) => Math.round(Math.min(255, Math.max(0, s[c] + (pc - s[c]) / af))));
      put("hairShadow", i, f[0], f[1], f[2], Math.round(af * sk[i * 4 + 3]));
      sk[i * 4] = Math.round(s[0]); sk[i * 4 + 1] = Math.round(s[1]); sk[i * 4 + 2] = Math.round(s[2]); m.shadowLit[i] = 1; n++;
    }
    stats.hairShadowPx = n;
  }
  for (let i = 0; i < N; i++) if (own[i] === 2) m.missingUnderHair[i] = 1;
  stats.halo = { px: haloPx, meanLumaAboveSkin: haloPx ? +(haloSum / haloPx).toFixed(1) : 0 };
  const face = new Uint8ClampedArray(N * 4);
  for (const n of FACE_PARTS) { const p = L(n); for (let i = 0; i < N; i++) if (p[i * 4 + 3]) face.set(p.subarray(i * 4, i * 4 + 4), i * 4); }
  const toPx = (mask, rgb) => { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) if (mask[i]) { o[i * 4] = rgb[0]; o[i * 4 + 1] = rgb[1]; o[i * 4 + 2] = rgb[2]; o[i * 4 + 3] = 255; } return o; };
  const owners = new Uint8ClampedArray(N * 4), col = { 1: [255, 205, 150], 2: [150, 60, 200], 3: [128, 128, 128] };
  for (let i = 0; i < N; i++) { const c = col[own[i]] || (own[i] >= 10 ? [0, 160, 255] : null); if (c) { owners.set(c, i * 4); owners[i * 4 + 3] = 255; } }
  const masks = {
    owners, reconstructed: toPx(m.reconstructed, [255, 0, 200]), "shadow-lit-reconstructed": toPx(m.shadowLit, [255, 140, 0]),
    "missing-under-hair": toPx(m.missingUnderHair, [0, 120, 255]), "overlap-ink-hair-features": toPx(dupHair, [255, 220, 0]), "overlap-ink-hair-skin": toPx(m.dupSkin, [255, 220, 0]),
  };
  const out = Object.fromEntries(COMPOSITE_ORDER.map((k) => [k, L(k)]));
  return { src, layers: out, helper: { face }, comparisonOnly: { body: L("body") }, masks, stats };
}

// ── composition ─────────────────────────────────────────────────────────────────────────────────────────────────
/** Source-over in premultiplied float, rounded once at the end (the prototype's compositor). */
export function overStack(stack) {
  const o = new Float64Array(N * 4);
  for (const p of stack) for (let i = 0; i < N; i++) { const a = p[i * 4 + 3] / 255; if (!a) continue; for (let c = 0; c < 3; c++) o[i * 4 + c] = p[i * 4 + c] * a + o[i * 4 + c] * (1 - a); o[i * 4 + 3] = a + o[i * 4 + 3] * (1 - a); }
  const r = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) { const a = o[i * 4 + 3]; r[i * 4 + 3] = Math.round(a * 255); if (a) for (let c = 0; c < 3; c++) r[i * 4 + c] = Math.round(o[i * 4 + c] / a); } return r;
}
/** Composes R3 head layers in COMPOSITE_ORDER (subset allowed, order kept). Refuses the face helper and the comparison-only body. */
export function composeHead(layers, { include = COMPOSITE_ORDER } = {}) {
  for (const k of Object.keys(layers)) if (!COMPOSITE_ORDER.includes(k)) throw new Error(`${k} is not a compositing layer (${k in HELPER_EXPORTS ? "helper export" : k in COMPARISON_ONLY ? "comparison only" : "unknown"})`);
  for (const k of include) if (!COMPOSITE_ORDER.includes(k)) throw new Error(`${k} is not a compositing layer`);
  return overStack(COMPOSITE_ORDER.filter((k) => include.includes(k) && layers[k]).map((k) => layers[k]));
}
/** The documented comparison with the whole original: the comparison-only body under the R3 head layers. */
export function composeOriginalComparison(build, include = COMPOSITE_ORDER) {
  return overStack([build.comparisonOnly.body, ...COMPOSITE_ORDER.filter((k) => include.includes(k)).map((k) => build.layers[k])]);
}
/** Per-pixel deviation of a composite from the original: colour over white and alpha, counted in bands. */
export function deviation(orig, comp) {
  const r = { visiblePx: 0, bitIdenticalPx: 0, rgb: { 0: 0, "1-2": 0, "3-5": 0, "6-16": 0, ">16": 0 }, alpha: { 0: 0, "1-2": 0, "3-5": 0, ">5": 0 }, maxRgb: 0, maxAlpha: 0 };
  for (let i = 0; i < N; i++) {
    if (!orig[i * 4 + 3] && !comp[i * 4 + 3]) continue;
    r.visiblePx++;
    if (orig[i * 4] === comp[i * 4] && orig[i * 4 + 1] === comp[i * 4 + 1] && orig[i * 4 + 2] === comp[i * 4 + 2] && orig[i * 4 + 3] === comp[i * 4 + 3]) r.bitIdenticalPx++;
    let d = 0; for (let c = 0; c < 3; c++) { const a = orig[i * 4 + c] * orig[i * 4 + 3] / 255 + 255 * (1 - orig[i * 4 + 3] / 255), b = comp[i * 4 + c] * comp[i * 4 + 3] / 255 + 255 * (1 - comp[i * 4 + 3] / 255); d = Math.max(d, Math.abs(a - b)); }
    d = Math.round(d); const da = Math.abs(orig[i * 4 + 3] - comp[i * 4 + 3]);
    r.rgb[d === 0 ? 0 : d <= 2 ? "1-2" : d <= 5 ? "3-5" : d <= 16 ? "6-16" : ">16"]++;
    r.alpha[da === 0 ? 0 : da <= 2 ? "1-2" : da <= 5 ? "3-5" : ">5"]++;
    r.maxRgb = Math.max(r.maxRgb, d); r.maxAlpha = Math.max(r.maxAlpha, da);
  }
  return r;
}

// ── editable source: OpenRaster (Krita / GIMP) ──────────────────────────────────────────────────────────────────
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
/** A stored (uncompressed) zip with fixed timestamps: the same members give the same bytes. */
export function zipStore(entries) {
  const parts = [], central = []; let off = 0;
  for (const { name, data } of entries) {
    const nb = Buffer.from(name, "utf8"), crc = crc32(data), h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt32LE(crc, 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(nb.length, 26);
    parts.push(h, nb, data);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(nb.length, 28); c.writeUInt32LE(off, 42);
    central.push(c, nb); off += 30 + nb.length + data.length;
  }
  const cd = Buffer.concat(central), e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(entries.length, 8); e.writeUInt16LE(entries.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, e]);
}
export const ORA_LAYERS = Object.freeze([["hair", "Hår (z40) — originalpixels"], ["eyesFixed", "Øjne faste dele — sclera, vipper, glans"], ["iris", "Iris — originalpixels, glans fjernet"], ["browL", "Bryn venstre"], ["browR", "Bryn højre"], ["nose", "Næse"], ["mouth", "Mund"], ["hairShadow", "Hårets slagskygge på huden"], ["skin", "Hoved/hud med ører og hals"], ["body", "KUN SAMMENLIGNING — Northstars krop, ikke et R3-asset"]]);
export const ORA_MASKS = Object.freeze([["missing-under-hair", "MASKE mangler: skjult under håret"], ["reconstructed", "MASKE rekonstrueret: hud under træk + iris under glans"], ["shadow-lit-reconstructed", "MASKE rekonstrueret: lys hud under hårskygge"], ["overlap-ink-hair-features", "MASKE overlap: delt streg hår/træk"], ["overlap-ink-hair-skin", "MASKE overlap: delt kontur hår/hud"], ["owners", "MASKE ejerskab pr. pixel"]]);
/** The editable layered file. `png(name)` returns the PNG bytes of a layer or mask; the stack text and the zip are deterministic. */
export function buildOra(png, mergedPng, thumbPng) {
  const entries = [{ name: "mimetype", data: Buffer.from("image/openraster") }];
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<image version="0.0.5" w="${W}" h="${H}" xres="72" yres="72">\n <stack>\n  <stack name="Masker (skjult)" visibility="hidden">\n`;
  const members = [];
  for (const [f, name] of ORA_MASKS) { const p = `data/mask-${f}.png`; members.push({ name: p, data: png(f) }); xml += `   <layer name="${name}" src="${p}" x="0" y="0" opacity="0.6" visibility="hidden"/>\n`; }
  xml += `  </stack>\n`;
  for (const [f, name] of ORA_LAYERS) { const p = `data/${f}.png`; members.push({ name: p, data: png(f) }); xml += `  <layer name="${name}" src="${p}" x="0" y="0" opacity="1.0" visibility="${f === "body" ? "hidden" : "visible"}"/>\n`; }
  xml += ` </stack>\n</image>\n`;
  return zipStore([...entries, { name: "stack.xml", data: Buffer.from(xml, "utf8") }, ...members, { name: "mergedimage.png", data: mergedPng }, { name: "Thumbnails/thumbnail.png", data: thumbPng }]);
}
/** Nearest-neighbour thumbnail (171x256) of a full canvas. */
export function thumbnail(px) { const tw = 171, th = 256, o = new Uint8ClampedArray(tw * th * 4); for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) { const j = (Math.floor(y * H / th) * W + Math.floor(x * W / tw)) * 4; o.set(px.subarray(j, j + 4), (y * tw + x) * 4); } return { w: tw, h: th, px: o }; }

/** Reads the tracked layer and mask files (byte copies of the prototype's outputs) and the manifest. */
export function loadTracked() {
  const man = JSON.parse(rel(MANIFEST_FILE).toString("utf8")), files = {};
  for (const [k, e] of Object.entries({ ...man.layers, ...man.masks })) { const b = rel(e.file); if (sha(b) !== e.sha256) throw new Error(`${e.file} is not the pinned ${e.sha256}`); files[k] = b; }
  const specSha256 = sha(rel(SPEC_FILE)); if (specSha256 !== man.spec.sha256) throw new Error(`${SPEC_FILE} is not the pinned ${man.spec.sha256}`);
  if (man.source.sha256 !== SOURCE.sha256) throw new Error("the manifest does not name the tracked Northstar v2");
  return { man, files, specSha256 };
}

/** The .ora rebuilt from the TRACKED layer and mask bytes plus the comparison body, the composite and the thumbnail encoded from
 *  pixels. Deterministic: two builds give the same bytes; the members' pixels are pinned in the manifest. */
export function buildOraFromTracked(build, tracked = loadTracked()) {
  const enc = {}, comp = composeOriginalComparison(build), t = thumbnail(comp);
  enc.body = Buffer.from(encodePng(W, H, build.comparisonOnly.body));
  return buildOra((k) => tracked.files[k] ?? enc[k], Buffer.from(encodePng(W, H, comp)), Buffer.from(encodePng(t.w, t.h, t.px)));
}

// ── CLI ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const invokedDirectly = typeof process.argv[1] === "string" && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  const args = process.argv.slice(2), i = args.indexOf("--out"), outDir = i >= 0 ? args[i + 1] : null;
  if (!outDir) throw new Error("usage: --out <empty dir>");
  const OUT = resolve(outDir); if (existsSync(OUT) && readdirSync(OUT).length) throw new Error("output directory not empty");
  for (const d of ["layers", "masks", "helper", "comparison-only"]) mkdirSync(join(OUT, d), { recursive: true });
  const b = buildLayers(), pins = {};
  const write = (dir, k, px) => { const buf = encodePng(W, H, px); writeFileSync(join(OUT, dir, `${k}.png`), buf); pins[`${dir}/${k}`] = pixelSha256(px); return buf; };
  const pngs = {};
  for (const [k, px] of Object.entries(b.layers)) pngs[k] = write("layers", k, px);
  for (const [k, px] of Object.entries(b.masks)) pngs[k] = write("masks", k, px);
  write("helper", "face", b.helper.face); pngs.body = write("comparison-only", "body", b.comparisonOnly.body);
  const comp = composeOriginalComparison(b), compPng = encodePng(W, H, comp); writeFileSync(join(OUT, "composite-default-with-comparison-body.png"), compPng);
  const ora = buildOraFromTracked(b);
  writeFileSync(join(OUT, "northstar-layers-v1.ora"), ora);
  const dev = deviation(b.src, comp);
  writeFileSync(join(OUT, "build.json"), JSON.stringify({ tool: TOOL_ID, decision: DECISION, status: REVIEW_STATUS, source: SOURCE, pixelSha256: pins, composite: pixelSha256(comp), deviation: dev, stats: b.stats, oraSha256: sha(ora) }, null, 2) + "\n");
  console.log(JSON.stringify({ deviation: dev, oraSha256: sha(ora) }, null, 1));
}
