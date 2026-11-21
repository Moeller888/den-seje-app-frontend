# Lærligverse: integrationskontrakt mod H4/H5, didaktisk evalueringsmodel og demoguide (D-323)

> **Terminologi, rettet 2026-11-03 (D-329).** I projektets kanoniske dokumenter er **H4** D-266's »nye indsendelser af lange svar før bedømmelse«, og **H5** er svarloggen `question_attempts` (D-273). Dette dokument brugte »H4« løst om *målretning af læringsmål*. Den funktion hedder nu **målretning (D-329)** og er bygget slukket som standard. Hvor der nedenfor står »H4« om lærerbedømt fritekst, er det D-266's H4. Hvor der står »H4« om mål, læs »målretning (D-329)«.

Status: **udkast til ejerbeslutning**. Dokumentet ændrer ingen kode, ingen database og ingen deploy.
Det beskriver, hvad Lærligverse forventer af læringsmotoren (H4/H5), når den findes. Det træffer **ingen**
LP-2- eller LP-13-beslutning og forudsætter ikke, at H5 er anvendt i produktionen.

Kanoniske kilder, som dette dokument bygger på og ikke gentager:
- `docs/learning-progression-design.md` (LPD) og `docs/learning-progression-l1-contracts.md` (K1–K9): læringstrin, evidens og niveau-fold.
- `docs/learning-progression-evidence.md` og `docs/learning-progression-source-verification.md`: forskningsgrundlaget med verificeringsstatus.
- `docs/AI_GUIDELINES.md`: ingen AI-funktion i Lærligverse.
- Lærligverse-beslutningerne D-306 … D-322 ligger i de åbne Lærligverse-PR'er (#541, #542, #544, #546, #547, #552, #561 og F3-B-PR'en). Indtil de er merget, er de udkast.

Mærkning i hele dokumentet: **[FAKTA]** = verificeret i kode, test eller kilde. **[TOLKNING]** = vores
læsning af en kilde eller kode. **[HYPOTESE]** = noget, vi tror, men ikke har målt.

---

## 1. Grundregel

**[FAKTA]** Serveren bestemmer, og spillet bidrager ikke (L1-kontrakterne, "Grundregel"). I Lærligverse er
grænsen håndhævet tre steder:
1. Protokollen `laerligverse.bridge/2` har ingen felter for XP, mønter, mastery, evidens eller tokens fra spillet. En besked med ukendte felter afvises (`invalid_message`).
2. Værten (Lærlig-siden) ejer sessionen og kalder backend. Spillet kører på en anden origin og får aldrig JWT, refresh-token eller anon-nøgle (D-321, bevist i isoleret E2E i tre browsere).
3. Feltet `evidence` i `task.result` er **kun visning**. Serveren har sat det. Spillet kan ikke sætte det.

## 2. Felt-for-felt-kontrakt mod H4/H5

Kolonnen "I dag" beskriver produktionens legacy-sti (`get-next-question` → `process-event` →
`process_question_attempt`). "H5" beskriver repoets `question_attempts`/`process_*_v2`, som **ikke er
anvendt i produktionen**.

| Begreb | Hvem ejer det | Bro-felt (spil ↔ vært) | I dag (legacy) | Med H4/H5 (forventning) | Åbent |
|---|---|---|---|---|---|
| `objective_id` | Server (LP-2/LP-13) | `task.request.objectiveId` er et **ønske** fra spillet. Serveren må afvise eller erstatte det | Kan ikke målrettes. `get-next-question` tager kun `{subject}`. Derfor C3-reglen: et tilfældigt spørgsmål må ikke vises som 1940-opgaven [FAKTA] | Serveren vælger en instans til objective og trin og returnerer det faktiske objective | LP-2/LP-13: id-format og hvem der må ønske hvad |
| Læringstrin (`purpose` → `mode`) | Server | Spillet sender `purpose` (`introduction`/`practice`/`check`/`review`/`application`). Serveren svarer med `mode` | `quiz_v1` uanset ønske | `mode` fra D-277's enum, sat af serveren ud fra elevens tilstand (K4) | LP-13: må spillet bede om `check`, eller kun foreslå? |
| Instans | Server | `instanceToken`, uigennemsigtig. Værten mapper den til `question_instance_id` | Én åben instans pr. elev, serverejet (gnq v173) [FAKTA] | Uændret princip. Instansen bærer objective, mode og indholdsversion | — |
| Submission id | Vært | Spillet ser det ikke. Værten laver ét pr. `act` og genbruger det ved genforsøg (`submitRetry: "server-idempotent"`) | CAS på `answered=false` + gemt dom ved gentagelse [FAKTA] | `submission_id` i `process_*_v2` med udfaldene `recorded`/`replay`/`submission_conflict`/`stale_round`/`round_closed` | Mapping af `submission_conflict` til en elevtekst |
| Hjælp (hints) | Server | `hint.request` → `hint.show`. Antallet kommer fra serveren (`hintsAvailable`) | Ingen serverlog af hints i legacy | Hints logges på serveren (`hints_used`). Forsøg med hints er `practice` (K4) | — |
| Selvstændighed | Server | Afledt: `mode ∈ {check, review, application}` og `hints_used = 0` | Ikke registreret | K4: kun selvstændige forsøg kan folde niveau | Tæller en revision efter feedback som selvstændig? (LP-13) |
| Bedømmelse | Server | `act` sender kun elevens handling (`optionId`/`text`/`order`) | `process_question_attempt` [FAKTA] | `process_*_v2`. Fritekst kan få `pending` (lærerbedømt, H4) | H4: lærerbedømt fritekst og refleksion |
| Feedback | Server | `feedback.text`, `feedback.correctAnswer`, valgfri tilbagevisning pr. mulighed | Fast tekst | Tilbagevisning pr. forkert mulighed (misopfattelse) som indholdsfelt | Indholdsformat for `optionFeedback` |
| Evidens | Server | `evidence: none/practice/evidence`, kun visning | Ikke registreret | LP-5/K4/K5 | — |
| Mastery | Server | **Intet felt**. Spillet får aldrig mastery at vide | Inaktiv i produktionen [FAKTA, memory/LPD] | H5 + K7 | Om spillet må vise "du er klar til genbesøg" |
| Genbesøg | Server | Spillet kan kun bede om `purpose: "review"`. Tidspunktet ejes af serveren | Findes ikke | Forsinket tjek, helst efter en nats søvn (LPD §4.3, K7.4). Interval = heuristik (se §4) | Interval og antal: ejerens/LP-13 |
| Belønning | Server | **Intet felt**. Værten viser saldo fra serveren | 10 XP/5 mønter første rigtige, 2/1 gentagelse (D-211) [FAKTA] | Uændret, med mindre ejeren beslutter andet | — |

**Bro-ændringer, som H4/H5 kræver** [TOLKNING]: ingen ændringer i spillet. Ændringerne ligger i værtens
adapter (`LaerligTaskService`): den skal kalde v2-endpoints og mappe de nye udfald til
`outcome`/`retryable`. Protokollen har allerede `pending` (lærerbedømt) og `review`.

## 3. Arkivskabets otte trin mod kontrakten

| Trin (D-322) | Bro-kald | Hvad H5 skal registrere | Kan blive evidens |
|---|---|---|---|
| 1 Introduktion + forståelsestjek | intet | Eksponering for målet (LPD §5.3, ikke bygget). **Værten** rapporterer det, ikke spillet | nej |
| 1b Arkivkort | intet (lokalt) | intet | nej |
| 2 Vend dokumentet | intet | intet (kan senere blive procesdata, se §5.4) | nej |
| 3 Hypotese | `request(practice)` + `act` | forsøg, `hints_used`, mode `practice` | nej |
| 4 Feedback | svar på `act` | — | — |
| 5 Revision | ny `request(practice)` på samme objective | nyt forsøg på ny instans | nej |
| 6 Ny anvendelse | `request(check)` | forsøg uden hints | **ja** |
| 7 Refleksion | intet (lokalt) | intet, før H4 kan modtage lærerbedømt fritekst | nej |
| 8 Genbesøg | `request(review)` efter serverens interval | forsinket forsøg | **ja** |

### 3a. Kontraktkontrol: hvad findes i dag (verificeret i koden 2026-11-02)

| Begreb | Bro-protokol (`laerligverse.bridge/2`) | Rigtig adapter (`LaerligTaskService`, legacy) | Testadapter (`FakeTaskService`) | Kun forslag |
|---|---|---|---|---|
| Læringsmål | felt findes (`objectiveId`) | **ignoreres** (kun fag + lærerens domæner) | vælger opgave pr. mål | rigtige id'er: LP-2/LP-13 |
| Opgaveinstans | `instanceToken` | `question_instance_id`, én åben pr. elev | lokal instans | — |
| Læringstrin | `purpose` → `mode` | altid `quiz_v1` | `practice`/`check`/`review` → mode | D-277/K4 |
| Submission-id | ikke i spillet; værten laver det | **findes ikke**: idempotens pr. instans (CAS) | pr. submission | H5 `_v2` |
| Hjælp | `hint.request`/`hintsAvailable` | **0 hints**, `hint()` afviser | hints fra opgaven | serverlog i H5 |
| Selvstændighed | afledt, intet felt | **ikke registreret** | `check`/`review` uden hints | K4 |
| Bedømmelse | kun på serversiden | `process_question_attempt` (rigtig server) | lokal sammenligning (mock) | `_v2` |
| Feedback | `feedback.text`/`correctAnswer` (+ tilbagevisning) | fast tekst + rigtigt svar | tilbagevisning pr. mulighed | indholdsformat |
| Evidens | `evidence` (kun visning) | **altid `none`** | **forenklet K4**: `check`/`review` uden hints = `evidence`. Ignorerer K4's krav om registreret eksponering og evidensgyldighed (K5) | LP-5/K4/K5 |
| Mastery | **intet felt** | inaktiv i produktionen | intet | H5 + K7 |
| Genbesøg | `purpose: "review"` | findes ikke | knap »spol frem« (lokal) | interval: LP-13 |
| XP og mønter | **intet felt** | 10/5 første rigtige, 2/1 gentagelse (D-211) | lokal saldo (mock) | uændret |

### 3b. Fra handling til progression: hvad vi kan og ikke kan påstå

| Niveau | Hvad det betyder | Hvad F3 kan observere i dag | Må kaldes |
|---|---|---|---|
| 1 Handling | Eleven klikker, vender, vælger | Lokalt i spillet; sendes ikke | aktivitet |
| 2 Rigtigt svar | Serveren bedømmer svaret rigtigt | Rigtig backend: ja (`was_correct`). Kan være gæt (25 % ved fire muligheder) | rigtigt svar |
| 3 Forståelse | Rigtigt svar **og** en begrundelse, der passer | Begrundelsen vælges, men sendes og bedømmes ikke | — (kun lærerens observation) |
| 4 Selvstændig anvendelse | Rigtigt i en ny situation uden hjælp | Kun i testadapteren; legacy kender ikke hints eller mode | — |
| 5 Fastholdelse | Rigtigt efter en forsinkelse | Genbesøget er lokalt og forsinkelsen springes over | — |
| 6 Dokumenteret progression | Gentagne selvstændige, forsinkede rigtige svar på samme mål | Kræver målretning (D-329), H5 + L1 K1 (mode/hints/forsøg) og K4/K7 | — |

**Konklusion:** I dag kan F3 dokumentere niveau 2 mod den rigtige backend. Niveau 3–6 er designet og vist i
testadapteren, men **ikke dokumenteret**.

### 3c. Foregriber F3 ejerbeslutninger?

| Område | Hvad F3 gør | Konflikt? |
|---|---|---|
| LP-2 (mål-id'er) | Prototype-id'er `hist.besaettelsen.h4.kilde/overfoersel/genbesoeg` i spillets beslutningspunkter og testadapteren | **Nej, så længe de forbliver prototype.** De må ikke kopieres til `questions.learning_objective` eller til produktionsindhold |
| LP-13 (trin) | Revision = `practice`; skuffe = `check`; genbesøg = `review` | **Forslag.** Om en revision efter feedback kan tælle som selvstændig, er ejerens beslutning |
| H4 | Refleksionen er lokal fritekst; intet sendes | Nej |
| H5 | Intet i F3 kalder `_v2`. Den rigtige adapter bliver bevidst på legacy | Nej |
| K4/LP-5 | Testadapterens evidensregel er forenklet (se 3a) | **Risiko for misforståelse.** Badges som »Tæller som selvstændig opgave« i demoen er testadapterens, ikke en norm |

## 4. Forskningsgrundlag

Det almene grundlag (genkaldelse, spredning, feedback, hints, mestring, spil) er verificeret i
`docs/learning-progression-source-verification.md`. Her står kun det, der er særligt for **kildearbejde**
og **spil i undervisningen**.

| Påstand | Kilde | Status | Brug i Arkivskabet |
|---|---|---|---|
| Historikere ser på kildens afsender, før de læser teksten (sourcing). De sætter kilden i kontekst og sammenholder kilder (contextualization, corroboration). Gymnasieelever gør det sjældent | Wineburg, S. S. (1991). Historical problem solving: A study of the cognitive processes used in the evaluation of documentary and pictorial evidence. *Journal of Educational Psychology*, 83(1), 73–87 | **[FAKTA, bibliografisk + sekundære referater; fuldtekst ikke læst]** 8 historikere og 8 elever, tænke-højt-studie | Begrundelse for "Vend dokumentet" før valget og for de fire spørgsmål |
| Et dokumentbaseret forløb ("Reading Like a Historian") gav effekt på historisk tænkning, faktuel viden, generel ræsonnering og læseforståelse | Reisman, A. (2012). "Reading like a historian": A document-based history curriculum intervention in urban high schools. *Cognition and Instruction*, 30(1), 86–112 | **[FAKTA, abstract]** 236 elever i 11. klasse, 5 skoler i San Francisco, et helt forløb. Effektstørrelser ikke læst | Støtter retningen (kildearbejde kan læres), **ikke** at et kort spil giver samme effekt |
| Informationsrig feedback havde større effekt (d = 0,99) end forstærkning/straf (d = 0,24); 17 % af effekterne var negative | Wisniewski, Zierer & Hattie 2020 (kildeverifikation §14) | **[FAKTA, fuldtekst]** metaanalyse, 435 studier | Tilbagevisning pr. forkert valg, der peger på et felt. At **netop vores** tilbagevisninger virker, er en **[HYPOTESE]** |
| MC kan indlære forkerte muligheder (Marsh), og feedback reducerer det (Butler & Roediger) | Marsh m.fl. 2007; Butler & Roediger 2008 (kildeverifikation §22) | **[FAKTA, abstracts]** studerende | Feedback efter hvert MC-svar, også i øvelse |
| Læreren må kunne skifte mellem roller for at facilitere spilscenarier | Hanghøj 2013 (kildeverifikation §20) | **[FAKTA, sekundært citat af abstract]**; Hanghøj & Brund 2010 kun bibliografisk | Pilotplanen kræver lærerens opsamling (§6). At opsamlingen er nødvendig i **dette** spil: **[TOLKNING]** |
| Revision efter feedback styrker forståelsen | — | **[DESIGNHYPOTESE]** Ingen kilde i repoet er verificeret for netop revision på en ny instans | Trin 5. Måles kun indirekte |
| Overførsel til en ny påstand eller periode | Reisman 2012 målte bl.a. historisk tænkning på nye dokumenter | **[TOLKNING]** af et abstract | Skuffen og overførselsopgaverne i §5 |
| Forsinket genbesøg giver bedre fastholdelse | Rowland 2014; Cepeda 2008 (kildeverifikation §1, §6) | **[FAKTA i laboratoriet]**, mest voksne/studerende. Overførsel til 8. klasse og kildearbejde: **[TOLKNING]** | Trin 8. Intervallet er en **[UDVIKLERANTAGELSE]** (LPD §4.3) |
| At læse ophavet på **alle** kilder før valget er den rigtige mekanik | Wineburg 1991 (sourcing) | **[TOLKNING]** | Arkivskabet kræver, at alle dokumenter vendes (D-322 QA) |
| "Spildidaktik" som Hanghøj-begreb | — | **[IKKE UNDERSTØTTET]** (kildeverifikation §20) | Bruges ikke. Hanghøj bruger "spilscenarier" og "scenariedidaktik" |
| Et kort spilforløb flytter elevernes kildekritik målbart | — | **[HYPOTESE]** | Det er det, evalueringen i §5 skal afprøve |
| Arkivkortets sortering hjælper overførslen til nye kilder | — | **[HYPOTESE]** | Måles kun indirekte (§5.2) |

## 5. Evalueringsmodel

### 5.1 Design

| Del | Hvad | Hvornår | Hvem bedømmer |
|---|---|---|---|
| Prætest | 4 kildeopgaver af samme type som skuffen (ny påstand, fire kilder med bagside) + 1 åbent spørgsmål "Hvad spørger du en kilde om?" | Før forløbet | Server (MC) + lærer (åbent, rubrik §5.3) |
| Forløb | Arkivskabet (8 trin) **eller** referenceaktivitet | Samme lektion | — |
| Posttest | Parallel version af prætesten (andre påstande og kilder) | Straks efter | Som prætest |
| Overførsel | 2 opgaver fra en **anden periode** (ikke besættelsen) med samme fire spørgsmål | Straks efter | Som prætest |
| Forsinket genbesøg | Parallel version + 1 overførselsopgave | Tidligst næste dag, helst 7 dage efter (LPD §4.3; intervallet er en heuristik) | Som prætest |

**Referenceaktivitet** [TOLKNING]: samme indhold (de samme kilder, påstande og feedbacktekster) som et
papirark eller en almindelig Lærlig-quiz uden spilverden, med samme tidsforbrug. Så måler sammenligningen
spillet og sekvensen, ikke indholdet. Fordeling: hele klasser (pilotskala, ikke elev-randomisering).

### 5.2 Mål

| Mål | Udregning | Hvad det IKKE viser |
|---|---|---|
| Læring | Post − præ på parallelle versioner | Langtidshukommelse |
| Fastholdelse | Forsinket − præ | Læring fra andre lektioner imellem |
| Overførsel | Overførselsopgaver (anden periode) | Generel kildekritik |
| Proces | Antal vendte dokumenter, valgt begrundelse, revision brugt | At eleven forstod. Det er adfærd, ikke læring |
| Gætteniveau | 25 % ved fire muligheder. Derfor tæller det åbne spørgsmål og overførslen tungt | — |

Proces-data findes i dag **kun lokalt i spillet** og sendes ikke. At sende dem kræver en ejerbeslutning og
en privatlivsvurdering (`AI_GUIDELINES`/GDPR).

### 5.3 Rubrik til det åbne svar (lærerbedømt)

| Point | Kriterium |
|---|---|
| 0 | Nævner ingen af de fire spørgsmål |
| 1 | Nævner ét spørgsmål (fx "hvem") |
| 2 | Nævner to eller tre |
| 3 | Nævner alle fire **og** forklarer, at den bedste kilde afhænger af påstanden |

### 5.4 Kvalitetskriterier før en pilot

1. En historielærer har godkendt alt materiale (D-310/D-322 §Lærergennemgang).
2. Parallelle testversioner er afprøvet på et par elever uden for piloten (lige sværhed, **[HYPOTESE]** indtil målt).
3. Hver forkert mulighed har en tilbagevisning, og hver kilde har fem felter (håndhævet af test, D-322).
4. Ingen elevdata uden for Lærlig. Samtykke og forældreinformation efter skolens praksis.
5. Elever kan gennemføre alt med tastatur og skærmlæser (E2E dækker tastatur og fokus; skærmlæser er **ikke** afprøvet med et rigtigt hjælpemiddel).
6. Resultaterne fortolkes som pilot: én eller to klasser, ingen generalisering.

### 5.5 Dataminimering

Princip: intet nyt persondata uden et godkendt formål. **I dag sendes intet af nedenstående; det bliver i
browserfanen.**

| Data | Kategori | Vurdering |
|---|---|---|
| Elevens svar på en server-opgave | 1. Nødvendig for bedømmelse | Sendes allerede (legacy) |
| Hjælp brugt (hints) | 1. Nødvendig for at skelne støttet/selvstændig (K4) | Først med H5 |
| Valgt begrundelse | 2. Kan forbedre feedback (sammenlign begrundelse med fejl) | Kun hvis feedbacken faktisk bruger den. Kræver beslutning |
| Revision brugt (ja/nej) | 2. Kan forbedre forløbet | Udledes allerede af to forsøg på samme mål; intet ekstra felt nødvendigt |
| Hvilke dokumenter der vendes | 3. Forskning/produktanalyse | Kun i en pilot med samtykke og aggregeret, ikke pr. elev i drift |
| Tid brugt pr. dokument | 4. Utilstrækkeligt begrundet | Indsamles **ikke**. Tid måler ikke forståelse og er følsom adfærdsdata |
| Fritekstrefleksion | 3/4. Kan indeholde alt, også personlige oplysninger | Sendes **ikke**. Hvis læreren skal se den, kræver det H4, en lærerbedømt arbejdsgang og en privatlivsvurdering |

## 6. Pilotplan (forslag)

1. **Forudsætning**: backend kan målrette et objective (D-329, bygget, slukket) og registrere `mode` og `hints_used` (H5 + L1 K1). Indtil da kan piloten kun køre på testadapteren og **uden** registrering, dvs. kun med papirbaseret præ/post.
2. Én lektion (45 min): prætest 10 min → forløb 20 min → posttest og overførsel 10 min → lærerens opsamling 5 min (Hanghøj: lærerens rolle).
3. Forsinket test efter 7 dage, 10 min.
4. Lærerinterview (15 min) og 3–4 elevinterviews.
5. Beslutning efter piloten: fortsæt, ændr eller stop. Kriterierne for "fortsæt" fastsætter ejeren **før** piloten.

### 6.1 Før piloten

| Krav | Hvem | Status |
|---|---|---|
| Teknisk: #561/#563 grønne i isoleret CI på seneste commit; Arkivskabet-e2e grøn i tre browsere | Claude | se PR'erne |
| Fagligt indhold godkendt (kilder, påstande, tilbagevisninger, modelsvar) | **En historielærer** | udestår |
| Læringsmålet valgt og koblet til Fælles Mål (kildearbejde i historie) | Ejeren som lærer | udestår (LP-2) |
| Introduktion: læreren gennemgår 9. april 1940 og de fire spørgsmål før spillet, eller spillets intro bruges som den eneste introduktion | Læreren | vælges |
| Ingen test i uintroduceret stof: prætesten må kun bruge kildetyper, som introduktionen nævner | Læreren | tjekliste |
| Udgangspunkt: prætest (§5.1) og en kort note om klassens tidligere kildearbejde | Læreren | — |
| Samtykke/information til forældre efter skolens praksis; kun syntetiske eller pilotkonti | Ejeren/skolen | udestår |

### 6.2 Under piloten: hvad læreren observerer

| Observation | Tegn på |
|---|---|
| Eleven læser bagsiden og nævner afsender eller tid, når de forklarer | reel forståelse |
| Begrundelsen passer til fejlen (fx »hvornår«, når kilden er skrevet 45 år senere) | reel forståelse |
| Eleven vælger »Jeg gættede« eller klikker hurtigt gennem alle vendinger | gætteri |
| Rigtigt i hypotesen, forkert i skuffen | huskede svaret, ikke metoden |
| Eleven taler om skabet, ikke om kilderne | spilmekanikken forstyrrer |
| Fejlbeskeder, »Forbinder …« der bliver stående, eller en elev, der sidder fast | tekniske problemer (noteres med tidspunkt) |

### 6.3 Efter piloten

- **Læringsudbytte:** post − præ på parallelle versioner. Åbent svar efter rubrikken i §5.3.
- **Overførsel:** to opgaver fra en anden periode.
- **Fastholdelse:** forsinket test efter 7 dage.
- **Sammenligning:** referenceaktiviteten (§5.1) med samme indhold uden spilverden.

**Forslag til acceptkriterier.** Det er tærskler sat af udvikleren, **ikke empirisk begrundede**. Ejeren fastsætter dem før piloten:

| Kriterium | Fortsæt | Revidér | Stop |
|---|---|---|---|
| Rubrikscore på det åbne svar (gennemsnit, 0–3) | stiger mindst 1 point fra præ til post | stiger 0,5–1 | stiger under 0,5 |
| Overførselsopgaver rigtige | mindst 60 % (over gætteniveauet på 25 %) | 40–60 % | under 40 % |
| Spilgruppen sammenlignet med referenceaktiviteten | lige så god eller bedre | lidt dårligere | tydeligt dårligere |
| Tekniske stop pr. lektion | 0–1 | 2–3 | flere |

**Ejerens valg før en pilot:** skole og klasse (klassetrin), tidspunkt (uge), hvem der underviser, om
referenceaktiviteten køres i en anden klasse eller i samme klasse på et andet tidspunkt, og de endelige tærskler.

## 7. Demoguide (lokal, ingen produktion)

Forudsætninger: Node 24, en checkout af branchen `feat/laerligverse-f3-host` (PR #561) eller F3-B-branchen,
og `corepack pnpm@9.15.4 install` i `adventure-engine/`.

**A. Didaktisk demo (testadapter, ingen backend)**
```
node tools/laerligverse/serve-local.mjs --backend=test-adapter
```
Åbn `http://127.0.0.1:4330/`. Spillet kører på `127.0.0.1:4331`. Klik på skabet, og gennemgå
introduktion, arkivkort, "Vend dokumentet", valg med begrundelse og feedback. Vælg forkert for at se
revisionen. Gå derefter til skuffen, refleksionen og "Spol tiden frem (prototype)".

Se efter:
- badgen øverst (hvad aktiviteten tæller som, **ifølge testadapteren**);
- at alle dokumenter skal vendes, før man kan vælge;
- at feedbacken peger på et felt;
- at refleksionen forsvinder, når du går videre.

Hvad registreres: **intet uden for browserfanen**. Testadapteren holder alt i hukommelsen. Det er ikke
Lærligs server.

**B. Backend-demo (lokal Supabase, neutralt harness-spil)**
```
supabase start
node tools/laerligverse/serve-local.mjs --backend=local-supabase --supabase-url=http://127.0.0.1:54321 --anon-key=<lokal anon-nøgle fra `supabase status`>
```
Log ind med en **syntetisk testelev** i den lokale stak (`@e2e.invalid`, oprettet af testopsætningen).
Ikke-lokale Supabase-adresser afvises. Brug aldrig en produktionskonto (D-313).

Se efter: ét svar giver én registrering og én betaling i den **lokale** database, og spillet modtager
aldrig et token.

Det, der kun findes lokalt: hele værtssiden (`laerligverse/` er uden for deploy-allowlisten), refleksion,
arkivkort og genbesøgets "spol frem".

## 7a. Build, upload, preview og produktion (Cloudflare)

Det gælder for alle Lærligverse-PR'er:
- **Build** (`node tools/cloudflare-build-static.mjs`) kører på hver branch. `laerligverse/` er **ikke** i allowlisten, så værtssiden kommer ikke med i bundtet.
- På andre branches end main kører versionskommandoen kun `console.log` (»Non-production upload intentionally skipped«). Et grønt »Workers Builds«-check på en PR er derfor **et build uden upload**, ikke en preview-deploy og ikke produktion.
- **Produktion:** `npm run deploy:cloudflare` kører kun på `main`. En merge til `main`, også af en ren dokumentations-PR som denne, udløser en produktionsdeploy af det, der er i allowlisten.
- Konfigurationen er ikke ændret, og `tools/cloudflare-deploy.mjs` er ikke genindført.

## 8. Åbne beslutninger (ejerens)

| # | Beslutning | Hvorfor den er din |
|---|---|---|
| 1 | LP-2/LP-13: objective-id'er, læringstrin, og om spillet må ønske `check` | Produkt og didaktik |
| 2 | H4: lærerbedømt fritekst (refleksion, åbent svar) | Lærerens arbejdsbyrde, data |
| 3 | H5 i produktion og rækkefølgen bootstrap → align → M2 | Produktionsmigration |
| 4 | Om proces-data (vendte dokumenter, begrundelse) må sendes | Privatliv |
| 5 | Værtssiden ind i Lærligs frontend og deploy-allowlisten | Offentlig produktionsside |
| 6 | Pilot: skole, klasse, kriterier for "fortsæt" | Ejerens |
