-- ============================================================================
-- F-03 Match par (match_pairs, answer_format "match") — activation, schema half: the questions table can
-- STORE a valid Match par row, and public.question_is_servable counts it as servable.
--
-- NOT APPLIED IN PRODUCTION, AND NOT TO BE APPLIED ON ITS OWN. It is listed in NOT_IN_PRODUCTION
-- (tests/isolated/schema/replay-plan.mjs), so the isolated replay skips it. Applying it needs a separate
-- owner authorisation (D-110, docs/migration-workflow-policy.md, apply_migration — never db push), and
-- ONLY AFTER both deploys below are live.
--
-- ORDER (each step its own owner GO):
--   0. HARD PRECONDITION — production step Q-21 (the process-event deploy in the H5/K1 chain). The
--      deployed process-event (v34 code) has NO Match par path: it would grade the browser's JSON
--      connections as an MC answer string. Only the repository's process-event canonicalises them
--      (canonicalMatchAnswer, _shared/match-pairs.ts) before process_question_attempt. Nothing below may
--      happen before Q-21 is live and verified.
--   1. Deploy get-next-question from the commit that ships this file (release gate,
--      docs/operations/level-engine-rollout.md §3.1): _shared/interaction-kinds.ts match_pairs
--      servable: true, and v1's mapAnswerFormat maps "match" to "match" (any other unknown format is
--      skipped, never served as "mc"). Safe on its own: no match row can exist yet (the constraints
--      below reject it).
--   2. Apply THIS migration. Before step 1 it would be harmful: the live level window
--      (get_level_questions_for_student) filters with question_is_servable, so a stored match row would
--      be a "servable" candidate that the deployed function maps to "mc" and skips; a pupil with only
--      such rows left would never count as exhausted, so the repeat RPC refuses and they get
--      "no questions".
--   3. Content through its own reviewed migration (rows with answer_format 'match', answer_type 'short',
--      content { question, correct, pairs: [{ left, right }, …] }), each row checked with
--      validateMatchContent (_shared/match-pairs.ts) — errors must be empty.
--
-- WHAT CHANGES (and nothing else)
--   1. NEW public.match_pairs_content_is_valid(jsonb): the stored-content contract of
--      supabase/functions/_shared/match-pairs.ts parseMatchPairs + normalizeContent's question check —
--      an object, no options, a question with a non-blank text, 2–6 pairs, each pair an object with a
--      left and a right string that is not blank and at most 80 UTF-16 code units (JS .length), every
--      left unique and every right unique after trim + lower-case. "Blank" and "trim" use JavaScript's
--      whitespace set, so the database is never more lenient than parseMatchPairs. Uniqueness uses
--      PostgreSQL's lower() (production: en_US.UTF-8, which folds æ/ø/å); get-next-question's
--      parseMatchPairs stays the final authority and skips a row it refuses, which is why step 3 runs
--      validateMatchContent. EXECUTE is granted to PUBLIC on purpose: a CHECK constraint checks EXECUTE
--      for whoever inserts or updates ANY questions row, and the function reads nothing but its argument.
--   2. questions_answer_format_check: the current definition, unchanged, OR a match branch — answer_type
--      NULL or 'short' (a long match row would be teacher-graded by process-event), no force_text (it
--      would be shown as free text), and match_pairs_content_is_valid(content).
--   3. content_valid_check: the current definition, unchanged, OR a match row that is an object with
--      question and correct (every row keeps both keys; auto_requires_correct also demands correct on an
--      active row) and valid match content. content.correct is never read for Match par: the key is drawn
--      per instance (createMatchKey) and stored in question_instances.correct_answer.
--   4. question_is_servable: the current body with ONE line changed — "match" is servable unless
--      force_text is set (classifyQuestion in _shared/interaction-kinds.ts). EXECUTE stays service_role
--      only.
-- No row is changed. Existing rows satisfy the new constraints because each is the old one OR a new branch.
--
-- STACKED ON F-02 (20261105120000_true_false_activation.sql, PR #607) BUT NOT DEPENDENT ON IT
-- The guard accepts the three objects either as production has them today (F-02 not applied) or as F-02
-- leaves them, and all three must be in the SAME state. The constraints are extended by composition
-- (old definition OR match branch) and the function by replacing exactly one line, so this file adds
-- Match par and nothing else in both cases: applied without F-02 it does not admit true_false rows, and
-- F-02 applied afterwards is refused by F-02's own guard (it sees unreviewed definitions) — so if both are
-- wanted, F-02 goes first.
--
-- GUARD hashes: question_is_servable md5(prosrc) 1bca7ccb… (production, live catalog, confirmed read-only
--   2026-11-05) or 3027c287… (F-02's body). questions_answer_format_check md5(pg_get_constraintdef)
--   1fa36178… / content_valid_check 99354021… (production, confirmed read-only 2026-11-05 on PostgreSQL
--   17.6) or F-02's 150eb546… / af072e87… (computed on PGlite 18, as F-02 does). A re-run (this file
--   already applied) is a no-op.
--
-- ROLLBACK (only while no match row exists; with rows, deactivate and delete them first):
--   in one transaction, re-create question_is_servable and the two constraints from the definitions the
--   guard found (20261019150000 / production, or 20261105120000), then drop
--   public.match_pairs_content_is_valid(jsonb).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.match_pairs_content_is_valid(p_content jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $fn$
DECLARE
  -- JavaScript's String.prototype.trim() whitespace (WhiteSpace + LineTerminator).
  c_ws CONSTANT text := '[\t\n\v\f\r    -     　﻿]';
  v_pairs  jsonb;
  v_n      integer;
  v_pair   jsonb;
  v_side   text;
  v_text   text;
  v_len    bigint;
  v_norm   text;
  v_lefts  text[] := ARRAY[]::text[];
  v_rights text[] := ARRAY[]::text[];
BEGIN
  IF p_content IS NULL OR jsonb_typeof(p_content) <> 'object' THEN RETURN false; END IF;
  -- MATCH_ROW: content.options must be absent (parseMatchPairs refuses it).
  IF p_content ? 'options' THEN RETURN false; END IF;
  -- normalizeContent: a question string with visible text.
  IF jsonb_typeof(p_content -> 'question') IS DISTINCT FROM 'string'
     OR regexp_replace(p_content ->> 'question', c_ws, '', 'g') = '' THEN
    RETURN false;
  END IF;

  v_pairs := p_content -> 'pairs';
  IF jsonb_typeof(v_pairs) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  v_n := jsonb_array_length(v_pairs);
  -- MATCH_MIN_PAIRS .. MATCH_MAX_PAIRS
  IF v_n < 2 OR v_n > 6 THEN RETURN false; END IF;

  FOR v_pair IN SELECT e.value FROM jsonb_array_elements(v_pairs) AS e(value) LOOP
    IF jsonb_typeof(v_pair) <> 'object' THEN RETURN false; END IF;
    FOREACH v_side IN ARRAY ARRAY['left', 'right'] LOOP
      IF jsonb_typeof(v_pair -> v_side) IS DISTINCT FROM 'string' THEN RETURN false; END IF;
      v_text := v_pair ->> v_side;
      IF regexp_replace(v_text, c_ws, '', 'g') = '' THEN RETURN false; END IF;
      -- MATCH_MAX_TEXT_LENGTH in UTF-16 code units, as JavaScript counts .length.
      SELECT count(*) + count(*) FILTER (WHERE ascii(c) > 65535) INTO v_len
      FROM regexp_split_to_table(v_text, '') AS c;
      IF v_len > 80 THEN RETURN false; END IF;
      v_norm := lower(regexp_replace(v_text, '^' || c_ws || '+|' || c_ws || '+$', '', 'g'));
      IF v_side = 'left' THEN
        IF v_norm = ANY (v_lefts) THEN RETURN false; END IF;
        v_lefts := v_lefts || v_norm;
      ELSE
        IF v_norm = ANY (v_rights) THEN RETURN false; END IF;
        v_rights := v_rights || v_norm;
      END IF;
    END LOOP;
  END LOOP;
  RETURN true;
END
$fn$;

COMMENT ON FUNCTION public.match_pairs_content_is_valid(jsonb) IS
  'F-03 Match par: the stored-content contract of _shared/match-pairs.ts parseMatchPairs, used by '
  'questions_answer_format_check and content_valid_check. Pure: reads nothing but its argument. See '
  '20261105141500.';

-- A CHECK constraint checks EXECUTE for every role that writes questions; the function is pure.
GRANT EXECUTE ON FUNCTION public.match_pairs_content_is_valid(jsonb) TO PUBLIC;

DO $mp_activation$
DECLARE
  -- question_is_servable: the reviewed bodies this file may change (production / F-02) and its own
  -- results of that change (a re-run).
  c_fn_base CONSTANT text[] := ARRAY['1bca7ccb0321f665f3e747fec2599e67', '3027c287884e35f42afcd1a4818e3cd0'];
  c_fn_own  CONSTANT text[] := ARRAY['d0b1db4e2982aa8d281ff5e2a61f3552', '14a596e6611f1f500089a34be9b2bfb1'];
  c_fmt_base CONSTANT text[] := ARRAY['1fa36178e13a157349932e624ca12564', '150eb5468576f3b3eb23a577bd9027e6'];
  c_cnt_base CONSTANT text[] := ARRAY['99354021b5d249d8df797f077eba8788', 'af072e87b371ba58f9838d675006c3d8'];
  c_old_line CONSTANT text := E'    -- Match par: registered in the TS registry, no renderer and no grading path yet.\n'
                              || E'    WHEN p_answer_format = ''match'' THEN false\n';
  c_new_line CONSTANT text := E'    -- Match par (F-03): servable; force_text would be shown as free text and graded as connections.\n'
                              || E'    WHEN p_answer_format = ''match'' THEN (p_content -> ''force_text'') IS DISTINCT FROM ''true''::jsonb\n';
  c_fmt_branch CONSTANT text :=
    '((answer_format = ''match''::text) AND ((answer_type IS NULL) OR (answer_type = ''short''::text)) '
    || 'AND ((content -> ''force_text''::text) IS DISTINCT FROM ''true''::jsonb) '
    || 'AND public.match_pairs_content_is_valid(content))';
  c_cnt_branch CONSTANT text :=
    '((answer_format = ''match''::text) AND (jsonb_typeof(content) = ''object''::text) '
    || 'AND (content ? ''question''::text) AND (content ? ''correct''::text) '
    || 'AND public.match_pairs_content_is_valid(content))';
  v_src  text;
  v_md5  text;
  v_fmt  text;
  v_cnt  text;
  v_fn_state  integer;  -- 1 = production, 2 = F-02 (index into c_fn_base); 0 = already this file's
  v_fmt_state integer;
  v_cnt_state integer;
  v_new  text;
BEGIN
  SELECT p.prosrc INTO v_src FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.question_is_servable(text,text,jsonb)');
  v_md5 := md5(v_src);
  SELECT pg_get_constraintdef(c.oid) INTO v_fmt FROM pg_constraint c
  WHERE c.conrelid = 'public.questions'::regclass AND c.conname = 'questions_answer_format_check';
  SELECT pg_get_constraintdef(c.oid) INTO v_cnt FROM pg_constraint c
  WHERE c.conrelid = 'public.questions'::regclass AND c.conname = 'content_valid_check';

  IF v_md5 IS NULL OR v_fmt IS NULL OR v_cnt IS NULL THEN
    RAISE EXCEPTION 'F-03: question_is_servable or a questions constraint is missing; stop';
  END IF;

  v_fn_state := CASE WHEN v_md5 = ANY (c_fn_own) THEN 0 ELSE coalesce(array_position(c_fn_base, v_md5), -1) END;
  IF v_fn_state < 0 THEN
    RAISE EXCEPTION 'F-03: question_is_servable has an unreviewed body (md5 %); stop', v_md5;
  END IF;
  -- A constraint this file already extended names the helper; otherwise it must be a reviewed definition.
  v_fmt_state := CASE WHEN v_fmt LIKE '%match_pairs_content_is_valid%' THEN 0
                      ELSE coalesce(array_position(c_fmt_base, md5(v_fmt)), -1) END;
  IF v_fmt_state < 0 THEN
    RAISE EXCEPTION 'F-03: questions_answer_format_check is unreviewed (%); stop', v_fmt;
  END IF;
  v_cnt_state := CASE WHEN v_cnt LIKE '%match_pairs_content_is_valid%' THEN 0
                      ELSE coalesce(array_position(c_cnt_base, md5(v_cnt)), -1) END;
  IF v_cnt_state < 0 THEN
    RAISE EXCEPTION 'F-03: content_valid_check is unreviewed (%); stop', v_cnt;
  END IF;

  -- All three from the same state: production (1), F-02 (2), or already this file (0).
  IF v_fn_state <> v_fmt_state OR v_fn_state <> v_cnt_state THEN
    RAISE EXCEPTION 'F-03: mixed states (question_is_servable %, answer_format_check %, content_valid_check %); stop',
      v_fn_state, v_fmt_state, v_cnt_state;
  END IF;
  IF v_fn_state = 0 THEN
    RAISE NOTICE 'F-03: already applied; nothing to do';
    RETURN;
  END IF;

  -- ── question_is_servable: exactly one line changes ───────────────────────────────────────────
  IF (length(v_src) - length(replace(v_src, c_old_line, ''))) <> length(c_old_line) THEN
    RAISE EXCEPTION 'F-03: the Match par line is not in question_is_servable exactly once; stop';
  END IF;
  v_new := replace(v_src, c_old_line, c_new_line);
  IF md5(v_new) <> c_fn_own[v_fn_state] THEN
    RAISE EXCEPTION 'F-03: unexpected new question_is_servable body (md5 %); stop', md5(v_new);
  END IF;
  EXECUTE 'CREATE OR REPLACE FUNCTION public.question_is_servable(p_answer_format text, p_answer_type text, p_content jsonb) '
       || 'RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS '
       || quote_literal(v_new);

  -- ── the two constraints: the current definition OR the match branch ──────────────────────────
  IF left(v_fmt, 7) <> 'CHECK (' OR left(v_cnt, 7) <> 'CHECK (' THEN
    RAISE EXCEPTION 'F-03: unexpected constraint definition shape; stop';
  END IF;
  EXECUTE format(
    'ALTER TABLE public.questions '
    || 'DROP CONSTRAINT questions_answer_format_check, ADD CONSTRAINT questions_answer_format_check CHECK (%s OR %s), '
    || 'DROP CONSTRAINT content_valid_check, ADD CONSTRAINT content_valid_check CHECK (%s OR %s)',
    substr(v_fmt, 7), c_fmt_branch, substr(v_cnt, 7), c_cnt_branch);
END
$mp_activation$;

COMMENT ON FUNCTION public.question_is_servable(text, text, jsonb) IS
  'SQL twin of _shared/interaction-kinds.ts classifyQuestion + servable: true only for formats server, '
  'grading and browser agree on and the client can show. Kept in lock-step by a parity test. See 20261019150000, '
  '20261105120000 (true_false) and 20261105141500 (match).';

REVOKE ALL ON FUNCTION public.question_is_servable(text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.question_is_servable(text, text, jsonb) TO service_role;
