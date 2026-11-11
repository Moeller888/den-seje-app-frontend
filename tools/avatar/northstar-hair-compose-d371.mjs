// D-371 NH-1B — THE FIXED COMPOSITION (owner-approved method, 2026-11-11): the image model draws the hair inside the Kort shape; our own
// layers set the hair's border at both ears. Deterministic, offline; no image call. Stack on the figure grid, bottom → top:
//   1. the bald head (the D-371 template, unchanged)
//   2. TEMPLE: a narrow fill-only strip — each skin flap, and 6 px on under the ear (hidden by 4); if it shows, M11 rejects
//   3. the DRAWING (the call's 1024×1024 result, placed as in D-371: ÷2 at (256, 0)), clipped to the Kort silhouette; where the clip cuts
//      strands over visible skin or background, a 3 px line closes the edge
//   4. EAR: the bald head's own ear pixels, byte for byte, through the CORRECTED ear mask — the template's ear plus the ear's front bowl it
//      misses (rows without a flap pixel), minus the skin strip above the ear's drawn top and the 1-row slip through the left flap
//   5. EAR FRONT LINE: 2 px along the interpolated front edge, only where the bald head draws no line
// Gates: M10 on the RAW placed drawing, before any clip (the clip can never hide a large deviation); D-371's M1–M9 on the VISIBLE hair of
// the composite (what the ear leaves) with the call image for M8's margin; M11 on the composite. Then the owner's visual review.
// Usage:
//   node tools/avatar/northstar-hair-compose-d371.mjs --inputs <dir outside the repository>        writes Image 2 (the guide) for NH-1B
//   … --write-fixture                                                                               writes fixtures/northstar-hair-d371/composition-nh1b-v1.json
//   … --measure <returned 1024×1024 png> --out <empty dir outside the repository>                  composes and measures one result
//   … --examples --out <empty dir outside the repository>                                           the dry run of the gates on two simulated results
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, resolve, dirname, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import * as T from "./northstar-hair-template-d371.mjs";
import { encodePng, decodePng, pixelSha256 } from "./r3-hair-tool-v2.mjs";
import * as NL from "./r3-northstar-layers.mjs";
import { buildKortSilhouette } from "./northstar-kort-silhouette-d371.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const W = 1024, H = 1536, N = W * H, row = (i) => (i / W) | 0, col = (i) => i % W;
export const FIXTURE = "tools/avatar/fixtures/northstar-hair-d371/composition-nh1b-v1.json";
export const GUIDE_NAME = "northstar-kort-guide-ears-on-top-1024.png";
/** The gates added for NH-1B (owner-approved limits); M1–M9 are D-371's, unchanged. */
export const GATES = Object.freeze({
  M10: { on: "the raw placed drawing, before any clip", tolerancePx: 4, maxOutsideShare: 0.01, maxCoreMissingShare: 0.01, minIoU: 0.9,
    rule: "hair alpha ≥ 128: at most 1 % outside the silhouette grown by 4 px; at most 1 % of the silhouette shrunk by 4 px empty; IoU with the silhouette ≥ 0.90" },
  M11: { on: "the composite", maxFlatShare: 0.03, rule: "at most 3 % of the visible TEMPLE strip left uncovered by the drawing (no flat patch)" },
});
export const RULES = Object.freeze({ templeUnderEarPx: 6, cutLinePx: 3, frontLinePx: 2, lineGrey: 24, templeGrey: 132, guideFill: 205, earZone: { abovePx: 40, belowPx: 8, outerPx: 30, innerPx: 14 } });

const dil = (m, r) => { const o = new Uint8Array(N); for (let i = 0; i < N; i++) if (m[i]) { const x = col(i), y = row(i); for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < W && Y < H) o[Y * W + X] = 1; } } return o; };
const count = (m) => m.reduce((a, v) => a + (v ? 1 : 0), 0);
const lum = (P, i) => 0.299 * P[i * 4] + 0.587 * P[i * 4 + 1] + 0.114 * P[i * 4 + 2];

/** The corrected ear mask (what is laid on top of the hair) and the front line, from the template alone. */
export function earOnTop(t) {
  const { z, spec } = t, sides = { left: spec.temples.left, right: spec.temples.right };
  const bowl = new Uint8Array(N), frontLine = new Uint8Array(N), bowlReport = {};
  for (const [s, f] of Object.entries(sides)) {
    const R = s === "right", outer = new Map();   // the flap's ear-side edge per row
    for (let y = f.y0; y <= f.y1; y++) { let e = null; for (let x = f.x0; x <= f.x1; x++) if (z.flap[y * W + x]) e = e === null ? x : R ? Math.max(e, x) : Math.min(e, x); if (e !== null) outer.set(y, e); }
    const ys = [...outer.keys()].sort((a, b) => a - b); let px = 0; const rows = [];
    for (let y = ys[0]; y <= ys[ys.length - 1]; y++) {
      let ex = outer.get(y), interpolated = false;
      if (ex === undefined) { const a = ys.filter((k) => k < y).pop(), b = ys.find((k) => k > y); ex = Math.round(outer.get(a) + (outer.get(b) - outer.get(a)) * (y - a) / (b - a)); interpolated = true; }
      // from the front edge towards the ear until the template's ear begins: head skin there is the ear's bowl
      let n = 0; for (let k = 1; k < 30; k++) { const x = R ? ex + k : ex - k, i = y * W + x; if (z.ears[i] || !z.head[i]) break; if (z.eyesClear[i]) break; bowl[i] = 1; n++; }
      if (interpolated) { frontLine[y * W + ex] = 1; frontLine[y * W + (R ? ex + 1 : ex - 1)] = 1; }
      if (n) { px += n; rows.push(y); }
    }
    bowlReport[s] = { px, rows: rows.length ? [rows[0], rows[rows.length - 1]] : null };
  }
  const EARC = new Uint8Array(N); for (let i = 0; i < N; i++) if (z.ears[i] || bowl[i]) EARC[i] = 1;
  // above the ear's drawn top the template's ear holds a strip of head skin: there the ear goes on top only from its own outline down
  const topStrip = new Uint8Array(N); for (const s of ["left", "right"]) { const e = spec.ears[s];
    for (let x = e.x0; x <= e.x1; x++) { let top = -1; for (let y = e.y0; y <= e.y0 + 40; y++) if (EARC[y * W + x]) { top = y; break; } if (top < 0) continue;
      const run = []; let found = false; for (let y = top; y <= top + 12; y++) { const i = y * W + x; if (!EARC[i]) break; if (lum(t.bald, i) < 110) { found = true; break; } run.push(i); }
      if (found) for (const i of run) topStrip[i] = 1; } }
  for (let i = 0; i < N; i++) if (topStrip[i]) EARC[i] = 0;
  // the 1-row slip: an ear pixel with flap within 2 rows above AND below it is flap, not ear
  const slip = new Uint8Array(N); for (let i = 0; i < N; i++) if (EARC[i]) { let up = false, dn = false; for (let d = 1; d <= 2; d++) { if (z.flap[i - d * W]) up = true; if (z.flap[i + d * W]) dn = true; } if (up && dn) slip[i] = 1; }
  for (let i = 0; i < N; i++) if (slip[i]) EARC[i] = 0;
  for (let i = 0; i < N; i++) if (frontLine[i] && lum(t.bald, i) < 110) frontLine[i] = 0;   // only where the bald head draws no line
  return { EARC, bowl, frontLine, report: { bowl: bowlReport, topStripPx: count(topStrip), slipPx: count(slip), frontLinePx: count(frontLine), earOnTopPx: count(EARC) } };
}

/** Every fixed layer of the composition: the silhouette, the strip, the ear on top and the front line. */
export function compositionLayers(t, sil = buildKortSilhouette(t)) {
  const { z, spec } = t, ear = earOnTop(t), { EARC, frontLine } = ear;
  const SILM = new Uint8Array(N); for (let i = 0; i < N; i++) if (sil.front[i] || sil.behind[i]) SILM[i] = 1;
  const ez = RULES.earZone, earZone = new Uint8Array(N);
  for (const s of ["left", "right"]) { const f = spec.temples[s], e = spec.ears[s]; const x0 = s === "left" ? e.x0 - ez.outerPx : f.x0 - ez.innerPx, x1 = s === "left" ? f.x1 + ez.innerPx : e.x1 + ez.outerPx;
    for (let y = e.y0 - ez.abovePx; y <= Math.max(f.y1, e.y1) + ez.belowPx; y++) for (let x = x0; x <= x1; x++) earZone[y * W + x] = 1; }
  const under = dil(z.flap, RULES.templeUnderEarPx), TEMPLE_M = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (earZone[i] && (z.flap[i] || (under[i] && EARC[i]))) TEMPLE_M[i] = 1;
  const g = RULES.templeGrey, TEMPLE = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) if (TEMPLE_M[i]) TEMPLE.set([g, g, g, 255], i * 4);
  const EAR = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) if (EARC[i]) EAR.set(t.bald.subarray(i * 4, i * 4 + 4), i * 4);
  const l = RULES.lineGrey, LINE = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) if (frontLine[i]) LINE.set([l, l, l, 255], i * 4);
  const grow = dil(SILM, GATES.M10.tolerancePx), core = Uint8Array.from(dil(Uint8Array.from(SILM, (v) => 1 - v), GATES.M10.tolerancePx), (v) => 1 - v);
  return { sil, SILM, EARC, TEMPLE_M, TEMPLE, EAR, LINE, under, grow, core, ear };
}

/** The composition of one placed drawing D (figure grid, straight alpha). */
export function composeDrawing(t, L, D) {
  const { SILM, EARC, TEMPLE_M, TEMPLE, EAR, LINE } = L, M = new Uint8ClampedArray(N * 4), cut = new Uint8Array(N), lg = RULES.lineGrey;
  for (let i = 0; i < N; i++) if (D[i * 4 + 3]) { if (SILM[i]) M.set(D.subarray(i * 4, i * 4 + 4), i * 4); else cut[i] = 1; }
  // close each cut over visible skin or background with a 3 px line inside the kept hair
  const near = dil(cut, RULES.cutLinePx); for (let i = 0; i < N; i++) if (near[i] && M[i * 4 + 3] >= 128 && !EARC[i]) { const x = col(i); let edge = false; for (const k of [i - 1, i + 1, i - W, i + W]) if (cut[k] && Math.abs(col(k) - x) <= 1) edge = true;
    if (edge) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const k = i + dy * W + dx; if (M[k * 4 + 3] >= 128 && !EARC[k]) M.set([lg, lg, lg, 255], k * 4); } }
  const hair = NL.overStack([TEMPLE, M]);
  const vis = new Uint8ClampedArray(hair); for (let i = 0; i < N; i++) if (EARC[i]) vis[i * 4 + 3] = 0;   // what the ear on top leaves visible
  const pic = NL.overStack([t.bald, hair, EAR, LINE]);
  let tv = 0, tn = 0; for (let i = 0; i < N; i++) if (TEMPLE_M[i] && !EARC[i]) { tn++; if (M[i * 4 + 3] < 128) tv++; }
  const flat = tn ? tv / tn : 0;
  return { M, hair, vis, pic, M11: { pass: flat <= GATES.M11.maxFlatShare, flatShare: flat } };
}

/** M10 on the raw placed drawing. */
export function measureM10(L, D) {
  let r = 0, out = 0, I = 0, U = 0, core = 0, miss = 0;
  for (let i = 0; i < N; i++) { const h = D[i * 4 + 3] >= 128; if (h) { r++; if (!L.grow[i]) out++; } if (h && L.SILM[i]) I++; if (h || L.SILM[i]) U++; if (L.core[i]) { core++; if (!h) miss++; } }
  const v = { outsideShare: r ? out / r : 1, coreMissingShare: core ? miss / core : 1, iou: U ? I / U : 0 }, G = GATES.M10;
  return { pass: v.outsideShare <= G.maxOutsideShare && v.coreMissingShare <= G.maxCoreMissingShare && v.iou >= G.minIoU, ...v };
}

/** The whole check of one call image (1024×1024 RGBA straight alpha): placement, M10 on the raw drawing, composition, M1–M9 and M11. */
export function judge(t, L, raw1024) {
  const D = T.mapBack(raw1024), m10 = measureM10(L, D), c = composeDrawing(t, L, D), g = T.measureHair(t, c.vis, raw1024);
  const failed = [...(m10.pass ? [] : ["M10"]), ...Object.entries(g.gates).filter(([, v]) => !v.pass).map(([k]) => k), ...(c.M11.pass ? [] : ["M11"])];
  return { verdict: failed.length ? "REJECTED" : "PASSES_GATES — the owner's visual review next", failed, M10: m10, gates: g.gates, M11: c.M11, composite: c };
}

/** Image 2 of NH-1B: the bald head, the shape drawn light (fill 205, line 24), the ear on top and its front line — the D-371 square at ×2. */
export function guideImage(t, L) {
  const { sil, under, EARC, EAR, LINE } = L, f = RULES.guideFill, light = new Uint8ClampedArray(N * 4);
  for (let i = 0; i < N; i++) if (L.SILM[i] || (under[i] && EARC[i])) { const src = sil.FRONT[i * 4 + 3] ? sil.FRONT : sil.BEHIND[i * 4 + 3] ? sil.BEHIND : null; const v = src && src[i * 4] <= 40 ? RULES.lineGrey : f; light.set([v, v, v, 255], i * 4); }
  return T.cropOut(NL.overStack([t.bald, light, EAR, LINE]), 2);
}

/** A simulated Kort drawing made to the shape as Image 2 asks (the silhouette and the part under each ear), optionally moved. */
export function simulatedKort(L, dx = 0, dy = 0) {
  const { sil, under, EARC } = L, P = new Uint8ClampedArray(N * 4), g = RULES.templeGrey;
  for (let i = 0; i < N; i++) { if (sil.FRONT[i * 4 + 3]) P.set(sil.FRONT.subarray(i * 4, i * 4 + 4), i * 4); else if (sil.BEHIND[i * 4 + 3]) P.set(sil.BEHIND.subarray(i * 4, i * 4 + 4), i * 4); else if (under[i] && EARC[i]) P.set([g, g, g, 255], i * 4); }
  if (!dx && !dy) return P;
  const o = new Uint8ClampedArray(N * 4); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const X = x - dx, Y = y - dy; if (X >= 0 && Y >= 0 && X < W && Y < H) o.set(P.subarray((Y * W + X) * 4, (Y * W + X) * 4 + 4), (y * W + x) * 4); }
  return o;
}

/** The fixture: every pin of the composition, computed here. */
export function fixtureSpec(t, L) {
  const guide = guideImage(t, L), earMask = Uint8ClampedArray.from({ length: N * 4 }, (_, j) => (j % 4 === 3 ? (L.EARC[(j / 4) | 0] ? 255 : 0) : 255));
  return { decision: "D-371", callId: "NH-1B-hair-short-silhouette", method: "FIXED COMPOSITION (owner-approved 2026-11-11)", rules: RULES, gates: GATES,
    silhouette: { frontPixels: pixelSha256(L.sil.FRONT), behindPixels: pixelSha256(L.sil.BEHIND), frontPx: count(L.sil.front), behindPx: count(L.sil.behind) },
    earOnTop: { ...L.ear.report, maskPixels: pixelSha256(earMask) }, temple: { px: count(L.TEMPLE_M) },
    guide: { name: GUIDE_NAME, pixels: pixelSha256(guide), size: "1024x1024" } };
}

// ── review pictures ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const flat = (P, bg = 245) => { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) { const a = P[i * 4 + 3] / 255; for (let c = 0; c < 3; c++) o[i * 4 + c] = Math.round(P[i * 4 + c] * a + bg * (1 - a)); o[i * 4 + 3] = 255; } return o; };
const region = (P, x, y, w, h, s) => { const q = new Uint8ClampedArray(w * s * h * s * 4); for (let Y = 0; Y < h * s; Y++) for (let X = 0; X < w * s; X++) { const j = ((y + (Y / s | 0)) * W + x + (X / s | 0)) * 4; q.set(P.subarray(j, j + 4), (Y * w * s + X) * 4); } return encodePng(w * s, h * s, q); };
const areaDown = (P, C, k) => { const w = C.size / k | 0, q = new Uint8ClampedArray(w * w * 4); for (let Y = 0; Y < w; Y++) for (let X = 0; X < w; X++) { const a = [0, 0, 0, 0]; for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) { const j = ((C.y + Y * k + dy) * W + C.x + X * k + dx) * 4; for (let c = 0; c < 4; c++) a[c] += P[j + c]; } for (let c = 0; c < 4; c++) q[(Y * w + X) * 4 + c] = Math.round(a[c] / (k * k)); } return encodePng(w, w, q); };
function writeReview(t, OUT, pic, name) {
  const f = flat(pic), C = t.spec.crop, el = t.spec.ears.left, er = t.spec.ears.right;
  writeFileSync(join(OUT, name + "-head-1x.png"), region(f, C.x, C.y, C.size, C.size, 1));
  writeFileSync(join(OUT, name + "-head-app-half.png"), areaDown(f, C, 2)); writeFileSync(join(OUT, name + "-head-app-quarter.png"), areaDown(f, C, 4));
  writeFileSync(join(OUT, name + "-ear-left-4x.png"), region(f, el.x0 - 20, el.y0 - 60, 110, 140, 4)); writeFileSync(join(OUT, name + "-ear-right-4x.png"), region(f, er.x1 - 90, er.y0 - 60, 110, 140, 4));
}
const brief = (j) => ({ verdict: j.verdict, failed: j.failed, M10: j.M10, M11: j.M11, M2: j.gates.M2.earInnerPx, M3: j.gates.M3.rimShare, M4: j.gates.M4.flapShare });

function main() {
  const args = process.argv.slice(2), arg = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null), outside = (d) => { if (!d) return false; const r = relative(ROOT, resolve(d)); return r.startsWith("..") || isAbsolute(r); };
  const t = T.buildTemplate(), L = compositionLayers(t);
  if (args.includes("--write-fixture")) { writeFileSync(join(ROOT, FIXTURE), JSON.stringify(fixtureSpec(t, L), null, 2) + "\n"); console.log("wrote " + FIXTURE); }
  const IN = arg("--inputs"); if (IN) { if (!outside(IN)) throw new Error("--inputs <dir outside the repository>"); mkdirSync(IN, { recursive: true }); const f = join(IN, GUIDE_NAME); if (existsSync(f)) throw new Error("refusing to replace " + f); writeFileSync(f, encodePng(1024, 1024, guideImage(t, L))); console.log("wrote " + f); }
  const OUT = arg("--out"), MEAS = arg("--measure");
  if (OUT) { if (!outside(OUT)) throw new Error("--out <dir outside the repository>"); if (existsSync(OUT) && readdirSync(OUT).length) throw new Error("output directory not empty"); mkdirSync(OUT, { recursive: true }); }
  if (MEAS) { if (!OUT) throw new Error("--measure needs --out"); const d = decodePng(readFileSync(MEAS)); if (!d.ok || d.header.w !== 1024 || d.header.h !== 1024) throw new Error("--measure: a 1024×1024 PNG is required");
    const j = judge(t, L, d.px); writeReview(t, OUT, j.composite.pic, "composite"); writeReview(t, OUT, NL.overStack([t.bald, T.mapBack(d.px)]), "raw");
    const r = brief(j); writeFileSync(join(OUT, "measure.json"), JSON.stringify(r, null, 2) + "\n"); console.log(JSON.stringify(r)); return; }
  if (args.includes("--examples")) { if (!OUT) throw new Error("--examples needs --out");
    const out = {}; for (const [name, dx, dy] of [["kort-unshifted", 0, 0], ["kort-shifted-2px-right", 2, 0]]) { const j = judge(t, L, T.cropOut(simulatedKort(L, dx, dy), 2)); writeReview(t, OUT, j.composite.pic, name); out[name] = brief(j); }
    writeFileSync(join(OUT, "examples.json"), JSON.stringify(out, null, 2) + "\n"); console.log(JSON.stringify(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.verdict + (v.failed.length ? " (" + v.failed.join(", ") + ")" : "")])))); }
}
if (typeof process.argv[1] === "string" && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
