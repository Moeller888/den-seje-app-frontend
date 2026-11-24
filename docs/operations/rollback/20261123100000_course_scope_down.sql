-- TILBAGEFØRSEL af 20261123100000_course_scope_before_candidate_limit.sql (D-383-opfølgningen, #740). IKKE en migration:
-- filen ligger uden for supabase/migrations og anvendes aldrig af sig selv. Den må KUN anvendes via apply_migration med
-- ejerens særskilte autorisation (D-110, docs/migration-workflow-policy.md) og kun som beskrevet i
-- docs/operations/laerligverse-rollback-matrix.md (scenarie 2: databasen ét trin tilbage, Edge-funktionen er #739s eller
-- #740s, som begge tåler den gamle signatur; #740 falder tilbage én gang og logger COURSE_SCOPE_FALLBACK).
--
-- Hvad den gør (apply_migration kører filen som én transaktion; testen gør det samme): vagt (præcis
-- 20261123100000s kroppe under de nye signaturer, de gamle signaturer fraværende) → drop de nye signaturer
-- → genskab de gamle med kroppene ORDRET fra 20261016160000 og 20261019150000
-- (ejer, SECURITY DEFINER, STABLE, search_path, kommentar og grants som før) → efterkontrol af md5 mod de kroppe,
-- 20261123100000s egen vagt kræver som "før". Ingen data ændres. 20261120150000 (D-383) rulles IKKE tilbage: dens
-- tidligere kroppe genåbner og sletter kursusrunder (se matrixen); den rulles kun frem.
-- Bevist af tests/unit/laerligverse-rollback-matrix-migrations-run.test.mjs (PGlite lokalt, PostgreSQL 17.6 i CI).


DO $course_scope_down_guard$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure('public.get_unserved_questions_for_student(uuid,smallint,text[],text)')) IS DISTINCT FROM '395001c3deec3fb24408c3a769e0b5f5'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure('public.get_question_candidates_for_student(uuid,smallint,text[],integer,text)')) IS DISTINCT FROM '1430439742fc272b1e372adc7761d2f5'
     OR to_regprocedure('public.get_unserved_questions_for_student(uuid,smallint,text[])') IS NOT NULL
     OR to_regprocedure('public.get_question_candidates_for_student(uuid,smallint,text[],integer)') IS NOT NULL THEN
    RAISE EXCEPTION 'COURSE_SCOPE_DOWN: databasen er ikke præcis 20261123100000s tilstand; intet ændret';
  END IF;
END
$course_scope_down_guard$;

DROP FUNCTION public.get_unserved_questions_for_student(uuid, smallint, text[], text);
DROP FUNCTION public.get_question_candidates_for_student(uuid, smallint, text[], integer, text);

-- ── Ordret fra 20261016160000_answer_keys_server_side_rpcs.sql ──
CREATE FUNCTION public.get_unserved_questions_for_student(
  p_student_id uuid,
  p_grade      smallint,
  p_domains    text[]
)
RETURNS TABLE (
  id              uuid,
  content         jsonb,
  answer_format   text,
  answer_type     text,
  metadata        jsonb,
  difficulty_band integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT q.id, q.content, q.answer_format, q.answer_type, q.metadata, q.difficulty_band
  FROM public.questions q
  WHERE p_student_id IS NOT NULL
    AND q.is_active = true
    AND (p_grade IS NULL OR q.target_grade IS NULL OR q.target_grade <= p_grade)
    AND (p_domains IS NULL OR q.learning_objective = ANY(p_domains))
    AND NOT EXISTS (
      SELECT 1
      FROM public.question_instances qi
      WHERE qi.student_id  = p_student_id
        AND qi.question_id = q.id
    )
  LIMIT 50;
$$;

REVOKE ALL ON FUNCTION public.get_unserved_questions_for_student(uuid, smallint, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_unserved_questions_for_student(uuid, smallint, text[]) TO service_role;

-- ── Ordret fra 20261019150000_question_format_mix.sql ──
CREATE FUNCTION public.get_question_candidates_for_student(
  p_student_id uuid,
  p_grade      smallint,
  p_domains    text[],
  p_per_group  integer DEFAULT 20
)
RETURNS TABLE (
  id                 uuid,
  content            jsonb,
  answer_format      text,
  answer_type        text,
  metadata           jsonb,
  difficulty_band    integer,
  learning_objective text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH eligible AS (
    SELECT q.id, q.content, q.answer_format, q.answer_type, q.metadata, q.difficulty_band,
           q.learning_objective,
           md5(p_student_id::text || q.id::text) AS rank_key
    FROM public.questions q
    WHERE p_student_id IS NOT NULL
      AND q.is_active = true
      AND (p_grade IS NULL OR q.target_grade IS NULL OR q.target_grade <= p_grade)
      AND (p_domains IS NULL OR q.learning_objective = ANY(p_domains))
      AND public.question_is_servable(q.answer_format, q.answer_type, q.content)
      AND NOT EXISTS (
        SELECT 1
        FROM public.question_instances qi
        WHERE qi.student_id  = p_student_id
          AND qi.question_id = q.id
      )
  ),
  ranked AS (
    SELECT e.*,
           row_number() OVER (
             PARTITION BY e.answer_format,
                          coalesce(e.answer_type, 'short'),
                          (e.content ->> 'force_text') IS NOT DISTINCT FROM 'true',
                          e.difficulty_band
             ORDER BY e.rank_key, e.id
           ) AS group_rank
    FROM eligible e
  )
  SELECT r.id, r.content, r.answer_format, r.answer_type, r.metadata, r.difficulty_band::integer,
         r.learning_objective
  FROM ranked r
  WHERE r.group_rank <= least(greatest(coalesce(p_per_group, 20), 1), 50)
  ORDER BY r.rank_key, r.id;
$$;

COMMENT ON FUNCTION public.get_question_candidates_for_student(uuid, smallint, text[], integer) IS
  'Stratified per-pupil candidate window for new questions (format mix). Scope predicate of '
  'get_unserved_questions_for_student, servable formats only; up to p_per_group rows per (answer_format, '
  'answer_type, force_text, difficulty_band), ranked md5(student_id||question_id). service_role only. See 20261019150000.';

REVOKE ALL ON FUNCTION public.get_question_candidates_for_student(uuid, smallint, text[], integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_question_candidates_for_student(uuid, smallint, text[], integer) TO service_role;

DO $course_scope_down_check$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure('public.get_unserved_questions_for_student(uuid,smallint,text[])')) IS DISTINCT FROM '126b901c78d7176ba9255c14cf2906b4'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure('public.get_question_candidates_for_student(uuid,smallint,text[],integer)')) IS DISTINCT FROM '97fd2661eec66b41d43da294ffc95408' THEN
    RAISE EXCEPTION 'COURSE_SCOPE_DOWN: de genskabte kroppe er ikke de gennemgåede; transaktionen rulles tilbage';
  END IF;
END
$course_scope_down_check$;

