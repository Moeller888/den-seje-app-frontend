-- ============================================================
-- Achievement Progress Metadata
--
-- Adds progress_type and target_value columns to the achievements
-- table so the frontend can render data-driven progress bars
-- without hardcoded switch statements.
--
-- progress_type: names the student_progress / cosmetic counter
--   to read as the "current" value.
--   Supported types:
--     correct_answers  → student_progress.correct_answers
--     streak           → student_progress.longest_streak
--     level            → derived from student_progress.xp
--     items_owned      → count of user_items rows
--     themes_acquired  → count of user_themes rows (purchased only)
--     legendary_items  → count of owned items with rarity='legendary'
--     purchases        → items_owned + themes_acquired combined
--
-- target_value: the numeric goal (e.g. 100 for "100 correct answers").
--
-- NULL progress_type = binary achievement (no progress bar).
-- Hidden achievements intentionally left NULL (no leaking).
-- ============================================================


-- ── 1. Add columns ─────────────────────────────────────────────────────────────

ALTER TABLE public.achievements
  ADD COLUMN IF NOT EXISTS progress_type  VARCHAR(32),
  ADD COLUMN IF NOT EXISTS target_value   INTEGER;


-- ── 2. Wire progress metadata to each non-hidden achievement ───────────────────

UPDATE public.achievements SET progress_type = 'correct_answers', target_value = 1    WHERE id = 'first_correct';
UPDATE public.achievements SET progress_type = 'correct_answers', target_value = 10   WHERE id = 'correct_10';
UPDATE public.achievements SET progress_type = 'correct_answers', target_value = 100  WHERE id = 'correct_100';
UPDATE public.achievements SET progress_type = 'correct_answers', target_value = 1000 WHERE id = 'correct_1000';
UPDATE public.achievements SET progress_type = 'themes_acquired', target_value = 1    WHERE id = 'first_theme';
UPDATE public.achievements SET progress_type = 'legendary_items', target_value = 1    WHERE id = 'first_legendary';
UPDATE public.achievements SET progress_type = 'streak',          target_value = 7    WHERE id = 'streak_7';
UPDATE public.achievements SET progress_type = 'streak',          target_value = 30   WHERE id = 'streak_30';
UPDATE public.achievements SET progress_type = 'level',           target_value = 10   WHERE id = 'level_10';
UPDATE public.achievements SET progress_type = 'purchases',       target_value = 1    WHERE id = 'first_purchase';
UPDATE public.achievements SET progress_type = 'items_owned',     target_value = 5    WHERE id = 'collector_5';
UPDATE public.achievements SET progress_type = 'themes_acquired', target_value = 3    WHERE id = 'themes_3';

-- Hidden achievements: progress_type and target_value remain NULL intentionally.
-- Revealing progress on hidden achievements would leak requirements.
-- night_owl, perfect_five, legendary_combo, fast_learner → no update.
