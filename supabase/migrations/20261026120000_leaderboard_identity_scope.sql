-- Identity scope for get_leaderboard (the "Alle" tab of leaderboard.html).
--
-- The ranking itself is unchanged: every student ranked by prestige_score, then xp; the top 50 plus the
-- caller's own row when it falls outside them. What changes is which rows carry an identity:
--
-- ACCESS MODEL
--   anon / service_role   — no EXECUTE (revoked from PUBLIC, anon and service_role; no backend calls it)
--   no auth.uid()         — 'not_authenticated'
--   no profile            — 'forbidden' (an account without a Lærlig profile is not a pupil or teacher)
--   student               — display_name for themself and for classmates (same, non-NULL teacher_id);
--                           user_id only on their own row
--   teacher               — display_name for their own pupils (teacher_id = caller and the caller's role
--                           is 'teacher' — the same rule as profiles_select); no user_id
--   super_admin           — no names, no user_id (a super_admin has no class)
--   every other row       — display_name 'Elev', user_id NULL
--
-- RESIDUAL RISK (documented, not solved here): rank, prestige_score, exact xp and the title of rows from
-- other classes are still returned. With few classes, a very small class, a rare title or repeated
-- snapshots, a pupil who already knows something about another pupil may be able to tell which row is
-- theirs. This is pseudonymisation, not anonymisation. See D-209.
--
-- SECURITY DEFINER is required: the ranking reads every pupil's student_progress row (RLS: own row only)
-- and the classmates' names come from auth.users, which authenticated cannot read. SECURITY INVOKER would
-- need both opened to every caller. The function therefore checks the caller itself, has
-- search_path = '' with every object qualified, and EXECUTE for authenticated only.
--
-- The signature (no arguments, same RETURNS TABLE) is unchanged, so CREATE OR REPLACE keeps the PostgREST
-- contract; leaderboard.html never reads user_id.
--
-- Re-running the file is harmless (CREATE OR REPLACE + idempotent grants). Apply ONLY via apply_migration
-- with separate owner authorisation, after merge (docs/migration-workflow-policy.md §3, D-110). Never
-- `supabase db push`.

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
SET search_path = ''
AS $$
DECLARE
  v_uid        UUID := auth.uid();
  v_role       TEXT;
  v_teacher_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT p.role, p.teacher_id INTO v_role, v_teacher_id
  FROM   public.profiles p
  WHERE  p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
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
  ),
  -- Pupils whose name the caller may see besides themself: classmates, or a teacher's own pupils.
  named AS (
    SELECT c.id
    FROM   public.profiles c
    WHERE  c.role = 'student'
      AND (   (v_role = 'student' AND v_teacher_id IS NOT NULL AND c.teacher_id = v_teacher_id)
           OR (v_role = 'teacher' AND c.teacher_id = v_uid))
  )
  SELECT
    v.rnk                                                   AS player_rank,
    CASE WHEN v.student_id = v_uid THEN v.student_id END    AS user_id,
    CASE WHEN v.student_id = v_uid
           OR v.student_id IN (SELECT n.id FROM named n)
         THEN split_part(u.email, '@', 1)
         ELSE 'Elev'
    END                                                     AS display_name,
    v.prestige_score,
    v.active_title,
    t.name                                                  AS title_name,
    t.rarity                                                AS title_rarity,
    v.xp,
    (v.student_id = v_uid)                                  AS is_current_user
  FROM   visible v
  JOIN   auth.users u       ON u.id = v.student_id
  LEFT JOIN public.titles t ON t.id = v.active_title
  ORDER BY v.rnk ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_leaderboard() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_leaderboard() TO authenticated;
