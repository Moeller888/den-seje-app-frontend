-- Scope public.get_teacher_visibility to the CALLER, and close its EXECUTE grants.
--
-- THE DEFECT
-- get_teacher_visibility(p_teacher_id uuid) is SECURITY DEFINER, owned by postgres, and returns
-- every pupil whose profiles.teacher_id equals the ARGUMENT — display name (the local part of the
-- pupil's e-mail address, read from auth.users), grade, placement band, current band, attempt
-- count, recent correctness, trend and assigned domains. Nothing in the body compares the argument
-- with the caller. Any caller who knows or guesses a teacher's id can read that teacher's class.
--
-- Measured read-only on production on 2026-10-09 (catalog reads only, no call was made):
--   proacl  {=X/postgres, postgres=X/postgres, anon=X/postgres, authenticated=X/postgres,
--            service_role=X/postgres}
--   so PUBLIC, anon, authenticated and service_role can all EXECUTE it, and anon reaches it
--   through PostgREST with nothing but the publishable key. One signature, (uuid). No other
--   function, view or rule references it. The live body is byte-identical to the one created by
--   20260608065035_display_name_from_email.sql (md5(prosrc) dbbe489e7e3b7e66fe86759a830f711c),
--   which tests/unit/get-teacher-visibility-scope.test.mjs uses as the "before" state.
--
-- THE ONLY CONSUMER
-- js/teacher.js, which passes the signed-in teacher's own id (teacherId = session.user.id after a
-- server-read role check). No Edge Function, no admin page, no test and no other SQL object calls
-- it. super_admin does NOT use it — js/admin.js has no call — and no document records an
-- administrative need, so super_admin gets no exemption here. Extending rights is not this fix.
--
-- THE FIX
--   1. The caller is auth.uid(). Not signed in: zero rows.
--   2. The caller's role is read from public.profiles by that id, never from token metadata.
--      Anything but 'teacher' (including no profile row): zero rows.
--   3. p_teacher_id must BE the caller. Any other value: zero rows. The pupil predicate then uses
--      the verified caller id, not the argument, so the argument can never widen the scope.
--   Zero rows rather than an error, for every refusal: the same pattern as get_student_overview
--   (20260926000000). A refusal that looked different from "this teacher has no pupils" would tell
--   a caller which ids belong to teachers.
--
-- The signature (uuid) and the RETURNS TABLE columns, names, types and order are UNCHANGED, so
-- js/teacher.js needs no change. The computation below the gate is the 20260608065035 body with
-- every relation schema-qualified; it computes the same values.
--
-- HARDENING
-- SECURITY DEFINER stays: the function reads auth.users for the display name, which no API role
-- may read. search_path is pinned to "public, pg_temp" (the project pattern, see
-- 20260926000000_teacher_student_overview_to_rpc.sql), and every relation is schema-qualified
-- regardless.
--
-- EXECUTE is set explicitly rather than left to defaults. CREATE OR REPLACE keeps the existing
-- ACL, so without the statements below the PUBLIC and anon grants would survive the body change.
--   PUBLIC        revoked  (what a function receives by default)
--   anon          revoked  (has no auth.uid(), and must not reach the function at all)
--   service_role  revoked  (no server-side caller exists; under service_role auth.uid() is NULL,
--                           so the function could only ever return zero rows to it anyway)
--   authenticated granted  (the teacher dashboard; the body scopes every call to the caller)
--
-- WHAT THIS MIGRATION DOES NOT DO
-- No RLS policy, table, column, index, view or data change. No other function is touched. No
-- DROP FUNCTION: CREATE OR REPLACE keeps the function's identity, so there is no window in which
-- it does not exist.
--
-- Applying it to production needs its own owner authorisation (D-110). `supabase db push` is
-- forbidden.

-- ── 1. The caller-scoped body ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_teacher_visibility(p_teacher_id uuid)
RETURNS TABLE(
  student_id         uuid,
  display_name       text,
  selected_grade     smallint,
  placement_band     smallint,
  current_band       smallint,
  total_attempts     integer,
  recent_correct_pct integer,
  trend              text,
  active_domains     text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid  uuid := (SELECT auth.uid());
  v_role text;
BEGIN
  -- Not signed in: nothing, and no error that would confirm anything.
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  -- The role comes from the database, keyed on the verified JWT subject.
  SELECT p.role INTO v_role
  FROM public.profiles p
  WHERE p.id = v_uid;

  -- A missing profile is an unknown answer, and an unknown answer is not permission.
  IF v_role IS NULL OR v_role <> 'teacher' THEN
    RETURN;
  END IF;

  -- A teacher may ask only about themselves. Another id is answered exactly like "no pupils".
  IF p_teacher_id IS DISTINCT FROM v_uid THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH
  my_students AS (
    SELECT
      p.id,
      COALESCE(NULLIF(split_part(u.email, '@', 1), ''), 'Elev')::TEXT AS display_name,
      p.selected_grade,
      p.placement_band,
      p.active_domains
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.teacher_id = v_uid
      AND p.role = 'student'
  ),
  ranked AS (
    SELECT
      qi.student_id       AS sid,
      qi.is_correct,
      q.difficulty_band,
      ROW_NUMBER() OVER (
        PARTITION BY qi.student_id
        ORDER BY COALESCE(qi.answered_at, qi.created_at) DESC
      ) AS rn
    FROM public.question_instances qi
    JOIN public.questions q ON q.id = qi.question_id
    WHERE qi.student_id IN (SELECT id FROM my_students)
      AND qi.answered = true
  ),
  agg AS (
    SELECT
      r.sid,
      ROUND(AVG(r.difficulty_band) FILTER (WHERE r.rn <= 10))::SMALLINT AS current_band,
      CASE
        WHEN COUNT(*) FILTER (WHERE r.rn <= 20) = 0 THEN 0
        ELSE ROUND(
          100.0 * COUNT(*) FILTER (WHERE r.rn <= 20 AND r.is_correct = true) /
          NULLIF(COUNT(*) FILTER (WHERE r.rn <= 20), 0)
        )::INTEGER
      END AS recent_correct_pct,
      CASE
        WHEN COUNT(*) FILTER (WHERE r.rn <= 10) < 5 THEN 'stable'
        WHEN COUNT(*) FILTER (WHERE r.rn BETWEEN 11 AND 20) < 5 THEN 'stable'
        WHEN (AVG(r.is_correct::INT) FILTER (WHERE r.rn <= 10) -
              AVG(r.is_correct::INT) FILTER (WHERE r.rn BETWEEN 11 AND 20)) > 0.15 THEN 'improving'
        WHEN (AVG(r.is_correct::INT) FILTER (WHERE r.rn BETWEEN 11 AND 20) -
              AVG(r.is_correct::INT) FILTER (WHERE r.rn <= 10)) > 0.15 THEN 'struggling'
        ELSE 'stable'
      END AS trend
    FROM ranked r
    GROUP BY r.sid
  )
  SELECT
    ms.id,
    ms.display_name,
    ms.selected_grade,
    ms.placement_band,
    COALESCE(ag.current_band, 1::SMALLINT),
    COALESCE(sp.total_attempts, 0),
    COALESCE(ag.recent_correct_pct, 0),
    COALESCE(ag.trend, 'stable'),
    ms.active_domains
  FROM my_students ms
  LEFT JOIN public.student_progress sp ON sp.student_id = ms.id
  LEFT JOIN agg ag ON ag.sid = ms.id
  ORDER BY ms.display_name;
END;
$$;

-- ── 2. EXECUTE: set explicitly, never inherited ──────────────────────────────
REVOKE EXECUTE ON FUNCTION public.get_teacher_visibility(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_teacher_visibility(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_teacher_visibility(uuid) FROM service_role;
GRANT  EXECUTE ON FUNCTION public.get_teacher_visibility(uuid) TO authenticated;
