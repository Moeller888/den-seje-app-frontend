// D-097 — binding VISUAL review package for the v1 + v3-sleeves challenger.
// ---------------------------------------------------------------------------------------------
// The numbers already pass (collar 100 %, shoulder 98.2 %, torso 94.1 %, skirt 100 %, 3,534 missing
// vs v1's 8,608, seam median 28.68 vs the 23.17 control). This package exists because the numbers
// have been wrong about the picture seven times in this track, so nothing is accepted on them alone.
//
// It proves, rather than asserts, the one claim that makes the whole approach safe:
// EVERYTHING OUTSIDE THE TWO SLEEVE MASKS IS BYTE-IDENTICAL TO THE ACCEPTED v1 ARTWORK.
//
// Read-only: writes only into build/ and the owner's review folder. Nothing is promoted.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, sep } from "node:path";
import { decodePng, encodePngRGBA } from "../build-r2-torso-occlusion-mask.mjs";
import { OPAQUE, VISIBLE, BANDS } from "../check-r2-torso-candidate.mjs";
import { geometry, plateSeam, sleeveMasks, graft, measure, seamMetrics, W, H } from "./sleeve-donor-challenger.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");
const AI = join(REPO, "tools", "avatar", "build", "ai-input");
const FIX = join(REPO, "tools", "avatar", "fixtures", "r2-torso");
const BUILD = join(REPO, "tools", "avatar", "build", "sleeve-donor-review");
const OUT = process.env.D097_REVIEW_OUT || "C:\\Users\\Bruger\\Documents\\DEN SEJE APP\\_avatar-artefakter\\D097-sleeve-donor-final-review";
const DWEBP = join(REPO, "tools", "avatar", "vendor", "dwebp.exe");
const BASE_WEBP = join(REPO, "assets", "avatar-r2", "base", "body-neutral-medium-v2.webp");
const SIZES = [[180, 270], [112, 168], [72, 108], [52, 78]];

const sha256 = (b) => createHash("sha256").update(b).digest("hex");
function assertWritable(p) {
  const abs = resolve(p);
  const ok = [BUILD, OUT].some((r) => abs === resolve(r) || abs.startsWith(resolve(r) + sep));
  if (!ok) throw new Error("refusing to write outside the build/review dirs: " + abs);
  if (/assets|[\\/]js[\\/]|\.claude/i.test(abs)) throw new Error("refusing a protected path: " + abs);
  return abs;
}
const write = (p, b) => { const a = assertWritable(p); mkdirSync(dirname(a), { recursive: true }); writeFileSync(a, b); return a; };
const png = (w, h, rgba) => encodePngRGBA(w, h, rgba);

function load(name) { const b = readFileSync(join(AI, name)); return { ...decodePng(b, name), sha256: sha256(b) }; }
function loadMask(n) {
  const img = decodePng(readFileSync(join(FIX, n)), n);
  const m = new Uint8Array(img.w * img.h);
  for (let i = 0; i < m.length; i++) m[i] = img.rgba[i * 4 + 3] > 0 ? 1 : 0;
  return m;
}
function decodeBase() {
  if (!existsSync(DWEBP)) return null;
  mkdirSync(BUILD, { recursive: true });
  const out = join(BUILD, "_base.png");
  const r = spawnSync(DWEBP, [BASE_WEBP, "-o", assertWritable(out)], { encoding: "utf8" });
  if (r.status !== 0) return null;
  return decodePng(readFileSync(out), "base");
}

// ── imaging helpers ───────────────────────────────────────────────────────────────────────────
const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
function flatten(rgba, w, h, bg = [250, 250, 250]) {
  const o = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const a = rgba[i * 4 + 3] / 255;
    for (let c = 0; c < 3; c++) o[i * 4 + c] = Math.round(rgba[i * 4 + c] * a + bg[c] * (1 - a));
    o[i * 4 + 3] = 255;
  }
  return o;
}
function areaDownscale(rgba, sw, sh, dw, dh) {
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
      out[di] = Math.round(r / a); out[di + 1] = Math.round(g / a); out[di + 2] = Math.round(b / a);
      out[di + 3] = Math.round(a / n);
    }
  }
  return out;
}
function over(dst, src, n) {
  for (let i = 0; i < n; i++) {
    const a = src[i * 4 + 3] / 255;
    if (a === 0) continue;
    for (let c = 0; c < 3; c++) dst[i * 4 + c] = Math.round(src[i * 4 + c] * a + dst[i * 4 + c] * (1 - a));
    dst[i * 4 + 3] = Math.max(dst[i * 4 + 3], src[i * 4 + 3]);
  }
}
// Lay panels out on one canvas with labels rendered as simple tick marks (no font dependency).
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
function crop(img, x0, y0, cw, ch, zoom) {
  const w = cw * zoom, h = ch * zoom, out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = x0 + Math.floor(x / zoom), sy = y0 + Math.floor(y / zoom);
    const di = (y * w + x) * 4;
    if (sx < 0 || sy < 0 || sx >= W || sy >= H) { out[di + 3] = 255; continue; }
    const si = (sy * W + sx) * 4;
    for (let c = 0; c < 4; c++) out[di + c] = img[si + c];
  }
  return { w, h, rgba: out };
}

// ── run ───────────────────────────────────────────────────────────────────────────────────────
function main() {
  mkdirSync(BUILD, { recursive: true });
  mkdirSync(OUT, { recursive: true });

  const v1 = load("torso-armor-knight-candidate-nobackfill.png");
  const v3 = load("torso-armor-knight-candidate-v3-nobackfill.png");
  const masks3 = { hard: loadMask("torso-occlusion-hard-v1.png"), edit: loadMask("torso-edit-allowed-v1.png"), protect: loadMask("torso-protect-v1.png") };
  const geo = geometry(v1);
  const seamL = plateSeam(v1, geo, "left"), seamR = plateSeam(v1, geo, "right");
  const masks = sleeveMasks(v3, geo, { seamL, seamR });
  const g = graft(v1, v3, masks);
  const cand = g.rgba;

  const report = {
    tool: "review-sleeve-donor", decision: "D-097",
    base: { key: "v1", sha256: v1.sha256 }, donor: { key: "v3", sha256: v3.sha256 },
    candidateSha256: sha256(png(W, H, cand)),
  };

  // ── 5. PIXEL-IDENTITY PROOF — the claim the whole approach rests on ─────────────────────────
  const union = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) union[i] = (masks.left[i] || masks.right[i]) ? 1 : 0;
  let outsideDiff = 0; const diffSample = [];
  for (let i = 0; i < W * H; i++) {
    if (union[i]) continue;
    for (let c = 0; c < 4; c++) if (cand[i * 4 + c] !== v1.rgba[i * 4 + c]) {
      outsideDiff++;
      if (diffSample.length < 10) diffSample.push({ x: i % W, y: (i / W) | 0 });
      break;
    }
  }
  report.pixelIdentityOutsideSleeveMasks = { differingPixels: outsideDiff, sample: diffSample, pass: outsideDiff === 0 };

  // ── 3. DONOR MASK BOUNDS + forbidden-region contact ─────────────────────────────────────────
  const bboxOf = (m) => {
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, n = 0;
    for (let i = 0; i < W * H; i++) if (m[i]) { const x = i % W, y = (i / W) | 0; n++; if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
    return { px: n, x0, y0, x1, y1 };
  };
  const seamRange = (s) => { const v = []; for (let y = 0; y < H; y++) if (s[y] > 0) v.push(s[y]); return v.length ? { min: Math.min(...v), max: Math.max(...v) } : null; };
  // Forbidden regions. The centre breastplate is everything strictly BETWEEN the two seams in the
  // chest band — by construction the donor should never reach it.
  const beltTop = 756, beltBot = 786;
  const regionHits = { collar: 0, centreBreastplate: 0, belt: 0, skirt: 0 };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!union[i]) continue;
      if (y < BANDS.collar[1]) regionHits.collar++;
      const sl = seamL[y] > 0 ? seamL[y] : geo.torsoL, sr = seamR[y] > 0 ? seamR[y] : geo.torsoR;
      if (y >= 560 && y < beltTop && x > sl && x < sr) regionHits.centreBreastplate++;
      if (y >= beltTop && y <= beltBot) regionHits.belt++;
      if (y > beltBot) regionHits.skirt++;
    }
  }
  report.donorMask = {
    left: bboxOf(masks.left), right: bboxOf(masks.right),
    seamXLeft: seamRange(seamL), seamXRight: seamRange(seamR),
    forbiddenRegionPixels: regionHits,
    pass: regionHits.centreBreastplate === 0 && regionHits.belt === 0 && regionHits.skirt === 0,
    collarNote: "collar-band contact is expected — the shoulder cap starts above y=560; what matters is that it is SLEEVE, outboard of the seam, not collar artwork.",
  };

  // ── 4. TONE CONTROL inside the sleeve masks, near the seam ──────────────────────────────────
  const med = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return +s[Math.floor(s.length / 2)].toFixed(2); };
  const p95 = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return +s[Math.floor(0.95 * (s.length - 1))].toFixed(2); };
  const tone = {};
  for (const side of ["left", "right"]) {
    const m = side === "left" ? masks.left : masks.right;
    const seam = side === "left" ? seamL : seamR;
    const dV1 = [], dDon = [], delta = [];
    for (let y = 0; y < H; y++) {
      const sx = seam[y]; if (sx <= 0) continue;
      for (let d = 1; d <= 20; d++) {
        const x = side === "left" ? sx - d : sx + d;
        if (x < 0 || x >= W) continue;
        const i = y * W + x;
        if (!m[i]) continue;
        if (v1.rgba[i * 4 + 3] >= OPAQUE) dV1.push(lum(v1.rgba[i * 4], v1.rgba[i * 4 + 1], v1.rgba[i * 4 + 2]));
        if (v3.rgba[i * 4 + 3] >= OPAQUE) dDon.push(lum(v3.rgba[i * 4], v3.rgba[i * 4 + 1], v3.rgba[i * 4 + 2]));
        if (v1.rgba[i * 4 + 3] >= OPAQUE && v3.rgba[i * 4 + 3] >= OPAQUE) {
          delta.push(Math.abs(lum(v3.rgba[i * 4], v3.rgba[i * 4 + 1], v3.rgba[i * 4 + 2]) - lum(v1.rgba[i * 4], v1.rgba[i * 4 + 1], v1.rgba[i * 4 + 2])));
        }
      }
    }
    tone[side] = { v1MedianLuma: med(dV1), donorMedianLuma: med(dDon), deltaMedian: med(delta), deltaP95: p95(delta), samples: delta.length };
  }
  tone.asymmetry = (tone.left.deltaMedian != null && tone.right.deltaMedian != null)
    ? +Math.abs(tone.left.deltaMedian - tone.right.deltaMedian).toFixed(2) : null;
  report.tone = tone;

  // ── 5. structural ──────────────────────────────────────────────────────────────────────────
  const m = measure(cand, masks3, "v1+v3-sleeves");
  report.structural = m;
  report.seam = { candidate: seamMetrics(cand, geo, seamL, seamR), controlV1: seamMetrics(v1.rgba, geo, seamL, seamR) };
  // sleeve reach: lowest row where the garment is wider than the torso column
  let reach = -1;
  for (let y = 560; y <= 800; y++) {
    let l = -1, h2 = -1;
    for (let x = 0; x < W; x++) if (cand[(y * W + x) * 4 + 3] >= OPAQUE) { if (l < 0) l = x; h2 = x; }
    if (l >= 0 && (h2 - l) > geo.torsoWidth + 20) reach = y;
  }
  report.sleeveReachY = reach;

  // ── 1. four-scale ──────────────────────────────────────────────────────────────────────────
  const fV1 = flatten(v1.rgba, W, H), fC = flatten(cand, W, H);
  write(join(OUT, "00-v1-reference.png"), png(W, H, fV1));
  write(join(OUT, "01-v1-v3-candidate.png"), png(W, H, fC));
  write(join(OUT, "02-side-by-side-master.png"), (() => { const s = strip([{ w: W, h: H, rgba: fV1 }, { w: W, h: H, rgba: fC }]); return png(s.w, s.h, s.rgba); })());

  const fourPanels = [];
  for (const [w, h] of SIZES) {
    fourPanels.push({ w, h, rgba: flatten(areaDownscale(v1.rgba, W, H, w, h), w, h, [26, 28, 36]) });
    fourPanels.push({ w, h, rgba: flatten(areaDownscale(cand, W, H, w, h), w, h, [26, 28, 36]) });
  }
  { const s = strip(fourPanels); write(join(OUT, "03-four-scale-side-by-side.png"), png(s.w, s.h, s.rgba)); }

  const base = decodeBase();
  if (base && base.w === 512 && base.h === 768) {
    // The candidate is Master-canvas; the base is served-size. Downscale the candidate to match.
    const candServed = areaDownscale(cand, W, H, 512, 768);
    const panels = [];
    for (const [w, h] of SIZES) {
      const b = Buffer.from(base.rgba);
      over(b, candServed, 512 * 768);
      panels.push({ w, h, rgba: flatten(areaDownscale(b, 512, 768, w, h), w, h, [26, 28, 36]) });
    }
    const s = strip(panels);
    write(join(OUT, "04-four-scale-on-r2-base.png"), png(s.w, s.h, s.rgba));
    report.r2BaseComposite = "rendered";
  } else {
    report.r2BaseComposite = "SKIPPED — vendored dwebp missing or unexpected base size";
  }

  // ── 2. 8× seam zooms ───────────────────────────────────────────────────────────────────────
  // Donor-only and diff layers, built once and reused by every crop.
  const donorOnly = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) if (union[i]) for (let c = 0; c < 4; c++) donorOnly[i * 4 + c] = v3.rgba[i * 4 + c];
  const seamMaskOv = Buffer.from(fC);
  for (let i = 0; i < W * H; i++) if (union[i]) {
    seamMaskOv[i * 4] = Math.round(seamMaskOv[i * 4] * 0.45 + 255 * 0.55);
    seamMaskOv[i * 4 + 2] = Math.round(seamMaskOv[i * 4 + 2] * 0.45 + 255 * 0.55);
  }
  const seamCurveOv = Buffer.from(fC);
  for (let y = 0; y < H; y++) for (const s of [seamL, seamR]) {
    const x = s[y]; if (x <= 0) continue;
    for (const dx of [-1, 0, 1]) { const i = y * W + x + dx; if (i >= 0 && i < W * H) { seamCurveOv[i * 4] = 255; seamCurveOv[i * 4 + 1] = 40; seamCurveOv[i * 4 + 2] = 40; seamCurveOv[i * 4 + 3] = 255; } }
  }
  const heat = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    let d = 0;
    for (let c = 0; c < 4; c++) d = Math.max(d, Math.abs(cand[i * 4 + c] - v1.rgba[i * 4 + c]));
    heat[i * 4] = d > 0 ? Math.min(255, 60 + d) : 20;
    heat[i * 4 + 1] = d > 0 ? Math.max(0, 200 - d) : 20;
    heat[i * 4 + 2] = 30; heat[i * 4 + 3] = 255;
  }
  const preservedDiff = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const inside = union[i];
    let d = 0;
    for (let c = 0; c < 4; c++) d = Math.max(d, Math.abs(cand[i * 4 + c] - v1.rgba[i * 4 + c]));
    // outside the masks ANY difference is a violation → red; inside, grey (expected)
    if (!inside && d > 0) { preservedDiff[i * 4] = 255; preservedDiff[i * 4 + 1] = 0; preservedDiff[i * 4 + 2] = 0; }
    else if (inside) { preservedDiff[i * 4] = 55; preservedDiff[i * 4 + 1] = 55; preservedDiff[i * 4 + 2] = 65; }
    else { preservedDiff[i * 4] = 16; preservedDiff[i * 4 + 1] = 18; preservedDiff[i * 4 + 2] = 22; }
    preservedDiff[i * 4 + 3] = 255;
  }

  write(join(OUT, "20-seam-mask-overlay.png"), png(W, H, seamMaskOv));
  write(join(OUT, "21-seam-curve-overlay.png"), png(W, H, seamCurveOv));
  write(join(OUT, "22-rgb-difference-heatmap.png"), png(W, H, heat));
  write(join(OUT, "23-donor-only-map.png"), png(W, H, flatten(donorOnly, W, H, [20, 20, 26])));
  write(join(OUT, "24-v1-preserved-region-diff.png"), png(W, H, preservedDiff));

  const fDon = flatten(donorOnly, W, H);
  const zooms = [
    ["10-left-armhole-8x.png", (seamL[640] || geo.torsoL) - 30, 600, 60, 90],
    ["11-right-armhole-8x.png", (seamR[640] || geo.torsoR) - 30, 600, 60, 90],
    ["12-left-shoulder-8x.png", (seamL[570] || geo.torsoL) - 45, 524, 70, 80],
    ["13-right-shoulder-8x.png", (seamR[570] || geo.torsoR) - 25, 524, 70, 80],
  ];
  for (const [name, x0, y0, cw, ch] of zooms) {
    const panels = [fV1, fDon, fC, seamMaskOv, seamCurveOv, heat].map((src) => crop(src, x0, y0, cw, ch, 8));
    const s = strip(panels, 10);
    write(join(OUT, name), png(s.w, s.h, s.rgba));
  }

  // ── verdict ────────────────────────────────────────────────────────────────────────────────
  const REF = { collar: 1.0, shoulder: 0.87952, torso: 0.94106, skirt: 1.0 };
  const b = m.bands;
  const checks = [
    ["collar >= 100%", b.collar.coverage >= REF.collar],
    ["skirt >= 100%", b.skirt ? b.skirt.coverage >= REF.skirt : true],
    ["torso >= 94.106%", b.torso.coverage >= REF.torso],
    ["shoulder > 87.952%", b.shoulder.coverage > REF.shoulder],
    ["missing < 8608", m.totalMissingPx < 8608],
    ["0 ink outside edit", m.inkOutsideEdit === 0],
    ["0 ink on protect", m.inkOnProtect === 0],
    ["single component", m.components === 1],
    ["no halo", m.orphanSoftPx <= 64],
    ["pixel-identical outside sleeve masks", outsideDiff === 0],
    ["no donor on centre breastplate", regionHits.centreBreastplate === 0],
    ["no donor on belt", regionHits.belt === 0],
    ["no donor on skirt", regionHits.skirt === 0],
    ["seam median <= control + 10", report.seam.candidate.medianStep <= report.seam.controlV1.medianStep + 10],
    ["sleeve reaches y >= 705", reach >= 705],
  ];
  report.checks = checks.map(([name, pass]) => ({ name, pass }));
  report.automatedVerdict = checks.every(([, p]) => p) ? "ALL_AUTOMATED_CHECKS_PASS" : "AUTOMATED_CHECKS_FAILED";
  report.note = "An automated pass is a PRECONDITION. The classification CHALLENGER_READY_FOR_OWNER_REVIEW also requires the 8x seam crops to show no artificial seam, no tone wedge and natural sleeves at all four sizes — a human judgement this tool does not make.";

  write(join(OUT, "report.json"), Buffer.from(JSON.stringify(report, null, 2) + "\n", "utf8"));
  write(join(OUT, "README.txt"), Buffer.from(readme(report), "utf8"));

  console.log(`candidate sha ${report.candidateSha256.slice(0, 16)}…`);
  console.log(`\nPIXEL IDENTITY outside the sleeve masks: ${outsideDiff} differing px  → ${outsideDiff === 0 ? "PROVEN" : "VIOLATED"}`);
  console.log(`donor mask  left ${report.donorMask.left.px} px  right ${report.donorMask.right.px} px`);
  console.log(`forbidden-region contact: ${JSON.stringify(regionHits)}`);
  console.log(`seam median ${report.seam.candidate.medianStep} vs control ${report.seam.controlV1.medianStep}`);
  console.log(`tone delta  left ${tone.left.deltaMedian} / right ${tone.right.deltaMedian}  asymmetry ${tone.asymmetry}`);
  console.log(`sleeve reach y=${reach}`);
  console.log("\nchecks:");
  for (const c of report.checks) console.log(`  ${c.pass ? "✓" : "✖"} ${c.name}`);
  console.log(`\n${report.automatedVerdict}  →  ${OUT}`);
}

function readme(r) {
  return [
    "D-097 — v1 + v3-sleeves challenger, binding visual review",
    "Generated " + new Date().toISOString().slice(0, 10) + ". Nothing here is committed or promoted.",
    "",
    "WHAT THIS IS. A challenger to the accepted Ridderdragt, built by grafting ONLY the left and",
    "right sleeve regions of the prompt-v3 generation onto the accepted v1 artwork. Everything else",
    "— collar, breastplate, centre ridge, belt, buckle, torso, skirt — is v1, unchanged.",
    "",
    "WHY. v1's sleeves stop at y=680 while the base tee's reach y=714, and that shortfall IS the",
    "5,990 backfill pixels in the shoulder band (D-095). Three full regenerations moved the problem",
    "between bands without solving it; grafting only the sleeves keeps what v1 got right.",
    "",
    "THE CLAIM THIS PACKAGE PROVES:",
    "  outside the two sleeve masks, the candidate is BYTE-IDENTICAL to the accepted v1 artwork.",
    "  measured: " + r.pixelIdentityOutsideSleeveMasks.differingPixels + " differing pixels.",
    "",
    "NUMBERS (before any backfill)",
    "  collar   " + (r.structural.bands.collar.coverage * 100).toFixed(1) + "%   (v1: 100.0%)",
    "  shoulder " + (r.structural.bands.shoulder.coverage * 100).toFixed(1) + "%   (v1: 88.0%)",
    "  torso    " + (r.structural.bands.torso.coverage * 100).toFixed(1) + "%   (v1: 94.1%)",
    "  skirt    " + (r.structural.bands.skirt ? (r.structural.bands.skirt.coverage * 100).toFixed(1) : "—") + "%   (v1: 100.0%)",
    "  missing  " + r.structural.totalMissingPx + " px   (v1: 8608)",
    "  seam median step " + r.seam.candidate.medianStep + "  (control on untouched v1: " + r.seam.controlV1.medianStep + ")",
    "",
    "WHAT TO LOOK FOR — the failure modes this artwork has actually had:",
    "  - a vertical or artificial paste edge at the armhole (two earlier attempts had exactly this)",
    "  - dark wedges where the donor's shading meets v1's",
    "  - a doubled or broken outline at the armhole",
    "  - a tone step INSIDE the sleeve face, which the seam median cannot see",
    "  - left/right asymmetry",
    "  - donor pixels anywhere on the breastplate, belt or skirt",
    "  - sleeves that stop short of y~714 again",
    "",
    "FILES",
    "  00/01/02  master-size reference, candidate, side by side",
    "  03        four-scale side by side (180x270, 112x168, 72x108, 52x78)",
    "  04        candidate on the runtime R2 base at the same four sizes",
    "  10-13     8x zooms: left/right armhole, left/right shoulder.",
    "            Each strip is: v1 | donor only | candidate | seam mask | seam curve | RGB diff",
    "  20-24     seam mask, seam curve, RGB difference heatmap, donor-only map,",
    "            and 24 = the preserved-region proof (RED = any pixel outside the masks that",
    "            differs from v1; the image must contain NO red at all)",
    "  report.json  every measurement, machine readable",
    "",
    "AUTOMATED VERDICT: " + r.automatedVerdict,
    "An automated pass is a PRECONDITION, not an approval. Classification as",
    "CHALLENGER_READY_FOR_OWNER_REVIEW additionally requires the human checks above.",
    "",
  ].join("\n");
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  try { main(); } catch (e) { console.error("✖ " + e.message); console.error(e.stack); process.exit(1); }
}
