// R3 REVIEW VARIANT "northstar-head" (D-189). Rebuilds the reconstructed head and cleaned feature edges (r3-northstar-head.mjs)
// on the unchanged D-188 baseline, checks the edit bounds against D-188, pins the result, and writes the owner-review images and
// report beside Northstar and D-188. The cranium is RECONSTRUCTED DESIGN; nothing here is approved or promotable. The hidden brow
// end, the sclera behind the iris and new expressions stay open. No H1, no image call, no runtime change; R3 stays default OFF.
// Entry: node tools/avatar/r3-review-pack.mjs --variant northstar-head --out <empty dir>
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng, decodePng, pixelSha256 } from "./r3-hair-tool-v2.mjs";
import * as NL from "./r3-northstar-layers.mjs";
import * as HD from "./r3-northstar-head.mjs";

const W = 1024, H = 1536, N = W * H;
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const sha =(b) => createHash("sha256").update(b).digest("hex");
export const VARIANT = "northstar-head";
export const HEAD_BOX = Object.freeze([240, 0, 790, 520]);
const BALD = HD.COMPOSITE_ORDER.filter((k) => k !== "hair" && k !== "hairShadow");
/** Which mask may change which built layer (relative to D-188). The cranium is a new layer, bounded by its region. */
export const EDIT_MASK_OF = Object.freeze({ skin: "skin-to-hair", hair: "skin-to-hair", browL: "feature-edit", browR: "feature-edit", nose: "feature-edit", mouth: "feature-edit", cranium: "cranium-region" });

const flatPx = (P, i, c) => P[i * 4 + c] * P[i * 4 + 3] / 255 + 255 * (1 - P[i * 4 + 3] / 255);
/** Every change against D-188, by cause, plus the pixels that changed outside the explicit edit masks (per layer and in the composite). */
export function changeReport(build, body) {
  const M = build.masks, base = build.baseline, perLayerOutside = {};
  for (const [k, m] of Object.entries(EDIT_MASK_OF)) {
    let n = 0; const L = build.layers[k], B = k === "cranium" ? null : base[k];
    for (let i = 0; i < N; i++) { const changed = B ? (L[i * 4] !== B[i * 4] || L[i * 4 + 1] !== B[i * 4 + 1] || L[i * 4 + 2] !== B[i * 4 + 2] || L[i * 4 + 3] !== B[i * 4 + 3]) : L[i * 4 + 3] > 0; if (changed && !M[m][i * 4 + 3]) n++; }
    perLayerOutside[k] = n;
  }
  for (const k of HD.COMPOSITE_ORDER) if (!(k in EDIT_MASK_OF)) { let n = 0; const L = build.layers[k], B = base[k]; for (let i = 0; i < N * 4; i++) if (L[i] !== B[i]) { n++; break; } perLayerOutside[k] = n; }
  const before = NL.overStack([body, ...NL.COMPOSITE_ORDER.map((k) => base[k])]), after = HD.composeOriginalComparison(build, body);
  const byCause = {}, add = (k, d, da) => { const c = (byCause[k] ||= { px: 0, rgb: { "0": 0, "1-2": 0, "3-5": 0, "6-16": 0, ">16": 0 }, maxRgb: 0, maxAlpha: 0 }); c.px++; c.rgb[d === 0 ? "0" : d <= 2 ? "1-2" : d <= 5 ? "3-5" : d <= 16 ? "6-16" : ">16"]++; c.maxRgb = Math.max(c.maxRgb, d); c.maxAlpha = Math.max(c.maxAlpha, da); };
  let outside = 0; const hair = build.layers.hair, skin = build.layers.skin;
  for (let i = 0; i < N; i++) {
    let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(flatPx(before, i, c) - flatPx(after, i, c))); d = Math.round(d);
    const da = Math.abs(before[i * 4 + 3] - after[i * 4 + 3]); if (!d && !da) continue;
    if (M["feature-edit"][i * 4 + 3]) add("feature edges (shared hair ink removed, halo and rims re-projected)", d, da);
    else if (M["skin-to-hair"][i * 4 + 3]) add("hair-edge residue moved from skin to hair", d, da);
    else if (M["cranium-region"][i * 4 + 3]) add(hair[i * 4 + 3] >= 250 ? "cranium under opaque hair (hair alpha 253–254 lets 0.4–0.8 % through)" : hair[i * 4 + 3] > 0 ? "cranium under a SEMI-TRANSPARENT hair edge" : skin[i * 4 + 3] >= 250 ? "cranium under visible skin (skin alpha 253–254)" : "cranium with no cover", d, da);
    else outside++;
  }
  return { byCause, outsideEditMasksPx: outside, perLayerOutsideEditMaskPx: perLayerOutside };
}

export function buildVariant() {
  const tracked = HD.loadTracked(), build = HD.buildHead(), body = NL.buildLayers().comparisonOnly.body;
  return { tracked, build, body, checks: runVariantChecks({ tracked, build, body }) };
}

export function runVariantChecks({ tracked, build, body }) {
  const out = [], add = (id, kind, ok, value, name) => out.push({ id, kind, ok, value, name }), man = tracked.man;
  add("SRC", "binding", man.source.sha256 === NL.SOURCE.sha256, NL.SOURCE.sha256, "the source is the tracked Northstar Master v2 (loadSource throws otherwise); never H1");
  const d188ManifestSha256 = sha(readFileSync(join(REPO, ...NL.MANIFEST_FILE.split("/"))));
  add("BASELINE-D188", "binding", man.baseline.manifestSha256 === d188ManifestSha256 && man.baseline.headPixelSha256 === build.tracked.man.composite.headPixelSha256 && man.baseline.headPixelSha256 === pixelSha256(NL.composeHead(build.baseline)), { d188ManifestSha256, d188HeadPixelSha256: man.baseline.headPixelSha256 }, "the D-188 baseline is the merged one: its manifest bytes and its head composite are the recorded ones, and every D-188 file is read through its own pins (NL.loadTracked throws on any change)");
  const pins = {}; let ok = true;
  for (const k of HD.BUILT) { const got = pixelSha256(build.layers[k]), file = pixelSha256(decodePng(tracked.files[k]).px); pins[k] = got === man.layers[k].pixelSha256 && file === got; ok &&= pins[k]; }
  add("REBUILD-LAYERS", "binding", ok, pins, "every layer this variant builds equals its tracked file and manifest pixel hash");
  const mp = {}; let mok = true;
  for (const k of HD.MASKS) { const got = pixelSha256(build.masks[k]), file = pixelSha256(decodePng(tracked.files[k]).px); mp[k] = got === man.masks[k].pixelSha256 && file === got; mok &&= mp[k]; }
  add("REBUILD-MASKS", "binding", mok, mp, "every mask equals its tracked file and manifest pixel hash");
  const reusedOk = Object.entries(man.reusedFromD188).every(([k, e]) => pixelSha256(build.layers[k]) === e.pixelSha256 && e.pixelSha256 === build.tracked.man.layers[k].pixelSha256);
  add("REUSED-D188", "binding", reusedOk, Object.keys(man.reusedFromD188), "the hair shadow, iris and fixed eye parts are the D-188 files, pixel for pixel");
  const ch = changeReport(build, body);
  add("EDIT-BOUNDS", "binding", ch.outsideEditMasksPx === 0 && Object.values(ch.perLayerOutsideEditMaskPx).every((n) => n === 0), { compositeOutsideMasksPx: ch.outsideEditMasksPx, perLayer: ch.perLayerOutsideEditMaskPx }, "no pixel of any layer, and no pixel of the composite, changed outside the explicit edit masks (cranium-region, feature-edit, skin-to-hair)");
  const semi = Object.entries(ch.byCause).filter(([k]) => /SEMI-TRANSPARENT/.test(k)).reduce((s, [, v]) => s + v.px, 0);
  add("SEMI-TRANSPARENT-HAIR-EDGES", "diagnostic", true, { changedPx: semi }, "changed composite pixels under semi-transparent hair edges (the cranium lies inside the opaque hair; shown, not hidden in a mean)");
  add("CHANGES-VS-D188", "binding", JSON.stringify(ch) === JSON.stringify(man.changesVsD188), ch.byCause, "every change against D-188, by cause, equals the recorded report");
  const comp = HD.composeOriginalComparison(build, body), dev = NL.deviation(build.src, comp);
  add("COMPOSITE-DEVIATION", "binding", JSON.stringify(dev) === JSON.stringify(man.composite.deviationFromOriginal) && pixelSha256(comp) === man.composite.withComparisonBodyPixelSha256, dev, "the default composite's deviation from Northstar equals the recorded measurement (a pin, not a tolerance)");
  add("LAYER-ORDER", "binding", JSON.stringify(HD.COMPOSITE_ORDER) === JSON.stringify(man.compositeOrder) && HD.COMPOSITE_ORDER[0] === "cranium", HD.COMPOSITE_ORDER, "cranium < skin < hair shadow < brows, nose, mouth < iris < eyes-fixed < hair");
  const bald = HD.composeHead(build.layers, { include: BALD });
  add("BALD-WITHOUT-HAIR-SHADOW", "binding", pixelSha256(bald) === man.composite.baldHeadPixelSha256 && !BALD.includes("hairShadow"), { baldHeadPixelSha256: pixelSha256(bald) }, "the bare head is composed without the hair and without the hair's cast shadow (its own layer)");
  const plates = {}; for (const k of NL.FACE_PARTS) { let n = 0; const p = build.layers[k]; for (let i = 0; i < N; i++) if (p[i * 4 + 3] >= 250 && NL.cls(p[i * 4], p[i * 4 + 1], p[i * 4 + 2], 255) === "S") n++; plates[k] = n; }
  add("OPAQUE-LIGHT-PX", "diagnostic", true, plates, "opaque light-skin-coloured pixels left in the brow, nose and mouth layers (D-188 had 3 / 45 / 17 / 18)");
  const spec = NL.loadSpec(), sk = build.layers.skin; let ink = 0; for (const z of NL.ZONES) { const m = NL.polyMask(spec.zones[z]); for (let i = 0; i < N; i++) if (m[i] && sk[i * 4 + 3] >= 128 && 0.299 * sk[i * 4] + 0.587 * sk[i * 4 + 1] + 0.114 * sk[i * 4 + 2] < 90) ink++; }
  add("NO-DOUBLE-FEATURES", "binding", ink === 0, { inkPxInSkinInFeatureZones: ink }, "the skin layer still holds no feature ink");
  add("PROMOTION", "binding", HD.promotionStatus().promotable === false && (() => { try { HD.promote(); return false; } catch { return true; } })(), HD.promotionStatus(), "never promotable by passing checks");
  for (const [id, why] of NOT_APPLICABLE) add(id, "not applicable", null, "IKKE ANVENDELIG", why);
  return { checks: out, firstFailure: out.find((c) => c.ok === false)?.id ?? null };
}
export const NOT_APPLICABLE = Object.freeze([
  ["D-186 underlay / G1V3 + E2 + K4 checks", "the cranium continues Northstar's own visible face contour; it is not shaped to the G1V3/E2 geometry"],
  ["D-185 hair / HP4–HP8 / HP-FRAG", "the hair is Northstar's own painted hair (plus 15 px of its own edge residue moved from the skin), not registered to R3's hair targets"],
  ["D-187 nape lock checks", "Northstar's own sideburns and lock are kept"],
  ["Face-neutral fits / D-159 eye envelope / achromatic iris", "the features are Northstar's own pixels in place; the eyes are D-188's, unchanged"],
]);

// ── images ──────────────────────────────────────────────────────────────────────────────────────────────────────
const flat = (src, bg = [255, 255, 255]) => { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) { const a = src[i * 4 + 3] / 255; for (let c = 0; c < 3; c++) o[i * 4 + c] = Math.round(src[i * 4 + c] * a + bg[c] * (1 - a)); o[i * 4 + 3] = 255; } return o; };
const crop = (src, [x0, y0, x1, y1], s = 1) => { const w = (x1 - x0) * s, h = (y1 - y0) * s, o = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const j = ((y0 + ((y / s) | 0)) * W + x0 + ((x / s) | 0)) * 4; o.set(src.subarray(j, j + 4), (y * w + x) * 4); } return { w, h, px: o }; };
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
const diffMap = (A, B, k) => { const o = new Uint8ClampedArray(N * 4), FA = flat(A), FB = flat(B); for (let i = 0; i < N; i++) { let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(FA[i * 4 + c] - FB[i * 4 + c])); const da = Math.abs(A[i * 4 + 3] - B[i * 4 + 3]); const v = Math.min(255, d * k), va = Math.min(255, da * k); o[i * 4] = 255 - va * 0.6; o[i * 4 + 1] = 255 - v; o[i * 4 + 2] = 255 - v; o[i * 4 + 3] = 255; } return o; };
const DARK = [38, 38, 46], DARK_SKIN = [120, 72, 46];

export function writeVariantReview(variant, OUT, nsOriginal) {
  const files = {}, save = (n, img) => { const b = encodePng(img.w, img.h, img.px); writeFileSync(join(OUT, n), b); files[n] = { sha256: sha(b), w: img.w, h: img.h }; };
  const { build, body } = variant, L = build.layers, B = build.baseline, M = build.masks, HB = HEAD_BOX;
  const head = HD.composeHead(L), bald = HD.composeHead(L, { include: BALD }), baldShadow = HD.composeHead(L, { include: HD.COMPOSITE_ORDER.filter((k) => k !== "hair") });
  const d188 = NL.overStack(NL.COMPOSITE_ORDER.map((k) => B[k])), cmp = HD.composeOriginalComparison(build, body), cmp188 = NL.overStack([body, ...NL.COMPOSITE_ORDER.map((k) => B[k])]);
  const nsF = flat(nsOriginal);
  save("h01-northstar-d188-d189-same-size.png", grid([crop(nsF, HB), crop(flat(d188), HB), crop(flat(head), HB)], 3));
  save("h02-with-hair-without-hair-and-shadow-shadow-only.png", grid([crop(flat(head), HB), crop(flat(bald), HB), crop(flat(baldShadow), HB)], 3));
  const skinOnly = HD.composeHead(L, { include: ["cranium", "skin"] });
  save("h03-skin-without-features.png", grid([crop(flat(skinOnly), HB), crop(flat(skinOnly, DARK), HB)], 2, 10, DARK));
  save("h04-masks-and-change-maps.png", grid([crop(flat(M["source-categories"]), HB), crop(flat(M["cranium-region"]), HB), crop(diffMap(cmp188, cmp, 16), HB), crop(diffMap(nsOriginal, cmp, 16), HB)], 2));
  save("h05-ear-tops-x4.png", grid([crop(flat(bald, DARK), [345, 270, 420, 350], 4), crop(flat(bald, DARK), [604, 270, 679, 350], 4)], 2, 10, DARK));
  save("h05-forehead-x2.png", crop(flat(bald), [370, 110, 650, 300], 2));
  const parts = (X) => NL.overStack(NL.FACE_PARTS.map((k) => X[k])), box = [400, 230, 640, 405];
  save("h05-face-edges-before-after-x2.png", grid([crop(flat(head), box, 2), crop(flat(d188), box, 2), crop(flat(parts(B), DARK), box, 2), crop(flat(parts(L), DARK), box, 2), crop(flat(parts(B)), box, 2), crop(flat(parts(L)), box, 2), crop(flat(parts(B), DARK_SKIN), box, 2), crop(flat(parts(L), DARK_SKIN), box, 2)], 2));
  for (const [w, h] of [[360, 540], [180, 270], [110, 165], [52, 78]]) save(`h06-display-${w}x${h}.png`, grid([down(nsF, w, h), down(flat(cmp), w, h), down(flat(NL.overStack([body, bald])), w, h)], 3));
  // unresolved, shown on the bare head
  const bx = (P, [x0, y0, x1, y1]) => { const o = P.slice(); for (let x = x0; x <= x1; x++) for (const y of [y0, y1]) o.set([220, 20, 60, 255], (y * W + x) * 4); for (let y = y0; y <= y1; y++) for (const x of [x0, x1]) o.set([220, 20, 60, 255], (y * W + x) * 4); return o; };
  save("h07-open-hidden-brow-end-x4.png", crop(flat(bx(bald, [440, 236, 492, 270])), [416, 212, 516, 294], 4));
  save("h07-open-sclera-behind-iris-x3.png", crop(flat(bx(HD.composeHead(L, { include: ["cranium", "skin", "eyesFixed"] }), [415, 280, 485, 360])), [391, 256, 509, 384], 3));
  // illustrative coverage of a shorter haircut (a mask, not a hairstyle)
  const cap = NL.polyMask(variant.spec?.illustration?.shortHairCoverage?.polygon ?? HD.loadSpec().illustration.shortHairCoverage.polygon), cov = flat(bald);
  for (let i = 0; i < N; i++) if (cap[i]) { const x = i % W, y = (i / W) | 0, stripe = ((x + y) >> 3) & 1; for (let c = 0; c < 3; c++) cov[i * 4 + c] = Math.round(cov[i * 4 + c] * 0.45 + (stripe ? 90 : 140) * 0.55); }
  save("h08-ILLUSTRATIV-dækning-kortere-frisure.png", crop(cov, HB));
  return { files, headPixelSha256: pixelSha256(head) };
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export function variantReportHtml(variant) {
  const st = (c) => (c.ok === true ? "BESTÅET" : c.ok === false ? "FEJL" : "IKKE ANVENDELIG");
  const rows = variant.checks.checks.map((c) => `<tr class="${c.ok === false ? "bad" : c.ok === null ? "na" : "ok"}"><td>${esc(c.id)}</td><td>${esc(c.kind)}</td><td>${st(c)}</td><td>${esc(c.name ?? "")}</td><td><code>${esc(typeof c.value === "string" ? c.value : JSON.stringify(c.value))}</code></td></tr>`).join("");
  const fig = (n, cap) => `<figure><img src="${n}" alt="${esc(cap)}" loading="lazy"><figcaption>${esc(cap)}</figcaption></figure>`;
  const man = variant.tracked.man, dev = man.composite.deviationFromOriginal, ch = man.changesVsD188;
  const causeRows = Object.entries(ch.byCause).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v.px}</td><td>${v.rgb["0"]} / ${v.rgb["1-2"]} / ${v.rgb["3-5"]} / ${v.rgb["6-16"]} / ${v.rgb[">16"]}</td><td>${v.maxRgb}</td><td>${v.maxAlpha}</td></tr>`).join("");
  return `<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>R3 Northstar-hoved</title>
<style>:root{--bg:#fbfaf7;--fg:#1d1b18;--mut:#6b655c;--line:#e3ddd2;--ok:#1f7a3d;--bad:#b3261e;--na:#8a6d00;--card:#fff}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#17150f;--fg:#ece7dd;--mut:#a39c90;--line:#3a352c;--ok:#5cc27e;--bad:#ff8a80;--na:#e0c060;--card:#211e17}}
:root[data-theme="dark"]{--bg:#17150f;--fg:#ece7dd;--mut:#a39c90;--line:#3a352c;--ok:#5cc27e;--bad:#ff8a80;--na:#e0c060;--card:#211e17}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}main{max-width:1100px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:26px;margin:0 0 4px}h2{font-size:19px;margin:36px 0 10px;border-bottom:1px solid var(--line);padding-bottom:6px}.lede{color:var(--mut);margin:0 0 18px}
figure{margin:14px 0 22px;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px;overflow-x:auto}figure img{display:block;max-width:none;margin:0 auto}figcaption{color:var(--mut);font-size:13px;margin-top:8px}
table{border-collapse:collapse;width:100%;font-size:13px}td,th{border-bottom:1px solid var(--line);padding:5px 6px;text-align:left;vertical-align:top}code{font-size:12px;word-break:break-all}.tw{overflow-x:auto}
tr.ok td:nth-child(3){color:var(--ok);font-weight:600}tr.bad td:nth-child(3){color:var(--bad);font-weight:700}tr.na td:nth-child(3){color:var(--na);font-weight:600}.warn{border-left:4px solid var(--na);padding:8px 12px;background:var(--card)}</style></head><body><main>
<h1>R3-reviewvariant: Northstar-hovedet</h1>
<p class="lede">${esc(man.status)}. Ejerreview alene: ingen produktionsgodkendelse, ingen promotion, ingen runtime. R3 forbliver default OFF.</p>
<p class="warn">Kraniet under håret er rekonstrueret design, ikke udledte originalpixels. Den skjulte brynende, sclera bag irisen og nye udtryk er fortsat uløste.</p>
<h2>Northstar, D-188 og D-189 ved samme størrelse</h2>${fig("h01-northstar-d188-d189-same-size.png", "Venstre: Northstar v2. Midt: D-188 (baseline, uændret). Højre: D-189 standardkomposition.")}
<h2>Med og uden hår</h2>${fig("h02-with-hair-without-hair-and-shadow-shadow-only.png", "Med hår · uden hår og uden hårets slagskygge (det skaldede hoved alene) · uden hår, men med hårets slagskygge (viser at skyggen er sit eget lag).")}
<h2>Hudlaget uden ansigtstræk</h2>${fig("h03-skin-without-features.png", "Kranie + hud uden træk og øjne, på lys og mørk baggrund.")}
<h2>Masker og ændringskort</h2>${fig("h04-masks-and-change-maps.png", "Kildekategorier (grå original · magenta D-188-rekonstruktion · grøn D-189-maling · mørkegrøn D-189-streg · gul omprojiceret trækkant · blå mangler) · kranieregion · ændring mod D-188 ×16 · afvigelse fra Northstar ×16.")}
<div class="tw"><table><thead><tr><th>Ændring mod D-188 efter årsag</th><th>Pixels</th><th>0 / 1–2 / 3–5 / 6–16 / &gt;16</th><th>Max farve</th><th>Max alfa</th></tr></thead><tbody>${causeRows}</tbody></table></div>
<p>Uden for redigeringsmaskerne: ${ch.outsideEditMasksPx} pixels ændret i kompositionen; pr. lag: <code>${esc(JSON.stringify(ch.perLayerOutsideEditMaskPx))}</code>. Afvigelse fra Northstar: ${dev.bitIdenticalPx} af ${dev.visiblePx} synlige pixels bit-identiske; farve 0 / 1–2 / 3–5 / 6–16 / &gt;16 = ${dev.rgb["0"]} / ${dev.rgb["1-2"]} / ${dev.rgb["3-5"]} / ${dev.rgb["6-16"]} / ${dev.rgb[">16"]}; max ${dev.maxRgb} / ${dev.maxAlpha}. De største ligger i trækkanterne, hvor originalens lyse glorie bevidst er fjernet; kraniet under håret flytter højst 2 niveauer (hårets alfa 253–254).</p>
<h2>Forstørret</h2>${fig("h05-ear-tops-x4.png", "Øretoppe ×4 på det skaldede hoved (venstre · højre).")}${fig("h05-forehead-x2.png", "Pande ×2: overgangen mellem original hud og malet kranie.")}${fig("h05-face-edges-before-after-x2.png", "Ansigtskanter ×2. Række 1: D-189 og D-188 med hår. Række 2–4: trækkene alene, D-188 til venstre og D-189 til højre, på mørk, lys og mørk hud (diagnostisk, ikke et hudtoken).")}
<h2>Visningsstørrelser</h2>${["360x540", "180x270", "110x165", "52x78"].map((s) => fig(`h06-display-${s}.png`, `${s.replace("x", "×")}: Northstar · D-189 med hår · D-189 skaldet.`)).join("")}
<h2>Uløst</h2>${fig("h07-open-hidden-brow-end-x4.png", "UDESTÅR: venstre bryns skjulte ende og overkant (tidligere dækket af hårlokken).")}${fig("h07-open-sclera-behind-iris-x3.png", "UDESTÅR: sclera bag irisen.")}${fig("h08-ILLUSTRATIV-dækning-kortere-frisure.png", "ILLUSTRATIV DÆKNINGSMASKE — ikke en frisure: det skraverede område ville en kortere frisure dække; resten af kraniet ville blive synligt.")}
<h2>Kontroller</h2><p class="lede">Første fejl: ${esc(variant.checks.firstFailure ?? "ingen")}.</p><div class="tw"><table><thead><tr><th>Id</th><th>Art</th><th>Resultat</th><th>Hvad</th><th>Værdi</th></tr></thead><tbody>${rows}</tbody></table></div>
<h2>Kildekæde</h2><p>Kilde <code>${esc(NL.SOURCE.file)}</code> (${esc(NL.SOURCE.sha256)}) · baseline D-188 (merge ${esc(man.baseline.mergeCommit)}, manifest ${esc(man.baseline.manifestSha256)}) · spec <code>${esc(HD.SPEC_FILE)}</code> · generator <code>tools/avatar/r3-northstar-head.mjs</code> · genbygning <code>node tools/avatar/r3-review-pack.mjs --variant northstar-head --out &lt;tom mappe&gt;</code>.</p>
</main></body></html>
`;
}
