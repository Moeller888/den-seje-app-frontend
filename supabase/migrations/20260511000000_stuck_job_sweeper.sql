-- Stuck-job sweeper: automatically recovers stale generating jobs.
--
-- Deployed as two migrations:
--   20260511 step 1 (enable_pg_cron):   CREATE EXTENSION IF NOT EXISTS pg_cron
--   20260511 step 2 (stuck_job_sweeper): this file — sweeper function + schedule
--
-- Problem solved:
--   A generating job becomes stuck when the Edge Function that claimed it is killed
--   (timeout, deployment, crash) before it can call failGenerationJob. Without this
--   sweeper, the job stays in 'generating' indefinitely — the admin would need to
--   manually call /retry with the specific job ID.
--
-- How it works:
--   A pg_cron job runs every 5 minutes. It finds all 'generating' jobs whose
--   claimed_at is older than 15 minutes, then calls the existing
--   recover_stuck_job_atomic RPC for each. The RPC transitions the job to
--   'failed_retryable' and increments its version (CAS-safe). If the job was
--   already recovered by something else (CAS miss), the RPC returns 0 and the
--   sweeper skips it silently.
--
--   On each successful recovery, an immutable event is written to
--   avatar_generation_events so the admin can see what happened.
--
-- Safety:
--   - Only targets status='generating' jobs. Never touches complete,
--     pending_manual_review, failed_*, or pending.
--   - The RPC's CAS guard (version + claimed_at + stale threshold) prevents
--     double-recovery even if two sweeper runs overlap.
--   - Does not bypass any CHECK constraints — the RPC handles all state
--     transitions through the same guards as the application layer.
--
-- Observability:
--   - Each recovered job gets an immutable event in avatar_generation_events.
--   - RAISE LOG fires whenever at least one job is recovered (visible in DB logs).
--   - cron.job_run_details tracks every scheduled run (queryable, see below).
--
-- Verification queries:
--   -- Confirm schedule is registered:
--   SELECT jobid, jobname, schedule, command, active FROM cron.job;
--
--   -- See recent cron run history:
--   SELECT runid, status, return_message, start_time, end_time
--   FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
--
--   -- Call the sweeper manually (returns count of jobs recovered):
--   SELECT public.sweep_stale_generation_jobs();
--
--   -- See all sweeper-generated recovery events:
--   SELECT job_id, event_at, message, details
--   FROM avatar_generation_events
--   WHERE stage = 'timeout-recovery'
--   ORDER BY event_at DESC;
--
-- Rollback:
--   SELECT cron.unschedule('sweep-stale-generation-jobs');
--   DROP FUNCTION public.sweep_stale_generation_jobs();

-- ── Sweeper function ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sweep_stale_generation_jobs()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stale_threshold  TIMESTAMPTZ;
  v_recovered_at     TIMESTAMPTZ;
  v_job              RECORD;
  v_rpc_result       INTEGER;
  v_total_recovered  INTEGER := 0;
BEGIN
  v_stale_threshold := NOW() - INTERVAL '15 minutes';
  v_recovered_at    := NOW();

  -- Snapshot the stale jobs. The CAS guard in recover_stuck_job_atomic protects
  -- against races — if a job is claimed or completed between this SELECT and the
  -- RPC call, the RPC returns 0 (CAS miss) and we skip it safely.
  FOR v_job IN
    SELECT id, version, claimed_at
      FROM public.avatar_generation_jobs
     WHERE status     = 'generating'
       AND claimed_at < v_stale_threshold
  LOOP
    -- Delegate entirely to the existing atomic recovery RPC.
    -- Never modify job state directly here.
    SELECT INTO v_rpc_result
      public.recover_stuck_job_atomic(
        v_job.id,           -- p_job_id
        v_job.version,      -- p_previous_version
        v_stale_threshold,  -- p_stale_threshold
        v_job.claimed_at,   -- p_original_claimed_at
        v_recovered_at      -- p_recovered_at
      );

    -- rpc_result = 1: CAS succeeded, job recovered.
    -- rpc_result = 0: CAS miss, job already handled elsewhere — skip silently.
    IF v_rpc_result = 1 THEN
      v_total_recovered := v_total_recovered + 1;

      -- Immutable audit event. The trg_no_update/delete_generation_events
      -- triggers block UPDATE/DELETE but not INSERT — this write is safe.
      INSERT INTO public.avatar_generation_events (
        job_id,
        stage,
        outcome,
        message,
        details
      ) VALUES (
        v_job.id,
        'timeout-recovery',
        'failed',
        'Job automatically recovered by sweeper: claimed_at exceeded 15-minute stale threshold',
        jsonb_build_object(
          'recovered_by',        'sweep_stale_generation_jobs',
          'original_claimed_at', v_job.claimed_at,
          'stale_threshold',     v_stale_threshold,
          'recovered_at',        v_recovered_at,
          'previous_version',    v_job.version
        )
      );
    END IF;
  END LOOP;

  IF v_total_recovered > 0 THEN
    RAISE LOG 'sweep_stale_generation_jobs: recovered % stale job(s) at %',
      v_total_recovered, v_recovered_at;
  END IF;

  RETURN v_total_recovered;
END;
$$;


-- ── pg_cron schedule (idempotent) ─────────────────────────────────────────────
-- Unschedule first so this migration is safely re-runnable.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'sweep-stale-generation-jobs'
  ) THEN
    PERFORM cron.unschedule('sweep-stale-generation-jobs');
  END IF;
END;
$$;

SELECT cron.schedule(
  'sweep-stale-generation-jobs',
  '*/5 * * * *',
  'SELECT public.sweep_stale_generation_jobs()'
);
