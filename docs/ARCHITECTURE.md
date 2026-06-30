# ARCHITECTURE.md — Den Seje App

_Technical source of truth. Reflects the **actual repository** as of 2026-06-30._
_Why the project exists: [PROJECT_VISION.md](./PROJECT_VISION.md). What is planned: [ROADMAP.md](./ROADMAP.md)._
_Avatar internals: [AVATAR_SYSTEM.md](./AVATAR_SYSTEM.md). AI rules: [AI_GUIDELINES.md](./AI_GUIDELINES.md)._

---

## 1. System overview

```
                          ┌──────────────────────────────────────────┐
   Browser (student/      │            FRONTEND (Vercel)             │
   teacher/admin)         │  Static HTML + vanilla JS, NO build step │
        │                 │  den-seje-app-frontend/ = Vercel root    │
        │  HTTPS          │  Supabase URL + ANON key hardcoded in JS │
        ▼                 └──────────────────────────────────────────┘
        │                                   │
        │   supabase-js (anon key, user JWT after login)
        ▼                                   ▼
┌───────────────────────────────────────────────────────────────────────┐
│                      SUPABASE (hosted, Pro plan)                        │
│  project ref tjzbehwfagiwpwodsgwg · region eu-west-1                    │
│                                                                         │
│  ┌──────────────┐   ┌───────────────────────┐   ┌────────────────────┐ │
│  │ Auth (GoTrue)│   │ Postgres + RLS        │   │ Storage (buckets)  │ │
│  │ email/pass   │   │ tables · RPCs · checks│   │ avatar assets, etc.│ │
│  └──────────────┘   └───────────────────────┘   └────────────────────┘ │
│                              ▲                                          │
│             user JWT forwarded │ (RLS enforced as the calling user)     │
│  ┌────────────────────────────┴─────────────────────────────────────┐  │
│  │ Edge Functions (Deno)  supabase/functions/<name>/index.ts        │  │
│  │ read secrets via Deno.env (SUPABASE_URL/ANON/SERVICE_ROLE)        │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────┘
        ▲
        │  Playwright E2E (tests/) run against the LIVE Vercel URL
   CI / local
```

**Stack summary**
- **Frontend:** vanilla JS + static HTML, **no build step**, deployed to Vercel.
  `den-seje-app-frontend/` is the Vercel root.
- **Backend:** hosted Supabase — Postgres (with RLS), Auth, Storage, and Deno **Edge Functions**.
- **Tests:** Playwright E2E against the production URL (`https://den-seje-app-frontend.vercel.app`),
  3 browsers (Chromium/Firefox/WebKit), 1 worker, no parallelism.

## 2. Repository layout & the two-clone model

The working tree exists as **two clones of the same GitHub repo** (`Moeller888/den-seje-app-frontend`):
- **Root** clone (`C:\...\DEN SEJE APP\DEN SEJE APP\`) — full project incl. `supabase/`, `docs/`, `tests/`.
- **`den-seje-app-frontend/`** sub-clone — the directory Vercel actually deploys.

The root embeds the frontend as a **vestigial gitlink** that is _not_ on the Vercel deploy path
(technical debt TD-4 in `project-state.md`). **Discipline:** push from one clone, fast-forward-pull
the other, so both stay in sync. (See agent memory `project_repo_sync_model`.) Frontend source
files (`app.js`, `*.html`, `js/`, `assets/`) are duplicated across both clones and must be edited
consistently.

### Folder responsibilities (root)

| Path | Responsibility |
|---|---|
| `*.html` (root + frontend clone) | Page entry points (see §3). Served statically. |
| `app.js` | Student quiz app logic + UI state machine (the main feature). |
| `js/` | Per-page modules and engines (auth, teacher, admin, avatar engines, progression, etc.). |
| `js/supabase.js` | Shared Supabase client for `js/` modules (sets `window.supabase`). |
| `supabaseClient.js` (root) | Supabase client for ESM `import` in `app.js`. |
| `assets/` | Static runtime assets: `assets/audio/`, `assets/avatar/`. |
| `css/`, `style.css` | Styles. |
| `data/` | Static seed/question data (`data/questions.js`). |
| `supabase/functions/` | Deno Edge Functions (§6). |
| `supabase/migrations/` | Versioned SQL schema + content (§4). |
| `docs/` | Documentation, ADRs (`docs/adr/`), section plans, this foundation set. |
| `tests/` | Playwright specs + `c2-golden/` avatar screenshot baselines. |
| `tools/` | Avatar build/QA tooling (build artifacts gitignored). |
| `packages/question-contract/` | Question contract package (has its own `node_modules`). |

## 3. Frontend

No bundler, no framework, no transpile step. Each HTML page pulls in its module(s) directly; the
Supabase client is loaded from a CDN ESM URL.

| Page | Script | Role | Audience |
|---|---|---|---|
| `login.html` | `js/login.js` | Email/password login; redirects by `profiles.role`. | all |
| `index.html` | `app.js` (+ `supabaseClient.js`) | Student quiz app — the core loop. | student |
| `hub.html` | inline + `js/` engines | Navigation hub; retention/achievements/avatar surfaces. | student |
| `shop.html` | inline | Coin shop; calls `buy-item`. | student |
| `avatar.html` | `js/` avatar engines | Avatar viewer / customisation surface. | student |
| `collection.html`, `themes.html`, `achievements.html`, `leaderboard.html` | inline + `js/` | Progression/cosmetic surfaces. | student |
| `teacher.html` | `js/teacher.js` | Teacher dashboard, student management. | teacher |
| `student-detail.html` | `js/student-detail.js` | Per-student detail + open-answer review. | teacher |
| `admin.html` | `js/admin.js` | Super-admin: account creation, ops. | super_admin |
| `reset-password.html` | `js/reset-password.js` | Password reset flow. | all |

**Client config is hardcoded** (`js/supabase.js`, `supabaseClient.js`): the Supabase URL and the
**anon** key are literals in source. This is acceptable for the anon key (it is public by design and
RLS is the real boundary) and is forced by the no-build-step constraint — there is no mechanism to
inject build-time secrets into the frontend. **Implication:** any future capability needing a
_secret_ must live in an Edge Function, never in frontend JS (see §13–14).

### Student quiz state machine (`app.js`)

```
IDLE → LOADING_QUESTION → AWAITING_ANSWER → SUBMITTING_ANSWER → REFLECTING → TRANSITIONING → LOADING_QUESTION
```
Transitions are validated; invalid transitions are blocked and logged via `logError()`
(`app.js:26`). The machine guarantees there is **no dead UI state**: every error path re-enables
input and returns to a valid state. Never bypass this machine.

## 4. Database (Postgres + RLS)

Schema and most content are managed as **versioned SQL migrations** in `supabase/migrations/`
(60+ files; timestamped). Highlights of what the migrations establish:

- **Identity / roles:** `profiles` (holds `role`: `student` | `teacher` | `super_admin`).
- **Learning core:** `questions`, `question_instances` (per-student instance with
  `correct_answer`, `user_answer`, `answered`, `was_correct`, `next_review_at`,
  `misconception_signal`), `student_progress` (xp, coins, mastery, counters).
- **Learning engine metadata / concept state:** `learning_engine_metadata`, concept-state RPC,
  grade/difficulty schema, plus topic "content sprint" migrations (Vikings, Cold War, etc.).
- **Economy / shop:** `shop_items`, shop inventory/purchases, atomic purchase + RLS hardening.
- **Progression & retention:** themes system, streak system, retention loops, weekly quests,
  achievements (+ hidden/wave2/progress/rewards), titles, leaderboard, social.
- **Avatar:** avatar slot system (`equipped_slots`), slot/wings/aura items, and the avatar asset
  **onboarding / ingestion / generation** pipeline tables (§9).

**Database safety conventions (enforced in code):**
- Use `.maybeSingle()` (not `.single()`) unless a row is guaranteed.
- Prefer `.limit(1)` + `[0]` with an explicit null check.
- RLS is the authorization boundary; never assume data exists; validate joined relations before
  access (helpers in `supabase/functions/_shared/foundation.ts`).

**Key RPCs** (called from Edge Functions, run under the user's JWT or service role):
`process_question_attempt`, `process_text_answer`, `award_correct_answer`, `review_answer`,
`claim_generation_job`, `set_generated_files_atomic`, `recover_stuck_job_atomic`,
`evaluate_achievements`, concept-state RPC, `get_teacher_visibility`. Reward-granting RPCs use
**CAS guards** (e.g. `process_text_answer` only awards when `answered=false`) so network retries
cannot double-award.

> **Migration-history note (TD-3):** the repo migration files can drift from the live DB version
> ledger; `supabase db push` may be blocked. Apply schema changes via the Supabase MCP /
> `apply_migration` against the remote project, carefully. See [CLAUDE_WORKFLOW.md](./CLAUDE_WORKFLOW.md).

## 5. Authentication & Authorization

- **Authentication:** Supabase Auth (email/password). The browser holds a session
  (`persistSession`, `autoRefreshToken`). `login.js` redirects by `profiles.role`.
- **Authorization (two layers):**
  1. **RLS** in Postgres is the real boundary. Every page also re-checks `profiles.role` on load.
  2. **Edge Functions forward the caller's `Authorization` header** and create a user-scoped
     client, so RLS applies server-side too (`process-event/index.ts:61-65`).
- **Privilege escalation is explicit and gated:** functions that need the **service role**
  (`SUPABASE_SERVICE_ROLE_KEY`) first authenticate the caller and check their role, _then_ create a
  service-role client (`review-answer/index.ts:25-69`). The service-role key never reaches the
  frontend.
- Some functions are intentionally **no-JWT** (e.g. `get-next-question`, `create-student`,
  `create-teacher`) per their documented contract; these must still validate input defensively.

## 6. Edge Functions (`supabase/functions/`)

Runtime: Deno, deployed independently of the frontend (`supabase functions deploy <name>`).
**Every function must always return a Response** (success or explicit error) and handle `OPTIONS`
for CORS. Shared helpers live in `_shared/foundation.ts` (`getOne`, `assertExists`, `assertArray`,
`assertQuestion`, `assertProgress`, `buildQuestionResponse`, `handleError`). Shared **observability**
lives in `_shared/monitoring.ts` — the single boundary every function inherits via
`withObservability(name, handler)` (Section 157C; see §13.2), default-off and behaviour-preserving.

| Function | Auth | Purpose |
|---|---|---|
| `get-next-question` | no JWT | Returns the next question instance for a student. |
| `process-event` | user JWT | Submits an answer; routes MC/number/text/long; awards XP/coins via RPC; sets `next_review_at`; records misconception signal. **Central answer boundary.** |
| `buy-item` | user JWT | Shop purchase; coins verified via RLS/atomic RPC. |
| `create-student` / `create-teacher` | no JWT | Admin account creation. |
| `reset-student` / `reset-pending` / `reset-student-password` | privileged | Reset progress / pending / password. |
| `question-context` | JWT | Fetches question context. |
| `equip-avatar` | user JWT | Equip/unequip a cosmetic slot. |
| `review-answer` | teacher JWT → service role | Teacher scores an open answer; awards XP by score. |
| `get-reviewed-answers` | JWT | Returns reviewed answers for display. |
| `grade-answer` | JWT | **Advisory-only** AI grade suggestion (157K). Default-off; never writes DB/awards; not called by `process-event`. See §13.4. |
| `avatar-asset-onboarding` / `avatar-asset-validator` / `avatar-ingestion` / `avatar-generation` | privileged | Avatar asset pipeline (§9). |

### `process-event` answer routing (the grading boundary)

```
submitAnswer() [app.js]
   └─ supabase.functions.invoke("process-event", { question_instance_id, answer, ... })
        └─ auth (user JWT) → fetch instance + question meta (.maybeSingle)
             ├─ answer_type == "long"      → PATH 1: validate ≥20 words, save user_answer,
             │                                 return {status:"pending"}   (→ TEACHER REVIEW)
             ├─ answer_format includes text → PATH 2: process_text_answer RPC (CAS-guarded)
             └─ else (MC / number)         → PATH 3: process_question_attempt RPC
        → response: { status, correct_answer, review_text?, misconception_type? }
```
This is the single most important integration boundary in the system: **AI grading, OCR, and
speech-to-text all attach here** (PATH 1 / pre-submit), and must preserve this response shape
(see §13 and [AI_GUIDELINES.md](./AI_GUIDELINES.md)).

## 7. Adaptive learning engine

- **Event-driven progression** (`js/progression.js`): no direct coin/XP mutation — state is a pure
  aggregate of events (`MC_CORRECT`, `TEXT_APPROVED`, `XP_BOOST`, `REFUND`). No side effects in the
  engine itself; awards are applied by deterministic RPCs server-side.
- **Spaced repetition:** `process-event` sets `next_review_at` (+1 day on correct, +10 min on
  incorrect for MC; text path schedules via RPC).
- **Misconception signals:** wrong answers can carry a `misconception_type` (from question
  metadata) recorded fire-and-forget on `question_instances.misconception_signal`, and a
  `review_text` is returned to teach on the miss.
- **Content/curriculum modules:** a large family of `js/` modules support content intelligence,
  pedagogical pipeline, readability, reflection and curriculum deployment (advisory/authoring-side;
  not in the reward path).

## 8. Storage

Supabase Storage buckets hold avatar assets and pipeline artifacts. Edge Functions read/write via
`supabase.storage.from(bucket)` with explicit error handling
(`avatar-generation/storage.ts`: `downloadFileBytes` / `uploadFileBytes`, both throw on
empty/error — no silent failure). Storage is the current home of avatar art; an optional
Cloudinary delivery/optimisation layer is **audited but not implemented** (§13).

## 9. Avatar pipeline (summary — full detail in AVATAR_SYSTEM.md)

- **Render:** `js/avatar-render-c2.js` (`mountC2Avatar`) composes layered avatar art behind the
  `AVATAR_V2` flag; living **expression / presence / blink** engines animate it.
- **Identity model:** body_type / hairstyle / skin_tone / hair_color + `equipped_slots`, ordered by
  a deterministic z-model (`C2_LAYER_Z`).
- **Asset pipeline (Edge):** `avatar-asset-onboarding` → `avatar-asset-validator` →
  `avatar-ingestion` → `avatar-generation`, with atomic claim/recover RPCs for job safety.
- **Current reality:** `AVATAR_V2 = true` is **live** (commit `52f8365`, 2026-06-25) but renders
  **flat placeholder SVGs**, not the approved Northstar Master raster. The locked plan to produce
  and wire the Master raster is `docs/167a-master-asset-raster-wiring-plan.md`. Details, decisions
  (D-001…D-041), and the layer model are in [AVATAR_SYSTEM.md](./AVATAR_SYSTEM.md).

## 10. Feature flags

- **`AVATAR_V2`** (`js/avatar-layers.js:230`, currently `true`). `isAvatarV2()` returns `true` if the
  constant is on, else honours a per-browser override `localStorage.avatar_v2 === "1"` — used for
  staged manual testing.
- **`ENABLE_SENTRY`** (`js/sentry.js`, currently `false` — Section 157B). Master switch for frontend
  error monitoring; **default-off with zero runtime impact** (no SDK download, no listeners, no
  network) until set to `true` **and** a public DSN is configured. Fail-soft by construction.
- **`ENABLE_SENTRY_EDGE`** (env var, default unset → off — Section 157C). Master switch for Edge
  Function monitoring (`_shared/monitoring.ts`); enabled only when `ENABLE_SENTRY_EDGE === "true"`
  **and** a DSN (`SENTRY_DSN_EDGE`) is set. Default-off = zero behavioural impact (no SDK import,
  identical responses and latency). Env-driven per the Edge config convention.
- **`ENABLE_OCR`** (`js/ocr/index.js` constant, currently `false` — Section 157I). Master switch for
  the browser-only document-recognition service. Default-off = zero impact (no engine download, no
  UI, manual text entry unchanged). When on, an OCR "scan" control assists answer text entry; the
  engine (Tesseract.js wasm) loads lazily only on first scan. See §13.3.
- **Consent SoT** (`js/consent.js`, Section 157Q): not a flag but the single GDPR consent store
  (categories `analytics` / `error_monitoring` / `ai_features`). Every optional third-party flow
  consults it; `js/analytics.js` and `js/sentry.js` are gated on their category. Default state =
  undecided → flows stay off. Canonical map: `docs/157q-consent-gdpr.md`.
- **`ENABLE_READ_ALOUD`** (`js/read-aloud/index.js` constant, currently `false` — Section 157O).
  Master switch for the read-aloud (TTS) service. Default-off → no control, no audio. When on, a
  "🔊 Læs op" button reads the question via a pre-recorded Piper clip (if present) or on-device Web
  Speech. No upload, no live service. See `docs/157o-read-aloud.md`.
- **`ENABLE_ANALYTICS`** (`js/analytics.js` constant, currently `false` — Section 157D). Master switch
  for PostHog analytics. Default-off → no SDK, no network, no cookies, no events. Even when enabled +
  keyed, a **GDPR consent gate** (`setConsent`) blocks all loading/sending until explicit opt-in.
  Data-minimised (autocapture off, no PII identify, EU host); events wired in 157E.
- **`ENABLE_AI_GRADING`** (env var, default unset → off — Section 157K). Master switch for the AI
  abstraction layer (`_shared/ai/`) + `grade-answer`. Off → `available:false`, no provider call, no
  data sent. Advisory-only; needs a self-hosted endpoint (`OLLAMA_BASE_URL`) + staging to activate.
- **`ENABLE_CLOUDINARY`** (`js/cloudinary.js` constant, currently `false` — Section 157G). Master
  switch for the optional Cloudinary **fetch/delivery** layer (public cloud name, **no secret**).
  Default-off / empty cloud name → `cdnUrl()` returns the origin URL unchanged. **Raster-only** (SVG
  passes through), so inert today (all avatar `<img>` layers are SVG). Source of truth stays Supabase
  Storage / repo `assets/`; fail-soft to origin. See §8.
- **There is no cohort / percentage-rollout mechanism** (open question OQ-4). Rollout is
  all-or-nothing via the constant, plus the localStorage override for individual testing.
- **Edge-side config flags:** `SKIP_ONBOARDING` (env-driven) exists in the avatar pipeline.
- **Convention for future flags:** a boolean constant with an `isX()` accessor that also honours a
  localStorage override, mirroring `AVATAR_V2`. All future AI capabilities must ship behind such a
  flag, default-off, fail-soft (see [AI_GUIDELINES.md](./AI_GUIDELINES.md)).

## 11. Deployment

- **Frontend:** edit files under `den-seje-app-frontend/`, commit, push `main` → **Vercel
  auto-deploys**. (Keep the root clone in sync — §2.)
- **Edge Functions:** `supabase functions deploy <name>` (or deploy all). Independent of frontend.
- **Database:** migrations applied via Supabase MCP / `apply_migration` against the remote project
  (note TD-3: `db push` may be blocked by ledger drift).
- **Gate:** no deploy without green Playwright tests (see [CLAUDE_WORKFLOW.md](./CLAUDE_WORKFLOW.md)).

## 12. Data flow diagrams (ASCII)

**Answer submission (student):**
```
student clicks answer
  → app.js submitAnswer() : state AWAITING_ANSWER → SUBMITTING_ANSWER
    → process-event (user JWT)
        ├ long  → save user_answer, status "pending" ─────────────► teacher queue
        ├ text  → process_text_answer (CAS) → correct/incorrect + XP/coins
        └ MC/#  → process_question_attempt → correct/incorrect + XP/coins, next_review_at
    → response {status, correct_answer, review_text?, misconception_type?}
  → app.js renders feedback : state REFLECTING → TRANSITIONING → LOADING_QUESTION
```

**Open-answer review (teacher):**
```
teacher opens student-detail.html
  → get-reviewed-answers / queue of pending long answers (user_answer set, answered=false)
  → teacher scores
    → review-answer (teacher JWT → role check → SERVICE ROLE)
        → review_answer RPC (store score+feedback) → award XP by scoreToXP(score)
  → student later sees reviewed feedback + XP
```

## 13. Future service integration boundaries (Section 157A — audited, NOT implemented)

Section 157A audited seven zero-cost / self-hostable services. **None are implemented as of
2026-06-30.** Summary of the decided boundaries (full rationale: the 157A audit; rules:
[AI_GUIDELINES.md](./AI_GUIDELINES.md); schedule: [ROADMAP.md](./ROADMAP.md)):

| Service | Boundary | Rationale |
|---|---|---|
| **Error reporting (Sentry)** | **Frontend-first** (public DSN), optional Edge later | **Implemented as foundation (157B), default-off** — see §13.1. Edge side is 157C. |
| **Analytics (PostHog)** | **Frontend-only** (public project key) | **Module + events done (157D/157E), default-off** — `js/analytics.js` + `js/analytics-consent.js`; GDPR consent-gated + banner, data-minimised, EU host, no PII. Core events wired (login/question/purchase). See `docs/157d-posthog-analytics.md`. |
| **OCR (Tesseract)** | **Frontend-only** (wasm, in-browser) | **Implemented foundation (157I), default-off** — `js/ocr/` reusable service; see §13.3. Photo→text before `process-event`; no secret, no server, no upload. |
| **AI service (Ollama)** | **Edge Function only**, gated | Needs a secret + a publicly-reachable endpoint; self-hosted localhost is unreachable from Supabase cloud. Attaches at `process-event` PATH 1 as **advisory** grading. |
| **Speech-to-text (Whisper.cpp)** | **Deferred** | Heavy wasm or unreachable self-host. |
| **Text-to-speech (Piper)** | **Deferred** | Best as pre-generated Storage audio played via `js/audio.js`, not a live service. |
| **Image hosting (Cloudinary)** | **Fetch/delivery (no secret)** — decided 157F | **Implemented foundation (157G), default-off** — `js/cloudinary.js` `cdnUrl()`, wired into the single avatar `<img>` seam (`mountC2Avatar`); raster-only; Supabase Storage/repo stays source of truth; activate after 167a raster. |

**Two hard constraints govern all of the above:** (1) **no frontend build step** → secrets must
live in Edge Functions; only public client tokens (Sentry DSN, PostHog key) may be frontend-only.
(2) **Supabase Edge runs in the cloud** → it cannot reach a `localhost` self-hosted server, which
gates Ollama/Whisper/Piper.

### 13.1 Error monitoring foundation (Sentry — implemented, Section 157B)

Frontend error observability is implemented as a single module, **`js/sentry.js`**, and is
**default-off** (`ENABLE_SENTRY = false`, empty DSN) — with **zero runtime impact** until both the
flag is `true` and a public DSN is set. It is **additive and fail-soft**: the application behaves
identically; errors merely become observable when enabled.

- **Integration boundary:** the existing `logError()` functions (`app.js`, `js/admin.js`) call
  `captureError(event, error, context)` after their `console.error` — no existing behaviour changes.
  `initMonitoring({ tags })` is called once per page that imports the module.
- **Captured:** uncaught exceptions and unhandled promise rejections (SDK global handlers) plus
  **resource load failures** (a capture-phase `window` `error` listener for `img`/`script`/`link`/…).
- **PII safety (fail-closed):** `sendDefaultPii:false`; `beforeSend` strips request headers/cookies/
  body and user context, then deep-scrubs the event (redacts JWT/Bearer tokens — incl. Supabase
  keys — and emails, and any sensitive-named key); `beforeBreadcrumb` **drops console breadcrumbs**
  (the app logs answer-bearing payloads via `console.*`) and scrubs the rest. If scrubbing throws,
  the event is **dropped**. No performance/replay (avoids DOM PII).
- **Tags:** `environment` (host-derived), `release` (`<meta name="app-release">` or a constant — no
  build step), `page` (pathname only), `browser`, and feature flags (`flag_enable_sentry`,
  `flag_avatar_v2`).
- **Fail-soft:** SDK is lazy-loaded from CDN ESM only when enabled; every path is wrapped so init or
  transport failure never reaches the UI and never stops console logging.
- **Scope:** wired into the two `logError` boundaries (`app.js` = student quiz, `js/admin.js`).
  Extending the same one-line import to other pages (hub/shop/teacher/login) is incremental follow-up.
- **Next:** Edge-side reporting → **§13.2** (Section 157C, implemented).

### 13.2 Edge observability foundation (Section 157C — implemented)

The permanent monitoring architecture every Supabase Edge Function inherits. One shared module,
**`supabase/functions/_shared/monitoring.ts`**, is the only place that knows Sentry:

```
Edge Function  →  _shared/monitoring.ts  →  Sentry
```

- **Single integration boundary:** `withObservability(functionName, handler)` — a serve-agnostic
  higher-order wrapper that works with both `serve(...)` and `Deno.serve(...)`. A function migrates
  with one line: `serve(withObservability("name", async (req, ctx) => { ... }))`. The shared
  `handleError()` (`_shared/foundation.ts`) also routes through `captureEdgeException()` additively.
  **No duplicated monitoring code; no function knows Sentry internals.**
- **Default-off:** enabled only when env `ENABLE_SENTRY_EDGE === "true"` **and** `SENTRY_DSN_EDGE` is
  set. Otherwise the wrapper is behaviourally inert — same responses, same latency.
- **Request lifecycle (per request):**
  ```
  inbound request
    → withObservability: read/derive request_id, mark start time
      → run the function handler (unchanged)
         ├ returns 2xx/4xx → record status + duration (5xx also captured by status)
         └ throws (uncaught) → capture exception, then RE-THROW unchanged (contract preserved)
    → fire-and-forget flush via EdgeRuntime.waitUntil (after response → no added latency)
  ```
- **Metadata model (auto-attached, never fails if unavailable):** `function_name`, `request_id`,
  `environment`, `release`, `deployment` (`DENO_DEPLOYMENT_ID`/`SB_EXECUTION_ID`), `region`
  (`SB_REGION`/`SUPABASE_REGION`/…), `runtime` (`deno@<v>`), `duration_ms` (execution time),
  `response_status`. Missing values are simply omitted.
- **Request correlation strategy:** reuse an inbound `x-request-id` / `x-correlation-id` header when a
  caller supplies one, else generate `crypto.randomUUID()`. This id is the join key across
  **frontend → edge → database → future AI**. The frontend may later send `x-request-id`; the id is
  internal (not exposed in responses — no API-contract change).
- **PII safety (fail-closed):** centralised scrubbing identical in spirit to §13.1 — `beforeSend`
  strips request headers/cookies/body/query and user context, deep-scrubs JWT/Bearer/Supabase keys,
  emails and sensitive-named keys; `beforeBreadcrumb` drops console breadcrumbs (functions log
  answer-bearing payloads via `console.*`). Scrub failure → event **dropped**. No perf/replay.
- **Fail-soft:** SDK (`@sentry/deno`) is lazy-loaded from CDN only when enabled; init/capture/flush
  are wrapped and fire-and-forget; monitoring never throws into a function, never changes a response,
  never meaningfully changes latency.
- **Reference wiring:** `get-reviewed-answers` is wrapped as the canonical example. **Migration path
  for the other 15 functions:** wrap their handler with `withObservability(name, …)` (and optionally
  `ctx.captureException(err)` in their catch). Tracked in [ROADMAP.md](./ROADMAP.md). Validation:
  `docs/157c-edge-validation-checklist.md`.

> **Activation & operations:** the end-to-end activation procedure, deployment, release strategy,
> request-correlation design, troubleshooting and the operator runbook live in the canonical
> **[OBSERVABILITY.md](./OBSERVABILITY.md)**. As of 2026-06-30 both foundations are implemented,
> **default-off and production-safe indefinitely** (OBSERVABILITY.md §0). Live activation/validation
> needs a non-production target; per **157CC** that staging environment (157CB) is a **future
> infrastructure milestone, not a blocker** — see OBSERVABILITY.md §10 and [ROADMAP.md](./ROADMAP.md).

### 13.3 Document-recognition (OCR) foundation (Section 157I — implemented)

A generic, reusable, **browser-only** OCR service under **`js/ocr/`**, default-off (`ENABLE_OCR=false`).
Spec: `docs/157h-ocr-document-recognition-spec.md`.

- **Strict provider abstraction:** the app depends only on the `OCRProvider` contract
  (`js/ocr/provider.js`) and a structured `OCRResult` (`js/ocr/ocr-result.js`) — **never on Tesseract
  directly**. `assertProvider()` enforces an `isLocalOnly === true` contract (machine-checked privacy
  guarantee). Tesseract.js (`js/ocr/provider-tesseract.js`) is the **first** implementation only.
- **Facade:** `createDocumentRecognizer()` (`js/ocr/index.js`) → `isAvailable()` / `recognize()` /
  `warmup()` / `dispose()`; returns a structured `OCRResult` (v1 uses `.text`).
- **Consumer adapters:** `js/ocr/adapters/answer-capture.js` is the first consumer — a "scan" control
  that fills the answer `<textarea>` with extracted text for the student to **review/edit** before the
  unchanged `submitAnswer()` runs. Future consumers (worksheets, sources, teacher material) reuse the
  same service.
- **Privacy invariant:** **no student image is ever uploaded.** Acquisition/preprocess/recognition run
  locally (wasm + Web Worker); only confirmed text enters the app. The engine/model load lazily from
  CDN on first scan (code/model only, never image data); self-hosting is a follow-up.
- **Advisory + fail-soft:** OCR never auto-submits or grades (determinism preserved); on disable /
  unsupported / error it is a no-op and the textarea works exactly as before.
- **Wiring:** `app.js` calls `attachOcrControl(textarea, container)` at the two answer-textarea sites;
  inert when `ENABLE_OCR` is off (no DOM, no engine, no behavioural change). Validation:
  `docs/157i-ocr-validation-checklist.md`.

### 13.4 AI abstraction layer + `grade-answer` (Section 157K — implemented, default-off)

Model/provider access goes through the **single abstraction layer `supabase/functions/_shared/ai/`**
(facade `createAiService()` → `isAvailable()`/`grade()`/`draftFeedback()`), so the underlying model
changes without touching feature code. Feature code depends only on the facade + structured
`AdvisoryResult` — **never on a provider**; `assertAiProvider()` guards a strict `AIProvider` contract.
Ollama is the **first** provider (inert unless `OLLAMA_BASE_URL` is set). The layer owns versioned
prompts, timeout, structured-output validation, input minimisation (PII scrub), and fail-soft.

- **`grade-answer` Edge Function** exposes `grade()` as an **advisory** endpoint (`advisory:true`,
  suggestion non-binding). **Default-off** (env `ENABLE_AI_GRADING`): returns `{available:false}` and
  calls nothing. **Never writes the DB, never awards, never auto-submits, not called by `process-event`**.
  Auth-required; observability-wrapped (157C); always returns a Response.
- **Activation** (set the flag + a self-hosted endpoint, deploy) needs **staging (157CB)** + the
  reachability decision (**157J**). Wiring into `process-event` is **157L** (FUTURE INFRASTRUCTURE);
  teacher UI is **157M**. Contract + validation: `docs/157k-ai-grading-contract.md`. Rules:
  [AI_GUIDELINES.md](./AI_GUIDELINES.md).

## 14. Source-of-truth definitions

| Domain | Single source of truth |
|---|---|
| Why / product direction | [PROJECT_VISION.md](./PROJECT_VISION.md) |
| Technical architecture (this doc) | `docs/ARCHITECTURE.md` |
| Schedule / status / sections | [ROADMAP.md](./ROADMAP.md) |
| AI rules & abstraction | [AI_GUIDELINES.md](./AI_GUIDELINES.md) |
| Avatar system & art | [AVATAR_SYSTEM.md](./AVATAR_SYSTEM.md) (design goal: `docs/avatar-vision.md`) |
| Dev workflow / DoD | [CLAUDE_WORKFLOW.md](./CLAUDE_WORKFLOW.md) |
| Repo-level rules (authoritative, overrides) | `CLAUDE.md` (root) |
| Avatar decisions register (D-001…D-041) | `docs/project-state.md` + `docs/adr/` |
| DB schema & content | `supabase/migrations/` |
| Avatar render contract | `js/avatar-render-c2.js`, `js/avatar-layers.js` |
| Answer/grading contract | `supabase/functions/process-event/index.ts` |

> **Note on `docs/project-state.md`:** it remains the authoritative **avatar decision register**
> (D-001…D-041) and risk/debt log. Its 2026-06-15 "C2 NOT active / flag OFF" status lines were
> **corrected in Section 157AB (2026-06-30)** — annotated as superseded in place (not deleted), since
> `AVATAR_V2` went live 2026-06-25 (commit `52f8365`). For current activation state trust this file
> and [AVATAR_SYSTEM.md](./AVATAR_SYSTEM.md); for the decision history trust `project-state.md`.
