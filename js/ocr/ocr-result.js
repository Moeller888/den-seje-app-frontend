// ── OCR result model (157I) ──────────────────────────────────────────────────
// The structured result every OCR provider returns. The rest of the app depends on
// THIS shape, never on a provider's native output — so providers stay swappable.
// v1 mostly uses `.text`, but the richer fields are part of the contract from day one.

/**
 * @typedef {Object} OCRWord
 * @property {string} text
 * @property {number|null} confidence   // 0..100, or null if unknown
 * @property {{x0:number,y0:number,x1:number,y1:number}|null} bbox
 */

/**
 * @typedef {Object} OCRResult
 * @property {string} text               // recognised text (primary field used by v1)
 * @property {number|null} confidence    // overall confidence 0..100, or null
 * @property {OCRWord[]} words           // per-word detail (may be empty)
 * @property {Array<Object>} blocks      // per-block detail (may be empty)
 * @property {string} lang               // language(s) used, e.g. "dan+eng"
 * @property {string} providerId         // which provider produced this
 * @property {number} durationMs         // recognition time, or -1 if unknown
 */

/**
 * Build a fully-formed OCRResult from a partial, defensively. Never throws.
 * @param {Partial<OCRResult>} [partial]
 * @returns {OCRResult}
 */
export function createOCRResult(partial) {
  const p = partial && typeof partial === "object" ? partial : {};
  return {
    text: typeof p.text === "string" ? p.text : "",
    confidence: typeof p.confidence === "number" ? p.confidence : null,
    words: Array.isArray(p.words) ? p.words : [],
    blocks: Array.isArray(p.blocks) ? p.blocks : [],
    lang: typeof p.lang === "string" && p.lang.length > 0 ? p.lang : "unknown",
    providerId: typeof p.providerId === "string" && p.providerId.length > 0 ? p.providerId : "unknown",
    durationMs: typeof p.durationMs === "number" ? p.durationMs : -1,
  };
}

/** An empty, valid result (no text). */
export const EMPTY_OCR_RESULT = createOCRResult();
