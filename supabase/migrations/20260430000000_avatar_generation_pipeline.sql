-- AI Gear Generation Pipeline
-- Creates avatar_generation_jobs, avatar_generation_events, storage bucket,
-- immutability + copyright-transition triggers (SECURITY DEFINER), and RLS.
--
-- Ownership model: one job → exactly one asset, enforced at multiple layers:
--   1. target_asset_id UNIQUE on this table (no two jobs share a target)
--   2. resulting_asset_id UNIQUE (no two completions write the same asset_id)
--   3. CHECK (resulting_asset_id IS NULL OR resulting_asset_id = target_asset_id)
--   4. Pipeline-level pre-onboarding ownership gate (see pipeline.ts)
--   5. Copyright result immutability trigger (SECURITY DEFINER)

-- ── Storage bucket ────────────────────────────────────────────────────────────
-- avatar-generation-staging: private. Holds AI-generated GLB and thumbnail files
-- after generation and before copyright screening + promotion to production buckets.
-- Files in this bucket are never served to students directly.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatar-generation-staging',
  'avatar-generation-staging',
  FALSE,
  10485760,  -- 10 MB: AI-generated GLBs may be larger than hand-crafted artist files
  ARRAY['model/gltf-binary', 'image/png', 'image/jpeg', 'application/octet-stream']
)
ON CONFLICT (id) DO NOTHING;


-- ── avatar_generation_jobs ────────────────────────────────────────────────────
-- One row per AI generation attempt.
--
-- OWNERSHIP MODEL:
--   target_asset_id is derived at job creation as: slot + '_gen_' + first_8_hex_chars(job_id)
--   It is set once, never updated. UNIQUE constraint prevents two jobs from targeting
--   the same asset. This makes all conflict detection trivial and DB-enforced.
--
--   resulting_asset_id is written atomically with status='complete' in a single UPDATE.
--   It must equal target_asset_id (CHECK constraint). A job that has not yet completed
--   always has resulting_asset_id IS NULL.

CREATE TABLE IF NOT EXISTS avatar_generation_jobs (
  id                              UUID        NOT NULL DEFAULT gen_random_uuid(),

  -- ── Ownership (set at creation, immutable) ──────────────────────────────────
  -- Derived: slot + '_gen_' + first_8_chars(job_id UUID)
  -- Example: slot='hat', job_id='a1b2c3d4-...' → target_asset_id='hat_gen_a1b2c3d4'
  -- UNIQUE: no two jobs can ever target the same asset. Conflicts are caught at
  -- job creation, before any AI call, any copyright check, any onboarding write.
  target_asset_id                 TEXT        NOT NULL,

  -- ── Generation inputs ──────────────────────────────────────────────────────
  -- MVP: only 'hat' permitted. Add slots here when ready.
  slot                            TEXT        NOT NULL,
  generation_prompt               TEXT        NOT NULL,
  negative_prompt                 TEXT,        -- NULL if provider does not support it
  -- policy_prompt: system-level copyright+safety instruction injected by the platform.
  -- Stored verbatim. Required for legal audit: proves what safety guardrail was in effect.
  policy_prompt                   TEXT        NOT NULL,

  -- ── Model selection ────────────────────────────────────────────────────────
  model_provider                  TEXT        NOT NULL,  -- e.g. "meshy", "tripo3d"
  model_version                   TEXT        NOT NULL,  -- e.g. "meshy-4"

  -- ── Optional concept image (reference input) ───────────────────────────────
  -- Both NULL or both non-NULL. Enforced by CHECK below.
  concept_image_bucket            TEXT,
  concept_image_path              TEXT,

  -- ── Generated output file references ──────────────────────────────────────
  -- Written atomically after AI generation completes. NULL until then.
  -- On retry: if non-NULL, the pipeline MUST skip the AI call (idempotent).
  -- Paths are deterministic: {job_id}/generated.glb, {job_id}/thumbnail.png
  generated_glb_bucket            TEXT,
  generated_glb_path              TEXT,
  generated_thumbnail_bucket      TEXT,
  generated_thumbnail_path        TEXT,

  -- ── Lifecycle ──────────────────────────────────────────────────────────────
  status                          TEXT        NOT NULL DEFAULT 'pending',
  version                         INTEGER     NOT NULL DEFAULT 0,
  retry_count                     INTEGER     NOT NULL DEFAULT 0,
  initiated_by                    TEXT        NOT NULL,
  initiated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- claimed_at: set when a worker transitions pending → generating.
  -- CAS fuse: completion UPDATE guards on claimed_at to reject zombie workers.
  claimed_at                      TIMESTAMPTZ,
  completed_at                    TIMESTAMPTZ,

  -- ── Copyright review ──────────────────────────────────────────────────────
  -- copyright_review_result is the authoritative verdict.
  -- The trigger enforce_copyright_result_transition (SECURITY DEFINER below)
  -- prevents hard_fail from ever being reversed — not even the service role can undo it.
  copyright_review_result         TEXT,         -- NULL | 'clear' | 'manual_review' | 'hard_fail'
  copyright_confidence            DECIMAL(4,3), -- 0.000–1.000; NULL until reviewed
  copyright_flags                 JSONB,        -- raw structured signals from copyright checker
  copyright_reviewed_by           TEXT,         -- 'system' or reviewer username
  copyright_reviewed_at           TIMESTAMPTZ,
  copyright_review_notes          TEXT,

  -- manual_review_required: true iff copyright_review_result = 'manual_review'.
  -- Stored explicitly so operators can query it without knowing the enum value.
  -- Must always equal (copyright_review_result = 'manual_review'). CHECK below.
  manual_review_required          BOOLEAN     NOT NULL DEFAULT FALSE,

  -- ── Manual review resolution ───────────────────────────────────────────────
  -- Set atomically when an operator resolves a pending_manual_review job.
  -- approved: updates copyright_review_result → 'clear', resets to pending for retry
  -- rejected: updates copyright_review_result → 'hard_fail', marks failed_permanent
  manual_review_resolved_by       TEXT,
  manual_review_resolved_at       TIMESTAMPTZ,
  manual_review_resolution        TEXT,        -- NULL | 'approved' | 'rejected'
  manual_review_resolution_notes  TEXT,

  -- ── Failure state ──────────────────────────────────────────────────────────
  failure_stage                   TEXT,
  failure_reason                  TEXT,
  failure_details                 JSONB,

  -- ── Completion: link to resulting asset ───────────────────────────────────
  -- Written atomically with status='complete' in a single UPDATE (CAS-guarded).
  -- Must equal target_asset_id. Enforced by CHECK below.
  -- UNIQUE: two completed jobs cannot share the same resulting_asset_id.
  resulting_asset_id              TEXT
    REFERENCES avatar_assets (asset_id) ON DELETE RESTRICT,
  onboarding_validation_run_id    UUID
    REFERENCES avatar_asset_validation_runs (id) ON DELETE RESTRICT,


  -- ════════════════════════════════════════════════════════════════════════════
  -- CONSTRAINTS
  -- These are the DB enforcement layer. Application logic is a second layer on top.
  -- Never remove a constraint here based on "the application handles it."
  -- ════════════════════════════════════════════════════════════════════════════

  CONSTRAINT generation_jobs_pkey
    PRIMARY KEY (id),

  -- OWNERSHIP INVARIANT #1: one job → one target asset, globally.
  CONSTRAINT generation_jobs_target_asset_id_unique
    UNIQUE (target_asset_id),

  -- OWNERSHIP INVARIANT #2: one completed job → one resulting asset, globally.
  CONSTRAINT generation_jobs_resulting_asset_id_unique
    UNIQUE (resulting_asset_id),

  -- OWNERSHIP INVARIANT #3: resulting must equal target (no substitution).
  -- This is the key link: a job can only complete for its own pre-declared asset.
  CONSTRAINT generation_jobs_resulting_matches_target
    CHECK (
      resulting_asset_id IS NULL
      OR resulting_asset_id = target_asset_id
    ),

  CONSTRAINT generation_jobs_target_asset_id_not_empty
    CHECK (length(trim(target_asset_id)) > 0),

  -- MVP: hat only. Extend this CHECK when new slots are ready.
  CONSTRAINT generation_jobs_slot_valid
    CHECK (slot IN ('hat')),

  CONSTRAINT generation_jobs_status_valid
    CHECK (status IN (
      'pending',
      'generating',
      'pending_manual_review',
      'complete',
      'failed_retryable',
      'failed_permanent'
    )),

  CONSTRAINT generation_jobs_retry_count_non_negative
    CHECK (retry_count >= 0),

  CONSTRAINT generation_jobs_retry_count_max
    CHECK (retry_count <= 3),

  -- Copyright result must be a known value.
  CONSTRAINT generation_jobs_copyright_result_valid
    CHECK (
      copyright_review_result IS NULL
      OR copyright_review_result IN ('clear', 'manual_review', 'hard_fail')
    ),

  -- Confidence must be in valid range.
  CONSTRAINT generation_jobs_copyright_confidence_range
    CHECK (
      copyright_confidence IS NULL
      OR (copyright_confidence >= 0.000 AND copyright_confidence <= 1.000)
    ),

  -- All copyright review fields set together or none at all.
  -- A partial write (confidence set but reviewed_by not) indicates a bug.
  CONSTRAINT generation_jobs_copyright_review_atomicity
    CHECK (
      (
        copyright_review_result  IS NULL
        AND copyright_confidence  IS NULL
        AND copyright_reviewed_by IS NULL
        AND copyright_reviewed_at IS NULL
      )
      OR
      (
        copyright_review_result  IS NOT NULL
        AND copyright_reviewed_by IS NOT NULL
        AND copyright_reviewed_at IS NOT NULL
      )
    ),

  -- manual_review_required must always equal (copyright_review_result = 'manual_review').
  CONSTRAINT generation_jobs_manual_review_flag_consistency
    CHECK (
      manual_review_required = (copyright_review_result = 'manual_review')
    ),

  -- hard_fail copyright verdict forces the job into failed_permanent.
  -- Application must update both fields in the same UPDATE statement.
  CONSTRAINT generation_jobs_hard_fail_requires_failed_permanent
    CHECK (
      copyright_review_result IS DISTINCT FROM 'hard_fail'
      OR status = 'failed_permanent'
    ),

  -- pending_manual_review status requires manual_review_required = TRUE.
  CONSTRAINT generation_jobs_pending_manual_review_requires_flag
    CHECK (
      status IS DISTINCT FROM 'pending_manual_review'
      OR manual_review_required = TRUE
    ),

  -- complete status requires resulting_asset_id to be set.
  CONSTRAINT generation_jobs_complete_requires_resulting_asset
    CHECK (
      status IS DISTINCT FROM 'complete'
      OR resulting_asset_id IS NOT NULL
    ),

  -- claimed_at: NULL iff pending, non-NULL otherwise.
  CONSTRAINT generation_jobs_claimed_at_consistency
    CHECK (
      (status = 'pending' AND claimed_at IS NULL)
      OR (status != 'pending' AND claimed_at IS NOT NULL)
    ),

  -- completed_at: set for terminal states only.
  CONSTRAINT generation_jobs_completed_at_consistency
    CHECK (
      (status NOT IN ('complete', 'failed_permanent') AND completed_at IS NULL)
      OR (status IN ('complete', 'failed_permanent') AND completed_at IS NOT NULL)
    ),

  -- Concept image: both bucket+path set, or neither.
  CONSTRAINT generation_jobs_concept_image_consistency
    CHECK (
      (concept_image_bucket IS NULL) = (concept_image_path IS NULL)
    ),

  -- Generated GLB: both set or neither.
  CONSTRAINT generation_jobs_generated_glb_consistency
    CHECK (
      (generated_glb_bucket IS NULL) = (generated_glb_path IS NULL)
    ),

  -- Generated thumbnail: both set or neither.
  CONSTRAINT generation_jobs_generated_thumbnail_consistency
    CHECK (
      (generated_thumbnail_bucket IS NULL) = (generated_thumbnail_path IS NULL)
    ),

  -- Manual review resolution: all three core fields set together or none.
  CONSTRAINT generation_jobs_manual_review_resolution_atomicity
    CHECK (
      (
        manual_review_resolved_by   IS NULL
        AND manual_review_resolved_at IS NULL
        AND manual_review_resolution  IS NULL
      )
      OR
      (
        manual_review_resolved_by   IS NOT NULL
        AND manual_review_resolved_at IS NOT NULL
        AND manual_review_resolution  IS NOT NULL
        AND manual_review_resolution IN ('approved', 'rejected')
        AND length(trim(manual_review_resolved_by)) > 0
      )
    ),

  -- A resolution can only exist if manual review was required.
  CONSTRAINT generation_jobs_resolution_requires_review_flag
    CHECK (
      manual_review_resolution IS NULL
      OR manual_review_required = TRUE
    ),

  -- NOT EMPTY guards on required text fields.
  CONSTRAINT generation_jobs_initiated_by_not_empty
    CHECK (length(trim(initiated_by)) > 0),
  CONSTRAINT generation_jobs_generation_prompt_not_empty
    CHECK (length(trim(generation_prompt)) > 0),
  CONSTRAINT generation_jobs_policy_prompt_not_empty
    CHECK (length(trim(policy_prompt)) > 0),
  CONSTRAINT generation_jobs_model_provider_not_empty
    CHECK (length(trim(model_provider)) > 0),
  CONSTRAINT generation_jobs_model_version_not_empty
    CHECK (length(trim(model_version)) > 0)
);


-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_generation_jobs_status
  ON avatar_generation_jobs (status);

CREATE INDEX IF NOT EXISTS idx_generation_jobs_slot_status
  ON avatar_generation_jobs (slot, status);

CREATE INDEX IF NOT EXISTS idx_generation_jobs_initiated_at
  ON avatar_generation_jobs (initiated_at DESC);

CREATE INDEX IF NOT EXISTS idx_generation_jobs_initiated_by
  ON avatar_generation_jobs (initiated_by);

-- Fast lookup of retryable jobs.
CREATE INDEX IF NOT EXISTS idx_generation_jobs_retryable
  ON avatar_generation_jobs (id, retry_count)
  WHERE status = 'failed_retryable';

-- Fast operator dashboard for pending copyright reviews.
CREATE INDEX IF NOT EXISTS idx_generation_jobs_manual_review
  ON avatar_generation_jobs (id, initiated_at)
  WHERE status = 'pending_manual_review';

-- Stale-job detection: generating jobs with old claimed_at.
CREATE INDEX IF NOT EXISTS idx_generation_jobs_stale
  ON avatar_generation_jobs (claimed_at)
  WHERE status = 'generating';


-- ── avatar_generation_events ──────────────────────────────────────────────────
-- Immutable append-only audit log. Same pattern as avatar_ingestion_events.
-- Rows are write-once. The trigger below (SECURITY DEFINER) prevents UPDATE/DELETE
-- even by the service role. This table is the permanent record of what happened.

CREATE TABLE IF NOT EXISTS avatar_generation_events (
  id        UUID        NOT NULL DEFAULT gen_random_uuid(),
  job_id    UUID        NOT NULL,
  event_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stage     TEXT        NOT NULL,
  outcome   TEXT        NOT NULL,
  message   TEXT        NOT NULL,
  details   JSONB,

  CONSTRAINT generation_events_pkey
    PRIMARY KEY (id),

  CONSTRAINT generation_events_job_fk
    FOREIGN KEY (job_id)
    REFERENCES avatar_generation_jobs (id)
    ON DELETE RESTRICT,

  CONSTRAINT generation_events_outcome_valid
    CHECK (outcome IN ('started', 'passed', 'failed', 'skipped', 'warning')),

  CONSTRAINT generation_events_stage_not_empty
    CHECK (length(trim(stage)) > 0),

  CONSTRAINT generation_events_message_not_empty
    CHECK (length(trim(message)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_generation_events_job_id
  ON avatar_generation_events (job_id);

CREATE INDEX IF NOT EXISTS idx_generation_events_event_at
  ON avatar_generation_events (event_at DESC);


-- ── Trigger 1: Event immutability (SECURITY DEFINER) ─────────────────────────
-- Prevents UPDATE/DELETE on avatar_generation_events regardless of role.
-- SECURITY DEFINER: fires under the function owner's privileges, not the caller's.
-- This means even a service_role UPDATE is blocked — same as the C-2 fix in ingestion.

CREATE OR REPLACE FUNCTION prevent_generation_event_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER AS $$
BEGIN
  RAISE EXCEPTION
    'IMMUTABILITY_VIOLATION: avatar_generation_events rows cannot be modified or deleted (event id: %)',
    OLD.id
  USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER trg_no_update_generation_events
  BEFORE UPDATE ON avatar_generation_events
  FOR EACH ROW
  EXECUTE FUNCTION prevent_generation_event_modification();

CREATE TRIGGER trg_no_delete_generation_events
  BEFORE DELETE ON avatar_generation_events
  FOR EACH ROW
  EXECUTE FUNCTION prevent_generation_event_modification();


-- ── Trigger 2: Copyright result transition guard (SECURITY DEFINER) ───────────
-- Prevents the copyright_review_result from being reversed once it reaches 'hard_fail'.
-- Also prevents downgrade from 'clear' to 'manual_review'.
--
-- SECURITY DEFINER: service_role cannot bypass this. This is a legal audit record.
--
-- Allowed transitions:
--   NULL             → 'clear' | 'manual_review' | 'hard_fail'  (first automated verdict)
--   'manual_review'  → 'clear'     (human reviewer approves)
--   'manual_review'  → 'hard_fail' (human reviewer rejects)
--   'hard_fail'      → 'hard_fail' (no-op, already terminal)
--
-- Blocked:
--   'hard_fail'      → anything else          (terminal — legally immutable)
--   'clear'          → 'manual_review'        (cannot raise concern after clearing)
--
-- 'clear' → 'hard_fail' is NOT blocked: this is an operator override for the rare
-- case where a copyright holder contacts the platform after content was cleared.
-- Must be done via direct DB update, documented in the runbook with a mandatory
-- events-table entry for audit.

CREATE OR REPLACE FUNCTION enforce_copyright_result_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER AS $$
BEGIN
  IF OLD.copyright_review_result = 'hard_fail'
     AND NEW.copyright_review_result IS DISTINCT FROM 'hard_fail'
  THEN
    RAISE EXCEPTION
      'COPYRIGHT_RESULT_IMMUTABLE: job "%" has copyright_review_result = ''hard_fail'' — this verdict is terminal and cannot be changed',
      OLD.id
    USING ERRCODE = 'restrict_violation';
  END IF;

  IF OLD.copyright_review_result = 'clear'
     AND NEW.copyright_review_result = 'manual_review'
  THEN
    RAISE EXCEPTION
      'COPYRIGHT_RESULT_INVALID_TRANSITION: job "%" cannot move from ''clear'' to ''manual_review'' — clear is a committed verdict',
      OLD.id
    USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_generation_jobs_copyright_transition
  BEFORE UPDATE ON avatar_generation_jobs
  FOR EACH ROW
  WHEN (OLD.copyright_review_result IS DISTINCT FROM NEW.copyright_review_result)
  EXECUTE FUNCTION enforce_copyright_result_transition();


-- ── Row Level Security ────────────────────────────────────────────────────────
-- All pipeline operations run through Edge Functions using the service role.
-- RLS is enabled so any future direct client access is denied by default.

ALTER TABLE avatar_generation_jobs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE avatar_generation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access"
  ON avatar_generation_jobs
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "service_role_full_access"
  ON avatar_generation_events
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
