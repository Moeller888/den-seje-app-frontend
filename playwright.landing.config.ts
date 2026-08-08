// Isolated Playwright config for the landing-page spec ONLY.
//
// WHY THIS FILE EXISTS. The default playwright.config.ts declares
// `globalSetup: './tests/global-setup.ts'`, which talks to the LIVE Supabase project: it runs the
// question-pool health check, creates/updates the test teacher and two test students, resets their
// passwords and DELETES their question_instances rows. That is a production data mutation, and it
// happens before a single test runs — so it cannot be avoided by choosing which spec to execute.
// tests/landing.spec.ts needs none of it: the landing page is static, has no Supabase client and no
// session. This config therefore omits globalSetup entirely and loads no .env, exactly as
// playwright.headwear.config.ts and playwright.torso.config.ts already do for their fixture-based
// specs. Under this config the whole run makes no backend request of any kind.
//
// Additive and used ONLY via `--config`. It does NOT change playwright.config.ts, the CI contract,
// or full-suite behaviour: CI still runs `npx playwright test` against playwright.config.ts, where
// this spec also passes because it self-serves the branch's own files over a local http.Server and
// never depends on the deployed origin.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "landing.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "line",
  use: { trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
