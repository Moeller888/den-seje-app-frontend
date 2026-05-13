-- Schema Shadow Fields — Infrastructure Truth Recovery
--
-- Tracks two columns that exist in the live DB but were never added to a
-- tracked migration. Both were added directly to the production database
-- without going through the migration pipeline.
--
-- This migration must be idempotent (IF NOT EXISTS) so that:
--   1. Running it against the live DB is a no-op (columns already exist).
--   2. Running it in a fresh environment (supabase db reset) reproduces the
--      full live schema from scratch.
--
-- ── generated_files JSONB ─────────────────────────────────────────────────────
-- Written atomically by set_generated_files_atomic (see next migration).
-- Stores the staging file references for the AI-generated GLB and thumbnail
-- after stage-3 of the generation pipeline completes.
--
-- Shape: { glb_bucket, glb_path, thumbnail_bucket, thumbnail_path }
--
-- This column is the authoritative retry-skip signal for stage-3.
-- If non-NULL, the retry path downloads existing files instead of re-running AI.
--
-- The original TEXT columns (generated_glb_bucket, generated_glb_path,
-- generated_thumbnail_bucket, generated_thumbnail_path) remain in place as
-- legacy fields. They have never been written by any pipeline code and are
-- officially superseded by this column.
--
-- ── created_at TIMESTAMPTZ ────────────────────────────────────────────────────
-- Timestamp set to NOW() at row creation (same instant as initiated_at).
-- Used by the worker for FIFO ordering of failed_retryable and pending jobs:
--   ORDER BY created_at ASC
-- Without this column a fresh environment would silently fail to process jobs
-- (PostgREST would return an error on the ORDER BY clause and the worker's
-- findOneFailedRetryableJob / findOnePendingJob helpers would return null).

ALTER TABLE avatar_generation_jobs
  ADD COLUMN IF NOT EXISTS generated_files JSONB;

ALTER TABLE avatar_generation_jobs
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
