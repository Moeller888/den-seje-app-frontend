// Seeds the isolated E2E database with the synthetic question bank (D-110) and the F-07 stimulus fixture
// (seed/stimulus-chain-questions.mjs: two active pilot_d362 rows, served only to a pupil with that domain).
// Refuses unless assertSeedTarget passes (isolation guard, this run's token and cluster id, no real content).
//
//   node tests/isolated/seed/seed.mjs --db-url "$ISOLATED_DB_URL"
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { seedSyntheticQuestions } from "./seed-guard.mjs";
import { syntheticQuestionsSql } from "./synthetic-questions.mjs";
import { stimulusChainQuestionsSql, STIMULUS_CHAIN_FIXTURE } from "./stimulus-chain-questions.mjs";
import { psqlExecutor } from "../schema/replay.mjs";

async function main(argv) {
  const i = argv.indexOf("--db-url");
  const dbUrl = i >= 0 ? argv[i + 1] : undefined;
  if (!dbUrl) throw new Error("usage: seed.mjs --db-url <postgres url>");
  const { exec, query } = psqlExecutor(dbUrl);
  await seedSyntheticQuestions({ query, exec, env: process.env, sql: syntheticQuestionsSql() + stimulusChainQuestionsSql() });
  const [{ n }] = await query("SELECT count(*)::int AS n FROM public.questions WHERE metadata->>'synthetic' = 'true'");
  console.log(`synthetic questions: ${n}`);
  const [{ f }] = await query(`SELECT count(*)::int AS f FROM public.questions WHERE is_active AND metadata->>'fixture' = '${STIMULUS_CHAIN_FIXTURE}'`);
  if (f !== 2) throw new Error(`stimulus-chain fixture: expected 2 active rows, found ${f}`);
  console.log(`stimulus-chain fixture rows: ${f}`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
}
