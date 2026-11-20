# Lærligverse F11-B: gennemgang af `laerligverse.bridge/3` (den synlige serverintroduktion)

**Status: gennemgang af PR #723 (2026-11-16, opdateret 2026-11-17 efter den endelige kvalitetssikring).** Intet er anvendt i produktionen, og intet er slået til. Introduktionen kræver stadig migrationerne `20261109043500` og `20261110043500` (ikke anvendt i produktionen), Edge-flagene `LAERLIGVERSE_INTRODUCTION` og `LAERLIGVERSE_PRESENTED` (slukket) og værtskonfigurationen `introductions: true` (findes kun i ikke-produktionssider). Mappen `laerligverse/` er ikke i Cloudflares deploy-allowlist.

Kontrakten for tilstandene står i [eksponering-datakontrakt.md](eksponering-datakontrakt.md). Denne side beskriver, hvad broændringen må og ikke må, og hvor det er bevist.

**Om navnet CR-01:** i dette repo er `CR-01` clean-room-tjekket mod en ekstern denylist (`adventure-engine/tools/check-clean-room.mjs` og CI-jobbet `cr01`). Det er kørt lokalt: `clean-room: OK`, men denylist-delen er `SKIP`, fordi den private denylist ikke findes på maskinen. Resultatet skal ses i CI-jobbet. Gennemgangen her er den systematiske protokol- og sikkerhedsgennemgang, som ejeren bad om under samme navn.

## 1. Resultat

**Ingen åbne sikkerhedsfund i broændringen.** Den endelige kvalitetssikring (2026-11-17) fandt og rettede ét fund i elevoplevelsen: prototypespillet kunne vise to introduktioner (§3a). Hashintegriteten er vurderet i §5a. De resterende bevidste begrænsninger står i §8.

## 2. Protokolændringer

| Retning | Ny besked | Felter (præcis, intet andet) | Kode |
|---|---|---|---|
| Vært → spil | `intro.present` | `protocol, type, nonce, requestId, introToken, contextKey, cards` | `protocol.ts` `parseHostMessage` |
| Spil → vært | `intro.shown` | `protocol, type, nonce, requestId, introToken` | `protocol.ts` `parseGameMessage` |
| Spil → vært | `intro.done` | `protocol, type, nonce, requestId, introToken` | `protocol.ts` `parseGameMessage` |
| Vært → spil | `intro.recorded` | `protocol, type, nonce, requestId, introToken, event` (`shown`/`done`) | `protocol.ts` `parseHostMessage` |

- **Kort:** 1–10 objekter med præcis `{title, text}`. Titlen er højst 120 tegn og teksten højst 1.200, og ingen af dem må være tomme. Hele beskeden er stadig højst 8.192 bytes (`MAX_MESSAGE_BYTES`, uændret). Bevist i `introduction.test.ts` › "cards: 1–10 objects …", inklusive 8 kort med æ/ø, der fylder over 8.192 bytes.
- **Ingen eksisterende validering er fjernet.** Alle tidligere tests i `bridge.test.ts`, `protocol.test.ts` og `laerlig-service.test.ts` er uændrede og grønne. To testopsætninger er tilpasset versionen (§9).

## 3. Kompatibilitet og versionsforhandling

- **Valget af version:** `hello` sendes altid i bridge/2-konvolutten (`HELLO_PROTOCOL`), som alle værter siden bridge/2 læser. `supports` lister spillets versioner. Værten vælger den nyeste fælles version, den selv kan bære, og svarer `init` i den.
- **bridge/3 betyder: serverens introduktion er autoritativ.** En vært forhandler kun bridge/3, når dens service viser serverens introduktion (`showsIntroductions`: `fetchStep` og `reportIntroduction` findes, og `introductions` er ikke `false`; `LaerligTaskService.introductions` følger værtens `introductions`-konfiguration). En vært uden introduktioner holder også et introduktionskompatibelt spil på bridge/2.
  - Et spil, der kun tilbyder bridge/3, får stadig bridge/3, fordi bridge/3 bærer hele bridge/2.
  - Bevist i `introduction.test.ts` › "a host WITHOUT introductions keeps an introduction-capable game on bridge/2 …", "a host WITH introductions negotiates bridge/3 …", "a game offering ONLY bridge/3 …" og "the service's introductions switch decides …", samt `laerligverse-host.test.mjs` › "F11-B: a host WITHOUT introductions keeps a bridge/3-capable game on bridge/2 …" gennem den genererede bro.
- **Låst version:** hver senere besked i sessionen skal have præcis den aftalte version. Ellers afvises den med `invalid_message` (`host.ts` `onMessage`).
- **Kun bridge/3:** introduktionsbeskederne parses kun i bridge/3-konvolutten (`envelope`).
- **Et spil uden introduktionsvisning** (`introductions` fravær/false, fx et cachet spil eller de eksisterende harness-specs) tilbyder kun bridge/2. Værten bruger da `fetchTask`, som afviser et introduktionssvar eksplicit, og spillet får `task_unavailable`.
  - Det kan aldrig modtage en introduktion, og det kan ikke melde en som vist eller gennemført.
  - Bevist i `introduction.test.ts` › "negotiates bridge/2, never receives an introduction …" og i `laerligverse-host.test.mjs` › "F11-B: a bridge/2 game on the same host …", som bruger den genererede JavaScript-bro.
- **Ukendt version:** `unsupported_protocol` i hello-konvolutten, og der oprettes ingen session. Bevist i `introduction.test.ts` › "a game that speaks only an unknown version …".
- **Almindelige opgaver:** et spil med `introductions: true` kører fortsat det almindelige opgaveforløb, både i bridge/2 (vært uden introduktioner) og i bridge/3. Bevist i `introduction.test.ts` › "a host WITHOUT introductions …" og hele introduktionskæden.

## 3a. Én introduktion, aldrig to (fund og rettelse 2026-11-17)

**Fundet:** prototypespillet (`game-main.ts`) viste sin lokale introduktion (`INTRO_CARDS` og `INTRO_CHECK`, D-310) før første anmodning, når `intro_seen` var falsk. Serveren kunne bagefter sende sin egen introduktion til samme mål, så eleven mødte to konkurrerende introduktioner. Spillet kunne ikke se forskel, fordi en vært forhandlede bridge/3 med ethvert spil, der tilbød den, også når værten ikke viste serverintroduktioner.

**Rettelsen** er bagudkompatibel og kræver ingen ny kontrakt:
1. Værten forhandler kun bridge/3, når den viser serverens introduktion (§3). Sessionens version fortæller dermed spillet, hvem der er autoritativ.
2. Spillet viser kun sin lokale introduktion i en bridge/2-session: ved første beslutningspunkt og én gang (`sequence.ts` `showsLocalIntroduction`). Det gælder også, når håndtrykket fejlede.
3. I en bridge/3-session bestemmer serveren. Den sender sin introduktion, og bagefter følger den lokale arkivkort-øvelse (D-322 trin 1, aldrig evidens) som før. Har eleven allerede gennemført den, eller har målet ingen introduktion, sender serveren direkte opgaven.

**Uændret:** med serverintroduktionen slået fra (`introductions: false`, bridge/2) opfører prototypen sig præcis som før. `adventure-engine/e2e/archive.spec.ts` er kørt lokalt i Chromium med 16/16.

**Bevist i:**
- `archive-prototype/test/intro-authority.test.ts` (bridge/2: lokal én gang; bridge/3: aldrig lokal; intet håndtryk: lokal);
- testene fra §3.

**Konsekvens for aktivering:** en vært med `introductions: true` viser ingen lokal introduktion. Den skal derfor kun bruges sammen med `LAERLIGVERSE_INTRODUCTION=on` og en aktiv introduktion for målet. Ellers møder eleven ingen introduktion, men går direkte til opgaven. Det er en aktiveringsbetingelse, ikke en kodefejl (§10).

## 4. Tillidsgrænser og tokenhåndtering

- **Spillet modtager kun kortenes titel og tekst og et uigennemsigtigt `introToken`.** Rundens id, indholdets hash og målet bliver hos værten (`IntroEntry`). Bevist i:
  - `introduction.test.ts` › "serves the cards with an opaque token …";
  - `laerligverse-host.test.mjs`, der scanner alt, spillet modtog, for JWT, `Bearer`, runde-id, hash, mål og `authorization`;
  - den isolerede E2E, der scanner `__lvReceived`.
- **`introToken` er ingen fuldmagt.**
  - Det gælder kun i den aktuelle spilsession, fordi et nyt `hello` sletter alle introduktionstokens, og et gammelt token giver `unknown_task`.
  - Det gælder kun for den runde, det blev udstedt til.
  - Serveren kontrollerer altid ejerskabet med den verificerede elev.
  
  Bevist i `introduction.test.ts` › "refuses done before shown, a foreign token and a token from an earlier game session".
- **Session og funktioner:**
  - Værten kalder kun `introduction-progress` med elevens egen session. Edge-kalderen tillader funktionen udelukkende, når værten er konfigureret med `introductions: true`, ellers giver den `unknown function`.
  - `introductions` uden serverstyret sekvens afvises i `host-core.js`, `host-app.js` og `host-page.mjs`.
  - Ingen service-nøgle kommer i browseren.
- **Andre elever:** en anden elev kan hverken melde "vist" eller "gennemført" på rundens id. Serveren svarer 404, og rækkerne er uændrede (isoleret E2E, trin 13).

## 5. Inputvalidering i servicen

`LaerligTaskService.parseIntroduction` accepterer kun det dokumenterede svar fra get-next-question:
- præcis de seks felter;
- `learning_objective` lig med det kortlagte mål;
- `learning_step: "introduction"`;
- et UUID som runde-id;
- et sha256 i hex;
- `content` præcis `{cards}`.

Alt andet giver `ServiceError("server")`. Det gælder også svarnøgler på topniveau, i `content` eller i et kort. Bevist i `introduction.test.ts` › "refuses anything but the documented reply …" med 11 manipulerede svar.

`reportIntroduction` sender kun UUID'er. Et ikke-UUID afvises, før der sendes noget netværkskald.

## 5a. Indholdets hash: hvilke garantier findes hvor (2026-11-17)

| Garanti | Hvor den findes | Status |
|---|---|---|
| **A. Format** | Værten: `parseIntroduction` kræver 64 hex-tegn. Edge: `decideIntroduction` kræver det samme. | Findes |
| **B. Indhold svarer til hash** | Databasen: triggeren `learning_introductions_guard` beregner `sha256(convert_to(content::text, 'UTF8'))` ved INSERT og overskriver altid kalderens værdi. Indholdet er uforanderligt, så kun `is_active` må ændres, og en ny tekst er en ny række. | Findes på serveren |
| **C. Version og runde er konsistente** | Databasen: `introduction_rounds` gemmer `introduction_id` og `content_sha256` ved servering, og triggeren fryser begge. `serve_introduction` returnerer indholdet fra rundens egen version, ikke den aktuelle aktive. En gammel runde genoptages derfor med sine oprindelige kort. En ny version giver en ny hash, men en elev, der allerede har en runde, introduceres ikke igen. | Findes på serveren |
| **D. Afsenderens ægthed** | Værten kalder kun sine tilladte Edge Functions over TLS med elevens egen JWT. Spillet ser hverken hash, runde-id eller JWT. | Findes (TLS, allowlist), ingen signatur |

**Vurdering: værten skal ikke genberegne hashen.**
- Hashen er beregnet over PostgreSQL's kanoniske `jsonb`-tekst. Den har sin egen nøgleorden og mellemrumsformat og er ikke `JSON.stringify`.
- Edge-funktionen sender desuden kun de offentlige `cards` videre (`publicIntroduction`). En genberegning i værten ville kræve en ny, opfundet hashkonvention, som ikke matcher backend.
- Hashen indgår ikke i registreringen. `introduction-progress` modtager kun `action`, `round_id` og `request_id`, og serveren slår runden op med den verificerede elev. En forkert eller inkonsistent hash kan derfor ikke give en forkert registrering eller et forkert forløb.
- Hashen er serverens versions-id, som værten validerer i format og holder for sig selv.

**Ingen integritetsrisiko, som kræver en ændring før merge.**

## 6. Idempotens, gentagelser og genoptagelse

- **Ét request-ID pr. runde og hændelse:** `lvb3:intro:<runde>:shown` og `…:done` gemmes i værtens `sessionStorage`, før de bruges første gang. De deles aldrig mellem runder eller mellem shown og done. Bevist i `introduction.test.ts` › "shown → done → …".
- **Genindlæsning:** en genindlæst værtsside genbruger samme id, og serveren svarer `replay`. Bevist i "a reloaded HOST page resends the same request id …".
- **Samtidighed:** to samtidige "done" giver ét serverkald. Et forbigående netværksfejl gentages med samme id. Bevist i "concurrent done reports make ONE server call …".
- **Rækkefølge:** "done" kræver et registreret "shown" i samme session (`invalid_message` ellers). Den negative kontrol (§9) viser, at testen opdager, hvis vagten fjernes.
- **Serverens tider flyttes aldrig:** `presented_at` og `completed_at` sættes én gang, og en anden fane eller et nyt login giver `already_recorded`/`already_completed`. Bevist mod den rigtige database i den isolerede E2E: genindlæsning af spil og vært, nyt login og to faner.
- **Udløbet session:** `session_expired` sendes til spillet, intet markeres, og et senere forsøg gennemfører. Bevist i "an expired session is reported as session_expired …".

## 7. Fejlhåndtering, faglig integritet og belønning

- **Ingen død tilstand:** `IntroView.showServer` lukker kun, når serveren har registreret "done". Ved fejl står fejlen og den samme knap tilbage.
  - Kortene vises som tekst (`textContent`), aldrig som HTML.
  - Fokus flyttes til knappen, så hele forløbet kan gennemføres med tastaturet (isoleret E2E: `Enter` på hvert kort).
- **Backenddata, protokollen ikke kan bære** (fx for store kort), giver en eksplicit `server_error` og aldrig en hængende anmodning.
- **De fem tilstande holdes adskilt:** udleveret (`served_at`), præsenteret (`presented_at`), gennemført (`completed_at`), besvaret (`question_attempts`) og demonstreret (`evidence.ts`). Ingen besked i protokollen kan bære XP, mønter, mastery, niveau eller evidens.
  - Den isolerede E2E kontrollerer, at `student_progress`, `student_subject_level`, `student_level_fold_log`, `question_attempts` og `student_events` er uændrede fra servering til første opgave.
  - Den kontrollerer også, at først et rigtigt svar belønnes efter de gældende regler.
  - #664's PGlite-test (`laerligverse-introduction-flow-run.test.mjs`) viser det samme på databaseniveau med en negativ kontrol.

## 8. Bevidste begrænsninger

1. **Indholdets hash** valideres i format, men værten genberegner det ikke. Det er bevidst og begrundet i §5a.
2. **`INTRO_CHECK`** (det lokale forståelsestjek) er ikke med i serverintroduktionen og vises derfor ikke i en bridge/3-session. Teksten er ikke slettet: den findes uændret og vises fortsat i bridge/2. Om tjekket skal blive en del af serverens introduktion, er LP-13's afgørelse.
3. **`intro_seen`** er spillets egen verdenstilstand i hukommelsen. Den er aldrig progression. I bridge/3 er det serverens `completed_at`, der bestemmer, om introduktionen er gennemført.

## 9. Testdækning og regression

| Niveau | Hvad | Hvor |
|---|---|---|
| Protokol | Gyldige og ugyldige beskeder, versioner, størrelse, svarnøgler | `adventure-engine/packages/learning-bridge/test/introduction.test.ts` |
| Vært og klient | Kæden, tokens, rækkefølge, genindlæsning, samtidighed, gentagelse, udløbet session, bridge/2-kompatibilitet | samme |
| Negativ kontrol | En fjernet rækkefølgevagt opdages (fjernes igen i `afterEach`) | samme, "NEGATIVE CONTROL …" |
| Service | Svarvalidering og kortlægning af alle udfald fra `introduction-progress` | samme |
| Genereret værtsbro | Allowlist, konfiguration, kæden og bridge/2 gennem `laerligverse/host/bridge/*.js` | `tests/unit/laerligverse-host.test.mjs` |
| Ægte browser | Login, vært, iframe, synlige kort, tastatur, database som orakel, to faner, anden elev, netværk, belønning | `tests/isolated/laerligverse-intro-visible.isolated.spec.mjs` (introduktionsbanen, alle tre browsere; testspillet D-315) |
| Det rigtige spil (F11-C) | Det rigtige Arkivskabet (`game-main.ts`) mod den isolerede backend: login, serverens introduktion, shown/done i databasen, genindlæsning før og efter, to faner, to elever, netværksbrud, arkivkortet, første opgave besvaret, ingen belønning for introduktionen, forkert tilbagerulningsrækkefølge | `tests/isolated/laerligverse-arkivskabet-real.isolated.spec.mjs` (introduktionsbanen, alle tre browsere) |

**Det rigtige spil i testen (F11-C):**
- Spillet bygges kun i introduktionsbanen, før netværkslåsen, af `tests/isolated/laerligverse-harness/build-arkivskabet.mjs`, og lægges i runnerens midlertidige mappe.
- Buildet har én indgang, `game.html`. Prototypens egen værtsside med svarnøgler er ikke med.
- Spillets værtsoprindelse er bagt ind som `127.0.0.1:4330`, altså harnessens F3-vært.
- `checkGameDist()` afviser buildet, før noget serveres, hvis det indeholder en værtsside, værtskode, sourcemaps eller en forkert oprindelse.
- Spiloprindelsen serverer kun `game.html` og buildets egne `assets/`-filer.
- Intet af dette er en del af `tools/cloudflare-build-static.mjs` eller produktionsbundlet.
- Når spillet ændres, følger testen med automatisk: den bygger altid commit'ens eget spil. Ændres en selektor eller et forløb i spillet (fx `#lv-intro`, `#lv-task` eller arkivkortet), skal hjælpefunktionerne øverst i specen rettes.
- **Ikke dækket:** den sikre tilbagerulningsrækkefølge (backend-flag fra først). Backend-flaget kan ikke skiftes inden for én bane, fordi funktionerne serveres én gang. En "shown", der fejler alene, er heller ikke dækket i browseren; broens unit-tests dækker den.

Testopsætninger, der er tilpasset versionen uden at svække en påstand:
- **`test/harness.ts`:** standardspillet tilbyder bridge/3 (`introductions: true`). Sessionens version afgøres af værtens service: `FakeTaskService` giver bridge/2, `IntroService` giver bridge/3.
- **Rå beskeder i `bridge.test.ts`** bruger sessionens version (`PROTOCOL_V2`), så hver afvisning sker af den grund, testen skal afprøve, og ikke på grund af en versionsfejl.
- **Den isolerede `laerligverse-backend.isolated.spec.mjs`** er tilbage på sin oprindelige bridge/2-opsætning. De rå genafspilninger bruger `PROTOCOL_V2`, og testen påstår udtrykkeligt `sessionProtocol === bridge/2`, før genafspilningerne bygges.
- **Testen "the duplicate log is bounded"** kører i en bridge/2-session.
- **Én test har ændret påstand, fordi reglen er ændret med vilje:** "a host WITHOUT introductions keeps an introduction-capable game on bridge/2" forventede tidligere bridge/3.

## 10. Migrationer, aktivering og tilbagerulning

- **Migrationer:** ingen nye. Introduktionen bruger #664's migrationer og Edge Functions uændret.
- **Aktivering kræver ejerens særskilte GO til hvert punkt:**
  - LP-2 (mål-id) og LP-13 (introduktionstrinnet);
  - anvendelse af `20261109043500` og `20261110043500` i produktionen;
  - deploy af `get-next-question` og `introduction-progress`;
  - de to Edge-flag;
  - en produktionsvært med `introductions: true` (kun sammen med `LAERLIGVERSE_INTRODUCTION=on` og en aktiv introduktion for målet, jf. §3a);
  - allowlisten.
- **Tilbagerulning:**
  - `introductions: false` (standard) får spillet tilbage til bridge/2-forløbet med den lokale prototypeintroduktion, uden at koden skal ændres. Et spil med introduktionsvisning taler fortsat med en ældre bridge/2-vært, fordi `hello` er i bridge/2-konvolutten.
  - At slukke `LAERLIGVERSE_INTRODUCTION` får serveren til at stoppe med at servere introduktionen.
