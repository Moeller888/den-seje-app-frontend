// D-379 NH-5C — one new Northstar hairstyle, NAPE LOCKS (design C of the NH-5 round), on D-373's shared head base. Deterministic,
// offline; no image call.
//   · the base: D-373's shared head base, rebuilt as northstar-hair-nh5.mjs does (the same pinned private clean head and ear mask);
//   · design C, drawn only from the base's geometry: a centre parting, the forehead open in the middle, soft locks that fall BEHIND the
//     ears down to the jawline. Northstar's standard hair, NH-4 and the live top knot (D-377) are used ONLY to compare (P8);
//   · the LAYER ORDER, fixed before the call (bottom → top):
//       the app's plan: body · shoes · trousers · top · arms · sleeves  →  THE HEAD IMAGE  →  shadows (on the figure's own layers only)
//       inside the head image: the locks (all hair at or below the ear tops, y ≥ 306)  →  the base (face, jaw outline, neck)
//                              →  the front hair (scalp, parting, temples, y < 306)  →  the ears (the base's own pixels)
//     so the locks show along the jaw while the jaw's and the ears' outlines lie in front; the hair continues BEHIND the half-transparent
//     soft edge of each ear and of the jaw (no light seam), and each ear is drawn once, on top;
//   · the call's inputs: Image 1 and Image 3 are NH-5B's own files (design-independent, byte-identical), Image 2 is C's guide;
//   · the post-processing: D-372's V2 lift with C's zone, composed in C's layer order, and the checks P1–P13 fitted to the shape — hair on
//     the ears or over the face is rejected, the planned locks behind the ears and along the jaw are allowed and REQUIRED (P13), local cuts
//     are reported for the parting, the forehead, each temple and each nape (P10);
//   · the rehearsal: twelve simulated results through the checks, and the assembly with a T-shirt, a tank top and a sweater through the
//     app's own northstarCompose (js/avatar-layers.js, read at rehearsal time only — it is not part of the post-processing).
// Hard limits in the layer are only the eyes, the brows (+2 px) and the ears; everything else the result draws is followed and COUNTED.
// The private images stay outside the clones.
// Usage:
//   node tools/avatar/northstar-hair-nh5c.mjs --inputs --clean <clean head png> --ear <ear mask png> --dwebp <dwebp.exe> --out <empty dir outside the repository>
//   node tools/avatar/northstar-hair-nh5c.mjs --post --result <returned png> --base <d373 base png> --ear <ear mask png> --nh4 <D-373 NH-4 grey layer png> --dwebp <dwebp.exe> --out <empty dir outside>
//   node tools/avatar/northstar-hair-nh5c.mjs --rehearsal --base <d373 base png> --ear <ear mask png> --nh4 <D-373 NH-4 grey layer png> --dwebp <dwebp.exe> --out <empty dir outside>
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, mkdtempSync } from "node:fs";
import { join, resolve, dirname, relative, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import * as NH5 from "./northstar-hair-nh5.mjs";
import * as T from "./northstar-hair-template-d371.mjs";
import * as FIG from "./r3-northstar-figure.mjs";
import * as NL from "./r3-northstar-layers.mjs";
import { encodePng, decodePng } from "./r3-hair-tool-v2.mjs";
import { northstarTint, drift } from "./northstar-hair-nh4-post.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DECISION = "D-379";
export const W = 1024, H = 1536, N = W * H, S = 1024, EAR_TOP = 306, MIRROR = 1018;   // mirror axis: the ears' centre (352 + 666) / 2 = 509
export const NAMES = Object.freeze({ base: NH5.NAMES.base, head: NH5.NAMES.head, guide: "nh5c-guide-1024.png", style: NH5.NAMES.style });
export const TOPKNOT_HEAD = "assets/avatar-northstar-hair/head-nh5b-grey-v1.webp";   // the live top knot (D-377), compared with in P8 only
export const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const lum = (P, i) => 0.299 * P[i * 4] + 0.587 * P[i * 4 + 1] + 0.114 * P[i * 4 + 2];
const sat = (P, i) => { const r = P[i * 4], g = P[i * 4 + 1], b = P[i * 4 + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx < 24 ? 0 : (mx - mn) / mx; };
const same = (P, Q, i) => P[i * 4] === Q[i * 4] && P[i * 4 + 1] === Q[i * 4 + 1] && P[i * 4 + 2] === Q[i * 4 + 2] && P[i * 4 + 3] === Q[i * 4 + 3];
const lerp = (pts, v) => { if (v <= pts[0][0]) return pts[0][1]; for (let k = 1; k < pts.length; k++) if (v <= pts[k][0]) { const [a0, b0] = pts[k - 1], [a1, b1] = pts[k]; return b0 + (b1 - b0) * (v - a0) / (a1 - a0); } return pts[pts.length - 1][1]; };
const bump = (d, c, w) => { let e = Math.abs(d - c); if (e > 180) e = 360 - e; return e >= w ? 0 : 0.5 * (1 + Math.cos(Math.PI * e / w)); };

// ── 1. design C, drawn from the base's geometry only ──────────────────────────────────────────────────────────────────
// Base: ears x 352–403 / 615–666, y 305–381; brows top y 247 (left, x 398–482) / 243 (right, x 533–620); face 375–644 wide at the
// temples; the jaw narrows from the ear bottoms (y 381) to the chin (neck from y 430); clothing starts at y ≥ 455 (collar).
export const DESIGN = Object.freeze({
  id: "C", name: "Nakkelokker",
  // the hair's lower edge on the face, left temple → parting → right temple: the forehead is open in the middle (the parting's V at
  // (512, 188)), the hair falls like two soft curtains to the temples and meets each ear at its top
  hairline: [[382, 300], [378, 276], [381, 256], [390, 240], [404, 230], [430, 221], [458, 212], [486, 202], [504, 192], [512, 188], [520, 192], [538, 202], [566, 211], [594, 219], [618, 228], [632, 240], [641, 256], [644, 276], [640, 300]],
  // the parting: from the hairline's V up over the crown, a line with hair on both sides
  parting: [[188, 512], [160, 511], [132, 509]],          // [y, x]
  // the locks' outer edge (left side; the right side mirrors it about x 509), from the temple behind the ear down to the jawline
  lockOuter: [[270, 364], [290, 350], [305, 341], [330, 333], [360, 331], [385, 334], [402, 341], [416, 351]],
  lockEnd: 424,                                            // the tips end at the jawline (chin y ≈ 440, clothing ≥ 455)
  volume: (d) => 10 + 5 * bump(d, 270, 70),                // the soft volume over the skull above the ear tops
});
export const partX = (y) => lerp(DESIGN.parting, y);
export const hairlineY = (x) => (x < DESIGN.hairline[0][0] || x > DESIGN.hairline[DESIGN.hairline.length - 1][0] ? null : lerp(DESIGN.hairline, x));
const lockBottom = (xo) => DESIGN.lockEnd - 6 * Math.sin(Math.PI * (xo - 344) / 26) ** 2;   // soft, rounded tips along the jawline

/** Design C's zone on the figure grid: M (all hair), LOCK (the locks behind the ears), PART (the parting band, ±3 px). */
export function silhouetteC(G, { tips = 0 } = {}) {
  const M = new Uint8Array(N), LOCK = new Uint8Array(N), PART = new Uint8Array(N);
  const wave = (x) => (tips && x >= 398 && x <= 624 ? tips * (1 - Math.abs(((x % 18) / 9) - 1)) : 0);
  const blocked = (i) => G.KEEP[i] && (G.head[i] || !G.EARP[i] || G.EAR[i]);   // outside the head the ring round an ear may hold hair (behind the ear)
  for (let y = 0; y < 470; y++) for (let x = 250; x < 780; x++) {
    const i = y * W + x; if (blocked(i)) continue;
    if (G.head[i]) {
      if (y >= EAR_TOP) continue;                                       // the face below the ear tops: never (the locks hang BEHIND it)
      const hy = hairlineY(x);
      if (hy === null) { if (y <= 300) M[i] = 1; continue; }
      if (y < hy + wave(x)) M[i] = 1;
      continue;
    }
    const d = (Math.atan2(y - G.C[1], x - G.C[0]) * 180 / Math.PI + 360) % 360, r = Math.hypot(x - G.C[0], y - G.C[1]), rh = G.rHead[Math.round(d * 2) % 720];
    if (y < EAR_TOP && r <= rh + DESIGN.volume(d)) M[i] = 1;
    const xo = x < MIRROR / 2 ? x : MIRROR - x;
    if (y >= 270 && xo >= lerp(DESIGN.lockOuter, y) && y <= lockBottom(xo) && xo < 470) { M[i] = 1; LOCK[i] = 1; }
  }
  for (let i = 0; i < N; i++) if (blocked(i)) { M[i] = 0; LOCK[i] = 0; }
  for (let y = 120; y <= 192; y++) { const px = partX(y); for (let x = Math.floor(px - 3); x <= Math.ceil(px + 3); x++) if (Math.abs(x - px) <= 3 && M[y * W + x]) PART[y * W + x] = 1; }
  return { M, LOCK, PART };
}

// ── 2. the layer order: back locks · base · front hair · ears ─────────────────────────────────────────────────────────
/** The head image from a hair layer HL (figure grid, RGBA): everything at or below the ear tops BEHIND the base, the rest in front, the
 *  ears on top; the base itself wherever the layer is empty. Returns { pic, VIS } — VIS: the layer's alpha where it is actually seen. */
// The ears' and the jaw's outlines have a soft, half-transparent outer edge. Hair that stops AT that edge leaves a light seam, so the
// hair continues BEHIND it: every half-transparent pixel of an ear, or of the head at or below the ear tops, with layer hair within 3 px
// gets the mean of that hair behind it (in BACK); the ear and the jaw are still drawn on top. Nothing in front of the base is added.
export function behindFill(base, ear, HL) {
  const F = new Uint8ClampedArray(HL), add = new Uint8Array(N);
  for (let i = 0; i < N; i++) { const a = base[i * 4 + 3], y = (i / W) | 0; if (HL[i * 4 + 3] || a === 0 || a === 255 || !(ear[i * 4 + 3] || y >= EAR_TOP)) continue;
    const x = i % W; let n = 0; const c = [0, 0, 0];
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const k = (y + dy) * W + x + dx; if (HL[k * 4 + 3] >= 128) { for (let q = 0; q < 3; q++) c[q] += HL[k * 4 + q]; n++; } }
    if (n) { F.set([Math.round(c[0] / n), Math.round(c[1] / n), Math.round(c[2] / n), 255], i * 4); add[i] = 1; } }
  return { F, add };
}
export function composeC(base, ear, HL0) {
  const { F: HL, add } = behindFill(base, ear, HL0);
  const BACK = new Uint8ClampedArray(N * 4), FRONT = new Uint8ClampedArray(N * 4), EARTOP = new Uint8ClampedArray(N * 4), VIS = new Uint8Array(N);
  for (let i = 0; i < N; i++) { if (!HL[i * 4 + 3]) continue; (((i / W) | 0) >= EAR_TOP || add[i]) ? BACK.set(HL.subarray(i * 4, i * 4 + 4), i * 4) : FRONT.set(HL.subarray(i * 4, i * 4 + 4), i * 4); }
  const MID = new Uint8ClampedArray(base);   // the base without its ears (each ear is drawn once, on top)
  for (let i = 0; i < N; i++) if (ear[i * 4 + 3]) { EARTOP.set(base.subarray(i * 4, i * 4 + 4), i * 4); MID[i * 4 + 3] = 0; }
  const pic = NL.overStack([BACK, MID, FRONT, EARTOP]);
  for (let i = 0; i < N; i++) { if (HL[i * 4 + 3] === 0) { pic.set(base.subarray(i * 4, i * 4 + 4), i * 4); continue; }
    const hidden = add[i] || ear[i * 4 + 3] > 0 || (((i / W) | 0) >= EAR_TOP && base[i * 4 + 3] >= 250); if (!hidden) VIS[i] = HL[i * 4 + 3]; }
  // the ears in front: an opaque ear pixel is the base's own; a soft-edge ear pixel is exactly the ear over the hair behind it
  const overPx = (u, o) => { const ao = o[3] / 255, au = u[3] / 255, a = ao + au * (1 - ao); return a ? [0, 1, 2].map((c) => Math.round((o[c] * ao + u[c] * au * (1 - ao)) / a)).concat(Math.round(a * 255)) : [0, 0, 0, 0]; };
  let earOpaque = 0, earOpaqueSame = 0, earSoft = 0, earSoftOver = 0;
  for (let i = 0; i < N; i++) { if (!ear[i * 4 + 3]) continue; const a = base[i * 4 + 3];
    if (a === 255) { earOpaque++; if (same(pic, base, i)) earOpaqueSame++; }
    else if (a > 0) { earSoft++; const b4 = base.subarray(i * 4, i * 4 + 4), exp = HL[i * 4 + 3] ? overPx(BACK.subarray(i * 4, i * 4 + 4), b4) : b4; if ([0, 1, 2, 3].every((c) => Math.abs(exp[c] - pic[i * 4 + c]) <= 1)) earSoftOver++; } }
  return { pic, VIS, HL, ears: { earOpaque, earOpaqueSame, earSoft, earSoftOver, filledBehindPx: add.reduce((s, v) => s + v, 0) } };
}

// ── 3. the checks, fitted to the shape ────────────────────────────────────────────────────────────────────────────────
export const GATES = Object.freeze({
  P1: { rule: "registration on the face: |scale − 1| ≤ 0.04, |shift| ≤ 40 px (call frame), mean face error ≤ 14", maxScale: 0.04, maxShift: 40, maxErr: 14 },
  P2: { rule: "scalp covered: ≥ 98 % of the design's scalp has visible hair alpha ≥ 250 (the parting's band ±3 px is not counted)", min: 0.98 },
  P3: { rule: "brows and eyes free: ≤ 10 px of grey hair on the brows' keep-clear zone in the RESULT; 0 px on brows and eyes in the layer; ≥ 6 px gap above each brow", maxRaw: 10, minGap: 6 },
  P4: { rule: "ears and face: in the RESULT ≤ 10 px of grey hair on the ears (their opaque pixels and their skin margin) and ≤ 10 px over the face below the ear tops (3 px inside its outline, the eyes excepted: P3 covers them); no hair on the ears in the layer; the ears in front (an opaque ear pixel is the base's own, a soft-edge ear pixel is exactly the ear over the hair behind it); ≤ 20 px of layer hair (alpha ≥ 32) on the face below the ear tops 3 px inside its outline (it would lie hidden behind the jaw) and ≤ 20 px below the jawline (y ≥ 433)", maxRaw: 10, maxLayer: 20 },
  P5: { rule: "one piece: the largest piece holds ≥ 98 % of the hair", min: 0.98 },
  P6: { rule: "the base is unchanged wherever the composed hair layer is empty (pixel for pixel)" },
  P7: { rule: "greyscale: ≥ 90 % of the lifted hair pixels are neutral grey (saturation < 0.12)", min: 0.9 },
  P8: { rule: "its own look at app size (÷4): silhouette IoU ≤ 0.75 with the standard hair, NH-4 and the live top knot, and ≥ 0.60 with design C", max: 0.75, minDesign: 0.6 },
  P9: { rule: "the shape is followed overall: ≤ 3 % of the result's grey hair lies more than 8 px outside the design's zone", max: 0.03 },
  P10: { rule: "no cut: where the VISIBLE hair ends although the result's grey hair continues (not under an ear), the longest connected run ≤ 6 px, reported for the parting, the forehead, each temple and each nape", maxRun: 6 },
  P11: { rule: "no local spill: the largest connected cluster of grey hair more than 8 px outside the zone ≤ 60 px", max: 60 },
  P12: { rule: "no local hole: the largest connected uncovered piece of the scalp ≤ 40 px (the parting's band excepted)", max: 40 },
  P13: { rule: "the planned nape locks: on each side ≥ 70 % of the lock zone behind the ear (y 330–412) is visible hair, and the lock ends at the jawline (its lowest visible hair at y 405–432)", min: 0.7, endFrom: 405, endTo: 432 },
});
export function cutRegions({ VIS, OF, BR, G }) {
  const hairyRaw = (i) => OF[i * 4 + 3] >= 128 && sat(OF, i) < 0.12 && (BR[i * 4 + 3] < 128 || Math.hypot(OF[i * 4] - BR[i * 4], OF[i * 4 + 1] - BR[i * 4 + 1], OF[i * 4 + 2] - BR[i * 4 + 2]) > 45);
  const cut = new Uint8Array(N);
  for (let i = W; i < N - W; i++) { if (VIS[i] >= 128 || !hairyRaw(i) || G.EAR[i]) continue; for (const q of [i - 1, i + 1, i - W, i + W]) if (VIS[q] >= 128) { cut[i] = 1; break; } }
  const runs = NH5.pieces(cut);
  const where = (r) => { const cx = (r.box[0] + r.box[2]) / 2, cy = (r.box[1] + r.box[3]) / 2;
    if (cy < 250 && Math.abs(cx - 512) <= 30) return "parting"; if (cy >= EAR_TOP) return cx < 509 ? "left nape" : "right nape";
    if (cy >= 180 && cy <= 260 && cx > 398 && cx < 620) return "forehead"; return cx < 509 ? "left temple" : "right temple"; };
  const by = { "parting": 0, "forehead": 0, "left temple": 0, "right temple": 0, "left nape": 0, "right nape": 0 };
  for (const r of runs) { const w = where(r); by[w] = Math.max(by[w], r.px); }
  return { cutEdgePx: runs.reduce((a, r) => a + r.px, 0), longestRun: runs.length ? runs[0].px : 0, longestBy: by, top: runs.slice(0, 6).map((r) => ({ ...r, where: where(r) })) };
}

/** One returned 1024×1024 image → the grey and tinted layers, the head picture in design C's layer order, and C-P1…C-P13. */
export function postProcessC({ result: O, base, ear, G, Z, std, nh4, nh5b }) {
  if (!O || O.length !== S * S * 4) throw new Error("a 1024×1024 RGBA result is required");
  const M = Z.M, t = G.t, EAR = G.EAR;
  // registration on the face (call frame), as D-371/D-375
  const R = T.cropOut(base, 2), flatL = (A, i) => { const a = A[i * 4 + 3] / 255; return lum(A, i) * a + 255 * (1 - a); };
  const pts = []; for (let y = 500; y < 940; y += 3) for (let x = 200; x < 824; x += 3) { const fi = (y >> 1) * W + 256 + (x >> 1); if (R[(y * S + x) * 4 + 3] >= 200 && !EAR[fi] && !M[fi]) pts.push([x, y, flatL(R, y * S + x)]); }
  const cx = 512, cy = 700, samp = (A, x, y) => { const x0 = Math.floor(x), y0 = Math.floor(y); if (x0 < 0 || y0 < 0 || x0 >= S - 1 || y0 >= S - 1) return 255; const ax = x - x0, ay = y - y0, i = y0 * S + x0; return flatL(A, i) * (1 - ax) * (1 - ay) + flatL(A, i + 1) * ax * (1 - ay) + flatL(A, i + S) * (1 - ax) * ay + flatL(A, i + S + 1) * ax * ay; };
  const err = (s, dx, dy, step = 1) => { let e = 0, n = 0; for (let k = 0; k < pts.length; k += step) { const [x, y, l] = pts[k]; e += Math.abs(samp(O, cx + (x - cx) * s + dx, cy + (y - cy) * s + dy) - l); n++; } return e / n; };
  let best = { e: 1e9 }; for (let s = 0.96; s <= 1.0401; s += 0.01) for (let dy = -40; dy <= 40; dy += 4) for (let dx = -40; dx <= 40; dx += 4) { const e = err(s, dx, dy, 5); if (e < best.e) best = { e, s, dx, dy }; }
  let fine = best; for (let s = best.s - 0.01; s <= best.s + 0.0101; s += 0.0025) for (let dy = best.dy - 4; dy <= best.dy + 4; dy++) for (let dx = best.dx - 4; dx <= best.dx + 4; dx++) { const e = err(s, dx, dy, 2); if (e < fine.e) fine = { e, s, dx, dy }; }
  const reg = { scale: +fine.s.toFixed(4), dx: fine.dx, dy: fine.dy, faceErr: +err(fine.s, fine.dx, fine.dy, 1).toFixed(2) };
  const OR = new Uint8ClampedArray(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const sx = cx + (x - cx) * fine.s + fine.dx, sy = cy + (y - cy) * fine.s + fine.dy, x0 = Math.floor(sx), y0 = Math.floor(sy); if (x0 < 0 || y0 < 0 || x0 >= S - 1 || y0 >= S - 1) continue;
    const ax = sx - x0, ay = sy - y0, w4 = [(1 - ax) * (1 - ay), ax * (1 - ay), (1 - ax) * ay, ax * ay], ii = [y0 * S + x0, y0 * S + x0 + 1, (y0 + 1) * S + x0, (y0 + 1) * S + x0 + 1]; let a = 0; const c = [0, 0, 0];
    for (let k = 0; k < 4; k++) { const al = O[ii[k] * 4 + 3] * w4[k]; a += al; for (let q = 0; q < 3; q++) c[q] += O[ii[k] * 4 + q] * al; } if (a > 0) { const j = (y * S + x) * 4; for (let q = 0; q < 3; q++) OR[j + q] = Math.round(c[q] / a); OR[j + 3] = Math.round(a); } }
  const OF = T.mapBack(OR), BR = T.mapBack(T.cropOut(base, 2));
  const dist = new Float32Array(N).fill(1e9); for (let i = 0; i < N; i++) if (M[i]) dist[i] = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; dist[i] = Math.min(dist[i], dist[i - 1] + 1, dist[i - W] + 1, dist[i - W - 1] + 1.41, dist[i - W + 1] + 1.41); }
  for (let y = H - 2; y > 0; y--) for (let x = W - 2; x > 0; x--) { const i = y * W + x; dist[i] = Math.min(dist[i], dist[i + 1] + 1, dist[i + W] + 1, dist[i + W + 1] + 1.41, dist[i + W - 1] + 1.41); }
  const onWhite = (Q, i) => { const a = Q[i * 4 + 3] / 255; return [0, 1, 2].map((q) => Q[i * 4 + q] * a + 255 * (1 - a)); };
  const hairy = (i) => { if (OF[i * 4 + 3] < 128 || sat(OF, i) >= 0.12) return false; const o = onWhite(OF, i), b = onWhite(BR, i); if (Math.hypot(o[0] - b[0], o[1] - b[1], o[2] - b[2]) <= 45) return false; return 0.299 * b[0] + 0.587 * b[1] + 0.114 * b[2] > 110; };
  const raw = { brows: 0, ears: 0, face: 0, spill: 0, total: 0 }, SPILL = new Uint8Array(N);
  const notHead = new Uint8Array(N); for (let i = 0; i < N; i++) if (!G.head[i]) notHead[i] = 1; const rim = G.dil(notHead, 3);
  const earSoft = (i) => EAR[i] && base[i * 4 + 3] < 255;
  for (let i = 0; i < N; i++) { if (!hairy(i)) continue; raw.total++; const y = (i / W) | 0;
    if (G.EARP[i] && (EAR[i] || G.head[i])) { if (!earSoft(i)) raw.ears++; } else if (G.BROWZ[i]) raw.brows++; else if (G.head[i] && !rim[i] && !t.z.eyesClear[i] && y > 310 && y < 470) raw.face++; else if (G.head[i] && y > 310) { /* the contour band: in front */ } else if (!G.KEEP[i] && dist[i] > 8) { raw.spill++; SPILL[i] = 1; } }
  // V2 lift (D-372) with C's zone
  const HARD = new Uint8Array(N); for (let i = 0; i < N; i++) if (t.z.eyesClear[i] || EAR[i]) HARD[i] = 1;
  for (let i = 0; i < N; i++) if (G.BROW[i]) { const x = i % W, y = (i / W) | 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) HARD[(y + dy) * W + x + dx] = 1; }
  const differs = (i) => BR[i * 4 + 3] < 128 || Math.hypot(OF[i * 4] - BR[i * 4], OF[i * 4 + 1] - BR[i * 4 + 1], OF[i * 4 + 2] - BR[i * 4 + 2]) > 45;
  const strong = new Uint8Array(N); let greyN = 0, cand = 0;
  for (let i = 0; i < N; i++) { if (dist[i] > 8 || G.KEEP[i] || OF[i * 4 + 3] < 128 || !differs(i)) continue; cand++; if (sat(OF, i) < 0.12) { strong[i] = 1; greyN++; } }
  const isCand = (i) => dist[i] <= 40 && !HARD[i] && OF[i * 4 + 3] >= 128 && sat(OF, i) < 0.12 && differs(i);
  const grown = new Uint8Array(N), st = []; for (let i = 0; i < N; i++) if (strong[i] && !HARD[i]) { grown[i] = 1; st.push(i); }
  while (st.length) { const k = st.pop(); for (const q of [k - 1, k + 1, k - W, k + W, k - W - 1, k - W + 1, k + W - 1, k + W + 1]) if (q >= 0 && q < N && !grown[q] && isCand(q)) { grown[q] = 1; st.push(q); } }
  const GL = new Uint8ClampedArray(N * 4);
  for (let i = 0; i < N; i++) { if (grown[i]) { const g = Math.round(lum(OF, i)); GL.set([g, g, g, 255], i * 4); continue; }
    if (HARD[i] || OF[i * 4 + 3] === 0) continue; const x = i % W, y = (i / W) | 0; let hs = [0, 0, 0], n = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const k = (y + dy) * W + x + dx; if (grown[k]) { for (let q = 0; q < 3; q++) hs[q] += OF[k * 4 + q]; n++; } } if (!n) continue; hs = hs.map((v) => v / n);
    let a; if (base[i * 4 + 3] < 128) a = OF[i * 4 + 3] / 255; else { let num = 0, den = 0; for (let q = 0; q < 3; q++) { num += (OF[i * 4 + q] - base[i * 4 + q]) * (hs[q] - base[i * 4 + q]); den += (hs[q] - base[i * 4 + q]) ** 2; } a = den > 0 ? Math.max(0, Math.min(1, num / den)) : 0; }
    if (a > 0.04) { const g = Math.round(0.299 * hs[0] + 0.587 * hs[1] + 0.114 * hs[2]); GL.set([g, g, g, Math.round(a * 255)], i * 4); } }
  { const m = new Uint8Array(N); for (let i = 0; i < N; i++) if (GL[i * 4 + 3]) m[i] = 1; const lab = new Int32Array(N); let nn = 0;
    for (let i = 0; i < N; i++) if (m[i] && !lab[i]) { nn++; const s2 = [i], all = []; lab[i] = nn; while (s2.length) { const k = s2.pop(); all.push(k); for (const q of [k - 1, k + 1, k - W, k + W, k - W - 1, k - W + 1, k + W - 1, k + W + 1]) if (m[q] && !lab[q]) { lab[q] = nn; s2.push(q); } } if (all.length < 80) for (const k of all) GL[k * 4 + 3] = 0; } }
  for (let i = 0; i < N; i++) if (EAR[i]) GL[i * 4 + 3] = 0;
  const HL = northstarTint(GL), { pic, VIS, ears, HL: HLF } = composeC(base, ear, HL), A = (i) => HL[i * 4 + 3], g = {}, Gt = GATES;
  g.P1 = { ...reg, pass: Math.abs(reg.scale - 1) <= Gt.P1.maxScale && Math.abs(reg.dx) <= Gt.P1.maxShift && Math.abs(reg.dy) <= Gt.P1.maxShift && reg.faceErr <= Gt.P1.maxErr };
  const nonHairHead = new Uint8Array(N); for (let i = 0; i < N; i++) if (G.head[i] && !M[i] && ((i / W) | 0) > 190) nonHairHead[i] = 1;
  const nearFace = G.dil(nonHairHead, 14), SCALP = new Uint8Array(N); for (let i = 0; i < N; i++) if (M[i] && G.head[i] && !Z.PART[i] && !nearFace[i] && ((i / W) | 0) < 290) SCALP[i] = 1;
  { let n = 0, c = 0; const HOLE = new Uint8Array(N); for (let i = 0; i < N; i++) if (SCALP[i]) { n++; if (VIS[i] >= 250) c++; else HOLE[i] = 1; }
    g.P2 = { covered: +(c / n).toFixed(4), pass: c / n >= Gt.P2.min };
    const holes = NH5.pieces(HOLE, W, H, false); g.P12 = { largestHolePx: holes.length ? holes[0].px : 0, at: holes.length ? holes[0].box : null, pass: (holes.length ? holes[0].px : 0) <= Gt.P12.max }; }
  { let onBrow = 0, eyes = 0; const gap = { left: 1e9, right: 1e9 }; for (let i = 0; i < N; i++) { if (G.BROW[i] && A(i) >= 128) onBrow++; if (t.z.eyesClear[i] && A(i) >= 128) eyes++; }
    for (const sd of ["left", "right"]) for (let i = 0; i < N; i++) if (t.z.brows[sd][i]) { const x = i % W, y = (i / W) | 0; for (let k = 1; k < 30; k++) if (A((y - k) * W + x) >= 128) { gap[sd] = Math.min(gap[sd], k); break; } }
    g.P3 = { rawOnBrowsPx: raw.brows, layerOnBrowsPx: onBrow, layerOnEyesPx: eyes, gapPx: gap, pass: raw.brows <= Gt.P3.maxRaw && onBrow === 0 && eyes === 0 && gap.left >= Gt.P3.minGap && gap.right >= Gt.P3.minGap }; }
  { let onEar = 0, face = 0, below = 0; for (let i = 0; i < N; i++) { const y = (i / W) | 0;
      if (EAR[i] && A(i)) onEar++;
      if (G.head[i] && !rim[i] && !EAR[i] && y > 310 && A(i) >= 32) face++; if (y >= 433 && A(i) >= 32) below++; }
    g.P4 = { rawOnEarsPx: raw.ears, rawOverFacePx: raw.face, layerOnEarsPx: onEar, earsInFront: ears, layerHiddenBehindFacePx: face, layerBelowJawlinePx: below,
      pass: raw.ears <= Gt.P4.maxRaw && raw.face <= Gt.P4.maxRaw && onEar === 0 && ears.earOpaqueSame === ears.earOpaque && ears.earSoftOver === ears.earSoft && face <= Gt.P4.maxLayer && below <= Gt.P4.maxLayer }; }
  { const m = new Uint8Array(N); let tot = 0; for (let i = 0; i < N; i++) if (A(i) >= 128) { m[i] = 1; tot++; } const c = NH5.pieces(m, W, H, false); g.P5 = { hairPx: tot, largestShare: tot ? +(c[0].px / tot).toFixed(4) : 0, pass: tot > 0 && c[0].px / tot >= Gt.P5.min }; }
  { let n = 0, s = 0; for (let i = 0; i < N; i++) if (HLF[i * 4 + 3] === 0) { n++; if (same(pic, base, i)) s++; } g.P6 = { px: n, identical: s, pass: n === s }; }
  g.P7 = { candidates: cand, greyShare: cand ? +(greyN / cand).toFixed(4) : 0, pass: cand > 0 && greyN / cand >= Gt.P7.min };
  { const me = new Uint8Array(N); for (let i = 0; i < N; i++) if (VIS[i] >= 128) me[i] = 1;
    const iou = { standard: +NH5.appIoU(G, me, std).toFixed(3), nh4: +NH5.appIoU(G, me, nh4).toFixed(3), topknot: +NH5.appIoU(G, me, nh5b).toFixed(3), design: +NH5.appIoU(G, me, M).toFixed(3) };
    g.P8 = { iou, pass: iou.standard <= Gt.P8.max && iou.nh4 <= Gt.P8.max && iou.topknot <= Gt.P8.max && iou.design >= Gt.P8.minDesign }; }
  g.P9 = { rawGreyPx: raw.total, spillPx: raw.spill, spillShare: raw.total ? +(raw.spill / raw.total).toFixed(4) : 0, pass: raw.total === 0 || raw.spill / raw.total <= Gt.P9.max };
  { const c = cutRegions({ VIS, OF, BR, G }); g.P10 = { ...c, pass: c.longestRun <= Gt.P10.maxRun }; }
  { const c = NH5.pieces(SPILL); g.P11 = { largestSpillClusterPx: c.length ? c[0].px : 0, at: c.length ? c[0].box : null, pass: (c.length ? c[0].px : 0) <= Gt.P11.max }; }
  { const side = {}; for (const [k, left] of [["left", true], ["right", false]]) { let n = 0, c = 0, low = -1;
      for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0; if ((x < 509) !== left) continue; if (VIS[i] >= 128 && y >= EAR_TOP && !G.head[i]) low = Math.max(low, y);
        if (Z.LOCK[i] && !G.head[i] && !G.EARP[i] && y >= 330 && y <= 412) { n++; if (VIS[i] >= 128) c++; } }
      side[k] = { lockZonePx: n, shown: n ? +(c / n).toFixed(4) : 0, lowestY: low, pass: n > 0 && c / n >= Gt.P13.min && low >= Gt.P13.endFrom && low <= Gt.P13.endTo }; }
    g.P13 = { ...side, pass: side.left.pass && side.right.pass }; }
  const failed = Object.keys(GATES).filter((k) => !g[k].pass);
  return { report: { verdict: failed.length ? "REJECTED" : "PASSES CHECKS — the owner's visual review next", failed, checks: g }, GL, HL, pic, VIS };
}

// ── 4. the painted layer (the rehearsal's simulated results) and the cases ───────────────────────────────────────────────────────────────────
/** A painted grey hair layer for zone `m` (the sketch, and the rehearsal's simulated result): shaded by distance from its edge, a dark
 *  2 px outline, strands that fan out from the parting over the skull and fall straight down in the locks; the parting is left open. */
export function paintLayer(m, { part = true, G = null } = {}) {
  // no outline where the hair goes BEHIND the ear or the jaw (they lie in front and carry their own outline)
  const behind = (i) => G && (G.EAR[i] || (G.head[i] && ((i / W) | 0) >= EAR_TOP));
  const D = new Float32Array(N).fill(1e9); for (let i = 0; i < N; i++) if (!m[i] && !behind(i)) D[i] = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; if (D[i]) D[i] = Math.min(D[i], D[i - 1] + 1, D[i - W] + 1); }
  for (let y = H - 2; y > 0; y--) for (let x = W - 2; x > 0; x--) { const i = y * W + x; if (D[i]) D[i] = Math.min(D[i], D[i + 1] + 1, D[i + W] + 1); }
  const L = new Uint8ClampedArray(N * 4);
  for (let i = 0; i < N; i++) { if (!m[i]) continue; const x = i % W, y = (i / W) | 0;
    if (part && y >= 132 && y <= 190 && Math.abs(x - partX(y)) <= 1) continue;        // the parting: the skull shows through
    const xo = x < MIRROR / 2 ? x : MIRROR - x, inLock = y >= 300;
    const phase = inLock ? xo / 6 + Math.sin(y / 34) * 1.5 : Math.atan2(y - 110, Math.abs(x - partX(Math.min(190, Math.max(132, y))))) * 26;
    const nearPart = !inLock && Math.abs(x - partX(Math.min(190, Math.max(132, y)))) <= 4 ? -30 : 0;
    const g = D[i] <= 2 ? 34 : Math.round(Math.max(40, Math.min(225, 92 + 70 * Math.min(1, D[i] / 22) + 26 * Math.sin(phase) + nearPart)));
    L.set([g, g, g, 255], i * 4); }
  return L;
}
/** The model's "result" for a grey layer: the head picture in C's layer order, in the call frame (×2). */
export const resultOf = (base, ear, GL) => T.cropOut(composeC(base, ear, GL).pic, 2);

export const REHEARSAL = Object.freeze([
  { key: "A", what: "exact, with forehead tips and the locks behind both ears", expect: [], dress: "passes" },
  { key: "B", what: "moved +10/−6 px and scaled 1.02", expect: [] },
  { key: "C", what: "a tuft from the parting down over the forehead between the brows (a local cut at the parting)", expect: ["P10"], cutAt: "parting" },
  { key: "D", what: "grey painted over the right ear", expect: ["P4"] },
  { key: "E", what: "the left lock laid forward over the cheek and the jaw (hair over the face)", expect: ["P4"] },
  { key: "F", what: "the right temple's lock drawn down over the brow's end (a local cut at the temple)", expect: ["P3", "P10"], cutAt: "right temple" },
  { key: "G", what: "the right lock too long: down over the collar and the shoulder (a local cut at the nape)", expect: ["P4", "P10"], cutAt: "right nape", dress: "rejected" },
  { key: "H", what: "one loose tuft outside the zone", expect: ["P11"] },
  { key: "I", what: "one hole in the scalp", expect: ["P12"] },
  { key: "J", what: "no locks: the hair ends at the ear tops", expect: ["P13"] },
  { key: "K", what: "the standard hair's silhouette", expect: ["P8"] },
  { key: "L", what: "no hair", expect: ["P2", "P5", "P7", "P13"] },
]);
export function cases({ base, ear, G, std }) {
  const Z = silhouetteC(G), tips = silhouetteC(G, { tips: 5 });
  const add = (m, f) => { const o = new Uint8Array(m); for (let y = 0; y < 600; y++) for (let x = 250; x < 780; x++) if (f(x, y)) o[y * W + x] = 1; return o; };
  const sub = (m, f) => { const o = new Uint8Array(m); for (let y = 0; y < 600; y++) for (let x = 250; x < 780; x++) if (f(x, y)) o[y * W + x] = 0; return o; };
  const res = (m) => resultOf(base, ear, paintLayer(m, { G })), onEar = (r) => { const o = new Uint8ClampedArray(r); for (let y = 2 * 300; y <= 2 * 335; y++) for (let x = 2 * (625 - 256); x <= 2 * (680 - 256); x++) { const fi = (y >> 1) * W + 256 + (x >> 1); if (ear[fi * 4 + 3]) o.set([70, 70, 70, 255], (y * S + x) * 4); } return o; };
  const overFace = (r) => { const o = new Uint8ClampedArray(r); for (let y = 2 * 330; y <= 2 * 420; y++) for (let x = 2 * (404 - 256); x <= 2 * (440 - 256); x++) { const fi = (y >> 1) * W + 256 + (x >> 1); if (G.head[fi] && !G.EARP[fi] && !G.t.z.eyesClear[fi]) { const gg = 110 + 30 * Math.sin(x / 6); o.set([gg, gg, gg, 255], (y * S + x) * 4); } } return o; };
  return {
    Z, tips,
    img: {
      A: () => res(tips.M),
      B: () => drift(res(tips.M), 1.02, 10, -6),
      C: () => res(add(tips.M, (x, y) => x >= 497 && x <= 527 && y >= 186 && y <= 262 && !G.t.z.eyesClear[y * W + x] && !G.BROWZ[y * W + x])),
      D: () => onEar(res(tips.M)),
      E: () => overFace(res(tips.M)),
      F: () => res(add(tips.M, (x, y) => x >= 600 && x <= 630 && y >= 236 && y <= 300 && !G.EARP[y * W + x])),
      G: () => res(add(tips.M, (x, y) => x >= 614 && x <= 690 && y >= 400 && y <= 500 && !G.head[y * W + x])),
      H: () => res(add(tips.M, (x, y) => Math.hypot(x - 440, y - 92) <= 7)),
      I: () => res(sub(tips.M, (x, y) => x >= 540 && x < 570 && y >= 160 && y < 164)),
      J: () => res(sub(tips.M, (x, y) => y >= EAR_TOP && !G.head[y * W + x])),
      K: () => res(std),
      L: () => T.cropOut(base, 2),
    },
  };
}


// ── 5. the assembly with the app's own compositing: T-shirt, tank top, sweater ───────────────────────────────────────────
export const TOPS = Object.freeze([["T-shirt", "top-tee-hip-cream"], ["tanktop", "top-tank-navy"], ["sweater", "top-sweater-ls2-heather"]]);
export const DRESS_GATES = Object.freeze({
  G1: "no lock over the clothes: 0 px where the hair changes the head image and the clothes (or the arms) lie under it",
  G2: "the ears in front: every opaque ear pixel of the dressed figure is as with the bald base (the soft edge shows the ear over the hair)",
  G3: "the jaw and the face in front: every opaque face pixel below the ear tops is as with the bald base",
  G4: "only the hair changes: 0 px changed outside the hair layer",
  G5: "the locks show along the jaw: ≥ 300 visible px per side in the band y 385–424",
  G6: "room to the clothes: ≥ 20 px from the lowest lock to the clothes' top edge in the same column",
});
/** The figure exactly as the app composes it (northstarCompose of js/avatar-layers.js), with `head` (RGBA, figure grid) in place of the
 *  head layer, or without any head (what lies under it). `AL` is the app module, `decode(rel)` decodes a tracked WebP layer. */
export function figure(AL, decode, topId, head, { withoutHead = false } = {}) {
  const o = AL.NORTHSTAR_OUTFITS[AL.NORTHSTAR_START_OUTFIT], plan = AL.northstarPlanFor({ ...o, top: topId }), today = "/assets/avatar-northstar/" + AL.NORTHSTAR_FIGURE.head;
  if (!plan || !plan.some((s) => s.op === "draw" && s.src === today)) throw new Error("no head in the plan of " + topId);
  const steps = plan.filter((s) => !(withoutHead && s.src === today)).map((s) => (s.src === today ? { ...s, src: "@head" } : s));
  return AL.northstarCompose(steps, (src) => (src === "@head" ? head : decode(src.replace(/^\//, ""))), N);
}
/** G1–G6 for one head picture (`pic`, with its composed hair layer `HL`) on the three tops. */
export function dress({ AL, decode, base, ear, HL, pic }) {
  const out = {};
  for (const [name, top] of TOPS) {
    const F0 = figure(AL, decode, top, base), FC = figure(AL, decode, top, pic), U = figure(AL, decode, top, null, { withoutHead: true });
    let g1 = 0, g2 = 0, g2n = 0, g3 = 0, g3n = 0, g4 = 0; const g5 = { left: 0, right: 0 }; let gap = 1e9;
    for (let i = 0; i < N; i++) { const y = (i / W) | 0, x = i % W, ch = !same(F0, FC, i), hair = HL[i * 4 + 3] > 0, isEar = ear[i * 4 + 3] > 0;
      if (ch && hair && U[i * 4 + 3] >= 8) g1++;
      if (isEar && base[i * 4 + 3] === 255) { g2n++; if (ch) g2++; }
      if (y >= EAR_TOP && base[i * 4 + 3] === 255 && !isEar) { g3n++; if (ch) g3++; }
      if (ch && !hair) g4++;
      if (ch && hair && y >= 385 && y <= 424) g5[x < 509 ? "left" : "right"]++; }
    for (let x = 300; x < 720; x++) { let low = -1; for (let y = EAR_TOP; y < 520; y++) { const i = y * W + x; if (HL[i * 4 + 3] > 0 && !same(F0, FC, i)) low = y; } if (low < 0) continue;
      let cloth = -1; for (let y = low + 1; y < 700; y++) if (U[(y * W + x) * 4 + 3] >= 8) { cloth = y; break; } if (cloth > 0) gap = Math.min(gap, cloth - low); }
    out[name] = { G1_locksOverClothesPx: g1, G2_opaqueEarPxChanged: g2, G2_opaqueEarPx: g2n, G3_facePxChanged: g3, G3_facePx: g3n, G4_changedOutsideHairPx: g4, G5_locksAlongJawPx: g5, G6_minGapToClothesPx: gap === 1e9 ? null : gap,
      pass: g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5.left >= 300 && g5.right >= 300 && gap >= 20 };
  }
  return out;
}

// ── 6. the inputs and the rehearsal ──────────────────────────────────────────────────────────────────────────────────────
const K = Object.freeze({ zone: [120, 160, 225], lock: [70, 185, 165], keep: [225, 50, 50], line: [30, 50, 140] });
/** Image 2: the base faded; C's front zone (blue), the locks behind the ears (turquoise), the hairline and the parting (dark blue, a dot
 *  where the hair meets each ear's top), keep-clear on brows, eyes and both ears (red); in the D-371 square ×2. */
export function guideImage(base, ear) {
  const G = NH5.geometry(base, ear), Z = silhouetteC(G), Gd = new Uint8ClampedArray(N * 4);
  for (let i = 0; i < N; i++) { const a = base[i * 4 + 3] / 255; for (let c = 0; c < 3; c++) { const v = base[i * 4 + c] * a + 255 * (1 - a); Gd[i * 4 + c] = Math.round(255 - (255 - v) * 0.4); } Gd[i * 4 + 3] = 255; }
  const tint = (m, rgb, k) => { for (let i = 0; i < N; i++) if (m[i]) for (let c = 0; c < 3; c++) Gd[i * 4 + c] = Math.round(Gd[i * 4 + c] * (1 - k) + rgb[c] * k); };
  tint(Z.M.map((v, i) => (v && !Z.LOCK[i] ? 1 : 0)), K.zone, 0.42); tint(Z.LOCK, K.lock, 0.5); tint(G.KEEP, K.keep, 0.6);
  const dot = (cx, cy, r, rgb) => { for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) Gd.set([...rgb, 255], (y * W + x) * 4); };
  const line = (pts) => { for (let k = 1; k < pts.length; k++) { const [x0, y0] = pts[k - 1], [x1, y1] = pts[k], n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2); for (let s = 0; s <= n; s++) dot(Math.round(x0 + (x1 - x0) * s / n), Math.round(y0 + (y1 - y0) * s / n), 1, K.line); } };
  line(DESIGN.hairline); line(DESIGN.parting.map(([y, x]) => [x, y])); dot(...DESIGN.hairline[0], 4, K.line); dot(...DESIGN.hairline[DESIGN.hairline.length - 1], 4, K.line);
  return T.cropOut(Gd, 2);
}
/** The live top knot's hair (D-377's grey head minus the base, outside the ears): P8's third comparison. */
export function topknotMask(base, ear, topknotHead) { const m = new Uint8Array(N); for (let i = 0; i < N; i++) if (!same(topknotHead, base, i) && topknotHead[i * 4 + 3] >= 128 && !ear[i * 4 + 3]) m[i] = 1; return m; }
/** Runs the twelve cases; every expected gate must fail (a cut where it is), the exact cases must pass; A and G are also dressed. */
export function rehearsal({ base, ear, nh4, nh5b, AL, decode }) {
  const G = NH5.geometry(base, ear), std = NH5.alphaMask(FIG.buildFigure().layers.hair), C = cases({ base, ear, G, std }), rows = [];
  for (const c of REHEARSAL) {
    const r = postProcessC({ result: C.img[c.key](), base, ear, G, Z: C.Z, std, nh4, nh5b }), got = r.report.failed, k = r.report.checks;
    const cutOk = !c.cutAt || k.P10.longestBy[c.cutAt] > GATES.P10.maxRun;
    const asExpected = (c.expect.length ? c.expect.every((p) => got.includes(p)) : got.length === 0) && cutOk;
    const row = { case: c.key, what: c.what, expected: c.expect, cutAt: c.cutAt || null, failed: got, asExpected,
      measured: { P1: [k.P1.scale, k.P1.dx, k.P1.dy], P2: k.P2.covered, P3: [k.P3.rawOnBrowsPx, k.P3.gapPx.left, k.P3.gapPx.right], P4: { ears: k.P4.rawOnEarsPx, overFace: k.P4.rawOverFacePx, hiddenBehindFace: k.P4.layerHiddenBehindFacePx, belowJaw: k.P4.layerBelowJawlinePx },
        P8: k.P8.iou, P9: k.P9.spillShare, P10: k.P10.longestBy, P11: k.P11.largestSpillClusterPx, P12: k.P12.largestHolePx, P13: { left: [k.P13.left.shown, k.P13.left.lowestY], right: [k.P13.right.shown, k.P13.right.lowestY] } } };
    if (c.dress) { row.assembly = dress({ AL, decode, base, ear, HL: composeC(base, ear, r.HL).HL, pic: r.pic }); row.assemblyAsExpected = Object.values(row.assembly).every((a) => a.pass === (c.dress === "passes")); }
    rows.push(row);
  }
  return { rows, allAsExpected: rows.every((r) => r.asExpected && r.assemblyAsExpected !== false) };
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2), arg = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
  const outside = (d) => { if (!d) return false; const r = relative(ROOT, resolve(d)); return r.startsWith("..") || isAbsolute(r); };
  const OUT = arg("--out"); if (!OUT || !outside(OUT)) throw new Error("--out <empty directory outside the repository>");
  if (existsSync(OUT) && readdirSync(OUT).length) throw new Error("output directory not empty");
  const px = (f) => { if (!outside(f)) throw new Error("the private images stay outside the repository: " + f); return decodePng(readFileSync(f)).px; };
  const dwebp = arg("--dwebp"); if (!dwebp || !existsSync(dwebp)) throw new Error("--dwebp <dwebp.exe> is required");
  const tmp = mkdtempSync(join(tmpdir(), "nh5c-")), cache = new Map(); let n = 0;
  const decode = (rel) => { if (!cache.has(rel)) { const p = join(tmp, (n++) + ".png"); execFileSync(dwebp, ["-quiet", join(ROOT, ...rel.split("/")), "-o", p]); cache.set(rel, decodePng(readFileSync(p)).px); } return cache.get(rel); };
  if (args.includes("--inputs")) {
    const clean = arg("--clean"), ear = arg("--ear"); if (!clean || !ear) throw new Error("--inputs --clean <png> --ear <png> --dwebp <exe> --out <dir>");
    const fx = JSON.parse(readFileSync(join(ROOT, ...NH5.D373_FIXTURE.split("/")), "utf8"));
    for (const [role, f] of [["clean", clean], ["ear", ear]]) if (sha256(readFileSync(f)) !== fx.inputs.find((i) => i.role === role).sha256) throw new Error(role + " is not D-373's pinned file");
    if (sha256(readFileSync(join(ROOT, ...NH5.APP_HEAD.split("/")))) !== fx.appHead.sha256) throw new Error(NH5.APP_HEAD + " is not D-373's pinned file");
    const base = NH5.d373Base({ clean: px(clean), appHead: decode(NH5.APP_HEAD) });
    const check = NH5.baseCheck(base, decode(NH5.NH4_HEADS.grey), decode(NH5.NH4_HEADS.brown)); if (!check.pass) throw new Error("the base is not D-373's: " + JSON.stringify(check));
    const E = px(ear), style = NH5.styleImage(NH5.STYLE_LAYERS.map((f) => decode("assets/avatar-northstar/" + f)));
    mkdirSync(OUT, { recursive: true });
    const files = { [NAMES.base]: encodePng(W, H, base), [NAMES.head]: encodePng(S, S, NH5.inputImages(base, E).head), [NAMES.guide]: encodePng(S, S, guideImage(base, E)), [NAMES.style]: encodePng(S, S, style) };
    for (const [k, b] of Object.entries(files)) writeFileSync(join(OUT, k), b);
    console.log(JSON.stringify({ baseCheck: check, files: Object.fromEntries(Object.entries(files).map(([k, b]) => [k, { bytes: b.length, sha256: sha256(b) }])) }, null, 1));
    return;
  }
  const base = px(arg("--base")), ear = px(arg("--ear")), nh4 = NH5.alphaMask(px(arg("--nh4"))), nh5b = topknotMask(base, ear, decode(TOPKNOT_HEAD));
  mkdirSync(OUT, { recursive: true });
  if (args.includes("--post")) {
    const G = NH5.geometry(base, ear), Z = silhouetteC(G), std = NH5.alphaMask(FIG.buildFigure().layers.hair);
    const { report, GL, HL, pic } = postProcessC({ result: px(arg("--result")), base, ear, G, Z, std, nh4, nh5b });
    writeFileSync(join(OUT, "nh5c-hair-grey-layer.png"), encodePng(W, H, GL)); writeFileSync(join(OUT, "nh5c-hair-layer.png"), encodePng(W, H, HL)); writeFileSync(join(OUT, "nh5c-on-base-full.png"), encodePng(W, H, pic));
    writeFileSync(join(OUT, "checks.json"), JSON.stringify(report, null, 1) + "\n"); console.log(JSON.stringify({ verdict: report.verdict, failed: report.failed }));
    return;
  }
  if (args.includes("--rehearsal")) {
    const AL = await import(pathToFileURL(join(ROOT, "js", "avatar-layers.js")).href);
    const r = rehearsal({ base, ear, nh4, nh5b, AL, decode });
    writeFileSync(join(OUT, "rehearsal.json"), JSON.stringify(r.rows, null, 1) + "\n");
    for (const row of r.rows) console.log((row.asExpected && row.assemblyAsExpected !== false ? "OK   " : "FAIL ") + row.case + " " + row.what + " | expected " + (row.expected.join(",") || "pass") + " | failed " + (row.failed.join(",") || "none")
      + (row.cutAt ? " | P10 " + row.cutAt + " " + row.measured.P10[row.cutAt] + " px" : "") + (row.assembly ? " | assembly " + Object.entries(row.assembly).map(([k, v]) => k + " " + (v.pass ? "passes" : "rejected")).join(", ") : ""));
    if (!r.allAsExpected) process.exitCode = 1;
    return;
  }
  throw new Error("--inputs, --post or --rehearsal");
}
if (typeof process.argv[1] === "string" && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : String(e)); process.exitCode = 1; });
