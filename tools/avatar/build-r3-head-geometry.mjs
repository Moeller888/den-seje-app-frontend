// build-r3-head-geometry — D-148.
//
// The deterministic R3 head geometry chosen by the owner: G1V3 base geometry + the E2 ear-junction
// operation + the K4 contour, and the P2 head-edit regions that go with it. It builds; it never
// generates. There is no image call here, no model, no network, no claim.
//
// Inputs (all pinned by sha256):
//   1. G1V3 — tracked binary geometry mask (white = head, rows <= 424). It is the owner-adopted base
//      geometry (D-148). The tooling that produced it was local review tooling and is not part of the
//      repository, so G1V3 is a pinned INPUT, exactly like the D-133 head-protect mask E0 — it is
//      never re-derived or re-fitted here.
//   2. EDIT v1 / TRANSITION v1 — the D-133 region fixtures.
//   3. H1 — EXTERNAL (D-127 §2), passed by --h1, never copied into the repository. Only its alpha
//      channel is read, and only for P2 (the semi-transparent rim of the old head).
//
// Operations (the whole rule — no other parameter exists):
//   E2  G1V3 is mirror-symmetric about x = 511.5 and every row is ONE run, so the silhouette is its
//       left edge L(y); right edge = 1023 − L(y). Inside two fixed windows the edge is replaced by an
//       integer moving average of the ORIGINAL edge and mirrored:
//         L′(y) = floor( (Σ_{k=−4..4} L(y+k) + 4) / 9 )   for y in 289–306 and 376–385
//       Every other row is byte-identical to G1V3.
//   K4  For every geometry pixel in rows <= 424: d = Euclidean distance from the pixel centre to the
//       nearest non-geometry pixel centre within a 9×9 window; c = round(clamp(3 + 1 − d, 0, 1)·255).
//       The contour layer stores alpha = c and RGB = the line colour; it is composited over any RGB as
//       floor((c·line + (255 − c)·rgb + 127) / 255). Width 3 = Northstar's measured ear-outline run.
//   P2  EDIT₂ = EDIT₁ ∪ GEOM ∪ RIM,  RIM = { y <= 424 : ¬EDIT₁ ∧ ¬GEOM ∧ α(H1) > 0 }
//       TRANSITION₂ = TRANSITION₁ (unchanged) · CORE₂ = EDIT₂ \ TRANSITION₂ · PROTECT₂ = ¬EDIT₂
//
// Usage:
//   node tools/avatar/build-r3-head-geometry.mjs --h1 <path>            (write the fixtures)
//   node tools/avatar/build-r3-head-geometry.mjs --h1 <path> --check    (verify, write nothing)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { decodePng, encodePngRGBA } from "./build-r2-torso-occlusion-mask.mjs";
import {
  OUT_W, OUT_H, SOLID_ALPHA, H1_SHA256, MARKER as MARKER_V1, FIXTURE_DIR as REGIONS_V1_DIR, FILES as FILES_V1,
  pngToMask, maskToPng, countOf, bboxOf, componentCount, readIfExists, exitCodeFor,
} from "./build-r3-head-edit-masks.mjs";
import { composeGeometryCandidate, candidateGates } from "./recompose-r3-head-geometry.mjs";

export const TOOL = "build-r3-head-geometry";
export const TOOL_VERSION = "1.0.0";
export const DECISION = "D-148";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const N = OUT_W * OUT_H;
export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

export const FIXTURE_DIR = join("tools", "avatar", "fixtures", "r3-head-geometry");
export const FILES = Object.freeze({
  g1v3:     "r3-head-g1v3-v1.png",
  geometry: "r3-head-geometry-g1v3-e2-v1.png",
  contour:  "r3-head-contour-k4-v1.png",
  edit:     "r3-head-edit-v2.png",
  protect:  "r3-head-protect-v2.png",
  spec:     "r3-head-geometry-spec-v1.json",
});
export const G1V3_SHA256 = "b57c2f5db8aaf9a3d02b990fdcafe0213dedfbb038b3cb012f594c817d516c76";
export const EDIT_V1_SHA256 = "5e843a9a217966e80affdc2b8783cf8926941ff4ab6d62d1e424c795f4885156";
export const TRANSITION_V1_SHA256 = "8f7a6f4c703adc52adbf12d7ee9357d6c0fd85721f8e46ae92f5f508a7ddb9f3";
export const MARKER = Object.freeze({ geometry: [56, 189, 248], edit: MARKER_V1.edit, protect: MARKER_V1.protect });

export const HEAD_MAX_Y = 424;                         // geometry and K4 live in rows <= 424; row 425+ is H1
export const E2 = Object.freeze({ r: 4, windows: Object.freeze([[289, 306], [376, 385]]) });
/** Northstar line colour, measured and recorded in the G1V3 contour review (median of NS line pixels). */
export const K4 = Object.freeze({ width: 3, window: 4, line: Object.freeze([16, 10, 4]),
  rule: "coverage = clamp(3 + 1 − d, 0, 1), window 4; width from the measured Northstar ear-outline dark-run median (3 px)" });
export const CRANIUM_WIDTH_RECORDED = 298;             // G1 Bézier construction width (apexHW 149), recorded

/** Owner-approved / previously measured values. A mismatch is a hard stop, never a re-fit. */
export const EXPECT = Object.freeze({
  // G1V3 = head (rows <= 424, symmetric, one run per row) + exactly D-133's TRANSITION (rows 425–445)
  g1v3: { px: 67858, headPx: 66156, bandPx: 1702, headMaxY: 424, maxY: 445 },
  e2: { changedPx: 78, removed: 36, added: 42,
        changedRows: [291, 292, 293, 294, 295, 296, 300, 301, 302, 304, 305, 376, 377, 378, 379, 380, 381, 382, 383, 384],
        topJump: { d: 2, y: 295 }, bottomJump: { d: 3, y: 376 } },
  geometry: { crownY: 160, totalWidth: 342, protrusionB: 22, outermostEarPoint: [341, 325], asymmetryPx: 0, components: 1 },
  k4: { contourPx: 2935, contourPxOnG1V3: 2945 },
  lockedRows: Object.freeze([[309, 373], [390, 424]]),
});

// ── loading ──────────────────────────────────────────────────────────────────
function requirePng(buf, label) {
  const img = decodePng(buf, label);
  if (img.w !== OUT_W || img.h !== OUT_H) throw new Error(`${label}: expected ${OUT_W}x${OUT_H}, got ${img.w}x${img.h}`);
  return img;
}
function pinned(path, want, label) {
  if (!existsSync(path)) throw new Error(`${label} not found at ${path}`);
  const buf = readFileSync(path), got = sha256(buf);
  if (got !== want) throw new Error(`${label} sha256 ${got} != pinned ${want}`);
  return buf;
}
/** G1V3: opaque PNG, white (255,255,255) = geometry, black = outside. Strictly two colours. */
export function loadG1V3(repoRoot = REPO) {
  const buf = pinned(join(repoRoot, FIXTURE_DIR, FILES.g1v3), G1V3_SHA256, FILES.g1v3);
  const img = requirePng(buf, FILES.g1v3), set = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const r = img.rgba[i * 4], g = img.rgba[i * 4 + 1], b = img.rgba[i * 4 + 2];
    if (!((r === 255 && g === 255 && b === 255) || (r === 0 && g === 0 && b === 0))) throw new Error(`${FILES.g1v3}: pixel ${i} is neither white nor black`);
    set[i] = r === 255 ? 1 : 0;
  }
  return set;
}
export function loadRegionsV1(repoRoot = REPO) {
  const e = pinned(join(repoRoot, REGIONS_V1_DIR, FILES_V1.edit), EDIT_V1_SHA256, FILES_V1.edit);
  const t = pinned(join(repoRoot, REGIONS_V1_DIR, FILES_V1.transition), TRANSITION_V1_SHA256, FILES_V1.transition);
  return { EDIT: pngToMask(e, FILES_V1.edit, MARKER_V1.edit), TRANSITION: pngToMask(t, FILES_V1.transition, MARKER_V1.transition) };
}
export function loadH1(h1Path) {
  if (!h1Path) throw new Error("--h1 <path> is required: H1 is external (D-127 §2) and is never read from the repository");
  return requirePng(pinned(h1Path, H1_SHA256, "fitting-base.H1.png"), "fitting-base.H1.png").rgba;
}

// ── geometry ─────────────────────────────────────────────────────────────────
export function leftEdges(set) {
  const L = new Int32Array(HEAD_MAX_Y + 1).fill(-1);
  for (let y = 0; y <= HEAD_MAX_Y; y++) for (let x = 0; x < OUT_W; x++) if (set[y * OUT_W + x]) { L[y] = x; break; }
  return L;
}
export function symmetryAndRuns(set) {
  let asym = 0, multi = 0, maxY = -1;
  for (let y = 0; y < OUT_H; y++) { let runs = 0, prev = 0;
    for (let x = 0; x < OUT_W; x++) { const v = set[y * OUT_W + x]; if (v) maxY = y; if (v && !prev) runs++; prev = v; if (v !== set[y * OUT_W + OUT_W - 1 - x]) asym++; }
    if (runs > 1) multi++; }
  return { asymmetryPx: asym, multiRunRows: multi, maxY };
}
/** E2: the integer moving average of the ORIGINAL left edge inside the two windows, mirrored. */
export function applyE2(G1V3) {
  const L0 = leftEdges(G1V3), L = Int32Array.from(L0);
  for (const [a, b] of E2.windows) for (let y = a; y <= b; y++) {
    let s = 0; for (let k = -E2.r; k <= E2.r; k++) s += L0[y + k];
    L[y] = Math.floor((s + E2.r) / (2 * E2.r + 1));
  }
  const GEOM = new Uint8Array(G1V3);
  for (let y = 0; y <= HEAD_MAX_Y; y++) { if (L[y] === L0[y]) continue;
    for (let x = 0; x < OUT_W; x++) GEOM[y * OUT_W + x] = x >= L[y] && x <= OUT_W - 1 - L[y] ? 1 : 0; }
  return { GEOM, L0, L };
}
/**
 * K4 coverage per geometry pixel (rows <= 424), 0 where there is no contour. The distance is measured
 * to the nearest pixel outside the FULL silhouette — head geometry ∪ TRANSITION — exactly as the
 * recorded K4 rule did on the full G1V3 mask, so the head never gets a false contour along the
 * row-424/425 handover into H1's neck.
 */
export function k4Coverage(GEOM, TRANSITION) {
  const cov = new Uint8Array(N), inG = (x, y) => x >= 0 && x < OUT_W && y >= 0 && y < OUT_H && (GEOM[y * OUT_W + x] === 1 || TRANSITION[y * OUT_W + x] === 1);
  for (let p = 0; p < N; p++) {
    const y = (p / OUT_W) | 0; if (!GEOM[p] || y > HEAD_MAX_Y) continue;
    const x = p % OUT_W; let d = Infinity;
    for (let dy = -K4.window; dy <= K4.window; dy++) for (let dx = -K4.window; dx <= K4.window; dx++) if (!inG(x + dx, y + dy)) d = Math.min(d, Math.hypot(dx, dy));
    if (!isFinite(d)) continue;
    cov[p] = Math.round(Math.min(1, Math.max(0, K4.width + 1 - d)) * 255);
  }
  return cov;
}
export function geometryMetrics(GEOM, G1V3, L0, L) {
  let crownY = -1; for (let y = 0; y <= HEAD_MAX_Y && crownY < 0; y++) if (L[y] >= 0) crownY = y;
  let tot = { w: 0, y: -1 }; for (let y = 0; y <= HEAD_MAX_Y; y++) if (L[y] >= 0 && OUT_W - 2 * L[y] > tot.w) tot = { w: OUT_W - 2 * L[y], y };
  const jump = (a, b) => { let m = { d: 0, y: -1 }; for (let y = a; y <= b; y++) { const d = Math.abs(L[y] - L[y - 1]); if (d > m.d) m = { d, y }; } return m; };
  let removed = 0, added = 0; const rows = new Set(), lockedChanged = {};
  for (let p = 0; p < N; p++) if (GEOM[p] !== G1V3[p]) { if (G1V3[p]) removed++; else added++; const y = (p / OUT_W) | 0; rows.add(y);
    for (const [a, b] of EXPECT.lockedRows) if (y >= a && y <= b) lockedChanged[`${a}-${b}`] = (lockedChanged[`${a}-${b}`] || 0) + 1; }
  let maxEdgeChange = { d: 0, y: -1 }; for (let y = 0; y <= HEAD_MAX_Y; y++) { const d = L[y] - L0[y]; if (Math.abs(d) > Math.abs(maxEdgeChange.d)) maxEdgeChange = { d, y }; }
  const s = symmetryAndRuns(GEOM);
  return { crownY, totalWidth: tot.w, totalWidthRow: tot.y, protrusionB: (tot.w - CRANIUM_WIDTH_RECORDED) / 2,
    outermostEarPoint: [L[325], 325], changedPx: removed + added, removed, added, changedRows: [...rows].sort((a, b) => a - b),
    topJump: jump(285, 312), bottomJump: jump(368, 395), maxEdgeChange, lockedRowsChangedPx: lockedChanged,
    asymmetryPx: s.asymmetryPx, multiRunRows: s.multiRunRows, maxY: s.maxY, components: componentCount(GEOM), px: countOf(GEOM) };
}

// ── P2 regions ───────────────────────────────────────────────────────────────
export function buildRegionsV2(v1, GEOM, H1rgba) {
  const EDIT = new Uint8Array(v1.EDIT), RIM = new Uint8Array(N), GEOM_OUTSIDE_EDIT1 = new Uint8Array(N);
  let rimSolid = 0;
  for (let p = 0; p < N; p++) {
    const y = (p / OUT_W) | 0; if (y > HEAD_MAX_Y || v1.EDIT[p]) continue;
    if (GEOM[p]) { GEOM_OUTSIDE_EDIT1[p] = 1; EDIT[p] = 1; continue; }
    const a = H1rgba[p * 4 + 3];
    if (a > 0) { RIM[p] = 1; EDIT[p] = 1; if (a >= SOLID_ALPHA) rimSolid++; }
  }
  const PROTECT = new Uint8Array(N), CORE = new Uint8Array(N);
  for (let p = 0; p < N; p++) { PROTECT[p] = EDIT[p] ? 0 : 1; CORE[p] = EDIT[p] && !v1.TRANSITION[p] ? 1 : 0; }
  return { EDIT, PROTECT, CORE, TRANSITION: v1.TRANSITION, RIM, GEOM_OUTSIDE_EDIT1, rimSolid };
}
/** Where the moved rim pixels sit, and their alpha distribution — the evidence for P2. */
export function rimReport(RIM, H1rgba) {
  const zones = { "isse (y<294)": 0, "side (294–380)": 0, "kæbe (381–424)": 0 }, alpha = { "1–31": 0, "32–63": 0, "64–95": 0, "96–127": 0, "128+": 0 };
  let left = 0, right = 0;
  for (let p = 0; p < N; p++) { if (!RIM[p]) continue; const y = (p / OUT_W) | 0, x = p % OUT_W, a = H1rgba[p * 4 + 3];
    zones[y < 294 ? "isse (y<294)" : y <= 380 ? "side (294–380)" : "kæbe (381–424)"]++;
    alpha[a < 32 ? "1–31" : a < 64 ? "32–63" : a < 96 ? "64–95" : a < 128 ? "96–127" : "128+"]++;
    if (x < 512) left++; else right++; }
  return { px: countOf(RIM), bbox: bboxOf(RIM), components: componentCount(RIM), zones, alpha, left, right };
}

/**
 * The 1,716 vs 1,570 accounting (two DIFFERENT pixel sets, both named here precisely):
 *   SET_1716 = H1 alpha 1..127 ∧ PROTECT₁ (¬EDIT₁) ∧ rows 0–445   — the earlier diagnosis' count
 *   SET_1570 = RIM = rows ≤ 424 ∧ ¬EDIT₁ ∧ ¬GEOM ∧ H1 alpha > 0   — what P2 moves into EDIT
 * Every pixel only in SET_1716 must be (a) inside GEOM (covered, alpha 255 in the output) or (b) in rows
 * 425–445, preserved as H1 and 8-connected — through OUTPUT pixels with alpha > 0, rows 425–445 only — to
 * the preserved neck (TRANSITION), i.e. the neck's own antialiased edge. SET_1570 \ SET_1716 must be empty,
 * and no output pixel with alpha > 0 may sit outside GEOM in rows ≤ 424. Any violation is a hard stop.
 */
export function rimAccounting(v1, GEOM, RIM, H1rgba, outRgba) {
  const yOf = (p) => (p / OUT_W) | 0, a = (p) => H1rgba[p * 4 + 3];
  let s1716 = 0, s1570 = 0, only1570 = 0, inGeom = 0, neck = 0, neckConnected = 0, unexplained = 0, ghost = 0;
  for (let p = 0; p < N; p++) {
    const y = yOf(p), in1716 = y <= 445 && !v1.EDIT[p] && a(p) >= 1 && a(p) <= 127;
    if (in1716) s1716++; if (RIM[p]) s1570++; if (RIM[p] && !in1716) only1570++;
    if (y <= HEAD_MAX_Y && !GEOM[p] && outRgba[p * 4 + 3] > 0) ghost++;
    if (!in1716 || RIM[p]) continue;
    if (GEOM[p] && outRgba[p * 4 + 3] === 255) { inGeom++; continue; }
    if (y >= 425 && y <= 445 && outRgba[p * 4 + 3] === a(p)) {
      neck++;
      const seen = new Set([p]), q = [p]; let ok = false;
      while (q.length && !ok) { const c = q.shift(), cx = c % OUT_W, cy = yOf(c);
        for (let dy = -1; dy <= 1 && !ok; dy++) for (let dx = -1; dx <= 1; dx++) { const ny = cy + dy, n = ny * OUT_W + cx + dx;
          if (ny < 425 || ny > 445 || seen.has(n)) continue; if (v1.TRANSITION[n]) { ok = true; break; } if (outRgba[n * 4 + 3] > 0) { seen.add(n); q.push(n); } } }
      if (ok) neckConnected++; else unexplained++;
      continue;
    }
    unexplained++;
  }
  return { definitions: { set1716: "H1 alpha 1..127 ∧ PROTECT₁ (¬EDIT₁) ∧ rows 0–445", set1570: "RIM = rows ≤ 424 ∧ ¬EDIT₁ ∧ ¬GEOM ∧ H1 alpha > 0" },
    set1716: s1716, set1570: s1570, only1716: s1716 - (s1570 - only1570), only1570,
    only1716Classified: { insideGeometryCoveredAlpha255: inGeom, neckRows425to445PreservedAndConnectedToTransition: neckConnected, unexplained },
    ghostOutsideGeometryRowsLE424InOutput: ghost };
}

// ── fixtures ─────────────────────────────────────────────────────────────────
export function contourToPng(cov) {
  const rgba = Buffer.alloc(N * 4);
  for (let i = 0; i < N; i++) { if (!cov[i]) continue; rgba[i * 4] = K4.line[0]; rgba[i * 4 + 1] = K4.line[1]; rgba[i * 4 + 2] = K4.line[2]; rgba[i * 4 + 3] = cov[i]; }
  return encodePngRGBA(OUT_W, OUT_H, rgba);
}
export function pngToContour(buf) {
  const img = requirePng(buf, FILES.contour), cov = new Uint8Array(N);
  for (let i = 0; i < N; i++) { const a = img.rgba[i * 4 + 3]; if (!a) continue;
    if (img.rgba[i * 4] !== K4.line[0] || img.rgba[i * 4 + 1] !== K4.line[1] || img.rgba[i * 4 + 2] !== K4.line[2]) throw new Error(`${FILES.contour}: RGB is not the K4 line colour at ${i}`);
    cov[i] = a; }
  return cov;
}

/** Everything that does NOT need H1: geometry, contour, their metrics. Pure, deterministic. */
export function buildGeometry(repoRoot = REPO) {
  const G1V3full = loadG1V3(repoRoot);
  const v1 = loadRegionsV1(repoRoot);
  const fail = (m) => { throw new Error("R3 head geometry check FAILED: " + m); };
  if (countOf(G1V3full) !== EXPECT.g1v3.px) fail(`G1V3 px ${countOf(G1V3full)} != ${EXPECT.g1v3.px}`);
  // split: rows <= 424 = the head geometry; rows 425–445 must be EXACTLY D-133's TRANSITION; nothing below
  const G1V3 = new Uint8Array(N); let bandMismatch = 0, below = 0, band = 0;
  for (let p = 0; p < N; p++) { const y = (p / OUT_W) | 0;
    if (y <= HEAD_MAX_Y) G1V3[p] = G1V3full[p];
    else if (y <= 445) { if (G1V3full[p]) band++; if (G1V3full[p] !== v1.TRANSITION[p]) bandMismatch++; }
    else if (G1V3full[p]) below++; }
  if (bandMismatch || below || band !== EXPECT.g1v3.bandPx) fail(`G1V3 rows 425–445 are not exactly TRANSITION v1 (mismatch ${bandMismatch}, band ${band}, below ${below})`);
  const g = symmetryAndRuns(G1V3);
  if (countOf(G1V3) !== EXPECT.g1v3.headPx || g.asymmetryPx || g.multiRunRows || g.maxY !== EXPECT.g1v3.headMaxY) fail(`G1V3 head is not symmetric single-run rows <= 424: ${JSON.stringify({ px: countOf(G1V3), ...g })}`);
  const { GEOM, L0, L } = applyE2(G1V3);
  const cov = k4Coverage(GEOM, v1.TRANSITION);
  const m = geometryMetrics(GEOM, G1V3, L0, L);
  const eq = (label, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) fail(`${label} = ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`); };
  eq("E2 changed px", m.changedPx, EXPECT.e2.changedPx); eq("E2 removed", m.removed, EXPECT.e2.removed); eq("E2 added", m.added, EXPECT.e2.added);
  eq("E2 changed rows", m.changedRows, EXPECT.e2.changedRows); eq("top jump", m.topJump, EXPECT.e2.topJump); eq("bottom jump", m.bottomJump, EXPECT.e2.bottomJump);
  eq("crownY", m.crownY, EXPECT.geometry.crownY); eq("total width", m.totalWidth, EXPECT.geometry.totalWidth); eq("protrusionB", m.protrusionB, EXPECT.geometry.protrusionB);
  eq("outermost ear point", m.outermostEarPoint, EXPECT.geometry.outermostEarPoint); eq("asymmetry", m.asymmetryPx, 0); eq("components", m.components, 1);
  eq("locked rows changed", m.lockedRowsChangedPx, {}); eq("max y", m.maxY, HEAD_MAX_Y);
  const contourPx = countOf(cov); eq("K4 contour px", contourPx, EXPECT.k4.contourPx);
  // Why 2,945 (K4 on unchanged G1V3, = the hash-pinned A0) becomes 2,935 on E2: the contour is the band
  // within 3 px of the silhouette edge, so it can only change where E2 moved the edge. Proven: every pixel
  // whose coverage differs lies within K4.window (4) rows of a row E2 changed; everywhere else the two
  // contours are identical pixel-for-pixel.
  const cov0 = k4Coverage(G1V3, v1.TRANSITION);
  const changedRows = new Set(m.changedRows); let diffPx = 0, diffOutside = 0; const diffRows = new Set();
  for (let p = 0; p < N; p++) if (cov0[p] !== cov[p]) { diffPx++; const y = (p / OUT_W) | 0; diffRows.add(y);
    let near = false; for (let k = -K4.window; k <= K4.window; k++) if (changedRows.has(y + k)) near = true; if (!near) diffOutside++; }
  const k4Explanation = { onUnchangedG1V3: countOf(cov0), onE2: contourPx, delta: contourPx - countOf(cov0), coverageDifferingPx: diffPx,
    differingRows: [...diffRows].sort((a, b) => a - b), differingPxFurtherThan4RowsFromAnE2Row: diffOutside };
  eq("K4 on unchanged G1V3", k4Explanation.onUnchangedG1V3, EXPECT.k4.contourPxOnG1V3);
  eq("K4 differences outside E2's reach", diffOutside, 0);
  return { G1V3, GEOM, L0, L, cov, v1, metrics: { ...m, contourPx, k4Explanation, g1v3BandEqualsTransitionV1: true } };
}

export function buildArtifacts({ geo, v1, regions, rim, gates, candidateSha, h1Path }) {
  const png = {
    geometry: maskToPng(geo.GEOM, MARKER.geometry),
    contour: contourToPng(geo.cov),
    edit: maskToPng(regions.EDIT, MARKER.edit),
    protect: maskToPng(regions.PROTECT, MARKER.protect),
  };
  const f = (k) => ({ file: FILES[k], sha256: sha256(png[k]), bytes: png[k].length });
  const spec = {
    tool: TOOL, toolVersion: TOOL_VERSION, decision: DECISION,
    status: "OWNER-ADOPTED DETERMINISTIC R3 HEAD GEOMETRY — R3 STAYS A SHADOW STACK, DEFAULT OFF — NO IMAGE CALL AUTHORISED, NO CLAIM, NO RUNTIME ASSET",
    chosen: { baseGeometry: "G1V3", earContour: "E2", contour: "K4" },
    notChosen: { E0: "control (unchanged G1V3)", E1: "minimal smoothing — left a visible kink at the ear top", E3: "smoothest — longer, flatter jaw junction, nothing extra solved",
      E4: "E2 upper + E1 lower control — passed every gate, rejected: not unambiguously better at runtime and kept the larger lower jump (4 px vs 3 px)" },
    canvas: { width: OUT_W, height: OUT_H, origin: "top-left" }, bboxConvention: "inclusive-max",
    inputs: {
      g1v3: { path: [FIXTURE_DIR, FILES.g1v3].join("/").split("\\").join("/"), sha256: G1V3_SHA256, tracked: true, px: EXPECT.g1v3.px,
        provenance: "owner-adopted base geometry (D-148); produced by the local G1V3 review tooling (G1 cranium + V3 ears, 294–380); a pinned input, never re-derived here",
        layout: "rows <= 424 = head geometry (66,156 px, mirror-symmetric, one run per row); rows 425–445 = exactly D-133's TRANSITION (1,702 px, verified pixel-for-pixel); nothing below 445" },
      editV1: { path: [REGIONS_V1_DIR, FILES_V1.edit].join("/").split("\\").join("/"), sha256: EDIT_V1_SHA256, decision: "D-133" },
      transitionV1: { path: [REGIONS_V1_DIR, FILES_V1.transition].join("/").split("\\").join("/"), sha256: TRANSITION_V1_SHA256, decision: "D-133" },
      authoringBase: { filename: "fitting-base.H1.png", sha256: H1_SHA256, tracked: false,
        storage: "EXTERNAL — passed by --h1 and never copied into the repository (D-127 §2). Only its alpha channel is read (P2 rim) and the candidate composite stays local.",
        readFrom: h1Path ? "an explicit --h1 path supplied at build time" : null },
    },
    operations: {
      E2: { rule: "L′(y) = floor((Σ_{k=−r..r} L(y+k) + r) / (2r+1)) on the ORIGINAL left edge, mirrored about x = 511.5", r: E2.r, windows: E2.windows },
      K4: { rule: K4.rule, width: K4.width, window: K4.window, lineRGB: K4.line, rowsMax: HEAD_MAX_Y,
        compositing: "out = floor((c·line + (255 − c)·rgb + 127) / 255), c = contour alpha", lineSource: "median RGB of Northstar Master v2 line pixels (G1V3 contour review)" },
      P2: { EDIT: "EDIT₁ ∪ GEOM ∪ RIM", RIM: "{ y ≤ 424 : ¬EDIT₁ ∧ ¬GEOM ∧ α(H1) > 0 }", TRANSITION: "TRANSITION₁ (unchanged)", CORE: "EDIT₂ \\ TRANSITION₂", PROTECT: "complement(EDIT₂)" },
    },
    geometry: geo.metrics,
    regionsV2: { editPx: countOf(regions.EDIT), editV1Px: countOf(v1.EDIT), protectPx: countOf(regions.PROTECT), transitionPx: countOf(regions.TRANSITION),
      addedToEdit: { geometryOutsideEditV1: countOf(regions.GEOM_OUTSIDE_EDIT1), h1RimOutsideEditV1: rim.px, total: countOf(regions.GEOM_OUTSIDE_EDIT1) + rim.px },
      rim, rimSolidPx: regions.rimSolid, symmetry: "GEOM part is mirror-symmetric; the RIM part follows H1's own (asymmetric) hair silhouette" },
    candidate: { what: "G1V3 + E2 + K4 over a flat review stand-in skin, composited onto H1 with the P2 regions — LOCAL ONLY (contains H1 pixels), never tracked",
      skinStandIn: [254, 197, 128], sha256: candidateSha, gates },
    fixtures: { geometry: f("geometry"), contour: f("contour"), edit: f("edit"), protect: f("protect") },
    prohibitions: {
      noImageRequest: "D-148 authorises no image or API call and creates no claim. A later colour call needs a new, separate owner instruction, call-id and claim identity.",
      r3DefaultOff: "R3 remains a hidden shadow stack, default OFF. Nothing here is wired into runtime.",
      noRuntimePromotion: "These are authoring fixtures, not runtime assets. No R2 asset or runtime file is touched.",
      noRefit: "A deviation from the expected values is a hard stop. The geometry is never re-fitted to an output.",
    },
  };
  return { png, spec };
}

export const fixturePath = (k, repoRoot = REPO) => join(repoRoot, FIXTURE_DIR, FILES[k]);

export function run({ h1Path, check, repoRoot = REPO, log = console.log } = {}) {
  const geo = buildGeometry(repoRoot);
  const v1 = geo.v1;
  const H1 = loadH1(h1Path);
  const regions = buildRegionsV2(v1, geo.GEOM, H1);
  if (regions.rimSolid) throw new Error(`P2: ${regions.rimSolid} RIM pixel(s) are solid in H1 — the rim rule only expects semi-transparent pixels; refusing`);
  const rim = rimReport(regions.RIM, H1);
  const cand = composeGeometryCandidate({ h1Rgba: H1, geom: geo.GEOM, contour: geo.cov, regions, skin: [254, 197, 128], line: K4.line });
  const gates = candidateGates({ h1Rgba: H1, outRgba: cand, geom: geo.GEOM, regions, G1V3: geo.G1V3 });
  if (!gates.allPass) throw new Error("candidate gates FAILED: " + JSON.stringify(gates));
  const acct = rimAccounting(v1, geo.GEOM, regions.RIM, H1, cand);
  if (acct.only1570 || acct.ghostOutsideGeometryRowsLE424InOutput || acct.only1716Classified.unexplained)
    throw new Error("P2 rim accounting FAILED: " + JSON.stringify(acct));
  rim.accounting = acct;
  const { png, spec } = buildArtifacts({ geo, v1, regions, rim, gates, candidateSha: sha256(cand), h1Path });
  const specText = JSON.stringify(spec, null, 2) + "\n";
  const keys = ["geometry", "contour", "edit", "protect"];
  if (check) {
    const results = keys.map((k) => { const cur = readIfExists(fixturePath(k, repoRoot)); return { file: FILES[k], status: cur === null ? "missing" : Buffer.from(cur).equals(png[k]) ? "same" : "differs" }; });
    const curSpec = readIfExists(fixturePath("spec", repoRoot));
    results.push({ file: FILES.spec, status: curSpec === null ? "missing" : curSpec.toString("utf8") === specText ? "same" : "differs" });
    const ok = results.every((r) => r.status === "same");
    for (const r of results) log(`  ${r.status === "same" ? "✓" : "✖"} ${r.file} ${r.status}`);
    log(ok ? "check: PASS — nothing written" : "check: FAIL — nothing written");
    return { ok, results, spec, candidate: cand, geo, regions, written: false };
  }
  mkdirSync(join(repoRoot, FIXTURE_DIR), { recursive: true });
  for (const k of keys) writeFileSync(fixturePath(k, repoRoot), png[k]);
  writeFileSync(fixturePath("spec", repoRoot), specText);
  for (const k of keys) log(`  wrote ${FILES[k]}  sha256 ${spec.fixtures[k].sha256}`);
  log(`  wrote ${FILES.spec}`);
  return { ok: true, spec, candidate: cand, geo, regions, written: true };
}

function argOf(flag) { const i = process.argv.indexOf(flag); return i > 0 ? process.argv[i + 1] : null; }
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const result = run({ h1Path: argOf("--h1") || process.env.FITTING_BASE_V1_PATH, check: process.argv.includes("--check") });
    process.exitCode = exitCodeFor(result);
  } catch (err) {
    console.error("✖ " + err.message);
    process.exitCode = 1;
  }
}
