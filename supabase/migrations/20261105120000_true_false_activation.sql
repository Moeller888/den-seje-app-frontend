-- ============================================================================
-- F-02 Sandt/falsk (true_false) — activation, schema half: the questions table can STORE a true_false
-- row, and public.question_is_servable counts it as servable.
--
-- NOT APPLIED IN PRODUCTION, AND NOT TO BE APPLIED ON ITS OWN. It is listed in NOT_IN_PRODUCTION
-- (tests/isolated/schema/replay-plan.mjs), so the isolated replay skips it. Applying it needs a separate
-- owner authorisation (D-110, docs/migration-workflow-policy.md, apply_migration — never db push), and
-- ONLY AFTER the get-next-question deploy below is live. Full activation spec: docs/ARCHITECTURE.md,
-- "Sandt/falsk", step 3.
--
-- ORDER (each step its own owner GO):
--   1. Code PR: _shared/interaction-kinds.ts true_false servable: true; get-next-question's v1
--      mapAnswerFormat maps "true_false" to "true_false" (today it falls back to "mc", and the row is
--      skipped for lack of options); the parity test tests/unit/question-format-mix-migration-run.test.mjs
--      then compares against THIS file's question_is_servable; owner decision on the share and on how the
--      level fold weighs a guess (the kind's guess floor is 0.5, ARCHITECTURE.md).
--   2. Deploy get-next-question from that commit (release gate, docs/operations/level-engine-rollout.md §3.1).
--      Safe on its own: no true_false row can exist yet (the constraints below reject it).
--   3. Apply THIS migration. Before step 2 it would be harmful: the live level window
--      (get_level_questions_for_student) filters with question_is_servable, so a stored true_false row
--      would be a "servable" candidate that the deployed function maps to "mc" and skips; a pupil with
--      only such rows left would never count as exhausted, so the repeat RPC refuses and they get
--      "no questions".
--   4. Content through its own reviewed migration (rows with answer_format 'true_false',
--      answer_type 'short', content { question, correct: "Sandt" | "Falsk" }, review_text recommended).
--
-- WHAT CHANGES (and nothing else)
--   1. questions_answer_format_check: production's three branches (mc, number, text) unchanged, plus a
--      true_false branch — no options, a string statement, correct exactly "Sandt" or "Falsk" (the
--      contract of supabase/functions/_shared/true-false.ts parseTrueFalseContent).
--   2. content_valid_check: production's rule unchanged (object, question, correct, and content.type mc
--      with options or text/number), plus: a true_false row needs no content.type — its stored content is
--      exactly the contract { question, correct } (+ review_text).
--   3. question_is_servable: the body of 20261019150000 with ONE added line, true_false is servable unless
--      force_text is set (classifyQuestion in _shared/interaction-kinds.ts). EXECUTE stays service_role
--      only.
-- No row is changed. Existing rows satisfy the new constraints because each new constraint is the old
-- one OR a new branch.
--
-- GUARD: replaces only the reviewed bodies/definitions (production's, or this file's own on a re-run).
--   question_is_servable: md5(prosrc) 1bca7ccb… is production's (live catalog 2026-10-30,
--   tests/unit/helpers/answer-chain-schema.mjs). The two constraint hashes are md5(pg_get_constraintdef)
--   of production's definitions as tests/unit/helpers/prod-base-schema.mjs holds them, computed on PGlite
--   (PostgreSQL 18); a read-only check against production's catalog must confirm them before applying.
--
-- ROLLBACK (only while no true_false row exists; with rows, deactivate them first):
--   re-create question_is_servable from 20261019150000 and the two constraints from the GUARD's "old"
--   definitions below, in one transaction.
-- ============================================================================

DO $tf_guard$
DECLARE
  v_md5 text;
  v_fmt text;
  v_cnt text;
BEGIN
  SELECT md5(p.prosrc) INTO v_md5 FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.question_is_servable(text,text,jsonb)');
  IF v_md5 IS NULL OR v_md5 NOT IN ('1bca7ccb0321f665f3e747fec2599e67', '3027c287884e35f42afcd1a4818e3cd0') THEN
    RAISE EXCEPTION 'F-02: question_is_servable has an unreviewed body (md5 %); stop', coalesce(v_md5, 'missing');
  END IF;

  SELECT pg_get_constraintdef(c.oid) INTO v_fmt FROM pg_constraint c
  WHERE c.conrelid = 'public.questions'::regclass AND c.conname = 'questions_answer_format_check';
  IF v_fmt IS NULL OR md5(v_fmt) NOT IN ('1fa36178e13a157349932e624ca12564', '150eb5468576f3b3eb23a577bd9027e6') THEN
    RAISE EXCEPTION 'F-02: questions_answer_format_check is unreviewed (%); stop', coalesce(v_fmt, 'missing');
  END IF;

  SELECT pg_get_constraintdef(c.oid) INTO v_cnt FROM pg_constraint c
  WHERE c.conrelid = 'public.questions'::regclass AND c.conname = 'content_valid_check';
  IF v_cnt IS NULL OR md5(v_cnt) NOT IN ('99354021b5d249d8df797f077eba8788', 'af072e87b371ba58f9838d675006c3d8') THEN
    RAISE EXCEPTION 'F-02: content_valid_check is unreviewed (%); stop', coalesce(v_cnt, 'missing');
  END IF;
END
$tf_guard$;

-- ── 1 + 2. The questions table can store a true_false row ──────────────────────────────────────

ALTER TABLE public.questions
  DROP CONSTRAINT questions_answer_format_check,
  ADD CONSTRAINT questions_answer_format_check CHECK (
    ((answer_format = 'mc'::text) AND (content ? 'options'::text) AND (jsonb_typeof((content -> 'options'::text)) = 'array'::text) AND (jsonb_array_length((content -> 'options'::text)) >= 2))
    OR ((answer_format = 'number'::text) AND (content ? 'correct'::text))
    OR ((answer_format = 'text'::text) AND (NOT (content ? 'options'::text)))
    OR ((answer_format = 'true_false'::text) AND (NOT (content ? 'options'::text))
        AND (jsonb_typeof((content -> 'question'::text)) = 'string'::text)
        AND ((content ->> 'correct'::text) = ANY (ARRAY['Sandt'::text, 'Falsk'::text])))
  ),
  DROP CONSTRAINT content_valid_check,
  ADD CONSTRAINT content_valid_check CHECK (
    (jsonb_typeof(content) = 'object'::text) AND (content ? 'question'::text) AND (content ? 'correct'::text)
    AND (
      (((content ->> 'type'::text) = 'mc'::text) AND (content ? 'options'::text) AND (jsonb_typeof((content -> 'options'::text)) = 'array'::text) AND (jsonb_array_length((content -> 'options'::text)) > 0))
      OR ((content ->> 'type'::text) = ANY (ARRAY['text'::text, 'number'::text]))
      OR (answer_format = 'true_false'::text)
    )
  );

-- ── 3. question_is_servable: true_false is servable ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.question_is_servable(
  p_answer_format text,
  p_answer_type   text,
  p_content       jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    -- The server's mapAnswerFormat is case- and space-sensitive, the browser lower-cases.
    WHEN p_answer_format IS NULL OR p_answer_format = ''
      OR p_answer_format <> lower(btrim(p_answer_format)) THEN false
    -- process-event compares answer_type = 'long' exactly; the browser trims and lower-cases.
    WHEN p_answer_type IS NOT NULL AND p_answer_type <> lower(btrim(p_answer_type)) THEN false
    -- Teacher-graded long answer: only "text" is also SHOWN as a long answer.
    WHEN coalesce(nullif(p_answer_type, ''), 'short') = 'long' THEN
      p_answer_format = 'text' AND (p_content -> 'force_text') IS DISTINCT FROM 'true'::jsonb
    WHEN coalesce(nullif(p_answer_type, ''), 'short') <> 'short' THEN false
    -- Match par: registered in the TS registry, no renderer and no grading path yet.
    WHEN p_answer_format = 'match' THEN false
    -- Sandt/falsk (F-02): servable; force_text would be shown as free text and graded as a choice.
    WHEN p_answer_format = 'true_false' THEN (p_content -> 'force_text') IS DISTINCT FROM 'true'::jsonb
    -- Server tests "mc" first, the browser "number" first: a format containing both is ambiguous.
    WHEN p_answer_format LIKE 'mc%' AND p_answer_format LIKE '%number%' THEN false
    WHEN (p_content -> 'force_text') IS NOT DISTINCT FROM 'true'::jsonb THEN p_answer_format LIKE 'mc%'
    WHEN p_answer_format LIKE 'mc%' THEN true
    WHEN p_answer_format LIKE '%number%' THEN true
    WHEN p_answer_format = 'text' THEN true
    ELSE false
  END;
$$;

COMMENT ON FUNCTION public.question_is_servable(text, text, jsonb) IS
  'SQL twin of _shared/interaction-kinds.ts classifyQuestion + servable: true only for formats server, '
  'grading and browser agree on and the client can show. Kept in lock-step by a parity test. See 20261019150000 '
  'and 20261105120000 (true_false).';

REVOKE ALL ON FUNCTION public.question_is_servable(text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.question_is_servable(text, text, jsonb) TO service_role;
