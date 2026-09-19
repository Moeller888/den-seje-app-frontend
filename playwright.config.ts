import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';

// Load .env into process.env for the config process AND every worker (Playwright
// re-evaluates this config file in each worker), so specs and global-setup can read
// test credentials (TEST_STUDENT_EMAIL/PASSWORD) and Supabase keys from a gitignored
// .env. Secrets are never hardcoded in test files — see .env.example.
dotenv.config();

export default defineConfig({
  globalSetup: './tests/global-setup.ts',
  testDir: './tests',

  // 🔥 KUN KØR .spec.ts FILES (MEGET VIGTIGT)
  testMatch: '**/*.spec.ts',

  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,
  // Local retries = 1 to absorb known transient flakes against the live production
  // target: production-network variance (e.g. ERR_NETWORK_CHANGED) and cold Edge
  // Function latency (get-next-question / login timeouts). One retry clears these;
  // a real assertion/pixel/render failure still fails after the retry. CI keeps 2.
  retries: process.env.CI ? 2 : 1,

  reporter: 'html',

  use: {
    trace: 'retain-on-failure',
  },

  projects: [
    // Section 173: API-only specs drive Edge Functions over fetch and assert against the
    // database. They use no `page` fixture, so running them once per browser engine bought no
    // extra coverage — it only multiplied their writes against the single shared test student,
    // and in run 31266753389 it multiplied a real outbound e-mail by three.
    //
    // The split uses per-project testMatch/testIgnore rather than de-duplicating the report, so
    // the spec is COLLECTED once: its beforeAll/afterAll hooks never run in the browser projects.
    //
    // Kept deliberately narrow. Other specs are browser-less too, but moving them here would
    // change collected counts across the whole suite — a separate decision, not this fix.
    {
      name: 'api',
      testMatch: /password-help\.spec\.ts/,
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /password-help\.spec\.ts/,
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      testIgnore: /password-help\.spec\.ts/,
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      testIgnore: /password-help\.spec\.ts/,
    },
  ],
});