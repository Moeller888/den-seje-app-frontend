// ── Avatar 3D Migration Architecture v1 ──────────────────────────────────────
// First serious design document for migrating the avatar system to 3D.
//
// Current system: 2D SVG layers with CSS animation + JS engines (ExpressionEngine + PresenceEngine).
// Target system:  3D character with skeletal animation, physically-based materials,
//                 gaze IK, and a unified animation state machine.
//
// IMPORTANT: This is a DESIGN DOCUMENT, not implementation.
// Do NOT implement 3D ahead of the defined migration phases.
//
// CRITICAL PROPERTY: The current 2D system was deliberately designed to be isomorphic
// with a 3D animation controller. Every 2D concept maps cleanly to a 3D equivalent.
// No architectural rethink is needed for migration — only a render-layer swap.
// The character logic (timing, priority, hold, inertia, state-matrix) carries forward unchanged.

// ── Migration Philosophy ──────────────────────────────────────────────────────
export const MIGRATION_PHILOSOPHY = Object.freeze({
  core_principle:   '2D-to-3D is a render-layer swap, not an architectural rewrite',
  api_stability:    'ExpressionEngine and PresenceEngine public APIs do not change during migration',
  logic_continuity: 'All timing values, EMOTIONAL_MATRIX, TIMING, and CHARACTER_CONTRACT survive unchanged',
  phased_approach:  'Migrate one render layer at a time — body first, expressions second, cosmetics third',
  fallback_policy:  '2D SVG remains available as fallback for low-end devices and prefers-reduced-motion',
  quality_bar:      'The 3D character must feel MORE alive than the 2D character, not just different',
  note:             'The 2D system is the specification document for the 3D system. Every 2D behavior has a 3D counterpart defined below.',
});

// ── 2D → 3D Concept Mapping ───────────────────────────────────────────────────
// Maps current 2D implementation concepts to their 3D equivalents.
// This mapping is the migration guide — one row per concept.
export const CONCEPT_MAPPING = Object.freeze([
  {
    concept:       'Body SVG container',
    current_2d:    'HTML <div> with CSS animation (avatarBreathe keyframes)',
    target_3d:     '3D mesh with skeletal rig, rendered via WebGL or Three.js scene',
    migration_risk: 'Low',
  },
  {
    concept:       'Breathing animation',
    current_2d:    'CSS animationDuration + --breathe-shift + --breathe-scale custom properties on container',
    target_3d:     'Spine01 bone oscillation — always-running idle clip at weight=1, amplitude driven by AnimatorParameter<float>',
    migration_risk: 'Low — same inputs, different output mechanism',
  },
  {
    concept:       'Expression states',
    current_2d:    'ExpressionEngine: SVG overlay img src swap with CSS opacity cross-fade',
    target_3d:     'Blend shape (morph target) weights per expression: proud_w, determined_w, focused_w, curious_w',
    migration_risk: 'Low — ExpressionEngine fires same events; 3D renderer listens to same interface',
  },
  {
    concept:       'Expression cross-fade',
    current_2d:    'Two-phase opacity fade (outgoing 0→0.5→0, incoming 0→0.5→1) via CSS transitions',
    target_3d:     'Blend shape weight lerp: outgoing weight 1→0, incoming weight 0→1, same duration values',
    migration_risk: 'Low — duration values are identical',
  },
  {
    concept:       'Breathing profile (rate + amplitude)',
    current_2d:    'PresenceEngine: _applyBreathing() sets animationDuration + CSS custom properties',
    target_3d:     'AnimatorParameters: breath_rate_w and breath_amp_w drive Spine01 oscillation clip',
    migration_risk: 'Low — same parameter names and value ranges',
  },
  {
    concept:       'Event hold timer (CORRECT, INCORRECT)',
    current_2d:    'ExpressionEngine: setTimeout with hold_ms, clearTimeout on override',
    target_3d:     'AnimationClip Once mode + HOLD_END event → StateMachine transition to idle',
    migration_risk: 'Low — same timing, different trigger mechanism',
  },
  {
    concept:       'Critical override (LEVEL_UP, ACHIEVEMENT)',
    current_2d:    'PRIORITY.CRITICAL check + expression held despite state transitions',
    target_3d:     'Animation layer 3 at weight=1.0 masks all lower layers; returns to 0 after hold',
    migration_risk: 'Low — same priority logic, cleaner mechanism',
  },
  {
    concept:       'Aura cosmetic',
    current_2d:    'Static SVG at z-index=-2, CSS object-fit:contain',
    target_3d:     'Particle system anchored to Root bone; emission rate/opacity driven by emotional state',
    migration_risk: 'Medium — requires GPU particle budget validation on low-end mobile before shipping',
  },
  {
    concept:       'Gaze direction',
    current_2d:    'Design contract only — not implemented in v1 (SVG variant constraints)',
    target_3d:     'Eye bone IK constrained to GazeTarget_3D world-space object; max ±8° from forward',
    migration_risk: 'Low — design contract already defines the behavior precisely',
  },
  {
    concept:       'Cosmetic slots',
    current_2d:    'z-indexed .quiz-avatar-layer img elements with SVG src per slot',
    target_3d:     'Cosmetic socket bones per slot; 3D cosmetic meshes attach to socket world-space transform',
    migration_risk: 'Medium — requires all cosmetics to be re-authored as 3D assets',
  },
]);

// ── Skeleton Architecture ─────────────────────────────────────────────────────
export const SKELETON = Object.freeze({
  rig_type:    'Humanoid — standard proportions for a stylized educational character',
  root_bone:   'Root (pelvis) — all bones descend from this; character moved by translating Root',
  bone_count:  '~28 bones — minimal rig sufficient for readable expression and cloth at small display size',
  hierarchy: [
    'Root → Spine01 → Spine02 → Neck → Head',
    'Spine02 → Shoulder_L → UpperArm_L → ForeArm_L → Hand_L',
    'Spine02 → Shoulder_R → UpperArm_R → ForeArm_R → Hand_R',
    'Root → Hip_L → UpperLeg_L → LowerLeg_L → Foot_L',
    'Root → Hip_R → UpperLeg_R → LowerLeg_R → Foot_R',
  ],
  breathing_bone: 'Spine01 — breathing drives oscillation exclusively on this bone',
  facial_bones:   ['Head', 'Eye_L', 'Eye_R'],
  socket_bones:   ['Crown_Socket', 'Mask_Socket', 'Glasses_Socket', 'Back_Socket_L', 'Back_Socket_R'],
  note: 'Breathing in 2D is a container translateY. In 3D it is Spine01 oscillation. Same perceptual effect, correct mechanism.',
});

// ── Cosmetic Socket Definitions ───────────────────────────────────────────────
export const COSMETIC_SOCKETS = Object.freeze({
  Crown_Socket: {
    parent_bone:   'Head',
    local_offset:  { x: 0, y: 0.12, z: 0 },
    inherits:      'Full Head rotation — crown follows head exactly',
    cosmetic_types: ['crowns', 'hats', 'headbands', 'horns', 'antennae'],
  },
  Mask_Socket: {
    parent_bone:   'Head',
    local_offset:  { x: 0, y: 0, z: 0.08 },
    inherits:      'Full Head rotation — mask follows face exactly',
    cosmetic_types: ['masks', 'visors', 'face shields'],
  },
  Glasses_Socket: {
    parent_bone:   'Head',
    local_offset:  { x: 0, y: -0.02, z: 0.09 },
    inherits:      'Full Head rotation',
    cosmetic_types: ['glasses', 'monocle', 'goggles'],
  },
  Shirt_Socket: {
    parent_bone:   'Spine01',
    type:          'Skinned mesh — not a rigid socket',
    bind_bones:    ['Spine01', 'Spine02', 'Shoulder_L', 'Shoulder_R'],
    inherits:      'Deforms with skeleton; breathing drives Spine01 → shirt moves organically',
    cosmetic_types: ['shirts', 'jackets', 'chest armor'],
  },
  Back_Socket_L: {
    parent_bone:   'Spine02',
    local_offset:  { x: -0.18, y: 0, z: -0.12 },
    inherits:      'Partial Spine02 rotation — back items may have secondary motion via cloth/spring bones',
    cosmetic_types: ['wings', 'capes', 'backpacks', 'shoulder plates'],
  },
  Back_Socket_R: {
    parent_bone:   'Spine02',
    local_offset:  { x: 0.18, y: 0, z: -0.12 },
    inherits:      'Symmetric with Back_Socket_L',
    cosmetic_types: ['wings', 'capes', 'backpacks'],
  },
});

// ── Cloth Simulation Zones ────────────────────────────────────────────────────
export const CLOTH_ZONES = Object.freeze({
  cape: {
    bones:       ['Cape_Spine_01', 'Cape_Spine_02', 'Cape_Spine_03'],
    stiffness:   0.88,  // high stiffness — educational calm aesthetic, not dramatic flow
    gravity:     0.35,
    wind:        0.00,  // no wind — static indoor environment
    colliders:   ['Spine02', 'Hip_L', 'Hip_R'],
    breathing_influence: 0.04, // breathing causes ≤4% cape motion — subtle, not theatrical
    note: 'Cape simulation must feel settled, not dramatic. Breathing causes a slight organic sway — nothing more.',
  },
  shirt: {
    type:        'Skinned mesh only — no cloth simulation in v1',
    bind_bones:  ['Spine01', 'Spine02', 'Shoulder_L', 'Shoulder_R'],
    note:        'Shirt deforms organically with skeleton. Breathing drives Spine01 → shirt moves naturally without simulation.',
  },
});

// ── Facial Rig Architecture ───────────────────────────────────────────────────
export const FACIAL_RIG = Object.freeze({
  approach: 'Blend shapes (morph targets) — not joint-based facial rig. Simpler, more readable at small scale.',
  blend_shapes: [
    { name: 'Expr_Neutral',    weight: 1.0, description: 'Rest face — reference shape, always partially active as base' },
    { name: 'Expr_Focused',    weight: 0.0, description: 'Slight brow compression, attentive eyes — concentration without stress' },
    { name: 'Expr_Proud',      weight: 0.0, description: 'Soft smile, relaxed brow, open posture — composed satisfaction' },
    { name: 'Expr_Curious',    weight: 0.0, description: 'Subtle asymmetric brow lift, alert eyes — genuine engagement' },
    { name: 'Expr_Determined', weight: 0.0, description: 'Set jaw, level brow, steady eyes — resolve without aggression' },
  ],
  transition_mechanism: 'Blend shape weight lerp — mirrors expression_fade_ms timing values from TIMING constants',
  gaze: {
    mechanism:  'Eye bone IK constrained to GazeTarget_World (world-space empty object)',
    bones:      ['Eye_L', 'Eye_R'],
    max_angle:  8,  // degrees from forward — perceptual equivalent of 2D GAZE_MAX_PX=1.5
    blend_in:   200,  // ms to blend from idle to active gaze target
    blend_out:  600,  // ms to return to idle gaze on target removal
  },
  note: 'ExpressionEngine.onStateChange() drives blend shape weights in 3D. Same API. Same timing. Different output.',
});

// ── Animation State Machine ───────────────────────────────────────────────────
export const ANIMATION_STATE_MACHINE = Object.freeze({
  layer_0: {
    name:          'Idle Breathing',
    blend_mode:    'Override — always running at weight=1',
    clip_type:     'Looping',
    driver:        'PresenceEngine breathing profile → AnimatorParameter<float> breath_rate_w, breath_amp_w',
    note:          'Always active. Cannot be stopped. Other layers blend on top.',
  },
  layer_1: {
    name:          'Emotional Expression State',
    blend_mode:    'Blend tree — driven by EmotionalState<int> parameter',
    clip_type:     'Blend tree with 5 clips: Neutral, Focused, Proud, Curious, Determined',
    driver:        'ExpressionEngine.onStateChange() → AnimatorParameter<int> EmotionalState',
    transitions:   'expression_fade_ms values define cross-fade durations',
  },
  layer_2: {
    name:          'Game Event Response',
    blend_mode:    'Additive or override — fires once per event',
    clip_type:     'One-shot with HOLD_END event → automatic transition back to layer_1',
    driver:        'ExpressionEngine.onGameEvent() → SetTrigger("GameEvent")',
    clips:         ['Correct_Proud', 'Incorrect_Determined', 'LevelUp_Proud', 'Achievement_Proud'],
    hold_mechanism: 'Clip plays to end, holds on last frame for hold_ms, then transitions out',
  },
  layer_3: {
    name:          'Critical Override',
    blend_mode:    'Full weight override — masks layers 0–2 completely',
    clip_type:     'One-shot — LEVEL_UP and ACHIEVEMENT_UNLOCK only',
    driver:        'ExpressionEngine PRIORITY.CRITICAL → AnimatorLayerWeight(3, 1.0)',
    clips:         ['LevelUp_Ceremony (3000ms)', 'Achievement_Ceremony (3200ms)'],
    return:        'Layer 3 weight returns to 0 after hold completes',
  },
});

// ── Aura VFX Architecture (3D) ────────────────────────────────────────────────
export const AURA_VFX_3D = Object.freeze({
  type:             'Soft-particle system with additive blending',
  anchor:           'Root bone — aura follows character absolutely',
  emission_shape:   'Sphere centered on character torso (y ≈ 0.5 in rig space)',
  particle_count:   { min: 0, max: 80 },  // range across emotional states
  blend_mode:       'Additive (low intensity) — creates ambient glow, not solid coverage',
  opacity_max:      0.35,  // same budget as 2D static SVG
  state_response: {
    neutral:    'Baseline emission, slow drift, natural opacity',
    focused:    'Tighter radius, minimal drift, opacity slightly reduced',
    proud:      'Slightly fuller emission, very slow drift, warmest opacity',
    determined: 'Tightest radius, constrained drift, opacity at minimum',
    curious:    'Near-neutral — aura is stable during curiosity',
  },
  must_not: [
    'Flicker, flash, or strobe at any frequency',
    'Change color based on emotional state (color is thematic, not emotional)',
    'Pulse faster than the current breathing profile duration',
    'Attract the eye away from the character face under any condition',
  ],
  color_source: 'CSS theme variable → shader uniform — aura color is always thematic',
});

// ── Material Philosophy ───────────────────────────────────────────────────────
export const MATERIAL_PHILOSOPHY = Object.freeze({
  style:          'Stylized PBR — physically-based rendering art-directed toward illustrated, educational aesthetic',
  character_skin: {
    type:       'Subsurface scattering (low intensity) for soft, illustrated skin feel',
    roughness:  0.65,
    metallic:   0.00,
    note:       'Matches the soft quality of the current 2D character illustration.',
  },
  cosmetics: {
    type:       'Standard PBR with roughness range [0.3, 0.8] and metallic range [0.0, 0.6]',
    note:       'Material parameters replace SVG gradient painting. Same visual intent, proper 3D pipeline.',
  },
  aura: {
    type:       'Unlit + additive blend — aura does not receive scene lighting',
    emissive:   true,
    note:       'Aura is ambient energy, not a lit surface.',
  },
  theme_integration: {
    mechanism:  'CSS theme variables → shader uniforms at load time',
    note:       'Color themes carry forward without art rework. Theme CSS variable → material color parameter map.',
  },
});

// ── Migration Phases ──────────────────────────────────────────────────────────
export const MIGRATION_PHASES = Object.freeze([
  {
    phase:         1,
    name:          'Character Body + Breathing',
    deliverable:   '3D body mesh with skeletal rig, breathing animation driving Spine01',
    risk:          'Low — breathing is a simple bone oscillation; PresenceEngine API unchanged',
    api_changes:   'None — PresenceEngine continues to fire; 3D renderer listens to same breathing profile',
    fallback_2d:   true,
    prerequisite:  'None',
  },
  {
    phase:         2,
    name:          'Expression Blend Shapes',
    deliverable:   'Blend shape weights driven by ExpressionEngine; same timing, same events',
    risk:          'Low — ExpressionEngine API unchanged; blend shapes replace SVG overlay src swaps',
    api_changes:   'None',
    fallback_2d:   true,
    prerequisite:  'Phase 1 complete',
  },
  {
    phase:         3,
    name:          'Gaze IK',
    deliverable:   'Eye bone IK system driven by ATTENTION_TARGETS hierarchy',
    risk:          'Low — design contract already precisely defines the behavior (GAZE_MAX_PX=1.5 → ±8°)',
    api_changes:   'None — ATTENTION_TARGETS constants carry forward',
    fallback_2d:   false,
    prerequisite:  'Phase 2 complete (requires Head bone from Phase 1)',
  },
  {
    phase:         4,
    name:          'Cosmetic Socket System',
    deliverable:   '3D cosmetics attaching to defined socket bones; all slots migrated',
    risk:          'Medium — all cosmetics must be re-authored as 3D assets; no 2D cosmetic compatibility',
    api_changes:   'None — cosmetic slot assignment unchanged; only the asset format changes',
    fallback_2d:   false,
    prerequisite:  'Phase 1 complete; 3D cosmetic art pipeline established',
  },
  {
    phase:         5,
    name:          'Aura VFX',
    deliverable:   'Particle system aura replacing static SVG; same opacity/timing budgets enforced',
    risk:          'Medium — GPU particle cost must be validated on low-end mobile before shipping',
    api_changes:   'None — aura state driven by existing emotional state system',
    fallback_2d:   true,  // static SVG aura remains as device-level fallback
    prerequisite:  'Phase 1 complete; GPU budget analysis done',
  },
]);
