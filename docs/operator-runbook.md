# Avatar Platform — Production Operator Runbook

**System classification:** A- (Production-safe)  
**Accepted defect:** M-2 — metadata snapshot may be stale after promotion failure (documented in full in Section 4 and Incident 8)  
**Scope:** avatar-ingestion · avatar-asset-onboarding · avatar-asset-validator · Supabase DB · storage buckets · review workflow · production promotion

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Authoritative Sources of Truth](#2-authoritative-sources-of-truth)
3. [Database Tables — What Each One Owns](#3-database-tables--what-each-one-owns)
4. [Accepted Technical Debt — M-2](#4-accepted-technical-debt--m-2)
5. [Storage Buckets](#5-storage-buckets)
6. [Pipeline Stages Reference](#6-pipeline-stages-reference)
7. [Job Status State Machine](#7-job-status-state-machine)
8. [Asset Status Lifecycle](#8-asset-status-lifecycle)
9. [Fields That Must Never Be Manually Edited](#9-fields-that-must-never-be-manually-edited)
10. [Safe SQL Patterns](#10-safe-sql-patterns)
11. [Dangerous SQL — Never Run These](#11-dangerous-sql--never-run-these)
12. [Incident Playbooks](#12-incident-playbooks)
    - [INC-01 Ingestion job stuck in validating](#inc-01-ingestion-job-stuck-in-validating)
    - [INC-02 failed_retryable with retry_count < 3](#inc-02-failed_retryable-with-retry_count--3)
    - [INC-03 failed_retryable with retry_count = 3](#inc-03-failed_retryable-with-retry_count--3)
    - [INC-04 failed_permanent](#inc-04-failed_permanent)
    - [INC-05 Onboarding validation failure](#inc-05-onboarding-validation-failure)
    - [INC-06 Review queue blocked](#inc-06-review-queue-blocked)
    - [INC-07 Production promotion failure](#inc-07-production-promotion-failure)
    - [INC-08 Metadata drift caused by M-2](#inc-08-metadata-drift-caused-by-m-2)
    - [INC-09 Storage mismatch suspicion](#inc-09-storage-mismatch-suspicion)
    - [INC-10 Duplicate asset suspicion](#inc-10-duplicate-asset-suspicion)
    - [INC-11 Orphan job suspicion](#inc-11-orphan-job-suspicion)
    - [INC-12 Rollback of production-enabled asset](#inc-12-rollback-of-production-enabled-asset)
    - [INC-13 Manual completion when files exist but job status is wrong](#inc-13-manual-completion-when-files-exist-but-job-status-is-wrong)
13. [Pre-Deploy Checklist](#13-pre-deploy-checklist)
14. [Post-Deploy Verification Checklist](#14-post-deploy-verification-checklist)
15. [Rollback Checklist](#15-rollback-checklist)
16. [Weekly Health-Check Checklist](#16-weekly-health-check-checklist)

---

## 1. System Overview

The avatar platform ingests 3D avatar asset files (GLB format + PNG thumbnail) submitted by artists, validates them against a strict metadata schema and business rules, routes them through a human review queue if needed, and promotes them to production storage where they are served to students.

The system has three Edge Functions that compose into a single pipeline:

```
Artist upload
    │
    ▼
avatar-ingestion
    Stages 1–9: file download, GLB analysis, naming validation,
                thumbnail validation, metadata override
    Stage 10  : calls → avatar-asset-onboarding (POST /)
    Stage 11  : promotes files from avatar-staging to
                avatar-assets + avatar-thumbnails
    │
    ▼
avatar-asset-onboarding
    POST /         : submit — runs validator, upserts asset record, queues review items
    POST /approve  : human approval, blocks on open review items
    POST /promote  : production gate — re-runs validator with production_enabled=true
    POST /review/resolve : resolve one review queue item
    GET  /status   : read-only status query
    │
    ▼
avatar-asset-validator
    Pure validation function called by onboarding.
    Takes metadata JSON, returns { valid, errors, warnings, manual_review_flags }.
    Stateless — no DB writes, no side effects.
```

---

## 2. Authoritative Sources of Truth

Understanding which data source is authoritative for which fact is essential before taking any action.

### Canonical truth (authoritative DB columns)

These columns are maintained by the pipeline code and enforced by DB constraints and triggers. They are what the system *actually* believes.

| Fact | Authoritative column |
|---|---|
| Whether an asset is in production | `avatar_assets.production_enabled` |
| Asset lifecycle status | `avatar_assets.current_status` |
| Ingestion job status | `avatar_ingestion_jobs.status` |
| GLB file size (measured) | `avatar_ingestion_jobs.measured_file_size_kb` |
| Poly count (measured) | `avatar_ingestion_jobs.measured_poly_count` |
| Texture properties (measured) | `avatar_ingestion_jobs.measured_texture_*` |
| Attachment bones (measured) | `avatar_ingestion_jobs.measured_attachment_bones` |
| Production file location | `avatar_assets.storage_path` |
| Job failure reason | `avatar_ingestion_jobs.failure_stage` + `failure_reason` + `failure_details` |

### Derived metadata (convenience snapshot — may be stale due to M-2)

| Fact | Column | Note |
|---|---|---|
| Declared technical values | `avatar_assets.metadata->>'technical'` | Overwritten by measured values during ingestion. May be stale if M-2 occurred. |
| Declared production_enabled | `avatar_assets.metadata->'deployment'->>'production_enabled'` | May show `false` even when `avatar_assets.production_enabled = true` (M-2). Never use this to determine production state. |

### Audit trail (immutable, append-only — never authoritative for current state)

| Table | Purpose |
|---|---|
| `avatar_ingestion_events` | Per-stage log of every pipeline execution. Cannot be modified or deleted. |
| `avatar_asset_validation_runs` | Full record of every validator call: input payload + response. Cannot be modified or deleted. |

**Rule:** When the canonical column and the metadata snapshot disagree, the canonical column is correct. The snapshot is wrong. Do not act on the snapshot. Do not delete the snapshot — see M-2 resolution procedure.

---

## 3. Database Tables — What Each One Owns

### `avatar_assets`

The master record for every known avatar asset.

- **Primary key:** `asset_id` (text, e.g., `hat_wizard_001`)
- **Lifecycle columns:** `current_status`, `production_enabled` — authoritative, enforced by triggers
- **Snapshot columns:** `metadata` (JSONB) — a convenience copy of the submitted payload, may be stale
- **File location:** `storage_path` — path in `avatar-assets` bucket; NULL until Stage 11 succeeds
- **Status values:** `draft` → `review` → `approved` → `production` · `deprecated` (terminal)
- **Constraints:** `deprecated` cannot transition to any other status. `production` cannot demote to `draft` or `review`. The production gate trigger (`enforce_production_gate`) blocks `production_enabled = true` unless the asset has a passing validation run, no open review items, and status `approved` or `production`.

### `avatar_asset_validation_runs`

Immutable history. One row per call to avatar-asset-validator.

- **Primary key:** `id` (UUID)
- **Foreign key:** `asset_id` → `avatar_assets`
- **Key columns:** `valid` (boolean), `error_count`, `warning_count`, `manual_review_count`, `payload` (what was sent), `response` (what came back)
- **Immutability:** DB triggers `trg_no_update_validation_runs` and `trg_no_delete_validation_runs` reject all UPDATE and DELETE, including from the service role.

### `avatar_asset_review_queue`

One row per `MANUAL_REVIEW_REQUIRED` flag raised by the validator.

- **Primary key:** `id` (UUID)
- **Status values:** `pending` → `resolved` or `dismissed`
- **Blocking:** Any row with `status = 'pending'` for a given `asset_id` blocks both `approve` and `promote`.
- **Resolution fields:** `resolved_by`, `resolved_at`, `resolution` (`acknowledged` or `dismissed`), `resolution_notes` — all must be present once resolved.

### `avatar_ingestion_jobs`

One row per ingestion attempt. Tracks the job through its 11-stage pipeline.

- **Primary key:** `id` (UUID)
- **Status column:** authoritative for pipeline state
- **Measured columns:** `measured_file_size_kb`, `measured_poly_count`, `measured_texture_*`, `measured_attachment_bones` — written by Stage 6, null until then
- **Failure columns:** `failure_stage`, `failure_reason`, `failure_details` — set by `failIngestionJob()`, cleared by `resetJobForRetry()`
- **Link to onboarding:** `onboarding_asset_id`, `onboarding_validation_run_id` — set only on `complete`
- **Unique active constraint:** At most one job for a given `asset_id` may be in `validating` at a time (partial unique index `idx_ingestion_jobs_one_active_per_asset`).
- **Retry limit:** `retry_count` is capped at 3 by a DB CHECK constraint. The `/retry` endpoint refuses jobs with `retry_count >= 3`.

### `avatar_ingestion_events`

Immutable audit log. One row per pipeline stage event.

- **Primary key:** `id` (UUID)
- **Outcome values:** `started`, `passed`, `failed`, `skipped`, `warning`
- **Note:** Event insertion is fire-and-forget in the pipeline code. A missing event does not mean the stage failed — check the job record itself. Events enrich diagnosis; they are not the authoritative state.
- **Immutability:** DB triggers reject all UPDATE and DELETE.

### `avatar_ingestion_artifacts`

Tracks every file touched by a job across its lifecycle.

- **Types:** `glb_staged`, `thumbnail_staged` (in `avatar-staging`), `glb_production`, `thumbnail_production` (in `avatar-assets` / `avatar-thumbnails`)
- **Status values:** `staged` → `promoted` · `deleted`
- **Deduplication:** Staging artifacts: unique per `(job_id, artifact_type)`. Production artifacts: unique per `(artifact_type, content_hash)` — prevents re-uploading identical files.
- **`content_hash`:** SHA-256 hex digest, populated for production artifacts, NULL for staging artifacts.

---

## 4. Accepted Technical Debt — M-2

**Classification:** M-2 (Medium severity, accepted)  
**Location:** `handlePromote()` in `avatar-asset-onboarding/workflow.ts`  
**Status:** Accepted. Will not be fixed in the current release.

### What happens

When an asset is promoted to production, `handlePromote()` executes two sequential writes:

1. `setProductionEnabled()` — sets `production_enabled = true` and `current_status = 'production'` on `avatar_assets`. **This is the canonical DB write. It succeeds.**

2. `updateAssetMetadata()` — updates the `metadata` JSONB snapshot to include `deployment.production_enabled = true`. **This may fail after step 1 succeeds.**

If step 2 fails, the result is:

| Column | Value | Meaning |
|---|---|---|
| `avatar_assets.production_enabled` | `true` | Canonical. Asset IS in production. |
| `avatar_assets.current_status` | `'production'` | Canonical. Asset IS in production. |
| `avatar_assets.metadata->'deployment'->'production_enabled'` | `false` | **Stale snapshot. Do not trust.** |

The asset is fully in production. The canonical state is correct. The metadata JSON is a stale convenience snapshot.

### How to detect

```sql
-- Find all assets where the canonical columns say "production" but the metadata snapshot disagrees.
SELECT asset_id, current_status, production_enabled,
       metadata->'deployment'->>'production_enabled' AS metadata_prod_enabled
FROM avatar_assets
WHERE production_enabled = TRUE
  AND (metadata->'deployment'->>'production_enabled')::boolean IS DISTINCT FROM TRUE;
```

### How to resolve (safe remediation)

The metadata snapshot can be corrected by re-running the onboarding submit with the corrected metadata. This creates a new (passing) validation run in the audit history and updates the snapshot. It does NOT change `production_enabled` or `current_status`.

```sql
-- Read the current metadata to prepare the corrected payload:
SELECT asset_id, metadata FROM avatar_assets WHERE asset_id = '<asset_id>';
```

Then: update `metadata.deployment.production_enabled` to `true` in the payload and call `POST /avatar-asset-onboarding` (submit) with the corrected metadata. This does NOT change `current_status` or `production_enabled`. However, the submit runs the full validator — if any production rule fails, the submit returns HTTP 422 and the snapshot cannot be corrected through this workflow. If that happens, escalate to engineering. Do not start a new ingestion job. See INC-08 for the complete procedure, including how to handle review queue items the corrective submit may create.

### What must never be done

- Do NOT manually `UPDATE avatar_assets SET metadata = ...` to patch the snapshot.
- Do NOT set `production_enabled = false` to "fix" the mismatch. The asset is correctly in production; the snapshot is wrong.
- Do NOT attempt to DELETE and re-insert the asset record. The foreign key constraints on `avatar_ingestion_jobs` and `avatar_asset_validation_runs` will prevent deletion and the attempt will create an incident.

---

## 5. Storage Buckets

| Bucket | Visibility | Size limit | MIME types | Purpose |
|---|---|---|---|---|
| `avatar-staging` | Private | 5 MB | `model/gltf-binary`, `image/png`, `application/octet-stream` | Temporary upload area. Artist uploads go here first. Signed upload URLs expire. |
| `avatar-assets` | Private | 2 MB | `model/gltf-binary`, `application/octet-stream` | Immutable production GLB files. Access requires signed download URL. |
| `avatar-thumbnails` | **Public** | 512 KB | `image/png` | Preview images served directly by URL without signing. |

### Path conventions

- Staging GLB path: `{job_id}/source.glb`
- Staging thumbnail path: `{job_id}/thumbnail.png`
- Production GLB path: `{asset_id}.glb`
- Production thumbnail path: `{asset_id}.png`

Production paths are deterministic from `asset_id` only. Two jobs ingesting the same `asset_id` will write to the same production path. This is intentional — updates overwrite.

### Access model

All bucket reads and writes go through Edge Functions using the service role. Direct client access is denied by default. There is no public URL for `avatar-staging` or `avatar-assets`.

---

## 6. Pipeline Stages Reference

The ingestion pipeline runs in `avatar-ingestion/pipeline.ts` when `POST /process` is called with a `job_id` and `metadata`.

| Stage | Name | Failure type |
|---|---|---|
| 1 | Fetch and claim job | Not a failure stage — 404/409 returned |
| 2 | Naming validation (asset_id prefix, lowercase, no version suffix) | `failed_permanent` |
| 3 | GLB download from staging bucket | `failed_retryable` |
| 4 | GLB integrity check (magic bytes, version, JSON chunk) | `failed_permanent` |
| 5 | File size measurement (informational) | `failed_retryable` (if DB write fails) |
| 6 | GLB deep analysis (poly count, texture, bones) + write measured values to job | `failed_retryable` |
| 7 | Thumbnail download + PNG validation | `failed_permanent` (invalid PNG) or `failed_retryable` (download error) |
| 8 | Forbidden reference pre-check (display_name) | `failed_permanent` |
| 9 | Apply measured overrides to metadata (technical.* replaced by measured values) | No failure — pure computation |
| 10 | Call avatar-asset-onboarding POST / (submit) | `failed_retryable` (network) or `failed_permanent` (validation) |
| 11 | Promote GLB + thumbnail to production buckets, record artifacts, mark complete | `failed_retryable` |

**Retryable failures:** transient conditions — network errors, storage timeouts, temporary DB errors. The job can be retried up to 3 times.

**Permanent failures:** data problems — invalid GLB, naming rule violation, forbidden references, metadata fails full validator. Re-uploading corrected files and starting a new job is required.

---

## 7. Job Status State Machine

```
                POST /init
                    │
                    ▼
               [ pending ]
                    │
         POST /process (claim)
                    │
                    ▼
             [ validating ]
            /             \
     success               failure
         │                   │
         ▼                   ├─── retryable ──→ [ failed_retryable ]
    [ complete ]             │                        │
                             │                  retry_count < 3?
                             │                  Yes: POST /retry → [ pending ]
                             │                  No:  stays in failed_retryable
                             │                       (operator action required)
                             │
                             └─── permanent ──→ [ failed_permanent ]
                                                 (terminal — new job required)
```

**Stuck in validating:** Edge Function timed out. `claimed_at` will be > 10 minutes ago. Call `POST /retry` — the endpoint detects the stale claim and auto-recovers to `failed_retryable`, then immediately resets to `pending`.

**`valid` status:** Present in the DB status CHECK constraint but not used by the current pipeline. Not a reachable state through normal operation. If you see it, escalate.

---

## 8. Asset Status Lifecycle

```
     POST /submit
          │
          ▼
       [ draft ] ←──────────────────────────────────┐
          │                                          │
     (manual or                              POST /submit again
      pipeline)                              (updates metadata,
          │                                  may add review items)
          ▼
      [ review ]
          │
     POST /approve
     (requires: passing validation run,
      no open review items)
          │
          ▼
     [ approved ]
          │
     POST /promote
     (requires: approved status,
      passing validation run,
      no open review items,
      re-runs validator with production_enabled=true)
          │
          ▼
    [ production ]  ───────────────→  [ deprecated ] (terminal)
    production_enabled = true
```

**`deprecated`** is a terminal state. Once set, no workflow action can transition out of it. The DB trigger `enforce_status_transition` enforces this.

**`production` cannot demote to `draft` or `review`.** The same trigger blocks this. To remove a production asset, set it to `deprecated`.

---

## 9. Fields That Must Never Be Manually Edited

The following columns and tables must never be directly modified with raw SQL UPDATE or DELETE. They are protected by application logic, triggers, or foreign key constraints.

### Absolutely forbidden — enforced by DB triggers

| Table | Operation | Reason |
|---|---|---|
| `avatar_ingestion_events` | UPDATE, DELETE | Immutability trigger fires and raises IMMUTABILITY_VIOLATION. The audit trail cannot be altered. |
| `avatar_asset_validation_runs` | UPDATE, DELETE | Same immutability trigger. Validation history is permanent. |

### Forbidden — no trigger, but will corrupt system state

| Table/Column | Operation | Reason |
|---|---|---|
| `avatar_assets.production_enabled` | Manual SET TRUE | Bypasses the production gate trigger workflow. The asset will appear in production without a valid audit trail. |
| `avatar_assets.current_status` | Manual UPDATE to any value | Bypasses status transition guards. May leave `production_enabled` inconsistent with status. **Exception:** the single `production → deprecated` UPDATE in INC-12 is explicitly sanctioned and listed here for completeness — it is the only permitted direct write to this column. All other values are unconditionally forbidden. |
| `avatar_ingestion_jobs.status` | Manual UPDATE | Bypasses state machine. Will leave `claimed_at`/`completed_at`/`failure_*` columns in an inconsistent state. |
| `avatar_ingestion_jobs.retry_count` | Manual UPDATE | Bypasses the retry limit enforced by the `/retry` endpoint. The DB CHECK allows values up to 3 but the application enforces the limit at the endpoint layer. |
| `avatar_assets.metadata` | Manual JSONB UPDATE | Creates M-2 drift. The canonical columns will be correct; the snapshot will be wrong. |
| `avatar_ingestion_artifacts.content_hash` | Manual UPDATE | Breaks the duplicate production hash guard. |
| `avatar_ingestion_artifacts.status` | Manual UPDATE to `promoted` | Must only be set by `promoteArtifact()` which also sets `promoted_at`. Manual set leaves `promoted_at = NULL`, violating the consistency constraint. |

---

## 10. Safe SQL Patterns

These queries are read-only or make targeted, safe corrections. Always run SELECT first to verify scope before any UPDATE.

### Check a job's full state

```sql
SELECT id, asset_id, slot, status, retry_count,
       claimed_at, completed_at,
       failure_stage, failure_reason,
       onboarding_asset_id, onboarding_validation_run_id
FROM avatar_ingestion_jobs
WHERE id = '<job_id>';
```

### Read the full event log for a job

```sql
SELECT event_at, stage, outcome, message, details
FROM avatar_ingestion_events
WHERE job_id = '<job_id>'
ORDER BY event_at ASC;
```

### Read artifacts for a job

```sql
SELECT artifact_type, bucket, storage_path,
       file_size_bytes, content_hash, status,
       created_at, promoted_at
FROM avatar_ingestion_artifacts
WHERE job_id = '<job_id>'
ORDER BY created_at ASC;
```

### Check an asset's canonical state

```sql
SELECT asset_id, current_status, production_enabled,
       storage_path, last_modified_by, last_modified_at
FROM avatar_assets
WHERE asset_id = '<asset_id>';
```

### Find all open review items for an asset

```sql
SELECT id, rule_id, severity, field, message, created_at
FROM avatar_asset_review_queue
WHERE asset_id = '<asset_id>'
  AND status = 'pending'
ORDER BY created_at ASC;
```

### Find all jobs currently stuck in validating

```sql
SELECT id, asset_id, claimed_at,
       NOW() - claimed_at AS age
FROM avatar_ingestion_jobs
WHERE status = 'validating'
  AND claimed_at < NOW() - INTERVAL '10 minutes';
```

### Find all jobs that have hit the retry limit

```sql
SELECT id, asset_id, retry_count, failure_stage, failure_reason,
       initiated_at
FROM avatar_ingestion_jobs
WHERE status = 'failed_retryable'
  AND retry_count >= 3
ORDER BY initiated_at DESC;
```

### Find all permanently failed jobs in the last 7 days

```sql
SELECT id, asset_id, failure_stage, failure_reason,
       initiated_at, completed_at
FROM avatar_ingestion_jobs
WHERE status = 'failed_permanent'
  AND initiated_at > NOW() - INTERVAL '7 days'
ORDER BY initiated_at DESC;
```

### Detect M-2 metadata drift

```sql
SELECT asset_id, current_status, production_enabled,
       metadata->'deployment'->>'production_enabled' AS snapshot_prod_enabled
FROM avatar_assets
WHERE production_enabled = TRUE
  AND (metadata->'deployment'->>'production_enabled')::boolean IS DISTINCT FROM TRUE;
```

### Check validation history for an asset

```sql
SELECT id, run_at, triggered_by, valid,
       error_count, warning_count, manual_review_count
FROM avatar_asset_validation_runs
WHERE asset_id = '<asset_id>'
ORDER BY run_at DESC;
```

### Check for duplicate production artifacts by content hash

```sql
SELECT artifact_type, content_hash, COUNT(*) AS duplicate_count,
       array_agg(job_id) AS job_ids
FROM avatar_ingestion_artifacts
WHERE artifact_type IN ('glb_production', 'thumbnail_production')
  AND content_hash IS NOT NULL
GROUP BY artifact_type, content_hash
HAVING COUNT(*) > 1;
```

### Check for jobs with no events (potential orphan)

```sql
SELECT j.id, j.asset_id, j.status, j.initiated_at
FROM avatar_ingestion_jobs j
LEFT JOIN avatar_ingestion_events e ON e.job_id = j.id
WHERE e.id IS NULL
  AND j.initiated_at < NOW() - INTERVAL '1 hour';
```

### Safely correct storage_path when GLB exists but path is NULL

```sql
-- VERIFY FIRST: confirm the file actually exists in avatar-assets bucket
-- using Supabase dashboard → Storage → avatar-assets
-- THEN: only update storage_path, nothing else
UPDATE avatar_assets
SET storage_path = '<asset_id>.glb',
    last_modified_by = 'ops-manual-correction',
    last_modified_at = NOW()
WHERE asset_id = '<asset_id>'
  AND storage_path IS NULL;
```

---

## 11. Dangerous SQL — Never Run These

These queries will corrupt data, break audit trails, or bypass safety mechanisms. They are listed here so you know to refuse them.

```sql
-- NEVER: bypasses production gate trigger workflow
UPDATE avatar_assets SET production_enabled = TRUE WHERE asset_id = 'xxx';

-- NEVER: bypasses status transition guards
UPDATE avatar_assets SET current_status = 'approved' WHERE asset_id = 'xxx';

-- NEVER: corrupts metadata snapshot without canonical columns to match
UPDATE avatar_assets SET metadata = '{}' WHERE asset_id = 'xxx';

-- NEVER: breaks the state machine — claimed_at, completed_at will be wrong
UPDATE avatar_ingestion_jobs SET status = 'complete' WHERE id = 'xxx';

-- NEVER: destroys audit trail (trigger will fire, but this is the intent to avoid)
DELETE FROM avatar_ingestion_events WHERE job_id = 'xxx';
DELETE FROM avatar_asset_validation_runs WHERE asset_id = 'xxx';

-- NEVER: bypasses retry limit
UPDATE avatar_ingestion_jobs SET retry_count = 0 WHERE id = 'xxx';

-- NEVER: promotes a staged artifact without the promoted_at timestamp
UPDATE avatar_ingestion_artifacts SET status = 'promoted' WHERE id = 'xxx';

-- NEVER: removes an asset that has jobs or validation runs attached
DELETE FROM avatar_assets WHERE asset_id = 'xxx';
```

---

## 12. Incident Playbooks

---

### INC-01: Ingestion job stuck in validating

#### Symptoms

- `GET /avatar-ingestion/status?job_id=<id>` returns `status: "validating"`.
- The job has not progressed for more than 10 minutes.
- No recent events in `avatar_ingestion_events` for the job.

#### How to verify

```sql
SELECT id, asset_id, status, claimed_at,
       NOW() - claimed_at AS age
FROM avatar_ingestion_jobs
WHERE id = '<job_id>'
  AND status = 'validating';
```

If `age` > 10 minutes: the Edge Function timed out. The function is definitively gone.

Check events to confirm:
```sql
SELECT event_at, stage, outcome, message
FROM avatar_ingestion_events
WHERE job_id = '<job_id>'
ORDER BY event_at DESC
LIMIT 5;
```

If the most recent event is a `started` outcome with no subsequent `passed` or `failed`, the function stopped mid-stage.

#### DB truth source

`avatar_ingestion_jobs.status = 'validating'` with `claimed_at` older than 10 minutes.

#### Safe action

Call `POST /avatar-ingestion/retry` with the job ID:

```json
{ "job_id": "<job_id>", "retried_by": "<your_operator_id>" }
```

The `/retry` endpoint:
1. Detects `status = 'validating'` with `claimed_at` older than 10 minutes.
2. Atomically transitions the job to `failed_retryable` (writes an immutable `timeout-recovery` event).
3. Then immediately resets the job to `pending` with `retry_count` incremented.
4. Returns the reset job record with instructions to call `POST /process`.

After calling `/retry`, call `POST /avatar-ingestion/process` with the `job_id` and original `metadata` to resume.

#### What must never be done

- Do NOT manually UPDATE `avatar_ingestion_jobs.status`.
- Do NOT call `/retry` before the 10-minute threshold — the pipeline may still be running. Calling retry too early returns HTTP 409 with a `retry_after` timestamp.
- Do NOT delete the job record.

#### Escalation criteria

- `claimed_at` is less than 10 minutes ago: wait. Do not act.
- The retry itself returns an error: escalate to engineering.
- After retry, the job gets stuck in `validating` again on the very next attempt: suggests a systemic Edge Function timeout issue. Escalate to engineering to investigate the pipeline performance.

---

### INC-02: failed_retryable with retry_count < 3

#### Symptoms

- `GET /avatar-ingestion/status?job_id=<id>` returns `status: "failed_retryable"`.
- `retry_count` is 0, 1, or 2.
- `failure_stage` and `failure_reason` are populated.

#### How to verify

```sql
SELECT id, asset_id, status, retry_count,
       failure_stage, failure_reason, failure_details
FROM avatar_ingestion_jobs
WHERE id = '<job_id>';
```

Read the failure reason to understand whether the underlying condition is likely resolved (e.g., a transient network error) or still present (e.g., staging file missing).

#### DB truth source

`avatar_ingestion_jobs.status = 'failed_retryable'` with `retry_count < 3`.

#### Safe action

Call `POST /avatar-ingestion/retry`:

```json
{ "job_id": "<job_id>", "retried_by": "<your_operator_id>" }
```

This resets the job to `pending`, increments `retry_count`, and clears the `failure_*` columns. The failure is preserved in `avatar_ingestion_events`.

Then call `POST /avatar-ingestion/process` with the original metadata.

If `failure_stage = 'stage-3-glb-download'` and `failure_reason` contains "not found" or "Failed to download": the staging file is missing. **Do NOT call `/retry`.** The job's `staging_glb_path` is fixed at `{job_id}/source.glb` and the signed upload URL has already expired — retrying will fail at Stage 3 again, burning a retry count for nothing. Have the artist start a completely new job via `POST /avatar-ingestion/init` to get fresh signed upload URLs and a new job record.

#### What must never be done

- Do NOT retry if the `failure_reason` clearly indicates a permanent data problem (e.g., "invalid GLB magic bytes"). In that case the job should have been marked `failed_permanent` but if it is `failed_retryable`, file a bug and escalate.
- Do NOT manually UPDATE any job columns.

#### Escalation criteria

- The same failure recurs on all retries: escalate to engineering — the root cause is not transient.
- `failure_stage = 'stage-10-onboarding'` with a validation error response: the metadata itself is invalid. This must be treated as a content issue and the asset metadata corrected. See INC-05.

---

### INC-03: failed_retryable with retry_count = 3

#### Symptoms

- `GET /avatar-ingestion/status?job_id=<id>` returns `status: "failed_retryable"`.
- `retry_count = 3`.
- Calling `POST /retry` returns HTTP 409: "Job has reached the maximum retry limit (3/3)".

#### How to verify

```sql
SELECT id, asset_id, status, retry_count,
       failure_stage, failure_reason, failure_details,
       initiated_at
FROM avatar_ingestion_jobs
WHERE id = '<job_id>';
```

Examine all events to understand the full failure history:
```sql
SELECT event_at, stage, outcome, message, details
FROM avatar_ingestion_events
WHERE job_id = '<job_id>'
ORDER BY event_at ASC;
```

#### DB truth source

`retry_count = 3` with `status = 'failed_retryable'`. The DB CHECK constraint prevents `retry_count > 3`, and the `/retry` endpoint refuses `retry_count >= 3`.

#### Safe action

A job at retry limit 3 cannot be retried. The operator must decide:

**Option A — Start a new job (artist re-submits):**  
If the underlying issue (e.g., transient storage error) is believed resolved, have the artist create a new ingestion job via `POST /avatar-ingestion/init` and upload fresh files.

**Option B — Investigate root cause first:**  
If the same failure stage repeats across all 3 retries, this is not a transient issue. Investigate `failure_details` and escalate to engineering before creating a new job.

The exhausted job record remains in the DB as a historical record. Do not delete it.

#### What must never be done

- Do NOT manually set `retry_count = 0` to bypass the limit. This circumvents the safety mechanism designed to prevent infinite retry loops.
- Do NOT delete the exhausted job record.

#### Escalation criteria

- All 3 retries fail at the same `failure_stage` with the same `failure_reason`: the underlying system has a persistent error. Escalate immediately.
- `failure_stage = 'stage-11-promote'` on all retries: the production bucket write is consistently failing. Storage or permissions issue. Escalate.

---

### INC-04: failed_permanent

#### Symptoms

- `GET /avatar-ingestion/status?job_id=<id>` returns `status: "failed_permanent"`.
- `completed_at` is set.
- The `/retry` endpoint returns HTTP 409: status is "failed_permanent", not "failed_retryable".

#### How to verify

```sql
SELECT id, asset_id, slot, status,
       failure_stage, failure_reason, failure_details,
       initiated_at, completed_at
FROM avatar_ingestion_jobs
WHERE id = '<job_id>';
```

Common permanent failure stages and their meaning:

| `failure_stage` | Meaning | Required artist action |
|---|---|---|
| `stage-2-naming` | `asset_id` fails naming rules (wrong prefix for slot, uppercase letters, version suffix) | Correct the `asset_id` in the metadata and start a new job |
| `stage-4-glb-integrity` | GLB file is not a valid binary GLTF (bad magic bytes or version) | Artist must re-export a valid GLB and start a new job |
| `stage-7-thumbnail` | Thumbnail is not a valid PNG | Artist must re-export a valid PNG thumbnail and start a new job |
| `stage-8-forbidden-refs` | `display_name` contains a forbidden reference (brand name, competitor, etc.) | Correct the `display_name` in the metadata and start a new job |
| `stage-10-onboarding` | Metadata failed the full avatar-asset-validator (HARD_FAIL rules) | Correct all validation errors in the metadata and start a new job |
| `complete` | The pipeline completed successfully but the job-complete DB write failed. Asset IS in production. | See INC-13 — manual completion may be needed |

#### DB truth source

`avatar_ingestion_jobs.status = 'failed_permanent'` with populated `failure_stage`, `failure_reason`, `failure_details`.

#### Safe action

1. Read the `failure_reason` and `failure_details` from the job record.
2. Communicate the specific failure to the artist or content team.
3. Once the issue is corrected (new files uploaded, metadata fixed), have the artist start a completely new job via `POST /avatar-ingestion/init`. The old failed job stays as a historical record.

For `failure_stage = 'complete'`, see INC-13.

#### What must never be done

- Do NOT manually transition a `failed_permanent` job to any other status.
- Do NOT attempt to retry a `failed_permanent` job. The failure is unrecoverable by design.

#### Escalation criteria

- `failure_stage = 'complete'` with a working production file present: see INC-13.
- Large volume of `failed_permanent` at `stage-2-naming` for a new slot type: may indicate a naming rule was changed without artist communication. Escalate to content team.

---

### INC-05: Onboarding validation failure

#### Symptoms

- `POST /avatar-asset-onboarding` (directly, or via the ingestion pipeline at Stage 10) returns HTTP 422.
- Response body contains `validation_errors` array with one or more entries.
- Each entry has `rule_id`, `severity: "HARD_FAIL"`, `field`, `message`.

#### How to verify

Check the validation history for the asset:

```sql
SELECT id, run_at, triggered_by, valid, error_count, response
FROM avatar_asset_validation_runs
WHERE asset_id = '<asset_id>'
ORDER BY run_at DESC
LIMIT 5;
```

The `response` JSONB column contains the full validator output including all errors, warnings, and manual review flags.

To see the exact errors from the most recent failed run:
```sql
SELECT run_at,
       response->'errors' AS hard_errors,
       response->'warnings' AS warnings
FROM avatar_asset_validation_runs
WHERE asset_id = '<asset_id>'
  AND valid = FALSE
ORDER BY run_at DESC
LIMIT 1;
```

#### DB truth source

`avatar_asset_validation_runs` — every validation call is recorded here. The `response` column contains the exact validator output.

#### Safe action

1. Identify each `HARD_FAIL` error from the `validation_errors` in the response. The `rule_id` and `field` identify the specific rule and metadata field.
2. Refer to `docs/backend_validation_rules.md` for the rule definitions.
3. Correct the metadata.
4. Re-submit via `POST /avatar-asset-onboarding` or start a new ingestion job if the original came through the pipeline.

**If the failure is at ingestion Stage 10:** The job will be marked `failed_permanent`. A new ingestion job is required with corrected metadata. The old job is a historical record.

**If the failure is at direct onboarding submit:** Call `POST /avatar-asset-onboarding` again with corrected metadata once errors are resolved.

#### What must never be done

- Do NOT delete validation run records to "clean up" failures.
- Do NOT manually insert a validation run with `valid = true`. The immutability trigger will block UPDATE/DELETE but INSERT is technically possible — never do this. It would corrupt the audit trail and may allow promotion of an asset that never actually passed validation.
- Do NOT bypass the validator by calling `setAssetStatus` or `setProductionEnabled` directly.

#### Escalation criteria

- `rule_id = "SCHEMA"`: the metadata JSON structure itself is malformed (missing required fields, wrong types). Requires developer involvement to fix the metadata template.
- The same HARD_FAIL recurs across multiple jobs for the same asset despite claimed fixes: the fix is not addressing the right field. Escalate to the content team with the exact `field` path.

---

### INC-06: Review queue blocked

#### Symptoms

- `POST /avatar-asset-onboarding/approve` returns HTTP 409 with message "has N open manual review item(s)".
- `POST /avatar-asset-onboarding/promote` returns the same.
- `GET /avatar-asset-onboarding/status?asset_id=<id>` shows `open_review_items` array with pending entries.

#### How to verify

```sql
SELECT id, rule_id, severity, field, message, created_at,
       (SELECT run_at FROM avatar_asset_validation_runs WHERE id = rq.validation_run_id) AS flagged_at
FROM avatar_asset_review_queue rq
WHERE asset_id = '<asset_id>'
  AND status = 'pending'
ORDER BY created_at ASC;
```

The `rule_id` tells you which rule flagged the item. The `message` describes what the reviewer must evaluate.

Common `MANUAL_REVIEW_REQUIRED` flags:

| `rule_id` | Trigger |
|---|---|
| `RULE-APR-004` | Self-approval detected (`approved_by` matches `created_by`) |
| `RULE-FRB-004` | Forbidden reference found but copyright review notes are absent |

#### DB truth source

`avatar_asset_review_queue` with `status = 'pending'` for the `asset_id`.

#### Safe action

A qualified reviewer must evaluate each open item and call `POST /avatar-asset-onboarding/review/resolve`:

```json
{
  "review_id": "<review_queue_entry_id>",
  "resolved_by": "<reviewer_id>",
  "resolution": "acknowledged",
  "notes": "Reviewed and confirmed acceptable. [Reason]."
}
```

Or dismiss if the flag is determined to be a false positive:
```json
{
  "review_id": "<review_queue_entry_id>",
  "resolved_by": "<reviewer_id>",
  "resolution": "dismissed",
  "notes": "Dismissed: [reason why flag does not apply]."
}
```

Once all items are resolved or dismissed, `approve` and `promote` will unblock.

#### What must never be done

- Do NOT manually UPDATE `avatar_asset_review_queue.status` to `resolved` or `dismissed`. The `resolved_by`, `resolved_at`, `resolution` columns must be set simultaneously by the `/review/resolve` endpoint. A manual UPDATE that omits any of these will violate the `review_queue_resolution_consistency` CHECK constraint.
- Do NOT resolve items without a meaningful `notes` value for `MANUAL_REVIEW_REQUIRED` flags — the notes constitute the audit record of the review decision.

#### Escalation criteria

- The review item message references a forbidden brand name or copyright concern (`RULE-FRB-*`): legal review may be required before resolution.
- Self-approval flag (`RULE-APR-004`) and the submitter is the only available approver: a second person with approval authority must be assigned.

---

### INC-07: Production promotion failure

#### Symptoms

- `POST /avatar-asset-onboarding/promote` returns an error.
- The asset is still in `approved` status (not yet promoted), OR:
- The asset IS promoted (M-2 scenario) but the endpoint returned HTTP 500.

#### How to verify

First, read the canonical state:
```sql
SELECT asset_id, current_status, production_enabled,
       last_modified_by, last_modified_at,
       storage_path
FROM avatar_assets
WHERE asset_id = '<asset_id>';
```

If `production_enabled = true` AND `current_status = 'production'`: **the promotion succeeded at the DB level.** The error was in the metadata snapshot update (M-2). Proceed to INC-08.

If `production_enabled = false` AND `current_status = 'approved'`: the promotion failed before the canonical write. The asset is not in production.

Check the most recent validation run created by the promote attempt:
```sql
SELECT id, run_at, valid, error_count, response
FROM avatar_asset_validation_runs
WHERE asset_id = '<asset_id>'
ORDER BY run_at DESC
LIMIT 3;
```

Common promotion failure reasons:

| HTTP status | Cause |
|---|---|
| 409 with "no passing validation run" | No `valid = true` run exists for this asset |
| 409 with "open manual review items" | Review queue has pending items — resolve them first |
| 409 with "status is not approved" | Asset is not in `approved` status |
| 422 with `validation_errors` | Re-validation with `production_enabled: true` failed (production rules not met) |
| 409 with "PRODUCTION_GATE" | The DB trigger blocked the write — one of the three gate conditions failed |
| 500 with "failed to persist production metadata" | M-2 — promotion succeeded, metadata update failed |

#### DB truth source

`avatar_assets.current_status` and `avatar_assets.production_enabled` — canonical.

#### Safe action

**If not yet in production (normal failure):**
1. Resolve the specific cause identified above.
2. For 422 validation errors: fix the metadata fields listed in `validation_errors`, resubmit the asset, re-approve, then re-promote.
3. Once the blocking condition is cleared, call `POST /promote` again.

**If already in production but got HTTP 500 (M-2):**
Follow INC-08.

#### What must never be done

- Do NOT manually set `production_enabled = true`. The DB trigger would fire if the gate conditions are met, but it is better to use the defined workflow.
- Do NOT delete a failing validation run to retry promotion. Validation runs are immutable.

#### Escalation criteria

- `PRODUCTION_GATE` error from the DB trigger but the application-level checks already passed: the DB and application logic are out of sync. Escalate to engineering immediately.
- Promotion repeatedly returns 422 at the `checkProductionEnabledRequiresTextureEmbedded` rule: the GLB was ingested without an embedded texture. A new ingestion with the correct asset is required.

---

### INC-08: Metadata drift caused by M-2

#### Symptoms

- Asset is live in production (observable in the application) but:
- `avatar_assets.metadata->'deployment'->>'production_enabled'` returns `'false'`.
- `POST /promote` was called and returned HTTP 500 with message containing "failed to persist production metadata".

#### How to verify

Step 1 — Confirm the canonical state is correct:
```sql
SELECT asset_id, current_status, production_enabled,
       last_modified_by, last_modified_at
FROM avatar_assets
WHERE asset_id = '<asset_id>';
```
Expected: `current_status = 'production'`, `production_enabled = true`.

Step 2 — Confirm the metadata snapshot is stale:
```sql
SELECT metadata->'deployment' AS deployment_snapshot
FROM avatar_assets
WHERE asset_id = '<asset_id>';
```
Expected (stale): `{ "production_enabled": false, ... }`

Step 3 — Confirm the storage file exists. In Supabase dashboard → Storage → `avatar-assets`, verify `<asset_id>.glb` is present.

#### DB truth source

`avatar_assets.production_enabled = true` and `avatar_assets.current_status = 'production'`. The asset is in production. The metadata snapshot `deployment.production_enabled = false` is wrong.

#### Safe action

Re-run the onboarding submit with a corrected metadata payload:

1. Read the current metadata:
```sql
SELECT metadata FROM avatar_assets WHERE asset_id = '<asset_id>';
```

2. Copy the metadata JSON. Change `metadata.deployment.production_enabled` from `false` to `true`.

3. Call `POST /avatar-asset-onboarding` (submit) with the corrected payload:
```json
{
  "metadata": { ...corrected metadata with production_enabled: true... },
  "triggered_by": "<your_operator_id>",
  "storage_path": null
}
```

4. Inspect the HTTP response code before doing anything else.

   **HTTP 422 — validation failed:**
   Stop. Do not start a new ingestion job. Do not treat this as INC-05. A new ingestion job creates a second production record for the same `asset_id` and does not correct the stale snapshot on the existing row. The asset is already in production — `production_enabled` and `current_status` are correct. The snapshot mismatch is a display defect, not a production defect. Escalate to engineering immediately with the `asset_id` and the full HTTP 422 response body. No further operator action is possible without engineering involvement.

   **HTTP 200 — submit passed — `review_items_created = 0`:**
   Clean path. Proceed to step 5.

   **HTTP 200 — submit passed — `review_items_created > 0`:**
   The validator raised `MANUAL_REVIEW_REQUIRED` flags against the production metadata and created new pending review queue items. These items do **not** affect the asset's live production state — `production_enabled` remains `true` regardless. However, they will permanently appear in the open review queue health check and will block any future re-approval or re-promotion of this `asset_id` if that is ever needed. Resolve every created item immediately:
   ```
   POST /avatar-asset-onboarding/review/resolve
   {
     "review_id": "<id from open items query>",
     "resolved_by": "<your_operator_id>",
     "resolution": "acknowledged",
     "notes": "Item created by M-2 corrective submit on already-production asset <asset_id>. No action required — asset is in production and was not re-promoted."
   }
   ```
   Confirm all items are cleared before proceeding:
   ```sql
   SELECT id, rule_id, field, message
   FROM avatar_asset_review_queue
   WHERE asset_id = '<asset_id>'
     AND status = 'pending';
   ```
   Expected: 0 rows. If any rows remain, resolve them individually. Do not proceed to step 5 until this query returns 0 rows.

5. Verify the snapshot is corrected:
```sql
SELECT metadata->'deployment'->>'production_enabled' AS snapshot_fixed
FROM avatar_assets
WHERE asset_id = '<asset_id>';
```
Expected: `'true'`.

#### What must never be done

- Do NOT `UPDATE avatar_assets SET metadata = ...` directly.
- Do NOT set `production_enabled = false` "to fix the inconsistency". The canonical state is correct. Only the snapshot is wrong.
- Do NOT attempt to re-run `POST /promote`. The asset is already in production. `promote` will return 409 "already in production".

#### Escalation criteria

- The corrective submit returns HTTP 422: escalate to engineering immediately. Do not start a new ingestion job. Do not treat as INC-05. See step 4 above.
- The corrective submit returns HTTP 200 but review items were created and cannot all be resolved: escalate to engineering. Do not leave pending review items open for a production asset.
- The drift is discovered on multiple assets simultaneously: the `updateAssetMetadata()` write is failing systemically (DB write quota, connectivity, permissions). Escalate immediately — do not attempt corrective submits on further assets until the root cause is identified.

---

### INC-09: Storage mismatch suspicion

#### Symptoms

- An asset's `storage_path` in the DB does not produce a file when accessed.
- Or: a file exists in `avatar-assets` or `avatar-thumbnails` that has no corresponding DB record.
- Or: `avatar_ingestion_artifacts` shows `status = 'promoted'` but the file is not in the bucket.

#### How to verify

Step 1 — Check the job's artifact records:
```sql
SELECT artifact_type, bucket, storage_path,
       file_size_bytes, content_hash, status,
       created_at, promoted_at
FROM avatar_ingestion_artifacts
WHERE job_id = '<job_id>'
ORDER BY created_at ASC;
```

Step 2 — Check the asset's storage_path:
```sql
SELECT asset_id, storage_path FROM avatar_assets WHERE asset_id = '<asset_id>';
```

Step 3 — Verify the file in Supabase dashboard → Storage → the relevant bucket. Confirm whether the file physically exists at the recorded path.

Step 4 — Check the event log for Stage 11:
```sql
SELECT event_at, outcome, message, details
FROM avatar_ingestion_events
WHERE job_id = '<job_id>'
  AND stage = 'stage-11-promote'
ORDER BY event_at ASC;
```

A `warning` event with message "GLB promoted but failed to set storage_path on asset record" means the file IS in the bucket but `avatar_assets.storage_path` was not updated.

#### DB truth source

`avatar_ingestion_artifacts.status = 'promoted'` is the authoritative record that the pipeline attempted a promotion. The event log confirms whether the actual bucket upload succeeded.

#### Safe action

**Case A — File is in bucket, `storage_path` is NULL on asset:**
```sql
UPDATE avatar_assets
SET storage_path = '<asset_id>.glb',
    last_modified_by = 'ops-manual-correction',
    last_modified_at = NOW()
WHERE asset_id = '<asset_id>'
  AND storage_path IS NULL;
```

**Case B — File is NOT in bucket but artifact record says `promoted`:**  
The upload likely failed at the infrastructure level and the job went to `failed_retryable` or `failed_permanent`. Check `failure_stage` on the job. If the job is still `complete` despite the missing file, escalate to engineering — this means the pipeline succeeded the DB write but the storage write was silently lost.

**Case C — File in bucket with no DB record:**  
This is an orphan storage file. Do not delete it without confirming no live artifact row references it. Cross-reference with artifact records first. Escalate to engineering for safe cleanup.

#### What must never be done

- Do NOT delete files from `avatar-assets` or `avatar-thumbnails` without first verifying no live asset depends on them.
- Do NOT manually insert `avatar_ingestion_artifacts` rows to "fix" the tracking. The artifacts table is populated by the pipeline code only.

#### Escalation criteria

- Multiple assets in the same time window have missing storage files: suggests a storage outage or permission change. Escalate immediately.
- A file exists in `avatar-assets` with no corresponding artifact record AND it matches a known asset ID: data integrity concern. Escalate to engineering.

---

### INC-10: Duplicate asset suspicion

#### Symptoms

- Two or more ingestion jobs were created for the same `asset_id`.
- Or: `avatar_asset_validation_runs` shows duplicate entries for the same `asset_id` and `run_at`.

#### How to verify

```sql
-- Check all jobs for the asset
SELECT id, status, retry_count, initiated_at, completed_at, initiated_by
FROM avatar_ingestion_jobs
WHERE asset_id = '<asset_id>'
ORDER BY initiated_at DESC;
```

Multiple jobs for the same `asset_id` is **normal and expected** — each retry or resubmission creates a new job. Multiple `complete` jobs for the same `asset_id` is also possible and means the asset was re-ingested (e.g., updated version).

```sql
-- Check for multiple simultaneously active (validating) jobs
SELECT id, status, claimed_at
FROM avatar_ingestion_jobs
WHERE asset_id = '<asset_id>'
  AND status = 'validating';
```

The partial unique index `idx_ingestion_jobs_one_active_per_asset` prevents two jobs for the same `asset_id` from being in `validating` at the same time. If you see two: one must have been there before the index was added or the index was bypassed. Escalate.

```sql
-- Check production artifact deduplication
SELECT artifact_type, content_hash, COUNT(*) as count,
       array_agg(job_id) as job_ids
FROM avatar_ingestion_artifacts
WHERE artifact_type IN ('glb_production', 'thumbnail_production')
  AND content_hash IS NOT NULL
GROUP BY artifact_type, content_hash
HAVING COUNT(*) > 1;
```

A `count > 1` for a given `content_hash` would mean the unique constraint is not working. Escalate to engineering.

#### DB truth source

`avatar_ingestion_jobs` — all jobs for the asset. `avatar_assets` — single authoritative record (primary key on `asset_id`). The asset record is upserted — only one row per `asset_id` exists regardless of how many jobs ran.

#### Safe action

Multiple completed jobs for the same `asset_id` are normal. The asset record is updated by each successful onboarding run. The latest `last_modified_at` reflects the current version.

If you need to understand which job produced the current production state:
```sql
SELECT onboarding_asset_id, onboarding_validation_run_id,
       completed_at, initiated_by
FROM avatar_ingestion_jobs
WHERE asset_id = '<asset_id>'
  AND status = 'complete'
ORDER BY completed_at DESC
LIMIT 1;
```

#### What must never be done

- Do NOT delete older completed jobs to "clean up".
- Do NOT attempt to manually deduplicate asset records — there is only ever one per `asset_id`.

#### Escalation criteria

- Two simultaneous `validating` jobs for the same `asset_id`: the unique index should prevent this. Escalate to engineering.
- Production artifact duplicate hash found: the deduplication guard is broken. Escalate immediately.

---

### INC-11: Orphan job suspicion

#### Symptoms

- A job row exists in `avatar_ingestion_jobs` with `status = 'pending'` for an extended period (hours to days) with no associated events and no recent pipeline activity.
- Or: a job was created (`POST /init`) but `POST /process` was never called.

#### How to verify

```sql
-- Jobs in pending with no events, older than 1 hour
SELECT j.id, j.asset_id, j.status, j.initiated_at, j.initiated_by
FROM avatar_ingestion_jobs j
LEFT JOIN avatar_ingestion_events e ON e.job_id = j.id
WHERE j.status = 'pending'
  AND j.initiated_at < NOW() - INTERVAL '1 hour'
  AND e.id IS NULL;
```

An orphan pending job is typically the result of:
- Artist called `POST /init` but never uploaded files and called `POST /process`.
- An old job from before a deployment that reset the workflow.

#### DB truth source

`avatar_ingestion_jobs.status = 'pending'` with `claimed_at IS NULL` and no associated events.

#### Safe action

A `pending` job with no events is **inert** — it holds no locks and causes no harm. The only risk is that the staging upload URLs it holds have expired (signed URLs have a short TTL). The files in `avatar-staging` at the reserved paths may or may not exist.

If the artist wants to proceed: they must start a new job with `POST /init`. The old pending job will remain as an orphan record.

If you need to identify and list all long-lived orphan pending jobs for a weekly cleanup report:
```sql
SELECT id, asset_id, initiated_by, initiated_at,
       NOW() - initiated_at AS age
FROM avatar_ingestion_jobs
WHERE status = 'pending'
  AND initiated_at < NOW() - INTERVAL '24 hours';
```

Do not delete these records. Retain them as historical evidence.

#### What must never be done

- Do NOT manually transition orphan `pending` jobs to `failed_permanent` or any other status to "clean up".
- Do NOT delete orphan job records.
- Do NOT delete staging files that might correspond to an orphan job without confirming the job is inert (no active process).

#### Escalation criteria

- Large accumulation of orphan `pending` jobs (dozens per day): suggests the artist onboarding UI is creating jobs without completing them. Escalate to the product team.
- An orphan job has `claimed_at` set but `status = 'pending'`: this is a constraint violation (`ingestion_jobs_claimed_at_consistency` requires `claimed_at IS NULL` when `status = 'pending'`). Escalate immediately.

---

### INC-12: Rollback of production-enabled asset

#### Symptoms

- An asset in production (`production_enabled = true`, `current_status = 'production'`) must be removed from production immediately.
- Reason may be: copyright concern, content policy violation, technical defect in the served asset.

#### How to verify

Confirm the asset is currently in production:
```sql
SELECT asset_id, current_status, production_enabled,
       storage_path, last_modified_by, last_modified_at
FROM avatar_assets
WHERE asset_id = '<asset_id>';
```

#### DB truth source

`avatar_assets.production_enabled = true` and `avatar_assets.current_status = 'production'`.

#### Safe action

**The only safe way to remove a production asset is to set it to `deprecated`.**

```
POST /avatar-asset-onboarding/approve (not applicable — already beyond approved)
```

There is no dedicated "depromote" or "rollback" endpoint. The DB status transition trigger prevents demoting `production` to `draft` or `review`. Setting `deprecated` is the correct terminal action.

Since there is no direct "deprecate" endpoint, this requires a targeted DB write. **Before running any SQL, read the escalation criteria below.** This UPDATE touches `current_status`, which Section 9 lists as generally forbidden — the `production → deprecated` transition here is the sole explicitly sanctioned exception to that rule.

#### Escalation criteria — read before acting

- **The rollback is needed due to a legal, copyright, or content-safety concern: do not act unilaterally.** Notify a product/legal owner and obtain explicit sign-off before executing any SQL. Log the authorization with a timestamp.
- **The `avatar-thumbnails` bucket is PUBLIC.** Deprecating the DB record does NOT remove the thumbnail from `avatar-thumbnails/<asset_id>.png`. That URL remains publicly accessible to anyone who has it — including CDN caches, browser caches, and shared links. For any copyright, CSAM, or content-safety incident, physical file deletion from `avatar-thumbnails` is required, not optional. This must be escalated to engineering immediately alongside or before running the DB write. Do not declare the incident resolved based on the DB write alone.
- If the asset is referenced by active student profiles: the application team must be notified to handle the reference cleanup before or alongside the deprecation.

#### SQL

```sql
-- Step 1: Verify the current state
SELECT asset_id, current_status, production_enabled
FROM avatar_assets
WHERE asset_id = '<asset_id>';

-- Step 2: Disable production and set to deprecated (atomic)
UPDATE avatar_assets
SET production_enabled = FALSE,
    current_status = 'deprecated',
    last_modified_by = 'ops-deprecation:<your_operator_id>',
    last_modified_at = NOW()
WHERE asset_id = '<asset_id>'
  AND production_enabled = TRUE
  AND current_status = 'production';
```

The `WHERE` clause ensures this only applies to an asset currently in production. The `enforce_status_transition` trigger does NOT block `production → deprecated` (only blocks `production → draft/review`).

**After this write:**
- `production_enabled = false` — asset no longer appears in DB serving queries.
- `current_status = 'deprecated'` — permanent terminal state. Cannot be changed further.
- The GLB file remains in `avatar-assets`. Signed URLs to it remain valid until they expire.
- **The thumbnail in `avatar-thumbnails` is still publicly reachable by direct URL.** Physical deletion requires an engineering action and must not be deferred if the reason for rollback is a content or legal concern.

#### What must never be done

- Do NOT attempt `current_status = 'draft'` or `current_status = 'review'` — the DB trigger will reject this.
- Do NOT simply set `production_enabled = false` without also updating `current_status`. Leaving `current_status = 'production'` with `production_enabled = false` is a valid DB state that will confuse all downstream queries. Set `deprecated` explicitly.
- Do NOT delete the asset record. It has foreign key references that will prevent deletion and leave the DB in a partial state.
- Do NOT declare the incident resolved after only running the DB write when the reason involves content safety or copyright. The public thumbnail is still live until physically deleted.

---

### INC-13: Manual completion of asset when files exist but job status is wrong

#### Symptoms

- An ingestion job has `status = 'failed_permanent'` with `failure_stage = 'complete'`.
- The event log shows Stage 11 passed (GLB and thumbnail promoted successfully).
- The files exist in `avatar-assets` and `avatar-thumbnails`.
- The `onboarding_asset_id` may or may not be populated on the job.
- The asset may already exist in `avatar_assets` from a prior or concurrent run.

This scenario occurs when Stage 11 completes successfully (files are promoted, artifact records inserted) but the subsequent `completeIngestionJob()` DB write fails. The pipeline marks the job `failed_permanent` at stage `complete` rather than letting it retry (since the asset is genuinely in production — a retry would re-run onboarding unnecessarily).

#### How to verify

Step 1 — Confirm the event log shows Stage 11 passed:
```sql
SELECT event_at, stage, outcome, message
FROM avatar_ingestion_events
WHERE job_id = '<job_id>'
  AND stage IN ('stage-11-promote', 'pipeline-complete')
ORDER BY event_at ASC;
```

Look for `stage-11-promote` with `outcome = 'passed'` and the message "Artifacts promoted: GLB → ...".

Step 2 — Confirm the production artifacts are recorded:
```sql
SELECT artifact_type, bucket, storage_path, status, promoted_at
FROM avatar_ingestion_artifacts
WHERE job_id = '<job_id>'
  AND artifact_type IN ('glb_production', 'thumbnail_production');
```
Expected: both rows present with `status = 'promoted'`.

Step 3 — Confirm the asset exists in `avatar_assets`:
```sql
SELECT asset_id, current_status, production_enabled,
       storage_path, created_at, last_modified_at
FROM avatar_assets
WHERE asset_id = '<asset_id>';
```

Step 4 — Confirm the files physically exist in the storage buckets (Supabase dashboard → Storage → `avatar-assets`).

#### DB truth source

Files are confirmed in storage + artifact records show `promoted` + asset record exists → the asset IS onboarded. The job's `failed_permanent` status reflects only the final DB write failure, not an actual content or pipeline failure.

#### Safe action

The asset is in the onboarding system. The only missing piece is the job's `completed_at` and `onboarding_asset_id` / `onboarding_validation_run_id` fields.

Step 1 — Find the correct `onboarding_asset_id` and `onboarding_validation_run_id`:
```sql
-- Find the validation run created by Stage 10 of THIS specific job.
-- Filter by the exact job_id, not by asset_id — other jobs for the same asset
-- have their own validation runs and must not be used here.
SELECT id AS validation_run_id, run_at, triggered_by
FROM avatar_asset_validation_runs
WHERE asset_id = '<asset_id>'
  AND triggered_by = 'ingestion-pipeline:<job_id>'
ORDER BY run_at DESC
LIMIT 1;
```

If this query returns zero rows, Stage 10 did not complete for this job. Do not proceed — escalate to engineering. The asset may not be fully registered in the onboarding system.

Step 2 — Manually complete the job (the only sanctioned manual UPDATE on `avatar_ingestion_jobs`):
```sql
UPDATE avatar_ingestion_jobs
SET status = 'complete',
    completed_at = NOW(),
    failure_stage = NULL,
    failure_reason = NULL,
    failure_details = NULL,
    onboarding_asset_id = '<asset_id>',
    onboarding_validation_run_id = '<validation_run_id_from_step_1>'
WHERE id = '<job_id>'
  AND status = 'failed_permanent'
  AND failure_stage = 'complete';
```

The `WHERE` clause restricts this to only the specific scenario. It will affect zero rows if the job is in any other state, preventing accidental misuse. The `failure_*` columns are cleared so the completed job does not appear as a failure in future health checks.

Step 3 — Verify:
```sql
SELECT id, status, completed_at, onboarding_asset_id, onboarding_validation_run_id
FROM avatar_ingestion_jobs
WHERE id = '<job_id>';
```

#### What must never be done

- Do NOT run this UPDATE if Stage 11 did not actually complete — verify the event log and artifact records first.
- Do NOT run this UPDATE if the files are missing from the storage buckets.
- Do NOT set `status = 'complete'` on a job whose `failure_stage` is anything other than `'complete'`.

#### Escalation criteria

- The validation run from the onboarding call cannot be found: the onboarding call itself may not have completed. The asset may not be fully registered. Escalate to engineering before taking any action.
- This scenario occurs more than once in a week: suggests the DB is experiencing intermittent write failures at job completion time. Escalate to engineering.

---

## 13. Pre-Deploy Checklist

Complete this checklist before deploying any change to the avatar platform (Edge Function update, DB migration, or storage policy change).

- [ ] **DB migration reviewed.** All migration SQL has been reviewed by a second person. No DROP TABLE, no DROP COLUMN, no ALTER COLUMN that removes a NOT NULL constraint without a default.
- [ ] **No migration modifies immutable tables.** Confirm no migration runs UPDATE or DELETE on `avatar_ingestion_events` or `avatar_asset_validation_runs`.
- [ ] **Trigger compatibility confirmed.** If a migration adds or modifies triggers, confirm the trigger logic is consistent with the application code (`enforce_production_gate`, `enforce_status_transition`, immutability triggers).
- [ ] **No active validating jobs.** Before deploying Edge Functions, confirm no jobs are currently in `validating` state:
  ```sql
  SELECT COUNT(*) FROM avatar_ingestion_jobs WHERE status = 'validating';
  ```
  Expected: 0. If non-zero, wait for completion or recovery before deploying.
- [ ] **No pending migrations already applied.** Run `supabase migration list` and confirm the to-be-deployed migration has not already been applied to production.
- [ ] **Storage bucket config unchanged** (unless intentional). Confirm bucket `public` flag, `file_size_limit`, and `allowed_mime_types` are unchanged or intentionally modified.
- [ ] **Validator schema change reviewed.** If `metadata.schema.json` is changed, all currently `approved` or `production` assets must remain valid under the new schema. Run the validator against a sample of existing assets before deploying.
- [ ] **Rollback path confirmed.** For every migration, document how to reverse it. For Edge Function deploys, confirm the previous version can be redeployed.

---

## 14. Post-Deploy Verification Checklist

Complete this within 30 minutes of every deployment.

- [ ] **Edge Functions are live.** Call `GET /avatar-ingestion/status?job_id=nonexistent` — expect HTTP 404, not HTTP 500 or timeout.
- [ ] **Onboarding is reachable.** Call `GET /avatar-asset-onboarding/status?asset_id=nonexistent` — expect HTTP 404.
- [ ] **Validator is reachable.** (Internal to onboarding — confirmed by the above.)
- [ ] **No jobs newly stuck in validating.**
  ```sql
  SELECT COUNT(*) FROM avatar_ingestion_jobs
  WHERE status = 'validating'
    AND claimed_at < NOW() - INTERVAL '10 minutes';
  ```
  Expected: 0 (or same count as before deployment, indicating pre-existing issue not caused by deploy).
- [ ] **No new failed_permanent jobs since deploy.**
  ```sql
  SELECT COUNT(*) FROM avatar_ingestion_jobs
  WHERE status = 'failed_permanent'
    AND completed_at > NOW() - INTERVAL '30 minutes';
  ```
  Expected: 0 unless a known content issue is in progress.
- [ ] **Production assets are still in production.**
  ```sql
  SELECT COUNT(*) FROM avatar_assets WHERE production_enabled = TRUE;
  ```
  Compare to pre-deploy count. Should be identical.
- [ ] **No new M-2 drift introduced.**
  ```sql
  SELECT COUNT(*) FROM avatar_assets
  WHERE production_enabled = TRUE
    AND (metadata->'deployment'->>'production_enabled')::boolean IS DISTINCT FROM TRUE;
  ```
  Compare to pre-deploy count. Should not have increased.
- [ ] **DB triggers are active.**
  ```sql
  SELECT trigger_name, event_manipulation, event_object_table, action_timing
  FROM information_schema.triggers
  WHERE trigger_schema = 'public'
    AND trigger_name IN (
      'trg_no_update_validation_runs',
      'trg_no_delete_validation_runs',
      'trg_no_update_ingestion_events',
      'trg_no_delete_ingestion_events',
      'trg_avatar_assets_production_gate',
      'trg_avatar_assets_status_transition'
    )
  ORDER BY trigger_name;
  ```
  Expected: 6 rows. Any missing trigger is a critical issue — escalate immediately.
- [ ] **Storage buckets unchanged** (unless migration was expected to change them):
  ```sql
  SELECT id, public, file_size_limit FROM storage.buckets
  WHERE id IN ('avatar-staging', 'avatar-assets', 'avatar-thumbnails');
  ```
  Confirm `avatar-staging`: private, 5242880. `avatar-assets`: private, 2097152. `avatar-thumbnails`: public, 524288.

---

## 15. Rollback Checklist

Use this when a deployment must be reversed.

### Edge Function rollback

- [ ] Identify the previous deployed function version (git commit hash or tagged release).
- [ ] Run `supabase functions deploy <function-name>` with the previous version of the function code.
- [ ] Repeat post-deploy verification checklist.
- [ ] Document the reason for rollback and the timeline.

### DB migration rollback

**Note:** DB migrations are generally not safely reversible once applied to a live production database with data. Prevention (pre-deploy checklist) is far preferable to rollback.

If rollback is required:

- [ ] Write a reverse migration that undoes the structural change (add back dropped columns, restore removed constraints). Do NOT use `supabase db reset` on production.
- [ ] Review the reverse migration with a second person before applying.
- [ ] Confirm no data loss will result from the reverse migration.
- [ ] Apply the reverse migration via `supabase db push`.
- [ ] Repeat post-deploy verification checklist.
- [ ] If the original migration created new tables: the reverse migration may DROP those tables. Confirm they are empty first.

### Asset-level rollback (asset mistakenly promoted)

Follow INC-12.

### Data integrity rollback (bad write made it to production)

- [ ] Identify the exact rows affected.
- [ ] Do NOT modify `avatar_ingestion_events` or `avatar_asset_validation_runs` — immutable.
- [ ] For `avatar_assets`: follow the specific incident playbook. If no playbook applies, escalate to engineering.
- [ ] Document every manual DB write in an incident log with: timestamp, operator ID, table, rows affected, before/after values, reason.

---

## 16. Weekly Health-Check Checklist

Run every week, ideally Monday morning.

### Ingestion pipeline health

- [ ] **Jobs stuck in validating (> 10 minutes):**
  ```sql
  SELECT id, asset_id, claimed_at, NOW() - claimed_at AS age
  FROM avatar_ingestion_jobs
  WHERE status = 'validating'
    AND claimed_at < NOW() - INTERVAL '10 minutes';
  ```
  Expected: 0 rows. Any result: follow INC-01.

- [ ] **Jobs at retry limit:**
  ```sql
  SELECT id, asset_id, retry_count, failure_stage, failure_reason, initiated_at
  FROM avatar_ingestion_jobs
  WHERE status = 'failed_retryable'
    AND retry_count >= 3
  ORDER BY initiated_at DESC;
  ```
  Review each. Communicate to the relevant artist or content team.

- [ ] **Permanent failures this week:**
  ```sql
  SELECT asset_id, failure_stage, COUNT(*) AS count
  FROM avatar_ingestion_jobs
  WHERE status = 'failed_permanent'
    AND completed_at > NOW() - INTERVAL '7 days'
  GROUP BY asset_id, failure_stage
  ORDER BY count DESC;
  ```
  Review patterns. Recurring `stage-2-naming` failures suggest artist documentation is unclear.

- [ ] **Orphan pending jobs (> 24 hours, no events):**
  ```sql
  SELECT j.id, j.asset_id, j.initiated_by, j.initiated_at
  FROM avatar_ingestion_jobs j
  LEFT JOIN avatar_ingestion_events e ON e.job_id = j.id
  WHERE j.status = 'pending'
    AND j.initiated_at < NOW() - INTERVAL '24 hours'
    AND e.id IS NULL;
  ```
  Record count for trending. No action needed unless count is growing week-over-week.

### Onboarding and review health

- [ ] **Assets blocked in review queue:**
  ```sql
  SELECT asset_id, COUNT(*) AS open_items,
         MIN(created_at) AS oldest_item
  FROM avatar_asset_review_queue
  WHERE status = 'pending'
  GROUP BY asset_id
  ORDER BY oldest_item ASC;
  ```
  Any item older than 7 days should be escalated to the reviewer.

- [ ] **Assets in approved status (not yet promoted) older than 7 days:**
  ```sql
  SELECT asset_id, last_modified_at, last_modified_by
  FROM avatar_assets
  WHERE current_status = 'approved'
    AND last_modified_at < NOW() - INTERVAL '7 days'
  ORDER BY last_modified_at ASC;
  ```
  Stale approved assets may indicate the promotion workflow was abandoned. Follow up with the content team.

### Data integrity

- [ ] **M-2 drift check:**
  ```sql
  SELECT COUNT(*) AS drift_count
  FROM avatar_assets
  WHERE production_enabled = TRUE
    AND (metadata->'deployment'->>'production_enabled')::boolean IS DISTINCT FROM TRUE;
  ```
  Expected: 0. Any positive count: follow INC-08 for each affected asset.

- [ ] **Production assets with NULL storage_path:**
  ```sql
  SELECT asset_id, current_status, production_enabled
  FROM avatar_assets
  WHERE production_enabled = TRUE
    AND storage_path IS NULL;
  ```
  Expected: 0. A NULL `storage_path` on a production asset means Stage 11's `setAssetStoragePath()` write failed. Follow INC-09.

- [ ] **DB triggers still active** (same query as post-deploy checklist):
  ```sql
  SELECT trigger_name FROM information_schema.triggers
  WHERE trigger_schema = 'public'
    AND trigger_name IN (
      'trg_no_update_validation_runs',
      'trg_no_delete_validation_runs',
      'trg_no_update_ingestion_events',
      'trg_no_delete_ingestion_events',
      'trg_avatar_assets_production_gate',
      'trg_avatar_assets_status_transition'
    );
  ```
  Expected: 6 rows. Missing triggers = critical escalation.

### Storage

- [ ] **Bucket configuration unchanged:**
  ```sql
  SELECT id, public, file_size_limit, allowed_mime_types
  FROM storage.buckets
  WHERE id IN ('avatar-staging', 'avatar-assets', 'avatar-thumbnails');
  ```
  Verify against expected values in Section 5.

- [ ] **Production asset count is consistent:**
  ```sql
  SELECT
    (SELECT COUNT(*) FROM avatar_assets WHERE production_enabled = TRUE) AS db_production_count,
    (SELECT COUNT(*) FROM avatar_ingestion_artifacts WHERE artifact_type = 'glb_production' AND status = 'promoted') AS artifact_promoted_count;
  ```
  These counts may legitimately differ (one asset may have been ingested multiple times, producing multiple promoted GLB artifacts). A `db_production_count` that is higher than `artifact_promoted_count` indicates assets that exist in the onboarding system but had their GLB promoted by an older pipeline version. Record the delta and trend it.

### Summary report fields to record weekly

| Metric | This week | Previous week | Delta |
|---|---|---|---|
| Jobs completed (successful) | | | |
| Jobs failed_permanent | | | |
| Jobs at retry limit | | | |
| Open review queue items | | | |
| M-2 drift count | | | |
| Production assets total | | | |
| Approved assets pending promotion | | | |

---

*End of runbook. Classification: A- — Production-safe with accepted defect M-2.*
