// Builds the English migrations batch7-batch10 (1,880 inactive questions) for the owner's goal of
// 5,000 NEW English questions (owner decisions 2026-11-05; docs/difficulty-scale-design.md §7, §10).
//
//   node tools/questions/build-english-5000.mjs [--check]
//
// Two sources, both checked by tools/questions/english-5000-quality.mjs:
// - reverse vocabulary questions ("Hvad hedder '<dansk>' på engelsk …?") derived from the
//   English→Danish vocabulary questions in pilot/batch2-batch6. Only words that appear literally in
//   their example sentence (the sentence is reused with ___) or that were asked without a sentence.
//   The wrong options were chosen by hand (same word class and level, different meaning) and live in
//   tools/questions/fixtures/english-5000/reverse-options.json;
// - questions written from scratch, in tools/questions/fixtures/english-5000/authored.json.
// The old "full sentence" variants (the same fill-in questions with the blank filled in) are gone:
// they were the same task as their source question.
//
// --check: build in memory and compare with the migration files on disk instead of writing them.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bankIndex } from "./check-english-items.mjs";
import {
  CEFR_ORDER,
  CEFR_RANGES,
  ROLE_BY_CEFR,
  gradeBandForLevel,
  matchTemplate,
  newItemProblems,
  segmentationProblems,
  structuralProblems,
  substanceKey,
} from "./english-5000-quality.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");
const FIXTURES = join(ROOT, "tools", "questions", "fixtures", "english-5000");
const AUTHORED = join(FIXTURES, "authored.json");
const REVERSE_OPTIONS = join(FIXTURES, "reverse-options.json");

const SOURCE_PATTERN = /^202610201[3-8]000[1-3]_english_level_(?:pilot|batch[2-6])_[123]\.sql$/;
export const BATCHES = ["batch7", "batch8", "batch9", "batch10"];
const VERSION_HOURS = [19, 20, 21, 22];
const PART_SIZES = [157, 157, 156];

// How many questions each CEFR level gets in batch7-batch10 (1,880 in all), and how many of those
// are reverse vocabulary questions. The rest are written from scratch.
export const ADDED_PER_CEFR = { "pre-A1": 200, A1: 250, A2: 330, B1: 380, B2: 360, C1: 360 };
export const REVERSE_PER_CEFR = { "pre-A1": 30, A1: 50, A2: 33, B1: 125, B2: 120, C1: 142 };

function fail(message) {
  throw new Error(`build-english-5000: ${message}`);
}

export function extractJsonArray(sql, file) {
  const marker = "jsonb_array_elements($$";
  const start = sql.indexOf(marker);
  if (start < 0) fail(`${file}: JSON array marker missing`);
  const from = start + marker.length;
  const end = sql.indexOf("$$", from);
  if (end < 0) fail(`${file}: JSON array end marker missing`);
  return JSON.parse(sql.slice(from, end));
}

export function loadSourceEntries() {
  const files = readdirSync(MIGRATIONS).filter((file) => SOURCE_PATTERN.test(file)).sort();
  if (files.length !== 18) fail(`expected 18 source migrations, found ${files.length}`);
  const entries = [];
  for (const file of files) {
    for (const entry of extractJsonArray(readFileSync(join(MIGRATIONS, file), "utf8"), file)) entries.push(entry);
  }
  if (entries.length !== 3000) fail(`expected 3,000 source questions, found ${entries.length}`);
  return entries;
}

// ── Reverse vocabulary questions ─────────────────────────────────────────────
const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const normalise = (text) => String(text).toLowerCase().replace(/[^a-zæøå ]+/g, " ").replace(/\s+/g, " ").trim();
const glossWords = (gloss) => new Set(normalise(gloss).split(" ").filter((word) => word.length >= 4));
const glossParts = (gloss) => new Set(String(gloss).toLowerCase().split(/[/,;()]| eller /).map(normalise).filter(Boolean));

function sameMeaning(left, right) {
  for (const part of glossParts(left)) if (glossParts(right).has(part)) return true;
  for (const word of glossWords(left)) if (glossWords(right).has(word)) return true;
  return false;
}

function editDistance(left, right) {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= right.length; j++) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (left[i - 1] === right[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[right.length];
}

// Two forms of one word ("spend"/"spent", "complain"/"complained") are not a fair distractor pair.
function looksLikeForm(left, right) {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  if (a.startsWith(b) || b.startsWith(a)) return true;
  return editDistance(a, b) <= 2 && a.slice(0, 3) === b.slice(0, 3);
}

function vocabularyEntries(entries) {
  const result = [];
  for (const entry of entries) {
    const found = matchTemplate(entry.q);
    if (!found || (found.template.id !== "meaning" && found.template.id !== "meaning_in")) continue;
    const headword = found.match[1].trim();
    if (/[.!?]$/.test(headword) || !/^[A-Za-z][A-Za-z' -]*$/.test(headword) || headword.split(" ").length > 4) continue;
    const gloss = entry.a.trim();
    if (/[.!?]$/.test(gloss) || gloss.split(/\s+/).length > 5) continue;
    let context = null;
    if (found.template.id === "meaning_in") {
      // Only when the word stands literally in the sentence: an inflected form ("complained") would
      // make the Danish gloss and the English answer disagree.
      const word = new RegExp(`(^|[^A-Za-z'])${escapeRe(headword)}(?=$|[^A-Za-z'])`, "i");
      if (!word.test(found.match[2])) continue;
      context = found.match[2].replace(word, (_match, before) => `${before}___`);
    }
    result.push({ entry, headword, gloss, context });
  }
  return result;
}

function chooseDistractors(target, candidates, ordinal) {
  const tokens = (text) => text.split(" ").length;
  const usable = candidates.filter((candidate) =>
    candidate.headword.toLowerCase() !== target.headword.toLowerCase()
    && tokens(candidate.headword) === tokens(target.headword)
    && !looksLikeForm(candidate.headword, target.headword)
    && !sameMeaning(candidate.gloss, target.gloss)
    && (target.context === null
      || !new RegExp(`\\b${escapeRe(candidate.headword)}\\b`, "i").test(target.context)));
  const ending = (text) => text.slice(-2).toLowerCase();
  const score = (candidate) =>
    Math.abs(candidate.headword.length - target.headword.length) * 3
    + (ending(candidate.headword) === ending(target.headword) ? -4 : 0);
  const ranked = [...new Map(usable.map((candidate) => [candidate.headword.toLowerCase(), candidate])).values()]
    .sort((left, right) => score(left) - score(right) || left.headword.localeCompare(right.headword, "en"));
  const window = ranked.slice(0, 9);
  const chosen = [];
  for (let offset = 0; offset < window.length && chosen.length < 3; offset++) {
    const candidate = window[(ordinal + offset) % window.length];
    if (chosen.some((other) => looksLikeForm(other.headword, candidate.headword) || sameMeaning(other.gloss, candidate.gloss))) continue;
    chosen.push(candidate);
  }
  return chosen.length === 3 ? chosen.map((candidate) => candidate.headword) : null;
}

// Every reverse question that passes all checks, per CEFR level.
// With `curated` (question → three wrong options, reviewed by hand), only curated questions are
// built and they get those options; without it, distractors are picked automatically as a seed for
// the curation.
// `reserved`: substance keys already taken by questions written from scratch; those win.
export function reverseCandidates(entries, bank, curated = null, reserved = new Set()) {
  const vocabulary = vocabularyEntries(entries);
  const byCefr = {};
  for (const item of vocabulary) (byCefr[item.entry.cefr] ??= []).push(item);
  const result = {};
  const usedKeys = new Set(reserved);
  for (const cefr of CEFR_ORDER) {
    const pool = (byCefr[cefr] ?? []).sort((left, right) => left.entry.l - right.entry.l || left.entry.q.localeCompare(right.entry.q, "da"));
    const built = [];
    pool.forEach((target, ordinal) => {
      const [, hi] = CEFR_RANGES[cefr];
      const forms = target.context
        ? [`Hvad hedder '${target.gloss}' på engelsk i '${target.context}'?`, `Hvad hedder '${target.gloss}' på engelsk?`]
        : [`Hvad hedder '${target.gloss}' på engelsk?`];
      for (const q of forms) {
        const key = substanceKey(q);
        if (bank.keys.has(key) || usedKeys.has(key) || bank.texts.has(q)) continue;
        if (curated && !curated.has(q)) continue;
        const distractors = curated ? curated.get(q) : chooseDistractors(target, pool, ordinal);
        if (!distractors) continue;
        const item = {
          l: Math.min(hi, target.entry.l + 100),
          cefr,
          k: "o",
          q,
          o: [target.headword, ...distractors],
          a: target.headword,
          r: target.entry.r.toLowerCase().includes(target.headword.toLowerCase())
            ? target.entry.r
            : `'${target.headword}' betyder ${target.gloss}. ${target.entry.r}`,
          variant: "reverse_meaning",
        };
        const problems = [...structuralProblems(item), ...newItemProblems(item), ...segmentationProblems(item)];
        if (problems.length) continue;
        usedKeys.add(key);
        built.push(item);
        break;
      }
    });
    result[cefr] = built;
  }
  return result;
}

export function loadReverseOptions() {
  const map = JSON.parse(readFileSync(REVERSE_OPTIONS, "utf8"));
  const result = new Map();
  for (const [question, wrong] of Object.entries(map)) {
    if (!Array.isArray(wrong) || wrong.length !== 3) fail(`reverse-options.json: three wrong options needed for ${question}`);
    result.set(question, wrong);
  }
  return result;
}

export function buildReverseItems(entries, bank, reserved) {
  const candidates = reverseCandidates(entries, bank, loadReverseOptions(), reserved);
  const result = [];
  for (const cefr of CEFR_ORDER) {
    const built = candidates[cefr];
    const quota = REVERSE_PER_CEFR[cefr];
    if (built.length < quota) fail(`${cefr}: only ${built.length} reverse questions pass, need ${quota}`);
    // Spread the chosen ones evenly over the level range of the CEFR group.
    for (let index = 0; index < quota; index++) result.push(built[Math.floor((index * built.length) / quota)]);
  }
  return result;
}

// ── Questions written from scratch ───────────────────────────────────────────
export function loadAuthored() {
  const items = JSON.parse(readFileSync(AUTHORED, "utf8"));
  if (!Array.isArray(items)) fail("authored.json must hold an array");
  return items.map((item) => ({ ...item, variant: "authored" }));
}

function placeCorrect(item, position) {
  const wrong = item.o.filter((option) => option !== item.a);
  if (wrong.length !== 3) fail(`not three wrong options: ${item.q}`);
  wrong.splice(position, 0, item.a);
  return { ...item, o: wrong };
}

export function buildVariants() {
  const entries = loadSourceEntries();
  const bank = bankIndex();
  const authored = loadAuthored();
  const reverse = buildReverseItems(entries, bank, new Set(authored.map((item) => substanceKey(item.q))));
  const all = [];
  for (const cefr of CEFR_ORDER) {
    const own = authored.filter((item) => item.cefr === cefr);
    const needed = ADDED_PER_CEFR[cefr] - REVERSE_PER_CEFR[cefr];
    if (own.length !== needed) fail(`${cefr}: authored.json has ${own.length}, need exactly ${needed}`);
    all.push(...reverse.filter((item) => item.cefr === cefr), ...own);
  }
  if (all.length !== 1880) fail(`expected 1,880 questions, built ${all.length}`);

  const texts = new Set();
  const keys = new Set();
  for (const item of all) {
    const problems = [...structuralProblems(item), ...newItemProblems(item), ...segmentationProblems(item)];
    if (problems.length) fail(`${item.q}: ${problems.join("; ")}`);
    const key = substanceKey(item.q);
    if (texts.has(item.q) || keys.has(key)) fail(`duplicate task: ${item.q}`);
    if (bank.texts.has(item.q) || bank.keys.has(key)) fail(`already in the bank: ${item.q}`);
    texts.add(item.q);
    keys.add(key);
  }
  return all;
}

// ── Migration files ──────────────────────────────────────────────────────────
function rowJson(item) {
  const { g, b } = gradeBandForLevel(item.l);
  const [role, insight] = ROLE_BY_CEFR[item.cefr];
  return JSON.stringify({
    l: item.l, g, b, cefr: item.cefr, role, insight, k: item.k, variant: item.variant,
    q: item.q, o: item.o, a: item.a, r: item.r,
  });
}

function sqlForPart(batch, part, items) {
  const levels = items.map((item) => item.l);
  const counts = { reverse_meaning: 0, authored: 0 };
  for (const item of items) counts[item.variant]++;
  return `-- Engelsk ${batch} ${part}/3: ${items.length} MC-spørgsmål på sværhedsskalaen 1-10.000, niveau ${Math.min(...levels)}-${Math.max(...levels)}.
-- Del af ejerens mål 2026-11-05 om 5.000 NYE engelskopgaver (docs/difficulty-scale-design.md §7 og §10).
-- ${counts.authored} er skrevet fra bunden, ${counts.reverse_meaning} er omvendte ordforrådsopgaver (dansk → engelsk)
-- bygget på ordforrådsopgaverne i pilot/batch2-batch6. Genereret af tools/questions/build-english-5000.mjs;
-- ret i generatoren eller i tools/questions/fixtures/english-5000/authored.json, ikke her.
-- Kræver migration A (20261020120000_difficulty_scale_a): kolonnen questions.difficulty_level.
--
-- Niveau og CEFR: hver opgave har et eksplicit difficulty_level inden for sin CEFR-gruppe
-- (før-A1 1-1500, A1 1501-3000, A2 3001-5000, B1 5001-7000, B2 7001-8500, C1 8501-10000).
-- target_grade/difficulty_band er afledt baglæns af niveauet (cellen i §4.1).
--
-- INAKTIV VED INDSÆTTELSEN: alle rækker får is_active=false og metadata.level_batch='${batch}'.
-- Aktivering er en SEPARAT migration efter dokumenteret stikprøvekontrol og særskilt ejergodkendelse.
-- Må KUN anvendes via apply_migration med særskilt ejer-autorisation (D-110).

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band, difficulty_level)
SELECT
  jsonb_build_object('question', e->>'q', 'options', e->'o', 'correct', e->>'a',
                     'accepted_answers', jsonb_build_array(e->>'a'), 'review_text', e->>'r'),
  'mc', 'short',
  jsonb_build_object('concepts', jsonb_build_array(m.concept), 'cognitive_skill', m.skill,
                     'difficulty_type', m.dtype, 'misconception_type', m.mis,
                     'challenge_role', e->>'role', 'insight_type', e->>'insight',
                     'cefr', e->>'cefr', 'practice_variant', e->>'variant',
                     'level_batch', '${batch}', 'domain', 'english'),
  'mc_single', (e->>'b')::int, 'auto', false, 'english', (e->>'g')::int,
  (e->>'b')::int, (e->>'l')::int
FROM jsonb_array_elements($$[
${items.map(rowJson).join(",\n")}
]$$::jsonb) AS e
JOIN (VALUES
  ('o', 'ordforråd', 'recall', 'factual', 'surface_association'),
  ('h', 'hverdagsudtryk', 'comprehension', 'conceptual', 'surface_association'),
  ('g', 'grammatik', 'application', 'applied', 'overgeneralization'),
  ('l', 'læseforståelse', 'analysis', 'inferential', 'surface_association')
) AS m(k, concept, skill, dtype, mis) ON m.k = e->>'k';
`;
}

export function migrationFiles() {
  const sorted = buildVariants().sort((left, right) => left.l - right.l || left.q.localeCompare(right.q, "da"));
  const batches = BATCHES.map(() => []);
  // Round-robin over the level order gives every batch the whole level range; the correct answer
  // cycles through the four positions inside each batch.
  sorted.forEach((item, index) => {
    batches[index % 4].push(placeCorrect(item, Math.floor(index / 4) % 4));
  });
  const files = {};
  batches.forEach((items, batchIndex) => {
    if (items.length !== 470) fail(`${BATCHES[batchIndex]} has ${items.length}, expected 470`);
    let offset = 0;
    PART_SIZES.forEach((size, partIndex) => {
      const part = items.slice(offset, offset + size);
      offset += size;
      const version = `20261020${String(VERSION_HOURS[batchIndex]).padStart(2, "0")}000${partIndex + 1}`;
      files[`${version}_english_level_${BATCHES[batchIndex]}_${partIndex + 1}.sql`] =
        sqlForPart(BATCHES[batchIndex], partIndex + 1, part);
    });
  });
  return files;
}

function main() {
  const check = process.argv.includes("--check");
  const files = migrationFiles();
  const stale = [];
  for (const [name, sql] of Object.entries(files)) {
    const path = join(MIGRATIONS, name);
    if (check) {
      let current = null;
      try {
        current = readFileSync(path, "utf8");
      } catch {
        current = null;
      }
      if (current !== sql) stale.push(name);
    } else {
      writeFileSync(path, sql, "utf8");
    }
  }
  if (stale.length) {
    console.error(`out of date, run node tools/questions/build-english-5000.mjs: ${stale.join(", ")}`);
    process.exit(1);
  }
  console.log(`${check ? "checked" : "wrote"} ${Object.keys(files).length} migrations with 1,880 questions`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === join(process.argv[1])) main();
