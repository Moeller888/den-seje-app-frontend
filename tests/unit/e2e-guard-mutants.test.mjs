// Keeps tools/e2e-safety/mutate-guards.mjs from rotting: every mutant must still apply EXACTLY once to
// the current source, and the tool must stay write-free. Cheap (no mutant is run here); the full run
// is `node tools/e2e-safety/mutate-guards.mjs` (see that file).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MUTANTS, TESTS, countOccurrences } from "../../tools/e2e-safety/mutate-guards.mjs";

const read = (p) => readFileSync(new URL("../../" + p, import.meta.url), "utf8");

test("every mutant applies exactly once and changes the source", () => {
  const names = new Set();
  for (const [file, name, from, to] of MUTANTS) {
    assert.equal(countOccurrences(read(file), from), 1, `${name}: must match exactly once in ${file}`);
    assert.notEqual(from, to, name);
    const id = name.split(" ")[0];
    assert.ok(!names.has(id), `${id}: duplicate mutant id`);
    names.add(id);
  }
  assert.ok(MUTANTS.length >= 98, "the 54 original mutants, the 8 teacher_id-repair mutants and the 36 A4 provisioning mutants");
  for (const f of ["tests/e2e-guard.mjs", "tests/e2e-accounts.mjs", "tests/e2e-admin.mjs", "tools/e2e/provision-accounts.mjs",
    ".github/workflows/e2e-prod-provision.yml"]) {
    assert.ok(MUTANTS.some(([file]) => file === f), `${f} is mutated`);
  }
});

test("the mutation tool writes no file: the mutant lives only in memory", () => {
  for (const f of ["tools/e2e-safety/mutate-guards.mjs", "tools/e2e-safety/mutant-preload.mjs", "tools/e2e-safety/mutant-hooks.mjs"]) {
    const src = read(f).replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(src, /\b(writeFileSync|writeFile|appendFile\w*|copyFile\w*|cpSync|rmSync|rm\(|unlink\w*|rename\w*|mkdtemp\w*|mkdir\w*|symlink\w*|createWriteStream)\b/, f);
    assert.doesNotMatch(src, /\bfetch\(|node:https?|node:net\b/, `${f}: no network`);
  }
  for (const t of TESTS) assert.ok(read(t).length > 0, t);
});
