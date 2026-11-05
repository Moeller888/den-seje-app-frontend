# H5 M2 — tilbageførsel og fejlhåndtering ved cutover

Migrationer:
- `supabase/migrations/20261105180000_h5_m2_close_legacy_answer_path.sql`: transaktion 1, **luk**;
- `supabase/migrations/20261105180100_h5_m2_register_cutover.sql`: transaktion 2, **dræn og registrér T**.

Procedure og kriterier står i `docs/operations/h5-k1-activation-runbook.md` §9. Hver handling her er
en **særskilt produktionshandling** med ejerens særskilte GO. Den køres som ét `apply_migration`-kald
(D-110); `supabase db push` er forbudt. **Ingen tilbageførsel sletter elevsvar.**

## 1. Fire forskellige handlinger — de må ikke blandes sammen

| Handling | Hvad den gør | Hvad den ikke gør |
|---|---|---|
| **Genåbne den gamle svarvej** (R1 nedenfor) | `GRANT EXECUTE` på de to legacy-funktioner **kun til `service_role`**. Gamle klienter kan svare igen via legacy-vejen | Rører hverken `question_attempts`, `answer_path_cutovers` eller nogen funktionskrop |
| **Deaktivere ny funktionalitet** | `ENABLE_H5_SUBMISSIONS = false` i frontenden (egen PR/merge) og evt. `K1_SERVED_SNAPSHOT` slået fra | Ændrer intet i databasen. **Efter transaktion 1 må det kun ske EFTER R1**, ellers har eleverne ingen svarvej (legacy er lukket, H5 er slået fra) |
| **Genskabe databaseobjekter** | Ikke en del af M2. Legacy-funktionerne **droppes og genoprettes aldrig** (produktionens standardrettigheder ville give `anon`, `authenticated`, `service_role` og `PUBLIC` adgang igen, runbook §9.2). `answer_path_cutovers` droppes aldrig | — |
| **Bevare registreret svarhistorik** | Altid. `question_attempts` og `answer_path_cutovers` er append-only. Ingen tilbageførsel her skriver, ændrer eller sletter rækker i `question_attempts`, `question_instances`, `student_answers` eller `student_progress` | — |

## 2. Fejl undervejs — tilstand og næste skridt

| Situation | Tilstand bagefter | Readiness | Næste skridt |
|---|---|---|---|
| Transaktion 1 afvises af sin vagt (fx K1 mangler, tom `question_attempts`, kaldere, afhængige, cron-job, medlemskab af ejeren) | **Uændret.** Legacy-vejen er åben som før | `CUT-01` = false | Find årsagen i fejlteksten. Intet at rulle tilbage. Nyt forsøg kræver nyt GO |
| Transaktion 1 fejler på `lock_timeout` (5 s) | Uændret | `CUT-01` = false | Gentag senere med nyt GO |
| Transaktion 1 committet; transaktion 2 endnu ikke kørt | **Lukket, T mangler.** H5 virker; gamle klienter får 426 | `CUT-01` = true, `CUT-02` = false: **NO-GO**, M2 er ikke gennemført | Kør transaktion 2 hurtigst muligt, men som særskilt trin |
| Transaktion 2 afvises: legacy er ikke lukket | Uændret; intet registreret | `CUT-02` = NULL/false | Transaktion 1 er ikke committet. Kør den først |
| Transaktion 2 afvises: synlighed (`pg_read_all_stats` mangler, eller en klientsession er skjult) | Lukket, T mangler | som ovenfor | Kør som `postgres` (medlem af `pg_read_all_stats` i produktionen). Aldrig omgå kontrollen |
| Transaktion 2 rammer **tidsgrænsen (30 s)** | Lukket, T mangler. Fejlteksten viser pid, rolle, tilstand og alder for de åbne transaktioner (aldrig forespørgselstekst) | som ovenfor | Undersøg sessionerne read-only (`pg_stat_activity`). Afbryd **ikke** automatisk. Når de er afsluttet: kør transaktion 2 igen (den er sikker at gentage). Alternativt R1, hvis M2 skal opgives |
| Transaktion 2 lykkes | Lukket, T registreret | `CUT-01` = `CUT-02` = `CUT-T` = true | Runbook §8 blok 2: INT-B = 0 |
| Transaktion 2 køres igen efter succes | Uændret (T flyttes eller dubleres aldrig) | — | Intet |

## 3. R1 — genåbn den gamle svarvej (efter transaktion 1, med eller uden transaktion 2)

Kun hvis H5-vejen ikke virker, og elever ellers ikke kan svare. Dette er genåbning, **ikke** genskabelse:
`answer_path_cutovers` bliver stående og dokumenterer, at cutover fandt sted. Efter R1 er runbook §8
blok 2 (INT-B) ikke længere et nul-kriterium: hvert legacy-svar efter T tæller dér, og det er
korrekt, fordi de faktisk er skrevet uden om loggen.

```sql
-- ROLLBACK H5 M2 R1: reopen the legacy answer path for service_role ONLY (never PUBLIC, anon, authenticated)
DO $r1$
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  IF to_regprocedure('public.process_question_attempt(uuid,uuid,text,bigint)') IS NULL
     OR to_regprocedure('public.process_text_answer(uuid,uuid,text,boolean)') IS NULL THEN
    RAISE EXCEPTION 'R1: legacy-funktionerne findes ikke; intet ændret';
  END IF;
  GRANT EXECUTE ON FUNCTION public.process_question_attempt(uuid,uuid,text,bigint) TO service_role;
  GRANT EXECUTE ON FUNCTION public.process_text_answer(uuid,uuid,text,boolean) TO service_role;
  IF has_function_privilege('anon', 'public.process_question_attempt(uuid,uuid,text,bigint)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.process_question_attempt(uuid,uuid,text,bigint)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.process_text_answer(uuid,uuid,text,boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.process_text_answer(uuid,uuid,text,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'R1: anon eller authenticated ville kunne udføre legacy-funktionerne; alt rulles tilbage';
  END IF;
END
$r1$;
```

**Efter R1:**
- readiness `CUT-01` = false (`runtime=…service_role…`); `CUT-02` viser "M2 ikke udført — ikke relevant", selv om
  registreringen findes. Det er forventet: tabellen er stadig dokumentationen for den tidligere cutover;
- produktionsloggen skal angive tidspunktet for R1, så legacy-svar efter det kan forklares;
- en ny lukning kører transaktion 1 igen. Transaktion 2 registrerer **ikke** et nyt T (rækken findes);
  en ny cutover kræver en ny, gennemgået kontrakt (runbook §10).

## 4. Hvad aldrig er en tilbageførsel

- `DROP`/`CREATE` af legacy-funktionerne eller af `answer_path_cutovers`;
- `GRANT … TO PUBLIC, anon, authenticated`;
- `DELETE`/`UPDATE`/`TRUNCATE` på `question_attempts` eller `answer_path_cutovers`
  (triggerne afviser det; at omgå dem er forbudt);
- `pg_terminate_backend`/`pg_cancel_backend` på elevsessioner for at få transaktion 2 igennem;
- at slå H5 fra i frontenden, mens legacy-vejen er lukket.

## 5. Afprøvning

`tests/unit/h5-m2-cutover-migration-run.test.mjs` (PGlite) kører R1-blokken ovenfor uændret.
`tests/unit/h5-m2-cutover-concurrency.test.mjs` (PostgreSQL 17) kører tidsgrænsen, fortsættelsen efter
den og R1 med flere forbindelser.
