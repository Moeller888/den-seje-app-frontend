// Isolated Playwright config for the fixture-based Avatar R2 face/mask spec ONLY (D-081).
//
// Runs tests/avatar-r2-face.spec.ts with ZERO backend contact — no globalSetup (so the live Supabase
// question-pool health check + test-account provisioning in tests/global-setup.ts never runs) and NO
// .env load. The spec is self-served (a local http.Server serves this branch's files) and
// fixture-intercepts every *.supabase.co call with fictitious local values, so under this config the
// whole run makes no real backend request.
//
// Additive and used ONLY via `--config`. It does NOT change the default playwright.config.ts, the CI
// contract, or the full-suite behaviour (CI still runs `npx playwright test` on playwright.config.ts).
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "avatar-r2-face.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "line",
  use: { trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
