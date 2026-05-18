-- ============================================================
-- Achievement system — phase 1 (7 achievements)
--
-- Tables
-- ──────
-- achievements       static catalog (admin-managed, all students can read)
-- user_achievements  earned records; PRIMARY KEY prevents duplicates
--
-- Functions
-- ─────────
-- calculate_level_from_xp(xp)         pure helper — mirrors JS calculateLevelFromXP
-- evaluate_achievements(student_id)   evaluates all 7 conditions, inserts
--                                     newly-qualifying rows via ON CONFLICT DO NOTHING,
--                                     returns JSONB array of newly-inserted IDs.
--
-- Anti-duplication
-- ────────────────
-- 1. PRIMARY KEY (student_id, achievement_id) — physically blocks duplicates.
-- 2. ON CONFLICT DO NOTHING in every insert path.
-- 3. ROW_COUNT check: only IDs with ROW_COUNT=1 land in the return value.
--
-- Backfill
-- ────────
-- Final DO block calls evaluate_achievements(id) for every existing student.
-- Safe to run multiple times — all inserts are idempotent.
--
-- Auth model
-- ──────────
-- Client call (no args): uses auth.uid().
-- Cannot forge another user's ID: guard raises if auth.uid() != param.
-- DO-block backfill: auth.uid() is NULL → guard passes → any student ID allowed.
-- ============================================================


-- ── 1. Tables ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.achievements (
  id          TEXT    PRIMARY KEY,
  label       TEXT    NOT NULL,
  description TEXT    NOT NULL,
  icon        TEXT    NOT NULL DEFAULT '★',
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.user_achievements (
  student_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  achievement_id TEXT        NOT NULL REFERENCES public.achievements(id),
  unlocked_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_ua_student_unlocked
  ON public.user_achievements (student_id, unlocked_at DESC);


-- ── 2. Phase-1 achievement catalog ──────────────────────────────────────────

INSERT INTO public.achievements (id, label, description, icon, sort_order) VALUES
  ('first_correct',   'Første rigtige svar', 'Svar rigtigt på dit første spørgsmål',           '✓', 1),
  ('correct_10',      '10 rigtige svar',     'Svar rigtigt på 10 spørgsmål i alt',              '◎', 2),
  ('correct_100',     '100 rigtige svar',    'Svar rigtigt på 100 spørgsmål i alt',             '★', 3),
  ('first_theme',     'Første tema',         'Lås op for dit første tema',                      '◈', 4),
  ('first_legendary', 'Legendarisk item',    'Anskaff dig et legendarisk avatar-item',          '✦', 5),
  ('streak_7',        '7 dage i træk',       'Oprethold en streak i 7 dage',                    '🔥', 6),
  ('level_10',        'Niveau 10',           'Nå niveau 10',                                    '▲', 7)
ON CONFLICT (id) DO NOTHING;


-- ── 3. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE public.achievements      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

-- Catalog is public — all authenticated students may read.
CREATE POLICY "ach_select_all"
  ON public.achievements FOR SELECT TO authenticated
  USING (true);

-- Students read only their own earned achievements.
CREATE POLICY "ua_select_own"
  ON public.user_achievements FOR SELECT TO authenticated
  USING (student_id = auth.uid());


-- ── 4. calculate_level_from_xp ───────────────────────────────────────────────
--
-- Mirrors JS calculateLevelFromXP exactly:
--   Level n requires (50 + (n-1)*25) XP to advance.
-- IMMUTABLE: no side effects, safe for use in other functions.

CREATE OR REPLACE FUNCTION public.calculate_level_from_xp(p_xp INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_level     INTEGER := 1;
  v_remaining INTEGER := GREATEST(0, COALESCE(p_xp, 0));
  v_required  INTEGER;
BEGIN
  LOOP
    v_required := 50 + (v_level - 1) * 25;
    EXIT WHEN v_remaining < v_required;
    v_remaining := v_remaining - v_required;
    v_level     := v_level + 1;
  END LOOP;
  RETURN v_level;
END;
$$;


-- ── 5. evaluate_achievements ─────────────────────────────────────────────────
--
-- Called from hub.html on every page load (idempotent).
-- Returns JSONB array of newly-unlocked achievement IDs, e.g. ["first_correct"].
-- Returns [] if nothing new was unlocked.
--
-- Conditions:
--   first_correct   — student_progress.correct_answers >= 1
--   correct_10      — student_progress.correct_answers >= 10
--   correct_100     — student_progress.correct_answers >= 100
--   first_theme     — at least 1 row in user_themes (explicitly acquired)
--   first_legendary — owns at least 1 item with rarity='legendary' in shop_items
--   streak_7        — student_progress.longest_streak >= 7 (permanent)
--   level_10        — level derived from xp >= 10

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

  -- ── Evaluate each achievement ─────────────────────────────────────────────

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

  RETURN to_jsonb(v_newly_unlocked);
END;
$$;


-- ── 6. Backfill: award all qualifying achievements to existing students ───────
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
