# Lærligverse: datakontrakt for eksponering (introduktion som servertrin + K9 "præsenteret")

**Status: UDKAST og prototype (2026-11-09).** Intet er anvendt i produktionen, og intet er slået til:
- **Migrationen** `20261109043500_laerligverse_presented_at.sql` er et udkast og står i `NOT_IN_PRODUCTION`.
- **Introduktionstrinnet** i `_shared/learning-sequence.ts` er slukket, medmindre en kalder beder om det. Det gør `get-next-question` ikke.

**Udgangspunkt:**
- [eksponering-og-hints.md](eksponering-og-hints.md) (#656): kortlægningen.
- `docs/learning-progression-l1-contracts.md` §K9: reglerne for `mark_presented`.
- [evidens-datakontrakt.md](evidens-datakontrakt.md): evidensen.

LP-13 (introduktionen som servertrin) er en ejerbeslutning. Her er den forberedt, ikke besluttet.

## 1. Fire tilstande med præcis betydning

| Tilstand | Betyder præcis | Kilde | Idempotens | Hvem må skrive | Indholdsversion | Tidsstempel |
|---|---|---|---|---|---|---|
| **Serveret** | Serveren har oprettet rundens instans og udleveret indholdet | `get-next-question`; `question_instances` (K1: `served_snapshot`, `served_content_sha256`, `served_at`) | Én instans pr. elev og spørgsmål (`idx_student_question_instance`); én åben runde pr. elev | Kun backend (INSERT er fjernet fra klientroller siden 20261015120000) | `served_content_sha256` (K1) | `served_at`, serverens tid ved INSERT |
| **Præsenteret** | Serveren har **modtaget en melding** om, at rundens indhold var på skærmen | `mark_presented(student, instance, round)`, kun `service_role`; `question_instances.presented_at` | Sættes **én gang pr. runde**. Et nyt kald giver `replay` med samme tid. En genåbning nulstiller | Kun funktionen. Ingen klientrolle kan læse eller skrive kolonnen | Samme runde og dermed samme `served_content_sha256` | `presented_at` = serverens `now()`, kun mellem serveringen og svaret |
| **Gennemført** | Eleven har afsluttet trinnet: et svar er registreret, eller, for en introduktion, en eksplicit afslutning | Opgavetrin: `question_attempts` (H5/K1). Introduktion: **ikke bygget** (§6) | Opgavetrin: `submission_id` (H5) | Opgavetrin: `_v2`/wrapperen (`service_role`) | Forsøgets `question_content_sha256` | `answered_at` (serveren) |
| **Påvist** | Et senere **selvstændigt** svar viser kompetencen | Klassifikationen (`evidence.ts`, D-330) over serverens forsøg: vurderingstrin, 0 hints og registreret eksponering | Afledt, ikke gemt | Ingen. Den beregnes | Forsøgets version | Forsøgets `answered_at` |

**Hovedregel:**
- **En klients `mark_presented` beviser aldrig, at eleven har læst, set eller forstået noget.** Den beviser kun, at serveren fik en melding på et bestemt tidspunkt.
- Klienten kan højst melde for sent, for tidligt (tidligst ved serveringen) eller slet ikke. Ingen af delene kan gøre et svar stærkere (§K9's tabel).
- "Præsenteret" bruges kun som **forudsætning**: trinnet kan gå videre, og et senere svar kan regnes som eksponeret i K4/K7. Det er **aldrig evidens i sig selv**.

## 2. Session og kobling til senere svar

- **Session:** der er ingen klientsession i kontrakten. Alt knyttes til elevens verificerede id (JWT → `auth.getUser()` → `p_student_id`), instansen og runden.
  - En ny login eller en anden enhed fortsætter samme runde (gnq genoptager den åbne instans).
  - "Præsenteret" sættes kun én gang, uanset hvor mange skærme der melder.
- **Kobling til senere svar:**
  - For et opgavetrin hører `presented_at` til samme instans og runde som svaret. `presented_interval_ms = answered_at − presented_at` kan beregnes på serveren (K9). Det er ikke bygget: det kræver K1-ejerens `_v2` eller wrapperen fra #653.
  - For en introduktion er koblingen målet (`learning_objective`). Senere svar i samme mål kan regnes som "efter introduktion", hvis introduktionens `presented_at` ligger før svarets `answered_at`.

## 3. Introduktion som servertrin (prototype)

`learning-sequence.ts` har nu:
- **`INTRODUCTION_STEP = "introduction"`.**
- **`introductionPresented(rows)`:** sand, når en række for målet er mærket `learning_step = "introduction"` og har en `presented_at` fra serveren.
- **`nextStepWithIntroduction(rows, nowMs, { introduction })`:**
  - **Uden indstillingen** er resultatet præcis `nextStep(historyFromRows(rows), nowMs)`. Det er testet på en række historikker.
  - **Med indstillingen** kommer introduktionen først, indtil serveren har registreret præsentationen. Derefter er sekvensen som før.
  - **Ingen anden vej frem:** hverken et svar, et andet trin eller et klientfelt kan få introduktionen til at tælle som præsenteret.

`STEPS`, `stepOf`, `nextStep` og `historyFromRows` er uændrede. En introduktionsrække er usynlig for den eksisterende politik. `get-next-question` kalder ikke den nye funktion, så sekvensen er byte-identisk. Kandidatmanifestet er opdateret, fordi filen er i grafen.

## 4. `mark_presented` (prototype, migration `20261109043500`)

- **Kolonnen:** `question_instances.presented_at timestamptz NULL`, ejet af triggeren `question_instances_presented_at`:
  - INSERT giver `NULL`;
  - en genåbning giver `NULL`;
  - værdien sættes én gang og fryses, også over for `service_role`;
  - den afvises på en besvaret runde, i samme sætning som svaret, før serveringen og ud i fremtiden.
- **Funktionen:** `mark_presented(p_student_id, p_question_instance_id, p_round_no)` → jsonb.
  - SECURITY INVOKER, EXECUTE kun for `service_role`.
  - Låser elevens række (samme lås som hint og svar).
  - Udfald: `recorded`, `replay`, `round_closed`, `stale_round`, `not_found` (også for en fremmed instans) og `invalid_request`.
- **Rettigheder:** `anon` og `authenticated` har ingen rettighed til kolonnen. L3/L5 har flyttet deres UPDATE til kolonneniveau, så en ny kolonne er lukket uden flere sætninger. Guarden kræver K1 og L3/L5.
- **Tests:** `tests/unit/laerligverse-k9-presented-migration-run.test.mjs` kører på PGlite med fuld replay + K1 + L3/L5. Den dækker udfaldene, triggerens afvisninger, rettighederne, og at intet andet ændres.

## 5. Indholdsversion og tid

- **Al tid er serverens:** `served_at`, `presented_at` og `answered_at`. Klientens ur bruges aldrig.
- **Versionen af det præsenterede indhold** er rundens `served_content_sha256` (K1). En introduktion uden K1-snapshot har en ukendt version og må ikke bruges som forudsætning for evidens.

## 6. Ikke bygget (afgrænsning)

- **Edge Function til `mark_presented`.** Den skal følge `request-hint`: JWT påkrævet, verificeret id og et slukket flag.
- **Introduktionsindhold som serverrække.** En introduktion har intet facit, men `question_instances.correct_answer` er NOT NULL, så den kræver en indholdsform uden svar.
- **En eksplicit "gennemført"-handling for introduktionen**, som lukker runden uden forsøg og belønning. Ellers blokerer den åbne introduktionsinstans næste trin (én åben runde pr. elev).
- **`presented_interval_ms`** i forsøget.
- **Kobling i `get-next-question`** bag et flag. Kræver de tre punkter ovenfor.

Hvert punkt kræver ejerens GO (LP-13). Indholdet kræver lærergodkendelse, hvis teksten ændres.
