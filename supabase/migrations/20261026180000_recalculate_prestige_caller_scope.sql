-- Caller scope for recalculate_prestige(p_user_id) (D-220).
--
-- Before: the only check was `IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id`, so a call WITHOUT
-- a JWT subject (anon through the API, service_role) skipped it and could recalculate — and read back —
-- the prestige score of any id. EXECUTE was granted to PUBLIC, anon, authenticated and service_role.
--
-- ACCESS MODEL
--   API callers (PostgREST logs in as `authenticator` and switches to anon/authenticated/service_role):
--     the signed-in user, for their own id only (hub.html and collection.html pass the session user's id)
--     another id            — 'forbidden'
--     no auth.uid()         — 'not_authenticated' (anon and service_role have no EXECUTE at all)
--   Internal database context (session_user postgres / supabase_admin, no JWT subject): migrations and
--     the SQL editor. prestige.sql back-fills every student with PERFORM public.recalculate_prestige(<id>)
--     in a DO block, and a new prestige source (prestige.sql: "add a new UNION ALL branch") needs the same
--     back-fill; that keeps working. session_user is the connection's login role and cannot be chosen
--     through the API. Same rule as D-206.
--   NULL id                 — 'invalid_user'
--
-- The calculation (four UNION ALL sources weighted by public.prestige_weight) and the UPDATE of
-- student_progress.prestige_score are unchanged from production; only the identity head, search_path = ''
-- (every object qualified) and the privileges change. Signature and return type are unchanged.
--
-- Re-running the file is harmless (CREATE OR REPLACE + idempotent grants). Apply ONLY via apply_migration
-- with separate owner authorisation, after merge (docs/migration-workflow-policy.md §3, D-110). Never
-- `supabase db push`.

CREATE OR REPLACE FUNCTION public.recalculate_prestige(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid      UUID    := auth.uid();
  v_internal BOOLEAN := v_uid IS NULL AND session_user IN ('postgres', 'supabase_admin');
  v_score    INTEGER;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_user' USING ERRCODE = '22023';
  END IF;

  IF NOT v_internal THEN
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
    END IF;
    IF v_uid <> p_user_id THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT COALESCE(SUM(public.prestige_weight(src.rarity)), 0)::INTEGER
  INTO   v_score
  FROM (
    SELECT si.rarity
    FROM   public.user_items ui
    JOIN   public.shop_items si ON si.id = ui.item_id
    WHERE  ui.user_id   = p_user_id
      AND  si.slot_type IS NOT NULL

    UNION ALL

    SELECT t.rarity
    FROM   public.themes t
    WHERE  t.always_owned = true
       OR  t.id IN (
             SELECT ut.theme_id FROM public.user_themes ut WHERE ut.user_id = p_user_id
           )

    UNION ALL

    SELECT a.rarity
    FROM   public.user_achievements ua
    JOIN   public.achievements      a ON a.id = ua.achievement_id
    WHERE  ua.student_id = p_user_id

    UNION ALL

    SELECT ti.rarity
    FROM   public.user_titles utl
    JOIN   public.titles      ti ON ti.id = utl.title_id
    WHERE  utl.user_id = p_user_id
  ) src;

  UPDATE public.student_progress
  SET    prestige_score = v_score
  WHERE  student_id = p_user_id;

  RETURN v_score;
END;
$$;

REVOKE ALL ON FUNCTION public.recalculate_prestige(UUID) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.recalculate_prestige(UUID) TO authenticated;
