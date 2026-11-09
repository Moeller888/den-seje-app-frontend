// D-368 — the PRIVATE preview page of the Northstar hairstyle trial: one figure and outfit (K01), switchable between the candidates
// and colours, at the app's own sizes (Avatar 180×270, hub 110×165, quiz 52×78), close-ups of forehead/brows, temples and ears on a
// light and a dark background, the areas the hair source left hidden (magenta), an illustrative hat, the checks and the assessment.
// Reads the output of northstar-hair-trial-d368.mjs and writes index.html into the same folder (outside the repository; never published).
// Usage: node tools/avatar/northstar-hair-preview-d368.mjs --dir <trial output dir>
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const NAMES = Object.freeze({ northstar: "Northstar (nuværende, reference)", short: "Kort", afro: "Afro", hybrid: "Hybrid (R3-ark)" });
export const COLOUR_NAMES = Object.freeze({ source: "Kildefarve", black: "Sort (appens farvning)", blonde: "Blond (appens farvning)", "blonde-map": "Blond (farvekurve)" });
export const ASSESSMENT = Object.freeze({
  northstar: { verdict: "Reference", text: "Northstars egen frisure. Brynet til venstre (set forfra) løber naturligt ind under en hårlok; det synlige stykke mellem lokkene er en del af tegningen, ikke en løs stump. Skarp sort kontur og malede højlys." },
  short: { verdict: "Egnet efter rettelser", text: "Tydeligt anderledes, kort og tæt frisure i en tegnestil tæt på Northstars, men uden den sorte yderkontur og med en blød kant. Panden og tindingerne, som Northstars hår dækkede, bliver synlige: panden er glat, men venstre bryns indre ende er takket (en hårrest fra kilden), og der er en svag lys stribe. Kræver: rens brynets ende, kontur langs hårkanten og en kontrol af tindingerne." },
  afro: { verdict: "Egnet efter rettelser", text: "Den mest forskellige frisure med stor volumen. Samme blottede pande som 'Kort' med den takkede bryn-ende og en svag lys stribe; krøllerne dækker en del af ørerne, og der kan skimtes hud mellem krøllerne ved øret. Tegnestilen er mere maleragtig end Northstars. Under en hat vil volumen stikke ud: kræver en hat-regel eller en hat-variant." },
  hybrid: { verdict: "Ikke egnet som den er", text: "R3-arket er tegnet til et andet hoved og har ingen gennemsigtighed: kanterne er hårde og hakkede. Ved begge tindinger har kilden rektangulære udsparinger, som giver et trappehak og lige afskæringer ved højre tinding og manglende hår ned mod ørerne (markeret med magenta). Kræver en ny tilpasning til Northstar-hovedet og egentlig kantbehandling; frisuren er i forvejen tæt på Northstars egen." },
});

export function page(result) {
  const cands = Object.keys(result.candidates), cols = Object.keys(result.candidates[cands[0]].colours), R = result.regions, hb = result.headBox;
  const browsY0 = R.forehead.y + 150, hat = { cx: (hb.x0 + hb.x1) / 2, w: (hb.x1 - hb.x0) * 1.15, brimY: browsY0 - 95 };
  const rows = cands.map((c) => { const k = result.candidates[c].checks, b = (x) => `${Math.round(x.coveredShare * 100)} % dækket, ${x.visiblePieces} stykker${x.looseStump ? " (lille løst stykke)" : ""}`;
    return `<tr><th>${NAMES[c]}</th><td>${ASSESSMENT[c].verdict}</td><td>${k.bareCranium}</td><td>${b(k.browL)}</td><td>${b(k.browR)}</td><td>${k.lightFringe}</td><td>${ASSESSMENT[c].text}</td></tr>`; }).join("\n");
  const crops = ["forehead", "templeL", "templeR", "earL", "earR"], cropName = { forehead: "Pande og bryn", templeL: "Tinding venstre", templeR: "Tinding højre", earL: "Øre venstre", earR: "Øre højre" };
  return `<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Northstar frisurer</title>
<style>
:root{--bg:#f6f5f2;--fg:#1d1d1f;--muted:#5b5b60;--card:#fff;--line:#d9d6cf;--accent:#1565c0}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#15161b;--fg:#ececf0;--muted:#a3a3ad;--card:#1f2027;--line:#33343d;--accent:#7aa7ff}}
:root[data-theme="dark"]{--bg:#15161b;--fg:#ececf0;--muted:#a3a3ad;--card:#1f2027;--line:#33343d;--accent:#7aa7ff}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif}main{max-width:1100px;margin:0 auto;padding:16px}
h1{font-size:22px;margin:8px 0}h2{font-size:17px;margin:24px 0 8px}.note{color:var(--muted)}
.bar{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}.bar button{font:inherit;padding:6px 12px;border-radius:18px;border:1px solid var(--line);background:var(--card);color:var(--fg);cursor:pointer}
.bar button[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:#fff}
.sizes{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-end}.fig{position:relative;border-radius:10px;overflow:hidden;border:1px solid var(--line)}
.fig img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}.fig .hat{display:none}.hat-on .fig .hat{display:block}
.light{background:#f2f2f2}.dark{background:#1c1f2a}.cap{font-size:12px;color:var(--muted);text-align:center}
.crops{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}.crop{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:8px}
.crop .pair{display:flex;gap:4px}.crop img{width:50%;image-rendering:auto;border-radius:6px}
.masks{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}.masks img{width:100%;background:#f2f2f2;border-radius:8px;object-fit:cover;aspect-ratio:1/1;object-position:50% 12%}
table{border-collapse:collapse;width:100%;font-size:14px}th,td{border-top:1px solid var(--line);padding:8px;vertical-align:top;text-align:left}.wrap{overflow-x:auto}
</style></head><body><main>
<h1>Northstar-frisurer — privat prøve (D-368)</h1>
<p class="note">Privat forhåndsvisning. Intet er godkendt, publiceret eller aktiveret. Samme figur og outfit (K01) hele vejen; kun hårlaget skifter. Kilder: Northstars eget hår (reference), D-191 "kort", D-192 afro og D-185 R3-hybridarket — ingen nye billedkald.</p>
<div class="bar" id="cands" role="group" aria-label="Frisure">${cands.map((c, i) => `<button type="button" data-c="${c}" aria-pressed="${i === 0}">${NAMES[c]}</button>`).join("")}</div>
<div class="bar" id="cols" role="group" aria-label="Hårfarve">${cols.map((c, i) => `<button type="button" data-k="${c}" aria-pressed="${i === 0}">${COLOUR_NAMES[c] || c}</button>`).join("")}</div>
<div class="bar"><button type="button" id="hat" aria-pressed="false">Vis hat (illustration)</button></div>
<h2>Helfigur i appens størrelser</h2>
<div class="sizes" id="sizes">${[["Avatar", 180, 270], ["Hub", 110, 165], ["Quiz", 52, 78]].map(([n, w, h]) => ["light", "dark"].map((bg) => `<div><div class="fig ${bg}" style="width:${w}px;height:${h}px"><img class="f" alt="${n}"><img class="hat" src="hat.svg" alt="" style="inset:auto;left:${(hat.cx - hat.w * 80 / 92) / 1024 * 100}%;top:${(hat.brimY - hat.w * 27 / 92) / 1536 * 100}%;width:${hat.w * 160 / 92 / 1024 * 100}%;height:${hat.w * 240 / 92 / 1536 * 100}%"></div><div class="cap">${n} · ${bg === "light" ? "lys" : "mørk"}</div></div>`).join("")).join("")}</div>
<p class="note">Hatten er appens pirathat (C2-tegning) lagt omtrentligt oven på figuren for at vise, hvor frisuren og en hat mødes. I dag kan Northstar-figuren ikke vise hatte: med hat på vises elevens nuværende avatar i stedet (D-242).</p>
<h2>Nærbilleder (2×) — lys og mørk baggrund</h2>
<div class="crops">${crops.map((k) => `<div class="crop"><div class="cap">${cropName[k]}</div><div class="pair"><img class="c light" data-r="${k}" alt="${cropName[k]} lys"><img class="c dark" data-r="${k}" alt="${cropName[k]} mørk"></div></div>`).join("")}</div>
<h2>Det, kilden lod være skjult (magenta)</h2>
<p class="note">Magenta: det rekonstruerede kranie, som Northstars eget hår dækkede, og som bliver synligt med frisuren — pandebånd og tindinger.</p>
<div class="masks">${cands.map((c) => `<figure style="margin:0"><img src="mask/${c}-bare-cranium.png" alt="${NAMES[c]}"><figcaption class="cap">${NAMES[c]}: ${result.candidates[c].checks.bareCranium} px</figcaption></figure>`).join("")}</div>
<h2>Vurdering pr. frisure</h2>
<div class="wrap"><table><thead><tr><th>Frisure</th><th>Vurdering</th><th>Blottet kranie (px)</th><th>Venstre bryn</th><th>Højre bryn</th><th>Lyse kantpixels</th><th>Begrundelse</th></tr></thead><tbody>
${rows}
</tbody></table></div>
<h2>Farvning</h2>
<p>Appens nuværende hårfarvning (grundfarve × lysstyrke, som på R2) bevarer form og strå i mørke farver (sort, brun), men lyse farver bliver mudrede: "Blond (appens farvning)" bliver olivenbrun. En farvekurve gennem farvens skygge- og grundtone med et lysere højlys ("Blond (farvekurve)") bevarer lys, skygge og strå og giver en lys farve. Forslag: farvekurven for alle hårfarver på Northstar.</p>
<h2>Forslag: placering af frisurevalget på Avatar</h2>
<p>I det eksisterende panel "Avatar" (Krop · Frisure · Hårfarve) i højre kolonne — frisure er identitet og gratis, ikke tøj eller butik. På Northstar-figuren erstattes de syv gamle frisureknapper af kort med et lille billede af hver godkendt Northstar-frisure, og et valg vises med det samme som i garderoben (D-366). Hårfarven bliver, hvor den er. (I dag vises de syv gamle knapper også på Northstar-figuren, selvom figuren ikke bruger valget.)</p>
<h2>Plan: gemme valget og vise samme frisure på Avatar, hub og quiz</h2>
<ol>
<li><b>Gemme:</b> genbrug <code>avatar_identity.hairstyle</code> og <code>hair_color</code> via <code>set_avatar_identity</code>. Brug de eksisterende værdier ("short", "afro"; Northstars egen = ingen/standard), så R2/C2 og Northstar betyder det samme. Begge værdier er allerede tilladt i <code>set_avatar_identity</code> og identitetskontrollen (migration 20260613200133), så der kræves ingen migration.</li>
<li><b>Tegne:</b> del hovedet i et hoved uden hår (med bryn) og et hårlag pr. frisure (+ Northstars hårskygge). <code>northstarPlanFor</code> får et hårtrin efter hovedet; håret farves med farvekurven i <code>northstarCompose</code>, og frisure og farve indgår i figurens cache-nøgle.</li>
<li><b>Samme figur overalt:</b> Avatar, hub og quiz tegner allerede gennem <code>mountC2Avatar</code> med elevens identitet (D-357), så frisure og farve følger med automatisk.</li>
<li><b>Hatte:</b> Northstar viser i dag ikke hatte (figuren skifter til den gamle avatar). Hatte på Northstar kræver egne hatbilleder og en regel for hår under hatten (især afro) — en senere, særskilt opgave.</li>
<li><b>Rækkefølge:</b> din visuelle vurdering → rettelser (bryn-ende, kontur, tindinger) → beslutning om runtime-filer (som D-242's undtagelse) → flag/opt-in og browserkontrol på alle tre flader → aktivering.</li>
</ol>
<script>
const st={c:${JSON.stringify(cands[0])},k:${JSON.stringify(cols[0])}};
function show(){for(const i of document.querySelectorAll("img.f"))i.src="fig/"+st.c+"-"+st.k+".png";for(const i of document.querySelectorAll("img.c"))i.src="crop/"+st.c+"-"+st.k+"-"+i.dataset.r+".png";
for(const b of document.querySelectorAll("#cands button"))b.setAttribute("aria-pressed",String(b.dataset.c===st.c));for(const b of document.querySelectorAll("#cols button"))b.setAttribute("aria-pressed",String(b.dataset.k===st.k));}
document.getElementById("cands").addEventListener("click",(e)=>{const b=e.target.closest("button");if(b){st.c=b.dataset.c;show();}});
document.getElementById("cols").addEventListener("click",(e)=>{const b=e.target.closest("button");if(b){st.k=b.dataset.k;show();}});
document.getElementById("hat").addEventListener("click",(e)=>{const on=document.body.classList.toggle("hat-on");e.currentTarget.setAttribute("aria-pressed",String(on));});
show();
</script></main></body></html>
`;
}

function main() {
  const args = process.argv.slice(2), dir = args.includes("--dir") ? args[args.indexOf("--dir") + 1] : null;
  if (!dir || !existsSync(join(dir, "result.json")) || resolve(dir).toLowerCase().startsWith(ROOT.toLowerCase())) throw new Error("--dir <trial output dir outside the repository>");
  writeFileSync(join(dir, "hat.svg"), readFileSync(join(ROOT, "assets", "avatar", "hat", "pirate-hat.svg")));
  writeFileSync(join(dir, "index.html"), page(JSON.parse(readFileSync(join(dir, "result.json"), "utf8"))));
  console.log("wrote " + join(dir, "index.html"));
}
if (typeof process.argv[1] === "string" && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
