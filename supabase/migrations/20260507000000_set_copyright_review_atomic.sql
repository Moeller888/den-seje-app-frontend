-- Atomic copyright review write for avatar_generation_jobs.
--
-- Replaces the manually-created 4-parameter stub with the correct 9-parameter
-- signature that database.ts has always expected. All three copyright outcomes
-- are handled in a single guarded UPDATE per outcome branch.
--
-- CAS guard: id + status='generating' + claimed_at + version
--   Prevents a zombie worker or concurrent write from overwriting a verdict
--   that a later worker already committed. Returns 0 on any guard miss.
--
-- Outcome branches:
--   'clear'         → copyright fields written, manual_review_required=FALSE,
--                     status unchanged ('generating')
--   'manual_review' → copyright fields written, manual_review_required=TRUE,
--                     status='pending_manual_review'
--   'hard_fail'     → copyright fields written, manual_review_required=FALSE,
--                     status='failed_permanent', completed_at=NOW(),
--                     failure fields set (satisfies completed_at CHECK constraint)
--
-- Returns INTEGER: 1 = success, 0 = CAS miss (job was modified concurrently
-- or is no longer in 'generating' state). Caller (database.ts setCopyrightReview)
-- interprets 0 as a null return — pipeline treats it as a non-fatal race loss.

CREATE OR REPLACE FUNCTION public.set_copyright_review_atomic(
  p_job_id           UUID,
  p_claimed_at       TIMESTAMPTZ,
  p_previous_version INTEGER,
  p_result           TEXT,
  p_confidence       NUMERIC(4,3),
  p_flags            JSONB,
  p_reviewed_by      TEXT,
  p_reviewed_at      TIMESTAMPTZ,
  p_notes            TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_affected INTEGER;
BEGIN
  IF p_result = 'clear' THEN

    UPDATE avatar_generation_jobs
       SET version                 = p_previous_version + 1,
           copyright_review_result = p_result,
           copyright_confidence    = p_confidence,
           copyright_flags         = p_flags,
           copyright_reviewed_by   = p_reviewed_by,
           copyright_reviewed_at   = p_reviewed_at,
           copyright_review_notes  = p_notes,
           manual_review_required  = FALSE
     WHERE id         = p_job_id
       AND status     = 'generating'
       AND claimed_at = p_claimed_at
       AND version    = p_previous_version;

  ELSIF p_result = 'manual_review' THEN

    UPDATE avatar_generation_jobs
       SET version                 = p_previous_version + 1,
           copyright_review_result = p_result,
           copyright_confidence    = p_confidence,
           copyright_flags         = p_flags,
           copyright_reviewed_by   = p_reviewed_by,
           copyright_reviewed_at   = p_reviewed_at,
           copyright_review_notes  = p_notes,
           manual_review_required  = TRUE,
           status                  = 'pending_manual_review'
     WHERE id         = p_job_id
       AND status     = 'generating'
       AND claimed_at = p_claimed_at
       AND version    = p_previous_version;

  ELSIF p_result = 'hard_fail' THEN

    UPDATE avatar_generation_jobs
       SET version                 = p_previous_version + 1,
           copyright_review_result = p_result,
           copyright_confidence    = p_confidence,
           copyright_flags         = p_flags,
           copyright_reviewed_by   = p_reviewed_by,
           copyright_reviewed_at   = p_reviewed_at,
           copyright_review_notes  = p_notes,
           manual_review_required  = FALSE,
           status                  = 'failed_permanent',
           completed_at            = NOW(),
           failure_stage           = 'copyright-review',
           failure_reason          = 'POLICY_VIOLATION',
           failure_details         = jsonb_build_object('copyright_flags', p_flags)
     WHERE id         = p_job_id
       AND status     = 'generating'
       AND claimed_at = p_claimed_at
       AND version    = p_previous_version;

  ELSE
    RAISE EXCEPTION
      'set_copyright_review_atomic: unknown p_result value "%"', p_result
    USING ERRCODE = 'invalid_parameter_value';
  END IF;

  GET DIAGNOSTICS v_affected = ROW_COUNT;
  RETURN v_affected;
END;
$$;
