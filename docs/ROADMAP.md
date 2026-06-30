# ROADMAP.md — Den Seje App

_Schedule, status and section ordering. Single source of truth for "where are we / what's next."_
_Architecture: [ARCHITECTURE.md](./ARCHITECTURE.md). Avatar specifics: [AVATAR_SYSTEM.md](./AVATAR_SYSTEM.md)._
_Last reviewed: 2026-06-30._

> **Two parallel tracks.** The project runs an **Avatar / art track** (numeric sections 155–167+,
> decisions D-001…D-041) and a newer **Platform / services track** (Section 157A audit → 157B+).
> They share the same one-section-at-a-time discipline ([CLAUDE_WORKFLOW.md](./CLAUDE_WORKFLOW.md)).
> The avatar decision register lives in `docs/project-state.md`; this file gives the cross-track view.

---

## Current status (2026-06-30)

- **Production:** Supabase project `den-seje-app` (`tjzbehwfagiwpwodsgwg`, eu-west-1, Pro);
  frontend live on Vercel, auto-deploy from `main`.
- **Avatar:** `AVATAR_V2 = true` is **live** (commit `52f8365`, 2026-06-25) — but rendering **flat
  placeholder SVGs**, not the Northstar Master raster. Master production + wiring is planned
  (`docs/167a-master-asset-raster-wiring-plan.md`), not executed.
- **Platform services:** Section **157A audit complete** (AI / OCR / STT / TTS / image / error /
  analytics boundaries decided). **No service implemented yet.**
- **Docs:** this foundation set (Section 157AA) being established.

## Completed sections

**Avatar / art track** (condensed — full register in `docs/project-state.md`):
- 155A–155I, 156A–156C, 157, 158A–158C, 159A–159G, 160, 161A–161E, 162A–162B — C2 pipeline,
  z-model, cosmetics parity, personality engines, North Star spec.
- 163A–163H — Hybrid Raster architecture + Eye System ADR + pipeline/asset-spec ADRs (D-011…D-027).
- 164A–164K — North Star Master decomposition spec, base production method pivot (manual paint-over,
  AI rejected), scalable shop-item pipeline, slot/z reconciliation, taxonomy, QA/mask spec,
  automation-first production (D-028…D-041).
- 166A — AVATAR_V2 activation plan → **activated** (commit `52f8365`).

**Platform / progression features shipped** (via migrations / `js/`):
- Themes, streak system, retention loops, daily/weekly quests, achievements (+ hidden/rewards),
  titles, leaderboard, social, shop economy + atomic purchase, RLS hardening, learning-engine
  metadata + concept state, multiple curriculum content sprints.

**Documentation:**
- 157A — Zero-cost service integration audit (boundaries + first-service recommendation).
- 167A — Master asset raster wiring **plan** (plan only, not executed).

## Current section

- **157CC — Roadmap rebase after staging review** ✅ (this update). **Decision (owner, 2026-06-30):**
  a dedicated staging environment is the correct long-term architecture, but **recurring paid
  infrastructure (Supabase Pro branch) is deferred**. Therefore **157CB is not cancelled** — it is
  **reclassified from an immediate blocker to a FUTURE INFRASTRUCTURE milestone**. Implementation of
  most remaining sections may proceed now (default-off, static-validated); only **live
  activation/validation against a third party** waits for a non-production target. See the
  reclassification table below.

## Staging (future infrastructure milestone — no longer an immediate blocker)

- **157CB — Dedicated staging environment** 🗓️ **future infrastructure.** Plan of record stays valid:
  **[157cb-staging-environment-plan.md](./157cb-staging-environment-plan.md)**. It is needed **only
  for live activation/validation** (turning flags on, sending real data), not to *build* the
  remaining sections. Privileged/paid steps are owner-only.
  - **Zero-cost interim (recommended, not required now):** much live validation can later run on a
    **free local Supabase stack** (`supabase start`, Docker — no Pro) + a **free Vercel preview**,
    deferring the **paid hosted branch** to pre-production rollout. This keeps staging on the roadmap
    without recurring cost until launch.

## Staging dependency reclassification (157CC — Task 1/2)

Every prior "requires 157CB" dependency, re-examined. **Category meanings:** **HARD GATE** = cannot be
*implemented* without staging · **SOFT GATE** = implement now (default-off), activate later ·
**FUTURE INFRASTRUCTURE** = only the *production rollout / live activation* needs staging ·
**UNGATED** = pure spec/decision, no dependency.

| Item | Old dependency | Real dependency | Category | Justification |
|---|---|---|---|---|
| 157B/157C/157CA **foundations** | — | none | **UNGATED** (done) | Default-off code; production-safe and inert without staging (§ Status). |
| **Live** observability validation (157B/157C/157CA Part B) | requires 157CB | needs a running non-prod backend with flags ON + real-ish data | **HARD GATE** | PII-against-real-events + edge deploy + flags-on cannot be done on production; needs a non-prod target. |
| 157D PostHog **module** (+ consent gate) | requires 157CB | none to build | **SOFT GATE** | Same pattern as 157B — a flagged `js/analytics.js` builds + static-validates with no infra. |
| 157E analytics **events** | requires 157CB | 157D module | **SOFT GATE** | Code instrumentation, default-off. |
| 157F Cloudinary **spec** | — | none | **UNGATED** | Pure specification. |
| 157G Cloudinary **integration** | — | a (free) Cloudinary account for go-live | **SOFT GATE** | Build read-path/transform behind a flag; needs no Supabase Pro branch (frontend/Vercel-preview testable). |
| 157H OCR **spec** | — | none | **UNGATED** | Pure specification. |
| 157I OCR **implementation** | requires 157CB (implied) | none | **SOFT GATE** | In-browser Tesseract wasm; no secret/server/backend — even activation is zero-cost client-side. |
| 157J Ollama reachability **decision** | gate | none | **UNGATED** | A decision/spec. |
| 157K `grade-answer` **contract** + AI **abstraction layer** | — | none | **SOFT GATE** | `_shared/ai/` scaffolding + contract build without infra; advisory-only, default-off. |
| 157L Ollama AI-grade **wiring** into `process-event` | requires 157CB | non-prod env (reward path) + reachable model | **FUTURE INFRASTRUCTURE** | Touches the reward path → must validate in non-prod before any rollout. |
| 157M AI-grade in teacher review | requires 157CB | 157L | **FUTURE INFRASTRUCTURE** | Activation follows 157L. |
| 157N Piper TTS **strategy** | — | none | **UNGATED** | Decision/spec. |
| 157O Piper pre-generated audio | — | none | **SOFT GATE** | Static Storage assets + `js/audio.js`; no live service. |
| 157P Whisper STT feasibility | — | none | **UNGATED** | Decision (likely defer). |
| 157Q GDPR/consent consolidation | — | none | **SOFT GATE** | Consent mechanism is buildable code/docs. |
| 157R Rollback / flag hardening | — | none | **SOFT GATE** | Cross-cutting code; no infra. |
| 157S Playwright coverage (fail-soft paths) | — | none | **SOFT GATE** | Tests for default-off behaviour run against prod today. |
| 157T Production-readiness review | requires 157CB | the above + staging for sign-off | **FUTURE INFRASTRUCTURE** | Final go-live gate. |
| Avatar track (167A, 164L) | never | none | **UNGATED** | Independent; only gated on human art (D-033). |

**Net:** the **only HARD GATE is live monitoring validation.** Everything else is SOFT GATE (build
now, default-off), UNGATED (spec/decision/avatar — do today), or FUTURE INFRASTRUCTURE (activation only).

_Prior:_ **157AA** (docs foundation) · **157AB** (consolidation) · **157B** (Sentry frontend) ·
**157C** (Edge observability foundation) · **157CA** (observability docs + static validation) ·
**157CC** (this rebase) — complete (foundations; default-off; production-safe).

## Future sections

### Platform / services track (from the 157A audit)

Each is one controlled section; all integrations behind a default-off flag, fail-soft. The **Gate**
column is the 157CC reclassification (UNGATED = do today · SOFT = build now/activate later · HARD =
needs staging to implement · FUTURE = activation/rollout only needs staging).

| Section | Work | Boundary | Gate |
|---|---|---|---|
| **157B** ✅ | Sentry error reporting — frontend wiring (`js/sentry.js`) — **done, default-off** | frontend-only | done |
| **157C** ✅ | Sentry — Edge observability foundation (`_shared/monitoring.ts`) — **done, default-off** | Edge | done |
| **157CA** ✅ | Observability docs + static validation; 2 Sentry projects decided | docs | done |
| **157CB** 🗓️ | Dedicated staging environment (Supabase branch + Vercel preview) | infra | **FUTURE INFRA** (not a blocker) |
| **Live obs. validation** | 157B/157C/157CA Part B checklists incl. PII-against-real-events | staging | **HARD GATE** |
| 157D | PostHog `js/analytics.js` module + consent/GDPR gate | frontend-only | **SOFT** |
| 157E | Core analytics events (login, question shown/answered, purchase) | frontend-only | **SOFT** |
| **157F** ✅ | Cloudinary decision spec — **decided: fetch/delivery mode (no secret)** ([157f-cloudinary-decision-spec.md](./157f-cloudinary-decision-spec.md)) | spec | **UNGATED** (done) |
| **157G** ✅ | Cloudinary **fetch-mode** delivery (`js/cloudinary.js` `cdnUrl`), wired into `mountC2Avatar` — **done, default-off, raster-only**; activate after 167a + free account | frontend | **SOFT** (done) |
| **157H** ✅ | OCR spec — **generic reusable browser-only document-recognition service** ([157h-ocr-document-recognition-spec.md](./157h-ocr-document-recognition-spec.md)) | spec | **UNGATED** (done) |
| **157I** ✅ | `js/ocr/` service (strict provider abstraction, structured `OCRResult`, Tesseract first impl) + answer-capture adapter — **done, default-off, browser-only, no upload** | frontend-only | **SOFT** (done) |
| 157J | Ollama reachability decision (tunnel vs endpoint vs defer) | decision | **UNGATED** |
| 157K | `grade-answer` contract + AI **abstraction layer** (`_shared/ai/`) | Edge | **SOFT** |
| 157L | Ollama advisory AI-grade in `process-event` PATH 1 | Edge | **FUTURE INFRA** |
| 157M | AI-grade surfaced in teacher review (`review-answer`) | Edge + frontend | **FUTURE INFRA** |
| 157N | Piper TTS strategy (pre-generated Storage audio vs live) | decision | **UNGATED** |
| 157O | Piper pre-generated read-aloud assets via `js/audio.js` | frontend assets | **SOFT** |
| 157P | Whisper STT feasibility (wasm vs server) — likely defer | decision | **UNGATED** |
| 157Q | GDPR / consent consolidation across third-party flows | cross-cutting | **SOFT** |
| 157R | Rollback & feature-flag hardening | cross-cutting | **SOFT** |
| 157S | Playwright coverage for new flows + fail-soft paths | tests | **SOFT** |
| 157T | Production-readiness review + secret-rotation checklist | ops | **FUTURE INFRA** |

### Avatar / art track (from 167A)

> **Guardrail (binding):** **167A replaces artwork assets only — it is NOT an avatar rewrite.** The
> stable architecture (identity, render pipeline, layer/z-model, cosmetics, presence/blink/expression
> engines, ownership, storage source-of-truth, entry points, public interfaces) **must remain
> unchanged**; any change to those during 167A is a defect. See
> **[167a-architecture-preservation-report.md](./167a-architecture-preservation-report.md)** (pre-167A
> preservation report) before starting.

1. Master asset inventory/spec finalize — choose **D-040 "Master-as-is"** vs full 163F
   decomposition; scaffold `assets/avatar-r2/` + manifest; lock eye-box anchor revision.
2. **Master MVP raster base production** — _human art deliverable_ (manual paint-over over
   `Northstar Master.png`). **Cannot be AI-generated (D-033). Gates everything.**
3. Renderer raster wiring (behind `AVATAR_V2`).
4. Visual-fidelity QA (32/48/64px legibility + human onion-skin sign-off).
5. Test/golden re-baseline from the Master render.
6. Production verification + sign-off.

Plus, on the automation side: **164L** — deterministic (non-AI) anchor + MVP mask extraction
tooling from Master (method locked by D-041); then the Tier-2 AI item-overlay conveyor.

## Long-term milestones

- **M1 — Avatar resembles Northstar Master** (167A Phase-1 D-040 shipped behind `AVATAR_V2`).
- **M2 — Living decomposed avatar** (167A Phase-2 / 163F: living face/eyes/blink + skin/hair variants).
- **M3 — Scalable cosmetics shop** (automatable AI item-overlay pipeline, D-034/D-040; QA-gated).
- **M4 — Observability** (Sentry + PostHog live, GDPR-compliant) → real production visibility.
- **M5 — Advisory AI** (OCR photo answers, then advisory AI grading + draft teacher feedback),
  all fail-soft and teacher-authoritative.
- **M6 — Accessibility** (TTS read-aloud; STT voice answers) where feasible at zero cost.

## Version roadmap

| Version | Theme | Contents (target) |
|---|---|---|
| **v1.0 (MVP launch)** | Solid core + Master avatar | Live quiz loop, teacher review, shop, retention/achievements, Northstar Master avatar (D-040), Sentry + PostHog, OCR photo answers. |
| v1.1 | Living avatar + advisory AI | 163F decomposed avatar, advisory AI grading/feedback (teacher-confirmed). |
| v1.2 | Scale & accessibility | Automatable cosmetics shop, TTS/STT where viable, cohort/% rollout mechanism (OQ-4). |

## Revised implementation order (157CC — zero-cost-first, no paid infra)

Goal: keep delivering value with **no recurring subscription cost**. Do all UNGATED + SOFT work now
(default-off); delay only what truly needs staging. **No external service is activated against
production**; activation waits for a staging target (free local stack at first; paid branch at launch).

1. ~~**157F — Cloudinary decision spec**~~ ✅ done — decided **fetch/delivery mode (no secret)**, for
   raster only, after 167a; see [157f-cloudinary-decision-spec.md](./157f-cloudinary-decision-spec.md).
2. ~~**157H — OCR client spec**~~ ✅ done — generic browser-only **document-recognition service**
   (reusable beyond answers); see [157h-ocr-document-recognition-spec.md](./157h-ocr-document-recognition-spec.md).
3. ~~**157I — OCR implementation**~~ ✅ done — `js/ocr/` browser-only service (strict provider
   abstraction, structured `OCRResult`, Tesseract first impl) + answer-capture adapter, default-off,
   no image upload; see [157i-ocr-validation-checklist.md](./157i-ocr-validation-checklist.md).
4. ~~**157G — Cloudinary integration**~~ ✅ done — fetch-mode `cdnUrl()` wired into `mountC2Avatar`,
   default-off/raster-only; see [157g-cloudinary-validation-checklist.md](./157g-cloudinary-validation-checklist.md).
5. **157K — AI abstraction layer + `grade-answer` contract** (SOFT scaffolding, `_shared/ai/`,
   advisory-only, default-off) — unblocks future AI without touching the reward path yet. ← **next**
6. **Avatar M1 / 164L** — Master raster wiring + non-AI mask tooling (UNGATED; parallel track; gated
   only on the human art deliverable, D-033).
7. **157D/157E — PostHog module + events** (SOFT, default-off; build behind the consent gate; do not
   send events until staging).
8. **157O — Piper pre-generated read-aloud assets** (SOFT, static assets) · **157N/157P** TTS/STT
   decisions (UNGATED).
9. **157Q/157R/157S** — consent consolidation, flag hardening, fail-soft test coverage (SOFT).
10. **FUTURE INFRASTRUCTURE (deferred until staging exists):** 157CB itself, live observability
    validation (HARD GATE), 157L/157M AI-grade activation, 157T production-readiness sign-off.

> Activation of anything built above happens **after** a staging target exists — first the free local
> Supabase stack + Vercel preview, then a paid hosted branch only at pre-launch. Building now does not
> incur cost; only running a hosted non-prod backend does.

## Status table

| Item | Status | Notes |
|---|---|---|
| Quiz core loop | ✅ Live | `app.js` state machine + `process-event`. |
| Teacher open-answer review | ✅ Live | `review-answer` + `student-detail.js`. |
| Shop / economy | ✅ Live | atomic purchase + RLS. |
| Retention / achievements / quests | ✅ Live | shipped via migrations + `js/`. |
| Avatar pipeline + engines | ✅ Live | `AVATAR_V2=true`. |
| Avatar art = Northstar Master | 🟡 Planned | 167A; flat placeholder live; needs human art. |
| Cohort / % rollout | ❌ None | OQ-4; only constant + localStorage override. |
| Error reporting (Sentry) — frontend | ✅ Foundation (157B), default-off | `js/sentry.js`; routes `logError`; set `ENABLE_SENTRY=true` + DSN to activate. |
| Error reporting (Sentry) — Edge | ✅ Foundation (157C), default-off | `_shared/monitoring.ts` `withObservability`; set `ENABLE_SENTRY_EDGE=true` + `SENTRY_DSN_EDGE`. 1 reference fn wired, 15 to migrate. |
| Observability — live validation | 🟡 HARD GATE (staging) | Static-validated; live (Part B) needs a non-prod target. Foundations production-safe meanwhile. |
| Staging environment (157CB) | 🗓️ Future infra | Reclassified (157CC): long-term plan, **not** an immediate blocker. Free local stack interim; paid branch at launch. |
| Analytics (PostHog) | 🟡 SOFT — buildable now | 157D module + consent gate build default-off; activation later. |
| OCR / document recognition | ✅ Foundation (157I), default-off | `js/ocr/` generic service (answers + future worksheets/sources/teacher material); browser-only wasm, **no image upload**, zero-cost. Set `ENABLE_OCR=true` to activate. |
| AI abstraction / grading (Ollama) | 🟡 SOFT (layer) / FUTURE (activation) | 157K layer buildable now; 157L process-event wiring needs staging + reachability. |
| TTS (Piper) / STT (Whisper) | 🟡 SOFT (Piper assets) / ⏸ (STT) | 157O assets buildable; decisions UNGATED. |
| Image CDN (Cloudinary) | ✅ Foundation (157G), default-off | `js/cloudinary.js` fetch-mode, no secret, raster-only, fail-soft to origin; Storage stays source of truth. Set `ENABLE_CLOUDINARY=true` + cloud name (after 167a raster). |

Legend: ✅ live · 🟡 planned/audited · ⏸ deferred · ❌ not present.
