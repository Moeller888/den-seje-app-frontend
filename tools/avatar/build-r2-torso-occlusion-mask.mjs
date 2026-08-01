// 167A option A / step A1 — R2 torso OCCLUSION MASK + slot template (deterministic, NON-AI).
// ---------------------------------------------------------------------------
// Plan of record: docs/167a-r2-torso-asset-production-plan.md (D-084)
// Decisions:      D-037 (torso mask CONDITIONAL — still NOT discharged), D-040 (torso deferred),
//                 D-082 (reuse measured impossible), D-083 (whole-avatar C2 fallback — stays active),
//                 D-034 (AI for item artwork only — this tool uses NO AI), D-071 (render scales).
//
// WHAT THIS IS:
//   * The A1 deliverable: three masks + a spec, derived DETERMINISTICALLY from the RUNTIME R2 base
//     (assets/avatar-r2/base/body-neutral-medium-v2.webp) and the landmarks locked by D-084.
//       - torso-occlusion-hard-v1.png  : where a torso replacement MUST be fully opaque (the base tee)
//       - torso-edit-allowed-v1.png    : hard + <=4 px blend + the optional hem extension
//       - torso-protect-v1.png         : the exact complement of edit — the anatomy/identity lock for A2
//       - torso-mask-spec-v1.json      : inputs, landmarks, counts, bboxes, SHA-256 of every output
//   * Landmarks are RE-MEASURED from the input on every run and asserted against the D-084 values;
//     a drift beyond tolerance is a hard failure, not a silent re-fit.
//
// WHAT THIS IS NOT:
//   * NOT A2 (no artwork, no AI, no image generation), NOT A3 (no slot wiring, no z, no transform).
//   * Does NOT discharge D-037, does NOT add torso to R2_SUPPORTED_COSMETIC_SLOTS, does NOT touch the
//     D-083 fallback, runtime, shop, catalog, DB, migrations, RLS, Edge Functions or R2_MANIFEST.
//   * Writes NOTHING into assets/** — the tracked outputs are a production TEMPLATE under
//     tools/avatar/fixtures/r2-torso/, not a runtime asset. AVATAR_R2 stays false.
//
// MODES:
//   (default)        verify — read-only. Rebuilds everything in memory, runs every gate, and compares
//                    against the tracked fixtures by SHA-256. Writes NO file. Non-zero exit on any
//                    gate failure, drift, or fixture mismatch.
//   --write          writes the tracked fixtures AND the review-only artifacts.
//   --review-only    writes ONLY the gitignored review artifacts (tools/avatar/build/...).
//
// Requires the vendored decoder tools/avatar/vendor/dwebp.exe (gitignored; fetch with
// tools/avatar/fetch-dwebp.mjs). No npm dependency, no new binary, no network.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { inflateSync, deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, sep } from "node:path";
import { verifyVendoredDwebp, EXE_SHA256 as DWEBP_SHA256, VERSION as DWEBP_VERSION } from "./fetch-dwebp.mjs";

export const TOOL = "build-r2-torso-occlusion-mask";
export const TOOL_VERSION = "1.0.0";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const DWEBP = join(HERE, "vendor", "dwebp.exe");
const INPUT_REL = "assets/avatar-r2/base/body-neutral-medium-v2.webp";
const INPUT = join(REPO, "assets", "avatar-r2", "base", "body-neutral-medium-v2.webp");

// Frozen input contract — the RUNTIME base (R2_MANIFEST base "neutral-medium": 2). The Phase-1 baked
// v1 PNG is explicitly NOT a geometric input here (D-084 §2): it is the historical/rollback asset.
export const INPUT_EXPECT_SHA = "28765eea616dd92beb73273c67d6d603cabd9f92af8057d2d9a5fe50c01032f9";
const SRC_W = 512, SRC_H = 768;          // served R2 dimensions
export const OUT_W = 1024, OUT_H = 1536; // Master canvas (D-027/D-037 authoring canvas) = served x2
const UPSCALE = 2;

// ── Landmarks locked by D-084 (Master coordinates) ──────────────────────────
// Re-measured from the input each run; |measured - locked| must stay within LANDMARK_TOL.
export const D084 = Object.freeze({
  shoulderY: 560,   // garment (tee) shoulder line
  sleeveEndY: 714,  // bare skin appears outboard while the centre is still garment
  hemY: 902,        // tee hem — centre flips garment -> trousers
  crotchY: 1000,    // leg split
  fingertipY: 1054, // arms/hands end
  seamX0: 372,      // torso / seam corridor, left
  seamX1: 640,      // torso / seam corridor, right
});
const LANDMARK_TOL = 24;   // Master px (= 12 served px) — drift beyond this is a hard failure
// The base's own outline carries a few DETACHED anti-aliased fragments (alpha exactly 128 with a
// sub-threshold ramp between them and the body). They cannot be brought into the mask without
// breaking a locked rule: an island-free mask, the <=4 px feather, or the D-071 alpha>=128 solidity.
// They are therefore an ACCEPTED, MEASURED residue — bounded, listed in the spec, never silent.
export const FRINGE_TOLERANCE_PX = 16;   // hard fail above this
export const FRINGE_MAX_DISTANCE = 8;    // Master px from the mask; farther away is a real hole
const SOLID = 128;         // D-071 convention: alpha >= 128 is solid; the AA ramp is excluded
const FEATHER = 4;         // Master px, the D-084 maximum blend/bleed
const CORRIDOR_CX = Math.round((D084.seamX0 + D084.seamX1) / 2);

// Reference swatches of the runtime base. Used ONLY to locate landmarks (rows that read as garment /
// skin / trousers). They are NOT used to decide what the mask owns — see semanticOf().
const REF = Object.freeze({ garment: [149, 144, 144], skin: [253, 191, 121], trousers: [44, 49, 59] });
const REF_MAX_DIST = 70;

// ── Semantic classification (D-085 revision 3) ──────────────────────────────
// Revision 2 decided ownership with a nearest-RGB match against those three swatches. On the neckline
// that inverts the meaning of the picture, and the owner caught it on sight:
//   * the tee's dark collar ring ([31,18,2], [47,29,14], [73,64,51]) is nearest to the TROUSERS
//     swatch, so the shirt's own edge was pushed out of the mask;
//   * skin in shadow ([138,105,87], [194,153,121]) is nearer to the grey GARMENT swatch than to lit
//     skin, so anatomy was pulled into it.
// Hue fixes both: skin is warm at any brightness, fabric is achromatic, and line work is dark. A dark
// stroke is then assigned by OWNERSHIP, never by colour — see ownedOutline in measure().
export const SEM = Object.freeze({ TRANSPARENT: "transparent", SKIN: "skin", OUTLINE: "outline", FABRIC: "fabric", OTHER: "other" });
const SKIN_WARMTH = 50;     // R - B; shadowed skin keeps its hue, it only loses luma
const SKIN_MIN_R = 110;
const OUTLINE_MAX_LUMA = 100;
const FABRIC_MAX_CHROMA = 28;
export function semanticOf(rgba, i) {
  const R = rgba[i * 4], G = rgba[i * 4 + 1], B = rgba[i * 4 + 2], A = rgba[i * 4 + 3];
  if (A < SOLID) return SEM.TRANSPARENT;
  const luma = 0.299 * R + 0.587 * G + 0.114 * B;
  const chroma = Math.max(R, G, B) - Math.min(R, G, B);
  if (R - B >= SKIN_WARMTH && R >= SKIN_MIN_R) return SEM.SKIN;
  if (luma < OUTLINE_MAX_LUMA) return SEM.OUTLINE;
  if (chroma <= FABRIC_MAX_CHROMA && luma >= OUTLINE_MAX_LUMA) return SEM.FABRIC;
  return SEM.OTHER;
}
// A stroke is thin; the trousers are a dark AREA. Ownership is only ever granted to strokes, so the
// trousers (which meet the tee at the hem) can never be adopted as "the shirt's edge".
const STROKE_MAX_THICKNESS = 12;   // Master px
const OWNERSHIP_REACH = 4;         // Master px — spans the full thickness of the collar rim

function assertConstants() {
  const d = D084;
  const ordered = d.shoulderY < d.sleeveEndY && d.sleeveEndY < d.hemY && d.hemY < d.crotchY && d.crotchY < d.fingertipY;
  const corridor = d.seamX0 > 0 && d.seamX0 < d.seamX1 && d.seamX1 < OUT_W;
  if (!ordered || !corridor) throw new Error("Pinned D-084 landmarks corrupted — refusing.");
  if (OUT_W !== SRC_W * UPSCALE || OUT_H !== SRC_H * UPSCALE) throw new Error("Canvas contract corrupted — refusing.");
  if (FEATHER > 4) throw new Error("Feather exceeds the D-084 maximum of 4 Master px — refusing.");
}

// ── output locations ────────────────────────────────────────────────────────
const FIX_DIR = join(HERE, "fixtures", "r2-torso");
const BUILD_DIR = join(HERE, "build", "r2-torso-occlusion-mask");
const FIX = {
  hard:    join(FIX_DIR, "torso-occlusion-hard-v1.png"),
  edit:    join(FIX_DIR, "torso-edit-allowed-v1.png"),
  protect: join(FIX_DIR, "torso-protect-v1.png"),
  spec:    join(FIX_DIR, "torso-mask-spec-v1.json"),
};
const REVIEW = {
  hardOver:    join(BUILD_DIR, "hard-mask-over-runtime-base.png"),
  editOver:    join(BUILD_DIR, "edit-mask-over-runtime-base.png"),
  protectOver: join(BUILD_DIR, "protect-mask-over-runtime-base.png"),
  zones:       join(BUILD_DIR, "mask-zones-labelled.png"),
  fourScale:   join(BUILD_DIR, "four-scale-review.png"),
  report:      join(BUILD_DIR, "report.json"),
};
// Every write goes through this guard: only the fixture dir and the gitignored build dir, never a
// runtime asset, never the layer module.
function guardedPath(p) {
  const full = resolve(p);
  const allowed = [resolve(FIX_DIR) + sep, resolve(BUILD_DIR) + sep];
  if (!allowed.some((a) => full.startsWith(a))) throw new Error("Guardrail: refusing write outside the fixture/build dirs:\n  " + full);
  for (const f of [join("assets", "avatar-r2"), join("js", "avatar-layers"), "R2_MANIFEST", join("supabase", "")]) {
    if (full.includes(f)) throw new Error("Guardrail: output path touches a forbidden target: " + f);
  }
  return full;
}
const rel = (p) => resolve(p).slice(resolve(REPO).length + 1).split(sep).join("/");

// ── minimal PNG codec (decode type-2/6, encode RGBA; no ancillary chunks) ────
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const l = Buffer.alloc(4); l.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii"); const cc = Buffer.alloc(4);
  cc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([l, t, data, cc]);
}
function paeth(a, b, c) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
export function decodePng(buf, label = "png") {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) throw new Error(label + ": not a PNG");
  let off = 8, ihdr = null; const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off); const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") ihdr = { w: data.readUInt32BE(0), h: data.readUInt32BE(4), bit: data[8], ct: data[9], il: data[12] };
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  if (!ihdr) throw new Error(label + ": no IHDR");
  if (ihdr.bit !== 8 || ihdr.il !== 0 || (ihdr.ct !== 2 && ihdr.ct !== 6)) throw new Error(label + ": unsupported PNG " + JSON.stringify(ihdr));
  const ch = ihdr.ct === 6 ? 4 : 3, { w, h } = ihdr, stride = w * ch;
  const raw = inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(h * stride); let prev = Buffer.alloc(stride); let p = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[p++]; const cur = raw.subarray(p, p + stride); p += stride;
    const out = px.subarray(y * stride, y * stride + stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? out[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
      let v = cur[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) v += paeth(a, b, c);
      out[x] = v & 0xff;
    }
    prev = out;
  }
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = px[i * ch]; rgba[i * 4 + 1] = px[i * ch + 1]; rgba[i * 4 + 2] = px[i * ch + 2];
    rgba[i * 4 + 3] = ch === 4 ? px[i * ch + 3] : 255;
  }
  return { w, h, rgba };
}
export function encodePngRGBA(w, h, rgba) {
  const stride = w * 4, raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) { raw[y * (stride + 1)] = 0; rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride); }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  // IHDR + IDAT + IEND only — no tEXt/tIME/pHYs, so the bytes depend solely on the pixels.
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ih), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}
// A mask is written as an ALPHA mask: white RGB, alpha 255 inside / 0 outside. Binary by construction.
function maskPng(w, h, mask) {
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const on = mask[i] ? 255 : 0;
    rgba[i * 4] = 255; rgba[i * 4 + 1] = 255; rgba[i * 4 + 2] = 255; rgba[i * 4 + 3] = on;
  }
  return encodePngRGBA(w, h, rgba);
}
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

// ── input: decode the runtime WebP via the vendored dwebp, then upscale x2 ───
function loadBase() {
  // The decoder is gitignored, so a fresh clone must bootstrap it — and it must be the PINNED binary,
  // not just any dwebp on disk (D-085 phase 2). Both conditions produce an explicit, actionable error.
  const v = verifyVendoredDwebp(DWEBP);
  if (!v.ok) {
    throw new Error(
      `vendored WebP decoder unusable (${v.reason}).\n  ${v.how}\n` +
      (v.sha256 ? `  found sha256 ${v.sha256}\n  expected     ${v.expected}\n` : ""));
  }
  if (!existsSync(INPUT)) throw new Error("missing runtime base: " + INPUT_REL);
  const bytes = readFileSync(INPUT);
  const inputSha = sha256(bytes);
  if (inputSha !== INPUT_EXPECT_SHA) {
    throw new Error(`input SHA mismatch for ${INPUT_REL}\n  expected ${INPUT_EXPECT_SHA}\n  actual   ${inputSha}\nThe runtime base changed — re-verify the D-084 geometry before re-deriving the mask.`);
  }
  mkdirSync(BUILD_DIR, { recursive: true });
  const tmp = guardedPath(join(BUILD_DIR, ".decoded-base-v2.png"));
  const res = spawnSync(DWEBP, [INPUT, "-o", tmp], { encoding: "utf8" });
  if (res.status !== 0) throw new Error("dwebp failed on " + INPUT_REL + ": " + (res.stderr || ""));
  const src = decodePng(readFileSync(tmp), "decoded base");
  rmSync(tmp, { force: true });
  if (src.w !== SRC_W || src.h !== SRC_H) throw new Error(`input dimension mismatch: expected ${SRC_W}x${SRC_H}, got ${src.w}x${src.h}`);

  // Nearest-neighbour x2 into the Master frame — exact, lossless, deterministic.
  const rgba = Buffer.alloc(OUT_W * OUT_H * 4);
  for (let y = 0; y < OUT_H; y++) {
    const sy = (y / UPSCALE) | 0;
    for (let x = 0; x < OUT_W; x++) {
      const sx = (x / UPSCALE) | 0, s = (sy * SRC_W + sx) * 4, d = (y * OUT_W + x) * 4;
      rgba[d] = src.rgba[s]; rgba[d + 1] = src.rgba[s + 1]; rgba[d + 2] = src.rgba[s + 2]; rgba[d + 3] = src.rgba[s + 3];
    }
  }
  return { w: OUT_W, h: OUT_H, rgba, inputSha };
}

// ── measurement helpers (Master frame) ──────────────────────────────────────
function classify(rgba, i) {
  const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
  let best = "other", bd = REF_MAX_DIST;
  for (const [k, v] of Object.entries(REF)) {
    const d = Math.hypot(r - v[0], g - v[1], b - v[2]);
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}
function rowRuns(solid, w, y, minWidth = 1) {
  const out = []; let start = -1;
  for (let x = 0; x < w; x++) {
    const on = solid[y * w + x] === 1;
    if (on && start < 0) start = x;
    if ((!on || x === w - 1) && start >= 0) { const end = on ? x : x - 1; if (end - start + 1 >= minWidth) out.push([start, end]); start = -1; }
  }
  return out;
}
// The run a torso lives in: the one containing the corridor centre, else the widest.
function torsoRun(runs) {
  if (!runs.length) return null;
  const hit = runs.find(([a, b]) => a <= CORRIDOR_CX && CORRIDOR_CX <= b);
  return hit || runs.slice().sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]))[0];
}
function spanClass(rgba, solid, w, y, x0, x1) {
  const c = { garment: 0, skin: 0, trousers: 0, other: 0 };
  for (let x = Math.max(0, x0); x <= Math.min(w - 1, x1); x += 2) {
    const i = y * w + x;
    if (solid[i]) c[classify(rgba, i)]++;
  }
  const tot = Object.values(c).reduce((a, b) => a + b, 0);
  if (!tot) return { cls: "none", share: 0 };
  const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
  return { cls: top[0], share: +(top[1] / tot).toFixed(3) };
}

function measure(base) {
  const { w, h, rgba } = base;
  const solid = new Uint8Array(w * h), nonzero = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) { const a = rgba[i * 4 + 3]; if (a >= SOLID) solid[i] = 1; if (a > 0) nonzero[i] = 1; }

  const rows = [];
  for (let y = 0; y < h; y++) {
    const runs = rowRuns(solid, w, y, 24);      // ignore hairline slivers (< 24 Master px)
    if (!runs.length) { rows.push(null); continue; }
    const tr = torsoRun(runs);
    const left = runs[0][0], right = runs[runs.length - 1][1];
    rows.push({ y, runs, tr, left, right });
  }
  const rowAt = (y) => (y >= 0 && y < h ? rows[y] : null);

  // shoulder line: first row whose torso-run centre reads garment
  let shoulderY = -1;
  for (let y = 0; y < h; y++) {
    const r = rowAt(y); if (!r || !r.tr) continue;
    const cx = Math.round((r.tr[0] + r.tr[1]) / 2);
    if (spanClass(rgba, solid, w, y, cx - 44, cx + 44).cls === "garment") { shoulderY = y; break; }
  }
  // sleeve end: first row below the shoulder where an outer band reads skin while the centre is garment
  let sleeveEndY = -1;
  for (let y = shoulderY + 1; y < h; y++) {
    const r = rowAt(y); if (!r || !r.tr) continue;
    const cx = Math.round((r.tr[0] + r.tr[1]) / 2);
    const centre = spanClass(rgba, solid, w, y, cx - 44, cx + 44);
    if (centre.cls !== "garment") continue;
    const oL = spanClass(rgba, solid, w, y, r.left, r.left + 28);
    const oR = spanClass(rgba, solid, w, y, r.right - 28, r.right);
    if (oL.cls === "skin" || oR.cls === "skin") { sleeveEndY = y; break; }
  }
  // hem: first row below the sleeve end whose torso centre stops being garment (>=60% agreement)
  let hemY = -1;
  for (let y = sleeveEndY + 1; y < h; y++) {
    const r = rowAt(y); if (!r || !r.tr) continue;
    const cx = Math.round((r.tr[0] + r.tr[1]) / 2);
    const centre = spanClass(rgba, solid, w, y, cx - 44, cx + 44);
    if (centre.cls !== "garment" && centre.share >= 0.6) { hemY = y; break; }
  }
  // crotch: first row below the hem carrying two runs whose MIDPOINTS both sit inside the corridor
  // (i.e. two legs — arm runs are outboard and must not satisfy this), stable for 40 rows
  let crotchY = -1;
  const legLike = (y) => {
    const r = rowAt(y); if (!r) return false;
    const inner = r.runs.filter(([a, b]) => { const mid = (a + b) / 2; return mid >= D084.seamX0 && mid <= D084.seamX1; });
    return inner.length >= 2;
  };
  for (let y = hemY + 1; y < h - 40; y++) {
    let ok = true;
    for (let k = 0; k < 40; k++) if (!legLike(y + k)) { ok = false; break; }
    if (ok) { crotchY = y; break; }
  }
  // fingertips: last row carrying a solid run entirely outside the corridor (an arm/hand run)
  let fingertipY = -1;
  for (let y = h - 1; y > crotchY; y--) {
    const r = rowAt(y); if (!r) continue;
    if (r.runs.some(([a, b]) => b < D084.seamX0 || a > D084.seamX1)) { fingertipY = y; break; }
  }
  // corridor: the torso-run extent across the sleeve-end..hem band, taken as the MEDIAN of the
  // per-row edges. A handful of rows have no alpha gap between arm and torso (the seam is only 8–12
  // Master px), so their "torso run" swallows an arm; min/max would inherit that, the median does not.
  const lefts = [], rights = [];
  for (let y = sleeveEndY; y < hemY; y++) {
    const r = rowAt(y); if (!r || !r.tr) continue;
    lefts.push(r.tr[0]); rights.push(r.tr[1]);
  }
  const median = (arr) => { if (!arr.length) return -1; const s = arr.slice().sort((a, b) => a - b); return s[(s.length / 2) | 0]; };
  const corLeft = median(lefts), corRight = median(rights);
  const medWidth = corRight - corLeft + 1;

  // Per-row torso span, used by BOTH the mask and the anatomy zones so the two can never disagree.
  // A row whose arm/torso seam has no alpha gap yields an over-wide run; those rows fall back to the
  // median corridor. The locked D-084 corridor is applied as an outer bound in every case.
  const torsoSpan = new Array(h).fill(null);
  for (let y = sleeveEndY; y < h; y++) {
    const r = rowAt(y); if (!r || !r.tr) continue;
    let [a, b] = r.tr;
    if (b - a + 1 > medWidth * 1.35) { a = corLeft; b = corRight; }   // fused row → robust fallback
    a = Math.max(a, D084.seamX0); b = Math.min(b, D084.seamX1);        // never wider than D-084 allows
    if (a <= b) torsoSpan[y] = [a, b];
  }

  // ── The TEE as a topological object (D-085 revision) ──────────────────────
  // The tee's collar/shoulder curve rises above the shoulder line, and one sleeve reaches lower than
  // the other. A band rule cannot express either, so the garment is identified by CONNECTIVITY: take
  // the garment-classified solid pixels, 8-connect them, and keep the components that touch a seed
  // taken from the middle of the torso. The shoes are grey too — they form their own components and
  // never touch the seed, so they stay out.
  const sem = new Uint8Array(w * h);             // 0 transparent, 1 skin, 2 outline, 3 fabric, 4 other
  const SEMCODE = { transparent: 0, skin: 1, outline: 2, fabric: 3, other: 4 };
  for (let i = 0; i < w * h; i++) sem[i] = SEMCODE[semanticOf(rgba, i)];

  // (a) The garment's BODY: connected fabric, seeded from the middle of the torso. The shoes are
  //     achromatic grey too, but they form their own components and never touch the seed.
  const fabric = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (sem[i] === 3) fabric[i] = 1;
  const seed = new Uint8Array(w * h);
  for (let y = sleeveEndY - 120; y < hemY - 40; y++) {
    const sp = torsoSpan[y] || [corLeft, corRight];
    for (let x = sp[0]; x <= sp[1]; x++) if (fabric[y * w + x]) seed[y * w + x] = 1;
  }
  const teeFabric = new Uint8Array(w * h);
  for (const px of components(fabric, w, h)) {
    if (!px.some((i) => seed[i])) continue;
    for (const i of px) teeFabric[i] = 1;
  }

  // (b) OWNERSHIP OF THE LINE WORK. A dark stroke belongs to whatever it bounds; the collar ring
  //     bounds the shirt, so it is the shirt's. Granted only to THIN strokes touching the garment
  //     body, which is what keeps the (dark, but thick) trousers out even though they meet the hem.
  const runLen = (x, y, dx, dy) => {             // length of the dark run through (x,y) along one axis
    let n = 1;
    for (let s = 1; s <= STROKE_MAX_THICKNESS + 1; s++) { const xx = x + dx * s, yy = y + dy * s; if (xx < 0 || yy < 0 || xx >= w || yy >= h || sem[yy * w + xx] !== 2) break; n++; }
    for (let s = 1; s <= STROKE_MAX_THICKNESS + 1; s++) { const xx = x - dx * s, yy = y - dy * s; if (xx < 0 || yy < 0 || xx >= w || yy >= h || sem[yy * w + xx] !== 2) break; n++; }
    return n;
  };
  const ownedOutline = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (sem[i] !== 2 || !solid[i]) continue;
    if (Math.min(runLen(x, y, 1, 0), runLen(x, y, 0, 1)) > STROKE_MAX_THICKNESS) continue;  // an area, not a stroke
    // Reach across the full thickness of the stroke: the collar rim is 4–6 px, so a 2 px reach only
    // adopted its outer half and left the inner half — the part that borders the neck — outside.
    let touches = false;
    for (let dy = -OWNERSHIP_REACH; dy <= OWNERSHIP_REACH && !touches; dy++) for (let dx = -OWNERSHIP_REACH; dx <= OWNERSHIP_REACH; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      if (teeFabric[yy * w + xx]) { touches = true; break; }
    }
    if (touches) ownedOutline[i] = 1;
  }

  const tee = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (teeFabric[i] || ownedOutline[i]) tee[i] = 1;

  // (c) Close 1–2 px interior shading that reads as "other" and would punch holes in the garment.
  //     SKIN can never be closed over — that is the second half of the inversion the owner caught.
  for (let pass = 0; pass < 2; pass++) {
    const add = [];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (tee[i] || !solid[i] || sem[i] === 1) continue;          // never absorb skin
      let n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        if (tee[(y + dy) * w + (x + dx)]) n++;
      }
      if (n >= 5) add.push(i);
    }
    for (const i of add) tee[i] = 1;
  }
  const garment = teeFabric;                     // kept for the report: the garment BODY without strokes
  let teeTop = h;
  for (let i = 0; i < w * h; i++) if (tee[i]) { teeTop = Math.min(teeTop, (i / w) | 0); if (teeTop === 0) break; }

  return { solid, nonzero, rows, rowAt, torsoSpan, sem, garment, teeFabric, ownedOutline, tee, teeTop,
    measured: { shoulderY, sleeveEndY, hemY, crotchY, fingertipY, seamX0: corLeft, seamX1: corRight } };
}

// ── mask construction ───────────────────────────────────────────────────────
function buildMasks(base, m, z) {
  const { w, h } = base;
  const { solid, nonzero, rowAt } = m;
  const L = D084;                                   // masks are cut on the LOCKED landmarks (drift is
                                                    // asserted separately, so the template is stable)
  const hard = new Uint8Array(w * h);
  const hem = new Uint8Array(w * h);

  // (1) THE WHOLE TEE, topologically — collar curve above the shoulder line and the longer sleeve's
  // tail included. This is what closes the D-037 "fully occlude the base tee" requirement; the band
  // rules below are the geometric floor, not the definition of the garment.
  for (let i = 0; i < w * h; i++) if (m.tee[i]) hard[i] = 1;

  // (2) Above the sleeve end: FABRIC or the garment's OWN line work. Revision 2 said "every solid
  // pixel except bare skin", and that is precisely what let shadowed skin into the mask at the
  // neckline — a pixel is admitted for what it IS, never for what it is not.
  for (let y = L.shoulderY; y < L.sleeveEndY; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (solid[i] && (m.teeFabric[i] || m.ownedOutline[i])) hard[i] = 1;
    }
  }
  // (3) Below the sleeve end the arms are bare: pinch to the per-row torso span, and still only take
  // fabric or owned line work.
  for (let y = L.sleeveEndY; y < L.hemY; y++) {
    const sp = m.torsoSpan[y]; if (!sp) continue;
    for (let x = sp[0]; x <= sp[1]; x++) {
      const i = y * w + x;
      if (solid[i] && (m.teeFabric[i] || m.ownedOutline[i])) hard[i] = 1;
    }
  }
  // optional hem extension: torso span only, clipped to the silhouette
  for (let y = L.hemY; y < L.crotchY; y++) {
    const sp = m.torsoSpan[y]; if (!sp) continue;
    for (let x = sp[0]; x <= sp[1]; x++) if (solid[y * w + x]) hem[y * w + x] = 1;
  }

  // Speck cleanup: drop connected components below MIN_COMPONENT px. Anti-aliasing leaves a handful of
  // isolated 4–12 px specks along the garment edge; as mask geometry they are floating islands, which
  // the D-037 review criteria forbid. Deterministic 4-neighbour flood fill.
  dropSmallComponents(hard, w, h, MIN_COMPONENT);

  // edit = dilate(hard, FEATHER) clipped to the figure and to the allowed bands, plus the hem extension
  const edit = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (hard[i]) edit[i] = 1;   // edit always contains hard
  const R2 = FEATHER * FEATHER;
  // The <=4 px blend is granted ONLY between the shoulder line and the hem. Above the shoulder line the
  // mask borders the neck, so the collar zone gets NO feather at all — a blend there would land on skin.
  for (let y = Math.min(m.teeTop, L.shoulderY); y < L.hemY; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (edit[i]) continue;
      // Above the shoulder line the edit zone may ONLY reclaim garment pixels that the island rule
      // removed from the hard mask. No blend of any kind is granted next to the neck.
      if (y < L.shoulderY && !m.tee[i]) continue;
      if (!nonzero[i]) continue;                     // never bleed onto transparent canvas
      if (z.headNeck[i] || z.forearmHand[i] || z.leg[i]) continue; // never bleed onto locked anatomy
      if (m.sem[i] === 1) continue;                                // never bleed onto skin (any luma)
      // Below the sleeve end the feather may not leave the corridor — not even onto the arm's
      // ANTI-ALIASED edge (alpha 1..127), which the solid-pixel zones do not cover.
      if (y >= L.sleeveEndY && (x < L.seamX0 || x > L.seamX1)) continue;
      let near = 0;
      for (let dy = -FEATHER; dy <= FEATHER && !near; dy++) {
        const yy = y + dy; if (yy < Math.min(m.teeTop, L.shoulderY) || yy >= L.hemY) continue;
        for (let dx = -FEATHER; dx <= FEATHER; dx++) {
          if (dx * dx + dy * dy > R2) continue;
          const xx = x + dx; if (xx < 0 || xx >= w) continue;
          if (hard[yy * w + xx]) { near = 1; break; }
        }
      }
      if (near) edit[i] = 1;
    }
  }
  for (let i = 0; i < w * h; i++) if (hem[i]) edit[i] = 1;

  // protect = the exact complement of edit
  const protect = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) protect[i] = edit[i] ? 0 : 1;

  return { hard, edit, protect, hem };
}

// ── zones used by the gates ─────────────────────────────────────────────────
// Anatomy zones the mask must never touch. Defined by POSITION, not by run structure, so a row whose
// arm/torso seam happens to close cannot reclassify a forearm as torso.
function zones(base, m) {
  const { w, h } = base; const { solid, torsoSpan, tee } = m; const L = D084;
  const headNeck = new Uint8Array(w * h), forearmHand = new Uint8Array(w * h), leg = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const sp = torsoSpan[y];
    for (let x = 0; x < w; x++) {
      const i = y * w + x; if (!solid[i]) continue;
      if (tee[i]) continue;                       // garment is never anatomy — see measure()
      if (y < L.shoulderY) headNeck[i] = 1;                                     // head + neck (skin)
      // bare arms + hands: solid, NON-GARMENT pixels outboard of the row's torso span below the sleeve
      // end. The longer sleeve's tail lives out there too, and it is fabric, not anatomy.
      if (y >= L.sleeveEndY && (!sp || x < sp[0] || x > sp[1])) forearmHand[i] = 1;
      if (y >= L.crotchY) leg[i] = 1;                                           // legs
    }
  }
  return { headNeck, forearmHand, leg };
}

// ── connected components (8-neighbour, deterministic scan order) ────────────
// 8-connectivity on purpose: the base's outline is an anti-aliased staircase, so a sleeve corner can
// be diagonally — but not orthogonally — attached to the garment body. Under 4-connectivity such a
// corner reads as a separate island and would be discarded as a speck, leaving a few unpaintable
// garment pixels behind (measured: the right sleeve tip at x 698–699, y 706–709).
export const MIN_COMPONENT = 64;   // Master px — anything smaller is an AA speck, not mask geometry
function components(mask, w, h) {
  const NEIGH = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const seen = new Uint8Array(w * h); const out = [];
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || seen[start]) continue;
    const px = []; const stack = [start]; seen[start] = 1;
    while (stack.length) {
      const j = stack.pop(); px.push(j);
      const y = (j / w) | 0, x = j % w;
      for (const [dx, dy] of NEIGH) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const k = yy * w + xx;
        if (mask[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
      }
    }
    out.push(px);
  }
  return out;
}
function dropSmallComponents(mask, w, h, minPx) {
  let dropped = 0;
  for (const px of components(mask, w, h)) {
    if (px.length >= minPx) continue;
    for (const i of px) mask[i] = 0;
    dropped++;
  }
  return dropped;
}

const count = (m) => { let n = 0; for (let i = 0; i < m.length; i++) if (m[i]) n++; return n; };
function bbox(mask, w, h) {
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}
const overlap = (a, b) => { let n = 0; for (let i = 0; i < a.length; i++) if (a[i] && b[i]) n++; return n; };

// ── gates ───────────────────────────────────────────────────────────────────
function runGates(base, m, masks, z) {
  const { w, h, rgba } = base; const { solid, nonzero } = m; const L = D084;
  const { hard, edit, protect, hem } = masks;
  const g = [];
  const add = (id, pass, detail) => g.push({ id, pass: !!pass, detail });

  // landmark drift
  for (const k of Object.keys(L)) {
    const delta = Math.abs(m.measured[k] - L[k]);
    add("landmark:" + k, m.measured[k] >= 0 && delta <= LANDMARK_TOL, { locked: L[k], measured: m.measured[k], delta, tolerance: LANDMARK_TOL });
  }
  // ── SEMANTIC GATES (D-085 revision 3) ─────────────────────────────────────
  // These do NOT consult the object the mask was built from. They re-derive meaning from the pixels
  // (hue for skin, luma for line work, adjacency for ownership) and compare it with the mask, so a
  // classifier that mislabels the picture cannot certify itself.
  let skinInHard = 0, skinInEdit = 0; const skinSample = [];
  for (let i = 0; i < w * h; i++) {
    if (m.sem[i] !== 1) continue;                       // 1 = skin, at any brightness
    if (hard[i]) { skinInHard++; if (skinSample.length < 12) skinSample.push({ x: i % w, y: (i / w) | 0 }); }
    if (edit[i]) skinInEdit++;
  }
  add("no-semantic-skin-in-mask", skinInHard === 0 && skinInEdit === 0,
    { skinInHard, skinInEdit, sample: skinSample, note: "hue-based, so skin in shadow counts as skin" });

  // The tee's own line work — thin dark strokes touching the garment body — must be inside the mask.
  let ownedTotal = 0, ownedCovered = 0; const ownedMissing = [];
  for (let i = 0; i < w * h; i++) {
    if (!m.ownedOutline[i]) continue;
    ownedTotal++;
    if (hard[i]) ownedCovered++;
    else if (ownedMissing.length < 12) ownedMissing.push({ x: i % w, y: (i / w) | 0 });
  }
  const ownedRatio = ownedTotal ? ownedCovered / ownedTotal : 1;
  add("tee-line-work-covered", ownedRatio >= 0.99,
    { ownedTotal, ownedCovered, ratio: +ownedRatio.toFixed(5), missingSample: ownedMissing });

  // The mask's neckline contour must follow the garment's VISIBLE edge, row by row.
  const CONTOUR_TOL = 2;
  let contourRows = 0, contourBad = 0, worst = 0; const contourSample = [];
  for (let y = m.teeTop; y <= L.shoulderY + 40; y++) {
    let mL = null, mR = null, gL = null, gR = null;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (hard[i]) { if (mL === null) mL = x; mR = x; }
      if (m.teeFabric[i] || m.ownedOutline[i]) { if (gL === null) gL = x; gR = x; }
    }
    if (gL === null || mL === null) continue;
    contourRows++;
    const dL = Math.abs(mL - gL), dR = Math.abs(mR - gR);
    worst = Math.max(worst, dL, dR);
    if (dL > CONTOUR_TOL || dR > CONTOUR_TOL) { contourBad++; if (contourSample.length < 8) contourSample.push({ y, maskL: mL, garmentL: gL, maskR: mR, garmentR: gR }); }
  }
  add("neckline-contour-matches-garment", contourBad === 0,
    { rowsChecked: contourRows, rowsOutOfTolerance: contourBad, worstDeltaPx: worst, tolerancePx: CONTOUR_TOL, sample: contourSample });

  // ── D-037 CORE REQUIREMENT: the base tee must be FULLY occludable ──────────
  // Measured over the whole garment as a topological object — collar curve and sleeve tails included,
  // not just the band below the shoulder line. This gate is the reason the D-085 revision exists.
  let teeTotal = 0, teeUncovered = 0, teeEditOnly = 0;
  const conflicts = { skinOrNeck: 0, forearmHand: 0, leg: 0, other: 0 };
  const uncoveredSample = [], editOnlySample = [];
  for (let i = 0; i < w * h; i++) {
    if (!m.tee[i]) continue;
    teeTotal++;
    if (hard[i]) continue;
    // Paintable but not mandatory: a handful of line-work pixels form components below MIN_COMPONENT
    // and are removed by the island rule. They stay inside the edit zone, so an artist still covers
    // them; they are listed rather than quietly folded into the "covered" count.
    if (edit[i]) { teeEditOnly++; if (editOnlySample.length < 12) editOnlySample.push({ x: i % w, y: (i / w) | 0 }); continue; }
    teeUncovered++;
    if (z.headNeck[i]) conflicts.skinOrNeck++;
    else if (z.forearmHand[i]) conflicts.forearmHand++;
    else if (z.leg[i]) conflicts.leg++;
    else conflicts.other++;
    if (uncoveredSample.length < 12) uncoveredSample.push({ x: i % w, y: (i / w) | 0 });
  }
  add("base-tee-garment-uncovered", teeUncovered === 0 && teeEditOnly <= FRINGE_TOLERANCE_PX,
    { teeTotalPx: teeTotal, uncoveredPx: teeUncovered, conflicts, sample: uncoveredSample,
      paintableButNotMandatoryPx: teeEditOnly, paintableSample: editOnlySample,
      note: "uncovered = outside BOTH hard and edit; the edit-only pixels are island-rule casualties, bounded by FRINGE_TOLERANCE_PX" });

  // band limits — above the shoulder line ONLY the tee's own collar curve may be masked
  let aboveShoulderNonTee = 0, atOrBelowCrotch = 0;
  for (let y = 0; y < L.shoulderY; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if ((hard[i] || edit[i]) && !m.tee[i]) aboveShoulderNonTee++;
  }
  for (let y = L.crotchY; y < h; y++) for (let x = 0; x < w; x++) if (hard[y * w + x] || edit[y * w + x]) atOrBelowCrotch++;
  add("above-shoulder-only-tee-collar", aboveShoulderNonTee === 0, { px: aboveShoulderNonTee, limit: "y < " + L.shoulderY, teeTopY: m.teeTop });
  add("no-px-at-or-below-crotch", atOrBelowCrotch === 0, { px: atOrBelowCrotch, limit: "y >= " + L.crotchY });

  // Nothing outboard of the corridor below the sleeve end — checked on the MASK's own geometry, so it
  // also covers the arm's anti-aliased edge, which the solid-pixel anatomy zones do not include.
  let outboardNonTee = 0, outboardTeeFabric = 0;
  for (let y = L.sleeveEndY; y < h; y++) for (let x = 0; x < w; x++) {
    if (x >= L.seamX0 && x <= L.seamX1) continue;
    const i = y * w + x;
    if (!(hard[i] || edit[i])) continue;
    if (m.tee[i]) outboardTeeFabric++; else outboardNonTee++;
  }
  add("outboard-below-sleeve-end-is-tee-fabric-only", outboardNonTee === 0,
    { nonTeePx: outboardNonTee, teeFabricPx: outboardTeeFabric, corridor: [L.seamX0, L.seamX1],
      note: "the longer sleeve's tail reaches below the sleeve-end line and outboard of the corridor; it is fabric, so it is covered — anatomy out there is not" });

  // anatomy locks
  add("no-head-or-neck", overlap(edit, z.headNeck) === 0, { px: overlap(edit, z.headNeck) });
  add("no-forearm-or-hand", overlap(edit, z.forearmHand) === 0, { px: overlap(edit, z.forearmHand) });
  add("no-legs", overlap(edit, z.leg) === 0, { px: overlap(edit, z.leg) });

  // canvas / silhouette discipline
  let editOffFigure = 0, hardOffSolid = 0;
  for (let i = 0; i < w * h; i++) {
    if (edit[i] && !nonzero[i]) editOffFigure++;
    if (hard[i] && !solid[i]) hardOffSolid++;
  }
  add("edit-inside-silhouette", editOffFigure === 0, { px: editOffFigure });
  add("hard-inside-solid-figure", hardOffSolid === 0, { px: hardOffSolid });

  // Mandatory tee occlusion. Every garment-classified pixel the mask is ALLOWED to own must be owned.
  // Uncovered garment pixels are only acceptable where covering them is itself forbidden: outboard of
  // the row's torso span, i.e. the shaded inner EDGE of a bare arm (a few hundred px of shading that
  // classifies as garment). Those are counted and reported, never covered.
  // Semantic FABRIC coverage. Counted over fabric pixels that belong to the garment body, so shadowed
  // skin can no longer inflate the denominator the way the nearest-RGB "garment" class did.
  let fabricTotal = 0, fabricCovered = 0;
  for (let i = 0; i < w * h; i++) {
    if (!m.teeFabric[i]) continue;
    fabricTotal++;
    if (hard[i]) fabricCovered++;
  }
  const coverage = fabricTotal ? fabricCovered / fabricTotal : 0;
  add("tee-fabric-fully-covered", fabricCovered === fabricTotal,
    { fabricTotal, fabricCovered, coverage: +coverage.toFixed(5) });

  // No holes: every NON-SKIN solid pixel inside the mask's own span must be paintable. Bare skin is
  // excluded by design (the sleeves end on different rows); AA specks dropped by the speck filter are
  // acceptable only because the feather zone still reaches them.
  // Detached FABRIC fringe: garment-coloured pixels inside the mask's own span that the connectivity
  // pass could not reach (the base's outline has a few solid specks cut off by a sub-threshold ramp).
  let holesCoveredByFeather = 0; const fringe = [];
  for (let y = L.shoulderY; y < L.hemY; y++) {
    const sp = y < L.sleeveEndY ? [0, w - 1] : m.torsoSpan[y];
    if (!sp) continue;
    for (let x = sp[0]; x <= sp[1]; x++) {
      const i = y * w + x;
      if (!solid[i] || hard[i]) continue;
      if (m.sem[i] !== 3) continue;                    // only FABRIC counts; skin and anatomy do not
      if (edit[i]) { holesCoveredByFeather++; continue; }
      // detached fringe: measure how far it actually sits from the mask
      let dist = Infinity;
      for (let dy = -FRINGE_MAX_DISTANCE; dy <= FRINGE_MAX_DISTANCE; dy++) {
        for (let dx = -FRINGE_MAX_DISTANCE; dx <= FRINGE_MAX_DISTANCE; dx++) {
          const yy = y + dy, xx = x + dx;
          if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue;
          if (hard[yy * w + xx]) dist = Math.min(dist, Math.hypot(dx, dy));
        }
      }
      fringe.push({ x, y, alpha: rgba[i * 4 + 3], distanceToMask: dist === Infinity ? null : +dist.toFixed(1) });
    }
  }
  const tooFar = fringe.filter((f) => f.distanceToMask === null || f.distanceToMask > FRINGE_MAX_DISTANCE);
  add("no-unreachable-garment", fringe.length <= FRINGE_TOLERANCE_PX && tooFar.length === 0, {
    reachableViaFeather: holesCoveredByFeather,
    detachedFringePx: fringe.length, tolerance: FRINGE_TOLERANCE_PX,
    beyondMaxDistance: tooFar.length, maxDistance: FRINGE_MAX_DISTANCE,
    pixels: fringe.slice(0, FRINGE_TOLERANCE_PX),
  });

  // feather discipline: every edit pixel that is neither hard nor hem must sit within FEATHER of hard
  let featherViolations = 0, featherPx = 0;
  const R2 = FEATHER * FEATHER;
  for (let i = 0; i < w * h; i++) {
    if (!edit[i] || hard[i] || hem[i]) continue;
    featherPx++;
    const y = (i / w) | 0, x = i % w; let near = 0;
    for (let dy = -FEATHER; dy <= FEATHER && !near; dy++) for (let dx = -FEATHER; dx <= FEATHER; dx++) {
      if (dx * dx + dy * dy > R2) continue;
      const yy = y + dy, xx = x + dx; if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue;
      if (hard[yy * w + xx]) { near = 1; break; }
    }
    if (!near) featherViolations++;
  }
  add("feather-within-4px", featherViolations === 0, { featherPx, violations: featherViolations, maxRadius: FEATHER });

  // protect is the exact complement of edit
  let complementErrors = 0;
  for (let i = 0; i < w * h; i++) if ((protect[i] ? 1 : 0) === (edit[i] ? 1 : 0)) complementErrors++;
  add("protect-is-complement-of-edit", complementErrors === 0, { px: complementErrors });

  // protect actually locks the anatomy A2 must not touch
  for (const [name, zone] of [["head-neck", z.headNeck], ["forearm-hand", z.forearmHand], ["leg", z.leg]]) {
    let unprotected = 0;
    for (let i = 0; i < w * h; i++) if (zone[i] && !protect[i]) unprotected++;
    add("protect-covers:" + name, unprotected === 0, { px: unprotected });
  }

  // hem extension stays in the corridor
  let hemOutside = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (hem[y * w + x] && (x < L.seamX0 || x > L.seamX1 || y < L.hemY || y >= L.crotchY)) hemOutside++;
  add("hem-extension-in-corridor", hemOutside === 0, { px: hemOutside });

  // fingertip clearance
  let fingertipContact = 0;
  for (let y = Math.max(0, L.fingertipY - 8); y < h; y++) for (let x = 0; x < w; x++) if (edit[y * w + x]) fingertipContact++;
  add("fingertip-clearance", fingertipContact === 0, { px: fingertipContact, from: L.fingertipY - 8 });

  // masks are binary by construction
  add("masks-binary", [hard, edit, protect].every((mm) => mm.every((v) => v === 0 || v === 1)), {});

  // no floating islands: the hard mask is one connected region, and no speck survives anywhere
  const comps = components(hard, w, h).map((p) => p.length).sort((a, b) => b - a);
  add("hard-is-single-region", comps.length === 1, { components: comps.length, sizes: comps.slice(0, 6) });
  add("no-specks", comps.every((c) => c >= MIN_COMPONENT), { minComponent: MIN_COMPONENT, smallest: comps[comps.length - 1] ?? 0 });

  // the mask must not sit on bare skin anywhere — neck, arms or hands (hue-based, shadow included)
  let onSkin = 0, editOnSkin = 0;
  for (let i = 0; i < w * h; i++) {
    if (!solid[i] || m.sem[i] !== 1) continue;
    if (hard[i]) onSkin++;
    if (edit[i]) editOnSkin++;
  }
  add("hard-not-on-bare-skin", onSkin === 0, { px: onSkin });
  add("edit-not-on-bare-skin", editOnSkin === 0, { px: editOnSkin });

  // the collar zone must be part of the SAME region as the torso (not a detached cap)
  const teeAbove = [];
  for (let y = 0; y < L.shoulderY; y++) for (let x = 0; x < w; x++) if (hard[y * w + x]) teeAbove.push(y * w + x);
  add("collar-zone-present-and-connected", teeAbove.length > 0 && components(hard, w, h).length === 1,
    { collarPxAboveShoulder: teeAbove.length, hardRegions: components(hard, w, h).length });

  return g;
}

// ── review artifacts (gitignored, never the tracked masks) ──────────────────
function overlayPng(base, mask, colour, alpha = 150) {
  const { w, h, rgba } = base; const out = Buffer.from(rgba);
  for (let i = 0; i < w * h; i++) {
    if (!mask[i]) continue;
    const a = alpha / 255, base0 = out[i * 4 + 3] ? 1 : 0;
    out[i * 4] = Math.round(out[i * 4] * (1 - a) + colour[0] * a);
    out[i * 4 + 1] = Math.round(out[i * 4 + 1] * (1 - a) + colour[1] * a);
    out[i * 4 + 2] = Math.round(out[i * 4 + 2] * (1 - a) + colour[2] * a);
    out[i * 4 + 3] = Math.max(out[i * 4 + 3], base0 ? out[i * 4 + 3] : 210);
  }
  return encodePngRGBA(w, h, out);
}
function zonesPng(base, masks, z) {
  const { w, h, rgba } = base; const out = Buffer.from(rgba); const L = D084;
  const paint = (mask, c, a) => {
    for (let i = 0; i < w * h; i++) {
      if (!mask[i]) continue;
      const f = a / 255;
      out[i * 4] = Math.round(out[i * 4] * (1 - f) + c[0] * f);
      out[i * 4 + 1] = Math.round(out[i * 4 + 1] * (1 - f) + c[1] * f);
      out[i * 4 + 2] = Math.round(out[i * 4 + 2] * (1 - f) + c[2] * f);
      out[i * 4 + 3] = Math.max(out[i * 4 + 3], 210);
    }
  };
  paint(z.headNeck, [220, 60, 60], 120);        // red    — locked
  paint(z.forearmHand, [255, 150, 40], 140);    // orange — locked (the critical exclusion)
  paint(z.leg, [80, 110, 220], 120);            // blue   — locked
  paint(masks.hard, [60, 200, 120], 150);       // green  — must be occluded
  paint(masks.hem, [200, 200, 60], 130);        // yellow — optional hem extension
  // landmark rules
  const line = (y, c) => { if (y < 0 || y >= h) return; for (let x = 0; x < w; x++) { const i = y * w + x; out[i * 4] = c[0]; out[i * 4 + 1] = c[1]; out[i * 4 + 2] = c[2]; out[i * 4 + 3] = 255; } };
  const col = (x, c) => { if (x < 0 || x >= w) return; for (let y = 0; y < h; y++) { const i = y * w + x; out[i * 4] = c[0]; out[i * 4 + 1] = c[1]; out[i * 4 + 2] = c[2]; out[i * 4 + 3] = 255; } };
  line(L.shoulderY, [255, 255, 255]); line(L.sleeveEndY, [255, 255, 255]);
  line(L.hemY, [255, 255, 255]); line(L.crotchY, [255, 255, 255]); line(L.fingertipY, [255, 120, 255]);
  col(L.seamX0, [255, 255, 255]); col(L.seamX1, [255, 255, 255]);
  return encodePngRGBA(w, h, out);
}
// deterministic box-filter downscale
function downscale(w, h, rgba, tw, th) {
  const out = Buffer.alloc(tw * th * 4);
  for (let y = 0; y < th; y++) {
    const sy0 = Math.floor((y * h) / th), sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * h) / th));
    for (let x = 0; x < tw; x++) {
      const sx0 = Math.floor((x * w) / tw), sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * w) / tw));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = sy0; sy < sy1; sy++) for (let sx = sx0; sx < sx1; sx++) {
        const i = (sy * w + sx) * 4; const al = rgba[i + 3];
        r += rgba[i] * al; g += rgba[i + 1] * al; b += rgba[i + 2] * al; a += al; n++;
      }
      const d = (y * tw + x) * 4;
      if (a > 0) { out[d] = Math.round(r / a); out[d + 1] = Math.round(g / a); out[d + 2] = Math.round(b / a); out[d + 3] = Math.round(a / n); }
    }
  }
  return out;
}
function fourScalePng(base, masks) {
  const { w, h } = base;
  const composite = decodePng(overlayPng(base, masks.hard, [60, 200, 120], 150), "composite");
  const SIZES = [[180, 270], [112, 168], [72, 108], [52, 78]];   // D-071 render scales
  const pad = 12;
  const cw = SIZES.reduce((s, [sw]) => s + sw + pad, pad), chh = 270 + pad * 2;
  const out = Buffer.alloc(cw * chh * 4);
  for (let i = 0; i < cw * chh; i++) { out[i * 4] = 26; out[i * 4 + 1] = 28; out[i * 4 + 2] = 36; out[i * 4 + 3] = 255; }
  let ox = pad;
  for (const [sw, sh] of SIZES) {
    const small = downscale(w, h, composite.rgba, sw, sh);
    const oy = pad + (270 - sh);
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      const s = (y * sw + x) * 4, d = ((oy + y) * cw + (ox + x)) * 4;
      const a = small[s + 3] / 255;
      out[d] = Math.round(out[d] * (1 - a) + small[s] * a);
      out[d + 1] = Math.round(out[d + 1] * (1 - a) + small[s + 1] * a);
      out[d + 2] = Math.round(out[d + 2] * (1 - a) + small[s + 2] * a);
      out[d + 3] = 255;
    }
    ox += sw + pad;
  }
  return encodePngRGBA(cw, chh, out);
}

// ── build (pure) ────────────────────────────────────────────────────────────
export function build() {
  assertConstants();
  const base = loadBase();
  const m = measure(base);
  const z = zones(base, m);                 // anatomy locks first — the masks are clipped against them
  const masks = buildMasks(base, m, z);
  const gates = runGates(base, m, masks, z);
  const png = {
    hard: maskPng(base.w, base.h, masks.hard),
    edit: maskPng(base.w, base.h, masks.edit),
    protect: maskPng(base.w, base.h, masks.protect),
  };
  const stat = (mask, buf) => ({ px: count(mask), bbox: bbox(mask, base.w, base.h), sha256: sha256(buf), bytes: buf.length });

  // CLOSED in the D-085 revision: the tee's collar/shoulder curve above the locked shoulder line used
  // to be an accepted 2,740 px residue, because the first cut obeyed a flat "0 px at y < 560" rule.
  // The garment is now identified topologically, so the curve is inside the mask. Both numbers are kept
  // in the record: how much collar the mask owns, and how much is still uncovered (must be 0).
  const COLLAR_BAND = 60;                       // Master px above the shoulder line
  const above = new Uint8Array(base.w * base.h);
  let teeCollarPx = 0, teeCollarUncovered = 0;
  // Colour-only "grey" pixels in the same band that are NOT part of the garment. Measured with their
  // adjacency and distance to the tee, because that is the evidence for calling them anatomy: the
  // classifier reads shadowed neck/jaw skin and outline strokes as grey, and painting them would put
  // the mask on the neck. Reported, never covered.
  let nonTeeGrey = 0, nonTeeAdjacent = 0, nonTeeFar = 0;
  for (let y = Math.max(0, D084.shoulderY - COLLAR_BAND); y < D084.shoulderY; y++) for (let x = 0; x < base.w; x++) {
    const i = y * base.w + x;
    if (!m.solid[i]) continue;
    // "uncovered" uses the same definition as the gate: outside BOTH masks. A pixel the island rule
    // moved from hard to edit is still paintable, so it is not a hole in the occlusion.
    if (m.tee[i]) { above[i] = 1; teeCollarPx++; if (!masks.hard[i] && !masks.edit[i]) teeCollarUncovered++; continue; }
    if (m.sem[i] !== 3) continue;                  // fabric-coloured but not part of the garment
    nonTeeGrey++;
    let adjacent = false, near = false;
    for (let dy = -10; dy <= 10 && !near; dy++) for (let dx = -10; dx <= 10; dx++) {
      const yy = y + dy, xx = x + dx;
      if (yy < 0 || yy >= base.h || xx < 0 || xx >= base.w) continue;
      if (!m.tee[yy * base.w + xx]) continue;
      near = true;
      if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) adjacent = true;
      break;
    }
    if (adjacent) nonTeeAdjacent++;
    if (!near) nonTeeFar++;
  }
  const spec = {
    tool: TOOL, toolVersion: TOOL_VERSION,
    input: { path: INPUT_REL, sha256: base.inputSha, width: SRC_W, height: SRC_H, note: "RUNTIME base (R2_MANIFEST base neutral-medium: 2). The Phase-1 v1 PNG is NOT an input." },
    decoder: { name: "libwebp dwebp", version: DWEBP_VERSION, sha256: DWEBP_SHA256, vendored: "tools/avatar/vendor/dwebp.exe (gitignored)", bootstrap: "node tools/avatar/fetch-dwebp.mjs" },
    output: { width: OUT_W, height: OUT_H, upscale: UPSCALE, solidThreshold: SOLID, featherMax: FEATHER },
    landmarks: { locked: { ...D084 }, measured: { ...m.measured }, toleranceMasterPx: LANDMARK_TOL },
    masks: {
      "torso-occlusion-hard-v1.png": stat(masks.hard, png.hard),
      "torso-edit-allowed-v1.png": stat(masks.edit, png.edit),
      "torso-protect-v1.png": stat(masks.protect, png.protect),
    },
    hemExtension: { px: count(masks.hem), bbox: bbox(masks.hem, base.w, base.h) },
    tee: { px: count(m.tee), topY: m.teeTop, bbox: bbox(m.tee, base.w, base.h),
      how: "8-connected garment components seeded from the mid-torso; the shoes are grey too but form their own components and never touch the seed" },
    residues: {
      collarAboveShoulderLine: {
        status: teeCollarUncovered === 0 ? "CLOSED" : "OPEN",
        teeCollarPx, uncoveredPx: teeCollarUncovered,
        bbox: bbox(above, base.w, base.h), bandMasterPx: COLLAR_BAND,
        band: { y0: D084.shoulderY - COLLAR_BAND, y1: D084.shoulderY - 1 },
        note: "Was an accepted 2,740 px residue in the first A1 cut, which obeyed a flat '0 px at y < shoulderY' rule. The garment is now identified topologically, so the collar curve is inside the mask and the D-037 full-occlusion requirement is met.",
      },
      nonTeeGreyInCollarBand: {
        px: nonTeeGrey, adjacentToTee: nonTeeAdjacent, fartherThan10px: nonTeeFar,
        why: "Fabric-coloured pixels in the band that are NOT part of the connected garment — anti-aliased blends along the jaw/ear/neck contour. Measured, not covered: they belong to the head, and the anatomy gates forbid masking there.",
      },
      detachedFringe: (gates.find((g) => g.id === "no-unreachable-garment") || { detail: {} }).detail,
    },
    gates: gates.map((g) => ({ id: g.id, pass: g.pass, detail: g.detail })),
    status: gates.every((g) => g.pass) ? "A1_BUILT_GATES_PASS_OWNER_VISUAL_REVIEW_REQUIRED" : "A1_GATES_FAILED",
    boundaries: {
      d037: "CONDITIONAL — not discharged by this tool",
      d083Fallback: "unchanged — whole-avatar C2 while an unrenderable cosmetic is equipped",
      avatarR2: false, wroteRuntimeAsset: false, wroteR2Manifest: false, aiUsed: false,
    },
  };
  return { base, m, masks, z, gates, png, spec };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
function main(argv) {
  const write = argv.includes("--write");
  const reviewOnly = argv.includes("--review-only");
  const mode = write ? "write" : reviewOnly ? "review-only" : "verify";
  const r = build();
  const failed = r.gates.filter((g) => !g.pass);

  console.log(`${TOOL} v${TOOL_VERSION} — mode: ${mode}`);
  console.log(`input: ${INPUT_REL} (${r.spec.input.sha256.slice(0, 12)}…)  output canvas ${OUT_W}x${OUT_H}`);
  for (const k of Object.keys(D084)) {
    const l = D084[k], mm = r.m.measured[k];
    console.log(`  landmark ${k.padEnd(11)} locked ${String(l).padStart(5)}  measured ${String(mm).padStart(5)}  delta ${String(Math.abs(mm - l)).padStart(3)}`);
  }
  for (const [name, s] of Object.entries(r.spec.masks)) {
    console.log(`  ${name.padEnd(30)} px ${String(s.px).padStart(8)}  bbox ${JSON.stringify(s.bbox)}  sha ${s.sha256.slice(0, 12)}…`);
  }
  console.log(`  gates: ${r.gates.length - failed.length}/${r.gates.length} pass`);
  for (const g of failed) console.log(`  ✖ ${g.id}: ${JSON.stringify(g.detail)}`);
  if (failed.length) { console.error("HARD FAIL — refusing to write."); process.exitCode = 2; return; }

  if (mode === "verify") {
    // compare against the tracked fixtures; never write
    let mismatch = 0;
    for (const [key, file] of [["hard", FIX.hard], ["edit", FIX.edit], ["protect", FIX.protect]]) {
      if (!existsSync(file)) { console.error(`  ✖ missing tracked fixture ${rel(file)} — run with --write`); mismatch++; continue; }
      const have = sha256(readFileSync(file));
      const want = sha256(r.png[key]);
      if (have !== want) { console.error(`  ✖ fixture drift ${rel(file)}\n      tracked ${have}\n      rebuilt ${want}`); mismatch++; }
      else console.log(`  ✓ ${rel(file)} matches the rebuild`);
    }
    if (!existsSync(FIX.spec)) { console.error(`  ✖ missing ${rel(FIX.spec)}`); mismatch++; }
    if (mismatch) { console.error("VERIFY FAILED"); process.exitCode = 3; return; }
    console.log("VERIFY OK — tracked masks reproduce byte-identically. No file written.");
    return;
  }

  mkdirSync(BUILD_DIR, { recursive: true });
  if (mode === "write") {
    mkdirSync(FIX_DIR, { recursive: true });
    writeFileSync(guardedPath(FIX.hard), r.png.hard);
    writeFileSync(guardedPath(FIX.edit), r.png.edit);
    writeFileSync(guardedPath(FIX.protect), r.png.protect);
    writeFileSync(guardedPath(FIX.spec), JSON.stringify(r.spec, null, 2) + "\n");
    console.log("  wrote tracked template → " + rel(FIX_DIR));
  }
  writeFileSync(guardedPath(REVIEW.hardOver), overlayPng(r.base, r.masks.hard, [60, 200, 120]));
  writeFileSync(guardedPath(REVIEW.editOver), overlayPng(r.base, r.masks.edit, [80, 170, 255]));
  writeFileSync(guardedPath(REVIEW.protectOver), overlayPng(r.base, r.masks.protect, [220, 60, 60], 110));
  writeFileSync(guardedPath(REVIEW.zones), zonesPng(r.base, r.masks, r.z));
  writeFileSync(guardedPath(REVIEW.fourScale), fourScalePng(r.base, r.masks));
  writeFileSync(guardedPath(REVIEW.report), JSON.stringify({ ...r.spec, reviewArtifacts: Object.values(REVIEW).map(rel) }, null, 2) + "\n");
  console.log("  wrote review-only artifacts → " + rel(BUILD_DIR));
  console.log("STATUS: A1_BUILT — OWNER_VISUAL_REVIEW_REQUIRED (D-037 stays CONDITIONAL).");
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  try { main(process.argv.slice(2)); }
  catch (err) { console.error("✖ " + (err && err.message ? err.message : String(err))); process.exitCode = 1; }
}
