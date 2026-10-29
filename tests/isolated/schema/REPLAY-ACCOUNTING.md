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

## Hvad springes over, og hvorfor (kategorier)
- **Tom fil:** `20260317165405_remote_schema.sql` er 0 bytes. Det er roden til D-110.
- **Kun data** (ingen skema-token): spørgsmålsindhold og datarettelser. CI bruger syntetiske spørgsmål.
- **Kun spørgsmålsindhold:** filer, som token-scanningen fejlagtigt afviser. Testen kræver, at de kun
  indeholder INSERT.
- **Tvilling med to tidsstempler:** 41 navne. Den første kopi anvendes, og testen kræver, at
  skema-tvillingerne er token-ækvivalente.
- **Ikke anvendt i produktionen:** `20261020120000_difficulty_scale_a`, ifølge kataloget, og
  `20261029120000_difficulty_scale_b` (niveaumotoren, PR #371), som bygger på A's
  `student_subject_level`. Begge springes over (ejerbeslutning om migrationerne udestår).

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
