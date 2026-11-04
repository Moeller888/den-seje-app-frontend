// D-332: the teacher review pack, the teacher's decision file and the isolated server fixture are generated
// from the same data as the game; they must be in sync, cover the same elements, and approve nothing by
// themselves.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DECISIONS, FIXTURE, STATUSES, TEST_OBJECTIVE, check, elements } from "../../tools/laerligverse/review-pack.mjs";

test("pack, fixture and decision file are in sync with the item data (no drift)", async () => {
  assert.deepEqual(await check(), []);
});

test("the decision file is the teacher's: only valid statuses, and nothing is approved by the tool", async () => {
  const d = JSON.parse(readFileSync(DECISIONS, "utf8"));
  const statuses = Object.values(d.elementer).map((v) => v.status);
  for (const s of statuses) assert.ok(STATUSES.includes(s), s);
  // Committed state: not yet reviewed. A teacher's later edit changes this test's expectation deliberately.
  assert.equal(d.laerer, "", "no reviewer has signed");
  assert.ok(statuses.every((s) => s === "ikke_gennemgaaet"), "nothing is approved until a teacher writes it");
});

test("the pack covers the whole sequence in teaching order: objective, intro, check, archive card, steps 3–8 with reflection", async () => {
  const ids = (await elements()).list.map((e) => e.id);
  assert.deepEqual(ids, ["maal", "intro-1", "intro-2", "intro-3", "intro-tjek", "arkivkort", "h4-kilde", "h4-kilde-revision", "h4-overfoersel", "refleksion", "t1864", "h4-genbesoeg"]);
});

test("the server fixture is a clearly named TEST objective, with one back per option and the key only in `correct`", () => {
  const rows = JSON.parse(readFileSync(FIXTURE, "utf8"));
  assert.equal(TEST_OBJECTIVE.startsWith("test_"), true);
  for (const r of rows) {
    assert.equal(r.learning_objective, TEST_OBJECTIVE);
    assert.equal(r.content.options.length, r.content.option_details.length);
    assert.ok(r.content.options.includes(r.content.correct), r.tag);
    for (const d of r.content.option_details) assert.ok(d.length <= 400 && /^Afsender: /.test(d), r.tag);
  }
});
