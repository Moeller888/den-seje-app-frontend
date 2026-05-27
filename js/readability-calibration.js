// Section 52 — Cognitive Accessibility & Readability Calibration Pass
//
// Core principle: HIGH CONCEPTUAL DEPTH WITH LOW LANGUAGE FRICTION.
// Students should be challenged by THINKING — not by text-decoding capacity.
//
// The danger of "false difficulty":
//   When language complexity creates the illusion of intellectual depth
//   without adding actual conceptual richness.
//   The platform should never confuse dense prose with profound ideas.

export const READABILITY_PHILOSOPHY = {
  core: 'Complex ideas do not require complex language',
  distinction: 'Conceptual difficulty ≠ linguistic difficulty. Separate them.',
  goal: 'Challenge the thinking — not the reading',
  danger: 'False difficulty through language density: long sentences, abstract noun stacking, embedded clause depth',
  standard: 'A 16-year-old with average reading ability should be able to decode every sentence. The ideas should still challenge a PhD.',
};

// Six dimensions that describe LANGUAGE LOAD — independent of conceptual depth.
export const LANGUAGE_LOAD_DIMENSIONS = [
  {
    id: 'sentence_length',
    name: 'Sætningslængde',
    problem: 'Long sentences with multiple clauses increase working memory demand before meaning resolves',
    threshold: 'Over 25 words in a single clause = risk zone',
    fix: 'Break at natural pauses. Use the full stop aggressively. Short sentences create rhythm.',
    example_bad: 'En revolutionær der skal administrere et imperium opdager hurtigt at imperiet ikke administreres på andre måder end dem der eksisterede.',
    example_good: 'En revolutionær der overtager imperiet, opdager hurtigt: det kan kun administreres som det altid er blevet.',
  },
  {
    id: 'subordinate_clause_density',
    name: 'Bisætningsdensitet',
    problem: 'Nested relative clauses (der som at der) multiply the parsing load',
    threshold: 'Two embedded clauses in one sentence = risk zone',
    fix: 'Resolve the main claim first. Let subordinate information follow separately.',
    example_bad: 'Demokratier der vedtager love som mindretal der ikke har stemt for dem opfatter som uretfærdige...',
    example_good: 'Et demokrati kan vedtage love mindretal opfatter som uretfærdige...',
  },
  {
    id: 'abstract_noun_density',
    name: 'Abstrakt substantiv-densitet',
    problem: 'Chains of abstract nouns (legitimitet, repræsentation, ansvarlighed) without concrete anchors cause semantic drift',
    threshold: '3+ abstract nouns in one sentence without a concrete example = risk zone',
    fix: 'Ground each abstract chain in one concrete human situation before the next abstraction.',
    example_bad: 'Institutionel legitimitet kræver procedural transparens og repræsentativ responsivitet.',
    example_good: 'For at borgere skal tro på institutioner, skal de kunne se hvad der sker og hvem der svarer for det.',
  },
  {
    id: 'concept_stacking',
    name: 'Begrebsstabling',
    problem: 'Introducing multiple new concepts in a single question stem overloads before the question is even asked',
    threshold: 'More than 2 new conceptual terms in a question stem = risk zone',
    fix: 'One new concept per question. Let the distractors and review_text introduce the others.',
    example_bad: 'Hvad karakteriserer det fundamentale epistemologiske problem med effektiv propaganda i relation til kritisk medieanalyse?',
    example_good: 'Hvad gør propaganda mest effektiv?',
  },
  {
    id: 'reading_rhythm',
    name: 'Læserytme',
    problem: 'Uniform sentence length (all long or all short) kills cognitive engagement. No rhythm = scanning begins.',
    threshold: 'More than 4 consecutive sentences of similar length = rhythm loss',
    fix: 'Alternate: one longer sentence (sets up complexity) + one short punchy sentence (lands the insight).',
    example_bad: 'Platforme er designet til engagement og bekræftelse genererer engagement. Brugere ser politisk indhold af én slags og ser mere. Det skaber et informationsmiljø.',
    example_good: 'Platforme er designet til engagement — og bekræftelse genererer mere engagement end modsigelse. Resultat: dine meninger bekræftes. Og andres gør det i den feed de aldrig ser.',
  },
  {
    id: 'vocabulary_friction',
    name: 'Ordforrådsfrktion',
    problem: 'Technical/academic vocabulary without in-sentence grounding forces the student to exit comprehension and enter dictionary mode',
    threshold: '1+ unexplained domain-specific term per sentence = friction risk',
    fix: 'Either define the term in the same sentence or substitute with grounded description first, term second.',
    example_bad: 'Deliberationsproblem: de institutionelle incitamenter diskriminerer systematisk...',
    example_good: 'Det er ikke et problem med informationen — det er et problem med samtalen selv...',
  },
];

// The platform's canonical readability standard — a permanent content-quality gate.
export const READABILITY_STANDARD = {
  question_stem: {
    max_words: 20,
    max_embedded_clauses: 1,
    new_concepts_per_stem: 1,
    tone: 'Direct question, no academic preamble',
    test: 'Read aloud. If it sounds like a textbook footnote, rewrite.',
  },
  options: {
    max_words_per_option: 18,
    style: 'Parallel structure across all 4. No option should be significantly longer than others.',
    distractors: 'Plausible to a thoughtful student — not obviously wrong at first glance',
  },
  review_text: {
    max_sentences: 6,
    opener: 'Land the key insight in sentence 1 or 2. Never bury the lede.',
    rhythm: 'At least one short (under 10 words) sentence per review_text',
    abstract_grounding: 'Every abstract claim must be followed by a concrete example or human situation',
    emotional_tone: 'Respectful, intellectually exciting — never condescending or triumphant',
    test: 'A tired 17-year-old should be able to read this in 20 seconds and feel something clicked.',
  },
};

// Principles for writing question stems.
export const QUESTION_STEM_PRINCIPLES = [
  'One concept, one question — do not embed the sub-question in the main question',
  'Prefer active verbs over nominalizations (hvad gør → hvad karakteriserer)',
  'Anchor abstract questions to human situations (not institutions) where possible',
  'The question stem should feel like a conversation opener, not an exam instruction',
  'Avoid question stems that contain the answer — the framing should be genuinely open',
];

// Principles for writing review_text.
export const REVIEW_TEXT_PRINCIPLES = [
  'The first sentence is the hook — it should reframe the question, not repeat the answer',
  'Short sentences create punch. Use them after complex ideas to let them land.',
  'Never end with a generic statement. End with a specific, memorable formulation.',
  'Abstract chains (3+ abstract nouns) must be broken with a concrete anchor',
  'Avoid review_texts that teach the same concept twice in slightly different words',
  'The review_text is a conversation the student has with a thoughtful teacher — not a Wikipedia article',
  'Emotional rhythm matters: tension → insight → resolution. Not: fact → fact → fact',
];

// Seven learner profiles and their primary readability challenges.
export const LEARNER_PROFILES = {
  strong_reader: {
    danish: 'Stærk læser',
    challenge: 'Boredom at concept level if language is too simple. Needs conceptual depth.',
    risk: 'Language simplification can feel condescending — destroys intellectual trust',
    need: 'Rich conceptual vocabulary with clear sentence structure',
  },
  average_reader: {
    danish: 'Gennemsnitlig læser',
    challenge: 'Long embedded clauses. Abstract noun chains. Wall-of-text in review_texts.',
    risk: 'Scanning behavior begins at sentence 4+ of review_text if rhythm has not varied',
    need: 'Good sentence rhythm. Clear paragraph breaks. Concrete examples after abstractions.',
  },
  struggling_reader: {
    danish: 'Kæmpende læser',
    challenge: 'Nested relative clauses. Vocabulary friction. Dense review_texts.',
    risk: 'Will abandon review_text entirely if first sentence is too long. Never gets the insight.',
    need: 'Short first sentence. Familiar vocabulary first, technical term second. Max 4 sentences.',
  },
  dyslexic_student: {
    danish: 'Elev med ordblindhed',
    challenge: 'Sentence length. Unfamiliar word shapes. Dense blocks of text.',
    risk: 'Long review_texts are visually overwhelming even before reading begins',
    need: 'Short sentences. Line breaks between distinct ideas. High-frequency words where possible.',
  },
  tired_student: {
    danish: 'Træt elev',
    challenge: 'Everything. Cognitive load is already high. Review_text feels like extra work.',
    risk: 'Will only read the first and last sentence. If those don\'t make sense, clicks past.',
    need: 'Hook in first sentence. Insight in last sentence. Everything between should earn its place.',
  },
  anxious_student: {
    danish: 'Angst elev',
    challenge: 'Feels judged by complexity. Academic language signals "this is a test I\'m failing".',
    risk: 'Will interpret language complexity as evidence they\'re not smart enough',
    need: 'Warm, direct tone. No academic preamble. Make the student feel invited, not tested.',
  },
  reflective_student: {
    danish: 'Reflekterende elev',
    challenge: 'Wants depth. Frustrated by oversimplification or empty generalities.',
    risk: 'Trivially simple language will break intellectual trust permanently',
    need: 'Depth and nuance preserved. Complexity of ideas intact. Language just doesn\'t get in the way.',
  },
};

// Anti-patterns — what accessibility does NOT mean.
export const ANTI_PATTERNS = [
  'Childish tone or youth-language affectation ("det er faktisk mega fedt at...")',
  'Removing sophisticated vocabulary without replacing its meaning',
  'Explaining what a student should feel ("dette er en svær idé, men...")',
  'Oversimplifying concepts into trivia to avoid linguistic difficulty',
  'Fake enthusiasm or motivational framing ("godt spørgsmål!")',
  'Treating the student as fragile — they can handle complex ideas, just not complex sentences',
  'Dumbing down distractors so only one answer looks remotely plausible',
  'Using simple language that sounds like it was written for a 10-year-old',
];

// Documented before/after improvements from the Democracy & Power domain.
export const BEFORE_AFTER_EXAMPLES = [
  {
    type: 'question_stem',
    issue: 'concept_stacking + vocabulary_friction',
    context: 'Hypothetical bad version of dp_007 framing',
    before: 'Hvad karakteriserer det fundamentale epistemologiske problem med effektiv propaganda i relation til kritisk medieanalyse?',
    after: 'Hvad gør propaganda mest effektiv?',
    reasoning: 'The "after" version asks the same conceptual question. The "before" version stacks three academic concepts (epistemologisk, propaganda, kritisk medieanalyse) before the student knows what they are being asked. The question\'s intellectual depth lives in the options and review_text — not in jargon.',
  },
  {
    type: 'review_text_sentence',
    issue: 'sentence_length + subordinate_clause_density',
    context: 'dp_008 — Revolutioner reproducerer magtstrukturer',
    before: 'En revolutionær der skal administrere et imperium opdager hurtigt at imperiet ikke administreres på andre måder end dem der eksisterede.',
    after: 'En revolutionær der overtager imperiet, opdager hurtigt: det kan kun administreres som det altid er blevet.',
    reasoning: 'The before version has two embedded clauses and a double negation ("ikke... andre måder end"). Same insight, cleaner delivery. The colon creates a rhythmic pause that lets the insight land.',
  },
  {
    type: 'review_text_sentence',
    issue: 'sentence_length + concept_opener',
    context: 'dp_021 — Ekkokamre',
    before: 'Ekkokamre opstår ikke primært fordi folk er ideologisk snæversynede — de opstår fordi platforme er designet til engagement, og bekræftelse genererer mere engagement end modsigelse.',
    after: 'Ekkokamre opstår ikke primært fordi folk er snæversynede. De opstår fordi platforme er designet til engagement — og bekræftelse genererer mere engagement end modsigelse.',
    reasoning: 'Split one long sentence into two shorter ones. Removed "ideologisk" (redundant in context). The two-sentence rhythm gives the insight more space.',
  },
  {
    type: 'review_text_sentence',
    issue: 'vocabulary_friction + abstract_noun_density',
    context: 'dp_029 — Sociale medier og demokratisk deliberation',
    before: 'Resultatet er ikke et informationsproblem men et deliberationsproblem: de institutionelle incitamenter diskriminerer systematisk mod den kommunikationsform demokrati kræver — langsom, nuanceret, faktabaseret, kompromisvillig.',
    after: 'Resultatet er ikke et informationsproblem — det er et problem med samtalen selv. De institutionelle incitamenter diskriminerer mod demokratiets kommunikationsform: den langsomme, nuancerede, faktabaserede, kompromisvillige.',
    reasoning: '"Deliberationsproblem" is a technical term that requires prior knowledge. "Et problem med samtalen selv" is immediately understood and equally precise for this context. The split also improves rhythm — the adjective list lands harder at end position.',
  },
];
