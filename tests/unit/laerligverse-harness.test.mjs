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

// ── F11-C: the REAL Arkivskabet build on the game origin ────────────────────────────────────────────────────────
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveDistAllowed, startHarness } from "../isolated/laerligverse-harness/serve-harness.mjs";
import { checkGameDist, HOST_ONLY_MARKERS } from "../isolated/laerligverse-harness/build-arkivskabet.mjs";

function fakeDist(files) {
  const dir = mkdtempSync(join(tmpdir(), "f11c-dist-"));
  mkdirSync(join(dir, "assets"));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
}
const GOOD = { "game.html": '<script type="module" src="./assets/game-abc.js"></script>', "assets/game-abc.js": 'const h="http://127.0.0.1:4330";', "assets/game-abc.css": "body{}" };

test("F11-C: the game origin serves only game.html and the build's own assets — never a host page, a sourcemap or another path", () => {
  const dir = fakeDist(GOOD);
  try {
    for (const p of ["/game.html", "/game.html?motion=off&reload=1", "/assets/game-abc.js", "/assets/game-abc.css"]) assert.notEqual(resolveDistAllowed(dir, p), null, p);
    for (const p of ["/host.html", "/assets/host-abc.js", "/assets/host.css", "/assets/game-abc.js.map", "/", "/index.html", "/assets/", "/assets/sub/x.js",
      "/assets/../game.html", "/assets/%2e%2e/game.html", "/%E0%A4%A", "/assets/x.json", "/game.html/..", "/assets\\x.js"]) {
      assert.equal(resolveDistAllowed(dir, p), null, p);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("F11-C: a game build with a host page, host code, a sourcemap or the wrong host origin is refused", () => {
  const cases = [
    [GOOD, []],
    [{ ...GOOD, "host.html": "<html>" }, ["host.html is in the game build", "host file host.html"]],
    [{ ...GOOD, "assets/game-abc.js.map": "{}" }, ["sourcemap assets/game-abc.js.map"]],
    [{ ...GOOD, "assets/host-x.js": "x" }, ["host file assets/host-x.js"]],
    [{ ...GOOD, "assets/game-abc.js": 'const h="http://127.0.0.1:4320";' }, ["the game does not accept the harness host http://127.0.0.1:4330", "the game still accepts the prototype host on :4320"]],
  ];
  for (const m of HOST_ONLY_MARKERS) cases.push([{ ...GOOD, "assets/chunk.js": `x={${JSON.stringify(m)}:1}` }, [`host-only code in the game build ("${m}")`]]);
  for (const [files, expected] of cases) {
    const dir = fakeDist(files);
    try {
      assert.deepEqual(checkGameDist(dir), expected, JSON.stringify(Object.keys(files)));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  assert.deepEqual(checkGameDist(join(tmpdir(), "f11c-missing-dir")), [`${join(tmpdir(), "f11c-missing-dir")}: no game.html`]);
});

test("F11-C: the harness serves a real game build only behind the real F3 host, and only after the build passed the checks", async () => {
  const dir = fakeDist({ ...GOOD, "host.html": "<html>" });
  try {
    await assert.rejects(startHarness({ gameDist: dir }), /only behind the real F3 host/);
    await assert.rejects(startHarness({ host: "f3", gameDist: dir, supabaseUrl: "http://127.0.0.1:54321", anonKey: "x" }), /refusing to serve/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
