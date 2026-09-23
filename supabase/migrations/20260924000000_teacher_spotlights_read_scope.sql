-- Scope SELECT on teacher_spotlights to the people the row is actually about.
--
-- THE DEFECT
-- The only policy on this table was:
--
--     CREATE POLICY "teacher_spotlights_select"
--       ON public.teacher_spotlights FOR SELECT TO authenticated USING (true);
--
-- USING (true) is not a predicate at all: every authenticated user could read every row of every
-- teacher's recognition of every pupil, across every classroom. The rows carry a teacher-written
-- free-text `message` about a named pupil, so this is teacher commentary on children readable by
-- anyone with any account.
--
-- Measured read-only on production before this change, in rolled-back transactions:
--   a pupil who has no spotlight of their own          saw all 4 rows, 0 of them about them
--   the teacher who authored all 4                     saw 4, all their own
--   the OTHER teacher, who authored none               saw all 4, all about pupils not theirs
--   super_admin                                        saw all 4
--   anon                                               saw 0 (the policy is TO authenticated)
--
-- WHY USING (true) WAS NEVER THE ACCESS PATH
-- The original migration 20260519000400_social.sql says so itself:
--
--     -- Any authenticated user can read spotlights (students see their own via RPC).
--     -- All writes go through SECURITY DEFINER RPCs only.
--
-- Every documented consumer is SECURITY DEFINER and therefore bypasses RLS entirely:
--   get_my_spotlight()          pupil reads their own          (hub.html)
--   get_classroom_leaderboard() classroom-scoped; joins spotlights ON ts.teacher_id = the
--                               classroom's own teacher, so classmates see each other's
--                               spotlight only within their own class   (leaderboard.html)
--   get_my_students()           teacher roster with spotlight status     (js/teacher.js)
--   set_spotlight()             teacher writes; refuses unless the pupil is in their class
--   remove_spotlight()          teacher deletes only teacher_id = auth.uid()
--
-- No client and no test reads this table directly — verified across the whole tree. The broad
-- policy therefore sat on no legitimate path at all, and narrowing it changes no product
-- behaviour. What follows is defence in depth: it makes the obvious future direct query correct
-- instead of silently empty, so nobody is tempted to re-broaden the policy to fix it.
--
-- THE DATA MODEL, which makes the predicates row-anchored
-- PRIMARY KEY (teacher_id, student_id): one spotlight per teacher per pupil. teacher_id is the
-- author, student_id is the pupil it is about. Because set_spotlight() refuses any pupil outside
-- the author's class, "rows the teacher authored" and "rows about the teacher's own pupils" are
-- the same set by construction, so the simpler teacher_id predicate is also the correct one, and
-- it needs no join.
--
-- NO RECURSION and NO NEW FUNCTION. The pupil and teacher predicates read only the row's own
-- columns. No SECURITY DEFINER helper is introduced.
--
-- SUPER_ADMIN, STATED PLAINLY. The third policy below is a CALLER-ONLY predicate — structurally
-- the same shape as the defect this migration removes. It is here deliberately, on owner
-- instruction to preserve super_admin's existing visibility, and it is defensible only because
-- super_admin is the operations role for which the role IS the authorisation: there is no
-- ownership column that could anchor it to a row. It is the one predicate in this file that does
-- not reference the row, and it should be removed if that visibility is ever found unnecessary —
-- no code consumes it today.
--
-- It reads public.profiles, which couples it to that table's RLS. profiles' SELECT policy today
-- is "(id = auth.uid()) OR (role = 'student')", and the narrowing planned for profiles keeps an
-- own-row read, so the caller can always read their own role either way.
--
-- WHAT THIS MIGRATION DOES NOT DO
-- No INSERT, UPDATE or DELETE policy is added, removed or altered — this table has none, and all
-- writes go through the SECURITY DEFINER RPCs. No grants, no data changes, no table, column,
-- index, view, function or RPC changes, and no other table is touched.
--
-- Re-runnable: each policy is dropped IF EXISTS before being created.

-- ── The blanket read: removed ────────────────────────────────────────────────
DROP POLICY IF EXISTS "teacher_spotlights_select" ON public.teacher_spotlights;

DROP POLICY IF EXISTS "students read own spotlight" ON public.teacher_spotlights;
DROP POLICY IF EXISTS "teachers read spotlights they authored" ON public.teacher_spotlights;
DROP POLICY IF EXISTS "super_admins read all spotlights" ON public.teacher_spotlights;

-- ── A pupil may read the spotlight that is about them ────────────────────────
-- (select auth.uid()) rather than a bare call: evaluated once as an InitPlan, not per row.
CREATE POLICY "students read own spotlight"
  ON public.teacher_spotlights
  FOR SELECT
  TO authenticated
  USING (student_id = (select auth.uid()));

-- ── A teacher may read the spotlights they authored ──────────────────────────
CREATE POLICY "teachers read spotlights they authored"
  ON public.teacher_spotlights
  FOR SELECT
  TO authenticated
  USING (teacher_id = (select auth.uid()));

-- ── super_admin keeps the visibility it has today (see the note above) ───────
CREATE POLICY "super_admins read all spotlights"
  ON public.teacher_spotlights
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (select auth.uid())
        AND p.role = 'super_admin'
    )
  );
