-- ============================================================
-- Weekly Quests System
--
-- Adds weekly quest tables, progress tracking RPCs, claim RPC,
-- and patches process_question_attempt + process_text_answer
-- to call update_weekly_quest_progress_for_answer().
--
-- ISO week key format: "YYYY-WW" (PostgreSQL TO_CHAR IYYY-IW)
-- e.g. "2026-21" — matches JS getISOWeekKey() in hub.html
-- ============================================================


-- ── 1. weekly_quests table ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.weekly_quests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_key    TEXT NOT NULL UNIQUE,
  type         TEXT NOT NULL CHECK (type IN ('answer_count', 'correct_count', 'xp_earned')),
  target       INTEGER NOT NULL CHECK (target > 0),
  reward_coins INTEGER NOT NULL CHECK (reward_coins > 0),
  label        TEXT NOT NULL,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  is_active    BOOLEAN NOT NULL DEFAULT true
);

ALTER TABLE public.weekly_quests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "weekly_quests_select_all"
  ON public.weekly_quests FOR SELECT
  USING (true);


-- ── 2. student_weekly_quest_progress table ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.student_weekly_quest_progress (
  student_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quest_id    UUID NOT NULL REFERENCES public.weekly_quests(id) ON DELETE CASCADE,
  week_key    TEXT NOT NULL,
  progress    INTEGER NOT NULL DEFAULT 0,
  completed   BOOLEAN NOT NULL DEFAULT false,
  claimed     BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (student_id, quest_id, week_key)
);

ALTER TABLE public.student_weekly_quest_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "weekly_progress_select_own"
  ON public.student_weekly_quest_progress FOR SELECT
  USING (auth.uid() = student_id);

CREATE POLICY "weekly_progress_insert_own"
  ON public.student_weekly_quest_progress FOR INSERT
  WITH CHECK (auth.uid() = student_id);

CREATE POLICY "weekly_progress_update_own"
  ON public.student_weekly_quest_progress FOR UPDATE
  USING (auth.uid() = student_id);

CREATE POLICY "weekly_progress_select_teacher"
  ON public.student_weekly_quest_progress FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('teacher', 'super_admin')
    )
  );


-- ── 3. Phase-1 seeds ─────────────────────────────────────────────────────────

INSERT INTO public.weekly_quests (quest_key, type, target, reward_coins, label, sort_order)
VALUES
  ('week_answer_20', 'answer_count',  20, 150, 'Besvar 20 spørgsmål denne uge',    1),
  ('week_correct_10','correct_count', 10, 200, 'Svar rigtigt på 10 spørgsmål',     2),
  ('week_xp_150',    'xp_earned',    150, 100, 'Tjen 150 XP i løbet af ugen',      3)
ON CONFLICT (quest_key) DO NOTHING;


-- ── 4. update_weekly_quest_progress_for_answer() ────────────────────────────
--
-- Called from process_question_attempt and process_text_answer after each answer.
-- Mirrors update_quest_progress_for_answer() but uses week_key instead of quest_date.

CREATE OR REPLACE FUNCTION public.update_weekly_quest_progress_for_answer(
  p_student_id UUID,
  p_correct    BOOLEAN,
  p_xp_earned  INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_week_key TEXT;
  v_quest    RECORD;
  v_delta    INTEGER;
BEGIN
  v_week_key := TO_CHAR(CURRENT_DATE, 'IYYY-IW');

  FOR v_quest IN
    SELECT id, type, target
    FROM public.weekly_quests
    WHERE is_active = true
  LOOP
    v_delta := CASE v_quest.type
      WHEN 'answer_count'  THEN 1
      WHEN 'correct_count' THEN CASE WHEN p_correct THEN 1 ELSE 0 END
      WHEN 'xp_earned'     THEN CASE WHEN p_correct THEN p_xp_earned ELSE 0 END
      ELSE 0
    END;

    IF v_delta = 0 THEN
      CONTINUE;
    END IF;

    INSERT INTO public.student_weekly_quest_progress
      (student_id, quest_id, week_key, progress, completed, claimed)
    VALUES
      (p_student_id, v_quest.id, v_week_key, v_delta, false, false)
    ON CONFLICT (student_id, quest_id, week_key)
    DO UPDATE SET
      progress  = LEAST(
                    public.student_weekly_quest_progress.progress + v_delta,
                    v_quest.target
                  ),
      completed = (public.student_weekly_quest_progress.progress + v_delta) >= v_quest.target;
  END LOOP;
END;
$$;


-- ── 5. claim_weekly_quest_reward() ───────────────────────────────────────────
--
-- CAS guard: completed = true AND claimed = false.
-- Returns: 'claimed' | 'already_claimed' | 'not_completed' | 'not_found'

CREATE OR REPLACE FUNCTION public.claim_weekly_quest_reward(
  p_quest_id UUID,
  p_week_key TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_progress RECORD;
  v_quest    RECORD;
BEGIN
  SELECT * INTO v_progress
  FROM public.student_weekly_quest_progress
  WHERE student_id = auth.uid()
    AND quest_id   = p_quest_id
    AND week_key   = p_week_key;

  IF v_progress IS NULL THEN
    RETURN 'not_found';
  END IF;

  IF v_progress.claimed = true THEN
    RETURN 'already_claimed';
  END IF;

  IF v_progress.completed = false THEN
    RETURN 'not_completed';
  END IF;

  SELECT reward_coins INTO v_quest
  FROM public.weekly_quests
  WHERE id = p_quest_id;

  IF v_quest IS NULL THEN
    RETURN 'not_found';
  END IF;

  UPDATE public.student_weekly_quest_progress
  SET claimed = true
  WHERE student_id = auth.uid()
    AND quest_id   = p_quest_id
    AND week_key   = p_week_key
    AND completed  = true
    AND claimed    = false;

  IF NOT FOUND THEN
    RETURN 'already_claimed';
  END IF;

  UPDATE public.student_progress
  SET coins = COALESCE(coins, 0) + v_quest.reward_coins
  WHERE student_id = auth.uid();

  RETURN 'claimed';
END;
$$;


-- ── 6. process_text_answer (patched: adds weekly quest update) ───────────────
--
-- Base: 20260518000200_fix_correct_answers_counter.sql
-- Change: adds PERFORM update_weekly_quest_progress_for_answer(...) call

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
  PERFORM public.update_weekly_quest_progress_for_answer(
    p_user_id,
    p_is_correct,
    CASE WHEN p_is_correct THEN 10 ELSE 0 END
  );

  RETURN CASE p_is_correct WHEN true THEN 'rewarded' ELSE 'recorded' END;
END;
$$;


-- ── 7. process_question_attempt (patched: adds weekly quest update) ──────────
--
-- Base: 20260518000200_fix_correct_answers_counter.sql
-- Change: adds PERFORM update_weekly_quest_progress_for_answer(...) call

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
  PERFORM public.update_weekly_quest_progress_for_answer(
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
