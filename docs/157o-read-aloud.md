# 157N/157O — Read-Aloud (TTS): Decision + Implementation

Status: **157N decided · 157O LIVE in production** (Web Speech activated, commit `52e7a04`; per-MC-option 🔊 added, commit `eb6d5fc`; both 2026-07-03). Audio clips remain an offline deliverable.
Date: 2026-06-30 (built) · 2026-07-03 (activated). Owner: project owner (solo). Gate: **SOFT** (built, now live).
Service: `js/read-aloud/`. Wiring: `app.js`. Builds on the `js/audio.js` graceful-playback pattern.
Rules: [AI_GUIDELINES.md](./AI_GUIDELINES.md) (privacy), [PROJECT_VISION.md](./PROJECT_VISION.md) (accessibility).

---

## 1. 157N — Strategy decision

**Decided: pre-generated Piper clips as the primary path, with an on-device Web Speech fallback —
no live TTS service.** Rationale (from the 157A audit): a live TTS server is unreachable from the
hosted frontend and adds cost/ops; pre-generated clips give consistent Danish quality and are served
as first-party static assets; Web Speech (`speechSynthesis`) is a zero-cost, on-device fallback so the
feature works **before** clips exist. **No audio is uploaded anywhere; no third-party service.**

## 2. 157O — What was built (`js/read-aloud/`)

A provider-abstracted read-aloud service (consistent with the OCR/AI layers), **live in prod**
(`ENABLE_READ_ALOUD=true`, `52e7a04`), fail-soft, zero-cost:

| File | Role |
|---|---|
| `provider.js` | `ReadAloudProvider` contract + `assertReadAloudProvider()`. App depends only on this. |
| `manifest.js` | `clipPathFor(clipKey)` (empty by default) + `hashKey(text)` (stable djb2 key). |
| `provider-prerecorded.js` | **Primary** — plays a Piper clip (via `Audio`) when one exists; else returns false. |
| `provider-webspeech.js` | **Fallback** — on-device `speechSynthesis` (`da-DK`); no files, no network. |
| `index.js` | `createReadAloud()` facade → `isAvailable()`/`speak()`/`stop()`. Order: prerecorded → web speech. |
| `adapters/quiz.js` | `attachReadAloudControl(container, text)` — question "🔊 Læs op" button. Plus `attachOptionReadAloudControl(row, text)` — per-MC-option "🔊" button (reads one option). Both no-op when disabled. |

**Wiring:** `app.js` calls `attachReadAloudControl(questionElement, question.content.question)` right
after the question text is set. For **MC** questions each option renders as a row `[answer button][🔊]`
and `app.js` calls `attachOptionReadAloudControl(row, option)` — the 🔊 is a **separate sibling** of the
answer button (never nested; `stopPropagation`/`preventDefault`), so it reads only that option and can
never submit the answer (commit `eb6d5fc`, 2026-07-03). Only MC gets per-option 🔊; text/number/open
formats do not. **Layout** (`index.html`, `#options .option-row` flex row): the answer button fills the
row and wraps long text; the 🔊 is a fixed **52×52** square (≥44px tap target), `align-items: center` so
it stays a compact square vertically centered beside the answer regardless of its height (commit
`89b4cec`, 2026-07-04). All of it is inert when `ENABLE_READ_ALOUD` is off (no button, no audio, no change).

## 3. The Piper clips (offline deliverable)

The actual audio is produced **offline by Piper** (a content task — not generated in-app, like the
avatar art). Convention: name each clip `hashKey(questionText)` and add it to `manifest.js` →
`/assets/avatar/...` ❌ → `/assets/audio/readaloud/<key>.mp3`. The frontend and pipeline agree on keys
with no per-question wiring. Until clips exist, the pre-recorded provider returns "no clip" and the
service falls back to Web Speech. Immutable, versioned filenames (long cache); never mutate a shipped clip.

## 4. Validation

### A. Verified now (default-off)
| # | Check | Method | Result |
|---|---|---|---|
| A1 | All 6 read-aloud files + `app.js` valid ESM | `node --check` | ✅ Pass |
| A2 | Default-off → no control, no audio | `attachReadAloudControl` no-ops when `isAvailable()` false | ✅ Pass (review) |
| A3 | Strict provider abstraction | app imports only the facade/adapter; `assertReadAloudProvider` guards the contract | ✅ Pass (review) |
| A4 | Fallback order | facade tries prerecorded → web speech; first to produce audio wins | ✅ Pass (review) |
| A5 | No upload / on-device | Web Speech is on-device; clips are first-party static assets | ✅ Pass (review) |
| A6 | Fail-soft | every path try/catch; `speak` returns false on failure; adapter swallows errors | ✅ Pass (review) |
| A7 | Quiz render unchanged | production smoke green (button absent with flag off) | ✅ Pass |

### B. Activation acceptance test (browser, flag on)
Set `ENABLE_READ_ALOUD=true`, serve/deploy a preview:
- B1 "🔊 Læs op" appears on questions.
- B2 with no clips → Web Speech reads the question (`da-DK`) on supported browsers.
- B3 add a Piper clip + manifest entry for a question → that clip plays instead of Web Speech.
- B4 click while speaking → stops; no overlap.
- B5 unsupported browser + no clip → button absent (or no audio), quiz unaffected.
- B6 flag off → no button, no audio.

## 5. Scope / non-goals

- **No Piper clips produced here** (offline content task).
- **No live TTS service** (decided against).
- **Activated (Web Speech)** — the flag is `true` in prod (`52e7a04`, 2026-07-03); Web Speech works
  immediately and a Danish (`da-DK`) voice is preferred when available (fail-soft to the default voice).
  Piper clips remain a future quality upgrade; adding them needs no further activation.
- Styling of the control is minimal; CSS polish is a follow-up.
