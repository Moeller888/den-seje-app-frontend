-- Section 70 — Grade-Level Architecture & Adaptive Difficulty
-- Part 1: Schema additions
--
-- questions.target_grade SMALLINT
--   Minimum grade this question is appropriate for.
--   7 = shown to grades 7, 8, 9
--   8 = shown to grades 8 and 9 only
--   9 = shown to grade 9 only
--   NULL = no filter (backwards compatible, treated as 7)
--
-- questions.difficulty_band SMALLINT
--   Conceptual difficulty 1 (easiest) to 5 (hardest).
--   Used by adaptive difficulty engine to prefer grade-appropriate challenge.
--
-- profiles.selected_grade SMALLINT
--   The grade the student has selected (7, 8, or 9). NULL = not yet chosen.
--
-- set_student_grade(SMALLINT) SECURITY DEFINER RPC
--   Profiles has no direct UPDATE policy — all mutations go through RPCs.
--   Students call this to persist their grade selection.

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS target_grade SMALLINT DEFAULT NULL;

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS difficulty_band SMALLINT DEFAULT NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS selected_grade SMALLINT DEFAULT NULL;

-- Index for efficient grade + difficulty filtering in get-next-question
CREATE INDEX IF NOT EXISTS idx_questions_grade_band
  ON public.questions(target_grade, difficulty_band);

-- Validate grade values at DB level
ALTER TABLE public.questions
  ADD CONSTRAINT questions_target_grade_check
  CHECK (target_grade IS NULL OR target_grade IN (7, 8, 9));

ALTER TABLE public.questions
  ADD CONSTRAINT questions_difficulty_band_check
  CHECK (difficulty_band IS NULL OR (difficulty_band BETWEEN 1 AND 5));

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_selected_grade_check
  CHECK (selected_grade IS NULL OR selected_grade IN (7, 8, 9));

-- SECURITY DEFINER RPC — students set their own grade.
-- Called from app.js after grade selection modal.
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
  IF p_grade NOT IN (7, 8, 9) THEN
    RAISE EXCEPTION 'invalid_grade: must be 7, 8, or 9';
  END IF;
  UPDATE public.profiles
  SET selected_grade = p_grade
  WHERE id = v_user_id;
END;
$$;

COMMENT ON FUNCTION public.set_student_grade(SMALLINT) IS
  'Students persist their grade selection (7, 8, or 9). SECURITY DEFINER — profiles has no direct UPDATE policy.';

COMMENT ON COLUMN public.questions.target_grade IS
  'Minimum grade level for this question. 7=all grades, 8=grades 8-9, 9=grade 9 only. NULL=no filter.';

COMMENT ON COLUMN public.questions.difficulty_band IS
  'Conceptual difficulty 1 (easiest) to 5 (hardest). Used by adaptive difficulty engine.';

COMMENT ON COLUMN public.profiles.selected_grade IS
  'Grade selected by the student (7, 8, or 9). NULL means not yet selected — triggers grade selection modal.';
