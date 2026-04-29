-- Avatar Ingestion Pipeline
-- Tables, triggers, indexes, and RLS for the complete asset ingestion workflow.
-- These tables sit upstream of avatar_assets and avatar_asset_validation_runs.
-- An ingestion job must complete before any record appears in avatar_assets.

-- ── Storage buckets ───────────────────────────────────────────────────────────
-- avatar-staging: private, artist uploads. Files expire after job completion.
-- avatar-assets:  private, immutable production GLB files. Accessed via signed URLs.
-- avatar-thumbnails: public, preview images served directly.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'avatar-staging',
    'avatar-staging',
    FALSE,
    5242880,  -- 5 MB: generous staging limit to accommodate source files
    ARRAY['model/gltf-binary', 'image/png', 'application/octet-stream']
  ),
  (
    'avatar-assets',
    'avatar-assets',
    FALSE,
    2097152,  -- 2 MB: tighter production limit
    ARRAY['model/gltf-binary', 'application/octet-stream']
  ),
  (
    'avatar-thumbnails',
    'avatar-thumbnails',
    TRUE,
    524288,   -- 512 KB: thumbnail files are small
    ARRAY['image/png']
  )
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: all writes routed through Edge Functions using the service role.
-- Direct public access is denied by default on non-public buckets.
CREATE POLICY "service_role_full_access"
  ON storage.objects
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- ── avatar_ingestion_jobs ─────────────────────────────────────────────────────
-- One row per ingestion attempt. Tracks status, measured file properties
-- (written after GLB analysis — these are the authority values), and failure info.
-- DB columns here are the source of truth; metadata JSON is the asset payload snapshot.

CREATE TABLE IF NOT EXISTS avatar_ingestion_jobs (
  id                            UUID        NOT NULL DEFAULT gen_random_uuid(),
  asset_id                      TEXT        NOT NULL,
  slot                          TEXT        NOT NULL,
  status                        TEXT        NOT NULL DEFAULT 'pending',
  retry_count                   INTEGER     NOT NULL DEFAULT 0,

  initiated_by                  TEXT        NOT NULL,
  initiated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at                    TIMESTAMPTZ,
  completed_at                  TIMESTAMPTZ,

  -- Staging storage paths (written at init time, stable for the life of the job)
  staging_glb_path              TEXT        NOT NULL,
  staging_thumbnail_path        TEXT        NOT NULL,

  -- Measured values from GLB analysis: these override metadata claims.
  -- NULL until Stage 5 (GLB deep analysis) completes.
  measured_file_size_kb         INTEGER,
  measured_poly_count           INTEGER,
  measured_texture_embedded     BOOLEAN,
  measured_texture_format       TEXT,
  measured_texture_resolution   TEXT,
  measured_attachment_bones     JSONB,      -- string[] of bone names found in GLB

  -- Failure state (set on any terminal failure)
  failure_stage                 TEXT,
  failure_reason                TEXT,
  failure_details               JSONB,

  -- Link to onboarding record (set after successful avatar-asset-onboarding call)
  onboarding_asset_id           TEXT
    REFERENCES avatar_assets (asset_id) ON DELETE RESTRICT,
  onboarding_validation_run_id  UUID
    REFERENCES avatar_asset_validation_runs (id) ON DELETE RESTRICT,

  CONSTRAINT ingestion_jobs_pkey
    PRIMARY KEY (id),

  CONSTRAINT ingestion_jobs_status_valid
    CHECK (status IN (
      'pending',
      'validating',
      'valid',
      'failed_retryable',
      'failed_permanent',
      'complete'
    )),

  CONSTRAINT ingestion_jobs_slot_valid
    CHECK (slot IN ('hat', 'shirt', 'shoe', 'inventory')),

  CONSTRAINT ingestion_jobs_retry_count_non_negative
    CHECK (retry_count >= 0),

  CONSTRAINT ingestion_jobs_retry_count_max
    CHECK (retry_count <= 3),

  -- completed_at must be set when status is complete
  CONSTRAINT ingestion_jobs_completed_at_consistency
    CHECK (
      (status NOT IN ('complete', 'failed_permanent') AND completed_at IS NULL) OR
      (status IN ('complete', 'failed_permanent') AND completed_at IS NOT NULL)
    ),

  -- claimed_at must be set when processing has started
  CONSTRAINT ingestion_jobs_claimed_at_consistency
    CHECK (
      (status = 'pending' AND claimed_at IS NULL) OR
      (status <> 'pending' AND claimed_at IS NOT NULL)
    ),

  CONSTRAINT ingestion_jobs_asset_id_not_empty
    CHECK (length(trim(asset_id)) > 0),

  CONSTRAINT ingestion_jobs_initiated_by_not_empty
    CHECK (length(trim(initiated_by)) > 0)
);

-- Primary lookup: find active jobs for an asset (prevents duplicate ingestion)
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_asset_status
  ON avatar_ingestion_jobs (asset_id, status);

CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_status
  ON avatar_ingestion_jobs (status);

CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_initiated_at
  ON avatar_ingestion_jobs (initiated_at DESC);

-- Partial index: fast lookup of all jobs that can be retried
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_retryable
  ON avatar_ingestion_jobs (id, retry_count)
  WHERE status = 'failed_retryable';

-- Prevent two jobs for the same asset_id from being simultaneously validating.
-- pending → multiple allowed (artist can cancel and restart)
-- validating → exactly one at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_ingestion_jobs_one_active_per_asset
  ON avatar_ingestion_jobs (asset_id)
  WHERE status = 'validating';


-- ── avatar_ingestion_events ───────────────────────────────────────────────────
-- Immutable append-only audit log of every pipeline stage event.
-- One row per stage per job. Provides full replay capability.
-- Like validation_runs, these rows must never be modified or deleted.

CREATE TABLE IF NOT EXISTS avatar_ingestion_events (
  id          UUID        NOT NULL DEFAULT gen_random_uuid(),
  job_id      UUID        NOT NULL,
  event_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stage       TEXT        NOT NULL,
  outcome     TEXT        NOT NULL,
  message     TEXT        NOT NULL,
  details     JSONB,

  CONSTRAINT ingestion_events_pkey
    PRIMARY KEY (id),

  CONSTRAINT ingestion_events_job_fk
    FOREIGN KEY (job_id)
    REFERENCES avatar_ingestion_jobs (id)
    ON DELETE RESTRICT,

  CONSTRAINT ingestion_events_outcome_valid
    CHECK (outcome IN ('started', 'passed', 'failed', 'skipped', 'warning')),

  CONSTRAINT ingestion_events_stage_not_empty
    CHECK (length(trim(stage)) > 0),

  CONSTRAINT ingestion_events_message_not_empty
    CHECK (length(trim(message)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_ingestion_events_job_id
  ON avatar_ingestion_events (job_id);

CREATE INDEX IF NOT EXISTS idx_ingestion_events_event_at
  ON avatar_ingestion_events (event_at DESC);

-- Immutability: events are write-once
CREATE OR REPLACE FUNCTION prevent_ingestion_event_modification()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'IMMUTABILITY_VIOLATION: avatar_ingestion_events rows cannot be modified or deleted (event id: %)',
    OLD.id
  USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER trg_no_update_ingestion_events
  BEFORE UPDATE ON avatar_ingestion_events
  FOR EACH ROW
  EXECUTE FUNCTION prevent_ingestion_event_modification();

CREATE TRIGGER trg_no_delete_ingestion_events
  BEFORE DELETE ON avatar_ingestion_events
  FOR EACH ROW
  EXECUTE FUNCTION prevent_ingestion_event_modification();


-- ── avatar_ingestion_artifacts ────────────────────────────────────────────────
-- Tracks every file associated with an ingestion job across its lifecycle:
-- staged files in avatar-staging, and promoted files in avatar-assets/thumbnails.
-- Prevents orphaned storage files — every file has a DB record.

CREATE TABLE IF NOT EXISTS avatar_ingestion_artifacts (
  id              UUID        NOT NULL DEFAULT gen_random_uuid(),
  job_id          UUID        NOT NULL,
  artifact_type   TEXT        NOT NULL,
  bucket          TEXT        NOT NULL,
  storage_path    TEXT        NOT NULL,
  file_size_bytes BIGINT,
  content_hash    TEXT,       -- SHA-256 of file content (populated when computed)
  status          TEXT        NOT NULL DEFAULT 'staged',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  promoted_at     TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ,

  CONSTRAINT ingestion_artifacts_pkey
    PRIMARY KEY (id),

  CONSTRAINT ingestion_artifacts_job_fk
    FOREIGN KEY (job_id)
    REFERENCES avatar_ingestion_jobs (id)
    ON DELETE RESTRICT,

  CONSTRAINT ingestion_artifacts_type_valid
    CHECK (artifact_type IN (
      'glb_staged',
      'thumbnail_staged',
      'glb_production',
      'thumbnail_production'
    )),

  CONSTRAINT ingestion_artifacts_status_valid
    CHECK (status IN ('staged', 'promoted', 'deleted')),

  CONSTRAINT ingestion_artifacts_bucket_not_empty
    CHECK (length(trim(bucket)) > 0),

  CONSTRAINT ingestion_artifacts_path_not_empty
    CHECK (length(trim(storage_path)) > 0),

  CONSTRAINT ingestion_artifacts_file_size_positive
    CHECK (file_size_bytes IS NULL OR file_size_bytes > 0),

  -- promoted_at requires promoted status
  CONSTRAINT ingestion_artifacts_promoted_consistency
    CHECK (
      (status = 'promoted' AND promoted_at IS NOT NULL) OR
      (status <> 'promoted' AND promoted_at IS NULL)
    ),

  -- Prevent the same production GLB from being stored twice.
  -- content_hash is used as the duplicate guard for production artifacts.
  CONSTRAINT ingestion_artifacts_no_duplicate_production_hash
    UNIQUE NULLS NOT DISTINCT (artifact_type, content_hash)
);

-- These index entries are filtered to avoid nullifying the duplicate guard
-- for non-production artifacts where content_hash may be null.
CREATE INDEX IF NOT EXISTS idx_ingestion_artifacts_job_id
  ON avatar_ingestion_artifacts (job_id);

CREATE INDEX IF NOT EXISTS idx_ingestion_artifacts_storage_path
  ON avatar_ingestion_artifacts (bucket, storage_path);

CREATE INDEX IF NOT EXISTS idx_ingestion_artifacts_staged
  ON avatar_ingestion_artifacts (job_id, artifact_type)
  WHERE status = 'staged';


-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE avatar_ingestion_jobs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE avatar_ingestion_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE avatar_ingestion_artifacts  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access"
  ON avatar_ingestion_jobs
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "service_role_full_access"
  ON avatar_ingestion_events
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "service_role_full_access"
  ON avatar_ingestion_artifacts
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
