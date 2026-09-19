-- Lock down direct EXECUTE on public.review_answer.
--
-- WHY THIS IS A SECURITY FIX, NOT HARDENING
-- Both overloads are SECURITY DEFINER, owned by postgres, and live in `public` — the schema
-- PostgREST exposes. EXECUTE was held by PUBLIC, and additionally granted to anon and
-- authenticated. Supabase's own database linter reports the consequence directly:
--
--   "Function public.review_answer(...) can be executed by the anon role as a SECURITY DEFINER
--    function via /rest/v1/rpc/review_answer"
--
-- Neither overload checks who is calling. Neither reads `profiles`, neither compares a role, and
-- neither raises an authorisation error. The 4-argument overload takes `p_teacher_id` as a
-- PARAMETER and records it — a value the caller supplies, which is an assertion of identity, not
-- proof of it.
--
-- The only protection was a role check inside the review-answer Edge Function. That check guards
-- the function; it does not guard the database. A signed-in student could reach
-- /rest/v1/rpc/review_answer directly with the project's public API key and their own JWT — the
-- same transport the app already uses for purchase_item, process_text_answer and
-- process_question_attempt — and set teacher_score on any question instance, bypassing the Edge
-- Function entirely.
--
-- WHY service_role IS THE ONLY DIRECT CALLER
-- review-answer/index.ts builds its privileged client with the service key and calls the RPC
-- through it. No browser code and no other Edge Function calls review_answer: verified by
-- searching js/, app.js, the HTML pages, tests/ and supabase/functions/. Revoking EXECUTE from
-- anon and authenticated therefore removes the direct path without touching the legitimate one.
--
-- WHAT THIS MIGRATION DOES NOT DO
-- The grading logic, the XP award and the scoring rules are untouched. Moving authorisation into
-- the function body using auth.uid() would require the Edge Function to call with the caller's
-- JWT instead of the service key — a different architecture, and a separate decision.

-- Both overloads are named explicitly. A name-only REVOKE would be ambiguous while two signatures
-- exist, and would silently miss one if a third were added.
--
-- Re-runnable: REVOKE on an already-revoked privilege and GRANT of an already-held privilege are
-- both no-ops in PostgreSQL, so this migration is safe to apply more than once.

-- ── 4-argument overload: the one the Edge Function calls ─────────────────────
REVOKE EXECUTE ON FUNCTION public.review_answer(uuid, integer, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.review_answer(uuid, integer, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.review_answer(uuid, integer, text, uuid) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.review_answer(uuid, integer, text, uuid) TO service_role;

-- ── 3-argument overload: reachable on the same endpoint, so it is closed too ──
-- PostgREST resolves an RPC by the argument names in the request body, so leaving this one open
-- would leave /rest/v1/rpc/review_answer callable with a three-field payload.
REVOKE EXECUTE ON FUNCTION public.review_answer(uuid, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.review_answer(uuid, integer, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.review_answer(uuid, integer, text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.review_answer(uuid, integer, text) TO service_role;

-- ── search_path ──────────────────────────────────────────────────────────────
-- Both overloads are SECURITY DEFINER with no search_path set (pg_proc.proconfig IS NULL), which
-- the linter flags as `function_search_path_mutable`. A SECURITY DEFINER function without a fixed
-- search_path resolves unqualified names against whatever the caller's search_path happens to be,
-- so a caller who can create objects in an earlier schema can shadow a table or operator and have
-- it run with the definer's privileges.
--
-- Pinning the path is a property change, not a body change: it does not alter a single statement
-- of the grading logic. `public` keeps the existing unqualified references working and `pg_temp`
-- is listed last, which is the documented way to stop a temporary object from being resolved
-- first.
ALTER FUNCTION public.review_answer(uuid, integer, text, uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.review_answer(uuid, integer, text)       SET search_path = public, pg_temp;
