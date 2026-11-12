-- D-373: the Northstar figure's hairstyle on the account.
--
-- Adds avatar_identity.northstar.hair, one of 'standard', 'nh4-grey', 'nh4-brown' (js/avatar-layers.js
-- NORTHSTAR_HAIRS). It is saved with the outfit through the existing set_avatar_northstar, which
-- writes the whole northstar object and is unchanged.
--
--   validate_avatar_identity: 'hair' joins the northstar key whitelist, and its value must be one of
--   the three hairstyles. Every other rule is unchanged (copied from 20261106120000).
--
-- Behind NORTHSTAR_HAIR_CHOICE = false: until the flag is turned on nothing writes the key; a choice
-- without it keeps the standard hair. NOT applied in production (D-110: apply_migration only with the
-- owner's separate authorisation for this file).
--
-- ROLLBACK: restore validate_avatar_identity from 20261106120000. Rows holding a hair key must have it
-- removed first, or any later change to their avatar_identity is refused by the restored whitelist:
--   UPDATE public.profiles SET avatar_identity = jsonb_set(avatar_identity, '{northstar}', (avatar_identity->'northstar') - 'hair')
--   WHERE avatar_identity->'northstar' ? 'hair';

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
          WHERE e.key NOT IN ('outfit', 'tee', 'pants', 'shoes', 'top', 'hair')
             OR jsonb_typeof(e.value) <> 'string'
             OR (e.value #>> '{}') !~ '^[A-Za-z0-9-]{1,40}$'
        ) THEN
          RAISE EXCEPTION 'avatar_identity.northstar holds only outfit, tee, pants, shoes, top, hair as short item ids';
        END IF;

        IF ((NEW.avatar_identity->'northstar') ? 'hair')
           AND (NEW.avatar_identity->'northstar'->>'hair') NOT IN ('standard', 'nh4-grey', 'nh4-brown') THEN
          RAISE EXCEPTION 'avatar_identity.northstar.hair must be one of standard, nh4-grey, nh4-brown';
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
