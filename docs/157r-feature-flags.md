# 157R — Feature Flags & Rollback (Hardening Runbook)

Status: **IMPLEMENTED — flag registry + canonical runbook.** No behavioural change.
Date: 2026-06-30. Owner: project owner (solo). Gate: **SOFT** (cross-cutting).
Registry: `js/flags.js` (read-only diagnostics). Rules: [CLAUDE_WORKFLOW.md](./CLAUDE_WORKFLOW.md) (rollback),
[ARCHITECTURE.md](./ARCHITECTURE.md) §10. Canonical reference for every flag + how to roll back.

---

## 1. Hardening invariant (binding)

- **Every external-integration flag is DEFAULT-OFF and FAIL-SOFT.** With defaults, the app behaves as
  if the integration did not exist (no SDK/network/UI), and any failure degrades silently.
- **`AVATAR_V2` and `ENABLE_READ_ALOUD` are the intentional DEFAULT-ON flags**, each with a documented
  one-commit rollback. Read-aloud (157O, live `52e7a04`) is **on-device — no egress** — so it is not an
  "external-integration" flag and needs no consent.
- **Optional third-party egress also requires consent** (157Q) — flag-on alone never sends data.
- New flags follow the convention: a boolean constant (or env var on the edge) + an `isX()` accessor;
  default-off; fail-soft; documented here.

## 2. Frontend flag inventory

| Flag | Location | Default | Override | Accessor | Fail-soft |
|---|---|---|---|---|---|
| `AVATAR_V2` | `js/avatar-layers.js` | **`true`** (on) | `localStorage.avatar_v2='1'` | `isAvatarV2()` | render falls back to base/legacy |
| `AVATAR_R2` | `js/avatar-layers.js` | **`true`** — default render since **D-101** (2026-08-08) | `localStorage.avatar_r2='0'` = per-browser **opt-OUT** → C2. **The legacy pilot value `'1'` is INERT** (falls through to the default), so a stale key cannot pin a browser to R2 against the flag | `isAvatarR2()` | On (default) the render is the **Phase-2 decomposed WebP stack** (base `body-neutral-medium-v2.webp` + face/eyes/iris/blush/hair) with **live blink**. **Neutral-medium only** — every other identity, an unregistered torso item (D-083) and a failed mandatory asset (D-062) each render the complete C2 avatar. Note: R2 always draws `hair-northstar-v1.webp`; the **7 selectable C2 hairstyles do not apply** on R2 (colour is still tinted). Rollback + the discontinued pilot: `docs/167a-phase1-pilot-rollout.md` §16 |
| `ENABLE_SENTRY` | `js/sentry.js` (+ `SENTRY_DSN`, + `error_monitoring` consent) | `false` | — | `isSentryConfigured()` / `isMonitoringEnabled()` | no SDK/network; console logging continues |
| `ENABLE_OCR` | `js/ocr/index.js` | `false` | — | `isOcrEnabled()` | no control; manual text entry |
| `ENABLE_CLOUDINARY` | `js/cloudinary.js` (+ cloud name) | `false` | — | `isCloudinaryEnabled()` | returns origin URL |
| `ENABLE_ANALYTICS` | `js/analytics.js` (+ key, + `analytics` consent) | `false` | — | `isAnalyticsConfigured()` / `isAnalyticsActive()` | no SDK/events |
| `ENABLE_READ_ALOUD` | `js/read-aloud/index.js` | **`true`** (live, `52e7a04`) | — | `isReadAloudEnabled()` | no control; no audio |

Consent categories (`js/consent.js`, 157Q): `analytics`, `error_monitoring`, `ai_features` — default
`unknown` → flow off until opt-in.

## 3. Edge (server-side) flag inventory

| Flag (env) | Function | Default | Gate |
|---|---|---|---|
| `ENABLE_SENTRY_EDGE` (+ `SENTRY_DSN_EDGE`) | `_shared/monitoring.ts` | unset → off | `withObservability` inert; identical responses/latency |
| `ENABLE_AI_GRADING` (+ `OLLAMA_BASE_URL`) | `_shared/ai/` + `grade-answer` | unset → off | returns `available:false`; no provider call |

Env flags are not visible to the browser; set via `supabase secrets set` and deploy.

## 4. Diagnostics — `js/flags.js`

Read-only snapshot of frontend flag/consent state for ops/debugging. `installFlagDiagnostics()` (called
in `app.js`) exposes **`window.__flags()`** in the browser console:
```js
window.__flags()
// { avatar_v2:{default_on:true,active:true}, sentry:{configured:false,active:false},
//   ocr:{active:false}, cloudinary:{active:false}, analytics:{configured:false,active:false},
//   read_aloud:{active:true}, consent:{analytics:"unknown",...} }
```
It never mutates anything; it only reports.

## 5. Rollback procedures

**Per-flag kill switch (fastest — no code revert):**
- Frontend: set the flag constant to `false` (or clear its DSN/key/cloud name) → redeploy. The
  integration goes fully inert.
- Edge: unset the env (`supabase secrets unset ENABLE_…`) or set `=false` → redeploy the function.
- Consent: a user opt-out (`setOptionalConsent(false)`) stops all optional flows for that user.

**Avatar (`AVATAR_V2`, default-on):**
- Disable per-browser: `localStorage.avatar_v2` cleared has no effect (constant is `true`); to roll back
  globally, set `AVATAR_V2 = false` **or** `git revert 52f8365` (the activation commit) → legacy render.
  Golden-prep + retry commits are flag-decoupled and stay green (see `docs/167a-master-asset-raster-wiring-plan.md` §H).

**Code rollback (git):**
- Each integration shipped as a small, self-contained commit → `git revert <sha>` removes it cleanly.
- Prefer the flag kill-switch over a revert when the flag is default-off (no revert needed — it's
  already inert).

**Database:** none of the 157x service work changes schema; nothing to roll back at the DB level.

## 6. Validation

| # | Check | Result |
|---|---|---|
| A1 | `js/flags.js` + `app.js` valid ESM (`node --check`) | ✅ Pass |
| A2 | Read-only (snapshot only; no mutation of any flag) | ✅ Pass (review) |
| A3 | `window.__flags()` reports all default-off (today) + `avatar_v2` on | ✅ (manual console) |
| A4 | Importing `flags.js` has no side effects beyond exposing `window.__flags` | ✅ Pass (review) |
| A5 | Production smoke green (no behavioural change) | ✅ Pass |

## 7. Scope / non-goals

- **No refactor of flag consumers** — each module keeps its own constant + gate; `flags.js` only
  aggregates read state (hardening via consolidation + runbook, not rewrite).
- **No new override mechanisms** added to flags that don't have them (only `AVATAR_V2` has a
  localStorage override, intentionally).
- 157S (Playwright fail-soft/default-off coverage) follows.
