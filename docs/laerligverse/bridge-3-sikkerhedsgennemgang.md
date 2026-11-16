# Lærligverse F11-B: gennemgang af `laerligverse.bridge/3` (den synlige serverintroduktion)

**Status: gennemgang af en draft-PR (2026-11-16).** Intet er anvendt i produktionen, og intet er slået til. Introduktionen kræver stadig migrationerne `20261109043500` og `20261110043500` (ikke anvendt i produktionen), Edge-flagene `LAERLIGVERSE_INTRODUCTION` og `LAERLIGVERSE_PRESENTED` (slukket) og værtskonfigurationen `introductions: true` (findes kun i ikke-produktionssider). Mappen `laerligverse/` er ikke i Cloudflares deploy-allowlist.

Kontrakten for tilstandene står i [eksponering-datakontrakt.md](eksponering-datakontrakt.md). Denne side beskriver, hvad broændringen må og ikke må, og hvor det er bevist.

**Om navnet CR-01:** i dette repo er `CR-01` clean-room-tjekket mod en ekstern denylist (`adventure-engine/tools/check-clean-room.mjs` og CI-jobbet `cr01`). Det er kørt lokalt: `clean-room: OK`, men denylist-delen er `SKIP`, fordi den private denylist ikke findes på maskinen. Resultatet skal ses i CI-jobbet. Gennemgangen her er den systematiske protokol- og sikkerhedsgennemgang, som ejeren bad om under samme navn.

## 1. Resultat

**Ingen åbne sikkerhedsfund i broændringen.** Tre begrænsninger er bevidste og står i §8.

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

- **Valget af version:** `hello` sendes altid i bridge/2-konvolutten (`HELLO_PROTOCOL`), som alle værter siden bridge/2 læser. `supports` lister spillets versioner. Værten vælger den nyeste fælles version (`negotiate`) og svarer `init` i den.
- **Låst version:** hver senere besked i sessionen skal have præcis den aftalte version. Ellers afvises den med `invalid_message` (`host.ts` `onMessage`).
- **Kun bridge/3:** introduktionsbeskederne parses kun i bridge/3-konvolutten (`envelope`).
- **Et spil uden introduktionsvisning** (`introductions` fravær/false, fx et cachet spil eller de eksisterende harness-specs) tilbyder kun bridge/2. Værten bruger da `fetchTask`, som afviser et introduktionssvar eksplicit, og spillet får `task_unavailable`.
  - Det kan aldrig modtage en introduktion, og det kan ikke melde en som vist eller gennemført.
  - Bevist i `introduction.test.ts` › "negotiates bridge/2, never receives an introduction …" og i `laerligverse-host.test.mjs` › "F11-B: a bridge/2 game on the same host …", som bruger den genererede JavaScript-bro.
- **Ukendt version:** `unsupported_protocol` i hello-konvolutten, og der oprettes ingen session. Bevist i `introduction.test.ts` › "a game that speaks only an unknown version …".
- **Almindelige opgaver i bridge/3:** et spil med `introductions: true` kører fortsat det almindelige opgaveforløb, og hele den eksisterende bro-suite kører nu i bridge/3-sessioner. Bevist i `introduction.test.ts` › "an introduction-capable game still runs the ordinary task flow".

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

1. **Indholdets hash** valideres i format, men værten genberegner det ikke. Serveren er kilden, og hashet bliver hos værten.
2. **Prototypespillet** (`game-main.ts`) viser stadig sin lokale introduktion før første anmodning, når `intro_seen` er falsk. Serverens introduktion vises derefter, når serveren vælger den. Hvilken introduktion der er den endelige, er LP-13's afgørelse. Den lokale maskerer aldrig en serverfejl, for fejlen vises i opgavevisningen.
3. **`INTRO_CHECK`** (forståelsestjekket) er ikke med i serverintroduktionen. Det forbliver lokalt undervisningsindhold uden evidens.

## 9. Testdækning og regression

| Niveau | Hvad | Hvor |
|---|---|---|
| Protokol | Gyldige og ugyldige beskeder, versioner, størrelse, svarnøgler | `adventure-engine/packages/learning-bridge/test/introduction.test.ts` |
| Vært og klient | Kæden, tokens, rækkefølge, genindlæsning, samtidighed, gentagelse, udløbet session, bridge/2-kompatibilitet | samme |
| Negativ kontrol | En fjernet rækkefølgevagt opdages (fjernes igen i `afterEach`) | samme, "NEGATIVE CONTROL …" |
| Service | Svarvalidering og kortlægning af alle udfald fra `introduction-progress` | samme |
| Genereret værtsbro | Allowlist, konfiguration, kæden og bridge/2 gennem `laerligverse/host/bridge/*.js` | `tests/unit/laerligverse-host.test.mjs` |
| Ægte browser | Login, vært, iframe, synlige kort, tastatur, database som orakel, to faner, anden elev, netværk, belønning | `tests/isolated/laerligverse-intro-visible.isolated.spec.mjs` (introduktionsbanen, alle tre browsere) |

To eksisterende testopsætninger er tilpasset versionen uden at ændre en eneste påstand:
- **`test/harness.ts`:** standardspillet taler nu bridge/3 (`introductions: true`), så hele bro-suiten kører i den nye version.
- **Testen "the duplicate log is bounded"** sender rå bridge/2-beskeder og kører derfor i en bridge/2-session.

## 10. Migrationer, aktivering og tilbagerulning

- **Migrationer:** ingen nye. Introduktionen bruger #664's migrationer og Edge Functions uændret.
- **Aktivering kræver ejerens særskilte GO til hvert punkt:**
  - LP-2 (mål-id) og LP-13 (introduktionstrinnet);
  - anvendelse af `20261109043500` og `20261110043500` i produktionen;
  - deploy af `get-next-question` og `introduction-progress`;
  - de to Edge-flag;
  - en produktionsvært med `introductions: true`;
  - allowlisten.
- **Tilbagerulning:**
  - `introductions: false` (standard) får spillet tilbage til bridge/2-forløbet, uden at koden skal ændres. Et spil med introduktionsvisning taler fortsat med en ældre bridge/2-vært, fordi `hello` er i bridge/2-konvolutten.
  - At slukke `LAERLIGVERSE_INTRODUCTION` får serveren til at stoppe med at servere introduktionen.
