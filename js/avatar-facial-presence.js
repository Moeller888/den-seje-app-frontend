// Section 59 — Facial Presence & Micro-Performance
// Design contract: blink intelligence, gaze philosophy, stillness quality,
// mobile readability, and the permanent avatar performance standard.
//
// NOT a runtime file. Import for documentation, auditing, and design review.

// ── Blink Philosophy ─────────────────────────────────────────────────────────

export const BLINK_PHILOSOPHY = {
  primary_humanization_signal:
    'Timing irregularity — not movement complexity.',

  why_poisson:
    'Human blink timing is stochastic. Inter-blink intervals follow an approximately ' +
    'exponential distribution (Poisson process). Replicating this with -mean*ln(random) ' +
    'produces the most neurologically convincing idle behavior. A 4.5s average with ' +
    'exponential variance covers the natural range (2–10s) with correct tail behavior.',

  why_asymmetry:
    'Human eyelids do not close in perfect synchrony. The dominant-eye lid leads; ' +
    'the other follows 15–35ms later. This lag is below conscious detection threshold ' +
    'but above the "feels mechanical" threshold. Perfect synchrony reads as artificial.',

  why_double_blink:
    'Double-blinks occur in ~15–20% of human blinks, triggered by incomplete first ' +
    'closure or neuromuscular retriggering. The second blink is shorter. This behavioral ' +
    'signature adds life without being noticeable.',

  restraint_rule:
    'The blink should be felt as "the character is alive" — not noticed as "the ' +
    'character is blinking." If the student\'s attention is pulled to the blink itself, ' +
    'the rate is too high or the amplitude too large.',
};

// ── Blink Parameters ─────────────────────────────────────────────────────────

export const BLINK_PARAMETERS = {
  close_ms: 88,
  hold_ms: 16,
  open_ms: 132,
  double_gap_ms: 220,
  double_probability: 0.16,
  asymmetry_close_offset_range_ms: [16, 35],
  asymmetry_open_offset_range_ms: [9, 23],
  interval_distribution: 'Exponential (Poisson inter-event times): t = -mean * ln(random)',
  profiles: {
    neutral:    { mean_ms: 4500, min_ms: 2200, max_ms: 8500,  note: 'Resting: ~13 blinks/min' },
    curious:    { mean_ms: 4200, min_ms: 2000, max_ms: 7800,  note: 'Alert: slightly elevated rate' },
    focused:    { mean_ms: 6200, min_ms: 3200, max_ms: 10000, note: 'Concentration suppresses rate: ~10/min' },
    proud:      { mean_ms: 3800, min_ms: 2000, max_ms: 7200,  note: 'Emotional activation: slightly faster' },
    determined: { mean_ms: 5500, min_ms: 2800, max_ms: 9500,  note: 'Resolve: slightly suppressed' },
  },
};

// ── Blink Layer Technical Spec ────────────────────────────────────────────────

export const BLINK_LAYER_SPEC = {
  element: 'inline SVG (#avatar-blink-layer)',
  z_index: 5,
  z_rationale:
    'Above: expression (z=0), body layers (z=1–4). ' +
    'Below: face accessories such as masks (z=6) and glasses (z=7). ' +
    'Correct: blink occurs behind glasses — glasses remain visible over closing eyelid.',
  viewBox: '0 0 160 240',
  eye_geometry: {
    L: { cx: 68, cy: 47, rx: 7.6, ry: 6.6 },
    R: { cx: 92, cy: 47, rx: 7.6, ry: 6.6 },
    note: '0.6px oversize vs sclera (rx=7, ry=6) to ensure full edge coverage.',
  },
  eyelid_fill: '#EDB888',
  eyelid_fill_derivation:
    'Face gradient #F5C49A→#E8A87C over head sphere y=20→80. ' +
    'At y=47: (47-20)/(80-20) = 45% → R≈239 G≈185 B≈140 → #EDB888.',
  transform_model:
    'transform-box:fill-box; transform-origin:50% 0% (top of bounding box). ' +
    'scaleY(0) collapses to invisible line at top of eye. ' +
    'scaleY(1) reveals full skin ellipse covering sclera, iris, and pupil.',
  css_support:
    'transform-box: fill-box supported: Chrome 64+, Firefox 55+, Safari 11.1+.',
};

// ── Gaze System — Phase 3 (Deferred) ─────────────────────────────────────────

export const GAZE_SYSTEM = {
  phase: 'Design contract — Phase 3 (not implemented in Section 59)',
  reason:
    'Correct gaze requires: (a) per-direction SVG variants per expression = 5×3=15+ SVGs, ' +
    'or (b) inline SVG with JS-addressable pupil elements = ExpressionEngine rewrite.',
  what_was_audited: [
    'translateX on the expression img overlay shifts the entire head including hair, ' +
    'causing misalignment with headwear (z=5) and face accessories (z=6)',
    'At 52px display, 2px SVG shift = 0.65px display — enough to read as gaze ' +
    'but also enough to visibly misalign hair under crowns',
    'Micro-drift at sub-perceptual amplitude (<0.5px SVG = <0.16px display) ' +
    'is too small to be perceived as gaze and adds no presence',
    'Conclusion: gaze micro-drift on the expression img is not safe without inline SVG',
  ],
  deferred_to: 'Phase 3 — requires inline SVG expression layer with addressable pupil coordinates',
  gaze_design_contract_reference: './avatar-presence.js ATTENTION_TARGETS and GAZE_MAX_PX',
};

// ── Micro-Settling — Phase 3 (Deferred) ──────────────────────────────────────

export const MICRO_SETTLING = {
  phase: 'Design contract — Phase 3 (not implemented in Section 59)',
  reason:
    'Breathing-linked facial micro-settling requires a requestAnimationFrame loop ' +
    'synchronized to the PresenceEngine breathing phase. At 52px canvas, the perceptible ' +
    'amplitude range is 0.3–0.5px. Achievable but would couple BlinkEngine to PresenceEngine. ' +
    'Deferred to maintain system isolation. ' +
    'NOTE: The container breathing animation (avatarBreathe) already moves the entire ' +
    'avatar — this IS micro-settling at the container level, built in Section 58.',
};

// ── Stillness Quality ─────────────────────────────────────────────────────────

export const STILLNESS_QUALITY = {
  principle:
    'Premium characters hold presence without needing movement. ' +
    'The blink is the minimum viable life signal. Beyond the blink, stillness IS the quality.',

  education_constraint:
    'In an educational context, movement competes with the question text. ' +
    'The avatar must be alive enough to feel present, and still enough to not steal attention.',

  animation_budget: {
    container_breathing: { duration: '3.5s', amplitude: 'sub-pixel at 52px', role: 'biological presence' },
    cape_drift:          { duration: '5.3s', amplitude: '0.47px max horizontal', role: 'physical mass in cloth' },
    aura_breath:         { duration: '4.7s', amplitude: '0.91px radius change', role: 'supernatural ambient' },
    blink:               { duration: '~4.5s average interval, 236ms total', role: 'primary life signal' },
    total_concurrent:    4,
    note: 'Four independent motion systems. Each below "noticeable" threshold individually. Together: the sensation of presence without any element demanding attention.',
  },

  phase_ratios: {
    breathing:    3500,
    cape:         5300,
    aura:         4700,
    breathing_cape_ratio:  '3.5 / 5.3 = 0.660 (irrational)',
    breathing_aura_ratio:  '3.5 / 4.7 = 0.745 (irrational)',
    cape_aura_ratio:       '5.3 / 4.7 = 1.128 (irrational)',
    note: 'All period ratios irrational — systems never synchronize. Each cycle phase-drifts relative to others, preventing the "machine" read.',
  },
};

// ── Mobile Readability ────────────────────────────────────────────────────────

export const MOBILE_READABILITY = {
  canvas_size_display: '52×78px',
  scale_factor: 0.325,
  eye_dimensions_at_display: {
    width:  '7.6 × 2 × 0.325 = 4.94px',
    height: '6.6 × 2 × 0.325 = 4.29px',
    note: 'Each eye is ~5×4px at display. Small, but the blink closure is fully visible.',
  },
  blink_visibility_at_display:
    'scaleY(0→1) on ry=6.6 = 0→4.3px vertical closure. Clearly readable at 52px canvas.',
  contrast:
    'Eyelid fill #EDB888 (warm skin) over white sclera #FFFFFF — high contrast. ' +
    'The sudden replacement of white with skin tone is a strong life-signal at any scale.',
  expression_readability:
    'The three readable features at 52px are: brow angle, mouth curve, and eyelid weight. ' +
    'The blink directly reinforces the eyelid-weight perception dimension.',
};

// ── Facial Presence Audit Findings ───────────────────────────────────────────

export const AUDIT_FINDINGS = {
  what_was_static:
    'Before Section 59: the avatar never blinked. The eyes were two permanent white ellipses. ' +
    'No amount of breathing, cape drift, or atmospheric depth compensates for permanently open eyes. ' +
    'Open eyes that never blink read as synthetic within ~10 seconds of observation.',

  why_it_mattered_most:
    'The face is the primary read surface. Humans process faces in dedicated neural architecture ' +
    '(FFA — fusiform face area). A face that passes initial beauty checks but fails biological ' +
    'animation checks is flagged as "uncanny" or "artificial" at a subconscious level. ' +
    'The blink is the single most diagnostic biological animation.',

  what_was_not_static:
    'Expression cross-fades were already implemented (Section 21). ' +
    'Asymmetric brow angles were already in SVG geometry (curious expression). ' +
    'Eyelid weight variation between expressions was already present. ' +
    'Section 59 adds the TEMPORAL dimension: the system now changes state without input.',

  deferred_correctly: [
    'Gaze direction: requires inline SVG (documented above)',
    'Micro-settling: requires rAF-linked breathing phase (documented above)',
    'Blink visibility change with headwear: not an issue — blinking behind masks/glasses is correct',
  ],
};

// ── Permanent Performance Standard ───────────────────────────────────────────

export const PERMANENT_PERFORMANCE_STANDARD = {
  name: 'Den Seje App Avatar Facial Performance Standard — established Section 59',
  principles: [
    'Timing irregularity is the primary humanization signal — not movement amplitude',
    'A blink should be felt as life, not noticed as animation',
    'Asymmetry over mechanical perfection — right eye lags left naturally',
    'Behavioral signatures over decorative motion — double-blink is human, sparkles are mascot',
    'Stillness IS presence — the best frames are the ones between movements',
    'Context modifies behavior — concentration suppresses blink rate naturally',
    'Restraint over expressiveness — every motion added competes with educational content',
    'Warmth through subtlety — calm, present, emotionally safe',
    'Scale-calibrated impact — design for the actual 52px canvas, not a preview at 400px',
    'Educational trust is non-negotiable — any animation that creates anxiety fails the standard',
  ],
  quality_test:
    'Watch the avatar for 30 seconds. Do you forget it is animated? Does it feel like someone is there? ' +
    'If yes to both: the standard is met.',
  failure_modes: [
    'Blinks feel mechanical (evenly timed, never varying)',
    'Eyes feel artificial (never blinking)',
    'The animation demands attention away from the question text',
    'The character feels "performed" rather than present',
    'Expressions feel painted on rather than inhabited',
  ],
};
