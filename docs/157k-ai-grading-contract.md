# 157K — AI Abstraction Layer + `grade-answer` Contract

Status: **IMPLEMENTED — scaffolding, default-off.** No reward-path wiring; not deployed.
Date: 2026-06-30. Owner: project owner (solo). Gate: **SOFT** (build now, activate later).
Binding rules: [AI_GUIDELINES.md](./AI_GUIDELINES.md). Architecture: [ARCHITECTURE.md](./ARCHITECTURE.md) §6/§13.
Consumed later by **157L** (advisory grade in `process-event` PATH 1) and **157M** (teacher review UI).

---

## 1. Purpose

Provide the **single AI abstraction layer** (`supabase/functions/_shared/ai/`) every future AI feature
uses, plus the **`grade-answer`** advisory endpoint as its first concrete contract. Built now,
**default-off and advisory-only**, with **no wiring into the reward path** — so AI capability exists
and is reviewable without touching grading/XP today.

## 2. Abstraction layer (`_shared/ai/`)

```
feature code  →  _shared/ai/index.ts (facade)  →  AIProvider (provider.ts)  →  model
                    │ owns: flag, provider selection, prompts(versioned),
                    │ timeout, structured-output validation, input minimisation,
                    │ fail-soft signalling
```

| File | Role |
|---|---|
| `types.ts` | `GradeRequest`, `GradeSuggestion`, `DraftFeedback*`, `AdvisoryResult<T>` — the task-shaped contract feature code depends on. |
| `provider.ts` | `AIProvider` interface + `assertAiProvider()` (strict). Providers only turn a prompt into a completion. |
| `provider-ollama.ts` | **First** provider impl. Inert unless `OLLAMA_BASE_URL` is set; `isLocalOnly: true` (self-hosted/zero-retention contract). |
| `prompts.ts` | **Versioned** prompts (`grade.v1`, `draft_feedback.v1`); JSON-only, advisory, Danish. |
| `redact.ts` | Data **minimisation** — sends only answer/rubric/question; scrubs incidental email/phone; clamps length. |
| `index.ts` | `createAiService()` facade → `isAvailable()`, `grade()`, `draftFeedback()`. Never throws, never writes, advisory-only. |

**Swapping providers never touches feature code** (AI_GUIDELINES.md §6): add a provider behind the
same interface and route it in `selectProvider()`.

## 3. Configuration (env, default-off)

| Env var | Default | Meaning |
|---|---|---|
| `ENABLE_AI_GRADING` | unset → **off** | Master switch. Off → facade returns `available:false`. |
| `AI_PROVIDER` | `ollama` | Which provider to select. |
| `OLLAMA_BASE_URL` | unset → **unavailable** | Self-hosted/zero-retention endpoint (157J gate). |
| `OLLAMA_MODEL` | `llama3.1` | Model name. |
| `AI_TIMEOUT_MS` | `12000` | Per-call timeout. |

With nothing configured the layer is fully inert: **no AI is called, no data is sent anywhere.**

## 4. `grade-answer` endpoint contract

`POST /functions/v1/grade-answer` — **auth required** (forwards JWT).

**Request:** `{ "answer": string (required), "rubric"?: string, "question_text"?: string, "language"?: string }`

**Response (always HTTP 200 unless 401/400/500):**
```json
{ "available": boolean, "advisory": true,
  "suggestion": { "score": 1-4|null, "label": string|null, "rationale": string|null, "confidence": 0-1|null } | null,
  "provider": string|null, "model": string|null, "prompt_version": string|null, "reason": string|null }
```
- `available:false` (+ `suggestion:null`) = "no suggestion — grade manually." This is the **default**
  (flag off / no provider) and the fallback on any error.
- `advisory:true` is always present: the caller **must** treat the suggestion as non-binding.

**Guarantees:** never writes the DB · never awards XP/coins · never auto-submits · **not** called by
`process-event` · always returns a Response · wrapped with the shared observability layer (157C).

## 5. AI_GUIDELINES §9 compliance

- [x] Behind a default-off feature flag (`ENABLE_AI_GRADING`).
- [x] No direct DB writes; no rewards (the endpoint touches no tables/RPCs).
- [x] Cannot bypass teacher review; advisory only (`advisory:true`, suggestion is non-binding).
- [x] Fails soft to "grade manually"; errors return `available:false`; no dead state; reported via 157C.
- [x] Minimal data (answer/rubric/question only; email/phone scrubbed; length-clamped); secrets only in Edge env.
- [x] Goes through the abstraction layer with **versioned prompts** and **validated structured output**.
- [x] Suggestions are labelled (`advisory:true`) and auditable (`provider`/`model`/`prompt_version`/`inputChars`).

## 6. Validation

### A. Verified now (default-off, undeployed)
| # | Check | Method | Result |
|---|---|---|---|
| A1 | AI layer type-checks | `deno check _shared/ai/*.ts` | ✅ Pass (exit 0) |
| A2 | `grade-answer` type-checks | `deno check grade-answer/index.ts` | ✅ Pass (exit 0) |
| A3 | Default-off | `flagEnabled()` false unless `ENABLE_AI_GRADING==="true"` → `available:false`, no provider call | ✅ Pass (review) |
| A4 | No reward-path coupling | `process-event` unchanged; `grade-answer` does no DB writes/RPCs | ✅ Pass (review) |
| A5 | Fail-soft | facade never throws (try/catch → `unavailable`); endpoint always returns a Response | ✅ Pass (review) |
| A6 | Strict provider abstraction | feature code imports only the facade + types; `assertAiProvider` guards the contract | ✅ Pass (review) |
| A7 | Structured-output validation | `parseGradeSuggestion` defensively parses/clamps; invalid → `available:false` | ✅ Pass (review) |
| A8 | Frontend baseline unchanged | production smoke (Edge change is undeployed) | ✅ Pass |

### B. Activation acceptance test (staging — gated on 157CB + 157J)
Set `ENABLE_AI_GRADING=true`, `OLLAMA_BASE_URL=<self-hosted>`, deploy `grade-answer` to **staging**:
- B1 valid answer → `available:true` with a bounded `suggestion` (score 1-4 or null).
- B2 malformed model output → `available:false`, reason `invalid_output` (no crash).
- B3 provider unreachable / timeout → `available:false` within `AI_TIMEOUT_MS`.
- B4 PII minimisation → only answer/rubric/question reach the provider; email/phone scrubbed.
- B5 no DB writes (inspect): no `question_instances`/`student_progress` change.
- B6 flag off → `available:false`, no provider call.

## 7. Scope / non-goals

- **Not wired into `process-event`** (that is **157L**, FUTURE INFRASTRUCTURE — reward path, needs
  staging + 157J reachability).
- **No teacher UI** (that is **157M**).
- **No deployment / activation** here — `grade-answer` is scaffolding; activation needs staging (157CB)
  and a self-hosted endpoint decision (157J).
- Hosted/cloud models remain opt-in and gated; default posture is self-hosted/zero-retention.
