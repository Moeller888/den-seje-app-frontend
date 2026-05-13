# Backend Validation Rules — Avatar Asset Metadata
### DEN SEJE APP · Avatar Creator Production Pipeline v1

---

> **Scope**
> These rules run **after** JSON Schema validation (`metadata.schema.json`) has passed.
> JSON Schema enforces structure, types, enums, and conditional field constraints.
> These rules enforce cross-field business logic that JSON Schema draft-07 cannot express.
> A metadata file must pass **both** layers before any asset may proceed to production.

---

## Execution Model

Schema validation and business rule validation are two discrete steps.
They must not be merged.

```
INPUT: metadata.json
  │
  ▼
[STEP 1] JSON Schema validation (metadata.schema.json)
  │  FAIL → reject immediately, return schema errors
  │  PASS → continue
  ▼
[STEP 2] Business rule validation (this document)
  │  HARD FAIL → reject, return rule violations
  │  WARNING   → log, allow progression to non-production stages only
  │  MANUAL REVIEW → block production, flag for human sign-off
  │  PASS → continue
  ▼
OUTPUT: validated metadata, cleared for target stage
```

A file that fails Step 1 must never reach Step 2.
A file that fails Step 2 must never reach production.

---

## Severity Levels

Every rule in this document carries one of three severity levels.

---

### HARD FAIL

**Definition**: The asset is structurally invalid, logically inconsistent, or unsafe for production.
Validation halts immediately. The asset is rejected. No further processing occurs.

**Consequence**:
- Asset does not proceed to any stage
- Error is returned with the specific rule ID and field path that caused the failure
- Asset must be corrected and resubmitted from scratch through the full validation pipeline

---

### WARNING

**Definition**: The asset contains a non-blocking inconsistency that does not prevent development-stage processing but must be resolved before the asset advances to `staging`, `canary`, or `production`.

**Consequence**:
- Asset may remain at `draft` or `review` status
- Warning is logged with rule ID and field path
- Asset cannot advance to `approved` or `production` status while warnings exist
- Warnings do not auto-resolve — they require a human to correct the field and resubmit

---

### MANUAL REVIEW REQUIRED

**Definition**: The asset contains a condition that automated systems cannot safely resolve alone. A qualified human reviewer must inspect the asset before it may proceed.

**Consequence**:
- Asset is placed in a manual review queue
- No further automated progression until a human reviewer explicitly clears the flag
- The reviewing party and timestamp must be recorded in `audit.review_notes`
- After manual clearance, the full validation pipeline runs again from Step 1

---

## Rule Reference Format

Each rule is defined as:

```
RULE ID      — unique identifier for logging and error reporting
Severity     — HARD FAIL / WARNING / MANUAL REVIEW REQUIRED
Condition    — the logical condition that must be true
Violation    — what constitutes a failure of this rule
Action       — what the system does on failure
```

---

## Section 1 — Cross-Field Numeric Validation

---

### RULE-NUM-001
**Severity**: HARD FAIL
**Condition**: `technical.polycount_actual <= technical.polycount_max`
**Violation**: `polycount_actual` exceeds `polycount_max`
**Action**: Reject immediately. Return both values in the error response. Asset must be re-exported with correct geometry before resubmission.

---

### RULE-NUM-002
**Severity**: HARD FAIL
**Condition**: `technical.file_size_kb_actual <= technical.file_size_kb_max`
**Violation**: `file_size_kb_actual` exceeds `file_size_kb_max`
**Action**: Reject immediately. Return both values in the error response. Asset must be re-exported or re-textured before resubmission.

---

### RULE-NUM-003
**Severity**: HARD FAIL
**Condition**: `technical.polycount_actual > 0`
**Violation**: `polycount_actual` is zero
**Action**: Reject. A value of zero indicates the field was not filled in. Template default was not replaced.

---

### RULE-NUM-004
**Severity**: HARD FAIL
**Condition**: `technical.file_size_kb_actual > 0`
**Violation**: `file_size_kb_actual` is zero
**Action**: Reject. A value of zero indicates the field was not filled in. Template default was not replaced.

---

### RULE-NUM-005
**Severity**: WARNING
**Condition**: `technical.polycount_actual <= (technical.polycount_max * 0.5)`
**Violation**: `polycount_actual` is less than 50% of `polycount_max`
**Action**: Log warning. Asset may be under-detailed for its slot budget. Does not block progression but must be reviewed by the assigned artist before `approved` status is granted.

---

## Section 2 — Slot-Specific Attachment Validation

These rules define the exact attachment configuration permitted for each slot.
Any deviation from the slot contract is a hard failure.

---

### RULE-ATT-001 — Hat slot contract
**Severity**: HARD FAIL
**Condition**: When `identity.slot = "hat"`, ALL of the following must be true:
- `technical.attachment_type = "parented"`
- `technical.attachment_bone = "attach_head"`
- `technical.rig_required = false`

**Violation**: Any of the three fields does not match the required value for the `hat` slot.
**Action**: Reject. Return the slot, the expected values, and the actual values in the error response.

---

### RULE-ATT-002 — Shirt slot contract
**Severity**: HARD FAIL
**Condition**: When `identity.slot = "shirt"`, ALL of the following must be true:
- `technical.attachment_type = "skinned"`
- `technical.attachment_bone = null`
- `technical.rig_required = true`

**Violation**: Any of the three fields does not match the required value for the `shirt` slot.
**Action**: Reject. Return the slot, the expected values, and the actual values in the error response.

---

### RULE-ATT-003 — Shoe slot contract
**Severity**: HARD FAIL
**Condition**: When `identity.slot = "shoe"`, ALL of the following must be true:
- `technical.attachment_type = "parented"`
- `technical.attachment_bone = "attach_foot_L"` OR `technical.attachment_bone = "attach_foot_R"`
- `technical.rig_required = false`

**Violation**: `attachment_type` is not `"parented"`, `attachment_bone` is not one of the two permitted foot bones, or `rig_required` is not `false`.
**Action**: Reject. Return the slot, the expected values, and the actual values in the error response.

> Note for engineering: A shoe asset file covers both feet. The metadata declares the primary attachment bone. The integration layer is responsible for mirroring to the paired bone. This validation only checks that the declared bone is a valid foot bone.

---

### RULE-ATT-004 — Inventory slot contract
**Severity**: HARD FAIL
**Condition**: When `identity.slot = "inventory"`, ALL of the following must be true:
- `technical.attachment_type = "parented"`
- `technical.attachment_bone = "attach_hand_R"`
- `technical.rig_required = false`

**Violation**: Any of the three fields does not match the required value for the `inventory` slot.
**Action**: Reject. Return the slot, the expected values, and the actual values in the error response.

---

### RULE-ATT-005 — No reserved future bones in v1
**Severity**: HARD FAIL
**Condition**: `technical.attachment_bone` must not be `"attach_hand_L"` in v1
**Violation**: `attachment_bone = "attach_hand_L"` is set on any v1 asset
**Action**: Reject. `attach_hand_L` is reserved for a future slot that does not exist in v1. No v1 asset may use it.

---

## Section 3 — Asset Identity Consistency

---

### RULE-ID-001 — Asset ID prefix must match slot
**Severity**: HARD FAIL
**Condition**: The prefix segment of `identity.asset_id` (everything before the first underscore) must exactly equal `identity.slot`
**Violation**: `asset_id` prefix does not match `slot`

Examples of violation:
- `asset_id = "hat_beanie_navy"` with `slot = "shirt"` → FAIL
- `asset_id = "shoe_lowtop_white"` with `slot = "inventory"` → FAIL

**Action**: Reject. Return the declared slot and the prefix extracted from `asset_id`.

---

### RULE-ID-002 — Asset ID must not contain version suffix
**Severity**: HARD FAIL
**Condition**: `identity.asset_id` must not contain `_v` followed by digits
**Violation**: `asset_id` includes a version suffix (e.g. `hat_beanie_navy_v1`)
**Action**: Reject. The version is tracked in `identity.version`, not in `asset_id`. Version suffixes in the ID cause duplicate asset registration.

---

### RULE-ID-003 — Version format consistency
**Severity**: HARD FAIL
**Condition**: `identity.version` must match `^\d+\.\d+$` (already enforced by schema) AND the major version must be `1` for all v1 pipeline assets
**Violation**: Major version is not `1` for a v1 pipeline asset
**Action**: Reject. Assets with a major version other than 1 must not enter the v1 pipeline.

---

### RULE-ID-004 — Schema version must match pipeline version
**Severity**: HARD FAIL
**Condition**: `schema_version` must be `"1.0"`
**Violation**: Any other value
**Action**: Reject. A different schema version indicates the asset was created against a different pipeline spec and must be re-validated under the correct schema.

---

### RULE-ID-005 — Asset ID must not contain uppercase characters
**Severity**: HARD FAIL
**Condition**: `identity.asset_id` must match `^[a-z0-9_]+$` with no uppercase
**Violation**: Any uppercase character present in `asset_id`
**Action**: Reject. Naming conventions require strict lowercase. Mixed-case IDs cause filesystem and database conflicts.

---

## Section 4 — Production Release Consistency

---

### RULE-REL-001 — production_enabled requires status approved or production
**Severity**: HARD FAIL
**Condition**: If `deployment.production_enabled = true`, then `identity.status` must be `"approved"` or `"production"`
**Violation**: `production_enabled` is `true` while `status` is `"draft"`, `"review"`, or `"deprecated"`
**Action**: Reject. An asset cannot be enabled for production unless it has passed the full approval workflow.

---

### RULE-REL-002 — production_enabled requires rollout_stage not none
**Severity**: HARD FAIL
**Condition**: If `deployment.production_enabled = true`, then `deployment.rollout_stage` must not be `"none"`
**Violation**: `production_enabled` is `true` while `rollout_stage` is `"none"`
**Action**: Reject. A production-enabled asset must have an explicit rollout target. `"none"` means the asset has not been assigned to a release wave.

---

### RULE-REL-003 — Deprecated assets cannot be production_enabled
**Severity**: HARD FAIL
**Condition**: If `identity.status = "deprecated"`, then `deployment.production_enabled` must be `false`
**Violation**: A deprecated asset has `production_enabled = true`
**Action**: Reject. Deprecated assets are removed from the whitelist and cannot be surfaced to users.

---

### RULE-REL-004 — Draft assets cannot have a rollout_stage
**Severity**: WARNING
**Condition**: If `identity.status = "draft"`, then `deployment.rollout_stage` should be `"none"`
**Violation**: `rollout_stage` is set to a non-`"none"` value while status is `"draft"`
**Action**: Log warning. A draft asset assigned to a rollout stage suggests a pipeline sequencing error. Does not block draft progression but must be corrected before `review` status.

---

### RULE-REL-005 — release_group must match active pipeline version
**Severity**: HARD FAIL
**Condition**: `deployment.release_group` must be `"v1"` for all assets submitted through the v1 pipeline
**Violation**: Any other value
**Action**: Reject. Assets intended for a different release group must not enter the v1 pipeline.

---

### RULE-REL-006 — production_enabled requires texture_embedded
**Severity**: HARD FAIL
**Condition**: If `deployment.production_enabled = true`, then `technical.texture_embedded` must be `true`
**Violation**: `production_enabled` is `true` while `texture_embedded` is `false`
**Action**: Reject. Assets with external texture references cannot be reliably served in production. All textures must be embedded in the `.glb` file before production release.

---

## Section 5 — Approval Consistency

---

### RULE-APR-001 — Approved status requires approved_by
**Severity**: HARD FAIL
**Condition**: If `identity.status` is `"approved"` or `"production"`, then `identity.approved_by` must be a non-empty string and must not be `null`
**Violation**: `approved_by` is `null` while status is `"approved"` or `"production"`
**Action**: Reject. No asset may hold approved or production status without a named approver on record.

---

### RULE-APR-002 — Approved status requires approved_at
**Severity**: HARD FAIL
**Condition**: If `identity.status` is `"approved"` or `"production"`, then `identity.approved_at` must be a valid date string and must not be `null`
**Violation**: `approved_at` is `null` while status is `"approved"` or `"production"`
**Action**: Reject. No asset may hold approved or production status without an approval timestamp on record.

---

### RULE-APR-003 — approved_at must not precede created_at
**Severity**: HARD FAIL
**Condition**: If both `identity.approved_at` and `identity.created_at` are non-null, then `approved_at >= created_at`
**Violation**: `approved_at` is an earlier date than `created_at`
**Action**: Reject. An asset cannot be approved before it was created. This indicates data corruption or manual field manipulation.

---

### RULE-APR-004 — approved_by must not equal created_by
**Severity**: MANUAL REVIEW REQUIRED
**Condition**: `identity.approved_by` must not equal `identity.created_by`
**Violation**: The same person created and approved the asset
**Action**: Flag for manual review. Self-approval bypasses the independent review requirement. A second qualified reviewer must confirm the approval and update `approved_by` with their own identity. Log the original `created_by` value in `audit.review_notes`.

---

### RULE-APR-005 — last_modified_at must not precede created_at
**Severity**: HARD FAIL
**Condition**: `audit.last_modified_at >= identity.created_at`
**Violation**: `last_modified_at` is an earlier date than `created_at`
**Action**: Reject. Indicates data corruption or clock manipulation in the submission system.

---

## Section 6 — Forbidden Reference Escalation

---

### RULE-FRB-001 — Any true forbidden reference blocks production
**Severity**: HARD FAIL
**Condition**: All values in `forbidden_reference_check` must be `false` when `deployment.production_enabled = true`
**Violation**: One or more `forbidden_reference_check` values are `true` while `production_enabled = true`
**Action**: Reject immediately. Return the specific keys that are `true`. The asset must be redesigned and resubmitted through the full pipeline from concept stage.

---

### RULE-FRB-002 — Any true forbidden reference blocks approved status
**Severity**: HARD FAIL
**Condition**: All values in `forbidden_reference_check` must be `false` when `identity.status` is `"approved"` or `"production"`
**Violation**: One or more `forbidden_reference_check` values are `true` while status is `"approved"` or `"production"`
**Action**: Reject. An asset with a confirmed forbidden reference cannot hold approved or production status regardless of `production_enabled` state.

---

### RULE-FRB-003 — True forbidden reference with approved copyright review
**Severity**: HARD FAIL
**Condition**: If any `forbidden_reference_check` value is `true`, then `validation.copyright_review_passed` must be `false`
**Violation**: A forbidden reference is flagged as `true` while `copyright_review_passed` is also `true`
**Action**: Reject. A passed copyright review is logically inconsistent with a confirmed forbidden reference. One or both values were set incorrectly. Both fields must be reviewed and corrected.

---

### RULE-FRB-004 — Elevated forbidden reference requires review_notes
**Severity**: MANUAL REVIEW REQUIRED
**Condition**: If any `forbidden_reference_check` value is `true`, then `audit.review_notes` must be a non-null, non-empty string
**Violation**: A forbidden reference is flagged but `audit.review_notes` is `null` or empty
**Action**: Flag for manual review. Any identified forbidden reference must be documented. The review notes must describe what was identified and by whom. This creates an audit trail for the redesign decision.

---

## Section 7 — Validation Completeness

---

### RULE-CMP-001 — Production requires all validation flags true
**Severity**: HARD FAIL
**Condition**: If `deployment.production_enabled = true`, then all of the following must be `true`:
- `validation.copyright_review_passed`
- `validation.school_safe_review_passed`
- `validation.thumbnail_readability_passed`
- `validation.clipping_test_passed`
- `validation.browser_validation_passed`
- `validation.qa_approved`

**Violation**: Any of the above is `false` while `production_enabled = true`
**Action**: Reject. Return the list of failed validation flags.

---

### RULE-CMP-002 — All validation flags false with approved status
**Severity**: HARD FAIL
**Condition**: If `identity.status` is `"approved"` or `"production"`, then `validation.qa_approved` must be `true`
**Violation**: `qa_approved` is `false` while status is `"approved"` or `"production"`
**Action**: Reject. QA sign-off is the final gate before approved status. It cannot be bypassed.

---

### RULE-CMP-003 — whitelist_approved required for production
**Severity**: HARD FAIL
**Condition**: If `deployment.production_enabled = true`, then `classification.whitelist_approved` must be `true`
**Violation**: `whitelist_approved` is `false` while `production_enabled = true`
**Action**: Reject. Only explicitly whitelisted assets may be served to users. This rule enforces the whitelist-only architecture of the platform.

---

### RULE-CMP-004 — school_safe required for production
**Severity**: HARD FAIL
**Condition**: If `deployment.production_enabled = true`, then `classification.school_safe` must be `true`
**Violation**: `school_safe` is `false` while `production_enabled = true`
**Action**: Reject immediately. No asset marked as non-school-safe may reach production on a school-based platform under any circumstances.

---

### RULE-CMP-005 — school_safe_review_passed required for school_safe true
**Severity**: HARD FAIL
**Condition**: If `classification.school_safe = true`, then `validation.school_safe_review_passed` must also be `true`
**Violation**: `school_safe` is `true` but `school_safe_review_passed` is `false`
**Action**: Reject. The `school_safe` classification flag must be the outcome of a completed review, not an assumed default.

---

## Section 8 — Recommended Backend Execution Order

Run validation steps in this exact sequence.
Stop and return errors at the first hard failure.
Collect all warnings and manual review flags before returning them together.

```
Step 1   RULE-ID-004    Schema version match
Step 2   RULE-ID-001    Asset ID prefix matches slot
Step 3   RULE-ID-002    Asset ID has no version suffix
Step 4   RULE-ID-005    Asset ID is lowercase only
Step 5   RULE-ID-003    Version major is 1
Step 6   RULE-NUM-003   polycount_actual is non-zero
Step 7   RULE-NUM-004   file_size_kb_actual is non-zero
Step 8   RULE-NUM-001   polycount_actual <= polycount_max
Step 9   RULE-NUM-002   file_size_kb_actual <= file_size_kb_max
Step 10  RULE-ATT-001   Slot-attachment contract: hat
         RULE-ATT-002   Slot-attachment contract: shirt
         RULE-ATT-003   Slot-attachment contract: shoe
         RULE-ATT-004   Slot-attachment contract: inventory
         RULE-ATT-005   No reserved future bones in v1
Step 11  RULE-APR-003   approved_at not before created_at
         RULE-APR-005   last_modified_at not before created_at
Step 12  RULE-APR-001   Approved status has approved_by
         RULE-APR-002   Approved status has approved_at
Step 13  RULE-FRB-003   True forbidden reference inconsistent with passed review
         RULE-FRB-001   Forbidden references block production
         RULE-FRB-002   Forbidden references block approved status
Step 14  RULE-REL-003   Deprecated assets not production_enabled
         RULE-REL-001   production_enabled requires approved/production status
         RULE-REL-002   production_enabled requires rollout_stage not none
         RULE-REL-005   release_group is v1
         RULE-REL-006   production_enabled requires texture_embedded
Step 15  RULE-CMP-004   school_safe required for production
         RULE-CMP-003   whitelist_approved required for production
         RULE-CMP-005   school_safe_review_passed consistent with school_safe
         RULE-CMP-001   All validation flags true for production
         RULE-CMP-002   qa_approved true for approved status
Step 16  RULE-NUM-005   polycount_actual low relative to budget    [WARNING]
         RULE-REL-004   Draft with non-none rollout_stage          [WARNING]
Step 17  RULE-APR-004   Self-approval check                        [MANUAL REVIEW]
         RULE-FRB-004   Forbidden reference without review_notes   [MANUAL REVIEW]
```

Steps 1–15 are hard failures. Processing halts at the first failure in each step.
Steps 16–17 collect non-blocking results and return them alongside the validation outcome.

---

## Error Response Contract

The backend must return errors in a consistent, machine-readable structure.

A failing response must include at minimum:

```
{
  "valid": false,
  "asset_id": "<value from metadata or null if missing>",
  "errors": [
    {
      "rule_id": "<RULE-XXX-000>",
      "severity": "<HARD_FAIL | WARNING | MANUAL_REVIEW_REQUIRED>",
      "field": "<dot.notation.path>",
      "message": "<human-readable description>",
      "expected": "<expected value or condition>",
      "actual": "<actual value found>"
    }
  ]
}
```

A passing response must include:

```
{
  "valid": true,
  "asset_id": "<value>",
  "warnings": [],
  "manual_review_flags": []
}
```

Warnings and manual review flags must always be present as arrays, even when empty.
A response with `"valid": true` but non-empty `"manual_review_flags"` means the asset is structurally valid but cannot advance past `review` status without human intervention.

---

## Rule Amendment Policy

Rules in this document may not be removed or weakened without Product Owner approval.
New rules may be added at any time.
Any amendment must increment the document version, record the amendment date, and record the author.

| Document version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-04-27 | Moeller888 | Initial release |

---

*DEN SEJE APP — Avatar Creator Production Pipeline v1*
*Document version: 1.0 — backend_validation_rules.md*
