// CI install check: every Playwright browser this checkout uses can START on this runner — its browser
// build is present and the system libraries it needs are installed. Used by the "Install Playwright
// browsers" steps after the cache-first install (isolated-e2e.yml, playwright.yml): a browser that cannot
// launch fails HERE, as an install problem, instead of later as a confusing test failure.
//
//   node tests/support/browser-launch-check.mjs [chromium firefox webkit]
//
// It opens about:blank only: no network, no page from the internet. Exit 0 = all launched; exit 1 names
// the browser and the first line of the error. Nothing is retried.
import { chromium, firefox, webkit } from "@playwright/test";

const BROWSERS = { chromium, firefox, webkit };
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(BROWSERS);

let failed = 0;
for (const name of wanted) {
  const type = BROWSERS[name];
  if (!type) { console.error(`browser-launch-check: unknown browser "${name}"`); process.exit(1); }
  try {
    const browser = await type.launch({ headless: true, timeout: 60_000 });
    const page = await browser.newPage();
    await page.goto("about:blank");
    console.log(`browser-launch-check: ${name} ${browser.version()} launched`);
    await browser.close();
  } catch (e) {
    failed++;
    console.error(`browser-launch-check: ${name} cannot launch — ${String(e?.message ?? e).split("\n")[0]}`);
  }
}
process.exit(failed ? 1 : 0);
