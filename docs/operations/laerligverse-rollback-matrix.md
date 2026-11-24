# Lærligverset: tilbageførsel, roll-forward og nødstop (fase L)

Status 2026-11-24. Bevis: `tests/unit/laerligverse-rollback-matrix-migrations-run.test.mjs`. Intet her er anvendt i
produktion, og intet her giver lov til at anvende noget. Hver produktionshandling kræver ejerens særskilte GO
(D-110 for databasen, deploy-GO for Edge-funktionen).

## Hvad testen gør

Den kører de **rigtige** `get-next-question`-versioner mod **rigtige** databasetilstande:

- **Edge-versioner:**
  - `a7450b0f`, produktionen i dag;
  - `05a4a34f`, #739 på main;
  - `f51f39e4`, #740-kandidaten (når F8 er i træet);
  - dette træ: #740, eller F8 med `LAERLIGVERSE_COURSE_PARKING` **fra** og **til**. F8 med parkering til og alle
    Lærligvers-flag fra er **sikkerhedsversionen**.
- **Databasetilstande:**
  - DB0: produktionens svarkæde med D-280 og D-316;
  - DB1: + `20261120150000` (D-383);
  - DB2: + `20261123100000` (#740);
  - DB2↓: DB2 tilbageført med `docs/operations/rollback/20261123100000_course_scope_down.sql`;
  - DB3: + F8, når F8's migration findes i træet.
- **Svar:** gennem den rigtige `process_question_attempt`, process-events RPC.
- **Database:** PGlite lokalt og PostgreSQL 17.6 i unit-banen. PostgREST er en stand-in, `tests/unit/helpers/gnq-db-backend.mjs`. Et kald, den ikke kender, får testen til at fejle, så den aldrig gætter.

**Hvorfor celler og ikke forløb:** en Edge-funktion har ingen tilstand mellem forespørgsler. Efter et versionsskift arver
den nye version kun databaserækker. Hver celle får derfor netop de rækker, en version kan have efterladt, og én version handler på
dem. Scenarie 4 kører desuden ét rigtigt forløb på én database.

**For hver elev måles:**
- om eleven får en opgave;
- om den er en kursusopgave;
- belønning ved første svar og intet ved andet svar;
- om et kursussvar er genåbnet eller slettet;
- om en åben kursusrunde er slettet;
- om `nextStep` (kursusforløbet) har flyttet sig.

**Usikre kombinationer** er forventede og navngivne: testen er grøn, fordi den genkender dem. Den bliver rød, når en adfærd ændrer sig. Så skal
tabellen gennemgås og opdateres med `UPDATE_ROLLBACK_MATRIX_DOC=1`.

### Elevtyper
| | Tilstand | Næste forespørgsel |
|---|---|---|
| A | almindelig elev, intet kursus | historie |
| R | forkert almindeligt svar til gentagelse, almindelig pulje opbrugt | historie |
| B | åben kursusrunde | almindelig historie |
| B2 | åben kursusrunde | **fagskift** til engelsk |
| C | forkert kursussvar, almindelig pulje opbrugt, ubrugte kursusopgaver | historie |
| C2 | hele kurset besvaret, ét forkert kursussvar forfaldent | historie |
| D | afsluttet kursustrin | historie |
| F | åben almindelig runde plus kursushistorik | historie |
| P | parkeret kursusrunde (kun DB3; parkeret med F8's egen RPC) | almindelig historie |
| P2 | parkerede kursusrunder i **to** kurser (kun DB3) | **fagskift** til engelsk |
| PO | parkeret kursusrunde plus åben almindelig runde (kun DB3) | historie |

## De seks scenarier

### 1. Tilbageførsel før kursusaktivering (intet kursusindhold)
**SIKKER i alle 24 celler:** alle tre Edge-versioner × DB0, DB1, DB2 og DB2↓ × `LEVEL_ENGINE` fra/`v1`. Både Edge-funktionen
(#740 → #739 → `a7450b0f`) og databasen (DB2 → DB2↓) kan rulles tilbage uden virkning for eleverne, **så længe der
ikke findes kursusopgaver**.

### 2. Tilbageførsel efter kursusaktivering (kursusopgaver og kursusrunder findes)
- **#739 og #740 opfører sig ens i alle celler.** Edge #740 → #739 er sikkert. Det samme gælder databasen DB2 → DB2↓ (= DB1).
  På DB2↓ falder #740 tilbage én gang pr. kald og logger `COURSE_SCOPE_FALLBACK` (bevist).
- **`a7450b0f` er USIKKER, så snart der findes kursusindhold.** Den kender ikke kursusopgaver:
  - den serverer dem og en åben kursusrunde i den almindelige quiz;
  - elevens svar dér flytter kursusforløbet.
  Ingen data tabes, men forløbet ændres. Med `LEVEL_ENGINE=v1` holder D-383's niveaufilter (DB1+) for R og C, ikke for den åbne runde.
- **Edge før database (ny Edge på DB0) ødelægger data:**
  - DB0's fagskift-frigivelse sletter en åben kursusrunde (B2);
  - DB0's gentagelseskrop genåbner et kursussvar og sletter svaret (C2);
  - en elev med opbrugt pulje får `no_questions`, selv om en gentagelse er forfalden (R).
  Rækkefølgen er derfor altid **M1 → M2 → Edge** og ved tilbageførsel **Edge → M2↓**. **M1 rulles aldrig tilbage.**
- **F8 (åben):** med en åben kursusrunde svarer den almindelige quiz `course_round_open` i alle fag (B, B2) i alle celler med
  ny Edge.

### 3. Tilbageførsel efter F8-migrationen (parkerede runder findes) — afgjort empirisk 2026-11-24
Tidligere stod to påstande over for hinanden: D-384 sagde, at `next_review_at = 'infinity'` gør ældre Edge-versioner
sikre; denne matrix forventede dem usikre. Den første version af scenarie 3 kunne ikke afgøre det: den lavede en
"parkeret" række med et rå UPDATE, som F8's CHECK afviser. Nu parkeres runderne med F8's egen RPC, og hver version
får både den almindelige quiz og kurset. **Resultatet — begge havde delvist ret:**

- **Den almindelige quiz er SIKKER med alle versioner på DB3** (elevtyperne P, P2, PO; `a7450b0f`, #739, #740 og F8
  med parkering fra): den parkerede runde bevares urørt og ubesvaret, eleven får en almindelig opgave, belønningen
  udbetales én gang, kursusforløbet flytter sig ikke. Det skyldes databasen, ikke Edge-koden: forfaldsløkken ser aldrig
  `'infinity'`, det delvise indeks tillader en ny aktiv runde, og frigivelse og gentagelser er F8's kroppe.
- **Kurset er IKKE sikkert med versioner før F8** (scenarie 3, "Tilbage i kurset"):
  - #739, #740 og F8 med parkering fra: kursusforespørgslen finder ingen kandidat (det parkerede spørgsmål har allerede
    en instans), og deres lost-race-læsning tæller den **parkerede** række som åben → 409 `open_question_exists`.
    **Kurset er utilgængeligt** for eleven; intet ændres.
  - `a7450b0f` kender ingen sekvens og serverer en **almindelig opgave i kursusforespørgslen**. Når F8 kommer tilbage,
    svarer kurset 409 `open_question_other_step`, indtil den almindelige opgave er besvaret (den er forfalden i den
    almindelige quiz). Midlertidig blokering; intet tabes.
  - Efter roll-forward til F8 med parkering til genoptages **samme runde** (bevist for hver version).
- **F8 med parkering til på en database UDEN F8's migration** (DB0–DB2↓): **hver** forespørgsel svarer 500 (forfaldsløkken
  læser `activation_no`). Intet ændres, men den almindelige quiz er nede. Flaget må derfor først tændes, når migrationen
  er anvendt og verificeret (deployment-gaten, docs/operations/gnq-deploy-gate.md).

**Kompatibilitetsmodellen (fælles for D-384 og denne matrix):**
| Database | Edge-version | Almindelig undervisning | Kursus | Sikker tilbageførselskandidat? |
|---|---|---|---|---|
| DB3 med parkerede runder | F8, parkering til, Lærligvers-flag fra (**sikkerhedsversion**) | ja | slået fra; parkerede runder venter | **ja — foretrukken** |
| DB3 | F8, parkering til, flag til | ja | ja, samme runde genoptages | ja (normal drift) |
| DB3 | F8, parkering fra | ja (P, P2, PO); B, B2 fastlåst (`course_round_open`) | utilgængeligt for parkerede elever | nej |
| DB3 | #740 / #739 | ja (P, P2, PO); B, B2 fastlåst | utilgængeligt for parkerede elever | nej |
| DB3 | `a7450b0f` | kursusopgaver i almindelig quiz, forløb flyttes (B, R, C) | almindelig opgave i kurset | nej |
| DB0–DB2↓ | F8, parkering til | **nede (500)** | nede | nej — flaget før migrationen |

**F8's migration rulles ikke tilbage, når der findes parkerede rækker.** DROP COLUMN fjerner parkeringen: runderne
bliver aktive, to aktive runder kan opstå, og det sletter `activation_no`. Hvis der ingen parkerede rækker er, er
tilbageførslen i migrationens filhoved; slå flaget fra først.

### 4. Roll-forward
**Bevist på én database:**
1. Produktionens Edge handler på DB0.
2. M1 og M2 anvendes.
3. Dette træ fortsætter.
For A, D og F gælder bagefter: alle svar er bevaret, belønningen er ikke faldet, kursustrinnet er uændret, og der er ingen kursusopgave i quizzen. DB2↓ → M2 igen
giver præcis DB2's katalog (bevist): M2's vagt accepterer de genskabte kroppe.

### 5. Deaktivering af Lærligvers-flagene
- **Flag fra:**
  - en elev med en åben kursusrunde får `course_round_open` i historie og i engelsk;
  - ingen vej serverer runden;
  - eleven er **fastlåst, indtil F8 er løst**, eller indtil scenarie 6 bruges.
  Intet tabes: runden og forløbet er uændrede.
- **Flag til:** kursusforespørgslen (`sequence: true`) genoptager **samme instans**, så eleven kan afslutte runden og
  fortsætte.
- **Konsekvens:** at slå flagene fra er i dag **ikke** en sikker nødbremse for elever med åbne kursusrunder.

### 6. Nødstop
**Deaktivér kursusopgaverne** (`is_active = false` på rækker med `metadata ? 'learning_step'`), helst sammen med flag fra.
**Det er ikke tabsfrit for ubesvaret kursusarbejde.**
D-316's frigivelse frigør den åbne kursusrunde, og alle tre Edge-versioner serverer almindelige opgaver.
Kursussvar og kursustrin er uændrede: en ubesvaret runde talte aldrig med i `nextStep`.

**Bevist for B, B2 og D med alle tre Edge-versioner på DB2.**

**Præcis hvad der sker (D-316's frigivelse, F8's krop; bevist i scenarie 6 og 6b):**
| Data | Resultat |
|---|---|
| ubesvaret kursusrunde i første runde (`repeat_count = 0`, aktiv eller **parkeret**) | **rækken slettes** ved elevens næste almindelige forespørgsel |
| præsentationsdata på den række (K9 `presented_at`, L5 `served_mode`, K1-snapshot, `activation_no`) | **tabt** med rækken (K1/L5/K9 er ikke anvendt i produktion i dag) |
| hints (L3's log) | tabt med rækken, hvis L3 er anvendt (ikke i produktion i dag) |
| genåbnet runde (`repeat_count > 0`; efter D-383 kun en kursusrunde fra før D-383) | **lukkes** som besvaret uden svar — kan tælle som gennemført i `nextStep` |
| tidligere kursussvar | bevaret |
| kursusforløbet (`nextStep`) | uændret: en ubesvaret runde talte aldrig med |
| belønning | ingen ændring |

En produktionsændring af `is_active` kræver ejerens GO.

## Samlet: hvad er en sikker tilbageførsel i dag?

| Situation | Sikker vej | Usikker |
|---|---|---|
| Intet kursusindhold | enhver Edge-version og DB2↓ | – |
| Kursusindhold, før F8 | Edge #740 ↔ #739, DB2 ↔ DB2↓; flag til | `a7450b0f`; Edge før M1; M1↓; flag fra med åbne kursusrunder (fastlåst) |
| Efter F8 med parkerede runder | **F8-Edge med parkering til og Lærligvers-flag fra** (sikkerhedsversion) | enhver Edge før F8 (kurset utilgængeligt / `a7450b0f` flytter forløb); F8 med parkering fra; F8-migration↓ |
| F8-flaget før F8-migrationen | – | **altid usikkert**: den almindelige quiz er nede (500) |
| Nødstop | deaktivér kursusopgaver (scenarie 6/6b) | **ikke tabsfri**: ubesvarede kursusrunder slettes |

## Matrix (genereret af testen; opdatér med `UPDATE_ROLLBACK_MATRIX_DOC=1` efter gennemgang)

<!-- MATRIX:START -->
| Scenarie | Edge | Database | LEVEL_ENGINE | Udfald (elevtype: problem) |
|---|---|---|---|---|
| 1-uden-kursusindhold | f51f39e4 (#740-kandidaten) | DB0 | - | SIKKER |
| 1-uden-kursusindhold | f51f39e4 (#740-kandidaten) | DB0 | v1 | SIKKER |
| 1-uden-kursusindhold | f51f39e4 (#740-kandidaten) | DB1 | - | SIKKER |
| 1-uden-kursusindhold | f51f39e4 (#740-kandidaten) | DB1 | v1 | SIKKER |
| 1-uden-kursusindhold | f51f39e4 (#740-kandidaten) | DB2 | - | SIKKER |
| 1-uden-kursusindhold | f51f39e4 (#740-kandidaten) | DB2 | v1 | SIKKER |
| 1-uden-kursusindhold | f51f39e4 (#740-kandidaten) | DB2↓ | - | SIKKER |
| 1-uden-kursusindhold | f51f39e4 (#740-kandidaten) | DB2↓ | v1 | SIKKER |
| 1-uden-kursusindhold | f51f39e4 (#740-kandidaten) | DB3 | - | SIKKER |
| 1-uden-kursusindhold | f51f39e4 (#740-kandidaten) | DB3 | v1 | SIKKER |
| 1-uden-kursusindhold | 05a4a34f (#739, main) | DB0 | - | SIKKER |
| 1-uden-kursusindhold | 05a4a34f (#739, main) | DB0 | v1 | SIKKER |
| 1-uden-kursusindhold | 05a4a34f (#739, main) | DB1 | - | SIKKER |
| 1-uden-kursusindhold | 05a4a34f (#739, main) | DB1 | v1 | SIKKER |
| 1-uden-kursusindhold | 05a4a34f (#739, main) | DB2 | - | SIKKER |
| 1-uden-kursusindhold | 05a4a34f (#739, main) | DB2 | v1 | SIKKER |
| 1-uden-kursusindhold | 05a4a34f (#739, main) | DB2↓ | - | SIKKER |
| 1-uden-kursusindhold | 05a4a34f (#739, main) | DB2↓ | v1 | SIKKER |
| 1-uden-kursusindhold | 05a4a34f (#739, main) | DB3 | - | SIKKER |
| 1-uden-kursusindhold | 05a4a34f (#739, main) | DB3 | v1 | SIKKER |
| 1-uden-kursusindhold | dette træ (F8), parkering til | DB0 | - | USIKKER: A: fastlåst (column t.activation_no does not exist), serverfejl 500; R: fastlåst (column t.activation_no does not exist), serverfejl 500 |
| 1-uden-kursusindhold | dette træ (F8), parkering til | DB0 | v1 | USIKKER: A: fastlåst (column t.activation_no does not exist), serverfejl 500; R: fastlåst (column t.activation_no does not exist), serverfejl 500 |
| 1-uden-kursusindhold | dette træ (F8), parkering til | DB1 | - | USIKKER: A: fastlåst (column t.activation_no does not exist), serverfejl 500; R: fastlåst (column t.activation_no does not exist), serverfejl 500 |
| 1-uden-kursusindhold | dette træ (F8), parkering til | DB1 | v1 | USIKKER: A: fastlåst (column t.activation_no does not exist), serverfejl 500; R: fastlåst (column t.activation_no does not exist), serverfejl 500 |
| 1-uden-kursusindhold | dette træ (F8), parkering til | DB2 | - | USIKKER: A: fastlåst (column t.activation_no does not exist), serverfejl 500; R: fastlåst (column t.activation_no does not exist), serverfejl 500 |
| 1-uden-kursusindhold | dette træ (F8), parkering til | DB2 | v1 | USIKKER: A: fastlåst (column t.activation_no does not exist), serverfejl 500; R: fastlåst (column t.activation_no does not exist), serverfejl 500 |
| 1-uden-kursusindhold | dette træ (F8), parkering til | DB2↓ | - | USIKKER: A: fastlåst (column t.activation_no does not exist), serverfejl 500; R: fastlåst (column t.activation_no does not exist), serverfejl 500 |
| 1-uden-kursusindhold | dette træ (F8), parkering til | DB2↓ | v1 | USIKKER: A: fastlåst (column t.activation_no does not exist), serverfejl 500; R: fastlåst (column t.activation_no does not exist), serverfejl 500 |
| 1-uden-kursusindhold | dette træ (F8), parkering til | DB3 | - | SIKKER |
| 1-uden-kursusindhold | dette træ (F8), parkering til | DB3 | v1 | SIKKER |
| 1-uden-kursusindhold | a7450b0f (produktion i dag) | DB0 | - | SIKKER |
| 1-uden-kursusindhold | a7450b0f (produktion i dag) | DB0 | v1 | SIKKER |
| 1-uden-kursusindhold | a7450b0f (produktion i dag) | DB1 | - | SIKKER |
| 1-uden-kursusindhold | a7450b0f (produktion i dag) | DB1 | v1 | SIKKER |
| 1-uden-kursusindhold | a7450b0f (produktion i dag) | DB2 | - | SIKKER |
| 1-uden-kursusindhold | a7450b0f (produktion i dag) | DB2 | v1 | SIKKER |
| 1-uden-kursusindhold | a7450b0f (produktion i dag) | DB2↓ | - | SIKKER |
| 1-uden-kursusindhold | a7450b0f (produktion i dag) | DB2↓ | v1 | SIKKER |
| 1-uden-kursusindhold | a7450b0f (produktion i dag) | DB3 | - | SIKKER |
| 1-uden-kursusindhold | a7450b0f (produktion i dag) | DB3 | v1 | SIKKER |
| 1-uden-kursusindhold | dette træ (F8), parkering fra | DB0 | - | SIKKER |
| 1-uden-kursusindhold | dette træ (F8), parkering fra | DB0 | v1 | SIKKER |
| 1-uden-kursusindhold | dette træ (F8), parkering fra | DB1 | - | SIKKER |
| 1-uden-kursusindhold | dette træ (F8), parkering fra | DB1 | v1 | SIKKER |
| 1-uden-kursusindhold | dette træ (F8), parkering fra | DB2 | - | SIKKER |
| 1-uden-kursusindhold | dette træ (F8), parkering fra | DB2 | v1 | SIKKER |
| 1-uden-kursusindhold | dette træ (F8), parkering fra | DB2↓ | - | SIKKER |
| 1-uden-kursusindhold | dette træ (F8), parkering fra | DB2↓ | v1 | SIKKER |
| 1-uden-kursusindhold | dette træ (F8), parkering fra | DB3 | - | SIKKER |
| 1-uden-kursusindhold | dette træ (F8), parkering fra | DB3 | v1 | SIKKER |
| 2-med-kursusindhold | f51f39e4 (#740-kandidaten) | DB0 | - | USIKKER: R: fastlåst (no_questions); B: fastlåst (course_round_open); B2: åben kursusrunde slettet; C2: kursusforløbet flyttet, kursussvar genåbnet |
| 2-med-kursusindhold | f51f39e4 (#740-kandidaten) | DB0 | v1 | USIKKER: R: fastlåst (no_questions); B: fastlåst (course_round_open); B2: åben kursusrunde slettet; C2: kursusforløbet flyttet, kursussvar genåbnet |
| 2-med-kursusindhold | f51f39e4 (#740-kandidaten) | DB1 | - | USIKKER: B: fastlåst (course_round_open); B2: fastlåst (course_round_open) |
| 2-med-kursusindhold | f51f39e4 (#740-kandidaten) | DB1 | v1 | USIKKER: B: fastlåst (course_round_open); B2: fastlåst (course_round_open) |
| 2-med-kursusindhold | f51f39e4 (#740-kandidaten) | DB2 | - | USIKKER: B: fastlåst (course_round_open); B2: fastlåst (course_round_open) |
| 2-med-kursusindhold | f51f39e4 (#740-kandidaten) | DB2 | v1 | USIKKER: B: fastlåst (course_round_open); B2: fastlåst (course_round_open) |
| 2-med-kursusindhold | f51f39e4 (#740-kandidaten) | DB2↓ | - | USIKKER: B: fastlåst (course_round_open); B2: fastlåst (course_round_open) |
| 2-med-kursusindhold | f51f39e4 (#740-kandidaten) | DB2↓ | v1 | USIKKER: B: fastlåst (course_round_open); B2: fastlåst (course_round_open) |
| 2-med-kursusindhold | f51f39e4 (#740-kandidaten) | DB3 | - | USIKKER: B: fastlåst (course_round_open); B2: fastlåst (course_round_open) |
| 2-med-kursusindhold | f51f39e4 (#740-kandidaten) | DB3 | v1 | USIKKER: B: fastlåst (course_round_open); B2: fastlåst (course_round_open) |
| 2-med-kursusindhold | 05a4a34f (#739, main) | DB0 | - | USIKKER: R: fastlåst (no_questions); B: fastlåst (course_round_open); B2: åben kursusrunde slettet; C2: kursusforløbet flyttet, kursussvar genåbnet |
| 2-med-kursusindhold | 05a4a34f (#739, main) | DB0 | v1 | USIKKER: R: fastlåst (no_questions); B: fastlåst (course_round_open); B2: åben kursusrunde slettet; C2: kursusforløbet flyttet, kursussvar genåbnet |
| 2-med-kursusindhold | 05a4a34f (#739, main) | DB1 | - | USIKKER: B: fastlåst (course_round_open); B2: fastlåst (course_round_open) |
| 2-med-kursusindhold | 05a4a34f (#739, main) | DB1 | v1 | USIKKER: B: fastlåst (course_round_open); B2: fastlåst (course_round_open) |
| 2-med-kursusindhold | 05a4a34f (#739, main) | DB2 | - | USIKKER: B: fastlåst (course_round_open); B2: fastlåst (course_round_open) |
| 2-med-kursusindhold | 05a4a34f (#739, main) | DB2 | v1 | USIKKER: B: fastlåst (course_round_open); B2: fastlåst (course_round_open) |
| 2-med-kursusindhold | 05a4a34f (#739, main) | DB2↓ | - | USIKKER: B: fastlåst (course_round_open); B2: fastlåst (course_round_open) |
| 2-med-kursusindhold | 05a4a34f (#739, main) | DB2↓ | v1 | USIKKER: B: fastlåst (course_round_open); B2: fastlåst (course_round_open) |
| 2-med-kursusindhold | 05a4a34f (#739, main) | DB3 | - | USIKKER: B: fastlåst (course_round_open); B2: fastlåst (course_round_open) |
| 2-med-kursusindhold | 05a4a34f (#739, main) | DB3 | v1 | USIKKER: B: fastlåst (course_round_open); B2: fastlåst (course_round_open) |
| 2-med-kursusindhold | dette træ (F8), parkering til | DB0 | - | USIKKER: A: fastlåst (column t.activation_no does not exist), serverfejl 500; R: fastlåst (column t.activation_no does not exist), serverfejl 500; B: fastlåst (column t.activation_no does not exist), serverfejl 500; B2: fastlåst (column t.activation_no does not exist), serverfejl 500, åben kursusrunde slettet; C: serverfejl 500; C2: serverfejl 500; D: fastlåst (column t.activation_no does not exist), serverfejl 500; F: fastlåst (column t.activation_no does not exist), serverfejl 500 |
| 2-med-kursusindhold | dette træ (F8), parkering til | DB0 | v1 | USIKKER: A: fastlåst (column t.activation_no does not exist), serverfejl 500; R: fastlåst (column t.activation_no does not exist), serverfejl 500; B: fastlåst (column t.activation_no does not exist), serverfejl 500; B2: fastlåst (column t.activation_no does not exist), serverfejl 500, åben kursusrunde slettet; C: serverfejl 500; C2: serverfejl 500; D: fastlåst (column t.activation_no does not exist), serverfejl 500; F: fastlåst (column t.activation_no does not exist), serverfejl 500 |
| 2-med-kursusindhold | dette træ (F8), parkering til | DB1 | - | USIKKER: A: fastlåst (column t.activation_no does not exist), serverfejl 500; R: fastlåst (column t.activation_no does not exist), serverfejl 500; B: fastlåst (column t.activation_no does not exist), serverfejl 500; B2: fastlåst (column t.activation_no does not exist), serverfejl 500; C: serverfejl 500; C2: serverfejl 500; D: fastlåst (column t.activation_no does not exist), serverfejl 500; F: fastlåst (column t.activation_no does not exist), serverfejl 500 |
| 2-med-kursusindhold | dette træ (F8), parkering til | DB1 | v1 | USIKKER: A: fastlåst (column t.activation_no does not exist), serverfejl 500; R: fastlåst (column t.activation_no does not exist), serverfejl 500; B: fastlåst (column t.activation_no does not exist), serverfejl 500; B2: fastlåst (column t.activation_no does not exist), serverfejl 500; C: serverfejl 500; C2: serverfejl 500; D: fastlåst (column t.activation_no does not exist), serverfejl 500; F: fastlåst (column t.activation_no does not exist), serverfejl 500 |
| 2-med-kursusindhold | dette træ (F8), parkering til | DB2 | - | USIKKER: A: fastlåst (column t.activation_no does not exist), serverfejl 500; R: fastlåst (column t.activation_no does not exist), serverfejl 500; B: fastlåst (column t.activation_no does not exist), serverfejl 500; B2: fastlåst (column t.activation_no does not exist), serverfejl 500; C: serverfejl 500; C2: serverfejl 500; D: fastlåst (column t.activation_no does not exist), serverfejl 500; F: fastlåst (column t.activation_no does not exist), serverfejl 500 |
| 2-med-kursusindhold | dette træ (F8), parkering til | DB2 | v1 | USIKKER: A: fastlåst (column t.activation_no does not exist), serverfejl 500; R: fastlåst (column t.activation_no does not exist), serverfejl 500; B: fastlåst (column t.activation_no does not exist), serverfejl 500; B2: fastlåst (column t.activation_no does not exist), serverfejl 500; C: serverfejl 500; C2: serverfejl 500; D: fastlåst (column t.activation_no does not exist), serverfejl 500; F: fastlåst (column t.activation_no does not exist), serverfejl 500 |
| 2-med-kursusindhold | dette træ (F8), parkering til | DB2↓ | - | USIKKER: A: fastlåst (column t.activation_no does not exist), serverfejl 500; R: fastlåst (column t.activation_no does not exist), serverfejl 500; B: fastlåst (column t.activation_no does not exist), serverfejl 500; B2: fastlåst (column t.activation_no does not exist), serverfejl 500; C: serverfejl 500; C2: serverfejl 500; D: fastlåst (column t.activation_no does not exist), serverfejl 500; F: fastlåst (column t.activation_no does not exist), serverfejl 500 |
| 2-med-kursusindhold | dette træ (F8), parkering til | DB2↓ | v1 | USIKKER: A: fastlåst (column t.activation_no does not exist), serverfejl 500; R: fastlåst (column t.activation_no does not exist), serverfejl 500; B: fastlåst (column t.activation_no does not exist), serverfejl 500; B2: fastlåst (column t.activation_no does not exist), serverfejl 500; C: serverfejl 500; C2: serverfejl 500; D: fastlåst (column t.activation_no does not exist), serverfejl 500; F: fastlåst (column t.activation_no does not exist), serverfejl 500 |
| 2-med-kursusindhold | dette træ (F8), parkering til | DB3 | - | SIKKER |
| 2-med-kursusindhold | dette træ (F8), parkering til | DB3 | v1 | SIKKER |
| 2-med-kursusindhold | a7450b0f (produktion i dag) | DB0 | - | USIKKER: R: kursusopgave i almindelig quiz; B: kursusforløbet flyttet, kursusopgave i almindelig quiz; B2: åben kursusrunde slettet; C: kursusopgave i almindelig quiz; C2: kursusforløbet flyttet, kursusopgave i almindelig quiz, kursussvar genåbnet |
| 2-med-kursusindhold | a7450b0f (produktion i dag) | DB0 | v1 | USIKKER: R: kursusopgave i almindelig quiz; B: kursusforløbet flyttet, kursusopgave i almindelig quiz; B2: åben kursusrunde slettet; C: kursusopgave i almindelig quiz; C2: kursusforløbet flyttet, kursusopgave i almindelig quiz, kursussvar genåbnet |
| 2-med-kursusindhold | a7450b0f (produktion i dag) | DB1 | - | USIKKER: R: kursusopgave i almindelig quiz; B: kursusforløbet flyttet, kursusopgave i almindelig quiz; B2: kursusforløbet flyttet, kursusopgave i almindelig quiz; C: kursusopgave i almindelig quiz |
| 2-med-kursusindhold | a7450b0f (produktion i dag) | DB1 | v1 | USIKKER: B: kursusforløbet flyttet, kursusopgave i almindelig quiz; B2: kursusforløbet flyttet, kursusopgave i almindelig quiz |
| 2-med-kursusindhold | a7450b0f (produktion i dag) | DB2 | - | USIKKER: R: kursusopgave i almindelig quiz; B: kursusforløbet flyttet, kursusopgave i almindelig quiz; B2: kursusforløbet flyttet, kursusopgave i almindelig quiz; C: kursusopgave i almindelig quiz |
| 2-med-kursusindhold | a7450b0f (produktion i dag) | DB2 | v1 | USIKKER: B: kursusforløbet flyttet, kursusopgave i almindelig quiz; B2: kursusforløbet flyttet, kursusopgave i almindelig quiz |
| 2-med-kursusindhold | a7450b0f (produktion i dag) | DB2↓ | - | USIKKER: R: kursusopgave i almindelig quiz; B: kursusforløbet flyttet, kursusopgave i almindelig quiz; B2: kursusforløbet flyttet, kursusopgave i almindelig quiz; C: kursusopgave i almindelig quiz |
| 2-med-kursusindhold | a7450b0f (produktion i dag) | DB2↓ | v1 | USIKKER: B: kursusforløbet flyttet, kursusopgave i almindelig quiz; B2: kursusforløbet flyttet, kursusopgave i almindelig quiz |
| 2-med-kursusindhold | a7450b0f (produktion i dag) | DB3 | - | USIKKER: R: kursusopgave i almindelig quiz; B: kursusforløbet flyttet, kursusopgave i almindelig quiz; B2: kursusforløbet flyttet, kursusopgave i almindelig quiz; C: kursusopgave i almindelig quiz |
| 2-med-kursusindhold | a7450b0f (produktion i dag) | DB3 | v1 | USIKKER: B: kursusforløbet flyttet, kursusopgave i almindelig quiz; B2: kursusforløbet flyttet, kursusopgave i almindelig quiz |
| 2-med-kursusindhold | dette træ (F8), parkering fra | DB0 | - | USIKKER: R: fastlåst (no_questions); B: fastlåst (course_round_open); B2: åben kursusrunde slettet; C2: kursusforløbet flyttet, kursussvar genåbnet |
| 2-med-kursusindhold | dette træ (F8), parkering fra | DB0 | v1 | USIKKER: R: fastlåst (no_questions); B: fastlåst (course_round_open); B2: åben kursusrunde slettet; C2: kursusforløbet flyttet, kursussvar genåbnet |
| 2-med-kursusindhold | dette træ (F8), parkering fra | DB1 | - | USIKKER: B: fastlåst (course_round_open); B2: fastlåst (course_round_open) |
| 2-med-kursusindhold | dette træ (F8), parkering fra | DB1 | v1 | USIKKER: B: fastlåst (course_round_open); B2: fastlåst (course_round_open) |
| 2-med-kursusindhold | dette træ (F8), parkering fra | DB2 | - | USIKKER: B: fastlåst (course_round_open); B2: fastlåst (course_round_open) |
| 2-med-kursusindhold | dette træ (F8), parkering fra | DB2 | v1 | USIKKER: B: fastlåst (course_round_open); B2: fastlåst (course_round_open) |
| 2-med-kursusindhold | dette træ (F8), parkering fra | DB2↓ | - | USIKKER: B: fastlåst (course_round_open); B2: fastlåst (course_round_open) |
| 2-med-kursusindhold | dette træ (F8), parkering fra | DB2↓ | v1 | USIKKER: B: fastlåst (course_round_open); B2: fastlåst (course_round_open) |
| 2-med-kursusindhold | dette træ (F8), parkering fra | DB3 | - | USIKKER: B: fastlåst (course_round_open); B2: fastlåst (course_round_open) |
| 2-med-kursusindhold | dette træ (F8), parkering fra | DB3 | v1 | USIKKER: B: fastlåst (course_round_open); B2: fastlåst (course_round_open) |
<!-- MATRIX:END -->

## Grænser
- PostgREST er en stand-in. En bane med rigtig PostgREST og `supabase functions serve` pr. version er foreslået i
  `docs/operations/ci-workflow-proposals/rollback-lane.md`.
- Klienten (`spil.html`) køres ikke. Hvad eleven **ser** ved `course_round_open`, dækkes af introduktionsbanen.
- **Gamle Edge-versioner kræver deres commits.** CI tjekker shallow ud: cellerne springes over med begrundelse. Det foreslåede
  rollback-job henter de to commits og sætter `ROLLBACK_EDGE_REQUIRED=1`, så de dér ikke kan springes over.
- **Samtidighed** (to faner under et versionsskift) er ikke dækket her. Det hører til F8's PG-samtidighedstests.
