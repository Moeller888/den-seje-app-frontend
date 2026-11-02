# D-110: regnskab for migrationsafspilningen

Den isolerede E2E-database bygges af `tests/isolated/schema/replay.mjs` i denne rækkefølge:
1. `ci-baseline.sql`
2. `ci-function-stubs.sql`
3. hver migration, som `replay-plan.mjs` markerer `apply`, i versionsorden og med `prestige.sql` på sin
   plads.

**Regel:** enhver fejl, enhver manglende forudsætning og enhver `blocked`-post får CI til at fejle. Der
er ingen spring over eller nedgradering til advarsel, mens afspilningen kører. Kun planens egne spring
over findes, og hvert har en skreven begrundelse, som unit-testen kræver.

**Status:** hele afspilningen lykkes. `tests/unit/isolated-schema-replay.test.mjs` kører den på PGlite,
og CI-jobbet kører den på den lokale Supabase-stak med PostgreSQL 17.

## De 17 oprindelige fejl (eksperiment 2026-10-25, `replay-out3`)

Eksperimentet kørte alle filer med den første baseline (`ci-baseline-8-tables`) og uden plan.

| # | Migration | Fejl dengang | Årsag | Håndtering nu | Bevis |
|---|---|---|---|---|---|
| 1 | `20260511000000_stuck_job_sweeper` | `cron.job` findes ikke | Eksperimentet havde ingen pg_cron | **Anvendes.** CI opretter pg_cron i den lokale stak, ligesom i produktionen; PGlite bruger en platform-stub | afspilningstest |
| 2 | `20260919000000_review_answer_execute_lockdown` | `review_answer(uuid,int,text,uuid)` findes ikke | Produktionen har funktionen, men repoet opretter den ikke | **Anvendes.** `ci-function-stubs.sql` opretter begge overloads; forudsætningstjek før filen | afspilningstest og stub-test |
| 3 | `20261009221339_profiles_select_caller_scope` | politikken `profiles_select` findes ikke | **Følgefejl** af #7: `20260513000000` opretter `profiles_select`, men afbrød | **Anvendes** (#7 er løst) | afspilningstest |
| 4 | `20261015120000_question_instances_server_owned_insert` | politikken "Students can insert own instances" findes ikke | Den første baseline manglede politikken | **Anvendes.** Baselinen sektion B har politikken ordret fra filens egen ROLLBACK-kommentar | afspilningstest |
| 5 | `20261016150000_analytics_views_lockdown` | view `analytics_question_attempts` findes ikke | Den første baseline manglede viewet | **Anvendes.** Baselinen sektion B har produktionens viewdef ordret (allerede committet i `analytics-views-lockdown-migration-run.test.mjs`) | afspilningstest |
| 6 | `20261018170000_answer_keys_client_paths_lockdown` | politikken "allow read questions" findes ikke | Den første baseline manglede politikken | **Anvendes.** Baselinen sektion B har politikken ordret fra den committede unit-test | afspilningstest |
| 7 | `20260513000000_rls_hardening_and_atomic_purchase` | `user_items_select_own` findes allerede | Den første baseline indeholdt et objekt, som migrationen selv opretter | **Anvendes.** Baselinen er nu tilstanden **før** migrationerne og indeholder ikke objektet | afspilningstest |
| 8 | `20260529000000_grade_difficulty_schema` | `questions_target_grade_check` findes allerede | Samme som #7 | **Anvendes** | afspilningstest |
| 9 | `20260603074307_profiles_self_update_policy` | `profiles_self_update` findes allerede | Samme migration committet under to tidsstempler; den første (`20260603060000`) var anvendt | **Springes over** som tvilling; den første kopi anvendes. Testen kræver, at tvillingerne er token-ækvivalente | unit-test |
| 10 | `20260603140948_teacher_password_reset` | `tpr_teacher_select` findes allerede | Tvilling af `20260603070000` | **Springes over** som tvilling; den første kopi anvendes | unit-test |
| 11 | `20260923000000_question_instances_teacher_read_scope` | "students read own question_instances" findes allerede | Samme som #7 | **Anvendes** | afspilningstest |
| 12 | `20260602035851_democracy_power_band5` | duplikeret spørgsmålstekst | Tvilling af `20260602010000`, kun indhold | **Springes over** som tvilling. Spørgsmålsrækker kommer aldrig ind, for afspilningen kører med rækkefilteret | unit-test |
| 13 | `20260602173914_middle_ages_band5` | duplikeret spørgsmålstekst | Tvilling af `20260602050000` | Som #12 | unit-test |
| 14 | `20260602192127_prehistoric_denmark_band5` | duplikeret spørgsmålstekst | Tvilling af `20260602070000` | Som #12 | unit-test |
| 15 | `20260826000000_avatar_jobs_cancelled_status` | `D107_PRECONDITION_TOTAL` | Datadelen kræver præcis 45 rigtige jobs | **Kun skemadelen anvendes, ordret:** de tre CHECK-constraints med status `cancelled` (`SCHEMA_PART` med eksakte markører) | afspilningstest og unit-test |
| 16 | `20261018143726_fix_danish_question_bank_text` | `query returned no rows` | Datadelen omskriver rigtige spørgsmål. Filen omdefinerer **også** `process_question_attempt`, hvilket planen tidligere overså | **Kun skemadelen anvendes, ordret:** funktionen fra `EXECUTE $grading$`. md5-vagten i `20261027120000_repeat_answer_coin_reward` består, så kroppen er byte-identisk | afspilningstest |
| 17 | `20261019120002_danish_grade6_9` | duplikeret spørgsmålstekst | Kun indhold; token-scanningen ramte ordet LISTEN i et spørgsmål | **Springes over** som indhold; testen kræver, at filen kun indeholder INSERT | unit-test |

## Fejl fundet senere

| Migration | Fejl | Håndtering |
|---|---|---|
| `20261026170000_recalculate_prestige_execute_containment` | `recalculate_prestige` findes ikke | `prestige.sql`, som er anvendt manuelt i produktionen, kørte til sidst. Den anvendes nu på sin plads, lige før `20260519000300_leaderboard`. |
| `20261027120000_repeat_answer_coin_reward` | md5-vagten: "process_question_attempt er ændret" | Følgefejl af #16. Løst. |
| `20261029170000_mc_grading_compensation` | `MC_GRADING_COMP: forventede præcis én instans …, fandt 0` | Datadelen kompenserer to rigtige forsøg i produktionen (D-254) og afbryder, når de mangler. **Kun skemadelen anvendes, ordret:** den låste tabel `public.progress_corrections` med RLS og `REVOKE ALL` (`SCHEMA_PART` med eksakte markører). |

## Hvad springes over, og hvorfor (kategorier)
- **Tom fil:** `20260317165405_remote_schema.sql` er 0 bytes. Det er roden til D-110.
- **Kun data** (ingen skema-token): spørgsmålsindhold og datarettelser. CI bruger syntetiske spørgsmål.
- **Kun spørgsmålsindhold:** filer, som token-scanningen fejlagtigt afviser. Testen kræver, at de kun
  indeholder INSERT.
- **Tvilling med to tidsstempler:** 41 navne. Den første kopi anvendes, og testen kræver, at
  skema-tvillingerne er token-ækvivalente.
- **Ikke anvendt i produktionen** (alle merget; produktionen kører stadig det, der var før — læst
  2026-11-01):
  - `20261031230000_claim_daily_reward_exactly_once` (D-284): `claim_daily_reward` har md5 `80273d5d…`.
  - `20261101120000_night_owl_stop_new_awards` (D-286): `evaluate_achievements` har md5 `9bd9a5d5…`, og
    `authenticated` har stadig EXECUTE på `set_night_correct`.
  - `20261101170000_achievement_reward_exactly_once` (D-292): ændrer `grant_achievement_rewards`, så
    belønningen indløses atomisk og præcis én gang, og fjerner EXECUTE for `PUBLIC` og `anon`.
    Produktionen kører stadig den tidligere udgave.
  - `20261101190000_question_attempts_v2_bootstrap` og
    `20261101190100_question_attempts_v2_align_grading` (H5-integrationen). Produktionen har hverken
    `question_attempts` eller `_v2`-funktionerne (katalog, 2026-11-02). Begge filer kræver G1 først,
    og G1 er anvendt.

  D-284 og D-286 blev ved en fejl ikke skrevet på listen, da de blev merget, og blev derfor afspillet
  her.

  **Følgen, set i #534:** D-286 fjerner `authenticated`'s EXECUTE på `set_night_correct`. Fordi filen
  blev afspillet, havde den isolerede database den kontrakt, som D-286 indfører, og ikke den, der
  gælder i produktionen. Produktionen giver stadig `authenticated` EXECUTE (læst 2026-11-01).
  #534's natteflag-test kaldte derfor funktionen som elev og fik `42501 permission denied`. Det var
  en miljøforskel, ikke en fejl i testen eller i D-278. Med posten her får den isolerede database
  igen produktionens adgangsmodel.

  Når D-286 er anvendt og fjernet fra listen, skal den nye kontrakt testes særskilt: eleven kan ikke
  længere kalde `set_night_correct`. Hver fil afspilles først, når den er anvendt og verificeret, og i den rækkefølge filerne selv
  håndhæver: bootstrappen, derefter alignmentet. A, B, kommentarrettelsen og D-280's to
  filer er anvendt og verificeret og står derfor ikke længere her. Det samme gælder G1 og G2 (se
  "Anvendt i produktionen efter planens første version").

## Anvendt i produktionen efter planens første version
En fil fjernes fra `NOT_IN_PRODUCTION`, først når den er anvendt **og** verificeret i produktionen.
Filen selv ændres aldrig.

| Repo-fil | Produktionspost | Anvendt | Verificeret | Afspilning nu |
|---|---|---|---|---|
| `20261020120000_difficulty_scale_a.sql` | `20261030045204 difficulty_scale_a` | 2026-10-30 via `apply_migration`, filen ordret fra `main` (ejergodkendt) | Ja, læsende 2026-10-30: 0 af 2.143 opgaver uden niveau, backfill lig formlen, `difficulty_level_from_grade_band` md5-identisk med filen og kun `service_role`, `student_subject_level` med RLS og én SELECT-politik, `authenticated` kun SELECT, `anon` intet | **Anvendes**, efter #351 (`20261019150000_question_format_mix`) |
| `20261029120000_difficulty_scale_b.sql` | `20261030094958 difficulty_scale_b` | 2026-10-30 via `apply_migration`, filen ordret fra `main` (SHA-256 `9fb5ffd33df32f8342cda143cc28c32b25478ec0332b2261925cf8ca21a96a1c`, lig SHA-256 af den sætning, migrationsloggen gemte; ejergodkendt) | Ja, læsende 2026-10-30: `student_level_fold_log` med RLS og 0 policies, kun `postgres` og `service_role` i ACL; begge indeks som i filen; de tre funktioner `SECURITY INVOKER` med låst `search_path`, EXECUTE kun for `service_role`, md5 som i filen; 0 rækker i `student_subject_level` og `student_level_fold_log`; A og #351 uændrede | **Anvendes**, efter A |
| `20261030120000_student_subject_level_comment.sql` | `20261030182931 student_subject_level_comment` | 2026-10-30 via `apply_migration`, filen ordret fra `main` (SHA-256 `beda3783777d4f961e67358ed543cf7e849e91187408b3a9d81d4361ae1286f0`, lig SHA-256 af den sætning, migrationsloggen gemte; ejergodkendt). Filens header siger stadig "NOT APPLIED IN PRODUCTION"; den er historisk og ændres ikke | Ja, læsende 2026-10-30: tabelkommentaren ordret som godkendt; B's tre funktioner med uændret md5, `SECURITY INVOKER` og EXECUTE kun for `service_role`; ACL, grants, RLS, policies, kolonner, indeks og constraints identiske med øjebliksbilledet før; 0 rækker i begge niveautabeller | **Anvendes**, efter B |

| `20261031194600_mc_length_cue_answer_paths.sql` | `20261101101401 mc_length_cue_answer_paths` | 2026-11-01 via `apply_migration`, filen ordret fra `main` `7523ec2` (SHA-256 `f334ae136d9603661b8af6028dbbc43dd715a67ecf54b2a092f74c88551a9a05`; den gemte sætning md5-identisk med filen; ejergodkendt). Filens header siger stadig "IKKE anvendt"; den er historisk og ændres ikke | Ja, læsende 2026-11-01: de fire funktioner med filens md5; signatur, ejer, returtype, SECURITY, `search_path` og EXECUTE (kun `postgres` og `service_role`) uændrede | **Anvendes**, D-280 del 1 |
| `20261031194700_mc_length_cue_top10.sql` | `20261101102339 mc_length_cue_top10` | 2026-11-01 via `apply_migration`, filen ordret fra `main` `7523ec2` (SHA-256 `fc94f7c0e5fff7c85147e4220813c92ef268b5ccc3dae8c5cc884e14088501a9`; den gemte sætning md5-identisk med filen; ejergodkendt). Header historisk, ændres ikke | Ja, læsende 2026-11-01: de ti spørgsmål med de godkendte efter-hashes; 5 åbne besvarelser med nyt facit, ellers byte-identiske; 197 afsluttede besvarelser byte-identiske | **Springes over** som ren data (ingen skema-token); de ti produktionsspørgsmål findes ikke i den isolerede database |
| `20261101140000_deactivate_two_misgraded_questions.sql` (D-290 G2) | `20261102071826 deactivate_two_misgraded_questions` | 2026-11-02 via ét `apply_migration`, filen ordret fra `main` `85e3128` (SHA-256 `801d9ba6eafee8ba741334ab8f7a0babac0fcb50ceba7502f3aa4e070ccba891`; den gemte sætning md5-identisk med filen, `0ed24c38…`; ejergodkendt) | Ja, læsende 2026-11-02 lige efter: begge spørgsmål inaktive med uændrede hashes; aktive spørgsmål 2101 → 2099; instanser (5912) og XP/mønter uændrede (kontrolhashes); værnet med md5 `e5627de1…`, `SECURITY DEFINER`, `search_path=""`, ingen EXECUTE for API-roller; triggeren `BEFORE INSERT OR UPDATE OF answered, question_id` (tgtype 23); ingen nye åbne runder på inaktive spørgsmål | **Kun skemadelen anvendes, ordret** (`SCHEMA_PART`): værnets funktion, dens `REVOKE` og triggeren. Datadelen kræver produktionens to spørgsmål med de gennemgåede hashes og springes over; dens vagter og deaktivering er bevist på syntetiske rækker i `deactivate-two-misgraded-questions-*.test.mjs` |
| `20261101150000_grading_meaningful_characters.sql` (D-290 G1) | `20261102064630 grading_meaningful_characters` | 2026-11-02 af en anden session via `apply_migration` (filens SHA-256 `406933134b95fb2f72591eb5a0f99e4a3a9c57a5decceabdca9edaa507e6299f`; den gemte sætning md5-identisk med filen, `9c6ad814…`) | Ja, læsende 2026-11-02: `process_question_attempt` md5 `2e05e769…` (G1's krop), `SECURITY DEFINER`, EXECUTE kun `postgres` og `service_role`; `normalize_choice_answer` `281addc2…` og `normalize_number_answer` `3dadb6e1…`, begge `IMMUTABLE`, `search_path=""`, kun ejeren har EXECUTE | **Anvendes**, efter D-280 del 1 |

Rækkefølgen i afspilningen er #351 → A → B → kommentarrettelsen, som i produktionen, og senere D-280 del 1 i versionsorden.

**H5 og G1: forskellen mellem repository og produktion** (G1 anvendt 2026-11-02).

| | Repository (filnavnsorden) | Produktion | Isoleret afspilning i dag |
|---|---|---|---|
| `20261030211428` (H5 PR 1) | anvendt | ikke anvendt; filen afviser sig selv efter D-280 del 1 | **anvendes** (som før #522) |
| D-278, D-280 del 1 | anvendt | anvendt 2026-11-01 | anvendes |
| D-280 del 2 | anvendt | anvendt 2026-11-01 | springes over (ren data) |
| `20261101150000` (G1) | anvendt | anvendt 2026-11-02 (`20261102064630`) | **anvendes** |
| `20261101190000` (bootstrap) | verificerer H5, fratager `service_role` EXECUTE på `process_question_attempt_v2` | **ikke anvendt**; skal opbygge H5 (G1 er på plads) | springes over (`NOT_IN_PRODUCTION`) |
| `20261101190100` (alignment) | giver `_v2` bedømmelsen fra D-280 og G1 og giver `service_role` EXECUTE tilbage | **ikke anvendt** | springes over (`NOT_IN_PRODUCTION`) |

- **Den isolerede database har i dag H5-skemaet fra `20261030211428`.** Dens
  `process_question_attempt_v2` er den oprindelige: aliaser kun ved præcis to poster, kun `[a-z0-9]`
  sammenlignes, og `service_role` har EXECUTE. Det er en kendt afvigelse fra produktionen, som slet
  ikke har H5. Den er uændret fra før #522.
  - Intet i den isolerede E2E kalder `_v2`: `tests/h5-submission.spec.ts` opsnapper `process-event`.
  - Afvigelsen forsvinder, når de to H5-filer er anvendt i produktionen og fjernet fra
    `NOT_IN_PRODUCTION`.
- **Produktionens eneste vej til H5** er: G1 → `20261101190000` → `20261101190100`. Uden G1 afviser
  både bootstrappen og alignmentet sig selv, og intet ændres.
  - Mellem de to H5-filer kan ingen API-rolle kalde den gamle `_v2`.
  - Alignmentet kontrollerer G1's to hjælpefunktioner: krop, `IMMUTABLE`, `search_path`, ejer og at
    ingen API-rolle har EXECUTE.
- **G2 (`20261101140000`) er uafhængig af H5-rækkefølgen.** Bootstrappen accepterer G2's værn
  `open_round_requires_active_question`, men kun præcis som gennemgået: funktionens md5, triggerens
  form og kolonner, `SECURITY DEFINER`, `search_path`, ejer og ingen EXECUTE for API-roller. Alle
  andre ekstra triggere afvises stadig. G2 kan derfor anvendes før G1, mellem G1 og bootstrappen,
  mellem de to H5-filer eller efter dem. Alle rækkefølger ender i samme skema
  (`question-attempts-v2-g2-compat.test.mjs`, og på PostgreSQL 17
  `question-attempts-v2-g2-compat-pg.test.mjs`).
- **Bevis.** `tests/unit/question-attempts-v2-bootstrap.test.mjs` (PGlite) viser, at
  repositoryets rækkefølge og produktionens rækkefølge ender i identisk skema og bedømmer ens med G1.
  `question-attempts-v2-bootstrap-concurrency.test.mjs` viser det samme på PostgreSQL 17.

## Repositoryet er foran produktionen (anvendes alligevel)
Ejerbeslutning 2026-10-28 (mulighed B): den isolerede CI tester repositoryets kode mod det skema,
koden selv erklærer. Den skal ikke kopiere produktionens historiske afvigelser.

- **`20260808010000_password_help_reserve_rpc`** anvendes med den rigtige migrationsfil, ikke en stub.
  - Repositoryets `request-password-help` afhænger af RPC'en `public.reserve_password_help`. Den
    bruges til cooldown, dagligt loft og reservation, før der må sendes mail. Uden RPC'en skrives
    der ingen audit-række, og E2E-testen `password-help` test 1 fejler.
  - Ifølge produktionens katalog (2026-10-25) findes RPC'en ikke i produktionen.
  - Ifølge ejeren har den deployede version 3 af `request-password-help` hidtil ikke brugt
    RPC'en. Det er ikke undersøgt i D-110. Driften er derfor **ikke** en bekræftet
    produktionsfejl: den betyder, at repositoryets funktion ikke kan deployes uden migrationen.
  - **Udestående produktionsopgave (D-243):** afstem skema og funktion mellem repository og
    produktion. Det kræver ejerens særskilte GO. Intet i D-110 ændrer produktionen.
  - Unit-testen `isolated-schema-replay.test.mjs` beviser på syntetiske rækker: RPC'ens krop er
    migrationens egen, kun `service_role` må kalde den, reservation, cooldown og dagligt loft
    giver hver sin audit-række, og ugyldigt input afvises uden at skrive noget.

## Hvad CI-stubbene ikke beviser
Se hovedet af `ci-function-stubs.sql`. Kort fortalt:
- **XP-, level- og mønteffekter** inde i de to `review_answer`-funktioner modelleres ikke.
- **Kolonneværdier ud over tabellens standardværdier** i `ensure_student_progress` modelleres ikke.

Isoleret E2E kan derfor ikke bevise disse effekter. De kan kun verificeres mod den rigtige implementering.

## Fuldstændigt regnskab (fra 2026-11-01)
Hver migration med version fra `ACCOUNTED_FROM` (`20261020000000`) skal stå i præcis én liste i
`replay-plan.mjs`: `NOT_IN_PRODUCTION` (merget, ikke anvendt — også rene datafiler),
`REPO_AHEAD_OF_PRODUCTION` (ikke anvendt, afspilles efter ejerbeslutning B) eller
`APPLIED_IN_PRODUCTION` (anvendt og verificeret, med produktionens ledger-version).
`tests/unit/replay-accounting-complete.test.mjs` fejler, hvis en ny migration ikke er registreret, så en
merge ikke længere kan afspille en uanvendt fil ved en forglemmelse. En fil flyttes først til
`APPLIED_IN_PRODUCTION`, når anvendelsen er verificeret.

`20261030211428_question_attempts_v2` (H5) er ikke anvendt i produktionen, men repositoryets
`process-event` kalder v2-funktionerne bag H5-kontakten. Den står derfor i `REPO_AHEAD_OF_PRODUCTION`
(uændret afspilning) som åben produktionsopgave under D-266/D-273.
