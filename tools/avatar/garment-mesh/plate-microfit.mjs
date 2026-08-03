// D-097 — strictly local shoulder-plate MICRO-FIT.
// ---------------------------------------------------------------------------------------------
// The previous iteration left 5 exposed fabric-top columns per side and I concluded the plate would
// need redrawing. Measuring the CURRENT geometry rather than the old one shows that was wrong:
//
//   v1's plate has NO pixels at all in x 335–339 (left) / 686–690 (right) — its outer edge is
//   x 340 / 685 — and the mandatory mask needs material from x 328 / to 697. The shortfall is
//   5–6 px per side, not the 20+ I claimed.
//
// WHY THE EARLIER 10 px MESH DID NOT CLOSE IT. That mesh put its outer vertex column on the PADDED
// bounding box, 24 px outside the plate's silhouette. Moving that vertex stretched empty canvas;
// the plate's own edge barely shifted. Here the outer vertex column sits ON the plate's outer edge,
// so the deformation acts on the artwork itself.
//
// Everything else is pinned: the inner edge against the breastplate, the collar side, the lower
// inner edge, and every vertex more than ~20 px inboard of the outer silhouette. Only existing v1
// plate pixels are warped — outline, base tone, highlight and shadow travel together, so it stays
// recognisably the same plate. No generation, no fill, no nearest-neighbour.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, sep } from "node:path";
import { decodePng, encodePngRGBA } from "../build-r2-torso-occlusion-mask.mjs";
import { OPAQUE, VISIBLE, BANDS } from "../check-r2-torso-candidate.mjs";
import { geometry, plateSeam, W, H } from "./sleeve-donor-challenger.mjs";
import { warp, distortionMetrics, SCHEMA_VERSION } from "./mesh-core.mjs";
import { sleeveFabric, shoulderPlates, CUFF_Y } from "./fabric-plate-fit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");
const AI = join(REPO, "tools", "avatar", "build", "ai-input");
const FIX = join(REPO, "tools", "avatar", "fixtures", "r2-torso");
const BUILD = join(REPO, "tools", "avatar", "build", "plate-microfit");
const OUT = process.env.D097_MICROFIT_OUT || "C:\\Users\\Bruger\\Documents\\DEN SEJE APP\\_avatar-artefakter\\D097-fabric-underlayer-microfit-review";
const DWEBP = join(REPO, "tools", "avatar", "vendor", "dwebp.exe");
const BASE_WEBP = join(REPO, "assets", "avatar-r2", "base", "body-neutral-medium-v2.webp");
const SIZES = [[180, 270], [112, 168], [72, 108], [52, 78]];
const FABRIC = [84, 86, 88];
export const OUTWARD = 8, DOWNWARD = 8;      // inside the owner's 6–10 / 4–8 budget
export const PIN_DEPTH = 20;                 // px inboard of the outer silhouette that may move

const sha256 = (b) => createHash("sha256").update(b).digest("hex");
function assertWritable(p) {
  const abs = resolve(p);
  if (![BUILD, OUT].some((r) => abs === resolve(r) || abs.startsWith(resolve(r) + sep))) throw new Error("outside build/review: " + abs);
  if (/[\\/]assets[\\/]|[\\/]js[\\/]|\.claude/i.test(abs)) throw new Error("protected: " + abs);
  return abs;
}
const write = (p, b) => { const a = assertWritable(p); mkdirSync(dirname(a), { recursive: true }); writeFileSync(a, b); return a; };
const load = (n) => { const b = readFileSync(join(AI, n)); return { ...decodePng(b, n), sha256: sha256(b) }; };
function loadMask(n) {
  const img = decodePng(readFileSync(join(FIX, n)), n);
  const m = new Uint8Array(img.w * img.h);
  for (let i = 0; i < m.length; i++) m[i] = img.rgba[i * 4 + 3] > 0 ? 1 : 0;
  return m;
}
function comps(mask) {
  const seen = new Uint8Array(W * H), out = [];
  const N = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (let s = 0; s < W * H; s++) {
    if (!mask[s] || seen[s]) continue;
    const q = [s]; seen[s] = 1;
    for (let k = 0; k < q.length; k++) {
      const j = q[k], y = (j / W) | 0, x = j % W;
      for (const [dx, dy] of N) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const t = yy * W + xx;
        if (mask[t] && !seen[t]) { seen[t] = 1; q.push(t); }
      }
    }
    out.push(q);
  }
  return out.sort((a, b) => b.length - a.length);
}

// ── the micro-fit ─────────────────────────────────────────────────────────────────────────────
export function microFit(plateMask, v1, side) {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let i = 0; i < W * H; i++) if (plateMask[i]) { const x = i % W, y = (i / W) | 0; if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  if (x1 < 0) return null;

  // Vertex columns are placed on the PLATE, not on a padded box: the outer column sits exactly on
  // the plate's outer silhouette so the deformation moves artwork rather than empty canvas.
  // Only the outer column may move; everything from PIN_DEPTH inboard is pinned.
  const outerX = side === "left" ? x0 : x1;
  const dirOut = side === "left" ? -1 : 1;
  const colXs = side === "left"
    ? [x0, x0 + PIN_DEPTH, x0 + (x1 - x0) * 0.6, x1]
    : [x1, x1 - PIN_DEPTH, x1 - (x1 - x0) * 0.6, x0];
  const rowYs = [y0, y0 + (y1 - y0) * 0.33, y0 + (y1 - y0) * 0.66, y1];

  const vertices = [], triangles = [];
  const vid = (r, c) => `m${r}_${c}`;
  const moves = [];
  for (let r = 0; r < rowYs.length; r++) {
    for (let c = 0; c < colXs.length; c++) {
      const sx = colXs[c], sy = rowYs[r];
      // Move only the outer column, and only on the middle rows: the top row holds the shoulder
      // line and the bottom row holds the plate's lower edge, so it cannot become a pointed flare.
      const movable = c === 0 && (r === 1 || r === 2);
      const dx = movable ? dirOut * OUTWARD : 0;
      const dy = movable ? DOWNWARD : 0;
      vertices.push({
        id: vid(r, c), source: [sx, sy], target: [sx + dx, sy + dy],
        role: c === 0 ? "boundary" : "interior",
        lockedX: c >= 1, lockedY: c >= 1 || r === 0 || r === rowYs.length - 1,
      });
      if (dx || dy) moves.push(Math.hypot(dx, dy));
    }
  }
  for (let r = 0; r < rowYs.length - 1; r++) for (let c = 0; c < colXs.length - 1; c++) {
    triangles.push([vid(r, c), vid(r, c + 1), vid(r + 1, c + 1)], [vid(r, c), vid(r + 1, c + 1), vid(r + 1, c)]);
  }
  const mesh = {
    version: SCHEMA_VERSION, canvas: { width: W, height: H }, vertices, triangles,
    constraints: { pinnedVertices: vertices.filter((v) => v.lockedX && v.lockedY).map((v) => v.id) },
  };
  const iso = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) if (plateMask[i]) for (let c = 0; c < 4; c++) iso[i * 4 + c] = v1.rgba[i * 4 + c];
  const w = warp(mesh, iso, W, H);
  const met = distortionMetrics(mesh);
  let changed = 0;
  for (let i = 0; i < W * H; i++) { for (let c = 0; c < 4; c++) if (w.rgba[i * 4 + c] !== iso[i * 4 + c]) { changed++; break; } }
  moves.sort((a, b) => a - b);
  return {
    rgba: w.rgba, mesh, metrics: met, bbox: { x0, y0, x1, y1 }, changedPx: changed,
    vertexMove: { max: moves.length ? +moves[moves.length - 1].toFixed(2) : 0, median: moves.length ? +moves[moves.length >> 1].toFixed(2) : 0, moved: moves.length },
  };
}

// ── imaging (shared shapes with the previous tools) ───────────────────────────────────────────
function flatten(rgba, w, h, bg = [250, 250, 250]) {
  const o = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { const a = rgba[i * 4 + 3] / 255; for (let c = 0; c < 3; c++) o[i * 4 + c] = Math.round(rgba[i * 4 + c] * a + bg[c] * (1 - a)); o[i * 4 + 3] = 255; }
  return o;
}
function down(rgba, sw, sh, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    const y0 = Math.floor(y * sh / dh), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sh / dh));
    for (let x = 0; x < dw; x++) {
      const x0 = Math.floor(x * sw / dw), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sw / dw));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const si = (yy * sw + xx) * 4, sa = rgba[si + 3]; r += rgba[si] * sa; g += rgba[si + 1] * sa; b += rgba[si + 2] * sa; a += sa; n++; }
      const di = (y * dw + x) * 4;
      if (a <= 0) { out[di + 3] = 0; continue; }
      out[di] = Math.round(r / a); out[di + 1] = Math.round(g / a); out[di + 2] = Math.round(b / a); out[di + 3] = Math.round(a / n);
    }
  }
  return out;
}
function strip(panels, gap = 12, bg = [26, 28, 36]) {
  const w = panels.reduce((s, p) => s + p.w + gap, gap), h = Math.max(...panels.map((p) => p.h)) + gap * 2;
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { out[i * 4] = bg[0]; out[i * 4 + 1] = bg[1]; out[i * 4 + 2] = bg[2]; out[i * 4 + 3] = 255; }
  let x0 = gap;
  for (const p of panels) {
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      const si = (y * p.w + x) * 4, di = ((y + gap) * w + x0 + x) * 4, a = p.rgba[si + 3] / 255;
      for (let c = 0; c < 3; c++) out[di + c] = Math.round(p.rgba[si + c] * a + out[di + c] * (1 - a));
      out[di + 3] = 255;
    }
    x0 += p.w + gap;
  }
  return { w, h, rgba: out };
}
function crop(src, x0, y0, cw, ch, z) {
  const w = cw * z, h = ch * z, out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = x0 + ((x / z) | 0), sy = y0 + ((y / z) | 0), di = (y * w + x) * 4;
    if (sx < 0 || sy < 0 || sx >= W || sy >= H) { out[di + 3] = 255; continue; }
    const si = (sy * W + sx) * 4;
    for (let c = 0; c < 4; c++) out[di + c] = src[si + c];
  }
  return { w, h, rgba: out };
}
function decodeBase() {
  if (!existsSync(DWEBP)) return null;
  mkdirSync(BUILD, { recursive: true });
  const o = join(BUILD, "_base.png");
  return spawnSync(DWEBP, [BASE_WEBP, "-o", assertWritable(o)], { encoding: "utf8" }).status === 0 ? decodePng(readFileSync(o), "base") : null;
}
function onBase(base, cand) {
  const s = down(cand, W, H, 512, 768), b = Buffer.from(base.rgba);
  for (let i = 0; i < 512 * 768; i++) { const a = s[i * 4 + 3] / 255; if (a === 0) continue; for (let c = 0; c < 3; c++) b[i * 4 + c] = Math.round(s[i * 4 + c] * a + b[i * 4 + c] * (1 - a)); b[i * 4 + 3] = Math.max(b[i * 4 + 3], s[i * 4 + 3]); }
  return b;
}
const overPx = (out, src, i) => {
  const a = src[i * 4 + 3];
  if (a < VISIBLE) return;
  if (a >= OPAQUE || out[i * 4 + 3] === 0) { for (let c = 0; c < 4; c++) out[i * 4 + c] = src[i * 4 + c]; return; }
  const al = a / 255;
  for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.round(src[i * 4 + c] * al + out[i * 4 + c] * (1 - al));
  out[i * 4 + 3] = Math.max(out[i * 4 + 3], a);
};

function main() {
  mkdirSync(BUILD, { recursive: true }); mkdirSync(OUT, { recursive: true });
  const v1 = load("torso-armor-knight-candidate-nobackfill.png");
  const masks = { hard: loadMask("torso-occlusion-hard-v1.png"), edit: loadMask("torso-edit-allowed-v1.png"), protect: loadMask("torso-protect-v1.png") };
  const geo = geometry(v1);
  const seamL = plateSeam(v1, geo, "left"), seamR = plateSeam(v1, geo, "right");
  const plates = shoulderPlates(v1, geo, seamL, seamR);
  const fitL = microFit(plates.left, v1, "left");
  const fitR = microFit(plates.right, v1, "right");

  const cover = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) cover[i] = (v1.rgba[i * 4 + 3] >= OPAQUE || fitL.rgba[i * 4 + 3] >= OPAQUE || fitR.rgba[i * 4 + 3] >= OPAQUE) ? 1 : 0;
  const sleeve = sleeveFabric(masks.hard, geo, seamL, seamR, cover);

  const build = (useFit) => {
    const out = Buffer.alloc(W * H * 4);
    for (let i = 0; i < W * H; i++) if (sleeve.fabric[i]) { out[i * 4] = FABRIC[0]; out[i * 4 + 1] = FABRIC[1]; out[i * 4 + 2] = FABRIC[2]; out[i * 4 + 3] = 255; }
    if (useFit) for (let i = 0; i < W * H; i++) { overPx(out, fitL.rgba, i); overPx(out, fitR.rgba, i); }
    for (let i = 0; i < W * H; i++) overPx(out, v1.rgba, i);
    for (let i = 0; i < W * H; i++) if (!masks.edit[i]) { out[i * 4] = 0; out[i * 4 + 1] = 0; out[i * 4 + 2] = 0; out[i * 4 + 3] = 0; }
    return out;
  };
  const before = build(false), after = build(true);

  const measureOn = (img) => {
    const visFab = new Uint8Array(W * H);
    let fabPx = 0, fabL = 0, fabR = 0;
    for (let i = 0; i < W * H; i++) {
      if (!sleeve.fabric[i] || !masks.edit[i] || v1.rgba[i * 4 + 3] >= OPAQUE) continue;
      if (fitL.rgba[i * 4 + 3] >= OPAQUE || fitR.rgba[i * 4 + 3] >= OPAQUE) continue;
      visFab[i] = 1; fabPx++; ((i % W) < 512) ? fabL++ : fabR++;
    }
    // EXPOSED means a TRUE CUT edge: mandatory area above the fabric that neither plate nor fabric
    // covers. Where the fabric's top coincides with the mandatory mask's own top, that edge IS the
    // garment's silhouette — the same boundary the accepted asset has — and counting it as exposed
    // (as the first version did) doubled the reported problem from 4 columns to 12.
    const exposed = [], silhouetteEdges = [];
    for (let x = 0; x < W; x++) {
      let top = -1;
      for (let y = 0; y < H; y++) if (visFab[y * W + x]) { top = y; break; }
      if (top <= 0) continue;
      if (img[((top - 1) * W + x) * 4 + 3] >= OPAQUE) continue;      // covered directly above
      let maskTop = -1;
      for (let y = 0; y < H; y++) if (masks.hard[y * W + x]) { maskTop = y; break; }
      if (maskTop >= 0 && top <= maskTop + 1) silhouetteEdges.push(x); else exposed.push(x);
    }
    const bands = {};
    for (const [n, [a, b]] of Object.entries(BANDS)) {
      let tot = 0, cov = 0;
      for (let y = Math.max(0, a); y < Math.min(H, b); y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (!masks.hard[i]) continue; tot++; if (img[i * 4 + 3] >= OPAQUE) cov++; }
      if (tot) bands[n] = { hardPx: tot, missingPx: tot - cov, coverage: +(cov / tot).toFixed(5) };
    }
    let stray = 0, onProt = 0, orphan = 0;
    for (let i = 0; i < W * H; i++) { const a = img[i * 4 + 3]; if (a >= VISIBLE) { if (!masks.edit[i]) stray++; if (masks.protect[i]) onProt++; } }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, a = img[i * 4 + 3];
      if (a === 0 || a >= OPAQUE) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; if (img[(yy * W + xx) * 4 + 3] >= OPAQUE) { near = true; break; } }
      if (!near) orphan++;
    }
    const on = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) on[i] = img[i * 4 + 3] >= OPAQUE ? 1 : 0;
    const fc = comps(visFab);
    return { visFab, silhouetteEdges, fabricPx: fabPx, fabricLeft: fabL, fabricRight: fabR, exposedColumns: exposed, bands, residual: Object.values(bands).reduce((s, b) => s + b.missingPx, 0), inkOutsideEdit: stray, inkOnProtect: onProt, orphanSoftPx: orphan, components: comps(on).length, fabricComponents: fc.length, fabricSpecks: fc.filter((c) => c.length < 64).length };
  };
  const mB = measureOn(before), mA = measureOn(after);

  // v1 identity outside fabric ∪ plate masks
  let outsideDiff = 0, forbidden = 0;
  const beltTop = 756;
  for (let i = 0; i < W * H; i++) {
    let ch = false; for (let c = 0; c < 4; c++) if (after[i * 4 + c] !== v1.rgba[i * 4 + c]) { ch = true; break; }
    if (!ch) continue;
    const allowed = sleeve.fabric[i] || fitL.rgba[i * 4 + 3] >= VISIBLE || fitR.rgba[i * 4 + 3] >= VISIBLE || plates.left[i] || plates.right[i];
    if (!allowed) outsideDiff++;
    if (v1.rgba[i * 4 + 3] < VISIBLE) {
      const y = (i / W) | 0, x = i % W;
      const cl = seamL[y] > 0 ? seamL[y] : geo.torsoL, cr = seamR[y] > 0 ? seamR[y] : geo.torsoR;
      if (y < BANDS.collar[1] || (y >= 560 && y < beltTop && x > cl && x < cr) || y >= beltTop) forbidden++;
    }
  }
  const small = down(after, W, H, 52, 78);
  const tones = new Set();
  for (let i = 0; i < 52 * 78; i++) if (small[i * 4 + 3] >= 128) tones.add(Math.round((0.299 * small[i * 4] + 0.587 * small[i * 4 + 1] + 0.114 * small[i * 4 + 2]) / 8));

  const report = {
    tool: "plate-microfit", decision: "D-097 micro-fit", v1Sha256: v1.sha256,
    budget: { outwardPx: OUTWARD, downwardPx: DOWNWARD, pinDepthPx: PIN_DEPTH },
    plate: {
      left: { bbox: fitL.bbox, vertexMove: fitL.vertexMove, changedPx: fitL.changedPx, foldovers: fitL.metrics.foldovers, areaRatio: fitL.metrics.areaRatio, maxLongestEdgeRatio: fitL.metrics.maxLongestEdgeRatio, maxAbsRotationDeg: fitL.metrics.maxAbsRotationDeg },
      right: { bbox: fitR.bbox, vertexMove: fitR.vertexMove, changedPx: fitR.changedPx, foldovers: fitR.metrics.foldovers, areaRatio: fitR.metrics.areaRatio, maxLongestEdgeRatio: fitR.metrics.maxLongestEdgeRatio, maxAbsRotationDeg: fitR.metrics.maxAbsRotationDeg },
    },
    before: { exposedColumns: mB.exposedColumns.length, residual: mB.residual },
    after: { exposedColumns: mA.exposedColumns.length, exposedSample: mA.exposedColumns.slice(0, 12), residual: mA.residual, bands: mA.bands, fabricPx: mA.fabricPx, fabricLeft: mA.fabricLeft, fabricRight: mA.fabricRight, fabricBalance: +(Math.min(mA.fabricLeft, mA.fabricRight) / Math.max(mA.fabricLeft, mA.fabricRight)).toFixed(4), fabricComponents: mA.fabricComponents, fabricSpecks: mA.fabricSpecks, inkOutsideEdit: mA.inkOutsideEdit, inkOnProtect: mA.inkOnProtect, orphanSoftPx: mA.orphanSoftPx, components: mA.components },
    newlyCoveredColumns: mB.exposedColumns.length - mA.exposedColumns.length,
    v1DiffOutsideFabricAndPlate: outsideDiff, forbiddenRegionNewPixels: forbidden,
    distinctToneBucketsAt52x78: tones.size,
  };
  const checks = [
    ["exposedFabricTopColumns = 0", mA.exposedColumns.length === 0],
    ["foldovers = 0", fitL.metrics.foldovers === 0 && fitR.metrics.foldovers === 0],
    ["no change in collar/breastplate/belt/skirt", forbidden === 0],
    ["v1 pixel-identical outside fabric + plate masks", outsideDiff === 0],
    ["0 ink outside edit", mA.inkOutsideEdit === 0],
    ["0 ink on protect", mA.inkOnProtect === 0],
    ["no halo", mA.orphanSoftPx <= 64],
    ["single component", mA.components === 1],
    ["residual <= 1702 (previous)", mA.residual <= 1702],
    ["no pointed flare (max area-ratio < 1.6)", Math.max(fitL.metrics.areaRatio.max, fitR.metrics.areaRatio.max) < 1.6],
    ["no obvious stretch (max edge ratio < 1.4)", Math.max(fitL.metrics.maxLongestEdgeRatio, fitR.metrics.maxLongestEdgeRatio) < 1.4],
  ];
  report.checks = checks.map(([name, pass]) => ({ name, pass }));
  report.automatedVerdict = checks.every(([, p]) => p) ? "ALL_AUTOMATED_CHECKS_PASS" : "AUTOMATED_CHECKS_FAILED";

  // ── review ───────────────────────────────────────────────────────────────────────────────────
  const fB = flatten(before, W, H), fA = flatten(after, W, H), fV = flatten(v1.rgba, W, H);
  write(join(OUT, "00-before-microfit.png"), encodePngRGBA(W, H, fB));
  write(join(OUT, "01-after-microfit.png"), encodePngRGBA(W, H, fA));
  { const s = strip([{ w: W, h: H, rgba: fB }, { w: W, h: H, rgba: fA }]); write(join(OUT, "02-before-after-master.png"), encodePngRGBA(s.w, s.h, s.rgba)); }
  const plateBefore = Buffer.alloc(W * H * 4), plateAfter = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) { if (plates.left[i] || plates.right[i]) for (let c = 0; c < 4; c++) plateBefore[i * 4 + c] = v1.rgba[i * 4 + c]; overPx(plateAfter, fitL.rgba, i); overPx(plateAfter, fitR.rgba, i); }
  { const s = strip([{ w: W, h: H, rgba: flatten(plateBefore, W, H, [18, 20, 26]) }, { w: W, h: H, rgba: flatten(plateAfter, W, H, [18, 20, 26]) }]); write(join(OUT, "10-plate-only-before-after.png"), encodePngRGBA(s.w, s.h, s.rgba)); }
  { const m = Buffer.from(fA); for (const x of mA.exposedColumns) for (let y = 0; y < H; y++) if (mA.visFab[y * W + x]) { m[(y * W + x) * 4] = 255; m[(y * W + x) * 4 + 1] = 0; m[(y * W + x) * 4 + 2] = 0; } write(join(OUT, "11-fabric-top-exposure-map.png"), encodePngRGBA(W, H, m)); }
  { // deformation heatmap: where plate pixels moved
    const h2 = Buffer.alloc(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      let d = 0; for (let c = 0; c < 4; c++) d = Math.max(d, Math.abs(plateAfter[i * 4 + c] - plateBefore[i * 4 + c]));
      h2[i * 4] = d > 0 ? Math.min(255, 60 + d) : 18; h2[i * 4 + 1] = d > 0 ? Math.max(0, 200 - d) : 20; h2[i * 4 + 2] = 30; h2[i * 4 + 3] = 255;
    }
    write(join(OUT, "12-deformation-heatmap.png"), encodePngRGBA(W, H, h2));
  }
  { const d = Buffer.alloc(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      let ch = false; for (let c = 0; c < 4; c++) if (after[i * 4 + c] !== v1.rgba[i * 4 + c]) { ch = true; break; }
      const allowed = sleeve.fabric[i] || fitL.rgba[i * 4 + 3] >= VISIBLE || fitR.rgba[i * 4 + 3] >= VISIBLE || plates.left[i] || plates.right[i];
      if (ch && !allowed) d[i * 4] = 255; else if (allowed) { d[i * 4] = 55; d[i * 4 + 1] = 55; d[i * 4 + 2] = 65; } else { d[i * 4] = 16; d[i * 4 + 1] = 18; d[i * 4 + 2] = 22; }
      d[i * 4 + 3] = 255;
    }
    write(join(OUT, "13-preserved-region-diff.png"), encodePngRGBA(W, H, d)); }
  for (const [n, x0] of [["20-left-shoulder-8x.png", 315], ["21-right-shoulder-8x.png", 655]]) {
    const s = strip([fV, fB, fA].map((src) => crop(src, x0, 600, 75, 130, 8)), 10);
    write(join(OUT, n), encodePngRGBA(s.w, s.h, s.rgba));
  }
  { const rows = []; for (const [w, h] of SIZES) for (const r of [before, after]) rows.push({ w, h, rgba: flatten(down(r, W, H, w, h), w, h, [26, 28, 36]) }); const s = strip(rows, 10); write(join(OUT, "30-four-scale-matrix.png"), encodePngRGBA(s.w, s.h, s.rgba)); }
  const base = decodeBase();
  if (base && base.w === 512) { const rows = []; for (const [w, h] of SIZES) for (const r of [before, after]) rows.push({ w, h, rgba: flatten(down(onBase(base, r), 512, 768, w, h), w, h, [26, 28, 36]) }); const s = strip(rows, 10); write(join(OUT, "31-on-r2-base-matrix.png"), encodePngRGBA(s.w, s.h, s.rgba)); }
  write(join(OUT, "report.json"), Buffer.from(JSON.stringify(report, null, 2) + "\n", "utf8"));

  console.log(`plate outer edge  left x${fitL.bbox.x0}  right x${fitR.bbox.x1}   budget ${OUTWARD}px out / ${DOWNWARD}px down`);
  console.log(`vertex move  L max ${fitL.vertexMove.max} median ${fitL.vertexMove.median}   R max ${fitR.vertexMove.max}`);
  console.log(`area-ratio   L max ${fitL.metrics.areaRatio.max} p95 ${fitL.metrics.areaRatio.p95}   R max ${fitR.metrics.areaRatio.max}`);
  console.log(`edge ratio   L ${fitL.metrics.maxLongestEdgeRatio}  R ${fitR.metrics.maxLongestEdgeRatio}   foldovers ${fitL.metrics.foldovers}/${fitR.metrics.foldovers}`);
  console.log(`changed plate px  L ${fitL.changedPx}  R ${fitR.changedPx}`);
  console.log(`\nexposed columns  before ${mB.exposedColumns.length}  →  after ${mA.exposedColumns.length}` + (mA.exposedColumns.length ? "  (" + mA.exposedColumns.slice(0, 12).join(",") + ")" : ""));
  console.log(`residual  before ${mB.residual}  →  after ${mA.residual}   (cap 1702)`);
  console.log("\nchecks:");
  for (const c of report.checks) console.log(`  ${c.pass ? "✓" : "✖"} ${c.name}`);
  console.log(`\n${report.automatedVerdict}  →  ${OUT}`);
}
const invoked = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invoked) { try { main(); } catch (e) { console.error("✖ " + e.message); console.error(e.stack); process.exit(1); } }
