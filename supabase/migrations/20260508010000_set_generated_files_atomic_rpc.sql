-- Atomic write of generated file references after stage-3 AI generation.
--
-- Called by database.ts setGeneratedFiles() once the GLB and thumbnail have
-- been uploaded to the staging bucket and the job is still 'generating'.
--
-- CAS guard: id + status='generating' + claimed_at + version
--   Prevents a zombie worker from a prior claim cycle from overwriting a
--   fresher write. The version increment advances the CAS chain so every
--   subsequent CAS operation (copyright, complete) uses the correct version.
--
-- Returns INTEGER: 1 = success, 0 = CAS miss (job was modified concurrently
-- or is no longer in 'generating' state). Caller interprets 0 as a silent
-- no-op — the pipeline detects this as a non-fatal race loss.
--
-- IMPORTANT: This function writes to the generated_files JSONB column, NOT
-- to the legacy TEXT columns (generated_glb_path, generated_thumbnail_path).
-- The stage-3 retry detection in pipeline.ts reads from generated_files.

CREATE OR REPLACE FUNCTION public.set_generated_files_atomic(
  p_job_id           UUID,
  p_claimed_at       TIMESTAMPTZ,
  p_previous_version INTEGER,
  p_files            JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_affected INTEGER;
BEGIN
  UPDATE avatar_generation_jobs
     SET version         = p_previous_version + 1,
         generated_files = p_files
   WHERE id         = p_job_id
     AND status     = 'generating'
     AND claimed_at = p_claimed_at
     AND version    = p_previous_version;

  GET DIAGNOSTICS v_affected = ROW_COUNT;
  RETURN v_affected;
END;
$$;
