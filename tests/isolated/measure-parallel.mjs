// Measures what the isolated E2E runs actually did in parallel (D-110), from GitHub's own records.
//
//   node tests/isolated/measure-parallel.mjs <run-id> [<run-id> …]  → markdown report on stdout
//
// One run id = N matrix jobs in one workflow; several run ids = independent workflow runs (one per
// branch, as nine terminals' PRs would be). Per isolated-e2e job it reads, read-only through `gh api`:
//   queue     created → started (the runner capacity GitHub actually gave us)
//   suite     start and end of the "Existing Playwright suite" step, and the whole job's duration
//   database  ISOLATED_DB_SYSID — the Postgres cluster's system identifier (each local stack is its own
//             initdb, so equal ids would mean a shared database)
//   data      the primary pupil's id provisioned for the run (seed/primary-account.mjs) — own accounts
//   result    Playwright's passed / failed / flaky counts and the tripwire's refused-request count
// and computes the overlap: the longest window in which ALL suites ran at once, and the peak number
// of suites running simultaneously.
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = "Moeller888/den-seje-app-frontend";
const SUITE_STEP = "Existing Playwright suite against the isolated stack";

// ── pure parts (unit-tested) ─────────────────────────────────────────────────────────────────────
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");

export function parseJobLog(text) {
  const log = strip(String(text ?? ""));
  const sysids = [...new Set([...log.matchAll(/ISOLATED_DB_SYSID: (\d+)/g)].map((m) => m[1]))];
  const pupil = log.match(/isolated suite: primary pupil ([0-9a-f-]{36}) provisioned/)?.[1] ?? null;
  const tripwire = log.match(/\| browser requests refused by the tripwire \| (\d+)/)?.[1];
  const edgeStart = log.match(/edge-runtime: serving after start attempt (\d)/)?.[1];
  const controls = (log.match(/negative controls \((pre|post)-lock\): all protections refused/g) ?? []).length;
  const count = (word) => {
    const all = [...log.matchAll(new RegExp(`^\\S*\\s+(\\d+) ${word}\\b`, "gm"))].map((m) => Number(m[1]));
    return all.length ? all.at(-1) : 0;
  };
  return {
    sysids, pupil,
    tripwire: tripwire === undefined ? null : Number(tripwire),
    edgeStart: edgeStart === undefined ? null : Number(edgeStart), controls,
    passed: count("passed"), failed: count("failed"), flaky: count("flaky"),
  };
}

// intervals: [{ start: ms, end: ms }]. Peak = most intervals open at one instant; common = the window
// in which every interval is open (0 if there is none).
export function overlap(intervals) {
  const xs = intervals.filter((i) => Number.isFinite(i.start) && Number.isFinite(i.end) && i.end >= i.start);
  if (!xs.length) return { peak: 0, commonMs: 0 };
  const events = xs.flatMap((i) => [[i.start, 1], [i.end, -1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let open = 0, peak = 0;
  for (const [, d] of events) { open += d; peak = Math.max(peak, open); }
  const commonMs = Math.max(0, Math.min(...xs.map((i) => i.end)) - Math.max(...xs.map((i) => i.start)));
  return { peak, commonMs };
}

// ── gh access (read-only) ─────────────────────────────────────────────────────────────────────────
const gh = (args) => execFileSync("gh", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
const ms = (t) => (t ? Date.parse(t) : NaN);
const min = (x) => (Number.isFinite(x) ? (x / 60000).toFixed(1) : "–");
const hhmm = (x) => (Number.isFinite(x) ? new Date(x).toISOString().slice(11, 19) : "–");

export function collect(runIds) {
  const rows = [];
  for (const runId of runIds) {
    const run = JSON.parse(gh(["api", `repos/${REPO}/actions/runs/${runId}`]));
    const jobs = JSON.parse(gh(["api", `repos/${REPO}/actions/runs/${runId}/jobs?per_page=100`])).jobs;
    for (const job of jobs.filter((j) => j.name.startsWith("isolated-e2e"))) {
      const suite = (job.steps ?? []).find((s) => s.name === SUITE_STEP && s.conclusion !== "skipped");
      const parsed = parseJobLog(gh(["api", "--allow-escape-sequences", `repos/${REPO}/actions/jobs/${job.id}/logs`]));
      rows.push({
        runId, branch: run.head_branch, sha: run.head_sha.slice(0, 7), workflow: run.name, job: job.name,
        conclusion: job.conclusion, created: ms(job.created_at), started: ms(job.started_at), completed: ms(job.completed_at),
        suiteStart: ms(suite?.started_at), suiteEnd: ms(suite?.completed_at), ...parsed,
      });
    }
  }
  return rows;
}

export function report(rows) {
  const suites = overlap(rows.map((r) => ({ start: r.suiteStart, end: r.suiteEnd })));
  const jobsO = overlap(rows.map((r) => ({ start: r.started, end: r.completed })));
  const sysids = rows.flatMap((r) => r.sysids);
  const pupils = rows.map((r) => r.pupil).filter(Boolean);
  const first = Math.min(...rows.map((r) => r.created)), last = Math.max(...rows.map((r) => r.completed));
  const lines = [
    "| run | branch | job | result | queued | job start–end | suite start–end | job min | DB sysid | primary pupil | passed/failed/flaky | tripwire | edge start attempt | negative controls |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...rows.map((r) => `| ${r.runId} | ${r.branch} | ${r.job} | ${r.conclusion} | ${min(r.started - r.created)} min | ${hhmm(r.started)}–${hhmm(r.completed)} | ${hhmm(r.suiteStart)}–${hhmm(r.suiteEnd)} | ${min(r.completed - r.started)} | ${r.sysids.join(", ") || "–"} | ${r.pupil ?? "–"} | ${r.passed}/${r.failed}/${r.flaky} | ${r.tripwire ?? "–"} | ${r.edgeStart ?? "–"} | ${r.controls}/2 |`),
    "",
    `- jobs: ${rows.length}; workflow runs: ${new Set(rows.map((r) => r.runId)).size}; branches: ${new Set(rows.map((r) => r.branch)).size}`,
    `- peak suites running at the same instant: ${suites.peak}; window in which ALL suites ran at once: ${min(suites.commonMs)} min`,
    `- peak jobs running at the same instant: ${jobsO.peak}; longest queue wait: ${min(Math.max(...rows.map((r) => r.started - r.created)))} min`,
    `- distinct database clusters: ${new Set(sysids).size} of ${rows.length} jobs${new Set(sysids).size === rows.length ? "" : " — NOT all distinct"}`,
    `- distinct primary pupils: ${new Set(pupils).size} of ${rows.length} jobs`,
    `- total wall time, first job queued → last job done: ${min(last - first)} min`,
  ];
  return lines.join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const ids = process.argv.slice(2).filter((a) => /^\d+$/.test(a));
  if (!ids.length) { console.error("usage: measure-parallel.mjs <run-id> [<run-id> …]"); process.exit(2); }
  console.log(report(collect(ids)));
}
