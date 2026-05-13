-- ============================================================
-- Atomic, idempotent short-text answer processing.
--
-- Why this is race-condition safe:
--   PostgreSQL row-level locking ensures that if two concurrent
--   requests both see answered=false and race to UPDATE, only
--   one transaction wins (ROW_COUNT = 1). The loser finds
--   answered=true and gets ROW_COUNT = 0 → no reward issued.
--   This is guaranteed by MVCC + row locking — no application-
--   level guard is needed or sufficient on its own.
-- ============================================================

-- 1. New atomic RPC: replaces award_correct_answer + the
--    manual UPDATE question_instances calls in process-event.
--    Sets answered=true, was_correct, next_review_at, and awards
--    coins/XP — all inside a single transaction with a CAS guard.
CREATE OR REPLACE FUNCTION public.process_text_answer(
  p_instance_id  UUID,
  p_user_id      UUID,
  p_user_answer  TEXT,
  p_is_correct   BOOLEAN
)
RETURNS TEXT   -- 'rewarded' | 'recorded' | 'already_processed'
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

  -- CAS: only proceed if this instance has not been answered yet.
  -- The WHERE answered = false is the race-condition guard.
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

  -- Another request already processed this instance — return without awarding.
  IF v_rows_updated = 0 THEN
    RETURN 'already_processed';
  END IF;

  -- We won the race: safe to award exactly once.
  IF p_is_correct THEN
    UPDATE student_progress
    SET
      xp    = COALESCE(xp, 0) + 10,
      coins = COALESCE(coins, 0) + 5
    WHERE student_id = p_user_id;
  END IF;

  RETURN CASE p_is_correct WHEN true THEN 'rewarded' ELSE 'recorded' END;
END;
$$;


-- 2. Make process_question_attempt (MC path) idempotent.
--    Original had no guard: re-calling awarded coins twice.
--    Fix: CAS on answered=false, early-return if already done.
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
  v_instance      record;
  v_correct       boolean := false;
  v_answer        text;
  v_correct_answer text;
  v_rows_updated  integer;
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

  -- Idempotency: already processed → return existing result, no re-award.
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

  -- Text format is handled by process_text_answer; guard here too.
  IF v_instance.answer_format = 'text' THEN
    UPDATE question_instances
    SET answered = true, answered_at = now(), user_answer = p_answer, was_correct = null
    WHERE id = v_instance.id AND answered = false;

    RETURN json_build_object('status', 'pending', 'correct_answer', null);
  END IF;

  -- MC / number: normalise and compare.
  v_answer         := trim(regexp_replace(lower(p_answer),                    '[^a-z0-9]', '', 'g'));
  v_correct_answer := trim(regexp_replace(lower(v_instance.correct_answer),  '[^a-z0-9]', '', 'g'));

  IF v_answer = v_correct_answer THEN
    v_correct := true;
  END IF;

  -- CAS: only mark answered if not already done.
  UPDATE question_instances
  SET
    answered    = true,
    answered_at = now(),
    user_answer = p_answer,
    was_correct = v_correct
  WHERE id       = v_instance.id
    AND answered = false;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  -- Another request beat us — return result without awarding.
  IF v_rows_updated = 0 THEN
    RETURN json_build_object(
      'status',         CASE WHEN v_correct THEN 'correct' ELSE 'incorrect' END,
      'correct_answer', v_instance.correct_answer
    );
  END IF;

  -- We won the race: award once.
  IF v_correct THEN
    UPDATE student_progress
    SET
      xp    = COALESCE(xp, 0) + 10,
      coins = COALESCE(coins, 0) + 5
    WHERE student_id = p_student_id;
  END IF;

  RETURN json_build_object(
    'status',         CASE WHEN v_correct THEN 'correct' ELSE 'incorrect' END,
    'correct_answer', v_instance.correct_answer
  );

END;
$function$;


-- 3. Remove the old non-idempotent function.
DROP FUNCTION IF EXISTS public.award_correct_answer(uuid);
