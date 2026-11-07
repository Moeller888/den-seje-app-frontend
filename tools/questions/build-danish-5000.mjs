// Builds the Danish migrations danish1-danish10 (5,000 inactive questions, 30 files) from the
// authored fixtures in tools/questions/fixtures/danish-5000/.
//
//   node tools/questions/build-danish-5000.mjs [--check]
//
// Deterministic: the same fixtures always give the same files. Every portion spans the whole level
// scale, and the correct answer is rotated so it stands evenly on the four places.
// Stops on any problem from tools/questions/check-danish-items.mjs.
//
// --check: build in memory and compare with the migration files on disk instead of writing them.

import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bankTexts, crossSlotProblems, loadSlot, slotProblems } from "./check-danish-items.mjs";
import { CONCEPTS, SLOTS, gradeBandForLevel, roleForLevel } from "./danish-5000-quality.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");

export const TOTAL = 5000;
export const BATCH_COUNT = 10;
const PART_SIZES = [167, 167, 166];
const GENERATED = /^202611071\d000[1-3]_danish_level_batch\d+_[123]\.sql$/;

function fail(message) {
  throw new Error(`build-danish-5000: ${message}`);
}

const compareItems = (left, right) => left.l - right.l || (left.q < right.q ? -1 : left.q > right.q ? 1 : 0);

export function loadItems() {
  const bank = bankTexts();
  const items = [];
  const problems = [];
  for (const slot of Object.keys(SLOTS)) {
    const slotItems = loadSlot(slot);
    problems.push(...slotProblems(slot, slotItems, bank));
    items.push(...slotItems);
  }
  problems.push(...crossSlotProblems(items));
  if (problems.length) fail(`${problems.length} problems, first: ${problems.slice(0, 5).join(" | ")}`);
  if (items.length !== TOTAL) fail(`expected ${TOTAL} questions, found ${items.length}`);
  return items.sort(compareItems);
}

// Moves the correct answer to `place`; the wrong options keep their order.
function placeAnswer(options, answer, place) {
  const rest = options.filter((option) => option !== answer);
  return [...rest.slice(0, place), answer, ...rest.slice(place)];
}

function rowFor(item, place) {
  const { g, b } = gradeBandForLevel(item.l);
  const [role, insight] = roleForLevel(item.l);
  return {
    l: item.l, g, b, role, insight, k: item.k, variant: "authored",
    q: item.q, o: placeAnswer(item.o, item.a, place), a: item.a, r: item.r,
  };
}

// Item i of the level-sorted list goes to portion i % 10, so every portion spans the whole scale.
export function portions(items) {
  const batches = Array.from({ length: BATCH_COUNT }, () => []);
  items.forEach((item, index) => {
    const batch = batches[index % BATCH_COUNT];
    batch.push(rowFor(item, batch.length % 4));
  });
  return batches;
}

function sqlFor(rows, batch, part) {
  const levels = rows.map((row) => row.l);
  const lines = rows.map((row) => JSON.stringify(row)).join(",\n");
  if (lines.includes("$$")) fail("a row contains the dollar quote");
  const values = Object.entries(CONCEPTS)
    .map(([key, m]) => `  ('${key}', '${m.concept}', '${m.skill}', '${m.dtype}', '${m.mis}')`)
    .join(",\n");
  return `-- Dansk portion ${batch} del ${part}/3: ${rows.length} MC-spørgsmål på sværhedsskalaen 1-10.000, niveau ${levels[0]}-${levels[levels.length - 1]}.
-- Del af de 5.000 nye danskopgaver. Skrevet fra bunden til dansk folkeskole, 3.-9. klasse.
-- Genereret af tools/questions/build-danish-5000.mjs; ret i tools/questions/fixtures/danish-5000/, ikke her.
-- Kræver migration A (20261020120000_difficulty_scale_a): kolonnen questions.difficulty_level.
--
-- Niveau: hver opgave har et eksplicit difficulty_level (forfatterens skøn, ikke en måling).
-- target_grade/difficulty_band er afledt baglæns af niveauet (cellen i §4.1).
--
-- INAKTIV VED INDSÆTTELSEN: alle rækker får is_active=false og metadata.level_batch='danish${batch}'.
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
                     'practice_variant', e->>'variant',
                     'level_batch', 'danish${batch}', 'domain', 'danish'),
  'mc_single', (e->>'b')::int, 'auto', false, 'danish', (e->>'g')::int,
  (e->>'b')::int, (e->>'l')::int
FROM jsonb_array_elements($$[
${lines}
]$$::jsonb) AS e
JOIN (VALUES
${values}
) AS m(k, concept, skill, dtype, mis) ON m.k = e->>'k';
`;
}

export function migrationFiles(items = loadItems()) {
  const files = new Map();
  portions(items).forEach((rows, index) => {
    const batch = index + 1;
    let from = 0;
    PART_SIZES.forEach((size, partIndex) => {
      const part = partIndex + 1;
      const name = `202611071${index}000${part}_danish_level_batch${batch}_${part}.sql`;
      files.set(name, sqlFor(rows.slice(from, from + size), batch, part));
      from += size;
    });
    if (from !== rows.length) fail(`portion ${batch} has ${rows.length} rows, parts cover ${from}`);
  });
  return files;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = migrationFiles();
  if (process.argv.includes("--check")) {
    const stale = [...files].filter(([name, sql]) => {
      const path = join(MIGRATIONS, name);
      return !existsSync(path) || readFileSync(path, "utf8") !== sql;
    });
    if (stale.length) fail(`${stale.length} files differ from the generator, first ${stale[0][0]}`);
    console.log(`${files.size} files match the generator`);
  } else {
    for (const name of readdirSync(MIGRATIONS).filter((file) => GENERATED.test(file))) unlinkSync(join(MIGRATIONS, name));
    for (const [name, sql] of files) writeFileSync(join(MIGRATIONS, name), sql);
    console.log(`${files.size} files written`);
  }
}
