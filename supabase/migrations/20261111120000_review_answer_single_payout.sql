-- ============================================================================
-- review_answer (4 argumenter): én autoritativ, atomar og idempotent udbetaling pr. lærerbedømmelse.
--
-- NOT APPLIED IN PRODUCTION. Applying it needs a separate owner authorisation (D-110,
-- docs/migration-workflow-policy.md). `supabase db push` is forbidden.
-- Contract and rollout order: docs/security/review-answer-enkelt-udbetaling.md.
--
-- WHY
-- Production's review_answer(uuid, integer, text, uuid) (read-only catalog 2026-11-11) adds XP by score
-- (1 → 0, 2 → 10, 3 → 25, 4 → 50) on EVERY call: it has no "already reviewed" check and no format check.
-- The review-answer Edge Function then adds the same amount AGAIN with its own read-then-write. Result:
-- double pay per call, a new payout on every re-review, payouts on MC/short answers that the answer path
-- already graded and paid, and a lost update when two calls overlap.
--
-- WHAT CHANGES (and nothing else)
--   * public.teacher_review_payouts — new append-only audit table, ONE row per question instance that
--     has been paid for a teacher review (primary key = question_instance_id). No API role can read or
--     write it (RLS on, no policies, no grants except service_role SELECT for verification).
--   * public.review_answer(uuid, integer, text, uuid) — same signature, same SECURITY DEFINER, same
--     EXECUTE (service_role only). Return type void → jsonb (a small status the Edge Function reads),
--     which needs DROP + CREATE; the grants are restated in this same transaction.
--       1. Locks the instance row (FOR UPDATE): overlapping calls for the same instance serialise.
--       2. Always records the review (teacher_score, teacher_feedback, reviewed_at, reviewed_by), as today,
--          so the teacher's queue never gets stuck.
--       3. Pays ONLY when all hold: the instance is teacher-graded (was_correct IS NULL, a non-empty
--          user_answer, and the question is a long answer or the pending text format), it had no
--          teacher_score before this call, and no payout row exists. Paying inserts the payout row and
--          adds XP in the SAME transaction. The amount per score and the level formula are unchanged.
--       4. Otherwise pays 0: 'already_rewarded' (re-review: score/feedback are updated, no new payout) or
--          'not_teacher_graded' (an auto-graded instance: its reward came from the answer path).
--   * search_path = '' with fully qualified names.
--   Unchanged: the role and ownership checks (Edge Function), the 3-argument overload (no caller; with the
--   service client auth.uid() is NULL, so it can only raise 'Unauthorized'), every historical row.
--
-- GUARD
-- The file replaces only a reviewed body: production's (md5(prosrc) 310f72f44b3720c25e24a4d14307a3df;
-- md5(pg_get_functiondef) c5a7e38756a69099141c8987d8703c55, read-only catalog 2026-11-11) or this file's
-- own body (md5(prosrc) a9442050751b9f4e97715671a60a20a9; re-run, see tests/unit/review-answer-single-payout-migration-run.test.mjs). Anything else
-- — including the isolated replay's stub — aborts before a single change.
-- ============================================================================

DO $guard$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(p.prosrc) INTO v_md5
  FROM pg_catalog.pg_proc p
  WHERE p.oid = to_regprocedure('public.review_answer(uuid,integer,text,uuid)');
  IF v_md5 IS NULL OR v_md5 NOT IN ('310f72f44b3720c25e24a4d14307a3df',
                                    'a9442050751b9f4e97715671a60a20a9') THEN
    RAISE EXCEPTION 'review_answer single payout: review_answer(uuid,integer,text,uuid) has an unreviewed body (md5 %); stop',
      coalesce(v_md5, 'missing');
  END IF;
END
$guard$;

-- ── Audit: one row per paid instance ────────────────────────────────────────
-- No foreign key on purpose: reset-student deletes question_instances, and the audit row must neither
-- block that nor disappear with it.
CREATE TABLE IF NOT EXISTS public.teacher_review_payouts (
  question_instance_id uuid        PRIMARY KEY,
  student_id           uuid        NOT NULL,
  teacher_id           uuid,
  score                integer,
  xp_awarded           integer     NOT NULL CHECK (xp_awarded >= 0),
  coins_awarded        integer     NOT NULL DEFAULT 0 CHECK (coins_awarded >= 0),
  created_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.teacher_review_payouts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.teacher_review_payouts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.teacher_review_payouts TO service_role;

-- ── review_answer (4 argumenter) ───────────────────────────────────────────
DROP FUNCTION public.review_answer(uuid, integer, text, uuid);

CREATE FUNCTION public.review_answer(p_instance_id uuid, p_score integer, p_feedback text, p_teacher_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_student_id     uuid;
  v_was_correct    boolean;
  v_user_answer    text;
  v_prev_score     integer;
  v_answer_type    text;
  v_answer_format  text;
  v_teacher_graded boolean;
  v_xp             integer := 0;
  v_rows           integer;
BEGIN
  -- Lock the instance: a second call for the same instance waits here and then sees this call's result.
  SELECT qi.student_id, qi.was_correct, qi.user_answer, qi.teacher_score
  INTO   v_student_id, v_was_correct, v_user_answer, v_prev_score
  FROM   public.question_instances qi
  WHERE  qi.id = p_instance_id
  FOR UPDATE OF qi;

  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Instance not found';
  END IF;

  SELECT q.answer_type, q.answer_format
  INTO   v_answer_type, v_answer_format
  FROM   public.question_instances qi
  JOIN   public.questions q ON q.id = qi.question_id
  WHERE  qi.id = p_instance_id;

  -- Teacher-graded = the answer path stored the answer without grading it: a long answer (process-event
  -- saves it, nothing paid) or the pending text format (process_question_attempt, nothing paid).
  -- Every other format was graded and paid by the answer path and is never paid here.
  v_teacher_graded := v_was_correct IS NULL
                      AND coalesce(btrim(v_user_answer), '') <> ''
                      AND (v_answer_type = 'long' OR v_answer_format = 'text');

  -- The review itself is always recorded, as before.
  UPDATE public.question_instances
  SET    teacher_score    = p_score,
         teacher_feedback = p_feedback,
         reviewed_at      = now(),
         reviewed_by      = p_teacher_id
  WHERE  id = p_instance_id;

  IF NOT v_teacher_graded THEN
    RETURN jsonb_build_object('status', 'not_teacher_graded', 'xp_awarded', 0, 'coins_awarded', 0);
  END IF;

  -- A review that existed before this call (also one from before this migration) was already paid.
  IF v_prev_score IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'already_rewarded', 'xp_awarded', 0, 'coins_awarded', 0);
  END IF;

  -- Amount per score unchanged (owner decision to change it).
  v_xp := CASE p_score WHEN 1 THEN 0 WHEN 2 THEN 10 WHEN 3 THEN 25 WHEN 4 THEN 50 ELSE 0 END;

  INSERT INTO public.teacher_review_payouts
         (question_instance_id, student_id, teacher_id, score, xp_awarded, coins_awarded)
  VALUES (p_instance_id, v_student_id, p_teacher_id, p_score, v_xp, 0)
  ON CONFLICT (question_instance_id) DO NOTHING;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  -- A payout row already exists (the score was cleared by something else afterwards): never pay twice.
  IF v_rows = 0 THEN
    RETURN jsonb_build_object('status', 'already_rewarded', 'xp_awarded', 0, 'coins_awarded', 0);
  END IF;

  IF v_xp > 0 THEN
    UPDATE public.student_progress
    SET    xp    = coalesce(xp, 0) + v_xp,
           level = floor((coalesce(xp, 0) + v_xp) / 100) + 1
    WHERE  student_id = v_student_id;

    GET DIAGNOSTICS v_rows = ROW_COUNT;

    -- Fail loud: a payout without a progress row would be recorded but never reach the pupil.
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'student_progress missing for the reviewed instance';
    END IF;
  END IF;

  RETURN jsonb_build_object('status', 'rewarded', 'xp_awarded', v_xp, 'coins_awarded', 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.review_answer(uuid, integer, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.review_answer(uuid, integer, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.review_answer(uuid, integer, text, uuid) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.review_answer(uuid, integer, text, uuid) TO service_role;
