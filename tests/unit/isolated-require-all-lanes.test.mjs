// Proposal 2026-11-24 (owner-approved direction): ONE stable check "isolated-e2e (alle baner)" that fails safe.
// tests/isolated/require-all-lanes.mjs is its decision; proven here on synthetic job lists (the shape of
// GET /actions/runs/{id}/jobs?filter=latest, one object per line): a missing, duplicated, skipped, cancelled, failed,
// timed-out or still-running lane fails it, and so does a failed plan or matrix aggregate. The required lane names
// are checked against the workflow's matrix, so a renamed or removed lane cannot leave the list silently stale.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { REQUIRED_LANES, ADVISORY_LANES, AGGREGATE_NAME, checkLanes, parseJobs } from "../isolated/require-all-lanes.mjs";

const SCRIPT = fileURLToPath(new URL("../isolated/require-all-lanes.mjs", import.meta.url));
const WORKFLOW = readFileSync(new URL("../../.github/workflows/isolated-e2e.yml", import.meta.url), "utf8");
const PATCH = readFileSync(new URL("../../docs/operations/ci-workflow-proposals/isolated-e2e-all-lanes.patch", import.meta.url), "utf8");
const job = (name, conclusion = "success", status = "completed") => ({ name, status, conclusion });
const green = () => [job("plan"), ...REQUIRED_LANES.map((n) => job(n)), job(AGGREGATE_NAME, null, "in_progress")];

test("a run where every required lane passed is accepted (the aggregate's own running job is ignored)", () => {
  assert.deepEqual(checkLanes(green()), { ok: true, problems: [], notes: [] });
});

test("missing, duplicated, skipped, cancelled, failed, timed-out or unfinished lanes are refused, each by name", () => {
  const [a, b, c] = REQUIRED_LANES;
  const cases = [
    [green().filter((j) => j.name !== c), /påkrævet bane mangler: isolated-e2e \(run 1, introduktion-testprofil\)/],
    [[...green(), job(b)], /findes 2 gange: isolated-e2e \(run 1, K1-testprofil\)/],
    [green().map((j) => (j.name === a ? job(a, "skipped") : j)), /bestod ikke — isolated-e2e \(run 1\): status completed, konklusion skipped/],
    [green().map((j) => (j.name === b ? job(b, "cancelled") : j)), /konklusion cancelled/],
    [green().map((j) => (j.name === c ? job(c, "failure") : j)), /konklusion failure/],
    [green().map((j) => (j.name === c ? job(c, "timed_out") : j)), /konklusion timed_out/],
    [green().map((j) => (j.name === a ? job(a, "neutral") : j)), /konklusion neutral/],
    [green().map((j) => (j.name === a ? job(a, null, "in_progress") : j)), /status in_progress, konklusion ingen/],
    [[], /ingen jobs i kørslen/],
  ];
  for (const [jobs, re] of cases) {
    const r = checkLanes(jobs);
    assert.equal(r.ok, false, JSON.stringify(jobs));
    assert.match(r.problems.join(" | "), re);
  }
});

test("a failed plan or a non-success matrix aggregate fails it even when the job list looks green", () => {
  for (const [opts, re] of [
    [{ plan: "failure" }, /plan-jobbet: failure/],
    [{ plan: "" }, /plan-jobbet: ukendt/],
    [{ lanes: "cancelled" }, /needs\.isolated-e2e\.result: cancelled/],
    [{ lanes: "skipped" }, /needs\.isolated-e2e\.result: skipped/],
  ]) {
    const r = checkLanes(green(), opts);
    assert.equal(r.ok, false);
    assert.match(r.problems.join(" | "), re);
  }
});

test("extra parallel runs of a manual dispatch must pass too; an advisory lane is reported but never blocks", () => {
  assert.match(checkLanes([...green(), job("isolated-e2e (run 2)", "failure")]).problems.join(" | "), /ekstra bane bestod ikke — isolated-e2e \(run 2\)/);
  assert.equal(checkLanes([...green(), job("isolated-e2e (run 3)")]).ok, true);
  const adv = checkLanes([...green(), job(ADVISORY_LANES[0], "failure")]);
  assert.equal(adv.ok, true);
  assert.match(adv.notes.join(" | "), /rådgivende bane \(blokerer ikke\)/);
  // A job that only looks similar is not a lane (the aggregate itself, a differently named job).
  assert.equal(checkLanes([...green(), job("isolated-e2e-report", "failure")]).ok, true);
});

test("the job list parser fails loud on malformed input", () => {
  assert.deepEqual(parseJobs('{"name":"a","status":"completed","conclusion":"success"}\n\n'), [job("a")]);
  assert.throws(() => parseJobs("{not json}"), /line 1 is not JSON/);
  assert.throws(() => parseJobs('{"status":"completed"}'), /line 1 has no job name/);
  assert.throws(() => parseJobs("null"), /line 1 has no job name/);
  assert.deepEqual(parseJobs(undefined), []);
});

test("the command line: exit 0 on a green run, 1 on a red one, on unreadable input and without arguments", () => {
  const dir = mkdtempSync(join(tmpdir(), "require-all-lanes-"));
  try {
    const f = join(dir, "jobs.ndjson");
    const run = (jobs, ...args) => {
      writeFileSync(f, jobs.map((j) => JSON.stringify(j)).join("\n"));
      return spawnSync(process.execPath, [SCRIPT, f, ...args], { encoding: "utf8" });
    };
    assert.equal(run(green(), "success", "success").status, 0);
    const red = run(green().filter((j) => j.name !== REQUIRED_LANES[1]), "success", "success");
    assert.equal(red.status, 1);
    assert.match(red.stderr, /påkrævet bane mangler/);
    assert.equal(run(green(), "success", "failure").status, 1);
    writeFileSync(f, "garbage");
    assert.equal(spawnSync(process.execPath, [SCRIPT, f, "success", "success"], { encoding: "utf8" }).status, 1);
    assert.equal(spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" }).status, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("REQUIRED_LANES is exactly the workflow matrix: the production lane plus every include profile's check name", () => {
  const suffix = Object.fromEntries([...WORKFLOW.matchAll(/matrix\.profile == '(\w+)' && ', ([^']+)'/g)].map((m) => [m[1], m[2]]));
  const includes = [...WORKFLOW.matchAll(/- run: 1\s*\n\s*profile: (\w+)/g)].map((m) => m[1]);
  assert.ok(includes.length >= 2, "the workflow has its include lanes");
  assert.match(WORKFLOW, /profile: \[production\]/);
  const fromWorkflow = ["isolated-e2e (run 1)", ...includes.map((p) => {
    assert.ok(suffix[p], `profile ${p} has a check-name suffix in the job name`);
    return `isolated-e2e (run 1, ${suffix[p]})`;
  })];
  const known = [...REQUIRED_LANES, ...ADVISORY_LANES];
  for (const name of fromWorkflow) assert.ok(known.includes(name), `the workflow lane "${name}" is in REQUIRED_LANES or ADVISORY_LANES`);
  for (const name of REQUIRED_LANES) assert.ok(fromWorkflow.includes(name), `the required lane "${name}" exists in the workflow matrix`);
});

test("the proposal patch adds exactly this check: always(), actions: read, the latest job list, this script", () => {
  assert.match(PATCH, /^\+\+\+ b\/\.github\/workflows\/isolated-e2e\.yml/m);
  for (const re of [
    /^\+  isolated-e2e-all:$/m,
    new RegExp(`^\\+    name: ${AGGREGATE_NAME.replace(/[()]/g, "\\$&")}$`, "m"),
    /^\+    needs: \[plan, isolated-e2e\]$/m,
    /^\+    if: always\(\)$/m,
    /^\+      actions: read$/m,
    /jobs\?filter=latest/,
    /node tests\/isolated\/require-all-lanes\.mjs jobs\.ndjson "\$PLAN" "\$LANES"/,
  ]) assert.match(PATCH, re);
  // Once the patch is applied, the workflow must keep the same wiring.
  if (/^  isolated-e2e-all:$/m.test(WORKFLOW)) {
    assert.match(WORKFLOW, /node tests\/isolated\/require-all-lanes\.mjs/);
    assert.match(WORKFLOW, /needs: \[plan, isolated-e2e\]\n    if: always\(\)/);
  }
});
