// Read-only SQL for the 5,000 Danish questions (docs/difficulty-scale-design.md §12).
//
//   node tools/questions/danish-5000-precheck.mjs before <portion 1-10>  # before applying a portion
//   node tools/questions/danish-5000-precheck.mjs after                  # after each applied portion
//
// Prints SELECT statements only; it never connects to a database. The texts are compared by md5,
// one portion at a time, because all 5,000 hashes are too many for one inline query.

import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BATCH_COUNT, loadItems, portions } from "./build-danish-5000.mjs";

export function beforeSql(portion) {
  const rows = portions(loadItems())[portion - 1];
  const hashes = rows.map((row) => createHash("md5").update(row.q, "utf8").digest("hex"));
  return `-- 1. Migration A is present (expect 1).
SELECT count(*) AS has_difficulty_level FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'questions' AND column_name = 'difficulty_level';
-- 2. This portion is not in yet (expect 0).
SELECT count(*) AS already_there FROM public.questions
WHERE learning_objective = 'danish' AND metadata->>'level_batch' = 'danish${portion}';
-- 3. No live question already has one of the ${hashes.length} texts (expect 0): unique_question_text would reject the file.
SELECT count(*) AS text_collisions FROM public.questions
WHERE md5(content->>'question') IN (${hashes.map((hash) => `'${hash}'`).join(",")});
`;
}

export function afterSql() {
  const expected = Array.from({ length: BATCH_COUNT }, (_, index) => `('danish${index + 1}', 500)`).join(", ");
  return `-- Per portion: count against the expected size, all inactive, all with a level.
SELECT e.batch, e.expected, count(q.id) AS actual,
       count(q.id) FILTER (WHERE q.is_active) AS active,
       count(q.id) FILTER (WHERE q.difficulty_level IS NULL) AS missing_level,
       min(q.difficulty_level) AS min_level, max(q.difficulty_level) AS max_level
FROM (VALUES ${expected}) AS e(batch, expected)
LEFT JOIN public.questions q
  ON q.learning_objective = 'danish' AND q.metadata->>'level_batch' = e.batch
GROUP BY e.batch, e.expected ORDER BY e.batch;
`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, value] = process.argv.slice(2);
  const portion = Number(value);
  if (mode === "before" && Number.isInteger(portion) && portion >= 1 && portion <= BATCH_COUNT) console.log(beforeSql(portion));
  else if (mode === "after") console.log(afterSql());
  else {
    console.error("usage: danish-5000-precheck.mjs before <1-10> | after");
    process.exit(2);
  }
}
