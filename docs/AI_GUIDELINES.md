# AI_GUIDELINES.md — Den Seje App

_Binding rules for **every** AI feature, present and future. If a proposed AI behaviour conflicts
with this document, the behaviour is wrong._
_Context: [PROJECT_VISION.md](./PROJECT_VISION.md) → "Long-term AI vision". Boundaries & abstraction
shape: [ARCHITECTURE.md](./ARCHITECTURE.md) §13. Schedule: [ROADMAP.md](./ROADMAP.md)._
_Status: **no AI service is implemented as of 2026-06-30.** These rules apply the moment any is._

---

## 0. Why these rules exist

This is an educational product for minors. Its credibility rests on two promises: **the teacher is
the authority**, and **rewards are deterministic and fair**. AI is allowed only where it does not
weaken either promise. AI here is an _accelerator and a suggestion engine_, never a decision-maker.

## 1. Authority & boundaries (non-negotiable)

1. **AI never writes directly to the database.** AI output is returned to a deterministic Edge
   Function or a human; only existing, audited RPCs/queries mutate state. There is no "AI → table"
   path.
2. **AI cannot grant XP, coins, mastery, achievements, or any reward.** Rewards come only from the
   deterministic RPCs (`process_question_attempt`, `process_text_answer`, `review_answer`, …) under
   their existing CAS guards. AI may _suggest_ a grade; the award still flows through the
   deterministic path.
3. **AI cannot bypass teacher review.** Open/long answers remain teacher-owned
   (`process-event` PATH 1 → teacher queue). AI may pre-draft a grade or feedback **for the teacher
   to confirm or override**, but the teacher's action is what counts.
4. **AI is advisory.** Its outputs are _inputs_ to a human decision or to a deterministic rule —
   never the final arbiter of correctness, reward, or progression.
5. **Deterministic systems stay deterministic.** The progression engine (`js/progression.js`), the
   quiz state machine (`app.js`), and the grading RPCs must remain pure, predictable, and
   reproducible. AI introduces no randomness into any reward or correctness outcome.
6. **No AI in the avatar geometry path.** Per avatar decisions D-033/D-034, AI must **never**
   generate or define avatar base/face/eyes/hair/proportions/anchors/masks. AI is permitted **only**
   for isolated, slot-constrained cosmetic **item overlays**, each passing the slot-mask + QA gates.
   See [AVATAR_SYSTEM.md](./AVATAR_SYSTEM.md).

## 2. Fallback behaviour (fail-soft is mandatory)

Every AI capability must degrade to **today's behaviour** when the AI is unavailable, slow, errors,
or returns low-confidence output. Examples:

- **Advisory grading down** → behave exactly as now: save the open answer, mark `pending`, route to
  the teacher. The student is never blocked.
- **OCR down** → fall back to manual text entry; never lose the student's answer.
- **STT/TTS down** → the feature is simply absent; core flow unaffected.

Rules:
- AI calls are **non-blocking** to the critical path wherever possible, and **time-boxed** with an
  explicit timeout.
- An AI failure is **logged, not swallowed** (CLAUDE.md rule 9 / "fail loud to the developer"),
  but **never** surfaced as a dead UI state to the student.
- Every AI feature ships behind a **default-off feature flag** (mirroring `AVATAR_V2`) so it can be
  disabled instantly without a code rollback.

## 3. Privacy (serves minors)

- **Data minimisation:** send the AI the _least_ data needed for the task. No names, no profile
  identifiers, no unrelated context. Prefer sending only the answer text / the image / the audio
  clip required.
- **Prefer self-hostable / zero-cost services** and EU-region or self-hosted processing, consistent
  with the 157A audit. Hosted third-party AI on student content requires an explicit, documented
  decision and a consent/GDPR gate first (Section 157Q).
- **No training on student data.** AI providers must not retain or train on submitted student
  content; configure for zero-retention where the provider supports it.
- **Explicit, consented data flows.** Any new path that sends student data off-platform must be
  documented in [ARCHITECTURE.md](./ARCHITECTURE.md) and gated by consent (GDPR — minors).
- **Secrets never reach the frontend.** AI provider keys live only in Edge Function env
  (`Deno.env`); the no-build-step frontend cannot hold secrets (see [ARCHITECTURE.md](./ARCHITECTURE.md) §3).

## 4. Prompt engineering standards

- **Deterministic prompting:** low/zero temperature for grading/extraction tasks; pin the model and
  prompt version; record both alongside any AI-produced suggestion for auditability.
- **Structured I/O:** request structured output (e.g. JSON with a fixed schema). **Validate every
  field defensively** before use — assume the model can return malformed, partial, or null output
  (CLAUDE.md rules 3–6). Never `JSON.parse` and trust.
- **Bounded scope per call:** one task per prompt (grade _this_ answer; transcribe _this_ image).
  No multi-purpose mega-prompts that mix grading with content generation.
- **No authority language to the student.** AI-drafted feedback is reviewed before a student sees it
  as authoritative; never present an unreviewed AI grade as final.
- **Versioned prompts in source.** Prompts live in the AI abstraction module (§6), not inlined ad
  hoc, so they can be reviewed, tested, and changed deliberately.
- **Confidence handling:** require the model to express uncertainty; treat low confidence as a
  fallback trigger (§2), not as a confident answer.

## 5. Determinism & auditability

- Reward/correctness outcomes must be **reproducible** from inputs; AI must not make the same input
  produce different rewards.
- Any AI suggestion that influences a teacher decision is **recorded** (model id, prompt version,
  input hash, output) so a human can audit why a suggestion was made.
- AI suggestions are clearly **labelled as AI-generated** in teacher UI.

## 6. Model abstraction layer

- All AI access goes through **one abstraction layer** (an Edge module, planned `_shared/ai/`)
  exposing a narrow, task-shaped interface — e.g. `grade(answer, rubric)`, `transcribe(media)`,
  `draftFeedback(answer, context)`. Feature code calls the interface, never a provider SDK directly.
- The layer owns: provider/model selection, prompt/version management, timeout + retry policy,
  structured-output validation, redaction/minimisation, and fail-soft signalling.
- **Swapping models/providers must not touch feature code.** This is what keeps Ollama (the audited
  first target) replaceable by any other model later.

## 7. Future multi-model support

- The abstraction must allow **per-task model routing** (a cheap local model for OCR/transcription;
  a stronger model for nuanced feedback) without leaking provider details upward.
- New providers are added **inside** the abstraction layer behind the same interface, each with its
  own redaction/retention configuration.
- Default posture remains **zero-cost / self-hostable first**; hosted models are opt-in, gated, and
  documented.

## 8. Per-capability quick reference (from the 157A audit)

| Capability | Where it may run | Authority | Fallback |
|---|---|---|---|
| OCR (photo→text) | frontend (Tesseract wasm) | none (produces editable text) | manual text entry |
| Advisory grading | Edge (`grade-answer`, via §6 layer) | suggestion only → teacher/RPC | `pending` → teacher queue (today's behaviour) |
| Draft teacher feedback | Edge (§6 layer) | suggestion only → teacher edits | teacher writes feedback manually |
| STT (voice→text) | deferred | none | manual entry |
| TTS (read-aloud) | deferred (pre-gen audio preferred) | none | no audio |
| Cosmetic item art | offline pipeline, slot-constrained | item overlays only, QA-gated; **never geometry** | manual/curated items |

## 9. Definition of compliant AI work

An AI feature is acceptable only if **all** hold:
- [ ] Behind a default-off feature flag.
- [ ] No direct DB writes; rewards only via existing deterministic RPCs.
- [ ] Cannot bypass teacher review; advisory only.
- [ ] Fails soft to current behaviour; no student dead state; failures logged.
- [ ] Sends minimal data; secrets only in Edge env; consent/GDPR satisfied for any off-platform flow.
- [ ] Goes through the model abstraction layer with versioned prompts and validated structured output.
- [ ] Suggestions are labelled and auditable.

If any box cannot be checked, **do not ship it** (consistent with CLAUDE.md "REFUSE if rules cannot
be followed").
