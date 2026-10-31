// R3 REVIEW VARIANT "northstar-brow" (D-190). Rebuilds the D-158-mirrored image-left brow (r3-northstar-brow.mjs) on the
// unchanged D-189 baseline, checks its fit and edit bounds, pins the result and writes the owner-review images and report.
// The filled part of the brow is RECONSTRUCTED. Nothing is approved or promotable. The sclera behind the iris and new
// expressions stay open. No H1, no image call, no runtime change; R3 stays default OFF.
// Entry: node tools/avatar/r3-review-pack.mjs --variant northstar-brow --out <empty dir>
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { encodePng, decodePng, pixelSha256 } from "./r3-hair-tool-v2.mjs";
import * as HD from "./r3-northstar-head.mjs";
import * as BR from "./r3-northstar-brow.mjs";

const W = 1024, H = 1536, N = W * H;
const sha = (b) => createHash("sha256").update(b).digest("hex");
export const VARIANT = "northstar-brow";
export const BALD = Object.freeze(HD.COMPOSITE_ORDER.filter((k) => k !== "hair" && k !== "hairShadow"));
const flatPx = (P, i, c) => P[i * 4 + c] * P[i * 4 + 3] / 255 + 255 * (1 - P[i * 4 + 3] / 255);

/** Every change against D-189: in the layers and in the composite with hair; all must lie inside the mirror-fill mask. */
export function changeReport(build) {
  const fill = build.masks["brow-mirror-fill"]; let layerOutside = 0, layerChanged = 0;
  for (const k of HD.COMPOSITE_ORDER) { const L = build.layers[k], P = build.base.layers[k]; for (let i = 0; i < N; i++) if (L[i * 4] !== P[i * 4] || L[i * 4 + 1] !== P[i * 4 + 1] || L[i * 4 + 2] !== P[i * 4 + 2] || L[i * 4 + 3] !== P[i * 4 + 3]) { layerChanged++; if (k !== "browL" || !fill[i * 4 + 3]) layerOutside++; } }
  const A = HD.composeHead(build.base.layers), B = HD.composeHead(build.layers), hair = build.layers.hair;
  let changed = 0, maxRgb = 0, maxAlpha = 0, outside = 0, underSoftHair = 0;
  for (let i = 0; i < N; i++) {
    let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(flatPx(A, i, c) - flatPx(B, i, c))); d = Math.round(d);
    const da = Math.abs(A[i * 4 + 3] - B[i * 4 + 3]); if (!d && !da) continue;
    changed++; maxRgb = Math.max(maxRgb, d); maxAlpha = Math.max(maxAlpha, da); if (!fill[i * 4 + 3]) outside++; if (hair[i * 4 + 3] < 250) underSoftHair++;
  }
  return { layerPxChanged: layerChanged, layerPxOutsideFill: layerOutside, compositeWithHair: { changedPx: changed, maxRgb, maxAlpha, outsideFillPx: outside, underNonOpaqueHairPx: underSoftHair } };
}

export function buildVariant() { const tracked = BR.loadTracked(), build = BR.buildBrow(); return { tracked, build, checks: runVariantChecks({ tracked, build }) }; }

export function runVariantChecks({ tracked, build }) {
  const out = [], add = (id, kind, ok, value, name) => out.push({ id, kind, ok, value, name }), man = tracked.man, s = build.stats;
  add("SRC", "binding", man.source.sha256 === BR.loadSpec().source.sha256, man.source.sha256, "the tracked Northstar Master v2 (loadSource throws otherwise); never H1");
  add("BASELINE-D189", "binding", pixelSha256(HD.composeHead(build.base.layers)) === man.baseline.headPixelSha256, { d189HeadPixelSha256: man.baseline.headPixelSha256 }, "the D-189 baseline (read through the D-189 and D-188 pins) composes to the recorded head");
  const pins = { browL: pixelSha256(build.layers.browL) === man.layers.browL.pixelSha256 && pixelSha256(decodePng(tracked.files.browL).px) === man.layers.browL.pixelSha256 };
  for (const k of BR.MASKS) pins[k] = pixelSha256(build.masks[k]) === man.masks[k].pixelSha256 && pixelSha256(decodePng(tracked.files[k]).px) === man.masks[k].pixelSha256;
  add("REBUILD", "binding", Object.values(pins).every(Boolean), pins, "the completed brow and every mask equal their tracked files and manifest pixel hashes");
  add("D158-FIT", "binding", JSON.stringify(s) === JSON.stringify(man.stats) && s.fit.skinPx === 0 && s.fit.stage === "translation", s.fit, "D-158 fit: mirrored about the measured midline, translation only, 0 px on safe visible skin, then the highest IoU where the brow is observable");
  const ch = changeReport(build);
  add("EDIT-BOUNDS", "binding", ch.layerPxOutsideFill === 0 && ch.compositeWithHair.outsideFillPx === 0 && JSON.stringify(ch) === JSON.stringify(man.changesVsD189), ch, "only the left brow changes, and only inside the mirror-fill mask (the area the hair hid where the observed brow had no pixel)");
  let lost = 0; const O = build.base.layers.browL, L = build.layers.browL; for (let i = 0; i < N; i++) if (O[i * 4 + 3] && (O[i * 4] !== L[i * 4] || O[i * 4 + 1] !== L[i * 4 + 1] || O[i * 4 + 2] !== L[i * 4 + 2] || O[i * 4 + 3] !== L[i * 4 + 3])) lost++;
  add("OBSERVED-KEPT", "binding", lost === 0, { observedPxChanged: lost }, "every observed brow pixel is kept unchanged");
  add("PROMOTION", "binding", BR.promotionStatus().promotable === false && (() => { try { BR.promote(); return false; } catch { return true; } })(), BR.promotionStatus(), "never promotable by passing checks");
  return { checks: out, firstFailure: out.find((c) => c.ok === false)?.id ?? null };
}

const flat = (P, bg = [255, 255, 255]) => { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) { const a = P[i * 4 + 3] / 255; for (let c = 0; c < 3; c++) o[i * 4 + c] = Math.round(P[i * 4 + c] * a + bg[c] * (1 - a)); o[i * 4 + 3] = 255; } return o; };
const crop = (P, [x0, y0, x1, y1], s = 1) => { const w = (x1 - x0) * s, h = (y1 - y0) * s, o = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const j = ((y0 + ((y / s) | 0)) * W + x0 + ((x / s) | 0)) * 4; o.set(P.subarray(j, j + 4), (y * w + x) * 4); } return { w, h, px: o }; };
function down(F, w2, h2) { const o = new Uint8ClampedArray(w2 * h2 * 4), sx = W / w2, sy = H / h2; for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) { const acc = [0, 0, 0]; let wt = 0; for (let yy = Math.floor(y * sy); yy < Math.ceil((y + 1) * sy); yy++) { const wy = Math.min(yy + 1, (y + 1) * sy) - Math.max(yy, y * sy); if (wy <= 0) continue; for (let xx = Math.floor(x * sx); xx < Math.ceil((x + 1) * sx); xx++) { const wx = Math.min(xx + 1, (x + 1) * sx) - Math.max(xx, x * sx); if (wx <= 0) continue; const k = wx * wy, j = (yy * W + xx) * 4; for (let c = 0; c < 3; c++) acc[c] += F[j + c] * k; wt += k; } } for (let c = 0; c < 3; c++) o[(y * w2 + x) * 4 + c] = Math.round(acc[c] / wt); o[(y * w2 + x) * 4 + 3] = 255; } return { w: w2, h: h2, px: o }; }
function grid(t, cols, gap = 10) { const w = Math.max(...t.map((x) => x.w)), h = Math.max(...t.map((x) => x.h)), rows = Math.ceil(t.length / cols), Wd = cols * w + (cols - 1) * gap, Hd = rows * h + (rows - 1) * gap, o = new Uint8ClampedArray(Wd * Hd * 4).fill(255); t.forEach((x, k) => { const ox = (k % cols) * (w + gap), oy = Math.floor(k / cols) * (h + gap); for (let y = 0; y < x.h; y++) o.set(x.px.subarray(y * x.w * 4, (y + 1) * x.w * 4), ((oy + y) * Wd + ox) * 4); }); return { w: Wd, h: Hd, px: o }; }

export function writeVariantReview(variant, OUT) {
  const files = {}, save = (n, img) => { const b = encodePng(img.w, img.h, img.px); writeFileSync(join(OUT, n), b); files[n] = { sha256: sha(b), w: img.w, h: img.h }; };
  const { build } = variant, M = build.masks, HB = [330, 100, 690, 420], BB = [395, 228, 640, 285];
  const before = HD.composeHead(build.base.layers, { include: BALD }), after = HD.composeHead(build.layers, { include: BALD });
  save("b01-bald-d189-d190.png", grid([crop(flat(before), HB), crop(flat(after), HB)], 2));
  const ov = flat(after); for (let i = 0; i < N; i++) if (M["brow-mirror-fill"][i * 4 + 3]) { ov[i * 4] = (ov[i * 4] + 255) >> 1; ov[i * 4 + 1] = (ov[i * 4 + 1] + 140) >> 1; ov[i * 4 + 2] >>= 1; }
  const fit = flat(after); for (let i = 0; i < N; i++) { const o = M["brow-observed"][i * 4 + 3], m = M["brow-mirror-fitted"][i * 4 + 3], sk = M["brow-safe-skin"][i * 4 + 3]; if (o || m) { fit[i * 4] = o && m ? 40 : m ? 230 : 0; fit[i * 4 + 1] = o && m ? 40 : m ? 0 : 170; fit[i * 4 + 2] = o && m ? 40 : m ? 180 : 80; } else if (sk) { fit[i * 4 + 2] = Math.round(fit[i * 4 + 2] * 0.7); } }
  save("b02-brows-before-after-fill-fit-x3.png", grid([crop(flat(before), BB, 3), crop(flat(after), BB, 3), crop(ov, BB, 3), crop(fit, BB, 3)], 1));
  save("b03-with-hair-d189-d190.png", grid([crop(flat(HD.composeHead(build.base.layers)), HB), crop(flat(HD.composeHead(build.layers)), HB)], 2));
  for (const [w, h] of [[360, 540], [180, 270], [52, 78]]) save(`b04-display-${w}x${h}.png`, grid([down(flat(before), w, h), down(flat(after), w, h)], 2));
  return { files, headPixelSha256: pixelSha256(HD.composeHead(build.layers)) };
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export function variantReportHtml(variant) {
  const st = (c) => (c.ok === true ? "BESTÅET" : c.ok === false ? "FEJL" : "IKKE ANVENDELIG"), man = variant.tracked.man, s = man.stats, ch = man.changesVsD189;
  const rows = variant.checks.checks.map((c) => `<tr class="${c.ok === false ? "bad" : "ok"}"><td>${esc(c.id)}</td><td>${esc(c.kind)}</td><td>${st(c)}</td><td>${esc(c.name)}</td><td><code>${esc(JSON.stringify(c.value))}</code></td></tr>`).join("");
  const fig = (n, cap) => `<figure><img src="${n}" alt="${esc(cap)}" loading="lazy"><figcaption>${esc(cap)}</figcaption></figure>`;
  return `<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>R3 Northstar-bryn</title>
<style>:root{--bg:#fbfaf7;--fg:#1d1b18;--mut:#6b655c;--line:#e3ddd2;--ok:#1f7a3d;--bad:#b3261e;--card:#fff}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#17150f;--fg:#ece7dd;--mut:#a39c90;--line:#3a352c;--ok:#5cc27e;--bad:#ff8a80;--card:#211e17}}
:root[data-theme="dark"]{--bg:#17150f;--fg:#ece7dd;--mut:#a39c90;--line:#3a352c;--ok:#5cc27e;--bad:#ff8a80;--card:#211e17}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}main{max-width:1100px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:26px;margin:0 0 4px}h2{font-size:19px;margin:36px 0 10px;border-bottom:1px solid var(--line);padding-bottom:6px}.lede{color:var(--mut);margin:0 0 18px}
figure{margin:14px 0 22px;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px;overflow-x:auto}figure img{display:block;max-width:none;margin:0 auto}figcaption{color:var(--mut);font-size:13px;margin-top:8px}
table{border-collapse:collapse;width:100%;font-size:13px}td,th{border-bottom:1px solid var(--line);padding:5px 6px;text-align:left;vertical-align:top}code{font-size:12px;word-break:break-all}.tw{overflow-x:auto}
tr.ok td:nth-child(3){color:var(--ok);font-weight:600}tr.bad td:nth-child(3){color:var(--bad);font-weight:700}</style></head><body><main>
<h1>R3-reviewvariant: komplet venstre bryn (D-158-spejling)</h1>
<p class="lede">${esc(man.status)}. R3 forbliver default OFF.</p>
<p>Akse x = ${s.axis} (midten af øjnenes tyngdepunkter). Rå spejling: ${s.raw.skin} px på sikker hud, IoU ${s.raw.iou}. Fit: kun translation tx = ${s.fit.tx}, ty = ${s.fit.ty}, ingen rotation, ingen skalering; 0 px på sikker hud, IoU ${s.fit.iou}, recall ${s.fit.recall} (målt hvor brynet kan observeres). Udfyldt: ${s.filledPx} px — rekonstrueret, ikke observeret. Med hår ændres ${ch.compositeWithHair.changedPx} px med højst ${ch.compositeWithHair.maxRgb}/255, alle under dækkende hår; ${ch.layerPxOutsideFill} px ændret uden for udfyldningsmasken.</p>
<h2>Uden hår: D-189 og D-190</h2>${fig("b01-bald-d189-d190.png", "Det skaldede hoved før (D-189) og efter (D-190).")}
<h2>Brynene forstørret</h2>${fig("b02-brows-before-after-fill-fit-x3.png", "×3: før · efter · udfyldning markeret orange · fit: grøn = kun observeret, magenta = kun spejlet, mørk = begge; sikker hud svagt tonet.")}
<h2>Med hår</h2>${fig("b03-with-hair-d189-d190.png", "Med hår: D-189 og D-190 (forskellen er højst 2/255 under håret).")}
<h2>Visningsstørrelser</h2>${["360x540", "180x270", "52x78"].map((x) => fig(`b04-display-${x}.png`, `${x.replace("x", "×")}: uden hår, før og efter.`)).join("")}
<h2>Uløst</h2><ul><li>Små mørke rester af hårlokkens kant ved brynets højre overkant (x ≈ 465–470) er observerede pixels og bevares efter D-158.</li><li>Brynets lys og skygge er spejlet med formen (lyset kommer fra den modsatte side i den udfyldte del).</li><li>Sclera bag irisen, nye udtryk og lukkede øjenlåg.</li></ul>
<h2>Kontroller</h2><div class="tw"><table><thead><tr><th>Id</th><th>Art</th><th>Resultat</th><th>Hvad</th><th>Værdi</th></tr></thead><tbody>${rows}</tbody></table></div>
</main></body></html>
`;
}
