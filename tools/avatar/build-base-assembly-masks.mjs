// 167A Phase-2 — Strategy-B base-assembly + mask-proposal tool (deterministic, review-only).
// ---------------------------------------------------------------------------
// Plan of record: docs/167a-phase2-neutral-outfit-base-assembly-plan.md (Strategy B)
// Decisions:      docs/167a-phase2-feet-completion-decision.md (defer feet into this assembly)
//                 docs/167a-phase2-base-recovery-decision.md (D-043, revised)
//
// WHAT THIS IS:
//   * Deterministic, NON-AI Strategy-B assembly PREVIEW + approximate mask PROPOSALS:
//       - Master (canonical datum, D-032) contributes body / lower legs / FEET (alpha-cut).
//       - recovery-base contributes ONLY the head region (bald scalp + blank face + ears +
//         neck/collar), registered by the verified translation.
//       - Approximate region-mask PROPOSALS for the LATER masked neutral-outfit pass
//         (tee/body clothing, underarms, trousers, shoes) + a neck/collar seam mask.
//   * All outputs are REVIEW-ONLY, gitignored artifacts + a deterministic report.
//
// WHAT THIS IS NOT:
//   * NOT a final/completed base. NOT neutral-outfit execution. NOT a Gate-2 pass.
//   * NOT Gate 3 (no face/eyes/eyelid/hair; the assembled head stays bald + blank).
//   * NOT runtime, NOT promotion, NO assets/avatar-r2 write, NO R2_MANIFEST change,
//     AVATAR_R2 stays false. NOT AI / NOT ComfyUI. build-face-clean.mjs NOT used.
//   * Masks are APPROXIMATE REVIEW-ONLY PROPOSALS — explicitly NOT final masks.
//
// DIRECTION RULE (same as build-gate2a-registration.mjs — asserted below):
//   recovery = Master + (+25 x, +285 y)   →   MASTER → RECOVERY = (+25,+285)
//   To place recovery INTO the Master frame: translate recovery by the negation (−25, −285).
//   Read mapping (Master frame): registered[x,y] = recovery[x + 25, y + 285].
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
const MASTER_TO_RECOVERY = Object.freeze({ x: 25,  y: 285 });
const RECOVERY_TO_MASTER = Object.freeze({ x: -25, y: -285 });
// Strategy-B seam: recovery head contribution ends at the neck/collar join.
// Master-frame facts: neck narrowest ≈ y522; sweater/collar top ≈ y526.
const SEAM_Y = 560;                 // assembly boundary (Master frame)
const SEAM_BAND = Object.freeze({ y0: 540, y1: 580 }); // seam-mask band around the join
const HEAD_X = Object.freeze({ x0: 250, x1: 790 });    // horizontal bound for the head contribution
function assertConstants() {
  const ok =
    MASTER_TO_RECOVERY.x === 25 && MASTER_TO_RECOVERY.y === 285 &&
    RECOVERY_TO_MASTER.x === -MASTER_TO_RECOVERY.x && RECOVERY_TO_MASTER.y === -MASTER_TO_RECOVERY.y &&
    SEAM_BAND.y0 < SEAM_Y && SEAM_Y < SEAM_BAND.y1;
  if (!ok) throw new Error("Pinned constants corrupted (translation/seam) — refusing.");
}

// ── output dir (gitignored review-only) — nothing may be written outside it ──
const OUT_DIR = join(HERE, "build", "phase2", "base-assembly");
const OUT = {
  assembled:    join(OUT_DIR, "base-assembled-review-v1.png"),
  headMask:     join(OUT_DIR, "head-contribution-mask.png"),
  seamMask:     join(OUT_DIR, "neck-collar-seam-mask.png"),
  seamAudit:    join(OUT_DIR, "base-assembly-seam-audit.png"),
  outfitMask:   join(OUT_DIR, "outfit-region-mask.png"),
  teeMask:      join(OUT_DIR, "tee-region-mask-proposal.png"),
  underarmMask: join(OUT_DIR, "underarm-region-mask-proposal.png"),
  trousersMask: join(OUT_DIR, "trousers-region-mask-proposal.png"),
  shoesMask:    join(OUT_DIR, "shoes-region-mask-proposal.png"),
  geomOverlay:  join(OUT_DIR, "master-vs-assembled-geometry-overlay.png"),
  report:       join(OUT_DIR, "base-assembly-report.json"),
};
function guardedPath(p) {
  const base = resolve(OUT_DIR) + sep;
  const full = resolve(p);
  if (!full.startsWith(base)) throw new Error("Refusing write outside base-assembly dir (guardrail):\n  " + full);
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

// ── Master white-matte alpha-cut (border flood-fill; same approach as extract-master-base.mjs) ──
function alphaCutMaster(m, whiteHi = 250) {
  const { w, h, rgba } = m;
  const out = Buffer.from(rgba); // copy; alpha currently 255 everywhere
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

// ── predicates ────────────────────────────────────────────────────────────────
const aAt = (img, x, y) => img.rgba[(y * img.w + x) * 4 + 3];
const fig = (img, x, y) => aAt(img, x, y) > 16;
function px(img, x, y) { const i = (y * img.w + x) * 4; return { r: img.rgba[i], g: img.rgba[i + 1], b: img.rgba[i + 2], a: img.rgba[i + 3] }; }
// registered recovery sample in Master frame
function recAt(rec, x, y) {
  const sx = x + MASTER_TO_RECOVERY.x, sy = y + MASTER_TO_RECOVERY.y;
  if (sx < 0 || sx >= rec.w || sy < 0 || sy >= rec.h) return null;
  return px(rec, sx, sy);
}
// colour detectors on the ALPHA-CUT MASTER (approximate — proposals only)
function isGreen(p) { return p.a > 16 && p.g > 70 && p.g > p.r + 15 && p.g > p.b + 15 && p.r < 160; }
function isNavy(p)  { return p.a > 16 && p.r < 90 && p.g < 100 && p.b > 45 && p.b < 130 && p.b >= p.g - 10; }

function maskPng(w, h, mask, rgb) { // mask visual on a dark background (reviewable on any viewer)
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    if (mask[i]) { out[i * 4] = rgb[0]; out[i * 4 + 1] = rgb[1]; out[i * 4 + 2] = rgb[2]; }
    else { out[i * 4] = 38; out[i * 4 + 1] = 40; out[i * 4 + 2] = 46; }
    out[i * 4 + 3] = 255;
  }
  return encodePngRGBA(w, h, out);
}
function bounds(mask, w, h) {
  let minx = w, maxx = -1, miny = h, maxy = -1, n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) { n++; if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
  return n ? { x0: minx, x1: maxx, y0: miny, y1: maxy, px: n } : { px: 0 };
}

function main() {
  assertConstants();

  // inputs (fail fast)
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
  const W = EXPECT_W, H = EXPECT_H;
  const referenceExists = existsSync(REFERENCE); // appearance-only context; never geometry, never modified

  // Master → alpha-cut body source
  const { rgba: MC, cut: matteCut } = alphaCutMaster(M);
  const Mcut = { w: W, h: H, rgba: MC };

  // ── Strategy-B assembly (review preview) ──
  // y <  SEAM_Y : recovery head contribution ONLY (registered; bald scalp + blank face + ears +
  //               neck/collar). NO Master fallback here — the Master's baked HAIR/face must NOT
  //               leak into the assembled head (base stays bald + blank; hair = separate z40 layer,
  //               Gate 3 paused).
  // y >= SEAM_Y : Master body / lower legs / FEET (alpha-cut).
  const assembled = Buffer.alloc(W * H * 4);
  const headMask = new Uint8Array(W * H);
  let headPx = 0, masterPx = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const di = (y * W + x) * 4;
    let src = null, fromHead = false;
    if (y < SEAM_Y) {
      if (x >= HEAD_X.x0 && x <= HEAD_X.x1) {
        const rp = recAt(R, x, y);
        if (rp && rp.a > 16) { src = rp; fromHead = true; }
      }
      // no Master fallback above the seam (keeps the head bald + blank)
    } else {
      const mp = px(Mcut, x, y); if (mp.a > 16) src = mp;
    }
    if (!src) continue;
    assembled[di] = src.r; assembled[di + 1] = src.g; assembled[di + 2] = src.b; assembled[di + 3] = src.a;
    if (fromHead) { headMask[y * W + x] = 1; headPx++; } else masterPx++;
  }
  const A = { w: W, h: H, rgba: assembled };

  // ── seam mask (neck/collar band, figure-limited) ──
  const seamMask = new Uint8Array(W * H);
  for (let y = SEAM_BAND.y0; y <= SEAM_BAND.y1; y++) for (let x = 0; x < W; x++) if (fig(A, x, y)) seamMask[y * W + x] = 1;

  // ── outfit region PROPOSALS (approximate; from the alpha-cut Master; review-only) ──
  const teeMask = new Uint8Array(W * H);       // green sweater → future tee/body-clothing zone
  const underarmMask = new Uint8Array(W * H);  // lower-sleeve/forearm zone → future reconstructed skin
  const trousersMask = new Uint8Array(W * H);  // navy cargo → future charcoal straight trousers
  const shoesMask = new Uint8Array(W * H);     // sneakers → future light-grey low sneakers
  const SHOES_Y0 = 1300;                        // feet zone (Master feet baseline ≈ y1508)
  const UNDERARM = Object.freeze({ y0: 760, y1: 990, xInL: 430, xInR: 600 }); // outer-arm band (approx)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = px(Mcut, x, y); if (p.a <= 16) continue;
    const i = y * W + x;
    if (y >= SHOES_Y0) { shoesMask[i] = 1; continue; }          // whole feet zone (shoes + trouser hem edge)
    if (isGreen(p) && y < 1100) {
      teeMask[i] = 1;
      if (y >= UNDERARM.y0 && y <= UNDERARM.y1 && (x < UNDERARM.xInL || x > UNDERARM.xInR)) underarmMask[i] = 1;
    } else if (isNavy(p) && y > 820) trousersMask[i] = 1;
  }
  const outfitMask = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (teeMask[i] || underarmMask[i] || trousersMask[i] || shoesMask[i]) outfitMask[i] = 1;

  // ── geometry overlay + silhouette comparison vs Master ──
  const overlay = Buffer.alloc(W * H * 4);
  let inter = 0, uni = 0, mOnly = 0, aOnly = 0;               // full-figure
  let bInter = 0, bUni = 0;                                    // body band below seam (must be ~1.0)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const mf = fig(Mcut, x, y), af = fig(A, x, y);
    const di = (y * W + x) * 4;
    let c;
    if (mf && af) c = [70, 70, 78]; else if (mf) c = [225, 60, 60]; else if (af) c = [60, 130, 230]; else c = [250, 250, 250];
    overlay[di] = c[0]; overlay[di + 1] = c[1]; overlay[di + 2] = c[2]; overlay[di + 3] = 255;
    if (mf || af) { uni++; if (mf && af) inter++; else if (mf) mOnly++; else aOnly++; }
    if (y >= SEAM_Y) { if (mf || af) { bUni++; if (mf && af) bInter++; } }
  }
  if (uni === 0) throw new Error("Cannot compute geometry comparison — empty silhouettes.");
  const iouFull = inter / uni, iouBody = bUni ? bInter / bUni : 0;

  // ── seam-audit visual: assembled in colour + seam band highlighted ──
  const seamAudit = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const di = (y * W + x) * 4; const i = y * W + x;
    if (seamMask[i]) { seamAudit[di] = 255; seamAudit[di + 1] = 60; seamAudit[di + 2] = 200; seamAudit[di + 3] = 255; continue; }
    if (assembled[di + 3] > 16) { seamAudit[di] = assembled[di]; seamAudit[di + 1] = assembled[di + 1]; seamAudit[di + 2] = assembled[di + 2]; seamAudit[di + 3] = 255; }
    else { seamAudit[di] = 250; seamAudit[di + 1] = 250; seamAudit[di + 2] = 250; seamAudit[di + 3] = 255; }
  }

  // ── alpha summary of the assembled preview ──
  let aOpaque = 0, aSemi = 0, aTrans = 0;
  for (let i = 0; i < W * H; i++) { const a = assembled[i * 4 + 3]; if (a === 0) aTrans++; else if (a === 255) aOpaque++; else aSemi++; }

  // ── write artifacts (path-guarded) ──
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(guardedPath(OUT.assembled), encodePngRGBA(W, H, assembled));
  writeFileSync(guardedPath(OUT.headMask), maskPng(W, H, headMask, [255, 255, 255]));
  writeFileSync(guardedPath(OUT.seamMask), maskPng(W, H, seamMask, [255, 255, 255]));
  writeFileSync(guardedPath(OUT.seamAudit), encodePngRGBA(W, H, seamAudit));
  writeFileSync(guardedPath(OUT.outfitMask), maskPng(W, H, outfitMask, [255, 255, 255]));
  writeFileSync(guardedPath(OUT.teeMask), maskPng(W, H, teeMask, [120, 200, 120]));
  writeFileSync(guardedPath(OUT.underarmMask), maskPng(W, H, underarmMask, [255, 170, 60]));
  writeFileSync(guardedPath(OUT.trousersMask), maskPng(W, H, trousersMask, [90, 120, 220]));
  writeFileSync(guardedPath(OUT.shoesMask), maskPng(W, H, shoesMask, [200, 90, 200]));
  writeFileSync(guardedPath(OUT.geomOverlay), encodePngRGBA(W, H, overlay));

  // read-only runtime validation (AVATAR_R2 is never written here)
  let avatarR2False = null;
  try { avatarR2False = /export\s+const\s+AVATAR_R2\s*=\s*false\s*;/.test(readFileSync(join(REPO, "js", "avatar-layers.js"), "utf8")); } catch { avatarR2False = "unreadable"; }

  const rel = (p) => resolve(p).replace(resolve(REPO) + sep, "").split(sep).join("/");
  const report = {
    tool: "build-base-assembly-masks",
    phase: "167A Phase-2 — Strategy-B base-assembly preview + mask PROPOSALS (review-only; NOT a Gate-2 pass; NOT a final base; NOT neutral-outfit execution)",
    generatedAt: new Date().toISOString(),
    inputs: {
      master:   { path: rel(MASTER), dims: M.w + "×" + M.h, colorType: M.ct, sha256: masterSha, role: "canonical identity/style/coordinate datum + authoritative body/lower-leg/FEET source (D-032, read-only)", whiteMatteCutPx: matteCut },
      recovery: { path: rel(RECOVERY), dims: R.w + "×" + R.h, colorType: R.ct, role: "candidate registered base-layer source — contributes ONLY head/bald scalp/blank face/ears/neck-collar (NOT a new Master, read-only)" },
    },
    referenceImage: {
      path: rel(REFERENCE), exists: referenceExists,
      statement: "appearance-only neutral-outfit reference; NOT a canonical geometry datum (D-032); not modified, not promoted, not used for geometry in this tool",
    },
    output: { dir: rel(OUT_DIR), dims: W + "×" + H, artifacts: Object.fromEntries(Object.entries(OUT).map(([k, v]) => [k, rel(v)])) },
    registration: {
      masterToRecovery: MASTER_TO_RECOVERY, recoveryToMaster: RECOVERY_TO_MASTER,
      applied: "registered[x,y] = recovery[x + 25, y + 285]",
      directionExplanation: "+25/+285 is Master→recovery; placing recovery INTO the Master frame uses the negation (−25, −285). No scale, no rotation, no warp, no re-datum.",
    },
    strategy: "Strategy B = Master body/lower-legs/feet + recovery head contribution, then LATER one masked neutral-outfit reconstruction pass (not executed here)",
    assembly: {
      seamY: SEAM_Y, headXBounds: HEAD_X,
      recoveryContribution: { ...bounds(headMask, W, H), note: "registered recovery pixels used above the seam (bald scalp + blank face + ears + neck/collar) — localized and bounded" },
      masterContribution: { pxCount: masterPx, note: "alpha-cut Master pixels (body, arms, lower legs, FEET) — everything not covered by the head contribution" },
      recoveryContributionPx: headPx,
      masterContributionPx: masterPx,
    },
    seamMask: { band: SEAM_BAND, ...bounds(seamMask, W, H), note: "neck/collar join band — the later masked neutralization pass spans and absorbs this seam" },
    maskProposals: {
      status: "APPROXIMATE REVIEW-ONLY PROPOSALS — explicitly NOT final masks; to be human-reviewed and refined before any masked edit",
      tee:      { ...bounds(teeMask, W, H),      target: "green sweater → plain light-grey short-sleeve tee zone" },
      underarm: { ...bounds(underarmMask, W, H), target: "lower-sleeve/forearm band → skin to be RECONSTRUCTED (short-sleeve tee)", risk: "HIGHEST-RISK sub-area — requires its own later sub-gate" },
      trousers: { ...bounds(trousersMask, W, H), target: "navy cargo → plain charcoal straight trousers zone" },
      shoes:    { ...bounds(shoesMask, W, H),    target: "sneakers/feet zone → plain light-grey low sneakers (footprint stays Master-compatible)" },
      outfitUnion: { ...bounds(outfitMask, W, H) },
    },
    underarmRiskNote: "The neutral target tee is SHORT-SLEEVED while the Master wears a long-sleeve sweater: the forearms do not exist in the Master and must be reconstructed as skin later. Underarm reconstruction is the highest-risk sub-area and MUST have its own sub-gate/review in the later implementation.",
    alpha: { assembled: { opaquePx: aOpaque, semiPx: aSemi, transparentPx: aTrans } },
    geometryVsMaster: {
      fullFigure: { iou: +iouFull.toFixed(4), intersectionPx: inter, masterOnlyPx: mOnly, assembledOnlyPx: aOnly, note: "master-only is dominated by the HAIR CROWN (assembled head is bald by design) — expected" },
      bodyBelowSeam: { iou: +iouBody.toFixed(4), note: "below the seam the assembled base IS the alpha-cut Master → expected ≈ 1.0 (feet included)" },
    },
    guardrails: {
      pathGuard: "all writes confined to " + rel(OUT_DIR),
      masterCanonicalDatumPreserved: true, d032Preserved: true, recoveryTreatedAsMaster: false,
      finalBase: false, neutralOutfitExecuted: false, aiUsed: false, comfyUiUsed: false,
      gate3Touched: false, buildFaceCleanUsed: false,
      noRuntimeWrite: true, noAssetsAvatarR2Write: true, noR2ManifestWrite: true,
      avatarR2: avatarR2False === true ? "false (unchanged)" : avatarR2False,
      artifactsReviewOnlyGitignored: true,
    },
    gateStatus: { gate2A: "PASS / owner-review-ready (prior)", gate2: "REOPENED / UNDER RECOVERY — NOT satisfied", gate3: "PAUSED" },
  };
  writeFileSync(guardedPath(OUT.report), JSON.stringify(report, null, 2));

  console.log("✔ Strategy-B base-assembly preview + mask proposals (deterministic, review-only):");
  console.log("  head contribution (recovery): " + headPx + " px  bounds x" + report.assembly.recoveryContribution.x0 + "-" + report.assembly.recoveryContribution.x1 + " y" + report.assembly.recoveryContribution.y0 + "-" + report.assembly.recoveryContribution.y1);
  console.log("  master contribution:          " + masterPx + " px (body/arms/legs/FEET)");
  console.log("  seam band y" + SEAM_BAND.y0 + "-" + SEAM_BAND.y1 + " (" + report.seamMask.px + " px)");
  console.log("  masks (PROPOSALS): tee " + report.maskProposals.tee.px + " · underarm " + report.maskProposals.underarm.px + " · trousers " + report.maskProposals.trousers.px + " · shoes " + report.maskProposals.shoes.px);
  console.log("  geometry vs Master: full-figure IoU " + iouFull.toFixed(4) + " (master-only=hair crown, expected) · body-below-seam IoU " + iouBody.toFixed(4));
  console.log("  AVATAR_R2 (read-only) " + report.guardrails.avatarR2);
  console.log("  artifacts → " + rel(OUT_DIR) + "/ (gitignored, review-only, NOT promoted, NOT a final base)");
  console.log("");
  console.log("NOT a Gate-2 pass. Gate 2 stays REOPENED / UNDER RECOVERY; Gate 3 stays PAUSED. Next (separate, gated): owner review of this output, then AI-assisted masked neutral-outfit candidate work.");
}

main();
