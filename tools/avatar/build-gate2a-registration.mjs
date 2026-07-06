// 167A Phase-2 — Gate 2A: deterministic registration-only tool (recovery-base → Master frame).
// ---------------------------------------------------------------------------
// Plan of record: docs/167a-phase2-gate2a-registration-plan.md
// Decision:       docs/167a-phase2-base-recovery-decision.md (D-043, revised)
//
// WHAT THIS IS (Gate 2A ONLY):
//   * Read the frozen Master (canonical identity/style/coordinate datum, D-032) and the candidate
//     registered base-layer source recovery-base-v1-blankface.png.
//   * Place recovery-base INTO the Master coordinate frame by a KNOWN, DETERMINISTIC translation.
//   * Emit REVIEW-ONLY, gitignored artifacts + a deterministic validation report for a human decision.
//
// WHAT THIS IS NOT:
//   * NOT a Gate-2 pass. NOT neutral-outfit work. NOT Gate 3 (face/eyes/eyelid/hair). NOT runtime.
//   * NOT promotion. NO assets/avatar-r2 write. NO R2_MANIFEST change. AVATAR_R2 stays false.
//   * NOT AI / NOT ComfyUI. Pure Node built-ins (zlib, crypto). Deterministic.
//   * The Master and recovery-base reference files are READ-ONLY (never modified).
//
// DIRECTION RULE (do not confuse — asserted below):
//   Verified (falsification-tested): recovery = Master + (+25 x, +285 y).
//   i.e. a Master feature at (x, y) appears in recovery-base at (x+25, y+285)  →  MASTER → RECOVERY = (+25,+285)
//   To place recovery-base INTO the Master frame we translate the recovery image by the NEGATION:
//                                                                                    RECOVERY → MASTER = (-25,-285)
//   Output sampling (Master frame): registered[x,y] = recovery[x + 25, y + 285].
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { inflateSync, deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, sep } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const MASTER   = join(REPO, "assets", "avatar", "reference", "Northstar Master.png");
const RECOVERY = join(REPO, "assets", "avatar", "reference", "recovery-base-v1-blankface.png");

// Frozen input contract (D-032) — Master remains canonical; abort on any mismatch.
const MASTER_EXPECT_SHA = "2ca10ef868b9564164f28afc8bb03baec99cc10fd03f7200ed2dc58edd607a21";
const EXPECT_W = 1024, EXPECT_H = 1536;

// ── Translation constants (PINNED — accidental edits must fail fast) ─────────
const MASTER_TO_RECOVERY = Object.freeze({ x: 25,  y: 285 });   // Master feature (x,y) → recovery (x+25,y+285)
const RECOVERY_TO_MASTER = Object.freeze({ x: -25, y: -285 });  // operation to place recovery INTO Master frame
function assertTranslationIntegrity() {
  const okFixed = MASTER_TO_RECOVERY.x === 25 && MASTER_TO_RECOVERY.y === 285;
  const okNeg   = RECOVERY_TO_MASTER.x === -MASTER_TO_RECOVERY.x && RECOVERY_TO_MASTER.y === -MASTER_TO_RECOVERY.y;
  if (!okFixed || !okNeg) {
    throw new Error(
      "Gate 2A translation constants corrupted — refusing.\n" +
      "  Expected MASTER_TO_RECOVERY=(+25,+285) and RECOVERY_TO_MASTER = its negation (-25,-285).\n" +
      "  Got MASTER_TO_RECOVERY=(" + MASTER_TO_RECOVERY.x + "," + MASTER_TO_RECOVERY.y + ") " +
      "RECOVERY_TO_MASTER=(" + RECOVERY_TO_MASTER.x + "," + RECOVERY_TO_MASTER.y + ")"
    );
  }
}

// Body band (Master frame) for silhouette IoU + pixel preservation: below the neck, above the
// recovery crop — the shared, unmodified region where a rigid translate must overlap tightly.
const BODY_Y0 = 540, BODY_Y1 = 1240;

// ── output dir (gitignored review-only) — nothing may be written outside it ──
const OUT_DIR = join(HERE, "build", "phase2", "gate2a");
const OUT = {
  registered:   join(OUT_DIR, "recovery-base-registered-v1.png"),
  overlay:      join(OUT_DIR, "overlay-registered-vs-master.png"),
  overlayDark:  join(OUT_DIR, "overlay-registered-vs-master-on-dark.png"),
  feetAudit:    join(OUT_DIR, "feet-completion-audit.png"),
  report:       join(OUT_DIR, "gate2a-validation-report.json"),
};
function assertInsideGate2a(p) {
  const base = resolve(OUT_DIR) + sep;
  const full = resolve(p);
  if (!full.startsWith(base)) {
    throw new Error("Refusing write outside Gate 2A dir (guardrail):\n  dir: " + base + "\n  path: " + full);
  }
  // Belt-and-braces: never anywhere near a runtime/promotion target.
  const forbidden = ["assets" + sep + "avatar-r2", "R2_MANIFEST", "js" + sep + "avatar-layers"];
  for (const f of forbidden) if (full.includes(f)) throw new Error("Guardrail: output path touches forbidden target: " + f);
  return full;
}

// ── minimal CRC32 / PNG codec (decode RGB type-2 AND RGBA type-6; encode RGBA + RGB) ─────
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
  if (ihdr.bit !== 8 || ihdr.il !== 0 || (ihdr.ct !== 2 && ihdr.ct !== 6)) {
    throw new Error(label + ": unsupported PNG (need 8-bit RGB or RGBA, non-interlaced); got " + JSON.stringify(ihdr));
  }
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

// ── figure predicates ────────────────────────────────────────────────────────
// Master is RGB on an opaque white matte → figure = non-white. Recovery is RGBA → figure = alpha>16.
function masterFig(m, x, y) { const i = (y * m.w + x) * 4; const r = m.rgba[i], g = m.rgba[i + 1], b = m.rgba[i + 2]; return !(r >= 244 && g >= 244 && b >= 244); }
function alphaAt(img, x, y) { return img.rgba[(y * img.w + x) * 4 + 3]; }
function recFig(r, x, y) { return alphaAt(r, x, y) > 16; }

// registered(x,y) [Master frame] samples recovery at (x + 25, y + 285).
function sampleRecoveryInMasterFrame(rec, x, y) {
  const sx = x + MASTER_TO_RECOVERY.x, sy = y + MASTER_TO_RECOVERY.y;
  if (sx < 0 || sx >= rec.w || sy < 0 || sy >= rec.h) return null;
  const i = (sy * rec.w + sx) * 4;
  return { r: rec.rgba[i], g: rec.rgba[i + 1], b: rec.rgba[i + 2], a: rec.rgba[i + 3] };
}

function main() {
  assertTranslationIntegrity();

  // 1–2. read inputs (fail fast if missing)
  for (const [p, name] of [[MASTER, "Master"], [RECOVERY, "recovery-base"]]) {
    if (!existsSync(p)) throw new Error("Missing input " + name + ": " + p);
  }
  const masterBuf = readFileSync(MASTER);
  const masterSha = createHash("sha256").update(masterBuf).digest("hex");
  if (masterSha !== MASTER_EXPECT_SHA) {
    throw new Error("Master sha256 mismatch — refusing (canonical datum, D-032).\n  expected " + MASTER_EXPECT_SHA + "\n  got      " + masterSha);
  }
  const recBuf = readFileSync(RECOVERY);
  const recSha = createHash("sha256").update(recBuf).digest("hex");

  const M = decodePng(masterBuf, "Master");
  const R = decodePng(recBuf, "recovery-base");

  // 3. dimension validation (fail fast)
  if (M.w !== EXPECT_W || M.h !== EXPECT_H) throw new Error("Master dims " + M.w + "×" + M.h + " ≠ " + EXPECT_W + "×" + EXPECT_H);
  if (R.w !== EXPECT_W || R.h !== EXPECT_H) throw new Error("recovery-base dims " + R.w + "×" + R.h + " ≠ " + EXPECT_W + "×" + EXPECT_H);

  const W = EXPECT_W, H = EXPECT_H;

  // 4. register recovery into Master frame → RGBA (transparent where recovery has no data)
  const registered = Buffer.alloc(W * H * 4);
  let regOpaque = 0, regSemi = 0, regTransparent = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const di = (y * W + x) * 4;
    const s = sampleRecoveryInMasterFrame(R, x, y);
    if (s === null) { registered[di + 3] = 0; regTransparent++; continue; }
    registered[di] = s.r; registered[di + 1] = s.g; registered[di + 2] = s.b; registered[di + 3] = s.a;
    if (s.a === 0) regTransparent++; else if (s.a === 255) regOpaque++; else regSemi++;
  }
  const regFig = (x, y) => registered[(y * W + x) * 4 + 3] > 16;

  // recovery raw alpha summary
  let recOpaque = 0, recSemi = 0, recTransparent = 0;
  for (let i = 0; i < W * H; i++) { const a = R.rgba[i * 4 + 3]; if (a === 0) recTransparent++; else if (a === 255) recOpaque++; else recSemi++; }

  // 5a. silhouette IoU + pixel preservation in body band (Master frame)
  let inter = 0, uni = 0, mOnly = 0, rOnly = 0;
  let presN = 0, presLE5 = 0, presLE15 = 0, sumDelta = 0;
  for (let y = BODY_Y0; y <= BODY_Y1; y++) for (let x = 0; x < W; x++) {
    const mf = masterFig(M, x, y), rf = regFig(x, y);
    if (mf || rf) uni++; if (mf && rf) inter++; if (mf && !rf) mOnly++; if (rf && !mf) rOnly++;
    if (mf && rf) {
      const mi = (y * W + x) * 4, ri = (y * W + x) * 4;
      const d = Math.abs(M.rgba[mi] - registered[ri]) + Math.abs(M.rgba[mi + 1] - registered[ri + 1]) + Math.abs(M.rgba[mi + 2] - registered[ri + 2]);
      presN++; sumDelta += d; if (d <= 5) presLE5++; if (d <= 15) presLE15++;
    }
  }
  if (uni === 0 || presN === 0) throw new Error("Cannot compute registration metrics — no silhouette overlap in body band (check inputs / translation).");
  const iou = inter / uni;
  const preservationPctLE5 = (presLE5 / presN) * 100;
  const preservationPctLE15 = (presLE15 / presN) * 100;
  const meanDelta = sumDelta / presN;

  // 5b. landmark re-check (≥3 landmarks) — re-derive the offset independently of the pinned constant.
  //     Green sweater bbox is the most reliable shared landmark (L/R = horizontal, top = vertical);
  //     neck-narrowest is a secondary vertical cross-check (may vary a few px on the blank-face contour).
  //     Authoritative registration evidence is the body-band IoU above; this is a cross-check.
  function greenPx(img, x, y) { const i = (y * img.w + x) * 4; if (img.rgba[i + 3] <= 16) return false; const r = img.rgba[i], g = img.rgba[i + 1], b = img.rgba[i + 2]; return g > 70 && g > r + 15 && g > b + 15 && r < 150; }
  function bboxOf(pred, img) { let minx = img.w, maxx = -1, miny = img.h, maxy = -1; for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) if (pred(img, x, y)) { if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; } return maxx < 0 ? null : { minx, maxx, miny, maxy }; }
  function narrowestRow(figFn, img, y0, y1) {
    let bestY = -1, bestW = 1e9;
    for (let y = y0; y <= y1; y++) { let l = img.w, r = -1; for (let x = 0; x < img.w; x++) if (figFn(img, x, y)) { if (x < l) l = x; if (x > r) r = x; } const w = r < 0 ? 1e9 : r - l + 1; if (w < bestW) { bestW = w; bestY = y; } }
    return { y: bestY, w: bestW };
  }
  const gM = bboxOf(greenPx, M), gR = bboxOf(greenPx, R);
  if (!gM || !gR) throw new Error("Cannot compute registration metrics — green-sweater landmark not found.");
  const mNeck = narrowestRow(masterFig, M, 460, 620);
  const rNeck = narrowestRow(recFig, R, 740, 900);
  const landmarks = [
    { name: "sweater-left(x)",   axis: "x", d: gR.minx - gM.minx, expect: MASTER_TO_RECOVERY.x },
    { name: "sweater-right(x)",  axis: "x", d: gR.maxx - gM.maxx, expect: MASTER_TO_RECOVERY.x },
    { name: "sweater-top(y)",    axis: "y", d: gR.miny - gM.miny, expect: MASTER_TO_RECOVERY.y },
    { name: "neck-narrowest(y)", axis: "y", d: rNeck.y - mNeck.y, expect: MASTER_TO_RECOVERY.y },
  ].map((l) => ({ ...l, errorPx: Math.abs(l.d - l.expect) }));
  const median = (arr) => { const a = [...arr].sort((x, y) => x - y); return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2; };
  const derivedDX = median(landmarks.filter((l) => l.axis === "x").map((l) => l.d));
  const derivedDY = median(landmarks.filter((l) => l.axis === "y").map((l) => l.d));
  const offsetLandmarkPass = Math.abs(derivedDX - MASTER_TO_RECOVERY.x) <= 2 && Math.abs(derivedDY - MASTER_TO_RECOVERY.y) <= 3;

  // 6. crop / lower-leg / feet completion audit
  //    recovery cropped at canvas bottom? → its figure bottom in the Master frame determines what feet must be completed from the Master.
  let recBottomTouches = false; for (let x = 0; x < W; x++) if (recFig(R, x, H - 1)) { recBottomTouches = true; break; }
  let regFigBottom = -1; for (let y = H - 1; y >= 0 && regFigBottom < 0; y--) for (let x = 0; x < W; x++) if (regFig(x, y)) { regFigBottom = y; break; }
  let masterFigBottom = -1; for (let y = H - 1; y >= 0 && masterFigBottom < 0; y--) for (let x = 0; x < W; x++) if (masterFig(M, x, y)) { masterFigBottom = y; break; }
  // feet region = below the registered recovery's coverage, down to the Master's feet
  let feetRegionMasterPx = 0;
  const FEET_Y0 = regFigBottom + 1;
  for (let y = Math.max(0, FEET_Y0); y <= masterFigBottom && y < H; y++) for (let x = 0; x < W; x++) if (masterFig(M, x, y)) feetRegionMasterPx++;
  // crown region (top, master-only) is expected: recovery is bald, Master has hair
  let crownMasterOnlyPx = 0;
  for (let y = 0; y < BODY_Y0; y++) for (let x = 0; x < W; x++) if (masterFig(M, x, y) && !regFig(x, y)) crownMasterOnlyPx++;

  // ── artifacts ──
  mkdirSync(OUT_DIR, { recursive: true });

  // (a) registered recovery
  writeFileSync(assertInsideGate2a(OUT.registered), encodePngRGBA(W, H, registered));

  // (b/c) overlay master vs registered recovery (on white + on dark)
  function overlay(bg) {
    const out = Buffer.alloc(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const di = (y * W + x) * 4; const mf = masterFig(M, x, y), rf = regFig(x, y);
      let c;
      if (mf && rf) c = [70, 70, 78];        // overlap (should be almost the whole figure)
      else if (mf && !rf) c = [225, 60, 60];  // Master-only (crown hair at top; feet at bottom; thin edges)
      else if (rf && !mf) c = [60, 130, 230];  // recovery-only (should be tiny)
      else c = bg;
      out[di] = c[0]; out[di + 1] = c[1]; out[di + 2] = c[2]; out[di + 3] = 255;
    }
    return out;
  }
  writeFileSync(assertInsideGate2a(OUT.overlay), encodePngRGBA(W, H, overlay([255, 255, 255])));
  writeFileSync(assertInsideGate2a(OUT.overlayDark), encodePngRGBA(W, H, overlay([38, 40, 46])));

  // (d) feet-completion audit: registered recovery in colour + Master-only pixels highlighted (feet = orange, crown = grey)
  const feet = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const di = (y * W + x) * 4;
    if (regFig(x, y)) { const si = (y * W + x) * 4; feet[di] = registered[si]; feet[di + 1] = registered[si + 1]; feet[di + 2] = registered[si + 2]; feet[di + 3] = 255; continue; }
    if (masterFig(M, x, y)) {
      if (y >= FEET_Y0) { feet[di] = 255; feet[di + 1] = 140; feet[di + 2] = 0; }        // feet to complete from Master → orange
      else { feet[di] = 150; feet[di + 1] = 150; feet[di + 2] = 156; }                    // crown/other Master-only → grey
      feet[di + 3] = 255; continue;
    }
    feet[di] = 250; feet[di + 1] = 250; feet[di + 2] = 250; feet[di + 3] = 255;            // bg
  }
  writeFileSync(assertInsideGate2a(OUT.feetAudit), encodePngRGBA(W, H, feet));

  // read-only runtime validation: AVATAR_R2 flag (never modified here)
  let avatarR2False = null;
  try {
    const src = readFileSync(join(REPO, "js", "avatar-layers.js"), "utf8");
    avatarR2False = /export\s+const\s+AVATAR_R2\s*=\s*false\s*;/.test(src);
  } catch { avatarR2False = "unreadable"; }

  const rel = (p) => p.replace(REPO + sep, "").split(sep).join("/");
  const report = {
    tool: "build-gate2a-registration",
    phase: "167A Phase-2 — Gate 2A (registration only; NOT a Gate-2 pass)",
    generatedAt: new Date().toISOString(),
    inputs: {
      master:   { path: rel(MASTER),   dims: M.w + "×" + M.h, colorType: M.ct, sha256: masterSha, role: "canonical identity/style/coordinate datum (D-032, read-only)" },
      recovery: { path: rel(RECOVERY), dims: R.w + "×" + R.h, colorType: R.ct, sha256: recSha, role: "candidate registered base-layer source (NOT a new Master, read-only)" },
    },
    output: { dir: rel(OUT_DIR), dims: W + "×" + H, artifacts: Object.fromEntries(Object.entries(OUT).map(([k, v]) => [k, rel(v)])) },
    translation: {
      masterToRecovery: MASTER_TO_RECOVERY, recoveryToMaster: RECOVERY_TO_MASTER,
      applied: "registered[x,y] = recovery[x + " + MASTER_TO_RECOVERY.x + ", y + " + MASTER_TO_RECOVERY.y + "]",
      directionExplanation: "+25/+285 is Master→recovery (a Master feature at (x,y) is at (x+25,y+285) in recovery). To place recovery INTO the Master frame we translate the recovery image by the negation -25/-285. No scale, no rotation, no warp, no re-datum.",
    },
    alpha: {
      recovery:   { opaquePx: recOpaque, semiPx: recSemi, transparentPx: recTransparent },
      registered: { opaquePx: regOpaque, semiPx: regSemi, transparentPx: regTransparent, note: "transparent includes the region uncovered after the -285 up-shift (recovery's cropped feet leave the bottom of the Master frame empty)" },
    },
    silhouetteOverlap: { bodyBand: "y" + BODY_Y0 + "–" + BODY_Y1 + " (Master frame)", iou: +iou.toFixed(4), intersectionPx: inter, unionPx: uni, masterOnlyPx: mOnly, recoveryOnlyPx: rOnly, pass: iou >= 0.98 },
    masterPixelPreservation: { note: "threshold band, NOT 100% byte identity (localized edge/finish drift expected; final call at visual sign-off)", identicalPctLE5: +preservationPctLE5.toFixed(1), closePctLE15: +preservationPctLE15.toFixed(1), meanAbsRgbDelta: +meanDelta.toFixed(2), thresholdBand: ">=80% within Δ≤5 = healthy", pass: preservationPctLE5 >= 80 },
    offsetLandmarkRecheck: {
      landmarks, derivedOffset: { x: derivedDX, y: derivedDY }, expectedOffset: MASTER_TO_RECOVERY,
      tolerancePx: { x: 2, y: 3 }, pass: offsetLandmarkPass,
      note: "offset re-derived from ≥3 landmarks (sweater left/right/top + neck), median used. The neck may read a few px off due to the blank-face contour; the authoritative registration evidence is the body-band IoU.",
    },
    cropFeetAudit: {
      recoveryCroppedAtBottom: recBottomTouches,
      registeredFigureBottomY: regFigBottom, masterFigureBottomY: masterFigBottom,
      feetRegion: "y" + FEET_Y0 + "–" + masterFigBottom + " (Master frame)",
      feetRegionMasterPx: feetRegionMasterPx,
      crownMasterOnlyPx: crownMasterOnlyPx,
      note: "feetRegionMasterPx = Master lower-leg/feet pixels below the registered recovery coverage → what a later step would complete from the Master via the SAME translation. crownMasterOnlyPx is expected (recovery is bald; Master has hair). Completion is NOT performed in Gate 2A.",
    },
    guardrails: {
      recoveryTreatedAsMaster: false,
      masterCanonicalDatumPreserved: true,
      d032Preserved: true,
      wroteOnlyInsideGate2aDir: true,
      noAssetsAvatarR2Write: true,
      noR2ManifestWrite: true,
      noRuntimeWrite: true,
      avatarR2Unchanged: avatarR2False === true ? "false (unchanged)" : avatarR2False,
      gate3NotTouched: true,
      noImageGeneration: true,
      noPromotion: true,
      committedImageArtifacts: false,
    },
    gateStatus: { gate2A: "executed (registration + audit + report)", gate2: "REOPENED / UNDER RECOVERY (NOT satisfied by Gate 2A)", gate3: "PAUSED" },
  };
  writeFileSync(assertInsideGate2a(OUT.report), JSON.stringify(report, null, 2));

  // ── console summary ──
  const P = (b) => (b ? "PASS" : "CHECK");
  console.log("✔ Gate 2A registration complete (deterministic, review-only):");
  console.log("  translation applied: registered[x,y] = recovery[x+" + MASTER_TO_RECOVERY.x + ", y+" + MASTER_TO_RECOVERY.y + "]  (recovery→Master = " + RECOVERY_TO_MASTER.x + "," + RECOVERY_TO_MASTER.y + ")");
  console.log("  body-band IoU        " + iou.toFixed(4) + "  [" + P(report.silhouetteOverlap.pass) + "]");
  console.log("  pixel preservation   Δ≤5 " + preservationPctLE5.toFixed(1) + "% · Δ≤15 " + preservationPctLE15.toFixed(1) + "% · mean " + meanDelta.toFixed(2) + "  [" + P(report.masterPixelPreservation.pass) + "]");
  console.log("  offset re-check      derived (" + derivedDX + "," + derivedDY + ") vs pinned (" + MASTER_TO_RECOVERY.x + "," + MASTER_TO_RECOVERY.y + ")  [" + P(offsetLandmarkPass) + "]  " + landmarks.map((l) => l.name.replace(/\(.\)/, "") + "=" + l.d).join(" "));
  console.log("  feet audit           recovery cropped=" + recBottomTouches + " · feet px to complete=" + feetRegionMasterPx + " (y" + FEET_Y0 + "–" + masterFigBottom + ")");
  console.log("  AVATAR_R2 (read-only) " + report.guardrails.avatarR2Unchanged);
  console.log("  artifacts → " + rel(OUT_DIR) + "/ (gitignored, review-only, NOT promoted)");
  console.log("");
  console.log("Gate 2A does NOT satisfy Gate 2. Next (separate, gated): neutral outfit reconstruction → fresh 164B.3 → composed visual sign-off. Gate 3 stays PAUSED.");
}

main();
