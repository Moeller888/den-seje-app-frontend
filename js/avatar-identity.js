// ── Avatar Iconic Identity Contract v1 ────────────────────────────────────────
// Defines what makes DEN SEJE APP's avatar iconically recognizable.
//
// PHILOSOPHY: Recognition through symbolic consistency, not visual complexity.
// The avatar belongs to a specific world: composed mastery, curious readiness,
// educational calm. These qualities should be readable at a glance — even at
// 52px, even without cosmetics.
//
// This file answers: WHO IS THIS CHARACTER?
//
// Complements:
//   avatar-character-contract.js — WHAT rules apply (non-negotiable rules)
//   avatar-cohesion.js           — HOW timing works (master rhythm)
//   avatar-presence.js           — WHEN it breathes (breathing profiles)
//
// All future character and cosmetic design decisions should reference
// these identity principles to prevent genre drift.

// ── Signature Silhouette Zones ────────────────────────────────────────────────
// Five form-zones that define the avatar's proportional identity.
// SVG viewBox: 160×240. Head sphere: cx=80 cy=50 r=30.
// Changes to these zones break recognition consistency.

export const SILHOUETTE_ZONES = Object.freeze({
  HEAD: {
    svg_y_range:     [20, 80],
    height_pct:      0.25,
    identity_role:   'Primary recognition anchor — face dominates at all scales',
    at_52px:         'Face is ~13px tall — brow/eye rhythm is the only readable signal',
    design_rule:     'Face must never be less than 22% of total container height',
  },
  NECK_SHOULDERS: {
    svg_y_range:     [80, 110],
    height_pct:      0.125,
    identity_role:   'Transition zone — posture is set here',
    design_rule:     'Shoulders must remain level. No aggressive slouch or combat hunch.',
  },
  TORSO: {
    svg_y_range:     [110, 175],
    height_pct:      0.27,
    identity_role:   'Mass anchor — the compositional center of gravity',
    design_rule:     'Torso must remain the visual anchor at every cosmetic loadout.',
  },
  HIP_LEG: {
    svg_y_range:     [175, 220],
    height_pct:      0.19,
    identity_role:   'Stability zone — grounded, not aggressive',
    design_rule:     'Leg geometry signals readiness, not combat stance.',
  },
  FEET: {
    svg_y_range:     [220, 240],
    height_pct:      0.08,
    identity_role:   'Foundation — planted, settled weight',
    design_rule:     'Feet define gravitational credibility. Never floating.',
  },
});

// ── Posture Identity ───────────────────────────────────────────────────────────
// The default posture is the avatar's most fundamental identity signal.
// This is what "DEN SEJE APP student" looks like — before any cosmetics.
// If the bare body communicates the wrong archetype, no cosmetic can fix it.

export const POSTURE_IDENTITY = Object.freeze({
  archetype:           'Curious Learner — present, attentive, ready to think',
  vertical_alignment:  'Centered and upright — never leaning aggressively',
  weight:              'Slightly forward in head/eye engagement — curious, not passive',
  shoulders:           'Level — composed authority, not hunched defeat',
  feet:                'Planted — settled presence, gravitational credibility',
  expression_default:  'Neutral — the face of a student who is ready, not waiting',

  // What the bare body communicates without any cosmetics
  bare_body_signal:    'I am here to think, to grow, to try',

  // Explicit rejections
  NOT_aggressive:      'No combat stance, no weapon-ready posture, no threat geometry',
  NOT_passive:         'No slouch, no boredom, no disengagement in the body',
  NOT_triumphant:      'No victory pose, no arms-raised celebration',
  NOT_submissive:      'No cowering, no shrinking, no apology in the stance',
});

// ── Educational Prestige Language ─────────────────────────────────────────────
// What "achievement" looks like in this universe.
// NOT: power fantasy, competitive triumph, warrior mythology, edgy ascension.
// YES: composed growth, quiet excellence, calm aspiration.

export const PRESTIGE_LANGUAGE = Object.freeze({
  COMPOSED_MASTERY: {
    shape_signal:   'Upright posture, settled weight, level shoulders',
    color_signal:   'Warm neutrals + earned accent tones — not saturated power colors',
    motion_signal:  'Proud breathing (4000ms, 1.4px) — expanded, full, slow',
    NOT:            'Triumph fist, power pose, aggressive forward lean',
  },
  CALM_ASPIRATION: {
    shape_signal:   'Upward-flowing compositional lines — crown arcs, shoulder flow, aura drift',
    color_signal:   'Upward gradient in cosmetics — lighter at top, grounded at base',
    motion_signal:  'Breathing amplitude: 0.7px (focused) → 1.4px (proud) — gradual expansion',
    NOT:            'Explosive upward burst, particle shower, rapid kinetic escalation',
  },
  QUIET_EXCELLENCE: {
    shape_signal:   'Restrained cosmetic hierarchy — each slot adds presence, not noise',
    color_signal:   'Rarity escalates subtly: grey → green → blue → warm gold',
    motion_signal:  'Aura: warmer at higher rarity, never louder',
    NOT:            'Stacked VFX, multiple simultaneous competing visual claims',
  },
  CURIOUS_READINESS: {
    shape_signal:   'Attentive neutral expression — eyes open, slight face engagement',
    color_signal:   'Warm ambient tone — inviting, not demanding',
    motion_signal:  'Curious breathing (3200ms, 1.0px) — near-neutral, slightly tighter',
    NOT:            'Wide-eyed shock, tense urgency, anxious kinetic energy',
  },
  THOUGHTFUL_AUTHORITY: {
    shape_signal:   'Crown geometry: balanced arc, not aggressive spike — earned, not seized',
    color_signal:   'Legendary gold: warm amber family (#ffd700) — not harsh pure yellow',
    motion_signal:  'No extra motion at high rarity — presence is earned, not announced',
    NOT:            'Aggressive crown spikes, dominating headwear, over-scaled accessories',
  },
});

// ── Symbolic Motif Language ────────────────────────────────────────────────────
// Five recurring geometric forms that create visual coherence across all cosmetics.
// Every new cosmetic should incorporate at least two of these motifs.
// A cosmetic that uses none of these motifs likely causes identity drift.

export const SYMBOLIC_MOTIFS = Object.freeze({
  UPWARD_ARC: {
    description:    'Lines that arc or flow upward — in crown geometry, shoulder lines, aura whispers',
    purpose:        'Aspiration — movement toward growth, always upward-facing',
    appears_in:     ['crown top arc', 'shoulder cape flow', 'aura whisper paths', 'wing membrane arcs'],
    anti_pattern:   'Downward spikes, drooping lines, heavy falling geometry',
  },
  SETTLED_BASE: {
    description:    'Heavier geometry at feet and hip zone — visual gravitational anchor',
    purpose:        'Groundedness — this character is present, not floating, not fleeing',
    appears_in:     ['leg silhouette width', 'armor base geometry', 'cape hem weight'],
    anti_pattern:   'Floating posture, top-heavy silhouette without a grounded base',
  },
  ORBITAL_RHYTHM: {
    description:    'Circular and arc forms that repeat throughout — halos, crown arcs, rounded edges',
    purpose:        'Coherence — the same geometric family appears at every scale and category',
    appears_in:     ['aura radial gradients', 'crown arc', 'rounded pauldrons', 'glasses lenses'],
    anti_pattern:   'Sharp angular silhouettes, hexagonal forms, jagged geometry',
  },
  ARC_OVER_ANGLE: {
    description:    'When choosing between arc and sharp angle in cosmetic outlines, choose arc',
    purpose:        'Warmth over aggression — educational safety principle encoded in geometry',
    appears_in:     ['cape hem shape', 'crown base curve', 'armor edge rounding', 'wing tip arc'],
    anti_pattern:   'Weapon-like sharp tips, aggressive pointed geometry, blade-edge silhouettes',
  },
  CONTAINED_EXTENSION: {
    description:    'Cosmetics may extend beyond canvas but visual center stays in canvas center',
    purpose:        'Scale readability — at 52px the center is always visible; edges are decorative',
    appears_in:     ['wing spread beyond canvas', 'cape back extension', 'crown height extension'],
    anti_pattern:   'Cosmetics that shift visual center away from the character body',
  },
});

// ── Recognition Targets ────────────────────────────────────────────────────────
// What the avatar must communicate at each display scale.
// "Recognizable" = a viewer can identify DEN SEJE APP's character philosophy.
// Design cosmetics and base body for the smallest scale first.

export const RECOGNITION_TARGETS = Object.freeze({
  LEADERBOARD_36PX: {
    what_survives:    'Upright silhouette + breathing motion',
    identity_signal:  'A living form that is present — not frozen',
    threshold:        'Distinguishable from a static icon',
    design_priority:  'Do not design cosmetics for this scale — focus on not breaking it',
  },
  GAME_STRIP_52PX: {
    what_survives:    'Posture tone, expression state, ambient theme glow, breathing',
    identity_signal:  'Educational companion — calm, composed tone readable at a glance',
    threshold:        'Emotional tone readable, not just silhouette',
    design_priority:  'PRIMARY design scale — all decisions start here',
  },
  HUB_110PX: {
    what_survives:    'All above + cosmetic category identity, rarity signal',
    identity_signal:  'This specific student with their specific loadout personality',
    threshold:        'Character personality visible, not just emotional state',
    design_priority:  'Secondary scale — cosmetic decisions must read here',
  },
  COLLECTION_180PX: {
    what_survives:    'Full identity — symbolic motifs, material language, posture nuance',
    identity_signal:  'DEN SEJE APP character at its most complete',
    threshold:        'Iconic status — platform identity should be felt',
    design_priority:  'Verification scale — all detail work verified here',
  },
});

// ── Genre Drift Anti-patterns ─────────────────────────────────────────────────
// Design choices that would make the character feel generic or wrong-genre.
// Any proposed cosmetic or feature should be tested against these.

export const GENRE_DRIFT = Object.freeze({
  MOBILE_RPG: {
    signals:  ['sharp weapon geometry', 'angry expressions', 'dark aggressive colors', 'battle-ready posture'],
    verdict:  'Rejected — wrong universe',
    risk:     'Armor and crown categories are most vulnerable to this drift',
  },
  ANIME_POWER: {
    signals:  ['glowing eyes', 'energy blasts', 'dramatic power poses', 'extreme expression range'],
    verdict:  'Rejected — theatrical, not relational',
    risk:     'Aura and expression categories are most vulnerable',
  },
  ESPORTS: {
    signals:  ['RGB color cycling', 'aggressive angular geometry', 'rank/trophy iconography'],
    verdict:  'Rejected — competitive, not educational',
    risk:     'Legendary tier design is most vulnerable to this drift',
  },
  CARTOON_MASCOT: {
    signals:  ['oversized head proportion', 'waving/jumping', 'speech bubbles', 'exaggerated features'],
    verdict:  'Rejected — mascot energy, not companion presence',
    risk:     'Expression system and interaction design are most vulnerable',
  },
  FANTASY_WARRIOR: {
    signals:  ['weapon silhouette', 'armor spikes', 'intimidation posture', 'battle damage aesthetics'],
    verdict:  'Rejected — power fantasy, not learning',
    risk:     'Armor and back-item categories are most vulnerable',
  },
  GENERIC_GACHA: {
    signals:  ['interchangeable body geometry', 'no posture identity', 'pure accessory rack'],
    verdict:  'Rejected — identity must survive the bare body without cosmetics',
    risk:     'Occurs when cosmetics are designed before the base body identity is stable',
  },
});

// ── Identity Coherence Test ────────────────────────────────────────────────────
// Seven questions to ask about any new cosmetic, feature, or design decision.
// Every question should be answerable with "yes" before shipping.

export const COHERENCE_TEST = Object.freeze([
  'Does this feel like it belongs to the same world as existing items?',
  'Would a student recognize this character as their educational companion — not a warrior?',
  'Does this preserve at least two symbolic motifs (upward arc, settled base, orbital rhythm, arc over angle, contained extension)?',
  'At 52px, does the silhouette remain calm and educational in tone?',
  'Does this escalate presence quietly, or demand loud attention?',
  'Would a teacher feel comfortable with this character on screen during a quiz?',
  'If this appeared in a different character universe, would it feel out of place here?',
]);
