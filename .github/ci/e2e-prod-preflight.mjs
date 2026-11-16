// Preflight step for the production jobs bound to the `e2e-prod` environment (playwright.yml `test`,
// update-avatar-goldens.yml `update`). The rule lives in preflight() in ./e2e-prod-environment.mjs,
// unit-tested by tests/unit/ci-e2e-prod-environment.test.mjs; this file only reads the environment
// and sets the exit code. It prints names and "sat"/"mangler" only — never a value.
import { preflight } from "./e2e-prod-environment.mjs";

const verdict = preflight(process.env);
for (const line of verdict.lines) console.log(line);
if (verdict.ok) {
  console.log("e2e-prod preflight: ok");
} else {
  for (const problem of verdict.problems) console.log("::error::e2e-prod preflight: " + problem);
  process.exitCode = 1;
}
