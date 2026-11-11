// Puts the SYNTHETIC questions on the difficulty scale the way production's rows are (test branch
// test/f07-strategy-a-prodlike only; D-362 / F-07, strategy A with LEVEL_ENGINE=v1).
//
//   node tests/isolated/seed/level-fill-prodlike.mjs --db-url "$ISOLATED_DB_URL"
//
// Why: production runs LEVEL_ENGINE=v1, whose candidates (get_level_questions_for_student,
// 20261029120000) are active rows WITH a difficulty_level. Production's rows got theirs from migration
// A's one-time backfill (20261020120000: difficulty_level = difficulty_level_from_grade_band(target_grade,
// difficulty_band)); there is no trigger. The synthetic seed inserts after the replay, so its rows have
// none and the level engine would serve nothing. This applies the SAME expression to synthetic rows only.
//
// Runs only after seed-guard.mjs assertSeedTarget passed (this run's token and cluster id, synthetic
// content only). It touches no row that is not synthetic and no row that already has a level (the F-07
// fixture rows carry their own from the pilot file).
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertSeedTarget } from "./seed-guard.mjs";
import { psqlExecutor } from "../schema/replay.mjs";

export const LEVEL_FILL_SQL = `UPDATE public.questions
SET difficulty_level = public.difficulty_level_from_grade_band(target_grade, difficulty_band)
WHERE metadata->>'synthetic' = 'true'
  AND difficulty_level IS NULL
  AND target_grade IS NOT NULL
  AND difficulty_band IS NOT NULL;`;

async function main(argv) {
  const i = argv.indexOf("--db-url");
  const dbUrl = i >= 0 ? argv[i + 1] : undefined;
  if (!dbUrl) throw new Error("usage: level-fill-prodlike.mjs --db-url <postgres url>");
  const { exec, query } = psqlExecutor(dbUrl);
  await assertSeedTarget({ query, env: process.env });
  await exec(LEVEL_FILL_SQL);
  const [c] = await query(`SELECT
      count(*) FILTER (WHERE is_active)::int AS active,
      count(*) FILTER (WHERE is_active AND difficulty_level IS NULL)::int AS active_without_level
    FROM public.questions`);
  console.log(`level fill: ${c.active} active questions, ${c.active_without_level} without a difficulty_level`);
  if (c.active === 0 || c.active_without_level !== 0) throw new Error("level fill: every active question must carry a difficulty_level");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
}
