#!/usr/bin/env node
// The decision behind the check "isolated-e2e (alle baner)" (proposal 2026-11-24, owner-approved direction; the
// workflow job that calls this file is docs/operations/ci-workflow-proposals/isolated-e2e-all-lanes.patch).
//
// needs.isolated-e2e.result alone is NOT enough: it is "success" when every matrix entry that EXISTS succeeded, so a
// lane that disappears from the matrix (an edited include list, a renamed profile) leaves the aggregate green. This
// file therefore reads the run's own job list (GitHub API, filter=latest, one JSON object per line) and requires:
//   - every REQUIRED lane exactly once, completed with conclusion "success" (missing, duplicated, skipped,
//     cancelled, failed, timed out, neutral or still running all fail);
//   - every OTHER "isolated-e2e (run …)" lane (extra parallel runs of a manual dispatch) to have succeeded too,
//     unless it is ADVISORY (reported, never blocking — e.g. a new lane before its 10 green runs on main);
//   - the plan job and the matrix aggregate (needs.*.result) to be "success" as well.
// A docs-only change runs every lane with its steps skipped; the jobs themselves conclude "success", so it passes.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const REQUIRED_LANES = Object.freeze([
  "isolated-e2e (run 1)",
  "isolated-e2e (run 1, K1-testprofil)",
  "isolated-e2e (run 1, introduktion-testprofil)",
]);
// Lanes that are reported but never block (the rollback lane until it has been green 10 times on main).
export const ADVISORY_LANES = Object.freeze([
  "isolated-e2e (run 1, rollback-testprofil)",
]);
export const AGGREGATE_NAME = "isolated-e2e (alle baner)";
const LANE = /^isolated-e2e \(run \d+(, [^)]+)?\)$/;

export function parseJobs(text) {
  const jobs = [];
  for (const [i, line] of String(text ?? "").split(/\r?\n/).entries()) {
    if (line.trim() === "") continue;
    let job;
    try { job = JSON.parse(line); } catch { throw new Error(`jobs line ${i + 1} is not JSON`); }
    if (job === null || typeof job !== "object" || typeof job.name !== "string") {
      throw new Error(`jobs line ${i + 1} has no job name`);
    }
    jobs.push({ name: job.name, status: job.status ?? null, conclusion: job.conclusion ?? null });
  }
  return jobs;
}

const ok = (j) => j.status === "completed" && j.conclusion === "success";
const describe = (j) => `${j.name}: status ${j.status ?? "ukendt"}, konklusion ${j.conclusion ?? "ingen"}`;

export function checkLanes(jobs, { plan = "success", lanes = "success", required = REQUIRED_LANES, advisory = ADVISORY_LANES } = {}) {
  const problems = [];
  const notes = [];
  if (!Array.isArray(jobs) || jobs.length === 0) problems.push("ingen jobs i kørslen — listen er tom eller kunne ikke læses");
  const list = Array.isArray(jobs) ? jobs : [];
  if (plan !== "success") problems.push(`plan-jobbet: ${plan || "ukendt"}`);
  if (lanes !== "success") problems.push(`matrix-aggregatet needs.isolated-e2e.result: ${lanes || "ukendt"}`);
  for (const name of required) {
    const found = list.filter((j) => j.name === name);
    if (found.length === 0) problems.push(`påkrævet bane mangler: ${name}`);
    else if (found.length > 1) problems.push(`påkrævet bane findes ${found.length} gange: ${name}`);
    else if (!ok(found[0])) problems.push(`påkrævet bane bestod ikke — ${describe(found[0])}`);
  }
  for (const j of list) {
    if (!LANE.test(j.name) || required.includes(j.name)) continue;
    if (advisory.includes(j.name)) {
      notes.push(`rådgivende bane (blokerer ikke) — ${describe(j)}`);
    } else if (!ok(j)) {
      problems.push(`ekstra bane bestod ikke — ${describe(j)}`);
    }
  }
  return { ok: problems.length === 0, problems, notes };
}

function main(argv) {
  const [file, plan, lanes] = argv;
  if (!file) {
    console.error("brug: node tests/isolated/require-all-lanes.mjs <jobs.ndjson> <needs.plan.result> <needs.isolated-e2e.result>");
    return 1;
  }
  let jobs;
  try { jobs = parseJobs(readFileSync(file, "utf8")); } catch (e) {
    console.error(`FEJL: jobliste kunne ikke læses: ${e.message}`);
    return 1;
  }
  const r = checkLanes(jobs, { plan, lanes });
  for (const n of r.notes) console.log(`note: ${n}`);
  if (!r.ok) {
    for (const p of r.problems) console.error(`FEJL: ${p}`);
    return 1;
  }
  console.log(`ok: alle ${REQUIRED_LANES.length} påkrævede isolerede baner bestod`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = main(process.argv.slice(2));
