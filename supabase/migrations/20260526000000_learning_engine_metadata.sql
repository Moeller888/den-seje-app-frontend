-- Learning Engine Phase 1: metadata infrastructure
--
-- Adds two nullable columns. No existing rows affected. No behavior changes.
--
-- questions.metadata  — teacher-authored learning architecture per question.
--   Expected keys (all optional):
--     concepts TEXT[]          core concepts this question activates
--     cognitive_skill TEXT     recall | comprehension | causal_reasoning | transfer | synthesis | evaluation
--     misconception_type TEXT  recall_gap | conceptual_confusion | causal_inversion | pattern_misrecognition | terminology_confusion | overgeneralization
--     difficulty_type TEXT     factual | conceptual | applied | analytical
--     review_text TEXT         1–2 sentence educational explanation shown after incorrect answer
--     insight_type TEXT        causal | comparative | definitional | relational | evaluative
--     transfer_potential TEXT  low | medium | high
--     interdisciplinary TEXT[] other subjects this concept connects to
--
-- question_instances.misconception_signal — recorded when a student answers incorrectly
--   and the question has a misconception_type in metadata. Enables pattern detection.

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;

ALTER TABLE public.question_instances
  ADD COLUMN IF NOT EXISTS misconception_signal TEXT DEFAULT NULL;

COMMENT ON COLUMN public.questions.metadata IS
  'Optional learning metadata. Keys: concepts, cognitive_skill, misconception_type, difficulty_type, review_text, insight_type, transfer_potential, interdisciplinary';

COMMENT ON COLUMN public.question_instances.misconception_signal IS
  'Misconception type from question.metadata, recorded when student answers incorrectly. Null if correct or question has no misconception_type.';
