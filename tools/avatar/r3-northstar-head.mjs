// R3 NORTHSTAR HEAD (D-189). Builds a second review variant on the D-188 baseline (tools/avatar/fixtures/r3-northstar-layers,
// hash-verified, unchanged): (1) a RECONSTRUCTED cranium — one round head under the hair that continues Northstar's visible face
// contour, with two small ear-root wedges, as its own layer UNDER the D-188 skin layer (which stays byte-identical); and
// (2) cleaned edges on the brow, nose and mouth layers by local-ink projection with the local skin as background (removes the
// light sharpening halo and the warm rims; keeps highlights). Everything else is the D-188 layer, byte for byte.
// The reconstructed cranium is DESIGN, not observed pixels. REVIEW VARIANT ONLY: never promotable by passing checks.
// No H1, no image call, no runtime change; R3 stays default OFF.
// Usage: node tools/avatar/r3-northstar-head.mjs --out <empty dir>
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng, encodePng, pixelSha256 } from "./r3-hair-tool-v2.mjs";
import * as NL from "./r3-northstar-layers.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
export const TOOL_ID = "r3-northstar-head";
export const DECISION = "D-189";
export const FIXTURES = "tools/avatar/fixtures/r3-northstar-head/";
export const SPEC_FILE = FIXTURES + "spec-v1.json";
export const MANIFEST_FILE = FIXTURES + "manifest-v1.json";
/** Back to front: the reconstructed cranium under the unchanged D-188 skin, then D-188's order. */
export const COMPOSITE_ORDER = Object.freeze(["cranium", ...NL.COMPOSITE_ORDER]);
/** Layers this variant builds; every other compositing layer is the D-188 tracked file, byte for byte. */
export const BUILT = Object.freeze(["cranium", "skin", "browL", "browR", "nose", "mouth", "hair"]);
export const MASKS = Object.freeze(["cranium-region", "cranium-visible-new", "feature-edit", "halo-removed", "skin-to-hair", "source-categories"]);
export const REVIEW_STATUS = "REVIEW VARIANT (D-189) — reconstructed head under the hair (design, not observed pixels) and cleaned feature edges on the D-188 baseline; not approved, not promotable";
const W = 1024, H = 1536, N = W * H;
const sha = (b) => createHash("sha256").update(b).digest("hex");
const rel = (p) => readFileSync(join(REPO, ...p.split("/")));
export const loadSpec = () => JSON.parse(rel(SPEC_FILE).toString("utf8"));
const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

export function promotionStatus() {
  return { promotable: false, status: REVIEW_STATUS, reason: "D-189 adds a review variant only; promotion needs a later, explicit owner decision and is never derived from check results" };
}
export function promote() { throw new Error("the Northstar head variant is a review candidate (D-189) and cannot be promoted by this tool"); }

// ── geometry helpers ────────────────────────────────────────────────────────────────────────────────────────────
/** The cranium contour as a polyline: the upper ellipse arc from the left join point over the top to the right join point. */
export function craniumArc(c, steps = 720) {
  const [cx, cy] = c.centre, [rx, ry] = c.radii, t0 = Math.asin((c.joinY - cy) / ry); // angle below the centre line at the join
  const a0 = Math.PI - t0, a1 = 2 * Math.PI + t0, pts = [];   // from the left join, up over the top, to the right join
  for (let k = 0; k <= steps; k++) { const a = a0 + (a1 - a0) * k / steps; pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
  return pts;
}
/** Coverage (0..1) of the ellipse interior above y < yCut, 4x4 supersampled at pixel level. */
function ellipseCoverage({ centre: [cx, cy], radii: [rx, ry] }, yCut) {
  const cov = new Float32Array(N);
  for (let y = Math.floor(cy - ry) - 1; y < yCut; y++) for (let x = Math.floor(cx - rx) - 1; x <= Math.ceil(cx + rx) + 1; x++) {
    let n = 0; for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const dx = (x + (i + 0.5) / 4 - cx) / rx, dy = (y + (j + 0.5) / 4 - cy) / ry; if (dx * dx + dy * dy <= 1) n++; }
    if (n) cov[y * W + x] = n / 16;
  }
  return cov;
}
/** Antialiased stroke coverage of a polyline: clamp(halfWidth + 0.5 − distance, 0, 1). */
function strokeCoverage(pts, hw, into = new Float32Array(N)) {
  for (let s = 0; s + 1 < pts.length; s++) {
    const [ax, ay] = pts[s], [bx, by] = pts[s + 1], vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1e-9;
    for (let y = Math.floor(Math.min(ay, by) - hw - 1); y <= Math.ceil(Math.max(ay, by) + hw + 1); y++) for (let x = Math.floor(Math.min(ax, bx) - hw - 1); x <= Math.ceil(Math.max(ax, bx) + hw + 1); x++) {
      const px = x + 0.5, py = y + 0.5, t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / L2)), d = Math.hypot(px - ax - t * vx, py - ay - t * vy);
      const c = Math.max(0, Math.min(1, hw + 0.5 - d)); if (c > into[y * W + x]) into[y * W + x] = c;
    }
  }
  return into;
}
/** A polyline through the given points, densified to <= 0.5 px steps (straight segments). */
const densify = (pts) => { const o = [pts[0]]; for (let k = 1; k < pts.length; k++) { const [ax, ay] = pts[k - 1], [bx, by] = pts[k], n = Math.ceil(Math.hypot(bx - ax, by - ay) / 0.5); for (let s = 1; s <= n; s++) o.push([ax + (bx - ax) * s / n, ay + (by - ay) * s / n]); } return o; };

// ── build ───────────────────────────────────────────────────────────────────────────────────────────────────────
/** Builds the D-189 layers and masks from the verified source and the hash-verified D-188 baseline. */
export function buildHead({ srcBuf, spec = loadSpec() } = {}) {
  const src = NL.loadSource(srcBuf);
  if (spec.source.sha256 !== NL.SOURCE.sha256) throw new Error("the spec does not name the tracked Northstar v2");
  const tracked = NL.loadTracked();   // throws unless every D-188 layer and mask is its pinned file
  if (spec.baseline.manifest !== NL.MANIFEST_FILE) throw new Error("the spec does not name the D-188 baseline");
  const base = Object.fromEntries(NL.COMPOSITE_ORDER.map((k) => [k, decodePng(tracked.files[k]).px]));
  const C = spec.cranium;
  // (0) hair-edge residue: opaque dark pixels the D-188 skin layer kept right next to the hair (luma < maxLuma, within radiusPx of
  // the missing-under-hair mask, above the face contour's top end, outside the feature zones) belong to the hair; they move to
  // this variant's own hair layer, so the composite with hair shows the same pixels and the bare head has no dark specks
  const R = spec.hairEdgeResidue, missing = decodePng(tracked.files["missing-under-hair"]).px, miss = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (missing[i * 4 + 3]) miss[i] = 1;
  const nearMiss = NL.dilate(miss, R.radiusPx), nlSpec = NL.loadSpec(), zones = NL.ZONES.map((z) => NL.polyMask(nlSpec.zones[z]));
  const skin = new Uint8ClampedArray(base.skin), hairOut = new Uint8ClampedArray(base.hair), toHair = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (((i / W) | 0) >= R.maxY || !nearMiss[i] || skin[i * 4 + 3] < 250 || zones.some((z) => z[i])) continue;
    if (luma(skin[i * 4], skin[i * 4 + 1], skin[i * 4 + 2]) >= R.maxLuma) continue;
    hairOut.set(skin.subarray(i * 4, i * 4 + 4), i * 4); skin[i * 4] = skin[i * 4 + 1] = skin[i * 4 + 2] = skin[i * 4 + 3] = 0; toHair[i] = 1;
  }

  // (1) cranium: region = ellipse above the join row + the two ear-root wedges
  const cov = ellipseCoverage(C.contour, C.contour.joinY + 9);
  for (const side of ["left", "right"]) { const m = NL.polyMask(C.earRootWedges[side].fill); for (let i = 0; i < N; i++) if (m[i]) cov[i] = 1; }
  // paint: harmonic band between the visible skin and the flat base colour
  const skinKnown = new Uint8Array(N);
  for (let i = 0; i < N; i++) { const a = skin[i * 4 + 3], k = NL.cls(skin[i * 4], skin[i * 4 + 1], skin[i * 4 + 2], 255); if (a >= 250 && (k === "S" || k === "O") && skin[i * 4 + 2] < 170) skinKnown[i] = 1; }
  const near = NL.dilate(skinKnown, C.paint.transitionBandPx);
  const seed = new Uint8ClampedArray(N * 4), unk = new Uint8Array(N), known = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (skinKnown[i]) { seed.set(skin.subarray(i * 4, i * 4 + 3), i * 4); known[i] = 1; continue; }
    if (!cov[i]) continue;
    if (near[i]) unk[i] = 1; else { seed[i * 4] = C.paint.baseRgb[0]; seed[i * 4 + 1] = C.paint.baseRgb[1]; seed[i * 4 + 2] = C.paint.baseRgb[2]; known[i] = 1; }
  }
  const fill = NL.harmonicFill(seed, unk, known);
  const cranium = new Uint8ClampedArray(N * 4);
  for (let i = 0; i < N; i++) if (cov[i]) {
    const rgb = unk[i] ? [fill[i * 3], fill[i * 3 + 1], fill[i * 3 + 2]] : skinKnown[i] ? [skin[i * 4], skin[i * 4 + 1], skin[i * 4 + 2]] : C.paint.baseRgb;
    cranium[i * 4] = Math.round(rgb[0]); cranium[i * 4 + 1] = Math.round(rgb[1]); cranium[i * 4 + 2] = Math.round(rgb[2]); cranium[i * 4 + 3] = Math.round(cov[i] * C.paint.alpha);
  }
  // ink: the arc and the two ear-closing strokes, source-over onto the cranium paint
  const ink = strokeCoverage(craniumArc(C.contour), C.ink.halfWidthPx);
  for (const side of ["left", "right"]) strokeCoverage(densify(C.earRootWedges[side].ink), C.ink.halfWidthPx, ink);
  for (let i = 0; i < N; i++) if (ink[i] > 0) {
    const a = ink[i], da = cranium[i * 4 + 3] / 255, oa = a + da * (1 - a);
    for (let c = 0; c < 3; c++) cranium[i * 4 + c] = Math.round((C.ink.rgb[c] * a + cranium[i * 4 + c] * da * (1 - a)) / oa);
    cranium[i * 4 + 3] = Math.round(oa * 255);
  }

  // (2) feature edges: local-ink projection. First, the hair's own outline that D-188 duplicated into a part (shared ink,
  // overlap-ink-hair-features) leaves the part: it is the hair lock's edge, it stays in the hair layer, and the composite with
  // hair is unchanged; without hair it no longer floats on the bare forehead.
  const sharedInk = decodePng(tracked.files["overlap-ink-hair-features"]).px;
  const E = spec.featureEdges, parts = {}, featEdit = new Uint8Array(N), haloRemoved = new Uint8Array(N), stats = { parts: {} };
  for (const p of E.parts) {
    const L0 = base[p], out = new Uint8ClampedArray(L0), core = new Uint8Array(N);
    let shared = 0;
    for (let i = 0; i < N; i++) if (L0[i * 4 + 3] && sharedInk[i * 4 + 3] && base.hair[i * 4 + 3] >= 250) { out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = out[i * 4 + 3] = 0; featEdit[i] = 1; shared++; }
    for (let i = 0; i < N; i++) {
      if (L0[i * 4 + 3] < 250 || !out[i * 4 + 3]) continue;
      const P = src.subarray(i * 4, i * 4 + 3), S = skin.subarray(i * 4, i * 4 + 3);
      if (luma(P[0], P[1], P[2]) <= luma(S[0], S[1], S[2]) - 2 || NL.cls(P[0], P[1], P[2], 255) === "W") core[i] = 1;
    }
    // painted shade fills (e.g. the nose shadow) are cores too: part pixels with alpha >= shadeMinAlpha that are not lighter
    // than the skin, kept only where all 8 neighbours are shade as well (1 px erosion), so 1–2 px antialias rings are not
    const shade = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (out[i * 4 + 3] >= E.shadeMinAlpha * 255 && luma(src[i * 4], src[i * 4 + 1], src[i * 4 + 2]) <= luma(skin[i * 4], skin[i * 4 + 1], skin[i * 4 + 2]) - 2) shade[i] = 1;
    let shadeCore = 0;
    for (let i = W + 1; i < N - W - 1; i++) if (shade[i] && !core[i] && shade[i - 1] && shade[i + 1] && shade[i - W] && shade[i + W] && shade[i - W - 1] && shade[i - W + 1] && shade[i + W - 1] && shade[i + W + 1]) { core[i] = 1; shadeCore++; }
    let edges = 0, changed = 0, removed = 0, noCore = 0, haloGone = 0;
    for (let i = 0; i < N; i++) {
      if (!L0[i * 4 + 3] || !out[i * 4 + 3] || core[i]) continue;
      edges++;
      const x = i % W, y = (i / W) | 0; let best = -1, bd = 1e9;
      for (let r = 1; r <= E.coreRadiusPx && best < 0; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const j = (y + dy) * W + x + dx; if (!core[j]) continue;
        const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = j; }
      }
      if (best < 0) { noCore++; continue; }
      const P = src.subarray(i * 4, i * 4 + 3), S = skin.subarray(i * 4, i * 4 + 3), K = src.subarray(best * 4, best * 4 + 3);
      const sk = [S[0] - K[0], S[1] - K[1], S[2] - K[2]], sp = [S[0] - P[0], S[1] - P[1], S[2] - P[2]], den = sk[0] * sk[0] + sk[1] * sk[1] + sk[2] * sk[2];
      let a = den > 0 ? (sp[0] * sk[0] + sp[1] * sk[1] + sp[2] * sk[2]) / den : 0; a = Math.max(0, Math.min(1, a));
      const wasLight = luma(P[0], P[1], P[2]) > luma(S[0], S[1], S[2]);
      if (a < E.minAlpha) { out[i * 4] = 0; out[i * 4 + 1] = 0; out[i * 4 + 2] = 0; out[i * 4 + 3] = 0; removed++; if (wasLight) { haloRemoved[i] = 1; haloGone++; } }
      else { out[i * 4] = K[0]; out[i * 4 + 1] = K[1]; out[i * 4 + 2] = K[2]; out[i * 4 + 3] = Math.round(a * src[i * 4 + 3]); }
      if (out[i * 4] !== L0[i * 4] || out[i * 4 + 1] !== L0[i * 4 + 1] || out[i * 4 + 2] !== L0[i * 4 + 2] || out[i * 4 + 3] !== L0[i * 4 + 3]) { featEdit[i] = 1; changed++; }
    }
    parts[p] = out; stats.parts[p] = { sharedHairInkRemovedPx: shared, shadeCorePx: shadeCore, corePx: core.reduce((s, v) => s + v, 0), edgePx: edges, changedPx: changed, removedPx: removed, haloRemovedPx: haloGone, keptNoCorePx: noCore };
  }

  // masks
  const region = new Uint8Array(N), visibleNew = new Uint8Array(N);
  for (let i = 0; i < N; i++) { if (cranium[i * 4 + 3]) region[i] = 1; if (cranium[i * 4 + 3] && skin[i * 4 + 3] < 250) visibleNew[i] = 1; }
  const toPx = (m, rgb) => { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) if (m[i]) { o.set(rgb, i * 4); o[i * 4 + 3] = 255; } return o; };
  // source categories: original Northstar pixel (grey) · D-188 reconstruction (magenta) · D-189 cranium paint (green) · D-189 ink (dark green)
  //                    · D-189 re-projected feature edge (yellow) · missing, under the hair and outside the new head (blue)
  const d188recon = decodePng(tracked.files.reconstructed).px, cats = new Uint8ClampedArray(N * 4);
  for (let i = 0; i < N; i++) {
    let c = null;
    if (featEdit[i]) c = [255, 210, 0];
    else if (visibleNew[i]) c = ink[i] >= 0.5 ? [0, 110, 40] : [60, 200, 90];
    else if (d188recon[i * 4 + 3]) c = [230, 0, 180];
    else if (missing[i * 4 + 3]) c = [0, 120, 255];
    else if (src[i * 4 + 3]) c = [150, 150, 150];
    if (c) { cats.set(c, i * 4); cats[i * 4 + 3] = 255; }
  }
  const masks = { "cranium-region": toPx(region, [60, 200, 90]), "cranium-visible-new": toPx(visibleNew, [60, 200, 90]), "feature-edit": toPx(featEdit, [255, 210, 0]), "halo-removed": toPx(haloRemoved, [255, 60, 60]), "skin-to-hair": toPx(toHair, [150, 60, 200]), "source-categories": cats };
  stats.cranium = { regionPx: region.reduce((s, v) => s + v, 0), visibleNewPx: visibleNew.reduce((s, v) => s + v, 0), inkPx: ink.reduce((s, v) => s + (v > 0 ? 1 : 0), 0), bandPx: unk.reduce((s, v) => s + v, 0) };
  stats.skinToHairPx = toHair.reduce((s, v) => s + v, 0);
  const layers = { ...base, cranium, skin, hair: hairOut, ...parts };
  return { src, tracked, baseline: base, layers, masks, stats, ink };
}

/** Source-over in COMPOSITE_ORDER (subset allowed, order kept). Refuses anything that is not a compositing layer. */
export function composeHead(layers, { include = COMPOSITE_ORDER } = {}) {
  for (const k of Object.keys(layers)) if (!COMPOSITE_ORDER.includes(k)) throw new Error(`${k} is not a compositing layer`);
  for (const k of include) if (!COMPOSITE_ORDER.includes(k)) throw new Error(`${k} is not a compositing layer`);
  return NL.overStack(COMPOSITE_ORDER.filter((k) => include.includes(k) && layers[k]).map((k) => layers[k]));
}
/** The documented comparison with the whole original: D-188's comparison-only body under this variant's head. */
export function composeOriginalComparison(build, bodyPx, include = COMPOSITE_ORDER) {
  return NL.overStack([bodyPx, ...COMPOSITE_ORDER.filter((k) => include.includes(k)).map((k) => build.layers[k])]);
}

/** Reads this variant's tracked layer and mask files and the manifest. */
export function loadTracked() {
  const man = JSON.parse(rel(MANIFEST_FILE).toString("utf8")), files = {};
  for (const [k, e] of Object.entries({ ...man.layers, ...man.masks })) { const b = rel(e.file); if (sha(b) !== e.sha256) throw new Error(`${e.file} is not the pinned ${e.sha256}`); files[k] = b; }
  if (sha(rel(SPEC_FILE)) !== man.spec.sha256) throw new Error(`${SPEC_FILE} is not the pinned ${man.spec.sha256}`);
  return { man, files };
}

// ── CLI ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const invokedDirectly = typeof process.argv[1] === "string" && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  const args = process.argv.slice(2), i = args.indexOf("--out"), outDir = i >= 0 ? args[i + 1] : null;
  if (!outDir) throw new Error("usage: --out <empty dir>");
  const OUT = resolve(outDir); if (existsSync(OUT) && readdirSync(OUT).length) throw new Error("output directory not empty");
  for (const d of ["layers", "masks"]) mkdirSync(join(OUT, d), { recursive: true });
  const b = buildHead(), pins = {};
  for (const k of BUILT) { writeFileSync(join(OUT, "layers", `${k}.png`), encodePng(W, H, b.layers[k])); pins[`layers/${k}`] = pixelSha256(b.layers[k]); }
  for (const [k, px] of Object.entries(b.masks)) { writeFileSync(join(OUT, "masks", `${k}.png`), encodePng(W, H, px)); pins[`masks/${k}`] = pixelSha256(px); }
  const body = NL.buildLayers().comparisonOnly.body, comp = composeOriginalComparison(b, body);
  writeFileSync(join(OUT, "build.json"), JSON.stringify({ tool: TOOL_ID, decision: DECISION, status: REVIEW_STATUS, pixelSha256: pins, composite: pixelSha256(comp), deviationFromOriginal: NL.deviation(b.src, comp), stats: b.stats }, null, 2) + "\n");
  console.log(JSON.stringify({ stats: b.stats, deviation: NL.deviation(b.src, comp) }, null, 1));
}
