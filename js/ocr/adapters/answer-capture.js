// ── Answer-capture adapter (157I) ────────────────────────────────────────────
// The FIRST consumer of the document-recognition service. It maps the generic
// OCRResult onto the quiz answer UI: a "scan" file picker that fills the answer
// textarea with extracted text for the student to REVIEW/EDIT before submitting.
//
// Advisory only: OCR never submits and never grades — it just assists text entry in
// front of the unchanged submitAnswer()/process-event path (157H §15). When OCR is
// disabled or unsupported this is a complete no-op: the textarea behaves exactly as
// before (zero behavioural change). Fail-soft throughout — it can never break the UI.

import { createDocumentRecognizer } from "../index.js";

// One lazy recogniser for the page. The provider/engine is not loaded until a scan
// actually runs, so a default-off OCR costs nothing.
let _recognizer = null;
function recognizer() {
  if (!_recognizer) _recognizer = createDocumentRecognizer();
  return _recognizer;
}

/**
 * Attach an OCR "scan document" control to an answer textarea.
 * No-op when OCR is disabled/unsupported.
 * @param {HTMLTextAreaElement} textarea
 * @param {HTMLElement} container
 */
export function attachOcrControl(textarea, container) {
  try {
    if (!textarea || !container) return;
    const rec = recognizer();
    if (!rec.isAvailable()) return; // default-off → render nothing, change nothing

    const wrap = document.createElement("div");
    wrap.className = "ocr-control";

    const label = document.createElement("label");
    label.className = "ocr-scan-btn";
    label.textContent = "📷 Scan tekst";

    // File-upload first (157H OD-2). `capture` hints the camera on mobile but this is
    // still a local file picker — no getUserMedia, no upload. The image stays on-device.
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.setAttribute("capture", "environment");
    input.style.display = "none";
    label.appendChild(input);

    const status = document.createElement("span");
    status.className = "ocr-status";

    input.addEventListener("change", async () => {
      const file = input.files && input.files[0] ? input.files[0] : null;
      if (!file) return;
      input.disabled = true;
      status.textContent = "Genkender tekst…";
      try {
        const result = await rec.recognize(file, {
          onProgress: (p) => {
            try { status.textContent = "Genkender tekst… " + Math.round((p || 0) * 100) + "%"; }
            catch (_e) { /* progress is cosmetic */ }
          },
        });
        const text = result && typeof result.text === "string" ? result.text.trim() : "";
        if (text.length > 0) {
          // Advisory: insert for the student to review/edit, never auto-submit.
          const existing = typeof textarea.value === "string" ? textarea.value : "";
          textarea.value = existing.trim().length > 0
            ? existing.replace(/\s*$/, "") + "\n" + text
            : text;
          try { textarea.focus(); } catch (_e) { /* ignore */ }
          status.textContent = "Tekst indsat — tjek og ret før du sender.";
        } else {
          status.textContent = "Ingen tekst fundet — skriv manuelt.";
        }
      } catch (_e) {
        status.textContent = "Kunne ikke genkende — skriv manuelt.";
      } finally {
        input.disabled = false;
        try { input.value = ""; } catch (_e) { /* allow re-pick of same file */ }
      }
    });

    wrap.appendChild(label);
    wrap.appendChild(status);
    container.appendChild(wrap);
  } catch (_e) {
    // Fail-soft: OCR must never break the answer UI.
  }
}
