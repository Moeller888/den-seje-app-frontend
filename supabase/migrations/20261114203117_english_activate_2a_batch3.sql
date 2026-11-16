-- ============================================================================
-- Engelsk 5.000, fase 2, trin 2a: aktivering af portionen 'batch3' (500 rækker).
-- Ejerbeslutning 2026-11-14: rækkefølgen er batch3 → pilot → batch2 → grade6_9 → batch4 (runbookens
-- §2.8 C). Batch 5–10 er sat på pause og aktiveres aldrig af denne fil.
--
-- IKKE ANVENDT I PRODUKTIONEN. Anvendelse kræver særskilt ejergodkendelse (D-110,
-- docs/migration-workflow-policy.md): kun apply_migration, aldrig `supabase db push`. Trinnet anvendes
-- først, når observationen efter det foregående trin er afsluttet uden stopkriterier.
--
-- HVAD ÆNDRES (og intet andet): is_active sættes til true for præcis de 500 engelske rækker med
-- metadata.level_batch = 'batch3'. Indhold, niveau, metadata og alle andre rækker er uændrede.
--
-- VAGTER (hver afbryder hele migrationen, og intet ændres):
--   * rækkefølgen: de foregående trin (ingen) er fuldt aktiveret, og de senere
--     (2b pilot, 2c batch2, 2d grade6_9, 2e batch4) har ingen aktive rækker;
--   * ingen aktiv engelsk række har en anden level_batch end de fem portioner (batch 5–10 er sat på pause);
--   * portionen har præcis 500 engelske rækker, alle inaktive, og ingen question_instances;
--   * portionens indholdsfingeraftryk (md5 over content, difficulty_level og metadata, se nedenfor) er
--     c6de3bd6da24bed3cc61801e909ec8da: læst i produktionen 2026-11-14 og bygget af repoets INSERT-filer plus
--     20261113120000_english_review_text_corrections (tests/unit/english-activation-migrations-run.test.mjs);
--   * UPDATE ændrer præcis 500 rækker, og bagefter er portionen fuldt aktiv med uændret fingeraftryk.
-- En anden kørsel finder portionen aktiv og afbryder uden at ændre noget.
--
-- Forventet efter trinnet i produktionen: 1.588 aktive engelskopgaver (1.088 ældre + de aktiverede portioner).
--
-- TILBAGERULNING (kun med særskilt ejergodkendelse, aldrig DELETE):
--   UPDATE public.questions SET is_active = false
--    WHERE learning_objective = 'english' AND metadata->>'level_batch' = 'batch3' AND is_active;
-- ============================================================================

DO $activate$
DECLARE
  -- The five portions in the owner's order (2026-11-14). fp = md5 of the sorted per-row
  -- md5(content) | difficulty_level | md5(metadata).
  v_steps jsonb := $j$[
    {"step":"2a","batch":"batch3","size":500,"fp":"c6de3bd6da24bed3cc61801e909ec8da"},
    {"step":"2b","batch":"pilot","size":500,"fp":"11b10d3611086b38bc66755930c59aab"},
    {"step":"2c","batch":"batch2","size":500,"fp":"1071bf07c034ae9ddce7d35059ed8f3c"},
    {"step":"2d","batch":"grade6_9","size":120,"fp":"404da537f91bf9a7340b8e2c135f442e"},
    {"step":"2e","batch":"batch4","size":500,"fp":"bfe61b1c8268d65028993332dab65a4d"}
  ]$j$;
  v_own   text    := '2a';
  v_batch text    := 'batch3';
  v_size  integer := 500;
  v_fp    text    := 'c6de3bd6da24bed3cc61801e909ec8da';
  v_pos    bigint;
  r        record;
  v_n      integer;
  v_active integer;
  v_used   integer;
  v_fp_now text;
  v_rows   integer;
BEGIN
  SELECT e.ord INTO v_pos
    FROM jsonb_array_elements(v_steps) WITH ORDINALITY AS e(s, ord)
   WHERE e.s ->> 'step' = v_own
     AND e.s ->> 'batch' = v_batch
     AND (e.s ->> 'size')::integer = v_size
     AND e.s ->> 'fp' = v_fp;
  IF v_pos IS NULL THEN
    RAISE EXCEPTION 'english activation %: step missing from the order list', v_own;
  END IF;

  PERFORM 1
    FROM public.questions q
   WHERE q.learning_objective = 'english'
     AND q.metadata ? 'level_batch'
     FOR UPDATE OF q;

  -- Order: earlier steps fully active, later steps with no active row.
  FOR r IN
    SELECT e.ord, e.s ->> 'step' AS step, e.s ->> 'batch' AS batch, (e.s ->> 'size')::integer AS size
      FROM jsonb_array_elements(v_steps) WITH ORDINALITY AS e(s, ord)
     WHERE e.ord <> v_pos
     ORDER BY e.ord
  LOOP
    SELECT count(*), count(*) FILTER (WHERE q.is_active)
      INTO v_n, v_active
      FROM public.questions q
     WHERE q.learning_objective = 'english'
       AND q.metadata ->> 'level_batch' = r.batch;
    IF r.ord < v_pos AND (v_n <> r.size OR v_active <> r.size) THEN
      RAISE EXCEPTION 'english activation %: earlier step % (%) is not fully active (% of % active, % rows); nothing changed',
        v_own, r.step, r.batch, v_active, r.size, v_n;
    END IF;
    IF r.ord > v_pos AND v_active <> 0 THEN
      RAISE EXCEPTION 'english activation %: later step % (%) already has % active rows; nothing changed',
        v_own, r.step, r.batch, v_active;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_active
    FROM public.questions q
   WHERE q.learning_objective = 'english'
     AND q.is_active
     AND q.metadata ? 'level_batch'
     AND q.metadata ->> 'level_batch' NOT IN (SELECT e.s ->> 'batch' FROM jsonb_array_elements(v_steps) AS e(s));
  IF v_active <> 0 THEN
    RAISE EXCEPTION 'english activation %: % active English rows outside the five portions; nothing changed', v_own, v_active;
  END IF;

  -- The portion itself: exact size, all inactive, reviewed content, never shown.
  SELECT count(*), count(*) FILTER (WHERE q.is_active),
         md5(string_agg(md5(q.content::text) || '|' || q.difficulty_level::text || '|' || md5(q.metadata::text),
                        ',' ORDER BY md5(q.content::text)))
    INTO v_n, v_active, v_fp_now
    FROM public.questions q
   WHERE q.learning_objective = 'english'
     AND q.metadata ->> 'level_batch' = v_batch;
  IF v_n <> v_size OR v_active <> 0 THEN
    RAISE EXCEPTION 'english activation %: expected % inactive % rows, found % rows (% active); nothing changed',
      v_own, v_size, v_batch, v_n, v_active;
  END IF;
  IF v_fp_now IS DISTINCT FROM v_fp THEN
    RAISE EXCEPTION 'english activation %: content fingerprint of % is %, expected %; nothing changed',
      v_own, v_batch, v_fp_now, v_fp;
  END IF;

  SELECT count(*) INTO v_used
    FROM public.question_instances i
    JOIN public.questions q ON q.id = i.question_id
   WHERE q.learning_objective = 'english'
     AND q.metadata ->> 'level_batch' = v_batch;
  IF v_used <> 0 THEN
    RAISE EXCEPTION 'english activation %: % question_instances row(s) on %; nothing changed', v_own, v_used, v_batch;
  END IF;

  UPDATE public.questions q
     SET is_active = true
   WHERE q.learning_objective = 'english'
     AND q.metadata ->> 'level_batch' = v_batch
     AND NOT q.is_active;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> v_size THEN
    RAISE EXCEPTION 'english activation %: activated % rows, expected %', v_own, v_rows, v_size;
  END IF;

  SELECT count(*) FILTER (WHERE q.is_active),
         md5(string_agg(md5(q.content::text) || '|' || q.difficulty_level::text || '|' || md5(q.metadata::text),
                        ',' ORDER BY md5(q.content::text)))
    INTO v_active, v_fp_now
    FROM public.questions q
   WHERE q.learning_objective = 'english'
     AND q.metadata ->> 'level_batch' = v_batch;
  IF v_active <> v_size OR v_fp_now IS DISTINCT FROM v_fp THEN
    RAISE EXCEPTION 'english activation %: after the update % of % rows are active, fingerprint %', v_own, v_active, v_size, v_fp_now;
  END IF;
END
$activate$;
