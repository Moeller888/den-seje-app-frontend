-- Scope teacher SELECT on question_instances to the teacher's own students.
--
-- THE DEFECT
-- The policy "Teachers can read question_instances" had this USING expression:
--
--     EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'teacher')
--
-- It never references the row being read. It is a predicate about the CALLER, not about the
-- ROW, so for any teacher it evaluates to TRUE for every row in the table — every student's
-- answer text, teacher feedback and score, across every class and every colleague's pupils.
--
-- Measured on production before this change, a teacher who owns no instances at all could read
-- 1807 rows covering 20 students they do not teach; 1764 carried answer text and 57 carried
-- feedback and a score. This is a read-side exposure of pupil work in a school product, and it
-- is separate from the write-side gap that was closed in review-answer.
--
-- WHY A ROW PREDICATE IS THE RIGHT FIX
-- The canonical teacher–pupil relation is profiles.teacher_id. question_instances carries
-- student_id and no teacher column, so the policy joins through profiles by primary key. Both
-- sides are index-supported: profiles.id is the primary key, and question_instances.student_id
-- leads four separate indexes.
--
-- NO RECURSION. This policy reads profiles; profiles' own policies read only auth.uid() and never
-- reference question_instances, so there is no policy cycle.
--
-- A NOTE ON COUPLING, because it is not obvious. Policy expressions that query another table are
-- themselves subject to that table's RLS. profiles' SELECT policy is currently
-- "(id = auth.uid()) OR (role = 'student')", so a teacher can read the pupil row this predicate
-- needs. If profiles' policy is later narrowed — and it is broad enough to deserve its own
-- review — this policy must gain a companion allowing a teacher to read their own pupils'
-- profile rows, or teachers will silently stop seeing their pupils' work. Deliberately not
-- solved here with a SECURITY DEFINER helper: that would trade a visible dependency for a
-- hidden privilege escalation surface.
--
-- SUPER_ADMIN IS NOT GRANTED ANYTHING NEW. The old policy required role = 'teacher', so
-- super_admin has no read access to this table today and gains none here. Adding breadth would
-- invent a contract rather than preserve one. No super_admin surface reads question_instances:
-- verified across js/admin.js and admin.html.
--
-- WHAT THIS MIGRATION DOES NOT DO
-- No INSERT, UPDATE or DELETE policy is added, removed or altered, so write permissions are
-- unchanged. The EXECUTE lockdown on both public.review_answer overloads is untouched. No table,
-- column, index, RPC or Edge Function changes.
--
-- COMPATIBILITY. The teacher surfaces already scope every query to their own pupils in the
-- client: teacher.js resolves profiles.teacher_id first and then filters instances with
-- .in(student_id, …), and student-detail.js validates the pupil with .eq("teacher_id", …)
-- before reading. This migration makes the database enforce what those callers already intend,
-- so no legitimate result changes. Functions that read this table are SECURITY DEFINER and
-- bypass RLS, so they are unaffected.
--
-- Re-runnable: each policy is dropped IF EXISTS before being created, so applying this more than
-- once converges on the same state.

-- ── The broad teacher policy: replaced by a row-scoped one ───────────────────
DROP POLICY IF EXISTS "Teachers can read question_instances" ON public.question_instances;

-- ── Two equivalent student policies, one of them untargeted: consolidated ────
-- Both had the same USING expression. The first was untargeted, so it was evaluated for anon as
-- well; anon got nothing only because auth.uid() is NULL there. Relying on that is incidental
-- rather than intentional, so the replacement names its role explicitly.
DROP POLICY IF EXISTS "Students can view own instances" ON public.question_instances;
DROP POLICY IF EXISTS "students can read their own instances" ON public.question_instances;

-- ── Pupils read their own work ───────────────────────────────────────────────
-- (select auth.uid()) rather than a bare call: the planner evaluates it once as an InitPlan
-- instead of per row.
CREATE POLICY "students read own question_instances"
  ON public.question_instances
  FOR SELECT
  TO authenticated
  USING (student_id = (select auth.uid()));

-- ── Teachers read the work of pupils that are theirs ─────────────────────────
CREATE POLICY "teachers read own students question_instances"
  ON public.question_instances
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles s
      WHERE s.id = question_instances.student_id
        AND s.teacher_id = (select auth.uid())
        AND s.role = 'student'
    )
  );
