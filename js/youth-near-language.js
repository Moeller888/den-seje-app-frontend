// Section 53 — Youth-Near Language & Cognitive Energy Rewrite Pass
//
// Core principle: HIGH REFLECTION + LOW LANGUAGE FRICTION.
// Students should struggle with IDEAS — not with sentence decoding.
//
// This is NOT:
//   - lowering intellectual quality
//   - removing nuance
//   - simplifying ideas into trivia
//   - using fake youth slang
//   - entertainmentification
//
// The goal is deep thinking in cognitively breathable language.

export const YOUTH_NEAR_PHILOSOPHY = {
  core: 'High reflection + low language friction',
  target: '7.–9. class students — challenged by thinking, not by text-decoding',
  anti_pattern: 'Academic prose that creates the illusion of depth through density',
  goal: 'The platform should feel intelligent, clear, human, conversational, reflective, mentally energizing',
  forbidden: 'Fake youth slang, childish tone, flattenend nuance, oversimplified ideas',
  standard: 'Easy to enter — difficult to think through',
};

// Audit findings: the 9 primary language problems in the original content.
export const AUDIT_FINDINGS = [
  {
    id: 'abstract_stem_framing',
    name: 'Abstrakt spørgsmålsstamme',
    count: 8,
    description: 'Stems that begin with abstract institutional concepts rather than human situations',
    examples: [
      'Hvad er den primære kilde til politisk legitimitet i et moderne demokrati?',
      'Hvad er civilsamfundets vigtigste demokratiske funktion?',
      'Hvad er demokratiets dilemma med domstolsprøvelse af lovgivning?',
    ],
    fix: 'Ground in concrete human situation or recognizable dynamic',
  },
  {
    id: 'named_academic_opener',
    name: 'Navngivet akademisk åbner',
    count: 4,
    description: 'review_text that opens by naming Weber, Tocqueville, or similar — cold academic entry point',
    examples: [
      'Max Weber identificerede tre typer legitimitet...',
      'Max Weber adskillede legalitet og legitimitet...',
      'Tocqueville observerede i 1830\'ernes USA...',
      'Tocqueville beundrede amerikanske foreninger...',
    ],
    fix: 'Open with the concrete observation or the human tension — name the thinker later or not at all',
  },
  {
    id: 'bloated_correct_option',
    name: 'Oppustet korrekt svaroption',
    count: 6,
    description: 'Correct options exceeding 18 words — creates reading fatigue and scan-skipping of distractors',
    worst_case: 'Menneskerettigheder gælder alle mennesker i kraft af at være mennesker — borgerrettigheder gives og håndhæves af specifikke stater over for deres borgere (28 words)',
    fix: 'Cut to core distinction. 10–14 words. Use em-dash for two-part answers.',
  },
  {
    id: 'academic_jargon_stem',
    name: 'Akademisk jargon i stamme',
    count: 5,
    description: 'Technical terms in question stems that require prior domain knowledge to parse',
    examples: [
      '"skalere dårligt til moderne nationalstater"',
      '"den mest præcise måde sociale medier strukturelt svækker demokratisk deliberation"',
      '"det stærkeste strukturelle argument for tidsbegrænsning af politiske embeder"',
    ],
    fix: 'Replace with the question a curious student would actually ask',
  },
  {
    id: 'compound_named_stem',
    name: 'Sammensat navngivet stamme',
    count: 2,
    description: 'Stems that name the theorist AND embed a dual question (is it X or Y?)',
    examples: [
      'Hvad er Tocquevilles "flertallets tyranni" — og er det primært et juridisk eller socialt fænomen?',
    ],
    fix: 'Strip the name, strip the dual structure, ask the underlying human question directly',
  },
  {
    id: 'blame_framing',
    name: 'Skyldframing',
    count: 1,
    description: 'Stems that implicitly blame the student\'s demographic group before asking the question',
    examples: [
      'Hvad er den mest strukturelt præcise forklaring på udbredt politisk apati?',
    ],
    fix: 'Reframe as genuine inquiry: "Er det egentlig deres skyld?" opens the systemic explanation without pre-judging',
  },
  {
    id: 'cold_hypothesis_opener',
    name: 'Kold hypotese-åbner',
    count: 3,
    description: 'review_text openings that start with an abstract hypothesis or definitional statement',
    examples: [
      'Repræsentativt demokrati hviler på en antagelse: at valgte repræsentanter...',
      'EU-regulering vedtages af institutioner der er demokratisk legitimerede men...',
      'Lobbyisme er ikke ét fænomen.',
    ],
    fix: 'Open with the tension, the surprise, or the human situation — not the institutional description',
  },
  {
    id: 'embedded_clause_sentence',
    name: 'Indlejret bisætningssætning',
    count: 1,
    description: 'Single sentences with 2+ nested clauses and double negation — high working-memory cost',
    examples: [
      'En revolutionær der skal administrere et imperium opdager hurtigt at imperiet ikke administreres på andre måder end dem der eksisterede.',
    ],
    fix: 'Break at natural pause. Use colon to create rhythmic landing. Remove double negation.',
  },
  {
    id: 'terminology_inconsistency',
    name: 'Terminologisk inkonsistens',
    count: 1,
    description: 'Question stem uses different term than the options for the same concept',
    examples: [
      'Stem: "autonom leder" — Options: "autokrat"',
    ],
    fix: 'Align stem and options to same term. Prefer the more precise term.',
  },
];

// The canonical before/after pairs from this rewrite pass.
export const REWRITE_PAIRS = [
  {
    id: 'dp_004',
    type: 'question_stem',
    issue: 'abstract_stem_framing',
    before: 'Hvorfor er stemmedeltagelse et kollektivt anliggende snarere end et rent personligt valg?',
    after: 'Hvad sker der med demokratiet, når mange vælger ikke at stemme?',
    reasoning: 'The before-version asks students to accept an academic framing ("kollektivt anliggende") before the conceptual question is even reached. The after-version starts with consequence — the student immediately has something to think about.',
  },
  {
    id: 'dp_016',
    type: 'question_stem',
    issue: 'academic_jargon_stem',
    before: 'Hvad er den primære kilde til politisk legitimitet i et moderne demokrati?',
    after: 'Hvad giver egentlig en politisk leder retten til at bestemme?',
    reasoning: '"Primære kilde til politisk legitimitet" frontloads a concept students may not have. "Retten til at bestemme" is the same question in human language. The word "egentlig" adds intellectual tension without adding linguistic complexity.',
  },
  {
    id: 'dp_023',
    type: 'question_stem',
    issue: 'academic_jargon_stem',
    before: 'Hvorfor kan direkte demokrati skalere dårligt til moderne nationalstater?',
    after: 'Hvorfor kan man ikke bare lade alle borgere stemme om alle beslutninger i et land som Danmark?',
    reasoning: '"Skalere dårligt" is tech jargon imported into political science. "Et land som Danmark" grounds the abstraction in a known reality. The word "bare" creates productive naivety — the student is positioned as someone genuinely asking, not being tested.',
  },
  {
    id: 'dp_024',
    type: 'question_stem',
    issue: 'compound_named_stem',
    before: 'Hvad er Tocquevilles "flertallets tyranni" — og er det primært et juridisk eller socialt fænomen?',
    after: 'Kan et flertal undertrykke en minoritet — uden at en eneste lov forbyder noget?',
    reasoning: 'The before-version names Tocqueville (requires prior knowledge), contains a dual question structure, and uses "juridisk/socialt fænomen" as categories before the concept is established. The after-version is a pure yes/no question about a human situation — the concept arrives through reflection, not pre-labeling.',
  },
  {
    id: 'dp_039',
    type: 'question_stem',
    issue: 'blame_framing + academic_jargon_stem',
    before: 'Hvad er den mest strukturelt præcise forklaring på udbredt politisk apati?',
    after: 'Hvorfor gider mange unge ikke engagere sig politisk — er det egentlig deres skyld?',
    reasoning: 'The before-version is pure academic register — "strukturelt præcise forklaring", "udbredt politisk apati". The after-version names the phenomenon colloquially AND immediately introduces the reframe ("er det egentlig deres skyld?") that the question is designed to challenge. The answer becomes an act of reframing, not just recall.',
  },
  {
    id: 'dp_016_review',
    type: 'review_text_opening',
    issue: 'named_academic_opener',
    before: 'Max Weber identificerede tre typer legitimitet: tradition (kongen er kong fordi konger altid har regeret), karisma (lederen er leder fordi folk følger ham) og rationalitet-legalitet (lederen er leder fordi et system af regler udpegede ham).',
    after: 'En leder kan have magt af tre grunde: tradition (det har altid været sådan), karisma (folk ser op til dem) eller rationelle regler (systemet udpegede dem).',
    reasoning: 'Weber\'s name front-loads academic authority rather than the idea. The content is identical — three types of legitimacy — but the after-version presents the typology as a natural observation rather than an academic citation. The concept lands first; attribution is implicit.',
  },
  {
    id: 'dp_024_review',
    type: 'review_text_opening',
    issue: 'named_academic_opener',
    before: 'Tocqueville observerede i 1830\'ernes USA at det mest effektive tyranni ikke behøver love.',
    after: 'Det mest effektive tyranni efterlader ingen spor. Ingen love. Ingen betjente. Bare social usynlighed for den der tænker forkert.',
    reasoning: 'The before-version opens with historical attribution (cold academic entry). The after-version opens with the content of the insight — three short sentences that land the idea immediately. Tocqueville is named later, once the student already has the concept.',
  },
  {
    id: 'dp_030_review',
    type: 'review_text_opening',
    issue: 'named_academic_opener',
    before: 'Tocqueville beundrede amerikanske foreninger mere end nogen anden demokratisk institution.',
    after: 'En sportsklub, en fagforening, en borgerforening. Hvad har de med demokrati at gøre? Mere end man tror.',
    reasoning: 'The before-version is an academic accolade that means nothing to a student who doesn\'t know Tocqueville. The after-version lists three concrete, recognizable institutions and poses the question the student should be asking. The concept arrives as answer to a real curiosity.',
  },
  {
    id: 'dp_019_option',
    type: 'answer_option',
    issue: 'bloated_correct_option',
    before: 'Menneskerettigheder gælder alle mennesker i kraft af at være mennesker — borgerrettigheder gives og håndhæves af specifikke stater over for deres borgere',
    after: 'Menneskerettigheder følger dig som menneske — borgerrettigheder giver din stat dig',
    reasoning: '28 words → 11 words. Same distinction: universality vs. state-contingency. The after-version uses "følger dig" (personal, concrete) and "din stat" (possessive, direct). No information lost. Scanning cost dramatically reduced.',
  },
  {
    id: 'dp_008_sentence',
    type: 'review_text_sentence',
    issue: 'embedded_clause_sentence',
    before: 'En revolutionær der skal administrere et imperium opdager hurtigt at imperiet ikke administreres på andre måder end dem der eksisterede.',
    after: 'En revolutionær der overtager imperiet, opdager hurtigt: det kan kun administreres som det altid er blevet.',
    reasoning: 'The before-version has two embedded clauses and a double negation ("ikke... andre måder end dem der eksisterede"). The after-version uses a colon as a rhythmic pivot — the first clause sets up the situation, the colon creates a micro-pause, the second clause lands the insight. Same content, 40% lower parsing cost.',
  },
];

// The canonical youth-near writing standard — permanent content gate.
export const YOUTH_NEAR_STANDARD = {
  question_stem: {
    principle: 'Ask what a curious student would actually ask — not what a textbook would label',
    concrete_before_abstract: 'Always ground the concept in a recognizable situation before naming it',
    avoid: [
      'Named theorist in the stem ("Tocquevilles X")',
      'Academic verb forms ("skalere", "deliberere", "aggregere")',
      'Dual questions embedded in one stem',
      'Implicit blame of the student\'s demographic',
      'Institutional phrasing where human phrasing works equally well',
    ],
    prefer: [
      'The question a thoughtful student would genuinely ask',
      'Concrete nations, situations, or dynamics (Danmark, EU, klassen, en politisk leder)',
      '"Er det egentlig...?" framing to introduce a reframe',
      '"Hvad sker der når...?" to ground in consequence',
      'Active verbs: gider, bestemmer, overtager, vælger',
    ],
  },
  answer_options: {
    max_words: 18,
    parallel_structure: 'All 4 options should scan as roughly equal length',
    correct_option: 'The correct option should use the same register as the distractors — not a more elaborate phrasing that signals its correctness',
    distractors: 'Each distractor should represent a real, named misconception type — not just a "wrong thing"',
    avoid: [
      'Options that are significantly longer than the others',
      'Passive constructions that add length without content',
      'Academic noun-stacks in the correct option that don\'t appear in distractors',
    ],
  },
  review_text: {
    opener: 'Open with the insight, the surprise, or the human situation — never with the institutional description',
    named_theorists: 'Name theorists after the concept has landed — not as an authority-opener',
    rhythm: 'Short sentence after long sentence. The insight needs a landing pad.',
    emotional_register: 'Intellectually exciting and respectful — never triumphant, never condescending',
    warmth_signals: [
      'Direct address ("Du", "Vi", "Din")',
      'Concrete named entities (Napoleon, Danmark, sportsklubben)',
      'Questions embedded in review_text that invite reflection',
      'Single-sentence paragraphs that land insights',
    ],
    avoid: [
      '"X hviler på en antagelse" as opener',
      '"X identificerede/observerede/adskillede" as opener',
      'Abstract institutional framing before the human situation',
      'Ending with a generic truism',
    ],
  },
};

// Cognitive energy map — where mental energy drops in the original content.
export const COGNITIVE_ENERGY_MAP = {
  high_risk_zones: [
    { question: 'dp_024', issue: 'Dual academic question + Tocqueville opener. Students likely re-read stem twice.' },
    { question: 'dp_032', issue: '"Domstolsprøvelse" in stem + abstract opener. Parsing cost before conceptual thinking begins.' },
    { question: 'dp_029', issue: '"Demokratisk deliberation" signals academic text — scanning risk before question is processed.' },
    { question: 'dp_039', issue: 'Implicit blame framing may trigger defensive reaction before the question is considered.' },
    { question: 'dp_019', issue: 'Correct option at 28 words. Students scanning options will skip or misread the correct answer.' },
  ],
  post_rewrite_improvements: [
    { question: 'dp_024', gain: 'Entry cost drops from "parse academic dual-question" to "answer yes/no about familiar dynamic".' },
    { question: 'dp_032', gain: 'Direct yes/no question — student immediately has a stake in the answer.' },
    { question: 'dp_029', gain: '"Udover at de spreder falske nyheder" activates prior knowledge as entry point.' },
    { question: 'dp_039', gain: '"Er det egentlig deres skyld?" creates immediate self-implication — the student is in the question.' },
    { question: 'dp_019', gain: 'Correct option scans in 2 seconds instead of 6.' },
  ],
};

// Questions left unchanged — already youth-near enough.
export const UNCHANGED_QUESTIONS = [
  { id: 'dp_002', reason: 'Stem is clear. "Lovligt gennemføre uretfærdige love" is the right productive tension.' },
  { id: 'dp_005', reason: 'Stem is direct. Review_text opening is strong.' },
  { id: 'dp_006', reason: 'Stem is concrete and clear.' },
  { id: 'dp_007', reason: 'Stem already minimal: "Hvad gør propaganda mest effektiv?" — model question.' },
  { id: 'dp_009', reason: 'Review_text has strong opening rhythm.' },
  { id: 'dp_010', reason: 'Good concrete opening about democratic stress tests.' },
  { id: 'dp_011', reason: 'Concrete stem and good causal tension.' },
  { id: 'dp_013', reason: 'Review_text opening is already grounded.' },
  { id: 'dp_014', reason: 'Clean contrast structure.' },
  { id: 'dp_017', reason: 'Concrete institutional scenario already.' },
  { id: 'dp_020', reason: 'Good concrete collective-goods setup.' },
  { id: 'dp_025', reason: 'Complex but clear stem. Whistleblowing is personally resonant.' },
  { id: 'dp_027', reason: 'Review_text opener already excellent: "Demokratier bryder sjældent ned på én dag. De eroderer."' },
  { id: 'dp_028', reason: 'Review_text opener already excellent: "Mediefrihed er ikke kun frihed fra staten."' },
  { id: 'dp_031', reason: 'Review_text opener already excellent: "Sovjetunionen havde en fremragende forfatning — på papiret."' },
  { id: 'dp_034', reason: 'Clean definitional distinction. Already accessible.' },
  { id: 'dp_035', reason: 'Review_text already opens with strong concrete consequence.' },
  { id: 'dp_036', reason: 'Stem is clear and concrete.' },
  { id: 'dp_003', reason: 'Good formal/real contrast already.' },
  { id: 'dp_018', reason: 'Concrete parliamentary control scenario.' },
];
