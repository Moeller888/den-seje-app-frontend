# Læringsprogression L1: kontrakter og acceptkriterier (udkast, revision 2)

**Status:** UDKAST.
- **Godkendt som principper:** LP-3, LP-5, LP-15 og LP-16 ([D-282](decisions/D-282.md)).
- **Ikke godkendt:** kontrakterne her.
- **Ingen ændringer:** ingen migration, deploy, merge eller ændring af produktionsadfærd. Hver PR i
  L1 kræver sin egen godkendelse, og migration og deploy kræver hver en særskilt GO (D-110).

**Revision 2 (2026-10-31)** indarbejder ejerens præciseringer:
- **Q1:** ingen automatisk niveausænkning ud fra `quiz_v1`. En ny model skelner mellem arbejdsniveau
  og fagligt niveau (K7).
- **Q2:** en afledt kobling til læringsmål skal være versionsstyret og reproducerbar (K8).
- **Q3:** H2 og H4 hører til D-266-sporet og må ikke blokere uafhængigt arbejde (K6).
- **Q4:** målingen hedder et *teknisk tidsinterval* og må aldrig alene give en negativ vurdering. En
  senere sikker registrering af præsentationstidspunktet er beskrevet (K1, K9).

**Grundlag:**
- [D-277](decisions/D-277.md) (designudkast) og [question-attempts-design.md](question-attempts-design.md)
  (D-266/D-273).
- FAKTA fra en read-only kontrol 2026-10-31: `question_attempts` er ikke anvendt. H5 PR 3 er merget
  (#498), men ikke deployet.

**L1's formål:** Hvert svar fra loggens første række skal bære det, læringsmodellen senere har brug
for, og bedømmelsen skal være til at stole på. Ingen elev mærker noget.

---

## Grundregel: serveren bestemmer, klienten bidrager ikke

Aktivitetstilstand, brugte hints, tidsinterval, læringsmål og opgaveversion **bestemmes af serveren**
ud fra serverens egne data og læses **aldrig fra request-body'en**. Det samme princip gælder D-278 og
den serverejede instans. En klient, der sender felterne, ignoreres.

---

## K1: Følgemigration til svarloggen (LP-3)

Følgemigrationen anvendes i samme vindue som `20261030211428_question_attempts_v2.sql`, før den
første række skrives. Den mergede fil ændres ikke.

| Kolonne | Type og regel | L1 | Senere |
|---|---|---|---|
| `mode` | `text NOT NULL CHECK (mode IN ('quiz_v1','diagnostic','practice','check','review','application'))`. Ingen standardværdi. | `'quiz_v1'` (sendes af serveren) | L5: tilstanden, opgaven blev serveret i, registreres på instansen af `get-next-question` |
| `hints_used` | `smallint NOT NULL CHECK (hints_used BETWEEN 0 AND 3)` | `0` | L3: tælles fra en serverlog over hint-anmodninger |
| `server_interval_ms` | `integer NULL CHECK (server_interval_ms >= 0)` | `answered_at − question_instances.created_at`, kun for `attempt_no = 1`. Ellers `NULL`. | Suppleres af `presented_interval_ms` (K9) |
| `objective_ids` | `uuid[] NULL` | `NULL` | L2: øjebliksbillede af opgavens kobling på svartidspunktet. Det udfyldes aldrig bagudrettet. |
| `objective_mapping_version` *(ny)* | `integer NULL` | `NULL` | L2: den version af koblingen, der gav `objective_ids` (K8) |
| `question_content_sha256` *(ny)* | `text NOT NULL` | SHA-256 af opgavens indhold og facit, som serveren havde ved svaret | — |

**`server_interval_ms` er et teknisk tidsinterval, ikke elevens svartid (Q4):**
- Den måler tiden fra serveren *oprettede* instansen, til serveren *modtog* svaret. Den indeholder
  netværk, indlæsning, oplæsning og en eventuel genindlæsning af siden.
- Fordi `created_at` ligger *før* eleven ser opgaven, er intervallet altid ≥ elevens reelle tid. Det
  kan kun skjule et hurtigt gæt, aldrig få et ærligt svar til at ligne et gæt.
- **Den må aldrig alene give en negativ vurdering.** Den eneste tilladte brug er at *tilbageholde
  positiv evidens*. Et korrekt svar under formens gættetærskel tæller ikke som mestringsevidens, men
  tæller heller aldrig imod eleven. Den bruges aldrig til at vurdere, om en elev er "langsom".
- Formålet (gættesignal) skrives ind i privatlivsdokumentationen, før kolonnen anvendes.

**`question_content_sha256` (begrundet af Q2):** Rettes en opgave senere (tekst, svarmuligheder eller
facit), kan man se, hvilken version hvert gammelt svar blev givet til. Gamle resultaters betydning
kan derfor ikke ændre sig ubemærket.

**Kodeændringer i samme PR:**
- `process_question_attempt_v2` og `process_text_answer_v2` genskabes med `p_mode` og `p_hints_used`.
- `server_interval_ms` og `question_content_sha256` beregnes i RPC'en ud fra serverens egne data.
- `process-event` sender `'quiz_v1'` og `0`. Ændringen står i dens liste over ændringer siden v34.

## K2: Gamle svar uden tilstand, hints eller læringsmål

| Kategori | Mestring (L4) | Niveau (K7) | Lærerstatistik |
|---|---|---|---|
| **G0: Før loggen** (kun `question_instances`) | **Bruges ikke** (ingen backfill, D-266 §7) | Uændret indtil H3 | Uændret |
| **G1: `quiz_v1`** | Kan kun **påvise** viden. Et korrekt svar kan bidrage til `formodet_kendt`, som skal bekræftes af et `check`. **Et forkert svar er aldrig negativ evidens.** | *Arbejdsniveau:* begge retninger. *Fagligt niveau:* **kun op** (K7) | Som i dag via H3 |
| **G2: `server_interval_ms = NULL`** | Aldrig markeret "muligt gæt" | — | — |
| **G3: `objective_ids = NULL`** | Kun via en **versionsstyret afledt kobling** (K8), og kun til påvisning | — | — |
| **G4: Bedømt efter gammel normalisering** | Loggen ændres ikke. Forsøg på opgaver, som K5 markerer med kollision, udelukkes ved foldning og kan genberegnes. | Samme udelukkelse | Uændret |

**Determinisme:** Kategorierne afgøres alene af kolonnerne, K5's validering (versioneret) og K8's
koblingsversion. De samme rækker og de samme versioner giver altid samme resultat.

## K3: Bedømmelsesrettelse (LP-15)

FAKTA: `process_question_attempt` fjerner i dag alt uden for `[a-z0-9]` (`20261027120000…sql:91-96`).

| Svartype | Ny regel (udkast) |
|---|---|
| **Tal** | Ren funktion `normalizeNumber` (TypeScript + SQL-tvilling med paritetstest). Trim og NFC. U+2212 og en-dash bliver til `-`. Decimalkomma bliver til `.`. Tusindtalsmellemrum fjernes kun i formen `^-?\d{1,3}( \d{3})+([.,]\d+)?$`. Ikke-tal er **forkert**, ikke en fejl. Sammenligningen er numerisk og eksakt, eller inden for `content.tolerance` (standard 0). |
| **MC og `force_text`** | lower, NFC, sammenpresset whitespace og trim. **Bogstaver, også æøå, fjernes aldrig.** Danske alias bevares. |
| **Match par** | Uændret |

**Udrulning:**
1. Read-only rapport: hvor mange aktive opgaver der bedømmes anderledes.
2. Migration med PGlite-test.
3. Ingen genbedømmelse af historik og ingen automatisk kompensation. Kompensation er en særskilt
   ejerbeslutning (D-254).

## K4: Niveau-fold (LP-5), hvad der indgår

| Forsøg | Arbejdsniveau | Fagligt niveau (K7) |
|---|---|---|
| `check`, `review`, `application`, `hints_used = 0`, evidensgyldig, og målet har registreret eksponering | Begge retninger | Begge retninger (L4+, se K7) |
| `quiz_v1` | Begge retninger | **Kun op** |
| `diagnostic` | Begge retninger | **Kun op** (startregel) |
| `practice` eller `hints_used > 0` | Nej | Nej |

I L1 er K4 en specifikation med en testharness: `levelFoldEligible(attempt, target)` for target
`working` eller `assessed`.

## K5: Statisk validering af opgaver (evidensgyldighed)

Værktøjet `tools/questions/validate-evidence.mjs` tjekker uden at skrive til databasen:
1. facit er en af svarmulighederne;
2. svarmulighederne er forskellige efter den gamle og den nye normalisering;
3. talopgaver kan parses;
4. Match par til `check` har n ≥ 4;
5. ingen svarmulighed er facit med et ekstra ord.

Resultatet er en JSON-rapport og en unit-test over repoets indholdsmigrationer. Valideringen er
versioneret.

## K6: D-266 H1–H4 (LP-16, Q3)

H1–H4 besluttes i D-266-sporet, ikke her. Ejeren har principielt accepteret, at H2 (arkivering frem
for sletning) og H4 (genindsendelse af lange svar) afklares, før svarloggen anvendes.

**Ikke blokeret af H1–H4:** K3, K4, K5, K7, K8 og K9 (specifikationer, rene funktioner og
read-only rapporter) kan bygges nu. Kun *anvendelsen* af K1 i produktionen venter på H2 og H4.

## K7: Arbejdsniveau og fagligt niveau (Q1) (FORSLAG)

**Ejerens krav:** Ingen automatisk niveausænkning ud fra gamle `quiz_v1`-svar, når det er ukendt, om
eleven er blevet introduceret for stoffet.

**Modellen har to størrelser pr. elev og fag:**

| | **Arbejdsniveau** (midlertidig sværhedstilpasning) | **Fagligt niveau** (varig vurdering) |
|---|---|---|
| Formål | Vælge opgaver, der passer *nu*, så eleven hverken keder sig eller sidder fast | Systemets bedste vurdering af, hvad eleven fagligt kan klare |
| Bevæger sig | Op og ned efter de seneste svar, også `quiz_v1` og forkerte svar | **Op** ved påvist viden: korrekte, uassisterede svar på opgaver over det nuværende niveau, på mindst 2 forskellige opgaver (HEURISTIK). **Ned** kun ved evidens fra `check`/`review` på mål med registreret eksponering (fra L4). **Aldrig ned** ved `quiz_v1` eller `diagnostic`. |
| Levetid | **Nulstilles til det faglige niveau ved hver ny session** (session = ingen pause over 2 timer, samme definition som D-278) | Varig. Hver ændring logges med forklaring. |
| Nedre grænse | Højst Δ under det faglige niveau (HEURISTIK: 2 celler ≈ 560 på skalaen 1–10.000, hvor én celle ≈ et bånd inden for et klassetrin) | Aldrig under klassetrinnets serverafledte start (eller placeringen i historie), medmindre der er evidens fra `check` |
| Vises for læreren | **Nej.** Det er ikke en vurdering. | Ja, med usikkerhed og med "påvist ved …" |
| Vises for eleven | Nej | Valgfrit, aldrig som en dom |

**Konsekvens for den nuværende niveaumotor (FAKTA, vigtig):**
- Den byggede motor (`student_subject_level`, `advance_student_level`) har **ét** niveau pr. fag.
  Folden går op og ned efter første svar og lægger sig omkring 75 % rigtige.
- Aktiveres den uændret, sænkes det varige niveau automatisk af `quiz_v1`-svar. **Det strider mod
  Q1.**
- **Anbefaling:** Før `LEVEL_ENGINE` aktiveres, udvides motoren:
  - det nuværende `level` bliver *arbejdsniveau* med nulstilling pr. session og nedre grænse;
  - et nyt `assessed_level` bliver *fagligt niveau*, som kun går op i L1–L3.

  Det er en ændring af en anvendt migration og af gnq, så det kræver release-gate, migration og din
  GO. **Aktiveringen af niveaumotoren bør derfor vente på denne beslutning.**

**Konkrete konsekvenser:**

| Fag | Udgangspunkt (fagligt niveau) | Eksempel | Med modellen | Uden modellen (motoren som bygget) |
|---|---|---|---|---|
| **Historie** | Den gennemførte placeringstest (`placement_sessions`), ellers klassetrinnets start | En 6.-klasseelev svarer forkert på 4 vikingespørgsmål i træk. Klassen har endnu ikke haft vikingetiden. | Arbejdsniveauet falder i sessionen, og eleven får lettere vikingespørgsmål. **Det faglige niveau er uændret.** Næste dag starter eleven igen på det faglige niveau. | Det varige niveau falder. Eleven fastholdes i lettere stof, også i emner eleven kan. |
| **Engelsk** | Klassetrinnets start. Placeringen udelukker engelsk. Indholdet dækker kun klassetrin 3–5, bånd 1–4. | En 8.-klasseelev ligger over indholdets loft. Hun svarer forkert på 2 grammatikopgaver på klassetrin 4. | Arbejdsniveauet tilpasses inden for det tilgængelige indhold. **Det faglige niveau falder ikke.** Læreren ser "fagligt niveau over indholdets loft", altså en **indholdsmangel, ikke en elevmangel**. | Niveauet falder mod klassetrin 3–4 og ser ud som en svag elev. |
| **Dansk** | Klassetrinnets start. Placeringen udelukker dansk. 210 opgaver, få pr. celle. | En 5.-klasseelev fejler 3 tegnsætningsopgaver. | Arbejdsniveauet falder i sessionen. Det faglige niveau stiger kun, når eleven svarer rigtigt over sit niveau. Fordi puljen er lille, kommer gentagelser hurtigt. De ændrer ikke det faglige niveau. | Niveauet falder, og den lille pulje gør faldet svært at komme op fra. |

**Teknisk opdeling:** Arbejdsniveauet kan beregnes uden ny persistens ud fra sessionens forsøg i
loggen plus det faglige niveau. Det faglige niveau gemmes som en fold med fold-log, ligesom i dag.

## K8: Versionsstyret afledt kobling til læringsmål (Q2) (FORSLAG)

**Ejerens krav:** Gamle korrekte svar må hjælpe med at opdage forhåndsviden, men aldrig automatisk
bevise mestring. En afledt kobling skal være versionsstyret og reproducerbar.

**Kontrakt:**
1. **`objective_mapping_versions`** (version, oprettet, oprettet af, SHA-256 af hele koblingen,
   note, godkendt). Hver ændring af koblingen mellem opgaver og læringsmål er en **ny version**.
   Gamle versioner slettes aldrig.
2. **`question_objectives`** bærer `mapping_version`.
3. **Afledt evidens** er en evidensrække (elev, mål, forsøg, *koblingsversion*, *opgavens
   indholdshash*) og har typen **`påvisning (afledt)`**:
   - Den kan højst give `formodet_kendt`. Det skal bekræftes af et rigtigt `check` under elevens egen
     kobling (`objective_ids`) for at give `mestret`.
   - Den kan aldrig være negativ.
4. **Reproducerbarhed:** De samme forsøg, den samme koblingsversion og de samme opgavehash giver
   altid den samme afledte evidens.
5. **Ændring er sporbar:**
   - En ny koblingsversion giver en ny afledt fold *ved siden af* den gamle.
   - En **diff-rapport** viser, hvilke elev-mål-tilstande der ændres, og hvorfor.
   - Skiftet til den nye version er en registreret handling (D-fil eller ejer-/administratorhandling).
     Det sker aldrig stille.
6. **Ændret opgaveindhold:** Er en opgaves indhold ændret siden svaret (`question_content_sha256` ≠
   nuværende), bruges svaret kun afledt, hvis ændringen er markeret som "ikke-faglig" (fx stavning
   eller formatering). Ellers udelukkes det.

## K9: Senere sikker registrering af præsentationstidspunktet (Q4) (FORSLAG, ikke L1)

**Problem:** `server_interval_ms` (K1) måler fra serverens oprettelse, ikke fra det øjeblik, eleven
faktisk ser opgaven.

**Forslag (L3 eller L5):**
- RPC'en `mark_presented(instance_id, round_no)` kaldes af klienten, når opgaven *er vist*.
- Serveren gemmer `presented_at` = **serverens** tid ved modtagelsen. Klientens ur bruges aldrig.
- Værdien kan kun sættes én gang pr. runde og kun mellem serveringen og svaret.
- `presented_interval_ms = answered_at − presented_at`.

**Hvad kan en klient manipulere?**

| Manipulation | Virkning |
|---|---|
| Kalde for sent | Intervallet bliver *kortere*. Svaret ligner mere et gæt og tilbageholder kun elevens egen positive evidens. Det skader kun eleven selv og giver ingen fordel. |
| Kalde før visning | Muligt, men tidligst ved serveringen. Så er intervallet ≥ den reelle tid, som i K1. |
| Udelade kaldet | Der faldes tilbage til `server_interval_ms`. |

Ingen manipulation kan få et svar til at tælle *stærkere*.

**Tilgængelighed:** Oplæsning (157P) og ekstra tid må ikke straffes. Intervallet bruges kun til "for
hurtigt", aldrig til "for langsomt".

**Pris:** Ét ekstra kald pr. opgave, og gnq og klienten ændres. Det kræver release-gaten.

---

## Acceptkriterier for L1

| # | Kriterium | Testtype |
|---|---|---|
| L1-A1 | Hver ny række har `mode`, `hints_used` og `question_content_sha256`. En skrivning uden dem fejler. | PGlite |
| L1-A2 | Felterne læses aldrig fra request-body'en. | Unit (process-event) + PGlite |
| L1-A3 | `server_interval_ms` = `answered_at − created_at` for `attempt_no = 1`, ellers `NULL`, og aldrig negativ. Kolonnen og dokumentationen kalder den et teknisk tidsinterval. | PGlite |
| L1-A4 | Belønning, status og svarformen er uændrede (paritet mod v34 med ændringsliste). | Unit |
| L1-A5 | K2: G0 bruges aldrig til mestring. G1 kan kun påvise. G2 tolkes aldrig som gæt. G4 udelukkes ved kollision. `was_correct` ændres aldrig. | Unit (ren fold) |
| L1-A6 | K3: "æ" ≠ "ae", "1,5" ≠ "15", "−5" ≠ "5", "1 000" = "1000", "1.5" = "1,5". Ikke-tal giver forkert, ikke en fejl. | Unit + PGlite (paritet) |
| L1-A7 | K3-regression: facit i alle aktive MC-opgaver bedømmes fortsat som korrekt. Afvigelser findes kun på kollisionslisten. | Unit (indhold) |
| L1-A8 | K5-rapporten er deterministisk og skriver aldrig til databasen. | Unit |
| L1-A9 | K4/K7: `levelFoldEligible(…, 'assessed')` er aldrig sand for et nedadgående skridt fra `quiz_v1` eller `diagnostic`. | Unit |
| L1-A10 | Replay: de samme rækker og versioner giver de samme kategorier, den samme egnethed og den samme afledte evidens. | Unit |
| L1-A11 | Følgemigrationen anvendes efter PR 1 og før der findes nogen række. Rækkefølgen håndhæves af NOT NULL og RPC-signaturer. | PGlite |
| L1-A12 | Tilbagerulning af K1 og K3 er dokumenteret og afspillet i en test. | PGlite |
| L1-A13 | K7: Arbejdsniveauet nulstilles til det faglige niveau ved en ny session, ligger aldrig mere end Δ under det og vises aldrig for læreren. | Unit (ren funktion) |
| L1-A14 | K7: Det faglige niveau stiger kun ved ≥ 2 forskellige korrekte, uassisterede opgaver over niveauet og falder aldrig af `quiz_v1` eller `diagnostic`. Hver ændring har en forklaring. | Unit |
| L1-A15 | K8: Den samme koblingsversion og de samme opgavehash giver identisk afledt evidens. En ny version ændrer ikke gamle resultater, men giver en diff-rapport. Afledt evidens giver aldrig `mestret`. | Unit (replay) |
| L1-A16 | K1/Q4: `server_interval_ms` kan alene kun *tilbageholde* positiv evidens, aldrig give negativ evidens eller sænke et niveau. | Unit (ren fold) |

## Ikke i L1

UI, hints, læringsmål (L2), introduktion (L3), tilstandsmotor (L4), progression (L5), nye
opgaveformer, belønningsændringer og aktivering af `LEVEL_ENGINE`. K7's ændring af motoren er en
særskilt beslutning (se nedenfor). K9 hører til L3 eller L5.

## Ejerbeslutninger (revision 2)

| # | Beslutning | Anbefaling |
|---|---|---|
| **Q1 (fremlagt igen)** | Godkendes modellen med arbejdsniveau og fagligt niveau (K7) som retning? | Ja. |
| **Q1a** | Skal `LEVEL_ENGINE` vente på, at motoren deles i arbejdsniveau og fagligt niveau? | **Ja.** Uændret aktivering ville sænke det varige niveau af `quiz_v1`-svar. |
| Q2 | Versionsstyret afledt kobling (K8), kun som påvisning | Indarbejdet som ønsket. Godkendes sammen med L2. |
| Q3 | H2 og H4 i D-266-sporet før anvendelse af K1 | Accepteret principielt. Blokerer ikke K3–K5 og K7–K9. |
| Q4 | `server_interval_ms` som teknisk interval, kun tilbageholdende (K1), og K9 senere | Indarbejdet som ønsket. |
| Ny | `question_content_sha256` i K1 | Ja. Det er billigt nu og giver sporbarhed ved indholdsrettelser (Q2). |
