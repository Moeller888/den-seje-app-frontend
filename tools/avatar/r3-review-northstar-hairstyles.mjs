// R3 REVIEW VARIANT "northstar-hairstyles" (D-191). Rebuilds the finished Northstar head (r3-northstar-hairstyles.mjs) on the
// unchanged D-190 baseline, checks the edit bounds and the preserved default with Northstar's hair, measures the brows under
// every hairstyle, and writes the owner-review images and report: bald, Northstar's hair, R2 short (review derivative) and
// R2 afro (UNSUITABLE, with the three documented attempts). Nothing is approved or promotable; colour variants and every new
// derivative are review material. No H1, no image call, no runtime change; R3 stays default OFF.
// Entry: node tools/avatar/r3-review-pack.mjs --variant northstar-hairstyles --out <empty dir>
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng, decodePng, pixelSha256 } from "./r3-hair-tool-v2.mjs";
import * as NL from "./r3-northstar-layers.mjs";
import * as HD from "./r3-northstar-head.mjs";
import * as BR from "./r3-northstar-brow.mjs";
import * as HS from "./r3-northstar-hairstyles.mjs";

const W = 1024, H = 1536, N = W * H;
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const sha = (b) => createHash("sha256").update(b).digest("hex");
export const VARIANT = "northstar-hairstyles";
export const SITUATIONS = Object.freeze(["bald", "northstar", "short", "afro"]);
export const LABEL = Object.freeze({ bald: "uden hår", northstar: "Northstar-hår", short: "short (R2-afledning)", afro: "afro (R2-afledning, UEGNET)" });
/** Which mask may change which built layer (relative to D-190). */
export const EDIT_MASK_OF = Object.freeze({ browL: ["brow-residue-to-hair"], hair: ["brow-residue-to-hair", "ear-hair-to-hair"], skin: ["ear-skin-refill", "lit-skin-refit"], hairShadow: ["lit-skin-refit"] });
const fl = (P, i, c) => P[i * 4 + c] * P[i * 4 + 3] / 255 + 255 * (1 - P[i * 4 + 3] / 255);

export function changeReport(build) {
  const M = build.masks, base = build.base.layers, perLayer = {};
  for (const k of HD.COMPOSITE_ORDER) {
    const L = build.layers[k], B = base[k], allowed = EDIT_MASK_OF[k] ?? []; let changed = 0, outside = 0;
    for (let i = 0; i < N; i++) if (L[i * 4] !== B[i * 4] || L[i * 4 + 1] !== B[i * 4 + 1] || L[i * 4 + 2] !== B[i * 4 + 2] || L[i * 4 + 3] !== B[i * 4 + 3]) { changed++; if (!allowed.some((m) => M[m][i * 4 + 3])) outside++; }
    perLayer[k] = { changedPx: changed, outsideEditMaskPx: outside };
  }
  const A = HD.composeHead(base), B = HS.composeSituation(build, "northstar"), band = { "0": 0, "1-2": 0, "3-5": 0, "6-16": 0, ">16": 0 };
  let mx = 0, ma = 0, n = 0, outside = 0;
  for (let i = 0; i < N; i++) { let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(fl(A, i, c) - fl(B, i, c))); d = Math.round(d); const da = Math.abs(A[i * 4 + 3] - B[i * 4 + 3]); if (!d && !da) continue; n++; band[d === 0 ? "0" : d <= 2 ? "1-2" : d <= 5 ? "3-5" : d <= 16 ? "6-16" : ">16"]++; mx = Math.max(mx, d); ma = Math.max(ma, da); if (!HS.MASKS.some((m) => M[m][i * 4 + 3])) outside++; }
  return { perLayer, northstarComposite: { changedPx: n, bands: band, maxRgb: mx, maxAlpha: ma, outsideEditMasksPx: outside } };
}
/** Brow coverage under each situation's hair (alpha >= 128), and brow pixels whose 5x5 neighbourhood mixes covered and uncovered. */
export function browCoverage(build) {
  const hairOf = { bald: null, northstar: build.layers.hair, short: build.styles.short, afro: build.styles.afro }, out = {};
  for (const s of SITUATIONS) {
    out[s] = {}; const hair = hairOf[s];
    for (const side of ["browL", "browR"]) {
      const B = build.layers[side]; let n = 0, cov = 0, cut = 0;
      for (let i = 0; i < N; i++) {
        if (B[i * 4 + 3] < 128) continue; n++; const h = hair ? hair[i * 4 + 3] >= 128 : false; if (h) cov++;
        if (hair) { const x = i % W, y = (i / W) | 0; let mixed = false; for (let dy = -2; dy <= 2 && !mixed; dy++) for (let dx = -2; dx <= 2 && !mixed; dx++) if ((hair[((y + dy) * W + x + dx) * 4 + 3] >= 128) !== h) mixed = true; if (mixed) cut++; }
      }
      out[s][side] = { browPx: n, coveredPct: +(100 * cov / n).toFixed(1), hairEdgeOnBrowPx: cut };
    }
  }
  return out;
}

export function buildVariant() { const tracked = HS.loadTracked(), build = HS.buildHairstyles(); return { tracked, build, checks: runVariantChecks({ tracked, build }) }; }

export function runVariantChecks({ tracked, build }) {
  const out = [], add = (id, kind, ok, value, name) => out.push({ id, kind, ok, value, name }), man = tracked.man;
  add("SRC", "binding", man.source.sha256 === NL.SOURCE.sha256, NL.SOURCE.sha256, "the tracked Northstar Master v2 (loadSource throws otherwise); never H1");
  const d190Sha = sha(readFileSync(join(REPO, ...BR.MANIFEST_FILE.split("/"))));
  add("BASELINE-D190", "binding", man.baseline.manifestSha256 === d190Sha && pixelSha256(HD.composeHead(build.base.layers)) === man.baseline.headPixelSha256, { d190ManifestSha256: d190Sha }, "the D-190 baseline is the merged one and composes to its recorded head; every older file is read through its own pins");
  const r2 = {}; for (const s of HS.STYLES) { const src = HS.R2_SOURCES[s]; r2[s] = sha(readFileSync(join(REPO, ...src.webp.split("/")))) === src.webpSha256 && pixelSha256(HS.loadR2(s)) === src.pixelSha256; }
  add("R2-SOURCES", "binding", Object.values(r2).every(Boolean), r2, "R2's webp originals are untouched (pinned sha256) and their tracked native decodes match their pixel pins");
  const pins = {};
  for (const k of HS.BUILT) pins[k] = pixelSha256(build.layers[k]) === man.layers[k].pixelSha256 && pixelSha256(decodePng(tracked.files[k]).px) === man.layers[k].pixelSha256;
  for (const k of HS.STYLES) pins[k] = pixelSha256(build.styles[k]) === man.styles[k].pixelSha256 && pixelSha256(decodePng(tracked.files[k]).px) === man.styles[k].pixelSha256;
  for (const k of HS.MASKS) pins[k] = pixelSha256(build.masks[k]) === man.masks[k].pixelSha256 && pixelSha256(decodePng(tracked.files[k]).px) === man.masks[k].pixelSha256;
  add("REBUILD", "binding", Object.values(pins).every(Boolean), pins, "every built layer, style derivative and mask equals its tracked file and manifest pixel hash");
  const ch = changeReport(build);
  add("EDIT-BOUNDS", "binding", Object.values(ch.perLayer).every((v) => v.outsideEditMaskPx === 0) && ch.northstarComposite.outsideEditMasksPx === 0 && JSON.stringify(ch) === JSON.stringify(man.changesVsD190), ch.perLayer, "no layer and no pixel of the default composite changed outside its documented edit masks");
  add("DEFAULT-PRESERVED", "binding", ch.northstarComposite.maxRgb <= man.changesVsD190.northstarComposite.maxRgb && ch.northstarComposite.bands[">16"] === 0, ch.northstarComposite, "the default with Northstar's hair keeps its pixels: every change is the recorded stacking/rounding of the refitted shadow and refills (pinned measurement)");
  const cov = browCoverage(build);
  add("BROW-COVERAGE", "binding", JSON.stringify(cov) === JSON.stringify(man.browCoverage) && cov.short.browL.coveredPct === 0 && cov.short.browR.coveredPct === 0 && cov.bald.browL.coveredPct === 0, cov, "the brows under each hairstyle (pinned): short leaves both brows free; the afro covers them (why it is UNSUITABLE)");
  const situations = {}; for (const s of SITUATIONS) situations[s] = pixelSha256(HS.composeSituation(build, s));
  add("SITUATIONS", "binding", JSON.stringify(situations) === JSON.stringify(man.situations), situations, "bald, Northstar's hair, short and afro compose to their recorded pixels");
  const noShadow = ["bald", "short", "afro"].every((s) => { const bald = HD.composeHead(build.layers, { include: HD.COMPOSITE_ORDER.filter((k) => k !== "hair" && k !== "hairShadow") }); return s === "bald" ? pixelSha256(HS.composeSituation(build, s)) === pixelSha256(bald) : pixelSha256(HS.composeSituation(build, s)) === pixelSha256(NL.overStack([bald, HS.tint(build.styles[s])])); });
  add("SHADOW-NORTHSTAR-ONLY", "binding", noShadow, { northstarShadowUsedBy: ["northstar"] }, "the hair's cast shadow belongs to Northstar's hair only; bald, short and afro compose without it");
  add("STYLE-STATUS", "binding", man.styleStatus.short === "REVIEW DERIVATIVE" && /^UNSUITABLE/.test(man.styleStatus.afro), man.styleStatus, "short is a review derivative; the afro is documented as unsuitable, not an R3 asset");
  add("LAYER-ORDER", "binding", JSON.stringify(HD.COMPOSITE_ORDER) === JSON.stringify(man.compositeOrder), HD.COMPOSITE_ORDER, "cranium < skin < hair shadow < brows, nose, mouth < iris < eyes-fixed < hair (a style replaces the hair, without the shadow)");
  add("PROMOTION", "binding", HS.promotionStatus().promotable === false && (() => { try { HS.promote(); return false; } catch { return true; } })(), HS.promotionStatus(), "never promotable by passing checks");
  return { checks: out, firstFailure: out.find((c) => c.ok === false)?.id ?? null };
}

// ── images ──────────────────────────────────────────────────────────────────────────────────────────────────────
const flat = (P, bg = [255, 255, 255]) => { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) { const a = P[i * 4 + 3] / 255; for (let c = 0; c < 3; c++) o[i * 4 + c] = Math.round(P[i * 4 + c] * a + bg[c] * (1 - a)); o[i * 4 + 3] = 255; } return o; };
const crop = (P, [x0, y0, x1, y1], s = 1) => { const w = (x1 - x0) * s, h = (y1 - y0) * s, o = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const yy = y0 + ((y / s) | 0), xx = x0 + ((x / s) | 0), d = (y * w + x) * 4; if (yy < 0 || xx < 0 || yy >= H || xx >= W) { o.set([255, 255, 255, 255], d); continue; } const j = (yy * W + xx) * 4; o.set(P.subarray(j, j + 4), d); } return { w, h, px: o }; };
function down(F, w2, h2) { const o = new Uint8ClampedArray(w2 * h2 * 4), sx = W / w2, sy = H / h2; for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) { const acc = [0, 0, 0]; let wt = 0; for (let yy = Math.floor(y * sy); yy < Math.ceil((y + 1) * sy); yy++) { const wy = Math.min(yy + 1, (y + 1) * sy) - Math.max(yy, y * sy); if (wy <= 0) continue; for (let xx = Math.floor(x * sx); xx < Math.ceil((x + 1) * sx); xx++) { const wx = Math.min(xx + 1, (x + 1) * sx) - Math.max(xx, x * sx); if (wx <= 0) continue; const k = wx * wy, j = (yy * W + xx) * 4; for (let c = 0; c < 3; c++) acc[c] += F[j + c] * k; wt += k; } } for (let c = 0; c < 3; c++) o[(y * w2 + x) * 4 + c] = Math.round(acc[c] / wt); o[(y * w2 + x) * 4 + 3] = 255; } return { w: w2, h: h2, px: o }; }
function grid(t, cols, gap = 10, bg = [255, 255, 255]) { const w = Math.max(...t.map((x) => x.w)), h = Math.max(...t.map((x) => x.h)), rows = Math.ceil(t.length / cols), Wd = cols * w + (cols - 1) * gap, Hd = rows * h + (rows - 1) * gap, o = new Uint8ClampedArray(Wd * Hd * 4); for (let i = 0; i < Wd * Hd; i++) { o.set(bg, i * 4); o[i * 4 + 3] = 255; } t.forEach((x, k) => { const ox = (k % cols) * (w + gap), oy = Math.floor(k / cols) * (h + gap); for (let y = 0; y < x.h; y++) o.set(x.px.subarray(y * x.w * 4, (y + 1) * x.w * 4), ((oy + y) * Wd + ox) * 4); }); return { w: Wd, h: Hd, px: o }; }
const DARK = [38, 38, 46];
const contrast = (F, gain) => { const o = new Uint8ClampedArray(F); for (let i = 0; i < N; i++) for (let c = 0; c < 3; c++) o[i * 4 + c] = Math.max(0, Math.min(255, Math.round((F[i * 4 + c] - 200) * gain + 200))); return o; };

export function writeVariantReview(variant, OUT) {
  const files = {}, save = (n, img) => { const b = encodePng(img.w, img.h, img.px); writeFileSync(join(OUT, n), b); files[n] = { sha256: sha(b), w: img.w, h: img.h }; };
  const { build } = variant, sit = Object.fromEntries(SITUATIONS.map((s) => [s, HS.composeSituation(build, s)])), HB = [180, 0, 840, 560];
  save("s01-bald-northstar-short-afro.png", grid(SITUATIONS.map((s) => crop(flat(sit[s]), HB)), 4));
  // brow coverage: brow pixels under the hair in red, free brow pixels in green
  const hairOf = { bald: null, northstar: build.layers.hair, short: build.styles.short, afro: build.styles.afro };
  const covImg = (s) => { const F = flat(sit[s]); for (let i = 0; i < N; i++) { const b = build.layers.browL[i * 4 + 3] >= 128 || build.layers.browR[i * 4 + 3] >= 128; if (!b) continue; const h = hairOf[s] && hairOf[s][i * 4 + 3] >= 128; F[i * 4] = h ? 230 : Math.round(F[i * 4] * 0.4); F[i * 4 + 1] = h ? 30 : Math.round(F[i * 4 + 1] * 0.4 + 120); F[i * 4 + 2] = h ? 60 : Math.round(F[i * 4 + 2] * 0.4); } return F; };
  save("s02-brow-coverage-x2.png", grid(SITUATIONS.flatMap((s) => [crop(flat(sit[s]), [390, 200, 640, 300], 2), crop(covImg(s), [390, 200, 640, 300], 2)]), 2));
  save("s03-ear-transitions-x3.png", grid(SITUATIONS.flatMap((s) => [crop(flat(sit[s], DARK), [330, 240, 430, 400], 3), crop(flat(sit[s], DARK), [594, 240, 694, 400], 3)]), 4, 10, DARK));
  for (const [w, h] of [[360, 540], [180, 270], [110, 165], [52, 78]]) save(`s04-display-${w}x${h}.png`, grid(SITUATIONS.map((s) => down(flat(sit[s]), w, h)), 4));
  // the fixes, before (D-190) and after
  const BALD = HD.COMPOSITE_ORDER.filter((k) => k !== "hair" && k !== "hairShadow"), b0 = HD.composeHead(build.base.layers, { include: BALD }), b1 = sit.bald;
  save("s05-brow-residue-before-after-x6.png", grid([crop(flat(b0), [440, 232, 490, 268], 6), crop(flat(b1), [440, 232, 490, 268], 6), crop(flat(HD.composeHead(build.base.layers)), [440, 232, 490, 268], 6), crop(flat(sit.northstar), [440, 232, 490, 268], 6)], 2));
  save("s05-ear-sideburn-tips-before-after-x5.png", grid([crop(flat(b0, DARK), [350, 280, 430, 350], 5), crop(flat(b1, DARK), [350, 280, 430, 350], 5), crop(flat(b0, DARK), [604, 280, 684, 350], 5), crop(flat(b1, DARK), [604, 280, 684, 350], 5)], 2, 10, DARK));
  save("s05-forehead-before-after-contrast-x2.png", grid([crop(contrast(flat(b0, DARK), 4), [370, 110, 650, 300], 2), crop(contrast(flat(b1, DARK), 4), [370, 110, 650, 300], 2), crop(flat(b0, DARK), [370, 110, 650, 300], 2), crop(flat(b1, DARK), [370, 110, 650, 300], 2)], 2, 10, DARK));
  const M = build.masks, chg = flat(b1); for (let i = 0; i < N; i++) for (const [k, col] of [["lit-skin-refit", [255, 140, 0]], ["ear-skin-refill", [60, 200, 90]], ["ear-hair-to-hair", [0, 200, 255]], ["brow-residue-to-hair", [255, 0, 200]]]) if (M[k][i * 4 + 3]) { chg.set(col, i * 4); break; }
  save("s06-change-map.png", crop(chg, HB));
  // the afro: three documented attempts
  const spec = HS.loadSpec(), bald = b1, A = HS.loadR2("afro");
  const clear = HS.placeStyle(A, { k: 1.947, tx: 9, ty: -83 }), cut = new Uint8ClampedArray(build.styles.afro);
  for (let y = 0; y < 700; y++) for (let x = 0; x < W; x++) { const d = Math.hypot((x + 0.5 - 510) / 148, (y + 0.5 - 335) / 108); if (d < 1) { const f = Math.min(1, (1 - d) * 148 / 4); cut[(y * W + x) * 4 + 3] = Math.round(cut[(y * W + x) * 4 + 3] * (1 - f)); } }
  const clearImg = flat(NL.overStack([bald, HS.tint(clear)])); for (let x = 0; x < W; x++) for (let y = 0; y < 3; y++) chgSet(clearImg, x, y);
  function chgSet(F, x, y) { F.set([220, 20, 60, 255], (y * W + x) * 4); }
  save("s07-afro-attempts.png", grid([crop(flat(sit.afro), HB), crop(clearImg, HB), crop(flat(NL.overStack([bald, HS.tint(cut)])), HB)], 3));
  void spec;
  return { files };
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export function variantReportHtml(variant) {
  const st = (c) => (c.ok === true ? "BESTÅET" : c.ok === false ? "FEJL" : "IKKE ANVENDELIG"), man = variant.tracked.man, cov = man.browCoverage, nc = man.changesVsD190.northstarComposite;
  const rows = variant.checks.checks.map((c) => `<tr class="${c.ok === false ? "bad" : "ok"}"><td>${esc(c.id)}</td><td>${esc(c.kind)}</td><td>${st(c)}</td><td>${esc(c.name)}</td><td><code>${esc(JSON.stringify(c.value))}</code></td></tr>`).join("");
  const fig = (n, cap) => `<figure><img src="${n}" alt="${esc(cap)}" loading="lazy"><figcaption>${esc(cap)}</figcaption></figure>`;
  const covRows = SITUATIONS.map((s) => `<tr><td>${esc(LABEL[s])}</td><td>${cov[s].browL.coveredPct} %</td><td>${cov[s].browR.coveredPct} %</td><td>${cov[s].browL.hairEdgeOnBrowPx + cov[s].browR.hairEdgeOnBrowPx}</td></tr>`).join("");
  return `<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>R3 Northstar-frisurer</title>
<style>:root{--bg:#fbfaf7;--fg:#1d1b18;--mut:#6b655c;--line:#e3ddd2;--ok:#1f7a3d;--bad:#b3261e;--na:#8a6d00;--card:#fff}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#17150f;--fg:#ece7dd;--mut:#a39c90;--line:#3a352c;--ok:#5cc27e;--bad:#ff8a80;--na:#e0c060;--card:#211e17}}
:root[data-theme="dark"]{--bg:#17150f;--fg:#ece7dd;--mut:#a39c90;--line:#3a352c;--ok:#5cc27e;--bad:#ff8a80;--na:#e0c060;--card:#211e17}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}main{max-width:1100px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:26px;margin:0 0 4px}h2{font-size:19px;margin:36px 0 10px;border-bottom:1px solid var(--line);padding-bottom:6px}.lede{color:var(--mut);margin:0 0 18px}
figure{margin:14px 0 22px;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px;overflow-x:auto}figure img{display:block;max-width:none;margin:0 auto}figcaption{color:var(--mut);font-size:13px;margin-top:8px}
table{border-collapse:collapse;width:100%;font-size:13px}td,th{border-bottom:1px solid var(--line);padding:5px 6px;text-align:left;vertical-align:top}code{font-size:12px;word-break:break-all}.tw{overflow-x:auto}
tr.ok td:nth-child(3){color:var(--ok);font-weight:600}tr.bad td:nth-child(3){color:var(--bad);font-weight:700}.warn{border-left:4px solid var(--na);padding:8px 12px;background:var(--card)}</style></head><body><main>
<h1>R3-reviewvariant: Northstar-hovedet med alternative frisurer</h1>
<p class="lede">${esc(man.status)}. R3 forbliver default OFF.</p>
<p class="warn">Short og afro er afledt af R2's frisurer (tegnet til v1-figuren, 512×768), placeret på v2-hovedet og farvet som R2-runtime (brun token × luminans). De er reviewmateriale, ikke R3-assets. Afroen er UEGNET (se nederst). Hårets slagskygge følger kun Northstar-håret.</p>
<h2>Fire situationer ved samme størrelse</h2>${fig("s01-bald-northstar-short-afro.png", "Uden hår · Northstar-hår · short · afro.")}
<h2>Bryndækning</h2>${fig("s02-brow-coverage-x2.png", "×2 for hver situation: billedet og bryndækningen (grøn = fri, rød = under håret).")}
<div class="tw"><table><thead><tr><th>Situation</th><th>Venstre bryn dækket</th><th>Højre bryn dækket</th><th>Brynpixels ved hårkant</th></tr></thead><tbody>${covRows}</tbody></table></div>
<h2>Øreovergange</h2>${fig("s03-ear-transitions-x3.png", "×3 på mørk baggrund, venstre og højre øre: uden hår · Northstar-hår (række 1) · short · afro (række 2).")}
<h2>Visningsstørrelser</h2>${["360x540", "180x270", "110x165", "52x78"].map((x) => fig(`s04-display-${x}.png`, `${x.replace("x", "×")}: uden hår · Northstar-hår · short · afro.`)).join("")}
<h2>Rettelser af de rekonstruerede områder</h2>${fig("s05-brow-residue-before-after-x6.png", "Hårrester ved venstre bryn ×6: uden hår før (D-190) · efter; med Northstar-hår før · efter.")}${fig("s05-ear-sideburn-tips-before-after-x5.png", "Bakkenbartspidser i ørezonerne ×5 på mørk: venstre før · efter; højre før · efter.")}${fig("s05-forehead-before-after-contrast-x2.png", "Pande ×2: kontrast ×4 før · efter; normal før · efter. De lyse felter øverst til højre og over venstre bryn er Northstars egen synlige hud og bevares.")}${fig("s06-change-map.png", "Ændringskort på det skaldede hoved: orange = lys hud under hårskyggen genberegnet · grøn = hud genudfyldt i ørezonen · cyan = bakkenbartspidser til hår · magenta = brynrester til hår.")}
<p>Med Northstar-hår: ${nc.changedPx} pixels ændret, bånd ${esc(JSON.stringify(nc.bands))}, max ${nc.maxRgb}/${nc.maxAlpha}; ${nc.outsideEditMasksPx} uden for redigeringsmaskerne.</p>
<h2>Afro: hvorfor uegnet</h2>${fig("s07-afro-attempts.png", "Venstre: bedste placering inden for lærredet — dækker brynenes ydre ender. Midt: placeringen der frigør brynene — toppen ligger 50 px over lærredet (rød linje = lærredskant). Højre: elliptisk hårgrænsemaske — frigør brynene, men skærer hårde kanter gennem krøllerne ved tindingerne og blotter baggrund ved ørerne.")}
<h2>Kontroller</h2><p class="lede">Første fejl: ${esc(variant.checks.firstFailure ?? "ingen")}.</p><div class="tw"><table><thead><tr><th>Id</th><th>Art</th><th>Resultat</th><th>Hvad</th><th>Værdi</th></tr></thead><tbody>${rows}</tbody></table></div>
</main></body></html>
`;
}
