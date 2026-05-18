-- ============================================================
-- Achievement Wave 2 — rarity column + 5 new achievements
--
-- Changes
-- ───────
-- 1. ADD COLUMN rarity to achievements (DEFAULT 'common')
-- 2. UPDATE phase-1 rarities (correct_100, first_legendary,
--    streak_7, level_10 → rare; rest stay common)
-- 3. INSERT 5 wave-2 achievements
-- 4. REPLACE evaluate_achievements() — adds v_item_count +
--    5 new condition blocks for 12 total
-- 5. Backfill: re-evaluate all existing students (idempotent)
-- ============================================================


-- ── 1. Add rarity column ──────────────────────────────────────────────────────

ALTER TABLE public.achievements
  ADD COLUMN IF NOT EXISTS rarity TEXT NOT NULL DEFAULT 'common';


-- ── 2. Update phase-1 rarities ───────────────────────────────────────────────

UPDATE public.achievements
  SET rarity = 'rare'
  WHERE id IN ('correct_100', 'first_legendary', 'streak_7', 'level_10');

-- first_correct, correct_10, first_theme stay at DEFAULT 'common'.


-- ── 3. Wave-2 achievement catalog ────────────────────────────────────────────

INSERT INTO public.achievements (id, label, description, icon, sort_order, rarity) VALUES
  ('first_purchase', 'Første køb',        'Anskaff dig et avatar-item eller et tema',       '🛒', 8,  'common'),
  ('collector_5',    '5 items',           'Anskaff dig 5 avatar-items',                     '💎', 9,  'rare'),
  ('themes_3',       '3 temaer',          'Lås op for 3 temaer',                            '🎨', 10, 'rare'),
  ('streak_30',      '30 dage i træk',    'Oprethold en streak i 30 dage',                  '⚡', 11, 'legendary'),
  ('correct_1000',   '1000 rigtige svar', 'Svar rigtigt på 1000 spørgsmål i alt',           '🏆', 12, 'legendary')
ON CONFLICT (id) DO NOTHING;


-- ── 4. Replace evaluate_achievements (all 12 achievements) ───────────────────

CREATE OR REPLACE FUNCTION public.evaluate_achievements(
  p_student_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid             UUID    := COALESCE(p_student_id, auth.uid());
  v_progress        RECORD;
  v_level           INTEGER;
  v_theme_count     INTEGER;
  v_legendary_count INTEGER;
  v_item_count      INTEGER;
  v_newly_unlocked  TEXT[]  := ARRAY[]::TEXT[];
  v_rows            INTEGER;
BEGIN
  -- Auth guard: when called from client (auth.uid() available) only allow own ID.
  IF auth.uid() IS NOT NULL AND v_uid IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Read student progress.
  SELECT correct_answers, xp, longest_streak
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

  -- Count legendary items owned.
  SELECT COUNT(*) INTO v_legendary_count
  FROM   public.user_items  ui
  JOIN   public.shop_items  si ON si.id = ui.item_id
  WHERE  ui.user_id = v_uid
    AND  si.rarity  = 'legendary';

  -- Count total avatar items owned.
  SELECT COUNT(*) INTO v_item_count
  FROM   public.user_items
  WHERE  user_id = v_uid;

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

  RETURN to_jsonb(v_newly_unlocked);
END;
$$;


-- ── 5. Backfill: re-evaluate all existing students ────────────────────────────
--
-- Calls evaluate_achievements for every student profile.
-- auth.uid() is NULL in DO blocks → auth guard passes → any student ID accepted.
-- All inserts are ON CONFLICT DO NOTHING — safe to re-run.

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
