// D-344 (F8): pretest, posttest, transfer test and delayed test for `kildekritik.ophav`, with the scoring rubric.
//
// STATUS: FORSLAG. NOT approved by a teacher. The teacher's approval of the 12 Arkivskab elements (D-344,
// kildekritik-godkendelse-register.json) does NOT cover this material; it needs its own review (APPROVAL below).
//
// ONE SOURCE OF TRUTH. The student sheets and the teacher's key are both generated from this file
// (tools/laerligverse/assessment-pack.mjs), so they cannot drift apart, and the student sheet is checked to
// contain no answer key. Nothing here is published: docs/ and tools/ are never in the Cloudflare bundle.
//
// THE FORMS. A (pretest), B (posttest) and C (delayed) are PARALLEL: the same three parts, the same task types,
// the same kind of source (an official or expert text that asks for something), the same three claim types in
// part 2 (the author's own view → ja; a TRUE claim the source cannot support → nej; an outcome → nej), and in part 3 two claims about the same
// four sources, one answered by the personal source and one by the official one, so "always choose the diary"
// scores only half (the F5 drafts were all answered by the personal source). T (transfer) changes period,
// domain and source types (advertisement, statistics) and drops the step-by-step questions.
//
// MATERIAL STATUS (every source): "didaktisk konstrueret" — an invented text of a real source TYPE, set against
// a real historical frame that the teacher must check (`frameToCheck`). None of them is a historical original,
// an abridgement or a paraphrase of one.

export const VERSION = "kildekritik-maaling-v1";
export const APPROVAL = Object.freeze({
  status: "afventer_laerergodkendelse",
  text: "Forslag. Ikke godkendt af en lærer. Godkendelsen af Arkivskabets 12 elementer (4. november 2026) omfatter IKKE dette materiale.",
});

/** The competence model's criteria. Subscores are reported SEPARATELY; there is no total and no mastery cut-off. */
export const CRITERIA = Object.freeze({
  R1: { name: "Afsender", max: 1, part: "identifikation", levels: ["ikke angivet eller forkert", "rigtig afsender"] },
  R2: { name: "Tidspunkt", max: 1, part: "identifikation", levels: ["ikke angivet eller forkert", "rigtigt tidspunkt (år eller dato)"] },
  R3: { name: "Modtager", max: 2, part: "identifikation", levels: ["ikke angivet, forkert, eller formålet skrevet i stedet", "vag modtager (»nogen«, »folk«) eller rigtig uden at kunne ses i teksten", "rigtig modtager, som kan udledes af teksten"] },
  R4: { name: "Formål", max: 2, part: "identifikation", levels: ["ikke angivet, forkert, eller modtageren skrevet i stedet", "kildens EMNE i stedet for formålet (»den handler om kolera«)", "afsenderens hensigt (»at få penge til …«, »at få folk til at …«)"] },
  V: { name: "Valg", max: 5, part: "valg", levels: ["0–5 rigtige af tre ja/nej-vurderinger og to kildevalg (rettes med facit)"] },
  B1: { name: "Begrundelse, del 2", max: 2, part: "begrundelse", levels: ["ingen eller uden sammenhæng med kilden", "henviser til kilden generelt (»det står der«)", "bruger afsender, modtager, formål eller tid til at forklare, hvad kilden kan og ikke kan vise"] },
  B2: { name: "Begrundelse, del 3", max: 2, part: "begrundelse", levels: ["ingen eller uden sammenhæng med kilden", "henviser til kilden generelt", "forklarer valget med en konkret oplysning om den valgte kilde (afsender, tid, modtager eller formål)"] },
});

/** Transfer criteria: the same competence, without the step-by-step questions. */
export const TRANSFER_CRITERIA = Object.freeze({
  T1: { name: "Vurdering", max: 2, levels: ["svarer ja eller intet svar", "svarer nej uden at sige hvorfor", "svarer nej: en reklame viser, hvad firmaet ville sælge, ikke hvor mange der havde en maskine"] },
  T2: { name: "Begrundelse med afsender og formål", max: 2, levels: ["ingen", "nævner afsender ELLER formål", "forbinder afsender og formål (et firma, der vil sælge)"] },
  T3: { name: "Hvad kilden KAN bruges til", max: 2, levels: ["intet eller forkert", "vagt (»om vaskemaskiner«)", "konkret: hvordan firmaet ville have kunderne til at se maskinen, eller hvilket billede af husmoren reklamen gav"] },
  TV: { name: "Valg", max: 2, levels: ["0–2 rigtige kildevalg (rettes med facit)"] },
});

export const PART2_INSTRUCTION = "Kan kilden bruges som belæg for påstanden? Sæt kryds ved ja eller nej.";
export const PART2_REASON = "Vælg én af påstandene ovenfor. Forklar dit svar ud fra, hvem der har lavet kilden, til hvem og hvorfor (1–3 sætninger).";
export const PART3_INSTRUCTION = "Her er fire kilder. Vælg den kilde, der er bedst til at undersøge hver påstand.";
export const PART3_REASON = "Forklar dit valg ved påstand a med en oplysning om kilden (1–2 sætninger).";

const form = (f) => Object.freeze(f);

export const FORMS = Object.freeze({
  A: form({
    id: "A", role: "prætest", minutes: 12,
    title: "Kolera i København 1853",
    frameToCheck: "Koleraepidemien i København sommeren 1853 med mange dødsfald, især i de tætte, fattige kvarterer. Lægerne forklarede den dengang ofte med dårlig luft og snavs; brevet må ikke tillægge lægen viden om bakterier. Del 2, påstand 2 forudsætter, at tusindvis døde (kontrollér tallet).",
    source: {
      kind: "Brev", status: "didaktisk konstrueret",
      header: "Brev skrevet i København, juli 1853. Underskrevet: J. Holm, læge.",
      text: "Til Magistraten. I de sidste tre uger har jeg besøgt over hundrede syge i gaderne ved havnen. De fleste bor i trange, fugtige kældre med åbne rendestene. Jeg beder derfor Magistraten om penge til at rydde gårdene og til et lazaret, hvor de syge kan ligge. Sker der intet, frygter jeg, at sygdommen spreder sig til hele byen.",
      glossary: { Magistraten: "byens styre", lazaret: "et midlertidigt sygehus" },
    },
    part1: {
      questions: ["Hvem har lavet kilden?", "Hvornår er kilden lavet?", "Hvem er kilden skrevet til?", "Hvorfor tror du, kilden er skrevet? Skriv, hvad afsenderen ville opnå."],
      key: { R1: ["lægen J. Holm", "en læge"], R2: ["juli 1853", "1853"], R3: ["Magistraten", "byens styre"], R4: ["at få penge til at rydde gårdene og til et lazaret", "at få byens styre til at gøre noget mod sygdommen"] },
    },
    part2: {
      claims: [
        { text: "Lægen mente, at de dårlige boliger var med til at gøre folk syge.", answer: "ja", why: "Afsenderens egen opfattelse: lægen skriver det selv." },
        { text: "Koleraen kostede tusindvis af københavnere livet i 1853.", answer: "nej", why: "Påstanden er sand, men brevet kan ikke belægge den: det nævner hundrede syge, lægen har besøgt, ikke dødstallet for byen." },
        { text: "Magistraten gav lægen de penge, han bad om.", answer: "nej", why: "Brevet er en anmodning. Det viser ikke, hvad der skete bagefter." },
      ],
    },
    part3: {
      sources: [
        { label: "Dagbog", meta: "en elev · 1955 · hende selv · at skrive sine oplevelser ned" },
        { label: "Skolereglement", meta: "skolekommissionen · 1955 · lærere og forældre · at fastsætte skolens regler" },
        { label: "Årsberetning", meta: "skolens lærer · 1955 · kommunen · at gøre rede for skolens arbejde" },
        { label: "Erindringsbog", meta: "en tidligere elev · 2005 · bogens læsere · at fortælle om sin barndom" },
      ],
      claims: [
        { id: "a", text: "Eleverne på en landsbyskole syntes i 1955, at skolen var streng.", answer: "Dagbog", why: "Skrevet af en elev samme år, til hende selv: tæt på oplevelsen." },
        { id: "b", text: "Skolen havde i 1955 en regel om, at eleverne skulle rejse sig, når læreren kom ind.", answer: "Skolereglement", why: "Skrevet af dem, der fastsatte reglerne, samme år, for at fastsætte dem." },
      ],
    },
  }),
  B: form({
    id: "B", role: "posttest", minutes: 12,
    title: "Den spanske syge 1918",
    frameToCheck: "Influenzaepidemien (»den spanske syge«) ramte Danmark i efteråret 1918. Flere byer lukkede skoler og frarådede forsamlinger. Kontrollér, at et opslag fra en sundhedskommission i Aarhus er en rimelig konstrueret kildetype, og at tusindvis af danskere døde af epidemien (del 2, påstand 2).",
    source: {
      kind: "Opslag", status: "didaktisk konstrueret",
      header: "Opslag hængt op i Aarhus, oktober 1918. Underskrevet: Sundhedskommissionen.",
      text: "Influenzaen breder sig hurtigt i byen. Undgå forsamlinger, besøg ikke syge, og hold børn hjemme, hvis de har feber. Byens skoler holdes lukket i otte dage. Følg disse råd for jeres egen og naboernes skyld.",
      glossary: { Sundhedskommissionen: "byens udvalg for sundhed" },
    },
    part1: {
      questions: ["Hvem har lavet kilden?", "Hvornår er kilden lavet?", "Hvem er kilden skrevet til?", "Hvorfor tror du, kilden er skrevet? Skriv, hvad afsenderen ville opnå."],
      key: { R1: ["Sundhedskommissionen", "byens udvalg for sundhed"], R2: ["oktober 1918", "1918"], R3: ["byens borgere", "folk i Aarhus"], R4: ["at få folk til at følge rådene, så smitten blev mindre", "at begrænse smitten"] },
    },
    part2: {
      claims: [
        { text: "Sundhedskommissionen ønskede, at folk holdt sig fra forsamlinger.", answer: "ja", why: "Afsenderens egen hensigt: kommissionen skriver det selv." },
        { text: "Tusindvis af danskere døde af den spanske syge.", answer: "nej", why: "Påstanden er sand, men opslaget kan ikke belægge den: det nævner ingen syge eller døde." },
        { text: "Borgerne i Aarhus fulgte rådene.", answer: "nej", why: "Opslaget er en opfordring. Det viser ikke, hvad folk gjorde." },
      ],
    },
    part3: {
      sources: [
        { label: "Brev", meta: "en arbejder · 1910 · hans bror · at fortælle om sit liv" },
        { label: "Arbejdsreglement", meta: "fabriksejeren · 1910 · arbejderne · at fastsætte arbejdstiden" },
        { label: "Jubilæumstale", meta: "fabriksejeren · 1935 · gæster ved fabrikkens jubilæum · at fejre fabrikken" },
        { label: "Avisannonce", meta: "fabrikken · 1910 · avislæsere · at skaffe flere arbejdere" },
      ],
      claims: [
        { id: "a", text: "Arbejderne på en fabrik syntes i 1910, at arbejdsdagen var for lang.", answer: "Brev", why: "Skrevet af en arbejder samme år, til hans bror: tæt på oplevelsen." },
        { id: "b", text: "Fabrikken havde i 1910 en regel om, hvornår arbejdsdagen begyndte.", answer: "Arbejdsreglement", why: "Skrevet af fabriksejeren samme år for at fastsætte arbejdstiden." },
      ],
    },
  }),
  C: form({
    id: "C", role: "forsinket test", minutes: 12,
    title: "Stormfloden 1872",
    frameToCheck: "Stormfloden i Østersøen natten til den 13. november 1872, som især ramte Lolland og Falster. Kontrollér, at en indberetning fra amtmanden i Nykøbing Falster er en rimelig konstrueret kildetype, og at stormfloden kostede menneskeliv i Danmark (del 2, påstand 2).",
    source: {
      kind: "Indberetning", status: "didaktisk konstrueret",
      header: "Indberetning skrevet i Nykøbing Falster, 15. november 1872. Underskrevet: amtmanden.",
      text: "Stormfloden natten til den 13. november har sat store dele af kysten under vand. Mange familier har mistet deres huse og deres dyr. Jeg anmoder om, at staten hurtigst muligt sender penge og korn, så de ramte kan klare vinteren.",
      glossary: { amtmanden: "statens embedsmand i området", indberetning: "en rapport til en myndighed" },
    },
    part1: {
      questions: ["Hvem har lavet kilden?", "Hvornår er kilden lavet?", "Hvem er kilden skrevet til?", "Hvorfor tror du, kilden er skrevet? Skriv, hvad afsenderen ville opnå."],
      key: { R1: ["amtmanden"], R2: ["15. november 1872", "1872"], R3: ["regeringen", "staten", "ministeriet"], R4: ["at få staten til at sende hjælp til de ramte", "at få penge og korn"] },
    },
    part2: {
      claims: [
        { text: "Amtmanden mente, at de ramte familier havde brug for hjælp fra staten.", answer: "ja", why: "Afsenderens egen opfattelse: amtmanden skriver det selv." },
        { text: "Stormfloden kostede mennesker livet.", answer: "nej", why: "Påstanden er sand, men indberetningen kan ikke belægge den: den nævner huse og dyr, ikke døde." },
        { text: "Staten sendte hjælp til de ramte.", answer: "nej", why: "Indberetningen er en anmodning. Den viser ikke, hvad staten gjorde." },
      ],
    },
    part3: {
      sources: [
        { label: "Brev", meta: "en passager · 1847 · en ven · at fortælle om sin første togtur" },
        { label: "Annonce", meta: "jernbaneselskabet · 1847 · avislæsere · at sælge billetter" },
        { label: "Lærebog", meta: "en historiker · 2000 · skoleelever · at forklare industrialiseringen" },
        { label: "Maleri", meta: "en kunstner · 1900 · udstillingens publikum · at vise et tog i fart" },
      ],
      claims: [
        { id: "a", text: "Passagerer på den første jernbane mellem København og Roskilde syntes i 1847, at turen gik hurtigt.", answer: "Brev", why: "Skrevet af en passager samme år: tæt på oplevelsen." },
        { id: "b", text: "Jernbaneselskabet ville i 1847 have flere til at købe billetter.", answer: "Annonce", why: "Lavet af selskabet selv samme år for at sælge billetter." },
      ],
    },
  }),
});

export const TRANSFER = Object.freeze({
  id: "T", role: "transfertest", minutes: 10,
  title: "Vaskemaskinen 1962",
  frameToCheck: "Vaskemaskiner bredte sig i danske hjem i 1950'erne og 1960'erne, og reklamer henvendte sig ofte til »husmoren«. Firmaet Nordvask og statistikken er opfundne; kontrollér, at de ikke kan forveksles med rigtige firmaer eller tal.",
  whatChanges: "Ny periode (1960'erne), nyt emne (forbrug og reklame), nye kildetyper (reklame og statistik), og ingen trin-for-trin-spørgsmål: eleven skal selv tage afsender og formål i brug.",
  whatStays: "Kompetencen: at bruge afsender, tid, modtager og formål til at afgøre, hvad en kilde kan og ikke kan bruges som belæg for.",
  source: {
    kind: "Reklame", status: "didaktisk konstrueret",
    header: "Reklame i et dansk ugeblad, 1962. Fra firmaet Nordvask.",
    text: "Fri for vaskedagen! Med Nordvask 60 er tøjet rent på en time, mens De drikker kaffe. Enhver moderne husmor har fortjent en Nordvask.",
  },
  open: [
    "Kan reklamen bruges som belæg for, at de fleste danske familier havde en vaskemaskine i 1962? Forklar dit svar.",
    "Hvad kan reklamen bruges som belæg for?",
  ],
  choice: {
    sources: [
      { label: "Reklame", meta: "firmaet Nordvask · 1962 · ugebladets læsere · at sælge vaskemaskiner" },
      { label: "Erindring", meta: "en kvinde · 2010 · bogens læsere · at fortælle om sit liv" },
      { label: "Brev", meta: "en husmor · 1962 · hendes søster · at fortælle om sin nye vaskemaskine" },
      { label: "Statistik", meta: "et statistikkontor · 1965 · politikere og forskere · at opgøre, hvad husstandene ejede" },
    ],
    claims: [
      { id: "a", text: "Hvordan en husmor i 1962 oplevede at få sin første vaskemaskine.", answer: "Brev" },
      { id: "b", text: "Hvor mange husstande der havde en vaskemaskine i midten af 1960'erne.", answer: "Statistik" },
    ],
  },
});

/** Auto-scorable parts (choices) against the key. Open parts (R1–R4, B1, B2, T1–T3) are scored by the teacher. */
export function scoreChoices(formId, answers) {
  const f = FORMS[formId];
  if (!f) throw new Error(`unknown form ${formId}`);
  const p2 = Array.isArray(answers?.part2) ? answers.part2 : [];
  const p3 = answers?.part3 ?? {};
  let v = 0;
  f.part2.claims.forEach((c, i) => { if (p2[i] === c.answer) v++; });
  for (const c of f.part3.claims) if (p3[c.id] === c.answer) v++;
  const heuristicProof = f.part3.claims.every((c) => p3[c.id] === c.answer);
  return { V: v, part3BothRight: heuristicProof };
}

export function scoreTransferChoices(answers) {
  let tv = 0;
  for (const c of TRANSFER.choice.claims) if (answers?.[c.id] === c.answer) tv++;
  return { TV: tv };
}

/**
 * Subscores — never one total. `rated` holds the teacher's levels for the open criteria. Throws on a level out of
 * range, so a typo cannot quietly become a score.
 */
export function subscores(formId, answers, rated) {
  for (const k of ["R1", "R2", "R3", "R4", "B1", "B2"]) {
    const n = rated?.[k];
    if (!Number.isInteger(n) || n < 0 || n > CRITERIA[k].max) throw new Error(`${k}: level ${n} is not 0–${CRITERIA[k].max}`);
  }
  const { V, part3BothRight } = scoreChoices(formId, answers);
  return {
    identifikation: rated.R1 + rated.R2 + rated.R3 + rated.R4,
    valg: V,
    begrundelse: rated.B1 + rated.B2,
    part3BothRight,
  };
}

/** Patterns a teacher should look at — descriptive flags, not judgements and not a mastery decision. */
export function flags(s, rated) {
  const out = [];
  if (s.valg >= 4 && s.begrundelse <= 1) out.push("mange rigtige valg uden begrundelse: kan være gæt eller tavs viden — spørg eleven");
  // F8 rubric trial: ≤ 2 missed S4 (valg 3, begrundelse 4) — a pupil who reasons well but answers wrong.
  if (s.valg <= 3 && s.begrundelse >= 3) out.push("begrunder fagligt, men vælger forkert: se på, om opgaveteksten blev forstået");
  if (!s.part3BothRight && s.valg >= 3) out.push("kun én af del 3's påstande rigtig: kan være en fast vane (fx altid den personlige kilde)");
  if (rated.R3 === 0 && rated.R4 >= 1) out.push("modtager mangler eller er forvekslet med formålet");
  // F8 rubric trial: S7 (receiver and purpose swapped) scored 0 + 0 with no flag; the levels lose the swap.
  if (rated.R3 === 0 && rated.R4 === 0 && s.valg >= 4) out.push("ingen modtager og intet formål trods rigtige valg: er felterne byttet om, er afsender og modtager forvekslet, eller er der en læsebarriere? Se elevens svar");
  if (rated.R4 === 1) out.push("formål besvaret med kildens emne, ikke afsenderens hensigt");
  return out;
}

/** Paper-test time: the four tests, in minutes. */
export const MINUTES = Object.freeze({ A: FORMS.A.minutes, B: FORMS.B.minutes, T: TRANSFER.minutes, C: FORMS.C.minutes });
