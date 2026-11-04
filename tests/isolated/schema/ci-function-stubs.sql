-- CI FUNCTION STUBS (D-110) — the three functions production has but no repository migration creates.
-- FOR THE ISOLATED E2E DATABASE ONLY. Never applied to production.
--
-- Production's bodies are NOT reproduced here (owner decision 2026-10-27). Each stub is written from the
-- CONTRACT the repository itself relies on — its callers, the tests that pin them and the migrations that
-- change them — and is deterministic, with an explicit failure path. Signatures, return types, SECURITY
-- and search_path match production's catalog metadata (read 2026-10-25), so
-- 20260919000000_review_answer_execute_lockdown.sql applies to them exactly as in production.
--
-- WHAT THE ISOLATED E2E PROVES THROUGH THESE STUBS — and what it does NOT:
--
--   ensure_student_progress()  trigger AFTER INSERT ON profiles
--     contract: a new profile with role 'student' gets one student_progress row (table defaults);
--               any other role gets none; a second insert never duplicates (ON CONFLICT DO NOTHING).
--     proves:   flows that create a pupil and then read or update its progress (create-student,
--               quiz, shop) find the row.
--     NOT:      any column value production's trigger might set beyond the table defaults.
--
--   review_answer(uuid, integer, text, uuid) → void   SECURITY DEFINER, service_role only (lockdown)
--     caller:   supabase/functions/review-answer/index.ts, AFTER its own role + ownership checks,
--               with p_teacher_id = the verified caller.
--     contract: unknown instance → exception (the Edge Function answers 500); otherwise the instance
--               records teacher_score, teacher_feedback, reviewed_at and reviewed_by.
--     proves:   the teacher review flow end to end through the Edge Function, including its failure.
--     NOT:      any XP / level / coin effect inside the database function. In the isolated E2E the
--               only XP from a review is the Edge Function's own student_progress update.
--
--   review_answer(uuid, integer, text) → json          SECURITY DEFINER, service_role only (lockdown)
--     caller:   none in the repository (no frontend, Edge Function or RPC path).
--     contract: no caller identity → exception 'Unauthorized'; an instance already scored →
--               {"status":"already_reviewed"} and nothing changes; otherwise it records the review
--               with reviewed_by = auth.uid() and returns {"status":"ok"}.
--     proves:   only that the lockdown migration applies and that the function is not callable by the
--               API roles (no test calls it).
--     NOT:      any XP / coin effect.

CREATE OR REPLACE FUNCTION public.ensure_student_progress()
 RETURNS trigger
 LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.role = 'student' THEN
    INSERT INTO public.student_progress (student_id) VALUES (NEW.id)
    ON CONFLICT (student_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_ensure_student_progress AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.ensure_student_progress();

CREATE OR REPLACE FUNCTION public.review_answer(p_instance_id uuid, p_score integer, p_feedback text, p_teacher_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  UPDATE public.question_instances
     SET teacher_score = p_score,
         teacher_feedback = p_feedback,
         reviewed_at = now(),
         reviewed_by = p_teacher_id
   WHERE id = p_instance_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Instance not found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_answer(p_instance_id uuid, p_score integer, p_feedback text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  UPDATE public.question_instances
     SET teacher_score = p_score,
         teacher_feedback = p_feedback,
         reviewed_at = now(),
         reviewed_by = auth.uid()
   WHERE id = p_instance_id
     AND teacher_score IS NULL;
  IF NOT FOUND THEN
    RETURN json_build_object('status', 'already_reviewed');
  END IF;
  RETURN json_build_object('status', 'ok');
END;
$$;
