-- ============================================================================
-- D-327 (H5 track, decided 2026-11-02: "(b)") — an H5 attempt can no longer vanish because its
-- question_instances row is deleted: question_attempts_instance_fkey becomes ON DELETE NO ACTION.
--
-- NOT APPLIED IN PRODUCTION. Applying it needs a separate owner authorisation (D-110,
-- docs/migration-workflow-policy.md). The isolated replay skips it (NOT_IN_PRODUCTION) until it is
-- applied and verified.
--
-- ORDER (binding): AFTER the H5 bootstrap (20261101190000) and alignment (20261101190100) — the table
-- and the constraint only exist then — and BEFORE H5 is activated (before any real attempt is written).
-- Independent of K1 (#536), which does not look at this constraint. The guard refuses to run without
-- the H5 table.
--
-- WHY: question_attempts_instance_fkey (question_instance_id, student_id) → question_instances (id,
-- student_id) is ON DELETE CASCADE (20261030211428, created verbatim by the bootstrap). Any DELETE of an
-- instance row — a mistaken admin statement, a future cleanup, a bug — would silently delete every
-- attempt of that round with it. H2 (D-298) already stops the path through deleting a question, and
-- D-316's history guard stops release_open_question_outside; this closes the instance level itself.
--
-- WHAT CHANGES (and nothing else)
--   The constraint is re-created with the same name, columns and target, ON DELETE NO ACTION, NOT
--   DEFERRABLE. Deleting an instance that has attempts is then refused (23503) and both rows stay; an
--   instance WITHOUT attempts can still be deleted (release_open_question_outside's round-1 path).
--   No row is read for the history, changed or deleted.
--   UNCHANGED, on purpose: question_attempts_student_id_fkey → auth.users ON DELETE CASCADE. Deleting
--   an account (auth.users) is the legitimate, authorised removal of a pupil's personal data: in that
--   ONE statement the cascade deletes the pupil's instances AND attempts together, and NO ACTION is
--   checked at the end of the statement, when both are gone — so account deletion keeps working.
--   NOT DEFERRABLE: NO ACTION already waits until the end of the statement, which is all account
--   deletion needs. DEFERRABLE INITIALLY DEFERRED would let a transaction delete an instance and leave
--   its attempts orphaned until commit — a window with no use case. Proven on PostgreSQL 17:
--   tests/unit/question-attempts-history-no-action-pg.test.mjs.
--
-- GUARD: question_attempts exists; its only foreign key to question_instances is
-- question_attempts_instance_fkey with exactly the H5 definition (ON DELETE CASCADE) or already this
-- file's NO ACTION definition (re-run: no change); the account key is exactly the H5 CASCADE definition.
-- Anything else aborts and changes nothing.
--
-- ATOMIC, WHATEVER THE RUNNER DOES: one statement (one DO block); lock_timeout (5s) is set with
-- set_config(..., true) inside it, so it applies in both transaction models (as D-298 H2).
--
-- ROLLBACK: docs/operations/question-attempts-history-no-action-rollback.md (separate owner
-- authorisation).
-- ============================================================================

DO $h5b$
DECLARE
  v_cascade   CONSTANT text := 'FOREIGN KEY (question_instance_id, student_id) REFERENCES question_instances(id, student_id) ON DELETE CASCADE';
  v_no_action CONSTANT text := 'FOREIGN KEY (question_instance_id, student_id) REFERENCES question_instances(id, student_id)';
  v_account   CONSTANT text := 'FOREIGN KEY (student_id) REFERENCES auth.users(id) ON DELETE CASCADE';
  v_def       text;
  v_n         integer;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  IF to_regclass('public.question_attempts') IS NULL THEN
    RAISE EXCEPTION 'D-327: public.question_attempts does not exist — apply the H5 bootstrap and alignment first; nothing changed';
  END IF;

  SELECT count(*) INTO v_n FROM pg_catalog.pg_constraint
   WHERE contype = 'f' AND conrelid = 'public.question_attempts'::regclass
     AND confrelid = 'public.question_instances'::regclass;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'D-327: expected exactly 1 foreign key from question_attempts to question_instances, found %; nothing changed', v_n;
  END IF;

  SELECT pg_get_constraintdef(c.oid) INTO v_def FROM pg_catalog.pg_constraint c
   WHERE c.conname = 'question_attempts_instance_fkey' AND c.conrelid = 'public.question_attempts'::regclass
     AND NOT c.condeferrable;
  IF v_def IS NULL OR v_def NOT IN (v_cascade, v_no_action) THEN
    RAISE EXCEPTION 'D-327: question_attempts_instance_fkey is "%", not the reviewed definition; nothing changed', coalesce(v_def, 'missing or deferrable');
  END IF;

  SELECT pg_get_constraintdef(c.oid) INTO v_def FROM pg_catalog.pg_constraint c
   WHERE c.conname = 'question_attempts_student_id_fkey' AND c.conrelid = 'public.question_attempts'::regclass;
  IF v_def IS DISTINCT FROM v_account THEN
    RAISE EXCEPTION 'D-327: question_attempts_student_id_fkey is "%", not H5''s account key; nothing changed', coalesce(v_def, 'missing');
  END IF;

  EXECUTE $ddl$ALTER TABLE public.question_attempts
  DROP CONSTRAINT question_attempts_instance_fkey,
  ADD CONSTRAINT question_attempts_instance_fkey FOREIGN KEY (question_instance_id, student_id)
    REFERENCES public.question_instances (id, student_id) ON DELETE NO ACTION NOT DEFERRABLE$ddl$;
END
$h5b$;
