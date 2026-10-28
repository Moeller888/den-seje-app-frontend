// The EXISTING Playwright suite (playwright.config.ts, every tests/*.spec.ts) run against the isolated
// stack (D-110). Started only by tests/isolated/run-suite.mjs, which builds and checks the environment
// first; this file refuses on its own as well.
//
// Identical to the main config except:
//   - every browser goes through the tripwire proxy (loopback and the two locally served CDN hosts
//     bypassed), so a browser request to anything else is refused and recorded;
//   - paths are absolute (the main config's are relative to the repository root);
//   - the HTML report and test results land in isolated-only folders.
import base from "../../playwright.config";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

const ROOT = process.cwd();
if (!existsSync(resolve(ROOT, "playwright.config.ts"))) throw new Error("run from the repository root");
if (process.env.ISOLATED_SUITE !== "1") throw new Error("REFUSED — start the isolated suite through tests/isolated/run-suite.mjs");
const server = process.env.ISOLATED_TRIPWIRE_PROXY ?? "";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(server)) throw new Error("REFUSED — ISOLATED_TRIPWIRE_PROXY must be a loopback proxy");
// The two CDN hosts bypass the proxy: the runner maps them to 127.0.0.1 and serves the mirrored
// modules there (tests/isolated/cdn-https.mjs). If that mapping were missing, the direct connection
// would hit the network lock instead — never the internet.
const proxy = { server, bypass: "127.0.0.1,localhost,::1,cdn.jsdelivr.net,esm.sh" };

// Chromium's Local Network Access check: a document a spec fulfils through page.route (stav-til serves
// the checked-out index.html that way) has no address space of its own and counts as public, so its
// fetches to the loopback backend are refused. In production every origin is public and the check
// never fires; here the backend is 127.0.0.1. The permission lifts only that check (Chromium-only,
// so it is added to Chromium projects alone); the network lock is unaffected.
const isChromium = (p) => (p.use?.defaultBrowserType ?? p.use?.browserName) === "chromium";
const projectUse = (p) => ({
  ...(p.use ?? {}),
  proxy,
  ignoreHTTPSErrors: true,
  ...(isChromium(p) ? { permissions: [...(p.use?.permissions ?? []), "local-network-access"] } : {}),
});

export default {
  ...base,
  testDir: resolve(ROOT, "tests"),
  globalSetup: resolve(ROOT, "tests", "global-setup.ts"),
  outputDir: resolve(ROOT, "test-results-isolated"),
  reporter: [["list"], ["html", { open: "never", outputFolder: resolve(ROOT, "playwright-report-isolated") }], [resolve(ROOT, "tests", "support", "timing-reporter.mjs")]],
  // ignoreHTTPSErrors: only the local CDN stand-in speaks HTTPS here, with a self-signed certificate.
  use: { ...base.use, proxy, ignoreHTTPSErrors: true },
  projects: (base.projects ?? []).map((p) => ({ ...p, use: projectUse(p) })),
};
