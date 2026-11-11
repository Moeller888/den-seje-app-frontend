// Playwright config for the isolated E2E proof of concept ONLY. The main suite
// (playwright.config.ts, testMatch **/*.spec.ts) never collects these *.isolated.spec.mjs files.
import { defineConfig, devices } from "@playwright/test";
import { assertIsolated } from "./isolation-guard.mjs";

// Refuse before any browser starts: this config must never run against production.
assertIsolated(process.env);

// Test branch test/f07-strategy-a-prodlike (D-362 / F-07, strategy A): started through
// tests/isolated/run-isolated-tripwire.mjs, every browser goes through the tripwire proxy with the same
// bypass list as tests/isolated/playwright.suite.config.ts. That runner sets ISOLATED_REQUIRE_TRIPWIRE=1,
// and then a missing or non-loopback proxy refuses the run instead of running without the tripwire.
const server = process.env.ISOLATED_TRIPWIRE_PROXY ?? "";
const requireTripwire = process.env.ISOLATED_REQUIRE_TRIPWIRE === "1";
if ((requireTripwire || server !== "") && !/^http:\/\/127\.0\.0\.1:\d+$/.test(server)) {
  throw new Error("REFUSED — ISOLATED_TRIPWIRE_PROXY must be a loopback proxy");
}
const proxy = server !== "" ? { server, bypass: "127.0.0.1,localhost,::1,cdn.jsdelivr.net,esm.sh" } : undefined;
const withProxy = (use) => (proxy ? { ...use, proxy } : use);

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.isolated.spec.mjs",
  workers: 1,
  retries: 0,
  reporter: "list",
  use: withProxy({ trace: "off" }),
  projects: [
    { name: "chromium", use: withProxy({ ...devices["Desktop Chrome"] }) },
    { name: "firefox", use: withProxy({ ...devices["Desktop Firefox"] }) },
    { name: "webkit", use: withProxy({ ...devices["Desktop Safari"] }) },
  ],
});
