# H5/K1 — aktiveringsrunbook for svarloggen

**Status:** H5 og K1 er merget på `main` (K1 som PR #536, `41aebf4b`), men **intet er anvendt eller aktiveret i produktionen**. Denne runbook er en procedure, **ikke en godkendelse**. Hvert trin kræver ejerens særskilte GO (CLAUDE.md regel 48; `docs/migration-workflow-policy.md`, D-110). `supabase db push` er forbudt.

**Formål:** Gøre den append-only svarlog (`public.question_attempts`, D-266/D-273) med forsøgskontekst (K1, D-334) til den eneste vej for automatisk rettede svar. Fra cutover (M2) kan første forsøg, gentagelser og indholdsversion dokumenteres pålideligt. Kilden er P0-auditten af læringsfundamentet (2026-11-04), afsnittet om H5/K1-integritet §6. Den er udarbejdet i ejerens arbejdskopi under `docs/research/p0-learning-foundation/` og er **ikke committet** på tidspunktet for denne runbook.

**Værktøjer i denne runbook:**
- `docs/operations/h5-k1-readiness-checks.sql`: read-only, én SELECT, kører gennem Supabase-MCP `execute_sql` og godkendes af Lærlig-guarden.
- `tests/unit/h5-k1-readiness-checks.test.mjs`: beviser kontrollerne på PGlite.

---

## 1. Forudsætninger

| # | Forudsætning | Hvordan kontrolleres | Status 2026-11-04 |
|---|---|---|---|
| F1 | Arbejdet sker fra en kendt `main`-commit, og migrationsfilerne er uændrede siden gennemgangen | `git rev-parse origin/main`; `git log -1 -- supabase/migrations/2026110119000*.sql supabase/migrations/20261103*.sql` | `41aebf4b` |
| F2 | G1 (D-290) er anvendt | Readiness `PRE-01` = true | Opfyldt (se §11) |
| F3 | De syv fastlåste svar-/genåbningsfunktioner har de gennemgåede kroppe; G2 er fraværende eller præcis gennemgået | `PRE-02`…`PRE-05` = true | Opfyldt (se §11) |
| F4 | `question_attempts` findes ikke | `PRE-06` = true og `BOOT-01` = false | Opfyldt |
| F5 | Den oprindelige H5-fil `20261030211428_question_attempts_v2.sql` er **ikke** i produktionens ledger, og den må **aldrig** anvendes der (den afviser produktionens kroppe efter D-280/G1; produktionens vej er bootstrap, se bootstrap-filens header l. 4-17) | `LED-02` = true | Opfyldt |
| F6 | Den deployede kode er kendt: `process-event` v34, `get-next-question` v180 | `list_edge_functions` (version + `updated_at`) | v34 / v180 |
| F7 | Frontend i drift har `ENABLE_H5_SUBMISSIONS = false` | `curl -s https://xn--lrlig-sra.dk/js/answer-submission.js \| grep ENABLE_H5_SUBMISSIONS` | `false` (verificeret 2026-11-04) |
| F8 | Fuld unit-suite og Playwright er grønne på den `main`-commit, der deployes | CI på `main` + `npm run test:unit` lokalt | Kontrolleres ved hvert trin |
| F9 | Et aftalt tidsvindue uden for undervisningstid (designdokumentet: M2 "uden for undervisningstiden") | Ejeren | — |
| F10 | Ejerens beslutninger fra P0-auditten (beslutningsregistret, ikke committet): P0-D01 (H5-kæden må anvendes), P0-D02 (deploy af gnq/PE), P0-D03 (M2 efter observation) og P0-D14 (forklaring af den lave elevtrafik). Hver skal registreres som et D-nummer, før trinnet udføres | Ejeren | Åbne |

## 2. Kontrol af repository, deployede funktioner og schema

1. **Repository:** `git fetch origin && git rev-parse origin/main`. Notér SHA'en i produktionsloggen.
2. **Schema:** kør hele `docs/operations/h5-k1-readiness-checks.sql` read-only (`execute_sql`). Gem resultatet (kun `check_id`, `actual`, `ok`) i produktionsloggen.
3. **Deployede funktioner:** `list_edge_functions` → version og `updated_at` for `get-next-question`, `process-event`, `review-answer`. `get_edge_function` → arkivér kilden for de versioner, der skal kunne redeployes ved rollback (§10). Opbevar arkivet uden for repoet, fordi kilden kan indeholde konfiguration.
4. **Diff mod main:** sammenlign den deployede kilde med `supabase/functions/<navn>/` på den valgte commit. Kendt drift i nøgle-resolveren betyder, at alle forskelle skal forklares, før der deployes.
5. **Frontend:** `curl` af `js/answer-submission.js` og `js/flags.js` på `https://xn--lrlig-sra.dk/`.

## 3. Rækkefølge (bindende — D-327, PR #536)

| Trin | Handling | Præcis artefakt | Type | GO |
|---|---|---|---|---|
| **A1** | H5-bootstrap | `supabase/migrations/20261101190000_question_attempts_v2_bootstrap.sql` | `apply_migration` (navn `question_attempts_v2_bootstrap`) | Særskilt |
| **A2** | H5-alignment | `supabase/migrations/20261101190100_question_attempts_v2_align_grading.sql` | `apply_migration` (navn `question_attempts_v2_align_grading`) | Særskilt |
| **A3** | D-327 (forsøg kan ikke slettes via instansen) | `supabase/migrations/20261103100000_question_attempts_history_no_action.sql` | `apply_migration` (navn `question_attempts_history_no_action`) | Særskilt |
| **A4** | K1 (forsøgskontekst, udleveringssnapshot) | `supabase/migrations/20261103110000_l1_k1_attempt_context.sql` | `apply_migration` (navn `l1_k1_attempt_context`) | Særskilt |
| **A5** | Deploy `get-next-question` fra main **med `K1_SERVED_SNAPSHOT` ikke sat** | `supabase/functions/get-next-question/` | Edge-deploy | Særskilt |
| **A6** | Deploy `process-event` fra main | `supabase/functions/process-event/` | Edge-deploy | Særskilt |
| **A7** | Sæt Edge-secret `K1_SERVED_SNAPSHOT=on` | — | Secret | Særskilt |
| **A8** | Frontend: `ENABLE_H5_SUBMISSIONS = true` | `js/answer-submission.js:31` (egen PR, CI grøn, merge → Cloudflare-deploy) | Commit/PR/merge | Særskilt (hver for sig) |
| **A9** | Observation 48–72 timer | §8 | Drift | — |
| **A10** | **M2:** `REVOKE EXECUTE` på `process_question_attempt(uuid,uuid,text,bigint)` og `process_text_answer(uuid,uuid,text,boolean)` fra `service_role` | **Findes ikke endnu.** Kræver egen PR med migration, rollback og tests (`docs/question-attempts-design.md`: "PR 5 Aktivering (M2) — ikke startet") | Migration | Særskilt |

**Hvorfor denne rækkefølge:**

- **A1–A4:** Hver migration kontrollerer forgængerens krop med md5 og afviser alt andet atomart (ét DO-blok). K1 kræver D-327 og en tom `question_attempts`.
- **A5 før A8 er obligatorisk.** Den deployede `get-next-question` v180 sender ikke `round_no`; det er verificeret 2026-11-04 ved `get_edge_function`: 0 forekomster af `round_no` og 0 af `K1_SERVED_SNAPSHOT` i de 12 filer. Frontenden fejler lukket uden gyldigt `round_no` (`js/answer-submission.js:67-74`, `invalid_round_no`). Med flaget tændt mod v180 kan elever ikke svare.
- **A6 efter A4.** `process-event` på main kalder på H5-vejen altid K1's 9- og 10-argument-signaturer med `p_mode`/`p_hints_used` (`supabase/functions/process-event/text-answer-rpc.ts:114-149`). Legacy-vejen (uden `round_no` + `submission_id`) er uændret. H5-vejen vælges pr. anmodning; der er **intet serverflag** (`process-event/index.ts:97-104`).
- **A7 efter A4 og A5.** Snapshot-triggeren skal findes, før `get-next-question` sender forslag.
- **A10 sidst**, efter A9 er grøn: først da kan intet svar gå uden om loggen. Ældre klienter får så 426 `client_outdated` (`process-event/index.ts:291-296, 427-431`).

## 4. Forventet tilstand før og efter hvert trin (readiness-kontroller)

`T` = alle kontroller i fasen er `true`, `F` = alle er `false`. "Partiel" (nogle true, nogle false i samme fase) er altid **NO-GO**.

| Fase | Før A1 (i dag) | Efter A1 | Efter A2 | Efter A3 | Efter A4 | Efter A10 |
|---|---|---|---|---|---|---|
| `PRE-*` | T | T | T | T | T | T |
| `BOOT-*` | F | T | T | T | T | T |
| `ALIGN-01` | F | **F** (`_v2` bedømmer endnu ikke som G1 og må ikke kaldes) | T | T | T | T |
| `ALIGN-02` | F | T | T | T | T | T |
| `D327-01` | F | F | F | T | T | T |
| `K1-*` | F | F | F | F | T | T |
| `CUT-01` | F | F | F | F | F | T |
| `LED-01` | T (ingen) | T | T | T | T | T |
| `LED-02` | T | T | T | T | T | T |
| `INT-01` (estimat) | "findes ikke" | 0 | 0 | 0 | 0 | ≥ 0 |
| `SEC-*` | F (separat spor, blokerer ikke) | — | — | — | — | — |

Bevis på PGlite: `tests/unit/h5-k1-readiness-checks.test.mjs` test 2 (før), 3 (fuld kæde), 4a (D-327/K1 mangler), 4b (kun bootstrap).

## 5. GO/NO-GO

**GO for trin N kræver alle punkter:**
1. Ejerens skriftlige GO for netop trin N (ikke for andre trin).
2. Readiness-resultatet umiddelbart før matcher kolonnen "før trin N" i §4. Ingen partiel fase.
3. `PRE-*` og `LED-02` er true.
4. For A5–A8: diff mod den deployede kode er forklaret (§2.4), og CI er grøn på den commit, der deployes.
5. For A8: A5–A7 er gennemført og verificeret (§7). For A10: §9 er opfyldt.
6. Ingen åben driftshændelse. Ingen igangværende anden migration eller deploy på samme tid (versionskollisioner, D-110).

**NO-GO (stop, ingen ny handling):** enhver kontrol uden for forventning, en partiel fase, en migration der fejler (den er atomar: intet er ændret, men årsagen skal forstås før nyt forsøg), en deployet kilde der ikke svarer til main, uforklarede 4xx/5xx i `process-event` eller `get-next-question`.

**Efter hvert trin:** kør readiness-filen igen, sammenlign med kolonnen "efter trin N", og skriv en post i `docs/operations/production-actions/` (eksisterende format, se dens README).

## 6. Manuelle godkendelser

| Trin | Hvad ejeren godkender | Hvem udfører |
|---|---|---|
| A1–A4 | Hver migration for sig via `apply_migration` (D-110) | Claude eller ejeren, efter GO |
| A5, A6 | Hvert Edge-deploy for sig, efter forklaret diff | Efter GO |
| A7 | Ændring af Edge-secret | Ejeren (secrets er guard-beskyttede) |
| A8 | Frontend-PR: commit, PR, merge (hver handling for sig) | Efter GO |
| A10 | M2-migrationen (findes ikke endnu) + tidsvindue uden for undervisning | Efter GO |
| Rollback | Hver rollback er en særskilt produktionshandling | Efter GO |

## 7. API-kontrakter og feature flags

| Kontrakt/flag | Forventning | Kilde |
|---|---|---|
| Svaranmodning, H5-vej | `question_instance_id`, `answer`, `round_no` (heltal ≥ 1), `submission_id` (UUID, ét pr. bevidst svar, genbruges ved retry) | `js/answer-submission.js:4-20, 67-87`; `process-event/answer-v2.ts:38-66` |
| Kun ét af `round_no`/`submission_id`, eller ugyldig værdi | 400 `invalid_request`, aldrig nedgradering til legacy | `process-event/index.ts:97-104` |
| Svar fra `_v2` | `outcome` ∈ {`recorded`, `replay`, `round_closed`, `stale_round`, `submission_conflict`, `not_found`, `invalid_request`} + `round_no` | `20261103110000_l1_k1_attempt_context.sql` l. 650-657; `answer-v2.ts:91` |
| `get-next-question` | Sender `round_no` (= `repeat_count + 1`) | `get-next-question/index.ts:39, 265, 508, 549` |
| `K1_SERVED_SNAPSHOT` | Ikke sat = intet snapshot sendes (adfærd som før). `on` = forslag til snapshot ved indsættelse; due-/repeat-vejen læser `served_snapshot` | `get-next-question/index.ts:164-202`; `instance-insert.ts:21-84` |
| `ENABLE_H5_SUBMISSIONS` | Konstant `false`; ingen URL- eller localStorage-omgåelse | `js/answer-submission.js:10, 31` |
| Efter M2 | Legacy-anmodning → 426 `client_outdated` | `answer-v2.ts:140-148` |
| Synlighed | `js/flags.js` rapporterer `h5_submissions` | `js/flags.js:19, 39` |

**Kontrol efter A5–A8:**
- `get_edge_function` viser `round_no` i den deployede `get-next-question`.
- En syntetisk testelev (ikke en rigtig elev) besvarer ét spørgsmål efter A8 → `INT-01` stiger, og §8-blokken er ren.

## 8. Overvågning i 48–72 timer (A9)

Kør dagligt og efter hver skoledag. **Præcise integritetskontroller** (kræver, at `question_attempts` findes, dvs. efter A1). Kør dem read-only med `execute_sql`. Resultatet er kun antal:

```sql
-- H5-K1 INTEGRITY CHECKS (read-only; requires public.question_attempts)
SELECT check_id, actual, ok FROM (
  SELECT 'INT-A' AS check_id, count(*)::text AS actual, NULL::boolean AS ok, 1 AS ord
    FROM public.question_attempts
  UNION ALL
  SELECT 'INT-B', count(*)::text, count(*) = 0, 2
    FROM public.question_instances qi
   WHERE qi.answered
     AND qi.answered_at >= (SELECT min(a.created_at) FROM public.question_attempts a)
     AND NOT EXISTS (SELECT 1 FROM public.question_attempts a
                      WHERE a.question_instance_id = qi.id AND a.attempt_no = qi.repeat_count + 1)
  UNION ALL
  SELECT 'INT-C', count(*)::text, count(*) = 0, 3
    FROM public.question_attempts a
    JOIN public.question_instances qi ON qi.id = a.question_instance_id
   WHERE a.question_content_sha256 IS NULL AND qi.served_snapshot IS NOT NULL
     AND a.attempt_no = qi.repeat_count + 1
  UNION ALL
  SELECT 'INT-D', count(*)::text, count(*) = 0, 4
    FROM public.question_attempts a
   WHERE a.mode <> 'quiz_v1' OR a.hints_used <> 0
  UNION ALL
  SELECT 'INT-E', count(*)::text, count(*) = 0, 5
    FROM (SELECT a.question_instance_id, a.attempt_no FROM public.question_attempts a
           GROUP BY 1, 2 HAVING count(*) > 1) d
) x ORDER BY ord;
```

| Kontrol | Betydning | Grænse |
|---|---|---|
| INT-A | Antal forsøg (information) | — |
| INT-B | Besvarede instanser siden første forsøg uden matchende forsøg | **Før A10:** > 0 er forventeligt, når ældre klienter bruger legacy-vejen; tallet skal falde mod 0, efterhånden som klienterne opdateres. **Efter A10:** skal være 0 |
| INT-C | Forsøg uden indholdshash på runder med snapshot | 0 (efter A7) |
| INT-D | Afvigende `mode`/`hints_used` i L1 | 0 |
| INT-E | Dubletter pr. runde (umulig via constraint; kontrollen bekræfter det) | 0 |

**Edge-logs** (read-only `query_logs`, 24 t-vinduer): antal `POST` og statuskoder for `process-event` og `get-next-question`. Kriterier:
- 0 svar med status 5xx;
- 400 `invalid_request` og 426 forklaret;
- forholdet mellem `get-next-question`-POST og `process-event`-POST på niveau med før aktiveringen.

**Bemærk:** Den 2026-11-02 og frem var der næsten ingen elevtrafik (§11). Et observationsvindue uden elevsvar beviser intet. A9 er først opfyldt efter mindst én skoledag med reel brug.

## 9. Kriterier for M2 (A10)

Alle punkter skal være opfyldt:
1. A1–A8 er gennemført, og readiness-kolonnen "efter A4" holder.
2. A9 har varet ≥ 48 timer og har omfattet mindst én skoledag med elevsvar. INT-C, INT-D og INT-E = 0. Ingen uforklarede 4xx/5xx.
3. INT-B viser, at stort set alle nye svar går via `_v2`, og de resterende legacy-svar kan forklares med klienter, der ikke er genindlæst.
4. M2-migrationen findes som merget PR med rollback (GRANT tilbage) og tests, inkl. `process-event`'s 426-vej.
5. Tidsvindue uden for undervisningstid (F9).
6. Ejerens GO.

Efter M2 er **cutover-tidspunktet T** = tidspunktet for M2. Fra T kræves `CUT-01` = true og INT-B = 0.

## 10. Tilbagerulning pr. fase

**Skelnen:** *Deaktivering* (fx flag af) stopper brugen af en funktion, men databasen beholder sine nye objekter. *Genskabelse* fører databasen tilbage til den tidligere tilstand. En databaseændring kaldes kun genskabelig, hvor den konkrete tilbageførsel er dokumenteret **og afprøvet**. Alle afprøvninger nedenfor er på PGlite, ikke på en produktionskopi (§12).

| Fase | Deaktivering | Genskabelse af databasetilstand | Afprøvet | Forudsætning/grænse |
|---|---|---|---|---|
| A1 bootstrap | — | `DROP` af de to `_v2`-funktioner, rundevagt-triggeren, `question_attempts`, de to triggerfunktioner og `question_instances_id_student_id_key`, som beskrevet i headeren af `20261030211428` (bootstrap-filen henviser dertil, l. 90-93) | Ja: `tests/unit/question-attempts-v2-bootstrap.test.mjs:458` (`ROLLBACK_SQL` i `tests/unit/helpers/h5-integration-chain.mjs`) | Kun før første forsøg, og efter rollback af A4 og A3. **Ingen runbook i `docs/operations/`** — kun headerteksten. Skal køres som `apply_migration` med særskilt GO |
| A2 alignment | — | Samme som A1 (fjerner objekterne helt). Der findes ingen rollback, der kun tilbagefører alignment-kroppen | Ja (samme test) | Som A1 |
| A3 D-327 | — | `docs/operations/question-attempts-history-no-action-rollback.md` (FK tilbage til CASCADE) | Ja: `tests/unit/question-attempts-history-no-action-migration-run.test.mjs` test 6 (kørt 2026-11-04, 5/5 grøn) | Efter rollback af A4 |
| A4 K1 | `K1_SERVED_SNAPSHOT` slås fra | `docs/operations/l1-k1-attempt-context-rollback.md` | Ja: `tests/unit/l1-k1-attempt-context-migration-run.test.mjs` | **Kun før første forsøg** (rollbacken afbryder, hvis `question_attempts` ikke er tom). Flaget skal være slået fra først (runbookens rækkefølge) |
| A5 gnq | Redeploy arkiveret v180-kilde (§2.3) | Ikke relevant (ingen DB-ændring) | Nej: redeploy er ikke øvet | Arkivér kilden **før** A5 |
| A6 process-event | Redeploy arkiveret v34-kilde | Ikke relevant | Nej | Arkivér kilden før A6. Før A8 er H5-vejen ubrugt, så v34 kan genindsættes uden datatab |
| A7 flag | Fjern secret eller sæt ≠ `on` | Ikke relevant. Allerede oprettede snapshots bliver stående (det er ønsket) | — | — |
| A8 frontend | `ENABLE_H5_SUBMISSIONS = false` + deploy | **Ingen.** Forsøg, der er skrevet, bevares bevidst (append-only historik). Legacy-vejen virker igen | — | Efter første forsøg er A1–A4 **ikke længere genskabelige**. Kun fremadrettet rettelse (D-273) |
| A10 M2 | — | `GRANT EXECUTE … TO service_role` (skal ligge i M2-PR'en) | Nej (PR findes ikke) | Afprøves i M2-PR'en |

**Efter første skrevne forsøg** er historikken produktionsdata. Ingen rollback må slette den. Fejl rettes fremad med en ny, gennemgået migration.

## 11. Kendt tilstand og risici (2026-11-04)

**Readiness mod produktionen, 2026-11-04** (hele filen, uændret, read-only via `execute_sql`; Lærlig-guarden godkendte den som ren læsning):

| Fase | Resultat | Matcher §4 "Før A1" |
|---|---|---|
| `PRE-01`…`PRE-06` | Alle true. G1-krop `2e05e769…`. `release_open_question_outside` har D-316-kroppen `b80c1c78…`. G2-værnet `e5627de1…` findes præcis som gennemgået. Ingen ukendte skrivere. `question_attempts` findes ikke | Ja |
| `BOOT-*`, `ALIGN-*`, `D327-01`, `K1-*` | Alle false (objekterne findes ikke) | Ja |
| `CUT-01` | false (`service_role` har EXECUTE på begge legacy-funktioner) | Ja |
| `LED-01` / `LED-02` | true ("ingen" af kæden i ledgeren; den oprindelige H5-fil er ikke anvendt) | Ja |
| `SEC-01` / `SEC-02` | false (policyen "Students can insert own events"; TRUNCATE for anon og authenticated på alle tre tabeller) | Separat spor |

**Konklusion:** De databasemæssige forudsætninger for A1 er opfyldt. Blokeringerne ligger i A5–A10 og i beslutningerne (se A0-rapporten).

**Elevtrafik:**
- **Edge-logs, 2026-11-02 08:00–2026-11-03 08:00:**
  - 79 `POST get-next-question` og 60 `POST process-event` fra én klient kl. 09:00–09:22. Sidste svar 09:22:01Z.
  - Én åben instans oprettet 09:22:06Z, hvilket er normal afslutning.
  - Én `POST get-next-question` 2026-11-03 04:24Z, uden ny instans og uden svar.
- **Seneste døgn:** kun CORS-preflights fra workflowet `Production Smoke` (`.github/workflows/production-smoke.yml`), tidsmæssigt sammenfaldende med kørslerne på `main`. Desuden hub-trafik (logins, minispil, daglig belønning) uden quiz.
- **Konklusion:** ingen tegn på logningsfejl. Aktiviteten er faldet. En klientfejl før en POST kan ikke udelukkes fuldt.

**Ikke blokerende for A1–A8, men skal behandles:**
- **Dobbelt XP ved lærerbedømmelse:**
  - `supabase/functions/review-answer/index.ts:168-173` kalder 4-arg `review_answer`, der selv lægger XP til.
  - Derefter lægger `index.ts:180-196` samme beløb til igen.
  - Uafhængigt af H5 (lange svar og lærerbedømmelser er uden for loggen, H4 udskudt).
- **`student_events` og TRUNCATE-rettigheder:** `SEC-01`/`SEC-02`, separat sikkerhedsspor.

## 12. Hvad tests kan og ikke kan bevise (ingen staging)

**Kan bevises på PGlite:**
- migrationskædens atomicitet og guards;
- objekternes form, rettigheder og triggere;
- `_v2`'s idempotens og rundekontrol;
- rollback-SQL'ens korrekthed på produktionens gengivne kroppe;
- at readiness-kontrollerne er read-only og skelner alle faser.

**Kan ikke bevises:**
- PostgreSQL 17 i produktionen mod PGlite 18.3;
- Supabase-specifikke roller, ejere, default privileges og extensions;
- låsetid og samtidighed under reel last (`lock_timeout` 5 s i K1);
- Edge-runtime-adfærd, secrets og deploy;
- Cloudflare-cache af frontendfiler;
- gamle klienter i elevernes browsere;
- rigtige elevdata.

**Afbødning:**
- readiness-filen før og efter hvert trin;
- migrationernes egne atomare guards;
- trinvis aktivering med observation;
- syntetisk testelev efter A8;
- tidsvindue uden for undervisning.
