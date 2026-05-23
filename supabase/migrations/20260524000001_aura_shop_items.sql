-- Add 4 aura items to shop inventory
-- SVGs exist at /assets/avatar/aura/
-- slot_type="aura" / layer_order=-2 — renders behind all body layers
INSERT INTO public.shop_items (id, name, price, type, rarity, image_url, slot_type, layer_order)
VALUES
  ('aura-ember',  'Ember-aura',   150,  'avatar', 'common',    '/assets/avatar/aura/aura-ember.svg',  'aura', -2),
  ('aura-sky',    'Himmel-aura',  350,  'avatar', 'uncommon',  '/assets/avatar/aura/aura-sky.svg',    'aura', -2),
  ('aura-arcane', 'Arkane aura',  800,  'avatar', 'rare',      '/assets/avatar/aura/aura-arcane.svg', 'aura', -2),
  ('aura-gold',   'Guld-aura',    2500, 'avatar', 'legendary', '/assets/avatar/aura/aura-gold.svg',   'aura', -2)
ON CONFLICT (id) DO NOTHING;
