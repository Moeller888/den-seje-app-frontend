-- ============================================================================
-- Lærligverse LP-13 / K9: the INTRODUCTION as a server step WITHOUT an answer key
-- (docs/laerligverse/eksponering-datakontrakt.md §3–§4). PROTOTYPE.
--
-- NOT APPLIED IN PRODUCTION. Applying it needs a separate owner authorisation (D-110,
-- docs/migration-workflow-policy.md): apply_migration only, never the CLI's push. Nothing reads it unless
-- get-next-question runs with LAERLIGVERSE_INTRODUCTION=on (and the sequence on), and the introduction-progress
-- Edge Function answers only with that flag on — both unset everywhere.
--
-- WHY SEPARATE TABLES (the least invasive safe design): question_instances.correct_answer is NOT NULL, every grading
-- path (process-event, the _v2 functions, the repeat functions) reads question_instances, and idx_one_open_question
-- allows ONE open round per pupil. An introduction has no key, is never graded and must never block the quiz. So it
-- lives in its own two tables, which no grading path, no public question DTO and no reward reads:
--   * public.learning_introductions — the content (an object with a "cards" array of {title, text}); a CHECK refuses
--     every answer-like key (correct, correct_answer, accepted_answers, options, option_details, hints, review_text,
--     pairs, items, categories), and the content is immutable (only is_active may change). content_sha256 is the
--     version. One active introduction per objective.
--   * public.introduction_rounds — one row per pupil and introduction: served_at (server time), presented_at
--     (optional K9 signal, set once), completed_at (the explicit "completed" action, set once) with the request id
--     of each. A trigger freezes everything else and makes both set-once, server time, never before served_at.
-- COMPLETED ≠ PRESENTED ≠ UNDERSTOOD: completed_at means the pupil pressed "completed" and the server registered it;
-- presented_at means the server received a "shown" report. Neither proves reading or understanding, and neither is
-- ever evidence (D-330); completion only lets the sequence move on.
--
-- FUNCTIONS (all SECURITY INVOKER, EXECUTE for service_role only; the Edge Functions call them through the admin
-- client with the VERIFIED user id):
--   serve_introduction(student, objective)       → none | served | resumed | completed (+ round id, content, sha)
--   mark_introduction_presented(student, round, request_id) → recorded | replay | already_recorded | not_found
--   complete_introduction(student, round, request_id)      → recorded | replay | already_completed | not_found
--   (+ invalid_request for missing identity)
-- A foreign pupil's round answers exactly like a missing one (not_found).
--
-- DEPENDS ON: nothing unapplied (only auth.users). Feeds no XP, coins, streak, quest, mastery, level, attempt or teacher
-- statistic; no other table is touched.
--
-- ROLLBACK: DROP FUNCTION public.complete_introduction(uuid,uuid,uuid), public.mark_introduction_presented(uuid,uuid,uuid),
--   public.serve_introduction(uuid,text); DROP TABLE public.introduction_rounds, public.learning_introductions;
--   DROP FUNCTION public.introduction_rounds_guard(), public.learning_introductions_guard();
-- ============================================================================

DO $intro$
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  IF to_regclass('public.learning_introductions') IS NOT NULL OR to_regclass('public.introduction_rounds') IS NOT NULL THEN
    IF (SELECT md5(prosrc) FROM pg_catalog.pg_proc WHERE oid = to_regprocedure('public.serve_introduction(uuid,text)')) IS DISTINCT FROM '9ca8a209d747d5b1cb349e588385f9f9'
       OR (SELECT md5(prosrc) FROM pg_catalog.pg_proc WHERE oid = to_regprocedure('public.complete_introduction(uuid,uuid,uuid)')) IS DISTINCT FROM '6859d426ab39634b0fe35ab8f3f9d89b'
       OR (SELECT md5(prosrc) FROM pg_catalog.pg_proc WHERE oid = to_regprocedure('public.mark_introduction_presented(uuid,uuid,uuid)')) IS DISTINCT FROM '0409bfe9ccfbcd6dce5f960dbb4c1359' THEN
      RAISE EXCEPTION 'Introduktion: tabellerne findes, men funktionerne er ukendte; intet ændret';
    END IF;
    RAISE NOTICE 'Introduktion: allerede anvendt; intet ændret';
    RETURN;
  END IF;

  EXECUTE $intro_ddl$CREATE TABLE public.learning_introductions (
    id                 uuid        NOT NULL DEFAULT gen_random_uuid(),
    learning_objective text        NOT NULL,
    version            integer     NOT NULL DEFAULT 1,
    content            jsonb       NOT NULL,
    content_sha256     text        NOT NULL,
    is_active          boolean     NOT NULL DEFAULT true,
    created_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT learning_introductions_pkey PRIMARY KEY (id),
    CONSTRAINT learning_introductions_version_key UNIQUE (learning_objective, version),
    CONSTRAINT learning_introductions_version_check CHECK (version >= 1),
    CONSTRAINT learning_introductions_cards_check CHECK (
      CASE WHEN jsonb_typeof(content) = 'object' AND jsonb_typeof(content -> 'cards') = 'array'
           THEN jsonb_array_length(content -> 'cards') BETWEEN 1 AND 10 ELSE false END),
    CONSTRAINT learning_introductions_no_key_check CHECK (NOT (content ?| ARRAY['correct', 'correct_answer',
      'accepted_answers', 'options', 'option_details', 'hints', 'review_text', 'pairs', 'items', 'categories']))
  )$intro_ddl$;
  EXECUTE $intro_ddl$CREATE UNIQUE INDEX learning_introductions_one_active ON public.learning_introductions (learning_objective) WHERE is_active$intro_ddl$;

  EXECUTE $intro_ddl$CREATE TABLE public.introduction_rounds (
    id                    uuid        NOT NULL DEFAULT gen_random_uuid(),
    student_id            uuid        NOT NULL,
    introduction_id       uuid        NOT NULL,
    content_sha256        text        NOT NULL,
    served_at             timestamptz NOT NULL DEFAULT now(),
    presented_at          timestamptz,
    presented_request_id  uuid,
    completed_at          timestamptz,
    completion_request_id uuid,
    CONSTRAINT introduction_rounds_pkey PRIMARY KEY (id),
    CONSTRAINT introduction_rounds_one_per_pupil UNIQUE (student_id, introduction_id),
    CONSTRAINT introduction_rounds_student_fkey FOREIGN KEY (student_id) REFERENCES auth.users (id) ON DELETE CASCADE,
    CONSTRAINT introduction_rounds_introduction_fkey FOREIGN KEY (introduction_id) REFERENCES public.learning_introductions (id),
    CONSTRAINT introduction_rounds_presented_check CHECK ((presented_at IS NULL) = (presented_request_id IS NULL)
      AND (presented_at IS NULL OR presented_at >= served_at)),
    CONSTRAINT introduction_rounds_completed_check CHECK ((completed_at IS NULL) = (completion_request_id IS NULL)
      AND (completed_at IS NULL OR completed_at >= served_at))
  )$intro_ddl$;

  EXECUTE $intro_ddl$CREATE FUNCTION public.learning_introductions_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- The version fingerprint is the server's, never the caller's.
    NEW.content_sha256 := encode(sha256(convert_to(NEW.content::text, 'UTF8')), 'hex');
    RETURN NEW;
  END IF;
  -- A version is immutable: only is_active may change. A new text is a new version (row).
  IF NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256 OR NEW.id IS DISTINCT FROM OLD.id OR NEW.learning_objective IS DISTINCT FROM OLD.learning_objective
     OR NEW.version IS DISTINCT FROM OLD.version OR NEW.content IS DISTINCT FROM OLD.content
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'learning_introductions: a version is immutable; insert a new version instead'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$$intro_ddl$;
  EXECUTE $intro_ddl$CREATE TRIGGER learning_introductions_guard BEFORE INSERT OR UPDATE ON public.learning_introductions
  FOR EACH ROW EXECUTE FUNCTION public.learning_introductions_guard()$intro_ddl$;

  EXECUTE $intro_ddl$CREATE FUNCTION public.introduction_rounds_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- A round starts served, never presented or completed, in server time.
    NEW.served_at := now();
    NEW.presented_at := NULL;
    NEW.presented_request_id := NULL;
    NEW.completed_at := NULL;
    NEW.completion_request_id := NULL;
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.student_id IS DISTINCT FROM OLD.student_id
     OR NEW.introduction_id IS DISTINCT FROM OLD.introduction_id OR NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256
     OR NEW.served_at IS DISTINCT FROM OLD.served_at
     OR (OLD.presented_at IS NOT NULL AND (NEW.presented_at IS DISTINCT FROM OLD.presented_at OR NEW.presented_request_id IS DISTINCT FROM OLD.presented_request_id))
     OR (OLD.completed_at IS NOT NULL AND (NEW.completed_at IS DISTINCT FROM OLD.completed_at OR NEW.completion_request_id IS DISTINCT FROM OLD.completion_request_id))
     OR (OLD.presented_at IS NULL AND NEW.presented_at IS NOT NULL AND NEW.presented_at > clock_timestamp())
     OR (OLD.completed_at IS NULL AND NEW.completed_at IS NOT NULL AND NEW.completed_at > clock_timestamp()) THEN
    RAISE EXCEPTION 'introduction_rounds: served facts are frozen; presented and completed are set once, in server time'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$$intro_ddl$;
  EXECUTE $intro_ddl$CREATE TRIGGER introduction_rounds_guard BEFORE INSERT OR UPDATE ON public.introduction_rounds
  FOR EACH ROW EXECUTE FUNCTION public.introduction_rounds_guard()$intro_ddl$;

  EXECUTE $intro_ddl$ALTER TABLE public.learning_introductions ENABLE ROW LEVEL SECURITY$intro_ddl$;
  EXECUTE $intro_ddl$ALTER TABLE public.introduction_rounds ENABLE ROW LEVEL SECURITY$intro_ddl$;
  EXECUTE $intro_ddl$REVOKE ALL ON TABLE public.learning_introductions, public.introduction_rounds FROM PUBLIC, anon, authenticated, service_role$intro_ddl$;
  EXECUTE $intro_ddl$GRANT SELECT, INSERT ON TABLE public.learning_introductions TO service_role$intro_ddl$;
  EXECUTE $intro_ddl$GRANT UPDATE (is_active) ON TABLE public.learning_introductions TO service_role$intro_ddl$;
  EXECUTE $intro_ddl$GRANT SELECT, INSERT ON TABLE public.introduction_rounds TO service_role$intro_ddl$;
  EXECUTE $intro_ddl$GRANT UPDATE (presented_at, presented_request_id, completed_at, completion_request_id) ON TABLE public.introduction_rounds TO service_role$intro_ddl$;
  EXECUTE $intro_ddl$REVOKE ALL ON FUNCTION public.learning_introductions_guard(), public.introduction_rounds_guard() FROM PUBLIC, anon, authenticated, service_role$intro_ddl$;

  EXECUTE $intro_ddl$CREATE FUNCTION public.serve_introduction(p_student_id uuid, p_learning_objective text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_intro record;
  v_round record;
  v_outcome text := 'resumed';
BEGIN
  IF p_student_id IS NULL OR p_learning_objective IS NULL THEN
    RETURN jsonb_build_object('outcome', 'invalid_request', 'reason', 'missing_identity');
  END IF;
  -- A round of ANY version of this objective's introduction counts (a pupil is never re-introduced by a new version).
  SELECT r.id, r.introduction_id, r.content_sha256, r.served_at, r.completed_at INTO v_round
  FROM public.introduction_rounds r JOIN public.learning_introductions i ON i.id = r.introduction_id
  WHERE r.student_id = p_student_id AND i.learning_objective = p_learning_objective
  ORDER BY r.served_at LIMIT 1;
  IF NOT FOUND THEN
    SELECT i.id, i.content_sha256 INTO v_intro FROM public.learning_introductions i
    WHERE i.learning_objective = p_learning_objective AND i.is_active;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('outcome', 'none');
    END IF;
    INSERT INTO public.introduction_rounds (student_id, introduction_id, content_sha256)
    VALUES (p_student_id, v_intro.id, v_intro.content_sha256)
    ON CONFLICT (student_id, introduction_id) DO NOTHING;
    SELECT r.id, r.introduction_id, r.content_sha256, r.served_at, r.completed_at INTO v_round
    FROM public.introduction_rounds r WHERE r.student_id = p_student_id AND r.introduction_id = v_intro.id;
    v_outcome := 'served';
  END IF;
  IF v_round.completed_at IS NOT NULL THEN
    RETURN jsonb_build_object('outcome', 'completed', 'round_id', v_round.id, 'completed_at', v_round.completed_at);
  END IF;
  RETURN jsonb_build_object('outcome', v_outcome, 'round_id', v_round.id, 'served_at', v_round.served_at,
    'content_sha256', v_round.content_sha256,
    'content', (SELECT i.content FROM public.learning_introductions i WHERE i.id = v_round.introduction_id));
END;
$function$$intro_ddl$;

  EXECUTE $intro_ddl$CREATE FUNCTION public.mark_introduction_presented(p_student_id uuid, p_round_id uuid, p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_round record;
BEGIN
  IF p_student_id IS NULL OR p_round_id IS NULL OR p_request_id IS NULL THEN
    RETURN jsonb_build_object('outcome', 'invalid_request', 'reason', 'missing_identity');
  END IF;
  SELECT r.id, r.presented_at, r.presented_request_id INTO v_round FROM public.introduction_rounds r
  WHERE r.id = p_round_id AND r.student_id = p_student_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'not_found');
  END IF;
  IF v_round.presented_at IS NOT NULL THEN
    RETURN jsonb_build_object('outcome', CASE WHEN v_round.presented_request_id = p_request_id THEN 'replay' ELSE 'already_recorded' END,
      'round_id', v_round.id, 'presented_at', v_round.presented_at);
  END IF;
  UPDATE public.introduction_rounds r SET presented_at = now(), presented_request_id = p_request_id
  WHERE r.id = p_round_id AND r.student_id = p_student_id
  RETURNING r.presented_at INTO v_round.presented_at;
  RETURN jsonb_build_object('outcome', 'recorded', 'round_id', p_round_id, 'presented_at', v_round.presented_at);
END;
$function$$intro_ddl$;

  EXECUTE $intro_ddl$CREATE FUNCTION public.complete_introduction(p_student_id uuid, p_round_id uuid, p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_round record;
BEGIN
  IF p_student_id IS NULL OR p_round_id IS NULL OR p_request_id IS NULL THEN
    RETURN jsonb_build_object('outcome', 'invalid_request', 'reason', 'missing_identity');
  END IF;
  SELECT r.id, r.completed_at, r.completion_request_id INTO v_round FROM public.introduction_rounds r
  WHERE r.id = p_round_id AND r.student_id = p_student_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'not_found');
  END IF;
  IF v_round.completed_at IS NOT NULL THEN
    RETURN jsonb_build_object('outcome', CASE WHEN v_round.completion_request_id = p_request_id THEN 'replay' ELSE 'already_completed' END,
      'round_id', v_round.id, 'completed_at', v_round.completed_at);
  END IF;
  UPDATE public.introduction_rounds r SET completed_at = now(), completion_request_id = p_request_id
  WHERE r.id = p_round_id AND r.student_id = p_student_id
  RETURNING r.completed_at INTO v_round.completed_at;
  RETURN jsonb_build_object('outcome', 'recorded', 'round_id', p_round_id, 'completed_at', v_round.completed_at);
END;
$function$$intro_ddl$;

  EXECUTE $intro_ddl$REVOKE ALL ON FUNCTION public.serve_introduction(uuid,text), public.mark_introduction_presented(uuid,uuid,uuid),
    public.complete_introduction(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated, service_role$intro_ddl$;
  EXECUTE $intro_ddl$GRANT EXECUTE ON FUNCTION public.serve_introduction(uuid,text), public.mark_introduction_presented(uuid,uuid,uuid),
    public.complete_introduction(uuid,uuid,uuid) TO service_role$intro_ddl$;

  IF (SELECT md5(prosrc) FROM pg_catalog.pg_proc WHERE oid = to_regprocedure('public.serve_introduction(uuid,text)')) IS DISTINCT FROM '9ca8a209d747d5b1cb349e588385f9f9'
     OR (SELECT md5(prosrc) FROM pg_catalog.pg_proc WHERE oid = to_regprocedure('public.complete_introduction(uuid,uuid,uuid)')) IS DISTINCT FROM '6859d426ab39634b0fe35ab8f3f9d89b'
     OR (SELECT md5(prosrc) FROM pg_catalog.pg_proc WHERE oid = to_regprocedure('public.mark_introduction_presented(uuid,uuid,uuid)')) IS DISTINCT FROM '0409bfe9ccfbcd6dce5f960dbb4c1359'
     OR has_table_privilege('anon', 'public.learning_introductions', 'SELECT, INSERT, UPDATE, DELETE')
     OR has_table_privilege('authenticated', 'public.learning_introductions', 'SELECT, INSERT, UPDATE, DELETE')
     OR has_table_privilege('anon', 'public.introduction_rounds', 'SELECT, INSERT, UPDATE, DELETE')
     OR has_table_privilege('authenticated', 'public.introduction_rounds', 'SELECT, INSERT, UPDATE, DELETE')
     OR has_table_privilege('service_role', 'public.introduction_rounds', 'DELETE, TRUNCATE')
     OR NOT (SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.introduction_rounds'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.learning_introductions'::regclass)
     OR has_function_privilege('authenticated', 'public.complete_introduction(uuid,uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.serve_introduction(uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.mark_introduction_presented(uuid,uuid,uuid)', 'EXECUTE')
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc WHERE proname IN ('serve_introduction', 'complete_introduction', 'mark_introduction_presented') AND prosecdef) THEN
    RAISE EXCEPTION 'Introduktion: resultatet blev ikke som forventet; intet ændret';
  END IF;
END
$intro$;
