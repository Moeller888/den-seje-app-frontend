-- ============================================================
-- Achievement Rewards — Phase 1
--
-- Adds reward_type, reward_value, reward_amount to achievements.
-- Adds reward_claimed, reward_claimed_at to user_achievements.
-- Creates grant_achievement_rewards() SECURITY DEFINER RPC.
--
-- Reward types:
--   coins → UPDATE student_progress.coins
--   theme → INSERT user_themes ON CONFLICT (user_id, theme_id) DO NOTHING
--   item  → INSERT user_items  ON CONFLICT (user_id, item_id)  DO NOTHING
--
-- Economy (non-inflationary):
--   Most achievements give small coin bonuses (5–75 coins).
--   streak_30 (hard loyalty goal)  → Skov-tema (300 coin value).
--   correct_1000 (hard grind goal) → Sølvkrone item (400 coin value).
--
-- Idempotency: reward_claimed flag prevents double delivery.
-- grant_achievement_rewards returns only what was delivered this call.
-- ============================================================


-- ── 1. Reward columns on achievements ────────────────────────────────────────

ALTER TABLE public.achievements
  ADD COLUMN IF NOT EXISTS reward_type   VARCHAR(32),
  ADD COLUMN IF NOT EXISTS reward_value  TEXT,
  ADD COLUMN IF NOT EXISTS reward_amount INTEGER;


-- ── 2. Claimed tracking on user_achievements ─────────────────────────────────

ALTER TABLE public.user_achievements
  ADD COLUMN IF NOT EXISTS reward_claimed    BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reward_claimed_at TIMESTAMPTZ;


-- ── 3. Seed reward metadata — all 16 achievements ────────────────────────────

-- Coins (14 achievements)
UPDATE public.achievements SET reward_type = 'coins', reward_amount = 5    WHERE id = 'first_correct';
UPDATE public.achievements SET reward_type = 'coins', reward_amount = 10   WHERE id = 'correct_10';
UPDATE public.achievements SET reward_type = 'coins', reward_amount = 25   WHERE id = 'correct_100';
UPDATE public.achievements SET reward_type = 'coins', reward_amount = 5    WHERE id = 'first_theme';
UPDATE public.achievements SET reward_type = 'coins', reward_amount = 30   WHERE id = 'first_legendary';
UPDATE public.achievements SET reward_type = 'coins', reward_amount = 20   WHERE id = 'streak_7';
UPDATE public.achievements SET reward_type = 'coins', reward_amount = 50   WHERE id = 'level_10';
UPDATE public.achievements SET reward_type = 'coins', reward_amount = 5    WHERE id = 'first_purchase';
UPDATE public.achievements SET reward_type = 'coins', reward_amount = 25   WHERE id = 'collector_5';
UPDATE public.achievements SET reward_type = 'coins', reward_amount = 20   WHERE id = 'themes_3';
UPDATE public.achievements SET reward_type = 'coins', reward_amount = 10   WHERE id = 'night_owl';
UPDATE public.achievements SET reward_type = 'coins', reward_amount = 15   WHERE id = 'perfect_five';
UPDATE public.achievements SET reward_type = 'coins', reward_amount = 75   WHERE id = 'legendary_combo';
UPDATE public.achievements SET reward_type = 'coins', reward_amount = 50   WHERE id = 'fast_learner';

-- Theme reward: streak_30 → Skov (forest) theme, 300 coin value
UPDATE public.achievements SET reward_type = 'theme', reward_value = 'forest'       WHERE id = 'streak_30';

-- Item reward: correct_1000 → Sølvkrone (crown-silver), 400 coin value
UPDATE public.achievements SET reward_type = 'item',  reward_value = 'crown-silver' WHERE id = 'correct_1000';


-- ── 4. grant_achievement_rewards RPC ─────────────────────────────────────────
--
-- Called after evaluate_achievements() to deliver rewards.
-- Accepts the full list of earned achievement IDs so historical
-- unclaimed rewards are silently backfilled on the first call.
-- Returns JSONB array of grants delivered this invocation only.

CREATE OR REPLACE FUNCTION public.grant_achievement_rewards(
  p_achievement_ids TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid             UUID    := auth.uid();
  v_ach             RECORD;
  v_already_claimed BOOLEAN;
  v_grants          JSONB   := '[]'::JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_achievement_ids IS NULL OR array_length(p_achievement_ids, 1) IS NULL THEN
    RETURN '[]'::JSONB;
  END IF;

  FOR v_ach IN
    SELECT a.id, a.reward_type, a.reward_value, a.reward_amount
    FROM   public.achievements a
    WHERE  a.id = ANY(p_achievement_ids)
      AND  a.reward_type IS NOT NULL
  LOOP
    -- Skip if user does not own the achievement or has already claimed.
    SELECT reward_claimed
    INTO   v_already_claimed
    FROM   public.user_achievements
    WHERE  student_id    = v_uid
      AND  achievement_id = v_ach.id;

    IF NOT FOUND OR v_already_claimed THEN
      CONTINUE;
    END IF;

    -- Deliver reward.
    IF v_ach.reward_type = 'coins' THEN
      UPDATE public.student_progress
      SET    coins = COALESCE(coins, 0) + v_ach.reward_amount
      WHERE  student_id = v_uid;

    ELSIF v_ach.reward_type = 'theme' THEN
      INSERT INTO public.user_themes (user_id, theme_id)
      VALUES (v_uid, v_ach.reward_value)
      ON CONFLICT (user_id, theme_id) DO NOTHING;

    ELSIF v_ach.reward_type = 'item' THEN
      INSERT INTO public.user_items (user_id, item_id)
      VALUES (v_uid, v_ach.reward_value)
      ON CONFLICT (user_id, item_id) DO NOTHING;
    END IF;

    -- Mark claimed.
    UPDATE public.user_achievements
    SET    reward_claimed    = true,
           reward_claimed_at = now()
    WHERE  student_id    = v_uid
      AND  achievement_id = v_ach.id;

    v_grants := v_grants || jsonb_build_array(jsonb_build_object(
      'achievement_id', v_ach.id,
      'reward_type',    v_ach.reward_type,
      'reward_value',   v_ach.reward_value,
      'reward_amount',  v_ach.reward_amount
    ));
  END LOOP;

  RETURN v_grants;
END;
$$;
