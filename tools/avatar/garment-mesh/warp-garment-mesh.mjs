// D-095 CLI — base-place the raw generation, auto-fit a mesh, warp, clip, and MEASURE.
// ---------------------------------------------------------------------------------------------
//   node tools/avatar/garment-mesh/warp-garment-mesh.mjs --autofit   # emit the tracked mesh JSON
//   node tools/avatar/garment-mesh/warp-garment-mesh.mjs             # warp + measure (writes to build/)
//
// Writes ONLY into tools/avatar/garment-mesh/meshes/ (tracked mesh) and the gitignored
// tools/avatar/build/garment-mesh/. It cannot touch assets/, js/ or the accepted artwork.
//
// No network. No image generation. No AI. The warp itself is mesh-core.mjs.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, sep } from "node:path";
import { decodePng, encodePngRGBA } from "../build-r2-torso-occlusion-mask.mjs";
import { OPAQUE, VISIBLE } from "../check-r2-torso-candidate.mjs";
import { warp, applyConstraints, assertValidMesh, distortionMetrics, SCHEMA_VERSION } from "./mesh-core.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");
const FIX = join(REPO, "tools", "avatar", "fixtures", "r2-torso");
const MESH_DIR = join(HERE, "meshes");
const BUILD = join(REPO, "tools", "avatar", "build", "garment-mesh");
const RAW = join(REPO, "tools", "avatar", "build", "ai-input", "torso-armor-knight-raw.png");
const NOBACKFILL = join(REPO, "tools", "avatar", "build", "ai-input", "torso-armor-knight-candidate-nobackfill.png");
const MESH_PATH = join(MESH_DIR, "torso-armor-knight-v1.mesh.json");

export const RAW_EXPECT_SHA = "83fcff0c543150cd8c1c0e0b2abfb22c66584407dce98067da6354815de1c87e";
export const W = 1024, H = 1536;

const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const ALLOWED = [MESH_DIR, BUILD];
export function assertWritable(p) {
  const abs = resolve(p);
  if (!ALLOWED.some((r) => abs === resolve(r) || abs.startsWith(resolve(r) + sep))) {
    throw new Error("refusing to write outside meshes/ and build/garment-mesh/: " + abs);
  }
  const low = abs.toLowerCase();
  for (const bad of ["\\js\\", "/js/", "assets", ".claude", "_avatar-artefakter"]) {
    if (low.includes(bad)) throw new Error("refusing to write a protected path: " + abs);
  }
  return abs;
}
const write = (p, buf) => { const a = assertWritable(p); mkdirSync(dirname(a), { recursive: true }); writeFileSync(a, buf); return a; };

// ── geometry helpers ──────────────────────────────────────────────────────────────────────────
export function bbox(rgba, w, h, thr) {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (rgba[(y * w + x) * 4 + 3] >= thr) { n++; if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  }
  return { x0, y0, x1, y1, n, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
export function rowSpan(rgba, w, y, thr) {
  let lo = -1, hi = -1;
  for (let x = 0; x < w; x++) if (rgba[(y * w + x) * 4 + 3] >= thr) { if (lo < 0) lo = x; hi = x; }
  return [lo, hi];
}
// Masks are ONE byte per pixel, not RGBA. Separate helpers, because reusing the RGBA ones indexes
// four times too far and silently returns nonsense geometry (it did, on the first run).
export function maskBbox(mask, w, h) {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (mask[y * w + x]) { n++; if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  }
  return { x0, y0, x1, y1, n, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
export function maskRowSpan(mask, w, y) {
  let lo = -1, hi = -1;
  for (let x = 0; x < w; x++) if (mask[y * w + x]) { if (lo < 0) lo = x; hi = x; }
  return [lo, hi];
}

// Deterministic base placement: uniform COVER scale of the raw bbox onto the hard bbox, centred.
// No overscan — overscan was the blunt instrument the mesh is meant to replace.
export function basePlacement(rawRgba, hardMask) {
  const rb = bbox(rawRgba, W, H, 24);
  const hb = maskBbox(hardMask, W, H);
  const scale = Math.max(hb.w / rb.w, hb.h / rb.h);
  const srcCx = (rb.x0 + rb.x1 + 1) / 2, srcCy = (rb.y0 + rb.y1 + 1) / 2;
  const dstCx = (hb.x0 + hb.x1 + 1) / 2, dstCy = (hb.y0 + hb.y1 + 1) / 2;
  const out = Buffer.alloc(W * H * 4);
  // Inverse map: for each destination pixel, read the source. Same premultiplied bilinear rule
  // as the warp, so placement and warp cannot disagree about edge colour.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx = (x + 0.5 - dstCx) / scale + srcCx - 0.5;
    const sy = (y + 0.5 - dstCy) / scale + srcCy - 0.5;
    sampleInto(rawRgba, W, H, sx, sy, out, (y * W + x) * 4);
  }
  return { rgba: out, scale, rawBbox: rb, hardBbox: hb };
}
function sampleInto(src, w, h, fx, fy, out, o) {
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  let r = 0, g = 0, b = 0, a = 0;
  for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
    const wgt = (dx ? tx : 1 - tx) * (dy ? ty : 1 - ty);
    if (wgt === 0) continue;
    const xx = x0 + dx, yy = y0 + dy;
    if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
    const si = (yy * w + xx) * 4, sa = src[si + 3];
    r += src[si] * sa * wgt; g += src[si + 1] * sa * wgt; b += src[si + 2] * sa * wgt; a += sa * wgt;
  }
  if (a <= 0) { out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0; return; }
  out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(b / a); out[o + 3] = Math.round(a);
}

// ── the mesh topology: 9 motif rows x 5 columns = 45 vertices, 64 triangles ────────────────────
// Rows follow the GARMENT's own landmarks (measured, not guessed): collar top, shoulder line,
// chest top, widest shoulder, sleeve end, belt top, belt bottom, skirt mid, hem.
// Columns give a left/right symmetry pair at two depths plus a centre column for the ridge.
export const ROWS = [
  { id: "collar",   y: 524, pinned: true },
  { id: "shoulder", y: 560 },
  { id: "chest",    y: 640 },
  { id: "widest",   y: 680 },
  { id: "sleeve",   y: 714 },
  { id: "belttop",  y: 756, horizontal: true },
  { id: "beltbot",  y: 786, horizontal: true },
  { id: "skirt",    y: 850 },
  { id: "hem",      y: 903 },
];
// APPROACH 2 — distribute the stretch instead of bounding it.
//
// The first auto-fit had ONE interior column per side, so the entire 75 px outward pull at the
// `widest` row was carried by a single span: the outermost triangle stretched enormously while
// everything inboard of it stayed put, which is precisely what turned the shoulder caps into
// pointed cape-like flares. Coverage rewarded the deformation the eye rejects.
//
// Adding interior columns does not change WHERE the boundary lands — it changes how the material
// between centre and boundary is redistributed. Each interior column moves outward in proportion
// to its own distance from the centre, so the sleeve's shading and plate edges travel with the
// silhouette rather than being left behind by it.
//
// FRACTIONS are of the half-width, centre → boundary. Denser near the outside, because that is
// where the stretch is largest and where the flare formed.
export const COL_FRACTIONS = [0, 0.35, 0.6, 0.8, 1.0];
export const COLS = [
  "l-out", "l-o2", "l-mid", "l-in", "mid", "r-in", "r-mid", "r-o2", "r-out",
];
const vid = (row, col) => `${row}-${col}`;
// Signed offsets: negative = left of centre, in the same fraction order mirrored.
const COL_SIGNED = [
  ...COL_FRACTIONS.slice().reverse().map((f) => -f),   // -1.0 … 0
  ...COL_FRACTIONS.slice(1),                            // 0.35 … 1.0
];

export function buildMesh(placedRgba, hardMask) {
  const vertices = [], triangles = [];
  const centreX = W / 2;

  for (const row of ROWS) {
    const [al, ah] = rowSpan(placedRgba, W, row.y, 24);      // where the artwork is
    const [hl, hh] = maskRowSpan(hardMask, W, row.y);         // where it must reach
    // Fall back to the artwork span when the mask has no run on this row (the hem corridor is
    // narrower than the garment), so the mesh never invents geometry outside the drawing.
    const tl = hl >= 0 ? hl : al, th = hh >= 0 ? hh : ah;
    const sl = al >= 0 ? al : tl, sh2 = ah >= 0 ? ah : th;
    const sHalfL = centreX - sl, sHalfR = sh2 - centreX;
    const tHalfL = centreX - tl, tHalfR = th - centreX;
    COLS.forEach((col, i) => {
      const f = COL_SIGNED[i];
      const sx = f < 0 ? centreX + f * sHalfL : centreX + f * sHalfR;
      const tx = f < 0 ? centreX + f * tHalfL : centreX + f * tHalfR;
      const isBoundary = Math.abs(f) === 1;
      const isCentre = f === 0;
      vertices.push({
        id: vid(row.id, col),
        source: [round2(sx), row.y],
        target: [round2(tx), row.y],
        role: isBoundary ? "boundary" : (isCentre ? "feature" : "interior"),
        lockedX: isCentre,         // the centre column never moves sideways → ridge stays straight
        lockedY: !!row.horizontal, // belt edges never move vertically → belt stays horizontal
      });
    });
  }

  for (let r = 0; r < ROWS.length - 1; r++) {
    for (let c = 0; c < COLS.length - 1; c++) {
      const a = vid(ROWS[r].id, COLS[c]), b = vid(ROWS[r].id, COLS[c + 1]);
      const d = vid(ROWS[r + 1].id, COLS[c]), e = vid(ROWS[r + 1].id, COLS[c + 1]);
      triangles.push([a, b, e], [a, e, d]);
    }
  }

  const mesh = {
    version: SCHEMA_VERSION,
    generatedBy: "warp-garment-mesh.mjs --autofit",
    note: "Auto-fit SUGGESTS targets from the hard-mask contour. It never approves a result.",
    canvas: { width: W, height: H },
    vertices,
    triangles,
    constraints: {
      symmetryPairs: ROWS.flatMap((r) => [["l-out","r-out"],["l-o2","r-o2"],["l-mid","r-mid"],["l-in","r-in"]].map(([a,b]) => [vid(r.id,a), vid(r.id,b)])),
      horizontalGroups: ROWS.filter((r) => r.horizontal).map((r) => COLS.map((c) => vid(r.id, c))),
      verticalGroups: [ROWS.map((r) => vid(r.id, "mid"))],
      pinnedVertices: ROWS.filter((r) => r.pinned).flatMap((r) => COLS.map((c) => vid(r.id, c))),
    },
  };
  applyConstraints(mesh);
  return mesh;
}
const round2 = (v) => Math.round(v * 100) / 100;

// ── masks ─────────────────────────────────────────────────────────────────────────────────────
function loadMask(file) {
  const img = decodePng(readFileSync(join(FIX, file)), file);
  const m = new Uint8Array(img.w * img.h);
  for (let i = 0; i < m.length; i++) m[i] = img.rgba[i * 4 + 3] > 0 ? 1 : 0;
  return m;
}
function maskToRgba(mask) {
  const b = Buffer.alloc(W * H * 4);
  for (let i = 0; i < mask.length; i++) if (mask[i]) { b[i * 4] = 255; b[i * 4 + 1] = 255; b[i * 4 + 2] = 255; b[i * 4 + 3] = 255; }
  return b;
}

export function clipToEdit(rgba, edit) {
  const out = Buffer.from(rgba);
  for (let i = 0; i < W * H; i++) if (!edit[i]) { out[i * 4] = 0; out[i * 4 + 1] = 0; out[i * 4 + 2] = 0; out[i * 4 + 3] = 0; }
  return out;
}

// ── measurement ───────────────────────────────────────────────────────────────────────────────
export function measure(rgba, masks, label) {
  let hardTotal = 0, hardGap = 0, stray = 0, onProtect = 0, visible = 0, orphanSoft = 0;
  for (let i = 0; i < W * H; i++) {
    const a = rgba[i * 4 + 3];
    if (a >= VISIBLE) { visible++; if (!masks.edit[i]) stray++; if (masks.protect[i]) onProtect++; }
    if (masks.hard[i]) { hardTotal++; if (a < OPAQUE) hardGap++; }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, a = rgba[i * 4 + 3];
    if (a === 0 || a >= OPAQUE) continue;
    let near = false;
    for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      if (rgba[(yy * W + xx) * 4 + 3] >= OPAQUE) { near = true; break; }
    }
    if (!near) orphanSoft++;
  }
  const comps = components(rgba);
  return {
    label,
    hardTotal, hardCovered: hardTotal - hardGap, hardGap,
    coverage: hardTotal ? +((hardTotal - hardGap) / hardTotal).toFixed(6) : 0,
    backfillNeeded: hardGap,
    inkOutsideEdit: stray, inkOnProtect: onProtect,
    visiblePx: visible, orphanSoftPx: orphanSoft,
    components: comps.length, largestComponent: comps[0] ?? 0,
    specks: comps.filter((c) => c < 64).length,
    bbox: bbox(rgba, W, H, VISIBLE),
  };
}
function components(rgba) {
  const on = new Uint8Array(W * H);
  for (let i = 0; i < on.length; i++) on[i] = rgba[i * 4 + 3] >= OPAQUE ? 1 : 0;
  const seen = new Uint8Array(on.length), sizes = [];
  const N = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (let s = 0; s < on.length; s++) {
    if (!on[s] || seen[s]) continue;
    const q = [s]; seen[s] = 1;
    for (let k = 0; k < q.length; k++) {
      const j = q[k], y = (j / W) | 0, x = j % W;
      for (const [dx, dy] of N) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const t = yy * W + xx;
        if (on[t] && !seen[t]) { seen[t] = 1; q.push(t); }
      }
    }
    sizes.push(q.length);
  }
  return sizes.sort((a, b) => b - a);
}

// ── main ──────────────────────────────────────────────────────────────────────────────────────
function main() {
  const args = process.argv.slice(2);
  const autofit = args.includes("--autofit");
  mkdirSync(BUILD, { recursive: true });

  if (!existsSync(RAW)) throw new Error("raw generation missing: " + RAW + "\n  restore it from the D-088 backup (read-only).");
  const rawBuf = readFileSync(RAW);
  const rawSha = sha256(rawBuf);
  if (rawSha !== RAW_EXPECT_SHA) throw new Error(`raw sha ${rawSha.slice(0, 16)}… != pinned ${RAW_EXPECT_SHA.slice(0, 16)}…`);
  const raw = decodePng(rawBuf, "raw");

  const masks = { hard: loadMask("torso-occlusion-hard-v1.png"), edit: loadMask("torso-edit-allowed-v1.png"), protect: loadMask("torso-protect-v1.png") };
  const placed = basePlacement(raw.rgba, masks.hard);
  console.log(`base placement: cover scale ${placed.scale.toFixed(4)} (no overscan)`);
  write(join(BUILD, "01-base-placed.png"), encodePngRGBA(W, H, placed.rgba));

  let mesh;
  if (autofit || !existsSync(MESH_PATH)) {
    mesh = buildMesh(placed.rgba, masks.hard);
    mkdirSync(MESH_DIR, { recursive: true });
    write(MESH_PATH, Buffer.from(JSON.stringify(mesh, null, 2) + "\n", "utf8"));
    console.log(`auto-fit mesh written: ${mesh.vertices.length} vertices, ${mesh.triangles.length} triangles`);
  } else {
    mesh = JSON.parse(readFileSync(MESH_PATH, "utf8"));
    console.log(`mesh loaded from ${MESH_PATH.replace(REPO + sep, "")}`);
  }
  assertValidMesh(mesh, { canvasWidth: W, canvasHeight: H });

  const warped = warp(mesh, placed.rgba, W, H);
  write(join(BUILD, "02-warped.png"), encodePngRGBA(W, H, warped.rgba));
  const clipped = clipToEdit(warped.rgba, masks.edit);
  write(join(BUILD, "03-warped-clipped.png"), encodePngRGBA(W, H, clipped));

  // Variant B: the OLD method on the same base placement — uniform fit + clip, no mesh, no backfill.
  const oldClipped = clipToEdit(placed.rgba, masks.edit);
  write(join(BUILD, "04-oldfit-clipped.png"), encodePngRGBA(W, H, oldClipped));

  const dist = distortionMetrics(mesh);
  const report = {
    tool: TOOLNAME, decision: "D-095",
    source: { path: "tools/avatar/build/ai-input/torso-armor-knight-raw.png", sha256: rawSha },
    basePlacement: { scale: +placed.scale.toFixed(6), overscan: 1.0 },
    mesh: { vertices: mesh.vertices.length, triangles: mesh.triangles.length, path: "tools/avatar/garment-mesh/meshes/torso-armor-knight-v1.mesh.json" },
    variants: {
      B_oldfit_noBackfill: measure(oldClipped, masks, "old uniform fit + clip, no backfill"),
      C_mesh_noBackfill: measure(clipped, masks, "mesh warp + clip, no backfill"),
    },
    distortion: {
      foldovers: dist.foldovers, areaRatio: dist.areaRatio,
      maxLongestEdgeRatio: dist.maxLongestEdgeRatio, maxAbsRotationDeg: dist.maxAbsRotationDeg,
      worstTriangles: dist.worstTriangles,
    },
    warpedPixels: warped.writtenPixels,
  };
  write(join(BUILD, "report.json"), Buffer.from(JSON.stringify(report, null, 2) + "\n", "utf8"));

  const b = report.variants.B_oldfit_noBackfill, c = report.variants.C_mesh_noBackfill;
  console.log("\n                       old fit        mesh");
  console.log(`hard coverage      ${(b.coverage * 100).toFixed(2).padStart(10)}%${(c.coverage * 100).toFixed(2).padStart(11)}%`);
  console.log(`missing hard px    ${String(b.hardGap).padStart(10)} ${String(c.hardGap).padStart(11)}`);
  console.log(`ink outside edit   ${String(b.inkOutsideEdit).padStart(10)} ${String(c.inkOutsideEdit).padStart(11)}`);
  console.log(`ink on protect     ${String(b.inkOnProtect).padStart(10)} ${String(c.inkOnProtect).padStart(11)}`);
  console.log(`components         ${String(b.components).padStart(10)} ${String(c.components).padStart(11)}`);
  console.log(`\nfoldovers ${dist.foldovers} · area-ratio median ${dist.areaRatio.median} p95 ${dist.areaRatio.p95} max ${dist.areaRatio.max}`);
  console.log(`accepted asset needed 8608 backfill px; mesh would need ${c.hardGap}`);
}
const TOOLNAME = "warp-garment-mesh";
const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  try { main(); } catch (e) { console.error("✖ " + e.message); process.exit(1); }
}
