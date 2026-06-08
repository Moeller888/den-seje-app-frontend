-- Fix B: Pre-filter already-served questions in get-next-question.
--
-- Root cause: the edge function queried questions without excluding those
-- already instanced for the student. It relied on unique-index insert failures
-- to skip served questions. With limit(50), a student who had answered ≥50
-- questions from a narrow domain would exhaust the batch, all inserts would
-- fail silently, and the function returned no_questions even though unserved
-- questions existed beyond the limit.
--
-- Fix: a new RPC that moves the NOT EXISTS exclusion into SQL, using the
-- idx_student_question_instance index efficiently.  The edge function calls
-- this instead of querying the questions table directly.
--
-- auth.uid() in SECURITY DEFINER returns the JWT caller's ID — same pattern
-- used by equip_item, set_active_theme, and other RPCs in this codebase.

CREATE OR REPLACE FUNCTION public.get_unserved_questions(
  p_grade   SMALLINT,
  p_domains TEXT[]
)
RETURNS TABLE (
  id              UUID,
  content         JSONB,
  answer_format   TEXT,
  answer_type     TEXT,
  metadata        JSONB,
  difficulty_band INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT q.id, q.content, q.answer_format, q.answer_type, q.metadata, q.difficulty_band
  FROM questions q
  WHERE q.is_active = true
    AND (p_grade IS NULL OR q.target_grade IS NULL OR q.target_grade <= p_grade)
    AND (p_domains IS NULL OR q.learning_objective = ANY(p_domains))
    AND NOT EXISTS (
      SELECT 1
      FROM question_instances qi
      WHERE qi.student_id  = auth.uid()
        AND qi.question_id = q.id
    )
  LIMIT 50;
$$;
