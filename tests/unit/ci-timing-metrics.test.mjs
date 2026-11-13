// CI timing metrics: the unit runner's per-file timing (tests/run-unit-ci.mjs +
// tests/support/unit-timing.mjs), the Playwright timing reporter (tests/support/timing-reporter.mjs)
// and the reproducible baseline tool (tools/ci/ci-timing-baseline.mjs).
//
// Pinned: a file without a readable summary FAILS (never passes silently); cancelled counts as
// failed; the reporter prints locations and numbers only — never a title, error or typed value;
// and the baseline definitions (full run, lock time, main-after-fast-PR) stay what the documented
// numbers were computed with.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCounts, resolveConcurrency, timingTable } from "../support/unit-timing.mjs";
import { aggregate, render } from "../support/timing-reporter.mjs";
import TimingReporter from "../support/timing-reporter.mjs";
import { analyze, median, pct, renderMarkdown, INFERRED_FULL_MIN } from "../../tools/ci/ci-timing-baseline.mjs";

const read = (p) => readFileSync(new URL(p, new URL("../../", import.meta.url)), "utf8").split("\r\n").join("\n");

// ── unit runner ─────────────────────────────────────────────────────────────────────────────
test("parseCounts reads the spec and the TAP summary", () => {
  const spec = "✔ a (1ms)\nℹ tests 3\nℹ suites 0\nℹ pass 2\nℹ fail 1\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 12\n";
  assert.deepEqual(parseCounts(spec), { tests: 3, pass: 2, fail: 1, skipped: 0, todo: 0 });
  const tap = "ok 1 - a\n# tests 2\n# pass 2\n# fail 0\n# skipped 1\n";
  assert.deepEqual(parseCounts(tap), { tests: 2, pass: 2, fail: 0, skipped: 1, todo: 0 });
});

test("parseCounts: no summary → null (the runner fails the file); cancelled counts as failed", () => {
  assert.equal(parseCounts(""), null);
  assert.equal(parseCounts("ℹ tests 3\nℹ pass 3\n"), null, "missing fail line");
  assert.equal(parseCounts(undefined), null);
  assert.equal(parseCounts("ℹ tests 2\nℹ pass 1\nℹ fail 0\nℹ cancelled 1\n").fail, 1);
});

test("resolveConcurrency: default is availableParallelism - 1 (what node --test used), override validated", () => {
  assert.equal(resolveConcurrency(undefined, 4), 3);
  assert.equal(resolveConcurrency("", 1), 1);
  assert.equal(resolveConcurrency(undefined, 0), 1);
  assert.equal(resolveConcurrency("6", 4), 6);
  for (const bad of ["0", "-1", "x", "1.5", "65"]) assert.throws(() => resolveConcurrency(bad, 4));
});

test("timingTable sorts slowest first, counts failed files and totals", () => {
  const t = timingTable([
    { file: "a.test.mjs", ms: 1000, ok: true, counts: { tests: 2, pass: 2, fail: 0, skipped: 0 } },
    { file: "b.test.mjs", ms: 5000, ok: false, counts: null },
  ], 5200, 3);
  assert.equal(t.failedFiles, 1);
  assert.equal(t.sumMs, 6000);
  assert.ok(t.text.indexOf("b.test.mjs") < t.text.indexOf("a.test.mjs"));
  assert.match(t.markdown, /\*\*failed\*\*/);
});

test("the runner fails on any failed file, a missing summary, or a missing result", () => {
  const src = read("tests/run-unit-ci.mjs");
  assert.ok(src.includes("const ok = code === 0 && counts !== null && counts.fail === 0;"));
  assert.ok(src.includes("if (failed.length > 0 || results.length !== run.length) {"));
  assert.ok(src.includes("BINARY_DEPENDENT"), "still uses the shared exclusion list");
  assert.ok(src.includes('["--test", "--test-reporter=spec", join(UNIT, file)]'), "each file still runs under node --test");
});

// ── Playwright timing reporter ──────────────────────────────────────────────────────────────
const recs = [
  { project: "chromium", file: "tests/a.spec.ts", line: 4, outcome: "expected", attempts: 1, ms: 2000 },
  { project: "webkit", file: "tests/a.spec.ts", line: 4, outcome: "flaky", attempts: 2, ms: 9000 },
  { project: "webkit", file: "tests/b.spec.ts", line: 9, outcome: "unexpected", attempts: 3, ms: 30000 },
  { project: "firefox", file: "tests/b.spec.ts", line: 9, outcome: "skipped", attempts: 0, ms: 0 },
];

test("aggregate: per project, per file across projects, retries, flaky and failed", () => {
  const a = aggregate(recs);
  assert.deepEqual({ ...a.totals }, { tests: 4, expected: 1, unexpected: 1, flaky: 1, skipped: 1, retries: 3, ms: 41000 });
  assert.equal(a.projects[0].project, "webkit");
  assert.equal(a.projects[0].ms, 39000);
  assert.deepEqual(a.files.map((f) => [f.file, f.ms]), [["tests/b.spec.ts", 30000], ["tests/a.spec.ts", 11000]]);
  assert.deepEqual(a.problems.map((p) => `${p.project}:${p.line}:${p.outcome}`), ["webkit:4:flaky", "webkit:9:unexpected"]);
});

test("render prints only locations and numbers", () => {
  const out = render(aggregate(recs), { wallMs: 60000, startupMs: 5000 });
  assert.match(out.text, /\[webkit\] tests\/b\.spec\.ts:9 unexpected after 3 attempt\(s\)/);
  assert.match(out.markdown, /### Playwright timing/);
});

test("the reporter never reads titles, errors, steps, attachments or stdout of a test", () => {
  const src = read("tests/support/timing-reporter.mjs");
  const code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  for (const forbidden of [".title", "titlePath", ".error", ".errors", ".steps", ".attachments", ".stdout", ".stderr", "onStdOut", "onStdErr", "onStepBegin", "onStepEnd", "writeFileSync"]) {
    assert.ok(!code.includes(forbidden), "timing reporter must not use " + forbidden);
  }
  assert.ok(code.includes("printsToStdio() { return false; }"), "Playwright must keep adding its usual console reporter");
});

test("the reporter end-to-end on a fake suite", () => {
  const logs = [];
  const orig = console.log;
  console.log = (s) => logs.push(String(s));
  try {
    const r = new TimingReporter();
    const mk = (project, file, line, outcome, durations) => ({
      parent: { project: () => ({ name: project }) },
      location: { file: process.cwd() + "/" + file, line },
      results: durations.map((d) => ({ duration: d })),
      outcome: () => outcome,
    });
    r.onBegin({ rootDir: process.cwd() }, { allTests: () => [mk("chromium", "tests/x.spec.ts", 3, "expected", [1500]), mk("webkit", "tests/x.spec.ts", 3, "flaky", [1000, 2000])] });
    r.onTestBegin();
    const saved = process.env.GITHUB_STEP_SUMMARY;
    delete process.env.GITHUB_STEP_SUMMARY;
    r.onEnd();
    if (saved !== undefined) process.env.GITHUB_STEP_SUMMARY = saved;
  } finally {
    console.log = orig;
  }
  const out = logs.join("\n");
  assert.match(out, /tests 2 \(expected 1, flaky 1, unexpected 0, skipped 0\), retries 1/);
  assert.match(out, /\[webkit\] tests\/x\.spec\.ts:3 flaky after 2 attempt\(s\)/);
});

test("playwright.config.ts keeps html and adds the timing reporter", () => {
  const cfg = read("playwright.config.ts");
  assert.ok(cfg.includes("reporter: [['html'], ['./tests/support/timing-reporter.mjs']],"));
});

// ── baseline tool ───────────────────────────────────────────────────────────────────────────
const at = (m) => new Date(Date.UTC(2026, 9, 20, 8, 0) + m * 60000).toISOString();
const job = (name, start, end, conclusion, steps) => ({ name, conclusion, started_at: at(start), completed_at: at(end), steps });
const step = (name, start, end, conclusion = "success") => ({ name, conclusion, started_at: at(start), completed_at: at(end) });

test("median / pct", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(pct([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9), 9);
  assert.ok(Number.isNaN(median([])));
});

test("analyze: full vs fast, wait, lock time, main after fast PR, inferred cancelled", () => {
  const runs = [
    // fast PR (Playwright step skipped) for PR head P2
    { id: 1, event: "pull_request", branch: "docs/x", headSha: "P2", created: at(0), jobs: [job("test", 0, 1, "success", [step("Run Playwright tests", 1, 1, "skipped")])] },
    // main push of merge commit M (parents MAIN0, P2): full run after waiting 10 min
    { id: 2, event: "push", branch: "main", headSha: "M", created: at(5), jobs: [job("test", 15, 55, "success", [step("Run Playwright tests", 16, 54)]), job("unit", 5, 11, "success", [])] },
    // full PR run
    { id: 3, event: "pull_request", branch: "feat/y", headSha: "Q", created: at(20), jobs: [job("test", 55, 95, "failure", [step("Run Playwright tests", 56, 94, "failure")])] },
    // cancelled job with no steps, 30 min → inferred lock holder
    { id: 4, event: "pull_request", branch: "feat/z", headSha: "Z", created: at(95), jobs: [job("test", 95, 125, "cancelled", [])] },
    // cancelled job with no steps, 2 min → not a lock holder
    { id: 5, event: "pull_request", branch: "feat/w", headSha: "W", created: at(126), jobs: [job("test", 126, 128, "cancelled", [])] },
  ];
  const a = analyze(runs, new Map([["M", ["MAIN0", "P2"]]]));
  assert.equal(a.byEvent.push.full, 1);
  assert.equal(a.byEvent.pull_request.full, 2);
  assert.equal(a.byEvent.push.wait.median, 10);
  assert.equal(a.lock.hours, (40 + 40 + 30) / 60);
  assert.equal(a.mainAfterFastPr.runs, 1);
  assert.equal(a.cancelledInLock.runs, 1);
  assert.equal(a.cancelledInLock.inferred, 1);
  assert.equal(a.byEvent.pull_request.fullRun.n, 1, "a cancelled run's duration is not a speed sample");
  assert.equal(a.unit.median, 6);
  assert.match(renderMarkdown(a), /Full main runs after a PR that never ran Playwright: 1/);
  assert.equal(INFERRED_FULL_MIN, 10);
});

test("the baseline tool is read-only", () => {
  const src = read("tools/ci/ci-timing-baseline.mjs");
  for (const verb of ["--method", "-X ", "POST", "PATCH", "DELETE", "rerun", "/cancel", "-f ", "--field", "--input"]) {
    assert.ok(!src.includes(verb), "baseline tool must not use " + verb);
  }
  // Every gh call is a GET through `gh api`.
  const calls = [...src.matchAll(/gh\(\[\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(calls.length >= 2);
  assert.deepEqual([...new Set(calls)], ["api"]);
});

// ── sharding (A2) ───────────────────────────────────────────────────────────────────────────
import { parseShard, planShards, parseBudget, budgetReport, driftReport } from "../support/unit-timing.mjs";
import { readdirSync } from "node:fs";
import { BINARY_DEPENDENT } from "../unit-ci-exclusions.mjs";

test("parseShard: unset = whole suite; malformed or out of range throws", () => {
  assert.equal(parseShard(undefined), null);
  assert.equal(parseShard(""), null);
  assert.deepEqual(parseShard("2/3"), { index: 2, count: 3 });
  for (const bad of ["0/3", "4/3", "3", "1/0", "a/b", "1/3 ", "-1/3", "1/17"]) assert.throws(() => parseShard(bad), bad);
});

test("planShards is a deterministic partition whatever the weights", () => {
  const files = ["a", "b", "c", "d", "e", "f", "g"];
  for (const weights of [{}, { a: 100 }, { a: 5, b: 5, c: 5, d: 5, e: 5, f: 5, g: 5 }, { z: 9, a: -1, b: NaN }]) {
    for (const n of [1, 2, 3, 5, 9]) {
      const plan = planShards(files, n, weights);
      assert.equal(plan.length, n);
      assert.deepEqual(plan.flatMap((s) => s.files).sort(), files);
      assert.deepEqual(planShards(files, n, weights), plan, "deterministic");
    }
  }
  assert.throws(() => planShards([], 3));
  assert.throws(() => planShards(["a", "a"], 2));
});

// The shard count lives in ONE place: the unit-shard matrix. It must be exactly 1..N, and the job
// name and UNIT_SHARD must read strategy.job-total — a hard-coded "/3" next to a 4-entry matrix
// would run shard 4 as "4/3" (parseShard throws) or silently skip a quarter of the plan (D-361).
function unitShardMatrix() {
  const wf = read(".github/workflows/playwright.yml");
  const job = wf.split(/\n {2}unit-shard:\n/)[1]?.split(/\n {2}[a-z][\w-]*:\n/)[0] ?? "";
  assert.ok(job.length > 0, "unit-shard job not found");
  const m = /\n {8}shard: \[([\d, ]+)\]\n/.exec(job);
  assert.ok(m, "unit-shard matrix not found");
  return { job, shards: m[1].split(",").map((x) => Number(x.trim())) };
}

test("the unit-shard matrix is exactly 1..N and the job reads N from strategy.job-total", () => {
  const { job, shards } = unitShardMatrix();
  assert.ok(shards.length >= 1 && shards.length <= 16);
  assert.deepEqual(shards, shards.map((_, i) => i + 1), "matrix must be 1, 2, …, N with no gaps or repeats");
  assert.ok(job.includes("name: unit (shard ${{ matrix.shard }}/${{ strategy.job-total }})"));
  assert.ok(job.includes("UNIT_SHARD: ${{ matrix.shard }}/${{ strategy.job-total }}"));
  assert.ok(!/UNIT_SHARD: \$\{\{ matrix\.shard \}\}\/\d/.test(job), "no hard-coded shard count");
  assert.ok(job.includes("timeout-minutes: 10"), "the job timeout is unchanged (D-361 adds shards, not time)");
  const budget = /UNIT_SHARD_BUDGET_S: "(\d+)"/.exec(job);
  assert.ok(budget && parseBudget(budget[1]) < 600, "the budget is set and below the job timeout");
});

test("the real suite: the workflow's shards cover every CI file exactly once and are balanced", () => {
  const unitDir = new URL("./", import.meta.url);
  const suite = readdirSync(unitDir).filter((f) => f.endsWith(".test.mjs") && !BINARY_DEPENDENT.includes(f)).sort();
  const { weights } = JSON.parse(read("tests/unit-ci-weights.json"));
  const n = unitShardMatrix().shards.length;
  const plan = planShards(suite, n, weights);
  assert.equal(plan.length, n);
  assert.deepEqual(plan.flatMap((s) => s.files).sort(), suite);
  assert.deepEqual(plan.flatMap((s) => s.order).sort(), suite, "the run orders together are the suite too");
  assert.ok(plan.every((s) => s.files.length > 0));
  const ws = plan.map((s) => s.weight);
  assert.ok(Math.max(...ws) <= 1.25 * Math.min(...ws), "shards drifted apart — refresh tests/unit-ci-weights.json from a CI timing table");
});

test("planShards: each shard's run order is its own files, heaviest first, ties by name", () => {
  const files = ["a", "b", "c", "d", "e", "f", "g"];
  const weights = { a: 1, b: 9, c: 9, d: 3, e: 50 }; // f, g unknown → median of the known (9)
  for (const n of [1, 2, 3]) {
    for (const s of planShards(files, n, weights)) {
      assert.deepEqual([...s.order].sort(), s.files);
      const w = (f) => weights[f] ?? 9;
      for (let i = 1; i < s.order.length; i++) {
        const [p, q] = [s.order[i - 1], s.order[i]];
        assert.ok(w(p) > w(q) || (w(p) === w(q) && p < q), `${p} before ${q}`);
      }
    }
  }
  assert.deepEqual(planShards(files, 1, weights)[0].order, ["e", "b", "c", "f", "g", "d", "a"]);
});

test("parseBudget: unset = no budget; anything but an integer 60..3600 throws", () => {
  assert.equal(parseBudget(undefined), null);
  assert.equal(parseBudget(""), null);
  assert.equal(parseBudget("450"), 450);
  for (const bad of ["59", "3601", "x", "4.5", "-1", "0"]) assert.throws(() => parseBudget(bad), bad);
});

test("budgetReport names the running and the not-started files and says it is not a failure", () => {
  const t = budgetReport({ budgetS: 450, elapsedMs: 450100, finished: 100, failed: 0,
    running: [["slow.test.mjs", 133000]], pending: ["later.test.mjs"] });
  assert.match(t, /passed its time budget of 450 s/);
  assert.match(t, /NOT a test failure/);
  assert.match(t, /running +133\.0 s  slow\.test\.mjs/);
  assert.match(t, /not started +later\.test\.mjs/);
});

test("driftReport: runner speed, files over 2× their weight, heavy files without a weight", () => {
  const r = (file, s) => ({ file, ms: s * 1000, ok: true });
  const d = driftReport([r("a", 150), r("b", 60), r("c", 0.4), r("new", 25), r("tiny-new", 2)],
    { a: 100, b: 20, c: 0.3 });
  assert.equal(d.speed, (150 + 60) / (100 + 20), "only weights ≥ 1 s count toward the speed");
  assert.deepEqual(d.slower.map((x) => x.file), ["b"], "60 > 2 × 20 + 10; 150 is not > 2 × 100 + 10");
  assert.deepEqual(d.unweighted.map((x) => x.file), ["new"]);
  assert.match(d.text, /runner speed 1\.75× the weights/);
  assert.match(d.markdown, /`new`/);
  assert.equal(driftReport([], {}).speed, null);
});

test("the runner shards only through planShards and keeps the whole-suite default", () => {
  const src = read("tests/run-unit-ci.mjs");
  assert.ok(src.includes("const shard = parseShard(process.env.UNIT_SHARD);"));
  assert.ok(src.includes("let run = suite;"), "no UNIT_SHARD = the whole suite");
  assert.ok(src.includes("run = plan[shard.index - 1].order;"), "a shard runs its own files, heaviest first");
});

test("the time budget only reports: it never exits, kills or skips", () => {
  const src = read("tests/run-unit-ci.mjs");
  const at = src.indexOf("budgetTimer = setTimeout(");
  assert.ok(at > 0, "the budget timer exists");
  const body = src.slice(at, src.indexOf("budgetTimer.unref();", at));
  for (const forbidden of ["process.exit", ".kill(", "queue.length = 0", "queue.splice", "queue.shift"]) {
    assert.ok(!body.includes(forbidden), `the budget callback must not ${forbidden}`);
  }
  assert.ok(src.includes("budgetTimer.unref();"), "the timer never keeps the runner alive");
  assert.ok(src.includes("if (failed.length > 0 || results.length !== run.length) {"), "the pass/fail rule is unchanged");
});

// ── weight refresh tool (D-361) ─────────────────────────────────────────────────────────────
import { parseFileTimes, medianWeights, projection, projectJobSeconds, SETUP_S } from "../../tools/ci/unit-weights-refresh.mjs";

test("unit-weights-refresh: reads only passed files' times and takes the median", () => {
  const log = "2026Z ── a.test.mjs (12.5 s, ok) ──\n2026Z ── b.test.mjs (3.0 s, FAILED) ──\nnoise ── c.test.mjs (0.4 s, ok) ──\n";
  assert.deepEqual(parseFileTimes(log), { "a.test.mjs": 12.5, "c.test.mjs": 0.4 });
  assert.deepEqual(parseFileTimes(undefined), {});
  assert.deepEqual(medianWeights([{ a: 10, b: 1 }, { a: 30 }, { a: 20, b: 3 }]), { a: 20, b: 2 });
});

test("unit-weights-refresh: projection plans like CI and gets lighter with more shards", () => {
  const suite = ["a", "b", "c", "d", "e", "f"];
  const rows = projection(suite, { a: 900, b: 800, c: 700, d: 600, e: 500, f: 400 }, 1, 4);
  assert.deepEqual(rows.map((r) => r.shards), [1, 2, 3, 4]);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].heaviest <= rows[i - 1].heaviest);
  assert.equal(rows[0].heaviest, 3900);
  assert.equal(projectJobSeconds(0, 1), SETUP_S);
  assert.ok(rows.every((r) => r.job.normal < r.job.p90 && r.job.p90 < r.job.slowest));
});

test("unit-weights-refresh is read-only towards GitHub and writes only the weights file", () => {
  const src = read("tools/ci/unit-weights-refresh.mjs");
  for (const verb of ["--method", "-X ", "POST", "PATCH", "DELETE", "rerun", "/cancel", "-f ", "--field", "--input"]) {
    assert.ok(!src.includes(verb), "refresh tool must not use " + verb);
  }
  const calls = [...src.matchAll(/gh\(\[\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(calls.length >= 3);
  assert.deepEqual([...new Set(calls)], ["api"]);
  assert.equal(src.match(/writeFileSync\(/g).length, 1, "one write");
  assert.ok(src.includes('const file = join(REPO_ROOT, "tests", "unit-ci-weights.json");'));
  assert.ok(src.includes('if (process.argv.includes("--write")) {'), "writes only on --write");
});

// ── PostgreSQL lane (D-369) ─────────────────────────────────────────────────────────────────
// Each shard has one PostgreSQL service (100 connections). On PR #674 three PG files ran side by
// side in shard 1 and minigame-breaks-concurrency failed with "too many clients". The PG files now
// run one at a time; everything else keeps its concurrency. This file must not spell the variable
// name itself (it would then be detected as a PG file), so it reads PG_ENV.
import { execFileSync } from "node:child_process";
import { PG_ENV, detectPgFiles, pgLaneScheduler, simulateSchedule, maxOverlap } from "../support/unit-timing.mjs";

const REPO = new URL("../../", import.meta.url);
const ciSuite = () => readdirSync(new URL("./", import.meta.url))
  .filter((f) => f.endsWith(".test.mjs") && !BINARY_DEPENDENT.includes(f)).sort();
const realPg = () => detectPgFiles(ciSuite(), (f) => read("tests/unit/" + f));
const gitGrep = (...args) => execFileSync("git", ["grep", "-l", "-F", PG_ENV, "--", ...args], { cwd: REPO, encoding: "utf8" })
  .split("\n").map((l) => l.trim()).filter(Boolean);

test("PG detection equals a git grep of tests/unit, and nothing reaches the server another way", () => {
  const detected = realPg();
  const grepped = gitGrep("tests/unit/*.test.mjs").map((p) => p.replace(/^tests\/unit\//, ""))
    .filter((f) => !BINARY_DEPENDENT.includes(f)).sort();
  assert.deepEqual(detected, grepped);
  assert.ok(detected.length >= 17, `expected at least the 17 PG files of 2026-11-09, got ${detected.length}`);
  for (const f of ["minigame-breaks-concurrency.test.mjs", "mc-length-cue-top10-concurrency.test.mjs",
    "claim-daily-reward-concurrency.test.mjs", "difficulty-scale-b-concurrency.test.mjs",
    "question-attempts-v2-bootstrap-rollback.test.mjs"]) assert.ok(detected.includes(f), f);
  assert.ok(!detected.includes("ci-timing-metrics.test.mjs"), "this file reads PG_ENV and is not a PG file");
  // A helper that read the variable on a test's behalf would hide that test from the lane.
  const elsewhere = gitGrep(".").filter((p) => !p.startsWith("tests/unit/") && !p.startsWith("docs/"));
  assert.deepEqual(elsewhere.sort(), [".github/workflows/playwright.yml", "tests/support/unit-timing.mjs"]);
  assert.throws(() => detectPgFiles(["x"], () => undefined), /could not read x/);
});

const isPgName = (f) => f.startsWith("pg");
function checkRun(order, dur, concurrency, isPg) {
  const { runs, wall } = simulateSchedule(order, dur, concurrency, isPg);
  assert.deepEqual(runs.map((r) => r.file).sort(), [...order].sort(), "every file runs exactly once");
  assert.ok(maxOverlap(runs, isPg) <= 1, "never two PG files at once");
  assert.ok(maxOverlap(runs) <= concurrency, "never more than the concurrency");
  return { runs, wall };
}

test("pgLaneScheduler: one PG file at a time, others in parallel, every file once", () => {
  const order = ["pg-a", "big", "pg-b", "pg-c", "mid", "s1", "pg-d", "s2", "s3", "s4"];
  const d = { "pg-a": 5, big: 30, "pg-b": 4, "pg-c": 3, mid: 12, s1: 2, "pg-d": 6, s2: 2, s3: 1, s4: 1 };
  const { runs } = checkRun(order, (f) => d[f], 3, isPgName);
  assert.ok(maxOverlap(runs, (f) => !isPgName(f)) >= 2, "non-PG files still run in parallel");
  // Heaviest-first is kept for the rest: non-PG files start in their planned order.
  const starts = runs.filter((r) => !isPgName(r.file)).map((r) => r.file);
  assert.deepEqual(starts, order.filter((f) => !isPgName(f)));
  // A skipped PG file keeps its place: the lane goes to PG files in planned order.
  assert.deepEqual(runs.filter((r) => isPgName(r.file)).map((r) => r.file), ["pg-a", "pg-b", "pg-c", "pg-d"]);
});

test("pgLaneScheduler: no deadlock when only PG files are left, and none with no PG files", () => {
  const only = ["pg-1", "pg-2", "pg-3", "pg-4"];
  const { wall } = checkRun(only, () => 2, 3, isPgName);
  assert.equal(wall, 8, "they run back to back");
  const tail = ["a", "b", "c", "pg-1", "pg-2", "pg-3"];
  checkRun(tail, (f) => (isPgName(f) ? 1 : 10), 3, isPgName);
  const none = ["a", "b", "c", "d"];
  assert.equal(checkRun(none, () => 3, 2, isPgName).wall, 6, "no PG files = the old pool");
  assert.equal(checkRun(["pg-x"], () => 1, 1, isPgName).wall, 1);
  // Step by step: with a PG file running and only PG files queued, take() returns nothing but
  // a file is running — finishing it frees the lane.
  const s = pgLaneScheduler(["pg-1", "pg-2"], 3, isPgName);
  assert.deepEqual(s.take(), ["pg-1"]);
  assert.deepEqual(s.take(), []);
  assert.equal(s.running.size, 1);
  s.finish("pg-1");
  assert.deepEqual(s.take(), ["pg-2"]);
  s.finish("pg-2");
  assert.ok(s.done);
  assert.throws(() => s.finish("pg-2"), /was not running/);
  assert.throws(() => pgLaneScheduler(["a", "a"], 1, isPgName), /duplicate/);
  assert.throws(() => pgLaneScheduler(["a"], 0, isPgName), /concurrency/);
});

test("the real suite: every shard plan, run with its weights as durations, keeps the lane", () => {
  const suite = ciSuite();
  const pg = new Set(realPg());
  const { weights } = JSON.parse(read("tests/unit-ci-weights.json"));
  const n = unitShardMatrix().shards.length;
  const dur = (f) => (Number.isFinite(weights[f]) && weights[f] > 0 ? weights[f] : 1);
  for (const s of planShards(suite, n, weights)) checkRun(s.order, dur, 3, (f) => pg.has(f));
});

test("negative control: the old pool ran ≥ 2 PG files at once on PR #674's shard-1 plan", () => {
  // PR #674 = this suite + one unweighted file; its shard 1 is the plan that failed (run 42611228361).
  // The file is added only when absent, so the control holds both before and after #674 is merged.
  // Files added after #674 on branches not yet merged were not in #674's plan: leave them out, so the control
  // reproduces exactly the plan that failed (Lærligverse L3/L5, #653).
  const LATER = new Set(["laerligverse-attempt-context-process-event.test.mjs", "laerligverse-l3-l5-attempt-wrapper-run.test.mjs",
    "laerligverse-l3-l5-concurrency.test.mjs", "laerligverse-l3-l5-migration-run.test.mjs", "laerligverse-request-hint.test.mjs",
    "laerligverse-served-mode-gnq.test.mjs", "laerligverse-k9-presented-migration-run.test.mjs",
    "laerligverse-introductions-migration-run.test.mjs", "laerligverse-introduction-gnq.test.mjs", "laerligverse-introduction-progress.test.mjs"]);
  const suite = [...new Set([...ciSuite().filter((f) => !LATER.has(f)), "isolated-stimulus-chain-seed.test.mjs"])].sort();
  const pg = new Set(realPg());
  const isPg = (f) => pg.has(f);
  const { weights } = JSON.parse(read("tests/unit-ci-weights.json"));
  const shard1 = planShards(suite, 4, weights)[0];
  for (const f of ["minigame-breaks-concurrency.test.mjs", "mc-length-cue-top10-concurrency.test.mjs", "claim-daily-reward-concurrency.test.mjs"]) {
    assert.ok(shard1.order.includes(f), `${f} is in #674's shard 1`);
  }
  const known = Object.values(weights).filter((w) => Number.isFinite(w) && w > 0).sort((a, b) => a - b);
  const median = known[Math.floor(known.length / 2)];
  const dur = (f) => (Number.isFinite(weights[f]) && weights[f] > 0 ? weights[f] : median);
  const old = simulateSchedule(shard1.order, dur, 3, () => false); // the pre-D-369 pool
  assert.ok(maxOverlap(old.runs, isPg) >= 2, "the old schedule overlaps PG files on this plan");
  const neu = checkRun(shard1.order, dur, 3, isPg);
  assert.ok(neu.wall <= old.wall * 1.05, `the lane costs little here (${old.wall.toFixed(1)} → ${neu.wall.toFixed(1)} s)`);
});

test("the runner schedules through pgLaneScheduler over the planned files", () => {
  const src = read("tests/run-unit-ci.mjs");
  assert.ok(src.includes('const pgFiles = new Set(detectPgFiles(run, (f) => readFileSync(join(UNIT, f), "utf8")));'));
  assert.ok(src.includes("const sched = pgLaneScheduler(run, concurrency, (f) => pgFiles.has(f));"));
  assert.ok(src.includes("for (const f of sched.take()) {"));
  assert.ok(src.includes("try { sched.finish(f); } catch (err) { rejectAll(err); return; }"));
  assert.ok(!src.includes("queue.shift()"), "the old worker loop is gone");
});
