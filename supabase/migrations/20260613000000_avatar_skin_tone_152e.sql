-- Section 152E: Avatar Skin Tone Variants.
-- Applied to live DB 2026-06-13 via Supabase MCP apply_migration as
-- "avatar_skin_tone_152e" (supabase db push blocked by pre-existing drift —
-- see Section 153). This file is the canonical documentation of what was applied.
--
-- Changes:
--   1. validate_avatar_identity trigger: whitelist gains 'skin_tone' key;
--      allowed values 'medium' | 'dark'. body_type/hairstyle rules unchanged.
--   2. set_avatar_identity RPC: gains p_skin_tone param (3-arg overload). Merges
--      skin_tone in isolation — body_type and hairstyle (and future fields) are
--      preserved. The old 2-arg overload is DROPPED to avoid PostgREST
--      candidate-ambiguity when calling with named args.
--
-- No schema changes. No backfill. Existing profiles with absent skin_tone key
-- remain valid via Model B runtime fallback (skinToneFor → "medium").
--
-- Valid skin tones after 152E: 'medium' (default), 'dark'
-- Valid body types:  'male', 'female', 'neutral'                       (unchanged)
-- Valid hairstyles:  'default','braid','short','curly','long','sidecut','buzzcut' (unchanged)
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.set_avatar_identity(TEXT, TEXT, TEXT);
--   Re-apply 20260612030000_avatar_hairstyle_expansion_153a.sql via apply_migration
--   (restores the 2-arg RPC + the pre-skin_tone trigger whitelist).

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
      -- Whitelist: only known v1 keys are permitted
      IF EXISTS (
        SELECT 1 FROM jsonb_object_keys(NEW.avatar_identity) AS k
        WHERE k NOT IN ('v', 'body_type', 'chosen_at', 'hairstyle', 'skin_tone')
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

      -- hairstyle is optional (Model B: absent = use runtime default).
      -- Only validated when the key is present. 153A: 7-value whitelist.
      IF (NEW.avatar_identity ? 'hairstyle')
         AND (NEW.avatar_identity->>'hairstyle') NOT IN
             ('default', 'braid', 'short', 'curly', 'long', 'sidecut', 'buzzcut') THEN
        RAISE EXCEPTION 'avatar_identity.hairstyle must be default, braid, short, curly, long, sidecut, or buzzcut';
      END IF;

      -- skin_tone is optional (Model B: absent = use runtime default 'medium').
      -- Only validated when the key is present. 152E: 2-value whitelist.
      IF (NEW.avatar_identity ? 'skin_tone')
         AND (NEW.avatar_identity->>'skin_tone') NOT IN ('medium', 'dark') THEN
        RAISE EXCEPTION 'avatar_identity.skin_tone must be medium or dark';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
-- Trigger on profiles is already in place — REPLACE FUNCTION is sufficient.

-- ── 2. Replace RPC with 3-arg (body_type, hairstyle, skin_tone) ─────────────────
-- Drop the 2-arg overload first so named-arg calls resolve unambiguously.
DROP FUNCTION IF EXISTS public.set_avatar_identity(TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.set_avatar_identity(
  p_body_type TEXT DEFAULT NULL,
  p_hairstyle TEXT DEFAULT NULL,
  p_skin_tone TEXT DEFAULT NULL
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

  IF p_body_type IS NULL AND p_hairstyle IS NULL AND p_skin_tone IS NULL THEN
    RAISE EXCEPTION 'at least one of p_body_type, p_hairstyle, or p_skin_tone must be provided';
  END IF;

  IF p_body_type IS NOT NULL AND p_body_type NOT IN ('male', 'female', 'neutral') THEN
    RAISE EXCEPTION 'invalid body_type: %', p_body_type;
  END IF;

  -- 153A: 7-value hairstyle whitelist
  IF p_hairstyle IS NOT NULL AND p_hairstyle NOT IN
     ('default', 'braid', 'short', 'curly', 'long', 'sidecut', 'buzzcut') THEN
    RAISE EXCEPTION 'invalid hairstyle: %', p_hairstyle;
  END IF;

  -- 152E: 2-value skin_tone whitelist
  IF p_skin_tone IS NOT NULL AND p_skin_tone NOT IN ('medium', 'dark') THEN
    RAISE EXCEPTION 'invalid skin_tone: %', p_skin_tone;
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

  UPDATE public.profiles
  SET avatar_identity = v_identity
  WHERE id = auth.uid();

  RETURN v_identity;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_avatar_identity(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_avatar_identity(TEXT, TEXT, TEXT) TO authenticated;
