// Checks the authored Danish questions before they go into a migration.
//
//   node tools/questions/check-danish-items.mjs <slot>   one author's share, e.g. s34
//   node tools/questions/check-danish-items.mjs --all    all slots, including across slots
//   node tools/questions/check-danish-items.mjs --cross  only overlaps across the slots written so far
//
// Reads tools/questions/fixtures/danish-5000/<slot>-NN.json (arrays of {l,k,q,o,a,r}).
// Exits 1 and lists every problem when anything fails.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractMcQuestions } from "../question-quality/length-cue.mjs";
import { QUOTA, SLOTS, blockedTopicProblems, gradeBandForLevel, structuralProblems, substanceKey } from "./danish-5000-quality.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");
export const FIXTURES = join(ROOT, "tools", "questions", "fixtures", "danish-5000");
const GENERATED = /_danish_level_/;

export function loadSlot(slot) {
  const pattern = new RegExp(`^${slot}-\\d+\\.json$`);
  const items = [];
  for (const file of readdirSync(FIXTURES).filter((name) => pattern.test(name)).sort()) {
    const parsed = JSON.parse(readFileSync(join(FIXTURES, file), "utf8"));
    if (!Array.isArray(parsed)) throw new Error(`${file}: not an array`);
    parsed.forEach((item, index) => items.push({ ...item, at: `${file}#${index + 1}` }));
  }
  return items;
}

// Every question text in the other migrations (the generated Danish files are rebuilt from the fixtures).
export function bankTexts() {
  const texts = new Set();
  for (const file of readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql") && !GENERATED.test(name))) {
    for (const entry of extractMcQuestions(readFileSync(join(MIGRATIONS, file), "utf8"))) {
      const text = entry?.question ?? entry?.q;
      if (text) texts.add(text);
    }
  }
  return texts;
}

// The texts on blocked topics that a teacher has passed (D-358). New questions are never added here.
export function teacherApproved() {
  return new Set(JSON.parse(readFileSync(join(FIXTURES, "teacher-approved.json"), "utf8")));
}

export function slotProblems(slot, items, bank) {
  const [concept, grades] = SLOTS[slot];
  const approved = teacherApproved();
  const problems = [];
  const counts = {};
  const bands = {};
  const seenText = new Map();
  const seenKey = new Map();
  for (const item of items) {
    const say = (text) => problems.push(`${item.at}: ${text}`);
    structuralProblems(item).forEach(say);
    blockedTopicProblems(item, approved).forEach(say);
    if (item.k !== concept) say(`concept ${item.k}, slot is ${concept}`);
    if (Number.isInteger(item.l) && item.l >= 1 && item.l <= 10000) {
      const { g, b } = gradeBandForLevel(item.l);
      if (!grades.includes(g)) say(`level ${item.l} is grade ${g}, outside this slot`);
      counts[g] = (counts[g] ?? 0) + 1;
      bands[`${g}.${b}`] = (bands[`${g}.${b}`] ?? 0) + 1;
    }
    if (bank.has(item.q)) say("question text already in the bank");
    if (seenText.has(item.q)) say(`same text as ${seenText.get(item.q)}`);
    seenText.set(item.q, item.at);
    const key = substanceKey(item);
    if (seenKey.has(key)) say(`same task as ${seenKey.get(key)} (${key})`);
    seenKey.set(key, item.at);
  }
  // A pupil must gain nothing from the length alone, in either direction: the key should be the
  // longest option about as often as chance. Spelling is exempt: its options are forms of one word.
  if (concept !== "s" && items.length > 0) {
    const longest = items.filter((item) => Array.isArray(item.o)
      && [...item.a].length > Math.max(...item.o.filter((o) => o !== item.a).map((o) => [...o].length))).length;
    const share = longest / items.length;
    if (share < 0.15 || share > 0.35) {
      problems.push(`the key is the longest option in ${(share * 100).toFixed(1)} % of the questions, allowed 15-35 %`);
    }
  }
  for (const g of grades) {
    const want = QUOTA[g][concept];
    if ((counts[g] ?? 0) !== want) problems.push(`grade ${g}: ${counts[g] ?? 0} questions, quota ${want}`);
    const floor = Math.floor((want / 5) * 0.6);
    for (let b = 1; b <= 5; b++) {
      const have = bands[`${g}.${b}`] ?? 0;
      if (have < floor) problems.push(`grade ${g} band ${b}: ${have} questions, at least ${floor}`);
    }
  }
  return problems;
}

export function crossSlotProblems(all) {
  const problems = [];
  const text = new Map();
  const key = new Map();
  for (const item of all) {
    if (text.has(item.q)) problems.push(`${item.at}: same text as ${text.get(item.q)}`);
    text.set(item.q, item.at);
    const substance = substanceKey(item);
    if (key.has(substance)) problems.push(`${item.at}: same task as ${key.get(substance)} (${substance})`);
    key.set(substance, item.at);
  }
  return problems;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = process.argv[2];
  if (arg === "--cross") {
    // Overlap across all slots written so far; quotas are not checked, so it works mid-way.
    const found = crossSlotProblems(Object.keys(SLOTS).flatMap(loadSlot));
    found.forEach((problem) => console.log(`- ${problem}`));
    console.log(`${found.length} overlaps`);
    process.exit(found.length ? 1 : 0);
  }
  const slots = arg === "--all" ? Object.keys(SLOTS) : [arg];
  if (!slots.every((slot) => SLOTS[slot])) {
    console.error(`usage: check-danish-items.mjs <${Object.keys(SLOTS).join("|")}|--all>`);
    process.exit(2);
  }
  const bank = bankTexts();
  const problems = [];
  const all = [];
  for (const slot of slots) {
    const items = loadSlot(slot);
    all.push(...items);
    problems.push(...slotProblems(slot, items, bank));
  }
  if (arg === "--all") problems.push(...crossSlotProblems(all));
  console.log(`${all.length} questions checked, ${bank.size} bank texts, ${problems.length} problems`);
  problems.slice(0, 80).forEach((problem) => console.log(`- ${problem}`));
  if (problems.length > 80) console.log(`… and ${problems.length - 80} more`);
  process.exit(problems.length ? 1 : 0);
}
