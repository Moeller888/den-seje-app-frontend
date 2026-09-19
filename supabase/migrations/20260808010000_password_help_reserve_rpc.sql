-- Section 173: make password-help rate limiting atomic.
--
-- The first version decided the rate limit in the Edge Function: read history, decide, send
-- mail, then insert the audit row. Between the read and the insert there was no lock and no
-- constraint, so two concurrent requests for the same student could both observe "no cooldown"
-- and both send a teacher notification. Rate limiting was advisory, not enforced.
--
-- This migration moves the decision INTO the database, where read, decision and reservation
-- happen inside one transaction under a per-student lock. The Edge Function may only send mail
-- after it holds a reservation row.
--
-- Forward-only: 20260808000000 is already applied and is not edited.

-- ── 1. Extend the status contract ───────────────────────────────────────────
-- 'reserved'        — the decision was "allowed"; a mail attempt is in flight or was abandoned.
--                     It COUNTS against cooldown and cap on purpose: if the function crashes
--                     between reserving and finalising, the crash window must not become a
--                     licence to send a second mail.
-- 'technical_error' — a controlled failure that is NOT a business outcome. It exists so a
--                     database or auth fault can be recorded truthfully instead of being
--                     written down as 'teacher_no_email' or silently dropped.
ALTER TABLE public.password_help_requests
  DROP CONSTRAINT IF EXISTS password_help_requests_status_check;

ALTER TABLE public.password_help_requests
  ADD CONSTRAINT password_help_requests_status_check CHECK (
    status IN (
      'reserved',
      'notified',
      'mail_failed',
      'suppressed_cooldown',
      'suppressed_daily_cap',
      'no_teacher',
      'teacher_no_email',
      'technical_error'
    )
  );

-- ── 2. The atomic decision ──────────────────────────────────────────────────
-- Returns exactly one row: the decision and the id of the audit row it wrote.
--
-- Serialisation: pg_advisory_xact_lock keyed on the student's uuid. The lock is taken inside
-- the function's transaction and released when that transaction ends, so the read, the decision
-- and the insert are indivisible with respect to any other caller for the SAME student.
--
-- Two different students CAN collide on the same 64-bit hash. That is harmless: a collision
-- makes two unrelated callers take turns instead of running in parallel. It costs a little
-- latency and never correctness, because the decision itself is scoped by student_id.
CREATE OR REPLACE FUNCTION public.reserve_password_help(
  p_student_id       uuid,
  p_teacher_id       uuid,
  p_cooldown_minutes integer,
  p_daily_cap        integer
)
RETURNS TABLE (decision text, request_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_attempts    integer;
  v_last_at     timestamptz;
  v_new_id      uuid;
  v_decision    text;
BEGIN
  IF p_student_id IS NULL THEN
    RAISE EXCEPTION 'reserve_password_help: student id is required';
  END IF;

  IF p_cooldown_minutes IS NULL OR p_cooldown_minutes < 0
     OR p_daily_cap IS NULL OR p_daily_cap < 1 THEN
    RAISE EXCEPTION 'reserve_password_help: invalid rate-limit parameters';
  END IF;

  -- One decision at a time per student. Everything below runs while this lock is held.
  -- Every pg_catalog function is schema-qualified: search_path is empty, and a SECURITY DEFINER
  -- function must not depend on implicit resolution for anything it calls.
  -- The key is derived from the uuid's canonical text, so two callers for the same student
  -- always compute the identical bigint and therefore contend on the identical lock.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_student_id::pg_catalog.text, 0)
  );

  -- WHAT CONSUMES THE BUDGET: every status a row can hold once a reservation exists.
  --
  --   reserved        the outcome is not known yet, or the function died before finalising
  --   notified        the provider accepted the message
  --   mail_failed     the provider rejected it, or was unreachable
  --   technical_error the mail dependency threw
  --
  -- The last two are counted for the same reason as the first: a failure on our side of the
  -- wire does NOT prove the provider did not accept the message. A lost response and a
  -- rejected request are indistinguishable from here, so both must consume the budget — the
  -- cost of over-counting is one delayed notification, the cost of under-counting is a
  -- duplicate mail to a teacher, which is the thing this function exists to prevent.
  --
  -- If a future outcome can prove that NO provider call was made, it may be excluded here —
  -- but only then, and it must be a status of its own rather than a reused one.
  --
  -- Suppressions and the no-teacher / no-email records are written WITHOUT a reservation:
  -- they are audit facts, not attempts, and deliberately do not count. Each reservation row is
  -- counted once — the row is UPDATEd in place on finalisation, never duplicated.
  SELECT count(*), max(r.created_at)
    INTO v_attempts, v_last_at
    FROM public.password_help_requests AS r
   WHERE r.student_id = p_student_id
     AND r.created_at >= pg_catalog.now() - pg_catalog.make_interval(hours => 24)
     AND r.status IN ('reserved', 'notified', 'mail_failed', 'technical_error');

  IF v_attempts >= p_daily_cap THEN
    v_decision := 'suppressed_daily_cap';
  -- Cooldown runs from the newest counted attempt, which for a live reservation is that
  -- reservation's own created_at.
  ELSIF v_last_at IS NOT NULL
        AND v_last_at > pg_catalog.now() - pg_catalog.make_interval(mins => p_cooldown_minutes) THEN
    v_decision := 'suppressed_cooldown';
  ELSE
    v_decision := 'reserved';
  END IF;

  INSERT INTO public.password_help_requests (student_id, teacher_id, status, failure_reason)
  VALUES (
    p_student_id,
    p_teacher_id,
    v_decision,
    CASE v_decision
      WHEN 'suppressed_daily_cap' THEN 'cap_' || p_daily_cap || '_per_24h'
      WHEN 'suppressed_cooldown'  THEN 'cooldown_' || p_cooldown_minutes || 'm'
      ELSE NULL
    END
  )
  RETURNING id INTO v_new_id;

  decision   := v_decision;
  request_id := v_new_id;
  RETURN NEXT;
END;
$$;

-- ── 3. Lock the function down ───────────────────────────────────────────────
-- Only the server-side role may decide a rate limit. The browser reaches this endpoint with the
-- anon key, and anon must never be able to mint or inspect reservations.
REVOKE ALL ON FUNCTION public.reserve_password_help(uuid, uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_password_help(uuid, uuid, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.reserve_password_help(uuid, uuid, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_password_help(uuid, uuid, integer, integer) TO service_role;
