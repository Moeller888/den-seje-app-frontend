-- Section 152A: Avatar Identity Foundation.
-- profiles.avatar_identity JSONB, shape v1:
--   { "v": 1, "body_type": "male"|"female"|"neutral", "chosen_at": timestamptz|null }
--   '{}' = never set (new students) -> renders as neutral.
-- Shape enforced by BEFORE UPDATE trigger (covers ALL write paths incl. direct
-- PostgREST writes under profiles_self_update). Sanctioned write path is the
-- set_avatar_identity RPC, which stamps chosen_at.
-- avatar_gender is retained and deprecated (still drives the CSS tint).

-- 1. Column ---------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_identity JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 2. Backfill (idempotent) --------------------------------------------------
-- chosen_at NULL = never explicitly chosen -> 152C shows prefilled prompt.
UPDATE public.profiles
SET avatar_identity = jsonb_build_object(
      'v', 1,
      'body_type', CASE avatar_gender
                     WHEN 'boy'  THEN 'male'
                     WHEN 'girl' THEN 'female'
                     ELSE 'neutral'
                   END,
      'chosen_at', NULL)
WHERE avatar_identity = '{}'::jsonb;

-- 3. Shape enforcement trigger ---------------------------------------------
-- Fires only when the column is in the SET clause; IS DISTINCT FROM guards
-- no-op rewrites. Fires for every role (service_role included) — the shape
-- is invariant. '{}' stays allowed (reset state).
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
        WHERE k NOT IN ('v', 'body_type', 'chosen_at')
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
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_avatar_identity ON public.profiles;
CREATE TRIGGER validate_avatar_identity
  BEFORE UPDATE OF avatar_identity ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_avatar_identity();

-- 4. Sanctioned write path ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_avatar_identity(p_body_type TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_identity jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_body_type IS NULL OR p_body_type NOT IN ('male', 'female', 'neutral') THEN
    RAISE EXCEPTION 'invalid body_type: %', COALESCE(p_body_type, '(null)');
  END IF;

  v_identity := jsonb_build_object(
    'v', 1,
    'body_type', p_body_type,
    'chosen_at', now());

  UPDATE public.profiles
  SET avatar_identity = v_identity
  WHERE id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found';
  END IF;

  RETURN v_identity;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_avatar_identity(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_avatar_identity(TEXT) TO authenticated;;
