# D-298 H2 — tilbagerulning af `ON DELETE RESTRICT` på svarhistorikken

Migration: `supabase/migrations/20261101210000_question_history_restrict.sql`.

Tilbagerulningen kræver ejerens **særskilte godkendelse**. Den køres som ét `apply_migration`-kald
(D-110), aldrig med `supabase db push`. Den gør `ON DELETE CASCADE` gældende igen: en sletning af et
spørgsmål vil så igen slette elevernes svar på det.

## Før

Kontrollér read-only, at begge fremmednøgler har RESTRICT-definitionen fra migrationen:

```
SELECT conrelid::regclass, conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE contype = 'f' AND confrelid = 'public.questions'::regclass;
```

## Tilbagerulning

```sql
-- ROLLBACK D-298 H2 — restores production's ON DELETE CASCADE on both foreign keys (no row is changed).
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.question_instances
  DROP CONSTRAINT question_instances_question_id_fkey,
  ADD CONSTRAINT question_instances_question_id_fkey
    FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE CASCADE;

ALTER TABLE public.student_answers
  DROP CONSTRAINT student_answers_question_id_fkey,
  ADD CONSTRAINT student_answers_question_id_fkey
    FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE CASCADE;
```

## Efterkontrol (read-only)

- Begge definitioner er igen `FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE`.
- Antallet af rækker i `question_instances` og `student_answers` er uændret.
