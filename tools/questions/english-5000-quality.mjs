// Quality checks for the 5,000 new English questions (docs/difficulty-scale-design.md §7 and §10).
//
// Pure functions shared by the generator (tools/questions/build-english-5000.mjs) and the unit
// tests. Every check returns a list of problems (strings); an empty list means the item passes.
// Nothing here reads the database or the network.

import { segmentQuestion, segmentOption, textLang, LANG_DA, LANG_EN } from "../../js/read-aloud/lang-segments.js";
import { findLengthCue } from "../question-quality/length-cue.mjs";

// CEFR anchoring of the level scale (design §7, owner decision B7).
export const CEFR_RANGES = {
  "pre-A1": [1, 1500],
  A1: [1501, 3000],
  A2: [3001, 5000],
  B1: [5001, 7000],
  B2: [7001, 8500],
  C1: [8501, 10000],
};
export const CEFR_ORDER = Object.keys(CEFR_RANGES);

// challenge_role / insight_type per CEFR, as in pilot and batch2-batch6.
export const ROLE_BY_CEFR = {
  "pre-A1": ["reinforcement", "conceptual_bridge"],
  A1: ["reinforcement", "conceptual_bridge"],
  A2: ["reinforcement", "conceptual_bridge"],
  B1: ["challenge", "reframing"],
  B2: ["challenge", "reframing"],
  C1: ["deep_challenge", "perspective_shift"],
};

export const CONCEPT_KEYS = ["o", "h", "g", "l"];

export function cefrForLevel(level) {
  for (const cefr of CEFR_ORDER) {
    const [lo, hi] = CEFR_RANGES[cefr];
    if (level >= lo && level <= hi) return cefr;
  }
  return null;
}

// Inverse of the §4.1 start formula: the (target_grade, difficulty_band) cell that contains a level.
// 35 equal cells over 1-10,000; grade 3-9, band 1-5.
export function gradeBandForLevel(level) {
  if (!Number.isInteger(level) || level < 1 || level > 10000) {
    throw new Error(`level must be an integer 1-10000, got ${level}`);
  }
  // The cell c holds the levels with c * 10000/35 < level <= (c + 1) * 10000/35.
  const cell = Math.ceil((level * 35) / 10000) - 1;
  return { g: 3 + Math.floor(cell / 5), b: (cell % 5) + 1 };
}

// ── Words and quotes (same rules as js/read-aloud/lang-segments.js) ─────────────
const LETTER = "A-Za-zÀ-ÖØ-öø-ÿ";
const WORD_RE = new RegExp(`[${LETTER}0-9]+(?:'[${LETTER}]+)*`, "g");
const IS_LETTER = new RegExp(`[${LETTER}]`);

function wordsOf(text) {
  return (String(text).match(WORD_RE) ?? []).filter((word) => IS_LETTER.test(word));
}

function spokenWords(segments) {
  return segments.flatMap((segment) => wordsOf(segment.text).map((word) => [word, segment.lang]));
}

function quotedSpans(text) {
  const spans = [];
  let open = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "'") continue;
    const before = i > 0 && IS_LETTER.test(text[i - 1]);
    const after = i + 1 < text.length && IS_LETTER.test(text[i + 1]);
    if (before && after) continue;
    if (open < 0 && !before) open = i;
    else if (open >= 0 && !after) {
      spans.push(text.slice(open + 1, i));
      open = -1;
    }
  }
  return spans;
}

// Words that are read correctly in either voice (loanwords used as Danish).
const EITHER_LANGUAGE = new Set(["t", "shirt", "fair", "play", "ok", "okay", "pizza", "weekend"]);

// Question templates with the language of each captured span and of the options.
// `null` as a span language means "Danish unless the span holds a ___ blank".
const D = LANG_DA;
const E = LANG_EN;
export const QUESTION_TEMPLATES = [
  { id: "fill", re: /^Hvilket ord passer: '(.+)'(?: \(([^()]+)\))?$/, spans: [E, D], options: E },
  { id: "meaning_in", re: /^Hvad betyder '([^']+(?:'[a-z][^']*)*)' i '(.+)'\??$/, spans: [E, E], options: D },
  { id: "meaning", re: /^Hvad betyder '([^']+(?:'[a-z][^']*)*)'\??$/, spans: [E], options: D },
  { id: "da_to_en_in", re: /^Hvad hedder '([^']+)' på engelsk i '(.+)'\?$/, spans: [D, null], options: E },
  { id: "da_to_en", re: /^Hvad hedder '([^']+)' på engelsk\?$/, spans: [D], options: E },
  { id: "opposite", re: /^Hvilket ord betyder det modsatte af '([^']+)'(?: i '(.+)')?\?$/, spans: [E, E], options: E },
  { id: "synonym", re: /^Hvilket ord betyder næsten det samme som '([^']+)'(?: i '(.+)')?\?$/, spans: [E, E], options: E },
  { id: "read", re: /^Læs: '(.+)' (Hv[^']*\?)$/, spans: [E, D], options: D },
  { id: "say", re: /^Hvad siger man på engelsk, når ([^']+)\?$/, spans: [D], options: E },
];

// The only templates new questions (reverse + authored) may use.
export const NEW_ITEM_TEMPLATES = new Set(QUESTION_TEMPLATES.map((template) => template.id));

export function matchTemplate(question) {
  for (const template of QUESTION_TEMPLATES) {
    const match = template.re.exec(question);
    if (match) return { template, match };
  }
  return null;
}

// Checks that every word of a templated question and of its options is read in the expected
// language by the read-aloud segmenter. Untemplated questions only get the generic check that no
// quoted span is split across voices on the word lists alone.
// Fallback for the reused questions with a one-off frame ("Hvad betyder 'Cheers!', når man løfter
// glasset?"): the Danish frame is read in Danish; a quoted span is Danish when it holds æ/ø/å or is
// the word asked for "på engelsk" / "Hvilket ord for '…'", otherwise English; all options share one
// language, Danish when they contain æ/ø/å or Danish words, otherwise English.
function genericExpectation(q, o) {
  const spans = quotedSpans(q);
  const askedAt = q.indexOf("på engelsk");
  let rest = q;
  let offset = 0;
  const parts = [];
  for (const span of spans) {
    const at = rest.indexOf(`'${span}'`);
    parts.push({ text: rest.slice(0, at), lang: D });
    const position = offset + at;
    let lang;
    if (/[æøåÆØÅ]/.test(span)) lang = D;
    else if (/___/.test(span)) lang = E;
    else if (askedAt >= 0 && position < askedAt) lang = textLang(span) === "en" ? E : D; // the word asked for
    else if (askedAt >= 0 && position > askedAt) lang = textLang(span) === "en" ? E : D; // Danish example
    else if (/ord for '$/.test(q.slice(0, position + 1))) lang = D;
    else lang = textLang(span) === "da" ? D : E;
    parts.push({ text: span, lang });
    rest = rest.slice(at + span.length + 2);
    offset = position + span.length + 2;
  }
  // "Læs: '…,' she said. Hvordan …?" — narration between the quote and the Danish question is English.
  const lastDanish = rest.search(/\bHv[a-zæøå]+ /);
  if (q.startsWith("Læs: ") && lastDanish > 0) {
    parts.push({ text: rest.slice(0, lastDanish), lang: E });
    parts.push({ text: rest.slice(lastDanish), lang: D });
  } else {
    parts.push({ text: rest, lang: D });
  }
  let optionsLang;
  if (/^(Hvad betyder|Læs:)/.test(q)) optionsLang = D;
  else if (/på engelsk|passer|modsatte|samme som|datid|flertal|sætning|formulering|udtryk|ord for|Hvordan spørger|Hvad siger man|Hvilket dyr|Hvilken (dag|måned|årstid)|Hvad hedder en/.test(q)) optionsLang = E;
  else optionsLang = textLang(o.join(" ")) === "da" ? D : E;
  return { parts, optionsLang };
}

export function segmentationProblems(item) {
  const problems = [];
  const { q, o } = item;
  const found = matchTemplate(q);
  if (!found) {
    const { parts, optionsLang } = genericExpectation(q, o);
    const spoken = spokenWords(segmentQuestion(q));
    const expected = parts.flatMap((part) => wordsOf(part.text).map((word) => [word, part.lang]));
    if (spoken.length !== expected.length) problems.push("generic: word count differs");
    else {
      expected.forEach(([word, lang], index) => {
        if (spoken[index][1] !== lang && !EITHER_LANGUAGE.has(word.toLowerCase())) {
          problems.push(`question word "${word}" read as ${spoken[index][1]}, expected ${lang}`);
        }
      });
    }
    for (const option of o) {
      const quoted = new Set(quotedSpans(option).flatMap(wordsOf));
      for (const [word, lang] of spokenWords(segmentOption(option, q, o))) {
        const want = quoted.has(word) ? E : optionsLang;
        if (lang !== want && !EITHER_LANGUAGE.has(word.toLowerCase())) {
          problems.push(`option word "${word}" in "${option}" read as ${lang}, expected ${want}`);
        }
      }
    }
    return problems;
  }
  const { template, match } = found;
  const spoken = spokenWords(segmentQuestion(q));
  let cursor = 0;
  for (let index = 0; index < template.spans.length; index++) {
    const span = match[index + 1];
    if (!span) continue;
    const lang = template.spans[index] ?? (span.includes("___") ? E : D);
    for (const word of wordsOf(span)) {
      while (cursor < spoken.length && spoken[cursor][0] !== word) cursor++;
      if (cursor >= spoken.length) {
        problems.push(`word "${word}" not spoken`);
        break;
      }
      if (spoken[cursor][1] !== lang && !EITHER_LANGUAGE.has(word.toLowerCase())) {
        problems.push(`question word "${word}" read as ${spoken[cursor][1]}, expected ${lang}`);
      }
      cursor++;
    }
  }
  for (const option of o) {
    const quoted = new Set(quotedSpans(option).flatMap(wordsOf));
    for (const [word, lang] of spokenWords(segmentOption(option, q, o))) {
      const expected = quoted.has(word) ? E : template.options;
      if (lang !== expected && !EITHER_LANGUAGE.has(word.toLowerCase())) {
        problems.push(`option word "${word}" in "${option}" read as ${lang}, expected ${expected}`);
      }
    }
  }
  return problems;
}

const MOJIBAKE = /Ã|Â|�/;

// Structural checks every one of the 5,000 rows must pass (short key shape: q/o/a/r/l/cefr/k).
export function structuralProblems(item) {
  const problems = [];
  const { q, o, a, r, l, cefr, k } = item;
  if (typeof q !== "string" || q.trim() !== q || q.length < 8) problems.push("question text missing or untrimmed");
  if (!Array.isArray(o) || o.length !== 4) problems.push("needs exactly four options");
  else {
    if (o.some((option) => typeof option !== "string" || option.trim() === "" || option.trim() !== option)) {
      problems.push("empty or untrimmed option");
    }
    if (new Set(o.map((option) => String(option).toLowerCase())).size !== 4) problems.push("options are not four different answers");
    if (!o.includes(a)) problems.push("correct answer not among the options");
    try {
      const cue = findLengthCue(o, a);
      if (cue) problems.push(`length cue: correct ${cue.correctLen} chars vs longest wrong ${cue.longestWrong}`);
    } catch (error) {
      problems.push(`length check failed: ${error.message}`);
    }
  }
  if (typeof r !== "string" || r.length < 10) problems.push("review text missing");
  if (!CEFR_RANGES[cefr]) problems.push(`invalid cefr ${cefr}`);
  else if (!Number.isInteger(l) || l < CEFR_RANGES[cefr][0] || l > CEFR_RANGES[cefr][1]) {
    problems.push(`level ${l} outside ${cefr}`);
  }
  if (!CONCEPT_KEYS.includes(k)) problems.push(`invalid concept key ${k}`);
  for (const text of [q, r, a, ...(Array.isArray(o) ? o : [])]) {
    if (typeof text === "string" && MOJIBAKE.test(text)) problems.push(`mojibake in "${text}"`);
  }
  if (typeof q === "string" && /___/.test(q) && (q.match(/___/g) ?? []).length !== 1) problems.push("more than one blank");
  return problems;
}

// Extra rules for questions written or generated in this PR (batch7-batch10).
export function newItemProblems(item) {
  const problems = [];
  const found = matchTemplate(item.q);
  if (!found) return ["new questions must use one of the checked templates"];
  const { template, match } = found;
  if (template.id === "fill" || template.id === "da_to_en_in") {
    const sentence = template.id === "fill" ? match[1] : match[2];
    if ((sentence.match(/___/g) ?? []).length !== 1) problems.push("the sentence needs exactly one ___");
  }
  if (template.id === "meaning_in") {
    const [, word, sentence] = match;
    if (!sentence.toLowerCase().includes(word.toLowerCase())) problems.push("the quoted word is not in the sentence");
  }
  if (template.id === "da_to_en_in" || template.id === "fill") {
    // The answer must fit the blank as written: no option may already be in the sentence.
    const sentence = (template.id === "fill" ? match[1] : match[2]).toLowerCase();
    for (const option of item.o) {
      if (new RegExp(`\\b${option.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(sentence.replace("___", " "))) {
        problems.push(`option "${option}" already appears in the sentence`);
      }
    }
  }
  // Mixed shapes give the answer away: either all options end in ! ? . or none do.
  const punctuated = item.o.map((option) => /[.!?]$/.test(option));
  if (new Set(punctuated).size !== 1) problems.push("options mix sentences and single words");
  // A letter-count or similar clue is not allowed.
  if (/bogstaver/.test(item.q)) problems.push("letter-count clue");
  return problems;
}

// What a question is actually about, so two questions with different wording but the same task
// count as the same question: the template plus its main English (or Danish) span, normalised.
export function substanceKey(question) {
  const found = matchTemplate(question);
  const norm = (text) => String(text).toLowerCase().replace(/[^a-zæøå0-9_ ]+/g, " ").replace(/\s+/g, " ").trim();
  if (!found) return `raw:${norm(question)}`;
  const { template, match } = found;
  switch (template.id) {
    case "fill":
      return `sentence:${norm(match[1])}`;
    case "meaning_in":
    case "meaning":
      return `en2da:${norm(match[1])}`;
    case "da_to_en_in":
    case "da_to_en":
      return `da2en:${norm(match[1])}`;
    case "opposite":
      return `opposite:${norm(match[1])}`;
    case "synonym":
      return `synonym:${norm(match[1])}`;
    case "read":
      return `read:${norm(match[1])}`;
    case "say":
      return `say:${norm(match[1])}`;
    default:
      return `raw:${norm(question)}`;
  }
}

export { LANG_DA, LANG_EN };
