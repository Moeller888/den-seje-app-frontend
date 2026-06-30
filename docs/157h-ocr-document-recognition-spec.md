# 157H — Client-Side Document-Recognition Service (OCR) Specification

Status: **SPEC / DESIGN — no code, no dependency, no infra, no runtime change.**
Date: 2026-06-30. Owner: project owner (solo). Gate: **UNGATED** (pure documentation).
Designs **157I** (implementation, SOFT-gated: browser-only, zero-cost, default-off).
Builds on: 157A audit, [AI_GUIDELINES.md](./AI_GUIDELINES.md) (OCR = advisory, fallback to manual),
[ARCHITECTURE.md](./ARCHITECTURE.md) §6/§13, [CLAUDE_WORKFLOW.md](./CLAUDE_WORKFLOW.md).

---

## 1. Purpose & design principle

Provide a **generic, reusable, browser-only document-recognition service** that turns an image of a
document into structured text. **It is deliberately NOT an "answer scanner."** Answer-capture is just
the **first consumer**; the service is consumer-agnostic so future features reuse it unchanged:
worksheets, handwritten responses, historical source documents, teacher material, etc.

> **Binding invariant (the reason this is in-browser):** **no student-originated image ever leaves the
> device.** Image acquisition, preprocessing and recognition all run **locally in the browser**;
> only the **user-confirmed extracted text** continues into the normal app flow. No third-party image
> upload, ever. (157A; AI_GUIDELINES.md Privacy.)

## 2. Scope & non-goals

**In scope:** a layered client service — acquisition → preprocess → recognition (pluggable engine) →
post-process → structured result — plus thin **consumer adapters**, feature flags, fail-soft, and a
mandatory human-review step.

**Non-goals:** server-side OCR; uploading images anywhere; auto-grading from OCR; changing
`process-event`, the reward path, the state machine, or any API contract; handwriting accuracy
guarantees (see §8); routing images through Cloudinary or any third party (explicitly forbidden,
157F §10).

## 3. Privacy invariant (binding)

1. **Images are processed only in-browser** and held **in memory** for the shortest time needed;
   object URLs are revoked and buffers dropped after recognition. Nothing is persisted or uploaded.
2. **Only user-confirmed text** enters the app, and only through existing paths (e.g. the answer
   `<textarea>`). The raw image is never sent to `process-event`, Supabase, Cloudinary, Sentry, or
   any service.
3. **Engine/model assets are not user data.** The OCR engine (wasm) + language models are **code/models**;
   they are **self-hosted as first-party static assets** (preferred) so the *entire* pipeline is
   first-party and works offline — no runtime third-party calls at all. (CDN fallback is allowed for
   the engine/model **only**, never for image data.)
4. **A recognition provider that transmits image bytes off-device is forbidden** by the provider
   contract (§5) for any student-originated image.

## 4. Architecture

```
 Consumer (answer capture │ worksheet │ source doc │ teacher material │ …)
        │  uses a thin Adapter (maps generic result → its domain)
        ▼
 ┌─────────────────────────  DocumentRecognitionService  ─────────────────────────┐
 │  1. Acquisition   : File | Blob | <canvas> | <video> frame | <img> | dataURL    │
 │  2. Preprocess    : downscale, grayscale, deskew/threshold (optional, local)    │
 │  3. Recognition   : RecognitionProvider (pluggable)  ── default: Tesseract.js   │
 │  4. Post-process  : trim, normalise whitespace, language hints, confidence map  │
 │  5. Result        : { text, confidence, words[], blocks[], lang, durationMs }   │
 └─────────────────────────────────────────────────────────────────────────────────┘
        │  returns a structured, domain-agnostic result
        ▼
 Consumer presents result for MANDATORY human review/edit → uses the confirmed text
```

- The **core service knows nothing about quizzes**. Consumers own their UX and how they use the text.
- Every stage is **defensive and fail-soft**; any failure degrades to "no OCR available → type manually".

## 5. Recognition provider interface (swappable, local-only)

A small interface so the engine is replaceable without touching consumers (mirrors the AI abstraction
principle in AI_GUIDELINES.md §6):

```
interface RecognitionProvider {
  readonly id: string;                 // e.g. "tesseract"
  readonly isLocalOnly: true;          // CONTRACT: must not transmit image bytes off-device
  init(opts): Promise<void>;           // lazy; load wasm/model
  recognize(image, opts): Promise<RecognitionResult>;
  terminate(): void;                   // free workers/memory
}
```

- **Default provider: Tesseract.js** (LSTM OCR, wasm, in-browser worker). Languages: **Danish (`dan`)**
  primary + **English (`eng`)** secondary.
- `isLocalOnly: true` is a **hard contract**: a provider that uploads images is non-conformant and may
  not be used for student-originated images. (A hypothetical higher-accuracy provider must still be
  local — e.g. a future wasm handwriting model — to satisfy §3.)

## 6. Public API surface (proposed, for 157I)

```
createDocumentRecognizer(config?) -> recognizer
recognizer.isAvailable(): boolean                 // flag + capability check; never throws
recognizer.recognize(source, { lang, hints, signal, onProgress }): Promise<Result>
recognizer.warmup(): void                         // optional, idle preload
recognizer.dispose(): void
```
- `recognize` is **abortable** (`AbortSignal`) and reports progress (`onProgress(0..1)`).
- All methods are **safe to call**; when OCR is disabled/unavailable they no-op or reject softly so the
  consumer falls back to manual entry (graceful, like `playSound()` in `js/audio.js`).

## 7. Consumers (one now, several documented)

| Consumer | Status | Maps result → |
|---|---|---|
| **Answer capture** (student text/long answer) | **v1 target (157I)** | populates the existing `<textarea>` (app.js) with extracted text for the student to **review/edit**, then the normal `submitAnswer()` path runs. OCR never calls `process-event` directly. |
| Worksheet digitiser | future | structured fields / multiple text blocks |
| Handwritten responses | future (accuracy-limited, §8) | editable text, low-confidence flagged |
| Historical source documents | future | full-text extraction for reading/annotation |
| Teacher material import | future | bulk text extraction into authoring tools |

All consumers reuse the **same** service + provider; only the adapter differs.

## 8. Languages & the handwriting reality (honesty)

- Tesseract LSTM is **strong on printed text**, **weak on free handwriting**. "Handwritten responses"
  is a listed future use, so the **provider is pluggable** (§5) to allow a future local handwriting
  model — but **v1 targets printed/typed material** and must **flag low confidence** rather than
  pretend accuracy. Do not market handwriting accuracy we don't have.
- Danish diacritics (æ/ø/å) require the `dan` traineddata; ship it. Allow per-call `lang` override.

## 9. UX & human-in-the-loop (advisory only)

- Flow: **capture** (file picker or camera via `getUserMedia`) → **preview** → **recognise** (progress)
  → **review/edit the text** → use it. The **review/edit step is mandatory**: OCR output is a
  *draft*, never authoritative.
- For answers specifically: OCR fills the textarea; the **student confirms/edits before submitting**.
  This preserves AI_GUIDELINES.md (advisory only; human authority) and CLAUDE.md determinism — OCR
  feeds **editable text into the existing deterministic submit path**, it does not grade or auto-submit.

## 10. Feature flags & defaults

- `ENABLE_OCR` (per-surface, default **off** where appropriate, mirroring `ENABLE_SENTRY`). When off:
  no engine download, no camera prompt, no UI — zero impact; manual text entry unchanged.
- Capability gating: even when enabled, `isAvailable()` checks browser support (wasm, workers,
  `getUserMedia` for camera) and **degrades silently** to file-only or to manual entry.

## 11. Performance & bundle budget (school devices)

- The OCR engine + language model are **large** (wasm core a few MB; `dan` traineddata ~10–15 MB).
  Therefore: **lazy-load only on first OCR use** (never on page load), cache aggressively
  (immutable, versioned), and **never block the core quiz flow**.
- Run recognition in a **Web Worker** (Tesseract.js default) so the UI thread stays responsive.
- Preprocess (downscale to a sane max dimension, grayscale) **before** recognition to cut time/memory
  on low-end devices. Respect a soft time budget; allow abort.
- Honour `prefers-reduced-data` / be mindful of mobile data — gate the model download behind an
  explicit user action ("Scan document").

## 12. Error handling, permissions, fail-soft

- **Camera denied / unavailable** → fall back to file upload; if that fails → manual text entry. Never
  a dead state (CLAUDE.md rule 7).
- **Engine load failure / OCR error / timeout** → surface a non-blocking message, keep the textarea
  usable. No silent loss of the user's ability to answer.
- **Memory hygiene:** revoke object URLs, terminate workers when done, drop image buffers.
- Failures may be reported via `logError`/Sentry (157B) **without** the image (text/metadata only,
  already PII-scrubbed) — but **never** attach the image.

## 13. Determinism & authority

OCR is **non-deterministic-ish** (model output) and therefore **must never feed a deterministic
reward/correctness path directly**. It only produces **editable text a human confirms**. The quiz
state machine and grading RPCs are unaffected. This keeps the determinism guarantees (CLAUDE.md rule 8)
and the advisory-only posture (AI_GUIDELINES.md) intact.

## 14. Proposed module layout (for 157I — not created here)

```
js/ocr/
  index.js            // createDocumentRecognizer() — the service/facade
  provider-tesseract.js // RecognitionProvider impl (lazy wasm/worker, dan+eng)
  preprocess.js       // downscale/grayscale/threshold (pure, local)
  acquire.js          // File/Blob/camera(getUserMedia)/canvas → normalised image
  result.js           // Result types + post-processing
adapters/
  answer-capture.js   // v1 consumer: textarea population + review UX
assets/ocr/           // self-hosted engine + dan/eng traineddata (lazy-loaded)
```
Pure ESM, defensive, graceful no-op — consistent with `js/audio.js` / `js/sentry.js`.

## 15. Integration with the answer path (precise boundary)

- 157I wires **only** the answer-capture adapter into the existing text/long-answer UI (app.js
  textarea creation around the `submitAnswer(textarea.value)` calls). The adapter **sets the textarea
  value**; the student edits and submits exactly as today.
- **No change** to `submitAnswer`, `process-event`, response shapes, or the state machine. OCR is
  purely a text-entry assist in front of the unchanged pipeline.

## 16. Test strategy (157I / 157S)

- Unit: preprocess + post-process are pure → deterministic tests.
- Capability/flag: `isAvailable()` returns false when disabled/unsupported → manual entry path intact.
- Fail-soft: simulate engine load failure / camera denial → textarea remains usable, no dead state.
- Privacy assertion: no network request carries image bytes (assert no upload of the captured image).
- Golden text on a small fixed printed sample (tolerance on confidence), behind the flag.

## 17. Open decisions / risks

- **OD-1:** self-host engine+models (recommended, first-party/offline) vs CDN (smaller repo). Default:
  self-host; revisit if repo size is a concern.
- **OD-2:** camera capture in v1, or file-upload only first? (Camera adds `getUserMedia` + permission
  UX.) Default: **file-upload first**, camera as a fast-follow.
- **R-A (bundle/data):** large model download on first use — mitigated by explicit user action +
  caching + lazy load.
- **R-B (handwriting accuracy):** managed by honesty + low-confidence flagging + pluggable provider.
- **R-C (device perf):** mitigated by worker + preprocess + abort + time budget.

## 18. Decision summary & next step

| Question | Answer |
|---|---|
| Scope | Generic **document-recognition service**; answer-capture is the first consumer. |
| Where | **100% browser-side**; **no image upload, ever**. |
| Engine | Tesseract.js (wasm), pluggable provider (`isLocalOnly` contract); `dan`+`eng`. |
| Authority | **Advisory only** — editable text + mandatory human review; never auto-grades. |
| Flags | `ENABLE_OCR` default-off where appropriate; graceful absence. |
| Cost | **Zero** (free wasm, self-hosted models; no account, no Supabase Pro, no staging). |
| Next | **157I** — implement the service + answer-capture adapter, default-off, file-upload first. |
