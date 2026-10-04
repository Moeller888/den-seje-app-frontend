-- Lock down direct EXECUTE on public.process_text_answer.
--
-- WHY THIS IS A SECURITY FIX
-- process_text_answer(uuid, uuid, text, boolean) is SECURITY DEFINER, owned by postgres, and lives
-- in `public` — the schema PostgREST exposes. It takes the pupil (p_user_id) and the verdict
-- (p_is_correct) as PARAMETERS and awards XP, coins, correct_answers, streak and quest progress from
-- them. It does not compare p_user_id with auth.uid(), does not evaluate the answer itself and does
-- not check the question's answer_format. EXECUTE was held by PUBLIC, anon and authenticated, so a
-- caller could reach /rest/v1/rpc/process_text_answer directly and assert both identity and
-- correctness. A function that trusts those two parameters must not be client-callable.
--
-- THE AUTHORITATIVE PATH
-- process-event is the only legitimate caller (verified: no browser code, no other Edge Function,
-- no other database function, trigger, view or cron job calls it). Since process-event v30
-- (PR #290) it authenticates the pupil and reads the instance with the pupil's own client, checks
-- that the instance belongs to that pupil, computes correctness with isTextAnswerCorrect, and makes
-- THIS call — and only this call — through a backend client built from the secret key, with
-- p_user_id = the verified user.id and p_is_correct = the evaluator's result. Production logs show
-- `[process-event] service-key source=secret-keys`, so that client runs as service_role. Revoking
-- EXECUTE from anon and authenticated therefore removes the direct path without touching the
-- legitimate one. Same pattern as 20260919000000_review_answer_execute_lockdown.sql.
--
-- WHAT THIS MIGRATION DOES NOT DO
-- The function body is untouched — no CREATE OR REPLACE — so the CAS guard on answered = false,
-- the reward amounts and the review scheduling are exactly as before. No other function, no table,
-- no RLS policy and no question is changed.
--
-- Re-runnable: REVOKE on an already-revoked privilege and GRANT of an already-held privilege are
-- both no-ops in PostgreSQL, and ALTER FUNCTION ... SET is idempotent.

REVOKE EXECUTE
ON FUNCTION public.process_text_answer(uuid, uuid, text, boolean)
FROM PUBLIC;

REVOKE EXECUTE
ON FUNCTION public.process_text_answer(uuid, uuid, text, boolean)
FROM anon;

REVOKE EXECUTE
ON FUNCTION public.process_text_answer(uuid, uuid, text, boolean)
FROM authenticated;

GRANT EXECUTE
ON FUNCTION public.process_text_answer(uuid, uuid, text, boolean)
TO service_role;

-- ── search_path ──────────────────────────────────────────────────────────────
-- Today the path is `public` only. For a SECURITY DEFINER function `pg_temp` belongs last, which is
-- the documented way to stop a temporary object from being resolved ahead of the real one. This is
-- a property change, not a body change: `public` keeps every unqualified reference resolving as now.
ALTER FUNCTION public.process_text_answer(uuid, uuid, text, boolean)
SET search_path = public, pg_temp;
