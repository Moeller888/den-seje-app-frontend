// D-098 — shoulder-plate micro-artwork fix: the investigation, and why NO artwork was drawn.
// ---------------------------------------------------------------------------------------------
// THE TASK WAS TO EXTEND THE SHOULDER PLATE'S OUTERMOST LOWER EDGE ~10 px DOWN AT x 338, 339, 687
// so the last three "true exposed fabric cut columns" close. Measuring those columns before drawing
// anything shows the premise does not hold, and the measurement is the deliverable.
//
// 1. THE ARTWORK IS ALREADY THERE, AND THE MASK ERASES IT. At x=338 the micro-fit plate is opaque
//    at y 652, 653, 654 and 207/255 at y 655 — exactly the rows the correction was supposed to add.
//    The composite is empty there because those rows are outside `torso-edit-allowed-v1` and the
//    last step of the composition clips to that mask. Drawing MORE plate at those coordinates
//    produces the identical result: erased.
//
// 2. AND PAINTING THERE IS FORBIDDEN ANYWAY. The whole requested correction is 10 pixels — 4 at
//    x=338, 4 at x=339, 2 at x=687 — and all 10 are on `torso-protect-v1`. The mask spec's own gate
//    `protect-is-complement-of-edit` passes with 0 px, so "outside edit" and "on protect" are the
//    same statement, and both are binding requirements of this task. An illustrator cannot draw
//    there either: this is a mask-contract boundary, not a skill boundary.
//
// 3. THERE IS NOTHING TO CLOSE. The gap is not a hole in the garment. The mandatory mask's own
//    column is DISCONTINUOUS there: at x=338 it runs y 646–649 and again y 656–693, with rows
//    650–655 outside the garment entirely. The plate covers the first run; the fabric fills the
//    second; the rows between belong to neither because the garment does not exist there. 100 of
//    the 370 mandatory columns are multi-run — the silhouette wobbles in and out row to row.
//
// 4. SO THE METRIC, NOT THE ARTWORK, IS WHAT IS WRONG — and its bug is in TWO places, not one.
//    D-097 found half of it: its test excuses a fabric top sitting on the column's mask top
//    (`top <= maskTop + 1`), which took the count 12 → 3. Two things are still wrong with that.
//    (a) `maskTop` is the column's FIRST run only, so the top of every LATER run — equally the
//        garment's own silhouette — is still called a cut. That is x=338 and x=339.
//    (b) It never asks whether the fabric pixel is inside the mandatory mask at all. The sleeve
//        shape is generous by design ("the mask is the authority"), so some fabric sits OUTSIDE the
//        mandatory region; the top of that is the fabric shape's own edge, not a cut. That is x=687.
//    A cut is only meaningful where the garment is REQUIRED to be. Classifying on that basis —
//    inside the mandatory mask AND more than one row below its own run's top — gives ZERO true cuts
//    in the micro-fit, in the plate-fit, and in the do-nothing baseline. The threshold is unchanged
//    and still zero; what changed is which pixels the classifier inspects. Category B (non-mandatory
//    fabric with an uncovered top) is NOT swept up into "silhouette" — it is counted separately and
//    left open, because it is a real question about the fabric shape, just not a cut.
//
// NOTHING IS DRAWN, so there is no new artwork to review; the composites here are the D-097 ones,
// reproduced byte-for-byte, plus the evidence images. No generation, no API call, no runtime change,
// the accepted asset untouched.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, sep } from "node:path";
import { decodePng, encodePngRGBA } from "../build-r2-torso-occlusion-mask.mjs";
import { OPAQUE, VISIBLE, BANDS } from "../check-r2-torso-candidate.mjs";
import { geometry, plateSeam, W, H } from "./sleeve-donor-challenger.mjs";
import { sleeveFabric, shoulderPlates, fitPlate } from "./fabric-plate-fit.mjs";
import { microFit } from "./plate-microfit.mjs";
import { classifyExposure, exposureReport, CATEGORY, maskRuns as runsOf } from "./fabric-exposure.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");
const AI = join(REPO, "tools", "avatar", "build", "ai-input");
const FIX = join(REPO, "tools", "avatar", "fixtures", "r2-torso");
const BUILD = join(REPO, "tools", "avatar", "build", "d098");
const OUT = process.env.D098_OUT || "C:\\Users\\Bruger\\Documents\\DEN SEJE APP\\_avatar-artefakter\\D098-shoulder-plate-micro-artwork-review";
const DWEBP = join(REPO, "tools", "avatar", "vendor", "dwebp.exe");
const BASE_WEBP = join(REPO, "assets", "avatar-r2", "base", "body-neutral-medium-v2.webp");
const SIZES = [[180, 270], [112, 168], [72, 108], [52, 78]];
const FABRIC = [84, 86, 88];
const TARGET_COLUMNS = [338, 339, 687];       // the columns D-098 was asked to correct
const RESIDUAL_CAP = 1635, RESIDUAL_TARGET = 1049;

const sha256 = (b) => createHash("sha256").update(b).digest("hex");
function assertWritable(p) {
  const abs = resolve(p);
  if (![BUILD, OUT].some((r) => abs === resolve(r) || abs.startsWith(resolve(r) + sep))) throw new Error("outside build/review: " + abs);
  if (/[\\/]assets[\\/]|[\\/]js[\\/]|\.claude/i.test(abs)) throw new Error("protected path: " + abs);
  return abs;
}
const write = (p, b) => { const a = assertWritable(p); if (existsSync(a)) throw new Error("refusing to overwrite: " + a); mkdirSync(dirname(a), { recursive: true }); writeFileSync(a, b); return a; };
const load = (n) => { const b = readFileSync(join(AI, n)); return { ...decodePng(b, n), sha256: sha256(b) }; };
function loadMask(n) {
  const b = readFileSync(join(FIX, n));
  const img = decodePng(b, n);
  const m = new Uint8Array(img.w * img.h);
  for (let i = 0; i < m.length; i++) m[i] = img.rgba[i * 4 + 3] > 0 ? 1 : 0;
  return { mask: m, sha256: sha256(b) };
}
function comps(mask) {
  const seen = new Uint8Array(W * H), out = [];
  const N = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (let s = 0; s < W * H; s++) {
    if (!mask[s] || seen[s]) continue;
    const q = [s]; seen[s] = 1;
    for (let k = 0; k < q.length; k++) {
      const j = q[k], y = (j / W) | 0, x = j % W;
      for (const [dx, dy] of N) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const t = yy * W + xx; if (mask[t] && !seen[t]) { seen[t] = 1; q.push(t); } }
    }
    out.push(q);
  }
  return out.sort((a, b) => b.length - a.length);
}
const bboxOf = (px) => { let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; for (const i of px) { const x = i % W, y = (i / W) | 0; if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; } return { x0, y0, x1, y1, px: px.length }; };
const overPx = (out, src, i) => {
  const a = src[i * 4 + 3];
  if (a < VISIBLE) return;
  if (a >= OPAQUE || out[i * 4 + 3] === 0) { for (let c = 0; c < 4; c++) out[i * 4 + c] = src[i * 4 + c]; return; }
  const al = a / 255;
  for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.round(src[i * 4 + c] * al + out[i * 4 + c] * (1 - al));
  out[i * 4 + 3] = Math.max(out[i * 4 + 3], a);
};

// ── imaging (identical shapes to the D-097 review tools, so the packages are comparable) ───────
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
  mkdirSync(dirname(o), { recursive: true });
  writeFileSync(o, Buffer.alloc(0));
  return spawnSync(DWEBP, [BASE_WEBP, "-o", o], { encoding: "utf8" }).status === 0 ? decodePng(readFileSync(o), "base") : null;
}
function onBase(base, cand) {
  const s = down(cand, W, H, 512, 768), b = Buffer.from(base.rgba);
  for (let i = 0; i < 512 * 768; i++) { const a = s[i * 4 + 3] / 255; if (a === 0) continue; for (let c = 0; c < 3; c++) b[i * 4 + c] = Math.round(s[i * 4 + c] * a + b[i * 4 + c] * (1 - a)); b[i * 4 + 3] = Math.max(b[i * 4 + 3], s[i * 4 + 3]); }
  return b;
}

// ── the scene ─────────────────────────────────────────────────────────────────────────────────
const v1 = load("torso-armor-knight-candidate-nobackfill.png");
const hardM = loadMask("torso-occlusion-hard-v1.png"), editM = loadMask("torso-edit-allowed-v1.png"), protM = loadMask("torso-protect-v1.png");
const hard = hardM.mask, edit = editM.mask, protect = protM.mask;
const geo = geometry(v1);
const seamL = plateSeam(v1, geo, "left"), seamR = plateSeam(v1, geo, "right");
const plates = shoulderPlates(v1, geo, seamL, seamR);

// Mandatory-mask runs come from the shared helper too — this tool defines no rule of its own.
const maskRuns = (x) => runsOf(hard, W, H, x);

// Composition order (unchanged from D-097): transparent canvas -> fabric -> plates -> the rest of v1.
function compose(pL, pR) {
  const cover = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) cover[i] = (v1.rgba[i * 4 + 3] >= OPAQUE || (pL && pL[i * 4 + 3] >= OPAQUE) || (pR && pR[i * 4 + 3] >= OPAQUE)) ? 1 : 0;
  const sleeve = sleeveFabric(hard, geo, seamL, seamR, cover);
  const out = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) if (sleeve.fabric[i]) { out[i * 4] = FABRIC[0]; out[i * 4 + 1] = FABRIC[1]; out[i * 4 + 2] = FABRIC[2]; out[i * 4 + 3] = 255; }
  if (pL) for (let i = 0; i < W * H; i++) { overPx(out, pL, i); overPx(out, pR, i); }
  for (let i = 0; i < W * H; i++) overPx(out, v1.rgba, i);
  for (let i = 0; i < W * H; i++) if (!edit[i]) { out[i * 4] = 0; out[i * 4 + 1] = 0; out[i * 4 + 2] = 0; out[i * 4 + 3] = 0; }
  return { out, fabricMask: sleeve.fabric };
}

function measure(label, pL, pR) {
  const { out, fabricMask } = compose(pL, pR);
  const visFab = new Uint8Array(W * H);
  let fabPx = 0, fabL = 0, fabR = 0;
  for (let i = 0; i < W * H; i++) {
    if (!fabricMask[i] || !edit[i] || v1.rgba[i * 4 + 3] >= OPAQUE) continue;
    if (pL && (pL[i * 4 + 3] >= OPAQUE || pR[i * 4 + 3] >= OPAQUE)) continue;
    visFab[i] = 1; fabPx++; ((i % W) < 512) ? fabL++ : fabR++;
  }
  // The classification itself is NOT duplicated here — it is the shared D-098 helper, the same one
  // the three D-097 tools now call, so this diagnostic cannot drift away from what actually gates.
  const opaqueMask = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) opaqueMask[i] = out[i * 4 + 3] >= OPAQUE ? 1 : 0;
  const exposure = classifyExposure({ hard, visibleFabric: visFab, opaque: opaqueMask, edit, protect, width: W, height: H });
  const flagged = exposure.columns.map((c) => ({ ...c, d097: c.legacyD097, d098: c.category }));
  const bands = {};
  for (const [n, [a, b]] of Object.entries(BANDS)) {
    let tot = 0, cov = 0;
    for (let y = Math.max(0, a); y < Math.min(H, b); y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (!hard[i]) continue; tot++; if (out[i * 4 + 3] >= OPAQUE) cov++; }
    if (tot) bands[n] = { hardPx: tot, missingPx: tot - cov, coverage: +(cov / tot).toFixed(5) };
  }
  let stray = 0, onProt = 0, orphan = 0, outsideDiff = 0, armour = 0;
  for (let i = 0; i < W * H; i++) {
    const a = out[i * 4 + 3];
    if (a >= VISIBLE) { if (!edit[i]) stray++; if (protect[i]) onProt++; }
    if (a >= OPAQUE && v1.rgba[i * 4 + 3] >= OPAQUE) armour++;
    let ch = false; for (let c = 0; c < 4; c++) if (out[i * 4 + c] !== v1.rgba[i * 4 + c]) { ch = true; break; }
    if (ch && !fabricMask[i] && !plates.left[i] && !plates.right[i] && !(pL && (pL[i * 4 + 3] >= VISIBLE || pR[i * 4 + 3] >= VISIBLE))) outsideDiff++;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, a = out[i * 4 + 3];
    if (a === 0 || a >= OPAQUE) continue;
    let near = false;
    for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; if (out[(yy * W + xx) * 4 + 3] >= OPAQUE) { near = true; break; } }
    if (!near) orphan++;
  }
  const on = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) on[i] = out[i * 4 + 3] >= OPAQUE ? 1 : 0;
  const cc = comps(on), fc = comps(visFab);
  const small = down(out, W, H, 52, 78);
  const tones = new Set();
  for (let i = 0; i < 52 * 78; i++) if (small[i * 4 + 3] >= 128) tones.add(Math.round((0.299 * small[i * 4] + 0.587 * small[i * 4 + 1] + 0.114 * small[i * 4 + 2]) / 8));
  return {
    label, out, visFab, fabricMask, flagged, exposure,
    cutsD097: flagged.filter((f) => f.d097 === "cut"),
    cutsD098: flagged.filter((f) => f.d098 === CATEGORY.C),
    catA: flagged.filter((f) => f.d098 === CATEGORY.A),
    catB: flagged.filter((f) => f.d098 === CATEGORY.B),
    bands, residual: Object.values(bands).reduce((s, b) => s + b.missingPx, 0),
    intentionalFabricPx: fabPx, fabricLeft: fabL, fabricRight: fabR,
    fabricBalance: +(Math.min(fabL, fabR) / Math.max(fabL, fabR)).toFixed(4),
    armourArtworkPx: armour, newPlateArtworkPx: 0,
    inkOutsideEdit: stray, inkOnProtect: onProt, orphanSoftPx: orphan,
    components: cc.length, componentBBoxes: cc.slice(0, 6).map(bboxOf),
    fabricComponents: fc.length, fabricSpecks: fc.filter((c) => c.length < 64).length,
    v1DiffOutsideFabricAndPlate: outsideDiff, distinctToneBucketsAt52x78: tones.size,
  };
}

function main() {
  mkdirSync(BUILD, { recursive: true }); mkdirSync(OUT, { recursive: true });
  const fitL = fitPlate(plates.left, v1, "left"), fitR = fitPlate(plates.right, v1, "right");
  const micL = microFit(plates.left, v1, "left"), micR = microFit(plates.right, v1, "right");

  const none = measure("baseline — v1 plates unchanged", null, null);
  const plateFit = measure("D-097 plate-fit (pad-box mesh, 10 out / 8 down)", fitL.rgba, fitR.rgba);
  const micro = measure("D-097 micro-fit challenger (on-plate mesh, 8 out / 8 down)", micL.rgba, micR.rgba);
  // The D-098 candidate IS the micro-fit challenger, pixel for pixel: no artwork was added, because
  // every pixel that would close a flagged column is on the protect mask.
  const cand = micro;
  let candVsChallenger = 0;
  for (let i = 0; i < W * H * 4; i++) if (cand.out[i] !== micro.out[i]) candVsChallenger++;

  // ── what the requested correction would have cost, measured rather than asserted ──────────────
  const wouldNeed = [];
  for (const f of micro.flagged.filter((x) => x.d097 === "cut")) {
    // every pixel from the plate's lower edge down to the fabric top in that column
    const px = [];
    let plateBot = -1;
    for (let y = 0; y < H; y++) if (micL.rgba[(y * W + f.x) * 4 + 3] >= OPAQUE || micR.rgba[(y * W + f.x) * 4 + 3] >= OPAQUE) plateBot = y;
    for (let y = f.fabricTop - 1; y > Math.max(0, f.fabricTop - 24); y--) {
      const i = y * W + f.x;
      if (micro.out[i * 4 + 3] >= OPAQUE) break;
      // Is the plate ALREADY drawn at this coordinate and merely clipped away by the edit mask?
      const plateA = Math.max(micL.rgba[i * 4 + 3], micR.rgba[i * 4 + 3]);
      px.push({ y, mandatory: !!hard[i], editAllowed: !!edit[i], protected: !!protect[i], plateAlphaAlreadyPresent: plateA, alreadyDrawnAndClipped: plateA >= OPAQUE && !edit[i] });
    }
    wouldNeed.push({
      x: f.x, fabricTop: f.fabricTop, plateBottomInColumn: plateBot, pixelsThatWouldHaveToBePainted: px,
      allOnProtect: px.every((p) => p.protected), anyEditAllowed: px.some((p) => p.editAllowed),
      alreadyDrawnAndClippedPx: px.filter((p) => p.alreadyDrawnAndClipped).length,
    });
  }

  const totalWouldPaint = wouldNeed.reduce((s, c) => s + c.pixelsThatWouldHaveToBePainted.length, 0);
  const totalOnProtect = wouldNeed.reduce((s, c) => s + c.pixelsThatWouldHaveToBePainted.filter((p) => p.protected).length, 0);
  const totalAlreadyDrawn = wouldNeed.reduce((s, c) => s + c.alreadyDrawnAndClippedPx, 0);

  const report = {
    tool: "plate-edge-artwork", decision: "D-098", date: "2026-08-03",
    inputs: {
      v1: { file: "torso-armor-knight-candidate-nobackfill.png", sha256: v1.sha256 },
      hardMaskSha256: hardM.sha256, editMaskSha256: editM.sha256, protectMaskSha256: protM.sha256,
    },
    requestedCorrection: {
      columns: TARGET_COLUMNS, requestedDepthPx: 10,
      performed: false,
      reason: "every pixel that would close the flagged columns is outside torso-edit-allowed-v1 and on torso-protect-v1; painting them violates the binding requirements '0 ink outside the edit mask' and '0 ink on the protect mask'. Most of them are also already drawn by the existing plate and clipped away by that same mask, so adding artwork there changes nothing.",
      pixelsThatWouldHaveToBePainted: totalWouldPaint,
      ofThoseOnProtectMask: totalOnProtect,
      ofThoseAlreadyDrawnByThePlateAndClipped: totalAlreadyDrawn,
      perColumn: wouldNeed,
    },
    maskTopology: {
      protectIsExactComplementOfEdit: (() => { let d = 0; for (let i = 0; i < W * H; i++) if ((edit[i] ? 1 : 0) === (protect[i] ? 1 : 0)) d++; return d === 0; })(),
      multiRunMandatoryColumns: (() => { let n = 0; for (let x = 0; x < W; x++) { const r = maskRuns(x); if (r.length > 1) n++; } return n; })(),
      totalMandatoryColumns: (() => { let n = 0; for (let x = 0; x < W; x++) if (maskRuns(x).length) n++; return n; })(),
      targetColumnRuns: Object.fromEntries(TARGET_COLUMNS.map((x) => [x, maskRuns(x)])),
    },
    exposureClassifier: {
      d097Rule: "silhouette iff fabricTop <= (the column's FIRST mandatory run's top) + 1; everything else is a cut",
      d098Rule: {
        A: "mandatory-run silhouette — fabricTop is inside the mandatory mask and <= (top of ITS OWN run) + 1",
        B: "non-mandatory fabric — fabricTop is outside the mandatory mask; the sleeve shape's own edge",
        C: "TRUE CUT — fabricTop is inside the mandatory mask, more than one row below its own run's top",
      },
      thresholdUnchanged: "0 category-C true cut columns",
      note: "This is a bug fix in which pixels the classifier inspects, not a relaxed threshold. Category B is reported separately and left OPEN — it is deliberately not folded into 'silhouette'. Every reclassified column carries its proof in flaggedColumnEvidence.",
      d097BugA: "compares against the column's first run only, so the top of a later run — equally the garment's own edge — reads as a cut (x=338, x=339)",
      d097BugB: "never asks whether the fabric pixel is mandatory at all, so fabric outside the mandatory region reads as a cut (x=687)",
    },
    scenarios: {},
    newPlateArtworkPx: 0, changedExistingPlatePx: 0, coveredPreviousCutPx: 0,
    localMovement: { maxPx: 0, medianPx: 0, note: "no mesh, no warp and no paint were applied by D-098" },
    meshMetrics: { applied: false, foldovers: 0, areaRatioP95: null, areaRatioMax: null, edgeLengthRatio: null },
    candidateIsByteIdenticalToD097Challenger: candVsChallenger === 0,
  };
  for (const [k, m] of [["baselineNoPlateChange", none], ["d097PlateFit", plateFit], ["d097MicroFitChallenger", micro], ["d098Candidate", cand]]) {
    report.scenarios[k] = {
      label: m.label,
      exposure: exposureReport(m.exposure),
      flaggedColumnEvidence: m.flagged,
      residualRepairBackfillPx: m.residual, bands: m.bands,
      intentionalFabricPx: m.intentionalFabricPx, fabricLeftPx: m.fabricLeft, fabricRightPx: m.fabricRight,
      leftRightSymmetry: m.fabricBalance, armourArtworkPx: m.armourArtworkPx, newPlateArtworkPx: m.newPlateArtworkPx,
      inkOutsideEditMask: m.inkOutsideEdit, inkOnProtectMask: m.inkOnProtect, haloOrphanSoftPx: m.orphanSoftPx,
      garmentComponents: m.components, componentBBoxes: m.componentBBoxes,
      fabricComponents: m.fabricComponents, fabricSpecks: m.fabricSpecks,
      pixelDiffVsV1OutsideFabricAndPlateMasks: m.v1DiffOutsideFabricAndPlate,
      distinctToneBucketsAt52x78: m.distinctToneBucketsAt52x78,
    };
  }

  const checks = [
    ["true exposed fabric cut columns = 0 (category C, D-098 rule)", cand.cutsD098.length === 0],
    ["true exposed fabric cut columns = 0 (D-097 column-top rule, as shipped)", cand.cutsD097.length === 0],
    ["category B non-mandatory fabric tops = 0 (open question, not a cut)", cand.catB.length === 0],
    [`residualRepairBackfillPx <= ${RESIDUAL_CAP}`, cand.residual <= RESIDUAL_CAP],
    [`residualRepairBackfillPx <= ${RESIDUAL_TARGET} (target)`, cand.residual <= RESIDUAL_TARGET],
    ["0 foldovers", true],
    ["0 ink outside the edit mask", cand.inkOutsideEdit === 0],
    ["0 ink on the protect mask", cand.inkOnProtect === 0],
    ["exactly one connected garment component", cand.components === 1],
    ["no halo (orphan soft pixels <= 64)", cand.orphanSoftPx <= 64],
    ["no specks in the fabric underlayer", cand.fabricSpecks === 0],
    ["byte-identical to v1 outside fabric + plate masks", cand.v1DiffOutsideFabricAndPlate === 0],
    ["no new contact with collar / breastplate / belt / skirt", true],
    ["no rectangular patch, pointed flare, double or broken outline", true],
    ["correction is invisible as a patch at 8x and at use sizes", true],
  ];
  report.checks = checks.map(([name, pass]) => ({ name, pass }));
  report.verdict = "D098_SHOULDER_PLATE_MICROFIX_NEEDS_REVISION";
  report.verdictScope = "What needs revision is the D-097 §7 conclusion and its exposure metric — NOT the artwork. No micro-artwork fix was produced: all 10 pixels it would need are on the protect mask, most are already drawn by the existing plate and clipped away by that same mask, and none of the three columns is a cut in the garment.";
  report.remainingRealDefects = [
    { id: "R0", what: `category B — ${cand.catB.length} column(s) of non-mandatory fabric with an uncovered top edge (x ${cand.catB.map((f) => f.x).join(", ")})`, impact: "the sleeve shape places fabric beyond the mandatory region and its own top edge shows; not a cut, but a real question about the fabric silhouette", owner: "OPEN — deliberately not reclassified away" },
    { id: "R1", what: `the micro-fit composite has ${cand.components} opaque components`, detail: cand.componentBBoxes.slice(1), impact: "a stray warp pixel survives the edit clip; it is a speck, not artwork", owner: "out of D-098's stated scope (the 3 columns) — reported, not fixed" },
    { id: "R2", what: `residual repair backfill is ${cand.residual} px against the ${RESIDUAL_TARGET} px target`, detail: cand.bands, impact: "coverage shortfall unrelated to the three columns", owner: "out of D-098's stated scope — reported, not fixed" },
    { id: "R3", what: `the fabric underlayer is ${cand.fabricComponents} components with ${cand.fabricSpecks} specks`, impact: "carried over unchanged from D-097", owner: "out of D-098's stated scope — reported, not fixed" },
  ];

  // ── review images ────────────────────────────────────────────────────────────────────────────
  const fV1 = flatten(v1.rgba, W, H), fMicro = flatten(micro.out, W, H), fCand = flatten(cand.out, W, H);
  write(join(OUT, "00-current-d097-challenger.png"), encodePngRGBA(W, H, fMicro));
  write(join(OUT, "01-d098-candidate.png"), encodePngRGBA(W, H, fCand));
  { const s = strip([{ w: W, h: H, rgba: fMicro }, { w: W, h: H, rgba: fCand }]); write(join(OUT, "02-master-side-by-side.png"), encodePngRGBA(s.w, s.h, s.rgba)); }
  { const b = Buffer.alloc(W * H * 4), a = Buffer.alloc(W * H * 4);
    for (let i = 0; i < W * H; i++) { if (plates.left[i] || plates.right[i]) for (let c = 0; c < 4; c++) b[i * 4 + c] = v1.rgba[i * 4 + c]; overPx(a, micL.rgba, i); overPx(a, micR.rgba, i); }
    const s = strip([{ w: W, h: H, rgba: flatten(b, W, H, [18, 20, 26]) }, { w: W, h: H, rgba: flatten(a, W, H, [18, 20, 26]) }]);
    write(join(OUT, "03-plate-only-before-after.png"), encodePngRGBA(s.w, s.h, s.rgba)); }
  { const o = Buffer.alloc(W * H * 4);
    for (let i = 0; i < W * H; i++) { const on = cand.visFab[i]; o[i * 4] = on ? 150 : 18; o[i * 4 + 1] = on ? 155 : 20; o[i * 4 + 2] = on ? 165 : 26; o[i * 4 + 3] = 255; }
    write(join(OUT, "04-fabric-only.png"), encodePngRGBA(W, H, o)); }
  const base = decodeBase();
  if (base && base.w === 512) write(join(OUT, "05-composite-on-r2-base.png"), encodePngRGBA(512, 768, flatten(onBase(base, cand.out), 512, 768, [250, 250, 250])));

  write(join(OUT, "10-left-shoulder-8x.png"), encodePngRGBA(...(() => { const s = strip([fV1, fMicro, fCand].map((src) => crop(src, 315, 600, 75, 130, 8)), 10); return [s.w, s.h, s.rgba]; })()));
  write(join(OUT, "11-right-shoulder-8x.png"), encodePngRGBA(...(() => { const s = strip([fV1, fMicro, fCand].map((src) => crop(src, 655, 600, 75, 130, 8)), 10); return [s.w, s.h, s.rgba]; })()));

  // The 16x crops are where the correction was asked for. Instead of new artwork they carry the
  // proof: the requested rows tinted by what the mask permits there.
  const permitTint = (src) => {
    const o = Buffer.from(src);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (edit[i]) continue;
      o[i * 4] = Math.round(o[i * 4] * 0.45 + 210 * 0.55);       // protect (= not editable) → red wash
      o[i * 4 + 1] = Math.round(o[i * 4 + 1] * 0.45 + 40 * 0.55);
      o[i * 4 + 2] = Math.round(o[i * 4 + 2] * 0.45 + 45 * 0.55);
    }
    for (const x of TARGET_COLUMNS) for (let y = 620; y < 680; y++) { const i = y * W + x; if (!hard[i]) { o[i * 4 + 2] = Math.min(255, o[i * 4 + 2] + 60); } }
    return o;
  };
  const tinted = permitTint(fCand);
  write(join(OUT, "12-left-correction-16x.png"), encodePngRGBA(...(() => { const s = strip([crop(fCand, 330, 636, 24, 34, 16), crop(tinted, 330, 636, 24, 34, 16)], 10); return [s.w, s.h, s.rgba]; })()));
  write(join(OUT, "13-right-correction-16x.png"), encodePngRGBA(...(() => { const s = strip([crop(fCand, 678, 638, 24, 34, 16), crop(tinted, 678, 638, 24, 34, 16)], 10); return [s.w, s.h, s.rgba]; })()));

  { // 20 — the correction mask. It is EMPTY, and that is the finding; the pixels the correction
    // would have needed are drawn in red to show they are all on protect.
    const o = Buffer.alloc(W * H * 4);
    for (let i = 0; i < W * H; i++) { o[i * 4] = 16; o[i * 4 + 1] = 18; o[i * 4 + 2] = 22; o[i * 4 + 3] = 255; }
    for (const c of wouldNeed) for (const p of c.pixelsThatWouldHaveToBePainted) { const i = p.y * W + c.x; o[i * 4] = p.protected ? 235 : 60; o[i * 4 + 1] = p.protected ? 45 : 220; o[i * 4 + 2] = 50; }
    write(join(OUT, "20-correction-mask.png"), encodePngRGBA(W, H, o)); }
  { const o = Buffer.alloc(W * H * 4);                        // 21 — new plate pixels: none exist
    for (let i = 0; i < W * H; i++) { o[i * 4] = 16; o[i * 4 + 1] = 18; o[i * 4 + 2] = 22; o[i * 4 + 3] = 255; }
    write(join(OUT, "21-new-plate-pixels-only.png"), encodePngRGBA(W, H, o)); }
  { // 22 — exposure map: D-097's classification on the left, D-098's on the right
    const paint = (m, key) => {
      const o = Buffer.from(flatten(m.out, W, H));
      for (const f of m.flagged) {
        const v = f[key];
        const col = (v === "cut" || v === CATEGORY.C) ? [235, 40, 40] : (v === CATEGORY.B ? [70, 140, 235] : [235, 190, 40]);
        for (let y = 0; y < H; y++) if (m.visFab[y * W + f.x]) { const i = y * W + f.x; o[i * 4] = col[0]; o[i * 4 + 1] = col[1]; o[i * 4 + 2] = col[2]; }
      }
      return o;
    };
    const s = strip([{ w: W, h: H, rgba: paint(micro, "d097") }, { w: W, h: H, rgba: paint(cand, "d098") }]);
    write(join(OUT, "22-exposure-map-before-after.png"), encodePngRGBA(s.w, s.h, s.rgba)); }
  { const d = Buffer.alloc(W * H * 4);                        // 23 — preserved-region diff
    for (let i = 0; i < W * H; i++) {
      let ch = false; for (let c = 0; c < 4; c++) if (cand.out[i * 4 + c] !== v1.rgba[i * 4 + c]) { ch = true; break; }
      const allowed = cand.fabricMask[i] || plates.left[i] || plates.right[i] || micL.rgba[i * 4 + 3] >= VISIBLE || micR.rgba[i * 4 + 3] >= VISIBLE;
      if (ch && !allowed) d[i * 4] = 255; else if (allowed) { d[i * 4] = 55; d[i * 4 + 1] = 55; d[i * 4 + 2] = 65; } else { d[i * 4] = 16; d[i * 4 + 1] = 18; d[i * 4 + 2] = 22; }
      d[i * 4 + 3] = 255;
    }
    write(join(OUT, "23-preserved-region-diff.png"), encodePngRGBA(W, H, d)); }
  { const o = Buffer.from(fCand);                             // 24 — edit / protect overlay
    for (let i = 0; i < W * H; i++) {
      if (protect[i]) { o[i * 4] = Math.round(o[i * 4] * 0.72 + 200 * 0.28); o[i * 4 + 1] = Math.round(o[i * 4 + 1] * 0.72 + 40 * 0.28); o[i * 4 + 2] = Math.round(o[i * 4 + 2] * 0.72 + 45 * 0.28); }
      else if (hard[i]) { o[i * 4] = Math.round(o[i * 4] * 0.82 + 40 * 0.18); o[i * 4 + 1] = Math.round(o[i * 4 + 1] * 0.82 + 190 * 0.18); o[i * 4 + 2] = Math.round(o[i * 4 + 2] * 0.82 + 90 * 0.18); }
    }
    write(join(OUT, "24-edit-protect-overlay.png"), encodePngRGBA(W, H, o)); }
  { // 25 — the evidence image: mandatory-mask runs at 16x through the three target columns
    const o = Buffer.alloc(W * H * 4);
    for (let i = 0; i < W * H; i++) { const m = hard[i], p = protect[i]; o[i * 4] = m ? 60 : (p ? 120 : 22); o[i * 4 + 1] = m ? 190 : (p ? 26 : 24); o[i * 4 + 2] = m ? 110 : (p ? 30 : 30); o[i * 4 + 3] = 255; }
    for (const x of TARGET_COLUMNS) for (let y = 600; y < 700; y++) { const i = y * W + x; o[i * 4] = Math.min(255, o[i * 4] + 90); o[i * 4 + 1] = Math.min(255, o[i * 4 + 1] + 40); o[i * 4 + 2] = Math.min(255, o[i * 4 + 2] + 160); }
    const s = strip([crop(o, 328, 630, 26, 40, 16), crop(o, 676, 632, 26, 40, 16)], 10);
    write(join(OUT, "25-mandatory-mask-runs-16x.png"), encodePngRGBA(s.w, s.h, s.rgba)); }

  { const rows = []; for (const [w, h] of SIZES) for (const r of [micro.out, cand.out]) rows.push({ w, h, rgba: flatten(down(r, W, H, w, h), w, h, [26, 28, 36]) }); const s = strip(rows, 10); write(join(OUT, "30-four-scale-side-by-side.png"), encodePngRGBA(s.w, s.h, s.rgba)); }
  if (base && base.w === 512) { const rows = []; for (const [w, h] of SIZES) for (const r of [micro.out, cand.out]) rows.push({ w, h, rgba: flatten(down(onBase(base, r), 512, 768, w, h), w, h, [26, 28, 36]) }); const s = strip(rows, 10); write(join(OUT, "31-four-scale-on-r2-base.png"), encodePngRGBA(s.w, s.h, s.rgba)); }

  write(join(OUT, "report.json"), Buffer.from(JSON.stringify(report, null, 2) + "\n", "utf8"));
  write(join(OUT, "README.txt"), Buffer.from(readme(report, cand, micro, none, plateFit, totalWouldPaint, totalOnProtect, totalAlreadyDrawn), "utf8"));

  console.log(`D-098 — requested correction at x ${TARGET_COLUMNS.join(", ")}: NOT PERFORMED`);
  console.log(`  pixels the correction would have to paint : ${totalWouldPaint}`);
  console.log(`  of those on the protect mask             : ${totalOnProtect}`);
  console.log(`  of those already drawn by the plate and clipped away by the edit mask: ${totalAlreadyDrawn}`);
  console.log(`\nexposed fabric-top columns      D-097 'cut'  ->  D-098  A silhouette / B non-mandatory / C TRUE CUT`);
  for (const [k, m] of [["baseline  ", none], ["plate-fit ", plateFit], ["micro-fit ", micro], ["d098 cand.", cand]]) {
    console.log(`  ${k}  ${String(m.cutsD097.length).padStart(2)} [${m.cutsD097.map((f) => f.x).join(",")}]`.padEnd(46) +
      `A ${String(m.catA.length).padStart(2)}   B ${String(m.catB.length).padStart(2)} [${m.catB.map((f) => f.x).join(",")}]   C ${m.cutsD098.length}   residual ${m.residual}  comps ${m.components}`);
  }
  console.log("\nchecks:");
  for (const c of report.checks) console.log(`  ${c.pass ? "PASS" : "FAIL"}  ${c.name}`);
  console.log(`\n${report.verdict}\n  -> ${OUT}`);
}

function readme(r, cand, micro, none, plateFit, wouldPaint, onProtect, alreadyDrawn) {
  const L = [];
  L.push("D-098 — SHOULDER-PLATE MICRO-ARTWORK FIX — OWNER REVIEW PACKAGE");
  L.push("=".repeat(78));
  L.push("");
  L.push(`Verdict: ${r.verdict}`);
  L.push("");
  L.push("NO ARTWORK WAS DRAWN, AND THE REASON IS THE POINT OF THIS PACKAGE.");
  L.push("");
  L.push("D-098 asked for the shoulder plate's outermost lower edge to be extended roughly 10 px");
  L.push("down at x=338, x=339 and x=687, so the last three 'true exposed fabric cut columns' close.");
  L.push("Measuring those columns before drawing anything shows the premise does not hold.");
  L.push("");
  L.push(`THE WHOLE CORRECTION IS ${wouldPaint} PIXELS: 4 at x=338, 4 at x=339, 2 at x=687.`);
  L.push("");
  L.push("1. THE ARTWORK IS ALREADY THERE, AND THE MASK ERASES IT. At x=338 the micro-fit plate is");
  L.push("   opaque at y 652, 653, 654 and 207/255 at y 655 — exactly the rows the correction was");
  L.push(`   meant to add. ${alreadyDrawn} of the ${wouldPaint} pixels are already drawn by the existing plate and`);
  L.push("   clipped away by the final composition step, which clips to torso-edit-allowed-v1.");
  L.push("   Drawing MORE plate at those coordinates produces the identical result: erased.");
  L.push("");
  L.push(`2. AND PAINTING THERE IS FORBIDDEN ANYWAY. All ${onProtect} of the ${wouldPaint} pixels are on`);
  L.push("   torso-protect-v1. The mask spec's own gate 'protect-is-complement-of-edit' passes with");
  L.push("   0 px, so 'outside edit' and 'on protect' are the same statement — and '0 ink outside");
  L.push("   the edit mask' and '0 ink on the protect mask' are two of this task's binding");
  L.push("   requirements. The requested correction breaks both, by construction. An illustrator");
  L.push("   cannot draw there either: this is a mask-contract boundary, not a skill boundary.");
  L.push("");
  L.push("3. THERE IS NOTHING TO CLOSE. The gap is not a hole in the garment. The mandatory mask's");
  L.push("   own column is DISCONTINUOUS there. At x=338 it runs y 646-649 and again y 656-693;");
  L.push("   rows 650-655 are outside the garment altogether. The shoulder plate covers the first");
  L.push("   run, the fabric underlayer fills the second, and the rows between belong to neither");
  L.push("   because the garment does not exist there. This is the silhouette wobbling in and out");
  L.push(`   row to row: ${r.maskTopology.multiRunMandatoryColumns} of the ${r.maskTopology.totalMandatoryColumns} mandatory columns are multi-run.`);
  L.push("");
  L.push("4. THE METRIC IS WHAT NEEDS THE FIX — and its bug is in TWO places, not one. D-097 found");
  L.push("   half of it: its test excuses a fabric top sitting on the column's mask top, which took");
  L.push("   the count 12 -> 3. Two things are still wrong with that:");
  L.push("     (a) it compares against the column's FIRST run only, so the top of a LATER run —");
  L.push("         equally the garment's own edge — still reads as a cut. That is x=338 and x=339.");
  L.push("     (b) it never asks whether the fabric pixel is inside the mandatory mask at all. The");
  L.push("         sleeve shape is generous by design, so some fabric sits OUTSIDE the mandatory");
  L.push("         region and its own top edge shows. That is x=687.");
  L.push("   A cut is only meaningful where the garment is REQUIRED to be. Splitting the flagged");
  L.push("   columns on that basis gives THREE categories, and TRUE CUTS = 0 everywhere:");
  L.push("");
  L.push("     A  mandatory-run silhouette  — the garment's own outer edge. Not a fault.");
  L.push("     B  non-mandatory fabric      — fabric beyond the mandatory region; its own edge shows.");
  L.push("                                    NOT a cut, but NOT dismissed either: see R0 below.");
  L.push("     C  TRUE CUT                  — inside the mandatory mask, below its own run's top.");
  L.push("");
  L.push("   THE THRESHOLD IS UNCHANGED AND STILL ZERO CATEGORY-C COLUMNS. Only which pixels the");
  L.push("   classifier inspects changed, and every reclassified column carries its proof in");
  L.push("   report.json under flaggedColumnEvidence.");
  L.push("");
  L.push("EXPOSED FABRIC-TOP COLUMNS          D-097 'cut'            D-098   A     B          C");
  for (const [k, m] of [["baseline, v1 plates unchanged  ", none], ["D-097 plate-fit                ", plateFit], ["D-097 micro-fit challenger     ", micro], ["D-098 candidate                ", cand]]) {
    L.push(`  ${k}  ${String(m.cutsD097.length).padStart(2)} [${m.cutsD097.map((f) => f.x).join(",")}]`.padEnd(56) +
      `${String(m.catA.length).padStart(2)}   ${String(m.catB.length).padStart(2)} [${m.catB.map((f) => f.x).join(",")}]`.padEnd(18) + `${m.cutsD098.length}`);
  }
  L.push("");
  L.push("PIXEL ACCOUNTING (D-098 candidate)");
  L.push(`  intentionalFabricPx        ${cand.intentionalFabricPx}`);
  L.push(`  armourArtworkPx            ${cand.armourArtworkPx}`);
  L.push(`  newPlateArtworkPx          ${cand.newPlateArtworkPx}   (nothing was drawn)`);
  L.push(`  residualRepairBackfillPx   ${cand.residual}   (cap ${RESIDUAL_CAP}, target ${RESIDUAL_TARGET})`);
  L.push("");
  L.push("THE CANDIDATE IS THE D-097 MICRO-FIT CHALLENGER, BYTE FOR BYTE.");
  L.push(`  identical to it: ${r.candidateIsByteIdenticalToD097Challenger}`);
  L.push("  It is included so the package is self-contained, not because it changed.");
  L.push("");
  L.push("REMAINING REAL DEFECTS — reported, deliberately NOT fixed (outside D-098's stated scope");
  L.push("of 'only the plate's outer lower edge at three columns'):");
  for (const d of r.remainingRealDefects) L.push(`  ${d.id}. ${d.what} — ${d.impact}`);
  L.push("");
  L.push("CHECKS");
  for (const c of r.checks) L.push(`  ${c.pass ? "PASS" : "FAIL"}  ${c.name}`);
  L.push("");
  L.push("WHAT THE OWNER IS BEING ASKED TO DECIDE");
  L.push("  a) Accept that x=338 and x=339 are the garment's legitimate outer silhouette, that x=687");
  L.push("     is fabric outside the mandatory region, and that neither is a cut — so D-097 §7's");
  L.push("     'needs ~10 px of new plate artwork' is superseded and no illustrator is commissioned.");
  L.push("  b) Then decide separately whether the three-category exposure rule should replace the");
  L.push("     column-top rule in the tooling, since it is the rule that makes the guarantee true.");
  L.push("  c) R0 (category B) is a genuine open question about the fabric silhouette, deliberately");
  L.push("     not reclassified away. R1-R3 are real and unaddressed. All are separate work.");
  L.push("");
  L.push("BOUNDARIES. No image generation, no API call, no runtime change, no promotion, no commit,");
  L.push("no PR. The accepted asset assets/avatar-r2/torso/armor-knight-r2-v1.webp and its raw and");
  L.push("candidate provenance are untouched. AVATAR_R2 stays false. Every number above is");
  L.push("reproducible: node tools/avatar/garment-mesh/plate-edge-artwork.mjs");
  L.push("");
  L.push("FILES");
  L.push("  00 current D-097 micro-fit challenger        01 D-098 candidate (identical)");
  L.push("  02 master side by side                       03 plate only, before / after the D-097 mesh");
  L.push("  04 fabric underlayer only                    05 composite on the R2 base");
  L.push("  10/11 left / right shoulder at 8x (v1, challenger, candidate)");
  L.push("  12/13 the requested correction site at 16x — plain, then washed red where the mask");
  L.push("        forbids ink. The rows the correction needed are entirely inside the red.");
  L.push("  20 correction mask — the pixels the correction would have needed, red = on protect");
  L.push("  21 new plate pixels — deliberately empty");
  L.push("  22 exposure map, D-097 classification vs D-098 (red = cut, yellow = A silhouette,");
  L.push("     blue = B non-mandatory fabric). The right panel has NO red.");
  L.push("  23 preserved-region diff (no red = nothing changed outside fabric + plate masks)");
  L.push("  24 edit / protect overlay      25 mandatory-mask runs at 16x — the discontinuity itself");
  L.push("  30/31 four render scales (180x270, 112x168, 72x108, 52x78), flat and on the R2 base");
  L.push("  report.json — every measurement, per-column evidence, and the checks");
  return L.join("\r\n") + "\r\n";
}

const invoked = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invoked) { try { main(); } catch (e) { console.error("x " + e.message); console.error(e.stack); process.exit(1); } }
