// ---------------------------------------------------------------------------------------------
// check-r2-hair-candidate — the acceptance gate for an option-A hair raster (D-102 §4A).
//
// DETERMINISTIC, NO AI, NO NETWORK, WRITES NOTHING. It reads one candidate PNG and reports
// whether that artwork can become an R2 hair layer. It does not produce, promote or register
// anything, and it takes no position on WHO or WHAT drew the candidate — that is a separate
// owner decision (see docs/167a-r2-hair-a-production-spec.md §2).
//
//   node tools/avatar/check-r2-hair-candidate.mjs <candidate.png> <style>
//
// The landmarks it measures against are the frozen ones from the D-102 measurement
// (tools/avatar/measure-r2-hair-fit.mjs), expressed in the shared 160x240 C2 canvas so the two
// tools are directly comparable. They are constants here rather than re-measured, so a candidate
// is always judged against the base that actually ships.
//
// WHY THESE GATES: each one exists because failing it breaks something specific and hard to see
// late — a coloured map silently disables hair colour (D-103), a gap at the crown shows scalp the
// base never had to render, ink below the neck collides with the torso garment (D-090), and a
// style that drifts outside its C2 envelope stops being the style the student picked.
// ---------------------------------------------------------------------------------------------

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { decodePng } from "./build-r2-torso-occlusion-mask.mjs";
import { RENDER_SIZES, MIN_SCALE_COVERAGE } from "./check-r2-torso-candidate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = join(HERE, "..", "..");

export const TOOL = "check-r2-hair-candidate";
export const TOOL_VERSION = "1.0.0";

// ── the authoring canvas, pinned to the torso pipeline (D-084/D-089) ──────────────────────────
export const SRC_W = 1024, SRC_H = 1536;      // candidate PNG
export const OUT_W = 512, OUT_H = 768;        // served asset after the /2 premultiplied box
export const K = 160 / SRC_W;                 // candidate px -> 160x240 C2 canvas unit (0.15625)

// ── frozen base landmarks, C2 canvas units (measure-r2-hair-fit, body-neutral-medium-v2) ─────
export const BASE = Object.freeze({
  crownY: 31.6,          // top of the bald skull
  skullLo: 50.6, skullHi: 110.3, skullW: 60.0, skullCx: 80.5,
  neckY: 81.6,           // where the head ends and the neck begins
  shoulderY: 83.8,       // the torso garment (D-090) starts here
  eyeLineY: 57.0,        // R2 eye line (D-080) — hair must not reach it
});

// ── per-style envelopes measured from the C2 assets' own path data (D-102 §3.3) ──────────────
// These are the shapes the student already recognises, so a candidate that leaves its envelope
// stops being the style they chose. Tolerance is generous on purpose: this gate catches a wrong
// silhouette, not an artistic difference.
export const STYLE_TARGETS = Object.freeze({
  short:    { xLo: 52, xHi: 108, lowestY: 56,  drapes: false },
  tousled:  { xLo: 50, xHi: 110, lowestY: 55,  drapes: false },
  curly:    { xLo: 44, xHi: 113, lowestY: 61,  drapes: false },
  long:     { xLo: 41, xHi: 119, lowestY: 146, drapes: true  },
  ponytail: { xLo: 52, xHi: 117, lowestY: 123, drapes: true  },
  buzz:     { xLo: 53, xHi: 107, lowestY: 47,  drapes: false },
  afro:     { xLo: 34, xHi: 126, lowestY: 61,  drapes: false },
});
export const STYLES = Object.freeze(Object.keys(STYLE_TARGETS));

export const X_TOLERANCE = 4;        // C2 units the envelope may exceed its target on each side
export const ALPHA_INK = 128;        // D-071 render-scale convention: alpha >= 128 is ink
export const MAX_MEAN_SAT = 0.02;    // the shipped hair measures 0.0000
export const MAX_PEAK_SAT = 0.10;    // isolated antialiasing artefacts only
export const MAX_SPECK_PX = 16;      // a component smaller than this is a speck, not a lock
export const HALO_TOLERANCE = 16;    // orphan soft pixels, same convention as the torso gate

const u = (v) => Math.round(v * 10) / 10;

// ── measurement ──────────────────────────────────────────────────────────────────────────────

// Everything the gates need, in ONE pass over the candidate. Pure: no IO, no globals.
export function analyse(rgba, w, h) {
  // Derived from the canvas in hand, not from SRC_W: the gates are expressed in C2 units, so a
  // smaller proportional canvas must measure to the same units (that is what makes them testable).
  const k = 160 / w;
  const inkAt = (x, y) => rgba[(y * w + x) * 4 + 3] >= ALPHA_INK;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let ink = 0, satSum = 0, satMax = 0, orphanSoft = 0;
  const topByCol = new Array(w).fill(Infinity);
  const botByCol = new Array(w).fill(-Infinity);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = rgba[i + 3];
      if (a === 0) continue;
      if (a < ALPHA_INK) {
        // soft pixel with no ink neighbour = halo left behind by a bad matte
        const near = (inkAt(Math.max(0, x - 1), y) || inkAt(Math.min(w - 1, x + 1), y) ||
                      inkAt(x, Math.max(0, y - 1)) || inkAt(x, Math.min(h - 1, y + 1)));
        if (!near) orphanSoft++;
        continue;
      }
      ink++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (y < topByCol[x]) topByCol[x] = y;
      if (y > botByCol[x]) botByCol[x] = y;
      const R = rgba[i], G = rgba[i + 1], B = rgba[i + 2];
      const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
      const sat = mx === 0 ? 0 : (mx - mn) / mx;
      satSum += sat;
      if (sat > satMax) satMax = sat;
    }
  }
  return {
    w, h, ink,
    envelope: ink ? { xLo: minX * k, xHi: maxX * k, yLo: minY * k, yHi: maxY * k } : null,
    meanSat: ink ? satSum / ink : 0,
    peakSat: satMax,
    orphanSoft,
    topByCol, botByCol, k,
    components: countComponents(rgba, w, h),
  };
}

// Connected components over ink, iterative flood fill (no recursion: 1024x1536 overflows a stack).
function countComponents(rgba, w, h) {
  const seen = new Uint8Array(w * h);
  const sizes = [];
  const stack = [];
  for (let s = 0; s < w * h; s++) {
    if (seen[s] || rgba[s * 4 + 3] < ALPHA_INK) continue;
    let size = 0;
    stack.push(s);
    seen[s] = 1;
    while (stack.length) {
      const p = stack.pop();
      size++;
      const px = p % w, py = (p / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = px + dx, ny = py + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (seen[q] || rgba[q * 4 + 3] < ALPHA_INK) continue;
        seen[q] = 1;
        stack.push(q);
      }
    }
    sizes.push(size);
  }
  sizes.sort((a, b) => b - a);
  return { count: sizes.length, largest: sizes[0] || 0, specks: sizes.filter((n) => n < MAX_SPECK_PX).length };
}

// Coverage of the skull cap at each D-071 render size: nearest-neighbour downscale of the ink
// mask, measured against its own footprint — the same shape as the torso legibility gate.
function legibility(rgba, w, h) {
  const scales = [];
  for (const [sw, sh] of RENDER_SIZES) {
    let drawn = 0, total = 0;
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const sx = Math.min(w - 1, Math.floor((x + 0.5) * w / sw));
        const sy = Math.min(h - 1, Math.floor((y + 0.5) * h / sh));
        total++;
        if (rgba[(sy * w + sx) * 4 + 3] >= ALPHA_INK) drawn++;
      }
    }
    scales.push({ size: `${sw}x${sh}`, coverage: drawn / Math.max(1, total) });
  }
  const ref = scales[0].coverage || 1;
  return scales.map((s) => ({ ...s, ratio: s.coverage / ref }));
}

// ── the gates ────────────────────────────────────────────────────────────────────────────────

export function gates(a, style) {
  const t = STYLE_TARGETS[style];
  if (!t) throw new Error(`unknown style '${style}' — expected one of ${STYLES.join(", ")}`);
  const out = [];
  const add = (id, pass, detail) => out.push({ id, pass, detail });

  add("dimensions", a.w === SRC_W && a.h === SRC_H,
    { got: `${a.w}x${a.h}`, expect: `${SRC_W}x${SRC_H}` });

  add("has-ink", a.ink > 0, { inkPx: a.ink });
  if (!a.envelope) return out; // nothing else is measurable on an empty candidate

  // The one that silently breaks hair colour: the runtime multiplies this map over the token,
  // so any colour baked into the asset fights the student's choice instead of carrying it.
  add("luminance-map", a.meanSat <= MAX_MEAN_SAT && a.peakSat <= MAX_PEAK_SAT,
    { meanSat: +a.meanSat.toFixed(4), peakSat: +a.peakSat.toFixed(4),
      maxMean: MAX_MEAN_SAT, maxPeak: MAX_PEAK_SAT });

  // Hair has to sit ON the skull, not float above it or start below the crown.
  const crownCols = [];
  for (let x = 0; x < a.w; x++) {
    const cx = x * a.k;
    if (cx < BASE.skullLo || cx > BASE.skullHi) continue;
    if (a.topByCol[x] === Infinity) continue;
    crownCols.push(a.topByCol[x] * a.k);
  }
  const highest = crownCols.length ? Math.min(...crownCols) : Infinity;
  add("covers-the-crown", crownCols.length > 0 && highest <= BASE.crownY,
    { highestInk: u(highest), baseCrown: BASE.crownY,
      note: "hair must reach at least the top of the bald skull, or scalp shows" });

  // ...and must not reach the eyes.
  let lowestForehead = -Infinity;
  for (let x = 0; x < a.w; x++) {
    const cx = x * a.k;
    if (cx < 65 || cx > 95) continue;
    if (a.botByCol[x] === -Infinity) continue;
    const yv = a.topByCol[x] * a.k;
    if (yv > lowestForehead) lowestForehead = yv;
  }
  add("clears-the-eye-line", lowestForehead < BASE.eyeLineY,
    { lowestForeheadInk: u(lowestForehead), eyeLine: BASE.eyeLineY });

  // Ink below the neck collides with the torso garment unless the style is declared to drape.
  const lowest = a.envelope.yHi;
  add("respects-the-neck", t.drapes ? lowest <= t.lowestY + 2 : lowest <= BASE.neckY,
    { lowestInk: u(lowest), limit: t.drapes ? t.lowestY + 2 : BASE.neckY, drapes: t.drapes });

  // The silhouette the student recognises.
  add("within-style-envelope",
    a.envelope.xLo >= t.xLo - X_TOLERANCE && a.envelope.xHi <= t.xHi + X_TOLERANCE,
    { got: `${u(a.envelope.xLo)}..${u(a.envelope.xHi)}`,
      target: `${t.xLo}..${t.xHi}`, tolerance: X_TOLERANCE });

  add("centred-on-the-skull", Math.abs((a.envelope.xLo + a.envelope.xHi) / 2 - BASE.skullCx) <= 2,
    { centre: u((a.envelope.xLo + a.envelope.xHi) / 2), baseCentre: BASE.skullCx });

  add("no-floating-islands", a.components.count === 1 || a.components.specks === 0,
    { components: a.components.count, largest: a.components.largest, specks: a.components.specks });

  add("alpha-clean-no-halo", a.orphanSoft <= HALO_TOLERANCE,
    { orphanSoft: a.orphanSoft, tolerance: HALO_TOLERANCE });

  return out;
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────

export function run(candidatePath, style) {
  const log = [];
  const say = (s) => { log.push(s); console.log(s); };
  say(`${TOOL} v${TOOL_VERSION} — READ-ONLY, writes nothing`);

  const abs = resolve(candidatePath);
  if (!existsSync(abs)) throw new Error(`candidate not found: ${abs}`);
  const png = decodePng(readFileSync(abs), "candidate");
  const a = analyse(png.rgba, png.w, png.h);
  const result = gates(a, style);

  say(`  candidate ${candidatePath} · ${png.w}x${png.h} · style '${style}'`);
  say(`  ink ${a.ink} px · envelope ${a.envelope ? `x ${u(a.envelope.xLo)}..${u(a.envelope.xHi)} y ${u(a.envelope.yLo)}..${u(a.envelope.yHi)}` : "(none)"}`);
  for (const g of result) say(`  ${g.pass ? "✓" : "✖"} ${g.id} ${JSON.stringify(g.detail)}`);

  const legible = legibility(png.rgba, png.w, png.h);
  const smallest = legible[legible.length - 1];
  const legiblePass = smallest.ratio >= MIN_SCALE_COVERAGE;
  say(`  ${legiblePass ? "✓" : "✖"} legible-at-render-sizes ${JSON.stringify(legible.map((s) => ({ size: s.size, ratio: +s.ratio.toFixed(3) })))}`);

  const pass = result.every((g) => g.pass) && legiblePass;
  say(`\n${pass ? "✓ CANDIDATE PASSES the measurable gates" : "✖ CANDIDATE FAILS"} — this is a PRECONDITION, not an approval.`);
  say("  Owner visual sign-off at real render scale (D-059) is still required, and this tool");
  say("  promotes nothing: registration is a separate, separately authorised step.");
  return { pass, gates: result, legible, analysis: a };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [, , file, style] = process.argv;
  if (!file || !style) {
    console.error(`usage: node tools/avatar/check-r2-hair-candidate.mjs <candidate.png> <${STYLES.join("|")}>`);
    process.exit(2);
  }
  const r = run(file, style);
  process.exit(r.pass ? 0 : 1);
}
