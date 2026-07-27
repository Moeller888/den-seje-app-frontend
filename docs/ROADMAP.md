# ROADMAP.md — Den Seje App

_Schedule, status and section ordering. Single source of truth for "where are we / what's next."_
_Architecture: [ARCHITECTURE.md](./ARCHITECTURE.md). Avatar specifics: [AVATAR_SYSTEM.md](./AVATAR_SYSTEM.md)._
_Last reviewed: 2026-07-01._

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
  **✅ Gate 2 (neutral base layer) CLOSED (2026-07-14, D-056)** — owner-approved candidate
  `d042-outfit-candidate-d053-arm-residue.png` (sha `2CB93EE0…`); final 164B.3 = **PASS with an
  owner-accepted inherited §7 alpha/matte exception**. **Not a promotion:** the candidate is still
  gitignored; **`assets/avatar-r2` / `R2_MANIFEST` untouched, `AVATAR_R2` stays `false`.**
  **Gate 3 has since STARTED on explicit owner command (2026-07-15, WP0 PR #69), and its deterministic
  layer set is COMPLETE and owner-countersigned (integration composite PASS, PR #86/#87)** — remaining
  Gate-3 scope is the four D-042 expression variants (producer tool merged PR #88, never run). Nothing
  promoted. Gate 5 remains open.
  **✅ R2 activation-readiness audit CLOSED — VERIFIED & COMPLETE on main (2026-07-23, `9d27df5`).**
  All findings **F1–F5 closed** (D-062 runtime asset-load-failure→C2 fallback · D-065 idempotent
  arm-fringe reproducer · D-064 Phase-2 pilot-doc refresh · F4 R2 goldens · D-063 blink open/closed
  goldens); **F6** = accepted debt (D-061 faint arm residual); **F7/F8** = LOW. Green main CI
  (365 passed). **`AVATAR_R2` stays `false`** — audit closure is verification only, **no pilot,
  no flag-flip.** See `docs/project-state.md` (D-062…D-065) + `docs/167a-phase1-pilot-rollout.md`.
  **✅ Shared R2 raster-artefact question CLOSED for pilot (2026-07-26, D-071).** A read-only
  render-scale audit measured the shared raster stack at the app's **real** render sizes (avatar
  `180×270`, hub `110×165`/`100×150`, quiz `52×78`) and found every area `NOT_VISIBLE_AT_REAL_SCALE`;
  the D-061 arm residual shows only under heavy diagnostic zoom. **Binding owner decision D —
  `OWNER_ACCEPTED_FOR_PILOT_WITH_DOCUMENTED_RASTER_DEBT`:** no alpha cleanup / no source re-cut; the
  shared raster artefacts are **no longer an active blocker** at the current render sizes (F6-style debt
  accepted for a controlled pilot). Re-audit if a surface wider than ≈180 px, a fullscreen/hero avatar,
  a higher display scale, or a base/hair/shoe asset change is introduced. **`AVATAR_R2` stays `false`**
  (no activation). Remaining separate tracks: controlled R2 pilot · broad R2 activation · optional
  small-size supplementary cue (distinct from raster fringe) · pilot findings. See `docs/project-state.md`
  (D-071) + `docs/AVATAR_SYSTEM.md`.
  **▶ Controlled R2 pilot — operationally planned, `AUTHORIZED_BUT_NOT_STARTED` (2026-07-26, D-072).**
  R2 has been **live-verified technically** on production (avatar/hub/quiz `renderPath=r2`, no C2 fallback),
  but that check ran in an **ephemeral automated browser** — **no persistent pilot user is onboarded yet**.
  The next concrete gate is **manual onboarding in a persistent browser profile** (close → reopen → opt-in
  still present → `renderPath=r2`), per the finalized protocol in `docs/167a-phase1-pilot-rollout.md`
  (§7–§15: Wave 1 target 3 / max 5, 7 days & ≥3 sessions, feedback+severity, abort + PASS/PASS_WITH_DEBT/
  PAUSED/FAILED). **Observability and allowlist enablement remain later separate tracks; no broad
  activation.** **`AVATAR_R2` stays `false`.** See `docs/project-state.md` (D-072).
  **▶ Manual onboarding kit READY (2026-07-26, D-073).** `docs/167a-persistent-browser-onboarding-kit.md`
  is the copy-ready, manual procedure for the persistent-browser gate (Fase A → close/reopen persistence
  gate → opt-out demo → `ONBOARDED` decision box, with data-minimal log + error table). The **next manual
  gate** is running it for the **test-student in a real persistent browser profile**; **no user is onboarded
  yet**. **C (observability)** and **B (allowlist)** remain separate later tracks; **no broad activation**;
  **`AVATAR_R2` stays `false`.** See `docs/project-state.md` (D-073).
  **▶ C-track (observability) AUDITED + DESIGNED, not implemented (2026-07-26, D-074).**
  `docs/167a-r2-pilot-observability-design.md` designs a privacy-safe, **console-only, pilot-gated** render
  signal (r2 / c2_fallback / render_failed) with a single central emission point in `mountC2Avatar`, fail-soft
  + WeakSet dedup, **no backend / no database / no identifier / no persistence**. **✅ Owner decision
  CONFIRMED (2026-07-26): `CONSOLE_ONLY_PILOT_OBSERVABILITY`** (design-doc status `OWNER_DECISION_CONFIRMED`).
  Implementation is a **separate future runtime PR** the owner triggers when desired; the confirmation
  authorises the **design, not activation**. Observability is **advisory** — manual onboarding (D-073) works
  without it. **B (allowlist)** remains a separate later track; **no broad activation**; **`AVATAR_R2` stays
  `false`.** See `docs/project-state.md` (D-074).
  **▶ C-track (observability) IMPLEMENTED — console-only (2026-07-27, D-076).** First runtime PR of the pilot
  arc: `js/avatar-r2-observability.js` + one central emission in `mountC2Avatar` (r2 / c2_fallback /
  render_failed), pilot-gated on `localStorage.avatar_r2==="1"`, fail-soft, WeakSet-deduped, **no
  backend/network/database/persistence/PII**; unit + self-served fixture-intercepted Playwright coverage.
  Advisory — never gates rendering; C2-default functionally/visually/DOM unchanged; existing goldens
  unchanged. **`AVATAR_R2` stays `false`;** pilot status unchanged. See `docs/project-state.md` (D-076).
  **▶ Shop-preview grid forced to C2 (2026-07-27, D-077).** `FORCE_ALL_SHOP_PREVIEWS_TO_C2`: the shop
  previously mixed R2 (aura/back) and C2 (all other slots) card-to-card; `shopPreviewModeFor` now returns
  `"c2"` for every slot so every product card renders the whole C2 preview with the item visible — no
  per-card R2, no inconsistent grid. Shop-preview-only; avatar/hub/quiz/R2-runtime/manifest/buy/equip
  untouched; **`AVATAR_R2` stays `false`.** See `docs/project-state.md` (D-077).
  **▶ Controlled R2 pilot STARTED — `PILOT_WAVE_1_IN_PROGRESS` (2026-07-27, D-078).** The test-student was
  manually `ONBOARDED` through the persistent-browser gate (D-073 kit; owner-witnessed, Chrome/desktop): opt-in
  survived a real browser close-and-reopen, `renderPath=r2` on avatar/hub/quiz with no mixed stack, opt-out
  demonstrated. Pilot status moves `AUTHORIZED_BUT_NOT_STARTED` → **`PILOT_WAVE_1_IN_PROGRESS`** (1 of target
  3, max 5). Docs-only; **no code/runtime/user-data change; `AVATAR_R2` stays `false`** (per-browser opt-in
  only, no global flag-flip). See `docs/project-state.md` (D-078).
  **▶ B-track (allowlist) AUDITED + DESIGNED, recommend DEFER (2026-07-26, D-075).**
  `docs/167a-r2-pilot-allowlist-design.md`: the activation gate has no uid today, and a client-side
  student-UID allowlist would ship children's identifiers to the public bundle (GDPR) — **rejected**.
  Recommended decision **`NO_ALLOWLIST_FOR_PILOT`**: Wave 1 (3–5) is already enabled per-browser via the
  D-073 kit; if central enablement is ever needed at scale, use a **server-side eligibility flag** (RLS,
  own-account-only), never a client UID list. **✅ Owner decision CONFIRMED (2026-07-27):
  `NO_ALLOWLIST_FOR_PILOT`** (design-doc status `OWNER_DECISION_CONFIRMED`) — no allowlist built; Wave 1 stays
  per-browser (D-073); a server-side flag would be its own future audited runtime+migration PR if scale ever
  demands it. No code, no migration; **no broad activation**; **`AVATAR_R2` stays `false`.** See
  `docs/project-state.md` (D-075).
- **Platform services:** Section **157A audit complete** (AI / OCR / STT / TTS / image / error /
  analytics boundaries decided). **No service implemented yet.**
- **Read-aloud (157O):** **LIVE in production** (Web Speech; commit `52e7a04`, 2026-07-03) — quiz
  "🔊 Læs op", on-device, no consent, fail-soft; Danish voice preferred. First platform service
  activated for students; Piper clips remain an offline deliverable.
- **Docs:** this foundation set (Section 157AA) being established.
- **CI (D-066):** the Playwright workflow is **path-aware** — docs-only and standalone
  avatar-tool-only PRs skip the full browser suite (fast checks only); **push to main and any
  runtime/test/asset/workflow change always run the full suite** (fail-closed). The required
  `test` check is preserved in every mode. Live-backend/concurrency split deferred.
  **Live on main since `17d0574` (2026-07-23).** The two fast paths are **docs** (only `docs/**`)
  and **avatar-tool** (only `tools/avatar/**` + `docs/**`); everything else stays full.
  **Fully proven end-to-end (2026-07-24):** docs-mode (PR #107, required `test` green in ~8 s,
  Playwright skipped) · avatar-tool-mode (PR #108, real `node --check` of 1 file, Playwright
  skipped) · full-mode (PR #106/#109, whole Playwright suite, 365 passed) · every push to main ran
  forced-full · the required `test` check stayed green in all modes. A missing-trailing-newline bug
  that made the avatar-tool `node --check` a no-op was fixed first (D-066 follow-up, PR #109).
  **D-067 (2026-07-24):** fast modes now run **outside** the shared `e2e-shared-supabase` lock — a
  `classify` job routes docs/avatar-tool to an isolated `ci-fast-<run_id>` group, so they no longer
  queue behind full runs; full-mode and every fail-closed case keep the shared lock (a full suite can
  never run unlocked), and full stays serialized with `update-avatar-goldens.yml`.
  **D-067 merged to main (`44701e0`); lock-bypass PROVEN live (PR #112).** While the forced-full main
  run (`30103292846`, `push`, `e2e-shared-supabase`) was still **in_progress** (started 14:58:33Z), the
  docs-only proof run (`30103516035`) took mode **docs** → isolated group **`ci-fast-30103516035`** and
  its `test` job **started 15:01:48Z and completed `success` 15:01:57Z (~9 s)** — Playwright, browser
  install and `npm ci` all skipped, required `test` green — i.e. docs-mode **finished before** the main
  run, never queuing behind the shared lock.

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
| 157O Read-aloud (Web Speech + Piper) | — | none | **LIVE** | Web Speech path **activated in prod** (`52e7a04`, 2026-07-03); Piper clips still an offline deliverable. |
| 157P Whisper STT feasibility | — | none | **UNGATED** | Decision (likely defer). |
| 157Q GDPR/consent consolidation | — | none | **SOFT GATE** | Consent mechanism is buildable code/docs. |
| 157R Rollback / flag hardening | — | none | **SOFT GATE** | Cross-cutting code; no infra. |
| 157S Playwright coverage (fail-soft paths) | — | none | **SOFT GATE** | Tests for default-off behaviour run against prod today. |
| 157T Production-readiness review | requires 157CB | the above + staging for sign-off | **FUTURE INFRASTRUCTURE** | Final go-live gate. |
| Avatar track (167A, 164L) | never | none | **UNGATED** | Independent; only gated on the AI-assisted masked-decomposition art (D-042, amends D-033). |

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
| **157D** ✅ | PostHog `js/analytics.js` module + GDPR consent gate — **done, default-off, consent-gated, unwired** | frontend-only | **SOFT** (done) |
| **157E** ✅ | Core analytics events (login, question shown/answered, item purchased) + GDPR consent banner — **done, default-off, double-gated** | frontend-only | **SOFT** (done) |
| **157F** ✅ | Cloudinary decision spec — **decided: fetch/delivery mode (no secret)** ([157f-cloudinary-decision-spec.md](./157f-cloudinary-decision-spec.md)) | spec | **UNGATED** (done) |
| **157G** ✅ | Cloudinary **fetch-mode** delivery (`js/cloudinary.js` `cdnUrl`), wired into `mountC2Avatar` — **done, default-off, raster-only**; activate after 167a + free account | frontend | **SOFT** (done) |
| **157H** ✅ | OCR spec — **generic reusable browser-only document-recognition service** ([157h-ocr-document-recognition-spec.md](./157h-ocr-document-recognition-spec.md)) | spec | **UNGATED** (done) |
| **157I** ✅ | `js/ocr/` service (strict provider abstraction, structured `OCRResult`, Tesseract first impl) + answer-capture adapter — **done, default-off, browser-only, no upload** | frontend-only | **SOFT** (done) |
| 157J | Ollama reachability decision (tunnel vs endpoint vs defer) | decision | **UNGATED** |
| **157K** ✅ | AI **abstraction layer** (`_shared/ai/`) + `grade-answer` advisory endpoint — **done, default-off, no reward-path wiring** | Edge | **SOFT** (done) |
| 157L | Ollama advisory AI-grade in `process-event` PATH 1 | Edge | **FUTURE INFRA** |
| 157M | AI-grade surfaced in teacher review (`review-answer`) | Edge + frontend | **FUTURE INFRA** |
| **157N** ✅ | Piper TTS strategy — **decided: pre-gen clips primary + on-device Web Speech fallback, no live service** | decision | **UNGATED** (done) |
| **157O** ✅ | Read-aloud service `js/read-aloud/` (provider-abstracted) + quiz control — **LIVE in prod** (Web Speech, `52e7a04`, 2026-07-03); Piper clips remain an offline deliverable | frontend | **SOFT** (live) |
| 157P | Whisper STT feasibility (wasm vs server) — likely defer | decision | **UNGATED** |
| **157Q** ✅ | GDPR consent consolidation — single SoT (`js/consent.js`) + consolidated banner + canonical privacy map — **done, default-off** | cross-cutting | **SOFT** (done) |
| **157R** ✅ | Feature-flag hardening — registry `js/flags.js` (`window.__flags()`) + canonical rollback runbook — **done** | cross-cutting | **SOFT** (done) |
| **157S** ✅ | Default-off/fail-soft unit tests via built-in `node --test` + `deno test` (21 tests, no new framework) — **done** | tests | **SOFT** (done) |
| 157T | Production-readiness review + secret-rotation checklist | ops | **FUTURE INFRA** |

### Avatar / art track (from 167A)

> **Guardrail (binding):** **167A replaces artwork assets only — it is NOT an avatar rewrite.** The
> stable architecture (identity, render pipeline, layer/z-model, cosmetics, presence/blink/expression
> engines, ownership, storage source-of-truth, entry points, public interfaces) **must remain
> unchanged**; any change to those during 167A is a defect. See
> **[167a-architecture-preservation-report.md](./167a-architecture-preservation-report.md)** (pre-167A
> preservation report) before starting.

1. **✅ Scaffold done (167A-START, 2026-07-01)** + **path LOCKED (2026-07-01): D-040 Phase-1
   "Master-as-is" first, then 163F Phase-2 later.** `assets/avatar-r2/` + empty `R2_MANIFEST` + inert
   raster resolvers (`baseSrcForR2`/…/`hairSrcForR2`, `AVATAR_R2=false`) added **alongside** the C2/SVG
   resolvers in `js/avatar-layers.js` (additive; all resolvers return `null` → C2/SVG fallback; render
   untouched). Readiness = **PARTIAL** (Master `.png` 1024×1536 + anchors/masks present; **WebP absent**).
2. **⛔ Phase-1 base production (D-040) — the one blocker.** Required first asset:
   `assets/avatar-r2/base/body-neutral-medium-v1.webp` = **alpha-cut of `Northstar Master.png`** (white
   matte → transparent, resized 512×768, WebP; full avatar baked). This is a **mechanical,
   geometry-preserving** op on the frozen Master — **not** an AI regeneration and **not** the D-033
   manual paint-over (that governs the deferred Phase-2 decomposed base). Then step 3a wires it (§15 of
   [167a-step3-render-wiring-plan.md](./167a-step3-render-wiring-plan.md)). **163F Phase-2 decomposition
   is deferred — do not start yet.**
3. Renderer raster wiring (behind `AVATAR_R2`) —
   [167a-step3-render-wiring-plan.md](./167a-step3-render-wiring-plan.md). **✅ Step 3a done
   (2026-07-01):** Phase-1 baked base wired behind `AVATAR_R2` (default-off, C2/SVG fallback intact),
   shipped as a **temporary PNG preview** (`body-neutral-medium-v1.png`; **WebP = production target**).
   **Phase-1 engine guard done (2026-07-01):** expression + blink overlays skipped when the raster base
   is active (`isAvatarR2ActiveFor`); presence/breathing stays; engine logic + C2 path untouched.
   **Phase-1 cosmetic slot-gate done (2026-07-01):** only aura/back render on the baked base.
   **✅ Phase-1 visual sign-off = PASS (2026-07-01)** —
   [167a-phase1-visual-signoff-checklist.md](./167a-phase1-visual-signoff-checklist.md) (clean alpha,
   exact Master likeness, suppression + slot-gate verified, clean C2 rollback). Authorises a **flagged
   preview only** — production stays `AVATAR_R2=false`, **not** Phase-2.
   **✅ Phase-1 pilot opt-in live (2026-07-01):** `isAvatarR2()` honours a per-browser
   `localStorage.avatar_r2='1'` override (no cohort/DB, no global flip). Onboard carefully-chosen
   neutral-medium, low-cosmetic users — [167a-phase1-pilot-rollout.md](./167a-phase1-pilot-rollout.md).
   **Steps 3b/3c (Phase-2 decomposition) not started** — audit + implementation plan now written:
   [167a-phase2-decomposition-plan.md](./167a-phase2-decomposition-plan.md) + asset brief P2-0
   [167a-phase2-asset-brief.md](./167a-phase2-asset-brief.md) (gated on human art + a WebP encoder;
   `AVATAR_R2` stays `false`). **P2-0 cut-guide tool shipped (2026-07-01):**
   `tools/avatar/extract-phase2-cut-guides.mjs` (deterministic, non-AI) emits anchor-overlay +
   per-zone crops to the gitignored `tools/avatar/build/phase2/` as painter guides — **review
   artifacts only** (no runtime asset, no `R2_MANIFEST` change, `AVATAR_R2` untouched).
   **✅ Phase-2 GATE 1 SATISFIED (2026-07-01, PR #7 `2159d3e`):** the cut-guide review worksheet
   ([167a-phase2-cut-guides-review-worksheet.md](./167a-phase2-cut-guides-review-worksheet.md)) is
   PASS and the **Phase-2 raster eye-box is owner-countersigned APPROVED** — the plan §13 gate 1
   (Phase-2-scoped anchor/eye-box sign-off) is cleared. Approval is **raster-path only**; the **legacy
   C2 anchors (`cx68/92 cy47`) stay frozen**. **Phase-2 runtime code may pass gate 1 only** — ~~gates
   2, 3, 5 remain OPEN~~ **[Gate 2 CLOSED 2026-07-14, D-056 — see below; gates 3 and 5 remain OPEN]**
   (remaining face/eyes/eyelid/hair layers, visual sign-off), so **Phase-2 implementation is still not
   started** and `AVATAR_R2` stays `false`.
   **✅ Gate 4 (WebP encoder) SATISFIED (2026-07-02):** vendored libwebp `cwebp.exe` 1.5.0
   (`tools/avatar/vendor/`, gitignored; reproducible via `fetch-cwebp.mjs`) + wrapper `encode-webp.mjs`;
   proven Phase-1 base 242 KB PNG → 37.7 KB WebP (alpha preserved, within budget); zero npm deps; build
   tooling only (no `assets/avatar-r2/`/manifest/`AVATAR_R2` change). Remaining blocker = the
   AI-assisted masked-decomposition art. **Art policy revised (D-042, 2026-07-02): AI-assisted masked
   decomposition allowed; AI regeneration/redesign forbidden** (no human painter available).
   **Art-production handoff written (2026-07-02) for gates 2–3:**
   [167a-phase2-artist-handoff.md](./167a-phase2-artist-handoff.md) — practical producer brief
   (layers, filenames/dims, keep-vs-remove, approved eye-box, 164B.3 gate, checklists; masked AI on the
   Master, no regeneration). Offline art deliverable; doc only.
   **⏳ HISTORICAL — SUPERSEDED BY D-056.** _Superseded by D-056: Gate 2 SATISFIED / CLOSED on 2026-07-14.
   The paragraph below records why Gate 2 was reopened in July 2026 — it is **NOT current status**._
   **Gate 2 REOPENED / UNDER RECOVERY (2026-07-05) — iter7 INVALIDATED (D-043)** _(historical)_**:** the iter7 base was
   found to have a structural **bust/chest-plate artifact**, so its owner-countersigned 164B.3
   CONDITIONAL PASS is **WITHDRAWN/SUPERSEDED** and the iter4→iter7 line is invalidated. A **candidate
   registered base-layer source is adopted** (REVISED 2026-07-06; **not a new Master** — the frozen Master
   remains the canonical identity/style/coordinate datum, **D-032 preserved**) —
   `recovery-base-v1-blankface.png` (`assets/avatar/reference/`), which fixes the anatomy (correct bald
   scalp, ears, head→neck→collar, no bust-plate, blank face) and registers to the Master by a deterministic
   translation **(+25 x, +285 y)** (body IoU ≈ 0.9921; ≈ 84.3 % pixels identical). It is **NOT passed:**
   needs (+25,+285) registration, feet-completion from the Master if needed, outfit neutralization (still
   non-neutral), and a fresh 164B.3 review. **Gate 3 PAUSED** _(at the time — since started 2026-07-15,
   see the Gate-3 status entry below)_ (hair/eyes/face **tooling** stays useful, but
   its **outputs are not approved layers** against the corrected base-layer path); Gate 5 open. **NOT promoted; no
   `assets/avatar-r2/`; no `R2_MANIFEST`; `AVATAR_R2` `false`;** Phase-2 not started. Decision:
   [167a-phase2-base-recovery-decision.md](./167a-phase2-base-recovery-decision.md).
   **Next step = Gate 2A DEFINED / PLANNED (2026-07-06):** narrow deterministic registration
   (translate **(−25, −285)** into the Master frame) + feet-completion audit + review-only composites +
   validation report; **excludes** outfit/face/eyes/eyelid/hair/runtime/promotion; **does NOT satisfy Gate 2
   by itself.** Plan: [167a-phase2-gate2a-registration-plan.md](./167a-phase2-gate2a-registration-plan.md).
   **Progression (2026-07-07):** Gate 2A **EXECUTED = PASS / owner-review-ready**; feet-completion
   **DEFERRED** into neutral-outfit/base-assembly; **neutral-outfit/base-assembly PLAN recorded** (strategy
   B: Master body/feet + recovery head, then one masked neutralization pass; short-sleeve tee ⇒ underarm
   reconstruction). Plan: [167a-phase2-neutral-outfit-base-assembly-plan.md](./167a-phase2-neutral-outfit-base-assembly-plan.md).
   **✅ GATE 2 CLOSED (2026-07-14, D-056).** The base-layer recovery reopened at D-043 is **complete**.
   Owner-approved Gate-2 candidate: **`d042-outfit-candidate-d053-arm-residue.png`** (sha `2CB93EE0…`);
   lineage **D-043 → D-048 donor lift → D-049 protect-mask-v2.1 → D-050 donor silhouette → D-052 collar
   cleanup → D-053 arm/torso residue cleanup**. **Final 164B.3: PASS WITH OWNER-ACCEPTED INHERITED §7
   ALPHA/MATTE EXCEPTION** — §2/§3/§4/§5/§6 all PASS (notably **§4: forearm ΔRGB vs the frozen hands 68 → 1**,
   the section that had blocked since D-045). **§7 is accepted, NOT fixed:** a global ~1 px white-matte fringe
   (**2,011 px**, of which **1,557 sit inside protect**) is inherited from the D-042/D-043 pipeline and is
   recorded as technical debt. **Closing Gate 2 is NOT promotion:** candidate stays gitignored; **no
   `assets/avatar-r2` write; no `R2_MANIFEST` change; `AVATAR_R2` stays `false`; Gate 3 stayed PAUSED
   _(at the time)_**; Gate 5 open. Register: `project-state.md` (**D-047 … D-056**).
   **▶ GATE 3 — CURRENT STATUS: STARTED (2026-07-15, explicit owner command, WP0 PR #69) —
   DETERMINISTIC LAYER SET COMPLETE & OWNER-COUNTERSIGNED (integration composite PASS, PR #86/#87).**
   Accepted Gate-3 candidates (gitignored build outputs, regenerable from the tracked D-057/D-058
   sources): hair z40 (`pl1/hair-pl1-color.png` + `pl2/hair-pl2-luminance.png`), eyes z4
   (`wp2/eyes-iris-wp2-luminance.png` + `eyes-neutral-fixed.png`), face z3 (neutral) + blush component.
   Decision record = the owner-countersigned Gate-3 worksheets (no new D-entries; register unchanged
   through D-058). **Remaining Gate-3 scope: the four D-042 expression variants** — producer tool
   `tools/avatar/build-face-expr-d042.mjs` is merged (PR #88) but has NEVER run; running it requires a
   separate owner decision (external image API: vendor + Master upload + budget). **D-053 remains
   gitignored and unpromoted**, and **`AVATAR_R2` remains `false`**, until promotion is separately
   authorised.
4. Visual-fidelity QA (32/48/64px legibility + human onion-skin sign-off) — **✅ done (Phase-1 PASS).**
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
5. ~~**157K — AI abstraction layer + `grade-answer` contract**~~ ✅ done — `_shared/ai/` + advisory
   `grade-answer`, default-off, no reward-path wiring; see [157k-ai-grading-contract.md](./157k-ai-grading-contract.md).
6. **Avatar M1 / 164L** — Master raster wiring + non-AI mask tooling (UNGATED; parallel track; gated
   only on the AI-assisted masked-decomposition art deliverable, D-042 (amends D-033) — see [167a-architecture-preservation-report.md](./167a-architecture-preservation-report.md)).
7. **157D ✅ / 157E ✅ — PostHog**: module + GDPR consent gate (157D) and core events
   (login/question_shown/question_answered/item_purchased) + consent banner (157E) — **done,
   default-off, double-gated, no sending until activated** ([157d-posthog-analytics.md](./157d-posthog-analytics.md)).
8. **157N ✅ / 157O ✅ — read-aloud** decided + built + **LIVE in prod** (Web Speech, `52e7a04`,
   2026-07-03; Piper clips = offline deliverable; [157o-read-aloud.md](./157o-read-aloud.md)).
   **157P** STT feasibility = UNGATED decision.
9. **157Q ✅ / 157R ✅ / 157S ✅** — consent consolidation (`js/consent.js`), flag hardening
   (`js/flags.js`), and default-off/fail-soft unit tests (`node --test` + `deno test`, 21 tests,
   [157s-test-coverage.md](./157s-test-coverage.md)) — **all done**. **Zero-cost services track
   complete**; remaining work is gated on staging (157CB) or the avatar art deliverable (167A).
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
| Avatar art = Northstar Master | 🟡 Planned | 167A; flat placeholder live; needs AI-assisted masked-decomposition art (D-042). |
| Cohort / % rollout | ❌ None | OQ-4; only constant + localStorage override. |
| Error reporting (Sentry) — frontend | ✅ Foundation (157B), default-off | `js/sentry.js`; routes `logError`; set `ENABLE_SENTRY=true` + DSN to activate. |
| Error reporting (Sentry) — Edge | ✅ Foundation (157C), default-off | `_shared/monitoring.ts` `withObservability`; set `ENABLE_SENTRY_EDGE=true` + `SENTRY_DSN_EDGE`. 1 reference fn wired, 15 to migrate. |
| Observability — live validation | 🟡 HARD GATE (staging) | Static-validated; live (Part B) needs a non-prod target. Foundations production-safe meanwhile. |
| Staging environment (157CB) | 🗓️ Future infra | Reclassified (157CC): long-term plan, **not** an immediate blocker. Free local stack interim; paid branch at launch. |
| Analytics (PostHog) | ✅ Module + events (157D/157E), default-off | `js/analytics.js` + consent gate + banner; core events wired (login/question/purchase), double-gated. Activation needs key + consent + staging. |
| OCR / document recognition | ✅ Foundation (157I), default-off | `js/ocr/` generic service (answers + future worksheets/sources/teacher material); browser-only wasm, **no image upload**, zero-cost. Set `ENABLE_OCR=true` to activate. |
| AI abstraction / grading (Ollama) | ✅ Layer (157K), default-off / FUTURE (activation) | `_shared/ai/` + advisory `grade-answer` shipped, default-off, no reward-path wiring. 157L process-event wiring + activation need staging + 157J reachability. |
| TTS (read-aloud) | ✅ **LIVE in prod** (157N/157O, Web Speech, `52e7a04`; per-option 🔊 `eb6d5fc`) | `js/read-aloud/` on-device Web Speech (Danish voice preferred) + pre-gen Piper (clips = offline deliverable); quiz "🔊 Læs op" **+ per-MC-option 🔊** (reads one option, never submits). `ENABLE_READ_ALOUD=true`. |
| STT (Whisper) | ⏸ Deferred | 157P feasibility decision. |
| Image CDN (Cloudinary) | ✅ Foundation (157G), default-off | `js/cloudinary.js` fetch-mode, no secret, raster-only, fail-soft to origin; Storage stays source of truth. Set `ENABLE_CLOUDINARY=true` + cloud name (after 167a raster). |

Legend: ✅ live · 🟡 planned/audited · ⏸ deferred · ❌ not present.
