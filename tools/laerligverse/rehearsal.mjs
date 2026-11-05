// D-344 (F8): the rubric trial with SYNTHETIC answers, and the technical rehearsal with three SYNTHETIC pupils.
//
// NOTHING HERE IS A PUPIL RESULT. Every record carries `syntetisk: true`. No network, no database, no account:
// the rehearsal runs the SAME pure sequence function the server runs (supabase/functions/_shared/learning-sequence.ts,
// the PROVISIONAL test policy v0 — LP-13 is undecided) over the SAME items the game uses, and records, for each
// fact, WHERE it would come from in a pilot today: the server (H5, isolated test stack only), the game client
// (never sent), the paper test, or nowhere.
//
//   node tools/laerligverse/rehearsal.mjs        print the rubric trial and the rehearsal as JSON
import { ARCHIVE_ITEMS, CONTEXT_OF_STEP } from "../../laerligverse/host/dev/archive-items.js";
import { POLICY_ID, REVISIT_AFTER_HOURS, nextStep } from "../../supabase/functions/_shared/learning-sequence.ts";
import { flags, scoreTransferChoices, subscores } from "./assessment-v1.mjs";
import { fileURLToPath } from "node:url";

// ── Phase 5: the rubric trial on form A ─────────────────────────────────────────────────────────────────────
// `levels` are the scores a rater gives by applying CRITERIA's descriptors to `text`; `note` records where the
// descriptor was ambiguous. The point is to see whether the rubric separates the seven kinds of answer.
// v1.2 (F9): part 2 has four claims; the synthetic answers keep the same errors on the same claims as in v1.1.
// v1.3 (F9, 05-11-2026): `levels` follow the teacher's decisions (assessment-v1.mjs SCORING_RULES): S2 R4 2 → 1,
// S4 B1 and B2 2 → 1, S6 scored as a følgefejl, S7 with the oral follow-up. v1.4 (D-346 §15): S3's topic answer in
// R4 (»den handler om kolera«) 1 → 0 (P1: a topic is not a purpose). `levelsV12` keeps the scores under the
// approved v1.2 rubric, so the change is visible and tested.
const RIGHT_P2 = ["ja", "nej", "nej", "ja"];
const RIGHT_P3 = { a: "Dagbog", b: "Skolereglement" };

export const SYNTHETIC_RESPONSES = Object.freeze([
  {
    id: "S1", kind: "korrekt og velbegrundet", syntetisk: true,
    text: { R3: "Magistraten, altså byens styre. Han skriver »Til Magistraten«.", R4: "Han vil have penge til at rydde gårdene og til et lazaret.", B1: "Påstand 3: nej. Det er lægen, der beder om penge. Brevet er skrevet, før de har svaret, så det kan ikke vise, om han fik dem.", B2: "Dagbogen er skrevet af en elev i 1955 til sig selv, så den kan vise, hvad eleven syntes." },
    answers: { part2: RIGHT_P2, part3: RIGHT_P3 },
    levels: { R1: 1, R2: 1, R3: 2, R4: 2, B1: 2, B2: 2 },
  },
  {
    id: "S2", kind: "korrekt uden begrundelse", syntetisk: true,
    text: { R3: "Magistraten", R4: "penge", B1: "", B2: "den er bedst" },
    answers: { part2: RIGHT_P2, part3: RIGHT_P3 },
    levels: { R1: 1, R2: 1, R3: 2, R4: 1, B1: 0, B2: 0 },
    levelsV12: { R1: 1, R2: 1, R3: 2, R4: 2, B1: 0, B2: 0 },
    decidedBy: "S2",
    note: "R4 »penge« er kort, men er afsenderens hensigt; giver 2. Kræver rubrikken en hel sætning? Uafklaret — ordblinde elever skriver ofte kort.",
  },
  {
    id: "S3", kind: "delvist korrekt", syntetisk: true,
    text: { R3: "folk i byen", R4: "den handler om kolera", B1: "Påstand 2: nej, fordi det står der ikke.", B2: "Skolereglementet, for det handler om skolen." },
    answers: { part2: ["ja", "nej", "ja", "ja"], part3: { a: "Skolereglement", b: "Skolereglement" } },
    levels: { R1: 1, R2: 1, R3: 1, R4: 0, B1: 1, B2: 1 },
    levelsV12: { R1: 1, R2: 1, R3: 1, R4: 1, B1: 1, B2: 1 },
    decidedBy: "P1",
    note: "B2 »det handler om skolen« henviser til kildens emne, ikke en oplysning om kilden; 1 eller 0? Givet 1 efter ordlyden »henviser til kilden generelt«.",
  },
  {
    id: "S4", kind: "forkert, men med relevant ræsonnement", syntetisk: true,
    text: { R3: "Magistraten", R4: "at få hjælp til de syge", B1: "Påstand 1: nej. Lægen vil have penge, så han gør det måske værre, end det er. Man kan ikke stole på det.", B2: "Årsberetningen, fordi læreren skrev den samme år og kendte eleverne." },
    answers: { part2: ["nej", "nej", "nej", "nej"], part3: { a: "Årsberetning", b: "Skolereglement" } },
    levels: { R1: 1, R2: 1, R3: 2, R4: 2, B1: 1, B2: 1 },
    levelsV12: { R1: 1, R2: 1, R3: 2, R4: 2, B1: 2, B2: 2 },
    decidedBy: "S4",
    note: "Ræsonnementet bruger formålet (en mulig overdrivelse) — fagligt relevant. Men påstand 1 handler om, hvad LÆGEN MENTE, og det viser brevet uanset overdrivelse. Rubrikken giver 2 for begrundelse og trækker kun i Valg. Er det rigtigt? Uafklaret: læreren skal beslutte, om en begrundelse, der fører til et forkert svar, kan få 2.",
  },
  {
    id: "S5", kind: "korrekt ved sandsynligt gæt", syntetisk: true,
    text: { R3: "?", R4: "ved ikke", B1: "", B2: "" },
    answers: { part2: RIGHT_P2, part3: RIGHT_P3 },
    levels: { R1: 1, R2: 1, R3: 0, R4: 0, B1: 0, B2: 0 },
    note: "Kan ikke skelnes fra S2 i Valg. Kun begrundelsen og identifikationen viser forskellen.",
  },
  {
    id: "S6", kind: "misforstået afsender", syntetisk: true,
    text: { R1: "Magistraten", R3: "lægen", R4: "at svare lægen", B1: "Påstand 3: ja, for de skriver jo til ham.", B2: "Dagbogen, for hun var der." },
    answers: { part2: ["ja", "nej", "ja", "ja"], part3: RIGHT_P3 },
    levels: { R1: 0, R2: 1, R3: 2, R4: 1, B1: 1, B2: 2, foelgefejl: true },
    levelsV12: { R1: 0, R2: 1, R3: 0, R4: 0, B1: 0, B2: 2 },
    decidedBy: "S6",
    note: "Én misforståelse (afsender/modtager byttet om) giver følgefejl i R3, R4 og B1. Rubrikken straffer samme fejl tre gange. Overvej at bedømme R3/R4 i forhold til elevens egen afsender (»følgefejl«).",
  },
  {
    id: "S7", kind: "forveksling af modtager og formål", syntetisk: true,
    text: { R3: "at få penge", R4: "Magistraten", B1: "Påstand 2: nej, der står ingen tal for hele byen.", B2: "Skolereglementet er lavet af skolekommissionen, som bestemte reglerne." },
    answers: { part2: RIGHT_P2, part3: { a: "Dagbog", b: "Skolereglement" } },
    levels: { R1: 1, R2: 1, R3: 0, R4: 0, B1: 1, B2: 2, mundtligOpfoelgning: "ikke placeret rigtigt (0/0)" },
    levelsV12: { R1: 1, R2: 1, R3: 0, R4: 0, B1: 1, B2: 2 },
    // S7: the two possible outcomes of the standard oral follow-up. The synthetic record cannot answer, so both are kept.
    followUp: { placed: { R3: 2, R4: 1, mundtligOpfoelgning: "placeret rigtigt (0/0 → 2/1)" }, notPlaced: { R3: 0, R4: 0 } },
    decidedBy: "S7",
    note: "Eleven har begge oplysninger, men i de forkerte felter. Er det et læse-/layoutproblem eller manglende begreb? Rubrikken kan ikke skelne. B2 begrunder påstand b, ikke a som bedt om: givet 2 for indholdet, men opgaveteksten skal tydeliggøres.",
  },
]);

/** Score every synthetic answer; returns the rows a teacher would see. */
export function rubricTrial() {
  return SYNTHETIC_RESPONSES.map((r) => {
    const s = subscores("A", r.answers, r.levels);
    return { id: r.id, kind: r.kind, syntetisk: true, ...s, flags: flags(s, r.levels), note: r.note ?? null };
  });
}

// ── Phase 7: three synthetic pupils through the whole process ──────────────────────────────────────────────
const itemOf = (step) => {
  const ctx = CONTEXT_OF_STEP[step];
  const it = ARCHIVE_ITEMS.find((i) => i.contextKey === ctx);
  if (!it) throw new Error(`no item for step ${step}`);
  return it;
};
const wrongOption = (item) => {
  const o = item.options.find((x) => x.id !== item.answer);
  if (!o) throw new Error(`${item.id}: no wrong option`);
  return o.id;
};

/** Per step: right or wrong, and how many hints the pupil OPENED (the client knows; the server does not). */
export const PROFILES = Object.freeze({
  A: {
    name: "Elev A — har svært ved stoffet", syntetisk: true,
    pre: { levels: { R1: 1, R2: 1, R3: 0, R4: 1, B1: 0, B2: 0 }, answers: { part2: ["ja", "ja", "ja", "ja"], part3: { a: "Dagbog", b: "Dagbog" } } },
    game: { guided_practice: { right: false, hints: 2 }, revision: { right: true, hints: 2 }, independent_application: { right: false, hints: 0 }, transfer: { right: true, hints: 0 }, revisit: { right: true, hints: 0 } },
    post: { levels: { R1: 1, R2: 1, R3: 1, R4: 1, B1: 1, B2: 1 }, answers: { part2: ["nej", "ja", "ja", "ja"], part3: { a: "Brev", b: "Brev" } } },
    transfer: { levels: { T1: 1, T2: 0, T3: 1 }, choices: { a: "Brev", b: "Reklame" } },
  },
  B: {
    name: "Elev B — gennemsnitlig progression", syntetisk: true,
    pre: { levels: { R1: 1, R2: 1, R3: 1, R4: 1, B1: 1, B2: 1 }, answers: { part2: ["ja", "nej", "ja", "ja"], part3: { a: "Dagbog", b: "Årsberetning" } } },
    game: { guided_practice: { right: true, hints: 1 }, independent_application: { right: true, hints: 0 }, transfer: { right: false, hints: 0 }, revisit: { right: true, hints: 0 } },
    post: { levels: { R1: 1, R2: 1, R3: 2, R4: 2, B1: 1, B2: 2 }, answers: { part2: ["nej", "ja", "nej", "nej"], part3: { a: "Arbejdsreglement", b: "Brev" } } },
    transfer: { levels: { T1: 2, T2: 1, T3: 1 }, choices: { a: "Brev", b: "Statistik" } },
  },
  C: {
    name: "Elev C — allerede fagligt stærk", syntetisk: true,
    pre: { levels: { R1: 1, R2: 1, R3: 2, R4: 2, B1: 2, B2: 2 }, answers: { part2: ["ja", "nej", "nej", "ja"], part3: { a: "Dagbog", b: "Skolereglement" } } },
    game: { guided_practice: { right: true, hints: 0 }, independent_application: { right: true, hints: 0 }, transfer: { right: true, hints: 0 }, revisit: { right: true, hints: 0 } },
    post: { levels: { R1: 1, R2: 1, R3: 2, R4: 2, B1: 2, B2: 2 }, answers: { part2: ["nej", "ja", "nej", "ja"], part3: { a: "Arbejdsreglement", b: "Brev" } } },
    transfer: { levels: { T1: 2, T2: 2, T3: 2 }, choices: { a: "Brev", b: "Statistik" } },
  },
});

/** Where each fact would come from in a pilot TODAY. */
export const SOURCE = Object.freeze({
  server: "server (H5) — kun i den isolerede teststak; produktionen modtager intet",
  client: "spillets klient — sendes ikke og gemmes ikke",
  paper: "papirprøve hos læreren",
  none: "registreres ikke nogen steder",
});

const T0 = Date.parse("2026-01-12T09:00:00Z"); // synthetic Monday; the rehearsal's clock is SIMULATED

/** Run one synthetic pupil through the real sequence function. Deterministic. */
export function rehearse(profileId) {
  const p = PROFILES[profileId];
  if (!p) throw new Error(`unknown profile ${profileId}`);
  const history = [];
  const log = [];
  let now = T0;
  for (let guard = 0; guard < 10; guard++) {
    const d = nextStep(history, now);
    if (d.state === "complete") { log.push({ event: "forløbet gennemført", policy: d.policy }); break; }
    if (d.state === "waiting") {
      // SIMULATED: jump the clock to the due time. A real pilot must wait in real time.
      log.push({ event: "venter på genbesøg", dueAt: d.dueAt, tid: "SIMULERET" });
      now = Date.parse(d.dueAt);
      continue;
    }
    const plan = p.game[d.step];
    if (!plan) throw new Error(`${profileId}: the policy served ${d.step}, which the profile did not expect`);
    const item = itemOf(d.step);
    const choice = plan.right ? item.answer : wrongOption(item);
    const answeredAt = new Date(now + 60_000).toISOString();
    history.push({ step: d.step, answered: true, wasCorrect: choice === item.answer, answeredAt });
    log.push({
      event: "svar", step: d.step, mode: d.mode, item: item.id, choice, right: choice === item.answer,
      hintsOpened: plan.hints, hintsAvailable: item.hints.length,
      recorded: { step: SOURCE.server, choice: SOURCE.server, right: SOURCE.server, time: SOURCE.server, hints: SOURCE.client, reason: SOURCE.none },
      tid: d.step === "revisit" ? "SIMULERET" : "simuleret testur",
    });
    now += 5 * 60_000;
  }
  const pre = subscores("A", p.pre.answers, p.pre.levels);
  const post = subscores("B", p.post.answers, p.post.levels);
  const tr = { T1: p.transfer.levels.T1, T2: p.transfer.levels.T2, T3: p.transfer.levels.T3, ...scoreTransferChoices(p.transfer.choices) };
  return {
    profile: profileId, name: p.name, syntetisk: true, policy: POLICY_ID, revisitAfterHours: REVISIT_AFTER_HOURS,
    stepsServed: log.filter((l) => l.event === "svar").map((l) => l.step),
    log,
    paper: {
      pre: { form: "A", ...pre, source: SOURCE.paper },
      post: { form: "B", ...post, source: SOURCE.paper },
      transfer: { form: "T", ...tr, source: SOURCE.paper },
      delayed: { form: "C", status: "BLOKERET i generalprøven: kræver reel tid (forslag 7 dage, LP13-6). Simuleret tid tæller aldrig." },
      change: { identifikation: post.identifikation - pre.identifikation, valg: post.valg - pre.valg, begrundelse: post.begrundelse - pre.begrundelse, note: "Forskel mellem to parallelle former, som ikke er målt lige svære. Ikke en læringseffekt." },
    },
  };
}

/** Phase 7.3: can the questions be answered from the data a pilot would have today? */
export function dataFlow() {
  return [
    { q: "Hvilke opgaver fik eleven?", answer: "ja", source: SOURCE.server, note: "instans pr. trin (question_instances); kun i testmiljøet" },
    { q: "Hvilken hjælp blev vist?", answer: "nej", source: SOURCE.client, note: "hints åbnes i spillet; serveren kender dem ikke (L1 K1 ikke anvendt)" },
    { q: "Hvilke besvarelser blev registreret?", answer: "delvist", source: SOURCE.server, note: "valgt kilde og rigtigt/forkert; H5-svar fejler i dag i testmiljøet (K1/H5-hullet, D-341)" },
    { q: "Hvilke forsøg var selvstændige?", answer: "nej", source: SOURCE.none, note: "trin har en mode (check/application), men uden hints på serveren kan »uden hjælp« ikke vises" },
    { q: "Hvilke trin blev gennemført?", answer: "ja", source: SOURCE.server, note: "afledt af historikken (nextStep)" },
    { q: "Kan vi se progression over tid?", answer: "kun på papir", source: SOURCE.paper, note: "prætest → posttest → forsinket test; spillet har ét svar pr. trin og to forskellige opgaver" },
    { q: "Kan vi skelne forbedring fra gentagelse?", answer: "delvist", source: SOURCE.paper, note: "parallelle former, ikke identiske; testeffekt kræver design C" },
    { q: "Kan vi dokumentere transfer?", answer: "nær transfer", source: SOURCE.paper, note: "transfertest T på nyt materiale; spillets trin 7 er samme opgaveform" },
    { q: "Elevens begrundelse?", answer: "nej", source: SOURCE.paper, note: "kun på papir; refleksionen i spillet sendes ikke" },
    { q: "Fastholdelse?", answer: "nej i generalprøven", source: SOURCE.paper, note: "kun form C efter reel tid" },
  ];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(JSON.stringify({ rubricTrial: rubricTrial(), rehearsal: ["A", "B", "C"].map(rehearse), dataFlow: dataFlow() }, null, 2));
}
