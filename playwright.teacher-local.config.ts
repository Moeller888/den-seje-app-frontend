// Isolated Playwright config for the SELF-SERVED teacher first-run spec.
//
// Like playwright.landing.config.ts it omits globalSetup entirely and loads no .env: the default
// config's globalSetup talks to the LIVE Supabase project and mutates test data before a single
// test runs. tests/teacher-first-run.spec.ts needs none of it — it serves the branch's own files
// locally, replaces the Supabase client with tests/support/fake-supabase.ts and aborts every
// *.supabase.co request. Under this config the run makes no backend request of any kind.
//
// Additive and used ONLY via `--config`. It does not change playwright.config.ts or CI.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: /teacher-first-run\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "line",
  use: { trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
