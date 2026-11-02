-- ============================================================================
-- D-298 (H2, from D-266) — a question with answer history can no longer be deleted; it is archived
-- (is_active = false) instead.
--
-- NOT APPLIED IN PRODUCTION. Applying it needs a separate owner authorisation (D-110,
-- docs/migration-workflow-policy.md). The isolated replay skips it (NOT_IN_PRODUCTION) until it is
-- applied and verified.
--
-- WHY: question_instances.question_id and student_answers.question_id reference questions(id) with
-- ON DELETE CASCADE, so deleting one question silently deletes every pupil's answers to it. The answer
-- history L1 builds on (D-266) must not be lost that way.
--
-- WHAT CHANGES (and nothing else)
--   The two foreign keys are re-created with the same name, the same column and the same target, with
--   ON DELETE RESTRICT instead of ON DELETE CASCADE. No row is read for the answer history, changed or
--   deleted. A question WITHOUT answer history can still be deleted; one WITH history is refused and
--   must be archived with is_active = false. The refusal's SQLSTATE depends on the server version:
--   PostgreSQL 17 (production) reports 23503 foreign_key_violation ("update or delete on table
--   "questions" violates foreign key constraint ..."); PostgreSQL 18 reports 23001 restrict_violation.
--
-- GUARD: each constraint must be exactly production's CASCADE definition (read-only catalog
-- 2026-11-01) or already this file's RESTRICT definition (re-run: no change). Anything else aborts.
--
-- LOCKS: re-creating a foreign key takes a short exclusive lock on question_instances and
-- student_answers and validates their rows (5,912 and 80 rows on 2026-11-01). lock_timeout (5s) makes the
-- migration abort instead of queueing behind a long transaction; it can then simply be run again.
--
-- ATOMIC, WHATEVER THE RUNNER DOES: Supabase does not document whether apply_migration wraps a file in
-- one transaction. So the guard, the lock_timeout and BOTH constraint changes are ONE statement (one DO
-- block): a failure anywhere — the guard, a lock timeout, the validation of either table — rolls back
-- everything, also the first table's change, whether the runner wraps the file or runs each statement on
-- its own (autocommit). lock_timeout is set with set_config(..., is_local => true) INSIDE the block, so it
-- applies to exactly this statement's transaction in both models (a top-level SET LOCAL would be a no-op
-- outside a transaction). tests/unit/question-history-restrict-pg.test.mjs proves both on PostgreSQL 17:
-- a forced failure of the second change leaves the first one rolled back.
--
-- ROLLBACK: docs/operations/question-history-restrict-rollback.md (separate owner authorisation).
-- ============================================================================

DO $h2$
DECLARE
  v_cascade  CONSTANT text := 'FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE';
  v_restrict CONSTANT text := 'FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE RESTRICT';
  r record;
  v_found integer := 0;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  FOR r IN
    SELECT c.conrelid::regclass::text AS tbl, c.conname, pg_get_constraintdef(c.oid) AS def
      FROM pg_constraint c
     WHERE c.contype = 'f'
       AND c.confrelid = 'public.questions'::regclass
  LOOP
    IF (r.tbl, r.conname) NOT IN (('question_instances', 'question_instances_question_id_fkey'),
                                  ('student_answers', 'student_answers_question_id_fkey')) THEN
      RAISE EXCEPTION 'D-298 H2: unreviewed foreign key %.% to questions; nothing changed', r.tbl, r.conname;
    END IF;
    IF r.def NOT IN (v_cascade, v_restrict) THEN
      RAISE EXCEPTION 'D-298 H2: %.% is "%", not the reviewed definition; nothing changed', r.tbl, r.conname, r.def;
    END IF;
    v_found := v_found + 1;
  END LOOP;
  IF v_found <> 2 THEN
    RAISE EXCEPTION 'D-298 H2: expected the 2 reviewed foreign keys to questions, found %; nothing changed', v_found;
  END IF;

  EXECUTE $ddl$ALTER TABLE public.question_instances
  DROP CONSTRAINT question_instances_question_id_fkey,
  ADD CONSTRAINT question_instances_question_id_fkey
    FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE RESTRICT$ddl$;

  EXECUTE $ddl$ALTER TABLE public.student_answers
  DROP CONSTRAINT student_answers_question_id_fkey,
  ADD CONSTRAINT student_answers_question_id_fkey
    FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE RESTRICT$ddl$;
END
$h2$;
