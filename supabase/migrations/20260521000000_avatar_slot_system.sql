-- ── Avatar Slot System — Semantic Rename ──────────────────────────────────────
-- Renames slot types to semantic names matching js/avatar-layers.js.
-- Fixes capes (misclassified as 'shirt') to 'back' slot (z = -1, behind body).
-- Replaces equip_item and unequip_item RPCs with correct multi-slot logic.
-- Idempotent: safe to re-run against a DB that already has the new names.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Ensure required columns exist ─────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS equipped_slots JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.shop_items
  ADD COLUMN IF NOT EXISTS slot_type   TEXT,
  ADD COLUMN IF NOT EXISTS image_url   TEXT,
  ADD COLUMN IF NOT EXISTS layer_order INTEGER;

-- ── 1b. Drop old slot_type constraint so new semantic names are accepted ──────
ALTER TABLE public.shop_items
  DROP CONSTRAINT IF EXISTS shop_items_slot_type_valid;

-- ── 2. Populate / correct shop_items slot_type and image_url ─────────────────
-- WHERE condition accepts both old name and new name so the UPDATE is a no-op
-- if the row already has the correct slot_type.

UPDATE public.shop_items SET slot_type = 'headwear', image_url = '/assets/avatar/hat/hat-blue.svg',          layer_order = 5
WHERE id = 'hat-blue'      AND (slot_type IS NULL OR slot_type IN ('hat','headwear'));

UPDATE public.shop_items SET slot_type = 'headwear', image_url = '/assets/avatar/hat/bow-yellow.svg',        layer_order = 5
WHERE id = 'bow-yellow'    AND (slot_type IS NULL OR slot_type IN ('hat','headwear'));

UPDATE public.shop_items SET slot_type = 'headwear', image_url = '/assets/avatar/hat/crown-silver.svg',      layer_order = 5
WHERE id = 'crown-silver'  AND (slot_type IS NULL OR slot_type IN ('hat','headwear'));

UPDATE public.shop_items SET slot_type = 'headwear', image_url = '/assets/avatar/hat/crown-golden.svg',      layer_order = 5
WHERE id = 'crown-golden'  AND (slot_type IS NULL OR slot_type IN ('hat','headwear'));

UPDATE public.shop_items SET slot_type = 'headwear', image_url = '/assets/avatar/hat/pirate-hat.svg',        layer_order = 5
WHERE id = 'pirate-hat'    AND (slot_type IS NULL OR slot_type IN ('hat','headwear'));

UPDATE public.shop_items SET slot_type = 'eyes',     image_url = '/assets/avatar/glasses/glasses-round.svg', layer_order = 7
WHERE id = 'glasses-round' AND (slot_type IS NULL OR slot_type IN ('glasses','eyes'));

-- Capes: must render BEHIND the body (z = -1), so slot = 'back'
UPDATE public.shop_items SET slot_type = 'back',     image_url = '/assets/avatar/shirt/cape-red.svg',        layer_order = -1
WHERE id = 'cape-red'      AND (slot_type IS NULL OR slot_type IN ('shirt','back'));

UPDATE public.shop_items SET slot_type = 'back',     image_url = '/assets/avatar/shirt/galaxy-cape.svg',     layer_order = -1
WHERE id = 'galaxy-cape'   AND (slot_type IS NULL OR slot_type IN ('shirt','back'));

UPDATE public.shop_items SET slot_type = 'torso',    image_url = '/assets/avatar/shirt/armor-knight.svg',    layer_order = 2
WHERE id = 'armor-knight'  AND (slot_type IS NULL OR slot_type IN ('shirt','torso'));

UPDATE public.shop_items SET slot_type = 'body',     image_url = '/assets/avatar/body/wings-dragon.svg',     layer_order = 1
WHERE id = 'wings-dragon'  AND (slot_type IS NULL OR slot_type IN ('body'));

UPDATE public.shop_items SET slot_type = 'face',     image_url = '/assets/avatar/mask/ninja-mask.svg',       layer_order = 6
WHERE id = 'ninja-mask'    AND (slot_type IS NULL OR slot_type IN ('mask','face'));

UPDATE public.shop_items SET slot_type = 'face',     image_url = '/assets/avatar/mask/hero-mask.svg',        layer_order = 6
WHERE id = 'hero-mask'     AND (slot_type IS NULL OR slot_type IN ('mask','face'));

UPDATE public.shop_items SET slot_type = 'face',     image_url = '/assets/avatar/mask/panda-mask.svg',       layer_order = 6
WHERE id = 'panda-mask'    AND (slot_type IS NULL OR slot_type IN ('mask','face'));

-- ── 3. Migrate profiles.equipped_slots — rename old JSONB keys ────────────────
-- Runs AFTER step 2 so cape detection via shop_items.slot_type is reliable.
-- Only touches profiles that still have old-style keys.

UPDATE public.profiles
SET equipped_slots = (
  equipped_slots
  -- Remove old-name keys
  - 'shirt' - 'hat' - 'glasses' - 'mask'
  -- shirt: item may now be 'back' (cape) or 'torso' (armor) — check DB
  || CASE
       WHEN equipped_slots ? 'shirt'
            AND EXISTS (
              SELECT 1 FROM public.shop_items
              WHERE id = equipped_slots->>'shirt' AND slot_type = 'back'
            )
       THEN jsonb_build_object('back', equipped_slots->'shirt')
       WHEN equipped_slots ? 'shirt'
       THEN jsonb_build_object('torso', equipped_slots->'shirt')
       ELSE '{}'::jsonb
     END
  || CASE WHEN equipped_slots ? 'hat'     THEN jsonb_build_object('headwear', equipped_slots->'hat')     ELSE '{}'::jsonb END
  || CASE WHEN equipped_slots ? 'glasses' THEN jsonb_build_object('eyes',     equipped_slots->'glasses') ELSE '{}'::jsonb END
  || CASE WHEN equipped_slots ? 'mask'    THEN jsonb_build_object('face',     equipped_slots->'mask')    ELSE '{}'::jsonb END
)
WHERE equipped_slots IS NOT NULL
  AND (
    equipped_slots ? 'shirt' OR equipped_slots ? 'hat' OR
    equipped_slots ? 'glasses' OR equipped_slots ? 'mask'
  );

-- ── 4. Replace equip_item RPC ─────────────────────────────────────────────────
-- Reads slot_type from shop_items, writes it as a key in profiles.equipped_slots.
-- Returns { slot } so the frontend can update its local state without a re-fetch.
-- DROP first: return type changes from VOID (shop_inventory) to JSON.
DROP FUNCTION IF EXISTS public.equip_item(TEXT);
CREATE OR REPLACE FUNCTION public.equip_item(p_item_id TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_slot    TEXT;
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

  SELECT slot_type INTO v_slot
  FROM public.shop_items
  WHERE id = p_item_id;

  IF v_slot IS NULL THEN
    RAISE EXCEPTION 'Item has no slot';
  END IF;

  UPDATE public.profiles
  SET equipped_slots = COALESCE(equipped_slots, '{}'::jsonb) || jsonb_build_object(v_slot, p_item_id)
  WHERE id = v_user_id;

  RETURN json_build_object('slot', v_slot);
END;
$$;

-- ── 5. Replace unequip_item RPC ───────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.unequip_item(TEXT);
CREATE OR REPLACE FUNCTION public.unequip_item(p_slot_type TEXT)
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

  UPDATE public.profiles
  SET equipped_slots = COALESCE(equipped_slots, '{}'::jsonb) - p_slot_type
  WHERE id = v_user_id;
END;
$$;

-- ── 6. Re-add slot_type constraint with semantic names ────────────────────────
ALTER TABLE public.shop_items
  ADD CONSTRAINT shop_items_slot_type_valid
  CHECK (slot_type IN ('back','body','torso','neck','hair','headwear','face','eyes','aura'))
  NOT VALID;
