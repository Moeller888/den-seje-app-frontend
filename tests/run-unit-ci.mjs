// Runs the unit suite in CI: every tests/unit/*.test.mjs except the binary-dependent files
// listed in unit-ci-exclusions.mjs (D-094).
//
// A tiny runner rather than a shell glob, because the exclusion has to be expressed identically
// on Windows and Linux and has to live in ONE place a test can assert against. Exit code is the
// child's, so a failing test fails the job.
import { readdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { BINARY_DEPENDENT } from "./unit-ci-exclusions.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const UNIT = join(HERE, "unit");

const all = readdirSync(UNIT).filter((f) => f.endsWith(".test.mjs")).sort();

// Fail loudly if the exclusion list names a file that no longer exists — a stale entry would
// silently shrink CI coverage, which is the exact failure mode this whole change exists to end.
const missing = BINARY_DEPENDENT.filter((f) => !existsSync(join(UNIT, f)));
if (missing.length > 0) {
  console.error("✖ unit-ci-exclusions.mjs names files that do not exist:\n  " + missing.join("\n  "));
  process.exit(1);
}

const run = all.filter((f) => !BINARY_DEPENDENT.includes(f));
console.log(`unit suite in CI: ${run.length} of ${all.length} files ` +
  `(${BINARY_DEPENDENT.length} excluded — Windows-only vendored libwebp, see unit-ci-exclusions.mjs)`);

const res = spawnSync(process.execPath, ["--test", ...run.map((f) => join(UNIT, f))], { stdio: "inherit" });
process.exit(res.status === null ? 1 : res.status);
