-- ============================================================================
-- H5 M2, TRANSACTION 2 OF 2 — DRAIN, then REGISTER the cutover time T (runbook
-- docs/operations/h5-k1-activation-runbook.md step A10b, §9.1 and §9.3).
--
-- NOT APPLIED IN PRODUCTION. Applying it needs a separate owner authorisation (D-110,
-- docs/migration-workflow-policy.md): apply_migration only (name h5_m2_register_cutover), never
-- `supabase db push`. INACTIVE until B1–B4 are decided. Apply it ALONE, AFTER transaction 1
-- (20261105120000_h5_m2_close_legacy_answer_path.sql) has been committed by its own apply_migration call.
--
-- WHY A SECOND TRANSACTION: REVOKE neither waits for nor stops a legacy call that already passed the
-- permission check, and legacy answers carry answered_at = now() = their TRANSACTION START. If T were
-- written together with the REVOKE, an in-flight answer could commit after T with answered_at < T
-- (invisible to a time filter) and a call starting between T and the commit would look like a breach.
-- So: close (transaction 1, committed) → closed_before := clock_timestamp() here → wait until no client
-- session of THIS database has a transaction that started before closed_before → only then create the
-- registration and write T. Every legacy answer is then committed before T with
-- answered_at < closed_before <= T, and runbook §8 block 2 (INT-B) is exact.
--
-- WHAT CHANGES (and nothing else), all in one DO block — atomic whatever the runner does:
--   1. public.answer_path_cutovers (cutover text PK CHECK = 'h5_m2', effective_at, closed_before,
--      migration, CHECK closed_before <= effective_at). RLS on, no policies. No privilege for PUBLIC,
--      anon or authenticated; service_role SELECT only. Append-only: UPDATE, DELETE and TRUNCATE are
--      refused by triggers (function public.answer_path_cutovers_append_only, callable by no API role).
--   2. Exactly one row: ('h5_m2', clock_timestamp() after the drain, closed_before, this file's name).
--   The table exists ONLY together with its row (readiness CUT-02 can only see the table).
--
-- GUARD
--   * Transaction 1 must be committed: the end state of readiness CUT-01 holds (same assertion as
--     there, including: no other function in public bears a legacy name). Otherwise refused, nothing
--     changed.
--   * Visibility, fail-closed: the running role must be a superuser or a member of pg_read_all_stats
--     (production: postgres is, catalog 2026-11-05), and no client session of this database may show
--     a NULL state (= hidden from us). Otherwise refused: an invisible session would read as "none".
--   * Drain: pg_stat_activity is re-read (pg_stat_clear_snapshot) every 100 ms; waited for are client
--     backends of this database, other than this one, with xact_start < closed_before — "idle in
--     transaction" included. No session is cancelled or terminated (no pg_cancel_backend /
--     pg_terminate_backend).
--   * Hard limit 30 s (production: authenticator's statement_timeout is 8 s, so a PostgREST call never
--     needs longer; anything older is not an answer in flight and must be looked at by a person). The
--     setting app.h5_m2_drain_timeout_s may only LOWER it (1–30; tests use it); anything else is
--     ignored. On timeout: RAISE with pid, role, state and age (never query text) — nothing registered,
--     the table does not exist, the REVOKE of transaction 1 stays (the safe direction). Investigate,
--     then run this file again; runbook §9.5 / docs/operations/h5-m2-rollback.md.
--   * A second run after a successful one changes nothing (the existing registration is kept; T is
--     never moved or duplicated).
-- ============================================================================

DO $m2register$
DECLARE
  c_file constant text := '20261105120100_h5_m2_register_cutover.sql';
  v_pqa oid := to_regprocedure('public.process_question_attempt(uuid,uuid,text,bigint)');
  v_pta oid := to_regprocedure('public.process_text_answer(uuid,uuid,text,boolean)');
  v_legacy oid[];
  v_limit_s integer := 30;
  v_setting text := current_setting('app.h5_m2_drain_timeout_s', true);
  v_closed_before timestamptz;
  v_db oid := (SELECT oid FROM pg_catalog.pg_database WHERE datname = current_database());
  v_waiting bigint;
  v_hidden bigint;
  v_found text;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  -- ── Already registered: nothing to do (T is never moved) ───────────────────────────────────────
  IF to_regclass('public.answer_path_cutovers') IS NOT NULL THEN
    IF (SELECT count(*) FROM public.answer_path_cutovers WHERE cutover = 'h5_m2') = 1 THEN
      RAISE NOTICE 'M2 (registrér): T er allerede registreret; intet ændret';
      RETURN;
    END IF;
    RAISE EXCEPTION 'M2 (registrér): answer_path_cutovers findes uden rækken for h5_m2 — uventet tilstand; intet ændret';
  END IF;

  -- ── Transaction 1 must be committed: CUT-01's end state ────────────────────────────────────────
  IF v_pqa IS NULL OR v_pta IS NULL THEN
    RAISE EXCEPTION 'M2 (registrér): legacy-funktionerne findes ikke med de forventede signaturer; intet ændret';
  END IF;
  v_legacy := ARRAY[v_pqa, v_pta];
  SELECT string_agg(DISTINCT rt.rolname || '→' || x.rolname, ', ') INTO v_found
    FROM pg_catalog.pg_roles rt
    JOIN pg_catalog.pg_roles x ON pg_has_role(rt.oid, x.oid, 'MEMBER')
    CROSS JOIN unnest(v_legacy) AS f(oid)
   WHERE rt.rolname IN ('anon', 'authenticated', 'service_role', 'authenticator')
     AND has_function_privilege(x.oid, f.oid, 'EXECUTE');
  IF v_found IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
                  CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                 WHERE p.oid = ANY (v_legacy) AND a.grantee = 0 AND a.privilege_type = 'EXECUTE')
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles r CROSS JOIN unnest(v_legacy) AS f(oid)
                  JOIN pg_catalog.pg_proc p ON p.oid = f.oid
                 WHERE NOT r.rolsuper AND r.oid <> p.proowner AND has_function_privilege(r.oid, f.oid, 'EXECUTE'))
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname IN ('process_question_attempt', 'process_text_answer')
                   AND p.oid <> ALL (v_legacy)) THEN
    RAISE EXCEPTION 'M2 (registrér): legacy-vejen er ikke lukket (%) — anvend og commit transaktion 1 (20261105120000) først; intet ændret',
      coalesce(v_found, 'PUBLIC, anden rolle eller en anden funktion med legacy-navnet');
  END IF;

  -- ── Visibility (fail-closed) ───────────────────────────────────────────────────────────────────
  IF NOT (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname = current_user)
     AND NOT pg_has_role(current_user, 'pg_read_all_stats', 'MEMBER') THEN
    RAISE EXCEPTION 'M2 (registrér): rollen % kan ikke se andre sessioners transaktioner (pg_read_all_stats mangler); intet registreret', current_user;
  END IF;

  IF v_setting ~ '^[0-9]{1,2}$' AND v_setting::integer BETWEEN 1 AND 30 THEN
    v_limit_s := v_setting::integer;
  END IF;

  -- ── Drain ──────────────────────────────────────────────────────────────────────────────────────
  v_closed_before := clock_timestamp();
  LOOP
    PERFORM pg_stat_clear_snapshot();
    SELECT count(*) FILTER (WHERE a.state IS NULL),
           count(*) FILTER (WHERE a.xact_start IS NOT NULL AND a.xact_start < v_closed_before)
      INTO v_hidden, v_waiting
      FROM pg_catalog.pg_stat_activity a
     WHERE a.backend_type = 'client backend' AND a.pid <> pg_backend_pid() AND a.datid = v_db;
    IF v_hidden > 0 THEN
      RAISE EXCEPTION 'M2 (registrér): % klientsession(er) er skjult for rollen % — dræn kan ikke afgøres; intet registreret', v_hidden, current_user;
    END IF;
    EXIT WHEN v_waiting = 0;
    IF clock_timestamp() >= v_closed_before + make_interval(secs => v_limit_s) THEN
      SELECT string_agg(format('pid %s (%s, %s, %s s)', a.pid, coalesce(a.usename, '?'), a.state,
                               round(extract(epoch FROM clock_timestamp() - a.xact_start))::text), '; ' ORDER BY a.xact_start)
        INTO v_found
        FROM pg_catalog.pg_stat_activity a
       WHERE a.backend_type = 'client backend' AND a.pid <> pg_backend_pid() AND a.datid = v_db
         AND a.xact_start IS NOT NULL AND a.xact_start < v_closed_before;
      RAISE EXCEPTION 'M2 (registrér): tidsgrænsen på % s er overskredet; transaktioner fra før lukningen er stadig åbne: %. Intet registreret; legacy-vejen forbliver lukket (runbook §9.5)',
        v_limit_s, coalesce(v_found, '(afsluttet under aflæsningen)');
    END IF;
    PERFORM pg_sleep(0.1);
  END LOOP;

  -- ── Register (only now) ────────────────────────────────────────────────────────────────────────
  CREATE TABLE public.answer_path_cutovers (
    cutover       text        PRIMARY KEY CHECK (cutover IN ('h5_m2')),
    effective_at  timestamptz NOT NULL,
    closed_before timestamptz NOT NULL,
    migration     text        NOT NULL,
    CONSTRAINT answer_path_cutovers_closed_before_effective CHECK (closed_before <= effective_at)
  );
  COMMENT ON TABLE public.answer_path_cutovers IS
    'H5 M2: the documented cutover time T per answer path (runbook §9.1). Append-only; written once by 20261105120100.';
  ALTER TABLE public.answer_path_cutovers ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON TABLE public.answer_path_cutovers FROM PUBLIC, anon, authenticated, service_role;
  GRANT SELECT ON TABLE public.answer_path_cutovers TO service_role;

  CREATE FUNCTION public.answer_path_cutovers_append_only() RETURNS trigger
    LANGUAGE plpgsql SET search_path = pg_catalog AS $fn$
  BEGIN
    RAISE EXCEPTION 'answer_path_cutovers er append-only: % er ikke tilladt', TG_OP USING ERRCODE = '42501';
  END
  $fn$;
  REVOKE ALL ON FUNCTION public.answer_path_cutovers_append_only() FROM PUBLIC, anon, authenticated, service_role;
  CREATE TRIGGER answer_path_cutovers_no_update_delete BEFORE UPDATE OR DELETE ON public.answer_path_cutovers
    FOR EACH ROW EXECUTE FUNCTION public.answer_path_cutovers_append_only();
  CREATE TRIGGER answer_path_cutovers_no_truncate BEFORE TRUNCATE ON public.answer_path_cutovers
    FOR EACH STATEMENT EXECUTE FUNCTION public.answer_path_cutovers_append_only();

  INSERT INTO public.answer_path_cutovers (cutover, effective_at, closed_before, migration)
  VALUES ('h5_m2', clock_timestamp(), v_closed_before, c_file);

  RAISE NOTICE 'M2 (registrér): T registreret (closed_before %, ventetid % s)',
    v_closed_before, round(extract(epoch FROM clock_timestamp() - v_closed_before)::numeric, 3);
END
$m2register$;
