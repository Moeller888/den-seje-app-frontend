-- provider_job_id persistence + raise max retry limit from 3 to 5.
--
-- PART A — provider_job_id
--   Adds a nullable TEXT column to avatar_generation_jobs.
--   The pipeline persists the external AI provider's job ID immediately after
--   the provider accepts the generation request. On retry, the pipeline checks
--   this field first:
--
--     provider_job_id NULL, generated_files NULL  → fresh call (Branch 3)
--     provider_job_id SET, generated_files NULL   → resume polling (Branch 2)
--     generated_files SET                          → files ready, skip AI (Branch 1)
--
--   This prevents duplicate provider billing when the Edge Function is killed
--   after calling the provider but before the generated files are staged.
--
--   No FK, no index, no constraints — a simple nullable field is sufficient.
--   The pipeline code enforces the write discipline.
--
-- PART B — retry limit
--   Raises the DB-enforced retry ceiling from 3 to 5.
--   The CHECK constraint must match MAX_RETRIES in database.ts (currently 5).
--   Raising it requires dropping the existing constraint and adding a new one.
--   No existing data is affected — all current rows have retry_count <= 3.

-- ── Part A: provider_job_id ───────────────────────────────────────────────────

ALTER TABLE public.avatar_generation_jobs
  ADD COLUMN IF NOT EXISTS provider_job_id TEXT;

-- ── Part B: raise retry ceiling ──────────────────────────────────────────────

ALTER TABLE public.avatar_generation_jobs
  DROP CONSTRAINT IF EXISTS generation_jobs_retry_count_max;

ALTER TABLE public.avatar_generation_jobs
  ADD CONSTRAINT generation_jobs_retry_count_max
    CHECK (retry_count <= 5);
