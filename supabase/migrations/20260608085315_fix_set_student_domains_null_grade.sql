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
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id         = p_student_id
      AND teacher_id = auth.uid()
      AND role       = 'student'
  ) THEN
    RAISE EXCEPTION 'Not authorized: caller is not the teacher of this student';
  END IF;

  IF p_domains IS NOT NULL AND array_length(p_domains, 1) > 0 THEN
    SELECT selected_grade INTO v_grade
    FROM profiles WHERE id = p_student_id;

    SELECT d INTO v_bad_domain
    FROM unnest(p_domains) AS d
    WHERE NOT EXISTS (
      SELECT 1 FROM questions
      WHERE is_active           = true
        AND (
          v_grade IS NULL
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

  UPDATE profiles
  SET active_domains = p_domains
  WHERE id = p_student_id;
END;
$$;;
