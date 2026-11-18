-- D-381: the nape locks (D-379 NH-5C, V2 excepted by D-380) as a hairstyle on the account.
--
-- Extends avatar_identity.northstar.hair with 'nh5c-grey' and 'nh5c-brown' (js/avatar-layers.js
-- NORTHSTAR_HAIRS_NH5C). Saved with the outfit through the existing set_avatar_northstar, which is unchanged.
--
--   validate_avatar_identity: the hair value may also be one of the two nape-lock ids. Every other rule is
--   unchanged: the body is copied verbatim from 20261115090000 (D-377), which is also production's
--   definition today (pg_get_functiondef md5 b746b99c30198f5208b7fbba44e324ed, read 2026-11-18); only the
--   hair list and its message grow.
--
-- Behind NORTHSTAR_HAIR_NH5C = false: the two cards are hidden, and nothing writes the values until the
-- flag is turned on or a browser opts in for testing. NOT applied in production (D-110: apply_migration only
-- with the owner's separate authorisation for this file).
--
-- ROLLBACK: restore validate_avatar_identity from 20261115090000. Rows holding nape locks must have them
-- changed first, or any later change to their avatar_identity is refused by the restored list:
--   UPDATE public.profiles SET avatar_identity = jsonb_set(avatar_identity, '{northstar,hair}', '"standard"')
--   WHERE avatar_identity->'northstar'->>'hair' IN ('nh5c-grey', 'nh5c-brown');

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
           AND (NEW.avatar_identity->'northstar'->>'hair') NOT IN ('standard', 'nh4-grey', 'nh4-brown', 'nh5b-grey', 'nh5b-brown', 'nh5c-grey', 'nh5c-brown') THEN
          RAISE EXCEPTION 'avatar_identity.northstar.hair must be one of standard, nh4-grey, nh4-brown, nh5b-grey, nh5b-brown, nh5c-grey, nh5c-brown';
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
