# Læringsprogression i Lærlig — audit og designforslag

**Status:** UDKAST (DRAFT), revision 2.
- **Godkendt:** Ejeren har 2026-10-31 godkendt læringsmodellen som **overordnet arbejdsretning**.
- **Ikke godkendt:** Det er ikke en godkendelse af det endelige design eller af LP-beslutningerne
  (§14).
- **Intet bygget eller aktiveret:** Intet i dokumentet er bygget eller aktiveret. Det ændrer ingen
  produktionsadfærd, og der hører ingen migration eller deploy til.

**Revision 2 (2026-10-31)** indarbejder ejerens otte punkter:
1. forhåndsviden, eksponering og mestring holdes adskilt (§4.1, §4.3);
2. diagnostik påvirker aldrig mestring eller niveau negativt (§4.5);
3. mestringskriterierne begrundes og markeres som pilotparametre med en kalibreringsplan (§4.6, §4.9);
4. evidensstyrken er gennemgået for alle former, inkl. Match par, delvis korrekte svar, tvetydige
   opgaver og fejl i bedømmelsen (§4.2, §6);
5. evalueringen tager højde for fælles forudsætninger (§12);
6. XP-neutraliteten er gennemgået (§7.1);
7. LP-beslutningerne er inddelt (§14);
8. kilderne er verificeret mod primærkilder ([kildeverifikation](learning-progression-source-verification.md)).
**Dato:** 2026-10-31 · **Grundlag:** `main` @ `6a55282` (merge af #379), læst read-only.
Produktionsforhold er kun angivet, hvor et tidligere read-only produktionstjek er dokumenteret i repoet.
**Beslutning:** [D-277](decisions/D-277.md).
**Bilag:** [learning-progression-evidence.md](learning-progression-evidence.md) er evidensnotatet med
den fulde forskningsgennemgang og 60 referencer, hver markeret med verificeringsstatus.

## Læsevejledning

Dokumentet bruger fem mærker. **Forskning og vores egne hypoteser blandes aldrig.**

| Mærke | Betyder |
|---|---|
| **FORSKNING** | Et resultat fra en kilde, der er verificeret mod primærkilden ([kildeverifikation](learning-progression-source-verification.md)). Populationen er angivet, når den afviger fra Lærligs elever. |
| **FAKTA** | Læst direkte i kode, migrationer, et dokumenteret read-only produktionstjek eller udregnet (kombinatorik). |
| **HYPOTESE** | Vores pædagogiske antagelse. Den er ikke dokumenteret for Lærligs elever og skal efterprøves (§12). |
| **HEURISTIK** | Et tal, vi vælger, fx 20 timer eller 2 opgaver. Det er en pilotparameter, der skal kalibreres (§4.9), ikke et forskningsresultat. |
| **FORSLAG** | Designforslag. Det kræver ejerens godkendelse. |

En påstand, jeg har sluttet mig til uden at have læst den direkte, er markeret *(udledt)*.

**Rettelse i revision 2:** I revision 1 brugte jeg FUND om både forskning og kodefakta, og nogle
tal stod uden at være markeret som heuristik. Kildeverifikationen fandt desuden én forkert gengivelse
(Agarwal m.fl. 2021) og flere, der skulle nuanceres. De er rettet i §3 og i bilaget.

---

## 1. Resumé

**Lærlig er i dag et testsystem uden læringsforløb.** Eleven får spørgsmål, svarer og får at vide,
om svaret var rigtigt. Ved forkert svar kommer der ofte en kort forklaring. Det, der mangler, er
alt det, en læringsprogression bygger på:
- Der findes intet indhold, der introducerer viden.
- Der findes ingen læringsmål eller forudsætninger.
- Der gemmes ingen svarhistorik.
- Der findes ingen fungerende mestringsmodel.
- Der findes ingen fungerende spaced repetition.

Flere af byggestenene findes dog allerede eller er bygget, men ikke aktive:
- niveaumotoren 1–10.000 pr. fag;
- svarloggen `question_attempts` (D-266/D-273);
- feedback ud fra misopfattelser;
- rige pædagogiske metadata på indholdet;
- placeringstesten;
- lærerens statistik, der blev rettet 2026-10-30.

**Kerneforslaget (FORSLAG):**
1. **Læringsmål pr. emne.** Hvert emne opdeles i små, vurderbare læringsmål med forudsætninger.
   Indhold og opgaver knyttes til målene.
2. **Elevtilstand pr. læringsmål.** For hvert læringsmål holder elevtilstanden tre ting adskilt:
   - *forhåndsviden*, som er ukendt, indtil den er påvist;
   - *registreret eksponering*, dvs. at systemet ved, at eleven har mødt stoffet;
   - *dokumenteret mestring* og glemselsrisiko.

   En manglende eksponeringslog betyder ikke, at eleven aldrig har mødt stoffet. Tilstanden er afledt
   deterministisk af en append-only log, kan genberegnes og kan forklares for læreren.
3. **Seks aktivitetstyper.** Progressionen bevæger eleven gennem diagnostik, introduktion, guidet
   øvelse, selvstændig genkaldelse, forsinket repetition og anvendelse. Den springer over det,
   eleven allerede kan, og går tilbage, når evidensen viser glemsel eller misopfattelse.
4. **Mestring kræver forsinket, uassisteret og varieret evidens,** hvoraf mindst én opgave ikke kan
   gættes. Tallene (fx ≥ 20 t og 2 opgaver) er pilotparametre, der kalibreres.

   **Diagnostiske svar kan aldrig sænke mestring eller niveau,** uanset om undervisning er
   registreret. De kan kun vise, hvad eleven allerede kan, og bestemme ruten.
5. **Belønningerne flyttes fra volumen til læringshandlinger.** Den største belønning knyttes til
   bekræftet mestring og vellykket repetition, ikke til antal svar eller hastighed.

**Den vigtigste rækkefølge (FORSLAG, §10):**
1. Udvid `question_attempts` med *aktivitetstilstand*, *hints* og *svartid*, **før** migrationen
   anvendes. Det er billigt nu og dyrt bagefter.
2. Indfør læringsmål og introduktionsindhold for **ét pilotforløb pr. fag**.
3. Kør tilstandsmotoren i skyggetilstand.
4. Lad først derefter progressionen styre udvælgelsen for en pilotklasse.

Nye opgaveformer prioriteres efter, hvilket hul i progressionen de lukker (§6).

---

## 2. Audit af det eksisterende system

Status er angivet med ejerens regel for øje: *en funktion er ikke "fraværende", blot fordi et flag er
slået fra.*

| Status | Betydning |
|---|---|
| **LIVE** | I koden og nås i produktion i dag. |
| **BYGGET-INAKTIV** | Koden eller migrationen findes, men flaget er fra, migrationen er ikke anvendt, koden er ikke deployet eller formen er ikke servable. Årsagen er angivet. |
| **DELVIS** | Kører i produktion, men kun en del af den tilsigtede adfærd sker. |
| **DØD** | Findes, men er verificeret virkningsløs eller ubrugt. |
| **FRAVÆRENDE** | Intet findes. |

### 2.1 Kapabiliteter

| Kapabilitet | Status | Evidens (kort) |
|---|---|---|
| **Mestring** (`student_progress.mastery_*`, `update_mastery()`) | DØD | Kolonnerne skrives aldrig. `update_mastery()` har ingen kaldere. Mestringsudvælgelsen blev fjernet 2026-03-26. Prod 2026-10-28: 59 af 69 rækker har standardværdier. |
| **Begrebstilstand** `get_concept_states` (emerging/stable/uncertain/misconception_prone) | BYGGET-INAKTIV | `20260526000100_concept_state_rpc.sql`. Ingen kalder i UI. Den nærmeste eksisterende mestringsmodel. |
| **Spaced repetition** (`next_review_at`) | DØD | `process-event/index.ts:328-350` skriver via elevklienten. Der er ingen UPDATE-policy, så 0 rækker ændres uden fejl. Prod 2026-10-28: 5.763 af 5.857 besvarede rækker har aldrig fået en review-tid. |
| **Gentagelse, når puljen er brugt op** | LIVE | `request_repeat_question_for_student`: ældste forkerte først. Den samme række genåbnes, og det første svar overskrives. Giver 2 XP + 1 mønt (D-211). |
| **Svarhistorik** | FRAVÆRENDE i drift / BYGGET-INAKTIV som design | `question_instances` er nuværende tilstand. Alle ældre logs er døde. `question_attempts` (D-266, H5 = D-273) er merget, men **ikke anvendt**. PR 3–5 og H1–H4 er åbne. |
| **Svartid** | FRAVÆRENDE (i lager) | `question_shown_at` sendes, men `p_question_shown_at` bruges ikke. `question_attempts` har heller ingen tidskolonne. |
| **Placeringstest** (10 MC, bånd 1–4) | LIVE, men kun historie | Måler historie. Resultatet bliver ét globalt `placement_band` *(udledt: den kører, uanset hvilket fag eleven åbner først)*. |
| **Måle-spørgsmål pr. fag** (P1–P9) | FRAVÆRENDE i main | Findes kun som forslag på den ikke-mergede branch `docs/subject-placement-design`. |
| **Klassetrin** | LIVE, selvvalgt og et hårdt loft | `target_grade <= selected_grade`. Strider mod ejerens retning "klassetrin = start, aldrig loft". |
| **Klientbånd 1–5** (3 op / 2 ned) | LIVE, svag | Fælles for alle fag og kan skrives af eleven. Ændrer kun rækkefølgen i et usorteret `LIMIT 50`-vindue. |
| **Serverbånd** `student_band_state` | DELVIS | Skrives i produktion af `shadow`, men bruges aldrig til servering og er ikke pr. fag. |
| **Niveaumotor 1–10.000 pr. fag** | BYGGET-INAKTIV | Migration A+B anvendt. Koden er i gnq v180. `LEVEL_ENGINE` er ikke sat. Folder kun første svar. Opgavernes niveau er en formel (klassetrin × bånd), ikke kalibreret. |
| **Bølgefaser** (recovery/reinforcement/challenge/deep_challenge) | LIVE, kun i sessionen | Klientens tilstandsmaskine nulstilles ved genindlæsning. Ændrer kun rækkefølgen. |
| **Feedback ved forkert svar** (`review_text`, korrekt svar) | LIVE | Refleksionspanel med højst 2 i træk. Intet ved korrekt svar. |
| **Misopfattelsessignal** | LIVE (skrives), ubrugt | Gemmes ved forkert svar *(udledt: siden process-event v33)*. Overskrives ved gentagelse. Læses kun af `get_concept_states` (ingen kalder). |
| **Hints før svar** | FRAVÆRENDE | Ingen mekanisme og intet DTO-felt. |
| **Læringsmål, forudsætninger, Fælles Mål-kobling** | FRAVÆRENDE | `questions.learning_objective` er reelt en emne-/domænenøgle, ikke et læringsmål. |
| **Introduktionsindhold** (vidensindhold før opgaver) | FRAVÆRENDE | Den eneste forklarende tekst er `review_text` efter et forkert svar. Oplæsning (157P) er live, men er tilgængelighed, ikke undervisning. |
| **Forløb** | FRAVÆRENDE | Lærerens eneste styring er `active_domains` (kun historie). |
| **Pædagogiske metadata** (`concepts`, `misconception_type`, `cognitive_skill`, `difficulty_type`, `insight_type`, `challenge_role`) | LIVE (data), DELVIS (brug) | Bruges kun af bølgesorteringen. `concepts` er fri tekst. |
| **Lærerindsigt** | LIVE, tynd | Første forsøg i %, seneste 20, trend, afledt bånd, %-pr.-domæne og engagement. Ingen misopfattelser, begreber eller fagniveau. "Level" på elevsiden læser en kolonne, der ikke vedligeholdes. |
| **Lærerfeedback til eleven** (`get-reviewed-answers`) | DØD | Ingen UI kalder den. |
| **Lange svar til lærervurdering** | LIVE-vej, ubrugt | 0 aktive spørgsmål. `review-answer` kan give XP to gange (kendt, ROADMAP). |

### 2.2 Spørgebanken

- **Antal:** 2.143 spørgsmål, heraf 2.101 aktive. Næsten alle er multiple choice.
- **Fordeling på fag:**
  - Historie har 11 domæner på klassetrin 3–9.
  - Engelsk har ca. 1.090 opgaver, men kun klassetrin 3–5.
  - Dansk har 210 opgaver.
- **Andre former:** Stav til har 2 aktive opgaver (Polen og Norge). Begge er videnstest, ikke
  staveopgaver. Lange svar har 0. Tal er inaktive. Match par er bygget, men ikke servable.
- **Matematik findes ikke som fag** i Lærlig, hverken i kode, ROADMAP eller vision. Eksemplerne med
  matematik i dette dokument er derfor hypotetiske. Om matematik skal med, er beslutning LP-14.
- **Den planlagte engelske niveaubatch** (3.000 opgaver) er ikke i `main`.

### 2.3 Belønning og engagement (kort; detaljer i §7)

- **Korrekt svar:** Et korrekt første svar giver 10 XP + 5 mønter. En korrekt gentagelse giver
  2 XP + 1 mønt.
- **Forkerte svar tæller med:** Et forkert svar giver intet, men tæller med til streak, til
  quests af typen "svar 5"/"svar 20" og til ugens aktivitetsrangliste.
- **Login uden at svare:** Den daglige loginbelønning (25–150 mønter) kræver intet svar.
- **Ingen vagt mod hastighed og gæt:** Svartid gemmes ikke, og der er ingen grænse for, hvor hurtigt
  eleven kan svare.
- **Død belønningsmotor:** I `js/progression.js` kaldes event-motoren aldrig. Kun niveauberegningen
  bruges.

### 2.4 Dokumentationskonflikter (rapporteret og ikke rettet her, jf. CLAUDE.md)

| Dokument | Påstand | Virkelighed |
|---|---|---|
| `PROJECT_VISION.md` → Educational principles | "Spaced repetition: correct answers schedule a later review …" | Skrivningen er virkningsløs. Spaced repetition virker ikke i drift (§2.1). |
| `CLAUDE.md` → Progression engine | Event-drevet motor (`MC_CORRECT`, `TEXT_APPROVED` …) | Kun `calculateLevelFromXP` bruges. Belønninger er server-RPC'er med andre beløb. |
| `ARCHITECTURE.md` | `reset-student` "Reset progress"; gnq "version 179"; 157P "awaiting approval" | `reset-student` nulstiller intet. gnq er v180. 157P er live. |
| `D-273.md` | PR #494 "draft" | #494 er merget. |

Konflikterne bør rettes i en særskilt dokumentations-PR. Det er ikke gjort her, fordi dokumentet kun
skal levere design.

### 2.5 Integritetsfund

Under auditten blev der fundet to steder, hvor belønningsrelevant tilstand kunne afgøres af klienten.
En read-only kontrol 2026-10-31 bekræftede adgangsvejene i produktionen. De lukkes i et separat
sikkerhedsspor (D-278, egen branch og PR). Detaljerne beskrives ikke her.

Fundene påvirker ikke læringsmodellen. Men belønningsændringer (§7, L7) må ikke bygges, før D-278
er anvendt.

FAKTA (samme kontrol): `profiles_self_update` lader eleven skrive `current_band` og
`placement_band`. Det er ikke en belønning. De to felter styrer kun det klientejede bånd, som
påvirker rækkefølgen i dagens v1-udvælgelse.

Serverens veje læser dem ikke:
- niveaumotoren henter sin startværdi fra den serverejede `placement_sessions`
  (`20261029120000_difficulty_scale_b.sql`);
- serverbåndet udelukker dem eksplicit (`server-band.ts`).

Felterne må derfor aldrig blive input til diagnostik, niveau eller mestring (§8.1, princip 2).

### 2.6 Åbne spørgsmål, der kræver et read-only produktionstjek

1. **Hemmeligheder:** Er `QUESTION_MIX_ENGINE` stadig `shadow`, og er `LEVEL_ENGINE` ikke sat?
2. **Versioner:** Er gnq stadig v180 og process-event v34?
3. **Rækkeantal:** Hvor mange rækker har `student_subject_level`, `student_level_fold_log`,
   `student_band_state` og `placement_sessions`?
4. **Misopfattelsessignal:** Andelen af besvarede rækker med `misconception_signal`. Det viser, om
   signalvejen faktisk er live.
5. **Spørgebankens fordeling:** pr. fag × klassetrin × bånd × format, og andelen med `review_text`,
   `misconception_type` og `concepts`.
6. **Placering på tværs af fag:** Hvor mange elever har taget placeringstesten i historie uden at
   have åbnet historie?

---

## 3. Forskningsgrundlag (sammenfatning, verificeret)

Alle tal i tabellen er kontrolleret mod primærkilden i
[learning-progression-source-verification.md](learning-progression-source-verification.md). Den fulde
gennemgang står i [bilaget](learning-progression-evidence.md).

**Gennemgående forbehold (FORSKNING).** Evidensen er tyndest for de yngste elever:
- **Agarwal m.fl. (2021):** Blandt 50 eksperimenter i klasserum var kun 5 fra elementary school og 12
  fra middle school. *Revision 1 skrev fejlagtigt "ingen fra indskolingen".*
- **Yang m.fl. (2021):** Quizzer har også effekt i elementary school, men den er mindre og mere
  usikker: g ≈ 0,33 (CI 0,09–0,57).
- **Laboratorieforskning:** Store dele er lavet med universitetsstuderende, fx Rowland 2014, Cepeda
  2008 og Karpicke & Roediger 2007.

Lærligs elever er ca. 8–16 år. Derfor er evaluering (§12) en del af planen.

| Emne | FORSKNING (verificeret) | Grænser | Konsekvens for designet (HYPOTESE/FORSLAG) |
|---|---|---|---|
| **Testeffekt (genkaldelse)** | I laboratoriet slår test genlæsning: g = 0,50, og 0,73 med feedback mod 0,39 uden (Rowland 2014, mest studerende). I klasserum er g = 0,50 mod alle kontroller, men g = 0,33 mod genlæsning (Yang m.fl. 2021). Effekten er fundet hos 4.-klasseelever (ca. 10 år) med ordlister og kort forsinkelse, uden feedback (Karpicke, Blunt & Smith 2016). | **Genkaldelse slår genkendelse kun i laboratoriet** (Rowland). I klasserum med feedback var der ingen forskel (Yang: 0,61 mod 0,54). Uden feedback og med ≤ 50 % rigtige på første test var der ingen effekt (Rowland: g = 0,03). | Test bliver en læringsaktivitet, når stoffet er mødt, og der gives feedback. Kravet om en "ikke-gættelig" opgave i mestringskriteriet begrundes **måleteknisk** (gætteloft, FAKTA), ikke med større læring. |
| **Multiple choice** | MC kan få eleven til at lære de forkerte svarmuligheder (Marsh m.fl. 2007). Feedback mindsker det (Butler & Roediger 2008). | Studerende | Vis altid det korrekte svar og en forklaring efter MC. |
| **Prætest** | Studerende lærer mere efter mislykkede forsøg, når svaret følger (Richland m.fl. 2009; Kornell m.fl. 2009). Hos **børn** hjalp mislykkede gæt efterfulgt af svaret fra børnehaveklasse til 3. klasse på ordpar, men ikke i førskolealderen (Carneiro m.fl. 2018). Hos 5–6-årige hjalp det på genkaldelse af moralen i historier, men ikke på generalisering (Foo m.fl. 2025). | Der er ingen fagfællebedømt evidens for faglige tekster i 4.–9. klasse. Et upubliceret speciale fandt negativ effekt i 2. og 5. klasse. | Diagnostik er tilladt, men skal være kort, have feedback efter hvert svar og give 0 XP. Den bruges forsigtigt i 1.–3. klasse (HYPOTESE). |
| **Spredning og søvn** | Spredt øvelse slår samlet (Cepeda 2006). Det optimale interval er ca. 20–40 % af den tid, stoffet skal huskes, ved 1 uge og ca. 5–10 % ved 1 år. For lange intervaller koster mindre end for korte (Cepeda 2008, voksne). Skal stoffet huskes 35 dage, er det optimale interval ca. 8–11 dage. Spredning hjalp også 5–7-årige (Vlach & Sandhofer 2012, N = 36). Søvn efter indlæring styrker deklarativ hukommelse (Gais m.fl. 2006), også hos 9–12-årige og når søvnen kommer senere (Backhaus m.fl. 2008). | Karpicke & Roediger 2007 målte spredning i antal forsøg **inden for én session**. Studiet siger intet om døgn. Ingen kilde angiver en grænse i timer. | "Det forsinkede tjek bør komme efter mindst én nats søvn" er underbygget af forskning. "≥ 20 t" er en **HEURISTIK**, der omsætter det til et skoleskema (§4.9). |
| **Præstation og læring** | Præstation under øvelsen er en upålidelig indikator for varig læring (Soderstrom & Bjork 2015). | — | Hovedbegrundelsen for, at mestring kræver et forsinket tjek. |
| **Interleaving** | g = 0,42 samlet, matematik 0,34 og ord −0,39 (Brunmair & Richter 2019). I 7. klasses matematik: 61 % mod 38 % rigtige, d = 0,83, test efter ≥ 1 måned (Rohrer m.fl. 2020; ét skoledistrikt). | Kræver, at typerne er mødt først. | Interleaving bruges i anvendelsesfasen, mest i matematik og ikke i gloser. |
| **Eksempler og nedtrapning** | Vejledning kan skade dem, der kan stoffet (expertise reversal; Kalyuga m.fl. 2003). Gradvis nedtrapning fremmer især nær transfer (Renkl & Atkinson 2003). | Det er uafklaret, hvornår der skal skiftes. | Introduktion med eksempel, og spring over for dem, der kan stoffet. |
| **Feedback** | Forklarende feedback 0,49, korrekt svar 0,32 og kun rigtigt/forkert 0,05 (van der Kleij m.fl. 2015, computerbaseret). **Effekterne var mindre i grundskolen.** d = 0,41, og over en tredjedel af interventionerne forringede præstationen (Kluger & DeNisi 1996). Forfatternes teori er, at det sker, når opmærksomheden flyttes fra opgaven til personen. Informationsrig feedback d = 0,99 (Wisniewski m.fl. 2020). | — | Forklarende, opgaverettet feedback. |
| **Hints** | God hjælpsøgning hænger sammen med bedre læring, men eleverne bruger ofte hjælpen ineffektivt (Aleven m.fl. 2003). At klikke sig igennem hints hænger sammen med mindre læring (Baker m.fl. 2004, korrelationelt, middle school). | At "et svar med hint tæller som forkert eller udelades" er en **almindelig praksis** i knowledge tracing (Chaudhry m.fl. 2018), ikke et eksperimentelt fund. | Hints er gratis i øvelsen, og svar med hint tæller ikke som mestring (konvention + HYPOTESE). |
| **Misopfattelser** | Tekster, der tilbageviser misopfattelser, har en konsistent fordel (Danielson m.fl. 2025; 76 studier af naturfaglige misopfattelser). | Aldersfordelingen er ikke verificeret. | Tilbagevisende feedback pr. forkert svarmulighed. |
| **Mestringskriterier** | **Hvilke svar der tæller, og hvor tærsklen sættes, betyder mere end valget af model.** Et eksponentielt glidende gennemsnit er et egnet kriterium (Pelánek & Řihák 2017). Kelly m.fl. 2015 (poster, ASSISTments, 37 elever i transferdelen): 3 korrekte i træk forudsagde den næste opgave godt, men højere N forudsagde transfer bedre. Mestringslæring har positive effekter (Kulik m.fl. 1990), men næsten ingen effekt på standardiserede test og ingen dokumenteret fastholdelse (Slavin 1987: median +0,04). Half-life regression forudsiger glemsel (Settles & Meeder 2016, Duolingo-data). | At "3 i træk er sårbart over for gæt" er **vores egen beregning** (FAKTA: kombinatorik), ikke et fund hos Kelly. | En gennemsigtig regel nu og kalibrering mod forsinket udfald senere (§4.9). |
| **Belønning** | Gamification: kognitiv g = 0,49, kun robust i stringente studier, motivation 0,36, adfærd 0,25 (Sailer & Homner 2020). Forventede, materielle belønninger svækker elevernes frie lyst til en interessant opgave (Deci, Koestner & Ryan 1999): mest når de gives for deltagelse (d = −0,40, børn −0,43), men også når de afhænger af præstation (−0,28). Materielle belønninger var mere skadelige for børn. | Debatten er stadig åben (Cameron & Pierce). | En mestringsbonus er **mindre skadelig** end belønning for deltagelse, men den er ikke neutral. Hold belønninger små og opgaverettede (§7.1). |
| **Spil og lærerens rolle** | Læreren skal skifte mellem roller for at facilitere spilscenarier (Hanghøj 2013; Hanghøj & Brund **2010**). Samarbejdsspil plus analog gamification øgede trivslen og mindskede oplevet ydre styring hos 32 udsatte elever (Hanghøj, Lieberoth & Misfeldt 2018). Dansk: Hanghøj 2012, "Spilscenarier i undervisningen – præsentation af en didaktisk model" (Læring & Medier nr. 9). | **"Spildidaktik" er ikke Hanghøjs begreb.** Han skriver om "spilscenarier" og "scenariedidaktik". Revision 1 tilskrev ham fejlagtigt begrebet. | Læreren skal have en rolle i forløbet (eksponering, tilsidesættelse, opfølgning på "brug for hjælp"). |
| **Dansk kontekst** | Færdigheds- og vidensmål har været vejledende siden 2017 (lov nr. 1445). De nationale tests resultater i læsning i 8. klasse 2017 var så usikre, at de er uanvendelige på elevniveau (Bundsgaard & Kreiner 2019; konklusionen er omstridt). | — | Præsenter aldrig et estimat som en præcis måling af eleven. |

---

## 4. Læringsmodellen (FORSLAG)

### 4.1 Grundbegreber: tre akser, der aldrig blandes

Det vigtigste i revision 2 er, at **tre forskellige spørgsmål** holdes adskilt. I revision 1 blev de
delvis blandet i én tilstand (`ikke_mødt`).

| Akse | Spørgsmål | Mulige værdier | Hvad systemet *ikke* må slutte |
|---|---|---|---|
| **Forhåndsviden** | Kunne eleven stoffet, før Lærlig mødte det? | `ukendt` (standard) · `påvist` (diagnostik bestået) | At en manglende påvisning betyder, at eleven ikke kan stoffet. |
| **Registreret eksponering** | Ved systemet, at eleven har mødt stoffet? | `ingen registreret` · `app` (indholdskort) · `lærer` ("gennemgået i klassen") | **At "ingen registreret" betyder "aldrig mødt".** Eleven kan have lært stoffet i klassen, hjemme, i en anden bog eller i et andet fag. Loggen kender kun det, der sker i appen, og det, læreren registrerer. |
| **Dokumenteret mestring** | Hvad har eleven *vist* under betingelser, der tæller som evidens? | `ikke påvist` · `formodet kendt` · `øver` · `klaret i dag` · `mestret` · `genopfrisk` (§4.3) | At "ikke påvist" er en vurdering af eleven. Det betyder kun, at evidensen mangler. |

**Niveau er en fjerde, separat størrelse.** *Niveau* (niveaumotoren 1–10.000 pr. fag) siger, hvor svært
stof der passer nu. *Mestring* siger, om eleven kan et bestemt læringsmål. Begge bruges til at vælge
næste aktivitet, men de blandes aldrig (§4.5).

| Begreb | Definition |
|---|---|
| **Læringsmål** | En lille enhed, der kan vurderes, fx "Kan forklare, hvorfor Danmark blev besat 9. april 1940". Hører til ét fag og ét emne (dagens `learning_objective`), har et niveauinterval på skalaen 1–10.000 og kan valgfrit kobles til Fælles Mål. |
| **Forudsætning** | En rettet kant mellem to læringsmål. Målene danner tilsammen en graf uden kredsløb. |
| **Indholdsenhed** | Vidensindhold uden score (tekst, kilde, billede, lyd, gennemarbejdet eksempel) med version og oplæsning. |
| **Opgave** | Et spørgsmål knyttet til 1–2 læringsmål med en *evidenstype* (§4.2). |
| **Aktivitetstilstand** | Den rolle, en opgave har, når den serveres: `diagnostik`, `øvelse`, `tjek`, `repetition` eller `anvendelse`. Formen bestemmer ikke fasen. |
| **Elevtilstand** | Afledt pr. elev og læringsmål: `fold(log)`. Den gemmes aldrig som den eneste sandhed (§4.3). |

### 4.2 Evidensmodellen

Modellen bruger **kategorier, ikke decimalvægte**. Den er deterministisk og kan forklares for
læreren.

**Evidenstyper (FORSLAG):**

| Evidenstype | Hvad den viser | Former |
|---|---|---|
| `genkendelse` | Eleven kan vælge det rigtige blandt givne muligheder. | MC, sandt/falsk, multi-select |
| `genkaldelse` | Eleven kan selv frembringe svaret. | Stav til, udfyld hul uden ordbank, tal, diktat |
| `struktur` | Eleven kan se sammenhænge og rækkefølger. | Match par, rækkefølge, kategorisering, byg sætning |
| `anvendelse` | Eleven kan bruge viden i en ny sammenhæng. | Kilde + spørgsmål, find fejlen, nyt regnestykke, hotspot |
| `forklaring` | Eleven kan begrunde. Vurderes af læreren. | Langt lærersvar |

**Et svar er kun mestringsevidens, når alle fem betingelser holder (FORSLAG):**
1. Aktivitetstilstanden er `tjek`, `repetition` eller `anvendelse`. **Aldrig `diagnostik` og aldrig
   `øvelse`.**
2. Der er ikke brugt hints.
3. Opgaven er **evidensgyldig**: den har bestået den statiske validering og er ikke markeret som
   mistænkt tvetydig (se nedenfor).
4. Det er ikke en gentagelse af samme opgave inden for 24 t. Det ville måle hukommelse for opgaven,
   ikke for målet (HYPOTESE, støttet af Yang m.fl. 2021: omformulerede spørgsmål g = 0,56 mod
   identiske).
5. Svaret er ikke markeret som "muligt gæt". Det kræver logning af svartid (§8.2) og en tærskel pr.
   form (HEURISTIK).

**Gætteloft (FAKTA: kombinatorik ved tilfældigt valg, og ved delvis viden):**

| Form | Rent gæt | Med delvis viden | Evidens i `tjek` |
|---|---|---|---|
| Sandt/falsk | 50 % | — | **Ingen** (kun ruteinformation) |
| MC, 4 muligheder | 25 % | 50 % med 2 elimineret, 100 % med 3 | **Svag.** Tæller kun sammen med en stærk opgave. |
| Multi-select, k = 4 | 1/15 ≈ 6,7 % | stiger hurtigt | Middel |
| **Match par**, n par | Nøglen er **aldrig** "lige over" (`_shared/match-pairs.ts:25`). En elev, der kender reglen, har 1/(n! − 1): **n = 2 → 100 %**, n = 3 → 20 %, n = 4 → ≈ 4,3 %, n = 5 → ≈ 0,8 %. | Kender eleven n − 2 par, er der højst 2 muligheder tilbage (≥ 50 %). Ved n = 3 er resten givet, hvis det kendte par står lige over (fordi identiteten er udelukket). | **Ingen ved n ≤ 3. Stærk ved n ≥ 4, og kun ved alle par rigtige.** |
| Rækkefølge, n emner | 1/n! (n = 4: 4,2 %, n = 5: 0,8 %) | Kender eleven n − 2 placeringer: 50 % | Stærk ved n ≥ 4 |
| Kategorisering, n emner i c kategorier | c⁻ⁿ | — | Stærk ved n ≥ 4 |
| Stav til / udfyld hul / tal | ≈ 0 | — | Stærk, hvis bedømmelsen er korrekt (se nedenfor) |

**Delvis korrekte svar (FORSLAG):** Belønningen forbliver binær (ejerbeslutning). Evidensen kan
skelne mellem tre tilfælde:

| Svar | Evidens |
|---|---|
| Alt rigtigt | Fuld evidens (efter tabellen) |
| Delvis rigtigt (fx 3 af 4 par, 2 af 3 huller, ét nabobyt i en rækkefølge) | **Ingen mestringsevidens og ingen negativ evidens.** Det bruges til at finde, *hvilken* del der fejler, og om det svarer til en kendt misopfattelse. Feedbacken går på den del. |
| Alt forkert | Negativ evidens i `tjek` og `repetition` (§4.3) |

At bruge delresultater som evidens er beslutning LP-7.

**Tvetydige opgaver (FORSLAG):** En opgave kan være dårlig uden at nogen ved det. Den skal derfor
kunne miste sin evidensgyldighed:
1. **Statisk validering, før en opgave er evidensgyldig (FAKTA: kan tjekkes maskinelt):**
   - facit er en af svarmulighederne;
   - svarmulighederne er forskellige *efter* den normalisering, bedømmelsen bruger;
   - talopgaver bruger en numerisk evaluator;
   - Match par til `tjek` har n ≥ 4;
   - ingen svarmulighed er facit med et ekstra ord.
2. **Statistisk mistanke (HEURISTIK):** Opgaven markeres som *mistænkt tvetydig*, når den har ≥ 10
   svar og et af følgende gælder:
   - elever, der har `mestret` målet, fejler den i ≥ 40 % af tilfældene;
   - én distraktor vælges oftere end facit af elever, der har `mestret` målet.
3. **Lærerens markering:** Læreren kan markere en opgave som "forkert eller uklar".
4. **Konsekvens:** Mens markeringen står, bruges opgavens svar **hverken som positiv eller negativ**
   evidens. Elevtilstandene genberegnes (§4.3). Opgaven kan stadig bruges i øvelsen med feedback, og
   den sættes i kø til gennemsyn hos personalet.

**Fejl i bedømmelsen (FAKTA, læst i koden):** De to bedømmelsesveje opfører sig forskelligt.

| Vej | Normalisering | Konsekvens for evidens |
|---|---|---|
| `process_text_answer` via `isTextAnswerCorrect` (Stav til) | NFC, små bogstaver, typografiske apostroffer og mellemrum normaliseres. **Bogstaver fjernes aldrig** (æ ≠ ae). Kun eksakt match mod `correct` og `accepted_answers` (`_shared/answer-evaluation.ts`). | Egnet som evidens. Det skal kun sikres, at `accepted_answers` dækker de gyldige stavemåder. |
| `process_question_attempt` (MC, tal, `force_text`, Match par) | `lower()` og derefter fjernes **alt uden for `[a-z0-9]`** (`20261027120000…sql:91-96`) | **Uegnet til tal og fri tekst.** Følgende bedømmes som ens: "1,5" og "15", "−5" og "5", "1/2" og "12", "1 000" og "1000" *(udledt)*, samt svarmuligheder, der kun adskiller sig ved æ/ø/å. For MC er det kun et problem, når to svarmuligheder falder sammen efter normaliseringen. Det fanger den statiske validering. For Match par er nøglen cifre og kolon, så den er upåvirket. |

**Krav (FORSLAG):** Tal og `force_text` bruges ikke som mestringsevidens, før bedømmelsen er rettet
(L1). MC-opgaver er evidensgyldige, når den statiske validering er bestået.

### 4.3 Elevtilstand pr. læringsmål (mestringsaksen)

| Tilstand | Betydning | Typisk næste aktivitet |
|---|---|---|
| `ikke_påvist` | Ingen mestringsevidens. **Siger intet om, hvad eleven kan**, og intet om, hvorvidt eleven har mødt stoffet. | Diagnostik (hvis ikke afprøvet) eller introduktion |
| `formodet_kendt` | Diagnostikken er bestået (§4.5). Endnu ikke bekræftet. | Forsinket `tjek` |
| `øver` | Eksponering er registreret, og øvelsen er i gang. Ingen eller utilstrækkelig evidens. | Øvelse → selvstændigt `tjek` |
| `klaret_i_dag` | Kriteriet for samme dag er opfyldt (§4.6). | Forsinket `tjek` |
| `mestret` | Kriteriet for forsinket mestring er opfyldt. | Repetition efter plan (§4.7). Låser afhængige mål op. |
| `genopfrisk` | En repetition fejlede, eller planen er overskredet. | Kort genkaldelse med feedback |

Eksponering er **ikke** en tilstand. Den er en egenskab (§4.1), som ruten bruger:
- `ikke_påvist` uden registreret eksponering giver introduktion.
- `ikke_påvist` *med* registreret eksponering giver ikke introduktion igen, men kort opsummering og
  øvelse, fordi læreren eller appen allerede har undervist.

**Flag:**
- `misopfattelse:<type>`:
  - sættes ved en distraktor, der er koblet til en misopfattelse, valgt ≥ 2 gange i øvelse eller 1
    gang i `tjek`/`repetition`;
  - ophæves af et korrekt, uassisteret svar på en opgave, der tester samme misopfattelse;
  - **sættes aldrig alene på grund af diagnostiske svar**, men de kan foreslå, hvilken misopfattelse
    øvelsen skal tage fat på.
- `brug_for_hjælp`: 3 forkerte svar i øvelse i samme mål i én session. Eleven skifter mål, og
  læreren får besked. Der er ingen blindgyde.
- `klar_til_udfordring` (afledt): målet er `mestret`, og fagniveauet ligger over målets interval.

**Overgange (FORSLAG, deterministiske). Kun svar i `tjek` og `repetition` kan flytte tilstanden
nedad:**

```
ikke_påvist ──diagnostik bestået──▶ formodet_kendt ──forsinket tjek OK──▶ mestret
     │                                    │ forsinket tjek fejler (rute: øvelse; ingen "dom")
     │ eksponering (app/lærer) + øvelse   ▼
     └──────────────────────────────▶ øver ──kriterium samme dag──▶ klaret_i_dag ──forsinket tjek OK──▶ mestret
                                       ▲                                 │ tjek fejler                   │
                                       │ 2× genopfrisk fejler            ▼                               │ repetition fejler
                                       └──────────────────────────── (tilbage til øver) ◀── genopfrisk ◀─┘
                                                                                             │ OK
                                                                                             └──▶ mestret (kortere interval)
```

**Tilstanden er en ren funktion af loggen.** Ændres reglerne, genberegnes tilstanden ved at spille
loggen igen. Intet slettes, og den dokumenterede mestringshistorik forsvinder aldrig. At en
repetition fejler, ændrer kun den *nuværende* tilstand.

### 4.4 De seks elevsituationer

| Situation | Hvordan modellen ser den | Forløb (FORSLAG) |
|---|---|---|
| **Kan allerede stoffet** | Diagnostikken er bestået. | Springer introduktionen over (expertise reversal). `formodet_kendt`, og et forsinket `tjek` på en *anden* opgave bekræfter. Består eleven, er målet `mestret` uden øvelse. |
| **Har ikke mødt stoffet** (systemet kan ikke vide det) | `ikke_påvist`, ingen registreret eksponering, diagnostikken ikke bestået | Introduktion → øvelse → `tjek` → forsinket `tjek`. Feedbacken siger "Det kigger vi på nu", **ikke** "det har du ikke lært". Har eleven faktisk mødt stoffet uden for appen, går øvelsen hurtigt. |
| **Forstår stoffet delvist** | Blandet diagnostik, delvis korrekte svar eller rigtig genkendelse men forkert genkaldelse | Kort opsummering i stedet for fuld introduktion. Øvelse i den evidenstype, der mangler. |
| **Har en misopfattelse** | Flaget `misopfattelse` (§4.3) | Tilbagevisende feedback og en målrettet opgave. Mestring er blokeret, indtil flaget er ophævet. Læreren ser flaget. |
| **Har lært noget, men glemt det** | En repetition fejler, eller planen er overskredet | `genopfrisk`: kort genkaldelse med forklaring. Lykkes den, tilbage til `mestret` med et kortere interval. To fejl giver kort genintroduktion. Historikken bevares. |
| **Klar til større udfordringer** | `klar_til_udfordring` | `anvendelse` på højere niveau, interleaving eller næste mål. Klassetrinnet er intet loft (ejerens retning). |

### 4.5 Diagnostik: aldrig negativ for mestring eller niveau

**Ejerens krav:** Diagnostik må komme før introduktion. Et forkert svar på ukendt stof må ikke tolkes
som dokumenteret manglende mestring. Revision 2 skærper kravet: **fejl i diagnostikken påvirker
aldrig mestring eller niveau negativt, heller ikke hvis undervisning er registreret.**

Begrundelsen er, at en registreret eksponering ikke garanterer, at stoffet er lært. Diagnostikken er
netop *spørgsmålet* om, hvad eleven kan nu. Den er ikke en prøve, der kan dumpes. Negativ evidens
skal komme fra et `tjek`, som eleven møder *efter* øvelse, og som er framet som et tjek.

**Regler (FORSLAG):**
1. **Form:** 2 opgaver pr. mål (HEURISTIK) af forskellige former. Mindst én er `genkaldelse` eller
   `struktur` med gætteloft ≤ 5 %. Ingen hints, ingen XP og en neutral tekst: "Vi tjekker, hvad du
   allerede ved. Det er helt fint ikke at vide det."
2. **Feedback efter hvert svar:** Det korrekte svar og én sætning. (FORSKNING: uden feedback og med
   lav succesrate giver en første test ingen effekt, Rowland 2014. Prætesteffekten forudsætter, at
   svaret følger, Kornell m.fl. 2009 og Carneiro m.fl. 2018.)
3. **Asymmetri:** Diagnostiske svar kan kun *påvise*, aldrig *modbevise*.
   - Begge rigtige og evidensgyldige: `formodet_kendt`, der bekræftes ved et forsinket `tjek`.
   - Alt andet: tilstanden er uændret (`ikke_påvist`), og svarene bruges kun til at vælge rute
     (introduktion, kort opsummering eller hvilken misopfattelse øvelsen skal tage fat på).
4. **Niveau:** Niveaumotorens fold udelukker `diagnostik`, `øvelse` og assisterede svar (FORSLAG,
   LP-5). Diagnostikken må kun bruges til at sætte et *startniveau* efter en retningsbestemt regel:
   - rigtige svar kan flytte startniveauet op;
   - forkerte svar stopper kun opstigningen og flytter aldrig ned under den serverafledte start for
     klassetrinnet.

   Det svarer til den "retningsbestemte evidensregel" i P-forslaget for måle-spørgsmål pr. fag
   (`docs/subject-placement-design`, ikke merget).
5. **Stopregel:** Diagnostikken stopper efter 2 forkerte i træk inden for et emne (HEURISTIK). Resten
   forbliver `ikke_påvist`, og ruten bliver introduktion.
6. **1.–3. klasse:** Kun 1 opgave pr. mål, og kun hvis læreren slår det til (HYPOTESE: børnestudierne
   viser gavn fra børnehaveklasse til 3. klasse på ordpar, men der er ingen evidens for fagstof).
7. **Gentagen diagnostik:** Et mål, der er afprøvet diagnostisk, testes ikke diagnostisk igen. Næste
   skridt er undervisning, så gentagne "prøver" ikke kan opleves som nederlag.

**Hvad betyder det for `tjek`?** Et forkert svar i `tjek` er ikke en dom, men det tæller. Det betyder
"endnu ikke påvist" (`klaret_i_dag` nås ikke) eller "genopfrisk" (i `repetition`). Det sletter aldrig
tidligere dokumenteret mestring fra historikken.

### 4.6 Mestringskriteriet: begrundelse og status

**Samme dag (`klaret_i_dag`, FORSLAG):** 2 korrekte, uassisterede, evidensgyldige svar i `tjek` på 2
forskellige opgaver. Mindst ét af dem skal være genkaldelse, struktur med gætteloft ≤ 5 % eller
anvendelse. Der må ikke være et aktivt misopfattelsesflag.

**Mestring (`mestret`, FORSLAG):** Også ét korrekt, uassisteret svar i `tjek` på en opgave, der ikke er
set samme dag, givet mindst 20 timer efter seneste eksponering eller øvelse.

| Del af kriteriet | Begrundelse | Status |
|---|---|---|
| **Forsinket tjek** | Præstation under øvelse er en upålidelig indikator for læring (Soderstrom & Bjork 2015). Testeffekten er større ved ≥ 1 dags interval (Rowland 2014). Mestringseffekter uden forsinket måling holder ikke (Slavin 1987). | **FORSKNING** (princippet) |
| **≥ 20 t** | Det skal sikre mindst én nats søvn mellem læring og tjek (FORSKNING: Gais 2006; Backhaus 2008, 9–12-årige). Det passer også til skoleskemaet (næste dags lektion), og et interval på ca. 1 dag er tæt på det optimale, hvis stoffet skal holde en uge (Cepeda 2008). Ingen kilde angiver et timetal. | **HEURISTIK**, pilotparameter |
| **Forskellige opgaver** | Samme opgave igen måler hukommelse for opgaven. Effekten overføres til omformulerede spørgsmål (Yang m.fl. 2021). | Princippet: **FORSKNING**. Tallet "2": **HEURISTIK** |
| **Én ikke-gættelig opgave** | Med 2 MC-opgaver (50 % hver efter delvis eliminering) er sandsynligheden for falsk mestring 25 % (FAKTA: kombinatorik). Begrundelsen er måleteknisk, ikke at genkaldelse giver mere læring (i klasserum er der ikke fundet forskel, Yang m.fl. 2021). | **FAKTA + HEURISTIK** |
| **Ingen hints** | Det er almindelig praksis i knowledge tracing (Chaudhry m.fl. 2018). Gaming hænger sammen med mindre læring (Baker 2004). | **Konvention + HYPOTESE** |
| **Intet aktivt misopfattelsesflag** | Tilbagevisning virker (Danielson m.fl. 2025). En elev med en misopfattelse kan svare rigtigt af andre grunde. | **HYPOTESE** |
| **Regelmodel frem for BKT/Elo nu** | Hvilke svar der tæller, og tærsklen, betyder mere end modellen (Pelánek & Řihák 2017). Med 10–100 elever er der for lidt data til at fitte BKT pålideligt (identificerbarhed). | **FORSKNING + HYPOTESE** |

**Falsk mestring ved rent gæt (FAKTA):**
- **Tilfældigt gæt:** Med kravet om en ikke-gættelig opgave kan en elev, der gætter tilfældigt,
  praktisk taget ikke nå `klaret_i_dag`.
- **Dagens implicitte regel til sammenligning:** "3 rigtige i træk" på MC med 4 muligheder giver
  1,6 % ved rent gæt og 12,5 % med delvis viden.
- **Acceptkriterium (A6):** Simulerede gættere må nå `mestret` i < 1 % af målene.

**Falsk ikke-mestring:** Tvetydige opgaver og bedømmelsesfejl giver forkerte "fejl". Afbødning:
- evidensgyldighed (§4.2);
- genberegning efter rettelser;
- læreren kan tilsidesætte tilstanden, logget som `lærervurdering`, og har det sidste ord.

### 4.7 Repetition og glemsel

| Situation | Interval | Status |
|---|---|---|
| `klaret_i_dag` eller `formodet_kendt` → forsinket tjek | ≥ 20 t | HEURISTIK (se §4.6) |
| `mestret` → repetition | 7 → 30 → 90 dage | **HEURISTIK** i tråd med FORSKNING: det optimale interval vokser med, hvor længe stoffet skal holde (ca. 8–11 dage ved 35 dage), og for lange intervaller koster mindre end for korte (Cepeda 2008). Om intervallerne skal vokse eller være lige store, er ikke afgjort. |
| Repetition fejler | `genopfrisk`, og efter bedring et halveret interval | HEURISTIK (ingen kilde) |

Repetitioner fylder højst ca. en tredjedel af en session (HEURISTIK). Når der er data nok, kan en model
af typen half-life regression erstatte de faste tal (Settles & Meeder 2016). Den kræver dog meget
logdata, så det er tidligst efter piloten.

### 4.8 Determinisme og forklarlighed

- **Ingen tilfældighed** i tilstand, mestring eller belønning (PROJECT_VISION). Opgavevalget bruger
  deterministiske tie-breaks.
- **Forklaring:** Hver ændring af tilstanden har en forklaring, der kan vises for læreren, fx
  "Mestret 4. nov.: korrekt uden hjælp på udfyld hul (3. nov.) og tidslinje (4. nov., 22 t efter
  øvelse)".
- **Ingen AI i vurderingen:** AI kan foreslå indhold og feedbacktekst, men indgår aldrig i
  beregningen af tilstanden.

### 4.9 Pilotparametre og kalibrering (FORSLAG)

Alle tal i §4.2–§4.7 er **pilotparametre**. De samles ét sted, versioneres i D-registret og kalibreres
efter faste regler:

| Parameter | Startværdi | Signal, der kalibrerer den |
|---|---|---|
| Forsinkelse før `mestret` | ≥ 20 t | Falsk mestring (se nedenfor) mod tid til mestring |
| Antal forskellige opgaver | 2 (+ 1 forsinket) | Falsk mestring |
| Gætteloft for "ikke-gættelig" | ≤ 5 % | Falsk mestring pr. form |
| Match par i `tjek` | n ≥ 4 | Falsk mestring for Match par |
| Diagnostik: opgaver og stop | 2 / stop efter 2 forkerte | Andelen af `formodet_kendt`, der fejler bekræftelsen. Frafald i diagnostikken. |
| Repetitionsintervaller | 7/30/90 dage, halvering ved fejl | Succesrate pr. interval |
| Tvetydighed | ≥ 10 svar, ≥ 40 % fejl blandt `mestret` | Andelen af markerede opgaver, der ved gennemsyn faktisk var fejlbehæftede |
| `brug_for_hjælp` | 3 forkerte i én session | Lærernes vurdering af, om markeringerne var relevante |

**Metode:**
1. **Udfaldsmål, der ikke indgår i kriteriet:** Holdt-tilbage-opgaver 7 og 30 dage efter `mestret`.
   De er korte, giver ingen belønning og bruges kun til måling (§12).
2. **Nøgletal:**
   - *falsk mestring* = andelen af `mestret`, hvor første forsinkede holdt-tilbage-opgave fejler;
   - *unødig repetition* = andelen af repetitioner, der lykkes for elever, hvis tre forrige
     repetitioner af samme mål også lykkedes;
   - *tid til mestring* (median).
3. **Afprøvning af alternative regler på historikken:** Fordi tilstanden er en fold af loggen, kan
   alternative kriterier spilles igen på de samme data uden at påvirke eleverne. Det gælder fx 3 i
   stedet for 2 opgaver, 2 nætter i stedet for 1 og et eksponentielt glidende gennemsnit (Pelánek &
   Řihák 2017). Kriterierne sammenlignes på, hvor godt de forudsiger holdt-tilbage-udfaldet.
4. **Beslutningsregler, fastlagt før data (HEURISTIK):**
   - Er falsk mestring > 20 %, skærpes kriteriet (flere opgaver eller længere forsinkelse).
   - Er falsk mestring < 5 %, og er tid til mestring høj, lempes det.
   - Er unødig repetition > 90 %, forlænges intervallerne.
   - Der ændres ikke på færre end 30 hændelser pr. parameter. Ved så små tal rapporteres usikkerheden.
5. **Hver ændring** registreres som en ny D-fil med begrundelse, og tilstandene genberegnes. Ingen
   parameter ændres stille.

---

## 5. Den konkrete progression (FORSLAG)

### 5.1 Aktivitetstilstande

| # | Tilstand | Hvad eleven møder | Former (typisk) | Feedback | Hints | Evidens | Udgang |
|---|---|---|---|---|---|---|---|
| 0 | **Diagnostik** | 2 korte opgaver pr. mål. Framet som "hvad ved du allerede?" | Én genkaldelse/struktur + én anden | Korrekt svar + én sætning | Nej | Kun positiv påvisning. Fejl bruges kun til at vælge rute og sænker aldrig mestring eller niveau (§4.5). | `formodet_kendt`, eller uændret `ikke_påvist` |
| 1 | **Introduktion** | 1–3 korte indholdskort (tekst ≤ 80 ord, billede, kilde, lyd eller eksempel) med oplæsning, afsluttet af ét indbygget forståelsestjek | Indholdskort + sandt/falsk eller MC | Forklarende | Ja | Ingen (eksponering registreres) | Eksponering = `app`, derefter øvelse |
| 2 | **Guidet øvelse** | Opgaver med stilladsering: genkendelse før genkaldelse, eksempel med nedtrapning (matematik), hints i trin | MC, sandt/falsk, Match par, udfyld hul med ordbank, rækkefølge med ankerpunkt | Forklarende, også ved korrekt svar. Tilbageviser misopfattelser | Ja, i 3 trin (§5.4) | Svag. Assisterede svar tæller 0 | `øver` → selvstændig genkaldelse |
| 3 | **Selvstændig genkaldelse (tjek)** | Opgaver uden hints, nye opgaver | Stav til, udfyld hul, tal, rækkefølge (n ≥ 4), Match par (n ≥ 4) | Korrekt svar + forklaring efter svaret | Nej | Fuld | `klaret_i_dag` |
| 4 | **Repetition** | Forsinket genkaldelse, blandet med andre mål | Som 3, gerne en anden form end sidst | Som 3 | Nej | Fuld + glemselsdata | `mestret` / `genopfrisk` |
| 5 | **Anvendelse** | Ny sammenhæng, højere niveau, interleaving | Kilde + spørgsmål, find fejlen, kategorisering, hotspot, langt lærersvar | Forklarende. Læreren ved lange svar | Ja, men markeret | `anvendelse`/`forklaring` | `klar_til_udfordring`, næste mål |

**En session (FORSLAG):** Den starter i hubben (ejerens beslutning: hubben er altid startsiden).
Eleven vælger fag, og systemet sammensætter en session af
1. forfaldne repetitioner,
2. igangværende mål og
3. ét nyt mål, når forudsætningerne tillader det.

Introduktion af nyt stof sker højst for 1–2 mål pr. session, så den kognitive belastning holdes nede
(HYPOTESE).

### 5.2 Læringsmål og forudsætninger knyttes til indholdet

- **Mål pr. emne:** Hvert emne (fx historiedomænet `wwii_occupation_*` eller engelsk "past simple")
  får 5–15 læringsmål med kode, titel, beskrivelse, niveauinterval og en valgfri Fælles Mål-reference.
- **Forudsætninger:** De angives som kanter mellem mål. Grafen valideres for kredsløb i en unit-test.
- **Opgaver:** Hver opgave kobles til 1–2 mål med evidenstype. Hver forkert svarmulighed kan få en
  `misopfattelse` med en tilbagevisende feedbacktekst. Det udvider dagens `misconception_type` pr.
  opgave til pr. svarmulighed.
- **Indholdsenheder:** De hører til ét mål og har version, så eksponering refererer til en bestemt
  version.
- **Forfatterarbejdet** er den største omkostning. Derfor starter vi med ét pilotforløb pr. fag (§10).
  AI må gerne foreslå målinddeling og indholdsudkast, men et menneske godkender (AI_GUIDELINES).
- **Eksisterende metadata:** `concepts`, `misconception_type` og `review_text` på de 2.101 aktive
  opgaver genbruges som udgangspunkt for koblingen. Det kan delvis automatiseres med
  menneskelig godkendelse.

### 5.3 Registrering af introduktion

En **eksponering** logges, når eleven har
1. vist indholdskortene for et mål og
2. besvaret det indbyggede forståelsestjek (uanset om svaret var rigtigt).

Tiden på siden bruges ikke som kriterium, fordi den er let at snyde og siger lidt om læring.

**Læreren kan registrere eksponering:** "Gennemgået i klassen" for et mål eller et emne, for hele
klassen eller udvalgte elever. Lærerens undervisning tæller altså som introduktion, og appen
gentager den ikke unødigt (Hanghøj: lærerens rolle i spilbaseret undervisning).

En genintroduktion efter `genopfrisk` logges som en ny eksponering, men den gamle forsvinder ikke.

### 5.4 Feedback og hints i vurderingen af mestring

**Hint-trin (FORSLAG):**

| Trin | Hvad hintet gør |
|---|---|
| H1 | Retter opmærksomheden: "Læs spørgsmålet igen – hvad bliver der spurgt om?" |
| H2 | Giver en strategi: eliminerer én svarmulighed, peger på kilden eller viser første trin |
| H3 | Afslører svaret ("bottom-out") |

**Regler:**
- Et hint kan tidligst vælges, når eleven har svaret én gang eller har set opgaven i 10 sekunder. Det
  dæmper klik-gennem (Baker m.fl. 2004).
- Et svar med et hint på H1–H2 er "assisteret": det tæller som øvelse (ruten fortsætter), men ikke som
  mestringsevidens.
- Et svar efter H3 tæller som set svar. Opgaven kommer igen senere, og en *anden* opgave på samme mål
  sættes i kø.
- Hints koster **ikke** XP i øvelsen. Hjælpsøgning skal være billig (Aleven m.fl. 2003). Gevinsten
  ved at klikke sig igennem er lav, fordi den store belønning ligger i mestring (§7).

**Feedback:**
- I øvelsen får eleven altid en forklaring, også ved korrekt svar (én sætning: hvorfor).
- I tjek og repetition får eleven en verifikation, det korrekte svar og en forklaring.
- Feedback er altid opgaverettet. Der er ingen formuleringer som "du er dygtig" eller "du fejlede"
  (Kluger & DeNisi; PROJECT_VISION "never-negative").

### 5.5 Gå videre og gå tilbage

| Regel (FORSLAG) | Udløser | Handling |
|---|---|---|
| Videre til selvstændig genkaldelse | 2 korrekte, uassisterede svar i guidet øvelse | Skift til tilstanden `tjek` |
| Nyt mål låses op | Alle forudsætninger er mindst `klaret_i_dag` | Målet kan introduceres |
| Undervis igen (kort) | 2 forkerte i træk i guidet øvelse efter introduktionen | Vis en alternativ repræsentation eller et eksempel, og gå tilbage til H-trinnene |
| Stop og skift | 3 forkerte i samme mål i én session | `brug_for_hjælp`, skift til et mestret mål, giv læreren besked |
| Undervis forudsætning | Fejl i `tjek` på et mål, hvis forudsætning er `genopfrisk` eller `ikke_påvist` | Gå til forudsætningen først |
| Genintroduktion | 2 fejlede `genopfrisk` | Kort genintroduktion (ny eksponering) → `øver` |
| Udfordring | `klar_til_udfordring` | Tilbyd `anvendelse` eller et højere niveau. Eleven kan sige nej. |

### 5.6 Læring over tid i stedet for antal rigtige svar

| Mål (FORSLAG) | Definition | Hvorfor |
|---|---|---|
| **Fastholdelsesrate** | Andelen af forsinkede tjek og repetitioner, der lykkes, pr. mål og pr. interval | Måler læring frem for præstation under øvelsen (FORSKNING: Soderstrom & Bjork 2015). |
| **Mestrede og fastholdte mål** | Mål, der er `mestret` og bestod den seneste repetition | Erstatter "antal rigtige" i lærerens og elevens visning. |
| **Falsk mestring** | Andelen af nyligt mestrede mål, hvor første repetition fejler | Overvåger, om kriteriet i §4.6 er for løst. |
| **Unødig repetition** | Andelen af repetitioner, der lykkes uden fejl gennem hele planen | Overvåger, om intervallerne er for korte. |
| **Tid til mestring** | Median-tid og antal opgaver fra første registrerede eksponering til `mestret` | Til indholdsforbedring (tunge mål). |
| **Misopfattelsesforløb** | Andelen af misopfattelsesflag, der bliver ophævet | Måler, om feedbacken virker. |

Alle mål kræver svarloggen (§8.2). Uden den kan ingen af dem beregnes.

### 5.7 Eksempler

#### Historie: Besættelsen 9. april 1940 (klassetrin 6–7)

Læringsmål med forudsætninger:

| Kode | Læringsmål | Forudsætning |
|---|---|---|
| H1 | Kender de vigtigste parter i 2. verdenskrig | — |
| H2 | Ved, hvornår og hvordan Danmark blev besat | H1 |
| H3 | Kan forklare samarbejdspolitikken og hvorfor den blev valgt | H2 |
| H4 | Kan placere besættelsens hovedbegivenheder i rækkefølge | H2 |

| Fase | Konkret (H2 og H4) |
|---|---|
| Diagnostik | Stav til: "Hvilket land besatte Danmark 9. april 1940?" (genkaldelse; en af dagens live-opgaver kan genbruges). Match par med 4 par (dato ↔ begivenhed, struktur). Fejler eleven, gives korrekt svar + én sætning. H2 forbliver `ikke_påvist`, og ruten bliver introduktion. Det registreres ikke som manglende viden. |
| Introduktion | Kort tekst med oplæsning + et foto fra 9. april + kort over troppernes vej. Afsluttes med sandt/falsk: "Danmark erklærede Tyskland krig" → falsk. |
| Guidet øvelse | MC med svarmuligheder koblet til misopfattelser. Fx vælger eleven "Danmark kæmpede i flere uger" → misopfattelsen `langvarig_kamp` → tilbagevisende feedback: "Mange tror, at Danmark kæmpede længe. Faktisk varede kampene få timer, fordi …". Derefter tidslinje med ét ankerpunkt givet (H4). |
| Selvstændig genkaldelse | Udfyld hul: "Danmark blev besat den ___ april 19___". Tidslinje med 5 begivenheder uden ankerpunkt. |
| Repetition | Efter ≥ 20 t: en ny Stav til-opgave ("Hvilket land blev besat samme dag som Danmark?" → Norge, også en eksisterende opgave). Efter 7 dage: Match par med andre par. |
| Anvendelse | Kilde + spørgsmål: et uddrag af Stauning-regeringens proklamation. "Hvad fortæller kilden om, hvorfor regeringen valgte samarbejde?" (H3, MC eller langt lærersvar). |

#### Engelsk: Uregelmæssige verber i datid (klassetrin 4–5)

| Kode | Læringsmål | Forudsætning |
|---|---|---|
| E1 | Kender datid af regelmæssige verber (-ed) | — |
| E2 | Kender datid af 10 hyppige uregelmæssige verber (go, see, eat …) | E1 |
| E3 | Kan bruge datid korrekt i en sætning | E2 |

| Fase | Konkret |
|---|---|
| Introduktion | Tre gennemarbejdede eksempler med oplæsning (en-GB): "Today I go → Yesterday I went". En kort tabel. Forståelsestjek: MC "Yesterday I ___ to school" (go/goed/went/gone). |
| Misopfattelse | `goed` er koblet til `overregularisering`. Feedbacken lyder: "Mange verber får -ed, men *go* er uregelmæssig: *went*." Bemærk, at overregularisering er en normal udviklingsfase (HYPOTESE), så feedbacken er neutral. |
| Guidet øvelse | Match par med 4 par: grundform ↔ datid. Udfyld hul med ordbank. |
| Selvstændig genkaldelse | Udfyld hul uden ordbank: "Yesterday she ___ (see) a dog". Stav til: "Skriv datid af *eat*". |
| Anvendelse | Byg sætning ud fra ordbrikker. Find fejlen: "Last week we goed to London". |
| Note | Interleaving af ordmateriale virker dårligt (FORSKNING: g = −0,39, Brunmair & Richter 2019). Derfor blandes E2 med andre mål først i anvendelsesfasen og ikke i den guidede øvelse. |

#### Matematik (hypotetisk – faget findes ikke i Lærlig, se LP-14): Sammenligning af brøker (klassetrin 4–5)

| Kode | Læringsmål | Forudsætning |
|---|---|---|
| M1 | Ved, hvad tæller og nævner betyder | — |
| M2 | Kan sammenligne stambrøker (1/n) | M1 |
| M3 | Kan sammenligne brøker med samme tæller eller samme nævner | M2 |

| Fase | Konkret |
|---|---|
| Diagnostik | "Hvilken er størst: 1/4 eller 1/8?" (MC) + "Skriv den største brøk af 2/5 og 2/7" (tal). |
| Misopfattelse | Svaret "1/8, fordi 8 > 4" er koblet til `større_nævner_større_brøk`. Feedbacken er tilbagevisende og har en figur: en pizza delt i 8 giver mindre stykker end en pizza delt i 4. |
| Introduktion | Et gennemarbejdet eksempel med figur, efterfulgt af et eksempel, hvor det sidste trin mangler (nedtrapning, Renkl & Atkinson). |
| Guidet øvelse | Kategorisering ("større end ½" / "mindre end ½"). Rækkefølge af 4 brøker. Hint-trin H2: "Tegn brøkerne". |
| Anvendelse | Interleaving (FORSKNING: stærk effekt i et RCT i 7. klasses matematik, Rohrer m.fl. 2020; i metaanalysen er matematik g = 0,34): sammenligning blandet med forlængelse og afkortning. Tekstopgave: "Ali spiser 2/6 af en kage, Bo spiser 1/3. Hvem spiser mest?" |
| Bedømmelse | Kræver en rigtig numerisk evaluator (§4.2: `[a-z0-9]`-normaliseringen er uegnet). |

---

## 6. De 16 opgaveformer

Status og fakta stammer fra ROADMAP-tabellen og `interaction-kinds.ts`. Den pædagogiske analyse er
FORSLAG/HYPOTESE. **Ingen form er låst til én fase.** Tabellen angiver formens *primære* styrker.

| # | Form (status) | Læringsfunktion | Kognitiv proces | Feedback eleven bør få | Sværhedsjustering | Hints / stillads | Evidens for mestring | Kombination i forløb |
|---|---|---|---|---|---|---|---|---|
| 1 | **Stav til / kort tekst** (LIVE, 2 opgaver) | Genkaldelse og konsolidering | Genkalde | Korrekt stavemåde + elevens svar ved siden af (findes). Forklaring af stavereglen. | Ordlængde og frekvens, uden oplæsning eller ordbank | Første bogstav, antal bogstaver, oplæsning | **Stærk** (gætteloft ≈ 0) | Tjek efter MC-øvelse. Repetition. Diagnostik. |
| 2 | **Sandt/falsk** (PLANLAGT) | Forståelsestjek lige efter introduktion. Afklaring af misopfattelser. | Genkende/vurdere | Forklaring af *hvorfor* udsagnet er sandt eller falsk. Tilbagevisning. | Udsagnets subtilitet og omformuleringer | Fremhæv nøgleordet | **Svag** (50 %). Kun styring af ruten og eksponeringstjek. | Indbygget i introduktionen. Hurtig tjek af misopfattelser. |
| 3 | **Tal/årstal** (renderer findes, opgaver inaktive) | Genkaldelse (årstal), anvendelse (beregning) | Genkalde/anvende | Korrekt tal + regnemetode eller kontekst ("1940: året efter krigens start") | Størrelse, decimaler, antal trin | Første trin, overslag, tallinje | **Stærk**, når evaluatoren er rettet (§4.2) | Tjek, repetition, anvendelse i matematik |
| 4 | **Udfyld hul** (PLANLAGT) | Genkaldelse i kontekst. Overgang fra genkendelse. | Genkalde | Pr. hul: hvad der stod, og hvorfor | Antal huller, ordbank fra/til | Ordbank, første bogstav | **Stærk** uden ordbank. Svag med ordbank. | Guidet (med ordbank) → tjek (uden) |
| 5 | **Kilde + spørgsmål** (PLANLAGT, stimulus) | Introduktion (kilden som indhold) og anvendelse (fortolkning) | Anvende/analysere | Henvisning til stedet i kilden | Kildens sværhed og længde, spørgsmålstype | Fremhæv relevant passage | Afhænger af svarformen. Højst ved genkaldelse eller forklaring. | Introduktion og anvendelse i historie |
| 6 | **Billede + svar** (PLANLAGT, stimulus) | Introduktion (visuel forankring). Genkendelse. | Genkende/fortolke | Billedet med markering af det relevante | Detaljegrad | Zoom, markering | Afhænger af svarformen | Introduktion. Støtte for yngre elever. |
| 7 | **Lytteopgave** (PLANLAGT, stimulus) | Introduktion og forståelse (engelsk lytning). Tilgængelighed. | Forstå | Transskription efter svar | Tempo, accent, længde | Afspil igen, langsomt | Afhænger af svarformen | Engelsk og læsesvage elever. Bygger på 157P. |
| 8 | **Diktat** (PLANLAGT, kræver 1+7) | Genkaldelse af stavemåde | Genkalde/kode | Stavemåden + reglen | Ordets sværhed og hastighed | Afspil igen, stavelsesopdeling | **Stærk** | Dansk/engelsk stavning: tjek og repetition |
| 9 | **Multi-select** (PLANLAGT) | Afgrænsning af begreber ("hvilke er …?") | Genkende/klassificere | Pr. valgmulighed: hvorfor med eller ikke med | Antal muligheder og ligheden mellem dem | Antal rigtige oplyst | **Middel** (k = 4: 6,7 %). Binær bedømmelse. | Guidet øvelse og diagnostik |
| 10 | **Find fejlen** (PLANLAGT) | Afklaring af misopfattelser. Overvågning af egen forståelse. | Vurdere/anvende | Den rigtige form + reglen | Fejlens subtilitet og tekstlængde | Afgræns til en sætning | **Middel–stærk** (1/antal ord) | Anvendelse. Målrettet efter misopfattelsesflag. |
| 11 | **Byg sætning** (PLANLAGT) | Anvendelse af grammatik/syntaks | Konstruere | Den rigtige rækkefølge + mønsteret | Antal brikker og distraktorbrikker | Første brik givet | **Stærk** ved ≥ 5 brikker | Engelsk anvendelse |
| 12 | **Rækkefølge/tidslinje** (PLANLAGT) | Struktur og kronologi | Strukturere | Den rigtige rækkefølge med datoer eller årsager | Antal emner, tidsmæssig nærhed | Ankerpunkt givet | **Stærk** ved n ≥ 4 | Historie: guidet (ankerpunkt) → tjek |
| 13 | **Match par** (BYGGET, ikke servable) | Struktur og relationer. Begreb ↔ definition. | Relatere | Pr. par rigtigt/forkert (findes) + én sætning pr. forkert par | Antal par (2–6), ligheden mellem dem | Ét par låst fast | **Ingen** ved n ≤ 3: nøglen er aldrig "lige over", og ved delvis viden er resten ofte givet. **Stærk** ved n ≥ 4 og kun med alle par rigtige (§4.2). | Guidet øvelse (n = 2–3). Tjek kun ved n ≥ 4. |
| 14 | **Kategorisering** (PLANLAGT) | Begrebsdannelse og diskrimination | Klassificere | Pr. element: rigtig kategori og hvorfor | Antal elementer og kategorier, grænsetilfælde | Ét element placeret | **Stærk** ved n ≥ 4 | Guidet → anvendelse. Velegnet til interleaving. |
| 15 | **Hotspot/kort** (PLANLAGT) | Geografisk/visuel lokalisering | Genkende/lokalisere | Det rigtige område markeret | Områdets størrelse og antallet af områder | Zoom til region | **Middel** (afhænger af arealandelen) | Historie/geografi: introduktion og tjek |
| 16 | **Langt lærersvar** (FINDES, 0 opgaver) | Forklaring og ræsonnement | Forklare/vurdere | Lærerens feedback. **I dag når den ikke eleven** (`get-reviewed-answers` har ingen UI). | Spørgsmålets kompleksitet | Sætningsstartere | **Stærk** for `forklaring`, når læreren har vurderet. Forsinket. | Anvendelse og afslutning af forløb |

**Tværgående fund og forslag til formerne:**
- **Hvordan formen bedømmes, betyder lige så meget som formen selv (FAKTA, §4.2).**
  - Former, der går gennem `process_text_answer` og `isTextAnswerCorrect`, bevarer æøå og er egnede
    som evidens.
  - Former, der går gennem `process_question_attempt`, fjerner alt uden for `[a-z0-9]`. Det gælder
    tal, `force_text` og de planlagte svarformer med tal eller tegn.
  - Hver ny form skal derfor have en evaluator, der kan bruges som evidens, og en statisk
    validering, *før* den kan give mestringsevidens.
- **Delvis korrekte svar** (Match par, rækkefølge, udfyld hul med flere huller, multi-select,
  kategorisering) giver aldrig mestringsevidens. De bruges til målrettet feedback og til at finde
  misopfattelser (§4.2, A21).
- **Fire former (5, 6, 7 og delvis 15) er stimuli, ikke svarformer.** De er netop det, introduktionen
  mangler. Derfor rykker de op i prioritet (§10), selvom de i ROADMAP er "fase 2".
- **Binær scoring er ejerbeslutning.** Den bevares som belønningsregel. Til *evidens* kan de enkelte
  dele dog bruges (fx 3 af 4 par rigtige → misopfattelsen ligger i det fjerde par), uden at det
  påvirker belønningen. Det er beslutning LP-7.
- **Gentagelsesproblemet for formerne 4, 9–12 og 14–15** (`process_text_answer` betaler fuldt ved
  hver besvarelse) løses mest naturligt af `process_*_v2` med `round_no` (D-266/D-273). Ingen af
  formerne bør bygges før det.
- **Registret** (`interaction-kinds.ts`) bør pr. form få `guessFloor` (gætteloft) og den evidenstype,
  formen kan give. Så kan tilstandsmotoren læse dem ét sted i stedet for at hardkode dem.

**Anbefalet rækkefølge for formerne, efter hvilket hul i progressionen de lukker (FORSLAG):**

| Prioritet | Form | Hvilket hul den lukker |
|---|---|---|
| 1 | Indholdskort (ikke en opgaveform, men en forudsætning) + **sandt/falsk** | Introduktionen og dens indbyggede forståelsestjek. Sandt/falsk er lille og billig. |
| 2 | **Udfyld hul** | Overgangen fra genkendelse til genkaldelse, med og uden ordbank. |
| 3 | **Match par** (aktivering, med testen for manglende facit og minimum n ≥ 4 til tjek) | Struktur i guidet øvelse. Den er allerede bygget. |
| 4 | **Rækkefølge/tidslinje** | Historiens kronologi. Stærk evidens. |
| 5 | **Kilde + spørgsmål**, **billede + svar** | Anvendelse og introduktion i historie. Ingen ny evaluator. |
| 6 | **Find fejlen** | Målrettet afklaring af misopfattelser. |
| 7 | Kategorisering, byg sætning, multi-select | Diskrimination, interleaving, engelsk anvendelse. |
| 8 | Lytteopgave, diktat, hotspot | Fag- og tilgængelighedsspecifikt. |
| — | Tal | Kun efter at evaluatoren er rettet (§4.2). |

---

## 7. Konsekvenser for eksisterende systemer

### 7.1 Belønning: principper og XP-neutralitet (FORSLAG)

**Udgangspunkt (FAKTA, §2.3):**
- Systemet belønner korrekte førstegangssvar.
- Det belønner også volumen: svar-quests, aktivitetsranglisten og streak via ét svar om dagen.
- Det belønner login uden læring.
- Repetition giver kun 2 XP + 1 mønt.

Uden ændringer vil progressionen blive modarbejdet. En elev, der vil have mest mulig XP, vil helst
springe introduktionen over og svare hurtigt på nye spørgsmål.

**Fejlen i revision 1 (gennemgang af punkt 6):** Revision 1 gav en lille XP for introduktion (R2) og
for hver øvelsesopgave (R3), og kun et krav om "XP pr. minut" som neutralitetstest. Det har tre huller:
1. **Den lange rute giver mere i alt.** En elev, der bevidst dumper diagnostikken, får introduktions-
   og øvelses-XP oveni, som den ærlige elev ikke får. Selv hvis XP pr. minut er lavere, belønnes det
   at bruge mere tid.
2. **Gæt i diagnostikken kan betale sig.** En elev, der gætter sig til `formodet_kendt` og fejler
   bekræftelsen, ender med de samme XP-muligheder som den ærlige rute. Gætteriet koster intet.
3. **Øvelses-XP kan opsamles på tværs af mange mål,** hvis loftet kun gælder pr. mål.

**Revideret model: et fast XP-budget pr. læringsmål.** Hvert mål har et XP-budget *B*, som er det
samme, uanset hvilken rute eleven tager. Budgettet udbetales i rater ved milepæle. Raterne er
*forskud* på det samme budget, ikke tillæg:

| Milepæl | Rate (eksempel, HEURISTIK) | Bemærkning |
|---|---|---|
| Eksponering med forståelsestjek | 10 % af *B* | Kun første gang. Udbetales også, når læreren registrerer "gennemgået". |
| Øvelse (pr. gennemført opgave, uanset hints) | i alt højst 20 % af *B* | Loft pr. mål. Øvelse ud over loftet giver 0. |
| `klaret_i_dag` | op til 50 % af *B* i alt | Udbetaler forskellen op til 50 %. |
| `mestret` | resten op til 100 % af *B* | En elev, der kommer via diagnostik, får hele restbeløbet her. |
| Diagnostik | **0** | Altid. |

**Konsekvens:** *Den samlede XP for at nå `mestret` er ens for alle ruter* (A22):
- **Ærlig hurtig rute** (diagnostik bestået → bekræftet): *B* på kort tid.
- **Fuld rute** (introduktion → øvelse → tjek → forsinket tjek): *B* på længere tid.
- **Bevidst dumpet diagnostik:** *B* på længere tid. Det giver **samme XP, lavere XP pr. minut**, så
  der er intet incitament.
- **Gæt i diagnostikken, der fejler bekræftelsen:** Gættet giver 0, og eleven går ind i den fulde
  rute. Det giver *B* på længst tid. Gæt koster altså tid og giver intet.
- **Overspringning af nødvendig læring:** Uden bestået diagnostik eller lærerens registrering
  kommer eleven aldrig til `tjek` uden om eksponering og øvelse. Uden `mestret` udbetales højst
  70 % af *B*.

**Repetition** har sit eget, faste budget pr. planlagt repetition, *R*:
- Det udbetales kun, når repetitionen er forfalden. Repetitioner kommer efter planen, så eleven kan
  ikke selv skabe flere.
- Det udbetales ved korrekt, uassisteret svar.
- En fejlet repetition giver 0, men genopfriskningen giver *R* ved bedring (højst én gang pr.
  forfalden repetition).

Dermed lønner det sig at vende tilbage. Dagens repetitionsbelønning (2/1, D-211) dækker
"puljen er brugt op" og gælder ikke for planlagt repetition.

**Principper:**

| # | Princip | Begrundelse |
|---|---|---|
| R1 | Diagnostik giver 0 XP og 0 mønter. | Der er ingen grund til at gætte eller dumpe bevidst. |
| R2 | Ét fast XP-budget pr. mål, uafhængigt af ruten (se ovenfor). | Neutralitet mellem ruter (A22). |
| R3 | Hints koster aldrig XP i øvelsen. Øvelses-XP har et loft pr. mål og et loft pr. dag på tværs af mål. | Hjælpsøgning skal være billig (Aleven 2003). Lofterne fjerner gevinsten ved volumen. |
| R4 | En mestringsbonus i mønter pr. mål er **lille** og rettet mod opgaven. Den kan suppleres af uforudsigelige, ikke-annoncerede kosmetiske overraskelser. | FORSKNING: også belønninger, der afhænger af præstation, svækker elevernes frie lyst (d = −0,28), og mest for børn. Uventede belønninger gør det ikke (Deci m.fl. 1999). |
| R5 | Repetition har sit eget budget, som kun udbetales, når repetitionen er forfalden. | Spacing skal være attraktivt og må ikke kunne farmes. |
| R6 | Ingen belønning afhænger af svartid. Svartid bruges kun som gættesignal. | Ingen incitament til hastighed (Baker 2004). |
| R7 | Quests bliver læringshandlinger: "genopfrisk 3 mål", "lær ét nyt mål", "ret en misopfattelse". | Volumen-quests strider mod R3. |
| R8 | Streak tæller en dag med mindst én gennemført læringshandling, ikke ét vilkårligt svar. | — |
| R9 | Ranglister rangerer aldrig efter volumen (LP-10). | Social sammenligning kan demotivere svage elever (HYPOTESE). |

**Neutralitetstest (A12 og A22), simuleret elev med deterministisk seed. Fire strategier pr. mål:**
1. ærlig, kan stoffet;
2. ærlig, kan ikke stoffet;
3. bevidst dumpet diagnostik, kan stoffet;
4. gætter i diagnostikken, kan ikke stoffet.

Testen kræver:
- **(a)** Samlet XP til `mestret` er ens for 1–3.
- **(b)** XP pr. minut for 1 er ≥ XP pr. minut for 3.
- **(c)** 4 opnår aldrig mere XP end 2 og når aldrig `mestret` før 2.
- **(d)** Diagnostik giver 0.
- **(e)** XP fra øvelse er ≤ loftet, uanset antal opgaver og mål.

**Login-belønningen** (25–150 mønter) er stor i forhold til læring (5 mønter pr. korrekt svar). Det er
en selvstændig produktbeslutning (LP-9).

**Rækkefølge:** Belønningerne ændres først, når tilstandsmotoren er live for en pilotklasse (L7), og
efter at D-278 er anvendt.

### 7.2 Øvrige systemer

| System | Konsekvens (FORSLAG) |
|---|---|
| **Niveaumotoren** (`LEVEL_ENGINE`, 1–10.000) | Bruges fortsat til at vælge *niveau*: opgaver inden for et mål og målets niveauinterval. **Regel (§4.5):** Folden må kun bruge svar i `tjek`, `repetition` og `anvendelse` uden hints. Diagnostik må kun hæve startniveauet. I dag folder motoren alle første svar. Det er uproblematisk, så længe der ikke findes diagnostik og øvelse, men folden skal ændres i samme PR som diagnostikken (LP-5). |
| **Måle-spørgsmål pr. fag** (P1–P9) | Bliver diagnostik på emneniveau (§4.5). Placering påvirker niveau, ikke mestring. Ejerens krav "et fag må ikke påvirke et andet" gælder også tilstanden pr. mål, fordi den er pr. fag og mål. |
| **Elevhistorik** (`question_attempts`, D-266) | Er fundamentet. FAKTA (read-only 2026-10-31): migrationen `20261030211428` er merget, men **ikke anvendt**. Tabellen findes ikke i produktionen. H5 PR 3 (`process-event` til `_v2`) er merget (#498), men ikke deployet. **LP-3:** `mode`, `hints_used`, `response_ms` og `objective_ids` tilføjes i en følgemigration, der anvendes *sammen med* PR 1, før den første række skrives. Den mergede migrationsfil ændres ikke. Gentagelsens `round_no` (H5) bevares. |
| **Format-mix** (`QUESTION_MIX_ENGINE`) | Bliver underordnet progressionen. Formen vælges efter fasens evidensbehov, og mix-kvoterne bruges kun til variation inden for øvelsen. v2 forbliver NO-GO uden ejerens godkendelse. |
| **Bølgefaser** | Erstattes af tilstandene. `recovery` svarer til "undervis igen" og `deep_challenge` til "anvendelse". Bølgesorteringen kan bruges som tie-break inden for en fase i overgangen. |
| **Lærerreview** (lange svar) | Lærerens vurdering bliver evidensen `forklaring`. `get-reviewed-answers` skal have en UI, så feedbacken når eleven. Dobbelt-XP-fejlen i `review-answer` rettes før (kendt i ROADMAP). |
| **Lærerdashboard** | Nyt: et varmekort over mål × elever (tilstande), en liste over misopfattelser i klassen, "brug for hjælp", "gennemgået i klassen" (eksponering), forklaring pr. tilstand og tilsidesættelse (logges som `lærervurdering`). Statistikken "Korrekt %" bevares, men mestrede og fastholdte mål bliver hovedtallet. |
| **XP-niveau / `student_progress.level`** | Uændret (XP → niveau). Den forældede "Level" på elevsiden rettes separat. |
| **Achievements** | De nuværende er bundet til `correct_answers`. Nye bindes til mål (fx "10 mål mestret", "5 genopfriskninger i træk"). De eksisterende bevares. |
| **Oplæsning (157P)** | Udvides til indholdskort. Det er afgørende for yngre og læsesvage elever i introduktionen. |
| **Spaced repetition i dag** | Den døde skrivning af `next_review_at` erstattes af tilstandsmotorens plan. Den gamle kolonne bør ikke genoplives, fordi den hører til instansen, ikke målet. |
| **`reset-student`** | En egentlig nulstilling pr. elev og fag (P6) er nødvendig, fordi læreren skal kunne starte et forløb forfra. Afledt tilstand kan nulstilles ved at logge en "nulstil"-hændelse, så intet slettes. |

---

## 8. Målarkitektur (FORSLAG)

### 8.1 Principper

1. **Logs er sandheden, tilstanden er afledt.** Svar, eksponeringer, hints og lærerhandlinger
   skrives append-only. Elevtilstanden er en fold, der kan genberegnes. Det følger samme mønster som
   `student_level_fold_log`.
2. **Serveren ejer alt, der vurderer.** Klienten viser og indsamler. Tilstand, næste aktivitet,
   evidens og belønning beregnes på serveren (som instanser og facit i dag).
3. **Skyggetilstand før aktivering.** Motoren kører først i skygge og logger, hvad den ville gøre,
   uden at ændre det, eleven får (samme mønster som `QUESTION_MIX_ENGINE=shadow`).
4. **Flag pr. fag og pr. pilotklasse.** Ingen global aktivering.
5. **Kontrakten bevares.** Dagens gnq-svar bevares. Et nyt aktivitetssvar (indholdskort eller opgave
   med `mode`) gives kun, når flaget er slået til. Release-gatens paritetstjek (§3.1 i runbooken)
   udvides til at dække det.

### 8.2 Datamodel (skitse, ingen migration på dette trin)

| Tabel | Indhold | Bemærkning |
|---|---|---|
| `learning_objectives` | id, fag, emne (= dagens `learning_objective`), kode, titel, beskrivelse, `level_min`, `level_max`, valgfri Fælles Mål-reference, version, is_active | Ejet af personalet. Eleverne kan kun læse titel og beskrivelse. |
| `objective_prerequisites` | objective_id, requires_objective_id | Validering af, at grafen er kredsløbsfri. |
| `learning_content` | id, objective_id, kind (tekst/eksempel/kilde/billede/lyd), body, oplæsningsnøgle, version, is_active | Ikke-scoret. Medieindhold i Storage/R2. |
| `question_objectives` | question_id, objective_id, evidence_kind | Mange-til-mange. |
| `questions.content` (udvidet) | `hints[]` (H1–H3), feedback og `misconception` pr. svarmulighed | Udvides bevidst i DTO'en. Facit og misopfattelseskobling bliver på serveren. |
| `question_attempts` (D-266, **udvidet før anvendelse**) | + `mode`, `hints_used`, `response_ms`, `objective_ids` | LP-3. |
| `content_exposures` | elev, objective_id, content_version, kilde (app/lærer), tidspunkt | Append-only. |
| `objective_events` | lærervurdering, nulstilling, "gennemgået i klassen" | Append-only. |
| `student_objective_state` | elev, objective_id, tilstand, flag, sidste evidens, næste repetition, forklaring | **Cache**, genberegnes fra logs. Kan læses af eleven selv og elevens lærer. |

**Privatliv:**
- En elevmodel pr. mål er profilering af mindreårige. Den skal med i privatlivsdokumentationen og
  holdes på dataminimum: ingen fri tekst ud over svar, ingen deling uden for skolen.
- Tilstanden må aldrig alene bruges til en beslutning med retsvirkning (GDPR art. 22). Det er heller
  ikke hensigten.
- `response_ms` er en ny oplysning. Den har kun ét formål, at fange gæt, og skal begrundes i
  privatlivsdokumentationen.

### 8.3 Forløb (skitse)

```
hub → vælg fag → get-next-activity (gnq udvidet, bag flag)
        ├─ læs student_objective_state (+ niveau fra student_subject_level)
        ├─ vælg mål: forfaldne repetitioner → igangværende → nyt (forudsætninger OK)
        ├─ vælg aktivitet: diagnostik | indholdskort | opgave(mode, form efter evidensbehov)
        └─ svar → process-event → process_*_v2 (question_attempts + mode/hints/tid)
                 → fold → student_objective_state → belønning efter R1–R10
```

---

## 9. Gap-analyse

| Område | I dag | Ønsket | Gap | Afhænger af |
|---|---|---|---|---|
| Svarhistorik | Overskrives ved gentagelse | Append-only log med tilstand, hints og tid | `question_attempts` anvendes og udvides. PR 3–5. H1–H4. | Ejer-GO, D-110 |
| Læringsmål og forudsætninger | Kun emne-/domænenøgle | Mål, graf og kobling til opgaver | Ny model + forfatterarbejde | — |
| Introduktion | Ingen | Indholdskort pr. mål med oplæsning | Ny indholdstype, renderer, logning af eksponering | Mål |
| Diagnostik | Placering kun i historie, global | Pr. fag og emne, uden negativ evidens på ukendt stof | Diagnostiktilstand og regel (§4.5). P-forslaget forenes. | Mål, log |
| Hints | Ingen | H1–H3 pr. opgave | Indholdsfelt, UI, logning | Log |
| Feedback | `review_text` ved forkert svar | Forklaring ved alle svar i øvelsen. Tilbagevisning pr. svarmulighed. | Indholdsudvidelse | Mål |
| Mestring | Død | Tilstandsmotor (§4.3), deterministisk og forklarlig | Ny motor (fold) + skyggetilstand | Log, mål |
| Repetition | Kun "puljen er brugt op" | Planlagt pr. mål | Repetitionsplan i tilstanden | Motor |
| Niveau | Klientbånd, klassetrin som loft | Niveaumotor pr. fag, klassetrin = start | `LEVEL_ENGINE`-aktivering + fold uden diagnostik | LP-5 |
| Svartid | Smides væk | Logges som gættesignal | `response_ms` | LP-3 |
| Bedømmelse | `[a-z0-9]`-strip | Korrekt for æøå og tal | Evaluator-rettelse | — |
| Belønning | Volumen og korrekt førstegangssvar | R1–R10 | Ændring af RPC'er og quests | Motor live |
| Lærerindsigt | %, trend, bånd | Varmekort, misopfattelser, eksponering, tilsidesættelse | UI + RPC'er | Motor |
| Lærerfeedback til eleven | Når ikke eleven | Synlig | UI for `get-reviewed-answers` | — |
| Formerne | MC + Stav til | Prioriteret efter §6 | Én PR pr. form | `process_*_v2` |
| Evaluering | Ingen | §12 | Forsinkede tjek og analyse | Log |

---

## 10. Prioriteret roadmap

Hvert trin er sin egen sektion med audit, PR, tests og ejergodkendelse (CLAUDE_WORKFLOW). Intet trin
ændrer produktionsadfærd uden flag.

| Trin | Indhold | Afhænger af | Leverance / "done" |
|---|---|---|---|
| **L0** | Retningen er godkendt (LP-1, 2026-10-31). Ejeren afgør §14.1 (LP-3, LP-5, LP-15, LP-16). D-278 anvendes (særskilt GO). Read-only produktionstjek (§2.6). Dokumentkonflikterne (§2.4) rettes. | — | D-fil med beslutningerne i §14.1. Tjek dokumenteret. |
| **L1** | **Historikfundament:** `question_attempts` anvendes sammen med følgemigrationen (LP-3, D-110). D-266 PR 3 (#498, merget) deployes, og PR 4–5 bygges. Bedømmelsesrettelse og statisk validering af opgaver (LP-15). | L0, H1–H4 (LP-16) | Hvert svar logges med tilstand, hints og tid. Replay-test grøn. Evidensgyldighed kan beregnes pr. opgave. |
| **L2** | **Indholdsmodel:** læringsmål, forudsætninger, indholdsenheder og kobling til opgaver. Valideringsværktøj. Ét pilotforløb pr. fag (historie: besættelsen; engelsk: datid; dansk: vælges, LP-13). | L0 | Pilotindhold inaktivt i produktion. Validering grøn (graf, kobling, misopfattelser). |
| **L3** | **Introduktion og eksponering:** renderer for indholdskort (oplæsning), sandt/falsk som forståelsestjek, logning af eksponering, lærerens "gennemgået i klassen". | L1, L2 | Bag flag. E2E: introduktion → tjek → eksponering logget. |
| **L4** | **Tilstandsmotor i skygge:** fold fra logs, tilstande og flag (§4.3), forklaringer, repetitionsplan. Lærerens varmekort (læsning). | L1, L2 | Motoren beregner og logger. Eleverne mærker intet. Simulationen af gættere < 1 %. |
| **L5** | **Sekvensering for en pilotklasse:** næste aktivitet efter §5. Diagnostik efter §4.5. Hints. Niveaumotoren integreret (LP-5). | L3, L4 | Pilotklassen kører progressionen. Andre klasser er uændrede. Release-gate udvidet. |
| **L6** | **Formerne efter §6:** udfyld hul → Match par-aktivering → rækkefølge → kilde/billede → find fejlen → … | L1 (v2-RPC'er), L5 for fasebrug | Én PR pr. form. |
| **L7** | **Belønning R1–R10** for pilotklassen. Quests omdefineres. | L5 + integritetsfundene lukket | Neutralitetstest grøn. |
| **L8** | **Evaluering (§12)** og kalibrering (intervaller, kriterier, evt. HLR/Elo). | L5 + ≥ 6 ugers data | Evalueringsrapport. Beslutning om bredere udrulning. |

**Hvorfor L1 først:** Uden en log kan ingen mestring, repetition eller evaluering beregnes. Felterne
`mode`, `hints_used` og `response_ms` er billige at tilføje nu, fordi migrationen ikke er anvendt
endnu. Bagefter kræver de en ny migration og giver huller i historikken.

---

## 11. Acceptkriterier og tests

Alle kriterier er formuleret, så de kan testes deterministisk (unit-test mod en ren fold, PGlite mod
migrationer eller E2E).

| # | Kriterium | Testtype |
|---|---|---|
| A1 | Et forkert svar i `diagnostik` ændrer aldrig mestringstilstanden og bliver aldrig til negativ evidens. Det gælder **også efter registreret eksponering** (app eller lærer). | Unit (fold) |
| A2 | Diagnostiske, øvelses- og assisterede svar indgår aldrig i niveaumotorens fold. Diagnostik kan kun hæve startniveauet og aldrig sænke det under klassetrinnets serverafledte start. | PGlite |
| A3 | Et svar med `hints_used > 0` bidrager aldrig til `klaret_i_dag` eller `mestret`. | Unit |
| A4 | `mestret` kræver ≥ 1 korrekt, uassisteret svar i `tjek` ≥ 20 t efter seneste eksponering/øvelse, på en opgave, eleven ikke har set samme dag. | Unit (tidsinjektion) |
| A5 | `klaret_i_dag` kræver ≥ 1 svar af evidenstypen genkaldelse/struktur(≤ 5 %)/anvendelse. To MC-svar alene er aldrig nok. | Unit |
| A6 | Simulation: en elev, der gætter tilfældigt, når `mestret` i < 1 % af målene i pilotpakken. Seed er fast (deterministisk). | Unit (simulation) |
| A7 | Match par med n < 4 giver aldrig mestringsevidens. | Unit |
| A8 | Tilstanden er en ren funktion af loggen: replay af samme hændelser giver identisk tilstand. En ændret regel giver ny tilstand uden at slette noget. | Unit (replay) |
| A9 | Evidens i ét fag ændrer aldrig tilstand eller niveau i et andet fag. | Unit + PGlite |
| A10 | Lærerens "gennemgået i klassen" registrerer eksponering. Appen tilbyder så ikke introduktionen igen. | E2E |
| A11 | Diagnostik giver 0 XP og 0 mønter. Ingen XP afhænger af `response_ms`. | PGlite |
| A12 | Neutralitet: den hurtige rute giver mindst lige så meget XP pr. minut som den fulde rute (simuleret elev). Se også A22. | Unit (simulation) |
| A13 | Tre fejl i samme mål i én session giver `brug_for_hjælp` og skift til et andet mål. Der er aldrig en blindgyde. | Unit + E2E |
| A14 | En repetition kommer tidligst efter intervallet og senest ved næste session efter forfaldsdatoen, hvis eleven arbejder i faget. | Unit |
| A15 | Med flaget fra er gnq's svar byte-identisk med i dag (release-gatens paritetstjek). | Unit (release-gate) |
| A16 | Eleven kan aldrig læse facit, misopfattelseskobling eller andre elevers tilstand. Læreren kan kun læse egne elevers. | PGlite (RLS) |
| A17 | Bedømmelsen skelner "æ"/"ae" og "1,5"/"15". | PGlite |
| A18 | Hver tilstandsovergang har en forklaringstekst, der kan vises for læreren. | Unit |
| A19 | Manglende eksponering bliver aldrig til tilstanden "ikke mødt". UI og lærervisning viser "ikke påvist endnu", aldrig "kan ikke". | Unit + E2E (tekster) |
| A20 | En opgave, der fejler den statiske validering (§4.2), eller som er markeret mistænkt tvetydig, bidrager hverken med positiv eller negativ evidens. Fjernes markeringen, genberegnes tilstandene. | Unit (fold) |
| A21 | Delvis korrekte svar (Match par, rækkefølge, udfyld hul med flere huller, multi-select) giver hverken mestrings- eller negativ evidens. Den fejlende del logges. | Unit |
| A22 | XP-stiuafhængighed (§7.1): den samlede XP for at nå `mestret` på et mål er ens for alle ruter. Bevidst fejlet diagnostik giver aldrig mere XP eller XP pr. minut end ærlig diagnostik. | Unit (simulation) |
| A23 | Kalibrering (§4.9): replay af den samme log under et alternativt kriterium giver deterministisk de samme tilstande hver gang og ændrer ikke de lagrede logs. | Unit (replay) |

---

## 12. Evaluering: lærer eleverne mere?

**Spørgsmål:**
1. Fastholder elever i progressionen mere viden efter 1 og 4 uger end med dagens løkke (test med
   feedback)?
2. Hvor ofte er mestringen falsk, og hvor ofte er repetitionen unødig?

**Hvorfor revision 1's design ikke holdt (gennemgang af punkt 5):** Revision 1 fordelte de enkelte
læringsmål tilfældigt pr. elev. Mål med fælles forudsætninger eller i samme kæde ville så havne i
hver sin betingelse. Det giver tre problemer:
- **Smitte:** Undervisning i mål A styrker det beslægtede kontrolmål B. Forskellen undervurderes.
- **Brud med progressionen:** Et mål i progressionen kan have sin forudsætning i kontrolbetingelsen.
- **Uretfærdighed:** En elev kan blive undervist i "halvdelen" af et sammenhængende emne.

**Revideret design (FORSLAG):**
1. **Randomiseringsenheden er en klynge, ikke et mål.** En klynge er en sammenhængende komponent i
   forudsætningsgrafen: alle mål, der er forbundet via forudsætninger, også fælles. En klynge placeres
   altid samlet i én betingelse. Klyngerne skal være faglige emner, der er uafhængige af hinanden,
   fx i historie *besættelsen* og *vikingetiden* og i engelsk *datid* og *flertal*. Om to klynger er
   uafhængige, vurderer en lærer, ikke kun grafen.
2. **Parrede klynger:** Pilotindholdet bygges som par af klynger, der ligner hinanden i niveau,
   antal mål og opgaveformer (HEURISTIK: ±1 mål og samme niveaubånd).
3. **Afbalanceret overkrydsning (AB/BA):** Eleverne fordeles med fast seed, stratificeret efter klasse
   og klassetrin.
   - Halvdelen får klynge X med progressionen og klynge Y som i dag.
   - Den anden halvdel får det omvendte.

   Hver elev får begge betingelser og er sin egen kontrol. Forskelle i klyngernes sværhed udlignes.
4. **Retfærdighed:**
   - Kontrolbetingelsen er dagens praksis med feedback og altså ikke dårligere end i dag.
   - **Når målevinduet er slut** (4 uger efter den sidste forsinkede måling), får alle elever
     progressionen i deres kontrolklynge (forsinket adgang). Ingen elev er varigt stillet ringere.
   - Lærerens undervisning er uændret, og læreren kan til enhver tid tage en elev ud af forsøget.
     Elevens data analyseres så efter den oprindelige fordeling, og udtrædelsen rapporteres.
   - Læreren må gerne registrere "gennemgået i klassen" for begge klynger. Det logges og indgår i
     analysen.
5. **Måling:**
   - Holdt-tilbage-opgaver efter 1 og 4 uger, de samme for begge betingelser, uden belønning og
     brugt ingen andre steder.
   - Fastholdelsesrate.
   - Falsk mestring.
   - Unødig repetition.
   - Tid brugt.
   - Frafald under introduktionen.
6. **Smittetjek:** Kontrolklyngens resultater sammenlignes mellem de elever, der har den anden klynge
   i progression, og dem, der endnu ikke er startet. Er der forskel, er klyngerne ikke uafhængige, og
   det rapporteres.
7. **Analyse:**
   - Forskellen inden for den enkelte elev mellem betingelserne, med effektstørrelse og
     konfidensinterval.
   - Ingen påstande om signifikans ved små tal.
   - Målene og analysen fastlægges i en kort præregistrering i repoet, *før* data ses.
   - Resultaterne præsenteres for ejeren før en bredere udrulning.
8. **Kvalitativt:** korte interviews med lærere og elever om introduktionen, feedbacken og om
   belønningen føles retfærdig. Lærerens roller undersøges i tråd med Hanghøj 2013.
9. **Etik og GDPR:**
   - Forældre og skole informeres.
   - Analysen sker pseudonymiseret.
   - Resultaterne bruges ikke til at bedømme den enkelte elev.
   - Holdt-tilbage-opgaverne er korte og uden belønning.
   - Forsøget godkendes af skolen før start.

**Alternativ, hvis overkrydsning ikke er mulig** (fx for få uafhængige klynger): klasser sammenlignes
med progression nu og med progression senere (forsinket adgang for den anden klasse). Det er svagere,
fordi klasserne er forskellige, men retfærdigt.

---

## 13. Risici

| Risiko | Konsekvens | Afbødning |
|---|---|---|
| **Falsk mestring** (gæt, opgaven huskes, hints) | Eleven går videre uden at kunne stoffet | Krav om genkaldelse eller stærk struktur, forsinket tjek på en ny opgave, hints udelukket (A3–A7). Overvåges via "første repetition fejler" (§5.6). |
| **Falsk ikke-mestring** (tvetydige opgaver, bedømmelsesfejl, diagnostik) | Unødig undervisning og frustration | A1/A2, rettelse af æøå og tal (A17), genberegning efter rettelser, tilsidesættelse fra læreren. |
| **Unødig repetition** | Kedsomhed, expertise reversal | Diagnostik kan springe introduktionen over. Voksende intervaller. Overvåges (§5.6). Loft over repetitioners andel af sessionen. |
| **Forfatterbyrden** (mål, indhold, hints, misopfattelser) | Kan ikke skaleres til 2.100 opgaver | Ét pilotforløb pr. fag. Genbrug af eksisterende metadata. AI-udkast med menneskelig godkendelse. Valideringsværktøj. |
| **Kompleksitet for en solo-udvikler** | Fejl, langsom fremdrift | Trinvis (L0–L8). Skyggetilstand. Ren fold, der kan testes. Én sektion ad gangen. |
| **Kold start / kalibrering** | Faste intervaller og kriterier passer ikke | Startværdier efter forskningen, kalibrering i L8, al data i loggen. |
| **Belønningen modarbejder læringen** | Gæt og at springe over | R1–R10, neutralitetstest (A12), belønning ændres først med motoren. |
| **Belønningsintegritet** (§2.5) | Farming | Lukkes før L7. |
| **Niveaumotor og diagnostik i konflikt** | Forkert niveau | LP-5, A2. |
| **Profilering af mindreårige** | Privatliv, tillid | Dataminimum, privatlivsdokumentation, ingen automatiske afgørelser, lærerens ret til tilsidesættelse. |
| **Yngre elever og prætest** | Demotivation | Stopregel, kun 1 opgave i klassetrin 1–3, kun hvis læreren slår det til. Neutral framing. |
| **Drift mellem main og produktion** | Design baseret på det forkerte | Read-only tjek før hvert trin (§2.6). Release-gate. |
| **Evidensgrundlaget er mest fra voksne** | Modellen virker måske anderledes for børn | Evaluering indbygget (§12), og kalibrering skal være mulig. |

---

## 14. Ejerbeslutninger

**Status 2026-10-31:** LP-1 er afgjort. Læringsmodellen er godkendt som overordnet arbejdsretning,
men ikke som endeligt design. De øvrige beslutninger står åbne og er delt i tre grupper efter,
hvornår de skal træffes.

### 14.1 Nødvendige før L1 (historikfundamentet)

| # | Beslutning | Hvorfor nu | Anbefaling |
|---|---|---|---|
| **LP-3** | Skal svarloggen fra første række gemme `mode`, `hints_used`, `response_ms` og `objective_ids`? | `question_attempts` er ikke anvendt endnu (FAKTA, read-only 2026-10-31). Tilføjes felterne senere, mangler de i historikken for alle tidlige svar. | Ja. En følgemigration anvendes sammen med PR 1, og `_v2`-RPC'erne og `process-event` tager felterne med. `response_ms` får ét formål (gættesignal) og skrives ind i privatlivsdokumentationen. |
| **LP-5** | Princip: må niveaumotorens fold kun bruge svar i `tjek`, `repetition` og `anvendelse` uden hints, og må diagnostik kun hæve startniveauet? | Niveaumotoren venter på aktivering. Princippet skal være kendt, før motoren aktiveres og før `mode` lander i loggen. | Ja. Implementeringen sker i samme PR som diagnostikken. |
| **LP-15** *(ny)* | Skal bedømmelsen i `process_question_attempt` rettes (numerisk evaluator og bevarede æøå), og skal den statiske validering af opgaver bygges i L1? | Uden rettelsen kan tal og `force_text` ikke bruges som evidens, og MC-opgaver med kolliderende svarmuligheder bedømmes forkert. | Ja. Det er sin egen PR i L1 med en migrationstest. Først rapporteres, hvor mange aktive opgaver der rammes (read-only). |
| **LP-16** *(ny)* | Afklares D-266's åbne H1–H4 som en del af L1? | L1 kan ikke færdiggøres uden dem. | Ja. H1–H4 behandles i deres eget D-266-spor. Dette dokument forudsætter dem kun. |

### 14.2 Afgøres før eller under piloten

| # | Beslutning | Senest | Anbefaling |
|---|---|---|---|
| LP-2 | Hvor små skal læringsmålene være? | Før L2 | 5–15 pr. emne. Piloten viser, om det holder. |
| LP-4 | Startværdier for mestringskriteriet (§4.6, §4.9) | Før L4 (skygge) | Godkend som *pilotparametre* med reglerne for kalibrering i §4.9. |
| LP-6 | Er introduktionen obligatorisk? | Før L3 | Ja, medmindre diagnostikken er bestået, eller læreren har registreret "gennemgået". |
| LP-7 | Må delresultater bruges som rute- og feedbackinformation (ikke mestring), mens belønningen er binær? | Før L4 | Ja, som i §4.2. |
| LP-8 | XP-budgetmodellen og R1–R9 (§7.1) | Før L7 | Ja som retning. Budgetstørrelser fastsættes i L7. |
| LP-11 | Evalueringsdesignet (§12: klynger, overkrydsning, forsinket adgang) | Før pilotstart (L5) | Ja, med præregistrering og information til forældrene. |
| LP-12 | Diagnostik i 1.–3. klasse | Før L5 | Kun når læreren slår det til, med 1 opgave pr. mål. |
| LP-13 | Pilotforløb (historie: besættelsen, engelsk: datid, dansk: ?) | Før L2 | Dansk: et staveområde. Til evalueringen kræves to uafhængige klynger pr. fag (§12). |

### 14.3 Selvstændige produktbeslutninger (uafhængige af L1–L5)

| # | Beslutning | Anbefaling |
|---|---|---|
| LP-9 | Skal login-belønningen nedskaleres eller kobles til en læringshandling? | Kobles til ≥ 1 læringshandling. Kan besluttes, når det passer. |
| LP-10 | Skal klassen kunne se hinandens mestrede mål? | Nej i piloten. |
| LP-14 | Skal matematik være et fag? | Separat produktbeslutning. Det kræver LP-15 (numerisk evaluator). |

---

## 15. Kilder

Den fulde referenceliste med verificeringsstatus står i
[learning-progression-evidence.md](learning-progression-evidence.md). Verifikationen mod primærkilderne
står i [learning-progression-source-verification.md](learning-progression-source-verification.md).
Kilder, der bærer designvalg i dette dokument:
- Agarwal, Nunes & Blunt 2021; Aleven m.fl. 2003.
- Backhaus m.fl. 2008; Baker m.fl. 2004.
- Brunmair & Richter 2019; Bundsgaard & Kreiner 2019; Butler & Roediger 2008.
- Carneiro, Lapa & Finn 2018; Cepeda m.fl. 2006, 2008; Chaudhry m.fl. 2018.
- Danielson m.fl. 2025; Deci, Koestner & Ryan 1999.
- Foo m.fl. 2025; Gais, Lucas & Born 2006.
- Hanghøj 2012, 2013; Hanghøj & Brund 2010; Hanghøj, Lieberoth & Misfeldt 2018.
- Kalyuga m.fl. 2003; Karpicke, Blunt & Smith 2016; Karpicke & Roediger 2007.
- Kelly, Wang, Thompson & Heffernan 2015; Kluger & DeNisi 1996; Kornell, Hays & Bjork 2009.
- Kulik, Kulik & Bangert-Drowns 1990; Marsh m.fl. 2007.
- Pelánek & Řihák 2017; Renkl & Atkinson 2003; Richland, Kornell & Kao 2009.
- Rohrer m.fl. 2020; Rowland 2014.
- Sailer & Homner 2020; Settles & Meeder 2016; Slavin 1987; Soderstrom & Bjork 2015.
- van der Kleij, Feskens & Eggen 2015; Vlach & Sandhofer 2012; Wisniewski, Zierer & Hattie 2020;
  Yang m.fl. 2021.

Kodegrundlaget er `main` @ `6a55282`. FAKTA om produktionen i revision 2 stammer fra read-only
katalogforespørgsler 2026-10-31.
