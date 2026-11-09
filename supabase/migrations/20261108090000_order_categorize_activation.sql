-- ============================================================================
-- F-04 Rækkefølge (order_items, answer_format "order") and F-05 Kategorisering (categorize, answer_format
-- "categorize") — activation, schema half (D-362): the questions table can STORE a valid Rækkefølge or
-- Kategorisering row, and public.question_is_servable counts both as servable.
--
-- NOT APPLIED IN PRODUCTION, AND NOT TO BE APPLIED ON ITS OWN. It is listed in NOT_IN_PRODUCTION
-- (tests/isolated/schema/replay-plan.mjs), so the isolated replay skips it. Applying it needs a separate
-- owner authorisation (D-110, docs/migration-workflow-policy.md, apply_migration — never db push), and
-- ONLY AFTER both deploys below are live.
--
-- ORDER (each step its own owner GO):
--   0. HARD PRECONDITION — production step Q-21 (the process-event deploy in the H5/K1 chain). The
--      deployed process-event (v34 code) has NO order and NO categorize shape check: it would grade the
--      browser's JSON (display positions / category indexes) as an MC answer string. Only the
--      repository's process-event canonicalises them (canonicalOrderAnswer, _shared/order-items.ts;
--      canonicalCategorizeAnswer, _shared/categorize.ts) before process_question_attempt. Nothing below
--      may happen before Q-21 is live and verified.
--   1. Deploy get-next-question from the commit that ships this file (release gate,
--      docs/operations/level-engine-rollout.md §3.1): _shared/interaction-kinds.ts order_items and
--      categorize servable: true, and v1's mapAnswerFormat maps "order" to "order" and "categorize" to
--      "categorize". Safe on its own: no order or categorize row can exist yet (the constraints below
--      reject both).
--   2. Apply THIS migration. Before step 1 it would be harmful: the live level window
--      (get_level_questions_for_student) filters with question_is_servable, so a stored order or
--      categorize row would be a "servable" candidate that the deployed function maps to "mc" and skips;
--      a pupil with only such rows left would never count as exhausted, so the repeat RPC refuses and
--      they get "no questions".
--   3. Content through its own reviewed migration, 20261108090200_order_categorize_pilot_content.sql
--      (rows with answer_format 'order' or 'categorize', answer_type 'short'), each row checked with
--      validateOrderContent / validateCategorizeContent — errors must be empty.
--
-- WHAT CHANGES (and nothing else)
--   1. NEW public.order_items_content_is_valid(jsonb): the stored-content contract of
--      supabase/functions/_shared/order-items.ts parseOrderContent + get-next-question normalizeContent's
--      question check — an object, no options, a question with a non-blank text, 3–6 items, each a string
--      that is not blank and at most 80 UTF-16 code units (JS .length) AFTER trim, every item unique after
--      trim + lower-case, and content.sequence exactly "chronological", "process" or "logical".
--   2. NEW public.categorize_content_is_valid(jsonb): the stored-content contract of
--      supabase/functions/_shared/categorize.ts parseCategorizeContent + normalizeContent's question check
--      — an object, no options, a question with a non-blank text, 2–3 category labels (strings, not blank,
--      at most 40 UTF-16 code units after trim, unique after trim + lower-case), 4–8 items, each an object
--      with a text (string, not blank, at most 80 UTF-16 code units after trim, unique after trim +
--      lower-case) and a category (a string whose trimmed value equals a trimmed label exactly), and every
--      category holding at least one item.
--      In both validators "blank" and "trim" use JavaScript's whitespace set, and lengths count UTF-16 code
--      units, so the database is never more lenient than the TS parsers. Uniqueness uses PostgreSQL's
--      lower() (production: en_US.UTF-8, which folds æ/ø/å); get-next-question's parsers stay the final
--      authority and skip a row they refuse, which is why step 3 runs the TS validators. EXECUTE is granted
--      to PUBLIC on purpose: a CHECK constraint checks EXECUTE for whoever inserts or updates ANY questions
--      row, and each function reads nothing but its argument.
--   3. questions_answer_format_check: the current definition, unchanged, OR an order branch OR a categorize
--      branch — each: answer_type NULL or 'short' (a long row would be teacher-graded by process-event), no
--      force_text (it would be shown as free text), and the kind's validator.
--   4. content_valid_check: the current definition, unchanged, OR an order row OR a categorize row that is
--      an object with question and correct (every row keeps both keys; auto_requires_correct also demands
--      a non-null correct on an auto row) and valid content. content.correct is never read for either
--      kind: the key is drawn per instance (createOrderKey / createCategorizeKey) and stored in
--      question_instances.correct_answer, and the facit is the authored content.items.
--   5. question_is_servable: the current body with ONE inserted block of two lines — "order" and
--      "categorize" are servable unless force_text is set (classifyQuestion in
--      _shared/interaction-kinds.ts). The block goes immediately before the stable anchor line
--      "-- Server tests "mc" first, …", which every accepted body holds exactly once; the Match par line
--      is not touched. EXECUTE stays service_role only.
-- No row is changed. Existing rows satisfy the new constraints because each is the old one OR a new branch.
--
-- INDEPENDENT OF F-02 (20261105120000, PR #607) AND F-03 (20261105141500, PR #615) — owner decision
-- The guard accepts the three objects in any of four states, and all three must be in the SAME state:
--   1. production as it is today (neither F-02 nor F-03 applied),
--   2. F-02 applied,
--   3. F-03 applied on production,
--   4. F-03 applied on F-02.
-- The constraints are extended by composition (current definition OR order branch OR categorize branch)
-- and the function by inserting one block, so this file adds Rækkefølge and Kategorisering and nothing
-- else in every state: applied without F-02 it does not admit true_false rows, applied without F-03 it
-- does not admit match rows. A mix of states (e.g. F-02's function with production's constraints) is
-- refused. A re-run (this file already applied: the function has one of this file's own four bodies and
-- both constraints name both validators) is a no-op. Anything else raises and stops.
-- PLAINLY: F-02's and F-03's OWN guards will refuse to run AFTER this file — they see a function body and
-- constraint definitions they have not reviewed. So if F-02 and/or F-03 are wanted, they go FIRST (F-02
-- before F-03), and this file last; otherwise their guards must be extended in their own reviewed change.
--
-- GUARD hashes. question_is_servable md5(prosrc): 1bca7ccb… (production, live catalog, confirmed read-only
--   2026-11-05), 3027c287… (F-02's body), d0b1db4e… (F-03 on production), 14a596e6… (F-03 on F-02).
--   questions_answer_format_check / content_valid_check md5(pg_get_constraintdef): 1fa36178… / 99354021…
--   (production, confirmed read-only 2026-11-05 on PostgreSQL 17.6) or F-02's 150eb546… / af072e87…
--   (computed on PGlite 18, as F-02 does). A constraint F-03 extended is recognised, as F-03 itself does,
--   by naming match_pairs_content_is_valid; it counts as F-03 on F-02 when it also names 'true_false'
--   (only F-02's definitions do), otherwise as F-03 on production. This file's own four function bodies
--   (7ea8c0c2… / e7826f70… / 32e63220… / 095f3f0c…, in the order above) were computed on PGlite 18 by
--   inserting the block into each accepted body (tests/unit/order-categorize-activation-migration-run).
--
-- ROLLBACK (only while no order or categorize row exists; with rows, deactivate and delete them first):
--   in one transaction, re-create question_is_servable and the two constraints from the definitions the
--   guard found (production / 20261019150000, 20261105120000, or 20261105141500 on either), then drop
--   public.order_items_content_is_valid(jsonb) and public.categorize_content_is_valid(jsonb).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.order_items_content_is_valid(p_content jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $fn$
DECLARE
  -- JavaScript's String.prototype.trim() whitespace (WhiteSpace + LineTerminator).
  c_ws CONSTANT text := '[\t\n\v\f\r    -     　﻿]';
  v_items jsonb;
  v_n     integer;
  v_item  jsonb;
  v_text  text;
  v_len   bigint;
  v_norm  text;
  v_seen  text[] := ARRAY[]::text[];
BEGIN
  IF p_content IS NULL OR jsonb_typeof(p_content) <> 'object' THEN RETURN false; END IF;
  -- parseOrderContent: content.options must be absent.
  IF p_content ? 'options' THEN RETURN false; END IF;
  -- normalizeContent: a question string with visible text.
  IF jsonb_typeof(p_content -> 'question') IS DISTINCT FROM 'string'
     OR regexp_replace(p_content ->> 'question', c_ws, '', 'g') = '' THEN
    RETURN false;
  END IF;

  v_items := p_content -> 'items';
  IF jsonb_typeof(v_items) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  v_n := jsonb_array_length(v_items);
  -- ORDER_MIN_ITEMS .. ORDER_MAX_ITEMS
  IF v_n < 3 OR v_n > 6 THEN RETURN false; END IF;

  FOR v_item IN SELECT e.value FROM jsonb_array_elements(v_items) AS e(value) LOOP
    IF jsonb_typeof(v_item) <> 'string' THEN RETURN false; END IF;
    -- JS it.trim(): the length limit and uniqueness apply to the trimmed text.
    v_text := regexp_replace(v_item #>> '{}', '^' || c_ws || '+|' || c_ws || '+$', '', 'g');
    IF v_text = '' THEN RETURN false; END IF;
    -- ORDER_MAX_TEXT_LENGTH in UTF-16 code units, as JavaScript counts .length.
    SELECT count(*) + count(*) FILTER (WHERE ascii(c) > 65535) INTO v_len
    FROM regexp_split_to_table(v_text, '') AS c;
    IF v_len > 80 THEN RETURN false; END IF;
    v_norm := lower(v_text);
    IF v_norm = ANY (v_seen) THEN RETURN false; END IF;
    v_seen := v_seen || v_norm;
  END LOOP;

  -- ORDER_SEQUENCES, compared exactly (no trim, no case folding), as Array.includes does.
  IF jsonb_typeof(p_content -> 'sequence') IS DISTINCT FROM 'string'
     OR (p_content ->> 'sequence') NOT IN ('chronological', 'process', 'logical') THEN
    RETURN false;
  END IF;
  RETURN true;
END
$fn$;

COMMENT ON FUNCTION public.order_items_content_is_valid(jsonb) IS
  'F-04 Rækkefølge: the stored-content contract of _shared/order-items.ts parseOrderContent, used by '
  'questions_answer_format_check and content_valid_check. Pure: reads nothing but its argument. See '
  '20261108090000.';

-- A CHECK constraint checks EXECUTE for every role that writes questions; the function is pure.
GRANT EXECUTE ON FUNCTION public.order_items_content_is_valid(jsonb) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.categorize_content_is_valid(p_content jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $fn$
DECLARE
  -- JavaScript's String.prototype.trim() whitespace (WhiteSpace + LineTerminator).
  c_ws CONSTANT text := '[\t\n\v\f\r    -     　﻿]';
  c_trim   CONSTANT text := '^' || c_ws || '+|' || c_ws || '+$';
  v_cats   jsonb;
  v_items  jsonb;
  v_n      integer;
  v_el     jsonb;
  v_text   text;
  v_len    bigint;
  v_norm   text;
  v_idx    integer;
  v_labels text[] := ARRAY[]::text[];
  v_lnorm  text[] := ARRAY[]::text[];
  v_seen   text[] := ARRAY[]::text[];
  v_used   integer[] := ARRAY[]::integer[];
BEGIN
  IF p_content IS NULL OR jsonb_typeof(p_content) <> 'object' THEN RETURN false; END IF;
  -- parseCategorizeContent: content.options must be absent.
  IF p_content ? 'options' THEN RETURN false; END IF;
  -- normalizeContent: a question string with visible text.
  IF jsonb_typeof(p_content -> 'question') IS DISTINCT FROM 'string'
     OR regexp_replace(p_content ->> 'question', c_ws, '', 'g') = '' THEN
    RETURN false;
  END IF;

  -- The category labels, trimmed, in their authored order.
  v_cats := p_content -> 'categories';
  IF jsonb_typeof(v_cats) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  v_n := jsonb_array_length(v_cats);
  -- CATEGORIZE_MIN_CATEGORIES .. CATEGORIZE_MAX_CATEGORIES
  IF v_n < 2 OR v_n > 3 THEN RETURN false; END IF;
  FOR v_el IN SELECT e.value FROM jsonb_array_elements(v_cats) AS e(value) LOOP
    IF jsonb_typeof(v_el) <> 'string' THEN RETURN false; END IF;
    v_text := regexp_replace(v_el #>> '{}', c_trim, '', 'g');
    IF v_text = '' THEN RETURN false; END IF;
    -- CATEGORIZE_MAX_LABEL_LENGTH in UTF-16 code units, as JavaScript counts .length.
    SELECT count(*) + count(*) FILTER (WHERE ascii(c) > 65535) INTO v_len
    FROM regexp_split_to_table(v_text, '') AS c;
    IF v_len > 40 THEN RETURN false; END IF;
    v_norm := lower(v_text);
    IF v_norm = ANY (v_lnorm) THEN RETURN false; END IF;
    v_lnorm := v_lnorm || v_norm;
    v_labels := v_labels || v_text;
  END LOOP;

  v_items := p_content -> 'items';
  IF jsonb_typeof(v_items) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  v_n := jsonb_array_length(v_items);
  -- CATEGORIZE_MIN_ITEMS .. CATEGORIZE_MAX_ITEMS
  IF v_n < 4 OR v_n > 8 THEN RETURN false; END IF;
  FOR v_el IN SELECT e.value FROM jsonb_array_elements(v_items) AS e(value) LOOP
    IF jsonb_typeof(v_el) <> 'object' THEN RETURN false; END IF;
    IF jsonb_typeof(v_el -> 'text') IS DISTINCT FROM 'string' THEN RETURN false; END IF;
    v_text := regexp_replace(v_el ->> 'text', c_trim, '', 'g');
    IF v_text = '' THEN RETURN false; END IF;
    -- CATEGORIZE_MAX_TEXT_LENGTH in UTF-16 code units, as JavaScript counts .length.
    SELECT count(*) + count(*) FILTER (WHERE ascii(c) > 65535) INTO v_len
    FROM regexp_split_to_table(v_text, '') AS c;
    IF v_len > 80 THEN RETURN false; END IF;
    v_norm := lower(v_text);
    IF v_norm = ANY (v_seen) THEN RETURN false; END IF;
    v_seen := v_seen || v_norm;
    -- categories.indexOf(category.trim()): the trimmed category equals a trimmed label exactly.
    IF jsonb_typeof(v_el -> 'category') IS DISTINCT FROM 'string' THEN RETURN false; END IF;
    v_idx := array_position(v_labels, regexp_replace(v_el ->> 'category', c_trim, '', 'g'));
    IF v_idx IS NULL THEN RETURN false; END IF;
    v_used := v_used || v_idx;
  END LOOP;

  -- Every category holds at least one item.
  FOR v_idx IN 1 .. array_length(v_labels, 1) LOOP
    IF NOT (v_idx = ANY (v_used)) THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END
$fn$;

COMMENT ON FUNCTION public.categorize_content_is_valid(jsonb) IS
  'F-05 Kategorisering: the stored-content contract of _shared/categorize.ts parseCategorizeContent, used by '
  'questions_answer_format_check and content_valid_check. Pure: reads nothing but its argument. See '
  '20261108090000.';

-- A CHECK constraint checks EXECUTE for every role that writes questions; the function is pure.
GRANT EXECUTE ON FUNCTION public.categorize_content_is_valid(jsonb) TO PUBLIC;

DO $oc_activation$
DECLARE
  -- question_is_servable: the reviewed bodies this file may change — 1 production, 2 F-02, 3 F-03 on
  -- production, 4 F-03 on F-02 — and, at the same index, its own result of that change (a re-run).
  c_fn_base CONSTANT text[] := ARRAY['1bca7ccb0321f665f3e747fec2599e67', '3027c287884e35f42afcd1a4818e3cd0',
                                     'd0b1db4e2982aa8d281ff5e2a61f3552', '14a596e6611f1f500089a34be9b2bfb1'];
  c_fn_own  CONSTANT text[] := ARRAY['7ea8c0c28bf5168b4d38a6cb59f3565b', 'e7826f70706caab80a68dd3379bcec78', '32e632205b2ef30abbe59269b4ec5979', '095f3f0cfb912528de83fef012b288a4'];
  -- The two constraints as production (1) and F-02 (2) define them.
  c_fmt_base CONSTANT text[] := ARRAY['1fa36178e13a157349932e624ca12564', '150eb5468576f3b3eb23a577bd9027e6'];
  c_cnt_base CONSTANT text[] := ARRAY['99354021b5d249d8df797f077eba8788', 'af072e87b371ba58f9838d675006c3d8'];
  -- The stable anchor every accepted body holds exactly once; the new block goes right before it.
  c_anchor CONSTANT text := E'    -- Server tests "mc" first, the browser "number" first: a format containing both is ambiguous.\n';
  c_block  CONSTANT text := E'    -- order_items (F-04): servable; force_text would be shown as free text and graded as an order.\n'
                         || E'    WHEN p_answer_format = ''order'' THEN (p_content -> ''force_text'') IS DISTINCT FROM ''true''::jsonb\n'
                         || E'    -- categorize (F-05): servable; force_text would be shown as free text and graded as a placement.\n'
                         || E'    WHEN p_answer_format = ''categorize'' THEN (p_content -> ''force_text'') IS DISTINCT FROM ''true''::jsonb\n';
  c_fmt_order CONSTANT text :=
    '((answer_format = ''order''::text) AND ((answer_type IS NULL) OR (answer_type = ''short''::text)) '
    || 'AND ((content -> ''force_text''::text) IS DISTINCT FROM ''true''::jsonb) '
    || 'AND public.order_items_content_is_valid(content))';
  c_fmt_cat CONSTANT text :=
    '((answer_format = ''categorize''::text) AND ((answer_type IS NULL) OR (answer_type = ''short''::text)) '
    || 'AND ((content -> ''force_text''::text) IS DISTINCT FROM ''true''::jsonb) '
    || 'AND public.categorize_content_is_valid(content))';
  c_cnt_order CONSTANT text :=
    '((answer_format = ''order''::text) AND (jsonb_typeof(content) = ''object''::text) '
    || 'AND (content ? ''question''::text) AND (content ? ''correct''::text) '
    || 'AND public.order_items_content_is_valid(content))';
  c_cnt_cat CONSTANT text :=
    '((answer_format = ''categorize''::text) AND (jsonb_typeof(content) = ''object''::text) '
    || 'AND (content ? ''question''::text) AND (content ? ''correct''::text) '
    || 'AND public.categorize_content_is_valid(content))';
  v_src  text;
  v_md5  text;
  v_fmt  text;
  v_cnt  text;
  v_fn_state  integer;  -- 1..4 = index into c_fn_base; 0 = already this file's
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
    RAISE EXCEPTION 'F-04/F-05: question_is_servable or a questions constraint is missing; stop';
  END IF;

  v_fn_state := CASE WHEN v_md5 = ANY (c_fn_own) THEN 0 ELSE coalesce(array_position(c_fn_base, v_md5), -1) END;
  IF v_fn_state < 0 THEN
    RAISE EXCEPTION 'F-04/F-05: question_is_servable has an unreviewed body (md5 %); stop', v_md5;
  END IF;

  -- A constraint this file already extended names BOTH validators (one alone is unreviewed); one F-03
  -- extended names match_pairs_content_is_valid (on F-02 when it also names 'true_false'); otherwise it
  -- must be a reviewed definition.
  v_fmt_state := CASE
    WHEN v_fmt LIKE '%order_items_content_is_valid%' AND v_fmt LIKE '%categorize_content_is_valid%' THEN 0
    WHEN v_fmt LIKE '%order_items_content_is_valid%' OR v_fmt LIKE '%categorize_content_is_valid%' THEN -1
    WHEN v_fmt LIKE '%match_pairs_content_is_valid%' THEN CASE WHEN v_fmt LIKE '%''true_false''%' THEN 4 ELSE 3 END
    ELSE coalesce(array_position(c_fmt_base, md5(v_fmt)), -1) END;
  IF v_fmt_state < 0 THEN
    RAISE EXCEPTION 'F-04/F-05: questions_answer_format_check is unreviewed (%); stop', v_fmt;
  END IF;
  v_cnt_state := CASE
    WHEN v_cnt LIKE '%order_items_content_is_valid%' AND v_cnt LIKE '%categorize_content_is_valid%' THEN 0
    WHEN v_cnt LIKE '%order_items_content_is_valid%' OR v_cnt LIKE '%categorize_content_is_valid%' THEN -1
    WHEN v_cnt LIKE '%match_pairs_content_is_valid%' THEN CASE WHEN v_cnt LIKE '%''true_false''%' THEN 4 ELSE 3 END
    ELSE coalesce(array_position(c_cnt_base, md5(v_cnt)), -1) END;
  IF v_cnt_state < 0 THEN
    RAISE EXCEPTION 'F-04/F-05: content_valid_check is unreviewed (%); stop', v_cnt;
  END IF;

  -- All three from the same state: production (1), F-02 (2), F-03 on production (3), F-03 on F-02 (4), or
  -- already this file (0).
  IF v_fn_state <> v_fmt_state OR v_fn_state <> v_cnt_state THEN
    RAISE EXCEPTION 'F-04/F-05: mixed states (question_is_servable %, answer_format_check %, content_valid_check %); stop',
      v_fn_state, v_fmt_state, v_cnt_state;
  END IF;
  IF v_fn_state = 0 THEN
    RAISE NOTICE 'F-04/F-05: already applied; nothing to do';
    RETURN;
  END IF;

  -- ── question_is_servable: one block inserted before the anchor, nothing else changes ─────────────
  IF (length(v_src) - length(replace(v_src, c_anchor, ''))) <> length(c_anchor) THEN
    RAISE EXCEPTION 'F-04/F-05: the anchor line is not in question_is_servable exactly once; stop';
  END IF;
  IF position('''order''' IN v_src) > 0 OR position('''categorize''' IN v_src) > 0 THEN
    RAISE EXCEPTION 'F-04/F-05: question_is_servable already names order or categorize; stop';
  END IF;
  v_new := replace(v_src, c_anchor, c_block || c_anchor);
  IF md5(v_new) <> c_fn_own[v_fn_state] THEN
    RAISE EXCEPTION 'F-04/F-05: unexpected new question_is_servable body (md5 %); stop', md5(v_new);
  END IF;
  EXECUTE 'CREATE OR REPLACE FUNCTION public.question_is_servable(p_answer_format text, p_answer_type text, p_content jsonb) '
       || 'RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS '
       || quote_literal(v_new);

  -- ── the two constraints: the current definition OR the order branch OR the categorize branch ────
  IF left(v_fmt, 7) <> 'CHECK (' OR left(v_cnt, 7) <> 'CHECK (' THEN
    RAISE EXCEPTION 'F-04/F-05: unexpected constraint definition shape; stop';
  END IF;
  EXECUTE format(
    'ALTER TABLE public.questions '
    || 'DROP CONSTRAINT questions_answer_format_check, ADD CONSTRAINT questions_answer_format_check CHECK (%s OR %s OR %s), '
    || 'DROP CONSTRAINT content_valid_check, ADD CONSTRAINT content_valid_check CHECK (%s OR %s OR %s)',
    substr(v_fmt, 7), c_fmt_order, c_fmt_cat, substr(v_cnt, 7), c_cnt_order, c_cnt_cat);
END
$oc_activation$;

COMMENT ON FUNCTION public.question_is_servable(text, text, jsonb) IS
  'SQL twin of _shared/interaction-kinds.ts classifyQuestion + servable: true only for formats server, '
  'grading and browser agree on and the client can show. Kept in lock-step by a parity test. See 20261019150000, '
  '20261105120000 (true_false), 20261105141500 (match) and 20261108090000 (order, categorize).';

REVOKE ALL ON FUNCTION public.question_is_servable(text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.question_is_servable(text, text, jsonb) TO service_role;
