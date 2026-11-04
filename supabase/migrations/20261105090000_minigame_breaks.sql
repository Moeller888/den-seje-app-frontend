-- D-347: minigames become a voluntary break, offered after 20 minutes of active quiz time.
--
-- THE RULE
-- A pupil earns active quiz time by answering questions. Once 1,200 seconds are earned, the NEXT
-- registered answer creates one offer for one game, drawn uniformly at random from the enabled games.
-- The pupil answers "Ja tak" (accept) or "Nej, ellers tak" (decline). Either way a new period of
-- 1,200 seconds starts. An accepted offer is a single-use pass for exactly one round of that game.
-- No minigame pays anything: no XP, no coins, no mastery — Stabel included (owner decision 2026-11-04,
-- D-347). See STABEL'S COIN RPC CLOSED at the end of this file.
--
-- ACTIVE QUIZ TIME — MEASURED ON THE SERVER, NOT BY A BROWSER TIMER
-- Every answer path already stamps the pupil's question_instances row on the server:
-- created_at when the question is served, answered_at = now() when the answer is registered
-- (process_question_attempt, process_text_answer, and the _v2 functions). One answer is credited with
--     answered_at - GREATEST(instance.created_at, progress.last_credit_at)
-- capped at 300 seconds (the inactivity rule: one question counts at most five minutes, however long
-- it stayed open), and capped again by the seconds the browser reports the question was VISIBLE
-- (p_visible_seconds). The browser can only LOWER the credit, never raise it. Consequences:
--   * reload, logout/login and a second device keep the earned time: it lives in this table;
--   * the local clock is irrelevant: every timestamp is the database's;
--   * two tabs cannot double-count: last_credit_at makes the credited intervals disjoint;
--   * one answer is credited once: a replay has answered_at <= last_credit_at and earns nothing;
--   * time in a game, in the hub or on the offer dialog is excluded: responding to and finishing an
--     offer move last_credit_at to now(), and no question is open while the dialog is shown;
--   * a slow reader is not punished: a question that takes four minutes counts four minutes.
-- A round released without an answer (release_open_question_outside sets answered_at but leaves
-- user_answer NULL) is not an answer and is never credited.
--
-- OFFERS
-- public.minigame_break_offers: one row per offer. status offered -> accepted -> started -> finished,
-- or offered -> declined, or any open state -> expired. A partial unique index allows at most ONE open
-- offer (offered / accepted / started) per pupil. Open offers expire: offered after 2 hours, accepted
-- (never started) after 15 minutes, started after 60 minutes. While an offer waits for the pupil's
-- choice, no time accrues. An accepted or started break ends the moment the pupil registers a quiz
-- answer again (the game tab was closed, or the pupil came back without playing).
--
-- CONCURRENCY
-- Every function first locks the pupil's progress row FOR UPDATE, so two answers, two tabs or a retried
-- request for one pupil are serialised. State changes are single UPDATEs guarded by the expected status,
-- so an offer can be accepted, declined, started or finished at most once.
--
-- AUTHORISATION
-- auth.uid() must be set and profiles.role must be 'student' (read server-side, never from token
-- metadata). A pupil only ever reads or writes their own rows: every query is filtered by auth.uid(),
-- an offer id or a question instance of another pupil behaves exactly like one that does not exist.
-- The three tables have RLS enabled with NO policies and every privilege revoked from anon and
-- authenticated; only these functions reach them. search_path is pinned to public and every name is
-- schema-qualified. EXECUTE on the four RPCs is revoked from PUBLIC and anon and granted to authenticated
-- (service_role keeps the project default grant: it is the backend and bypasses RLS anyway). The two
-- internal helpers are executable by no API role, service_role included. Production default privileges
-- (pg_default_acl, read 2026-11-04) grant new tables and functions to anon, authenticated and service_role;
-- every grant below is therefore explicit.
--
-- PRIVACY
-- Stored per pupil: earned seconds (0..1200), the time of the last credited answer, and one row per
-- offer (game, status, four timestamps). No answer content, no per-answer time log, no names.
--
-- ROLLBACK: docs/operations/minigame-breaks-rollback.md. Kill switch without a deploy:
--   UPDATE public.minigame_break_games SET enabled = false;   -- no new offers; the quiz is unaffected.

CREATE TABLE IF NOT EXISTS public.minigame_break_games (
  game_key text    PRIMARY KEY CHECK (game_key ~ '^[a-z]{2,20}$'),
  enabled  boolean NOT NULL DEFAULT true
);

-- Must match MINIGAME_CATALOG in js/minigame-break.js (asserted by tests/unit/minigame-break.test.mjs).
INSERT INTO public.minigame_break_games (game_key) VALUES
  ('stabel'), ('husk'), ('naal'), ('kloeft'), ('hop'), ('brud'), ('slope')
ON CONFLICT (game_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.minigame_break_progress (
  student_id     uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  active_seconds integer     NOT NULL DEFAULT 0 CHECK (active_seconds BETWEEN 0 AND 1200),
  last_credit_at timestamptz,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.minigame_break_offers (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_key     text        NOT NULL REFERENCES public.minigame_break_games(game_key),
  status       text        NOT NULL DEFAULT 'offered'
                           CHECK (status IN ('offered', 'accepted', 'declined', 'started', 'finished', 'expired')),
  outcome      text        CHECK (outcome IN ('completed', 'exited')),
  offered_at   timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  started_at   timestamptz,
  ended_at     timestamptz
);

-- At most one open offer per pupil.
CREATE UNIQUE INDEX IF NOT EXISTS minigame_break_offers_one_open
  ON public.minigame_break_offers (student_id)
  WHERE status IN ('offered', 'accepted', 'started');

CREATE INDEX IF NOT EXISTS minigame_break_offers_student_offered_at
  ON public.minigame_break_offers (student_id, offered_at DESC);

CREATE INDEX IF NOT EXISTS minigame_break_offers_game_key
  ON public.minigame_break_offers (game_key);

ALTER TABLE public.minigame_break_games    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minigame_break_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minigame_break_offers   ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.minigame_break_games    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.minigame_break_progress FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.minigame_break_offers   FROM PUBLIC, anon, authenticated;

-- Internal: closes this pupil's open offers that are past their lifetime. Called with the progress row
-- locked. Not callable by any API role.
CREATE OR REPLACE FUNCTION public._minigame_break_expire(p_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.minigame_break_offers
  SET    status   = 'expired',
         ended_at = now()
  WHERE  student_id = p_student_id
    AND  (   (status = 'offered'  AND offered_at   < now() - interval '2 hours')
          OR (status = 'accepted' AND responded_at < now() - interval '15 minutes')
          OR (status = 'started'  AND started_at   < now() - interval '60 minutes'));
END;
$function$;

REVOKE ALL ON FUNCTION public._minigame_break_expire(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- Internal: the calling pupil, with their progress row created and locked. Raises for anyone else.
CREATE OR REPLACE FUNCTION public._minigame_break_lock_pupil()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid  uuid := auth.uid();
  v_role text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = v_uid;
  IF v_role IS DISTINCT FROM 'student' THEN
    RAISE EXCEPTION 'not_a_student';
  END IF;

  INSERT INTO public.minigame_break_progress (student_id)
  VALUES (v_uid)
  ON CONFLICT (student_id) DO NOTHING;

  PERFORM 1 FROM public.minigame_break_progress WHERE student_id = v_uid FOR UPDATE;

  PERFORM public._minigame_break_expire(v_uid);
  RETURN v_uid;
END;
$function$;

REVOKE ALL ON FUNCTION public._minigame_break_lock_pupil() FROM PUBLIC, anon, authenticated, service_role;

-- Called by the quiz right after an answer has been registered. Credits the answer's active time and,
-- once 1,200 seconds are earned, creates the one offer. Never changes anything about the answer itself.
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
  c_interval    CONSTANT integer  := 1200;               -- MINIGAME_INTERVAL_SECONDS: 20 minutes
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

-- "Ja tak" (p_accept = true) or "Nej, ellers tak" (false). Idempotent for the same choice; a period of
-- 1,200 seconds starts now either way. Returns { status: 'ok' | 'not_found' | 'conflict', offer_status, game }.
CREATE OR REPLACE FUNCTION public.minigame_break_respond(p_offer_id uuid, p_accept boolean)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    uuid;
  v_game   text;
  v_status text;
  v_want   text;
BEGIN
  v_uid := public._minigame_break_lock_pupil();

  IF p_offer_id IS NULL OR p_accept IS NULL THEN
    RAISE EXCEPTION 'invalid_request';
  END IF;
  v_want := CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END;

  UPDATE public.minigame_break_offers
  SET    status = v_want,
         responded_at = now()
  WHERE  id = p_offer_id AND student_id = v_uid AND status = 'offered'
  RETURNING game_key INTO v_game;

  IF FOUND THEN
    UPDATE public.minigame_break_progress
    SET    active_seconds = 0,
           last_credit_at = GREATEST(last_credit_at, now()),
           updated_at     = now()
    WHERE  student_id = v_uid;
    RETURN json_build_object('status', 'ok', 'offer_status', v_want, 'game', v_game);
  END IF;

  SELECT status, game_key INTO v_status, v_game
  FROM   public.minigame_break_offers
  WHERE  id = p_offer_id AND student_id = v_uid;

  IF NOT FOUND THEN
    RETURN json_build_object('status', 'not_found', 'offer_status', NULL, 'game', NULL);
  END IF;
  IF v_status = v_want THEN
    RETURN json_build_object('status', 'ok', 'offer_status', v_status, 'game', v_game);
  END IF;
  RETURN json_build_object('status', 'conflict', 'offer_status', v_status, 'game', v_game);
END;
$function$;

-- The game page redeems the accepted offer: exactly once, for exactly the offered game, within 15
-- minutes of "Ja tak". A reload, the back button, a reused or someone else's link are all refused.
-- Returns { status: 'ok' | 'denied', reason }.
CREATE OR REPLACE FUNCTION public.minigame_break_start(p_offer_id uuid, p_game_key text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    uuid;
  v_status text;
  v_game   text;
BEGIN
  v_uid := public._minigame_break_lock_pupil();

  IF p_offer_id IS NULL OR p_game_key IS NULL THEN
    RETURN json_build_object('status', 'denied', 'reason', 'no_pass');
  END IF;

  UPDATE public.minigame_break_offers
  SET    status = 'started',
         started_at = now()
  WHERE  id = p_offer_id AND student_id = v_uid AND status = 'accepted' AND game_key = p_game_key;

  IF FOUND THEN
    RETURN json_build_object('status', 'ok', 'reason', 'started');
  END IF;

  SELECT status, game_key INTO v_status, v_game
  FROM   public.minigame_break_offers
  WHERE  id = p_offer_id AND student_id = v_uid;

  RETURN json_build_object('status', 'denied', 'reason',
    CASE
      WHEN NOT FOUND                 THEN 'not_found'
      WHEN v_game <> p_game_key      THEN 'wrong_game'
      WHEN v_status = 'expired'      THEN 'expired'
      WHEN v_status IN ('started', 'finished') THEN 'already_used'
      ELSE 'not_accepted'
    END);
END;
$function$;

-- The round is over (outcome 'completed') or the pupil left early ('exited'). Idempotent. Time in the
-- game is excluded from quiz time. Returns { status: 'ok' | 'not_found' | 'conflict', offer_status }.
CREATE OR REPLACE FUNCTION public.minigame_break_finish(p_offer_id uuid, p_outcome text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    uuid;
  v_status text;
BEGIN
  v_uid := public._minigame_break_lock_pupil();

  IF p_offer_id IS NULL OR p_outcome IS NULL OR p_outcome NOT IN ('completed', 'exited') THEN
    RAISE EXCEPTION 'invalid_request';
  END IF;

  UPDATE public.minigame_break_offers
  SET    status = 'finished',
         outcome = p_outcome,
         ended_at = now()
  WHERE  id = p_offer_id AND student_id = v_uid AND status = 'started';

  IF FOUND THEN
    UPDATE public.minigame_break_progress
    SET    last_credit_at = GREATEST(last_credit_at, now()),
           updated_at     = now()
    WHERE  student_id = v_uid;
    RETURN json_build_object('status', 'ok', 'offer_status', 'finished');
  END IF;

  SELECT status INTO v_status
  FROM   public.minigame_break_offers
  WHERE  id = p_offer_id AND student_id = v_uid;

  IF NOT FOUND THEN
    RETURN json_build_object('status', 'not_found', 'offer_status', NULL);
  END IF;
  IF v_status IN ('finished', 'expired') THEN
    RETURN json_build_object('status', 'ok', 'offer_status', v_status);
  END IF;
  RETURN json_build_object('status', 'conflict', 'offer_status', v_status);
END;
$function$;

REVOKE ALL ON FUNCTION public.minigame_break_after_answer(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.minigame_break_respond(uuid, boolean)       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.minigame_break_start(uuid, text)            FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.minigame_break_finish(uuid, text)           FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.minigame_break_after_answer(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.minigame_break_respond(uuid, boolean)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.minigame_break_start(uuid, text)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.minigame_break_finish(uuid, text)           TO authenticated;

-- STABEL'S COIN RPC CLOSED (owner decision 2026-11-04, D-347)
-- Stabel stays in the pool but pays nothing. Removing the page's call is not enough: claim_stabel_reward
-- (20260928000000, SECURITY DEFINER) was executable by `authenticated`, so any pupil could call
-- POST /rest/v1/rpc/claim_stabel_reward directly and be paid up to 50 coins a day without playing.
-- Its only caller was js/stabel.js (no function, trigger or Edge Function calls it — catalog and
-- repository checked 2026-11-04). EXECUTE is therefore revoked from every API role, service_role
-- included. Nothing is dropped: the function stays for the record and public.stabel_daily_rewards keeps
-- every historical row; coins already paid stay in student_progress. Reopening it would be a new owner
-- decision (rollback: docs/operations/minigame-breaks-rollback.md). Guarded, so the file also runs on a
-- database that never had the function.
DO $stabel$
BEGIN
  IF to_regprocedure('public.claim_stabel_reward(integer)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.claim_stabel_reward(integer) FROM PUBLIC, anon, authenticated, service_role;
  END IF;
END
$stabel$;
