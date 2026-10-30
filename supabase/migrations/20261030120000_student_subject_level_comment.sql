-- Sværhedsskala 1-10.000: rettelse af tabelkommentaren på student_subject_level (efter migration B).
--
-- WHY. Migration A (20261020120000, remote 20261030045204) gave the table the comment "Server-owned:
-- written only by SECURITY DEFINER functions and the backend key." That is wrong: migration B
-- (20261029120000, remote 20261030094958) writes the table through advance_student_level, which is
-- SECURITY INVOKER and executable by service_role only. Owner decision 2026-10-30: correct it in a NEW,
-- comment-only migration after B; the A and B files are never edited.
--
-- WHAT THIS CHANGES: the table comment, nothing else. No function, ACL, grant, RLS, policy, table,
-- column, index or row is changed. tests/unit/student-subject-level-comment-migration-run.test.mjs
-- applies it after the production replay (#351 → A → B) and proves exactly that.
--
-- NOT APPLIED IN PRODUCTION. It is listed in tests/isolated/schema/replay-plan.mjs NOT_IN_PRODUCTION
-- until it has been applied (its own owner approval, D-110: apply_migration, never db push) and
-- verified. Rollback: COMMENT ON TABLE with A's text again.

COMMENT ON TABLE public.student_subject_level IS
  'Elevens niveau 1–10.000 pr. fag. Serverejet: skrivning kan kun ske med service_role, herunder gennem advance_student_level, som er SECURITY INVOKER og kun kan kaldes af service_role. Authenticated-brugere kan via RLS kun læse deres egne rækker og kan ikke skrive.';
