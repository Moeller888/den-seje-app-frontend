// ── Avatar Character Cohesion Contract ────────────────────────────────────────
// Unifies all avatar subsystems into a single coherent character rhythm.
//
// PHILOSOPHY: The user should not perceive separate effects.
// They should feel one character with internal continuity.
// Coherence emerges from timing, restraint, and shared rhythm —
// not from more effects or more complexity.
//
// This is the "character bible" — the authoritative reference for all
// timing, emotional state, visual balance, and reward decisions.

// ── Master Rhythm ─────────────────────────────────────────────────────────────
// Breathing is the foundational nervous-system rhythm.
// All other timing is harmonically related to it.
//
// Master reference: FOCUSED breathing cycle = 2900ms.
// This is the state during active quiz engagement — the primary use case.
// All durations below are expressed as multiples of this reference where noted.

export const MASTER_RHYTHM_MS = 2900;

// ── Unified Timing Reference ──────────────────────────────────────────────────
// Single source of truth for all avatar timing values.
// Organized by system. Cross-system values are deliberately synchronized.

export const TIMING = {
  // ── Breathing (PresenceEngine) ────────────────────────────────────────
  breathing: {
    neutral:    3500,  // 1.21× master — calm baseline
    curious:    3200,  // 1.10× master — alert but settled
    focused:    2900,  // 1.00× master — reference rhythm
    proud:      4000,  // 1.38× master — expanded, full breath
    determined: 2600,  // 0.90× master — compressed, resolve tension
  },
  breathing_amplitude_px: {
    neutral:    1.0,
    curious:    1.0,
    focused:    0.7,   // concentration reduces idle body movement
    proud:      1.4,   // earned satisfaction: body relaxed, expanded
    determined: 0.5,   // resolve = minimum excess motion
  },

  // ── Expression Transitions (ExpressionEngine) ─────────────────────────
  // Cross-fade durations: "fade out half + fade in half" model
  expression_fade_ms: {
    neutral:    240,   // medium — calm arrival
    curious:    200,   // quick — alert transitions fast
    focused:    180,   // fastest — concentration snaps in
    determined: 220,   // deliberate — weight arrives purposefully
    proud:      260,   // fullest — satisfaction opens slowly
  },
  // Hold durations after game events (expression stays before returning to state-layer)
  expression_hold_ms: {
    determined_event:  1400,  // 0.48× master
    proud_event:       2200,  // 0.76× master
    proud_level_up:    3000,  // 1.03× master — critical hold
    proud_achievement: 3200,  // 1.10× master — critical hold
  },

  // ── Breathing Inertia (PresenceEngine) ───────────────────────────────
  // Deliberately synchronized to expression_hold_ms.
  // Body catches up to emotion at the same pace expression resolves.
  breathing_inertia_ms: {
    determined: 1400,  // == expression_hold_ms.determined_event
    proud:      2200,  // == expression_hold_ms.proud_event
    level_up:   3000,  // == expression_hold_ms.proud_level_up
    achievement:3200,  // == expression_hold_ms.proud_achievement
  },

  // ── Reward & UI Events (app.js) ───────────────────────────────────────
  reward: {
    coin_popup_duration_ms: 800,   // one slow "blink" — warm, unhurried
    level_up_overlay_hold:  2250,  // overlay visible: 0.78× master
    level_up_overlay_fade:  250,   // fade-out — matches overlay transition CSS
    correct_next_delay:     600,   // 0.21× master — quick reinforcement
    incorrect_next_delay:   2000,  // 0.69× master — time to absorb, then move forward
    pending_next_delay:     1000,  // 0.34× master — neutral wait
  },

  // ── Idle & Presence ───────────────────────────────────────────────────
  presence: {
    idle_settle_ms: 30000,   // 10.3× master — long idle → breathing returns to neutral
  },

  // ── UI Transitions ────────────────────────────────────────────────────
  ui: {
    xp_bar_ms:          350,   // XP bar fill on answer
    level_up_fade_ms:   250,   // overlay in/out
  },

  // ── Easing Reference ─────────────────────────────────────────────────
  easing: {
    expression_out: 'ease-in',    // leaving expressions exit purposefully
    expression_in:  'ease-out',   // arriving expressions land gently
    breathing:      'ease-in-out', // continuous, organic
    overlay:        'linear',     // level-up overlay opacity
    xp_bar:         'ease',       // XP bar fill
  },
};

// ── Emotional State Matrix ────────────────────────────────────────────────────
// Maps each emotional state to all system behaviors simultaneously.
// Use this when verifying that a new event "fits" the character.
//
// One state. One rhythm. Four systems. Zero conflicts.

export const EMOTIONAL_MATRIX = {
  neutral: {
    expression:           'neutral',
    breathing_ms:         TIMING.breathing.neutral,
    breathing_amp_px:     TIMING.breathing_amplitude_px.neutral,
    aura_energy:          'settled — ambient field at baseline opacity',
    reward_character:     'ready baseline — no reinforcement signal',
    posture_note:         'weight evenly distributed, centered',
    educational_tone:     'calm, approachable, waiting',
  },
  focused: {
    expression:           'focused',
    breathing_ms:         TIMING.breathing.focused,
    breathing_amp_px:     TIMING.breathing_amplitude_px.focused,
    aura_energy:          'stable — pulse rate aligns with breathing',
    reward_character:     'alert readiness',
    posture_note:         'slight forward lean, grounded',
    educational_tone:     'engaged, attentive, thinking',
  },
  proud: {
    expression:           'proud',
    breathing_ms:         TIMING.breathing.proud,
    breathing_amp_px:     TIMING.breathing_amplitude_px.proud,
    aura_energy:          'warm — slightly richer opacity, color unchanged',
    reward_character:     'ceremonial warmth — composed, not triumphant',
    posture_note:         'upright, relaxed shoulders, open chest',
    educational_tone:     'warmly affirming, calm satisfaction',
  },
  curious: {
    expression:           'curious',
    breathing_ms:         TIMING.breathing.curious,
    breathing_amp_px:     TIMING.breathing_amplitude_px.curious,
    aura_energy:          'attentive — stable, color unchanged',
    reward_character:     'open engagement',
    posture_note:         'slight head tilt, alert posture',
    educational_tone:     'genuinely interested, honest engagement',
  },
  determined: {
    expression:           'determined',
    breathing_ms:         TIMING.breathing.determined,
    breathing_amp_px:     TIMING.breathing_amplitude_px.determined,
    aura_energy:          'constrained — slightly tighter field, not darker',
    reward_character:     'recovery — resolve forward, not defeat backward',
    posture_note:         'squared, steady, chin level',
    educational_tone:     'resilient, focused on next attempt',
  },
};

// ── Center of Gravity Rules ───────────────────────────────────────────────────
// Visual balance principles for all cosmetic loadout combinations.
// The avatar body has a natural visual center at approximately y=85 in SVG space
// (upper torso, below head center at cy=50). Heavy cosmetics above or below
// this anchor must be balanced by opposing visual mass.
//
// SVG viewBox: 160×240. Head: cx=80 cy=50 r=30.

export const CENTER_OF_GRAVITY = {
  natural_center_y:  85,  // SVG y — upper torso, primary visual balance point
  head_center_y:     50,  // SVG y — head sphere center
  torso_center_y:    120, // SVG y — mid-torso

  // Visual weight per slot (1=minimal mass, 5=heavy)
  slot_weight: {
    crown:   4,  // high placement, concentrated mass at top
    mask:    3,  // large face coverage, near viewer focus
    glasses: 1,  // minimal — line elements only
    shirt:   2,  // torso fill, distributed mass
    back:    3,  // wings/cape, extends below and beside
    aura:    2,  // ambient — distributed around full body
  },

  // Loadout harmony verdicts
  combinations: {
    'crown + wings':     { verdict: 'balanced', reason: 'crown at top balanced by wing mass below head' },
    'crown + cape':      { verdict: 'balanced', reason: 'cape grounds the elevated crown naturally' },
    'aura + any':        { verdict: 'always safe', reason: 'aura is ambient, adds no directional weight' },
    'mask + crown':      { verdict: 'heavy-top — caution', reason: 'double face-area mass; avoid adding back items' },
    'full legendary':    { verdict: 'stable', reason: 'all slots fill the silhouette evenly; breathing amplitude must stay ≤1.4px' },
    'back only':         { verdict: 'balanced', reason: 'back items extend silhouette laterally — no vertical shift' },
  },

  // Breathing safety: container transform moves all layers as a unit
  // No cosmetic-relative displacement occurs at any breathing amplitude.
  breathing_safe_for_all_loadouts: true,
};

// ── Aura Cohesion Guidelines ──────────────────────────────────────────────────
// Aura items must feel like part of the character's emotional state —
// not a separate VFX layer that fires independently.
//
// v1: auras are static SVGs. These are design rules for future animated variants.
// All future aura animation must be tied to the character's breathing rhythm.

export const AURA_COHESION = {
  proud: {
    energy:           'slightly warmer opacity — earned warmth, not glow',
    future_pulse_ms:  TIMING.breathing.proud,     // 4000ms — full, slow
    future_amp_delta: 0.04,  // max opacity swing
    avoid:            'brightening, flashing, expanding scale',
  },
  focused: {
    energy:           'stable — pulse rate synchronized with focused breathing',
    future_pulse_ms:  TIMING.breathing.focused,   // 2900ms — reference rhythm
    future_amp_delta: 0.02,
    avoid:            'any visible change — aura should feel locked during focus',
  },
  determined: {
    energy:           'slightly constrained — field tightens inward, not dims',
    future_pulse_ms:  TIMING.breathing.determined, // 2600ms — tense
    future_amp_delta: 0.02,
    avoid:            'darkening, shrinking below silhouette boundary',
  },
  curious: {
    energy:           'unchanged — aura is stable during curiosity',
    future_pulse_ms:  TIMING.breathing.curious,
    future_amp_delta: 0.02,
    avoid:            'any directional movement',
  },
  neutral: {
    energy:           'baseline — full ambient field, natural opacity',
    future_pulse_ms:  TIMING.breathing.neutral,    // 3500ms
    future_amp_delta: 0.03,
    avoid:            'nothing — this is the reference state',
  },

  // Hard limits for any future aura animation implementation
  max_opacity_delta:    0.06,
  max_scale_delta:      0.03,
  animation_must_use_breathing_timing: true,
  must_never: ['flicker', 'flash', 'strobe', 'attract-attention', 'override-expression-timing'],
};

// ── Reward Elegance Rules ─────────────────────────────────────────────────────
// Reward moments are ceremonial, not arcade-like.
// The character affirms progress — it does not perform excitement.

export const REWARD_ELEGANCE = {
  coin_popup: {
    duration_ms:    TIMING.reward.coin_popup_duration_ms,
    style:          'text floats upward and fades — warm, unhurried',
    must_not:       'grow larger than readable, flash, play multiple times',
  },
  correct_answer: {
    next_delay_ms:  TIMING.reward.correct_next_delay,
    style:          'quick positive reinforcement — maintains momentum',
    expression:     'proud (EVENT, 2200ms) — brief composed satisfaction',
    breathing:      'proud profile — fuller for 2200ms then returns',
    must_not:       'over-celebrate, stack multiple effects, delay unnecessarily',
  },
  level_up: {
    overlay_ms:     TIMING.reward.level_up_overlay_hold,
    total_ms:       TIMING.reward.level_up_overlay_hold + TIMING.reward.level_up_overlay_fade,
    expression:     'proud (CRITICAL, 3000ms) — lingers 500ms after overlay fades',
    breathing:      'proud profile (3000ms) — fully inhales the achievement',
    style:          'ceremonial arrival — warmth and identity affirmation over spectacle',
    must_not:       'particle explosions, screen shake, sound stacking, multiple overlays',
  },
  incorrect_answer: {
    next_delay_ms:  TIMING.reward.incorrect_next_delay,
    style:          'calm recovery — time to absorb, then forward motion',
    expression:     'determined (EVENT, 1400ms) — resolve, not defeat',
    breathing:      'determined profile — compressed, purposeful',
    must_not:       'shame signals, sad animations, extended failure states, punishment energy',
  },
};

// ── Silhouette Continuity Contract ────────────────────────────────────────────
// All avatar systems must preserve silhouette hierarchy unconditionally.
// No subsystem may cause visual fragmentation.

export const SILHOUETTE_CONTINUITY = {
  breathing: {
    mechanism:         'CSS transform on container — all layers move as unit',
    max_amplitude_px:   1.4,     // below cosmetic-seam threshold at 52px
    relative_displacement: 0,   // no layer shifts relative to each other
  },
  expression: {
    mechanism:         'SVG overlay within head sphere r=30 — never exceeds boundary',
    z_position:         0,       // DOM-after body.svg — CSS stacking correct
    cosmetics_above:   true,     // all z=1–7 cosmetics render above expression
  },
  aura: {
    z_position:        -2,       // always behind body
    back_items_above:   true,    // back items at z=-1 render in front of aura
  },
  verified: [
    'breathing + wings', 'breathing + cape', 'breathing + crown',
    'aura + expression transitions', 'full legendary loadout',
    'breathing + all slots simultaneously',
  ],
};
