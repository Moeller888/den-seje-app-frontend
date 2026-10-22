// R3 REVIEW PACK (D-187). One entrypoint that rebuilds every R3 head review layer from tracked sources, composes the head in
// the contract's z order, runs the checks and writes the review images and a report. REVIEW MODE ONLY: it may compose the
// DRAFT / DESIGNFORSLAG / DESIGNPROTOTYPE parts listed in review-pack-v1.json. The production paths (r3-face-parts-tool,
// r3-eyes-tool, r3-hair-tool-v2 compose functions) are not used for that and keep refusing those parts. No image call, no
// H1, no Northstar pixels as a source (Northstar is only shown beside the result), no runtime change; R3 stays default OFF.
//   · base  — D-186's head/neck underlay, rebuilt by its generator (luminance x skin token, ink);
//   · hair  — D-185's hybrid-v2, rebuilt and placed by its generator, with the DRAFT nape lock (nape-lock-v1.spec.json)
//             drawn here and merged UNDER it in the same hair luminance layer (no new runtime layer);
//   · face  — D-165's brows and mouth from the untouched sheet with their DRAFT anchors + the authored vector nose, on the
//             APPROVED D-164 targets (one positive uniform scale + translation per part);
//   · eyes  — the v5 prototype's pinned fixed and iris layers (renders of its tracked SVGs; --render-eyes re-renders them).
//
// Usage: node tools/avatar/r3-review-pack.mjs --out <empty dir> [--render-eyes] [--variant d187|northstar-layers|both|northstar-head|northstar-brow]
//
// --variant (D-188): "d187" (the default) is the pack above, unchanged — its rule of no Northstar pixels as a source still holds
// for it. "northstar-layers" rebuilds the SEPARATE D-188 review variant (r3-review-northstar-layers.mjs), whose visible pixels
// are Northstar v2's own, and compares it with Northstar and with this pack's head; "both" writes d187/ and northstar-layers/.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as HN from "./r3-underlay-headneck.mjs";
import { SOURCE as HAIR_SOURCE, buildHybrid, constructionAnnotation, runChecks as runHairChecks } from "./r3-hair-hybrid.mjs";
import { decodePng, encodePng, pixelSha256, applyTonalRampB, checkPlacedHair } from "./r3-hair-tool-v2.mjs";
import { loadTargets } from "./r3-hair-guide-v1.mjs";
import * as FP from "./r3-face-parts-tool.mjs";
import { inEyeEnvelope } from "./r3-eyes-tool.mjs";
import { checkFaceNeutralOutput } from "./check-r3-face-neutral-output.mjs";
import { HAIR_COLOR_TOKENS } from "../../js/avatar-layers.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
export const TOOL_ID = "r3-review-pack";
export const REVIEW_MODE = "review-pack";
export const PACK_SPEC = "tools/avatar/fixtures/r3-review-pack/review-pack-v1.json";
export const PACK_MANIFEST = "tools/avatar/fixtures/r3-review-pack/review-pack-v1.manifest.json";
export const UNDERLAY_SPEC = "tools/avatar/fixtures/r3-underlay-headneck/headneck-v1.spec.json";
export const UNDERLAY_MANIFEST = "tools/avatar/fixtures/r3-underlay-headneck/headneck-v1.manifest.json";
export const HAIR_SPEC = "tools/avatar/fixtures/r3-hair/hybrid/hybrid-v2.edits.json";
export const HAIR_PLACED_PIXEL_SHA256 = "e506555e5a4481772467a4972ca24df9142f3e1f0ca711e346cee43fd765199e";   // D-185
export const NAPE_SPEC = "tools/avatar/fixtures/r3-review-pack/nape-lock-v1.spec.json";
export const LAYER_ORDER = Object.freeze(["base", "face", "eyesIris", "eyesFixed", "hair"]);   // zModel: 0 < 3 < 4 (iris, fixed) < 40
const W = 1024, H = 1536, N = W * H;
const sha = (b) => createHash("sha256").update(b).digest("hex");
const rel = (p) => readFileSync(join(REPO, ...p.split("/")));
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// ── sources ─────────────────────────────────────────────────────────────────────────────────────────────────────
/** Reads the pack spec and every pinned source; throws on a hash mismatch or a forbidden source. */
export function loadPack(mode = REVIEW_MODE) {
  if (mode !== REVIEW_MODE) throw new Error(`the review pack runs only in "${REVIEW_MODE}" mode, never in "${mode}"`);
  const spec = JSON.parse(rel(PACK_SPEC).toString("utf8")), bufs = {};
  for (const [k, s] of Object.entries(spec.sources)) {
    if (!s.file) continue;
    if (/h1|northstar|g1v3-v1\.png/i.test(s.file.split("/").pop())) throw new Error(`${k}: a forbidden source file`);
    const b = rel(s.file); if (sha(b) !== s.sha256) throw new Error(`${k}: ${s.file} is not the pinned ${s.sha256}`);
    bufs[k] = b;
  }
  const accepts = spec.mode.accepts;
  for (const k of ["browLeft", "browRight", "mouth"]) {
    const a = JSON.parse(bufs[k].toString("utf8"));
    if (a.raw?.sha256 !== spec.sources.d165Sheet.sha256 || a.part !== k) throw new Error(`${k}: not the D-165 annotation of its part`);
    if (!accepts.includes(a.status)) throw new Error(`${k}: status ${a.status} is not a review-pack status`);
  }
  return { spec, bufs };
}

// ── base ────────────────────────────────────────────────────────────────────────────────────────────────────────
export function buildBase() {
  const spec = JSON.parse(rel(UNDERLAY_SPEC).toString("utf8")), src = HN.loadSources(spec), built = HN.buildHeadNeck(spec, src);
  return { spec, src, built, checks: HN.checkHeadNeck(built, src, spec), manifest: JSON.parse(rel(UNDERLAY_MANIFEST).toString("utf8")) };
}

// ── hair: D-185 hybrid-v2 placed + the nape lock merged under it ────────────────────────────────────────────────
export function buildHybridHair(basePx) {
  const specBuf = rel(HAIR_SPEC), spec = JSON.parse(specBuf.toString("utf8"));
  const raw = rel(HAIR_SOURCE.file); if (sha(raw) !== HAIR_SOURCE.sha256) throw new Error("the D-185 raw source is not the pinned D-183 sheet");
  const built = buildHybrid({ spec, rawPx: decodePng(raw).px });
  const ann = constructionAnnotation({ spec, specSha256: sha(specBuf), built, derivedPixelSha256: pixelSha256(built.sheetPx) });
  const c = runHairChecks({ built, ann, headPx: basePx });
  if (!c.hairPx) throw new Error("the hybrid hair could not be placed");
  return { hairPx: c.hairPx, rawSheet: c.rawSheet, locks: c.locks, seat: c.seat };
}
/** The DRAFT nape lock: grey luminance + alpha, behind the base (alpha x (1 - base alpha), 0 where base alpha >= 128). */
export function buildNapeLock(spec, basePx) {
  const S = spec.parameters.supersample, P = [...HN.expand([spec.shape.outer]), ...HN.expand([spec.shape.inner]).slice(1)];
  const cov = HN.polyCoverage(P, S), out = new Uint8ClampedArray(N * 4);
  const ink = HN.lineCoverage(HN.expand([spec.shape.inner]), spec.ink.outerHalfWidthPx, HN.lineCoverage(HN.expand([spec.shape.outer]), spec.ink.outerHalfWidthPx)), strand = HN.lineCoverage(HN.expand([spec.ink.strand]), spec.ink.strandHalfWidthPx);
  const T = spec.tones;
  for (let i = 0; i < N; i++) {
    if (cov[i] <= 0) continue;
    const ba = basePx[i * 4 + 3]; if (ba >= 128) continue;
    const a = Math.min(1, cov[i]) * (1 - ba / 255); if (a <= 0) continue;
    const k = a >= 16 / 255 ? ink[i] : 0, s = a >= 16 / 255 ? strand[i] * (1 - k) : 0;
    const g = Math.round(T.fill * (1 - k - s) + T.ink * k + T.strand * s);
    out[i * 4] = g; out[i * 4 + 1] = g; out[i * 4 + 2] = g; out[i * 4 + 3] = Math.round(a * 255);
  }
  return out;
}
/** Source-over of the hybrid hair over the nape lock: one hair luminance layer. */
export function mergeHair(hairPx, lockPx) {
  const out = new Uint8ClampedArray(N * 4);
  for (let i = 0; i < N; i++) {
    const ha = hairPx[i * 4 + 3] / 255, la = lockPx[i * 4 + 3] / 255, a = ha + la * (1 - ha);
    if (a <= 0) continue;
    for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.round((hairPx[i * 4 + c] * ha + lockPx[i * 4 + c] * la * (1 - ha)) / a);
    out[i * 4 + 3] = Math.round(a * 255);
  }
  return out;
}

/** Transparent pixels (base and hair alpha both < 128) that are not 4-connected to the canvas border: holes through the figure. */
export function figureHoles(hairPx, basePx) {
  const open = new Uint8Array(N); for (let i = 0; i < N; i++) open[i] = hairPx[i * 4 + 3] < 128 && basePx[i * 4 + 3] < 128 ? 1 : 0;
  const seen = new Uint8Array(N), st = [];
  for (let x = 0; x < W; x++) for (const y of [0, H - 1]) { const i = y * W + x; if (open[i] && !seen[i]) { seen[i] = 1; st.push(i); } }
  for (let y = 0; y < H; y++) for (const x of [0, W - 1]) { const i = y * W + x; if (open[i] && !seen[i]) { seen[i] = 1; st.push(i); } }
  while (st.length) { const j = st.pop(), x = j % W, y = (j / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const k = yy * W + xx; if (open[k] && !seen[k]) { seen[k] = 1; st.push(k); } } }
  const hole = new Uint8Array(N); let n = 0; for (let i = 0; i < N; i++) if (open[i] && !seen[i]) { hole[i] = 1; n++; }
  return { hole, n };
}
/** ASSEMBLY FIX (documented, D-187): fills every hole through the figure in the hair layer, opaque, with the mean grey of its
 *  already-solid hair neighbours (deterministic passes in scan order). Never touches a pixel outside a hole. */
export function fillFigureHoles(hairPx, basePx) {
  const { hole, n } = figureHoles(hairPx, basePx), out = new Uint8ClampedArray(hairPx), todo = new Uint8Array(hole);
  let left = n;
  while (left > 0) {
    const set = [];
    for (let i = 0; i < N; i++) {
      if (!todo[i]) continue; const x = i % W, y = (i / W) | 0; let s = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const k = (y + dy) * W + x + dx; if ((dx || dy) && !todo[k] && out[k * 4 + 3] >= 128) { s += out[k * 4]; c++; } }
      if (c) set.push([i, Math.round(s / c)]);
    }
    if (!set.length) throw new Error("a figure hole has no solid hair neighbour");
    for (const [i, g] of set) { out[i * 4] = g; out[i * 4 + 1] = g; out[i * 4 + 2] = g; out[i * 4 + 3] = 255; todo[i] = 0; left--; }
  }
  return { hairPx: out, filledPx: n };
}

// ── face (review mode) ──────────────────────────────────────────────────────────────────────────────────────────
export function buildFace(bufs) {
  const targets = JSON.parse(rel("tools/avatar/fixtures/r3-face-parts/targets-v1.json").toString("utf8"));
  const sheet = FP.decodePng(bufs.d165Sheet).px, ann = {};
  for (const p of ["browLeft", "browRight", "mouth"]) ann[p] = JSON.parse(bufs[p].toString("utf8"));
  const D = JSON.parse(bufs.noseDesign.toString("utf8")).design;
  if (JSON.parse(bufs.noseDesign.toString("utf8")).svg.sha256 !== sha(bufs.noseSvg)) throw new Error("the nose design does not describe the tracked SVG");
  const fits = {};
  for (const p of ["browLeft", "browRight", "mouth"]) { const names = FP.PART_POINTS[p]; fits[p] = FP.fitUniformScaleTranslate(names.map((k) => ann[p].points[k]), names.map((k) => targets.points[p][k].xy)); }
  fits.nose = FP.fitUniformScaleTranslate([[0, 0], [D.end[0], D.end[1]]], [targets.points.nose.top.xy, targets.points.nose.bottom.xy]);
  for (const [p, f] of Object.entries(fits)) if (!f.ok || !(f.s > 0)) throw new Error(p + ": no positive uniform fit");
  const canvas = new Float64Array(N * 4), overlapPx = {};
  for (const p of ["browLeft", "browRight"]) overlapPx[p] = FP.overInto(canvas, W, FP.resampleArea(FP.extractCell(sheet, p), fits[p].s, fits[p].tx, fits[p].ty, W, H));
  {
    const f = fits.nose, rgb = [1, 3, 5].map((k) => parseInt(D.colour.slice(k, k + 2), 16));
    const qx = (t, c, e) => 2 * (1 - t) * t * c + t * t * e;
    const inside = (u, v) => { if (v < 0 || v > D.heightPx) return false; const t = v / D.heightPx, a = qx(t, D.outerControl[0], D.end[0]), b = qx(t, D.innerControl[0], D.end[0]); return u >= Math.min(a, b) && u <= Math.max(a, b); };
    const X0 = Math.floor(f.tx + f.s * D.outerControl[0]) - 2, X1 = Math.ceil(f.tx + f.s * (D.end[0] + 1)) + 2, Y0 = Math.floor(f.ty) - 2, Y1 = Math.ceil(f.ty + f.s * D.heightPx) + 2;
    const bw = X1 - X0 + 1, bh = Y1 - Y0 + 1, data = new Float64Array(bw * bh * 4), SS = 8;
    for (let Y = Y0; Y <= Y1; Y++) for (let X = X0; X <= X1; X++) {
      let c = 0; for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) if (inside((X + (i + 0.5) / SS - f.tx) / f.s, (Y + (j + 0.5) / SS - f.ty) / f.s)) c++;
      if (!c) continue; const a = c / (SS * SS) * D.opacity, o = ((Y - Y0) * bw + X - X0) * 4; data[o] = rgb[0] * a; data[o + 1] = rgb[1] * a; data[o + 2] = rgb[2] * a; data[o + 3] = a;
    }
    overlapPx.nose = FP.overInto(canvas, W, { X0, Y0, bw, bh, data });
  }
  overlapPx.mouth = FP.overInto(canvas, W, FP.resampleArea(FP.extractCell(sheet, "mouth"), fits.mouth.s, fits.mouth.tx, fits.mouth.ty, W, H));
  const facePx = FP.quantise(canvas, W, H);
  return { facePx, fits: Object.fromEntries(Object.entries(fits).map(([p, f]) => [p, { s: f.s, tx: f.tx, ty: f.ty, residualMaxPx: f.residualMaxPx }])), overlapPx };
}

// ── eyes ────────────────────────────────────────────────────────────────────────────────────────────────────────
export function loadEyes(bufs) { return { fixedPx: decodePng(bufs.eyesFixedPng).px, irisPx: decodePng(bufs.irisPng).px }; }
/** Optional: re-render the two tracked SVGs with Playwright's Chromium exactly as the v5 generator did. */
export async function renderEyes(bufs) {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage(), out = {};
    for (const [k, b] of [["fixedPx", bufs.eyesFixedSvg], ["irisPx", bufs.irisSvg]]) {
      await page.setViewportSize({ width: W, height: H });
      await page.setContent(`<!doctype html><style>html,body{margin:0;background:transparent}</style>${b.toString("utf8")}`);
      out[k] = decodePng(await page.screenshot({ clip: { x: 0, y: 0, width: W, height: H }, omitBackground: true })).px;
    }
    return out;
  } finally { await browser.close(); }
}
/** The iris luminance x a colour token (the D-136 method; the same formula as r3-eyes-tool tintedReviewPair's iris step). */
export function tintIris(irisPx, rgb) {
  const out = new Uint8ClampedArray(N * 4);
  for (let i = 0; i < N; i++) { const a = irisPx[i * 4 + 3]; if (!a) continue; const Y = lum(irisPx[i * 4], irisPx[i * 4 + 1], irisPx[i * 4 + 2]) / 255; for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.round(Y * rgb[c]); out[i * 4 + 3] = a; }
  return out;
}

// ── composition ─────────────────────────────────────────────────────────────────────────────────────────────────
/** Straight-alpha source-over of `src` onto `dst` (in place). */
export function over(dst, src) {
  for (let i = 0; i < N; i++) {
    const sa = src[i * 4 + 3] / 255; if (!sa) continue;
    const da = dst[i * 4 + 3] / 255, a = sa + da * (1 - sa);
    for (let c = 0; c < 3; c++) dst[i * 4 + c] = Math.round((src[i * 4 + c] * sa + dst[i * 4 + c] * da * (1 - sa)) / a);
    dst[i * 4 + 3] = Math.round(a * 255);
  }
  return dst;
}
/** Composes the head in LAYER_ORDER from coloured layers { base, face, eyesIris, eyesFixed, hair } (any may be null). */
export function composeHead(layers, order = LAYER_ORDER) {
  const out = new Uint8ClampedArray(N * 4);
  for (const k of order) if (layers[k]) over(out, layers[k]);
  return out;
}

/** Builds every layer and runs the checks. Pure apart from reading the tracked sources. */
export function buildPack({ eyes = null } = {}) {
  const { spec, bufs } = loadPack(REVIEW_MODE);
  const base = buildBase();
  const basePx = base.built.lum;
  const hybrid = buildHybridHair(basePx);
  const napeSpec = JSON.parse(rel(NAPE_SPEC).toString("utf8"));
  const lockPx = buildNapeLock(napeSpec, basePx);
  const merged = mergeHair(hybrid.hairPx, lockPx);
  const holesBefore = figureHoles(merged, basePx).n;
  const { hairPx, filledPx } = fillFigureHoles(merged, basePx);
  const face = buildFace(bufs);
  const ey = eyes ?? loadEyes(bufs);
  const checks = runPackChecks({ spec, base, hybrid, lockPx, hairPx, face, eyes: ey, assembly: { holesBefore, filledPx, holesAfter: figureHoles(hairPx, basePx).n } });
  return { spec, bufs, base, hybrid, napeSpec, lockPx, hairPx, face, eyes: ey, checks };
}

/** The coloured layers for one variant (skin, iris and hair tokens as rgb / HAIR_COLOR_TOKENS key). */
export function colourLayers(pack, { skin = pack.spec.tokens.skin.medium.rgb, iris = pack.spec.tokens.iris.brown.rgb, hair = "brown", withHair = true } = {}) {
  return {
    base: HN.renderSkin(pack.base.built.lum, pack.base.built.ink, skin, pack.base.spec.palette.skinWarmth),
    face: pack.face.facePx,
    eyesIris: tintIris(pack.eyes.irisPx, iris),
    eyesFixed: pack.eyes.fixedPx,
    hair: withHair ? applyTonalRampB(pack.hairPx, HAIR_COLOR_TOKENS[hair]) : null,
  };
}

// ── checks ──────────────────────────────────────────────────────────────────────────────────────────────────────
export function runPackChecks({ spec, base, hybrid, lockPx, hairPx, face, eyes, assembly }) {
  const out = [], add = (id, kind, ok, value, name) => out.push({ id, kind, ok, value, name });
  const B = base.built.lum, bm = base.manifest.outputs;
  add("SRC", "binding", true, Object.keys(spec.sources).filter((k) => spec.sources[k].file).length + " pinned sources verified", "every tracked source matches its sha256 (loadPack throws otherwise)");
  const basePins = { luminance: pixelSha256(base.built.lum), ink: pixelSha256(base.built.ink), medium: pixelSha256(base.built.render) };
  add("BASE-REBUILD", "binding", ["luminance", "ink", "medium"].every((k) => basePins[k] === bm[k].pixelSha256), basePins, "D-186 underlay rebuilt to its manifest's pixel hashes");
  for (const c of base.checks.checks) add(c.id, "binding", c.ok, c.value, c.name);
  for (const g of base.checks.notApplicable) add(g.id, "not applicable", null, g.status, g.why);
  add("HAIR-REBUILD", "binding", pixelSha256(hybrid.hairPx) === HAIR_PLACED_PIXEL_SHA256, pixelSha256(hybrid.hairPx), "D-185 hybrid-v2 placed to its recorded pixel hash");
  add("HAIR-LOCKS", "binding", !!hybrid.locks && hybrid.locks.every((l) => l.ok), hybrid.locks && hybrid.locks.map((l) => `${l.lock}:${l.ok}`), "HP-LOCK on the derived sheet");
  // nape lock
  let onBase = 0, overBehind = 0, lockPx_ = 0, x0 = W, x1 = -1, y0 = H, y1 = -1, touchesEar = false;
  for (let i = 0; i < N; i++) {
    const a = lockPx[i * 4 + 3]; if (!a) continue; lockPx_++;
    const ba = B[i * 4 + 3], x = i % W, y = (i / W) | 0;
    if (ba >= 128) onBase++; if (a > Math.round(255 * (1 - ba / 255)) + 1) overBehind++;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    if (y >= 368 && y <= 380) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const j = (y + dy) * W + x + dx; if (B[j * 4 + 3] >= 128) touchesEar = true; }
  }
  add("NL-BEHIND", "binding", lockPx_ > 0 && onBase === 0 && overBehind === 0, { lockPx: lockPx_, onBaseSolidPx: onBase, alphaAboveBehindRulePx: overBehind }, "the nape lock is behind the head: 0 px on any base pixel with alpha >= 128, alpha <= 1 - base alpha elsewhere");
  add("NL-ROOT", "binding", touchesEar, { touchesEarJunctionRows368to380: touchesEar }, "the nape lock emerges from behind the ear (it touches the base at the ear's lower junction)");
  add("NL-EXTENT", "binding", x0 >= 590 && x1 <= 660 && y0 >= 366 && y1 <= 414, { bbox: [x0, y0, x1, y1] }, "the nape lock stays below the image-right ear, along the jaw (x 590..660, rows 366..414): never on the cheek, never in front of the neck");
  const chromaOf = (px) => { let m = 0; for (let i = 0; i < N; i++) if (px[i * 4 + 3] >= 16) m = Math.max(m, Math.max(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]) - Math.min(px[i * 4], px[i * 4 + 1], px[i * 4 + 2])); return m; };
  add("NL-LUMINANCE", "binding", chromaOf(lockPx) === 0, { maxChroma: chromaOf(lockPx) }, "the drawn nape lock is grey (the hair luminance layer's own tones); ramp B colours it with the hair");
  add("HAIR-CHROMA", "diagnostic", true, { maxChroma: chromaOf(hybrid.hairPx) }, "the D-185 hair keeps the generated sheet's painting (not grey); ramp B reads its luminance, as D-185 recorded");
  add("FIG-HOLES", "binding", assembly.holesAfter === 0, { holesAfterPx: assembly.holesAfter }, "no hole through the composed figure (transparent under both base and hair, enclosed)");
  add("ASSEMBLY-FIX-HOLES", "assembly fix", true, { filledPx: assembly.filledPx, holesBeforePx: assembly.holesBefore }, "documented assembly fix: the enclosed gap between the D-185 hair's opening edge and the head silhouette at the image-right temple is filled in the hair layer with the neighbouring hair grey; D-185's own pixels are verified unchanged before the merge");
  // D-179 placed checks on the ACTUAL review pixels: merged hair over the D-186 base with the pinned face and eyes
  const pc = checkPlacedHair({ hairPx, headPx: B, facePx: face.facePx, eyesFixedPx: eyes.fixedPx, irisPx: eyes.irisPx, targets: loadTargets() });
  for (const c of pc.checks) add(c.id, "binding (review pack)", c.ok, c.value, c.name);
  // face
  const fc = checkFaceNeutralOutput(Buffer.from(encodePng(W, H, face.facePx)));
  for (const a of fc.auto) add(a.id, "face layer", a.status === "OK" || /pass|ok/i.test(String(a.status)), a.detail, a.name);
  add("FACE-FITS", "diagnostic", true, face.fits, "uniform scale + translation per part; residuals reported, not corrected");
  add("FACE-OVERLAP", "diagnostic", true, face.overlapPx, "pixels where a later face part overlaps an earlier one");
  // eyes
  let outside = 0, irisChroma = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = (y * W + x) * 4; if (eyes.fixedPx[o + 3] >= 8 && !inEyeEnvelope(x, y)) outside++; if (eyes.irisPx[o + 3] >= 16) irisChroma = Math.max(irisChroma, Math.max(eyes.irisPx[o], eyes.irisPx[o + 1], eyes.irisPx[o + 2]) - Math.min(eyes.irisPx[o], eyes.irisPx[o + 1], eyes.irisPx[o + 2])); }
  add("EYES-ENVELOPE", "binding", outside === 0, { outsidePx: outside }, "eyes-fixed alpha >= 8 only inside the D-159 eye and fold envelope");
  add("EYES-IRIS-LUMINANCE", "binding", irisChroma === 0, { maxChroma: irisChroma }, "the iris layer is achromatic (one token colours it)");
  // transparency: everything outside the head box is empty in every layer
  const [hx0, hy0, hx1, hy1] = spec.headBox; let stray = 0;
  for (const px of [B, face.facePx, eyes.fixedPx, eyes.irisPx, hairPx]) for (let i = 0; i < N; i++) { if (!px[i * 4 + 3]) continue; const x = i % W, y = (i / W) | 0; if (x < hx0 || x >= hx1 || y < hy0 || y >= hy1) stray++; }
  add("TRANSPARENCY", "binding", stray === 0, { pxOutsideHeadBox: stray, headBox: spec.headBox }, "every layer is transparent outside the head box");
  return { checks: out, firstFailure: out.find((c) => c.ok === false)?.id ?? null };
}

// ── review images and report ────────────────────────────────────────────────────────────────────────────────────
const flat = (src, bg = [255, 255, 255]) => { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) { const a = src[i * 4 + 3] / 255; for (let c = 0; c < 3; c++) o[i * 4 + c] = Math.round(src[i * 4 + c] * a + bg[c] * (1 - a)); o[i * 4 + 3] = 255; } return o; };
const checker = (src) => { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0, bg = ((x >> 3) + (y >> 3)) & 1 ? 214 : 245, a = src[i * 4 + 3] / 255; for (let c = 0; c < 3; c++) o[i * 4 + c] = Math.round(src[i * 4 + c] * a + bg * (1 - a)); o[i * 4 + 3] = 255; } return o; };
const crop = (src, [x0, y0, x1, y1], s = 1) => { const w = (x1 - x0) * s, h = (y1 - y0) * s, o = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const j = ((y0 + ((y / s) | 0)) * W + x0 + ((x / s) | 0)) * 4; o.set(src.subarray(j, j + 4), (y * w + x) * 4); } return { w, h, px: o }; };
const down = (img, w2, h2) => { const o = new Uint8ClampedArray(w2 * h2 * 4), sx = img.w / w2, sy = img.h / h2; for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) { const a = [0, 0, 0, 0]; let c = 0; for (let yy = Math.floor(y * sy); yy < Math.floor((y + 1) * sy); yy++) for (let xx = Math.floor(x * sx); xx < Math.floor((x + 1) * sx); xx++) { for (let k = 0; k < 4; k++) a[k] += img.px[(yy * img.w + xx) * 4 + k]; c++; } for (let k = 0; k < 4; k++) o[(y * w2 + x) * 4 + k] = Math.round(a[k] / c); } return { w: w2, h: h2, px: o }; };
function grid(tiles, cols, gap = 12) {
  const w = Math.max(...tiles.map((t) => t.w)), h = Math.max(...tiles.map((t) => t.h)), rows = Math.ceil(tiles.length / cols), Wd = cols * w + (cols - 1) * gap, Hd = rows * h + (rows - 1) * gap, o = new Uint8ClampedArray(Wd * Hd * 4).fill(255);
  tiles.forEach((t, k) => { const ox = (k % cols) * (w + gap), oy = Math.floor(k / cols) * (h + gap); for (let y = 0; y < t.h; y++) o.set(t.px.subarray(y * t.w * 4, (y + 1) * t.w * 4), ((oy + y) * Wd + ox) * 4); });
  return { w: Wd, h: Hd, px: o };
}
/** The base's outer edge (alpha crosses 128) drawn as a 1 px cyan line onto a flattened image — a visual difference aid only. */
function outline(flatPx, alphaPx, rgb = [230, 0, 140]) { const o = new Uint8ClampedArray(flatPx), inside = (i) => alphaPx[i * 4 + 3] >= 128; for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) { const i = y * W + x; if (!inside(i)) continue; let edge = false; for (let d = 1; d <= 2 && !edge; d++) edge = !inside(i - d) || !inside(i + d) || !inside(i - d * W) || !inside(i + d * W); if (edge) o.set(rgb, i * 4); } return o; }

export function writeReview(pack, OUT) {
  const files = {}, save = (n, img) => { const b = encodePng(img.w, img.h, img.px); writeFileSync(join(OUT, n), b); files[n] = { sha256: sha(b), w: img.w, h: img.h }; };
  const NS = decodePng(rel("assets/avatar/reference/Northstar Master v2.png")).px, nsF = flat(NS);   // shown beside the result only
  const HB = pack.spec.headBox, T = pack.spec.tokens;
  const head = (opt) => flat(composeHead(colourLayers(pack, opt)));
  const main = head({});
  save("01-northstar-vs-r3-same-head-size.png", grid([crop(nsF, HB), crop(main, HB)], 2));
  save("02-r3-with-and-without-hair.png", grid([crop(main, HB), crop(head({ withHair: false }), HB)], 2));
  const EAR_L = [326, 276, 416, 396], EAR_R = [608, 276, 698, 396], JAW = [440, 396, 584, 486], NAPE = [576, 352, 676, 432];
  save("03a-ears-x3.png", grid([crop(nsF, EAR_L, 3), crop(main, EAR_L, 3), crop(nsF, EAR_R, 3), crop(main, EAR_R, 3)], 4));
  save("03b-jaw-neck-x3.png", grid([crop(nsF, JAW, 3), crop(main, JAW, 3)], 2));
  save("03c-nape-lock-x4.png", grid([crop(nsF, NAPE, 4), crop(main, NAPE, 4), crop(checker(pack.lockPx), NAPE, 4)], 3));
  const EYES = [392, 262, 632, 372];
  save("04-iris-brown-blue-green-x2.png", grid(["brown", "blue", "green"].map((k) => crop(head({ iris: T.iris[k].rgb }), EYES, 2)), 1));
  save("05-hair-eight-colours.png", grid(Object.keys(HAIR_COLOR_TOKENS).map((k) => down(crop(head({ hair: k }), HB), 275, 260)), 4));
  for (const [w, h] of [[360, 540], [180, 270]]) save(`06-display-${w}x${h}.png`, grid([down({ w: W, h: H, px: nsF }, w, h), down({ w: W, h: H, px: main }, w, h)], 2));
  save("07-skin-medium-light-dark.png", grid(["medium", "light", "dark"].map((k) => down(crop(head({ skin: T.skin[k].rgb }), HB), 366, 346)), 3));
  const c = (px) => crop(checker(px), HB);
  save("08-layers-on-checker.png", grid([c(HN.renderSkin(pack.base.built.lum, pack.base.built.ink, T.skin.medium.rgb, pack.base.spec.palette.skinWarmth)), c(pack.face.facePx), c(composeHead({ eyesIris: tintIris(pack.eyes.irisPx, T.iris.brown.rgb), eyesFixed: pack.eyes.fixedPx })), c(applyTonalRampB(pack.hairPx, HAIR_COLOR_TOKENS.brown))], 2));
  save("09-shape-differences-r3-outline-on-northstar.png", grid([crop(outline(nsF, pack.base.built.lum), HB), crop(outline(main, pack.base.built.lum), HB)], 2));
  return files;
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export function reportHtml(pack, files, extra = {}) {
  const st = (c) => (c.ok === true ? "BESTÅET" : c.ok === false ? "FEJL" : "IKKE ANVENDELIG");
  const rows = pack.checks.checks.map((c) => `<tr class="${c.ok === false ? "bad" : c.ok === null ? "na" : "ok"}"><td>${esc(c.id)}</td><td>${esc(c.kind)}</td><td>${st(c)}</td><td>${esc(c.name ?? "")}</td><td><code>${esc(typeof c.value === "string" ? c.value : JSON.stringify(c.value))}</code></td></tr>`).join("");
  const fig = (n, cap) => `<figure><img src="${n}" alt="${esc(cap)}" loading="lazy"><figcaption>${esc(cap)}</figcaption></figure>`;
  const src = Object.entries(pack.spec.sources).map(([k, s]) => `<tr><td>${esc(k)}</td><td><code>${esc(s.file ?? "—")}</code></td><td><code>${esc(s.sha256.slice(0, 12))}…</code></td><td>${esc(s.status)}</td></tr>`).join("");
  return `<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>R3 hovedreview</title>
<style>:root{--bg:#fbfaf7;--fg:#1d1b18;--mut:#6b655c;--line:#e3ddd2;--ok:#1f7a3d;--bad:#b3261e;--na:#8a6d00;--card:#fff}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#17150f;--fg:#ece7dd;--mut:#a39c90;--line:#3a352c;--ok:#5cc27e;--bad:#ff8a80;--na:#e0c060;--card:#211e17}}
:root[data-theme="dark"]{--bg:#17150f;--fg:#ece7dd;--mut:#a39c90;--line:#3a352c;--ok:#5cc27e;--bad:#ff8a80;--na:#e0c060;--card:#211e17}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}main{max-width:1100px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:26px;margin:0 0 4px}h2{font-size:19px;margin:36px 0 10px;border-bottom:1px solid var(--line);padding-bottom:6px}.lede{color:var(--mut);margin:0 0 18px}
figure{margin:14px 0 22px;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px}figure img{display:block;max-width:100%;height:auto;margin:0 auto;image-rendering:auto}figcaption{color:var(--mut);font-size:13px;margin-top:8px}
table{border-collapse:collapse;width:100%;font-size:13px}td,th{border-bottom:1px solid var(--line);padding:5px 6px;text-align:left;vertical-align:top}code{font-size:12px;word-break:break-all}.tw{overflow-x:auto}
tr.ok td:nth-child(3){color:var(--ok);font-weight:600}tr.bad td:nth-child(3){color:var(--bad);font-weight:700}tr.na td:nth-child(3){color:var(--na);font-weight:600}
.tags span{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:2px 10px;margin:2px 4px 2px 0;font-size:13px}ul{padding-left:20px}</style></head><body><main>
<h1>R3-hoved — samlet visuelt review</h1>
<p class="lede">Reviewpakke ${esc(pack.spec.id)} (${esc(pack.spec.decision)}). Kun til ejerens visuelle vurdering — ingen godkendelse, ingen promotion, ingen runtime. R3 forbliver default OFF.</p>
<div class="tags"><span>hud: medium (vedtaget)</span><span>iris: brun (vedtaget)</span><span>hår: brun (rampe B)</span><span>ansigtsdele: UDKAST</span><span>øjne: prototype v5</span><span>nakkelok: UDKAST</span></div>
<h2>Northstar og R3 ved samme hovedstørrelse</h2>${fig("01-northstar-vs-r3-same-head-size.png", "Venstre: Northstar (kun reference). Højre: R3-hovedet — samme lærred, samme udsnit, samme skala.")}
${fig("09-shape-differences-r3-outline-on-northstar.png", "R3-hovedets ydre kontur (magenta, 2 px) lagt over Northstar og over R3 — viser formforskellene (kæbe, ører, hals) som åbne reviewpunkter. Geometrien er den godkendte G1V3/E2/K4 og er ikke justeret.")}
<h2>Med og uden hår</h2>${fig("02-r3-with-and-without-hair.png", "Venstre: med hår. Højre: samme hoved uden hår (underlag, ansigtsdele og øjne).")}
<h2>Overgange</h2>${fig("03a-ears-x3.png", "Ører ×3: Northstar venstre øre · R3 · Northstar højre øre · R3.")}${fig("03b-jaw-neck-x3.png", "Kæbe og hals ×3: Northstar · R3.")}${fig("03c-nape-lock-x4.png", "Nakkelok ×4: Northstar · R3 · nakkelokken alene på tern (bag hoved og øre).")}
<h2>Iris</h2>${fig("04-iris-brown-blue-green-x2.png", "Øjne ×2 med brun (vedtaget R3_IRIS_DEFAULT), blå og grøn (reviewfarver fra v5, ikke vedtaget).")}
<h2>Otte hårfarver</h2>${fig("05-hair-eight-colours.png", "HAIR_COLOR_TOKENS gennem rampe B: " + Object.keys(HAIR_COLOR_TOKENS).join(", ") + ".")}
<h2>Visningsstørrelser</h2>${fig("06-display-360x540.png", "360×540: Northstar · R3 (hele lærredet nedskaleret; R3 har ingen krop).")}${fig("06-display-180x270.png", "180×270: Northstar · R3.")}
<h2>Hudtoner</h2>${fig("07-skin-medium-light-dark.png", "Medium (vedtaget, hovedresultat) · lys (FORSLAG) · mørk (FORSLAG) — samme luminanslag, ingen ny tegning.")}
<h2>Lagene</h2>${fig("08-layers-on-checker.png", "Underlag · ansigtsdele · øjne (iris + fast lag) · hår med nakkelok — hver for sig på tern.")}
<h2>Hvad er hvad</h2><ul>
<li><b>Godkendt geometrigrundlag:</b> G1V3 + E2 + K4 (hoved), D-164's ansigtsmål, D-169/D-174's mål — uændret.</li>
<li><b>Ændret frisure:</b> D-185's hybridafledning af D-183-arket (kortere øreovergange end Northstar) + nakkelokken (D-187, UDKAST, kun i billedets højre side som i Northstar).</li>
<li><b>Fortsatte forskelle fra Northstar (se konturbilledet):</b> kæbe og hage følger Northstar tæt; R3's ører er mindre og slutter højere; N1-halsen svajer ud forneden, hvor Northstars hals fortsætter lige ned i kraven; håret er mørkere og køligere brunt (rampe B-token) og mangler sidelokkerne under venstre øre; huden har ikke Northstars varme skygge under pandehåret; næsen er en enkelt streg; ansigtsdele, næse og øjne er foreløbige.</li></ul>
<h2>Kontroller</h2><p class="lede">Første fejl: ${esc(pack.checks.firstFailure ?? "ingen")}.</p><div class="tw"><table><thead><tr><th>Id</th><th>Art</th><th>Resultat</th><th>Hvad</th><th>Værdi</th></tr></thead><tbody>${rows}</tbody></table></div>
<h2>Kilder</h2><div class="tw"><table><thead><tr><th>Kilde</th><th>Fil</th><th>sha256</th><th>Status</th></tr></thead><tbody>${src}</tbody></table></div>
<h2>Genbygning</h2><p><code>node tools/avatar/r3-review-pack.mjs --out &lt;tom mappe&gt; [--render-eyes]</code></p>
<p class="lede">${esc(extra.eyes ?? "Øjenlagene er de fastlåste render af de versionsstyrede SVG'er.")}</p>
</main></body></html>
`;
}

// ── CLI ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export const VARIANTS = Object.freeze(["d187", "northstar-layers", "both", "northstar-head", "northstar-brow"]);
/** D-190: writes the northstar-brow review variant (the D-158-mirrored left brow on the unchanged D-189 baseline). */
export async function writeNorthstarBrowVariant(OUT) {
  const RV = await import("./r3-review-northstar-brow.mjs");
  const variant = RV.buildVariant(), written = RV.writeVariantReview(variant, OUT);
  writeFileSync(join(OUT, "report.html"), RV.variantReportHtml(variant));
  writeFileSync(join(OUT, "report.json"), JSON.stringify({ variant: RV.VARIANT, decision: "D-190", status: variant.tracked.man.status, headPixelSha256: written.headPixelSha256, checks: variant.checks, files: written.files }, null, 2) + "\n");
  return variant;
}
/** D-189: writes the northstar-head review variant (reconstructed head + cleaned feature edges on the unchanged D-188 baseline). */
export async function writeNorthstarHeadVariant(OUT) {
  const RV = await import("./r3-review-northstar-head.mjs");
  const variant = RV.buildVariant(), ns = decodePng(rel("assets/avatar/reference/Northstar Master v2.png")).px;
  const written = RV.writeVariantReview(variant, OUT, ns);
  writeFileSync(join(OUT, "report.html"), RV.variantReportHtml(variant));
  writeFileSync(join(OUT, "report.json"), JSON.stringify({ variant: RV.VARIANT, decision: "D-189", status: variant.tracked.man.status, compositeOrder: variant.tracked.man.compositeOrder, headPixelSha256: written.headPixelSha256, checks: variant.checks, files: written.files }, null, 2) + "\n");
  return variant;
}
/** D-188: writes the northstar-layers review variant (images, report.html, report.json) into OUT, beside this pack's head. */
export async function writeNorthstarLayersVariant(OUT, pack = buildPack()) {
  const RV = await import("./r3-review-northstar-layers.mjs");
  const variant = RV.buildVariant(), ns = decodePng(rel("assets/avatar/reference/Northstar Master v2.png")).px;
  const written = RV.writeVariantReview(variant, OUT, composeHead(colourLayers(pack)), ns);
  writeFileSync(join(OUT, "report.html"), RV.variantReportHtml(variant, written));
  writeFileSync(join(OUT, "report.json"), JSON.stringify({ variant: RV.VARIANT, decision: "D-188", status: variant.tracked.man.status, compositeOrder: variant.tracked.man.compositeOrder, headPixelSha256: written.headPixelSha256, checks: variant.checks, files: written.files }, null, 2) + "\n");
  return variant;
}

const invokedDirectly = typeof process.argv[1] === "string" && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  const args = process.argv.slice(2), arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const outDir = arg("--out"); if (!outDir) throw new Error("usage: --out <empty dir> [--render-eyes] [--variant d187|northstar-layers|both|northstar-head|northstar-brow]");
  const variant = arg("--variant") ?? "d187"; if (!VARIANTS.includes(variant)) throw new Error(`--variant must be one of ${VARIANTS.join(", ")}`);
  const ROOT = resolve(outDir); if (existsSync(ROOT) && readdirSync(ROOT).length) throw new Error("output directory not empty"); mkdirSync(ROOT, { recursive: true });
  if (variant === "northstar-brow") {
    const v = await writeNorthstarBrowVariant(ROOT);
    console.log(JSON.stringify({ variant, firstFailure: v.checks.firstFailure, failed: v.checks.checks.filter((c) => c.ok === false).map((c) => c.id) }, null, 1));
    if (v.checks.firstFailure) process.exitCode = 1;
  }
  if (variant === "northstar-head") {
    const v = await writeNorthstarHeadVariant(ROOT);
    console.log(JSON.stringify({ variant, firstFailure: v.checks.firstFailure, failed: v.checks.checks.filter((c) => c.ok === false).map((c) => c.id) }, null, 1));
    if (v.checks.firstFailure) process.exitCode = 1;
  }
  const pack = variant === "northstar-head" || variant === "northstar-brow" ? null : buildPack();
  if (variant === "northstar-layers" || variant === "both") {
    const NOUT = variant === "both" ? join(ROOT, "northstar-layers") : ROOT; mkdirSync(NOUT, { recursive: true });
    const v = await writeNorthstarLayersVariant(NOUT, pack);
    console.log(JSON.stringify({ variant: "northstar-layers", firstFailure: v.checks.firstFailure, failed: v.checks.checks.filter((c) => c.ok === false).map((c) => c.id) }, null, 1));
    if (v.checks.firstFailure) process.exitCode = 1;
  }
  if (variant === "d187" || variant === "both") {
    const OUT = variant === "both" ? join(ROOT, "d187") : ROOT; mkdirSync(OUT, { recursive: true });
    let eyesNote = "Øjenlagene er de fastlåste render af de versionsstyrede SVG'er (ikke genrenderet i denne kørsel).";
    if (args.includes("--render-eyes")) {
      const r = await renderEyes(pack.bufs), same = pixelSha256(r.fixedPx) === pixelSha256(pack.eyes.fixedPx) && pixelSha256(r.irisPx) === pixelSha256(pack.eyes.irisPx);
      eyesNote = same ? "--render-eyes: begge SVG'er genrenderet med Chromium — pixel-identiske med de fastlåste lag." : "--render-eyes: genrenderingen AFVIGER fra de fastlåste lag (renderer-forskel); de fastlåste lag er brugt.";
      if (!same) process.exitCode = 1;
    }
    const layers = { "base-medium": HN.renderSkin(pack.base.built.lum, pack.base.built.ink, pack.spec.tokens.skin.medium.rgb, pack.base.spec.palette.skinWarmth), "nape-lock": pack.lockPx, "hair-merged": pack.hairPx, face: pack.face.facePx, "head-medium-brown": composeHead(colourLayers(pack)) };
    const pins = {}; for (const [k, px] of Object.entries(layers)) { writeFileSync(join(OUT, `layer-${k}-1024x1536.png`), encodePng(W, H, px)); pins[k] = pixelSha256(px); }
    const files = writeReview(pack, OUT);
    writeFileSync(join(OUT, "report.html"), reportHtml(pack, files, { eyes: eyesNote }));
    writeFileSync(join(OUT, "report.json"), JSON.stringify({ id: pack.spec.id, mode: REVIEW_MODE, layerOrder: LAYER_ORDER, pixelSha256: pins, checks: pack.checks, files, eyes: eyesNote }, null, 2) + "\n");
    console.log(JSON.stringify({ firstFailure: pack.checks.firstFailure, failed: pack.checks.checks.filter((c) => c.ok === false).map((c) => c.id), pixelSha256: pins, eyes: eyesNote }, null, 1));
    if (pack.checks.firstFailure) process.exitCode = 1;
  }
}
