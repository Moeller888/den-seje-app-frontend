// D-372 — one-time exception for D-371 NH-4's temple variant. Deterministic, offline; no image call. The raw image, the clean head, the layers
// and every composite stay outside the clones. From NH-4's one returned image the candidate is rebuilt in one go:
//   1. V2 extraction of the UNTOUCHED raw image: northstar-hair-nh4-post.mjs's method, except that the lifted layer grows from its grey core
//      through the result's own connected grey hair out to the visible tips (hard limits only: the eyes, the brows +2 px, the ears);
//   2. the temple adjustment: ONLY the left temple tip's own hair pixels (figure x 380–400, rows 290–323) are compressed into rows 290–310;
//      vacated pixels take the clean head's pixels and nothing else in the raw image changes;
//   3. V2 and P1–P10 on the adjusted copy, with the untouched image's registration;
//   4. one layer in its original grey and in Northstar's brown (one alpha channel), each composed on the clean head.
// P1–P9 keep NH-4's thresholds: GATES is imported from northstar-hair-nh4-post.mjs, which stays unchanged and locked by plan-nh4-v1.json.
// P10 is new. The exception binds ONLY the full hashes in exception-d372-v1.json; the command line refuses any other input or output.
// Usage: node tools/avatar/northstar-hair-nh4-exception-d372.mjs --raw <nh.image-1.png> --base <clean head png> --ear <ear-on-top mask png>
//          --swept <side-swept hair layer png> --out <empty dir outside the repository>
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, resolve, dirname, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import * as T from "./northstar-hair-template-d371.mjs";
import * as FIG from "./r3-northstar-figure.mjs";
import * as NL from "./r3-northstar-layers.mjs";
import { encodePng, decodePng } from "./r3-hair-tool-v2.mjs";
import { buildZones } from "./northstar-hair-nh4-zones.mjs";
import { GATES, northstarTint } from "./northstar-hair-nh4-post.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const FIXTURE = "tools/avatar/fixtures/northstar-hair-d371/exception-d372-v1.json";
const W = 1024, H = 1536, N = W * H, S = 1024;

const lum = (P, i) => 0.299 * P[i * 4] + 0.587 * P[i * 4 + 1] + 0.114 * P[i * 4 + 2];
const sat = (P, i) => { const r = P[i * 4], g = P[i * 4 + 1], b = P[i * 4 + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx < 24 ? 0 : (mx - mn) / mx; };
const same = (P, Q, i) => P[i * 4] === Q[i * 4] && P[i * 4 + 1] === Q[i * 4 + 1] && P[i * 4 + 2] === Q[i * 4 + 2] && P[i * 4 + 3] === Q[i * 4 + 3];

function sample(A, sx, sy, o, j) {
  const x0 = Math.floor(sx), y0 = Math.floor(sy); if (x0 < 0 || y0 < 0 || x0 >= S - 1 || y0 >= S - 1) return;
  const ax = sx - x0, ay = sy - y0, w4 = [(1 - ax) * (1 - ay), ax * (1 - ay), (1 - ax) * ay, ax * ay], ii = [y0 * S + x0, y0 * S + x0 + 1, (y0 + 1) * S + x0, (y0 + 1) * S + x0 + 1]; let a = 0; const c = [0, 0, 0];
  for (let k = 0; k < 4; k++) { const al = A[ii[k] * 4 + 3] * w4[k]; a += al; for (let q = 0; q < 3; q++) c[q] += A[ii[k] * 4 + q] * al; }
  if (a > 0) { for (let q = 0; q < 3; q++) o[j + q] = Math.round(c[q] / a); o[j + 3] = Math.round(a); }
}

export const P10 = Object.freeze({ rule: "no contiguous cut: where the layer ends although the result's grey hair continues (not under an ear), the longest connected run of such edge pixels ≤ 6 px; reported for the forehead (y 200–250) and each temple separately", maxRun: 6 });
/** P10: the edge pixels where the layer ends but the result's grey hair continues just beyond (outside the ears), grouped in 8-connected runs. */
export function cutCheck({ HL, OF, base, Z }) {
  const hairyRaw = (i) => OF[i * 4 + 3] >= 128 && sat(OF, i) < 0.12 && (base[i * 4 + 3] < 128 || Math.hypot(OF[i * 4] - base[i * 4], OF[i * 4 + 1] - base[i * 4 + 1], OF[i * 4 + 2] - base[i * 4 + 2]) > 45);
  const cut = new Uint8Array(N);
  for (let i = W; i < N - W; i++) { if (HL[i * 4 + 3] >= 128 || !hairyRaw(i) || Z.EAR[i]) continue; for (const q of [i - 1, i + 1, i - W, i + W]) if (HL[q * 4 + 3] >= 128) { cut[i] = 1; break; } }
  const lab = new Uint8Array(N), runs = [];
  for (let i = 0; i < N; i++) if (cut[i] && !lab[i]) { const st = [i], all = []; lab[i] = 1; while (st.length) { const k = st.pop(); all.push(k); for (const q of [k - 1, k + 1, k - W, k + W, k - W - 1, k - W + 1, k + W - 1, k + W + 1]) if (cut[q] && !lab[q]) { lab[q] = 1; st.push(q); } }
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; for (const k of all) { const x = k % W, y = (k / W) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } runs.push({ px: all.length, box: [x0, y0, x1, y1] }); }
  runs.sort((a, b) => b.px - a.px);
  const where = (r) => { const cx = (r.box[0] + r.box[2]) / 2, cy = (r.box[1] + r.box[3]) / 2; return cy >= 200 && cy <= 250 && cx > 398 && cx < 620 ? "forehead" : cx <= 420 ? "left temple" : cx >= 600 ? "right temple" : "elsewhere"; };
  const by = {}; for (const r of runs) { const w = where(r); by[w] = Math.max(by[w] || 0, r.px); }
  const longest = runs.length ? runs[0].px : 0;
  return { cutEdgePx: runs.reduce((a, r) => a + r.px, 0), longestRun: longest, longestBy: by, top: runs.slice(0, 6).map((r) => ({ ...r, where: where(r) })), pass: longest <= P10.maxRun };
}

/** The temple adjustment, in figure coordinates: the left temple tip in x 380–400, rows 290–323, compressed into rows 290–310. */
export const TEMPLE = Object.freeze({ x: Object.freeze([380, 400]), rows: Object.freeze([290, 323]), into: Object.freeze([290, 310]) });
/** The raw image (call frame: figure (x, y) ↔ call (2(x − 256), 2y)) with ONLY the left temple tip's own hair pixels (where the V2 layer
 *  has hair, outside the ears) compressed; vacated pixels take the clean head's pixels. Refuses any change outside the temple box. */
export function adjustTemple(raw, v2Layer, base, Z) {
  const [FX0, FX1] = TEMPLE.x, [FY0, FY1] = TEMPLE.rows, FYE = TEMPLE.into[1], R = T.cropOut(base, 2);
  const hairAt = (xc, yc) => { const fx = 256 + (xc >> 1), fy = yc >> 1; return v2Layer[(fy * W + fx) * 4 + 3] > 0 && !Z.EAR[fy * W + fx]; };
  const O = new Uint8ClampedArray(raw), X0 = 2 * (FX0 - 256), X1 = 2 * (FX1 - 256) + 1, Y0 = 2 * FY0, Y1 = 2 * FY1 + 1, YE = 2 * FYE + 1;
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) if (hairAt(x, y)) O.set(R.subarray((y * S + x) * 4, (y * S + x) * 4 + 4), (y * S + x) * 4);   // lift the tip off
  for (let y = Y0; y <= YE; y++) for (let x = X0; x <= X1; x++) { const ys = Math.round(Y0 + (y - Y0) * (Y1 - Y0) / (YE - Y0)); if (hairAt(x, ys)) O.set(raw.subarray((ys * S + x) * 4, (ys * S + x) * 4 + 4), (y * S + x) * 4); }   // put it back, compressed
  let changed = 0, outside = 0; for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const i = (y * S + x) * 4; if ([0, 1, 2, 3].some((c) => O[i + c] !== raw[i + c])) { changed++; if (x < X0 || x > X1 || y < Y0 || y > Y1) outside++; } }
  if (outside) throw new Error("the temple adjustment changed the raw image outside its box");
  return { adjusted: O, changedPx: changed };
}

/** northstar-hair-nh4-post.mjs's postProcess with the V2 lift and P10; fixedReg reuses a registration found on another image. */
export function extractV2({ result: O, base, ear, swept, t = T.buildTemplate(), northstarHair = FIG.buildFigure().layers.hair, fixedReg = null }) {
  if (!O || O.length !== S * S * 4) throw new Error("a 1024×1024 RGBA result is required");
  const Z = buildZones(t, base, ear);
  // 1. registration on the face (call frame)
  const R = T.cropOut(base, 2), flatL = (A, i) => { const a = A[i * 4 + 3] / 255; return lum(A, i) * a + 255 * (1 - a); };
  const pts = []; for (let y = 500; y < 940; y += 3) for (let x = 200; x < 824; x += 3) { const fi = (y >> 1) * W + 256 + (x >> 1); if (R[(y * S + x) * 4 + 3] >= 200 && !Z.EAR[fi] && !Z.ZONE[fi]) pts.push([x, y, flatL(R, y * S + x)]); }
  const cx = 512, cy = 700, samp = (A, x, y) => { const x0 = Math.floor(x), y0 = Math.floor(y); if (x0 < 0 || y0 < 0 || x0 >= S - 1 || y0 >= S - 1) return 255; const ax = x - x0, ay = y - y0, i = y0 * S + x0; return flatL(A, i) * (1 - ax) * (1 - ay) + flatL(A, i + 1) * ax * (1 - ay) + flatL(A, i + S) * (1 - ax) * ay + flatL(A, i + S + 1) * ax * ay; };
  const err = (s, dx, dy, step = 1) => { let e = 0, n = 0; for (let k = 0; k < pts.length; k += step) { const [x, y, l] = pts[k]; e += Math.abs(samp(O, cx + (x - cx) * s + dx, cy + (y - cy) * s + dy) - l); n++; } return e / n; };
  let best = { e: 1e9 }; for (let s = 0.96; s <= 1.0401; s += 0.01) for (let dy = -40; dy <= 40; dy += 4) for (let dx = -40; dx <= 40; dx += 4) { const e = err(s, dx, dy, 5); if (e < best.e) best = { e, s, dx, dy }; }
  let fine = best; for (let s = best.s - 0.01; s <= best.s + 0.0101; s += 0.0025) for (let dy = best.dy - 4; dy <= best.dy + 4; dy++) for (let dx = best.dx - 4; dx <= best.dx + 4; dx++) { const e = err(s, dx, dy, 2); if (e < fine.e) fine = { e, s, dx, dy }; }
  if (fixedReg) fine = { e: err(fixedReg.s, fixedReg.dx, fixedReg.dy, 2), ...fixedReg };   // the adjusted copy reuses the untouched image's registration
  const reg = { scale: +fine.s.toFixed(4), dx: fine.dx, dy: fine.dy, faceErr: +err(fine.s, fine.dx, fine.dy, 1).toFixed(2), identityErr: +err(1, 0, 0, 1).toFixed(2) };
  const OR = new Uint8ClampedArray(S * S * 4); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) sample(O, cx + (x - cx) * fine.s + fine.dx, cy + (y - cy) * fine.s + fine.dy, OR, (y * S + x) * 4);
  const OF = T.mapBack(OR);
  // 2. the result's own grey hair everywhere: what lands on the brows, on the ears or outside the zone is counted, not trimmed
  const zoneLoose = new Uint8Array(N); for (let i = 0; i < N; i++) if (Z.ZONE[i]) { const x = i % W, y = (i / W) | 0; for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) if (dx * dx + dy * dy <= 64) zoneLoose[(y + dy) * W + x + dx] = 1; }
  const EARP = new Uint8Array(N); for (let i = 0; i < N; i++) if (Z.EAR[i]) { const x = i % W, y = (i / W) | 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) EARP[(y + dy) * W + x + dx] = 1; }
  const onWhite = (Q, i) => { const a = Q[i * 4 + 3] / 255; return [0, 1, 2].map((q) => Q[i * 4 + q] * a + 255 * (1 - a)); };
  // hair in the result: grey, clearly different from the clean head on white, and not one of the head's own dark outlines
  const hairy = (i) => { if (OF[i * 4 + 3] < 128 || sat(OF, i) >= 0.12) return false; const o = onWhite(OF, i), b = onWhite(base, i); if (Math.hypot(o[0] - b[0], o[1] - b[1], o[2] - b[2]) <= 45) return false; return 0.299 * b[0] + 0.587 * b[1] + 0.114 * b[2] > 110; };
  const raw = { brows: 0, ears: 0, spill: 0, total: 0 };
  for (let i = 0; i < N; i++) { if (!hairy(i)) continue; raw.total++; if (EARP[i]) raw.ears++; else if (Z.BROWZ[i]) raw.brows++; else if (!Z.KEEP[i] && !zoneLoose[i]) raw.spill++; }
  // the lifted grey layer
  const strong = new Uint8Array(N); let greyN = 0, cand = 0;
  for (let i = 0; i < N; i++) { if (!zoneLoose[i] || Z.KEEP[i] || OF[i * 4 + 3] < 128) continue; const differs = base[i * 4 + 3] < 128 || Math.hypot(OF[i * 4] - base[i * 4], OF[i * 4 + 1] - base[i * 4 + 1], OF[i * 4 + 2] - base[i * 4 + 2]) > 45; if (!differs) continue; cand++; if (sat(OF, i) < 0.12) { strong[i] = 1; greyN++; } }
  // V2: grow from the grey core through the result's connected grey hair, out to its visible tips
  const HARD = new Uint8Array(N); for (let i = 0; i < N; i++) if (t.z.eyesClear[i] || Z.EAR[i]) HARD[i] = 1;
  for (let i = 0; i < N; i++) if (t.z.brows.left[i] || t.z.brows.right[i]) { const x = i % W, y = (i / W) | 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) HARD[(y + dy) * W + x + dx] = 1; }
  const wide = new Uint8Array(N); for (let i = 0; i < N; i++) if (Z.ZONE[i]) { const x = i % W, y = (i / W) | 0; for (let dy = -40; dy <= 40; dy += 2) for (let dx = -40; dx <= 40; dx += 2) { const k = (y + dy) * W + x + dx; if (k >= 0 && k < N) wide[k] = 1; } }
  const isCand = (i) => wide[i] && !HARD[i] && OF[i * 4 + 3] >= 128 && sat(OF, i) < 0.12 && (base[i * 4 + 3] < 128 || Math.hypot(OF[i * 4] - base[i * 4], OF[i * 4 + 1] - base[i * 4 + 1], OF[i * 4 + 2] - base[i * 4 + 2]) > 45);
  const grown = new Uint8Array(N), st = []; for (let i = 0; i < N; i++) if (strong[i] && !HARD[i]) { grown[i] = 1; st.push(i); }
  while (st.length) { const k = st.pop(); for (const q of [k - 1, k + 1, k - W, k + W, k - W - 1, k - W + 1, k + W - 1, k + W + 1]) if (q >= 0 && q < N && !grown[q] && isCand(q)) { grown[q] = 1; st.push(q); } }
  let grownExtra = 0; for (let i = 0; i < N; i++) if (grown[i] && !strong[i]) grownExtra++;
  const GL = new Uint8ClampedArray(N * 4);
  for (let i = 0; i < N; i++) { if (grown[i]) { const g = Math.round(lum(OF, i)); GL.set([g, g, g, 255], i * 4); continue; }
    if (HARD[i] || OF[i * 4 + 3] === 0) continue; const x = i % W, y = (i / W) | 0; let hs = [0, 0, 0], n = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const k = (y + dy) * W + x + dx; if (grown[k]) { for (let q = 0; q < 3; q++) hs[q] += OF[k * 4 + q]; n++; } } if (!n) continue; hs = hs.map((v) => v / n);
    let a; if (base[i * 4 + 3] < 128) a = OF[i * 4 + 3] / 255; else { let num = 0, den = 0; for (let q = 0; q < 3; q++) { num += (OF[i * 4 + q] - base[i * 4 + q]) * (hs[q] - base[i * 4 + q]); den += (hs[q] - base[i * 4 + q]) ** 2; } a = den > 0 ? Math.max(0, Math.min(1, num / den)) : 0; }
    if (a > 0.04) { const g = Math.round(0.299 * hs[0] + 0.587 * hs[1] + 0.114 * hs[2]); GL.set([g, g, g, Math.round(a * 255)], i * 4); } }
  { const m = new Uint8Array(N); for (let i = 0; i < N; i++) if (GL[i * 4 + 3]) m[i] = 1; const lab = new Int32Array(N); let nn = 0;   // specks under 80 px go
    for (let i = 0; i < N; i++) if (m[i] && !lab[i]) { nn++; const st = [i], all = []; lab[i] = nn; while (st.length) { const k = st.pop(); all.push(k); for (const q of [k - 1, k + 1, k - W, k + W, k - W - 1, k - W + 1, k + W - 1, k + W + 1]) if (m[q] && !lab[q]) { lab[q] = nn; st.push(q); } } if (all.length < 80) for (const k of all) GL[k * 4 + 3] = 0; } }
  for (let i = 0; i < N; i++) if (Z.EAR[i]) GL[i * 4 + 3] = 0;   // nothing under the ears
  // 3. tint, compose, check
  const HL = northstarTint(GL);
  const EARTOP = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) if (Z.EAR[i]) EARTOP.set(base.subarray(i * 4, i * 4 + 4), i * 4);
  const pic = NL.overStack([base, HL, EARTOP]); for (let i = 0; i < N; i++) if (HL[i * 4 + 3] === 0) pic.set(base.subarray(i * 4, i * 4 + 4), i * 4);
  const A = (i) => HL[i * 4 + 3], g = {};
  g.P1 = { ...reg, pass: Math.abs(reg.scale - 1) <= GATES.P1.maxScale && Math.abs(reg.dx) <= GATES.P1.maxShift && Math.abs(reg.dy) <= GATES.P1.maxShift && reg.faceErr <= GATES.P1.maxErr };
  { let n = 0, c = 0; for (let i = 0; i < N; i++) if (Z.SCALP[i]) { n++; if (A(i) >= 250) c++; } g.P2 = { covered: +(c / n).toFixed(4), pass: c / n >= GATES.P2.min }; }
  { let onBrow = 0, eyes = 0; const gap = { left: 1e9, right: 1e9 }; for (let i = 0; i < N; i++) { if ((t.z.brows.left[i] || t.z.brows.right[i]) && A(i) >= 128) onBrow++; if (t.z.eyesClear[i] && A(i) >= 128) eyes++; }
    for (const sd of ["left", "right"]) for (let i = 0; i < N; i++) if (t.z.brows[sd][i]) { const x = i % W, y = (i / W) | 0; for (let k = 1; k < 30; k++) if (A((y - k) * W + x) >= 128) { gap[sd] = Math.min(gap[sd], k); break; } }
    g.P3 = { resultOnBrowsPx: raw.brows, onBrowPx: onBrow, eyesPx: eyes, gapPx: gap, pass: raw.brows <= GATES.P3.maxRaw && onBrow === 0 && eyes === 0 && gap.left >= GATES.P3.minGap && gap.right >= GATES.P3.minGap }; }
  { let onEar = 0, soft = 0, softSame = 0, face = 0; for (let i = 0; i < N; i++) { if (Z.EAR[i]) { if (A(i)) onEar++; if (base[i * 4 + 3] > 0 && base[i * 4 + 3] < 255) { soft++; if (same(pic, base, i)) softSame++; } } if (Z.head[i] && !Z.EAR[i] && ((i / W) | 0) > 310 && A(i) >= 128) face++; }
    g.P4 = { resultOnEarsPx: raw.ears, onEarPx: onEar, softEdges: soft, softIdentical: softSame, faceBelowEarTopPx: face, pass: raw.ears <= GATES.P4.maxRaw && onEar === 0 && softSame === soft && face <= GATES.P4.maxFace }; }
  { const m = new Uint8Array(N); let tot = 0; for (let i = 0; i < N; i++) if (A(i) >= 128) { m[i] = 1; tot++; } const lab = new Uint8Array(N); let big = 0;
    for (let i = 0; i < N; i++) if (m[i] && !lab[i]) { let c = 0; const st = [i]; lab[i] = 1; while (st.length) { const k = st.pop(); c++; for (const q of [k - 1, k + 1, k - W, k + W]) if (m[q] && !lab[q]) { lab[q] = 1; st.push(q); } } big = Math.max(big, c); }
    g.P5 = { hairPx: tot, largestShare: tot ? +(big / tot).toFixed(4) : 0, pass: tot > 0 && big / tot >= GATES.P5.min }; }
  { let n = 0, s = 0; for (let i = 0; i < N; i++) if (A(i) === 0) { n++; if (same(pic, base, i)) s++; } g.P6 = { px: n, identical: s, pass: n === s }; }
  g.P7 = { candidates: cand, greyShare: cand ? +(greyN / cand).toFixed(4) : 0, pass: cand > 0 && greyN / cand >= GATES.P7.min };
  { const k = 4, w = W / k, h = H / k, roi = (i) => { const y = (i / W) | 0; return !Z.head[i] || (y >= 170 && y <= 250); };
    const small = (Q) => { const m = new Uint8Array(w * h); for (let Y = 0; Y < h; Y++) for (let X = 0; X < w; X++) { let s = 0; for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) { const i = (Y * k + dy) * W + X * k + dx; if (roi(i) && Q[i * 4 + 3] >= 128) s++; } m[Y * w + X] = s >= 8 ? 1 : 0; } return m; };
    const iou = (a, b) => { let I = 0, U = 0; for (let i = 0; i < a.length; i++) { if (a[i] && b[i]) I++; if (a[i] || b[i]) U++; } return U ? I / U : 0; };
    const me = small(HL), vsN = iou(me, small(northstarHair)), vsS = iou(me, small(swept)); g.P8 = { iouNorthstar: +vsN.toFixed(3), iouSideSwept: +vsS.toFixed(3), pass: vsN <= GATES.P8.max && vsS <= GATES.P8.max }; }
  g.P9 = { resultGreyPx: raw.total, spillPx: raw.spill, spillShare: raw.total ? +(raw.spill / raw.total).toFixed(4) : 0, pass: raw.total === 0 || raw.spill / raw.total <= GATES.P9.max };
  g.P10 = cutCheck({ HL, OF, base, Z }); g.P10.grownBeyondCorePx = grownExtra;
  const failed = Object.entries(g).filter(([, v]) => !v.pass).map(([k]) => k);
  return { report: { verdict: failed.length ? "REJECTED" : "PASSES CHECKS — the owner's visual review next", failed, checks: g }, GL, HL, pic, OF, Z };
}

/** A hair layer on the clean head: no hair under the ears, and the clean head's own pixels wherever the layer is empty. */
export function composeOnHead(base, ear, L) {
  const top = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) if (ear[i * 4 + 3]) top.set(base.subarray(i * 4, i * 4 + 4), i * 4);
  const o = NL.overStack([base, L, top]); for (let i = 0; i < N; i++) if (L[i * 4 + 3] === 0) o.set(base.subarray(i * 4, i * 4 + 4), i * 4);
  return o;
}

const strip = (r) => ({ verdict: r.verdict, failed: r.failed, checks: r.checks });
/** The whole candidate from the untouched raw image: V2 on the raw image, the temple adjustment, V2 + P1–P10 on the adjusted copy, P10 against
 *  the untouched raw image, the finished candidate's visible facts, and the five PNG files (encoded, ready to hash). */
export function buildCandidate({ raw, base, ear, swept, t = T.buildTemplate() }) {
  const v2 = extractV2({ result: raw, base, ear, swept, t }), r = v2.report.checks.P1;
  if (r.scale !== 1 || r.dx !== 0 || r.dy !== 0) throw new Error("the untouched raw image no longer registers at scale 1, shift 0: " + JSON.stringify(r));
  const { adjusted, changedPx } = adjustTemple(raw, v2.HL, base, v2.Z);
  const c = extractV2({ result: adjusted, base, ear, swept, t, fixedReg: { s: 1, dx: 0, dy: 0 } }), Z = c.Z;
  const p10Untouched = cutCheck({ HL: c.HL, OF: v2.OF, base, Z });
  const grey = composeOnHead(base, ear, c.GL), brown = composeOnHead(base, ear, c.HL);
  const f = { browPixelsWithAnyHair: 0, gapAboveBrowsAnyAlphaPx: { left: 1e9, right: 1e9 }, earSoftEdges: 0, earSoftIdenticalGrey: 0, earSoftIdenticalBrown: 0, faceBelowEarTopPx: { left: 0, right: 0 }, alphaDiffGreyVsBrownPx: 0, greyLayerNonNeutralPx: 0, layerAlphaDiffersFromV2OutsideTemplePx: 0 };
  const [FX0, FX1] = TEMPLE.x, [FY0, FY1] = TEMPLE.rows;
  for (let i = 0; i < N; i++) {
    const x = i % W, y = (i / W) | 0;
    if (c.GL[i * 4 + 3] !== c.HL[i * 4 + 3]) f.alphaDiffGreyVsBrownPx++;
    if (c.GL[i * 4 + 3] && (c.GL[i * 4] !== c.GL[i * 4 + 1] || c.GL[i * 4 + 1] !== c.GL[i * 4 + 2])) f.greyLayerNonNeutralPx++;
    if ((t.z.brows.left[i] || t.z.brows.right[i]) && c.HL[i * 4 + 3] > 0) f.browPixelsWithAnyHair++;
    if (Z.EAR[i] && base[i * 4 + 3] > 0 && base[i * 4 + 3] < 255) { f.earSoftEdges++; if (same(grey, base, i)) f.earSoftIdenticalGrey++; if (same(brown, base, i)) f.earSoftIdenticalBrown++; }
    if (Z.head[i] && !Z.EAR[i] && y > 310 && c.HL[i * 4 + 3] >= 128) f.faceBelowEarTopPx[x < 512 ? "left" : "right"]++;
    if (!(x >= FX0 - 4 && x <= FX1 + 4 && y >= FY0 - 4 && y <= FY1 + 4) && c.HL[i * 4 + 3] !== v2.HL[i * 4 + 3]) f.layerAlphaDiffersFromV2OutsideTemplePx++;
  }
  for (const sd of ["left", "right"]) for (let i = 0; i < N; i++) if (t.z.brows[sd][i]) { const x = i % W, y = (i / W) | 0; for (let k = 1; k < 30; k++) if (c.HL[((y - k) * W + x) * 4 + 3] > 0) { f.gapAboveBrowsAnyAlphaPx[sd] = Math.min(f.gapAboveBrowsAnyAlphaPx[sd], k); break; } }
  for (let i = 0; i < N * 4; i++) if (brown[i] !== c.pic[i]) throw new Error("the brown composite differs from the extraction's own composite");
  const files = {
    adjusted: encodePng(S, S, adjusted), greyLayer: encodePng(W, H, c.GL), brownLayer: encodePng(W, H, c.HL),
    greyOnCleanHead: encodePng(W, H, grey), brownOnCleanHead: encodePng(W, H, brown),
  };
  return { v2: strip(v2.report), candidate: strip(c.report), p10Untouched, templeChangedPx: changedPx, finished: f, files };
}

export const sha256 = (b) => createHash("sha256").update(b).digest("hex");
/** The fixture's bound outputs that a built candidate does not reproduce byte for byte (empty: it is the excepted candidate). */
export function bindingMismatches(fixture, files) {
  const out = []; for (const [k, o] of Object.entries(fixture.outputs)) if (!files[k] || sha256(files[k]) !== o.sha256) out.push(k + (files[k] ? " " + sha256(files[k]) : " missing"));
  return out;
}

function main() {
  const args = process.argv.slice(2), arg = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null), outside = (d) => { if (!d) return false; const r = relative(ROOT, resolve(d)); return r.startsWith("..") || isAbsolute(r); };
  const fx = JSON.parse(readFileSync(join(ROOT, ...FIXTURE.split("/")), "utf8")), f = { raw: arg("--raw"), base: arg("--base"), ear: arg("--ear"), swept: arg("--swept") }, OUT = arg("--out");
  if (Object.values(f).some((v) => !v) || !OUT) throw new Error("--raw <png> --base <clean head png> --ear <ear mask png> --swept <side-swept hair layer png> --out <empty dir outside the repository>");
  for (const p of [...Object.values(f), OUT]) if (!outside(p)) throw new Error("the images and the output stay outside the repository: " + p);
  for (const [k, p] of Object.entries(f)) { const pin = fx.inputs.find((i) => i.role === k), got = sha256(readFileSync(p)); if (!pin || got !== pin.sha256) throw new Error("input " + k + " is not the pinned file: " + got); }
  if (existsSync(OUT) && readdirSync(OUT).length) throw new Error("output directory not empty"); mkdirSync(OUT, { recursive: true });
  const px = (p) => decodePng(readFileSync(p)).px, b = buildCandidate({ raw: px(f.raw), base: px(f.base), ear: px(f.ear), swept: px(f.swept) });
  for (const [k, o] of Object.entries(fx.outputs)) writeFileSync(join(OUT, o.name), b.files[k]);
  const bad = bindingMismatches(fx, b.files), { files, ...report } = b;
  writeFileSync(join(OUT, "d372-report.json"), JSON.stringify({ ...report, outputs: Object.fromEntries(Object.entries(files).map(([k, v]) => [k, sha256(v)])), bound: bad.length === 0 }, null, 1) + "\n");
  if (bad.length) throw new Error("not the excepted candidate (D-372 binds only the fixture's hashes): " + bad.join("; "));
  console.log(JSON.stringify({ bound: true, failedHistoricalChecks: report.candidate.failed, finished: report.finished }));
}
if (typeof process.argv[1] === "string" && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
