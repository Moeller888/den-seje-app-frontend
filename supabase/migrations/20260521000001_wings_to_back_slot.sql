-- ── Wings-dragon: body slot → back slot ──────────────────────────────────────
-- Wings extend to x=2/x=158 (beyond the arm silhouette at x=14/x=146).
-- At z=-1 (back slot) the wings peek out above the shoulders and beside the arms,
-- creating the correct "wings on back" silhouette.
-- At z=1 (body slot) they render in front as a chest decoration — wrong.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.shop_items
SET slot_type = 'back', layer_order = -1
WHERE id = 'wings-dragon';

-- Migrate any profiles that have wings equipped in the body slot → back slot.
-- Only touches rows where body slot is specifically wings-dragon.
UPDATE public.profiles
SET equipped_slots =
  (equipped_slots - 'body') ||
  jsonb_build_object('back', equipped_slots -> 'body')
WHERE (equipped_slots ->> 'body') = 'wings-dragon';
