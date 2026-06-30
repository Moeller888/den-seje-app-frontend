// ── OCR image acquisition (157I) ─────────────────────────────────────────────
// Normalises/validates an image source into a type the recognition engine accepts.
// v1 path is a File from <input type="file">. No network, no upload — purely local.

/**
 * Validate an image source. Returns it unchanged if acceptable; throws otherwise.
 * Accepts the source types Tesseract.js handles directly.
 * @param {any} input
 * @returns {any}
 */
export function normalizeImageInput(input) {
  if (input === null || input === undefined) {
    throw new Error("OCR: no image provided");
  }
  const ok =
    (typeof Blob !== "undefined" && input instanceof Blob) ||
    (typeof File !== "undefined" && input instanceof File) ||
    (typeof HTMLCanvasElement !== "undefined" && input instanceof HTMLCanvasElement) ||
    (typeof HTMLImageElement !== "undefined" && input instanceof HTMLImageElement) ||
    (typeof HTMLVideoElement !== "undefined" && input instanceof HTMLVideoElement) ||
    (typeof ImageData !== "undefined" && input instanceof ImageData) ||
    (typeof OffscreenCanvas !== "undefined" && input instanceof OffscreenCanvas) ||
    typeof input === "string"; // dataURL / object URL / same-origin URL

  if (!ok) {
    throw new Error("OCR: unsupported image source");
  }
  return input;
}
