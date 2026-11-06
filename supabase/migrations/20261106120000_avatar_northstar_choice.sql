-- D-357: the pupil's Northstar wardrobe choice on the account.
--
-- Adds avatar_identity.northstar, an optional object { outfit, tee, pants, shoes, top } of item ids.
-- Before this the choice lived only in the browser, so pupils sharing a school computer saw each
-- other's outfit and a pupil lost it on another device.
--
--   1. validate_avatar_identity: 'northstar' joins the key whitelist; its shape is validated.
--      Every other rule is unchanged.
--   2. set_avatar_northstar(p_choice jsonb): the only writer. Touches the caller's own row and only
--      this key. An empty object removes the choice.
--
-- The trigger checks shape, not item ids: js/avatar-layers.js ignores any id it does not know, and
-- its approved combination lists decide what is drawn, so a new item needs no migration.
-- chosen_at is deliberately NOT set: it drives the first-login identity prompt (app.js), and
-- choosing clothes is not choosing an identity.
--
-- ROLLBACK: DROP FUNCTION public.set_avatar_northstar(jsonb); then restore the previous
-- validate_avatar_identity. Rows holding a northstar key must have it removed first, or any later
-- change to their avatar_identity is refused by the restored whitelist:
--   UPDATE public.profiles SET avatar_identity = avatar_identity - 'northstar'
--   WHERE avatar_identity ? 'northstar';

CREATE OR REPLACE FUNCTION public.validate_avatar_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.avatar_identity IS DISTINCT FROM OLD.avatar_identity THEN
    IF NEW.avatar_identity IS NULL OR jsonb_typeof(NEW.avatar_identity) <> 'object' THEN
      RAISE EXCEPTION 'avatar_identity must be a JSON object';
    END IF;

    IF NEW.avatar_identity <> '{}'::jsonb THEN
      IF EXISTS (
        SELECT 1 FROM jsonb_object_keys(NEW.avatar_identity) AS k
        WHERE k NOT IN ('v', 'body_type', 'chosen_at', 'hairstyle', 'skin_tone', 'hair_color', 'northstar')
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

      IF (NEW.avatar_identity ? 'hairstyle')
         AND (NEW.avatar_identity->>'hairstyle') NOT IN
             ('default', 'braid', 'short', 'curly', 'long', 'sidecut', 'buzzcut',
              'tousled', 'ponytail', 'buzz', 'afro') THEN
        RAISE EXCEPTION 'avatar_identity.hairstyle must be one of default, braid, short, curly, long, sidecut, buzzcut, tousled, ponytail, buzz, afro';
      END IF;

      IF (NEW.avatar_identity ? 'skin_tone')
         AND (NEW.avatar_identity->>'skin_tone') NOT IN ('medium', 'dark') THEN
        RAISE EXCEPTION 'avatar_identity.skin_tone must be medium or dark';
      END IF;

      IF (NEW.avatar_identity ? 'hair_color')
         AND (NEW.avatar_identity->>'hair_color') NOT IN
             ('black', 'dark_brown', 'brown', 'light_brown', 'blonde', 'red', 'auburn', 'fantasy_blue') THEN
        RAISE EXCEPTION 'avatar_identity.hair_color must be one of black, dark_brown, brown, light_brown, blonde, red, auburn, fantasy_blue';
      END IF;

      IF (NEW.avatar_identity ? 'northstar') THEN
        IF jsonb_typeof(NEW.avatar_identity->'northstar') <> 'object' THEN
          RAISE EXCEPTION 'avatar_identity.northstar must be a JSON object';
        END IF;

        IF EXISTS (
          SELECT 1 FROM jsonb_each(NEW.avatar_identity->'northstar') AS e
          WHERE e.key NOT IN ('outfit', 'tee', 'pants', 'shoes', 'top')
             OR jsonb_typeof(e.value) <> 'string'
             OR (e.value #>> '{}') !~ '^[A-Za-z0-9-]{1,40}$'
        ) THEN
          RAISE EXCEPTION 'avatar_identity.northstar holds only outfit, tee, pants, shoes, top as short item ids';
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_avatar_northstar(p_choice jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current  jsonb;
  v_identity jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_choice IS NULL OR jsonb_typeof(p_choice) <> 'object' THEN
    RAISE EXCEPTION 'p_choice must be a JSON object';
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

  IF p_choice = '{}'::jsonb THEN
    v_identity := v_identity - 'northstar';
  ELSE
    v_identity := v_identity || jsonb_build_object('northstar', p_choice);
  END IF;

  UPDATE public.profiles
  SET avatar_identity = v_identity
  WHERE id = auth.uid();

  RETURN v_identity;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_avatar_northstar(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_avatar_northstar(jsonb) TO authenticated, service_role;
