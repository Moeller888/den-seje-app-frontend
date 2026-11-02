# grant_achievement_rewards (D-292): anvendelse og tilbagerulning

Gælder migrationen `supabase/migrations/20261101170000_achievement_reward_exactly_once.sql`
([D-292](../decisions/D-292.md)).

**Status:** IKKE ANVENDT I PRODUKTIONEN. Både anvendelse og tilbagerulning kræver ejerens særskilte
godkendelse (D-110, [migration-workflow-policy.md](../migration-workflow-policy.md)).
`supabase db push` er forbudt.

## 1. Før anvendelse (kun læsning)

Hvert punkt skal holde. Ellers stoppes der.

1. **Funktionen er uændret.** `grant_achievement_rewards(text[])` har `md5(prosrc)`
   `63b8347dd4d72d40ced43e8728b5ab87`, `LANGUAGE plpgsql`, `SECURITY DEFINER`, `search_path=public`,
   ejer `postgres`, `RETURNS jsonb` og ACL
   `{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}`.
   Kontrolleret read-only 2026-11-01. Migrationens vagt afbryder selv, hvis kroppen ikke er en af de
   reviewede.
2. **Tabellen er uændret.** `user_achievements` har PK `(student_id, achievement_id)`,
   `reward_claimed boolean NOT NULL DEFAULT false` og `reward_claimed_at timestamptz`. RLS er slået
   til, og den eneste policy er `ua_select_own` (SELECT, `{authenticated}`).
3. **Ingen kollision.** `list_migrations` viser ingen version med samme tidsstempel eller navn.
4. **Testene er grønne på commit'en.**
   - `tests/unit/achievement-reward-exactly-once-migration-run.test.mjs` (PGlite).
   - `tests/unit/achievement-reward-concurrency.test.mjs` (rigtig PostgreSQL 17 i CI's unit-job, som
     kræver serveren).

## 2. Anvendelse

- `apply_migration` med filens indhold ordret fra den godkendte commit på `main`, navn
  `achievement_reward_exactly_once`.
- Ét kald. Ingen genkørsel, før `list_migrations` og kataloget er kontrolleret.

## 3. Efter anvendelse (kun læsning)

1. `md5(prosrc)` er `fc8d729f8b0166815fe2647805ce2e60`; `SECURITY DEFINER`, `search_path=public`,
   ejer og `RETURNS jsonb` er uændrede.
2. ACL er `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}` — `PUBLIC` og
   `anon` er fjernet.
3. Ingen rækker er ændret af migrationen: antallet af rækker i `user_achievements` med
   `reward_claimed = false` er det samme som før (2026-11-01: 4 med en coins-belønning).
4. Hubben og achievementsiden viser stadig achievements og nye belønninger. Kontrolleres med
   testeleven fra Production Smoke, ikke med rigtige elevkonti.

## 4. Tilbagerulning

Tilbagerulningen genskaber produktionens præcise krop (`md5(prosrc)` `63b8347d…`) og produktionens
EXECUTE-rettigheder. Den ændrer ingen rækker.

```sql
-- ROLLBACK D-292 — restores production's exact body (md5(prosrc) 63b8347dd4d72d40ced43e8728b5ab87)
-- and production's EXECUTE grants.
CREATE OR REPLACE FUNCTION public.grant_achievement_rewards(p_achievement_ids text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid             UUID    := auth.uid();
  v_ach             RECORD;
  v_already_claimed BOOLEAN;
  v_grants          JSONB   := '[]'::JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_achievement_ids IS NULL OR array_length(p_achievement_ids, 1) IS NULL THEN
    RETURN '[]'::JSONB;
  END IF;

  FOR v_ach IN
    SELECT a.id, a.reward_type, a.reward_value, a.reward_amount
    FROM   public.achievements a
    WHERE  a.id = ANY(p_achievement_ids)
      AND  a.reward_type IS NOT NULL
  LOOP
    SELECT reward_claimed
    INTO   v_already_claimed
    FROM   public.user_achievements
    WHERE  student_id     = v_uid
      AND  achievement_id = v_ach.id;

    IF NOT FOUND OR v_already_claimed THEN
      CONTINUE;
    END IF;

    IF v_ach.reward_type = 'coins' THEN
      UPDATE public.student_progress
      SET    coins = COALESCE(coins, 0) + v_ach.reward_amount
      WHERE  student_id = v_uid;

    ELSIF v_ach.reward_type = 'theme' THEN
      INSERT INTO public.user_themes (user_id, theme_id)
      VALUES (v_uid, v_ach.reward_value)
      ON CONFLICT (user_id, theme_id) DO NOTHING;

    ELSIF v_ach.reward_type = 'item' THEN
      INSERT INTO public.user_items (user_id, item_id)
      VALUES (v_uid, v_ach.reward_value)
      ON CONFLICT (user_id, item_id) DO NOTHING;

    ELSIF v_ach.reward_type = 'title' THEN
      INSERT INTO public.user_titles (user_id, title_id)
      VALUES (v_uid, v_ach.reward_value)
      ON CONFLICT (user_id, title_id) DO NOTHING;
    END IF;

    UPDATE public.user_achievements
    SET    reward_claimed    = true,
           reward_claimed_at = now()
    WHERE  student_id     = v_uid
      AND  achievement_id = v_ach.id;

    v_grants := v_grants || jsonb_build_array(jsonb_build_object(
      'achievement_id', v_ach.id,
      'reward_type',    v_ach.reward_type,
      'reward_value',   v_ach.reward_value,
      'reward_amount',  v_ach.reward_amount
    ));
  END LOOP;

  RETURN v_grants;
END;
$$;
GRANT EXECUTE ON FUNCTION public.grant_achievement_rewards(text[]) TO PUBLIC, anon, authenticated, service_role;
```

**Efterkontrol:** `md5(prosrc)` er igen `63b8347d…`, og ACL er som under §1.

## 5. Hvad tilbagerulningen ikke gør

Den genindfører kapløbsfejlen. Den bør kun bruges, hvis migrationen selv giver fejl, fx hvis
achievement-belønninger holder op med at blive udbetalt.
