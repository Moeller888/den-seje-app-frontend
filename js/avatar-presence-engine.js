// ── Avatar Presence Engine ─────────────────────────────────────────────────────
// Runtime for Attention & Presence System v1.
// Manages breathing coherence: amplitude and rate vary with emotional state.
//
// Works alongside ExpressionEngine — no dependency between them.
// ExpressionEngine: what expression is shown + cross-fade transitions.
// PresenceEngine:   breathing rhythm (CSS custom properties) + idle awareness.
//
// Design: ambient, not theatrical. The breathing is felt, not watched.
// At 52px display width, a 0.5px amplitude change is essentially invisible
// but contributes to the subconscious sense of presence.

import {
  BREATHING_PROFILES,
  INERTIA_DWELL_MS,
  IDLE_SETTLE_MS,
  RELATIONAL_TIMING,
} from './avatar-presence.js';

// ── UI State → Breathing Profile ──────────────────────────────────────────────
const STATE_BREATHING = {
  IDLE:             'neutral',
  LOADING_QUESTION: 'curious',
  AWAITING_ANSWER:  'focused',
  SUBMITTING_ANSWER:'focused',
  TRANSITIONING:    'neutral',
};

// ── Game Event → Breathing Override ──────────────────────────────────────────
// On game event: breathing shifts to event profile, holds for hold_ms,
// then returns to the current state-layer breathing profile.
// Breathing lags behind expression — body catches up to emotion.
const EVENT_BREATHING = {
  CORRECT:            { profile: 'proud',      hold_ms: INERTIA_DWELL_MS.proud     },
  INCORRECT:          { profile: 'determined', hold_ms: INERTIA_DWELL_MS.determined },
  LEVEL_UP:           { profile: 'proud',      hold_ms: 3000 },
  ACHIEVEMENT_UNLOCK: { profile: 'proud',      hold_ms: 3200 },
  // Section 151A — equip reactions: holds match expression engine equip configs
  EQUIP_COMMON:       { profile: 'proud',      hold_ms: 1200 },
  EQUIP_UNCOMMON:     { profile: 'proud',      hold_ms: 1800 },
  EQUIP_RARE:         { profile: 'proud',      hold_ms: 2400 },
  EQUIP_LEGENDARY:    { profile: 'proud',      hold_ms: 3000 },
  UNEQUIP:            { profile: 'curious',    hold_ms: 1200 },
};

// ── PresenceEngine ────────────────────────────────────────────────────────────

export class PresenceEngine {
  constructor(container) {
    this._container         = container;
    this._stateBreath       = 'neutral';   // state-layer breathing profile
    this._breathTimer       = null;        // hold timer for event breathing override
    this._relationalTimer   = null;        // delay before event breathing arrives
    this._anticipationTimer = null;        // breath-hold during answer submission
    this._idleTimer         = null;        // long-idle settle timer
    this._prefersRM         = this._detectReducedMotion();

    this._applyBreathing('neutral');
    this._resetIdleTimer();
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  // Called by setUIState() whenever the quiz state machine transitions
  onStateChange(uiStateName) {
    const profile = STATE_BREATHING[uiStateName] ?? 'neutral';
    this._stateBreath = profile;

    if (uiStateName === 'SUBMITTING_ANSWER') {
      // Anticipation hold — briefly reduce amplitude while waiting for the result.
      // Creates a "held breath" sensation during answer submission.
      // Released when onGameEvent() fires, or by hold_cap_ms timer.
      // Skipped if an event breathing hold is already active.
      this._clearAnticipationTimer();
      if (!this._breathTimer && !this._prefersRM) {
        this._applyAnticipationBreathing();
        this._anticipationTimer = setTimeout(() => {
          this._anticipationTimer = null;
          if (!this._breathTimer) this._applyBreathing(this._stateBreath);
        }, RELATIONAL_TIMING.anticipation.hold_cap_ms);
      }
    } else {
      this._clearAnticipationTimer();
      if (!this._breathTimer) this._applyBreathing(profile);
    }

    this._resetIdleTimer();
  }

  // Called for game events: "CORRECT" | "INCORRECT" | "LEVEL_UP" | "ACHIEVEMENT_UNLOCK"
  // | "EQUIP_COMMON" | "EQUIP_UNCOMMON" | "EQUIP_RARE" | "EQUIP_LEGENDARY" | "UNEQUIP"
  onGameEvent(eventName) {
    const override = EVENT_BREATHING[eventName];
    if (!override) return;

    // Release anticipation hold — the result has arrived
    this._clearAnticipationTimer();

    // Relational delay — breathing absorbs the moment before responding.
    // Creates a beat of reception between event trigger and emotional arrival.
    const delay = RELATIONAL_TIMING.event_delays_ms[eventName] ?? 0;
    if (delay > 0) {
      this._clearRelationalTimer();
      this._relationalTimer = setTimeout(() => {
        this._relationalTimer = null;
        this._applyEventBreathing(override);
      }, delay);
    } else {
      this._applyEventBreathing(override);
    }
  }

  // Graceful teardown
  destroy() {
    this._clearBreathTimer();
    this._clearRelationalTimer();
    this._clearAnticipationTimer();
    this._clearIdleTimer();
    this._container = null;
  }

  // ── Internal ─────────────────────────────────────────────────────────────────

  _applyEventBreathing(override) {
    this._clearBreathTimer();
    this._applyBreathing(override.profile);

    this._breathTimer = setTimeout(() => {
      this._clearBreathTimer();
      this._applyBreathing(this._stateBreath);
    }, override.hold_ms);
  }

  // Apply a breathing profile to the container via CSS custom properties.
  // --breathe-shift: vertical travel in px (negative = upward)
  // --breathe-scale: peak scale value
  // animationDuration: full cycle length override
  //
  // CSS custom properties update immediately and take effect on the next
  // animation frame — no animation restart, no visual stutter.
  _applyBreathing(profileName) {
    if (!this._container || this._prefersRM) return;

    const p = BREATHING_PROFILES[profileName] ?? BREATHING_PROFILES.neutral;

    this._container.style.setProperty('--breathe-shift', `-${p.amplitude_y}px`);
    this._container.style.setProperty('--breathe-scale', String(1 + p.amplitude_scale));
    // animationDuration inline override: continues from current phase, no restart.
    // At 52px scale with ≤1.4px amplitude, any transition artifact is imperceptible.
    this._container.style.animationDuration = `${p.duration_ms}ms`;
  }

  // Anticipation breathing — reduced amplitude while waiting for answer result.
  // The character holds their breath slightly; cycle duration stays unchanged.
  _applyAnticipationBreathing() {
    if (!this._container) return;
    const a   = RELATIONAL_TIMING.anticipation;
    const cur = BREATHING_PROFILES[this._stateBreath] ?? BREATHING_PROFILES.neutral;
    this._container.style.setProperty('--breathe-shift', `-${a.amplitude_y}px`);
    this._container.style.setProperty('--breathe-scale', String(1 + a.amplitude_scale));
    this._container.style.animationDuration = `${cur.duration_ms}ms`;
  }

  // After IDLE_SETTLE_MS of inactivity, quietly return breathing to neutral.
  // No visible event — internal recentering only.
  _resetIdleTimer() {
    this._clearIdleTimer();
    this._idleTimer = setTimeout(() => {
      if (!this._breathTimer) this._applyBreathing('neutral');
    }, IDLE_SETTLE_MS);
  }

  _clearBreathTimer() {
    if (this._breathTimer) {
      clearTimeout(this._breathTimer);
      this._breathTimer = null;
    }
  }

  _clearRelationalTimer() {
    if (this._relationalTimer) {
      clearTimeout(this._relationalTimer);
      this._relationalTimer = null;
    }
  }

  _clearAnticipationTimer() {
    if (this._anticipationTimer) {
      clearTimeout(this._anticipationTimer);
      this._anticipationTimer = null;
    }
  }

  _clearIdleTimer() {
    if (this._idleTimer) {
      clearTimeout(this._idleTimer);
      this._idleTimer = null;
    }
  }

  _detectReducedMotion() {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  }
}
