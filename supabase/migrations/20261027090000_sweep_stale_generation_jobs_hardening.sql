-- Hardening of public.sweep_stale_generation_jobs() (D-227).
--
-- Before: SECURITY DEFINER (owner postgres) without a pinned search_path, and EXECUTE for PUBLIC, anon,
-- authenticated and service_role — so any API caller, also without a login, could run the sweeper as
-- the table owner. The sweeper has no caller of its own: the only one is pg_cron job
-- 'sweep-stale-generation-jobs' (every 5 minutes, command `SELECT public.sweep_stale_generation_jobs()`),
-- which runs as postgres — the function's owner. No Edge Function and no page calls it.
--
-- WHAT CHANGES
--   1. sweep_stale_generation_jobs: search_path = ''. Its body is NOT replaced (ALTER, not CREATE OR
--      REPLACE): every relation and function in it is already schema-qualified (public.…), and now(),
--      INTERVAL and jsonb_build_object live in pg_catalog, which is always searched. The 15-minute
--      threshold and all recovery logic stay byte-identical.
--   2. recover_stuck_job_atomic: search_path = public. Required by step 1: it is SECURITY INVOKER with
--      no search_path of its own and writes the unqualified `avatar_generation_jobs`, so called from a
--      function with search_path '' it would fail ("relation does not exist") and the cron job would
--      stop recovering jobs. Its body and EXECUTE grants are unchanged; the avatar-generation Edge
--      Function keeps calling it as before (it resolves the same table either way).
--   3. EXECUTE on the sweeper is revoked from PUBLIC, anon, authenticated and service_role. The owner
--      postgres keeps it by ownership, which is what pg_cron uses. postgres in Supabase is not a
--      superuser; it owns the function and both tables and has BYPASSRLS.
--
-- Not changed: the cron schedule, the job and event tables, their RLS, grants and triggers, and every
-- other function. Re-running the file is harmless (ALTER … SET and REVOKE are idempotent).
-- Apply ONLY via apply_migration with separate owner authorisation (docs/migration-workflow-policy.md
-- §3, D-110). Never `supabase db push`.

ALTER FUNCTION public.sweep_stale_generation_jobs() SET search_path = '';

ALTER FUNCTION public.recover_stuck_job_atomic(uuid, integer, timestamptz, timestamptz, timestamptz)
  SET search_path = public;

REVOKE ALL ON FUNCTION public.sweep_stale_generation_jobs() FROM PUBLIC, anon, authenticated, service_role;
