-- Atomic recovery of a stale generating job.
--
-- A generating job is considered stale when claimed_at < now() - 10 minutes.
-- The worker (worker.ts) detects these jobs, then calls database.ts
-- recoverStuckJob() which invokes this function.
--
-- CAS guard: id + status='generating' + version + claimed_at < stale_threshold
--            + claimed_at = original_claimed_at
--
--   claimed_at < p_stale_threshold  — ensures the job is actually stale
--   claimed_at = p_original_claimed_at — ensures we are recovering the exact
--     claim instance we observed. Prevents a recovered-then-reclaimed job from
--     being double-recovered if a second worker races the first.
--
-- The version increment advances the CAS chain identically to other atomic
-- writers (set_generated_files_atomic, set_copyright_review_atomic,
-- completeGenerationJob). The retry run's subsequent CAS operations will
-- guard on version = 2 (or whatever value + 1 this sets).
--
-- Failure fields are written so the job is queryable in a meaningful state
-- during the window between this call and resetJobForRetry clearing them.
-- resetJobForRetry always clears failure_stage/reason/details before re-run.
--
-- completed_at is intentionally NOT set: 'failed_retryable' requires
-- completed_at IS NULL (generation_jobs_completed_at_consistency CHECK).
--
-- Returns INTEGER: 1 = success (job recovered), 0 = CAS miss (job no longer
-- stale or was already recovered by a concurrent worker).

CREATE OR REPLACE FUNCTION public.recover_stuck_job_atomic(
  p_job_id              UUID,
  p_previous_version    INTEGER,
  p_stale_threshold     TIMESTAMPTZ,
  p_original_claimed_at TIMESTAMPTZ,
  p_recovered_at        TIMESTAMPTZ
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_affected INTEGER;
BEGIN
  UPDATE avatar_generation_jobs
     SET version         = p_previous_version + 1,
         status          = 'failed_retryable',
         failure_stage   = 'timeout-recovery',
         failure_reason  = 'Job timed out — claimed_at exceeded stale threshold',
         failure_details = jsonb_build_object(
           'recovered_at',        p_recovered_at,
           'original_claimed_at', p_original_claimed_at
         )
   WHERE id         = p_job_id
     AND status     = 'generating'
     AND version    = p_previous_version
     AND claimed_at < p_stale_threshold
     AND claimed_at = p_original_claimed_at;

  GET DIAGNOSTICS v_affected = ROW_COUNT;
  RETURN v_affected;
END;
$$;
