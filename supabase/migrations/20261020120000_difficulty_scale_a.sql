-- Sværhedsskala 1-10.000, migration A (additiv): opgavens niveau og elevens niveau pr. fag.
--
-- WHY. Design docs/difficulty-scale-design.md (PR #353), owner decisions B1-B8 of 2026-10-20: one
-- continuous difficulty scale 1-10000 per subject, the grade only seeds the starting level and is
-- never a ceiling. This file only ADDS the storage. Nothing reads it yet: selection, the level step
-- and the Edge flag LEVEL_ENGINE come in migration B, which is built on PR #351 (B6).
--
-- WHAT CHANGES
--   1. difficulty_level_from_grade_band(grade, band): the start formula of design §4.1. The 35 cells
--      grade 3-9 × band 1-5 each get the midpoint of an equal share of 1-10000:
--        cell  = (grade - 3) * 5 + (band - 1)                -- 0 … 34
--        level = round((cell + 0.5) * 10000 / 35)            -- 143 … 9857
--      Any argument NULL or outside its range returns NULL — never a guessed level.
--   2. questions.difficulty_level integer, CHECK 1-10000, NULL allowed (= not yet on the scale), and
--      a partial index (learning_objective, difficulty_level) WHERE is_active for migration B.
--   3. Backfill: every question with BOTH target_grade and difficulty_band gets the formula's level.
--      Questions missing either stay NULL. Their default is an owner decision (design §5.3), so
--      LEVEL_ENGINE must not be switched on while the check query below returns rows.
--   4. student_subject_level(student_id, subject, level, answered, updated_at): the pupil's level
--      per subject ('historie' | 'engelsk' | 'dansk', as get-next-question/scope.ts). Server-owned:
--      RLS on, ONE policy (a user reads their own rows), and every table privilege revoked from
--      anon and authenticated except SELECT for authenticated. No client can insert or change a
--      level. Rows are created by migration B's functions, not here.
--
-- NOT CHANGED: target_grade, difficulty_band, profiles.current_band/placement_band, every function.
-- The live flow is byte-for-byte the same after this migration.
--
-- CHECK BEFORE APPLYING (read-only). Questions this migration leaves without a level, per subject:
--   SELECT learning_objective, count(*) FROM public.questions
--   WHERE target_grade IS NULL OR difficulty_band IS NULL
--   GROUP BY 1 ORDER BY 1;
-- Report the result to the owner. The same query after applying must return the same rows.
-- Må KUN anvendes via apply_migration med særskilt ejer-autorisation (D-110).

CREATE FUNCTION public.difficulty_level_from_grade_band(p_grade integer, p_band integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_grade BETWEEN 3 AND 9 AND p_band BETWEEN 1 AND 5
      THEN round((((p_grade - 3) * 5 + (p_band - 1)) + 0.5) * 10000.0 / 35)::integer
    ELSE NULL
  END
$$;

COMMENT ON FUNCTION public.difficulty_level_from_grade_band(integer, integer) IS
  'Start level 1-10000 for grade 3-9 and band 1-5 (design §4.1). NULL for a missing or out-of-range argument.';

REVOKE ALL ON FUNCTION public.difficulty_level_from_grade_band(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.difficulty_level_from_grade_band(integer, integer) TO service_role;

ALTER TABLE public.questions
  ADD COLUMN difficulty_level integer;

ALTER TABLE public.questions
  ADD CONSTRAINT questions_difficulty_level_check
  CHECK (difficulty_level IS NULL OR difficulty_level BETWEEN 1 AND 10000);

COMMENT ON COLUMN public.questions.difficulty_level IS
  'Difficulty 1 (easiest) to 10000 on the scale shared by all grades of a subject. NULL = not yet on the scale.';

CREATE INDEX idx_questions_objective_level
  ON public.questions (learning_objective, difficulty_level)
  WHERE is_active;

UPDATE public.questions
SET difficulty_level = public.difficulty_level_from_grade_band(target_grade, difficulty_band)
WHERE target_grade IS NOT NULL
  AND difficulty_band IS NOT NULL;

CREATE TABLE public.student_subject_level (
  student_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject     text        NOT NULL CHECK (subject IN ('historie', 'engelsk', 'dansk')),
  level       integer     NOT NULL CHECK (level BETWEEN 1 AND 10000),
  answered    integer     NOT NULL DEFAULT 0 CHECK (answered >= 0),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, subject)
);

COMMENT ON TABLE public.student_subject_level IS
  'The pupil''s level 1-10000 per subject. Server-owned: written only by SECURITY DEFINER functions and the backend key.';

ALTER TABLE public.student_subject_level ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own subject level"
  ON public.student_subject_level
  FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

REVOKE ALL ON public.student_subject_level FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.student_subject_level TO authenticated;
GRANT ALL ON public.student_subject_level TO service_role;
