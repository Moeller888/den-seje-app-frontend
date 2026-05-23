-- Add galaxy-cape to shop inventory
-- SVG exists at /assets/avatar/shirt/galaxy-cape.svg
-- slot_type="back" / layer_order=-1 — same pipeline as cape-red
-- price: 750 coins (between uncommon 300–400 and wings-dragon 850, fits "rare" tier)
INSERT INTO public.shop_items (id, name, price, type, rarity, image_url, slot_type, layer_order)
VALUES ('galaxy-cape', 'Galakskappe', 750, 'avatar', 'rare', '/assets/avatar/shirt/galaxy-cape.svg', 'back', -1)
ON CONFLICT (id) DO NOTHING;
