// D-097 design POC — INTENTIONAL FABRIC UNDERLAYER beneath the armour plates.
// ---------------------------------------------------------------------------------------------
// THE IDEA (owner, 2026-08-03): a shoulder guard is a plate that sits ON TOP of a sleeve. So the
// garment should be built in that order — fabric first, plates over it — rather than as one flat
// drawing whose gaps are patched afterwards.
//
// WHY THAT IS NOT A RENAME. The shipped pipeline fills gaps with the NEAREST NEIGHBOUR colour: the
// fill has no intent, it imitates whatever happens to be beside it, and it is applied last, on top,
// where nothing can cover it. Calling that "fabric" would be a relabelling of repair.
//
// This builds something different:
//   1. an EXPLICIT fabric region, derived semantically (outboard of the measured armhole seam),
//      filled with a DELIBERATE, uniform garment tone — one decision, not a per-pixel imitation;
//   2. the v1 armour artwork composited OVER it, so every plate edge and outline belongs to the
//      accepted drawing and the fabric can only ever be what shows BETWEEN plates.
//
// The order is the whole point: because v1 is drawn last, it is byte-identical wherever it has
// content, and the shoulder plate necessarily covers the fabric's upper junction.
//
// The old backfill map is used ONLY as a diagnostic reference for where material used to be missing.
// No image generation, no API call, no runtime change, nothing promoted.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, sep } from "node:path";
import { decodePng, encodePngRGBA } from "../build-r2-torso-occlusion-mask.mjs";
import { OPAQUE, VISIBLE, BANDS } from "../check-r2-torso-candidate.mjs";
import { geometry, plateSeam, W, H } from "./sleeve-donor-challenger.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");
const AI = join(REPO, "tools", "avatar", "build", "ai-input");
const FIX = join(REPO, "tools", "avatar", "fixtures", "r2-torso");
const BUILD = join(REPO, "tools", "avatar", "build", "fabric-underlayer");
const OUT = process.env.D097_FABRIC_OUT || "C:\\Users\\Bruger\\Documents\\DEN SEJE APP\\_avatar-artefakter\\D097-fabric-underlayer-review";
const DWEBP = join(REPO, "tools", "avatar", "vendor", "dwebp.exe");
const BASE_WEBP = join(REPO, "assets", "avatar-r2", "base", "body-neutral-medium-v2.webp");
const SIZES = [[180, 270], [112, 168], [72, 108], [52, 78]];

const sha256 = (b) => createHash("sha256").update(b).digest("hex");
function assertWritable(p) {
  const abs = resolve(p);
  if (![BUILD, OUT].some((r) => abs === resolve(r) || abs.startsWith(resolve(r) + sep))) throw new Error("refusing to write outside build/review: " + abs);
  if (/[\\/]assets[\\/]|[\\/]js[\\/]|\.claude/i.test(abs)) throw new Error("protected path: " + abs);
  return abs;
}
const write = (p, b) => { const a = assertWritable(p); mkdirSync(dirname(a), { recursive: true }); writeFileSync(a, b); return a; };

// ── FABRIC VARIANTS ───────────────────────────────────────────────────────────────────────────
// Derived from v1's own sleeve palette near the fabric region (median RGB 83/87/90, p75 143/148/151),
// not invented: an underlayer in a colour the garment does not already contain would read as a
// patch no matter how deliberately it was placed.
export const FABRICS = {
  neutral: { name: "neutral dark grey", fn: () => [84, 86, 88] },
  cool: { name: "cool steel grey", fn: () => [78, 86, 98] },
  shaded: {
    name: "grey, very light vertical shading",
    // Top-lit: a garment under a shoulder plate is darker where the plate shadows it. The range is
    // deliberately narrow (24 luma over the whole region) so it cannot band at 52x78.
    fn: (y, y0, y1) => {
      const t = y1 > y0 ? Math.min(1, Math.max(0, (y - y0) / (y1 - y0))) : 0;
      return [Math.round(96 - 24 * t), Math.round(99 - 24 * t), Math.round(103 - 24 * t)];
    },
  },
};

function loadMask(n) {
  const img = decodePng(readFileSync(join(FIX, n)), n);
  const m = new Uint8Array(img.w * img.h);
  for (let i = 0; i < m.length; i++) m[i] = img.rgba[i * 4 + 3] > 0 ? 1 : 0;
  return m;
}
const load = (n) => { const b = readFileSync(join(AI, n)); return { ...decodePng(b, n), sha256: sha256(b) }; };

// ── PHASE 1: semantic split ───────────────────────────────────────────────────────────────────
// Fabric may only be placed where ALL of these hold:
//   * inside the MANDATORY region (so it is material the garment owes the figure anyway);
//   * v1 has no artwork (never over the accepted drawing);
//   * OUTBOARD of the measured armhole seam — i.e. sleeve, not torso. This is what keeps fabric
//     off the centre breastplate, and it is measured per row, not assumed.
// Everything still missing INBOARD of the seam stays classified as residual REPAIR, honestly, and
// is not laundered into "fabric".
export function semanticRegions(v1, hard, geo, seamL, seamR) {
  const fabric = new Uint8Array(W * H), residual = new Uint8Array(W * H);
  let nF = 0, nR = 0, left = 0, right = 0;
  for (let y = 0; y < H; y++) {
    const cl = seamL[y] > 0 ? seamL[y] : geo.torsoL;
    const cr = seamR[y] > 0 ? seamR[y] : geo.torsoR;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!hard[i]) continue;
      if (v1.rgba[i * 4 + 3] >= OPAQUE) continue;
      if (x < cl) { fabric[i] = 1; nF++; left++; }
      else if (x > cr) { fabric[i] = 1; nF++; right++; }
      else { residual[i] = 1; nR++; }
    }
  }
  // Drop speck islands. A deliberate underlayer is a garment part, not scattered dots — five
  // fragments under 64 px turned up on the first run, and they would read as noise, not fabric.
  // Whatever is dropped is reclassified as residual REPAIR, so the accounting stays honest.
  const keep = new Uint8Array(W * H);
  let dropped = 0;
  for (const comp of componentPixels(fabric)) {
    if (comp.length >= 64) { for (const i of comp) keep[i] = 1; }
    else { for (const i of comp) { residual[i] = 1; nR++; nF--; dropped += 1; } }
  }
  left = 0; right = 0;
  for (let y = 0; y < H; y++) {
    const cl = seamL[y] > 0 ? seamL[y] : geo.torsoL;
    for (let x = 0; x < W; x++) if (keep[y * W + x]) (x < cl ? left++ : right++);
  }
  return { fabric: keep, residual, fabricPx: nF, residualPx: nR, leftPx: left, rightPx: right, droppedSpeckPx: dropped };
}

function componentPixels(mask) {
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
  return out;
}

function components(mask) {
  const seen = new Uint8Array(W * H), sizes = [];
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
    sizes.push(q.length);
  }
  return sizes.sort((a, b) => b - a);
}

// ── PHASE 2+3: fabric under, v1 plates over ───────────────────────────────────────────────────
export function compose(v1, fabricMask, variantKey) {
  const spec = FABRICS[variantKey];
  let y0 = H, y1 = 0;
  for (let i = 0; i < W * H; i++) if (fabricMask[i]) { const y = (i / W) | 0; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const out = Buffer.alloc(W * H * 4);
  // 1. fabric underlayer
  for (let i = 0; i < W * H; i++) {
    if (!fabricMask[i]) continue;
    const [r, g, b] = spec.fn((i / W) | 0, y0, y1);
    out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = 255;
  }
  // 2. the accepted artwork OVER it — v1 wins wherever it has any content, so its outlines and
  //    plate edges always sit on top and nothing of v1 is altered.
  let over = 0;
  for (let i = 0; i < W * H; i++) {
    const a = v1.rgba[i * 4 + 3];
    if (a < VISIBLE) continue;
    if (a >= OPAQUE) { for (let c = 0; c < 4; c++) out[i * 4 + c] = v1.rgba[i * 4 + c]; over++; continue; }
    // v1's own anti-aliased edge. Blend it over the fabric ONLY where fabric actually lies beneath.
    // Blending over empty canvas would multiply v1's unpremultiplied RGB by its own alpha and alter
    // pixels that must stay byte-identical — that bug produced 198 spurious differences on the
    // first run, all of them on v1's outer edge where there is nothing underneath at all.
    if (out[i * 4 + 3] === 0) { for (let c = 0; c < 4; c++) out[i * 4 + c] = v1.rgba[i * 4 + c]; continue; }
    const al = a / 255;
    for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.round(v1.rgba[i * 4 + c] * al + out[i * 4 + c] * (1 - al));
    out[i * 4 + 3] = Math.max(out[i * 4 + 3], a);
  }
  return { rgba: out, artworkPx: over, fabricBounds: [y0, y1] };
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
function strip(panels, gap = 14, bg = [26, 28, 36]) {
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
  const served = down(cand, W, H, 512, 768);
  const b = Buffer.from(base.rgba);
  for (let i = 0; i < 512 * 768; i++) {
    const a = served[i * 4 + 3] / 255;
    if (a === 0) continue;
    for (let c = 0; c < 3; c++) b[i * 4 + c] = Math.round(served[i * 4 + c] * a + b[i * 4 + c] * (1 - a));
    b[i * 4 + 3] = Math.max(b[i * 4 + 3], served[i * 4 + 3]);
  }
  return b;
}

// ── measurement ───────────────────────────────────────────────────────────────────────────────
function measure(rgba, masks, fabricMask, v1, label) {
  const bands = {};
  for (const [n, [a, b]] of Object.entries(BANDS)) {
    let tot = 0, cov = 0;
    for (let y = Math.max(0, a); y < Math.min(H, b); y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!masks.hard[i]) continue;
      tot++;
      if (rgba[i * 4 + 3] >= OPAQUE) cov++;
    }
    if (tot) bands[n] = { hardPx: tot, coveredPx: cov, missingPx: tot - cov, coverage: +(cov / tot).toFixed(5) };
  }
  let stray = 0, onProtect = 0, orphan = 0, outsideFabricDiff = 0;
  for (let i = 0; i < W * H; i++) {
    const a = rgba[i * 4 + 3];
    if (a >= VISIBLE) { if (!masks.edit[i]) stray++; if (masks.protect[i]) onProtect++; }
    if (!fabricMask[i]) { for (let c = 0; c < 4; c++) if (rgba[i * 4 + c] !== v1.rgba[i * 4 + c]) { outsideFabricDiff++; break; } }
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
    if (!near) orphan++;
  }
  const on = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) on[i] = rgba[i * 4 + 3] >= OPAQUE ? 1 : 0;
  const comps = components(on);
  return {
    label, bands, totalMissingPx: Object.values(bands).reduce((s, b) => s + b.missingPx, 0),
    inkOutsideEdit: stray, inkOnProtect: onProtect, orphanSoftPx: orphan,
    components: comps.length, largestComponent: comps[0] ?? 0,
    differsFromV1OutsideFabricMask: outsideFabricDiff,
  };
}

// ── run ───────────────────────────────────────────────────────────────────────────────────────
function main() {
  mkdirSync(BUILD, { recursive: true }); mkdirSync(OUT, { recursive: true });
  const v1 = load("torso-armor-knight-candidate-nobackfill.png");
  const backfilled = load("torso-armor-knight-candidate.png");   // variant B: the shipped repair
  const masks = { hard: loadMask("torso-occlusion-hard-v1.png"), edit: loadMask("torso-edit-allowed-v1.png"), protect: loadMask("torso-protect-v1.png") };
  const geo = geometry(v1);
  const seamL = plateSeam(v1, geo, "left"), seamR = plateSeam(v1, geo, "right");
  const reg = semanticRegions(v1, masks.hard, geo, seamL, seamR);
  const fabComps = components(reg.fabric);

  const report = {
    tool: "fabric-underlayer-poc", decision: "D-097",
    idea: "shoulder guard sits ON the sleeve; fabric is drawn first and the accepted plates composited over it",
    v1Sha256: v1.sha256,
    semanticSplit: {
      totalMandatoryGapPx: reg.fabricPx + reg.residualPx,
      intentionalFabricPx: reg.fabricPx, fabricLeftPx: reg.leftPx, fabricRightPx: reg.rightPx,
      residualRepairBackfillPx: reg.residualPx,
      fabricComponents: fabComps.length, fabricLargestComponent: fabComps[0] ?? 0,
      fabricSpecks: fabComps.filter((c) => c < 64).length,
      leftRightBalance: +(Math.min(reg.leftPx, reg.rightPx) / Math.max(reg.leftPx, reg.rightPx)).toFixed(4),
      note: "fabric = mandatory gap OUTBOARD of the measured armhole seam (sleeve). residual = gap INBOARD (torso/plate territory) — reported as repair, not relabelled as fabric.",
    },
    variants: {},
  };

  const fV1 = flatten(v1.rgba, W, H), fB = flatten(backfilled.rgba, W, H);
  write(join(OUT, "A-v1-accepted.png"), encodePngRGBA(W, H, fV1));
  write(join(OUT, "B-v1-existing-backfill.png"), encodePngRGBA(W, H, fB));
  report.variants["A-v1-accepted"] = measure(v1.rgba, masks, reg.fabric, v1, "A v1 accepted (no backfill)");
  report.variants["B-existing-backfill"] = measure(backfilled.rgba, masks, reg.fabric, v1, "B v1 + shipped nearest-neighbour backfill");

  const composed = {};
  const letters = { neutral: "C", cool: "D", shaded: "E" };
  for (const key of ["neutral", "cool", "shaded"]) {
    const c = compose(v1, reg.fabric, key);
    composed[key] = c;
    const m = measure(c.rgba, masks, reg.fabric, v1, `${letters[key]} v1 plates + ${FABRICS[key].name}`);
    m.armourArtworkPx = c.artworkPx;
    m.intentionalFabricPx = reg.fabricPx;
    m.residualRepairBackfillPx = m.totalMissingPx;
    report.variants[`${letters[key]}-${key}`] = m;
    write(join(OUT, `${letters[key]}-v1-plates-${key}-fabric.png`), encodePngRGBA(W, H, flatten(c.rgba, W, H)));
  }

  // side-by-side master + four-scale matrix
  const all = [["A", fV1], ["B", fB], ["C", flatten(composed.neutral.rgba, W, H)], ["D", flatten(composed.cool.rgba, W, H)], ["E", flatten(composed.shaded.rgba, W, H)]];
  { const s = strip(all.map(([, r]) => ({ w: W, h: H, rgba: r }))); write(join(OUT, "02-side-by-side-master.png"), encodePngRGBA(s.w, s.h, s.rgba)); }
  {
    const rows = [];
    for (const [w, h] of SIZES) for (const [, r] of all) rows.push({ w, h, rgba: flatten(down(r, W, H, w, h), w, h, [26, 28, 36]) });
    const s = strip(rows, 10);
    write(join(OUT, "03-four-scale-matrix.png"), encodePngRGBA(s.w, s.h, s.rgba));
  }
  const base = decodeBase();
  if (base && base.w === 512) {
    // Composite the RGBA garments, not the flattened previews: a flattened image carries an opaque
    // white background that would hide the figure entirely (it did, on the first run).
    const rgbaVariants = [v1.rgba, backfilled.rgba, composed.neutral.rgba, composed.cool.rgba, composed.shaded.rgba];
    const rows = [];
    for (const [w, h] of SIZES) for (const r of rgbaVariants) rows.push({ w, h, rgba: flatten(down(onBase(base, r), 512, 768, w, h), w, h, [26, 28, 36]) });
    const s = strip(rows, 10);
    write(join(OUT, "04-on-r2-base-matrix.png"), encodePngRGBA(s.w, s.h, s.rgba));
    report.r2Base = "rendered";
  } else report.r2Base = "SKIPPED — vendored dwebp missing";

  // masks + isolation maps
  const paint = (mask, col) => { const o = Buffer.alloc(W * H * 4); for (let i = 0; i < W * H; i++) { if (!mask[i]) { o[i * 4] = 18; o[i * 4 + 1] = 20; o[i * 4 + 2] = 26; o[i * 4 + 3] = 255; continue; } o[i * 4] = col[0]; o[i * 4 + 1] = col[1]; o[i * 4 + 2] = col[2]; o[i * 4 + 3] = 255; } return o; };
  const plateMask = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) plateMask[i] = v1.rgba[i * 4 + 3] >= OPAQUE ? 1 : 0;
  write(join(OUT, "20-fabric-mask-overlay.png"), encodePngRGBA(W, H, (() => { const o = Buffer.from(flatten(composed.neutral.rgba, W, H)); for (let i = 0; i < W * H; i++) if (reg.fabric[i]) { o[i * 4] = 255; o[i * 4 + 2] = Math.round(o[i * 4 + 2] * 0.4); } return o; })()));
  write(join(OUT, "21-plate-mask-overlay.png"), encodePngRGBA(W, H, (() => { const o = Buffer.from(flatten(composed.neutral.rgba, W, H)); for (let i = 0; i < W * H; i++) if (plateMask[i]) { o[i * 4 + 1] = 255; } return o; })()));
  write(join(OUT, "22-fabric-only.png"), encodePngRGBA(W, H, paint(reg.fabric, [150, 155, 165])));
  write(join(OUT, "23-plate-only.png"), encodePngRGBA(W, H, flatten(v1.rgba, W, H, [18, 20, 26])));
  write(join(OUT, "24-residual-backfill-only.png"), encodePngRGBA(W, H, paint(reg.residual, [255, 70, 70])));
  {
    const d = Buffer.alloc(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      let diff = false;
      for (let c = 0; c < 4; c++) if (composed.neutral.rgba[i * 4 + c] !== v1.rgba[i * 4 + c]) { diff = true; break; }
      const inFab = reg.fabric[i];
      if (diff && !inFab) { d[i * 4] = 255; }                       // violation → red
      else if (inFab) { d[i * 4] = 55; d[i * 4 + 1] = 55; d[i * 4 + 2] = 65; }
      else { d[i * 4] = 16; d[i * 4 + 1] = 18; d[i * 4 + 2] = 22; }
      d[i * 4 + 3] = 255;
    }
    write(join(OUT, "25-preserved-region-diff.png"), encodePngRGBA(W, H, d));
  }

  // 8x shoulder zooms: does the plate cover the fabric's upper junction?
  for (const [name, x0] of [["10-left-shoulder-8x.png", (seamL[620] || geo.torsoL) - 55], ["11-right-shoulder-8x.png", (seamR[620] || geo.torsoR) - 15]]) {
    const panels = [fV1, fB, ...["neutral", "cool", "shaded"].map((k) => flatten(composed[k].rgba, W, H))]
      .map((src) => crop(src, x0, 590, 70, 110, 8));
    const s = strip(panels, 10);
    write(join(OUT, name), encodePngRGBA(s.w, s.h, s.rgba));
  }

  // Does the shoulder PLATE actually cover the fabric's top edge? For each fabric column, the
  // topmost fabric row must have v1 artwork directly above it — otherwise the fabric's own edge is
  // exposed and the "plate on top" claim fails.
  let covered = 0, exposed = 0;
  for (let x = 0; x < W; x++) {
    let top = -1;
    for (let y = 0; y < H; y++) if (reg.fabric[y * W + x]) { top = y; break; }
    if (top <= 0) continue;
    (v1.rgba[((top - 1) * W + x) * 4 + 3] >= OPAQUE) ? covered++ : exposed++;
  }
  report.plateCoversFabricTop = { columnsCovered: covered, columnsExposed: exposed, pass: exposed === 0 };

  // 52x78 legibility + gradient banding for the shaded variant
  const legib = {};
  for (const key of ["neutral", "cool", "shaded"]) {
    const small = down(composed[key].rgba, W, H, 52, 78);
    let tones = new Set();
    for (let i = 0; i < 52 * 78; i++) if (small[i * 4 + 3] >= 128) tones.add(Math.round((0.299 * small[i * 4] + 0.587 * small[i * 4 + 1] + 0.114 * small[i * 4 + 2]) / 8));
    legib[key] = { distinctToneBucketsAt52x78: tones.size };
  }
  report.legibility52 = legib;

  const base0 = report.variants["B-existing-backfill"];
  const checks = [
    ["fabric is one piece per sleeve (2 components)", report.semanticSplit.fabricComponents === 2],
    ["no fabric specks", report.semanticSplit.fabricSpecks === 0],
    ["left/right balanced (>= 0.6)", report.semanticSplit.leftRightBalance >= 0.6],
    ["plate covers the fabric's top edge everywhere", exposed === 0],
    ["residual repair << previous 8608", reg.residualPx < 8608 * 0.25],
    ["v1 pixel-identical outside the fabric mask", report.variants["C-neutral"].differsFromV1OutsideFabricMask === 0],
    ["0 ink outside edit (C)", report.variants["C-neutral"].inkOutsideEdit === 0],
    ["0 ink on protect (C)", report.variants["C-neutral"].inkOnProtect === 0],
    ["single component (C)", report.variants["C-neutral"].components === 1],
    ["no halo (C)", report.variants["C-neutral"].orphanSoftPx <= 64],
  ];
  report.checks = checks.map(([name, pass]) => ({ name, pass }));
  report.automatedVerdict = checks.every(([, p]) => p) ? "ALL_AUTOMATED_CHECKS_PASS" : "AUTOMATED_CHECKS_FAILED";

  write(join(OUT, "report.json"), Buffer.from(JSON.stringify(report, null, 2) + "\n", "utf8"));
  write(join(OUT, "README.txt"), Buffer.from(readme(report), "utf8"));

  console.log("SEMANTIC SPLIT of the 8,608 mandatory gap pixels:");
  console.log(`  intentional fabric   ${reg.fabricPx}  (left ${reg.leftPx} / right ${reg.rightPx}, balance ${report.semanticSplit.leftRightBalance})`);
  console.log(`  residual REPAIR      ${reg.residualPx}`);
  console.log(`  fabric components ${fabComps.length}  largest ${fabComps[0]}  specks ${report.semanticSplit.fabricSpecks}`);
  console.log(`\nplate covers fabric top: ${covered} columns covered, ${exposed} exposed`);
  console.log(`52x78 distinct tone buckets: ${JSON.stringify(legib)}`);
  console.log("\nvariant                         missing   diff-vs-v1-outside-fabric  comps");
  for (const [k, v] of Object.entries(report.variants)) {
    console.log(`  ${k.padEnd(28)} ${String(v.totalMissingPx).padStart(7)} ${String(v.differsFromV1OutsideFabricMask).padStart(24)} ${String(v.components).padStart(6)}`);
  }
  console.log("\nchecks:");
  for (const c of report.checks) console.log(`  ${c.pass ? "✓" : "✖"} ${c.name}`);
  console.log(`\n${report.automatedVerdict}  →  ${OUT}`);
}

function readme(r) {
  const s = r.semanticSplit;
  return [
    "D-097 design POC — INTENTIONAL FABRIC UNDERLAYER",
    "Generated " + new Date().toISOString().slice(0, 10) + ". Nothing committed, nothing promoted.",
    "",
    "THE IDEA (owner): a shoulder guard is a plate that sits ON a sleeve. So build the garment in",
    "that order — fabric first, plates over it — instead of one flat drawing whose gaps are patched.",
    "",
    "WHY THIS IS NOT A RENAME OF THE OLD BACKFILL.",
    "  The shipped fill copies the NEAREST NEIGHBOUR colour, has no intent, and is applied LAST, on",
    "  top, where nothing can cover it. Here the fabric is an explicit region filled with ONE",
    "  deliberate tone, and the accepted v1 artwork is composited OVER it — so every plate edge and",
    "  outline belongs to the approved drawing.",
    "",
    "THE SEMANTIC SPLIT (this is the measurement that matters)",
    "  mandatory gap in v1        " + s.totalMandatoryGapPx + " px",
    "  -> intentional FABRIC      " + s.intentionalFabricPx + " px  (left " + s.fabricLeftPx + " / right " + s.fabricRightPx + ")",
    "  -> residual REPAIR         " + s.residualRepairBackfillPx + " px",
    "  Fabric = gap OUTBOARD of the measured armhole seam, i.e. sleeve.",
    "  Residual = gap INBOARD, torso/plate territory. Reported as repair, NOT relabelled as fabric.",
    "",
    "VARIANTS",
    "  A  accepted v1, no fill",
    "  B  v1 + the shipped nearest-neighbour backfill (the thing being replaced)",
    "  C  v1 plates + neutral dark grey fabric",
    "  D  v1 plates + cool steel grey fabric",
    "  E  v1 plates + grey with very light vertical shading",
    "  Fabric tones are derived from v1's own sleeve palette (median RGB 83/87/90), not invented.",
    "",
    "WHAT TO JUDGE — only you can decide these:",
    "  - does the shoulder plate READ as lying on top of the sleeve, or does it look like a flat fill?",
    "  - does the fabric look deliberate, or like patched-in filler?",
    "  - is the armour still clearly the Ridderdragt at 52x78, or does it read as a grey shirt again?",
    "  - is the shaded variant's gradient invisible at small sizes, or does it band?",
    "  - left/right balance",
    "",
    "FILES",
    "  A-…/B-…/C-…/D-…/E-…    the five variants at master size",
    "  02  side-by-side master   03  four-scale matrix   04  on the runtime R2 base",
    "  10/11  8x shoulder zooms (v1 | backfill | neutral | cool | shaded)",
    "  20/21  fabric- and plate-mask overlays",
    "  22/23  fabric only / plate only",
    "  24  residual repair backfill only (RED) — what fabric does NOT explain",
    "  25  preserved-region diff: RED = any pixel outside the fabric mask that differs from v1.",
    "      The image must contain NO red.",
    "  report.json  every measurement",
    "",
    "AUTOMATED VERDICT: " + r.automatedVerdict,
    "A pass here is a PRECONDITION, not an approval.",
    "",
  ].join("\n");
}

const invoked = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invoked) { try { main(); } catch (e) { console.error("✖ " + e.message); console.error(e.stack); process.exit(1); } }
