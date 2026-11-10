-- ============================================================================
-- TILBAGERULNING af D-350's anti-gætte-pause
-- (migration supabase/migrations/20261105130000_quiz_anti_guess_cooldown.sql)
--
-- Procedure, dataeksport og hvad der går tabt: docs/operations/quiz-anti-guess-cooldown-rollback.md
-- Testet i: tests/unit/quiz-anti-guess-cooldown-rollback.test.mjs (PGlite + rigtig PostgreSQL 17).
--
-- KRÆVER EJERENS SEPARATE GO. Køres via apply_migration (navn: quiz_anti_guess_cooldown_rollback) eller
-- execute_sql — aldrig supabase db push (D-110). Ligger med vilje UDEN FOR supabase/migrations: det er en
-- nødprocedure, ikke en del af den normale kæde.
--
-- FØR KØRSEL — ÉN LINJE SKAL UDFYLDES:
--   Eksportér hændelsesloggen (procedurens trin 2) og skriv det eksporterede antal rækker i
--   c_events_exported nedenfor. Står den på -1, og loggen ikke er tom, stopper scriptet uden ændringer.
--   Er loggen tom, er værdien ligegyldig.
--
-- HVAD SCRIPTET GØR, I DENNE RÆKKEFØLGE (alt i én DO-blok = én transaktion; fejler noget, ændres intet):
--   0. lock_timeout 5 s (venter aldrig længe på elevernes svar-låse).
--   1. Ser, hvad der findes. Findes intet af D-350, slutter det med en NOTICE (kan køres igen).
--   2. Kontrollerer afhængigheder: ingen view, fremmednøgle eller trigger UDEN FOR D-350 må pege på
--      D-350's tabeller eller funktioner. Ellers stop.
--   3. Kontrollerer, at hændelsesloggen er eksporteret (c_events_exported).
--   4. Låser question_instances (ACCESS EXCLUSIVE) og student_progress/questions (SHARE), højst 5 s ventetid,
--      og tager et fingeraftryk af elevdata (question_instances, student_progress, questions) og af
--      question_instances' rettigheder og øvrige triggere.
--   5. Slår håndhævelsen fra: DROP TRIGGER quiz_cooldown_guard og quiz_cooldown_register. Fra nu afvises
--      ingen svar. Igangværende pauser ophører med det samme (tabellerne fjernes i trin 6-8).
--   6. Fjerner elevens statusfunktion get_my_quiz_cooldown() (frontenden behandler en manglende funktion
--      som "ingen pause").
--   7. Fjerner politikken og de to triggerfunktioner.
--   8. Fjerner tabellerne: events, state, config (RESTRICT — aldrig CASCADE).
--   9. Slutkontrol: alle D-350-objekter er væk, fingeraftrykket af elevdata og rettigheder er uændret,
--      de to eksisterende triggere på question_instances er stadig aktive.
--
-- Scriptet sletter eller ændrer INGEN elevbesvarelser, XP, mønter, streaks, quests eller spørgsmål.
-- ============================================================================

DO $rb$
DECLARE
  -- ↓↓↓ UDFYLDES før kørsel: antal rækker i den eksporterede quiz_cooldown_events (-1 = ikke eksporteret).
  c_events_exported CONSTANT bigint := -1;
  -- ↑↑↑

  v_has_config   boolean := to_regclass('public.quiz_cooldown_config') IS NOT NULL;
  v_has_state    boolean := to_regclass('public.quiz_cooldown_state')  IS NOT NULL;
  v_has_events   boolean := to_regclass('public.quiz_cooldown_events') IS NOT NULL;
  v_has_get      boolean := to_regprocedure('public.get_my_quiz_cooldown()')   IS NOT NULL;
  v_has_guard    boolean := to_regprocedure('public.quiz_cooldown_guard()')    IS NOT NULL;
  v_has_register boolean := to_regprocedure('public.quiz_cooldown_register()') IS NOT NULL;
  v_events       bigint := 0;
  v_active       bigint := 0;
  v_dep          text;
  v_fp_before    text;
  v_fp_after     text;
BEGIN
  -- ── 0. Kort ventetid på låse ────────────────────────────────────────────────
  PERFORM set_config('lock_timeout', '5s', true);

  -- ── 1. Hvad findes? ─────────────────────────────────────────────────────────
  IF NOT (v_has_config OR v_has_state OR v_has_events OR v_has_get OR v_has_guard OR v_has_register)
     AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger
                     WHERE tgrelid = 'public.question_instances'::regclass
                       AND tgname IN ('quiz_cooldown_guard', 'quiz_cooldown_register')) THEN
    RAISE NOTICE 'quiz-cooldown rollback: intet af D-350 findes; intet ændret';
    RETURN;
  END IF;

  -- ── 2. Afhængigheder uden for D-350 ─────────────────────────────────────────
  -- Views/regler, der bruger tabellerne.
  SELECT string_agg(DISTINCT v.oid::regclass::text, ', ') INTO v_dep
  FROM pg_catalog.pg_depend d
  JOIN pg_catalog.pg_rewrite r ON d.classid = 'pg_catalog.pg_rewrite'::regclass AND d.objid = r.oid
  JOIN pg_catalog.pg_class v ON v.oid = r.ev_class
  WHERE d.refclassid = 'pg_catalog.pg_class'::regclass
    AND d.refobjid IN (SELECT oid FROM pg_catalog.pg_class
                       WHERE relnamespace = 'public'::regnamespace
                         AND relname IN ('quiz_cooldown_config', 'quiz_cooldown_state', 'quiz_cooldown_events'))
    AND v.relname NOT IN ('quiz_cooldown_config', 'quiz_cooldown_state', 'quiz_cooldown_events');
  IF v_dep IS NOT NULL THEN
    RAISE EXCEPTION 'quiz-cooldown rollback: views bruger D-350-tabellerne (%); intet ændret', v_dep;
  END IF;
  -- Fremmednøgler fra andre tabeller ind i D-350's tabeller.
  SELECT string_agg(c.conname || ' på ' || c.conrelid::regclass::text, ', ') INTO v_dep
  FROM pg_catalog.pg_constraint c
  WHERE c.contype = 'f'
    AND c.confrelid IN (SELECT oid FROM pg_catalog.pg_class
                        WHERE relnamespace = 'public'::regnamespace
                          AND relname IN ('quiz_cooldown_config', 'quiz_cooldown_state', 'quiz_cooldown_events'))
    AND c.conrelid NOT IN (SELECT oid FROM pg_catalog.pg_class
                           WHERE relnamespace = 'public'::regnamespace
                             AND relname IN ('quiz_cooldown_config', 'quiz_cooldown_state', 'quiz_cooldown_events'));
  IF v_dep IS NOT NULL THEN
    RAISE EXCEPTION 'quiz-cooldown rollback: fremmednøgler peger på D-350-tabellerne (%); intet ændret', v_dep;
  END IF;
  -- Andre triggere end D-350's to, der kalder D-350's triggerfunktioner.
  SELECT string_agg(t.tgname || ' på ' || t.tgrelid::regclass::text, ', ') INTO v_dep
  FROM pg_catalog.pg_trigger t
  WHERE NOT t.tgisinternal
    AND t.tgfoid IN (SELECT p.oid FROM pg_catalog.pg_proc p
                     WHERE p.pronamespace = 'public'::regnamespace
                       AND p.proname IN ('quiz_cooldown_guard', 'quiz_cooldown_register'))
    AND NOT (t.tgrelid = 'public.question_instances'::regclass
             AND t.tgname IN ('quiz_cooldown_guard', 'quiz_cooldown_register'));
  IF v_dep IS NOT NULL THEN
    RAISE EXCEPTION 'quiz-cooldown rollback: andre triggere bruger D-350''s funktioner (%); intet ændret', v_dep;
  END IF;

  -- ── 3. Hændelsesloggen skal være eksporteret ────────────────────────────────
  IF v_has_events THEN
    EXECUTE 'SELECT count(*) FROM public.quiz_cooldown_events' INTO v_events;
  END IF;
  IF v_events > 0 AND c_events_exported IS DISTINCT FROM v_events THEN
    RAISE EXCEPTION 'quiz-cooldown rollback: quiz_cooldown_events har % rækker, men c_events_exported = %. Eksportér loggen og skriv antallet i scriptet; intet ændret',
      v_events, c_events_exported;
  END IF;
  IF v_has_state THEN
    EXECUTE 'SELECT count(*) FROM public.quiz_cooldown_state WHERE cooldown_until > now()' INTO v_active;
  END IF;

  -- ── 4. Fingeraftryk: elevdata, rettigheder og øvrige triggere ───────────────
  -- Låsene tages først og holdes til commit, så ingen elevskrivning kan falde mellem de to fingeraftryk.
  -- Samme rækkefølge som svarfunktionerne (question_instances før student_progress) — ingen deadlock.
  -- Venter højst lock_timeout (5 s); blokken er kort (millisekunder ved pilotskala), så svar, der kommer
  -- imens, venter blot.
  LOCK TABLE public.question_instances IN ACCESS EXCLUSIVE MODE;
  LOCK TABLE public.student_progress, public.questions IN SHARE MODE;
  SELECT md5(concat_ws('|',
    (SELECT md5(coalesce(string_agg(qi::text, ',' ORDER BY qi.id), '')) FROM public.question_instances qi),
    (SELECT md5(coalesce(string_agg(sp::text, ',' ORDER BY sp.student_id), '')) FROM public.student_progress sp),
    (SELECT md5(coalesce(string_agg(q::text, ',' ORDER BY q.id), '')) FROM public.questions q),
    (SELECT coalesce(relacl::text, '') FROM pg_catalog.pg_class WHERE oid = 'public.question_instances'::regclass),
    (SELECT coalesce(string_agg(attname || '=' || coalesce(attacl::text, ''), ',' ORDER BY attnum), '')
       FROM pg_catalog.pg_attribute WHERE attrelid = 'public.question_instances'::regclass AND attnum > 0 AND NOT attisdropped),
    (SELECT coalesce(string_agg(tgname || ':' || tgenabled::text, ',' ORDER BY tgname), '')
       FROM pg_catalog.pg_trigger WHERE tgrelid = 'public.question_instances'::regclass AND NOT tgisinternal
         AND tgname NOT IN ('quiz_cooldown_guard', 'quiz_cooldown_register'))
  )) INTO v_fp_before;

  -- ── 5. Håndhævelsen fra: triggerne først ────────────────────────────────────
  DROP TRIGGER IF EXISTS quiz_cooldown_guard    ON public.question_instances;
  DROP TRIGGER IF EXISTS quiz_cooldown_register ON public.question_instances;

  -- ── 6. Elevens statusfunktion ───────────────────────────────────────────────
  DROP FUNCTION IF EXISTS public.get_my_quiz_cooldown() RESTRICT;

  -- ── 7. Politik og triggerfunktioner ─────────────────────────────────────────
  IF v_has_state THEN
    DROP POLICY IF EXISTS quiz_cooldown_state_read_own_end ON public.quiz_cooldown_state;
  END IF;
  DROP FUNCTION IF EXISTS public.quiz_cooldown_register() RESTRICT;
  DROP FUNCTION IF EXISTS public.quiz_cooldown_guard()    RESTRICT;

  -- ── 8. Tabellerne (hændelser, tilstand, konfiguration) ──────────────────────
  -- Kolonne- og tabelrettigheder, indeks, constraints og identity-sekvensen hører til tabellerne og
  -- forsvinder med dem. RESTRICT: findes en uventet afhængighed, fejler hele blokken.
  DROP TABLE IF EXISTS public.quiz_cooldown_events RESTRICT;
  DROP TABLE IF EXISTS public.quiz_cooldown_state  RESTRICT;
  DROP TABLE IF EXISTS public.quiz_cooldown_config RESTRICT;

  -- ── 9. Slutkontrol ──────────────────────────────────────────────────────────
  IF to_regclass('public.quiz_cooldown_config') IS NOT NULL
     OR to_regclass('public.quiz_cooldown_state') IS NOT NULL
     OR to_regclass('public.quiz_cooldown_events') IS NOT NULL
     OR to_regclass('public.quiz_cooldown_events_id_seq') IS NOT NULL
     OR to_regprocedure('public.get_my_quiz_cooldown()') IS NOT NULL
     OR to_regprocedure('public.quiz_cooldown_guard()') IS NOT NULL
     OR to_regprocedure('public.quiz_cooldown_register()') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_trigger
                WHERE tgrelid = 'public.question_instances'::regclass
                  AND tgname IN ('quiz_cooldown_guard', 'quiz_cooldown_register'))
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polname = 'quiz_cooldown_state_read_own_end') THEN
    RAISE EXCEPTION 'quiz-cooldown rollback: slutkontrol — et D-350-objekt findes stadig; intet ændret';
  END IF;

  SELECT md5(concat_ws('|',
    (SELECT md5(coalesce(string_agg(qi::text, ',' ORDER BY qi.id), '')) FROM public.question_instances qi),
    (SELECT md5(coalesce(string_agg(sp::text, ',' ORDER BY sp.student_id), '')) FROM public.student_progress sp),
    (SELECT md5(coalesce(string_agg(q::text, ',' ORDER BY q.id), '')) FROM public.questions q),
    (SELECT coalesce(relacl::text, '') FROM pg_catalog.pg_class WHERE oid = 'public.question_instances'::regclass),
    (SELECT coalesce(string_agg(attname || '=' || coalesce(attacl::text, ''), ',' ORDER BY attnum), '')
       FROM pg_catalog.pg_attribute WHERE attrelid = 'public.question_instances'::regclass AND attnum > 0 AND NOT attisdropped),
    (SELECT coalesce(string_agg(tgname || ':' || tgenabled::text, ',' ORDER BY tgname), '')
       FROM pg_catalog.pg_trigger WHERE tgrelid = 'public.question_instances'::regclass AND NOT tgisinternal
         AND tgname NOT IN ('quiz_cooldown_guard', 'quiz_cooldown_register'))
  )) INTO v_fp_after;
  IF v_fp_after IS DISTINCT FROM v_fp_before THEN
    RAISE EXCEPTION 'quiz-cooldown rollback: slutkontrol — elevdata, rettigheder eller triggere på question_instances ændret; intet ændret';
  END IF;

  RAISE NOTICE 'quiz-cooldown rollback: D-350 fjernet. Hændelser fjernet: % (eksporteret: %). Igangværende pauser ophævet: %. Elevdata uændret.',
    v_events, c_events_exported, v_active;
END
$rb$;
