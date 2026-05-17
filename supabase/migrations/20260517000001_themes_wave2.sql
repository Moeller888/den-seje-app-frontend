-- ============================================================
-- Themes wave 2 — 5 new themes
-- sakura (uncommon), meadow (uncommon), aurora (rare),
-- pearl (rare), rose-gold (legendary)
-- ON CONFLICT DO NOTHING makes this idempotent.
-- ============================================================

INSERT INTO public.themes (id, name, rarity, price, description, always_owned) VALUES
  ('sakura',    'Sakura',     'uncommon', 200, 'Blød kirsebærblomst — varmt blomme og rose-accent.',        false),
  ('meadow',    'Eng',        'uncommon', 300, 'Hyggelig natur — varme jordfarver og blød salvie-grøn.',    false),
  ('aurora',    'Aurora',     'rare',     600, 'Drømmende og magisk — dybe blå og violet nordlys-accent.',  false),
  ('pearl',     'Perle',      'rare',     500, 'Minimalistisk og premium — køligt sølv og navy-accent.',    false),
  ('rose-gold', 'Rose-guld',  'legendary',900, 'Luksuriøst og elegant — mørk kul med rose-guld metalaccent.', false)
ON CONFLICT (id) DO NOTHING;
