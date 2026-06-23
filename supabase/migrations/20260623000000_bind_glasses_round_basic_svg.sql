-- 165A — Bind the glasses-round shop row to the promoted front-only SVG asset
-- ---------------------------------------------------------------------------
-- Upgrades the EXISTING live "Runde Briller" (id = 'glasses-round') item's image
-- from the legacy temple-armed glasses-round.svg to the reviewed front-only
-- glasses-round-basic-v1.svg promoted in 164Z. This is an ASSET UPGRADE of one
-- existing item (164Y Decision 2, Option A): same id, name, price, slot_type
-- ('eyes'), and layer_order (7) — only image_url changes.
--
-- Promoted asset (committed in 164Z, ddfeb1a):
--   /assets/avatar/glasses/glasses-round-basic-v1.svg
-- The legacy /assets/avatar/glasses/glasses-round.svg is left in place (not deleted),
-- so this binding is cleanly reversible.
--
-- Idempotent: the IS DISTINCT FROM guard makes a re-run a no-op once the row already
-- points at the new asset. Targets exactly one row (id is the primary key).
-- ---------------------------------------------------------------------------

UPDATE public.shop_items
SET image_url = '/assets/avatar/glasses/glasses-round-basic-v1.svg'
WHERE id = 'glasses-round'
  AND image_url IS DISTINCT FROM '/assets/avatar/glasses/glasses-round-basic-v1.svg';
