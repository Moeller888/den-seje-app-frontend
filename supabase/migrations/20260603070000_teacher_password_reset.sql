-- Section 137: Teacher-initiated password reset.
--
-- Adds must_reset_password flag to profiles and an audit log table.
-- The flag is set by the reset-student-password Edge Function and cleared
-- by reset-password.js after the student successfully chooses a new password.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_reset_password BOOLEAN NOT NULL DEFAULT false;

-- One row per teacher-initiated reset. Written by the Edge Function (service
-- role), so no INSERT policy is needed — service role bypasses RLS.
CREATE TABLE IF NOT EXISTS public.teacher_password_resets (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reset_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.teacher_password_resets ENABLE ROW LEVEL SECURITY;

-- Teachers may read only their own reset history.
CREATE POLICY "tpr_teacher_select"
  ON public.teacher_password_resets
  FOR SELECT
  TO authenticated
  USING (teacher_id = auth.uid());
