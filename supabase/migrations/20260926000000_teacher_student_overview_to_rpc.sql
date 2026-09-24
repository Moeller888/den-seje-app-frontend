-- Replace the teacher_student_overview view with a narrow, authorising RPC.
--
-- THE DEFECT
-- public.teacher_student_overview was a VIEW owned by postgres with no security_invoker, so it
-- ran with the owner's privileges and bypassed RLS on all three of its sources — public.profiles,
-- public.student_progress AND auth.users. Its body carried no teacher predicate at all:
--
--     SELECT p.id, p.teacher_id, u.email, COALESCE(sp.xp,0), COALESCE(sp.level,1),
--            COALESCE(sp.mastery_level,1), COALESCE(sp.total_correct_answers,0)
--     FROM profiles p JOIN auth.users u ON u.id = p.id
--       LEFT JOIN student_progress sp ON sp.student_id = p.id
--     WHERE p.role = 'student';
--
-- SELECT was granted to anon, authenticated, service_role and postgres, and the view sits in the
-- PostgREST-exposed public schema.
--
-- Measured read-only on production before this change, in rolled-back transactions:
--   anon                          saw all 28 pupils, all 28 with an e-mail address
--   an ordinary pupil             saw 28, of which 27 were other pupils
--   a teacher with ONE pupil      saw 28, of which 27 belonged to other teachers
--   super_admin / service_role    saw 28
--
-- Unauthenticated read of every pupil's e-mail address in a product for minors. This is a wider
-- exposure than the three RLS defects already closed, all of which required an account.
--
-- Supabase advisor flagged it twice, both ERROR:
--   0002_auth_users_exposed     exposed_to: ["anon"]
--   0010_security_definer_view
--
-- WHY A VIEW CANNOT BE FIXED IN PLACE HERE
-- security_invoker = true was considered and rejected on evidence, not preference:
--   * auth.users has RLS enabled, ZERO policies, and no grant to anon, authenticated or
--     service_role, so an invoker-rights view would fail with "permission denied for table
--     users" for every API role — it breaks the view rather than scoping it.
--   * even setting that aside, profiles' SELECT policy is "(id = auth.uid()) OR (role =
--     'student')" and the view filters WHERE p.role = 'student', so every row would still pass
--     for any authenticated caller. No teacher scoping would result.
--   * student_progress' policies are all "student_id = auth.uid()", so a teacher would get no
--     progress rows — but the LEFT JOIN plus COALESCE would still emit the row with zeroed XP.
--
-- The authorisation has to live in code that can read the caller's role server-side, which is
-- what the RPC below does. This matches the pattern the rest of this codebase already uses
-- (get_my_students, get_my_spotlight, get_classroom_leaderboard, set_spotlight).
--
-- SCOPE OF THE RETURN
-- js/student-detail.js is the only consumer in the entire tree, and it renders exactly three
-- fields from this source: email, xp and level. total_correct_answers is read from
-- student_mastery_status instead, and teacher_id and mastery_level are never used. The RPC
-- therefore returns three columns and no more; anything else would be data handed out without a
-- consumer that needs it.
--
-- AUTHORISATION
-- The caller's role is read server-side from public.profiles using the verified auth.uid(), never
-- from token metadata, which is caller-controlled. A teacher may fetch only a pupil whose
-- profiles.teacher_id equals their own id. super_admin may fetch any pupil, which preserves the
-- read-all access the old view gave it and matches the decision taken for question_instances,
-- teacher_spotlights and student_weekly_quest_progress.
--
-- NO ENUMERATION ORACLE. An unknown p_student_id, a pupil belonging to another teacher, and a
-- target that is not a pupil at all all return zero rows through the same path — the predicate
-- simply does not match. There is no distinct "not found" signal to distinguish them.
--
-- anon returns zero rows rather than raising, and in any case has EXECUTE revoked below, so it
-- cannot reach the function through PostgREST at all.
--
-- HARDENING
-- SECURITY DEFINER is required: the function must read auth.users, which no API role may. That
-- makes search_path pinning essential, and "public, pg_temp" is the project's verified pattern
-- (20260919000000_review_answer_execute_lockdown.sql). It is sufficient here because no API role
-- can create objects in public — verified read-only: has_schema_privilege is false on CREATE for
-- anon, authenticated and PUBLIC. Every table reference below is schema-qualified regardless.
--
-- EXECUTE is revoked from PUBLIC, which is what a new function receives by default, and from anon
-- explicitly. It is granted to authenticated only. service_role is deliberately NOT granted: no
-- Edge Function and no server-side caller uses this data, so there is no documented need, and a
-- grant without a need is the habit this whole series has been removing.
--
-- WHAT THIS MIGRATION DOES NOT DO
-- No RLS policy on any table is added, removed or altered. No table, column or index changes. No
-- data changes. No other view or function is touched. Nothing depends on the dropped view —
-- verified: zero other views reference it, and the only repository consumer is updated in the
-- same commit.

-- ── 1. The authorising replacement ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_student_overview(p_student_id uuid)
RETURNS TABLE (
  email text,
  xp    integer,
  level integer
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
  IF v_role IS NULL OR v_role NOT IN ('teacher', 'super_admin') THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    u.email::text            AS email,
    COALESCE(sp.xp, 0)       AS xp,
    COALESCE(sp.level, 1)    AS level
  FROM public.profiles s
    JOIN auth.users u
      ON u.id = s.id
    LEFT JOIN public.student_progress sp
      ON sp.student_id = s.id
  WHERE s.id = p_student_id
    AND s.role = 'student'
    AND (
      v_role = 'super_admin'
      OR s.teacher_id = v_uid
    );
END;
$$;

-- ── 2. EXECUTE: closed by default, opened only where a consumer exists ───────
REVOKE EXECUTE ON FUNCTION public.get_student_overview(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_student_overview(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_student_overview(uuid) TO authenticated;

-- ── 3. The view is removed, not merely restricted ────────────────────────────
-- Its grants to anon and authenticated were the exposure, and the object has no remaining
-- purpose once the RPC exists. No other view or function depends on it.
DROP VIEW IF EXISTS public.teacher_student_overview;
