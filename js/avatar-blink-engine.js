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

// ── R2 blink profile (PR D) ──────────────────────────────────────────────────
// Option-A countersigned lid geometry for the decomposed neutral raster stack,
// measured against the promoted eye maps in the same 160×240 viewBox: full
// closure covers 10 755 of 10 755 eye pixels (0 uncovered). These numbers are
// bound to the countersigned measurement — do not re-derive or "correct" them.
const R2_EYES = {
  L: { cx: 66.7, cy: 60.3, rx: 8.91, ry: 9.06 },
  R: { cx: 90.6, cy: 60.3, rx: 8.91, ry: 9.06 },
};

// R2 eyelid fill — version-bound raster tone map. Each value is MEASURED on the
// promoted R2 base raster it names (not derived from the C2 SVG gradients, so
// the C2 map above stays untouched). A future dark R2 base adds its own
// measured entry here. No runtime pixel sampling — values are baked constants.
//   medium: measured on base/body-neutral-medium-v2.webp → #FEC183
const R2_EYELID_FILL = { medium: '#FEC183' };

// Geometry/fill profile per render path. The engine stays ONE engine; the mode
// only selects which eye boxes and which tone map the lids use.
//   c2 (default): existing SVG-derived geometry + Section-152E fills — unchanged.
//   r2:           Option-A geometry + raster-measured fills (neutral × medium).
export const BLINK_PROFILES = {
  c2: { eyes: EYES,    fill: EYELID_FILL },
  r2: { eyes: R2_EYES, fill: R2_EYELID_FILL },
};

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
  // options.mode selects the geometry/fill profile ('c2' | 'r2'); omitted or
  // unknown → 'c2', so every pre-PR-D call-site keeps its exact behaviour.
  constructor(container, skinTone, options) {
    const mode      = options && BLINK_PROFILES[options.mode] ? options.mode : 'c2';
    this._container = container;
    this._lidL      = null;
    this._lidR      = null;
    this._timer     = null;
    this._profile   = 'neutral';
    this._mode      = mode;
    this._skinTone  = this._fillMap()[skinTone] ? skinTone : 'medium';
    this._destroyed = false;
    this._prefersRM = this._detectRM();

    if (!this._prefersRM && container) {
      this._buildLayer();
      this._scheduleNext();
    }

    // Deterministic-frame test handle (activation-audit F5 blink-frame goldens).
    // Exposes the live engine so a test can call forceFrame() to freeze a known
    // open/closed lid frame. Inert in production — nothing reads it there, so it
    // is a no-op for users and does not alter auto-blink timing or rendering.
    try { if (typeof window !== 'undefined') window.__avatarBlinkEngine = this; } catch (_e) {}
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
    const fill = this._fillMap();
    const tone = fill[skinTone] ? skinTone : 'medium';
    if (tone === this._skinTone) return;
    this._skinTone = tone;
    if (this._lidL) this._lidL.setAttribute('fill', fill[tone]);
    if (this._lidR) this._lidR.setAttribute('fill', fill[tone]);
  }

  // PR D: re-apply the full geometry/fill profile on a LIVE engine. Needed when
  // the same surface re-renders onto a different path without a reload (e.g. the
  // avatar editor switches an R2-active identity to one that falls back to C2):
  // the lids must never keep R2 geometry over a C2 render, or vice versa.
  // cfg = { mode, skinTone } — the shape blinkConfigFor() (js/avatar-layers.js)
  // returns. Unknown mode → 'c2', unknown tone → 'medium'. Applies
  // unconditionally (same tone name can map to a different fill per mode).
  setProfile(cfg) {
    this._mode = cfg && BLINK_PROFILES[cfg.mode] ? cfg.mode : 'c2';
    const eyes = this._eyes();
    const fill = this._fillMap();
    this._skinTone = cfg && fill[cfg.skinTone] ? cfg.skinTone : 'medium';
    if (this._lidL) {
      this._applyLidGeometry(this._lidL, eyes.L);
      this._lidL.setAttribute('fill', fill[this._skinTone]);
    }
    if (this._lidR) {
      this._applyLidGeometry(this._lidR, eyes.R);
      this._lidR.setAttribute('fill', fill[this._skinTone]);
    }
  }

  destroy() {
    this._destroyed = true;
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    const layer = document.getElementById(LAYER_ID);
    if (layer && layer.parentNode) layer.parentNode.removeChild(layer);
    this._lidL = this._lidR = this._container = null;
  }

  // Deterministic test seam (activation-audit F5): freeze a STATIC blink frame.
  //   forceFrame('closed') — lids fully down (scaleY(1)); forceFrame('open') — lids
  //   fully retracted (scaleY(0), the resting open state).
  // Cancels any pending auto-blink and builds the lid layer if absent (e.g. when
  // prefers-reduced-motion suppressed it at construction), using THIS engine's
  // mode geometry/fill (r2 or c2) — so a golden captures the engine's real lids,
  // not a test replica. No transition → the frame is instant and stable. This is
  // the ONLY caller path that sets a static frame; normal runtime never calls it,
  // so auto-blink scheduling and user-facing behaviour are unchanged.
  forceFrame(state) {
    if (this._destroyed || !this._container) return;
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    if (!this._lidL || !this._lidR) this._buildLayer();
    // Surfaces hide the blink layer under prefers-reduced-motion via a CSS rule
    // (#avatar-blink-layer { display:none }). A forced frame must be visible to be
    // captured, so pin display inline (inline beats the media rule). Test-only:
    // nothing calls forceFrame in production, so reduced-motion users still see
    // no blink layer.
    const layer = document.getElementById(LAYER_ID);
    if (layer) layer.style.display = 'block';
    const scale = state === 'closed' ? 1 : 0;
    for (const lid of [this._lidL, this._lidR]) {
      if (!lid) continue;
      lid.style.transition = 'none';
      lid.style.transform  = `scaleY(${scale})`;
    }
  }

  // ── Internal ─────────────────────────────────────────────────────────────────

  _profileDef() {
    return BLINK_PROFILES[this._mode] || BLINK_PROFILES.c2;
  }

  _eyes() {
    return this._profileDef().eyes;
  }

  _fillMap() {
    return this._profileDef().fill;
  }

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

    const eyes = this._eyes();
    this._lidL = this._makeLid(ns, eyes.L);
    this._lidR = this._makeLid(ns, eyes.R);
    svg.appendChild(this._lidL);
    svg.appendChild(this._lidR);
    this._container.appendChild(svg);
  }

  _makeLid(ns, eye) {
    const fill = this._fillMap();
    const el = document.createElementNS(ns, 'ellipse');
    this._applyLidGeometry(el, eye);
    el.setAttribute('fill', fill[this._skinTone] || fill.medium);
    // transform-box:fill-box → transform-origin relative to element bounding box
    // transform-origin:50% 0% → pivot at top-center of the ellipse
    // scaleY(0) → collapses to a line at the top — eyelid invisible (open state)
    // scaleY(1) → full ellipse covers eye from top to bottom (closed state)
    el.style.cssText =
      'transform-box:fill-box;transform-origin:50% 0%;transform:scaleY(0);';
    return el;
  }

  _applyLidGeometry(lid, eye) {
    lid.setAttribute('cx', eye.cx);
    lid.setAttribute('cy', eye.cy);
    lid.setAttribute('rx', eye.rx);
    lid.setAttribute('ry', eye.ry);
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
