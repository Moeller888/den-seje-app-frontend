// ── Quiz read-aloud adapter (157O) ───────────────────────────────────────────
// A compact reading player for prompts plus a one-tap speaker beside MC options.
// The voice is fixed (Azure Neural, same file in every browser — 157P); only the speed is a
// preference, kept on the device. Unsupported browsers keep the quiz unchanged.

import { createReadAloud } from "../index.js";
import { segmentQuestion, segmentOption } from "../lang-segments.js";

const RATE_KEY = "dsj_read_aloud_rate";
const UNAVAILABLE = "Oplæsningen kunne ikke hentes lige nu. Prøv igen om lidt.";
const RATES = Object.freeze([0.75, 1, 1.25, 1.5]);

let _ra = null;
function readAloud() {
  if (!_ra) _ra = createReadAloud();
  return _ra;
}

function storage() {
  try { return typeof window !== "undefined" ? window.localStorage : null; }
  catch (_e) { return null; }
}

function readPreferences() {
  try {
    const store = storage();
    const candidate = Number(store && store.getItem(RATE_KEY));
    return { rate: RATES.includes(candidate) ? candidate : 1 };
  } catch (_e) {
    return { rate: 1 };
  }
}

function savePreference(key, value) {
  try {
    const store = storage();
    if (store) store.setItem(key, String(value));
  } catch (_e) { /* private browsing / blocked storage: keep current session working */ }
}

function segmentsFor(kind, text, context) {
  try {
    if (!context || typeof context !== "object" || context.subject !== "engelsk") return null;
    const segments = kind === "option"
      ? segmentOption(text, context.question, context.options)
      : segmentQuestion(text);
    return Array.isArray(segments) && segments.length > 0 ? segments : null;
  } catch (_e) {
    return null;
  }
}

/** Pure tokeniser used by the visual reading track. No text is changed or lost. */
export function readableTokens(text) {
  try {
    const source = typeof text === "string" ? text : "";
    const tokens = [];
    let index = 0;
    for (const match of source.matchAll(/\s+|[^\s]+/gu)) {
      const value = match[0];
      tokens.push({ text: value, start: index, end: index + value.length, word: !/^\s+$/u.test(value) });
      index += value.length;
    }
    return tokens;
  } catch (_e) {
    return [];
  }
}

function renderReadableCopy(container, text) {
  const copy = document.createElement("span");
  copy.className = "read-aloud-copy";
  const words = [];
  for (const token of readableTokens(text)) {
    if (!token.word) {
      copy.appendChild(document.createTextNode(token.text));
      continue;
    }
    const word = document.createElement("span");
    word.className = "read-aloud-word";
    word.textContent = token.text;
    word.dataset.start = String(token.start);
    word.dataset.end = String(token.end);
    words.push(word);
    copy.appendChild(word);
  }
  container.textContent = "";
  container.appendChild(copy);
  return words;
}

function clearHighlight(words) {
  for (const word of words) word.classList.remove("is-active");
}

function highlightBoundary(words, boundary) {
  try {
    const index = boundary && Number.isFinite(boundary.charIndex) ? boundary.charIndex : -1;
    if (index < 0) return;
    let active = words.find((word) => index >= Number(word.dataset.start) && index < Number(word.dataset.end));
    if (!active) active = words.find((word) => Number(word.dataset.start) >= index);
    clearHighlight(words);
    if (active) active.classList.add("is-active");
  } catch (_e) { /* word highlighting is optional */ }
}

function labelledSelect(labelText, className) {
  const label = document.createElement("label");
  label.className = "read-aloud-field " + className + "-field";
  const text = document.createElement("span");
  text.textContent = labelText;
  const select = document.createElement("select");
  select.className = className;
  label.appendChild(text);
  label.appendChild(select);
  return { label, select };
}

/** Stop anything the shared service is speaking. Never throws. */
export function stopReadAloud() {
  try { readAloud().stop(); } catch (_e) { /* fail-soft */ }
}

/**
 * Attach the full reading player to a prompt. It adds word tracking, pause/resume,
 * restart and speed without changing the spoken text. There is deliberately no voice
 * choice: every browser must hear the same voice.
 * @param {HTMLElement} container
 * @param {string} text
 * @param {{subject?:string}} [context]
 */
export function attachReadAloudControl(container, text, context) {
  try {
    if (!container || typeof text !== "string" || text.trim().length === 0) return;
    const ra = readAloud();
    // Render nothing unless some provider can voice THIS text: the prompt stays plain.
    const promptSegments = segmentsFor("question", text, context);
    if (!ra.canSpeak(text, promptSegments ? { segments: promptSegments } : {})) return;

    const words = renderReadableCopy(container, text);
    const player = document.createElement("div");
    player.className = "read-aloud-player";
    player.setAttribute("role", "group");
    player.setAttribute("aria-label", "Oplæsning");

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "read-aloud-btn read-aloud-toggle";

    const restart = document.createElement("button");
    restart.type = "button";
    restart.className = "read-aloud-restart";
    restart.textContent = "↺ Forfra";
    restart.setAttribute("aria-label", "Læs spørgsmålet forfra");

    const rateField = labelledSelect("Tempo", "read-aloud-rate");
    for (const rate of RATES) {
      const option = document.createElement("option");
      option.value = String(rate);
      option.textContent = rate === 1 ? "Normal" : String(rate).replace(".", ",") + "×";
      rateField.select.appendChild(option);
    }

    const status = document.createElement("span");
    status.className = "read-aloud-status";
    status.setAttribute("aria-live", "polite");

    let preferences = readPreferences();
    let state = "idle";
    let generation = 0;
    rateField.select.value = String(preferences.rate);

    function paintState(next) {
      state = next;
      const speaking = state === "speaking";
      const paused = state === "paused";
      toggle.textContent = speaking ? "Ⅱ Pause" : paused ? "▶ Fortsæt" : "▶ Læs op";
      toggle.setAttribute("aria-label", speaking
        ? "Sæt oplæsningen på pause"
        : paused ? "Fortsæt oplæsningen" : "Læs spørgsmålet højt");
      restart.disabled = state === "idle";
      player.dataset.state = state;
      status.textContent = speaking ? "Læser højt" : paused ? "Oplæsning på pause" : "Klar";
      if (state === "idle") clearHighlight(words);
    }

    async function start() {
      const run = ++generation;
      clearHighlight(words);
      preferences = readPreferences();
      preferences.rate = Number(rateField.select.value) || 1;
      paintState("speaking");
      status.textContent = "Henter oplæsning …";
      const segments = segmentsFor("question", text, context);
      const ok = await ra.speak(text, {
        ...(segments ? { segments } : {}),
        rate: preferences.rate,
        onBoundary: (boundary) => { if (run === generation) highlightBoundary(words, boundary); },
        onState: (next) => {
          if (run !== generation) return;
          if (next === "speaking" || next === "paused") paintState(next);
          if (next === "ended") paintState("idle");
          if (next === "error") showUnavailable();
        },
      });
      if (run === generation && !ok) showUnavailable();
    }

    // Calm error state: no other voice takes over (157P). The pupil can simply try again.
    function showUnavailable() {
      paintState("idle");
      player.dataset.state = "error";
      status.textContent = UNAVAILABLE;
    }

    toggle.addEventListener("click", () => {
      try {
        if (state === "speaking") {
          if (!ra.pause()) { generation += 1; ra.stop(); paintState("idle"); }
          return;
        }
        if (state === "paused") {
          if (!ra.resume()) void start();
          return;
        }
        void start();
      } catch (_e) {
        paintState("idle");
      }
    });

    restart.addEventListener("click", () => { void start(); });
    rateField.select.addEventListener("change", () => {
      const rate = Number(rateField.select.value);
      preferences.rate = RATES.includes(rate) ? rate : 1;
      savePreference(RATE_KEY, preferences.rate);
      if (state !== "idle") void start();
    });
    paintState("idle");
    player.appendChild(toggle);
    player.appendChild(restart);
    player.appendChild(rateField.label);
    player.appendChild(status);
    container.appendChild(player);
  } catch (_e) {
    // Fail-soft: never break the question UI over read-aloud.
  }
}

/**
 * Attach a separate speaker beside one MC answer. It never submits the answer.
 * @param {HTMLElement} container
 * @param {string} text
 * @param {{subject?:string, question?:string, options?:string[]}} [context]
 */
export function attachOptionReadAloudControl(container, text, context) {
  try {
    if (!container || typeof text !== "string" || text.trim().length === 0) return;
    const ra = readAloud();
    const optionSegments = segmentsFor("option", text, context);
    if (!ra.canSpeak(text, optionSegments ? { segments: optionSegments } : {})) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "read-aloud-option-btn";
    btn.textContent = "🔊";
    btn.setAttribute("aria-label", "Læs svarmulighed op: " + text);

    let speaking = false;
    let generation = 0;
    function reset() {
      speaking = false;
      btn.textContent = "🔊";
      btn.removeAttribute("aria-pressed");
      btn.classList.remove("is-unavailable");
      btn.removeAttribute("title");
    }

    function showUnavailable() {
      reset();
      btn.classList.add("is-unavailable");
      btn.title = UNAVAILABLE;
    }

    btn.addEventListener("click", async (event) => {
      try {
        if (event && typeof event.stopPropagation === "function") event.stopPropagation();
        if (event && typeof event.preventDefault === "function") event.preventDefault();
        if (speaking) {
          generation += 1;
          ra.stop();
          reset();
          return;
        }
        const run = ++generation;
        const preferences = readPreferences();
        speaking = true;
        btn.textContent = "⏹";
        btn.setAttribute("aria-pressed", "true");
        const segments = segmentsFor("option", text, context);
        const ok = await ra.speak(text, {
          ...(segments ? { segments } : {}),
          rate: preferences.rate,
          onState: (next) => {
            if (run !== generation) return;
            if (next === "ended") reset();
            if (next === "error") showUnavailable();
          },
        });
        if (run === generation && !ok) showUnavailable();
      } catch (_e) {
        reset();
      }
    });

    container.appendChild(btn);
  } catch (_e) {
    // Fail-soft: never break the option UI over read-aloud.
  }
}
