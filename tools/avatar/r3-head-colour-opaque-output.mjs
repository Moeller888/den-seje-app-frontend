// D-152 — what an OPAQUE-background output needs before the unchanged D-149 post-processing. NO NETWORK.
//
// D-151 asked for background "transparent" and gpt-image-2-2026-04-21 refused it (HTTP 400, invalid_value on
// `background`; the API reference marks transparency for this model as "in preview"). D-152 prepares
// background "opaque" instead. The D-149 processor takes the output's RGB ONLY inside the pinned head
// geometry and writes the final alpha from that geometry, so the final alpha, geometry, K4, TRANSITION and
// PROTECT₂ do not depend on the output's alpha (proven by tests). Two things DO change with an opaque output,
// and this module handles both without touching the D-149 processor:
//
//   1  FORMAT. An opaque PNG may arrive as 8-bit RGB (colour type 2) instead of RGBA (type 6). D-149's
//      decodeOutput() accepts only RGBA. decodeOutputRgbOrRgba() accepts exactly 8-bit, non-interlaced RGB or
//      RGBA at 1024x1536 and expands RGB with alpha 255 — the same pixels an opaque RGBA file would carry.
//   2  COVERAGE. D-149's per-region coverage reads the OUTPUT ALPHA (>= 128 inside the geometry). With an
//      opaque output every pixel is "solid", so that gate can no longer see a head drawn too small: the gap
//      would be painted in the background colour instead of being transparent. backgroundLeakGate() restores
//      the protection by colour: it estimates the output's background from pixels that are empty in H1 and
//      far above the head, and refuses any head-geometry pixel within a just-noticeable difference of it —
//      unless the background itself is on the Northstar skin palette, where S1 already governs.
//
// Both are deterministic, read-only and fail closed. They are a PROPOSAL of D-152 (preparation only); a later
// owner decision that authorises a call decides whether they bind.
import { decodePng } from "./build-r2-torso-occlusion-mask.mjs";
import { OUT_W, OUT_H, SOLID_ALPHA } from "./build-r3-head-edit-masks.mjs";
import { HEAD_MAX_Y } from "./build-r3-head-geometry.mjs";
import { REGIONS, regionOf, toLab, deltaE00, SEAM } from "./build-r3-head-colour-fixtures.mjs";
import { ColourGateError } from "./process-r3-head-colour-output.mjs";

const N = OUT_W * OUT_H;

/** Accepts exactly 8-bit, non-interlaced RGB (type 2) or RGBA (type 6) at 1024x1536. RGB gets alpha 255. */
export function decodeOutputRgbOrRgba(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47 || buf.toString("ascii", 12, 16) !== "IHDR") throw new ColourGateError("format", "not a PNG");
  const bit = buf.readUInt8(24), ct = buf.readUInt8(25), il = buf.readUInt8(28);
  if (bit !== 8 || (ct !== 2 && ct !== 6) || il !== 0) throw new ColourGateError("format", `not 8-bit non-interlaced RGB or RGBA (bit depth ${bit}, colour type ${ct}, interlace ${il})`);
  const img = decodePng(buf, "output");
  if (img.w !== OUT_W || img.h !== OUT_H) throw new ColourGateError("format", `expected ${OUT_W}x${OUT_H}, got ${img.w}x${img.h}`);
  return { rgba: img.rgba, colourType: ct, alphaChannel: ct === 6 };
}

export const LEAK_RULE = Object.freeze({
  probeRows: Object.freeze([0, 119]),
  probe: "pixels of rows 0-119 that are fully transparent in H1 and outside API_EDIT (the head starts at row 158)",
  minOpaqueShare: 0.5,
  jndDE00: 2.3,
  offPaletteDE00: SEAM.S1.thresholdDE00,
  rule: "If at least half of the probe pixels are solid in the output, the output has an opaque background: its colour is the per-channel median of those pixels. If that colour is more than ΔE00 4.50 from the Northstar skin median, every head-geometry pixel (rows <= 424) within ΔE00 2.3 of it is a background leak; the gate requires 0 leaks in every region. Otherwise the gate does not apply: a transparent background keeps D-149's alpha coverage, and an on-palette background is governed by S1.",
});

const median = (a) => { const s = [...a].sort((p, q) => p - q); return s[s.length >> 1]; };

/** The colour-based coverage gate for an opaque output. Pure. Throws nothing; returns { pass, applicable, … }. */
export function backgroundLeakGate(srcRgba, { h1Rgba, geom, apiEdit }) {
  if (!srcRgba || srcRgba.length !== N * 4 || !h1Rgba || h1Rgba.length !== N * 4 || !geom || geom.length !== N || !apiEdit || apiEdit.length !== N) {
    return { pass: false, applicable: true, reason: "inputs do not match the canvas" };
  }
  const ch = [[], [], []]; let probe = 0;
  for (let y = LEAK_RULE.probeRows[0]; y <= LEAK_RULE.probeRows[1]; y++) for (let x = 0; x < OUT_W; x++) {
    const p = y * OUT_W + x;
    if (h1Rgba[p * 4 + 3] !== 0 || apiEdit[p]) continue;
    probe++;
    if (srcRgba[p * 4 + 3] >= SOLID_ALPHA) for (let k = 0; k < 3; k++) ch[k].push(srcRgba[p * 4 + k]);
  }
  if (probe === 0) return { pass: false, applicable: true, reason: "no probe pixels" };
  const opaqueShare = ch[0].length / probe;
  if (opaqueShare < LEAK_RULE.minOpaqueShare) return { pass: true, applicable: false, reason: "transparent background — D-149's alpha coverage applies", probe, opaqueShare };
  const bg = ch.map(median), bgLab = toLab(bg);
  const bgVsSkin = deltaE00(bgLab, toLab([...SEAM.S1.expectedNsMedianRGB]));
  if (bgVsSkin <= LEAK_RULE.offPaletteDE00) return { pass: true, applicable: false, reason: "the background is on the skin palette — S1 governs", probe, opaqueShare, background: bg, bgVsSkinDE00: +bgVsSkin.toFixed(2) };
  const leaks = Object.fromEntries(REGIONS.map((r) => [r, 0]));
  for (let p = 0; p < N; p++) {
    const y = (p / OUT_W) | 0;
    if (!geom[p] || y > HEAD_MAX_Y) continue;
    if (deltaE00(toLab([srcRgba[p * 4], srcRgba[p * 4 + 1], srcRgba[p * 4 + 2]]), bgLab) <= LEAK_RULE.jndDE00) leaks[regionOf(p % OUT_W, y)]++;
  }
  const total = Object.values(leaks).reduce((a, b) => a + b, 0);
  return { pass: total === 0, applicable: true, probe, opaqueShare, background: bg, bgVsSkinDE00: +bgVsSkin.toFixed(2), leaks, total };
}
