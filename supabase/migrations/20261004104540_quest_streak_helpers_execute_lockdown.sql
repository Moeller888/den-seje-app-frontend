-- Lock down direct EXECUTE on the three internal quest/streak helpers.
--
-- WHY THIS IS A SECURITY FIX
-- update_quest_progress_for_answer(uuid, boolean, integer),
-- update_weekly_quest_progress_for_answer(uuid, boolean, integer) and update_streak(uuid) are
-- SECURITY DEFINER, owned by postgres, and live in `public` — the schema PostgREST exposes. Each
-- takes the pupil (p_student_id) — and the two quest helpers also the outcome (p_was_correct /
-- p_correct, p_xp_earned) — as PARAMETERS, and none of them compares anything with auth.uid().
-- EXECUTE was held by PUBLIC, anon, authenticated and service_role, so a caller could reach
-- /rest/v1/rpc/<helper> directly and advance daily and weekly quest progress — for themselves or,
-- since student ids are readable, for another pupil — without answering a single question, then
-- collect the reward through the legitimate claim RPCs. update_streak could likewise move any
-- pupil's streak forward by a day.
--
-- WHY NOBODY NEEDS DIRECT EXECUTE — NOT EVEN service_role
-- These are internal helpers. Their only callers are process_question_attempt and
-- process_text_answer (verified in pg_proc; no other function, trigger, view, cron job, Edge
-- Function or browser code calls them). Both callers are SECURITY DEFINER and owned by postgres,
-- so inside them the helpers run as postgres, which keeps EXECUTE as the owner. No backend client
-- calls the helpers directly, so service_role loses nothing it uses — and keeping it would leave a
-- standing privilege nothing needs.
--
-- WHAT THIS MIGRATION DOES NOT DO
-- The function bodies are untouched — no CREATE OR REPLACE — so quest progression, streak
-- logic, milestone coins, XP and coins are exactly as before. process_question_attempt and
-- process_text_answer are not touched. No other function, no table, no RLS policy is changed.
--
-- Re-runnable: REVOKE on an already-revoked privilege is a no-op in PostgreSQL, and
-- ALTER FUNCTION ... SET is idempotent.

-- ── update_quest_progress_for_answer ─────────────────────────────────────────
REVOKE EXECUTE
ON FUNCTION public.update_quest_progress_for_answer(uuid, boolean, integer)
FROM PUBLIC;

REVOKE EXECUTE
ON FUNCTION public.update_quest_progress_for_answer(uuid, boolean, integer)
FROM anon;

REVOKE EXECUTE
ON FUNCTION public.update_quest_progress_for_answer(uuid, boolean, integer)
FROM authenticated;

REVOKE EXECUTE
ON FUNCTION public.update_quest_progress_for_answer(uuid, boolean, integer)
FROM service_role;

ALTER FUNCTION public.update_quest_progress_for_answer(uuid, boolean, integer)
SET search_path = public, pg_temp;

-- ── update_weekly_quest_progress_for_answer ──────────────────────────────────
REVOKE EXECUTE
ON FUNCTION public.update_weekly_quest_progress_for_answer(uuid, boolean, integer)
FROM PUBLIC;

REVOKE EXECUTE
ON FUNCTION public.update_weekly_quest_progress_for_answer(uuid, boolean, integer)
FROM anon;

REVOKE EXECUTE
ON FUNCTION public.update_weekly_quest_progress_for_answer(uuid, boolean, integer)
FROM authenticated;

REVOKE EXECUTE
ON FUNCTION public.update_weekly_quest_progress_for_answer(uuid, boolean, integer)
FROM service_role;

ALTER FUNCTION public.update_weekly_quest_progress_for_answer(uuid, boolean, integer)
SET search_path = public, pg_temp;

-- ── update_streak ────────────────────────────────────────────────────────────
REVOKE EXECUTE
ON FUNCTION public.update_streak(uuid)
FROM PUBLIC;

REVOKE EXECUTE
ON FUNCTION public.update_streak(uuid)
FROM anon;

REVOKE EXECUTE
ON FUNCTION public.update_streak(uuid)
FROM authenticated;

REVOKE EXECUTE
ON FUNCTION public.update_streak(uuid)
FROM service_role;

-- search_path: today `public` only. For a SECURITY DEFINER function `pg_temp` belongs last, so a
-- temporary object can never be resolved ahead of the real one. A property change, not a body
-- change: `public` keeps every unqualified reference resolving exactly as now.
ALTER FUNCTION public.update_streak(uuid)
SET search_path = public, pg_temp;
