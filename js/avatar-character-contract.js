// ── Avatar Character Design Contract v1 ──────────────────────────────────────
// The non-negotiable character rules.
// These rules protect the avatar as a CHARACTER — not a cosmetic display system.
//
// Every visual decision, every new feature, every new cosmetic must be evaluated
// against this contract. No change may violate these rules.
//
// This is the CHARACTER BIBLE.
// It complements the timing contract (avatar-cohesion.js) with qualitative rules
// that cannot be expressed as numbers alone.

// ── Non-Negotiable Rules ──────────────────────────────────────────────────────

export const NON_NEGOTIABLE = Object.freeze([
  {
    id:          'body_readability_wins',
    rule:        'Body readability always wins',
    detail:      'The character body and head must be clearly readable at any cosmetic loadout, on any theme, at any display size. If a cosmetic obscures the character, the cosmetic is wrong — not the character.',
    enforced_by: 'LAYER_ASSIGNMENTS z-order, SLOT_BOUNDS constraints, ELEMENT_BUDGET per slot',
  },
  {
    id:          'silhouette_clarity',
    rule:        'Silhouette clarity over visual effects',
    detail:      'The character silhouette must be unambiguous at 52px display width. Glows, auras, and blur effects must never create confusion about where the character ends and the background begins.',
    enforced_by: 'MAX_BLUR_STD_DEVIATION=8, SILHOUETTE_CONTINUITY contract, OPACITY_BUDGET.aura.max_single=0.35',
  },
  {
    id:          'breathing_is_master',
    rule:        'Breathing is the master rhythm — never circumvent it',
    detail:      'All timing in the avatar system is harmonically related to the 2900ms focused-breathing reference cycle. No subsystem may introduce timing that conflicts with or ignores this rhythm. Every duration is a multiple of the master.',
    enforced_by: 'MASTER_RHYTHM_MS in avatar-cohesion.js, MOTION_BUDGET.independent_css_animations=0',
  },
  {
    id:          'emotional_restraint',
    rule:        'The character expresses — it does not perform',
    detail:      'Expressions are calibrated emotional states, not cartoon reactions. The character is composed, not theatrical. No expression should call attention to itself. If a user notices the expression system, it is too strong.',
    enforced_by: 'EMOTIONAL_MATRIX, expression cross-fade timing (180–280ms), hold duration limits',
  },
  {
    id:          'aura_supports_identity',
    rule:        'Aura supports identity — it does not replace it',
    detail:      'Aura is an ambient field that belongs to the character. It enhances presence without competing for visual attention. The character face must always be more visually present than the aura surrounding it.',
    enforced_by: 'AURA_BUDGET.opacity_max=0.35, aura z-index=-2, AURA_COHESION contract',
  },
  {
    id:          'cosmetics_serve_character',
    rule:        'Cosmetics make the character feel distinguished — never invisible',
    detail:      'A legendary cosmetic distinguishes the character without obscuring it. The character body must remain the visual anchor at every rarity tier. Cosmetics are accessories — the character is the identity.',
    enforced_by: 'CENTER_OF_GRAVITY rules, RARITY_SILHOUETTE limits, VISUAL_HIERARCHY',
  },
  {
    id:          'educational_companion',
    rule:        'The avatar is an educational companion — calm, readable, never distracting',
    detail:      'This character appears beside quiz questions in a school context. It must be visually calm, immediately readable, and emotionally supportive. Visual intensity is bounded by the educational environment where children use it.',
    enforced_by: 'EDUCATIONAL_SAFETY rules, classroom-appropriateness standard, RESTRAINT_PRINCIPLES',
  },
  {
    id:          'presence_not_performance',
    rule:        'Presence through restraint — not spectacle through accumulation',
    detail:      'The avatar feels quietly alive. Users should not notice the animation system — they should sense a character that exists. If any single effect can be described in plain words, it is probably too visible. Every value in this system is deliberately small.',
    enforced_by: 'BREATHING_PROFILES amplitude limits (≤1.4px), SILHOUETTE_SAFETY contract',
  },
]);

// ── Educational Safety Rules ──────────────────────────────────────────────────
// Rules that specifically protect classroom and school appropriateness.
// These are permanent — they survive rarity expansions and feature additions.

export const EDUCATIONAL_SAFETY = Object.freeze({
  no_violence_imagery:           true,
  no_threatening_posture:        true,
  no_intense_color_flashing:     true,
  no_strobe_effects:             true,
  no_loud_visual_noise:          true,
  no_disturbing_imagery:         true,
  no_shame_signals:              true,  // incorrect answer → determined, never ashamed or punished
  no_punishment_energy:          true,
  no_extended_failure_states:    true,
  max_visual_intensity:          'moderate — equivalent to a calm illustrated textbook character',
  emotional_tone:                'warm, calm, supportive — not competitive, anxious, or frantic',
  failure_treatment:             'determined recovery — resolve forward, never defeat backward',
  success_treatment:             'composed satisfaction — warmth without euphoria or over-celebration',
  idle_treatment:                'quiet presence — waits patiently, never draws attention to itself',
  note: 'These rules are non-negotiable regardless of cosmetic rarity, feature scope, or commercial pressure.',
});

// ── Visual Hierarchy ──────────────────────────────────────────────────────────
// Priority order for visual attention in the avatar composition.
// Higher priority = more protected against visual interference.
export const VISUAL_HIERARCHY = Object.freeze([
  { priority: 1, element: 'Character face + expression', reason: 'Primary identity and emotional communication — always most visually present' },
  { priority: 2, element: 'Character body silhouette',   reason: 'Identity anchor — defines the character as a character, not an accessory rack' },
  { priority: 3, element: 'Crown / mask cosmetics',      reason: 'Character distinction — enhances without obscuring face' },
  { priority: 4, element: 'Back items (wings/capes)',    reason: 'Silhouette extension — lateral mass, does not occlude face' },
  { priority: 5, element: 'Shirt / glasses',             reason: 'Subtle character detail — occupies torso/eye-line without dominating' },
  { priority: 6, element: 'Aura',                        reason: 'Ambient field — felt subconsciously, not consciously seen' },
]);

// ── Restraint Principles ──────────────────────────────────────────────────────
// Qualitative design constraints — apply when no quantitative rule exists.
// These are judgment calls, but they are documented and agreed-upon.
export const RESTRAINT_PRINCIPLES = Object.freeze([
  'When uncertain: less is always more',
  'If you notice an animation, it is already too strong',
  'If you can describe the VFX in words, it is probably too visible',
  'A cosmetic that "pops" is usually wrong — it should "fit"',
  'Every new visual element competes with the question text for student attention',
  'The avatar displays at roughly thumbnail scale — design for that scale first, not fullscreen',
  'Legendary should feel earned and distinguished, not loud and demanding',
  'The classroom is the context — always ask: would this distract a student mid-quiz?',
  'Emotional restraint is a feature, not a limitation',
  'The goal is subconscious presence — not conscious attention',
]);

// ── Emotional Guardrails ──────────────────────────────────────────────────────
// Per-event emotional boundaries. Clear definition of what each state MUST and MUST NOT do.
export const EMOTIONAL_GUARDRAILS = Object.freeze({
  CORRECT: {
    must:     'Warm, brief satisfaction — composed pride, good job tone',
    must_not: 'Euphoria, over-celebration, jumping, shouting, prolonged animation, multiple simultaneous effects',
    tone:     'Good work — now let\'s keep going',
    hold_ms:  2200,
  },
  INCORRECT: {
    must:     'Calm resolve — determination and forward movement, not defeat',
    must_not: 'Sadness, shame, drooping, punishment energy, angry expression, extended failure visual',
    tone:     'Try again — you\'ve got this',
    hold_ms:  1400,
  },
  LEVEL_UP: {
    must:     'Ceremonial warmth — earned arrival, identity affirmation, composed pride',
    must_not: 'Particle explosions, screen shake, rapid flashing, frantic energy, stacked multiple effects',
    tone:     'You grew — acknowledge it with dignity, then continue',
    hold_ms:  3000,
  },
  ACHIEVEMENT_UNLOCK: {
    must:     'Elevated ceremony — slightly longer than level-up, same composed warmth',
    must_not: 'Anything louder than level-up — achievement is not a competition',
    tone:     'Something was unlocked — that matters, calmly and completely',
    hold_ms:  3200,
  },
  IDLE: {
    must:     'Quiet presence — the character waits alongside the student without demanding attention',
    must_not: 'Fidget animations, attention-seeking micro-expressions, repeated idle cycles, any motion that triggers the eye',
    tone:     'I\'m here whenever you\'re ready',
    settle_ms: 30000,
  },
});

// ── Future Scope Guardrails ───────────────────────────────────────────────────
// Rules for evaluating any proposed new feature against the character contract.
export const SCOPE_GUARDRAILS = Object.freeze([
  {
    proposal:  'New emotional expression (6th state)',
    verdict:   'Carefully evaluate. Only if a new state is meaningfully distinct from existing 5. No state for the sake of variety.',
    test:      'Does the student feel a different emotion from the character, or just see a different image?',
  },
  {
    proposal:  'Animated aura (v2)',
    verdict:   'Permitted when tied to breathing_ms timing. Must not exceed AURA_BUDGET values. Profiling required on low-end mobile.',
    test:      'Does the user notice the aura pulsing? If yes, it\'s too strong.',
  },
  {
    proposal:  'Gaze tracking / eye movement',
    verdict:   'Permitted in Phase 2 (requires SVG variants or inline SVG). Must respect GAZE_MAX_PX=1.5. Must never feel like staring.',
    test:      'Does it feel like awareness or surveillance?',
  },
  {
    proposal:  'New cosmetic category (7th slot)',
    verdict:   'Requires CENTER_OF_GRAVITY analysis. Must not disrupt existing layer z-order. Must have defined attachment anchor.',
    test:      'Does adding this slot break body readability on any existing full legendary loadout?',
  },
  {
    proposal:  'Sound / audio response',
    verdict:   'Requires explicit school-context review. Sound in classrooms is often off or inappropriate. Not a v1 feature.',
    test:      'Would this sound play during a silent class reading period and cause disruption?',
  },
]);
