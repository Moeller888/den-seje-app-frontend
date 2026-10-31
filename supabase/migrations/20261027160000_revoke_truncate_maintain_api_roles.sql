-- TRUNCATE and MAINTAIN off the API roles (D-237).
--
-- Before (read 2026-10-27): Supabase's default ACLs for the owner postgres gave anon and authenticated
-- `arwdDxtm` on every new table in public. 30 tables therefore grant TRUNCATE to authenticated (29 of
-- them to anon too — avatar_generation_jobs lost anon's grants in D-229), and the same 30 plus two
-- views (attempt_stats, question_performance) grant MAINTAIN (VACUUM, ANALYZE, REINDEX, CLUSTER,
-- REFRESH, LOCK TABLE) to authenticated.
--
-- TRUNCATE bypasses RLS. Neither privilege is reachable today: PostgREST issues no TRUNCATE or
-- maintenance command, no public function runs dynamic SQL, and pg_graphql is not installed. This is
-- defence in depth — a future SECURITY INVOKER function with dynamic SQL, or a new API surface, must
-- not inherit them. No client, Edge Function, RPC or cron job needs either privilege.
--
-- WHAT CHANGES
--   TRUNCATE and MAINTAIN are revoked from anon and authenticated on exactly the relations listed.
--   Revoking a privilege a role does not hold is a no-op, so the file is harmless to re-run.
--
-- Not changed: SELECT/INSERT/UPDATE/DELETE/REFERENCES/TRIGGER (RLS still governs those), service_role,
-- the owner, policies, functions, default ACLs (separate change) and rows.
-- Apply ONLY via apply_migration with separate owner authorisation (docs/migration-workflow-policy.md
-- §3, D-110). Never `supabase db push`.

REVOKE TRUNCATE, MAINTAIN ON TABLE
  public.achievements,
  public.avatar_asset_review_queue,
  public.avatar_asset_validation_runs,
  public.avatar_assets,
  public.avatar_generation_events,
  public.avatar_generation_jobs,
  public.avatar_ingestion_artifacts,
  public.avatar_ingestion_events,
  public.avatar_ingestion_jobs,
  public.daily_login_rewards,
  public.daily_quests,
  public.password_help_requests,
  public.profiles,
  public.question_instances,
  public.questions,
  public.shop_items,
  public.streak_milestones,
  public.student_events,
  public.student_progress,
  public.student_quest_progress,
  public.student_weekly_quest_progress,
  public.teacher_password_resets,
  public.teacher_spotlights,
  public.themes,
  public.titles,
  public.user_achievements,
  public.user_items,
  public.user_themes,
  public.user_titles,
  public.weekly_quests
  FROM anon, authenticated;

REVOKE MAINTAIN ON TABLE
  public.attempt_stats,
  public.question_performance
  FROM anon, authenticated;
