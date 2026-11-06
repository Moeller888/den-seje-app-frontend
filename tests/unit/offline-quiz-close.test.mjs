// D-110: an offline quiz spec never closes its context with quiz calls in flight (tests/support/close-offline-quiz.ts).
//
// Pinned for EVERY spec that serves the raw checkout's quiz from its own context, answers *.supabase.co from
// fixtures through ctx.route and captures answers (so it ends right after an answer, with after-answer calls
// pending): it closes through closeOfflineQuiz, never with a bare `context().close()` / `ctx.close()`; and
// the helper stops the page (about:blank, routes still active) BEFORE it closes the context.
// Found automatically, so a new spec of this kind is covered without editing this test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const TESTS = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(TESTS, p), "utf8");
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

export function isOfflineQuizHarness(src) {
  return /\.route\("\*\*:\/\/\*\.supabase\.co\/\*\*"/.test(src)
    && /browser\.newContext\(/.test(src)
    && /\/index\.html/.test(src)
    && /postDataJSON\(\)/.test(src);
}
export const bareCloses = (src) => (code(src).match(/\.context\(\)\.close\(\)|\bctx\.close\(\)/g) ?? []).length;

const SPECS = readdirSync(TESTS).filter((f) => f.endsWith(".spec.ts")).filter((f) => isOfflineQuizHarness(read(f)));

test("the offline quiz harness specs are found (today: number-answer-ui, true-false-quiz)", () => {
  for (const f of ["number-answer-ui.spec.ts", "true-false-quiz.spec.ts"]) assert.ok(SPECS.includes(f), f);
});

test("each closes through closeOfflineQuiz — never a bare context close with calls in flight", () => {
  for (const f of SPECS) {
    const src = read(f);
    assert.equal(bareCloses(src), 0, `${f}: close the quiz with closeOfflineQuiz(page)`);
    assert.match(src, /import \{ closeOfflineQuiz \} from "\.\/support\/close-offline-quiz";/, f);
    assert.ok((code(src).match(/await closeOfflineQuiz\(/g) ?? []).length >= 1, f);
  }
});

test("the helper stops the page while the routes are active, then closes the context", () => {
  const helper = code(read("support/close-offline-quiz.ts"));
  const stop = helper.indexOf('await page.goto("about:blank")');
  const close = helper.indexOf("await page.context().close()");
  assert.ok(stop > 0 && close > stop, "about:blank first, then the context");
  assert.equal(/unroute|route\(/.test(helper), false, "the helper never touches the routes");
});

test("the detector and the close counter recognise the old pattern (negative control)", () => {
  const old = 'await ctx.route("**://*.supabase.co/**", async (route) => {});\nconst ctx = await browser.newContext();\n'
    + 'await page.goto(`${baseUrl}/index.html`);\nconst body = req.postDataJSON();\nawait page.context().close();\n';
  assert.equal(isOfflineQuizHarness(old), true);
  assert.equal(bareCloses(old), 1);
  assert.equal(bareCloses("// await page.context().close();\nawait closeOfflineQuiz(page);"), 0, "a comment is not a close");
});
