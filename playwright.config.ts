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
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
});