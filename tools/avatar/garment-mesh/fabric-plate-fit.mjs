// D-097 revision — fabric underlayer with a CLEAN sleeve silhouette and mesh-fitted shoulder plates.
// ---------------------------------------------------------------------------------------------
// The first POC proved the model (plate reads as lying on fabric; repair backfill 8,608 → 1,049)
// but failed visually on three counts the owner named: the fabric stuck out as square blocks, the
// cuff was ragged, and 28 columns of the fabric's top edge sat exposed beyond the shoulder plate.
//
// TWO INSIGHTS DRIVE THIS REVISION.
//
// 1. THE FABRIC MASK DOES NOT HAVE TO BE THE GAP. Because v1 is composited LAST, fabric under v1 is
//    invisible. So the underlayer can be a deliberate, clean sleeve SHAPE — rounded contour, honest
//    cuff — and only the parts v1 does not cover ever show. The first POC used "mandatory gap minus
//    v1", which is why its silhouette was whatever the subtraction happened to leave: a wide wedge
//    at y 660–700 dropping 60 px to a thin 8–20 px strip that ran to y 880. That step IS the square
//    block, and no amount of smoothing of a subtraction result would have fixed it.
//
// 2. THE EXPOSED TOP EDGE IS A PLATE PROBLEM, NOT A FABRIC PROBLEM. The 28 exposed columns sit at
//    x 328–341 and 684–697 — the outermost shoulder, where v1's plate simply does not reach. So the
//    plate is extended there, locally, by a mesh: outward and slightly down, with its inboard
//    attachment pinned so the plate cannot drift into the collar or the breastplate.
//
// Composition order: fabric underlayer → mesh-fitted shoulder plates → the rest of v1, byte-identical.
// No image generation, no API call, no runtime change, nothing promoted.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, sep } from "node:path";
import { decodePng, encodePngRGBA } from "../build-r2-torso-occlusion-mask.mjs";
import { OPAQUE, VISIBLE, BANDS } from "../check-r2-torso-candidate.mjs";
import { geometry, plateSeam, W, H } from "./sleeve-donor-challenger.mjs";
import { warp, distortionMetrics, SCHEMA_VERSION } from "./mesh-core.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");
const AI = join(REPO, "tools", "avatar", "build", "ai-input");
const FIX = join(REPO, "tools", "avatar", "fixtures", "r2-torso");
const BUILD = join(REPO, "tools", "avatar", "build", "fabric-plate-fit");
const OUT = process.env.D097_PLATEFIT_OUT || "C:\\Users\\Bruger\\Documents\\DEN SEJE APP\\_avatar-artefakter\\D097-fabric-underlayer-plate-fit-review";
const DWEBP = join(REPO, "tools", "avatar", "vendor", "dwebp.exe");
const BASE_WEBP = join(REPO, "assets", "avatar-r2", "base", "body-neutral-medium-v2.webp");
const SIZES = [[180, 270], [112, 168], [72, 108], [52, 78]];
const FABRIC = [84, 86, 88];              // the neutral variant the owner reviewed

const sha256 = (b) => createHash("sha256").update(b).digest("hex");
function assertWritable(p) {
  const abs = resolve(p);
  if (![BUILD, OUT].some((r) => abs === resolve(r) || abs.startsWith(resolve(r) + sep))) throw new Error("outside build/review: " + abs);
  if (/[\\/]assets[\\/]|[\\/]js[\\/]|\.claude/i.test(abs)) throw new Error("protected path: " + abs);
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

// ── 3. CLEAN SLEEVE SILHOUETTE ────────────────────────────────────────────────────────────────
// The fabric is a designed shape, not a subtraction: per row it runs from the mandatory region's
// outer edge inward to the armhole seam, over the sleeve's own vertical extent, with the lower
// rows tapered to a rounded cuff. It is then clipped to the mandatory region, so it can never
// place material the garment does not owe the figure anyway.
export const CUFF_Y = 714;          // where the base tee's sleeve ends — the cuff line
export const CUFF_TAPER = 26;       // rows over which the sleeve rounds off into the cuff
export function sleeveFabric(hard, geo, seamL, seamR, coverAbove = null) {
  const fabric = new Uint8Array(W * H);
  // The shape runs the FULL height of the mandatory region, not just to the cuff. Stopping at the
  // cuff was tried and reclassified the garment's side strips (below the sleeve, between seam and
  // silhouette) as repair, pushing residual from 1,049 to 2,731. Those strips are fabric too — the
  // tunic's side under the plates — they are simply not sleeve. The cuff is expressed as a gentle
  // inset at that line, not as a termination, so there is no hard horizontal chop.
  const yTop = geo.top, yBot = H - 1;
  for (let y = yTop; y <= yBot; y++) {
    const cl = seamL[y] > 0 ? seamL[y] : geo.torsoL;
    const cr = seamR[y] > 0 ? seamR[y] : geo.torsoR;
    // Rounded cuff: over the last CUFF_TAPER rows the sleeve pulls in, quarter-circle style, so it
    // ends in a curve instead of a straight horizontal chop.
    // Cuff inset: a quarter-circle pull-in centred on the cuff line, easing back out below it.
    let inset = 0;
    const d = Math.abs(y - CUFF_Y);
    if (d < CUFF_TAPER) inset = Math.round(10 * Math.sqrt(Math.max(0, 1 - (d / CUFF_TAPER) ** 2)));
    let l0 = -1, l1 = -1, r0 = -1, r1 = -1;
    for (let x = 0; x < W; x++) if (hard[y * W + x]) { if (l0 < 0) l0 = x; l1 = x; }
    if (l0 < 0) continue;
    r0 = l0; r1 = l1;
    for (let x = r0 + inset; x < cl; x++) fabric[y * W + x] = 1;
    for (let x = cr + 1; x <= r1 - inset; x++) fabric[y * W + x] = 1;
  }
  // FABRIC MAY ONLY EXIST WHERE SOMETHING COVERS ITS TOP.
  // Extending the plate by mesh alone could not reach the outermost shoulder columns (x 328–339):
  // v1's plate simply ends before them, and pushing it 20+ px out would have redesigned the plate
  // rather than fitted it. Constraining the fabric instead makes the guarantee structural — an
  // exposed fabric top becomes impossible by construction rather than something to be checked for.
  // Semantically it is also the right rule: fabric shows BELOW a plate, not beside one.
  if (coverAbove) {
    for (let x = 0; x < W; x++) {
      let seenCover = false;
      for (let y = 0; y < H; y++) {
        const i = y * W + x;
        if (coverAbove[i]) seenCover = true;
        else if (fabric[i] && !seenCover) fabric[i] = 0;   // above any cover in this column → drop
      }
    }
  }
  // Keep only the two sleeve bodies; anything smaller is noise, not a garment part.
  const keep = new Uint8Array(W * H);
  let dropped = 0;
  for (const c of comps(fabric)) { if (c.length >= 256) for (const i of c) keep[i] = 1; else dropped += c.length; }
  return { fabric: keep, droppedPx: dropped };
}

// ── 1. SEMANTIC SHOULDER-PLATE MASKS ──────────────────────────────────────────────────────────
// The shoulder plate is v1's OWN artwork on the sleeve, above the point where the sleeve runs out.
// Defined as: v1 opaque ∧ outboard of the armhole seam ∧ within the shoulder band. That takes the
// plate with its outer outline, its lower outline and its highlights, and — because the seam is the
// breastplate boundary — never takes breastplate or collar with it.
export function shoulderPlates(v1, geo, seamL, seamR) {
  const left = new Uint8Array(W * H), right = new Uint8Array(W * H);
  for (let y = geo.top; y <= CUFF_Y; y++) {
    const cl = seamL[y] > 0 ? seamL[y] : geo.torsoL;
    const cr = seamR[y] > 0 ? seamR[y] : geo.torsoR;
    for (let x = 0; x < W; x++) {
      if (v1.rgba[(y * W + x) * 4 + 3] < VISIBLE) continue;
      if (x < cl) left[y * W + x] = 1;
      else if (x > cr) right[y * W + x] = 1;
    }
  }
  const big = (m) => { const k = new Uint8Array(W * H); const c = comps(m); if (c.length) for (const i of c[0]) k[i] = 1; return k; };
  return { left: big(left), right: big(right) };
}

// ── 2. LOCAL MESH ON EACH PLATE ───────────────────────────────────────────────────────────────
// A 4×4 mesh over the plate's own bounding box. Only the OUTER column moves — outward and slightly
// down — so the plate grows over the exposed fabric edge. The inboard column is pinned, which is
// what keeps the plate's attachment point fixed and stops any drift toward collar or breastplate.
export function fitPlate(plateMask, v1, side, { outward = 10, down = 8 } = {}) {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let i = 0; i < W * H; i++) if (plateMask[i]) { const x = i % W, y = (i / W) | 0; if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  if (x1 < 0) return { rgba: Buffer.alloc(W * H * 4), mesh: null, metrics: null };
  const pad = 24;
  const bx0 = Math.max(0, x0 - pad), bx1 = Math.min(W - 1, x1 + pad);
  const by0 = Math.max(0, y0 - pad), by1 = Math.min(H - 1, y1 + pad);

  const COLS = 4, ROWS = 4;
  const vertices = [], triangles = [];
  const vid = (r, c) => `p${r}_${c}`;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const sx = bx0 + (bx1 - bx0) * (c / (COLS - 1));
      const sy = by0 + (by1 - by0) * (r / (ROWS - 1));
      // Outer column index depends on the side: left plates grow toward x=0, right toward x=W.
      const outerCol = side === "left" ? 0 : COLS - 1;
      const isOuter = c === outerCol;
      const isPinnedInner = c === (side === "left" ? COLS - 1 : 0);
      // Only the middle rows move: the top row holds the shoulder line, the bottom row holds the
      // sleeve's lower edge, so the plate cannot stretch into a pointed flare.
      const midRow = r === 1 || r === 2;
      const dx = isOuter && midRow ? (side === "left" ? -outward : outward) : 0;
      const dy = isOuter && midRow ? down : 0;
      vertices.push({
        id: vid(r, c), source: [sx, sy], target: [sx + dx, sy + dy],
        role: isOuter ? "boundary" : "interior",
        lockedX: isPinnedInner, lockedY: isPinnedInner || r === 0 || r === ROWS - 1,
      });
    }
  }
  for (let r = 0; r < ROWS - 1; r++) for (let c = 0; c < COLS - 1; c++) {
    triangles.push([vid(r, c), vid(r, c + 1), vid(r + 1, c + 1)], [vid(r, c), vid(r + 1, c + 1), vid(r + 1, c)]);
  }
  const mesh = {
    version: SCHEMA_VERSION, canvas: { width: W, height: H }, vertices, triangles,
    constraints: { pinnedVertices: vertices.filter((v) => v.lockedX && v.lockedY).map((v) => v.id) },
  };
  // Warp ONLY the plate: everything else is transparent going in, so nothing else can be moved.
  const iso = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) if (plateMask[i]) for (let c = 0; c < 4; c++) iso[i * 4 + c] = v1.rgba[i * 4 + c];
  const w = warp(mesh, iso, W, H);
  return { rgba: w.rgba, mesh, metrics: distortionMetrics(mesh), bbox: { x0, y0, x1, y1 } };
}

// ── imaging ───────────────────────────────────────────────────────────────────────────────────
function flatten(rgba, w, h, bg = [250, 250, 250]) {
  const o = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const a = rgba[i * 4 + 3] / 255;
    for (let c = 0; c < 3; c++) o[i * 4 + c] = Math.round(rgba[i * 4 + c] * a + bg[c] * (1 - a));
    o[i * 4 + 3] = 255;
  }
  return o;
}
function down(rgba, sw, sh, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    const y0 = Math.floor(y * sh / dh), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sh / dh));
    for (let x = 0; x < dw; x++) {
      const x0 = Math.floor(x * sw / dw), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sw / dw));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
        const si = (yy * sw + xx) * 4, sa = rgba[si + 3];
        r += rgba[si] * sa; g += rgba[si + 1] * sa; b += rgba[si + 2] * sa; a += sa; n++;
      }
      const di = (y * dw + x) * 4;
      if (a <= 0) { out[di + 3] = 0; continue; }
      out[di] = Math.round(r / a); out[di + 1] = Math.round(g / a); out[di + 2] = Math.round(b / a); out[di + 3] = Math.round(a / n);
    }
  }
  return out;
}
function strip(panels, gap = 12, bg = [26, 28, 36]) {
  const w = panels.reduce((s, p) => s + p.w + gap, gap);
  const h = Math.max(...panels.map((p) => p.h)) + gap * 2;
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { out[i * 4] = bg[0]; out[i * 4 + 1] = bg[1]; out[i * 4 + 2] = bg[2]; out[i * 4 + 3] = 255; }
  let x0 = gap;
  for (const p of panels) {
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      const si = (y * p.w + x) * 4, di = ((y + gap) * w + x0 + x) * 4;
      const a = p.rgba[si + 3] / 255;
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
  const r = spawnSync(DWEBP, [BASE_WEBP, "-o", assertWritable(o)], { encoding: "utf8" });
  return r.status === 0 ? decodePng(readFileSync(o), "base") : null;
}
function onBase(base, cand) {
  const served = down(cand, W, H, 512, 768), b = Buffer.from(base.rgba);
  for (let i = 0; i < 512 * 768; i++) {
    const a = served[i * 4 + 3] / 255;
    if (a === 0) continue;
    for (let c = 0; c < 3; c++) b[i * 4 + c] = Math.round(served[i * 4 + c] * a + b[i * 4 + c] * (1 - a));
    b[i * 4 + 3] = Math.max(b[i * 4 + 3], served[i * 4 + 3]);
  }
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

// ── run ───────────────────────────────────────────────────────────────────────────────────────
function main() {
  mkdirSync(BUILD, { recursive: true }); mkdirSync(OUT, { recursive: true });
  const v1 = load("torso-armor-knight-candidate-nobackfill.png");
  const masks = { hard: loadMask("torso-occlusion-hard-v1.png"), edit: loadMask("torso-edit-allowed-v1.png"), protect: loadMask("torso-protect-v1.png") };
  const geo = geometry(v1);
  const seamL = plateSeam(v1, geo, "left"), seamR = plateSeam(v1, geo, "right");

  const plates = shoulderPlates(v1, geo, seamL, seamR);
  const fitL = fitPlate(plates.left, v1, "left");
  const fitR = fitPlate(plates.right, v1, "right");
  // Cover = the accepted artwork plus the mesh-fitted plates. The fabric shape is derived AFTER
  // the plates are fitted, so it can only ever live under something.
  const cover = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) cover[i] = (v1.rgba[i * 4 + 3] >= OPAQUE || fitL.rgba[i * 4 + 3] >= OPAQUE || fitR.rgba[i * 4 + 3] >= OPAQUE) ? 1 : 0;
  const sleeve = sleeveFabric(masks.hard, geo, seamL, seamR, cover);

  // COMPOSE: fabric → fitted plates → the rest of v1 byte-identical on top.
  const out = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) if (sleeve.fabric[i]) { out[i * 4] = FABRIC[0]; out[i * 4 + 1] = FABRIC[1]; out[i * 4 + 2] = FABRIC[2]; out[i * 4 + 3] = 255; }
  for (let i = 0; i < W * H; i++) { overPx(out, fitL.rgba, i); overPx(out, fitR.rgba, i); }
  for (let i = 0; i < W * H; i++) overPx(out, v1.rgba, i);
  // Clip to the edit zone — the fabric shape is generous by design, the mask is the authority.
  for (let i = 0; i < W * H; i++) if (!masks.edit[i]) { out[i * 4] = 0; out[i * 4 + 1] = 0; out[i * 4 + 2] = 0; out[i * 4 + 3] = 0; }

  // ── measurements ─────────────────────────────────────────────────────────────────────────────
  const visibleFabric = new Uint8Array(W * H);
  let fabPx = 0, fabL = 0, fabR = 0;
  for (let i = 0; i < W * H; i++) {
    if (!sleeve.fabric[i] || !masks.edit[i]) continue;
    if (v1.rgba[i * 4 + 3] >= OPAQUE) continue;
    if (fitL.rgba[i * 4 + 3] >= OPAQUE || fitR.rgba[i * 4 + 3] >= OPAQUE) continue;
    visibleFabric[i] = 1; fabPx++;
    ((i % W) < 512) ? fabL++ : fabR++;
  }
  // Exposed fabric top: a visible-fabric column whose topmost pixel has no plate/artwork above it.
  const exposedCols = [];
  for (let x = 0; x < W; x++) {
    let top = -1;
    for (let y = 0; y < H; y++) if (visibleFabric[y * W + x]) { top = y; break; }
    if (top <= 0) continue;
    const above = (top - 1) * W + x;
    const covered = v1.rgba[above * 4 + 3] >= OPAQUE || fitL.rgba[above * 4 + 3] >= OPAQUE || fitR.rgba[above * 4 + 3] >= OPAQUE;
    if (!covered) exposedCols.push(x);
  }
  const bands = {};
  for (const [n, [a, b]] of Object.entries(BANDS)) {
    let tot = 0, cov = 0;
    for (let y = Math.max(0, a); y < Math.min(H, b); y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!masks.hard[i]) continue;
      tot++; if (out[i * 4 + 3] >= OPAQUE) cov++;
    }
    if (tot) bands[n] = { hardPx: tot, coveredPx: cov, missingPx: tot - cov, coverage: +(cov / tot).toFixed(5) };
  }
  const residual = Object.values(bands).reduce((s, b) => s + b.missingPx, 0);
  let stray = 0, onProtect = 0, orphan = 0, outsideDiff = 0, forbidden = 0;
  const beltTop = 756, beltBot = 786;
  for (let i = 0; i < W * H; i++) {
    const a = out[i * 4 + 3], y = (i / W) | 0, x = i % W;
    if (a >= VISIBLE) { if (!masks.edit[i]) stray++; if (masks.protect[i]) onProtect++; }
    const changed = (() => { for (let c = 0; c < 4; c++) if (out[i * 4 + c] !== v1.rgba[i * 4 + c]) return true; return false; })();
    if (changed && !sleeve.fabric[i] && fitL.rgba[i * 4 + 3] < VISIBLE && fitR.rgba[i * 4 + 3] < VISIBLE) outsideDiff++;
    if (changed && v1.rgba[i * 4 + 3] < VISIBLE) {
      const cl = seamL[y] > 0 ? seamL[y] : geo.torsoL, cr = seamR[y] > 0 ? seamR[y] : geo.torsoR;
      if (y < BANDS.collar[1]) forbidden++;
      else if (y >= 560 && y < beltTop && x > cl && x < cr) forbidden++;
      else if (y >= beltTop) forbidden++;
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, a = out[i * 4 + 3];
    if (a === 0 || a >= OPAQUE) continue;
    let near = false;
    for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      if (out[(yy * W + xx) * 4 + 3] >= OPAQUE) { near = true; break; }
    }
    if (!near) orphan++;
  }
  const onOpaque = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) onOpaque[i] = out[i * 4 + 3] >= OPAQUE ? 1 : 0;
  const cc = comps(onOpaque);
  const fc = comps(visibleFabric);
  const small = down(out, W, H, 52, 78);
  const tones = new Set();
  for (let i = 0; i < 52 * 78; i++) if (small[i * 4 + 3] >= 128) tones.add(Math.round((0.299 * small[i * 4] + 0.587 * small[i * 4 + 1] + 0.114 * small[i * 4 + 2]) / 8));

  const report = {
    tool: "fabric-plate-fit", decision: "D-097 revision", v1Sha256: v1.sha256,
    fabric: {
      shape: "designed sleeve silhouette (outer mandatory edge → armhole seam, rounded cuff at y=" + CUFF_Y + ")",
      visiblePx: fabPx, leftPx: fabL, rightPx: fabR,
      leftRightBalance: +(Math.min(fabL, fabR) / Math.max(fabL, fabR)).toFixed(4),
      components: fc.length, largest: fc[0]?.length ?? 0, specks: fc.filter((c) => c.length < 64).length,
      droppedFromShapePx: sleeve.droppedPx,
    },
    plateFit: {
      left: { bbox: fitL.bbox, foldovers: fitL.metrics?.foldovers, areaRatio: fitL.metrics?.areaRatio },
      right: { bbox: fitR.bbox, foldovers: fitR.metrics?.foldovers, areaRatio: fitR.metrics?.areaRatio },
      outwardPx: 10, downPx: 8,
    },
    fabricTopExposedColumns: exposedCols.length, exposedColumnsSample: exposedCols.slice(0, 20),
    bands, residualRepairBackfillPx: residual,
    inkOutsideEdit: stray, inkOnProtect: onProtect, orphanSoftPx: orphan,
    components: cc.length, differsFromV1OutsidePlateAndFabric: outsideDiff,
    forbiddenRegionNewPixels: forbidden,
    distinctToneBucketsAt52x78: tones.size,
  };

  const checks = [
    ["0 exposed fabric-top columns", exposedCols.length === 0],
    ["fabric is 2 clean components", fc.length === 2],
    ["no fabric specks", report.fabric.specks === 0],
    ["left/right balance >= 0.75", report.fabric.leftRightBalance >= 0.75],
    ["no plate foldovers", (fitL.metrics?.foldovers ?? 0) === 0 && (fitR.metrics?.foldovers ?? 0) === 0],
    ["no new pixels in collar/breastplate/belt/skirt", forbidden === 0],
    ["rest of v1 pixel-identical", outsideDiff === 0],
    ["0 ink outside edit", stray === 0],
    ["0 ink on protect", onProtect === 0],
    ["no halo", orphan <= 64],
    ["single component", cc.length === 1],
    ["residual repair <= 1049", residual <= 1049],
  ];
  report.checks = checks.map(([name, pass]) => ({ name, pass }));
  report.automatedVerdict = checks.every(([, p]) => p) ? "ALL_AUTOMATED_CHECKS_PASS" : "AUTOMATED_CHECKS_FAILED";

  // ── review images ────────────────────────────────────────────────────────────────────────────
  const fV1 = flatten(v1.rgba, W, H), fOut = flatten(out, W, H);
  write(join(OUT, "00-v1-accepted.png"), encodePngRGBA(W, H, fV1));
  write(join(OUT, "01-candidate.png"), encodePngRGBA(W, H, fOut));
  { const s = strip([{ w: W, h: H, rgba: fV1 }, { w: W, h: H, rgba: fOut }]); write(join(OUT, "02-side-by-side-master.png"), encodePngRGBA(s.w, s.h, s.rgba)); }
  const paint = (m, col) => { const o = Buffer.alloc(W * H * 4); for (let i = 0; i < W * H; i++) { const on = m[i]; o[i * 4] = on ? col[0] : 18; o[i * 4 + 1] = on ? col[1] : 20; o[i * 4 + 2] = on ? col[2] : 26; o[i * 4 + 3] = 255; } return o; };
  write(join(OUT, "10-fabric-only.png"), encodePngRGBA(W, H, paint(visibleFabric, [150, 155, 165])));
  write(join(OUT, "11-plate-only.png"), encodePngRGBA(W, H, flatten((() => { const o = Buffer.alloc(W * H * 4); for (let i = 0; i < W * H; i++) { overPx(o, fitL.rgba, i); overPx(o, fitR.rgba, i); } return o; })(), W, H, [18, 20, 26])));
  { // plate mesh before / after
    const before = Buffer.alloc(W * H * 4), after = Buffer.alloc(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      if (plates.left[i] || plates.right[i]) for (let c = 0; c < 4; c++) before[i * 4 + c] = v1.rgba[i * 4 + c];
      overPx(after, fitL.rgba, i); overPx(after, fitR.rgba, i);
    }
    const s = strip([{ w: W, h: H, rgba: flatten(before, W, H, [18, 20, 26]) }, { w: W, h: H, rgba: flatten(after, W, H, [18, 20, 26]) }]);
    write(join(OUT, "12-plate-mesh-before-after.png"), encodePngRGBA(s.w, s.h, s.rgba));
  }
  { // fabric-top exposure map
    const m = Buffer.from(fOut);
    for (const x of exposedCols) for (let y = 0; y < H; y++) if (visibleFabric[y * W + x]) { m[(y * W + x) * 4] = 255; m[(y * W + x) * 4 + 1] = 0; m[(y * W + x) * 4 + 2] = 0; }
    write(join(OUT, "13-fabric-top-exposure-map.png"), encodePngRGBA(W, H, m));
  }
  {
    const d = Buffer.alloc(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      let ch = false; for (let c = 0; c < 4; c++) if (out[i * 4 + c] !== v1.rgba[i * 4 + c]) { ch = true; break; }
      const allowed = sleeve.fabric[i] || fitL.rgba[i * 4 + 3] >= VISIBLE || fitR.rgba[i * 4 + 3] >= VISIBLE;
      if (ch && !allowed) { d[i * 4] = 255; }
      else if (allowed) { d[i * 4] = 55; d[i * 4 + 1] = 55; d[i * 4 + 2] = 65; }
      else { d[i * 4] = 16; d[i * 4 + 1] = 18; d[i * 4 + 2] = 22; }
      d[i * 4 + 3] = 255;
    }
    write(join(OUT, "14-preserved-region-diff.png"), encodePngRGBA(W, H, d));
  }
  for (const [name, x0] of [["20-left-shoulder-8x.png", 315], ["21-right-shoulder-8x.png", 660]]) {
    const s = strip([fV1, fOut].map((src) => crop(src, x0, 600, 75, 130, 8)), 10);
    write(join(OUT, name), encodePngRGBA(s.w, s.h, s.rgba));
  }
  { const rows = []; for (const [w, h] of SIZES) for (const r of [v1.rgba, out]) rows.push({ w, h, rgba: flatten(down(r, W, H, w, h), w, h, [26, 28, 36]) }); const s = strip(rows, 10); write(join(OUT, "30-four-scale-matrix.png"), encodePngRGBA(s.w, s.h, s.rgba)); }
  const base = decodeBase();
  if (base && base.w === 512) {
    const rows = []; for (const [w, h] of SIZES) for (const r of [v1.rgba, out]) rows.push({ w, h, rgba: flatten(down(onBase(base, r), 512, 768, w, h), w, h, [26, 28, 36]) });
    const s = strip(rows, 10); write(join(OUT, "31-on-r2-base-matrix.png"), encodePngRGBA(s.w, s.h, s.rgba));
  }
  write(join(OUT, "report.json"), Buffer.from(JSON.stringify(report, null, 2) + "\n", "utf8"));

  console.log(`fabric visible ${fabPx} px (left ${fabL} / right ${fabR}, balance ${report.fabric.leftRightBalance}), components ${fc.length}, specks ${report.fabric.specks}`);
  console.log(`EXPOSED fabric-top columns: ${exposedCols.length}` + (exposedCols.length ? "  at x " + exposedCols.slice(0, 12).join(",") : ""));
  console.log(`plate mesh foldovers L=${fitL.metrics?.foldovers} R=${fitR.metrics?.foldovers}`);
  console.log(`residual repair ${residual} (cap 1049) · components ${cc.length} · halo ${orphan} · 52x78 tones ${tones.size}`);
  console.log("\nchecks:");
  for (const c of report.checks) console.log(`  ${c.pass ? "✓" : "✖"} ${c.name}`);
  console.log(`\n${report.automatedVerdict}  →  ${OUT}`);
}
const invoked = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invoked) { try { main(); } catch (e) { console.error("✖ " + e.message); console.error(e.stack); process.exit(1); } }
