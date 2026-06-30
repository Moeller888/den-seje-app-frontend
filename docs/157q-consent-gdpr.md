# 157Q — Consent & GDPR Consolidation (Canonical Privacy Map)

Status: **IMPLEMENTED — consolidated consent SoT + canonical privacy map.** Default-off; nothing sent.
Date: 2026-06-30. Owner: project owner (solo). Gate: **SOFT** (cross-cutting).
SoT module: `js/consent.js`. Banner: `js/analytics-consent.js`. Rules: [AI_GUIDELINES.md](./AI_GUIDELINES.md),
[PROJECT_VISION.md](./PROJECT_VISION.md). This is the **canonical privacy/consent document** for the project.

---

## 1. Purpose

The platform serves **minors**. As external integrations were added (Sentry, PostHog, AI, Cloudinary,
OCR, read-aloud), consent risked being per-feature and inconsistent. 157Q **consolidates consent into
one source of truth** (`js/consent.js`) that every optional third-party-egress flow consults, adds one
banner, and documents the legal basis + data flow for **every** integration.

## 2. Consent source of truth — `js/consent.js`

- One store (`localStorage` key `consent_v1`), categories: `analytics`, `error_monitoring`,
  `ai_features`. Migrates the old `analytics_consent` key.
- API: `getConsent(cat)` / `hasConsent(cat)` / `isUndecided(cat)` / `setConsent(cat, granted)` /
  `setOptionalConsent(granted)` / `getAllConsent()`. Pure, defensive, never throws.
- **Optional third-party egress is OPT-IN:** until decided, a category is `"unknown"` → its flow stays off.

Consolidated consumers:
- **`js/analytics.js`** (157D/157E) → category **`analytics`** (delegates its consent API to the SoT).
- **`js/sentry.js`** (157B) → category **`error_monitoring`** (`isEnabled()` now also requires consent).
- **AI (`grade-answer`, 157K)** → category **`ai_features`**: the **frontend caller must check
  `hasConsent("ai_features")` before invoking** (server can't see browser consent). Enforced at the
  teacher-tooling wiring (157M).

## 3. Consolidated banner — `js/analytics-consent.js`

One opt-in banner (`maybeShowConsentBanner()`), shown only when an optional flow is **configured** and
its category is **undecided**. Accept → `setOptionalConsent(true)` + re-init the consented flows;
Decline → `setOptionalConsent(false)`. With everything default-off it never appears (no-op).

## 4. Canonical data-flow & legal-basis map

| Integration | Data that leaves the device | Third party? | Category / basis | Consent |
|---|---|---|---|---|
| **Sentry — frontend** (157B) | error events, PII-scrubbed (no names/emails/answers/tokens) | Yes (Sentry) | `error_monitoring` | **Opt-in** (157Q). Owner may instead document legitimate-interest for PII-free ops monitoring. |
| **Sentry — edge** (157C) | server error events, PII-scrubbed | Yes (Sentry) | operational / legitimate-interest | Server-side; no per-user browser consent feasible. PII-scrubbed; disclose in policy. |
| **PostHog** (157D/157E) | anonymous product events, PII-scrubbed, EU host | Yes (PostHog) | `analytics` | **Opt-in** (banner). |
| **AI grading** (157K) | the **answer text** (+ rubric/question), minimised/scrubbed | Yes (AI endpoint) | `ai_features` | **Opt-in**; advisory-only; self-hosted/zero-retention endpoint required. |
| **Cloudinary** (157G) | avatar **image URL** (no personal data); user IP reaches the CDN | Yes (Cloudinary) | essential delivery / legitimate-interest | No personal data egress; standard CDN. Disclose. |
| **OCR** (157I) | **nothing** — runs on-device (wasm); only confirmed text enters the app | No | on-device | No consent for egress (none occurs). Camera/file permission is browser-native. |
| **Read-aloud** (157O) | **nothing** — Web Speech on-device / first-party clips | No* | on-device | No egress. *Some OS voices may process server-side — prefer pre-recorded clips; disclose if cloud voices are used. |

## 5. Principles (binding)

- **On-device features are not third-party flows** (OCR, read-aloud Web Speech) — no egress, no consent
  gate needed; still disclosed in the privacy policy.
- **Every optional third-party egress is opt-in** via `js/consent.js`; default state sends nothing.
- **Data minimisation + PII scrubbing** apply at every boundary (already implemented per feature).
- **EU region / self-hosted / zero-retention** preferred for any processor (PostHog EU host; AI
  self-hosted; Sentry region to be set at activation).
- **No selling/sharing**, no ad networks, no cross-site tracking, no PII identify.

## 6. Validation

### A. Verified now (default-off)
| # | Check | Result |
|---|---|---|
| A1 | `consent.js`, `analytics.js`, `sentry.js`, `analytics-consent.js` valid ESM (`node --check`) | ✅ Pass |
| A2 | One consent store; analytics + sentry both consult it (no duplicate stores) | ✅ Pass (review) |
| A3 | Legacy `analytics_consent` migrated into `consent_v1` | ✅ Pass (review) |
| A4 | Sentry now consent-gated (`isEnabled` = configured + `error_monitoring` consent) — default-off, no behaviour change | ✅ Pass (review) |
| A5 | Banner shows only when an optional flow is configured + undecided → no-op today | ✅ Pass (review) |
| A6 | Production smoke green (login/quiz unchanged) | ✅ Pass |

### B. Activation acceptance (staging, flags on)
- B1 banner appears once when analytics/sentry configured + undecided.
- B2 "Ja tak" → both analytics + error monitoring activate; one `consent_v1` records granted.
- B3 "Nej tak" → neither sends; reload → nothing loads.
- B4 a returning user with legacy `analytics_consent=granted` → analytics stays granted (migration).
- B5 AI: `grade-answer` is only invoked when `hasConsent("ai_features")` (enforced at 157M wiring).
- B6 PII never present in any captured event/property (per-feature scrubbing).

## 7. Scope / non-goals

- **No granular per-category UI** in v1 (one combined optional opt-in) — granular toggles are a future
  enhancement.
- **No privacy-policy copy** authored here (legal text is the owner's; this maps the technical flows).
- **No activation** — all flows remain default-off; live consent enforcement is validated in staging (157CB).
- 157R (flag hardening) and 157S (fail-soft test coverage) follow.
