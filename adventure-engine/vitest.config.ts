import { defineConfig } from "vitest/config";

const FULL = { branches: 100, functions: 100, lines: 100, statements: 100 };

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts", "tools/test/**/*.test.mjs"],
    pool: "forks",
    testTimeout: 60000,
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts"],
      // DOM/WebGL-only browser code is covered by the Playwright suite (e2e/), not by Vitest.
      exclude: [
        "packages/*/src/index.ts",
        "packages/scenario-runner/src/cli.ts",
        "packages/content-tools/src/main.ts",
        // Phase 6: the editor UI and the in-game devtools panel are DOM code, covered by Playwright (e2e/editor/, e2e/devtools).
        "packages/editor/src/**",
        "packages/app/src/devtools/**",
        "packages/render-pixi/src/renderer.ts",
        "packages/app/src/main.ts",
        "packages/app/src/game.ts",
        "packages/app/src/adapter.ts",
        "packages/app/src/ui/**",
        "packages/app/src/env.d.ts",
      ],
      reporter: ["text", "json-summary"],
      thresholds: {
        // Required by the phase-1 brief: runtime, scope, expression and scheduler modules.
        "packages/core/src/runtime.ts": FULL,
        "packages/core/src/scope.ts": FULL,
        "packages/core/src/expression.ts": FULL,
        "packages/core/src/scheduler.ts": FULL,
        "packages/core/src/values.ts": FULL,
        "packages/core/src/modal.ts": FULL,
        // Phase 2: geometry and world modules.
        "packages/geometry/src/shapes.ts": FULL,
        "packages/geometry/src/camera.ts": FULL,
        "packages/geometry/src/navigation.ts": FULL,
        "packages/core/src/space.ts": FULL,
        "packages/core/src/query.ts": FULL,
        "packages/core/src/text.ts": FULL,
        // Phase 3: pure presentation helpers.
        "packages/render-pixi/src/letterbox.ts": FULL,
        "packages/render-pixi/src/assets.ts": FULL,
        "packages/render-pixi/src/scene-assets.ts": FULL,
        "packages/app/src/model/*.ts": FULL,
        // Phase 4: media model, players and backends (fake clock and fake browser media).
        "packages/media/src/*.ts": FULL,
        "packages/audio/src/*.ts": FULL,
        // Phase 5: save format, hashing, ambient state, slots, storage, settings and autosave.
        "packages/core/src/save.ts": FULL,
        "packages/core/src/sha256.ts": FULL,
        "packages/core/src/ambient.ts": FULL,
        "packages/core/src/ownership.ts": FULL,
        "packages/save/src/*.ts": FULL,
        // Phase 6: content tools. The schema, its validator and the geometry previews are fully covered; the rest
        // keeps every function covered and at least 90 % of the branches (defensive branches of file handling).
        "packages/content-tools/src/jsonschema.ts": FULL,
        "packages/content-tools/src/schema.ts": FULL,
        "packages/content-tools/src/polygon.ts": FULL,
        "packages/content-tools/src/nav.ts": FULL,
        // Follow-up: the SVG allowlist is security code and fully covered.
        "packages/content-tools/src/svg.ts": FULL,
        "packages/content-tools/src/*.ts": { lines: 97, statements: 97, functions: 100, branches: 90 },
        // One defensive guard is unreachable while the membership invariant holds (docs/decisions/phase-2.md §11).
        "packages/core/src/navigator.ts": { ...FULL, branches: 99 },
      },
    },
  },
});
