-- ============================================================================
-- D-278 — Reward integrity: server-authoritative checks for weekly-quest progress and two hidden
-- achievement flags.
--
-- NOT APPLIED IN PRODUCTION. Applying it needs a separate owner authorisation (D-110,
-- docs/migration-workflow-policy.md). `supabase db push` is forbidden.
--
-- WHY
-- Weekly-quest progress and the two hidden-achievement flags feed rewards (coins, a title), but
-- they could be written from the client instead of only by the server:
--   1. student_weekly_quest_progress had pupil INSERT and UPDATE policies (own rows) and full table
--      grants. Its rows decide claim_weekly_quest_reward. Only server functions are meant to write it
--      (update_weekly_quest_progress_for_answer, claim_weekly_quest_reward — both SECURITY DEFINER).
--   2. update_best_session_streak(p_count) stored a client-supplied number.
--   3. set_night_correct() set the flag without checking any answer or time.
-- evaluate_achievements() turns (2) and (3) into perfect_five / night_owl, and
-- grant_achievement_rewards() pays them out.
--
-- WHAT CHANGES (and nothing else)
--   1. student_weekly_quest_progress: drop the two pupil write policies; revoke INSERT, UPDATE and
--      DELETE from anon and authenticated. The two SELECT policies (weekly_progress_select_own and
--      "super_admins read all weekly quest progress") are unchanged. The server functions run as
--      their owner and are unaffected.
--   2. update_best_session_streak(p_count integer): same signature (app.js is unchanged); p_count is
--      IGNORED. The server counts the caller's own CURRENT run of consecutive correct answers, newest
--      first. A "session" is a sequence of answers with no pause longer than 2 hours between two
--      consecutive answers; a wrong answer or such a pause ends the run. It stores
--      GREATEST(stored, counted). Known limit until question_attempts is applied (D-266): a repeat
--      re-opens the SAME question_instances row, so a question answered twice in one run counts once.
--   3. set_night_correct(): same signature; sets the flag only if the caller has a correct answer
--      given between 00:00 and 03:59 Danish time (Europe/Copenhagen) — any such answer in the
--      caller's history (the achievement is "answer correctly at night"; see D-278 for why the
--      historical rule, not "just now", is the correct one).
--   4. Both functions: EXECUTE revoked from PUBLIC and anon (authenticated and service_role keep it);
--      an unauthenticated call raises 'not_authenticated' instead of silently doing nothing.
-- Existing flags, achievements and coins are NOT changed or revoked by this file. Whether existing
-- awards are reviewed is a separate owner decision (D-278).
--
-- PRODUCTION BEFORE THIS FILE (read-only catalog, 2026-10-31):
--   update_best_session_streak  md5(prosrc) 9b748ad15766feb2b649671ebbaa0aca, LANGUAGE sql,
--                               search_path=public (= 20260518000500 body, byte for byte)
--   set_night_correct           md5(prosrc) fc2cb97c4f147625fa170abe404f9f28, same
--   both: ACL {=X, postgres=X, anon=X, authenticated=X, service_role=X}
--   student_weekly_quest_progress policies: weekly_progress_select_own (SELECT, public),
--     "super_admins read all weekly quest progress" (SELECT, authenticated; = 20260925000000),
--     weekly_progress_insert_own (INSERT, public), weekly_progress_update_own (UPDATE, public)
--
-- ROLLBACK: docs/operations/reward-integrity-rollback.md (restores the three objects exactly).
-- ============================================================================


-- ── 1. Weekly-quest progress: written by the server only ─────────────────────

DROP POLICY IF EXISTS "weekly_progress_insert_own" ON public.student_weekly_quest_progress;
DROP POLICY IF EXISTS "weekly_progress_update_own" ON public.student_weekly_quest_progress;

REVOKE INSERT, UPDATE, DELETE ON public.student_weekly_quest_progress FROM anon, authenticated;


-- ── 2. update_best_session_streak: counted by the server ─────────────────────

CREATE OR REPLACE FUNCTION public.update_best_session_streak(p_count integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid  UUID        := auth.uid();
  v_run  INTEGER     := 0;
  v_prev TIMESTAMPTZ := NULL;
  r      RECORD;
BEGIN
  -- p_count is kept for the client contract and deliberately ignored.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- The current run: newest answer first, until a wrong answer or a pause of more than 2 hours
  -- between two consecutive answers (the end of a session).
  FOR r IN
    SELECT qi.was_correct, qi.answered_at
    FROM   public.question_instances qi
    WHERE  qi.student_id  = v_uid
      AND  qi.answered    = true
      AND  qi.answered_at IS NOT NULL
    ORDER  BY qi.answered_at DESC, qi.id DESC
  LOOP
    EXIT WHEN r.was_correct IS NOT TRUE;
    EXIT WHEN v_prev IS NOT NULL AND v_prev - r.answered_at > interval '2 hours';
    v_run  := v_run + 1;
    v_prev := r.answered_at;
  END LOOP;

  UPDATE public.student_progress
  SET    best_session_streak = GREATEST(COALESCE(best_session_streak, 0), v_run)
  WHERE  student_id = v_uid;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_best_session_streak(integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.update_best_session_streak(integer) TO authenticated, service_role;


-- ── 3. set_night_correct: only with a correct answer at night (Danish time) ───

CREATE OR REPLACE FUNCTION public.set_night_correct()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE public.student_progress
  SET    night_correct = true
  WHERE  student_id = v_uid
    AND  EXISTS (
           SELECT 1
           FROM   public.question_instances qi
           WHERE  qi.student_id  = v_uid
             AND  qi.answered    = true
             AND  qi.was_correct IS TRUE
             AND  qi.answered_at IS NOT NULL
             AND  (qi.answered_at AT TIME ZONE 'Europe/Copenhagen')::time < time '04:00'
         );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_night_correct() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_night_correct() TO authenticated, service_role;
