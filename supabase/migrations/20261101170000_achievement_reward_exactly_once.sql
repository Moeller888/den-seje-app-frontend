-- ============================================================================
-- D-292 — grant_achievement_rewards: each achievement's reward is paid exactly once, also under
-- simultaneous calls.
--
-- NOT APPLIED IN PRODUCTION. Applying it needs a separate owner authorisation (D-110,
-- docs/migration-workflow-policy.md). `supabase db push` is forbidden.
--
-- WHY
-- The live function reads user_achievements.reward_claimed WITHOUT a lock, then pays, then marks the
-- reward claimed. Two calls that overlap both read "not claimed" before either has marked it, so a
-- coins reward is paid twice (theme/item/title rewards are already idempotent: ON CONFLICT DO NOTHING).
-- Both the hub (hub.html) and the achievements page (achievements.html) call it on every load with every
-- earned achievement, so overlapping calls are plausible (two tabs, a quick reload).
--
-- WHAT CHANGES (and nothing else)
--   1. The claim comes FIRST and is atomic: UPDATE … SET reward_claimed = true … WHERE … AND NOT
--      reward_claimed. A second simultaneous call waits on that row lock, then finds it already claimed
--      (0 rows) and pays nothing. Only the call whose UPDATE marked the row pays and reports the grant.
--   2. The achievements are visited in a fixed order (ORDER BY a.id), so two calls that claim several
--      achievements take the row locks in the same order and cannot deadlock.
--   3. EXECUTE is revoked from PUBLIC and anon. No anonymous path exists: both client calls run after
--      login, and the function already refuses a caller without auth.uid() ('not_authenticated').
--      authenticated (the two pages), service_role and the owner keep EXECUTE.
-- Unchanged: signature, RETURNS jsonb, the response shape (an array of {achievement_id, reward_type,
-- reward_value, reward_amount}), the four reward types and their writes, the caller scope (auth.uid()
-- only: a pupil can only claim rewards of achievements already recorded for themself — clients cannot
-- write user_achievements, RLS has only a SELECT policy), 'not_authenticated', empty input → '[]',
-- SECURITY DEFINER, search_path = public and owner.
--
-- GUARD
-- The file replaces only a reviewed body: production's (md5(prosrc) 63b8347dd4d72d40ced43e8728b5ab87,
-- read-only catalog 2026-11-01, identical to the repository body of 20260519000200) or this file's body
-- (re-run). Anything else aborts.
--
-- ROLLBACK: docs/operations/achievement-reward-race-rollback.md (restores production's exact body and
-- production's EXECUTE grants).
-- ============================================================================

DO $guard$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(p.prosrc) INTO v_md5
  FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.grant_achievement_rewards(text[])');
  IF v_md5 IS NULL OR v_md5 NOT IN ('63b8347dd4d72d40ced43e8728b5ab87',
                                    'fc8d729f8b0166815fe2647805ce2e60') THEN
    RAISE EXCEPTION 'D-292: grant_achievement_rewards has an unreviewed body (md5 %); stop', coalesce(v_md5, 'missing');
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.grant_achievement_rewards(p_achievement_ids text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid             UUID    := auth.uid();
  v_ach             RECORD;
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
    ORDER  BY a.id
  LOOP
    -- D-292: claim atomically before paying. Only the call that flips reward_claimed pays.
    UPDATE public.user_achievements
    SET    reward_claimed    = true,
           reward_claimed_at = now()
    WHERE  student_id     = v_uid
      AND  achievement_id = v_ach.id
      AND  NOT reward_claimed;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

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

    ELSIF v_ach.reward_type = 'title' THEN
      INSERT INTO public.user_titles (user_id, title_id)
      VALUES (v_uid, v_ach.reward_value)
      ON CONFLICT (user_id, title_id) DO NOTHING;
    END IF;

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

REVOKE EXECUTE ON FUNCTION public.grant_achievement_rewards(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_achievement_rewards(text[]) TO authenticated, service_role;
