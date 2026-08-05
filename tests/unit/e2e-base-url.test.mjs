// The E2E target must stay defined in exactly ONE place, and stay overridable without a code edit.
// ---------------------------------------------------------------------------------------------
// It used to be copy-pasted into 21 spec files in nine different formattings. That had two costs,
// and the second one is why this guard exists:
//
//   1. moving host was a 21-file edit;
//   2. the suite could only ever point at one hardcoded origin. When Vercel Hobby was paused and
//      production began returning HTTP 402, all 816 tests failed against a dead URL, each was
//      retried twice, and the job hit the 60-minute limit and was CANCELLED with no failure
//      summary — which is indistinguishable from a hang.
//
// These tests are source-level on purpose: the specs are TypeScript and this suite is plain Node,
// so the contract is asserted against the files themselves rather than by importing them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const TESTS = join(HERE, "..");
const HELPERS = join(TESTS, "helpers.ts");
const specs = readdirSync(TESTS).filter((f) => f.endsWith(".spec.ts")).sort();
const readSpec = (f) => readFileSync(join(TESTS, f), "utf8");

// Any origin that is the app itself. Supabase and other third-party URLs are none of our business.
const APP_HOST = /https?:\/\/[^\s"'`]*den-seje-app-frontend[^\s"'`]*/g;

test("there are spec files to guard", () => {
  assert.ok(specs.length >= 30, `expected the E2E suite, found ${specs.length} spec files`);
});

test("the app origin is hardcoded in exactly one file: tests/helpers.ts", () => {
  const offenders = specs.filter((f) => APP_HOST.test(readSpec(f)) && (APP_HOST.lastIndex = 0) === 0);
  assert.deepEqual(offenders, [], "spec files must import PROD from ./helpers.js, not hardcode the origin");
});

test("helpers.ts defines PROD exactly once", () => {
  const src = readFileSync(HELPERS, "utf8");
  const defs = src.match(/^export const PROD\b/gm) ?? [];
  assert.equal(defs.length, 1, "PROD must have a single definition");
});

// Evaluate helpers.ts's PROD expression under a chosen PROD_BASE_URL. The specs are TypeScript
// and this suite is plain Node, so the resolution logic is exercised from source rather than
// imported — which also means the declaration and the export must be evaluated together.
function evaluatePROD(envValue) {
  const src = readFileSync(HELPERS, "utf8");
  const decl = src.match(/^const CONFIGURED_BASE_URL = (.*);$/m);
  const expr = src.match(/^export const PROD = (.*);$/m);
  assert.ok(decl && expr, "could not locate the PROD expression in helpers.ts");
  const prev = process.env.PROD_BASE_URL;
  if (envValue === undefined) delete process.env.PROD_BASE_URL; else process.env.PROD_BASE_URL = envValue;
  try {
    const CONFIGURED_BASE_URL = eval(decl[1]);
    return eval(expr[1]);
  } finally {
    if (prev === undefined) delete process.env.PROD_BASE_URL; else process.env.PROD_BASE_URL = prev;
  }
}

test("PROD is overridable via PROD_BASE_URL, so CI can be repointed without a code edit", () => {
  const src = readFileSync(HELPERS, "utf8");
  assert.match(src, /process\.env\.PROD_BASE_URL/, "PROD must read PROD_BASE_URL");
  const evaluate = evaluatePROD;
  assert.equal(evaluate("https://example.workers.dev"), "https://example.workers.dev");
  // a trailing slash must not survive, or `${PROD}/login.html` becomes a double slash
  assert.equal(evaluate("https://example.workers.dev/"), "https://example.workers.dev");
  assert.equal(evaluate("https://example.workers.dev///"), "https://example.workers.dev");
  assert.match(evaluate(undefined), /^https:\/\/\S+$/, "the default must still be an absolute origin");
});

test("an EMPTY PROD_BASE_URL counts as unset — an unset Actions variable expands to \"\"", () => {
  const evaluate = evaluatePROD;
  const fallback = evaluate(undefined);
  // The failure this prevents: PROD === "" would make every test navigate to a bare "/login.html".
  for (const empty of ["", "   ", "\t", "\n"]) {
    assert.equal(evaluate(empty), fallback, `${JSON.stringify(empty)} must fall back to the default`);
  }
  assert.equal(evaluate("  https://example.workers.dev  "), "https://example.workers.dev", "surrounding whitespace must be trimmed");
});

test("the workflow wires PROD_BASE_URL from a repository variable, not a secret", () => {
  const wf = readFileSync(join(HERE, "..", "..", ".github", "workflows", "playwright.yml"), "utf8");
  assert.match(wf, /PROD_BASE_URL:\s*\$\{\{\s*vars\.PROD_BASE_URL\s*\}\}/, "the test job must pass PROD_BASE_URL through");
  assert.ok(!/PROD_BASE_URL:\s*\$\{\{\s*secrets\./.test(wf), "a hostname is not a secret — use vars so it stays auditable");
});

test("every spec that uses PROD imports it from the shared helper", () => {
  const missing = [];
  for (const f of specs) {
    const src = readSpec(f);
    if (!/\bPROD\b/.test(src)) continue;
    if (!/import\s*\{[^}]*\bPROD\b[^}]*\}\s*from\s*['"]\.\/helpers\.js['"]/.test(src)) missing.push(f);
  }
  assert.deepEqual(missing, [], "these specs use PROD without importing it from ./helpers.js");
});

test("no spec redeclares its own PROD constant", () => {
  const offenders = specs.filter((f) => /^\s*(?:export\s+)?const\s+PROD\s*=/m.test(readSpec(f)));
  assert.deepEqual(offenders, [], "PROD must come from ./helpers.js, not a local copy");
});

test("the default target is recorded so a host move is a deliberate, visible change", () => {
  const src = readFileSync(HELPERS, "utf8");
  const expr = src.match(/^export const PROD = (.*);$/m)[1];
  const literals = expr.match(/["'][^"']*https?:\/\/[^"']*["']/g) ?? [];
  assert.equal(literals.length, 1, "exactly one default origin literal, so the switch is one edit");
});
