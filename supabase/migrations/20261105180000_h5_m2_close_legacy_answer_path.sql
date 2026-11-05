-- ============================================================================
-- H5 M2, TRANSACTION 1 OF 2 — CLOSE the legacy answer path (runbook docs/operations/h5-k1-activation-runbook.md
-- step A10a, §9.2 and §9.3). The legacy functions
--   public.process_question_attempt(uuid,uuid,text,bigint)
--   public.process_text_answer(uuid,uuid,text,boolean)
-- become unreachable for every runtime role; from then on an automatically graded answer can only be
-- recorded through H5's append-only log (process_question_attempt_v2 / process_text_answer_v2, K1
-- signatures). process-event (main) turns the refusal into 426 client_outdated.
--
-- NOT APPLIED IN PRODUCTION. Applying it needs a separate owner authorisation (D-110,
-- docs/migration-workflow-policy.md): apply_migration only (name h5_m2_close_legacy_answer_path), never
-- `supabase db push`. It is INACTIVE until the owner has decided B1–B4 (runbook §1.1) and A1–A9 are
-- done. It must be applied ALONE, as its own apply_migration call, and COMMITTED before transaction 2
-- (20261105180100_h5_m2_register_cutover.sql) starts — never both in one call or one transaction:
-- transaction 2 waits for answers that passed the permission check BEFORE this commit (§9.3).
--
-- WHAT CHANGES (and nothing else)
--   EXECUTE on the two legacy functions is revoked from PUBLIC and from EVERY grantee in their ACL other
--   than the owner (in production: service_role; anon, authenticated and authenticator have no grant,
--   catalog 2026-11-05). The owner keeps EXECUTE: it is not a runtime role. No body changes, no DROP,
--   no CREATE (a DROP + CREATE would re-grant through production's default privileges). No row is
--   written, read for update or deleted.
--
-- GUARD AND ATOMICITY: one DO block — all or nothing, whatever the runner does; lock_timeout 5 s inside.
--   Refused (RAISE, nothing changed) unless:
--     * K1 is applied: both _v2 functions exist with K1's signatures and reviewed bodies (md5 below),
--       service_role may execute both — so closing the old path never leaves pupils without one;
--     * question_attempts holds at least one attempt: the new path has been used in this database
--       (A8 done). This is a floor, not the A9 evidence — that is the owner's GO (runbook §9);
--     * both legacy functions exist, and no runtime role (anon, authenticated, service_role,
--       authenticator) is a member of their owner;
--     * no other function calls them, nothing in pg_depend depends on them, and no pg_cron job names
--       them (when cron.job exists; unreadable → refused);
--     * no other function in public bears either legacy name (a new overload, e.g. via CREATE OR
--       REPLACE with another signature, would be a new open legacy path; same rule as readiness CUT-01).
--   After the REVOKE the same block asserts the end state of readiness CUT-01 (§9.2 krav 2): no runtime
--   role — directly, through PUBLIC, through inheritance or via SET ROLE (pg_has_role MEMBER) — may
--   execute either function; the ACL holds no PUBLIC entry; no non-superuser other than the owner holds
--   EXECUTE. Any violation aborts the whole transaction.
--   A second run on a database that is already closed changes nothing.
--
-- AFTER COMMIT: readiness CUT-01 = true and CUT-02 = false ("M2 udført, T mangler") — NO-GO until
-- transaction 2 has registered T. Answers in flight at this commit finish with the old privileges;
-- transaction 2 waits for them. Calls that start after it get 42501 and write nothing.
--
-- ROLLBACK (reopen, service_role only, never PUBLIC/anon/authenticated): docs/operations/h5-m2-rollback.md.
-- ============================================================================

DO $m2close$
DECLARE
  v_pqa oid := to_regprocedure('public.process_question_attempt(uuid,uuid,text,bigint)');
  v_pta oid := to_regprocedure('public.process_text_answer(uuid,uuid,text,boolean)');
  v_mc  oid := to_regprocedure('public.process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text,text,integer)');
  v_tx  oid := to_regprocedure('public.process_text_answer_v2(uuid,uuid,text,boolean,integer,uuid,text,text,text,integer)');
  v_legacy oid[];
  v_fn oid;
  v_grantee text;
  v_found text;
  v_n bigint;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  -- ── Preconditions ────────────────────────────────────────────────────────────────────────────────
  IF v_pqa IS NULL OR v_pta IS NULL THEN
    RAISE EXCEPTION 'M2 (luk): legacy-funktionerne findes ikke med de forventede signaturer; intet ændret';
  END IF;
  v_legacy := ARRAY[v_pqa, v_pta];

  IF v_mc IS NULL OR v_tx IS NULL
     OR (SELECT md5(prosrc) FROM pg_catalog.pg_proc WHERE oid = v_mc) IS DISTINCT FROM '439186fa94119fec02b8f282eb75dbbd'
     OR (SELECT md5(prosrc) FROM pg_catalog.pg_proc WHERE oid = v_tx) IS DISTINCT FROM '809675f9071eb2a62d1c9a9b2628bc84' THEN
    RAISE EXCEPTION 'M2 (luk): K1 er ikke anvendt (eller _v2-kroppene er ukendte) — den nye svarvej findes ikke; intet ændret';
  END IF;
  IF NOT has_function_privilege('service_role', v_mc, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_tx, 'EXECUTE') THEN
    RAISE EXCEPTION 'M2 (luk): service_role kan ikke udføre _v2 — den nye svarvej er ikke tilgængelig; intet ændret';
  END IF;

  SELECT count(*) INTO v_n FROM public.question_attempts;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'M2 (luk): question_attempts er tom — den nye svarvej er ikke taget i brug (A8/A9); intet ændret';
  END IF;

  SELECT string_agg(DISTINCT r.rolname, ', ') INTO v_found
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_roles r ON r.rolname IN ('anon', 'authenticated', 'service_role', 'authenticator')
   WHERE p.oid = ANY (v_legacy) AND pg_has_role(r.oid, p.proowner, 'MEMBER');
  IF v_found IS NOT NULL THEN
    RAISE EXCEPTION 'M2 (luk): runtime-rolle(r) er medlem af legacy-funktionernes ejer (%); en REVOKE kan ikke lukke vejen; intet ændret', v_found;
  END IF;

  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_found
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
     AND p.oid <> ALL (v_legacy)
     AND p.prosrc ~* '\m(process_question_attempt|process_text_answer)\s*\(';
  IF v_found IS NOT NULL THEN
    RAISE EXCEPTION 'M2 (luk): andre funktioner kalder legacy-funktionerne (%); intet ændret', v_found;
  END IF;

  SELECT string_agg(DISTINCT d.classid::regclass::text || ':' || d.objid::text, ', ') INTO v_found
    FROM pg_catalog.pg_depend d
   WHERE d.refclassid = 'pg_catalog.pg_proc'::regclass AND d.refobjid = ANY (v_legacy) AND d.deptype IN ('n', 'a');
  IF v_found IS NOT NULL THEN
    RAISE EXCEPTION 'M2 (luk): objekter afhænger af legacy-funktionerne (%); intet ændret', v_found;
  END IF;

  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_found
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname IN ('process_question_attempt', 'process_text_answer')
     AND p.oid <> ALL (v_legacy);
  IF v_found IS NOT NULL THEN
    RAISE EXCEPTION 'M2 (luk): andre funktioner i public bærer legacy-navnene (%); en ny overload ville være en åben legacy-vej; intet ændret', v_found;
  END IF;

  IF to_regclass('cron.job') IS NOT NULL THEN
    BEGIN
      EXECUTE $q$SELECT count(*) FROM cron.job j WHERE j.command ~* '\m(process_question_attempt|process_text_answer)\M'$q$ INTO v_n;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE EXCEPTION 'M2 (luk): cron.job kan ikke læses — pg_cron-kaldestier kan ikke udelukkes; intet ændret';
    END;
    IF v_n > 0 THEN
      RAISE EXCEPTION 'M2 (luk): % pg_cron-job(s) kalder legacy-funktionerne; intet ændret', v_n;
    END IF;
  END IF;

  -- ── Close: PUBLIC and every grantee other than the owner ───────────────────────────────────────
  FOREACH v_fn IN ARRAY v_legacy LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', v_fn::regprocedure);
    FOR v_grantee IN
      SELECT DISTINCT quote_ident(r.rolname)
        FROM pg_catalog.pg_proc p
        CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        JOIN pg_catalog.pg_roles r ON r.oid = a.grantee
       WHERE p.oid = v_fn AND a.privilege_type = 'EXECUTE' AND a.grantee <> p.proowner
    LOOP
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM %s', v_fn::regprocedure, v_grantee);
    END LOOP;
  END LOOP;

  -- ── Assert the end state (= readiness CUT-01) ──────────────────────────────────────────────────
  SELECT string_agg(DISTINCT rt.rolname || '→' || x.rolname, ', ') INTO v_found
    FROM pg_catalog.pg_roles rt
    JOIN pg_catalog.pg_roles x ON pg_has_role(rt.oid, x.oid, 'MEMBER')
    CROSS JOIN unnest(v_legacy) AS f(oid)
   WHERE rt.rolname IN ('anon', 'authenticated', 'service_role', 'authenticator')
     AND has_function_privilege(x.oid, f.oid, 'EXECUTE');
  IF v_found IS NOT NULL THEN
    RAISE EXCEPTION 'M2 (luk): runtime-roller kan stadig udføre legacy-funktionerne (%); alt rulles tilbage', v_found;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
               CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
              WHERE p.oid = ANY (v_legacy) AND a.grantee = 0 AND a.privilege_type = 'EXECUTE') THEN
    RAISE EXCEPTION 'M2 (luk): PUBLIC har stadig EXECUTE; alt rulles tilbage';
  END IF;

  SELECT string_agg(DISTINCT r.rolname, ', ') INTO v_found
    FROM pg_catalog.pg_roles r CROSS JOIN unnest(v_legacy) AS f(oid)
    JOIN pg_catalog.pg_proc p ON p.oid = f.oid
   WHERE NOT r.rolsuper AND r.oid <> p.proowner
     AND has_function_privilege(r.oid, f.oid, 'EXECUTE');
  IF v_found IS NOT NULL THEN
    RAISE EXCEPTION 'M2 (luk): andre roller end ejeren kan stadig udføre legacy-funktionerne (%); alt rulles tilbage', v_found;
  END IF;

  RAISE NOTICE 'M2 (luk): legacy-vejen er lukket for alle runtime-roller. T er IKKE registreret — kør transaktion 2 (20261105180100) som særskilt trin.';
END
$m2close$;
