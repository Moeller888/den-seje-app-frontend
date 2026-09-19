
CREATE OR REPLACE FUNCTION public.get_teacher_visibility(p_teacher_id uuid)
RETURNS TABLE (
  student_id         uuid,
  display_name       text,
  selected_grade     smallint,
  placement_band     smallint,
  current_band       smallint,
  total_attempts     integer,
  recent_correct_pct integer,
  trend              text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH
  -- All students belonging to this teacher
  my_students AS (
    SELECT
      p.id,
      COALESCE(NULLIF(TRIM(p.full_name), ''), 'Elev')::text AS display_name,
      p.selected_grade,
      p.placement_band
    FROM profiles p
    WHERE p.teacher_id = p_teacher_id
      AND p.role = 'student'
  ),
  -- Rank each student's answered instances newest-first
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
  -- Aggregate stats per student from last 20 answered instances
  agg AS (
    SELECT
      student_id,
      -- Current band: mean band of last 10 answered questions
      ROUND(AVG(difficulty_band) FILTER (WHERE rn <= 10))::smallint AS current_band,
      -- Recent correct pct over last 20 answered
      CASE
        WHEN COUNT(*) FILTER (WHERE rn <= 20) = 0 THEN 0
        ELSE ROUND(
          100.0 * COUNT(*) FILTER (WHERE rn <= 20 AND is_correct = true) /
          NULLIF(COUNT(*) FILTER (WHERE rn <= 20), 0)
        )::integer
      END AS recent_correct_pct,
      -- Trend: compare accuracy in last 10 vs prior 10 (need >= 5 in each window)
      CASE
        WHEN COUNT(*) FILTER (WHERE rn <= 10) < 5                    THEN 'stable'
        WHEN COUNT(*) FILTER (WHERE rn BETWEEN 11 AND 20) < 5        THEN 'stable'
        WHEN (
          AVG(is_correct::int) FILTER (WHERE rn <= 10) -
          AVG(is_correct::int) FILTER (WHERE rn BETWEEN 11 AND 20)
        ) > 0.15                                                      THEN 'improving'
        WHEN (
          AVG(is_correct::int) FILTER (WHERE rn BETWEEN 11 AND 20) -
          AVG(is_correct::int) FILTER (WHERE rn <= 10)
        ) > 0.15                                                      THEN 'struggling'
        ELSE 'stable'
      END AS trend
    FROM ranked
    GROUP BY student_id
  )
  SELECT
    ms.id                              AS student_id,
    ms.display_name,
    ms.selected_grade,
    ms.placement_band,
    COALESCE(ag.current_band, 1)       AS current_band,
    COALESCE(sp.total_attempts, 0)     AS total_attempts,
    COALESCE(ag.recent_correct_pct, 0) AS recent_correct_pct,
    COALESCE(ag.trend, 'stable')       AS trend
  FROM my_students ms
  LEFT JOIN student_progress sp ON sp.student_id = ms.id
  LEFT JOIN agg ag ON ag.student_id = ms.id
  ORDER BY ms.display_name;
END;
$$;
;
