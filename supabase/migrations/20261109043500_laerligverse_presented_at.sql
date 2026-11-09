-- ============================================================================
-- Lærligverse K9 (docs/learning-progression-l1-contracts.md §K9; docs/laerligverse/eksponering-datakontrakt.md):
-- the SERVER records WHEN it was told that a round's content was presented — once per round, in server time,
-- only between delivery and the answer. PROTOTYPE.
--
-- NOT APPLIED IN PRODUCTION. Applying it needs a separate owner authorisation (D-110,
-- docs/migration-workflow-policy.md): apply_migration only, never the CLI's push. Nothing calls it: no Edge
-- Function exposes mark_presented yet (see the contract, §6).
--
-- WHAT IT MEANS — AND WHAT IT DOES NOT: presented_at is the moment the server RECEIVED the client's report that
-- the content was on screen. It never proves that the pupil read, saw or understood anything. A client can only
-- report late or not at all; neither can make an answer count for more (K9's manipulation table).
--
-- DEPENDS ON: L1 K1 (20261103110000: served_at) and Lærligverse L3/L5 (20261108043500: it removed table-level
-- UPDATE on question_instances from anon/authenticated, so a NEW column carries no client privilege at all).
-- Both are NOT applied in production. Order: K1 → L3/L5 → THIS FILE.
--
-- WHAT CHANGES (and nothing else)
--   1. question_instances.presented_at timestamptz NULL, owned by trigger question_instances_presented_at:
--        * INSERT: NULL (a new round has not been presented);
--        * reopen (answered true → false): NULL — a new round;
--        * set once: once set, every later UPDATE keeps it byte for byte (even service_role's);
--        * setting it is refused (23514) on an answered round, in the statement that answers, before the round's
--          delivery (served_at, else created_at) or later than the server clock.
--   2. public.mark_presented(p_student_id, p_question_instance_id, p_round_no) → jsonb, SECURITY INVOKER,
--      EXECUTE for service_role only. It locks the pupil's row and returns:
--        recorded      presented_at := now() (server time) for the current open round
--        replay        already recorded for this round: the stored time, nothing written
--        not_found     no such instance for this pupil
--        stale_round   not the instance's current round
--        round_closed  the round is answered: nothing written
--        invalid_request  missing_identity | invalid_round | round_ahead
--   No row is written by this file. No backfill. presented_at feeds no XP, coins, mastery, level or teacher statistic.
--
-- ROLLBACK: DROP FUNCTION public.mark_presented(uuid,uuid,integer); DROP TRIGGER question_instances_presented_at
--   ON public.question_instances; DROP FUNCTION public.question_instances_presented_at();
--   ALTER TABLE public.question_instances DROP COLUMN presented_at;
-- ============================================================================

DO $k9$
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = 'public.question_instances'::regclass
                 AND attname = 'served_at' AND NOT attisdropped)
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = 'public.question_instances'::regclass
                    AND attname = 'served_mode' AND NOT attisdropped)
     OR to_regprocedure('public.request_question_hint(uuid,uuid,integer,integer,uuid)') IS NULL THEN
    RAISE EXCEPTION 'K9: K1 (20261103110000) og L3/L5 (20261108043500) skal være anvendt først; intet ændret';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = 'public.question_instances'::regclass
             AND attname = 'presented_at' AND NOT attisdropped) THEN
    IF (SELECT md5(prosrc) FROM pg_catalog.pg_proc WHERE oid = to_regprocedure('public.question_instances_presented_at()')) IS DISTINCT FROM '73ba0a0df355e7ee9657eb33ec1b805e'
       OR (SELECT md5(prosrc) FROM pg_catalog.pg_proc WHERE oid = to_regprocedure('public.mark_presented(uuid,uuid,integer)')) IS DISTINCT FROM '88c56f9279f5c1a98672ceb2db151a59' THEN
      RAISE EXCEPTION 'K9: kolonnen presented_at findes, men funktionerne er ukendte; intet ændret';
    END IF;
    RAISE NOTICE 'K9: allerede anvendt; intet ændret';
    RETURN;
  END IF;

  -- The API roles must hold no table-level UPDATE (L3/L5 moved it to column level): then the new column is
  -- invisible and unwritable for them without any further statement.
  IF has_table_privilege('anon', 'public.question_instances', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.question_instances', 'UPDATE')
     OR has_table_privilege('anon', 'public.question_instances', 'INSERT')
     OR has_table_privilege('authenticated', 'public.question_instances', 'INSERT') THEN
    RAISE EXCEPTION 'K9: anon/authenticated har tabelrettigheder på question_instances, som L3/L5 skulle have fjernet; intet ændret';
  END IF;

  EXECUTE $k9_ddl$ALTER TABLE public.question_instances ADD COLUMN presented_at timestamptz$k9_ddl$;

  EXECUTE $k9_ddl$COMMENT ON COLUMN public.question_instances.presented_at IS
  'K9: when the SERVER received the report that this round was presented (server time, set once per round, only between delivery and the answer; NULL on reopen). Never proof of reading or understanding.'$k9_ddl$;

  EXECUTE $k9_ddl$CREATE FUNCTION public.question_instances_presented_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.presented_at := NULL;
    RETURN NEW;
  END IF;
  IF OLD.answered IS TRUE AND NEW.answered IS NOT TRUE THEN
    -- A reopen starts a new round, which has not been presented.
    NEW.presented_at := NULL;
    RETURN NEW;
  END IF;
  IF OLD.presented_at IS NOT NULL THEN
    -- Set once per round.
    NEW.presented_at := OLD.presented_at;
    RETURN NEW;
  END IF;
  IF NEW.presented_at IS NOT NULL THEN
    IF OLD.answered IS TRUE OR NEW.answered IS TRUE
       OR NEW.presented_at < coalesce(OLD.served_at, OLD.created_at)
       OR NEW.presented_at > clock_timestamp() THEN
      RAISE EXCEPTION 'presented_at: only once, between delivery and the answer, in server time'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$$k9_ddl$;

  EXECUTE $k9_ddl$REVOKE ALL ON FUNCTION public.question_instances_presented_at() FROM PUBLIC, anon, authenticated, service_role$k9_ddl$;

  EXECUTE $k9_ddl$CREATE TRIGGER question_instances_presented_at
  BEFORE INSERT OR UPDATE ON public.question_instances
  FOR EACH ROW EXECUTE FUNCTION public.question_instances_presented_at()$k9_ddl$;

  EXECUTE $k9_ddl$CREATE FUNCTION public.mark_presented(
  p_student_id           uuid,
  p_question_instance_id uuid,
  p_round_no             integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_inst record;
  v_at   timestamptz;
BEGIN
  IF p_student_id IS NULL OR p_question_instance_id IS NULL THEN
    RETURN jsonb_build_object('outcome', 'invalid_request', 'reason', 'missing_identity');
  END IF;
  IF p_round_no IS NULL OR p_round_no < 1 THEN
    RETURN jsonb_build_object('outcome', 'invalid_request', 'reason', 'invalid_round');
  END IF;

  SELECT qi.answered, qi.repeat_count, qi.presented_at INTO v_inst
  FROM public.question_instances qi
  WHERE qi.id = p_question_instance_id AND qi.student_id = p_student_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'not_found');
  END IF;
  IF p_round_no < v_inst.repeat_count + 1 THEN
    RETURN jsonb_build_object('outcome', 'stale_round');
  END IF;
  IF p_round_no > v_inst.repeat_count + 1 THEN
    RETURN jsonb_build_object('outcome', 'invalid_request', 'reason', 'round_ahead');
  END IF;
  IF v_inst.presented_at IS NOT NULL THEN
    RETURN jsonb_build_object('outcome', 'replay', 'round_no', p_round_no, 'presented_at', v_inst.presented_at);
  END IF;
  IF v_inst.answered THEN
    RETURN jsonb_build_object('outcome', 'round_closed');
  END IF;

  UPDATE public.question_instances qi SET presented_at = now()
  WHERE qi.id = p_question_instance_id AND qi.student_id = p_student_id
  RETURNING qi.presented_at INTO v_at;
  RETURN jsonb_build_object('outcome', 'recorded', 'round_no', p_round_no, 'presented_at', v_at);
END;
$function$$k9_ddl$;

  EXECUTE $k9_ddl$REVOKE ALL ON FUNCTION public.mark_presented(uuid,uuid,integer) FROM PUBLIC, anon, authenticated, service_role$k9_ddl$;
  EXECUTE $k9_ddl$GRANT EXECUTE ON FUNCTION public.mark_presented(uuid,uuid,integer) TO service_role$k9_ddl$;

  IF (SELECT md5(prosrc) FROM pg_catalog.pg_proc WHERE oid = to_regprocedure('public.question_instances_presented_at()')) IS DISTINCT FROM '73ba0a0df355e7ee9657eb33ec1b805e'
     OR (SELECT md5(prosrc) FROM pg_catalog.pg_proc WHERE oid = to_regprocedure('public.mark_presented(uuid,uuid,integer)')) IS DISTINCT FROM '88c56f9279f5c1a98672ceb2db151a59'
     OR has_column_privilege('anon', 'public.question_instances', 'presented_at', 'SELECT')
     OR has_column_privilege('anon', 'public.question_instances', 'presented_at', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.question_instances', 'presented_at', 'SELECT')
     OR has_column_privilege('authenticated', 'public.question_instances', 'presented_at', 'UPDATE')
     OR has_function_privilege('anon', 'public.mark_presented(uuid,uuid,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.mark_presented(uuid,uuid,integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.mark_presented(uuid,uuid,integer)', 'EXECUTE')
     OR (SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid = to_regprocedure('public.mark_presented(uuid,uuid,integer)'))
     OR (SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid = to_regprocedure('public.question_instances_presented_at()')) THEN
    RAISE EXCEPTION 'K9: resultatet blev ikke som forventet; intet ændret';
  END IF;
END
$k9$;
