# 157D — PostHog Analytics Module + Consent Gate

Status: **IMPLEMENTED — module + consent gate, default-off, not wired.** No events sent.
Date: 2026-06-30. Owner: project owner (solo). Gate: **SOFT** (build now, activate later).
Module: `js/analytics.js`. Rules: [PROJECT_VISION.md](./PROJECT_VISION.md), [AI_GUIDELINES.md](./AI_GUIDELINES.md)
(privacy). Events are wired in **157E**; consent UI consolidation in **157Q**.

---

## 1. Purpose

A privacy-first analytics boundary for a platform used by **minors**. `js/analytics.js` is the single
place that talks to PostHog; pages will emit events via `track()` (157E), never PostHog directly. This
section ships the **module + GDPR consent gate** only — **no events are wired and none are sent.**

## 2. Privacy/GDPR design (the centerpiece)

- **Default-off:** `ENABLE_ANALYTICS=false` / empty `POSTHOG_KEY` → no SDK download, no network, no
  cookies, no events. The static import has no side effects.
- **Consent-gated:** even when enabled + keyed, **nothing loads or sends until `setConsent(true)`**.
  `initAnalytics()` is safe to call on page load — it loads nothing until the user has opted in.
  Consent is stored in `localStorage` (`analytics_consent` = granted/denied/unknown).
- **Data-minimised by configuration:** `autocapture:false`, `capture_pageview:false`,
  `disable_session_recording:true`, `person_profiles:"identified_only"` (no person profiles — we never
  identify), `persistence:"localStorage"` (no third-party cookies), `mask_all_text:true`.
- **PII scrubbed:** `track()` drops sensitive-named keys (answer/email/name/token/…), scrubs
  JWT/email patterns from string values, drops nested objects, and clamps length. No student names,
  emails, answer text, or tokens can be sent.
- **EU region** ingestion host by default (`https://eu.i.posthog.com`).
- **No secret:** the PostHog project key is public (like the anon key).

## 3. Public API

| Function | Behaviour |
|---|---|
| `getConsent()` | `"granted" \| "denied" \| "unknown"`. Never throws. |
| `hasConsent()` | `true` only when explicitly opted in. |
| `setConsent(granted)` | Persist the decision; grant → init; deny → opt out. Never throws. |
| `isAnalyticsActive()` | `enabled && keyed && consented && capable`. |
| `initAnalytics()` | No-op unless active; loads the SDK only after consent. |
| `track(event, props)` | No-op unless active; props sanitised/minimised. (Wired in 157E.) |

## 4. Validation

### A. Verified now (default-off, unwired)
| # | Check | Method | Result |
|---|---|---|---|
| A1 | `js/analytics.js` valid ESM | `node --check` | ✅ Pass |
| A2 | Default-off → zero impact | `flagEnabled()` false unless key+flag; static import has no side effects | ✅ Pass (review) |
| A3 | **Consent gate** | `isAnalyticsActive()` requires `hasConsent()`; `initAnalytics()` loads nothing without consent | ✅ Pass (review) |
| A4 | PII scrubbing | `sanitizeProps` drops sensitive keys, scrubs email/JWT, drops objects, clamps length | ✅ Pass (review) |
| A5 | Fail-soft | every path try/catch; SDK lazy-load `.catch`; `track` no-ops when inactive | ✅ Pass (review) |
| A6 | Not wired / no events | module is unimported; production untouched (smoke green) | ✅ Pass |
| A7 | Minimised config | autocapture/pageview/session-recording off; no identify; EU host; no cookies | ✅ Pass (review) |

### B. Activation acceptance test (staging — gated on 157CB)
Set `ENABLE_ANALYTICS=true` + `POSTHOG_KEY=<public key>`, wire a consent banner (157E/157Q), deploy to staging:
- B1 before consent → no SDK request, no events (Network).
- B2 `setConsent(true)` → SDK loads; `track("test")` appears in PostHog (EU project).
- B3 a `track` with `{answer:"…", email:"…"}` → those keys are **absent**; strings scrubbed.
- B4 `setConsent(false)` → opt-out; no further events; reload → nothing loads.
- B5 flag off → no SDK, no events regardless of consent.
- B6 no PII identify; no session recording; no third-party cookies set.

## 5. Scope / non-goals

- **No events wired** (that is **157E**): the module ships unimported; no page calls `track()` yet.
- **No consent banner UI** here: `setConsent` is the mechanism; the banner + its wiring are
  **157E/157Q** (consent consolidation across all third-party flows).
- **No activation** here: sending events needs a key + consent UI + **staging (157CB)** per the
  staging-first policy. Until then the module is inert.

## 6. 157E — events + consent banner (done)

157E wired the module into live surfaces, all **additive and double-gated** (`track()` no-ops unless
active; the banner renders only when configured + consent unknown → nothing today with the flag off):

- **Consent banner:** `js/analytics-consent.js` `maybeShowConsentBanner()` — minimal Danish opt-in bar
  ("Ja tak"/"Nej tak" → `setConsent`); shown on login, quiz (`index`) and shop only when analytics is
  configured and consent is `"unknown"`. Fail-soft; never blocks a page.
- **Core events** (`track()`, properties PII-free): `login` `{role}` (`js/login.js`); `question_shown`
  `{format}` and `question_answered` `{status}` (`app.js`); `item_purchased` `{item_id}` (`shop.html`).
- **Init:** `initAnalytics()` + `maybeShowConsentBanner()` called at load on login/quiz/shop —
  no-ops until enabled + consented.
- **Verified:** `node --check` on all changed JS + shop's module script; production smoke green
  (login/quiz/shop paths unchanged with the flag off). New export: `isAnalyticsConfigured()`.
