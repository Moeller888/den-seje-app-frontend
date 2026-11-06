// D-355 — the private DECISION PAGE of the 33 prepared tops (index.html in --out; it shows C and is never published). Reads only written
// files: the approval, the proposal (kitTopCombos), check's units, the staging manifest, equiv*.json, verify.json, the sheets (views/),
// the browser run (browser/: the selector previews and the figure sheets) and verdicts.json (written by hand after the visual review:
// per cut and bottom a verdict, and the combinations proposed for exclusion). Writes index.html and proposed-combinations.json.
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { approval, kitTopCombos, CUT_FAMILY, TOP_SPLIT } from "./northstar-kit-tops-d355.mjs";

const json = (f) => JSON.parse(readFileSync(f, "utf8")), esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const CUT_NAME = { "tee-hip-v2": "T-shirt (tee-hip-v2)", "sweater-long-v3": "Sweater (sweater-long-v3)", "tank-v5": "Tanktop (tank-v5)" };
const short = (x) => x.replace(/^bottom-/, "").replace(/^shoes-/, "");

export function writePage(AL, OUT, STG) {
  const A = approval(), C = kitTopCombos(AL, A), V = existsSync(join(OUT, "verdicts.json")) ? json(join(OUT, "verdicts.json")) : { groups: {}, exclude: [] }, excluded = new Set(V.exclude.map((e) => e.id));
  const units = Object.fromEntries(C.map((x) => [x.id, existsSync(join(OUT, "units", x.id + ".json")) ? json(join(OUT, "units", x.id + ".json")) : null]));
  const M = STG && existsSync(join(STG, "staging-manifest.json")) ? json(join(STG, "staging-manifest.json")) : null;
  const EQ = readdirSync(OUT).filter((f) => /^equiv(-[a-z0-9-]+)?\.json$/.test(f)).map((f) => json(join(OUT, f)));
  const sum = (k) => EQ.reduce((s, e) => s + (e.summary[k] || 0), 0), VF = existsSync(join(OUT, "verify.json")) ? json(join(OUT, "verify.json")) : null;
  const proposed = C.filter((x) => !excluded.has(x.id)).map((x) => ({ id: x.id, top: x.top, bottom: x.bottom, shoes: x.shoes, candidate: x.candidate, technical: units[x.id] ? units[x.id].technical : null, compositeSha256: units[x.id] ? units[x.id].compositeSha256 : null }));
  writeFileSync(join(OUT, "proposed-combinations.json"), JSON.stringify({ decision: "D-355", status: "PROPOSAL — not approved by the owner", count: proposed.length, excluded: V.exclude, combinations: proposed }, null, 2) + "\n");
  const pass = Object.values(units).filter((u) => u && u.technical === "PASS").length, fail = Object.values(units).filter((u) => u && u.technical !== "PASS").map((u) => u.id), missing = Object.values(units).filter((u) => !u).length;
  const img = (f, alt) => (existsSync(join(OUT, f)) ? `<figure><img src="${f}" alt="${esc(alt)}" loading="lazy"><figcaption>${esc(alt)}</figcaption></figure>` : "");
  // the proposed list per cut: bottoms (rows) x shoes (columns), each cell the number of the 11 designs proposed there
  const matrix = (cut) => { const cc = C.filter((x) => x.cut === cut), bs = [...new Set(cc.map((x) => x.bottom))].sort(), ss = [...new Set(cc.map((x) => x.shoes))].sort();
    return `<table><tr><th>${esc(CUT_NAME[cut])}</th>${ss.map((s) => `<th>${esc(short(s))}</th>`).join("")}</tr>${bs.map((b) => `<tr><td>${esc(short(b))}</td>${ss.map((s) => { const here = cc.filter((x) => x.bottom === b && x.shoes === s), kept = here.filter((x) => !excluded.has(x.id)).length;
      return `<td>${here.length ? (kept === here.length ? "✓ " + kept : kept + "/" + here.length) : "–"}</td>`; }).join("")}</tr>`).join("")}</table>`; };
  const files = M ? M.files.map((e) => `<tr><td><code>${esc(e.file)}</code></td><td><code>${e.sha256}</code></td><td>${e.bytes}</td><td>${esc(e.origin.candidate)}</td><td><code>${e.origin.approvedLayerSha256.slice(0, 16)}…</code></td></tr>`).join("") : "";
  const shared = M ? Object.entries(M.sharedFiles).map(([cut, fs]) => `<li>${esc(CUT_NAME[cut])}: ${fs.map((f) => `<code>${esc(f)}</code>`).join(", ")}</li>`).join("") : "";
  const verdictRows = Object.entries(V.groups).map(([g, v]) => `<tr><td>${esc(g)}</td><td><b>${esc(v.verdict)}</b></td><td>${esc(v.note || "")}</td></tr>`).join("");
  const exclRows = V.exclude.map((e) => `<tr><td><code>${esc(e.id)}</code></td><td>${esc(e.why)}</td></tr>`).join("");
  const views = existsSync(join(OUT, "views")) ? readdirSync(join(OUT, "views")).filter((f) => f.endsWith(".png")).sort() : [];
  const html = `<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>D-355 overdele</title>
<style>:root{--bg:#f6f4ef;--fg:#1d1d1f;--line:#ccc;--th:#e8e4da;--warn:#fff3cd}body{font:15px/1.5 system-ui,sans-serif;margin:0 auto;max-width:1400px;padding:16px;background:var(--bg);color:var(--fg)}img{max-width:100%;height:auto;border:1px solid var(--line);background:#fff}table{border-collapse:collapse;width:100%;font-size:13px;margin:8px 0}td,th{border:1px solid var(--line);padding:4px 6px;text-align:left;vertical-align:top}th{background:var(--th)}code{font-size:12px;word-break:break-all}figure{margin:12px 0}h2{margin-top:32px}.warn{background:var(--warn);padding:8px 12px;border-left:4px solid #c90}.wrap{overflow-x:auto}</style></head><body>
<h1>D-355 · de 33 godkendte overdele klargjort til Northstar-opt-in</h1>
<p class="warn">PRIVAT — siden viser C og må ikke offentliggøres. Intet er offentliggjort: de nye lagfiler ligger kun i privat staging. Kombinationslisten er et FORSLAG, som ejeren ikke har godkendt. Flaget er false.</p>
<h2>1. Hvad der skal tages stilling til</h2><ol><li><b>Publiceringslisten</b>: ${M ? M.files.length : "–"} nye lagfiler (afsnit 4) — de fælles skygger, hoftesømmen og bundovergangen genbruges som de er publiceret.</li>
<li><b>Kombinationslisten</b>: ${proposed.length} foreslåede kombinationer (afsnit 3; ${V.exclude.length} foreslået udelukket).</li><li><b>Integrations-merge</b>: PR'en med kode, værktøjer, tests og dokumentation (forberedelse; må ikke merges før 1 og 2 er godkendt, og filerne er lagt i samme PR).</li></ol>
<h2>2. Vælgeren (lokal forhåndsvisning)</h2><p>De 12 godkendte overdele beholder deres knapper. De 33 ligger i én kompakt liste under dem, grupperet som T-shirts, sweatere og tanktoppe. En overdel, der ikke er mulig til outfittet, er slået fra og mærket. Valget gemmes i samme felt som sweatere og tanktoppe, så der højst er én valgt overdel.</p>
${img("browser/preview-panel-k01-desktop.png", "K01 (creme T-shirt, nederdel, beige sneakers) med T-shirt · mint · tekande valgt — desktop")}${img("browser/preview-panel-k04-desktop.png", "K04 (shorts): T-shirtene kan vælges; sweatere og tanktoppe er slået fra — desktop")}${img("browser/preview-panel-k01-phone.png", "K01 på telefonbredde (390 px)")}
<h3>Nye outfits i appen (quiz, hub, avatar; 600 og 360 px)</h3>${["avatar-600", "hub-600", "quiz-600", "avatar-360"].map((n) => img("browser/sheet-" + n + ".png", n)).join("")}
<h2>3. Den foreslåede kombinationsliste</h2><p>Hver af de 33 er foreslået over sit snits nuværende tilladelsesliste — intet par af underdel og sko er tilføjet: T-shirten de 43 par, creme- og tryk-T-shirtene vises med; sweateren sweaternes 45; tanktoppen tanktoppenes 44. ${C.length} i alt; ${proposed.length} foreslået. Den fulde liste: <a href="proposed-combinations.json">proposed-combinations.json</a>.</p>
<div class="wrap">${Object.keys(CUT_FAMILY).map(matrix).join("")}</div>
<p>Teknisk kontrol (pasform og lagrækkefølge, checkOutfitSeam): <b>${pass} PASS</b>${fail.length ? ", FAIL: " + fail.map(esc).join(", ") : ""}${missing ? ", " + missing + " ikke kørt" : ""}.</p>
${exclRows ? `<h3>Foreslået udelukket</h3><table><tr><th>Kombination</th><th>Hvorfor</th></tr>${exclRows}</table>` : "<p>Ingen kombination er foreslået udelukket.</p>"}
<h2>4. Runtime-fillisten (privat staging)</h2><p>Opdeling ved C's arm-alfa: ${Object.entries(TOP_SPLIT).map(([k, v]) => esc(k) + " " + v).join(", ")} (T-shirten som de publicerede T-shirts siden D-349). Genbrugte, publicerede fælles filer (byte-identiske med snittenes egne, kontrolleret): <ul>${shared}</ul></p>
<div class="wrap"><table><tr><th>Fil</th><th>sha256</th><th>Bytes</th><th>Godkendt kandidat</th><th>Godkendt lag (sha256)</th></tr>${files}</table></div>
<h2>5. Kontroller</h2><ul><li>De 33 private lag mod de godkendte hashes: ${VF ? (VF.ok ? "alle 33 stemmer; fælles filer identiske" : "FEJL") : "–"}.</li>
<li>Runtime-lagene tilsammen = det godkendte lag: ${sum("layersExact")}/${sum("candidates")}.</li><li>northstarCompose over staging og publicerede filer = kontrollens billede: ${sum("combosEqual")}/${sum("combos")}.</li>
<li>D-354's gennemgåede outfits (lys og mørk pr. kandidat) gengivet: ${sum("reviewedExactOutsideMoved")}/${sum("reviewed")} byte for byte uden for de pixels, D-349-opdelingen flytter (T-shirten: ${sum("reviewedMovedPxDiffering")} pixels i alt — armkanten ligger nu over ærmet som på de publicerede T-shirts).</li></ul>
<h2>6. Visuel vurdering</h2>${verdictRows ? `<table><tr><th>Snit · underdel</th><th>Vurdering</th><th>Note</th></tr>${verdictRows}</table>` : "<p>–</p>"}
<h2>7. Ark: alle forslag (rækker: de 11 designs R01–R11; kolonner: skoene)</h2>${views.map((f) => img("views/" + f, f.replace(/\.png$/, ""))).join("")}
</body></html>`;
  writeFileSync(join(OUT, "index.html"), html); console.log("page written", proposed.length + " proposed");
}
