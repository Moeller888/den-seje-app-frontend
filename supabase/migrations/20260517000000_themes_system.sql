-- ============================================================
-- Themes system
-- Adds: themes catalog, user_themes ownership table,
-- profiles.active_theme column, RLS policies,
-- purchase_theme RPC, set_active_theme RPC, seed data.
-- ============================================================

-- ── 1. THEMES CATALOG ────────────────────────────────────────
-- id is the canonical theme key — matches [data-theme="X"] CSS attribute.
-- always_owned = true means the theme is available to all users without purchase.

CREATE TABLE public.themes (
  id           TEXT PRIMARY KEY,
  name         TEXT        NOT NULL,
  rarity       TEXT        NOT NULL DEFAULT 'common'
                 CHECK (rarity IN ('common', 'uncommon', 'rare', 'legendary')),
  price        INTEGER     NOT NULL DEFAULT 0
                 CHECK (price >= 0),
  description  TEXT,
  always_owned BOOLEAN     NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. USER THEME OWNERSHIP ──────────────────────────────────
-- One row per (user, theme) pair for purchased themes.
-- always_owned themes never require a row here.

CREATE TABLE public.user_themes (
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  theme_id   TEXT        NOT NULL REFERENCES public.themes(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, theme_id)
);

-- ── 3. ACTIVE THEME ON PROFILES ──────────────────────────────
-- Stores the currently equipped theme id (same value as themes.id).
-- All existing profile rows receive 'default' via the column DEFAULT.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS active_theme TEXT NOT NULL DEFAULT 'default';

-- ── 4. ROW LEVEL SECURITY ────────────────────────────────────

ALTER TABLE public.themes ENABLE ROW LEVEL SECURITY;

-- Theme catalog is publicly readable (same as shop_items).
CREATE POLICY "themes_select_all"
  ON public.themes
  FOR SELECT
  TO anon, authenticated
  USING (true);

ALTER TABLE public.user_themes ENABLE ROW LEVEL SECURITY;

-- Users may only read their own ownership rows.
CREATE POLICY "user_themes_select_own"
  ON public.user_themes
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- No direct INSERT/UPDATE/DELETE on user_themes:
-- all writes go through the purchase_theme SECURITY DEFINER RPC.

-- ── 5. INITIAL THEME CATALOG ─────────────────────────────────
-- ON CONFLICT DO NOTHING makes this idempotent (safe to re-run).

INSERT INTO public.themes (id, name, rarity, price, description, always_owned) VALUES
  ('default', 'Standard',  'common',   0,   'Det klassiske mørkeblå tema.',                true),
  ('ice',     'Is',        'uncommon', 200, 'Kølig dyb blå med cyan accent.',              false),
  ('inferno', 'Inferno',   'rare',     500, 'Varme røde, orange og gyldne toner.',          false),
  ('void',    'Tomrum',    'rare',     500, 'Mørk lilla med høj kontrast cyan accent.',     false),
  ('forest',  'Skov',      'uncommon', 300, 'Dæmpede grønne og brune jordtoner.',           false)
ON CONFLICT (id) DO NOTHING;

-- ── 6. purchase_theme RPC ────────────────────────────────────
-- Atomic: deducts coins and inserts user_themes in one transaction.
-- Mirrors the purchase_item RPC pattern for consistency.

CREATE OR REPLACE FUNCTION public.purchase_theme(p_theme_id TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   UUID    := auth.uid();
  v_price     INTEGER;
  v_always    BOOLEAN;
  v_remaining INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Verify theme exists and get price/always_owned.
  SELECT price, always_owned INTO v_price, v_always
  FROM public.themes
  WHERE id = p_theme_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'theme_not_found';
  END IF;

  -- always_owned themes (e.g. "default") cannot be purchased.
  IF v_always THEN
    RAISE EXCEPTION 'already_owned';
  END IF;

  -- Prevent duplicate purchase.
  IF EXISTS (
    SELECT 1 FROM public.user_themes
    WHERE user_id = v_user_id AND theme_id = p_theme_id
  ) THEN
    RAISE EXCEPTION 'already_owned';
  END IF;

  -- Atomic coin decrement: WHERE coins >= v_price is the overdraft guard.
  -- If coins are insufficient or student_progress row is missing,
  -- no row is updated and v_remaining stays NULL.
  UPDATE public.student_progress
  SET coins = coins - v_price
  WHERE student_id = v_user_id
    AND coins >= v_price
  RETURNING coins INTO v_remaining;

  IF v_remaining IS NULL THEN
    RAISE EXCEPTION 'insufficient_coins';
  END IF;

  -- Insert ownership record in the same transaction.
  INSERT INTO public.user_themes (user_id, theme_id)
  VALUES (v_user_id, p_theme_id);

  RETURN json_build_object('remaining_coins', v_remaining);
END;
$$;

-- ── 7. set_active_theme RPC ──────────────────────────────────
-- Verifies the theme exists and the user owns it, then sets
-- profiles.active_theme for the calling user.

CREATE OR REPLACE FUNCTION public.set_active_theme(p_theme_key TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID    := auth.uid();
  v_always  BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Verify theme exists.
  SELECT always_owned INTO v_always
  FROM public.themes
  WHERE id = p_theme_key;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'theme_not_found';
  END IF;

  -- Verify ownership (always_owned themes skip the check).
  IF NOT v_always THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.user_themes
      WHERE user_id = v_user_id AND theme_id = p_theme_key
    ) THEN
      RAISE EXCEPTION 'theme_not_owned';
    END IF;
  END IF;

  UPDATE public.profiles
  SET active_theme = p_theme_key
  WHERE id = v_user_id;
END;
$$;
