// ── Avatar Personality System v1 ─────────────────────────────────────────────
// Foundation layer: expression language, state→expression mapping,
// 3D rig zones, pose anchors, micro-motion compatibility.
//
// Phase 1 (this file): Design contract — assets + mapping + rig spec.
// Phase 2 (future):    Wire into app.js state machine transitions.
// Phase 3 (future):    CSS opacity cross-fade between expression overlays.
//
// PHILOSOPHY: Restrained humanity. Every change is felt, not performed.
// The anatomy of expression: brow angle, eyelid weight, mouth curvature.
// Never: deformation, scale change, position shift, color burst.

// ── Expression Assets ─────────────────────────────────────────────────────────

export const EXPRESSIONS = {
  neutral:    "/assets/avatar/expressions/expr-neutral.svg",
  focused:    "/assets/avatar/expressions/expr-focused.svg",
  proud:      "/assets/avatar/expressions/expr-proud.svg",
  curious:    "/assets/avatar/expressions/expr-curious.svg",
  determined: "/assets/avatar/expressions/expr-determined.svg",
};

// ── Expression Anatomy ────────────────────────────────────────────────────────
// Documents what anatomical feature changes for each expression.
// Used for design review and future skeletal rig authoring.

export const EXPRESSION_ANATOMY = {
  neutral: {
    brow_peak_y: 36,
    brow_end_y: 38.5,
    eyelid_peak_y: 40.5,
    eyelid_end_y: 43,
    mouth_control_y: 73,
    mouth_width: [70, 90],
    blush_opacity: 0.15,
    notes: "Resting warmth. Default state.",
  },
  focused: {
    brow_peak_y: 38,
    brow_end_y: 39.5,
    eyelid_peak_y: 42,
    eyelid_end_y: 44,
    mouth_control_y: 71.5,
    mouth_width: [71, 89],
    blush_opacity: 0.10,
    notes: "Brows flatter/lower. Heavier eyelid. Firm mouth. Concentration displaces social warmth.",
  },
  proud: {
    brow_peak_y: 35,
    brow_end_y: 38.5,
    eyelid_peak_y: 40.5,
    eyelid_end_y: 43,
    mouth_control_y: 74.5,
    mouth_width: [69, 91],
    blush_opacity: 0.18,
    notes: "Brow peak 1px higher. Wider smile, slightly deeper curve. Earned warmth.",
  },
  curious: {
    brow_peak_y_L: 34,
    brow_peak_y_R: 35.5,
    brow_end_y_L: 37,
    brow_end_y_R: 38,
    eyelid_peak_y_L: 39.5,
    eyelid_peak_y_R: 40.5,
    mouth_control_y: 71,
    mouth_width: [72, 88],
    blush_opacity: 0.15,
    notes: "Left brow raised asymmetrically. Left eye slightly more open. Honest engagement, not performance.",
  },
  determined: {
    brow_inner_y: 40,
    brow_peak_y: 37.5,
    brow_outer_y: [38.5, 40],
    bridge_shadow: true,
    eyelid_peak_y: 41,
    eyelid_end_y: 43.5,
    mouth_control_y: 70.5,
    mouth_width: [71, 89],
    blush_opacity: 0.12,
    notes: "Inner brow corners lower (corrugator signal). Subtle bridge shadow. Heavier eyelid crease. Firm mouth. Resolve, not aggression.",
  },
};

// ── State → Expression Mapping ────────────────────────────────────────────────
// Maps app.js UI_STATES and game events to expressions.
// Transitions feel ambient — not theatrical. Duration budget: 400–800ms.
//
// Rule: only map states where the expression communicates something true
// about the student's likely emotional state. Never map for spectacle.

export const STATE_EXPRESSIONS = {
  // Quiz state machine states
  IDLE:               "neutral",
  LOADING_QUESTION:   "curious",
  AWAITING_ANSWER:    "focused",
  SUBMITTING_ANSWER:  "focused",
  TRANSITIONING:      "neutral",

  // Game events (dispatched alongside state transitions)
  LEVEL_UP:           "proud",
  STREAK_MILESTONE:   "determined",
  ACHIEVEMENT_UNLOCK: "proud",
  CORRECT_ANSWER:     "proud",
  WRONG_ANSWER:       "determined",
  RETURN_WELCOME:     "neutral",
  CHALLENGE_START:    "determined",
};

// ── Transition Durations ──────────────────────────────────────────────────────
// All transitions feel ambient — below theatrical threshold (~350ms).
// Long-duration expressions return to neutral after their hold period.

export const EXPRESSION_TRANSITIONS = {
  to_focused:    { duration_ms: 350, hold_ms: null },
  to_proud:      { duration_ms: 500, hold_ms: 3000, then: "neutral" },
  to_curious:    { duration_ms: 400, hold_ms: null },
  to_determined: { duration_ms: 400, hold_ms: null },
  to_neutral:    { duration_ms: 600, hold_ms: null },
};

// ── Face Rig Zone Definitions ─────────────────────────────────────────────────
// Bone influence zones for future skeletal rigging.
// All coordinates in SVG viewBox space (160×240).
// Head locked: cx=80 cy=50 r=30 — never change this anchor.

export const RIG_ZONES = {
  head_root:   { pivot: { x: 80, y: 50 }, influence_r: 30, bone: "head",   desc: "Head rotation anchor — max ±3° for pose variation" },
  neck_root:   { pivot: { x: 80, y: 85 }, influence_r: 8,  bone: "neck",   desc: "Neck–spine connection — breathing anchor point" },
  brow_L:      { pivot: { x: 68, y: 37 }, influence_r: 10, bone: "brow_L", desc: "Left brow — frontalis/corrugator muscle zone" },
  brow_R:      { pivot: { x: 92, y: 37 }, influence_r: 10, bone: "brow_R", desc: "Right brow — frontalis/corrugator muscle zone" },
  eye_L:       { pivot: { x: 68, y: 47 }, influence_r: 7,  bone: "eye_L",  desc: "Left eye — lid weight, iris direction" },
  eye_R:       { pivot: { x: 92, y: 47 }, influence_r: 7,  bone: "eye_R",  desc: "Right eye — lid weight, iris direction" },
  jaw:         { pivot: { x: 80, y: 68 }, influence_r: 12, bone: "jaw",    desc: "Jaw/mouth — orbicularis oris zone" },
  cheek_L:     { pivot: { x: 61, y: 59 }, influence_r: 9,  bone: "cheek_L",desc: "Left cheek — zygomaticus zone (blush response)" },
  cheek_R:     { pivot: { x: 99, y: 59 }, influence_r: 9,  bone: "cheek_R",desc: "Right cheek — zygomaticus zone (blush response)" },
};

// ── Pose Anchor Points ────────────────────────────────────────────────────────
// Defines safe ranges for subtle pose variation.
// Rule: no pose change may break cosmetic silhouettes or create clipping.
// Phase 3+ only — do not implement until expression system is stable.

export const POSE_ANCHORS = {
  head_tilt:    { center: { x: 80, y: 85 }, max_deg: 2.5, axis: "z", safe_range: "±2.5° — beyond 3° breaks headwear alignment" },
  shoulder_L:   { center: { x: 27, y: 98 }, max_shift: { x: 2, y: 2 }, safe_range: "2px drift — preserves arm–torso seam" },
  shoulder_R:   { center: { x: 133, y: 98 }, max_shift: { x: 2, y: 2 }, safe_range: "2px drift — preserves arm–torso seam" },
  weight_shift: { axis: "hip", max_deg: 1.5, safe_range: "±1.5° — barely perceptible, avoids leg/shoe clipping" },
};

// ── Micro-Motion Compatibility ────────────────────────────────────────────────
// Expression overlays are designed to be micro-motion-safe.
// They repaint only the head region (y=19–80) and contain no torso/arm elements.
// The breathing animation (translateY -2px, scale 1.008) applies to the whole
// avatar canvas — expressions ride the animation correctly because they share
// the same container transform.

export const MICRO_MOTION = {
  breathe: {
    translateY: -2,
    scale: 1.008,
    duration_ms: 3200,
    easing: "ease-in-out",
    conflict: "none — expression overlay is full-canvas SVG, moves with container",
  },
  future_cloth_sway: {
    affects: ["back", "torso"],
    not_affects: ["expression"],
    conflict: "none — expression is head-only, cloth affects z=-1 to z=2",
  },
  future_aura_pulse: {
    affects: ["aura"],
    not_affects: ["expression"],
    conflict: "none — aura at z=-2, expression at z=0",
  },
};

// ── Expression Rendering Contract ────────────────────────────────────────────
// How to apply expressions in the avatar render pipeline.
//
// Step 1: Render base body (BASE_SRC) at z=0 in container.
// Step 2: Insert expression overlay (EXPRESSIONS[state]) at z=0, DOM AFTER base.
//         CSS stacking: equal z-index, later DOM position = rendered on top. ✓
// Step 3: Render cosmetic layers at z=1 through z=7 normally.
//         All cosmetics render above the expression overlay. ✓
// Step 4: On state change, swap the expression img.src.
//         No container rebuild needed.
//
// Expression overlays repaint the full head sphere to "erase" body.svg's
// original face, then repaint hair + face with expression-specific elements.
// The hair cap in each overlay exactly matches body.svg for continuity.

export const EXPRESSION_Z = 0;

// ── Silhouette Preservation Rules ────────────────────────────────────────────
// Expressions operate entirely within the head sphere (cx=80 cy=50 r=30).
// They never extend into: back slot, torso slot, arm bounds.
// Cosmetics at z=4–7 (hair, headwear, face, eyes) always render on top.
// Result: no silhouette change from any cosmetic combination. ✓

export const SILHOUETTE_RULES = {
  head_sphere: "cx=80 cy=50 r=30 — expression contained within this boundary",
  safe_with_wings:    true,
  safe_with_capes:    true,
  safe_with_crowns:   true,
  safe_with_masks:    true,
  safe_with_glasses:  true,
  safe_with_aura:     true,
  note: "Masks (z=6) cover expression face area — correct. Expression is always subordinate to cosmetics.",
};
