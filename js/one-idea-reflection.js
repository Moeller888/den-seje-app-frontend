// Section 57 — One-Idea Reflection Standard
//
// Core principle: ONE CLEAR INSIGHT PER REFLECTION.
//
// Not about dumbing down. About retention.
// A student who walks away with one thing they will remember tomorrow
// learned more than a student who read eight sentences and retained none.
//
// Section 56 established the 6-sentence limit.
// Section 57 establishes the one-idea requirement within those 6 sentences.
// A review_text can be 6 sentences and still scatter across 3 unrelated insights.
// That is the failure mode Section 57 targets.

export const ONE_IDEA_PHILOSOPHY = {
  principle: 'One clear insight per reflection.',
  rationale: 'Cognitive load research is consistent: a single well-landed insight is retained. A cluster of related insights produces interference. Students conflate them, average them, or remember none.',
  what_changes: 'Section 56 asked: how many sentences? Section 57 asks: how many ideas?',
  test: 'After reading the review_text, complete this sentence: "This text taught me that ___." If you need a semicolon or "and also" to complete it, the text carries two ideas.',
  not_reductive: 'The insight can be nuanced, layered, and sophisticated. It just has to be one thing — not two things sitting next to each other.',
  failure_mode: 'A review_text that opens with structural analysis, pivots to a historical example, and closes with a normative claim is three review_texts wearing one coat.',
};

export const SCANNING_RISK_ANALYSIS = {
  trigger: 'When a review_text contains multiple ideas, the student scans for the most interesting one and skips the rest.',
  consequence: 'The sentences the author considered most important are exactly the ones most likely to be skipped — they come after the first interesting sentence has already released the student\'s attention.',
  pattern: 'Sentence 1 → student reads fully. Sentence 2 → student reads fully. Sentence 3 → student notices it might be long. Sentence 4 → student starts skimming. Sentences 5-6 → lost.',
  implication: 'The only reliable position in a 6-sentence reflection is sentences 1–3. Everything placed later is read by motivated students only.',
  design_response: 'Put the insight in sentences 1–3. Use sentences 4–6 to land, anchor, and resonate — not to introduce new material.',
};

export const HUMAN_THINKING_RHYTHM = {
  observation: 'Human working memory holds 4±1 items. A reflection panel is read in working memory, not stored and processed offline.',
  implication: 'By sentence 5, the student\'s working memory is processing sentences 1–4 simultaneously. A new idea in sentence 5 competes with four prior sentences for the same limited space.',
  rhythm_rule: 'Sentences 1–2: establish the frame. Sentences 3–4: deliver the insight. Sentences 5–6: land and resonate.',
  violation: 'A review_text that introduces new factual content in sentences 5–6 violates the rhythm — the student is in landing mode, not intake mode.',
};

export const AUDIT_FINDINGS = [
  {
    id: 'dp_012',
    issue: 'jargon_pair',
    question: 'Hvad er den vigtigste svaghed ved repræsentativt demokrati?',
    problem: '"Principal-agent-problemet" in sentence 4 and "agenturproblemet" in sentence 5 — academic compound nouns that require prior exposure to a specific political science framework.',
    fix: 'Remove both terms. The structural insight (representatives have their own interests) is fully expressed without the label.',
    sentences_before: 5,
    sentences_after: 5,
    idea_count_before: 1,
    idea_count_after: 1,
  },
  {
    id: 'dp_013',
    issue: 'jargon + weak_last_sentence',
    question: 'Hvad er "gratis-rider-problemet" i demokratisk kontekst?',
    problem: '"Gratis-rider-strategien" in sentence 3 — academic framing that labels the behavior instead of describing it. Last sentence was fragmented across the main sentence.',
    fix: 'Replace "vælger gratis-rider-strategien" with plain description. Split house metaphor into standalone kicker: two sentences, maximum impact.',
    sentences_before: 5,
    sentences_after: 6,
    idea_count_before: 1,
    idea_count_after: 1,
  },
  {
    id: 'dp_014',
    issue: 'over_limit + two_ideas',
    question: 'Hvad adskiller journalistik fra propaganda?',
    problem: '7 sentences. The last two sentences ("I en medieverden...") shift from the core insight (intent distinguishes them) to a meta-claim about media literacy.',
    fix: 'Remove final meta-sentence. Compress "Begge bruger fakta. Begge kan ramme følelser." to just the first. Sharpen final question.',
    sentences_before: 7,
    sentences_after: 6,
    idea_count_before: 2,
    idea_count_after: 1,
  },
  {
    id: 'dp_015',
    issue: 'over_limit + academic_evidence',
    question: 'Kan en lille gruppe rige mennesker reelt bestemme i et demokrati — selvom alle har en stemme?',
    problem: '7 sentences. Sentence 5 cites "videnskabelige analyser af amerikanske politiske beslutninger" — academic sourcing that breaks the conversational register and adds a second anchor point.',
    fix: 'Drop the academic evidence sentence. The structural argument (financing campaigns, owning media, lobbying) is self-evidently convincing.',
    sentences_before: 7,
    sentences_after: 6,
    idea_count_before: 2,
    idea_count_after: 1,
  },
  {
    id: 'dp_020',
    issue: 'over_limit + textbook_structure',
    question: 'Hvad er det konkrete problem med at lade markedet bestemme over kollektive goder som rent vand eller national forsvar?',
    problem: '8 sentences. "Markedet leverer for lidt, eller slet intet. Det er ikke markedets fejl — det er dets logik." — two sentences that summarize what was just said, adding density without new insight.',
    fix: 'Remove the two summary sentences. Compress "Demokratisk kollektiv finansiering er ikke ideologisk modstand mod markedet. Det er løsningen..." to one punchy sentence.',
    sentences_before: 8,
    sentences_after: 6,
    idea_count_before: 1,
    idea_count_after: 1,
  },
  {
    id: 'dp_021',
    issue: 'over_limit + hedge_weakens',
    question: 'Hvad er et ekkokammer — og hvad er den primære mekanisme der skaber det?',
    problem: '7 sentences. "(evidensen er blandet)" parenthetical in sentence 4 introduces academic caution that undercuts the central argument and pulls the student\'s attention toward an implied controversy.',
    fix: 'Drop the hedging sentence entirely. Reframe the key danger: not extremism but parallel factual realities.',
    sentences_before: 7,
    sentences_after: 6,
    idea_count_before: 2,
    idea_count_after: 1,
  },
  {
    id: 'dp_023',
    issue: 'dense_closer',
    question: 'Hvorfor kan man ikke bare lade alle borgere stemme om alle beslutninger i et land som Danmark?',
    problem: 'Last sentence is a dense academic abstraction chain: "repræsentation som specialisering af én demokratisk funktion: beslutningstagning i kompleksitet." Requires parsing two nominalized concepts in sequence.',
    fix: '"Repræsentation er specialisering, ikke elitisme." — same insight, one sentence, no parsing required. Also trim "6 millioner borgere" — adds specificity that isn\'t load-bearing.',
    sentences_before: 6,
    sentences_after: 6,
    idea_count_before: 1,
    idea_count_after: 1,
  },
  {
    id: 'dp_024',
    issue: 'over_limit + scatter',
    question: 'Kan et flertal undertrykke en minoritet — uden at en eneste lov forbyder noget?',
    problem: '9 sentences. After landing the core insight (social tyranny, no traces), the text continues with "Er det stadig relevant?" then pivots to social media — a second idea that dilutes the first.',
    fix: 'Remove the relevance-question and the social media paragraph. End with Tocqueville: "sværere at bekæmpe end love, fordi der ingenting er at sagsøge." That sentence already lands the "why it matters".',
    sentences_before: 9,
    sentences_after: 6,
    idea_count_before: 2,
    idea_count_after: 1,
  },
  {
    id: 'dp_025',
    issue: 'over_limit + opener_subclause',
    question: 'Hvornår er whistleblowing moralsk forpligtende — frem for blot moralsk tilladt?',
    problem: '7 sentences. Opener sub-clause "der ikke kan reduceres til lyd et horn og vær en helt" weakens the punch — it defines what the text is NOT about before stating what it IS about.',
    fix: 'Cut the sub-clause. Start with the ethical fact, not its negation. Restructure three conditions as a readable list within one sentence.',
    sentences_before: 7,
    sentences_after: 6,
    idea_count_before: 1,
    idea_count_after: 1,
  },
  {
    id: 'dp_027',
    issue: 'over_limit + academic_citation',
    question: 'Hvad er det tidligste advarselstegn på at et demokrati er ved at erodere?',
    problem: '7 sentences. "Levitsky og Ziblatt (How Democracies Die) identificerede mønsteret" — drops a citation mid-argument that requires the student to decide whether to mentally process the author reference.',
    fix: 'Remove the citation. "Mønsteret er konsistent:" carries the same epistemic weight without the interruption.',
    sentences_before: 7,
    sentences_after: 6,
    idea_count_before: 1,
    idea_count_after: 1,
  },
  {
    id: 'dp_028',
    issue: 'over_limit + diluting_example',
    question: 'Hvornår udgør koncentration af medieejerskab en specifik demokratisk trussel?',
    problem: '7 sentences. Sentence 3 ("En mediekoncern med seks aviser...") provides a specific numerical example that shifts focus from the structural argument to an illustration — then the text has to return to the structural point.',
    fix: 'Remove sentence 3. The self-regulation argument (sentence 4-5) is stronger without the example interrupting the flow.',
    sentences_before: 7,
    sentences_after: 6,
    idea_count_before: 1,
    idea_count_after: 1,
  },
  {
    id: 'dp_030',
    issue: 'over_limit + name_drop_mid_text',
    question: 'Hvad er det egentlige demokratiske formål med fagforeninger, sportsklubber og frivillige organisationer?',
    problem: '7 sentences. "Tocqueville beundrede disse foreninger mere end nogen anden demokratisk institution" in sentence 4 introduces a named authority mid-argument — shifts student attention from the structural insight to the person.',
    fix: 'Remove Tocqueville reference. Let the structural argument carry the weight: collective capacity without state initiative.',
    sentences_before: 7,
    sentences_after: 6,
    idea_count_before: 1,
    idea_count_after: 1,
  },
  {
    id: 'dp_031',
    issue: 'over_limit + redundant_second_example',
    question: 'Hvad gør en forfatning til mere end et stykke papir?',
    problem: '10 sentences. After the USSR example lands cleanly ("Ingen efterlevede den."), the text adds: Nordkorea example, then a list of three mechanisms, then two closing sentences. The USSR example already proves the point.',
    fix: 'Stop after the USSR example and the structural conclusion. "Intet mere." as final two-word sentence. The student\'s imagination does the rest.',
    sentences_before: 10,
    sentences_after: 6,
    idea_count_before: 2,
    idea_count_after: 1,
  },
  {
    id: 'dp_035',
    issue: 'over_limit + academic_compound',
    question: 'Hvad er den afgørende faktor for om et demokrati overlever en alvorlig krise?',
    problem: '8 sentences. "Gensidig tolerance og institutionel selvkontrol" — a named concept pair from Levitsky/Ziblatt that functions as academic jargon for most students. The sentences that follow explain what it means — making the label redundant.',
    fix: 'Remove the academic compound. Rename the phenomenon in plain language: "vilje til at acceptere tabet, vilje til at begrænse sig selv." Same content, human register.',
    sentences_before: 8,
    sentences_after: 6,
    idea_count_before: 1,
    idea_count_after: 1,
  },
  {
    id: 'dp_039',
    issue: 'over_limit + triple_repetition',
    question: 'Hvorfor gider mange unge ikke engagere sig politisk — er det egentlig deres skyld?',
    problem: '7 sentences. Last sentence: "reelt valg, reelt responsivt styre, reelt meningsfulde konsekvenser" — triple "reelt" repetition reads as rhetorical padding. Each "reelt" adds emphasis but also word count.',
    fix: 'Remove two of the three "reelt" instances. "Reelt valg, responsivt styre, mærkbare konsekvenser." — the tightening itself demonstrates that the repetition was padding, not argument.',
    sentences_before: 7,
    sentences_after: 6,
    idea_count_before: 1,
    idea_count_after: 1,
  },
];

export const RETENTION_TEST_FRAMEWORK = {
  name: 'The Next-Day Test',
  description: 'A review_text passes if a student can reproduce the core insight 24 hours later with no re-reading.',
  procedure: [
    '1. Read the review_text once.',
    '2. Close it.',
    '3. Wait 24 hours.',
    '4. Complete: "That question was about ___, and the insight was ___."',
    '5. If the student cannot complete step 4 without re-reading, the review_text failed.',
  ],
  proxy_test: 'Immediately after reading: "What is the one thing this text taught you?" If the answer takes more than 10 seconds to formulate, the text carries too many ideas.',
  why_one_idea_wins: 'Memory consolidation favors distinct, standalone items. A cluster of related points is encoded as one item with fuzzy boundaries — and retrieved as a vague impression rather than a usable insight.',
};

export const VISUAL_BREATHABILITY_PRINCIPLE = {
  observation: 'Dense text in a calm panel creates visual dissonance. The panel signals "take your time" while the density signals "there is a lot here."',
  implication: 'White space in the reflection panel is not waste — it is trust. It tells the student: this is all there is. You can hold this.',
  six_sentence_visual: '6 sentences at 16px/1.75 line-height = approximately 90–100px of text. That leaves visible breathing room in the panel. 10 sentences fills the panel and removes the breathing room.',
  one_idea_visual: 'A single idea with six focused sentences reads as a unified block. Multiple ideas in six sentences creates visual inconsistency that the eye detects even without conscious analysis.',
};

export const CANONICAL_STANDARD_S57 = {
  extends: 'Section 56 standard (6 sentences, plain language, concrete opener, insight-landing closer)',
  adds: 'One idea per reflection.',
  idea_test: 'Complete this sentence after reading: "This text taught me that ___." No semicolons. No "and also."',
  scan_rule: 'The insight must be reachable in sentences 1–3. Sentences 4–6 land and resonate — they do not introduce.',
  jargon_pairs: 'Academic compound nouns in pairs are a specific failure mode: "principal-agent-problemet" + "agenturproblemet", "gensidig tolerance" + "institutionel selvkontrol". Remove both or remove the concept entirely.',
  citation_rule: 'Named theorists in parentheses mid-argument interrupt the reading eye. If the argument can stand without the citation, remove it. If it cannot stand, fix the argument first.',
  hedge_rule: 'Academic hedges ("evidensen er blandet", "ikke nødvendigvis") are appropriate in academic writing. In a 6-sentence reflection panel, they reduce confidence in the insight without adding precision.',
  last_sentence_test: 'The last sentence must land. Not summarize. Not add. Land. The student should feel that the text is complete.',
};
