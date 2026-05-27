// Section 56 — Review Text Reflection Readability Pass
//
// Core principle: THE REFLECTION PANEL IS THE LEARNING CENTER.
//
// Section 54 created the REFLECTING state — a prominent panel where students read
// the review_text at their own pace after an incorrect answer.
// Section 53 rewrote stems and did heavy lifting on most review_texts.
// Section 56 does the final pass: ensure every review_text that appears in
// the reflection panel meets the full readability standard.
//
// A review_text in a reflection panel is no longer a footnote to an error.
// It is the primary pedagogical artifact. It needs to earn that position.

export const REFLECTION_READABILITY_PHILOSOPHY = {
  context: 'After Section 54: review_text is shown in a dedicated panel, 16px/1.75 line-height, accent border',
  implication: 'What was acceptable as a quick annotation is not acceptable as a standalone reflection',
  standard: 'The student chose to read this. Every sentence must earn that attention.',
  failure_mode: 'A 7-sentence academic-opener review_text in a beautiful reflection panel is still a 7-sentence academic-opener review_text',
  fix: 'Enforce the 6-sentence limit. Remove jargon that passed at 14px but stalls at 16px. Tighten before/after compression.',
};

// The 6-sentence canonical limit — why it matters in the reflection panel specifically.
export const SIX_SENTENCE_RULE = {
  rationale: [
    'In the old flow (14px, auto-advance), overlong review_texts were not read fully',
    'In the new REFLECTING state, the student is explicitly reading — overlong texts now create fatigue',
    'Six sentences at 16px/1.75 line-height is approximately the visual density of a short news paragraph',
    'Beyond six sentences, the student\'s eye starts to scan rather than read',
    'The insight that needs 8 sentences can almost always be expressed in 6 without loss',
  ],
  test: 'Read the review_text aloud. If it takes more than 20 seconds, it is too long for a reflection moment.',
  exception: 'A seventh sentence is permitted only if removing it would lose a critical non-redundant insight',
};

// The five issues addressed in Section 56 — what Section 53 left unfinished.
export const AUDIT_FINDINGS = [
  {
    id: 'dp_026_over_limit',
    question: 'Hvornår er det populisme — og hvornår er det bare at kritisere de der har magten?',
    sentences_before: 8,
    sentences_after: 6,
    issue: 'S53 updated the stem and kept the original 8-sentence review_text intact',
    fix: 'Merged the three closing sentences into one that preserves the key consequence ("din side taber")',
    preserved: 'The core insight — populism makes compromise treason — fully intact',
  },
  {
    id: 'dp_029_jargon',
    question: 'Hvad er det egentlige demokratiske problem med sociale medier?',
    sentences_before: 6,
    sentences_after: 6,
    issue: 'Last sentence: "De institutionelle incitamenter diskriminerer mod demokratiets kommunikationsform" — academic noun-stacking after a strong plain-language opener',
    fix: '"Platformene belønner skarphed og straffer nuance: det modsatte af hvad demokratisk debat kræver"',
    preserved: 'Same structural insight (platform architecture biases against nuanced communication), plain delivery',
  },
  {
    id: 'dp_033_over_limit',
    question: 'Hvornår er politiske partier afgørende for demokratiet — og hvornår truer de det?',
    sentences_before: 7,
    sentences_after: 6,
    issue: 'S53 added a strong three-sentence opener ("Partier er uundværlige. Og de er farlige. Begge dele på én gang.") without removing a sentence elsewhere — net +1 sentence',
    fix: 'Merged the three opener sentences into one: "Partier er uundværlige og farlige på én gang." Also simplified "valgbarhedstærskler" → "Stemmetærskler"',
    preserved: 'Paradox opener preserved, cartel dynamic preserved, competitive-pressure conclusion preserved',
  },
  {
    id: 'dp_037_over_limit',
    question: 'Er lobbyisme nødvendigvis skadelig for demokratiet?',
    sentences_before: 8,
    sentences_after: 6,
    issue: 'S53 replaced the opener but kept the original 8-sentence structure — three closing sentences all about the same "forbud" argument',
    fix: 'Merged "Et forbud mod lobbyisme ville flytte indflydelse til uofficielle kanaler. Det ville ikke eliminere den. Det ville blot gøre den usynlig." → "Et forbud ville flytte indflydelsen til uofficielle kanaler og gøre den usynlig, ikke eliminere den." Also removed "institutionel modvægt" (jargon)',
    preserved: 'The two concrete examples (patientforening/tobak) preserved — they are the anchor of this review_text',
  },
  {
    id: 'dp_038_vagueness_grammar',
    question: 'Hvorfor er der i mange demokratier en grænse for, hvor mange år en leder kan sidde?',
    sentences_before: 6,
    sentences_after: 6,
    issue_1: '"Franklins fire præsidentvalg" — vague reference (Franklin who?). S53 dropped "D. Roosevelt" when shortening to "Franklins"',
    fix_1: '"Roosevelts fire præsidentvalg" — unambiguous',
    issue_2: 'Question text typo: "kan sidder" (finite verb) → "kan sidde" (infinitive, grammatically correct)',
    fix_2: 'Fixed in the content field SET',
    issue_3: 'Opener "institutionel kapring" is academic. "Magtakkumulering" is more concrete',
    fix_3: '"det handler om at reducere magtakkumulering"',
  },
];

// Before/after pairs for the five fixes.
export const REWRITE_PAIRS = [
  {
    id: 'dp_026_compression',
    type: 'review_text',
    issue: 'over_limit',
    sentences_before: 8,
    sentences_after: 6,
    before_closing: 'Det gør kompromis til forræderi. Det gør opposition til fjendtlighed. Og det underminerer den institutionelle respekt som demokratiet kræver at alle parter — inkl. taberne — opretholder.',
    after_closing: 'Det gør kompromis til forræderi og opposition til fjendtlighed. Og det nedbryder den tillid der holder demokratiet kørende — også når din side taber.',
    reasoning: 'Three sentences → two. Same logical chain (compromise = treason → trust breakdown). "institutionelle respekt" replaced with "tillid der holder demokratiet kørende" — more concrete and human.',
  },
  {
    id: 'dp_029_last_sentence',
    type: 'review_text_sentence',
    issue: 'jargon',
    before: 'De institutionelle incitamenter diskriminerer mod demokratiets kommunikationsform: den langsomme, nuancerede, faktabaserede, kompromisvillige.',
    after: 'Platformene belønner skarphed og straffer nuance: det modsatte af hvad demokratisk debat kræver.',
    reasoning: '"Institutionelle incitamenter diskriminerer" is academic passive framing. "Platformene belønner/straffer" is active and concrete — same structural insight, same meaning, immediate comprehension. The abstract adjective list (langsom, nuanceret, faktabaseret, kompromisvillig) is replaced by the shorter "nuance" — the category, not the list.',
  },
  {
    id: 'dp_033_opener_merge',
    type: 'review_text_opening',
    issue: 'over_limit + vocabulary',
    before: 'Partier er uundværlige. Og de er farlige. Begge dele på én gang — det er paradokset.',
    after: 'Partier er uundværlige og farlige på én gang.',
    before_list: 'valgbarhedstærskler, medieregler, offentlig partifinansiering der favoriserer eksisterende aktører',
    after_list: 'Stemmetærskler, medieregler, offentlig finansiering der favoriserer dem der allerede er der',
    reasoning: 'The three-sentence opener was rhythmically effective but left no room to cut elsewhere. Merged to one sentence — the paradox is still stated, the short rhythm is traded for one unit. "Valgbarhedstærskler" is a compound that trips reading; "Stemmetærskler" is the same concept with lower friction.',
  },
  {
    id: 'dp_037_forbud_merge',
    type: 'review_text_closing',
    issue: 'over_limit',
    before: 'Løsningen er regulering, gennemsigtighed og institutionel modvægt — ikke forbud. Et forbud mod lobbyisme ville flytte indflydelse til uofficielle kanaler. Det ville ikke eliminere den. Det ville blot gøre den usynlig.',
    after: 'Løsningen er regulering og transparens — ikke forbud. Et forbud ville flytte indflydelsen til uofficielle kanaler og gøre den usynlig, ikke eliminere den.',
    reasoning: 'Three-sentence repetitive closing (flytte → ikke eliminere → gøre usynlig) → two sentences. Same argument: prohibition shifts influence, doesn\'t remove it. "Institutionel modvægt" removed — redundant after "regulering og transparens" already sets the frame.',
  },
  {
    id: 'dp_038_reference_fix',
    type: 'review_text_sentence',
    issue: 'vagueness + grammar',
    before: 'Franklins fire præsidentvalg — dog under ekstraordinære omstændigheder — førte direkte til det tillæg der begrænsede fremtidige præsidenter.',
    after: 'Roosevelts fire præsidentvalg — dog under ekstraordinære omstændigheder — førte direkte til det tillæg der begrænsede fremtidige præsidenter.',
    reasoning: '"Franklins" was introduced by S53 shortening "Franklin D. Roosevelts". "Franklin" alone is ambiguous (Benjamin Franklin? Franklin Pierce?). Roosevelt is the referent — "Roosevelts" is equally short and unambiguous.',
  },
];

// The canonical review_text standard for the REFLECTING state — established Section 56.
export const REFLECTION_PANEL_STANDARD = {
  max_sentences: 6,
  opener: 'Plain language. Concrete human situation or direct reframe. Not an institutional description.',
  last_sentence: 'Should land the insight. Not a summary. Not a generic truism.',
  jargon_test: 'Would a 16-year-old pause on any word? If yes — replace with the concept, not the term.',
  sentence_count_test: 'Count sentences. If >6, compress. No exceptions.',
  rhythm_test: 'Read aloud in 20 seconds. If you cannot, it is too long for a reflection moment.',
  register: 'Intellectually respectful. Never triumphant. Never condescending. Never academic-cold.',
  named_theorists: 'Fine after the insight lands. Never as the opener.',
  abstract_noun_chains: 'Maximum 2 abstract nouns in sequence before a concrete example or active verb',
};

// What changed in the reflection panel context (Section 54 → Section 56 implications).
export const CONTEXT_CHANGE = {
  before_section_54: 'review_text was appended to "❌ Forkert — " in #feedback, 14px, auto-dismissed after 3.2 seconds',
  after_section_54: 'review_text is the primary content in a dedicated REFLECTING state panel, 16px/1.75 line-height',
  implication_for_length: 'At 14px auto-dismiss, overlong texts scrolled past. At 16px student-controlled, overlong texts create visible fatigue.',
  implication_for_jargon: 'At small size and fast pace, readers skim jargon. In a calm reflective panel, jargon creates friction that breaks the learning moment.',
  implication_for_opener: 'The first sentence now appears at the top of a visually distinct panel. It is the first thing the student sees after a wrong answer. It must be immediately welcoming, not academic.',
};
