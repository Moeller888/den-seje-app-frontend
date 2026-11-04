import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/node_modules/**", "coverage/**", "**/dist/**", "**/dist-devtools/**", "test-results/**", "playwright-report/**"] },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    rules: {
      // Node's type stripping (used by the CLI) rejects parameter properties.
      "@typescript-eslint/parameter-properties": ["error", { prefer: "class-property" }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      // Determinism (phase 3 brief): no Math.random anywhere, also not in the renderer, app or tests.
      "no-restricted-properties": ["error", { object: "Math", property: "random", message: "Use the seeded Rng (spec 01 A6.3)." }],
    },
  },
  {
    // Core and content must be deterministic and DOM-free (spec 00 §4).
    files: ["packages/core/src/**/*.ts", "packages/content/src/**/*.ts", "packages/geometry/src/**/*.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Use the seeded Rng (spec 01 A6.3)." },
        { object: "Date", property: "now", message: "Use simulated time from the Scheduler." },
        { object: "performance", property: "now", message: "Use simulated time from the Scheduler." },
      ],
      "no-restricted-syntax": [
        "error",
        { selector: "NewExpression[callee.name='Date']", message: "Use simulated time from the Scheduler." },
        { selector: "CallExpression[callee.name='setTimeout']", message: "Use Scheduler timers." },
        { selector: "CallExpression[callee.name='setInterval']", message: "Use Scheduler timers." },
      ],
      "no-restricted-globals": ["error", "window", "document", "navigator", "localStorage", "requestAnimationFrame"],
    },
  },
);
