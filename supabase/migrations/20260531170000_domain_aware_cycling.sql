-- Section 90: Domain-Aware Question Cycling
-- Adds teacher-assigned domain focus to student profiles.
-- NULL active_domains = free exploration (all questions eligible).

-- 1. Column
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS active_domains TEXT[];

-- 2. RPC: teacher sets domain filter for a student
--    SECURITY DEFINER so it can UPDATE profiles directly;
--    verifies caller is the student's teacher before writing.
CREATE OR REPLACE FUNCTION public.set_student_domains(
  p_student_id UUID,
  p_domains    TEXT[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id         = p_student_id
      AND teacher_id = auth.uid()
      AND role       = 'student'
  ) THEN
    RAISE EXCEPTION 'Not authorized: caller is not the teacher of this student';
  END IF;

  UPDATE profiles
  SET active_domains = p_domains
  WHERE id = p_student_id;
END;
$$;

-- 3. get_teacher_visibility: return type gains active_domains column.
--    DROP + CREATE required because the RETURNS TABLE signature changed.
DROP FUNCTION IF EXISTS public.get_teacher_visibility(UUID);

CREATE FUNCTION public.get_teacher_visibility(p_teacher_id UUID)
RETURNS TABLE(
  student_id         UUID,
  display_name       TEXT,
  selected_grade     SMALLINT,
  placement_band     SMALLINT,
  current_band       SMALLINT,
  total_attempts     INTEGER,
  recent_correct_pct INTEGER,
  trend              TEXT,
  active_domains     TEXT[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH
  my_students AS (
    SELECT
      p.id,
      COALESCE(NULLIF(TRIM(p.full_name), ''), 'Elev')::TEXT AS display_name,
      p.selected_grade,
      p.placement_band,
      p.active_domains
    FROM profiles p
    WHERE p.teacher_id = p_teacher_id
      AND p.role = 'student'
  ),
  ranked AS (
    SELECT
      qi.student_id,
      qi.is_correct,
      q.difficulty_band,
      ROW_NUMBER() OVER (
        PARTITION BY qi.student_id
        ORDER BY COALESCE(qi.answered_at, qi.created_at) DESC
      ) AS rn
    FROM question_instances qi
    JOIN questions q ON q.id = qi.question_id
    WHERE qi.student_id IN (SELECT id FROM my_students)
      AND qi.answered = true
  ),
  agg AS (
    SELECT
      student_id,
      ROUND(AVG(difficulty_band) FILTER (WHERE rn <= 10))::SMALLINT AS current_band,
      CASE
        WHEN COUNT(*) FILTER (WHERE rn <= 20) = 0 THEN 0
        ELSE ROUND(
          100.0 * COUNT(*) FILTER (WHERE rn <= 20 AND is_correct = true) /
          NULLIF(COUNT(*) FILTER (WHERE rn <= 20), 0)
        )::INTEGER
      END AS recent_correct_pct,
      CASE
        WHEN COUNT(*) FILTER (WHERE rn <= 10) < 5 THEN 'stable'
        WHEN COUNT(*) FILTER (WHERE rn BETWEEN 11 AND 20) < 5 THEN 'stable'
        WHEN (AVG(is_correct::INT) FILTER (WHERE rn <= 10) -
              AVG(is_correct::INT) FILTER (WHERE rn BETWEEN 11 AND 20)) > 0.15 THEN 'improving'
        WHEN (AVG(is_correct::INT) FILTER (WHERE rn BETWEEN 11 AND 20) -
              AVG(is_correct::INT) FILTER (WHERE rn <= 10)) > 0.15 THEN 'struggling'
        ELSE 'stable'
      END AS trend
    FROM ranked
    GROUP BY student_id
  )
  SELECT
    ms.id,
    ms.display_name,
    ms.selected_grade,
    ms.placement_band,
    COALESCE(ag.current_band, 1),
    COALESCE(sp.total_attempts, 0),
    COALESCE(ag.recent_correct_pct, 0),
    COALESCE(ag.trend, 'stable'),
    ms.active_domains
  FROM my_students ms
  LEFT JOIN student_progress sp ON sp.student_id = ms.id
  LEFT JOIN agg ag ON ag.student_id = ms.id
  ORDER BY ms.display_name;
END;
$$;
