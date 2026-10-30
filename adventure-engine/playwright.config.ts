import { defineConfig, devices } from "@playwright/test";

/**
 * E2E against the production build (vite build + vite preview).
 * Functional specs run in Chromium, Firefox and WebKit; screenshot specs only in Chromium.
 * One worker: the specs share the preview servers and are cheap.
 * Editor specs (e2e/editor/) use the editor server on port 4318.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  snapshotPathTemplate: "e2e/__screenshots__/{testFileName}/{arg}{ext}",
  expect: { timeout: 10_000, toHaveScreenshot: { maxDiffPixelRatio: 0.002, animations: "disabled", caret: "hide" } },
  use: {
    baseURL: "http://127.0.0.1:4317/",
    viewport: { width: 1280, height: 720 },
    trace: "retain-on-failure",
  },
  // One process builds and serves the game (4317), the editor (4318) and the DEV_TOOLS=true game (4319): tools/e2e-serve.mjs.
  webServer: {
    command: "node tools/e2e-serve.mjs",
    url: "http://127.0.0.1:4317/",
    reuseExistingServer: false,
    timeout: 240_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 720 } } },
    { name: "firefox", use: { ...devices["Desktop Firefox"], viewport: { width: 1280, height: 720 } } },
    { name: "webkit", use: { ...devices["Desktop Safari"], viewport: { width: 1280, height: 720 } } },
  ],
});
