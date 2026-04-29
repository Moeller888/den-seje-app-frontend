-- Fix C-1: broken UNIQUE NULLS NOT DISTINCT on avatar_ingestion_artifacts
--
-- Root cause: the original constraint used NULLS NOT DISTINCT, which treats
-- NULL = NULL. Every staging artifact row has content_hash = NULL, so the
-- second staging insert for any new job collides with the first job's row.
-- This breaks all ingestion after the very first job in the system.
--
-- Fix: drop the constraint and replace with a partial unique index that only
-- enforces uniqueness when content_hash IS NOT NULL (i.e. production artifacts
-- that have been hashed). Staging artifacts (content_hash = NULL) are excluded
-- from the uniqueness check entirely, which is the correct behaviour.

ALTER TABLE avatar_ingestion_artifacts
  DROP CONSTRAINT IF EXISTS ingestion_artifacts_no_duplicate_production_hash;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ingestion_artifacts_production_hash_unique
  ON avatar_ingestion_artifacts (artifact_type, content_hash)
  WHERE content_hash IS NOT NULL;
