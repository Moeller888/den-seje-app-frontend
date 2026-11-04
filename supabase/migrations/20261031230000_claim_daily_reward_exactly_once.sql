-- ============================================================================
-- D-284 — claim_daily_reward: exactly one payout per pupil per day, also under simultaneous calls.
--
-- NOT APPLIED IN PRODUCTION. Applying it needs a separate owner authorisation (D-110,
-- docs/migration-workflow-policy.md). `supabase db push` is forbidden.
--
-- WHY
-- The live function reads last_claimed_date WITHOUT a lock, then pays coins, then records the claim.
-- Two calls that overlap both pass the "already claimed today?" check before either has recorded the
-- claim, so both pay. The hub calls it on every load (hub.html), so overlapping calls are plausible
-- (two tabs, a quick reload). The same holds for a pupil's very first claim (no row yet).
--
-- WHAT CHANGES (and nothing else)
-- The claim row is created if absent (INSERT … ON CONFLICT DO NOTHING) and then LOCKED (SELECT … FOR
-- UPDATE) before the check — the same pattern as claim_stabel_reward (20260928000000). A second
-- simultaneous call waits on that lock, then sees today's claim and returns 'already_claimed' without
-- paying. Unchanged: signature, RETURNS json, the two response shapes, the coin formula
-- LEAST(150, 25 + streak * 15), CURRENT_DATE (UTC; a separate, known issue), SECURITY DEFINER,
-- search_path = public, owner and EXECUTE grants (CREATE OR REPLACE keeps the ACL).
--
-- GUARD
-- The file replaces only a body that was reviewed: production's (md5(prosrc)
-- 80273d5dc396679cd66376fd56ca3ff3, read-only catalog 2026-10-31 — the repository body of
-- 20260518000100 without its five comment lines), the repository's own (8bc545a027baf8746dcd9f5de93700ba,
-- as created by the isolated replay) or this file's body (re-run). Anything else aborts.
--
-- ROLLBACK: docs/operations/daily-reward-race-rollback.md (restores production's exact body).
-- ============================================================================

DO $guard$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(p.prosrc) INTO v_md5
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'claim_daily_reward' AND p.pronargs = 0;
  IF v_md5 IS NULL OR v_md5 NOT IN ('80273d5dc396679cd66376fd56ca3ff3',
                                    '8bc545a027baf8746dcd9f5de93700ba',
                                    'ea8efbadf880eaf5ac2767716976a537') THEN
    RAISE EXCEPTION 'D-284: claim_daily_reward has an unreviewed body (md5 %); stop', coalesce(v_md5, 'missing');
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.claim_daily_reward()
RETURNS json
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

  -- One claim row per pupil, created if absent and then locked: simultaneous calls serialise here,
  -- so exactly one of them can pay per day (D-284).
  INSERT INTO public.daily_login_rewards (student_id, last_claimed_date, total_claims)
  VALUES (v_user_id, NULL, 0)
  ON CONFLICT (student_id) DO NOTHING;

  SELECT last_claimed_date
  INTO   v_last_claimed
  FROM   public.daily_login_rewards
  WHERE  student_id = v_user_id
  FOR UPDATE;

  IF v_last_claimed = v_today THEN
    RETURN json_build_object('status', 'already_claimed');
  END IF;

  SELECT COALESCE(current_streak, 0)
  INTO   v_streak
  FROM   public.student_progress
  WHERE  student_id = v_user_id;

  IF NOT FOUND THEN
    v_streak := 0;
  END IF;

  v_coins := LEAST(150, 25 + v_streak * 15);

  UPDATE public.student_progress
  SET    coins = COALESCE(coins, 0) + v_coins
  WHERE  student_id = v_user_id;

  UPDATE public.daily_login_rewards
  SET    last_claimed_date = v_today,
         total_claims      = total_claims + 1
  WHERE  student_id = v_user_id;

  RETURN json_build_object(
    'status', 'claimed',
    'coins',  v_coins,
    'streak', v_streak
  );
END;
$$;
