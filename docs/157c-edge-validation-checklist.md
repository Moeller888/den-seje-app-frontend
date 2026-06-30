# 157C — Edge Observability: Validation Checklist

_Proof-of-correctness checklist for the Section 157C Edge monitoring foundation._
_Module: `supabase/functions/_shared/monitoring.ts`. Shared helper: `_shared/foundation.ts`
(`handleError`). Reference wiring: `get-reviewed-answers`. Owner: project owner._
_Last reviewed: 2026-06-30._

This section ships **default-off** (`ENABLE_SENTRY_EDGE` unset). Part A is verified now (flag off,
undeployed); Part B is the activation acceptance test, run in a **staging Supabase project** with a
real DSN before relying on Edge monitoring.

---

## A. Verified now (flag off, pre-deploy)

| # | Check | Method | Result |
|---|---|---|---|
| A1 | Shared module type-checks | `deno check _shared/monitoring.ts` | ✅ Pass (exit 0) |
| A2 | Shared helper type-checks | `deno check _shared/foundation.ts` | ✅ Pass (exit 0) |
| A3 | Reference function type-checks | `deno check get-reviewed-answers/index.ts` | ✅ Pass (exit 0) |
| A4 | **Unchanged API responses** | Code review: handler body byte-for-byte unchanged; wrapper returns the handler's `Response` verbatim; uncaught errors re-thrown unchanged; no response headers/body added | ✅ Pass |
| A5 | **Zero behavioural impact when disabled** | `isEdgeMonitoringEnabled()` is false unless `ENABLE_SENTRY_EDGE==="true"` AND a DSN set → no SDK import, no capture, no flush; wrapper only computes a request_id + timing (unused) and returns the response | ✅ Pass |
| A6 | **Fail-soft** | Every capture/init/flush path try/catch-wrapped; SDK lazy-`import().catch`; flush fire-and-forget; wrapper re-throws (never swallows) | ✅ Pass (review) |
| A7 | Frontend baseline unchanged | `npx playwright test tests/example.spec.ts --project=chromium` (Edge undeployed) | ✅ Pass |
| A8 | No duplicated monitoring code | One module; `handleError` + reference function both call into it | ✅ Pass |

## B. Activation acceptance test (staging Supabase project, real DSN)

**Setup:** `supabase secrets set ENABLE_SENTRY_EDGE=true SENTRY_DSN_EDGE=<dsn> SENTRY_RELEASE=den-seje-app-edge@<sha>`,
then `supabase functions deploy get-reviewed-answers`. Invoke it (logged-in student JWT).

| # | Check | How to verify | Expected |
|---|---|---|---|
| B1 | ✓ **Handled errors** | Force the function's `catch`/500 path (e.g. invalid auth → DB error) | Event in Sentry: `edge error: get-reviewed-answers` (or `Edge … returned 500`), with full metadata |
| B2 | ✓ **Uncaught exceptions** | Temporarily `throw` before the try in a staging copy | Exception captured with `phase: "uncaught"`, then the request still 500s as before (re-thrown) |
| B3 | ✓ **Request IDs** | Invoke with header `x-request-id: test-123`; then invoke without it | Event tag `request_id=test-123` (reused); without header a generated UUID appears |
| B4 | ✓ **Execution timing** | Inspect any event's `edge` context | `duration_ms` present and plausible (> 0) |
| B5 | ✓ **Metadata** | Inspect any event | `function_name`, `request_id`, `environment`, `release`, `runtime` present; `deployment`/`region` present when the platform provides them |
| B6 | ✓ **Fail-soft (monitoring outage)** | Set an invalid `SENTRY_DSN_EDGE`, or block the Sentry host; repeat B1 | Function returns the **same** response with the same latency; no thrown error; no 5xx introduced by monitoring |
| B7 | ✓ **Feature flag** | Set `ENABLE_SENTRY_EDGE=false` (or unset), redeploy; repeat B1 | No SDK import, no events sent; function behaves identically |
| B8 | ✓ **PII scrubbing** | Trigger an error whose payload includes a JWT, email, `user_answer`, and an `Authorization` header | Transmitted event shows `[redacted-token]` / `[redacted-email]` / `[redacted]`; **no** request headers, cookies, body, or user identity; console breadcrumbs absent |
| B9 | ✓ **Unchanged API responses** | Diff responses (status, headers, JSON body) with flag on vs off for success, 401, and 500 paths | Byte-identical in all three cases |
| B10 | Latency unchanged | Compare p50/p95 of the function flag-on vs flag-off | No meaningful difference (flush is post-response via `EdgeRuntime.waitUntil`) |

## Migration path for the remaining functions

Every other Edge Function adopts the foundation the same way (no duplicated code):

```ts
import { withObservability } from "../_shared/monitoring.ts";

serve(withObservability("<function-name>", async (req, ctx) => {
  // ...existing handler body, unchanged...
  // optional, in catch blocks: ctx.captureException(err, { phase: "catch" });
}));
```
`Deno.serve(...)` functions use the identical wrapper (`Deno.serve(withObservability(...))`). Order
of migration is tracked in [ROADMAP.md](./ROADMAP.md); each migration is behaviour-preserving and
should re-run `deno check` + the relevant flow test.

## Notes / limitations

- **Tests run against production**, so B1–B10 require a staging deploy with the flag on — they
  cannot be exercised by the live-URL Playwright suite while default-off.
- **Release tag** is env-driven (`SENTRY_RELEASE`); automating it from the git SHA on deploy is an
  ops follow-up.
- **`region`/`deployment`** depend on env vars the Supabase Edge runtime may or may not expose; they
  are best-effort and omitted when unavailable (never a failure).
