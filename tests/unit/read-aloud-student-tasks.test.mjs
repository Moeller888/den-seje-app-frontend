// Text-based student tasks must use the quiz read-aloud adapter.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";
import { stopReadAloud } from "../../js/read-aloud/adapters/quiz.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(join(REPO, rel), "utf8");

test("stopReadAloud never throws without a browser", () => {
  assert.doesNotThrow(() => stopReadAloud());
});

test("quiz and placement read the prompt and each option", () => {
  const quiz = read("app.js");
  assert.match(quiz, /attachReadAloudControl\(/);
  assert.match(quiz, /attachOptionReadAloudControl\(/);
  assert.match(quiz, /stopReadAloud\(/);
  assert.match(quiz, /attachReadAloudControl\(questionEl, questionText\)/);
  assert.match(read("js/stabel.js"), /attachReadAloudControl\(/);
  assert.equal(read("js/stabel.js").includes("kamp"), false);
});
