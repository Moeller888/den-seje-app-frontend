# Midlertidig deaktivering af to fejlbedømte opgaver (D-290, G2): anvendelse og genaktivering

Gælder `supabase/migrations/20261101140000_deactivate_two_misgraded_questions.sql`
([D-290](../decisions/D-290.md), baggrund i D-285).

**Status:** IKKE ANVENDT I PRODUKTIONEN. Både anvendelse og genaktivering kræver ejerens særskilte
godkendelse (D-110, [migration-workflow-policy.md](../migration-workflow-policy.md)).

## 1. Før anvendelse (kun læsning)

1. Begge opgaver findes og er aktive:
   - `08c1770e-b9e6-4a14-a5e0-6420337ba052`;
   - `3213c5be-71b8-4dab-817f-26a1deca5cb5`.
2. Ingen elev har en åben instans af dem (`answered = false`): 0 ved kontrollen 2026-11-01.
   Migrationens vagt kontrollerer det igen under en rækkelås.
3. `list_migrations` viser ingen kollision.
4. `tests/unit/deactivate-two-misgraded-questions-migration-run.test.mjs` er grøn på commit'en.

## 2. Anvendelse

`apply_migration` med filens indhold ordret fra den godkendte commit, navn
`deactivate_two_misgraded_questions`. Ét kald. Hvis en vagt slår til, ændres intet.

## 3. Efter anvendelse (kun læsning)

1. Begge opgaver har `is_active = false`.
2. Antallet af aktive opgaver er faldet med præcis 2.
3. Ingen andre rækker er ændret (antallet af instanser og svar er uændret).

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
