// Guard step for manual runs of the Playwright workflow (the `test` job, before anything can reach
// Supabase). The rule lives in dispatchGuard() in ./e2e-slot.mjs, unit-tested by
// tests/unit/ci-e2e-slots.test.mjs; this file only reads the environment and sets the exit code.
// It prints slot numbers only — never an address or a secret.
import { dispatchGuard } from "./e2e-slot.mjs";

const verdict = dispatchGuard({
  eventName: process.env.GITHUB_EVENT_NAME,
  dispatchSlot: process.env.DISPATCH_SLOT,
  confirmation: process.env.DISPATCH_CONFIRMATION,
  slotCount: process.env.E2E_SLOT_COUNT,
  jobSlot: process.env.E2E_SLOT,
});
if (verdict.ok) {
  console.log(verdict.message);
} else {
  console.log("::error::" + verdict.message);
  process.exitCode = 1;
}
