-- EXECUTE scope for public.recover_stuck_job_atomic (D-234).
--
-- Before: the function had EXECUTE for PUBLIC, anon, authenticated and service_role. It is SECURITY
-- INVOKER, so RLS already stopped anon and authenticated from changing a job (only service_role has a
-- write policy on avatar_generation_jobs) — but neither role has any reason to call it.
--
-- WHO LEGITIMATELY CALLS IT
--   the avatar-generation Edge Function (database.ts recoverStuckJob, from index.ts and worker.ts) —
--     always through getServiceClient(), i.e. service_role
--   public.sweep_stale_generation_jobs() (SECURITY DEFINER, owner postgres), run by pg_cron as postgres —
--     the owner keeps EXECUTE implicitly
--
-- WHAT CHANGES
--   EXECUTE is revoked from PUBLIC, anon and authenticated. service_role keeps its explicit grant.
--
-- Not changed: the body (md5 15cc4408…) and its search_path = public (set by D-227; the function is
-- SECURITY INVOKER, so its search_path runs with the caller's own rights and gives no escalation), the
-- sweeper, cron, tables, policies and rows. Re-running the file is harmless.
-- Apply ONLY via apply_migration with separate owner authorisation (docs/migration-workflow-policy.md
-- §3, D-110). Never `supabase db push`.

REVOKE ALL ON FUNCTION public.recover_stuck_job_atomic(uuid, integer, timestamptz, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
