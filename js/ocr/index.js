// ── Document-recognition service facade (157I) ───────────────────────────────
// The single entry point consumers use. It hides the provider entirely: callers get
// a structured OCRResult and never touch Tesseract. Browser-only, default-off,
// fail-soft, zero-cost (nothing loads until recognise() is actually called).
//
// Default provider = Tesseract (the first impl). A different local-only provider can
// be injected via config.provider without changing any consumer.

import { assertProvider } from "./provider.js";
import { createTesseractProvider } from "./provider-tesseract.js";
import { normalizeImageInput } from "./acquire.js";
import { preprocess } from "./preprocess.js";

// Master switch for OCR (157I). Default OFF → no engine download, no UI, zero impact.
export const ENABLE_OCR = false;

/** Whether the OCR feature flag is on (no capability check). No side effects. */
export function isOcrEnabled() {
  return ENABLE_OCR === true;
}

function browserCapable() {
  try {
    return typeof window !== "undefined" &&
      typeof WebAssembly !== "undefined" &&
      typeof Worker !== "undefined";
  } catch (_e) {
    return false;
  }
}

/**
 * Create a document recogniser.
 * @param {{enabled?:boolean, provider?:import('./provider.js').OCRProvider, providerConfig?:Object}} [config]
 */
export function createDocumentRecognizer(config) {
  const cfg = config && typeof config === "object" ? config : {};
  const enabled = cfg.enabled !== undefined ? !!cfg.enabled : (ENABLE_OCR === true);

  let provider = null;
  function getProvider() {
    if (provider) return provider;
    const candidate = (cfg.provider && typeof cfg.provider === "object")
      ? cfg.provider
      : createTesseractProvider(cfg.providerConfig || {});
    provider = assertProvider(candidate); // strict contract incl. isLocalOnly
    return provider;
  }

  return {
    /** True only when enabled AND the browser can run the engine. Never throws. */
    isAvailable() {
      try { return enabled && browserCapable(); } catch (_e) { return false; }
    },

    /**
     * Recognise text from an image source. Rejects softly when unavailable; the
     * caller falls back to manual entry. Returns a structured OCRResult.
     * @param {any} source  File | Blob | canvas | image | dataURL
     * @param {{lang?:string, onProgress?:(p:number)=>void, maxDim?:number}} [opts]
     * @returns {Promise<import('./ocr-result.js').OCRResult>}
     */
    async recognize(source, opts) {
      if (!enabled || !browserCapable()) throw new Error("OCR unavailable");
      const o = opts && typeof opts === "object" ? opts : {};
      const img = normalizeImageInput(source);
      const prepared = await preprocess(img, o).catch(() => img); // fail-soft to original
      return await getProvider().recognize(prepared, o);
    },

    /** Optionally warm the engine ahead of use. Best-effort; never throws. */
    warmup(opts) {
      try {
        if (enabled && browserCapable()) {
          const p = getProvider();
          Promise.resolve(p.init(opts)).catch(() => {});
        }
      } catch (_e) { /* fail-soft */ }
    },

    /** Release the engine/workers. Never throws. */
    dispose() {
      try { if (provider) provider.terminate(); } catch (_e) { /* fail-soft */ }
      provider = null;
    },
  };
}
