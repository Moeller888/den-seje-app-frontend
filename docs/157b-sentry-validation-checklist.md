# 157B — Sentry Frontend: Validation Checklist

_Proof-of-correctness checklist for the Section 157B error-monitoring foundation._
_Module: `js/sentry.js`. Boundaries: `app.js`, `js/admin.js`. Owner: project owner._
_Last reviewed: 2026-06-30._

This section ships **default-off** (`ENABLE_SENTRY = false`, empty DSN). Part A is verified now,
with the flag off and code undeployed; Part B is the activation acceptance test to run in a staging
context against a **real Sentry project DSN** before relying on monitoring in production.

---

## A. Verified now (flag off, pre-deploy)

| # | Check | Method | Result |
|---|---|---|---|
| A1 | All three JS files are valid ESM (no syntax/module errors) | `node --check` on `js/sentry.js`, `app.js`, `js/admin.js` | ✅ Pass |
| A2 | Import paths resolve | `app.js → ./js/sentry.js`, `admin.js → ./sentry.js` (files exist) | ✅ Pass |
| A3 | Production core flow unchanged | `npx playwright test tests/example.spec.ts --project=chromium` (live URL) | ✅ Pass (1 passed) |
| A4 | Zero runtime impact when disabled | Code review: `initMonitoring()` returns immediately when `isEnabled()` is false (no `import()`, no listeners, no network); `captureError()` returns immediately; static import of `js/sentry.js` has **no top-level side effects** | ✅ Pass |
| A5 | No behavioural change to `logError` | `logError` keeps its exact `console.error` call; `captureError` is appended and is a no-op when disabled | ✅ Pass |
| A6 | Fail-soft by construction | Every public path (`initMonitoring`, `captureError`, listeners, scrubbers, SDK load) is wrapped in try/catch; SDK load uses `.catch`; scrub failure returns `null` (event dropped) | ✅ Pass (review) |

## B. Activation acceptance test (staging, real DSN)

**Setup:** in a staging deploy, set `SENTRY_DSN` to the project's browser DSN and `ENABLE_SENTRY = true`
in `js/sentry.js` (optionally set `<meta name="app-release" content="den-seje-app@<commit>">`).
Open the student app (`index.html`) and the admin page (`admin.html`).

| # | Check | How to verify | Expected |
|---|---|---|---|
| B1 | **Sentry receives exceptions** | In console: `throw new Error("157B-test-uncaught")` (or trigger a `logError` path) | Event appears in Sentry Issues with tags `environment`, `release`, `page`, `browser`, `flag_enable_sentry`, `flag_avatar_v2` |
| B2 | **Unhandled promise rejections captured** | In console: `Promise.reject(new Error("157B-test-rejection"))` | Event appears in Sentry (unhandledrejection) |
| B3 | **Resource load failures captured** | Add a broken asset, e.g. `var i=document.createElement("img"); i.src="/__missing__.png"; document.body.appendChild(i)` | A `warning` "Resource load failed: img" event appears, tag `error_kind=resource` |
| B4 | **PII removed — answer text** | Submit a quiz answer to force a `SUBMIT_ERROR`/`logError`, or run `console.log("SUBMIT", {userAnswer:"hemmelig svar"})` then trigger an error | No event or breadcrumb contains the answer text; **console breadcrumbs are absent** |
| B5 | **PII removed — tokens/keys** | Trigger an error whose payload includes a JWT (e.g. a Supabase error object) | Any `eyJ…` JWT / `Bearer …` is shown as `[redacted-token]`; sensitive-named keys show `[redacted]` |
| B6 | **PII removed — email** | Cause an error referencing an email address | Email shown as `[redacted-email]` |
| B7 | **No user identity / headers / cookies** | Inspect any captured event | `event.user` absent; `request.headers`/`cookies`/`data`/`query_string` absent; no `localStorage` contents |
| B8 | **Existing behaviour unchanged (flag on)** | Run full suite `npx playwright test`; manual smoke of quiz + shop + admin | All green; UI identical; no new errors surfaced to the user |
| B9 | **Feature flag disables integration** | Set `ENABLE_SENTRY = false` (or clear the DSN), reload | No SDK network request (`browser.sentry-cdn`/`jsdelivr @sentry`), no events sent, console logging still works |
| B10 | **Sentry outage fails soft** | Block the Sentry/CDN domain in devtools, repeat B1 | App behaves normally; no UI error, no crash; `console.error` still logs |

## How to enable in production

1. Create/locate the Sentry project; copy its **browser DSN** (public — safe to commit).
2. In `js/sentry.js` set `const SENTRY_DSN = "<dsn>";` and `export const ENABLE_SENTRY = true;`.
3. (Recommended) Set the release per deploy via `<meta name="app-release" content="den-seje-app@<git-sha>">`
   in the HTML `<head>`, or update `SENTRY_RELEASE`. (No build step → release is set manually until
   automated; see ARCHITECTURE.md §13.1.)
4. Deploy, then run Part B against staging before trusting production monitoring.

## Notes / limitations

- **Coverage:** wired into the two pages with the `logError` infrastructure (`app.js` student quiz,
  `js/admin.js`). Global handlers (uncaught/rejection/resource) are active on any page that imports
  the module. Extending to hub/shop/teacher/login is a one-line import each — incremental follow-up.
- **Release tag:** without a build step the release value is maintained manually (meta tag or
  constant); automating it from the git SHA is a candidate for 157C/ops.
- **Tests run against production**, so B1–B10 require a staging deploy with the flag on; they cannot
  be exercised by the live-URL Playwright suite while the flag is off.
