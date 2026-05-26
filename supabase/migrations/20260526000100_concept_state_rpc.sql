-- Concept State RPC: derives lightweight concept confidence states from answered questions.
--
-- Returns JSONB map: { "revolution": "stable", "kausalitet": "uncertain", ... }
--
-- Four states:
--   misconception_prone — 2+ incorrect answers with misconception_signal on this concept
--   stable             — 3+ correct, 0 incorrect on this concept
--   uncertain          — mixed correct/incorrect on this concept
--   emerging           — only 1 correct and no incorrect yet (or no data)
--
-- Safe defaults: if no questions have metadata.concepts, returns '{}'.
-- Teacher-readable: each state maps directly to human-understandable pedagogical meaning.
-- GDPR note: result is scoped entirely to p_student_id — no cross-student data.

CREATE OR REPLACE FUNCTION public.get_concept_states(p_student_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_object_agg(concept, state) INTO v_result
  FROM (
    SELECT
      concept,
      CASE
        WHEN count(CASE WHEN qi.misconception_signal IS NOT NULL AND qi.was_correct = false THEN 1 END) >= 2
          THEN 'misconception_prone'
        WHEN count(CASE WHEN qi.was_correct = true  THEN 1 END) >= 3
         AND count(CASE WHEN qi.was_correct = false THEN 1 END) = 0
          THEN 'stable'
        WHEN count(CASE WHEN qi.was_correct = true  THEN 1 END) >= 1
         AND count(CASE WHEN qi.was_correct = false THEN 1 END) >= 1
          THEN 'uncertain'
        ELSE 'emerging'
      END AS state
    FROM question_instances qi
    JOIN questions q ON q.id = qi.question_id
    CROSS JOIN jsonb_array_elements_text(q.metadata -> 'concepts') AS concept
    WHERE qi.student_id   = p_student_id
      AND qi.answered     = true
      AND q.metadata      IS NOT NULL
      AND jsonb_typeof(q.metadata -> 'concepts') = 'array'
    GROUP BY concept
  ) concept_states;

  RETURN COALESCE(v_result, '{}'::JSONB);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_concept_states(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_concept_states(UUID) IS
  'Derives concept confidence states (emerging | stable | uncertain | misconception_prone) from answered question_instances. Requires questions.metadata.concepts to be populated.';
