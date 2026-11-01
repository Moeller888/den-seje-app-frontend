-- ============================================================================
-- D-290 (G2) — temporarily deactivate the two English possessive questions that grade a wrong option
-- as correct (D-285: the current grading rule strips the apostrophe). Data only, reversible.
--
-- NOT APPLIED IN PRODUCTION. Applying it needs a separate owner authorisation (D-110,
-- docs/migration-workflow-policy.md). Reactivation: docs/operations/deactivate-two-misgraded-questions.md
-- (after the corrected grading of D-285 G1 is live).
--
--   08c1770e-b9e6-4a14-a5e0-6420337ba052  english, grade 4, band 3  ("'s" / "s'" / "s" collide)
--   3213c5be-71b8-4dab-817f-26a1deca5cb5  english, grade 4, band 4  (two sentences differ only by "'")
--
-- Changes ONLY questions.is_active for these two ids. Every answer, instance, reward and the question
-- content stay exactly as they are.
--
-- Guards (each aborts and changes nothing):
--   * both questions exist and are active;
--   * no pupil has an OPEN (unanswered) instance of either — get-next-question does not serve an
--     inactive question, so an open one could otherwise leave that pupil without a next question.
-- The two question rows are locked first, so no new instance of them can be created while the guard
-- and the change run (a new instance needs a key-share lock on its question row).
-- ============================================================================

DO $g2$
DECLARE
  v_ids    uuid[] := ARRAY['08c1770e-b9e6-4a14-a5e0-6420337ba052', '3213c5be-71b8-4dab-817f-26a1deca5cb5']::uuid[];
  v_active integer;
  v_open   integer;
  v_rows   integer;
BEGIN
  PERFORM 1 FROM public.questions WHERE id = ANY (v_ids) FOR UPDATE;

  SELECT count(*) INTO v_active FROM public.questions WHERE id = ANY (v_ids) AND is_active;
  IF v_active <> 2 THEN
    RAISE EXCEPTION 'D-290: expected 2 active questions, found %; nothing changed', v_active;
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
