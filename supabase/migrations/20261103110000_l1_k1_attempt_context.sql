-- ============================================================================
-- L1 K1 (D-266, D-277 DRAFT, LP-3; docs/learning-progression-l1-contracts.md §K1): the answer history
-- (H5's question_attempts) records the activity mode, the hints used, a technical interval and the
-- version of the question each answer was given to — and has room for L2's learning objectives.
--
-- NOT APPLIED IN PRODUCTION. Applying it needs a separate owner authorisation (D-110,
-- docs/migration-workflow-policy.md): apply_migration only, never `supabase db push`. No activation:
-- H5 stays OFF; nothing here switches it on.
--
-- ORDER IN PRODUCTION (binding): G1 (20261101150000, applied) → H5 bootstrap (20261101190000) → H5
-- alignment (20261101190100) → D-327 (20261103100000, attempts survive instance deletion) → THIS FILE,
-- before the first attempt is written (the guard requires an empty question_attempts and D-327's key).
-- H2 (D-298) is applied (2026-11-02). Then get-next-question's K1_SERVED_SNAPSHOT=on and the matching
-- process-event — each a separate owner authorisation; H5 stays OFF throughout.
--
-- WHAT CHANGES (and nothing else)
--   1. question_attempts gets six columns: mode (NOT NULL, one of quiz_v1 / diagnostic / practice /
--      check / review / application, no default), hints_used (NOT NULL, 0–3), server_interval_ms (NULL,
--      or 0 … 3 600 000 ms and only on the first round), objective_ids and objective_mapping_version
--      (both NULL, or a non-empty array without NULL elements with a version ≥ 1 — L2 fills them, never
--      retroactively) and question_content_sha256 (NULL = UNKNOWN version, or 64 hex).
--   2. question_instances gets the SERVER-DELIVERED version of each round: served_snapshot (content,
--      metadata, answer_format, answer_type and this instance's key), served_content_sha256 and
--      served_at — all three NULL (unknown) or all three set. A trigger
--      (question_instances_served_snapshot) owns them:
--        * INSERT of an open round WITH a proposed snapshot (get-next-question, K1_SERVED_SNAPSHOT=on):
--          the question row is locked FOR SHARE and the proposal must equal it exactly (content,
--          metadata, format, type) — otherwise the insert fails with 40001 and get-next-question tries
--          its next candidate. So the version recorded is the version the response was built from, and
--          a concurrent edit is ordered strictly before or after it (never between).
--        * INSERT without a proposal (an older get-next-question, fixtures): NULL — unknown, not guessed.
--        * a reopen (answered true → false; the locked repeat functions): a fresh snapshot of the
--          locked question row in the same statement; get-next-question serves the repeat FROM it.
--        * any other UPDATE: the round's snapshot is kept byte for byte (a reload, a later content
--          edit or D-280's re-keying never re-versions a round), except a key re-written in the SAME
--          transaction that opened the round (D-280's repeat functions re-key right after reopening).
--      Earlier rounds' fingerprints live in their attempt rows, which are append-only.
--      "Served" is what the server delivered; "shown to the pupil" needs the client's confirmation and is
--      deliberately NOT claimed here (K9).
--   3. process_question_attempt_v2 and process_text_answer_v2 are re-created with p_mode and
--      p_hints_used (server constants in process-event; an unknown value is refused, never defaulted).
--      When the round has a snapshot they GRADE AND ROUTE FROM IT (format, type, content, metadata,
--      key) and store its fingerprint; without one (rounds opened before this file or without a
--      proposal) they grade as before from the current question and store question_content_sha256 =
--      NULL: an unknown version is never evidence for mastery.
--      server_interval_ms: from served_at (or created_at for an unknown-version round) to the answer,
--      first round only; negative or above 3 600 000 ms (1 hour) is NULL — never clipped. It is a
--      technical SERVER interval, not the pupil's active working time, and is never used for mastery,
--      level or reward.
--      Everything else in both bodies — round check, submission idempotency, frozen result, grading
--      rules, amounts, streak, quests, SECURITY DEFINER, search_path, EXECUTE (service_role only) — is
--      unchanged from 20261101190100 / 20261030211428 (the test proves it line by line).
--      The old signatures are dropped (a different argument list is a new function in PostgreSQL).
--   No row is written. No backfill: rounds and attempts without these fields stay unknown (K2).
--
-- GUARD AND ATOMICITY: one DO block (all or nothing, whatever the runner does; lock_timeout is set
-- inside it): H5's schema exists; D-327 is applied (question_attempts_instance_fkey is NO ACTION);
-- question_attempts is EMPTY; process_question_attempt_v2 has the aligned body (md5 8a769614…) and
-- process_text_answer_v2 its H5 body (f8809846…); a second run on a database that already has K1
-- (both new bodies and the trigger function, md5 below) changes nothing; anything else stops it.
--
-- ROLLBACK (before the first attempt only): docs/operations/l1-k1-attempt-context-rollback.md.
-- ============================================================================

DO $k1$
DECLARE
  v_hash text;
  v_rows bigint;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  IF to_regclass('public.question_attempts') IS NULL THEN
    RAISE EXCEPTION 'K1: question_attempts findes ikke — anvend H5 (20261101190000, 20261101190100) først; intet ændret';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = 'public.question_attempts'::regclass
             AND attname = 'mode' AND NOT attisdropped) THEN
    IF (SELECT md5(prosrc) FROM pg_catalog.pg_proc WHERE oid = to_regprocedure('public.process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text,text,integer)')) IS DISTINCT FROM '439186fa94119fec02b8f282eb75dbbd'
       OR (SELECT md5(prosrc) FROM pg_catalog.pg_proc WHERE oid = to_regprocedure('public.process_text_answer_v2(uuid,uuid,text,boolean,integer,uuid,text,text,text,integer)')) IS DISTINCT FROM '809675f9071eb2a62d1c9a9b2628bc84'
       OR (SELECT md5(prosrc) FROM pg_catalog.pg_proc WHERE oid = to_regprocedure('public.question_instances_served_snapshot()')) IS DISTINCT FROM 'babbb196f07c4fb60e42ff9e917bf180' THEN
      RAISE EXCEPTION 'K1: kolonnen mode findes, men _v2-funktionerne har ukendte kroppe; intet ændret';
    END IF;
    RAISE NOTICE 'K1: allerede anvendt; intet ændret';
    RETURN;
  END IF;

  IF (SELECT pg_get_constraintdef(c.oid) FROM pg_catalog.pg_constraint c
      WHERE c.conname = 'question_attempts_instance_fkey' AND c.conrelid = 'public.question_attempts'::regclass)
     IS DISTINCT FROM 'FOREIGN KEY (question_instance_id, student_id) REFERENCES question_instances(id, student_id)' THEN
    RAISE EXCEPTION 'K1: D-327 (20261103100000) er ikke anvendt — question_attempts_instance_fkey skal være ON DELETE NO ACTION; intet ændret';
  END IF;

  SELECT count(*) INTO v_rows FROM public.question_attempts;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'K1: question_attempts har % række(r); K1 anvendes før det første forsøg; intet ændret', v_rows;
  END IF;
  SELECT md5(prosrc) INTO v_hash FROM pg_catalog.pg_proc WHERE oid = to_regprocedure('public.process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text)');
  IF v_hash IS DISTINCT FROM '8a7696147df978e250918b2c93e20577' THEN
    RAISE EXCEPTION 'K1: process_question_attempt_v2 har ikke H5-alignmentens krop (md5 %) — anvend 20261101190100 først; intet ændret', v_hash;
  END IF;
  SELECT md5(prosrc) INTO v_hash FROM pg_catalog.pg_proc WHERE oid = to_regprocedure('public.process_text_answer_v2(uuid,uuid,text,boolean,integer,uuid,text,text)');
  IF v_hash IS DISTINCT FROM 'f880984680d52b20d07c628a9dfae474' THEN
    RAISE EXCEPTION 'K1: process_text_answer_v2 har ikke H5''s krop (md5 %); intet ændret', v_hash;
  END IF;

  EXECUTE $k1_ddl$ALTER TABLE public.question_attempts
    ADD COLUMN mode text NOT NULL
      CONSTRAINT question_attempts_mode_check
      CHECK (mode IN ('quiz_v1', 'diagnostic', 'practice', 'check', 'review', 'application')),
    ADD COLUMN hints_used smallint NOT NULL
      CONSTRAINT question_attempts_hints_used_check CHECK (hints_used BETWEEN 0 AND 3),
    ADD COLUMN server_interval_ms integer
      CONSTRAINT question_attempts_server_interval_ms_check CHECK (server_interval_ms BETWEEN 0 AND 3600000),
    ADD COLUMN objective_ids uuid[],
    ADD COLUMN objective_mapping_version integer,
    ADD COLUMN question_content_sha256 text
      CONSTRAINT question_attempts_content_sha256_check CHECK (question_content_sha256 ~ '^[0-9a-f]{64}$'),
    ADD CONSTRAINT question_attempts_interval_first_round_check
      CHECK (server_interval_ms IS NULL OR attempt_no = 1),
    ADD CONSTRAINT question_attempts_objectives_versioned_check
      CHECK ((objective_ids IS NULL AND objective_mapping_version IS NULL)
          OR (objective_ids IS NOT NULL AND cardinality(objective_ids) >= 1
              AND array_position(objective_ids, NULL) IS NULL
              AND objective_mapping_version IS NOT NULL AND objective_mapping_version >= 1))$k1_ddl$;

  EXECUTE $k1_ddl$COMMENT ON COLUMN public.question_attempts.question_content_sha256 IS
  'K1: fingerprint of the SERVER-DELIVERED version of the round (question_instances.served_content_sha256). NULL = unknown version (a round opened before K1 or without a verified snapshot): never evidence for mastery. "Shown to the pupil" is not claimed (K9).'$k1_ddl$;

  EXECUTE $k1_ddl$COMMENT ON COLUMN public.question_attempts.server_interval_ms IS
  'K1: technical server interval from delivery of the first round to the answer, 0..3600000 ms; NULL when unknown, negative or above one hour (never clipped). Not active working time; never used for mastery, level or reward.'$k1_ddl$;

  EXECUTE $k1_ddl$ALTER TABLE public.question_instances
    ADD COLUMN served_snapshot jsonb,
    ADD COLUMN served_content_sha256 text
      CONSTRAINT question_instances_served_sha256_check CHECK (served_content_sha256 ~ '^[0-9a-f]{64}$'),
    ADD COLUMN served_at timestamptz,
    ADD CONSTRAINT question_instances_served_all_or_none_check
      CHECK ((served_snapshot IS NULL) = (served_content_sha256 IS NULL)
         AND (served_snapshot IS NULL) = (served_at IS NULL))$k1_ddl$;

  EXECUTE $k1_ddl$CREATE FUNCTION public.question_instances_served_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_q       record;
  v_opening boolean;
BEGIN
  v_opening := (TG_OP = 'INSERT' AND NEW.answered IS NOT TRUE)
            OR (TG_OP = 'UPDATE' AND OLD.answered IS TRUE AND NEW.answered IS NOT TRUE);

  IF TG_OP = 'UPDATE' AND NOT v_opening THEN
    -- Within a round the delivered version never changes. Only a key re-written in the SAME
    -- transaction that opened the round (D-280's repeat functions re-key right after reopening) is
    -- folded into that round's snapshot.
    IF OLD.served_snapshot IS NOT NULL AND NEW.answered IS NOT TRUE AND OLD.served_at = now()
       AND NEW.correct_answer IS DISTINCT FROM OLD.correct_answer THEN
      NEW.served_snapshot := jsonb_set(OLD.served_snapshot, '{correct_answer}', to_jsonb(NEW.correct_answer));
      NEW.served_content_sha256 := encode(sha256(convert_to(NEW.served_snapshot::text, 'UTF8')), 'hex');
      NEW.served_at := OLD.served_at;
    ELSE
      NEW.served_snapshot := OLD.served_snapshot;
      NEW.served_content_sha256 := OLD.served_content_sha256;
      NEW.served_at := OLD.served_at;
    END IF;
    RETURN NEW;
  END IF;

  IF NOT v_opening OR (TG_OP = 'INSERT' AND NEW.served_snapshot IS NULL) THEN
    -- An answered row inserted as such, or an insert without a proposal: no delivered version known.
    NEW.served_snapshot := NULL;
    NEW.served_content_sha256 := NULL;
    NEW.served_at := NULL;
    RETURN NEW;
  END IF;

  SELECT q.content, q.metadata, q.answer_format, q.answer_type INTO v_q
  FROM public.questions q WHERE q.id = NEW.question_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'served snapshot: question % does not exist', NEW.question_id USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF TG_OP = 'INSERT' AND (
       NEW.served_snapshot -> 'content' IS DISTINCT FROM v_q.content
    OR coalesce(NEW.served_snapshot -> 'metadata', 'null'::jsonb) IS DISTINCT FROM coalesce(v_q.metadata, 'null'::jsonb)
    OR NEW.served_snapshot ->> 'answer_format' IS DISTINCT FROM v_q.answer_format
    OR NEW.served_snapshot ->> 'answer_type' IS DISTINCT FROM v_q.answer_type) THEN
    RAISE EXCEPTION 'served snapshot: question % changed between selection and delivery', NEW.question_id
      USING ERRCODE = 'serialization_failure';
  END IF;

  NEW.served_snapshot := jsonb_build_object(
    'content', v_q.content, 'metadata', v_q.metadata, 'answer_format', v_q.answer_format,
    'answer_type', v_q.answer_type, 'correct_answer', NEW.correct_answer);
  NEW.served_content_sha256 := encode(sha256(convert_to(NEW.served_snapshot::text, 'UTF8')), 'hex');
  NEW.served_at := now();
  RETURN NEW;
END;
$function$$k1_ddl$;

  EXECUTE $k1_ddl$REVOKE ALL ON FUNCTION public.question_instances_served_snapshot() FROM PUBLIC, anon, authenticated, service_role$k1_ddl$;

  EXECUTE $k1_ddl$CREATE TRIGGER question_instances_served_snapshot
  BEFORE INSERT OR UPDATE ON public.question_instances
  FOR EACH ROW EXECUTE FUNCTION public.question_instances_served_snapshot()$k1_ddl$;


  EXECUTE $k1_ddl$DROP FUNCTION public.process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text)$k1_ddl$;

  EXECUTE $k1_ddl$DROP FUNCTION public.process_text_answer_v2(uuid,uuid,text,boolean,integer,uuid,text,text)$k1_ddl$;

  EXECUTE $k1_ddl$CREATE FUNCTION public.process_question_attempt_v2(
  p_student_id           uuid,
  p_question_instance_id uuid,
  p_answer               text,
  p_round_no             integer,
  p_submission_id        uuid,
  p_review_text          text,
  p_misconception_type   text,
  p_mode                 text,
  p_hints_used           integer
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_instance   public.question_instances%ROWTYPE;
  v_attempt    public.question_attempts%ROWTYPE;
  v_format     text;
  v_type       text;
  v_content    jsonb;
  v_metadata   jsonb;
  v_aliases    jsonb;
  v_key        text;
  v_correct    boolean := false;
  v_is_repeat  boolean;
  v_xp         integer := 0;
  v_coins      integer := 0;
  v_review     text;
  v_misc       text;
  v_now        timestamptz := now();
  v_rows       integer;
  v_constraint text;
  v_content_sha text;
  v_interval   integer;
  v_interval_ms numeric;
  v_norm_answer text;
  v_norm_key   text;
BEGIN
  IF p_student_id IS NULL OR p_question_instance_id IS NULL OR p_submission_id IS NULL THEN
    RETURN jsonb_build_object('outcome', 'invalid_request', 'reason', 'missing_identity');
  END IF;
  IF p_round_no IS NULL OR p_round_no < 1 THEN
    RETURN jsonb_build_object('outcome', 'invalid_request', 'reason', 'invalid_round');
  END IF;
  IF p_answer IS NULL OR p_answer = '' THEN
    RETURN jsonb_build_object('outcome', 'invalid_request', 'reason', 'missing_answer');
  END IF;

  -- K1 (L1, D-266): the activity mode and the hints used are decided by the server (process-event),
  -- never read from the request body. An unknown value is refused, never defaulted.
  IF p_mode IS NULL OR p_mode NOT IN ('quiz_v1', 'diagnostic', 'practice', 'check', 'review', 'application') THEN
    RETURN jsonb_build_object('outcome', 'invalid_request', 'reason', 'invalid_mode');
  END IF;
  IF p_hints_used IS NULL OR p_hints_used < 0 OR p_hints_used > 3 THEN
    RETURN jsonb_build_object('outcome', 'invalid_request', 'reason', 'invalid_hints');
  END IF;

  SELECT qi.* INTO v_instance
  FROM public.question_instances qi
  WHERE qi.id = p_question_instance_id AND qi.student_id = p_student_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'not_found');
  END IF;

  SELECT a.* INTO v_attempt
  FROM public.question_attempts a
  WHERE a.student_id = p_student_id AND a.submission_id = p_submission_id;

  IF FOUND THEN
    IF v_attempt.question_instance_id = p_question_instance_id
       AND v_attempt.attempt_no = p_round_no
       AND v_attempt.user_answer = p_answer
       AND v_attempt.source = 'process_question_attempt_v2' THEN
      RETURN jsonb_build_object(
        'outcome',            'replay',
        'status',             v_attempt.status,
        'correct_answer',     v_attempt.correct_answer_shown,
        'review_text',        v_attempt.review_text_shown,
        'misconception_type', v_attempt.misconception_type_shown,
        'xp_awarded',         v_attempt.xp_awarded,
        'coins_awarded',      v_attempt.coins_awarded,
        'round_no',           v_attempt.attempt_no);
    END IF;
    RETURN jsonb_build_object('outcome', 'submission_conflict');
  END IF;

  SELECT q.answer_format, q.answer_type, q.content, q.metadata
  INTO v_format, v_type, v_content, v_metadata
  FROM public.questions q
  WHERE q.id = v_instance.question_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'process_question_attempt_v2: spørgsmålet til instans % findes ikke', v_instance.id;
  END IF;

  -- K1: a round with a delivered version is graded and routed from exactly that version.
  IF v_instance.served_snapshot IS NOT NULL THEN
    v_format   := v_instance.served_snapshot ->> 'answer_format';
    v_type     := v_instance.served_snapshot ->> 'answer_type';
    v_content  := v_instance.served_snapshot -> 'content';
    v_metadata := v_instance.served_snapshot -> 'metadata';
    v_instance.correct_answer := v_instance.served_snapshot ->> 'correct_answer';
  END IF;

  -- process-event's routing: answer_type 'long' → long path; a format containing 'text' → short text.
  IF coalesce(v_type, '') = 'long' OR strpos(lower(coalesce(v_format, '')), 'text') > 0 THEN
    RETURN jsonb_build_object('outcome', 'invalid_request', 'reason', 'answer_path');
  END IF;

  IF p_round_no < v_instance.repeat_count + 1 THEN
    RETURN jsonb_build_object('outcome', 'stale_round');
  END IF;
  IF p_round_no > v_instance.repeat_count + 1 THEN
    RETURN jsonb_build_object('outcome', 'invalid_request', 'reason', 'round_ahead');
  END IF;
  IF v_instance.answered THEN
    RETURN jsonb_build_object('outcome', 'round_closed');
  END IF;

  -- Only reviewed earlier versions of this question's correct option are aliases: two or more
  -- entries (D-280), always including both the stored key and the current content.correct.
  v_aliases := v_metadata -> 'danish_orthography_correct_aliases';
  IF jsonb_typeof(v_aliases) IS DISTINCT FROM 'array' THEN
    v_aliases := '[]'::jsonb;
  END IF;
  IF jsonb_array_length(v_aliases) >= 2
     AND v_aliases ? v_instance.correct_answer
     AND v_aliases ? (v_content ->> 'correct') THEN
    v_key := v_content ->> 'correct';
  ELSE
    v_key := v_instance.correct_answer;
    v_aliases := '[]'::jsonb;
  END IF;

  -- D-290 (G1): meaning-bearing characters count (letters incl. æøå, apostrophes, punctuation);
  -- numbers compare numerically. An empty or unparseable key never matches. Aliases are unchanged.
  IF v_format LIKE '%number%' THEN
    v_norm_answer := public.normalize_number_answer(p_answer);
    v_norm_key    := public.normalize_number_answer(v_key);
  ELSE
    v_norm_answer := public.normalize_choice_answer(p_answer);
    v_norm_key    := public.normalize_choice_answer(v_key);
  END IF;

  IF (v_norm_key IS NOT NULL AND v_norm_key <> '' AND v_norm_answer = v_norm_key)
     OR v_aliases ? p_answer THEN
    v_correct := true;
  END IF;

  v_is_repeat := v_instance.repeat_count > 0;
  v_review    := CASE WHEN v_correct THEN NULL ELSE nullif(p_review_text, '') END;
  v_misc      := CASE WHEN v_correct THEN NULL ELSE nullif(p_misconception_type, '') END;

  BEGIN
    UPDATE public.question_instances
    SET answered             = true,
        answered_at          = v_now,
        user_answer          = p_answer,
        was_correct          = v_correct,
        misconception_signal = coalesce(v_misc, misconception_signal)
    WHERE id = v_instance.id AND student_id = p_student_id AND answered = false;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'process_question_attempt_v2: instans % blev ikke besvaret (% rækker) trods rækkelås', v_instance.id, v_rows;
    END IF;

    IF v_correct THEN
      IF v_is_repeat THEN
        -- A repeat earns a token amount: 1 coin and 2 XP (D-211); the accuracy counters stay put.
        UPDATE public.student_progress
        SET xp    = COALESCE(xp, 0) + 2,
            coins = COALESCE(coins, 0) + 1
        WHERE student_id = p_student_id;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows = 1 THEN v_xp := 2; v_coins := 1; END IF;
      ELSE
        UPDATE public.student_progress
        SET xp                    = COALESCE(xp, 0) + 10,
            coins                 = COALESCE(coins, 0) + 5,
            correct_answers       = COALESCE(correct_answers, 0) + 1,
            total_correct_answers = COALESCE(total_correct_answers, 0) + 1
        WHERE student_id = p_student_id;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows = 1 THEN v_xp := 10; v_coins := 5; END IF;
      END IF;
    END IF;

    PERFORM public.update_streak(p_student_id);

    -- Quests are not advanced by repeats (D-211).
    IF NOT v_is_repeat THEN
      PERFORM public.update_quest_progress_for_answer(
        p_student_id, v_correct, CASE WHEN v_correct THEN 10 ELSE 0 END);
      PERFORM public.update_weekly_quest_progress_for_answer(
        p_student_id, v_correct, CASE WHEN v_correct THEN 10 ELSE 0 END);
    END IF;

    -- K1: the fingerprint of the delivered version (NULL = unknown), and the technical server interval
    -- of the first round (delivery → answer); negative or above one hour is NULL, never clipped. It has
    -- no effect on mastery, level or reward.
    v_content_sha := v_instance.served_content_sha256;
    v_interval_ms := CASE WHEN v_instance.repeat_count = 0
      THEN floor(extract(epoch FROM (v_now - coalesce(v_instance.served_at, v_instance.created_at))) * 1000) END;
    v_interval := CASE WHEN v_interval_ms BETWEEN 0 AND 3600000 THEN v_interval_ms::integer END;

    INSERT INTO public.question_attempts (
      question_instance_id, student_id, attempt_no, submission_id, grading, status, was_correct,
      user_answer, answer_format, answer_type, is_repeat, correct_answer_shown, review_text_shown,
      misconception_type_shown, answered_at, xp_awarded, coins_awarded, source,
      mode, hints_used, server_interval_ms, question_content_sha256)
    VALUES (
      v_instance.id, p_student_id, v_instance.repeat_count + 1, p_submission_id, 'auto',
      CASE WHEN v_correct THEN 'correct' ELSE 'incorrect' END, v_correct,
      p_answer, coalesce(v_format, ''), coalesce(nullif(v_type, ''), 'short'), v_is_repeat, v_key,
      v_review, v_misc, v_now, v_xp, v_coins, 'process_question_attempt_v2',
      p_mode, p_hints_used, v_interval, v_content_sha)
    RETURNING * INTO v_attempt;
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint = 'question_attempts_submission_key' THEN
        RETURN jsonb_build_object('outcome', 'submission_conflict');
      END IF;
      RAISE;
  END;

  RETURN jsonb_build_object(
    'outcome',            'recorded',
    'status',             v_attempt.status,
    'correct_answer',     v_attempt.correct_answer_shown,
    'review_text',        v_attempt.review_text_shown,
    'misconception_type', v_attempt.misconception_type_shown,
    'xp_awarded',         v_attempt.xp_awarded,
    'coins_awarded',      v_attempt.coins_awarded,
    'round_no',           v_attempt.attempt_no);
END;
$function$$k1_ddl$;

  EXECUTE $k1_ddl$CREATE FUNCTION public.process_text_answer_v2(
  p_instance_id        uuid,
  p_user_id            uuid,
  p_user_answer        text,
  p_is_correct         boolean,
  p_round_no           integer,
  p_submission_id      uuid,
  p_review_text        text,
  p_misconception_type text,
  p_mode               text,
  p_hints_used         integer
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_instance   public.question_instances%ROWTYPE;
  v_attempt    public.question_attempts%ROWTYPE;
  v_format     text;
  v_type       text;
  v_content    jsonb;
  v_xp         integer := 0;
  v_coins      integer := 0;
  v_review     text;
  v_misc       text;
  v_now        timestamptz := now();
  v_rows       integer;
  v_constraint text;
  v_content_sha text;
  v_interval   integer;
  v_interval_ms numeric;
BEGIN
  IF p_user_id IS NULL OR p_instance_id IS NULL OR p_submission_id IS NULL THEN
    RETURN jsonb_build_object('outcome', 'invalid_request', 'reason', 'missing_identity');
  END IF;
  IF p_round_no IS NULL OR p_round_no < 1 THEN
    RETURN jsonb_build_object('outcome', 'invalid_request', 'reason', 'invalid_round');
  END IF;
  IF p_user_answer IS NULL OR p_user_answer = '' THEN
    RETURN jsonb_build_object('outcome', 'invalid_request', 'reason', 'missing_answer');
  END IF;
  IF p_is_correct IS NULL THEN
    RETURN jsonb_build_object('outcome', 'invalid_request', 'reason', 'missing_verdict');
  END IF;

  -- K1 (L1, D-266): the activity mode and the hints used are decided by the server (process-event),
  -- never read from the request body. An unknown value is refused, never defaulted.
  IF p_mode IS NULL OR p_mode NOT IN ('quiz_v1', 'diagnostic', 'practice', 'check', 'review', 'application') THEN
    RETURN jsonb_build_object('outcome', 'invalid_request', 'reason', 'invalid_mode');
  END IF;
  IF p_hints_used IS NULL OR p_hints_used < 0 OR p_hints_used > 3 THEN
    RETURN jsonb_build_object('outcome', 'invalid_request', 'reason', 'invalid_hints');
  END IF;

  SELECT qi.* INTO v_instance
  FROM public.question_instances qi
  WHERE qi.id = p_instance_id AND qi.student_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'not_found');
  END IF;

  SELECT a.* INTO v_attempt
  FROM public.question_attempts a
  WHERE a.student_id = p_user_id AND a.submission_id = p_submission_id;

  IF FOUND THEN
    IF v_attempt.question_instance_id = p_instance_id
       AND v_attempt.attempt_no = p_round_no
       AND v_attempt.user_answer = p_user_answer
       AND v_attempt.source = 'process_text_answer_v2' THEN
      RETURN jsonb_build_object(
        'outcome',            'replay',
        'status',             v_attempt.status,
        'correct_answer',     v_attempt.correct_answer_shown,
        'review_text',        v_attempt.review_text_shown,
        'misconception_type', v_attempt.misconception_type_shown,
        'xp_awarded',         v_attempt.xp_awarded,
        'coins_awarded',      v_attempt.coins_awarded,
        'round_no',           v_attempt.attempt_no);
    END IF;
    RETURN jsonb_build_object('outcome', 'submission_conflict');
  END IF;

  SELECT q.answer_format, q.answer_type, q.content
  INTO v_format, v_type, v_content
  FROM public.questions q
  WHERE q.id = v_instance.question_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'process_text_answer_v2: spørgsmålet til instans % findes ikke', v_instance.id;
  END IF;

  -- K1: a round with a delivered version is routed from exactly that version (the key shown, too).
  IF v_instance.served_snapshot IS NOT NULL THEN
    v_format  := v_instance.served_snapshot ->> 'answer_format';
    v_type    := v_instance.served_snapshot ->> 'answer_type';
    v_content := v_instance.served_snapshot -> 'content';
    v_instance.correct_answer := v_instance.served_snapshot ->> 'correct_answer';
  END IF;

  IF coalesce(v_type, '') = 'long' OR strpos(lower(coalesce(v_format, '')), 'text') = 0 THEN
    RETURN jsonb_build_object('outcome', 'invalid_request', 'reason', 'answer_path');
  END IF;

  IF p_round_no < v_instance.repeat_count + 1 THEN
    RETURN jsonb_build_object('outcome', 'stale_round');
  END IF;
  IF p_round_no > v_instance.repeat_count + 1 THEN
    RETURN jsonb_build_object('outcome', 'invalid_request', 'reason', 'round_ahead');
  END IF;
  IF v_instance.answered THEN
    RETURN jsonb_build_object('outcome', 'round_closed');
  END IF;

  v_review := CASE WHEN p_is_correct THEN NULL ELSE nullif(p_review_text, '') END;
  v_misc   := CASE WHEN p_is_correct THEN NULL ELSE nullif(p_misconception_type, '') END;

  BEGIN
    UPDATE public.question_instances
    SET user_answer          = p_user_answer,
        was_correct          = p_is_correct,
        answered             = true,
        answered_at          = v_now,
        next_review_at       = CASE WHEN p_is_correct THEN v_now + interval '1 day'
                                    ELSE v_now + interval '10 minutes' END,
        misconception_signal = coalesce(v_misc, misconception_signal)
    WHERE id = v_instance.id AND student_id = p_user_id AND answered = false;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'process_text_answer_v2: instans % blev ikke besvaret (% rækker) trods rækkelås', v_instance.id, v_rows;
    END IF;

    IF p_is_correct THEN
      UPDATE public.student_progress
      SET xp                    = COALESCE(xp, 0) + 10,
          coins                 = COALESCE(coins, 0) + 5,
          correct_answers       = COALESCE(correct_answers, 0) + 1,
          total_correct_answers = COALESCE(total_correct_answers, 0) + 1
      WHERE student_id = p_user_id;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows = 1 THEN v_xp := 10; v_coins := 5; END IF;
    END IF;

    PERFORM public.update_streak(p_user_id);
    PERFORM public.update_quest_progress_for_answer(
      p_user_id, p_is_correct, CASE WHEN p_is_correct THEN 10 ELSE 0 END);
    PERFORM public.update_weekly_quest_progress_for_answer(
      p_user_id, p_is_correct, CASE WHEN p_is_correct THEN 10 ELSE 0 END);

    -- K1: the fingerprint of the delivered version (NULL = unknown), and the technical server interval
    -- of the first round (delivery → answer); negative or above one hour is NULL, never clipped. It has
    -- no effect on mastery, level or reward.
    v_content_sha := v_instance.served_content_sha256;
    v_interval_ms := CASE WHEN v_instance.repeat_count = 0
      THEN floor(extract(epoch FROM (v_now - coalesce(v_instance.served_at, v_instance.created_at))) * 1000) END;
    v_interval := CASE WHEN v_interval_ms BETWEEN 0 AND 3600000 THEN v_interval_ms::integer END;

    INSERT INTO public.question_attempts (
      question_instance_id, student_id, attempt_no, submission_id, grading, status, was_correct,
      user_answer, answer_format, answer_type, is_repeat, correct_answer_shown, review_text_shown,
      misconception_type_shown, answered_at, xp_awarded, coins_awarded, source,
      mode, hints_used, server_interval_ms, question_content_sha256)
    VALUES (
      v_instance.id, p_user_id, v_instance.repeat_count + 1, p_submission_id, 'auto',
      CASE WHEN p_is_correct THEN 'correct' ELSE 'incorrect' END, p_is_correct,
      p_user_answer, coalesce(v_format, ''), coalesce(nullif(v_type, ''), 'short'),
      v_instance.repeat_count > 0, v_instance.correct_answer, v_review, v_misc, v_now, v_xp, v_coins,
      'process_text_answer_v2',
      p_mode, p_hints_used, v_interval, v_content_sha)
    RETURNING * INTO v_attempt;
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint = 'question_attempts_submission_key' THEN
        RETURN jsonb_build_object('outcome', 'submission_conflict');
      END IF;
      RAISE;
  END;

  RETURN jsonb_build_object(
    'outcome',            'recorded',
    'status',             v_attempt.status,
    'correct_answer',     v_attempt.correct_answer_shown,
    'review_text',        v_attempt.review_text_shown,
    'misconception_type', v_attempt.misconception_type_shown,
    'xp_awarded',         v_attempt.xp_awarded,
    'coins_awarded',      v_attempt.coins_awarded,
    'round_no',           v_attempt.attempt_no);
END;
$function$$k1_ddl$;

  EXECUTE $k1_ddl$REVOKE ALL ON FUNCTION public.process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text,text,integer) FROM PUBLIC, anon, authenticated, service_role$k1_ddl$;

  EXECUTE $k1_ddl$GRANT EXECUTE ON FUNCTION public.process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text,text,integer) TO service_role$k1_ddl$;

  EXECUTE $k1_ddl$REVOKE ALL ON FUNCTION public.process_text_answer_v2(uuid,uuid,text,boolean,integer,uuid,text,text,text,integer) FROM PUBLIC, anon, authenticated, service_role$k1_ddl$;

  EXECUTE $k1_ddl$GRANT EXECUTE ON FUNCTION public.process_text_answer_v2(uuid,uuid,text,boolean,integer,uuid,text,text,text,integer) TO service_role$k1_ddl$;

  IF (SELECT md5(prosrc) FROM pg_catalog.pg_proc WHERE oid = to_regprocedure('public.process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text,text,integer)')) IS DISTINCT FROM '439186fa94119fec02b8f282eb75dbbd'
     OR (SELECT md5(prosrc) FROM pg_catalog.pg_proc WHERE oid = to_regprocedure('public.process_text_answer_v2(uuid,uuid,text,boolean,integer,uuid,text,text,text,integer)')) IS DISTINCT FROM '809675f9071eb2a62d1c9a9b2628bc84'
     OR (SELECT md5(prosrc) FROM pg_catalog.pg_proc WHERE oid = to_regprocedure('public.question_instances_served_snapshot()')) IS DISTINCT FROM 'babbb196f07c4fb60e42ff9e917bf180'
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname = 'question_instances_served_snapshot' AND tgrelid = 'public.question_instances'::regclass AND tgenabled = 'O')
     OR has_function_privilege('service_role', 'public.question_instances_served_snapshot()', 'EXECUTE')
     OR has_column_privilege('anon', 'public.question_instances', 'served_snapshot', 'SELECT')
     OR has_column_privilege('authenticated', 'public.question_instances', 'served_snapshot', 'SELECT')
     OR has_column_privilege('authenticated', 'public.question_instances', 'served_content_sha256', 'SELECT')
     OR to_regprocedure('public.process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text)') IS NOT NULL OR to_regprocedure('public.process_text_answer_v2(uuid,uuid,text,boolean,integer,uuid,text,text)') IS NOT NULL
     OR has_function_privilege('anon', 'public.process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text,text,integer)', 'EXECUTE') OR has_function_privilege('authenticated', 'public.process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text,text,integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.process_text_answer_v2(uuid,uuid,text,boolean,integer,uuid,text,text,text,integer)', 'EXECUTE') OR has_function_privilege('authenticated', 'public.process_text_answer_v2(uuid,uuid,text,boolean,integer,uuid,text,text,text,integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text,text,integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.process_text_answer_v2(uuid,uuid,text,boolean,integer,uuid,text,text,text,integer)', 'EXECUTE')
     OR NOT (SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid = to_regprocedure('public.process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text,text,integer)'))
     OR NOT (SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid = to_regprocedure('public.process_text_answer_v2(uuid,uuid,text,boolean,integer,uuid,text,text,text,integer)')) THEN
    RAISE EXCEPTION 'K1: resultatet blev ikke som forventet; intet ændret';
  END IF;
END
$k1$;
