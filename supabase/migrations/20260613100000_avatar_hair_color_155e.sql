-- Section 155E: Avatar Hair Color Identity.
-- To be applied to the live DB via Supabase MCP apply_migration as
-- "avatar_hair_color_155e" (supabase db push is blocked by pre-existing
-- migration-history drift — see Section 153). This file is the canonical record.
--
-- Changes:
--   1. validate_avatar_identity trigger: whitelist gains 'hair_color';
--      allowed values: black | dark_brown | brown | light_brown | blonde |
--      red | auburn | fantasy_blue. body_type / hairstyle / skin_tone rules
--      are UNCHANGED.
--   2. set_avatar_identity RPC: gains p_hair_color (4-arg overload). Merges
--      hair_color in isolation — body_type, hairstyle, skin_tone (and any future
--      field) are preserved. The 3-arg overload is DROPPED first to avoid
--      PostgREST candidate-ambiguity on named-arg calls.
--
-- No column/schema change (avatar_identity JSONB already exists). No backfill.
-- Existing profiles with an absent hair_color key remain valid via the Model B
-- runtime fallback (hairColorFor -> DEFAULT_HAIR_COLOR 'brown' in
-- js/avatar-layers.js).
--
-- Hair Color is IDENTITY ONLY: it is NOT an inventory item and NOT shop
-- equipment. It is written exclusively through this RPC.
--
-- Valid hair colors after 155E: black, dark_brown, brown, light_brown, blonde,
--                               red, auburn, fantasy_blue
-- Valid body types  (unchanged): male, female, neutral
-- Valid hairstyles  (unchanged): default, braid, short, curly, long, sidecut, buzzcut
-- Valid skin tones  (unchanged): medium, dark
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.set_avatar_identity(TEXT, TEXT, TEXT, TEXT);
--   Re-apply 20260613000000_avatar_skin_tone_152e.sql via apply_migration
--   (restores the 3-arg RPC + the pre-hair_color trigger whitelist).

-- ── 1. Update trigger function ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.validate_avatar_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.avatar_identity IS DISTINCT FROM OLD.avatar_identity THEN
    IF NEW.avatar_identity IS NULL OR jsonb_typeof(NEW.avatar_identity) <> 'object' THEN
      RAISE EXCEPTION 'avatar_identity must be a JSON object';
    END IF;

    IF NEW.avatar_identity <> '{}'::jsonb THEN
      -- Whitelist: only known v1 keys are permitted (hair_color added in 155E)
      IF EXISTS (
        SELECT 1 FROM jsonb_object_keys(NEW.avatar_identity) AS k
        WHERE k NOT IN ('v', 'body_type', 'chosen_at', 'hairstyle', 'skin_tone', 'hair_color')
      ) THEN
        RAISE EXCEPTION 'avatar_identity contains unknown keys';
      END IF;

      IF (NEW.avatar_identity->>'v') IS DISTINCT FROM '1' THEN
        RAISE EXCEPTION 'avatar_identity.v must be 1';
      END IF;

      IF (NEW.avatar_identity->>'body_type') IS NULL
         OR (NEW.avatar_identity->>'body_type') NOT IN ('male', 'female', 'neutral') THEN
        RAISE EXCEPTION 'avatar_identity.body_type must be male, female, or neutral';
      END IF;

      -- hairstyle optional (Model B). Only validated when present. 153A: 7-value.
      IF (NEW.avatar_identity ? 'hairstyle')
         AND (NEW.avatar_identity->>'hairstyle') NOT IN
             ('default', 'braid', 'short', 'curly', 'long', 'sidecut', 'buzzcut') THEN
        RAISE EXCEPTION 'avatar_identity.hairstyle must be default, braid, short, curly, long, sidecut, or buzzcut';
      END IF;

      -- skin_tone optional (Model B). Only validated when present. 152E: 2-value.
      IF (NEW.avatar_identity ? 'skin_tone')
         AND (NEW.avatar_identity->>'skin_tone') NOT IN ('medium', 'dark') THEN
        RAISE EXCEPTION 'avatar_identity.skin_tone must be medium or dark';
      END IF;

      -- 155E: hair_color optional (Model B: absent = runtime default 'brown').
      -- Only validated when the key is present. 8-value whitelist.
      IF (NEW.avatar_identity ? 'hair_color')
         AND (NEW.avatar_identity->>'hair_color') NOT IN
             ('black', 'dark_brown', 'brown', 'light_brown', 'blonde', 'red', 'auburn', 'fantasy_blue') THEN
        RAISE EXCEPTION 'avatar_identity.hair_color must be one of black, dark_brown, brown, light_brown, blonde, red, auburn, fantasy_blue';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
-- Trigger on profiles is already in place — REPLACE FUNCTION is sufficient.

-- ── 2. Replace RPC with 4-arg (body_type, hairstyle, skin_tone, hair_color) ──────
-- Drop the 3-arg overload first so named-arg calls resolve unambiguously.
DROP FUNCTION IF EXISTS public.set_avatar_identity(TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.set_avatar_identity(
  p_body_type  TEXT DEFAULT NULL,
  p_hairstyle  TEXT DEFAULT NULL,
  p_skin_tone  TEXT DEFAULT NULL,
  p_hair_color TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current  jsonb;
  v_identity jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_body_type IS NULL AND p_hairstyle IS NULL AND p_skin_tone IS NULL AND p_hair_color IS NULL THEN
    RAISE EXCEPTION 'at least one of p_body_type, p_hairstyle, p_skin_tone, or p_hair_color must be provided';
  END IF;

  IF p_body_type IS NOT NULL AND p_body_type NOT IN ('male', 'female', 'neutral') THEN
    RAISE EXCEPTION 'invalid body_type: %', p_body_type;
  END IF;

  IF p_hairstyle IS NOT NULL AND p_hairstyle NOT IN
     ('default', 'braid', 'short', 'curly', 'long', 'sidecut', 'buzzcut') THEN
    RAISE EXCEPTION 'invalid hairstyle: %', p_hairstyle;
  END IF;

  IF p_skin_tone IS NOT NULL AND p_skin_tone NOT IN ('medium', 'dark') THEN
    RAISE EXCEPTION 'invalid skin_tone: %', p_skin_tone;
  END IF;

  -- 155E: hair_color whitelist
  IF p_hair_color IS NOT NULL AND p_hair_color NOT IN
     ('black', 'dark_brown', 'brown', 'light_brown', 'blonde', 'red', 'auburn', 'fantasy_blue') THEN
    RAISE EXCEPTION 'invalid hair_color: %', p_hair_color;
  END IF;

  SELECT avatar_identity INTO v_current
  FROM public.profiles
  WHERE id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found';
  END IF;

  -- Seed from current; if reset state '{}', start from a neutral v1 base.
  IF v_current = '{}'::jsonb OR v_current IS NULL THEN
    v_identity := jsonb_build_object('v', 1, 'body_type', 'neutral');
  ELSE
    v_identity := v_current;
  END IF;

  -- Always stamp v=1 and chosen_at on any identity change.
  v_identity := v_identity || jsonb_build_object('v', 1, 'chosen_at', now());

  -- Merge only the fields explicitly provided — others (incl. future fields) survive.
  IF p_body_type IS NOT NULL THEN
    v_identity := v_identity || jsonb_build_object('body_type', p_body_type);
  END IF;

  IF p_hairstyle IS NOT NULL THEN
    v_identity := v_identity || jsonb_build_object('hairstyle', p_hairstyle);
  END IF;

  IF p_skin_tone IS NOT NULL THEN
    v_identity := v_identity || jsonb_build_object('skin_tone', p_skin_tone);
  END IF;

  IF p_hair_color IS NOT NULL THEN
    v_identity := v_identity || jsonb_build_object('hair_color', p_hair_color);
  END IF;

  UPDATE public.profiles
  SET avatar_identity = v_identity
  WHERE id = auth.uid();

  RETURN v_identity;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_avatar_identity(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_avatar_identity(TEXT, TEXT, TEXT, TEXT) TO authenticated;
