# Natteuglen (D-286): anvendelse og tilbagerulning

Gælder migrationen `supabase/migrations/20261101120000_night_owl_stop_new_awards.sql`
([D-286](../decisions/D-286.md)).

**Status:** IKKE ANVENDT I PRODUKTIONEN. Både anvendelse og tilbagerulning kræver ejerens særskilte
godkendelse (D-110, [migration-workflow-policy.md](../migration-workflow-policy.md)).

## 1. Før anvendelse (kun læsning)

1. `evaluate_achievements(uuid)` har `md5(prosrc)` `9bd9a5d5278894da7876cbd6cfd69ddd`,
   `search_path=""`, `SECURITY DEFINER` og ACL `{postgres=X/postgres,authenticated=X/postgres}`.
   Kontrolleret read-only 2026-11-01. Migrationens vagt afbryder selv, hvis kroppen er en anden.
2. `set_night_correct()` er D-278's version (`md5(prosrc)` `34d1cc5cfd2c2c199fe957a238e4436b`), og
   `authenticated` har EXECUTE.
3. Udgangspunkt (2026-11-01): 1 elev har `night_owl`, og belønningen er indløst. 1 elev har flaget
   `night_correct`. Begge bevares.
4. `list_migrations` viser ingen kollision.
5. `tests/unit/night-owl-stop-new-awards-migration-run.test.mjs` er grøn på commit'en.

## 2. Anvendelse

`apply_migration` med filens indhold ordret fra den godkendte commit, navn
`night_owl_stop_new_awards`. Ét kald.

## 3. Efter anvendelse (kun læsning)

1. `evaluate_achievements`: `md5(prosrc)` `7d213773cafcf0480f77539b975fbbec`. ACL, `search_path` og `SECURITY DEFINER` er
   uændrede.
2. `set_night_correct`: ACL uden `authenticated`, men med `service_role`.
3. Antallet af `user_achievements`-rækker for `night_owl` er uændret.

## 4. Tilbagerulning

Tilbagerulningen genskaber den præcise krop fra `20261025120000` (`md5(prosrc)` `9bd9a5d5…`) og giver
`authenticated` EXECUTE på `set_night_correct()` igen. Den ændrer ingen rækker.

```sql
-- ROLLBACK D-286 — restores evaluate_achievements (md5(prosrc) 9bd9a5d5…) and set_night_correct EXECUTE.
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

  -- night_owl: frontend sets night_correct flag when correct answer at 00:00–03:59
  IF COALESCE(v_progress.night_correct, false) THEN
    INSERT INTO public.user_achievements (student_id, achievement_id)
    VALUES (v_uid, 'night_owl') ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN v_newly_unlocked := array_append(v_newly_unlocked, 'night_owl'); END IF;
  END IF;

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

GRANT EXECUTE ON FUNCTION public.set_night_correct() TO authenticated;
```
