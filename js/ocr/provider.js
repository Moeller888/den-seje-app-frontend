// ── OCR provider contract (157I) ─────────────────────────────────────────────
// The strict, swappable interface every recognition engine must implement. The
// application depends ONLY on this contract — never on Tesseract (or any engine)
// directly. Tesseract is merely the first implementation (see provider-tesseract.js).
//
// HARD CONTRACT: `isLocalOnly === true`. A provider that could transmit image bytes
// off-device is non-conformant and is rejected by assertProvider() below. This is the
// machine-checked form of the 157H privacy invariant (no student image leaves the device).

/**
 * @typedef {Object} OCRProvider
 * @property {string} id                      // stable provider id, e.g. "tesseract"
 * @property {true} isLocalOnly               // MUST be exactly true (no off-device image egress)
 * @property {(opts?:Object)=>Promise<void>} init        // lazy engine/model load
 * @property {(image:any, opts?:Object)=>Promise<import('./ocr-result.js').OCRResult>} recognize
 * @property {()=>void} terminate             // release workers/memory
 */

/**
 * Validate that an object satisfies the OCRProvider contract, including the
 * local-only privacy guarantee. Throws on violation. Returns the provider on success.
 * @param {any} p
 * @returns {OCRProvider}
 */
export function assertProvider(p) {
  if (!p || typeof p !== "object") {
    throw new Error("OCR provider: missing or not an object");
  }
  if (typeof p.id !== "string" || p.id.length === 0) {
    throw new Error("OCR provider: invalid id");
  }
  if (p.isLocalOnly !== true) {
    // Strict privacy gate: only local-only engines may process (student) images.
    throw new Error("OCR provider '" + p.id + "': must be local-only (isLocalOnly !== true)");
  }
  for (const method of ["init", "recognize", "terminate"]) {
    if (typeof p[method] !== "function") {
      throw new Error("OCR provider '" + p.id + "': missing method " + method);
    }
  }
  return p;
}
