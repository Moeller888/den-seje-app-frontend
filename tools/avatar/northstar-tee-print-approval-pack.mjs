// D-272 — THE APPROVAL PACK for the tested tee print family (no image call, no render, no new measurement). It re-uses D-271's own
// evaluation output unchanged: the private record (its sha256 is pinned in tp-approval-candidates-v1.json) and the preview images the
// evaluation wrote. It verifies both, copies the images byte for byte into a private pack and writes:
//   manifest.json   all 18 motif/colour combinations: motif, colour, source, master version, placement, hashes, and three SEPARATE
//                   statuses — the technical result (D-271's measures, as recorded), ChatGPT's advisory candidate status, and the owner's
//                   status, which is always PENDING here;
//   index.html      the 16 advisory candidates with short stable IDs (close-up, the whole avatar at actual 110x165 and 52x78), a motif x
//                   colour matrix, two comparison panels, the two non-candidates apart with their reason, the master's known limits, and a
//                   local-only review (the viewer's marks stay in their browser; nothing is pre-selected; the page writes a message the
//                   owner may send — it records no decision).
// It never approves anything: an owner decision is only the owner's own message, recorded later in a decision file.
// Usage:
//   node tools/avatar/northstar-tee-print-approval-pack.mjs --from <D-271 result dir> --out <private dir outside the repo>
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const sha = (b) => createHash("sha256").update(b).digest("hex");
export const FIXTURE = "tools/avatar/fixtures/northstar-wardrobe/tee-master/tp-approval-candidates-v1.json";
export const VIEWS = Object.freeze(["torso", "close", "app110", "app52"]);
export const OWNER_PENDING = "PENDING";
export const KNOWN_LIMITS_DA = Object.freeze([
  "Store tryk får svagt bølgede konturer og små trappetrin fra masterens forskydning og nearest-sampling (D-264/D-269); ses i nærbilleder, ikke i appstørrelserne.",
  "Brystet er tegnet fladt, så trykket følger ingen folder og ser påsat ud.",
  "En lille lys prik ved halsribben findes på den almindelige T-shirt (ikke fra trykkene).",
  "Midterfeltet er bredere end højt; høje motiver (ræven) bliver mindst.",
  "Kontrastklassen er rådgivende: den så ikke en ramme i en anden farve (tekande/heather, skjold/koral og sennep afviger fra den visuelle vurdering i D-271).",
]);

export const loadFixture = () => JSON.parse(readFileSync(join(ROOT, ...FIXTURE.split("/")), "utf8"));
export const idOf = (fx, callId, colour) => "TP-" + fx.source.calls[callId].code + "-" + fx.source.colours[colour];

/** D-271's record against the pinned pack source: the record's own hash, its kind, the master, the placement, the motifs and all 18 renders. */
export function verifyRecord(record, recordSha, fx) {
  const p = [];
  if (recordSha !== fx.source.recordSha256) p.push("the record is not D-271's (" + recordSha + ")");
  if (!record || record.decision !== "D-270" || record.kind !== "calls" || record.revision !== "tpv-v1") p.push("the record is not D-270's evaluation of the calls");
  if (record && record.fingerprint !== fx.master.fingerprint) p.push("the master's fingerprint differs");
  if (record && (record.placement.name !== fx.placement.name || JSON.stringify(record.placement.box) !== JSON.stringify(fx.placement.boxOnC) || JSON.stringify(record.rule) !== JSON.stringify(fx.placement.rule))) p.push("the placement or the size rule differs");
  for (const [callId, c] of Object.entries(fx.source.calls)) { const m = record && record.motifs[callId]; if (!m || m.imageSha256 !== c.imageSha256) { p.push(callId + ": not the received image"); continue; }
    for (const colour of Object.keys(fx.source.colours)) if (!m.colours[colour] || !record.renders[callId + "-" + colour]) p.push(callId + "-" + colour + ": no result"); }
  return p;
}

/** The manifest: every combination with its three separate statuses. files: { "<callId>-<colour>-<view>.png": sha256 }. */
export function buildManifest(record, recordSha, fx, files) {
  const adv = fx.advisory, entries = [];
  for (const [callId, c] of Object.entries(fx.source.calls)) for (const [colour, code] of Object.entries(fx.source.colours)) {
    const id = idOf(fx, callId, colour), m = record.motifs[callId], x = m.colours[colour], candidate = adv.candidates.includes(id);
    entries.push({ id, motif: { code: c.code, label: c.motif, callId, imageSha256: m.imageSha256 }, colour: { name: colour, code, rgb: record.colours[colour] },
      source: { decision: "D-271", recordSha256: recordSha, files: Object.fromEntries(VIEWS.map((v) => { const f = callId + "-" + colour + "-" + v + ".png"; return [v, { file: "img/" + f, sha256: files[f] }]; })) },
      master: { ...fx.master }, placement: { name: fx.placement.name, boxOnC: fx.placement.boxOnC, rule: fx.placement.rule, prepared: m.prepared.size, limitedBy: m.prepared.limitedBy },
      technical: { recordedBy: "D-271 (as recorded; not re-measured)", delivery: m.classification, deliveryProblems: m.delivery.problems, placementOk: x.placementOk, placementChecks: x.checks, contrast: x.contrast },
      advisory: { by: adv.by, status: candidate ? "candidate" : "not-candidate", note: candidate ? adv.notes[id] || null : adv.notCandidates[id] },
      owner: { status: OWNER_PENDING } });
  }
  return { decision: "D-272", kind: fx.kind, source: { ...fx.source, recordSha256: recordSha }, master: fx.master, placement: fx.placement, idFormat: fx.idFormat, knownLimits: KNOWN_LIMITS_DA,
    counts: { combinations: entries.length, candidates: entries.filter((e) => e.advisory.status === "candidate").length, notCandidates: entries.filter((e) => e.advisory.status === "not-candidate").length, ownerApproved: 0 },
    owner: fx.owner, entries };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[c]);
/** The page (self-contained; images from img/; no network; the review is local and starts empty). */
export function pageHtml(man) {
  const COL = { cream: "creme", heather: "heather (grå)", navy: "navy", coral: "koral", forest: "skovgrøn", mustard: "sennep" }, MOT = { FOX: "Ræv", TEA: "Tekande", SHD: "Skjold" };
  const motifs = ["TEA", "SHD", "FOX"], colours = Object.keys(man.source.colours), at = (m, c) => man.entries.find((e) => e.motif.code === m && e.colour.name === c);
  const badge = (e) => `<span class="b ${e.advisory.status === "candidate" ? "cand" : "out"}">${e.advisory.status === "candidate" ? "Kandidat (rådgivende)" : "Fravalgt (rådgivende)"}</span><span class="b own">Ejer: afventer</span>`;
  const tech = (e) => `levering ${e.technical.delivery === "requires-visual-review" ? "bestået" : esc(e.technical.delivery)} · placering ${e.technical.placementOk ? "ok" : "FEJL"} · kontrast ${esc(e.technical.contrast.class)}`;
  const radios = (e, label) => `<div class="dec" data-id="${e.id}"><label><input type="radio" name="d-${e.id}" value="approve"> ${label || "Godkend"}</label> <label><input type="radio" name="d-${e.id}" value="reject"> Afvis</label> <label><input type="radio" name="d-${e.id}" value=""> Ubesvaret</label></div>`;
  const cell = (e) => `<td class="${e.advisory.status === "candidate" ? "" : "muted"}" data-m="${e.motif.code}" data-c="${e.colour.name}"><div class="id">${e.id}</div>
    <img class="close" src="${e.source.files.close.file}" alt="${e.id} nærbillede"><div class="apps"><img class="px" src="${e.source.files.app110.file}" width="110" height="165" alt="${e.id} 110×165"><img class="px" src="${e.source.files.app52.file}" width="52" height="78" alt="${e.id} 52×78"></div>
    <div class="small">${badge(e)}</div><div class="small">${tech(e)}</div>${e.advisory.note ? `<div class="note">${esc(e.advisory.status === "candidate" ? "Bemærkning: " : "Årsag: ")}${esc(e.advisory.note)}</div>` : ""}
    ${e.advisory.status === "candidate" ? radios(e) : `<div class="small">Se „Fravalgte kombinationer“.</div>`}</td>`;
  const outs = man.entries.filter((e) => e.advisory.status === "not-candidate");
  const opts = man.entries.map((e) => `<option value="${e.id}">${e.id} — ${MOT[e.motif.code]} på ${COL[e.colour.name]}${e.advisory.status === "candidate" ? "" : " (fravalgt)"}</option>`).join("");
  const panel = (k, id) => `<section class="panel" id="P${k}"><label>Kombination <select>${opts}</select></label><div class="det"></div></section><script>initPanel("P${k}", "${id}");</script>`;
  const data = man.entries.map((e) => ({ id: e.id, m: MOT[e.motif.code], c: COL[e.colour.name], cand: e.advisory.status === "candidate", note: e.advisory.note, tech: tech(e), con: e.technical.contrast, prep: e.placement.prepared, f: Object.fromEntries(VIEWS.map((v) => [v, e.source.files[v].file])) }));
  return `<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Godkendelsespakke D-272</title>
<style>:root{--bg:#f4f2ee;--fg:#1d1d1f;--mut:#5b5b60;--card:#fff;--line:#d9d5cc;--cand:#1f6f43;--out:#8a3b12;--own:#4b4b8f;--warn:#fff4d6}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#18181a;--fg:#eee;--mut:#a5a5ab;--card:#232326;--line:#3a3a3e;--cand:#6fd39b;--out:#f0a070;--own:#a9a9ff;--warn:#3a321c}}
:root[data-theme="dark"]{--bg:#18181a;--fg:#eee;--mut:#a5a5ab;--card:#232326;--line:#3a3a3e;--cand:#6fd39b;--out:#f0a070;--own:#a9a9ff;--warn:#3a321c}
body{margin:0;padding:16px;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif}h1{font-size:20px;margin:0 0 6px}h2{font-size:16px;margin:20px 0 8px}
.banner{background:var(--warn);border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin:8px 0;max-width:72em}.small{font-size:12px;color:var(--mut)}.note{font-size:12px;margin-top:2px}
.wrap{overflow-x:auto}table{border-collapse:separate;border-spacing:6px}th{font-weight:600;text-align:left;font-size:13px}td{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:6px;vertical-align:top;min-width:200px}
td.muted{opacity:.8;border-style:dashed}.id{font:600 13px ui-monospace,monospace}.close{display:block;width:184px;height:auto;margin:4px 0}.apps{display:flex;gap:8px;align-items:flex-end}.px{image-rendering:pixelated}
.b{display:inline-block;font-size:11px;border-radius:999px;padding:1px 7px;margin:2px 4px 2px 0;border:1px solid currentColor}.cand{color:var(--cand)}.out{color:var(--out)}.own{color:var(--own)}
.dec{margin-top:4px;font-size:12px}.dec label{margin-right:6px;white-space:nowrap}textarea{width:100%;max-width:72em;font:13px ui-monospace,monospace;min-height:5em}button{font:inherit;margin:4px 6px 4px 0}
.ctl{display:flex;flex-wrap:wrap;gap:8px 16px;margin:6px 0}.panels{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,520px),1fr));gap:12px}.panel{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px}
.det img{max-width:100%;height:auto}.det .row{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end}ul{margin:4px 0 0 18px;padding:0}.outs{display:flex;flex-wrap:wrap;gap:10px}</style>
<script>const D=${JSON.stringify(data)};const KEY="d272-local-review";let S={};try{S=JSON.parse(localStorage.getItem(KEY)||"{}")||{};}catch(e){S={};}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(S));}catch(e){}};const CAND=D.filter(x=>x.cand).map(x=>x.id);
function msg(){const a=Object.keys(S).filter(k=>S[k]==="approve").sort(),r=Object.keys(S).filter(k=>S[k]==="reject").sort(),L=[];
 if(a.length===CAND.length&&a.every(k=>CAND.includes(k)))L.push("D-272 GODKENDT: ALLE 16 KANDIDATER");else if(a.length)L.push("D-272 GODKENDT: "+a.join(", "));if(r.length)L.push("D-272 AFVIST: "+r.join(", "));
 const und=D.filter(x=>!S[x.id]).length;document.getElementById("msg").value=L.join("\\n");document.getElementById("und").textContent=und+" af "+D.length+" kombinationer er ubesvarede (de forbliver ubesluttede).";}
function sync(){document.querySelectorAll(".dec").forEach(d=>{const v=S[d.dataset.id]||"";d.querySelectorAll("input").forEach(i=>{i.checked=i.value===v&&v!=="";});});msg();}
function initPanel(id,start){const s=document.getElementById(id),sel=s.querySelector("select"),det=s.querySelector(".det"),show=()=>{const x=D.find(y=>y.id===sel.value);
 det.innerHTML='<p><b>'+x.id+'</b> — '+x.m+' på '+x.c+' · '+(x.cand?'kandidat (rådgivende)':'fravalgt (rådgivende)')+' · ejer: afventer'+(x.note?'<br><span class="small">'+x.note+'</span>':'')+'</p>'
 +'<div class="row"><figure><img src="'+x.f.torso+'" alt=""><figcaption class="small">Torso 2×</figcaption></figure><figure><img src="'+x.f.close+'" alt=""><figcaption class="small">Nærbillede 2×</figcaption></figure></div>'
 +'<div class="row"><figure><img class="px" src="'+x.f.app110+'" width="110" height="165"><img class="px" src="'+x.f.app110+'" width="330" height="495"><figcaption class="small">110×165: faktisk og 3×</figcaption></figure>'
 +'<figure><img class="px" src="'+x.f.app52+'" width="52" height="78"><img class="px" src="'+x.f.app52+'" width="208" height="312"><figcaption class="small">52×78: faktisk og 4×</figcaption></figure></div>'
 +'<p class="small">Teknisk (D-271, uændret): '+x.tech+' · synlig andel '+x.con.visibleShare+' · tydeligt set '+x.con.strongShare+' · silhuet '+x.con.silhouette+' · størrelse '+x.prep.join("×")+' px</p>';};
 sel.value=start;sel.onchange=show;show();}
document.addEventListener("change",e=>{const d=e.target.closest&&e.target.closest(".dec");if(!d)return;if(e.target.value)S[d.dataset.id]=e.target.value;else delete S[d.dataset.id];save();msg();});
document.addEventListener("DOMContentLoaded",()=>{sync();document.getElementById("allc").onclick=()=>{CAND.forEach(k=>S[k]="approve");save();sync();};document.getElementById("clr").onclick=()=>{S={};save();sync();};
 document.getElementById("cp").onclick=()=>{const t=document.getElementById("msg");t.select();try{navigator.clipboard.writeText(t.value);}catch(e){}};
 const fm=document.getElementById("fm"),fc=document.getElementById("fc"),flt=()=>document.querySelectorAll("td[data-m]").forEach(td=>{td.style.display=(!fm.value||td.dataset.m===fm.value)&&(!fc.value||td.dataset.c===fc.value)?"":"none";});fm.onchange=flt;fc.onchange=flt;});</script></head><body>
<h1>T-shirt-tryk: godkendelsespakke (D-272) — privat</h1>
<div class="banner"><b>Ingen kombination er godkendt af ejeren.</b> Kandidatvalget (16 af 18) er ChatGPT's <i>rådgivende</i> valg. De tekniske resultater er D-271's egne målinger, uændrede. Siden registrerer intet: dine markeringer gemmes kun lokalt i denne browser, og kun den besked, du selv sender, er en beslutning. Siden viser C og må ikke offentliggøres.</div>
<h2>Sådan godkender eller afviser du</h2>
<p>Send én af disse beskeder (samlet eller enkeltvis; flere linjer er tilladt):</p>
<pre>D-272 GODKENDT: ALLE 16 KANDIDATER
D-272 GODKENDT: TP-TEA-CRM, TP-SHD-NAV
D-272 AFVIST: TP-FOX-HTH</pre>
<p class="small">Kun de ID'er, du nævner, er besluttet; resten forbliver ubesluttede. De to fravalgte kombinationer godkendes kun, hvis du nævner dem udtrykkeligt. Markeringerne nedenfor skriver beskeden for dig; intet er forvalgt.</p>
<textarea id="msg" readonly aria-label="Besked til ejerens beslutning"></textarea><div class="small" id="und"></div>
<button id="cp" type="button">Kopiér beskeden</button><button id="allc" type="button">Markér alle 16 kandidater som godkendt</button><button id="clr" type="button">Ryd mine lokale markeringer</button>
<h2>Kendte begrænsninger</h2><ul>${man.knownLimits.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
<h2>Kandidater: motiv × T-shirt-farve</h2>
<div class="ctl"><label>Motiv <select id="fm"><option value="">alle</option>${motifs.map((m) => `<option value="${m}">${MOT[m]}</option>`).join("")}</select></label><label>Farve <select id="fc"><option value="">alle</option>${colours.map((c) => `<option value="${c}">${COL[c]}</option>`).join("")}</select></label></div>
<p class="small">Hver celle: nærbillede 2× og hele avataren i faktisk 110×165 og 52×78. Fravalgte celler er stiplede.</p>
<div class="wrap"><table><tr><th></th>${colours.map((c) => `<th>${COL[c]}</th>`).join("")}</tr>${motifs.map((m) => `<tr><th>${MOT[m]}</th>${colours.map((c) => cell(at(m, c))).join("")}</tr>`).join("")}</table></div>
<h2>Fravalgte kombinationer (rådgivende)</h2><div class="outs">${outs.map((e) => `<table><tr>${cell(e).replace(`<div class="small">Se „Fravalgte kombinationer“.</div>`, radios(e, "Godkend trods fravalg"))}</tr></table>`).join("")}</div>
<h2>Sammenlign to kombinationer</h2><div class="panels">${panel("A", "TP-TEA-CRM")}${panel("B", "TP-SHD-CRM")}</div>
<p class="small">Kilde: D-271 record sha256 ${man.source.recordSha256} · master ${man.master.revision} (${man.master.fingerprint.slice(0, 16)}…) · placering ${man.placement.name} [${man.placement.boxOnC.join(",")}] · manifest: manifest.json</p>
</body></html>
`;
}

function outDir(OUT) { const r = relative(ROOT, resolve(OUT || ".")); if (!OUT || !(r.startsWith("..") || isAbsolute(r))) throw new Error("--out must be outside the repository (the pack shows C)"); return OUT; }

function main() {
  const args = process.argv.slice(2), at = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null), FROM = at("--from"), OUT = outDir(at("--out"));
  if (!FROM) throw new Error("--from <D-271 result dir>");
  if (existsSync(join(OUT, "manifest.json"))) throw new Error("already packed into " + OUT + "; a pack is never rewritten");
  const fx = loadFixture(), buf = readFileSync(join(FROM, "record.json")), record = JSON.parse(buf.toString("utf8")), recordSha = sha(buf), problems = verifyRecord(record, recordSha, fx);
  if (problems.length) throw new Error("the D-271 result does not hold: " + problems.join("; "));
  const files = {}; for (const callId of Object.keys(fx.source.calls)) for (const colour of Object.keys(fx.source.colours)) for (const v of VIEWS) { const f = callId + "-" + colour + "-" + v + ".png", p = join(FROM, "preview", f); if (!existsSync(p)) throw new Error("missing D-271 image " + f); files[f] = sha(readFileSync(p)); }
  mkdirSync(join(OUT, "img"), { recursive: true });
  for (const f of Object.keys(files)) { copyFileSync(join(FROM, "preview", f), join(OUT, "img", f)); if (sha(readFileSync(join(OUT, "img", f))) !== files[f]) throw new Error("copy differs: " + f); }
  const man = buildManifest(record, recordSha, fx, files);
  writeFileSync(join(OUT, "manifest.json"), JSON.stringify(man, null, 2) + "\n"); writeFileSync(join(OUT, "index.html"), pageHtml(man));
  console.log(JSON.stringify({ recordSha256: recordSha, combinations: man.counts, images: Object.keys(files).length }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { try { main(); } catch (e) { console.error("REFUSED: " + e.message); process.exit(1); } }
