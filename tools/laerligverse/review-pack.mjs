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
    out.push({ id: item.id, title: items.ITEM_REVIEW[item.id].step, kind: "opgave", item, review: items.ITEM_REVIEW[item.id] });
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

export async function fixture() {
  const { items } = await load();
  return items.ARCHIVE_ITEMS.map((i) => ({
    tag: i.id,
    step: i.contextKey,
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

export async function check() {
  const els = await elements();
  const problems = [];
  if (!existsSync(PACK) || readFileSync(PACK, "utf8") !== md(els)) problems.push("the review pack is stale: run node tools/laerligverse/review-pack.mjs");
  if (!existsSync(FIXTURE) || readFileSync(FIXTURE, "utf8") !== JSON.stringify(await fixture(), null, 2) + "\n") problems.push("the isolated fixture is stale: run node tools/laerligverse/review-pack.mjs");
  if (!existsSync(DECISIONS)) problems.push("the decision file is missing");
  else {
    const d = JSON.parse(readFileSync(DECISIONS, "utf8"));
    const ids = els.list.map((e) => e.id).sort();
    const have = Object.keys(d.elementer ?? {}).sort();
    if (JSON.stringify(ids) !== JSON.stringify(have)) problems.push(`the decision file covers ${have.join(",")}, the pack has ${ids.join(",")}`);
    for (const [id, v] of Object.entries(d.elementer ?? {})) if (!STATUSES.includes(v?.status)) problems.push(`${id}: invalid status ${v?.status}`);
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
  writeFileSync(FIXTURE, JSON.stringify(await fixture(), null, 2) + "\n");
  if (!existsSync(DECISIONS)) writeFileSync(DECISIONS, JSON.stringify(emptyDecisions(els.list), null, 2) + "\n");
  console.log(`wrote ${els.list.length} elements; decisions ${existsSync(DECISIONS) ? "kept" : "created"}`);
}
