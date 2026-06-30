// ── Tesseract OCR provider (157I) ────────────────────────────────────────────
// The FIRST implementation of the OCRProvider contract (provider.js). The rest of
// the app never imports this directly — it talks to the contract via the facade
// (index.js). Tesseract.js runs entirely in the browser (wasm + Web Worker); image
// data never leaves the device, so isLocalOnly = true.
//
// The engine is LAZY-loaded from a CDN ESM bundle on first recognise — nothing is
// downloaded at import time, so a default-off OCR has zero cost. (Self-hosting the
// engine + traineddata is the privacy-preferred follow-up, 157H OD-1; image data is
// local either way — only the engine/model code is fetched.)

import { createOCRResult } from "./ocr-result.js";

const TESSERACT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5/+esm";
const PROVIDER_ID = "tesseract";
const DEFAULT_LANGS = "dan+eng";

function nowMs() {
  try { return performance.now(); } catch (_e) { return Date.now(); }
}

/**
 * Create a Tesseract-backed OCR provider. Conforms to the OCRProvider contract.
 * @param {{langs?:string}} [config]
 * @returns {import('./provider.js').OCRProvider}
 */
export function createTesseractProvider(config) {
  const cfg = config && typeof config === "object" ? config : {};
  const langs = typeof cfg.langs === "string" && cfg.langs.length > 0 ? cfg.langs : DEFAULT_LANGS;

  let _worker = null;
  let _initPromise = null;

  async function ensureWorker(onProgress) {
    if (_worker) return _worker;
    if (_initPromise) return _initPromise;
    _initPromise = (async () => {
      const mod = await import(TESSERACT_URL);
      const T = mod && (typeof mod.createWorker === "function" ? mod : (mod.default || mod));
      if (!T || typeof T.createWorker !== "function") {
        throw new Error("Tesseract: unexpected module shape");
      }
      const worker = await T.createWorker(langs, undefined, {
        logger: (m) => {
          try {
            if (onProgress && m && typeof m.progress === "number" && m.status === "recognizing text") {
              onProgress(m.progress);
            }
          } catch (_e) { /* progress is best-effort */ }
        },
      });
      _worker = worker;
      return worker;
    })();
    return _initPromise;
  }

  function mapWords(words) {
    if (!Array.isArray(words)) return [];
    const out = [];
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (!w) continue;
      const b = w.bbox && typeof w.bbox === "object" ? w.bbox : null;
      out.push({
        text: typeof w.text === "string" ? w.text : "",
        confidence: typeof w.confidence === "number" ? w.confidence : null,
        bbox: b
          ? { x0: num(b.x0), y0: num(b.y0), x1: num(b.x1), y1: num(b.y1) }
          : null,
      });
    }
    return out;
  }

  function num(v) { return typeof v === "number" ? v : 0; }

  return {
    id: PROVIDER_ID,
    isLocalOnly: true,

    async init(opts) {
      await ensureWorker(opts && opts.onProgress);
    },

    async recognize(image, opts) {
      const started = nowMs();
      const worker = await ensureWorker(opts && opts.onProgress);
      const out = await worker.recognize(image);
      const data = out && out.data && typeof out.data === "object" ? out.data : {};
      return createOCRResult({
        text: typeof data.text === "string" ? data.text : "",
        confidence: typeof data.confidence === "number" ? data.confidence : null,
        words: mapWords(data.words),
        blocks: [], // kept light in v1; per-word detail is in `words`
        lang: langs,
        providerId: PROVIDER_ID,
        durationMs: Math.round(nowMs() - started),
      });
    },

    terminate() {
      try { if (_worker && typeof _worker.terminate === "function") _worker.terminate(); }
      catch (_e) { /* fail-soft */ }
      _worker = null;
      _initPromise = null;
    },
  };
}
