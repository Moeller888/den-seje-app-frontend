# Lærligverse: datakontrakt for eksponering, gennemførelse og evidens

**Status: prototype bag slukkede flag (2026-11-10).** Intet er anvendt i produktionen, og intet er slået til.

| Del | Hvad | Status |
|---|---|---|
| Migrationer | `20261109043500_laerligverse_presented_at.sql` (K9 for opgaverunder) og `20261110043500_laerligverse_introductions.sql` (introduktionen som servertrin) | Udkast, i `NOT_IN_PRODUCTION` |
| Edge-flag | `LAERLIGVERSE_INTRODUCTION` og `LAERLIGVERSE_PRESENTED` | Begge slukket |
| Ejerens GO | Fortsætte som eget kontrolleret spor | Givet 2026-11-10. **Intet** GO til aktivering |
| LP-13 | Det endelige introduktionstrin | Ejerbeslutning |

Udgangspunkt: `eksponering-og-hints.md` (#656), `docs/learning-progression-l1-contracts.md` §K9 og [evidens-datakontrakt.md](evidens-datakontrakt.md).

## 1. Syv tilstande med præcis betydning og kilde

| Tilstand | Betyder præcis | Kilde (server) | Idempotens | Hvem må skrive | Version | Tid |
|---|---|---|---|---|---|---|
| **Serveret** | Serveren har udleveret indholdet til eleven | Opgave: `question_instances` (K1: `served_snapshot`, `served_content_sha256`, `served_at`). Introduktion: `introduction_rounds.served_at` | Én instans pr. elev og spørgsmål; én introduktionsrunde pr. elev og introduktion. En genindlæsning genoptager samme runde | Kun backend | `served_content_sha256` / `introduction_rounds.content_sha256` | Serverens `now()` |
| **Præsenteret** | Serveren har **modtaget en melding** om, at indholdet var på skærmen | `question_instances.presented_at` (via `mark_presented`) / `introduction_rounds.presented_at` (via `mark_introduction_presented`) | Sættes én gang pr. runde. Samme `request_id` giver `replay`; et andet id giver `already_recorded` og flytter intet | Kun funktionerne (`service_role`), kaldt af `introduction-progress` med den verificerede elev | Rundens version | Serverens `now()`, aldrig før serveringen og aldrig efter svaret |
| **Gennemført** | Opgave: et svar er registreret. Introduktion: eleven har trykket "gennemført", og serveren har registreret det | Opgave: `question_attempts` (H5/K1). Introduktion: `introduction_rounds.completed_at` (via `complete_introduction`) | Opgave: `submission_id`. Introduktion: sættes én gang; samme `request_id` giver `replay`, et andet giver `already_completed` | `_v2`/wrapperen; `complete_introduction` (`service_role`) | Forsøgets `question_content_sha256` / rundens version | `answered_at` / `completed_at`, serverens tid |
| **Besvaret** | Der findes et registreret forsøg med elevens svar (kun opgaver; en introduktion besvares aldrig) | `question_attempts` | `submission_id` | `_v2`/wrapperen | Forsøgets version | `answered_at` |
| **Korrekt** | Serveren bedømte svaret som rigtigt med rundens nøgle | `question_attempts.was_correct`, bedømt fra K1-snapshottet | Frosset i forsøget | Kun serverens bedømmelse | Forsøgets version | `answered_at` |
| **Selvstændigt korrekt** | Korrekt i et vurderingstrin (`check`, `review` eller `application`) med `hints_used = 0` registreret af serveren | `question_attempts.mode` og `.hints_used` (L5/L3, #653), klassificeret af `evidence.ts` | Afledt | Ingen; beregnes | Forsøgets version | `answered_at` |
| **Progression over tid** | Selvstændigt korrekt igen ved et senere genbesøg (≥ 20 t; forslag i `evidence.ts`, LP-13) i samme mål | Flere forsøg over tid, klassificeret af `evidence.ts` | Afledt | Ingen | De enkelte forsøgs versioner | Forsøgenes `answered_at` |

**Hovedregler:**
- **Serveret, præsenteret og gennemført er hverken læst, forstået eller lært.**
- En klients `mark_presented` beviser aldrig, at eleven har læst eller forstået noget. Klienten kan højst melde for sent eller lade være, og ingen af delene kan gøre et svar stærkere (§K9).
- En introduktions "gennemført" betyder kun, at eleven trykkede videre. Den lader sekvensen gå videre og er **aldrig evidens** (D-330).
- Kun **selvstændigt korrekt** kan blive evidens, og kun med registreret tilstand, hints og eksponering. Det afgør `evidence.ts`.

**Session og kobling til senere svar:**
- Der er ingen klientsession i kontrakten. Alt knyttes til den verificerede elev (JWT → `auth.getUser()`), rundens id og målet (`learning_objective`).
- En ny login eller en anden enhed genoptager samme runde.
- Et senere svar i samme mål kan regnes som "efter introduktion", når introduktionens `completed_at` ligger før svarets `answered_at`.

## 2. Introduktionen som servertrin uden facit (prototype, migration `20261110043500`)

**Hvorfor egne tabeller:**
- `question_instances.correct_answer` er NOT NULL.
- Alle bedømmelsesveje læser `question_instances`.
- `idx_one_open_question` tillader én åben runde pr. elev.

En introduktion har ingen nøgle, bedømmes aldrig og må aldrig blokere quizzen. Derfor har den to egne tabeller, som ingen bedømmelsesvej, ingen offentlig spørgsmåls-DTO og ingen belønning læser (testet: kun de tre funktioner og de to triggere nævner dem).

- **`learning_introductions`:** indholdet er `{ "cards": [ { title, text } ] }`, 1–10 kort.
  - En CHECK afviser enhver svarlignende nøgle: `correct`, `correct_answer`, `accepted_answers`, `options`, `option_details`, `hints`, `review_text`, `pairs`, `items` og `categories`.
  - En version er uforanderlig: kun `is_active` må ændres. En ny tekst er en ny version.
  - `content_sha256` sættes af serveren.
  - Der er højst én aktiv introduktion pr. mål.
- **`introduction_rounds`:** én række pr. elev og introduktion med `served_at`, `presented_at` og `completed_at` (og `request_id` for de to sidste).
  - En trigger fryser resten og gør presented og completed til set-once i serverens tid, aldrig før serveringen.
  - En INSERT starter altid som "kun serveret".
- **Rettigheder:** RLS er slået til. `anon` og `authenticated` har ingen rettigheder og kan ikke kalde funktionerne. Alle tre funktioner er SECURITY INVOKER, og kun `service_role` må kalde dem.
- **Indholdet:** de lærergodkendte introkort fra `adventure-engine/packages/archive-prototype/src/intro-content.ts` (`INTRO_CARDS`), ordret. Testfixturen er `tests/isolated/fixtures/kildekritik-introduction.json`, og en test kræver ordret lighed.
  - `INTRO_CHECK` (forståelsestjekket) er **ikke** med. Det har svarmuligheder og hører til en senere afklaring.
  - Ordret flytning kræver ingen ny lærergodkendelse (`eksponering-og-hints.md`). Ændres teksten, kræves den.
  - **Afslører ingen svar:** introduktionens offentlige payload indeholder ingen af sekvensens `correct`, `accepted_answers`, `option_details`, `review_text` eller `hints` (testet).
  - Kortene nævner kildetyper generelt med småt, fx "en dagbog". Det er den godkendte undervisningstekst og ikke et svar på en bestemt opgave.

## 3. get-next-question (`LAERLIGVERSE_INTRODUCTION`)

Kun i en serverstyret sekvens (D-338) og kun med flaget præcis `on`:
1. **Kaldet:** gnq kalder `serve_introduction(verificeret elev, mål)` gennem admin-klienten.
2. **`served` eller `resumed`:** svaret er `{ step: "introduction", learning_objective, learning_step: "introduction", introduction_round_id, content_sha256, content: { cards } }`. Der oprettes ingen spørgsmålsinstans, og en genindlæsning giver samme runde.
3. **`completed` eller `none`:** sekvensen kører præcis som med flaget slukket (plus det ene kald).
4. **Fejl eller misdannet svar:** 500, aldrig et spørgsmål.

Slukket er kald, svar og logs byte-identiske (`tests/unit/laerligverse-introduction-gnq.test.mjs`). Kandidatmanifestet er opdateret (23 filer).

## 4. Edge Function `introduction-progress`

JWT er påkrævet via `auth.getUser()` (`verify_jwt = false` som i get-next-question og request-hint). Funktionen bruger aldrig et elev-id fra body'en. Uden begge flag svarer den 404 uden at bygge en klient.

| Handling | Body | RPC | Flag |
|---|---|---|---|
| Introduktion gennemført | `{ action: "completed", round_id, request_id }` | `complete_introduction` | `LAERLIGVERSE_INTRODUCTION` |
| Introduktion præsenteret (valgfri) | `{ action: "presented", round_id, request_id }` | `mark_introduction_presented` | begge |
| Opgaverunde præsenteret (valgfri) | `{ action: "presented", question_instance_id, round_no }` | `mark_presented` (K9) | `LAERLIGVERSE_PRESENTED` |

Svarkoder:
- `recorded`, `replay`, `already_recorded` og `already_completed` giver 200.
- En fremmed runde giver `not_found` (404).
- `stale_round` og `round_closed` giver 409.
- En ugyldig body giver 400.
- Alt andet giver 500 uden detaljer.

## 5. Ikke bygget

- Værtens og spillets brug: broen kender ikke `step: "introduction"` endnu.
- Forståelsestjekket som servertrin.
- `presented_interval_ms` i forsøget.
- Produktionsseed af introduktionen. Den venter på LP-2 (det endelige `learning_objective`).

Hvert punkt kræver ejerens GO.
