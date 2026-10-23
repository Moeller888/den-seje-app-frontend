// R3 REVIEW "northstar-earfix-quiz" (D-193). (1) The shared head underlay's ear slit closed: checks (source binding, rebuild,
// the exact mask, nothing outside it changed, the layer order, no doubled D-192 back hair, the slit closed) and before/after
// views with and without hair. (2) The reproducible quiz-view review (r3-review-quiz.mjs) beside one shared backdrop proposal.
// Technically passed is reported apart from the visual judgement. REVIEW ONLY: nothing is promotable, the active quiz and the
// theme colours are unchanged, R3 stays default OFF.
// Entry: node tools/avatar/r3-review-pack.mjs --variant northstar-earfix-quiz --out <empty dir>
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng, decodePng, pixelSha256 } from "./r3-hair-tool-v2.mjs";
import * as NL from "./r3-northstar-layers.mjs";
import * as HD from "./r3-northstar-head.mjs";
import * as HS from "./r3-northstar-hairstyles.mjs";
import * as AF from "./r3-northstar-afro.mjs";
import * as EF from "./r3-northstar-earfix.mjs";
import * as Q from "./r3-review-quiz.mjs";

const W = 1024, N = W * 1536;
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const sha = (b) => createHash("sha256").update(b).digest("hex");
const rel = (p) => readFileSync(join(REPO, ...p.split("/")));
export const VARIANT = "northstar-earfix-quiz";

/** D-191's situations (brown review tint; the D-192 afro with its back-hair fill) beside the fixed head's. */
export function situations(build, afro = EF.loadD192Afro()) {
  const bald0 = HS.composeSituation(build.head, "bald");
  const before = { bald: bald0, northstar: HS.composeSituation(build.head, "northstar"), short: HS.composeSituation(build.head, "short"), afro: NL.overStack([HS.tint(afro.backHair), bald0, HS.tint(afro.afro)]) };
  const after = Object.fromEntries(EF.SITUATIONS.map((s) => [s, EF.composeSituation(build, s, HS.HAIR_TOKEN_BROWN, afro)]));
  return { before, after };
}
/** The change per situation against D-191, outside and inside the mask (inside: the visible change over white and black). */
export function changeReport(build, sit = situations(build)) {
  const M = build.mask, out = {};
  for (const s of EF.SITUATIONS) {
    const a = sit.before[s], b = sit.after[s]; let outside = 0, inside = 0; const bands = { "0": 0, "1-4": 0, "5-16": 0, ">16": 0 }, big = [];
    for (let i = 0; i < N; i++) {
      let d = 0; for (const bg of [0, 255]) for (let c = 0; c < 3; c++) { const f = (P) => P[i * 4 + c] * P[i * 4 + 3] / 255 + bg * (1 - P[i * 4 + 3] / 255); d = Math.max(d, Math.abs(f(a) - f(b))); }
      d = Math.round(d); if (!M[i]) { if (d) outside++; continue; } inside++; bands[d === 0 ? "0" : d <= 4 ? "1-4" : d <= 16 ? "5-16" : ">16"]++; if (d > 16) big.push({ x: i % W, y: (i / W) | 0, alphaBefore: a[i * 4 + 3] });
    }
    out[s] = { changedOutsideMaskPx: outside, maskPx: inside, insideBands: bands, over16: big };
  }
  return out;
}

export function buildVariant() { const tracked = EF.loadTracked(), build = EF.buildEarFix(); return { tracked, build, checks: runVariantChecks({ tracked, build }) }; }

export function runVariantChecks({ tracked, build }) {
  const out = [], add = (id, kind, ok, value, name) => out.push({ id, kind, ok, value, name }), man = tracked.man, afro = EF.loadD192Afro();
  const d191 = sha(rel(HS.MANIFEST_FILE)), d192 = sha(rel(AF.MANIFEST_FILE));
  add("BASELINE-D191", "binding", man.baseline.manifestSha256 === d191, { d191ManifestSha256: d191 }, "the D-191 head is read through its pins and stays unchanged");
  add("D192-UNCHANGED", "binding", man.afroSource.manifestSha256 === d192, { d192ManifestSha256: d192 }, "the D-192 afro and its back-hair fill are read through D-192's pins and stay unchanged");
  const pins = { skin: pixelSha256(build.layers.skin) === man.layers.skin.pixelSha256 && pixelSha256(decodePng(tracked.files.skin).px) === man.layers.skin.pixelSha256, "ear-slit": pixelSha256(build.masks["ear-slit"]) === man.masks["ear-slit"].pixelSha256 && pixelSha256(decodePng(tracked.files["ear-slit"]).px) === man.masks["ear-slit"].pixelSha256 };
  add("REBUILD", "binding", pins.skin && pins["ear-slit"] && JSON.stringify(build.stats) === JSON.stringify(man.stats), pins, "the fixed skin layer and the mask equal their tracked files; the stats are pinned");
  const L0 = build.head.layers, changedLayers = Object.keys(L0).filter((k) => pixelSha256(L0[k]) !== pixelSha256(build.layers[k]));
  let skinOutside = 0; for (let i = 0; i < N; i++) if (!build.mask[i]) for (let c = 0; c < 4; c++) if (L0.skin[i * 4 + c] !== build.layers.skin[i * 4 + c]) { skinOutside++; break; }
  add("LAYER-ORDER", "binding", JSON.stringify([...HD.COMPOSITE_ORDER]) === JSON.stringify(man.compositeOrder) && JSON.stringify(changedLayers) === '["skin"]' && skinOutside === 0, { compositeOrder: HD.COMPOSITE_ORDER, changedLayers, skinChangedOutsideMaskPx: skinOutside }, "the composite order is unchanged; only the skin layer changes, only inside the mask");
  const sit = situations(build, afro), ch = changeReport(build, sit);
  add("CHANGES", "binding", JSON.stringify(ch) === JSON.stringify(man.changesVsD191), ch, "the change against D-191 per situation equals the recorded one (pinned)");
  const outsideOk = ch.bald.changedOutsideMaskPx === 0 && ch.short.changedOutsideMaskPx === 0 && ch.northstar.changedOutsideMaskPx === 0;
  let bhOut = 0, bhIn = 0; for (let i = 0; i < N; i++) if (afro.backHair[i * 4 + 3]) { if (build.mask[i]) bhIn++; else bhOut++; }
  add("OUTSIDE-MASK-KEPT", "technical", outsideOk && ch.afro.changedOutsideMaskPx === bhOut, { bald: 0, short: 0, northstar: 0, afro: ch.afro.changedOutsideMaskPx, d192BackHairOutsideMaskPx: bhOut }, "bald, short and Northstar keep every pixel outside the mask; the afro differs outside it only where D-192's back hair is no longer drawn");
  const nsOk = ch.northstar.insideBands["5-16"] === 0 && ch.northstar.over16.every((p) => p.alphaBefore < 128);
  add("NORTHSTAR-DEFAULT", "technical", nsOk, ch.northstar, "with Northstar's hair the mask changes at most 4/255, except where Northstar too showed the background (alpha < 128): those pixels are now closed");
  const two = NL.overStack([HS.tint(afro.backHair), sit.after.bald, HS.tint(afro.afro)]); let doubled = 0; for (let i = 0; i < N; i++) if (build.mask[i] && afro.backHair[i * 4 + 3]) for (let c = 0; c < 4; c++) if (two[i * 4 + c] !== sit.after.afro[i * 4 + c]) { doubled++; break; }
  add("NO-DOUBLE-FILL", "technical", doubled === 0 && bhIn + bhOut === afro.backHair.reduce((s, v, k) => s + (k % 4 === 3 && v ? 1 : 0), 0), { d192BackHairInMaskPx: bhIn, d192BackHairOutsideMaskPx: bhOut, differsUnderMaskPx: doubled }, "the afro composes WITHOUT D-192's back-hair fill: under the mask the head covers it (it would change nothing), so the fill is never laid twice");
  let open = 0; for (let i = 0; i < N; i++) if (build.mask[i] && sit.after.bald[i * 4 + 3] < 255) open++;
  add("SLIT-CLOSED", "technical", open === 0 && build.stats.slitLeftPx > 0 && build.stats.slitRightPx > 0, { openMaskPx: open, left: build.stats.slitLeftPx, right: build.stats.slitRightPx }, "every mask pixel is opaque in the bald head; both ears are fixed");
  add("PROMOTION", "binding", EF.promotionStatus().promotable === false && (() => { try { EF.promote(); return false; } catch { return true; } })(), EF.promotionStatus(), "never promotable by passing checks");
  return { checks: out, firstFailure: out.find((c) => c.ok === false)?.id ?? null, changes: ch };
}

// ── images ──────────────────────────────────────────────────────────────────────────────────────────────────────
const flat = (P, bg) => { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) { const a = P[i * 4 + 3] / 255; for (let c = 0; c < 3; c++) o[i * 4 + c] = Math.round(P[i * 4 + c] * a + bg[c] * (1 - a)); o[i * 4 + 3] = 255; } return o; };
const crop = (P, [x0, y0, x1, y1], s = 1) => { const w = (x1 - x0) * s, h = (y1 - y0) * s, o = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const j = ((y0 + ((y / s) | 0)) * W + x0 + ((x / s) | 0)) * 4; o.set(P.subarray(j, j + 4), (y * w + x) * 4); } return { w, h, px: o }; };
function grid(t, cols, gap = 8) { const w = Math.max(...t.map((x) => x.w)), h = Math.max(...t.map((x) => x.h)), rows = Math.ceil(t.length / cols), Wd = cols * w + (cols - 1) * gap, Hd = rows * h + (rows - 1) * gap, o = new Uint8ClampedArray(Wd * Hd * 4).fill(255); t.forEach((x, k) => { const ox = (k % cols) * (w + gap), oy = Math.floor(k / cols) * (h + gap); for (let y = 0; y < x.h; y++) o.set(x.px.subarray(y * x.w * 4, (y + 1) * x.w * 4), ((oy + y) * Wd + ox) * 4); }); return { w: Wd, h: Hd, px: o }; }
const GREEN = [60, 220, 60], EARS = [[360, 285, 430, 395], [594, 285, 664, 395]];

export function writeVariantReview(variant, OUT) {
  const files = {}, save = (n, img, what) => { const b = encodePng(img.w, img.h, img.px); writeFileSync(join(OUT, n), b); files[n] = { sha256: sha(b), w: img.w, h: img.h, what }; };
  const { build } = variant, sit = situations(build), blackShort = { before: NL.overStack([sit.before.bald, HS.tint(build.head.styles.short, Q.hairToken("black"))]), after: EF.composeSituation(build, "short", Q.hairToken("black")) };
  for (const [name, pair] of [["bald", { before: sit.before.bald, after: sit.after.bald }], ["short-black", blackShort], ["short-brown", { before: sit.before.short, after: sit.after.short }], ["northstar", { before: sit.before.northstar, after: sit.after.northstar }], ["afro", { before: sit.before.afro, after: sit.after.afro }]])
    save(`e01-${name}-ears-before-after-x6.png`, grid(EARS.flatMap((r) => [crop(flat(pair.before, GREEN), r, 6), crop(flat(pair.after, GREEN), r, 6)]), 4), `${name}: left ear before | after, right ear before | after (×6, green = transparent)`);
  const m = flat(sit.after.bald, [255, 255, 255]); for (let i = 0; i < N; i++) if (build.mask[i]) m.set([255, 0, 200, 255], i * 4);
  save("e02-ear-slit-mask-x6.png", grid(EARS.map((r) => crop(m, r, 6)), 2), "the mask (magenta) on the fixed bald head (×6)");
  save("e03-head-before-after-1x.png", grid([crop(flat(sit.before.bald, GREEN), [300, 150, 724, 560]), crop(flat(sit.after.bald, GREEN), [300, 150, 724, 560]), crop(flat(blackShort.before, GREEN), [300, 150, 724, 560]), crop(flat(blackShort.after, GREEN), [300, 150, 724, 560])], 4), "1:1 — bald before | after, short (black) before | after");
  return { files };
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export function variantReportHtml(variant, quiz, files) {
  const man = variant.tracked.man, qs = Q.loadSpec(), st = (c) => (c.ok === true ? "BESTÅET" : "FEJL");
  const rows = variant.checks.checks.map((c) => `<tr class="${c.ok ? "ok" : "bad"}"><td>${esc(c.id)}</td><td>${esc(c.kind)}</td><td>${st(c)}</td><td>${esc(c.name)}</td><td><code>${esc(JSON.stringify(c.value))}</code></td></tr>`).join("");
  const fig = (n, cap, actual) => `<figure><img src="${n}" alt="${esc(cap)}" loading="lazy"${actual ? ` width="${Math.round(files[n].w / actual)}"` : ""}><figcaption>${esc(cap)}</figcaption></figure>`;
  const ratio = (d, t, mode, s) => { const m = quiz.measures.find((x) => x.dpr === d && x.theme === t && x.mode === mode && x.style === s); return m && m.contrast && m.contrast.ratio !== null ? m.contrast.ratio.toFixed(2).replace(".", ",") : "–"; };
  const ctab = qs.dprs.map((d) => `<h3>DPR ${d}</h3><div class="tw"><table><thead><tr><th>Tema</th>${qs.styles.map((s) => `<th>${esc(s.label)}</th>`).join("")}</tr></thead><tbody>${qs.themes.map((t) => `<tr><td>${t}</td>${qs.styles.map((s) => `<td>${ratio(d, t, "current", s.id)} → ${ratio(d, t, "proposal", s.id)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`).join("");
  return `<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>R3 øre og quiz</title>
<style>:root{--bg:#fbfaf7;--fg:#1d1b18;--mut:#6b655c;--line:#e3ddd2;--ok:#1f7a3d;--bad:#b3261e;--na:#8a6d00;--card:#fff}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#17150f;--fg:#ece7dd;--mut:#a39c90;--line:#3a352c;--ok:#5cc27e;--bad:#ff8a80;--na:#e0c060;--card:#211e17}}
:root[data-theme="dark"]{--bg:#17150f;--fg:#ece7dd;--mut:#a39c90;--line:#3a352c;--ok:#5cc27e;--bad:#ff8a80;--na:#e0c060;--card:#211e17}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}main{max-width:1100px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:26px;margin:0 0 4px}h2{font-size:19px;margin:36px 0 10px;border-bottom:1px solid var(--line);padding-bottom:6px}h3{font-size:15px;margin:18px 0 6px}.lede{color:var(--mut);margin:0 0 18px}
figure{margin:14px 0 22px;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px;overflow-x:auto}figure img{display:block;max-width:none;margin:0 auto;image-rendering:pixelated}figcaption{color:var(--mut);font-size:13px;margin-top:8px}
table{border-collapse:collapse;width:100%;font-size:13px;font-variant-numeric:tabular-nums}td,th{border-bottom:1px solid var(--line);padding:5px 6px;text-align:left;vertical-align:top}code{font-size:12px;word-break:break-all}.tw{overflow-x:auto}
tr.ok td:nth-child(3){color:var(--ok);font-weight:600}tr.bad td:nth-child(3){color:var(--bad);font-weight:700}.warn{border-left:4px solid var(--na);padding:8px 12px;background:var(--card)}</style></head><body><main>
<h1>R3: fælles øresprække lukket og quiz-visning</h1>
<p class="lede">${esc(man.status)}. Den aktive quiz, temafarverne og håraktiverne er uændrede. R3 forbliver default OFF.</p>
<p class="warn">${esc(qs.bodyMissing)}</p>
<h2>1 · Den fælles hovedrettelse</h2>
<p>${esc(EF.loadSpec().slit.rule)}</p>
${fig("e01-bald-ears-before-after-x6.png", files["e01-bald-ears-before-after-x6.png"].what)}${fig("e01-short-black-ears-before-after-x6.png", files["e01-short-black-ears-before-after-x6.png"].what)}${fig("e01-short-brown-ears-before-after-x6.png", files["e01-short-brown-ears-before-after-x6.png"].what)}${fig("e01-northstar-ears-before-after-x6.png", files["e01-northstar-ears-before-after-x6.png"].what)}${fig("e01-afro-ears-before-after-x6.png", files["e01-afro-ears-before-after-x6.png"].what)}${fig("e02-ear-slit-mask-x6.png", files["e02-ear-slit-mask-x6.png"].what)}${fig("e03-head-before-after-1x.png", files["e03-head-before-after-1x.png"].what)}
<p>Maske: ${man.stats.slitPx} px (venstre ${man.stats.slitLeftPx}, højre ${man.stats.slitRightPx}). Uden for masken ændres 0 px i bald, short og Northstar. Med Northstar-hår ændres masken højst 4/255, bortset fra ${variant.checks.changes.northstar.over16.length} px, hvor også Northstar viste baggrunden. Afroen bruges uden D-192's lokale baghår: ${man.afroSource.backHairInMaskPx} px af det dækkes nu af hovedet, ${man.afroSource.backHairOutsideMaskPx} px i hakket under øret tegnes ikke længere. Ikke rettet: ${man.stats.specksOutsideHeadPx} isolerede mørke støjpixels uden for hovedet under ørerne.</p>
<h2>2 · Quiz-visningen (52×78 CSS-px, sidens egne regler)</h2>
<p class="lede">Alle frisurer: samme lærred, samme placering og skala (sidens .quiz-avatar-layer, object-fit: contain). Rækker pr. tema: nuværende, forslag. Kolonner: ${qs.styles.map((s) => esc(s.label)).join(" · ")}.</p>
${qs.dprs.map((d) => fig(`q-boxes-dpr${d}-actual.png`, `DPR ${d}, faktisk størrelse (vist i CSS-px)`, d) + fig(`q-boxes-dpr${d}-enlarged.png`, `DPR ${d}, hovedet forstørret (nærmeste nabo)`)).join("")}
<h2>3 · Det fælles baggrundsforslag</h2>
<p>${esc(qs.proposal.what)}</p><p><code>${esc(qs.proposal.css)}</code></p>
<p>${esc(qs.proposal.finding)}</p>
<h3>Iterationer (ikke versionsstyret som forslag)</h3><ul>${qs.proposal.iterations.map((it) => `<li><b>${esc(it.id)}</b>: ${esc(it.result)}</li>`).join("")}</ul>
<h3>Silhuetkontrast (hårets yderbånd mod baggrundsringen, nuværende → forslag)</h3><p class="lede">Støttetal, aldrig en visuel godkendelse i sig selv. Avatarens egne uigennemsigtige pixels ændres højst ${Math.max(...Object.values(quiz.opaqueDiff))}/255 af forslaget.</p>${ctab}
<h2>Visuel vurdering</h2><p>${esc(man.visualAssessment)}</p>
<h2>Kontroller</h2><p class="lede">Første fejl: ${esc(variant.checks.firstFailure ?? "ingen")}.</p><div class="tw"><table><thead><tr><th>Id</th><th>Art</th><th>Resultat</th><th>Hvad</th><th>Værdi</th></tr></thead><tbody>${rows}</tbody></table></div>
</main></body></html>
`;
}
