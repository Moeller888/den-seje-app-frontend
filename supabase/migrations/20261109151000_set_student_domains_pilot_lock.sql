-- ============================================================================
-- D-362 — close the teacher assignment of pilot domains in public.set_student_domains.
--
-- NOT APPLIED IN PRODUCTION. Applying it needs its own, separate owner GO (D-110,
-- docs/migration-workflow-policy.md), via the Management API / Supabase plugin `apply_migration` only.
-- `supabase db push` is forbidden.
--
-- ORDER: apply this BEFORE the D-362 pilot rows (learning_objective 'pilot_d362') are activated. While the
-- rows are inactive the old function already refuses the domain (no active question); the gap opens the
-- moment they are active, so the lock must be live first.
--
-- WHY (docs/decisions/D-362.md, "Kendt rest"): set_student_domains accepts every domain that has an
-- active question at the pupil's grade. Once the pilot rows are active, any teacher could therefore give
-- 'pilot_d362' to their own pupils. tests/unit/task-forms-pilot-scope.test.mjs pins that gap on the
-- function production runs today.
--
-- WHAT CHANGES (and nothing else)
--   1. A teacher can no longer ADD a domain whose key starts with 'pilot_' (compared case-insensitively).
--      Such a call raises
--        Domain "<key>" is a pilot domain and cannot be assigned by a teacher. Pilot access is granted by the project owner.
--      and changes nothing. The check runs right after the teacher-ownership check, so a caller who is not
--      the pupil's teacher still gets exactly the old "Not authorized" error.
--   2. Pilot domains the pupil ALREADY has are PRESERVED. The teacher's domain editor
--      (js/teacher.js, js/student-detail.js) only knows the fixed domains, so without this a normal save
--      would silently remove pilot access. The write is one UPDATE whose value is computed from the row
--      it updates (so a concurrent owner grant is not lost):
--        - the pupil has no 'pilot_*' domain           -> active_domains = p_domains, exactly as before
--                                                         (NULL stays NULL, '{}' stays '{}');
--        - the pupil has 'pilot_*' domains P (in their stored order) and
--            p_domains IS NULL or empty ('{}')         -> active_domains = P   ("clear" keeps pilot access);
--            p_domains is a non-empty list D           -> active_domains = D || P (teacher's list first).
--      So clearing never yields NULL for a pilot pupil; it yields exactly the pupil's pilot domains.
--      For scope.ts (get-next-question) a list with only pilot domains means: historie = the pilot domains.
--   3. Granting and revoking pilot access is an owner production action (a targeted UPDATE of one
--      profile, own GO, documented in D-362 "Tildeling og tilbagekaldelse"), never this function.
-- UNCHANGED: signature (uuid, text[]) RETURNS void, LANGUAGE plpgsql, SECURITY DEFINER,
-- search_path = 'public', the teacher-ownership check, the grade / accessible-domain validation and both of
-- its error texts, and the write for every pupil without a pilot domain. CREATE OR REPLACE keeps the
-- function's owner and ACL (EXECUTE) exactly as they are, so this file restates no grant.
--
-- GUARD: replaces only a reviewed body (md5(prosrc) of public.set_student_domains(uuid, text[])):
--   953a299198a78899e9691686731899f8  body of 20260608085315_fix_set_student_domains_null_grade.sql
--                                     (the remote-stamped twin; what the isolated replay runs);
--   e4ac7f0a7bc9c940d9f06be6234e2cfd  body of 20260608110000_fix_set_student_domains_null_grade.sql
--                                     (the hand-stamped twin; same SQL plus three inline comments);
--   f7c0a0099472b2d0f1c48362365b5ccf  this file's own body (an idempotent re-run is a no-op).
-- Anything else aborts and changes nothing. Production's md5 has NOT been measured: it must be confirmed
-- read-only against production (SELECT md5(prosrc) FROM pg_proc WHERE oid =
-- to_regprocedure('public.set_student_domains(uuid,text[])')) before this is applied.
--
-- ROLLBACK (restores the replayed production body, md5 953a299198a78899e9691686731899f8; if the
-- preflight measured e4ac7f0a7bc9c940d9f06be6234e2cfd, run the CREATE OR REPLACE of 20260608110000
-- verbatim instead — the two differ only by comments). Run in one transaction. A rollback does not remove
-- pilot domains already stored; after it, a teacher's editor save would again overwrite them.
-- ROLLBACK BEGIN
-- DO $rollback_guard$
-- BEGIN
--   IF (SELECT md5(prosrc) FROM pg_catalog.pg_proc
--       WHERE oid = to_regprocedure('public.set_student_domains(uuid,text[])'))
--      IS DISTINCT FROM 'f7c0a0099472b2d0f1c48362365b5ccf' THEN
--     RAISE EXCEPTION 'D-362 rollback: set_student_domains is not the pilot-lock body; nothing changed';
--   END IF;
-- END
-- $rollback_guard$;
-- CREATE OR REPLACE FUNCTION public.set_student_domains(
--   p_student_id UUID,
--   p_domains    TEXT[]
-- )
-- RETURNS void
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = 'public'
-- AS $$
-- DECLARE
--   v_grade      SMALLINT;
--   v_bad_domain TEXT;
-- BEGIN
--   IF NOT EXISTS (
--     SELECT 1 FROM profiles
--     WHERE id         = p_student_id
--       AND teacher_id = auth.uid()
--       AND role       = 'student'
--   ) THEN
--     RAISE EXCEPTION 'Not authorized: caller is not the teacher of this student';
--   END IF;
--
--   IF p_domains IS NOT NULL AND array_length(p_domains, 1) > 0 THEN
--     SELECT selected_grade INTO v_grade
--     FROM profiles WHERE id = p_student_id;
--
--     SELECT d INTO v_bad_domain
--     FROM unnest(p_domains) AS d
--     WHERE NOT EXISTS (
--       SELECT 1 FROM questions
--       WHERE is_active           = true
--         AND (
--           v_grade IS NULL
--           OR target_grade IS NULL
--           OR target_grade <= v_grade
--         )
--         AND learning_objective = d
--       LIMIT 1
--     )
--     LIMIT 1;
--
--     IF v_bad_domain IS NOT NULL THEN
--       IF v_grade IS NULL THEN
--         RAISE EXCEPTION
--           'Domain "%" does not exist or has no questions. Check the domain key and try again.',
--           v_bad_domain;
--       ELSE
--         RAISE EXCEPTION
--           'Domain "%" has no accessible questions for grade % students. Choose a different domain or update the student''s grade.',
--           v_bad_domain, v_grade;
--       END IF;
--     END IF;
--   END IF;
--
--   UPDATE profiles
--   SET active_domains = p_domains
--   WHERE id = p_student_id;
-- END;
-- $$;
-- ROLLBACK END
--
-- Proven on the replayed schema (PGlite): tests/unit/set-student-domains-pilot-lock-migration-run.test.mjs.
-- ============================================================================

DO $guard$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(p.prosrc) INTO v_md5
  FROM pg_catalog.pg_proc p
  WHERE p.oid = to_regprocedure('public.set_student_domains(uuid,text[])');
  IF v_md5 IS NULL OR v_md5 NOT IN ('953a299198a78899e9691686731899f8',
                                    'e4ac7f0a7bc9c940d9f06be6234e2cfd',
                                    'f7c0a0099472b2d0f1c48362365b5ccf') THEN
    RAISE EXCEPTION 'D-362: set_student_domains has an unreviewed body (md5 %); nothing changed', coalesce(v_md5, 'missing');
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.set_student_domains(
  p_student_id UUID,
  p_domains    TEXT[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_grade      SMALLINT;
  v_bad_domain TEXT;
  v_pilot      TEXT;
BEGIN
  -- 1. Teacher ownership check (unchanged)
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id         = p_student_id
      AND teacher_id = auth.uid()
      AND role       = 'student'
  ) THEN
    RAISE EXCEPTION 'Not authorized: caller is not the teacher of this student';
  END IF;

  -- 2. D-362: a teacher can never add a pilot domain (granted only by the project owner).
  SELECT d INTO v_pilot
  FROM unnest(p_domains) AS d
  WHERE starts_with(lower(d), 'pilot_')
  LIMIT 1;

  IF v_pilot IS NOT NULL THEN
    RAISE EXCEPTION
      'Domain "%" is a pilot domain and cannot be assigned by a teacher. Pilot access is granted by the project owner.',
      v_pilot;
  END IF;

  -- 3. Validate domain accessibility when assigning specific domains (unchanged).
  IF p_domains IS NOT NULL AND array_length(p_domains, 1) > 0 THEN
    SELECT selected_grade INTO v_grade
    FROM profiles WHERE id = p_student_id;

    SELECT d INTO v_bad_domain
    FROM unnest(p_domains) AS d
    WHERE NOT EXISTS (
      SELECT 1 FROM questions
      WHERE is_active           = true
        AND (
          v_grade IS NULL
          OR target_grade IS NULL
          OR target_grade <= v_grade
        )
        AND learning_objective = d
      LIMIT 1
    )
    LIMIT 1;

    IF v_bad_domain IS NOT NULL THEN
      IF v_grade IS NULL THEN
        RAISE EXCEPTION
          'Domain "%" does not exist or has no questions. Check the domain key and try again.',
          v_bad_domain;
      ELSE
        RAISE EXCEPTION
          'Domain "%" has no accessible questions for grade % students. Choose a different domain or update the student''s grade.',
          v_bad_domain, v_grade;
      END IF;
    END IF;
  END IF;

  -- 4. Write. Pilot domains the pupil already has are kept (D-362): without any, the value is p_domains
  --    exactly as before; with some, NULL/empty keeps only them and a list gets them appended.
  UPDATE profiles
  SET active_domains = CASE
        WHEN NOT EXISTS (
          SELECT 1 FROM unnest(profiles.active_domains) AS e(d)
          WHERE starts_with(lower(e.d), 'pilot_')
        ) THEN p_domains
        WHEN p_domains IS NULL OR array_length(p_domains, 1) IS NULL THEN
          ARRAY(
            SELECT e.d FROM unnest(profiles.active_domains) WITH ORDINALITY AS e(d, o)
            WHERE starts_with(lower(e.d), 'pilot_')
            ORDER BY e.o
          )
        ELSE p_domains || ARRAY(
            SELECT e.d FROM unnest(profiles.active_domains) WITH ORDINALITY AS e(d, o)
            WHERE starts_with(lower(e.d), 'pilot_')
            ORDER BY e.o
          )
      END
  WHERE id = p_student_id;
END;
$$;
