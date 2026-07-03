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

/**
 * Attach a per-option read-aloud control (small "🔊" button) beside a single MC
 * answer option. The button is a SEPARATE sibling of the answer button (never nested),
 * so clicking it does not submit; stopPropagation/preventDefault are applied defensively.
 * It reads only `text` (the one option). No-op when read-aloud is unavailable → nothing
 * renders, the option UI is unchanged. Fail-soft: can never break the option UI.
 * @param {HTMLElement} container  the option row (sibling wrapper of the answer button)
 * @param {string} text            the single option's text
 */
export function attachOptionReadAloudControl(container, text) {
  try {
    if (!container || typeof text !== "string" || text.trim().length === 0) return;
    const ra = readAloud();
    if (!ra.isAvailable()) return; // default-off / unsupported → render nothing, change nothing

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "read-aloud-option-btn";
    btn.textContent = "🔊";
    btn.setAttribute("aria-label", "Læs svarmulighed op: " + text);

    let speaking = false;
    function reset() { speaking = false; }

    btn.addEventListener("click", async (e) => {
      try {
        // Never let a read-aloud click reach/act as the answer button.
        if (e && typeof e.stopPropagation === "function") e.stopPropagation();
        if (e && typeof e.preventDefault === "function") e.preventDefault();
        if (speaking) { ra.stop(); reset(); return; }
        speaking = true;
        await ra.speak(text);
        reset();
      } catch (_e) {
        reset();
      }
    });

    container.appendChild(btn);
  } catch (_e) {
    // Fail-soft: never break the option UI over a read-aloud button.
  }
}
