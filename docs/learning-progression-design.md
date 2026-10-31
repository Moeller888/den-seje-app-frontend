# Læringsprogression i Lærlig — audit og designforslag

**Status:** UDKAST TIL EJERENS GENNEMGANG. Intet i dette dokument er godkendt, bygget eller aktiveret.
Dokumentet ændrer ingen produktionsadfærd, og der hører ingen migration eller deploy til.
Implementering kræver ejerens godkendelse af læringsmodellen (§4–§5) og af hver beslutning i §14.
**Dato:** 2026-10-31 · **Grundlag:** `main` @ `6a55282` (merge af #379), læst read-only.
Produktionsforhold er kun angivet, hvor et tidligere read-only produktionstjek er dokumenteret i repoet.
**Beslutning:** [D-277](decisions/D-277.md).
**Bilag:** [learning-progression-evidence.md](learning-progression-evidence.md) er evidensnotatet med
den fulde forskningsgennemgang og 60 referencer, hver markeret med verificeringsstatus.

## Læsevejledning

Dokumentet bruger tre mærker, så du kan se, hvilken slags påstand du læser:

| Mærke | Betyder |
|---|---|
| **FUND** | Robust forskningsresultat eller fakta, der er læst direkte i kode, migrationer eller dokumenterede produktionstjek. |
| **ANTAGELSE** | En pædagogisk eller teknisk antagelse, som ikke er dokumenteret for Lærligs elever. |
| **FORSLAG** | Mit designforslag. Det kræver din godkendelse. |

En påstand, jeg har sluttet mig til uden at have læst den direkte, er markeret *(udledt)*.

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
2. **Elevtilstand pr. læringsmål.** For hvert læringsmål har eleven en tilstand, der adskiller tre
   ting: om eleven er blevet introduceret for stoffet (eksponering), hvad eleven kan (evidens), og
   hvad eleven har glemt (glemselsrisiko). Tilstanden er afledt deterministisk af en append-only log.
   Den kan genberegnes og forklares for læreren.
3. **Seks aktivitetstyper.** Progressionen bevæger eleven gennem diagnostik, introduktion, guidet
   øvelse, selvstændig genkaldelse, forsinket repetition og anvendelse. Den springer over det,
   eleven allerede kan, og går tilbage, når evidensen viser glemsel eller misopfattelse.
4. **Mestring kræver forsinket, uassisteret evidens fra mindst to forskellige opgaver,** hvoraf
   mindst én ikke kan gættes. Et forkert diagnostisk svar på stof, eleven aldrig har mødt, sænker
   aldrig mestringen.
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

Under auditten blev der fundet to steder, hvor belønninger muligvis kan påvirkes fra klienten.
Fundene kræver et read-only produktionstjek. Detaljerne holdes uden for det offentlige repo, på samme
måde som det åbne `student_events`-fund, og rapporteres direkte til ejeren. Fundene påvirker ikke
læringsmodellen, men en belønningsændring (§7) må ikke bygges oven på dem.

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

## 3. Forskningsgrundlag (sammenfatning)

Den fulde gennemgang står i [bilaget](learning-progression-evidence.md). Her er kun det, der bærer
designet.

**Gennemgående forbehold (FUND):** Hovedparten af forskningen er lavet med universitetsstuderende.
Et systematisk review af klasserumsforskning (Agarwal, Nunes & Blunt 2021) fandt ingen studier fra
indskolingen blandt 50 eksperimenter. Lærligs målgruppe (ca. 8–16 år) ligger delvis uden for, hvor
evidensen er stærkest. Det er grunden til, at evaluering (§12) er en del af planen og ikke et
tillæg.

| Emne | FUND (robust) | Grænser | Implikation (ANTAGELSE/FORSLAG) |
|---|---|---|---|
| **Genkaldelse (testeffekt)** | Test slår genlæsning. I klasserum er g ≈ 0,50 (Yang m.fl. 2021). Effekten er større med feedback og ved forsinket test (Rowland 2014). Den er også fundet hos elever i indskolingen (Karpicke m.fl. 2016). | Effekten forudsætter, at en del kan genkaldes. MC kan "indlære" forkerte svarmuligheder uden feedback (Marsh m.fl. 2007). | Test er en læringsaktivitet, men først efter at stoffet er mødt. Vis altid det korrekte svar og en forklaring. |
| **Prætest** | Voksne lærer mere, når de forsøger at svare før undervisningen, også ved forkerte forsøg, hvis svaret følger straks (Richland m.fl. 2009; Kornell m.fl. 2009). | For grundskolebørn er evidensen tynd og blandet. Et upubliceret studie fandt skade i 2. og 5. klasse. Gentagne fejl kan demotivere. | Diagnostik er tilladt, men kort og uden XP. Et forkert svar på ukendt stof registreres som "ikke mødt", ikke som manglende mestring. Brug den sparsomt i de yngste klasser. |
| **Spredning** | Spredt øvelse slår samlet øvelse. Det optimale interval vokser med, hvor længe stoffet skal holde (Cepeda 2006/2008). Det gælder også for 5–7-årige (Vlach & Sandhofer 2012). | Der er ingen konsensus om ekspanderende frem for ligelige intervaller. Det afgørende er at udsætte den første genkaldelse (Karpicke & Roediger 2007). | Første repetition tidligst næste dag, derefter voksende intervaller. Øvelsespræstation er ikke bevis for læring. |
| **Interleaving** | g = 0,42 samlet (Brunmair & Richter 2019). I matematik i 7. klasse fandtes d = 0,83 (Rohrer m.fl. 2020). | Negativ effekt for ordmateriale. Kræver, at hver type er mødt først. | Bland typer i anvendelsesfasen, mest i matematik, mindst i gloser. |
| **Gennemarbejdede eksempler / expertise reversal** | Eksempler hjælper novicer. Gradvis nedtrapning af hjælpen virker (Renkl & Atkinson 2003). Vejledning kan skade dem, der allerede kan stoffet (Kalyuga 2003/2007). | Det er uklart, præcis hvornår vejledningen skal trappes ned. | Introduktion med eksempel og nedtrapning, og spring over for elever, der kan stoffet (diagnostik). |
| **Feedback** | Forklarende feedback 0,49 mod 0,05 for kun rigtigt/forkert (van der Kleij m.fl. 2015). Over en tredjedel af feedbackinterventioner forringer præstationen, især når feedbacken handler om personen (Kluger & DeNisi 1996). | Umiddelbar eller forsinket feedback: blandede resultater. | Forklarende og opgaverettet feedback. Ingen ros eller kritik af personen. |
| **Hints og hjælpsøgning** | God hjælpsøgning hænger sammen med bedre læring (Aleven m.fl. 2003). At klikke sig igennem hints til svaret hænger sammen med mindre læring (Baker m.fl. 2004). Hvor meget hjælp der er rigtigt, er uafklaret (Koedinger & Aleven 2007). | — | Hints i øvelsen. Et svar givet med hint tæller ikke som mestringsevidens. Gør det billigt at bede om hjælp, men uattraktivt at klikke sig igennem. |
| **Misopfattelser** | Tekster, der eksplicit tilbageviser en misopfattelse, virker (Danielson m.fl. 2025, 76 studier). | Studierne er mest fra naturfag og med ældre elever. | Forkerte svarmuligheder kobles til misopfattelser, og feedbacken tilbageviser dem ("Mange tror X, men …"). |
| **Mestringslæring / modellering af viden** | Mestringslæring har positive effekter (Kulik m.fl. 1990). BKT har eksplicitte parametre for gæt og fejl (Corbett & Anderson 1995). Elo er simpel og robust (Pelánek 2016). Half-life regression forudsiger glemsel (Settles & Meeder 2016). | Bloom's "2 sigma" er formentlig overvurderet (Slavin 1987). Reglen "3 i træk" er sårbar over for gæt (Kelly m.fl. 2015). | Mestring kræver forsinket og varieret evidens. Start med en gennemsigtig regelmodel, og kalibrér senere med data. |
| **Spil og belønning** | Gamification har små positive effekter (Sailer & Homner 2020: g 0,49 / 0,36 / 0,25). Belønninger for blot at deltage kan svække den indre motivation (Deci m.fl. 1999, omstridt). Hanghøj (2013; Hanghøj & Brund 2011): lærerens roller er centrale i spilbaseret undervisning. Hanghøj m.fl. (2018): samarbejdsspil øgede deltagelsen hos udsatte elever. | Studierne er heterogene og præget af nyhedseffekter. | Beløn læringsadfærd (forsøg efter feedback, repetition, mestring), ikke volumen eller hastighed. Giv læreren en rolle i forløbet. |
| **Dansk kontekst** | Færdigheds- og vidensmål har været vejledende siden 2017. Kompetencemålene er bindende. De nationale test har stor måleusikkerhed på elevniveau (Bundsgaard & Kreiner 2019). | Der er kun sparsom dansk evidens for adaptive platforme. | Vis usikkerhed. Præsenter aldrig et estimat som en præcis måling af eleven. Mulighed for kobling til Fælles Mål, men frivillig. |

**Ikke verificeret:**
- En Hanghøj-titel "Spil i undervisningen" blev ikke fundet. Begrebet *spildidaktik* bruges i dette
  dokument om Hanghøjs arbejde med lærerroller og spilbaserede scenarier (2011–2013, 2018), ikke om en
  bestemt titel.
- En kritik af de nationale test fra Bremholm blev heller ikke fundet. Den kritik, der faktisk findes
  i kilderne, er Bundsgaard & Kreiner 2019.

---

## 4. Læringsmodellen (FORSLAG)

### 4.1 Grundbegreber

| Begreb | Definition |
|---|---|
| **Læringsmål** | En lille, vurderbar enhed: "Kan forklare, hvorfor Danmark blev besat 9. april 1940." Hører til ét fag og ét emne (dagens `learning_objective`) og har et niveauinterval på skalaen 1–10.000. Kan valgfrit kobles til Fælles Mål. |
| **Forudsætning** | En rettet kant mellem to læringsmål, så målene danner en graf uden kredsløb. Bruges til rækkefølge og til at finde årsagen, når eleven sidder fast. |
| **Indholdsenhed** | Ikke-scoret vidensindhold, der hører til et læringsmål: kort tekst, kilde, billede, lyd eller gennemarbejdet eksempel. Har version og oplæsning. |
| **Opgave** | Dagens spørgsmål, knyttet til ét eller flere læringsmål med en *evidenstype* (§4.2). |
| **Aktivitetstilstand** | Den rolle, opgaven har, når den serveres: `diagnostik`, `øvelse`, `tjek`, `repetition` eller `anvendelse`. Den samme opgave kan bruges i flere tilstande. **Formen bestemmer ikke fasen.** |
| **Eksponering** | En registreret hændelse: "eleven har mødt indholdet om læringsmål X", enten i appen eller ved at læreren markerer "gennemgået i klassen". |
| **Evidens** | Et svar set som bevis for, hvad eleven kan. Vægten afhænger af form, aktivitetstilstand, hints, tid siden sidste eksponering og om opgaven er gentaget (§4.2). |
| **Elevtilstand** | Afledt tilstand pr. elev og læringsmål (§4.3). Beregnes deterministisk fra loggen og gemmes aldrig som den eneste sandhed. |

**Adskillelse af niveau og mestring (FORSLAG):** *Niveau* (niveaumotoren 1–10.000 pr. fag) svarer på,
hvor svært stof der passer til eleven nu. *Mestring* svarer på, om eleven kan et bestemt læringsmål.
Begge bruges til at vælge næste aktivitet, men de blandes ikke. Et forkert diagnostisk svar må gerne
påvirke, hvor i fagets graf eleven starter. Det må aldrig registreres som manglende mestring af målet.

### 4.2 Evidensmodellen

Hvert svar giver evidens med en styrke. Modellen bruger **kategorier, ikke vægte med decimaler**, så
den er deterministisk og kan forklares for læreren (PROJECT_VISION: "determinism over cleverness").

**Evidenstyper efter kognitiv proces (FORSLAG):**

| Evidenstype | Hvad den viser | Eksempler på former |
|---|---|---|
| `genkendelse` | Eleven kan vælge det rigtige blandt givne muligheder. | MC, sandt/falsk, multi-select |
| `genkaldelse` | Eleven kan selv frembringe svaret. | Stav til, udfyld hul, tal, diktat |
| `struktur` | Eleven kan se sammenhænge og rækkefølger. | Match par, rækkefølge, kategorisering, byg sætning |
| `anvendelse` | Eleven kan bruge viden i en ny sammenhæng. | Kilde + spørgsmål, find fejlen, nyt regnestykke, hotspot |
| `forklaring` | Eleven kan begrunde. Vurderes af læreren. | Langt lærersvar |

**Svar, der aldrig er mestringsevidens (FORSLAG):**
- Svar i `diagnostik` på et læringsmål uden eksponering. De styrer kun ruten (§4.5).
- Svar givet efter et hint, herunder et hint, der afslører svaret.
- En korrekt gentagelse af *samme* opgave inden for 24 timer. Det måler hukommelse for opgaven, ikke
  målet.
- Svar, der er usandsynligt hurtige for formen, når svartiden logges (kræver §8.2). De markeres som
  "muligt gæt".

**Gætteloft pr. form (FUND: kombinatorik, ved tilfældigt valg):**

| Form | Sandsynlighed for at gætte rigtigt | Konsekvens |
|---|---|---|
| Sandt/falsk | 50 % | Bidrager kun til `genkendelse`. Kan aldrig alene give mestring. |
| MC med 4 svarmuligheder | 25 % (med 2 elimineret: 50 %) | Som ovenfor. |
| Multi-select, k = 4 | 1/15 ≈ 6,7 % | Middel. |
| Match par, n par | 1/n!, men nøglen er **aldrig** "lige over" (`_shared/match-pairs.ts:25`). En elev, der kender reglen, har 1/(n! − 1): **n = 2 giver 100 %**, n = 3 giver 20 %, n = 4 giver ≈ 4,3 %. | **FUND:** Match par med 2 par giver ingen evidens. Med 3 par er evidensen svag. Til `tjek` skal der mindst være 4 par (FORSLAG). |
| Rækkefølge, n emner | 1/n! (n = 4: 4,2 %, n = 5: 0,8 %) | Stærk ved n ≥ 4. |
| Stav til / udfyld hul / tal | ≈ 0 | Stærk. |
| Kategorisering, n emner i c kategorier | c⁻ⁿ | Stærk ved n ≥ 4. |

**FUND (bedømmelse):** `process_question_attempt` fjerner alt uden for `[a-z0-9]`, før svar
sammenlignes (`20261027120000…sql:91-96`). Derfor gælder:
- "1,5" og "15" bedømmes som ens.
- Svarmuligheder, der kun adskiller sig ved æ, ø eller å, bedømmes ens *(udledt)*.

Den normalisering er uegnet som evidens for tal og fritekst med æøå. Den skal rettes, før tal eller
`force_text` bruges som evidens (afhængighed i §10).

### 4.3 Elevtilstand pr. læringsmål

**Tilstande (FORSLAG):**

| Tilstand | Betydning | Typisk næste aktivitet |
|---|---|---|
| `ikke_mødt` | Ingen eksponering og ingen positiv evidens. Gælder også efter et forkert diagnostisk svar. | Introduktion (eller diagnostik, hvis målet ikke er afprøvet) |
| `formodet_kendt` | Diagnostikken bestod (§4.5), men endnu ikke bekræftet. | Forsinket `tjek` (tidligst næste dag) |
| `introduceret` | Eksponering registreret. Endnu ingen selvstændig evidens. | Guidet øvelse |
| `øver` | Øvelse i gang. Der kan være evidens, men ikke nok til mestring. | Øvelse → selvstændig genkaldelse |
| `klaret_i_dag` | Kriteriet for samme dag er opfyldt (§4.6). | Forsinket `tjek` efter ≥ 20 t |
| `mestret` | Kriteriet for forsinket mestring er opfyldt. | Repetition efter plan (§4.7). Låser afhængige mål op. |
| `genopfrisk` | Repetitionen fejlede, eller planen siger, at genopfriskning er forfalden. | Kort genkaldelse med feedback. Fejler den to gange: kort genintroduktion. |

**Flag oven på tilstanden:**
- `misopfattelse:<type>`: sættes, når eleven vælger en forkert svarmulighed, der er koblet til en
  misopfattelse, mindst 2 gange inden for samme mål, eller 1 gang i `tjek` eller `repetition`. Flaget
  ophæves af et korrekt, uassisteret svar på en opgave, der tester den samme misopfattelse.
- `brug_for_hjælp`: sættes efter 3 forkerte svar i samme mål i samme session efter introduktionen.
  Eleven sendes videre til et andet mål, og læreren får besked. Der er ingen blindgyde
  (PROJECT_VISION: "never-negative").
- `klar_til_udfordring` (afledt): målet er mestret, og elevens niveau i faget ligger over målets
  niveauinterval. Eleven tilbydes `anvendelse` på et højere niveau eller næste mål i grafen.

**Overgange (FORSLAG, deterministiske):**

```
ikke_mødt ──diagnostik bestået──▶ formodet_kendt ──forsinket tjek OK──▶ mestret
    │                                   │ tjek fejler
    │                                   ▼
    └──eksponering (app/lærer)──▶ introduceret ──øvelse──▶ øver ──kriterium samme dag──▶ klaret_i_dag
                                        ▲                    │                              │
                                        │  2× genopfrisk-fejl │ 3 fejl i session:            │ forsinket tjek OK
                                        │                    ▼  brug_for_hjælp, skift mål   ▼
                                        └────────────── genopfrisk ◀──repetition fejler── mestret
                                                             │ OK
                                                             └──────────────▶ mestret (kortere interval)
```

Tilstanden er en **ren funktion af loggen**: `tilstand = fold(hændelser for (elev, mål))`. Det følger
samme princip, som `CLAUDE.md` beskriver for progressionsmotoren, og som niveaumotoren allerede
bruger (fold + fold-log). Ændres reglerne, genberegnes tilstanden. Det gamle resultat overskrives
ikke.

### 4.4 De seks elevsituationer

| Situation | Hvordan modellen genkender den | Forløb (FORSLAG) |
|---|---|---|
| **Kan allerede stoffet** | Diagnostikken bestået (§4.5) | Springer introduktionen over (expertise reversal). Status `formodet_kendt`, og et forsinket `tjek` på en *anden* opgave bekræfter. Består eleven, er målet `mestret` uden øvelse. |
| **Har aldrig mødt stoffet** | Ingen eksponering. Diagnostikken fejlede, eller der var ingen diagnostik. | Introduktion → guidet øvelse med eksempel og hints → selvstændig genkaldelse → forsinket tjek. Det forkerte diagnostiske svar sænker hverken mestring eller selvbillede. Feedbacken lyder "Det har du ikke mødt endnu – nu lærer vi det". |
| **Forstår stoffet delvist** | Diagnostikken er blandet, eller korrekt med hint. Eller korrekt `genkendelse`, men fejl i `genkaldelse`. | Kort opsummering i stedet for fuld introduktion. Øvelse med fokus på den form for evidens, der mangler (fx fra MC til udfyld hul). |
| **Har en misopfattelse** | Flaget `misopfattelse` (§4.3) | Feedback, der tilbageviser misopfattelsen. Derefter en målrettet opgave, der skiller misopfattelsen fra det rigtige svar. Mestring er blokeret, til flaget er ophævet. Læreren ser flaget. |
| **Har lært noget, men glemt det** | En repetition fejler, eller planen er overskredet | `genopfrisk`: kort genkaldelse med forklaring. Lykkes den: tilbage til `mestret` med et kortere interval. Fejler den to gange: kort genintroduktion. Det gamle mestringsbevis bevares i loggen. |
| **Klar til større udfordringer** | `klar_til_udfordring` | `anvendelse` på et højere niveau, interleaving med beslægtede mål, eller næste mål i grafen. Klassetrinnet er ikke et loft (ejerens retning). |

### 4.5 Diagnostik: reglen om ukendt stof

**Ejerens krav:** En diagnostisk test må gerne komme før introduktionen. Et forkert svar på ukendt stof
må ikke automatisk tolkes som dokumenteret manglende mestring.

**Regel (FORSLAG):**
1. **Hvad diagnostikken er:** To opgaver pr. mål af *forskellige* former. Mindst én er `genkaldelse`
   eller `struktur`. Der gives ingen hints, ingen XP og ingen negativ feedback. Teksten lyder: "Vi
   tjekker, hvad du allerede ved. Det er helt fint ikke at vide det."
2. **Feedback:** Efter hvert svar vises det korrekte svar sammen med én forklarende sætning. Det er
   betingelsen for prætesteffekten.
3. **Begge opgaver rigtige:** `formodet_kendt`. Bekræftelsen sker ved et forsinket `tjek` på en tredje
   opgave.
4. **Én eller ingen rigtig:**
   - Uden eksponering: `ikke_mødt`. Det registreres som "rute: introduktion", ikke som evidens mod
     mestring.
   - Med eksponering: forkerte diagnostiske svar tæller som almindelig evidens, fordi stoffet er mødt.
5. **Stopregel:** Diagnostikken stopper efter 2 forkerte svar i træk inden for et emne. Resten af
   emnets mål sættes til `ikke_mødt`. Det begrænser antallet af fejl, som især yngre elever skal
   opleve (forskningens forbehold).
6. **Klassetrin 1–3:** Kun 1 opgave pr. mål, og kun hvis læreren har slået det til (ANTAGELSE: evidensen
   for prætest hos børn er uafklaret).
7. **Måle-spørgsmål pr. fag:** P-forslaget (`docs/subject-placement-design`, ikke merget) er
   diagnostik på emneniveau. Denne regel gør det muligt at lade placering påvirke *niveau* uden at
   påvirke *mestring*.

### 4.6 Mestringskriteriet og falsk mestring

**Samme dag:** `klaret_i_dag` (FORSLAG) kræver mindst 2 korrekte, uassisterede svar i `tjek` på 2
forskellige opgaver. Mindst ét af svarene skal være `genkaldelse`, `struktur` (med gætteloft ≤ 5 %)
eller `anvendelse`. Der må ikke være et aktivt flag om misopfattelse.

**Mestring:** `mestret` (FORSLAG) kræver `klaret_i_dag` (eller `formodet_kendt`) plus ét korrekt,
uassisteret svar i `tjek` på en opgave, eleven ikke har set i dag. Svaret skal gives mindst 20 timer
efter seneste eksponering eller øvelse i målet.

**Falsk mestring ved rent gæt (FUND: kombinatorik):**
- Kravet om mindst én `genkaldelse` med gætteloft ≈ 0 betyder, at en elev, der kun gætter, i praksis
  ikke kan nå `klaret_i_dag`.
- Med to MC-opgaver og to sikkert eliminerede svarmuligheder (50 % hver) ville en regel med kun
  `genkendelse` give falsk mestring i 25 % af tilfældene. Derfor tillader reglen det ikke.
- Til sammenligning giver dagens implicitte regel "3 korrekte i træk" på MC med 4 svarmuligheder
  1,6 % ved rent gæt og 12,5 % med delvis viden.

**Simulation som acceptkriterium (§11):** En simuleret elev, der gætter tilfældigt på hver opgave,
må nå `mestret` i under 1 % af målene på tværs af den pilotindholdspakke, der faktisk bruges.

**Falsk ikke-mestring (risiko):** Tvetydige opgaver og fejl i bedømmelsen (§4.2, æøå) giver forkerte
"fejl". Derfor:
- En rettet bedømmelsesfejl skal kunne genberegne tilstanden (§4.3, D-254 viser, at det sker).
- Læreren kan til enhver tid tilsidesætte tilstanden. Det logges som evidensen `lærervurdering`, og
  læreren har det sidste ord (PROJECT_VISION).

### 4.7 Repetition og glemsel

**Interval (FORSLAG, faste startværdier, som kalibreres senere):**

| Situation | Interval |
|---|---|
| Fra `klaret_i_dag` til første forsinkede tjek | ≥ 20 t |
| Fra `mestret` til næste repetition | 7 dage → 30 dage → 90 dage |
| Repetition lykkes | Næste trin i rækken |
| Repetition fejler | `genopfrisk`, og efter bedring et halveret interval |
| `formodet_kendt` → bekræftende tjek | ≥ 20 t |

Begrundelsen (FUND) er, at den første genkaldelse skal udsættes, og at længere intervaller koster
mindre end for korte (Cepeda 2008; Karpicke & Roediger 2007).

Når loggen har data nok (§12), kan en model af half-life-regression-typen erstatte de faste
intervaller. Det er en senere beslutning.

**Planlægning:** Repetitioner fylder højst ca. en tredjedel af en session (ANTAGELSE). Forfaldne mål
prioriteres efter, hvor længe de har været forfaldne, og efter hvor mange afhængige mål de har.
Interleaving bruges kun mellem mål, der alle er `introduceret` eller længere.

### 4.8 Determinisme og forklarlighed

- **Ingen tilfældighed** i tilstand, mestring eller belønning (PROJECT_VISION: "not a casino").
  Opgavevalget bruger allerede deterministiske tie-breaks (md5). Det fortsætter.
- **Forklaring til læreren:** Hver ændring af tilstanden har en forklaring, der kan vises. Eksempel:
  "Mestret 2026-11-04: korrekt uden hjælp på udfyld hul (3. nov.) og tidslinje (4. nov., 22 t efter
  øvelse)".
- **Ingen AI i vurderingen:** AI kan foreslå indhold og feedbacktekst (AI_GUIDELINES), men indgår
  aldrig i beregningen af tilstanden.

---

## 5. Den konkrete progression (FORSLAG)

### 5.1 Aktivitetstilstande

| # | Tilstand | Hvad eleven møder | Former (typisk) | Feedback | Hints | Evidens | Udgang |
|---|---|---|---|---|---|---|---|
| 0 | **Diagnostik** | 2 korte opgaver pr. mål. Framet som "hvad ved du allerede?" | Én genkaldelse/struktur + én anden | Korrekt svar + én sætning | Nej | Kun styring af ruten, når målet ikke er mødt (§4.5) | `formodet_kendt` eller `ikke_mødt` |
| 1 | **Introduktion** | 1–3 korte indholdskort (tekst ≤ 80 ord, billede, kilde, lyd eller eksempel) med oplæsning, afsluttet af ét indbygget forståelsestjek | Indholdskort + sandt/falsk eller MC | Forklarende | Ja | Ingen (eksponering registreres) | `introduceret` |
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
(ANTAGELSE).

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
| Undervis forudsætning | Fejl på et mål, hvis forudsætning er `genopfrisk` eller `ikke_mødt` | Gå til forudsætningen først |
| Genintroduktion | 2 fejlede `genopfrisk` | Kort genintroduktion → `introduceret` |
| Udfordring | `klar_til_udfordring` | Tilbyd `anvendelse` eller et højere niveau. Eleven kan sige nej. |

### 5.6 Læring over tid i stedet for antal rigtige svar

| Mål (FORSLAG) | Definition | Hvorfor |
|---|---|---|
| **Fastholdelsesrate** | Andelen af forsinkede tjek og repetitioner, der lykkes, pr. mål og pr. interval | Måler læring frem for præstation under øvelsen (FUND: spacing). |
| **Mestrede og fastholdte mål** | Mål, der er `mestret` og bestod den seneste repetition | Erstatter "antal rigtige" i lærerens og elevens visning. |
| **Falsk mestring** | Andelen af nyligt mestrede mål, hvor første repetition fejler | Overvåger, om kriteriet i §4.6 er for løst. |
| **Unødig repetition** | Andelen af repetitioner, der lykkes uden fejl gennem hele planen | Overvåger, om intervallerne er for korte. |
| **Tid til mestring** | Median-tid og antal opgaver fra `introduceret` til `mestret` | Til indholdsforbedring (tunge mål). |
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
| Diagnostik | Stav til: "Hvilket land besatte Danmark 9. april 1940?" (genkaldelse; en af dagens live-opgaver kan genbruges). Match par med 4 par (dato ↔ begivenhed, struktur). Fejler eleven, gives korrekt svar + én sætning, og H2 får status `ikke_mødt`. |
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
| Misopfattelse | `goed` er koblet til `overregularisering`. Feedbacken lyder: "Mange verber får -ed, men *go* er uregelmæssig: *went*." Bemærk, at overregularisering er en normal udviklingsfase (ANTAGELSE), så feedbacken er neutral. |
| Guidet øvelse | Match par med 4 par: grundform ↔ datid. Udfyld hul med ordbank. |
| Selvstændig genkaldelse | Udfyld hul uden ordbank: "Yesterday she ___ (see) a dog". Stav til: "Skriv datid af *eat*". |
| Anvendelse | Byg sætning ud fra ordbrikker. Find fejlen: "Last week we goed to London". |
| Note | Interleaving af ordmateriale virker dårligt (FUND). Derfor blandes E2 med andre mål først i anvendelsesfasen og ikke i den guidede øvelse. |

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
| Anvendelse | Interleaving (FUND: stærkest i matematik): sammenligning blandet med forlængelse og afkortning. Tekstopgave: "Ali spiser 2/6 af en kage, Bo spiser 1/3. Hvem spiser mest?" |
| Bedømmelse | Kræver en rigtig numerisk evaluator (§4.2: `[a-z0-9]`-normaliseringen er uegnet). |

---

## 6. De 16 opgaveformer

Status og fakta stammer fra ROADMAP-tabellen og `interaction-kinds.ts`. Den pædagogiske analyse er
FORSLAG/ANTAGELSE. **Ingen form er låst til én fase.** Tabellen angiver formens *primære* styrker.

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
| 13 | **Match par** (BYGGET, ikke servable) | Struktur og relationer. Begreb ↔ definition. | Relatere | Pr. par rigtigt/forkert (findes) + én sætning pr. forkert par | Antal par (2–6), ligheden mellem dem | Ét par låst fast | **Ingen** ved n = 2, **svag** ved n = 3, **stærk** ved n ≥ 4 (§4.2) | Guidet øvelse (n = 2–3). Tjek kun ved n ≥ 4. |
| 14 | **Kategorisering** (PLANLAGT) | Begrebsdannelse og diskrimination | Klassificere | Pr. element: rigtig kategori og hvorfor | Antal elementer og kategorier, grænsetilfælde | Ét element placeret | **Stærk** ved n ≥ 4 | Guidet → anvendelse. Velegnet til interleaving. |
| 15 | **Hotspot/kort** (PLANLAGT) | Geografisk/visuel lokalisering | Genkende/lokalisere | Det rigtige område markeret | Områdets størrelse og antallet af områder | Zoom til region | **Middel** (afhænger af arealandelen) | Historie/geografi: introduktion og tjek |
| 16 | **Langt lærersvar** (FINDES, 0 opgaver) | Forklaring og ræsonnement | Forklare/vurdere | Lærerens feedback. **I dag når den ikke eleven** (`get-reviewed-answers` har ingen UI). | Spørgsmålets kompleksitet | Sætningsstartere | **Stærk** for `forklaring`, når læreren har vurderet. Forsinket. | Anvendelse og afslutning af forløb |

**Tværgående fund og forslag til formerne:**
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

### 7.1 Belønning: principper (FORSLAG)

**Udgangspunkt (FUND, §2.3):**
- Systemet belønner korrekte førstegangssvar.
- Det belønner også volumen: svar-quests, aktivitetsranglisten og streak via ét svar om dagen.
- Det belønner login uden læring.
- Repetition giver kun 2 XP + 1 mønt.

Uden ændringer vil den nye progression blive modarbejdet: en elev, der vil maksimere XP, vil helst
springe introduktionen over og svare hurtigt på nye spørgsmål.

| # | Princip | Begrundelse |
|---|---|---|
| R1 | **Diagnostik giver 0 XP og 0 mønter.** | Ingen grund til at gætte eller dumpe bevidst. Belønningen er at springe frem, hvis man kan stoffet. |
| R2 | **Introduktion giver en lille, engangs-XP pr. mål**, udløst af det indbyggede forståelsestjek (ikke af tid). | Introduktionen må ikke føles som tab af tid. Den lille størrelse gør det uinteressant at farme. |
| R3 | **Øvelse giver en lille, fast XP pr. gennemført opgave**, uanset hints og med et loft pr. mål pr. dag. | Hjælpsøgning må ikke koste. Loftet fjerner gevinsten ved volumen. |
| R4 | **Selvstændigt tjek** svarer til standard-XP (som i dag) ved korrekt svar. | — |
| R5 | **Forsinket repetition** giver den højeste XP pr. svar. | Gør det attraktivt at vende tilbage (spacing). Den nuværende repetitionsbelønning (2/1, D-211) er lavet til "puljen er brugt op" og passer ikke til planlagt repetition. |
| R6 | **Mestringsbonus** er en engangsbelønning pr. mål ved `mestret` (mønter + evt. kosmetik). | Den største belønning kræver forsinket, uassisteret og varieret evidens, så den kan ikke nås ved at gætte. |
| R7 | **Ingen belønning afhænger af svartid.** Svartid bruges kun som gættesignal. | Gamification-evidensen og vores krav: ingen hastighedsincitament. |
| R8 | **Quests omdefineres til læringshandlinger:** "genopfrisk 3 mål", "lær ét nyt mål", "ret en misopfattelse". De erstatter "svar 5" og "svar 20". | Volumen-quests strider mod R3's loft. |
| R9 | **Streak:** en dag tæller ved mindst én gennemført læringshandling (introduktion, tjek eller repetition), ikke ved ét vilkårligt svar. | Små ændringer, samme fastholdelse. |
| R10 | **Ranglister** rangerer aldrig efter volumen. Om klassen skal se "mestrede mål", er en ejerbeslutning (LP-10). | Social sammenligning kan demotivere svage elever (ANTAGELSE). |

**Acceptkriterium for belønningsneutralitet (§11):** For den samme elev skal den hurtige rute
(diagnostik bestået) give mindst lige så meget XP pr. minut som den fulde rute. Der må ikke være
incitament til bevidst at dumpe diagnostikken.

**Login-belønningen (25–150 mønter)** er stor i forhold til læring (5 mønter pr. korrekt svar). Om den
skal nedskaleres eller kobles til en læringshandling, er en ejerbeslutning (LP-9).

**Rækkefølge:** Belønningerne ændres først, når tilstandsmotoren er live for en pilotklasse (§10).
Ellers mangler R5 og R6 deres grundlag. Integritetsfundene i §2.5 lukkes før.

### 7.2 Øvrige systemer

| System | Konsekvens (FORSLAG) |
|---|---|
| **Niveaumotoren** (`LEVEL_ENGINE`, 1–10.000) | Bruges fortsat til at vælge *niveau*: opgaver inden for et mål og målets niveauinterval. **Vigtigt:** folden tager i dag alle første svar med. Aktiveres motoren, *efter* at diagnostik er indført, skal folden udelukke `diagnostik` og assisterede svar. Ellers sænker et forkert svar på ukendt stof elevens niveau. Det strider mod ejerens krav og er beslutning LP-5. Aktiveres motoren *før*, findes problemet ikke, fordi alle svar så er "tjek". |
| **Måle-spørgsmål pr. fag** (P1–P9) | Bliver diagnostik på emneniveau (§4.5). Placering påvirker niveau, ikke mestring. Ejerens krav "et fag må ikke påvirke et andet" gælder også tilstanden pr. mål, fordi den er pr. fag og mål. |
| **Elevhistorik** (`question_attempts`, D-266) | Er fundamentet. **Før migrationen anvendes**, bør den udvides med `mode` (diagnostik/øvelse/tjek/repetition/anvendelse), `hints_used` (0–3), `response_ms` og `objective_ids` (LP-3). Gentagelsens `round_no` (H5) bevares. |
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
| **L0** | Ejeren godkender læringsmodellen og LP-beslutningerne (§14). Read-only produktionstjek (§2.6). Integritetsfundene (§2.5) lukkes. Dokumentkonflikterne (§2.4) rettes. | — | D-fil med beslutninger. Tjek dokumenteret. |
| **L1** | **Historikfundament:** `question_attempts` udvides (LP-3) og anvendes (D-110). D-266 PR 3–5. Bedømmelsesfejlen for æøå og tal rettes. | L0, H1–H4 | Hvert svar logges med tilstand, hints og tid. Replay-test grøn. |
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
| A1 | Et forkert svar i `diagnostik` på et mål uden eksponering giver tilstanden `ikke_mødt` og ændrer ingen mestringsevidens. | Unit (fold) |
| A2 | Et forkert diagnostisk svar påvirker aldrig `student_subject_level` (efter LP-5). | PGlite |
| A3 | Et svar med `hints_used > 0` bidrager aldrig til `klaret_i_dag` eller `mestret`. | Unit |
| A4 | `mestret` kræver ≥ 1 korrekt, uassisteret svar i `tjek` ≥ 20 t efter seneste eksponering/øvelse, på en opgave, eleven ikke har set samme dag. | Unit (tidsinjektion) |
| A5 | `klaret_i_dag` kræver ≥ 1 svar af evidenstypen genkaldelse/struktur(≤ 5 %)/anvendelse. To MC-svar alene er aldrig nok. | Unit |
| A6 | Simulation: en elev, der gætter tilfældigt, når `mestret` i < 1 % af målene i pilotpakken. Seed er fast (deterministisk). | Unit (simulation) |
| A7 | Match par med n < 4 giver aldrig mestringsevidens. | Unit |
| A8 | Tilstanden er en ren funktion af loggen: replay af samme hændelser giver identisk tilstand. En ændret regel giver ny tilstand uden at slette noget. | Unit (replay) |
| A9 | Evidens i ét fag ændrer aldrig tilstand eller niveau i et andet fag. | Unit + PGlite |
| A10 | Lærerens "gennemgået i klassen" registrerer eksponering. Appen tilbyder så ikke introduktionen igen. | E2E |
| A11 | Diagnostik giver 0 XP og 0 mønter. Ingen XP afhænger af `response_ms`. | PGlite |
| A12 | Neutralitet: den hurtige rute giver ≥ XP pr. minut end den fulde rute (simuleret elev). | Unit (simulation) |
| A13 | Tre fejl i samme mål i én session giver `brug_for_hjælp` og skift til et andet mål. Der er aldrig en blindgyde. | Unit + E2E |
| A14 | En repetition kommer tidligst efter intervallet og senest ved næste session efter forfaldsdatoen, hvis eleven arbejder i faget. | Unit |
| A15 | Med flaget fra er gnq's svar byte-identisk med i dag (release-gatens paritetstjek). | Unit (release-gate) |
| A16 | Eleven kan aldrig læse facit, misopfattelseskobling eller andre elevers tilstand. Læreren kan kun læse egne elevers. | PGlite (RLS) |
| A17 | Bedømmelsen skelner "æ"/"ae" og "1,5"/"15". | PGlite |
| A18 | Hver tilstandsovergang har en forklaringstekst, der kan vises for læreren. | Unit |

---

## 12. Evaluering: lærer eleverne mere?

**Spørgsmål:** Fastholder elever i progressionen mere viden efter 1 og 4 uger end med dagens
test-først-løkke? Og bliver mestringen falsk eller repetitionen unødig?

**Design (FORSLAG; skala: pilotskole med 10–100 elever):**
- **Indenfor-elev-sammenligning på målniveau:** Pilotforløbets mål deles tilfældigt, men med fast
  seed (deterministisk og dokumenteret), i to grupper pr. elev:
  - halvdelen gennemgås med progressionen;
  - halvdelen gennemgås som i dag (kun test med feedback).

  Hver elev er dermed sin egen kontrol. Det mindsker problemet med få elever. Om det er etisk
  acceptabelt, er beslutning LP-11. Alternativet er en sammenligning mellem klasser, som er svagere.
- **Måling:**
  - Forsinkede tjek efter 1 og 4 uger på *holdt tilbage* opgaver, der ikke bruges i øvelsen og ikke
    belønnes.
  - Fastholdelsesrate (§5.6).
  - Andel falsk mestring.
  - Andel unødig repetition.
  - Tid brugt.
  - Frafald under introduktionen.
- **Analyse:** Deskriptiv statistik med effektstørrelse og konfidensinterval. Ingen påstande om
  signifikans ved små tal. Resultaterne præsenteres for ejeren før en bredere udrulning.
- **Kvalitativt:** korte interview med lærere og elever om introduktionen, feedbacken og om
  belønningen føles retfærdig (Hanghøj: lærerens rolle).
- **Etik og GDPR:**
  - Forældre informeres.
  - Analysen sker pseudonymiseret.
  - Resultaterne bruges ikke til at bedømme den enkelte elev.
  - Holdt-tilbage-opgaverne må ikke stresse. De er korte og uden belønning.

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

## 14. Ejerbeslutninger (åbne)

| # | Beslutning | Anbefaling |
|---|---|---|
| LP-1 | Godkendes læringsmodellen (§4) og progressionen (§5) som retning? | Ja, som retning. Detaljer pr. trin. |
| LP-2 | Hvor små skal læringsmålene være (5–15 pr. emne)? | 5–15. Pilot afgør. |
| LP-3 | Udvides `question_attempts` med `mode`, `hints_used`, `response_ms` og `objective_ids` **før** anvendelse? | Ja. Det er billigst nu. |
| LP-4 | Mestringskriterierne i §4.6 (2 opgaver, genkaldelse, ≥ 20 t, ingen hints) | Ja som startværdier. Kalibreres i L8. |
| LP-5 | Skal niveaumotorens fold udelukke diagnostik og assisterede svar? | Ja, i samme PR som diagnostikken. |
| LP-6 | Er introduktionen obligatorisk, eller kan den springes over uden diagnostik? | Obligatorisk, medmindre diagnostikken er bestået eller læreren har markeret "gennemgået". |
| LP-7 | Må delresultater (fx par i Match par) bruges som *evidens*, mens belønningen forbliver binær? | Ja. |
| LP-8 | Belønningsprincipperne R1–R10 | Ja som retning. Konkrete beløb i L7. |
| LP-9 | Skal login-belønningen nedskaleres eller kobles til en læringshandling? | Kobles til ≥ 1 læringshandling. |
| LP-10 | Skal klassen kunne se hinandens mestrede mål (rangliste)? | Nej i piloten. Kun eget og lærerens. |
| LP-11 | Er det acceptabelt at fordele mål tilfældigt (fast seed) mellem progression og dagens løkke i evalueringen? | Ja, med information til forældrene. |
| LP-12 | Diagnostik i klassetrin 1–3 | Kun hvis læreren har slået det til, med 1 opgave pr. mål. |
| LP-13 | Pilotforløb: historie = besættelsen, engelsk = datid. Hvad i dansk? | Dansk: et staveområde (passer til Stav til og diktat). |
| LP-14 | Skal matematik være et fag i Lærlig? | Separat produktbeslutning. Modellen understøtter det, men det kræver en numerisk evaluator. |

---

## 15. Kilder

Fuld referenceliste med verificeringsstatus står i
[learning-progression-evidence.md](learning-progression-evidence.md). De kilder, der er brugt direkte
i dette dokument:
- Adesope m.fl. 2017; Agarwal, Nunes & Blunt 2021.
- Aleven m.fl. 2003; Baker m.fl. 2004.
- Brunmair & Richter 2019; Bundsgaard & Kreiner 2019.
- Cepeda m.fl. 2006, 2008; Corbett & Anderson 1995.
- Danielson m.fl. 2025; Deci, Koestner & Ryan 1999.
- Hanghøj 2013; Hanghøj & Brund 2011; Hanghøj, Lieberoth & Misfeldt 2018.
- Kalyuga m.fl. 2003; Kalyuga 2007.
- Karpicke, Blunt & Smith 2016; Karpicke & Roediger 2007.
- Kelly, Wang & Thompson 2015; Kluger & DeNisi 1996.
- Koedinger & Aleven 2007; Kornell, Hays & Bjork 2009; Kulik, Kulik & Bangert-Drowns 1990.
- Marsh m.fl. 2007; Pelánek 2016.
- Renkl & Atkinson 2003; Richland, Kornell & Kao 2009.
- Rohrer m.fl. 2020; Rowland 2014.
- Sailer & Homner 2020; Settles & Meeder 2016; Slavin 1987.
- van der Kleij, Feskens & Eggen 2015; Vlach & Sandhofer 2012; Yang m.fl. 2021.

Kodegrundlaget er `main` @ `6a55282`. Filhenvisningerne i §2 kan efterprøves direkte i repoet.
