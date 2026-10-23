// R3 REVIEW "northstar-figure" (D-194). The Northstar-based R3 head on Northstar v2's own body and clothes (a REFERENCE body):
// checks (source binding, unchanged head candidates, rebuild, the original body pixels, the neck seam, the layer order, the
// hair-lock residue, one framing for every hairstyle) and the review images (original vs the three figures at one scale, neck
// and ears enlarged, the residue before/after), plus the app's avatar views (r3-review-figure-views.mjs). Technically passed,
// visual proposal and the owner's missing approval are kept apart. Nothing is promotable; R3 stays default OFF.
// Entry: node tools/avatar/r3-review-pack.mjs --variant northstar-figure --out <empty dir>
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng, decodePng, pixelSha256 } from "./r3-hair-tool-v2.mjs";
import * as NL from "./r3-northstar-layers.mjs";
import * as HD from "./r3-northstar-head.mjs";
import * as EF from "./r3-northstar-earfix.mjs";
import * as FG from "./r3-northstar-figure.mjs";
import * as V from "./r3-review-figure-views.mjs";

const W = 1024, H = 1536, N = W * H;
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const sha = (b) => createHash("sha256").update(b).digest("hex");
const rel = (p) => readFileSync(join(REPO, ...p.split("/")));
export const VARIANT = "northstar-figure";
const BALD = HD.COMPOSITE_ORDER.filter((k) => k !== "hair" && k !== "hairShadow");
const vis = (P, i, bg, c) => P[i * 4 + c] * P[i * 4 + 3] / 255 + bg * (1 - P[i * 4 + 3] / 255);
const visDiff = (A, B, i) => { let d = 0; for (const bg of [0, 255]) for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(vis(A, i, bg, c) - vis(B, i, bg, c))); return Math.round(d); };

/** The three figures (brown review tint for short and afro). */
export function figures(build, afro = EF.loadD192Afro()) { return Object.fromEntries(FG.SITUATIONS.map((s) => [s, FG.composeFigure(build, s, undefined, afro)])); }

export function buildVariant() { const tracked = FG.loadTracked(), build = FG.buildFigure(); return { tracked, build, checks: runVariantChecks({ tracked, build }) }; }

export function runVariantChecks({ tracked, build }) {
  const out = [], add = (id, kind, ok, value, name) => out.push({ id, kind, ok, value, name }), man = tracked.man, spec = FG.loadSpec(), M = build.master;
  add("SOURCE", "binding", sha(rel(spec.source.file)) === spec.source.sha256 && spec.source.sha256 === NL.SOURCE.sha256, spec.source.sha256, "the tracked Northstar v2 (body and clothes as a direct source for this review only); no H1");
  const ef = sha(rel(EF.MANIFEST_FILE)), efMan = JSON.parse(rel(EF.MANIFEST_FILE).toString("utf8"));
  const headSame = Object.entries(efMan.situations).every(([s, h]) => pixelSha256(EF.composeSituation(build.ef, s, undefined, EF.loadD192Afro())) === h);
  add("BASELINE-D193", "binding", man.baseline.manifestSha256 === ef && headSame, { d193ManifestSha256: ef, d193SituationsUnchanged: headSame }, "the D-193 head candidates (bald, Northstar, short, afro) compose exactly as D-193 recorded: the baseline is unchanged");
  const pins = { body: pixelSha256(build.body) === man.pixels.body, skin: pixelSha256(build.layers.skin) === man.pixels.skin, hair: pixelSha256(build.layers.hair) === man.pixels.hair };
  for (const k of FG.MASKS) pins[k] = pixelSha256(build.masks[k]) === man.masks[k].pixelSha256 && pixelSha256(decodePng(tracked.files[k]).px) === man.masks[k].pixelSha256;
  add("REBUILD", "binding", Object.values(pins).every(Boolean) && JSON.stringify(build.stats) === JSON.stringify(man.stats), pins, "the body, the changed head layers and every mask equal their pinned pixel hashes; the stats are pinned");
  let kept = 0, keptBad = 0, aboveBad = 0, underBad = 0;
  for (let i = 0; i < N; i++) { const y = (i / W) | 0, j = i * 4;
    if (y < spec.body.seamY) { if (build.body[j + 3]) aboveBad++; continue; }
    if (build.under[i]) { if (build.body[j + 3]) underBad++; continue; }
    if (!build.seam[i]) { kept++; for (let c = 0; c < 4; c++) if (build.body[j + c] !== M[j + c]) { keptBad++; break; } } }
  add("BODY-ORIGINAL", "technical", keptBad === 0 && aboveBad === 0 && underBad === 0 && build.stats.masterAboveSeamUncoveredPx === 0, { originalPx: kept, changedOutsideSeamPx: keptBad, bodyAboveSeamPx: aboveBad, bodyUnderOpaqueHeadPx: underBad, masterAboveSeamUncoveredPx: build.stats.masterAboveSeamUncoveredPx }, "outside the seam mask the body IS the master's pixel; nothing of the body above the seam line or under the opaque head (no second neck, contour or collar)");
  const fig = figures(build); let seamMax = 0, belowMax = 0;
  for (let i = spec.body.seamY * W; i < N; i++) { const d = visDiff(fig.northstar, M, i); belowMax = Math.max(belowMax, d); if (build.seam[i]) seamMax = Math.max(seamMax, d); }
  add("NECK-SEAM", "technical", belowMax <= 1, { seamPx: build.stats.neckSeamPx, underHeadPx: build.stats.underHeadPx, maxVisibleDiffBelowSeam: belowMax, maxVisibleDiffInSeam: seamMax }, "with Northstar's hair the figure below the seam line composes back to the master (at most 1/255): the neck joins the collar as in the original");
  const changed = Object.keys(build.ef.layers).filter((k) => pixelSha256(build.ef.layers[k]) !== pixelSha256(build.layers[k]));
  let outside = 0; for (let i = 0; i < N; i++) if (!build.residue[i]) for (const k of changed) { let d = false; for (let c = 0; c < 4; c++) if (build.ef.layers[k][i * 4 + c] !== build.layers[k][i * 4 + c]) d = true; if (d) { outside++; break; } }
  const ordered = pixelSha256(fig.short) === pixelSha256(NL.overStack([build.body, EF.composeSituation({ layers: build.layers, head: build.ef.head }, "short")]));
  add("LAYER-ORDER", "binding", JSON.stringify([...HD.COMPOSITE_ORDER]) === JSON.stringify(man.compositeOrder) && JSON.stringify(changed) === '["skin","hair"]' && outside === 0 && ordered, { order: ["body", ...HD.COMPOSITE_ORDER], changedHeadLayers: changed, changedOutsideResidueMaskPx: outside }, "body first, then D-193's head order, the hair on top; only skin and hair change, only inside the residue mask");
  const bald = HD.composeHead(build.layers, { include: BALD }), { main } = EF.mainComponent(bald, 128); let loose = 0;
  for (let y = spec.residue.bandY[0]; y <= spec.residue.bandY[1]; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (bald[i * 4 + 3] >= 128 && !main[i]) loose++; }
  let nsRes = 0; const nsBefore = EF.composeSituation(build.ef, "northstar"), nsAfter = HD.composeHead(build.layers); for (let i = 0; i < N; i++) if (build.residue[i]) nsRes = Math.max(nsRes, visDiff(nsBefore, nsAfter, i));
  add("RESIDUE", "technical", build.stats.residuePx === 11 && loose === 0, { movedPx: build.stats.residuePx, opaqueSpecksLeftInBand: loose, northstarMaxDiffAtResidue: nsRes }, "the hair-lock residue below the right ear moved to the hair: no opaque loose speck is left near the ears without hair");
  const afroHair = EF.loadD192Afro().afro, a = [fig.northstar, fig.short, fig.afro];
  let sameBody = 0; for (let i = spec.body.seamY * W; i < N; i++) { const hairAny = build.layers.hair[i * 4 + 3] || build.ef.head.styles.short[i * 4 + 3] || afroHair[i * 4 + 3]; if (hairAny) continue; if (visDiff(a[0], a[1], i) || visDiff(a[0], a[2], i)) sameBody++; }
  add("ONE-FRAMING", "technical", sameBody === 0, { bodyDiffersBetweenStylesPx: sameBody }, "one figure: below the seam the three hairstyles differ only where their own hair lies — same body, same size, same head place");
  add("PROMOTION", "binding", FG.promotionStatus().promotable === false && (() => { try { FG.promote(); return false; } catch { return true; } })(), FG.promotionStatus(), "never promotable; the reference body is no R3 asset");
  return { checks: out, firstFailure: out.find((c) => c.ok === false)?.id ?? null };
}

// ── images ──────────────────────────────────────────────────────────────────────────────────────────────────────
const flat = (P, bg) => { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) { const a = P[i * 4 + 3] / 255; for (let c = 0; c < 3; c++) o[i * 4 + c] = Math.round(P[i * 4 + c] * a + bg[c] * (1 - a)); o[i * 4 + 3] = 255; } return o; };
const crop = (P, [x0, y0, x1, y1], s = 1) => { const w = (x1 - x0) * s, h = (y1 - y0) * s, o = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const j = ((y0 + ((y / s) | 0)) * W + x0 + ((x / s) | 0)) * 4; o.set(P.subarray(j, j + 4), (y * w + x) * 4); } return { w, h, px: o }; };
const down = (P, k) => { const w = W / k | 0, h = H / k | 0, o = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const acc = [0, 0, 0]; for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) for (let c = 0; c < 3; c++) acc[c] += P[((y * k + dy) * W + x * k + dx) * 4 + c]; o.set([...acc.map((v) => Math.round(v / (k * k))), 255], (y * w + x) * 4); } return { w, h, px: o }; };
function grid(t, cols, gap = 8) { const w = Math.max(...t.map((x) => x.w)), h = Math.max(...t.map((x) => x.h)), rows = Math.ceil(t.length / cols), Wd = cols * w + (cols - 1) * gap, Hd = rows * h + (rows - 1) * gap, o = new Uint8ClampedArray(Wd * Hd * 4).fill(255); t.forEach((x, k) => { const ox = (k % cols) * (w + gap), oy = Math.floor(k / cols) * (h + gap); for (let y = 0; y < x.h; y++) o.set(x.px.subarray(y * x.w * 4, (y + 1) * x.w * 4), ((oy + y) * Wd + ox) * 4); }); return { w: Wd, h: Hd, px: o }; }
const WHITE = [255, 255, 255], GREEN = [60, 220, 60];

export function writeVariantReview(variant, OUT) {
  const files = {}, save = (n, img, what) => { const b = encodePng(img.w, img.h, img.px); writeFileSync(join(OUT, n), b); files[n] = { sha256: sha(b), w: img.w, h: img.h, what }; };
  const { build } = variant, fig = figures(build), M = build.master;
  save("f01-original-and-figures-third.png", grid([M, fig.northstar, fig.short, fig.afro].map((P) => down(flat(P, WHITE), 3)), 4), "Original Northstar v2 · R3 + Northstar-hår · R3 + short · R3 + afro — samme skala (1/3)");
  save("f02-heads-1x.png", grid([M, fig.northstar, fig.short, fig.afro].map((P) => crop(flat(P, WHITE), [200, 0, 824, 620])), 4), "Hoveder 1:1: original · Northstar · short · afro");
  save("f03-neck-collar-x4.png", grid([M, fig.northstar, fig.short, fig.afro].map((P) => crop(flat(P, GREEN), [420, 420, 604, 520], 4)), 2), "Hals/krave ×4: original · Northstar · short · afro (grøn = gennemsigtig)");
  const seamView = flat(fig.short, WHITE); for (let i = 0; i < N; i++) { if (build.seam[i]) seamView.set([0, 200, 255, 255], i * 4); else if (build.under[i] && (i % 2 === 0)) { const j = i * 4; seamView[j] = Math.round(seamView[j] * 0.6 + 255 * 0.4); seamView[j + 1] = Math.round(seamView[j + 1] * 0.6 + 140 * 0.4); seamView[j + 2] = Math.round(seamView[j + 2] * 0.6); } }
  save("f04-neck-seam-mask-x4.png", crop(seamView, [420, 420, 604, 520], 4), "Samlingsmasken ×4: cyan = rekonstrueret kant (neck-seam), orange skravering = tomt under det uigennemsigtige hoved (under-head)");
  save("f05-ears-x6.png", grid(["northstar", "short", "afro"].flatMap((s) => [[350, 280, 430, 420], [594, 280, 674, 420]].map((r) => crop(flat(fig[s], GREEN), r, 6))), 6), "Ører ×6: venstre, højre for Northstar · short · afro");
  const before = EF.composeSituation(build.ef, "bald"), after = HD.composeHead(build.layers, { include: BALD }), mk = flat(after, GREEN); for (let i = 0; i < N; i++) if (build.residue[i]) mk.set([255, 0, 200, 255], i * 4);
  save("f06-residue-before-after-x8.png", grid([crop(flat(before, GREEN), [596, 370, 636, 402], 8), crop(mk, [596, 370, 636, 402], 8), crop(flat(after, GREEN), [596, 370, 636, 402], 8), crop(flat(HD.composeHead(build.layers), GREEN), [596, 370, 636, 402], 8)], 4), "Pletterne under højre øre ×8: D-193 uden hår · masken (magenta) · D-194 uden hår · D-194 med Northstar-hår");
  save("f07-residue-in-context-1x.png", grid([crop(flat(FG.composeFigure({ ...build, layers: build.ef.layers }, "short"), WHITE), [520, 300, 700, 480], 2), crop(flat(fig.short, WHITE), [520, 300, 700, 480], 2)], 2), "I sammenhæng ×2 med short: før (D-193-lag) · efter");
  return { files };
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export function variantReportHtml(variant, views, files) {
  const man = variant.tracked.man, spec = FG.loadSpec(), vs = V.loadViews(), st = (c) => (c.ok === true ? "BESTÅET" : "FEJL");
  const rows = variant.checks.checks.map((c) => `<tr class="${c.ok ? "ok" : "bad"}"><td>${esc(c.id)}</td><td>${esc(c.kind)}</td><td>${st(c)}</td><td>${esc(c.name)}</td><td><code>${esc(JSON.stringify(c.value))}</code></td></tr>`).join("");
  const fig = (n, cap, dpr) => `<figure><img src="${n}" alt="${esc(cap)}" loading="lazy"${dpr ? ` width="${Math.round(files[n].w / dpr)}"` : ""}><figcaption>${esc(cap)}</figcaption></figure>`;
  const n1 = (v) => (v === null || v === undefined ? "–" : String(v).replace(".", ","));
  const geo = vs.views.map((v) => { const ms = views.measures.filter((m) => m.view === v.id && m.dpr === 2 && m.theme === "default"); return `<tr><td>${esc(v.label)} ${v.css[0]}×${v.css[1]}</td>${["current", "framing"].map((mode) => { const g = (s) => ms.find((m) => m.mode === mode && m.style === s); return `<td>${n1(g("northstar").faceWidthCss)}</td><td>${n1(g("afro-black").topMarginCss)}</td><td>${n1(Math.min(g("afro-black").leftMarginCss, g("afro-black").rightMarginCss))}</td><td>${g("afro-black").clippedTop || g("afro-black").clippedSide ? "JA" : "nej"}</td>`; }).join("")}</tr>`; }).join("");
  const con = ["default", "pearl", "inferno", "forest"].map((t) => `<tr><td>${t}</td>${vs.styles.map((s) => `<td>${n1(views.measures.find((m) => m.view === "quiz" && m.dpr === 2 && m.theme === t && m.mode === "current" && m.style === s.id)?.contrast)}</td>`).join("")}</tr>`).join("");
  return `<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>R3 hel figur</title>
<style>:root{--bg:#fbfaf7;--fg:#1d1b18;--mut:#6b655c;--line:#e3ddd2;--ok:#1f7a3d;--bad:#b3261e;--na:#8a6d00;--card:#fff}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#17150f;--fg:#ece7dd;--mut:#a39c90;--line:#3a352c;--ok:#5cc27e;--bad:#ff8a80;--na:#e0c060;--card:#211e17}}
:root[data-theme="dark"]{--bg:#17150f;--fg:#ece7dd;--mut:#a39c90;--line:#3a352c;--ok:#5cc27e;--bad:#ff8a80;--na:#e0c060;--card:#211e17}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}main{max-width:1100px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:26px;margin:0 0 4px}h2{font-size:19px;margin:36px 0 10px;border-bottom:1px solid var(--line);padding-bottom:6px}h3{font-size:15px;margin:18px 0 6px}.lede{color:var(--mut);margin:0 0 18px}
figure{margin:14px 0 22px;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px;overflow-x:auto}figure img{display:block;max-width:none;margin:0 auto;image-rendering:pixelated}figcaption{color:var(--mut);font-size:13px;margin-top:8px}
table{border-collapse:collapse;width:100%;font-size:13px;font-variant-numeric:tabular-nums}td,th{border-bottom:1px solid var(--line);padding:5px 6px;text-align:left;vertical-align:top}code{font-size:12px;word-break:break-all}.tw{overflow-x:auto}
tr.ok td:nth-child(3){color:var(--ok);font-weight:600}tr.bad td:nth-child(3){color:var(--bad);font-weight:700}.warn{border-left:4px solid var(--na);padding:8px 12px;background:var(--card)}</style></head><body><main>
<h1>R3: hele figuren med referencekrop</h1>
<p class="lede">${esc(man.status)}. Den aktive UI er uændret. R3 forbliver default OFF.</p>
<p class="warn">${esc(spec.limits)}</p>
<h2>1 · Figuren</h2>${fig("f01-original-and-figures-third.png", files["f01-original-and-figures-third.png"].what)}${fig("f02-heads-1x.png", files["f02-heads-1x.png"].what)}
<p>${esc(spec.body.rule)}</p>
${fig("f03-neck-collar-x4.png", files["f03-neck-collar-x4.png"].what)}${fig("f04-neck-seam-mask-x4.png", files["f04-neck-seam-mask-x4.png"].what)}${fig("f05-ears-x6.png", files["f05-ears-x6.png"].what)}
<h2>2 · Pletterne under højre øre</h2><p>${esc(spec.residue.finding)} ${esc(spec.residue.rule)}</p>${fig("f06-residue-before-after-x8.png", files["f06-residue-before-after-x8.png"].what)}${fig("f07-residue-in-context-1x.png", files["f07-residue-in-context-1x.png"].what)}
<h2>3 · Avatarvisningerne (nuværende baggrund)</h2>
<p class="lede">Rækker pr. tema: nuværende visning, derefter det fælles beskæringsforslag. Kolonner: ${vs.styles.map((s) => esc(s.label)).join(" · ")}. ${esc(vs.rule)}.</p>
${vs.views.flatMap((v) => v.dprs.flatMap((d) => [fig(`v-${v.id}-dpr${d}-actual.png`, `${v.label}, ${v.css[0]}×${v.css[1]} CSS-px, DPR ${d}, faktisk størrelse`, d), fig(`v-${v.id}-dpr${d}-enlarged.png`, `${v.label}, DPR ${d}, forstørret (nærmeste nabo)`)])).join("")}
<h3>Placering (DPR 2, default; CSS-px)</h3><div class="tw"><table><thead><tr><th>Visning</th><th>Hovedbredde nu</th><th>Afro top nu</th><th>Afro side nu</th><th>Beskåret nu</th><th>Hovedbredde forslag</th><th>Afro top forslag</th><th>Afro side forslag</th><th>Beskåret forslag</th></tr></thead><tbody>${geo}</tbody></table></div>
<p>Hovedbredde = hovedets bredde inkl. ører. ${esc(vs.framingProposal.what)} Afvejning: skala 1,6 gør hovedet 60 % større; afroen beholder ca. 5 % luft i siden ved 52×78, og over ca. 1,8 ville den blive skåret i siderne; prisen er, at figuren skæres ved hofterne, så sko og ben forsvinder.</p>
<h3>Mørkt hår på mørke temaer (quiz, DPR 2, nuværende baggrund; silhuetkontrast, støttetal)</h3><div class="tw"><table><thead><tr><th>Tema</th>${vs.styles.map((s) => `<th>${esc(s.label)}</th>`).join("")}</tr></thead><tbody>${con}</tbody></table></div>
<h2>Visuel vurdering (forslag, ikke godkendelse)</h2><p>${esc(man.visualAssessment)}</p>
<h2>Kontroller (teknisk)</h2><p class="lede">Første fejl: ${esc(variant.checks.firstFailure ?? "ingen")}.</p><div class="tw"><table><thead><tr><th>Id</th><th>Art</th><th>Resultat</th><th>Hvad</th><th>Værdi</th></tr></thead><tbody>${rows}</tbody></table></div>
</main></body></html>
`;
}
