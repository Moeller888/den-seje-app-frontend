-- ============================================================
-- Hidden Achievement System — wave 1 (4 hidden achievements)
--
-- Changes
-- ───────
-- 1. ADD COLUMN hidden to achievements (DEFAULT false)
-- 2. ADD COLUMN night_correct to student_progress (DEFAULT false)
-- 3. ADD COLUMN best_session_streak to student_progress (DEFAULT 0)
-- 4. INSERT 4 hidden achievement catalog rows
-- 5. CREATE set_night_correct() — flags night correct for calling user
-- 6. CREATE update_best_session_streak(p_count) — persists session best
-- 7. REPLACE evaluate_achievements() — adds 4 hidden conditions (16 total)
--    + new variables: v_legendary_theme_count, v_profile_created_at
-- 8. Backfill: re-evaluate all existing students (idempotent)
-- ============================================================


-- ── 1. hidden column on achievements ─────────────────────────────────────────

ALTER TABLE public.achievements
  ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false;


-- ── 2. Tracking columns on student_progress ──────────────────────────────────

ALTER TABLE public.student_progress
  ADD COLUMN IF NOT EXISTS night_correct BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.student_progress
  ADD COLUMN IF NOT EXISTS best_session_streak INTEGER NOT NULL DEFAULT 0;


-- ── 3. Hidden achievement catalog ────────────────────────────────────────────

INSERT INTO public.achievements (id, label, description, icon, sort_order, rarity, hidden) VALUES
  ('night_owl',       'Natteuglen',       'Svar rigtigt på et spørgsmål om natten',              '🌙', 13, 'rare',      true),
  ('perfect_five',    'Perfekt Fem',      'Besvar 5 spørgsmål korrekt i træk på én session',     '⭐', 14, 'rare',      true),
  ('legendary_combo', 'Den Store Samler', 'Ejer et legendarisk item og et legendarisk tema',     '👑', 15, 'legendary', true),
  ('fast_learner',    'Hurtiglærer',      'Nå niveau 5 inden for 24 timer efter oprettelse',     '🚀', 16, 'legendary', true)
ON CONFLICT (id) DO NOTHING;


-- ── 4. set_night_correct RPC ──────────────────────────────────────────────────
--
-- Called by app.js when a correct answer is given between 00:00–03:59 local
-- time. Sets a persistent flag; evaluate_achievements() picks it up on hub load.

CREATE OR REPLACE FUNCTION public.set_night_correct()
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.student_progress
  SET night_correct = true
  WHERE student_id = auth.uid();
$$;


-- ── 5. update_best_session_streak RPC ────────────────────────────────────────
--
-- Called by app.js when consecutive correct answers in one session reach ≥ 5.
-- Uses GREATEST so it never decreases the stored best.

CREATE OR REPLACE FUNCTION public.update_best_session_streak(p_count INTEGER)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.student_progress
  SET best_session_streak = GREATEST(best_session_streak, p_count)
  WHERE student_id = auth.uid();
$$;


-- ── 6. Replace evaluate_achievements (all 16 achievements) ───────────────────

CREATE OR REPLACE FUNCTION public.evaluate_achievements(
  p_student_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid                   UUID        := COALESCE(p_student_id, auth.uid());
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
  -- Auth guard: when called from client (auth.uid() available) only allow own ID.
  IF auth.uid() IS NOT NULL AND v_uid IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
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


-- ── 7. Backfill: re-evaluate all existing students ────────────────────────────
--
-- night_owl and perfect_five rely on client-set flags (both default false/0),
-- so they will not trigger retroactively. legendary_combo and fast_learner
-- are evaluated against current DB state — qualifying students get awarded now.

DO $$
DECLARE
  v_student RECORD;
BEGIN
  FOR v_student IN
    SELECT id FROM public.profiles WHERE role = 'student'
  LOOP
    PERFORM public.evaluate_achievements(v_student.id);
  END LOOP;
END;
$$;
