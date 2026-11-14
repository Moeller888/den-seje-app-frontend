// F07 lane: no false green. Reads the Playwright JSON report(s) of the F07 lane and fails unless the F-07 spec
// really ran with the expected tests in the expected projects:
//   chromium          5 tests (4 backend + 1 browser), all executed and passed, none skipped;
//   firefox, webkit   the browser test executed and passed; ONLY the 4 backend tests skipped (by design: backend
//                     paths run once per run, on chromium).
// Any failed, flaky, unexpected-skip, missing project, missing test or extra file → exit 1.
//
//   node tests/isolated/f07-lane-check.mjs <report.json> [<report.json> …] [--projects chromium,firefox,webkit]
import { readFileSync } from "node:fs";

export const SPEC = "f07-phase-progression.isolated.spec.mjs";
export const BACKEND_PREFIX = "backend ";
export const EXPECTED_TITLES = [
  "backend 1: all seven in phase order; a reload keeps the open round; a wrong answer is practised in its phase; rewards once",
  "backend 2: a pupil without the pilot domain is never served a pilot row",
  "backend 3: two tabs at once when a phase repeat is due get the SAME open round, never no_questions",
  "backend 4: all answers wrong — at most 1 + 2 attempts per question, the pupil always moves on, never no_questions",
  "browser: the quiz shows each of the seven stimuli and the pupil answers all seven (MC by click, numbers by typing)",
];

// Flattens a Playwright JSON report into { file, title, project, status, outcome }.
export function flatten(report) {
  const out = [];
  const walk = (suite, file) => {
    const f = suite.file ?? file;
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const last = (t.results ?? []).at(-1);
        out.push({ file: (spec.file ?? f ?? "").split(/[\\/]/).pop(), title: spec.title, project: t.projectName, status: t.status, outcome: last?.status ?? "none" });
      }
    }
    for (const s of suite.suites ?? []) walk(s, f);
  };
  for (const s of report.suites ?? []) walk(s, s.file);
  return out;
}

export function checkLane(reports, projects) {
  const problems = [];
  const rows = reports.flatMap(flatten);
  const foreign = rows.filter((r) => r.file !== SPEC);
  if (foreign.length) problems.push(`unexpected files in the F07 lane: ${[...new Set(foreign.map((r) => r.file))].join(", ")}`);
  const summary = {};
  for (const project of projects) {
    const mine = rows.filter((r) => r.file === SPEC && r.project === project);
    const s = { passed: 0, failed: 0, skipped: 0 };
    for (const title of EXPECTED_TITLES) {
      const hit = mine.filter((r) => r.title === title);
      if (hit.length !== 1) { problems.push(`${project}: "${title}" ran ${hit.length}×, expected once`); continue; }
      const r = hit[0];
      const mustSkip = project !== "chromium" && title.startsWith(BACKEND_PREFIX);
      if (r.outcome === "passed" && r.status === "expected") s.passed++;
      else if (r.outcome === "skipped") s.skipped++;
      else s.failed++;
      if (mustSkip && r.outcome !== "skipped") problems.push(`${project}: "${title}" should be skipped (backend runs on chromium), got ${r.outcome}`);
      if (!mustSkip && !(r.outcome === "passed" && r.status === "expected")) problems.push(`${project}: "${title}" must pass, got ${r.status}/${r.outcome}`);
    }
    const extra = mine.filter((r) => !EXPECTED_TITLES.includes(r.title));
    if (extra.length) problems.push(`${project}: unexpected tests ${extra.map((r) => r.title).join(" | ")}`);
    summary[project] = s;
  }
  return { ok: problems.length === 0, problems, summary };
}

if (process.argv[1] && process.argv[1].endsWith("f07-lane-check.mjs")) {
  const args = process.argv.slice(2);
  const i = args.indexOf("--projects");
  const projects = i >= 0 ? args[i + 1].split(",") : ["chromium", "firefox", "webkit"];
  const files = args.filter((a, k) => !(i >= 0 && (k === i || k === i + 1)));
  if (files.length === 0) { console.error("usage: f07-lane-check.mjs <report.json>… [--projects a,b]"); process.exit(2); }
  const { ok, problems, summary } = checkLane(files.map((f) => JSON.parse(readFileSync(f, "utf8"))), projects);
  for (const [p, s] of Object.entries(summary)) console.log(`F07 lane ${p}: passed ${s.passed}, failed ${s.failed}, skipped ${s.skipped}`);
  for (const p of problems) console.error(`F07 lane: ${p}`);
  console.log(ok ? "F07 lane: VERIFIED — the F-07 spec ran with the expected tests" : "F07 lane: NOT VERIFIED");
  process.exit(ok ? 0 : 1);
}
