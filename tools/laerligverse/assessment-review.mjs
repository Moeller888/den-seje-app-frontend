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
import { CRITERIA, FORMS, HANDOVER, MUNDTLIG_OPFOELGNING, PART2_INSTRUCTION, PART2_REASON, PART3_INSTRUCTION, PART3_REASON, RUBRIC_VERSION, SCORING_RULES, TRANSFER, TRANSFER_CRITERIA, VERSION } from "./assessment-v1.mjs";
import { CHOICE_STRATEGIES, PART2_STRATEGIES, audit, loadBefore } from "./shortcut-audit.mjs";
import { comparability } from "./comparability.mjs";
import { SYNTHETIC_RESPONSES } from "./rehearsal.mjs";
import { stableJson } from "./review-pack.mjs";
import { duplicateKeys } from "./approval-register.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PAGE = join(ROOT, "docs", "laerligverse", "proeve-godkendelse.html");
export const REGISTER_FILE = join(ROOT, "docs", "laerligverse", "proeve-godkendelse-register.json");
export const APPROVED_FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "assessment-v1.2-godkendt.json");
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

/** What the developer checked (NOT an approval), what is invented, the didactic reason, known weaknesses, and why
 *  the test changed in v1.2 (F9). The exact before/after text is generated from fixtures/assessment-v1.1.json. */
export const FORM_REVIEW = Object.freeze({
  A: {
    verified: "Faktatjek 05-11-2026 (FC-1): første tilfælde 11. juni 1853 i Nyboder tæt på havnen, højdepunkt i begyndelsen af august, ca. 4.700–4.800 døde, over 2.000 syge flyttet til teltlejre (lex.dk »Koleraen i Danmark i 1800-tallet«, afsnittet om København 1853). Kælderlejligheder blev brugt som boliger og undersøgt af datidens læger (Ugeskrift for Læger, »Fra fugt og stank til lys og luft i Brumleby«). »De fleste« syge i kældre kan ikke belægges; rettet til »mange«/»flere«. »Magistraten« som modtager er plausibelt, men ikke kontrolleret.",
    rationale: "Prætest før introduktionen. Afsender og tid står i overskriften (let), modtager og formål skal udledes af teksten (sværere). Del 2 og 3 måler, om eleven kan afgøre, hvad kilden kan bruges til.",
    weaknesses: [
      "Kilden er den længste (58 ord) og har tre svære ord (Magistraten, lazaret, rendestene, med ordforklaring). A kan derfor være en anelse sværere end B og C.",
      "Påstand 4 (ja) kræver, at eleven ser, at lægen selv har set de syge. En elev, der tænker »han vil have penge, så han overdriver«, svarer nej (som det syntetiske svar S4). Det er tilsigtet.",
    ],
    afterApproval: "Efter godkendelsen 05-11-2026 (FC-1): brevet siger nu »Mange af dem bor i trange, fugtige kældre« (før »De fleste bor …«), og påstand 4 lyder »I 1853 boede flere af de syge ved havnen i fugtige kældre.« (før »de fleste syge«). Facit (ja), type og rækkefølge er uændrede. Kontrollen af svargenveje giver stadig 2 af 4 for alle regler i A.",
    changes: "Del 2 havde én ja-påstand, og den var den eneste, der begyndte med afsenderen og havde et holdningsord. Nu har del 2 fire påstande: afsenderen nævnes i én ja- og én nej-påstand, og ja-påstandene er ikke længere de længste. I anden runde (G10) er påstand 2, 3 og 4 omskrevet, så A er bygget som B og C: holdningsordet står også i en nej-påstand, og mængdeord står i både en ja- og en nej-påstand. Del 3's påstande deler ikke længere ord med det rigtige svars beskrivelse. Del 1 afleveres, før eleven får del 2 og 3.",
  },
  B: {
    verified: "Faktatjek 05-11-2026 (FC-2): Aarhus lukkede IKKE skolerne i efteråret 1918; kun syge børn eller børn med syge i hjemmet skulle blive hjemme, og i slutningen af oktober rykkede Sundhedskommissionen advarsler mod større møder og sammenkomster ind i avisen (AarhusWiki, »Da Den Spanske Syge ramte Aarhus«, afsnittene »'Den spanske' melder sin ankomst« og »Byrådsdebatten«). Skolelukninger andre steder blev besluttet af de lokale embedslæger og skolemyndigheder (lex.dk »Den spanske syge 1918-1920«).",
    rationale: "Posttest straks efter forløbet. Samme opbygning og samme fire påstandstyper som A, men et andet emne og en anden rækkefølge, så eleven ikke kan genbruge prætestens facit.",
    weaknesses: [
      "Modtageren er lettere at se (»jeres egen og naboernes skyld«) end i A. B kan derfor være en anelse lettere.",
      "Påstand 3 (»vidste, at influenzaen snart ville stoppe«) kræver, at eleven skelner mellem et råd og viden om, hvordan det vil gå. Det er sværere end A's påstand om, hvad der skete bagefter.",
    ],
    afterApproval: "Efter godkendelsen 05-11-2026 (FC-2): kilden er nu en meddelelse i avisen (før et opslag), og linjen om skolelukning er fjernet. Påstand 3 lyder »Sundhedskommissionen vidste, at influenzaen snart ville stoppe.« (før »… at lukkede skoler ville stoppe smitten«), og påstand 4 lyder »I oktober 1918 bredte influenzaen sig i Aarhus.« (før »… blev det bestemt at lukke skolerne i Aarhus«). Typer, facit og rækkefølge er uændrede. Del 1 accepterer også »avisens læsere i Aarhus« som modtager.",
    changes: "Som i A: fire påstande, afsenderen i én ja- og én nej-påstand. Påstanden om dødstallet er erstattet af en påstand om, hvad kommissionen vidste. Jubilæumstalen (1935) er erstattet af en erindring fra en tidligere arbejder (1965), så der er to personlige kilder fra forskellige tider. Påstand a deler ikke længere ordet »regel« med svaret.",
  },
  T: {
    verified: "Faktatjek 05-11-2026 (FC-4): fra ca. 1950 anskaffede flere og flere danske husholdninger en vaskemaskine (lex.dk »vaskemaskine«). Et tal for 1960'erne er ikke fundet og bruges ikke. Firmaet og statistikken er opfundne. »Nordvask« er erstattet af »Lyngvask«, fordi NORDVASK ApS (CVR 43222570) er et registreret dansk vaskeri.",
    rationale: "Transfer: ny periode, nyt emne, nye kildetyper (reklame og statistik) og ingen trin-for-trin-spørgsmål. Eleven skal selv tage afsender og formål i brug.",
    weaknesses: [
      "Nær transfer: samme fag og samme metode. Den viser ikke, at eleven bruger metoden i andre fag.",
      "Spørgsmål 1 har altid svaret »nej«. Rettet i rubrikken 1.3 efter din beslutning (T1 særskilt): et bart »nej« giver 0 i T1, og svaret noteres for sig i T_T1_svar.",
    ],
    afterApproval: "Efter godkendelsen 05-11-2026 (FC-4): firmanavnet »Nordvask« er ændret til »Lyngvask« i reklamen og i kildetabellen. Intet andet er ændret i T. Bedømmelsen af spørgsmål 1 er ændret i rubrikken (T1 særskilt), ikke i prøven.",
    changes: "Spørgsmål 1–2 er uændrede. Valgdelen: påstandene delte ord med det rigtige svars beskrivelse (»husmor … vaskemaskine«, »husstande«). Nu deler reklamen flest ord med begge påstande, og kildernes rækkefølge er ny. Spørgsmål 1–2 afleveres, før eleven får kildetabellen, som nævner reklamens formål.",
  },
  C: {
    verified: "Faktatjek 05-11-2026 (FC-3): stormfloden natten til 13. november 1872 ramte især Lolland-Falster; 80–92 omkom (tallet varierer mellem kilderne, og prøven nævner intet tal). »Tusinder var blevet hjemløse eller havde mistet alle deres ejendele«, og regeringen bad amtmændene opgøre skaderne (Marinemuseet/marmus.dk, »Da vandene steg – Stormfloden 1872«, kap. 3 og 8). Maribo var administrativt centrum for Maribo Amt (lex.dk »Maribo«, afsnittet Historie), så stedet »Nykøbing Falster« er fjernet.",
    rationale: "Forsinket test efter reel tid. Samme opbygning og samme fire påstandstyper som A og B, ny rækkefølge.",
    weaknesses: ["Indberetningen nævner ikke modtageren direkte (»staten«); accepterede svar: regeringen, staten, ministeriet."],
    afterApproval: "Efter godkendelsen 05-11-2026 (FC-3): overskriften lyder nu »Indberetning skrevet 15. november 1872. Underskrevet: amtmanden over Maribo Amt (Lolland-Falster).« (før »skrevet i Nykøbing Falster … amtmanden«). Kildeteksten, påstandene og facit er uændrede.",
    changes: "Som i A: fire påstande, afsenderen i én ja- og én nej-påstand. Del 3: lærebogen (2000) og maleriet (1900) var for lette at fravælge. De er erstattet af en køreplan fra jernbaneselskabet (1847) og en erindring fra en tidligere passager (1897), så valget kræver både tid og formål.",
  },
});

/** F9 adversarial review: the answer shortcuts found in v1.1, what was done, and the rule-based strategies that test it. */
export const SHORTCUT_FINDINGS = Object.freeze([
  { id: "G1", pattern: "Afsenderen i ja-påstanden. I del 2 var ja-påstanden den eneste, der begyndte med afsenderen (»Lægen mente …«, »Sundhedskommissionen ønskede …«, »Amtmanden mente …«).", fix: "Afsenderen nævnes i én ja- og én nej-påstand pr. prøve. Nej-påstanden siger noget sandt om afsenderen, men påstår mere, end kilden viser: lægen bad om penge, men fik han dem? Kommissionen skrev om influenzaen, men vidste den, hvornår den ville stoppe? Amtmanden skrev om stormfloden, men om hele Danmark?", strategies: ["afsender-naevnt", "afsender-foerst"] },
  { id: "G2", pattern: "Holdningsord. »mente« og »ønskede« stod kun i ja-påstande.", fix: "Holdningsord står nu også i nej-påstande (»vidste«, »mente«).", strategies: ["holdningsord"] },
  { id: "G3", pattern: "Svarlængde. Ja-påstanden var den længste i B og C.", fix: "Længderne er afbalanceret, så de længste påstande ikke er ja-påstandene.", strategies: ["laengst-ja"] },
  { id: "G4", pattern: "Fast antal. Altid én ja og to nej: »svar altid nej« gav 2 af 3.", fix: "To ja og to nej pr. prøve: »altid nej« giver det samme som gæt.", strategies: ["altid-nej", "altid-ja", "maengdeord-nej", "ordoverlap"] },
  { id: "G5", pattern: "Ord kun i én slags svar. På tværs af prøverne stod »mente« og »folk« kun i ja-påstande, og »kostede«, »tusindvis« og »livet« kun i nej-påstande.", fix: "Intet ord står nu kun i ja- eller kun i nej-påstande i mere end én prøve (testet).", strategies: [] },
  { id: "G6", pattern: "Nøgleord i del 3. Påstanden delte ord med det rigtige svars beskrivelse (»regel« og »fastsætte skolens regler«, »købe billetter« og »sælge billetter«, »husstande« og »husstandene«).", fix: "Påstandene er omskrevet, og en anden kilde deler nu emneordene med påstanden. Hverken »vælg kilden med de samme ord« eller det modsatte virker.", strategies: ["noegleord", "faerrest-noegleord"] },
  { id: "G7", pattern: "For lette distraktorer. C havde en lærebog fra 2000 og et maleri fra 1900, B en jubilæumstale fra 1935: lette at fravælge uden at tænke på formål.", fix: "Hver prøve har nu to personlige kilder (en fra tiden og en skrevet årtier senere) og to officielle kilder fra tiden med forskellige formål.", strategies: ["samme-aar", "altid-personlig", "samtidig-personlig", "laengste-beskrivelse"] },
  { id: "G8", pattern: "Spørgsmålene giver svarene. Del 2 nævnte modtageren og formålet (»Magistraten gav lægen de penge, han bad om«, »hjælp fra staten«), som eleven skal finde i del 1. I T stod reklamens formål i kildetabellen ved siden af spørgsmål 1–2.", fix: "Side 1 (del 1, i T spørgsmål 1–2) afleveres, før eleven får side 2. Kilden står igen øverst på side 2.", strategies: [] },
  { id: "G9", pattern: "Prætestens facit. Den, der huskede prætestens rækkefølge, kunne bruge det omvendte (2 af 3), og i C stod del 3's svar på de samme pladser i tabellen som i A.", fix: "To prøver har samme facit på præcis 2 af 4 pladser i del 2, og del 3's svar står på andre pladser end i A.", strategies: ["praetest-raekkefoelge", "praetest-omvendt", "praetest-position", "praetest-undgaa", "foerste-kilde"] },
  { id: "G10", pattern: "Testvane i prætesten (fundet i e64942b2). I A stod holdningsordet »mente« kun i ja-påstanden, og det store tal »tusindvis« kun i en nej-påstand. To almindelige tommelfingerregler hos testvante elever (»det, afsenderen mener, kan kilden vise« og »store tal og absolutte ord er forkerte«) gav derfor 3 af 4 i A, men ikke i B og C. Det kan løfte prætesten og skjule fremgang.", fix: "A's nej-påstand 2 er nu en holdningspåstand, som brevet ikke kan belægge (»Lægen mente, at koleraen havde kostet tusindvis …«), som N2 i B og C. Påstand 4 bruger et mængdeord, som brevet kan belægge (»flere«; i v1.2 »de fleste«, rettet efter faktatjekket FC-1). Påstand 3 nævner ikke længere afsenderen. Alle regler giver nu 2 af 4 i A (testet).", strategies: ["holdningsord", "maengdeord-nej", "laengst-ja"] },
]);

/** What is NOT fixed: for the teacher to know or decide. */
export const SHORTCUT_RESIDUALS = Object.freeze([
  "T, spørgsmål 1: svaret er altid »nej«, og rubrikken giver 1 point for et »nej« uden begrundelse (se T, kendte svagheder). Det kræver en rubrikændring og er dit valg.",
  "Der er stadig to ja og to nej i hver prøve. En elev, der ved det, vinder kun lidt, fordi det kun hjælper sammen med rigtige svar. Det er beholdt, så prøverne er lige svære.",
  "»Vælg den personlige kilde fra påstandens år« giver halvdelen i del 3. Det er forventet, fordi tiden er en del af kompetencen, men den slags valg kan ikke besvare den officielle påstand.",
  "Reglerne er dem, vi kunne formulere. En elev kan finde andre genveje, og kontrollen er ikke afprøvet på elever.",
]);

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

/** Rubric questions that are NOT among F8's five ambiguities, but need the teacher's decision before scoring (F9). */
export const RUBRIC_DECISIONS = Object.freeze([
  {
    id: "T1", criterion: "T1 Vurdering (transfertest)",
    task: "Transfertest T, spørgsmål 1: »Kan reklamen bruges som belæg for, at de fleste danske familier havde en vaskemaskine i 1962? Forklar dit svar.«",
    current: "Rubrikken i dag: 0 = svarer ja eller intet svar · 1 = svarer nej uden at sige hvorfor · 2 = svarer nej: en reklame viser, hvad firmaet ville sælge, ikke hvor mange der havde en maskine.",
    why: "Spørgsmålet har altid svaret »nej«, og et »nej« kan gættes (50 %) eller komme af en generel mistro til reklamer, som ikke bruger kildens ophav. Et bart »nej« giver i dag 1 af 2 point. I A, B og C tæller et rigtigt ja/nej i Valg, og begrundelsen bedømmes for sig (B1). T1 blander de to.",
    options: [
      { id: "behold", label: "Behold: et »nej« uden begrundelse giver T1 = 1", effect: "Uændret. En elev, der gætter, får i snit 0,5 point på T1 uden kildekritik." },
      { id: "nul", label: "Ret: T1 = 1 kræver en begrundelse, også en svag (»det står der ikke«); et bart »nej« giver 0", effect: "Gæt giver 0. Selve vurderingen kan ikke ses i data." },
      { id: "saerskilt", label: "Ret og rapportér særskilt: et bart »nej« giver T1 = 0, men svaret (ja/nej) noteres for sig i en ny kolonne", effect: "Gæt giver 0 i T1. Vurderingen alene kan stadig ses, som Valg i A, B og C, men tæller ikke som forståelse. Kræver en ny kolonne i registreringsskemaet." },
    ],
    recommendation: "saerskilt",
    recommendationWhy: "Det følger A, B og C, hvor valget og begrundelsen tælles hver for sig. Et kort, mundtligt »nej, de vil jo sælge« tæller som begrundelse (mundtlige svar er tilladt for alle), så pointet kræver kildekritik, ikke skrivefærdighed. Rubrikken ændres først efter din beslutning.",
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

/**
 * Historical fact check 05-11-2026 (D-346 §11). Sources were read on the web on that date; quotes are short and
 * located. Every test source is DIDACTICALLY CONSTRUCTED: what is checked is the real historical frame it relies on.
 */
export const FACT_CHECK = Object.freeze([
  {
    id: "FC-1", test: "A", ours: "Brevet: »De fleste bor i trange, fugtige kældre«; påstand 4 (ja): »I 1853 boede de fleste syge ved havnen i fugtige kældre.«",
    sources: [
      "lex.dk (Danmarkshistorien, Aarhus Universitet), »Koleraen i Danmark i 1800-tallet«, afsnittet om København 1853: første tilfælde 11. juni, »en tømrersvend i kvarteret Nyboder, som lå tæt på havnen«; højdepunkt i begyndelsen af august; ca. 4.800 døde; »forpestende overfyldning« i fattigkvartererne; over 2.000 syge flyttet til teltlejre.",
      "Ugeskrift for Læger, »HISTORISK: Fra fugt og stank til lys og luft i Brumleby«, afsnittet »Fugt og stank«: kælderlejligheder i baggårdene blev brugt som boliger; afsnittet »Læger for bedre boliger«: lægerne undersøgte, hvor mange der boede i kælderlejligheder (en undersøgelse fra 1855).",
    ],
    verdict: "delvist bekræftet",
    detail: "Kælderboliger og fattigkvarterer nær havnen er belagt. Ingen kilde viser, at »de fleste« syge boede i kældre, og ingen giver en andel. »Magistraten« som modtager er plausibelt, men ikke belagt for netop 1853.",
    correction: "Brevet: »Mange af dem bor …«; påstand 4: »… flere af de syge …«. Facit uændret (ja).",
    changed: true,
  },
  {
    id: "FC-2", test: "B", ours: "Opslaget: »Byens skoler holdes lukket i otte dage«; påstand 4 (ja): »I oktober 1918 blev det bestemt at lukke skolerne i Aarhus.«",
    sources: [
      "AarhusWiki (Aarhus Stadsarkiv), »Da Den Spanske Syge ramte Aarhus«, afsnittet »'Den spanske' melder sin ankomst«: kommuneskolerne holdtes åbne, »bortset fra ugen op til efterårsferien«; kun syge børn eller børn med syge familiemedlemmer skulle blive hjemme; »i slutningen af oktober indrykkede Sundhedskommissionen advarsler mod deltagelse i større møder og sammenkomster«. Afsnittet »Byrådsdebatten«: »Skolerne forblev åbne.«",
      "lex.dk, »Den spanske syge 1918-1920«, afsnittet om myndighedernes tiltag: skoler blev lukket efter beslutning ved de lokale embedslæger og skolemyndigheder; anden bølge fra ca. 1. oktober 1918.",
    ],
    verdict: "afkræftet (skolelukningen) · bekræftet (Sundhedskommissionens advarsler i oktober)",
    detail: "Aarhus lukkede ikke skolerne. En sundhedskommission besluttede ikke selv skolelukninger. Advarslerne blev rykket ind i avisen, ikke slået op.",
    correction: "Kilden er nu en meddelelse i avisen uden skolelukning; påstand 3 og 4 er omskrevet med samme typer og facit.",
    changed: true,
  },
  {
    id: "FC-3", test: "C", ours: "Overskriften: »Indberetning skrevet i Nykøbing Falster, 15. november 1872. Underskrevet: amtmanden.«; påstand 2 (ja): »Mange familier ved kysten mistede deres huse …«",
    sources: [
      "Marinemuseet (marmus.dk), »Da vandene steg – Stormfloden 1872« (pdf), kap. 3, s. 10: »onsdag den 13. november 1872«, ca. 80 omkomne, »tusinder var blevet hjemløse eller havde mistet alle deres ejendele«; kap. 8, s. 33: regeringen bad amtmændene samle oplysninger om skadernes omfang; indsamlinger nationalt og lokalt.",
      "lex.dk, »Maribo«, afsnittet Historie: »Frem til 1970 var Maribo administrativt centrum for Maribo Amt«.",
    ],
    verdict: "bekræftet (mange mistede deres hjem; amtmanden indberettede) · ikke dokumenterbar (amtmandens sæde i Nykøbing Falster)",
    detail: "Dødstallet varierer (80–92) og bruges ikke i prøven. Et tal for ødelagte huse alene i Danmark er ikke fundet og bruges ikke.",
    correction: "Stedet er fjernet fra overskriften; afsenderen er »amtmanden over Maribo Amt (Lolland-Falster)«. Facit uændret.",
    changed: true,
  },
  {
    id: "FC-4", test: "A, B, C, T (del 3 og T's kildetabel)", ours: "De konstruerede kildebeskrivelser i del 3 og påstandene, der skal undersøges.",
    sources: [
      "A: lex.dk, »skolekommission (udvalg)«: kommunens udvalg for skolevæsenet 1814–1989, altså også i 1955.",
      "B: Arbejdermuseet, »The battle for the 8-hour workday«: en arbejdsdag på 10 timer før 1919; 8-timersdagen fra 1919 (lex.dk).",
      "C: Danmarks Jernbanemuseum, »13 glimt af dansk jernbanehistorie«: Det Sjællandske Jernbaneselskab stod for banen; dsb.dk, »Historien om DSB«: »indviet den 26. juni 1847«.",
      "T: lex.dk, »vaskemaskine«: fra ca. 1950 anskaffede flere og flere danske husholdninger en vaskemaskine. CVR: NORDVASK ApS (CVR 43222570) er et registreret vaskeri; »Lyngvask« gav intet firma ved søgning 05-11-2026.",
    ],
    verdict: "bekræftet (rammerne er ikke anakronistiske) · ikke dokumenterbar (at elever rejste sig for læreren i 1955, mødetid kl. 6 i 1910)",
    detail: "Del 3's påstande er påstande, eleven skal finde den bedste kilde til at UNDERSØGE. De fremstilles ikke som fakta, og facit afhænger ikke af, om de er sande. Derfor er de ikke ændret. »Nordvask« kunne forveksles med et rigtigt firma og er ændret.",
    correction: "T: »Nordvask« → »Lyngvask«. Del 3 i A, B og C: ingen ændring.",
    changed: true,
  },
]);

/** Decisions the teacher made AFTER saving the file (written to the developer). Never presented as file content. */
export const SUPPLEMENTS = Object.freeze([
  {
    id: "supplement-2026-11-05",
    kilde: "Christopher Møllers skriftlige besked til udvikleren (Claude) 05-11-2026, efter at filen var gemt. Ikke en del af proeve-godkendelse-2026-11-05.json, hvor S2, S3 og S4 står som »ikke_besluttet«.",
    beslutninger: {
      S2: { valg: "1", regel: "Et upræcist svar som »penge« giver ikke automatisk fuld score. 0 = intet relevant formål; 1 = hensigten (fx den økonomiske) uden tilstrækkelig præcision; 2 = konkret og korrekt, hvad afsenderen ville opnå." },
      S3: { valg: "1", regel: "Vælges en kilde, fordi den handler om samme emne, giver det højst 1 point. Fuld score kræver, at valget også er kildekritisk relevant for netop påstanden." },
      S4: { valg: "1", regel: "En fagligt relevant begrundelse, der fører til et forkert endeligt valg, kan give 1 point, ikke fuld score." },
    },
  },
]);

const sha = (s) => createHash("sha256").update(s).digest("hex");

/** The registered decisions (or null before any registration), read directly so this module has no import cycle. */
export function registered() {
  return existsSync(REGISTER_FILE) ? JSON.parse(readFileSync(REGISTER_FILE, "utf8")) : null;
}

/** id → SHA-256 of the content a decision is about: the test with its key and instructions, or the rubric. */
export function contentFingerprints({ forms = FORMS, transfer = TRANSFER } = {}) {
  const shared = { PART2_INSTRUCTION, PART2_REASON, PART3_INSTRUCTION, PART3_REASON, HANDOVER };
  return {
    A: sha(stableJson({ form: forms.A, shared, review: FORM_REVIEW.A })),
    B: sha(stableJson({ form: forms.B, shared, review: FORM_REVIEW.B })),
    T: sha(stableJson({ form: transfer, shared, review: FORM_REVIEW.T })),
    C: sha(stableJson({ form: forms.C, shared, review: FORM_REVIEW.C })),
    // v1.3: the decided scoring rules and the S7 procedure are part of the rubric the teacher approves.
    rubrik: sha(stableJson({ CRITERIA, TRANSFER_CRITERIA, AMBIGUITIES, RUBRIC_DECISIONS, SCORING_RULES, MUNDTLIG_OPFOELGNING })),
  };
}

const esc = (t) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const LABEL = { ikke_gennemgaaet: "Ikke gennemgået", godkendt: "Godkendt", skal_rettes: "Skal rettes", afvist: "Afvist" };
const titleOf = { A: `Prætest A: ${FORMS.A.title}`, B: `Posttest B: ${FORMS.B.title}`, T: `Transfertest T: ${TRANSFER.title}`, C: `Forsinket test C: ${FORMS.C.title}`, rubrik: "Bedømmelsesrubrikken" };

const pageBreak = () => `<p class="brk"><em>${esc(HANDOVER)}</em><br><span class="note">Ny side. Læreren samler side 1 ind, før eleven får side 2. Kilden står igen øverst på side 2.</span></p>`;

function studentView(f) {
  const P = [];
  P.push(`<div class="student" data-read="${f.id}"><p class="who">Det ser eleven:</p>`);
  P.push(`<p><strong>${esc(f.source.header)}</strong></p><blockquote>${esc(f.source.text)}</blockquote>`);
  if (f.source.glossary) P.push(`<p class="gl"><em>Ord:</em> ${Object.entries(f.source.glossary).map(([k, v]) => `${esc(k)} = ${esc(v)}`).join(" · ")}</p>`);
  if (f.part1) {
    P.push(`<h4>Del 1</h4><ol>${f.part1.questions.map((q) => `<li>${esc(q)}</li>`).join("")}</ol>`);
    P.push(pageBreak());
    P.push(`<h4>Del 2</h4><p>${esc(PART2_INSTRUCTION)}</p><ol>${f.part2.claims.map((c) => `<li>${esc(c.text)} &nbsp;☐ ja ☐ nej</li>`).join("")}</ol><p>${esc(PART2_REASON)}</p>`);
    P.push(`<h4>Del 3</h4><p>${esc(PART3_INSTRUCTION)}</p><table><thead><tr><th>Kilde</th><th>Hvem · hvornår · til hvem · hvorfor</th></tr></thead><tbody>${f.part3.sources.map((s) => `<tr><td>${esc(s.label)}</td><td>${esc(s.meta)}</td></tr>`).join("")}</tbody></table>`);
    P.push(`<ul>${f.part3.claims.map((c) => `<li><strong>Påstand ${esc(c.id)}:</strong> ${esc(c.text)}</li>`).join("")}</ul><p>${esc(PART3_REASON.replace("{id}", f.part3.reasonFor))}</p>`);
  } else {
    P.push(`<ol>${f.open.map((q) => `<li>${esc(q)}</li>`).join("")}</ol>`);
    P.push(pageBreak());
    P.push(`<ol start="${f.open.length + 1}"><li>${esc(PART3_INSTRUCTION)}</li></ol>`);
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
    P.push(`</tbody></table><h4>Bedømmelse</h4><p>Identifikation R1–R4 (0–6), Valg V (0–6), Begrundelse B1 + B2 (0–4). Se rubrikken nederst. Delscorerne lægges ikke sammen.</p>`);
  } else {
    P.push(`<h4>Facit</h4><table><tbody><tr><td>1</td><td><strong>Nej.</strong> En reklame viser, hvad firmaet ville sælge og til hvem, ikke hvor mange der havde en maskine (T1, T2).</td></tr><tr><td>2</td><td>Hvordan firmaet ville have kunderne til at se maskinen, og hvilket billede af »den moderne husmor« reklamen gav (T3).</td></tr>${f.choice.claims.map((c) => `<tr><td>3${esc(c.id)}</td><td><strong>${esc(c.answer)}</strong></td></tr>`).join("")}</tbody></table><h4>Bedømmelse</h4><p>T1–T3 (0–2 hver) og TV (0–2). Se rubrikken nederst.</p><p><strong>Hvad er nyt:</strong> ${esc(f.whatChanges)}</p><p><strong>Hvad er det samme:</strong> ${esc(f.whatStays)}</p>`);
  }
  P.push(`<h4>Kildeoplysninger</h4><p>${esc(f.source.kind)}, <strong>${esc(f.source.status)}</strong>: et opfundet eksempel på en ægte kildetype. Ikke en original, forkortelse eller parafrase.</p>`);
  P.push(`<h4>Historiske forbehold</h4><p><strong>Skal kontrolleres af dig:</strong> ${esc(f.frameToCheck)}</p><p><strong>Udviklerens kontrol (ikke en godkendelse):</strong> ${esc(r.verified)}</p>`);
  P.push(`<h4>Didaktisk begrundelse</h4><p>${esc(r.rationale)}</p><h4>Kendte svagheder</h4><ul>${r.weaknesses.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>`);
  if (r.afterApproval) P.push(`<h4>Ændret efter din godkendelse 05-11-2026 (${esc(VERSION)})</h4><p>${esc(r.afterApproval)}</p>${sinceApproval(f.id)}`);
  P.push(`<h4>Ændret i kildekritik-maaling-v1.2 (F9: svargenveje fjernet)</h4><p>${esc(r.changes)}</p>${beforeAfter(f.id)}`);
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
  const reg = registeredAmbiguity(a.id);
  const regLine = reg ? `<p class="reg"><strong>Registreret beslutning:</strong> ${esc(a.options.find((o) => o.id === reg.valg)?.label ?? reg.valg)} <span class="eff">— kilde: ${esc(reg.kilde)}</span></p>` : "";
  return `<section class="amb" id="tv-${a.id}"><h3>${esc(a.id)} · ${esc(s?.kind ?? "")} (${esc(a.criterion)})</h3>${regLine}`
    + `<p><strong>Opgaven:</strong> ${esc(a.task)}</p><p><strong>Det syntetiske elevsvar</strong> (konstrueret, ikke en elev): »${esc(text)}«${extra ? `<br><span class="eff">Resten af svaret: ${extra}</span>` : ""}</p>`
    + `<p><strong>Foreslået bedømmelse (F8):</strong> ${esc(a.proposed)}</p><p><strong>Hvorfor det er svært:</strong> ${esc(a.why)}</p>`
    + `<fieldset class="dec"><legend>Din beslutning om ${esc(a.id)}</legend>${opts}<p><strong>Min anbefaling:</strong> ${esc(a.recommendationWhy)}</p><label class="c">Kommentar <textarea name="tvk-${a.id}" rows="2"></textarea></label></fieldset></section>`;
}

/** The decision in force for an ambiguity: from the registered file, or from a supplement — with its origin. */
function registeredAmbiguity(id) {
  const reg = registered();
  if (!reg) return null;
  const v = reg.tvetydigheder?.[id];
  if (v && v.valg !== UNDECIDED) return { valg: v.valg, kilde: `filen proeve-godkendelse-2026-11-05.json (lærer »${reg.laerer}«, dato »${reg.dato}«)` };
  for (const sp of SUPPLEMENTS) if (sp.beslutninger[id]) return { valg: sp.beslutninger[id].valg, kilde: `${sp.id}: ${sp.kilde}` };
  return null;
}

/** Status of each item now: an approval applies only to the content whose fingerprint it was saved with. */
export function currentStatus() {
  const reg = registered();
  const fps = contentFingerprints();
  return Object.fromEntries(ITEMS.map((id) => {
    const a = reg?.afgoerelser?.[id];
    if (!a) return [id, { status: "ikke_gennemgaaet", text: "Ikke gennemgået" }];
    if (a.fingeraftryk === fps[id]) return [id, { status: a.status, text: `${LABEL[a.status]} ${reg.dato} (uændret siden)` }];
    return [id, { status: a.status === "godkendt" ? "afventer_fornyet_laerergodkendelse" : "ikke_gennemgaaet", text: a.status === "godkendt" ? `Afventer fornyet lærergodkendelse (godkendt ${reg.dato} i en tidligere version; ændret siden)` : "Ikke gennemgået (ændret siden)" }];
  }));
}

function rubricDecision(d) {
  const opts = [`<label><input type="radio" name="rb-${d.id}" value="${UNDECIDED}" checked> Ikke besluttet</label>`]
    .concat(d.options.map((o) => `<label><input type="radio" name="rb-${d.id}" value="${esc(o.id)}"> ${esc(o.label)}${o.id === d.recommendation ? " <em>(anbefalet)</em>" : ""} <span class="eff">— ${esc(o.effect)}</span></label>`)).join("");
  return `<section class="amb" id="rb-${d.id}"><h3>${esc(d.id)} (${esc(d.criterion)})</h3><p><strong>Opgaven:</strong> ${esc(d.task)}</p><p>${esc(d.current)}</p><p><strong>Hvorfor det skal besluttes:</strong> ${esc(d.why)}</p>`
    + `<fieldset class="dec"><legend>Din beslutning om ${esc(d.id)}</legend>${opts}<p><strong>Min anbefaling:</strong> ${esc(d.recommendationWhy)}</p><label class="c">Kommentar <textarea name="rbk-${d.id}" rows="2"></textarea></label></fieldset></section>`;
}

function lp13(d) {
  const opts = [`<label><input type="radio" name="lp-${d.id}" value="${UNDECIDED}" checked> Ikke besluttet</label>`]
    .concat(d.options.map(([v, l]) => `<label><input type="radio" name="lp-${d.id}" value="${v}"> ${v}: ${esc(l)}${v === d.recommendation ? " <em>(anbefalet)</em>" : ""}</label>`)).join("");
  return `<fieldset class="dec lp" id="lp-${d.id}"><legend>${esc(d.id)}: ${esc(d.title)}</legend>${opts}<label class="c">Kommentar <textarea name="lpk-${d.id}" rows="1"></textarea></label></fieldset>`;
}


const BEFORE = loadBefore();
const APPROVED = existsSync(APPROVED_FIXTURE) ? JSON.parse(readFileSync(APPROVED_FIXTURE, "utf8")) : null;
const strip = (o) => JSON.stringify(o);

/** The exact text changed since the approved v1.2: only the parts that differ, old beside new. */
function sinceApproval(id) {
  if (!APPROVED) return "";
  const a = id === "T" ? APPROVED.transfer : APPROVED.forms[id], n = id === "T" ? TRANSFER : FORMS[id];
  const rows = [];
  const add = (label, x, y) => { if (strip(x) !== strip(y)) rows.push([label, x, y]); };
  add("Kildens overskrift", a.source.header, n.source.header);
  add("Kildens tekst", a.source.text, n.source.text);
  add("Kildetype", a.source.kind, n.source.kind);
  if (n.part1) add("Del 1, accepterede svar", Object.entries(a.part1.key).map(([k, v]) => `${k}: ${v.join(" · ")}`).join(" | "), Object.entries(n.part1.key).map(([k, v]) => `${k}: ${v.join(" · ")}`).join(" | "));
  if (n.part2) n.part2.claims.forEach((c, i) => add(`Del 2, påstand ${i + 1} (${c.type})`, `${a.part2.claims[i].text} [${a.part2.claims[i].answer}]`, `${c.text} [${c.answer}]`));
  const srcA = (n.part3 ? a.part3 : a.choice).sources, srcN = (n.part3 ? n.part3 : n.choice).sources;
  srcN.forEach((x, i) => add(`Kildetabel: ${x.label}`, srcA[i].meta, x.meta));
  if (!rows.length) return `<p class="note">Ingen tekst, som eleven ser, er ændret.</p>`;
  return `<table class="since"><thead><tr><th></th><th>Godkendt 05-11-2026 (${esc(APPROVED.version)})</th><th>Nu (${esc(VERSION)})</th></tr></thead><tbody>${rows.map(([k, x, y]) => `<tr><td>${esc(k)}</td><td>${esc(x)}</td><td>${esc(y)}</td></tr>`).join("")}</tbody></table>`;
}

/** The rubric levels changed since the approved rubric (v1.2). */
function rubricSinceApproval() {
  if (!APPROVED) return "";
  const rows = [];
  for (const [set, now, old] of [["", CRITERIA, APPROVED.criteria], ["", TRANSFER_CRITERIA, APPROVED.transferCriteria]]) {
    for (const [k, c] of Object.entries(now)) {
      const o = old[k];
      if (strip(o) !== strip(c)) rows.push([`${set}${k} ${c.name}`, o ? `${o.name}: ${o.levels.map((t, i) => `${i}: ${t}`).join(" / ")}` : "–", c.levels.map((t, i) => `${i}: ${t}`).join(" / ")]);
    }
  }
  return `<table class="since"><thead><tr><th>Kriterium</th><th>Godkendt 05-11-2026 (rubrik v1.2)</th><th>Nu (${esc(RUBRIC_VERSION)})</th></tr></thead><tbody>${rows.map(([k, x, y]) => `<tr><td>${esc(k)}</td><td>${esc(x)}</td><td>${esc(y)}</td></tr>`).join("")}</tbody></table>`;
}

/** The decided scoring rules with examples, and S7's standard procedure. */
function rulesSection() {
  const ex = (r) => `<ul>${Object.entries(r.examples).map(([k, v]) => `<li><strong>${esc(k)}:</strong> ${esc(v)}</li>`).join("")}</ul>`;
  const m = MUNDTLIG_OPFOELGNING;
  return `<h4>Dine bedømmelsesregler (besluttet 05-11-2026, indbygget i rubrikken ${esc(RUBRIC_VERSION)})</h4>`
    + `<table><thead><tr><th>Regel</th><th>Kriterium</th><th>Regel og eksempler</th><th>Oprindelse</th></tr></thead><tbody>${SCORING_RULES.map((r) => `<tr><td>${esc(r.id)}</td><td>${esc(r.criterion)}</td><td>${esc(r.rule)}${ex(r)}</td><td>${esc(r.origin)}</td></tr>`).join("")}</tbody></table>`
    + `<h4 id="s7-procedure">S7: fast procedure for mundtlig opfølgning</h4><p><strong>Hvornår:</strong> ${esc(m.naar)}</p><p><strong>Ordlyd:</strong> ${esc(m.ordlyd)}</p><p><strong>Læreren må ikke:</strong></p><ul>${m.maaIkke.map((t) => `<li>${esc(t)}</li>`).join("")}</ul><p><strong>Forsøg:</strong> ${esc(m.forsoeg)}</p><p><strong>Registrering:</strong> ${esc(m.registrering)}</p><p><strong>Fortolkning:</strong> ${esc(m.fortolkning)}</p>`;
}

/** The historical fact check, per finding, with sources and what was changed. */
function factCheckSection() {
  return `<section class="ov" id="faktatjek"><h2>Historisk faktatjek (05-11-2026)</h2>`
    + `<p>Prøvernes kilder er <strong>didaktisk konstruerede</strong>: opfundne tekster af ægte kildetyper. Kontrollen gælder den historiske ramme, de bygger på. Ingen citater, arkivsignaturer eller kildehenvisninger er opfundet. Kilderne er læst på nettet 05-11-2026.</p>`
    + FACT_CHECK.map((c) => `<h3>${esc(c.id)} · ${esc(c.test)}</h3><p><strong>Vores tekst (godkendt version):</strong> ${esc(c.ours)}</p><p><strong>Kilder:</strong></p><ul>${c.sources.map((t) => `<li>${esc(t)}</li>`).join("")}</ul><p><strong>Vurdering:</strong> ${esc(c.verdict)}. ${esc(c.detail)}</p><p><strong>Rettelse:</strong> ${esc(c.correction)}</p>`).join("")
    + `</section>`;
}
const BEFORE_OF = { A: BEFORE.forms.A, B: BEFORE.forms.B, C: BEFORE.forms.C, T: BEFORE.transfer };
const listClaims = (cs, withAnswer) => `<ol>${cs.map((c) => `<li>${esc(c.text)}${withAnswer ? ` <strong>${esc(c.answer)}</strong>` : ""}</li>`).join("")}</ol>`;
const listSources = (ss) => `<ul>${ss.map((x) => `<li>${esc(x.label)}: ${esc(x.meta)}</li>`).join("")}</ul>`;

/** Before (v1.1, frozen fixture) and now, side by side: the exact text that changed. Inside the teacher's fold. */
function beforeAfter(id) {
  const b = BEFORE_OF[id], n = id === "T" ? TRANSFER : FORMS[id];
  const rows = [];
  if (n.part2) {
    rows.push(["Del 2: påstande og facit", listClaims(b.part2.claims, true), listClaims(n.part2.claims, true)]);
    rows.push(["Del 3: kilder (i tabellens rækkefølge)", listSources(b.part3.sources), listSources(n.part3.sources)]);
    rows.push(["Del 3: påstande og facit", listClaims(b.part3.claims, true), listClaims(n.part3.claims, true)]);
  } else {
    rows.push(["Spørgsmål 1–2", listClaims(b.open.map((t) => ({ text: t })), false), listClaims(n.open.map((t) => ({ text: t })), false)]);
    rows.push(["Kilder (i tabellens rækkefølge)", listSources(b.choice.sources), listSources(n.choice.sources)]);
    rows.push(["Påstande og facit", listClaims(b.choice.claims, true), listClaims(n.choice.claims, true)]);
  }
  rows.push(["Tid", `${b.minutes} min`, `${n.minutes} min`]);
  rows.push(["Side 1 afleveres før side 2", "nej", "ja"]);
  return `<table class="diff"><thead><tr><th></th><th>Før (${esc(BEFORE.version)})</th><th>Nu (${esc(VERSION)})</th></tr></thead><tbody>${rows.map(([k, x, y]) => `<tr><td>${esc(k)}</td><td>${x}</td><td>${y}</td></tr>`).join("")}</tbody></table>`;
}

/** The adversarial check: every rule-based strategy, before and after, per test. Generated, so it cannot drift. */
function shortcutSection() {
  const before = audit(BEFORE.forms, BEFORE.transfer), after = audit(FORMS, TRANSFER);
  const cell = (row, id) => (row.per[id] ? `${row.per[id].right}/${row.per[id].of}` : "–");
  const table = (title, strategies, b, a, ids, chance) => `<h3>${esc(title)} (gæt: ${chance})</h3><table><thead><tr><th>Strategi</th><th>Før i alt</th><th>Nu i alt</th>${ids.map((i) => `<th>Nu ${i}</th>`).join("")}</tr></thead><tbody>${strategies.map((st) => {
    const rb = b.find((r) => r.id === st.id), ra = a.find((r) => r.id === st.id);
    return `<tr><td>${esc(st.name)}</td><td>${rb.right}/${rb.of} (${rb.pct} %)</td><td><strong>${ra.right}/${ra.of} (${ra.pct} %)</strong></td>${ids.map((i) => `<td>${cell(ra, i)}</td>`).join("")}</tr>`;
  }).join("")}</tbody></table>`;
  return `<section class="ov" id="svargenveje"><h2>Kontrol af svargenveje (F9)</h2>`
    + `<p>Kan en elev få det rigtige svar uden at forstå det faglige indhold? Nedenfor er de mønstre, der blev fundet i ${esc(BEFORE.version)}, og hvad der er gjort. Tabellerne viser, hvor mange rigtige simple regler (uden kildekritik) får før og nu. Regler, der får mere end gæt, er en genvej.</p>`
    + `<table><thead><tr><th>Fund</th><th>Mønster</th><th>Rettelse</th></tr></thead><tbody>${SHORTCUT_FINDINGS.map((g) => `<tr><td>${esc(g.id)}</td><td>${esc(g.pattern)}</td><td>${esc(g.fix)}</td></tr>`).join("")}</tbody></table>`
    + table("Del 2 (ja/nej) i A, B og C", PART2_STRATEGIES, before.part2, after.part2, ["A", "B", "C"], "50 %")
    + table("Del 3 og transfertestens kildevalg", CHOICE_STRATEGIES, before.part3, after.part3, ["A", "B", "C", "T"], "25 %")
    + `<h3>Ikke rettet (til din vurdering)</h3><ul>${SHORTCUT_RESIDUALS.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>`
    + `<p class="note">Ændringerne i hver prøve står under »Til læreren« ved prøven (før og nu, ord for ord). Fordi indholdet er ændret, står alle prøver som »Ikke gennemgået«.</p></section>`;
}

/** A, B and C side by side: measured from the text, judged by hand, and what only pupil answers can show. */
function comparabilitySection() {
  const c = comparability();
  const rows = [
    ["Tid (skøn, ikke målt)", (m) => `${m.minutes} min`],
    ["Kildens ord / sætninger", (m) => `${m.sourceWords} / ${m.sourceSentences}`],
    ["Kildens LIX (lav = let)", (m) => m.sourceLix],
    ["Lange ord i kilden (over 6 bogstaver)", (m) => m.sourceLongWords],
    ["Forklarede ord", (m) => m.glossary],
    ["Del 2: ord i påstandene / LIX", (m) => `${m.part2ClaimWords} / ${m.part2ClaimLix}`],
    ["Del 2: typer i rækkefølge / facit", (m) => `${m.part2Types} / ${m.part2Key}`],
    ["Del 3: ord (kildebeskrivelser og påstande)", (m) => m.part3Words],
    ["Alt, eleven læser: ord / LIX", (m) => `${m.totalWords} / ${m.totalLix}`],
  ];
  const judged = [["Modtager (R3)", "receiver"], ["Formål (R4)", "purpose"], ["Del 2", "part2"], ["Del 3's emne", "part3Topic"], ["Forventet sværhed", "expected"]];
  return `<section class="ov" id="sammenlignelighed"><h2>Sammenlignelighed af A, B og C (F9)</h2>`
    + `<p>Samme opbygning: fire spørgsmål i del 1, fire påstande af de samme fire typer i del 2, to kildevalg og to begrundelser i del 3. Tallene herunder er <strong>målt</strong> på teksten. Vurderingerne er <strong>skøn</strong>. Om formerne faktisk er lige svære, kan kun elevsvar vise.</p>`
    + `<h3>Målt</h3><table><thead><tr><th></th>${c.forms.map((m) => `<th>${m.id}</th>`).join("")}</tr></thead><tbody>${rows.map(([k, f]) => `<tr><td>${esc(k)}</td>${c.forms.map((m) => `<td>${esc(f(m))}</td>`).join("")}</tr>`).join("")}</tbody></table>`
    + `<h3>Skønnet (ikke målt)</h3><table><thead><tr><th></th>${c.forms.map((m) => `<th>${m.id}</th>`).join("")}</tr></thead><tbody>${judged.map(([k, f]) => `<tr><td>${esc(k)}</td>${c.forms.map((m) => `<td>${esc(c.judged[m.id][f])}</td>`).join("")}</tr>`).join("")}</tbody></table>`
    + `<h3>Kræver elevbesvarelser</h3><ul>${c.needsPupilData.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></section>`;
}

export function html() {
  const fps = contentFingerprints();
  const status = currentStatus();
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
.brk{border-top:2px dashed var(--line);margin:12px 0 8px;padding-top:6px}table.diff td{font-size:14px}
.stale{color:var(--bad);font-weight:600}.reg{border-left:4px solid var(--ok);padding-left:8px}table.since td{font-size:14px}#count{font-weight:600}.sep{border-top:3px double var(--line);margin-top:28px;padding-top:6px}
</style></head><body>
<h1>Prøvegodkendelse: kildekritik (D-346)</h1>
<p class="note">Genereret af tools/laerligverse/assessment-review.mjs fra de samme data som elevarkene (${esc(VERSION)}, rubrik ${esc(RUBRIC_VERSION)}). Siden virker uden internet og gemmer intet selv: tryk »Gem afgørelser som fil«. Intet er godkendt, før du har valgt det.</p>
<p class="note"><strong>Fornyet gennemgang:</strong> Indlæs din fil fra 05-11-2026 med »Indlæs tidligere afgørelser«. Det, der er ændret siden, står derefter som »Ikke gennemgået« med en rød note; resten beholder dit valg. S2, S3 og S4 står som »Ikke besluttet« i filen. Vælg dem igen, så de kommer med i den nye fil. Skriv dit fulde navn og datoen som DD-MM-ÅÅÅÅ.</p>
<div class="bar"><label>Lærer <input type="text" id="laerer" autocomplete="name"></label><label>Dato <input type="text" id="dato" placeholder="DD-MM-ÅÅÅÅ"></label>
<label>Indlæs tidligere afgørelser <input type="file" id="load" accept="application/json"></label><button type="button" id="save">Gem afgørelser som fil</button><span id="count" aria-live="polite"></span><span id="msg" role="status" aria-live="polite"></span></div>
<section class="ov" id="overblik"><h2>A. Overblik</h2>
<p><strong>Formål:</strong> at undersøge, om eleverne kan noget efter Arkivskabet, som de ikke kunne før: prætest før forløbet, posttest straks efter, en transfertest på nyt materiale og en forsinket test efter reel tid.</p>
<p><strong>Kompetence:</strong> at bruge en kildes afsender, tidspunkt, modtager og formål til at afgøre, hvad kilden kan og ikke kan bruges som belæg for. Målt i tre delscorer: identifikation, valg og begrundelse.</p>
<p><strong>Tid:</strong> A ${FORMS.A.minutes} min, B ${FORMS.B.minutes} min, T ${TRANSFER.minutes} min, C ${FORMS.C.minutes} min. Dag 1 (A, forløbet, B, T) kræver en dobbeltlektion.</p>
<table><thead><tr><th>Del</th><th>Status</th></tr></thead><tbody>
<tr><td>Arkivskabets 12 elementer</td><td><strong>Godkendt</strong> af Christopher Møller 04-11-2026 (SHA-256 8cd7d969…). Ikke en del af denne side.</td></tr>
${ITEMS.map((id) => `<tr><td>${esc(titleOf[id])}</td><td data-reg="${id}"><strong>${esc(status[id].text)}</strong></td></tr>`).join("")}
<tr><td>De fem tvivlstilfælde i rubrikken</td><td><strong>Besluttet</strong>: S6 og S7 i filen, S2, S3 og S4 i et særskilt supplement (afsnit E). Indbygget i rubrikken ${esc(RUBRIC_VERSION)}</td></tr>
<tr><td>LP-13 (læringsprogression)</td><td><strong>Valg registreret</strong> fra filen (afsnit F) — ikke en del af prøvegodkendelsen, og intet er aktiveret</td></tr>
<tr><td>Elevpilot og produktion</td><td><strong>Ikke autoriseret</strong></td></tr></tbody></table>
<p><label><input type="checkbox" id="ra-on"> Prøv oplæsning af elevteksten (prototype, slået fra som standard). Bruger kun stemmer, som browseren angiver som lokale på denne computer; ingen tekst sendes af siden.</label> <span id="ra-voice" class="note"></span></p></section>
${factCheckSection()}
${shortcutSection()}
${comparabilitySection()}
<h2 class="sep">B. Prætest</h2>${testSection("A")}
<h2 class="sep">C. Posttest</h2>${testSection("B")}
<h2 class="sep">D. Transfer og forsinket test</h2>${testSection("T")}${testSection("C")}
<h2 class="sep">E. Bedømmelsesrubrik</h2>
<section class="el" id="rubrik" data-status="ikke_gennemgaaet"><h2>${esc(titleOf.rubrik)}</h2>
<p>Tre delscorer, som rapporteres hver for sig. Ingen samlet score og ingen grænse for »mestret«. Version: ${esc(RUBRIC_VERSION)}.</p>${rubricTable(CRITERIA)}<h4>Transfertest</h4>${rubricTable(TRANSFER_CRITERIA)}
<h4>Ændret efter din godkendelse 05-11-2026</h4>${rubricSinceApproval()}${rulesSection()}
<h4>De fem tvivlstilfælde (fra bedømmelsesforsøget med syntetiske svar)</h4><p class="note">Dine beslutninger er registreret og indbygget i reglerne ovenfor. Vælg dem igen her, så de står i den nye fil.</p>
${AMBIGUITIES.map(ambiguity).join("\n")}
<h4>Transfertestens T1 (fundet i F9)</h4><p class="note">Ikke et af de fem tvivlstilfælde, men et spørgsmål om rubrikken, som du skal afgøre. Dit valg ændrer ikke rubrikken af sig selv.</p>
${RUBRIC_DECISIONS.map(rubricDecision).join("\n")}${decision("rubrik")}</section>
<h2 class="sep">F. Beslutninger om læringsprogression (LP-13)</h2>
<section class="ov" id="lp13"><p><strong>Dette er ikke en del af godkendelsen af prøvernes faglige indhold.</strong> Valgene gemmes i samme fil, men aktiverer intet: ingen regel ændres i spillet eller på serveren, før der er givet et særskilt GO.</p>
${LP13.map(lp13).join("\n")}</section>
<script>
const ITEMS = ${JSON.stringify(ITEMS)};
const STATUSES = ${JSON.stringify(STATUSES)};
const FIELDS = ${JSON.stringify(FIELDS.map(([k]) => k))};
const AMB = ${JSON.stringify(AMBIGUITIES.map((a) => ({ id: a.id, values: a.options.map((o) => o.id) })))};
const LPS = ${JSON.stringify(LP13.map((d) => ({ id: d.id, values: d.options.map(([v]) => v) })))};
const RBS = ${JSON.stringify(RUBRIC_DECISIONS.map((d) => ({ id: d.id, values: d.options.map((o) => o.id) })))};
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
  const rubrikbeslutninger = {}; for (const d of RBS) rubrikbeslutninger[d.id] = { valg: radio("rb-" + d.id) || UNDECIDED, kommentar: $('textarea[name="rbk-' + d.id + '"]').value };
  const lp13 = {}; for (const d of LPS) lp13[d.id] = { valg: radio("lp-" + d.id) || UNDECIDED, kommentar: $('textarea[name="lpk-' + d.id + '"]').value };
  return { _om: "Lærerens afgørelser om prøverne (D-346). Gemmes kun som fil; intet sendes eller aktiveres.", format: FORMAT, version: VERSION, laerer: $("#laerer").value, dato: $("#dato").value, indhold: FP, proever, tvetydigheder, rubrikbeslutninger, lp13 };
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
  const decided = ITEMS.some((id) => d.proever[id].status !== "ikke_gennemgaaet") || AMB.some((a) => d.tvetydigheder[a.id].valg !== UNDECIDED) || RBS.some((x) => d.rubrikbeslutninger[x.id].valg !== UNDECIDED) || LPS.some((x) => d.lp13[x.id].valg !== UNDECIDED);
  if (decided && (!d.laerer.trim() || !d.dato.trim())) { msg("Skriv dit navn og datoen, før du gemmer afgørelser."); return; }
  if (decided && !/^[0-9]{2}-[0-9]{2}-[0-9]{4}$/.test(d.dato.trim())) { msg("Skriv datoen som DD-MM-ÅÅÅÅ, fx 05-11-2026."); return; }
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
  for (const x of RBS) { const v = (d.rubrikbeslutninger || {})[x.id] || {}; if (!setRadio("rb-" + x.id, x.values.includes(v.valg) ? v.valg : UNDECIDED)) setRadio("rb-" + x.id, UNDECIDED); $('textarea[name="rbk-' + x.id + '"]').value = typeof v.kommentar === "string" ? v.kommentar : ""; }
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
  const ok = new Set(["_om", "format", "version", "laerer", "dato", "indhold", "proever", "tvetydigheder", "rubrikbeslutninger", "lp13"]);
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
  for (const x of RUBRIC_DECISIONS) {
    const v = d.rubrikbeslutninger?.[x.id]?.valg ?? UNDECIDED;
    if (v !== UNDECIDED && !x.options.some((o) => o.id === v)) problems.push(`${x.id}: invalid choice ${v}`);
  }
  for (const x of LP13) {
    const v = d.lp13?.[x.id]?.valg;
    if (v !== UNDECIDED && !x.options.some(([o]) => o === v)) problems.push(`${x.id}: invalid choice ${v}`);
  }
  const decided = Object.values(p).some((v) => v?.status !== "ikke_gennemgaaet")
    || AMBIGUITIES.some((a) => (d.tvetydigheder?.[a.id]?.valg ?? UNDECIDED) !== UNDECIDED)
    || RUBRIC_DECISIONS.some((x) => (d.rubrikbeslutninger?.[x.id]?.valg ?? UNDECIDED) !== UNDECIDED)
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
