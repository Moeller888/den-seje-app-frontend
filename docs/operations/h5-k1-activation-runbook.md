# H5/K1 — aktiveringsrunbook for svarloggen

**Status:** H5 og K1 er merget på `main` (K1 som PR #536, `41aebf4b`), men **intet er anvendt eller aktiveret i produktionen**. Denne runbook er en procedure, **ikke en godkendelse**. Hvert trin kræver ejerens særskilte GO (CLAUDE.md regel 48; `docs/migration-workflow-policy.md`, D-110). `supabase db push` er forbudt.

**Formål:** Gøre den append-only svarlog (`public.question_attempts`, D-266/D-273) med forsøgskontekst (K1, D-334) til den eneste vej for automatisk rettede svar. Fra cutover (M2) kan første forsøg, gentagelser og indholdsversion dokumenteres pålideligt. Alt, hvad der skal bruges for at udføre aktiveringen, står i denne runbook. Den bygger på en audit af læringsfundamentet (2026-11-04), som ikke er en del af repositoryet. Beslutningerne fra auditten er gengivet i §1.1.

**Værktøjer i denne runbook:**
- `docs/operations/h5-k1-readiness-checks.sql`: read-only, én SELECT, kører gennem Supabase-MCP `execute_sql` og godkendes af Lærlig-guarden.
- `tests/unit/h5-k1-readiness-checks.test.mjs`: beviser kontrollerne på PGlite.

---

## 1. Forudsætninger

| # | Forudsætning | Hvordan kontrolleres | Status 2026-11-04 |
|---|---|---|---|
| F1 | Arbejdet sker fra en kendt `main`-commit, og de fire migrationsfiler er uændrede siden gennemgangen | `git rev-parse origin/main`; `git log --oneline -- supabase/migrations/2026110119*.sql supabase/migrations/20261103*.sql` (globbene rammer præcis `20261101190000_…bootstrap`, `20261101190100_…align_grading`, `20261103100000_…history_no_action` og `20261103110000_…attempt_context`) | `41aebf4b` |
| F2 | G1 (D-290) er anvendt | Readiness `PRE-01` = true | Opfyldt (se §11) |
| F3 | De syv fastlåste svar-/genåbningsfunktioner har de gennemgåede kroppe; G2 er fraværende eller præcis gennemgået | `PRE-02`…`PRE-05` = true | Opfyldt (se §11) |
| F4 | `question_attempts` findes ikke | `PRE-06` = true og `BOOT-01` = false | Opfyldt |
| F5 | Den oprindelige H5-fil `20261030211428_question_attempts_v2.sql` er **ikke** i produktionens ledger, og den må **aldrig** anvendes der (den afviser produktionens kroppe efter D-280/G1; produktionens vej er bootstrap, se bootstrap-filens header l. 4-17) | `LED-02` = true | Opfyldt |
| F6 | Den deployede kode er kendt: `process-event` v34, `get-next-question` v180 | `list_edge_functions` (version + `updated_at`) | v34 / v180 |
| F7 | Frontend i drift har `ENABLE_H5_SUBMISSIONS = false` | `curl -s https://xn--lrlig-sra.dk/js/answer-submission.js \| grep ENABLE_H5_SUBMISSIONS` | `false` (verificeret 2026-11-04) |
| F8 | Fuld unit-suite og Playwright er grønne på den `main`-commit, der deployes | CI på `main` + `npm run test:unit` lokalt | Kontrolleres ved hvert trin |
| F9 | Et aftalt tidsvindue uden for undervisningstid (designdokumentet: M2 "uden for undervisningstiden") | Ejeren | — |
| F10 | Ejerens beslutninger B1–B4 i §1.1 er truffet og registreret som D-numre i `docs/decisions/` | Ejeren | **Åbne — kun forslag** |

### 1.1 Beslutninger, der kræves (status: FORSLAG — ingen er godkendt)

Beslutningerne blev formuleret i en audit af læringsfundamentet den 2026-11-04 (arbejdsnavne P0-D01, P0-D02, P0-D03 og P0-D14). De gengives her, så runbooken kan bruges uden adgang til auditten. Ingen af dem er truffet. Hver skal registreres som et D-nummer (med reservations-tag), før det trin, den gælder, udføres.

| # | Arbejdsnavn | Spørgsmål | Foreslået svar | Gælder |
|---|---|---|---|---|
| B1 | P0-D01 | Må H5-kæden anvendes i produktionen (bootstrap → alignment → D-327 → K1), med én GO pr. migration? | Ja, når readiness-gaten for trinnet er GO | A1–A4 |
| B2 | P0-D02 | Hvordan deployes `get-next-question` og `process-event`? | Trinvis: `get-next-question` (A5) og `process-event` (A6) efter A4, hver efter en forklaret diff mod den deployede kode | A5, A6 |
| B3 | P0-D03 | Hvornår udføres M2? | Først efter ≥ 48 timers observation med reel elevtrafik og en M2-PR, der registrerer cutover-tidspunktet T (§9) | A10 |
| B4 | P0-D14 | Er den lave elevtrafik siden 2026-11-02 forventet (fx ferie eller testpause)? | Ejeren bekræfter. Indtil da er en observationsperiode uden elevsvar ikke bevis for noget (§8) | A9 |

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
| **A10a** | **M2, transaktion 1 — luk:** legacy-vejen lukkes effektivt for `process_question_attempt(uuid,uuid,text,bigint)` og `process_text_answer(uuid,uuid,text,boolean)` (§9.2) | `supabase/migrations/20261105120000_h5_m2_close_legacy_answer_path.sql` | `apply_migration` (navn `h5_m2_close_legacy_answer_path`), alene | Særskilt |
| **A10b** | **M2, transaktion 2 — dræn og registrér T** (§9.3). Først når A10a er committet | `supabase/migrations/20261105120100_h5_m2_register_cutover.sql` | `apply_migration` (navn `h5_m2_register_cutover`), alene | Særskilt |

**Hvorfor denne rækkefølge:**

- **A1–A4:** Hver migration kontrollerer forgængerens krop med md5 og afviser alt andet atomart (ét DO-blok). K1 kræver D-327 og en tom `question_attempts`.
- **A5 før A8 er obligatorisk.** Den deployede `get-next-question` v180 sender ikke `round_no`; det er verificeret 2026-11-04 ved `get_edge_function`: 0 forekomster af `round_no` og 0 af `K1_SERVED_SNAPSHOT` i de 12 filer. Frontenden fejler lukket uden gyldigt `round_no` (`js/answer-submission.js:67-74`, `invalid_round_no`). Med flaget tændt mod v180 kan elever ikke svare.
- **A6 efter A4.** `process-event` på main kalder på H5-vejen altid K1's 9- og 10-argument-signaturer med `p_mode`/`p_hints_used` (`supabase/functions/process-event/text-answer-rpc.ts:114-149`). Legacy-vejen (uden `round_no` + `submission_id`) er uændret. H5-vejen vælges pr. anmodning; der er **intet serverflag** (`process-event/index.ts:97-104`).
- **A7 efter A4 og A5.** Snapshot-triggeren skal findes, før `get-next-question` sender forslag.
- **A10 sidst**, efter A9 er grøn: først da kan intet svar gå uden om loggen. Ældre klienter får så 426 `client_outdated` (`process-event/index.ts:291-296, 427-431`). A10a og A10b er to særskilte `apply_migration`-kald i den rækkefølge (§9.5); de må aldrig samles i ét kald eller én transaktion.

## 4. Forventet tilstand før og efter hvert trin (readiness-kontroller)

Readiness-filen returnerer **33 rækker**: 27 kontroller, `CUT-02` og 5 gate-rækker. Testen kontrollerer dette antal mod netop denne sætning.

`T` = alle kontroller i fasen er `true`, `F` = alle er `false`. "Partiel" (nogle true, nogle false i samme fase) er altid **NO-GO**.

**`ok = NULL` er aldrig bestået.** NULL betyder "ikke evaluerbar" eller "kun information". Ingen GO-beslutning må hvile på en NULL-række. Gate-rækkerne regner NULL som false.

| Fase | Før A1 (i dag) | Efter A1 | Efter A2 | Efter A3 | Efter A4 | Efter A10 |
|---|---|---|---|---|---|---|
| `PRE-*` | T | T | T | T | T | T |
| `BOOT-*` | F | T | T | T | T | T |
| `ALIGN-01` | F | **F** (`_v2` bedømmer endnu ikke som G1 og må ikke kaldes) | T | T | T | T |
| `ALIGN-02` | F | T | T | T | T | T |
| `D327-01` | F | F | F | T | T | T |
| `K1-*` | F | F | F | F | T | T |
| `CUT-01` (legacy-vejen effektivt lukket, §9.2) | F | F | F | F | F | T |
| `CUT-02` | NULL (ikke relevant) | NULL | NULL | NULL | NULL | T (registreringen findes) |
| `LED-01` (ledger = skemaets fase) | T (fase 0) | T (fase 1) | T (fase 2) | T (fase 3) | T (fase 4) | T |
| `LED-02` | T | T | T | T | T | T |
| `INT-01` (estimat) | "findes ikke" | 0 | 0 | 0 | 0 | ≥ 0 |
| `GATE-A1` | **T** | F | F | F | F | F |
| `GATE-A2` | F | **T** | F | F | F | F |
| `GATE-A3` | F | F | **T** | F | F | F |
| `GATE-A4` | F | F | F | **T** | F | F |
| `GATE-M2` | F | F | F | F | **T** | F |
| `SEC-*` | F (separat spor, blokerer ikke) | — | — | — | — | — |

`LED-01` er false, hvis ledgeren er tom eller ufuldstændig, mens skemaet er længere fremme. Det samme gælder, hvis et trin er anvendt under et andet navn end det foreskrevne i §3, eller hvis versionerne står i forkert rækkefølge. `GATE-*` dækker kun schemadelen; deploys, flag og observation har manuelle kriterier (§5, §9).

`CUT-01` er kun true, når legacy-vejen er **effektivt** lukket (§9.2). Det kræver alt følgende:
- ingen af runtime-rollerne `anon`, `authenticated`, `service_role` og `authenticator` har `EXECUTE`. Det gælder både rollen selv og enhver rolle, den er medlem af, så arv og `SET ROLE` er dækket;
- `PUBLIC` har ingen tildeling i ACL'en;
- ingen anden ikke-superbruger end ejeren har `EXECUTE`;
- ingen anden funktion kalder legacy-funktionerne, og intet objekt afhænger af dem.

`actual` viser hver fundet adgangsvej, fx `runtime=authenticator→service_role`.

Bevis på PGlite: `tests/unit/h5-k1-readiness-checks.test.mjs`:
- test 2: før A1;
- test 3: den fulde kæde;
- test 4a: manglende D-327/K1;
- test 4b: kun bootstrap;
- test 8: ledger og gates;
- test 9a–9f: `CUT-01`'s adgangsveje.

## 5. GO/NO-GO

**GO for trin N kræver alle punkter:**
1. Ejerens skriftlige GO for netop trin N (ikke for andre trin).
2. Readiness-resultatet umiddelbart før matcher kolonnen "før trin N" i §4, og den tilhørende `GATE-*` er `true` (for A1–A4 og M2). Ingen partiel fase. En række med `ok = NULL` tæller aldrig som opfyldt.
3. `PRE-*` (undtagen `PRE-06` efter A4), `LED-01` og `LED-02` er true.
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
| A10a, A10b | Hver M2-migration for sig (§9.5) + tidsvindue uden for undervisning | Efter GO (hvert trin for sig) |
| Rollback | Hver rollback er en særskilt produktionshandling | Efter GO |

## 7. API-kontrakter og feature flags

| Kontrakt/flag | Forventning | Kilde |
|---|---|---|
| Svaranmodning, H5-vej | `question_instance_id`, `answer`, `round_no` (heltal ≥ 1), `submission_id` (UUID, ét pr. bevidst svar, genbruges ved retry) | `js/answer-submission.js:4-20, 67-87`; `process-event/answer-v2.ts:38-66` |
| Kun ét af `round_no`/`submission_id`, eller ugyldig værdi | 400 `invalid_request`, aldrig nedgradering til legacy | `process-event/index.ts:97-104` |
| Svar fra `_v2` | `outcome` ∈ {`recorded`, `replay`, `round_closed`, `stale_round`, `submission_conflict`, `not_found`, `invalid_request`} + `round_no` | Kontraktens udfald: headeren i `supabase/migrations/20261030211428_question_attempts_v2.sql` l. 56-70; svarets felter: `20261103110000_l1_k1_attempt_context.sql` l. 648-652; Edge-oversættelse: `answer-v2.ts:91` |
| `get-next-question` | Sender `round_no` (= `repeat_count + 1`) | `get-next-question/index.ts:39, 265, 508, 549` |
| `K1_SERVED_SNAPSHOT` | Ikke sat = intet snapshot sendes (adfærd som før). `on` = forslag til snapshot ved indsættelse; due-/repeat-vejen læser `served_snapshot` | `get-next-question/index.ts:164-202`; `instance-insert.ts:21-84` |
| `ENABLE_H5_SUBMISSIONS` | Konstant `false`; ingen URL- eller localStorage-omgåelse | `js/answer-submission.js:10, 31` |
| Efter M2 | Legacy-anmodning → 426 `client_outdated` | `answer-v2.ts:140-148` |
| Synlighed | `js/flags.js` rapporterer `h5_submissions` | `js/flags.js:19, 39` |

**Kontrol efter A5–A8:**
- `get_edge_function` viser `round_no` i den deployede `get-next-question`. Dette er read-only.
- **Produktionstest med en testbesvarelse — IRREVERSIBEL, kræver særskilt GO, udføres ikke som del af denne runbook uden det GO:**
  - En syntetisk testelev (aldrig en rigtig elev) kan besvare ét spørgsmål efter A8, så `INT-01` stiger, og §8 blok 1 kan kontrolleres.
  - **Det første forsøg i `question_attempts` er produktionshistorik.** Fra da af kan A4-, A3- og A1/A2-rollbacks (§10) ikke længere genskabe den tidligere databasetilstand uden at slette ny historik. K1-rollbacken afbryder selv, og ingen rollback må slette forsøg.
  - GO'et skal derfor nævne projektet, testkontoen, at handlingen afskærer schema-rollback, og de forventede skrivninger: én række i `question_instances`, én i `question_attempts`, samt XP, mønter, streak og quests for testkontoen (produktionsloggens regel, `docs/operations/production-actions/README.md`).
  - Uden et sådant GO er A8 først verificeret, når rigtige elevsvar viser sig i §8.

## 8. Overvågning i 48–72 timer (A9)

Kør dagligt og efter hver skoledag. Der er to blokke med **præcise integritetskontroller**. De køres read-only med `execute_sql`, og resultatet er kun antal.

- **Blok 1** kræver, at `question_attempts` findes, dvs. efter A1.
- **Blok 2** kræver cutover-registreringen fra M2 (§9). Den må først køres efter M2.

**Blok 1 — efter A1:**

```sql
-- H5-K1 INTEGRITY CHECKS (read-only; requires public.question_attempts)
SELECT check_id, actual, ok FROM (
  SELECT 'INT-A' AS check_id, count(*)::text AS actual, NULL::boolean AS ok, 1 AS ord
    FROM public.question_attempts
  UNION ALL
  -- INFORMATION, not a criterion: legacy answers since the first attempt (expected while old clients
  -- remain, i.e. between A8 and M2). It can never become a GO criterion: it counts from the first
  -- attempt, not from the cutover T.
  SELECT 'INT-B0', count(*)::text, NULL::boolean, 2
    FROM public.question_instances qi
   WHERE qi.answered
     AND qi.answered_at >= (SELECT min(a.created_at) FROM public.question_attempts a)
     AND NOT EXISTS (SELECT 1 FROM public.question_attempts a
                      WHERE a.question_instance_id = qi.id AND a.attempt_no = qi.repeat_count + 1)
  UNION ALL
  -- Legacy answers AFTER the cutover T: not evaluable here, because T is only registered by M2
  -- (runbook §9). The criterion is block 2.
  SELECT 'INT-B', 'IKKE EVALUERBAR: cutover-tidspunktet T er ikke registreret (M2 findes ikke) — se blok 2', NULL::boolean, 3
  UNION ALL
  SELECT 'INT-C', count(*)::text, count(*) = 0, 4
    FROM public.question_attempts a
    JOIN public.question_instances qi ON qi.id = a.question_instance_id
   WHERE a.question_content_sha256 IS NULL AND qi.served_snapshot IS NOT NULL
     AND a.attempt_no = qi.repeat_count + 1
  UNION ALL
  SELECT 'INT-D', count(*)::text, count(*) = 0, 5
    FROM public.question_attempts a
   WHERE a.mode <> 'quiz_v1' OR a.hints_used <> 0
  UNION ALL
  SELECT 'INT-E', count(*)::text, count(*) = 0, 6
    FROM (SELECT a.question_instance_id, a.attempt_no FROM public.question_attempts a
           GROUP BY 1, 2 HAVING count(*) > 1) d
) x ORDER BY ord;
```

**Blok 2 — efter M2.** Kræver `public.answer_path_cutovers` fra M2-PR'en (§9). Tabellen findes ikke i dag; kør ikke blokken før M2.

```sql
-- H5-K1 INTEGRITY AFTER M2 (read-only; requires public.question_attempts and public.answer_path_cutovers)
SELECT check_id, actual, ok FROM (
  SELECT 'CUT-T' AS check_id,
         coalesce((SELECT c.effective_at::text FROM public.answer_path_cutovers c WHERE c.cutover = 'h5_m2'),
                  'mangler') AS actual,
         EXISTS (SELECT 1 FROM public.answer_path_cutovers c WHERE c.cutover = 'h5_m2') AS ok, 1 AS ord
  UNION ALL
  -- Answers after T without their attempt: the cutover criterion. NULL (not evaluable) without T.
  SELECT 'INT-B', count(*)::text,
         CASE WHEN EXISTS (SELECT 1 FROM public.answer_path_cutovers c WHERE c.cutover = 'h5_m2')
              THEN count(*) = 0 END, 2
    FROM public.question_instances qi
   WHERE qi.answered
     AND qi.answered_at > (SELECT c.effective_at FROM public.answer_path_cutovers c WHERE c.cutover = 'h5_m2')
     AND NOT EXISTS (SELECT 1 FROM public.question_attempts a
                      WHERE a.question_instance_id = qi.id AND a.attempt_no = qi.repeat_count + 1)
) x ORDER BY ord;
```

| Kontrol | Betydning | Grænse |
|---|---|---|
| INT-A | Antal forsøg (information) | — |
| INT-B0 | Legacy-svar siden første forsøg (information) | `ok = NULL` altid. **Aldrig et GO-kriterium.** Mellem A8 og M2 er > 0 forventeligt (klienter, der ikke er genindlæst). Tallet kan ikke falde til 0 igen, fordi det tæller fra første forsøg |
| INT-B (blok 1) | Legacy-svar efter cutover | `ok = NULL`: **ikke evaluerbar** før M2 har registreret T. Må aldrig læses som bestået |
| CUT-T (blok 2) | T er registreret for `h5_m2` | `true` efter M2 |
| INT-B (blok 2) | Besvarede instanser efter T uden matchende forsøg | 0. `NULL`, hvis T mangler, er NO-GO |
| INT-C | Forsøg uden indholdshash på runder med snapshot | 0 (efter A7) |
| INT-D | Afvigende `mode`/`hints_used` i L1 | 0 |
| INT-E | Dubletter pr. runde (umulig via constraint; kontrollen bekræfter det) | 0 |

**INT-B (blok 2) er kun eksakt, når M2 følger rækkefølgen i §9.3:** luk, dræn og registrér først derefter. Registreres T i samme transaktion som REVOKE, opstår to fejl:
- et legacy-kald, der starter mellem T og M2's commit, får `answered_at > T` og ligner et brud, selv om det ikke er et;
- et kald, der startede før M2, kan committe efter T med `answered_at < T` og overses.

Et simpelt filter på `answered_at` er derfor ikke dokumentation i sig selv.

**Edge-logs** (read-only `query_logs`, 24 t-vinduer): antal `POST` og statuskoder for `process-event` og `get-next-question`. Kriterier:
- 0 svar med status 5xx;
- 400 `invalid_request` og 426 forklaret;
- forholdet mellem `get-next-question`-POST og `process-event`-POST på niveau med før aktiveringen.

**Bemærk:** Den 2026-11-02 og frem var der næsten ingen elevtrafik (§11). Et observationsvindue uden elevsvar beviser intet. A9 er først opfyldt efter mindst én skoledag med reel brug.

## 9. Kriterier for M2 (A10)

Alle punkter skal være opfyldt:
1. A1–A8 er gennemført, og readiness-kolonnen "efter A4" holder.
2. A9 har varet ≥ 48 timer og har omfattet mindst én skoledag med elevsvar. INT-C, INT-D og INT-E = 0. Ingen uforklarede 4xx/5xx.
3. INT-B0 (kun information) viser, at stort set alle nye svar går via `_v2`, og de resterende legacy-svar kan forklares med klienter, der ikke er genindlæst.
4. M2-migrationerne (§9.5) findes som merget PR med rollback (`docs/operations/h5-m2-rollback.md`) og tests efter §9.4. PR'en skal dække:
   - effektiv lukning af legacy-vejen (§9.2);
   - rækkefølgen for igangværende kald (§9.3);
   - `process-event`'s 426-vej;
   - registreringen af T (§9.1).
5. Tidsvindue uden for undervisningstid (F9).
6. Readiness `GATE-M2` = true.
7. Ejerens GO.

### 9.1 Bindende forudsætning: registrering af cutover-tidspunktet T

**Status 2026-11-04:** Der findes ingen troværdig, vedvarende registrering af et aktiveringstidspunkt. Kun `auth.audit_log_entries` matcher søgningen, og den indeholder login-hændelser. Følgende kan **ikke** bruges som T:
- **Ledgerens `version`:** den er migrationens identifikator. Ved `apply_migration` stemples den af API'et, men tidszonen er ikke dokumenteret, og ved andre anvendelsesveje er den filnavnets tidsstempel.
- **Tidspunktet i en fil under `docs/operations/production-actions/`:** det er skrevet manuelt og kan ikke aflæses read-only med SQL.
- **Tidspunktet for commit eller merge af M2-PR'en.**

**Kontrakt, som M2-PR'en skal opfylde (forslag; kræver ejerens godkendelse sammen med M2):**
1. Ny tabel `public.answer_path_cutovers`:
   - `cutover text PRIMARY KEY CHECK (cutover IN ('h5_m2'))`, `effective_at timestamptz NOT NULL`, `closed_before timestamptz NOT NULL`, `migration text NOT NULL`, `CHECK (closed_before <= effective_at)`;
   - RLS slået til uden policies, ingen rettigheder for anon/authenticated, `service_role` kun SELECT;
   - en append-only-trigger mod UPDATE/DELETE;
   - **tabellen oprettes i transaktion 2 (§9.3), i samme transaktion som rækken for `h5_m2`.** Den findes derfor kun sammen med registreringen. Readiness `CUT-02` kan kun se, om tabellen findes, fordi en statisk forespørgsel ikke kan læse en tabel, der måske ikke findes. Rækken selv kontrolleres af `CUT-T` i §8 blok 2.
2. Lukning og registrering sker i den rækkefølge, §9.3 foreskriver:
   - transaktion 1 lukker legacy-vejen effektivt (§9.2);
   - transaktion 2 dræner kald, der allerede er i gang, og indsætter først derefter `('h5_m2', clock_timestamp(), closed_before, '<filnavn>')`.

   En tidligere udgave af kontrakten krævede REVOKE og registrering i samme transaktion. Det er erstattet, fordi det giver de fejlklassificeringer, §9.3 beskriver.
3. `effective_at` er `timestamptz`, så tidszonen er entydig: det er et absolut tidspunkt, der vises i sessionens tidszone, og produktionsloggen bruger UTC.
4. M2-PR'ens tests følger §9.4.
5. Readiness `CUT-02` er false, hvis M2 er udført uden registreringen. Det gælder også mellem transaktion 1 og 2. Det er NO-GO, og M2 må i så fald ikke erklæres gennemført.

Efter M2 er **cutover-tidspunktet T** = `answer_path_cutovers.effective_at` for `h5_m2`. Fra T kræves `CUT-01` = true, `CUT-02` = true, `CUT-T` = true og INT-B (blok 2) = 0.

### 9.2 Krav til M2: effektiv lukning af legacy-vejen

`REVOKE EXECUTE … FROM service_role` er ikke nødvendigvis tilstrækkeligt. En rolle kan udføre en funktion ad flere veje:
- `EXECUTE` er givet direkte til rollen;
- `EXECUTE` er givet til `PUBLIC`;
- `EXECUTE` er givet til en rolle, den arver fra;
- `EXECUTE` er givet til en rolle, den kan skifte til med `SET ROLE`.

Desuden kan en anden funktion (især `SECURITY DEFINER`), et view eller et pg_cron-job kalde legacy-funktionen med ejerens rettigheder.

**Tilstand i produktionen 2026-11-04** (read-only via `execute_sql`):
- **ACL:** for begge legacy-funktioner er den `{postgres=X/postgres,service_role=X/postgres}`. Der er ingen `PUBLIC`-tildeling, og `anon` og `authenticated` har ikke `EXECUTE`.
- **`authenticator`:** PostgREST's login-rolle. Den er `NOINHERIT` og medlem af `anon`, `authenticated` og `service_role`, og den skifter rolle med `SET ROLE`.
  - `has_function_privilege('authenticator', …)` er derfor false, selv om rollen i praksis kalder funktionen som `service_role`.
  - Kontrollen skal følge medlemskab (`pg_has_role(…, 'MEMBER')`), ikke kun arv.
  - Ingen runtime-rolle kan skifte til ejeren (`postgres`) eller til en superbruger.
- **Andre kaldere:** ingen anden funktion i noget skema kalder legacy-funktionerne, og intet objekt afhænger af dem (`pg_depend`).
- **pg_cron:** udvidelsen er installeret. Der er 1 job; det kører som `postgres` og kalder ikke legacy-funktionerne. Et job, der kører som ejer, stoppes ikke af en REVOKE.
- **Standardrettigheder:** `pg_default_acl` for funktioner, som `postgres` opretter i `public`, giver `EXECUTE` til `anon`, `authenticated` og `service_role`.
  - En `DROP` + `CREATE` af en legacy-funktion giver derfor alle tre adgang igen.
  - Desuden får `PUBLIC` `EXECUTE` på enhver ny funktion, medmindre det tilbagekaldes eksplicit.

**Krav:**
1. **Tilbagekald bredt.** M2 tilbagekalder `EXECUTE` fra alle runtime-roller og eksplicit fra `PUBLIC`: `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated, service_role`. Ejerens rettighed bevares; ejeren er ikke en runtime-rolle.
2. **Påstand i migrationen.** Samme DO-blok kontrollerer efter REVOKE de samme betingelser som readiness `CUT-01`. Fejler én af dem, afbryder den med `RAISE`, og hele transaktionen rulles tilbage. Betingelserne er:
   - ingen af `anon`, `authenticated`, `service_role` og `authenticator` har `EXECUTE`, og det gælder også enhver rolle, de er medlem af;
   - ACL'en har ingen `PUBLIC`-tildeling. `PUBLIC` er ikke en rolle, så `has_function_privilege('PUBLIC', …)` bruges ikke. Tildelingen læses i stedet i `aclexplode(coalesce(proacl, acldefault('f', proowner)))` med grantee 0; en NULL-ACL betyder standardrettighederne, hvor `PUBLIC` har `EXECUTE`;
   - ingen anden ikke-superbruger end ejeren har `EXECUTE`;
   - ingen anden funktion kalder legacy-funktionerne;
   - intet objekt i `pg_depend` afhænger af dem.
3. **Ingen `DROP`/`CREATE`.** M2 og alle senere migrationer må ikke droppe og genoprette legacy-funktionerne. Skal en krop ændres, bruges `CREATE OR REPLACE`, som bevarer ACL'en, efterfulgt af en eksplicit REVOKE og den samme påstand. Readiness `CUT-01` opdager fejlen bagefter (test 9f).
4. **Kaldestier uden for SQL-kataloget** kontrolleres manuelt før M2 og noteres i produktionsloggen:
   - **pg_cron:** blokken nedenfor. Den kræver `cron.job` og køres kun dér, hvor udvidelsen findes. Forventet resultat: `legacy_jobs` = 0.
   - **Edge Functions:** i repoet kalder kun `process-event` legacy-RPC'erne (`supabase/functions/process-event/text-answer-rpc.ts:62` og `:89`). Den deployede kilde skal diffes (§2.4), fordi v34 ikke er arkiveret.
   - **Triggere, views og databasewebhooks:** de dækkes af `pg_depend` i `CUT-01`.

```sql
-- H5-K1 M2 CALL PATHS (read-only; requires pg_cron's cron.job — run only where the extension exists)
SELECT count(*) AS jobs,
       count(*) FILTER (WHERE j.command ~* '\m(process_question_attempt|process_text_answer)\M') AS legacy_jobs,
       string_agg(DISTINCT j.username, ', ') AS run_as
  FROM cron.job j;
```

### 9.3 Krav til M2: legacy-kald, der er i gang ved aktiveringen

**Fakta:**
- **Afviste kald skriver intet.** PostgreSQL kontrollerer `EXECUTE`, når kaldet starter, før funktionskroppen kører. `process-event` oversætter præcis SQLSTATE 42501 med teksten `permission denied for function …` til 426 `client_outdated` (`supabase/functions/process-event/answer-v2.ts:139-146`).
- **REVOKE stopper ikke kald, der er i gang.** Den venter ikke på dem og tager ingen lås, der får dem til at vente. Et kald, der har passeret kontrollen, fuldfører med de gamle rettigheder.
- **REVOKE ses først efter commit.** Andre sessioner ser ændringen først, når M2's transaktion committes.
- **`answered_at` er transaktionens starttid.** Legacy-funktionerne sætter `answered_at = now()` (`supabase/migrations/20261101150000_grading_meaningful_characters.sql:163` og `:187`), ikke committidspunktet. PostgREST kører hvert RPC-kald i sin egen transaktion.

**Hvorfor et filter på `answered_at >= T` ikke er tilstrækkeligt i sig selv,** hvis T registreres i samme transaktion som REVOKE:
1. **Kald, der starter før REVOKE committes,** kan committe efter T med `answered_at < T`. De klassificeres som "før cutover", selv om de er skrevet efter. Svaret tabes ikke, men tidsfiltret ser det aldrig.
2. **Kald, der starter mellem `clock_timestamp()` og M2's commit,** passerer stadig rettighedskontrollen og får `answered_at > T`. Det ligner et brud, men er det ikke.
3. **En session i tilstanden "idle in transaction"** med et ikke-committet legacy-svar kan committe vilkårligt senere.

**Påkrævet rækkefølge** (forslag til M2-PR'en; kræver ejerens godkendelse sammen med M2):

1. **Transaktion 1 — luk.**
   - `SET LOCAL lock_timeout`, derefter REVOKE (§9.2 krav 1) og påstanden (§9.2 krav 2), derefter COMMIT.
   - Herefter kan intet nyt legacy-kald passere rettighedskontrollen.
   - Tilstanden er nu "M2 udført, T mangler": `CUT-01` = true og `CUT-02` = false. Det er NO-GO, indtil trin 2 er gennemført.
2. **Transaktion 2 — dræn, og registrér først derefter.**
   - Sæt `closed_before := clock_timestamp()`, altså et tidspunkt efter transaktion 1's commit.
   - **Vent** på kald, der allerede er i gang:
     - betingelsen er, at ingen anden klientsession har en åben transaktion med `xact_start < closed_before`; tilstanden `idle in transaction` tæller med;
     - sessionerne findes i `pg_stat_activity` med `backend_type = 'client backend'` og `pid <> pg_backend_pid()`;
     - visningen fastfryses pr. transaktion, så `pg_stat_clear_snapshot()` skal kaldes før hver ny aflæsning i venteløkken;
     - alle legacy-kald, der kan have passeret rettighedskontrollen, er startet før `closed_before`, så de er nu enten committet eller afbrudt.
   - **Tidsgrænse:** venteløkken har en hård grænse, fx 30 s.
     - Overskrides den, afbryder migrationen med `RAISE`.
     - Der registreres intet, og REVOKE bliver stående, hvilket er den sikre retning.
     - Trinnet gentages først, når sessionen er undersøgt.
     - Ingen session afbrydes automatisk; `pg_terminate_backend` er ikke en del af M2.
   - **Synlighed:** migrationsrollen skal kunne se andre rollers `xact_start`. I Supabase forventes `postgres` at have `pg_read_all_stats`; det verificeres i M2-PR'en.
     - Kan rollen ikke se dem, afbrydes trinnet (fail-closed).
     - En usynlig session ville ellers blive tolket som "ingen".
   - **Først derefter**, stadig i transaktion 2: opret `public.answer_path_cutovers` (§9.1 punkt 1) og indsæt `INSERT INTO public.answer_path_cutovers (cutover, effective_at, closed_before, migration) VALUES ('h5_m2', clock_timestamp(), closed_before, '<filnavn>')`. Afbrydes transaktion 2, findes hverken tabel eller række, og `CUT-02` = false.
3. **Garanti:**
   - Ethvert legacy-svar er committet før T og har `answered_at < closed_before ≤ T`.
   - Et besvaret svar uden matchende forsøg med `answered_at > T` er derfor et reelt brud, og INT-B (blok 2) er eksakt.
   - Kald, der afvises efter transaktion 1, skriver intet. Instansen forbliver ubesvaret, og den genindlæste klient kan besvare den via H5.
   - Intet svar tabes stiltiende, og intet klassificeres forkert.

### 9.4 Tests, M2-PR'en skal indeholde

**Udgangspunkt:**
- `tests/unit/h5-k1-readiness-checks.test.mjs`: rettigheder og adgangsveje (test 9a–9f).
- `tests/unit/question-attempts-v2-bootstrap.test.mjs` og `tests/unit/l1-k1-attempt-context-migration-run.test.mjs`: H5-kæden, rettigheder og rollback.
- `tests/unit/difficulty-scale-b-concurrency.test.mjs`: mønsteret for rigtig samtidighed mod PostgreSQL 17 i unit-CI (`LEVEL_ENGINE_PG_URL`). PGlite har kun én forbindelse og kan ikke vise samtidighed, så punkt 5 skal køre mod PostgreSQL 17.

**Tests:**
1. **Den nye H5-vej virker.** Efter M2 kan `service_role` kalde 9- og 10-argument-`_v2`. Forsøget skrives, og INT-A, INT-C, INT-D og INT-E holder.
2. **Legacy-vejen er utilgængelig.**
   - Rollerne `service_role`, `anon`, `authenticated` og, hvor rollen findes, `authenticator` via `SET ROLE` får 42501 med præcis den tekst, `isRevokedLegacyRpc` forventer.
   - Ingen rækker ændres, og `CUT-01` = true.
   - Negative varianter, som i test 9a–9f her: `PUBLIC`-tildeling, rollearv, `SET ROLE`, wrapper-funktion, view, og `DROP`/`CREATE` med produktionens standardrettigheder.
3. **Gamle klienter kan ikke omgå cutover.**
   - `process-event` returnerer 426 for en anmodning uden `round_no`/`submission_id`.
   - Det vises med en enhedstest af svarmapperen og en kontrol mod den faktiske PostgREST-fejltekst.
   - Den ubesvarede instans kan derefter besvares via H5.
4. **Ingen svarhistorik slettes.** Rækketallene i `question_attempts`, `question_instances`, `student_answers` og `student_progress` og skemaets fingeraftryk er uændrede over M2 (mønster: test 7 her).
5. **Registreringen svarer til en dokumenteret overgang** (mod rigtig PostgreSQL 17):
   - **Igangværende kald:** session A har et legacy-kald i en åben transaktion, og transaktion 1 committer. Transaktion 2 venter, til A har committet, og registrerer først derefter. A's række har `answered_at < closed_before ≤ effective_at`, og INT-B = 0.
   - **Nyt kald efter lukning:** et legacy-kald efter transaktion 1 afvises og skriver intet.
   - **Hængende session:** en session i "idle in transaction" ud over tidsgrænsen får transaktion 2 til at afbryde. Der registreres intet, og `CUT-02` = false.
   - **Registreringen:** der er præcis én række for `h5_m2`, UPDATE og DELETE afvises, og `CUT-02` = `CUT-T` = true.
6. **Rollback.** `GRANT EXECUTE` gives kun til `service_role`, aldrig til `PUBLIC`, `anon` eller `authenticated`. Registreringen bliver stående.

### 9.5 Implementering af M2 og aktiveringsprocedure

**Status 2026-11-05:** Implementeret i en Draft PR, **ikke anvendt og ikke aktiveret**. Migrationerne er inaktive, indtil B1–B4 (§1.1) er truffet, A1–A9 er gennemført, og ejeren har givet GO til hvert trin. De står i `NOT_IN_PRODUCTION` i `tests/isolated/schema/replay-plan.mjs`, så den isolerede CI ikke afspiller dem.

**Filer:**

| Trin | Fil | Hvad den gør |
|---|---|---|
| A10a | `supabase/migrations/20261105120000_h5_m2_close_legacy_answer_path.sql` | Først en vagt: K1 er anvendt med de gennemgåede `_v2`-kroppe; `service_role` kan udføre `_v2`; der er mindst ét forsøg i `question_attempts`; ingen runtime-rolle er medlem af legacy-ejeren; der er ingen kaldere, afhængige eller cron-job. Derefter `REVOKE EXECUTE` fra `PUBLIC` og fra **enhver** tildeling i ACL'en undtagen ejeren, og så påstanden fra `CUT-01`. Ét DO-blok, `lock_timeout` 5 s. Ingen kroppe, ingen `DROP`/`CREATE`, ingen rækker |
| A10b | `supabase/migrations/20261105120100_h5_m2_register_cutover.sql` | Først en vagt: legacy er lukket (A10a er committet), og rollen kan se andre sessioner. Så `closed_before := clock_timestamp()` og dræn: der ventes, til ingen klientsession **i samme database** har en transaktion med `xact_start < closed_before`, højst 30 s. Først derefter oprettes `answer_path_cutovers` med triggere og rettigheder, og rækken `h5_m2` indsættes. Ét DO-blok. En ny kørsel efter succes ændrer intet |
| Rollback | `docs/operations/h5-m2-rollback.md` | Fejltabel for hvert delskridt og R1 (genåbn kun for `service_role`) |

**Er rækkefølgen gennemførlig med projektets værktøjer?** Ja:
- `apply_migration` kører én migration pr. kald. To filer giver derfor to transaktioner, og A10a er committet, før A10b begynder. Hver fil er ét DO-blok og dermed atomar, uanset om API'et selv åbner en transaktion.
- En venteløkke i ét DO-blok kan aflæse andre sessioner, fordi `pg_stat_clear_snapshot()` kaldes før hver aflæsning, og `pg_sleep` venter imellem.
- **Produktionsfakta (read-only, 2026-11-05):**
  - `apply_migration` og `execute_sql` kører som `postgres`, der ikke er superbruger, men er medlem af `pg_read_all_stats` og derfor kan se andre sessioners `xact_start`;
  - `statement_timeout` for `postgres` er 2 min, så 30 s ventetid er inden for grænsen;
  - `authenticator` har `statement_timeout` 8 s, så et PostgREST-kald varer højst så længe. En ældre åben transaktion er ikke et svar, der er i gang, og skal ses på af et menneske.
- **Forbehold 1:** dræn venter også på transaktioner, der ikke har kaldt legacy-funktionerne, fordi det ikke kan ses udefra. En lang, urelateret transaktion i samme database får A10b til at ramme tidsgrænsen. Det er den sikre retning: intet registreres, og trinnet gentages.
- **Forbehold 2:** kun klientsessioner (`backend_type = 'client backend'`) i den aktuelle database tælles. pg_cron-job, der kører som ejeren, er dækket af vagten i A10a (`legacy_jobs` = 0). Ejeren beholder `EXECUTE` og er ikke en runtime-rolle.

**Forudsætninger før A10a (alle skal holde):**
1. §9 punkt 1–3 og 5–7 er opfyldt. B1–B4 er truffet og registreret.
2. Den deployede `process-event` er versionen fra `main` med 426-vejen (A6), og dens kilde er diffet mod `main`. Den deployede v34 kender **ikke** 426: efter A10a ville den svare 500 på legacy-kald.
3. Arkiv: kilden for den deployede `process-event` og `get-next-question` er hentet med `get_edge_function` og gemt uden for repoet med version og `ezbr_sha256` (§2.3). Det samme gælder `review-answer`, selv om M2 ikke rører den.
4. Readiness umiddelbart før: kolonnen "Efter A4" i §4 holder, `GATE-M2` = true og `CUT-01` = false.
5. Kaldestier (§9.2 punkt 4): cron-blokken giver `legacy_jobs` = 0.
6. Åbne transaktioner, read-only, umiddelbart før A10b. Forventet: ingen, eller kun nogle få sekunder gamle.

   ```
   SELECT pid, usename, state, now() - xact_start AS age FROM pg_stat_activity
    WHERE backend_type = 'client backend' AND datname = current_database()
      AND xact_start IS NOT NULL AND pid <> pg_backend_pid();
   ```

**Aktiveringsrækkefølge** (hvert trin med særskilt GO, i et tidsvindue uden undervisning):

| # | Handling | Forventet tilstand bagefter | NO-GO, hvis |
|---|---|---|---|
| 1 | Readiness, cron-blok og arkiv (punkt 3–5 ovenfor), read-only | Som forudsætningerne | Afvigelse |
| 2 | **A10a:** `apply_migration` med `20261105120000_…` | DB: `CUT-01` = true, `CUT-02` = false. API: legacy-anmodninger → 426 `client_outdated`; H5 virker uændret | Migrationen afvises (intet ændret; læs fejlteksten) |
| 3 | Åbne transaktioner (punkt 6), read-only | Ingen ældre end få sekunder | Lange transaktioner: undersøg før trin 4 |
| 4 | **A10b:** `apply_migration` med `20261105120100_…`, straks efter trin 2 og 3 | DB: `CUT-01` = `CUT-02` = true; §8 blok 2: `CUT-T` = true, INT-B = 0 | Tidsgrænse eller anden afvisning. Tilstanden er "lukket, T mangler", som er sikker; se `docs/operations/h5-m2-rollback.md` §2 |
| 5 | Readiness og §8 blok 1 og 2, read-only; post i `docs/operations/production-actions/` med `effective_at` og `closed_before` | Som ovenfor | Afvigelse |

**Overvågning efter aktivering** (de første 48 timer, derefter dagligt i en uge):
- §8 blok 2: INT-B = 0. Hver række over 0 er et svar, der er skrevet uden om loggen efter T, og skal forklares.
- Edge-logs:
  - antallet af 426 fra `process-event` (klienter, der ikke er genindlæst) skal falde mod 0;
  - 0 svar med status 5xx;
  - forholdet mellem `get-next-question`- og `process-event`-POST er som før.
- §8 blok 1: INT-C, INT-D og INT-E = 0.
- Readiness `CUT-01` = true. Det fanger en senere migration, der genåbner vejen.

**Hvad M2 ikke ændrer:**
- ingen funktionskrop og ingen tabel uden for `answer_path_cutovers`;
- ingen rækker i svarhistorikken, XP, mønter, streak, quests eller lærerstatistikker;
- hverken `get-next-question`, frontendens state-machine eller den adaptive motor.

Testene viser det med skemaets fingeraftryk og ved at køre samme H5-forløb med og uden M2. Den kendte dobbelt-XP ved lærerbedømmelse (`review-answer`, §11) går ikke gennem legacy-funktionerne og berøres ikke; den er et separat spor.

**Tests (§9.4):**
- `tests/unit/h5-m2-cutover-migration-run.test.mjs` (PGlite, 9 tests): filerne; vagterne; sluttilstanden for alle adgangsveje; 42501 → 426; H5 uændret; registrering, append-only og rettigheder; R1.
- `tests/unit/h5-m2-cutover-concurrency.test.mjs` (PostgreSQL 17, kræves i unit-CI): igangværende kald, flere samtidige kald, ingen kald, tidsgrænse, genoptagelse og R1.

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
| A10 M2 | — | R1 i `docs/operations/h5-m2-rollback.md`: `GRANT EXECUTE … TO service_role`. Gives aldrig til `PUBLIC`, `anon` eller `authenticated`, og legacy-funktionerne droppes og genoprettes ikke (§9.2). **Efter A10a må H5 kun slås fra i frontenden efter R1**, ellers har eleverne ingen svarvej | Ja: PGlite (`h5-m2-cutover-migration-run.test.mjs`) og PostgreSQL 17 i CI (`h5-m2-cutover-concurrency.test.mjs`) | Registreringen af T (§9.1) er append-only og bliver stående: den dokumenterer, at cutover fandt sted. En senere ny cutover kræver en ny, gennemgået kontrakt |

**Efter første skrevne forsøg** er historikken produktionsdata. Ingen rollback må slette den. Fejl rettes fremad med en ny, gennemgået migration.

## 11. Kendt tilstand og risici (2026-11-04)

**Readiness mod produktionen, 2026-11-04** (hele filen, uændret, read-only via `execute_sql`; Lærlig-guarden godkendte den som ren læsning):

| Fase | Resultat | Matcher §4 "Før A1" |
|---|---|---|
| `PRE-01`…`PRE-06` | Alle true. G1-krop `2e05e769…`. `release_open_question_outside` har D-316-kroppen `b80c1c78…`. G2-værnet `e5627de1…` findes præcis som gennemgået. Ingen ukendte skrivere. `question_attempts` findes ikke | Ja |
| `BOOT-*`, `ALIGN-*`, `D327-01`, `K1-*` | Alle false (objekterne findes ikke) | Ja |
| `CUT-01` | false: `runtime=authenticator→service_role, service_role→service_role; PUBLIC=false; øvrige roller=service_role; kaldere=0; afhængige=0; authenticator=findes`. Kørt read-only 2026-11-04, kun `CUT-01`-logikken, efter udvidelsen i §9.2 | Ja |
| `LED-01` / `LED-02` | true ("ingen" af kæden i ledgeren; den oprindelige H5-fil er ikke anvendt) | Ja |
| `SEC-01` / `SEC-02` | false (policyen "Students can insert own events"; TRUNCATE for anon og authenticated på alle tre tabeller) | Separat spor |

**Genkontrol 2026-11-05 (read-only):** A1–A3 er anvendt (bootstrap `20261104095423`, alignment `20261104140659`, D-327 `20261104163310`); K1 er **ikke** anvendt; `question_attempts` er tom; `answer_path_cutovers` findes ikke; legacy-ACL er uændret `{postgres=X/postgres,service_role=X/postgres}`; ingen andre kaldere; 1 cron-job uden legacy-kald. Deployet: `process-event` v34 og `get-next-question` v181 (inaktiv R2-canary, stadig uden `round_no`). Seneste migration i ledgeren er `minigame_breaks` (`20261105060103`, andet spor).

**Konklusion (2026-11-04):** De databasemæssige forudsætninger for A1 er opfyldt. Følgende blokerer en samlet aktivering:
1. Beslutningerne B1–B4 (§1.1) er ikke truffet.
2. Den deployede `get-next-question` v180 sender ikke `round_no` (§3). A8 kræver A5 først.
3. Kilden for `process-event` v34 og `get-next-question` v180 er ikke arkiveret til rollback (§2.3, §10).
4. M2 findes som Draft PR (§9.5), ikke merget og ikke anvendt; registreringen af T (§9.1) findes ikke.
5. Der har næsten ikke været elevtrafik, så observationen i A9 kan endnu ikke give evidens.

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
- låsetid og samtidighed under reel last (`lock_timeout` 5 s i K1). M2's dræn af igangværende legacy-kald (§9.3) er derfor testet mod PostgreSQL 17 med flere forbindelser i unit-CI (`h5-m2-cutover-concurrency.test.mjs`, §9.4 punkt 5). Det beviser mekanismen, ikke produktionens last eller Supabase-poolerens adfærd.
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
