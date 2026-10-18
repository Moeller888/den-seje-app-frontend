-- Analytics views: no anonymous access, no pupil access, no writes through a view.
--
-- WHY THIS IS A SECURITY FIX (read-only audit 2026-10-16)
-- Six views in public are owned by postgres, have no security_invoker, and grant
-- SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES and TRIGGER to anon and authenticated.
-- An owner-rights view checks its base tables as the OWNER, and postgres owns those tables
-- without FORCE ROW LEVEL SECURITY, so the base tables' RLS does not apply through the view:
--   * analytics_question_attempts  student_events (student_id, mastery, response time) for EVERY
--                                  pupil; auto-updatable, so anon could also UPDATE, DELETE and
--                                  INSERT student_events rows through it
--   * analytics_student_summary    per-pupil totals and success rate, every pupil
--   * attempt_stats                per-pupil attempts and XP from question_attempt_audit, a table
--                                  that itself grants nothing to anon/authenticated
--   * question_performance         per-question attempt and XP statistics
--   * question_diagnostics         question text plus success rates
--   * ww2_taxonomy_audit           auto-updatable over public.questions: anon could UPDATE or
--                                  DELETE those questions, and a DELETE cascades to
--                                  question_instances (pupil history)
-- Not exercised in production; proven offline in
-- tests/unit/analytics-views-lockdown-migration-run.test.mjs.
--
-- WHO NEEDS WHAT (repository and database scan, origin/main f6ed33e)
--   * attempt_stats, question_performance: js/admin.js, the super_admin page, reads them with the
--     signed-in (authenticated) client. Nothing else reads them.
--   * the other four: no reader in the frontend, Edge Functions, SQL functions or other views,
--     apart from analytics_student_summary reading analytics_question_attempts (owner context,
--     unaffected).
--
-- WHAT THIS MIGRATION DOES
--   1. Revokes every privilege on the four unused views from PUBLIC, anon and authenticated.
--   2. Revokes every privilege on attempt_stats and question_performance from PUBLIC and anon, and
--      every privilege except SELECT from authenticated.
--   3. Re-creates attempt_stats and question_performance with their EXACT live definitions plus one
--      row predicate: rows are visible to the server roles (postgres, service_role) and to a caller
--      whose profile role is super_admin (public.auth_profile_role(), SECURITY DEFINER, the helper
--      the profiles policy already uses). Anyone else who still reaches the view sees zero rows.
--      CREATE OR REPLACE keeps the owner, the column list and the remaining grants.
-- security_invoker was considered and rejected: question_attempt_audit grants nothing to
-- authenticated, so an invoker view would deny the super_admin page as well, and for the four
-- unused views a revoke is stricter than inheriting the base tables' RLS.
--
-- WHAT IT DOES NOT DO
-- No table, policy, function or data change. service_role keeps its grants on every view. No change
-- to XP, mastery, grading, question_instances or questions.
--
-- ROLLBACK (separate owner authorisation; exactly the opposite change):
--
--   GRANT ALL ON public.analytics_question_attempts, public.analytics_student_summary,
--     public.question_diagnostics, public.ww2_taxonomy_audit, public.attempt_stats,
--     public.question_performance TO anon, authenticated;
--   then re-run the two CREATE OR REPLACE VIEW statements below WITHOUT the
--   "WHERE (CURRENT_USER = ANY ...)" predicate (and, for question_performance, keep its JOIN).
--
-- Apply ONLY via apply_migration with separate owner authorisation (D-110). Never `supabase db push`.

REVOKE ALL ON public.analytics_question_attempts, public.analytics_student_summary,
  public.question_diagnostics, public.ww2_taxonomy_audit FROM PUBLIC, anon, authenticated;

REVOKE ALL ON public.attempt_stats, public.question_performance FROM PUBLIC, anon;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.attempt_stats, public.question_performance FROM authenticated;

CREATE OR REPLACE VIEW public.attempt_stats AS
 SELECT student_id,
    count(*) AS total_attempts,
    count(*) FILTER (WHERE ((is_correct = true) AND (already_processed = false))) AS correct_attempts,
    count(*) FILTER (WHERE ((is_correct = false) AND (already_processed = false))) AS incorrect_attempts,
    count(*) FILTER (WHERE (already_processed = true)) AS retry_attempts,
    sum(xp_awarded) AS total_xp_awarded,
    max(created_at) AS last_attempt_at
   FROM question_attempt_audit
  WHERE ((CURRENT_USER = ANY (ARRAY['postgres'::name, 'service_role'::name])) OR (public.auth_profile_role() = 'super_admin'::text))
  GROUP BY student_id;

CREATE OR REPLACE VIEW public.question_performance AS
 SELECT qi.question_id,
    count(*) FILTER (WHERE (a.already_processed = false)) AS total_attempts,
    count(*) FILTER (WHERE ((a.is_correct = true) AND (a.already_processed = false))) AS correct_attempts,
    count(*) FILTER (WHERE ((a.is_correct = false) AND (a.already_processed = false))) AS incorrect_attempts,
    count(*) FILTER (WHERE (a.already_processed = true)) AS retry_attempts,
    round(((100.0 * (count(*) FILTER (WHERE ((a.is_correct = true) AND (a.already_processed = false))))::numeric) / (NULLIF(count(*) FILTER (WHERE (a.already_processed = false)), 0))::numeric), 2) AS success_rate_percent,
    sum(a.xp_awarded) AS total_xp_generated,
        CASE
            WHEN ((count(*) FILTER (WHERE (a.already_processed = false)) >= 10) AND (((100.0 * (count(*) FILTER (WHERE ((a.is_correct = true) AND (a.already_processed = false))))::numeric) / (NULLIF(count(*) FILTER (WHERE (a.already_processed = false)), 0))::numeric) < (40)::numeric)) THEN 'problem'::text
            WHEN ((count(*) FILTER (WHERE (a.already_processed = false)) >= 5) AND (((100.0 * (count(*) FILTER (WHERE ((a.is_correct = true) AND (a.already_processed = false))))::numeric) / (NULLIF(count(*) FILTER (WHERE (a.already_processed = false)), 0))::numeric) < (60)::numeric)) THEN 'warning'::text
            ELSE 'healthy'::text
        END AS health_status
   FROM (question_attempt_audit a
     JOIN question_instances qi ON ((qi.id = a.question_instance_id)))
  WHERE ((CURRENT_USER = ANY (ARRAY['postgres'::name, 'service_role'::name])) OR (public.auth_profile_role() = 'super_admin'::text))
  GROUP BY qi.question_id;
