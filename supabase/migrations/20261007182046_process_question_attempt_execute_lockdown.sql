-- Lock down direct EXECUTE on public.process_question_attempt.
--
-- WHY THIS IS A SECURITY FIX
-- process_question_attempt(uuid, uuid, text, bigint) is SECURITY DEFINER, owned by postgres, and
-- lives in `public` — the schema PostgREST exposes. It evaluates the MC / number answer itself and
-- awards XP, coins, streak and quest progress, but it takes the pupil as a PARAMETER (p_student_id)
-- and does not compare it with auth.uid(). EXECUTE was held by PUBLIC, anon and authenticated, so
-- anyone who knew a pupil's id and one of their open instance ids could call
-- /rest/v1/rpc/process_question_attempt directly and answer — and be rewarded — on that pupil's
-- behalf, with no ownership check. A function that trusts p_student_id must not be client-callable.
--
-- THE AUTHORITATIVE PATH
-- process-event is the only legitimate caller (verified: no browser code, no other Edge Function,
-- no other database function, trigger, view or cron job calls it). Since process-event v31
-- (PR #295) it authenticates the pupil and reads the instance with the pupil's own client, checks
-- that the instance belongs to that pupil (403 otherwise), and makes this call through a backend
-- client built from the secret key, with p_student_id = the verified user.id. Production logs show
-- `[process-event] service-key source=secret-keys`, and v31 has served real MC / number answers
-- (`FLOW: MC/NUMBER → process_question_attempt`, correct and incorrect, HTTP 200, no RPC or
-- permission errors), so that client runs as service_role. Revoking EXECUTE from PUBLIC, anon and
-- authenticated therefore removes the direct path without touching the legitimate one. Same pattern
-- as 20261003153220_process_text_answer_execute_lockdown.sql.
--
-- WHAT THIS MIGRATION DOES NOT DO
-- The function body is untouched — no CREATE OR REPLACE — so answer evaluation, the reward amounts,
-- the repeat award, the answered = false idempotency guard, streak and quests are exactly as before.
-- There is no ALTER FUNCTION: the live function already has search_path = public, pg_temp.
-- No other function, no table, no RLS policy and no question is changed.
--
-- Re-runnable: REVOKE on an already-revoked privilege and GRANT of an already-held privilege are
-- both no-ops in PostgreSQL.

REVOKE EXECUTE
ON FUNCTION public.process_question_attempt(uuid, uuid, text, bigint)
FROM PUBLIC;

REVOKE EXECUTE
ON FUNCTION public.process_question_attempt(uuid, uuid, text, bigint)
FROM anon;

REVOKE EXECUTE
ON FUNCTION public.process_question_attempt(uuid, uuid, text, bigint)
FROM authenticated;

GRANT EXECUTE
ON FUNCTION public.process_question_attempt(uuid, uuid, text, bigint)
TO service_role;
