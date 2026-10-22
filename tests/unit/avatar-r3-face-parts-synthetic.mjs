// Synthetic TECHNICAL parts for tests and review (flat test colours; not a face, not an asset). Same shapes as prototype v2.
import { LAYOUT, ANNOTATION_SCHEMA, encodePng, sha256 } from "../../tools/avatar/r3-face-parts-tool.mjs";

export const COL = Object.freeze({ browLeft: [50, 100, 200], browRight: [30, 140, 80], nose: [220, 120, 30], mouth: [120, 50, 160], shadow: [0, 0, 0] });
const SS = 8;
export const crescentF = (cx, cy, rx, ry, dy) => (x, y) => +(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 && ((x - cx) / (rx * 1.02)) ** 2 + ((y - cy - dy) / ry) ** 2 > 1);
export function crescentTips(cx, cy, rx, ry, dy) {
  const k = 1 / 1.0404, A = (1 - k) / ry ** 2, B = (-2 * dy) / ry ** 2, C = k + dy ** 2 / ry ** 2 - 1, D = Math.sqrt(B * B - 4 * A * C);
  const r1 = (-B + D) / (2 * A), v = Math.abs(r1) <= ry ? r1 : (-B - D) / (2 * A), u = rx * Math.sqrt(1 - v ** 2 / ry ** 2);
  return { left: [cx - u, cy + v], right: [cx + u, cy + v] };
}
export const ellipseF = (cx, cy, rx, ry) => (x, y) => +(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1);
export const rectF = (x0, y0, x1, y1) => (x, y) => +(x >= x0 && x < x1 && y >= y0 && y < y1);
export const arcF = (cx, cy, r, w, a0, a1) => (x, y) => { const d = Math.hypot(x - cx, y - cy), a = Math.atan2(y - cy, x - cx); return +(Math.abs(d - r) <= w / 2 && a >= a0 && a <= a1); };
export const shifted = (f, dx, dy) => (x, y) => f(x - dx, y - dy);
/** the DRAWING is rotated by +deg (y down); used only to make synthetic inputs — the compositor never rotates */
export const rotated = (f, cx, cy, deg) => { const c = Math.cos((deg * Math.PI) / 180), s = Math.sin((deg * Math.PI) / 180); return (x, y) => f(cx + (x - cx) * c + (y - cy) * s, cy - (x - cx) * s + (y - cy) * c); };
export const rotPt = ([x, y], cx, cy, deg) => { const c = Math.cos((deg * Math.PI) / 180), s = Math.sin((deg * Math.PI) / 180); return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]; };

export function renderCell(shapes, CW = 512, CH = 512) {
  const px = new Uint8ClampedArray(CW * CH * 4);
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (const s of shapes) {
      let c = 0;
      for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) c += s.value(x + (i + 0.5) / SS, y + (j + 0.5) / SS);
      const sa = (c / (SS * SS)) * (s.opacity ?? 1);
      if (sa <= 0) continue;
      r = s.rgb[0] * sa + r * (1 - sa); g = s.rgb[1] * sa + g * (1 - sa); b = s.rgb[2] * sa + b * (1 - sa); a = sa + a * (1 - sa);
    }
    const A = Math.round(a * 255);
    if (!A) continue;
    const o = (y * CW + x) * 4;
    px[o] = Math.round(r / a); px[o + 1] = Math.round(g / a); px[o + 2] = Math.round(b / a); px[o + 3] = A;
  }
  return px;
}
export function buildSheet(cellPx) {
  const [SW, SH] = LAYOUT.sheet, [CW, CH] = LAYOUT.cell, sheet = new Uint8ClampedArray(SW * SH * 4);
  for (const [name, px] of Object.entries(cellPx)) {
    const [cx, cy] = LAYOUT.cells[name];
    for (let y = 0; y < CH; y++) sheet.set(px.subarray(y * CW * 4, (y + 1) * CW * 4), ((cy * CH + y) * SW + cx * CW) * 4);
  }
  return sheet;
}
export const BROW_L = [200, 250, 150, 95, 40], BROW_R = [300, 230, 160, 100, 42], NOSE = [300, 260, 40, 64], MOUTH = [256, 40, 300, 22, 0.95, 2.19];
export const MOUTH_TILT_DEG = -6.05; // the draft target corners' angle (right corner higher)
const mouthEnd = (a) => [MOUTH[0] + MOUTH[2] * Math.cos(a), MOUTH[1] + MOUTH[2] * Math.sin(a)];
export const MOUTH_CENTRE = [256, 300];

/** The main synthetic sheet + its analytic source points. tiltMouth: draw the mouth in the reference orientation. */
export function mainSheet({ tiltMouth = false, browRightShapes = null } = {}) {
  const tl = crescentTips(...BROW_L), tr = crescentTips(...BROW_R);
  const mouthShape = tiltMouth ? rotated(arcF(...MOUTH), ...MOUTH_CENTRE, MOUTH_TILT_DEG) : arcF(...MOUTH);
  const mL = mouthEnd(2.19), mR = mouthEnd(0.95);
  const cells = {
    browLeft: renderCell([{ value: crescentF(...BROW_L), rgb: COL.browLeft }]),
    browRight: renderCell(browRightShapes ?? [{ value: crescentF(...BROW_R), rgb: COL.browRight }]),
    nose: renderCell([{ value: ellipseF(...NOSE), rgb: COL.nose }]),
    mouth: renderCell([{ value: mouthShape, rgb: COL.mouth }]),
  };
  const px = buildSheet(cells);
  const points = {
    browLeft: { inner: tl.right, outer: tl.left },
    browRight: { inner: tr.left, outer: tr.right },
    nose: { top: [NOSE[0], NOSE[1] - NOSE[3]], bottom: [NOSE[0], NOSE[1] + NOSE[3]] },
    mouth: tiltMouth ? { left: rotPt(mL, ...MOUTH_CENTRE, MOUTH_TILT_DEG), right: rotPt(mR, ...MOUTH_CENTRE, MOUTH_TILT_DEG) } : { left: mL, right: mR },
  };
  return { px, png: encodePng(1024, 1024, px), points };
}
export function makeAnnotation(rawSha, part, points, { status = "SYNTHETIC_TEST_APPROVED", reviewFlags = [], rawFile = "synthetic" } = {}) {
  return { schema: ANNOTATION_SCHEMA, annotationVersion: 1, raw: { file: rawFile, sha256: rawSha }, layoutId: LAYOUT.id, part, cell: [...LAYOUT.cells[part]],
    coordinateSpace: "cell-local continuous; pixel i covers [i, i+1); origin = the cell's top-left", pointDefinitions: "r3-face-neutral-targets-v1 (definition per point)",
    points: Object.fromEntries(Object.entries(points).map(([k, v]) => [k, v.map((n) => Math.round(n * 1e4) / 1e4)])), uncertaintyPx: 0,
    annotator: "synthetic: analytic shape definition", status, approvedBy: null, approvedOn: null, reviewFlags, note: "" };
}
export const annotationsFor = (rawSha, points, opts) => Object.fromEntries(LAYOUT.order.map((p) => [p, makeAnnotation(rawSha, p, points[p], opts)]));
/** synthetic-test copy of the DRAFT targets (same coordinates; status marks it as test-only) */
export const syntheticTargets = (draft) => ({ ...draft, version: draft.version + "+synthetic-test", status: "SYNTHETIC_TEST_APPROVED" });
export const shaOf = (png) => sha256(png);
