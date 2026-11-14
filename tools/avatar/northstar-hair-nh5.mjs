// D-375 NH-5B — one new Northstar hairstyle, the TOP KNOT, on D-373's shared head base. Deterministic, offline; no image call.
//   · the base: D-373's shared head base (build-northstar-hair-heads-d373.mjs buildHeads — the clean head above y 430, the app's bald runtime
//     neck below), rebuilt from the pinned private clean head and its ear mask and the published figure-head-v1.webp;
//   · three designs drawn only from the base's geometry (A soft swept-up top, B top knot, C nape locks); no earlier hair layer, sketch or
//     candidate is part of any design or of the call's input — Northstar's standard hair and NH-4 are used ONLY to compare (P8) and on
//     comparison sheets;
//   · the call's three inputs for design B: Image 1 the base's head (the model edits it), Image 2 the guide (B's zone, hairline, keep-clear),
//     Image 3 a style sample of Northstar's own painted body in the cream tee (no hair anywhere);
//   · the post-processing: D-372's V2 lift (the result's own connected grey hair, out to its tips) with B's zone, and the checks P1–P12, of
//     which P10 (cuts), P11 (one local spill cluster) and P12 (one local scalp hole) are local: what an aggregate count can miss (NH-4).
// Hard limits in the layer are only the eyes, the brows (+2 px) and the ears; everything else the result draws is followed and COUNTED.
// The private images stay outside the clones.
// Usage:
//   node tools/avatar/northstar-hair-nh5.mjs --inputs --clean <clean head png> --ear <ear mask png> --dwebp <dwebp.exe> --out <empty dir outside the repository>
//   node tools/avatar/northstar-hair-nh5.mjs --post --result <returned png> --base <d373 base png> --ear <ear mask png> --nh4 <D-373 NH-4 grey layer png> --out <empty dir outside>
//   node tools/avatar/northstar-hair-nh5.mjs --rehearsal --base <d373 base png> --ear <ear mask png> --nh4 <D-373 NH-4 grey layer png> --out <empty dir outside>
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, mkdtempSync } from "node:fs";
import { join, resolve, dirname, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import * as T from "./northstar-hair-template-d371.mjs";
import * as FIG from "./r3-northstar-figure.mjs";
import * as HD from "./r3-northstar-head.mjs";
import * as NL from "./r3-northstar-layers.mjs";
import { encodePng, decodePng } from "./r3-hair-tool-v2.mjs";
import { northstarTint, drift } from "./northstar-hair-nh4-post.mjs";
import { cutCheck } from "./northstar-hair-nh4-exception-d372.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DECISION = "D-375";
export const W = 1024, H = 1536, N = W * H, S = 1024, NECK_Y = 430;
export const CHOSEN = "B";
export const NAMES = Object.freeze({ base: "d373-base-figure.png", head: "nh5b-d373-base-head-1024.png", guide: "nh5b-guide-1024.png", style: "nh5-style-body-1024.png" });
export const APP_HEAD = "assets/avatar-northstar/figure-head-v1.webp";
export const NH4_HEADS = Object.freeze({ grey: "assets/avatar-northstar-hair/head-nh4-grey-v1.webp", brown: "assets/avatar-northstar-hair/head-nh4-brown-v1.webp" });
export const STYLE_LAYERS = Object.freeze(["figure-body-v1.webp", "top-tee-hip-cream-top-body-v2.webp", "figure-arms-v1.webp", "top-tee-hip-cream-sleeves-v2.webp"]);
export const STYLE_Y = 430;
export const D373_FIXTURE = "tools/avatar/fixtures/northstar-hair-d371/hair-heads-d373-v1.json";
export const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const lum = (P, i) => 0.299 * P[i * 4] + 0.587 * P[i * 4 + 1] + 0.114 * P[i * 4 + 2];
const sat = (P, i) => { const r = P[i * 4], g = P[i * 4 + 1], b = P[i * 4 + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx < 24 ? 0 : (mx - mn) / mx; };
const same = (P, Q, i) => P[i * 4] === Q[i * 4] && P[i * 4 + 1] === Q[i * 4 + 1] && P[i * 4 + 2] === Q[i * 4 + 2] && P[i * 4 + 3] === Q[i * 4 + 3];

// ── 1. the base ─────────────────────────────────────────────────────────────────────────────────────────────────────
/** D-373's shared head base from the decoded clean head and the decoded published app head (the same arithmetic as buildHeads). */
export function d373Base({ clean, appHead, L = FIG.buildFigure().layers }) {
  const full = HD.composeHead(L), cut = new Uint8Array(N); let other = 0;
  for (let i = 0; i < N; i++) if (!same(full, appHead, i)) { if (appHead[i * 4 + 3] === 0 && full[i * 4 + 3] > 0 && ((i / W) | 0) >= NECK_Y) cut[i] = 1; else other++; }
  if (other) throw new Error("the app head is not the R3 head stack minus the neck cut: " + other + " px");
  const appBald = HD.composeHead(L, { include: HD.COMPOSITE_ORDER.filter((k) => k !== "hair" && k !== "hairShadow") }); for (let i = 0; i < N; i++) if (cut[i]) appBald[i * 4 + 3] = 0;
  const base = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) base.set(((i / W) | 0) >= NECK_Y ? appBald.subarray(i * 4, i * 4 + 4) : clean.subarray(i * 4, i * 4 + 4), i * 4);
  return base;
}
/** The base against D-373's two published NH-4 heads: wherever the grey and the brown head agree (no hair there), both must BE the base —
 *  except at the hair's faintest soft edge, where a low-alpha grey and brown tip can round to the same colour: such a pixel must lie within
 *  2 px of a pixel where the two heads differ (the hair) and differ from the base by at most 24 per channel. */
export function baseCheck(base, grey, brown) {
  const hair = new Uint8Array(N); for (let i = 0; i < N; i++) if (!same(grey, brown, i)) hair[i] = 1;
  const nearHair = (i) => { const x = i % W, y = (i / W) | 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H && hair[yy * W + xx]) return true; } return false; };
  let agree = 0, differ = 0, softEdge = 0, other = 0;
  for (let i = 0; i < N; i++) if (!hair[i]) { agree++; if (same(grey, base, i)) continue; differ++;
    if (nearHair(i) && [0, 1, 2, 3].every((c) => Math.abs(grey[i * 4 + c] - base[i * 4 + c]) <= 24)) softEdge++; else other++; }
  return { pixelsWhereBothHeadsAgree: agree, ofThoseDifferingFromBase: differ, atTheHairsSoftEdge: softEdge, elsewhere: other, pass: agree > N * 0.9 && other === 0 && differ <= 32 };
}

// ── 2. geometry and the designs ─────────────────────────────────────────────────────────────────────────────────────
export function geometry(base, ear, t = T.buildTemplate()) {
  const head = new Uint8Array(N), EAR = new Uint8Array(N); for (let i = 0; i < N; i++) { if (base[i * 4 + 3] >= 128) head[i] = 1; if (ear[i * 4 + 3]) EAR[i] = 1; }
  const dil = (m, r) => { const o = new Uint8Array(N); for (let i = 0; i < N; i++) if (m[i]) { const x = i % W, y = (i / W) | 0; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) o[(y + dy) * W + x + dx] = 1; } return o; };
  const BROW = new Uint8Array(N); for (let i = 0; i < N; i++) if (t.z.brows.left[i] || t.z.brows.right[i]) BROW[i] = 1;
  const BROWZ = new Uint8Array(N); for (let i = 0; i < N; i++) if (BROW[i]) { const x = i % W, y = (i / W) | 0; for (let dy = -7; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) BROWZ[(y + dy) * W + x + dx] = 1; }
  const EARP = dil(EAR, 2), KEEP = new Uint8Array(N); for (let i = 0; i < N; i++) if (t.z.eyesClear[i] || BROWZ[i] || EARP[i]) KEEP[i] = 1;
  const C = [512, 300], rHead = new Float32Array(720);
  for (let a = 0; a < 720; a++) { const th = (a / 2) * Math.PI / 180; let r = 0; for (let k = 0; k < 400; k++) { const x = Math.round(C[0] + k * Math.cos(th)), y = Math.round(C[1] + k * Math.sin(th)); if (x < 0 || y < 0 || x >= W || y >= H) break; if (head[y * W + x]) r = k; } rHead[a] = r; }
  return { t, head, EAR, EARP, BROW, BROWZ, KEEP, C, rHead, dil };
}
const angleOf = (G, x, y) => { let d = Math.atan2(y - G.C[1], x - G.C[0]) * 180 / Math.PI; if (d < 0) d += 360; return d; };
const rOf = (G, x, y) => Math.hypot(x - G.C[0], y - G.C[1]);
const lerpLine = (pts, x) => { if (x < pts[0][0] || x > pts[pts.length - 1][0]) return null; for (let k = 1; k < pts.length; k++) if (x <= pts[k][0]) { const [x0, y0] = pts[k - 1], [x1, y1] = pts[k]; return y0 + (y1 - y0) * (x - x0) / Math.max(1e-9, x1 - x0); } return null; };
const bump = (d, c, w) => { let e = Math.abs(d - c); if (e > 180) e = 360 - e; return e >= w ? 0 : 0.5 * (1 + Math.cos(Math.PI * e / w)); };
// Angles: 0° = right, 90° = down, 270° = straight up (image coordinates). Coordinates on the figure grid (1024×1536).
export const DESIGNS = Object.freeze({
  A: { id: "A", name: "Blød opstrøget top", hairline: [[388, 300], [384, 272], [389, 250], [399, 236], [424, 224], [466, 214], [512, 210], [558, 213], [598, 222], [618, 232], [630, 250], [635, 274], [632, 300]],
    extra: (d, y) => (y > 300 ? 0 : 6 + 4 * bump(d, 270, 90) + 42 * bump(d, 258, 60) + 12 * bump(d, 236, 34)), sideMaxY: 300 },
  B: { id: "B", name: "Topknude", hairline: [[388, 298], [385, 272], [390, 250], [402, 234], [430, 222], [470, 216], [512, 214], [556, 216], [596, 224], [618, 234], [630, 252], [635, 274], [632, 298]],
    extra: (d, y) => (y > 298 ? 0 : 4 + 2 * bump(d, 270, 90)), bun: { cx: 512, cy: 90, r: 40 }, sideMaxY: 298 },
  C: { id: "C", name: "Nakkelokker", hairline: [[386, 300], [383, 270], [389, 248], [405, 234], [440, 230], [478, 214], [512, 202], [546, 214], [584, 228], [616, 232], [630, 250], [636, 272], [634, 300]],
    extra: (d, y) => 14 + 4 * bump(d, 270, 60), behindEars: { yFrom: 250, yTo: 425, width: 30 }, sideMaxY: 425 },
});
/** A design's silhouette (the zone hair is drawn in) on the figure grid; `tips` adds the rehearsal's tuft wave along the forehead. */
export function silhouette(G, D, { tips = 0 } = {}) {
  const M = new Uint8Array(N), wave = (x) => (tips && x >= 398 && x <= 624 ? tips * (1 - Math.abs(((x % 18) / 9) - 1)) : 0);
  const blocked = (i) => G.KEEP[i] && (G.head[i] || !G.EARP[i] || G.EAR[i]);   // outside the head the ring round an ear may hold hair (behind the ear)
  for (let y = 0; y < 520; y++) for (let x = 250; x < 780; x++) {
    const i = y * W + x; if (blocked(i)) continue;
    const d = angleOf(G, x, y), r = rOf(G, x, y), rh = G.rHead[Math.round(d * 2) % 720];
    if (G.head[i]) {
      if (y >= 310) continue;
      const hy = lerpLine(D.hairline, x);
      if (hy === null) { if (y <= D.hairline[0][1] && (x < D.hairline[0][0] || x > D.hairline[D.hairline.length - 1][0])) M[i] = 1; continue; }
      if (y < hy + wave(x)) M[i] = 1;
      continue;
    }
    const sideTaper = D.behindEars ? 1 : Math.max(0, Math.min(1, (302 - y) / 46));
    if (y <= Math.min(D.sideMaxY, 300) && r <= rh + D.extra(d, y) * sideTaper) M[i] = 1;
    if (D.bun && Math.hypot(x - D.bun.cx, y - D.bun.cy) <= D.bun.r) M[i] = 1;
    if (D.behindEars && y >= D.behindEars.yFrom && y <= D.behindEars.yTo) {
      const b = D.behindEars, grow = Math.min(1, (y - b.yFrom) / 50), base0 = D.extra(d, y), taper = y > b.yTo - 40 ? (b.yTo - y) / 40 : 1;
      if (r <= rh + (base0 + (b.width - base0) * grow) * taper + (tips ? wave(y) : 0)) M[i] = 1;
    }
  }
  for (let i = 0; i < N; i++) if (blocked(i)) M[i] = 0;
  return M;
}
/** Silhouette IoU at app size (÷4) over what tells hairstyles apart: outside the head and the forehead band y 170–250. */
export function appIoU(G, a, b) {
  const k = 4, w = W / k, h = H / k, roi = (i) => { const y = (i / W) | 0; return !G.head[i] || (y >= 170 && y <= 250); };
  const small = (m) => { const o = new Uint8Array(w * h); for (let Y = 0; Y < h; Y++) for (let X = 0; X < w; X++) { let s = 0; for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) { const i = (Y * k + dy) * W + X * k + dx; if (roi(i) && m[i]) s++; } o[Y * w + X] = s >= 8 ? 1 : 0; } return o; };
  const A = small(a), B = small(b); let I = 0, U = 0; for (let i = 0; i < A.length; i++) { if (A[i] && B[i]) I++; if (A[i] || B[i]) U++; } return U ? I / U : 0;
}
export const alphaMask = (P, thr = 128) => { const m = new Uint8Array(N); for (let i = 0; i < N; i++) if (P[i * 4 + 3] >= thr) m[i] = 1; return m; };

// ── 3. the call's input images ──────────────────────────────────────────────────────────────────────────────────────
export const COLOURS = Object.freeze({ zone: [120, 160, 225], keep: [225, 50, 50], line: [30, 50, 140], zoneAlpha: 0.42, keepAlpha: 0.6, fade: 0.4 });
/** Image 1 (the base's head) and Image 2 (the guide for design `id`), 1024×1024 RGBA, in the D-371 square ×2. */
export function inputImages(base, ear, id = CHOSEN) {
  const G = geometry(base, ear), D = DESIGNS[id], M = silhouette(G, D), K = COLOURS;
  const Gd = new Uint8ClampedArray(N * 4);
  for (let i = 0; i < N; i++) { const a = base[i * 4 + 3] / 255; for (let c = 0; c < 3; c++) { const v = base[i * 4 + c] * a + 255 * (1 - a); Gd[i * 4 + c] = Math.round(255 - (255 - v) * K.fade); } Gd[i * 4 + 3] = 255; }
  const tint = (m, rgb, k) => { for (let i = 0; i < N; i++) if (m[i]) for (let c = 0; c < 3; c++) Gd[i * 4 + c] = Math.round(Gd[i * 4 + c] * (1 - k) + rgb[c] * k); };
  tint(M, K.zone, K.zoneAlpha); tint(G.KEEP, K.keep, K.keepAlpha);
  const dot = (cx, cy, r, rgb) => { for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) Gd.set([...rgb, 255], (y * W + x) * 4); };
  const hl = D.hairline; for (let k = 1; k < hl.length; k++) { const [x0, y0] = hl[k - 1], [x1, y1] = hl[k], n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2); for (let s = 0; s <= n; s++) dot(Math.round(x0 + (x1 - x0) * s / n), Math.round(y0 + (y1 - y0) * s / n), 1, K.line); }
  dot(...hl[0], 4, K.line); dot(...hl[hl.length - 1], 4, K.line);
  return { head: T.cropOut(base, 2), guide: T.cropOut(Gd, 2) };
}
/** Image 3: Northstar's own painted body in the cream tee (the published runtime layers, no head, no hair), figure y 430–941, ×2. */
export function styleImage(layers) {
  const body = NL.overStack(layers), fig = new Uint8ClampedArray(N * 4);
  for (let y = 0; y < 512; y++) for (let x = 0; x < W; x++) { const sy = y + STYLE_Y; fig.set(body.subarray((sy * W + x) * 4, (sy * W + x) * 4 + 4), (y * W + x) * 4); }
  return T.cropOut(fig, 2);
}

// ── 4. the post-processing ──────────────────────────────────────────────────────────────────────────────────────────
export const GATES = Object.freeze({
  P1: { rule: "registration on the face: |scale − 1| ≤ 0.04, |shift| ≤ 40 px (call frame), mean face error ≤ 14", maxScale: 0.04, maxShift: 40, maxErr: 14 },
  P2: { rule: "scalp covered: ≥ 98 % of the design's scalp has hair alpha ≥ 250", min: 0.98 },
  P3: { rule: "brows and eyes free: ≤ 10 px of grey hair on the brows' keep-clear zone in the RESULT; 0 px on brows and eyes in the layer; ≥ 6 px gap above each brow", maxRaw: 10, minGap: 6 },
  P4: { rule: "ears and neck: ≤ 10 px of grey hair on the ears or their skin margin in the RESULT; no hair on the ears in the layer; the ears' soft edges identical to the base; ≤ 20 px of hair (alpha ≥ 32) on the face and neck below the ear tops", maxRaw: 10, maxFace: 20 },
  P5: { rule: "one piece: the largest piece holds ≥ 98 % of the hair", min: 0.98 },
  P6: { rule: "the base is unchanged wherever the hair layer is empty (pixel for pixel)" },
  P7: { rule: "greyscale: ≥ 90 % of the lifted hair pixels are neutral grey (saturation < 0.12)", min: 0.9 },
  P8: { rule: "its own look at app size (÷4): silhouette IoU ≤ 0.75 with the standard hair and with NH-4, and ≥ 0.60 with the ordered design", max: 0.75, minDesign: 0.6 },
  P9: { rule: "the shape is followed overall: ≤ 3 % of the result's grey hair lies more than 8 px outside the design's zone", max: 0.03 },
  P10: { rule: "no cut: where the layer ends although the result's grey hair continues (not under an ear), the longest connected run ≤ 6 px, reported for the forehead and each temple", maxRun: 6 },
  P11: { rule: "no local spill: the largest connected cluster of grey hair more than 8 px outside the zone ≤ 60 px", max: 60 },
  P12: { rule: "no local hole: the largest connected uncovered piece of the scalp ≤ 40 px", max: 40 },
});
/** Connected pieces of a mask (largest first), each with its pixel count and bounding box. */
export function pieces(m, w = W, h = H, conn8 = true) {
  const n = w * h, lab = new Uint8Array(n), out = [];
  for (let i = 0; i < n; i++) if (m[i] && !lab[i]) { let c = 0; const st = [i]; lab[i] = 1; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    while (st.length) { const k = st.pop(); c++; const x = k % w, y = (k / w) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      const nb = conn8 ? [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]] : [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dx, dy] of nb) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const q = yy * w + xx; if (m[q] && !lab[q]) { lab[q] = 1; st.push(q); } } }
    out.push({ px: c, box: [x0, y0, x1, y1] }); }
  return out.sort((a, b) => b.px - a.px);
}

/** One returned 1024×1024 image → the separate grey and tinted hair layers on the base, the composite and P1–P12. */
export function postProcess({ result: O, base, ear, G = geometry(base, ear), M = silhouette(G, DESIGNS[CHOSEN]), std = alphaMask(FIG.buildFigure().layers.hair), nh4 }) {
  if (!O || O.length !== S * S * 4) throw new Error("a 1024×1024 RGBA result is required");
  if (!nh4) throw new Error("NH-4's hair mask is required for P8");
  const t = G.t, EAR = G.EAR;
  // registration on the face (call frame), as D-371/D-372
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
  const OF = T.mapBack(OR);
  // compare like with like: the base after the same call-frame round trip (×2, then ÷2)
  const BR = T.mapBack(T.cropOut(base, 2));
  const dist = new Float32Array(N).fill(1e9); for (let i = 0; i < N; i++) if (M[i]) dist[i] = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; dist[i] = Math.min(dist[i], dist[i - 1] + 1, dist[i - W] + 1, dist[i - W - 1] + 1.41, dist[i - W + 1] + 1.41); }
  for (let y = H - 2; y > 0; y--) for (let x = W - 2; x > 0; x--) { const i = y * W + x; dist[i] = Math.min(dist[i], dist[i + 1] + 1, dist[i + W] + 1, dist[i + W + 1] + 1.41, dist[i + W - 1] + 1.41); }
  const onWhite = (Q, i) => { const a = Q[i * 4 + 3] / 255; return [0, 1, 2].map((q) => Q[i * 4 + q] * a + 255 * (1 - a)); };
  const hairy = (i) => { if (OF[i * 4 + 3] < 128 || sat(OF, i) >= 0.12) return false; const o = onWhite(OF, i), b = onWhite(BR, i); if (Math.hypot(o[0] - b[0], o[1] - b[1], o[2] - b[2]) <= 45) return false; return 0.299 * b[0] + 0.587 * b[1] + 0.114 * b[2] > 110; };
  const raw = { brows: 0, ears: 0, spill: 0, total: 0 }, SPILL = new Uint8Array(N);
  for (let i = 0; i < N; i++) { if (!hairy(i)) continue; raw.total++; if (G.EARP[i] && (EAR[i] || G.head[i])) raw.ears++; else if (G.BROWZ[i]) raw.brows++; else if (!G.KEEP[i] && dist[i] > 8) { raw.spill++; SPILL[i] = 1; } }
  // V2 lift: the grey core inside the loose zone, grown through the result's connected grey hair out to the tips (within +40 px)
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
  { const m = new Uint8Array(N); for (let i = 0; i < N; i++) if (GL[i * 4 + 3]) m[i] = 1; const lab = new Int32Array(N); let nn = 0;   // specks under 80 px go
    for (let i = 0; i < N; i++) if (m[i] && !lab[i]) { nn++; const s2 = [i], all = []; lab[i] = nn; while (s2.length) { const k = s2.pop(); all.push(k); for (const q of [k - 1, k + 1, k - W, k + W, k - W - 1, k - W + 1, k + W - 1, k + W + 1]) if (m[q] && !lab[q]) { lab[q] = nn; s2.push(q); } } if (all.length < 80) for (const k of all) GL[k * 4 + 3] = 0; } }
  for (let i = 0; i < N; i++) if (EAR[i]) GL[i * 4 + 3] = 0;
  // tint (Northstar's own value steps), compose on the base: the ears on top, the base wherever the layer is empty
  const HL = northstarTint(GL);
  const EARTOP = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) if (EAR[i]) EARTOP.set(base.subarray(i * 4, i * 4 + 4), i * 4);
  const pic = NL.overStack([base, HL, EARTOP]); for (let i = 0; i < N; i++) if (HL[i * 4 + 3] === 0) pic.set(base.subarray(i * 4, i * 4 + 4), i * 4);
  const A = (i) => HL[i * 4 + 3], g = {}, Gt = GATES;
  g.P1 = { ...reg, pass: Math.abs(reg.scale - 1) <= Gt.P1.maxScale && Math.abs(reg.dx) <= Gt.P1.maxShift && Math.abs(reg.dy) <= Gt.P1.maxShift && reg.faceErr <= Gt.P1.maxErr };
  const nonHairHead = new Uint8Array(N); for (let i = 0; i < N; i++) if (G.head[i] && !M[i] && ((i / W) | 0) > 190) nonHairHead[i] = 1;
  const nearFace = G.dil(nonHairHead, 14), SCALP = new Uint8Array(N); for (let i = 0; i < N; i++) if (M[i] && G.head[i] && !nearFace[i] && ((i / W) | 0) < 290) SCALP[i] = 1;
  { let n = 0, c = 0; const HOLE = new Uint8Array(N); for (let i = 0; i < N; i++) if (SCALP[i]) { n++; if (A(i) >= 250) c++; else HOLE[i] = 1; }
    g.P2 = { covered: +(c / n).toFixed(4), pass: c / n >= Gt.P2.min };
    const holes = pieces(HOLE, W, H, false); g.P12 = { largestHolePx: holes.length ? holes[0].px : 0, at: holes.length ? holes[0].box : null, pass: (holes.length ? holes[0].px : 0) <= Gt.P12.max }; }
  { let onBrow = 0, eyes = 0; const gap = { left: 1e9, right: 1e9 }; for (let i = 0; i < N; i++) { if (G.BROW[i] && A(i) >= 128) onBrow++; if (t.z.eyesClear[i] && A(i) >= 128) eyes++; }
    for (const sd of ["left", "right"]) for (let i = 0; i < N; i++) if (t.z.brows[sd][i]) { const x = i % W, y = (i / W) | 0; for (let k = 1; k < 30; k++) if (A((y - k) * W + x) >= 128) { gap[sd] = Math.min(gap[sd], k); break; } }
    g.P3 = { rawOnBrowsPx: raw.brows, layerOnBrowsPx: onBrow, layerOnEyesPx: eyes, gapPx: gap, pass: raw.brows <= Gt.P3.maxRaw && onBrow === 0 && eyes === 0 && gap.left >= Gt.P3.minGap && gap.right >= Gt.P3.minGap }; }
  { let onEar = 0, soft = 0, softSame = 0, face = 0; for (let i = 0; i < N; i++) { if (EAR[i]) { if (A(i)) onEar++; if (base[i * 4 + 3] > 0 && base[i * 4 + 3] < 255) { soft++; if (same(pic, base, i)) softSame++; } } if (G.head[i] && !EAR[i] && ((i / W) | 0) > 310 && A(i) >= 32) face++; }
    g.P4 = { rawOnEarsPx: raw.ears, layerOnEarsPx: onEar, earSoftEdges: soft, earSoftIdentical: softSame, faceAndNeckBelowEarTopsPx: face, pass: raw.ears <= Gt.P4.maxRaw && onEar === 0 && softSame === soft && face <= Gt.P4.maxFace }; }
  { const m = new Uint8Array(N); let tot = 0; for (let i = 0; i < N; i++) if (A(i) >= 128) { m[i] = 1; tot++; } const c = pieces(m, W, H, false); g.P5 = { hairPx: tot, largestShare: tot ? +(c[0].px / tot).toFixed(4) : 0, pass: tot > 0 && c[0].px / tot >= Gt.P5.min }; }
  { let n = 0, s = 0; for (let i = 0; i < N; i++) if (A(i) === 0) { n++; if (same(pic, base, i)) s++; } g.P6 = { px: n, identical: s, pass: n === s }; }
  g.P7 = { candidates: cand, greyShare: cand ? +(greyN / cand).toFixed(4) : 0, pass: cand > 0 && greyN / cand >= Gt.P7.min };
  { const me = alphaMask(HL), iou = { standard: +appIoU(G, me, std).toFixed(3), nh4: +appIoU(G, me, nh4).toFixed(3), design: +appIoU(G, me, M).toFixed(3) };
    g.P8 = { iou, pass: iou.standard <= Gt.P8.max && iou.nh4 <= Gt.P8.max && iou.design >= Gt.P8.minDesign }; }
  g.P9 = { rawGreyPx: raw.total, spillPx: raw.spill, spillShare: raw.total ? +(raw.spill / raw.total).toFixed(4) : 0, pass: raw.total === 0 || raw.spill / raw.total <= Gt.P9.max };
  { const c = cutCheck({ HL, OF, base: BR, Z: { EAR } }); g.P10 = { cutEdgePx: c.cutEdgePx, longestRun: c.longestRun, longestBy: c.longestBy, top: c.top, pass: c.longestRun <= Gt.P10.maxRun }; }
  { const c = pieces(SPILL); g.P11 = { largestSpillClusterPx: c.length ? c[0].px : 0, at: c.length ? c[0].box : null, pass: (c.length ? c[0].px : 0) <= Gt.P11.max }; }
  const failed = Object.keys(GATES).filter((k) => !g[k].pass);
  return { report: { verdict: failed.length ? "REJECTED" : "PASSES CHECKS — the owner's visual review next", failed, checks: g }, GL, HL, pic };
}

// ── 5. the rehearsal: nine simulated results, each with its expected verdict ────────────────────────────────────────
/** A grey "painted" hairstyle on the base (the rehearsal's simulated result): shaded by distance from its edge, a dark 2 px outline;
 *  the base itself wherever nothing is painted (the ears included). */
export function paintGrey(base, M) {
  const D = new Float32Array(N).fill(1e9); for (let i = 0; i < N; i++) if (!M[i]) D[i] = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; if (D[i]) D[i] = Math.min(D[i], D[i - 1] + 1, D[i - W] + 1); }
  for (let y = H - 2; y > 0; y--) for (let x = W - 2; x > 0; x--) { const i = y * W + x; if (D[i]) D[i] = Math.min(D[i], D[i + 1] + 1, D[i + W] + 1); }
  const hair = new Uint8ClampedArray(N * 4);
  for (let i = 0; i < N; i++) if (M[i]) { const d = D[i], x = i % W, y = (i / W) | 0; const g = d <= 2 ? 34 : Math.round(90 + 70 * Math.min(1, d / 24) + 30 * Math.sin((x + y) / 9)); hair.set([g, g, g, 255], i * 4); }
  const o = NL.overStack([base, hair]); for (let i = 0; i < N; i++) if (!M[i]) o.set(base.subarray(i * 4, i * 4 + 4), i * 4);
  return o;
}
export const REHEARSAL = Object.freeze([
  { key: "A", what: "exact, with fringe tips", expect: [] },
  { key: "B", what: "moved +10/−6 px and scaled 1.02", expect: [] },
  { key: "C", what: "fringe drawn down over the left brow (a local cut at the hairline)", expect: ["P3", "P10"], cutAt: "forehead" },
  { key: "D", what: "grey painted over the right ear", expect: ["P4"] },
  { key: "E", what: "the right temple's tip drawn down over the brow's end and the eye's corner (a local cut at the temple)", expect: ["P3", "P10"], cutAt: "right temple" },
  { key: "F", what: "one loose tuft outside the zone (small overall share)", expect: ["P11"] },
  { key: "G", what: "one hole in the scalp (small overall share)", expect: ["P12"] },
  { key: "H", what: "the standard hair's silhouette", expect: ["P8"] },
  { key: "I", what: "no hair", expect: ["P2", "P5", "P7"] },
]);
/** Runs the nine cases; every expected gate must fail, and the exact cases must pass. Returns rows and the composite of case A. */
export function rehearsal({ base, ear, nh4 }) {
  const G = geometry(base, ear), M = silhouette(G, DESIGNS[CHOSEN]), std = alphaMask(FIG.buildFigure().layers.hair), tips = silhouette(G, DESIGNS[CHOSEN], { tips: 5 });
  const add = (m, f) => { const o = new Uint8Array(m); for (let y = 0; y < 600; y++) for (let x = 250; x < 780; x++) if (f(x, y)) o[y * W + x] = 1; return o; };
  const sub = (m, f) => { const o = new Uint8Array(m); for (let y = 0; y < 600; y++) for (let x = 250; x < 780; x++) if (f(x, y)) o[y * W + x] = 0; return o; };
  const call = (fig) => T.cropOut(fig, 2);
  const onEars = (fig, b) => { const o = new Uint8ClampedArray(fig); for (let y = b[1]; y <= b[3]; y++) for (let x = b[0]; x <= b[2]; x++) { const i = y * W + x; if (ear[i * 4 + 3]) o.set([70, 70, 70, 255], i * 4); } return o; };
  const img = {
    A: () => call(paintGrey(base, tips)),
    B: () => drift(call(paintGrey(base, tips)), 1.02, 10, -6),
    C: () => call(paintGrey(base, add(tips, (x, y) => x >= 410 && x <= 470 && y >= 215 && y <= 256 && !G.t.z.eyesClear[y * W + x]))),
    D: () => call(onEars(paintGrey(base, tips), [625, 300, 680, 335])),
    E: () => call(paintGrey(base, add(tips, (x, y) => x >= 600 && x <= 630 && y >= 236 && y <= 300 && !G.EARP[y * W + x]))),
    F: () => call(paintGrey(base, add(tips, (x, y) => Math.hypot(x - 440, y - 92) <= 7))),
    G: () => call(paintGrey(base, sub(tips, (x, y) => x >= 520 && x < 550 && y >= 160 && y < 164))),
    H: () => call(paintGrey(base, std)),
    I: () => call(base),
  };
  const rows = []; let compositeA = null;
  for (const c of REHEARSAL) {
    const r = postProcess({ result: img[c.key](), base, ear, G, M, std, nh4 }), got = r.report.failed;
    const cutOk = !c.cutAt || (r.report.checks.P10.longestBy[c.cutAt] || 0) > GATES.P10.maxRun;   // the cut is found WHERE it is
    const asExpected = (c.expect.length ? c.expect.every((p) => got.includes(p)) : got.length === 0) && cutOk;
    const k = r.report.checks;
    rows.push({ case: c.key, what: c.what, expected: c.expect, cutAt: c.cutAt || null, failed: got, asExpected,
      measured: { P1: [k.P1.scale, k.P1.dx, k.P1.dy], P2: k.P2.covered, P3raw: k.P3.rawOnBrowsPx, P4raw: k.P4.rawOnEarsPx, P8: k.P8.iou, P9: k.P9.spillShare, P10: k.P10.longestRun, P10by: k.P10.longestBy, P11: k.P11.largestSpillClusterPx, P12: k.P12.largestHolePx } });
    if (c.key === "A") compositeA = r.pic;
  }
  return { rows, allAsExpected: rows.every((r) => r.asExpected), compositeA };
}

// ── CLI ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
function main() {
  const args = process.argv.slice(2), arg = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
  const outside = (d) => { if (!d) return false; const r = relative(ROOT, resolve(d)); return r.startsWith("..") || isAbsolute(r); };
  const OUT = arg("--out"); if (!OUT || !outside(OUT)) throw new Error("--out <empty directory outside the repository>");
  if (existsSync(OUT) && readdirSync(OUT).length) throw new Error("output directory not empty");
  const px = (f) => { if (!outside(f)) throw new Error("the private images stay outside the repository: " + f); return decodePng(readFileSync(f)).px; };
  if (args.includes("--inputs")) {
    const dwebp = arg("--dwebp"), clean = arg("--clean"), ear = arg("--ear");
    if (!dwebp || !existsSync(dwebp) || !clean || !ear) throw new Error("--inputs --clean <png> --ear <png> --dwebp <exe> --out <dir>");
    const fx = JSON.parse(readFileSync(join(ROOT, ...D373_FIXTURE.split("/")), "utf8"));
    for (const [role, f] of [["clean", clean], ["ear", ear]]) if (sha256(readFileSync(f)) !== fx.inputs.find((i) => i.role === role).sha256) throw new Error(role + " is not D-373's pinned file");
    if (sha256(readFileSync(join(ROOT, ...APP_HEAD.split("/")))) !== fx.appHead.sha256) throw new Error(APP_HEAD + " is not D-373's pinned file");
    const tmp = mkdtempSync(join(tmpdir(), "nh5-")); let n = 0;
    const webp = (rel) => { const p = join(tmp, (n++) + ".png"); execFileSync(dwebp, ["-quiet", join(ROOT, ...rel.split("/")), "-o", p]); return decodePng(readFileSync(p)).px; };
    const base = d373Base({ clean: px(clean), appHead: webp(APP_HEAD) });
    const check = baseCheck(base, webp(NH4_HEADS.grey), webp(NH4_HEADS.brown)); if (!check.pass) throw new Error("the base is not D-373's: " + JSON.stringify(check));
    const img = inputImages(base, px(ear)), style = styleImage(STYLE_LAYERS.map((f) => webp("assets/avatar-northstar/" + f)));
    mkdirSync(OUT, { recursive: true });
    const files = { [NAMES.base]: encodePng(W, H, base), [NAMES.head]: encodePng(S, S, img.head), [NAMES.guide]: encodePng(S, S, img.guide), [NAMES.style]: encodePng(S, S, style) };
    for (const [k, b] of Object.entries(files)) writeFileSync(join(OUT, k), b);
    console.log(JSON.stringify({ baseCheck: check, files: Object.fromEntries(Object.entries(files).map(([k, b]) => [k, { bytes: b.length, sha256: sha256(b) }])) }, null, 1));
    return;
  }
  const base = px(arg("--base")), ear = px(arg("--ear")), nh4 = alphaMask(px(arg("--nh4")));
  mkdirSync(OUT, { recursive: true });
  if (args.includes("--post")) {
    const { report, GL, HL, pic } = postProcess({ result: px(arg("--result")), base, ear, nh4 });
    writeFileSync(join(OUT, "nh5b-hair-grey-layer.png"), encodePng(W, H, GL)); writeFileSync(join(OUT, "nh5b-hair-layer.png"), encodePng(W, H, HL)); writeFileSync(join(OUT, "nh5b-on-base-full.png"), encodePng(W, H, pic));
    writeFileSync(join(OUT, "checks.json"), JSON.stringify(report, null, 1) + "\n"); console.log(JSON.stringify({ verdict: report.verdict, failed: report.failed }));
    return;
  }
  if (args.includes("--rehearsal")) {
    const r = rehearsal({ base, ear, nh4 });
    writeFileSync(join(OUT, "rehearsal.json"), JSON.stringify(r.rows, null, 1) + "\n"); writeFileSync(join(OUT, "case-A-on-base-full.png"), encodePng(W, H, r.compositeA));
    for (const row of r.rows) console.log((row.asExpected ? "OK   " : "FAIL ") + row.case + " " + row.what + " | expected " + (row.expected.join(",") || "pass") + " | failed " + (row.failed.join(",") || "none"));
    if (!r.allAsExpected) process.exitCode = 1;
    return;
  }
  throw new Error("--inputs, --post or --rehearsal");
}
if (typeof process.argv[1] === "string" && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
