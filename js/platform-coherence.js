// ── Platform-Wide Emotional & Visual Coherence Contract v1 ───────────────────
// Defines the unified identity of DEN SEJE APP as a complete educational
// product ecosystem — not a collection of individual high-quality systems.
//
// PHILOSOPHY: One platform, one emotional register, one visual language.
// The avatar set the standard. Every other system must now speak the same dialect.
//
// This file answers: HOW DOES THE ENTIRE PLATFORM FEEL AS ONE THING?
//
// Complements the avatar ecosystem files:
//   avatar-identity.js      — WHO IS THE CHARACTER
//   avatar-continuity.js    — HOW THE CHARACTER PERSISTS
//   avatar-cohesion.js      — HOW TIMING WORKS
//   avatar-presence.js      — HOW BREATHING FEELS
//
// All future feature additions, UI changes, and product decisions should
// reference these coherence principles to prevent ecosystem fragmentation.

// ── Platform Coherence Audit ──────────────────────────────────────────────────
// Per-system evaluation of where the platform still feels fragmented.
// Each finding carries a severity: LOW (polish gap), MED (tone mismatch),
// HIGH (actively undermines coherence).

export const PLATFORM_AUDIT = Object.freeze({
  HUB: {
    verdict:     'MOSTLY COHERENT',
    strengths:   ['Avatar as center of gravity', 'Theme system creates unified atmosphere', 'Achievement panel uses calm educational tone'],
    gaps:        ['Navigation tile labels vary in energy (some feel like game menus, some like product buttons)', 'Streak display may carry urgency-pressure energy'],
    severity:    'LOW',
  },
  QUIZ_GAME: {
    verdict:     'MOSTLY COHERENT',
    strengths:   ['Avatar breathing is present and calm', 'XP bar is understated', 'Question card has composed hierarchy'],
    gaps:        ['Level-up overlay energy ("LEVEL UP! 🎉") exceeds the platform\'s composure register', 'Feedback text ("Korrekt!" / "Forkert") is functional but not emotionally tuned', 'XP popup size (36px, bold gold) may feel loud after long sessions'],
    severity:    'MED',
  },
  SHOP: {
    verdict:     'FRAGMENTATION RISK',
    strengths:   ['Grid layout is clean', 'Coin display is consistent with topbar'],
    gaps:        ['Shop interaction energy can feel like mobile game store rather than curated cosmetic wardrobe', 'Item rarity display must reinforce QUIET_EXCELLENCE — not dopamine-optimized unlock energy', 'Purchase confirmation should feel like a considered decision, not an impulse click'],
    severity:    'MED',
  },
  AVATAR_COLLECTION: {
    verdict:     'HIGH COHERENCE',
    strengths:   ['Preview at 180px shows full symbolic identity', 'Cosmetic categories follow SYMBOLIC_MOTIFS contract', 'Rarity progression is compositionally calm'],
    gaps:        ['Equip/unequip interaction timing could be more ceremonial at legendary tier'],
    severity:    'LOW',
  },
  LEADERBOARD: {
    verdict:     'COHERENCE RISK',
    strengths:   ['Tabular layout is readable'],
    gaps:        ['Rank display can feel competitive/esports if typography or iconography leans aggressive', 'Position numbers and delta indicators must use RESPECTFUL_PRESTIGE framing, not "you\'re winning/losing" energy', 'Top-rank visual treatment must not feel like an esports trophy display'],
    severity:    'HIGH',
  },
  ACHIEVEMENTS: {
    verdict:     'MOSTLY COHERENT',
    strengths:   ['Toast-based reveal is calm', 'Staggered timing prevents overwhelm', 'Icon language is educational'],
    gaps:        ['Achievement copy tone — some descriptions may still use excitement energy rather than composed acknowledgment', 'Unlock animation should feel ceremonial, not celebratory'],
    severity:    'LOW',
  },
  REWARD_FLOWS: {
    verdict:     'FRAGMENTATION RISK',
    strengths:   ['XP and coin earn are visually consistent'],
    gaps:        ['Reward language across the platform lacks a unified vocabulary — some flows use celebration energy, some use neutral state-reporting', 'Streak reward presentation must not create "I must maintain this" anxiety', 'The sum of small rewards over a session may accumulate into overstimulation'],
    severity:    'MED',
  },
  MODALS_POPUPS: {
    verdict:     'FRAGMENTATION RISK',
    strengths:   ['No intrusive popups currently'],
    gaps:        ['Any future modal or notification system must be reviewed against MODAL_PHILOSOPHY before shipping', 'Overlay styles must inherit from the platform\'s ambient theme, not from a default OS-style modal vocabulary'],
    severity:    'HIGH — proactive contract needed',
  },
  TYPOGRAPHY: {
    verdict:     'MILD INCONSISTENCY',
    strengths:   ['Font family (Arial/sans-serif) is consistent', 'Color variables (--text-bright, --text-main, --text-dim, --text-muted) create a readable hierarchy'],
    gaps:        ['Font-size usage across pages is not systematically defined — sizes chosen per-component rather than per-hierarchy-level', 'Line-height rhythm varies between pages', 'Label text-transform (uppercase + letter-spacing) is inconsistently applied'],
    severity:    'LOW',
  },
  SPACING: {
    verdict:     'MILD INCONSISTENCY',
    strengths:   ['8px base grid is mostly respected', 'Border-radius family (8px, 10px, 12px, 16px, 20px) is consistent'],
    gaps:        ['Padding values on panels vary (14px, 16px, 20px, 24px) without a clear hierarchy rule', 'Gap between logical sections varies per-page — some feel dense, some feel loose', 'Mobile breathing room is not uniformly defined'],
    severity:    'LOW',
  },
  TRANSITIONS: {
    verdict:     'INCONSISTENT',
    strengths:   ['Button hover/active transitions are consistent (0.1s)', 'XP bar transition (350ms ease) is well-timed'],
    gaps:        ['Page-to-page navigation has no transition at all — the cut is jarring compared to the refined in-page feel', 'Modal open/close timing is not defined platform-wide', 'Reward animations (xpPop 0.8s) are not in a shared transition hierarchy — they exist in isolation'],
    severity:    'MED',
  },
});

// ── Emotional Tone Contract ───────────────────────────────────────────────────
// The unified emotional register for every system on the platform.
// Each area has a tone definition, language examples, and forbidden patterns.

export const EMOTIONAL_TONE_CONTRACT = Object.freeze({
  QUIZ_REWARDS: {
    tone:     'Composed recognition — the answer was correct, the student demonstrated knowledge',
    language: { PREFER: ['Rigtigt', 'Korrekt', 'Du har det'], AVOID: ['FANTASTISK!', 'UTROLIGT!', 'PERFEKT!!'] },
    visual:   'Brief breathing expansion + XP count — no explosive animation',
    timing:   '150ms feedback, 350ms XP bar fill, breathing returns in 1200ms',
  },
  QUIZ_MISTAKES: {
    tone:     'Resilient acknowledgment — the wrong path is information, not failure',
    language: { PREFER: ['Det var ikke rigtigt', 'Prøv igen', 'Svaret var X'], AVOID: ['Forkert!', 'Åh nej!', 'Prøv igen…'] },
    visual:   'Shake animation (gentle), FOCUSED breathing state, no negative avatar expression',
    timing:   'Immediate, brief — the student wants to move on, not dwell',
  },
  LEVEL_UP: {
    tone:     'Ceremonial acknowledgment — a milestone in a long journey, not a conquest',
    language: { PREFER: ['Du er nu niveau X', 'Endnu et kapitel i din læringsrejse', 'Stille fremgang'], AVOID: ['LEVEL UP! 🎉', 'INCREDIBELT!', 'DU ER EN MESTER!'] },
    visual:   'Overlay with warm ambient pulse, PROUD breathing briefly, composed text reveal',
    timing:   '400ms reveal, 2000ms hold, 600ms dismiss — unhurried',
  },
  ACHIEVEMENTS: {
    tone:     'Quiet ceremony — a recognition of path taken, not a prize announcement',
    language: { PREFER: ['Du har opnået: X', 'Bekræftet: X', 'Stille nok'], AVOID: ['🏆 ACHIEVEMENT UNLOCKED!', 'WOW! Du fik X!'] },
    visual:   'Calm toast, 3s display, avatar ambient pulse — not a fireworks overlay',
    timing:   'Staggered reveal if multiple — never simultaneous overwhelm',
  },
  SHOP: {
    tone:     'Considered expression — the student is building their identity, not spending resources',
    language: { PREFER: ['Tilføj til din samling', 'Udtryk dig', 'Tilhører nu din rejse'], AVOID: ['KØB NU!', 'Spar X%!', 'Begrænset tilbud!'] },
    visual:   'Calm hover state, composed purchase confirmation, no countdown timers',
    timing:   'Purchase confirmation: 200ms, no urgency animation',
  },
  COLLECTION: {
    tone:     'Quiet pride — a record of accumulated choices, not a trophy case',
    language: { PREFER: ['Din samling', 'Hvad fortæller din loadout?', 'Dit udtryk'], AVOID: ['Lås op for den ULTIMATIVE loadout!', 'Saml dem alle!'] },
    visual:   'Calm preview, composition-focused layout, rarity reads quietly',
    timing:   'Equip/unequip: 150ms, legendary equip may have a brief 300ms ceremonial pause',
  },
  LEADERBOARD: {
    tone:     'Respectful prestige — others\' progress is visible but not weaponized against the viewer',
    language: { PREFER: ['Klasserangering', 'Dit niveau', 'Andres fremgang'], AVOID: ['Du er #47 ud af 50!', 'Indhent dem nu!', '🔥 Top 10!'] },
    visual:   'Tabular, calm, no animated rank movement, no "gap to next" pressure display',
    timing:   'No animated rank transitions — data is informational, not dramatic',
  },
  STREAKS: {
    tone:     'Gentle record — a note of consistency, never a threat',
    language: { PREFER: ['X dages besøg', 'Du har holdt dig konsistent'], AVOID: ['🔥 STREAK!', 'Ødelæg ikke din streak!', 'X dage — tab det ikke!'] },
    visual:   'Calm display without flame iconography if possible; never with countdown urgency',
    timing:   'No streak-break guilt animation or sad avatar state',
  },
  NAVIGATION: {
    tone:     'Composed spatial movement — the student moves through their learning space, not a game menu',
    language: { PREFER: ['Hub', 'Din rejse', 'Samling', 'Butik'], AVOID: ['SPIL NU!', 'GRIB DIN CHANCE!'] },
    visual:   'Subtle page transition (150ms fade or translate), no swipe-game energy',
    timing:   '120–180ms — responsive but not instantaneous enough to feel like a game',
  },
});

// ── Typography Rhythm ─────────────────────────────────────────────────────────
// Platform-wide type scale and spacing philosophy.
// These are principles for future consistency, not a breaking redesign mandate.

export const TYPOGRAPHY_RHYTHM = Object.freeze({
  SCALE_PHILOSOPHY: {
    principle: 'Typography hierarchy follows information hierarchy — not per-component intuition',
    levels: {
      DISPLAY:   { size: '20–24px', weight: 'bold',   use: 'Question text, level-up headline, modal headline' },
      TITLE:     { size: '16–18px', weight: 'bold',   use: 'Section headings, card titles, achievement names' },
      BODY:      { size: '14–16px', weight: 'normal', use: 'Body copy, option buttons, descriptions' },
      LABEL:     { size: '11–13px', weight: 'normal', use: 'XP labels, metadata, secondary info, captions' },
      MICRO:     { size: '9–11px',  weight: 'normal', use: 'Timestamp, rarity tag, supporting annotation' },
    },
  },
  SPACING_UNIT: {
    base: 8,
    principle: 'All spacing is a multiple of 8px — this creates visual rhythm across all pages',
    common: { xs: '4px', sm: '8px', md: '16px', lg: '24px', xl: '32px', xxl: '48px' },
    panel_padding: '16px (mobile) / 20–24px (desktop)',
    section_gap:   '12–16px between logical groups, 24–32px between major sections',
  },
  LINE_HEIGHT: {
    body:    1.5,
    compact: 1.3,
    note:    'Reading-heavy content uses 1.5 for sustained comfort. Interactive elements use 1.3.',
  },
  LABEL_TREATMENT: {
    caps_rule:  'Uppercase + letter-spacing (1px) is reserved for: section headers, rarity tags, system labels (not for body copy)',
    weight_rule: 'Bold is reserved for: numerical data, key identifiers, CTA copy (not for decorative emphasis)',
  },
  DENSITY_RULE: {
    principle: 'Information density should decrease as emotional importance increases',
    examples: [
      'A question card is spacious — the student\'s cognitive attention is there',
      'A leaderboard row is compact — it is reference information, not the focus',
      'A level-up overlay is maximally sparse — one number, one moment',
    ],
  },
});

// ── Transition Hierarchy ──────────────────────────────────────────────────────
// Platform-wide motion philosophy. Four tiers of transition weight.
// The tier determines visual emphasis and timing.

export const TRANSITION_HIERARCHY = Object.freeze({
  TIER_1_INSTANT: {
    duration:    '0–80ms',
    use:         'Button active states, input focus rings, toggle switches',
    feel:        'Immediate tactile response — the UI acknowledges the touch',
    NOT:         'Never for content changes — instant content swap feels like a bug',
  },
  TIER_2_RESPONSIVE: {
    duration:    '100–180ms',
    use:         'Button hover/background color, panel border highlights, icon transitions',
    feel:        'Responsive but calm — the interface is alive without being animated',
    easing:      'ease (0.25, 0.1, 0.25, 1.0) — standard comfort curve',
  },
  TIER_3_MEANINGFUL: {
    duration:    '250–400ms',
    use:         'Page transitions, modal open/close, XP bar fill, card reveal, answer flash',
    feel:        'Purposeful movement — the state change has weight, the eye follows it',
    easing:      'ease-out (0.0, 0.0, 0.2, 1.0) — arrives confidently, rests calmly',
  },
  TIER_4_CEREMONIAL: {
    duration:    '500ms–2000ms',
    use:         'Level-up overlay, achievement unlock, legendary item equip, first-time reveal',
    feel:        'The platform pauses with the student — the moment is marked',
    easing:      'Custom per-moment — never rushed, never performative',
    NOT:         'Overuse destroys ceremony — if everything is ceremonial, nothing is',
  },
  PAGE_NAVIGATION: {
    current_state: 'No transition — hard cut between pages',
    recommended:   '150ms opacity fade or 200ms translateY(8px) → translateY(0) on page content',
    rationale:     'The avatar breathes at 3500ms. A 150ms page fade feels composed by comparison. The hard cut currently breaks the platform\'s ambient calm.',
    implementation: 'CSS: body opacity 0 → 1 on DOMContentLoaded, 150ms ease-in. Or: navigation link adds fade-out class before href.',
  },
});

// ── Reward Language Philosophy ────────────────────────────────────────────────
// Replaces hype/excitement vocabulary with composed educational prestige language.
// Applied to: copy, visual hierarchy, interaction timing, animation style.

export const REWARD_LANGUAGE = Object.freeze({
  CORE_PRINCIPLE: 'Rewards confirm progress — they do not manufacture excitement',
  PRESTIGE_IS_QUIET: 'The most meaningful rewards feel like quiet confirmations, not prize announcements',
  ACCUMULATION_OVER_SPIKES: 'The satisfying feeling should come from accumulation over sessions — not from any single reward spike',

  HYPE_PATTERNS_REJECTED: [
    'Large animated numbers flying toward the user',
    'Sound design metaphors (implied by visual size/speed) of explosions',
    'Streak flame iconography that pressures maintenance',
    'Countdown timers on any reward offer',
    'Red notification badges demanding attention',
    'FOMO language ("limited", "ending soon", "don\'t miss")',
    'Comparative rank language framed as urgency ("you\'re almost in top 10!")',
  ],

  COMPOSED_PATTERNS_PREFERRED: [
    'XP number quietly increments in topbar (350ms ease)',
    'Breathing amplitude expands briefly on correct answer, returns to neutral',
    'Achievement toast: calm slide-in, 3s hold, fade — no sound implied by visual weight',
    'Level-up: warm ambient pulse, composed text, 400ms reveal — the student reads it, is not assaulted by it',
    'Coin earn: coin count updates in topbar — no dramatic animation needed for small amounts',
    'Legendary unlock: slow reveal (600ms), avatar ambient warm pulse — composure, not fireworks',
  ],

  COPY_VOCABULARY: {
    PROGRESS:  { PREFER: 'Fremgang', AVOID: 'Fremragende præstation' },
    CORRECT:   { PREFER: 'Rigtigt / Korrekt', AVOID: 'FANTASTISK! / PERFEKT!' },
    LEVEL_UP:  { PREFER: 'Niveau X nået', AVOID: 'LEVEL UP! 🎉' },
    STREAK:    { PREFER: 'X dages aktivitet', AVOID: '🔥 STREAK! Bevar den!' },
    PURCHASE:  { PREFER: 'Tilføjet til din samling', AVOID: 'KØB GENNEMFØRT! 🛒' },
    ACHIEVE:   { PREFER: 'Du har opnået: X', AVOID: '🏆 ACHIEVEMENT UNLOCKED!' },
    RANK:      { PREFER: 'Klasseposition: X', AVOID: '#X — indhent dem foran dig!' },
  },
});

// ── Modal & Notification Philosophy ──────────────────────────────────────────
// Governs all popups, overlays, toasts, banners, alerts, and interruptions.

export const MODAL_PHILOSOPHY = Object.freeze({
  CORE_RULE: 'Every notification must earn the right to interrupt the student\'s focus',

  INTERRUPT_BUDGET: {
    principle: 'The platform has a limited budget for interrupting the student. Spend it wisely.',
    HIGH_VALUE: ['Level-up milestone', 'First-time achievement unlock', 'Session completion'],
    MEDIUM_VALUE: ['Streak milestone (7/14/30 days only)', 'New cosmetic unlocked via progression'],
    LOW_VALUE: ['Individual achievement (quiet toast, no overlay)', 'Individual XP gain (topbar only)'],
    NO_INTERRUPT: ['Daily login', 'Streak count update', 'Shop item availability', 'Leaderboard position change'],
  },

  OVERLAY_RULES: {
    background:    'All overlays use var(--overlay) — theme-aware, never raw black',
    dismiss:       'All overlays are dismissible by tap/click outside — never trapped',
    auto_dismiss:  'Toast notifications auto-dismiss in 3–4s — no action required from student',
    z_index:       'Level-up overlay (1000) > achievement toast (900) > UI feedback (700) — clear hierarchy',
  },

  FORBIDDEN_PATTERNS: [
    'Popups that appear on page load without user action',
    'Notifications that cannot be dismissed',
    'Overlays that guilt the student ("Are you sure you want to leave?")',
    'Countdown timers in any overlay',
    'Multiple simultaneous overlays',
    '"Don\'t go" interstitials on navigation',
    'Streak-break guilt overlays',
    'Achievement spam (5+ toasts in 10 seconds)',
  ],

  TONE_RULE: 'A notification that could appear in a banking app is fine. A notification that could appear in a mobile casino is rejected.',
});

// ── Ecosystem Visual Language ─────────────────────────────────────────────────
// Shared compositional logic across all platform systems.
// The avatar set the visual standard — these rules extend it to the full product.

export const ECOSYSTEM_VISUAL_LANGUAGE = Object.freeze({
  SHARED_SHAPE_FAMILY: {
    border_radius: 'Cards: 12–16px. Buttons: 20px (pill). Tags: 8px. Avatar container: 8–10px. All from the arc-over-angle principle.',
    anti_pattern:  'Sharp 0px radius on interactive elements — too aggressive for this universe',
  },
  AMBIENT_PHILOSOPHY: {
    principle: 'Every container that holds meaningful content should have a subtle ambient presence — not a harsh hard border',
    practice:  'Cards use 1px border (var(--border)) + optional ambient box-shadow. Panels breathe.',
    anti_pattern: 'Flat color fills with no depth, like a generic form UI',
  },
  COLOR_RESTRAINT: {
    principle: 'Color carries meaning — it is not decoration',
    usage: {
      accent:   'Interactive affordance and current state — not structural decoration',
      coin:     'Economic value and earned reward — not general highlight color',
      success:  'Confirmed positive outcomes only — not brand color',
      error:    'System errors and incorrect state — not warnings or caution',
      text_dim: 'Secondary information — not for labels that carry primary meaning',
    },
  },
  INFORMATION_HIERARCHY: {
    principle: 'Every screen has one primary focal point. Secondary information supports; it does not compete.',
    QUIZ:       'Primary: question text. Secondary: avatar + progress. Tertiary: topbar.',
    HUB:        'Primary: avatar identity. Secondary: navigation. Tertiary: stats.',
    COLLECTION: 'Primary: avatar preview. Secondary: cosmetic grid. Tertiary: rarity filter.',
    SHOP:       'Primary: item grid. Secondary: coin balance. Tertiary: category filter.',
  },
  AVATAR_AS_CENTER: {
    principle: 'The avatar is the compositional anchor of the platform — every page should feel organized around the student\'s identity',
    HUB:       'Avatar is visually dominant — hub radiates outward from it',
    QUIZ:      'Avatar is present in identity strip — small but alive (breathing)',
    COLLECTION: 'Avatar is the primary content — all cosmetics exist to enhance it',
    SHOP:       'Items are presented as additions to the avatar\'s world — not independent products',
  },
});

// ── Long-Session Comfort ──────────────────────────────────────────────────────
// How the platform should feel after 20–40 minutes of continuous use.

export const LONG_SESSION_COMFORT = Object.freeze({
  FATIGUE_SOURCES: [
    'Repetitive reward animations that do not diminish — the 0.8s xpPop at question 100 should feel quieter than question 1',
    'High-contrast color in decision-making areas — the quiz card accent border is prominent; in long sessions it can cause eye-fatigue',
    'Breathing animation at 52px that becomes visible as visual noise if the user is not focused on the avatar',
    'Achievement toasts appearing after long uninterrupted sessions — timing feels off when the student is in flow',
  ],
  COMFORT_PRINCIPLES: [
    'Motion should decrease in perceived intensity over a long session — not literally, but through pacing',
    'Color should not fight for attention — the theme system\'s warm neutrals are the long-session default, not the bright accents',
    'Reward acknowledgment should feel proportional to session length — a correct answer at minute 40 deserves the same calm response as minute 1',
    'The student should never feel anxious about closing the app — no "don\'t go" energy, no guilt for stopping',
  ],
  SUSTAINABLE_ENGAGEMENT: {
    principle:    'The goal is that the student wants to return tomorrow — not that they cannot stop today',
    mechanism:    'Calm, consistent rewards that compound over time. Not escalating dopamine spikes that require the next hit.',
    design_test:  'A student who has used the platform for 30 minutes should feel satisfied and at ease — not wired or drained',
  },
});

// ── Future Educational Universe ───────────────────────────────────────────────
// How platform coherence scales into a complete long-term educational ecosystem.

export const FUTURE_UNIVERSE = Object.freeze({
  FRANCHISE_COHERENCE: {
    principle:  'Every system added in the future must feel like it was always part of this world',
    test:       'If a new feature could exist in Duolingo, Clash of Clans, OR DEN SEJE APP — it needs redesigning',
    target:     'A feature should only be possible in DEN SEJE APP\'s specific educational prestige universe',
  },
  AUDIO_PHILOSOPHY: {
    principle:  'If audio is ever added, it must follow the same restraint principles as the visual system',
    guidance: [
      'Correct answer: a single calm tone, not a fanfare',
      'Level-up: a warm, resolved chord — not a game-show sting',
      'Achievement: a brief, pleasant sound — not an announcement',
      'Background: ambient educational environment, not game soundtrack',
      'Forbidden: applause sounds, explosion sounds, crowd sounds, alarm sounds',
    ],
  },
  CLASSROOM_INTEGRATION: {
    principle:  'The platform must remain comfortable for use in a classroom setting — projected on a whiteboard or shared screen',
    test:       'Would a teacher be comfortable displaying this feature in front of 25 students?',
    implications: [
      'No leaderboard that publicly shames low-performing students',
      'No reward animations that distract the class during instruction',
      'No achievement toasts that reveal embarrassing performance data',
      'Teacher-safe default states for all public-display scenarios',
    ],
  },
  SCALABLE_PRESTIGE: {
    principle:  'The prestige language (grey → green → blue → warm gold) must remain meaningful at 10× the current number of items',
    risk:       'Rarity inflation — adding too many legendary items devalues the tier',
    solution:   'Hard caps on legendary distribution, plus a prestige tier above legendary (if needed) that uses compositional restraint rather than more VFX',
  },
  LONG_TERM_TONE_STABILITY: {
    principle:  'The platform\'s emotional register in year 5 should be recognizably the same as year 1',
    risk:       'Tone drift through feature accumulation — each individual addition seems fine, but the aggregate feels different',
    prevention: 'EMOTIONAL_TONE_CONTRACT is reviewed at the start of every major feature addition cycle',
  },
});

// ── Platform Coherence Test ───────────────────────────────────────────────────
// Ten questions to ask before shipping any new platform feature.
// Supplements the avatar-level COHERENCE_TEST from avatar-identity.js.

export const PLATFORM_COHERENCE_TEST = Object.freeze([
  'Does this feel like it belongs to the same world as the quiz game, the hub, and the avatar?',
  'Would a teacher feel comfortable with this feature projected in a classroom?',
  'After 40 minutes of use, does this feature still feel calm and non-fatiguing?',
  'Is the copy language in this feature consistent with EMOTIONAL_TONE_CONTRACT?',
  'Does this feature\'s transition timing fit within the four tiers of TRANSITION_HIERARCHY?',
  'Does this feature create urgency, FOMO, or guilt — even subtly?',
  'Is the information hierarchy clear — one primary focal point, supports and does not compete?',
  'Does the avatar feel like the natural center of this feature, or has it been displaced?',
  'Could this feature exist unmodified in a mobile casino, a gaming app, or an esports platform? If yes, redesign.',
  'Will this feature feel like a natural part of this world in three years — or will it look dated and out of place?',
]);
