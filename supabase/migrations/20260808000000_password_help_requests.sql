-- Section 173: Teacher-mediated password help.
--
-- A student who has forgotten their password asks for help from the login page. The backend
-- notifies the teacher the student is actually linked to (profiles.teacher_id); the teacher then
-- uses the EXISTING reset-student-password Edge Function from the student-detail page.
--
-- THIS TABLE IS NOT A CREDENTIAL. It carries no token, no hash and no password. It exists only
-- for rate limiting, deduplication and audit. Nothing in it grants any authority: the reset path
-- re-verifies the teacher/student relation server-side on every call, exactly as it does today.
--
-- No email address is stored. The user IDs are sufficient to reconstruct who was involved, and
-- auth.users remains the single source of truth for addresses.

CREATE TABLE IF NOT EXISTS public.password_help_requests (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The student the request is about. Always a real, existing student: rows are never written
  -- for unknown addresses, so this table cannot be used to enumerate what was tried.
  student_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- The teacher that was notified. NULL when the student had no teacher, or the teacher had no
  -- usable address — both are recorded outcomes, not silent drops.
  teacher_id           UUID            NULL REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Outcome of this request. Every branch the function can take is represented, so the audit
  -- trail distinguishes "we chose not to send" from "we tried and failed".
  status               TEXT        NOT NULL,

  -- Set only when Resend accepted the message.
  notification_sent_at TIMESTAMPTZ     NULL,

  -- Short, non-sensitive reason for a non-'notified' status. Never a token, password, address
  -- or provider payload.
  failure_reason       TEXT            NULL,

  CONSTRAINT password_help_requests_status_check CHECK (
    status IN (
      'notified',              -- teacher e-mail accepted by Resend
      'suppressed_cooldown',   -- valid request inside the per-student cooldown; no mail sent
      'suppressed_daily_cap',  -- valid request over the per-student 24h cap; no mail sent
      'no_teacher',            -- student has no teacher_id
      'teacher_no_email',      -- teacher exists but has no usable address in auth.users
      'mail_failed'            -- Resend rejected or was unreachable
    )
  )
);

-- The cooldown and daily-cap lookups both read the newest rows for one student.
CREATE INDEX IF NOT EXISTS password_help_requests_student_created_idx
  ON public.password_help_requests (student_id, created_at DESC);

-- FAIL-CLOSED BY CONSTRUCTION.
--
-- RLS is enabled and NO policy is created. With RLS on and no policy, PostgREST denies every
-- read and write to anon and authenticated alike — there is no row a client can reach, and no
-- policy to get subtly wrong later. The Edge Function uses the service role, which bypasses RLS.
--
-- If a teacher-facing "pending help requests" view is ever wanted, it must be added deliberately
-- as its own policy, with its own review. It is intentionally absent here.
ALTER TABLE public.password_help_requests ENABLE ROW LEVEL SECURITY;
