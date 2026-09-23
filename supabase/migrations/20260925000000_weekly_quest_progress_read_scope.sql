-- Remove the blanket teacher read on student_weekly_quest_progress; keep super_admin.
--
-- THE DEFECT
-- The policy "weekly_progress_select_teacher" had this USING expression:
--
--     EXISTS (SELECT 1 FROM public.profiles
--             WHERE id = auth.uid() AND role IN ('teacher', 'super_admin'))
--
-- It never references the row being read. It is a predicate about the CALLER, not about the ROW,
-- so for any teacher it is TRUE for every row in the table. This is the same defect class already
-- closed on public.question_instances and public.teacher_spotlights.
--
-- Measured read-only on production before this change, in rolled-back transactions:
--   a teacher who has exactly ONE pupil saw all 106 rows, covering 11 pupils and 19 ISO weeks —
--   and all 106 belonged to pupils who are not theirs.
--   a pupil saw only their own 42 rows, 0 belonging to anyone else.
--   anon saw 0.
--
-- The data is gamification progress — a counter plus `completed` and `claimed` booleans. There is
-- no free text, no name and no answer content here, so this is a narrower exposure than the two
-- already closed. It is still every pupil's weekly activity pattern readable by any teacher in
-- the system, which is not something any surface asks for.
--
-- NOTHING USED IT
-- The original migration 20260524000000_weekly_quests.sql creates this policy with no comment and
-- no stated rationale. The complete set of consumers is:
--
--   hub.html:1361      the pupil reads their OWN week:
--                      .eq("student_id", userId).eq("week_key", currentWeekKey)
--   hub.html:2042      claim_weekly_quest_reward()   SECURITY DEFINER, scoped to auth.uid()
--   leaderboard.html   get_weekly_activity()         SECURITY DEFINER, classroom-scoped
--   process_question_attempt / process_text_answer
--                   -> update_weekly_quest_progress_for_answer()  SECURITY DEFINER
--
-- No teacher or admin surface reads this table at all. Every "quest" match in js/teacher.js,
-- js/student-detail.js and js/admin.js is question_instances, questions or question_performance —
-- substring collisions, not quests. So dropping the teacher policy changes no product behaviour.
--
-- WHAT IS KEPT
-- "weekly_progress_select_own" (auth.uid() = student_id) is left exactly as it is: hub.html reads
-- this table directly, and that is the read it depends on. The INSERT and UPDATE policies are not
-- touched either.
--
-- SUPER_ADMIN KEEPS ITS ACCESS, ON OWNER INSTRUCTION
-- The old policy covered teacher AND super_admin, so dropping it outright would remove
-- super_admin's read as a side effect. The replacement below preserves it deliberately.
--
-- It is a CALLER-ONLY predicate — structurally the same shape as the defect being removed — and
-- that is stated here rather than hidden, exactly as in
-- 20260924000000_teacher_spotlights_read_scope.sql. It is defensible for super_admin and for
-- nothing else: super_admin has no ownership relation to a pupil's quest row that a row predicate
-- could be anchored to, so the role IS the authorisation. It must not be used as a precedent for
-- teacher access, which is what this migration removes.
--
-- The role is read server-side from public.profiles, never from token metadata, so a caller
-- cannot assert their own role. That couples this policy to profiles' RLS: profiles' SELECT
-- policy today is "(id = auth.uid()) OR (role = 'student')", and the planned narrowing of
-- profiles deliberately keeps an own-row read, so the caller can always read their own role. If
-- profiles is ever changed so a caller cannot read their own row, this policy stops matching and
-- super_admin silently loses access — it fails closed.
--
-- A NOTE ON ROLE TARGETING, deliberately NOT fixed here.
-- The three surviving policies (select_own, insert_own, update_own) are untargeted, so they are
-- PUBLIC and are evaluated for anon as well; anon gets nothing only because auth.uid() is NULL
-- there. That is incidental rather than intentional, and it is the same weakness tightened on
-- question_instances. Fixing it means recreating three policies, which is a wider change than
-- this one, so it is left as its own scoped round. The policy created below names its role
-- explicitly and does not rely on that accident.
--
-- WHAT THIS MIGRATION DOES NOT DO
-- No INSERT, UPDATE or DELETE policy is added, removed or altered, so write permissions are
-- unchanged. No grants or revokes, no data changes, and no table, column, index, view, function
-- or RPC changes. No SECURITY DEFINER and no helper function. No other table is modified;
-- public.profiles is only READ, inside the predicate.
--
-- Re-runnable: each policy touched is dropped IF EXISTS before being created.

-- ── The blanket teacher read: removed ────────────────────────────────────────
DROP POLICY IF EXISTS "weekly_progress_select_teacher"
  ON public.student_weekly_quest_progress;

-- ── super_admin keeps direct operations access (see the note above) ──────────
DROP POLICY IF EXISTS "super_admins read all weekly quest progress"
  ON public.student_weekly_quest_progress;

CREATE POLICY "super_admins read all weekly quest progress"
  ON public.student_weekly_quest_progress
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
