// D-344 (F8): the teacher pack, generated from tools/laerligverse/assessment-v1.mjs so the student sheets, the
// teacher's key and the registration sheet cannot drift apart.
//
//   node tools/laerligverse/assessment-pack.mjs           write the pack
//   node tools/laerligverse/assessment-pack.mjs --check   exit 1 if the pack is stale
//
// The student sheets (elevark.md) contain NO answer key; the key is only in laerervejledning.md. Both live in
// docs/, which is never published (tools/cloudflare-build-static.mjs excludes docs/ and tools/).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { APPROVAL, CALIBRATION, CRITERIA, FORMS, HANDOVER, MINUTES, MUNDTLIG_OPFOELGNING, PART2_INSTRUCTION, PART2_REASON, PART3_INSTRUCTION, PART3_REASON, RUBRIC_VERSION, SCORING_RULES, TRANSFER, TRANSFER_CRITERIA, VERSION } from "./assessment-v1.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = join(ROOT, "docs", "laerligverse", "laererpakke");
export const STUDENT = join(DIR, "elevark.md");
export const TEACHER = join(DIR, "laerervejledning.md");
export const SHEET = join(DIR, "registreringsskema.csv");

const GEN = "> **GENERERET** af `tools/laerligverse/assessment-pack.mjs` fra `tools/laerligverse/assessment-v1.mjs`. Ret ikke her.";
const STATUS = `> **Status: ${APPROVAL.text}**`;
/** F9: the page break. Part 1 (in T: questions 1–2) is handed in before the pupil gets the next page. */
const PAGE_BREAK = ["", `*${HANDOVER}*`, "", "<!-- NY SIDE: læreren samler siden ind, før eleven får næste side -->", "", "---", ""];
const sourceBlock = (src) => [`**${src.header}**`, "", `> ${src.text}`, "", ...(src.glossary ? [`*Ord:* ${Object.entries(src.glossary).map(([k, v]) => `${k} = ${v}`).join(" · ")}`, ""] : [])];

function studentForm(f) {
  const L = [];
  L.push(`## Opgave ${f.id}: ${f.title}`, "", `Navn eller elevkode: ______________________    Dato: __________`, "");
  L.push("Læs kilden. Du må gerne få den læst op. Du må svare med få ord.", "");
  L.push(...sourceBlock(f.source));
  L.push("### Del 1", "");
  f.part1.questions.forEach((q, i) => L.push(`${i + 1}. ${q}`, "", "   ____________________________________________", ""));
  L.push(...PAGE_BREAK, `### Opgave ${f.id}, side 2`, "", "Navn eller elevkode: ______________________", "", ...sourceBlock(f.source));
  L.push("### Del 2", "", PART2_INSTRUCTION, "", "| Påstand | Ja | Nej |", "|---|---|---|");
  f.part2.claims.forEach((c, i) => L.push(`| ${i + 1}. ${c.text} | ☐ | ☐ |`));
  L.push("", PART2_REASON, "", "____________________________________________", "", "____________________________________________", "");
  L.push("### Del 3", "", PART3_INSTRUCTION, "", "| Kilde | Hvem · hvornår · til hvem · hvorfor |", "|---|---|");
  for (const s of f.part3.sources) L.push(`| ${s.label} | ${s.meta} |`);
  L.push("");
  for (const c of f.part3.claims) L.push(`**Påstand ${c.id}:** ${c.text}`, "", "Bedste kilde: ______________________", "");
  L.push(PART3_REASON.replace("{id}", f.part3.reasonFor), "", "____________________________________________", "", "---", "");
  return L.join("\n");
}

function studentTransfer(t) {
  const L = [];
  L.push(`## Opgave ${t.id}: ${t.title}`, "", `Navn eller elevkode: ______________________    Dato: __________`, "");
  L.push("Læs kilden. Du må gerne få den læst op. Du må svare med få ord.", "");
  L.push(...sourceBlock(t.source));
  t.open.forEach((q, i) => L.push(`${i + 1}. ${q}`, "", "   ____________________________________________", "", "   ____________________________________________", ""));
  L.push(...PAGE_BREAK, `### Opgave ${t.id}, side 2`, "", "Navn eller elevkode: ______________________", "", ...sourceBlock(t.source));
  L.push(`${t.open.length + 1}. ${PART3_INSTRUCTION}`, "", "| Kilde | Hvem · hvornår · til hvem · hvorfor |", "|---|---|");
  for (const s of t.choice.sources) L.push(`| ${s.label} | ${s.meta} |`);
  L.push("");
  for (const c of t.choice.claims) L.push(`**Påstand ${c.id}:** ${c.text}`, "", "Bedste kilde: ______________________", "");
  return L.join("\n");
}

export function studentSheets() {
  const L = ["# Elevark: kildekritik (prætest, posttest, transfertest, forsinket test)", "", GEN, "", STATUS, ""];
  L.push("Til læreren: Hver opgave printes for sig, side 1 og side 2 på hvert sit ark. Eleven får kun den opgave, der skal bruges den dag. Saml side 1 ind, før eleven får side 2: side 2 nævner modtager og formål og ville ellers give svarene i del 1. Facit står i `laerervejledning.md`, aldrig her.", "");
  L.push(studentForm(FORMS.A), studentForm(FORMS.B), studentTransfer(TRANSFER), "", "---", "", studentForm(FORMS.C));
  return L.join("\n");
}

function keyForm(f) {
  const L = [];
  L.push(`### ${f.id} · ${f.role} · ${f.title} (${f.minutes} min)`, "");
  L.push(`**Materialestatus:** kilden er *${f.source.status}*: et opfundet ${f.source.kind.toLowerCase()} af en ægte kildetype. Det er ikke en original, en forkortelse eller en parafrase.`, "");
  L.push(`**Historisk ramme, som du skal kontrollere:** ${f.frameToCheck}`, "");
  L.push("| Del 1 | Kriterium | Accepterede svar (eksempler) |", "|---|---|---|");
  ["R1", "R2", "R3", "R4"].forEach((k, i) => L.push(`| ${i + 1} | ${k} ${CRITERIA[k].name} (0–${CRITERIA[k].max}) | ${f.part1.key[k].join(" · ")} |`));
  L.push("", "| Del 2 | Type | Facit | Hvorfor |", "|---|---|---|---|");
  f.part2.claims.forEach((c, i) => L.push(`| ${i + 1}. ${c.text} | ${c.type} | **${c.answer}** | ${c.why} |`));
  L.push("", "Typerne er de samme i A, B og C: **J1** afsenderens egen holdning eller handling (ja) · **J2** et forhold, kilden kan belægge, uden at afsenderen nævnes (ja) · **N1** hvad der skete bagefter (nej) · **N2** mere, end afsenderen kunne vide eller skrev om (nej). Afsenderen nævnes i én ja- og én nej-påstand, så »ja, når afsenderen er nævnt« ikke virker.");
  L.push("", "Begrundelsen bedømmes med B1.", "", "| Del 3 | Facit | Hvorfor |", "|---|---|---|");
  for (const c of f.part3.claims) L.push(`| ${c.id}. ${c.text} | **${c.answer}** | ${c.why} |`);
  const pers = f.part3.claims.find((c) => c.sourceKind === "personlig");
  const off = f.part3.claims.find((c) => c.sourceKind === "officiel");
  L.push("", `Begrundelsen ved påstand ${f.part3.reasonFor} bedømmes med B2. Påstand ${pers?.id} besvares af den personlige kilde og påstand ${off?.id} af den officielle, så en elev, der altid vælger den personlige kilde, får kun det ene rigtigt. Rækkefølgen skifter mellem formerne.`, "");
  return L.join("\n");
}

function rubricTable(criteria) {
  const L = ["| Kriterium | Point | Niveauer |", "|---|---|---|"];
  for (const [k, c] of Object.entries(criteria)) L.push(`| ${k} ${c.name} | 0–${c.max} | ${c.levels.map((t, i) => (c.levels.length > 1 ? `**${i}:** ${t}` : t)).join("<br>")} |`);
  return L.join("\n");
}

export function teacherGuide() {
  const L = [];
  L.push("# Lærerpakke: kildekritik i Arkivskabet (D-344, F8)", "", GEN, "", STATUS, "");
  L.push("## Godkendelsesstatus", "", "| Del | Status |", "|---|---|");
  L.push("| Arkivskabets 12 læringselementer | **Godkendt** af Christopher Møller 04-11-2026 (`docs/laerligverse/kildekritik-godkendelse-register.json`, SHA-256 `8cd7d969…`) |");
  L.push(`| Prøverne og rubrikken i denne pakke (${VERSION}, ${RUBRIC_VERSION}) | **Godkendt** af Christopher Møller 05-11-2026 (\`docs/laerligverse/proeve-godkendelse-register-v1.5.json\`). Tidligere godkendelser (v1.2, v1.4) er bevaret som historik |`);
  L.push("| LP-13-regler (sekvenspolitikken) | **Valg registreret 05-11-2026, ikke aktiveret** (`docs/laerligverse/proeve-godkendelse-register.json`; betydning i `docs/laerligverse/lp13-beslutningskatalog.md`) |");
  L.push("| Elevpilot | **Ikke autoriseret** |", "| Produktionsintegration | **Ikke autoriseret** |", "");
  L.push("## 1. Forløbet kort", "");
  L.push("Eleverne arbejder i Arkivskabet med ét kildekritisk mål: at bruge en kildes afsender, tidspunkt, modtager og formål til at afgøre, hvad kilden kan og ikke kan bruges som belæg for. Forløbet har introduktion, en øvelse med hjælp, evt. revision, en selvstændig opgave, en opgave fra en anden periode (1864) og et genbesøg.", "");
  L.push("## 2. Læringsmål (forslag, kræver LP-2)", "", "Eleven kan identificere en historisk kildes afsender, tidspunkt, modtager, formål og kontekst og anvende disse forhold til at begrunde, hvad kilden kan og ikke kan bruges som belæg for.", "");
  L.push("## 3. Klassetrin og tid", "", "Foreslået klassetrin: 6.–8. (forslag, ikke afprøvet).", "", "| Del | Minutter |", "|---|---|");
  L.push(`| Prætest (A) | ${MINUTES.A} |`, "| Introduktion og Arkivskabet | 20–25 |", `| Posttest (B), straks efter | ${MINUTES.B} |`, `| Transfertest (T), samme dag | ${MINUTES.T} |`, "| Elevfeedback | 3 |", `| Forsinket test (C), efter reel tid (forslag: 7 dage, LP13-6) | ${MINUTES.C} |`, "| **I alt** | dag 1: ca. 60 min (en dobbeltlektion; én lektion på 45 min er for lidt); dag 2: 12 min |", "", "Kan dag 1 ikke rumme en dobbeltlektion, så tag prætesten i en tidligere lektion (højst 1–2 dage før), og notér det.", "");
  L.push("## 4. Lærervejledning", "");
  L.push("1. **Før:** Giv hver elev en kode (fx A07). Skriv koblingen kode → elev på et ark, der bliver hos dig. Lærlig får aldrig navne.");
  L.push("2. **Prætest:** Del side 1 af opgave A ud. Sig: »Det er ikke en prøve med karakter. Vi vil se, hvad I kan nu.« Undervis ikke før eller under prætesten. Saml side 1 ind, før eleven får side 2 (del 2 og 3). Det samme gælder B, C og T, fordi side 2 nævner modtager og formål.");
  L.push("3. **Støtte (samme ved A, B, T og C for den samme elev):** Alle elever må få kilden og spørgsmålene læst op (af dig, en makker eller en lydfil), svare mundtligt (du skriver ordret ned), få ekstra tid og større skrift. Hjælp til kildekritik (»hvem er afsenderen?«) er ikke tilladt. Notér støtten i `*_stoette` (fx `oplaesning_laerer`, `mundtlig`, `ekstra_tid`). Ændres støtten mellem A og B, indgår eleven ikke i B − A. Se `docs/laerligverse/oplaesning-og-fair-maaling.md` §7.1.");
  L.push("4. **Arkivskabet:** Lad eleverne spille. Hjælp med teknik, men forklar ikke kildekritik ud over spillet. Brug observationsskemaet (§7).");
  L.push("5. **Posttest og transfertest:** Straks efter. Samme vilkår som prætesten.");
  L.push("6. **Forsinket test:** Efter reel tid. Fortæl ikke eleverne på forhånd, hvad der kommer. Brug aldrig spillets »+20 timer«-knap som erstatning.");
  L.push("7. **Bedømmelse:** Ret valg med facit. Bedøm åbne svar med rubrikken (§6). Bland prætest- og posttestark, så du ikke ser, hvornår et svar er skrevet. Lad helst en kollega bedømme 10 ark igen (§9).", "");
  L.push("## 5. Facit", "", "Elevarkene (`elevark.md`) indeholder ikke facit.", "");
  L.push(keyForm(FORMS.A), keyForm(FORMS.B), keyForm(FORMS.C));
  L.push(`### T · transfertest · ${TRANSFER.title} (${TRANSFER.minutes} min)`, "");
  L.push(`**Materialestatus:** reklamen, firmaet Lyngvask og statistikken er *${TRANSFER.source.status}*.`, "", `**Historisk ramme, som du skal kontrollere:** ${TRANSFER.frameToCheck}`, "");
  L.push(`**Hvad er nyt:** ${TRANSFER.whatChanges}`, "", `**Hvad er det samme:** ${TRANSFER.whatStays}`, "");
  L.push("| Spørgsmål | Facit |", "|---|---|", `| 1. ${TRANSFER.open[0]} | **Nej.** En reklame viser, hvad firmaet ville sælge og til hvem, ikke hvor mange der havde en maskine (T1, T2) |`, `| 2. ${TRANSFER.open[1]} | Hvordan firmaet ville have kunderne til at se maskinen, og hvilket billede af »den moderne husmor« reklamen gav (T3) |`);
  for (const c of TRANSFER.choice.claims) L.push(`| 3${c.id}. ${c.text} | **${c.answer}**: ${c.why} |`);
  L.push("");
  L.push("## 6. Vurderingsrubrik (forslag, ikke valideret)", "");
  L.push("Rapportér **tre delscorer hver for sig**: identifikation (R1–R4, 0–6), valg (V, 0–6) og begrundelse (B1+B2, 0–4). Læg dem ikke sammen til én score, og brug ingen grænse for »mestret«. Der findes ikke et godkendt og valideret grundlag for en sådan grænse (LP-13).", "");
  L.push(rubricTable(CRITERIA), "", "**Transfertest:**", "", rubricTable(TRANSFER_CRITERIA), "");
  L.push("**Markeringer, du skal se nærmere på** (ikke domme):", "");
  L.push("- mange rigtige valg uden begrundelse → gæt eller tavs viden? Spørg eleven.");
  L.push("- relevant begrundelse, forkerte valg (begrundelse 2 eller mere, valg 0–3) → er opgaveteksten forstået?");
  L.push("- kun én af del 3's påstande rigtig → fast vane (»vælg altid den personlige kilde«)?");
  L.push("- ingen modtager og intet formål trods rigtige valg → byttede felter (S7) eller en læsebarriere?", "- følgefejl eller mundtlig opfølgning brugt → står i markeringen, så en anden lærer kan se det.", "");
  L.push("Markeringerne bruger Valg på 0–6: »mange rigtige valg« betyder 5–6, »forkerte valg« 0–3.", "");
  L.push(`### Bedømmelsesregler (besluttet 05-11-2026, rubrik ${RUBRIC_VERSION})`, "");
  L.push("Reglerne er skrevet, så en anden lærer kan bruge dem på samme måde. Oprindelsen står ved hver regel: S6, S7 og T1 er fra lærerens fil; S2, S3 og S4 er besluttet skriftligt bagefter og registreret som et særskilt supplement; P1–P5 (v1.4) er fælles principper på tværs af kriterierne.", "");
  for (const r of SCORING_RULES) {
    L.push(`**${r.id} (${r.criterion}; ${r.origin}).** ${r.rule}`, "");
    for (const [k, v] of Object.entries(r.examples)) L.push(`- ${k}: ${v}`);
    L.push("");
  }
  L.push(`### Bedømmelseseksempler (ankersvar, ${RUBRIC_VERSION})`, "", "Konstruerede svar, ikke elevsvar. Brug dem til at læse niveauerne ens. Point følger betydningen, ikke ordene (P4): et svar med andre ord, der rammer betydningen, får samme point.", "", "| Prøve | Kriterium | Svar | Point | Regel |", "|---|---|---|---|---|");
  for (const a of CALIBRATION) L.push(`| ${a.form} | ${a.criterion} | »${a.answer}« | ${a.level} | ${a.rule} |`);
  L.push("");
  const m = MUNDTLIG_OPFOELGNING;
  L.push("### S7: fast procedure for mundtlig opfølgning", "", `**Hvornår:** ${m.naar}`, "", `**Ordlyd:** ${m.ordlyd}`, "", "**Læreren må ikke:**", "", ...m.maaIkke.map((t) => `- ${t}`), "", `**Forsøg:** ${m.forsoeg}`, "", `**Registrering:** ${m.registrering}`, "", `**Fortolkning:** ${m.fortolkning}`, "");
  L.push("**T1 rapporteres særskilt:** Elevens svar på spørgsmål 1 (ja, nej eller intet) står i `T_T1_svar` og giver ingen point. T1 er point for begrundelsen. Et rigtigt »nej« alene må ikke rapporteres som kildekritisk forståelse.", "");
  L.push("## 7. Observationsskema (under Arkivskabet)", "", "| Elevkode | Tid | Hvad så du? | Tegn på (forståelse / gæt / sidder fast / teknik / spillet forstyrrer) |", "|---|---|---|---|", "| | | | |", "| | | | |", "");
  L.push("## 8. Elevfeedback (3 min, mundtligt eller på papir)", "");
  L.push("1. Hvad var det sværeste? 2. Var der noget, du ikke forstod i spillet? 3. Hvad gør du nu, når du møder en kilde? (Skriv eller sig det med dine egne ord.) 4. Fik du hjælp til at læse? Hjalp det?", "");
  L.push("## 9. Registrering og sammenligning", "");
  L.push("Brug `registreringsskema.csv` (én række pr. elev). Den indeholder kun elevkoder. Intet sendes til Lærlig.", "");
  L.push("**Sådan sammenligner du (fastlagt før du ser data):**", "");
  L.push("1. For hver delscore: posttest (B) minus prætest (A) pr. elev. Rapportér median og spredning. Med én klasse: ingen p-værdier, kun beskrivende tal.");
  L.push("2. Transfer: fordeling af T1–T3 og TV. `T_T1_svar` (ja/nej) rapporteres for sig og aldrig som forståelse.");
  L.push("3. Fastholdelse: forsinket test (C) minus posttest (B), kun for elever med begge. Rapportér frafald.");
  L.push("4. **Gentagelse vs. forbedring:** A, B og C er parallelle, ikke identiske. Brug design C (halvdelen tager B som prætest og A som posttest) for at se, om formerne er lige svære.");
  L.push("5. **Loftseffekt:** Elever med 6/5/4 i prætesten kan ikke vise fremgang. Rapportér dem for sig.");
  L.push("6. **Bedømmerenighed:** En kollega bedømmer 10 tilfældige ark igen uden at se din bedømmelse. Notér, hvor mange delscorer der er ens. Er enigheden lav, er rubrikken ikke klar nok til at tolke ændringer.");
  L.push("7. **Følgefejl og mundtlig opfølgning:** Rapportér, hvor mange elever der fik følgefejl eller S7-opfølgning i A, B og C. Får en elev det i den ene prøve og ikke den anden, så vis det ved B − A.", "");
  L.push("## 10. Målingernes begrænsninger", "");
  L.push("- Formerne er **ikke målt lige svære**. En forskel mellem A og B kan skyldes formen, ikke læring.");
  L.push("- Del 2 har ja/nej: 50 % ved gæt pr. påstand. Del 3 har 25 % pr. påstand. Derfor vægter begrundelsen tungt, og delscorerne rapporteres hver for sig.");
  L.push("- Svargenveje er kontrolleret med simple regler (fx »ja, når afsenderen er nævnt«, »vælg kilden med de samme ord«). Ingen af dem klarer sig bedre end gæt i v1.4 (heller ikke »vælg altid række N« i kildetabellen), men en elev kan finde andre (`tools/laerligverse/shortcut-audit.mjs`).");
  L.push("- Skriftlige svar blander kildekritik og skrivefærdighed. Oplæsning og korte svar mindsker det, men fjerner det ikke.");
  L.push("- Rubrikken er afprøvet på **syntetiske** svar, ikke på elever. Bedømmerenighed er ikke målt.");
  L.push("- Én klasse uden sammenligningsgruppe kan ikke vise, at Arkivskabet er årsagen til en ændring.");
  L.push("- Transfertesten er *nær* transfer (samme fag, samme metode, nyt stof). Den viser ikke, at eleven bruger metoden i andre fag.");
  L.push("- Fastholdelse kan kun måles efter reel tid. Spillets simulerede tid tæller aldrig.", "");
  return L.join("\n");
}

export const SHEET_COLUMNS = Object.freeze([
  "elev_kode", "gruppe", "klassetrin",
  "pre_form", "pre_R1", "pre_R2", "pre_R3", "pre_R4", "pre_V", "pre_B1", "pre_B2", "pre_del3_begge", "pre_foelgefejl", "pre_mundtlig_opfoelgning", "pre_stoette", "pre_fravaer",
  "post_form", "post_R1", "post_R2", "post_R3", "post_R4", "post_V", "post_B1", "post_B2", "post_del3_begge", "post_foelgefejl", "post_mundtlig_opfoelgning", "post_stoette", "post_fravaer",
  "T_T1_svar", "T_T1", "T_T2", "T_T3", "T_TV", "T_stoette", "T_fravaer",
  "C_dage_efter_post", "C_R1", "C_R2", "C_R3", "C_R4", "C_V", "C_B1", "C_B2", "C_del3_begge", "C_foelgefejl", "C_mundtlig_opfoelgning", "C_stoette", "C_fravaer",
  "bedoemt_af", "genbedoemt", "noter",
]);

export function sheet() {
  return SHEET_COLUMNS.join(";") + "\n";
}

export function check() {
  const problems = [];
  for (const [p, f] of [[STUDENT, studentSheets], [TEACHER, teacherGuide], [SHEET, sheet]]) {
    if (!existsSync(p) || readFileSync(p, "utf8") !== f()) problems.push(`${p} is stale: run node tools/laerligverse/assessment-pack.mjs`);
  }
  return problems;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes("--check")) {
    const problems = check();
    for (const p of problems) console.error(p);
    process.exit(problems.length === 0 ? 0 : 1);
  }
  mkdirSync(DIR, { recursive: true });
  writeFileSync(STUDENT, studentSheets());
  writeFileSync(TEACHER, teacherGuide());
  writeFileSync(SHEET, sheet());
  console.log("wrote elevark.md, laerervejledning.md, registreringsskema.csv");
}
