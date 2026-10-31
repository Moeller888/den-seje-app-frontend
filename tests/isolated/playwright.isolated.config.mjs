// Playwright config for the isolated E2E proof of concept ONLY. The main suite
// (playwright.config.ts, testMatch **/*.spec.ts) never collects these *.isolated.spec.mjs files.
import { defineConfig, devices } from "@playwright/test";
import { assertIsolated } from "./isolation-guard.mjs";

// Refuse before any browser starts: this config must never run against production.
assertIsolated(process.env);

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.isolated.spec.mjs",
  workers: 1,
  retries: 0,
  reporter: "list",
  use: { trace: "off" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
