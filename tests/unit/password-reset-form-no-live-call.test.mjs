// The login page's "Glemt adgangskode?" form posts the typed address to request-password-help
// (js/login.js, Section 173). For a student address that function mails the student's teacher, so
// an E2E spec that submits the form against production must never let the call through.
//
// Pinned here:
//   1. password-reset.spec.ts test 4 installs an in-browser intercept BEFORE loading the page,
//      answers with the function's own contract (handler.ts), never forwards, proves the call was
//      made exactly once, and types a reserved .invalid address;
//   2. repo-wide: every spec that submits the reset form either intercepts request-password-help
//      or blocks all *.supabase.co traffic, and none types a TEST_* account address into it;
//   3. the form really does call request-password-help (if login.js changes route, this file must
//      be revisited rather than silently pass).

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const ROOT = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), "utf8").split("\r\n").join("\n");

const SPEC = read("tests/password-reset.spec.ts");
const T4_START = SPEC.indexOf("test('4. ");
const T4 = SPEC.slice(T4_START, SPEC.indexOf("\n});\n", T4_START) + 4);

// ── 1. Test 4 ─────────────────────────────────────────────────────────────────────────────────
test("test 4 exists and is not skipped in any browser", () => {
  assert.ok(T4_START > 0, "test 4 found");
  assert.ok(!T4.includes("test.skip("), "no skip: the call is intercepted, so every browser can run it");
});

test("test 4 uses the function's real contract", () => {
  assert.ok(SPEC.includes("import { CORS_HEADERS, GENERIC_BODY } from '../supabase/functions/request-password-help/handler.ts';"));
  assert.ok(T4.includes("body: JSON.stringify(GENERIC_BODY),"));
  assert.ok(T4.includes("await expect(page.locator('#reset-message')).toHaveText(GENERIC_BODY.message, { timeout: 10000 });"));
});

test("test 4 installs the intercept before the page loads, and never forwards", () => {
  const route = T4.indexOf("await page.route('**/functions/v1/request-password-help', async (route: any) => {");
  const goto = T4.indexOf("await page.goto(");
  const click = T4.indexOf("await page.locator('#resetRequestBtn').click();");
  assert.ok(route > 0 && goto > route && click > goto, "route → goto → click");
  for (const forbidden of ["route.continue(", "route.fallback(", "fetch(", "request.continue(", "route.request().response("]) {
    assert.ok(!T4.includes(forbidden), "test 4 must not use " + forbidden);
  }
  // Both the preflight and the POST are answered locally.
  assert.ok(T4.includes("await route.fulfill({ status: 204, headers: CORS_HEADERS });"));
  assert.ok(T4.includes("await route.fulfill({\n      status: 200,"));
});

test("test 4 proves the call happened exactly once, with the right method and body, answered locally", () => {
  assert.ok(T4.includes("message: 'the form must call request-password-help exactly once'"));
  assert.ok(T4.includes(".toBe(1);"));
  assert.ok(T4.includes("expect(posts[0].method).toBe('POST');"));
  assert.ok(T4.includes("JSON.stringify(posts[0].body) === JSON.stringify({ email: RESET_FORM_ADDRESS })"));
  assert.ok(T4.includes("expect(markers, 'every answer must come from the in-browser intercept').toEqual([INTERCEPT_MARKER]);"));
  // The meaningful UI assertions stay.
  assert.ok(T4.includes("await expect(page.locator('#resetRequestBtn')).toBeEnabled();"));
  assert.ok(T4.includes("await expect(page.locator('#reset-email')).toHaveValue('');"));
});

test("test 4 types a reserved .invalid address, never an account address, and logs nothing", () => {
  assert.ok(SPEC.includes("const RESET_FORM_ADDRESS = 'no-such-user-password-reset-form@example.invalid';"));
  assert.ok(T4.includes("await page.fill('#reset-email', RESET_FORM_ADDRESS);"));
  assert.ok(!T4.includes("STUDENT_EMAIL") && !T4.includes("TEST_"), "no account address in test 4");
  assert.ok(!T4.includes("console."), "test 4 prints nothing");
});

// ── 2. Every spec that submits the reset form ─────────────────────────────────────────────────
const SPECS = readdirSync(new URL("tests/", ROOT)).filter((f) => f.endsWith(".spec.ts")).sort();
const submitsResetForm = (src) => src.includes("#resetRequestBtn") && /\.click\(/.test(src) && /#reset-email['"]\s*,/.test(src);

test("every spec that fills and submits the reset form keeps the call inside the browser", () => {
  const offenders = [];
  let seen = 0;
  for (const f of SPECS) {
    const src = read("tests/" + f);
    if (!submitsResetForm(src)) continue;
    seen++;
    const intercepts = src.includes("page.route('**/functions/v1/request-password-help'") && !src.includes("route.continue(");
    const blocksSupabase = src.includes('page.route("**/*.supabase.co/**", (route: any) => route.abort());');
    if (!intercepts && !blocksSupabase) offenders.push(f);
    for (const m of src.matchAll(/fill\(\s*['"]#reset-email['"]\s*,\s*([^)]+)\)/g)) {
      if (/STUDENT|TEACHER|TEST_|process\.env/.test(m[1])) offenders.push(`${f}: types an account address (${m[1].trim()})`);
    }
  }
  assert.ok(seen >= 1, "the scan sees password-reset.spec.ts");
  assert.deepEqual(offenders, []);
});

test("negative controls: the scan recognises an unprotected submission", () => {
  const bad = "await page.fill('#reset-email', STUDENT_EMAIL);\nawait page.locator('#resetRequestBtn').click();";
  assert.equal(submitsResetForm(bad), true);
  assert.equal(bad.includes("page.route('**/functions/v1/request-password-help'"), false);
  assert.ok(/STUDENT|TEACHER|TEST_|process\.env/.test("STUDENT_EMAIL"));
});

// ── 3. The form's target ──────────────────────────────────────────────────────────────────────
test("the form calls request-password-help (the intercept targets the real call)", () => {
  const login = read("js/login.js");
  assert.ok(login.includes('const { data, error } = await supabase.functions.invoke("request-password-help", {'));
  assert.ok(login.includes("data.message"), "the page shows the function's message");
});
