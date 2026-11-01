// K5 (D-285): static content validation. Synthetic questions only. Pins each check, determinism
// (L1-A8), read-only construction, and the CLI contract.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validate, checkQuestion, parseArgs, BLOCKING, WARNING, VALIDATOR_VERSION } from "../../tools/questions/validate-evidence.mjs";

const TOOL = fileURLToPath(new URL("../../tools/questions/validate-evidence.mjs", import.meta.url));
const mc = (id, options, correct, extra = {}) => ({
  id, is_active: true, answer_format: "mc", answer_type: "short", content: { question: "?", options, correct }, metadata: {}, ...extra,
});
const FIXTURE = [
  mc("q-ok", ["hund", "kat", "fisk", "fugl"], "fisk"),
  mc("q-apostrophe", ["s'", "s", "es", "'s"], "'s"),                          // wrong options accepted (legacy)
  mc("q-sentence", ["Tom's dog is big.", "Toms dog is big.", "x", "y"], "Tom's dog is big."),
  mc("q-oe", ["ø", "Island", "is", "indsø"], "ø"),                            // key empty (legacy)
  mc("q-wrongpair", ["frø", "fugl", "fisk", "får"], "fisk"),                  // two WRONG options collide (legacy)
  mc("q-keymissing", ["a", "b", "c"], "d"),
  mc("q-pluswords", ["Paris", "Paris er hovedstaden", "Rom", "Oslo"], "Paris"),
  { id: "q-num", is_active: true, answer_format: "number", answer_type: "short", content: { question: "?", correct: "1/2" } },
  { id: "q-numok", is_active: true, answer_format: "number", answer_type: "short", content: { question: "?", correct: "1,5" } },
  { id: "q-match3", is_active: true, answer_format: "match", answer_type: "short", content: { question: "?", pairs: [{}, {}, {}] } },
  { id: "q-match4", is_active: true, answer_format: "match", answer_type: "short", content: { question: "?", pairs: [{}, {}, {}, {}] } },
  { ...mc("q-inactive", ["x", "x."], "x"), is_active: false },
  mc("q-text", [], null, { answer_format: "text" }),
];

test("each check fires on its pattern under the legacy rule (production today)", () => {
  assert.deepEqual(checkQuestion(FIXTURE[0]), []);
  assert.deepEqual(checkQuestion(FIXTURE[1]), ["options_collide", "wrong_option_accepted"]);
  assert.deepEqual(checkQuestion(FIXTURE[2]), ["wrong_option_accepted"]);
  assert.deepEqual(checkQuestion(FIXTURE[3]), ["key_empty_after_normalise", "option_empty_after_normalise"]);
  assert.deepEqual(checkQuestion(FIXTURE[4]), ["options_collide"]);
  assert.deepEqual(checkQuestion(FIXTURE[5]), ["key_not_an_option"]);
  assert.deepEqual(checkQuestion(FIXTURE[6]), ["option_is_key_plus_words"]);
  assert.deepEqual(checkQuestion(FIXTURE[7]), ["number_key_unparseable"]);
  assert.deepEqual(checkQuestion(FIXTURE[8]), []);
  assert.deepEqual(checkQuestion(FIXTURE[9]), ["match_pairs_below_4"]);
  assert.deepEqual(checkQuestion(FIXTURE[10]), []);
});

test("under the new rule the grading defects disappear; content defects remain", () => {
  for (const i of [1, 2, 3, 4]) assert.deepEqual(checkQuestion(FIXTURE[i], "new").filter((c) => c !== "option_is_key_plus_words"), [], FIXTURE[i].id);
  assert.deepEqual(checkQuestion(FIXTURE[5], "new"), ["key_not_an_option"]);
  assert.deepEqual(checkQuestion(FIXTURE[7], "new"), ["number_key_unparseable"]);
});

test("report: active only by default, evidence validity from blocking checks, counts and formats", () => {
  const r = validate(FIXTURE);
  assert.equal(r.validator_version, VALIDATOR_VERSION);
  assert.equal(r.grading_rule, "legacy");
  assert.equal(r.questions, 12);
  assert.equal(r.findings.some((f) => f.id === "q-inactive"), false);
  assert.deepEqual(r.findings.filter((f) => !f.evidence_valid).map((f) => f.id),
    ["q-apostrophe", "q-keymissing", "q-match3", "q-num", "q-oe", "q-sentence"]);
  assert.equal(r.not_evidence_valid, 6);
  assert.equal(r.counts.wrong_option_accepted, 2);
  assert.equal(r.counts.options_collide, 2);
  assert.deepEqual(Object.keys(r.counts).sort(), [...BLOCKING, ...WARNING].sort());
  assert.equal(validate(FIXTURE, { all: true }).questions, 13);
  assert.equal(validate(FIXTURE, { rule: "new" }).counts.wrong_option_accepted, 0);
  assert.throws(() => validate(FIXTURE, { rule: "fuzzy" }), /unknown grading rule/);
  assert.throws(() => validate({}), /JSON array/);
});

test("deterministic (L1-A8): the same input in any order gives a byte-identical report", () => {
  const a = JSON.stringify(validate(FIXTURE));
  const b = JSON.stringify(validate([...FIXTURE].reverse()));
  assert.equal(a, b);
});

test("read-only by construction: no database client, network or env in the tool", () => {
  const src = readFileSync(TOOL, "utf8");
  for (const forbidden of [/createClient/, /\bfetch\(/, /process\.env/, /supabase-js/, /\bpg\b/]) {
    assert.equal(forbidden.test(src), false, String(forbidden));
  }
});

test("CLI: prints the report, --out writes only the named file, --strict exits 1, bad args exit 2", () => {
  const dir = mkdtempSync(join(tmpdir(), "k5-"));
  const input = join(dir, "q.json");
  writeFileSync(input, JSON.stringify(FIXTURE));
  const run = (...a) => spawnSync(process.execPath, [TOOL, ...a], { encoding: "utf8" });
  const r1 = run(input);
  assert.equal(r1.status, 0, r1.stderr);
  assert.equal(JSON.parse(r1.stdout).not_evidence_valid, 6);
  const out = join(dir, "r.json");
  assert.equal(run(input, "--grading", "new", "--out", out).status, 0);
  assert.equal(existsSync(out), true);
  assert.equal(JSON.parse(readFileSync(out, "utf8")).grading_rule, "new");
  assert.equal(run(input, "--strict").status, 1);
  assert.equal(run().status, 2);
  assert.equal(run(input, "--bogus").status, 2);
  assert.deepEqual(parseArgs(["f.json", "--all", "--grading", "new"]), { file: "f.json", rule: "new", all: true, out: undefined, strict: false });
});
