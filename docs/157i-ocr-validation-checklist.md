# 157I — OCR Service: Validation Checklist

_Proof-of-correctness for the browser-only document-recognition service._
_Modules: `js/ocr/` (+ `adapters/answer-capture.js`). Wiring: `app.js`. Spec: `157h-ocr-document-recognition-spec.md`._
_Owner: project owner. Last reviewed: 2026-06-30._

Ships **default-off** (`ENABLE_OCR = false`). Part A is verified now; Part B is the activation
acceptance test (browser, flag on, a sample image).

---

## A. Verified now (flag off)

| # | Check | Method | Result |
|---|---|---|---|
| A1 | All OCR modules + `app.js` are valid ESM | `node --check` (8 files) | ✅ Pass |
| A2 | Import chain resolves (all local static files) | `app.js → js/ocr/adapters/answer-capture.js → ../index.js → {provider,provider-tesseract→ocr-result,acquire,preprocess}` | ✅ Pass |
| A3 | **No behavioural change when disabled** | `attachOcrControl` returns immediately when `isAvailable()` is false (flag off) → no DOM, no engine, textarea unchanged | ✅ Pass (review) |
| A4 | **Nothing loads at import time** | Tesseract is a **dynamic** `import()` inside `recognize()` only; static imports define functions with no side effects | ✅ Pass (review) |
| A5 | Production smoke (baseline unchanged) | `npx playwright test tests/example.spec.ts --project=chromium` | ✅ Pass (1 passed) |
| A6 | **Strict provider abstraction** | App imports only the facade + `OCRProvider`/`OCRResult`; `assertProvider()` rejects non-local-only or incomplete providers | ✅ Pass (review) |
| A7 | **Structured result** | `recognize()` returns `OCRResult` ({text, confidence, words, blocks, lang, providerId, durationMs}), not plain text | ✅ Pass |
| A8 | Fail-soft | Every public method try/catch-wrapped; `recognize` rejects softly when unavailable; preprocess falls back to original; adapter swallows errors | ✅ Pass (review) |

## B. Activation acceptance test (browser, flag on)

**Setup:** set `ENABLE_OCR = true` in `js/ocr/index.js`; deploy a preview (or serve locally); open a
text/long-answer question.

| # | Check | Expected |
|---|---|---|
| B1 | Scan control appears on text answers | "📷 Scan tekst" control under the textarea (only when enabled) |
| B2 | Recognise a printed sample image | Engine lazy-loads (first time), progress shown, extracted text inserted into the textarea |
| B3 | **Review-before-submit** | Text is editable; nothing auto-submits; normal "Send svar" still drives `submitAnswer()` |
| B4 | **No image upload** | DevTools Network shows **no** request carrying the image bytes (only the engine/model fetch from CDN); image stays on-device |
| B5 | Empty / unreadable image | "Ingen tekst fundet — skriv manuelt." — textarea still usable |
| B6 | Engine load failure / offline | "Kunne ikke genkende — skriv manuelt." — no crash, textarea usable |
| B7 | Provider contract | Injecting a provider with `isLocalOnly !== true` throws via `assertProvider` (unit) |
| B8 | Flag off | Set `ENABLE_OCR=false`, reload → no scan control, no engine fetch, textarea identical |
| B9 | Result shape | `recognize()` resolves an `OCRResult` with the documented fields populated |
| B10 | Mobile/low-end | Preprocess downscale keeps recognition responsive (worker); UI not blocked |

## Notes / limitations

- **Tests run against production** (flag off, undeployed feature) → B-series is a browser/preview test.
- **Engine/model source:** v1 lazy-loads Tesseract from CDN (code/model only — never image data).
  Self-hosting the engine + `dan`/`eng` traineddata is the privacy-preferred follow-up (157H OD-1).
- **Styling:** the scan control ships unstyled (functional); CSS polish is a follow-up.
- **Camera capture** (`getUserMedia`) is a fast-follow; v1 is file-upload first (157H OD-2).
- **Handwriting** accuracy is limited (Tesseract); low confidence should be surfaced — the provider is
  swappable for a future local handwriting model without touching consumers.
