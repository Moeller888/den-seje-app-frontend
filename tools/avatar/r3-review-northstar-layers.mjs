// R3 REVIEW VARIANT "northstar-layers" (D-188). Rebuilds the Northstar v2 layer split (r3-northstar-layers.mjs), checks it
// against its tracked pins and the original, and writes the owner-review images and report beside the D-187 candidate.
// REVIEW ONLY: Northstar v2 pixels are a direct source for this variant alone; nothing here is approved or promotable, the
// colour studies are proposals (not tokens, not a runtime method), and a good default image is not evidence that other
// hairstyles, skin tones or expressions work. No H1, no image call, no runtime change; R3 stays default OFF.
// Entry: node tools/avatar/r3-review-pack.mjs --variant northstar-layers --out <empty dir>   (or --variant both)
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { encodePng, decodePng, pixelSha256 } from "./r3-hair-tool-v2.mjs";
import * as NL from "./r3-northstar-layers.mjs";

const W = 1024, H = 1536, N = W * H;
const sha = (b) => createHash("sha256").update(b).digest("hex");
const lumY = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
export const VARIANT = "northstar-layers";
export const HEAD_BOX = Object.freeze([240, 0, 790, 520]);

// ── build + checks ──────────────────────────────────────────────────────────────────────────────────────────────
export function buildVariant() {
  const tracked = NL.loadTracked(), build = NL.buildLayers(), spec = NL.loadSpec();
  return { tracked, build, spec, checks: runVariantChecks({ tracked, build, spec }) };
}

/** Checks that apply to an original-pixel layer split, plus the D-187 checks marked NOT APPLICABLE with the reason. */
export function runVariantChecks({ tracked, build, spec }) {
  const out = [], add = (id, kind, ok, value, name) => out.push({ id, kind, ok, value, name }), man = tracked.man;
  add("SRC", "binding", true, NL.SOURCE.sha256, "the source is the tracked Northstar Master v2 with its pinned sha256 (loadSource throws otherwise); never H1");
  add("SPEC", "binding", tracked.specSha256 === man.spec.sha256 && man.spec.sha256 === man.move.prototypeFileSha256["spec.json"], tracked.specSha256, "the spec is the tracked byte copy of the prototype spec (sha256 equal to the prototype file)");
  const layerPins = {}, maskPins = {}; let layersOk = true, masksOk = true;
  for (const k of NL.COMPOSITE_ORDER) { const got = pixelSha256(build.layers[k]), file = pixelSha256(decodePng(tracked.files[k]).px); layerPins[k] = got === man.layers[k].pixelSha256 && file === got; layersOk &&= layerPins[k]; }
  for (const k of NL.MASKS) { const got = pixelSha256(build.masks[k]), file = pixelSha256(decodePng(tracked.files[k]).px); maskPins[k] = got === man.masks[k].pixelSha256 && file === got; masksOk &&= maskPins[k]; }
  add("REBUILD-LAYERS", "binding", layersOk, layerPins, "every compositing layer rebuilt from the source equals its tracked file and manifest pixel hash");
  add("REBUILD-MASKS", "binding", masksOk, maskPins, "every mask rebuilt from the source equals its tracked file and manifest pixel hash");
  add("HELPER-FACE", "binding", pixelSha256(build.helper.face) === man.helperExports.face.pixelSha256 && refuses(() => NL.composeHead({ ...build.layers, face: build.helper.face })), { pixelSha256: pixelSha256(build.helper.face), composeRefusesIt: true }, "the face export is a helper: it is never composed over the four face parts");
  add("COMPARISON-BODY", "binding", pixelSha256(build.comparisonOnly.body) === man.comparisonOnly.body.pixelSha256 && !NL.COMPOSITE_ORDER.includes("body") && refuses(() => NL.composeHead({ ...build.layers, body: build.comparisonOnly.body })) && !man.layers.body, { notACompositingLayer: true, notTracked: !man.layers.body }, "the body is rebuilt only for the comparison with the original; it is not an R3 layer and not an R3 body asset");
  const comp = NL.composeOriginalComparison(build), dev = NL.deviation(build.src, comp);
  add("COMPOSITE-DEVIATION", "binding", JSON.stringify(dev) === JSON.stringify(man.composite.deviationFromOriginal) && pixelSha256(comp) === man.composite.withComparisonBodyPixelSha256, dev, "the default composite (original colours) reproduces the recorded deviation from Northstar exactly (a pin of the measured result, not a tolerance)");
  add("LAYER-ORDER", "binding", JSON.stringify(NL.COMPOSITE_ORDER) === JSON.stringify(man.compositeOrder), NL.COMPOSITE_ORDER, "back to front: skin < hair shadow < brows, nose, mouth < iris < eyes-fixed < hair");
  // overlaps: only opaque pixels may be duplicated into two layers (else alpha doubles)
  let overlapSoft = 0; for (const k of ["overlap-ink-hair-features", "overlap-ink-hair-skin"]) for (let i = 0; i < N; i++) if (build.masks[k][i * 4 + 3] && build.src[i * 4 + 3] < 250) overlapSoft++;
  add("OVERLAP-OPAQUE", "binding", overlapSoft === 0, { softPxInOverlap: overlapSoft }, "shared ink lies in two layers only where the original is opaque (alpha >= 250)");
  // no doubled features: no ink in the skin layer inside the feature zones, no sclera white in the skin inside the eyes
  const zones = {}; for (const z of NL.ZONES) zones[z] = NL.polyMask(spec.zones[z]);
  const sk = build.layers.skin, inkInSkin = {}; let ink = 0;
  for (const z of NL.ZONES) { let n = 0; for (let i = 0; i < N; i++) if (zones[z][i] && sk[i * 4 + 3] >= 128 && lumY(sk[i * 4], sk[i * 4 + 1], sk[i * 4 + 2]) < 90) n++; inkInSkin[z] = n; ink += n; }
  let white = 0; for (const z of ["eyeL", "eyeR"]) for (let i = 0; i < N; i++) if (zones[z][i] && sk[i * 4 + 3] >= 128 && NL.cls(sk[i * 4], sk[i * 4 + 1], sk[i * 4 + 2], 255) === "W") white++;
  add("NO-DOUBLE-FEATURES", "binding", ink === 0 && white === 0, { inkPxInSkinByZone: inkInSkin, scleraWhitePxInSkin: white }, "the skin layer holds no eye, brow, nose or mouth ink and no sclera inside the feature zones: the features exist once, in their own layers");
  // opaque light-skin pixels inside the non-skin layers (a measured finding, reported — not a pass/fail gate)
  const plates = {}; for (const k of [...NL.FACE_PARTS, "eyesFixed", "hairShadow"]) { let n = 0; const p = build.layers[k]; for (let i = 0; i < N; i++) if (p[i * 4 + 3] >= 250 && NL.cls(p[i * 4], p[i * 4 + 1], p[i * 4 + 2], 255) === "S") n++; plates[k] = n; }
  add("OPAQUE-LIGHT-PX", "diagnostic", true, plates, "opaque light-skin-coloured pixels in non-skin layers. Brows, nose, mouth: the original's light sharpening halo where the skin's red channel is already ~249-255, so the exact lift needs alpha 1 — correct over this skin, visible as pale specks on another skin tone (open defect). Eyes-fixed: the pinkish sclera top inside the eye opening (eye content). Hair shadow: lit edge pixels of the shadow layer");
  add("PROMOTION", "binding", NL.promotionStatus().promotable === false && refuses(() => NL.promote()), NL.promotionStatus(), "the variant cannot be promoted by this tool, whatever its checks say");
  const s = build.stats;
  add("RECONSTRUCTED", "diagnostic", true, { skinUnderFeaturesPx: Object.values(s.zones).reduce((a, z) => a + z.reconstructedSkinPx, 0), highlightPxLiftedOffIris: (s.highlightL ?? 0) + (s.highlightR ?? 0), litSkinUnderHairShadowPx: s.hairShadowPx, haloLiftedPx: s.halo.px }, "reconstructed (not observed) pixels, each recorded in a mask");
  let missing = 0; for (let i = 0; i < N; i++) if (build.masks["missing-under-hair"][i * 4 + 3]) missing++;
  add("MISSING-UNDER-HAIR", "diagnostic", true, { px: missing }, "everything under the hair is MISSING, not reconstructed: cranium, forehead, temples, ear tops, the hidden brow end and the head contour");
  let stray = 0; const [hx0, hy0, hx1, hy1] = HEAD_BOX; for (const k of NL.COMPOSITE_ORDER) for (let i = 0; i < N; i++) { if (!build.layers[k][i * 4 + 3]) continue; const x = i % W, y = (i / W) | 0; if (x < hx0 || x >= hx1 || y < hy0 || y >= hy1) stray++; }
  add("TRANSPARENCY", "diagnostic", true, { pxOutsideHeadBox: stray, headBox: HEAD_BOX }, "pixels of the head layers outside D-187's head box (Northstar's own hair and neck extent; reported, not clipped)");
  for (const [id, why] of NOT_APPLICABLE) add(id, "not applicable", null, "IKKE ANVENDELIG", why);
  return { checks: out, firstFailure: out.find((c) => c.ok === false)?.id ?? null };
}
const refuses = (f) => { try { f(); return false; } catch { return true; } };
export const NOT_APPLICABLE = Object.freeze([
  ["BASE-REBUILD / D-186 underlay checks", "they verify the deterministic G1V3 + E2 + K4 underlay; this variant keeps Northstar's own head, ears and neck and is not deformed to that geometry"],
  ["HAIR-REBUILD / HP-LOCK", "they verify D-185's hybrid derivation of the generated D-183 sheet; this variant's hair is Northstar's own painted hair"],
  ["HP4–HP8 / HP-FRAG (D-179 placed hair checks)", "they measure hair placed on R3's hair targets and seat (A4, A9, A10, crown zone); Northstar's hair is not registered to those targets, and moving it to them would deform the original"],
  ["NL-BEHIND / NL-ROOT / NL-EXTENT / NL-LUMINANCE", "they check D-187's DRAFT nape lock; Northstar's own sideburns and lock below the right ear are kept as painted"],
  ["FACE-NEUTRAL auto checks / FACE-FITS", "they check an authored face layer fitted to the D-164 targets; this variant's brows, nose and mouth are Northstar's own pixels in place"],
  ["EYES-ENVELOPE", "the D-159 envelope was drawn for R3's own eye geometry; Northstar's original eyes are larger and are not resized to it"],
  ["EYES-IRIS-LUMINANCE", "D-136 expects an achromatic iris layer; this variant keeps the original-coloured iris as its default path, and any recolouring is a proposal only"],
  ["BASE skin-token rendering (ramp B, skin tokens)", "D-187 colours luminance layers with tokens; this variant's default is the original colours and no token method is adopted for it"],
]);

// ── colour studies (PROPOSALS only) ─────────────────────────────────────────────────────────────────────────────
const toLin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const toSrgb = (v) => Math.round(255 * Math.min(1, Math.max(0, v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)));
export function oklab(r, g, b) { r = toLin(r); g = toLin(g); b = toLin(b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]; }
export function fromOklab(L, a, b) { const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)]; }
/** OKLab study: lightness through a monotonic map, chroma scaled, hue turned by a fixed angle (local hue variation kept). */
export function oklabShift(P, { dh, cScale, lMap }) { const o = P.slice(); for (let i = 0; i < N; i++) { if (!P[i * 4 + 3]) continue; const [L, a, b] = oklab(P[i * 4], P[i * 4 + 1], P[i * 4 + 2]); const C = Math.hypot(a, b) * cScale, h = Math.atan2(b, a) + dh * Math.PI / 180; const c = fromOklab(lMap(L), C * Math.cos(h), C * Math.sin(h)); o[i * 4] = c[0]; o[i * 4 + 1] = c[1]; o[i * 4 + 2] = c[2]; } return o; }
/** For comparison: achromatic luminance (normalised to the layer's p99) x token. */
export function lumTimesToken(P, token) { const ys = []; for (let i = 0; i < N; i++) if (P[i * 4 + 3] > 128) ys.push(0.2126 * P[i * 4] + 0.7152 * P[i * 4 + 1] + 0.0722 * P[i * 4 + 2]); ys.sort((a, b) => a - b); const p99 = ys[Math.floor(ys.length * 0.99)] || 255;
  const o = P.slice(); for (let i = 0; i < N; i++) { if (!P[i * 4 + 3]) continue; const y = Math.min(1, (0.2126 * P[i * 4] + 0.7152 * P[i * 4 + 1] + 0.0722 * P[i * 4 + 2]) / p99); for (let c = 0; c < 3; c++) o[i * 4 + c] = Math.round(y * token[c]); } return o; }
export function meanHue(P) { let sa = 0, sb = 0; for (let i = 0; i < N; i++) { if (P[i * 4 + 3] < 200) continue; const [, a, b] = oklab(P[i * 4], P[i * 4 + 1], P[i * 4 + 2]); if (Math.hypot(a, b) > 0.03) { sa += a; sb += b; } } return Math.atan2(sb, sa) * 180 / Math.PI; }
export const STUDIES = Object.freeze({
  irisBlue: { label: "FORSLAG — blå iris (OKLab: lyshed bevaret, farvetone drejet til 250°, kroma × 0,9)", token: [58, 110, 190] },
  hairBlack: { label: "FORSLAG — sort-brunt hår (OKLab: lyshed 0,13 + (L − 0,13) × 0,62, kroma × 0,28)", token: [62, 56, 54] },
  skinDarkDiagnostic: { label: "DIAGNOSTIK — hudlaget mørkere (OKLab L × 0,55) for at vise trækkenes varme kantrand; ikke en hudtonemetode", token: null },
});

// ── review images ───────────────────────────────────────────────────────────────────────────────────────────────
const flat = (src, bg = [255, 255, 255]) => { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) { const a = src[i * 4 + 3] / 255; for (let c = 0; c < 3; c++) o[i * 4 + c] = Math.round(src[i * 4 + c] * a + bg[c] * (1 - a)); o[i * 4 + 3] = 255; } return o; };
const checker = (src) => { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0, bg = ((x >> 3) + (y >> 3)) & 1 ? 214 : 245, a = src[i * 4 + 3] / 255; for (let c = 0; c < 3; c++) o[i * 4 + c] = Math.round(src[i * 4 + c] * a + bg * (1 - a)); o[i * 4 + 3] = 255; } return o; };
const crop = (src, [x0, y0, x1, y1], s = 1) => { const w = (x1 - x0) * s, h = (y1 - y0) * s, o = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const j = ((y0 + ((y / s) | 0)) * W + x0 + ((x / s) | 0)) * 4; o.set(src.subarray(j, j + 4), (y * w + x) * 4); } return { w, h, px: o }; };
/** Area-weighted downscale of a flattened full canvas. */
function down(F, w2, h2) { const o = new Uint8ClampedArray(w2 * h2 * 4), sx = W / w2, sy = H / h2;
  for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) { const acc = [0, 0, 0]; let wt = 0;
    for (let yy = Math.floor(y * sy); yy < Math.ceil((y + 1) * sy); yy++) { const wy = Math.min(yy + 1, (y + 1) * sy) - Math.max(yy, y * sy); if (wy <= 0) continue;
      for (let xx = Math.floor(x * sx); xx < Math.ceil((x + 1) * sx); xx++) { const wx = Math.min(xx + 1, (x + 1) * sx) - Math.max(xx, x * sx); if (wx <= 0) continue; const k = wx * wy, j = (yy * W + xx) * 4; for (let c = 0; c < 3; c++) acc[c] += F[j + c] * k; wt += k; } }
    for (let c = 0; c < 3; c++) o[(y * w2 + x) * 4 + c] = Math.round(acc[c] / wt); o[(y * w2 + x) * 4 + 3] = 255; }
  return { w: w2, h: h2, px: o }; }
function grid(tiles, cols, gap = 10, bg = [255, 255, 255]) {
  const w = Math.max(...tiles.map((t) => t.w)), h = Math.max(...tiles.map((t) => t.h)), rows = Math.ceil(tiles.length / cols), Wd = cols * w + (cols - 1) * gap, Hd = rows * h + (rows - 1) * gap, o = new Uint8ClampedArray(Wd * Hd * 4);
  for (let i = 0; i < Wd * Hd; i++) { o.set(bg, i * 4); o[i * 4 + 3] = 255; }
  tiles.forEach((t, k) => { const ox = (k % cols) * (w + gap), oy = Math.floor(k / cols) * (h + gap); for (let y = 0; y < t.h; y++) o.set(t.px.subarray(y * t.w * 4, (y + 1) * t.w * 4), ((oy + y) * Wd + ox) * 4); });
  return { w: Wd, h: Hd, px: o };
}
const hatch = (P, mask, col = [70, 130, 230]) => { const o = P.slice(); for (let i = 0; i < N; i++) if (mask[i * 4 + 3]) { const x = i % W, y = (i / W) | 0; if (((x + y) >> 2) & 1) { o.set(col, i * 4); o[i * 4 + 3] = 255; } else if (!o[i * 4 + 3]) { o.set([225, 232, 248], i * 4); o[i * 4 + 3] = 255; } } return o; };
const box = (P, [x0, y0, x1, y1], col = [220, 20, 60]) => { const o = P.slice(); for (let x = x0; x <= x1; x++) for (const y of [y0, y0 + 1, y1 - 1, y1]) o.set([...col, 255], (y * W + x) * 4); for (let y = y0; y <= y1; y++) for (const x of [x0, x0 + 1, x1 - 1, x1]) o.set([...col, 255], (y * W + x) * 4); return o; };
const DARK = [38, 38, 46];

/** Writes the variant's review images into OUT. `d187Head` is D-187's composed head (medium, brown, brown) for the comparison. */
export function writeVariantReview(variant, OUT, d187Head, nsOriginal) {
  const files = {}, save = (n, img) => { const b = encodePng(img.w, img.h, img.px); writeFileSync(join(OUT, n), b); files[n] = { sha256: sha(b), w: img.w, h: img.h }; };
  const { build } = variant, Ly = build.layers, M = build.masks, HB = HEAD_BOX;
  const head = NL.composeHead(Ly), compare = NL.composeOriginalComparison(build);
  const nsF = flat(nsOriginal), d187F = flat(d187Head), headF = flat(head), cmpF = flat(compare);
  save("v01-northstar-d187-layers-same-size.png", grid([crop(nsF, HB), crop(d187F, HB), crop(headF, HB)], 3));
  for (const [w, h] of [[360, 540], [180, 270], [110, 165], [52, 78]]) save(`v02-display-${w}x${h}.png`, grid([down(nsF, w, h), down(d187F, w, h), down(cmpF, w, h)], 3));
  save("v02-display-180x270-dark.png", grid([down(flat(nsOriginal, DARK), 180, 270), down(flat(d187Head, DARK), 180, 270), down(flat(compare, DARK), 180, 270)], 3, 10, DARK));
  // difference
  const D = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) { let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(nsF[i * 4 + c] - cmpF[i * 4 + c])); const da = Math.abs(nsOriginal[i * 4 + 3] - compare[i * 4 + 3]); const v = Math.min(255, d * 16), va = Math.min(255, da * 16); D[i * 4] = 255 - va * 0.6; D[i * 4 + 1] = 255 - v; D[i * 4 + 2] = 255 - v; D[i * 4 + 3] = 255; }
  save("v03-difference-x16.png", grid([crop(nsF, HB), crop(cmpF, HB), crop(D, HB)], 3));
  save("v03-eyes-difference-x3.png", grid([crop(nsF, [395, 262, 625, 365], 3), crop(cmpF, [395, 262, 625, 365], 3), crop(D, [395, 262, 625, 365], 3)], 1));
  // layers alone
  const face = build.helper.face;
  save("v04-layers-alone.png", grid([crop(checker(Ly.skin), HB), crop(checker(Ly.hairShadow), HB), crop(checker(face), HB), crop(checker(Ly.iris), HB), crop(checker(Ly.eyesFixed), HB), crop(checker(Ly.hair), HB)], 3));
  save("v04-eyes-fixed-and-iris-x3.png", grid([crop(flat(Ly.eyesFixed, DARK), [395, 262, 625, 365], 3), crop(flat(Ly.iris, DARK), [395, 262, 625, 365], 3)], 1, 10, DARK));
  // functions
  const noHair = NL.composeHead(Ly, { include: NL.COMPOSITE_ORDER.filter((k) => k !== "hair" && k !== "hairShadow") });
  save("v05-without-hair.png", grid([crop(flat(noHair), HB), crop(flat(hatch(noHair, M["missing-under-hair"])), HB)], 2));
  const noFace = NL.composeHead(Ly, { include: NL.COMPOSITE_ORDER.filter((k) => !NL.FACE_PARTS.includes(k)) }), noFeat = NL.composeHead(Ly, { include: ["skin", "hairShadow", "hair"] });
  save("v05-without-face-parts-and-eyes.png", grid([crop(flat(noFace), HB), crop(flat(noFeat), HB)], 2));
  // colour studies — proposals
  const irisHue = meanHue(Ly.iris);
  const irisOk = oklabShift(Ly.iris, { dh: 250 - irisHue, cScale: 0.9, lMap: (L) => L }), irisMul = lumTimesToken(Ly.iris, STUDIES.irisBlue.token);
  const hairOk = oklabShift(Ly.hair, { dh: 0, cScale: 0.28, lMap: (L) => 0.13 + (L - 0.13) * 0.62 }), hairMul = lumTimesToken(Ly.hair, STUDIES.hairBlack.token);
  const w = (repl) => flat(NL.composeHead({ ...Ly, ...repl }));
  save("v06-FORSLAG-iris-original-oklab-lumxtoken-x3.png", grid([crop(headF, [415, 280, 610, 360], 3), crop(w({ iris: irisOk }), [415, 280, 610, 360], 3), crop(w({ iris: irisMul }), [415, 280, 610, 360], 3)], 3));
  save("v06-FORSLAG-hair-original-oklab-lumxtoken.png", grid([crop(headF, HB), crop(w({ hair: hairOk }), HB), crop(w({ hair: hairMul }), HB)], 3));
  // unresolved
  const U = {
    "head-and-forehead-under-hair": { img: hatch(noHair, M["missing-under-hair"]), b: [290, 30, 735, 300], s: 1 },
    "hidden-brow-end": { img: NL.composeHead(Ly, { include: ["skin", ...NL.FACE_PARTS] }), b: [452, 238, 492, 272], s: 4 },
    "ear-tops-under-sideburns": { img: hatch(noHair, M["missing-under-hair"]), b: [340, 255, 405, 345], s: 3 },
    "sclera-behind-iris": { img: NL.composeHead(Ly, { include: ["skin", "eyesFixed"] }), b: [415, 280, 485, 360], s: 3 },
    "reconstruction-under-highlight": { img: Ly.iris, b: [425, 290, 462, 325], s: 4 },
  };
  for (const [k, { img, b, s }] of Object.entries(U)) { const p = 24, bb = [b[0] - p, b[1] - p, b[2] + p, b[3] + p]; save(`v07-unresolved-${k}.png`, crop(flat(box(img, b)), bb, s)); }
  const skinDark = oklabShift(Ly.skin, { dh: 0, cScale: 1, lMap: (L) => L * 0.55 });
  save("v07-unresolved-warm-rims-on-changed-skin-x3.png", grid([crop(flat(NL.composeHead({ ...Ly })), [395, 240, 630, 405], 3), crop(flat(NL.composeHead({ ...Ly, skin: skinDark, hairShadow: oklabShift(Ly.hairShadow, { dh: 0, cScale: 1, lMap: (L) => L * 0.55 }) })), [395, 240, 630, 405], 3)], 1));
  // masks over the original
  const ov = (m, col) => { const o = flat(nsOriginal); for (let i = 0; i < N; i++) if (m[i * 4 + 3]) for (let c = 0; c < 3; c++) o[i * 4 + c] = Math.round(o[i * 4 + c] * 0.45 + col[c] * 0.55); return o; };
  save("v08-masks.png", grid([crop(flat(M.owners), HB), crop(ov(M.reconstructed, [255, 0, 200]), HB), crop(ov(M["missing-under-hair"], [0, 120, 255]), HB), crop(ov(M["shadow-lit-reconstructed"], [255, 140, 0]), HB), crop(ov(M["overlap-ink-hair-features"], [255, 200, 0]), HB), crop(ov(M["overlap-ink-hair-skin"], [255, 200, 0]), HB)], 3));
  return { files, irisHueDeg: +irisHue.toFixed(1), headPixelSha256: pixelSha256(head) };
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export function variantReportHtml(variant, written) {
  const st = (c) => (c.ok === true ? "BESTÅET" : c.ok === false ? "FEJL" : "IKKE ANVENDELIG");
  const rows = variant.checks.checks.map((c) => `<tr class="${c.ok === false ? "bad" : c.ok === null ? "na" : "ok"}"><td>${esc(c.id)}</td><td>${esc(c.kind)}</td><td>${st(c)}</td><td>${esc(c.name ?? "")}</td><td><code>${esc(typeof c.value === "string" ? c.value : JSON.stringify(c.value))}</code></td></tr>`).join("");
  const fig = (n, cap) => `<figure><img src="${n}" alt="${esc(cap)}" loading="lazy"><figcaption>${esc(cap)}</figcaption></figure>`;
  const dev = variant.tracked.man.composite.deviationFromOriginal;
  return `<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>R3 Northstar-lag</title>
<style>:root{--bg:#fbfaf7;--fg:#1d1b18;--mut:#6b655c;--line:#e3ddd2;--ok:#1f7a3d;--bad:#b3261e;--na:#8a6d00;--card:#fff}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#17150f;--fg:#ece7dd;--mut:#a39c90;--line:#3a352c;--ok:#5cc27e;--bad:#ff8a80;--na:#e0c060;--card:#211e17}}
:root[data-theme="dark"]{--bg:#17150f;--fg:#ece7dd;--mut:#a39c90;--line:#3a352c;--ok:#5cc27e;--bad:#ff8a80;--na:#e0c060;--card:#211e17}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}main{max-width:1100px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:26px;margin:0 0 4px}h2{font-size:19px;margin:36px 0 10px;border-bottom:1px solid var(--line);padding-bottom:6px}.lede{color:var(--mut);margin:0 0 18px}
figure{margin:14px 0 22px;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px;overflow-x:auto}figure img{display:block;max-width:none;margin:0 auto}figcaption{color:var(--mut);font-size:13px;margin-top:8px}
table{border-collapse:collapse;width:100%;font-size:13px}td,th{border-bottom:1px solid var(--line);padding:5px 6px;text-align:left;vertical-align:top}code{font-size:12px;word-break:break-all}.tw{overflow-x:auto}
tr.ok td:nth-child(3){color:var(--ok);font-weight:600}tr.bad td:nth-child(3){color:var(--bad);font-weight:700}tr.na td:nth-child(3){color:var(--na);font-weight:600}.warn{border-left:4px solid var(--na);padding:8px 12px;background:var(--card)}</style></head><body><main>
<h1>R3-reviewvariant: Northstar v2 i lag</h1>
<p class="lede">${esc(variant.tracked.man.status)}. Ejerreview alene: ingen produktionsgodkendelse, ingen promotion, ingen runtime. R3 forbliver default OFF.</p>
<p class="warn">Et godt standardbillede beviser ikke, at andre frisurer, hudtoner eller udtryk virker. Alt under håret mangler, og farveforslagene er undersøgelser.</p>
<h2>Northstar, D-187 og Northstar-lagene ved samme størrelse</h2>${fig("v01-northstar-d187-layers-same-size.png", "Venstre: Northstar v2 (original). Midt: D-187-kandidaten. Højre: Northstar-lagene sammensat i originalfarver (hovedlag uden krop).")}
<h2>Visningsstørrelser</h2>${["360x540", "180x270", "110x165", "52x78"].map((s) => fig(`v02-display-${s}.png`, `${s.replace("x", "×")}: Northstar · D-187 · Northstar-lag (med sammenligningskroppen, så hele figuren kan sammenlignes).`)).join("")}${fig("v02-display-180x270-dark.png", "180×270 på mørk baggrund.")}
<h2>Afvigelse fra originalen</h2>${fig("v03-difference-x16.png", "Original · lag · differens ×16 (rød = farve, lyserød = alfa).")}${fig("v03-eyes-difference-x3.png", "Øjne ×3: original, lag, differens ×16.")}
<p>Synlige pixels: ${dev.visiblePx}; bit-identiske: ${dev.bitIdenticalPx}; farveafvigelse 0 / 1–2 / 3–5 / &gt;5: ${dev.rgb["0"]} / ${dev.rgb["1-2"]} / ${dev.rgb["3-5"]} / ${dev.rgb["6-16"] + dev.rgb[">16"]}; alfa 0 / 1–2 / 3–5 / &gt;5: ${dev.alpha["0"]} / ${dev.alpha["1-2"]} / ${dev.alpha["3-5"]} / ${dev.alpha[">5"]}; max ${dev.maxRgb} / ${dev.maxAlpha}. Originalens figur har alfa 253–254; to lag oven på hinanden giver 255, og farven i trækkene afrundes over rekonstrueret hud — derfor 1–2 niveauer. De største (3–5) ligger på den dækkende kontur, der bevidst ligger i både hud- og hårlag ved bakkenbarterne.</p>
<h2>Lagene hver for sig</h2>${fig("v04-layers-alone.png", "Hud · hårskygge · ansigtstræk (hjælpeeksport) · iris · faste øjendele · hår — på tern.")}${fig("v04-eyes-fixed-and-iris-x3.png", "Faste øjendele og iris ×3 på mørk.")}
<h2>Funktioner</h2>${fig("v05-without-hair.png", "Uden hår; til højre er alt det skjulte skraveret som MANGLER.")}${fig("v05-without-face-parts-and-eyes.png", "Uden bryn, næse og mund · også uden øjne.")}
<h2>Farveforsøg — FORSLAG, ikke tokens eller runtime-metode</h2>${fig("v06-FORSLAG-iris-original-oklab-lumxtoken-x3.png", "Iris: original · OKLab-forslag · luminans × token (sammenligning). Standardvejen er altid originalfarverne.")}${fig("v06-FORSLAG-hair-original-oklab-lumxtoken.png", "Hår: original · OKLab-forslag · luminans × token. Brynene følger ikke hårfarven.")}
<h2>Uløste områder</h2>${fig("v07-unresolved-head-and-forehead-under-hair.png", "MANGLER: hoved, isse og pande under håret.")}${fig("v07-unresolved-hidden-brow-end.png", "MANGLER: venstre bryns skjulte ende og hårlokkens underkant.")}${fig("v07-unresolved-ear-tops-under-sideburns.png", "MANGLER: øretoppe under bakkenbarterne.")}${fig("v07-unresolved-sclera-behind-iris.png", "MANGLER: sclera bag irisen.")}${fig("v07-unresolved-reconstruction-under-highlight.png", "REKONSTRUERET: irisen under glanspunktet (glat udfyldning).")}${fig("v07-unresolved-warm-rims-on-changed-skin-x3.png", "DIAGNOSTIK: varme kantrande om trækkene, når huden ændres (øverst original hud, nederst mørkere hud).")}
<p>Fundet under integrationen (kontrol OPAQUE-LIGHT-PX): 83 dækkende, lyse glorie-pixels i bryn-, næse- og mundlagene (største sammenhængende gruppe: en række på 11 px langs højre bryns overkant). Originalens skærpningsglorie er lysere end huden, og hvor hudens rødkanal allerede er ~249–255, kræver en eksakt løftning alfa 1. Over denne hud er det korrekt; på en anden hudtone ses de som lyse prikker. Uløst.</p>
<h2>Masker</h2>${fig("v08-masks.png", "Ejerskab · rekonstrueret · mangler under hår · lys hud under hårskygge · overlap hår/træk · overlap hår/hud.")}
<h2>Kontroller</h2><p class="lede">Første fejl: ${esc(variant.checks.firstFailure ?? "ingen")}.</p><div class="tw"><table><thead><tr><th>Id</th><th>Art</th><th>Resultat</th><th>Hvad</th><th>Værdi</th></tr></thead><tbody>${rows}</tbody></table></div>
<h2>Kildekæde</h2><p>Kilde: <code>${esc(NL.SOURCE.file)}</code> sha256 <code>${esc(NL.SOURCE.sha256)}</code>. Spec, lag og masker: <code>${esc(NL.FIXTURES)}</code> (byte-kopier af prototypen; manifest-v1.json). Generator: <code>tools/avatar/r3-northstar-layers.mjs</code>. Genbygning: <code>node tools/avatar/r3-review-pack.mjs --variant northstar-layers --out &lt;tom mappe&gt;</code>.</p>
</main></body></html>
`;
}
