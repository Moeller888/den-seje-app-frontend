// H5 PR 2 (D-266): get-next-question hands out the round the pupil is answering.
//
//   round_no = question_instances.repeat_count + 1 of the row the response serves
//
// It is read from the database on every path that serves a question — the open/due instance, a newly
// inserted instance (repeat_count read back from the insert) and a reopened repeat (read back after
// request_repeat_*) — and never taken from the request. A row without a valid repeat_count is a
// server fault: the request fails loud (500) instead of inventing a round. Nothing calls the _v2 answer
// functions yet (PR 3–5); this only adds the field.
//
// Runs the REAL index.ts through tests/unit/helpers/gnq-parity-harness.mjs (recording supabase-js
// stand-in). Exact parity with version 179 apart from round_no is proven separately in
// get-next-question-release-gate.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { MIX_VALUES, SUBJECTS, loadHandler, runCase } from "./helpers/gnq-parity-harness.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const loaded = loadHandler(join(ROOT, "supabase", "functions", "get-next-question", "index.ts"));
loaded.catch(() => {});

const SERVED_KEYS = ["question_instance_id", "round_no", "content", "answer_format", "answer_type", "metadata", "wave_phase"];

const isDueRead = (kind, name, ops) =>
  kind === "from" && name === "question_instances" && ops.some((o) => o[0] === "eq" && o[1] === "answered" && o[2] === false);
const isRepeatRead = (kind, name, ops) =>
  kind === "from" && name === "question_instances" && ops.some((o) => o[0] === "eq" && o[1] === "id");
const isInsert = (kind, name, ops) =>
  kind === "from" && name === "question_instances" && ops.some((o) => o[0] === "insert");

// Replaces the rows of one backend answer: rows(oldRows) → newRows.
const patchRows = (match, rows) => (kind, name, ops, res) =>
  match(kind, name, ops) ? { ...res, data: rows(res.data) } : res;

async function serve(c) {
  const { handler } = await loaded;
  const r = await runCase(handler, { mix: undefined, level: undefined, subject: "historie", ...c });
  return { ...r, json: JSON.parse(r.body) };
}

test("1. first round: a newly inserted instance is round 1, read back from the inserted row", async () => {
  for (const mix of MIX_VALUES) for (const subject of SUBJECTS) for (const level of [undefined, "v1"]) {
    const r = await serve({ mix, level, subject, scenario: "new" });
    const label = `mix=${mix} level=${level} ${subject}`;
    assert.equal(r.status, 200, label);
    assert.equal(r.json.question_instance_id, "new-inst", label);
    assert.equal(r.json.round_no, 1, label);
    const insert = r.calls.find((x) => isInsert(x.kind, x.name, x.ops));
    assert.deepEqual(insert.ops.find((o) => o[0] === "select"), ["select", "id, repeat_count"], label);
    assert.equal("repeat_count" in insert.ops.find((o) => o[0] === "insert")[1], false, `${label}: never written`);
  }
  // The number comes from the row, not from an assumption that new means 1.
  const r = await serve({ scenario: "new", patch: patchRows(isInsert, (rows) => [{ ...rows[0], repeat_count: 3 }]) });
  assert.equal(r.json.round_no, 4);
});

test("2. a reopened instance is served with the next round, read back after the reopen", async () => {
  for (const mix of MIX_VALUES) for (const level of [undefined, "v1"]) {
    const r = await serve({ mix, level, scenario: "repeat" });
    const label = `mix=${mix} level=${level}`;
    assert.equal(r.status, 200, label);
    assert.deepEqual([r.json.question_instance_id, r.json.round_no, r.json.is_repeat], ["rep-1", 2, true], label);
    // The read-back runs AFTER the reopen RPC, so it sees the raised repeat_count.
    const reopen = r.calls.findIndex((x) => x.kind === "rpc" && x.name.startsWith("request_repeat"));
    const readBack = r.calls.findIndex((x) => isRepeatRead(x.kind, x.name, x.ops));
    assert.ok(reopen >= 0 && readBack > reopen, `${label}: read back after the reopen`);
  }
  for (const rc of [1, 2, 4, 41]) {
    const r = await serve({ scenario: "repeat", patch: patchRows(isRepeatRead, (rows) => [{ ...rows[0], repeat_count: rc }]) });
    assert.equal(r.json.round_no, rc + 1, `repeat_count ${rc}`);
  }
});

test("3. fetching the same open round again gives the same round_no", async () => {
  for (const rc of [0, 1, 2, 7]) {
    const patch = patchRows(isDueRead, (rows) => rows.map((x) => ({ ...x, repeat_count: rc })));
    const first = await serve({ scenario: "due", patch });
    const again = await serve({ scenario: "due", patch });
    const third = await serve({ scenario: "due", patch, mix: "v2" });
    assert.equal(first.json.round_no, rc + 1);
    assert.deepEqual([again.json.question_instance_id, again.json.round_no], [first.json.question_instance_id, first.json.round_no]);
    assert.equal(third.json.round_no, rc + 1);
  }
  // A reopened instance that is fetched again (now via the due step) keeps the round it was served with.
  const reopened = await serve({ scenario: "repeat" });
  const refetch = await serve({
    scenario: "due",
    patch: patchRows(isDueRead, (rows) => rows.map((x) => ({ ...x, id: "rep-1", repeat_count: 1 }))),
  });
  assert.deepEqual([refetch.json.question_instance_id, refetch.json.round_no], ["rep-1", reopened.json.round_no]);
});

test("4. a manipulated request cannot set or shift round_no, and its values never reach the backend", async () => {
  const extraBody = {
    round_no: 99, repeat_count: 41, question_instance_id: "someone-elses-instance", submission_id: "x",
    session_context: { wave_phase: "challenge", round_no: 77, repeat_count: 66 },
  };
  for (const [scenario, id, round] of [["due", "due-1", 1], ["new", "new-inst", 1], ["repeat", "rep-1", 2]]) {
    for (const mix of MIX_VALUES) {
      const r = await serve({ mix, scenario, extraBody });
      assert.deepEqual([r.json.question_instance_id, r.json.round_no], [id, round], `${scenario} mix=${mix}`);
      const sent = JSON.stringify(r.calls);
      for (const v of ["99", "41", "77", "66", "someone-elses-instance"]) {
        assert.equal(sent.includes(v), false, `${scenario} mix=${mix}: ${v} reached a backend call`);
      }
    }
  }
});

test("5. every existing response field is kept; round_no is the one addition, and only on a served question", async () => {
  const due = await serve({ scenario: "due" });
  assert.deepEqual(Object.keys(due.json), SERVED_KEYS);
  const fresh = await serve({ scenario: "new" });
  assert.deepEqual(Object.keys(fresh.json), SERVED_KEYS);
  const repeat = await serve({ scenario: "repeat" });
  assert.deepEqual(Object.keys(repeat.json), [...SERVED_KEYS, "is_repeat"]);
  for (const r of [due, fresh, repeat]) {
    assert.equal(Number.isInteger(r.json.round_no) && r.json.round_no >= 1, true);
    assert.deepEqual(r.json.content, { question: r.json.content.question, options: ["a", "b"] }, "no key in the payload");
    assert.equal(r.json.answer_format, "mc");
    assert.equal(r.json.wave_phase, "challenge");
  }
  const none = await serve({ scenario: "none" });
  assert.deepEqual([none.status, none.json], [200, { step: "no_questions" }]);
  const error = await serve({ scenario: "error" });
  assert.equal(error.status, 500);
  assert.equal("round_no" in error.json, false);
});

test("6. every question type the due step serves gets round_no, the long answer awaiting the teacher included", async () => {
  const kinds = [
    { answer_format: "mc", answer_type: "short", content: { question: "Q", options: ["a", "b"], correct: "a" } },
    { answer_format: "number", answer_type: "short", content: { question: "Q", correct: "4" } },
    { answer_format: "text", answer_type: "short", content: { question: "Q", correct: "Polen" } },
    { answer_format: "text", answer_type: "long", content: { question: "Q" } },
  ];
  for (const k of kinds) {
    const patch = patchRows(isDueRead, (rows) => rows.map((x) => ({ ...x, repeat_count: 2, questions: { ...x.questions, ...k } })));
    const r = await serve({ scenario: "due", patch });
    assert.equal(r.status, 200, JSON.stringify(k));
    assert.equal(r.json.round_no, 3, JSON.stringify(k));
    assert.equal(r.json.answer_type, k.answer_type);
  }
});

test("7. an invalid or missing repeat_count fails loud — no round is invented and no question is served", async () => {
  const bad = [undefined, null, -1, 1.5, "0", "1", true, {}];
  const set = (row, v) => {
    const out = { ...row };
    if (v === undefined) delete out.repeat_count; else out.repeat_count = v;
    return out;
  };
  for (const v of bad) {
    for (const [scenario, match] of [["due", isDueRead], ["new", isInsert], ["repeat", isRepeatRead]]) {
      const r = await serve({ scenario, patch: patchRows(match, (rows) => rows.map((x) => set(x, v))) });
      const label = `${scenario} repeat_count=${JSON.stringify(v) ?? "<missing>"}`;
      assert.equal(r.status, 500, label);
      assert.equal("round_no" in r.json, false, label);
      assert.equal("question_instance_id" in r.json, false, label);
      assert.match(r.json.error, /Invalid repeat_count on question instance/, label);
    }
  }
});

test("8. round_no always belongs to the served instance of the verified pupil", async () => {
  // Two open rows: the first cannot be shown (bad content) and is skipped; round_no is the served row's.
  const patch = patchRows(isDueRead, (rows) => [
    { ...rows[0], id: "due-bad", repeat_count: 5, questions: { ...rows[0].questions, content: { question: "" } } },
    { ...rows[0], id: "due-ok", repeat_count: 0 },
  ]);
  const r = await serve({ scenario: "due", patch });
  assert.deepEqual([r.json.question_instance_id, r.json.round_no], ["due-ok", 1]);

  // The reads it comes from are scoped to the verified student (the stand-in's user is stu-1), and the
  // repeat read-back to the instance the reopen RPC returned.
  const rep = await serve({ scenario: "repeat" });
  const reads = rep.calls.filter((x) => x.kind === "from" && x.name === "question_instances" && !isInsert(x.kind, x.name, x.ops));
  assert.ok(reads.length >= 2);
  for (const x of reads) assert.ok(x.ops.some((o) => o[0] === "eq" && o[1] === "student_id" && o[2] === "stu-1"), JSON.stringify(x.ops));
  const readBack = reads.find((x) => isRepeatRead(x.kind, x.name, x.ops));
  assert.ok(readBack.ops.some((o) => o[0] === "eq" && o[1] === "id" && o[2] === "rep-1"));
  assert.equal(readBack.client, "admin");
  const insert = (await serve({ scenario: "new" })).calls.find((x) => isInsert(x.kind, x.name, x.ops));
  assert.equal(insert.ops.find((o) => o[0] === "insert")[1].student_id, "stu-1");
});
