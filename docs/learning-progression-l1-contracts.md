# Læringsprogression L1: kontrakter og acceptkriterier (udkast)

**Status:** UDKAST.
- **Godkendt som principper:** LP-3, LP-5, LP-15 og LP-16 ([D-282](decisions/D-282.md)).
- **Ikke godkendt:** kontrakterne her.
- **Ingen ændringer:** ingen migration, deploy, merge eller ændring af produktionsadfærd. Hver PR i
  L1 kræver sin egen godkendelse, og migration og deploy kræver hver en særskilt GO (D-110).

**Grundlag:**
- [D-277](decisions/D-277.md) (designudkast) og [question-attempts-design.md](question-attempts-design.md)
  (D-266/D-273).
- FAKTA fra en read-only kontrol 2026-10-31: `question_attempts` er ikke anvendt, og tabellen findes
  ikke. H5 PR 3 (`process-event` til `_v2`) er merget (#498), men ikke deployet.

**L1's formål:** Hvert svar fra den første række i loggen skal bære det, læringsmodellen senere har
brug for. Bedømmelsen skal være til at stole på. Ingen elev mærker noget. Der er ingen UI-ændring,
ingen belønningsændring og ingen progression.

---

## Grundregel for alle kontrakter: serveren bestemmer, klienten bidrager ikke

Aktivitetstilstand, brugte hints, svartid og læringsmål er input til mestring og niveau. De
**bestemmes af serveren** ud fra serverens egne data og læses **aldrig fra request-body'en**. Det
følger samme princip som D-278 og den serverejede instans (2026-10-16). En klient, der sender
felterne, ignoreres.

---

## K1: Følgemigration til svarloggen (LP-3)

Følgemigrationen anvendes **i samme vindue som** `20261030211428_question_attempts_v2.sql`, før
den første række skrives. Den mergede fil ændres ikke.

| Kolonne | Type og regel | Hvem skriver hvad (L1) | Senere |
|---|---|---|---|
| `mode` | `text NOT NULL CHECK (mode IN ('quiz_v1','diagnostic','practice','check','review','application'))`. Ingen standardværdi: RPC'en skal angive den eksplicit. | `process-event` sender altid `'quiz_v1'`: svaret er givet i dagens quiz, før progressionen. | L5: `get-next-question` registrerer den tilstand, opgaven blev serveret i, på instansen. `process-event` læser den derfra. |
| `hints_used` | `smallint NOT NULL CHECK (hints_used BETWEEN 0 AND 3)` | Altid `0`, fordi der ikke findes hints i L1. | L3: tælles fra en serverlog over hint-anmodninger. |
| `response_ms` | `integer NULL CHECK (response_ms >= 0)` | Måles af serveren: `answered_at − question_instances.created_at`, **kun for første forsøg** (`attempt_no = 1`). Ellers `NULL`. | Senere evt. et `served_at`, som gnq vedligeholder. Det kræver en ændring af gnq's release-gate. |
| `objective_ids` | `uuid[] NULL` | `NULL`, fordi der ikke findes læringsmål i L1. | L2: et øjebliksbillede af opgavens kobling til læringsmål på svartidspunktet. Det udfyldes aldrig bagudrettet. |

**Begrundelser:**
- **`response_ms` fra serveren:** Klientens `question_shown_at` kan forfalskes og bruges ikke.
  `created_at` er tidspunktet, hvor serveren oprettede instansen. Hvis eleven genindlæser, før hun
  svarer, bliver værdien for *stor*. Det kan kun skjule et gæt, aldrig få et ærligt svar til at
  ligne et gæt. Det er den sikre retning.
- **`response_ms` bruges kun til gættesignal** (D-277 §4.2). Formålet skrives ind i
  privatlivsdokumentationen, før kolonnen anvendes.
- **Ingen standardværdi for `mode`:** Glemmer en skrivevej at angive tilstanden, skal skrivningen
  fejle. Den må ikke stille gemme en antagelse.

**Kodeændringer i samme PR:**
- `process_question_attempt_v2` og `process_text_answer_v2` genskabes med parametrene `p_mode` og
  `p_hints_used`. `response_ms` beregnes i RPC'en ud fra serverens egne tidsstempler.
- `process-event` (H5 PR 3-grenen) sender `p_mode => 'quiz_v1'` og `p_hints_used => 0`.

**Afhængighed:** `process-event` har sin egen paritetstest mod v34 (#498). Ændringen skal stå
eksplicit i dens liste over ændringer siden v34.

## K2: Gamle svar uden tilstand, hints eller læringsmål

| Kategori | Hvad findes | Mestring (tilstandsfold, L4) | Niveau (fold, LP-5) | Lærerstatistik |
|---|---|---|---|---|
| **G0: Før loggen** | Kun `question_instances`. Gentagelser har overskrevet første svar. | **Bruges ikke.** Der er ingen backfill (D-266 §7). | Uændret, som i dag, indtil H3 flytter folden til loggen. | Uændret (læser `question_instances`). |
| **G1: Loggede `quiz_v1`-svar** | `mode='quiz_v1'`, `hints_used=0`, `objective_ids=NULL` | Kan kun **påvise** viden, som diagnostik: et korrekt svar kan bidrage til `formodet_kendt`. **Et forkert svar er aldrig negativ evidens**, fordi det er ukendt, om eleven har fået undervisning. Og kun når `objective_ids` kan bestemmes (se G3). | **Ejerbeslutning Q1** (se nedenfor). | Som i dag via H3. |
| **G2: `response_ms = NULL`** | Gentagelser og genserveringer | Aldrig markeret "muligt gæt". Det ukendte tolkes til elevens fordel. | Ingen betydning | — |
| **G3: `objective_ids = NULL`** | Svar før L2, eller opgaver uden kobling | **Ejerbeslutning Q2:** udelukkes fra mestring, eller må bruges med en *afledt* kobling (opgavens kobling ved foldning, markeret `afledt`) kun til positiv påvisning. | Ingen betydning (niveau er pr. fag) | — |
| **G4: Bedømt efter gammel normalisering** | `was_correct` fra før K3 | Loggen er uforanderlig, og `was_correct` ændres ikke (D-273 punkt 2). Ved foldning udelukkes forsøg på opgaver, som K5 markerer med en bedømmelseskollision. Evidensen kan genberegnes. | Samme udelukkelse | Uændret |

**Regel for determinisme:** Kategorierne afgøres alene af kolonnernes værdier og K5's (versionerede)
validering. De samme logrækker giver altid samme tilstand (D-277 A8).

## K3: Bedømmelsesrettelse (LP-15)

FAKTA: `process_question_attempt` gør i dag `lower()` og fjerner derefter alt uden for `[a-z0-9]`
(`20261027120000…sql:91-96`).

| Svartype | Ny regel (udkast) |
|---|---|
| **Tal** (`answer_format` number) | Ren funktion `normalizeNumber`, både i TypeScript og som SQL-tvilling med paritetstest. Trim og NFC. U+2212 og en-dash bliver til `-`. Decimalkomma bliver til `.`. Mellemrum som tusindtalsseparator fjernes kun i formen `^-?\d{1,3}( \d{3})+([.,]\d+)?$`. Alt andet, der ikke er et tal, er **forkert** og ikke en fejl. Sammenligningen er numerisk og eksakt, eller inden for en valgfri `content.tolerance`, der som standard er 0. Brøker understøttes kun, hvis opgaven erklærer det (senere). |
| **MC og `force_text`** | lower, NFC, sammenpresset whitespace og trim. **Bogstaver, også æøå, fjernes aldrig.** Danske alias (`metadata.danish_orthography_correct_aliases`) bevares. |
| **Match par** | Uændret. Nøglen er cifre og kolon, og formen kontrolleres af `canonicalMatchAnswer`. |

**Udrulning:**
1. **Read-only rapport først:** Hvor mange aktive opgaver bedømmes anderledes efter den nye regel?
   Det omfatter kollisioner mellem svarmuligheder efter den gamle normalisering og talopgaver. Ejeren
   ser rapporten, før noget ændres.
2. **Migration** med en PGlite-test.
3. **Ingen genbedømmelse af historik og ingen automatisk kompensation.** Kompensation er en særskilt
   ejerbeslutning, som D-254 viser.

## K4: Niveau-fold (LP-5), kontrakt for det, der indgår

| Forsøg | Indgår i niveaufolden |
|---|---|
| `mode IN ('check','review','application')`, `hints_used = 0`, opgaven er evidensgyldig (K5) | Ja |
| `mode = 'diagnostic'` | Nej. Kun en *startregel*, der kun kan gå opad (D-277 §4.5). |
| `mode = 'practice'` eller `hints_used > 0` | Nej |
| `mode = 'quiz_v1'` | **Ejerbeslutning Q1** |

**I L1 er K4 en specifikation med en testharness**, en ren funktion `levelFoldEligible(attempt)`.
Selve niveaumotoren læser stadig første svar i `question_instances`, indtil H3 flytter den til
loggen. Implementeringen følger med diagnostikken (L5) eller H3, alt efter hvad der kommer først.

## K5: Statisk validering af opgaver (evidensgyldighed)

Værktøjet `tools/questions/validate-evidence.mjs` (udkast) tjekker opgavernes indhold uden at skrive
til databasen:
1. facit er en af svarmulighederne;
2. svarmulighederne er forskellige efter **både** den gamle og den nye normalisering (kollisionerne
   rapporteres hver for sig);
3. talopgaver kan parses af `normalizeNumber`;
4. Match par til `tjek` har n ≥ 4;
5. ingen svarmulighed er facit med et ekstra ord.

Værktøjet giver en JSON-rapport og en unit-test over repoets indholdsmigrationer. **Valideringen
er versioneret**, og en ny version kan genberegne evidensen (K2 G4).

## K6: D-266 H1–H4 (LP-16): hvad der blokerer hvad

| H | Spørgsmål (D-266 §9.2) | Blokerer i L1 | Kan vente |
|---|---|---|---|
| H4 | Ny indsendelse af et langt svar før bedømmelse | Logning af lange svar (D-266 trin 4) | K1 og K3–K5 for automatisk bedømte svar |
| H2 | Arkivering og `ON DELETE RESTRICT` for spørgsmål | Bør afgøres, før loggen begynder at vokse. Ellers kan sletning af et spørgsmål fjerne svarhistorik. | — |
| H1 | XP ved ændret lærerbedømmelse | Lærerens nybedømmelse (trin 5) | K1–K5 |
| H3 | Statistik og niveaumotor læser fra loggen | — | Efter observation (trin 7) |

**Anbefalet rækkefølge:** H2 og H4 afgøres før anvendelsen af K1. H1 og H3 kan følge.

---

## Acceptkriterier for L1

| # | Kriterium | Testtype |
|---|---|---|
| L1-A1 | Hver ny række i `question_attempts` har `mode` og `hints_used`. En skrivning uden dem fejler (NOT NULL, ingen standardværdi). | PGlite (migration) |
| L1-A2 | `mode`, `hints_used` og `response_ms` læses aldrig fra request-body'en. En klient, der sender dem, påvirker intet. | Unit (process-event) + PGlite |
| L1-A3 | `response_ms` = `answered_at − created_at` for `attempt_no = 1`, ellers `NULL`. Værdien er aldrig negativ. | PGlite |
| L1-A4 | Belønning, status og svarformen er uændrede for eleven (`process-event`-paritet mod v34 med eksplicit ændringsliste). | Unit (paritet) |
| L1-A5 | K2: G0 bruges aldrig til mestring. G1 kan kun påvise. G2 tolkes aldrig som gæt. G4-forsøg på kolliderende opgaver udelukkes ved foldning. `was_correct` ændres aldrig. | Unit (ren fold) |
| L1-A6 | K3: "æ" ≠ "ae", "1,5" ≠ "15", "−5" ≠ "5", "1 000" = "1000", "1.5" = "1,5". En ikke-numerisk tekst er forkert, ikke en fejl. | Unit (TS) + PGlite (SQL-tvilling, paritet) |
| L1-A7 | K3-regression: for alle aktive MC-opgaver i repoets indhold bedømmes facit fortsat som korrekt. Afvigelser findes kun i den dokumenterede kollisionsliste. | Unit (indhold) |
| L1-A8 | K5-rapporten er deterministisk, og samme indhold giver samme rapport. Værktøjet skriver aldrig til databasen. | Unit |
| L1-A9 | K4: `levelFoldEligible` følger tabellen, inkl. Q1. | Unit |
| L1-A10 | Replay: de samme logrækker giver de samme K2-kategorier og den samme egnethed for niveaufolden. | Unit |
| L1-A11 | Følgemigrationen anvendes efter PR 1, før der findes nogen række. Bliver følgemigrationen ikke anvendt, findes PR 1's tabel, men den må ikke skrives til. Det håndhæves af K1's NOT NULL-kolonner og RPC-signaturer. | PGlite (rækkefølge) |
| L1-A12 | Tilbagerulning af K1 og K3 er dokumenteret og afspillet i en test, ligesom i D-278. | PGlite |

## Ikke i L1

UI, hints, læringsmål (L2), introduktion (L3), tilstandsmotor (L4), progression (L5), nye
opgaveformer, belønningsændringer og aktivering af `LEVEL_ENGINE`.

## Åbne ejerspørgsmål (kort)

- **Q1: Indgår `quiz_v1`-svar i niveaufolden?** Anbefaling: **ja, i begge retninger**, som i dag. Dagens
  quiz er den eneste kilde til niveau. Niveau handler om, hvor svært stof der passer, og er ikke en
  dom over eleven. LP-5's forbud gælder *diagnostik* på stof, eleven ikke har mødt. `quiz_v1` er
  aldrig mestringsevidens imod eleven (K2).
- **Q2: Afledt kobling til læringsmål for gamle svar?** Anbefaling: **ja, kun til positiv påvisning,
  markeret `afledt`**. Ellers starter alle elever fra nul ved L2, selv om de har vist viden.
- **Q3: Rækkefølgen H2 → H4 → K1?** Anbefaling: ja.
- **Q4: `response_ms` fra serveren ud fra `created_at`, og ingen gnq-ændring i L1?** Anbefaling: ja.
  Den er konservativ og kræver ingen ændring af release-gaten.
