-- ============================================================
-- Classroom Social System — Phase 1
--
-- Tables:
--   teacher_spotlights — teacher recognizes a student
--     (teacher_id, student_id, label, message, created_at)
--     One active spotlight per student per teacher.
--
-- RPCs:
--   get_classroom_leaderboard()
--     Classroom-scoped prestige ranking.
--     If caller is a student:  filters to their teacher's class.
--     If caller is a teacher:  filters to their own classroom.
--     Includes spotlight_label / spotlight_message for highlighted students.
--     Same return shape as get_leaderboard() + 2 spotlight columns.
--
--   get_weekly_activity()
--     Classroom-scoped weekly answers count (ISO week, UTC).
--     Ranks by answered_at IS NOT NULL count this week.
--     Celebrates participation, not just top prestige.
--
--   set_spotlight(p_student_id, p_label, p_message)
--     Teacher sets or updates a spotlight for one of their students.
--     UPSERT — replaces existing spotlight for that student.
--
--   remove_spotlight(p_student_id)
--     Teacher removes a spotlight they previously set.
--
--   get_my_spotlight()
--     Student fetches their own active spotlight (if any).
--     Returns TABLE — empty if no spotlight.
--
--   get_my_students()
--     Teacher fetches their full student roster with spotlight status
--     and basic stats. SECURITY DEFINER to read auth.users for names.
-- ============================================================


-- ── 1. teacher_spotlights table ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.teacher_spotlights (
  teacher_id UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label      TEXT        NOT NULL DEFAULT 'Ugens indsats',
  message    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (teacher_id, student_id)
);


-- ── 2. RLS on teacher_spotlights ─────────────────────────────────────────────

ALTER TABLE public.teacher_spotlights ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read spotlights (students see their own via RPC).
CREATE POLICY "teacher_spotlights_select"
  ON public.teacher_spotlights FOR SELECT
  TO authenticated
  USING (true);

-- All writes go through SECURITY DEFINER RPCs only.


-- ── 3. get_classroom_leaderboard() ───────────────────────────────────────────
-- Classroom-scoped prestige ranking.
-- Adds spotlight_label / spotlight_message columns vs get_leaderboard().

CREATE OR REPLACE FUNCTION public.get_classroom_leaderboard()
RETURNS TABLE(
  player_rank       BIGINT,
  user_id           UUID,
  display_name      TEXT,
  prestige_score    INTEGER,
  active_title      TEXT,
  title_name        TEXT,
  title_rarity      TEXT,
  xp                INTEGER,
  is_current_user   BOOLEAN,
  spotlight_label   TEXT,
  spotlight_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        UUID := auth.uid();
  v_teacher_id UUID;
  v_role       TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT role, teacher_id INTO v_role, v_teacher_id
  FROM   public.profiles
  WHERE  id = v_uid;

  -- Teachers see their own classroom.
  IF v_role = 'teacher' THEN
    v_teacher_id := v_uid;
  END IF;

  IF v_teacher_id IS NULL THEN
    RAISE EXCEPTION 'no_classroom';
  END IF;

  RETURN QUERY
  WITH classroom AS (
    SELECT id FROM public.profiles
    WHERE  teacher_id = v_teacher_id AND role = 'student'
  ),
  all_ranked AS (
    SELECT
      sp.student_id,
      sp.prestige_score,
      sp.xp,
      p.active_title,
      RANK() OVER (ORDER BY sp.prestige_score DESC, sp.xp DESC) AS rnk
    FROM   public.student_progress sp
    JOIN   public.profiles p ON p.id = sp.student_id
    WHERE  sp.student_id IN (SELECT id FROM classroom)
  ),
  visible AS (
    SELECT * FROM all_ranked WHERE rnk <= 50
    UNION
    SELECT * FROM all_ranked WHERE student_id = v_uid AND rnk > 50
  )
  SELECT
    v.rnk,
    v.student_id                     AS user_id,
    split_part(u.email, '@', 1)      AS display_name,
    v.prestige_score,
    v.active_title,
    t.name                           AS title_name,
    t.rarity                         AS title_rarity,
    v.xp,
    (v.student_id = v_uid)           AS is_current_user,
    ts.label                         AS spotlight_label,
    ts.message                       AS spotlight_message
  FROM   visible v
  JOIN   auth.users u ON u.id = v.student_id
  LEFT JOIN public.titles t
         ON t.id = v.active_title
  LEFT JOIN public.teacher_spotlights ts
         ON ts.student_id = v.student_id
        AND ts.teacher_id = v_teacher_id
  ORDER BY v.rnk ASC;
END;
$$;


-- ── 4. get_weekly_activity() ──────────────────────────────────────────────────
-- Weekly answered-question count per student in the calling user's classroom.
-- Week boundary: ISO Monday 00:00 UTC.
-- Counts answered_at IS NOT NULL (all attempts, not just correct).

CREATE OR REPLACE FUNCTION public.get_weekly_activity()
RETURNS TABLE(
  player_rank     BIGINT,
  user_id         UUID,
  display_name    TEXT,
  weekly_answers  BIGINT,
  is_current_user BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        UUID        := auth.uid();
  v_teacher_id UUID;
  v_role       TEXT;
  v_week_start TIMESTAMPTZ := date_trunc('week', now() AT TIME ZONE 'UTC');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT role, teacher_id INTO v_role, v_teacher_id
  FROM   public.profiles WHERE id = v_uid;

  IF v_role = 'teacher' THEN v_teacher_id := v_uid; END IF;
  IF v_teacher_id IS NULL   THEN RAISE EXCEPTION 'no_classroom'; END IF;

  RETURN QUERY
  WITH classroom AS (
    SELECT id FROM public.profiles
    WHERE  teacher_id = v_teacher_id AND role = 'student'
  ),
  counts AS (
    SELECT
      qi.student_id,
      COUNT(*) AS weekly_answers
    FROM   public.question_instances qi
    WHERE  qi.student_id IN (SELECT id FROM classroom)
      AND  qi.answered_at >= v_week_start
      AND  qi.answered_at IS NOT NULL
    GROUP BY qi.student_id
  ),
  ranked AS (
    SELECT
      cs.id                             AS student_id,
      COALESCE(c.weekly_answers, 0)     AS weekly_answers,
      RANK() OVER (
        ORDER BY COALESCE(c.weekly_answers, 0) DESC
      )                                 AS rnk
    FROM   classroom cs
    LEFT JOIN counts c ON c.student_id = cs.id
  )
  SELECT
    r.rnk,
    r.student_id                     AS user_id,
    split_part(u.email, '@', 1)      AS display_name,
    r.weekly_answers,
    (r.student_id = v_uid)           AS is_current_user
  FROM   ranked r
  JOIN   auth.users u ON u.id = r.student_id
  ORDER BY r.rnk ASC;
END;
$$;


-- ── 5. set_spotlight() ────────────────────────────────────────────────────────
-- Teacher sets or replaces a spotlight for one of their students.

CREATE OR REPLACE FUNCTION public.set_spotlight(
  p_student_id UUID,
  p_label      TEXT    DEFAULT 'Ugens indsats',
  p_message    TEXT    DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_role TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = v_uid;
  IF v_role != 'teacher' THEN RAISE EXCEPTION 'not_teacher'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE  id = p_student_id AND teacher_id = v_uid AND role = 'student'
  ) THEN
    RAISE EXCEPTION 'student_not_in_class';
  END IF;

  INSERT INTO public.teacher_spotlights
    (teacher_id, student_id, label, message, created_at)
  VALUES
    (v_uid, p_student_id, p_label, p_message, now())
  ON CONFLICT (teacher_id, student_id) DO UPDATE
    SET label      = p_label,
        message    = p_message,
        created_at = now();
END;
$$;


-- ── 6. remove_spotlight() ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.remove_spotlight(p_student_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_role TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id = v_uid;
  IF v_role != 'teacher' THEN RAISE EXCEPTION 'not_teacher'; END IF;

  DELETE FROM public.teacher_spotlights
  WHERE  teacher_id = v_uid AND student_id = p_student_id;
END;
$$;


-- ── 7. get_my_spotlight() ─────────────────────────────────────────────────────
-- Student fetches their own active spotlight. Empty result = no spotlight.

CREATE OR REPLACE FUNCTION public.get_my_spotlight()
RETURNS TABLE(
  label      TEXT,
  message    TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  RETURN QUERY
  SELECT ts.label, ts.message, ts.created_at
  FROM   public.teacher_spotlights ts
  WHERE  ts.student_id = v_uid
  LIMIT  1;
END;
$$;


-- ── 8. get_my_students() ─────────────────────────────────────────────────────
-- Teacher fetches their full student roster with spotlight and basic stats.
-- SECURITY DEFINER to read auth.users for email-prefix names.

CREATE OR REPLACE FUNCTION public.get_my_students()
RETURNS TABLE(
  student_id        UUID,
  display_name      TEXT,
  xp                INTEGER,
  prestige_score    INTEGER,
  spotlight_label   TEXT,
  spotlight_message TEXT,
  spotlight_set_at  TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_role TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id = v_uid;
  IF v_role != 'teacher' THEN RAISE EXCEPTION 'not_teacher'; END IF;

  RETURN QUERY
  SELECT
    p.id                              AS student_id,
    split_part(u.email, '@', 1)       AS display_name,
    COALESCE(sp.xp, 0)                AS xp,
    COALESCE(sp.prestige_score, 0)    AS prestige_score,
    ts.label                          AS spotlight_label,
    ts.message                        AS spotlight_message,
    ts.created_at                     AS spotlight_set_at
  FROM   public.profiles p
  JOIN   auth.users u ON u.id = p.id
  LEFT JOIN public.student_progress sp ON sp.student_id = p.id
  LEFT JOIN public.teacher_spotlights ts
         ON ts.student_id = p.id AND ts.teacher_id = v_uid
  WHERE  p.teacher_id = v_uid
    AND  p.role = 'student'
  ORDER BY split_part(u.email, '@', 1) ASC;
END;
$$;
