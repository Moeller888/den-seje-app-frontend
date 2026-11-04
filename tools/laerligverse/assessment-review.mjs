// D-346 (F9): the teacher's approval page for the F8 measurement material — the four tests (A, B, T, C) and the
// scoring rubric — plus the five rubric ambiguities and the LP-13 decisions, in one local page.
//
//   node tools/laerligverse/assessment-review.mjs           write docs/laerligverse/proeve-godkendelse.html
//   node tools/laerligverse/assessment-review.mjs --check   exit 1 if the page is stale
//   node tools/laerligverse/serve-assessment-review.mjs     serve it on http://127.0.0.1:4341/
//
// The page is GENERATED from tools/laerligverse/assessment-v1.mjs and rehearsal.mjs, so it shows exactly the
// material the student sheets are built from. Nothing is pre-approved and nothing is sent anywhere: the teacher
// saves the decisions as a JSON file. The page shows the answer key, so it is for the teacher only; it lives in
// docs/, which is never published (tools/cloudflare-build-static.mjs).
//
// VERSION BINDING. Every decision carries the SHA-256 fingerprint of the content it was made on. When a saved file
// is loaded into a page whose content has changed, the affected decision is reset to "Ikke gennemgået" (with its
// old status shown), so a stale approval can never be exported as if it applied to the new content.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CRITERIA, FORMS, PART2_INSTRUCTION, PART2_REASON, PART3_INSTRUCTION, PART3_REASON, TRANSFER, TRANSFER_CRITERIA, VERSION } from "./assessment-v1.mjs";
import { SYNTHETIC_RESPONSES } from "./rehearsal.mjs";
import { stableJson } from "./review-pack.mjs";
import { duplicateKeys } from "./approval-register.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PAGE = join(ROOT, "docs", "laerligverse", "proeve-godkendelse.html");
export const FORMAT = "laerligverse-proeve-godkendelse/1";
export const ITEMS = Object.freeze(["A", "B", "T", "C", "rubrik"]);
export const STATUSES = Object.freeze(["ikke_gennemgaaet", "godkendt", "skal_rettes", "afvist"]);
export const UNDECIDED = "ikke_besluttet";
/** The teacher's comment fields per test; `aendringer` is required for "Skal rettes". */
export const FIELDS = Object.freeze([
  ["faglig", "Faglig kommentar"],
  ["historisk", "Historisk korrekthed"],
  ["sprog", "Sproglig formulering"],
  ["svaerhed", "Sværhedsgrad"],
  ["elevforstaaelse", "Forventet elevforståelse"],
  ["aendringer", "Konkrete rettelser (skal udfyldes ved »Skal rettes«)"],
]);

/** What the developer checked (NOT an approval), what is invented, the didactic reason, and known weaknesses. */
export const FORM_REVIEW = Object.freeze({
  A: {
    verified: "Koleraepidemien i København 1853: ca. 4.742 døde af 7.210 smittede, 11. juni–1. oktober 1853 (KU, plancher om Kommunehospitalet; lex.dk »Koleraen i Danmark i 1800-tallet«).",
    rationale: "Prætest før introduktionen. Afsender og tid står i overskriften (let), modtager og formål skal udledes af teksten (sværere). Del 2 og 3 måler, om eleven kan afgøre, hvad kilden kan bruges til.",
    weaknesses: ["Kilden er den længste (58 ord) og har tre svære ord (Magistraten, lazaret, rendestene, nu med ordforklaring). A kan derfor være en anelse sværere end B og C."],
  },
  B: {
    verified: "Den spanske syge 1918: ca. 0,4 % af befolkningen døde (lex.dk »den spanske syge«); skoler blev lukket lokalt, fx i Thisted i oktober 1918 (Arkiv Thy). En lukning i Aarhus er IKKE kontrolleret — opslaget er konstrueret.",
    rationale: "Posttest straks efter forløbet. Samme opbygning som A, men et andet emne og en anden rækkefølge i del 2 og del 3, så eleven ikke kan genbruge prætestens facit.",
    weaknesses: ["Modtageren er lettere at se (»jeres egen og naboernes skyld«) end i A. B kan derfor være en anelse lettere."],
  },
  T: {
    verified: "Vaskemaskiner bredte sig i danske hjem i 1950'erne og 1960'erne. Firmaet Nordvask og statistikken er opfundne.",
    rationale: "Transfer: ny periode, nyt emne, nye kildetyper (reklame og statistik) og ingen trin-for-trin-spørgsmål. Eleven skal selv tage afsender og formål i brug.",
    weaknesses: ["Nær transfer: samme fag og samme metode. Den viser ikke, at eleven bruger metoden i andre fag."],
  },
  C: {
    verified: "Stormfloden 13. november 1872 på Lolland-Falster: 80–92 omkom på land (lex.dk »stormfloden den 13. november 1872«; videnskab.dk).",
    rationale: "Forsinket test efter reel tid. Samme opbygning som A og B, ny rækkefølge.",
    weaknesses: ["Indberetningen nævner ikke modtageren direkte (»staten«); accepterede svar: regeringen, staten, ministeriet."],
  },
});

/** A pattern that still gives the answer away in all three parallel forms — for the teacher to decide (F9). */
export const SENDER_CUE = Object.freeze({
  finding: "I del 2 nævner ja-påstanden altid afsenderen (»Lægen mente …«, »Sundhedskommissionen ønskede …«, »Amtmanden mente …«), og ingen nej-påstand gør. Reglen »svar ja, når afsenderen er nævnt« giver derfor altid fuldt hus i del 2 uden at læse kilden.",
  proposal: "Forslag (ikke indført): tilføj i hver form en fjerde påstand, der nævner afsenderen, men som kilden IKKE kan belægge, fx »Lægen mente, at koleraen skyldtes bakterier i vandet« (nej). Det koster ca. 1 minut og ændrer Valg fra 0–5 til 0–6.",
});

/** The five ambiguities F8 found (laeringsmaaling.md §5, rehearsal.mjs SYNTHETIC_RESPONSES notes). */
export const AMBIGUITIES = Object.freeze([
  {
    id: "S2", criterion: "R4 Formål", task: "Opgave A, del 1, spørgsmål 4: »Hvorfor tror du, kilden er skrevet? Skriv, hvad afsenderen ville opnå.«",
    answerKey: "R4", proposed: "2 point",
    why: "»penge« er afsenderens hensigt, men i ét ord. Et krav om en hel sætning vil ramme ordblinde elever, der skriver kort.",
    options: [
      { id: "2", label: "2 point: hensigten i ét ord er nok", effect: "Identifikation 6/6." },
      { id: "1", label: "1 point: hensigten skal forklares (»at få penge til …«)", effect: "Identifikation 5/6." },
      { id: "mundtlig", label: "2 point, hvis eleven mundtligt kan sige, hvad pengene skulle bruges til; ellers 1", effect: "5 eller 6 — kræver, at læreren spørger." },
    ],
    recommendation: "2",
    recommendationWhy: "Målet er kildekritik, ikke skrivefærdighed. »penge« svarer på, hvad afsenderen ville opnå.",
  },
  {
    id: "S3", criterion: "B2 Begrundelse, del 3", task: "Opgave A, del 3: »Forklar dit valg ved påstand a med en oplysning om kilden.«",
    answerKey: "B2", proposed: "1 point",
    why: "»det handler om skolen« matcher kildens EMNE med påstanden, ikke dens ophav. Det er en kendt overfladestrategi, men svaret har dog forbindelse til kilden.",
    options: [
      { id: "1", label: "1 point: emne-match tæller som »henviser til kilden generelt«", effect: "Begrundelse 2/4." },
      { id: "0", label: "0 point: emnet er ikke en oplysning om kilden", effect: "Begrundelse 1/4." },
    ],
    recommendation: "1",
    recommendationWhy: "Behold 1, men skriv i rubrikken, at emne-match er niveau 1 og aldrig 2. Så skelnes det fra et svar uden forbindelse til kilden (0).",
  },
  {
    id: "S4", criterion: "B1 Begrundelse, del 2", task: "Opgave A, del 2, påstand 1: »Lægen mente, at de dårlige boliger var med til at gøre folk syge.« (facit: ja)",
    answerKey: "B1", proposed: "2 point",
    why: "Eleven bruger formålet (lægen vil have penge og overdriver måske) og svarer nej. Men påstanden handler om, hvad lægen MENTE, og det viser brevet, også hvis han overdriver. Ophavet bruges, men anvendes forkert.",
    options: [
      { id: "2", label: "2 point: begrundelsen bedømmes for sig; fejlen trækkes kun i Valg", effect: "Begrundelse 4/4; markeringen »begrunder fagligt, men vælger forkert«." },
      { id: "1", label: "1 point: et relevant begreb, men brugt forkert på påstanden", effect: "Begrundelse 3/4; markeringen vises stadig." },
    ],
    recommendation: "1",
    recommendationWhy: "Kompetencen er at bruge ophavet til at afgøre, hvad kilden KAN vise. Eleven bruger ophavet, men konkluderer forkert om netop det. 1 adskiller det fra et korrekt anvendt ræsonnement.",
  },
  {
    id: "S6", criterion: "R3/R4 (følgefejl)", task: "Opgave A, del 1: afsender, modtager og formål",
    answerKey: "R1", proposed: "R1 0, R3 0, R4 0 (følgefejl ikke brugt)",
    why: "Eleven har byttet om på afsender og modtager. Én misforståelse giver så 0 i R1, R3, R4 og B1 — den samme fejl straffes tre–fire gange.",
    options: [
      { id: "foelgefejl", label: "Følgefejl: R1 = 0, men R3 og R4 bedømmes ud fra elevens egen afsender", effect: "Identifikation ca. 3/6 i stedet for 1/6." },
      { id: "facit", label: "Bedøm alt mod facit", effect: "Identifikation 1/6." },
    ],
    recommendation: "foelgefejl",
    recommendationWhy: "Delscoren skal vise, hvad eleven kan. Én forveksling skal tælle én gang. (Lærervejledningen foreslår allerede dette; det er ikke besluttet.)",
  },
  {
    id: "S7", criterion: "R3 Modtager og R4 Formål", task: "Opgave A, del 1, spørgsmål 3 og 4",
    answerKey: "R3", proposed: "0 + 0",
    why: "Begge oplysninger er rigtige, men står i hinandens felter. Det kan være et læse- eller layoutproblem, eller at eleven ikke kender forskellen på modtager og formål — rubrikken kan ikke skelne.",
    options: [
      { id: "0", label: "0 + 0: felterne bedømmes, som de står", effect: "Identifikation 2/6." },
      { id: "1", label: "1 + 1: oplysningerne er der, men byttet om", effect: "Identifikation 4/6." },
      { id: "spoerg", label: "Spørg eleven mundtligt; 2 + 2 hvis eleven kan forklare forskellen, ellers 0 + 0. Notér det", effect: "2/6 eller 6/6." },
    ],
    recommendation: "spoerg",
    recommendationWhy: "Forskellen på modtager og formål er en del af kompetencen, så et byt kan ikke uden videre gives fuldt. Et kort spørgsmål afgør, om det var et byt eller en misforståelse.",
  },
]);

/** The LP-13 decisions — NOT part of approving the tests. From lp13-beslutningskatalog.md. */
export const LP13 = Object.freeze([
  { id: "LP13-1", title: "Hvad sender eleven til revision efter øvelsen?", options: [["A", "Seneste svar i øvelsen er forkert (testpolitikken i dag)"], ["B", "Forkert svar ELLER brugte hints (kræver hints på serveren)"], ["C", "Altid revision"]], recommendation: "A" },
  { id: "LP13-2", title: "Hvor mange revisioner?", options: [["A", "Højst én, derefter videre"], ["B", "Op til to, derefter videre med en lærermarkering"], ["C", "Indtil svaret er rigtigt (frarådes: gættesløjfe)"]], recommendation: "A" },
  { id: "LP13-3", title: "Må svar med hints tælle?", options: [["A", "Hints kun i øvelse; tæller aldrig som selvstændig præstation"], ["B", "Hints overalt, men registreret og fratrukket"], ["C", "Ingen hints"]], recommendation: "A" },
  { id: "LP13-4", title: "Forkert svar i selvstændig anvendelse?", options: [["A", "Videre til overførsel"], ["B", "Tilbage til øvelse og et nyt tjek (kræver flere opgaver)"], ["C", "Lærermarkering, ingen automatisk ændring"]], recommendation: "A" },
  { id: "LP13-5", title: "Hvad må kaldes overførsel?", options: [["A", "Ny periode, samme opgaveform — kaldet »overførsel til en ny periode«"], ["B", "Ny periode og ny opgaveform"], ["C", "Andet fag eller emne"]], recommendation: "A" },
  { id: "genbesoeg", title: "Genbesøg i spillet (en ny øvetid — ikke en måling)", options: [["A", "20 timer (testpolitikken i dag)"], ["B", "1–3 dage"], ["C", "7 dage"]], recommendation: "B" },
  { id: "forsinket", title: "Forsinket faglig test C (målingen af fastholdelse)", options: [["A", "7 dage"], ["B", "2–4 uger"]], recommendation: "A" },
  { id: "LP13-7", title: "Hvad må et færdigt forløb hedde?", options: [["A", "»Alle trin har et svar«"], ["B", "»Gennemført forløb« + en tabel til læreren"], ["C", "»Mestret« (frarådes: kan ikke dokumenteres)"], ["D", "En anden betegnelse (skriv den i kommentaren)"]], recommendation: "B" },
  { id: "pilot", title: "Pilotdesign", options: [["A", "Lille gennemførlighedspilot (4–6 elever)"], ["B", "Én klasse med prætest og posttest"], ["C", "Sammenligningsdesign (to grupper)"]], recommendation: "A" },
]);

const sha = (s) => createHash("sha256").update(s).digest("hex");

/** id → SHA-256 of the content a decision is about: the test with its key and instructions, or the rubric. */
export function contentFingerprints({ forms = FORMS, transfer = TRANSFER } = {}) {
  const shared = { PART2_INSTRUCTION, PART2_REASON, PART3_INSTRUCTION, PART3_REASON };
  return {
    A: sha(stableJson({ form: forms.A, shared, review: FORM_REVIEW.A })),
    B: sha(stableJson({ form: forms.B, shared, review: FORM_REVIEW.B })),
    T: sha(stableJson({ form: transfer, shared, review: FORM_REVIEW.T })),
    C: sha(stableJson({ form: forms.C, shared, review: FORM_REVIEW.C })),
    rubrik: sha(stableJson({ CRITERIA, TRANSFER_CRITERIA, AMBIGUITIES })),
  };
}

const esc = (t) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const LABEL = { ikke_gennemgaaet: "Ikke gennemgået", godkendt: "Godkendt", skal_rettes: "Skal rettes", afvist: "Afvist" };
const titleOf = { A: `Prætest A: ${FORMS.A.title}`, B: `Posttest B: ${FORMS.B.title}`, T: `Transfertest T: ${TRANSFER.title}`, C: `Forsinket test C: ${FORMS.C.title}`, rubrik: "Bedømmelsesrubrikken" };

function studentView(f) {
  const P = [];
  P.push(`<div class="student" data-read="${f.id}"><p class="who">Det ser eleven:</p>`);
  P.push(`<p><strong>${esc(f.source.header)}</strong></p><blockquote>${esc(f.source.text)}</blockquote>`);
  if (f.source.glossary) P.push(`<p class="gl"><em>Ord:</em> ${Object.entries(f.source.glossary).map(([k, v]) => `${esc(k)} = ${esc(v)}`).join(" · ")}</p>`);
  if (f.part1) {
    P.push(`<h4>Del 1</h4><ol>${f.part1.questions.map((q) => `<li>${esc(q)}</li>`).join("")}</ol>`);
    P.push(`<h4>Del 2</h4><p>${esc(PART2_INSTRUCTION)}</p><ol>${f.part2.claims.map((c) => `<li>${esc(c.text)} &nbsp;☐ ja ☐ nej</li>`).join("")}</ol><p>${esc(PART2_REASON)}</p>`);
    P.push(`<h4>Del 3</h4><p>${esc(PART3_INSTRUCTION)}</p><table><thead><tr><th>Kilde</th><th>Hvem · hvornår · til hvem · hvorfor</th></tr></thead><tbody>${f.part3.sources.map((s) => `<tr><td>${esc(s.label)}</td><td>${esc(s.meta)}</td></tr>`).join("")}</tbody></table>`);
    P.push(`<ul>${f.part3.claims.map((c) => `<li><strong>Påstand ${esc(c.id)}:</strong> ${esc(c.text)}</li>`).join("")}</ul><p>${esc(PART3_REASON.replace("{id}", f.part3.reasonFor))}</p>`);
  } else {
    P.push(`<ol>${f.open.map((q) => `<li>${esc(q)}</li>`).join("")}<li>${esc(PART3_INSTRUCTION)}</li></ol>`);
    P.push(`<table><thead><tr><th>Kilde</th><th>Hvem · hvornår · til hvem · hvorfor</th></tr></thead><tbody>${f.choice.sources.map((s) => `<tr><td>${esc(s.label)}</td><td>${esc(s.meta)}</td></tr>`).join("")}</tbody></table>`);
    P.push(`<ul>${f.choice.claims.map((c) => `<li><strong>Påstand ${esc(c.id)}:</strong> ${esc(c.text)}</li>`).join("")}</ul>`);
  }
  P.push(`<div class="ra" hidden><button type="button" class="ra-play">Læs op</button> <button type="button" class="ra-pause">Pause</button> <button type="button" class="ra-resume">Fortsæt</button> <button type="button" class="ra-stop">Stop</button> <span class="ra-msg" role="status" aria-live="polite"></span></div></div>`);
  return P.join("");
}

function teacherView(f) {
  const r = FORM_REVIEW[f.id];
  const P = [`<details class="teacher"><summary>Til læreren: facit, bedømmelse, kilde og begrundelse</summary>`];
  if (f.part1) {
    P.push(`<h4>Facit</h4><table><thead><tr><th>Del</th><th>Facit</th><th>Hvorfor</th></tr></thead><tbody>`);
    ["R1", "R2", "R3", "R4"].forEach((k, i) => P.push(`<tr><td>1.${i + 1} (${k} ${esc(CRITERIA[k].name)})</td><td>${f.part1.key[k].map(esc).join(" · ")}</td><td>accepterede svar</td></tr>`));
    f.part2.claims.forEach((c, i) => P.push(`<tr><td>2.${i + 1}</td><td><strong>${esc(c.answer)}</strong></td><td>${esc(c.why)}</td></tr>`));
    for (const c of f.part3.claims) P.push(`<tr><td>3${esc(c.id)} (${esc(c.sourceKind)})</td><td><strong>${esc(c.answer)}</strong></td><td>${esc(c.why)}</td></tr>`);
    P.push(`</tbody></table><h4>Bedømmelse</h4><p>Identifikation R1–R4 (0–6), Valg V (0–5), Begrundelse B1 + B2 (0–4). Se rubrikken nederst. Delscorerne lægges ikke sammen.</p>`);
  } else {
    P.push(`<h4>Facit</h4><table><tbody><tr><td>1</td><td><strong>Nej.</strong> En reklame viser, hvad firmaet ville sælge og til hvem, ikke hvor mange der havde en maskine (T1, T2).</td></tr><tr><td>2</td><td>Hvordan firmaet ville have kunderne til at se maskinen, og hvilket billede af »den moderne husmor« reklamen gav (T3).</td></tr>${f.choice.claims.map((c) => `<tr><td>3${esc(c.id)}</td><td><strong>${esc(c.answer)}</strong></td></tr>`).join("")}</tbody></table><h4>Bedømmelse</h4><p>T1–T3 (0–2 hver) og TV (0–2). Se rubrikken nederst.</p><p><strong>Hvad er nyt:</strong> ${esc(f.whatChanges)}</p><p><strong>Hvad er det samme:</strong> ${esc(f.whatStays)}</p>`);
  }
  P.push(`<h4>Kildeoplysninger</h4><p>${esc(f.source.kind)}, <strong>${esc(f.source.status)}</strong>: et opfundet eksempel på en ægte kildetype. Ikke en original, forkortelse eller parafrase.</p>`);
  P.push(`<h4>Historiske forbehold</h4><p><strong>Skal kontrolleres af dig:</strong> ${esc(f.frameToCheck)}</p><p><strong>Udviklerens kontrol (ikke en godkendelse):</strong> ${esc(r.verified)}</p>`);
  P.push(`<h4>Didaktisk begrundelse</h4><p>${esc(r.rationale)}</p><h4>Kendte svagheder</h4><ul>${r.weaknesses.map((w) => `<li>${esc(w)}</li>`).join("")}${f.part1 ? `<li>${esc(SENDER_CUE.finding)} <em>${esc(SENDER_CUE.proposal)}</em></li>` : ""}</ul>`);
  P.push(`<p class="tid">Tid: ${f.minutes} min.</p></details>`);
  return P.join("");
}

function decision(id) {
  const radios = STATUSES.map((s) => `<label><input type="radio" name="st-${id}" value="${s}"${s === "ikke_gennemgaaet" ? " checked" : ""}> ${LABEL[s]}</label>`).join(" ");
  const fields = FIELDS.map(([k, l]) => `<label class="c">${esc(l)} <textarea name="${k}-${id}" rows="2"></textarea></label>`).join("");
  return `<fieldset class="dec"><legend>Din afgørelse: ${esc(titleOf[id])}</legend><p class="stale" hidden></p>${radios}${fields}</fieldset>`;
}

function rubricTable(criteria) {
  return `<table><thead><tr><th>Kriterium</th><th>Point</th><th>Niveauer</th></tr></thead><tbody>${Object.entries(criteria).map(([k, c]) => `<tr><td>${esc(k)} ${esc(c.name)}</td><td>0–${c.max}</td><td>${c.levels.map((t, i) => (c.levels.length > 1 ? `<strong>${i}:</strong> ${esc(t)}` : esc(t))).join("<br>")}</td></tr>`).join("")}</tbody></table>`;
}

function ambiguity(a) {
  const s = SYNTHETIC_RESPONSES.find((r) => r.id === a.id);
  const text = s?.text?.[a.answerKey] ?? "";
  const extra = Object.entries(s?.text ?? {}).filter(([k]) => k !== a.answerKey).map(([k, v]) => `${k}: »${esc(v)}«`).join(" · ");
  const opts = [`<label><input type="radio" name="tv-${a.id}" value="${UNDECIDED}" checked> Ikke besluttet</label>`]
    .concat(a.options.map((o) => `<label><input type="radio" name="tv-${a.id}" value="${esc(o.id)}"> ${esc(o.label)}${o.id === a.recommendation ? " <em>(anbefalet)</em>" : ""} <span class="eff">— ${esc(o.effect)}</span></label>`)).join("");
  return `<section class="amb" id="tv-${a.id}"><h3>${esc(a.id)} · ${esc(s?.kind ?? "")} (${esc(a.criterion)})</h3>`
    + `<p><strong>Opgaven:</strong> ${esc(a.task)}</p><p><strong>Det syntetiske elevsvar</strong> (konstrueret, ikke en elev): »${esc(text)}«${extra ? `<br><span class="eff">Resten af svaret: ${extra}</span>` : ""}</p>`
    + `<p><strong>Foreslået bedømmelse (F8):</strong> ${esc(a.proposed)}</p><p><strong>Hvorfor det er svært:</strong> ${esc(a.why)}</p>`
    + `<fieldset class="dec"><legend>Din beslutning om ${esc(a.id)}</legend>${opts}<p><strong>Min anbefaling:</strong> ${esc(a.recommendationWhy)}</p><label class="c">Kommentar <textarea name="tvk-${a.id}" rows="2"></textarea></label></fieldset></section>`;
}

function lp13(d) {
  const opts = [`<label><input type="radio" name="lp-${d.id}" value="${UNDECIDED}" checked> Ikke besluttet</label>`]
    .concat(d.options.map(([v, l]) => `<label><input type="radio" name="lp-${d.id}" value="${v}"> ${v}: ${esc(l)}${v === d.recommendation ? " <em>(anbefalet)</em>" : ""}</label>`)).join("");
  return `<fieldset class="dec lp" id="lp-${d.id}"><legend>${esc(d.id)}: ${esc(d.title)}</legend>${opts}<label class="c">Kommentar <textarea name="lpk-${d.id}" rows="1"></textarea></label></fieldset>`;
}

export function html() {
  const fps = contentFingerprints();
  const forms = { A: FORMS.A, B: FORMS.B, T: TRANSFER, C: FORMS.C };
  const testSection = (id) => `<section class="el" id="${id}" data-status="ikke_gennemgaaet"><h2>${esc(titleOf[id])}</h2>${studentView(forms[id])}${teacherView(forms[id])}${decision(id)}</section>`;
  return `<!doctype html>
<html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Prøvegodkendelse · kildekritik</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<style>
:root{--ink:#1f2430;--bg:#faf8f3;--card:#fff;--line:#d6cfbf;--muted:#5a4f3a;--ok:#2d6a3e;--warn:#9a6a00;--bad:#9b1c1c;--stu:#f3f7fb}
@media (prefers-color-scheme: dark){:root{--ink:#e8e4da;--bg:#1b1d22;--card:#24272e;--line:#3d4048;--muted:#b9b09c;--stu:#1f2a35}}
body{font:16px/1.5 system-ui,sans-serif;max-width:960px;margin:0 auto;padding:16px;color:var(--ink);background:var(--bg)}
h1{font-size:24px}h2{font-size:20px;margin-top:0}h3{font-size:17px;margin:0 0 6px}h4{font-size:15px;margin:12px 0 4px}
.el,.amb,.ov{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:14px;margin:14px 0}
.student{background:var(--stu);border-radius:6px;padding:10px 12px}.who{font-size:13px;color:var(--muted);margin:0}
blockquote{margin:8px 0;padding-left:12px;border-left:3px solid var(--line)}
table{border-collapse:collapse;width:100%;margin:8px 0}th,td{border-top:1px solid var(--line);text-align:left;vertical-align:top;padding:5px 8px}
details.teacher{margin-top:10px;border:1px dashed var(--line);border-radius:6px;padding:8px}summary{cursor:pointer;font-weight:600}
fieldset{border:1px dashed var(--line);border-radius:6px;margin-top:10px}fieldset label{display:block;margin:3px 0}label.c{margin-top:6px}textarea{width:100%;font:inherit;box-sizing:border-box}
.bar{position:sticky;top:0;z-index:1;background:var(--bg);padding:8px 0;border-bottom:1px solid var(--line);display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.bar input[type=text]{font:inherit;padding:4px}button{font:inherit;padding:6px 12px}.note,.eff{font-size:14px;color:var(--muted)}
.el[data-status="godkendt"]{border-left:6px solid var(--ok)}.el[data-status="skal_rettes"]{border-left:6px solid var(--warn)}.el[data-status="afvist"]{border-left:6px solid var(--bad)}
.stale{color:var(--bad);font-weight:600}#count{font-weight:600}.sep{border-top:3px double var(--line);margin-top:28px;padding-top:6px}
</style></head><body>
<h1>Prøvegodkendelse: kildekritik (D-346)</h1>
<p class="note">Genereret af tools/laerligverse/assessment-review.mjs fra de samme data som elevarkene (${esc(VERSION)}). Siden virker uden internet og gemmer intet selv: tryk »Gem afgørelser som fil«. Intet er godkendt, før du har valgt det.</p>
<div class="bar"><label>Lærer <input type="text" id="laerer" autocomplete="name"></label><label>Dato <input type="text" id="dato" placeholder="DD-MM-ÅÅÅÅ"></label>
<label>Indlæs tidligere afgørelser <input type="file" id="load" accept="application/json"></label><button type="button" id="save">Gem afgørelser som fil</button><span id="count" aria-live="polite"></span><span id="msg" role="status" aria-live="polite"></span></div>
<section class="ov" id="overblik"><h2>A. Overblik</h2>
<p><strong>Formål:</strong> at undersøge, om eleverne kan noget efter Arkivskabet, som de ikke kunne før: prætest før forløbet, posttest straks efter, en transfertest på nyt materiale og en forsinket test efter reel tid.</p>
<p><strong>Kompetence:</strong> at bruge en kildes afsender, tidspunkt, modtager og formål til at afgøre, hvad kilden kan og ikke kan bruges som belæg for. Målt i tre delscorer: identifikation, valg og begrundelse.</p>
<p><strong>Tid:</strong> A ${FORMS.A.minutes} min, B ${FORMS.B.minutes} min, T ${TRANSFER.minutes} min, C ${FORMS.C.minutes} min. Dag 1 (A, forløbet, B, T) kræver en dobbeltlektion.</p>
<table><thead><tr><th>Del</th><th>Status</th></tr></thead><tbody>
<tr><td>Arkivskabets 12 elementer</td><td><strong>Godkendt</strong> af Christopher Møller 04-11-2026 (SHA-256 8cd7d969…). Ikke en del af denne side.</td></tr>
<tr><td>Prøverne A, B, T, C og rubrikken</td><td><strong>Kræver din vurdering</strong> her</td></tr>
<tr><td>De fem tvivlstilfælde i rubrikken</td><td><strong>Kræver din beslutning</strong> (afsnit E)</td></tr>
<tr><td>LP-13 (læringsprogression)</td><td><strong>Kræver din beslutning</strong> (afsnit F) — ikke en del af prøvegodkendelsen</td></tr>
<tr><td>Elevpilot og produktion</td><td><strong>Ikke autoriseret</strong></td></tr></tbody></table>
<p><label><input type="checkbox" id="ra-on"> Prøv oplæsning af elevteksten (prototype, slået fra som standard). Bruger kun stemmer, som browseren angiver som lokale på denne computer; ingen tekst sendes af siden.</label> <span id="ra-voice" class="note"></span></p></section>
<h2 class="sep">B. Prætest</h2>${testSection("A")}
<h2 class="sep">C. Posttest</h2>${testSection("B")}
<h2 class="sep">D. Transfer og forsinket test</h2>${testSection("T")}${testSection("C")}
<h2 class="sep">E. Bedømmelsesrubrik</h2>
<section class="el" id="rubrik" data-status="ikke_gennemgaaet"><h2>${esc(titleOf.rubrik)}</h2>
<p>Tre delscorer, som rapporteres hver for sig. Ingen samlet score og ingen grænse for »mestret«.</p>${rubricTable(CRITERIA)}<h4>Transfertest</h4>${rubricTable(TRANSFER_CRITERIA)}
<h4>De fem tvivlstilfælde (fra bedømmelsesforsøget med syntetiske svar)</h4><p class="note">Dine valg her ændrer ikke rubrikken af sig selv. De bliver gemt i filen, og rubrikken rettes først bagefter, efter din beslutning.</p>
${AMBIGUITIES.map(ambiguity).join("\n")}${decision("rubrik")}</section>
<h2 class="sep">F. Beslutninger om læringsprogression (LP-13)</h2>
<section class="ov" id="lp13"><p><strong>Dette er ikke en del af godkendelsen af prøvernes faglige indhold.</strong> Valgene gemmes i samme fil, men aktiverer intet: ingen regel ændres i spillet eller på serveren, før der er givet et særskilt GO.</p>
${LP13.map(lp13).join("\n")}</section>
<script>
const ITEMS = ${JSON.stringify(ITEMS)};
const STATUSES = ${JSON.stringify(STATUSES)};
const FIELDS = ${JSON.stringify(FIELDS.map(([k]) => k))};
const AMB = ${JSON.stringify(AMBIGUITIES.map((a) => ({ id: a.id, values: a.options.map((o) => o.id) })))};
const LPS = ${JSON.stringify(LP13.map((d) => ({ id: d.id, values: d.options.map(([v]) => v) })))};
const FP = ${JSON.stringify(fps)};
const FORMAT = ${JSON.stringify(FORMAT)};
const VERSION = ${JSON.stringify(VERSION)};
const LABEL = ${JSON.stringify(LABEL)};
const UNDECIDED = ${JSON.stringify(UNDECIDED)};
const $ = (s) => document.querySelector(s);
const radio = (name) => { const r = document.querySelector('input[name="' + name + '"]:checked'); return r ? r.value : null; };
const setRadio = (name, v) => { for (const r of document.querySelectorAll('input[name="' + name + '"]')) if (r.value === v) { r.checked = true; return true; } return false; };
function collect() {
  const proever = {};
  for (const id of ITEMS) { const o = { status: radio("st-" + id) || "ikke_gennemgaaet" }; for (const f of FIELDS) o[f] = $('textarea[name="' + f + "-" + id + '"]').value; proever[id] = o; }
  const tvetydigheder = {}; for (const a of AMB) tvetydigheder[a.id] = { valg: radio("tv-" + a.id) || UNDECIDED, kommentar: $('textarea[name="tvk-' + a.id + '"]').value };
  const lp13 = {}; for (const d of LPS) lp13[d.id] = { valg: radio("lp-" + d.id) || UNDECIDED, kommentar: $('textarea[name="lpk-' + d.id + '"]').value };
  return { _om: "Lærerens afgørelser om prøverne (D-346). Gemmes kun som fil; intet sendes eller aktiveres.", format: FORMAT, version: VERSION, laerer: $("#laerer").value, dato: $("#dato").value, indhold: FP, proever, tvetydigheder, lp13 };
}
function count() {
  const d = collect();
  const done = ITEMS.filter((id) => d.proever[id].status !== "ikke_gennemgaaet").length;
  const amb = AMB.filter((a) => d.tvetydigheder[a.id].valg !== UNDECIDED).length;
  $("#count").textContent = done + " af " + ITEMS.length + " gennemgået · " + amb + " af " + AMB.length + " tvivlstilfælde";
  for (const id of ITEMS) document.getElementById(id).dataset.status = d.proever[id].status;
}
document.addEventListener("change", count);
count();
function msg(t) { $("#msg").textContent = t; }
$("#save").addEventListener("click", () => {
  const d = collect();
  const decided = ITEMS.some((id) => d.proever[id].status !== "ikke_gennemgaaet") || AMB.some((a) => d.tvetydigheder[a.id].valg !== UNDECIDED) || LPS.some((x) => d.lp13[x.id].valg !== UNDECIDED);
  if (decided && (!d.laerer.trim() || !d.dato.trim())) { msg("Skriv dit navn og datoen, før du gemmer afgørelser."); return; }
  const missing = ITEMS.filter((id) => d.proever[id].status === "skal_rettes" && !d.proever[id].aendringer.trim());
  if (missing.length) { msg("Skriv, hvad der skal rettes, for: " + missing.join(", ")); return; }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2) + String.fromCharCode(10)], { type: "application/json" }));
  a.download = "proeve-godkendelse.json";
  a.click();
  msg("Gemt som fil.");
});
function applyFile(d) {
  if (!d || typeof d !== "object" || Array.isArray(d)) throw new Error("filen er ikke et JSON-objekt");
  if (d.format !== FORMAT) throw new Error("det er ikke en prøvegodkendelsesfil (format " + String(d.format) + ")");
  if (!d.proever || typeof d.proever !== "object") throw new Error("filen mangler afgørelser");
  const stale = [];
  $("#laerer").value = typeof d.laerer === "string" ? d.laerer : "";
  $("#dato").value = typeof d.dato === "string" ? d.dato : "";
  for (const id of ITEMS) {
    const v = d.proever[id] && typeof d.proever[id] === "object" ? d.proever[id] : {};
    for (const f of FIELDS) $('textarea[name="' + f + "-" + id + '"]').value = typeof v[f] === "string" ? v[f] : "";
    const note = document.querySelector("#" + id + " .stale");
    const status = STATUSES.includes(v.status) ? v.status : "ikke_gennemgaaet";
    const changed = !d.indhold || d.indhold[id] !== FP[id];
    if (changed && status !== "ikke_gennemgaaet") {
      setRadio("st-" + id, "ikke_gennemgaaet");
      note.textContent = "Indholdet er ændret efter din afgørelse (" + LABEL[status] + "). Gennemgå det igen.";
      note.hidden = false;
      stale.push(id);
    } else { setRadio("st-" + id, status); note.textContent = ""; note.hidden = true; }
  }
  for (const a of AMB) { const v = (d.tvetydigheder || {})[a.id] || {}; if (!setRadio("tv-" + a.id, a.values.includes(v.valg) ? v.valg : UNDECIDED)) setRadio("tv-" + a.id, UNDECIDED); $('textarea[name="tvk-' + a.id + '"]').value = typeof v.kommentar === "string" ? v.kommentar : ""; }
  for (const x of LPS) { const v = (d.lp13 || {})[x.id] || {}; if (!setRadio("lp-" + x.id, x.values.includes(v.valg) ? v.valg : UNDECIDED)) setRadio("lp-" + x.id, UNDECIDED); $('textarea[name="lpk-' + x.id + '"]').value = typeof v.kommentar === "string" ? v.kommentar : ""; }
  count();
  return stale;
}
$("#load").addEventListener("change", async (ev) => {
  const f = ev.target.files[0];
  if (!f) return;
  try {
    const stale = applyFile(JSON.parse(await f.text()));
    msg(stale.length ? "Afgørelser indlæst. Ændret indhold skal gennemgås igen: " + stale.join(", ") : "Afgørelser indlæst.");
  } catch (e) { msg("Filen kunne ikke læses: " + (e && e.message ? e.message : String(e))); }
});
// Read-aloud PROTOTYPE (D-346): off by default; local voices only; nothing leaves the page.
const synth = typeof window.speechSynthesis === "object" && window.speechSynthesis ? window.speechSynthesis : null;
function localDanishVoice() {
  if (!synth || typeof synth.getVoices !== "function") return null;
  const vs = synth.getVoices() || [];
  return vs.find((v) => v && v.localService === true && typeof v.lang === "string" && v.lang.toLowerCase().replace("_", "-").startsWith("da")) || null;
}
function voiceNote() {
  const v = localDanishVoice();
  $("#ra-voice").textContent = !synth ? "Browseren har ingen oplæsning." : v ? "Lokal dansk stemme: " + v.name : "Ingen lokal dansk stemme på denne computer.";
}
$("#ra-on").addEventListener("change", (ev) => {
  for (const el of document.querySelectorAll(".ra")) el.hidden = !ev.target.checked;
  if (!ev.target.checked && synth) synth.cancel();
  voiceNote();
});
if (synth && typeof synth.addEventListener === "function") synth.addEventListener("voiceschanged", voiceNote);
function readable(box) {
  // The student's text only: everything in the box except the label line and the player itself.
  return Array.from(box.children).filter((el) => !el.classList.contains("who") && !el.classList.contains("ra"))
    .map((el) => el.textContent.split("☐").join(" ")).join(". ").replace(/\\s+/g, " ");
}
document.addEventListener("click", (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLElement) || !t.closest(".ra")) return;
  const box = t.closest(".student");
  const out = box.querySelector(".ra-msg");
  if (!synth) { out.textContent = "Browseren har ingen oplæsning."; return; }
  if (t.classList.contains("ra-play")) {
    const v = localDanishVoice();
    if (!v) { out.textContent = "Ingen lokal dansk stemme. Siden bruger ikke netværksstemmer."; return; }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(readable(box));
    u.lang = "da-DK"; u.voice = v; u.rate = 0.9;
    u.onend = () => { out.textContent = "Færdig."; };
    u.onerror = (e) => { out.textContent = "Oplæsningen stoppede: " + (e && e.error ? e.error : "fejl"); };
    synth.speak(u);
    out.textContent = "Læser op (" + v.name + ").";
  } else if (t.classList.contains("ra-pause")) { synth.pause(); out.textContent = "Pause."; }
  else if (t.classList.contains("ra-resume")) { synth.resume(); out.textContent = "Fortsætter."; }
  else if (t.classList.contains("ra-stop")) { synth.cancel(); out.textContent = "Stoppet."; }
});
</script></body></html>
`;
}

/** Validate a saved decision file (read-only). `stale` lists decisions made on content that has since changed. */
export function validateReviewExport(raw) {
  const problems = [];
  const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw ?? "");
  let d;
  try { d = JSON.parse(text); } catch (e) { return { problems: [`not valid JSON: ${e.message}`], stale: [] }; }
  if (d === null || typeof d !== "object" || Array.isArray(d)) return { problems: ["the top level is not an object"], stale: [] };
  for (const k of duplicateKeys(text)) problems.push(`appears more than once in the same object: ${k}`);
  if (d.format !== FORMAT) problems.push(`format is ${d.format}, expected ${FORMAT}`);
  const ok = new Set(["_om", "format", "version", "laerer", "dato", "indhold", "proever", "tvetydigheder", "lp13"]);
  for (const k of Object.keys(d)) if (!ok.has(k)) problems.push(`unknown top-level field: ${k}`);
  const p = d.proever ?? {};
  for (const id of ITEMS) if (!(id in p)) problems.push(`missing test: ${id}`);
  for (const id of Object.keys(p)) if (!ITEMS.includes(id)) problems.push(`unknown test: ${id}`);
  for (const [id, v] of Object.entries(p)) {
    if (!STATUSES.includes(v?.status)) problems.push(`${id}: invalid status ${v?.status}`);
    for (const [f] of FIELDS) if (v?.[f] !== undefined && typeof v[f] !== "string") problems.push(`${id}: ${f} is not text`);
    if (v?.status === "skal_rettes" && !String(v?.aendringer ?? "").trim()) problems.push(`${id}: "skal_rettes" without a requested change`);
  }
  for (const a of AMBIGUITIES) {
    const v = d.tvetydigheder?.[a.id]?.valg;
    if (v !== UNDECIDED && !a.options.some((o) => o.id === v)) problems.push(`${a.id}: invalid choice ${v}`);
  }
  for (const x of LP13) {
    const v = d.lp13?.[x.id]?.valg;
    if (v !== UNDECIDED && !x.options.some(([o]) => o === v)) problems.push(`${x.id}: invalid choice ${v}`);
  }
  const decided = Object.values(p).some((v) => v?.status !== "ikke_gennemgaaet")
    || AMBIGUITIES.some((a) => (d.tvetydigheder?.[a.id]?.valg ?? UNDECIDED) !== UNDECIDED)
    || LP13.some((x) => (d.lp13?.[x.id]?.valg ?? UNDECIDED) !== UNDECIDED);
  if (decided && (!String(d.laerer ?? "").trim() || !String(d.dato ?? "").trim())) problems.push("decisions without a teacher name or date");
  const fps = contentFingerprints();
  const stale = ITEMS.filter((id) => p[id]?.status && p[id].status !== "ikke_gennemgaaet" && d.indhold?.[id] !== fps[id]);
  return { problems, stale };
}

export function check() {
  return !existsSync(PAGE) || readFileSync(PAGE, "utf8") !== html() ? ["the test approval page is stale: run node tools/laerligverse/assessment-review.mjs"] : [];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes("--check")) {
    const problems = check();
    for (const p of problems) console.error(p);
    process.exit(problems.length === 0 ? 0 : 1);
  }
  writeFileSync(PAGE, html());
  console.log("wrote docs/laerligverse/proeve-godkendelse.html");
}
