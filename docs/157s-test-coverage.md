# 157S — Fail-Soft / Default-Off Test Coverage

Status: **IMPLEMENTED — lightweight unit tests, no new framework.** All green.
Date: 2026-07-01. Owner: project owner (solo). Gate: **SOFT**.
Runners: Node built-in (`node --test`) + Deno built-in (`deno test`) — both already in the repo.
Scope rule: assert **default-off + fail-soft only**; never enable a flag, never hit the network,
never touch external services, staging, or paid infrastructure.

---

## 1. Approach (lightest that fits the repo)

No new test framework was added. The repo already runs **Node** (Playwright tooling, `.mjs` scripts)
and **Deno** (edge functions, `deno check`). 157S uses each runtime's **built-in** test runner:

- **Frontend modules** → `node --test` with `node:test` + `node:assert` (zero dependencies).
- **AI abstraction (Deno/TS)** → `deno test` with inline assertions (zero dependencies).

The frontend modules reference browser globals only at call-time (guarded), so in Node they behave
default-off / fail-soft — exactly what we assert. A tiny in-memory `localStorage` stub exercises the
one real round-trip (consent persistence + legacy migration).

## 2. Commands

```
npm run test:unit       # node --test tests/unit/*.test.mjs   (frontend: 17 tests)
npm run test:unit:ai    # deno test --allow-env supabase/functions/_shared/ai/  (AI: 4 tests)
```
These are independent of the Playwright E2E suite (`npx playwright test`), which runs against the live
URL. `tests/unit/*.test.mjs` is not matched by Playwright (`testMatch: **/*.spec.ts`).

## 3. What is covered (21 tests, all green)

| Module | Guarantees asserted |
|---|---|
| `js/consent.js` | default `unknown`; set/get round-trip; `setOptionalConsent` covers all categories; unknown category ignored; **legacy `analytics_consent` migration**; fail-soft with no `localStorage` |
| `js/cloudinary.js` | disabled by default; `cdnUrl` passthrough (webp + svg); fail-soft on null/empty/undefined |
| `js/flags.js` | snapshot reports every service **off** + `avatar_v2` on; never throws |
| `js/analytics.js` | inactive by default; `track()` is a safe no-op (incl. a payload with `answer`) |
| `js/sentry.js` | off by default; `captureError` / `initMonitoring` are safe no-ops |
| `js/ocr` | unavailable by default; `recognize()` rejects softly; `createOCRResult` structured defaults |
| `js/read-aloud` | unavailable by default; `speak()` no-op returns false; manifest empty; `hashKey` deterministic |
| `_shared/ai` | `isAvailable()` false; `grade()` returns advisory-unavailable, never throws; `minimiseGradeInput` scrubs email + drops extra fields |

## 4. Explicit non-goals

- **No external activation** — no flag is turned on; nothing is sent anywhere.
- **No staging / no paid infra** — tests are pure and local.
- **No new dependency or framework** — Node/Deno built-ins only.
- **No E2E for activated flows** — those belong to the per-section Part-B checklists, run in staging
  (157CB) once services are activated.

## 5. Files

- `tests/unit/zero-cost-services.test.mjs` (Node)
- `supabase/functions/_shared/ai/ai.test.ts` (Deno)
- `package.json` scripts: `test:unit`, `test:unit:ai`
