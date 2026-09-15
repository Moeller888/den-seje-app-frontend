// Unit tests for the path-aware CI classifier (.github/ci/classify-changes.mjs, D-066).
// Fast, node-only (no browser, no backend). Run: npm run test:unit
//
// Proves the docs / unit-only / avatar-tool / full decision and the fail-closed behaviour, so the
// fast modes are verified on every PR (incl. this full-mode workflow PR) without needing a
// natural docs-only, unit-only or tool-only PR to exercise them in CI.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  classify,
  concurrencyGroup,
  jobLockGroup,
  validateFastPayload,
  fileCountForcesFull,
  outputTooLarge,
  isFastMode,
  FAST_MODES,
  MODES,
  MAX_CHANGED_FILES,
  MAX_OUTPUT_B64_LEN,
  SHARED_LOCK,
} from "../../.github/ci/classify-changes.mjs";

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
test("unit-only + run 123 → isolated fast group", () =>
  assert.equal(concurrencyGroup("unit-only", 123), "ci-fast-123"));
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
test("unit-only + missing run id (null) → shared lock", () =>
  assert.equal(concurrencyGroup("unit-only", null), "e2e-shared-supabase"));
test("docs and avatar-tool share the same fast-group format for the same run", () =>
  assert.equal(concurrencyGroup("docs", 999), concurrencyGroup("avatar-tool", 999)));
test("different run ids → different fast groups", () =>
  assert.notEqual(concurrencyGroup("docs", 123), concurrencyGroup("docs", 456)));
test("string numeric run id accepted", () =>
  assert.equal(concurrencyGroup("avatar-tool", "789"), "ci-fast-789"));

// ── jobLockGroup(classifyResult, mode, runId) — the ACTUAL job lock (D-067 hardening) ─────────
// A fast group only when classify SUCCEEDED and mode is a fast mode; everything else shared.
test("jobLock: success + docs → fast", () =>
  assert.equal(jobLockGroup("success", "docs", 123), "ci-fast-123"));
test("jobLock: success + avatar-tool → fast", () =>
  assert.equal(jobLockGroup("success", "avatar-tool", 123), "ci-fast-123"));
test("jobLock: success + unit-only → fast", () =>
  assert.equal(jobLockGroup("success", "unit-only", 123), "ci-fast-123"));
test("jobLock: success + full → shared", () =>
  assert.equal(jobLockGroup("success", "full", 123), "e2e-shared-supabase"));
test("jobLock: success + missing mode → shared", () =>
  assert.equal(jobLockGroup("success", "", 123), "e2e-shared-supabase"));
test("jobLock: success + invalid mode → shared", () =>
  assert.equal(jobLockGroup("success", "bogus", 123), "e2e-shared-supabase"));
test("jobLock: success + near-miss mode 'unit' → shared", () =>
  assert.equal(jobLockGroup("success", "unit", 123), "e2e-shared-supabase"));
test("jobLock: classify failure + docs → shared", () =>
  assert.equal(jobLockGroup("failure", "docs", 123), "e2e-shared-supabase"));
test("jobLock: classify failure + unit-only → shared", () =>
  assert.equal(jobLockGroup("failure", "unit-only", 123), "e2e-shared-supabase"));
test("jobLock: classify cancelled + docs → shared", () =>
  assert.equal(jobLockGroup("cancelled", "docs", 123), "e2e-shared-supabase"));
test("jobLock: classify skipped + docs → shared", () =>
  assert.equal(jobLockGroup("skipped", "docs", 123), "e2e-shared-supabase"));
test("jobLock: different runs → different fast groups", () =>
  assert.notEqual(jobLockGroup("success", "docs", 1), jobLockGroup("success", "docs", 2)));

// ── validateFastPayload(mode, files) — fast-mode payload guard (D-067 hardening) ──────────────
test("payload: docs empty array → fail", () =>
  assert.equal(validateFastPayload("docs", []).ok, false));
test("payload: docs null → fail", () =>
  assert.equal(validateFastPayload("docs", null).ok, false));
test("payload: docs object (not array) → fail", () =>
  assert.equal(validateFastPayload("docs", { 0: "docs/a.md" }).ok, false));
test("payload: docs non-string entry → fail", () =>
  assert.equal(validateFastPayload("docs", ["docs/a.md", 42]).ok, false));
test("payload: docs empty-string entry → fail", () =>
  assert.equal(validateFastPayload("docs", ["docs/a.md", ""]).ok, false));
test("payload: docs with tools/avatar path → fail", () =>
  assert.equal(validateFastPayload("docs", ["docs/a.md", "tools/avatar/x.mjs"]).ok, false));
test("payload: avatar-tool without a tools/avatar file → fail", () =>
  assert.equal(validateFastPayload("avatar-tool", ["docs/a.md"]).ok, false));
test("payload: avatar-tool with a runtime path → fail", () =>
  assert.equal(validateFastPayload("avatar-tool", ["tools/avatar/x.mjs", "js/y.js"]).ok, false));
test("payload: valid docs list → ok", () =>
  assert.equal(validateFastPayload("docs", ["docs/a.md", "docs/b.md"]).ok, true));
test("payload: valid avatar-tool list → ok", () =>
  assert.equal(validateFastPayload("avatar-tool", ["tools/avatar/x.mjs", "docs/a.md"]).ok, true));
test("payload: full mode does not need the list → ok", () =>
  assert.equal(validateFastPayload("full", null).ok, true));

// ── fileCountForcesFull / MAX_CHANGED_FILES — >=3000 API cap (D-067 hardening) ────────────────
test("MAX_CHANGED_FILES is the API cap", () => assert.equal(MAX_CHANGED_FILES, 3000));
test("count 2999 does not force full", () => assert.equal(fileCountForcesFull(2999), false));
test("count 3000 (API cap, maybe truncated) forces full", () =>
  assert.equal(fileCountForcesFull(3000), true));
test("count 3001 forces full", () => assert.equal(fileCountForcesFull(3001), true));
test("non-number count forces full", () => assert.equal(fileCountForcesFull("x"), true));
test("2999 docs paths still classify as docs", () => {
  const files = Array.from({ length: 2999 }, (_, i) => "docs/f" + i + ".md");
  assert.equal(classify(files), "docs");
});

// ── outputTooLarge / MAX_OUTPUT_B64_LEN — job-output size guard (D-067 hardening) ─────────────
test("small payload is not too large", () => assert.equal(outputTooLarge(100), false));
test("payload exactly at the cap is allowed", () =>
  assert.equal(outputTooLarge(MAX_OUTPUT_B64_LEN), false));
test("payload just over the cap is too large", () =>
  assert.equal(outputTooLarge(MAX_OUTPUT_B64_LEN + 1), true));
test("non-number payload length is too large (fail closed)", () =>
  assert.equal(outputTooLarge("x"), true));

// ══ D-144 — unit-only mode + tests/unit/** in avatar-tool (adversarial) ═══════════════════════
// tests/unit/** is only ever an ADDITIONAL allowed prefix. It must never turn a runtime-affecting
// PR fast. The numbered groups map 1:1 to the owner's acceptance list for D-144.

test("D-144 modes: unit-only is a fast mode, full is not", () => {
  assert.equal(MODES.UNIT_ONLY, "unit-only");
  assert.deepEqual([...FAST_MODES].sort(), ["avatar-tool", "docs", "unit-only"]);
  assert.equal(isFastMode("unit-only"), true);
  assert.equal(isFastMode("full"), false);
  assert.equal(isFastMode(undefined), false);
});

// 1. docs/** → docs
test("D-144 #1: docs/** alone → docs", () => {
  assert.equal(classify(["docs/project-state.md"]), "docs");
  assert.equal(classify(["docs/a.md", "docs/sub/b.md"]), "docs");
});

// 2. tests/unit/** alone → unit-only
test("D-144 #2: tests/unit/** alone → unit-only", () => {
  assert.equal(classify(["tests/unit/avatar-r3-iris-method.test.mjs"]), "unit-only");
  assert.equal(
    classify(["tests/unit/a.test.mjs", "tests/unit/b.test.mjs", "tests/unit/c.test.mjs"]),
    "unit-only",
  );
});

// 3. docs/** + tests/unit/** → unit-only
test("D-144 #3: docs/** + tests/unit/** → unit-only", () => {
  assert.equal(classify(["docs/project-state.md", "tests/unit/a.test.mjs"]), "unit-only");
  assert.equal(classify(["tests/unit/a.test.mjs", "docs/ROADMAP.md", "docs/b.md"]), "unit-only");
});

// 4. tools/avatar/** + tests/unit/** → avatar-tool
test("D-144 #4: tools/avatar/** + tests/unit/** → avatar-tool", () => {
  assert.equal(
    classify(["tools/avatar/openai-generate-r3-underlay-core.mjs", "tests/unit/a.test.mjs"]),
    "avatar-tool",
  );
});

// 5. tools/avatar/** + docs/** + tests/unit/** → avatar-tool
test("D-144 #5: tools/avatar/** + docs/** + tests/unit/** → avatar-tool", () => {
  assert.equal(
    classify([
      "docs/project-state.md",
      "tests/unit/a.test.mjs",
      "tools/avatar/fixtures/r3/r3-shadow-contract-v1.json",
    ]),
    "avatar-tool",
  );
});

// 6. js/** + tests/unit/** → full
test("D-144 #6: js/** + tests/unit/** → full", () => {
  assert.equal(classify(["js/kamp.js", "tests/unit/kamp.test.mjs"]), "full");
  assert.equal(classify(["tests/unit/a.test.mjs", "docs/a.md", "js/app.js"]), "full");
  assert.equal(classify(["tools/avatar/x.mjs", "tests/unit/a.test.mjs", "js/x.js"]), "full");
});

// 7. HTML at the repository root + tests/unit/** → full
test("D-144 #7: root HTML + tests/unit/** → full", () => {
  assert.equal(classify(["hub.html", "tests/unit/a.test.mjs"]), "full");
  assert.equal(classify(["kamp.html", "tests/unit/kamp.test.mjs", "docs/a.md"]), "full");
  assert.equal(classify(["app.js", "tests/unit/a.test.mjs"]), "full");
  assert.equal(classify(["style.css", "tests/unit/a.test.mjs"]), "full");
});

// 8. tests/*.spec.ts → full
test("D-144 #8: Playwright specs → full, also next to unit tests", () => {
  assert.equal(classify(["tests/example.spec.ts"]), "full");
  assert.equal(classify(["tests/example.spec.ts", "tests/unit/a.test.mjs"]), "full");
  assert.equal(classify(["tests/helpers.ts", "tests/unit/a.test.mjs"]), "full");
  assert.equal(classify(["tests/global-setup.ts"]), "full");
  assert.equal(
    classify(["tests/avatar-r2-render.spec.ts-snapshots/x-chromium-win32.png", "tests/unit/a.test.mjs"]),
    "full",
  );
  assert.equal(classify(["playwright.config.ts", "tests/unit/a.test.mjs"]), "full");
});

// 9. supabase/** → full
test("D-144 #9: supabase/** → full", () => {
  assert.equal(classify(["supabase/functions/process-event/index.ts"]), "full");
  assert.equal(classify(["supabase/migrations/x.sql", "tests/unit/a.test.mjs"]), "full");
  assert.equal(classify(["supabase/functions/_shared/ai/x.ts", "docs/a.md"]), "full");
});

// 10. workflow or classifier changes → full
test("D-144 #10: workflow / classifier / unit-runner changes → full", () => {
  assert.equal(classify([".github/workflows/playwright.yml", "tests/unit/a.test.mjs"]), "full");
  assert.equal(classify([".github/workflows/update-avatar-goldens.yml"]), "full");
  assert.equal(classify([".github/ci/classify-changes.mjs"]), "full");
  assert.equal(
    classify([".github/ci/classify-changes.mjs", "tests/unit/ci-classify-changes.test.mjs"]),
    "full",
  );
  // The files that decide WHAT the unit job runs are outside tests/unit/ → full.
  assert.equal(classify(["tests/run-unit-ci.mjs"]), "full");
  assert.equal(classify(["tests/unit-ci-exclusions.mjs", "tests/unit/a.test.mjs"]), "full");
  assert.equal(classify(["package.json", "tests/unit/a.test.mjs"]), "full");
  assert.equal(classify(["package-lock.json", "tests/unit/a.test.mjs"]), "full");
});

// 11. unknown path, empty list and malformed input → full
test("D-144 #11: unknown path / empty list / malformed input → full", () => {
  assert.equal(classify(["something/unknown.txt"]), "full");
  assert.equal(classify(["README.md", "tests/unit/a.test.mjs"]), "full");
  assert.equal(classify(["assets/avatar-r2/base/x.webp", "tests/unit/a.test.mjs"]), "full");
  assert.equal(classify([]), "full");
  assert.equal(classify(undefined), "full");
  assert.equal(classify(null), "full");
  assert.equal(classify("tests/unit/a.test.mjs"), "full");
  assert.equal(classify({ 0: "tests/unit/a.test.mjs", length: 1 }), "full");
  assert.equal(classify(["tests/unit/a.test.mjs", null]), "full");
  assert.equal(classify(["tests/unit/a.test.mjs", undefined]), "full");
  assert.equal(classify(["tests/unit/a.test.mjs", 7]), "full");
  assert.equal(classify(["tests/unit/a.test.mjs", ["docs/a.md"]]), "full");
  assert.equal(classify(["tests/unit/a.test.mjs", "   "]), "full");
});

// 12. names that merely LOOK like an allowed path but are not inside tests/unit/ → full
test("D-144 #12: look-alike unit-test paths outside tests/unit/ → full", () => {
  const lookAlikes = [
    "tests/unit",                          // the directory itself, no file
    "tests/unit/",                         // trailing slash, empty segment
    "tests/unitX/a.test.mjs",              // sibling directory
    "tests/unit-extra/a.test.mjs",         // sibling directory with dash
    "tests/unit.test.mjs",                 // file next to the directory
    "tests/a.test.mjs",                    // unit-test-shaped name in tests/
    "tests/Unit/a.test.mjs",               // different case (paths are case-sensitive in CI)
    "test/unit/a.test.mjs",                // singular "test"
    "src/tests/unit/a.test.mjs",           // nested under another root
    "unit/a.test.mjs",                     // missing tests/
    "/tests/unit/a.test.mjs",              // absolute path, leading empty segment
    "tests//unit/a.test.mjs",              // double slash
    "tests/unit/../../js/app.js",          // traversal out of tests/unit
    "tests/unit/../example.spec.ts",       // traversal to a Playwright spec
    "tests/unit/./a.test.mjs",             // "." segment
    "docs/../index.html",                  // traversal out of docs
    "tools/avatar/../../js/app.js",        // traversal out of tools/avatar
  ];
  for (const p of lookAlikes) {
    assert.equal(classify([p]), "full", "alone: " + p);
    assert.equal(classify(["tests/unit/ok.test.mjs", p]), "full", "with a real unit test: " + p);
    assert.equal(classify(["docs/ok.md", p]), "full", "with docs: " + p);
  }
});

// 13. the fast-mode payload guard allows EXACTLY the paths the classifier allows
const PAYLOAD_CORPUS = [
  ["docs/a.md"],
  ["docs/a.md", "docs/b/c.md"],
  ["tests/unit/a.test.mjs"],
  ["tests/unit/a.test.mjs", "docs/a.md"],
  ["tools/avatar/x.mjs"],
  ["tools/avatar/x.mjs", "docs/a.md"],
  ["tools/avatar/x.mjs", "tests/unit/a.test.mjs"],
  ["tools/avatar/x.mjs", "docs/a.md", "tests/unit/a.test.mjs"],
  ["js/kamp.js", "tests/unit/kamp.test.mjs"],
  ["hub.html", "tests/unit/a.test.mjs"],
  ["tests/example.spec.ts"],
  ["tests/example.spec.ts", "tests/unit/a.test.mjs"],
  ["supabase/functions/x/index.ts"],
  [".github/workflows/playwright.yml"],
  [".github/ci/classify-changes.mjs", "tests/unit/ci-classify-changes.test.mjs"],
  ["tests/run-unit-ci.mjs"],
  ["tests/unit-ci-exclusions.mjs"],
  ["tests/unitX/a.test.mjs"],
  ["tests/unit.test.mjs"],
  ["tests/unit/../../js/app.js"],
  ["tools/avatar/x.mjs", "assets/avatar-r2/base/x.webp"],
  ["something/unknown.txt"],
];

test("D-144 #13: validateFastPayload(m, files).ok === (classify(files) === m) for every fast mode", () => {
  for (const files of PAYLOAD_CORPUS) {
    const resolved = classify(files);
    for (const m of FAST_MODES) {
      assert.equal(
        validateFastPayload(m, files).ok,
        resolved === m,
        `mode ${m}, files ${JSON.stringify(files)} (classify → ${resolved})`,
      );
    }
  }
});

test("D-144 #13: a list classified full is rejected by the payload guard in every fast mode", () => {
  for (const files of PAYLOAD_CORPUS.filter((f) => classify(f) === "full")) {
    for (const m of FAST_MODES) {
      assert.equal(validateFastPayload(m, files).ok, false, `mode ${m}, ${JSON.stringify(files)}`);
    }
  }
});

test("D-144 #13: unit-only payload guard — accepts unit(+docs), rejects anything else", () => {
  assert.equal(validateFastPayload("unit-only", ["tests/unit/a.test.mjs"]).ok, true);
  assert.equal(validateFastPayload("unit-only", ["tests/unit/a.test.mjs", "docs/a.md"]).ok, true);
  assert.equal(validateFastPayload("unit-only", ["docs/a.md"]).ok, false);
  assert.equal(validateFastPayload("unit-only", ["tests/unit/a.test.mjs", "js/a.js"]).ok, false);
  assert.equal(
    validateFastPayload("unit-only", ["tests/unit/a.test.mjs", "tools/avatar/x.mjs"]).ok,
    false,
  );
  assert.equal(validateFastPayload("unit-only", []).ok, false);
  assert.equal(validateFastPayload("unit-only", null).ok, false);
  assert.equal(validateFastPayload("unit-only", ["tests/unit/a.test.mjs", 42]).ok, false);
});

test("D-144 #13: payload guard requires canonical paths — it may be stricter, never looser", () => {
  // GitHub reports canonical paths. A non-canonical entry fails the fast job loudly instead of
  // being normalised into an allowed prefix.
  const nonCanonical = [
    ["tests\\unit\\a.test.mjs"],
    [" tests/unit/a.test.mjs"],
    ["tests/unit/a.test.mjs "],
    ["tests//unit/a.test.mjs"],
    ["tests/unit/./a.test.mjs"],
    ["tests/unit/../unit/a.test.mjs"],
  ];
  for (const files of nonCanonical) {
    for (const m of FAST_MODES) {
      assert.equal(validateFastPayload(m, files).ok, false, `mode ${m}, ${JSON.stringify(files)}`);
    }
  }
});

test("D-144 #13: avatar-tool payload guard now accepts tests/unit/** exactly like classify", () => {
  const files = ["tools/avatar/x.mjs", "tests/unit/a.test.mjs", "docs/a.md"];
  assert.equal(classify(files), "avatar-tool");
  assert.equal(validateFastPayload("avatar-tool", files).ok, true);
  assert.equal(validateFastPayload("unit-only", files).ok, false);
  assert.equal(validateFastPayload("docs", files).ok, false);
});

// ── Workflow drift guard — the workflow's mode lists must match the classifier ────────────────
// The lock expression, the mode normalisation and the step conditions are written out in YAML and
// cannot import FAST_MODES. If a fast mode were added here but not there, a fast run would either
// fall back to full (harmless) or — worse — take a fast lock while running Playwright. Pin both.
const WORKFLOW = readFileSync(new URL("../../.github/workflows/playwright.yml", import.meta.url), "utf8");

test("workflow: the test-job lock expression lists exactly the fast modes", () => {
  const start = WORKFLOW.indexOf("concurrency:\n      group: >-");
  assert.notEqual(start, -1, "test job concurrency block not found");
  const end = WORKFLOW.indexOf("cancel-in-progress", start);
  const expr = WORKFLOW.slice(start, end);
  for (const m of FAST_MODES) {
    assert.ok(expr.includes("needs.classify.outputs.mode == '" + m + "'"), "lock expression missing " + m);
  }
  assert.ok(!expr.includes("== 'full'"), "full must never select a fast lock");
  assert.ok(expr.includes("needs.classify.result == 'success'"), "lock must require classify success");
  assert.ok(expr.includes("|| 'e2e-shared-supabase'"), "lock must fall back to the shared lock");
});

test("workflow: Playwright install/run/report steps run ONLY in full mode", () => {
  for (const name of ["Install dependencies", "Install Playwright Browsers", "Run Playwright tests"]) {
    const at = WORKFLOW.indexOf("- name: " + name + "\n      if:");
    assert.notEqual(at, -1, "step not found: " + name);
    const line = WORKFLOW.slice(at, WORKFLOW.indexOf("\n", WORKFLOW.indexOf("if:", at)));
    assert.ok(line.endsWith("if: steps.mode.outputs.mode == 'full'"), name + " condition changed: " + line);
  }
  assert.ok(WORKFLOW.includes("run: npx playwright test\n"), "the full suite command changed");
});

test("workflow: push events and unknown modes fail closed to full", () => {
  assert.ok(WORKFLOW.includes("let mode = 'full';"), "classify must default to full");
  assert.ok(
    WORKFLOW.includes("if (context.eventName === 'pull_request') {"),
    "only pull_request events may be classified",
  );
  assert.ok(
    WORKFLOW.includes(
      "if (mode !== 'docs' && mode !== 'unit-only' && mode !== 'avatar-tool' && mode !== 'full') mode = 'full';",
    ),
    "classify-side mode normalisation changed",
  );
  assert.ok(
    WORKFLOW.includes(
      "const mode = (raw === 'docs' || raw === 'unit-only' || raw === 'avatar-tool' || raw === 'full') ? raw : 'full';",
    ),
    "test-side mode normalisation changed",
  );
});

test("workflow: the unit job runs on every event with no mode condition", () => {
  const at = WORKFLOW.indexOf("\n  unit:\n");
  assert.notEqual(at, -1, "unit job not found");
  const next = WORKFLOW.indexOf("\n  classify:\n", at);
  const job = WORKFLOW.slice(at, next);
  assert.ok(!job.includes("if:"), "the unit job must not be conditional");
  assert.ok(!job.includes("needs:"), "the unit job must not depend on classification");
  assert.ok(job.includes("run: npm run test:unit:ci"), "the unit job must run the unit suite");
});
