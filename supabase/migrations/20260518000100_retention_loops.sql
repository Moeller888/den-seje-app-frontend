-- ============================================================
-- Retention loops: daily login reward, streak milestones,
-- daily quest system.
--
-- Tables
-- ──────
-- daily_login_rewards      one row per student, tracks last claim date
-- streak_milestones        one row per (student, milestone) when earned
-- daily_quests             shared quest config (admin-managed)
-- student_quest_progress   per-student per-quest per-UTC-day progress
--
-- RPCs
-- ────
-- claim_daily_reward()                         called from hub on page load
-- update_quest_progress_for_answer(...)        called inside question RPCs
-- claim_quest_reward(p_quest_id, p_quest_date) called from hub claim button
--
-- Patched existing functions
-- ──────────────────────────
-- update_streak               adds milestone award logic
-- process_text_answer         adds quest progress call on CAS win
-- process_question_attempt    adds quest progress call on CAS win
--
-- Anti-abuse summary
-- ──────────────────
-- 1. claim_daily_reward checks last_claimed_date = CURRENT_DATE (UTC) before
--    awarding — idempotent, refresh-safe.
-- 2. Milestone awards use INSERT ON CONFLICT DO NOTHING + ROW_COUNT — exactly
--    once per milestone per student.
-- 3. Quest progress uses ON CONFLICT DO UPDATE WHERE claimed = false — freezes
--    the row after a claim so late answers cannot re-unlock a claimed quest.
-- 4. claim_quest_reward uses a CAS guard (completed = true AND claimed = false)
--    to prevent double-claiming.
-- 5. All dates are server CURRENT_DATE (UTC) — clients provide no date input.
-- ============================================================


-- ── 1. Tables ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.daily_login_rewards (
  student_id        UUID    PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_claimed_date DATE,
  total_claims      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.streak_milestones (
  student_id    UUID    NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  milestone_day INTEGER NOT NULL,
  claimed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, milestone_day)
);

-- Quest definitions: admin-managed shared catalog.
-- type values: 'answer_count' | 'correct_count' | 'xp_earned'
CREATE TABLE IF NOT EXISTS public.daily_quests (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_key    TEXT    NOT NULL UNIQUE,
  type         TEXT    NOT NULL CHECK (type IN ('answer_count', 'correct_count', 'xp_earned')),
  target       INTEGER NOT NULL,
  reward_coins INTEGER NOT NULL DEFAULT 0,
  reward_xp    INTEGER NOT NULL DEFAULT 0,
  label        TEXT    NOT NULL,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  is_active    BOOLEAN NOT NULL DEFAULT true
);

-- Per-student daily quest progress. Primary key prevents duplicate rows.
CREATE TABLE IF NOT EXISTS public.student_quest_progress (
  student_id UUID    NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  quest_id   UUID    NOT NULL REFERENCES public.daily_quests(id) ON DELETE CASCADE,
  quest_date DATE    NOT NULL,
  progress   INTEGER NOT NULL DEFAULT 0,
  completed  BOOLEAN NOT NULL DEFAULT false,
  claimed    BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (student_id, quest_id, quest_date)
);

CREATE INDEX IF NOT EXISTS idx_sqp_student_date
  ON public.student_quest_progress (student_id, quest_date DESC);


-- ── 2. Phase-1 quest definitions ────────────────────────────────────────────

INSERT INTO public.daily_quests (quest_key, type, target, reward_coins, reward_xp, label, sort_order)
VALUES
  ('answer_5',   'answer_count',  5,  30, 0, 'Svar på 5 spørgsmål',         1),
  ('correct_3',  'correct_count', 3,  50, 0, 'Svar rigtigt på 3 spørgsmål', 2),
  ('earn_xp_50', 'xp_earned',    50,  25, 0, 'Tjen 50 XP',                  3)
ON CONFLICT (quest_key) DO NOTHING;


-- ── 3. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE public.daily_login_rewards    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streak_milestones      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_quests           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_quest_progress ENABLE ROW LEVEL SECURITY;

-- Students read their own reward record; writes go through RPC.
CREATE POLICY "dlr_select_own"
  ON public.daily_login_rewards FOR SELECT TO authenticated
  USING (student_id = auth.uid());

-- Students read their own milestone records.
CREATE POLICY "sm_select_own"
  ON public.streak_milestones FOR SELECT TO authenticated
  USING (student_id = auth.uid());

-- Quest definitions are public catalog — all students may read.
CREATE POLICY "dq_select_all"
  ON public.daily_quests FOR SELECT TO authenticated
  USING (true);

-- Students read their own daily progress.
CREATE POLICY "sqp_select_own"
  ON public.student_quest_progress FOR SELECT TO authenticated
  USING (student_id = auth.uid());


-- ── 4. claim_daily_reward ────────────────────────────────────────────────────
--
-- Reward formula: MIN(150, 25 + current_streak × 15) coins.
--   streak=0 → 25    streak=1 → 40    streak=5 → 100
--   streak=9 → 145   streak≥9 → 150 (cap)
--
-- Economy note: 5 correct MC answers = 25 coins (regular play).
-- Daily reward is additive — it does not replace play-based earnings.

CREATE OR REPLACE FUNCTION public.claim_daily_reward()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id      UUID    := auth.uid();
  v_today        DATE    := CURRENT_DATE;
  v_last_claimed DATE;
  v_streak       INTEGER;
  v_coins        INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Check for today's claim (idempotency guard).
  SELECT last_claimed_date
  INTO   v_last_claimed
  FROM   public.daily_login_rewards
  WHERE  student_id = v_user_id;

  IF v_last_claimed = v_today THEN
    RETURN json_build_object('status', 'already_claimed');
  END IF;

  -- Read streak (may not exist for brand-new students).
  SELECT COALESCE(current_streak, 0)
  INTO   v_streak
  FROM   public.student_progress
  WHERE  student_id = v_user_id;

  IF NOT FOUND THEN
    v_streak := 0;
  END IF;

  -- Scaled reward, capped at 150.
  v_coins := LEAST(150, 25 + v_streak * 15);

  -- Award coins (no-op if student_progress row does not exist yet).
  UPDATE public.student_progress
  SET    coins = COALESCE(coins, 0) + v_coins
  WHERE  student_id = v_user_id;

  -- Record the claim.
  INSERT INTO public.daily_login_rewards (student_id, last_claimed_date, total_claims)
  VALUES (v_user_id, v_today, 1)
  ON CONFLICT (student_id) DO UPDATE
    SET last_claimed_date = v_today,
        total_claims      = daily_login_rewards.total_claims + 1;

  RETURN json_build_object(
    'status', 'claimed',
    'coins',  v_coins,
    'streak', v_streak
  );
END;
$$;


-- ── 5. update_quest_progress_for_answer ─────────────────────────────────────
--
-- Called inside process_question_attempt and process_text_answer on CAS win.
-- Iterates active quests and UPSERTs progress for today.
-- WHERE claimed = false prevents re-crediting after a quest is claimed.

CREATE OR REPLACE FUNCTION public.update_quest_progress_for_answer(
  p_student_id  UUID,
  p_was_correct BOOLEAN,
  p_xp_earned   INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quest RECORD;
  v_delta INTEGER;
BEGIN
  FOR v_quest IN
    SELECT id, type, target
    FROM   public.daily_quests
    WHERE  is_active = true
  LOOP
    v_delta := CASE v_quest.type
      WHEN 'answer_count'  THEN 1
      WHEN 'correct_count' THEN CASE WHEN p_was_correct THEN 1 ELSE 0 END
      WHEN 'xp_earned'     THEN CASE WHEN p_was_correct THEN p_xp_earned ELSE 0 END
      ELSE 0
    END;

    IF v_delta = 0 THEN CONTINUE; END IF;

    INSERT INTO public.student_quest_progress
      (student_id, quest_id, quest_date, progress, completed, claimed)
    VALUES
      (p_student_id, v_quest.id, CURRENT_DATE, v_delta,
       v_delta >= v_quest.target, false)
    ON CONFLICT (student_id, quest_id, quest_date) DO UPDATE
      SET
        progress  = student_quest_progress.progress + EXCLUDED.progress,
        completed = (student_quest_progress.progress + EXCLUDED.progress) >= v_quest.target
      WHERE student_quest_progress.claimed = false;
  END LOOP;
END;
$$;


-- ── 6. claim_quest_reward ────────────────────────────────────────────────────
--
-- CAS guard: only processes if completed=true AND claimed=false.
-- Duplicate calls return 'already_claimed_or_incomplete' — safe to call twice.

CREATE OR REPLACE FUNCTION public.claim_quest_reward(
  p_quest_id   UUID,
  p_quest_date DATE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    UUID    := auth.uid();
  v_coins      INTEGER;
  v_xp         INTEGER;
  v_rows       INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT reward_coins, reward_xp
  INTO   v_coins, v_xp
  FROM   public.daily_quests
  WHERE  id = p_quest_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'quest_not_found';
  END IF;

  -- CAS: mark claimed only if completed and not yet claimed.
  UPDATE public.student_quest_progress
  SET    claimed = true
  WHERE  student_id = v_user_id
    AND  quest_id   = p_quest_id
    AND  quest_date = p_quest_date
    AND  completed  = true
    AND  claimed    = false;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    RETURN json_build_object('status', 'already_claimed_or_incomplete');
  END IF;

  UPDATE public.student_progress
  SET
    coins = COALESCE(coins, 0) + v_coins,
    xp    = COALESCE(xp,    0) + v_xp
  WHERE student_id = v_user_id;

  RETURN json_build_object(
    'status', 'claimed',
    'coins',  v_coins,
    'xp',     v_xp
  );
END;
$$;


-- ── 7. update_streak (patched: adds milestone awards) ───────────────────────
--
-- Milestone config: 3→100c, 7→200c, 14→500c, 30→1000c.
-- INSERT ON CONFLICT DO NOTHING + ROW_COUNT: exactly-once delivery.
-- If the student reaches the same milestone twice (impossible by streak logic
-- but defensive), the INSERT conflicts and no coins are awarded again.

CREATE OR REPLACE FUNCTION public.update_streak(p_student_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today           DATE    := CURRENT_DATE;
  v_last_date       DATE;
  v_curr_streak     INTEGER;
  v_new_streak      INTEGER;
  v_milestone_coins INTEGER;
  v_rows            INTEGER;
BEGIN
  SELECT last_activity_date, current_streak
  INTO   v_last_date, v_curr_streak
  FROM   public.student_progress
  WHERE  student_id = p_student_id;

  IF NOT FOUND     THEN RETURN; END IF;
  IF v_last_date = v_today THEN RETURN; END IF;

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

  -- Milestone awards: fire only when streak hits an exact milestone boundary.
  IF v_new_streak IN (3, 7, 14, 30) THEN
    v_milestone_coins := CASE v_new_streak
      WHEN 3  THEN 100
      WHEN 7  THEN 200
      WHEN 14 THEN 500
      WHEN 30 THEN 1000
    END;

    INSERT INTO public.streak_milestones (student_id, milestone_day)
    VALUES (p_student_id, v_new_streak)
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS v_rows = ROW_COUNT;

    -- ROW_COUNT = 1 means we actually inserted (not a conflict): safe to award.
    IF v_rows > 0 THEN
      UPDATE public.student_progress
      SET    coins = COALESCE(coins, 0) + v_milestone_coins
      WHERE  student_id = p_student_id;
    END IF;
  END IF;
END;
$$;


-- ── 8. process_text_answer (patched: adds quest progress) ───────────────────

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
      xp    = COALESCE(xp, 0) + 10,
      coins = COALESCE(coins, 0) + 5
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


-- ── 9. process_question_attempt (patched: adds quest progress) ──────────────

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
      xp    = COALESCE(xp, 0) + 10,
      coins = COALESCE(coins, 0) + 5
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
