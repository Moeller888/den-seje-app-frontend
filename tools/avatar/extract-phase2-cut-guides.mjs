// 167A Phase-2 (P2-0) — Deterministic cut-guide + onion-skin extractor
// ---------------------------------------------------------------------------
// Emits REVIEW ARTIFACTS ONLY to guide the HUMAN painter who authors the Phase-2
// decomposed raster layers (docs/167a-phase2-asset-brief.md §4/§6/§11). It draws the
// locked anchor regions over the frozen Master and crops each Phase-2 layer zone so the
// painter can see exactly which pixels belong to base / face / eyes / headwear / back.
//
//   Northstar Master.png (1024×1536, white-matte, READ-ONLY)
//     + avatar-anchor-template-v1.json (164L/164S/164T anchors, master px)
//   →  cut-guides-overlay-v1.png   (anchor rectangles + eye centres drawn on the Master)
//   →  crop-{face,eye-left,eye-right,headwear,back}-region-v1.png  (per-zone crops)
//   →  cut-guides-v1.report.json   (each region in master / served ÷2 / engine-160 ÷6.4)
//
// HARD BOUNDARIES (D-040/D-041, matches extract-master-base.mjs / extract-anchor-masks.mjs):
//   * Deterministic, NON-AI, pure Node built-ins (zlib, crypto). No dependencies.
//   * Master + anchor JSON are READ-ONLY. This tool NEVER alters geometry, anchors or masks.
//   * Output = build/review artifacts under tools/avatar/build/ (gitignored). NOT runtime
//     assets, NOT auto-promoted, NOT registered in R2_MANIFEST, NOT activated. AVATAR_R2
//     is untouched. This is P2-0 (cut guides) — NOT Phase-2 implementation.
//   * Supports the Master's format only: PNG colour type 2 (RGB), 8-bit, non-interlaced.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { inflateSync, deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const MASTER = join(REPO, "assets", "avatar", "reference", "Northstar Master.png");
const ANCHORS = join(HERE, "build", "anchors", "avatar-anchor-template-v1.json");

// Frozen input contract (D-032). Abort on any mismatch → deterministic geometry.
const EXPECT_SHA = "2ca10ef868b9564164f28afc8bb03baec99cc10fd03f7200ed2dc58edd607a21";
const EXPECT_W = 1024;
const EXPECT_H = 1536;
const SERVED_DIV = 2;    // master → served (ADR-163D)
const ENGINE_DIV = 6.4;  // master → legacy 160×240 engine space

const args = process.argv.slice(2);
function argVal(name, dflt) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] !== undefined ? args[i + 1] : dflt;
}
const WHITE_HI = Math.max(0, Math.min(255, parseInt(argVal("--white", "250"), 10) || 250));
const OUT_DIR = argVal("--out", join(HERE, "build", "phase2"));

// ── minimal CRC32 (PNG) — copied from extract-master-base.mjs ─────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ── minimal PNG decode (colour type 2, 8-bit, non-interlaced) — copied ────────
function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}
function decodePng(buf) {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) throw new Error("not a PNG");
  let off = 8, ihdr = null;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      ihdr = { w: data.readUInt32BE(0), h: data.readUInt32BE(4), bitDepth: data[8], colorType: data[9], interlace: data[12] };
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    off += 12 + len;
  }
  if (!ihdr) throw new Error("no IHDR");
  if (ihdr.bitDepth !== 8 || ihdr.colorType !== 2 || ihdr.interlace !== 0) {
    throw new Error("unsupported PNG (need 8-bit RGB, non-interlaced); got " + JSON.stringify(ihdr));
  }
  const raw = inflateSync(Buffer.concat(idat));
  const { w, h } = ihdr;
  const bpp = 3;
  const stride = w * bpp;
  const rgb = Buffer.alloc(h * stride);
  let prev = Buffer.alloc(stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[p++];
    const cur = raw.subarray(p, p + stride);
    p += stride;
    const out = rgb.subarray(y * stride, y * stride + stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = cur[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) v += paeth(a, b, c);
      out[x] = v & 0xff;
    }
    prev = out;
  }
  return { w, h, rgb };
}

// ── minimal PNG encode (colour type 6, RGBA, filter None) — copied ────────────
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function encodePngRGBA(w, h, rgba) {
  const stride = w * 4;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter None
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

// ── alpha-cut: border-connected white-matte flood-fill → RGBA — copied ────────
function alphaCut(w, h, rgb, whiteHi) {
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0, j = 0; i < w * h; i++, j += 3) {
    rgba[i * 4] = rgb[j]; rgba[i * 4 + 1] = rgb[j + 1]; rgba[i * 4 + 2] = rgb[j + 2]; rgba[i * 4 + 3] = 255;
  }
  const isMatte = (i) => rgb[i * 3] >= whiteHi && rgb[i * 3 + 1] >= whiteHi && rgb[i * 3 + 2] >= whiteHi;
  const bg = new Uint8Array(w * h);
  const stack = [];
  const push = (i) => { if (!bg[i] && isMatte(i)) { bg[i] = 1; stack.push(i); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (stack.length) {
    const i = stack.pop();
    const x = i % w, y = (i / w) | 0;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }
  for (let i = 0; i < w * h; i++) if (bg[i]) rgba[i * 4 + 3] = 0;
  return rgba;
}

// ── guide drawing (opaque overlay markers on a copy of the RGBA) ──────────────
function setPx(rgba, w, x, y, color) {
  if (x < 0 || y < 0 || x >= w) return;
  const i = (y * w + x) * 4;
  if (i < 0 || i + 3 >= rgba.length) return;
  rgba[i] = color[0]; rgba[i + 1] = color[1]; rgba[i + 2] = color[2]; rgba[i + 3] = 255;
}
function drawRect(rgba, w, h, x, y, bw, bh, color, t = 3) {
  const x1 = Math.max(0, Math.round(x)), y1 = Math.max(0, Math.round(y));
  const x2 = Math.min(w - 1, Math.round(x + bw)), y2 = Math.min(h - 1, Math.round(y + bh));
  for (let yy = y1; yy <= y2; yy++) {
    for (let xx = x1; xx <= x2; xx++) {
      if (xx < x1 + t || xx > x2 - t || yy < y1 + t || yy > y2 - t) setPx(rgba, w, xx, yy, color);
    }
  }
}
function drawCross(rgba, w, h, cx, cy, color, size = 16, t = 2) {
  const x = Math.round(cx), y = Math.round(cy);
  for (let d = -size; d <= size; d++) {
    for (let k = -(t - 1); k <= t - 1; k++) {
      setPx(rgba, w, x + d, y + k, color);
      setPx(rgba, w, x + k, y + d, color);
    }
  }
}
function cropRegion(rgba, w, h, x, y, bw, bh) {
  const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y));
  const cw = Math.max(1, Math.min(w - x0, Math.round(bw)));
  const ch = Math.max(1, Math.min(h - y0, Math.round(bh)));
  const out = Buffer.alloc(cw * ch * 4);
  for (let yy = 0; yy < ch; yy++) {
    const src = ((y0 + yy) * w + x0) * 4;
    rgba.copy(out, yy * cw * 4, src, src + cw * 4);
  }
  return { w: cw, h: ch, rgba: out };
}

// ── coordinate reporting: master → served (÷2) → engine 160 (÷6.4) ────────────
const r1 = (n) => Math.round(n * 10) / 10;
function spaces(v) {
  return { master: r1(v), served: r1(v / SERVED_DIV), engine160: r1(v / ENGINE_DIV) };
}
function boxSpaces(b) {
  return {
    master: { x: b.x, y: b.y, width: b.width, height: b.height, radius: b.radius ?? null },
    served: { x: r1(b.x / SERVED_DIV), y: r1(b.y / SERVED_DIV), width: r1(b.width / SERVED_DIV), height: r1(b.height / SERVED_DIV) },
    engine160: { x: r1(b.x / ENGINE_DIV), y: r1(b.y / ENGINE_DIV), width: r1(b.width / ENGINE_DIV), height: r1(b.height / ENGINE_DIV) },
  };
}
function ptSpaces(p) {
  return p ? { master: p, served: { x: r1(p.x / SERVED_DIV), y: r1(p.y / SERVED_DIV) }, engine160: { x: r1(p.x / ENGINE_DIV), y: r1(p.y / ENGINE_DIV) } } : null;
}

// ── region colours (R,G,B) ────────────────────────────────────────────────────
const COL = {
  face:     [ 40, 210,  70],  // green
  eye:      [ 30, 200, 230],  // cyan
  headwear: [255, 150,  20],  // orange
  back:     [180,  90, 230],  // purple
  glasses:  [235, 220,  30],  // yellow
  hairDiag: [150, 150, 150],  // grey (diagnostic)
  cOpening: [ 60, 255,  90],  // eye-opening centre (bright green)
  cIris:    [ 40, 220, 255],  // iris centre (cyan)
  cPupil:   [255,  70, 220],  // pupil centre (magenta)
};

function main() {
  const buf = readFileSync(MASTER);
  const sha = createHash("sha256").update(buf).digest("hex");
  if (sha !== EXPECT_SHA) {
    throw new Error("Master sha256 mismatch — refusing (geometry contract, D-032).\n  expected " + EXPECT_SHA + "\n  got      " + sha);
  }
  const { w, h, rgb } = decodePng(buf);
  if (w !== EXPECT_W || h !== EXPECT_H) throw new Error("Master dims " + w + "×" + h + " ≠ " + EXPECT_W + "×" + EXPECT_H);

  const tpl = JSON.parse(readFileSync(ANCHORS, "utf8"));
  const a = tpl.anchors || {};
  const req = ["eyeLeftBox", "eyeRightBox", "faceMaskRegion", "headwearRegion", "backMaskRegion"];
  for (const k of req) if (!a[k]) throw new Error("anchor template missing required field: " + k);

  // Figure on transparent background (shared base for overlay + crops).
  const base = alphaCut(w, h, rgb, WHITE_HI);

  // ---- overlay: draw every Phase-2 layer region + eye centres on a copy ----
  const overlay = Buffer.from(base);
  // diagnostic hair box (min/max bounds), drawn faint first so real regions sit on top
  if (a.headHairRegion && typeof a.headHairRegion.minX === "number") {
    const hr = a.headHairRegion;
    drawRect(overlay, w, h, hr.minX, hr.minY, hr.maxX - hr.minX, hr.maxY - hr.minY, COL.hairDiag, 2);
  }
  drawRect(overlay, w, h, a.headwearRegion.x, a.headwearRegion.y, a.headwearRegion.width, a.headwearRegion.height, COL.headwear, 3);
  drawRect(overlay, w, h, a.backMaskRegion.x, a.backMaskRegion.y, a.backMaskRegion.width, a.backMaskRegion.height, COL.back, 3);
  drawRect(overlay, w, h, a.faceMaskRegion.x, a.faceMaskRegion.y, a.faceMaskRegion.width, a.faceMaskRegion.height, COL.face, 3);
  if (a.glassesBand) drawRect(overlay, w, h, a.glassesBand.x, a.glassesBand.y, a.glassesBand.width, a.glassesBand.height, COL.glasses, 2);
  for (const box of [a.eyeLeftBox, a.eyeRightBox]) {
    drawRect(overlay, w, h, box.x, box.y, box.width, box.height, COL.eye, 3);
    if (box.boxCenter) drawCross(overlay, w, h, box.boxCenter.x, box.boxCenter.y, COL.cOpening);
    if (box.irisCenter) drawCross(overlay, w, h, box.irisCenter.x, box.irisCenter.y, COL.cIris, 10);
    if (box.pupilCenter) drawCross(overlay, w, h, box.pupilCenter.x, box.pupilCenter.y, COL.cPupil, 8);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const overlayPng = encodePngRGBA(w, h, overlay);
  writeFileSync(join(OUT_DIR, "cut-guides-overlay-v1.png"), overlayPng);

  // ---- per-zone crops from the clean alpha-cut (no guides drawn) ----
  const crops = [
    { name: "face-region",  box: a.faceMaskRegion },
    { name: "eye-left",     box: a.eyeLeftBox },
    { name: "eye-right",    box: a.eyeRightBox },
    { name: "headwear-region", box: a.headwearRegion },
    { name: "back-region",  box: a.backMaskRegion },
  ];
  const cropOut = [];
  for (const c of crops) {
    const cr = cropRegion(base, w, h, c.box.x, c.box.y, c.box.width, c.box.height);
    const png = encodePngRGBA(cr.w, cr.h, cr.rgba);
    const file = "crop-" + c.name + "-v1.png";
    writeFileSync(join(OUT_DIR, file), png);
    cropOut.push({ file, master: { x: c.box.x, y: c.box.y, width: cr.w, height: cr.h }, bytes: png.length });
  }

  // ---- report ----
  const report = {
    tool: "extract-phase2-cut-guides",
    generatedFor: "167A Phase-2 P2-0 (cut guides + onion-skin for the human painter)",
    boundaries: "REVIEW/BUILD artifacts only — NOT runtime assets, NOT geometry-altering, AVATAR_R2 untouched (D-040/D-041).",
    source: {
      master: { file: "assets/avatar/reference/Northstar Master.png", sha256: sha, dims: w + "×" + h },
      anchorTemplate: "tools/avatar/build/anchors/avatar-anchor-template-v1.json",
      anchorSignoff: "164L = CONDITIONAL PASS (Tier-2 cosmetic tooling baseline, 2026-06-18); Phase-2-scoped eye-box sign-off still required; fields remain humanReviewRequired.",
    },
    params: { whiteHi: WHITE_HI },
    coordinateSpaces: { master: EXPECT_W + "×" + EXPECT_H, served: (EXPECT_W / SERVED_DIV) + "×" + (EXPECT_H / SERVED_DIV) + " (÷2)", engine160: "160×240 (÷6.4)" },
    regions: {
      faceMaskRegion: boxSpaces(a.faceMaskRegion),
      eyeLeftBox: boxSpaces(a.eyeLeftBox),
      eyeRightBox: boxSpaces(a.eyeRightBox),
      headwearRegion: boxSpaces(a.headwearRegion),
      backMaskRegion: boxSpaces(a.backMaskRegion),
      glassesBand: a.glassesBand ? boxSpaces(a.glassesBand) : null,
    },
    eyeCentres: {
      left: {
        opening: ptSpaces(a.eyeLeftBox.boxCenter),
        iris: ptSpaces(a.eyeLeftBox.irisCenter),
        pupil: ptSpaces(a.eyeLeftBox.pupilCenter),
      },
      right: {
        opening: ptSpaces(a.eyeRightBox.boxCenter),
        iris: ptSpaces(a.eyeRightBox.irisCenter),
        pupil: ptSpaces(a.eyeRightBox.pupilCenter),
      },
      legacyBlink160: { left: { cx: 68, cy: 47 }, right: { cx: 92, cy: 47 }, note: "js/avatar-blink-engine.js — FROZEN (do not move); raster eye-box is separate" },
    },
    outputs: { overlay: "cut-guides-overlay-v1.png", crops: cropOut },
  };
  writeFileSync(join(OUT_DIR, "cut-guides-v1.report.json"), JSON.stringify(report, null, 2));

  const oc = report.eyeCentres.left.opening.engine160, or = report.eyeCentres.right.opening.engine160;
  console.log("✔ Phase-2 cut guides extracted (deterministic; review artifacts only):");
  console.log("  " + OUT_DIR);
  console.log("  cut-guides-overlay-v1.png  (anchor regions + eye centres on Master, " + w + "×" + h + ")");
  console.log("  crop-{face,eye-left,eye-right,headwear,back}-region-v1.png");
  console.log("  cut-guides-v1.report.json");
  console.log("");
  console.log("  eye-opening centres (engine 160×240): L (" + oc.x + ", " + oc.y + ")  R (" + or.x + ", " + or.y + ")");
  console.log("  legacy blink (frozen):                L (68, 47)      R (92, 47)  → North Star sits ~13 units lower");
  console.log("");
  console.log("BOUNDARIES: review/build artifacts only (tools/avatar/build/ is gitignored). NOT runtime assets,");
  console.log("  NOT geometry-altering, AVATAR_R2 untouched. Next = HUMAN paint-over per docs/167a-phase2-asset-brief.md §4.");
}

try { main(); } catch (e) { console.error("✖ extract-phase2-cut-guides failed:", e.message); process.exit(1); }
