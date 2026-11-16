// PR #664: tests/isolated/require-complete-run.mjs is what makes the isolated introduction lane FAIL when its chain did
// not run (Playwright itself exits 0 when everything is skipped). Proven on synthetic Playwright JSON reports: only a
// report in which every test of the named spec passed exactly once is accepted; skipped, flaky, failed, interrupted,
// missing, foreign-file or global-error reports are refused with a reason. The workflow wiring is checked too.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkReport } from "../isolated/require-complete-run.mjs";

const SPEC = "laerligverse-introduction.isolated.spec.mjs";
const SCRIPT = fileURLToPath(new URL("../isolated/require-complete-run.mjs", import.meta.url));
const t = (title, status = "expected", results = ["passed"]) => ({ title, tests: [{ status, results: results.map((s) => ({ status: s })) }] });
function report(specs, { file = SPEC, stats = {}, errors = [] } = {}) {
  const tally = { expected: 0, skipped: 0, unexpected: 0, flaky: 0 };
  for (const s of specs) tally[s.tests[0].status] += 1;
  return { stats: { ...tally, interrupted: 0, ...stats }, errors, suites: [{ file, specs: specs.map((s) => ({ ...s, file })), suites: [] }] };
}

test("a complete run is accepted", () => {
  const r = checkReport(report([t("chain"), t("refusals"), t("race")]), SPEC);
  assert.deepEqual(r, { ok: true, problems: [], passed: 3 });
});

test("skipped, flaky, failed, interrupted, retried, missing, foreign or erroring runs are refused", () => {
  const cases = [
    [report([t("chain"), t("refusals", "skipped", ["skipped"])]), /skipped/],
    [report([t("chain", "skipped", ["skipped"]), t("b", "skipped", ["skipped"])]), /skipped/],
    [report([t("chain", "flaky", ["failed", "passed"])]), /flaky/],
    [report([t("chain", "unexpected", ["failed"])]), /unexpected/],
    [report([t("chain")], { stats: { interrupted: 1 } }), /interrupted/],
    [report([]), /no test from/],
    [report([t("chain")], { file: "other.isolated.spec.mjs" }), /no test from/],
    [report([t("chain")], { errors: [{ message: "boom" }] }), /global error/],
    [report([t("chain")], { stats: { expected: 2 } }), /stats\.expected = 2/],
    [{ suites: [] }, /no stats/],
    [null, /no stats/],
  ];
  for (const [rep, re] of cases) {
    const r = checkReport(rep, SPEC);
    assert.equal(r.ok, false, JSON.stringify(rep));
    assert.match(r.problems.join(" | "), re);
  }
  // A test from another file in the same report is refused (the lane runs exactly one spec).
  const mixed = report([t("chain")]);
  mixed.suites.push({ file: "kildekritik.isolated.spec.mjs", specs: [{ ...t("x"), file: "kildekritik.isolated.spec.mjs" }] });
  mixed.stats.expected = 2;
  assert.match(checkReport(mixed, SPEC).problems.join(" | "), /other files/);
});

test("the command line fails (exit 1) on an incomplete run and on an unreadable report, and passes a complete one", () => {
  const dir = mkdtempSync(join(tmpdir(), "require-complete-run-"));
  try {
    const run = (content) => {
      const f = join(dir, "r.json");
      writeFileSync(f, content);
      return spawnSync(process.execPath, [SCRIPT, f, SPEC], { encoding: "utf8" });
    };
    assert.equal(run(JSON.stringify(report([t("chain")]))).status, 0);
    const skipped = run(JSON.stringify(report([t("chain", "skipped", ["skipped"])])));
    assert.equal(skipped.status, 1);
    assert.match(skipped.stderr, /did not run completely/);
    assert.equal(run("{not json").status, 1);
    assert.equal(spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" }).status, 2, "usage error");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the workflow wires it: the introduction step runs only in the introduction lane, on chromium, and checks its report", () => {
  const wf = readFileSync(new URL("../../.github/workflows/isolated-e2e.yml", import.meta.url), "utf8");
  const at = wf.indexOf("- name: Introduction E2E — the chain must run completely (introduction lane)\n");
  assert.ok(at > 0);
  const step = wf.slice(at, wf.indexOf("\n      - ", at + 10));
  assert.match(step, /\n        if: needs\.plan\.outputs\.scope != 'docs-md' && matrix\.profile == 'introduction'\n/);
  assert.match(step, /PLAYWRIGHT_JSON_OUTPUT_NAME: \$\{\{ runner\.temp \}\}\/introduction-report\.json/);
  assert.match(step, /sg "\$ISOLATED_GROUP" -c "REPLAY_PROFILE=introduction npx playwright test -c tests\/isolated\/playwright\.isolated\.config\.mjs laerligverse-introduction\.isolated\.spec\.mjs --project=chromium --reporter=list,json"\n/);
  assert.match(step, /\n\s+node tests\/isolated\/require-complete-run\.mjs "\$PLAYWRIGHT_JSON_OUTPUT_NAME" laerligverse-introduction\.isolated\.spec\.mjs\n/);
  // The spec skips itself outside the lane, with the reason, so the shared smoke step stays green elsewhere.
  const spec = readFileSync(new URL("../isolated/laerligverse-introduction.isolated.spec.mjs", import.meta.url), "utf8");
  assert.match(spec, /const LANE = process\.env\.REPLAY_PROFILE === "introduction";/);
  assert.match(spec, /test\.skip\(!LANE, "runs only in the isolated introduction lane/);
});
