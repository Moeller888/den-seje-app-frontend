// ── Avatar Long-Term Continuity Contract v1 ───────────────────────────────────
// Defines how DEN SEJE APP's avatar maintains emotional continuity across months
// and years of use — without crossing into parasocial or manipulative territory.
//
// PHILOSOPHY: Continuity through identity persistence, not relationship simulation.
// The avatar should feel historically consistent and quietly familiar — because
// its symbolic identity, motion language, and prestige language remain stable.
// Not because it pretends to remember or miss the user.
//
// This file answers: HOW DOES THIS CHARACTER PERSIST THROUGH TIME?
//
// Complements:
//   avatar-identity.js           — WHO IS THIS CHARACTER (iconic recognizability)
//   avatar-character-contract.js — WHAT rules apply (non-negotiable rules)
//   avatar-cohesion.js           — HOW timing works (master rhythm)
//   avatar-presence.js           — WHEN it breathes (breathing profiles)
//
// All future progression, prestige, and long-term design decisions should
// reference these continuity principles to prevent temporal drift.

// ── Continuity Audit ──────────────────────────────────────────────────────────
// Critical evaluation of session-based vs historically continuous avatar behavior.
// Each finding is classified: STRENGTH (preserves continuity) or RISK (breaks it).

export const CONTINUITY_AUDIT = Object.freeze({
  STRENGTHS: [
    {
      system:   'Stable symbolic identity (avatar-identity.js)',
      verdict:  'STRENGTH',
      reason:   'SILHOUETTE_ZONES, SYMBOLIC_MOTIFS, POSTURE_IDENTITY are immutable contracts — any future cosmetic still reads as the same character',
    },
    {
      system:   'Breathing as identity signal (avatar-presence.js)',
      verdict:  'STRENGTH',
      reason:   'Physiological breathing rhythm (3200–4000ms) is the same on day 1 as year 3 — continuity encoded in motion physics',
    },
    {
      system:   'Emotional restraint (EMOTIONAL_GUARDRAILS)',
      verdict:  'STRENGTH',
      reason:   'No exaggerated reactions means no escalation over time — calm identity is self-reinforcing',
    },
    {
      system:   'Rarity prestige language (QUIET_EXCELLENCE)',
      verdict:  'STRENGTH',
      reason:   'Rarity escalates presence subtly (grey → green → blue → warm gold) — the progression vocabulary is stable and readable after long absence',
    },
    {
      system:   'Cosmetic coherence (SYMBOLIC_MOTIFS)',
      verdict:  'STRENGTH',
      reason:   'Five recurring motifs create visual coherence across all items — any new cosmetic reads as belonging to the same world',
    },
  ],
  RISKS: [
    {
      system:   'No explicit continuity contract',
      verdict:  'RISK',
      reason:   'Without a documented continuity philosophy, future feature additions may introduce escalating novelty that erodes stable identity over time',
      mitigation: 'This file (avatar-continuity.js) — all future features reference CONTINUITY_PRINCIPLES',
    },
    {
      system:   'Achievement/retention systems (external)',
      verdict:  'RISK',
      reason:   'Streak mechanics and daily quests may create emotional pressure if not designed with EMOTIONAL_STABILITY principles',
      mitigation: 'Achievement presentation must use PRESTIGE_LANGUAGE (quiet, composed) — not escalating excitement vocabulary',
    },
    {
      system:   'Level-up overlay (index.html)',
      verdict:  'RISK',
      reason:   'Current "LEVEL UP! 🎉" overlay uses celebration energy — at level 200 this reads identically to level 2, which flattens the journey',
      mitigation: 'Long-term: prestige milestones should escalate in composure, not excitement volume — see LEGACY_MILESTONES',
    },
    {
      system:   'Theme as context, not identity',
      verdict:  'RISK',
      reason:   'If a returning user changes theme, the avatar looks visually unfamiliar — theme should shift atmosphere, never identity',
      mitigation: 'SILHOUETTE_ZONES and POSTURE_IDENTITY are theme-invariant; reinforce in future theme design',
    },
  ],
});

// ── Continuity Principles ─────────────────────────────────────────────────────
// The foundational rules for long-term character persistence.
// Every feature touching the avatar over its lifetime should reference these.

export const CONTINUITY_PRINCIPLES = Object.freeze({
  IDENTITY_OVER_NOVELTY: {
    principle:  'When choosing between a new visual feature and identity stability, choose stability',
    reason:     'Novelty escalates; identity compounds. Year-three users should feel they know this character.',
    applies_to: ['new cosmetic categories', 'new motion behaviors', 'new VFX', 'new expression states'],
  },
  RESTRAINT_COMPOUNDS: {
    principle:  'Every choice to not add noise is a deposit into long-term legibility',
    reason:     'Restraint at year 1 means the character is still readable at year 3. Maximalism degrades.',
    applies_to: ['aura systems', 'reward animations', 'achievement celebrations', 'level-up moments'],
  },
  CONTINUITY_THROUGH_CONSISTENCY: {
    principle:  'The avatar feels persistent because its behavior is predictable — not because it remembers',
    reason:     'Predictable breathing, stable posture, familiar prestige rhythm = historical continuity without relationship simulation',
    applies_to: ['breathing profiles', 'idle behavior', 'emotional state transitions', 'prestige progression'],
  },
  NO_RELATIONSHIP_SIMULATION: {
    principle:  'The avatar must never behave as if it has a relationship with this specific user',
    reason:     'Welcome-back animations, "I missed you" energy, or escalating warmth over time are manipulative attachment design',
    applies_to: ['return-user detection', 'streak rewards', 'long-session behavior', 'achievement acknowledgment'],
    NOT:        '"Welcome back" reactions, emotional guilt on streak breaks, personalized warmth escalation',
  },
  PRESTIGE_IS_COMPOSURE: {
    principle:  'Higher achievement = greater composure, not louder celebration',
    reason:     'A student at level 200 should feel settled and quietly confident — not more excited or more celebrated',
    applies_to: ['legendary tier design', 'high-level achievement presentation', 'prestige milestone framing'],
  },
  SYMBOLIC_STABILITY: {
    principle:  'The five symbolic motifs (upward arc, settled base, orbital rhythm, arc-over-angle, contained extension) must remain readable at all prestige tiers',
    reason:     'Symbolic consistency is how the avatar feels historically continuous — even after 200 new cosmetics',
    applies_to: ['all future cosmetic design', 'rarity tier escalation', 'seasonal items'],
  },
});

// ── Ritual & Rhythm Continuity ────────────────────────────────────────────────
// Recurring behavioral patterns that create the sense of familiar consistency.
// These are not new features — they are the stable constants that persist
// across every session, theme, and cosmetic loadout.

export const RITUAL_RHYTHM = Object.freeze({
  BREATHING_AS_CONSTANT: {
    description:  'The 3500ms breathing cycle is the same on day 1 and year 3',
    continuity:   'Users who return after months immediately recognize the rhythm — it has not accelerated or changed',
    design_rule:  'Breathing profiles may shift amplitude/duration with emotional state, but the BASE rhythm (NEUTRAL: 3500ms, 1.0px) must never feel alien',
  },
  IDLE_COMPOSURE: {
    description:  'The avatar returns to the same calm neutral after every interaction',
    continuity:   'The emotional reset is always to NEUTRAL, never to a "warmer" state that accumulates over sessions',
    design_rule:  'Idle settle timing (600ms) is always predictable — never varies based on streak, level, or time since last session',
  },
  REWARD_CADENCE: {
    description:  'Correct answer → breathing expands briefly → returns to neutral',
    continuity:   'The reward acknowledgment rhythm is identical at level 1 and level 300 — mastery does not inflate the response',
    design_rule:  'XP popup, coin animation, breathing expansion: all follow the same choreography regardless of progression state',
  },
  PRESTIGE_SILENCE: {
    description:  'At higher prestige tiers, the avatar does not acquire more motion or more celebration — it acquires more stillness',
    continuity:   'A legendary-loadout avatar is more visually present but not more kinetically active than a basic loadout',
    design_rule:  'Aura glow may increase in warmth; breathing amplitude does not increase beyond PROUD profile (4000ms, 1.4px)',
  },
  EMOTIONAL_FLOOR: {
    description:  'No matter what cosmetics are equipped or what level the student has reached, the default emotional state is always NEUTRAL',
    continuity:   'NEUTRAL breathing at 52px is the character\'s "home" — it should feel the same after 2 years as after 2 days',
    design_rule:  'Never let prestige cosmetics imply a permanently elevated emotional state',
  },
});

// ── Educational Legacy Language ───────────────────────────────────────────────
// What "growth over time" looks like in DEN SEJE APP's universe.
// NOT power accumulation. NOT triumph escalation.
// YES: quiet mastery, sustained curiosity, accumulated calm confidence.

export const EDUCATIONAL_LEGACY = Object.freeze({
  QUIET_MASTERY: {
    description:  'Long-term progression should feel like a scholar who has settled into their craft',
    visual_signal: 'Higher prestige = more compositional weight in silhouette, more refined atmospheric framing — not larger or louder',
    motion_signal: 'Proud breathing (4000ms, 1.4px) — expanded, full, slow — is the motion language of earned mastery',
    NOT:           'Power fantasy accumulation, combat readiness, trophy display',
  },
  SUSTAINED_CURIOSITY: {
    description:  'The avatar at level 300 should still feel curious and ready — not bored, not superior, not finished',
    visual_signal: 'Attentive neutral expression (NEUTRAL state) persists at all prestige levels',
    motion_signal: 'Curious breathing (3200ms, 1.0px) remains available regardless of level — the character is always ready to engage',
    NOT:           'Jaded superiority, disengaged confidence, "I have already won" posture',
  },
  COMPOSED_PROGRESS: {
    description:  'Progress is visible in refined visual authority, not in escalating kinetic energy',
    visual_signal: 'Legendary tier: warm gold ambient glow, fuller silhouette weight, balanced crown arc — all speak composure',
    motion_signal: 'No additional motion behaviors unlock with progression — composure is the reward',
    NOT:           'Motion complexity as a progression reward (particles, trails, secondary animations)',
  },
  THOUGHTFUL_PERSISTENCE: {
    description:  'The avatar communicates that showing up over time has value — quietly, without pressure',
    visual_signal: 'Cosmetic slots that are filled over time create a loadout story: not a power spike, but an accumulated aesthetic',
    motion_signal: 'Consistent breathing rhythm across all progression states — "I have been here, I am still here"',
    NOT:           'Retention mechanics that punish absence, streak guilt, "don\'t lose your progress" anxiety design',
  },
});

// ── Progression Memory Without Parasociality ─────────────────────────────────
// How the avatar subtly reflects long-term progression through identity evolution,
// not through fake relationship simulation.

export const PROGRESSION_MEMORY = Object.freeze({
  WHAT_CHANGES_WITH_PROGRESSION: {
    environmental_composure: 'Higher prestige → warmer, more refined ambient glow — the world atmosphere grows more settled',
    silhouette_authority:    'More slots filled → more compositional weight — not larger, but more visually complete',
    atmospheric_framing:     'Legendary tier → warm gold ambient replaces cooler base ambient — environmental maturity',
    motion_presence:         'PROUD breathing available as the default at high prestige — expanded, full, composed',
  },
  WHAT_NEVER_CHANGES_WITH_PROGRESSION: {
    posture_identity:        'The neutral upright posture is identical at level 1 and level 500',
    breathing_base:          'NEUTRAL breathing (3500ms) is always available, always the reset point',
    symbolic_motifs:         'All five motifs remain readable at every prestige tier — no motif is "unlocked" or "upgraded"',
    emotional_guardrails:    'No expression state becomes permanently active at higher levels',
    identity_continuity:     'The character is always recognizably the same character — prestige refines, never replaces',
  },
  EXPLICIT_REJECTIONS: {
    NOT_fake_memory:         'The avatar does not behave as if it remembers this specific user\'s journey',
    NOT_personalized_warmth: 'No escalating warmth based on session count or returning-user detection',
    NOT_absence_reaction:    'Returning after 30 days: identical behavior to returning after 1 day',
    NOT_relationship_drift:  'The avatar should not feel "closer" or "more familiar" simply due to time passing',
  },
});

// ── Emotional Stability Contract ──────────────────────────────────────────────
// Ensures the avatar's emotional language remains stable, trustworthy, and safe
// across long-term use — avoiding escalation, manipulation, or attachment traps.

export const EMOTIONAL_STABILITY = Object.freeze({
  STABLE_FLOOR: {
    rule:   'NEUTRAL is always the floor — no session starts warmer than NEUTRAL',
    reason: 'If the avatar starts "warm" because of a streak, users who break streaks feel the gap as loss, which is manipulative design',
  },
  NO_ESCALATION: {
    rule:   'Emotional amplitude does not increase over time or over session duration',
    reason: 'Long-session users and first-time users receive the same motion intensity — no escalating engagement reward',
  },
  ABSENCE_NEUTRAL: {
    rule:   'A user returning after 30 days sees no special behavior — no reaction, no warmth increase, no acknowledgment of absence',
    reason: '"Welcome back" animations simulate relationship; their absence protects against manufactured intimacy',
  },
  SAFE_BOUNDARIES: {
    rule:   'The avatar acknowledges game events (correct answer, level up) — not personal events (streak, return, long absence)',
    reason: 'Game events are system states; personal events imply relationship awareness which crosses into parasocial design',
  },
  LONG_SESSION_STABILITY: {
    rule:   'After 60 minutes of use, the avatar behaves identically to minute 1',
    reason: 'No fatigue simulation, no warmth build-up, no "we\'ve been working together" energy',
  },
  GRIEF_FREE_FAILURE: {
    rule:   'Incorrect answers and streak breaks produce no negative emotional signal from the avatar',
    reason: 'Emotional disappointment from the avatar creates guilt, which is a manipulation vector — incorrect → brief FOCUSED state, then NEUTRAL',
  },
});

// ── Visual Continuity Protection ──────────────────────────────────────────────
// Audit criteria to protect identity continuity through future evolution.
// Any major system update must pass these checks.

export const VISUAL_CONTINUITY = Object.freeze({
  SILHOUETTE_LOCK: {
    what:       'The five SILHOUETTE_ZONES (HEAD 25%, NECK_SHOULDERS 12.5%, TORSO 27%, HIP_LEG 19%, FEET 8%) must remain stable',
    test:       'Place a new cosmetic on the avatar — does the silhouette zone ratio still read correctly?',
    violation:  'A cosmetic that significantly shifts visual mass outside these zones breaks silhouette continuity',
  },
  MOTION_LOCK: {
    what:       'The breathing animation (3500ms base, 38% peak, asymmetric cubic-bezier) must remain the primary motion identity',
    test:       'After 6 months of new features, is breathing still the first motion the eye reads?',
    violation:  'A new secondary animation (idle gesture, particle trail) that competes with breathing in visual weight',
  },
  SYMBOLIC_LOCK: {
    what:       'All five SYMBOLIC_MOTIFS must remain readable in any cosmetic at any prestige tier',
    test:       'Looking at a legendary loadout at 110px — can you identify at least two symbolic motifs?',
    violation:  'Cosmetics that introduce angular, aggressive, or downward geometry without arc counterbalance',
  },
  EMOTIONAL_FLOOR_LOCK: {
    what:       'NEUTRAL state at 52px must always read as calm educational companion, not warrior, not mascot, not NPC',
    test:       'Show the bare avatar (no cosmetics, NEUTRAL breathing) to someone unfamiliar with the platform — what do they describe?',
    violation:  'Any system change that shifts the bare-body emotional read toward excitement, aggression, or character dependency',
  },
  THEME_INVARIANT_LOCK: {
    what:       'The character\'s identity must be recognizable across all 10 themes (default through rose-gold)',
    test:       'Switch rapidly between themes — does the character feel like the same character in different environments?',
    violation:  'A theme whose color palette causes the avatar silhouette or expression to read differently',
  },
});

// ── Symbolic Legacy Systems ───────────────────────────────────────────────────
// Subtle symbolic signals of enduring progress — earned and composed, not loud.

export const SYMBOLIC_LEGACY = Object.freeze({
  PRESTIGE_FRAMING: {
    description:  'Each rarity tier is a distinct register of the same language, not a louder version',
    COMMON:       { signal: 'Upright presence, basic ambient — the foundation is already dignified', framing: 'Starting here is already composed' },
    UNCOMMON:     { signal: 'Subtle color identity begins to emerge — first personal signature', framing: 'Curiosity made visible' },
    RARE:         { signal: 'Cosmetic category identity readable — silhouette more compositionally complete', framing: 'Sustained engagement has a face' },
    EPIC:         { signal: 'Environmental atmosphere now participates — warmer ambient, fuller presence', framing: 'The world responds to accumulated investment' },
    LEGENDARY:    { signal: 'Warm gold ambient, full symbolic motif vocabulary, maximum compositional authority', framing: 'Quiet excellence — composure without announcement' },
  },
  COLLECTION_MATURITY: {
    description:  'A fully-populated cosmetic loadout should read as a coherent aesthetic statement, not a maximum-points optimization',
    principle:    'Each slot adds presence to a unified identity — not visual noise to an accessory rack',
    test:         'Does a full legendary loadout feel like one composed entity, or like six separate cosmetics stacked?',
  },
  ACHIEVEMENT_COMPOSURE: {
    description:  'Achievement unlocks should feel like quiet confirmations of path, not explosive celebrations',
    principle:    'The achievement panel uses the same calm educational tone as the rest of the platform — no fireworks energy',
    NOT:          'Achievement-as-dopamine-spike design; loud celebration that habituates users to external validation',
  },
  EDUCATIONAL_ASPIRATION: {
    description:  'The highest cosmetic tiers should communicate aspiration-as-academic-identity, not power-as-gaming-identity',
    test:         'Would a teacher feel comfortable seeing this legendary-tier loadout during a classroom quiz?',
    anchor:       'COHERENCE_TEST question 6 from avatar-identity.js — this is the final arbiter',
  },
});

// ── Legacy Milestones ─────────────────────────────────────────────────────────
// How major progression milestones should be framed in this universe.
// Replaces the "LEVEL UP!" excitement escalation with composed acknowledgment.

export const LEGACY_MILESTONES = Object.freeze({
  MILESTONE_PHILOSOPHY: 'Milestones confirm persistence, not conquest. The student has arrived somewhere, not defeated something.',
  TONE_LANGUAGE: {
    AVOID:  ['LEVEL UP! 🎉', 'INCREDIBLE!', 'AMAZING STREAK!', 'YOU\'RE UNSTOPPABLE!'],
    PREFER: ['Du er nu niveau X', 'Stille fremgang', 'Endnu et kapitel', 'Rolig og vedholdende'],
    REASON: 'Excited celebration habituates to escalation; composed acknowledgment compounds into lasting satisfaction',
  },
  VISUAL_LANGUAGE: {
    AVOID:   'Explosive animation, confetti, particle burst, rapid zoom',
    PREFER:  'Breathing expansion (PROUD profile, briefly), warm ambient glow pulse, text reveal at calm pace',
    REASON:  'Visual intensity of celebration should never exceed the visual identity of the platform — the character is the constant, the milestone is a note in its journey',
  },
  PRESTIGE_GRADUATION: {
    description:  'As users move from common → legendary tier, the platform tone should become more settled, not more excited',
    COMMON_TONE:  'Welcoming, warm, accessible — "begin here"',
    LEGENDARY_TONE: 'Composed, refined, understated — "this is what sustained curiosity looks like"',
    TRANSITION:   'Tone transition is gradual across rarity tiers — not a sudden shift at legendary unlock',
  },
});

// ── Future 3D Long-Term Character Universe ────────────────────────────────────
// How the continuity principles translate to a long-term stylized educational
// character universe — including 3D, motion, seasonal, and franchise evolution.

export const FUTURE_3D_CONTINUITY = Object.freeze({
  IDENTITY_PERSISTENCE_IN_3D: {
    principle:  'The SILHOUETTE_ZONES and POSTURE_IDENTITY are rig design constraints — not 2D-only rules',
    translation: 'In 3D: the spine, shoulder, and hip proportions encode the "curious learner" archetype directly into the character rig',
    anti_pattern: 'Redesigning the 3D rig to be "more expressive" in ways that shift the posture identity toward mascot or warrior energy',
  },
  MOTION_CONTINUITY_IN_3D: {
    principle:  'The breathing rhythm (3500ms base) must translate to 3D idle animation — it is the core motion identity',
    translation: 'In 3D: the idle cycle is a slow physiological breath — chest rise (38% mark), full release — not a game-character fidget loop',
    anti_pattern: 'Energetic idle animations (weight shifts, head movements, arm swings) that compete with the breathing as primary motion read',
  },
  SYMBOLIC_STABILITY_IN_3D: {
    principle:  'The five symbolic motifs are geometry philosophy — they apply to polygon modeling decisions',
    translation: 'In 3D: crown arcs, shoulder flows, cape hems are modeled with arc-over-angle preference in mind',
    anti_pattern: 'Concept art that introduces aggressive angular geometry justified by "3D looks better with hard edges"',
  },
  WORLD_CONTINUITY: {
    principle:  'Seasonal updates, collab cosmetics, and platform expansions must pass the GENRE_DRIFT test',
    translation: 'Any new cosmetic system (seasonal, collab, platform event) references COHERENCE_TEST before shipping',
    anti_pattern: 'Seasonal items that introduce a completely different symbolic vocabulary (Halloween aggression, holiday kitsch)',
  },
  VISUAL_AGING: {
    principle:  'Over years of updates, the character should feel more refined — not more complex',
    translation: 'Each design generation resolves small ambiguities in the symbolic language — it does not layer new systems on old ones',
    anti_pattern: 'Live-service escalation: each season adds a new motion system, a new cosmetic category, a new VFX layer until the identity is buried',
  },
  LONG_TERM_FRANCHISE_CONTINUITY: {
    principle:  'If DEN SEJE APP\'s character ever appears in a different context (app icon, physical merchandise, video content), the posture identity and symbolic language remain consistent',
    translation: 'POSTURE_IDENTITY and SYMBOLIC_MOTIFS are the franchise design brief — not just the game avatar brief',
    anti_pattern: 'A merchandise character that looks like a different, more aggressive or more mascot-like entity',
  },
});

// ── Continuity Test ───────────────────────────────────────────────────────────
// Eight questions to ask about any feature, update, or design decision over time.
// These supplement the seven COHERENCE_TEST questions from avatar-identity.js.

export const CONTINUITY_TEST = Object.freeze([
  'Would a user returning after 6 months immediately recognize this character as the same one they left?',
  'Does this feature produce the same experience on day 1 as on day 365?',
  'If this feature is still in place in 3 years, does it still serve the educational trust relationship — or has it aged into manipulation?',
  'Does this change the stable NEUTRAL state in any way — making it warmer, more reactive, or more relationship-aware?',
  'Would a teacher show this to a classroom on day 1 with the same comfort as day 300?',
  'Does this escalate the emotional amplitude of the platform over time, or does it compound composure?',
  'Is the continuity signal here symbolic (same motifs, same posture, same rhythm) — or relational (memory, warmth, personalization)?',
  'If this feature were removed tomorrow, would the avatar feel like something important was lost — or just quieter?',
]);
