// R3 HAIR HYBRID DERIVATION (D-185) — generated painting from a technically passed raw hair sheet, combined with documented
// vector edits: masks that REMOVE raw hair, named paint fields that ADD hair beneath the raw painting, and drawn CONTOURS.
// Three things stay apart:
//   1  the untouched raw source (its bytes, SHA-256 and its original check report; never written),
//   2  the edit specification (JSON) and this generator,
//   3  the derived sheet and its placed review candidate, each with its own hashes.
// Every pixel no edit touches keeps the raw bytes exactly. No Northstar pixel, no free pixel retouching, no change to an
// earlier check result. The construction annotation of a derivation is NOT a reading: its fit points are drawn vertices.
//
// Usage: node tools/avatar/r3-hair-hybrid.mjs --spec <edits.json> --out <empty dir> [--face <png> --eyes <png> --iris <png>]
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng, encodePng, pixelSha256, checkHairSheet, applyTonalRampB } from "./r3-hair-tool.mjs";
import { proposeA4, fitSeat, checkLocks, checkPlacedHair, POINT_DEFINITIONS } from "./r3-hair-tool-v2.mjs";
import { resampleArea, overInto, quantise } from "./r3-face-parts-tool.mjs";
import { buildGuide, contour, loadTargets } from "./r3-hair-guide-v1.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
export const TOOL_ID = "r3-hair-hybrid";
export const ANNOTATION_SCHEMA = "r3-hair-hybrid-annotation-v1";
export const N = 1024;
const MW = 1024, MH = 1536;
export const SOURCE = Object.freeze({ file: "tools/avatar/fixtures/r3-hair/hybrid/source-r3-hair-d183.png", sha256: "7b36e05481dc0389a71a362b9f7501c7eaca35b2d3771c24624eefa797f2d66d",
  report: "tools/avatar/fixtures/r3-hair/hybrid/source-r3-hair-d183.check.json", reportSha256: "e0a7a537ad4ca1985e9c727a3faf31f5a3a4901556d202dd052431baf16cbefc", decision: "D-183", closedBy: "D-184" });
/** The only edit types a derivation may use. */
export const EDIT_TYPES = Object.freeze({ remove: ["id", "why", "polygon"], add: ["id", "why", "polygon", "tone"], contours: ["id", "points"] });
export const CHANGE_CATEGORIES = Object.freeze(["rawKeptExact", "rawRemoved", "rawPartlyRemoved", "rawUnderPainted", "rawInked", "newPainted", "other", "transparent"]);
const sha = (b) => createHash("sha256").update(b).digest("hex");

// ═════════════════════════════════ the edit specification ═════════════════════════════════
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isPt = (p) => Array.isArray(p) && p.length === 2 && p.every(isNum);
/** Structural validation: only the documented edit types, keys and point forms; never pixel data. */
export function validateSpec(spec, vertexNames) {
  const problems = [], names = new Set(vertexNames);
  if (!spec || typeof spec !== "object") return { ok: false, problems: ["the spec is not an object"] };
  if (typeof spec.id !== "string" || !/^r3-hair-hybrid-v\d+$/.test(spec.id)) problems.push("id must be r3-hair-hybrid-v<n>");
  for (const k of Object.keys(spec)) if (!["id", "status", "coordinates", "paintingSource", "remove", "add", "contours", "parameters", "changesFromPrevious"].includes(k)) problems.push("unknown top-level key: " + k);
  const P = spec.parameters || {};
  if (P.supersample !== 4 || !isNum(P.inkTone) || !isNum(P.inkHalfWidthPx) || P.inkHalfWidthPx <= 0 || P.inkHalfWidthPx > 4) problems.push("parameters: supersample 4, inkTone and inkHalfWidthPx (0..4) are required");
  const checkPoint = (p, where) => {
    if (typeof p === "string") { if (!names.has(p)) problems.push(`${where}: unknown vertex ${p}`); return; }
    if (isPt(p)) { if (p.some((v) => v < 0 || v > N)) problems.push(`${where}: point outside the sheet`); return; }
    if (p && typeof p === "object" && Array.isArray(p.guide)) { if (p.guide.length !== 2 || !p.guide.every((v) => names.has(v))) problems.push(`${where}: guide path needs two known vertices`); checkOffset(p.offset, where); for (const k of Object.keys(p)) if (!["guide", "offset"].includes(k)) problems.push(`${where}: unknown key ${k}`); return; }
    if (p && typeof p === "object" && Array.isArray(p.curve)) { if (p.curve.length !== 2) problems.push(`${where}: curve needs two end points`); p.curve.forEach((q) => { if (!(typeof q === "string" ? names.has(q) : isPt(q))) problems.push(`${where}: bad curve end`); }); if (!isNum(p.bulge) || Math.abs(p.bulge) > 0.5) problems.push(`${where}: bulge in -0.5..0.5`); for (const k of Object.keys(p)) if (!["curve", "bulge"].includes(k)) problems.push(`${where}: unknown key ${k}`); return; }
    problems.push(`${where}: a point is a vertex name, [x, y], {guide} or {curve}`);
  };
  const checkOffset = (o, where) => {
    if (o === undefined || isNum(o)) return;
    if (Array.isArray(o) && o.length === 2 && o.every(isNum)) return;
    if (Array.isArray(o) && o.length >= 2 && o.every((q) => isPt(q) && q[0] >= 0 && q[0] <= 1) && o.every((q, i) => !i || q[0] > o[i - 1][0])) return;
    problems.push(`${where}: offset is a number, [d0, d1] or increasing [[t, d], ...]`);
  };
  for (const [type, keys] of Object.entries(EDIT_TYPES)) {
    if (!Array.isArray(spec[type])) { problems.push(`${type}: a list is required`); continue; }
    for (const e of spec[type]) {
      const where = `${type} ${e?.id ?? "?"}`;
      for (const k of keys) if (!(k in (e || {}))) problems.push(`${where}: missing ${k}`);
      for (const k of Object.keys(e || {})) if (!keys.includes(k) && !/Why$|^drawnTufts$/.test(k)) problems.push(`${where}: unknown key ${k}`);
      const list = type === "contours" ? e?.points : e?.polygon;
      const isPath = (q) => q && typeof q === "object" && !Array.isArray(q) && (q.guide || q.curve);
      if (!Array.isArray(list) || list.length === 0 || (list.length === 1 && !isPath(list[0]))) { problems.push(`${where}: points required (two or more, or one guide path / curve)`); continue; }
      list.forEach((p, i) => checkPoint(p, `${where}[${i}]`));
      if (type === "add" && !(Number.isInteger(e.tone) && e.tone >= 0 && e.tone <= 255)) problems.push(`${where}: tone is an integer grey 0..255`);
    }
  }
  return { ok: problems.length === 0, problems };
}

// ═════════════════════════════════ geometry ═════════════════════════════════
const quadPts = (a, c, b, m) => { const o = []; for (let k = 1; k <= m; k++) { const t = k / m, u = 1 - t; o.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]); } return o; };
function geometry(targets) {
  const guide = buildGuide(targets);
  const V = Object.fromEntries(Object.entries(guide.vertices).map(([k, p]) => [k, guide.toSheet(p)]));
  const GC = contour(Object.fromEntries(Object.entries(targets.points).map(([k, v]) => [k, v.xy])));
  const pt = (p) => (typeof p === "string" ? V[p] : p);
  // the guide's own curved contour between two named vertices, walking the direction with fewer edges
  function guidePath(from, to) {
    const ia = GC.findIndex((c) => c.n === from), ib = GC.findIndex((c) => c.n === to), L = GC.length;
    const edge = (i) => { const a = GC[i].p, b = GC[(i + 1) % L].p, dx = b[0] - a[0], dy = b[1] - a[1]; return [a, ...quadPts(a, [(a[0] + b[0]) / 2 + GC[i].b * dy, (a[1] + b[1]) / 2 - GC[i].b * dx], b, Math.max(4, Math.ceil(Math.hypot(dx, dy) / 2)))]; };
    const fwd = (ib - ia + L) % L, bwd = (ia - ib + L) % L, out = [];
    if (fwd <= bwd) for (let k = 0; k < fwd; k++) { const e = edge((ia + k) % L); out.push(...(k ? e.slice(1) : e)); }
    else { for (let k = 0; k < bwd; k++) { const e = edge((ib + k) % L); out.push(...(k ? e.slice(1) : e)); } out.reverse(); }
    return out.map(guide.toSheet);
  }
  // offset along the LEFT normal (dy, -dx) of the travel direction: a number, a linear [d0, d1] or a piecewise [[t, d], ...]
  function offsetPath(P, d) {
    const at = (i) => {
      const t = P.length > 1 ? i / (P.length - 1) : 0;
      if (d === undefined) return 0;
      if (isNum(d)) return d;
      if (d.length === 2 && isNum(d[0])) return d[0] + (d[1] - d[0]) * t;
      for (let k = 1; k < d.length; k++) if (t <= d[k][0]) { const [t0, d0] = d[k - 1], [t1, d1] = d[k]; return d0 + (d1 - d0) * (t - t0) / (t1 - t0); }
      return d[d.length - 1][1];
    };
    return P.map((p, i) => { const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, o = at(i); return [p[0] + o * dy / L, p[1] - o * dx / L]; });
  }
  // a quadratic curve between two points; bulge as in the guide: + bows to the LEFT normal (dy, -dx) of the travel direction
  function curve(a, b, bulge) { a = pt(a); b = pt(b); const dx = b[0] - a[0], dy = b[1] - a[1]; return [a, ...quadPts(a, [(a[0] + b[0]) / 2 + bulge * dy, (a[1] + b[1]) / 2 - bulge * dx], b, Math.max(8, Math.ceil(Math.hypot(dx, dy) / 2)))]; }
  const expand = (list) => list.flatMap((p) => {
    if (p && typeof p === "object" && !Array.isArray(p) && p.guide) return offsetPath(guidePath(...p.guide), p.offset);
    if (p && typeof p === "object" && !Array.isArray(p) && p.curve) return curve(p.curve[0], p.curve[1], p.bulge);
    return [pt(p)];
  });
  return { guide, V, expand };
}

function polyCoverage(P, S) {
  const cov = new Float32Array(N * N);
  for (let sy = 0; sy < N * S; sy++) {
    const yy = (sy + 0.5) / S, xs = [];
    for (let i = 0; i < P.length; i++) { const [ax, ay] = P[i], [bx, by] = P[(i + 1) % P.length]; if ((ay <= yy) !== (by <= yy)) xs.push(ax + (yy - ay) / (by - ay) * (bx - ax)); }
    xs.sort((a, b) => a - b);
    for (let j = 0; j + 1 < xs.length; j += 2) for (let sx = Math.max(0, Math.ceil(xs[j] * S - 0.5)); sx < Math.min(N * S, Math.ceil(xs[j + 1] * S - 0.5)); sx++) cov[Math.floor(sy / S) * N + Math.floor(sx / S)] += 1 / (S * S);
  }
  return cov;
}
function lineCoverage(P, r) {
  const cov = new Float32Array(N * N);
  for (let i = 0; i + 1 < P.length; i++) {
    const [ax, ay] = P[i], [bx, by] = P[i + 1], vx = bx - ax, vy = by - ay, vv = vx * vx + vy * vy || 1;
    for (let y = Math.max(0, Math.floor(Math.min(ay, by) - r - 1)); y <= Math.min(N - 1, Math.ceil(Math.max(ay, by) + r + 1)); y++)
      for (let x = Math.max(0, Math.floor(Math.min(ax, bx) - r - 1)); x <= Math.min(N - 1, Math.ceil(Math.max(ax, bx) + r + 1)); x++) {
        const px = x + 0.5, py = y + 0.5, t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / vv)), d = Math.hypot(px - ax - t * vx, py - ay - t * vy);
        const c = Math.max(0, Math.min(1, r + 0.5 - d)); if (c > cov[y * N + x]) cov[y * N + x] = c;
      }
  }
  return cov;
}

// ═════════════════════════════════ build ═════════════════════════════════
/** Builds the derived sheet. Pure: never writes; rawPx is never modified. */
export function buildHybrid({ spec, rawPx, targets = loadTargets() }) {
  const g = geometry(targets), vs = validateSpec(spec, Object.keys(g.V));
  if (!vs.ok) throw new Error("invalid edit specification: " + vs.problems.join("; "));
  if (!(rawPx instanceof Uint8Array || rawPx instanceof Uint8ClampedArray) || rawPx.length !== N * N * 4) throw new Error("the raw source must be a 1024x1024 RGBA sheet");
  const S = spec.parameters.supersample, removeCov = new Float32Array(N * N), addA = new Float32Array(N * N), addTone = new Float32Array(N * N), inkCov = new Float32Array(N * N);
  for (const r of spec.remove) { const c = polyCoverage(g.expand(r.polygon), S); for (let i = 0; i < N * N; i++) if (c[i] > removeCov[i]) removeCov[i] = c[i]; }
  for (const a of spec.add) { const c = polyCoverage(g.expand(a.polygon), S); for (let i = 0; i < N * N; i++) if (c[i] > addA[i]) { addA[i] = c[i]; addTone[i] = a.tone; } }
  for (const c of spec.contours) { const l = lineCoverage(g.expand(c.points), spec.parameters.inkHalfWidthPx); for (let i = 0; i < N * N; i++) if (l[i] > inkCov[i]) inkCov[i] = l[i]; }
  const HY = new Uint8ClampedArray(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    if (removeCov[i] === 0 && addA[i] === 0 && inkCov[i] === 0) { HY.set(rawPx.subarray(i * 4, i * 4 + 4), i * 4); continue; }   // untouched: raw bytes
    const ra = rawPx[i * 4 + 3] / 255 * (1 - removeCov[i]), aa = addA[i] * (1 - removeCov[i]), a = ra + aa * (1 - ra);
    if (a <= 0) continue;
    const k = a >= 16 / 255 ? inkCov[i] : 0;   // a contour never creates hair
    for (let c = 0; c < 3; c++) HY[i * 4 + c] = Math.round(((rawPx[i * 4 + c] * ra + addTone[i] * aa * (1 - ra)) / a) * (1 - k) + spec.parameters.inkTone * k);
    HY[i * 4 + 3] = Math.round(a * 255);
  }
  // change categories (legend in the manifest)
  const counts = Object.fromEntries(CHANGE_CATEGORIES.map((k) => [k, 0])), CM = new Uint8ClampedArray(N * N * 4);
  const COL = { rawKeptExact: null, rawRemoved: [235, 60, 60], rawPartlyRemoved: [245, 150, 40], rawUnderPainted: [120, 200, 245], rawInked: [150, 40, 190], newPainted: [40, 120, 240], other: [0, 0, 0], transparent: null };
  for (let i = 0; i < N * N; i++) {
    const rv = rawPx[i * 4 + 3] >= 16, hv = HY[i * 4 + 3] >= 16, same = HY[i * 4] === rawPx[i * 4] && HY[i * 4 + 1] === rawPx[i * 4 + 1] && HY[i * 4 + 2] === rawPx[i * 4 + 2] && HY[i * 4 + 3] === rawPx[i * 4 + 3];
    const cat = rv && !hv ? "rawRemoved" : !rv && hv ? "newPainted" : rv && same ? "rawKeptExact" : rv && removeCov[i] > 0 ? "rawPartlyRemoved" : rv && inkCov[i] > 0 ? "rawInked" : rv && addA[i] > 0 ? "rawUnderPainted" : rv ? "other" : "transparent";
    counts[cat]++;
    const col = COL[cat] ?? (cat === "rawKeptExact" ? Array(3).fill(Math.round(150 + rawPx[i * 4] * 0.4)) : (((i % N) >> 4) + ((i / N | 0) >> 4)) & 1 ? [228, 228, 228] : [250, 250, 250]);
    CM[i * 4] = col[0]; CM[i * 4 + 1] = col[1]; CM[i * 4 + 2] = col[2]; CM[i * 4 + 3] = 255;
  }
  return { sheetPx: HY, changeMapPx: CM, counts, vertices: g.V, sheetToMaster: g.guide.transform.sheetToMaster };
}

// ═════════════════════════════════ the construction annotation ═════════════════════════════════
const BINDINGS = Object.freeze({ centreHairline: "A4", leftEarTopJunction: "A9", rightEarTopJunction: "A10" });
/** A crop of the RASTERISED derived sheet around a point (sheet px, 24 px each way), alpha-composited on white, x4. */
export function cornerCrop(sheetPx, xy) {
  const R = 24, S = 4, x0 = Math.round(xy[0]) - R, y0 = Math.round(xy[1]) - R, w = 2 * R * S, o = new Uint8ClampedArray(w * w * 4);
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) { const sx = x0 + Math.floor(x / S), sy = y0 + Math.floor(y / S), i = (sy * N + sx) * 4, a = sx < 0 || sy < 0 || sx >= N || sy >= N ? 0 : sheetPx[i + 3] / 255; for (let c = 0; c < 3; c++) o[(y * w + x) * 4 + c] = Math.round((a ? sheetPx[i + c] : 0) * a + 255 * (1 - a)); o[(y * w + x) * 4 + 3] = 255; }
  const m = (xy[0] - x0) * S, n = (xy[1] - y0) * S; for (let k = -10; k <= 10; k++) { for (const [px, py] of [[m + k, n], [m, n + k]]) { const X = Math.round(px), Y = Math.round(py); if (X >= 0 && Y >= 0 && X < w && Y < w) o.set([230, 0, 0, 255], (Y * w + X) * 4); } }
  return { w, h: w, px: o };
}
/** The lowest hair pixel of a lock region on the near side of a cut line a -> b (the rasterised tip of a cut lock). */
function rasterTip(sheetPx, a, b, box) {
  let best = null;
  for (let y = box[1]; y < box[3]; y++) for (let x = box[0]; x < box[2]; x++) { if (sheetPx[(y * N + x) * 4 + 3] < 16) continue; const side = (b[0] - a[0]) * (y + 0.5 - a[1]) - (b[1] - a[1]) * (x + 0.5 - a[0]); if (side > 0.5) continue; if (!best || y > best[1]) best = [x + 0.5, y + 0.5]; }
  return best;
}
/** Builds the DRAFT construction annotation of a derivation: drawn vertices bound to the edit geometry, never readings. */
export function constructionAnnotation({ spec, specSha256, built, derivedPixelSha256 }) {
  const V = built.vertices, crop = (xy) => ({ pixelSha256: pixelSha256(cornerCrop(built.sheetPx, xy).px), size: [192, 192], note: "the rasterised derived sheet around the point, x4, red cross on the point" });
  const rightTip = rasterTip(built.sheetPx, V.A8, V["A8-n-side"], [680, 600, 752, 700]);
  return {
    schema: ANNOTATION_SCHEMA, kind: "CONSTRUCTION — the points are drawn vertices of the edit geometry, NOT readings of a sheet; D-179's hidden second reading applies to the raw-sheet method only and is not claimed here",
    reviewStatus: "DRAFT — owner review pending",
    derivation: { id: spec.id, specSha256, generator: "tools/avatar/r3-hair-hybrid.mjs", source: { file: SOURCE.file, sha256: SOURCE.sha256, report: SOURCE.report, reportSha256: SOURCE.reportSha256 }, derivedPixelSha256 },
    units: "sheet-px", transform: { from: "guide-hair-v1 (the approved targets mapped into the sheet)", sheetToMaster: built.sheetToMaster },
    fitPoints: Object.fromEntries(Object.entries(BINDINGS).map(([k, v]) => [k, { xy: V[v], boundTo: `guide vertex ${v} = the approved target ${k}, drawn by the edit geometry`, definition: k === "centreHairline" ? "r3-hair-v2:A4-parting-apex" : POINT_DEFINITIONS[k], crop: crop(V[v]) }])),
    locks: {
      leftTempleLock: { tip: V.A7, flankingNotches: [V["A7-n-face"], V["A7-n-side"]], boundTo: "guide vertices A7, A7-n-face, A7-n-side; the raw lock between the left-ear cut and the face-opening cut", crop: crop(V.A7) },
      rightTempleLock: { tip: rightTip, flankingNotches: [V["A8-n-face"], V["A8-n-side"]], boundTo: "notches at guide vertices A8-n-face and A8-n-side; the tip is the rasterised lowest pixel of the raw lock on the near side of the drawn wedge cut A8 -> A8-n-side", crop: crop(rightTip) },
    },
    validationNote: "A seat residual of zero is a property of the construction (the drawn vertices ARE the targets), not an independent validation. What the checks still prove is functional: coverage, holes, brows, eyes, ears, fragments and lock separation on the actual derived pixels.",
  };
}
/** Validates a construction annotation against its derivation. It never accepts readings in place of construction points. */
export function validateHybridAnnotation(ann, { specSha256, derivedPixelSha256, vertices }) {
  const p = [];
  if (!ann || ann.schema !== ANNOTATION_SCHEMA) return { ok: false, problems: ["not an r3-hair-hybrid-annotation-v1"] };
  if (!/^CONSTRUCTION/.test(ann.kind ?? "")) p.push("kind must declare a CONSTRUCTION annotation");
  if (!["DRAFT — owner review pending", "OWNER_REVIEWED", "REJECTED"].includes(ann.reviewStatus)) p.push("reviewStatus must be DRAFT — owner review pending, OWNER_REVIEWED or REJECTED");
  if (ann.derivation?.source?.sha256 !== SOURCE.sha256 || ann.derivation?.source?.reportSha256 !== SOURCE.reportSha256) p.push("the source binding is not the untouched D-183 sheet and its report");
  if (ann.derivation?.specSha256 !== specSha256) p.push("the annotation belongs to another edit specification");
  if (ann.derivation?.derivedPixelSha256 !== derivedPixelSha256) p.push("the annotation belongs to other derived pixels");
  for (const [k, v] of Object.entries(BINDINGS)) {
    const f = ann.fitPoints?.[k];
    if (!f) { p.push(`${k}: missing`); continue; }
    if ("readings" in f) p.push(`${k}: a construction point carries no readings`);
    if (!isPt(f.xy) || f.xy[0] !== vertices[v][0] || f.xy[1] !== vertices[v][1]) p.push(`${k}: not bound to the drawn vertex ${v}`);
    if (!/^[0-9a-f]{64}$/.test(f.crop?.pixelSha256 ?? "")) p.push(`${k}: the crop of the rasterised corner is missing`);
  }
  for (const k of ["leftTempleLock", "rightTempleLock"]) { const L = ann.locks?.[k]; if (!L || !isPt(L.tip) || !Array.isArray(L.flankingNotches) || L.flankingNotches.length !== 2 || !/^[0-9a-f]{64}$/.test(L.crop?.pixelSha256 ?? "")) p.push(`${k}: tip, two notches and a crop are required`); }
  if (!/not an independent validation/.test(ann.validationNote ?? "")) p.push("the annotation must state that a zero residual is not an independent validation");
  return { ok: p.length === 0, problems: p };
}

// ═════════════════════════════════ checks ═════════════════════════════════
const placeOnMaster = (px, f) => { const l = resampleArea({ w: N, h: N, px }, f.s, f.tx, f.ty, MW, MH), acc = new Float64Array(MW * MH * 4); overInto(acc, MW, l); return quantise(acc, MW, MH); };
/** Runs the raw-sheet checks, the A4 proposal, the seat fit, HP-LOCK and the placed checks on the derived pixels. Layers that
 *  are not supplied (face, eyes, iris) are reported as NOT RUN — never as passed. */
export function runChecks({ built, ann, targets = loadTargets(), headPx, facePx = null, eyesFixedPx = null, irisPx = null }) {
  const png = encodePng(N, N, built.sheetPx), V = built.vertices;
  const raw = checkHairSheet(png);
  const a4 = proposeA4(built.sheetPx, V.A9, V.A10);
  const fitAnn = { fitPoints: Object.fromEntries(Object.keys(BINDINGS).map((k) => [k, { xy: ann.fitPoints[k].xy }])) };
  const seat = fitSeat(fitAnn, targets);
  const locks = seat.ok ? checkLocks({ locks: Object.fromEntries(Object.entries(ann.locks).map(([k, L]) => [k, { status: "IDENTIFIED", tip: L.tip, flankingNotches: L.flankingNotches, evidence: L.boundTo }])) }, targets, seat.fit, built.sheetPx) : null;
  const hairPx = seat.ok ? placeOnMaster(built.sheetPx, seat.fit) : null;
  const all = !!(facePx && eyesFixedPx && irisPx), empty = new Uint8ClampedArray(MW * MH * 4);
  const pc = hairPx && headPx ? checkPlacedHair({ hairPx, headPx, facePx: facePx ?? empty, eyesFixedPx: eyesFixedPx ?? empty, irisPx: irisPx ?? empty, targets }) : null;
  const needsFace = new Set(["HP6", "HP7"]);
  const placed = pc && pc.checks.map((c) => (!all && needsFace.has(c.id) ? { id: c.id, ok: null, status: "NOT RUN — the face layer, eyes and iris were not supplied" } : { id: c.id, ok: c.ok, value: c.value }));
  let grey = 0, lowA = 0; for (let i = 0; i < N * N; i++) { const a = built.sheetPx[i * 4 + 3]; if (a >= 16) { const r = built.sheetPx[i * 4], g = built.sheetPx[i * 4 + 1], b = built.sheetPx[i * 4 + 2]; grey = Math.max(grey, Math.max(r, g, b) - Math.min(r, g, b)); } else if (a > 0) lowA++; }
  return { rawSheet: { verdict: raw.verdict, firstFailure: raw.firstFailure || null, auto: raw.auto.map((a) => `${a.id} ${a.result} ${a.detail}`) },
    a4Proposal: { xy: a4.xy, offsetFromConstructionSheetPx: a4.ok ? Math.hypot(a4.xy[0] - V.A4[0], a4.xy[1] - V.A4[1]) : null },
    seat: seat.ok ? { residualMaxMasterPx: seat.log.residualMaxMasterPx, aspect: seat.log.aspect, s: seat.log.s, byConstruction: true } : { failed: seat.code },
    locks: locks && locks.locks.map((l) => ({ lock: l.lock, ok: l.ok, lengthMasterPx: l.lengthMasterPx, tipOffsetMasterPx: l.tipOffsetMasterPx, windowPx: l.windowPx, reason: l.reason ?? null })),
    placed, placedRunWith: all ? "head geometry, face layer, eyes and iris" : "head geometry only (HP6 and HP7 not run)", greyMaxChroma: grey, lowAlphaPx: lowA, hairPx };
}

// ═════════════════════════════════ CLI ═════════════════════════════════
const invokedDirectly = typeof process.argv[1] === "string" && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  const args = process.argv.slice(2), arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const specFile = arg("--spec"), out = arg("--out"); if (!specFile || !out) throw new Error("usage: --spec <edits.json> --out <empty dir> [--face <png> --eyes <png> --iris <png>]");
  const OUT = resolve(out); if (existsSync(OUT) && readdirSync(OUT).length) throw new Error("output directory not empty"); mkdirSync(OUT, { recursive: true });
  const rawBuf = readFileSync(join(REPO, SOURCE.file)); if (sha(rawBuf) !== SOURCE.sha256) throw new Error("the raw source is not the pinned D-183 sheet");
  if (sha(readFileSync(join(REPO, SOURCE.report))) !== SOURCE.reportSha256) throw new Error("the source check report is not the pinned original");
  const specBuf = readFileSync(resolve(specFile)), spec = JSON.parse(specBuf.toString("utf8")), targets = loadTargets();
  const built = buildHybrid({ spec, rawPx: decodePng(rawBuf).px, targets }), derivedPixelSha256 = pixelSha256(built.sheetPx);
  const ann = constructionAnnotation({ spec, specSha256: sha(specBuf), built, derivedPixelSha256 });
  const rd = (f) => (f ? decodePng(readFileSync(resolve(f))).px : null);
  const checks = runChecks({ built, ann, targets, headPx: decodePng(readFileSync(join(REPO, "tools/avatar/fixtures/r3-head-geometry/r3-head-geometry-g1v3-e2-v1.png"))).px, facePx: rd(arg("--face")), eyesFixedPx: rd(arg("--eyes")), irisPx: rd(arg("--iris")) });
  writeFileSync(join(OUT, spec.id + "-sheet.png"), encodePng(N, N, built.sheetPx));
  writeFileSync(join(OUT, spec.id + "-change-map.png"), encodePng(N, N, built.changeMapPx));
  if (checks.hairPx) writeFileSync(join(OUT, spec.id + "-placed-master-1024x1536.png"), encodePng(MW, MH, checks.hairPx));
  for (const [k, f] of [...Object.entries(ann.fitPoints), ...Object.entries(ann.locks)]) writeFileSync(join(OUT, `${spec.id}-crop-${k}.png`), (() => { const c = cornerCrop(built.sheetPx, k in ann.fitPoints ? f.xy : f.tip); return encodePng(c.w, c.h, c.px); })());
  const { hairPx, ...checkLog } = checks;
  writeFileSync(join(OUT, spec.id + ".annotation.json"), JSON.stringify(ann, null, 2) + "\n");
  writeFileSync(join(OUT, spec.id + ".checks.json"), JSON.stringify({ ...checkLog, placedPixelSha256: hairPx ? pixelSha256(hairPx) : null, changeCounts: built.counts, derivedPixelSha256, changeMapPixelSha256: pixelSha256(built.changeMapPx) }, null, 2) + "\n");
  console.log(JSON.stringify({ id: spec.id, derivedPixelSha256, placed: checkLog.placed?.map((c) => c.id + ":" + c.ok), locks: checkLog.locks?.map((l) => l.lock + ":" + l.ok), counts: built.counts }));
}
