import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RAID_SIZE,
  QUESTION_POOL,
  dayKey,
  pickRaidQuestions,
  gradeAnswer,
  raidVerdict,
  bossForTopic,
  normalizeLiveQuestion,
} from "../../js/kamp-raid.js";

test("the pool is multiple-choice with a correct option that exists", () => {
  assert.ok(QUESTION_POOL.length >= RAID_SIZE);
  for (const q of QUESTION_POOL) {
    assert.equal(typeof q.id, "string");
    assert.ok(q.id.length > 0);
    assert.equal(typeof q.prompt, "string");
    assert.ok(Array.isArray(q.options));
    assert.ok(q.options.length >= 2);
    assert.ok(q.options.includes(q.correct), `${q.id} correct answer is not among the options`);
    for (const opt of q.options) assert.equal(typeof opt, "string");
  }
});

test("Danish letters are preserved in the live prompts", () => {
  const blob = QUESTION_POOL.map((q) => q.prompt + q.options.join("") + q.correct).join(" ");
  assert.ok(blob.includes("ø") || blob.includes("Ø"));
  assert.ok(blob.includes("æ") || blob.includes("Æ") || blob.includes("å") || blob.includes("Å"));
  assert.ok(!blob.includes("Ã¦") && !blob.includes("Ã¸") && !blob.includes("Ã¥"));
});

test("dayKey is YYYY-MM-DD and stable", () => {
  assert.equal(dayKey(new Date("2026-09-14T12:00:00Z")), "2026-09-14");
  assert.equal(dayKey(new Date("invalid")), "1970-01-01");
});

test("pickRaidQuestions is deterministic for a date", () => {
  const a = pickRaidQuestions("2026-09-14", QUESTION_POOL, 7);
  const b = pickRaidQuestions("2026-09-14", QUESTION_POOL, 7);
  assert.equal(a.length, 7);
  assert.deepEqual(a.map((q) => q.id), b.map((q) => q.id));
  const ids = new Set(a.map((q) => q.id));
  assert.equal(ids.size, 7);
});

test("different dates can rotate the raid", () => {
  const a = pickRaidQuestions("2026-09-14", QUESTION_POOL, 7).map((q) => q.id).join(",");
  const b = pickRaidQuestions("2026-09-15", QUESTION_POOL, 7).map((q) => q.id).join(",");
  assert.notEqual(a, b);
});

test("pickRaidQuestions is empty-safe", () => {
  assert.deepEqual(pickRaidQuestions("2026-09-14", [], 7), []);
  assert.deepEqual(pickRaidQuestions("2026-09-14", null, 7), []);
});

test("gradeAnswer is exact and never throws", () => {
  const q = QUESTION_POOL[0];
  assert.equal(gradeAnswer(q, q.correct), true);
  assert.equal(gradeAnswer(q, "nej"), false);
  assert.equal(gradeAnswer(q, null), false);
  assert.equal(gradeAnswer(null, "x"), false);
});

test("bossForTopic maps domains and Danish labels", () => {
  assert.equal(bossForTopic("vikings").id, "jarl");
  assert.equal(bossForTopic("Vikinger").id, "jarl");
  assert.equal(bossForTopic("world_war_2").id, "skygg");
  assert.equal(bossForTopic("Anden verdenskrig").id, "skygg");
  assert.equal(bossForTopic("cold_war").id, "mur");
  assert.equal(bossForTopic("industrialisation").id, "kedel");
  assert.equal(bossForTopic("democracy_power").id, "ting");
  assert.equal(bossForTopic("Danmark").id, "gaade");
  assert.equal(bossForTopic("").id, "gaade");
  assert.equal(bossForTopic(null).id, "gaade");
  assert.equal(bossForTopic("vikings").name, "Jarlen");
});

test("normalizeLiveQuestion reads MC payloads and no_questions", () => {
  assert.equal(normalizeLiveQuestion(null), null);
  assert.deepEqual(normalizeLiveQuestion({ step: "no_questions" }), { step: "no_questions" });
  const live = normalizeLiveQuestion({
    question_instance_id: "abc",
    answer_format: "mc",
    content: { question: "Hvornår?", options: ["1939", "1940"], correct: "1939" },
    metadata: { domain: "world_war_2" },
  });
  assert.equal(live.live, true);
  assert.equal(live.instanceId, "abc");
  assert.equal(live.format, "mc");
  assert.equal(live.topic, "world_war_2");
  assert.equal(live.prompt, "Hvornår?");
  assert.equal(bossForTopic(live.topic).id, "skygg");
});

test("raidVerdict is never-negative", () => {
  assert.equal(raidVerdict(7, 7).id, "open");
  assert.equal(raidVerdict(5, 7).id, "yield");
  assert.equal(raidVerdict(3, 7).id, "stand");
  assert.equal(raidVerdict(0, 7).id, "wait");
  assert.equal(raidVerdict(0, 0).id, "empty");
  for (const v of [raidVerdict(0, 7), raidVerdict(3, 7), raidVerdict(7, 7)]) {
    assert.ok(!/dump|taber|fail|failed|nederlag/i.test(v.title + v.line));
  }
});
