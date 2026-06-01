-- Section 99: Domain Focus Safety — validate domain accessibility by grade.
--
-- Before writing active_domains, verify each assigned domain has at least one
-- accessible question for the student's selected_grade. This prevents teachers
-- from unknowingly assigning a domain that produces zero questions for a student
-- (e.g. world_war_2 / cold_war for a grade-7 student).
--
-- NULL p_domains (reset to all) is always permitted.
-- NULL student grade (no grade selected) is always permitted (no filter applied).
-- Fails with a clear message naming the inaccessible domain and the student's grade.
--
-- Accessibility check mirrors get-next-question: target_grade IS NULL OR target_grade <= grade.

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

  -- 2. Validate domain accessibility when assigning specific domains
  IF p_domains IS NOT NULL AND array_length(p_domains, 1) > 0 THEN
    SELECT selected_grade INTO v_grade
    FROM profiles WHERE id = p_student_id;

    -- Only validate when the student has a grade set.
    -- NULL grade means no grade filter is applied → all questions accessible.
    IF v_grade IS NOT NULL THEN
      SELECT d INTO v_bad_domain
      FROM unnest(p_domains) AS d
      WHERE NOT EXISTS (
        SELECT 1 FROM questions
        WHERE is_active        = true
          AND (target_grade IS NULL OR target_grade <= v_grade)
          AND learning_objective = d
        LIMIT 1
      )
      LIMIT 1;

      IF v_bad_domain IS NOT NULL THEN
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
