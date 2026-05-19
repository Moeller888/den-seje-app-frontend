-- ============================================================
-- Prestige System
--
-- Storage:
--   student_progress.prestige_score  INTEGER NOT NULL DEFAULT 0
--
-- Functions:
--   prestige_weight(p_rarity TEXT) → INTEGER
--     IMMUTABLE helper — single source of truth for rarity weights.
--     common=1, uncommon=2, rare=5, legendary=12.
--     Future prestige sources use this same function.
--
--   recalculate_prestige(p_user_id UUID) → INTEGER
--     SECURITY DEFINER — aggregates all 4 collectible categories
--     in a single set-based UNION ALL pass, persists result to
--     student_progress, and returns the computed score.
--
-- Collectible categories (all 4):
--   1. Avatar items   — user_items JOIN shop_items WHERE slot_type IS NOT NULL
--   2. Themes         — always_owned=true  +  user_themes (per-user purchases)
--   3. Achievements   — user_achievements JOIN achievements
--   4. Titles         — user_titles JOIN titles
--
-- Extensibility:
--   Add future sources (profile frames, badges, seasonal rewards, etc.)
--   by adding a new UNION ALL branch inside recalculate_prestige.
--   prestige_weight() handles any rarity string — no weight changes needed.
--
-- Backfill:
--   DO block calls recalculate_prestige for all existing users.
-- ============================================================


-- ── 1. prestige_score column on student_progress ─────────────────────────────

ALTER TABLE public.student_progress
  ADD COLUMN IF NOT EXISTS prestige_score INTEGER NOT NULL DEFAULT 0;


-- ── 2. Rarity weight helper ───────────────────────────────────────────────────
-- IMMUTABLE PARALLEL SAFE: safe in set-based aggregations; Postgres may inline.
-- This is the canonical weight definition — no other location defines weights.

CREATE OR REPLACE FUNCTION public.prestige_weight(p_rarity TEXT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE p_rarity
    WHEN 'common'    THEN 1
    WHEN 'uncommon'  THEN 2
    WHEN 'rare'      THEN 5
    WHEN 'legendary' THEN 12
    ELSE 0
  END;
$$;


-- ── 3. recalculate_prestige RPC ───────────────────────────────────────────────
-- Computes prestige server-side, persists it, and returns the score.
--
-- Performance:
--   Single UNION ALL aggregation — one pass, no N+1, no repeated rarity scans.
--
-- Security:
--   SECURITY DEFINER — bypasses RLS to read all collectible tables.
--   Auth guard: authenticated users may only recalculate their own prestige.
--   Backfill (auth.uid() IS NULL) may recalculate any user — guard passes.
--
-- Matches hub.html client-side logic exactly:
--   - items:        slot_type IS NOT NULL   (equipable only)
--   - themes:       always_owned OR owned
--   - achievements: all unlocked
--   - titles:       all owned

CREATE OR REPLACE FUNCTION public.recalculate_prestige(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   UUID    := auth.uid();
  v_score INTEGER;
BEGIN
  -- Block cross-user calls from authenticated sessions;
  -- allow self-call and backfill (auth.uid() IS NULL).
  IF v_uid IS NOT NULL AND v_uid != p_user_id THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT COALESCE(SUM(prestige_weight(src.rarity)), 0)::INTEGER
  INTO   v_score
  FROM (
    -- 1. Owned avatar items (equipable only)
    SELECT si.rarity
    FROM   user_items ui
    JOIN   shop_items si ON si.id = ui.item_id
    WHERE  ui.user_id   = p_user_id
      AND  si.slot_type IS NOT NULL

    UNION ALL

    -- 2. Owned themes (always_owned for every user + individually purchased)
    SELECT t.rarity
    FROM   themes t
    WHERE  t.always_owned = true
       OR  t.id IN (
             SELECT ut.theme_id FROM user_themes ut WHERE ut.user_id = p_user_id
           )

    UNION ALL

    -- 3. Unlocked achievements
    SELECT a.rarity
    FROM   user_achievements ua
    JOIN   achievements      a ON a.id = ua.achievement_id
    WHERE  ua.student_id = p_user_id

    UNION ALL

    -- 4. Owned titles
    SELECT ti.rarity
    FROM   user_titles utl
    JOIN   titles      ti ON ti.id = utl.title_id
    WHERE  utl.user_id = p_user_id

    -- Future sources: add UNION ALL branches here.
    -- prestige_weight() handles any rarity value; no weight changes needed.
  ) src;

  UPDATE public.student_progress
  SET    prestige_score = v_score
  WHERE  student_id = p_user_id;

  RETURN v_score;
END;
$$;


-- ── 4. Backfill all existing users ───────────────────────────────────────────

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT student_id FROM public.student_progress LOOP
    PERFORM public.recalculate_prestige(r.student_id);
  END LOOP;
END;
$$;
