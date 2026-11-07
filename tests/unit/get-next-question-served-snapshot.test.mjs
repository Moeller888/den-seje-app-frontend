// L1 K1 — get-next-question's half of the delivered-version contract (./served-snapshot.ts and its wiring
// in index.ts). The database half (the trigger that verifies the proposal and owns the snapshot) is
// proven in l1-k1-attempt-context-migration-run.test.mjs and -concurrency.test.mjs; the "switch off =
// exactly as before" parity in get-next-question-release-gate.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  SERVED_SNAPSHOT_ENV, deliveredQuestion, deliveryProposal, servedSnapshotEnabled,
} from "../../supabase/functions/get-next-question/served-snapshot.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const INDEX = readFileSync(join(ROOT, "supabase/functions/get-next-question/index.ts"), "utf8").replace(/^\s*\/\/.*$/gm, "");

test("the switch: exactly \"on\" enables it; anything else keeps today's behaviour", () => {
  assert.equal(SERVED_SNAPSHOT_ENV, "K1_SERVED_SNAPSHOT");
  assert.equal(servedSnapshotEnabled("on"), true);
  for (const v of [undefined, null, "", "ON", " on", "true", "1", "off", "v1"]) assert.equal(servedSnapshotEnabled(v), false, String(v));
});

test("the proposal is exactly the four fields the response is built from; absent ones are null", () => {
  const q = { id: "x", content: { question: "Q", options: ["a", "b"], correct: "a" }, metadata: { domain: "d" },
    answer_format: "mc", answer_type: "short", difficulty_band: 3, learning_objective: "d" };
  assert.deepEqual(deliveryProposal(q), { content: q.content, metadata: q.metadata, answer_format: "mc", answer_type: "short" });
  assert.deepEqual(deliveryProposal({ content: { question: "Q" } }), { content: { question: "Q" }, metadata: null, answer_format: null, answer_type: null });
});

test("the delivered version: null when absent (unknown); malformed fails loud; the key is carried, never public", () => {
  assert.equal(deliveredQuestion(null), null);
  assert.equal(deliveredQuestion(undefined), null);
  const d = deliveredQuestion({ content: { question: "Q", correct: "a" }, metadata: { m: 1 }, answer_format: "match", answer_type: "short", correct_answer: "[2,0,1]" });
  assert.deepEqual(d, { content: { question: "Q", correct: "a" }, metadata: { m: 1 }, answer_format: "match", answer_type: "short", key: "[2,0,1]" });
  for (const bad of ["text", [], { metadata: {} }, { content: "x" }, { content: {}, answer_format: 3 }]) {
    assert.throws(() => deliveredQuestion(bad), /served_snapshot/, JSON.stringify(bad));
  }
});

test("index.ts wiring: switch read once; new instances propose; open and repeated rounds are served FROM the snapshot", () => {
  assert.match(INDEX, /const servedSnapshot = servedSnapshotEnabled\(Deno\.env\.get\(SERVED_SNAPSHOT_ENV\)\);/);
  // New instance: the proposal is built from the same q the response is built from.
  assert.match(INDEX, /servedSnapshot: servedSnapshot \? deliveryProposal\(q\) : undefined,/);
  assert.match(INDEX, /pub = toPublicQuestion\(q\.content, format, q\.metadata, normalized\.correct\);/);
  // Due (open round, reload): the delivered version replaces the question row; the match key comes from it.
  assert.match(INDEX, /const delivered = servedSnapshot \? await deliveredFor\(instance\.id\) : null;\s*const q = delivered \?\? instance\.questions;/);
  // Repeat: the reopen took the snapshot; the response is built from it.
  assert.match(INDEX, /const delivered = servedSnapshot \? await deliveredFor\(repeatRow\.id\) : null;\s*const src = delivered \?\? rq;/);
  assert.match(INDEX, /const pub = toPublicQuestion\(src\.content, format, src\.metadata, instanceKey\);/);
  // The snapshot's key lays out the keyed formats only — Match par and Rækkefølge (F-04).
  assert.match(INDEX, /const KEYED_FORMATS: ReadonlySet<string> = new Set\(\["match", "order", "categorize"\]\);/);
  assert.equal((INDEX.match(/\? \(KEYED_FORMATS\.has\(format\) \? delivered\.key : undefined\)/g) ?? []).length, 2);
  // The snapshot read is scoped to the verified student and fails loud.
  assert.match(INDEX, /\.select\("served_snapshot"\)\s*\.eq\("id", instanceId\)\s*\.eq\("student_id", student_id\)\s*\.limit\(1\);/);
  assert.match(INDEX, /if \(error\) throw new InstanceKeyReadError\(`Served snapshot read failed/);
  // Inactive questions are still filtered on the CURRENT row before anything is served.
  assert.match(INDEX, /\(dueInstances \|\| \[\]\)\.filter\(\(i: any\) => i\.questions && i\.questions\.is_active !== false\)/);
  assert.match(INDEX, /if \(rq && rq\.is_active !== false\) \{/);
});

test("nothing internal leaves the function: responses carry only toPublicQuestion's payload", () => {
  const responses = INDEX.match(/JSON\.stringify\(\{[\s\S]*?\}\)/g) ?? [];
  assert.ok(responses.length >= 3, "the response bodies are found");
  for (const body of responses) {
    assert.equal(/served_snapshot|delivered|\bkey\b|correct_answer|normalized/.test(body), false, body);
  }
});
