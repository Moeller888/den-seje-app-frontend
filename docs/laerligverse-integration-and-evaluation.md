# Lærligverse: integrationskontrakt mod H4/H5, didaktisk evalueringsmodel og demoguide (D-323)

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

## 4. Forskningsgrundlag

Det almene grundlag (genkaldelse, spredning, feedback, hints, mestring, spil) er verificeret i
`docs/learning-progression-source-verification.md`. Her står kun det, der er særligt for **kildearbejde**
og **spil i undervisningen**.

| Påstand | Kilde | Status | Brug i Arkivskabet |
|---|---|---|---|
| Historikere ser på kildens afsender, før de læser teksten (sourcing). De sætter kilden i kontekst og sammenholder kilder (contextualization, corroboration). Gymnasieelever gør det sjældent | Wineburg, S. S. (1991). Historical problem solving: A study of the cognitive processes used in the evaluation of documentary and pictorial evidence. *Journal of Educational Psychology*, 83(1), 73–87 | **[FAKTA, bibliografisk + sekundære referater; fuldtekst ikke læst]** 8 historikere og 8 elever, tænke-højt-studie | Begrundelse for "Vend dokumentet" før valget og for de fire spørgsmål |
| Et dokumentbaseret forløb ("Reading Like a Historian") gav effekt på historisk tænkning, faktuel viden, generel ræsonnering og læseforståelse | Reisman, A. (2012). "Reading like a historian": A document-based history curriculum intervention in urban high schools. *Cognition and Instruction*, 30(1), 86–112 | **[FAKTA, abstract]** 236 elever i 11. klasse, 5 skoler i San Francisco, et helt forløb. Effektstørrelser ikke læst | Støtter retningen (kildearbejde kan læres), **ikke** at et kort spil giver samme effekt |
| Feedback med information om opgaven virker bedre end ros eller belønning | Wisniewski, Zierer & Hattie 2020 (se kildeverifikation §14) | [FAKTA] | Tilbagevisning pr. forkert valg, der peger på et felt |
| MC kan indlære forkerte muligheder, og feedback reducerer det | Marsh m.fl. 2007; Butler & Roediger 2008 (kildeverifikation §22) | [FAKTA] | Feedback efter hvert MC-svar, også i øvelse |
| Læreren skal kunne skifte rolle omkring et spilscenarie | Hanghøj 2013; Hanghøj & Brund 2010 (kildeverifikation §20) | [FAKTA, abstract] | Pilotplanen kræver lærerens opsamling (§6) |
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

## 6. Pilotplan (forslag)

1. **Forudsætning**: backend kan målrette et objective (H4) og registrere `mode` og `hints_used` (H5). Indtil da kan piloten kun køre på testadapteren og **uden** registrering, dvs. kun med papirbaseret præ/post.
2. Én lektion (45 min): prætest 10 min → forløb 20 min → posttest og overførsel 10 min → lærerens opsamling 5 min (Hanghøj: lærerens rolle).
3. Forsinket test efter 7 dage, 10 min.
4. Lærerinterview (15 min) og 3–4 elevinterviews.
5. Beslutning efter piloten: fortsæt, ændr eller stop. Kriterierne for "fortsæt" fastsætter ejeren **før** piloten.

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

Se efter: badgen øverst (hvad aktiviteten tæller som), at feedback peger på et felt, og at refleksionen
forsvinder, når du går videre.

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

## 8. Åbne beslutninger (ejerens)

| # | Beslutning | Hvorfor den er din |
|---|---|---|
| 1 | LP-2/LP-13: objective-id'er, læringstrin, og om spillet må ønske `check` | Produkt og didaktik |
| 2 | H4: lærerbedømt fritekst (refleksion, åbent svar) | Lærerens arbejdsbyrde, data |
| 3 | H5 i produktion og rækkefølgen bootstrap → align → M2 | Produktionsmigration |
| 4 | Om proces-data (vendte dokumenter, begrundelse) må sendes | Privatliv |
| 5 | Værtssiden ind i Lærligs frontend og deploy-allowlisten | Offentlig produktionsside |
| 6 | Pilot: skole, klasse, kriterier for "fortsæt" | Ejerens |
