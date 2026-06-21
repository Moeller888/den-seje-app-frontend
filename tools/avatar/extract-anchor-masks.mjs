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
import { fileURLToPath, pathToFileURL } from "node:url";
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

// ── MANUAL_ANCHOR_OVERRIDES_164L2 (primitive model, 164L.3) ───────────────────
// Manual VISUAL calibration for `Northstar Master.png` (1024×1536), measured by a
// human against high-zoom coordinate grids. PRIMITIVE model (164L.3): tight per-eye
// boxes, a narrow glasses band, a tight face rounded-rect, an upper-head headwear
// region, a DIAGNOSTIC head+hair box, and explicit shoulder POINTS + a back box —
// replacing the earlier broad ellipses (rejected as imprecise).
//   * These are the authoritative anchor geometry for the Master.
//   * silhouette bbox / skin-like / headHairRegion are DIAGNOSTIC ONLY.
//   * FUTURE RECALIBRATION: edit ONLY this block.
//   * All anchors remain humanReviewRequired until a human signs the worksheet.
const MANUAL_ANCHOR_OVERRIDES_164L2 = {
  // A. per-eye boxes — 164L.4: widened + slightly taller to cover the FULL visible eye
  //    (sclera + iris + outline), not just the iris. Iris centre stays ≈ (405/605, 393).
  eyeLeftBox:  { x: 347, y: 351, width: 116, height: 84 },   // x347–463, y351–435
  eyeRightBox: { x: 547, y: 351, width: 116, height: 84 },   // x547–663, y351–435
  // B. glasses band — 164L.4: top raised, taller, slightly wider (room for frame/bridge/
  //    temples); still narrower than a broad band — stays off cheek/nose.
  glassesBand: { x: 338, y: 352, width: 340, height: 74, templeW: 44, templeInsetY: 18 }, // y352–426
  // C. face mask region — 164L.4: narrower + shorter (lower edge raised); excl hair/ears/neck.
  faceMaskRegion: { x: 402, y: 308, width: 220, height: 192, radius: 64 }, // x402–622, y308–500
  // D. headwear region — 164L.4: lower boundary raised to stop clearly above brows.
  headwearRegion: { x: 344, y: 120, width: 336, height: 200, radius: 70 }, // x344–680, y120–320
  // E. head+hair region — DIAGNOSTIC broad box only (NOT the headwear mask) — unchanged
  headHairRegion: { minX: 270, minY: 40, maxX: 758, maxY: 470 },
  // F. shoulder/back ANCHOR METADATA — points + a small attach/reference box (NOT the mask)
  shoulderBackAnchors: {
    leftShoulderPoint:  { x: 340, y: 568 },
    rightShoulderPoint: { x: 684, y: 568 },
    backAttachBox: { x: 330, y: 540, width: 364, height: 320 }, // attach/reference only (overlay metadata)
  },
  // G. backMaskRegion — 164L.5: GENEROUS behind-avatar region for the back-slot mask
  //    (wings / capes / backpacks). Wider than the torso, starts at the upper back,
  //    extends outward + down. This — NOT backAttachBox — drives mask-back-v1.png.
  backMaskRegion: { x: 210, y: 430, width: 600, height: 500, radius: 80 }, // x210–810, y430–930
};

// ── MANUAL_EYE_SEMANTIC_ANCHORS_164S (strict eye semantics — human-review correction) ─────
// 164S CORRECTION. The first 164S attempt measured a broad dark eye-mass / the eye-box
// geometric centre and mislabeled it `pupilCenter`; those markers landed BESIDE the black
// pupil (human review = FAIL). These are STRICT, mutually distinct, MANUAL semantic anchors,
// measured by high-zoom (6×) visual review of `Northstar Master.png` (1024×1536). They are
// NOT centroids of dark pixel mass and they are NOT derived from the eye boxes.
//   * pupilCenter             = centre of the BLACK pupil oval ONLY. Excludes eyelash/outline,
//                               the white catch-light, and the brown iris. The two pupils are
//                               converged nasally and sit slightly low (spacing ≈ 131px).
//   * irisCenter              = centre of the BROWN iris disk. Distinct from the pupil — the
//                               pupil is offset nasally + downward within the iris
//                               (iris spacing ≈ 145px).
//   * glassesLensVisualCenter = centre of the whole EYE OPENING (iris + sclera crescents),
//                               chosen so a round lens drawn here is CONCENTRIC with the eye
//                               and SURROUNDS it naturally. Deliberately NOT the pupil centre
//                               (a pupil-centred lens would sit nasal + low and clip the eye).
//                               Visual-centre spacing ≈ 153px; bridge midpoint ≈ (504, 386).
// REVIEW FLAG (raised by 164S, ADDRESSED by 164T below): the OLD 164L eye BOXES (centres
// 405,393 / 605,393) were ~22–25px TEMPORAL of the real eyes — boxes/glassesBand/eyes-mask
// were mis-centred. 164T (MANUAL_ANCHOR_OVERRIDES_164T) recalibrates them to these semantic
// centres. The semantic anchor VALUES in this block are unchanged.
// FUTURE RECALIBRATION of eye semantics: edit ONLY this block.
const MANUAL_EYE_SEMANTIC_ANCHORS_164S = {
  left:  { pupilCenter: { x: 439, y: 394 }, irisCenter: { x: 432, y: 387 }, glassesLensVisualCenter: { x: 427, y: 386 } },
  right: { pupilCenter: { x: 570, y: 393 }, irisCenter: { x: 577, y: 387 }, glassesLensVisualCenter: { x: 580, y: 386 } },
  derived: {
    pupilSpacingPx: 131, irisSpacingPx: 145, lensVisualSpacingPx: 153,
    glassesBridgePoint: { x: 504, y: 386 },
  },
  source: "164S manual high-zoom (6×) visual calibration of Northstar Master.png",
  humanReviewRequired: true,
};

// ── MANUAL_ANCHOR_OVERRIDES_164T (eye box + glasses front-slot recalibration) ──────────────
// 164T. 164S corrected the eye SEMANTICS but flagged that the 164L eye BOXES / glassesBand /
// eyes-mask were still ~22–25px TEMPORAL of the real eyes, and the band (y352–426) was too
// SHORT — it clipped a lens that properly surrounds the eye (preClipOverflowPx = 1324).
// This layer OVERRIDES ONLY eyeLeftBox / eyeRightBox / glassesBand so they align with the
// 164S glassesLensVisualCenter (eye-opening centres 427,386 / 580,386). Everything else stays
// from 164L2; the OLD 164L values are kept above (documented) for comparison.
//   * eye boxes   : centred on the eye-opening (visualCenter), sized to contain the FULL eye
//                   (sclera+iris+pupil+outline) + room for a front lens frame. NOT the box centre,
//                   and avoiding brow/ear/hair. These doubly serve as the two LENS zones.
//   * glasses slot: FRONT-ONLY — two lens zones (= the eye boxes) + a SMALL bridge zone + TINY
//                   side tabs. NO long temples / ear hooks / broad side arms. `glassesBand` (the
//                   bounding rect) is kept for the overlay + the raw-centring fallback; the eyes
//                   MASK is the union(eyeLeftBox, eyeRightBox, bridge, two tiny tabs).
// FUTURE RECALIBRATION of eye boxes / glasses slot: edit ONLY this block.
const MANUAL_ANCHOR_OVERRIDES_164T = {
  eyeLeftBox:  { x: 378, y: 336, width: 98, height: 100 }, // x378–476 y336–436, centre (427,386)  [was x347–463 y351–435, centre (405,393)]
  eyeRightBox: { x: 531, y: 336, width: 98, height: 100 }, // x531–629 y336–436, centre (580,386)  [was x547–663 y351–435, centre (605,393)]
  glassesBand: {
    x: 378, y: 335, width: 251, height: 102,               // bounding band (overlay + raw-centring) x378–629 y335–437  [was x338–678 y352–426]
    templeW: 16, templeInsetY: 44,                          // TINY side-tab allowance ONLY  [was templeW 44 (long arms)]
    bridge: { x: 473, y: 368, width: 62, height: 34 },      // SMALL bridge zone x473–535 y368–402
  },
};

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
function fillRoundRect(buf, w, h, x0, y0, x1, y1, r, col) {
  const ix0 = x0 + r, ix1 = x1 - r, iy0 = y0 + r, iy1 = y1 - r;
  for (let y = Math.max(0, y0 | 0); y <= Math.min(h - 1, y1 | 0); y++)
    for (let x = Math.max(0, x0 | 0); x <= Math.min(w - 1, x1 | 0); x++) {
      let inside;
      if (x >= ix0 && x <= ix1) inside = true;            // middle vertical band
      else if (y >= iy0 && y <= iy1) inside = true;       // middle horizontal band
      else { const cx = x < ix0 ? ix0 : ix1, cy = y < iy0 ? iy0 : iy1; inside = (x - cx) ** 2 + (y - cy) ** 2 <= r * r; }
      if (inside) setPx(buf, w, h, x, y, col);
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

  // Shoulder/back = MANUAL calibrated POINTS + back box (164L.3). The old "widest
  // figure row" heuristic (and the single shoulder line) are REMOVED. The silhouette
  // bbox is DIAGNOSTIC ONLY and is NOT the shoulder authority.
  const shoulderTopY = Math.min(
    MANUAL_ANCHOR_OVERRIDES_164L2.shoulderBackAnchors.leftShoulderPoint.y,
    MANUAL_ANCHOR_OVERRIDES_164L2.shoulderBackAnchors.rightShoulderPoint.y);

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

  // ---- anchors = MANUAL_ANCHOR_OVERRIDES_164L2 primitive model (164L.3) ------
  // 164T: eye boxes + glassesBand are overridden by MANUAL_ANCHOR_OVERRIDES_164T; all other
  // anchors remain from 164L2. Old 164L values stay documented in their block for comparison.
  const O = { ...MANUAL_ANCHOR_OVERRIDES_164L2, ...MANUAL_ANCHOR_OVERRIDES_164T };
  const ES = MANUAL_EYE_SEMANTIC_ANCHORS_164S;
  // eyeLeftBoxCenter / eyeRightBoxCenter = box GEOMETRIC centres. 164S: these are NO LONGER
  // labeled `irisCenter` (that was the wrong, "beside-the-pupil" value). They are kept as
  // `boxCenter` for diagnostic comparison only; the true eye semantics come from ES.
  const eyeLeftBoxCenter  = { x: O.eyeLeftBox.x  + O.eyeLeftBox.width  / 2, y: O.eyeLeftBox.y  + O.eyeLeftBox.height  / 2 };
  const eyeRightBoxCenter = { x: O.eyeRightBox.x + O.eyeRightBox.width / 2, y: O.eyeRightBox.y + O.eyeRightBox.height / 2 };
  const anchors = {
    eyeLeftBox:  { ...O.eyeLeftBox,  boxCenter: eyeLeftBoxCenter,  pupilCenter: ES.left.pupilCenter,  irisCenter: ES.left.irisCenter,  glassesLensVisualCenter: ES.left.glassesLensVisualCenter,  source: "164L.3 box geom + 164S eye semantics", humanReviewRequired: true },
    eyeRightBox: { ...O.eyeRightBox, boxCenter: eyeRightBoxCenter, pupilCenter: ES.right.pupilCenter, irisCenter: ES.right.irisCenter, glassesLensVisualCenter: ES.right.glassesLensVisualCenter, source: "164L.3 box geom + 164S eye semantics", humanReviewRequired: true },
    eyeSemanticAnchors: { ...ES, note: "164S strict eye semantics — pupil ≠ iris ≠ glasses lens visual centre" },
    equipmentTypeAnchors: {
      glasses: {
        leftLens:  { visualCenter: ES.left.glassesLensVisualCenter,  note: "lens centres on eye-opening (surrounds eye), NOT the pupil" },
        rightLens: { visualCenter: ES.right.glassesLensVisualCenter, note: "lens centres on eye-opening (surrounds eye), NOT the pupil" },
        bridge: { targetPoint: ES.derived.glassesBridgePoint },
        source: "164S",
        humanReviewRequired: true,
      },
    },
    glassesBand: { ...O.glassesBand, source: "164L.3 manual visual calibration", humanReviewRequired: true },
    faceMaskRegion: { ...O.faceMaskRegion, shape: "rounded-rect", source: "164L.3 manual visual calibration", humanReviewRequired: true },
    headwearRegion: { ...O.headwearRegion, shape: "rounded-rect", source: "164L.3 manual visual calibration", humanReviewRequired: true },
    headHairRegion: { ...O.headHairRegion, note: "DIAGNOSTIC broad region only — NOT the headwear mask", diagnostic: true },
    shoulderBackAnchors: { ...O.shoulderBackAnchors, note: "anchor metadata (points + attach/reference box) — NOT the back mask", source: "164L.3 manual visual calibration", humanReviewRequired: true },
    backMaskRegion: { ...O.backMaskRegion, shape: "rounded-rect", note: "generous back-slot mask region (164L.5)", source: "164L.5 manual visual calibration", humanReviewRequired: true },
    silhouetteBBox: { ...silhouetteBBox, note: "DIAGNOSTIC ONLY — not an anchor authority" },
    headTopY,
  };

  const template = {
    schema: "avatar-anchor-template/v1",
    canvas: { width: EXPECT_W, height: EXPECT_H, servedWidth: 512, servedHeight: 768 },
    source: { file: "assets/avatar/reference/Northstar Master.png", sha256, colorType, background },
    anchors,
    protectedZones: {
      face: anchors.faceMaskRegion,
      eyes: { eyeLeftBox: O.eyeLeftBox, eyeRightBox: O.eyeRightBox, glassesBand: O.glassesBand },
      hairApprox: { minX, minY: headTopY, maxX, maxY: O.faceMaskRegion.y, note: "above face within head — DIAGNOSTIC", diagnostic: true },
      bodyApprox: { minX, minY: shoulderTopY, maxX, maxY, note: "below shoulders — DIAGNOSTIC", diagnostic: true },
      handsApprox: { detected: false, note: "placeholder — refine in review", humanReviewRequired: true },
      skinLikeApprox,
    },
    review: {
      humanReviewRequired: true,
      calibration: "164L.3 primitive anchor model (MANUAL_ANCHOR_OVERRIDES_164L2) + 164S eye semantics (MANUAL_EYE_SEMANTIC_ANCHORS_164S)",
      fieldsRequiringReview: ["eyeLeftBox", "eyeRightBox", "glassesBand", "faceMaskRegion", "headwearRegion", "shoulderBackAnchors", "mask usefulness", "eyeSemanticAnchors (pupil/iris/glasses lens centres)"],
    },
    notes: [
      "Deterministic, NON-AI extraction (164L.3 / D-041).",
      "Anchor geometry = MANUAL_ANCHOR_OVERRIDES_164L2 PRIMITIVE model: tight eye boxes, narrow glasses band, face rounded-rect, upper-head headwear region, shoulder points + back box.",
      "164S: eyeSemanticAnchors add STRICT, distinct pupil / iris / glasses-lens-visual centres (pupilCenter = black pupil oval; irisCenter = brown disk; glassesLensVisualCenter = eye-opening centre). The box centre is NO LONGER labeled irisCenter.",
      "164T: eyeLeftBox/eyeRightBox/glassesBand RECALIBRATED (MANUAL_ANCHOR_OVERRIDES_164T) — boxes re-centred on the eye openings (visualCenter); eyes-mask is now a FRONT-ONLY union(lens zones, small bridge, tiny tabs) that no longer clips a lens which surrounds the eye. Old 164L box/band values kept for comparison.",
      "silhouetteBBox / skinLikeApprox / headHairRegion are DIAGNOSTIC ONLY, not anchor authorities.",
      "Masks are QA/build artifacts only, NOT runtime assets; never used to alter geometry.",
      "All anchors remain humanReviewRequired until a human signs the 164L worksheet.",
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
  // back: GENEROUS behind-avatar region (164L.5 backMaskRegion) — for wings/capes/backpacks
  { const m = blank(); const br = O.backMaskRegion;
    fillRoundRect(m, width, height, br.x, br.y, br.x + br.width, br.y + br.height, br.radius, W); masks.back = m; }
  // headwear: upper-head region (rounded-rect; stops above eyebrows)
  { const m = blank(); const hr = O.headwearRegion;
    fillRoundRect(m, width, height, hr.x, hr.y, hr.x + hr.width, hr.y + hr.height, hr.radius, W); masks.headwear = m; }
  // face/masks: tight face region (rounded-rect; excl hair/ears, not to neck)
  { const m = blank(); const fr = O.faceMaskRegion;
    fillRoundRect(m, width, height, fr.x, fr.y, fr.x + fr.width, fr.y + fr.height, fr.radius, W); masks.face = m; }
  // eyes/glasses (164T): FRONT-ONLY slot = union(left lens zone, right lens zone, small bridge,
  // two TINY side tabs). NO long temples/ear hooks — so it contains a lens that surrounds the eye
  // without clipping, while still rejecting long side arms.
  { const m = blank(); const gb = O.glassesBand, lb = O.eyeLeftBox, rb = O.eyeRightBox;
    const ty0 = gb.y + gb.templeInsetY, ty1 = gb.y + gb.height - gb.templeInsetY;
    fillRectBuf(m, width, height, lb.x, lb.y, lb.x + lb.width, lb.y + lb.height, W);                       // left lens zone (= eye box)
    fillRectBuf(m, width, height, rb.x, rb.y, rb.x + rb.width, rb.y + rb.height, W);                       // right lens zone (= eye box)
    fillRectBuf(m, width, height, gb.bridge.x, gb.bridge.y, gb.bridge.x + gb.bridge.width, gb.bridge.y + gb.bridge.height, W); // small bridge zone
    fillRectBuf(m, width, height, lb.x - gb.templeW, ty0, lb.x, ty1, W);                                   // left tiny side tab
    fillRectBuf(m, width, height, rb.x + rb.width, ty0, rb.x + rb.width + gb.templeW, ty1, W);             // right tiny side tab
    masks.eyes = m; }

  // ---- anchor overlay (guides drawn over a COPY of the Master) ------------
  const overlay = Uint8Array.from(rgba);
  const CYAN=[0,200,255,255], RED=[255,40,40,255], YEL=[255,220,0,255],
        MAG=[255,0,200,255], GRN=[0,220,80,255], ORG=[255,140,0,255], WHT=[255,255,255,255], BLU=[40,120,255,255];
  strokeRect(overlay, width, height, minX, minY, maxX, maxY, WHT, 1);                                       // silhouette bbox (diagnostic)
  const HHR = O.headHairRegion;
  strokeRect(overlay, width, height, HHR.minX, HHR.minY, HHR.maxX, HHR.maxY, CYAN, 1);                       // headHairRegion (DIAGNOSTIC)
  const HW = O.headwearRegion;
  strokeRect(overlay, width, height, HW.x, HW.y, HW.x + HW.width, HW.y + HW.height, GRN, 2);                 // headwearRegion
  const FR = O.faceMaskRegion;
  strokeRect(overlay, width, height, FR.x, FR.y, FR.x + FR.width, FR.y + FR.height, MAG, 2);                 // faceMaskRegion
  const GB = O.glassesBand;
  strokeRect(overlay, width, height, GB.x, GB.y, GB.x + GB.width, GB.y + GB.height, YEL, 1);                 // glassesBand bounding (diagnostic)
  // 164T front-slot SHAPE = eye boxes (lens zones) + small bridge + tiny tabs (the actual eyes mask)
  strokeRect(overlay, width, height, GB.bridge.x, GB.bridge.y, GB.bridge.x + GB.bridge.width, GB.bridge.y + GB.bridge.height, YEL, 2); // small bridge zone
  { const ty0 = GB.y + GB.templeInsetY, ty1 = GB.y + GB.height - GB.templeInsetY;
    strokeRect(overlay, width, height, O.eyeLeftBox.x - GB.templeW, ty0, O.eyeLeftBox.x, ty1, ORG, 1);        // left tiny tab
    strokeRect(overlay, width, height, O.eyeRightBox.x + O.eyeRightBox.width, ty0, O.eyeRightBox.x + O.eyeRightBox.width + GB.templeW, ty1, ORG, 1); } // right tiny tab
  strokeRect(overlay, width, height, O.eyeLeftBox.x, O.eyeLeftBox.y, O.eyeLeftBox.x + O.eyeLeftBox.width, O.eyeLeftBox.y + O.eyeLeftBox.height, RED, 2);   // eyeLeftBox
  strokeRect(overlay, width, height, O.eyeRightBox.x, O.eyeRightBox.y, O.eyeRightBox.x + O.eyeRightBox.width, O.eyeRightBox.y + O.eyeRightBox.height, RED, 2); // eyeRightBox
  // 164S distinct eye-centre markers (per eye):
  //   WHITE hollow ring = OLD box centre (the previously-WRONG "irisCenter", diagnostic only)
  //   GREEN dot         = irisCenter (brown disk)
  //   RED  dot          = pupilCenter (black pupil oval — the corrected target)
  //   YELLOW dot+ring   = glasses lens visualCenter (ring shows the lens that surrounds the eye)
  for (const [sem, boxC] of [[ES.left, eyeLeftBoxCenter], [ES.right, eyeRightBoxCenter]]) {
    strokeEllipse(overlay, width, height, boxC.x, boxC.y, 6, 6, WHT, 1);                                     // old box centre (diagnostic)
    strokeEllipse(overlay, width, height, sem.glassesLensVisualCenter.x, sem.glassesLensVisualCenter.y, 46, 48, YEL, 1); // glasses lens (surrounds eye)
    fillEllipseBuf(overlay, width, height, sem.glassesLensVisualCenter.x, sem.glassesLensVisualCenter.y, 3, 3, YEL);     // glasses lens visualCenter
    fillEllipseBuf(overlay, width, height, sem.irisCenter.x, sem.irisCenter.y, 3, 3, GRN);                   // irisCenter
    fillEllipseBuf(overlay, width, height, sem.pupilCenter.x, sem.pupilCenter.y, 3, 3, RED);                 // pupilCenter
  }
  const SBA = O.shoulderBackAnchors, BMR = O.backMaskRegion;
  strokeRect(overlay, width, height, BMR.x, BMR.y, BMR.x + BMR.width, BMR.y + BMR.height, BLU, 3);            // backMaskRegion (ACTUAL back mask)
  strokeRect(overlay, width, height, SBA.backAttachBox.x, SBA.backAttachBox.y, SBA.backAttachBox.x + SBA.backAttachBox.width, SBA.backAttachBox.y + SBA.backAttachBox.height, ORG, 2); // backAttachBox (reference)
  fillEllipseBuf(overlay, width, height, SBA.leftShoulderPoint.x, SBA.leftShoulderPoint.y, 9, 9, ORG);       // shoulder points
  fillEllipseBuf(overlay, width, height, SBA.rightShoulderPoint.x, SBA.rightShoulderPoint.y, 9, 9, ORG);

  // ---- write artifacts -----------------------------------------------------
  for (const d of Object.values(OUT)) mkdirSync(d, { recursive: true });
  writeFileSync(join(OUT.anchors, "avatar-anchor-template-v1.json"), JSON.stringify(template, null, 2));
  writeFileSync(join(OUT.previews, "anchor-overlay-v1.png"), encodePNG(width, height, overlay));
  // head-preview-v1.png — permanent zoomed (2×) head crop of the anchor overlay,
  // for precise human review of eye boxes / glasses band / face & headwear regions. QA artifact only.
  {
    const cx0 = 240, cy0 = 40, cw = 540, ch = 560, S = 2;
    const o = new Uint8Array(cw * S * ch * S * 4);
    for (let y = 0; y < ch * S; y++) for (let x = 0; x < cw * S; x++) {
      const sx = cx0 + ((x / S) | 0), sy = cy0 + ((y / S) | 0), sd = (sy * width + sx) * 4, dd = (y * (cw * S) + x) * 4;
      o[dd] = overlay[sd]; o[dd + 1] = overlay[sd + 1]; o[dd + 2] = overlay[sd + 2]; o[dd + 3] = 255;
    }
    writeFileSync(join(OUT.previews, "head-preview-v1.png"), encodePNG(cw * S, ch * S, o));
  }
  // eyes-preview-v1.png — 164S/164T high-zoom (6×) crop of BOTH eyes from the anchor overlay, so
  // the pupil/iris/glasses-lens markers AND the recalibrated eye boxes / front-slot can be verified
  // against the actual eyes. QA artifact only.
  {
    const cx0 = 330, cy0 = 325, cw = 350, ch = 135, S = 6;
    const o = new Uint8Array(cw * S * ch * S * 4);
    for (let y = 0; y < ch * S; y++) for (let x = 0; x < cw * S; x++) {
      const sx = cx0 + ((x / S) | 0), sy = cy0 + ((y / S) | 0), sd = (sy * width + sx) * 4, dd = (y * (cw * S) + x) * 4;
      o[dd] = overlay[sd]; o[dd + 1] = overlay[sd + 1]; o[dd + 2] = overlay[sd + 2]; o[dd + 3] = 255;
    }
    writeFileSync(join(OUT.previews, "eyes-preview-v1.png"), encodePNG(cw * S, ch * S, o));
  }
  for (const [slot, m] of Object.entries(masks))
    writeFileSync(join(OUT.masks, `mask-${slot}-v1.png`), encodePNG(width, height, m));

  // ---- report --------------------------------------------------------------
  const report = {
    masterDimensions: `${width}x${height}`,
    background, colorType, sha256,
    silhouetteBBox, headTopY,
    eyeLeftBox: O.eyeLeftBox, eyeRightBox: O.eyeRightBox,
    glassesBand: O.glassesBand,
    recalibration164T: {
      old: { eyeLeftBox: MANUAL_ANCHOR_OVERRIDES_164L2.eyeLeftBox, eyeRightBox: MANUAL_ANCHOR_OVERRIDES_164L2.eyeRightBox, glassesBand: MANUAL_ANCHOR_OVERRIDES_164L2.glassesBand },
      new: { eyeLeftBox: MANUAL_ANCHOR_OVERRIDES_164T.eyeLeftBox, eyeRightBox: MANUAL_ANCHOR_OVERRIDES_164T.eyeRightBox, glassesBand: MANUAL_ANCHOR_OVERRIDES_164T.glassesBand },
      note: "eye boxes re-centred on the 164S eye-opening/visualCenter; eyes-mask = union(lens zones, small bridge, tiny tabs); front-only (no long temples).",
    },
    eyeSemanticAnchors164S: ES,
    shoulderBackAnchors: O.shoulderBackAnchors,
    skinLike: skinLikeApprox.detected ? { count: skinCount } : "none",
    warnings,
    humanReviewRequired: true,
    generated: [
      "tools/avatar/build/anchors/avatar-anchor-template-v1.json",
      "tools/avatar/build/previews/anchor-overlay-v1.png",
      "tools/avatar/build/previews/head-preview-v1.png",
      "tools/avatar/build/previews/eyes-preview-v1.png",
      ...Object.keys(masks).map(s => `tools/avatar/build/masks/mask-${s}-v1.png`),
    ],
  };
  console.log(JSON.stringify(report, null, 2));
}

// Reusable primitives for sibling tools (e.g. 164M test-item pilot). Importing this
// module has NO side effects; main() runs only when invoked directly.
export {
  decodePNG, encodePNG, setPx, fillRectBuf, fillEllipseBuf, fillRoundRect,
  strokeRect, strokeEllipse, strokeLine, MANUAL_ANCHOR_OVERRIDES_164L2,
  MANUAL_ANCHOR_OVERRIDES_164T, MANUAL_EYE_SEMANTIC_ANCHORS_164S,
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
