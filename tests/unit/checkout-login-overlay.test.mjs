// Guards the checkout overlay for js/login.js (tests/helpers.ts serveCheckoutLogin).
//
// The E2E suite runs against the live site, which serves main's login.js until a change is merged.
// PR #446 moved the pupil's landing page from index.html to hub.html; its specs waited for hub.html
// while the live login.js still sent the pupil to the quiz, every pupil login timed out, and the job
// hit its 90-minute limit. Pinned:
//   - serveCheckoutLogin serves the checkout's js/login.js for the live origin;
//   - every live spec that expects the Hub calls it immediately before each login.html visit.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TESTS = join(ROOT, "tests");
const HELPERS = readFileSync(join(TESTS, "helpers.ts"), "utf8");
const LOGIN_VISIT = /^\s*await page\.goto\(`\$\{PROD\}\/login\.html`/;

test("serveCheckoutLogin serves the checkout's js/login.js on the live origin", () => {
  assert.match(HELPERS, /export async function serveCheckoutLogin\(page: any\): Promise<void>/);
  assert.match(HELPERS, /const CHECKOUT_LOGIN_JS = path\.resolve\(__dirname, "\.\.\/js\/login\.js"\);/);
  assert.match(HELPERS, /page\.route\(`\$\{PROD\}\/js\/login\.js`/);
  assert.match(HELPERS, /readFileSync\(CHECKOUT_LOGIN_JS, "utf8"\)/);
});

const liveHubSpecs = readdirSync(TESTS)
  .filter((file) => file.endsWith(".spec.ts"))
  .filter((file) => {
    const src = readFileSync(join(TESTS, file), "utf8");
    return /hub\\?\.html/.test(src) && src.split(/\r?\n/).some((line) => LOGIN_VISIT.test(line));
  });

test("the live specs that expect the Hub are found", () => {
  assert.ok(liveHubSpecs.length >= 20, `found ${liveHubSpecs.length}: ${liveHubSpecs.join(", ")}`);
  assert.ok(liveHubSpecs.includes("example.spec.ts"));
});

for (const file of liveHubSpecs) {
  test(`${file} serves the checkout login.js before every login.html visit`, () => {
    const lines = readFileSync(join(TESTS, file), "utf8").split(/\r?\n/);
    assert.match(lines.join("\n"), /import \{[^}]*\bserveCheckoutLogin\b[^}]*\} from ["']\.\/helpers\.js["'];/);
    lines.forEach((line, i) => {
      if (!LOGIN_VISIT.test(line)) return;
      assert.match(lines[i - 1] ?? "", /^\s*await serveCheckoutLogin\(page\);$/, `${file}:${i + 1}`);
    });
  });
}
