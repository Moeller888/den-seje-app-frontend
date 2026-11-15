// PR #664: a lane that is meant to prove a chain must FAIL when the chain did not run. Playwright exits 0 when every
// test is skipped (a missing environment variable, a wrong file name, a test.skip that fires by mistake), so the
// introduction lane checks the JSON report itself:
//   node tests/isolated/require-complete-run.mjs <report.json> <spec file name>
// It fails unless the report has at least one test from that spec, every result passed on its first and only
// attempt, and nothing was skipped, flaky, interrupted or unexpected.
import { readFileSync } from "node:fs";

export function checkReport(report, specFile) {
  const problems = [];
  if (!report || typeof report !== "object" || !report.stats) return { ok: false, problems: ["the report has no stats"], passed: 0 };
  const { expected = 0, skipped = 0, unexpected = 0, flaky = 0, interrupted = 0 } = report.stats;
  if (unexpected) problems.push(`${unexpected} unexpected result(s)`);
  if (flaky) problems.push(`${flaky} flaky result(s)`);
  if (skipped) problems.push(`${skipped} skipped test(s)`);
  if (interrupted) problems.push(`${interrupted} interrupted test(s)`);
  if ((report.errors ?? []).length) problems.push(`${report.errors.length} global error(s)`);
  const tests = [];
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) for (const t of spec.tests ?? []) tests.push({ file: spec.file ?? suite.file, title: spec.title, t });
    for (const s of suite.suites ?? []) walk(s);
  };
  for (const s of report.suites ?? []) walk(s);
  const mine = tests.filter((x) => typeof x.file === "string" && x.file.replace(/\\/g, "/").endsWith(specFile));
  if (mine.length === 0) problems.push(`no test from ${specFile} in the report`);
  if (mine.length !== tests.length) problems.push(`${tests.length - mine.length} test(s) from other files`);
  for (const { title, t } of mine) {
    const results = t.results ?? [];
    if (t.status !== "expected" || results.length !== 1 || results[0].status !== "passed") {
      problems.push(`not passed once: ${title} (${t.status}, ${results.map((r) => r.status).join("/") || "no result"})`);
    }
  }
  if (expected !== mine.length) problems.push(`stats.expected = ${expected}, but ${mine.length} test(s) in the report`);
  return { ok: problems.length === 0, problems, passed: mine.length };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("require-complete-run.mjs")) {
  const [file, spec] = process.argv.slice(2);
  if (!file || !spec) {
    console.error("usage: node tests/isolated/require-complete-run.mjs <report.json> <spec file name>");
    process.exit(2);
  }
  let report;
  try { report = JSON.parse(readFileSync(file, "utf8")); } catch (e) {
    console.error(`✖ cannot read the Playwright JSON report ${file}: ${e.message}`);
    process.exit(1);
  }
  const r = checkReport(report, spec);
  if (!r.ok) {
    console.error(`✖ ${spec} did not run completely:\n  ${r.problems.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`✔ ${spec}: all ${r.passed} test(s) ran and passed; none skipped, flaky or missing`);
}
