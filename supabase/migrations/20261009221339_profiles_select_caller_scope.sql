-- Scope SELECT on public.profiles to the caller.
--
-- WHY THIS IS A SECURITY FIX
-- profiles_select (20260513000000) was USING (id = auth.uid() OR role = 'student'): every signed-in
-- user could read EVERY pupil profile. Measured live 2026-10-09: a pupil saw 43 other pupils; a
-- teacher with 1 pupil saw 44 pupils, 43 of them another teacher's; a super_admin saw all 44.
-- Exposed columns include teacher_id, selected_grade, bands, active_domains, must_reset_password and
-- avatar data. The OR role = 'student' branch existed for the teacher_student_overview view and
-- PostgREST joins from question_instances to profiles; both are gone (the view became the
-- get_student_overview RPC, the join was removed in teacher tranche 1).
--
-- THE CONTRACT (derived from the runtime code on origin/main f929faa)
--   * Everyone reads their OWN row: login.js, app.js, hub/avatar/collection/themes pages,
--     reset-password.js, admin.js, teacher.js and student-detail.js role gates, get-next-question.
--   * A teacher also reads their OWN pupils (teacher_id = caller, role = 'student'):
--     teacher.js (roster ids, a pupil's active_domains), student-detail.js (a pupil's grade, bands,
--     domains), and the "teachers read own students question_instances" policy's EXISTS subquery.
--   * super_admin reads only their own row through this policy; no admin flow reads other profiles
--     directly (admin.js uses Edge Functions and views).
--   * Every other reader is SECURITY DEFINER (get_teacher_visibility, get_student_overview, the
--     leaderboard/quest/spotlight RPCs, auth_profile_role) or an Edge Function on the backend key,
--     and is not affected by RLS. No view reads profiles.
--
-- WHY THIS CANNOT RECURSE
-- The new USING clause has no subquery on profiles. The caller's role comes from the existing
-- public.auth_profile_role() — SECURITY DEFINER, owned by postgres (the table owner; RLS is not
-- forced), already used by profiles_self_update — so reading it does not re-enter this policy.
-- auth.uid() and the helper are wrapped in (SELECT …) so they are evaluated once per statement.
--
-- WHAT THIS MIGRATION DOES NOT DO
-- Only the USING expression of profiles_select changes (ALTER POLICY keeps its name, command and
-- roles). No other policy, no grant, no function, no table, no data. profiles_self_update is
-- untouched.

ALTER POLICY "profiles_select"
ON public.profiles
USING (
  id = (SELECT auth.uid())
  OR (
    role = 'student'
    AND teacher_id = (SELECT auth.uid())
    AND (SELECT public.auth_profile_role()) = 'teacher'
  )
);
