-- D-383, opfølgning: kursusfilteret anvendes FØR kandidatgrænsen i de to DELTE kandidatfunktioner.
--
-- Problemet (D-383 "Kendte grænser", problem 3): get_unserved_questions_for_student (LIMIT 50) og
-- get_question_candidates_for_student (højst p_per_group pr. gruppe) bruges både af den almindelige quiz og af et
-- målrettet kald. get-next-question frasorterer kursusopgaver (og i sekvensen: opgaver fra andre trin) EFTER grænsen.
-- Ligger der mange af dem først, ser den almindelige quiz "ingen spørgsmål", og sekvensen ser "trinnet er opbrugt",
-- selv om gyldige opgaver findes længere nede.
--
-- Rettelsen: en ny, valgfri parameter p_course_scope text DEFAULT NULL i begge funktioner, anvendt i WHERE før
-- grænsen og vinduet:
--   NULL        som før (ingen ændring for et kald uden parameteren — fx den funktion, der kører i produktion i dag)
--   'none'      ingen kursusopgaver (den almindelige quiz og et målrettet kald uden sekvens)
--   <trin-id>   kun kursusopgaver mærket med netop det trin (et kald i den serverstyrede sekvens)
-- Samme definition af en kursusopgave som D-383: public.question_is_course_item (20261120150000, som skal være anvendt
-- først; vagten kræver det).
--
-- En ny parameter er en ny signatur. Den gamle droppes i samme transaktion, og den nye oprettes med præcis den gamle
-- krop plus ét prædikat. Ejer, SECURITY DEFINER, STABLE, search_path, grants (kun service_role) og kommentaren er
-- som før. PostgREST kalder med navngivne argumenter, så et kald uden p_course_scope rammer den nye funktion med
-- standardværdien. Ingen data ændres.
--
-- IKKE anvendt i produktion. Må KUN anvendes via apply_migration med særskilt ejer-autorisation (D-110,
-- docs/migration-workflow-policy.md), EFTER 20261120150000 og FØR get-next-question med p_course_scope deployes (en
-- ny funktion på en gammel database falder tilbage til det gamle kald og logger COURSE_SCOPE_FALLBACK; se D-383).

-- ── 0. Vagt ───────────────────────────────────────────────────────────────────────────────────────
-- Før: produktionens kroppe (20261016160000 og 20261019150000) under de gamle signaturer. Efter (en ny kørsel): denne
-- migrations kroppe under de nye signaturer. Og D-383's hjælpefunktion skal findes. Alt andet afbryder uden ændring.
DO $course_scope_guard$
DECLARE
  v_old_unserved   text := (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure('public.get_unserved_questions_for_student(uuid,smallint,text[])'));
  v_old_candidates text := (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure('public.get_question_candidates_for_student(uuid,smallint,text[],integer)'));
  v_new_unserved   text := (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure('public.get_unserved_questions_for_student(uuid,smallint,text[],text)'));
  v_new_candidates text := (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure('public.get_question_candidates_for_student(uuid,smallint,text[],integer,text)'));
BEGIN
  IF to_regprocedure('public.question_is_course_item(jsonb)') IS NULL THEN
    RAISE EXCEPTION 'COURSE_SCOPE: public.question_is_course_item mangler — anvend 20261120150000 (D-383) først';
  END IF;
  IF NOT (
    (v_old_unserved = '126b901c78d7176ba9255c14cf2906b4' AND v_new_unserved IS NULL)
    OR (v_old_unserved IS NULL AND v_new_unserved = '395001c3deec3fb24408c3a769e0b5f5')
  ) THEN
    RAISE EXCEPTION 'COURSE_SCOPE: get_unserved_questions_for_student er ikke den gennemgåede krop (gammel %, ny %)', v_old_unserved, v_new_unserved;
  END IF;
  IF NOT (
    (v_old_candidates = '97fd2661eec66b41d43da294ffc95408' AND v_new_candidates IS NULL)
    OR (v_old_candidates IS NULL AND v_new_candidates = '1430439742fc272b1e372adc7761d2f5')
  ) THEN
    RAISE EXCEPTION 'COURSE_SCOPE: get_question_candidates_for_student er ikke den gennemgåede krop (gammel %, ny %)', v_old_candidates, v_new_candidates;
  END IF;
END
$course_scope_guard$;

-- ── 1. get_unserved_questions_for_student (den klassiske rute, LIMIT 50) ──────────────────────────
DROP FUNCTION IF EXISTS public.get_unserved_questions_for_student(uuid, smallint, text[]);

CREATE OR REPLACE FUNCTION public.get_unserved_questions_for_student(
  p_student_id   uuid,
  p_grade        smallint,
  p_domains      text[],
  p_course_scope text DEFAULT NULL
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
    AND (p_course_scope IS NULL
         OR (p_course_scope = 'none' AND NOT public.question_is_course_item(q.metadata))
         OR (p_course_scope <> 'none' AND public.question_is_course_item(q.metadata) AND q.metadata ->> 'learning_step' = p_course_scope))
    AND NOT EXISTS (
      SELECT 1
      FROM public.question_instances qi
      WHERE qi.student_id  = p_student_id
        AND qi.question_id = q.id
    )
  LIMIT 50;
$$;

REVOKE ALL ON FUNCTION public.get_unserved_questions_for_student(uuid, smallint, text[], text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_unserved_questions_for_student(uuid, smallint, text[], text) TO service_role;

-- ── 2. get_question_candidates_for_student (formatmiks v2, vindue pr. gruppe) ─────────────────────
DROP FUNCTION IF EXISTS public.get_question_candidates_for_student(uuid, smallint, text[], integer);

CREATE OR REPLACE FUNCTION public.get_question_candidates_for_student(
  p_student_id   uuid,
  p_grade        smallint,
  p_domains      text[],
  p_per_group    integer DEFAULT 20,
  p_course_scope text DEFAULT NULL
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
      AND (p_course_scope IS NULL
           OR (p_course_scope = 'none' AND NOT public.question_is_course_item(q.metadata))
           OR (p_course_scope <> 'none' AND public.question_is_course_item(q.metadata) AND q.metadata ->> 'learning_step' = p_course_scope))
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

COMMENT ON FUNCTION public.get_question_candidates_for_student(uuid, smallint, text[], integer, text) IS
  'Stratified per-pupil candidate window for new questions (format mix). Scope predicate of '
  'get_unserved_questions_for_student, servable formats only; up to p_per_group rows per (answer_format, '
  'answer_type, force_text, difficulty_band), ranked md5(student_id||question_id). service_role only. See 20261019150000.';

REVOKE ALL ON FUNCTION public.get_question_candidates_for_student(uuid, smallint, text[], integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_question_candidates_for_student(uuid, smallint, text[], integer, text) TO service_role;
