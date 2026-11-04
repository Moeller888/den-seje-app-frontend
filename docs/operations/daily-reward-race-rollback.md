# claim_daily_reward (D-284): anvendelse og tilbagerulning

Gælder migrationen `supabase/migrations/20261031230000_claim_daily_reward_exactly_once.sql`
([D-284](../decisions/D-284.md)).

**Status:** IKKE ANVENDT I PRODUKTIONEN. Både anvendelse og tilbagerulning kræver ejerens særskilte
godkendelse (D-110, [migration-workflow-policy.md](../migration-workflow-policy.md)).
`supabase db push` er forbudt.

## 1. Før anvendelse (kun læsning)

Hvert punkt skal holde. Ellers stoppes der.

1. **Funktionen er uændret.** `claim_daily_reward()` har `md5(prosrc)`
   `80273d5dc396679cd66376fd56ca3ff3`, `LANGUAGE plpgsql`, `SECURITY DEFINER`, `search_path=public`,
   `RETURNS json` og ACL
   `{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}`.
   Kontrolleret read-only 2026-10-31. Migrationens vagt afbryder selv, hvis kroppen ikke er en af de
   reviewede.
2. **Tabellen er uændret.** `daily_login_rewards` har kolonnerne `student_id uuid` (PK, FK til
   `profiles`), `last_claimed_date date` og `total_claims integer DEFAULT 0`. RLS er slået til, og
   den eneste policy er `dlr_select_own` (SELECT, `{authenticated}`).
3. **Ingen kollision.** `list_migrations` viser ingen version med samme tidsstempel eller navn.
4. **Testene er grønne på commit'en.**
   - `tests/unit/claim-daily-reward-exactly-once-migration-run.test.mjs` (PGlite).
   - `tests/unit/claim-daily-reward-concurrency.test.mjs` (rigtig PostgreSQL 17 i CI's unit-job, som
     kræver serveren).

## 2. Anvendelse

- `apply_migration` med filens indhold ordret fra den godkendte commit, navn
  `claim_daily_reward_exactly_once`.
- Ét kald. Ingen genkørsel, før `list_migrations` og kataloget er kontrolleret.

## 3. Efter anvendelse (kun læsning)

1. `md5(prosrc)` er `ea8efbadf880eaf5ac2767716976a537`, og ACL, `search_path`, `SECURITY DEFINER` og
   `RETURNS json` er uændrede.
2. Hubben viser stadig dagens belønning. Kontrolleres med testeleven fra Production Smoke, ikke med
   rigtige elevkonti.
3. Fra dagen efter anvendelsen gælder: `total_claims` stiger med højst 1 pr. elev pr. dag.

## 4. Tilbagerulning

Tilbagerulningen genskaber produktionens præcise krop (`md5(prosrc)` `80273d5d…`). `CREATE OR
REPLACE` bevarer ejer og ACL. Den ændrer ingen rækker.

Rækker, som den nye funktion har oprettet med `last_claimed_date = NULL` og `total_claims = 0`, er
ufarlige for den gamle funktion. Den behandler dem som "ikke indløst i dag", ligesom en manglende
række.

```sql
-- ROLLBACK D-284 — restores production's exact body (md5(prosrc) 80273d5dc396679cd66376fd56ca3ff3).
CREATE OR REPLACE FUNCTION public.claim_daily_reward()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id      UUID    := auth.uid();
  v_today        DATE    := CURRENT_DATE;
  v_last_claimed DATE;
  v_streak       INTEGER;
  v_coins        INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT last_claimed_date
  INTO   v_last_claimed
  FROM   public.daily_login_rewards
  WHERE  student_id = v_user_id;

  IF v_last_claimed = v_today THEN
    RETURN json_build_object('status', 'already_claimed');
  END IF;

  SELECT COALESCE(current_streak, 0)
  INTO   v_streak
  FROM   public.student_progress
  WHERE  student_id = v_user_id;

  IF NOT FOUND THEN
    v_streak := 0;
  END IF;

  v_coins := LEAST(150, 25 + v_streak * 15);

  UPDATE public.student_progress
  SET    coins = COALESCE(coins, 0) + v_coins
  WHERE  student_id = v_user_id;

  INSERT INTO public.daily_login_rewards (student_id, last_claimed_date, total_claims)
  VALUES (v_user_id, v_today, 1)
  ON CONFLICT (student_id) DO UPDATE
    SET last_claimed_date = v_today,
        total_claims      = daily_login_rewards.total_claims + 1;

  RETURN json_build_object(
    'status', 'claimed',
    'coins',  v_coins,
    'streak', v_streak
  );
END;
$$;
```

**Efterkontrol:** `md5(prosrc)` er igen `80273d5d…`, og ACL er som under §1.

## 5. Hvad tilbagerulningen ikke gør

Den genindfører kapløbsfejlen. Den bør kun bruges, hvis migrationen selv giver fejl, fx hvis
hubbens dagsbelønning holder op med at virke.
