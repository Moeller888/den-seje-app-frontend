// D-380 — one-time exception for D-379 NH-5C (Nakkelokker): exactly the two variants the owner tried in the avatar picker on 2026-11-17,
// "Nakkelokker V2" in neutral grey and in Northstar brown. Deterministic, offline; no image call. The raw image, the base, the ear mask,
// the layers and every head stay outside the clones. From NH-5C's one returned image the two heads are rebuilt in one go:
//   1. the LOCKED extraction, unchanged: northstar-hair-nh5c.mjs's postProcessC (D-379's V1 grey layer, rejected; its checks are kept);
//   2. the brows: inside a window round each brow, the raw image's own hair (registered exactly as the locked post registers it) is sampled
//      16 px lower, so each lock's own tip — its point and its dark outline — ends 16 px higher; the shift fades in from 0 (50 px above the
//      brow) to 16 (at the brow) and out sideways; the brows (+2 px) and the eyes stay hard limits. Inside the windows only: specks under
//      80 px go, pinholes are filled, and a 1 px dark outline is drawn where the hair meets a brow's or an eye's hard limit;
//   3. the ear tops: the front/back split no longer runs straight along y 306. Layer hair connected to the front hair, on the head, beside
//      each ear (x 330–425 / 593–690) and between the ear top and y 345, stays IN FRONT, so the strand runs down to the ear's outline as the
//      raw image draws it; the ears are still drawn once, on top; the locks along the jaw stay behind;
//   4. one layer, tinted with the same northstarTint for Northstar brown, composed in C's layer order on D-373's shared base, and each head
//      encoded as lossless WebP exactly as D-373's heads are (toWebp: decoded back and compared byte for byte).
// D-379's thresholds stand: GATES and DRESS_GATES are imported from northstar-hair-nh5c.mjs, which stays unchanged and pinned by
// plan-nh5c-v1.json. The layer-side checks are re-measured on V2's layer with the same formulas and reported; the raw image's own checks
// (P3/P4 on the raw image, P9, P11) belong to the raw image and are unchanged. The exception binds ONLY the full hashes in
// exception-d380-v1.json; the command line refuses any other input and exits 1 if any output is not byte for byte the bound file.
// Usage: node tools/avatar/northstar-hair-nh5c-exception-d380.mjs --raw <NH-5C nh.image-1.png> --base <d373-base-figure.png>
//          --ear <ear-on-top mask png> --nh4 <D-373 NH-4 grey layer png> --cwebp <vendored cwebp> --dwebp <vendored dwebp>
//          --out <empty dir outside the repository>
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve, dirname, relative, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import * as C from "./northstar-hair-nh5c.mjs";
import * as NH5 from "./northstar-hair-nh5.mjs";
import * as T from "./northstar-hair-template-d371.mjs";
import * as FIG from "./r3-northstar-figure.mjs";
import * as NL from "./r3-northstar-layers.mjs";
import { encodePng, decodePng } from "./r3-hair-tool-v2.mjs";
import { northstarTint } from "./northstar-hair-nh4-post.mjs";
import { toWebp } from "./build-northstar-hair-heads-d373.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DECISION = "D-380";
export const FIXTURE = "tools/avatar/fixtures/northstar-hair-d379/exception-d380-v1.json";
const { W, H, N, S, EAR_TOP } = C;
export const sha256 = (b) => createHash("sha256").update(b).digest("hex");

/** The two local adjustments, fixed: the brow tips moved 16 px up (no sideways move), the ear strands kept in front. */
export const ADJUST = Object.freeze({
  brows: Object.freeze({ shiftUpPx: 16, sideShiftPx: 0, fadeAbovePx: 50, fadeBelowPx: 30, fadeSidePx: 30, innerFadePx: 20, hardLimit: "the brows (+2 px) and the eyes", speckMaxPx: 79, pinholeMinNeighbours: 6, outlineGrey: 34 }),
  earStrands: Object.freeze({ columns: Object.freeze([Object.freeze([330, 425]), Object.freeze([593, 690])]), rows: Object.freeze([C.EAR_TOP, 345]), minAlpha: 32 }),
});

const lumOf = (P, i) => 0.299 * P[i * 4] + 0.587 * P[i * 4 + 1] + 0.114 * P[i * 4 + 2];
const satOf = (P, i) => { const r = P[i * 4], g = P[i * 4 + 1], b = P[i * 4 + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx < 24 ? 0 : (mx - mn) / mx; };
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

/** The raw image on the figure grid, registered with the locked post's own P1 values (scale, shift), as postProcessC registers it. */
export function rawOnFigure(O, reg) {
  const cx = 512, cy = 700, OR = new Uint8ClampedArray(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const sx = cx + (x - cx) * reg.scale + reg.dx, sy = cy + (y - cy) * reg.scale + reg.dy, x0 = Math.floor(sx), y0 = Math.floor(sy); if (x0 < 0 || y0 < 0 || x0 >= S - 1 || y0 >= S - 1) continue;
    const ax = sx - x0, ay = sy - y0, w4 = [(1 - ax) * (1 - ay), ax * (1 - ay), (1 - ax) * ay, ax * ay], ii = [y0 * S + x0, y0 * S + x0 + 1, (y0 + 1) * S + x0, (y0 + 1) * S + x0 + 1]; let a = 0; const c = [0, 0, 0];
    for (let k = 0; k < 4; k++) { const al = O[ii[k] * 4 + 3] * w4[k]; a += al; for (let q = 0; q < 3; q++) c[q] += O[ii[k] * 4 + q] * al; } if (a > 0) { const j = (y * S + x) * 4; for (let q = 0; q < 3; q++) OR[j + q] = Math.round(c[q] / a); OR[j + 3] = Math.round(a); } }
  return T.mapBack(OR);
}

/** Step 2: the brow tips moved up, then the clean-up inside the two windows. Returns the adjusted grey layer and its counts. */
export function moveBrowTips({ GL1, OF, base, G }) {
  const B = ADJUST.brows, K = B.shiftUpPx, GL = new Uint8ClampedArray(GL1), trimmed = new Uint8Array(N);
  const rawHair = (i) => OF[i * 4 + 3] >= 128 && satOf(OF, i) < 0.12 && (base[i * 4 + 3] < 128 || Math.hypot(OF[i * 4] - base[i * 4], OF[i * 4 + 1] - base[i * 4 + 1], OF[i * 4 + 2] - base[i * 4 + 2]) > 45);
  const HARDB = G.dil(G.BROW, 2), eyes = G.t.z.eyesClear;
  for (const sd of ["left", "right"]) {
    let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
    for (let i = 0; i < N; i++) if (G.t.z.brows[sd][i]) { const x = i % W, y = (i / W) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const outer = sd === "left" ? x0 : x1, inner = sd === "left" ? x1 : x0, dir = sd === "left" ? -1 : 1;   // dir: towards the temple
    const xa = Math.min(outer + dir * B.fadeSidePx, inner), xb = Math.max(outer + dir * B.fadeSidePx, inner);
    for (let y = y0 - B.fadeAbovePx; y <= y1 + B.fadeBelowPx; y++) for (let x = xa; x <= xb; x++) {
      const i = y * W + x, wy = y <= y1 ? smooth((y - (y0 - B.fadeAbovePx)) / B.fadeAbovePx) : 1 - smooth((y - y1) / B.fadeBelowPx), past = (x - outer) * dir;   // past > 0: beyond the brow's end
      const wx = past <= 0 ? smooth(Math.min(1, Math.abs(x - inner) / B.innerFadePx)) : smooth(1 - past / B.fadeSidePx), s = Math.round(K * wy * wx);
      if (s === 0) continue; const j = (y + s) * W + x;
      if (rawHair(j) && !HARDB[i] && !eyes[i]) { const gv = Math.round(lumOf(OF, j)); GL.set([gv, gv, gv, 255], i * 4); }
      else if (GL[i * 4 + 3]) { GL[i * 4 + 3] = 0; trimmed[i] = 1; }
    }
  }
  let outlined = 0;
  const inWin = new Uint8Array(N); for (let i = 0; i < N; i++) if (trimmed[i] || GL[i * 4 + 3] !== GL1[i * 4 + 3] || GL[i * 4] !== GL1[i * 4]) inWin[i] = 1;
  const win = G.dil(inWin, 3);
  { const m = new Uint8Array(N); for (let i = 0; i < N; i++) if (GL[i * 4 + 3]) m[i] = 1; const lab = new Int32Array(N); let nn = 0;
    for (let i = 0; i < N; i++) if (m[i] && !lab[i] && win[i]) { nn++; const st = [i], all = []; lab[i] = nn; while (st.length) { const k = st.pop(); all.push(k); for (const q of [k - 1, k + 1, k - W, k + W, k - W - 1, k - W + 1, k + W - 1, k + W + 1]) if (m[q] && !lab[q]) { lab[q] = nn; st.push(q); } }
      if (all.length <= B.speckMaxPx) for (const k of all) { GL[k * 4 + 3] = 0; trimmed[k] = 1; } } }
  for (let pass = 0; pass < 2; pass++) for (let i = W; i < N - W; i++) { if (!win[i] || GL[i * 4 + 3] || HARDB[i] || eyes[i]) continue; let c = 0, s = 0;
    for (const q of [i - 1, i + 1, i - W, i + W, i - W - 1, i - W + 1, i + W - 1, i + W + 1]) if (GL[q * 4 + 3] >= 128) { c++; s += GL[q * 4]; }
    if (c >= B.pinholeMinNeighbours) { const v = Math.round(s / c); GL.set([v, v, v, 255], i * 4); outlined++; } }
  for (let i = W; i < N - W; i++) { if (!win[i] || !GL[i * 4 + 3] || HARDB[i]) continue; if ([i - 1, i + 1, i - W, i + W].some((q) => HARDB[q] || eyes[q])) { GL.set([B.outlineGrey, B.outlineGrey, B.outlineGrey, 255], i * 4); outlined++; } }
  return { GL, browTrimmedPx: trimmed.reduce((a, v) => a + v, 0), browFilledOrOutlinedPx: outlined };
}

/** Step 3: the strands beside each ear that stay in front (connected to the front hair, from the ear top down to y 345). */
export function earStrands({ GL, G }) {
  const E = ADJUST.earStrands, EAR = G.EAR, [r0, r1] = E.rows;
  const side = (x) => E.columns.some(([a, b]) => x >= a && x <= b);
  const cand = (i) => { const x = i % W, y = (i / W) | 0; return side(x) && y >= r0 && y <= r1 && G.head[i] && !EAR[i] && GL[i * 4 + 3] >= E.minAlpha; };
  const FRONTX = new Uint8Array(N), st = [];
  for (let x = 0; x < W; x++) { const i = (r0 - 1) * W + x; if (side(x) && GL[i * 4 + 3] >= E.minAlpha) { for (const q of [i + W - 1, i + W, i + W + 1]) if (cand(q) && !FRONTX[q]) { FRONTX[q] = 1; st.push(q); } } }
  while (st.length) { const k = st.pop(); for (const q of [k - 1, k + 1, k + W, k - W, k + W - 1, k + W + 1]) if (q > 0 && q < N && !FRONTX[q] && cand(q)) { FRONTX[q] = 1; st.push(q); } }
  return FRONTX;
}

/** C's layer order (northstar-hair-nh5c.mjs composeC) with V2's front/back split: the ear strands (FRONTX) stay in front. */
export function composeV2(base, ear, HL0, FRONTX) {
  const { F: HL, add } = C.behindFill(base, ear, HL0);
  const BACK = new Uint8ClampedArray(N * 4), FRONT = new Uint8ClampedArray(N * 4), EARTOP = new Uint8ClampedArray(N * 4), VIS = new Uint8Array(N);
  for (let i = 0; i < N; i++) { if (!HL[i * 4 + 3]) continue; const back = (((i / W) | 0) >= EAR_TOP || add[i]) && !FRONTX[i]; (back ? BACK : FRONT).set(HL.subarray(i * 4, i * 4 + 4), i * 4); }
  const MID = new Uint8ClampedArray(base);
  for (let i = 0; i < N; i++) if (ear[i * 4 + 3]) { EARTOP.set(base.subarray(i * 4, i * 4 + 4), i * 4); MID[i * 4 + 3] = 0; }
  const pic = NL.overStack([BACK, MID, FRONT, EARTOP]);
  for (let i = 0; i < N; i++) { if (HL[i * 4 + 3] === 0) { pic.set(base.subarray(i * 4, i * 4 + 4), i * 4); continue; }
    const hidden = (add[i] && !FRONTX[i]) || ear[i * 4 + 3] > 0 || (((i / W) | 0) >= EAR_TOP && base[i * 4 + 3] >= 250 && !FRONTX[i]); if (!hidden) VIS[i] = HL[i * 4 + 3]; }
  let earOpaque = 0, earOpaqueSame = 0; for (let i = 0; i < N; i++) if (ear[i * 4 + 3] && base[i * 4 + 3] === 255) { earOpaque++; if ([0, 1, 2, 3].every((c) => pic[i * 4 + c] === base[i * 4 + c])) earOpaqueSame++; }
  return { pic, VIS, HL, ears: { earOpaque, earOpaqueSame } };
}

/** D-379's layer-side checks on V2's layer, with the locked formulas and thresholds (C.GATES); the raw image's checks are not re-scored. */
export function v2Checks({ HL0, v2b, OF, base, G, Z, std, nh4, nh5b }) {
  const Gt = C.GATES, A = (i) => HL0[i * 4 + 3], VIS = v2b.VIS, M = Z.M, t = G.t, EAR = G.EAR, g = {};
  const notHead = new Uint8Array(N); for (let i = 0; i < N; i++) if (!G.head[i]) notHead[i] = 1; const rim = G.dil(notHead, 3);
  { const nonHairHead = new Uint8Array(N); for (let i = 0; i < N; i++) if (G.head[i] && !M[i] && ((i / W) | 0) > 190) nonHairHead[i] = 1;
    const nearFace = G.dil(nonHairHead, 14), SCALP = new Uint8Array(N); for (let i = 0; i < N; i++) if (M[i] && G.head[i] && !Z.PART[i] && !nearFace[i] && ((i / W) | 0) < 290) SCALP[i] = 1;
    let nn = 0, c = 0; const HOLE = new Uint8Array(N); for (let i = 0; i < N; i++) if (SCALP[i]) { nn++; if (VIS[i] >= 250) c++; else HOLE[i] = 1; }
    g.P2 = { covered: +(c / nn).toFixed(4), pass: c / nn >= Gt.P2.min };
    const holes = NH5.pieces(HOLE, W, H, false); g.P12 = { largestHolePx: holes.length ? holes[0].px : 0, at: holes.length ? holes[0].box : null, pass: (holes.length ? holes[0].px : 0) <= Gt.P12.max }; }
  { let onBrow = 0, eyes = 0; const gap = { left: 1e9, right: 1e9 }; for (let i = 0; i < N; i++) { if (G.BROW[i] && A(i) >= 128) onBrow++; if (t.z.eyesClear[i] && A(i) >= 128) eyes++; }
    for (const sd of ["left", "right"]) for (let i = 0; i < N; i++) if (t.z.brows[sd][i]) { const x = i % W, y = (i / W) | 0; for (let k = 1; k < 30; k++) if (A((y - k) * W + x) >= 128) { gap[sd] = Math.min(gap[sd], k); break; } }
    g.P3layer = { layerOnBrowsPx: onBrow, layerOnEyesPx: eyes, gapPx: gap, pass: onBrow === 0 && eyes === 0 && gap.left >= Gt.P3.minGap && gap.right >= Gt.P3.minGap }; }
  { let onEar = 0, faceHidden = 0, faceShown = 0, below = 0; for (let i = 0; i < N; i++) { const y = (i / W) | 0;
      if (EAR[i] && A(i)) onEar++;
      if (G.head[i] && !rim[i] && !EAR[i] && y > 310 && A(i) >= 32) { if (VIS[i]) faceShown++; else faceHidden++; } if (y >= 433 && A(i) >= 32) below++; }
    g.P4layer = { layerOnEarsPx: onEar, earsInFront: v2b.ears, layerHiddenBehindFacePx: faceHidden, layerShownOverFaceBelowEarTopsPx: faceShown, layerBelowJawlinePx: below,
      pass: onEar === 0 && v2b.ears.earOpaqueSame === v2b.ears.earOpaque && faceHidden <= Gt.P4.maxLayer && below <= Gt.P4.maxLayer }; }
  { const m = new Uint8Array(N); let tot = 0; for (let i = 0; i < N; i++) if (A(i) >= 128) { m[i] = 1; tot++; } const c = NH5.pieces(m, W, H, false); g.P5 = { hairPx: tot, largestShare: tot ? +(c[0].px / tot).toFixed(4) : 0, pass: tot > 0 && c[0].px / tot >= Gt.P5.min }; }
  { let nn = 0, s = 0; for (let i = 0; i < N; i++) if (v2b.HL[i * 4 + 3] === 0) { nn++; if ([0, 1, 2, 3].every((c) => v2b.pic[i * 4 + c] === base[i * 4 + c])) s++; } g.P6 = { px: nn, identical: s, pass: nn === s }; }
  { const me = new Uint8Array(N); for (let i = 0; i < N; i++) if (VIS[i] >= 128) me[i] = 1;
    const iou = { standard: +NH5.appIoU(G, me, std).toFixed(3), nh4: +NH5.appIoU(G, me, nh4).toFixed(3), topknot: +NH5.appIoU(G, me, nh5b).toFixed(3), design: +NH5.appIoU(G, me, M).toFixed(3) };
    g.P8 = { iou, pass: iou.standard <= Gt.P8.max && iou.nh4 <= Gt.P8.max && iou.topknot <= Gt.P8.max && iou.design >= Gt.P8.minDesign }; }
  { const c = C.cutRegions({ VIS, OF, BR: base, G }); g.P10 = { ...c, pass: c.longestRun <= Gt.P10.maxRun }; }
  { const sideM = {}; for (const [k, left] of [["left", true], ["right", false]]) { let nn = 0, c = 0, low = -1;
      for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0; if ((x < 509) !== left) continue; if (VIS[i] >= 128 && y >= EAR_TOP && !G.head[i]) low = Math.max(low, y);
        if (Z.LOCK[i] && !G.head[i] && !G.EARP[i] && y >= 330 && y <= 412) { nn++; if (VIS[i] >= 128) c++; } }
      sideM[k] = { lockZonePx: nn, shown: nn ? +(c / nn).toFixed(4) : 0, lowestY: low, pass: nn > 0 && c / nn >= Gt.P13.min && low >= Gt.P13.endFrom && low <= Gt.P13.endTo }; }
    g.P13 = { ...sideM, pass: sideM.left.pass && sideM.right.pass }; }
  return g;
}

/** G1–G6 on the three tops, split so that G3 shows which changed face pixels are the ear strands in front (FRONTX). */
export function dressV2({ AL, decode, base, v2b, FRONTX, G }) {
  const out = {};
  for (const [name, top] of C.TOPS) {
    const F0 = C.figure(AL, decode, top, base), FC = C.figure(AL, decode, top, v2b.pic), U = C.figure(AL, decode, top, null, { withoutHead: true });
    let g1 = 0, g2 = 0, g3face = 0, g3strand = 0, g4 = 0, gap = 1e9; const g5 = { left: 0, right: 0 };
    for (let i = 0; i < N; i++) { const y = (i / W) | 0, x = i % W, ch = [0, 1, 2, 3].some((c) => F0[i * 4 + c] !== FC[i * 4 + c]), hair = v2b.HL[i * 4 + 3] > 0;
      if (ch && hair && U[i * 4 + 3] >= 8) g1++;
      if (G.EAR[i] && base[i * 4 + 3] === 255 && ch) g2++;
      if (G.head[i] && !G.EAR[i] && y >= EAR_TOP && base[i * 4 + 3] === 255 && ch) { if (FRONTX[i]) g3strand++; else g3face++; }
      if (ch && !hair) g4++;
      if (v2b.VIS[i] >= 128 && y >= 385 && y <= 424 && !G.head[i]) g5[x < 509 ? "left" : "right"]++;
      if (v2b.VIS[i] >= 128 && y >= EAR_TOP) for (let k = 1; k < 40; k++) { const q = i + k * W; if (U[q * 4 + 3] >= 8 && !G.head[q]) { gap = Math.min(gap, k); break; } } }
    out[name] = { G1_locksOverClothesPx: g1, G2_opaqueEarPxChanged: g2, G3_facePxChangedOutsideTheEarStrands: g3face, G3_facePxChangedByTheEarStrands: g3strand, G4_changedOutsideHairPx: g4, G5_locksAlongJawPx: g5, G6_minGapToClothesPx: gap };
  }
  return out;
}

/** Where V2 departs from D-379's thresholds, counted: P10's cut pixels, G3's strand pixels, P13's lock zone shown / empty. */
export function deviations({ v2b, OF, base, G, Z, FRONTX }) {
  const VIS = v2b.VIS, hairyRaw = (i) => OF[i * 4 + 3] >= 128 && satOf(OF, i) < 0.12 && (base[i * 4 + 3] < 128 || Math.hypot(OF[i * 4] - base[i * 4], OF[i * 4 + 1] - base[i * 4 + 1], OF[i * 4 + 2] - base[i * 4 + 2]) > 45);
  let cut = 0, shown = 0, empty = 0;
  for (let i = W; i < N - W; i++) { if (VIS[i] >= 128 || !hairyRaw(i) || G.EAR[i]) continue; for (const q of [i - 1, i + 1, i - W, i + W]) if (VIS[q] >= 128) { cut++; break; } }
  for (let i = 0; i < N; i++) { const y = (i / W) | 0; if (Z.LOCK[i] && !G.head[i] && !G.EARP[i] && y >= 330 && y <= 412) { if (VIS[i] >= 128) shown++; else empty++; } }
  return { P10cutPx: cut, G3strandPx: FRONTX.reduce((a, v) => a + v, 0), P13zoneShownPx: shown, P13zoneEmptyPx: empty };
}

const strip = (r) => ({ verdict: r.verdict, failed: r.failed, checks: r.checks });
/** The whole build from the untouched raw image: the locked extraction (V1), V2's two adjustments, the two heads (PNG) and their checks.
 *  `decode(rel)` decodes a tracked WebP (the live top knot for P8, the clothes for G1–G6); `AL` is js/avatar-layers.js. */
export function buildV2({ raw, base, ear, nh4Layer, AL, decode }) {
  const G = NH5.geometry(base, ear), Z = C.silhouetteC(G), std = NH5.alphaMask(FIG.buildFigure().layers.hair), nh4 = NH5.alphaMask(nh4Layer), nh5b = C.topknotMask(base, ear, decode(C.TOPKNOT_HEAD));
  const v1 = C.postProcessC({ result: raw, base, ear, G, Z, std, nh4, nh5b }), reg = v1.report.checks.P1;
  const OF = rawOnFigure(raw, reg);
  const brows = moveBrowTips({ GL1: v1.GL, OF, base, G }), GL = brows.GL, FRONTX = earStrands({ GL, G });
  const HL0 = northstarTint(GL), v2g = composeV2(base, ear, GL, FRONTX), v2b = composeV2(base, ear, HL0, FRONTX);
  const checks = v2Checks({ HL0, v2b, OF, base, G, Z, std, nh4, nh5b });
  const failed = Object.entries(checks).filter(([, v]) => !v.pass).map(([k]) => k);
  const assemblyLocked = C.dress({ AL, decode, base, ear, HL: v2b.HL, pic: v2b.pic }), assembly = dressV2({ AL, decode, base, v2b, FRONTX, G });
  let alphaDiffGreyVsBrownPx = 0, greyLayerNonNeutralPx = 0, earOpaqueSameGrey = 0;
  for (let i = 0; i < N; i++) { if (GL[i * 4 + 3] !== HL0[i * 4 + 3]) alphaDiffGreyVsBrownPx++; if (GL[i * 4 + 3] && (GL[i * 4] !== GL[i * 4 + 1] || GL[i * 4 + 1] !== GL[i * 4 + 2])) greyLayerNonNeutralPx++;
    if (ear[i * 4 + 3] && base[i * 4 + 3] === 255 && [0, 1, 2, 3].every((c) => v2g.pic[i * 4 + c] === base[i * 4 + c])) earOpaqueSameGrey++; }
  const files = {
    v1GreyLayer: encodePng(W, H, v1.GL),
    greyLayer: encodePng(W, H, GL), brownLayer: encodePng(W, H, HL0),
    greyHeadPng: encodePng(W, H, v2g.pic), brownHeadPng: encodePng(W, H, v2b.pic),
  };
  return {
    v1: strip(v1.report), registration: { scale: reg.scale, dx: reg.dx, dy: reg.dy },
    adjust: { browTrimmedPx: brows.browTrimmedPx, browFilledOrOutlinedPx: brows.browFilledOrOutlinedPx, earStrandFrontPx: FRONTX.reduce((a, v) => a + v, 0) },
    v2: { failed, checks }, assembly, assemblyLockedGates: assemblyLocked, deviations: deviations({ v2b, OF, base, G, Z, FRONTX }),
    finished: { alphaDiffGreyVsBrownPx, greyLayerNonNeutralPx, earOpaquePx: v2b.ears.earOpaque, earOpaqueIdenticalBrown: v2b.ears.earOpaqueSame, earOpaqueIdenticalGrey: earOpaqueSameGrey },
    files,
  };
}

/** The fixture's bound outputs that a build does not reproduce byte for byte (empty: these are the excepted heads). */
export function bindingMismatches(fixture, files) {
  const out = []; for (const [k, o] of Object.entries(fixture.outputs)) if (!files[k] || sha256(files[k]) !== o.sha256) out.push(k + (files[k] ? " " + sha256(files[k]) : " missing"));
  return out;
}

async function main() {
  const args = process.argv.slice(2), arg = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null), outside = (d) => { if (!d) return false; const r = relative(ROOT, resolve(d)); return r.startsWith("..") || isAbsolute(r); };
  const fx = JSON.parse(readFileSync(join(ROOT, ...FIXTURE.split("/")), "utf8")), f = { raw: arg("--raw"), base: arg("--base"), ear: arg("--ear"), nh4: arg("--nh4") }, cwebp = arg("--cwebp"), dwebp = arg("--dwebp"), OUT = arg("--out");
  if (Object.values(f).some((v) => !v) || !OUT || !cwebp || !dwebp || !existsSync(cwebp) || !existsSync(dwebp)) throw new Error("--raw <png> --base <d373 base png> --ear <ear mask png> --nh4 <NH-4 grey layer png> --cwebp <vendored cwebp> --dwebp <vendored dwebp> --out <empty dir outside the repository>");
  for (const p of [...Object.values(f), OUT]) if (!outside(p)) throw new Error("the images and the output stay outside the repository: " + p);
  for (const [k, p] of Object.entries(f)) { const pin = fx.inputs.find((i) => i.role === k), got = sha256(readFileSync(p)); if (!pin || got !== pin.sha256) throw new Error("input " + k + " is not the pinned file: " + got); }
  if (existsSync(OUT) && readdirSync(OUT).length) throw new Error("output directory not empty");
  const tmp = mkdtempSync(join(tmpdir(), "d380-")), cache = new Map(); let n = 0;
  const decode = (rel) => { if (!cache.has(rel)) { const p = join(tmp, (n++) + ".png"); execFileSync(dwebp, ["-quiet", join(ROOT, ...rel.split("/")), "-o", p]); cache.set(rel, decodePng(readFileSync(p)).px); } return cache.get(rel); };
  const AL = await import(pathToFileURL(join(ROOT, "js", "avatar-layers.js")).href);
  const px = (p) => decodePng(readFileSync(p)).px;
  const b = buildV2({ raw: px(f.raw), base: px(f.base), ear: px(f.ear), nh4Layer: px(f.nh4), AL, decode });
  b.files.greyHeadWebp = toWebp(b.files.greyHeadPng, { cwebp, dwebp }); b.files.brownHeadWebp = toWebp(b.files.brownHeadPng, { cwebp, dwebp });
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  for (const [k, o] of Object.entries(fx.outputs)) writeFileSync(join(OUT, o.name), b.files[k]);
  const bad = bindingMismatches(fx, b.files), { files, ...report } = b;
  writeFileSync(join(OUT, "d380-report.json"), JSON.stringify({ ...report, outputs: Object.fromEntries(Object.entries(files).map(([k, v]) => [k, sha256(v)])), bound: bad.length === 0 }, null, 1) + "\n");
  if (bad.length) throw new Error("not the excepted heads (D-380 binds only the fixture's hashes): " + bad.join("; "));
  console.log(JSON.stringify({ bound: true, outputs: Object.fromEntries(Object.entries(files).map(([k, v]) => [k, sha256(v)])), v1Failed: report.v1.failed, v2Failed: report.v2.failed, adjust: report.adjust, deviations: report.deviations, finished: report.finished }, null, 1));
}
if (typeof process.argv[1] === "string" && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : String(e)); process.exitCode = 1; });
