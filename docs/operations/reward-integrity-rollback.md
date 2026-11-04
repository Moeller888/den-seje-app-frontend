# Belønningsintegritet (D-278): anvendelse og tilbagerulning

Gælder migrationen `supabase/migrations/20261031190000_reward_integrity_server_authority.sql`
([D-278](../decisions/D-278.md)).

**Status:** IKKE ANVENDT I PRODUKTIONEN. Både anvendelse og tilbagerulning kræver ejerens særskilte
godkendelse (D-110, [migration-workflow-policy.md](../migration-workflow-policy.md)).
`supabase db push` er forbudt.

## 1. Før anvendelse (kun læsning)

Hvert punkt skal holde. Ellers stoppes der.

1. **Funktionskroppene er uændrede.** `md5(prosrc)` er stadig som ved kontrollen 2026-10-31:
   - `update_best_session_streak(integer)`: `9b748ad15766feb2b649671ebbaa0aca`;
   - `set_night_correct()`: `fc2cb97c4f147625fa170abe404f9f28`.

   Begge er `LANGUAGE sql`, `SECURITY DEFINER` og `search_path=public`. ACL er
   `{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}`.

   Er noget ændret, har nogen ændret funktionerne siden kontrollen. Så er rollbacken nedenfor ikke
   længere den rigtige, og der stoppes. Tilbagerulningens funktionskroppe har præcis disse md5. Det
   kræver unit-testen.

   *Rettelse 2026-10-31:* Den første version angav md5 af `pg_get_functiondef`. Den værdi afhænger af
   serverversionens formatering og kan ikke sammenlignes på tværs. `md5(prosrc)` er selve kroppen.
2. **Policies.** `pg_policies` for `student_weekly_quest_progress` viser præcis disse fire:

   | Navn | Kommando | Roller |
   |---|---|---|
   | `super_admins read all weekly quest progress` | SELECT | `{authenticated}` |
   | `weekly_progress_insert_own` | INSERT | `{public}` |
   | `weekly_progress_select_own` | SELECT | `{public}` |
   | `weekly_progress_update_own` | UPDATE | `{public}` |

   *Rettelse 2026-10-31:* Den første version forventede `weekly_progress_select_teacher`. Den policy
   blev erstattet af `super_admins read all weekly quest progress` i
   `20260925000000_weekly_quest_progress_read_scope.sql`. Det er bekræftet read-only i produktionen.
   Migrationen og tilbagerulningen rører ingen af de to SELECT-policies.
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

1. `pg_policies` for `student_weekly_quest_progress` viser præcis `super_admins read all weekly quest
   progress` (SELECT, `{authenticated}`) og `weekly_progress_select_own` (SELECT, `{public}`), med
   uændret `qual`.
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
1. `md5(prosrc)` er igen `9b748ad1…` og `fc2cb97c…`, og ACL'erne er som under §1 punkt 1.
2. De fire policies er som under §1 punkt 2.
3. Tabellens ACL giver igen `anon` og `authenticated` INSERT, UPDATE og DELETE.

Unit-testen afspiller selve tilbagerulningen og kræver, at funktionsdefinitionerne og ACL'erne er
identiske med tilstanden før migrationen.

## 5. Hvad tilbagerulningen ikke gør

- Den genindfører de svagheder, som migrationen lukker. Den bør derfor kun bruges, hvis
  migrationen selv giver fejl, fx hvis hubbens ugequests holder op med at virke.
- Den ændrer ikke flag, achievements eller mønter. Det gør migrationen heller ikke.
