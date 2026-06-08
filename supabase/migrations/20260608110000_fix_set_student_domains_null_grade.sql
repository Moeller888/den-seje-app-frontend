-- Section 145-fix: Close the null-grade bypass in set_student_domains.
--
-- Bug: when profiles.selected_grade IS NULL the entire domain accessibility
-- check was skipped (guarded by IF v_grade IS NOT NULL).  A teacher could
-- assign any domain string — including nonexistent ones or high-grade domains
-- (world_war_2, cold_war) — to a student who had not yet selected a grade.
-- When the student subsequently selected a low grade the question pool for
-- the assigned domain became empty, producing the silent "no_questions" state.
--
-- Fix: always validate.  When v_grade IS NULL the inner WHERE condition
-- (v_grade IS NULL OR target_grade IS NULL OR target_grade <= v_grade)
-- collapses to TRUE, so the query checks only that the domain has *any*
-- active question at all — no grade filter.  When v_grade IS NOT NULL the
-- condition is identical to the original grade-filtered check.
--
-- Error messages are differentiated so teachers see the right guidance.

CREATE OR REPLACE FUNCTION public.set_student_domains(
  p_student_id UUID,
  p_domains    TEXT[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_grade      SMALLINT;
  v_bad_domain TEXT;
BEGIN
  -- 1. Teacher ownership check (unchanged)
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id         = p_student_id
      AND teacher_id = auth.uid()
      AND role       = 'student'
  ) THEN
    RAISE EXCEPTION 'Not authorized: caller is not the teacher of this student';
  END IF;

  -- 2. Validate domain accessibility when assigning specific domains.
  --    Always runs — grade IS NULL no longer bypasses the check.
  IF p_domains IS NOT NULL AND array_length(p_domains, 1) > 0 THEN
    SELECT selected_grade INTO v_grade
    FROM profiles WHERE id = p_student_id;

    SELECT d INTO v_bad_domain
    FROM unnest(p_domains) AS d
    WHERE NOT EXISTS (
      SELECT 1 FROM questions
      WHERE is_active           = true
        AND (
          v_grade IS NULL                        -- no grade: accept any question in the domain
          OR target_grade IS NULL
          OR target_grade <= v_grade
        )
        AND learning_objective = d
      LIMIT 1
    )
    LIMIT 1;

    IF v_bad_domain IS NOT NULL THEN
      IF v_grade IS NULL THEN
        RAISE EXCEPTION
          'Domain "%" does not exist or has no questions. Check the domain key and try again.',
          v_bad_domain;
      ELSE
        RAISE EXCEPTION
          'Domain "%" has no accessible questions for grade % students. Choose a different domain or update the student''s grade.',
          v_bad_domain, v_grade;
      END IF;
    END IF;
  END IF;

  -- 3. Write
  UPDATE profiles
  SET active_domains = p_domains
  WHERE id = p_student_id;
END;
$$;
