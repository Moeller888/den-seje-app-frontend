// D-371 — ONE HAIR TEMPLATE for Northstar hairstyles drawn from scratch to its exact head (Kort, Kompakte krøller, Halvlang med
// sideskilning). Deterministic, offline; no image call. The base is the shared bald head (the D-194 stack without hair and hair shadow,
// with D-368's brow-residue and forehead-spot repairs) WITHOUT any extra skin layer: the flap in front of each ear stays as drawn, and the
// new hair must cover it, as Northstar's own hair does. This file:
//   buildTemplate  — the canvas, the tight square the image call works in (D-119: 512×512 on the master grid, sent at exactly ×2), crown,
//                    hairline, temples, ear tops, brows, and the zones: MUST COVER (the top of the skull above Northstar's highest hairline
//                    point; the flap in front of each ear), KEEP CLEAR (the eyes +6 px; the ear's inside — hair goes BEHIND the ear),
//                    EAR RIM (the ear's outer 3 px: hair may lie over a little of it, as Northstar's does at the junction), MAY COVER (the
//                    brows, at most half of each), BEHIND THE EAR (outside the head next to the ear);
//   inputImages    — the two images of the call, cut from the same square at ×2 (nearest neighbour): Image 1 Northstar with its hair (style),
//                    Image 2 the bald head (geometry);
//   consistency    — template, input images and prompt use the same square, scale, size and margin;
//   mapBack        — the placement fixed in advance: premultiplied 2×2 box ÷2 (D-119's downscaleHalf), pasted at the square's corner;
//   measureHair    — the gates M1…M9 on the master grid, each with its threshold fixed here;
//   kortEnvelope   — a minimal short-hair silhouette from the zones alone: proof that Kort can cover the whole flap while the ear shows.
// Usage:
//   node tools/avatar/northstar-hair-template-d371.mjs --out <dir outside the repository>          review pictures + the reports
//   … --inputs <dir outside the repository>                                                          writes the two input images
//   … --write-fixture                                                                                 writes fixtures/northstar-hair-d371/template-v1.json
//   … --measure <returned 1024×1024 png> --out <dir outside the repository>                         places and measures one result
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng, decodePng, pixelSha256 } from "./r3-hair-tool-v2.mjs";
import { downscaleHalf } from "./promote-r2-torso-asset.mjs";
import * as FIG from "./r3-northstar-figure.mjs";
import * as HD from "./r3-northstar-head.mjs";
import * as NL from "./r3-northstar-layers.mjs";
import * as PO from "./northstar-hair-polish-d368.mjs";
import { toGrey } from "./northstar-hair-trial-d368.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const W = 1024, H = 1536, N = W * H;
export const DECISION = "D-371";
export const FIXTURE = "tools/avatar/fixtures/northstar-hair-d371/template-v1.json";
export const CANVAS = Object.freeze({ width: W, height: H, grid: "Northstar Master v2 (1024×1536), the runtime figure's grid" });
// the tight square the image call works in, on the master grid; the call's 1024×1024 is exactly ×2 of it
export const CROP = Object.freeze({ x: 256, y: 0, size: 512, scale: 2 });
export const CALL_SIZE = "1024x1024";
export const CALL_MARGIN = 16;                  // px of the call image that stay empty on every side (the prompt says 16 pixels)
export const EYE_CLEAR = 2, EAR_RIM = 3;   // calibrated on Northstar's own hair: 0 px at +2, contact from +3
// the gates, fixed before any call; the Northstar reference itself passes every one (calibration, see measureReference)
export const GATES = Object.freeze({
  M1: { what: "eyes (+2 px) clear", rule: "hair alpha 0 on every pixel (D-118)" },
  M2: { what: "the ear's inside clear (ear minus its outer 3 px)", rule: "hair alpha ≤ 8 on every pixel, each ear" },
  M3: { what: "the ear's rim", rule: "hair alpha > 8 on ≤ 15 % of each ear's outer 3 px (Northstar: 13.5 % / 11.6 %)", maxShare: 0.15 },
  M4: { what: "the flap in front of each ear covered", rule: "hair alpha ≥ 200 on ≥ 99 % of each flap", minShare: 0.99 },
  M5: { what: "the top of the skull covered", rule: "hair alpha ≥ 200 on ≥ 99 % of the skull above Northstar's highest hairline point", minShare: 0.99 },
  M6: { what: "the brows", rule: "hair alpha ≥ 128 on ≤ 50 % of each brow; the largest visible piece of each brow is ≥ 80 % of its visible part (no loose stump; Northstar: 91 %)", maxShare: 0.5, minMainVisible: 0.8 },
  M7: { what: "one mass", rule: "one main shape (alpha ≥ 128, 4-connected); the other pieces together ≤ 40 px, not counting a lock that overlaps a flap (a separate sideburn in front of the ear, as Northstar has)", maxLoose: 40 },
  M8: { what: "margin and transparency", rule: "no alpha in the call image's outer 16 px; hair alpha ≤ 8 on ≥ 95 % of the face below the ear tops (outside the flaps and ears)", minClearFace: 0.95 },
  M9: { what: "neutral grey", rule: "max channel difference ≤ 12 on ≥ 99 % of the hair (alpha ≥ 128)", maxSpread: 12, minShare: 0.99 },
});

const lum = (P, i) => 0.299 * P[i * 4] + 0.587 * P[i * 4 + 1] + 0.114 * P[i * 4 + 2];
const box = (m) => { let x0 = W, y0 = H, x1 = -1, y1 = -1; for (let i = 0; i < N; i++) if (m[i]) { const x = i % W, y = (i / W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return { x0, y0, x1, y1 }; };
const maskOf = (P, t = 128) => { const m = new Uint8Array(N); for (let i = 0; i < N; i++) if (P[i * 4 + 3] >= t) m[i] = 1; return m; };
const count = (m) => { let n = 0; for (let i = 0; i < N; i++) if (m[i]) n++; return n; };
const and = (a, b) => { const o = new Uint8Array(N); for (let i = 0; i < N; i++) if (a[i] && b[i]) o[i] = 1; return o; };
const side = (m, s) => { const o = new Uint8Array(N); for (let i = 0; i < N; i++) if (m[i] && (s === "left" ? i % W < W / 2 : i % W >= W / 2)) o[i] = 1; return o; };
const dilate = (m, r) => { const o = new Uint8Array(N); for (let i = 0; i < N; i++) if (m[i]) { const x = i % W, y = (i / W) | 0; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < W && Y < H && dx * dx + dy * dy <= r * r) o[Y * W + X] = 1; } } return o; };
/** 4-connected pieces, largest first: { n, hits } — hits: the piece overlaps `zone`. */
const pieces = (m, zone = null) => { const seen = new Uint8Array(N), out = []; for (let i = 0; i < N; i++) if (m[i] && !seen[i]) { let n = 0, hits = false; const st = [i]; seen[i] = 1;
  while (st.length) { const j = st.pop(); n++; if (zone && zone[j]) hits = true; const x = j % W; for (const k of [j - 1, j + 1, j - W, j + W]) if (k >= 0 && k < N && m[k] && !seen[k] && Math.abs((k % W) - x) <= 1) { seen[k] = 1; st.push(k); } } out.push({ n, hits }); } return out.sort((a, b) => b.n - a.n); };

/** The whole ear for the template: earMask's silhouette protrusion misses the ear's inner front (the bowl between its rim and the flap).
 *  Per ear row, the ear runs from the head's outer edge inward up to the flap's outer edge (exclusive) — the ear's front line is the flap's
 *  outer edge; in rows without a flap pixel, earMask's own row. Never a flap pixel. */
export function earFull(bald, ears0, flap) {
  const o = new Uint8Array(N); let y0 = H, y1 = -1; for (let i = 0; i < N; i++) if (ears0[i]) { o[i] = 1; const y = (i / W) | 0; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  for (let y = y0; y <= y1; y++) for (const dir of [1, -1]) {
    const start = dir === 1 ? 0 : W - 1, inHalf = (x) => (dir === 1 ? x < W / 2 : x >= W / 2);
    let edge = -1, fl = -1, last = -1; for (let x = start; inHalf(x); x += dir) { const i = y * W + x; if (edge < 0 && bald[i * 4 + 3] >= 128) edge = x; if (fl < 0 && flap[i]) fl = x; if (ears0[i]) last = x; }
    if (edge < 0 || fl < 0 || last < 0) continue;
    for (let x = edge; x !== fl; x += dir) { const i = y * W + x; if (bald[i * 4 + 3] >= 128 && !flap[i]) o[i] = 1; }
  }
  return o;
}

/** Holes: pixels enclosed by the head's opaque silhouette (not reachable from the canvas border over non-opaque pixels) that are not opaque. */
export function holes(bald) {
  const op = maskOf(bald, 128), out = new Uint8Array(N), st = [];
  for (let x = 0; x < W; x++) st.push(x, (H - 1) * W + x); for (let y = 0; y < H; y++) st.push(y * W, y * W + W - 1);
  while (st.length) { const i = st.pop(); if (out[i] || op[i]) continue; out[i] = 1; const x = i % W; if (x > 0) st.push(i - 1); if (x < W - 1) st.push(i + 1); if (i >= W) st.push(i - W); if (i < N - W) st.push(i + W); }
  const h = new Uint8Array(N); for (let i = 0; i < N; i++) if (!out[i] && !op[i]) h[i] = 1; return { mask: h, px: count(h) };
}

export function buildTemplate() {
  const b = FIG.buildFigure(), L0 = b.layers, BALD = HD.COMPOSITE_ORDER.filter((k) => k !== "hair" && k !== "hairShadow"), bald0 = HD.composeHead(L0, { include: BALD });
  const br = PO.browResidue(L0), fs = PO.foreheadSpots(br.layers, bald0), L1 = fs.layers, bald = HD.composeHead(L1, { include: BALD });
  const repaired = new Uint8Array(N); for (let i = 0; i < N; i++) if (br.mask[i] || fs.mask[i] || L0.hairShadow[i * 4 + 3] > 0) repaired[i] = 1;   // where the bald head may differ from Northstar's head outside its hair
  const ears0 = PO.earMask(bald), flap = PO.flapByReference(bald, ears0, L0.hair), hole = holes(bald), head = maskOf(bald), hb = box(head);
  const ears = earFull(bald, ears0, flap);
  const eyes = new Uint8Array(N); for (const k of ["iris", "eyesFixed"]) for (let i = 0; i < N; i++) if (L1[k][i * 4 + 3] >= 32) eyes[i] = 1;
  const eyesClear = dilate(eyes, EYE_CLEAR), brows = { left: maskOf(L1.browL, 64), right: maskOf(L1.browR, 64) };
  const notEar = Uint8Array.from(ears, (v) => 1 - v), nearOut = dilate(notEar, EAR_RIM), earRim = and(ears, nearOut), earInner = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (ears[i] && !nearOut[i]) earInner[i] = 1;
  const bl = box(brows.left), brr = box(brows.right);
  // Northstar's hairline: per forehead column, the lowest row of its hair that is connected to the top of the head (alpha ≥ 128)
  const hairline = []; for (let x = bl.x0; x <= brr.x1; x += 8) { let y = -1; for (let yy = hb.y0; yy < bl.y0; yy++) { if (L0.hair[(yy * W + x) * 4 + 3] >= 128) y = yy; else if (y >= 0) break; } if (y >= 0) hairline.push([x, y]); }
  const hairlineTop = hairline.length ? Math.min(...hairline.map((p) => p[1])) : hb.y0;
  const skullTop = new Uint8Array(N); for (let i = 0; i < N; i++) if (head[i] && !ears[i] && ((i / W) | 0) < hairlineTop) skullTop[i] = 1;
  const eb = box(ears), earTop = Math.min(box(side(ears, "left")).y0, box(side(ears, "right")).y0);
  const behind = new Uint8Array(N), near = dilate(ears, 40); for (let i = 0; i < N; i++) { const y = (i / W) | 0; if (near[i] && !head[i] && y >= eb.y0 - 20 && y <= eb.y1) behind[i] = 1; }
  // the face below the ear tops, outside the flaps and the ears: where no hairstyle lies (transparency check)
  const lowerFace = new Uint8Array(N); for (let i = 0; i < N; i++) if (head[i] && !ears[i] && !flap[i] && ((i / W) | 0) > earTop) lowerFace[i] = 1;
  const mustCover = new Uint8Array(N); for (let i = 0; i < N; i++) if (skullTop[i] || flap[i]) mustCover[i] = 1;
  const keepClear = new Uint8Array(N); for (let i = 0; i < N; i++) if (eyesClear[i] || earInner[i]) keepClear[i] = 1;
  const z = { ears, flap, earRim, earInner, eyesClear, brows, skullTop, behind, lowerFace, mustCover, keepClear, head, repaired, earTop };
  const per = (m) => ({ left: box(side(m, "left")), right: box(side(m, "right")), px: { left: count(side(m, "left")), right: count(side(m, "right")) } });
  const spec = {
    decision: DECISION, canvas: CANVAS, crop: CROP, call: { size: CALL_SIZE, margin: CALL_MARGIN, placement: "the 1024×1024 result ÷2 by the premultiplied 2×2 box (downscaleHalf, D-119), pasted at (crop.x, crop.y); no move, scale, rotation or retouch" },
    head: hb, crown: { y: hb.y0, x: Math.round((hb.x0 + hb.x1) / 2) },
    hairline: { rule: "Northstar's own hairline: per forehead column (every 8 px), the lowest row of its hair connected to the top of the head; a new style may sit anywhere between its highest point and the brows' top", top: hairlineTop, browsTop: Math.min(bl.y0, brr.y0), points: hairline },
    brows: { left: bl, right: brr }, ears: per(ears), earTops: { left: box(side(ears, "left")).y0, right: box(side(ears, "right")).y0 },
    temples: { ...per(flap), rule: "the flap in front of each ear: head skin and the face's contour line that Northstar's hair covers; the new hair lies IN FRONT of it, down to where the ear meets the face" },
    zones: {
      mustCover: { skullTopPx: count(skullTop), flapPx: per(flap).px, rule: "M4 + M5" },
      keepClear: { eyesPx: count(eyesClear), earInnerPx: per(earInner).px, rule: "M1 + M2" },
      earRim: { px: per(earRim).px, width: EAR_RIM, rule: "M3: the ear's outer 3 px — hair may lie over a little of it at the junction, as Northstar's does" },
      mayCover: { browsPx: { left: count(brows.left), right: count(brows.right) }, rule: "M6" },
      behindEar: { px: count(behind), rule: "outside the head next to the ear: hair may lie here, behind the ear" },
      lowerFace: { px: count(lowerFace), rule: "M8 (transparency): no hairstyle lies here" },
    },
    overlap: { mustCoverAndKeepClear: count(and(mustCover, keepClear)), mustCoverAndEars: count(and(mustCover, ears)), mustCoverAndBrows: count(and(mustCover, brows.left)) + count(and(mustCover, brows.right)), flapTouchingEarRim: per(and(dilate(flap, 1), earRim)).px },
    holes: { px: hole.px, rule: "pixels inside the head's silhouette that are not opaque (the base has no extra skin layer)" },
    sha: { baldPixels: pixelSha256(bald) },
  };
  return { spec, z, bald, nsHair: L0.hair, nsHead: HD.composeHead(L0) };
}

/** The square of the master grid at ×s (nearest neighbour) — the call's images and the review pictures. */
export function cropOut(P, s = CROP.scale) { const w = CROP.size * s, q = new Uint8ClampedArray(w * w * 4); for (let Y = 0; Y < w; Y++) for (let X = 0; X < w; X++) { const j = ((CROP.y + (Y / s | 0)) * W + CROP.x + (X / s | 0)) * 4; q.set(P.subarray(j, j + 4), (Y * w + X) * 4); } return q; }
/** The two input images of every call: Image 1 Northstar with its current hair (style), Image 2 the bald head (geometry). */
export function inputImages(t) { const w = CROP.size * CROP.scale; return { reference: { name: "northstar-hair-reference-1024.png", px: cropOut(t.nsHead), png: encodePng(w, w, cropOut(t.nsHead)) }, guide: { name: "northstar-bald-guide-1024.png", px: cropOut(t.bald), png: encodePng(w, w, cropOut(t.bald)) } }; }

/** The placement, fixed in advance: a 1024×1024 RGBA result ÷2 (premultiplied 2×2 box) pasted at the square's corner on the master grid. */
export function mapBack(px1024) {
  const w = CROP.size * CROP.scale; if (!px1024 || px1024.length !== w * w * 4) throw new Error("mapBack: a " + w + "×" + w + " RGBA image is required");
  const half = downscaleHalf(w, w, px1024), o = new Uint8ClampedArray(N * 4);
  for (let y = 0; y < CROP.size; y++) for (let x = 0; x < CROP.size; x++) { const s = (y * CROP.size + x) * 4, d = ((CROP.y + y) * W + CROP.x + x) * 4; for (let c = 0; c < 4; c++) o[d + c] = half[s + c]; }
  return o;
}

/** Template, input images and prompt use the same square, scale, size and margin. Every entry must be true. */
export function consistency(t, inputs, promptText = null) {
  const w = CROP.size * CROP.scale, back = (px) => downscaleHalf(w, w, px), same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  const c1 = cropOut(t.bald, 1), c2 = cropOut(t.nsHead, 1);
  let differ = 0; for (let i = 0; i < N; i++) if (t.nsHair[i * 4 + 3] === 0 && t.z.head[i] && !t.z.repaired[i]) { for (let c = 0; c < 4; c++) if (t.bald[i * 4 + c] !== t.nsHead[i * 4 + c]) { differ++; break; } }
  const zone = new Uint8Array(N); for (let i = 0; i < N; i++) if (t.z.head[i] || t.z.behind[i]) zone[i] = 1; const zb = box(zone), m = CALL_MARGIN / CROP.scale;
  const r = {
    callSizeIsSquareTimesScale: CALL_SIZE === `${w}x${w}`,
    guideIsTheSquareAtScale: same(Uint8ClampedArray.from(back(inputs.guide.px)), c1),
    referenceIsTheSquareAtScale: same(Uint8ClampedArray.from(back(inputs.reference.px)), c2),
    sameHeadOutsideNorthstarsHairAndRepairs: differ === 0,
    templateZonesInsideTheMargin: zb.x0 >= CROP.x + m && zb.x1 < CROP.x + CROP.size - m && zb.y1 < CROP.y + CROP.size - m && t.spec.crown.y - CROP.y >= 40,
    noOverlapMustCoverKeepClear: t.spec.overlap.mustCoverAndKeepClear === 0 && t.spec.overlap.mustCoverAndEars === 0 && t.spec.overlap.mustCoverAndBrows === 0,
  };
  if (promptText !== null) { r.promptNamesTheSize = promptText.includes(CALL_SIZE); r.promptNamesTheMargin = promptText.includes(`${CALL_MARGIN} pixels`); }
  return { ok: Object.values(r).every(Boolean), checks: r, details: { headDifferPx: differ, zoneBox: zb, crownAboveSquareTop: t.spec.crown.y - CROP.y } };
}

/** The gates M1…M9 for one hair layer on the master grid (straight alpha); `raw1024` (the call image) for the margin. */
export function measureHair(t, hair, raw1024 = null) {
  const { z } = t, A = (i) => hair[i * 4 + 3], res = {};
  const share = (m, f) => { let n = 0, k = 0; for (let i = 0; i < N; i++) if (m[i]) { n++; if (f(i)) k++; } return n ? k / n : 1; };
  let eyes = 0; for (let i = 0; i < N; i++) if (z.eyesClear[i] && A(i) > 0) eyes++;
  res.M1 = { pass: eyes === 0, eyesPx: eyes };
  const inner = { left: 0, right: 0 }; for (const s of ["left", "right"]) { const m = side(z.earInner, s); for (let i = 0; i < N; i++) if (m[i] && A(i) > 8) inner[s]++; }
  res.M2 = { pass: inner.left === 0 && inner.right === 0, earInnerPx: inner };
  const rim = { left: share(side(z.earRim, "left"), (i) => A(i) > 8), right: share(side(z.earRim, "right"), (i) => A(i) > 8) };
  res.M3 = { pass: rim.left <= GATES.M3.maxShare && rim.right <= GATES.M3.maxShare, rimShare: rim };
  const fl = { left: share(side(z.flap, "left"), (i) => A(i) >= 200), right: share(side(z.flap, "right"), (i) => A(i) >= 200) };
  res.M4 = { pass: fl.left >= GATES.M4.minShare && fl.right >= GATES.M4.minShare, flapShare: fl };
  const top = share(z.skullTop, (i) => A(i) >= 200); res.M5 = { pass: top >= GATES.M5.minShare, skullTopShare: top };
  const bw = {}; for (const s of ["left", "right"]) { const m = z.brows[s], vis = new Uint8Array(N); let n = 0, k = 0; for (let i = 0; i < N; i++) if (m[i]) { n++; if (A(i) >= 128) k++; else vis[i] = 1; } const p = pieces(vis).map((q) => q.n), v = p.reduce((a, x) => a + x, 0); bw[s] = { covered: n ? k / n : 0, mainVisible: v ? p[0] / v : 0 }; }
  res.M6 = { pass: ["left", "right"].every((s) => bw[s].covered <= GATES.M6.maxShare && bw[s].mainVisible >= GATES.M6.minMainVisible), brows: bw };
  const p = pieces(maskOf(hair, 128), z.flap), loose = p.slice(1).filter((q) => !q.hits).reduce((a, q) => a + q.n, 0), locks = p.slice(1).filter((q) => q.hits).map((q) => q.n);
  res.M7 = { pass: p.length >= 1 && loose <= GATES.M7.maxLoose, mainPx: p.length ? p[0].n : 0, loosePx: loose, sideburnLocks: locks, pieces: p.length };
  let edge = null; if (raw1024) { const w = CROP.size * CROP.scale; edge = 0; for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) if ((x < CALL_MARGIN || y < CALL_MARGIN || x >= w - CALL_MARGIN || y >= w - CALL_MARGIN) && raw1024[(y * w + x) * 4 + 3] > 0) edge++; }
  const face = share(z.lowerFace, (i) => A(i) <= 8); res.M8 = { pass: (edge === null || edge === 0) && face >= GATES.M8.minClearFace, edgePx: edge, lowerFaceClear: face };
  let gn = 0, gk = 0; for (let i = 0; i < N; i++) if (A(i) >= 128) { gn++; const r = hair[i * 4], g = hair[i * 4 + 1], b = hair[i * 4 + 2]; if (Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b)) <= GATES.M9.maxSpread) gk++; }
  res.M9 = { pass: gn > 0 && gk / gn >= GATES.M9.minShare, greyShare: gn ? gk / gn : 0 };
  return { pass: Object.values(res).every((g) => g.pass), gates: res };
}

/** Calibration: Northstar's own hair (as grey luminance) through the same gates — the template is consistent if it passes them. */
export function measureReference(t) { return measureHair(t, toGrey(t.nsHair)); }

/** A minimal Kort silhouette from the zones alone (alpha 255, grey): the top of the skull, both flaps, and the temple between them —
 *  head pixels from the hairline down to 4 px below the ear's top, outward of the flap's inner edge; below the ear's top only the flap itself (a
 *  short sideburn). Never the ear, eyes or brows. */
export function kortEnvelope(t) {
  const { z, spec } = t, m = new Uint8Array(N);
  const junction = and(z.earRim, dilate(z.flap, 2));   // the ear's rim right at the flap, only around the ear's top: the hair crosses it there
  for (let i = 0; i < N; i++) if (junction[i] && ((i / W) | 0) > z.earTop + 4) junction[i] = 0;
  for (let i = 0; i < N; i++) { if (z.mustCover[i] || junction[i]) { m[i] = 1; continue; } if (!z.head[i] || z.ears[i] || z.eyesClear[i] || z.brows.left[i] || z.brows.right[i]) continue;
    const x = i % W, y = (i / W) | 0; if (y < spec.hairline.top || y > z.earTop + 4) continue;
    if (x <= spec.temples.left.x1 || x >= spec.temples.right.x0) m[i] = 1; }
  const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) if (m[i]) o.set([120, 120, 120, 255], i * 4); return o;
}

// ── review pictures ────────────────────────────────────────────────────────────────────────────────────────────
const flat = (P, bg = 245) => { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) { const a = P[i * 4 + 3] / 255; for (let c = 0; c < 3; c++) o[i * 4 + c] = Math.round(P[i * 4 + c] * a + bg * (1 - a)); o[i * 4 + 3] = 255; } return o; };
const tintZ = (o, m, rgb, k) => { for (let i = 0; i < N; i++) if (m[i]) for (let c = 0; c < 3; c++) o[i * 4 + c] = Math.round(o[i * 4 + c] * (1 - k) + rgb[c] * k); };
const region = (P, x, y, w, h, s) => { const q = new Uint8ClampedArray(w * s * h * s * 4); for (let Y = 0; Y < h * s; Y++) for (let X = 0; X < w * s; X++) { const j = ((y + (Y / s | 0)) * W + x + (X / s | 0)) * 4; q.set(P.subarray(j, j + 4), (Y * w * s + X) * 4); } return encodePng(w * s, h * s, q); };
const areaDown = (P, k) => { const w = CROP.size / k | 0, q = new Uint8ClampedArray(w * w * 4); for (let Y = 0; Y < w; Y++) for (let X = 0; X < w; X++) { const acc = [0, 0, 0, 0]; for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) { const j = ((CROP.y + Y * k + dy) * W + CROP.x + X * k + dx) * 4; for (let c = 0; c < 4; c++) acc[c] += P[j + c]; } for (let c = 0; c < 4; c++) q[(Y * w + X) * 4 + c] = Math.round(acc[c] / (k * k)); } return encodePng(w, w, q); };
/** The template picture: zones tinted on the bald head — must cover (blue top, orange flaps), keep clear (red: eyes, ear inside), ear rim
 *  (purple), may cover (yellow brows), behind the ear (green); dashed: crown (black), Northstar's highest hairline (blue), ear tops (green). */
export function templatePicture(t) {
  const { z, spec } = t, o = flat(t.bald);
  tintZ(o, z.skullTop, [40, 110, 230], 0.55); tintZ(o, z.flap, [255, 140, 0], 0.8); tintZ(o, z.behind, [40, 180, 80], 0.35); tintZ(o, z.brows.left, [240, 200, 0], 0.45); tintZ(o, z.brows.right, [240, 200, 0], 0.45);
  tintZ(o, z.eyesClear, [230, 40, 40], 0.35); tintZ(o, z.earInner, [230, 40, 40], 0.35); tintZ(o, z.earRim, [150, 60, 200], 0.6);
  const hline = (y, rgb) => { for (let x = CROP.x; x < CROP.x + CROP.size; x++) if (x % 6 < 4) o.set([...rgb, 255], (y * W + x) * 4); };
  hline(spec.crown.y, [0, 0, 0]); hline(spec.hairline.top, [40, 110, 230]); hline(spec.earTops.left, [0, 120, 0]);
  for (const [x, y] of spec.hairline.points) for (let d = -2; d <= 2; d++) { o.set([0, 0, 160, 255], (y * W + x + d) * 4); o.set([0, 0, 160, 255], ((y + d) * W + x) * 4); }
  return o;
}
export function writeReview(t, OUT, hair, name) {
  const over = NL.overStack([t.bald, hair]), f = flat(over), el = t.spec.ears.left, er = t.spec.ears.right;
  writeFileSync(join(OUT, name + "-head-1x.png"), region(f, CROP.x, CROP.y, CROP.size, CROP.size, 1));
  writeFileSync(join(OUT, name + "-head-app-half.png"), areaDown(f, 2)); writeFileSync(join(OUT, name + "-head-app-quarter.png"), areaDown(f, 4));
  writeFileSync(join(OUT, name + "-ear-left-4x.png"), region(f, el.x0 - 20, el.y0 - 60, 110, 140, 4)); writeFileSync(join(OUT, name + "-ear-right-4x.png"), region(f, er.x1 - 90, er.y0 - 60, 110, 140, 4));
}

function main() {
  const args = process.argv.slice(2), arg = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null), outside = (d) => d && !resolve(d).toLowerCase().startsWith(ROOT.toLowerCase());
  const t = buildTemplate();
  if (args.includes("--write-fixture")) { mkdirSync(dirname(join(ROOT, FIXTURE)), { recursive: true }); writeFileSync(join(ROOT, FIXTURE), JSON.stringify(t.spec, null, 2) + "\n"); console.log("wrote " + FIXTURE); }
  const IN = arg("--inputs"); if (IN) { if (!outside(IN)) throw new Error("--inputs <dir outside the repository>"); mkdirSync(IN, { recursive: true }); const im = inputImages(t);
    for (const k of ["reference", "guide"]) { const f = join(IN, im[k].name); if (existsSync(f)) throw new Error("refusing to replace " + f); writeFileSync(f, im[k].png); console.log("wrote " + f); } }
  const OUT = arg("--out"), MEAS = arg("--measure");
  if (OUT) { if (!outside(OUT)) throw new Error("--out <dir outside the repository>"); if (existsSync(OUT) && readdirSync(OUT).length) throw new Error("output directory not empty"); mkdirSync(OUT, { recursive: true }); }
  if (MEAS) { if (!OUT) throw new Error("--measure needs --out"); const d = decodePng(readFileSync(MEAS)); if (!d.ok || d.header.w !== 1024 || d.header.h !== 1024) throw new Error("--measure: a 1024×1024 PNG is required");
    const hair = mapBack(d.px), m = measureHair(t, hair, d.px); writeFileSync(join(OUT, "measure.json"), JSON.stringify(m, null, 2) + "\n"); writeReview(t, OUT, hair, "candidate"); writeReview(t, OUT, toGrey(t.nsHair), "northstar"); console.log(JSON.stringify(m)); return; }
  if (OUT) {
    const im = inputImages(t), cons = consistency(t, im), ref = measureReference(t), env = kortEnvelope(t), kort = measureHair(t, env);
    writeFileSync(join(OUT, "template.json"), JSON.stringify(t.spec, null, 2) + "\n");
    writeFileSync(join(OUT, "report.json"), JSON.stringify({ consistency: cons, northstarCalibration: ref, kortEnvelope: kort }, null, 2) + "\n");
    const tp = templatePicture(t); writeFileSync(join(OUT, "template-2x.png"), region(tp, CROP.x, CROP.y, CROP.size, CROP.size, 2));
    const el = t.spec.ears.left, er = t.spec.ears.right; writeFileSync(join(OUT, "template-ear-left-4x.png"), region(tp, el.x0 - 20, el.y0 - 60, 110, 140, 4)); writeFileSync(join(OUT, "template-ear-right-4x.png"), region(tp, er.x1 - 90, er.y0 - 60, 110, 140, 4));
    writeFileSync(join(OUT, "bald-ear-left-4x.png"), region(flat(t.bald), el.x0 - 20, el.y0 - 60, 110, 140, 4)); writeFileSync(join(OUT, "bald-ear-right-4x.png"), region(flat(t.bald), er.x1 - 90, er.y0 - 60, 110, 140, 4));
    writeReview(t, OUT, env, "kort-envelope"); writeReview(t, OUT, toGrey(t.nsHair), "northstar");
    console.log(JSON.stringify({ holes: t.spec.holes.px, overlap: t.spec.overlap, consistency: cons.checks, northstar: ref.pass, kortEnvelope: kort.pass, kortGates: Object.fromEntries(Object.entries(kort.gates).map(([k, v]) => [k, v.pass])) }));
  }
}
if (typeof process.argv[1] === "string" && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
