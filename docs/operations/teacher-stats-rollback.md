# Rollback: lærerstatistik fra besvarelser (`teacher_stats_from_answers`)

**Status:** forberedt og afprøvet, **ikke anvendt**. Rollback kræver ejerens særskilte godkendelse
(D-110, [`../migration-workflow-policy.md`](../migration-workflow-policy.md)).
**Hører til:** [D-263](../decisions/D-263.md) · migrationsfil
`supabase/migrations/20261029150000_teacher_stats_from_answers.sql` · produktionspost
`20261030092931 teacher_stats_from_answers`.

Dokumentet ligger med vilje uden for `supabase/migrations/`, så rollback-SQL'en aldrig kan blive
anvendt som en almindelig fremadrettet migration. SQL'en står i én `sql`-kodeblok nederst.

## 1. Hvad rollback gør

Den genskaber de to funktioner, som var live før migrationen:

| Funktion | Kilde | `md5(prosrc)` efter rollback |
|---|---|---|
| `get_teacher_visibility(uuid)` | `20261009100000_get_teacher_visibility_caller_scope.sql`, linje 62–175, ordret | `df7b5f614836536bad27dd7f40d820b3` |
| `get_student_overview(uuid)` | `20260927000000_student_mastery_status_into_rpc.sql`, linje 98–163, med `CREATE FUNCTION` → `CREATE OR REPLACE FUNCTION` | `8ec647dfd830c073f21a46a7b2ff1fad` |

Begge bruger `CREATE OR REPLACE`, så funktionernes identitet (OID), signatur, returtype,
`SECURITY DEFINER`, `search_path` og EXECUTE-rettigheder bevares. Der ændres ingen tabeller, ingen
data og ingen RLS-politikker.

## 2. Må ikke: genkør ikke `20260927000000` i sin helhed

Migrationens egen ROLLBACK-kommentar henviser til `20260927000000_student_mastery_status_into_rpc.sql`.
**Den fil må ikke genkøres i sin helhed.** Den indeholder flere ændringer end funktionskroppen:

- `DROP FUNCTION IF EXISTS public.get_student_overview(uuid);` efterfulgt af `CREATE FUNCTION`. Det
  giver funktionen en ny identitet og fjerner rettigheder, som migrationen ikke selv giver igen
  (produktionen har `service_role` EXECUTE på funktionen).
- `DROP VIEW IF EXISTS public.student_mastery_status;`

Brug kun SQL'en i dette dokument. Den indeholder hverken `DROP` eller andre ændringer end de to
funktioner og deres rettigheder.

## 3. Afprøvning (2026-10-30)

Afprøvet i PGlite (lokal PostgreSQL, ingen produktionskald), med produktionens tilstand som
udgangspunkt: migrationen to gange og derefter rollback. 13 af 13 kontroller bestod:

- **Efter migrationen:** de nye hashes `656101f9…` og `ee729d7a…`; gentagelse giver samme resultat.
- **Efter rollback:** præcis produktionens hashes igen.
- **I alle trin:** OID, returtype, `SECURITY DEFINER`, `search_path` og rettigheder er uændrede,
  inklusive `service_role` på `get_student_overview`. Et uvedkommende view står urørt.

SQL-blokken nedenfor er byte-identisk med den afprøvede fil
(SHA-256 `b271ae216b29230db1589b8715c8e995facc229912aca74d65199964c904a10b`).

## 4. Procedure, hvis rollback bliver nødvendig

1. **Ejerens godkendelse** af netop denne rollback.
2. **Genskab og kontrollér SQL'en** fra dette dokument:
   ```
   awk '/^```sql$/{f=1;next} /^```$/{f=0} f' docs/operations/teacher-stats-rollback.md > rollback.sql
   sha256sum rollback.sql   # skal være b271ae21…4c904a10b
   ```
3. **Preflight, kun læsning:** `get_teacher_visibility` har `md5(prosrc) = 656101f9c967a4d9a6b4d96eb18cebed`
   og `get_student_overview` har `ee729d7ac1751ed78a187d3a9d304e3e`, med uændrede rettigheder.
   Afviger noget, stop: så har en anden ændring ramt funktionerne, og rollback skal gennemgås igen.
4. **Ét `apply_migration`-kald** med navnet `teacher_stats_from_answers_rollback`. Aldrig `db push`, og
   aldrig `execute_sql`: et kald uden ledger-post ville få migrationshistorikken til at vise
   migrationen som gældende, mens de gamle funktioner kører.
5. **Postflight, kun læsning:** hashes `df7b5f61…` og `8ec647df…`, ACL
   `{postgres=X/postgres,authenticated=X/postgres}` for `get_teacher_visibility` og
   `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}` for
   `get_student_overview`, og én version af hver funktion.
6. **Registrér** remote-versionen i en ny D-fil, og læg en tilsvarende fil i `supabase/migrations/` i
   en særskilt PR, så repoet ikke fortsat viser migrationen som gældende.

## 5. Rollback-SQL

```sql
-- ROLLBACK for 20261029150000_teacher_stats_from_answers (NOT APPLIED; prepared 2026-10-30).
-- Restores the definitions live before it: get_teacher_visibility from 20261009100000 (lines 62-175,
-- verbatim) and get_student_overview from 20260927000000 (lines 98-163, with CREATE -> CREATE OR REPLACE;
-- its DROP FUNCTION and DROP VIEW are deliberately NOT included). No data change.
CREATE OR REPLACE FUNCTION public.get_teacher_visibility(p_teacher_id uuid)
RETURNS TABLE(
  student_id         uuid,
  display_name       text,
  selected_grade     smallint,
  placement_band     smallint,
  current_band       smallint,
  total_attempts     integer,
  recent_correct_pct integer,
  trend              text,
  active_domains     text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid  uuid := (SELECT auth.uid());
  v_role text;
BEGIN
  -- Not signed in: nothing, and no error that would confirm anything.
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  -- The role comes from the database, keyed on the verified JWT subject.
  SELECT p.role INTO v_role
  FROM public.profiles p
  WHERE p.id = v_uid;

  -- A missing profile is an unknown answer, and an unknown answer is not permission.
  IF v_role IS NULL OR v_role <> 'teacher' THEN
    RETURN;
  END IF;

  -- A teacher may ask only about themselves. Another id is answered exactly like "no pupils".
  IF p_teacher_id IS DISTINCT FROM v_uid THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH
  my_students AS (
    SELECT
      p.id,
      COALESCE(NULLIF(split_part(u.email, '@', 1), ''), 'Elev')::TEXT AS display_name,
      p.selected_grade,
      p.placement_band,
      p.active_domains
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.teacher_id = v_uid
      AND p.role = 'student'
  ),
  ranked AS (
    SELECT
      qi.student_id       AS sid,
      qi.is_correct,
      q.difficulty_band,
      ROW_NUMBER() OVER (
        PARTITION BY qi.student_id
        ORDER BY COALESCE(qi.answered_at, qi.created_at) DESC
      ) AS rn
    FROM public.question_instances qi
    JOIN public.questions q ON q.id = qi.question_id
    WHERE qi.student_id IN (SELECT id FROM my_students)
      AND qi.answered = true
  ),
  agg AS (
    SELECT
      r.sid,
      ROUND(AVG(r.difficulty_band) FILTER (WHERE r.rn <= 10))::SMALLINT AS current_band,
      CASE
        WHEN COUNT(*) FILTER (WHERE r.rn <= 20) = 0 THEN 0
        ELSE ROUND(
          100.0 * COUNT(*) FILTER (WHERE r.rn <= 20 AND r.is_correct = true) /
          NULLIF(COUNT(*) FILTER (WHERE r.rn <= 20), 0)
        )::INTEGER
      END AS recent_correct_pct,
      CASE
        WHEN COUNT(*) FILTER (WHERE r.rn <= 10) < 5 THEN 'stable'
        WHEN COUNT(*) FILTER (WHERE r.rn BETWEEN 11 AND 20) < 5 THEN 'stable'
        WHEN (AVG(r.is_correct::INT) FILTER (WHERE r.rn <= 10) -
              AVG(r.is_correct::INT) FILTER (WHERE r.rn BETWEEN 11 AND 20)) > 0.15 THEN 'improving'
        WHEN (AVG(r.is_correct::INT) FILTER (WHERE r.rn BETWEEN 11 AND 20) -
              AVG(r.is_correct::INT) FILTER (WHERE r.rn <= 10)) > 0.15 THEN 'struggling'
        ELSE 'stable'
      END AS trend
    FROM ranked r
    GROUP BY r.sid
  )
  SELECT
    ms.id,
    ms.display_name,
    ms.selected_grade,
    ms.placement_band,
    COALESCE(ag.current_band, 1::SMALLINT),
    COALESCE(sp.total_attempts, 0),
    COALESCE(ag.recent_correct_pct, 0),
    COALESCE(ag.trend, 'stable'),
    ms.active_domains
  FROM my_students ms
  LEFT JOIN public.student_progress sp ON sp.student_id = ms.id
  LEFT JOIN agg ag ON ag.sid = ms.id
  ORDER BY ms.display_name;
END;
$$;

-- ── 2. EXECUTE: set explicitly, never inherited ──────────────────────────────
REVOKE EXECUTE ON FUNCTION public.get_teacher_visibility(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_teacher_visibility(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_teacher_visibility(uuid) FROM service_role;
GRANT  EXECUTE ON FUNCTION public.get_teacher_visibility(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_student_overview(p_student_id uuid)
RETURNS TABLE (
  email                 text,
  xp                    integer,
  level                 integer,
  correct_ratio         numeric,
  total_correct_answers integer,
  total_attempts        integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid  uuid := (SELECT auth.uid());
  v_role text;
BEGIN
  -- Not signed in: nothing, and no error that would confirm anything.
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  -- The role comes from the database, keyed on the verified JWT subject.
  SELECT p.role INTO v_role
  FROM public.profiles p
  WHERE p.id = v_uid;

  -- A missing profile is an unknown answer, and an unknown answer is not permission.
  IF v_role IS NULL OR v_role NOT IN ('teacher', 'super_admin') THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    u.email::text                           AS email,
    COALESCE(sp.xp, 0)                      AS xp,
    COALESCE(sp.level, 1)                   AS level,
    -- carried over verbatim from student_mastery_status, including the zero-attempt guard
    CASE
      WHEN COALESCE(sp.total_attempts, 0) > 0
        THEN round(
               COALESCE(sp.total_correct_answers, 0)::numeric
               / sp.total_attempts::numeric * 100::numeric, 1)
      ELSE 0::numeric
    END                                     AS correct_ratio,
    COALESCE(sp.total_correct_answers, 0)   AS total_correct_answers,
    COALESCE(sp.total_attempts, 0)          AS total_attempts
  FROM public.profiles s
    JOIN auth.users u
      ON u.id = s.id
    LEFT JOIN public.student_progress sp
      ON sp.student_id = s.id
  WHERE s.id = p_student_id
    AND s.role = 'student'
    AND (
      v_role = 'super_admin'
      OR s.teacher_id = v_uid
    );
END;
$$;

-- ── 2. EXECUTE: closed by default, opened only where a consumer exists ───────
REVOKE EXECUTE ON FUNCTION public.get_student_overview(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_student_overview(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_student_overview(uuid) TO authenticated;
```
