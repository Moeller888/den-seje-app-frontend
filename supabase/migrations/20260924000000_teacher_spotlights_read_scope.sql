-- Deny direct reads of teacher_spotlights to everyone except super_admin.
--
-- THE DEFECT
-- The table's only policy was:
--
--     CREATE POLICY "teacher_spotlights_select"
--       ON public.teacher_spotlights FOR SELECT TO authenticated USING (true);
--
-- USING (true) is not a predicate. Every authenticated user — including every pupil account —
-- could read every teacher's recognition of every pupil across every classroom, including the
-- teacher-written free-text `message` about a named child.
--
-- Measured read-only on production before this change, in rolled-back transactions:
--   a pupil who has no spotlight of their own          saw all 4 rows, 0 of them about them
--   the teacher who authored all 4                     saw 4, all their own
--   the OTHER teacher, who authored none               saw all 4, all about pupils not theirs
--   super_admin                                        saw all 4
--   anon                                               saw 0 (the policy is TO authenticated)
--
-- WHY NO PUPIL OR TEACHER POLICY REPLACES IT
-- The product never reads this table directly. The original migration 20260519000400_social.sql
-- says so itself — "students see their own via RPC", "all writes go through SECURITY DEFINER
-- RPCs only" — and every documented consumer is SECURITY DEFINER, so it bypasses RLS and enforces
-- its own pupil, classroom and teacher scoping:
--
--   get_my_spotlight()          filters on student_id = auth.uid()          hub.html
--   get_classroom_leaderboard() resolves the caller's classroom and joins
--                               spotlights on that classroom's own teacher  leaderboard.html
--   get_my_students()           teacher roster with spotlight status         js/teacher.js
--   set_spotlight()             requires role 'teacher' AND that the pupil
--                               is in the caller's class; writes teacher_id = auth.uid()
--   remove_spotlight()          deletes only teacher_id = auth.uid()
--
-- No client and no test reads the table directly — verified across the whole tree. Pupils and
-- teachers therefore need no direct SELECT at all, and granting them a narrow one would still be
-- granting an access path the product does not use. Least privilege: they get none. Product
-- behaviour is unchanged, including classmates seeing each other's spotlights on the leaderboard,
-- because that path never went through RLS.
--
-- SUPER_ADMIN IS THE ONE DELIBERATE EXCEPTION
-- The policy below is role-based and caller-based: it does not reference the row. That is the same
-- SHAPE as the defect above, and it is retained here only as an explicit owner decision, for the
-- privileged operations role. It is defensible for super_admin and for nothing else, because
-- super_admin has no ownership relation to any spotlight row that could anchor a predicate — the
-- role IS the authorisation. It must not be used as a precedent for pupil or teacher access.
--
-- The role is read from public.profiles, server-side, never from token metadata, so a caller
-- cannot assert their own role. That couples this policy to profiles' RLS:
--   - profiles' SELECT policy today is "(id = auth.uid()) OR (role = 'student')", so the caller
--     can read their own row and therefore their own role.
--   - The planned narrowing of profiles deliberately KEEPS an own-row read
--     ("id = (select auth.uid())"), and preserves super_admin's access besides.
--   - So this policy still evaluates correctly after that narrowing. If profiles is ever changed
--     so that a caller cannot read their own row, this policy stops matching and super_admin
--     silently loses access — that is the coupling to re-check, and it fails closed.
--
-- WHAT THIS MIGRATION DOES NOT DO
-- No INSERT, UPDATE or DELETE policy is added, removed or altered — this table has none, and all
-- writes go through the SECURITY DEFINER RPCs, which are not touched. No grants or revokes, no
-- data changes, and no table, column, index, view or function changes. No SECURITY DEFINER and no
-- helper function is introduced. No other table is modified; public.profiles is only READ, inside
-- the predicate.
--
-- Re-runnable: every policy this file has ever created is dropped IF EXISTS first, so applying it
-- more than once — or after an earlier draft of it — converges on the same state.

-- ── The blanket read: removed ────────────────────────────────────────────────
DROP POLICY IF EXISTS "teacher_spotlights_select" ON public.teacher_spotlights;

-- ── Pupil and teacher direct reads: removed, and never created here ──────────
-- Named explicitly so that re-applying this migration over an earlier draft that DID create them
-- converges. Nothing in the product reads the table directly, so their absence changes nothing.
DROP POLICY IF EXISTS "students read own spotlight" ON public.teacher_spotlights;
DROP POLICY IF EXISTS "teachers read spotlights they authored" ON public.teacher_spotlights;

-- ── super_admin keeps direct operations access (see the note above) ──────────
DROP POLICY IF EXISTS "super_admins read all spotlights" ON public.teacher_spotlights;

CREATE POLICY "super_admins read all spotlights"
  ON public.teacher_spotlights
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role = 'super_admin'
    )
  );
