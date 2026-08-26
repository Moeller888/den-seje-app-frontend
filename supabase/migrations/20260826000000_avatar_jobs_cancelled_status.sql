-- ============================================================================
-- Avatar generation jobs: add 'cancelled' as a terminal state, and close out
-- the abandoned April–May 2026 backlog with it.
--
-- WHY THIS IS A MIGRATION AND NOT AN UPDATE
-- avatar_generation_jobs is a deliberately strict state machine: 24 CHECK
-- constraints, three of which encode what a status is allowed to imply. A job
-- cannot simply be "set to cancelled" — the value is rejected by the status
-- allowlist, and two consistency constraints disagree about what the timestamp
-- columns must look like. Adding a state is a design change, so it is recorded
-- as one. See docs/project-state.md D-107.
--
-- WHAT 'cancelled' MEANS
-- An operator closed this job. It will never run again. It is distinct from
-- 'failed_permanent' (the pipeline itself reached a terminal verdict) because
-- the reason is administrative, not technical — and conflating the two would
-- destroy the record of WHY the backlog stopped.
--
-- WHY THE BACKFILL IS PINNED TO A SNAPSHOT
-- Selecting on status alone would mean "whatever is failed or pending at
-- deployment time", which is not the same set as the backlog this migration
-- was reviewed against. There is a LIVE concurrent writer: the pg_cron job
-- 'sweep-stale-generation-jobs' runs every 5 minutes (verified active in
-- production) and moves stale 'generating' jobs into 'failed_retryable' — the
-- exact status this backfill targets. A job that fails the day this deploys
-- must not be swept up in a cleanup of a 2026-05 backlog.
-- ============================================================================

begin;

-- ── 1. The status allowlist ────────────────────────────────────────────────
-- This is the first ALTER TABLE, so it takes ACCESS EXCLUSIVE on the table and
-- holds it until COMMIT. Everything below therefore runs with every other
-- reader and writer — the cron sweeper, claim_generation_job,
-- recover_stuck_job, fail_generation_job, the Edge Function, the admin page —
-- blocked at the door. See the concurrency note above section 4.
alter table public.avatar_generation_jobs
  drop constraint generation_jobs_status_valid;

alter table public.avatar_generation_jobs
  add constraint generation_jobs_status_valid
  check (status in (
    'pending',
    'generating',
    'pending_manual_review',
    'complete',
    'failed_retryable',
    'failed_permanent',
    'cancelled'
  ));

-- ── 2. completed_at ────────────────────────────────────────────────────────
-- 'cancelled' is terminal, so it carries a completion timestamp exactly like
-- 'complete' and 'failed_permanent'. The moment of cancellation is a real
-- event and is worth recording.
alter table public.avatar_generation_jobs
  drop constraint generation_jobs_completed_at_consistency;

alter table public.avatar_generation_jobs
  add constraint generation_jobs_completed_at_consistency
  check (
    (status not in ('complete', 'failed_permanent', 'cancelled') and completed_at is null)
    or
    (status in ('complete', 'failed_permanent', 'cancelled') and completed_at is not null)
  );

-- ── 3. claimed_at ──────────────────────────────────────────────────────────
-- Every other non-pending status implies a worker claimed the job. Cancellation
-- does not: a job can be cancelled while it is still sitting in the queue,
-- never having been picked up. Forcing claimed_at NOT NULL here would make the
-- row assert a claim that never happened, so 'cancelled' is exempt — it may
-- carry a claimed_at (cancelled after a worker took it) or not (cancelled from
-- the queue). Both are true states; neither is fabricated.
alter table public.avatar_generation_jobs
  drop constraint generation_jobs_claimed_at_consistency;

alter table public.avatar_generation_jobs
  add constraint generation_jobs_claimed_at_consistency
  check (
    (status = 'pending' and claimed_at is null)
    or
    (status = 'cancelled')
    or
    (status not in ('pending', 'cancelled') and claimed_at is not null)
  );

-- ── 4. Pin the target set ──────────────────────────────────────────────────
-- CONCURRENCY: there is no window between this snapshot, the assertions in
-- section 5 and the UPDATE in section 6. Three things close it, and the first
-- alone is sufficient:
--
--   (a) the ALTER TABLEs above hold ACCESS EXCLUSIVE until COMMIT, so no other
--       session can read or write this table for the rest of the transaction;
--   (b) the target ids are MATERIALISED here, once. Sections 5 and 6 both
--       address this table by id, so they cannot diverge even in principle —
--       the predicate is never evaluated twice;
--   (c) the initiated_at cutoff means a row that becomes failed_retryable or
--       pending after this deploys is out of scope by construction, because it
--       could only have been initiated after 2026-06-01.
--
-- THE PREDICATE. Every clause narrows; none widens:
--   - one of the three abandoned statuses
--   - initiated before 2026-06-01, i.e. the documented April–May backlog
--   - never promoted an asset (resulting_asset_id is null)
--   - no legacy generated-file shadow columns set
create temporary table _d107_targets on commit drop as
select id, status, generated_files, copyright_review_result, resulting_asset_id
  from public.avatar_generation_jobs
 where status in ('failed_permanent', 'failed_retryable', 'pending')
   and initiated_at               <  timestamptz '2026-06-01T00:00:00Z'
   and resulting_asset_id         is null
   and generated_glb_bucket       is null
   and generated_glb_path         is null
   and generated_thumbnail_bucket is null
   and generated_thumbnail_path   is null;

-- ── 5 & 6. Fail-closed preconditions, then the update ──────────────────────
do $$
declare
  v_total      int;
  v_perm       int;
  v_retry      int;
  v_pending    int;
  v_hard_fail  int;
  v_asset      int;
  v_gen_files  int;
  v_updated    int;
begin
  select count(*),
         count(*) filter (where status = 'failed_permanent'),
         count(*) filter (where status = 'failed_retryable'),
         count(*) filter (where status = 'pending'),
         count(*) filter (where copyright_review_result = 'hard_fail'),
         count(*) filter (where resulting_asset_id is not null),
         count(*) filter (where generated_files is not null)
    into v_total, v_perm, v_retry, v_pending, v_hard_fail, v_asset, v_gen_files
    from _d107_targets;

  -- The backlog this migration was reviewed against, to the row. Any deviation
  -- means the database is not in the state the review assumed, and the only
  -- safe response is to abort the whole transaction — constraints included.
  if v_total <> 45 then
    raise exception 'D107_PRECONDITION_TOTAL: expected exactly 45 target jobs, found %', v_total;
  end if;
  if v_perm <> 21 then
    raise exception 'D107_PRECONDITION_FAILED_PERMANENT: expected exactly 21, found %', v_perm;
  end if;
  if v_retry <> 22 then
    raise exception 'D107_PRECONDITION_FAILED_RETRYABLE: expected exactly 22, found %', v_retry;
  end if;
  if v_pending <> 2 then
    raise exception 'D107_PRECONDITION_PENDING: expected exactly 2, found %', v_pending;
  end if;

  -- A hard_fail verdict is terminal and immutable (D-042-era trigger
  -- enforce_copyright_result_transition), and generation_jobs_hard_fail_requires
  -- _failed_permanent pins such a row to failed_permanent. Cancelling one would
  -- be rejected downstream; refuse up front and say why.
  if v_hard_fail <> 0 then
    raise exception 'D107_PRECONDITION_HARD_FAIL: % target(s) carry a hard_fail copyright verdict', v_hard_fail;
  end if;

  -- Nothing in the target set was ever promoted to a live asset.
  if v_asset <> 0 then
    raise exception 'D107_PRECONDITION_RESULTING_ASSET: % target(s) reference a promoted asset', v_asset;
  end if;

  -- STAGING FILE REFERENCES ARE EXPECTED, AND THE COUNT IS PINNED.
  -- 19 of the 45 recorded generated_files pointing into avatar-generation-
  -- staging (2 failed_permanent, 16 failed_retryable, 1 pending) — the pipeline
  -- produced staging output and then failed before promotion. This migration
  -- DELETES NOTHING, so those references stay on the row and no storage object
  -- is orphaned by it. The count is asserted rather than excluded: excluding
  -- them would contradict the 45/21/22/2 shape above, and asserting it is the
  -- stricter guard, because a change in either direction aborts.
  if v_gen_files <> 19 then
    raise exception 'D107_PRECONDITION_GENERATED_FILES: expected exactly 19 targets with staging file references, found %', v_gen_files;
  end if;

  -- ── The update ───────────────────────────────────────────────────────────
  -- By id, against the set pinned in section 4. The prior status is captured
  -- into failure_details BEFORE it is overwritten: it lives ONLY in the status
  -- column — avatar_generation_events records stage/outcome, not job status —
  -- so losing it here would lose it permanently. Merged with || so nothing
  -- already in failure_details is discarded.
  update public.avatar_generation_jobs j
     set failure_details = coalesce(j.failure_details, '{}'::jsonb)
                           || jsonb_build_object(
                                'cancelled_from', j.status,
                                'cancelled_at',   now(),
                                'cancelled_by',   'migration:20260826000000',
                                'cancelled_why',  'abandoned generation backlog, closed by operator'),
         -- terminal rows need a completion timestamp; the ones that already
         -- have one (failed_permanent) keep their original, which is truthful.
         completed_at   = coalesce(j.completed_at, now()),
         status         = 'cancelled'
   where j.id in (select t.id from _d107_targets t);

  get diagnostics v_updated = row_count;

  -- The set was pinned and the table is locked, so this cannot legitimately
  -- differ. Assert it anyway: if it ever does, something is wrong that this
  -- migration does not understand, and it must not commit.
  if v_updated <> 45 then
    raise exception 'D107_ROWCOUNT: expected to cancel exactly 45 jobs, updated %', v_updated;
  end if;
end
$$;

commit;
