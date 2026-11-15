-- ============================================================================
-- D-362 / F-07 — undervisningsforløb: katalog, tilmelding og afslutning (ejerens beslutninger 2026-11-15).
-- IKKE ANVENDT. Kun via apply_migration med særskilt ejerautorisation for netop denne fil (D-110). Listet i
-- NOT_IN_PRODUCTION (tests/isolated/schema/replay-plan.mjs). Skal anvendes FØR get-next-question med forløb
-- deployes, og efter 20261113170000 (fasegentagelsen). Rækkefølge og rollback: docs/operations/f07-course-completion.md.
--
-- Hvorfor: adgang til et forløb og elevens almindelige historie er to forskellige ting. Pilotadgang må ikke
-- omskrive profiles.active_domains (NULL = alle historiedomæner). Tilmeldingen giver KUN adgang til et forløb i
-- kataloget; elevens øvrige domæner er urørte.
--
--   public.courses            eksplicit godkendte forløb (kun via migration). teacher_assignable = false betyder, at
--                             kun en super_admin (eller ejeren med service_role) kan tildele forløbet.
--   public.course_enrolments  én række pr. elev og forløb (PK). status active/revoked; tilbagekaldelse sletter intet.
--                             completed_at: FØRSTE gennemførelse, sat én gang af serveren (record_course_completion).
--                             summary_acknowledged_at: eleven har set opsummeringen og valgt; sat én gang.
--
-- Adgangsregler (RLS + funktioner; ingen INSERT/UPDATE/DELETE-politikker, alle skrivninger går gennem funktionerne):
--   eleven        læser sine egne tilmeldinger og de aktive forløb; kan KUN kvittere for en opsummering, når
--                 serveren allerede har registreret gennemførelsen (acknowledge_course_summary).
--   lærer         kan tildele/tilbagekalde for EGNE elever (profiles.teacher_id) og kun teacher_assignable forløb.
--   super_admin   kan tildele/tilbagekalde for enhver elev og ethvert aktivt forløb.
--   service_role  get-next-question læser tilmeldingen og registrerer den første gennemførelse.
--
-- FJERNELSE (før nogen elev er tilmeldt): DROP FUNCTION public.acknowledge_course_summary(text);
--   DROP FUNCTION public.record_course_completion(uuid, text); DROP FUNCTION public.revoke_course_enrolment(uuid, text);
--   DROP FUNCTION public.grant_course_enrolment(uuid, text); DROP TABLE public.course_enrolments; DROP TABLE public.courses;
-- Efter brug: lad tabellerne stå (historik) og tilbagekald tilmeldingerne i stedet.
-- ============================================================================

CREATE TABLE public.courses (
  course_id          text        PRIMARY KEY CHECK (course_id ~ '^pilot_[a-z0-9_]{1,40}$'),
  title              text        NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 80),
  topics             text[]      NOT NULL DEFAULT '{}',
  teacher_assignable boolean     NOT NULL DEFAULT false,
  is_active          boolean     NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.courses IS
  'D-362: eksplicit godkendte undervisningsforløb. course_id = questions.learning_objective for forløbets opgaver. Nye forløb kun via migration.';

INSERT INTO public.courses (course_id, title, topics, teacher_assignable)
VALUES ('pilot_d362', 'Grundloven af 1849',
        ARRAY['Enevælde og indskrænket monarki', 'Valgretten i 1849', 'At læse Grundlovens § 35', 'Magtens tredeling i § 2'],
        false);

CREATE TABLE public.course_enrolments (
  student_id              uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id               text        NOT NULL REFERENCES public.courses(course_id) ON DELETE RESTRICT,
  status                  text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  granted_by              uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  granted_at              timestamptz NOT NULL DEFAULT now(),
  revoked_by              uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  revoked_at              timestamptz,
  completed_at            timestamptz,
  summary_acknowledged_at timestamptz,
  PRIMARY KEY (student_id, course_id),
  CONSTRAINT course_enrolments_revoked_consistency CHECK ((status = 'revoked') = (revoked_at IS NOT NULL)),
  CONSTRAINT course_enrolments_ack_after_completion CHECK (summary_acknowledged_at IS NULL OR completed_at IS NOT NULL)
);

COMMENT ON TABLE public.course_enrolments IS
  'D-362: elevens adgang til et forløb og forløbets afslutning. Skrives kun af grant/revoke/record/acknowledge-funktionerne.';

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_enrolments ENABLE ROW LEVEL SECURITY;

-- Least privilege: Supabase's default privileges give anon, authenticated AND service_role ALL on a new table. Every
-- write goes through the SECURITY DEFINER functions below, so even get-next-question (service_role) only reads.
REVOKE ALL ON public.courses, public.course_enrolments FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.courses, public.course_enrolments TO authenticated;
GRANT SELECT ON public.courses, public.course_enrolments TO service_role;

CREATE POLICY courses_read_active ON public.courses
  FOR SELECT TO authenticated USING (is_active);

CREATE POLICY course_enrolments_read_own ON public.course_enrolments
  FOR SELECT TO authenticated USING (student_id = auth.uid());

-- Who may grant or revoke p_course_id for p_student_id: a super_admin always; a teacher only for their own pupil
-- and only a teacher_assignable course. Raises on anything else. SECURITY INVOKER: it is only ever called from the
-- definer functions below (which run as the owner); nobody can execute it directly.
CREATE OR REPLACE FUNCTION public.course_enrolment_authorize(p_student_id uuid, p_course_id text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller   uuid := auth.uid();
  v_role     text;
  v_assign   boolean;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  SELECT c.teacher_assignable INTO v_assign FROM public.courses c WHERE c.course_id = p_course_id AND c.is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'course_not_available';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_student_id AND p.role = 'student') THEN
    RAISE EXCEPTION 'not_a_student';
  END IF;
  SELECT p.role INTO v_role FROM public.profiles p WHERE p.id = v_caller;
  IF v_role = 'super_admin' THEN
    RETURN v_caller;
  END IF;
  IF v_role = 'teacher' AND v_assign
     AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_student_id AND p.teacher_id = v_caller) THEN
    RETURN v_caller;
  END IF;
  RAISE EXCEPTION 'not_authorized';
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_course_enrolment(p_student_id uuid, p_course_id text)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := public.course_enrolment_authorize(p_student_id, p_course_id);
  v_status text;
BEGIN
  -- Two grants at once (two admin tabs): ON CONFLICT makes the loser wait for the winner's row instead of failing on
  -- the primary key; it then reads that row under lock like any later grant.
  INSERT INTO public.course_enrolments (student_id, course_id, granted_by) VALUES (p_student_id, p_course_id, v_caller)
  ON CONFLICT (student_id, course_id) DO NOTHING;
  IF FOUND THEN
    RETURN 'granted';
  END IF;
  SELECT e.status INTO v_status FROM public.course_enrolments e
  WHERE e.student_id = p_student_id AND e.course_id = p_course_id FOR UPDATE;
  IF v_status = 'active' THEN
    RETURN 'already_active';
  END IF;
  -- Re-granted: the pupil's history (completed_at, summary) is kept.
  UPDATE public.course_enrolments
  SET status = 'active', revoked_at = NULL, revoked_by = NULL, granted_by = v_caller, granted_at = now()
  WHERE student_id = p_student_id AND course_id = p_course_id;
  RETURN 'reactivated';
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_course_enrolment(p_student_id uuid, p_course_id text)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := public.course_enrolment_authorize(p_student_id, p_course_id);
BEGIN
  UPDATE public.course_enrolments
  SET status = 'revoked', revoked_at = now(), revoked_by = v_caller
  WHERE student_id = p_student_id AND course_id = p_course_id AND status = 'active';
  RETURN CASE WHEN FOUND THEN 'revoked' ELSE 'not_active' END;
END;
$$;

-- get-next-question (service_role): the FIRST completion of an active enrolment, set once. Returns the stored
-- completed_at, or NULL when the pupil has no active enrolment. A later re-answer never moves it.
CREATE OR REPLACE FUNCTION public.record_course_completion(p_student_id uuid, p_course_id text)
RETURNS timestamptz
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_at timestamptz;
BEGIN
  UPDATE public.course_enrolments
  SET completed_at = now()
  WHERE student_id = p_student_id AND course_id = p_course_id AND status = 'active' AND completed_at IS NULL;
  SELECT e.completed_at INTO v_at FROM public.course_enrolments e
  WHERE e.student_id = p_student_id AND e.course_id = p_course_id AND e.status = 'active';
  RETURN v_at;
END;
$$;

-- The pupil (authenticated): "I have seen my summary and chosen". Only after the server recorded the completion,
-- set once. Returns true when the summary is acknowledged (now or before), false otherwise.
CREATE OR REPLACE FUNCTION public.acknowledge_course_summary(p_course_id text)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  UPDATE public.course_enrolments
  SET summary_acknowledged_at = now()
  WHERE student_id = v_caller AND course_id = p_course_id AND status = 'active'
    AND completed_at IS NOT NULL AND summary_acknowledged_at IS NULL;
  RETURN EXISTS (
    SELECT 1 FROM public.course_enrolments e
    WHERE e.student_id = v_caller AND e.course_id = p_course_id AND e.status = 'active' AND e.summary_acknowledged_at IS NOT NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.course_enrolment_authorize(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_course_enrolment(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_course_enrolment(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_course_completion(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.acknowledge_course_summary(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_course_enrolment(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_course_enrolment(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.acknowledge_course_summary(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_course_completion(uuid, text) TO service_role;
