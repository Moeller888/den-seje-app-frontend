// Isolated Playwright config for the D-090 owner REVIEW EXPORT only.
//
// Same contract as playwright.torso.config.ts: zero backend contact, no globalSetup, no .env — the
// spec self-serves this branch's files and fixture-intercepts every *.supabase.co call. It writes
// review PNGs outside the repository and asserts nothing, so it is deliberately NOT part of the
// default suite: `npx playwright test` and the CI contract are unchanged.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tools/avatar/playwright",
  testMatch: "avatar-r2-torso-review-export.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "line",
  use: { trace: "off" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
