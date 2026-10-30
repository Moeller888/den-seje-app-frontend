/** Tests of tools/check-build-boundary.mjs with synthetic build folders. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { checkBoundary } from "../check-build-boundary.mjs";

const base = mkdtempSync(join(tmpdir(), "boundary-"));
afterAll(() => rmSync(base, { recursive: true, force: true }));

function builds(name, files) {
  const dir = join(base, name);
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
  return dir;
}

describe("build boundary", () => {
  it("passes for a clean game, a devtools game and an editor", () => {
    const dir = builds("ok", {
      "packages/app/dist/assets/index.js": "game();",
      "packages/app/dist-devtools/assets/panel.js": "const m = 'adventure-engine devtools';",
      "packages/editor/dist/assets/editor.js": "editor();",
    });
    expect(checkBoundary(dir)).toEqual([]);
  });

  it("reports devtools or editor code in the game, missing devtools, absolute paths and missing builds", () => {
    const dir = builds("bad", {
      "packages/app/dist/assets/index.js": "installDevtools(); const t = 'Indholdseditor';",
      "packages/app/dist/assets/index.js.map": '{"sources":["C:/Users/someone/x.ts"]}',
      "packages/app/dist-devtools/assets/panel.js": "nothing",
      "packages/editor/dist/index.html": "<html></html>",
    });
    const problems = checkBoundary(dir);
    expect(problems).toEqual(
      expect.arrayContaining([
        'packages/app/dist/assets/index.js contains "installDevtools"',
        'packages/app/dist/assets/index.js contains "Indholdseditor"',
        "packages/app/dist/assets/index.js.map contains a local absolute path",
        "packages/app/dist-devtools does not contain the devtools",
      ]),
    );
    expect(checkBoundary(builds("none", { "x.txt": "" }))).toEqual(["packages/app/dist is missing (build first)", "packages/app/dist-devtools is missing (build first)", "packages/editor/dist is missing (build first)"]);
  });
});
