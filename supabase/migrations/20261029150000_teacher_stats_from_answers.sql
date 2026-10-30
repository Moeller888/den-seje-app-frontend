-- Teacher statistics computed from the pupils' scored answers, not from dead columns.
--
-- THE DEFECT
-- The class overview (get_teacher_visibility -> js/teacher.js "Spm." / "Korrekt" / "Trend") and the
-- pupil page (get_student_overview -> js/student-detail.js "Korrekt svarprocent" / "Forsøg i alt")
-- read three values that the answer flow no longer writes:
--   question_instances.is_correct   legacy column. The answer RPCs (process_question_attempt,
--                                   process_text_answer, review_answer) write was_correct. The last
--                                   is_correct value was written 2026-03-17; 53 of 5,901 rows have one.
--   student_progress.total_attempts never incremented by any deployed function (pg_proc search).
--   question_instances.answered     also true for a text-format answer waiting for the teacher
--                                   (process_question_attempt, answer_format 'text': answered = true,
--                                   was_correct NULL), so answered alone does not mean "scored".
-- Measured read-only on production 2026-10-29: of the 46 pupils with answers, the overview shows
-- 41 at 0 % correct; computed from was_correct, 6 are at 0 % and the mean is 56 %. "Spm." and
-- "Forsøg i alt" show 0 for every pupil except 9 accounts from February–March 2026, and the trend
-- is always "stable" (AVG over NULL). The same day 39 pupils had scored answers and total_attempts 0.
--
-- THE FIX — one definition for both views
--   scored answer        = a question_instances row with answered = true and was_correct IS NOT NULL
--                          (an MC/number answer or an auto-graded short text answer; never an open
--                          or reopened question, and never a teacher-graded answer — see KNOWN,
--                          NOT CHANGED HERE)
--   first-attempt answer = a scored answer with repeat_count = 0
--   get_teacher_visibility
--     total_attempts     = number of first-attempt answers                 ("Spm.")
--     recent_correct_pct = % correct of the last 20 scored answers          ("Korrekt")
--     trend              = last 10 vs the 10 before, scored answers only    ("Trend")
--     current_band       = mean difficulty_band of the last 10 scored answers (as before, but the
--                          window no longer counts unscored rows)
--   get_student_overview
--     total_attempts     = number of first-attempt answers                 ("Forsøg i alt")
--     correct_ratio      = % correct of the first-attempt answers           ("Korrekt svarprocent")
--     total_correct_answers is UNCHANGED: still student_progress.total_correct_answers, which
--     process_question_attempt maintains for first-attempt correct answers (D-211).
-- Repeats stay out of the first-attempt figures for the same reason D-211 keeps them out of
-- total_correct_answers: re-answering known material must not inflate accuracy. A repeat reopens
-- the SAME row and overwrites its first answer, so a repeated row's first answer is no longer
-- known; such rows (36 rows of 1 pupil on 2026-10-29) are left out of the ratio rather than guessed.
--
-- KNOWN, NOT CHANGED HERE
--   * 9 early accounts (created February–May 2026) have total_correct_answers above what their
--     surviving question_instances show, because 20260529000003_legacy_question_migration deleted
--     their old instances. Their "Total korrekte" keeps the counter; their ratio uses what survives.
--   * level (student_progress.level) is not maintained either; the pupil's Hub derives the level
--     from XP (js/progression.js getXPProgressInLevel). Separate finding.
--   * The answer history itself is not append-only (repeats overwrite). Separate design decision.
--   * Teacher-graded answers are in neither statistic, before or after the teacher's review:
--     review_answer writes teacher_score / teacher_feedback / reviewed_at, never was_correct.
--     A text-format answer stays answered = true, was_correct NULL (process_question_attempt);
--     a long answer stays answered = false with only user_answer saved (process-event).
--     Production on 2026-10-30: none pending (0 long questions; 3 text-format questions with 8
--     instances, all with was_correct set). Separate finding.
--
-- WHAT THIS MIGRATION DOES NOT DO
-- No table, column, index, RLS policy, view or data change. No row is written. The signatures, the
-- RETURNS TABLE columns (names, types, order), SECURITY DEFINER, the pinned search_path and the
-- caller gates are byte-for-byte the live ones (read 2026-10-29), so js/teacher.js and
-- js/student-detail.js need no change. EXECUTE is re-asserted with the same statements as the
-- migrations that created the current grants (20261009100000, 20260927000000). CREATE OR REPLACE
-- keeps each function's identity, so there is no window in which either does not exist.
--
-- ROLLBACK
-- Re-run the CREATE OR REPLACE bodies of 20261009100000_get_teacher_visibility_caller_scope.sql
-- and 20260927000000_student_mastery_status_into_rpc.sql (the live definitions before this file).
--
-- Applying it to production needs its own owner authorisation (D-110). `supabase db push` is
-- forbidden.

-- ── 1. get_teacher_visibility: scored answers, was_correct ───────────────────
CREATE OR REPLACE FUNCTION public.get_teacher_visibility(p_teacher_id uuid)
RETURNS TABLE(
  student_id         uuid,
  display_name       text,
  selected_grade     smallint,
  placement_band     smallint,
  current_band       smallint,
  total_attempts     integer,
  recent_correct_pct integer,
  trend              text,
  active_domains     text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid  uuid := (SELECT auth.uid());
  v_role text;
BEGIN
  -- Not signed in: nothing, and no error that would confirm anything.
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  -- The role comes from the database, keyed on the verified JWT subject.
  SELECT p.role INTO v_role
  FROM public.profiles p
  WHERE p.id = v_uid;

  -- A missing profile is an unknown answer, and an unknown answer is not permission.
  IF v_role IS NULL OR v_role <> 'teacher' THEN
    RETURN;
  END IF;

  -- A teacher may ask only about themselves. Another id is answered exactly like "no pupils".
  IF p_teacher_id IS DISTINCT FROM v_uid THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH
  my_students AS (
    SELECT
      p.id,
      COALESCE(NULLIF(split_part(u.email, '@', 1), ''), 'Elev')::TEXT AS display_name,
      p.selected_grade,
      p.placement_band,
      p.active_domains
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.teacher_id = v_uid
      AND p.role = 'student'
  ),
  -- Scored answers only: a pending text answer or a closed, unanswered repeat has no result.
  ranked AS (
    SELECT
      qi.student_id       AS sid,
      qi.was_correct,
      COALESCE(qi.repeat_count, 0) = 0 AS first_attempt,
      q.difficulty_band,
      ROW_NUMBER() OVER (
        PARTITION BY qi.student_id
        ORDER BY COALESCE(qi.answered_at, qi.created_at) DESC
      ) AS rn
    FROM public.question_instances qi
    JOIN public.questions q ON q.id = qi.question_id
    WHERE qi.student_id IN (SELECT id FROM my_students)
      AND qi.answered = true
      AND qi.was_correct IS NOT NULL
  ),
  agg AS (
    SELECT
      r.sid,
      ROUND(AVG(r.difficulty_band) FILTER (WHERE r.rn <= 10))::SMALLINT AS current_band,
      COUNT(*) FILTER (WHERE r.first_attempt)::INTEGER AS first_attempts,
      CASE
        WHEN COUNT(*) FILTER (WHERE r.rn <= 20) = 0 THEN 0
        ELSE ROUND(
          100.0 * COUNT(*) FILTER (WHERE r.rn <= 20 AND r.was_correct = true) /
          NULLIF(COUNT(*) FILTER (WHERE r.rn <= 20), 0)
        )::INTEGER
      END AS recent_correct_pct,
      CASE
        WHEN COUNT(*) FILTER (WHERE r.rn <= 10) < 5 THEN 'stable'
        WHEN COUNT(*) FILTER (WHERE r.rn BETWEEN 11 AND 20) < 5 THEN 'stable'
        WHEN (AVG(r.was_correct::INT) FILTER (WHERE r.rn <= 10) -
              AVG(r.was_correct::INT) FILTER (WHERE r.rn BETWEEN 11 AND 20)) > 0.15 THEN 'improving'
        WHEN (AVG(r.was_correct::INT) FILTER (WHERE r.rn BETWEEN 11 AND 20) -
              AVG(r.was_correct::INT) FILTER (WHERE r.rn <= 10)) > 0.15 THEN 'struggling'
        ELSE 'stable'
      END AS trend
    FROM ranked r
    GROUP BY r.sid
  )
  SELECT
    ms.id,
    ms.display_name,
    ms.selected_grade,
    ms.placement_band,
    COALESCE(ag.current_band, 1::SMALLINT),
    COALESCE(ag.first_attempts, 0),
    COALESCE(ag.recent_correct_pct, 0),
    COALESCE(ag.trend, 'stable'),
    ms.active_domains
  FROM my_students ms
  LEFT JOIN agg ag ON ag.sid = ms.id
  ORDER BY ms.display_name;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_teacher_visibility(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_teacher_visibility(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_teacher_visibility(uuid) FROM service_role;
GRANT  EXECUTE ON FUNCTION public.get_teacher_visibility(uuid) TO authenticated;

-- ── 2. get_student_overview: attempts and ratio from first-attempt answers ───
CREATE OR REPLACE FUNCTION public.get_student_overview(p_student_id uuid)
RETURNS TABLE(
  email                 text,
  xp                    integer,
  level                 integer,
  correct_ratio         numeric,
  total_correct_answers integer,
  total_attempts        integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid  uuid := (SELECT auth.uid());
  v_role text;
BEGIN
  -- Not signed in: nothing, and no error that would confirm anything.
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  -- The role comes from the database, keyed on the verified JWT subject.
  SELECT p.role INTO v_role
  FROM public.profiles p
  WHERE p.id = v_uid;

  -- A missing profile is an unknown answer, and an unknown answer is not permission.
  IF v_role IS NULL OR v_role NOT IN ('teacher', 'super_admin') THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    u.email::text                           AS email,
    COALESCE(sp.xp, 0)                      AS xp,
    COALESCE(sp.level, 1)                   AS level,
    -- first-attempt answers only, with the zero-attempt guard
    CASE
      WHEN COALESCE(fa.attempts, 0) > 0
        THEN round(fa.correct::numeric / fa.attempts::numeric * 100::numeric, 1)
      ELSE 0::numeric
    END                                     AS correct_ratio,
    COALESCE(sp.total_correct_answers, 0)   AS total_correct_answers,
    COALESCE(fa.attempts, 0)                AS total_attempts
  FROM public.profiles s
    JOIN auth.users u
      ON u.id = s.id
    LEFT JOIN public.student_progress sp
      ON sp.student_id = s.id
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::integer                              AS attempts,
        COUNT(*) FILTER (WHERE qi.was_correct)::integer AS correct
      FROM public.question_instances qi
      WHERE qi.student_id = s.id
        AND qi.answered = true
        AND qi.was_correct IS NOT NULL
        AND COALESCE(qi.repeat_count, 0) = 0
    ) fa ON true
  WHERE s.id = p_student_id
    AND s.role = 'student'
    AND (
      v_role = 'super_admin'
      OR s.teacher_id = v_uid
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_student_overview(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_student_overview(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_student_overview(uuid) TO authenticated;
