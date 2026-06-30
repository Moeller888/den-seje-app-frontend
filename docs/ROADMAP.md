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

- **157CA — Observability activation & validation** ✅ docs + static-validation complete; **live
  validation deferred to after 157CB**. Canonical **[OBSERVABILITY.md](./OBSERVABILITY.md)** created.
  Static validation green; platform default-off and production-safe.
  - **Decisions (owner, 2026-06-30):** (1) **Two Sentry projects** — `den-seje-app-frontend`
    (browser) + `den-seje-app-edge` (deno). (2) **No external service may be activated or validated
    against production** — a dedicated **staging environment (Section 157CB)** is the prerequisite for
    all remaining external integrations and for the live 157B/157C checklists.

## Next section (gating prerequisite)

- **157CB — Dedicated staging environment** 🟡 **in progress (plan).** Plan of record:
  **[157cb-staging-environment-plan.md](./157cb-staging-environment-plan.md)** — Supabase Pro branch +
  Vercel preview + 2 Sentry projects; core enabler = a **runtime env resolver** (`js/env-config.js`)
  because the frontend Supabase target is hardcoded with no build step. **Prerequisite for 157D→157T
  and live 157B/157C validation.** Privileged infra steps are owner-only (Sentry projects/DSNs,
  Supabase branch + keys, Vercel staging hostname, staging secrets); the resolver code lands once
  those values exist (prod stays byte-identical). Then run the Part B checklists in staging → unblock 157D.

_Prior:_ **157AA** (docs foundation) · **157AB** (consolidation) · **157B** (Sentry frontend) ·
**157C** (Edge observability foundation) · **157CA** (observability docs + static validation) —
complete (foundations; default-off).

## Future sections

### Platform / services track (from the 157A audit)

Recommended order (each is one controlled section; all AI behind a default-off flag, fail-soft):

| Section | Work | Boundary |
|---|---|---|
| **157B** ✅ | Sentry error reporting — frontend wiring (`js/sentry.js`, routes `logError`) — **done, default-off** | frontend-only |
| **157C** ✅ | Sentry — Edge observability foundation (`_shared/monitoring.ts`, `withObservability`) — **done, default-off** | Edge |
| **157CA** ✅ | Observability docs (`OBSERVABILITY.md`) + static validation; 2 Sentry projects decided | docs |
| **157CB** 🔜 | **Dedicated staging environment (Supabase branch + Vercel preview)** — **GATE: prerequisite for 157D→157T and all live activation/validation** | infra |
| 157D | PostHog `js/analytics.js` module + consent/GDPR gate — _requires 157CB_ | frontend-only |
| 157E | Core analytics events (login, question shown/answered, purchase) | frontend-only |
| 157F | Cloudinary decision spec (signed-Edge vs unsigned-preset) | spec |
| 157G | Cloudinary delivery/optimisation for avatar assets (read path) | Edge/frontend |
| 157H | Tesseract OCR client spec (photo→text UX, bundle budget) | spec |
| 157I | Tesseract OCR implementation behind flag, pre-`process-event` | frontend-only |
| 157J | Ollama reachability decision (tunnel vs endpoint vs defer) — **gate** | decision |
| 157K | `grade-answer` Edge Function contract (advisory, fail-soft) | Edge |
| 157L | Ollama advisory AI-grade in `process-event` PATH 1 | Edge |
| 157M | AI-grade surfaced in teacher review (`review-answer`) | Edge + frontend |
| 157N | Piper TTS strategy (pre-generated Storage audio vs live) | decision |
| 157O | Piper pre-generated read-aloud assets via `js/audio.js` | frontend assets |
| 157P | Whisper STT feasibility (wasm vs server) — likely defer | decision |
| 157Q | GDPR / consent consolidation across third-party flows | cross-cutting |
| 157R | Rollback & feature-flag hardening | cross-cutting |
| 157S | Playwright coverage for new flows + fail-soft paths | tests |
| 157T | Production-readiness review + secret-rotation checklist | ops |

### Avatar / art track (from 167A)

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

## Priority order (next actions)

1. **157CB — Dedicated staging environment** (Supabase branch + Vercel preview). **Hard gate:**
   prerequisite for 157D→157T and for live activation/validation of 157B/157C. No external service is
   activated or validated against production.
2. **157CA live validation** — run the 157B/157C Part B checklists in the new staging env; confirm
   PII-against-real-events (the gate to 157D).
3. **Avatar M1** — produce + wire the Master raster (167A); gated on a **human art deliverable**
   (parallel track, not blocked by 157CB).
4. 157D/157E — PostHog analytics (needs 157CB + GDPR/consent gate first).
5. 157H/157I — OCR photo answers (needs 157CB).
6. 157J+ — AI grading only after 157CB + the reachability gate + the abstraction layer.

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
| Observability — live validation | 🟡 Pending 157CB | Static-validated; live (157B/157C Part B) deferred to staging. 2 Sentry projects decided. |
| Staging environment | ❌ None → 🔜 157CB | **Gate** for all external integrations. Supabase branch + Vercel preview. |
| Analytics (PostHog) | 🟡 Audited — _needs 157CB_ | 157A → 157D. Needs staging + consent gate. Not implemented. |
| OCR (Tesseract) | 🟡 Audited | 157A → 157H/157I. Not implemented. |
| AI grading (Ollama) | 🟡 Audited, gated | 157A → 157J reachability gate first. Not implemented. |
| TTS (Piper) / STT (Whisper) | ⏸ Deferred | 157N–157P. |
| Image CDN (Cloudinary) | 🟡 Audited | 157F/157G. Storage stays source of truth. |

Legend: ✅ live · 🟡 planned/audited · ⏸ deferred · ❌ not present.
