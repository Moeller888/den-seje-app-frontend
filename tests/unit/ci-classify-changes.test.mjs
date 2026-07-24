// Unit tests for the path-aware CI classifier (.github/ci/classify-changes.mjs, D-066).
// Fast, node-only (no browser, no backend). Run: npm run test:unit
//
// Proves the docs / avatar-tool / full decision and the fail-closed behaviour, so the two
// fast modes are verified on every PR (incl. this full-mode workflow PR) without needing a
// natural docs-only or tool-only PR to exercise them in CI.

import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, concurrencyGroup, SHARED_LOCK } from "../../.github/ci/classify-changes.mjs";

// The ten canonical cases from the CI-optimisation spec.
const cases = [
  { files: ["docs/ROADMAP.md"], expected: "docs" },
  { files: ["docs/project-state.md", "docs/ROADMAP.md"], expected: "docs" },
  { files: ["tools/avatar/build-r2-arm-fringe-fix.mjs"], expected: "avatar-tool" },
  { files: ["tools/avatar/foo.mjs", "docs/project-state.md"], expected: "avatar-tool" },
  { files: ["tools/avatar/foo.mjs", "assets/avatar-r2/base/x.webp"], expected: "full" },
  { files: [".github/workflows/playwright.yml"], expected: "full" },
  { files: ["tests/avatar-r2-render.spec.ts"], expected: "full" },
  { files: ["js/avatar-blink-engine.js"], expected: "full" },
  { files: ["avatar.html"], expected: "full" },
  { files: [], expected: "full" },
];

for (const { files, expected } of cases) {
  test(`classify(${JSON.stringify(files)}) === ${expected}`, () => {
    assert.equal(classify(files), expected);
  });
}

// Additional fail-closed / edge cases.
test("null input → full", () => assert.equal(classify(null), "full"));
test("non-array input → full", () => assert.equal(classify("docs/x.md"), "full"));
test("blank entry among docs → full", () => assert.equal(classify(["docs/x.md", ""]), "full"));
test("non-string entry → full", () => assert.equal(classify(["docs/x.md", 42]), "full"));
test("bare 'docs' without slash → full", () => assert.equal(classify(["docs"]), "full"));
test("bare 'tools/avatar' without slash → full", () =>
  assert.equal(classify(["tools/avatar"]), "full"));
test("sibling dir tools/avatarX → full (prefix must include the slash)", () =>
  assert.equal(classify(["tools/avatarX/foo.mjs"]), "full"));
test("docsX sibling → full", () => assert.equal(classify(["docsX/y.md"]), "full"));
test("backslash paths normalise to docs", () =>
  assert.equal(classify(["docs\\ROADMAP.md"]), "docs"));
test("backslash tool path normalises to avatar-tool", () =>
  assert.equal(classify(["tools\\avatar\\foo.mjs"]), "avatar-tool"));
test("whitespace-padded docs path", () =>
  assert.equal(classify([" docs/ROADMAP.md "]), "docs"));
test("only-docs alongside avatar-tool stays avatar-tool", () =>
  assert.equal(classify(["docs/a.md", "tools/avatar/a.mjs", "docs/b.md"]), "avatar-tool"));

// ── concurrencyGroup(mode, runId) — D-067 lock routing ───────────────────────
// Fast modes get an isolated per-run group; full and every fail-closed case take the shared lock.
test("SHARED_LOCK constant is the Supabase group", () =>
  assert.equal(SHARED_LOCK, "e2e-shared-supabase"));
test("docs + run 123 → isolated fast group", () =>
  assert.equal(concurrencyGroup("docs", 123), "ci-fast-123"));
test("avatar-tool + run 123 → isolated fast group", () =>
  assert.equal(concurrencyGroup("avatar-tool", 123), "ci-fast-123"));
test("docs fast group is NOT the shared lock", () =>
  assert.notEqual(concurrencyGroup("docs", 123), "e2e-shared-supabase"));
test("full + run 123 → shared lock", () =>
  assert.equal(concurrencyGroup("full", 123), "e2e-shared-supabase"));
test("unknown mode → shared lock", () =>
  assert.equal(concurrencyGroup("bogus", 123), "e2e-shared-supabase"));
test("empty mode → shared lock", () =>
  assert.equal(concurrencyGroup("", 123), "e2e-shared-supabase"));
test("docs + missing run id (null) → shared lock", () =>
  assert.equal(concurrencyGroup("docs", null), "e2e-shared-supabase"));
test("docs + empty-string run id → shared lock", () =>
  assert.equal(concurrencyGroup("docs", ""), "e2e-shared-supabase"));
test("docs + non-numeric run id → shared lock", () =>
  assert.equal(concurrencyGroup("docs", "abc"), "e2e-shared-supabase"));
test("docs + zero run id → shared lock", () =>
  assert.equal(concurrencyGroup("docs", 0), "e2e-shared-supabase"));
test("docs + negative run id → shared lock", () =>
  assert.equal(concurrencyGroup("docs", -5), "e2e-shared-supabase"));
test("docs and avatar-tool share the same fast-group format for the same run", () =>
  assert.equal(concurrencyGroup("docs", 999), concurrencyGroup("avatar-tool", 999)));
test("different run ids → different fast groups", () =>
  assert.notEqual(concurrencyGroup("docs", 123), concurrencyGroup("docs", 456)));
test("string numeric run id accepted", () =>
  assert.equal(concurrencyGroup("avatar-tool", "789"), "ci-fast-789"));
