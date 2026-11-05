// Checks a JSON file of English questions (short key shape) before it goes into a migration.
//
//   node tools/questions/check-english-items.mjs <items.json> [--reused | --reverse]
//
// Default (new questions): structure, length cue, read-aloud segmentation, the checked templates,
// and that neither the text nor the substance of a question already exists in any migration
// (batch7-batch10 excluded: they are regenerated from these inputs). --reused: structure, length
// cue and segmentation only, for corrections of existing questions.
// Exits 1 and lists every problem when anything fails.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractMcQuestions } from "../question-quality/length-cue.mjs";
import {
  matchTemplate,
  newItemProblems,
  segmentationProblems,
  structuralProblems,
  substanceKey,
} from "./english-5000-quality.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");
const REGENERATED = /^202610202[0-2]000\d_|^2026102019000\d_/;

const normWord = (text) => String(text).toLowerCase().replace(/[^a-z' -]+/g, " ").replace(/\s+/g, " ").trim();

// The English word or phrase a vocabulary question is about, or null for other templates:
// the quoted word for English→Danish, the answer for Danish→English.
export function englishHeadword(question, correct) {
  const found = matchTemplate(question);
  if (!found) return null;
  const { template, match } = found;
  if (template.id === "meaning" || template.id === "meaning_in") return normWord(match[1]);
  if (template.id === "da_to_en" || template.id === "da_to_en_in") return normWord(correct);
  return null;
}

export function bankIndex({ exclude = REGENERATED } = {}) {
  const texts = new Set();
  const keys = new Map();
  const headwords = new Map();
  for (const file of readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql")).sort()) {
    if (exclude.test(file)) continue;
    for (const question of extractMcQuestions(readFileSync(join(MIGRATIONS, file), "utf8"))) {
      if (typeof question.question !== "string") continue;
      texts.add(question.question);
      const key = substanceKey(question.question);
      if (!keys.has(key)) keys.set(key, `${file}: ${question.question}`);
      const headword = englishHeadword(question.question, question.correct);
      if (headword && !headwords.has(headword)) headwords.set(headword, `${file}: ${question.question}`);
    }
  }
  return { texts, keys, headwords };
}

function main() {
  const [path, flag] = process.argv.slice(2);
  if (!path) {
    console.error("usage: node tools/questions/check-english-items.mjs <items.json> [--reused]");
    process.exit(2);
  }
  const reused = flag === "--reused";
  // --reverse: the reverse vocabulary questions deliberately ask a bank word the other way round,
  // so only the new-question rules apply, not the novelty check.
  const reverse = flag === "--reverse";
  const items = JSON.parse(readFileSync(resolve(path), "utf8"));
  if (!Array.isArray(items)) throw new Error("the file must hold a JSON array");
  const bank = reused || reverse ? null : bankIndex();
  // --also <file.json>: questions written in parallel elsewhere count as part of the bank.
  const alsoAt = process.argv.indexOf("--also");
  if (bank && alsoAt > 0) {
    for (const other of JSON.parse(readFileSync(resolve(process.argv[alsoAt + 1]), "utf8"))) {
      bank.texts.add(other.q);
      bank.keys.set(substanceKey(other.q), `${process.argv[alsoAt + 1]}: ${other.q}`);
      const headword = englishHeadword(other.q, other.a);
      if (headword) bank.headwords.set(headword, `${process.argv[alsoAt + 1]}: ${other.q}`);
    }
  }
  const seenTexts = new Set();
  const seenKeys = new Set();
  const seenHeadwords = new Set();
  let failed = 0;
  items.forEach((item, index) => {
    const problems = [...structuralProblems(item)];
    const segmentation = segmentationProblems(item);
    if (!(reused && segmentation[0] === "untemplated")) problems.push(...segmentation);
    if (reverse) problems.push(...newItemProblems(item));
    if (!reused && !reverse) {
      problems.push(...newItemProblems(item));
      const key = substanceKey(item.q);
      if (bank.texts.has(item.q)) problems.push("question text already in a migration");
      if (bank.keys.has(key)) problems.push(`same task already in the bank: ${bank.keys.get(key)}`);
      // Vocabulary items must teach an English word the bank does not ask about in either direction.
      const headword = englishHeadword(item.q, item.a);
      if (headword && bank.headwords.has(headword)) {
        problems.push(`same task already in the bank (word "${headword}"): ${bank.headwords.get(headword)}`);
      }
      if (seenTexts.has(item.q) || seenKeys.has(key) || (headword && seenHeadwords.has(headword))) {
        problems.push("duplicate inside this file");
      }
      seenTexts.add(item.q);
      seenKeys.add(key);
      if (headword) seenHeadwords.add(headword);
    }
    if (problems.length) {
      failed++;
      console.log(`#${index + 1} ${item.q}\n  - ${problems.join("\n  - ")}`);
    }
  });
  console.log(`${items.length} items, ${failed} with problems`);
  process.exit(failed ? 1 : 0);
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) main();
