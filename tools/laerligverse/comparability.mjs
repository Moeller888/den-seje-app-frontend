// D-346 (F9): how comparable are the pretest A, the posttest B and the delayed test C — WITHOUT pupil data?
//
//   node tools/laerligverse/comparability.mjs     print the measures as JSON
//
// MEASURED here (from the text the pupil reads): words, sentences, LIX (a Danish readability index: words per
// sentence + percentage of words longer than six letters), long words, explained words, claim lengths, the reading
// load of part 3, and the task structure. JUDGED (written down by hand in JUDGED, not measured): how directly the
// receiver and the purpose can be read in the source, and how familiar the part 3 topic is. NOT KNOWN until pupils
// have answered: whether the forms are equally difficult, how long they take, and whether raters agree.
import { fileURLToPath } from "node:url";
import { FORMS, PART2_INSTRUCTION, PART2_REASON, PART3_INSTRUCTION, PART3_REASON } from "./assessment-v1.mjs";

const wordsOf = (t) => String(t ?? "").split(/[^0-9A-Za-zÆØÅæøåÉé]+/).filter(Boolean);
const sentencesOf = (t) => String(t ?? "").split(/[.!?]+/).map((s) => s.trim()).filter((s) => wordsOf(s).length > 0);

/** LIX: words per sentence + 100 × (words of more than six letters) / words. Under 25: very easy; 25–34: easy;
 *  35–44: medium; 45–54: hard. Computed on short texts it is only a rough guide. */
export function lix(text) {
  const w = wordsOf(text), s = sentencesOf(text);
  if (w.length === 0 || s.length === 0) return null;
  const long = w.filter((x) => x.length > 6).length;
  return Math.round(w.length / s.length + (100 * long) / w.length);
}

const round1 = (n) => Math.round(n * 10) / 10;

/** Everything the pupil reads in one form (page 1 and page 2), in reading order. */
export function studentText(f) {
  return [
    f.source.header, f.source.text, ...Object.entries(f.source.glossary ?? {}).map(([k, v]) => `${k} = ${v}.`),
    ...f.part1.questions, PART2_INSTRUCTION, ...f.part2.claims.map((c) => c.text), PART2_REASON, PART3_INSTRUCTION,
    ...f.part3.sources.map((s) => `${s.label}: ${s.meta}.`), ...f.part3.claims.map((c) => c.text), PART3_REASON.replace("{id}", f.part3.reasonFor),
  ].join(" ");
}

export function measure(f) {
  const src = f.source.text;
  const claims = f.part2.claims.map((c) => wordsOf(c.text).length);
  return {
    id: f.id,
    minutes: f.minutes,
    sourceWords: wordsOf(src).length,
    sourceSentences: sentencesOf(src).length,
    sourceLix: lix(src),
    sourceLongWords: wordsOf(src).filter((x) => x.length > 6).length,
    glossary: Object.keys(f.source.glossary ?? {}).length,
    part2ClaimWords: claims.reduce((a, b) => a + b, 0),
    part2ClaimLix: lix(f.part2.claims.map((c) => c.text).join(" ")),
    part2Types: f.part2.claims.map((c) => c.type).join(" "),
    part2Key: f.part2.claims.map((c) => c.answer).join("–"),
    part3Words: wordsOf([...f.part3.sources.map((s) => `${s.label} ${s.meta}`), ...f.part3.claims.map((c) => c.text)].join(" ")).length,
    totalWords: wordsOf(studentText(f)).length,
    totalLix: lix(studentText(f)),
  };
}

/** Judged by hand (not measured): what makes a form easier or harder that the numbers do not show. */
export const JUDGED = Object.freeze({
  A: {
    receiver: "Står i teksten (»Til Magistraten«), men ordet skal forklares (ordliste).",
    purpose: "Står direkte (»Jeg beder derfor Magistraten om penge …«).",
    part2: "J2 kræver, at eleven ser lægen som øjenvidne, selv om han vil have penge. N2 kræver, at eleven skelner mellem et sandt dødstal og det, lægen skrev.",
    part3Topic: "Landsbyskole 1955: et kendt emne for elever.",
    expected: "Længste kilde, flest lange ord og tre forklarede ord. Forventet: en anelse sværere end B og C i del 1.",
  },
  B: {
    receiver: "Står ikke direkte; kan udledes af »jeres egen og naboernes skyld« og opslaget i byen (borgerne).",
    purpose: "Står direkte som opfordringer (»Undgå …«, »Følg disse råd …«).",
    part2: "N2 (»vidste, at lukkede skoler ville stoppe smitten«) kræver, at eleven skelner mellem et råd og viden om virkningen.",
    part3Topic: "Fabrik 1910: mindre kendt end skole, kendt fra historieundervisningen.",
    expected: "Korteste kilde og letteste modtager i del 1, sværeste N2 i del 2. Forventet: samlet tæt på A; del 1 måske lettere.",
  },
  C: {
    receiver: "Står ikke som modtager, men »staten« nævnes i anmodningen. Skal udledes (statens embedsmand → staten).",
    purpose: "Står direkte (»Jeg anmoder om, at staten … sender penge og korn«).",
    part2: "N2 (»hele Danmark lige hårdt«) kræver, at eleven ser, at amtmanden kun skriver om sit område.",
    part3Topic: "Jernbane 1847: længst tilbage i tid; to kilder fra jernbaneselskabet skal skelnes på formål.",
    expected: "Mellemlang kilde. Modtageren er sværere end i B. Forventet: tæt på A.",
  },
});

/** What can only be answered with pupil answers — never claimed from the measures above. */
export const NEEDS_PUPIL_DATA = Object.freeze([
  "Om A, B og C er lige svære: kræver svar fra de samme elever på flere former (design C: halvdelen tager B som prætest og A som posttest).",
  "Hvor lang tid prøverne tager: 13 minutter er et skøn, ikke målt.",
  "Om påstandene forstås, som de er ment (fx J2 i A og N2 i B): kræver elevsvar og gerne korte elevinterview.",
  "Om bedømmere er enige: kræver, at en kollega bedømmer de samme ark blindt.",
  "Om der er gulv- eller loftseffekt: kræver fordelingen af elevernes delscorer.",
  "Om oplæsning ændrer sværheden ens i de tre former: kræver svar med og uden oplæsning.",
]);

export function comparability() {
  return { forms: ["A", "B", "C"].map((id) => measure(FORMS[id])), judged: JUDGED, needsPupilData: NEEDS_PUPIL_DATA };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(JSON.stringify(comparability(), null, 1));
}
