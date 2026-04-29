-- Avatar Asset Onboarding Pipeline
-- Tables, constraints, indexes, immutability triggers, production gating trigger,
-- status transition guard, and RLS policies.

-- ── avatar_assets ─────────────────────────────────────────────────────────────
-- Canonical record for every avatar asset that has been submitted to the pipeline.
-- current_status and production_enabled are the authoritative lifecycle fields —
-- they are only changed by explicit workflow actions, never by raw metadata.

CREATE TABLE IF NOT EXISTS avatar_assets (
  asset_id            TEXT        NOT NULL,
  slot                TEXT        NOT NULL,
  display_name        TEXT        NOT NULL,
  current_status      TEXT        NOT NULL DEFAULT 'draft',
  production_enabled  BOOLEAN     NOT NULL DEFAULT FALSE,
  storage_path        TEXT,
  metadata            JSONB       NOT NULL,
  created_by          TEXT        NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_modified_by    TEXT        NOT NULL,
  last_modified_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT avatar_assets_pkey
    PRIMARY KEY (asset_id),

  CONSTRAINT avatar_assets_slot_valid
    CHECK (slot IN ('hat', 'shirt', 'shoe', 'inventory')),

  CONSTRAINT avatar_assets_status_valid
    CHECK (current_status IN ('draft', 'review', 'approved', 'production', 'deprecated')),

  -- production_enabled = true is only valid when status is approved or production.
  -- The production gating trigger enforces the full set of conditions; this CHECK
  -- is a last-line-of-defence guard that the DB enforces unconditionally.
  CONSTRAINT avatar_assets_production_requires_approved_status
    CHECK (
      production_enabled = FALSE OR
      current_status IN ('approved', 'production')
    ),

  CONSTRAINT avatar_assets_asset_id_not_empty
    CHECK (length(trim(asset_id)) > 0),

  CONSTRAINT avatar_assets_created_by_not_empty
    CHECK (length(trim(created_by)) > 0),

  CONSTRAINT avatar_assets_last_modified_by_not_empty
    CHECK (length(trim(last_modified_by)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_avatar_assets_slot
  ON avatar_assets (slot);

CREATE INDEX IF NOT EXISTS idx_avatar_assets_status
  ON avatar_assets (current_status);

CREATE INDEX IF NOT EXISTS idx_avatar_assets_created_at
  ON avatar_assets (created_at DESC);

-- Partial index: fast lookup of all assets currently in production.
CREATE INDEX IF NOT EXISTS idx_avatar_assets_production_enabled
  ON avatar_assets (asset_id)
  WHERE production_enabled = TRUE;


-- ── avatar_asset_validation_runs ─────────────────────────────────────────────
-- Immutable append-only history of every call made to the avatar-asset-validator.
-- Each row captures the exact payload sent and the exact response received.
-- Rows must never be modified or deleted — the trigger below enforces this.

CREATE TABLE IF NOT EXISTS avatar_asset_validation_runs (
  id                    UUID        NOT NULL DEFAULT gen_random_uuid(),
  asset_id              TEXT        NOT NULL,
  run_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  triggered_by          TEXT        NOT NULL,
  payload               JSONB       NOT NULL,
  response              JSONB       NOT NULL,
  valid                 BOOLEAN     NOT NULL,
  error_count           INTEGER     NOT NULL DEFAULT 0,
  warning_count         INTEGER     NOT NULL DEFAULT 0,
  manual_review_count   INTEGER     NOT NULL DEFAULT 0,

  CONSTRAINT validation_runs_pkey
    PRIMARY KEY (id),

  CONSTRAINT validation_runs_asset_fk
    FOREIGN KEY (asset_id)
    REFERENCES avatar_assets (asset_id)
    ON DELETE RESTRICT,

  CONSTRAINT validation_runs_error_count_non_negative
    CHECK (error_count >= 0),

  CONSTRAINT validation_runs_warning_count_non_negative
    CHECK (warning_count >= 0),

  CONSTRAINT validation_runs_manual_review_count_non_negative
    CHECK (manual_review_count >= 0),

  -- If valid = true there must be zero hard errors.
  -- If valid = false there must be at least one hard error.
  CONSTRAINT validation_runs_valid_error_count_consistent
    CHECK (
      (valid = TRUE  AND error_count = 0) OR
      (valid = FALSE AND error_count > 0)
    ),

  CONSTRAINT validation_runs_triggered_by_not_empty
    CHECK (length(trim(triggered_by)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_validation_runs_asset_id
  ON avatar_asset_validation_runs (asset_id);

-- Used by the production gate and the approve workflow to find a passing run.
CREATE INDEX IF NOT EXISTS idx_validation_runs_asset_valid
  ON avatar_asset_validation_runs (asset_id, valid);

CREATE INDEX IF NOT EXISTS idx_validation_runs_run_at
  ON avatar_asset_validation_runs (run_at DESC);

-- Immutability guard: no UPDATE or DELETE is permitted on validation_runs.
-- This fires even for the service role — auditability is unconditional.
CREATE OR REPLACE FUNCTION prevent_validation_run_modification()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'IMMUTABILITY_VIOLATION: avatar_asset_validation_runs rows cannot be modified or deleted (run id: %)',
    OLD.id
  USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER trg_no_update_validation_runs
  BEFORE UPDATE ON avatar_asset_validation_runs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_validation_run_modification();

CREATE TRIGGER trg_no_delete_validation_runs
  BEFORE DELETE ON avatar_asset_validation_runs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_validation_run_modification();


-- ── avatar_asset_review_queue ─────────────────────────────────────────────────
-- One row per MANUAL_REVIEW_REQUIRED flag produced by the validator.
-- Items begin as 'pending' and are resolved by a reviewer before
-- production promotion is allowed.

CREATE TABLE IF NOT EXISTS avatar_asset_review_queue (
  id                  UUID        NOT NULL DEFAULT gen_random_uuid(),
  asset_id            TEXT        NOT NULL,
  validation_run_id   UUID        NOT NULL,
  rule_id             TEXT        NOT NULL,
  severity            TEXT        NOT NULL DEFAULT 'MANUAL_REVIEW_REQUIRED',
  field               TEXT        NOT NULL,
  message             TEXT        NOT NULL,
  status              TEXT        NOT NULL DEFAULT 'pending',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_by         TEXT,
  resolved_at         TIMESTAMPTZ,
  resolution          TEXT,
  resolution_notes    TEXT,

  CONSTRAINT review_queue_pkey
    PRIMARY KEY (id),

  CONSTRAINT review_queue_asset_fk
    FOREIGN KEY (asset_id)
    REFERENCES avatar_assets (asset_id)
    ON DELETE RESTRICT,

  CONSTRAINT review_queue_validation_run_fk
    FOREIGN KEY (validation_run_id)
    REFERENCES avatar_asset_validation_runs (id)
    ON DELETE RESTRICT,

  CONSTRAINT review_queue_status_valid
    CHECK (status IN ('pending', 'resolved', 'dismissed')),

  CONSTRAINT review_queue_resolution_valid
    CHECK (resolution IN ('acknowledged', 'dismissed') OR resolution IS NULL),

  -- Pending items must have no resolution fields set.
  -- Resolved/dismissed items must have all resolution fields set.
  CONSTRAINT review_queue_resolution_consistency
    CHECK (
      (
        status = 'pending'
        AND resolved_by    IS NULL
        AND resolved_at    IS NULL
        AND resolution     IS NULL
      )
      OR
      (
        status IN ('resolved', 'dismissed')
        AND resolved_by    IS NOT NULL
        AND resolved_at    IS NOT NULL
        AND resolution     IS NOT NULL
        AND length(trim(resolved_by)) > 0
      )
    ),

  CONSTRAINT review_queue_rule_id_not_empty
    CHECK (length(trim(rule_id)) > 0),

  CONSTRAINT review_queue_field_not_empty
    CHECK (length(trim(field)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_review_queue_asset_id
  ON avatar_asset_review_queue (asset_id);

-- Primary lookup for the production gate: all pending items for an asset.
CREATE INDEX IF NOT EXISTS idx_review_queue_pending
  ON avatar_asset_review_queue (asset_id, status)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_review_queue_validation_run_id
  ON avatar_asset_review_queue (validation_run_id);

CREATE INDEX IF NOT EXISTS idx_review_queue_created_at
  ON avatar_asset_review_queue (created_at DESC);


-- ── Production gate trigger ───────────────────────────────────────────────────
-- Fires BEFORE INSERT OR UPDATE on avatar_assets.
-- Blocks production_enabled from being set to TRUE unless:
--   1. At least one passing validation run exists for the asset.
--   2. No pending manual review items exist for the asset.
--   3. current_status is 'approved' or 'production'.
-- All three conditions must hold simultaneously.

CREATE OR REPLACE FUNCTION enforce_production_gate()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_passing_run_count  INTEGER;
  v_open_review_count  INTEGER;
BEGIN
  -- Only run when production_enabled is transitioning to TRUE.
  IF NEW.production_enabled = TRUE
     AND (OLD IS NULL OR OLD.production_enabled IS DISTINCT FROM TRUE)
  THEN

    SELECT COUNT(*)
    INTO   v_passing_run_count
    FROM   avatar_asset_validation_runs
    WHERE  asset_id = NEW.asset_id
      AND  valid    = TRUE;

    IF v_passing_run_count = 0 THEN
      RAISE EXCEPTION
        'PRODUCTION_GATE: asset "%" has no passing validation run — validate first',
        NEW.asset_id
      USING ERRCODE = 'check_violation';
    END IF;

    SELECT COUNT(*)
    INTO   v_open_review_count
    FROM   avatar_asset_review_queue
    WHERE  asset_id = NEW.asset_id
      AND  status   = 'pending';

    IF v_open_review_count > 0 THEN
      RAISE EXCEPTION
        'PRODUCTION_GATE: asset "%" has % open manual review item(s) — resolve all before promoting to production',
        NEW.asset_id, v_open_review_count
      USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.current_status NOT IN ('approved', 'production') THEN
      RAISE EXCEPTION
        'PRODUCTION_GATE: asset "%" has status "%" — status must be "approved" or "production" before production_enabled can be set',
        NEW.asset_id, NEW.current_status
      USING ERRCODE = 'check_violation';
    END IF;

  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_avatar_assets_production_gate
  BEFORE INSERT OR UPDATE ON avatar_assets
  FOR EACH ROW
  EXECUTE FUNCTION enforce_production_gate();


-- ── Status transition guard ───────────────────────────────────────────────────
-- Fires BEFORE UPDATE when current_status changes.
-- 'deprecated' is a terminal state — no transition out is permitted.
-- 'production' assets cannot be demoted to 'draft' or 'review'.

CREATE OR REPLACE FUNCTION enforce_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.current_status = 'deprecated'
     AND NEW.current_status <> 'deprecated'
  THEN
    RAISE EXCEPTION
      'STATUS_TRANSITION: asset "%" is deprecated — deprecated is a terminal state and cannot be changed',
      OLD.asset_id
    USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.current_status = 'production'
     AND NEW.current_status IN ('draft', 'review')
  THEN
    RAISE EXCEPTION
      'STATUS_TRANSITION: asset "%" is in production — cannot demote to "%" (deprecate instead)',
      OLD.asset_id, NEW.current_status
    USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_avatar_assets_status_transition
  BEFORE UPDATE ON avatar_assets
  FOR EACH ROW
  WHEN (OLD.current_status IS DISTINCT FROM NEW.current_status)
  EXECUTE FUNCTION enforce_status_transition();


-- ── Row Level Security ────────────────────────────────────────────────────────
-- All pipeline operations run through the Edge Function using the service role,
-- which bypasses RLS. RLS is enabled here so that any future direct client access
-- is denied by default until explicit policies are added.

ALTER TABLE avatar_assets                ENABLE ROW LEVEL SECURITY;
ALTER TABLE avatar_asset_validation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE avatar_asset_review_queue    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access"
  ON avatar_assets
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

CREATE POLICY "service_role_full_access"
  ON avatar_asset_validation_runs
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

CREATE POLICY "service_role_full_access"
  ON avatar_asset_review_queue
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);
