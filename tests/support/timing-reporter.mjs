// Playwright timing reporter: time per browser project and per spec file, retries, flaky and
// failed tests — printed at the end of the run and, in GitHub Actions, written to the job summary.
//
// CONTAINMENT. It reports only project names, spec file paths (relative), line numbers, counts and
// durations. It never prints a test title, a step, an attachment, an error message or anything a
// test typed — those are where credentials and addresses live (see the "No report artifact" note
// in .github/workflows/playwright.yml). It writes no files except the job summary.
import { appendFileSync } from "node:fs";
import { relative, sep } from "node:path";

const sec = (ms) => (ms / 1000).toFixed(1);
const min = (ms) => (ms / 60000).toFixed(1);

// records: [{ project, file, line, outcome, attempts, ms }] — one per test, ms = sum of all
// attempts. outcome is Playwright's test.outcome(): expected | unexpected | flaky | skipped.
export function aggregate(records) {
  const byProject = new Map();
  const byFile = new Map();
  const totals = { tests: 0, expected: 0, unexpected: 0, flaky: 0, skipped: 0, retries: 0, ms: 0 };
  const problems = [];
  for (const r of records) {
    totals.tests++;
    totals[r.outcome] = (totals[r.outcome] ?? 0) + 1;
    totals.retries += Math.max(0, r.attempts - 1);
    totals.ms += r.ms;
    const p = byProject.get(r.project) ?? { project: r.project, tests: 0, ms: 0, retries: 0, flaky: 0, unexpected: 0 };
    p.tests++; p.ms += r.ms; p.retries += Math.max(0, r.attempts - 1);
    if (r.outcome === "flaky") p.flaky++;
    if (r.outcome === "unexpected") p.unexpected++;
    byProject.set(r.project, p);
    const key = r.project + "\u0000" + r.file;
    const f = byFile.get(key) ?? { project: r.project, file: r.file, tests: 0, ms: 0, retries: 0 };
    f.tests++; f.ms += r.ms; f.retries += Math.max(0, r.attempts - 1);
    byFile.set(key, f);
    if (r.outcome === "flaky" || r.outcome === "unexpected") problems.push({ project: r.project, file: r.file, line: r.line, outcome: r.outcome, attempts: r.attempts });
  }
  // A spec's cost across all browsers — what sharding would have to balance.
  const fileAcross = new Map();
  for (const f of byFile.values()) {
    const a = fileAcross.get(f.file) ?? { file: f.file, ms: 0, tests: 0 };
    a.ms += f.ms; a.tests += f.tests;
    fileAcross.set(f.file, a);
  }
  return {
    totals,
    projects: [...byProject.values()].sort((a, b) => b.ms - a.ms),
    files: [...fileAcross.values()].sort((a, b) => b.ms - a.ms),
    problems: problems.sort((a, b) => (a.project + a.file + a.line).localeCompare(b.project + b.file + b.line)),
  };
}

export function render(agg, { wallMs, startupMs, top = 25 }) {
  const t = agg.totals;
  const head = `playwright timing: wall ${min(wallMs)} min, startup before first test ${sec(startupMs)} s, ` +
    `test time ${min(t.ms)} min; tests ${t.tests} (expected ${t.expected}, flaky ${t.flaky}, ` +
    `unexpected ${t.unexpected}, skipped ${t.skipped}), retries ${t.retries}`;
  const text = [
    head,
    "per project:",
    ...agg.projects.map((p) => `  ${p.project.padEnd(10)} ${min(p.ms).padStart(6)} min  tests ${p.tests}, retries ${p.retries}, flaky ${p.flaky}, failed ${p.unexpected}`),
    `slowest ${Math.min(top, agg.files.length)} spec files (all projects):`,
    ...agg.files.slice(0, top).map((f) => `  ${sec(f.ms).padStart(7)} s  ${f.file} (${f.tests} tests)`),
    ...(agg.problems.length ? ["flaky / failed (location only):", ...agg.problems.map((p) => `  [${p.project}] ${p.file}:${p.line} ${p.outcome} after ${p.attempts} attempt(s)`)] : []),
  ].join("\n");
  const markdown = [
    "### Playwright timing",
    "",
    head,
    "",
    "| project | minutes | tests | retries | flaky | failed |",
    "|---|---:|---:|---:|---:|---:|",
    ...agg.projects.map((p) => `| ${p.project} | ${min(p.ms)} | ${p.tests} | ${p.retries} | ${p.flaky} | ${p.unexpected} |`),
    "",
    "| seconds (all projects) | spec file | tests |",
    "|---:|---|---:|",
    ...agg.files.slice(0, top).map((f) => `| ${sec(f.ms)} | \`${f.file}\` | ${f.tests} |`),
    ...(agg.problems.length ? ["", "| project | location | outcome | attempts |", "|---|---|---|---:|",
      ...agg.problems.map((p) => `| ${p.project} | \`${p.file}:${p.line}\` | ${p.outcome} | ${p.attempts} |`)] : []),
  ].join("\n");
  return { text, markdown };
}

export default class TimingReporter {
  constructor() {
    this.createdAt = Date.now();
    this.firstTestAt = null;
    this.suite = null;
    this.rootDir = process.cwd();
  }
  printsToStdio() { return false; }
  onBegin(config, suite) {
    this.suite = suite;
    if (config && typeof config.rootDir === "string") this.rootDir = config.rootDir;
  }
  onTestBegin() {
    if (this.firstTestAt === null) this.firstTestAt = Date.now();
  }
  onEnd() {
    if (!this.suite) return;
    const records = [];
    for (const test of this.suite.allTests()) {
      const project = test.parent?.project?.()?.name ?? "unknown";
      const file = relative(this.rootDir, test.location.file).split(sep).join("/");
      const results = Array.isArray(test.results) ? test.results : [];
      const ms = results.reduce((s, r) => s + (Number.isFinite(r.duration) ? r.duration : 0), 0);
      records.push({ project, file, line: test.location.line, outcome: test.outcome(), attempts: results.length, ms });
    }
    const end = Date.now();
    const out = render(aggregate(records), {
      wallMs: end - this.createdAt,
      startupMs: (this.firstTestAt ?? end) - this.createdAt,
    });
    console.log("\n" + out.text);
    if (process.env.GITHUB_STEP_SUMMARY) {
      try { appendFileSync(process.env.GITHUB_STEP_SUMMARY, out.markdown + "\n"); }
      catch (err) { console.log("timing reporter: could not write the job summary: " + err.message); }
    }
  }
}
