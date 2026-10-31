/**
 * Run scenarios from the command line.
 *
 *   pnpm scenarios                 run all scenarios, compare supported traces with goldens
 *   pnpm scenarios <name> ...      run selected scenarios
 *   pnpm golden:update             (re)write golden traces for passing supported scenarios
 *
 * Exit code 1 if a supported scenario fails or its trace differs from the golden file.
 * Unsupported scenarios are reported (expected to be unsupported) but do not fail the run.
 */
import { SUPPORTED_SCENARIOS, listScenarios, readGolden, readScenario, writeGolden } from "./files.ts";
import { runScenario } from "./runner.ts";

const args = process.argv.slice(2);
const update = args.includes("--update-golden");
const names = args.filter((a) => !a.startsWith("--"));
const selected = names.length > 0 ? names : listScenarios();
const supported = new Set<string>(SUPPORTED_SCENARIOS);
let failed = false;

for (const name of selected) {
  const result = runScenario(readScenario(name));
  const required = supported.has(name);
  let status = result.passed ? "PASS" : required ? "FAIL" : "SKIP";
  let detail = result.error?.message ?? "";
  if (result.passed && required) {
    const golden = readGolden(name);
    if (update) {
      writeGolden(name, result.trace);
      detail = "golden written";
    } else if (golden === null) {
      status = "FAIL";
      detail = "no golden trace (run pnpm golden:update and review it)";
    } else if (golden !== result.trace) {
      status = "FAIL";
      detail = "trace differs from golden";
    }
  }
  if (status === "FAIL") failed = true;
  console.log(`${status.padEnd(4)} ${name}${detail ? ` — ${detail}` : ""}`);
}

process.exitCode = failed ? 1 : 0;
