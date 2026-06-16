// 164L — Deterministic Anchor + MVP Mask Extraction (D-041 / 164K)
// ---------------------------------------------------------------------------
// Reads the Tier-0 base (Northstar Master.png) and emits REVIEW ARTIFACTS only:
//   - avatar-anchor-template-v1.json  (first-pass anchors, human-review required)
//   - anchor-overlay-v1.png           (anchor guides drawn over the Master)
//   - mask-{aura,back,headwear,face,eyes}-v1.png  (QA/build masks, white=allowed)
//
// HARD BOUNDARIES (D-040/D-041):
//   * Deterministic, NON-AI image processing only (Node built-ins: zlib, crypto).
//   * No AI/ML, no full-avatar generation, no shop items, no runtime wiring.
//   * The Master image is READ-ONLY and never modified.
//   * Outputs are QA/build artifacts, NOT shipped runtime avatar assets.
//   * No third-party dependencies.
//
// Supports PNG colour types 2 (RGB) and 6 (RGBA), 8-bit, non-interlaced.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { inflateSync, deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const MASTER = join(REPO, "assets", "avatar", "reference", "Northstar Master.png");
const OUT = {
  anchors: join(HERE, "build", "anchors"),
  previews: join(HERE, "build", "previews"),
  masks: join(HERE, "build", "masks"),
};
const EXPECT_W = 1024;
const EXPECT_H = 1536;

// ---- CRC32 (PNG chunk checksums) -----------------------------------------
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

// ---- PNG decode (colour type 2/6, 8-bit, non-interlaced) ------------------
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}
function decodePNG(buf) {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) throw new Error("Not a PNG file");
  let off = 8, width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === "IDAT") {
      idat.push(Buffer.from(data));
    } else if (type === "IEND") break;
    off += 12 + len; // len + type(4) + data + crc(4)
  }
  if (bitDepth !== 8) throw new Error(`Unsupported bit depth ${bitDepth} (need 8)`);
  if (interlace !== 0) throw new Error("Interlaced PNG not supported");
  if (colorType !== 2 && colorType !== 6) throw new Error(`Unsupported colour type ${colorType} (need 2 or 6)`);
  const channels = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const rgba = new Uint8Array(width * height * 4);
  const prev = new Uint8Array(stride);
  const cur = new Uint8Array(stride);
  let p = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[p++];
    for (let i = 0; i < stride; i++) {
      const x = raw[p++];
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v;
      switch (filter) {
        case 0: v = x; break;
        case 1: v = x + a; break;
        case 2: v = x + b; break;
        case 3: v = x + ((a + b) >> 1); break;
        case 4: v = x + paeth(a, b, c); break;
        default: throw new Error(`Bad filter ${filter} at row ${y}`);
      }
      cur[i] = v & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const s = x * channels, d = (y * width + x) * 4;
      rgba[d] = cur[s]; rgba[d + 1] = cur[s + 1]; rgba[d + 2] = cur[s + 2];
      rgba[d + 3] = channels === 4 ? cur[s + 3] : 255;
    }
    prev.set(cur);
  }
  return { width, height, colorType, rgba };
}

// ---- PNG encode (8-bit RGBA, filter 0) ------------------------------------
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const crcBuf = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(crcBuf), 0);
  return Buffer.concat([len, t, data, crc]);
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter None
    rgba.subarray ? raw.set(rgba.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1)
                  : raw.set(rgba.slice(y * stride, y * stride + stride), y * (stride + 1) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// ---- raster drawing helpers ----------------------------------------------
function setPx(buf, w, h, x, y, [r, g, b, a]) {
  x |= 0; y |= 0;
  if (x < 0 || y < 0 || x >= w || y >= h) return;
  const d = (y * w + x) * 4;
  buf[d] = r; buf[d + 1] = g; buf[d + 2] = b; buf[d + 3] = a;
}
function fillRectBuf(buf, w, h, x0, y0, x1, y1, col) {
  for (let y = Math.max(0, y0 | 0); y <= Math.min(h - 1, y1 | 0); y++)
    for (let x = Math.max(0, x0 | 0); x <= Math.min(w - 1, x1 | 0); x++) setPx(buf, w, h, x, y, col);
}
function fillEllipseBuf(buf, w, h, cx, cy, rx, ry, col, pred) {
  for (let y = Math.max(0, (cy - ry) | 0); y <= Math.min(h - 1, (cy + ry) | 0); y++)
    for (let x = Math.max(0, (cx - rx) | 0); x <= Math.min(w - 1, (cx + rx) | 0); x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1 && (!pred || pred(x, y))) setPx(buf, w, h, x, y, col);
    }
}
function strokeRect(buf, w, h, x0, y0, x1, y1, col, t = 2) {
  for (let k = 0; k < t; k++) {
    fillRectBuf(buf, w, h, x0 - k, y0 - k, x1 + k, y0 - k, col);
    fillRectBuf(buf, w, h, x0 - k, y1 + k, x1 + k, y1 + k, col);
    fillRectBuf(buf, w, h, x0 - k, y0 - k, x0 - k, y1 + k, col);
    fillRectBuf(buf, w, h, x1 + k, y0 - k, x1 + k, y1 + k, col);
  }
}
function strokeEllipse(buf, w, h, cx, cy, rx, ry, col, t = 2) {
  for (let a = 0; a < 360; a += 0.25) {
    const rad = (a * Math.PI) / 180;
    for (let k = 0; k < t; k++)
      setPx(buf, w, h, cx + (rx + k) * Math.cos(rad), cy + (ry + k) * Math.sin(rad), col);
  }
}
function strokeLine(buf, w, h, x0, y0, x1, y1, col, t = 2) {
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy, x = x0, y = y0;
  for (;;) {
    for (let oy = 0; oy < t; oy++) setPx(buf, w, h, x, y + oy, col);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
}

// ---- main ------------------------------------------------------------------
function main() {
  const warnings = [];
  const fileBuf = readFileSync(MASTER);
  const sha256 = createHash("sha256").update(fileBuf).digest("hex");
  const { width, height, colorType, rgba } = decodePNG(fileBuf);

  if (width !== EXPECT_W || height !== EXPECT_H)
    throw new Error(`Master must be ${EXPECT_W}x${EXPECT_H}, got ${width}x${height}`);

  // background detection (corners)
  const corner = (x, y) => { const d = (y * width + x) * 4; return [rgba[d], rgba[d+1], rgba[d+2], rgba[d+3]]; };
  const corners = [corner(0,0), corner(width-1,0), corner(0,height-1), corner(width-1,height-1)];
  const allTransparent = corners.every(c => c[3] < 16);
  const allWhite = corners.every(c => c[0] > 244 && c[1] > 244 && c[2] > 244);
  const background = allTransparent ? "transparent" : allWhite ? "white-matte" : "unknown";
  if (background === "unknown") warnings.push("Background type unknown (corners not transparent or near-white); silhouette may be unreliable.");

  // figure silhouette
  const isFigure = (x, y) => {
    const d = (y * width + x) * 4;
    if (background === "transparent") return rgba[d + 3] > 32;
    return !(rgba[d] > 244 && rgba[d + 1] > 244 && rgba[d + 2] > 244); // not near-white
  };
  let minX = width, minY = height, maxX = -1, maxY = -1, figureCount = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (isFigure(x, y)) { figureCount++; if (x<minX)minX=x; if (y<minY)minY=y; if (x>maxX)maxX=x; if (y>maxY)maxY=y; }
  if (figureCount === 0) { warnings.push("No figure detected."); minX=minY=0; maxX=width-1; maxY=height-1; }
  const silhouetteBBox = { minX, minY, maxX, maxY };
  const headTopY = minY;

  // derived shoulder line (widest figure row in the upper-body band)
  let shoulderY = 470, shoulderLeftX = minX, shoulderRightX = maxX, bestW = -1;
  const yA = Math.round(height * 0.25), yB = Math.round(height * 0.45);
  for (let y = yA; y <= yB; y++) {
    let lo = -1, hi = -1;
    for (let x = 0; x < width; x++) if (isFigure(x, y)) { if (lo < 0) lo = x; hi = x; }
    if (lo >= 0 && hi - lo > bestW) { bestW = hi - lo; shoulderY = y; shoulderLeftX = lo; shoulderRightX = hi; }
  }

  // skin-like approx (heuristic warm-hue range within silhouette) — APPROXIMATE
  let sMinX=width,sMinY=height,sMaxX=-1,sMaxY=-1,skinCount=0;
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    if (!isFigure(x,y)) continue;
    const d=(y*width+x)*4, r=rgba[d], g=rgba[d+1], b=rgba[d+2];
    const mx=Math.max(r,g,b), mn=Math.min(r,g,b);
    // warm, moderately-saturated, mid/high value, r>g>b — coarse skin proxy
    if (r>95 && g>50 && b>35 && r>g && g>=b && (mx-mn)>12 && (mx-mn)<140 && r-b>14) {
      skinCount++; if(x<sMinX)sMinX=x; if(y<sMinY)sMinY=y; if(x>sMaxX)sMaxX=x; if(y>sMaxY)sMaxY=y;
    }
  }
  const skinLikeApprox = skinCount > 0
    ? { detected: true, count: skinCount, bbox: { minX:sMinX,minY:sMinY,maxX:sMaxX,maxY:sMaxY }, note: "coarse heuristic — REVIEW", humanReviewRequired: true }
    : { detected: false, note: "no skin-like region detected (heuristic) — REVIEW", humanReviewRequired: true };

  // ---- first-pass anchors (from 164K ×6.4 mapping; review-required noted) --
  const eyeBandTop = 356;
  const anchors = {
    head: { centerX: 512, centerY: 320, radius: 192, source: "164K ×6.4 first-pass (head not re-measured in 164L.1)" },
    eyeLeft: { x: 452, y: 385, source: "164L.1 measured (calibration grid)" },
    eyeRight: { x: 572, y: 385, source: "164L.1 measured (calibration grid)" },
    eyeBand: { x: 400, y: eyeBandTop, width: 224, height: 62, humanReviewRequired: true },
    faceOval: { centerX: 512, centerY: 388, radiusX: 158, radiusY: 152, humanReviewRequired: true },
    crown: { centerX: 512, centerY: 300, radius: 260, clipBelowY: eyeBandTop, humanReviewRequired: true },
    shoulderLine: { y: shoulderY, leftX: shoulderLeftX, rightX: shoulderRightX, derived: true, humanReviewRequired: true },
    silhouetteBBox,
    headTopY,
  };

  const template = {
    schema: "avatar-anchor-template/v1",
    canvas: { width: EXPECT_W, height: EXPECT_H, servedWidth: 512, servedHeight: 768 },
    source: { file: "assets/avatar/reference/Northstar Master.png", sha256, colorType, background },
    anchors,
    protectedZones: {
      face: anchors.faceOval,
      eyes: anchors.eyeBand,
      hairApprox: { minX, minY: headTopY, maxX, maxY: anchors.faceOval.centerY, note: "above face within head — REVIEW", humanReviewRequired: true },
      bodyApprox: { minX, minY: shoulderY, maxX, maxY, note: "below shoulder line — REVIEW", humanReviewRequired: true },
      handsApprox: { detected: false, note: "placeholder — refine in review", humanReviewRequired: true },
      skinLikeApprox,
    },
    review: {
      humanReviewRequired: true,
      fieldsRequiringReview: ["eyeBand", "faceOval", "crown/headwear region", "shoulderLine", "mask usefulness"],
    },
    notes: [
      "First-pass deterministic extraction (164L / D-041). NON-AI.",
      "Anchors are starting values — eye band & face oval MUST be measured/confirmed on the Master.",
      "Masks are QA/build artifacts only, NOT runtime assets; never used to alter geometry.",
    ],
  };

  // ---- masks (MAGENTA opaque = allowed region, transparent = outside) -----
  // Allowed = alpha 255 (opaque magenta, visible for human review);
  // forbidden = alpha 0 (transparent). Machine overflow check: allowed = alpha>0.
  const W = [255, 0, 255, 255];
  const blank = () => new Uint8Array(width * height * 4); // all transparent
  const masks = {};

  // aura: generous full canvas (behind avatar)
  { const m = blank(); fillRectBuf(m, width, height, 0, 0, width - 1, height - 1, W); masks.aura = m; }
  // back: generous behind shoulder/back (large ellipse around upper body)
  { const m = blank(); fillEllipseBuf(m, width, height, 512, Math.min(720, shoulderY + 220), 470, 540, W); masks.back = m; }
  // headwear: moderate crown/upper-head, EXCLUDE eye band (clip below eyeBandTop)
  { const m = blank(); fillEllipseBuf(m, width, height, 512, 300, 260, 260, W, (x, y) => y < eyeBandTop); masks.headwear = m; }
  // face/masks: tight face oval (calibrated 164L.1)
  { const m = blank(); fillEllipseBuf(m, width, height, 512, 388, 158, 152, W); masks.face = m; }
  // eyes/glasses: tight eye band + temple arms (approved eye-overlap exception; calibrated 164L.1)
  { const m = blank();
    fillRectBuf(m, width, height, 400, 356, 623, 417, W);            // eye band
    fillRectBuf(m, width, height, 360, 374, 400, 406, W);            // left temple
    fillRectBuf(m, width, height, 624, 374, 664, 406, W);            // right temple
    masks.eyes = m; }

  // ---- anchor overlay (guides drawn over a COPY of the Master) ------------
  const overlay = Uint8Array.from(rgba);
  const CYAN=[0,200,255,255], RED=[255,40,40,255], YEL=[255,220,0,255],
        MAG=[255,0,200,255], GRN=[0,220,80,255], ORG=[255,140,0,255], WHT=[255,255,255,255];
  strokeRect(overlay, width, height, minX, minY, maxX, maxY, WHT, 2);                 // silhouette bbox
  strokeEllipse(overlay, width, height, 512, 320, 192, 192, CYAN, 2);                 // head circle
  strokeEllipse(overlay, width, height, 512, 388, 158, 152, MAG, 2);                  // face oval (calibrated 164L.1)
  strokeEllipse(overlay, width, height, 512, 300, 260, 260, GRN, 1);                  // crown region
  strokeRect(overlay, width, height, 400, 356, 623, 417, YEL, 2);                     // eye band (calibrated 164L.1)
  for (const e of [[452,385],[572,385]]) fillEllipseBuf(overlay, width, height, e[0], e[1], 6, 6, RED); // eye centres
  strokeLine(overlay, width, height, shoulderLeftX, shoulderY, shoulderRightX, shoulderY, ORG, 3);      // shoulder line

  // ---- write artifacts -----------------------------------------------------
  for (const d of Object.values(OUT)) mkdirSync(d, { recursive: true });
  writeFileSync(join(OUT.anchors, "avatar-anchor-template-v1.json"), JSON.stringify(template, null, 2));
  writeFileSync(join(OUT.previews, "anchor-overlay-v1.png"), encodePNG(width, height, overlay));
  for (const [slot, m] of Object.entries(masks))
    writeFileSync(join(OUT.masks, `mask-${slot}-v1.png`), encodePNG(width, height, m));

  // ---- report --------------------------------------------------------------
  const report = {
    masterDimensions: `${width}x${height}`,
    background, colorType, sha256,
    silhouetteBBox, headTopY,
    shoulderLine: anchors.shoulderLine,
    skinLike: skinLikeApprox.detected ? { count: skinCount } : "none",
    warnings,
    humanReviewRequired: true,
    generated: [
      "tools/avatar/build/anchors/avatar-anchor-template-v1.json",
      "tools/avatar/build/previews/anchor-overlay-v1.png",
      ...Object.keys(masks).map(s => `tools/avatar/build/masks/mask-${s}-v1.png`),
    ],
  };
  console.log(JSON.stringify(report, null, 2));
}

main();
