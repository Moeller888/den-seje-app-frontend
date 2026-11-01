-- ============================================================================
-- D-286 — Natteuglen (night_owl): no new awards to children for activity between 00:00 and 04:00.
--
-- NOT APPLIED IN PRODUCTION. Applying it needs a separate owner authorisation (D-110,
-- docs/migration-workflow-policy.md).
--
-- WHAT CHANGES (and nothing else)
--   1. evaluate_achievements(uuid): re-created from the EXACT body of
--      20261025120000_student_rpc_caller_scope.sql (= production, md5(prosrc)
--      9bd9a5d5278894da7876cbd6cfd69ddd, read-only catalog 2026-11-01) with ONLY the night_owl branch
--      removed. Every other achievement, the caller scope, signature, RETURNS jsonb, SECURITY DEFINER,
--      search_path '' and EXECUTE (authenticated) are unchanged (CREATE OR REPLACE keeps the ACL).
--   2. set_night_correct(): EXECUTE revoked from authenticated (service_role keeps it). Nothing reads
--      the flag any more; app.js calls it fire-and-forget, so pupils notice nothing. The call is removed
--      in a later client clean-up.
-- KEPT: every user_achievements row for night_owl, every user_titles row for its title, the
-- achievements catalogue row (collection.html still shows what was earned), and the night_correct
-- column. No row is changed or deleted.
--
-- GUARD: replaces only a reviewed body — production's/the repository's (9bd9a5d5…) or this file's own
-- (7d213773cafcf0480f77539b975fbbec, re-run). Anything else aborts.
--
-- ROLLBACK: docs/operations/night-owl-rollback.md.
-- ============================================================================

DO $guard$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(p.prosrc) INTO v_md5
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'evaluate_achievements';
  IF v_md5 IS NULL OR v_md5 NOT IN ('9bd9a5d5278894da7876cbd6cfd69ddd', '7d213773cafcf0480f77539b975fbbec') THEN
    RAISE EXCEPTION 'D-286: evaluate_achievements has an unreviewed body (md5 %); stop', coalesce(v_md5, 'missing');
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.evaluate_achievements(
  p_student_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller                UUID        := auth.uid();
  v_uid                   UUID;
  v_progress              RECORD;
  v_level                 INTEGER;
  v_theme_count           INTEGER;
  v_legendary_count       INTEGER;
  v_item_count            INTEGER;
  v_legendary_theme_count INTEGER;
  v_profile_created_at    TIMESTAMPTZ;
  v_newly_unlocked        TEXT[]      := ARRAY[]::TEXT[];
  v_rows                  INTEGER;
BEGIN
  -- Caller scope: an API caller acts only for themself; only the internal database context
  -- (migrations / SQL editor / pg_cron: session_user postgres or supabase_admin, no JWT subject) may
  -- name a student, as the achievement back-fills in earlier migrations do.
  IF v_caller IS NULL THEN
    IF session_user IN ('postgres', 'supabase_admin') AND p_student_id IS NOT NULL THEN
      v_uid := p_student_id;
    ELSE
      RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF p_student_id IS NOT NULL AND p_student_id IS DISTINCT FROM v_caller THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
    v_uid := v_caller;
  END IF;

  -- Read student progress (includes hidden-achievement tracking columns).
  SELECT correct_answers, xp, longest_streak, night_correct, best_session_streak
  INTO   v_progress
  FROM   public.student_progress
  WHERE  student_id = v_uid;

  IF NOT FOUND THEN
    RETURN '[]'::JSONB;
  END IF;

  -- Compute level from XP (mirrors JS).
  v_level := public.calculate_level_from_xp(COALESCE(v_progress.xp, 0));

  -- Count explicitly-acquired themes (always_owned themes are not in user_themes).
  SELECT COUNT(*) INTO v_theme_count
  FROM   public.user_themes
  WHERE  user_id = v_uid;

  -- Count legendary avatar items owned.
  SELECT COUNT(*) INTO v_legendary_count
  FROM   public.user_items  ui
  JOIN   public.shop_items  si ON si.id = ui.item_id
  WHERE  ui.user_id = v_uid
    AND  si.rarity  = 'legendary';

  -- Count total avatar items owned.
  SELECT COUNT(*) INTO v_item_count
  FROM   public.user_items
  WHERE  user_id = v_uid;

  -- Count legendary themes explicitly acquired.
  SELECT COUNT(*) INTO v_legendary_theme_count
  FROM   public.user_themes ut
  JOIN   public.themes      t  ON t.id = ut.theme_id
  WHERE  ut.user_id = v_uid
    AND  t.rarity   = 'legendary';

  -- Profile created_at — used for fast_learner time gate.
  SELECT created_at INTO v_profile_created_at
  FROM   public.profiles
  WHERE  id = v_uid;

  -- ── Phase-1 achievements ──────────────────────────────────────────────────

  IF COALESCE(v_progress.correct_answers, 0) >= 1 THEN
    INSERT INTO public.user_achievements (student_id, achievement_id)
    VALUES (v_uid, 'first_correct') ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN v_newly_unlocked := array_append(v_newly_unlocked, 'first_correct'); END IF;
  END IF;

  IF COALESCE(v_progress.correct_answers, 0) >= 10 THEN
    INSERT INTO public.user_achievements (student_id, achievement_id)
    VALUES (v_uid, 'correct_10') ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN v_newly_unlocked := array_append(v_newly_unlocked, 'correct_10'); END IF;
  END IF;

  IF COALESCE(v_progress.correct_answers, 0) >= 100 THEN
    INSERT INTO public.user_achievements (student_id, achievement_id)
    VALUES (v_uid, 'correct_100') ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN v_newly_unlocked := array_append(v_newly_unlocked, 'correct_100'); END IF;
  END IF;

  IF v_theme_count >= 1 THEN
    INSERT INTO public.user_achievements (student_id, achievement_id)
    VALUES (v_uid, 'first_theme') ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN v_newly_unlocked := array_append(v_newly_unlocked, 'first_theme'); END IF;
  END IF;

  IF v_legendary_count >= 1 THEN
    INSERT INTO public.user_achievements (student_id, achievement_id)
    VALUES (v_uid, 'first_legendary') ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN v_newly_unlocked := array_append(v_newly_unlocked, 'first_legendary'); END IF;
  END IF;

  -- Uses longest_streak so the achievement is permanent even if current streak resets.
  IF COALESCE(v_progress.longest_streak, 0) >= 7 THEN
    INSERT INTO public.user_achievements (student_id, achievement_id)
    VALUES (v_uid, 'streak_7') ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN v_newly_unlocked := array_append(v_newly_unlocked, 'streak_7'); END IF;
  END IF;

  IF v_level >= 10 THEN
    INSERT INTO public.user_achievements (student_id, achievement_id)
    VALUES (v_uid, 'level_10') ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN v_newly_unlocked := array_append(v_newly_unlocked, 'level_10'); END IF;
  END IF;

  -- ── Wave-2 achievements ───────────────────────────────────────────────────

  IF v_item_count >= 1 OR v_theme_count >= 1 THEN
    INSERT INTO public.user_achievements (student_id, achievement_id)
    VALUES (v_uid, 'first_purchase') ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN v_newly_unlocked := array_append(v_newly_unlocked, 'first_purchase'); END IF;
  END IF;

  IF v_item_count >= 5 THEN
    INSERT INTO public.user_achievements (student_id, achievement_id)
    VALUES (v_uid, 'collector_5') ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN v_newly_unlocked := array_append(v_newly_unlocked, 'collector_5'); END IF;
  END IF;

  IF v_theme_count >= 3 THEN
    INSERT INTO public.user_achievements (student_id, achievement_id)
    VALUES (v_uid, 'themes_3') ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN v_newly_unlocked := array_append(v_newly_unlocked, 'themes_3'); END IF;
  END IF;

  IF COALESCE(v_progress.longest_streak, 0) >= 30 THEN
    INSERT INTO public.user_achievements (student_id, achievement_id)
    VALUES (v_uid, 'streak_30') ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN v_newly_unlocked := array_append(v_newly_unlocked, 'streak_30'); END IF;
  END IF;

  IF COALESCE(v_progress.correct_answers, 0) >= 1000 THEN
    INSERT INTO public.user_achievements (student_id, achievement_id)
    VALUES (v_uid, 'correct_1000') ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN v_newly_unlocked := array_append(v_newly_unlocked, 'correct_1000'); END IF;
  END IF;

  -- ── Hidden achievements ───────────────────────────────────────────────────

  -- night_owl: no longer awarded (D-286). Awards already earned stay in user_achievements, and the
  -- title they granted stays in user_titles; nothing here removes them.

  -- perfect_five: frontend sets best_session_streak when 5+ correct in a row
  IF COALESCE(v_progress.best_session_streak, 0) >= 5 THEN
    INSERT INTO public.user_achievements (student_id, achievement_id)
    VALUES (v_uid, 'perfect_five') ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN v_newly_unlocked := array_append(v_newly_unlocked, 'perfect_five'); END IF;
  END IF;

  -- legendary_combo: own 1+ legendary avatar item AND 1+ legendary theme
  IF v_legendary_count >= 1 AND v_legendary_theme_count >= 1 THEN
    INSERT INTO public.user_achievements (student_id, achievement_id)
    VALUES (v_uid, 'legendary_combo') ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN v_newly_unlocked := array_append(v_newly_unlocked, 'legendary_combo'); END IF;
  END IF;

  -- fast_learner: reach level 5 within 24 hours of account creation
  IF v_level >= 5
     AND v_profile_created_at IS NOT NULL
     AND (now() - v_profile_created_at) <= interval '24 hours'
  THEN
    INSERT INTO public.user_achievements (student_id, achievement_id)
    VALUES (v_uid, 'fast_learner') ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN v_newly_unlocked := array_append(v_newly_unlocked, 'fast_learner'); END IF;
  END IF;

  RETURN to_jsonb(v_newly_unlocked);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_night_correct() FROM authenticated;
