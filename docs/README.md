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
| [OBSERVABILITY.md](./OBSERVABILITY.md) | **Canonical** monitoring ops doc: activation, deployment, release, correlation, troubleshooting, runbook. | Authoritative (ops) |
| [157cb-staging-environment-plan.md](./157cb-staging-environment-plan.md) | Plan of record for the dedicated staging environment (future infra milestone). | Authoritative (plan) |
| [157f-cloudinary-decision-spec.md](./157f-cloudinary-decision-spec.md) | Cloudinary decision spec — fetch/delivery mode for raster avatar assets (gate for 157G). | Authoritative (spec) |
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
