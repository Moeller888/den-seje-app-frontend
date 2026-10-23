// R3 REVIEW "northstar-afro" (D-192). Rebuilds the full-resolution afro derivative on the unchanged D-191 head, measures it
// (brows, cranium, canvas edges, components, hairline scallops, the unchanged Northstar and short situations), and writes the
// owner-review images beside Northstar's hair and short. Technically passed is reported apart from the visual judgement.
// REVIEW DERIVATIVE: not approved, not promotable. No image call, no runtime change; R3 stays default OFF.
// Entry: node tools/avatar/r3-review-pack.mjs --variant northstar-afro --out <empty dir>
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng, decodePng, pixelSha256 } from "./r3-hair-tool-v2.mjs";
import * as NL from "./r3-northstar-layers.mjs";
import * as HD from "./r3-northstar-head.mjs";
import * as HS from "./r3-northstar-hairstyles.mjs";
import * as AF from "./r3-northstar-afro.mjs";

const W = 1024, H = 1536, N = W * H;
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const sha = (b) => createHash("sha256").update(b).digest("hex");
export const VARIANT = "northstar-afro";
/** The radial depth of the curl scallops at the hairline: skin may show between the curls this close to the target hairline. */
export const SCALLOP_BAND_PX = 8;

/** The measurements: brows, cranium, canvas edges, components, hairline scallops. */
export function measure(build, spec = AF.loadSpec()) {
  const L = build.head.layers, A = build.layers.afro, back = build.layers.backHair, h = spec.hairline;
  const browCov = {}; for (const side of ["browL", "browR"]) { let n = 0, c = 0; for (let i = 0; i < N; i++) { if (L[side][i * 4 + 3] < 128) continue; n++; if (A[i * 4 + 3] >= 128) c++; } browCov[side] = { browPx: n, coveredPx: c }; }
  // cranium: the bald head's painted cranium that shows without hair. Inside the target hairline it is forehead (meant to show);
  // in the scallop band (≤ SCALLOP_BAND_PX radially outside it) skin shows between the curls; beyond the band all of it must be covered
  const vis = decodePng(HD.loadTracked().files["cranium-visible-new"]).px; let band = 0, bandCov = 0, beyond = 0, beyondCov = 0, forehead = 0;
  for (let i = 0; i < N; i++) { if (!vis[i * 4 + 3]) continue; const dx = i % W + 0.5 - h.centre[0], dy = ((i / W) | 0) + 0.5 - h.centre[1], th = Math.atan2(dy, dx);
    const ex = Math.hypot(dx, dy) - 1 / Math.pow(Math.abs(Math.cos(th) / h.radii[0]) ** h.exponent + Math.abs(Math.sin(th) / h.radii[1]) ** h.exponent, 1 / h.exponent), cov = A[i * 4 + 3] >= 128 || back[i * 4 + 3] >= 128;
    if (ex < 0) forehead++; else if (ex <= SCALLOP_BAND_PX) { band++; if (cov) bandCov++; } else { beyond++; if (cov) beyondCov++; } }
  let edge = 0, top = H; for (let i = 0; i < N; i++) { if (!A[i * 4 + 3]) continue; const x = i % W, y = (i / W) | 0; top = Math.min(top, y); if (y < 4 || x < 4 || x > W - 5) edge++; }
  // 8-connected components of the opaque afro
  const seen = new Uint8Array(N), sizes = [];
  for (let s = 0; s < N; s++) { if (seen[s] || A[s * 4 + 3] < 128) continue; let n = 0; const st = [s]; seen[s] = 1; while (st.length) { const i = st.pop(); n++; const x = i % W; for (const j of [i - 1, i + 1, i - W, i + W, i - W - 1, i - W + 1, i + W - 1, i + W + 1]) { if (j < 0 || j >= N || seen[j] || A[j * 4 + 3] < 128) continue; const xx = j % W; if (Math.abs(xx - x) > 1) continue; seen[j] = 1; st.push(j); } } sizes.push(n); }
  sizes.sort((a, b) => b - a);
  // hairline scallops: the high-pass roughness of the inner hairline radius before and after the shift, over the shifted angles
  const rough = (P) => { const Ak = h.angularSamples, r = new Float32Array(Ak); for (let k = 0; k < Ak; k++) { const th = (k / Ak) * 2 * Math.PI; r[k] = -1; for (let q = 0; q < 400; q += 0.5) { const x = Math.round(h.centre[0] + q * Math.cos(th)), y = Math.round(h.centre[1] + q * Math.sin(th)); if (P[(y * W + x) * 4 + 3] >= 128) { r[k] = q; break; } } }
    let s = 0, n = 0; for (let k = 0; k < Ak; k++) { const th = (k / Ak) * 2 * Math.PI; if (Math.sin(th) > -0.2 || r[k] < 0) continue; let m = 0, c = 0; for (let j = -12; j <= 12; j++) { const v = r[(k + j + Ak) % Ak]; if (v >= 0) { m += v; c++; } } s += (r[k] - m / c) ** 2; n++; } return +Math.sqrt(s / n).toFixed(2); };
  return { browCoverage: browCov, cranium: { foreheadWindowPx: forehead, scallopBandPx: band, scallopBandCoveredPx: bandCov, beyondBandPx: beyond, beyondBandCoveredPx: beyondCov }, canvas: { topRow: top, pxWithin4OfEdge: edge }, components: { count: sizes.length, largest: sizes[0], smallUnder50: sizes.filter((v) => v < 50).length }, hairlineRoughnessPx: { before: rough(build.placed), after: rough(A) }, stats: build.stats };
}

export function buildVariant() { const tracked = AF.loadTracked(), build = AF.buildAfro(); return { tracked, build, checks: runVariantChecks({ tracked, build }) }; }

export function runVariantChecks({ tracked, build }) {
  const out = [], add = (id, kind, ok, value, name) => out.push({ id, kind, ok, value, name }), man = tracked.man, spec = AF.loadSpec();
  add("SOURCE-D113", "binding", sha(readFileSync(join(REPO, ...spec.source.file.split("/")))) === spec.source.sha256, spec.source.sha256, "the full-resolution R2 afro original, pinned by D-113, read only (loadSource throws otherwise)");
  const d191 = sha(readFileSync(join(REPO, ...HS.MANIFEST_FILE.split("/"))));
  add("BASELINE-D191", "binding", man.baseline.manifestSha256 === d191, { d191ManifestSha256: d191 }, "the D-191 head and every older file are read through their pins and stay unchanged");
  const hs = HS.loadTracked().man;
  const unchanged = ["northstar", "short", "bald", "afro"].every((s) => pixelSha256(HS.composeSituation(build.head, s)) === hs.situations[s]);
  add("D191-SITUATIONS-UNCHANGED", "binding", unchanged, Object.keys(hs.situations), "Northstar's hair, short, the bald head and D-191's UNSUITABLE afro compose exactly as recorded by D-191");
  const pins = {}; for (const k of AF.LAYERS) pins[k] = pixelSha256(build.layers[k]) === man.layers[k].pixelSha256 && pixelSha256(decodePng(tracked.files[k]).px) === man.layers[k].pixelSha256;
  for (const k of AF.MASKS) pins[k] = pixelSha256(build.masks[k]) === man.masks[k].pixelSha256 && pixelSha256(decodePng(tracked.files[k]).px) === man.masks[k].pixelSha256;
  add("REBUILD", "binding", Object.values(pins).every(Boolean), pins, "the afro, the back hair and every mask equal their tracked files and manifest pixel hashes");
  const m = measure(build, spec);
  add("MEASUREMENTS", "binding", JSON.stringify(m) === JSON.stringify(man.measurements), m, "every measurement equals the recorded one (pinned)");
  add("BROWS-CLEAR", "technical", m.browCoverage.browL.coveredPx === 0 && m.browCoverage.browR.coveredPx === 0, m.browCoverage, "no opaque afro pixel on either brow");
  add("CRANIUM-COVERED", "technical", m.cranium.beyondBandCoveredPx === m.cranium.beyondBandPx, m.cranium, `the painted cranium more than ${SCALLOP_BAND_PX} px outside the target hairline is covered (by the afro or the back hair); in the scallop band skin shows between the curls`);
  add("NOT-CROPPED", "technical", m.canvas.pxWithin4OfEdge === 0 && m.canvas.topRow >= 8, m.canvas, "nothing within 4 px of the canvas edges; the top keeps its 8 px margin");
  add("ONE-MASS", "technical", m.components.smallUnder50 === 0, m.components, "the opaque afro has no loose speck under 50 px");
  add("SCALLOPS-KEPT", "technical", m.hairlineRoughnessPx.after >= 0.8 * m.hairlineRoughnessPx.before, m.hairlineRoughnessPx, "the hairline keeps at least 80 % of its curl roughness (not smoothed into an arc)");
  add("COMPOSITION", "binding", pixelSha256(AF.composeAfro(build)) === man.composite.afroPixelSha256, man.composite.afroPixelSha256, "back hair behind the head, the afro on top, no cast shadow");
  add("PROMOTION", "binding", AF.promotionStatus().promotable === false && (() => { try { AF.promote(); return false; } catch { return true; } })(), AF.promotionStatus(), "never promotable by passing checks");
  return { checks: out, firstFailure: out.find((c) => c.ok === false)?.id ?? null, measurements: m };
}

// ── images ──────────────────────────────────────────────────────────────────────────────────────────────────────
const flat = (P, bg = [255, 255, 255]) => { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) { const a = P[i * 4 + 3] / 255; for (let c = 0; c < 3; c++) o[i * 4 + c] = Math.round(P[i * 4 + c] * a + bg[c] * (1 - a)); o[i * 4 + 3] = 255; } return o; };
const crop = (P, [x0, y0, x1, y1], s = 1) => { const w = (x1 - x0) * s, h = (y1 - y0) * s, o = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const j = ((y0 + ((y / s) | 0)) * W + x0 + ((x / s) | 0)) * 4; o.set(P.subarray(j, j + 4), (y * w + x) * 4); } return { w, h, px: o }; };
function down(F, w2, h2) { const o = new Uint8ClampedArray(w2 * h2 * 4), sx = W / w2, sy = H / h2; for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) { const acc = [0, 0, 0]; let wt = 0; for (let yy = Math.floor(y * sy); yy < Math.ceil((y + 1) * sy); yy++) { const wy = Math.min(yy + 1, (y + 1) * sy) - Math.max(yy, y * sy); if (wy <= 0) continue; for (let xx = Math.floor(x * sx); xx < Math.ceil((x + 1) * sx); xx++) { const wx = Math.min(xx + 1, (x + 1) * sx) - Math.max(xx, x * sx); if (wx <= 0) continue; const k = wx * wy, j = (yy * W + xx) * 4; for (let c = 0; c < 3; c++) acc[c] += F[j + c] * k; wt += k; } } for (let c = 0; c < 3; c++) o[(y * w2 + x) * 4 + c] = Math.round(acc[c] / wt); o[(y * w2 + x) * 4 + 3] = 255; } return { w: w2, h: h2, px: o }; }
function grid(t, cols, gap = 10, bg = [255, 255, 255]) { const w = Math.max(...t.map((x) => x.w)), h = Math.max(...t.map((x) => x.h)), rows = Math.ceil(t.length / cols), Wd = cols * w + (cols - 1) * gap, Hd = rows * h + (rows - 1) * gap, o = new Uint8ClampedArray(Wd * Hd * 4); for (let i = 0; i < Wd * Hd; i++) { o.set(bg, i * 4); o[i * 4 + 3] = 255; } t.forEach((x, k) => { const ox = (k % cols) * (w + gap), oy = Math.floor(k / cols) * (h + gap); for (let y = 0; y < x.h; y++) o.set(x.px.subarray(y * x.w * 4, (y + 1) * x.w * 4), ((oy + y) * Wd + ox) * 4); }); return { w: Wd, h: Hd, px: o }; }
const DARK = [38, 38, 46];

export function writeVariantReview(variant, OUT) {
  const files = {}, save = (n, img) => { const b = encodePng(img.w, img.h, img.px); writeFileSync(join(OUT, n), b); files[n] = { sha256: sha(b), w: img.w, h: img.h }; };
  const { build } = variant, afro = AF.composeAfro(build), sit = { northstar: HS.composeSituation(build.head, "northstar"), short: HS.composeSituation(build.head, "short"), afro }, HB = [150, 0, 870, 560];
  const order = ["northstar", "short", "afro"];
  save("a01-northstar-short-afro-light.png", grid(order.map((s) => crop(flat(sit[s]), HB)), 3));
  save("a02-northstar-short-afro-dark.png", grid(order.map((s) => crop(flat(sit[s], DARK), HB)), 3, 10, DARK));
  save("a03-afro-full-canvas-1x.png", { w: W, h: H, px: flat(afro) });
  for (const [w, h] of [[360, 540], [180, 270], [110, 165], [52, 78]]) save(`a04-display-${w}x${h}.png`, grid([...order.map((s) => down(flat(sit[s]), w, h)), ...order.map((s) => down(flat(sit[s], DARK), w, h))], 3, 10, [200, 200, 200]));
  const old = HS.composeSituation(build.head, "afro");
  save("a05-brows-hairline-x3-d191-vs-d192.png", grid([crop(flat(old), [380, 170, 640, 290], 3), crop(flat(afro), [380, 170, 640, 290], 3), crop(flat(afro, DARK), [380, 170, 640, 290], 3)], 1));
  save("a05-ears-x3.png", grid([crop(flat(afro), [300, 260, 440, 420], 3), crop(flat(afro), [584, 260, 724, 420], 3), crop(flat(afro, DARK), [300, 260, 440, 420], 3), crop(flat(afro, DARK), [584, 260, 724, 420], 3)], 2));
  save("a05-top-margin-x3.png", grid([crop(flat(afro), [330, 0, 700, 60], 3), crop(flat(afro, DARK), [330, 0, 700, 60], 3)], 1));
  const shiftImg = flat(afro), M = build.masks; for (let i = 0; i < N; i++) if (M["head-slit-fill"][i * 4 + 3]) shiftImg.set([230, 0, 180], i * 4);
  const hl = flat(afro); for (let i = 0; i < N; i++) if (M["hairline-shift"][i * 4 + 3]) for (let c = 0; c < 3; c++) hl[i * 4 + c] = Math.round(hl[i * 4 + c] * 0.5 + [255, 140, 0][c] * 0.5);
  save("a06-authoring-masks.png", grid([crop(flat(HS.composeSituation(build.head, "bald")), HB), crop(hl, HB), crop(shiftImg, HB)], 3));
  save("a07-placed-before-after-shift-x2.png", grid([crop(flat(NL.overStack([build.bald, HS.tint(build.placed)])), [340, 140, 680, 320], 2), crop(flat(afro), [340, 140, 680, 320], 2)], 1));
  save("a08-d191-unsuitable-vs-d192.png", grid([crop(flat(old), HB), crop(flat(afro), HB)], 2));
  return { files };
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export function variantReportHtml(variant) {
  const st = (c) => (c.ok === true ? "BESTÅET" : "FEJL"), man = variant.tracked.man, m = man.measurements;
  const rows = variant.checks.checks.map((c) => `<tr class="${c.ok ? "ok" : "bad"}"><td>${esc(c.id)}</td><td>${esc(c.kind)}</td><td>${st(c)}</td><td>${esc(c.name)}</td><td><code>${esc(JSON.stringify(c.value))}</code></td></tr>`).join("");
  const fig = (n, cap) => `<figure><img src="${n}" alt="${esc(cap)}" loading="lazy"><figcaption>${esc(cap)}</figcaption></figure>`;
  return `<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>R3 Northstar-afro</title>
<style>:root{--bg:#fbfaf7;--fg:#1d1b18;--mut:#6b655c;--line:#e3ddd2;--ok:#1f7a3d;--bad:#b3261e;--na:#8a6d00;--card:#fff}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#17150f;--fg:#ece7dd;--mut:#a39c90;--line:#3a352c;--ok:#5cc27e;--bad:#ff8a80;--na:#e0c060;--card:#211e17}}
:root[data-theme="dark"]{--bg:#17150f;--fg:#ece7dd;--mut:#a39c90;--line:#3a352c;--ok:#5cc27e;--bad:#ff8a80;--na:#e0c060;--card:#211e17}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}main{max-width:1100px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:26px;margin:0 0 4px}h2{font-size:19px;margin:36px 0 10px;border-bottom:1px solid var(--line);padding-bottom:6px}.lede{color:var(--mut);margin:0 0 18px}
figure{margin:14px 0 22px;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px;overflow-x:auto}figure img{display:block;max-width:none;margin:0 auto}figcaption{color:var(--mut);font-size:13px;margin-top:8px}
table{border-collapse:collapse;width:100%;font-size:13px}td,th{border-bottom:1px solid var(--line);padding:5px 6px;text-align:left;vertical-align:top}code{font-size:12px;word-break:break-all}.tw{overflow-x:auto}
tr.ok td:nth-child(3){color:var(--ok);font-weight:600}tr.bad td:nth-child(3){color:var(--bad);font-weight:700}.warn{border-left:4px solid var(--na);padding:8px 12px;background:var(--card)}</style></head><body><main>
<h1>R3-reviewafledning: afro til Northstar-v2-hovedet</h1>
<p class="lede">${esc(man.status)}. R3 forbliver default OFF.</p>
<p class="warn">Kilde: R2-afroens fuldopløselige original (1024×1536, D-111/D-113; webp-filen er dens ÷2-nedskalering), dokumenteret ægte opløsning. Én placering, en blød radial forskydning af afroens egen hårgrænse og en lille, nytegnet baghårsflade bag hovedet, kun i D-191-hovedets sprække ved øret. Ingen slagskygge (begrundet nedenfor). Teknisk bestået er ikke det samme som visuelt egnet — se vurderingen.</p>
<h2>Northstar-hår, short og afro på samme hoved og skala</h2>${fig("a01-northstar-short-afro-light.png", "Lys baggrund: Northstar-hår · short (D-191) · afro (D-192).")}${fig("a02-northstar-short-afro-dark.png", "Mørk baggrund.")}
<h2>Fuld opløsning</h2>${fig("a03-afro-full-canvas-1x.png", "Hele lærredet 1024×1536, 1:1.")}
<h2>Visningsstørrelser</h2>${["360x540", "180x270", "110x165", "52x78"].map((x) => fig(`a04-display-${x}.png`, `${x.replace("x", "×")}: Northstar · short · afro, lys række og mørk række.`)).join("")}
<h2>Forstørret</h2>${fig("a05-brows-hairline-x3-d191-vs-d192.png", "Bryn og hårgrænse ×3: D-191's uegnede afro · D-192 · D-192 på mørk.")}${fig("a05-ears-x3.png", "Ører og tindinger ×3: venstre, højre; lys og mørk.")}${fig("a05-top-margin-x3.png", "Topmargin ×3: lys og mørk (8 px til lærredets kant).")}
<h2>Authoring</h2>${fig("a06-authoring-masks.png", "Skaldet hoved · hårgrænsens forskydning (orange) · nytegnet baghår i den lukkede hovedsprække (magenta).")}${fig("a07-placed-before-after-shift-x2.png", "×2: placeret original før forskydningen (dækker brynene) · efter (krøllebuerne bevaret).")}${fig("a08-d191-unsuitable-vs-d192.png", "D-191's uegnede R2-512-afro · D-192.")}
<h2>Målinger</h2><ul>
<li>Bryndækning: venstre ${m.browCoverage.browL.coveredPx} / ${m.browCoverage.browL.browPx} px, højre ${m.browCoverage.browR.coveredPx} / ${m.browCoverage.browR.browPx} px.</li>
<li>Kraniedækning: uden for krøllebåndet (mere end ${SCALLOP_BAND_PX} px uden for målhårgrænsen) ${m.cranium.beyondBandCoveredPx} / ${m.cranium.beyondBandPx} px dækket; i krøllebåndet ${m.cranium.scallopBandCoveredPx} / ${m.cranium.scallopBandPx} px (hud mellem krøllebuerne, tilsigtet); pande inden for hårgrænsen ${m.cranium.foreheadWindowPx} px (tilsigtet).</li>
<li>Kantbeskæring: ${m.canvas.pxWithin4OfEdge} px inden for 4 px af lærredets kant; øverste række ${m.canvas.topRow}.</li>
<li>Komponenter: ${m.components.count} (største ${m.components.largest} px, ${m.components.smallUnder50} under 50 px).</li>
<li>Hårgrænsens krølleruhed: før ${m.hairlineRoughnessPx.before} px, efter ${m.hairlineRoughnessPx.after} px.</li>
<li>Forskydning: højst ${m.stats.maxHairlineShiftPx} px; ${m.stats.hairlineShiftPx} px flyttet ≥ 0,5 px. Nytegnet baghår (lukket hovedsprække): ${m.stats.headSlitFillPx} px.</li></ul>
<h2>Visuel vurdering</h2><p>${esc(man.visualAssessment)}</p>
<h2>Skygge</h2><p>${esc(AF.loadSpec().shadow)}</p>
<h2>Kontroller</h2><p class="lede">Første fejl: ${esc(variant.checks.firstFailure ?? "ingen")}.</p><div class="tw"><table><thead><tr><th>Id</th><th>Art</th><th>Resultat</th><th>Hvad</th><th>Værdi</th></tr></thead><tbody>${rows}</tbody></table></div>
</main></body></html>
`;
}
