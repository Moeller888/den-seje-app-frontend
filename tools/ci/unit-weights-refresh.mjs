// Refreshes tests/unit-ci-weights.json from recent CI logs and projects the unit-shard job times
// (D-361). Read-only towards GitHub: it only GETs workflow runs, jobs and job logs through `gh api`.
// It writes nothing unless --write is given, and then only tests/unit-ci-weights.json.
//
//   node tools/ci/unit-weights-refresh.mjs [--runs 123,456] [--count 6] [--repo owner/name] [--write]
//
// Without --runs it takes the newest --count (default 6) push runs on main whose unit shards ALL
// succeeded. A file's weight is the median of its measured seconds from the runner's own lines
// (`── <file> (<s> s, ok) ──`). Weights only balance the shards; they never change which files run.
//
// The projection answers "how many shards do we need?": for each shard count it plans the suite
// exactly as CI does (planShards) and estimates the job time of the heaviest shard as
//   SETUP_S + speed × WALL_FACTOR × weight / CONCURRENCY
// at a normal (1.00), a slow (p90, 1.14) and the slowest seen (1.49) runner — constants measured on
// 203 shard jobs, 2026-11-05/06 (D-361). Output contains file names and numbers only.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { planShards } from "../../tests/support/unit-timing.mjs";
import { BINARY_DEPENDENT } from "../../tests/unit-ci-exclusions.mjs";

export const SETUP_S = 30, WALL_FACTOR = 1.03, CONCURRENCY = 3, JOB_TIMEOUT_S = 600, DESIGN_TARGET_S = 480;
export const SPEEDS = { normal: 1.0, p90: 1.14, slowest: 1.49 };

// Per-file seconds from one job log; only files that passed.
export function parseFileTimes(log) {
  const out = {};
  for (const m of String(log ?? "").matchAll(/── (\S+\.test\.mjs) \(([\d.]+) s, ok\) ──/g)) out[m[1]] = Number(m[2]);
  return out;
}

// Median per file over several jobs' parsed times.
export function medianWeights(perJob) {
  const all = {};
  for (const times of perJob) for (const [f, s] of Object.entries(times)) (all[f] ??= []).push(s);
  const out = {};
  for (const f of Object.keys(all).sort()) {
    const s = all[f].sort((a, b) => a - b), m = Math.floor(s.length / 2);
    out[f] = Number((s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2).toFixed(1));
  }
  return out;
}

export function projectJobSeconds(weight, speed) {
  return SETUP_S + speed * WALL_FACTOR * weight / CONCURRENCY;
}

// Rows for shard counts `from`..`to`: heaviest planned shard and its projected job seconds.
export function projection(suite, weights, from, to) {
  const rows = [];
  for (let n = from; n <= to; n++) {
    const heaviest = Math.max(...planShards(suite, n, weights).map((s) => s.weight));
    const job = Object.fromEntries(Object.entries(SPEEDS).map(([k, sp]) => [k, Math.round(projectJobSeconds(heaviest, sp))]));
    rows.push({ shards: n, heaviest: Math.round(heaviest), job,
      ok: job.p90 <= DESIGN_TARGET_S && job.slowest < JOB_TIMEOUT_S - SETUP_S });
  }
  return rows;
}

const HERE = dirname(fileURLToPath(import.meta.url)), REPO_ROOT = resolve(HERE, "..", "..");

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : fallback;
}

async function main() {
  const repo = arg("--repo", "Moeller888/den-seje-app-frontend");
  const count = Number(arg("--count", "6"));
  if (!Number.isInteger(count) || count < 1 || count > 30) throw new Error("--count must be 1..30");
  let runIds = (arg("--runs", "") || "").split(",").filter(Boolean).map(Number);
  const jobsOf = (id) => JSON.parse(gh(["api", `repos/${repo}/actions/runs/${id}/jobs?per_page=100`])).jobs
    .filter((j) => /^unit \(shard \d+\/\d+\)$/.test(j.name));
  if (runIds.length === 0) {
    const runs = JSON.parse(gh(["api", `repos/${repo}/actions/workflows/playwright.yml/runs?branch=main&event=push&per_page=50`])).workflow_runs;
    for (const r of runs) {
      if (runIds.length >= count) break;
      const jobs = jobsOf(r.id);
      if (jobs.length > 0 && jobs.every((j) => j.conclusion === "success")) runIds.push(r.id);
    }
  }
  if (runIds.length === 0) throw new Error("no run with all unit shards successful found");
  const perJob = [];
  for (const id of runIds) {
    for (const j of jobsOf(id)) {
      if (j.conclusion !== "success") throw new Error(`run ${id}: ${j.name} is ${j.conclusion} — pass only fully green runs`);
      perJob.push(parseFileTimes(gh(["api", "--allow-escape-sequences", `repos/${repo}/actions/jobs/${j.id}/logs`])));
    }
  }
  const weights = medianWeights(perJob);
  const suite = readdirSync(join(REPO_ROOT, "tests", "unit")).filter((f) => f.endsWith(".test.mjs") && !BINARY_DEPENDENT.includes(f)).sort();
  const unmeasured = suite.filter((f) => !(f in weights));
  const stale = Object.keys(weights).filter((f) => !suite.includes(f));
  for (const f of stale) delete weights[f];
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  console.log(`runs ${runIds.join(", ")}: ${perJob.length} shard jobs, ${Object.keys(weights).length} files measured, ` +
    `${unmeasured.length} unmeasured (planned at the median), ${stale.length} gone; total ${total.toFixed(0)} s`);
  for (const f of unmeasured) console.log(`  unmeasured: ${f}`);
  console.log(`\nprojected job seconds of the heaviest shard (target p90 ≤ ${DESIGN_TARGET_S} s, slowest < ${JOB_TIMEOUT_S - SETUP_S} s):`);
  console.log("shards  heaviest  normal  p90  slowest  ok");
  for (const r of projection(suite, weights, 3, 8)) {
    console.log(`${String(r.shards).padStart(6)}  ${String(r.heaviest).padStart(8)}  ${String(r.job.normal).padStart(6)}  ${String(r.job.p90).padStart(3)}  ${String(r.job.slowest).padStart(7)}  ${r.ok ? "yes" : "NO"}`);
  }
  if (process.argv.includes("--write")) {
    const file = join(REPO_ROOT, "tests", "unit-ci-weights.json");
    const doc = {
      _comment: `Seconds per unit file on a GitHub ubuntu-latest runner: the median of CI runs ${runIds.join(", ")} ` +
        `(tools/ci/unit-weights-refresh.mjs, concurrency ${CONCURRENCY}). Used ONLY to balance CI shards: a stale or missing entry changes balance, never which files run. Refresh with the same tool when the drift report or the shard budget warns.`,
      weights,
    };
    writeFileSync(file, JSON.stringify(doc, null, 2) + "\n");
    console.log(`\nwrote ${file}`);
  } else {
    console.log("\n(dry run — pass --write to update tests/unit-ci-weights.json)");
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((e) => { console.error("✖ " + e.message); process.exit(1); });
}
