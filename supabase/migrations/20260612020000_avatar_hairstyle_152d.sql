-- Section 152D: Hairstyle Variants.
-- Applied to live DB 2026-06-12 via Supabase MCP apply_migration as
-- "avatar_hairstyle_152d" (supabase db push blocked by pre-existing drift).
--
-- Changes:
--   1. validate_avatar_identity trigger: whitelist extended with 'hairstyle';
--      validation added for hairstyle values (only if key is present).
--      Model B: absence of 'hairstyle' key is valid — runtime fallback
--      (identity.hairstyle ?? "default") handles absent key.
--   2. set_avatar_identity RPC: old single-TEXT signature dropped and replaced
--      with merge semantics (p_body_type TEXT DEFAULT NULL, p_hairstyle TEXT
--      DEFAULT NULL). Preserves all existing identity fields; only overwrites
--      the fields explicitly provided. Stamping chosen_at on every call.
--
-- No backfill: existing profiles without 'hairstyle' are valid and render the
-- default hairstyle via runtime fallback in hairSrcFor(identity).
--
-- Valid hairstyles: 'default', 'braid', 'short'
-- Valid body types: 'male', 'female', 'neutral'  (unchanged from 152A)
--
-- Rollback:
--   Restore validate_avatar_identity to its 152A version (remove hairstyle
--   from whitelist and remove hairstyle validation block).
--   DROP FUNCTION IF EXISTS public.set_avatar_identity(TEXT, TEXT);
--   Restore original set_avatar_identity(TEXT) from migration 20260612010000.

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
      -- Whitelist: only known v1 keys are permitted (hairstyle added in 152D)
      IF EXISTS (
        SELECT 1 FROM jsonb_object_keys(NEW.avatar_identity) AS k
        WHERE k NOT IN ('v', 'body_type', 'chosen_at', 'hairstyle')
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
      -- Only validated when the key is present.
      IF (NEW.avatar_identity ? 'hairstyle')
         AND (NEW.avatar_identity->>'hairstyle') NOT IN ('default', 'braid', 'short') THEN
        RAISE EXCEPTION 'avatar_identity.hairstyle must be default, braid, or short';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
-- Trigger on profiles is already in place — REPLACE FUNCTION is sufficient.

-- ── 2. Drop old single-parameter RPC (replace-all semantics) ───────────────────
DROP FUNCTION IF EXISTS public.set_avatar_identity(TEXT);

-- ── 3. New RPC: merge semantics ─────────────────────────────────────────────────
-- Reads current avatar_identity, merges only the provided fields, preserves
-- all others. A body-type change cannot wipe a stored hairstyle, and vice versa.
CREATE OR REPLACE FUNCTION public.set_avatar_identity(
  p_body_type TEXT DEFAULT NULL,
  p_hairstyle TEXT DEFAULT NULL
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

  IF p_body_type IS NULL AND p_hairstyle IS NULL THEN
    RAISE EXCEPTION 'at least one of p_body_type or p_hairstyle must be provided';
  END IF;

  IF p_body_type IS NOT NULL AND p_body_type NOT IN ('male', 'female', 'neutral') THEN
    RAISE EXCEPTION 'invalid body_type: %', p_body_type;
  END IF;

  IF p_hairstyle IS NOT NULL AND p_hairstyle NOT IN ('default', 'braid', 'short') THEN
    RAISE EXCEPTION 'invalid hairstyle: %', p_hairstyle;
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

  -- Merge only the fields explicitly provided.
  IF p_body_type IS NOT NULL THEN
    v_identity := v_identity || jsonb_build_object('body_type', p_body_type);
  END IF;

  IF p_hairstyle IS NOT NULL THEN
    v_identity := v_identity || jsonb_build_object('hairstyle', p_hairstyle);
  END IF;

  UPDATE public.profiles
  SET avatar_identity = v_identity
  WHERE id = auth.uid();

  RETURN v_identity;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_avatar_identity(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_avatar_identity(TEXT, TEXT) TO authenticated;
