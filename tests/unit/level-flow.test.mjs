// get-next-question/level-flow.ts — the level engine's pure parts: the flag, the route for the four flag
// combinations, the step rule, the relative band, the ordering and the RPC sequence (recording stub).
// The SQL side, the real candidate rows and the four combinations against real SQL are proven in
// difficulty-scale-b-migration-run.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  CELL_WIDTH, LEVEL_CANDIDATES_RPC, LEVEL_CANDIDATE_LIMIT, LEVEL_REPEAT_RPC, LEVEL_RPC, MAX_LEVEL, MIN_LEVEL,
  chooseSelectionRoute, foldLevel, levelStep, loadLevelPlan, orderByLevel, parseServerLevel, relativeBand,
  resolveLevelEngine, toLevelRelative,
} from "../../supabase/functions/get-next-question/level-flow.ts";
import { HISTORY_LIMIT, HISTORY_SELECT } from "../../supabase/functions/get-next-question/mix-flow.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const INDEX = readFileSync(join(ROOT, "supabase", "functions", "get-next-question", "index.ts"), "utf8");

test("LEVEL_ENGINE: only the exact value \"v1\" turns the engine on", () => {
  for (const v of [undefined, null, "", "V1", "v2", "on", "true", "1", " v1", "shadow"]) assert.equal(resolveLevelEngine(v), "off", String(v));
  assert.equal(resolveLevelEngine("v1"), "v1");
});

test("route matrix: both off / only QUESTION_MIX_ENGINE / only LEVEL_ENGINE / both", () => {
  assert.deepEqual(chooseSelectionRoute("v1", "off"), {
    newQuestions: "v1", shadowMix: false, repeatRpc: "request_repeat_question_for_student",
    repeatArgs: "student+grade+domains", wireFormat: "map" });
  assert.deepEqual(chooseSelectionRoute("v2", "off"), {
    newQuestions: "mix", shadowMix: false, repeatRpc: "request_repeat_question_servable_for_student",
    repeatArgs: "student+grade+domains", wireFormat: "servable" });
  assert.deepEqual(chooseSelectionRoute("v1", "v1"), {
    newQuestions: "level", shadowMix: false, repeatRpc: LEVEL_REPEAT_RPC, repeatArgs: "student+domains", wireFormat: "map" });
  assert.deepEqual(chooseSelectionRoute("v2", "v1"), {
    newQuestions: "level+mix", shadowMix: false, repeatRpc: LEVEL_REPEAT_RPC, repeatArgs: "student+domains", wireFormat: "servable" });
  // "shadow" keeps its meaning with the level engine off and is inert with it on (the level engine serves).
  assert.equal(chooseSelectionRoute("shadow", "off").shadowMix, true);
  assert.equal(chooseSelectionRoute("shadow", "off").newQuestions, "v1");
  assert.equal(chooseSelectionRoute("shadow", "v1").newQuestions, "level");
});

test("LEVEL_ENGINE unset: index.ts keeps today's calls, word for word, behind the level branch", () => {
  // The level branch is entered only on the level routes …
  assert.match(INDEX, /if \(route\.newQuestions === "level" \|\| route\.newQuestions === "level\+mix"\) \{/);
  // … and everything else is the unchanged #351 code: v2 mix, else v1 with the optional shadow.
  assert.match(INDEX, /\} else if \(mixEngine === "v2"\) \{\s*const \{ plan, band \} = await loadFormatMixPlan/);
  assert.match(INDEX, /"get_unserved_questions_for_student",\s*\{\s*p_student_id: student_id,\s*p_grade:\s*selectedGrade,\s*p_domains:\s*subjectDomains,/);
  assert.match(INDEX, /if \(mixEngine === "shadow"\) \{/);
  // The repeat keeps both old calls with the grade; the level repeat is reached only on the level routes.
  assert.match(INDEX, /route\.repeatArgs !== "student\+domains"\s*\? \(mixEngine === "v2"/);
  assert.match(INDEX, /"request_repeat_level_question_for_student",\s*\{ p_student_id: student_id, p_domains: subjectDomains \}/);
  // The due step, the wire format and the insert path do not look at the level engine at all.
  const due = INDEX.slice(INDEX.indexOf("// 🔥 1. DUE QUESTIONS"), INDEX.indexOf("// 🔥 2. NEW QUESTIONS"));
  assert.doesNotMatch(due, /level/i);
  assert.match(INDEX, /mixEngine === "v2" \? servableWireFormat\(row\) : mapAnswerFormat/);
  assert.equal((INDEX.match(/Deno\.env\.get\("LEVEL_ENGINE"\)/g) ?? []).length, 1);
});

test("both flags on: one selection path, one level update, never #351's band fold or candidate window", async () => {
  // index.ts: the level branch and the two mix branches are mutually exclusive (if / else if / else), the
  // level engine is called once, and only from the level branch.
  const step2 = INDEX.slice(INDEX.indexOf("let sortedQuestions: any[];"), INDEX.indexOf("let inserted = null;"));
  const levelAt = step2.indexOf('if (route.newQuestions === "level" || route.newQuestions === "level+mix") {');
  const mixAt = step2.indexOf('} else if (mixEngine === "v2") {');
  assert.ok(levelAt >= 0 && mixAt > levelAt, "level branch first, then else-if mix");
  assert.equal((INDEX.match(/await loadLevelPlan\(/g) ?? []).length, 1);
  assert.ok(step2.indexOf("await loadLevelPlan(") < mixAt, "loadLevelPlan only inside the level branch");
  assert.ok(step2.indexOf("await loadFormatMixPlan(") > mixAt, "loadFormatMixPlan only in the mix branches");
  // One ordered list, one insert loop: the first successful insert wins, then the loop breaks.
  assert.equal((INDEX.match(/for \(const q of sortedQuestions\)/g) ?? []).length, 1);
  // level+mix through the flow: exactly the level RPCs and the history read — no advance_student_band, no
  // get_question_candidates_for_student, so neither the band nor a second candidate window is touched.
  const c = stub({
    [LEVEL_RPC]: { data: LEVEL_ROW, error: null },
    [LEVEL_CANDIDATES_RPC]: { data: CANDS, error: null },
    history: { data: [], error: null },
  });
  await loadLevelPlan(c, { ...INPUT, mixEngine: "v2" });
  const rpcs = c.calls.filter((x) => x[0] === "rpc").map((x) => x[1]);
  assert.deepEqual(rpcs, [LEVEL_RPC, LEVEL_CANDIDATES_RPC]);
  assert.ok(!rpcs.includes("advance_student_band") && !rpcs.includes("get_question_candidates_for_student"));
});

test("step rule (B3): max(15, round(150/sqrt(n+1))); +step correct, −3·step incorrect; clamped 1..10000", () => {
  assert.deepEqual([0, 1, 2, 3, 8, 98, 99, 1000].map(levelStep), [150, 106, 87, 75, 50, 15, 15, 15]);
  assert.deepEqual(foldLevel({ level: 143, answered: 0 }, [true]), { level: 293, answered: 1 });
  assert.deepEqual(foldLevel({ level: 143, answered: 0 }, [false]), { level: MIN_LEVEL, answered: 1 });
  assert.equal(foldLevel({ level: 9990, answered: 0 }, [true]).level, MAX_LEVEL);
  // Equilibrium ≈ 75 %: three right and one wrong, repeated with a settled step, leaves the level put.
  const settled = foldLevel({ level: 5000, answered: 200 }, Array.from({ length: 400 }, (_, i) => i % 4 !== 3));
  assert.equal(settled.level, 5000);
  // A pupil who answers everything right climbs the whole scale in a few hundred answers.
  let s = { level: 143, answered: 0 }, n = 0;
  while (s.level < MAX_LEVEL) { s = foldLevel(s, [true]); n++; }
  assert.ok(n > 400 && n < 800, `${n} answers to the top`);
});

test("parseServerLevel accepts only a well-formed row, never guesses", () => {
  const ok = { level: 500, seed_level: 143, seed_source: "grade", answered: 3, newly_folded: 1 };
  assert.deepEqual(parseServerLevel([ok]), { level: 500, seedLevel: 143, seedSource: "grade", answered: 3, newlyFolded: 1 });
  for (const bad of [null, [], [{}], [{ ...ok, level: 0 }], [{ ...ok, level: 10001 }], [{ ...ok, level: 1.5 }],
    [{ ...ok, seed_source: "client" }], [{ ...ok, answered: -1 }], [{ ...ok, newly_folded: null }]]) {
    assert.throws(() => parseServerLevel(bad), /malformed advance_student_level result/, JSON.stringify(bad));
  }
});

test("relative band: 3 = the pupil's own cell, ±1 per cell, clamped to 1..5; unlevelled candidates are dropped", () => {
  assert.equal(relativeBand(5000, 5000), 3);
  assert.equal(relativeBand(5000 + CELL_WIDTH, 5000), 4);
  assert.equal(relativeBand(5000 - CELL_WIDTH, 5000), 2);
  assert.equal(relativeBand(10000, 1), 5);
  assert.equal(relativeBand(1, 10000), 1);
  const rows = [
    { id: "a", difficulty_level: 5000, difficulty_band: 1 },
    { id: "b", difficulty_level: null },
    { id: "c" },
    { id: "d", difficulty_level: 0 },
    { id: "e", difficulty_level: 7000.5 },
    { difficulty_level: 5000 },
    { id: "f", difficulty_level: 5600 },
  ];
  const rel = toLevelRelative(rows, 5000);
  assert.deepEqual(rel.map((r) => [r.id, r.difficulty_band]), [["a", 3], ["f", 5]]);
});

test("orderByLevel: level tier (within one cell) first, wave score inside a tier, nearest level as tie-breaker", () => {
  const rel = toLevelRelative([
    { id: "near1", difficulty_level: 5010, metadata: {} },
    { id: "far", difficulty_level: 9000, metadata: { difficulty_type: "factual", cognitive_skill: "recall", challenge_role: "reinforcement" } },
    { id: "near2", difficulty_level: 5100, metadata: { difficulty_type: "factual", cognitive_skill: "recall" } },
    { id: "near3", difficulty_level: 5200, metadata: {} },
  ], 5000);
  // In recovery the far factual question scores highest, but it stays behind the whole near tier.
  assert.deepEqual(orderByLevel(rel, "recovery", null).map((r) => r.id), ["near2", "near1", "near3", "far"]);
  assert.deepEqual(orderByLevel(rel, "challenge", null).map((r) => r.id), ["near1", "near2", "near3", "far"]);
});

function stub(responses) {
  const calls = [];
  return {
    calls,
    rpc(fn, args) { calls.push(["rpc", fn, args]); return Promise.resolve(responses[fn]); },
    from(table) {
      return { select(cols) { return { eq(c, v) { return { order(o, opts) { return { limit(n) {
        calls.push(["from", table, cols, c, v, o, opts, n]); return Promise.resolve(responses.history);
      } }; } }; } }; } };
    },
  };
}
const LEVEL_ROW = [{ level: 6000, seed_level: 143, seed_source: "grade", answered: 12, newly_folded: 2 }];
const CANDS = [
  { id: "x1", difficulty_level: 6000, answer_format: "mc", answer_type: "short", content: { question: "?", options: ["a", "b"] } },
  { id: "x2", difficulty_level: 6300, answer_format: "mc", answer_type: "short", content: { question: "?", options: ["a", "b"] } },
];
const INPUT = { studentId: "s-1", subject: "engelsk", grade: 3, domains: ["english"], wavePhase: "challenge", lastMisconceptionType: null };

test("loadLevelPlan: folds first, then asks for candidates around the folded level, for the verified student", async () => {
  const c = stub({ [LEVEL_RPC]: { data: LEVEL_ROW, error: null }, [LEVEL_CANDIDATES_RPC]: { data: CANDS, error: null } });
  const out = await loadLevelPlan(c, { ...INPUT, mixEngine: "v1" });
  assert.deepEqual(c.calls, [
    ["rpc", LEVEL_RPC, { p_student_id: "s-1", p_subject: "engelsk", p_grade: 3 }],
    ["rpc", LEVEL_CANDIDATES_RPC, { p_student_id: "s-1", p_level: 6000, p_domains: ["english"], p_limit: LEVEL_CANDIDATE_LIMIT }],
  ]);
  assert.deepEqual(out.ordered.map((r) => r.id), ["x1", "x2"]);
  assert.equal(out.level.level, 6000);
  assert.equal(out.mixKind, null);
});

test("loadLevelPlan with the format mix: the same two RPCs plus the pupil's own history window", async () => {
  const c = stub({
    [LEVEL_RPC]: { data: LEVEL_ROW, error: null },
    [LEVEL_CANDIDATES_RPC]: { data: CANDS, error: null },
    history: { data: [], error: null },
  });
  const out = await loadLevelPlan(c, { ...INPUT, mixEngine: "v2" });
  assert.deepEqual(c.calls[2], ["from", "question_instances", HISTORY_SELECT, "student_id", "s-1", "created_at", { ascending: false }, HISTORY_LIMIT]);
  assert.equal(out.mixKind, "choice");
  assert.deepEqual(new Set(out.ordered.map((r) => r.id)), new Set(["x1", "x2"]));
});

test("loadLevelPlan fails loud: RPC errors, a malformed level, a bad subject or student id", async () => {
  const boom = new Error("rpc down");
  await assert.rejects(loadLevelPlan(stub({ [LEVEL_RPC]: { data: null, error: boom } }), { ...INPUT, mixEngine: "v1" }), /rpc down/);
  await assert.rejects(loadLevelPlan(stub({ [LEVEL_RPC]: { data: [{}], error: null } }), { ...INPUT, mixEngine: "v1" }), /malformed/);
  await assert.rejects(loadLevelPlan(stub({
    [LEVEL_RPC]: { data: LEVEL_ROW, error: null }, [LEVEL_CANDIDATES_RPC]: { data: null, error: boom },
  }), { ...INPUT, mixEngine: "v1" }), /rpc down/);
  await assert.rejects(loadLevelPlan(stub({}), { ...INPUT, subject: "matematik", mixEngine: "v1" }), /invalid subject/);
  await assert.rejects(loadLevelPlan(stub({}), { ...INPUT, studentId: "", mixEngine: "v1" }), /missing student id/);
});
