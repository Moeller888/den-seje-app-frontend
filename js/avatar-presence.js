// ── Avatar Presence System v1 — Design Contract ───────────────────────────────
// Defines the Attention & Presence System:
// breathing coherence, gaze philosophy, emotional inertia, attention hierarchy.
//
// PHILOSOPHY: Presence through restraint. The avatar should feel alive, not acted.
// The user should not think "the avatar is animated." They should feel "it exists."
// Every value here is deliberately small. The character breathes. That is enough.

// ── Breathing Profiles ────────────────────────────────────────────────────────
// Production-ready. Applied as CSS custom properties on the avatar container.
//
// amplitude_y:     vertical travel in CSS px (--breathe-shift: -Xpx)
// amplitude_scale: peak scale delta  (--breathe-scale: 1 + X)
// duration_ms:     full cycle length — slower = calmer, faster = tensed
//
// Design rule: all values within ±50% of neutral baseline.
// Neutral is the reference. Every expression is a calibrated deviation from it.
// Changes are "felt more than seen" at 52px display scale.

export const BREATHING_PROFILES = {
  neutral:    { duration_ms: 3500, amplitude_y: 1.0, amplitude_scale: 0.006 },
  focused:    { duration_ms: 2900, amplitude_y: 0.7, amplitude_scale: 0.004 },
  proud:      { duration_ms: 4000, amplitude_y: 1.4, amplitude_scale: 0.009 },
  curious:    { duration_ms: 3200, amplitude_y: 1.0, amplitude_scale: 0.006 },
  determined: { duration_ms: 2600, amplitude_y: 0.5, amplitude_scale: 0.003 },
};
// focused:    shorter cycle, shallower amplitude — concentration reduces idle movement
// proud:      slower, fuller — earned satisfaction, body relaxed and expanded
// determined: fastest, most constrained — resolve = minimum excess motion
// curious:    near-neutral, slightly tighter — alert but not tense

// ── Emotional Inertia — Breathing Dwell Durations ────────────────────────────
// Breathing lags slightly behind expression — body catches up to emotion.
// After a game event, breathing holds the event profile for this duration,
// then returns to the current state-layer breathing profile.
//
// Values match expression engine hold durations to create perceptual coherence.

export const INERTIA_DWELL_MS = {
  neutral:    0,     // neutral arrives immediately — reset state, no dwell
  focused:    0,     // default working state — no event override needed
  proud:      2200,  // matches expression engine EVENT hold for CORRECT
  curious:    0,
  determined: 1400,  // matches expression engine EVENT hold for INCORRECT
};

// ── Gaze System — Design Contract (v1) ───────────────────────────────────────
// v1: breathing coherence is the production layer.
// Gaze direction is a design contract — requires SVG gaze variants or inline SVG
// to implement safely without silhouette distortion at 52px display width.
//
// At 52px container width, a translateX on the full overlay (160×240px SVG
// displayed as object-fit:contain) would shift the entire face, not just eyes.
// Correct implementation requires per-gaze-direction SVG variants or inline SVG
// with pupil coordinates addressable by JS.
//
// This contract defines the intent. Implementation is Phase 2.

export const ATTENTION_TARGETS = {
  IDLE:         { priority: 0,  gaze_x:  0, gaze_y:  0, hold_ms: null  },
  QUESTION:     { priority: 3,  gaze_x:  0, gaze_y: -1, hold_ms: null  },
  REWARD_POPUP: { priority: 7,  gaze_x:  0, gaze_y: -1, hold_ms: 2200  },
  LEVEL_UP:     { priority: 10, gaze_x:  0, gaze_y:  0, hold_ms: 3000  },
  ACHIEVEMENT:  { priority: 9,  gaze_x:  0, gaze_y: -1, hold_ms: 3200  },
};

// Maximum gaze displacement in CSS px at full render scale.
// At 52px container, 1.5px = 2.9% horizontal shift = readable attention direction.
// Future: maps to eye-bone IK rotation (max ±8° from forward gaze) in 3D rig.
export const GAZE_MAX_PX = 1.5;

// ── Attention Priority System ─────────────────────────────────────────────────
// Hierarchy for competing attention targets.
// Equal priority: existing target holds (prevents flicker between equal claims).
// CRITICAL events (10, 9) always override lower-priority targets.

export const ATTENTION_PRIORITY = {
  LEVEL_UP:     10,
  ACHIEVEMENT:  9,
  REWARD_POPUP: 7,
  INCORRECT:    5,
  QUESTION:     3,
  IDLE:         0,
};

// ── Idle Awareness ────────────────────────────────────────────────────────────
// After IDLE_SETTLE_MS of no state changes, breathing quietly returns to neutral.
// Covers: long quiz pauses, reading time, distraction, leaving the page in focus.
// Effect: no visible motion change — purely an internal breathing profile reset.
// The avatar "settles" without any perceptible event.

export const IDLE_SETTLE_MS = 30000;

// ── Future 3D Rig Architecture ────────────────────────────────────────────────
// Maps current presence system concepts to 3D animation controller equivalents.
// Design guidance for Phase 4+ migration — not implemented.
//
// Current 2D system is isomorphic to a 3D animation controller:
// breathing → spine_01 bone oscillation (idle layer, weight=1 always)
// expression → head + facial blend shapes (state layer)
// breathing profile → AnimatorParameter<float> driving amplitude
// event hold → animation clip Once mode with HOLD_END event
// gaze → eye bone IK constrained to world-space GazeTarget_3D object

export const FUTURE_3D_TARGETS = {
  breathing:        { bone: "spine_01", animation_layer: 0, blend_weight: 1.0, note: "Runs always under all other layers" },
  expression:       { bones: ["head", "brow_L", "brow_R", "eye_L", "eye_R", "jaw"], animation_layer: 1 },
  breathing_profile:{ driver: "AnimatorParameter<float>", names: ["breath_rate_w", "breath_amp_w"] },
  gaze_ik:          { bone_target: "GazeTarget_3D", bones: ["eye_L", "eye_R"], max_angle_deg: 8, constraint: "LookAt IK" },
  event_hold:       { mechanism: "AnimationClip Once + HOLD_END event → StateMachine transition", layer: 2 },
  critical_override:{ mechanism: "Animation layer weight 1.0 = full override of layers 0–1", layer: 3 },
};

// ── Relational Timing ─────────────────────────────────────────────────────────
// Delays between event trigger and emotional state arrival.
// These are "beats of reception" — the breathing body absorbs the moment
// before responding. The effect is felt as presence, not timed as delay.
//
// Values are deliberately minimal. At these durations, the user never
// consciously registers a delay — they register a character.
//
// event_delays_ms: how long before event breathing profile arrives after trigger
// anticipation:    breath-hold during answer submission — waits for result reveal

export const RELATIONAL_TIMING = {
  event_delays_ms: {
    CORRECT:            60,   // breath absorbs the success before pride rises
    INCORRECT:          40,   // shorter — steadying arrives fast, no delay on failure
    LEVEL_UP:           90,   // significant beat — let the moment land
    ACHIEVEMENT_UNLOCK: 90,   // same weight as level-up
    EQUIP_COMMON:       60,   // Section 151A — equip shares the CORRECT beat
    EQUIP_UNCOMMON:     60,
    EQUIP_RARE:         60,
    EQUIP_LEGENDARY:    90,   // legendary gets the level-up beat
    UNEQUIP:            40,   // quick curious turn
    REWARD_CLAIMED:     60,   // Section 151B — reward moments share the CORRECT beat
    WELCOME_BACK:       40,   // quick curious turn on return
  },
  anticipation: {
    amplitude_y:     0.35,  // near-still — held breath (vs focused 0.7px)
    amplitude_scale: 0.002, // minimal movement
    hold_cap_ms:     300,   // max hold before releasing if event never arrives
  },
};

// ── Silhouette Safety Contract ────────────────────────────────────────────────
// All presence effects must be transparent to cosmetic layers.
//
// Breathing: applied to container transform — all layers ride together. Safe.
// Gaze (future): applied to expression overlay img only, not the container.
//   At ≤1.5px displacement, no visible edge artifact at 52px.
// Amplitude limits: max 1.4px vertical, max 1.5px horizontal — below 3px threshold
//   where cosmetic seams would become visible at any supported resolution.

export const SILHOUETTE_SAFETY = {
  breathing_on_container:          true,
  gaze_on_overlay_only:            true,
  max_vertical_displacement_px:    1.4,
  max_horizontal_displacement_px:  1.5,
  safe_with_wings:    true,
  safe_with_capes:    true,
  safe_with_crowns:   true,
  safe_with_masks:    true,
  safe_with_aura:     true,
  note: "Container breathing moves all layers as a unit. No relative displacement between body, cosmetics, or expression. Silhouette hierarchy preserved unconditionally.",
};
