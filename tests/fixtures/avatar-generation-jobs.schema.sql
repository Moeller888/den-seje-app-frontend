-- A faithful replica of public.avatar_generation_jobs AS IT STANDS IN PRODUCTION,
-- i.e. BEFORE migration 20260826000000 runs. It exists so that migration can be
-- executed for real against a throwaway PostgreSQL, rather than only asserted
-- against its own source text.
--
-- PROVENANCE: the column list and all 24 CHECK constraints were read out of the
-- live database (information_schema.columns and pg_constraint) on 2026-08-26 and
-- transcribed verbatim. The point of copying all of them — not just the three the
-- migration rewrites — is that the backfill has to satisfy every one of them at
-- once. A replica carrying only the interesting constraints would prove nothing
-- about the twenty-one it left out.
--
-- WHAT IS DELIBERATELY NOT HERE: RLS, grants, pg_cron, the avatar_generation_events
-- FK and the copyright-transition trigger. None of them can be exercised by this
-- migration — it writes no events, deletes nothing, and never touches
-- copyright_review_result, which is the trigger's WHEN condition.

create table public.avatar_generation_jobs (
  id                             uuid primary key,
  target_asset_id                text        not null,
  slot                           text        not null,
  generation_prompt              text        not null,
  negative_prompt                text,
  policy_prompt                  text        not null,
  model_provider                 text        not null,
  model_version                  text        not null,
  concept_image_bucket           text,
  concept_image_path             text,
  generated_glb_bucket           text,
  generated_glb_path             text,
  generated_thumbnail_bucket     text,
  generated_thumbnail_path       text,
  status                         text        not null,
  retry_count                    integer     not null default 0,
  initiated_by                   text        not null,
  initiated_at                   timestamptz not null,
  claimed_at                     timestamptz,
  completed_at                   timestamptz,
  copyright_review_result        text,
  copyright_confidence           numeric,
  copyright_flags                jsonb,
  copyright_reviewed_by          text,
  copyright_reviewed_at          timestamptz,
  copyright_review_notes         text,
  manual_review_required         boolean     not null default false,
  manual_review_resolved_by      text,
  manual_review_resolved_at      timestamptz,
  manual_review_resolution       text,
  manual_review_resolution_notes text,
  failure_stage                  text,
  failure_reason                 text,
  failure_details                jsonb,
  resulting_asset_id             text,
  onboarding_validation_run_id   uuid,
  version                        integer     not null default 0,
  created_at                     timestamptz,
  generated_files                jsonb,
  provider_job_id                text,

  constraint generation_jobs_target_asset_id_not_empty
    check (length(trim(target_asset_id)) > 0),
  constraint generation_jobs_slot_valid
    check (slot in ('hat')),
  constraint generation_jobs_generation_prompt_not_empty
    check (length(trim(generation_prompt)) > 0),
  constraint generation_jobs_policy_prompt_not_empty
    check (length(trim(policy_prompt)) > 0),
  constraint generation_jobs_model_provider_not_empty
    check (length(trim(model_provider)) > 0),
  constraint generation_jobs_model_version_not_empty
    check (length(trim(model_version)) > 0),
  constraint generation_jobs_initiated_by_not_empty
    check (length(trim(initiated_by)) > 0),

  -- The three the migration rewrites, in their PRE-migration form.
  constraint generation_jobs_status_valid
    check (status in ('pending', 'generating', 'pending_manual_review',
                      'complete', 'failed_retryable', 'failed_permanent')),
  constraint generation_jobs_claimed_at_consistency
    check ((status = 'pending' and claimed_at is null)
        or (status <> 'pending' and claimed_at is not null)),
  constraint generation_jobs_completed_at_consistency
    check ((status not in ('complete', 'failed_permanent') and completed_at is null)
        or (status in ('complete', 'failed_permanent') and completed_at is not null)),

  constraint generation_jobs_retry_count_non_negative
    check (retry_count >= 0),
  constraint generation_jobs_retry_count_max
    check (retry_count <= 5),
  constraint generation_jobs_complete_requires_resulting_asset
    check (status is distinct from 'complete' or resulting_asset_id is not null),
  constraint generation_jobs_resulting_matches_target
    check (resulting_asset_id is null or resulting_asset_id = target_asset_id),
  constraint generation_jobs_concept_image_consistency
    check ((concept_image_bucket is null) = (concept_image_path is null)),
  constraint generation_jobs_generated_glb_consistency
    check ((generated_glb_bucket is null) = (generated_glb_path is null)),
  constraint generation_jobs_generated_thumbnail_consistency
    check ((generated_thumbnail_bucket is null) = (generated_thumbnail_path is null)),
  constraint generation_jobs_copyright_result_valid
    check (copyright_review_result is null
        or copyright_review_result in ('clear', 'manual_review', 'hard_fail')),
  constraint generation_jobs_copyright_confidence_range
    check (copyright_confidence is null
        or (copyright_confidence >= 0.000 and copyright_confidence <= 1.000)),
  constraint generation_jobs_copyright_review_atomicity
    check ((copyright_review_result is null and copyright_confidence is null
            and copyright_reviewed_by is null and copyright_reviewed_at is null)
        or (copyright_review_result is not null and copyright_reviewed_by is not null
            and copyright_reviewed_at is not null)),
  constraint generation_jobs_hard_fail_requires_failed_permanent
    check (copyright_review_result is distinct from 'hard_fail'
        or status = 'failed_permanent'),
  constraint generation_jobs_manual_review_flag_consistency
    check (manual_review_required = (copyright_review_result = 'manual_review')),
  constraint generation_jobs_pending_manual_review_requires_flag
    check (status is distinct from 'pending_manual_review' or manual_review_required = true),
  constraint generation_jobs_manual_review_resolution_atomicity
    check ((manual_review_resolved_by is null and manual_review_resolved_at is null
            and manual_review_resolution is null)
        or (manual_review_resolved_by is not null and manual_review_resolved_at is not null
            and manual_review_resolution is not null
            and manual_review_resolution in ('approved', 'rejected')
            and length(trim(manual_review_resolved_by)) > 0))
);
