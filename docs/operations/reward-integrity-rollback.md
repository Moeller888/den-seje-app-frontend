# Belønningsintegritet (D-278): anvendelse og tilbagerulning

Gælder migrationen `supabase/migrations/20261031190000_reward_integrity_server_authority.sql`
([D-278](../decisions/D-278.md)).

**Status:** IKKE ANVENDT I PRODUKTIONEN. Både anvendelse og tilbagerulning kræver ejerens særskilte
godkendelse (D-110, [migration-workflow-policy.md](../migration-workflow-policy.md)).
`supabase db push` er forbudt.

## 1. Før anvendelse (kun læsning)

Hvert punkt skal holde. Ellers stoppes der.

1. **Funktionernes md5** (`md5(pg_get_functiondef(oid))`) er stadig som ved kontrollen 2026-10-31:
   - `update_best_session_streak(integer)`: `c504fe3b971db6ce53aab5bd0d50ac89`;
   - `set_night_correct()`: `2d5ce06e1bb3c2593555e03e38eb1a08`.

   Er de ændret, har nogen ændret funktionerne siden kontrollen. Rollbacken nedenfor er da ikke
   længere den rigtige.
2. **Policies:** `pg_policies` for `student_weekly_quest_progress` viser præcis
   - `weekly_progress_select_own`,
   - `weekly_progress_select_teacher`,
   - `weekly_progress_insert_own` og
   - `weekly_progress_update_own`.
3. **Kolonner:** `question_instances` har kolonnerne `student_id`, `answered`, `answered_at`,
   `was_correct` og `id`, som de nye funktioner læser.
4. **Ingen kollision:** `list_migrations` viser ingen version med samme tidsstempel eller navn.
5. **Unit-test grøn på commit'en:**
   `tests/unit/reward-integrity-server-authority-migration-run.test.mjs`.

## 2. Anvendelse

- `apply_migration` med filens indhold ordret fra den godkendte commit, navn
  `reward_integrity_server_authority`.
- Ét kald. Ingen genkørsel, før `list_migrations` og kataloget er kontrolleret.

## 3. Efter anvendelse (kun læsning)

1. `pg_policies` for `student_weekly_quest_progress` viser kun de to SELECT-policies.
2. `information_schema.role_table_grants` viser hverken INSERT, UPDATE eller DELETE for `anon` eller
   `authenticated` på tabellen.
3. Begge funktioner er `SECURITY DEFINER` med `search_path=public, pg_temp`. Deres ACL indeholder
   hverken `PUBLIC` (`=X/…`) eller `anon`, men indeholder `authenticated` og `service_role`.
4. Hubben viser stadig ugequests, og en fuldført ugequest kan indløses. Kontrolleres med
   testeleven fra Production Smoke, ikke med rigtige elevkonti.
5. Antallet af rækker i `student_weekly_quest_progress` vokser fortsat, efterhånden som eleverne
   svarer. Det viser, at serverens skrivning stadig virker.

## 4. Tilbagerulning

Bruges ved en afvigelse: stop, rapportér, og ejeren beslutter. SQL'en genskaber de tre objekter
præcis, som de var før migrationen:
- policies;
- tabelrettigheder;
- funktionskroppe, som de står i `20260518000500_hidden_achievements.sql`;
- EXECUTE-rettigheder.

Den ændrer ingen rækker.

```sql
-- ROLLBACK D-278 — restores the pre-migration state exactly.
CREATE POLICY "weekly_progress_insert_own"
  ON public.student_weekly_quest_progress FOR INSERT
  WITH CHECK (auth.uid() = student_id);

CREATE POLICY "weekly_progress_update_own"
  ON public.student_weekly_quest_progress FOR UPDATE
  USING (auth.uid() = student_id);

GRANT INSERT, UPDATE, DELETE ON public.student_weekly_quest_progress TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_night_correct()
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.student_progress
  SET night_correct = true
  WHERE student_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.update_best_session_streak(p_count INTEGER)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.student_progress
  SET best_session_streak = GREATEST(best_session_streak, p_count)
  WHERE student_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.set_night_correct() TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_best_session_streak(integer) TO PUBLIC, anon, authenticated, service_role;
```

**Efterkontrol:**
1. Funktionernes md5 er igen `c504fe3b…` og `2d5ce06e…`.
2. Policies og rettigheder er som under §1 punkt 2.

Unit-testen afspiller selve tilbagerulningen og kræver, at funktionsdefinitionerne og ACL'erne er
identiske med tilstanden før migrationen.

## 5. Hvad tilbagerulningen ikke gør

- Den genindfører de svagheder, som migrationen lukker. Den bør derfor kun bruges, hvis
  migrationen selv giver fejl, fx hvis hubbens ugequests holder op med at virke.
- Den ændrer ikke flag, achievements eller mønter. Det gør migrationen heller ikke.
