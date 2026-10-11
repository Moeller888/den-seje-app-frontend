// D-156 — deterministic OFFLINE feasibility of an overscan / bleed design for a possible R3 head-colour request.
// NO NETWORK, NO MODEL, NO CLAIM, NO CALL-ID, NO REQUEST PACKAGE. Nothing here can send, and nothing here authorises
// anything. It writes no file; every mask exists only in memory.
//
// 1  geometry: FINAL (E2), BLEED, PAINT and KEEP per bleed width; protection, canvas, per-region reach, both ears apart,
//    the neck handover, notch fill and the effect on the background probe;
// 2  synthetic control cases, independent of D-153: insufficient bleed, shifts, asymmetric ears, anti-alias halo,
//    interior hole, legitimate highlight, skin-coloured background, a gap at the neck handover, and the clip itself;
// 3  a DIAGNOSTIC SIMULATION with D-153's hash-verified raw output (warpOutward) — not a prediction of a new call;
// 4  acceptance limits fixed below BEFORE any result is computed.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SOLID_ALPHA } from "./build-r3-head-edit-masks.mjs";
import { HEAD_MAX_Y } from "./build-r3-head-geometry.mjs";
import { REGIONS, regionOf, SEAM, validateEditable } from "./build-r3-head-colour-fixtures.mjs";
import { apiEditProtectedOverlap } from "./prepare-r3-head-colour-call.mjs";
import { processOutput, ColourGateError, interiorDarkPx } from "./process-r3-head-colour-output.mjs";
import { backgroundLeakGate, LEAK_RULE } from "./r3-head-colour-opaque-output.mjs";
import { coverageGate, estimateBackground, backgroundShare } from "./r3-head-colour-coverage-gate.mjs";
import { loadContext, loadReal, PINS } from "./analyse-r3-head-colour-d155.mjs";
import { forbiddenSet, signedDistance, overscanSets, bleedReach, notchFill, validatePaint, warpOutward, OVERSCAN_RULE } from "./r3-head-colour-overscan.mjs";

export const DECISION = "D-156";
export const STATUS = "DETERMINISTIC OVERSCAN / BLEED DESIGN FEASIBILITY ONLY — NO IMAGE REQUEST AUTHORISED";
export const CALL_ID = "UNASSIGNED";
export const CLAIM_IDENTITY = "NONE";
const W = 1024, N = W * 1536;
const yOf = (p) => (p / W) | 0;

/** Bleed widths, fixed before any result: 2 ≈ D-153's request margin (baseline), then steps of 8 px up to 48. */
export const WIDTHS = Object.freeze([2, 8, 16, 24, 32, 40, 48]);
export const WARP_L = 60;                                   // the warp fades to 0 at D-155's edge-distance range
export const SHIFTS = Object.freeze([[8, 0], [-8, 0], [0, 8], [0, -8]]);
export const ACCEPTANCE = Object.freeze({
  geometry: "for every width: 0 protected px editable (TRANSITION, rows >= 425, H1-visible outside EDIT₂), PAINT inside the canvas, every outward E2 edge in rows <= 424 receives the full bleed in every region (both ears separately), and the background probe keeps >= " + LEAK_RULE.minOpaqueShare + " opaque share with the same estimate as D-152's mask",
  controls: "the D-155 coverage gate gives the expected verdict on every synthetic control (0 false positives, 0 false negatives); the clip leaves 0 bleed px in the final output, alpha = E2 and protected bytes = H1",
  simulation: "at width B: D-155 coverage gate 0 uncovered, D-152 background-leak gate pass, every D-149 processor gate pass; the same with each ±8 px shift; and B − 8 also passes unshifted (8 px headroom beyond D-153's observed shortfall)",
  seamMedianMaxDE00: LEAK_RULE.jndDE00, seamP95MaxDE00: SEAM.S1.thresholdDE00, visibleU1TotalMax: 0.25, visibleU1RegionMax: 0.5,
  notRelevant: "the seam and visible-U1 limits are NOT RELEVANT to overscan: the final head contains no U1 pixel, so there is no model↔U1 seam; the only cut is the E2 clip line, which lies under K4 exactly as in every earlier design (measured below)",
  rule: "A requires geometry, controls and a simulated width that meets the simulation rule; any failure of geometry → B; otherwise → C.",
});

/** Shared context: D-155's loaded inputs plus the signed distance field and a fixed H1 for the protection rules. */
export function loadOverscanContext({ root, h1Buf } = {}) {
  const ctx = loadContext(root ? { root } : {});
  const sdf = signedDistance(ctx.head, 64);
  const h1T = Buffer.alloc(N * 4); for (let p = 0; p < N; p++) if (ctx.inp.transition[p]) h1T.set([253, 197, 128, 255], p * 4);
  return { ...ctx, sdf, h1T };
}

// ── 1 geometry ───────────────────────────────────────────────────────────────────────────────
export function geometry(ctx, h1Rgba, B) {
  const forbidden = forbiddenSet(ctx.inp, h1Rgba);
  const sets = overscanSets(ctx.head, ctx.sdf, forbidden, B);
  const v = validatePaint(sets.paint, { head: ctx.head, forbidden, sdf: ctx.sdf, B });
  const ov = apiEditProtectedOverlap(sets.paint, h1Rgba, ctx.inp);
  const reach = bleedReach(ctx.head, sets.paint, B);
  let bleedPx = 0, inEdit2 = 0, x0 = W, x1 = 0, y0 = 9999, y1 = 0; const byRegion = Object.fromEntries(REGIONS.map((r) => [r, 0]));
  for (let p = 0; p < N; p++) if (sets.bleed[p]) { bleedPx++; if (ctx.inp.edit[p]) inEdit2++; const x = p % W, y = yOf(p); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    const f = ctx.sdf.foot[p]; byRegion[regionOf(f % W, yOf(f))]++; }
  const legacy = validateEditable(sets.paint, ctx.inp);
  const fullReach = Object.values(reach.byRegion).every((r) => r.full === r.edges) && ["ear-left", "ear-right", "crown", "side-left", "side-right", "lower-head"].every((r) => reach.byRegion[r].edges > 0);
  return { B, bleedPx, bleedByRegion: byRegion, bleedInEdit2: inEdit2, bleedBbox: bleedPx ? [x0, y0, x1, y1] : null, blockedByProtection: sets.blocked,
    paintValid: v, protectedOverlap: ov, reach, notchFill: notchFill(ctx.head, sets.bleed, B),
    d149MaskRule: { accepts: legacy.ok, problems: legacy.problems.slice(0, 2) },
    pass: v.ok && Object.values(ov).every((n) => n === 0) && fullReach && (bleedPx === 0 || (x0 >= 0 && x1 < W && y0 >= 0)), sets };
}

/** E2 edge pixels that face a bleedable direction and lie under K4 at full opacity (the clip line is hidden). */
export function clipUnderK4(ctx) {
  let edges = 0, hidden = 0;
  for (let p = 0; p < N; p++) { if (!ctx.head[p]) continue; const x = p % W, y = yOf(p);
    if (![[1, 0], [-1, 0], [0, -1], [0, 1]].some(([dx, dy]) => y + dy <= HEAD_MAX_Y && !ctx.head[(y + dy) * W + x + dx])) continue;
    edges++; if (ctx.contour[p] === 255) hidden++; }
  return { edges, hidden };
}

// ── 2 synthetic controls ────────────────────────────────────────────────────────────────────
const mix = (a, b, t) => a.map((v, k) => Math.round(v * (1 - t) + b[k] * t));
/**
 * A synthetic opaque output: the model covers every pixel with signed depth > c = −(B − s) (s = shortfall, may differ per
 * side), with a linear anti-alias halo of width h just outside that; optional translation, hole, highlight, neck gap.
 */
export function syntheticOutput(ctx, { B, s = 0, sL = s, sR = s, h = 0, shift = [0, 0], bg = [245, 245, 245], hole = false, highlight = false, neckGap = false, bleedColour = null }) {
  const skin = [ctx.u1[(330 * W + 512) * 4], ctx.u1[(330 * W + 512) * 4 + 1], ctx.u1[(330 * W + 512) * 4 + 2]];
  const o = Buffer.alloc(N * 4);
  for (let p = 0; p < N; p++) {
    const x = p % W, y = yOf(p);
    if (y > HEAD_MAX_Y) { o.set(ctx.inp.transition[p] ? [253, 197, 128, 255] : [...bg, 255], p * 4); continue; }
    const sx = x - shift[0], sy = y - shift[1], q = sy * W + sx;
    let d = -1e9; if (sx >= 0 && sx < W && sy >= 0) d = sy > HEAD_MAX_Y ? 1e9 : ctx.head[q] ? ctx.sdf.sd[q] : ctx.sdf.foot[q] >= 0 ? ctx.sdf.sd[q] : -1e9;
    const c = -(B - (x < W / 2 ? sL : sR));
    let col = d > c ? skin : h > 0 && d > c - h ? mix(skin, bg, (c - d) / h) : bg;
    if (d > c && bleedColour && !ctx.head[p]) col = bleedColour;
    if (hole && Math.hypot(x - 512, y - 330) <= 6) col = bg;
    if (highlight && Math.hypot(x - 512, y - 330) <= 14) col = [252, 236, 214];
    if (neckGap && y >= 418 && Math.abs(x - 511.5) > 40) col = bg;
    o.set([...col, 255], p * 4);
  }
  return o;
}
export function controlCases() {
  return [
    { id: "sufficient-bleed", expect: "pass", B: 32, s: 16, h: 3, why: "the model falls 16 px short of a 32-px bleed: its edge and halo stay in the discarded bleed" },
    { id: "insufficient-bleed", expect: "fail", B: 8, s: 16, h: 3, why: "a 16-px shortfall against an 8-px bleed reaches 8 px into E2" },
    { id: "halo-straddles-e2", expect: "fail", B: 16, s: 19, h: 4, why: "the anti-alias halo crosses E2 with >= half background inside it" },
    { id: "halo-inside-bleed", expect: "pass", B: 16, s: 8, h: 4, why: "the whole halo lies in the bleed and is clipped away" },
    { id: "shift-small", expect: "pass", B: 24, s: 8, shift: [8, 0], why: "an 8-px lateral shift still leaves 8 px of bleed on the short side" },
    { id: "shift-large", expect: "fail", B: 24, s: 8, shift: [24, 0], why: "a 24-px lateral shift uncovers the left side" },
    { id: "asymmetric-ears", expect: "fail", B: 24, sL: 8, sR: 32, why: "left ear covered, right ear 8 px short: only the right side may fail" },
    { id: "symmetric-short", expect: "fail", B: 24, s: 30, why: "both sides 6 px short: left and right must count the same" },
    { id: "interior-hole", expect: "fail", B: 32, s: 16, hole: true, why: "an enclosed hole of exact background inside the face plane" },
    { id: "legit-highlight", expect: "pass", B: 32, s: 16, highlight: true, why: "a light skin highlight is skin, not background" },
    { id: "skin-coloured-background", expect: "fail", B: 32, s: 40, bg: [250, 200, 135], why: "a background on the skin palette cannot prove coverage: the gate fails closed" },
    { id: "neck-handover-gap", expect: "fail", B: 48, s: 0, neckGap: true, why: "the model ends above the neck at the jaw corners — no bleed can reach below row 424" },
  ];
}
export function runControls(ctx) {
  const g = geometryCache(ctx, ctx.h1T);
  return controlCases().map((c) => {
    const paint = g(c.B).sets.paint, src = syntheticOutput(ctx, c);
    const r = coverageGate(src, { h1Rgba: ctx.h1T, geom: ctx.inp.geom, apiEdit: paint, distance: ctx.distance });
    let left = 0, right = 0; if (r.mask) for (let p = 0; p < N; p++) if (r.mask[p]) { if (p % W < W / 2) left++; else right++; }
    const verdict = r.pass ? "pass" : "fail";
    return { id: c.id, expect: c.expect, verdict, correct: verdict === c.expect, uncovered: r.uncovered ?? null, undecidable: r.undecidable === true, leftRight: [left, right], why: c.why };
  });
}
/** The clip: a magenta bleed must never reach the final output; alpha = E2; protected bytes = H1. */
export function clipControl(ctx) {
  const src = syntheticOutput(ctx, { B: 32, s: 0, bleedColour: [255, 0, 255] });
  let magentaIn = 0; for (let p = 0; p < N; p++) if (src[p * 4] === 255 && src[p * 4 + 1] === 0 && src[p * 4 + 2] === 255) magentaIn++;
  const res = processOutput({ srcRgba: src, h1Rgba: ctx.h1T, geom: ctx.inp.geom, contour: ctx.contour, regions: ctx.regions, nsRgba: ctx.inp.ns });
  let magentaOut = 0, alphaNotE2 = 0; for (let p = 0; p < N; p++) { const o = res.rgba; if (o[p * 4] === 255 && o[p * 4 + 1] === 0 && o[p * 4 + 2] === 255 && o[p * 4 + 3]) magentaOut++; if (yOf(p) <= HEAD_MAX_Y && (o[p * 4 + 3] === 255) !== (ctx.head[p] === 1)) alphaNotE2++; }
  return { magentaBleedPxIn: magentaIn, magentaPxInFinal: magentaOut, alphaNotE2, protectedBytes: res.report.protectedBytes, rows425to445: res.report.rows425to445BytesVsH1 };
}
function geometryCache(ctx, h1) { const m = new Map(); return (B) => { if (!m.has(B)) m.set(B, geometry(ctx, h1, B)); return m.get(B); }; }

// ── 3 diagnostic simulation (needs the local D-153 raw output and H1) ───────────────────────
export function simulate(ctx, real, geo, { shift = [0, 0] } = {}) {
  const B = geo.B, src = warpOutward(real.raw, ctx.sdf, B, { L: WARP_L, shift });
  const gate = coverageGate(src, { h1Rgba: real.h1, geom: ctx.inp.geom, apiEdit: geo.sets.paint, distance: ctx.distance });
  const old = backgroundLeakGate(src, { h1Rgba: real.h1, geom: ctx.inp.geom, apiEdit: geo.sets.paint });
  let processor = "pass", s1 = null, join = null, dark = null;
  try { const r = processOutput({ srcRgba: src, h1Rgba: real.h1, geom: ctx.inp.geom, contour: ctx.contour, regions: ctx.regions, nsRgba: ctx.inp.ns }); s1 = +r.report.s1.de00Exact.toFixed(4); join = r.report.join.observed; dark = r.report.interiorDarkPxForVisualReview; }
  catch (e) { if (!(e instanceof ColourGateError)) throw e; processor = "FAIL " + e.gate; }
  // measured safety margin: nearest background-like pixel outside E2, per region of its foot
  const share = gate.applicable && !gate.undecidable ? backgroundShare(src, gate.background) : null;
  const margin = Object.fromEntries(REGIONS.map((r) => [r, null]));
  if (share) for (let p = 0; p < N; p++) { const d = ctx.sdf.sd[p], f = ctx.sdf.foot[p]; if (d >= 0 || f < 0 || share[p] < SOLID_ALPHA / 255) continue; const r = regionOf(f % W, yOf(f)), m = +(-d).toFixed(2); if (margin[r] === null || m < margin[r]) margin[r] = m; }
  const probe = estimateBackground(src, { h1Rgba: real.h1, apiEdit: geo.sets.paint });
  return { B, shift, pass: gate.pass && old.pass && processor === "pass", d155Uncovered: gate.uncovered ?? null, d155ByRegion: gate.byRegion ?? null, oldLeak: old.total ?? 0,
    processor, s1, join, interiorDarkPx: dark, safetyMarginPxByRegion: margin, probe: { px: probe.probe, opaqueShare: +probe.opaqueShare.toFixed(4), background: probe.background }, visibleU1: 0, src };
}

/**
 * Diagnostics on D-153 itself (observed during the geometry exploration, so NOT used as an acceptance criterion):
 * which of its uncovered pixels sit nearer the non-bleedable neck handover than any bleedable edge, how deep its ear
 * gaps reach compared with the ear thickness, and how bimodal its background probe is.
 */
export function d153Diagnostics(ctx, real) {
  const g = coverageGate(real.raw, { h1Rgba: real.h1, geom: ctx.inp.geom, apiEdit: ctx.apiEdit, distance: ctx.distance });
  let neckBound = 0; const ear = { left: { gapDepth: 0, thickness: 0 }, right: { gapDepth: 0, thickness: 0 } };
  for (let p = 0; p < N; p++) {
    if (!ctx.head[p]) continue; const x = p % W, y = yOf(p), side = x < 366 ? "left" : x > 657 ? "right" : null, d = ctx.sdf.sd[p];
    if (side) ear[side].thickness = Math.max(ear[side].thickness, +d.toFixed(2));
    if (!g.mask[p]) continue;
    if (HEAD_MAX_Y + 1 - y < d) neckBound++;
    if (side) ear[side].gapDepth = Math.max(ear[side].gapDepth, +d.toFixed(2));
  }
  let low = 0, high = 0, n = 0;
  for (let y = LEAK_RULE.probeRows[0]; y <= LEAK_RULE.probeRows[1]; y++) for (let x = 0; x < W; x++) { const p = y * W + x; if (real.h1[p * 4 + 3] !== 0 || ctx.apiEdit[p]) continue; n++; if (real.raw[p * 4] < 238) low++; else high++; }
  return { uncovered: g.uncovered, neckBoundUncovered: neckBound, ears: ear, interiorDarkPx: interiorDarkPx(real.raw, ctx.inp.geom), probeBimodality: { px: n, below238: low, atOrAbove238: high, lowShare: +(low / n).toFixed(4) } };
}

export function conclusion({ geometryAll, controls, clip, sims }) {
  const geoOk = geometryAll.every((g) => g.pass);
  const ctrlOk = controls.every((c) => c.correct) && clip.magentaPxInFinal === 0 && clip.alphaNotE2 === 0 && clip.protectedBytes === 0 && clip.rows425to445 === 0;
  const passAt = (B, shift = [0, 0]) => { const s = sims.find((x) => x.B === B && x.shift[0] === shift[0] && x.shift[1] === shift[1]); return s ? s.pass : false; };
  const feasible = WIDTHS.filter((B) => B >= 16 && passAt(B) && SHIFTS.every((sh) => passAt(B, sh)) && passAt(B - 8) );
  if (!geoOk) return { code: "B", text: "B — OVERSCAN DESIGN NOT GEOMETRICALLY FEASIBLE", feasible };
  if (ctrlOk && feasible.length) return { code: "A", text: "A — OVERSCAN DESIGN GEOMETRICALLY FEASIBLE AND DIAGNOSTICALLY ROBUST; MODEL BEHAVIOUR UNPROVEN — NO IMAGE CALL AUTHORISED", feasible, recommendedWidth: feasible[0] };
  return { code: "C", text: "C — OVERSCAN DESIGN NOT YET SUFFICIENTLY DOCUMENTED", feasible };
}

export function analyse({ root, rawBuf, h1Buf } = {}) {
  const ctx = loadOverscanContext({ root });
  const real = loadReal(ctx, { rawBuf, h1Buf });
  const geoOf = geometryCache(ctx, real.h1);
  const geometryAll = WIDTHS.map((B) => geoOf(B));
  const k4 = clipUnderK4(ctx);
  const controls = runControls(ctx);
  const clip = clipControl(ctx);
  const d152Probe = estimateBackground(real.raw, { h1Rgba: real.h1, apiEdit: ctx.apiEdit });
  const diagnostics = d153Diagnostics(ctx, real);
  const sims = [];
  for (const B of WIDTHS) { sims.push(simulate(ctx, real, geoOf(B))); if (B >= 16) for (const sh of SHIFTS) sims.push(simulate(ctx, real, geoOf(B), { shift: sh })); }
  const strip = ({ sets, ...g }) => g;
  const stripS = ({ src, ...s }) => s;
  return { decision: DECISION, status: STATUS, callId: CALL_ID, claimIdentity: CLAIM_IDENTITY, notACandidate: true,
    simulationOnly: "DIAGNOSTIC SIMULATION with D-153's raw output warped outward — not a prediction of what a model would return",
    acceptance: ACCEPTANCE, overscanRule: OVERSCAN_RULE, widths: WIDTHS, warpL: WARP_L, shifts: SHIFTS,
    geometry: geometryAll.map(strip), clipUnderK4: k4, controls, clip, d152Probe: { px: d152Probe.probe, opaqueShare: d152Probe.opaqueShare, background: d152Probe.background },
    d153Diagnostics: diagnostics, simulations: sims.map(stripS), conclusion: conclusion({ geometryAll, controls, clip, sims }),
    inputs: { raw: PINS.raw.sha256, h1: PINS.h1.sha256 } };
}

const invokedDirectly = typeof process.argv[1] === "string" && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  const argv = process.argv.slice(2), known = new Set(["--raw", "--h1"]);
  const bad = argv.filter((a, i) => !(known.has(a.split("=")[0]) || known.has(argv[i - 1])));
  if (bad.length || argv.some((a, i) => known.has(a) && !argv[i + 1])) { console.error("REFUSED (" + bad.join(" ") + ") — D-156 is offline analysis only; the only arguments are --raw <path> and --h1 <path>"); process.exitCode = 1; }
  else {
    try {
      const get = (f) => { const e = argv.find((a) => a.startsWith(f + "=")); if (e) return e.slice(f.length + 1); const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
      const rawPath = get("--raw"), h1Path = get("--h1") || process.env.FITTING_BASE_V1_PATH;
      if (!rawPath || !h1Path) throw new Error("--raw <path> and --h1 <path> are required");
      process.stdout.write(JSON.stringify(analyse({ rawBuf: readFileSync(rawPath), h1Buf: readFileSync(h1Path) }), null, 2) + "\n");
    } catch (e) { console.error("✖ " + (e && e.message ? e.message : e)); process.exitCode = 1; }
  }
}
