import { defineConfig, devices } from '@playwright/test';
import { OFFLINE_SPECS, isCredentialVar } from './tests/offline-specs.mjs';

// Offline E2E run: only the specs in tests/offline-specs.mjs, which need no Supabase project.
//
//   npx playwright test -c playwright.offline.config.ts
//
// Unlike playwright.config.ts there is deliberately NO globalSetup and NO dotenv: nothing here may
// reset or even read a live test account, so this run is safe beside any live E2E run (CI or local).
// Credentials the calling shell may have exported are removed as well (Playwright re-evaluates this
// file in every worker, so the specs never see them either). tests/unit/offline-e2e-config.test.mjs
// pins all of this.
for (const name of Object.keys(process.env)) {
  if (isCredentialVar(name)) delete process.env[name];
}

export default defineConfig({
  testDir: './tests',
  testMatch: OFFLINE_SPECS.map((file) => `**/${file}`),

  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,

  // Own output folders, so an offline run never overwrites the report or traces of a live run in the
  // same checkout.
  outputDir: './test-results-offline',
  reporter: [['html', { outputFolder: 'playwright-report-offline', open: 'never' }], ['./tests/support/timing-reporter.mjs']],

  use: {
    trace: 'retain-on-failure',
  },

  // Same project names as playwright.config.ts, so the golden screenshots resolve to the same files.
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
