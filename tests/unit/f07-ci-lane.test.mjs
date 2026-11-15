// D-362 / F-07 (owner GO 2026-11-14): the dispatch-only F07 lane of .github/workflows/isolated-e2e.yml.
//   1. The plan step (run here with bash): every pull_request and push — and a "standard" dispatch — gets exactly the
//      lanes it always had (production mirror × runs + ONE k1 entry); only workflow_dispatch with profile=f07 gets the
//      single F07 lane, and an f07 request outside a dispatch or an unknown profile fails loud.
//   2. tests/isolated/f07-lane-check.mjs (no false green): green only when chromium ran all 5 tests passed, and
//      firefox + webkit ran the browser test passed with ONLY the 4 backend tests skipped. All-skipped, a failure,
//      a missing project or test, an extra test or a foreign spec file → not verified.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkLane, EXPECTED_TITLES, SPEC } from "../isolated/f07-lane-check.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WF = readFileSync(join(ROOT, ".github", "workflows", "isolated-e2e.yml"), "utf8");

function planLanes(env) {
  const m = /- id: n\n[\s\S]*?run: \|\n([\s\S]*?)\n\n/.exec(WF);
  assert.ok(m, "the plan job's lane step");
  const script = m[1].split("\n").map((l) => l.replace(/^ {10}/, "")).join("\n");
  const dir = mkdtempSync(join(tmpdir(), "f07-plan-"));
  const out = join(dir, "out");
  writeFileSync(out, "");
  try {
    const r = spawnSync("bash", ["-c", script], {
      env: { ...process.env, GITHUB_OUTPUT: out, PARALLEL: "", PROFILE: "", REF_NAME: "x", ...env }, encoding: "utf8",
    });
    const o = Object.fromEntries(readFileSync(out, "utf8").split("\n").filter(Boolean)
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
    return { status: r.status, lanes: { runs: o.runs, profiles: o.profiles, include: o.include }, stderr: r.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const STD = { profiles: '["production"]', include: '[{"run":1,"profile":"k1"}]' };

test("1. plan step: pull_request, push and a standard dispatch keep their lanes (mirror × runs + one k1)", () => {
  for (const [env, runs] of [
    [{ EVENT: "pull_request" }, "[1]"],
    [{ EVENT: "push", REF_NAME: "main" }, "[1]"],
    [{ EVENT: "push", REF_NAME: "d110/par-1" }, "[1]"],
    [{ EVENT: "push", REF_NAME: "d110/measure" }, "[1,2,3]"],
    [{ EVENT: "workflow_dispatch", PARALLEL: "6", PROFILE: "standard" }, "[1,2,3,4,5,6]"],
    [{ EVENT: "workflow_dispatch", PARALLEL: "1" }, "[1]"],
  ]) {
    const r = planLanes(env);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(r.lanes, { runs, ...STD }, JSON.stringify(env));
  }
});

test("1b. plan step: only a dispatch with profile=f07 yields the single F07 lane", () => {
  const r = planLanes({ EVENT: "workflow_dispatch", PARALLEL: "3", PROFILE: "f07" });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.lanes, { runs: "[1]", profiles: '["f07"]', include: "[]" });
  assert.notEqual(planLanes({ EVENT: "pull_request", PROFILE: "f07" }).status, 0, "never outside a dispatch");
  assert.notEqual(planLanes({ EVENT: "push", REF_NAME: "main", PROFILE: "f07" }).status, 0, "never on a push");
  assert.notEqual(planLanes({ EVENT: "workflow_dispatch", PROFILE: "k1" }).status, 0, "unknown profile fails loud");
});

// A minimal Playwright JSON report: one entry per [project, title, outcome].
function report(rows, file = SPEC) {
  return {
    suites: [{
      file, title: file,
      specs: rows.map(([project, title, outcome]) => ({
        title, file,
        tests: [{ projectName: project, status: outcome === "passed" ? "expected" : outcome === "skipped" ? "skipped" : "unexpected", results: [{ status: outcome }] }],
      })),
    }],
  };
}
const BACKEND = EXPECTED_TITLES.filter((t) => t.startsWith("backend "));
const BROWSER = EXPECTED_TITLES.filter((t) => !t.startsWith("backend "));
const good = () => [
  report(EXPECTED_TITLES.map((t) => ["chromium", t, "passed"])),
  report([...BACKEND.map((t) => ["firefox", t, "skipped"]), ...BROWSER.map((t) => ["firefox", t, "passed"])]),
  report([...BACKEND.map((t) => ["webkit", t, "skipped"]), ...BROWSER.map((t) => ["webkit", t, "passed"])]),
];
const PROJECTS = ["chromium", "firefox", "webkit"];

test("2. lane check: the expected run is VERIFIED with the expected counts", () => {
  const r = checkLane(good(), PROJECTS);
  assert.equal(r.ok, true, r.problems.join("\n"));
  assert.deepEqual(r.summary, {
    chromium: { passed: 5, failed: 0, skipped: 0 },
    firefox: { passed: 1, failed: 0, skipped: 4 },
    webkit: { passed: 1, failed: 0, skipped: 4 },
  });
});

test("2b. lane check: no false green", () => {
  const allSkipped = PROJECTS.map((p) => report(EXPECTED_TITLES.map((t) => [p, t, "skipped"])));
  assert.equal(checkLane(allSkipped, PROJECTS).ok, false, "all skipped is never green");
  const failed = good(); failed[0].suites[0].specs[0].tests[0] = { projectName: "chromium", status: "unexpected", results: [{ status: "failed" }] };
  assert.equal(checkLane(failed, PROJECTS).ok, false, "a failure");
  const flaky = good(); flaky[0].suites[0].specs[1].tests[0].status = "flaky";
  assert.equal(checkLane(flaky, PROJECTS).ok, false, "a flaky pass");
  assert.equal(checkLane(good().slice(0, 2), PROJECTS).ok, false, "a missing project");
  const missing = good(); missing[1].suites[0].specs.pop();
  assert.equal(checkLane(missing, PROJECTS).ok, false, "a missing test");
  const extra = good(); extra[0].suites[0].specs.push(report([["chromium", "something else", "passed"]]).suites[0].specs[0]);
  assert.equal(checkLane(extra, PROJECTS).ok, false, "an extra test");
  assert.equal(checkLane([...good(), report([["chromium", "x", "passed"]], "other.isolated.spec.mjs")], PROJECTS).ok, false, "a foreign spec");
  const ranBackend = good(); ranBackend[2].suites[0].specs[0].tests[0] = { projectName: "webkit", status: "expected", results: [{ status: "passed" }] };
  assert.equal(checkLane(ranBackend, PROJECTS).ok, false, "a backend test outside chromium must be skipped");
  assert.equal(checkLane([], PROJECTS).ok, false, "no report at all");
});
