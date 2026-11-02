-- ============================================================================
-- D-316 — an open round on a question deactivated AFTER it was served no longer blocks the pupil.
--
-- NOT APPLIED IN PRODUCTION. Applying it needs a separate owner authorisation (D-110,
-- docs/migration-workflow-policy.md). `supabase db push` is forbidden.
--
-- WHY (reproduced: tests/isolated/open-round-inactive-question.isolated.spec.mjs, PR #551)
-- idx_one_open_question allows one unanswered instance per pupil. get-next-question never serves an
-- instance whose question is inactive, and release_open_question_outside (its first step) releases an
-- open instance only when the question's learning_objective lies OUTSIDE the chosen subject. A round
-- opened on a question that is deactivated afterwards, inside the chosen subject, therefore stays open
-- for ever: every new instance is refused and the pupil gets "no_questions" in that subject (production
-- 2026-11-02: one such round, world_war_2 in historie). D-290 G2's guard stops NEW rounds on inactive
-- questions; it cannot stop a question being deactivated while a round on it is open.
--
-- WHAT CHANGES (and nothing else)
-- release_open_question_outside also releases the caller's open round when its question is INACTIVE,
-- whatever the subject — by exactly the two paths it already has for a subject switch:
--   * a round-1 instance (repeat_count = 0, no saved answer) is DELETED, as today. It was never answered,
--     so it holds no answer, no reward and no H5 attempt (H5 writes an attempt only when it closes a
--     round, and every reopen raises repeat_count — H5's round guard enforces that), so nothing can
--     cascade from it;
--   * a reopened repeat (repeat_count > 0, no saved answer) is CLOSED again (answered = true,
--     answered_at = now()), as today: the row stays, repeat_count keeps its value, earlier answers and
--     attempts stay, and it can never be served again as a first attempt with the full reward.
-- Unchanged: signature, RETURNS integer (rows released), SECURITY DEFINER, search_path, the two
-- exceptions, EXECUTE (authenticated only), the subject-switch behaviour, and every row this function
-- did not release before is still not touched — an instance with a saved answer (awaiting a teacher) is
-- never released, and an open round on an ACTIVE question inside the subject is still served.
-- XP, coins, streaks, mastery, achievements and quests are not written by this function.
--
-- GUARD: replaces only production's reviewed body (md5(prosrc) 7b7693b3bff869a113e8e97e16bb456a,
-- the body of 20261002000000, pinned by H5's bootstrap) or this file's own body (re-run). Anything else
-- aborts and changes nothing.
--
-- H5 COMPATIBILITY: 20261101190000 (H5 bootstrap, not applied) pins this function's md5. It accepts
-- both the old body and this file's body (changed in the same PR), so H5 and this file can be applied
-- in either order. tests/unit/release-open-rounds-inactive-pg.test.mjs proves both orders on PostgreSQL 17.
--
-- ROLLBACK: docs/operations/release-open-rounds-inactive-rollback.md (restores the old body exactly).
-- ============================================================================

DO $guard$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(p.prosrc) INTO v_md5
  FROM pg_catalog.pg_proc p
  WHERE p.oid = to_regprocedure('public.release_open_question_outside(text[])');
  IF v_md5 IS NULL OR v_md5 NOT IN ('7b7693b3bff869a113e8e97e16bb456a', 'ecbaa6bcce3940f4a8607526f5fd756a') THEN
    RAISE EXCEPTION 'D-316: release_open_question_outside has an unreviewed body (md5 %); nothing changed', coalesce(v_md5, 'missing');
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.release_open_question_outside(p_domains text[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_closed  INTEGER;
  v_deleted INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_domains IS NULL OR array_length(p_domains, 1) IS NULL THEN
    RAISE EXCEPTION 'invalid_domains';
  END IF;

  -- D-316: a round is also released when its question is inactive (deactivated after it was served).
  UPDATE public.question_instances qi
  SET    answered    = true,
         answered_at = now()
  FROM   public.questions q
  WHERE  qi.question_id  = q.id
    AND  qi.student_id   = v_user_id
    AND  qi.answered     = false
    AND  qi.user_answer IS NULL
    AND  qi.repeat_count > 0
    AND  (q.is_active IS NOT TRUE
          OR q.learning_objective IS NULL OR NOT (q.learning_objective = ANY (p_domains)));

  GET DIAGNOSTICS v_closed = ROW_COUNT;

  DELETE FROM public.question_instances qi
  USING  public.questions q
  WHERE  qi.question_id  = q.id
    AND  qi.student_id   = v_user_id
    AND  qi.answered     = false
    AND  qi.user_answer IS NULL
    AND  qi.repeat_count = 0
    AND  (q.is_active IS NOT TRUE
          OR q.learning_objective IS NULL OR NOT (q.learning_objective = ANY (p_domains)));

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN v_closed + v_deleted;
END;
$function$;

REVOKE ALL ON FUNCTION public.release_open_question_outside(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_open_question_outside(text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.release_open_question_outside(text[]) TO authenticated;

COMMENT ON FUNCTION public.release_open_question_outside(text[]) IS
  'Frigiver kalderens åbne, ubesvarede instance uden gemt svar, hvis spørgsmålet ligger uden for p_domains (fagskift) eller er inaktivt (D-316: deaktiveret efter udlevering). Et nyt spørgsmål slettes; et gensyn (repeat_count > 0) lukkes igen i stedet, så det aldrig kan serveres som nyt med fuld belønning. Returnerer antal frigivne rækker (0 eller 1).';
