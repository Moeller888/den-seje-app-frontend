-- D-364: spillepauser every 10 minutes instead of every 20 (owner decision 2026-11-07).
--
-- Changes exactly ONE thing in D-347 (20261105090000_minigame_breaks.sql, production version 20261105060103):
-- the interval constant c_interval in public.minigame_break_after_answer goes from 1200 to 600 seconds.
-- The rest of the function body is byte-identical to D-347 — credit per answer (at most 300 s, capped by
-- the browser's visible seconds), stale-answer rule, one open offer per pupil, the lock, the draw — and
-- no other function, table, index, policy or grant changes. No XP, coins or mastery anywhere.
--
-- Pupils who already have 600..1200 seconds earned: LEAST(c_interval, …) clamps them to 600, so their
-- next registered answer offers a break. The CHECK (active_seconds BETWEEN 0 AND 1200) stays; it is
-- wider than the new interval and still holds every possible value.
--
-- Idempotent: CREATE OR REPLACE with the same signature keeps the function's owner and ACL; the grants
-- are re-stated anyway so the end state does not depend on the previous one.

-- Called by the quiz right after an answer has been registered. Credits the answer's active time and,
-- once 600 seconds are earned, creates the one offer. Never changes anything about the answer itself.
-- Returns { status: 'ok', reason, offer: null | { id, game }, active_seconds, interval_seconds }.
CREATE OR REPLACE FUNCTION public.minigame_break_after_answer(
  p_question_instance_id uuid,
  p_visible_seconds      integer DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c_interval    CONSTANT integer  := 600;                -- MINIGAME_INTERVAL_SECONDS: 10 minutes (D-364)
  c_answer_cap  CONSTANT integer  := 300;                -- inactivity rule: one answer counts at most 5 minutes
  c_fresh_for   CONSTANT interval := interval '10 minutes'; -- an answer older than this cannot open a break
  v_uid         uuid;
  v_created     timestamptz;
  v_answered_at timestamptz;
  v_answered    boolean;
  v_last        timestamptz;
  v_seconds     integer;
  v_open_id     uuid;
  v_open_game   text;
  v_open_status text;
  v_start       timestamptz;
  v_credit      integer := 0;
  v_game        text;
  v_offer_id    uuid;
BEGIN
  v_uid := public._minigame_break_lock_pupil();

  IF p_question_instance_id IS NULL THEN
    RAISE EXCEPTION 'invalid_instance';
  END IF;

  SELECT active_seconds, last_credit_at INTO v_seconds, v_last
  FROM   public.minigame_break_progress WHERE student_id = v_uid;

  -- Only a registered answer of THIS pupil counts. Another pupil's instance looks exactly like none.
  SELECT qi.created_at, qi.answered_at,
         (qi.answered IS TRUE AND qi.user_answer IS NOT NULL AND qi.answered_at IS NOT NULL)
  INTO   v_created, v_answered_at, v_answered
  FROM   public.question_instances qi
  WHERE  qi.id = p_question_instance_id
    AND  qi.student_id = v_uid;

  IF NOT FOUND OR v_answered IS NOT TRUE THEN
    RETURN json_build_object('status', 'ok', 'reason', 'not_answered', 'offer', NULL,
                             'active_seconds', v_seconds, 'interval_seconds', c_interval);
  END IF;

  IF v_answered_at < now() - c_fresh_for THEN
    RETURN json_build_object('status', 'ok', 'reason', 'stale', 'offer', NULL,
                             'active_seconds', v_seconds, 'interval_seconds', c_interval);
  END IF;

  -- An open offer that still waits for "Ja tak" / "Nej, ellers tak" is shown again — the same offer,
  -- never a new one — and no time accrues meanwhile.
  SELECT id, game_key, status INTO v_open_id, v_open_game, v_open_status
  FROM   public.minigame_break_offers
  WHERE  student_id = v_uid AND status IN ('offered', 'accepted', 'started')
  LIMIT  1;

  IF v_open_id IS NOT NULL THEN
    IF v_open_status = 'offered' THEN
      RETURN json_build_object('status', 'ok', 'reason', 'offer',
                               'offer', json_build_object('id', v_open_id, 'game', v_open_game),
                               'active_seconds', v_seconds, 'interval_seconds', c_interval);
    END IF;
    -- An accepted or started break: the pupil is answering quiz questions again (the game tab was
    -- closed, or the pupil came back without playing), so the break is over. Its pass dies with it.
    UPDATE public.minigame_break_offers
    SET    status   = CASE WHEN status = 'started' THEN 'finished' ELSE 'expired' END,
           outcome  = CASE WHEN status = 'started' THEN 'exited' ELSE outcome END,
           ended_at = now()
    WHERE  id = v_open_id;
  END IF;

  -- One answer is credited once.
  IF v_last IS NOT NULL AND v_answered_at <= v_last THEN
    RETURN json_build_object('status', 'ok', 'reason', 'already_counted', 'offer', NULL,
                             'active_seconds', v_seconds, 'interval_seconds', c_interval);
  END IF;

  v_start := GREATEST(v_created, v_last);   -- GREATEST ignores a NULL v_last
  IF v_start IS NOT NULL AND v_answered_at > v_start THEN
    v_credit := LEAST(c_answer_cap::numeric, floor(extract(epoch FROM (v_answered_at - v_start))))::integer;
  END IF;
  IF p_visible_seconds IS NOT NULL THEN
    v_credit := LEAST(v_credit, GREATEST(0, p_visible_seconds));
  END IF;

  v_seconds := LEAST(c_interval, v_seconds + v_credit);   -- surplus never piles up into extra offers

  UPDATE public.minigame_break_progress
  SET    active_seconds = v_seconds,
         last_credit_at = GREATEST(last_credit_at, v_answered_at),
         updated_at     = now()
  WHERE  student_id = v_uid;

  IF v_seconds < c_interval THEN
    RETURN json_build_object('status', 'ok', 'reason', 'counted', 'offer', NULL,
                             'active_seconds', v_seconds, 'interval_seconds', c_interval);
  END IF;

  -- Uniform draw among the enabled games; a repeat of the previous game is allowed.
  SELECT game_key INTO v_game
  FROM   public.minigame_break_games
  WHERE  enabled
  ORDER  BY random()
  LIMIT  1;

  IF v_game IS NULL THEN
    RETURN json_build_object('status', 'ok', 'reason', 'no_games', 'offer', NULL,
                             'active_seconds', v_seconds, 'interval_seconds', c_interval);
  END IF;

  INSERT INTO public.minigame_break_offers (student_id, game_key)
  VALUES (v_uid, v_game)
  RETURNING id INTO v_offer_id;

  UPDATE public.minigame_break_progress
  SET    active_seconds = 0,
         updated_at     = now()
  WHERE  student_id = v_uid;

  RETURN json_build_object('status', 'ok', 'reason', 'offer',
                           'offer', json_build_object('id', v_offer_id, 'game', v_game),
                           'active_seconds', 0, 'interval_seconds', c_interval);
END;
$function$;

REVOKE ALL ON FUNCTION public.minigame_break_after_answer(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.minigame_break_after_answer(uuid, integer) TO authenticated;
