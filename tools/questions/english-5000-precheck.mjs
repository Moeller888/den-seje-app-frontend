// Read-only SQL for the 5,000 English questions (docs/operations/level-engine-rollout.md §2.8).
//
//   node tools/questions/english-5000-precheck.mjs before   # before the first apply_migration
//   node tools/questions/english-5000-precheck.mjs after    # after each applied portion
//
// Prints SELECT statements only; it never connects to a database. The texts are compared by md5, so
// the 5,000 question texts do not have to be pasted into the query.

import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { allNewQuestions, levelBatch } from "./english-5000-sample.mjs";

export const EXPECTED_PER_BATCH = {
  grade6_9: 120, pilot: 500, batch2: 500, batch3: 500, batch4: 500, batch5: 500, batch6: 500,
  batch7: 470, batch8: 470, batch9: 470, batch10: 470,
};

export function beforeSql() {
  const hashes = allNewQuestions().map((item) => createHash("md5").update(item.q, "utf8").digest("hex"));
  return `-- 1. Migration A is present (questions.difficulty_level).
SELECT count(*) AS has_difficulty_level FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'questions' AND column_name = 'difficulty_level';
-- 2. None of the 5,000 is in yet (expect 0 rows).
SELECT metadata->>'level_batch' AS batch, count(*) FROM public.questions
WHERE learning_objective = 'english' AND metadata ? 'level_batch' GROUP BY 1 ORDER BY 1;
-- 3. No live question already has one of the ${hashes.length} texts (expect 0): unique_question_text would reject it.
SELECT count(*) AS text_collisions FROM public.questions
WHERE md5(content->>'question') IN (${hashes.map((hash) => `'${hash}'`).join(",")});
-- 4. Triggers and constraints on public.questions, to compare with the repository's expectations.
SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.questions'::regclass AND NOT tgisinternal ORDER BY 1;
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.questions'::regclass ORDER BY 1;
SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'questions' ORDER BY 1;
`;
}

export function afterSql() {
  const expected = Object.entries(EXPECTED_PER_BATCH).map(([batch, n]) => `('${batch}', ${n})`).join(", ");
  return `-- Per portion: count against the expected size, all inactive, all with level and CEFR.
SELECT e.batch, e.expected, count(q.id) AS actual,
       count(q.id) FILTER (WHERE q.is_active) AS active,
       count(q.id) FILTER (WHERE q.difficulty_level IS NULL OR q.metadata->>'cefr' IS NULL) AS missing_level_or_cefr,
       min(q.difficulty_level) AS min_level, max(q.difficulty_level) AS max_level
FROM (VALUES ${expected}) AS e(batch, expected)
LEFT JOIN public.questions q
  ON q.learning_objective = 'english' AND q.metadata->>'level_batch' = e.batch
GROUP BY e.batch, e.expected ORDER BY e.batch;
`;
}

export function portionSizes() {
  const sizes = {};
  for (const item of allNewQuestions()) sizes[levelBatch(item.file)] = (sizes[levelBatch(item.file)] ?? 0) + 1;
  return sizes;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === join(process.argv[1])) {
  const mode = process.argv[2];
  if (mode === "before") console.log(beforeSql());
  else if (mode === "after") console.log(afterSql());
  else {
    console.error("usage: node tools/questions/english-5000-precheck.mjs before|after");
    process.exit(2);
  }
}
