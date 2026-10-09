// D-155 — a colour-based COVERAGE gate for an opaque head-colour output, and the alternatives it was compared with.
// NO NETWORK, NO MODEL, NO CLAIM. Analysis and preparation only.
//
// D-153 showed that D-152's backgroundLeakGate() (ΔE00 <= 2.3 to the output's background) misses the anti-aliased
// rim where the model's head fades into its background. This module expresses coverage the way the repository already
// expresses it for alpha: a pixel is COVERED when at least 128/255 of it is head (SOLID_ALPHA). For an opaque output the
// coverage is estimated from colour: the pixel is projected, in linear RGB, onto the segment from the pinned skin
// reference (S1's Northstar median) to the measured background; the projection parameter is its background share.
// Every constant is an existing contract value, none is fitted to D-153:
//   · the background estimate and the core rule are D-152's LEAK_RULE, unchanged;
//   · the half-coverage limit is SOLID_ALPHA (128/255);
//   · the skin reference is SEAM.S1.expectedNsMedianRGB;
//   · the "background on the skin palette" limit is S1's 4.50.
// A background-like pixel inside the head is UNCOVERED only when it is connected (8-neighbourhood, through
// background-like pixels) to background-like pixels outside the head — so an isolated light highlight is not a leak,
// while a rim that opens onto the background is. The core rule stays unconditional, so an enclosed hole of exact
// background is still caught. If the background lies on the skin palette, colour cannot prove coverage and the gate
// FAILS CLOSED.
import { OUT_W, OUT_H, SOLID_ALPHA } from "./build-r3-head-edit-masks.mjs";
import { HEAD_MAX_Y } from "./build-r3-head-geometry.mjs";
import { REGIONS, regionOf, toLab, deltaE00, SEAM } from "./build-r3-head-colour-fixtures.mjs";
import { LEAK_RULE } from "./r3-head-colour-opaque-output.mjs";

const N = OUT_W * OUT_H;
export const COVERAGE_RULE = Object.freeze({
  name: "d155-colour-coverage",
  core: "D-152 LEAK_RULE unchanged: head-geometry pixel within ΔE00 " + LEAK_RULE.jndDE00 + " of the measured background",
  halfCoverage: SOLID_ALPHA / 255,
  skinReference: Object.freeze([...SEAM.S1.expectedNsMedianRGB]),
  backgroundOnPaletteDE00: SEAM.S1.thresholdDE00,
  connectivity: "8-neighbourhood, through background-like pixels, seeded by background-like pixels outside the head (rows <= 424)",
  failClosed: "an opaque background within ΔE00 4.50 of the skin reference makes coverage undecidable by colour: the gate fails",
});

const lin = (c) => { c /= 255; return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92; };
const median = (a) => { const s = [...a].sort((p, q) => p - q); return s[s.length >> 1]; };
const yOf = (p) => (p / OUT_W) | 0;

/** The background estimate of D-152's LEAK_RULE, unchanged. */
export function estimateBackground(src, { h1Rgba, apiEdit }) {
  const ch = [[], [], []]; let probe = 0;
  for (let y = LEAK_RULE.probeRows[0]; y <= LEAK_RULE.probeRows[1]; y++) for (let x = 0; x < OUT_W; x++) {
    const p = y * OUT_W + x; if (h1Rgba[p * 4 + 3] !== 0 || apiEdit[p]) continue; probe++;
    if (src[p * 4 + 3] >= SOLID_ALPHA) for (let k = 0; k < 3; k++) ch[k].push(src[p * 4 + k]);
  }
  return { background: probe && ch[0].length ? ch.map(median) : null, probe, opaqueShare: probe ? ch[0].length / probe : 0 };
}

/** Background share of every pixel: projection in linear RGB onto skin→background. */
export function backgroundShare(src, background, skin = COVERAGE_RULE.skinReference) {
  const s = skin.map(lin), b = background.map(lin), d = [b[0] - s[0], b[1] - s[1], b[2] - s[2]], dd = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  const a = new Float32Array(N);
  for (let p = 0; p < N; p++) { let t = 0; for (let k = 0; k < 3; k++) t += (lin(src[p * 4 + k]) - s[k]) * d[k]; a[p] = dd > 0 ? t / dd : 0; }
  return a;
}

/** The four candidate detectors D-155 compared. Each returns a Uint8Array mask over the head geometry. */
export function detectors(src, { geom, background, share, distance }) {
  const head = (p) => geom[p] === 1 && yOf(p) <= HEAD_MAX_Y;
  const bgLab = toLab(background);
  const de = new Float32Array(N).fill(Infinity);
  for (let p = 0; p < N; p++) if (head(p) || yOf(p) <= HEAD_MAX_Y) de[p] = deltaE00(toLab([src[p * 4], src[p * 4 + 1], src[p * 4 + 2]]), bgLab);
  const core = new Uint8Array(N); for (let p = 0; p < N; p++) if (head(p) && de[p] <= LEAK_RULE.jndDE00) core[p] = 1;
  // M1 — a higher fixed ΔE00 limit (5, the upper edge of the band D-154 reported)
  const m1 = new Uint8Array(N); for (let p = 0; p < N; p++) if (head(p) && de[p] <= 5) m1[p] = 1;
  // M2 — two tiers: the core, plus ΔE00 <= 5 within 2 px of a core pixel
  const m2 = new Uint8Array(core);
  for (let p = 0; p < N; p++) { if (!head(p) || core[p] || de[p] > 5) continue; const x = p % OUT_W;
    let near = false; for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) { const q = p + dy * OUT_W + dx; if (q >= 0 && q < N && Math.abs((q % OUT_W) - x) <= 2 && core[q]) { near = true; break; } }
    if (near) m2[p] = 1; }
  // M3 — connectivity: background-like (share >= 1/2) head pixels connected to background-like pixels outside the head
  const half = COVERAGE_RULE.halfCoverage, bgLike = (p) => share[p] >= half;
  const m3 = new Uint8Array(core), seen = new Uint8Array(N), stack = [];
  for (let p = 0; p < (HEAD_MAX_Y + 1) * OUT_W; p++) if (!geom[p] && bgLike(p)) { seen[p] = 1; stack.push(p); }
  while (stack.length) {
    const p = stack.pop(), x = p % OUT_W;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue; const xx = x + dx, q = p + dy * OUT_W + dx;
      if (xx < 0 || xx >= OUT_W || q < 0 || yOf(q) > HEAD_MAX_Y || seen[q] || !(bgLike(q) || core[q])) continue;
      seen[q] = 1; stack.push(q); if (head(q)) m3[q] = 1;
    }
  }
  // M4 — M3 restricted to the outer band where a rim can exist (distance to the E2 edge <= 32 px)
  const m4 = new Uint8Array(core); for (let p = 0; p < N; p++) if (m3[p] && distance[p] <= 32) m4[p] = 1;
  return { core, m1, m2, m3, m4, de };
}

/** The D-155 gate (M3). Fails closed when coverage cannot be decided by colour. */
export function coverageGate(src, { h1Rgba, geom, apiEdit, distance }) {
  const bgEst = estimateBackground(src, { h1Rgba, apiEdit });
  if (bgEst.opaqueShare < LEAK_RULE.minOpaqueShare) return { pass: true, applicable: false, reason: "transparent background — the alpha coverage of the D-149 processor applies", ...bgEst };
  const bgVsSkin = deltaE00(toLab(bgEst.background), toLab(COVERAGE_RULE.skinReference));
  if (bgVsSkin <= COVERAGE_RULE.backgroundOnPaletteDE00) return { pass: false, applicable: true, undecidable: true, reason: "the background lies on the skin palette — coverage cannot be proven by colour", ...bgEst, bgVsSkinDE00: +bgVsSkin.toFixed(2) };
  const share = backgroundShare(src, bgEst.background);
  const det = detectors(src, { geom, background: bgEst.background, share, distance });
  const byRegion = Object.fromEntries(REGIONS.map((r) => [r, 0])); let total = 0, haloOnly = 0;
  for (let p = 0; p < N; p++) if (det.m3[p]) { total++; byRegion[regionOf(p % OUT_W, yOf(p))]++; if (!det.core[p]) haloOnly++; }
  return { pass: total === 0, applicable: true, ...bgEst, bgVsSkinDE00: +bgVsSkin.toFixed(2), uncovered: total, coreLeak: total - haloOnly, haloOnly, byRegion, mask: det.m3, detectors: det };
}

/** Chebyshev distance (1 = edge) from the outside of the head geometry, rows <= 424; 255 for deeper than 60. */
export function edgeDistance(geom) {
  const head = (x, y) => x >= 0 && x < OUT_W && y >= 0 && y <= HEAD_MAX_Y && geom[y * OUT_W + x] === 1;
  const d = new Uint8Array(N);
  for (let p = 0; p < N; p++) {
    const x = p % OUT_W, y = yOf(p); if (!head(x, y)) continue; let found = 255;
    outer: for (let r = 1; r <= 60; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; if (!head(x + dx, y + dy)) { found = r; break outer; } }
    d[p] = found;
  }
  return d;
}
