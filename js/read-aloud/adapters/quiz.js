// ── Quiz read-aloud adapter (157O) ───────────────────────────────────────────
// First consumer of the read-aloud service: a "🔊 Læs op" control on the question.
// No-op when read-aloud is disabled or unsupported (default) → nothing renders, the
// quiz is unchanged. Fail-soft: it can never break the question UI.

import { createReadAloud } from "../index.js";

let _ra = null;
function readAloud() {
  if (!_ra) _ra = createReadAloud();
  return _ra;
}

/**
 * Attach a read-aloud control for `text` to `container`. No-op when unavailable.
 * @param {HTMLElement} container
 * @param {string} text
 */
export function attachReadAloudControl(container, text) {
  try {
    if (!container || typeof text !== "string" || text.trim().length === 0) return;
    const ra = readAloud();
    if (!ra.isAvailable()) return; // default-off → render nothing, change nothing

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "read-aloud-btn";
    btn.textContent = "🔊 Læs op";
    btn.setAttribute("aria-label", "Læs spørgsmålet højt");

    let speaking = false;
    function reset() { speaking = false; try { btn.textContent = "🔊 Læs op"; } catch (_e) {} }

    btn.addEventListener("click", async () => {
      try {
        if (speaking) { ra.stop(); reset(); return; }
        speaking = true;
        btn.textContent = "⏹ Stop";
        await ra.speak(text);
        reset();
      } catch (_e) {
        reset();
      }
    });

    container.appendChild(btn);
  } catch (_e) {
    // Fail-soft: never break the question UI over a read-aloud button.
  }
}
