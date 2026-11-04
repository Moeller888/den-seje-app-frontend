/**
 * Writes the editor fixture project to fixtures/editor-demo/ (run with
 * `node --experimental-strip-types packages/content-tools/fixtures/write-editor-fixture.ts`).
 * Existing files are overwritten, never deleted. The tests check that the
 * committed files equal a fresh build byte for byte (and that there are no others).
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeAtomic } from "../src/cli.ts";
import { buildEditorFixture } from "./build-editor-fixture.ts";

const dir = join(dirname(fileURLToPath(import.meta.url)), "editor-demo");
for (const [path, bytes] of buildEditorFixture().files) writeAtomic(join(dir, ...path.split("/")), bytes);
console.log(`wrote ${dir}`);
