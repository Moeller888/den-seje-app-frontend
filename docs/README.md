# Documentation Index & Governance — Den Seje App

_Map of all project documentation: purpose, ownership, last-reviewed, status, and the
archive audit. This file is a **navigation map and governance record — not a source of truth for
any domain.** Each domain is owned by exactly one document (see the source-of-truth map below);
this index only points at them._
_Owner: project owner (solo founder). Last reviewed: 2026-06-30 (Section 157AB)._

---

## 1. How the documentation is organised

Four layers, from durable to point-in-time:

1. **Canonical foundation set** — the permanent source of truth (created in Section 157AA).
   Consult these first; the root `CLAUDE.md` → "Canonical Project Documentation" mandates it.
2. **Avatar decision register + ADRs** — the authoritative, append-only history of avatar
   architecture decisions (D-001…D-041) and the locked specifications.
3. **Pipeline ops & reference** — operational runbooks, validation rules, templates and schemas for
   the avatar asset pipeline.
4. **Avatar section docs (numbered 164x/166x/167x)** — section-by-section plans and review
   instruments. Some are forward-looking (still active), many are concluded point-in-time
   worksheets (archive candidates). See the archive audit in §4.

## 2. Canonical foundation set (Still authoritative)

| Document | Purpose (owns this domain) | Owner | Last reviewed |
|---|---|---|---|
| [PROJECT_VISION.md](./PROJECT_VISION.md) | Product vision, principles, what it is/ isn't, AI vision | Project owner | 2026-06-30 |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Technical source of truth (frontend, Supabase, DB, Edge, data flow, integration boundaries) | Project owner | 2026-06-30 |
| [ROADMAP.md](./ROADMAP.md) | Status, sections, version roadmap, priority order | Project owner | 2026-06-30 |
| [AI_GUIDELINES.md](./AI_GUIDELINES.md) | Binding rules for every AI feature | Project owner | 2026-06-30 |
| [AVATAR_SYSTEM.md](./AVATAR_SYSTEM.md) | Avatar system overview + **current avatar/activation state** | Project owner | 2026-06-30 |
| [CLAUDE_WORKFLOW.md](./CLAUDE_WORKFLOW.md) | Dev workflow, audit-first, testing, rollback, Definition of Done | Project owner | 2026-06-30 |
| `../CLAUDE.md` (repo root) | **Authoritative repo rules** (overrides all docs on conflict) | Project owner | 2026-06-30 |

## 3. Avatar register, ADRs, pipeline ops (Still authoritative)

| Document | Purpose | Status |
|---|---|---|
| [project-state.md](./project-state.md) | Avatar **decision register** D-001…D-041, risks, debt, open questions. _Status sections corrected 2026-06-30; decision history unchanged._ | Authoritative (register) |
| [avatar-vision.md](./avatar-vision.md) | Binding avatar **design goal** ("C2 Base Avatar Premium"). Locked 2026-06-14. | Authoritative (design goal) |
| [adr/ADR-163B-eye-system.md](./adr/ADR-163B-eye-system.md) | Eye system architecture (D-012). Accepted. | Authoritative (ADR) |
| [adr/ADR-163D-hybrid-raster-pipeline.md](./adr/ADR-163D-hybrid-raster-pipeline.md) | Hybrid raster pipeline (D-013…D-019). Accepted. | Authoritative (ADR) |
| [adr/ADR-163F-raster-asset-spec.md](./adr/ADR-163F-raster-asset-spec.md) | Raster asset spec / decomposition (D-020…D-031). Accepted. | Authoritative (ADR) |
| [164d-shop-pipeline.md](./164d-shop-pipeline.md) | Scalable shop item pipeline & **canonical slot/z model** (LOCKED D-034/D-035). | Authoritative (spec) |
| [164k-anchor-mask-extraction-plan.md](./164k-anchor-mask-extraction-plan.md) | Locked method (D-041) for the next code step (164L). | Authoritative (plan) |
| [167a-master-asset-raster-wiring-plan.md](./167a-master-asset-raster-wiring-plan.md) | **Plan of record** for producing + wiring the Northstar Master raster. | Authoritative (plan) |
| [167a-architecture-preservation-report.md](./167a-architecture-preservation-report.md) | **Pre-167A guardrail:** confirms 167A is an asset migration, not an avatar rewrite; lists guaranteed-unchanged components + risks. | Authoritative (guardrail) |
| [167a-step3-render-wiring-plan.md](./167a-step3-render-wiring-plan.md) | 167A step-3 render-wiring plan: raster-vs-C2 switch, Phase-1/Phase-2 stack, hair technique, eye-box, fallback (gated on WebP art). | Authoritative (plan) |
| [167a-phase2-decomposition-plan.md](./167a-phase2-decomposition-plan.md) | 167A **Phase-2** decomposition audit + implementation plan: living face/eyes/blink stack, revised raster eye-box, generated-vs-human-art split, staged cosmetic un-gating, manifest/versioning, gates (not started). | Authoritative (plan) |
| [167a-phase2-asset-brief.md](./167a-phase2-asset-brief.md) | 167A **Phase-2 asset brief (P2-0)**: exact per-layer cut-list (v2 base, face×5–7, eyes fixed/iris, eyelid, hair luminance map), filenames/dims/z/bg, generated-vs-human-art, acceptance criteria, North Star eye-box numbers, WebP + sign-off gates. | Authoritative (brief) |
| [167a-phase2-cut-guides-review-worksheet.md](./167a-phase2-cut-guides-review-worksheet.md) | 167A **Phase-2 cut-guide review worksheet (P2-0)**: human PASS/FAIL review of `extract-phase2-cut-guides.mjs` artifacts + the **Phase-2-scoped eye-box sign-off** for the runtime rig (plan §13 gate 1). | Draft (review instrument) |
| [167a-phase2-artist-handoff.md](./167a-phase2-artist-handoff.md) | 167A **Phase-2 artist handoff**: practical human-art brief for the decomposed layers (v2 base, face×5–7, eyes fixed/iris, eyelid, hair luminance map) — filenames/dims/bg, what stays identical vs removed, approved eye-box, 164B.3 acceptance, painter/delivery/rejection checklists, AI-forbidden. | Authoritative (handoff) |
| [167a-phase2-base-recovery-decision.md](./167a-phase2-base-recovery-decision.md) | 167A **Phase-2 base recovery decision (D-043; REVISED 2026-07-06)**: iter7 invalidated (bust/chest-plate); Gate-2 CONDITIONAL PASS withdrawn; `recovery-base-v1-blankface.png` adopted as a **candidate registered base-layer source** (registered to the frozen Master by a +25/+285 translation; **not a Master replacement** — Master stays the canonical datum, D-032 preserved; not passed — needs registration + feet-completion + neutral outfit + 164B.3). | Authoritative (decision) |
| [167a-phase2-gate2a-registration-plan.md](./167a-phase2-gate2a-registration-plan.md) | 167A **Phase-2 Gate 2A registration plan (2026-07-06)**: narrow, deterministic, review-first phase — register `recovery-base-v1-blankface.png` into the Master frame (translate **(−25, −285)**), feet-completion audit, review-only composites, deterministic validation report. Excludes outfit/face/eyes/eyelid/hair/runtime/promotion; **does not satisfy Gate 2 by itself**. Master stays canonical datum (D-032 preserved); `AVATAR_R2` false. | Authoritative (plan) |
| [167a-phase2-gate2a-registration-review.md](./167a-phase2-gate2a-registration-review.md) | 167A **Phase-2 Gate 2A registration review (2026-07-06)**: sign-off review of `tools/avatar/build-gate2a-registration.mjs` output — **Gate 2A PASS — ✅ owner-accepted/countersigned 2026-07-07** (IoU 0.9949, offset direction correct, expected crown/face/feet diffs, feet region y1251–1508 clearly identified). **Gate 2 remains REOPENED / UNDER RECOVERY (NOT satisfied); Gate 3 PAUSED; `AVATAR_R2` false; no promotion.** Next: lower-leg/feet completion decision → neutral outfit plan. | Authoritative (review) |
| [167a-phase2-feet-completion-decision.md](./167a-phase2-feet-completion-decision.md) | 167A **Phase-2 feet/lower-leg completion decision (post Gate 2A, 2026-07-06)**: **defer** completion into the neutral-outfit/base-assembly step (Option B), guided by Option D (Master body/lower-legs/feet + recovery head/blank-face); **no completed base now**; Master = authoritative body/feet source (D-032 preserved). Gate 2 remains REOPENED / UNDER RECOVERY (not satisfied); Gate 3 PAUSED; `AVATAR_R2` false. Next: neutral-outfit/base-assembly planning, not face/eyes/hair. | Authoritative (decision) |
| [167a-phase2-neutral-outfit-base-assembly-plan.md](./167a-phase2-neutral-outfit-base-assembly-plan.md) | 167A **Phase-2 neutral-outfit / base-assembly plan (2026-07-07)**: accepted **strategy B** — Master body/lower-legs/feet (authoritative geometry) + recovery head/bald-scalp/blank-face, then **one masked neutral-outfit reconstruction pass**. Neutral target = light-grey short-sleeve tee / charcoal straight trousers / light-grey low sneakers. **Short sleeves ⇒ underarm reconstruction = highest-risk sub-area (own sub-gate).** Deterministic-vs-AI split, proposed review-only artifacts, validations before 164B.3. Docs-only; Master canonical datum (D-032 preserved); Gate 2 REOPENED / UNDER RECOVERY (not satisfied); Gate 3 PAUSED; `AVATAR_R2` false. | Authoritative (plan) |
| [167a-phase2-gate3-wp1-hair-review.md](./167a-phase2-gate3-wp1-hair-review.md) | 167A **Phase-2 Gate-3 WP1 hair review worksheet (2026-07-15)**: owner-review evidence for the deterministic hair-layer candidate on the tracked D-057 base (`build-hair-wp1-review.mjs` — 8-color D-031 tint sheet, 32/48/64px legibility, halo 130 px, hairline coverage-gap 1,449 px, onion alignment). **✅ Owner-countersigned PASS WITH PUNCH-LIST (2026-07-15):** PL-1 hairline-gap fix + PL-2 luminance remap ordered as separate bounded tasks. **Gate 3 stays gated; `AVATAR_R2` false; nothing promoted.** | Authoritative (review) |
| [167a-phase2-gate3-pl1-hairline-gapfix.md](./167a-phase2-gate3-pl1-hairline-gapfix.md) | 167A **Phase-2 Gate-3 PL-1 hairline gap-fix worksheet (2026-07-16)**: deterministic backfill of the 1,449 px WP1 hairline coverage gap from the Master (`build-hair-pl1-gapfix.mjs`) — gap after 0 px, 0 px eye/face contamination, byte-stable outside the gap set, halo unchanged. **✅ Owner-countersigned PASS (2026-07-16): PL-1 CLEARED.** PL-2 takes `hair-pl1-luminance.png` as input. **Gate 3 stays gated; `AVATAR_R2` false; nothing promoted.** | Authoritative (review) |
| [167a-phase2-gate3-pl2-luminance-remap.md](./167a-phase2-gate3-pl2-luminance-remap.md) | 167A **Phase-2 Gate-3 PL-2 luminance-remap worksheet (2026-07-16)**: deterministic monotonic LUT `[90,250]→[130,252]`, gamma 0.37 on `hair-pl1-luminance.png` (`build-hair-pl2-remap.mjs`) — p50 126→200, alpha/silhouette unchanged, blonde reads blonde, 8-token tint sheet + 64/48/32 px distinctness grid. **✅ Owner-countersigned PASS (2026-07-16): PL-2 CLEARED — WP1 punch-list fully cleared.** Next: WP1 re-review of `hair-pl1-color.png` + `hair-pl2-luminance.png` (own owner command). **Gate 3 stays gated; `AVATAR_R2` false; nothing promoted.** | Authoritative (review) |
| [167a-phase2-gate3-wp1-rereview.md](./167a-phase2-gate3-wp1-rereview.md) | 167A **Phase-2 Gate-3 WP1 re-review worksheet (2026-07-16)**: the punch-listed hair pair `hair-pl1-color.png` + `hair-pl2-luminance.png` re-audited against all four WP1 findings (`build-hair-wp1-rereview.mjs`) — gap 0, halo 130 (unchanged), silhouette aligned, map p50 200, alpha identity colour↔map 0 mismatch, chain re-run byte-identical (5/5). Includes the 2026-07-16 audit follow-ups (on-dark display, explicit 32 px decision, D-register decision). **⏳ Pending owner review.** **Gate 3 stays gated; `AVATAR_R2` false; nothing promoted.** | Draft (review instrument) |
| [167a-phase2-base-assembly-masks-review.md](./167a-phase2-base-assembly-masks-review.md) | 167A **Phase-2 base-assembly tooling review (2026-07-07)**: sign-off review of `tools/avatar/build-base-assembly-masks.mjs` output — **tooling PASS — ✅ owner-accepted/countersigned 2026-07-07** (head contribution localized 92,337 px; body-below-seam IoU 1.0000; full-figure diff = bald crown by design; masks = approximate review-only proposals needing refinement; underarms = highest-risk sub-area). **NOT a Gate-2 pass; Gate 2 REOPENED / UNDER RECOVERY; Gate 3 PAUSED; no neutral outfit executed; no completed base; `AVATAR_R2` false.** | Authoritative (review) |
| [167a-master-base-extractor.md](./167a-master-base-extractor.md) | Deterministic Master base extractor (`tools/avatar/extract-master-base.mjs`) — alpha-cut + ÷2 → Phase-1 base PNG; promote→WebP pipeline. | Authoritative (tool) |
| [167a-phase1-visual-signoff-checklist.md](./167a-phase1-visual-signoff-checklist.md) | Human visual sign-off checklist for the Phase-1 raster avatar (`AVATAR_R2`) — pass/fail gate before any wider preview. | Authoritative (QA) |
| [167a-phase1-pilot-rollout.md](./167a-phase1-pilot-rollout.md) | Phase-1 pilot rollout: `localStorage.avatar_r2` per-browser opt-in + pilot-group selection criteria. | Authoritative (rollout) |
| [OBSERVABILITY.md](./OBSERVABILITY.md) | **Canonical** monitoring ops doc: activation, deployment, release, correlation, troubleshooting, runbook. | Authoritative (ops) |
| [157cb-staging-environment-plan.md](./157cb-staging-environment-plan.md) | Plan of record for the dedicated staging environment (future infra milestone). | Authoritative (plan) |
| [157f-cloudinary-decision-spec.md](./157f-cloudinary-decision-spec.md) | Cloudinary decision spec — fetch/delivery mode for raster avatar assets (gate for 157G). | Authoritative (spec) |
| [157g-cloudinary-validation-checklist.md](./157g-cloudinary-validation-checklist.md) | Validation checklist for the 157G Cloudinary fetch-mode delivery (`js/cloudinary.js`). | Authoritative (validation) |
| [157h-ocr-document-recognition-spec.md](./157h-ocr-document-recognition-spec.md) | Generic browser-only document-recognition (OCR) service spec; reusable beyond answer capture (gate for 157I). | Authoritative (spec) |
| [157i-ocr-validation-checklist.md](./157i-ocr-validation-checklist.md) | Validation checklist for the 157I OCR service implementation (`js/ocr/`). | Authoritative (validation) |
| [157k-ai-grading-contract.md](./157k-ai-grading-contract.md) | AI abstraction layer (`_shared/ai/`) + advisory `grade-answer` contract & validation (157K). | Authoritative (contract) |
| [157d-posthog-analytics.md](./157d-posthog-analytics.md) | PostHog analytics module (`js/analytics.js`) + GDPR consent gate, design & validation (157D/157E). | Authoritative (contract) |
| [157o-read-aloud.md](./157o-read-aloud.md) | Read-aloud (TTS) strategy + service (`js/read-aloud/`): Piper clips + Web Speech fallback (157N/157O). | Authoritative (contract) |
| [157q-consent-gdpr.md](./157q-consent-gdpr.md) | **Canonical privacy/consent map** — consolidated consent SoT (`js/consent.js`) + per-flow legal basis (157Q). | Authoritative (privacy) |
| [157r-feature-flags.md](./157r-feature-flags.md) | **Canonical feature-flag & rollback runbook** — flag inventory, kill-switches, `js/flags.js` diagnostics (157R). | Authoritative (ops) |
| [157s-test-coverage.md](./157s-test-coverage.md) | Default-off/fail-soft unit tests (`node --test` + `deno test`) for the zero-cost services (157S). | Authoritative (tests) |
| [157b-sentry-validation-checklist.md](./157b-sentry-validation-checklist.md) | Validation checklist for the 157B Sentry frontend foundation (`js/sentry.js`). | Authoritative (validation) |
| [157c-edge-validation-checklist.md](./157c-edge-validation-checklist.md) | Validation checklist for the 157C Edge observability foundation (`_shared/monitoring.ts`). | Authoritative (validation) |
| [operator-runbook.md](./operator-runbook.md) | Production operator runbook for the avatar asset pipeline. | Authoritative (ops) |
| [backend_validation_rules.md](./backend_validation_rules.md) | Avatar asset metadata validation rules. | Authoritative (pipeline ref) |
| [pipeline-batch-test-plan.md](./pipeline-batch-test-plan.md) | Avatar generation pipeline batch test plan (valid slots limited). | Authoritative (pipeline ref) |
| [design_brief_template.md](./design_brief_template.md), [metadata_template.json](./metadata_template.json), [metadata.schema.json](./metadata.schema.json) | Avatar pipeline templates / schema. | Authoritative (reference) |

## 4. Archive audit (Section 157AB)

**Nothing is deleted.** This is a classification and a recommendation. "Safe to archive" means
*move to a future `docs/archive/` folder* (a separate, approval-gated action) — the work it records
is concluded and it is not a source of truth for any ongoing domain.

### Still authoritative
All documents in §2 and §3 above.

### Needs review (forward-looking but re-scoped, or recently executed)
| Document | Why |
|---|---|
| [166a-avatar-v2-activation-plan.md](./166a-avatar-v2-activation-plan.md) | **Executed** 2026-06-25 (annotated). Historical activation plan; superseded by AVATAR_SYSTEM.md §2 for state. |
| [164b-asset-production-plan.md](./164b-asset-production-plan.md), [164b2-base-reconstruction-spec.md](./164b2-base-reconstruction-spec.md), [164b3-base-review-worksheet.md](./164b3-base-review-worksheet.md) | Neutral-base ("cut & export") work **re-scoped by D-040** to a **deferred** quality upgrade. Still describe that future work. |
| [164h-tier1-base-rig-mask-authoring-plan.md](./164h-tier1-base-rig-mask-authoring-plan.md), [164i-base-rig-production-execution-plan.md](./164i-base-rig-production-execution-plan.md) | **Re-scoped by D-040** (base rig no longer MVP-blocking). Apply only to the deferred neutral-base upgrade. |
| [164l-anchor-mask-review-worksheet.md](./164l-anchor-mask-review-worksheet.md) | DRAFT review instrument for the upcoming 164L extraction tooling — still pending. |
| [164p-anchor-taxonomy-equipment-production-rules.md](./164p-anchor-taxonomy-equipment-production-rules.md) | Equipment-type production rules spec; may still inform Tier-2 item production. Verify before archiving. |
| `Avatar_Creator_Production_Spec_v1.docx` | Binary (not text-diffable); confirm whether superseded by the markdown ADRs/specs. |

### Safe to archive (concluded point-in-time worksheets / single-item decision records)
Each is, by its own header, a "review instrument", "STOPPED for human review", or "decision record"
for a **single item** (`glasses.round.basic`) or a one-off validation. The ongoing pipeline truth
lives in [164d-shop-pipeline.md](./164d-shop-pipeline.md) + the ADRs + [167a](./167a-master-asset-raster-wiring-plan.md).

| Document | Note |
|---|---|
| [164m-tier2-test-item-review-worksheet.md](./164m-tier2-test-item-review-worksheet.md) | Tier-2 pilot (synthetic) — concluded. |
| [164n-single-ai-test-item-review-worksheet.md](./164n-single-ai-test-item-review-worksheet.md) | Single-AI item validation — concluded. |
| [164o-openai-image-api-adapter-review-worksheet.md](./164o-openai-image-api-adapter-review-worksheet.md) | OpenAI adapter trial — concluded. |
| [164q-glasses-fitter-review-worksheet.md](./164q-glasses-fitter-review-worksheet.md) | Glasses fitter iteration — concluded. |
| [164s-iris-pupil-anchor-correction.md](./164s-iris-pupil-anchor-correction.md), [164t-eye-box-mask-recalibration.md](./164t-eye-box-mask-recalibration.md) | Anchor/eye-box calibration iterations — concluded. |
| [164u-first-avatar-item-candidate-pipeline.md](./164u-first-avatar-item-candidate-pipeline.md), [164v-avatar-item-human-review-promotion-plan.md](./164v-avatar-item-human-review-promotion-plan.md), [164w-glasses-round-basic-human-review-decision.md](./164w-glasses-round-basic-human-review-decision.md) | Single-item candidate + review + decision record — concluded. |
| [164x-asset-promotion-plan.md](./164x-asset-promotion-plan.md), [164y-asset-promotion-decision-svg-readiness.md](./164y-asset-promotion-decision-svg-readiness.md), [164z-svg-reemit-glasses-round-basic.md](./164z-svg-reemit-glasses-round-basic.md) | Single-item promotion; 164y/164z are **SVG-path-specific** (the SVG render is the placeholder being replaced by the raster pipeline, 167a). |

> Recommendation: defer the physical move to a dedicated micro-section ("164-archive"); confirm no
> active tooling references these paths first. Do **not** delete — they are decision history.

## 5. Source-of-truth map (acyclic ownership)

Each domain is **owned by exactly one document**; everything else links to the owner rather than
restating it. Navigation links between docs are bidirectional by design (a reader can move both
ways), but **ownership is acyclic** — there is no domain whose truth depends circularly on another.

```
WHY / product ............ PROJECT_VISION.md
HOW / technical .......... ARCHITECTURE.md ──┐ (links to all owners below, does not restate them)
WHEN / status ............ ROADMAP.md         │
AI rules ................. AI_GUIDELINES.md    │
Avatar (current state) ... AVATAR_SYSTEM.md ───┤ owns "current avatar state"
Avatar (design goal) ..... avatar-vision.md    │ owns "visual target"
Avatar (decisions) ....... project-state.md    │ owns "D-001…D-041 register, risks, debt"
Avatar (locked specs) .... adr/ADR-163B/D/F     │ owns "eye/pipeline/asset specs"
Avatar (shop pipeline) ... 164d-shop-pipeline   │ owns "slot/z model + item pipeline"
Dev workflow / DoD ....... CLAUDE_WORKFLOW.md ──┘
Repo rules (override) .... ../CLAUDE.md  (wins on any conflict)
```

Conflict rule (from `CLAUDE.md`): if any document conflicts with another, **report it before acting**;
on art geometry, `Northstar Master.png` wins (D-032); on current activation state, AVATAR_SYSTEM.md +
the live `AVATAR_V2` constant win; on repo rules, root `CLAUDE.md` wins.

## 6. Maintenance conventions

- Each canonical doc carries a `Last reviewed:` date in its header; update it when you revise the doc.
- Status corrections to historical docs are **annotated in place** (dated `STATUS UPDATE` callouts),
  never silently rewritten — preserve decision history.
- New documentation prefers **updating a canonical doc** over creating a new file; create a new file
  only for a genuinely new domain, and register it in this index.
