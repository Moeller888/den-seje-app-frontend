# Avatar Generation Pipeline — Batch Test Plan

**Pipeline version:** v1  
**Valid slots:** `hat` only (DB constraint `generation_jobs_slot_valid` — extend before testing other slots)  
**Stale threshold:** 10 minutes  
**Retry cap:** 3 (`retry_count ≤ 3`)

---

## Environment

```
SUPABASE_URL=https://tjzbehwfagiwpwodsgwg.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service key>
```

Worker command:
```
deno run --allow-net --allow-env supabase/functions/avatar-generation/worker.ts
```

Init endpoint: `POST /functions/v1/avatar-generation/init`  
Status endpoint: `GET /functions/v1/avatar-generation/status?job_id=<id>`  
Retry endpoint: `POST /functions/v1/avatar-generation/retry`

---

## Sequential Tests

**Setup:** 10 jobs, 1 worker, all `slot: hat`, varied prompts and `initiated_by` values.

### Execution

1. Submit 10 `/init` requests with distinct `generation_prompt` values.
2. Start 1 worker process.
3. Wait until all 10 jobs report `status: complete`.
4. Kill worker.

### Expected outcomes

| Field | Expected |
|---|---|
| `status` | `complete` for all 10 |
| `completed_at` | non-null for all 10 |
| `resulting_asset_id` | equals `target_asset_id` for each job |
| `onboarding_validation_run_id` | non-null UUID for all 10 |
| `failure_stage` / `failure_reason` | null |
| `retry_count` | `0` for all |
| `version` | ≥ 3 (claim → setGeneratedFiles → complete = 3 increments) |
| Event log per job | stage-1 through stage-8 + pipeline-complete, all `passed` |
| `avatar_assets` | 10 new rows, one per job |

### Verification queries

```sql
SELECT status, COUNT(*) FROM avatar_generation_jobs
  WHERE initiated_by LIKE 'batch-seq-%' GROUP BY status;
-- Expected: complete 10

SELECT COUNT(*) FROM avatar_generation_jobs
  WHERE initiated_by LIKE 'batch-seq-%'
    AND resulting_asset_id IS NULL;
-- Expected: 0

SELECT COUNT(*) FROM avatar_generation_jobs
  WHERE initiated_by LIKE 'batch-seq-%'
    AND onboarding_validation_run_id IS NULL;
-- Expected: 0
```

---

## Concurrent Tests

**Setup:** 20 jobs, 2 worker processes running simultaneously.

### Execution

1. Submit 20 `/init` requests.
2. Start worker A and worker B in separate terminals simultaneously.
3. Wait until all 20 jobs report a terminal status (`complete` or `failed_*`).
4. Kill both workers.

### Expected outcomes

| Assertion | Expected |
|---|---|
| Each job processed by exactly one worker | No job has duplicate `stage-1-claim` events in `avatar_generation_events` |
| No two jobs write the same `resulting_asset_id` | `generation_jobs_resulting_asset_id_unique` constraint holds — no DB errors |
| CAS races resolved correctly | Jobs lost to CAS miss end as `failed_retryable`, picked up on next worker poll |
| Total terminal jobs | 20 — no job stuck in `generating` |
| No duplicate `avatar_assets` rows | `asset_id UNIQUE` on `avatar_assets` holds |

### Key invariants to check

```sql
-- No job has more than one "passed" claim event
SELECT job_id, COUNT(*) FROM avatar_generation_events
  WHERE stage = 'stage-1-claim' AND outcome = 'passed'
    AND job_id IN (SELECT id FROM avatar_generation_jobs WHERE initiated_by LIKE 'batch-conc-%')
  GROUP BY job_id
  HAVING COUNT(*) > 1;
-- Expected: 0 rows

-- Version monotonically increased (no CAS regression)
SELECT id, version FROM avatar_generation_jobs
  WHERE initiated_by LIKE 'batch-conc-%' AND status = 'complete'
  ORDER BY completed_at;
```

---

## Failure Injection

### F-1 — Duplicate `target_asset_id`

**Mechanism:** Manually `INSERT` a row into `avatar_generation_jobs` with a `target_asset_id` equal to an existing job's value before calling `/init` with the same derived ID.

**Execution:**
1. Note the `target_asset_id` of a completed job (`hat_gen_XXXXXXXX`).
2. Submit a new `/init` with a job UUID whose first 8 hex chars match (`XXXXXXXX-...`).

**Expected outcome:**
- `/init` fails at `createGenerationJob` with unique constraint violation on `generation_jobs_target_asset_id_unique`.
- No job row is created.
- No pipeline stages execute.

---

### F-2 — Missing staging file (stage-7 bucket miss)

**Mechanism:** Submit a job, let it complete stage-3 (files written to `avatar-generation-staging`), manually delete `{job_id}/generated.glb` from the staging bucket, then trigger stage-7 by restarting the pipeline (or via retry after manual `failed_retryable` insert).

**Expected outcome:**
- stage-7-onboarding fails with a storage `File not found` or HTTP 4xx error from onboarding.
- `failure_stage: stage-7-onboarding`.
- `status: failed_retryable` (stage-7 failures are retryable).
- Worker picks it up and retries — fails again at same point if file remains absent.
- After 3 retries: `retry_count: 3`, worker no longer picks it up.
- `status: failed_retryable` persists (worker cap, not `failed_permanent`).

---

### F-3 — Onboarding validation failure

**Mechanism:** Submit a job, intercept the metadata before stage-7 by temporarily deploying a version of the pipeline where `buildOnboardingMetadata` emits a field that violates `metadata.schema.json` (e.g., inject `schema_version: "9.9"`).

**Expected outcome:**
- stage-7-onboarding returns `success: false`.
- `failure_stage: stage-7-onboarding`.
- `failure_reason` contains the validation error message.
- `status: failed_retryable`.
- `validation_errors` recorded in `failure_details`.

---

### F-4 — Invalid slot (DB constraint)

**Mechanism:** Attempt to insert a job with `slot: 'shirt'` via direct DB insert (not `/init`, which does not validate slot itself).

**Expected outcome:**
- INSERT rejected by `generation_jobs_slot_valid` constraint.
- No row created.
- No pipeline interaction.

> **Note:** Once additional slots are added to the DB constraint, this test becomes a happy-path regression instead.

---

## Recovery Tests

### R-1 — Kill worker mid-stage (stuck job recovery)

**Execution:**
1. Submit 1 job, start worker.
2. Kill worker process (`taskkill /F /IM deno.exe`) while job is in `status: generating`.
3. Wait 10 minutes (stale threshold).
4. Start a new worker.

**Expected outcome:**
- New worker calls `recoverStuckJob` on the stuck job.
- `status` transitions: `generating` → `failed_retryable`.
- A `timeout-recovery` event is written to `avatar_generation_events` with `outcome: warning`.
- Worker immediately picks up the job for retry.
- Job completes on retry: `status: complete`, `retry_count: 1`.

**Verification:**
```sql
SELECT stage, outcome, message FROM avatar_generation_events
  WHERE job_id = '<job_id>' AND stage = 'timeout-recovery';
-- Expected: 1 row, outcome = 'warning'
```

---

### R-2 — Retry behavior and cap

**Execution:**
1. Submit 1 job, manually set it to `failed_retryable` with `retry_count: 2` via direct DB update (or use the `/retry` endpoint).
2. Start worker — job should be picked up and attempted once.
3. If it fails again: verify `retry_count: 3`, `status: failed_retryable`.
4. Start worker again — job must NOT be picked up (`retry_count < 3` guard in worker).

**Expected outcome:**

| State | `status` | `retry_count` | Worker picks up? |
|---|---|---|---|
| After 1st retry | `failed_retryable` or `complete` | 1 | — |
| After 2nd retry | `failed_retryable` or `complete` | 2 | — |
| After 3rd retry | `failed_retryable` | 3 | **No** |

**DB constraint verification:**
```sql
-- retry_count must never exceed 3
SELECT id FROM avatar_generation_jobs WHERE retry_count > 3;
-- Expected: 0 rows
```

---

### R-3 — Concurrent stuck-job recovery race

**Execution:**
1. Create a stuck job (kill worker mid-stage, wait 10 minutes).
2. Start 2 workers simultaneously.

**Expected outcome:**
- Exactly one worker successfully recovers the stuck job (`recoverStuckJob` returns 1 row).
- The other worker's `recoverStuckJob` call returns 0 rows (CAS miss on version).
- Job is retried exactly once, not twice.
- No duplicate `timeout-recovery` events.

---

## Verification Checklist

Run after every test group.

### Status transitions

- [ ] `pending` → `generating`: `claimed_at` becomes non-null, `version` increments
- [ ] `generating` → `complete`: `completed_at` non-null, `resulting_asset_id` set, `version` increments
- [ ] `generating` → `failed_retryable`: `completed_at` NULL, `failure_stage` set
- [ ] `generating` → `failed_permanent`: `completed_at` non-null, `failure_stage` set
- [ ] `failed_retryable` → `pending`: `claimed_at` NULL, failure fields cleared, `retry_count` increments

### Field correctness

- [ ] `completed_at` non-null **only** for `status IN ('complete', 'failed_permanent', 'cancelled')` (D-107 added `cancelled` as a third terminal state; it is administrative and the pipeline never produces it, so a batch run should still see none)
- [ ] `retry_count` never exceeds 3
- [ ] `resulting_asset_id` equals `target_asset_id` on every `complete` job
- [ ] `resulting_asset_id` NULL on every non-`complete` job
- [ ] `onboarding_validation_run_id` non-null on every `complete` job
- [ ] `claimed_at` non-null on every non-`pending` job
- [ ] `claimed_at` NULL on every `pending` job

### Uniqueness / no duplicates

- [ ] No two `complete` jobs share the same `resulting_asset_id`
- [ ] No job has more than one `stage-1-claim: passed` event
- [ ] No duplicate rows in `avatar_assets` for the same `asset_id`

### No stuck jobs

```sql
SELECT id, claimed_at FROM avatar_generation_jobs
  WHERE status = 'generating'
    AND claimed_at < NOW() - INTERVAL '15 minutes';
-- Expected: 0 rows after all tests complete
```

### CAS / version correctness

```sql
-- version must always be > 0 for non-pending jobs
SELECT id, version, status FROM avatar_generation_jobs
  WHERE status != 'pending' AND version = 0;
-- Expected: 0 rows

-- complete jobs must have version >= 3 (claim + setGeneratedFiles + complete = 3 increments)
SELECT id, version FROM avatar_generation_jobs
  WHERE status = 'complete' AND version < 3;
-- Expected: 0 rows
```

### No orphaned staging files

After all tests complete, staging bucket `avatar-generation-staging` should contain only files for jobs that are currently `generating` or recently completed. Verify by listing the bucket and cross-referencing against active job IDs.

---

## Known v1 Limitations

| Limitation | Reason | Resolution |
|---|---|---|
| All jobs must use `slot: hat` | DB constraint `generation_jobs_slot_valid` | Extend constraint for new slots |
| Mixed-slot tests deferred | See above | Re-run sequential + concurrent tests when slots added |
| Stage-3 uses stub GLB (48 B) | Real AI provider not integrated | Replace `generateMinimalGlb()` when provider is live |
| Stage-4 copyright check is stub | Always returns `clear` | Replace `checkCopyright()` stub with real provider |
