-- Let a pupil keep practising once every question for their grade has been answered.
--
-- THE PROBLEM
-- A pupil in grade 7 has 490 active questions available (target_grade <= 7). Once all 490 have
-- been answered, get_unserved_questions() returns nothing — it excludes every question already
-- instanced for that pupil — and get-next-question replies {step: "no_questions"}. The quiz then
-- shows "Du har ingen flere spørgsmål lige nu" permanently. Two of the ten grade-7 pupils are
-- already in that state; the other eight will reach it.
--
-- Spaced repetition is half-built already: question_instances.next_review_at exists, there is an
-- index on (student_id, next_review_at), and get-next-question has a DUE step that runs before
-- new questions. The loop is simply never closed — that step filters on `answered = false`, and
-- nothing ever puts an answered question back in play.
--
-- WHAT THIS MIGRATION ADDS
-- A server-side fallback: when — and only when — a pupil's unserved pool is empty, one already
-- answered auto-graded instance is reset so the existing DUE machinery serves it again.
--
-- THE SCHEMA CONSTRAINS THE SHAPE
-- Two unique indexes encode "each question is answered once, ever":
--     idx_student_question_instance  UNIQUE (student_id, question_id)
--     idx_one_open_question          UNIQUE (student_id) WHERE answered = false
-- The first makes a second instance for the same question impossible, so a repeat must reuse the
-- existing row. The second means a reset may only happen when the pupil has no open question.
-- Both are respected below rather than worked around.
--
-- AUTO-GRADED ONLY
-- Reuse overwrites user_answer and was_correct. For teacher-graded work that would be destructive:
-- a long answer a teacher had already scored could revert to ungraded and reappear in the grading
-- queue. Repeats are therefore restricted to questions that carry no teacher-owned state —
-- answer_format <> 'text', answer_type <> 'long', and teacher_score IS NULL. Today every active
-- question is answer_format 'mc' / answer_type 'short', so this costs nothing; the filter is
-- written defensively because the inactive 'number' and 'text' questions could be reactivated.
--
-- WHAT A REPEAT IS WORTH
-- A repeat awards 2 XP and nothing else. Not 10 XP, and no coins: a pupil who has exhausted the
-- pool knows the answers to all 490 questions, so a full award would turn the economy into an
-- unbounded XP and coin faucet. That is the farming hole tracked as debt item D, and this
-- migration must not open it.
--
-- For the same reason a repeat does NOT increment correct_answers or total_correct_answers —
-- those feed the accuracy figure teachers read, and inflating it with re-answers of known
-- material would make it meaningless — and does NOT feed daily or weekly quest progress, whose
-- rewards are coins. The streak IS still updated: a streak measures showing up on consecutive
-- days, and a pupil practising repeats has genuinely shown up.
--
-- repeat_count RATHER THAN AN IMPLICIT MARKER
-- process_question_attempt has to tell a repeat from a first attempt to award correctly. That
-- could be inferred from "answered = false AND answered_at IS NOT NULL", but an implicit marker
-- is fragile: any future change that clears answered_at would silently restore the full award and
-- reopen the farming hole. An explicit counter states the rule and also shows whether the feature
-- is working at all — the cautionary example being incorrect_attempts, misconception_signal and
-- next_due, which are dead scaffolding from earlier attempts at this feature precisely because
-- nothing ever observed them. ADD COLUMN with a non-volatile default does not rewrite the table.
--
-- SELECTION ORDER
-- Questions answered incorrectly come first, oldest answer first within each group. The pupil who
-- prompted this has 319 incorrect answers out of 490, so there is ample material where repetition
-- is pedagogically useful rather than merely filler.
--
-- WHAT THIS MIGRATION DOES NOT DO
-- No RLS policy is added, removed or altered. No view, index or other table is changed. No data
-- is modified: the backfill of repeat_count is the column default, 0, which is correct for every
-- existing row. get_unserved_questions is untouched.

-- ── 1. An explicit repeat counter ────────────────────────────────────────────
ALTER TABLE public.question_instances
  ADD COLUMN IF NOT EXISTS repeat_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.question_instances.repeat_count IS
  'Times this instance has been re-served after being answered. 0 = never repeated. '
  'Drives the reduced award in process_question_attempt; see 20260928000000.';

-- ── 2. The fallback: reset one answered instance, but only if the pool is empty ──
CREATE OR REPLACE FUNCTION public.request_repeat_question(
  p_grade   smallint,
  p_domains text[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid         uuid := (SELECT auth.uid());
  v_instance_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  -- The caller already has an open question: serve that, never a new repeat. This also keeps
  -- idx_one_open_question satisfied.
  IF EXISTS (
    SELECT 1 FROM public.question_instances qi
    WHERE qi.student_id = v_uid AND qi.answered = false
  ) THEN
    RETURN NULL;
  END IF;

  -- Repeats are a last resort. Verified here rather than trusted from the caller, so a client
  -- cannot skip straight to repeats while unseen questions remain.
  IF EXISTS (
    SELECT 1
    FROM public.questions q
    WHERE q.is_active
      AND (p_grade IS NULL OR q.target_grade IS NULL OR q.target_grade <= p_grade)
      AND (p_domains IS NULL OR q.learning_objective = ANY(p_domains))
      AND NOT EXISTS (
        SELECT 1 FROM public.question_instances qi
        WHERE qi.student_id = v_uid AND qi.question_id = q.id
      )
  ) THEN
    RETURN NULL;
  END IF;

  -- Incorrect first, oldest answer first within each group.
  SELECT qi.id
  INTO v_instance_id
  FROM public.question_instances qi
    JOIN public.questions q ON q.id = qi.question_id
  WHERE qi.student_id  = v_uid
    AND qi.answered    = true
    AND qi.teacher_score IS NULL            -- never reopen teacher-graded work
    AND q.is_active
    AND q.answer_format <> 'text'           -- auto-graded only: no teacher-owned state
    AND coalesce(q.answer_type, 'short') <> 'long'
    AND (p_grade IS NULL OR q.target_grade IS NULL OR q.target_grade <= p_grade)
    AND (p_domains IS NULL OR q.learning_objective = ANY(p_domains))
  ORDER BY
    (qi.was_correct IS NOT FALSE),          -- false sorts first
    qi.answered_at ASC NULLS FIRST
  LIMIT 1;

  IF v_instance_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.question_instances
  SET answered       = false,
      user_answer    = NULL,
      was_correct    = NULL,
      answered_at    = NULL,
      next_review_at = now(),
      repeat_count   = repeat_count + 1
  WHERE id = v_instance_id
    AND student_id = v_uid
    AND answered = true;                    -- lost race: another call already reopened it

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN v_instance_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.request_repeat_question(smallint, text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.request_repeat_question(smallint, text[]) FROM anon;
GRANT  EXECUTE ON FUNCTION public.request_repeat_question(smallint, text[]) TO authenticated;

-- ── 3. Award less for a repeat ───────────────────────────────────────────────
-- Unchanged from the version in production except for the repeat branch: the idempotency guard,
-- the text-answer path, the answer normalisation and the return shape are all identical.
CREATE OR REPLACE FUNCTION public.process_question_attempt(
  p_student_id          uuid,
  p_question_instance_id uuid,
  p_answer              text,
  p_question_shown_at   bigint
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_instance       record;
  v_correct        boolean := false;
  v_answer         text;
  v_correct_answer text;
  v_rows_updated   integer;
  v_is_repeat      boolean := false;
  v_xp             integer := 0;
  v_coins          integer := 0;
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

  v_is_repeat := coalesce(v_instance.repeat_count, 0) > 0;

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

  -- A concurrent call already scored this instance: award nothing, report the same result.
  IF v_rows_updated = 0 THEN
    RETURN json_build_object(
      'status',         CASE WHEN v_correct THEN 'correct' ELSE 'incorrect' END,
      'correct_answer', v_instance.correct_answer
    );
  END IF;

  IF v_correct THEN
    IF v_is_repeat THEN
      -- A repeat earns a token amount of XP and nothing else. correct_answers and
      -- total_correct_answers stay put: they feed the accuracy figure teachers read, and
      -- re-answers of already known material would inflate it.
      v_xp := 2;
      UPDATE student_progress
      SET xp = COALESCE(xp, 0) + v_xp
      WHERE student_id = p_student_id;
    ELSE
      v_xp    := 10;
      v_coins := 5;
      UPDATE student_progress
      SET
        xp                    = COALESCE(xp, 0) + v_xp,
        coins                 = COALESCE(coins, 0) + v_coins,
        correct_answers       = COALESCE(correct_answers, 0) + 1,
        total_correct_answers = COALESCE(total_correct_answers, 0) + 1
      WHERE student_id = p_student_id;
    END IF;
  END IF;

  -- A streak measures showing up, which a pupil practising repeats has genuinely done.
  PERFORM public.update_streak(p_student_id);

  -- Quest progress is NOT advanced by repeats: quest rewards are coins, and the pool-exhausted
  -- pupil could otherwise complete quests indefinitely on questions they already know.
  IF NOT v_is_repeat THEN
    PERFORM public.update_quest_progress_for_answer(
      p_student_id,
      v_correct,
      CASE WHEN v_correct THEN 10 ELSE 0 END
    );
    PERFORM public.update_weekly_quest_progress_for_answer(
      p_student_id,
      v_correct,
      CASE WHEN v_correct THEN 10 ELSE 0 END
    );
  END IF;

  RETURN json_build_object(
    'status',         CASE WHEN v_correct THEN 'correct' ELSE 'incorrect' END,
    'correct_answer', v_instance.correct_answer
  );

END;
$$;
