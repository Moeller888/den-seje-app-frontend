// Test timeline for the isolated suite's egress attribution (D-110 tripwire diagnostics).
//
// A Playwright reporter that appends one JSON line per test begin and end to the file named by
// ISOLATED_TIMELINE_FILE (set by tests/isolated/run-suite.mjs; without it the reporter does nothing).
// The runner compares the tripwire's refusal times with this timeline: the suite runs ONE worker, so a
// refusal falls inside exactly one test or between two.
//
// Recorded: time, begin/end, project, spec file (repository-relative), line, test title, retry, worker,
// status. Never a URL, header, body, credential or test output.
import { appendFileSync } from "node:fs";
import { relative } from "node:path";

export function timelineEntry(ev, test, result, { now = Date.now(), rootDir = process.cwd() } = {}) {
  const file = test?.location?.file ? relative(rootDir, test.location.file).split("\\").join("/") : "unknown";
  const entry = {
    at: now,
    ev,
    project: test?.parent?.project?.()?.name ?? "unknown",
    file,
    line: test?.location?.line ?? null,
    title: String(test?.title ?? ""),
    retry: result?.retry ?? 0,
    worker: result?.workerIndex ?? null,
  };
  if (ev === "end") entry.status = result?.status ?? "unknown";
  return entry;
}

export default class EgressTimelineReporter {
  constructor() {
    this.file = process.env.ISOLATED_TIMELINE_FILE || null;
  }

  write(entry) {
    if (!this.file) return;
    try { appendFileSync(this.file, JSON.stringify(entry) + "\n"); } catch { /* diagnostics only: never fail the run */ }
  }

  onTestBegin(test, result) { this.write(timelineEntry("begin", test, result)); }

  onTestEnd(test, result) { this.write(timelineEntry("end", test, result)); }

  printsToStdio() { return false; }
}
