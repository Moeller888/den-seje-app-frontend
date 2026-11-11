// Source contract for supabase/functions/review-answer/index.ts after the single-payout fix
// (migration 20261111120000_review_answer_single_payout, docs/security/review-answer-enkelt-udbetaling.md).
//
// The database function review_answer is the ONE pay path (model B: it posts the difference to the
// amount already posted for the instance, so xp_awarded can be negative after a correction down). The Edge Function used to add the same XP a
// second time with its own read-then-write; it must never write progress again, and it reports the RPC's
// own status in the old response shape ({ ok: true, xp_awarded: <number> }).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const EDGE = "supabase/functions/review-answer/index.ts";
const src = () => readFileSync(join(ROOT, EDGE), "utf8").split("\r\n").join("\n");
// Code without line comments, so an explanation that NAMES the old write does not count as the write.
const code = () => src().split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

test("the Edge Function never reads or writes student_progress (no second payout)", () => {
  const c = code();
  assert.ok(!c.includes("student_progress"), "student_progress must not appear in executable code");
  assert.ok(!/\.update\(\s*\{\s*xp\s*:/.test(c), "no XP update");
  assert.ok(!c.includes("scoreToXP"), "the Edge-side score table is gone; the amount lives in the database");
});

test("exactly one database write: the review_answer RPC", () => {
  const c = code();
  assert.equal((c.match(/\.rpc\(/g) ?? []).length, 1, "one RPC call");
  assert.ok(c.includes('.rpc("review_answer", {'), "the RPC is review_answer");
  for (const write of [".update(", ".insert(", ".upsert(", ".delete("]) {
    assert.ok(!c.includes(write), `no ${write} in the Edge Function`);
  }
});

test("xp_awarded comes from the RPC's status, never from a local table", () => {
  const c = code();
  assert.match(c, /const \{ data: reviewStatus, error: rpcError \} = await supabase\.rpc\("review_answer"/);
  assert.match(c, /\.xp_awarded/);
  assert.match(c, /JSON\.stringify\(\{ ok: true, xp_awarded: xpAwarded, reward_status: rewardStatus \}\)/,
    "backward-compatible response shape: ok + xp_awarded (reward_status is additive)");
});

test("a missing or malformed RPC status is an explicit error, not a guessed amount", () => {
  const c = code();
  assert.match(c, /typeof xpAwarded !== "number"/);
  assert.match(c, /throw new Error\("Review reward status missing"\)/);
});

test("the RPC still runs only after the role and ownership checks", () => {
  const c = code();
  const rpc = c.indexOf('.rpc("review_answer"');
  assert.ok(c.indexOf("!callerProfile ||") < rpc);
  assert.ok(c.indexOf("if (!ownsStudent)") < rpc);
  assert.match(c, /p_teacher_id: user\.id/, "the teacher id is the verified caller");
});

test("the frontend caller reads only `error` from review-answer (the shape change is additive)", () => {
  const js = readFileSync(join(ROOT, "js/student-detail.js"), "utf8");
  const m = js.match(/const \{([^}]*)\} = await supabase\.functions\.invoke\("review-answer"/);
  assert.ok(m, "the caller exists");
  assert.deepEqual(m[1].split(",").map((s) => s.trim()).filter(Boolean), ["error"]);
});

test("a score outside 1..4 is refused (400) before any read or write", () => {
  const c = code();
  const guard = c.indexOf("!Number.isInteger(score) || score < 1 || score > 4");
  assert.ok(guard > 0, "the score guard exists");
  assert.ok(guard < c.indexOf('.from("question_instances")'), "before the instance lookup");
  assert.ok(guard < c.indexOf('.rpc("review_answer"'), "before the RPC");
  assert.match(c.slice(guard, guard + 200), /error: "Invalid score"[\s\S]*status: 400/);
});

test("a negative xp_awarded (a correction down) is passed on, not refused or clamped", () => {
  const c = code();
  assert.ok(!/xpAwarded\s*<\s*0/.test(c), "no check that would refuse a negative delta");
  assert.ok(!/Math\.max\(\s*0/.test(c), "no clamping");
  assert.match(c, /Number\.isFinite\(xpAwarded\)/);
});
