-- ============================================================================
-- Lærligverse L5 + L3 (D-277 track; docs/learning-progression-l1-contracts.md §K1 "Senere";
-- docs/laerligverse/evidens-datakontrakt.md §2/§3): the SERVER records the activity mode each round was
-- served in, and keeps its own log of the hints a pupil asked for — so that process-event can derive
-- question_attempts.mode and .hints_used from server facts, never from the request body.
--
-- NOT APPLIED IN PRODUCTION. Applying it needs a separate owner authorisation (D-110,
-- docs/migration-workflow-policy.md): apply_migration only, never the CLI's push. Nothing here switches
-- anything on: get-next-question writes served_mode only with LAERLIGVERSE_SERVED_MODE=on, process-event
-- reads it (and the hint log) only with LAERLIGVERSE_ATTEMPT_CONTEXT=on, and the request-hint function
-- answers only with LAERLIGVERSE_HINTS=on — three Edge secrets, each a separate owner decision, all unset.
--
-- DEPENDS ON: L1 K1 (20261103110000, NOT applied in production) — the hint text is read from the round's
-- delivered snapshot (question_instances.served_snapshot) when there is one, and the mode/hints this file
-- makes derivable are only recorded by K1's _v2 functions, which the two wrappers below call UNCHANGED. The
-- guard pins K1's two _v2 bodies (md5 439186fa… / 809675f9…, signatures with p_mode text, p_hints_used
-- integer): a K1 change must be reviewed here first. Order: K1 → THIS FILE. Nothing else unapplied.
-- Compatible with the anti-guess cooldown (20261105130000, #610, not applied either), in either order: it only
-- adds triggers on question_instances and changes none of its privileges or policies; its trigger fires
-- inside _v2, i.e. inside the wrappers' transaction, and its refusal (LQ429) propagates unchanged.
--
-- PRIVILEGE PRE-STATE (verified, fails loud otherwise): on question_instances anon and authenticated hold
-- exactly the table-level privileges UPDATE, DELETE, REFERENCES, TRIGGER (catalog "wdxt": no INSERT since
-- 20261015120000, no SELECT since 20261018170000, no TRUNCATE/MAINTAIN since 20261027160000), PUBLIC holds
-- nothing, and the only column-level privilege of either role is SELECT. Before applying in production a
-- read-only catalog check must confirm the same (relacl and attacl of public.question_instances).
--
-- WHAT CHANGES (and nothing else)
--   1. question_instances.served_mode text NULL, CHECK in (quiz_v1, practice, check, review, application).
--      NULL = no mode recorded (every existing row, every round get-next-question serves without the flag):
--      process-event then sends 'quiz_v1', which is never evidence.
--      A trigger (question_instances_served_mode) owns it:
--        * INSERT of an open round: the proposed value is kept, but a value other than quiz_v1 must be the
--          mode of the question row's learning_step (guided_practice/revision → practice,
--          independent_application → check, transfer → application, revisit → review — the STEPS table of
--          supabase/functions/_shared/learning-sequence.ts); anything else is refused (23514).
--        * INSERT of an answered row: NULL.
--        * a reopen (answered true → false, the repeat functions): NULL — a new round has no served mode
--          until the server records one; an earlier round's mode lives in its attempt row.
--        * any other UPDATE: the round's value is kept byte for byte (nobody can rewrite it, not even
--          service_role).
--      Privileges: anon and authenticated lose table-level UPDATE on question_instances and get column-level
--      UPDATE on every OTHER column back, so their effective privileges on the existing columns are exactly
--      as before (RLS still has no UPDATE policy) and they can neither read nor write served_mode (no
--      SELECT, INSERT or UPDATE — the same pattern 20261018170000 used for SELECT; the table-level
--      REFERENCES they already hold covers it like every column and grants neither read nor write).
--   2. public.question_hint_requests: an append-only server log, one row per hint level per round
--      (student, instance, round_no, hint_level 1..3, request_id UUID, requested_at). UNIQUE(student_id,
--      request_id) makes a retry return the same row; UNIQUE(question_instance_id, round_no, hint_level)
--      means a level is counted once per round, whatever the client sends. RLS on, no policy, no privilege
--      for PUBLIC/anon/authenticated; service_role may SELECT and INSERT only (no UPDATE, no DELETE).
--      The foreign key to the instance is ON DELETE CASCADE: release_open_question_outside deletes an open
--      round-1 instance on a subject switch, and an unanswered round's hints must not block that. Answered
--      rounds with an attempt cannot be deleted at all (question_attempts' key is NO ACTION, D-327), so
--      their hints stay beside the attempt.
--   3. public.request_question_hint(student, instance, round, level, request_id) → jsonb, SECURITY INVOKER,
--      EXECUTE for service_role only (the request-hint Edge Function calls it through the admin client with
--      the verified user id, after its own checks). It locks the instance row, and:
--        recorded          a new log row; the hint text of that level
--        replay            the same request_id again for the same instance/round/level: the stored row,
--                          nothing written
--        already_recorded  the level was already logged for this round under another request id: that
--                          row, nothing written (a level is never counted twice)
--        hint_unavailable  the round's content has no hint at that level: nothing written (no help given,
--                          nothing to count)
--        request_conflict  the request_id was used for another instance, round or level
--        not_found         no such instance for this pupil (a foreign instance is indistinguishable)
--        stale_round       the round is not the instance's current round
--        round_closed      the current round is already answered
--        invalid_request   reason missing_identity | invalid_round | invalid_level | round_ahead |
--                          level_out_of_order (level n needs n-1 logged first)
--      Hint text: content.hints of the round's delivered snapshot (K1), else of the question row — an array
--      of strings; the levels available are the leading non-blank strings, at most 3. No content in the
--      repository has content.hints yet (2026-11-08): until content supplies them, every request is
--      hint_unavailable. The text is never stored in the log and never part of the public DTO
--      (_shared/question-dto.ts PUBLIC_CONTENT_KEYS).
--   4. ATOMIC ATTEMPT CONTEXT: public.process_question_attempt_with_context(…7 args…) and
--      public.process_text_answer_with_context(…8 args…) → jsonb, SECURITY INVOKER, EXECUTE for service_role
--      only. process-event (LAERLIGVERSE_ATTEMPT_CONTEXT=on, H5 path) calls them INSTEAD of K1's _v2 and sends
--      no mode or hints at all. In ONE transaction each wrapper
--        a. locks the pupil's question_instances row FOR UPDATE — the same row lock request_question_hint
--           takes, so a hint request and an answer for one instance are strictly ordered;
--        b. derives p_mode = served_mode (NULL → quiz_v1) and p_hints_used = the number of distinct
--           hint_level rows logged for (instance, pupil, p_round_no), at most 3, read AFTER the lock;
--        c. calls K1's _v2 unchanged with those two values and returns its jsonb verbatim (every outcome,
--           replay included: a replay returns the attempt row's ORIGINAL values, never re-counted).
--      Order under contention: a hint committed before the answer's lock is counted; a hint that waits on
--      the lock re-reads the row after the answer committed, sees answered = true and is refused
--      (round_closed). The attempt row is append-only (H5's trigger question_attempts_append_only; no API
--      role may write question_attempts), so hints_used can never be changed after registration.
--   Hints change no XP, coins, streak, quest, mastery, level or teacher statistic: nothing here touches
--   those tables, and none of them reads question_hint_requests.
--   No row is written by this file. No backfill.
--
-- GUARD AND ATOMICITY: one DO block (all or nothing; lock_timeout inside it). K1 must be applied
-- (question_attempts.mode and question_instances.served_snapshot exist). A second run on a database that
-- already has this file (both function bodies, md5 below) changes nothing; anything else stops it. The
-- result is verified at the end (privileges, RLS, trigger) or the whole file rolls back.
--
-- ROLLBACK (no row may have been written to question_hint_requests; served_mode is dropped with its data):
--   DROP FUNCTION public.process_question_attempt_with_context(uuid,uuid,text,integer,uuid,text,text);
--   DROP FUNCTION public.process_text_answer_with_context(uuid,uuid,text,boolean,integer,uuid,text,text);
--   DROP FUNCTION public.request_question_hint(uuid,uuid,integer,integer,uuid);
--   DROP TABLE public.question_hint_requests;
--   DROP TRIGGER question_instances_served_mode ON public.question_instances;
--   DROP FUNCTION public.question_instances_served_mode();
--   ALTER TABLE public.question_instances DROP COLUMN served_mode;
--   then restore table-level UPDATE: REVOKE UPDATE (all columns) and GRANT UPDATE ON public.question_instances
--   TO anon, authenticated (the state before this file).
-- ============================================================================

DO $l35$
DECLARE
  v_role text;
  v_cols text;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  IF to_regclass('public.question_attempts') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = 'public.question_attempts'::regclass
                    AND attname = 'mode' AND NOT attisdropped)
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = 'public.question_instances'::regclass
                    AND attname = 'served_snapshot' AND NOT attisdropped)
     OR to_regprocedure('public.process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text,text,integer)') IS NULL THEN
    RAISE EXCEPTION 'L3/L5: L1 K1 (20261103110000) er ikke anvendt — anvend K1 først; intet ændret';
  END IF;

  -- The wrappers call K1's _v2 unchanged: their bodies must be the reviewed K1 bodies.
  IF (SELECT md5(prosrc) FROM pg_catalog.pg_proc WHERE oid = to_regprocedure('public.process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text,text,integer)')) IS DISTINCT FROM '439186fa94119fec02b8f282eb75dbbd'
     OR (SELECT md5(prosrc) FROM pg_catalog.pg_proc WHERE oid = to_regprocedure('public.process_text_answer_v2(uuid,uuid,text,boolean,integer,uuid,text,text,text,integer)')) IS DISTINCT FROM '809675f9071eb2a62d1c9a9b2628bc84' THEN
    RAISE EXCEPTION 'L3/L5: K1''s _v2-funktioner har ikke de gennemgåede kroppe; intet ændret';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = 'public.question_instances'::regclass
             AND attname = 'served_mode' AND NOT attisdropped) THEN
    IF (SELECT md5(prosrc) FROM pg_catalog.pg_proc WHERE oid = to_regprocedure('public.question_instances_served_mode()')) IS DISTINCT FROM 'af725afa35dcae57ff14a20be9b754ab'
       OR (SELECT md5(prosrc) FROM pg_catalog.pg_proc WHERE oid = to_regprocedure('public.request_question_hint(uuid,uuid,integer,integer,uuid)')) IS DISTINCT FROM 'f02402e6a546ad3b3c3351182b32148b'
       OR (SELECT md5(prosrc) FROM pg_catalog.pg_proc WHERE oid = to_regprocedure('public.process_question_attempt_with_context(uuid,uuid,text,integer,uuid,text,text)')) IS DISTINCT FROM '05ce60912618d33bb29790289c8984f9'
       OR (SELECT md5(prosrc) FROM pg_catalog.pg_proc WHERE oid = to_regprocedure('public.process_text_answer_with_context(uuid,uuid,text,boolean,integer,uuid,text,text)')) IS DISTINCT FROM 'fdd851a11f5418e7652310e269b3fb2a'
       OR to_regclass('public.question_hint_requests') IS NULL THEN
      RAISE EXCEPTION 'L3/L5: kolonnen served_mode findes, men funktionerne eller hint-loggen er ukendte; intet ændret';
    END IF;
    RAISE NOTICE 'L3/L5: allerede anvendt; intet ændret';
    RETURN;
  END IF;

  IF to_regclass('public.question_hint_requests') IS NOT NULL
     OR to_regprocedure('public.request_question_hint(uuid,uuid,integer,integer,uuid)') IS NOT NULL
     OR to_regprocedure('public.question_instances_served_mode()') IS NOT NULL
     OR to_regprocedure('public.process_question_attempt_with_context(uuid,uuid,text,integer,uuid,text,text)') IS NOT NULL
     OR to_regprocedure('public.process_text_answer_with_context(uuid,uuid,text,boolean,integer,uuid,text,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'L3/L5: hint-loggen eller en funktion findes allerede uden served_mode; intet ændret';
  END IF;

  -- Privilege pre-state (see the header): the column-level rework below is derived from exactly this.
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_class c, LATERAL aclexplode(c.relacl) x
             WHERE c.oid = 'public.question_instances'::regclass AND x.grantee = 0)
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a, LATERAL aclexplode(a.attacl) x
                WHERE a.attrelid = 'public.question_instances'::regclass AND a.attnum > 0 AND NOT a.attisdropped
                  AND (x.grantee = 0 OR (x.grantee IN (SELECT oid FROM pg_catalog.pg_roles WHERE rolname IN ('anon', 'authenticated'))
                                         AND x.privilege_type <> 'SELECT')))
     OR (SELECT string_agg(r.rolname || ':' || x.privilege_type, ',' ORDER BY r.rolname, x.privilege_type)
         FROM pg_catalog.pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) x JOIN pg_catalog.pg_roles r ON r.oid = x.grantee
         WHERE c.oid = 'public.question_instances'::regclass AND r.rolname IN ('anon', 'authenticated'))
        IS DISTINCT FROM 'anon:DELETE,anon:REFERENCES,anon:TRIGGER,anon:UPDATE,authenticated:DELETE,authenticated:REFERENCES,authenticated:TRIGGER,authenticated:UPDATE' THEN
    RAISE EXCEPTION 'L3/L5: rettighederne på question_instances er ikke de forventede (anon/authenticated: UPDATE, DELETE, REFERENCES, TRIGGER; kolonner kun SELECT); intet ændret';
  END IF;

  -- ── 1. L5: served_mode ─────────────────────────────────────────────────────
  EXECUTE $l35_ddl$ALTER TABLE public.question_instances
    ADD COLUMN served_mode text
      CONSTRAINT question_instances_served_mode_check
      CHECK (served_mode IN ('quiz_v1', 'practice', 'check', 'review', 'application'))$l35_ddl$;

  EXECUTE $l35_ddl$COMMENT ON COLUMN public.question_instances.served_mode IS
  'L5: the activity mode the SERVER served this round in (get-next-question, LAERLIGVERSE_SERVED_MODE=on, a server-directed sequence step). NULL = not recorded: process-event sends quiz_v1, never evidence. Owned by trigger question_instances_served_mode: kept within a round, NULL on reopen. No client privilege.'$l35_ddl$;

  EXECUTE $l35_ddl$CREATE FUNCTION public.question_instances_served_mode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_step_mode text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.answered IS TRUE AND NEW.answered IS NOT TRUE THEN
      -- A reopen starts a new round: no served mode until the server records one.
      NEW.served_mode := NULL;
    ELSE
      -- Within a round the served mode never changes.
      NEW.served_mode := OLD.served_mode;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.answered IS TRUE THEN
    NEW.served_mode := NULL;
    RETURN NEW;
  END IF;

  IF NEW.served_mode IS NOT NULL AND NEW.served_mode <> 'quiz_v1' THEN
    SELECT CASE q.metadata ->> 'learning_step'
             WHEN 'guided_practice' THEN 'practice'
             WHEN 'revision' THEN 'practice'
             WHEN 'independent_application' THEN 'check'
             WHEN 'transfer' THEN 'application'
             WHEN 'revisit' THEN 'review'
           END
      INTO v_step_mode
      FROM public.questions q WHERE q.id = NEW.question_id;
    IF v_step_mode IS DISTINCT FROM NEW.served_mode THEN
      RAISE EXCEPTION 'served mode %: not the mode of question %''s learning step', NEW.served_mode, NEW.question_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$$l35_ddl$;

  EXECUTE $l35_ddl$REVOKE ALL ON FUNCTION public.question_instances_served_mode() FROM PUBLIC, anon, authenticated, service_role$l35_ddl$;

  EXECUTE $l35_ddl$CREATE TRIGGER question_instances_served_mode
  BEFORE INSERT OR UPDATE ON public.question_instances
  FOR EACH ROW EXECUTE FUNCTION public.question_instances_served_mode()$l35_ddl$;

  -- Column-level UPDATE for the API roles that held table-level UPDATE: every column except served_mode.
  SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum) INTO v_cols
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = 'public.question_instances'::regclass AND a.attnum > 0 AND NOT a.attisdropped
    AND a.attname <> 'served_mode';
  FOR v_role IN
    SELECT r.rolname FROM pg_catalog.pg_roles r
    WHERE r.rolname IN ('anon', 'authenticated')
      AND EXISTS (SELECT 1 FROM pg_catalog.pg_class c, LATERAL aclexplode(c.relacl) x
                  WHERE c.oid = 'public.question_instances'::regclass AND x.grantee = r.oid AND x.privilege_type = 'UPDATE')
    ORDER BY r.rolname
  LOOP
    EXECUTE format('REVOKE UPDATE ON public.question_instances FROM %I', v_role);
    EXECUTE format('GRANT UPDATE (%s) ON public.question_instances TO %I', v_cols, v_role);
  END LOOP;

  -- ── 2. L3: the server's hint log ───────────────────────────────────────────
  EXECUTE $l35_ddl$CREATE TABLE public.question_hint_requests (
    id                   uuid        NOT NULL DEFAULT gen_random_uuid(),
    student_id           uuid        NOT NULL,
    question_instance_id uuid        NOT NULL,
    round_no             integer     NOT NULL,
    hint_level           smallint    NOT NULL,
    request_id           uuid        NOT NULL,
    requested_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT question_hint_requests_pkey PRIMARY KEY (id),
    CONSTRAINT question_hint_requests_round_check CHECK (round_no >= 1),
    CONSTRAINT question_hint_requests_level_check CHECK (hint_level BETWEEN 1 AND 3),
    CONSTRAINT question_hint_requests_request_key UNIQUE (student_id, request_id),
    CONSTRAINT question_hint_requests_level_key UNIQUE (question_instance_id, round_no, hint_level),
    CONSTRAINT question_hint_requests_instance_fkey FOREIGN KEY (question_instance_id, student_id)
      REFERENCES public.question_instances (id, student_id) ON DELETE CASCADE
  )$l35_ddl$;

  EXECUTE $l35_ddl$COMMENT ON TABLE public.question_hint_requests IS
  'L3: append-only server log of the hint levels a pupil asked for, per instance and round. Written only by request_question_hint (service_role). process-event (LAERLIGVERSE_ATTEMPT_CONTEXT=on) counts the distinct levels of the round as question_attempts.hints_used. Feeds no XP, coins, mastery, level or teacher statistic.'$l35_ddl$;

  EXECUTE $l35_ddl$ALTER TABLE public.question_hint_requests ENABLE ROW LEVEL SECURITY$l35_ddl$;
  EXECUTE $l35_ddl$REVOKE ALL ON TABLE public.question_hint_requests FROM PUBLIC, anon, authenticated, service_role$l35_ddl$;
  EXECUTE $l35_ddl$GRANT SELECT, INSERT ON TABLE public.question_hint_requests TO service_role$l35_ddl$;

  EXECUTE $l35_ddl$CREATE FUNCTION public.request_question_hint(
  p_student_id           uuid,
  p_question_instance_id uuid,
  p_round_no             integer,
  p_level                integer,
  p_request_id           uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_inst    record;
  v_row     record;
  v_content jsonb;
  v_hints   jsonb := '[]'::jsonb;
  v_avail   integer := 0;
  v_text    text;
  i         integer;
BEGIN
  IF p_student_id IS NULL OR p_question_instance_id IS NULL OR p_request_id IS NULL THEN
    RETURN jsonb_build_object('outcome', 'invalid_request', 'reason', 'missing_identity');
  END IF;
  IF p_round_no IS NULL OR p_round_no < 1 THEN
    RETURN jsonb_build_object('outcome', 'invalid_request', 'reason', 'invalid_round');
  END IF;
  IF p_level IS NULL OR p_level < 1 OR p_level > 3 THEN
    RETURN jsonb_build_object('outcome', 'invalid_request', 'reason', 'invalid_level');
  END IF;

  -- The pupil's own instance, locked: hint requests for one instance are serialised, and an answer
  -- (which updates the row) is ordered strictly before or after this request.
  SELECT qi.id, qi.question_id, qi.answered, qi.repeat_count, qi.served_snapshot INTO v_inst
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

  -- The round's content: the delivered version (K1) when known, else the question row.
  v_content := coalesce(v_inst.served_snapshot -> 'content',
                        (SELECT q.content FROM public.questions q WHERE q.id = v_inst.question_id));
  IF jsonb_typeof(v_content -> 'hints') = 'array' THEN
    v_hints := v_content -> 'hints';
  END IF;
  FOR i IN 0 .. 2 LOOP
    EXIT WHEN jsonb_typeof(v_hints -> i) IS DISTINCT FROM 'string' OR btrim(v_hints ->> i, E' \t\n\r') = '';
    v_avail := i + 1;
  END LOOP;

  -- Idempotency on the request id: a retry gets the row it wrote, nothing new.
  SELECT h.* INTO v_row FROM public.question_hint_requests h
  WHERE h.student_id = p_student_id AND h.request_id = p_request_id;
  IF FOUND THEN
    IF v_row.question_instance_id <> p_question_instance_id OR v_row.round_no <> p_round_no OR v_row.hint_level <> p_level THEN
      RETURN jsonb_build_object('outcome', 'request_conflict');
    END IF;
    RETURN jsonb_build_object('outcome', 'replay', 'round_no', v_row.round_no, 'hint_level', v_row.hint_level,
      'hint_text', btrim(v_hints ->> (v_row.hint_level - 1), E' \t\n\r'), 'hints_available', v_avail,
      'request_id', v_row.request_id, 'requested_at', v_row.requested_at);
  END IF;

  IF v_inst.answered THEN
    RETURN jsonb_build_object('outcome', 'round_closed');
  END IF;

  SELECT h.* INTO v_row FROM public.question_hint_requests h
  WHERE h.question_instance_id = p_question_instance_id AND h.round_no = p_round_no AND h.hint_level = p_level;
  IF FOUND THEN
    RETURN jsonb_build_object('outcome', 'already_recorded', 'round_no', v_row.round_no, 'hint_level', v_row.hint_level,
      'hint_text', btrim(v_hints ->> (v_row.hint_level - 1), E' \t\n\r'), 'hints_available', v_avail,
      'request_id', v_row.request_id, 'requested_at', v_row.requested_at);
  END IF;

  IF p_level > 1 AND NOT EXISTS (SELECT 1 FROM public.question_hint_requests h
      WHERE h.question_instance_id = p_question_instance_id AND h.round_no = p_round_no AND h.hint_level = p_level - 1) THEN
    RETURN jsonb_build_object('outcome', 'invalid_request', 'reason', 'level_out_of_order');
  END IF;

  IF p_level > v_avail THEN
    RETURN jsonb_build_object('outcome', 'hint_unavailable', 'hints_available', v_avail);
  END IF;
  v_text := btrim(v_hints ->> (p_level - 1), E' \t\n\r');

  BEGIN
    INSERT INTO public.question_hint_requests (student_id, question_instance_id, round_no, hint_level, request_id)
    VALUES (p_student_id, p_question_instance_id, p_round_no, p_level, p_request_id)
    RETURNING * INTO v_row;
  EXCEPTION WHEN unique_violation THEN
    -- Same request id, concurrently, for another instance (one instance is serialised by the lock above).
    RETURN jsonb_build_object('outcome', 'request_conflict');
  END;

  RETURN jsonb_build_object('outcome', 'recorded', 'round_no', v_row.round_no, 'hint_level', v_row.hint_level,
    'hint_text', v_text, 'hints_available', v_avail,
    'request_id', v_row.request_id, 'requested_at', v_row.requested_at);
END;
$function$$l35_ddl$;

  EXECUTE $l35_ddl$REVOKE ALL ON FUNCTION public.request_question_hint(uuid,uuid,integer,integer,uuid) FROM PUBLIC, anon, authenticated, service_role$l35_ddl$;
  EXECUTE $l35_ddl$GRANT EXECUTE ON FUNCTION public.request_question_hint(uuid,uuid,integer,integer,uuid) TO service_role$l35_ddl$;

  -- ── 4. Atomic attempt context: lock, derive, call K1's _v2 unchanged ───────
  EXECUTE $l35_ddl$CREATE FUNCTION public.process_question_attempt_with_context(
  p_student_id           uuid,
  p_question_instance_id uuid,
  p_answer               text,
  p_round_no             integer,
  p_submission_id        uuid,
  p_review_text          text,
  p_misconception_type   text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_mode  text;
  v_hints integer;
BEGIN
  -- The pupil's round, locked: request_question_hint takes the same row lock, so no hint can be logged
  -- between the count below and the answer _v2 registers in this transaction.
  SELECT qi.served_mode INTO v_mode
  FROM public.question_instances qi
  WHERE qi.id = p_question_instance_id AND qi.student_id = p_student_id
  FOR UPDATE;
  v_mode := coalesce(v_mode, 'quiz_v1');

  SELECT least(3, count(DISTINCT h.hint_level))::integer INTO v_hints
  FROM public.question_hint_requests h
  WHERE h.question_instance_id = p_question_instance_id AND h.student_id = p_student_id
    AND h.round_no = p_round_no;

  RETURN public.process_question_attempt_v2(p_student_id, p_question_instance_id, p_answer, p_round_no,
    p_submission_id, p_review_text, p_misconception_type, v_mode, v_hints);
END;
$function$$l35_ddl$;

  EXECUTE $l35_ddl$CREATE FUNCTION public.process_text_answer_with_context(
  p_instance_id        uuid,
  p_user_id            uuid,
  p_user_answer        text,
  p_is_correct         boolean,
  p_round_no           integer,
  p_submission_id      uuid,
  p_review_text        text,
  p_misconception_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_mode  text;
  v_hints integer;
BEGIN
  -- As process_question_attempt_with_context: lock the round, derive mode and hints, then K1's _v2.
  SELECT qi.served_mode INTO v_mode
  FROM public.question_instances qi
  WHERE qi.id = p_instance_id AND qi.student_id = p_user_id
  FOR UPDATE;
  v_mode := coalesce(v_mode, 'quiz_v1');

  SELECT least(3, count(DISTINCT h.hint_level))::integer INTO v_hints
  FROM public.question_hint_requests h
  WHERE h.question_instance_id = p_instance_id AND h.student_id = p_user_id
    AND h.round_no = p_round_no;

  RETURN public.process_text_answer_v2(p_instance_id, p_user_id, p_user_answer, p_is_correct, p_round_no,
    p_submission_id, p_review_text, p_misconception_type, v_mode, v_hints);
END;
$function$$l35_ddl$;

  EXECUTE $l35_ddl$REVOKE ALL ON FUNCTION public.process_question_attempt_with_context(uuid,uuid,text,integer,uuid,text,text) FROM PUBLIC, anon, authenticated, service_role$l35_ddl$;
  EXECUTE $l35_ddl$GRANT EXECUTE ON FUNCTION public.process_question_attempt_with_context(uuid,uuid,text,integer,uuid,text,text) TO service_role$l35_ddl$;
  EXECUTE $l35_ddl$REVOKE ALL ON FUNCTION public.process_text_answer_with_context(uuid,uuid,text,boolean,integer,uuid,text,text) FROM PUBLIC, anon, authenticated, service_role$l35_ddl$;
  EXECUTE $l35_ddl$GRANT EXECUTE ON FUNCTION public.process_text_answer_with_context(uuid,uuid,text,boolean,integer,uuid,text,text) TO service_role$l35_ddl$;

  -- ── Verification: the result is exactly as intended, or nothing is changed ──
  IF (SELECT md5(prosrc) FROM pg_catalog.pg_proc WHERE oid = to_regprocedure('public.question_instances_served_mode()')) IS DISTINCT FROM 'af725afa35dcae57ff14a20be9b754ab'
     OR (SELECT md5(prosrc) FROM pg_catalog.pg_proc WHERE oid = to_regprocedure('public.request_question_hint(uuid,uuid,integer,integer,uuid)')) IS DISTINCT FROM 'f02402e6a546ad3b3c3351182b32148b'
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname = 'question_instances_served_mode' AND tgrelid = 'public.question_instances'::regclass AND tgenabled = 'O')
     OR has_column_privilege('anon', 'public.question_instances', 'served_mode', 'SELECT')
     OR has_column_privilege('anon', 'public.question_instances', 'served_mode', 'INSERT')
     OR has_column_privilege('anon', 'public.question_instances', 'served_mode', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.question_instances', 'served_mode', 'SELECT')
     OR has_column_privilege('authenticated', 'public.question_instances', 'served_mode', 'INSERT')
     OR has_column_privilege('authenticated', 'public.question_instances', 'served_mode', 'UPDATE')
     OR has_table_privilege('anon', 'public.question_hint_requests', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
     OR has_table_privilege('authenticated', 'public.question_hint_requests', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
     OR has_table_privilege('service_role', 'public.question_hint_requests', 'UPDATE, DELETE, TRUNCATE')
     OR NOT (SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.question_hint_requests'::regclass)
     OR has_function_privilege('anon', 'public.request_question_hint(uuid,uuid,integer,integer,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.request_question_hint(uuid,uuid,integer,integer,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.request_question_hint(uuid,uuid,integer,integer,uuid)', 'EXECUTE')
     OR (SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid = to_regprocedure('public.request_question_hint(uuid,uuid,integer,integer,uuid)'))
     OR (SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid = to_regprocedure('public.question_instances_served_mode()'))
     OR (SELECT md5(prosrc) FROM pg_catalog.pg_proc WHERE oid = to_regprocedure('public.process_question_attempt_with_context(uuid,uuid,text,integer,uuid,text,text)')) IS DISTINCT FROM '05ce60912618d33bb29790289c8984f9'
     OR (SELECT md5(prosrc) FROM pg_catalog.pg_proc WHERE oid = to_regprocedure('public.process_text_answer_with_context(uuid,uuid,text,boolean,integer,uuid,text,text)')) IS DISTINCT FROM 'fdd851a11f5418e7652310e269b3fb2a'
     OR (SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid = to_regprocedure('public.process_question_attempt_with_context(uuid,uuid,text,integer,uuid,text,text)'))
     OR (SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid = to_regprocedure('public.process_text_answer_with_context(uuid,uuid,text,boolean,integer,uuid,text,text)'))
     OR has_function_privilege('anon', 'public.process_question_attempt_with_context(uuid,uuid,text,integer,uuid,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.process_question_attempt_with_context(uuid,uuid,text,integer,uuid,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.process_question_attempt_with_context(uuid,uuid,text,integer,uuid,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.process_text_answer_with_context(uuid,uuid,text,boolean,integer,uuid,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.process_text_answer_with_context(uuid,uuid,text,boolean,integer,uuid,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.process_text_answer_with_context(uuid,uuid,text,boolean,integer,uuid,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'L3/L5: resultatet blev ikke som forventet; intet ændret';
  END IF;
END
$l35$;
