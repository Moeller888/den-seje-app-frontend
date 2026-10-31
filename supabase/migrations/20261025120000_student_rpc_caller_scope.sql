-- Caller scope for get_concept_states and evaluate_achievements.
--
-- Both are SECURITY DEFINER functions that take a student id. This migration makes each of them decide,
-- inside the function, whether the CALLER may act on that student — the id itself is never treated as
-- an authorisation. The data each function reads or writes, and how, is unchanged.
--
-- ACCESS MODEL
--   API callers (PostgREST logs in as `authenticator` and switches to anon/authenticated/service_role):
--     get_concept_states    — the student themself, the student's teacher (profiles.teacher_id = caller,
--                             role 'student', and the caller's own role is 'teacher' — the same rule
--                             as profiles_select), or a super_admin (profiles.role, which users cannot
--                             change)
--     evaluate_achievements — the student themself only (the app calls it without an argument)
--     everyone else         — 'forbidden'; an unknown and a foreign id get the same answer
--     no auth.uid()         — 'not_authenticated' (anon has no EXECUTE at all)
--   Internal database context (session_user postgres / supabase_admin, no JWT subject): migrations,
--     the SQL editor and pg_cron. Earlier migrations back-fill achievements with
--     PERFORM public.evaluate_achievements(<id>) in a DO block; that keeps working. session_user is the
--     connection's login role and cannot be chosen through the API.
--
-- PRIVILEGES: EXECUTE for authenticated only (revoked from PUBLIC, anon and service_role — no backend
-- calls either function through the API). SECURITY DEFINER stays: students cannot read `questions`
-- and nobody but the owner writes `user_achievements`. search_path = '' with every object qualified.
--
-- The achievement ladder of evaluate_achievements is byte-identical to 20260518000500 (pinned by
-- tests/unit/student-rpc-caller-scope-migration-run.test.mjs); only its identity head changes.
--
-- Re-running the file is harmless (CREATE OR REPLACE + idempotent grants); "applied once" is kept by
-- procedure (docs/migration-workflow-policy.md §3). Apply ONLY via apply_migration with separate owner
-- authorisation (D-110). Never `supabase db push`.

CREATE OR REPLACE FUNCTION public.get_concept_states(p_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result   JSONB;
  v_caller   UUID    := auth.uid();
  v_internal BOOLEAN := v_caller IS NULL AND session_user IN ('postgres', 'supabase_admin');
BEGIN
  IF p_student_id IS NULL THEN
    RAISE EXCEPTION 'invalid_student' USING ERRCODE = '22023';
  END IF;

  IF NOT v_internal THEN
    IF v_caller IS NULL THEN
      RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
    END IF;
    IF v_caller IS DISTINCT FROM p_student_id
       AND NOT EXISTS (
         SELECT 1 FROM public.profiles s
          WHERE s.id = p_student_id AND s.role = 'student' AND s.teacher_id = v_caller
            AND public.auth_profile_role() = 'teacher'
       )
       AND public.auth_profile_role() IS DISTINCT FROM 'super_admin'
    THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT jsonb_object_agg(concept, state) INTO v_result
  FROM (
    SELECT
      concept,
      CASE
        WHEN count(CASE WHEN qi.misconception_signal IS NOT NULL AND qi.was_correct = false THEN 1 END) >= 2
          THEN 'misconception_prone'
        WHEN count(CASE WHEN qi.was_correct = true  THEN 1 END) >= 3
         AND count(CASE WHEN qi.was_correct = false THEN 1 END) = 0
          THEN 'stable'
        WHEN count(CASE WHEN qi.was_correct = true  THEN 1 END) >= 1
         AND count(CASE WHEN qi.was_correct = false THEN 1 END) >= 1
          THEN 'uncertain'
        ELSE 'emerging'
      END AS state
    FROM public.question_instances qi
    JOIN public.questions q ON q.id = qi.question_id
    CROSS JOIN jsonb_array_elements_text(q.metadata -> 'concepts') AS concept
    WHERE qi.student_id   = p_student_id
      AND qi.answered     = true
      AND q.metadata      IS NOT NULL
      AND jsonb_typeof(q.metadata -> 'concepts') = 'array'
    GROUP BY concept
  ) concept_states;

  RETURN COALESCE(v_result, '{}'::JSONB);
END;
$$;

REVOKE ALL ON FUNCTION public.get_concept_states(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_concept_states(uuid) TO authenticated;

-- evaluate_achievements: identity head replaced; the ladder below is unchanged from 20260518000500.
CREATE OR REPLACE FUNCTION public.evaluate_achievements(
  p_student_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller                UUID        := auth.uid();
  v_uid                   UUID;
  v_progress              RECORD;
  v_level                 INTEGER;
  v_theme_count           INTEGER;
  v_legendary_count       INTEGER;
  v_item_count            INTEGER;
  v_legendary_theme_count INTEGER;
  v_profile_created_at    TIMESTAMPTZ;
  v_newly_unlocked        TEXT[]      := ARRAY[]::TEXT[];
  v_rows                  INTEGER;
BEGIN
  -- Caller scope: an API caller acts only for themself; only the internal database context
  -- (migrations / SQL editor / pg_cron: session_user postgres or supabase_admin, no JWT subject) may
  -- name a student, as the achievement back-fills in earlier migrations do.
  IF v_caller IS NULL THEN
    IF session_user IN ('postgres', 'supabase_admin') AND p_student_id IS NOT NULL THEN
      v_uid := p_student_id;
    ELSE
      RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF p_student_id IS NOT NULL AND p_student_id IS DISTINCT FROM v_caller THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
    v_uid := v_caller;
  END IF;

  -- Read student progress (includes hidden-achievement tracking columns).
  SELECT correct_answers, xp, longest_streak, night_correct, best_session_streak
  INTO   v_progress
  FROM   public.student_progress
  WHERE  student_id = v_uid;

  IF NOT FOUND THEN
    RETURN '[]'::JSONB;
  END IF;

  -- Compute level from XP (mirrors JS).
  v_level := public.calculate_level_from_xp(COALESCE(v_progress.xp, 0));

  -- Count explicitly-acquired themes (always_owned themes are not in user_themes).
  SELECT COUNT(*) INTO v_theme_count
  FROM   public.user_themes
  WHERE  user_id = v_uid;

  -- Count legendary avatar items owned.
  SELECT COUNT(*) INTO v_legendary_count
  FROM   public.user_items  ui
  JOIN   public.shop_items  si ON si.id = ui.item_id
  WHERE  ui.user_id = v_uid
    AND  si.rarity  = 'legendary';

  -- Count total avatar items owned.
  SELECT COUNT(*) INTO v_item_count
  FROM   public.user_items
  WHERE  user_id = v_uid;

  -- Count legendary themes explicitly acquired.
  SELECT COUNT(*) INTO v_legendary_theme_count
  FROM   public.user_themes ut
  JOIN   public.themes      t  ON t.id = ut.theme_id
  WHERE  ut.user_id = v_uid
    AND  t.rarity   = 'legendary';

  -- Profile created_at — used for fast_learner time gate.
  SELECT created_at INTO v_profile_created_at
  FROM   public.profiles
  WHERE  id = v_uid;

  -- ── Phase-1 achievements ──────────────────────────────────────────────────

  IF COALESCE(v_progress.correct_answers, 0) >= 1 THEN
    INSERT INTO public.user_achievements (student_id, achievement_id)
    VALUES (v_uid, 'first_correct') ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN v_newly_unlocked := array_append(v_newly_unlocked, 'first_correct'); END IF;
  END IF;

  IF COALESCE(v_progress.correct_answers, 0) >= 10 THEN
    INSERT INTO public.user_achievements (student_id, achievement_id)
    VALUES (v_uid, 'correct_10') ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN v_newly_unlocked := array_append(v_newly_unlocked, 'correct_10'); END IF;
  END IF;

  IF COALESCE(v_progress.correct_answers, 0) >= 100 THEN
    INSERT INTO public.user_achievements (student_id, achievement_id)
    VALUES (v_uid, 'correct_100') ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN v_newly_unlocked := array_append(v_newly_unlocked, 'correct_100'); END IF;
  END IF;

  IF v_theme_count >= 1 THEN
    INSERT INTO public.user_achievements (student_id, achievement_id)
    VALUES (v_uid, 'first_theme') ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN v_newly_unlocked := array_append(v_newly_unlocked, 'first_theme'); END IF;
  END IF;

  IF v_legendary_count >= 1 THEN
    INSERT INTO public.user_achievements (student_id, achievement_id)
    VALUES (v_uid, 'first_legendary') ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN v_newly_unlocked := array_append(v_newly_unlocked, 'first_legendary'); END IF;
  END IF;

  -- Uses longest_streak so the achievement is permanent even if current streak resets.
  IF COALESCE(v_progress.longest_streak, 0) >= 7 THEN
    INSERT INTO public.user_achievements (student_id, achievement_id)
    VALUES (v_uid, 'streak_7') ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN v_newly_unlocked := array_append(v_newly_unlocked, 'streak_7'); END IF;
  END IF;

  IF v_level >= 10 THEN
    INSERT INTO public.user_achievements (student_id, achievement_id)
    VALUES (v_uid, 'level_10') ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN v_newly_unlocked := array_append(v_newly_unlocked, 'level_10'); END IF;
  END IF;

  -- ── Wave-2 achievements ───────────────────────────────────────────────────

  IF v_item_count >= 1 OR v_theme_count >= 1 THEN
    INSERT INTO public.user_achievements (student_id, achievement_id)
    VALUES (v_uid, 'first_purchase') ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN v_newly_unlocked := array_append(v_newly_unlocked, 'first_purchase'); END IF;
  END IF;

  IF v_item_count >= 5 THEN
    INSERT INTO public.user_achievements (student_id, achievement_id)
    VALUES (v_uid, 'collector_5') ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN v_newly_unlocked := array_append(v_newly_unlocked, 'collector_5'); END IF;
  END IF;

  IF v_theme_count >= 3 THEN
    INSERT INTO public.user_achievements (student_id, achievement_id)
    VALUES (v_uid, 'themes_3') ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN v_newly_unlocked := array_append(v_newly_unlocked, 'themes_3'); END IF;
  END IF;

  IF COALESCE(v_progress.longest_streak, 0) >= 30 THEN
    INSERT INTO public.user_achievements (student_id, achievement_id)
    VALUES (v_uid, 'streak_30') ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN v_newly_unlocked := array_append(v_newly_unlocked, 'streak_30'); END IF;
  END IF;

  IF COALESCE(v_progress.correct_answers, 0) >= 1000 THEN
    INSERT INTO public.user_achievements (student_id, achievement_id)
    VALUES (v_uid, 'correct_1000') ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN v_newly_unlocked := array_append(v_newly_unlocked, 'correct_1000'); END IF;
  END IF;

  -- ── Hidden achievements ───────────────────────────────────────────────────

  -- night_owl: frontend sets night_correct flag when correct answer at 00:00–03:59
  IF COALESCE(v_progress.night_correct, false) THEN
    INSERT INTO public.user_achievements (student_id, achievement_id)
    VALUES (v_uid, 'night_owl') ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN v_newly_unlocked := array_append(v_newly_unlocked, 'night_owl'); END IF;
  END IF;

  -- perfect_five: frontend sets best_session_streak when 5+ correct in a row
  IF COALESCE(v_progress.best_session_streak, 0) >= 5 THEN
    INSERT INTO public.user_achievements (student_id, achievement_id)
    VALUES (v_uid, 'perfect_five') ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN v_newly_unlocked := array_append(v_newly_unlocked, 'perfect_five'); END IF;
  END IF;

  -- legendary_combo: own 1+ legendary avatar item AND 1+ legendary theme
  IF v_legendary_count >= 1 AND v_legendary_theme_count >= 1 THEN
    INSERT INTO public.user_achievements (student_id, achievement_id)
    VALUES (v_uid, 'legendary_combo') ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN v_newly_unlocked := array_append(v_newly_unlocked, 'legendary_combo'); END IF;
  END IF;

  -- fast_learner: reach level 5 within 24 hours of account creation
  IF v_level >= 5
     AND v_profile_created_at IS NOT NULL
     AND (now() - v_profile_created_at) <= interval '24 hours'
  THEN
    INSERT INTO public.user_achievements (student_id, achievement_id)
    VALUES (v_uid, 'fast_learner') ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN v_newly_unlocked := array_append(v_newly_unlocked, 'fast_learner'); END IF;
  END IF;

  RETURN to_jsonb(v_newly_unlocked);
END;
$$;

REVOKE ALL ON FUNCTION public.evaluate_achievements(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.evaluate_achievements(uuid) TO authenticated;
