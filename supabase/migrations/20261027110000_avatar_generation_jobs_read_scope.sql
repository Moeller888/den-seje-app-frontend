-- Read scope for public.avatar_generation_jobs (D-229).
--
-- Before: the RLS policy "debug read access" (FOR SELECT TO PUBLIC USING (true)) together with the
-- table's SELECT grant to anon let anyone holding the public publishable key read every job through the
-- Data API — prompts, storage paths, provider job ids and failure details (verified 2026-10-27: an
-- anonymous count-only request returned all rows). The rows hold no pupil data (no e-mail addresses or
-- user ids), but they are internal pipeline data with no reason to be public.
--
-- WHO LEGITIMATELY READS THE TABLE
--   admin.html (js/admin.js loadGenerationJobs) — a signed-in super_admin, as `authenticated`
--   the avatar-generation Edge Function and tools/avatar-batch — service_role (policy
--     service_role_full_access, unchanged)
--   pg_cron's sweep_stale_generation_jobs — the owner postgres (bypasses RLS, unchanged)
--
-- WHAT CHANGES
--   1. "debug read access" is dropped.
--   2. A SELECT policy for `authenticated` admits only super_admin, through the existing helper
--      public.auth_profile_role() (SECURITY DEFINER), the same check the analytics views use.
--   3. anon loses every table privilege on avatar_generation_jobs (it has no reader).
--
-- Not changed: service_role_full_access, the events table, triggers, functions, rows and
-- authenticated's table grants (writes stay blocked by RLS, as before). Re-running the file is harmless.
-- Apply ONLY via apply_migration with separate owner authorisation (docs/migration-workflow-policy.md
-- §3, D-110). Never `supabase db push`.

DROP POLICY IF EXISTS "debug read access" ON public.avatar_generation_jobs;

DROP POLICY IF EXISTS super_admin_read ON public.avatar_generation_jobs;
CREATE POLICY super_admin_read ON public.avatar_generation_jobs
  FOR SELECT TO authenticated
  USING ((SELECT public.auth_profile_role()) = 'super_admin');

REVOKE ALL ON TABLE public.avatar_generation_jobs FROM anon;
