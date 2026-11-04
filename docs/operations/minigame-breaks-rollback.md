# Spillepauser (D-347) — deaktivering og tilbagerulning

Gælder migration `supabase/migrations/20261105090000_minigame_breaks.sql` og frontenden i samme PR.
Ingen af trinnene nedenfor rører elevbesvarelser, XP, mønter, mastery eller spørgsmål: funktionen **læser**
kun `question_instances` og `profiles` og **skriver** kun i sine egne tre tabeller.

Hvert trin, der ændrer produktionen, kræver ejerens separate godkendelse
([`../migration-workflow-policy.md`](../migration-workflow-policy.md)).

## Niveau 1 — ingen nye tilbud, uden deploy

```sql
UPDATE public.minigame_break_games SET enabled = false;
```

Effekt: `minigame_break_after_answer` svarer `no_games`, der vises ingen dialog, quizzen kører som før.
Den optjente tid bliver stående på 1.200 og venter. Allerede accepterede pas kan stadig indløses (højst 15
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
```
