-- ============================================================
-- Fix correct_answers counter in student_progress.
--
-- Root cause: process_text_answer and process_question_attempt
-- never incremented correct_answers / total_correct_answers.
-- Hub was querying question_instances.was_correct which misses
-- all historical rows that only have is_correct set.
--
-- This migration:
-- 1. Backfills correct_answers from question_instances history
--    (takes GREATEST of existing value vs qi counts — never decrements).
-- 2. Patches process_text_answer to increment both counters on win.
-- 3. Patches process_question_attempt to increment both counters on win.
-- ============================================================


-- ── 1. Backfill correct_answers from question_instances ──────────────────────
--
-- Two historical eras:
--   Old system: is_correct = true (was_correct is NULL)
--   New system: was_correct = true AND answered = true
--
-- We take the GREATEST of what already exists vs each era's count so this
-- is safe to re-run: it never decrements the counter.

UPDATE public.student_progress sp
SET correct_answers = GREATEST(
  COALESCE(sp.correct_answers, 0),
  (
    SELECT COUNT(*)::integer
    FROM   public.question_instances qi
    WHERE  qi.student_id  = sp.student_id
      AND  qi.is_correct  = true
  ),
  (
    SELECT COUNT(*)::integer
    FROM   public.question_instances qi
    WHERE  qi.student_id  = sp.student_id
      AND  qi.was_correct = true
      AND  qi.answered    = true
  )
);


-- ── 2. process_text_answer (patched: increments correct_answers on win) ──────

CREATE OR REPLACE FUNCTION public.process_text_answer(
  p_instance_id  UUID,
  p_user_id      UUID,
  p_user_answer  TEXT,
  p_is_correct   BOOLEAN
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows_updated INTEGER;
  v_next_review  TIMESTAMPTZ;
BEGIN
  v_next_review := CASE p_is_correct
    WHEN true THEN now() + INTERVAL '1 day'
    ELSE            now() + INTERVAL '10 minutes'
  END;

  UPDATE question_instances
  SET
    user_answer    = p_user_answer,
    was_correct    = p_is_correct,
    answered       = true,
    answered_at    = now(),
    next_review_at = v_next_review
  WHERE id         = p_instance_id
    AND student_id = p_user_id
    AND answered   = false;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    RETURN 'already_processed';
  END IF;

  IF p_is_correct THEN
    UPDATE student_progress
    SET
      xp                    = COALESCE(xp, 0) + 10,
      coins                 = COALESCE(coins, 0) + 5,
      correct_answers       = COALESCE(correct_answers, 0) + 1,
      total_correct_answers = COALESCE(total_correct_answers, 0) + 1
    WHERE student_id = p_user_id;
  END IF;

  PERFORM update_streak(p_user_id);
  PERFORM update_quest_progress_for_answer(
    p_user_id,
    p_is_correct,
    CASE WHEN p_is_correct THEN 10 ELSE 0 END
  );

  RETURN CASE p_is_correct WHEN true THEN 'rewarded' ELSE 'recorded' END;
END;
$$;


-- ── 3. process_question_attempt (patched: increments correct_answers on win) ─

CREATE OR REPLACE FUNCTION public.process_question_attempt(
  p_student_id            uuid,
  p_question_instance_id  uuid,
  p_answer                text,
  p_question_shown_at     bigint
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_instance       record;
  v_correct        boolean := false;
  v_answer         text;
  v_correct_answer text;
  v_rows_updated   integer;
BEGIN

  SELECT qi.*, q.answer_format
  INTO v_instance
  FROM question_instances qi
  JOIN questions q ON q.id = qi.question_id
  WHERE qi.id         = p_question_instance_id
    AND qi.student_id = p_student_id;

  IF v_instance IS NULL THEN
    RAISE EXCEPTION 'Instance not found';
  END IF;

  IF v_instance.answered = true THEN
    RETURN json_build_object(
      'status', CASE
        WHEN v_instance.was_correct = true  THEN 'correct'
        WHEN v_instance.was_correct = false THEN 'incorrect'
        ELSE 'pending'
      END,
      'correct_answer', v_instance.correct_answer
    );
  END IF;

  IF v_instance.answer_format = 'text' THEN
    UPDATE question_instances
    SET answered = true, answered_at = now(), user_answer = p_answer, was_correct = null
    WHERE id = v_instance.id AND answered = false;

    RETURN json_build_object('status', 'pending', 'correct_answer', null);
  END IF;

  v_answer         := trim(regexp_replace(lower(p_answer),                   '[^a-z0-9]', '', 'g'));
  v_correct_answer := trim(regexp_replace(lower(v_instance.correct_answer), '[^a-z0-9]', '', 'g'));

  IF v_answer = v_correct_answer THEN
    v_correct := true;
  END IF;

  UPDATE question_instances
  SET
    answered    = true,
    answered_at = now(),
    user_answer = p_answer,
    was_correct = v_correct
  WHERE id       = v_instance.id
    AND answered = false;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    RETURN json_build_object(
      'status',         CASE WHEN v_correct THEN 'correct' ELSE 'incorrect' END,
      'correct_answer', v_instance.correct_answer
    );
  END IF;

  IF v_correct THEN
    UPDATE student_progress
    SET
      xp                    = COALESCE(xp, 0) + 10,
      coins                 = COALESCE(coins, 0) + 5,
      correct_answers       = COALESCE(correct_answers, 0) + 1,
      total_correct_answers = COALESCE(total_correct_answers, 0) + 1
    WHERE student_id = p_student_id;
  END IF;

  PERFORM public.update_streak(p_student_id);
  PERFORM public.update_quest_progress_for_answer(
    p_student_id,
    v_correct,
    CASE WHEN v_correct THEN 10 ELSE 0 END
  );

  RETURN json_build_object(
    'status',         CASE WHEN v_correct THEN 'correct' ELSE 'incorrect' END,
    'correct_answer', v_instance.correct_answer
  );

END;
$function$;
