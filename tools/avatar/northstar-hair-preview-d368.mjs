// D-368 — the PRIVATE preview page of the Northstar hairstyle trial (round 2): Northstar's own hair (reference), "Kort" and Afro on one
// figure and outfit (K01), before and after the repairs, in the source colour and black and blonde through the tone curve, at the app's
// sizes (Avatar 180×270, hub 110×165, quiz 52×78) and as close-ups at 1:1 and enlarged, on a light and a dark background; what is left
// marked in magenta; the reference check; the recommendation per hairstyle.
// Reads the output of northstar-hair-trial-d368.mjs and writes index.html into the same folder (outside the repository; never published).
// Usage: node tools/avatar/northstar-hair-preview-d368.mjs --dir <trial output dir>
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const NAMES = Object.freeze({ northstar: "Northstar (nuværende, reference)", short: "Kort", afro: "Afro" });
export const COLOUR_NAMES = Object.freeze({ source: "Kildefarve", black: "Sort (farvekurve)", blonde: "Blond (farvekurve)" });
export const RECOMMENDATION = Object.freeze({
  northstar: { verdict: "Reference — uændret", text: "Gengives pixel for pixel som i appen i dag: brynspidsen og hudpletterne, som er rettet i det fælles hovedlag, bevares for Northstars egen frisure gennem to små lapper i hovedets egen lagrækkefølge." },
  short: { verdict: "Anbefalet til næste skridt", text: "Med det rensede hovedlag og en mørk kant i Northstars streg ligner 'Kort' nu resten af figuren: venstre bryn er ét rent stykke, panden er glat, og håret slutter rent ved begge tindinger. Rest: en svag lys plet øverst i panden (få pixels) og venstre bryns ujævne overkant, som er brynets egen tegning." },
  afro: { verdict: "Anbefalet til næste skridt", text: "Krøllerne er åbnet ved ørerne, så hele øret ses inde i håret i stedet for løse øreflipper, med skygge langs krøllerne. Volumen og krøllestruktur er bevaret. Rest: tegnestilen er mere maleragtig end Northstars (ingen sort kontur på krøllerne), og under en hat stikker volumen ud — hattevisningen er en særskilt opgave." },
});

export function page(result) {
  const R = result.regions, crops = ["forehead", "templeL", "templeR", "earL", "earR"];
  const cropName = { forehead: "Pande og bryn", templeL: "Tinding venstre", templeR: "Tinding højre", earL: "Øre venstre", earR: "Øre højre" };
  const rep = result.repairs, ri = result.referenceIdentical;
  const check = (v) => { const c = v.checks, b = (x) => `${x.visiblePieces} stykke${x.visiblePieces === 1 ? "" : "r"}`; return `venstre bryn ${b(c.browL)}, højre bryn ${b(c.browR)}; ører ${Math.round(c.ears.visibleShare * 100)} % synlige i ${c.ears.visiblePieces} stykker; lyse kantpixels ${c.lightFringe}`; };
  const rows = Object.keys(result.candidates).map((cand) => { const v = result.candidates[cand].variants;
    return `<tr><th>${NAMES[cand]}</th><td>${RECOMMENDATION[cand].verdict}</td><td>${v.before ? check(v.before) : "—"}</td><td>${check(v.after)}</td><td>${RECOMMENDATION[cand].text}</td></tr>`; }).join("\n");
  const sizes = [["Avatar", 180, 270], ["Hub", 110, 165], ["Quiz", 52, 78]];
  return `<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Northstar frisurer</title>
<style>
:root{--bg:#f6f5f2;--fg:#1d1d1f;--muted:#5b5b60;--card:#fff;--line:#d9d6cf;--accent:#1565c0}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#15161b;--fg:#ececf0;--muted:#a3a3ad;--card:#1f2027;--line:#33343d;--accent:#7aa7ff}}
:root[data-theme="dark"]{--bg:#15161b;--fg:#ececf0;--muted:#a3a3ad;--card:#1f2027;--line:#33343d;--accent:#7aa7ff}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif}main{max-width:1100px;margin:0 auto;padding:16px}
h1{font-size:22px;margin:8px 0}h2{font-size:17px;margin:24px 0 8px}.note{color:var(--muted)}
.bar{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}.bar button{font:inherit;padding:6px 12px;border-radius:18px;border:1px solid var(--line);background:var(--card);color:var(--fg);cursor:pointer}
.bar button[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:#fff}
.pair{display:flex;flex-wrap:wrap;gap:12px}.side{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:8px;min-width:0}
.side h3{font-size:14px;margin:0 0 6px}.sizes{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end}
.fig{border-radius:8px;overflow:hidden;border:1px solid var(--line)}.fig img{display:block;width:100%;height:100%;object-fit:contain}
.light{background:#f2f2f2}.dark{background:#1c1f2a}.cap{font-size:12px;color:var(--muted);text-align:center}
.crops{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}.crop{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:8px;min-width:0}
.scroll{overflow-x:auto;max-width:100%}.row{display:flex;gap:4px;width:max-content}.row img{display:block;border-radius:4px}
.masks{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}.masks img{width:100%;background:#f2f2f2;border-radius:8px;object-fit:cover;aspect-ratio:1/1;object-position:50% 14%}
table{border-collapse:collapse;width:100%;font-size:14px}th,td{border-top:1px solid var(--line);padding:8px;vertical-align:top;text-align:left}.wrap{overflow-x:auto}
.ok{font-weight:600}
</style></head><body><main>
<h1>Northstar-frisurer — privat prøve, runde 2 (D-368)</h1>
<p class="note">Privat forhåndsvisning. Intet er godkendt, publiceret eller aktiveret, og der er ingen nye billedkald: alt er lavet af eksisterende kilder. Samme figur og outfit (K01) hele vejen; kun hovedet skifter. Hybrid er taget ud af første udvalg.</p>
<p class="ok">Northstar-referencen gengives pixel for pixel: hovedet ${ri.head ? "identisk" : "AFVIGER"} med appens, helfiguren ${ri.figure ? "identisk" : "AFVIGER"}.</p>
<div class="bar" id="cands" role="group" aria-label="Frisure">${Object.keys(result.candidates).map((c, i) => `<button type="button" data-c="${c}" aria-pressed="${i === 1}">${NAMES[c]}</button>`).join("")}</div>
<div class="bar" id="cols" role="group" aria-label="Hårfarve">${Object.keys(COLOUR_NAMES).map((c, i) => `<button type="button" data-k="${c}" aria-pressed="${i === 0}">${COLOUR_NAMES[c]}</button>`).join("")}</div>
<h2>I appens størrelser — før og efter</h2>
<div class="pair">${["before", "after"].map((v) => `<div class="side"><h3>${v === "before" ? "Før" : "Efter"}</h3><div class="sizes">${sizes.map(([n, w, h]) => ["light", "dark"].map((bg) => `<div><div class="fig ${bg}" style="width:${w}px;height:${h}px"><img class="f" data-v="${v}" alt="${n} ${v === "before" ? "før" : "efter"}"></div><div class="cap">${n} · ${bg === "light" ? "lys" : "mørk"}</div></div>`).join("")).join("")}</div></div>`).join("")}</div>
<p class="note">For Northstar-referencen er "før" og "efter" det samme billede: den er uændret.</p>
<h2>Nærbilleder — 1:1 og forstørret (3×), før og efter</h2>
<div class="crops">${crops.map((k) => `<div class="crop"><div class="cap">${cropName[k]} · før | efter · lys og mørk (1:1), derunder før | efter (3×)</div>
<div class="scroll"><div class="row">${["before", "after"].map((v) => ["light", "dark"].map((bg) => `<img class="c ${bg}" data-v="${v}" data-r="${k}" width="${R[k].w}" height="${R[k].h}" alt="">`).join("")).join("")}</div></div>
<div class="scroll"><div class="row">${["before", "after"].map((v) => `<img class="c light" data-v="${v}" data-r="${k}" width="${R[k].w * 3}" height="${R[k].h * 3}" alt="">`).join("")}</div></div></div>`).join("")}</div>
<h2>Rettelser og rester (magenta)</h2>
<div class="masks">
<figure style="margin:0"><img src="mask/brow-residue.png" alt="Brynrest"><figcaption class="cap">Hårrest ved venstre bryn, fjernet: ${rep.browResiduePx} px</figcaption></figure>
<figure style="margin:0"><img src="mask/forehead-spots-before.png" alt="Lyse pletter før"><figcaption class="cap">Lyse pletter og stribe i panden, udfyldt: ${rep.foreheadSpotPx} px</figcaption></figure>
<figure style="margin:0"><img src="mask/forehead-spots-after.png" alt="Rester"><figcaption class="cap">Tilbage efter rettelsen (samme måling): ${rep.foreheadSpotPxLeft} px</figcaption></figure>
<figure style="margin:0"><img src="mask/ears.png" alt="Ørerne"><figcaption class="cap">Ørerne, som afroen åbnes ved: ${rep.earPx} px</figcaption></figure>
</div>
<h2>Anbefaling pr. frisure</h2>
<div class="wrap"><table><thead><tr><th>Frisure</th><th>Anbefaling</th><th>Før</th><th>Efter</th><th>Begrundelse og rester</th></tr></thead><tbody>
${rows}
</tbody></table></div>
<h2>Farvning</h2>
<p>Sort og blond er vist med farvekurven gennem hårfarvens skygge- og grundtone med et lysere højlys. Den bevarer lys, skygge og hårstrå; appens nuværende farvning (grundfarve × lysstyrke) gjorde blond mudret i runde 1.</p>
<h2>Hatte</h2>
<p>Hattevisningen var en illustration af pasformen i runde 1 og står som en særskilt opgave: Northstar-figuren viser i dag elevens nuværende avatar, når der er hat på (D-242).</p>
<script>
const st={c:"short",k:"source"};
function src(v,k){return st.c+"-"+(st.c==="northstar"?"after":v)+"-"+st.k+(k?"-"+k:"")+".png";}
function show(){for(const i of document.querySelectorAll("img.f"))i.src="fig/"+src(i.dataset.v);for(const i of document.querySelectorAll("img.c"))i.src="crop/"+src(i.dataset.v,i.dataset.r);
for(const b of document.querySelectorAll("#cands button"))b.setAttribute("aria-pressed",String(b.dataset.c===st.c));for(const b of document.querySelectorAll("#cols button"))b.setAttribute("aria-pressed",String(b.dataset.k===st.k));}
document.getElementById("cands").addEventListener("click",(e)=>{const b=e.target.closest("button");if(b){st.c=b.dataset.c;show();}});
document.getElementById("cols").addEventListener("click",(e)=>{const b=e.target.closest("button");if(b){st.k=b.dataset.k;show();}});
show();
</script></main></body></html>
`;
}

function main() {
  const args = process.argv.slice(2), dir = args.includes("--dir") ? args[args.indexOf("--dir") + 1] : null;
  if (!dir || !existsSync(join(dir, "result.json")) || resolve(dir).toLowerCase().startsWith(ROOT.toLowerCase())) throw new Error("--dir <trial output dir outside the repository>");
  writeFileSync(join(dir, "index.html"), page(JSON.parse(readFileSync(join(dir, "result.json"), "utf8"))));
  console.log("wrote " + join(dir, "index.html"));
}
if (typeof process.argv[1] === "string" && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
