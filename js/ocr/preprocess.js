// ── OCR preprocessing (157I) ─────────────────────────────────────────────────
// Optional, fail-soft downscale to cap image dimensions before recognition — cuts
// time and memory on low-end (school) devices. Purely local (canvas). On ANY failure
// it returns the original input unchanged, so recognition can still proceed.

const DEFAULT_MAX_DIM = 2000;

/**
 * Downscale a large image source to fit within maxDim (longest side). Returns a
 * canvas when downscaled, or the original input when no downscale is needed/possible.
 * Never throws.
 * @param {any} input
 * @param {{maxDim?:number}} [opts]
 * @returns {Promise<any>}
 */
export async function preprocess(input, opts) {
  try {
    const o = opts && typeof opts === "object" ? opts : {};
    const maxDim = typeof o.maxDim === "number" && o.maxDim > 0 ? o.maxDim : DEFAULT_MAX_DIM;

    // Only attempt for Blob/File and only where the canvas/bitmap APIs exist.
    if (typeof Blob === "undefined" || !(input instanceof Blob)) return input;
    if (typeof createImageBitmap !== "function" || typeof document === "undefined") return input;

    const bitmap = await createImageBitmap(input);
    const width = bitmap.width || 0;
    const height = bitmap.height || 0;
    const longest = Math.max(width, height);
    if (longest <= 0) { closeBitmap(bitmap); return input; }

    const scale = Math.min(1, maxDim / longest);
    if (scale >= 1) { closeBitmap(bitmap); return input; } // already small enough

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) { closeBitmap(bitmap); return input; }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    closeBitmap(bitmap);
    return canvas;
  } catch (_e) {
    return input; // fail-soft: use the original source
  }
}

function closeBitmap(bitmap) {
  try { if (bitmap && typeof bitmap.close === "function") bitmap.close(); } catch (_e) { /* ignore */ }
}
