# Spillepauser (D-347) — deaktivering og tilbagerulning

Gælder migration `supabase/migrations/20261105090000_minigame_breaks.sql` (anvendt i produktionen 2026-11-05 som remote version `20261105060103`) og frontenden fra PR #597 (merge-commit `c3eb1824`).
Ingen af trinnene nedenfor rører elevbesvarelser, XP, mønter, mastery eller spørgsmål: funktionen **læser**
kun `question_instances` og `profiles` og **skriver** kun i sine egne tre tabeller. Migrationen fjerner
desuden EXECUTE på `claim_stabel_reward(integer)` fra alle API-roller (Stabel giver ingen mønter, D-347);
den ændrer ingen data.

Hvert trin, der ændrer produktionen, kræver ejerens separate godkendelse
([`../migration-workflow-policy.md`](../migration-workflow-policy.md)).

## Niveau 1 — ingen nye tilbud, uden deploy

```sql
UPDATE public.minigame_break_games SET enabled = false;
```

Effekt: `minigame_break_after_answer` svarer `no_games`, der vises ingen dialog, quizzen kører som før.
Den optjente tid bliver stående på intervallet (600 efter D-364, 1.200 før) og venter. Allerede accepterede pas kan stadig indløses (højst 15
minutter). Et enkelt spil tages ud med `WHERE game_key = '<key>'`.

Genåbning: `UPDATE public.minigame_break_games SET enabled = true;`

## Niveau 2 — frontenden tilbage

`git revert` af PR'ens merge-commit på `main` (Cloudflare udruller automatisk). Effekt: Minigames-fanen og
den frie adgang er tilbage, quizzen spørger ikke længere serveren. Tabellerne og funktionerne bliver
liggende uden brug og er harmløse.

Bemærk: det genopretter den **gamle** produktbeslutning (fri adgang). Vil man i stedet beholde
spærringen og blot slukke tilbuddene, er niveau 1 det rigtige.

## Niveau 3 — databaseobjekterne væk

Kun efter niveau 2 (ellers er alle spilsider låst). Sletter tilbudshistorikken og den optjente tid; intet
andet.

```sql
-- ROLLBACK D-347
BEGIN;
DROP FUNCTION IF EXISTS public.minigame_break_after_answer(uuid, integer);
DROP FUNCTION IF EXISTS public.minigame_break_respond(uuid, boolean);
DROP FUNCTION IF EXISTS public.minigame_break_start(uuid, text);
DROP FUNCTION IF EXISTS public.minigame_break_finish(uuid, text);
DROP FUNCTION IF EXISTS public._minigame_break_lock_pupil();
DROP FUNCTION IF EXISTS public._minigame_break_expire(uuid);
DROP TABLE IF EXISTS public.minigame_break_offers;
DROP TABLE IF EXISTS public.minigame_break_progress;
DROP TABLE IF EXISTS public.minigame_break_games;
COMMIT;
```

## D-364 — intervallet tilbage til 20 minutter

D-364 (`20261107090000_minigame_break_interval_10min.sql`) ændrer kun konstanten `c_interval` i
`minigame_break_after_answer` fra 1200 til 600. Tilbagerulning = en ny migration med D-347's definition af
netop den funktion (samme `CREATE OR REPLACE`-blok som i `20261105090000_minigame_breaks.sql`, dvs.
`c_interval := 1200`) plus de samme to linjer `REVOKE … FROM PUBLIC, anon` / `GRANT EXECUTE … TO
authenticated`. Kræver ejerens GO. Ingen data ændres; teksterne i `js/minigame-pass.js` og `spil.html`
skal tilbage til "20 minutter" i samme omgang (revert af D-364's merge-commit).

Kontrol (read-only):

```sql
SELECT (regexp_match(prosrc, 'c_interval\s+CONSTANT integer\s+:=\s*(\d+)'))[1] AS interval_seconds
FROM pg_proc WHERE proname = 'minigame_break_after_answer';
```

## Stabels mønter — kun ved en ny ejerbeslutning

At lukke `claim_stabel_reward` er en del af D-347 og **ikke** noget, en tilbagerulning af spillepauserne
genåbner (niveau 2 og 3 lader den være lukket). Skulle ejeren beslutte, at Stabel igen skal give mønter,
genskaber dette præcis de rettigheder, produktionen havde før (læst 2026-11-04:
`{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}`):

```sql
GRANT EXECUTE ON FUNCTION public.claim_stabel_reward(integer) TO authenticated, service_role;
```

Kræver desuden, at `js/stabel.js` igen kalder funktionen (revert af den del af PR #597). Funktionens krop og
`stabel_daily_rewards` er urørte, så loftet på 50 pr. dag gælder fortsat.

## Kontrol efter anvendelse (read-only)

```sql
SELECT p.proname, p.prosecdef, p.proconfig,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_x,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_x
FROM   pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE  n.nspname = 'public' AND p.proname LIKE '%minigame_break%'
ORDER  BY 1;
-- forventet: 6 funktioner, alle prosecdef = true, search_path=public, anon_x = false,
-- auth_x = true kun for de fire uden understregning.

SELECT c.relname, c.relrowsecurity,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_select
FROM   pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE  n.nspname = 'public' AND c.relname LIKE 'minigame_break_%' AND c.relkind = 'r';
-- forventet: 3 tabeller, relrowsecurity = true, auth_select = false.

SELECT game_key, enabled FROM public.minigame_break_games ORDER BY 1;
-- forventet: brud, hop, husk, kloeft, naal, slope, stabel — alle enabled.

SELECT proacl::text,
       has_function_privilege('authenticated', oid, 'EXECUTE') AS auth_x,
       has_function_privilege('anon', oid, 'EXECUTE')          AS anon_x,
       has_function_privilege('service_role', oid, 'EXECUTE')  AS svc_x
FROM   pg_proc WHERE oid = 'public.claim_stabel_reward(integer)'::regprocedure;
-- forventet: {postgres=X/postgres}, og alle tre false.

SELECT count(*), sum(coins_today) FROM public.stabel_daily_rewards;
-- forventet: samme tal som i preflight (historikken er urørt).
```
