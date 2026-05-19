-- ============================================================
-- Profile Titles — Phase 1
--
-- Tables:
--   titles      — static catalog (id, name, rarity, source, sort_order)
--   user_titles — ownership (user_id, title_id, earned_at)
--
-- Profile column:
--   profiles.active_title TEXT — currently equipped title (nullable FK)
--
-- RPCs:
--   set_active_title(p_title_id TEXT)
--     Sets the calling user's active title.
--     Pass NULL to unequip. Verifies ownership.
--
--   grant_achievement_rewards (REPLACED)
--     Adds 'title' case: inserts into user_titles ON CONFLICT DO NOTHING.
--
-- Title catalog seed (5 titles, 4 rarities):
--   rookie           → common    ← first_correct
--   vedholdende      → uncommon  ← streak_7
--   natugle          → rare      ← night_owl (hidden)
--   hurtiglaerer     → legendary ← fast_learner (hidden)
--   den-store-samler → legendary ← legendary_combo (hidden)
--
-- Achievement reward updates (5 achievements: coins → title):
--   first_correct   → title: rookie
--   streak_7        → title: vedholdende
--   night_owl       → title: natugle
--   fast_learner    → title: hurtiglaerer
--   legendary_combo → title: den-store-samler
-- ============================================================


-- ── 1. Titles catalog ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.titles (
  id         TEXT    PRIMARY KEY,
  name       TEXT    NOT NULL,
  rarity     TEXT    NOT NULL DEFAULT 'common'
               CHECK (rarity IN ('common', 'uncommon', 'rare', 'legendary')),
  source     TEXT    NOT NULL DEFAULT 'achievement',
  sort_order INTEGER NOT NULL DEFAULT 0
);


-- ── 2. User title ownership ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_titles (
  user_id   UUID        NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
  title_id  TEXT        NOT NULL REFERENCES public.titles(id),
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, title_id)
);


-- ── 3. Active title on profiles ───────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS active_title TEXT REFERENCES public.titles(id);


-- ── 4. RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.titles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_titles ENABLE ROW LEVEL SECURITY;

-- Catalog is publicly readable (same as shop_items, themes).
CREATE POLICY "titles_select_all"
  ON public.titles FOR SELECT
  TO anon, authenticated
  USING (true);

-- Users can read their own title ownership rows.
CREATE POLICY "user_titles_select_own"
  ON public.user_titles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- All writes to user_titles go through SECURITY DEFINER RPCs only.
-- No direct client INSERT/UPDATE/DELETE policies needed.


-- ── 5. Seed title catalog ─────────────────────────────────────────────────────

INSERT INTO public.titles (id, name, rarity, source, sort_order) VALUES
  ('rookie',           'Rookie',           'common',    'achievement', 1),
  ('vedholdende',      'Vedholdende',      'uncommon',  'achievement', 2),
  ('natugle',          'Natugle',          'rare',      'achievement', 3),
  ('hurtiglaerer',     'Hurtiglærer',      'legendary', 'achievement', 4),
  ('den-store-samler', 'Den Store Samler', 'legendary', 'achievement', 5)
ON CONFLICT (id) DO NOTHING;


-- ── 6. Update achievement rewards: 5 achievements change from coins → title ───

UPDATE public.achievements
  SET reward_type = 'title', reward_value = 'rookie', reward_amount = NULL
  WHERE id = 'first_correct';

UPDATE public.achievements
  SET reward_type = 'title', reward_value = 'vedholdende', reward_amount = NULL
  WHERE id = 'streak_7';

UPDATE public.achievements
  SET reward_type = 'title', reward_value = 'natugle', reward_amount = NULL
  WHERE id = 'night_owl';

UPDATE public.achievements
  SET reward_type = 'title', reward_value = 'hurtiglaerer', reward_amount = NULL
  WHERE id = 'fast_learner';

UPDATE public.achievements
  SET reward_type = 'title', reward_value = 'den-store-samler', reward_amount = NULL
  WHERE id = 'legendary_combo';


-- ── 7. Replace grant_achievement_rewards — adds 'title' case ─────────────────

CREATE OR REPLACE FUNCTION public.grant_achievement_rewards(
  p_achievement_ids TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid             UUID    := auth.uid();
  v_ach             RECORD;
  v_already_claimed BOOLEAN;
  v_grants          JSONB   := '[]'::JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_achievement_ids IS NULL OR array_length(p_achievement_ids, 1) IS NULL THEN
    RETURN '[]'::JSONB;
  END IF;

  FOR v_ach IN
    SELECT a.id, a.reward_type, a.reward_value, a.reward_amount
    FROM   public.achievements a
    WHERE  a.id = ANY(p_achievement_ids)
      AND  a.reward_type IS NOT NULL
  LOOP
    SELECT reward_claimed
    INTO   v_already_claimed
    FROM   public.user_achievements
    WHERE  student_id     = v_uid
      AND  achievement_id = v_ach.id;

    IF NOT FOUND OR v_already_claimed THEN
      CONTINUE;
    END IF;

    IF v_ach.reward_type = 'coins' THEN
      UPDATE public.student_progress
      SET    coins = COALESCE(coins, 0) + v_ach.reward_amount
      WHERE  student_id = v_uid;

    ELSIF v_ach.reward_type = 'theme' THEN
      INSERT INTO public.user_themes (user_id, theme_id)
      VALUES (v_uid, v_ach.reward_value)
      ON CONFLICT (user_id, theme_id) DO NOTHING;

    ELSIF v_ach.reward_type = 'item' THEN
      INSERT INTO public.user_items (user_id, item_id)
      VALUES (v_uid, v_ach.reward_value)
      ON CONFLICT (user_id, item_id) DO NOTHING;

    ELSIF v_ach.reward_type = 'title' THEN
      INSERT INTO public.user_titles (user_id, title_id)
      VALUES (v_uid, v_ach.reward_value)
      ON CONFLICT (user_id, title_id) DO NOTHING;
    END IF;

    UPDATE public.user_achievements
    SET    reward_claimed    = true,
           reward_claimed_at = now()
    WHERE  student_id     = v_uid
      AND  achievement_id = v_ach.id;

    v_grants := v_grants || jsonb_build_array(jsonb_build_object(
      'achievement_id', v_ach.id,
      'reward_type',    v_ach.reward_type,
      'reward_value',   v_ach.reward_value,
      'reward_amount',  v_ach.reward_amount
    ));
  END LOOP;

  RETURN v_grants;
END;
$$;


-- ── 8. set_active_title RPC ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_active_title(p_title_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_title_id IS NULL THEN
    UPDATE public.profiles SET active_title = NULL WHERE id = v_uid;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_titles
    WHERE user_id = v_uid AND title_id = p_title_id
  ) THEN
    RAISE EXCEPTION 'title_not_owned';
  END IF;

  UPDATE public.profiles SET active_title = p_title_id WHERE id = v_uid;
END;
$$;
