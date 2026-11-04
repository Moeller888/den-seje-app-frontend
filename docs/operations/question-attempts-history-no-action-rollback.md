# D-327 — tilbagerulning af `ON DELETE NO ACTION` på H5-forsøgenes fremmednøgle

Migration: `supabase/migrations/20261103100000_question_attempts_history_no_action.sql`
([D-327](../decisions/D-327.md)).

**Status:** IKKE ANVENDT I PRODUKTIONEN. Både anvendelse og tilbagerulning kræver ejerens særskilte
godkendelse (D-110). Kør tilbagerulningen som ét `apply_migration`-kald, aldrig med `supabase db push`.

Tilbagerulningen genskaber H5's oprindelige `ON DELETE CASCADE` på `question_attempts_instance_fkey`,
præcis som `20261030211428` og H5-bootstrappen oprettede den. Ingen række ændres. Bagefter sletter en
sletning af en `question_instances`-række igen rundens forsøg med.

## Før (kun læsning)

```
SELECT conname, pg_get_constraintdef(oid), condeferrable
FROM pg_constraint
WHERE conrelid = 'public.question_attempts'::regclass AND contype = 'f';
```

`question_attempts_instance_fkey` skal være
`FOREIGN KEY (question_instance_id, student_id) REFERENCES question_instances(id, student_id)` og ikke
deferrable.

## Tilbagerulning

```sql
-- ROLLBACK D-327 — restores H5's ON DELETE CASCADE on question_attempts_instance_fkey (no row is changed).
-- One statement (one DO block): all or nothing, whatever the runner does; lock_timeout inside the block.
DO $rollback_h5b$
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  IF (SELECT pg_get_constraintdef(c.oid) FROM pg_catalog.pg_constraint c
      WHERE c.conname = 'question_attempts_instance_fkey' AND c.conrelid = 'public.question_attempts'::regclass)
     IS DISTINCT FROM 'FOREIGN KEY (question_instance_id, student_id) REFERENCES question_instances(id, student_id)' THEN
    RAISE EXCEPTION 'ROLLBACK D-327: question_attempts_instance_fkey is not D-327''s NO ACTION definition; nothing changed';
  END IF;

  EXECUTE $ddl$ALTER TABLE public.question_attempts
  DROP CONSTRAINT question_attempts_instance_fkey,
  ADD CONSTRAINT question_attempts_instance_fkey FOREIGN KEY (question_instance_id, student_id)
    REFERENCES public.question_instances (id, student_id) ON DELETE CASCADE$ddl$;
END
$rollback_h5b$;
```

## Efterkontrol (kun læsning)

- `question_attempts_instance_fkey` er igen
  `FOREIGN KEY (question_instance_id, student_id) REFERENCES question_instances(id, student_id) ON DELETE CASCADE`.
- Antallet af rækker i `question_attempts` og `question_instances` er uændret.
