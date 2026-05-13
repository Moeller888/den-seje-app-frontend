-- Grants XP and coins for a short-text correct answer.
-- Called by process-event when format includes "text" and isTextCorrect returns true.
-- Mirrors the reward values in process_question_attempt (10 XP, 5 coins).
CREATE OR REPLACE FUNCTION public.award_correct_answer(p_student_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.student_progress
  SET
    xp    = COALESCE(xp, 0) + 10,
    coins = COALESCE(coins, 0) + 5
  WHERE student_id = p_student_id;
$$;
