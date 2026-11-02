-- ============================================================================
-- D-290 (G2) — temporarily deactivate the two English possessive questions that grade a wrong option
-- as correct (D-285: the current grading rule strips the apostrophe). Reversible.
--
-- NOT APPLIED IN PRODUCTION. Applying it needs a separate owner authorisation (D-110,
-- docs/migration-workflow-policy.md). Reactivation: docs/operations/deactivate-two-misgraded-questions.md
-- (after the corrected grading of D-285 G1 is live).
--
--   08c1770e-b9e6-4a14-a5e0-6420337ba052  english, grade 4, band 3  ("'s" / "s'" / "s" collide)
--   3213c5be-71b8-4dab-817f-26a1deca5cb5  english, grade 4, band 4  (two sentences differ only by "'")
--
-- Two parts, in this order, in the one transaction apply_migration runs:
--
-- 1. A guard on question_instances (D-290 fix, 2026-11-01): a NEW open round — an inserted instance
--    that is not answered, or an answered instance reopened (answered true → false) — is refused
--    unless its question is active. get-next-question reads its candidates first and inserts later,
--    and the repeat functions pick an answered instance first and reopen it later; neither re-checks
--    questions.is_active at the write. Without the guard, a request that read one of the two questions
--    before the deactivation committed could still open a round on it afterwards — an open instance
--    get-next-question never serves (it skips inactive questions) and that blocks every new question
--    for that pupil (idx_one_open_question).
--    The guard reads the question row FOR SHARE, which conflicts with any UPDATE of that row:
--      * the write first: the deactivation waits for it, then counts the open instance and aborts;
--      * the deactivation first: the write waits, then reads is_active = false and is refused.
--    Existing instances are never changed by it: an update that does not open a new round, and every
--    row already open, pass untouched. It refuses with SQLSTATE 23514 (check_violation):
--    get-next-question logs a failed insert and tries its next candidate; a refused reopen fails that
--    one request, and the next request picks another instance.
--    The trigger is created BEFORE the question rows are locked: CREATE TRIGGER waits for writes in
--    flight on question_instances, and a write in flight may itself wait for the question row (its
--    foreign-key check), so the opposite order could deadlock.
--    The function is SECURITY DEFINER (the row lock must work whatever the writing role may do on
--    questions) with an empty search_path, and is no API: EXECUTE is revoked from every role.
--
-- 2. The deactivation: changes ONLY questions.is_active for the two ids. Every answer, instance,
--    reward and the question content stay exactly as they are.
--
-- Guards of part 2 (each aborts the whole migration, the trigger included, and changes nothing):
--   * both questions exist, are active and still carry the reviewed content and metadata (md5 of
--     content::text and metadata::text, read 2026-11-01);
--   * no pupil has an OPEN (unanswered) instance of either.
-- The two question rows are locked first, so no new round on them can open while the guards and the
-- change run (part 1's FOR SHARE, and the foreign-key check of an insert, both wait for that lock).
--
-- ROLLBACK of part 1 (only with a separate owner authorisation):
--   DROP TRIGGER open_round_requires_active_question ON public.question_instances;
--   DROP FUNCTION public.guard_open_round_requires_active_question();
-- ============================================================================

CREATE FUNCTION public.guard_open_round_requires_active_question()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $guard$
DECLARE
  v_active boolean;
BEGIN
  -- Only a NEW open round is checked; everything else passes without a lock.
  IF NEW.answered IS TRUE THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.answered IS NOT TRUE AND NEW.question_id IS NOT DISTINCT FROM OLD.question_id THEN
    RETURN NEW;
  END IF;

  SELECT q.is_active INTO v_active
    FROM public.questions q
   WHERE q.id = NEW.question_id
     FOR SHARE;

  IF v_active IS NOT TRUE THEN
    RAISE EXCEPTION 'open round refused: question % is not active', NEW.question_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$guard$;

REVOKE ALL ON FUNCTION public.guard_open_round_requires_active_question() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER open_round_requires_active_question
  BEFORE INSERT OR UPDATE OF answered, question_id ON public.question_instances
  FOR EACH ROW EXECUTE FUNCTION public.guard_open_round_requires_active_question();

DO $g2$
DECLARE
  v_ids      uuid[] := ARRAY['08c1770e-b9e6-4a14-a5e0-6420337ba052', '3213c5be-71b8-4dab-817f-26a1deca5cb5']::uuid[];
  v_reviewed integer;
  v_open     integer;
  v_rows     integer;
BEGIN
  PERFORM 1 FROM public.questions WHERE id = ANY (v_ids) FOR UPDATE;

  SELECT count(*) INTO v_reviewed
    FROM public.questions
   WHERE is_active
     AND (id, md5(content::text), md5(metadata::text)) IN (
       ('08c1770e-b9e6-4a14-a5e0-6420337ba052'::uuid, '004cbd99947f484a842d9210564915ab', '4a7dd45f217fd26ccb10beeae257a356'),
       ('3213c5be-71b8-4dab-817f-26a1deca5cb5'::uuid, '47577cb7bbc5839859dbb3caaad0d538', '4a7dd45f217fd26ccb10beeae257a356'));
  IF v_reviewed <> 2 THEN
    RAISE EXCEPTION 'D-290: expected 2 active questions with the reviewed content and metadata, found %; nothing changed', v_reviewed;
  END IF;

  SELECT count(*) INTO v_open FROM public.question_instances WHERE question_id = ANY (v_ids) AND answered = false;
  IF v_open <> 0 THEN
    RAISE EXCEPTION 'D-290: % open instance(s) of these questions; nothing changed', v_open;
  END IF;

  UPDATE public.questions SET is_active = false WHERE id = ANY (v_ids) AND is_active;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 2 THEN
    RAISE EXCEPTION 'D-290: changed % rows, expected 2', v_rows;
  END IF;
END
$g2$;
