# H5-bootstrap — tilbagerulning

Migration: `supabase/migrations/20261101190000_question_attempts_v2_bootstrap.sql` (H5 integration 1/2,
D-266/D-273), eventuelt efterfulgt af `20261101190100_question_attempts_v2_align_grading.sql`
(H5 integration 2/2).

**Status:** bootstrappen er IKKE ANVENDT I PRODUKTIONEN. Denne runbook er forberedt før anvendelsen,
så en tilbagerulning er klar og testet, hvis den bliver nødvendig.

## Hvornår tilbagerulningen er tilladt

- **Kun før H5-aktivering.** Aktivering betyder, at process-event's H5-vej er udrullet, og at klienten
  sender `round_no` og `submission_id` (`isH5SubmissionsEnabled()`). Efter aktivering er
  tilbagerulning forward-fix (D-273), ikke denne procedure.
- **Kun mens `question_attempts` er tom.** Blokken afbryder uden ændringer, hvis tabellen har mindst én
  række. Historik slettes aldrig.
- **Kun med ejerens særskilte godkendelse** (D-110). Kør blokken som ét `apply_migration`-kald, aldrig
  med `supabase db push`. Notér handlingen i `docs/operations/production-actions/` (D-313).

## Rækkefølge med senere migrationer

Senere migrationer i H5-sporet bygger på bootstrappens objekter og skal rulles tilbage først, hver med
sin egen godkendelse:

1. **K1** (`20261103110000`), hvis anvendt:
   [l1-k1-attempt-context-rollback.md](l1-k1-attempt-context-rollback.md). Det kræver først, at
   `K1_SERVED_SNAPSHOT` er slået fra og verificeret i den aktive Edge-udrulning.
2. **D-327** (`20261103100000`), hvis anvendt:
   [question-attempts-history-no-action-rollback.md](question-attempts-history-no-action-rollback.md).
3. **H5-alignment** (`20261101190100`) har ingen egen tilbagerulning. Den ændrer kun kroppen og EXECUTE
   på `process_question_attempt_v2`, som denne blok fjerner. Blokken accepterer både den oprindelige og
   den tilpassede krop.
4. **Denne blok.**

Blokken afviser selv at køre, hvis K1 eller D-327 stadig er anvendt. Den bruger aldrig `CASCADE` til at
fjerne noget, den ikke kender.

## Før (kun læsning)

```
SELECT count(*) FROM public.question_attempts;                         -- skal være 0
SELECT pid, state, now() - xact_start AS xact_age, wait_event_type
FROM pg_stat_activity
WHERE datname = current_database() AND pid <> pg_backend_pid() AND xact_start IS NOT NULL;  -- helst ingen
```

## Tilbagerulning

Blokken gør følgende, i denne rækkefølge, og enten det hele eller intet:

1. sætter `lock_timeout` til 5 sekunder (inde i blokken, så det gælder uanset værktøjets transaktion);
2. tæller de ni H5-objekter. Ingen af dem: databasen er allerede i før-H5-tilstanden, og blokken slutter
   med en NOTICE uden at ændre noget (genkørsel). Alle ni: den fortsætter. Alt andet: den afbryder;
3. afviser, hvis K1 eller D-327 er anvendt;
4. låser `question_instances` og `question_attempts` (ACCESS EXCLUSIVE). Kan låsene ikke fås inden for 5
   sekunder, afbryder den med `55P03`, og intet er ændret;
5. kontrollerer hvert H5-objekt præcis som bootstrappen opretter det: funktionskroppe (md5), SECURITY
   DEFINER, `search_path`, ejer, EXECUTE, kolonner, navngivne constraints, fremmednøgle med
   `ON DELETE CASCADE`, index, RLS uden policies, tabelrettigheder og triggere. På `question_instances`
   må der kun være rundevagten og D-290 G2's værn;
6. afviser ukendte afhængigheder: views og regler på `question_attempts`, fremmednøgler til
   `question_attempts` eller til `question_instances_id_student_id_key`, publikationer, og funktioner, der
   nævner H5-objekterne i deres krop. Den eneste kendte undtagelse er D-316's
   `release_open_question_outside` med præcis den gennemgåede krop (md5 `b80c1c78…`). Dens historikværn
   slår `question_attempts` op ved navn og virker både med og uden H5;
7. afviser, hvis `question_attempts` har mindst én række;
8. fjerner objekterne uden `CASCADE`: de to _v2-funktioner, rundevagt-triggeren, `question_attempts`
   (med sin egen trigger, sit index og sine constraints), de to triggerfunktioner og den unikke nøgle
   `question_instances_id_student_id_key`;
9. kontrollerer bagefter, at alle ni objekter er væk, at G2's værn er uændret, og at antallet af
   `question_instances`-rækker er det samme.

Ingen række i `question_instances`, `student_answers`, `student_progress` eller andre elevtabeller
skrives eller slettes. Den unikke nøgle `(id, student_id)` er overflødig, fordi `id` er primærnøglen, så
at fjerne den ændrer ingen data.

```sql
-- ROLLBACK H5 BOOTSTRAP — removes the H5 schema that 20261101190000 (and 20261101190100) created, before
-- H5 activation and only while question_attempts is empty. One statement (one DO block): all or nothing,
-- whatever the runner does; lock_timeout inside it. Re-running it on the pre-H5 schema changes nothing.
DO $h5_rollback$
DECLARE
  v_qa      oid := to_regclass('public.question_attempts');
  v_qi      oid := 'public.question_instances'::regclass;
  v_mc      oid := to_regprocedure('public.process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text)');
  v_text    oid := to_regprocedure('public.process_text_answer_v2(uuid,uuid,text,boolean,integer,uuid,text,text)');
  v_reject  oid := to_regprocedure('public.question_attempts_reject_update()');
  v_guard   oid := to_regprocedure('public.question_instances_round_guard()');
  v_owner   oid := (SELECT proowner FROM pg_catalog.pg_proc
                    WHERE oid = to_regprocedure('public.process_question_attempt(uuid,uuid,text,bigint)'));
  v_present integer;
  v_g2      oid;
  v_g2_def  text;
  v_key_idx oid;
  v_mc_md5  text;
  v_rows    bigint;
  v_qi_rows bigint;
  v_txt     text;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  -- 2. Which state? (The same nine objects the bootstrap counts.)
  SELECT (v_qa IS NOT NULL)::int
       + (to_regclass('public.question_attempts_student_answered_idx') IS NOT NULL)::int
       + (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
                  WHERE conname = 'question_instances_id_student_id_key' AND conrelid = v_qi))::int
       + (v_reject IS NOT NULL)::int + (v_guard IS NOT NULL)::int
       + (v_mc IS NOT NULL)::int + (v_text IS NOT NULL)::int
       + (EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname = 'question_attempts_append_only' AND NOT tgisinternal))::int
       + (EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname = 'question_instances_round_guard' AND tgrelid = v_qi))::int
  INTO v_present;

  -- 3. Later migrations of the H5 track must be rolled back first (checked before the state branch, so a
  -- K1 database — whose 7-argument _v2 no longer exists — gets this message, not "partial").
  IF to_regprocedure('public.process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text,text,integer)') IS NOT NULL
     OR to_regprocedure('public.process_text_answer_v2(uuid,uuid,text,boolean,integer,uuid,text,text,text,integer)') IS NOT NULL
     OR to_regprocedure('public.question_instances_served_snapshot()') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_attribute
                WHERE attrelid = v_qi AND attnum > 0 AND NOT attisdropped
                  AND attname IN ('served_snapshot', 'served_content_sha256', 'served_at'))
     OR (v_qa IS NOT NULL AND EXISTS (SELECT 1 FROM pg_catalog.pg_attribute
                WHERE attrelid = v_qa AND attnum > 0 AND NOT attisdropped
                  AND attname IN ('mode', 'hints_used', 'server_interval_ms', 'objective_ids',
                                  'objective_mapping_version', 'question_content_sha256'))) THEN
    RAISE EXCEPTION 'ROLLBACK H5 BOOTSTRAP: L1 K1 (20261103110000) er anvendt — rul K1 tilbage først; intet ændret';
  END IF;
  IF v_qa IS NOT NULL AND EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
                                  WHERE conname = 'question_attempts_instance_fkey' AND conrelid = v_qa
                                    AND confdeltype <> 'c') THEN
    RAISE EXCEPTION 'ROLLBACK H5 BOOTSTRAP: D-327 (20261103100000) er anvendt — rul D-327 tilbage først; intet ændret';
  END IF;

  IF v_present = 0 THEN
    RAISE NOTICE 'ROLLBACK H5 BOOTSTRAP: databasen er allerede i før-H5-tilstanden — intet ændret';
    RETURN;
  ELSIF v_present <> 9 THEN
    RAISE EXCEPTION 'ROLLBACK H5 BOOTSTRAP: H5-skemaet findes kun delvist (% af 9 objekter) — ukendt tilstand; intet ændret', v_present;
  END IF;

  -- 4. The locks first: no attempt can be written, and no object changed, between the checks and the drops.
  LOCK TABLE public.question_instances, public.question_attempts IN ACCESS EXCLUSIVE MODE;

  -- 5. Every H5 object exactly as the bootstrap creates it.
  SELECT md5(prosrc) INTO v_mc_md5 FROM pg_catalog.pg_proc WHERE oid = v_mc;
  IF v_mc_md5 NOT IN ('943d03820fe4756f5a72c6f0a5d77d7d', '8a7696147df978e250918b2c93e20577')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc WHERE oid = v_mc AND prosecdef AND proconfig = ARRAY['search_path=""'])
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc WHERE oid = v_text AND md5(prosrc) = 'f880984680d52b20d07c628a9dfae474'
                      AND prosecdef AND proconfig = ARRAY['search_path=""'])
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc WHERE oid = v_reject AND md5(prosrc) = '3910dd2d931eca0309ee82b303bb3cd8'
                      AND NOT prosecdef AND proconfig = ARRAY['search_path=""'])
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc WHERE oid = v_guard AND md5(prosrc) = 'c557309ad7e8853c6aa0af555e282246'
                      AND NOT prosecdef AND proconfig = ARRAY['search_path=""']) THEN
    RAISE EXCEPTION 'ROLLBACK H5 BOOTSTRAP: en H5-funktion har ikke bootstrappens eller alignmentens krop, SECURITY DEFINER eller search_path; intet ændret';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc WHERE oid IN (v_mc, v_text, v_reject, v_guard) AND proowner IS DISTINCT FROM v_owner)
     OR (SELECT relowner FROM pg_catalog.pg_class WHERE oid = v_qa) IS DISTINCT FROM (SELECT relowner FROM pg_catalog.pg_class WHERE oid = v_qi) THEN
    RAISE EXCEPTION 'ROLLBACK H5 BOOTSTRAP: H5-objekterne ejes ikke af svarvejens ejer; intet ændret';
  END IF;
  -- EXECUTE: process_text_answer_v2 for service_role; process_question_attempt_v2 for service_role exactly
  -- when it has the aligned body; the trigger functions for no API role; nothing for PUBLIC/anon/authenticated.
  IF NOT has_function_privilege('service_role', v_text, 'EXECUTE')
     OR has_function_privilege('service_role', v_mc, 'EXECUTE') IS DISTINCT FROM (v_mc_md5 = '8a7696147df978e250918b2c93e20577')
     OR has_function_privilege('service_role', v_reject, 'EXECUTE') OR has_function_privilege('service_role', v_guard, 'EXECUTE')
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p, unnest(coalesce(p.proacl::text[], ARRAY['=X/null'])) a
                WHERE p.oid IN (v_mc, v_text, v_reject, v_guard)
                  AND (a LIKE '=%' OR a LIKE 'anon=%' OR a LIKE 'authenticated=%')) THEN
    RAISE EXCEPTION 'ROLLBACK H5 BOOTSTRAP: EXECUTE på H5-funktionerne er ikke som forventet; intet ændret';
  END IF;
  SELECT string_agg(format('%s %s %s', a.attname, format_type(a.atttypid, a.atttypmod), a.attnotnull::text), ', ' ORDER BY a.attnum)
    INTO v_txt FROM pg_catalog.pg_attribute a WHERE a.attrelid = v_qa AND a.attnum > 0 AND NOT a.attisdropped;
  IF v_txt IS DISTINCT FROM 'id uuid true, question_instance_id uuid true, student_id uuid true, attempt_no integer true, submission_id uuid true, grading text true, status text true, was_correct boolean false, user_answer text true, answer_format text true, answer_type text true, is_repeat boolean true, correct_answer_shown text false, review_text_shown text false, misconception_type_shown text false, answered_at timestamp with time zone true, xp_awarded integer true, coins_awarded integer true, source text true, created_at timestamp with time zone true' THEN
    RAISE EXCEPTION 'ROLLBACK H5 BOOTSTRAP: question_attempts har ikke bootstrappens kolonner (%); intet ændret', v_txt;
  END IF;
  SELECT string_agg(conname::text || ':' || contype::text, ' ' ORDER BY conname) INTO v_txt
    FROM pg_catalog.pg_constraint WHERE conrelid = v_qa AND contype IN ('p', 'u', 'f', 'c');
  IF v_txt IS DISTINCT FROM 'question_attempts_attempt_no_check:c question_attempts_coins_awarded_check:c question_attempts_grading_check:c question_attempts_instance_fkey:f question_attempts_pkey:p question_attempts_result_check:c question_attempts_round_key:u question_attempts_source_check:c question_attempts_student_id_fkey:f question_attempts_submission_key:u question_attempts_xp_awarded_check:c' THEN
    RAISE EXCEPTION 'ROLLBACK H5 BOOTSTRAP: question_attempts har ikke bootstrappens constraints (%); intet ændret', v_txt;
  END IF;
  SELECT conindid INTO v_key_idx FROM pg_catalog.pg_constraint
   WHERE conname = 'question_instances_id_student_id_key' AND conrelid = v_qi AND contype = 'u';
  IF v_key_idx IS NULL OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
       WHERE conname = 'question_attempts_instance_fkey' AND conrelid = v_qa AND confrelid = v_qi
         AND confdeltype = 'c' AND conindid = v_key_idx) THEN
    RAISE EXCEPTION 'ROLLBACK H5 BOOTSTRAP: question_attempts_instance_fkey eller question_instances_id_student_id_key er ikke som bootstrappen oprettede dem; intet ændret';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class ic ON ic.oid = i.indexrelid
                 WHERE ic.relname = 'question_attempts_student_answered_idx' AND i.indrelid = v_qa) THEN
    RAISE EXCEPTION 'ROLLBACK H5 BOOTSTRAP: question_attempts_student_answered_idx mangler; intet ændret';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = v_qa)
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid = v_qa)
     OR NOT has_table_privilege('service_role', v_qa, 'SELECT')
     OR has_table_privilege('service_role', v_qa, 'INSERT, UPDATE, DELETE, TRUNCATE')
     OR has_table_privilege('authenticated', v_qa, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE')
     OR has_table_privilege('anon', v_qa, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE') THEN
    RAISE EXCEPTION 'ROLLBACK H5 BOOTSTRAP: RLS, policies eller rettigheder på question_attempts er ikke som forventet; intet ændret';
  END IF;
  -- Triggers: on question_attempts only the append-only trigger; on question_instances only the round guard
  -- and, if present, D-290 G2's guard (kept, and compared unchanged afterwards).
  SELECT oid, pg_get_triggerdef(oid) INTO v_g2, v_g2_def FROM pg_catalog.pg_trigger
   WHERE tgrelid = v_qi AND tgname = 'open_round_requires_active_question' AND NOT tgisinternal;
  IF (SELECT count(*) FROM pg_catalog.pg_trigger WHERE tgrelid = v_qa AND NOT tgisinternal) <> 1
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid = v_qa AND tgname = 'question_attempts_append_only'
                      AND tgfoid = v_reject AND tgtype = 19 AND tgenabled = 'O')
     OR (SELECT count(*) FROM pg_catalog.pg_trigger WHERE tgrelid = v_qi AND NOT tgisinternal AND oid IS DISTINCT FROM v_g2) <> 1
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t WHERE t.tgrelid = v_qi AND t.tgname = 'question_instances_round_guard'
                      AND t.tgfoid = v_guard AND t.tgtype = 19 AND t.tgenabled = 'O'
                      AND (SELECT array_agg(a.attname ORDER BY a.attname) FROM unnest(t.tgattr::int2[]) k(attnum)
                           JOIN pg_catalog.pg_attribute a ON a.attrelid = t.tgrelid AND a.attnum = k.attnum) = ARRAY['answered', 'repeat_count']::name[])
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgfoid IN (v_reject, v_guard)
                  AND tgname NOT IN ('question_attempts_append_only', 'question_instances_round_guard')) THEN
    RAISE EXCEPTION 'ROLLBACK H5 BOOTSTRAP: triggerne på question_attempts og question_instances er ikke præcis H5''s (og G2''s); intet ændret';
  END IF;

  -- 6. Unknown dependencies: nothing may be removed implicitly, and nothing that uses H5 may be left behind.
  -- The one known reader is D-316's release_open_question_outside (md5 b80c1c78…): its history guard looks
  -- question_attempts up by name (to_regclass + dynamic SQL) and works with and without H5, so exactly
  -- that reviewed body is allowed; any other body naming H5 objects is refused.
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_depend d JOIN pg_catalog.pg_rewrite r ON d.classid = 'pg_catalog.pg_rewrite'::regclass AND d.objid = r.oid
             WHERE d.refobjid = v_qa AND r.ev_class <> v_qa)
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_rewrite WHERE ev_class = v_qa)
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE confrelid = v_qa)
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE contype = 'f' AND conindid = v_key_idx AND conrelid <> v_qa)
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_publication_rel WHERE prrelid = v_qa)
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
                  AND p.oid NOT IN (v_mc, v_text, v_reject, v_guard)
                  AND NOT (p.oid = to_regprocedure('public.release_open_question_outside(text[])')
                           AND md5(p.prosrc) = 'b80c1c7857ecc90bdbd7b6175b65c78f')
                  AND p.prosrc ~* '(question_attempts|process_question_attempt_v2|process_text_answer_v2|question_instances_round_guard|question_instances_id_student_id_key)') THEN
    RAISE EXCEPTION 'ROLLBACK H5 BOOTSTRAP: et ukendt objekt afhænger af H5-skemaet (view, regel, fremmednøgle, publikation eller funktion); intet ændret';
  END IF;

  -- 7. History is never deleted.
  SELECT count(*) INTO v_rows FROM public.question_attempts;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'ROLLBACK H5 BOOTSTRAP: question_attempts har % række(r) — historik slettes ikke; intet ændret', v_rows;
  END IF;
  SELECT count(*) INTO v_qi_rows FROM public.question_instances;

  -- 8. The drops, without CASCADE (the table takes only its own trigger, index and constraints with it).
  EXECUTE $h5_rb_ddl$DROP FUNCTION public.process_question_attempt_v2(uuid, uuid, text, integer, uuid, text, text)$h5_rb_ddl$;
  EXECUTE $h5_rb_ddl$DROP FUNCTION public.process_text_answer_v2(uuid, uuid, text, boolean, integer, uuid, text, text)$h5_rb_ddl$;
  EXECUTE $h5_rb_ddl$DROP TRIGGER question_instances_round_guard ON public.question_instances$h5_rb_ddl$;
  EXECUTE $h5_rb_ddl$DROP TABLE public.question_attempts$h5_rb_ddl$;
  EXECUTE $h5_rb_ddl$DROP FUNCTION public.question_attempts_reject_update()$h5_rb_ddl$;
  EXECUTE $h5_rb_ddl$DROP FUNCTION public.question_instances_round_guard()$h5_rb_ddl$;
  EXECUTE $h5_rb_ddl$ALTER TABLE public.question_instances DROP CONSTRAINT question_instances_id_student_id_key$h5_rb_ddl$;

  -- 9. After: every H5 object gone, G2's guard unchanged, no question_instances row touched.
  IF to_regclass('public.question_attempts') IS NOT NULL
     OR to_regclass('public.question_attempts_student_answered_idx') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conname = 'question_instances_id_student_id_key')
     OR to_regprocedure('public.question_attempts_reject_update()') IS NOT NULL
     OR to_regprocedure('public.question_instances_round_guard()') IS NOT NULL
     OR to_regprocedure('public.process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text)') IS NOT NULL
     OR to_regprocedure('public.process_text_answer_v2(uuid,uuid,text,boolean,integer,uuid,text,text)') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname IN ('question_attempts_append_only', 'question_instances_round_guard'))
     OR (SELECT pg_get_triggerdef(oid) FROM pg_catalog.pg_trigger
          WHERE tgrelid = v_qi AND tgname = 'open_round_requires_active_question' AND NOT tgisinternal) IS DISTINCT FROM v_g2_def
     OR (SELECT count(*) FROM public.question_instances) <> v_qi_rows THEN
    RAISE EXCEPTION 'ROLLBACK H5 BOOTSTRAP: efterkontrollen fejlede; intet ændret';
  END IF;
  RAISE NOTICE 'ROLLBACK H5 BOOTSTRAP: H5-skemaet er fjernet; % question_instances-rækker uændret', v_qi_rows;
END
$h5_rollback$;
```

## Efterkontrol (kun læsning)

- `to_regclass('public.question_attempts')` er `NULL`, og `process_question_attempt_v2` og
  `process_text_answer_v2` findes ikke.
- `question_instances` har kun D-290 G2's trigger `open_round_requires_active_question`.
- Antallet af rækker i `question_instances` og `student_answers` er det samme som før.
- Notér handlingen i `docs/operations/production-actions/` (D-313), og flyt bootstrappen (og alignment,
  hvis den var anvendt) tilbage til `NOT_IN_PRODUCTION` i `tests/isolated/schema/replay-plan.mjs`.

## Fejl og genkørsel

- **Enhver fejl** — en vagt, en lås, der ikke kan fås (`55P03`), eller en fejl midt i fjernelsen — ruller
  hele blokken tilbage. Intet er ændret, og der er intet at rydde op. Find årsagen, og kør blokken igen
  med en ny godkendelse. Der sker ingen automatisk gentagelse.
- **`55P03 lock timeout`:** en anden transaktion holder en lås på `question_instances` eller
  `question_attempts`. Find den med `pg_stat_activity`, og prøv igen på et roligere tidspunkt.
- **Genkørsel efter en vellykket tilbagerulning** ændrer intet og slutter med NOTICE'en om
  før-H5-tilstanden.
- **Bagefter** kan bootstrappen og alignment anvendes igen, uændrede, hver med sin egen godkendelse.

## Bevis

`tests/unit/question-attempts-v2-bootstrap-rollback.test.mjs`. Testen kører på PostgreSQL 17.6 i CI
(`LEVEL_ENGINE_PG_URL`, `LEVEL_ENGINE_PG_REQUIRED=1`) og på PGlite lokalt. Den læser SQL-blokken fra
denne fil og viser:

- tilbagerulning efter bootstrap alene og efter bootstrap og alignment, med præcis genetablering af
  før-H5-skemaet;
- at elevdata er uændrede;
- afvisning uden ændringer ved forsøg i `question_attempts`, ved K1, ved D-327, ved et ukendt view, en
  ukendt trigger, en ukendt funktion og et delvist skema;
- kontrolleret timeout ved en konkurrerende lås (kun PostgreSQL);
- fuldstændig atomisk tilbagerulning ved en fejl midt i fjernelsen;
- uændret genkørsel;
- at bootstrap og alignment kan anvendes igen bagefter.
