import type { FakeItem } from "@adventure-engine/learning-bridge/test-service";

/**
 * HOST SIDE ONLY — the test adapter's items, with their answer keys (D-307, D-310, D-322).
 * The game bundle must never import this file; e2e/archive.spec.ts scans the built game bundle for it.
 *
 * Objective H4 of the occupation pilot (F0 12: "kan bruge en kilde til at begrunde en påstand"). The
 * objective ids are the prototype's (D-322 sequence.ts); the real ones await LP-2/LP-13 and H4.
 *
 * KONSTRUERET UNDERVISNINGSMATERIALE. The source descriptions (`detail`, format "Felt: værdi|…") DESCRIBE
 * kinds of sources and are not quotations. Only the proclamation of 9 April 1940 is a real document; it is
 * paraphrased, never quoted. Every other source is an invented example of a source TYPE. A history teacher
 * must check every factual statement before any pupil sees it (D-322 §Lærergennemgang).
 */
const d = (afsender: string, tid: string, modtager: string, formaal: string, kontekst: string): string =>
  `Afsender: ${afsender}|Tid: ${tid}|Modtager: ${modtager}|Formål: ${formaal}|Kontekst: ${kontekst}`;

const PROKLAMATION = d("kongen og regeringen", "9. april 1940", "hele befolkningen", "at fortælle befolkningen, hvordan den skulle forholde sig", "skrevet samme dag, som Danmark blev besat");
const ERINDRING = d("en kvinde, der var 12 år i 1940", "skrevet i 1985", "et lokalhistorisk arkiv", "at bevare hendes minder", "skrevet 45 år efter, fra hukommelsen (konstrueret eksempel)");
const SOLDAT = d("en menig tysk soldat", "april 1940", "ham selv", "at huske, hvad han oplevede", "skrevet af en soldat i den besættende hær (konstrueret eksempel)");
const BLAD = d("en modstandsgruppe", "1944", "danske læsere", "at få flere til at gøre modstand", "udgivet ulovligt fire år inde i besættelsen (konstrueret eksempel)");

const KILDE_FEEDBACK = {
  correct: "Ja. Se på afsenderen og tiden: proklamationen er lavet af regeringen selv, på selve dagen, til hele befolkningen. Derfor viser den direkte, hvad regeringen ønskede: at befolkningen skulle bevare ro og orden.",
  incorrect: "Spørg kilden: Hvem har lavet den? Hvornår? Til hvem? Og hvorfor?",
  memoir: "Se på tiden og afsenderen: erindringen er skrevet 45 år senere af en, der var barn i 1940. Den kan fortælle om hendes oplevelser, men ikke direkte om regeringens ønsker.",
  soldier: "Se på afsenderen: en tysk soldat kan fortælle, hvad han selv oplevede, men han kendte ikke den danske regerings ønsker.",
  paper: "Se på tiden og formålet: bladet er lavet fire år senere af modstandsfolk, der ville få flere til at gøre modstand. Det viser, hvad de mente i 1944, ikke hvad regeringen ønskede i 1940.",
};

export const ARCHIVE_ITEMS: readonly FakeItem[] = [
  {
    // Step 3 (hypothesis): guided practice, hints allowed, never evidence.
    id: "h4-kilde",
    objectiveId: "hist.besaettelsen.h4.kilde",
    kind: "choice",
    prompt: "Påstand: »Regeringen ønskede, at befolkningen skulle holde sig i ro den 9. april 1940.« Hvilken kilde er bedst til at undersøge påstanden?",
    options: [
      { id: "kilde_a", label: "Proklamation, 9. april 1940", detail: PROKLAMATION },
      { id: "kilde_b", label: "Erindring om besættelsen", detail: ERINDRING },
      { id: "kilde_c", label: "Dagbog fra en soldat", detail: SOLDAT },
      { id: "kilde_d", label: "Illegalt blad", detail: BLAD },
    ],
    answer: "kilde_a",
    correctLabel: "Proklamation, 9. april 1940",
    feedbackCorrect: KILDE_FEEDBACK.correct,
    feedbackIncorrect: KILDE_FEEDBACK.incorrect,
    optionFeedback: { kilde_b: KILDE_FEEDBACK.memoir, kilde_c: KILDE_FEEDBACK.soldier, kilde_d: KILDE_FEEDBACK.paper },
    hints: [
      "Læs påstanden igen: hvis ønske handler den om?",
      "Se på afsenderen på hvert dokument. Hvilke kilder er ikke lavet af regeringen?",
      "Kun én kilde er lavet af regeringen selv, på selve dagen.",
    ],
  },
  {
    // Step 5 (revision): a NEW instance of the same objective after feedback — same claim, the sources in a
    // different order and under new ids, so the pupil re-reads rather than re-clicks a position.
    id: "h4-kilde-revision",
    objectiveId: "hist.besaettelsen.h4.kilde",
    kind: "choice",
    prompt: "Revidér din vurdering. Påstand: »Regeringen ønskede, at befolkningen skulle holde sig i ro den 9. april 1940.« Hvilken kilde er bedst til at undersøge påstanden?",
    options: [
      { id: "rev_blad", label: "Illegalt blad", detail: BLAD },
      { id: "rev_prokl", label: "Proklamation, 9. april 1940", detail: PROKLAMATION },
      { id: "rev_soldat", label: "Dagbog fra en soldat", detail: SOLDAT },
      { id: "rev_erindr", label: "Erindring om besættelsen", detail: ERINDRING },
    ],
    answer: "rev_prokl",
    correctLabel: "Proklamation, 9. april 1940",
    feedbackCorrect: KILDE_FEEDBACK.correct,
    feedbackIncorrect: KILDE_FEEDBACK.incorrect,
    optionFeedback: { rev_erindr: KILDE_FEEDBACK.memoir, rev_soldat: KILDE_FEEDBACK.soldier, rev_blad: KILDE_FEEDBACK.paper },
    hints: ["Hvem bestemte, hvad befolkningen skulle gøre?", "Hvilken kilde er lavet på selve dagen af dem, påstanden handler om?"],
  },
  {
    // Step 6 (new application): the SAME proclamation is now the wrong answer, because the claim is different.
    id: "h4-overfoersel",
    objectiveId: "hist.besaettelsen.h4.overfoersel",
    kind: "choice",
    prompt: "Påstand: »Mange almindelige danskere blev overraskede og bange om morgenen den 9. april 1940.« Hvilken kilde er bedst til at undersøge påstanden?",
    options: [
      { id: "kilde_e", label: "Proklamation, 9. april 1940", detail: PROKLAMATION },
      { id: "kilde_f", label: "Dagbog fra København", detail: d("en dansk kvinde", "aftenen den 9. april 1940", "hende selv", "at skrive ned, hvad hun oplevede og følte", "skrevet samme dag, privat (konstrueret eksempel)") },
      { id: "kilde_g", label: "Lærebog om besættelsen", detail: d("en historiker", "2010", "skoleelever", "at forklare besættelsen", "en fremstilling bygget på andre kilder, ikke et spor fra 1940 (konstrueret eksempel)") },
      { id: "kilde_h", label: "Tysk ordre", detail: d("den tyske hærledelse", "april 1940", "tyske officerer", "at styre besættelsen", "en militær ordre (konstrueret eksempel)") },
    ],
    answer: "kilde_f",
    correctLabel: "Dagbog fra København",
    feedbackCorrect: "Ja. Se på afsenderen, tiden og modtageren: dagbogen er skrevet af en almindelig dansker samme dag, kun til hende selv. Den kan vise, hvordan dagen føltes for hende. Én dagbog viser ikke, hvad »mange« følte, men den er det bedste sted at begynde.",
    feedbackIncorrect: "Påstanden handler om almindelige danskeres følelser. Spørg igen: Hvem har lavet kilden, og vidste de, hvordan almindelige danskere havde det?",
    optionFeedback: {
      kilde_e: "Se på formålet: proklamationen fortæller befolkningen, hvad regeringen ønskede. Den fortæller ikke, hvordan almindelige danskere havde det. Den var det rigtige svar før, men påstanden er en anden nu.",
      kilde_g: "Se på tiden: lærebogen er skrevet 70 år senere. Den er en fremstilling, der bygger på andre kilder, ikke et spor fra selve morgenen.",
      kilde_h: "Se på afsenderen og modtageren: den tyske ordre viser, hvad de tyske ledere planlagde, ikke hvad danskerne følte.",
    },
    hints: [],
  },
  {
    // Step 8 (revisit, LOCAL PROTOTYPE): the method in yet another situation, without help.
    id: "h4-genbesoeg",
    objectiveId: "hist.besaettelsen.h4.genbesoeg",
    kind: "choice",
    prompt: "Påstand: »Der blev kæmpet nogle steder i Danmark om morgenen den 9. april 1940.« Hvilken kilde er bedst til at undersøge påstanden?",
    options: [
      { id: "gb_rapport", label: "Rapport fra en dansk officer", detail: d("en dansk officer", "10. april 1940", "hærens ledelse", "at gøre rede for kampene ved hans enhed", "skrevet dagen efter af en, der var med (konstrueret eksempel)") },
      { id: "gb_prokl", label: "Proklamation, 9. april 1940", detail: PROKLAMATION },
      { id: "gb_avis", label: "Tysk avisartikel", detail: d("en tysk avis under nazistisk kontrol", "april 1940", "tyske læsere", "at fremstille besættelsen som fredelig", "propaganda (konstrueret eksempel)") },
      { id: "gb_film", label: "Spillefilm om besættelsen", detail: d("et filmselskab", "2015", "biografpublikum", "at underholde og fortælle en historie", "en fortolkning lavet 75 år senere (konstrueret eksempel)") },
    ],
    answer: "gb_rapport",
    correctLabel: "Rapport fra en dansk officer",
    feedbackCorrect: "Ja. Rapporten er skrevet dagen efter af en, der selv var med, til hærens ledelse, for at gøre rede for kampene. Den er tæt på begivenheden — men husk, at også en officer kan have grunde til at fremstille noget på en bestemt måde.",
    feedbackIncorrect: "Spørg kilden igen: hvem var med, hvornår blev den skrevet, og hvorfor?",
    optionFeedback: {
      gb_prokl: "Se på formålet: proklamationen fortæller, hvad befolkningen skulle gøre — ikke om der blev kæmpet.",
      gb_avis: "Se på afsenderen og formålet: avisen var under nazistisk kontrol og ville fremstille besættelsen som fredelig.",
      gb_film: "Se på tiden og formålet: filmen er lavet 75 år senere for at underholde. Den er en fortolkning, ikke et spor fra 1940.",
    },
    hints: [],
  },
];
