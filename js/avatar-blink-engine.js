// ── Avatar Blink Engine ───────────────────────────────────────────────────────
// Humanized blink system — psychological presence through temporal irregularity.
//
// Design principles:
//   - Poisson-distributed intervals: mechanically regular blinks destroy the
//     illusion of life. Irregular timing is the primary humanization signal.
//   - Asymmetric closure: right lid lags 16–35ms behind left — below conscious
//     detection threshold but above the "feels mechanical" threshold.
//   - Occasional double-blinks (~16%): a behavioral signature humans recognize
//     subconsciously. Adds life without adding spectacle.
//   - Context-aware rate: focused/determined state suppresses blink rate.
//   - Suppressed under prefers-reduced-motion.
//   - Non-fatal: any initialization failure silently skips the system.
//
// Technical: inline SVG at z=5, above expression (z=0) and below face
// accessories (z=6) and glasses (z=7). Blink occurs behind glasses — correct
// for human anatomy. transform-box:fill-box + transform-origin:50% 0% makes
// scaleY(0→1) sweep the eyelid downward from the top of the eye.

const LAYER_ID = 'avatar-blink-layer';

// UI state → blink profile mapping (mirrors ExpressionEngine and PresenceEngine)
const STATE_PROFILE = {
  IDLE:              'neutral',
  LOADING_QUESTION:  'curious',
  AWAITING_ANSWER:   'focused',
  SUBMITTING_ANSWER: 'focused',
  TRANSITIONING:     'neutral',
  REFLECTING:        'neutral',
};

// Eye geometry in the 160×240 SVG viewBox — derived from expression SVGs.
// Both eyes at cy=47. Eyelid rx/ry is 0.6px oversize vs sclera to ensure
// full edge coverage without gaps at the periphery.
const EYES = {
  L: { cx: 68, cy: 47, rx: 7.6, ry: 6.6 },
  R: { cx: 92, cy: 47, rx: 7.6, ry: 6.6 },
};

// Eyelid skin color at y≈47 in the 160×240 viewBox — skin-tone aware (Section 152E).
// Derived per tone as the 45% mix of that tone's gradient stops over the head
// sphere (y=20→80; at y=47 → (47-20)/(80-20) = 45%):
//   medium: #F5C49A→#E8A87C  → #EDB888 (warm mid-skin tone)
//   dark:   #9C6B43→#6B4423  → #865935 (warm mid-brown tone)
// The eyelid must blend into the underlying body skin so the blink reads as a
// lid, not a coloured shape. Unknown tones fall back to medium.
const EYELID_FILL = { medium: '#EDB888', dark: '#865935' };

// Blink animation timing (ms) — calibrated to natural human blink physiology
const CLOSE_MS   = 88;   // eyelid close: ~80–100ms natural range
const HOLD_MS    = 16;   // closure hold: 0–30ms natural range
const OPEN_MS    = 132;  // eyelid open: ~120–160ms natural (slower than close)
const DOUBLE_GAP = 220;  // gap between first and second blink in double-blink
const DOUBLE_PROB = 0.16; // probability of double-blink after a single blink

// Blink interval parameters by presence profile.
// Poisson process: t = -mean * ln(random), clamped to [min, max].
// Research baseline: resting blink rate ~15–20/min (3–4s avg).
// Focused/task state: 7–10/min (6–8s avg).
const INTERVALS = {
  neutral:    { mean: 4500, min: 2200, max: 8500  },
  curious:    { mean: 4200, min: 2000, max: 7800  },
  focused:    { mean: 6200, min: 3200, max: 10000 },
  proud:      { mean: 3800, min: 2000, max: 7200  },
  determined: { mean: 5500, min: 2800, max: 9500  },
};

export class BlinkEngine {
  constructor(container, skinTone) {
    this._container = container;
    this._lidL      = null;
    this._lidR      = null;
    this._timer     = null;
    this._profile   = 'neutral';
    this._skinTone  = EYELID_FILL[skinTone] ? skinTone : 'medium';
    this._destroyed = false;
    this._prefersRM = this._detectRM();

    if (!this._prefersRM && container) {
      this._buildLayer();
      this._scheduleNext();
    }
  }

  // Called by app.js when quiz state transitions — adjusts interval profile
  onStateChange(uiStateName) {
    const profile = STATE_PROFILE[uiStateName] || 'neutral';
    this._profile = INTERVALS[profile] ? profile : 'neutral';
    // No immediate reschedule — profile takes effect on the next scheduled blink
  }

  // Section 152E: update the eyelid fill when the avatar's skin tone changes.
  // Defensive: unknown tones fall back to medium. Updates live lids in place so
  // an in-flight engine reflects the new tone without a rebuild.
  setSkinTone(skinTone) {
    const tone = EYELID_FILL[skinTone] ? skinTone : 'medium';
    if (tone === this._skinTone) return;
    this._skinTone = tone;
    if (this._lidL) this._lidL.setAttribute('fill', EYELID_FILL[tone]);
    if (this._lidR) this._lidR.setAttribute('fill', EYELID_FILL[tone]);
  }

  destroy() {
    this._destroyed = true;
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    const layer = document.getElementById(LAYER_ID);
    if (layer && layer.parentNode) layer.parentNode.removeChild(layer);
    this._lidL = this._lidR = this._container = null;
  }

  // ── Internal ─────────────────────────────────────────────────────────────────

  _buildLayer() {
    const existing = document.getElementById(LAYER_ID);
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    const ns  = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.id = LAYER_ID;
    svg.setAttribute('viewBox', '0 0 160 240');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText =
      'position:absolute;top:0;left:0;width:100%;height:100%;' +
      'z-index:5;pointer-events:none;overflow:visible;';

    this._lidL = this._makeLid(ns, EYES.L);
    this._lidR = this._makeLid(ns, EYES.R);
    svg.appendChild(this._lidL);
    svg.appendChild(this._lidR);
    this._container.appendChild(svg);
  }

  _makeLid(ns, eye) {
    const el = document.createElementNS(ns, 'ellipse');
    el.setAttribute('cx',   eye.cx);
    el.setAttribute('cy',   eye.cy);
    el.setAttribute('rx',   eye.rx);
    el.setAttribute('ry',   eye.ry);
    el.setAttribute('fill', EYELID_FILL[this._skinTone] || EYELID_FILL.medium);
    // transform-box:fill-box → transform-origin relative to element bounding box
    // transform-origin:50% 0% → pivot at top-center of the ellipse
    // scaleY(0) → collapses to a line at the top — eyelid invisible (open state)
    // scaleY(1) → full ellipse covers eye from top to bottom (closed state)
    el.style.cssText =
      'transform-box:fill-box;transform-origin:50% 0%;transform:scaleY(0);';
    return el;
  }

  _scheduleNext() {
    if (this._destroyed) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      this._doBlink().then(() => {
        if (this._destroyed) return;
        if (Math.random() < DOUBLE_PROB) {
          this._timer = setTimeout(() => {
            this._timer = null;
            this._doBlink().then(() => this._scheduleNext());
          }, DOUBLE_GAP);
        } else {
          this._scheduleNext();
        }
      });
    }, this._nextInterval());
  }

  _nextInterval() {
    const cfg = INTERVALS[this._profile] || INTERVALS.neutral;
    const t   = -cfg.mean * Math.log(Math.random() + 1e-9);
    return Math.max(cfg.min, Math.min(cfg.max, t));
  }

  // One blink: close both lids (right asymmetrically delayed), hold briefly, open
  async _doBlink() {
    if (!this._lidL || !this._lidR || this._destroyed) return;

    // Asymmetric timing: right eye lags behind left (natural human physiology)
    const asyncClose = 16 + Math.floor(Math.random() * 20); // 16–35ms
    const asyncOpen  =  9 + Math.floor(Math.random() * 15); //  9–23ms

    // Close both lids
    await Promise.all([
      this._moveLid(this._lidL, 1, CLOSE_MS, 'cubic-bezier(0.25,0,0.4,1)'),
      this._moveLid(this._lidR, 1, CLOSE_MS, 'cubic-bezier(0.25,0,0.4,1)', asyncClose),
    ]);

    await this._sleep(HOLD_MS);

    // Open both lids
    await Promise.all([
      this._moveLid(this._lidL, 0, OPEN_MS, 'cubic-bezier(0.1,0,0.3,1)'),
      this._moveLid(this._lidR, 0, OPEN_MS, 'cubic-bezier(0.1,0,0.3,1)', asyncOpen),
    ]);
  }

  // Animate one lid to targetScale over durationMs, after optional delayMs
  _moveLid(lid, targetScale, durationMs, easing, delayMs = 0) {
    return this._sleep(delayMs).then(() =>
      new Promise(resolve => {
        if (!lid || this._destroyed) { resolve(); return; }
        lid.style.transition = `transform ${durationMs}ms ${easing}`;
        lid.style.transform  = `scaleY(${targetScale})`;
        setTimeout(resolve, durationMs + 10);
      })
    );
  }

  _sleep(ms) {
    return new Promise(r => setTimeout(r, ms || 0));
  }

  _detectRM() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch { return false; }
  }
}
