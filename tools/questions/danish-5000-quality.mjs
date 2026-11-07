// Quality checks for the 5,000 new Danish questions (same approach as english-5000-quality.mjs).
//
// Pure functions shared by the generator (tools/questions/build-danish-5000.mjs), the item checker
// (tools/questions/check-danish-items.mjs) and the unit tests. Every check returns a list of
// problems (strings); an empty list means the item passes. Nothing here reads the database.
//
// Two rules are specific to Danish and protect grading, not style:
// - process_question_attempt compares options with normalize_choice_answer (D-290 G1): lower case,
//   punctuation kept. Two options that differ only in case therefore BOTH grade as correct, so a
//   capital-letter question can never be asked with options that differ only in case.
// - unique_question_text covers the whole bank, so a bare frame ("Hvilket ord er stavet rigtigt?")
//   can exist once only (PR #349): every question carries its own cue or sentence.

import { findLengthCue } from "../question-quality/length-cue.mjs";

export const CONCEPTS = {
  s: { concept: "stavning", skill: "recall", dtype: "factual", mis: "surface_association" },
  o: { concept: "ordforråd", skill: "recall", dtype: "factual", mis: "surface_association" },
  g: { concept: "grammatik", skill: "application", dtype: "applied", mis: "overgeneralization" },
  t: { concept: "tegnsætning", skill: "application", dtype: "applied", mis: "overgeneralization" },
  l: { concept: "læseforståelse", skill: "comprehension", dtype: "conceptual", mis: "surface_association" },
  f: { concept: "litteratur", skill: "analysis", dtype: "inferential", mis: "surface_association" },
};
export const CONCEPT_KEYS = Object.keys(CONCEPTS);
export const GRADES = [3, 4, 5, 6, 7, 8, 9];

// Questions per grade and concept: 5,000 in all, levels spread evenly over the scale.
export const QUOTA = {
  3: { s: 170, o: 190, g: 110, t: 60, l: 165, f: 20 },
  4: { s: 150, o: 190, g: 120, t: 70, l: 160, f: 25 },
  5: { s: 130, o: 190, g: 130, t: 75, l: 155, f: 40 },
  6: { s: 120, o: 190, g: 130, t: 75, l: 165, f: 60 },
  7: { s: 110, o: 190, g: 130, t: 70, l: 142, f: 85 },
  8: { s: 100, o: 190, g: 130, t: 65, l: 107, f: 105 },
  9: { s: 90, o: 190, g: 130, t: 55, l: 96, f: 125 },
};

// One slot = one author's share: a concept over some grades.
export const SLOTS = {
  s34: ["s", [3, 4]], s56: ["s", [5, 6]], s789: ["s", [7, 8, 9]],
  o3: ["o", [3]], o4: ["o", [4]], o5: ["o", [5]], o6: ["o", [6]], o7: ["o", [7]], o8: ["o", [8]], o9: ["o", [9]],
  g34: ["g", [3, 4]], g56: ["g", [5, 6]], g78: ["g", [7, 8]], g9: ["g", [9]],
  t345: ["t", [3, 4, 5]], t6789: ["t", [6, 7, 8, 9]],
  l34: ["l", [3, 4]], l56: ["l", [5, 6]], l789: ["l", [7, 8, 9]],
  f3456: ["f", [3, 4, 5, 6]], f789: ["f", [7, 8, 9]],
};

// Inverse of the §4.1 start formula (docs/difficulty-scale-design.md): 35 equal cells over 1-10,000.
export function gradeBandForLevel(level) {
  if (!Number.isInteger(level) || level < 1 || level > 10000) {
    throw new Error(`level must be an integer 1-10000, got ${level}`);
  }
  const cell = Math.ceil((level * 35) / 10000) - 1;
  return { g: 3 + Math.floor(cell / 5), b: (cell % 5) + 1 };
}

// challenge_role / insight_type per level, the same three steps as English.
export function roleForLevel(level) {
  if (level <= 5000) return ["reinforcement", "conceptual_bridge"];
  if (level <= 8500) return ["challenge", "reframing"];
  return ["deep_challenge", "perspective_shift"];
}

// JS twin of the case and whitespace part of public.normalize_choice_answer (punctuation is kept).
export function gradingKey(text) {
  return String(text).normalize("NFC").replace(/[‘’ʼ′`´]/g, "'").toLowerCase().replace(/\s+/g, " ").trim();
}

const MOJIBAKE = /Ã|Â|�/;
const HAS_LETTER = /\p{L}/u;
const NON_ANSWERS = /^(alle (ovenstående|svarene)|ingen af (dem|svarene|ovenstående)|ved ikke|begge dele)\b/i;
const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function structuralProblems(item) {
  const problems = [];
  const { q, o, a, r, l, k } = item ?? {};
  if (typeof q !== "string" || q.trim() !== q || q.length < 12) problems.push("question text missing, short or untrimmed");
  if (!Array.isArray(o) || o.length !== 4) problems.push("needs exactly four options");
  else if (o.some((option) => typeof option !== "string" || option.trim() === "" || option.trim() !== option)) {
    problems.push("empty or untrimmed option");
  } else {
    if (new Set(o.map(gradingKey)).size !== 4) problems.push("options are equal for grading (differ only in case or spacing)");
    if (o.some((option) => !HAS_LETTER.test(option))) problems.push("every option must contain a letter");
    if (o.some((option) => NON_ANSWERS.test(option))) problems.push("catch-all option (alle/ingen af ovenstående)");
    if (new Set(o.map((option) => /[.!?]$/.test(option))).size !== 1) problems.push("options mix sentences and single words");
    if (!o.includes(a)) problems.push("correct answer not among the options");
    else {
      const cue = findLengthCue(o, a);
      if (cue) problems.push(`length cue: correct ${cue.correctLen} chars vs longest wrong ${cue.longestWrong}`);
    }
  }
  if (typeof r !== "string" || r.trim() !== r || r.length < 15) problems.push("review text missing or too short");
  if (!Number.isInteger(l) || l < 1 || l > 10000) problems.push(`invalid level ${l}`);
  if (!CONCEPT_KEYS.includes(k)) problems.push(`invalid concept key ${k}`);
  for (const text of [q, r, a, ...(Array.isArray(o) ? o : [])]) {
    if (typeof text !== "string") continue;
    if (MOJIBAKE.test(text)) problems.push(`mojibake in "${text}"`);
    if (text.includes("$$")) problems.push("text contains $$, which ends the SQL dollar quote");
  }
  if (typeof q === "string" && (q.match(/___/g) ?? []).length > 1) problems.push("more than one blank");
  if (typeof q === "string" && typeof a === "string" && (k === "s" || k === "o")) {
    if (new RegExp(`(^|[^\\p{L}])${escapeRe(a)}($|[^\\p{L}])`, "iu").test(q)) problems.push("the answer stands in the question");
  }
  return problems;
}

// Blocked topics (owner decision 2026-11-06, D-358): reading and literature texts about death, serious
// illness, divorce, money trouble, losing a job, bullying or a political stance. This catches the clear
// cases only: it cannot see an opinion, and AUTHORING.md holds the rule. Neutral words and facts are
// allowed, so vocabulary and spelling are not scanned. `approved` holds the texts a teacher has passed.
const KIN = "mor|far|mormor|morfar|farmor|farfar|bedstemor|bedstefar|mand|kone|søster|bror|onkel|moster|faster";
const BLOCKED_TOPICS = [
  /\b(begravelse\w*|dødsfald|selvmord\w*|gravsten\w*|kirkegård\w*|skilsmisse\w*|skilles|fyring\w*|arbejdsløs\w*|hjemløs\w*|gæld|gælden|mobb\w*|mobning\w*)\b/i,
  /\b(blev|er|bliver) fyret\b/i,
  /\b(da|efter at) (hun|han) (døde|var død)\b/i,
  new RegExp(`\\b(${KIN})\\b[^.!?]{0,40}\\b(døde|død|blev syg|er syg|var syg)\\b`, "i"),
];

export function blockedTopicProblems(item, approved) {
  if (item.k !== "l" && item.k !== "f") return [];
  if (approved.has(item.q)) return [];
  const hit = BLOCKED_TOPICS.find((pattern) => pattern.test(item.q));
  return hit ? [`blocked topic: "${hit.exec(item.q)[0]}"`] : [];
}

const norm = (text) => String(text).toLowerCase().replace(/[^\p{L}0-9_ ]+/gu, " ").replace(/\s+/g, " ").trim();
const firstQuoted = (text) => {
  const found = /'([^']+)'/.exec(text);
  return found ? found[1] : null;
};

// What a question is about, so two wordings of the same task count as one question.
export function substanceKey(item) {
  const { k, q, a } = item;
  if (k === "s") return `s:${norm(a)}`;
  if (k === "o") return `o:${norm(firstQuoted(q) ?? q)}:${norm(a)}`;
  return `${k}:${norm(q)}`;
}
