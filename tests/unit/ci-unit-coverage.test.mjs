// ── D-094: the unit suite runs in CI, and this keeps that true ──────────────────────────────
// An exclusion list nobody checks decays. These tests exist so the list cannot quietly grow, go
// stale, or hide a test that could have run in CI all along.
//
// The failure mode being prevented is specific: someone adds a test that drives the vendored
// libwebp, CI cannot run it, and — without a guard — the natural fix is to add the file to the
// exclusion list and move on. That silently shrinks what CI enforces. Here it fails instead,
// and the person has to say so.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { BINARY_DEPENDENT, BINARY_MARKERS } from "../unit-ci-exclusions.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const UNIT = HERE;
const WORKFLOW = join(REPO, ".github", "workflows", "playwright.yml");

const unitFiles = () => readdirSync(UNIT).filter((f) => f.endsWith(".test.mjs")).sort();
const usesBinary = (file) => {
  const src = readFileSync(join(UNIT, file), "utf8");
  return BINARY_MARKERS.some((m) => src.includes(m));
};

test("every excluded file exists — a stale entry would silently shrink CI coverage", () => {
  for (const f of BINARY_DEPENDENT) {
    assert.ok(existsSync(join(UNIT, f)), `${f} is excluded from CI but does not exist`);
  }
});

test("every excluded file genuinely drives a vendored binary", () => {
  // Stops the list becoming a parking space for merely inconvenient tests.
  for (const f of BINARY_DEPENDENT) {
    assert.ok(usesBinary(f), `${f} is excluded from CI but does not touch a vendored binary — ` +
      "if it can run on Linux, it must run in CI");
  }
});

test("no file OUTSIDE the list depends on a vendored binary", () => {
  // The anti-drift guard. A new binary-dependent test fails here rather than being quietly added
  // to the exclusion list later.
  const strays = unitFiles().filter((f) => !BINARY_DEPENDENT.includes(f) && usesBinary(f));
  assert.deepEqual(strays, [], "these run in CI but need a vendored binary — CI will fail on them: " +
    strays.join(", "));
});

test("the exclusion list is as small as it is, and that is recorded", () => {
  // 2 files / 12 tests, measured by hiding tools/avatar/vendor/ and running the suite.
  // If this number grows, someone is opting more code out of CI and should have to justify it.
  assert.equal(BINARY_DEPENDENT.length, 2,
    "the CI exclusion list changed — that reduces or restores what CI enforces; update D-094 deliberately");
});

test("CI actually runs the unit suite", () => {
  const wf = readFileSync(WORKFLOW, "utf8");
  assert.match(wf, /test:unit:ci/, "the workflow must invoke the unit runner");
  assert.match(wf, /\n\s{2}unit:/, "there must be a dedicated `unit` job");
});

test("the unit job takes no Supabase lock — it touches no backend", () => {
  // The shared e2e lock serializes runs against one live test student. The unit suite is pure
  // Node with no network, so taking that lock would queue it behind unrelated work for nothing,
  // and (as seen on 2026-08-02) a queued run can be displaced and cancelled outright.
  const wf = readFileSync(WORKFLOW, "utf8");
  const unitJob = wf.split(/\n\s{2}unit:/)[1]?.split(/\n\s{2}\w+:/)[0] ?? "";
  assert.ok(unitJob.length > 0, "unit job not found");
  assert.ok(!unitJob.includes("e2e-shared-supabase"),
    "the unit job must not take the shared Supabase concurrency lock");
});

test("the runner and the guard agree on which files exist", () => {
  const runner = readFileSync(join(REPO, "tests", "run-unit-ci.mjs"), "utf8");
  assert.match(runner, /BINARY_DEPENDENT/, "the runner must use the shared list, not its own copy");
  assert.ok(unitFiles().length > BINARY_DEPENDENT.length, "sanity: most unit files run in CI");
});
