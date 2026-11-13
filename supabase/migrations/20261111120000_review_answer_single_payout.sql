-- ============================================================================
-- review_answer (4 argumenter): én autoritativ, atomar og idempotent XP-postering pr. lærerbedømmelse,
-- som kan rettes op eller ned med en sporbar reguleringspostering (model B).
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
-- THE RULE (model B, owner's preferred direction 2026-11-11)
-- The CURRENT teacher score is authoritative. For a teacher-graded instance the pupil is entitled to
-- exactly xp_for(current score). Every review computes
--     delta = xp_for(new score) − (sum of all postings for this instance)
-- and, if delta ≠ 0, appends ONE posting with that delta and moves student_progress.xp by the same delta in
-- the same transaction. Consequences:
--   * the same review again (retry, double click, two simultaneous calls) → delta 0 → nothing paid;
--   * a correction up pays the difference; a correction down takes back the difference; back to the first
--     score restores it — the sum of postings always equals xp_for(current score);
--   * history is never rewritten: postings are append-only (a trigger refuses UPDATE and DELETE).
--
-- WHAT CHANGES (and nothing else)
--   * public.teacher_review_postings — new append-only ledger. No API role can read or write it (RLS on, no
--     policies, no grants except service_role SELECT for verification). Kinds:
--       'award'           the first posting for an instance reviewed after this migration (may be 0 XP);
--       'adjustment'      a later correction (delta ≠ 0, may be negative);
--       'legacy_baseline' an instance reviewed BEFORE this migration: its old score is recognised as
--                         already paid (xp_delta = xp_for(old score), applied = false: this ledger did
--                         not move XP for it). The old path may have paid more; that is NOT clawed back.
--   * public.review_answer(uuid, integer, text, uuid) — same signature, same SECURITY DEFINER, same
--     EXECUTE (service_role only). Return type void → jsonb, which needs DROP + CREATE; the grants are
--     restated in this same transaction.
--       1. Rejects a score outside 1..4 before anything is written (the old body stored it and paid 0).
--       2. Locks the instance row (FOR UPDATE): overlapping calls for the same instance serialise.
--       3. Always records the review (teacher_score, teacher_feedback, reviewed_at, reviewed_by), as today.
--       4. Posts only for teacher-graded instances (was_correct IS NULL, a non-empty user_answer, and the
--          question is a long answer or the pending text format). Auto-graded instances were paid by the
--          answer path and get 'not_teacher_graded', 0 XP, no posting.
--       5. XP never goes below 0: a correction that would do so raises and rolls everything back (it can
--          only happen if XP was changed outside this ledger — nothing in production lowers XP today).
--   * search_path = '' with fully qualified names. Amount per score and level formula unchanged.
--   Unchanged: the role and ownership checks (Edge Function), the 3-argument overload (no caller), every
--   historical row of question_instances and student_progress, coins (a review pays 0 coins, as today).
--
-- GUARD
-- The file replaces only a reviewed body: production's (md5(prosrc) 310f72f44b3720c25e24a4d14307a3df;
-- md5(pg_get_functiondef) c5a7e38756a69099141c8987d8703c55, read-only catalog 2026-11-11) or this file's
-- own body (re-run; md5 pinned in tests/unit/review-answer-single-payout-migration-run.test.mjs and below).
-- Anything else — including the isolated replay's stub — aborts before a single change.
-- ============================================================================

DO $guard$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(p.prosrc) INTO v_md5
  FROM pg_catalog.pg_proc p
  WHERE p.oid = to_regprocedure('public.review_answer(uuid,integer,text,uuid)');
  IF v_md5 IS NULL OR v_md5 NOT IN ('310f72f44b3720c25e24a4d14307a3df',
                                    'f0ac2d912b94b958360ca99a9d0a1028') THEN
    RAISE EXCEPTION 'review_answer adjustable payout: review_answer(uuid,integer,text,uuid) has an unreviewed body (md5 %); stop',
      coalesce(v_md5, 'missing');
  END IF;
END
$guard$;

-- ── Ledger: append-only postings ────────────────────────────────────────────
-- No foreign key on purpose: the ledger must neither block a later deletion of an instance nor
-- disappear with it.
CREATE TABLE IF NOT EXISTS public.teacher_review_postings (
  id                   bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  question_instance_id uuid        NOT NULL,
  student_id           uuid        NOT NULL,
  teacher_id           uuid,
  kind                 text        NOT NULL CHECK (kind IN ('award', 'adjustment', 'legacy_baseline')),
  previous_score       integer,
  score                integer     NOT NULL CHECK (score BETWEEN 1 AND 4),
  xp_delta             integer     NOT NULL,
  coins_delta          integer     NOT NULL DEFAULT 0 CHECK (coins_delta = 0),
  entitled_xp          integer     NOT NULL CHECK (entitled_xp >= 0),
  applied              boolean     NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (kind = 'legacy_baseline' OR applied),
  CHECK (kind <> 'adjustment' OR xp_delta <> 0)
);

CREATE INDEX IF NOT EXISTS teacher_review_postings_instance_idx
  ON public.teacher_review_postings (question_instance_id, id);

ALTER TABLE public.teacher_review_postings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.teacher_review_postings FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.teacher_review_postings TO service_role;

-- History is never rewritten, not even by the table owner.
CREATE OR REPLACE FUNCTION public.teacher_review_postings_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'teacher_review_postings is append-only';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.teacher_review_postings_append_only() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS teacher_review_postings_append_only ON public.teacher_review_postings;
CREATE TRIGGER teacher_review_postings_append_only
  BEFORE UPDATE OR DELETE ON public.teacher_review_postings
  FOR EACH ROW EXECUTE FUNCTION public.teacher_review_postings_append_only();

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
  v_postings       integer;
  v_entitled       integer;
  v_target         integer;
  v_delta          integer;
  v_kind           text;
  v_new_xp         integer;
  v_rows           integer;
BEGIN
  IF p_score IS NULL OR p_score NOT IN (1, 2, 3, 4) THEN
    RAISE EXCEPTION 'Invalid score';
  END IF;

  -- Lock the instance: a second call for the same instance waits here and then sees this call's postings.
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

  -- The review itself is always recorded, as before.
  UPDATE public.question_instances
  SET    teacher_score    = p_score,
         teacher_feedback = p_feedback,
         reviewed_at      = now(),
         reviewed_by      = p_teacher_id
  WHERE  id = p_instance_id;

  -- Teacher-graded = the answer path stored the answer without grading it: a long answer (process-event
  -- saves it, nothing paid) or the pending text format (process_question_attempt, nothing paid).
  -- Every other format was graded and paid by the answer path and is never paid here. coalesce: a missing
  -- question must mean "not teacher-graded", never NULL (NOT NULL would fall through to a payout).
  IF NOT (v_was_correct IS NULL
          AND coalesce(btrim(v_user_answer), '') <> ''
          AND (coalesce(v_answer_type, '') = 'long' OR coalesce(v_answer_format, '') = 'text')) THEN
    RETURN jsonb_build_object('status', 'not_teacher_graded', 'xp_awarded', 0, 'coins_awarded', 0);
  END IF;

  SELECT count(*), coalesce(sum(t.xp_delta), 0)
  INTO   v_postings, v_entitled
  FROM   public.teacher_review_postings t
  WHERE  t.question_instance_id = p_instance_id;

  -- Reviewed before this migration and never posted: recognise the old score as already paid.
  IF v_postings = 0 AND v_prev_score BETWEEN 1 AND 4 THEN
    v_entitled := CASE v_prev_score WHEN 1 THEN 0 WHEN 2 THEN 10 WHEN 3 THEN 25 WHEN 4 THEN 50 END;
    INSERT INTO public.teacher_review_postings
           (question_instance_id, student_id, teacher_id, kind, previous_score, score, xp_delta, entitled_xp, applied)
    VALUES (p_instance_id, v_student_id, NULL, 'legacy_baseline', NULL, v_prev_score, v_entitled, v_entitled, false);
    v_postings := 1;
  END IF;

  -- Amount per score unchanged (changing it is an owner decision).
  v_target := CASE p_score WHEN 1 THEN 0 WHEN 2 THEN 10 WHEN 3 THEN 25 WHEN 4 THEN 50 END;
  v_delta  := v_target - v_entitled;

  IF v_postings > 0 AND v_delta = 0 THEN
    RETURN jsonb_build_object('status', 'unchanged', 'xp_awarded', 0, 'coins_awarded', 0);
  END IF;

  v_kind := CASE WHEN v_postings = 0 THEN 'award' ELSE 'adjustment' END;

  INSERT INTO public.teacher_review_postings
         (question_instance_id, student_id, teacher_id, kind, previous_score, score, xp_delta, entitled_xp, applied)
  VALUES (p_instance_id, v_student_id, p_teacher_id, v_kind, v_prev_score, p_score, v_delta, v_target, true);

  IF v_delta <> 0 THEN
    UPDATE public.student_progress
    SET    xp    = coalesce(xp, 0) + v_delta,
           level = floor((coalesce(xp, 0) + v_delta) / 100) + 1
    WHERE  student_id = v_student_id
    RETURNING xp INTO v_new_xp;

    GET DIAGNOSTICS v_rows = ROW_COUNT;

    -- Fail loud: a posting without a progress row would be recorded but never reach the pupil.
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'student_progress missing for the reviewed instance';
    END IF;
    IF v_new_xp < 0 THEN
      RAISE EXCEPTION 'review correction would make XP negative';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'status',        CASE WHEN v_kind = 'award' THEN 'rewarded' ELSE 'adjusted' END,
    'xp_awarded',    v_delta,
    'coins_awarded', 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.review_answer(uuid, integer, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.review_answer(uuid, integer, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.review_answer(uuid, integer, text, uuid) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.review_answer(uuid, integer, text, uuid) TO service_role;
