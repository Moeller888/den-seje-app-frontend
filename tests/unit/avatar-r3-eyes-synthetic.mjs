// D-169 — SYNTHETIC technical test shapes for the eyes tool: plain ellipses, bands and lines drawn on 1536x1024 sheets at
// 4x around the DRAFT eye geometry. Not an eye design, not a pixel source, never an R3 asset.
import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng, sha256, SHEET } from "../../tools/avatar/r3-eyes-tool.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DRAFT_TARGETS = JSON.parse(readFileSync(join(REPO, "tools", "avatar", "fixtures", "r3-eyes", "targets-eyes-v1.json"), "utf8"));
/** The synthetic sheet maps master -> sheet by x' = K(x − CX) + 768, y' = K(y − CY) + 512. */
export const K = 4, CX = 509.9, CY = 321;
export const toSheet = ([x, y]) => [K * (x - CX) + SHEET.midX, K * (y - CY) + SHEET.h / 2];
const toMaster = (X, Y) => [(X - SHEET.midX) / K + CX, (Y - SHEET.h / 2) / K + CY];
const inE = (p, c, r) => ((p[0] - c[0]) / r[0]) ** 2 + ((p[1] - c[1]) / r[1]) ** 2 <= 1;
const segD = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };

/** Per-eye synthetic geometry in MASTER pixels (read from the DRAFT reference geometry, sclera chosen to sit in D-159's zones). */
export const GEO = Object.freeze({
  eyeLeft: { ...DRAFT_TARGETS.referenceGeometry.eyeLeft, sclera: { c: [440, 318], r: [37, 38] }, fold: [[432, 272], [458, 274], [470, 281], [476, 286]] },
  eyeRight: { ...DRAFT_TARGETS.referenceGeometry.eyeRight, sclera: { c: [579, 317], r: [37, 39] }, fold: [[541, 288], [549, 280], [556, 274], [565, 272], [582, 272]] },
});
export const IRIS_MARGIN = 1.5;

let FIXED_BASE = null;
/** A synthetic eyes-fixed sheet. `edit(px)` may change a COPY of the cached pixels (for negative tests). */
export function fixedSheet(edit) {
  if (!FIXED_BASE) FIXED_BASE = drawFixed();
  const px = new Uint8ClampedArray(FIXED_BASE);
  if (edit) edit(px);
  return encodePng(SHEET.w, SHEET.h, px);
}
function drawFixed() {
  const { w, h } = SHEET, px = new Uint8ClampedArray(w * h * 4);
  const put = (i, rgb, a = 255) => { px[i * 4] = rgb[0]; px[i * 4 + 1] = rgb[1]; px[i * 4 + 2] = rgb[2]; px[i * 4 + 3] = a; };
  for (let Y = 0; Y < h; Y++) for (let X = 0; X < w; X++) {
    const m = toMaster(X + 0.5, Y + 0.5), i = Y * w + X;
    for (const g of Object.values(GEO)) {
      const ring = g.irisRing, inner = [ring.semiAxes[0] - ring.ringWidth, ring.semiAxes[1] - ring.ringWidth];
      if (Math.min(...g.fold.slice(1).map((b, j) => segD(m, g.fold[j], b))) <= 0.8) put(i, [120, 70, 40]);
      const inSclera = inE(m, g.sclera.c, g.sclera.r), inLashZone = inE(m, g.sclera.c, [g.sclera.r[0] + 3, g.sclera.r[1] + 3]) && m[1] < g.lashLowerEdgeY + 1;
      if (inLashZone) { put(i, [8, 6, 5]); continue; }
      if (!inSclera) { if (inE(m, g.sclera.c, [g.sclera.r[0] + 4, g.sclera.r[1] + 4])) put(i, [8, 6, 5]); continue; } // eye outline
      if (inE(m, ring.centre, inner)) { if (inE(m, g.highlight.centre, g.highlight.semiAxes)) put(i, [252, 252, 250]); else px[i * 4 + 3] = 0; continue; }
      if (inE(m, ring.centre, ring.semiAxes)) { put(i, [10, 8, 8]); continue; }
      put(i, [250, 248, 247]);
    }
  }
  return px;
}
const IRIS_CACHE = new Map();
/**
 * A synthetic achromatic iris sheet: two ovals IRIS_MARGIN larger than the ring, a vertical grey ramp and a dark pupil.
 * `scale` scales the ovals about their centres; `spread` scales the centres about the irises' midpoint; `shiftRight`
 * moves only the image-right iris (master px). `edit(px)` changes a COPY of the cached pixels.
 */
export function irisSheet(edit, { scale = 1, spread = 1, shiftRight = [0, 0] } = {}) {
  const key = JSON.stringify([scale, spread, shiftRight]);
  if (!IRIS_CACHE.has(key)) IRIS_CACHE.set(key, drawIris(scale, spread, shiftRight));
  const px = new Uint8ClampedArray(IRIS_CACHE.get(key));
  if (edit) edit(px);
  return encodePng(SHEET.w, SHEET.h, px);
}
function drawIris(scale, spread, shiftRight) {
  const { w, h } = SHEET, px = new Uint8ClampedArray(w * h * 4);
  const mid = (GEO.eyeLeft.irisRing.centre[0] + GEO.eyeRight.irisRing.centre[0]) / 2;
  for (let Y = 0; Y < h; Y++) for (let X = 0; X < w; X++) {
    const m = toMaster(X + 0.5, Y + 0.5), i = Y * w + X;
    for (const [e, g] of Object.entries(GEO)) {
      const d = e === "eyeRight" ? shiftRight : [0, 0];
      const c = [mid + (g.irisRing.centre[0] - mid) * spread + d[0], g.irisRing.centre[1] + d[1]], r = [(g.irisRing.semiAxes[0] + IRIS_MARGIN) * scale, (g.irisRing.semiAxes[1] + IRIS_MARGIN) * scale];
      if (!inE(m, c, r)) continue;
      const pupil = inE(m, c, [g.pupil.semiAxes[0] * scale, g.pupil.semiAxes[1] * scale]);
      const v = pupil ? 12 : Math.round(90 + 140 * Math.max(0, Math.min(1, (m[1] - c[1] + r[1]) / (2 * r[1]))));
      px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v; px[i * 4 + 3] = 255;
    }
  }
  return px;
}
/** Synthetic targets: the DRAFT points with the synthetic-test status. */
export const syntheticTargets = () => ({ ...JSON.parse(JSON.stringify(DRAFT_TARGETS)), status: "SYNTHETIC_TEST_APPROVED" });
/** The annotation that maps the synthetic sheet exactly back onto the targets (residual 0). */
export function syntheticAnnotation(rawBuf, perturb = {}) {
  const points = {};
  for (const e of ["eyeLeft", "eyeRight"]) {
    points[e] = {};
    for (const k of ["ringCentre", "outerCorner", "innerCorner"]) { const p = toSheet(DRAFT_TARGETS.points[e][k].xy), d = perturb[`${e}.${k}`] ?? [0, 0]; points[e][k] = [p[0] + d[0], p[1] + d[1]]; }
  }
  return { schema: "r3-eyes-annotation-v1", annotationVersion: 1, raw: { file: "synthetic", sha256: sha256(rawBuf) }, sheetType: "r3-eyes-fixed-sheet-v1",
    coordinateSpace: "sheet continuous; pixel i covers [i, i+1); origin = the sheet's top-left; 1536x1024", pointDefinitions: "r3-eyes-targets-v1",
    points, uncertaintyPx: 0, annotator: "synthetic test", status: "SYNTHETIC_TEST_APPROVED", approvedBy: null, approvedOn: null };
}
