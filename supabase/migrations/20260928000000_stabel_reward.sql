-- Stabel pays coins: 1 coin per plate, at most 50 coins per student per day.
--
-- THE DECISION
-- Stabel shipped paying nothing ("chance must not pay out"). The owner reversed that on
-- 2026-09-25: a finished round now pays 1 coin per plate, capped at 50 coins per day. Recorded in
-- docs/ROADMAP.md.
--
-- THE SCORE IS CLIENT-REPORTED
-- Stabel runs entirely in the browser, so p_plates is whatever the client sends. A pupil can send
-- a forged number from devtools, and nothing server-side can tell. The cap is the defence, not
-- the score: whatever is sent, one call pays at most 50 and one day pays at most 50 in total —
-- below the daily login reward (25–150). Honest play and forged play are paid the same ceiling.
--
-- THE DAY
-- The database runs on UTC. The day is taken in Europe/Copenhagen on purpose, so the cap resets at
-- a Danish pupil's midnight rather than at 01:00/02:00. That deliberately differs from
-- claim_daily_reward, which uses CURRENT_DATE (UTC); it is not changed here.
--
-- THE LEDGER
-- public.stabel_daily_rewards holds one row per pupil: the day and the coins already paid that
-- day. RLS is enabled with NO policies and every table privilege is revoked from anon and
-- authenticated, so only this SECURITY DEFINER function can read or write it.
--
-- CONCURRENCY
-- The row is created if absent, then locked FOR UPDATE before the cap is computed, so two
-- simultaneous calls cannot both spend the same remaining allowance.
--
-- AUTHORISATION
-- auth.uid() must be set, and profiles.role must be 'student' — read server-side, never from token
-- metadata. Teachers and admins are refused. A pupil can only ever credit their own row.
-- A missing student_progress row raises, which rolls the ledger update back with it.
--
-- search_path is pinned to public, matching claim_daily_reward.

CREATE TABLE IF NOT EXISTS public.stabel_daily_rewards (
  student_id  uuid    PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  reward_date date    NOT NULL,
  coins_today integer NOT NULL DEFAULT 0 CHECK (coins_today BETWEEN 0 AND 50)
);

ALTER TABLE public.stabel_daily_rewards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.stabel_daily_rewards FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_stabel_reward(p_plates integer)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID    := auth.uid();
  v_today   DATE    := (now() AT TIME ZONE 'Europe/Copenhagen')::date;
  v_cap     INTEGER := 50;
  v_role    TEXT;
  v_used    INTEGER;
  v_award   INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_plates IS NULL OR p_plates < 0 THEN
    RAISE EXCEPTION 'invalid_plates';
  END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  IF v_role IS DISTINCT FROM 'student' THEN
    RAISE EXCEPTION 'not_a_student';
  END IF;

  INSERT INTO public.stabel_daily_rewards (student_id, reward_date, coins_today)
  VALUES (v_user_id, v_today, 0)
  ON CONFLICT (student_id) DO NOTHING;

  SELECT CASE WHEN reward_date = v_today THEN coins_today ELSE 0 END
  INTO   v_used
  FROM   public.stabel_daily_rewards
  WHERE  student_id = v_user_id
  FOR UPDATE;

  v_award := GREATEST(0, LEAST(p_plates, v_cap - v_used));

  UPDATE public.stabel_daily_rewards
  SET    reward_date = v_today,
         coins_today = v_used + v_award
  WHERE  student_id = v_user_id;

  IF v_award > 0 THEN
    UPDATE public.student_progress
    SET    coins = coins + v_award
    WHERE  student_id = v_user_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'no_progress_row';
    END IF;
  END IF;

  RETURN json_build_object(
    'status', 'ok',
    'coins',  v_award,
    'today',  v_used + v_award,
    'cap',    v_cap
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_stabel_reward(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_stabel_reward(integer) TO authenticated;
