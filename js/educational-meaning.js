// ── Educational Meaning Architecture v1 ──────────────────────────────────────
// Defines the philosophical, emotional, and symbolic meaning behind progression,
// prestige, rewards, mastery, and long-term growth across DEN SEJE APP.
//
// PHILOSOPHY: Stimulation without meaning is hollow. The platform must answer
// not just "how does progression work?" but "what does it MEAN to grow here?"
//
// This file answers: WHAT IS THE SOUL OF THIS EDUCATIONAL UNIVERSE?
//
// Complements the platform ecosystem files:
//   platform-coherence.js  — HOW THE PLATFORM FEELS AS ONE THING
//   avatar-continuity.js   — HOW THE CHARACTER PERSISTS
//   avatar-identity.js     — WHO THE CHARACTER IS
//
// All future mechanics, systems, and copy decisions should be evaluated against
// the meaning architecture defined here. If a system cannot answer "what does
// this teach about learning?", it does not belong in this universe.

// ── Meaning Audit ─────────────────────────────────────────────────────────────
// What the current progression systems implicitly communicate — and the gap
// between what they say and what an educational platform should say.

export const MEANING_AUDIT = Object.freeze({
  XP: {
    current_signal:   'Accumulation — more XP means more time invested',
    intended_signal:  'Knowledge engagement — XP marks moments of genuine intellectual contact',
    risk:             'If XP is too easy, it signals that showing up matters more than thinking. Grinding without understanding.',
    audit:            'XP should flow from demonstrated knowledge (correct answers, engaged attempts) — never from pure presence.',
    verdict:          'ALIGNED — XP is awarded per answer attempt, not per time-on-platform',
  },
  LEVELS: {
    current_signal:   'Progress marker — a number that increases',
    intended_signal:  'Journey notation — a quiet record of sustained engagement with learning',
    risk:             'Levels become hollow when the number is the goal. "Level 50" should feel different from "level 5" not because of power, but because of depth.',
    audit:            'Level-up language and framing must reinforce journey, not achievement of a target number.',
    verdict:          'PARTIAL RISK — level-up overlay currently reads as celebration, not as journey notation',
  },
  COINS: {
    current_signal:   'Currency — earned, spent, accumulated',
    intended_signal:  'Expressive capacity — coins represent the student\'s ability to shape their identity',
    risk:             'If coins feel like a grind resource, the shop becomes a casino. If they feel like creative capacity, the shop becomes a studio.',
    audit:            'Coin earn pacing and shop framing must reinforce expression, not extraction.',
    verdict:          'PARTIAL RISK — coin economy framing needs meaning-layer in shop context',
  },
  COSMETICS: {
    current_signal:   'Visual customisation — the avatar looks different',
    intended_signal:  'Identity authorship — the student makes visible choices about who they are in this learning space',
    risk:             'Cosmetics become hollow completionism if they feel like items to collect rather than choices to make.',
    audit:            'Each cosmetic should feel like a statement, not a checkbox.',
    verdict:          'MOSTLY ALIGNED — symbolic motif system ensures cosmetics carry visual meaning',
  },
  ACHIEVEMENTS: {
    current_signal:   'Milestones — things the student has done',
    intended_signal:  'Reflective markers — moments where a pattern of effort becomes visible',
    risk:             'Achievement spam creates noise. If every small action has an achievement, nothing feels meaningful.',
    audit:            'Achievements should mark genuine patterns, not individual events. "Answered 100 questions" is a pattern. "Answered a question" is not.',
    verdict:          'MOSTLY ALIGNED — achievement system is milestone-based, not micro-event-based',
  },
  STREAKS: {
    current_signal:   'Consistency — the student came back',
    intended_signal:  'Rhythm — the student has found a sustainable learning cadence',
    risk:             'Streaks become anxiety when breaking them feels like loss. The student should feel proud of a streak, never afraid of losing it.',
    audit:            'Streak framing must celebrate the rhythm without threatening its absence.',
    verdict:          'RISK — streak display and streak-break handling must be audited for guilt-pressure energy',
  },
  RARITY: {
    current_signal:   'Scarcity — this item is less common',
    intended_signal:  'Depth of commitment — legendary items represent extraordinary sustained investment in this learning journey',
    risk:             'Rarity without meaning is casino psychology. "Rare because few have it" is shallow. "Rare because it represents something earned" is meaningful.',
    audit:            'Legendary items must feel earned through mastery, not bought with accumulated grind currency.',
    verdict:          'PARTIAL RISK — rarity as visual hierarchy is coherent; rarity as earned meaning needs explicit framing',
  },
  LEADERBOARD: {
    current_signal:   'Comparison — where the student ranks among peers',
    intended_signal:  'Context — a sense of the learning community, not a competition',
    risk:             'Leaderboards become toxic when rank is the goal. The goal is learning; rank is incidental.',
    audit:            'Leaderboard framing must present position as information, not as verdict on the student\'s worth.',
    verdict:          'RISK — leaderboard is the system most vulnerable to misread as dominance hierarchy',
  },
});

// ── Prestige Philosophy ───────────────────────────────────────────────────────
// What prestige truly means in DEN SEJE APP's universe.
// The antithesis of power fantasy progression.

export const PRESTIGE_PHILOSOPHY = Object.freeze({
  DEFINITION: 'Prestige in this universe is not the assertion of superiority — it is the visible evidence of sustained curiosity.',

  WHAT_PRESTIGE_IS: {
    COMPOSED_MASTERY:    'The student has found their footing. They are not anxious or hurried. They engage with questions from a place of settled confidence.',
    THOUGHTFUL_PERSISTENCE: 'The student has stayed. Not because of compulsion, but because the act of learning has become intrinsically rewarding.',
    EDUCATIONAL_MATURITY: 'The student has learned not just facts, but how to learn. They approach unknown questions with curiosity rather than anxiety.',
    SUSTAINED_CURIOSITY: 'The student still asks "why" at level 200. Prestige has not replaced the drive to understand — it has deepened it.',
    IDENTITY_REFINEMENT: 'The student\'s loadout is not a trophy case but a self-portrait. Each item reflects a genuine choice about how they want to appear in their learning space.',
  },

  WHAT_PRESTIGE_IS_NOT: {
    NOT_power:        'The legendary-tier student is not more powerful than the common-tier student. They know more, but that knowledge is not a weapon.',
    NOT_superiority:  'High prestige is not permission to look down on others. It is simply a more complete expression of the same educational journey.',
    NOT_dominance:    'The leaderboard top position is not a throne. It is a position in a shared learning journey that anyone can be in at any time.',
    NOT_status_trap:  'Prestige should never feel like something to protect or defend. It accumulates quietly and means nothing outside this learning space.',
  },

  VISUAL_LANGUAGE: {
    principle:  'Prestige is communicated through compositional authority, not visual loudness',
    common:     'Upright presence — "beginning here is already composed"',
    legendary:  'Warm gold ambient, maximum compositional weight, full symbolic vocabulary — "quiet excellence, announcement-free"',
    transition: 'Each tier adds presence, not noise. The legendary student\'s avatar is more complete, not more spectacular.',
  },

  PACING_PRINCIPLE: {
    principle:  'Prestige should feel like it accumulates at the pace of real learning — neither too fast (hollow) nor too slow (frustrating)',
    test:       'A student who has genuinely engaged with the platform for three months should be able to feel their progression is real — not arbitrary and not gated by grind',
  },
});

// ── Mastery Language ──────────────────────────────────────────────────────────
// What mastery looks and feels like in this educational universe.

export const MASTERY_LANGUAGE = Object.freeze({
  DEFINITION: 'Mastery here is not the elimination of difficulty — it is the development of a stable, curious relationship with difficulty.',

  QUALITIES: {
    CLARITY:          'The student can articulate what they know and why they know it. Not recitation — genuine understanding.',
    CALM_CONFIDENCE:  'The student approaches hard questions without anxiety. Not because they know they will be right, but because they know they can think.',
    STABLE_UNDERSTANDING: 'The student\'s knowledge is resilient — it holds under pressure, connects across domains, and deepens with use.',
    THOUGHTFUL_CAPABILITY: 'The student can do things with their knowledge — apply, question, extend, transfer.',
    RESILIENCE:       'The student treats wrong answers as information, not as verdicts. This is the most important mastery quality.',
    INTELLECTUAL_STEADINESS: 'The mastered student is not easily destabilised by hard questions. Their equanimity is earned, not performed.',
  },

  ANTI_PATTERNS: {
    NOT_aggression:         'Mastery does not make the student competitive toward others or the material.',
    NOT_overconfidence:     'The mastered student knows the limits of their knowledge. They remain curious about what they don\'t know.',
    NOT_perfectionism:      'Mastery is not 100% correct answers. It is a reliable, growing relationship with the subject.',
    NOT_optimization_obsession: 'The mastered student does not try to game the system for maximum XP per minute. They are present with the material.',
  },

  HOW_THE_SYSTEM_REINFORCES_MASTERY: {
    CORRECT_ANSWER:   'A small, calm acknowledgment. The student demonstrated knowledge — this is noted, not celebrated explosively.',
    INCORRECT_ANSWER: 'The correct answer is shown. The student receives information. There is no shame, no punishment, no emotional pressure.',
    PROGRESSION:      'Levels and XP accumulate quietly. The student does not need to chase them — they are a natural by-product of engagement.',
    LEGENDARY_ITEMS:  'The highest-rarity items are not locked behind perfection. They represent depth of engagement, not flawless performance.',
  },
});

// ── Resilience Contract ───────────────────────────────────────────────────────
// What mistakes mean in this universe. The most important design document
// for psychological safety in an educational platform.

export const RESILIENCE_CONTRACT = Object.freeze({
  CORE_PRINCIPLE: 'A wrong answer is information. It is never a verdict on the student\'s intelligence, worth, or potential.',

  WHAT_MISTAKES_MEAN: {
    ITERATION:    'The student tried one path; the system showed them another. This is how learning works.',
    EXPLORATION:  'The student engaged with genuine uncertainty. That engagement is more valuable than a correct guess.',
    PERSISTENCE:  'The student is still here, still trying. That is the most important signal the system should read.',
    LEARNING_RHYTHM: 'Mistakes and corrections create the alternating pattern of productive struggle that constitutes real learning.',
    GROWTH_THROUGH_EFFORT: 'The student who answers incorrectly and then correctly has learned more than the student who answered correctly once.',
  },

  SYSTEM_BEHAVIOR_ON_MISTAKE: {
    AVATAR:         'Avatar briefly enters FOCUSED breathing state — attentive, not distressed. Returns to NEUTRAL in 1200ms.',
    FEEDBACK_TEXT:  'Shows the correct answer. No emotional language. "Svaret var X" — informational, not judgmental.',
    PROGRESSION:    'No XP deduction. No coin penalty. No streak impact for a single wrong answer.',
    UI_ENERGY:      'The shake animation is brief and mechanical — communicates "that path is closed" not "you have failed".',
    TONE:           'The platform does not perform disappointment. It presents the next question.',
  },

  FORBIDDEN_MISTAKE_RESPONSES: [
    'Avatar shows a sad or disappointed expression',
    'Feedback text includes "Øv!", "Desværre!", or emotional exclamations',
    'Sound design (if ever added) that implies failure (sad trombone, buzz)',
    'Streak counter visibly decreasing with animation that draws the eye',
    'Pop-up that says "don\'t give up!" — this implies the student was considering giving up',
    'Any visual that lingers on the wrong state — the incorrect answer should quickly give way to the correct one',
    'Reduced XP earn on retry — this punishes persistence, the most valuable learning behavior',
  ],

  STREAK_RESILIENCE: {
    principle:    'A broken streak is an invitation to return, not a punishment for absence',
    framing:      '"Din aktivitets-rytme starter igen fra i dag" not "Du mistede din 14-dages streak 😢"',
    no_countdown: 'No UI element shows how much time the student has before their streak breaks',
    no_pressure:  'The platform does not know the student\'s schedule. It does not know if their absence was due to illness, crisis, or choice. It treats all returns the same: welcome.',
  },
});

// ── Collection & Cosmetic Meaning ─────────────────────────────────────────────
// What collections symbolize beyond ownership and visual customisation.

export const COLLECTION_MEANING = Object.freeze({
  DEFINITION: 'A collection is a self-portrait of a learning journey, not a trophy case.',

  WHAT_COLLECTIONS_REPRESENT: {
    PERSONAL_HISTORY:    'The student\'s loadout reflects the time they spent here, the choices they made, the aesthetic they developed',
    IDENTITY_EXPRESSION: 'Cosmetics are not rewards for performance — they are materials for identity authorship',
    SYMBOLIC_MILESTONES: 'A rare item in the collection marks a moment in the learning journey — not a score achieved, but a commitment demonstrated',
    CURIOSITY_TRAILS:    'The breadth of a collection reflects intellectual range. A student who has items from multiple categories has explored multiple dimensions of their identity here.',
    EDUCATIONAL_MEMORIES: 'In a healthy collection system, items evoke memories of the learning journey — "I got this when I was in my mathematics phase"',
  },

  WHAT_COLLECTIONS_ARE_NOT: {
    NOT_completion_addiction: 'The student should never feel compelled to "complete" the collection. An incomplete collection is a future to explore, not a failure.',
    NOT_ownership_flexing:    'Rare items are not status signals toward other students. They are personal resonances within the student\'s own identity.',
    NOT_hoarding_psychology:  'The platform must not create the psychological urgency to acquire everything before it disappears.',
    NOT_FOMO:                 'No item is ever "limited" in a way that creates anxiety. Aspiration is fine; pressure is not.',
  },

  LEGENDARY_MEANING: {
    principle:   'A legendary item should feel like a symbol of something true about the student\'s learning journey — not merely a rare commodity',
    visual:      'Warm gold ambient, maximum compositional authority, full symbolic vocabulary — the student has reached a level of visual identity that required sustained commitment',
    emotional:   'Equipping a legendary item should feel like putting on something that fits — not like displaying a trophy',
    wrong_frame: '"I finally got the legendary cape" — ownership language',
    right_frame: '"This is what my avatar looks like now" — identity language',
  },

  COSMETIC_CATEGORIES_AS_MEANING: {
    CROWN:        'Intellectual aspiration — the student places something above their thinking, symbolizing what they reach toward',
    CAPE:         'Protection and movement — the student carries their learning journey with them',
    ARMOR:        'Resilience — the student has developed a protective relationship with difficulty',
    AURA:         'Environmental presence — the student\'s intellectual engagement has begun to affect the space around them',
    GLASSES:      'Clarity and discernment — the student has developed sharper ways of seeing',
    BACK_ITEM:    'Expressive extension — the student reaches beyond their immediate form',
    FACE_ITEM:    'Presentation — how the student chooses to meet the world in this learning space',
  },
});

// ── Long-Term Growth Philosophy ───────────────────────────────────────────────
// What long-term educational growth should feel like emotionally and symbolically.

export const LONG_TERM_GROWTH = Object.freeze({
  DEFINITION: 'Growth here is not inflation — it is deepening. The student at level 300 is not a more powerful version of the level 1 student; they are a more settled, more capable, more expressive version.',

  GROWTH_QUALITIES: {
    CALMER:              'Long-term students approach questions with less anxiety. The platform has taught them that uncertainty is temporary.',
    MORE_COMPOSED:       'The student has developed a stable relationship with difficulty. They do not rush, do not panic, do not give up easily.',
    MORE_CAPABLE:        'The student can do things with knowledge they could not do before — apply, transfer, question.',
    MORE_EXPRESSIVE:     'The student\'s loadout and aesthetic choices have become more intentional. They know what they want to look like here.',
    MORE_CONFIDENT:      'Confidence that is earned through demonstrated capability — not asserted through rank or rarity.',
    MORE_SYMBOLICALLY_REFINED: 'The long-term student\'s visual identity is more complete, more considered, more coherent. Their cosmetic choices tell a clearer story.',
  },

  GROWTH_CURVE_PHILOSOPHY: {
    principle:   'Growth should feel like a deepening curve, not an escalating one',
    early:       'Early growth is fast and visible — every session adds something new. This is the "discovery phase".',
    middle:      'Middle growth slows visually but deepens qualitatively — the student knows more, feels more capable.',
    long_term:   'Late growth is quiet — the student has found their rhythm. New cosmetics and levels arrive as natural companions, not as targets.',
    anti_pattern: 'Escalating curves that require more and more effort for the same visible progress — this is grind psychology',
  },

  ANTI_ESCALATION: {
    principle:   'The platform must not require the student to invest more emotional energy over time to maintain the same level of satisfaction',
    test:        'A student at level 200 should find the quiz as intrinsically engaging as they did at level 1 — not because of novelty, but because of quality',
    mechanism:   'The quality of the questions, the calm of the interface, and the meaning of the progression all remain constant. There is no content cliff.',
  },
});

// ── Intrinsic Motivation Architecture ────────────────────────────────────────
// Systems that reinforce curiosity, mastery satisfaction, and self-recognition
// rather than external reward chasing.

export const INTRINSIC_MOTIVATION = Object.freeze({
  DISTINCTION: {
    EXTRINSIC: 'The student learns to get XP, coins, cosmetics, and streaks. Remove the rewards and they stop.',
    INTRINSIC:  'The student learns because the act of understanding is satisfying. The rewards are pleasant acknowledgments, not the reason.',
  },

  RISK_ASSESSMENT: {
    current:    'The platform currently has well-designed extrinsic rewards (XP, coins, cosmetics). The risk is that these become the primary motivation, crowding out intrinsic drive.',
    mitigation: 'Extrinsic rewards must be calibrated to acknowledge without overwhelming. They should feel like a note in the margin — "you did a thing" — not the main event.',
  },

  INTRINSIC_SUPPORT_SYSTEMS: {
    QUESTION_QUALITY: {
      principle: 'If the questions are genuinely interesting, the student wants to know the answer before they know what XP they\'ll earn',
      design:    'Question design is the most powerful intrinsic motivation lever in the platform — more powerful than any reward system',
    },
    FEEDBACK_AS_LEARNING: {
      principle: 'The correct answer display after an incorrect response is intrinsically motivating if it is genuinely informative',
      design:    'Review feedback should feel like a small revelation, not a correction',
    },
    CALM_PERSISTENCE: {
      principle: 'A calm, non-pressured interface supports the student\'s ability to stay in a curious, engaged state',
      design:    'Every anxious element in the UI (streak countdowns, rank pressure, reward urgency) crowds out intrinsic focus',
    },
    IDENTITY_INVESTMENT: {
      principle: 'When the student has made genuine aesthetic choices about their avatar, they are more intrinsically invested in the learning space',
      design:    'Cosmetic expression is not a luxury — it is an intrinsic motivation mechanism that creates ownership',
    },
    PROGRESS_VISIBILITY: {
      principle: 'Seeing genuine progress is intrinsically satisfying — but only if the progress feels real',
      design:    'XP and levels must feel proportional to genuine engagement, not mechanical accumulation',
    },
  },

  CROWDING_OUT_RISKS: [
    'Too-frequent reward animations interrupt the student\'s cognitive flow, breaking intrinsic engagement',
    'Extrinsic rewards for every small action (micro-rewards) train the student to expect payment for every thought',
    'Streak pressure converts an intrinsic rhythm (regular learning) into an extrinsic obligation (don\'t break the streak)',
    'Leaderboard prominence makes comparison the default lens, replacing personal growth with relative ranking',
  ],
});

// ── Educational Worldview ─────────────────────────────────────────────────────
// The deeper worldview of the platform. The educational soul.

export const EDUCATIONAL_WORLDVIEW = Object.freeze({
  ADMIRED_LEARNER: {
    description:  'The learner this universe admires is not the fastest, the most correct, or the highest-ranked. It is the student who remains curious in the face of difficulty and returns after absence.',
    qualities:    ['Persistent without being compulsive', 'Curious without being anxious', 'Confident without being arrogant', 'Reflective without being self-critical'],
    NOT:          ['The student who grinds for XP', 'The student who optimises for rank', 'The student who collects without engaging', 'The student who learns to win, not to understand'],
  },

  MEANINGFUL_PROGRESS: {
    description:  'Progress that matters here is not the accumulation of metrics — it is the development of a stable, curious, capable relationship with learning itself.',
    visible_in:   ['Greater ease with unfamiliar questions', 'More considered aesthetic choices in the collection', 'Calmer engagement with difficult material', 'A sense of familiar comfort with the learning space'],
    NOT_visible_in: ['A higher number', 'A rarer item', 'A better rank', 'A longer streak'],
  },

  ENCOURAGED_QUALITIES: {
    CURIOSITY:     'The desire to understand is more valuable than the desire to be right',
    PERSISTENCE:   'Returning after failure is more valuable than never failing',
    REFLECTION:    'Understanding why you were wrong is more valuable than avoiding wrong answers',
    EQUANIMITY:    'Engaging with difficulty from a place of calm is a learnable skill, not a personality trait',
    EXPRESSION:    'Making genuine aesthetic choices is a form of self-knowledge',
  },

  WHAT_WISDOM_LOOKS_LIKE: {
    description:  'In this universe, wisdom is not a high level or a legendary loadout. It is a quality of engagement.',
    signals:      ['Approaching questions with genuine curiosity rather than performance anxiety', 'Making aesthetic choices that feel true rather than impressive', 'Finding the platform\'s calm more nourishing than its rewards', 'Understanding that being wrong is the most efficient path to being right'],
  },

  WHAT_MAKES_SOMEONE_LEGENDARY: {
    description:  'The legendary student in this universe is not the one with the most XP. They are the one who has built a sustainable, meaningful relationship with learning.',
    evidence:     ['They are still curious at level 200', 'Their loadout reflects genuine aesthetic development, not just accumulated items', 'They engage with difficult questions without anxiety', 'They do not need the platform\'s rewards to feel that learning is worthwhile'],
    NOT:          'The student with the most hours, the best rank, or the most complete collection',
  },
});

// ── Anti-Addiction Architecture ───────────────────────────────────────────────
// Explicit design commitments that prevent the platform from developing
// psychologically exploitative mechanics over time.

export const ANTI_ADDICTION = Object.freeze({
  CORE_COMMITMENT: 'DEN SEJE APP will never use psychological compulsion mechanisms, even if they would demonstrably increase engagement metrics.',

  FORBIDDEN_MECHANICS: {
    VARIABLE_RATIO_REWARDS: 'No "slot machine" reward timing — rewards are earned predictably, not randomly',
    LOSS_AVERSION:          'No mechanics that make the student fear losing what they have accumulated',
    ARTIFICIAL_SCARCITY:    'No "limited time" items or urgency-based purchase pressure',
    SOCIAL_COMPARISON_PRESSURE: 'No mechanics that weaponize the student\'s rank against them',
    SUNK_COST_EXPLOITATION: 'No mechanics that make the student feel trapped by their accumulated investment',
    INCOMPLETE_LOOPS:       'No deliberately incomplete collections designed to pull the student back compulsively',
    GUILT_MECHANICS:        'No systems that make the student feel guilty for not using the platform',
  },

  HEALTHY_ENGAGEMENT_MARKERS: [
    'The student can stop at any moment without feeling they are losing something',
    'The student can return after a long absence without anxiety',
    'The student\'s motivation to use the platform increases over time due to genuine capability growth',
    'The student would recommend the platform to others based on what they learned, not on how rewarding the reward loop is',
    'A parent or teacher watching the student use the platform sees focused, calm engagement — not compulsive checking',
  ],

  CLASSROOM_ETHICS: {
    principle:   'The platform must be ethically appropriate for use in a school context, with a teacher and 25 students',
    implications: [
      'No content that could embarrass a student in front of peers',
      'No mechanics that create visible status hierarchies between classmates',
      'No pressure timing that disrupts the classroom lesson rhythm',
      'Teacher-comfortable default states for all projected scenarios',
    ],
  },
});

// ── Future Educational Universe Ethics ────────────────────────────────────────
// How the meaning architecture scales into a psychologically healthy long-term
// educational ecosystem.

export const FUTURE_ETHICS = Object.freeze({
  LONG_TERM_SUSTAINABILITY: {
    principle:  'The platform should be as psychologically healthy in year 5 as in year 1',
    test:       'A student who has used the platform for three years: do they feel enriched, or depleted? Curious, or habituated? Growing, or grinding?',
    mechanism:  'Meaning architecture is reviewed at every major feature addition — not just coherence and identity, but "does this support genuine educational growth?"',
  },
  EDUCATIONAL_DIGNITY: {
    principle:  'Every student deserves to feel that their progress here reflects genuine intellectual engagement — not just time invested',
    implication: 'Anti-grind architecture: the platform\'s rewards must feel meaningful because they are earned through genuine engagement, not because they are engineered to feel rewarding through psychological tricks',
  },
  TEACHER_TRUST: {
    principle:  'Teachers who recommend DEN SEJE APP to students are making a professional judgment about the platform\'s educational integrity',
    obligation: 'The platform must honor that trust by maintaining psychological safety, educational meaning, and anti-manipulation design as non-negotiable properties',
  },
  SYMBOLIC_HEALTH: {
    principle:  'The symbolic vocabulary of the platform (prestige, mastery, rarity, achievement) must remain educationally legible in year 5',
    risk:       'Symbol inflation: if every new feature adds another prestige tier or achievement category, the symbols lose meaning',
    prevention: 'The meaning architecture is a constraint on feature development — not just a philosophy document',
  },
});

// ── Educational Meaning Test ──────────────────────────────────────────────────
// Nine questions to ask about any system, mechanic, or design decision.
// The platform passes if all nine answers are honest yeses.

export const MEANING_TEST = Object.freeze([
  'Can a student articulate what this system is teaching them about learning — not just what it is rewarding them for?',
  'Would a student who stopped using this platform tomorrow feel that the time they invested here made them a more capable learner?',
  'Does this mechanic support intrinsic motivation, or does it crowd it out?',
  'If all extrinsic rewards were removed, would the core learning experience still be worth doing?',
  'Would a parent, upon seeing this mechanic, feel comfortable with their child spending time on it?',
  'Does this system make the student feel respected — as a learner and as a person?',
  'Is the meaning of this system legible: could the student explain what it represents, not just how it works?',
  'Would this system, in five years of use, still be building something valuable — or would it have exhausted its meaning?',
  'Does this pass the classroom ethics test: would a teacher showing this on a whiteboard feel proud of what the platform is communicating?',
]);
