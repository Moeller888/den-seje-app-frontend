-- ============================================================================
-- H5/K1 readiness- og integritetskontroller (READ-ONLY)
--
-- Brug: én SELECT-sætning. Kør den, som den står (fx via Supabase-MCP execute_sql eller psql), før og
-- efter hvert trin i docs/operations/h5-k1-activation-runbook.md. Den ændrer intet:
--   * kun SELECT og læsning af systemkataloger (pg_proc, pg_class, pg_constraint, pg_trigger,
--     pg_attribute, pg_policy) og privilegiefunktioner (has_*_privilege);
--   * tabellen public.question_attempts nævnes aldrig direkte: alt om den slås op i kataloget via
--     to_regclass, så filen kan køres, før den findes. Antallet af rækker er et ESTIMAT fra
--     statistikken (pg_stat_get_live_tuples) — K1-migrationen kontrollerer selv atomart, at tabellen er
--     tom. Præcise integritetstal efter aktivering står i runbookens §8 (kræver, at tabellen findes);
--   * supabase_migrations.schema_migrations (findes i alle Supabase-databaser) læses direkte;
--   * kun funktioner fra Lærlig-guardens tilladelsesliste for execute_sql (ingen query_to_xml, xpath,
--     set_config m.m.), så filen kan køres read-only gennem Supabase-MCP;
--   * ingen funktion med sideeffekter kaldes; ingen elevdata, svar, tokens eller id'er udskrives —
--     kun antal.
--   tests/unit/h5-k1-readiness-checks.test.mjs beviser, at databasens fingeraftryk og alle rækketal er
--   uændrede efter kørsel, og afviser enhver skrivende sætning i filen.
--
-- Kontrakt pr. række: check_id, phase, expected, actual, ok
--   ok = true   betingelsen er opfyldt
--   ok = false  betingelsen er ikke opfyldt (blokerer, hvis runbookens gate kræver den)
--   ok = NULL   kun information (fx estimeret antal forsøg); afgøres i runbookens manuelle kontroller.
--
-- Faser (rækkefølgen i produktionen er bindende, D-327 / PR #536):
--   pre       forudsætninger før H5-bootstrap (G1, de syv fastlåste funktionskroppe, G2-værnet)
--   boot      20261101190000_question_attempts_v2_bootstrap.sql er anvendt (H5-skemaet findes)
--   align     20261101190100_question_attempts_v2_align_grading.sql er anvendt
--   d327      20261103100000_question_attempts_history_no_action.sql er anvendt
--   k1        20261103110000_l1_k1_attempt_context.sql er anvendt
--   cutover   M2: service_role har mistet EXECUTE på de to legacy-svarfunktioner (IKKE implementeret
--             endnu — design §PR 5, D-273)
--   integrity estimeret antal forsøg (præcise integritetskontroller: runbook §8)
--   ledger    supabase_migrations.schema_migrations
--   security  separat sikkerhedsspor (R6/R7 i P0-auditten) — blokerer ikke aktiveringen
-- En kontrol for et tidligere trin forbliver ok = true, når et senere trin har erstattet objektet
-- med den gennemgåede efterfølger (fx align-kroppen erstattet af K1-kroppen).
--
-- Forventede værdier er kopieret fra migrationernes egne for- og efterkontroller, ikke opfundet:
--   20261101190000 l. 101-108 (de syv kroppe), l. 166 (G2), l. 683-687 (H5-kroppe), l. 738/744
--   (kolonner/constraints); 20261101190100 l. 306 (align-krop); 20261103110000 l. 664-666 (K1-kroppe).
-- ============================================================================
WITH
fn AS (
  SELECT v.k, v.sig, to_regprocedure(v.sig) AS oid,
         (SELECT md5(p.prosrc) FROM pg_catalog.pg_proc p WHERE p.oid = to_regprocedure(v.sig)) AS md5,
         (SELECT p.prosecdef FROM pg_catalog.pg_proc p WHERE p.oid = to_regprocedure(v.sig)) AS definer
  FROM (VALUES
    ('pqa',      'public.process_question_attempt(uuid,uuid,text,bigint)'),
    ('pta',      'public.process_text_answer(uuid,uuid,text,boolean)'),
    ('release',  'public.release_open_question_outside(text[])'),
    ('rq',       'public.request_repeat_question(smallint,text[])'),
    ('rqs',      'public.request_repeat_question_for_student(uuid,smallint,text[])'),
    ('rqss',     'public.request_repeat_question_servable_for_student(uuid,smallint,text[])'),
    ('rql',      'public.request_repeat_level_question_for_student(uuid,text[])'),
    ('g2',       'public.guard_open_round_requires_active_question()'),
    ('reject',   'public.question_attempts_reject_update()'),
    ('guard',    'public.question_instances_round_guard()'),
    ('mc7',      'public.process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text)'),
    ('tx8',      'public.process_text_answer_v2(uuid,uuid,text,boolean,integer,uuid,text,text)'),
    ('mc9',      'public.process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text,text,integer)'),
    ('tx10',     'public.process_text_answer_v2(uuid,uuid,text,boolean,integer,uuid,text,text,text,integer)'),
    ('snap',     'public.question_instances_served_snapshot()')
  ) AS v(k, sig)
),
f AS (
  SELECT
    max(md5) FILTER (WHERE k = 'pqa')     AS pqa,     max(md5) FILTER (WHERE k = 'pta')     AS pta,
    max(md5) FILTER (WHERE k = 'release') AS release, max(md5) FILTER (WHERE k = 'rq')      AS rq,
    max(md5) FILTER (WHERE k = 'rqs')     AS rqs,     max(md5) FILTER (WHERE k = 'rqss')    AS rqss,
    max(md5) FILTER (WHERE k = 'rql')     AS rql,     max(md5) FILTER (WHERE k = 'g2')      AS g2,
    max(md5) FILTER (WHERE k = 'reject')  AS reject,  max(md5) FILTER (WHERE k = 'guard')   AS guard,
    max(md5) FILTER (WHERE k = 'mc7')     AS mc7,     max(md5) FILTER (WHERE k = 'tx8')     AS tx8,
    max(md5) FILTER (WHERE k = 'mc9')     AS mc9,     max(md5) FILTER (WHERE k = 'tx10')    AS tx10,
    max(md5) FILTER (WHERE k = 'snap')    AS snap,
    max(oid::oid) FILTER (WHERE k = 'mc7')  AS mc7_oid,  max(oid::oid) FILTER (WHERE k = 'tx8')  AS tx8_oid,
    max(oid::oid) FILTER (WHERE k = 'mc9')  AS mc9_oid,  max(oid::oid) FILTER (WHERE k = 'tx10') AS tx10_oid,
    max(oid::oid) FILTER (WHERE k = 'pqa')  AS pqa_oid,  max(oid::oid) FILTER (WHERE k = 'pta')  AS pta_oid,
    max(oid::oid) FILTER (WHERE k = 'snap') AS snap_oid, max(oid::oid) FILTER (WHERE k = 'reject') AS reject_oid,
    max(oid::oid) FILTER (WHERE k = 'guard') AS guard_oid,
    bool_and(definer) FILTER (WHERE k IN ('pqa','pta','release','rq','rqs','rqss')) AS six_definer,
    bool_or(definer)  FILTER (WHERE k = 'rql') AS rql_definer
  FROM fn
),
t AS (
  SELECT to_regclass('public.question_attempts') AS qa,
         to_regclass('public.question_instances') AS qi
),
s AS (
  SELECT
    f.*, t.*,
    -- stages, as the migrations' own final checks define them
    (f.mc9 = '439186fa94119fec02b8f282eb75dbbd' AND f.tx10 = '809675f9071eb2a62d1c9a9b2628bc84'
       AND f.snap = 'babbb196f07c4fb60e42ff9e917bf180') AS k1_bodies,
    (SELECT c.confdeltype FROM pg_catalog.pg_constraint c
      WHERE c.conname = 'question_attempts_instance_fkey' AND c.conrelid = t.qa) AS fk_del,
    -- a column that exists in public.question_attempts / question_instances
    (SELECT count(*) FROM pg_catalog.pg_attribute a WHERE a.attrelid = t.qa AND a.attnum > 0 AND NOT a.attisdropped
       AND a.attname IN ('mode','hints_used','server_interval_ms','objective_ids','objective_mapping_version','question_content_sha256')) AS k1_cols,
    (SELECT count(*) FROM pg_catalog.pg_attribute a WHERE a.attrelid = t.qi AND a.attnum > 0 AND NOT a.attisdropped
       AND a.attname IN ('served_snapshot','served_content_sha256','served_at')) AS served_cols,
    -- estimated live rows from the statistics (NULL while the table does not exist)
    CASE WHEN t.qa IS NULL THEN NULL ELSE pg_stat_get_live_tuples(t.qa) END AS qa_rows
  FROM f, t
)
SELECT check_id, phase, expected, actual, ok FROM (

-- ── pre: forudsætninger for H5-bootstrap ──────────────────────────────────────────────────────────
SELECT 'PRE-01' AS check_id, 'pre' AS phase,
       'process_question_attempt har D-290 G1-kroppen (md5 2e05e769…)' AS expected,
       coalesce(s.pqa, 'mangler') AS actual,
       s.pqa = '2e05e769a102f61ffef0ea4dd550c55b' AS ok, 1 AS ord FROM s
UNION ALL
SELECT 'PRE-02', 'pre', 'de øvrige seks fastlåste svar-/genåbningsfunktioner har de gennemgåede kroppe (release: før eller efter D-316)',
       concat_ws(' ', 'pta=' || coalesce(left(s.pta, 8), 'mangler'), 'release=' || coalesce(left(s.release, 8), 'mangler'),
                 'rq=' || coalesce(left(s.rq, 8), 'mangler'), 'rqs=' || coalesce(left(s.rqs, 8), 'mangler'),
                 'rqss=' || coalesce(left(s.rqss, 8), 'mangler'), 'rql=' || coalesce(left(s.rql, 8), 'mangler')),
       coalesce(s.pta = 'e80727ea87ffdc64988e5a09dcb20356'
         AND s.release IN ('7b7693b3bff869a113e8e97e16bb456a', 'b80c1c7857ecc90bdbd7b6175b65c78f')
         AND s.rq   = '54ab9354d309c014e94e902fd6f885f4'
         AND s.rqs  = '2ac19e786310b59051a44aed96b5bf46'
         AND s.rqss = '092555368551a096c29d6e60f58c17b1'
         AND s.rql  = 'db8280ddee20254e876be7fb1fc57e4d', false), 2 FROM s
UNION ALL
SELECT 'PRE-03', 'pre', 'seks som SECURITY DEFINER, request_repeat_level_question_for_student som INVOKER',
       'definer(6)=' || coalesce(s.six_definer::text, 'mangler') || ' level_definer=' || coalesce(s.rql_definer::text, 'mangler'),
       coalesce(s.six_definer AND NOT s.rql_definer, false), 3 FROM s
UNION ALL
SELECT 'PRE-04', 'pre', 'D-290 G2-værnet er fraværende eller præcis det gennemgåede (md5 e5627de1…)',
       coalesce(s.g2, 'fraværende'),
       s.g2 IS NULL OR s.g2 = 'e5627de108be67869a4615490a6857a2', 4 FROM s
UNION ALL
SELECT 'PRE-05', 'pre', 'ingen ukendt funktion opdaterer question_instances.answered/repeat_count',
       coalesce((SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY 1)
                   FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public'
                    AND p.prosrc ~* 'update\s+(public\.)?question_instances\M'
                    AND p.prosrc ~* '\m(answered|repeat_count)\M'
                    AND p.oid NOT IN (SELECT fn.oid FROM fn WHERE fn.oid IS NOT NULL
                                        AND fn.k IN ('pqa','pta','release','rq','rqs','rqss','rql','mc7','tx8','mc9','tx10'))), 'ingen'),
       NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'public'
                      AND p.prosrc ~* 'update\s+(public\.)?question_instances\M'
                      AND p.prosrc ~* '\m(answered|repeat_count)\M'
                      AND p.oid NOT IN (SELECT fn.oid FROM fn WHERE fn.oid IS NOT NULL
                                          AND fn.k IN ('pqa','pta','release','rq','rqs','rqss','rql','mc7','tx8','mc9','tx10'))), 5
UNION ALL
SELECT 'PRE-06', 'pre', 'question_attempts findes ikke, eller er tom ifølge statistikken (K1 kontrollerer selv atomart, at den er tom)',
       CASE WHEN s.qa IS NULL THEN 'findes ikke' ELSE s.qa_rows::text || ' rækker (estimat)' END,
       s.qa IS NULL OR s.qa_rows = 0, 6 FROM s

-- ── boot: H5-skemaet findes (bootstrap) ───────────────────────────────────────────────────────────
UNION ALL
SELECT 'BOOT-01', 'boot', 'public.question_attempts findes med RLS slået til og uden policies',
       CASE WHEN s.qa IS NULL THEN 'findes ikke'
            ELSE 'rls=' || (SELECT c.relrowsecurity::text FROM pg_catalog.pg_class c WHERE c.oid = s.qa)
                 || ' policies=' || (SELECT count(*) FROM pg_catalog.pg_policy p WHERE p.polrelid = s.qa)::text END,
       coalesce(s.qa IS NOT NULL
         AND (SELECT c.relrowsecurity FROM pg_catalog.pg_class c WHERE c.oid = s.qa)
         AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policy p WHERE p.polrelid = s.qa), false), 10 FROM s
UNION ALL
SELECT 'BOOT-02', 'boot', 'H5''s 20 kolonner findes med de gennemgåede typer og NOT NULL',
       CASE WHEN s.qa IS NULL THEN 'findes ikke' ELSE (
         SELECT count(*)::text || ' af 20' FROM pg_catalog.pg_attribute a
           JOIN (VALUES ('id','uuid',true),('question_instance_id','uuid',true),('student_id','uuid',true),
                        ('attempt_no','integer',true),('submission_id','uuid',true),('grading','text',true),
                        ('status','text',true),('was_correct','boolean',false),('user_answer','text',true),
                        ('answer_format','text',true),('answer_type','text',true),('is_repeat','boolean',true),
                        ('correct_answer_shown','text',false),('review_text_shown','text',false),
                        ('misconception_type_shown','text',false),('answered_at','timestamp with time zone',true),
                        ('xp_awarded','integer',true),('coins_awarded','integer',true),('source','text',true),
                        ('created_at','timestamp with time zone',true)) AS e(col, typ, nn)
             ON a.attname = e.col AND format_type(a.atttypid, a.atttypmod) = e.typ AND a.attnotnull = e.nn
          WHERE a.attrelid = s.qa AND a.attnum > 0 AND NOT a.attisdropped) END,
       coalesce(s.qa IS NOT NULL AND (
         SELECT count(*) FROM pg_catalog.pg_attribute a
           JOIN (VALUES ('id','uuid',true),('question_instance_id','uuid',true),('student_id','uuid',true),
                        ('attempt_no','integer',true),('submission_id','uuid',true),('grading','text',true),
                        ('status','text',true),('was_correct','boolean',false),('user_answer','text',true),
                        ('answer_format','text',true),('answer_type','text',true),('is_repeat','boolean',true),
                        ('correct_answer_shown','text',false),('review_text_shown','text',false),
                        ('misconception_type_shown','text',false),('answered_at','timestamp with time zone',true),
                        ('xp_awarded','integer',true),('coins_awarded','integer',true),('source','text',true),
                        ('created_at','timestamp with time zone',true)) AS e(col, typ, nn)
             ON a.attname = e.col AND format_type(a.atttypid, a.atttypmod) = e.typ AND a.attnotnull = e.nn
          WHERE a.attrelid = s.qa AND a.attnum > 0 AND NOT a.attisdropped) = 20, false), 11 FROM s
UNION ALL
SELECT 'BOOT-03', 'boot', 'de 11 navngivne constraints findes (unik runde og unik indsendelse)',
       CASE WHEN s.qa IS NULL THEN 'findes ikke' ELSE (
         SELECT count(*)::text || ' af 11' FROM pg_catalog.pg_constraint c
          WHERE c.conrelid = s.qa AND c.conname || ':' || c.contype::text IN (
            'question_attempts_attempt_no_check:c','question_attempts_coins_awarded_check:c','question_attempts_grading_check:c',
            'question_attempts_instance_fkey:f','question_attempts_pkey:p','question_attempts_result_check:c',
            'question_attempts_round_key:u','question_attempts_source_check:c','question_attempts_student_id_fkey:f',
            'question_attempts_submission_key:u','question_attempts_xp_awarded_check:c')) END,
       coalesce(s.qa IS NOT NULL AND (
         SELECT count(*) FROM pg_catalog.pg_constraint c
          WHERE c.conrelid = s.qa AND c.conname || ':' || c.contype::text IN (
            'question_attempts_attempt_no_check:c','question_attempts_coins_awarded_check:c','question_attempts_grading_check:c',
            'question_attempts_instance_fkey:f','question_attempts_pkey:p','question_attempts_result_check:c',
            'question_attempts_round_key:u','question_attempts_source_check:c','question_attempts_student_id_fkey:f',
            'question_attempts_submission_key:u','question_attempts_xp_awarded_check:c')) = 11, false), 12 FROM s
UNION ALL
SELECT 'BOOT-04', 'boot', 'question_attempts_instance_fkey peger på question_instances (id, student_id); question_instances_id_student_id_key findes',
       CASE WHEN s.qa IS NULL THEN 'findes ikke' ELSE
         'fkey=' || coalesce((SELECT pg_catalog.pg_get_constraintdef(c.oid) FROM pg_catalog.pg_constraint c
                               WHERE c.conname = 'question_attempts_instance_fkey' AND c.conrelid = s.qa), 'mangler')
         || ' unik=' || EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c WHERE c.conname = 'question_instances_id_student_id_key'
                                  AND c.conrelid = s.qi AND c.contype = 'u')::text END,
       coalesce(s.qa IS NOT NULL
         AND EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c
                      WHERE c.conname = 'question_attempts_instance_fkey' AND c.conrelid = s.qa AND c.confrelid = s.qi
                        AND (SELECT array_agg(a.attname ORDER BY k.n) FROM unnest(c.confkey) WITH ORDINALITY k(attnum, n)
                               JOIN pg_catalog.pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.attnum)
                            = ARRAY['id', 'student_id']::name[])
         AND EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c WHERE c.conname = 'question_instances_id_student_id_key'
                       AND c.conrelid = s.qi AND c.contype = 'u'), false), 13 FROM s
UNION ALL
SELECT 'BOOT-05', 'boot', 'append-only-trigger på question_attempts og rundevagt på question_instances (UPDATE OF answered, repeat_count), begge aktive',
       'append_only=' || EXISTS (SELECT 1 FROM pg_catalog.pg_trigger tg WHERE tg.tgname = 'question_attempts_append_only'
                                   AND tg.tgrelid = s.qa AND tg.tgenabled = 'O')::text
       || ' round_guard=' || EXISTS (SELECT 1 FROM pg_catalog.pg_trigger tg WHERE tg.tgname = 'question_instances_round_guard'
                                       AND tg.tgrelid = s.qi AND tg.tgenabled = 'O')::text,
       coalesce(s.reject = '3910dd2d931eca0309ee82b303bb3cd8' AND s.guard = 'c557309ad7e8853c6aa0af555e282246'
         AND EXISTS (SELECT 1 FROM pg_catalog.pg_trigger tg WHERE tg.tgname = 'question_attempts_append_only'
                       AND tg.tgrelid = s.qa AND tg.tgfoid = s.reject_oid AND tg.tgtype = 19 AND tg.tgenabled = 'O')
         AND EXISTS (SELECT 1 FROM pg_catalog.pg_trigger tg WHERE tg.tgname = 'question_instances_round_guard'
                       AND tg.tgrelid = s.qi AND tg.tgfoid = s.guard_oid AND tg.tgtype = 19 AND tg.tgenabled = 'O'
                       AND (SELECT array_agg(a.attname ORDER BY a.attname) FROM unnest(tg.tgattr::int2[]) k(attnum)
                              JOIN pg_catalog.pg_attribute a ON a.attrelid = tg.tgrelid AND a.attnum = k.attnum)
                           = ARRAY['answered', 'repeat_count']::name[]), false), 14 FROM s
UNION ALL
SELECT 'BOOT-06', 'boot', 'tabelrettigheder: service_role kun SELECT; anon og authenticated ingen',
       CASE WHEN s.qa IS NULL THEN 'findes ikke' ELSE
         'service_role SELECT=' || has_table_privilege('service_role', s.qa, 'SELECT')::text
         || ' service_role skriv=' || has_table_privilege('service_role', s.qa, 'INSERT, UPDATE, DELETE, TRUNCATE')::text
         || ' authenticated=' || has_table_privilege('authenticated', s.qa, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE')::text
         || ' anon=' || has_table_privilege('anon', s.qa, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE')::text END,
       coalesce(s.qa IS NOT NULL
         AND has_table_privilege('service_role', s.qa, 'SELECT')
         AND NOT has_table_privilege('service_role', s.qa, 'INSERT, UPDATE, DELETE, TRUNCATE')
         AND NOT has_table_privilege('authenticated', s.qa, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE')
         AND NOT has_table_privilege('anon', s.qa, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE'), false), 15 FROM s
UNION ALL
SELECT 'BOOT-07', 'boot', 'triggerfunktionerne kan ikke kaldes af nogen API-rolle',
       'reject=' || coalesce(has_function_privilege('service_role', s.reject_oid, 'EXECUTE')::text, 'mangler')
       || ' guard=' || coalesce(has_function_privilege('service_role', s.guard_oid, 'EXECUTE')::text, 'mangler'),
       coalesce(s.reject_oid IS NOT NULL AND s.guard_oid IS NOT NULL
         AND NOT has_function_privilege('service_role', s.reject_oid, 'EXECUTE')
         AND NOT has_function_privilege('authenticated', s.reject_oid, 'EXECUTE')
         AND NOT has_function_privilege('anon', s.reject_oid, 'EXECUTE')
         AND NOT has_function_privilege('service_role', s.guard_oid, 'EXECUTE')
         AND NOT has_function_privilege('authenticated', s.guard_oid, 'EXECUTE')
         AND NOT has_function_privilege('anon', s.guard_oid, 'EXECUTE'), false), 16 FROM s

-- ── align: _v2 bedømmer som G1 ────────────────────────────────────────────────────────────────────
UNION ALL
SELECT 'ALIGN-01', 'align', 'process_question_attempt_v2 har align-kroppen (8a769614…) med EXECUTE kun for service_role — eller er erstattet af K1-kroppen',
       coalesce('7-arg=' || left(s.mc7, 8), '7-arg=mangler') || ' ' || coalesce('9-arg=' || left(s.mc9, 8), '9-arg=mangler'),
       coalesce((s.mc7 = '8a7696147df978e250918b2c93e20577'
                   AND has_function_privilege('service_role', s.mc7_oid, 'EXECUTE')
                   AND NOT has_function_privilege('authenticated', s.mc7_oid, 'EXECUTE')
                   AND NOT has_function_privilege('anon', s.mc7_oid, 'EXECUTE'))
                OR (s.k1_bodies AND s.mc7 IS NULL), false), 20 FROM s
UNION ALL
SELECT 'ALIGN-02', 'align', 'process_text_answer_v2 har H5-kroppen (f8809846…) med EXECUTE kun for service_role — eller er erstattet af K1-kroppen',
       coalesce('8-arg=' || left(s.tx8, 8), '8-arg=mangler') || ' ' || coalesce('10-arg=' || left(s.tx10, 8), '10-arg=mangler'),
       coalesce((s.tx8 = 'f880984680d52b20d07c628a9dfae474'
                   AND has_function_privilege('service_role', s.tx8_oid, 'EXECUTE')
                   AND NOT has_function_privilege('authenticated', s.tx8_oid, 'EXECUTE')
                   AND NOT has_function_privilege('anon', s.tx8_oid, 'EXECUTE'))
                OR (s.k1_bodies AND s.tx8 IS NULL), false), 21 FROM s

-- ── d327: forsøg overlever ikke en instanssletning (NO ACTION) ─────────────────────────────────────
UNION ALL
SELECT 'D327-01', 'd327', 'question_attempts_instance_fkey er ON DELETE NO ACTION (confdeltype a)',
       coalesce('confdeltype=' || s.fk_del::text, 'mangler'),
       coalesce(s.fk_del = 'a', false), 30 FROM s

-- ── k1: forsøgskontekst og udleveringssnapshot ───────────────────────────────────────────────────
UNION ALL
SELECT 'K1-01', 'k1', 'K1-kroppene (439186fa…, 809675f9…) og snapshot-funktionen (babbb196…) findes; de gamle _v2-signaturer er fjernet',
       concat_ws(' ', 'mc9=' || coalesce(left(s.mc9, 8), 'mangler'), 'tx10=' || coalesce(left(s.tx10, 8), 'mangler'),
                 'snap=' || coalesce(left(s.snap, 8), 'mangler'),
                 'gamle=' || ((s.mc7 IS NOT NULL)::int + (s.tx8 IS NOT NULL)::int)::text),
       coalesce(s.k1_bodies AND s.mc7 IS NULL AND s.tx8 IS NULL, false), 40 FROM s
UNION ALL
SELECT 'K1-02', 'k1', 'de seks K1-kolonner på question_attempts og de tre served_*-kolonner på question_instances findes',
       'attempts=' || s.k1_cols::text || ' af 6, instances=' || s.served_cols::text || ' af 3',
       s.k1_cols = 6 AND s.served_cols = 3, 41 FROM s
UNION ALL
SELECT 'K1-03', 'k1', 'snapshot-triggeren er aktiv og ejer served_*; ingen API-rolle kan kalde dens funktion',
       'trigger=' || EXISTS (SELECT 1 FROM pg_catalog.pg_trigger tg WHERE tg.tgname = 'question_instances_served_snapshot'
                               AND tg.tgrelid = s.qi AND tg.tgenabled = 'O')::text,
       coalesce(s.snap_oid IS NOT NULL
         AND EXISTS (SELECT 1 FROM pg_catalog.pg_trigger tg WHERE tg.tgname = 'question_instances_served_snapshot'
                       AND tg.tgrelid = s.qi AND tg.tgfoid = s.snap_oid AND tg.tgenabled = 'O')
         AND NOT has_function_privilege('service_role', s.snap_oid, 'EXECUTE')
         AND NOT has_function_privilege('authenticated', s.snap_oid, 'EXECUTE')
         AND NOT has_function_privilege('anon', s.snap_oid, 'EXECUTE'), false), 42 FROM s
UNION ALL
SELECT 'K1-04', 'k1', 'served_snapshot og served_content_sha256 kan ikke læses af anon/authenticated (facit ligger i snapshot)',
       CASE WHEN s.served_cols < 3 THEN 'kolonnerne findes ikke' ELSE
         'anon=' || has_column_privilege('anon', s.qi, 'served_snapshot', 'SELECT')::text
         || ' authenticated=' || has_column_privilege('authenticated', s.qi, 'served_snapshot', 'SELECT')::text
         || '/' || has_column_privilege('authenticated', s.qi, 'served_content_sha256', 'SELECT')::text END,
       CASE WHEN s.served_cols < 3 THEN false ELSE
         NOT has_column_privilege('anon', s.qi, 'served_snapshot', 'SELECT')
         AND NOT has_column_privilege('authenticated', s.qi, 'served_snapshot', 'SELECT')
         AND NOT has_column_privilege('authenticated', s.qi, 'served_content_sha256', 'SELECT') END, 43 FROM s
UNION ALL
SELECT 'K1-05', 'k1', 'K1-funktionerne: EXECUTE kun service_role, SECURITY DEFINER',
       'mc9 sr=' || coalesce(has_function_privilege('service_role', s.mc9_oid, 'EXECUTE')::text, 'mangler')
       || ' tx10 sr=' || coalesce(has_function_privilege('service_role', s.tx10_oid, 'EXECUTE')::text, 'mangler'),
       coalesce(s.mc9_oid IS NOT NULL AND s.tx10_oid IS NOT NULL
         AND has_function_privilege('service_role', s.mc9_oid, 'EXECUTE')
         AND has_function_privilege('service_role', s.tx10_oid, 'EXECUTE')
         AND NOT has_function_privilege('authenticated', s.mc9_oid, 'EXECUTE')
         AND NOT has_function_privilege('anon', s.mc9_oid, 'EXECUTE')
         AND NOT has_function_privilege('authenticated', s.tx10_oid, 'EXECUTE')
         AND NOT has_function_privilege('anon', s.tx10_oid, 'EXECUTE')
         AND (SELECT bool_and(p.prosecdef) FROM pg_catalog.pg_proc p
               WHERE p.oid IN (s.mc9_oid, s.tx10_oid)), false), 44 FROM s

-- ── cutover: M2 (ikke implementeret endnu) ───────────────────────────────────────────────────────
UNION ALL
SELECT 'CUT-01', 'cutover', 'M2 udført: service_role har ikke EXECUTE på process_question_attempt og process_text_answer (legacy)',
       'pqa=' || coalesce(has_function_privilege('service_role', s.pqa_oid, 'EXECUTE')::text, 'mangler')
       || ' pta=' || coalesce(has_function_privilege('service_role', s.pta_oid, 'EXECUTE')::text, 'mangler'),
       coalesce(NOT has_function_privilege('service_role', s.pqa_oid, 'EXECUTE')
         AND NOT has_function_privilege('service_role', s.pta_oid, 'EXECUTE'), false), 50 FROM s

-- ── integrity: estimat (præcise kontroller efter aktivering: runbook §8) ───────────────────────────
UNION ALL
SELECT 'INT-01', 'integrity', 'estimeret antal forsøg i question_attempts (information; 0 før aktivering)',
       coalesce(s.qa_rows::text || ' (estimat)', 'tabellen findes ikke'),
       NULL::boolean, 60 FROM s

-- ── ledger: migrationsloggen (findes i alle Supabase-databaser) ─────────────────────────────────────
UNION ALL
SELECT 'LED-01', 'ledger', 'ledgeren har ingen, eller et præfiks af, bootstrap → alignment → D-327 → K1 i stigende versionsorden',
       coalesce((SELECT string_agg(m.name || '@' || m.version, ' → ' ORDER BY m.version)
                   FROM supabase_migrations.schema_migrations m
                  WHERE m.name IN ('question_attempts_v2_bootstrap', 'question_attempts_v2_align_grading',
                                   'question_attempts_history_no_action', 'l1_k1_attempt_context')), 'ingen'),
       coalesce((SELECT string_agg(m.name, ',' ORDER BY m.version)
                   FROM supabase_migrations.schema_migrations m
                  WHERE m.name IN ('question_attempts_v2_bootstrap', 'question_attempts_v2_align_grading',
                                   'question_attempts_history_no_action', 'l1_k1_attempt_context')), '')
         IN ('', 'question_attempts_v2_bootstrap',
             'question_attempts_v2_bootstrap,question_attempts_v2_align_grading',
             'question_attempts_v2_bootstrap,question_attempts_v2_align_grading,question_attempts_history_no_action',
             'question_attempts_v2_bootstrap,question_attempts_v2_align_grading,question_attempts_history_no_action,l1_k1_attempt_context'),
       70
UNION ALL
SELECT 'LED-02', 'ledger', 'den oprindelige H5-fil 20261030211428 (navn question_attempts_v2) er IKKE i ledgeren — produktionens vej er bootstrap',
       (SELECT count(*) FROM supabase_migrations.schema_migrations m WHERE m.name = 'question_attempts_v2')::text,
       NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations m WHERE m.name = 'question_attempts_v2'), 71

-- ── security: separat spor (R6/R7), blokerer ikke H5-aktiveringen ────────────────────────────────
UNION ALL
SELECT 'SEC-01', 'security', 'elever kan ikke indsætte i student_events (R6)',
       coalesce((SELECT string_agg(p.polname, ', ') FROM pg_catalog.pg_policy p
                  WHERE p.polrelid = to_regclass('public.student_events') AND p.polcmd IN ('a', '*')), 'ingen INSERT-policy'),
       NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policy p
                    WHERE p.polrelid = to_regclass('public.student_events') AND p.polcmd IN ('a', '*')), 80
UNION ALL
SELECT 'SEC-02', 'security', 'anon/authenticated har ikke TRUNCATE på question_instances, student_progress, student_events (R7)',
       (SELECT string_agg(r || ':' || tb, ', ' ORDER BY r, tb) FROM
          (VALUES ('anon'), ('authenticated')) AS rr(r),
          (VALUES ('question_instances'), ('student_progress'), ('student_events')) AS tt(tb)
         WHERE to_regclass('public.' || tb) IS NOT NULL
           AND has_table_privilege(r, to_regclass('public.' || tb), 'TRUNCATE')),
       NOT EXISTS (SELECT 1 FROM
          (VALUES ('anon'), ('authenticated')) AS rr(r),
          (VALUES ('question_instances'), ('student_progress'), ('student_events')) AS tt(tb)
         WHERE to_regclass('public.' || tb) IS NOT NULL
           AND has_table_privilege(r, to_regclass('public.' || tb), 'TRUNCATE')), 81
) AS checks
ORDER BY ord;
