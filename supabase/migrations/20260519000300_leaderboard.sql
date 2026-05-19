-- ============================================================
-- Prestige Leaderboard
--
-- RPC:
--   get_leaderboard() → TABLE(...)
--     SECURITY DEFINER — reads auth.users for email-based names.
--     Returns top 50 students ranked by prestige_score (DESC),
--     with xp as tiebreaker. Always includes the calling user,
--     even if outside top 50 (appears as an extra row with their
--     actual rank so they know where they stand).
--
-- Columns returned:
--   player_rank     — RANK() window (ties share same rank)
--   user_id         — student UUID
--   display_name    — email prefix (split_part before @)
--   prestige_score  — from student_progress
--   active_title    — title id (nullable)
--   title_name      — title.name (nullable)
--   title_rarity    — title.rarity (nullable)
--   xp              — raw XP from student_progress
--   is_current_user — true for the calling user's own row
--
-- Security:
--   Auth guard: rejects unauthenticated callers.
--   SECURITY DEFINER allows reading auth.users without exposing
--   the auth schema to clients.
-- ============================================================


CREATE OR REPLACE FUNCTION public.get_leaderboard()
RETURNS TABLE(
  player_rank     BIGINT,
  user_id         UUID,
  display_name    TEXT,
  prestige_score  INTEGER,
  active_title    TEXT,
  title_name      TEXT,
  title_rarity    TEXT,
  xp              INTEGER,
  is_current_user BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  RETURN QUERY
  WITH all_ranked AS (
    SELECT
      sp.student_id,
      sp.prestige_score,
      sp.xp,
      p.active_title,
      RANK() OVER (ORDER BY sp.prestige_score DESC, sp.xp DESC) AS rnk
    FROM   public.student_progress sp
    JOIN   public.profiles p ON p.id = sp.student_id
    WHERE  p.role = 'student'
  ),
  -- Top 50 + current user if outside top 50 (UNION deduplicates).
  visible AS (
    SELECT * FROM all_ranked WHERE rnk <= 50
    UNION
    SELECT * FROM all_ranked WHERE student_id = v_uid AND rnk > 50
  )
  SELECT
    v.rnk                          AS player_rank,
    v.student_id                   AS user_id,
    split_part(u.email, '@', 1)    AS display_name,
    v.prestige_score,
    v.active_title,
    t.name                         AS title_name,
    t.rarity                       AS title_rarity,
    v.xp,
    (v.student_id = v_uid)         AS is_current_user
  FROM   visible v
  JOIN   auth.users u       ON u.id = v.student_id
  LEFT JOIN public.titles t ON t.id = v.active_title
  ORDER BY v.rnk ASC;
END;
$$;
