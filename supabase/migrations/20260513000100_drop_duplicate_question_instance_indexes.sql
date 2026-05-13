-- Remove 4 redundant indexes on question_instances.
-- Each dropped index is either an exact duplicate of a surviving
-- index or a non-unique copy of a stronger unique index.
--
-- Kept:
--   idx_one_open_question             UNIQUE (student_id) WHERE answered=false
--   idx_student_question_instance     UNIQUE (student_id, question_id)
--   idx_qi_question                   (question_id)
--   idx_qi_student_created            (student_id, created_at DESC)
--   idx_question_instances_student_due (student_id, next_review_at)

DROP INDEX IF EXISTS public.one_open_instance_per_student;
DROP INDEX IF EXISTS public.question_instances_student_open_idx;
DROP INDEX IF EXISTS public.idx_question_instances_question_id;
DROP INDEX IF EXISTS public.question_instances_student_question_idx;
