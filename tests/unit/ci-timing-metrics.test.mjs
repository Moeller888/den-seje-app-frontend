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
import { parseShard, planShards } from "../support/unit-timing.mjs";
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

test("the real suite: 3 shards cover every CI file exactly once and are balanced", () => {
  const unitDir = new URL("./", import.meta.url);
  const suite = readdirSync(unitDir).filter((f) => f.endsWith(".test.mjs") && !BINARY_DEPENDENT.includes(f)).sort();
  const { weights } = JSON.parse(read("tests/unit-ci-weights.json"));
  const plan = planShards(suite, 3, weights);
  assert.deepEqual(plan.flatMap((s) => s.files).sort(), suite);
  assert.ok(plan.every((s) => s.files.length > 0));
  const ws = plan.map((s) => s.weight);
  assert.ok(Math.max(...ws) <= 1.25 * Math.min(...ws), "shards drifted apart — refresh tests/unit-ci-weights.json from a CI timing table");
});

test("the runner shards only through planShards and keeps the whole-suite default", () => {
  const src = read("tests/run-unit-ci.mjs");
  assert.ok(src.includes("const shard = parseShard(process.env.UNIT_SHARD);"));
  assert.ok(src.includes("let run = suite;"), "no UNIT_SHARD = the whole suite");
  assert.ok(src.includes("run = plan[shard.index - 1].files;"));
});
