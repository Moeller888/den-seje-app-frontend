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
$$;;
