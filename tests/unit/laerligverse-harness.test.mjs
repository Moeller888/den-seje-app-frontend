// D-315: the test-only harness serves each origin an explicit allowlist (tests/isolated/laerligverse-harness).
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAllowed } from "../isolated/laerligverse-harness/serve-harness.mjs";

test("the game origin never gets host code, the real adapter or the test adapter", () => {
  for (const p of ["/host.mjs", "/host.html", "/pkg/learning-bridge/src/host.ts", "/pkg/learning-bridge/src/laerlig-service.ts",
    "/pkg/learning-bridge/src/test-service.ts", "/pkg/learning-bridge/src/index.ts", "/pkg/archive-prototype/src/host-items.ts"]) {
    assert.equal(resolveAllowed("game", p), null, p);
  }
  for (const p of ["/game.html", "/game.mjs", "/pkg/core/src/index.ts", "/pkg/learning-bridge/src/client.ts", "/pkg/archive-prototype/src/content.ts"]) {
    assert.notEqual(resolveAllowed("game", p), null, p);
  }
});

test("the host origin gets the bridge and the real adapter, never the test adapter or the game", () => {
  assert.notEqual(resolveAllowed("host", "/pkg/learning-bridge/src/laerlig-service.ts"), null);
  for (const p of ["/pkg/learning-bridge/src/test-service.ts", "/game.mjs", "/pkg/core/src/index.ts", "/pkg/archive-prototype/src/host-items.ts"]) {
    assert.equal(resolveAllowed("host", p), null, p);
  }
});

test("traversal, encoded traversal, non-.ts package files and unknown sides are refused", () => {
  for (const p of ["/pkg/core/src/../../../../.env", "/pkg/core/src/%2e%2e/%2e%2e/package.json", "/pkg/core/package.json", "/pkg/core/src/x.ts\..\y", "/%E0%A4%A"]) {
    assert.equal(resolveAllowed("game", p), null, p);
  }
  assert.equal(resolveAllowed("admin", "/game.mjs"), null);
});
