-- Fold student_mastery_status into get_student_overview and remove the view.
--
-- THE DEFECT
-- public.student_mastery_status was a VIEW owned by postgres with no security_invoker, so it ran
-- with the owner's privileges and bypassed RLS on its only source, public.student_progress:
--
--     SELECT student_id, mastery_level, mastery_balance, correct_answers,
--            total_correct_answers, total_attempts,
--            CASE … END AS distance_up, CASE … END AS distance_down,
--            CASE WHEN total_attempts > 0
--                 THEN round(total_correct_answers::numeric / total_attempts::numeric * 100, 1)
--                 ELSE 0 END AS correct_ratio
--     FROM student_progress sp;
--
-- There is no teacher predicate anywhere in it, and SELECT was granted to anon, authenticated and
-- service_role, in the PostgREST-exposed public schema.
--
-- Measured read-only on production before this change, in rolled-back transactions. The contrast
-- with the base table is what proves the RLS bypass rather than merely suggesting it:
--
--                              rows via the VIEW    rows via student_progress
--   anon                             28                      —
--   an ordinary pupil                28                      1
--   a teacher with ONE pupil         28                      0
--   super_admin                      28                      1
--
-- 28 rows, 28 distinct pupils, every row carrying mastery level, accuracy and attempt counts.
-- Unlike teacher_student_overview this view touches no auth.users and carries no e-mail, name or
-- answer text, so the exposure is narrower — but it is still every pupil's progress statistics
-- readable without signing in.
--
-- Supabase advisor: 0010_security_definer_view (ERROR). NOT 0002_auth_users_exposed, since the
-- view never reads auth.users.
--
-- WHY NOT security_invoker, AND WHY NOT A ROW-SCOPED VIEW
-- security_invoker = true was measured, not assumed. It would not fail on privileges here the way
-- it would for teacher_student_overview — there is no auth.users join, and anon and authenticated
-- both hold a table grant on student_progress. It fails on rows instead: student_progress' three
-- SELECT policies are all "student_id = auth.uid()", so a teacher sees ZERO rows through the base
-- table, as the table above shows. An invoker-rights view would therefore close the exposure by
-- breaking the only legitimate consumer. Rescuing it would mean adding a teacher policy to
-- student_progress, which is a wider change to a table other code also reads.
--
-- A row-scoped SECURITY DEFINER view would work, and would need no product change, but it keeps
-- the advisor finding and keeps a nine-column public surface where only three columns have a
-- consumer. Folding the data into the existing authorising RPC removes both.
--
-- WHAT js/student-detail.js ACTUALLY USES
-- It is the only consumer of the view in the entire tree, and it renders exactly three of the
-- nine columns: correct_ratio, total_correct_answers and total_attempts. mastery_level,
-- mastery_balance, correct_answers, distance_up and distance_down have no consumer and are not
-- carried over. student_id was only ever the filter.
--
-- The same page already calls get_student_overview(uuid) for email, xp and level — the same
-- authorisation decision, against the same pupil, one statement earlier. Folding the three
-- mastery fields into that call replaces two server round trips and two authorisation surfaces
-- with one.
--
-- WHY DROP AND RECREATE RATHER THAN CREATE OR REPLACE
-- For a RETURNS TABLE function the output columns are part of the return type, and PostgreSQL
-- refuses to change it in place: "cannot change return type of existing function". Adding three
-- columns therefore requires DROP FUNCTION first. Both statements run inside this migration, so
-- there is no window in the database where the function is missing.
--
-- The rollout is compatible in the direction that matters. The frontend deployed today reads
-- row.email, row.xp and row.level and ignores unknown columns, so it keeps working the moment
-- this applies. The reverse order — new frontend before this migration — leaves the three mastery
-- fields undefined and the page renders them as 0 via its existing "?? 0" guards: degraded for a
-- few seconds, not broken, and strictly better than the hard failure the previous migration in
-- this series would have caused. Apply immediately after merge regardless.
--
-- AUTHORISATION IS UNCHANGED
-- The role is still read server-side from public.profiles using the verified auth.uid(), never
-- from token metadata. A teacher may still fetch only a pupil whose profiles.teacher_id equals
-- their own id; super_admin may still fetch any pupil. An unknown p_student_id, another teacher's
-- pupil and a target that is not a pupil all still return zero rows through the same predicate,
-- so there is still no enumeration oracle. anon still returns zero rows and still has EXECUTE
-- revoked.
--
-- search_path stays pinned to the project's verified pattern, which is sufficient because no API
-- role can create objects in public — verified read-only: has_schema_privilege on CREATE is false
-- for anon, authenticated and PUBLIC. Every table reference is schema-qualified regardless.
--
-- EXECUTE is re-established after the DROP: revoked from PUBLIC (a new function's default) and
-- from anon, granted to authenticated. service_role is not granted here; note that Supabase's
-- default privileges on public functions grant it EXECUTE at creation time regardless, which is
-- immaterial because service_role bypasses RLS and can read student_progress directly.
--
-- WHAT THIS MIGRATION DOES NOT DO
-- No RLS policy on any table is added, removed or altered. No table, column or index changes. No
-- data changes. No other view, function or RPC is touched. Nothing depends on the dropped view —
-- verified read-only: zero other views reference it, and the only repository consumer is updated
-- in the same commit.

-- ── 1. The view's three used columns move into the existing authorising RPC ──
DROP FUNCTION IF EXISTS public.get_student_overview(uuid);

CREATE FUNCTION public.get_student_overview(p_student_id uuid)
RETURNS TABLE (
  email                 text,
  xp                    integer,
  level                 integer,
  correct_ratio         numeric,
  total_correct_answers integer,
  total_attempts        integer
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
    u.email::text                           AS email,
    COALESCE(sp.xp, 0)                      AS xp,
    COALESCE(sp.level, 1)                   AS level,
    -- carried over verbatim from student_mastery_status, including the zero-attempt guard
    CASE
      WHEN COALESCE(sp.total_attempts, 0) > 0
        THEN round(
               COALESCE(sp.total_correct_answers, 0)::numeric
               / sp.total_attempts::numeric * 100::numeric, 1)
      ELSE 0::numeric
    END                                     AS correct_ratio,
    COALESCE(sp.total_correct_answers, 0)   AS total_correct_answers,
    COALESCE(sp.total_attempts, 0)          AS total_attempts
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
-- Its grants to anon and authenticated were the exposure, and it has no remaining purpose once
-- its three used columns are served through the RPC. No other view or function depends on it.
DROP VIEW IF EXISTS public.student_mastery_status;
