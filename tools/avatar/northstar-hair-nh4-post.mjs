// D-371 NH-4 — after the call: one returned 1024×1024 image → a separate transparent hair layer in the fixed coordinates. Deterministic,
// offline; no image call. The model EDITS the clean head (Image 1); only its grey hair is kept — the face, brows, ears and skin of the
// composite are always the clean head layer's own pixels.
//   1. register the result on the clean head by its face (scale ±4 %, shift ±40 px in the call frame): the model may drift a little
//   2. place it on the figure grid (÷2 at (256, 0), as D-371) and lift the GREY hair out: grey pixels in the hair zone (+8 px) that differ from
//      the clean head; soft edges take their alpha from the nearest hair colour (O = a·H + (1 − a)·skin)
//   3. tint the grey layer along Northstar's own value steps, compose on the clean head (no hair under the ears; where the layer is empty the
//      clean head's own pixels), and check P1–P9. What the result draws on the brows, on the ears or outside the zone is COUNTED, never
//      trimmed silently. Then the owner's visual review.
// Usage: node tools/avatar/northstar-hair-nh4-post.mjs --result <returned png> --base <clean head png> --ear <ear-on-top mask png>
//          --swept <side-swept hair layer png> --out <empty dir outside the repository>
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, resolve, dirname, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import * as T from "./northstar-hair-template-d371.mjs";
import * as FIG from "./r3-northstar-figure.mjs";
import * as NL from "./r3-northstar-layers.mjs";
import { encodePng, decodePng } from "./r3-hair-tool-v2.mjs";
import { buildZones } from "./northstar-hair-nh4-zones.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const W = 1024, H = 1536, N = W * H, S = 1024;
export const GATES = Object.freeze({
  P1: { rule: "registration on the face: |scale − 1| ≤ 0.04, |shift| ≤ 40 px (call frame), mean face error ≤ 14 (luminance)", maxScale: 0.04, maxShift: 40, maxErr: 14 },
  P2: { rule: "scalp covered: ≥ 98 % of the scalp zone has hair alpha ≥ 250", min: 0.98 },
  P3: { rule: "brows and eyes free: in the RESULT ≤ 10 px of grey hair on the brows' keep-clear zone; in the layer 0 px on brows and eyes and ≥ 6 px gap above each brow", minGap: 6, maxRaw: 10 },
  P4: { rule: "ears: in the RESULT ≤ 10 px of grey hair on the ears; no hair on the ears in the layer; their soft edges identical to the clean head; ≤ 20 px of hair on the face below the ear tops", maxFace: 20, maxRaw: 10 },
  P5: { rule: "one piece: the largest piece holds ≥ 98 % of the hair", min: 0.98 },
  P6: { rule: "the clean head is unchanged wherever the hair layer is empty (pixel for pixel)" },
  P7: { rule: "greyscale: ≥ 90 % of the lifted hair pixels are neutral grey (saturation < 0.12)", min: 0.9 },
  P8: { rule: "distinguishable at app size (÷4): silhouette (outside the head + the forehead band) IoU ≤ 0.75 with Northstar's hair and with the side-swept trial", max: 0.75 },
  P9: { rule: "the shape is followed: ≤ 3 % of the result's grey hair lies more than 8 px outside the guide's zone (nothing is trimmed silently)", max: 0.03 },
});
/** Grey → Northstar's brown along his own value steps (outline, deep shadow, shadow, base, orange light, bright core); the grey is first
 *  normalised over the layer's own 2nd–98th percentile (as D-368's mapTint). */
export const NORTHSTAR_STOPS = Object.freeze([[0, [14, 8, 3]], [0.22, [46, 21, 7]], [0.45, [74, 37, 14]], [0.7, [108, 58, 24]], [0.88, [160, 86, 26]], [1, [198, 106, 31]]]);
const lum = (P, i) => 0.299 * P[i * 4] + 0.587 * P[i * 4 + 1] + 0.114 * P[i * 4 + 2];
const sat = (P, i) => { const r = P[i * 4], g = P[i * 4 + 1], b = P[i * 4 + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx < 24 ? 0 : (mx - mn) / mx; };
const same = (P, Q, i) => P[i * 4] === Q[i * 4] && P[i * 4 + 1] === Q[i * 4 + 1] && P[i * 4 + 2] === Q[i * 4 + 2] && P[i * 4 + 3] === Q[i * 4 + 3];

export function northstarTint(Gl) {
  const gs = []; for (let i = 0; i < N; i++) if (Gl[i * 4 + 3] >= 128) gs.push(Gl[i * 4]); gs.sort((a, b) => a - b);
  const lo = gs.length ? gs[Math.floor(gs.length * 0.02)] : 0, hi = gs.length ? gs[Math.floor(gs.length * 0.98)] : 255, o = new Uint8ClampedArray(N * 4), st = NORTHSTAR_STOPS;
  for (let i = 0; i < N; i++) { const a = Gl[i * 4 + 3]; if (!a) continue; const v = Math.max(0, Math.min(1, (Gl[i * 4] - lo) / Math.max(1, hi - lo))); let k = 0; while (k < st.length - 2 && v > st[k + 1][0]) k++;
    const [t0, c0] = st[k], [t1, c1] = st[k + 1], u = (v - t0) / (t1 - t0); for (let c = 0; c < 3; c++) o[i * 4 + c] = Math.round(c0[c] + (c1[c] - c0[c]) * u); o[i * 4 + 3] = a; }
  return o;
}

/** A 1024×1024 RGBA image moved by scale s and shift (dx, dy) about (512, 700) — the rehearsal's model drift. Premultiplied bilinear. */
export function drift(A, s, dx, dy) {
  const o = new Uint8ClampedArray(S * S * 4), cx = 512, cy = 700;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const sx = cx + (x - cx - dx) / s, sy = cy + (y - cy - dy) / s; sample(A, sx, sy, o, (y * S + x) * 4); }
  return o;
}
function sample(A, sx, sy, o, j) {
  const x0 = Math.floor(sx), y0 = Math.floor(sy); if (x0 < 0 || y0 < 0 || x0 >= S - 1 || y0 >= S - 1) return;
  const ax = sx - x0, ay = sy - y0, w4 = [(1 - ax) * (1 - ay), ax * (1 - ay), (1 - ax) * ay, ax * ay], ii = [y0 * S + x0, y0 * S + x0 + 1, (y0 + 1) * S + x0, (y0 + 1) * S + x0 + 1]; let a = 0; const c = [0, 0, 0];
  for (let k = 0; k < 4; k++) { const al = A[ii[k] * 4 + 3] * w4[k]; a += al; for (let q = 0; q < 3; q++) c[q] += A[ii[k] * 4 + q] * al; }
  if (a > 0) { for (let q = 0; q < 3; q++) o[j + q] = Math.round(c[q] / a); o[j + 3] = Math.round(a); }
}
/** The clean head with a hair layer on it, as the call frame shows it (the rehearsal's simulated result): no hair under the ears, and
 *  the clean head's own pixels wherever the layer is empty. */
export function onHead(base, ear, hair) {
  const h = new Uint8ClampedArray(hair); for (let i = 0; i < N; i++) if (ear[i * 4 + 3]) h[i * 4 + 3] = 0;
  const top = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) if (ear[i * 4 + 3]) top.set(base.subarray(i * 4, i * 4 + 4), i * 4);
  const c = NL.overStack([base, h, top]); for (let i = 0; i < N; i++) if (h[i * 4 + 3] === 0) c.set(base.subarray(i * 4, i * 4 + 4), i * 4);
  return T.cropOut(c, 2);
}

/** The whole check of one result (1024×1024 RGBA): registration, the lifted grey layer, the tinted layer, the composite, P1–P9. */
export function postProcess({ result: O, base, ear, swept, t = T.buildTemplate(), northstarHair = FIG.buildFigure().layers.hair }) {
  if (!O || O.length !== S * S * 4) throw new Error("a 1024×1024 RGBA result is required");
  const Z = buildZones(t, base, ear);
  // 1. registration on the face (call frame)
  const R = T.cropOut(base, 2), flatL = (A, i) => { const a = A[i * 4 + 3] / 255; return lum(A, i) * a + 255 * (1 - a); };
  const pts = []; for (let y = 500; y < 940; y += 3) for (let x = 200; x < 824; x += 3) { const fi = (y >> 1) * W + 256 + (x >> 1); if (R[(y * S + x) * 4 + 3] >= 200 && !Z.EAR[fi] && !Z.ZONE[fi]) pts.push([x, y, flatL(R, y * S + x)]); }
  const cx = 512, cy = 700, samp = (A, x, y) => { const x0 = Math.floor(x), y0 = Math.floor(y); if (x0 < 0 || y0 < 0 || x0 >= S - 1 || y0 >= S - 1) return 255; const ax = x - x0, ay = y - y0, i = y0 * S + x0; return flatL(A, i) * (1 - ax) * (1 - ay) + flatL(A, i + 1) * ax * (1 - ay) + flatL(A, i + S) * (1 - ax) * ay + flatL(A, i + S + 1) * ax * ay; };
  const err = (s, dx, dy, step = 1) => { let e = 0, n = 0; for (let k = 0; k < pts.length; k += step) { const [x, y, l] = pts[k]; e += Math.abs(samp(O, cx + (x - cx) * s + dx, cy + (y - cy) * s + dy) - l); n++; } return e / n; };
  let best = { e: 1e9 }; for (let s = 0.96; s <= 1.0401; s += 0.01) for (let dy = -40; dy <= 40; dy += 4) for (let dx = -40; dx <= 40; dx += 4) { const e = err(s, dx, dy, 5); if (e < best.e) best = { e, s, dx, dy }; }
  let fine = best; for (let s = best.s - 0.01; s <= best.s + 0.0101; s += 0.0025) for (let dy = best.dy - 4; dy <= best.dy + 4; dy++) for (let dx = best.dx - 4; dx <= best.dx + 4; dx++) { const e = err(s, dx, dy, 2); if (e < fine.e) fine = { e, s, dx, dy }; }
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
  const GL = new Uint8ClampedArray(N * 4);
  for (let i = 0; i < N; i++) { if (strong[i]) { const g = Math.round(lum(OF, i)); GL.set([g, g, g, 255], i * 4); continue; }
    if (!zoneLoose[i] || Z.KEEP[i] || OF[i * 4 + 3] === 0) continue; const x = i % W, y = (i / W) | 0; let hs = [0, 0, 0], n = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const k = (y + dy) * W + x + dx; if (strong[k]) { for (let q = 0; q < 3; q++) hs[q] += OF[k * 4 + q]; n++; } } if (!n) continue; hs = hs.map((v) => v / n);
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
  const failed = Object.entries(g).filter(([, v]) => !v.pass).map(([k]) => k);
  return { report: { verdict: failed.length ? "REJECTED" : "PASSES CHECKS — the owner's visual review next", failed, checks: g }, GL, HL, pic };
}

function main() {
  const args = process.argv.slice(2), arg = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null), outside = (d) => { if (!d) return false; const r = relative(ROOT, resolve(d)); return r.startsWith("..") || isAbsolute(r); };
  const f = { result: arg("--result"), base: arg("--base"), ear: arg("--ear"), swept: arg("--swept") }, OUT = arg("--out");
  if (Object.values(f).some((v) => !v) || !OUT) throw new Error("--result <png> --base <clean head png> --ear <ear mask png> --swept <side-swept hair layer png> --out <empty dir outside the repository>");
  for (const p of [...Object.values(f), OUT]) if (!outside(p)) throw new Error("the images and the output stay outside the repository: " + p);
  if (existsSync(OUT) && readdirSync(OUT).length) throw new Error("output directory not empty"); mkdirSync(OUT, { recursive: true });
  const px = (p) => decodePng(readFileSync(p)).px, { report, GL, HL, pic } = postProcess({ result: px(f.result), base: px(f.base), ear: px(f.ear), swept: px(f.swept) });
  writeFileSync(join(OUT, "nh4-hair-grey-layer.png"), encodePng(W, H, GL)); writeFileSync(join(OUT, "nh4-hair-layer.png"), encodePng(W, H, HL)); writeFileSync(join(OUT, "nh4-on-clean-head-full.png"), encodePng(W, H, pic));
  writeFileSync(join(OUT, "checks.json"), JSON.stringify(report, null, 1) + "\n"); console.log(JSON.stringify({ verdict: report.verdict, failed: report.failed }));
}
if (typeof process.argv[1] === "string" && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
