# Midlertidig deaktivering af to fejlbedømte opgaver (D-290, G2): anvendelse og genaktivering

Gælder `supabase/migrations/20261101140000_deactivate_two_misgraded_questions.sql`
([D-290](../decisions/D-290.md), baggrund i D-285).

**Status:** IKKE ANVENDT I PRODUKTIONEN. Både anvendelse og genaktivering kræver ejerens særskilte
godkendelse (D-110, [migration-workflow-policy.md](../migration-workflow-policy.md)).

## 1. Før anvendelse (kun læsning)

1. Begge opgaver findes, er aktive og har det gennemgåede indhold (md5 af `content::text` /
   `metadata::text`, læst 2026-11-01):
   - `08c1770e-b9e6-4a14-a5e0-6420337ba052`: `004cbd99947f484a842d9210564915ab` /
     `4a7dd45f217fd26ccb10beeae257a356`;
   - `3213c5be-71b8-4dab-817f-26a1deca5cb5`: `47577cb7bbc5839859dbb3caaad0d538` /
     `4a7dd45f217fd26ccb10beeae257a356`.
   Migrationens vagt kontrollerer begge hashes igen under en rækkelås.
2. Ingen elev har en åben instans af dem (`answered = false`): 0 ved kontrollen 2026-11-01.
   Migrationens vagt kontrollerer det igen under en rækkelås.
3. Hverken `public.guard_open_round_requires_active_question` eller triggeren
   `open_round_requires_active_question` findes i forvejen. Ingen anden trigger på
   `question_instances` hedder det samme.
4. `list_migrations` viser ingen kollision.
5. `tests/unit/deactivate-two-misgraded-questions-migration-run.test.mjs` og
   `tests/unit/deactivate-two-misgraded-questions-concurrency.test.mjs` er grønne på commit'en. Den
   sidste kører kun mod rigtig PostgreSQL (CI's PostgreSQL 17).

## 2. Anvendelse

`apply_migration` med filens indhold ordret fra den godkendte commit, navn
`deactivate_two_misgraded_questions`. Ét kald. Hvis en vagt slår til, ændres intet, og heller ikke
værnet (funktion og trigger) bliver oprettet.

Migrationen tager kortvarigt en tabellås på `question_instances` (`CREATE TRIGGER`). Svar og nye
spørgsmål venter i den tid, transaktionen kører, og fortsætter derefter.

## 3. Efter anvendelse (kun læsning)

1. Begge opgaver har `is_active = false`. Indholds- og metadata-hashene er uændrede.
2. Antallet af aktive opgaver er faldet med præcis 2.
3. Ingen andre rækker er ændret (antallet af instanser og svar er uændret).
4. Ingen åben instans peger på en af de to opgaver.
5. Værnet findes: funktionen er `SECURITY DEFINER` med `search_path=""`, ingen API-rolle har
   EXECUTE, og triggeren `open_round_requires_active_question` er `BEFORE INSERT OR UPDATE OF
   answered, question_id` på `question_instances`.

## 4. Genaktivering

Genaktivering sker, når den rettede bedømmelse fra D-285 G1 er anvendt og verificeret. Den kan også
bruges som tilbagerulning, men det kræver særskilt godkendelse.

```sql
-- REACTIVATE D-290 — reverses the deactivation; changes only questions.is_active of the two ids.
UPDATE public.questions
SET    is_active = true
WHERE  id IN ('08c1770e-b9e6-4a14-a5e0-6420337ba052', '3213c5be-71b8-4dab-817f-26a1deca5cb5')
  AND  is_active = false;
```

**Efterkontrol:** Begge er igen aktive. Ingen anden række er ændret.

Værnet fra migrationens del 1 bliver stående ved en genaktivering. Det gælder alle spørgsmål: en ny
åben runde kan kun oprettes på et aktivt spørgsmål. Fjernelse står i migrationens header og kræver
særskilt godkendelse.
