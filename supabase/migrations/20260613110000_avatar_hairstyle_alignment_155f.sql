-- Section 155F: Avatar Hairstyle Identity Alignment.
-- To be applied to the live DB via Supabase MCP apply_migration as
-- "avatar_hairstyle_alignment_155f" (db push blocked by drift — see Section 153).
-- APPLY ORDER: after 155E (20260613100000_avatar_hair_color_155e). This file is
-- self-sufficient: it carries the 155E hair_color rules forward and also drops
-- the legacy 3-arg RPC overload, so it is safe to apply even if 155E has not run.
--
-- Purpose: align the hairstyle identity model so the C2 render path can accept
-- the new C2 hairstyle keys (Section 155D) WITHOUT breaking existing profiles.
--
-- Strategy: UNION whitelist + runtime alias (Model B, NO backfill).
--   The whitelist becomes the union of legacy and C2 keys (11 values). Existing
--   profiles keep their legacy hairstyle value (still valid). New identities may
--   use the C2 keys. The frontend C2 resolver (hairSrcForC2 in avatar-layers.js)
--   aliases every key — legacy or C2 — to a valid C2 asset. The legacy resolver
--   (hairSrcFor) and the legacy assets are UNCHANGED and still drive the current
--   live render.
--
-- Hairstyle whitelist after 155F (union, 11):
--   legacy: default, braid, short, curly, long, sidecut, buzzcut
--   C2:     short, tousled, curly, long, ponytail, buzz, afro
--   (short/curly/long are shared names; tousled/ponytail/buzz/afro are new)
-- Body types  (unchanged): male, female, neutral
-- Skin tones  (unchanged): medium, dark
-- Hair colors (from 155E):  black, dark_brown, brown, light_brown, blonde, red,
--                           auburn, fantasy_blue
--
-- No schema change. No backfill. Backward-compatible: every previously valid
-- hairstyle value remains valid.
--
-- Rollback:
--   Re-apply 20260613100000_avatar_hair_color_155e.sql via apply_migration
--   (restores the pre-155F hairstyle whitelist; hair_color support is retained).

-- ── 1. Update trigger function (carries 155E hair_color forward) ────────────────
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

      -- 155F: hairstyle whitelist = union (legacy ∪ C2), 11 values.
      IF (NEW.avatar_identity ? 'hairstyle')
         AND (NEW.avatar_identity->>'hairstyle') NOT IN
             ('default', 'braid', 'short', 'curly', 'long', 'sidecut', 'buzzcut',
              'tousled', 'ponytail', 'buzz', 'afro') THEN
        RAISE EXCEPTION 'avatar_identity.hairstyle must be one of default, braid, short, curly, long, sidecut, buzzcut, tousled, ponytail, buzz, afro';
      END IF;

      -- skin_tone (152E) unchanged
      IF (NEW.avatar_identity ? 'skin_tone')
         AND (NEW.avatar_identity->>'skin_tone') NOT IN ('medium', 'dark') THEN
        RAISE EXCEPTION 'avatar_identity.skin_tone must be medium or dark';
      END IF;

      -- hair_color (155E) unchanged
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

-- ── 2. RPC (4-arg). Drop legacy 3-arg first (idempotent / 155E-independent) ─────
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

  -- 155F: union hairstyle whitelist (11)
  IF p_hairstyle IS NOT NULL AND p_hairstyle NOT IN
     ('default', 'braid', 'short', 'curly', 'long', 'sidecut', 'buzzcut',
      'tousled', 'ponytail', 'buzz', 'afro') THEN
    RAISE EXCEPTION 'invalid hairstyle: %', p_hairstyle;
  END IF;

  IF p_skin_tone IS NOT NULL AND p_skin_tone NOT IN ('medium', 'dark') THEN
    RAISE EXCEPTION 'invalid skin_tone: %', p_skin_tone;
  END IF;

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

  IF v_current = '{}'::jsonb OR v_current IS NULL THEN
    v_identity := jsonb_build_object('v', 1, 'body_type', 'neutral');
  ELSE
    v_identity := v_current;
  END IF;

  v_identity := v_identity || jsonb_build_object('v', 1, 'chosen_at', now());

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
