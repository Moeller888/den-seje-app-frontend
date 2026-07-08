// 167A Phase-2 — D-042 neutral-outfit MASK REFINEMENT + prompt-pack (deterministic, review-only).
// ---------------------------------------------------------------------------
// Plan of record: docs/167a-phase2-neutral-outfit-base-assembly-plan.md (Strategy B)
// Predecessor:    tools/avatar/build-base-assembly-masks.mjs (approximate mask PROPOSALS, PR #26)
// Policy:         D-042 (AI-assisted MASKED edits on the frozen Master only; identity-lock preserved
//                 via masking + the 164B.3 gate). This tool is the DETERMINISTIC PREP for that later,
//                 separately-approved masked edit — it does NOT run any AI / ComfyUI and executes NO
//                 neutral outfit.
//
// WHY THIS EXISTS (the base-assembly review left these open — §6 caveats):
//   The colour-segmentation proposals from build-base-assembly-masks.mjs are APPROXIMATE: the interior
//   orange star, cuff stripes, cargo pocket and dark line-art fall OUTSIDE the colour match, leaving
//   holes; edges are noisy. A masked AI edit needs SOLID, gap-free, feathered regions plus an explicit
//   PROTECT region (identity-lock). This tool refines the proposals deterministically:
//     * morphological CLOSE + HOLE-FILL  → swallow the star / cuff-stripe / pocket / line-art gaps,
//     * connected-components keep         → drop stray speckles,
//     * a small FEATHER dilation (clipped to the figure) → an inpaint blend band,
//     * a PROTECT mask (figure − outfit)  → the head/face/scalp/hands/skin the edit must NOT touch,
//     * a hard identity-lock assertion    → the outfit-edit union must not intrude the head zone.
//   It also emits a per-region PROMPT PACK for the later masked edit.
//
// WHAT THIS IS NOT:
//   * NOT a final/completed base. NOT neutral-outfit execution. NOT a Gate-2 pass. NOT Gate 3
//     (no face/eyes/eyelid/hair — the head stays bald + blank; build-face-clean.mjs NOT used).
//   * NOT AI, NOT ComfyUI. NOT runtime. NOT promotion. NO assets/avatar-r2 write, NO R2_MANIFEST
//     change, AVATAR_R2 stays false.
//   * Masks are REFINED REVIEW-ONLY PROPOSALS — still human-review-gated before any masked edit.
//
// DIRECTION RULE (identical to build-base-assembly-masks.mjs / build-gate2a-registration.mjs):
//   recovery = Master + (+25 x, +285 y)  →  place recovery INTO the Master frame by (−25, −285):
//   registered[x,y] = recovery[x + 25, y + 285].
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { inflateSync, deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, sep } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const MASTER    = join(REPO, "assets", "avatar", "reference", "Northstar Master.png");
const RECOVERY  = join(REPO, "assets", "avatar", "reference", "recovery-base-v1-blankface.png");
const REFERENCE = join(REPO, "assets", "avatar", "reference", "Northstar Master - reference.png"); // appearance-only, never geometry

// Frozen input contract (D-032) — Master remains canonical; abort on mismatch.
const MASTER_EXPECT_SHA = "2ca10ef868b9564164f28afc8bb03baec99cc10fd03f7200ed2dc58edd607a21";
const EXPECT_W = 1024, EXPECT_H = 1536;

// ── Pinned constants (accidental edits must fail fast) ───────────────────────
// Registration + assembly seam are inherited unchanged from the reviewed base-assembly tool.
const MASTER_TO_RECOVERY = Object.freeze({ x: 25,  y: 285 });
const RECOVERY_TO_MASTER = Object.freeze({ x: -25, y: -285 });
const SEAM_Y = 560;                                       // head contribution ends here (Master frame)
const SEAM_BAND = Object.freeze({ y0: 540, y1: 580 });    // neck/collar seam band
const HEAD_X = Object.freeze({ x0: 250, x1: 790 });       // horizontal bound of the head contribution
// Outfit region seeds (inherited from build-base-assembly-masks.mjs — same colour predicates/bands).
const SHOES_Y0 = 1300;                                     // feet zone (Master feet baseline ≈ y1508)
const GREEN_MAX_Y = 1100;                                  // sweater colour valid above this
const NAVY_MIN_Y = 820;                                    // cargo colour valid below this
const UNDERARM = Object.freeze({ y0: 760, y1: 990, xInL: 430, xInR: 600 }); // forearm/lower-sleeve band
// Refinement parameters (deterministic).
const CLOSE_ITERS   = 6;   // morphological close radius — swallows star/cuff/pocket/line-art interior gaps
const KEEP_MIN_PX   = 200; // connected-component minimum — drops stray speckles
const FEATHER_ITERS = 4;   // inpaint blend band (dilation, clipped to the figure)
const SEAM_FEATHER  = 6;   // extra dilation for the neck/collar seam-feather band

function assertConstants() {
  const ok =
    MASTER_TO_RECOVERY.x === 25 && MASTER_TO_RECOVERY.y === 285 &&
    RECOVERY_TO_MASTER.x === -MASTER_TO_RECOVERY.x && RECOVERY_TO_MASTER.y === -MASTER_TO_RECOVERY.y &&
    SEAM_BAND.y0 < SEAM_Y && SEAM_Y < SEAM_BAND.y1 &&
    CLOSE_ITERS > 0 && KEEP_MIN_PX > 0 && FEATHER_ITERS >= 0;
  if (!ok) throw new Error("Pinned constants corrupted (translation/seam/refinement) — refusing.");
}

// ── output dir (gitignored review-only) — nothing may be written outside it ──
const OUT_DIR = join(HERE, "build", "phase2", "mask-refinement");
const OUT = {
  topMask:      join(OUT_DIR, "top-edit-mask.png"),
  trousersMask: join(OUT_DIR, "trousers-edit-mask.png"),
  shoesMask:    join(OUT_DIR, "shoes-edit-mask.png"),
  underarmMask: join(OUT_DIR, "underarm-reconstruct-mask.png"),
  outfitMask:   join(OUT_DIR, "outfit-edit-mask.png"),
  protectMask:  join(OUT_DIR, "protect-mask.png"),
  seamMask:     join(OUT_DIR, "neck-seam-feather-mask.png"),
  outfitOverlay:join(OUT_DIR, "outfit-edit-over-master.png"),
  protectOverlay:join(OUT_DIR, "protect-over-master.png"),
  promptPack:   join(OUT_DIR, "d042-neutral-outfit-prompt-pack.md"),
  report:       join(OUT_DIR, "mask-refinement-report.json"),
};
function guardedPath(p) {
  const base = resolve(OUT_DIR) + sep;
  const full = resolve(p);
  if (!full.startsWith(base)) throw new Error("Refusing write outside mask-refinement dir (guardrail):\n  " + full);
  for (const f of ["assets" + sep + "avatar-r2", "R2_MANIFEST", "js" + sep + "avatar-layers"]) {
    if (full.includes(f)) throw new Error("Guardrail: output path touches forbidden target: " + f);
  }
  return full;
}

// ── minimal PNG codec (decode RGB type-2 / RGBA type-6; encode RGBA) ─────────
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const l = Buffer.alloc(4); l.writeUInt32BE(data.length, 0); const t = Buffer.from(type, "ascii"); const cc = Buffer.alloc(4); cc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0); return Buffer.concat([l, t, data, cc]); }
function paeth(a, b, c) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
function decodePng(buf, label) {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) throw new Error(label + ": not a PNG");
  let off = 8, ihdr = null; const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off); const type = buf.toString("ascii", off + 4, off + 8); const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") ihdr = { w: data.readUInt32BE(0), h: data.readUInt32BE(4), bit: data[8], ct: data[9], il: data[12] };
    else if (type === "IDAT") idat.push(data); else if (type === "IEND") break;
    off += 12 + len;
  }
  if (!ihdr) throw new Error(label + ": no IHDR");
  if (ihdr.bit !== 8 || ihdr.il !== 0 || (ihdr.ct !== 2 && ihdr.ct !== 6)) throw new Error(label + ": unsupported PNG " + JSON.stringify(ihdr));
  const ch = ihdr.ct === 6 ? 4 : 3, { w, h } = ihdr, stride = w * ch;
  const raw = inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(h * stride); let prev = Buffer.alloc(stride), p = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[p++]; const cur = raw.subarray(p, p + stride); p += stride; const out = px.subarray(y * stride, y * stride + stride);
    for (let x = 0; x < stride; x++) { const a = x >= ch ? out[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0; let v = cur[x]; if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) v += paeth(a, b, c); out[x] = v & 0xff; }
    prev = out;
  }
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { rgba[i * 4] = px[i * ch]; rgba[i * 4 + 1] = px[i * ch + 1]; rgba[i * 4 + 2] = px[i * ch + 2]; rgba[i * 4 + 3] = ch === 4 ? px[i * ch + 3] : 255; }
  return { w, h, ct: ihdr.ct, rgba };
}
function encodePngRGBA(w, h, rgba) {
  const stride = w * 4, raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) { raw[y * (stride + 1)] = 0; rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride); }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ih), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

// ── Master white-matte alpha-cut (border flood-fill; same as base-assembly / extract-master-base) ──
function alphaCutMaster(m, whiteHi = 250) {
  const { w, h, rgba } = m;
  const out = Buffer.from(rgba);
  const isMatte = (i) => rgba[i * 4] >= whiteHi && rgba[i * 4 + 1] >= whiteHi && rgba[i * 4 + 2] >= whiteHi;
  const bg = new Uint8Array(w * h); const stack = [];
  const push = (i) => { if (!bg[i] && isMatte(i)) { bg[i] = 1; stack.push(i); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (stack.length) {
    const i = stack.pop(); const x = i % w, y = (i / w) | 0;
    if (x > 0) push(i - 1); if (x < w - 1) push(i + 1); if (y > 0) push(i - w); if (y < h - 1) push(i + w);
  }
  let cut = 0;
  for (let i = 0; i < w * h; i++) if (bg[i]) { out[i * 4 + 3] = 0; cut++; }
  return { rgba: out, cut };
}

// ── predicates ───────────────────────────────────────────────────────────────
const aAt = (img, x, y) => img.rgba[(y * img.w + x) * 4 + 3];
const fig = (img, x, y) => aAt(img, x, y) > 16;
function px(img, x, y) { const i = (y * img.w + x) * 4; return { r: img.rgba[i], g: img.rgba[i + 1], b: img.rgba[i + 2], a: img.rgba[i + 3] }; }
function recAt(rec, x, y) {
  const sx = x + MASTER_TO_RECOVERY.x, sy = y + MASTER_TO_RECOVERY.y;
  if (sx < 0 || sx >= rec.w || sy < 0 || sy >= rec.h) return null;
  return px(rec, sx, sy);
}
// colour detectors (identical to base-assembly proposals — approximate seeds, then refined)
function isGreen(p) { return p.a > 16 && p.g > 70 && p.g > p.r + 15 && p.g > p.b + 15 && p.r < 160; }
function isNavy(p)  { return p.a > 16 && p.r < 90 && p.g < 100 && p.b > 45 && p.b < 130 && p.b >= p.g - 10; }

// ── binary-morphology helpers (deterministic; 8-neighbour) ───────────────────
const W = EXPECT_W, H = EXPECT_H;
function dilate(mask, iters) {
  let cur = mask;
  for (let it = 0; it < iters; it++) {
    const next = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (cur[i]) { next[i] = 1; continue; }
      if ((x > 0 && cur[i - 1]) || (x < W - 1 && cur[i + 1]) ||
          (y > 0 && cur[i - W]) || (y < H - 1 && cur[i + W]) ||
          (x > 0 && y > 0 && cur[i - W - 1]) || (x < W - 1 && y > 0 && cur[i - W + 1]) ||
          (x > 0 && y < H - 1 && cur[i + W - 1]) || (x < W - 1 && y < H - 1 && cur[i + W + 1])) next[i] = 1;
    }
    cur = next;
  }
  return cur;
}
function erode(mask, iters) {
  let cur = mask;
  for (let it = 0; it < iters; it++) {
    const next = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!cur[i]) continue;
      if (x === 0 || x === W - 1 || y === 0 || y === H - 1) continue; // border erodes away
      if (cur[i - 1] && cur[i + 1] && cur[i - W] && cur[i + W] &&
          cur[i - W - 1] && cur[i - W + 1] && cur[i + W - 1] && cur[i + W + 1]) next[i] = 1;
    }
    cur = next;
  }
  return cur;
}
// morphological close = dilate then erode (fills interior gaps ≤ iters wide without growing the region)
function close(mask, iters) { return erode(dilate(mask, iters), iters); }
// flood the background from the border over !mask; anything unreached & !mask is an interior hole → fill it
function fillHoles(mask) {
  const bgReached = new Uint8Array(W * H); const stack = [];
  const push = (i) => { if (!bgReached[i] && !mask[i]) { bgReached[i] = 1; stack.push(i); } };
  for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
  while (stack.length) {
    const i = stack.pop(); const x = i % W, y = (i / W) | 0;
    if (x > 0) push(i - 1); if (x < W - 1) push(i + 1); if (y > 0) push(i - W); if (y < H - 1) push(i + W);
  }
  const out = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) out[i] = (mask[i] || !bgReached[i]) ? 1 : 0;
  return out;
}
// keep only connected components with ≥ minPx pixels (drops speckles); returns {mask, kept, dropped}
function keepComponents(mask, minPx) {
  const lab = new Int32Array(W * H); let n = 0; const size = [0]; const stack = [];
  for (let i = 0; i < W * H; i++) {
    if (!mask[i] || lab[i]) continue;
    n++; let s = 0; stack.push(i); lab[i] = n;
    while (stack.length) {
      const j = stack.pop(); s++; const x = j % W, y = (j / W) | 0;
      const nb = [x > 0 ? j - 1 : -1, x < W - 1 ? j + 1 : -1, y > 0 ? j - W : -1, y < H - 1 ? j + W : -1];
      for (const k of nb) if (k >= 0 && mask[k] && !lab[k]) { lab[k] = n; stack.push(k); }
    }
    size[n] = s;
  }
  const out = new Uint8Array(W * H); let kept = 0, dropped = 0;
  for (let i = 0; i < W * H; i++) if (mask[i]) { if (size[lab[i]] >= minPx) { out[i] = 1; kept++; } else dropped++; }
  return { mask: out, kept, dropped };
}
function andClip(mask, figMask) { const out = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) out[i] = mask[i] && figMask[i] ? 1 : 0; return out; }
function andNot(a, b) { const out = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) out[i] = a[i] && !b[i] ? 1 : 0; return out; }
function unionOf(...masks) { const out = new Uint8Array(W * H); for (const m of masks) for (let i = 0; i < W * H; i++) if (m[i]) out[i] = 1; return out; }
function countPx(mask) { let n = 0; for (let i = 0; i < W * H; i++) if (mask[i]) n++; return n; }
function bounds(mask) {
  let minx = W, maxx = -1, miny = H, maxy = -1, n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (mask[y * W + x]) { n++; if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
  return n ? { x0: minx, x1: maxx, y0: miny, y1: maxy, px: n } : { px: 0 };
}
function maskPng(mask, rgb) {
  const out = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    if (mask[i]) { out[i * 4] = rgb[0]; out[i * 4 + 1] = rgb[1]; out[i * 4 + 2] = rgb[2]; }
    else { out[i * 4] = 38; out[i * 4 + 1] = 40; out[i * 4 + 2] = 46; }
    out[i * 4 + 3] = 255;
  }
  return encodePngRGBA(W, H, out);
}
// review overlay: desaturated Master + tinted mask regions (each [mask,rgb] drawn in order)
function overlayPng(baseImg, layers) {
  const out = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const a = baseImg.rgba[i * 4 + 3];
    if (a > 16) { const g = Math.round(0.299 * baseImg.rgba[i * 4] + 0.587 * baseImg.rgba[i * 4 + 1] + 0.114 * baseImg.rgba[i * 4 + 2]); const v = Math.round(g * 0.55 + 140 * 0.45); out[i * 4] = v; out[i * 4 + 1] = v; out[i * 4 + 2] = v; }
    else { out[i * 4] = 250; out[i * 4 + 1] = 250; out[i * 4 + 2] = 250; }
    out[i * 4 + 3] = 255;
  }
  for (const [mask, rgb] of layers) for (let i = 0; i < W * H; i++) if (mask[i]) {
    out[i * 4] = Math.round(out[i * 4] * 0.35 + rgb[0] * 0.65);
    out[i * 4 + 1] = Math.round(out[i * 4 + 1] * 0.35 + rgb[1] * 0.65);
    out[i * 4 + 2] = Math.round(out[i * 4 + 2] * 0.35 + rgb[2] * 0.65);
  }
  return encodePngRGBA(W, H, out);
}

function main() {
  assertConstants();

  for (const [p, name] of [[MASTER, "Master"], [RECOVERY, "recovery-base"]]) {
    if (!existsSync(p)) throw new Error("Missing input " + name + ": " + p);
  }
  const masterBuf = readFileSync(MASTER);
  const masterSha = createHash("sha256").update(masterBuf).digest("hex");
  if (masterSha !== MASTER_EXPECT_SHA) throw new Error("Master sha256 mismatch — refusing (canonical datum, D-032).");
  const M = decodePng(masterBuf, "Master");
  const R = decodePng(readFileSync(RECOVERY), "recovery-base");
  if (M.w !== EXPECT_W || M.h !== EXPECT_H) throw new Error("Master dims " + M.w + "×" + M.h + " ≠ 1024×1536");
  if (R.w !== EXPECT_W || R.h !== EXPECT_H) throw new Error("recovery-base dims " + R.w + "×" + R.h + " ≠ 1024×1536");
  const referenceExists = existsSync(REFERENCE);

  // ── alpha-cut Master (outfit source) + assembled-figure alpha (for figure clipping) ──
  const { rgba: MC, cut: matteCut } = alphaCutMaster(M);
  const Mcut = { w: W, h: H, rgba: MC };

  // figure mask of the Strategy-B assembly (recovery head above seam + alpha-cut Master below) —
  // used only to clip feather bands and to compute the PROTECT complement. No pixels are re-rendered.
  // bodyFig = the below-seam Master body: in Strategy B EVERY garment pixel comes from here. Above the
  // seam is the protected recovery head/neck, reconciled only by the seam-feather band — so all garment
  // masks are clipped to bodyFig and can never intrude the head zone by construction.
  const figMask = new Uint8Array(W * H);
  const bodyFig = new Uint8Array(W * H);
  const headMask = new Uint8Array(W * H); // recovery head contribution (identity zone to protect)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (y < SEAM_Y) {
      if (x >= HEAD_X.x0 && x <= HEAD_X.x1) { const rp = recAt(R, x, y); if (rp && rp.a > 16) { figMask[i] = 1; headMask[i] = 1; } }
    } else if (fig(Mcut, x, y)) { figMask[i] = 1; bodyFig[i] = 1; }
  }

  // ── raw approximate seeds (same logic as build-base-assembly-masks.mjs) ──
  const greenSeed = new Uint8Array(W * H);
  const navySeed  = new Uint8Array(W * H);
  const shoesSeed = new Uint8Array(W * H);
  for (let y = SEAM_Y; y < H; y++) for (let x = 0; x < W; x++) { // garments are below the seam (Master body)
    const p = px(Mcut, x, y); if (p.a <= 16) continue;
    const i = y * W + x;
    if (y >= SHOES_Y0) { shoesSeed[i] = 1; continue; }
    if (isGreen(p) && y < GREEN_MAX_Y) greenSeed[i] = 1;
    else if (isNavy(p) && y > NAVY_MIN_Y) navySeed[i] = 1;
  }

  // ── REFINE: close interior gaps (star/cuff/pocket/line-art) → fill holes → keep large components ──
  function refine(seed) {
    const closed = close(seed, CLOSE_ITERS);
    const filled = andClip(fillHoles(closed), bodyFig); // fill enclosed holes, never spill off the below-seam body
    return keepComponents(filled, KEEP_MIN_PX);
  }
  const greenR = refine(greenSeed);   // full current sweater region (sleeves included) — solid
  const navyR  = refine(navySeed);    // current cargo trousers region — solid
  const shoesR = refine(shoesSeed);   // feet/shoe zone — solid

  // split the sweater region into: forearm skin to RECONSTRUCT (underarm band) vs the TOP that stays fabric
  const underarmMask = new Uint8Array(W * H);
  for (let y = UNDERARM.y0; y <= UNDERARM.y1; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (greenR.mask[i] && (x < UNDERARM.xInL || x > UNDERARM.xInR)) underarmMask[i] = 1;
  }
  const topMask = andNot(greenR.mask, underarmMask); // sweater minus forearm band → grey short-sleeve tee zone

  // ── FEATHER: small dilation clipped to the figure → inpaint blend band ──
  const topEdit      = andClip(dilate(topMask, FEATHER_ITERS), bodyFig);
  const trousersEdit = andClip(dilate(navyR.mask, FEATHER_ITERS), bodyFig);
  const shoesEdit    = andClip(dilate(shoesR.mask, FEATHER_ITERS), bodyFig);
  const underarmEdit = andClip(dilate(underarmMask, FEATHER_ITERS), bodyFig);
  const outfitEdit   = unionOf(topEdit, trousersEdit, shoesEdit, underarmEdit);

  // ── PROTECT (identity-lock): figure minus the outfit-edit union = head/face/scalp/hands/skin ──
  const protectMask = andNot(figMask, outfitEdit);

  // ── neck/collar seam-feather band (figure-limited) ──
  const seamSeed = new Uint8Array(W * H);
  for (let y = SEAM_BAND.y0; y <= SEAM_BAND.y1; y++) for (let x = 0; x < W; x++) if (figMask[y * W + x]) seamSeed[y * W + x] = 1;
  const seamMask = andClip(dilate(seamSeed, SEAM_FEATHER), figMask);

  // ── HARD identity-lock assertion: the outfit-edit union must NOT intrude the head zone ──
  let headIntrusion = 0;
  for (let i = 0; i < W * H; i++) if (outfitEdit[i] && headMask[i]) headIntrusion++;
  if (headIntrusion > 0) throw new Error("Identity-lock violated: outfit-edit union intrudes the head/face zone by " + headIntrusion + " px — refusing (D-042).");

  // ── write artifacts (path-guarded) ──
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(guardedPath(OUT.topMask),      maskPng(topEdit, [120, 200, 120]));
  writeFileSync(guardedPath(OUT.trousersMask), maskPng(trousersEdit, [90, 120, 220]));
  writeFileSync(guardedPath(OUT.shoesMask),    maskPng(shoesEdit, [200, 90, 200]));
  writeFileSync(guardedPath(OUT.underarmMask), maskPng(underarmEdit, [255, 170, 60]));
  writeFileSync(guardedPath(OUT.outfitMask),   maskPng(outfitEdit, [255, 255, 255]));
  writeFileSync(guardedPath(OUT.protectMask),  maskPng(protectMask, [60, 220, 120]));
  writeFileSync(guardedPath(OUT.seamMask),     maskPng(seamMask, [255, 60, 200]));
  writeFileSync(guardedPath(OUT.outfitOverlay), overlayPng(Mcut, [[topEdit, [120, 200, 120]], [trousersEdit, [90, 120, 220]], [shoesEdit, [200, 90, 200]], [underarmEdit, [255, 170, 60]]]));
  writeFileSync(guardedPath(OUT.protectOverlay), overlayPng(Mcut, [[outfitEdit, [225, 70, 70]], [protectMask, [60, 220, 120]]]));

  // read-only runtime validation (AVATAR_R2 is never written here)
  let avatarR2False = null;
  try { avatarR2False = /export\s+const\s+AVATAR_R2\s*=\s*false\s*;/.test(readFileSync(join(REPO, "js", "avatar-layers.js"), "utf8")); } catch { avatarR2False = "unreadable"; }

  const rel = (p) => resolve(p).replace(resolve(REPO) + sep, "").split(sep).join("/");

  // ── prompt pack (review-only; describes the LATER masked edit — NOT executed here) ──
  const promptPack = `# D-042 Neutral-Outfit Prompt Pack (review-only — NOT executed)

**Generated by** \`tools/avatar/build-neutral-outfit-mask-refinement.mjs\` — deterministic, non-AI.
**Status:** review-only PREP for the later, separately-approved AI-assisted **masked** edit (D-042).
**This file executes nothing.** No AI/ComfyUI has run; no neutral outfit exists; no base is completed.

> Gate 2 remains **REOPENED / UNDER RECOVERY** (NOT satisfied). Gate 3 remains **PAUSED**.
> \`AVATAR_R2\` = \`false\`. No runtime / \`assets/avatar-r2\` / \`R2_MANIFEST\` change.

## Identity-lock (binding, D-042 + D-032)
- Edit **only** inside the supplied edit masks. Everything under \`protect-mask.png\` is **frozen**:
  head, bald scalp, blank face, ears, neck, **hands / exposed skin**, and all Master geometry.
- **No** change to head size, eye shape (none present — blank face), hair silhouette (none — bald),
  pose, proportions, line-art style, cel-shade, lighting, palette (D-032).
- The base stays **bald + blank** (Gate 3 PAUSED) — do **not** add face/eyes/eyelid/hair.
- Reference \`Northstar Master - reference.png\` is an **appearance-only** guide, **never** geometry.

## Target outfit (must)
- **Top:** plain **light-grey short-sleeve t-shirt** (no collar graphic).
- **Trousers:** plain **charcoal straight trousers**.
- **Shoes:** plain **light-grey low sneakers** (footprint stays Master-compatible).

## Forbidden (must not appear)
hoodie · long-sleeve sweater · front/kangaroo pocket · cargo pockets · logo · star · wristbands ·
straps · text · symbols · stripes · new colours beyond the neutral grey/charcoal palette.

## Per-mask instructions
| Mask (feed as inpaint region) | Prompt | Negative |
|---|---|---|
| \`top-edit-mask.png\` | plain light-grey short-sleeve t-shirt fabric, soft cel-shade, matching Master line-weight | green, sweater, long sleeve, pocket, star, logo, stripe, text |
| \`underarm-reconstruct-mask.png\` **(highest-risk sub-gate)** | bare forearm **skin**, cel-shaded, ΔE tone-matched to the visible hands, continuous with the upper arm | fabric, sleeve, cuff, wristband, glove, colour cast, seam |
| \`trousers-edit-mask.png\` | plain charcoal straight trousers, soft cel-shade, Master line-weight | cargo pocket, side pocket, navy, denim, stripe, logo |
| \`shoes-edit-mask.png\` | plain light-grey low sneakers, simple sole, Master footprint | green, high-top, logo, laces graphic, bright colour |
| \`neck-seam-feather-mask.png\` | blend band only — reconcile the collar/neck join grey-on-grey | new collar shape, colour change, geometry shift |

## Workflow for the later masked edit (each step review-first)
1. Human-confirm each refined mask against \`outfit-edit-over-master.png\` / \`protect-over-master.png\`.
2. Run the masked edit **per region**, protect-mask enforced, on the registered/assembled base only.
3. **Underarm reconstruction gets its own sub-gate** before the full base is reviewed.
4. Fresh **164B.3** review + composed **Gate 5** visual sign-off + owner countersign → only then can Gate 2 pass.

_Masks are REFINED review-only proposals; still human-review-gated before any masked edit._
`;
  writeFileSync(guardedPath(OUT.promptPack), promptPack);

  const report = {
    tool: "build-neutral-outfit-mask-refinement",
    phase: "167A Phase-2 — D-042 neutral-outfit MASK REFINEMENT + prompt-pack (review-only; NOT a Gate-2 pass; NOT a final base; NOT neutral-outfit execution; NOT AI)",
    generatedAt: new Date().toISOString(),
    inputs: {
      master:   { path: rel(MASTER), dims: M.w + "×" + M.h, colorType: M.ct, sha256: masterSha, role: "canonical identity/style/coordinate datum + outfit-pixel source (D-032, read-only)", whiteMatteCutPx: matteCut },
      recovery: { path: rel(RECOVERY), dims: R.w + "×" + R.h, colorType: R.ct, role: "head contribution source (bald scalp/blank face/ears/neck) — protected identity zone (read-only)" },
    },
    referenceImage: { path: rel(REFERENCE), exists: referenceExists, statement: "appearance-only neutral-outfit reference; NOT a geometry datum (D-032); not read/modified/promoted by this tool" },
    registration: { masterToRecovery: MASTER_TO_RECOVERY, recoveryToMaster: RECOVERY_TO_MASTER, applied: "registered[x,y] = recovery[x + 25, y + 285]" },
    refinement: {
      method: "colour-seed → morphological close (fill star/cuff/pocket/line-art gaps) → hole-fill (figure-clipped) → connected-components keep (drop speckles) → feather dilation (figure-clipped)",
      params: { closeIters: CLOSE_ITERS, keepMinPx: KEEP_MIN_PX, featherIters: FEATHER_ITERS, seamFeather: SEAM_FEATHER },
      seeds: { greenSweaterPx: countPx(greenSeed), navyCargoPx: countPx(navySeed), shoesZonePx: countPx(shoesSeed) },
    },
    masks: {
      status: "REFINED REVIEW-ONLY PROPOSALS — solid + gap-filled + feathered; still human-review-gated before any masked edit",
      top:      { ...bounds(topEdit),      componentsKept: greenR.kept, speckleDroppedPx: greenR.dropped, target: "green long-sleeve sweater → plain light-grey short-sleeve tee" },
      underarm: { ...bounds(underarmEdit), target: "forearm/lower-sleeve band → RECONSTRUCTED bare skin (short-sleeve tee)", risk: "HIGHEST-RISK sub-area — own sub-gate before the full base is reviewed" },
      trousers: { ...bounds(trousersEdit), componentsKept: navyR.kept, speckleDroppedPx: navyR.dropped, target: "navy cargo → plain charcoal straight trousers" },
      shoes:    { ...bounds(shoesEdit),    componentsKept: shoesR.kept, speckleDroppedPx: shoesR.dropped, target: "sneakers → plain light-grey low sneakers (footprint stays Master-compatible)" },
      outfitEditUnion: { ...bounds(outfitEdit) },
      protect:  { ...bounds(protectMask), note: "identity-lock complement = head/face/scalp/ears/neck + hands/skin + Master geometry — the masked edit must NOT touch this" },
      neckSeamFeather: { band: SEAM_BAND, ...bounds(seamMask), note: "grey-on-grey collar/neck join blend band" },
    },
    identityLock: {
      headZonePx: countPx(headMask),
      outfitEditIntrudesHeadPx: headIntrusion,
      asserted: "outfit-edit union has ZERO overlap with the recovery head zone (else the tool refuses)",
      protectCoversRemainder: true,
    },
    promptPack: { path: rel(OUT.promptPack), note: "per-region prompts + identity-lock + workflow for the LATER masked edit; executes nothing" },
    output: { dir: rel(OUT_DIR), dims: W + "×" + H, artifacts: Object.fromEntries(Object.entries(OUT).map(([k, v]) => [k, rel(v)])) },
    underarmRiskNote: "Short-sleeve tee vs the Master's long-sleeve sweater ⇒ forearms do not exist in the Master and must be reconstructed as skin. Highest-risk sub-area; requires its own later sub-gate.",
    guardrails: {
      pathGuard: "all writes confined to " + rel(OUT_DIR),
      masterCanonicalDatumPreserved: true, d032Preserved: true, d042Policy: "deterministic PREP only; no AI/ComfyUI executed; masked-edit is a later separately-approved step",
      finalBase: false, neutralOutfitExecuted: false, aiUsed: false, comfyUiUsed: false,
      gate3Touched: false, buildFaceCleanUsed: false,
      noRuntimeWrite: true, noAssetsAvatarR2Write: true, noR2ManifestWrite: true,
      avatarR2: avatarR2False === true ? "false (unchanged)" : avatarR2False,
      artifactsReviewOnlyGitignored: true,
    },
    gateStatus: { gate2A: "PASS (prior)", gate2: "REOPENED / UNDER RECOVERY — NOT satisfied", gate3: "PAUSED" },
  };
  writeFileSync(guardedPath(OUT.report), JSON.stringify(report, null, 2));

  console.log("✔ D-042 neutral-outfit mask refinement (deterministic, review-only):");
  console.log("  seeds   → sweater " + report.refinement.seeds.greenSweaterPx + " · cargo " + report.refinement.seeds.navyCargoPx + " · shoes " + report.refinement.seeds.shoesZonePx + " px");
  console.log("  refined → top " + report.masks.top.px + " · underarm " + report.masks.underarm.px + " · trousers " + report.masks.trousers.px + " · shoes " + report.masks.shoes.px + " px");
  console.log("  outfit-edit union " + report.masks.outfitEditUnion.px + " px · protect " + report.masks.protect.px + " px · seam-feather " + report.masks.neckSeamFeather.px + " px");
  console.log("  identity-lock: outfit-edit ∩ head = " + headIntrusion + " px " + (headIntrusion === 0 ? "(CLEAN ✓)" : "(VIOLATION!)"));
  console.log("  AVATAR_R2 (read-only) " + report.guardrails.avatarR2);
  console.log("  artifacts + prompt-pack → " + rel(OUT_DIR) + "/ (gitignored, review-only, NOT promoted)");
  console.log("");
  console.log("NOT a Gate-2 pass. Gate 2 REOPENED / UNDER RECOVERY; Gate 3 PAUSED. NOT AI — the masked edit is a later, separately-approved step.");
}

main();
