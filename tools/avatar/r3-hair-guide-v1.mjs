// R3 HAIR GEOMETRY GUIDE v1 (D-183) — a hand-authored vector drawing used as the GEOMETRY reference (Image 2) of one hair
// call. Northstar is the STYLE reference (Image 1). This file is the guide's only source: the tracked PNG
// tools/avatar/fixtures/r3-hair/guide-hair-v1.png is its output, and a test proves the generator reproduces its pixels.
//
// How it is drawn: the APPROVED targets-hair-v2 points are fixed contour vertices (A1..A10, never moved), the v2 review
// sketch's vertices were the starting silhouette, and Northstar's volume and lock directions were read VISUALLY. No
// Northstar pixel is extracted, traced or sampled; no rejected hair sheet is used. A9 and A10 are drawn as D-183's design
// targets: the inner corner of a short lower edge above each ear (no sideburns) — a deliberate R3 design variation.
//
// The guide is NOT a production asset, NOT a hair layer and NOT an approval of any target. Its flat grey fill and its thin
// guide lines are diagram conventions the model is told not to reproduce.
//
// Usage: node tools/avatar/r3-hair-guide-v1.mjs [--write-fixture] [--review <dir>]
//   with no flag: prints the pixel SHA-256 of the guide; --write-fixture writes the tracked PNG; --review writes derived
//   review views (annotated guide, master raster) into a gitignored directory.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng, pixelSha256 } from "./r3-hair-tool.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
export const GUIDE_ID = "r3-hair-guide-v1";
export const TARGETS_FILE = "tools/avatar/fixtures/r3-hair/targets-hair-v2.json";
export const TARGETS_SHA256 = "8c3b24e8404d3ccf44160108eaf13cd58cdb66c6705f503a6415b49a151864cc";
export const FIXTURE = "tools/avatar/fixtures/r3-hair/guide-hair-v1.png";
export const MASTER = Object.freeze({ w: 1024, h: 1536 });
export const SHEET = Object.freeze({ w: 1024, h: 1024 });
export const SCALE = 1.75;                       // sheet px per master px
export const TONES = Object.freeze({ base: 150, ink: 22, line: 70 });
const sha = (b) => createHash("sha256").update(b).digest("hex");

export function loadTargets() {
  const buf = readFileSync(join(REPO, ...TARGETS_FILE.split("/")));
  if (sha(buf) !== TARGETS_SHA256) throw new Error("targets-hair-v2 is not the pinned D-179 version");
  return JSON.parse(buf.toString("utf8"));
}

/** The contour, clockwise on screen (y down). Every vertex is a sharp corner; b bows the edge to the NEXT vertex
 *  (fraction of its length; + outward from the hair, - inward). Named vertices are used by the tests and the review view. */
export function contour(P) {
  return [
    // left: the short lower edge above the ear; A9 is its inner corner (D-183 design target)
    { n: "A9", p: P.leftEarTopJunction, b: 0.04 }, { n: "L-lowerOuter", p: [327, 309], b: 0.10 },
    // left side locks point out and curve down: lower flank concave, upper flank convex
    { n: "L-n1", p: [321, 293], b: -0.08 }, { n: "L-t1", p: [289, 279], b: 0.20 },
    { n: "L-n2", p: [311, 259], b: -0.08 }, { n: "A2", p: P.leftOuterSpikeTip, b: 0.20 },
    { n: "L-n3", p: [308, 205], b: -0.08 }, { n: "L-t3", p: [284, 178], b: 0.20 },
    { n: "L-n4", p: [315, 165], b: -0.08 }, { n: "L-t4", p: [296, 136], b: 0.20 },
    { n: "L-n5", p: [334, 126], b: -0.12 }, { n: "L-t5", p: [344, 60], b: 0.20 },
    // top: the lock over the left side rises towards the crown tuft
    { n: "T-n6", p: [404, 92], b: -0.12 }, { n: "T-t6", p: [424, 52], b: 0.18 },
    { n: "T-n7", p: [494, 62], b: -0.14 }, { n: "A1", p: P.crownTuftTip, b: 0.16 },
    { n: "T-swoop", p: [588, 44], b: 0.12 }, { n: "T-n8", p: [628, 104], b: 0.10 },
    // right side locks point out and curve down: upper flank convex, lower flank concave
    { n: "R-t8", p: [643, 62], b: -0.14 }, { n: "R-n9", p: [651, 99], b: 0.18 },
    { n: "R-t9", p: [711, 122], b: -0.10 }, { n: "R-n10", p: [694, 142], b: 0.18 },
    { n: "R-t10", p: [717, 177], b: -0.10 }, { n: "R-n11", p: [707, 201], b: 0.18 },
    { n: "A3", p: P.rightOuterSpikeTip, b: -0.10 }, { n: "R-n12", p: [709, 247], b: 0.16 },
    { n: "R-t12", p: [717, 275], b: -0.10 }, { n: "R-n13", p: [697, 291], b: 0.06 },
    { n: "R-lowerOuter", p: [668, 312], b: 0.03 },
    // right: the short lower edge above the ear; A10 is its inner corner. Then the face opening back to A9.
    { n: "A10", p: P.rightEarTopJunction, b: -0.04 }, { n: "A8-n-side", p: [645, 232], b: 0.10 },
    { n: "A8", p: P.rightTempleLockTip, b: -0.10 }, { n: "A8-n-face", p: [604, 214], b: 0.04 },
    { n: "A4", p: P.centreHairline, b: 0.06 }, { n: "A6", p: P.rightOfCentreLockTip, b: -0.12 },
    { n: "A5-n-right", p: [498, 240], b: 0.06 }, { n: "A5", p: P.centralLockTip, b: 0.07 },
    { n: "A5-n-left", p: [462, 226], b: -0.12 }, { n: "A7-n-face", p: [424, 236], b: 0.08 },
    { n: "A7", p: P.leftTempleLockTip, b: -0.10 }, { n: "A7-n-side", p: [380, 266], b: -0.05 },
  ];
}

/** Internal lock lines (diagram only): from a contour notch into the hair mass along Northstar's lock directions. */
export const LINES = Object.freeze([
  [[575, 200], [570, 160], [578, 118]],
  [[498, 240], [522, 176], [566, 132]], [[462, 226], [494, 160], [548, 112]], [[424, 236], [452, 168], [516, 104]],
  [[380, 266], [398, 200], [452, 128]], [[604, 214], [598, 170], [604, 128]], [[645, 232], [636, 182], [646, 136]],
  [[494, 62], [522, 88], [566, 100]], [[628, 104], [604, 96], [578, 102]], [[404, 92], [430, 110], [466, 120]],
  [[334, 126], [356, 150], [390, 168]], [[315, 165], [340, 182], [372, 200]], [[308, 205], [330, 222], [362, 238]], [[311, 259], [332, 252], [352, 254]],
  [[651, 99], [662, 128], [684, 150]], [[694, 142], [680, 162], [668, 190]], [[707, 201], [688, 216], [676, 236]], [[709, 247], [690, 262], [676, 280]],
]);

function quad(a, c, b, n) { const o = []; for (let k = 1; k <= n; k++) { const t = k / n, u = 1 - t; o.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]); } return o; }
export function contourPolyline(C) {
  const out = [];
  for (let i = 0; i < C.length; i++) {
    const a = C[i].p, b = C[(i + 1) % C.length].p, dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    out.push(...quad(a, [(a[0] + b[0]) / 2 + C[i].b * dy, (a[1] + b[1]) / 2 - C[i].b * dx], b, Math.max(4, Math.ceil(L / 2))));
  }
  return out;
}

/** 4x4 supersampled even-odd fill plus distance-based outline and lines. Deterministic (no randomness, fixed order). */
function rasterise(W, H, poly, lines, k) {
  const S = 4, cov = new Float32Array(W * H);
  let y0 = Infinity, y1 = -Infinity; for (const [, y] of poly) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  for (let sy = Math.max(0, Math.floor(y0) * S); sy < Math.min(H, Math.ceil(y1) + 1) * S; sy++) {
    const yy = (sy + 0.5) / S, xs = [];
    for (let i = 0; i < poly.length; i++) { const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length]; if ((ay <= yy) !== (by <= yy)) xs.push(ax + (yy - ay) / (by - ay) * (bx - ax)); }
    xs.sort((p, q) => p - q);
    for (let j = 0; j + 1 < xs.length; j += 2) for (let sx = Math.max(0, Math.ceil(xs[j] * S - 0.5)); sx < Math.min(W * S, Math.ceil(xs[j + 1] * S - 0.5)); sx++) cov[Math.floor(sy / S) * W + Math.floor(sx / S)] += 1 / (S * S);
  }
  const dist = (segs, r) => {
    const d = new Float32Array(W * H).fill(1e9);
    for (const pl of segs) for (let i = 0; i + 1 < pl.length; i++) {
      const [ax, ay] = pl[i], [bx, by] = pl[i + 1], vx = bx - ax, vy = by - ay, vv = vx * vx + vy * vy || 1;
      for (let y = Math.max(0, Math.floor(Math.min(ay, by) - r - 1)); y <= Math.min(H - 1, Math.ceil(Math.max(ay, by) + r + 1)); y++)
        for (let x = Math.max(0, Math.floor(Math.min(ax, bx) - r - 1)); x <= Math.min(W - 1, Math.ceil(Math.max(ax, bx) + r + 1)); x++) {
          const px = x + 0.5, py = y + 0.5, t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / vv)), dd = Math.hypot(px - ax - t * vx, py - ay - t * vy);
          if (dd < d[y * W + x]) d[y * W + x] = dd;
        }
    }
    return d;
  };
  const rOut = 1.4 * k, rLine = 0.9 * k, dOut = dist([[...poly, poly[0]]], rOut), dLine = dist(lines, rLine), px = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const a = Math.min(1, cov[i]); if (a <= 0) continue;
    const so = Math.max(0, Math.min(1, rOut + 0.5 - dOut[i])), sl = Math.max(0, Math.min(1, rLine + 0.5 - dLine[i]));
    let v = TONES.base; v = v * (1 - sl) + TONES.line * sl; v = v * (1 - so) + TONES.ink * so;
    const g = Math.round(v); px[i * 4] = g; px[i * 4 + 1] = g; px[i * 4 + 2] = g; px[i * 4 + 3] = Math.round(a * 255);
  }
  return px;
}

/** Builds the guide. Returns the vertices, the master->sheet transform and the two rasters (sheet = Image 2). */
export function buildGuide(targets = loadTargets()) {
  const P = Object.fromEntries(Object.entries(targets.points).map(([k, v]) => [k, v.xy]));
  const C = contour(P), poly = contourPolyline(C);
  const bb = poly.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
  const cx = (bb[0] + bb[2]) / 2, cy = (bb[1] + bb[3]) / 2;
  const toSheet = ([x, y]) => [SCALE * (x - cx) + SHEET.w / 2, SCALE * (y - cy) + SHEET.h / 2];
  const transform = { masterToSheet: { scale: SCALE, centreMaster: [cx, cy], centreSheet: [SHEET.w / 2, SHEET.h / 2] }, sheetToMaster: { s: 1 / SCALE, tx: cx - SHEET.w / 2 / SCALE, ty: cy - SHEET.h / 2 / SCALE } };
  const lines = LINES.map(([a, c, b]) => [a, ...quad(a, c, b, 24)]);
  const sheetPx = rasterise(SHEET.w, SHEET.h, poly.map(toSheet), lines.map((l) => l.map(toSheet)), SCALE);
  const masterPx = rasterise(MASTER.w, MASTER.h, poly, lines, 1);
  return { vertices: Object.fromEntries(C.map((c) => [c.n, c.p])), masterBBox: bb, transform, toSheet, sheetPx, masterPx };
}

const invokedDirectly = typeof process.argv[1] === "string" && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  const args = process.argv.slice(2), g = buildGuide();
  console.log(GUIDE_ID + " sheet pixel SHA-256 " + pixelSha256(g.sheetPx));
  if (args.includes("--write-fixture")) { writeFileSync(join(REPO, ...FIXTURE.split("/")), encodePng(SHEET.w, SHEET.h, g.sheetPx)); console.log("wrote " + FIXTURE); }
  const r = args.indexOf("--review");
  if (r >= 0) {
    const dir = resolve(args[r + 1] || join(REPO, "tools/avatar/build/r3-hair-guide-v1-review")); mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "guide-master-1024x1536-REVIEW-ONLY.png"), encodePng(MASTER.w, MASTER.h, g.masterPx));
    console.log("wrote review views to " + dir);
  }
}
