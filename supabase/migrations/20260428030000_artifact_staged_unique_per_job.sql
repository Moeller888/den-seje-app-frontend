-- H-4: One staged artifact row per (job_id, artifact_type).
--
-- Problem: when a job is retried, the pipeline re-runs Stages 3 and 7,
-- which re-insert glb_staged and thumbnail_staged artifact rows for the same
-- job_id. This accumulates duplicate staged artifact rows with no upper bound.
--
-- Fix: enforce uniqueness on (job_id, artifact_type) for staged types only.
-- Production artifact types (glb_production, thumbnail_production) are excluded —
-- they are already governed by the content_hash partial unique index from C-1.
--
-- Cross-job uniqueness is NOT enforced: different jobs may each have their own
-- glb_staged and thumbnail_staged rows. The constraint is per-job only.

CREATE UNIQUE INDEX IF NOT EXISTS idx_ingestion_artifacts_staged_unique
  ON avatar_ingestion_artifacts (job_id, artifact_type)
  WHERE artifact_type IN ('glb_staged', 'thumbnail_staged');
