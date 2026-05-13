-- Drop generation_jobs_resolution_requires_review_flag constraint.
--
-- This constraint (manual_review_resolution IS NULL OR manual_review_required = true)
-- is logically incompatible with the approval and rejection flows in resolveManualReview.
--
-- Both resolution paths set manual_review_required = false (required by
-- generation_jobs_manual_review_flag_consistency, which enforces
-- manual_review_required = (copyright_review_result = 'manual_review')).
-- Setting manual_review_resolution to a non-null value simultaneously violates this
-- constraint. The result is a CHECK constraint error on every /copyright-review call.
--
-- The constraint's intent ("a resolution can only exist if review was required") is
-- already guaranteed by:
--   1. resolveManualReview guards: WHERE status='pending_manual_review' AND manual_review_required=true
--   2. generation_jobs_pending_manual_review_requires_flag: status='pending_manual_review'
--      requires manual_review_required=true
--
-- No data integrity is lost by dropping this constraint.

ALTER TABLE avatar_generation_jobs
  DROP CONSTRAINT generation_jobs_resolution_requires_review_flag;
