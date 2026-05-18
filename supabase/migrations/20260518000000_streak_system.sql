-- ============================================================
-- Streak system
--
-- Adds current_streak, longest_streak, last_activity_date
-- to student_progress, plus an update_streak helper that is
-- called inside process_text_answer and process_question_attempt
-- on every CAS win (first submitted answer per question).
--
-- Timezone: CURRENT_DATE in Postgres is always UTC on Supabase.
-- Using DATE (not TIMESTAMPTZ) eliminates sub-day ambiguity.
-- No client input influences the date — fully server-authoritative.
--
-- Anti-exploit layers:
--   1. CAS guard in the question RPCs (answered=false) means each
--      question instance can only fire update_streak once.
--   2. update_streak itself is idempotent: no-op if called on the
--      same UTC date (last_activity_date = CURRENT_DATE guard).
--   3. All date logic is server-side; clients provide nothing.
-- ============================================================

-- 1. Schema additions
ALTER TABLE public.student_progress
  ADD COLUMN IF NOT EXISTS current_streak     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS longest_streak     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_activity_date DATE;


-- 2. update_streak helper
--    Server-authoritative, UTC-based, idempotent.
--    Called from within SECURITY DEFINER RPCs — never from clients.
CREATE OR REPLACE FUNCTION public.update_streak(p_student_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today       DATE    := CURRENT_DATE;   -- UTC, Supabase guarantee
  v_last_date   DATE;
  v_curr_streak INTEGER;
  v_new_streak  INTEGER;
BEGIN
  SELECT last_activity_date, current_streak
  INTO   v_last_date, v_curr_streak
  FROM   public.student_progress
  WHERE  student_id = p_student_id;

  -- No row: nothing to update (student_progress created on first answer).
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Already counted today: idempotent no-op.
  IF v_last_date = v_today THEN
    RETURN;
  END IF;

  -- Consecutive day → extend; any gap → reset to 1.
  v_new_streak := CASE
    WHEN v_last_date = v_today - INTERVAL '1 day'
      THEN COALESCE(v_curr_streak, 0) + 1
    ELSE 1
  END;

  UPDATE public.student_progress
  SET
    current_streak     = v_new_streak,
    longest_streak     = GREATEST(COALESCE(longest_streak, 0), v_new_streak),
    last_activity_date = v_today
  WHERE student_id = p_student_id;
END;
$$;


-- 3. Patch process_text_answer: add update_streak call on CAS win.
--    Any answered question (correct or incorrect) grows the streak.
--    The existing CAS guard (answered=false) ensures this fires once
--    per question instance; update_streak's own date guard makes it
--    a no-op if another question was already answered today.
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
      xp    = COALESCE(xp, 0) + 10,
      coins = COALESCE(coins, 0) + 5
    WHERE student_id = p_user_id;
  END IF;

  -- Update streak: any answered question counts, correct or not.
  PERFORM update_streak(p_user_id);

  RETURN CASE p_is_correct WHEN true THEN 'rewarded' ELSE 'recorded' END;
END;
$$;


-- 4. Patch process_question_attempt: add update_streak call on CAS win.
--    Preserves the exact existing logic; only adds PERFORM update_streak
--    at the single point after a confirmed CAS win.
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

  -- Idempotency: already processed → return result, no re-award, no streak.
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

  -- Text fallback guard: handled by process_text_answer in normal flow.
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

  -- Concurrent request beat us — no re-award, no streak.
  IF v_rows_updated = 0 THEN
    RETURN json_build_object(
      'status',         CASE WHEN v_correct THEN 'correct' ELSE 'incorrect' END,
      'correct_answer', v_instance.correct_answer
    );
  END IF;

  IF v_correct THEN
    UPDATE student_progress
    SET
      xp    = COALESCE(xp, 0) + 10,
      coins = COALESCE(coins, 0) + 5
    WHERE student_id = p_student_id;
  END IF;

  -- Update streak: any answered question counts, correct or not.
  PERFORM public.update_streak(p_student_id);

  RETURN json_build_object(
    'status',         CASE WHEN v_correct THEN 'correct' ELSE 'incorrect' END,
    'correct_answer', v_instance.correct_answer
  );

END;
$function$;
