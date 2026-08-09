-- Section 154A: Avatar Cosmetics — 4 new shop items.
-- Applied 2026-06-12 via Supabase MCP apply_migration.
--
-- New items:
--   pirate-hat  — headwear, uncommon, 250 coins, layer_order=5
--   ninja-mask  — face,     uncommon, 300 coins, layer_order=6
--   hero-mask   — face,     uncommon, 350 coins, layer_order=6
--   panda-mask  — face,     rare,     750 coins, layer_order=6
--
-- No schema changes. Uses existing shop_items table, equip_item/unequip_item RPCs,
-- and the existing render pipeline (ALL_SLOTS + SLOT_Z in avatar-layers.js).
-- Assets are pre-existing SVGs in assets/avatar/hat/ and assets/avatar/mask/.

INSERT INTO public.shop_items (id, name, price, type, rarity, slot_type, layer_order, image_url)
VALUES
  ('pirate-hat', 'Pirathat',    250, 'avatar', 'uncommon', 'headwear', 5, '/assets/avatar/hat/pirate-hat.svg'),
  ('ninja-mask', 'Ninja-maske', 300, 'avatar', 'uncommon', 'face',     6, '/assets/avatar/mask/ninja-mask.svg'),
  ('hero-mask',  'Heltemaske',  350, 'avatar', 'uncommon', 'face',     6, '/assets/avatar/mask/hero-mask.svg'),
  ('panda-mask', 'Pandamaske',  750, 'avatar', 'rare',     'face',     6, '/assets/avatar/mask/panda-mask.svg')
ON CONFLICT (id) DO NOTHING;;
