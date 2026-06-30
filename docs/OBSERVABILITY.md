# OBSERVABILITY.md — Den Seje App

_Canonical operational document for monitoring/observability (Sentry). Owns: activation,
deployment, release process, request correlation, troubleshooting, and the operator runbook._
_Foundations: [157b-sentry-validation-checklist.md](./157b-sentry-validation-checklist.md) (frontend),
[157c-edge-validation-checklist.md](./157c-edge-validation-checklist.md) (edge). Architecture:
[ARCHITECTURE.md](./ARCHITECTURE.md) §13.1–§13.2. Rules: [AI_GUIDELINES.md](./AI_GUIDELINES.md)._
_Owner: project owner (solo). Last reviewed: 2026-06-30._

> **Status (2026-06-30):** the monitoring platform is **implemented and statically validated**, and
> ships **default-off** (zero impact). It is **NOT yet activated/live-validated** — that requires a
> Sentry account (DSNs) and a staging environment, neither of which exists yet. This document is the
> procedure to activate and validate it safely. See §10 for the precise prerequisites.

---

## 1. Architecture

Two foundations, one design philosophy (default-off, fail-soft, PII-scrubbed, behaviour-preserving):

```
  Browser                                   Supabase Edge (Deno)
  ┌───────────────────────────┐             ┌───────────────────────────────┐
  │ app.js / js/admin.js       │            │ function handler              │
  │   logError() ──► captureError            │   serve(withObservability(... ))
  │ js/sentry.js (157B)        │            │ _shared/monitoring.ts (157C)  │
  │   • global handlers        │            │   • request_id + timing       │
  │   • resource errors        │            │   • metadata                  │
  │   • scrub + tags           │            │   • scrub + tags              │
  └──────────┬────────────────┘             └──────────────┬────────────────┘
             │ ENABLE_SENTRY (+DSN)                          │ ENABLE_SENTRY_EDGE (+SENTRY_DSN_EDGE)
             ▼                                               ▼
        Sentry (frontend project)                      Sentry (edge project)
```

- **Frontend (`js/sentry.js`, 157B):** wraps the existing `logError()` boundary; captures uncaught
  exceptions, unhandled promise rejections, resource-load failures. Detail: ARCHITECTURE.md §13.1.
- **Edge (`_shared/monitoring.ts`, 157C):** one `withObservability(name, handler)` boundary every
  function inherits; captures uncaught (re-thrown unchanged) + handled 5xx; request_id + timing +
  metadata. Detail: ARCHITECTURE.md §13.2.

## 2. Sentry project structure (Task 1 decision)

**DECIDED (owner, 2026-06-30): one Sentry organisation, two projects** —
`den-seje-app-frontend` (browser) and `den-seje-app-edge` (deno). Environments separated by the
`environment` tag (`staging` / `production`), not by project.

| Project | Platform | Receives | Why separate |
|---|---|---|---|
| `den-seje-app-frontend` | Browser / JavaScript | events from `js/sentry.js` | Different SDK, different noise profile (browser extensions, user devices), browser source maps |
| `den-seje-app-edge` | Deno / Node | events from `_shared/monitoring.ts` | Different SDK + release semantics; backend issues separated from client noise; independent alerting/quota |

**Acceptable simplification (pilot scale):** a **single shared project** is fine for a solo,
low-volume pilot — frontend vs edge are already distinguishable by the `runtime`, `page` and
`function_name` tags. Start with two if you want clean alerting; collapse to one to minimise
overhead. Either way, **use `environment` to separate `staging` from `production`** (do not use
separate projects per environment).

## 3. Feature flags

| Flag | Where | Default | Effect when off |
|---|---|---|---|
| `ENABLE_SENTRY` | `js/sentry.js` (code constant) + `SENTRY_DSN` constant | `false` / empty DSN | No SDK download, no listeners, no network. Zero runtime impact. |
| `ENABLE_SENTRY_EDGE` | Supabase secret (env) + `SENTRY_DSN_EDGE` secret | unset → off | No SDK import, identical responses + latency. |

Both are **fail-closed on missing DSN**: even if the flag is on, an empty/missing DSN keeps
monitoring off. Activation always requires **flag ON + DSN present**.

## 4. Activation procedure

> Activate **staging first** (§5). Production stays default-off until staging validation passes.

### 4a. Frontend (157B)
1. Create the Sentry **frontend** project; copy its **browser DSN** (public — safe to commit).
2. In `js/sentry.js`: set `const SENTRY_DSN = "<browser-dsn>";` and `export const ENABLE_SENTRY = true;`.
3. Set the release (§6): add `<meta name="app-release" content="den-seje-app@<git-sha>">` to the
   `<head>` of the served HTML pages (or update `SENTRY_RELEASE`).
4. Deploy to a **staging Vercel deployment** (preview), not production.

### 4b. Edge (157C)
1. Create the Sentry **edge** project; copy its **DSN**.
2. Set secrets on the **staging Supabase project** (never commit these):
   ```
   supabase secrets set \
     ENABLE_SENTRY_EDGE=true \
     SENTRY_DSN_EDGE=<edge-dsn> \
     SENTRY_ENVIRONMENT=staging \
     SENTRY_RELEASE=den-seje-app-edge@<git-sha>
   ```
3. Deploy the functions to be tested (§5): `supabase functions deploy get-reviewed-answers` (plus any
   others migrated to `withObservability`).

**Secret hygiene:** DSNs and secrets are configured via Vercel env / Supabase secrets / the code DSN
constant — never printed to logs, never echoed, never committed (`.env*` is gitignored). The Edge DSN
is a Supabase **secret**; the browser DSN is public by design (like the anon key).

## 5. Deployment

- **Frontend:** Vercel auto-deploys `main`. For staging, use a **preview deployment** (a branch /
  preview URL) with the flag on, so production stays default-off.
- **Edge:** `supabase functions deploy <name>` deploys independently. The repo has **16 functions**;
  only `get-reviewed-answers` is wired to `withObservability` today (reference). Deploy only what you
  are validating. Migrate + deploy the rest incrementally (see ARCHITECTURE.md §13.2 migration path).
- **Verify deployment:** `supabase functions list` (and the function logs) confirm the deployed
  version; invoke the function and confirm a normal response before checking Sentry.

## 6. Release process / strategy (Task 9)

Goal: a release tag that ties an event back to a specific commit, **consistent across frontend and
edge** so one git SHA maps to both.

| Surface | Release value | How it is set (no build step) |
|---|---|---|
| Frontend | `den-seje-app@<git-sha>` | `<meta name="app-release">` written at deploy, or the `SENTRY_RELEASE` constant in `js/sentry.js` |
| Edge | `den-seje-app-edge@<git-sha>` | `SENTRY_RELEASE` Supabase secret set at deploy |

**Recommended automation (small, optional):** wrap deploys in a script that injects
`git rev-parse --short HEAD`:
- Frontend: a deploy step that writes the meta tag (or a generated `release.js`) with the SHA.
- Edge: `supabase secrets set SENTRY_RELEASE=den-seje-app-edge@$(git rev-parse --short HEAD)` before
  `supabase functions deploy`.

Use the **same SHA** for both so a release in Sentry correlates frontend and edge. Until automated,
the value is maintained manually (acceptable at pilot scale); the default is `…@unknown`.

## 7. Request correlation (Task 7)

**Design:** a single `request_id` is the join key across the stack:

```
Frontend (generates id)  →  Edge (reuses inbound x-request-id)  →  DB / logs  →  Sentry  →  future AI
```

- **Edge (implemented):** `withObservability` **reuses** an inbound `x-request-id` /
  `x-correlation-id` header if present, else generates `crypto.randomUUID()`. The id is tagged on
  every Sentry event (`request_id`) and available to handlers as `ctx.requestId` for log lines.
- **Frontend → Edge (GAP — not yet wired):** the frontend's `supabase.functions.invoke(...)` calls do
  **not yet send** an `x-request-id`. So today the edge generates its own id per request; full
  end-to-end (one id spanning frontend error → edge error) is **not yet closed**.
  - **Ready-to-apply enhancement (one place):** generate an id in `js/sentry.js`, set it as a Sentry
    tag on the frontend, and pass it as an `x-request-id` header on `functions.invoke` (supabase-js
    supports per-call `headers`). The edge already honours it. This is a small, additive change —
    deferred to a follow-up so it can be **validated live** rather than shipped blind.
- **Future AI correlation point:** when AI Edge Functions are added ([AI_GUIDELINES.md](./AI_GUIDELINES.md)),
  they inherit the same `request_id` via `withObservability`, extending the same chain to AI calls.

## 8. Troubleshooting

| Symptom | Likely cause | Action |
|---|---|---|
| No events in Sentry (flag on) | DSN empty/wrong; CDN/import blocked; events scrubbed→dropped | Confirm DSN; check the SDK URL loads; check a non-PII test error; verify project/environment filter |
| Events but no `release` | release not set | Set the meta tag / `SENTRY_RELEASE` (§6) |
| Events but no `request_id` correlation across surfaces | frontend doesn't send `x-request-id` (§7 gap) | Apply the §7 enhancement (then re-validate) |
| Frontend silent, console still logs | working as designed when disabled or on transport failure (fail-soft) | Expected; check flag + DSN |
| Suspected PII in an event | scrubber gap | **Stop. Treat as an incident.** Disable the flag, reproduce, extend `SENSITIVE_KEYS`/scrub, re-validate §B8 / Task 8 |
| Edge latency rose after enabling | flush awaited on hot path | Confirm `EdgeRuntime.waitUntil` is used (it is); investigate the SDK transport |
| `deno check` fails after edit | type error in a migrated function | Fix before deploy; never deploy a function that fails `deno check` |

## 9. Operational runbook

- **Kill switch:** set `ENABLE_SENTRY = false` (frontend) / `ENABLE_SENTRY_EDGE` unset or `false`
  (edge secret) → monitoring stops immediately; app behaviour unchanged. No code rollback needed.
- **Rotating a DSN:** update the constant (frontend) / secret (edge); redeploy the affected surface.
- **PII incident:** disable the flag for the affected surface first; reproduce with the flag pointed
  at a throwaway project; fix the scrubber; re-run the PII checklist item before re-enabling.
- **Quota/noise:** filter by `environment`, `function_name`, `page`; consider sampling later; split
  to two projects (§2) if one is too noisy.
- **Never** await Sentry flush on the request path; **never** let monitoring change a response or
  throw into a function/page (both are guaranteed by construction — keep it that way in migrations).

## 10. Activation prerequisites — delivered by Section 157CB (staging environment)

> **Policy (owner, 2026-06-30): no external service is activated or validated against production.**
> A dedicated **staging environment (Section 157CB)** is the prerequisite for live observability
> validation **and** for every remaining external integration (PostHog, Cloudinary, AI, OCR). See
> [ROADMAP.md](./ROADMAP.md).

Full live validation (157CA Tasks 5–8, 10) is **blocked** until 157CB provides:
1. **A Sentry account + the two projects** (§2) → real DSN(s). (Owner creates these.)
2. **A non-production staging target:** a Supabase **Pro branch** (per `project-state.md` D-006)
   **and** a Vercel **preview** deployment, with its own config/secrets — so flags can be turned
   **on** without touching production.
3. **Deploy credentials scoped to staging** (Supabase CLI login / access token, or scoped MCP to the
   **staging** project — **never** the production ref `tjzbehwfagiwpwodsgwg`).

Until 157CB lands: the platform stays **default-off and production-safe**, static validation is green
(§11), and live validation is a documented, ready-to-run procedure to execute in staging.

## 11. Validation status

- **Static (run 2026-06-30):** frontend `node --check` ✅ (`js/sentry.js`, `app.js`, `js/admin.js`);
  edge `deno check` ✅ (`_shared/monitoring.ts`, `_shared/foundation.ts`, `get-reviewed-answers`);
  production smoke ✅ (unchanged baseline). Default-off zero-impact + fail-soft + PII fail-closed
  confirmed by review.
- **Live (157B Part B / 157C Part B):** **PENDING** — requires §10 prerequisites. Run both checklists
  end-to-end in staging, then update §11 and the 157CA report to PASS.
