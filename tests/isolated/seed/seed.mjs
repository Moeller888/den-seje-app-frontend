// Seeds the isolated E2E database with the synthetic question bank (D-110). Refuses unless
// assertSeedTarget passes (isolation guard, this run's token and cluster id, no real content).
//
//   node tests/isolated/seed/seed.mjs --db-url "$ISOLATED_DB_URL"
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { seedSyntheticQuestions } from "./seed-guard.mjs";
import { syntheticQuestionsSql } from "./synthetic-questions.mjs";
import { psqlExecutor } from "../schema/replay.mjs";

async function main(argv) {
  const i = argv.indexOf("--db-url");
  const dbUrl = i >= 0 ? argv[i + 1] : undefined;
  if (!dbUrl) throw new Error("usage: seed.mjs --db-url <postgres url>");
  const { exec, query } = psqlExecutor(dbUrl);
  await seedSyntheticQuestions({ query, exec, env: process.env, sql: syntheticQuestionsSql() });
  const [{ n }] = await query("SELECT count(*)::int AS n FROM public.questions WHERE metadata->>'synthetic' = 'true'");
  console.log(`synthetic questions: ${n}`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
}
