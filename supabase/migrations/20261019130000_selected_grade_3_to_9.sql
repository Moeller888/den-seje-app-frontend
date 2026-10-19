-- Klassetrin 3.-6. kan vælges: profiles.selected_grade og set_student_grade() går nu fra 3 til 9.
--
-- WHY. The grade selector (index.html) only offered 7., 8. and 9. klasse, and the database refused
-- anything else: profiles_selected_grade_check is IN (7, 8, 9) and set_student_grade() raises
-- 'invalid_grade' for other values (both 20260529000000_grade_difficulty_schema). Questions already
-- allow target_grade 3-9 (questions_target_grade_check, 20260529193254), and engelsk/dansk have
-- content for 3.-5. klasse, so younger pupils need to be able to pick their own grade.
--
-- WHAT CHANGES
--   1. profiles_selected_grade_check: IN (7, 8, 9) → BETWEEN 3 AND 9. Every existing value (NULL, 7,
--      8, 9) still satisfies it, so the swap cannot fail on existing rows.
--   2. set_student_grade(smallint): the only change is the accepted range and its error text.
--      Signature, SECURITY DEFINER, search_path, the not_authenticated error and the UPDATE are as in
--      20260529000000. A NULL p_grade is now rejected explicitly (before, NULL NOT IN (...) was NULL,
--      so it passed the guard and cleared the grade).
-- Grants are kept by CREATE OR REPLACE; nothing else is touched.
--
-- Before applying, read the LIVE definitions (pg_get_functiondef('public.set_student_grade(smallint)'::regprocedure)
-- and the constraint via pg_get_constraintdef). If either differs from 20260529000000, stop — this file
-- must then be rebuilt from the live state.
-- Må KUN anvendes via apply_migration med særskilt ejer-autorisation (D-110).

ALTER TABLE public.profiles
  DROP CONSTRAINT profiles_selected_grade_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_selected_grade_check
  CHECK (selected_grade IS NULL OR selected_grade BETWEEN 3 AND 9);

CREATE OR REPLACE FUNCTION public.set_student_grade(p_grade SMALLINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_grade IS NULL OR p_grade NOT BETWEEN 3 AND 9 THEN
    RAISE EXCEPTION 'invalid_grade: must be between 3 and 9';
  END IF;
  UPDATE public.profiles
  SET selected_grade = p_grade
  WHERE id = v_user_id;
END;
$$;

COMMENT ON FUNCTION public.set_student_grade(SMALLINT) IS
  'Students persist their grade selection (3-9). SECURITY DEFINER — profiles has no direct UPDATE policy.';

COMMENT ON COLUMN public.profiles.selected_grade IS
  'Grade selected by the student (3-9). NULL means not yet selected — triggers grade selection modal.';
