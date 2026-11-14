// D-332: the teacher review pack, the teacher's decision file and the isolated server fixture — all generated
// from the SAME data the game and the test adapter use, so the three can never drift apart.
//
//   node tools/laerligverse/review-pack.mjs           write the pack + fixture; create the decision file once
//   node tools/laerligverse/review-pack.mjs --check   exit 1 if the pack or fixture is stale, or the decision
//                                                      file does not cover exactly the current elements
//
// The decision file (docs/laerligverse/kildekritik-godkendelse.json) belongs to the TEACHER: this tool creates
// it with every element "ikke_gennemgaaet" and NEVER overwrites a decision. Nothing here approves anything.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PACK = join(ROOT, "docs", "laerligverse", "kildekritik-laerergennemgang.md");
/** D-338: a self-contained local review page (open in a browser; saves the decisions as a file). */
export const HTML = join(ROOT, "docs", "laerligverse", "kildekritik-laerergennemgang.html");
export const DECISIONS = join(ROOT, "docs", "laerligverse", "kildekritik-godkendelse.json");
export const FIXTURE = join(ROOT, "tests", "isolated", "fixtures", "kildekritik-questions.json");
export const STATUSES = Object.freeze(["ikke_gennemgaaet", "godkendt", "godkendt_med_aendringer", "afvist", "kraever_undersoegelse"]);
/** The isolated stack's TEST objective — a fixture name, never a product objective (LP-2). */
export const TEST_OBJECTIVE = "test_kildekritik_ophav";

async function load() {
  const items = await import("../../laerligverse/host/dev/archive-items.js");
  const intro = await import("../../adventure-engine/packages/archive-prototype/src/intro-content.ts");
  const seq = await import("../../adventure-engine/packages/archive-prototype/src/sequence.ts");
  return { items, intro, seq };
}

const back = (detail) => (detail ?? "").split("|").map((p) => p.trim()).filter(Boolean);
const STEP_ORDER = ["arkivskab", "arkivskab-revision", "skuffe", "overfoersel", "genbesoeg"];

/** Every reviewable element, in teaching order, with a stable id. */
export async function elements() {
  const { items, intro, seq } = await load();
  const out = [];
  out.push({ id: "maal", title: "Læringsmålet (forslag)", kind: "maal" });
  intro.INTRO_CARDS.forEach((c, i) => out.push({ id: `intro-${i + 1}`, title: `Introkort ${i + 1}: ${c.title}`, kind: "intro", card: c }));
  out.push({ id: "intro-tjek", title: "Forståelsestjek (ingen dom)", kind: "tjek", check: intro.INTRO_CHECK });
  out.push({ id: "arkivkort", title: "Udfyld arkivkortet (lokal øvelse)", kind: "arkivkort", card: seq.ARCHIVE_CARD_EXERCISE });
  const byContext = new Map(items.ARCHIVE_ITEMS.map((i) => [i.contextKey, i]));
  for (const key of STEP_ORDER) {
    const item = byContext.get(key);
    if (item === undefined) throw new Error(`no item for step ${key}`);
    out.push({ id: item.id, title: items.ITEM_REVIEW[item.id].step, kind: "opgave", item, review: items.ITEM_REVIEW[item.id], serverStep: items.STEP_OF_CONTEXT[item.contextKey] });
    if (key === "skuffe") out.push({ id: "refleksion", title: "7a · Refleksion (lokal, sendes ikke)", kind: "refleksion", reflection: seq.REFLECTION });
  }
  return { list: out, objective: items.OBJECTIVE };
}

function md({ list, objective }) {
  const L = [];
  L.push("# Lærergennemgang: kildekritisk forløb i Arkivskabet (D-332)", "");
  L.push("> **GENERERET** af `tools/laerligverse/review-pack.mjs` fra de samme data, som spillet og serverens testfixture bruger. Ret ikke her; ret i `host-items.ts`, `intro-content.ts` eller `sequence.ts` og generér igen.", "");
  L.push("**Sådan bruges pakken:** Læs hvert element. Skriv din afgørelse i `docs/laerligverse/kildekritik-godkendelse.json`:");
  L.push("- `godkendt`");
  L.push("- `godkendt_med_aendringer` (skriv ændringerne i `kommentar`)");
  L.push("- `afvist`");
  L.push("- `kraever_undersoegelse`");
  L.push("");
  L.push("Intet er godkendt, før du har skrevet det. Værktøjet ændrer aldrig en afgørelse.", "");
  L.push("**Konstrueret undervisningsmateriale.** Kun proklamationen af 9. april 1940 er et autentisk dokument, og den er parafraseret, ikke citeret. Alle andre kilder er opfundne eksempler på en kildetype og er mærket »(konstrueret eksempel)«.", "");
  L.push("## Historiefaglig egenkontrol (udført af udvikleren — IKKE en godkendelse)", "");
  for (const [k, v] of SELF_CHECK) L.push(`- **${k}:** ${v}`);
  L.push("");
  L.push("## Indhold", "");
  for (const e of list) L.push(`- [${e.title}](#${e.id}) · \`${e.id}\``);
  L.push("");
  for (const e of list) {
    L.push(`## ${e.title} <a id="${e.id}"></a>`, "", `Element-id: \`${e.id}\``, "");
    if (e.kind === "maal") {
      L.push(`**Formulering:** ${objective.text}`, "", `**Prototype-id:** \`${objective.id}\` · **Status:** ${objective.status}`, "");
      L.push("**Progression (forslag, ikke en mastery-skala):**");
      L.push("- P1: genkender afsender og tidspunkt (arkivkortet)");
      L.push("- P2: forklarer, hvorfor de er relevante (introkort og forståelsestjek)");
      L.push("- P3: undersøger kilder med støtte og vælger den bedst egnede (trin 3)");
      L.push("- P4: anvender feedback på en beslægtet påstand (trin 5)");
      L.push("- P5: anvender på en ny påstand uden hjælp (trin 6)");
      L.push("- P6: overfører til en anden periode (trin 7)");
      L.push("- P7: gentager senere (trin 8)");
      L.push("");
      L.push("Sværhed angives kvalitativt (lav/middel/høj). Der findes ingen kalibreret talværdi, og skalaen 1–10.000 bruges ikke til dette indhold.", "");
    } else if (e.kind === "intro") {
      L.push(`> ${e.card.text}`, "", "**Rolle:** introduktion, før eleven vurderes. Ingen dom.", "");
    } else if (e.kind === "tjek") {
      L.push(`**Spørgsmål:** ${e.check.question}`, "");
      for (const o of e.check.options) L.push(`- ${o}`);
      L.push("", `**Forklaring (vises uanset valg):** ${e.check.explanation}`, "", "**Rolle:** forståelsestjek uden dom. Registreres ikke.", "");
    } else if (e.kind === "arkivkort") {
      L.push(`**Instruktion:** ${e.card.intro}`, "", `**Kilde:** ${e.card.source}`, "", "| Oplysning | Rigtigt felt | Forklaring ved forkert placering |", "|---|---|---|");
      for (const f of e.card.facts) L.push(`| ${f.text} | ${f.field} | ${f.why} |`);
      L.push("", "**Rolle:** lokal øvelse med forklaring. Sendes aldrig og er aldrig evidens.", "");
    } else if (e.kind === "refleksion") {
      L.push(`**Spørgsmål:** ${e.reflection.question}`, "", `**Arkivarens modelsvar:** ${e.reflection.model}`, "", "**Selvtjek:**");
      for (const q of e.reflection.selfCheck) L.push(`- ${q}`);
      L.push("", "**Rolle:** lokal refleksion. Sendes ikke og gemmes ikke.", "");
    } else {
      const { item, review } = e;
      L.push(`**Opgavetekst:** ${item.prompt}`, "");
      L.push("| Kilde (forside) | Bagside |", "|---|---|");
      for (const o of item.options) L.push(`| ${o.label}${o.id === item.answer ? " **(rigtigt)**" : ""} | ${back(o.detail).join("<br>")} |`);
      L.push("");
      L.push(`- **Fagligt mål:** ${objective.text}`);
      L.push(`- **Progression:** ${review.progression}`);
      L.push(`- **Servertrin (D-338):** \`${e.serverStep}\`. Serveren udleverer opgaven, når eleven er på dette trin (foreløbig testpolitik, LP-13)`);
      L.push(`- **Forudsat viden:** ${review.prerequisites}`);
      L.push(`- **Træner:** ${review.trains}`);
      L.push(`- **Forventet elevhandling:** ${review.expectedAction}`);
      L.push(`- **Bedømmelse:** ${review.scoring}`);
      L.push(`- **Rigtigt svar og begrundelse:** ${item.correctLabel}. ${item.feedbackCorrect}`);
      L.push(`- **Historisk kontekst:** ${review.context}`);
      L.push(`- **Kildestatus:** ${review.sourceStatus}`);
      L.push(`- **Vanskelighed (kvalitativ):** ${review.difficulty}`);
      L.push(`- **Evidensrolle:** ${review.evidenceRole}`);
      L.push(`- **Det kan et rigtigt svar IKKE dokumentere:** ${review.cannotDocument}`, "");
      L.push("**Typiske misforståelser:**");
      for (const m of review.misconceptions) L.push(`- ${m}`);
      L.push("", "**Feedback pr. forkert valg:**");
      for (const o of item.options) if (o.id !== item.answer) L.push(`- *${o.label}:* ${item.optionFeedback?.[o.id] ?? item.feedbackIncorrect}`);
      if (item.hints.length > 0) {
        L.push("", "**Hjælp (hints, kun i øvelse):**");
        item.hints.forEach((h, i) => L.push(`${i + 1}. ${h}`));
      }
      L.push("");
    }
    L.push(`**Afgørelse:** se \`${e.id}\` i godkendelsesfilen.`, "", "---", "");
  }
  return L.join("\n");
}

/** D-338: the developer's own historical check — what is certain, what is constructed, what the teacher must verify. */
export const SELF_CHECK = Object.freeze([
  ["Autentisk dokument", "Kun kongens og regeringens proklamation af 9. april 1940. Den er parafraseret (»bevare ro og orden«) og ikke citeret. Kontrollér parafrasen mod originalteksten."],
  ["Konstruerede eksempler", "Alle andre kilder er opfundne eksempler på en kildetype og er mærket »(konstrueret eksempel)« på bagsiden. De må ikke præsenteres som autentiske."],
  ["Rettet i D-338", "Revisionens påstand handlede før om, hvad hærledelsen »ville«. Ifølge historiske fremstillinger ønskede hærens chef at kæmpe videre, og beslutningen var regeringens. Påstanden handler nu om ordren (en handling), som ordren kan belyse. Kontrollér den historiske fremstilling."],
  ["1864", "Krigen mod Preussen og Østrig, beskydningen af Dybbøl-skanserne og stormen den 18. april 1864 er velkendte rammer. Brevet, mindetalen, avisen og tv-serien er konstruerede kildetyper. Kontrollér baggrundsteksten i opgaven."],
  ["9. april 1940", "Der blev kæmpet nogle steder, bl.a. i Sønderjylland og ved Amalienborg, og kampene blev stoppet efter få timer. Kontrollér introkortets formulering om regeringens motiver (»undgå, at flere blev dræbt«, »bevare selvstyre«), som er en fortolkning."],
  ["Tvetydighed", "Hver opgave har ét bedste svar for netop den påstand. Hvis du vurderer, at en anden kilde er lige så god, så markér opgaven »kraever_undersoegelse«."],
]);

export async function fixture() {
  const { items } = await load();
  return items.ARCHIVE_ITEMS.map((i) => ({
    tag: i.id,
    step: i.contextKey,
    learning_step: items.STEP_OF_CONTEXT[i.contextKey],
    learning_objective: TEST_OBJECTIVE,
    answer_format: "mc",
    content: {
      question: i.prompt,
      options: i.options.map((o) => o.label),
      option_details: i.options.map((o) => o.detail),
      correct: i.correctLabel,
      accepted_answers: [i.correctLabel],
      review_text: i.feedbackCorrect,
    },
  }));
}

function emptyDecisions(list) {
  return {
    _om: "Lærerens afgørelser (D-332). Tilladte status: " + STATUSES.join(", ") + ". Værktøjet overskriver aldrig en afgørelse.",
    laerer: "",
    dato: "",
    elementer: Object.fromEntries(list.map((e) => [e.id, { status: "ikke_gennemgaaet", kommentar: "" }])),
  };
}

const esc = (t) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** D-338: the review page, built from the same elements; it never reads or writes the decision file itself. */
function html({ list, objective }) {
  const LABEL = { ikke_gennemgaaet: "Ikke gennemgået", godkendt: "Godkendt", godkendt_med_aendringer: "Godkendt med ændringer", afvist: "Afvist", kraever_undersoegelse: "Kræver yderligere undersøgelse" };
  const block = (e) => {
    const parts = [];
    if (e.kind === "maal") parts.push(`<p><strong>Formulering:</strong> ${esc(objective.text)}</p><p><strong>Status:</strong> ${esc(objective.status)}</p>`);
    else if (e.kind === "intro") parts.push(`<blockquote>${esc(e.card.text)}</blockquote>`);
    else if (e.kind === "tjek") parts.push(`<p><strong>Spørgsmål:</strong> ${esc(e.check.question)}</p><ul>${e.check.options.map((o) => `<li>${esc(o)}</li>`).join("")}</ul><p><strong>Forklaring:</strong> ${esc(e.check.explanation)}</p>`);
    else if (e.kind === "arkivkort") parts.push(`<p>${esc(e.card.intro)}</p><table><thead><tr><th>Oplysning</th><th>Felt</th><th>Forklaring</th></tr></thead><tbody>${e.card.facts.map((f) => `<tr><td>${esc(f.text)}</td><td>${esc(f.field)}</td><td>${esc(f.why)}</td></tr>`).join("")}</tbody></table>`);
    else if (e.kind === "refleksion") parts.push(`<p><strong>Spørgsmål:</strong> ${esc(e.reflection.question)}</p><p><strong>Modelsvar:</strong> ${esc(e.reflection.model)}</p>`);
    else {
      const { item, review } = e;
      parts.push(`<p><strong>Opgavetekst:</strong> ${esc(item.prompt)}</p>`);
      parts.push(`<table><thead><tr><th>Kilde</th><th>Bagside</th></tr></thead><tbody>${item.options.map((o) => `<tr${o.id === item.answer ? ' class="right"' : ""}><td>${esc(o.label)}${o.id === item.answer ? " <strong>(rigtigt)</strong>" : ""}</td><td>${back(o.detail).map(esc).join("<br>")}</td></tr>`).join("")}</tbody></table>`);
      const rows = [["Placering", `${review.step} · servertrin ${e.serverStep}`], ["Forudsat viden", review.prerequisites], ["Træner", review.trains], ["Bedømmelse", review.scoring], ["Rigtigt svar og begrundelse", `${item.correctLabel}. ${item.feedbackCorrect}`], ["Historisk kontekst", review.context], ["Kildestatus", review.sourceStatus], ["Vanskelighed", review.difficulty], ["Kan dokumentere", review.evidenceRole], ["Kan IKKE dokumentere", review.cannotDocument]];
      parts.push(`<dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`);
      parts.push(`<p><strong>Typiske fejl:</strong></p><ul>${review.misconceptions.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>`);
      parts.push(`<p><strong>Feedback pr. forkert valg:</strong></p><ul>${item.options.filter((o) => o.id !== item.answer).map((o) => `<li><em>${esc(o.label)}:</em> ${esc(item.optionFeedback?.[o.id] ?? item.feedbackIncorrect)}</li>`).join("")}</ul>`);
    }
    const radios = STATUSES.map((s) => `<label><input type="radio" name="st-${e.id}" value="${s}"${s === "ikke_gennemgaaet" ? " checked" : ""}> ${LABEL[s]}</label>`).join(" ");
    return `<section class="el" id="${e.id}"><h2>${esc(e.title)}</h2>${parts.join("")}<fieldset><legend>Din afgørelse for ${esc(e.id)}</legend>${radios}<label class="c">Kommentar <textarea name="km-${e.id}" rows="2"></textarea></label></fieldset></section>`;
  };
  return `<!doctype html>
<html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lærergennemgang · kildekritik</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<style>
body{font:16px/1.5 system-ui,sans-serif;max-width:900px;margin:0 auto;padding:16px;color:#1f2430;background:#faf8f3}
h1{font-size:24px}h2{font-size:19px;margin-top:0}.el{background:#fff;border:1px solid #d6cfbf;border-radius:8px;padding:14px;margin:14px 0}
table{border-collapse:collapse;width:100%;margin:8px 0}th,td{border-top:1px solid #e3dccb;text-align:left;vertical-align:top;padding:5px 8px}tr.right td{background:#eef6ee}
dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 12px}dt{font-weight:600}dd{margin:0}
fieldset{border:1px dashed #9a8f73;border-radius:6px;margin-top:10px}fieldset label{margin-right:10px;white-space:nowrap}label.c{display:block;margin-top:6px;white-space:normal}textarea{width:100%;font:inherit}
.bar{position:sticky;top:0;background:#faf8f3;padding:8px 0;border-bottom:1px solid #d6cfbf;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.bar input[type=text]{font:inherit;padding:4px}button{font:inherit;padding:6px 12px}.note{font-size:14px;color:#5a4f3a}
@media (max-width:560px){dl{grid-template-columns:1fr}fieldset label{white-space:normal;display:block}}
</style></head><body>
<h1>Lærergennemgang: kildekritisk forløb (D-332/D-338)</h1>
<p class="note">GENERERET af tools/laerligverse/review-pack.mjs. Siden virker uden internet. Den gemmer intet selv: når du er færdig, trykker du »Gem afgørelser som fil« og lægger filen i <code>docs/laerligverse/kildekritik-godkendelse.json</code> (eller sender den). Intet er godkendt, før du har valgt det.</p>
<div class="bar"><label>Lærer <input type="text" id="laerer" autocomplete="name"></label><label>Dato <input type="text" id="dato" placeholder="ÅÅÅÅ-MM-DD"></label>
<label>Indlæs tidligere afgørelser <input type="file" id="load" accept="application/json"></label><button type="button" id="save">Gem afgørelser som fil</button><span id="msg" role="status" aria-live="polite"></span></div>
<section class="el"><h2>Historiefaglig egenkontrol (udviklerens, ikke en godkendelse)</h2><ul>${SELF_CHECK.map(([k, v]) => `<li><strong>${esc(k)}:</strong> ${esc(v)}</li>`).join("")}</ul></section>
${list.map(block).join("\n")}
<script>
const IDS = ${JSON.stringify(list.map((e) => e.id))};
const STATUSES = ${JSON.stringify(STATUSES)};
function collect(){const el={};for(const id of IDS){const s=document.querySelector('input[name="st-'+id+'"]:checked');el[id]={status:s?s.value:"ikke_gennemgaaet",kommentar:document.querySelector('textarea[name="km-'+id+'"]').value}}return{_om:"Lærerens afgørelser (D-332). Tilladte status: "+STATUSES.join(", ")+". Værktøjet overskriver aldrig en afgørelse.",laerer:document.getElementById("laerer").value,dato:document.getElementById("dato").value,elementer:el}}
document.getElementById("save").addEventListener("click",()=>{const d=collect();const decided=Object.values(d.elementer).some(v=>v.status!=="ikke_gennemgaaet");if(decided&&(!d.laerer||!d.dato)){document.getElementById("msg").textContent="Skriv dit navn og datoen, før du gemmer afgørelser.";return}const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(d,null,2)+"\n"],{type:"application/json"}));a.download="kildekritik-godkendelse.json";a.click();document.getElementById("msg").textContent="Gemt som fil."});
document.getElementById("load").addEventListener("change",async(ev)=>{const f=ev.target.files[0];if(!f)return;try{const d=JSON.parse(await f.text());document.getElementById("laerer").value=d.laerer||"";document.getElementById("dato").value=d.dato||"";for(const id of IDS){const v=(d.elementer||{})[id];if(!v)continue;const r=document.querySelector('input[name="st-'+id+'"][value="'+v.status+'"]');if(r)r.checked=true;document.querySelector('textarea[name="km-'+id+'"]').value=v.kommentar||""}document.getElementById("msg").textContent="Afgørelser indlæst."}catch{document.getElementById("msg").textContent="Filen kunne ikke læses."}});
</script></body></html>
`;
}

export async function check() {
  const els = await elements();
  const problems = [];
  if (!existsSync(PACK) || readFileSync(PACK, "utf8") !== md(els)) problems.push("the review pack is stale: run node tools/laerligverse/review-pack.mjs");
  if (!existsSync(HTML) || readFileSync(HTML, "utf8") !== html(els)) problems.push("the review page is stale: run node tools/laerligverse/review-pack.mjs");
  if (!existsSync(FIXTURE) || readFileSync(FIXTURE, "utf8") !== JSON.stringify(await fixture(), null, 2) + "\n") problems.push("the isolated fixture is stale: run node tools/laerligverse/review-pack.mjs");
  if (!existsSync(DECISIONS)) problems.push("the decision file is missing");
  else {
    const d = JSON.parse(readFileSync(DECISIONS, "utf8"));
    const ids = els.list.map((e) => e.id).sort();
    const have = Object.keys(d.elementer ?? {}).sort();
    if (JSON.stringify(ids) !== JSON.stringify(have)) problems.push(`the decision file covers ${have.join(",")}, the pack has ${ids.join(",")}`);
    for (const [id, v] of Object.entries(d.elementer ?? {})) if (!STATUSES.includes(v?.status)) problems.push(`${id}: invalid status ${v?.status}`);
    // A decision needs a signature: any status other than "ikke_gennemgaaet" requires the teacher's name and a date.
    const decided = Object.values(d.elementer ?? {}).some((v) => v?.status !== "ikke_gennemgaaet");
    if (decided && (!d.laerer || !d.dato)) problems.push("the decision file has decisions but no teacher name or date");
  }
  return problems;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes("--check")) {
    const problems = await check();
    for (const p of problems) console.error(p);
    process.exit(problems.length === 0 ? 0 : 1);
  }
  const els = await elements();
  mkdirSync(dirname(PACK), { recursive: true });
  mkdirSync(dirname(FIXTURE), { recursive: true });
  writeFileSync(PACK, md(els));
  writeFileSync(HTML, html(els));
  writeFileSync(FIXTURE, JSON.stringify(await fixture(), null, 2) + "\n");
  if (!existsSync(DECISIONS)) writeFileSync(DECISIONS, JSON.stringify(emptyDecisions(els.list), null, 2) + "\n");
  console.log(`wrote ${els.list.length} elements; decisions ${existsSync(DECISIONS) ? "kept" : "created"}`);
}
