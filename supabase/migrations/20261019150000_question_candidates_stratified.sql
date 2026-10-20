-- Stratified, per-pupil candidate window for NEW questions (the format mix, get-next-question v2).
--
-- THE PROBLEM (read-only measurement, 2026-10-19)
-- get_unserved_questions_for_student ends in `LIMIT 50` with no ORDER BY, so the 50 candidates are the
-- first 50 rows the scan meets — physical heap order. The two live "Stav til" questions sit at physical
-- positions 1846–1847 of 2,101 active rows, so a new pupil practically never gets them in the window,
-- every pupil sees the same 50 rows in the same order, and the window moves whenever rows are UPDATEd.
--
-- WHAT THIS ADDS — one new function, nothing else
--   get_question_candidates_for_student(p_student_id uuid, p_grade smallint, p_domains text[],
--                                       p_per_group integer DEFAULT 20)
--   * EXACTLY the scope predicate of get_unserved_questions_for_student: active; target_grade within
--     the grade (NULL grade = no filter); learning_objective in the domains (NULL = no filter); never a
--     question already instanced for this pupil. A NULL student id returns nothing.
--   * Stratified: up to p_per_group rows from EACH group of (answer_format, answer_type, force_text,
--     difficulty_band). A rare kind or band can no longer be crowded out by the common one, and a new
--     kind (e.g. a future answer_format) gets its own group without any change here.
--   * Ranked per pupil: md5(student_id || question_id), then id. Deterministic for a pupil, different
--     between pupils, independent of physical order and of UPDATEs.
--   * Returns learning_objective as well, for topic variety in the Edge Function.
--   * p_per_group is clamped to 1..50; at most 50 × number of groups rows (today ≤ 5 bands ×
--     2 kinds × 20 = 200).
--   SECURITY DEFINER, EXECUTE for service_role only — identical to get_unserved_questions_for_student:
--   it returns full content (the answer key included), which only the backend may read.
--
-- WHAT THIS DOES NOT DO
-- get_unserved_questions_for_student, request_repeat_question_for_student and every policy, RLS setting,
-- grant and table are unchanged. Nothing changes behaviour when this is applied: the live
-- get-next-question keeps calling the old function until a get-next-question build with the format mix
-- is deployed AND its Edge secret QUESTION_MIX_ENGINE is set to "shadow" or "v2".
--
-- Applying this needs its own owner authorisation (D-110) through apply_migration — never db push —
-- and the security review this file was prepared for.

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
  'Stratified per-pupil candidate window for new questions (format mix). Same scope predicate as '
  'get_unserved_questions_for_student; up to p_per_group rows per (answer_format, answer_type, '
  'force_text, difficulty_band), ranked md5(student_id||question_id). service_role only. See 20261019150000.';

REVOKE ALL ON FUNCTION public.get_question_candidates_for_student(uuid, smallint, text[], integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_question_candidates_for_student(uuid, smallint, text[], integer) TO service_role;
