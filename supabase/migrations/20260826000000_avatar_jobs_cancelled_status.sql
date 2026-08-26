-- ============================================================================
-- Avatar generation jobs: add 'cancelled' as a terminal state, and close out
-- the abandoned May-2026 backlog with it.
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
-- ============================================================================

begin;

-- ── 1. The status allowlist ────────────────────────────────────────────────
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

-- ── 4. Close out the abandoned backlog ─────────────────────────────────────
-- 45 rows, all initiated in April–May 2026, none touched since 2026-05-10.
-- None of them produced a file, a thumbnail or a resulting asset, so nothing
-- in Storage is orphaned by this.
--
-- The prior status is preserved in failure_details. It lives ONLY in the status
-- column — avatar_generation_events records stage/outcome, not job status — so
-- overwriting it without capturing it first would permanently destroy the
-- failed_permanent/failed_retryable distinction.
--
-- The 1.222 event rows are untouched. The FK is ON DELETE RESTRICT and nothing
-- here deletes anything.
update public.avatar_generation_jobs
   set failure_details = coalesce(failure_details, '{}'::jsonb)
                         || jsonb_build_object(
                              'cancelled_from', status,
                              'cancelled_at',   now(),
                              'cancelled_by',   'migration:20260826000000',
                              'cancelled_why',  'abandoned generation backlog, closed by operator'),
       -- terminal rows need a completion timestamp; the ones that already have
       -- one (failed_permanent) keep their original, which is the truthful value.
       completed_at   = coalesce(completed_at, now()),
       status         = 'cancelled'
 where status in ('failed_permanent', 'failed_retryable', 'pending');

commit;
