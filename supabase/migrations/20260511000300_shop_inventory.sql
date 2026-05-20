-- Add rarity tier to shop_items
ALTER TABLE public.shop_items
  ADD COLUMN IF NOT EXISTS rarity TEXT NOT NULL DEFAULT 'common'
  CHECK (rarity IN ('common', 'uncommon', 'rare', 'legendary'));

-- Clear test data (user_items first to avoid FK issues)
DELETE FROM public.user_items;
DELETE FROM public.shop_items;

-- Insert real shop inventory (8 items across 4 rarity tiers)
INSERT INTO public.shop_items (id, name, price, type, rarity, image_url, data) VALUES
  -- Common (80-120 coins)
  ('hat-blue',      'Blå Hat',        80,   'avatar', 'common',    NULL, '{}'),
  ('glasses-round', 'Runde Briller',  90,   'avatar', 'common',    NULL, '{}'),
  ('cape-red',      'Rød Kappe',     100,   'avatar', 'common',    NULL, '{}'),
  ('bow-yellow',    'Gul Sløjfe',    110,   'avatar', 'common',    NULL, '{}'),
  -- Uncommon (280-450 coins)
  ('armor-knight',  'Ridderdragt',   300,   'avatar', 'uncommon',  NULL, '{}'),
  ('crown-silver',  'Sølvkrone',     400,   'avatar', 'uncommon',  NULL, '{}'),
  -- Rare (850 coins)
  ('wings-dragon',  'Drage­vinger',   850,   'avatar', 'rare',      NULL, '{}'),
  -- Legendary (3000 coins)
  ('crown-golden',  'Guldkrone',    3000,   'avatar', 'legendary', NULL, '{}');

-- SECURITY DEFINER RPC: equip an owned item for the calling user
-- DROP first so return-type changes are allowed on replay
DROP FUNCTION IF EXISTS public.equip_item(TEXT);
CREATE OR REPLACE FUNCTION public.equip_item(p_item_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_items
    WHERE user_id = v_user_id AND item_id = p_item_id
  ) THEN
    RAISE EXCEPTION 'Item not owned';
  END IF;

  UPDATE public.profiles
  SET active_avatar = p_item_id
  WHERE id = v_user_id;
END;
$$;
