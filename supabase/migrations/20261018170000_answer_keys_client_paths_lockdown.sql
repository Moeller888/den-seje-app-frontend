-- Keep answer keys server-side, step B of two: TAKE AWAY the old client paths.
--
-- CONTEXT (audit findings E1/E2, 2026-10-16)
-- Step A (20261016160000_answer_keys_server_side_rpcs; remote ledger 20261018095931) added the
-- server-owned replacements, and get-next-question v174 / process-event v33 now read every answer key
-- through the backend client and send the browser a whitelisted payload. The frontend placement uses
-- start_placement() / submit_placement() (this PR). What is left are the old client paths that still
-- hand out the key, and the old repeat entry point with a caller-chosen scope:
--   P2  get_unserved_questions(smallint, text[]) — SECURITY DEFINER, EXECUTE for PUBLIC, anon and
--       authenticated, returns questions.content (key included) for any grade/domain scope.
--   P3  question_instances.correct_answer — readable by the row's owner: authenticated holds
--       TABLE-level SELECT, so every column is readable and RLS only limits the rows.
--   P4  questions — policy "allow read questions" FOR SELECT TO public USING (true): anyone with the
--       public publishable key reads the whole bank, keys included, without logging in.
--   E2  request_repeat_question(smallint, text[]) — EXECUTE for authenticated with a self-chosen
--       grade/domain scope (an empty mini-scope yields endless repeats).
--
-- WHO STILL NEEDS WHAT (repository + live catalog scan, origin/main dbea181)
--   questions            teachers: js/teacher.js and js/student-detail.js read content and embed
--                        questions(learning_objective|difficulty_band) under their pupils' instances.
--                        super_admin: admin surfaces. Pupils and anon: nothing — placement and the quiz
--                        go through SECURITY DEFINER functions / the backend client.
--   question_instances   teachers (RLS-scoped to their own pupils) and get-reviewed-answers (the
--                        pupil's own reviewed rows) select named, non-secret columns only.
--                        process-event v33 still issues a pupil-client UPDATE ... WHERE id AND
--                        student_id (a 0-row no-op, no UPDATE policy) which needs SELECT on id and
--                        student_id. No client selects correct_answer, and none selects '*'.
--   old RPCs             no caller left: get-next-question v174 uses the *_for_student functions; no
--                        SQL function, view or policy calls the old ones.
--   SECURITY INVOKER functions / policies on other tables referencing either table: none.
--
-- WHAT THIS MIGRATION DOES
--   1. questions: replaces "allow read questions" with "staff read questions" — SELECT for
--      authenticated callers whose profiles.role (auth_profile_role(), SECURITY DEFINER, reads the
--      caller's own row — never a client claim) is teacher or super_admin — and revokes SELECT from
--      anon at table level as well.
--   2. question_instances: revokes table-level SELECT from anon and authenticated and grants
--      authenticated SELECT on every column EXCEPT correct_answer. RLS still decides the rows.
--      A pupil's select of correct_answer — or of '*', which expands to it — is refused with
--      "permission denied"; nothing can return the key. New columns are not client-readable until
--      granted (fail closed).
--   3. get_unserved_questions and request_repeat_question: EXECUTE revoked from PUBLIC, anon,
--      authenticated and service_role. The functions are kept (no DROP) so this stays a pure
--      privilege change; nothing calls them any more.
--
-- WHAT THIS MIGRATION DOES NOT DO
-- No function body, reward amount, selection rule, repeat rule, mastery or progression changes. No
-- UPDATE/DELETE/TRUNCATE grant on question_instances or questions is touched (they stay blocked by RLS
-- with no policy; tracked separately). No data is modified.
--
-- ORDER (each step its own owner authorisation, D-110): migration A applied → get-next-question v174
-- and process-event v33 deployed → this PR merged (frontend placement live) → apply THIS file once via
-- apply_migration. Never db push.

-- ── 1. questions: staff only ─────────────────────────────────────────────────
DROP POLICY "allow read questions" ON public.questions;

CREATE POLICY "staff read questions"
  ON public.questions
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((SELECT public.auth_profile_role()) IN ('teacher', 'super_admin'));

REVOKE SELECT ON public.questions FROM anon;

-- ── 2. question_instances: every column but the key ──────────────────────────
REVOKE SELECT ON public.question_instances FROM anon, authenticated;

GRANT SELECT (
  id, student_id, question_id, difficulty_at_time, mastery_snapshot, created_at, answered,
  answered_at, is_correct, xp_awarded, next_due, next_review_at, incorrect_attempts, user_answer,
  was_correct, teacher_feedback, teacher_score, reviewed_at, reviewed_by, misconception_signal,
  repeat_count
) ON public.question_instances TO authenticated;

-- ── 3. the old key-bearing selection and the old repeat entry point ──────────
REVOKE EXECUTE ON FUNCTION public.get_unserved_questions(smallint, text[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.request_repeat_question(smallint, text[]) FROM PUBLIC, anon, authenticated, service_role;
