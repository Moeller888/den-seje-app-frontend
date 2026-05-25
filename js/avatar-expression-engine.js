// ── Avatar Expression Engine ──────────────────────────────────────────────────
// Runtime layer for the Avatar Personality System.
// Manages expression state, transitions, priority, hold durations, and fallback.
//
// Design principles:
//   - Ambient, not theatrical. Expressions arrive and depart without fanfare.
//   - Two-layer model: state expressions (quiz flow) + event expressions (rewards).
//   - Event expressions hold for a fixed duration then yield back to state layer.
//   - Critical events (level-up, achievement) cannot be interrupted.
//   - All transitions respect prefers-reduced-motion.
//   - Every path falls back gracefully to neutral on any error.

import { EXPRESSIONS } from './avatar-personality.js';

// ── Priority Levels ────────────────────────────────────────────────────────────
const PRIORITY = {
  STATE:    1,  // normal quiz flow (curious, focused, neutral)
  EVENT:    2,  // answer feedback (proud brief, determined brief)
  CRITICAL: 3,  // level-up, achievement — not interruptible during hold
};

// ── Expression Timing & Priority Config ───────────────────────────────────────
// fade_ms: total cross-fade duration (fade-out + fade-in)
// hold_ms: how long event/critical expressions hold before yielding back
const CONFIGS = {
  neutral:    { priority: PRIORITY.STATE,    hold_ms: null,  fade_ms: 240 },
  curious:    { priority: PRIORITY.STATE,    hold_ms: null,  fade_ms: 200 },
  focused:    { priority: PRIORITY.STATE,    hold_ms: null,  fade_ms: 180 },
  determined: { priority: PRIORITY.EVENT,    hold_ms: 1400,  fade_ms: 220 },
  proud:      { priority: PRIORITY.EVENT,    hold_ms: 2200,  fade_ms: 260 },
};

// ── Critical Event Overrides ───────────────────────────────────────────────────
const CRITICAL_EVENTS = {
  LEVEL_UP:           { expr: "proud", hold_ms: 3000, fade_ms: 280 },
  ACHIEVEMENT_UNLOCK: { expr: "proud", hold_ms: 3200, fade_ms: 280 },
};

// ── UI State → Expression Mapping ─────────────────────────────────────────────
export const STATE_EXPR_MAP = {
  IDLE:             "neutral",
  LOADING_QUESTION: "curious",
  AWAITING_ANSWER:  "focused",
  SUBMITTING_ANSWER:"focused",
  TRANSITIONING:    "neutral",
};

// ── ExpressionEngine ───────────────────────────────────────────────────────────

export class ExpressionEngine {
  constructor(container) {
    this._container   = container;
    this._stateExpr   = "neutral";   // expression driven by current UI state
    this._eventExpr   = null;        // event-driven override (proud/determined) or null
    this._eventPriority = PRIORITY.STATE;
    this._eventTimer  = null;        // hold timer for event expression
    this._fadeTimer   = null;        // ongoing fade-out/in timer
    this._displayed   = "neutral";   // what is actually shown right now
    this._overlay     = null;        // the single expression img element
    this._prefersRM   = this._detectReducedMotion();

    this._initOverlay();
    this._preloadAll();
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  // Called by setUIState() whenever the quiz state machine transitions
  onStateChange(uiStateName) {
    const expr = STATE_EXPR_MAP[uiStateName] ?? "neutral";
    this._stateExpr = expr;
    // Only update display if no event expression is holding
    if (!this._eventExpr) {
      this._display(expr, CONFIGS[expr]?.fade_ms ?? 200, false);
    }
  }

  // Called for game events: "CORRECT" | "INCORRECT" | "LEVEL_UP" | "ACHIEVEMENT_UNLOCK"
  onGameEvent(eventName) {
    if (CRITICAL_EVENTS[eventName]) {
      this._triggerCritical(eventName);
      return;
    }
    if (eventName === "CORRECT") {
      this._triggerEvent("proud", CONFIGS["proud"].hold_ms, PRIORITY.EVENT);
      return;
    }
    if (eventName === "INCORRECT") {
      this._triggerEvent("determined", CONFIGS["determined"].hold_ms, PRIORITY.EVENT);
      return;
    }
  }

  // Graceful teardown
  destroy() {
    this._clearEventTimer();
    this._clearFadeTimer();
    if (this._overlay && this._overlay.parentNode) {
      this._overlay.parentNode.removeChild(this._overlay);
    }
    this._overlay = null;
    this._container = null;
  }

  // ── Internal ─────────────────────────────────────────────────────────────────

  _triggerEvent(exprName, holdMs, priority) {
    // Don't restart the same event expression (avoids restart-on-rapid-correct)
    if (this._eventExpr === exprName && this._eventTimer) return;
    // Lower-priority events cannot interrupt critical holds
    if (this._eventExpr && this._eventPriority >= PRIORITY.CRITICAL && priority < PRIORITY.CRITICAL) return;

    this._clearEventTimer();
    this._eventExpr = exprName;
    this._eventPriority = priority;
    this._display(exprName, CONFIGS[exprName]?.fade_ms ?? 220, false);

    this._eventTimer = setTimeout(() => {
      this._clearEventTimer();
      this._eventExpr = null;
      this._eventPriority = PRIORITY.STATE;
      // Return to whatever state expression is current
      this._display(this._stateExpr, CONFIGS[this._stateExpr]?.fade_ms ?? 200, false);
    }, holdMs);
  }

  _triggerCritical(eventName) {
    const cfg = CRITICAL_EVENTS[eventName];
    if (!cfg) return;

    this._clearEventTimer();
    this._eventExpr = cfg.expr;
    this._eventPriority = PRIORITY.CRITICAL;
    this._display(cfg.expr, cfg.fade_ms, true);

    this._eventTimer = setTimeout(() => {
      this._clearEventTimer();
      this._eventExpr = null;
      this._eventPriority = PRIORITY.STATE;
      this._display(this._stateExpr, CONFIGS[this._stateExpr]?.fade_ms ?? 200, false);
    }, cfg.hold_ms);
  }

  // Core display change: cross-fades to the target expression
  _display(exprName, fadeDuration, isCritical) {
    // Sanitise
    if (!EXPRESSIONS[exprName]) exprName = "neutral";
    // Skip if already showing this expression
    if (this._displayed === exprName) return;

    this._displayed = exprName;
    const src = EXPRESSIONS[exprName];

    if (!this._overlay) return;

    // Instant swap for reduced-motion or zero duration
    const duration = (this._prefersRM || fadeDuration <= 0) ? 0 : fadeDuration;

    if (duration === 0) {
      this._clearFadeTimer();
      this._overlay.style.transition = "none";
      this._overlay.src = src;
      this._overlay.style.opacity = "1";
      return;
    }

    // Cross-fade: asymmetric fade — old emotion releases quickly, new emotion settles slowly.
    // 35% of total duration for fade-out (emotional inertia releases fast),
    // 65% for fade-in (new state arrives gently and settles into place).
    this._clearFadeTimer();
    const fadeOut = Math.max(60,  Math.round(duration * 0.35));
    const fadeIn  = Math.max(110, Math.round(duration * 0.65));

    this._overlay.style.transition = `opacity ${fadeOut}ms ease-in`;
    this._overlay.style.opacity = "0";

    this._fadeTimer = setTimeout(() => {
      this._fadeTimer = null;
      if (!this._overlay) return;
      this._overlay.src = src;
      this._overlay.style.transition = `opacity ${fadeIn}ms cubic-bezier(0.1, 0, 0.4, 1)`;
      this._overlay.style.opacity = "1";
      // Fallback: if src fails to load, degrade gracefully to neutral
      this._overlay.onerror = () => {
        if (!this._overlay) return;
        this._overlay.src = EXPRESSIONS["neutral"] ?? "";
      };
    }, fadeOut + 8);
  }

  // ── Init & Utilities ──────────────────────────────────────────────────────────

  _initOverlay() {
    try {
      if (!this._container) return;

      this._overlay = document.createElement("img");
      this._overlay.className = "quiz-avatar-layer avatar-expr-overlay";
      this._overlay.style.zIndex = "0";
      this._overlay.style.opacity = "1";
      this._overlay.style.pointerEvents = "none";
      this._overlay.alt = "";
      this._overlay.src = EXPRESSIONS["neutral"] ?? "";

      // Insert immediately after the base body layer (first .quiz-avatar-layer)
      // so cosmetic layers at z=1+ remain above us in CSS stacking.
      const bodyLayer = this._container.querySelector(".quiz-avatar-layer");
      if (bodyLayer && bodyLayer.nextSibling) {
        this._container.insertBefore(this._overlay, bodyLayer.nextSibling);
      } else {
        this._container.appendChild(this._overlay);
      }
    } catch (err) {
      console.warn("[ExprEngine] overlay init failed:", err);
      this._overlay = null;
    }
  }

  _preloadAll() {
    // Pre-cache all expression SVGs so first-use transitions have no network delay
    Object.values(EXPRESSIONS).forEach(src => {
      if (src === EXPRESSIONS["neutral"]) return; // already loaded as overlay src
      const img = new Image();
      img.src = src;
    });
  }

  _clearEventTimer() {
    if (this._eventTimer) {
      clearTimeout(this._eventTimer);
      this._eventTimer = null;
    }
  }

  _clearFadeTimer() {
    if (this._fadeTimer) {
      clearTimeout(this._fadeTimer);
      this._fadeTimer = null;
    }
  }

  _detectReducedMotion() {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return false;
    }
  }
}
