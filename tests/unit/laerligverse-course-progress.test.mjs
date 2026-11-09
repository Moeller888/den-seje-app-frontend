// Lærligverse course rewards: the course-progress Edge Function (supabase/functions/course-progress).
// Imports exactly the module the function runs (course-progress.ts) and drives handleCourseProgress with spies:
//   * flag-off parity: unless LAERLIGVERSE_COURSE_REWARDS is exactly "on", every request — any method, any body,
//     any token — gets 404 { outcome: "course_rewards_disabled" } and NO user lookup, NO admin client, NO RPC;
//   * on: the pupil is the verified user, never the body; one RPC, award_course_milestones, with that id;
//   * every RPC outcome maps to its status; malformed results and database errors are a 500 without detail;
//   * index.ts wires only this module, getUser with the caller's JWT, and imports neither answer path;
//   * config.toml registers the function like the others (verify_jwt false, its own import map).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  COURSE_REWARDS_DISABLED, COURSE_REWARDS_ENV, courseRewardsEnabled, handleCourseProgress, parseCourseProgressRequest,
  replyForAward,
} from "../../supabase/functions/course-progress/course-progress.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const PUPIL = "00000000-0000-4000-8000-0000000000a1";
const OTHER = "00000000-0000-4000-8000-0000000000b2";

function harness(opts = {}) {
  // "flag" may be passed as undefined on purpose (unset secret), so no destructuring default for it.
  const flag = Object.hasOwn(opts, "flag") ? opts.flag : "on";
  const { user = { id: PUPIL }, rpc = { data: null, error: null }, keyThrows = false } = opts;
  const calls = { getUser: 0, admin: 0, rpc: [] };
  const deps = {
    env: (name) => (name === COURSE_REWARDS_ENV ? flag : undefined),
    getUser: async () => { calls.getUser++; return user; },
    makeAdminClient: () => {
      calls.admin++;
      if (keyThrows) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
      return { rpc: async (fn, args) => { calls.rpc.push({ fn, args }); return rpc; } };
    },
    log: () => {},
  };
  return { deps, calls };
}
const request = (body, method = "POST") => ({ method, authorization: "Bearer pupil-jwt", json: async () => body });
const awarded = (objective, items) => ({
  outcome: items.length ? "awarded" : "nothing_new", learning_objective: objective, policy: "laerligverse-test-policy-v0",
  rates_version: "course-rewards-v0-proposal", awarded: items,
  xp_awarded: items.reduce((s, a) => s + a.xp, 0), coins_awarded: items.reduce((s, a) => s + a.coins, 0),
});

test("the switch is on only for exactly \"on\"", () => {
  assert.equal(COURSE_REWARDS_ENV, "LAERLIGVERSE_COURSE_REWARDS");
  assert.equal(courseRewardsEnabled("on"), true);
  for (const v of [undefined, null, "", "ON", "On", "true", "1", "on ", " on", "yes", "off"]) assert.equal(courseRewardsEnabled(v), false, String(v));
});

test("flag off: 404 course_rewards_disabled, no user lookup, no admin client, no RPC — for any request", async () => {
  for (const flag of [undefined, "", "ON", "true", "off", "on "]) {
    for (const [body, method] of [[{ learning_objective: "x" }, "POST"], [null, "POST"], [{ student_id: OTHER }, "GET"]]) {
      const { deps, calls } = harness({ flag });
      const r = await handleCourseProgress(request(body, method), deps);
      assert.equal(r.status, 404);
      assert.deepEqual(r.body, { outcome: "course_rewards_disabled", error: "Course rewards are not enabled" });
      assert.deepEqual(r.body, { ...COURSE_REWARDS_DISABLED });
      assert.deepEqual([calls.getUser, calls.admin, calls.rpc.length], [0, 0, 0], `flag ${JSON.stringify(flag)}`);
    }
  }
});

test("on: non-POST 405 and no user lookup; no verified user 401 and no admin client", async () => {
  let h = harness();
  assert.equal((await handleCourseProgress(request({ learning_objective: "x" }, "GET"), h.deps)).status, 405);
  assert.equal(h.calls.getUser, 0);
  h = harness({ user: null });
  const r = await handleCourseProgress(request({ learning_objective: "x" }), h.deps);
  assert.deepEqual([r.status, r.body], [401, { error: "Unauthorized" }]);
  assert.deepEqual([h.calls.admin, h.calls.rpc.length], [0, 0]);
});

test("on: the request contract — invalid bodies are 400 without any RPC", async () => {
  for (const [body, reason] of [[null, "invalid_body"], [[], "invalid_body"], ["x", "invalid_body"], [{}, "invalid_objective"],
    [{ learning_objective: 7 }, "invalid_objective"], [{ learning_objective: "   " }, "invalid_objective"],
    [{ learning_objective: "x".repeat(201) }, "invalid_objective"]]) {
    const { deps, calls } = harness();
    const r = await handleCourseProgress(request(body), deps);
    assert.deepEqual([r.status, r.body], [400, { outcome: "invalid_request", reason, error: "Invalid request" }], JSON.stringify(body));
    assert.equal(calls.rpc.length, 0);
  }
  assert.deepEqual(parseCourseProgressRequest({ learning_objective: "  kildekritik_1  " }), { ok: true, objective: "kildekritik_1" });
});

test("on: the pupil is the verified user, never the body; exactly one RPC with exactly two arguments", async () => {
  const items = [{ milestone_key: "step:o:guided_practice", kind: "step_completed", learning_step: "guided_practice", xp: 3, coins: 1 }];
  const { deps, calls } = harness({ rpc: { data: awarded("o", items), error: null } });
  const r = await handleCourseProgress(request({ learning_objective: "o", student_id: OTHER, p_student_id: OTHER,
    awarded: [{ milestone_key: "forged", xp: 1000 }], xp: 1000 }), deps);
  assert.equal(r.status, 200);
  assert.deepEqual(calls.rpc, [{ fn: "award_course_milestones", args: { p_student_id: PUPIL, p_objective: "o" } }]);
  assert.deepEqual(r.body, { outcome: "awarded", learning_objective: "o", awarded: items, xp_awarded: 3, coins_awarded: 1 });
});

test("outcomes map to statuses; nothing_new is a 200 with no awards", async () => {
  const cases = [
    [awarded("o", []), 200, { outcome: "nothing_new", learning_objective: "o", awarded: [], xp_awarded: 0, coins_awarded: 0 }],
    [{ outcome: "not_a_course_objective" }, 404, { outcome: "not_a_course_objective", error: "Not a course objective" }],
    [{ outcome: "not_a_student" }, 403, { outcome: "not_a_student", error: "Only pupils earn course rewards" }],
    [{ outcome: "no_progress_row" }, 409, { outcome: "no_progress_row", error: "No progress record" }],
    [{ outcome: "reward_path_not_ready", awarded: [], xp_awarded: 0, coins_awarded: 0 }, 503,
      { outcome: "reward_path_not_ready", error: "Course rewards are blocked until course answers are no longer paid per answer" }],
    [{ outcome: "invalid_request", reason: "invalid_objective" }, 400, { outcome: "invalid_request", error: "Invalid request", reason: "invalid_objective" }],
  ];
  for (const [data, status, body] of cases) {
    const r = replyForAward(data, "o");
    assert.deepEqual([r.status, r.body, r.problem], [status, body, undefined], data.outcome);
  }
});

test("malformed results, database errors and a missing key are a 500 that names no detail", async () => {
  const good = { milestone_key: "k", kind: "check_passed", learning_step: "transfer", xp: 8, coins: 4 };
  const bad = [
    null, [], "awarded", { outcome: "surprise" },
    { ...awarded("o", [good]), learning_objective: "other" },
    { ...awarded("o", [good]), awarded: "x" },
    { ...awarded("o", [good]), xp_awarded: 9 },
    { ...awarded("o", [good]), coins_awarded: -1 },
    awarded("o", [{ ...good, kind: "jackpot" }]),
    awarded("o", [{ ...good, xp: 1.5 }]),
    awarded("o", [{ ...good, milestone_key: "" }]),
    { ...awarded("o", []), outcome: "awarded" },
    { ...awarded("o", [good]), outcome: "nothing_new" },
  ];
  for (const data of bad) {
    const r = replyForAward(data, "o");
    assert.deepEqual([r.status, r.body], [500, { error: "Could not process course progress" }], JSON.stringify(data));
    assert.equal(typeof r.problem, "string");
  }
  let h = harness({ rpc: { data: null, error: { code: "42501", message: "permission denied for function award_course_milestones" } } });
  let r = await handleCourseProgress(request({ learning_objective: "o" }), h.deps);
  assert.deepEqual([r.status, r.body], [500, { error: "Could not process course progress" }]);
  h = harness({ keyThrows: true });
  r = await handleCourseProgress(request({ learning_objective: "o" }), h.deps);
  assert.deepEqual([r.status, r.body], [500, { error: "Server configuration error" }]);
  assert.equal(h.calls.rpc.length, 0);
});

test("index.ts wires only this module: getUser with the caller's JWT, the service key for the RPC, no answer path", () => {
  const src = read("supabase/functions/course-progress/index.ts");
  assert.match(src, /from "\.\/course-progress\.ts"/);
  assert.match(src, /supabase\.auth\.getUser\(\)/);
  assert.match(src, /headers: \{ Authorization: authorization \}/);
  assert.match(src, /createClient\(Deno\.env\.get\("SUPABASE_URL"\)!, serviceKey\(\), ADMIN_CLIENT_OPTIONS\)/);
  const code = src.replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /process-event|get-next-question|\.rpc\(|\.from\(/, "no direct DB access and no answer-path import");
  const mod = read("supabase/functions/course-progress/course-progress.ts");
  assert.equal(mod.match(/\.rpc\(/g).length, 1, "exactly one RPC call site");
  assert.doesNotMatch(mod, /^import /m, "the pure module imports nothing");
});

test("config.toml registers course-progress like the other functions", () => {
  const toml = read("supabase/config.toml");
  const block = /\[functions\.course-progress\]\n([\s\S]*?)(?:\n\[|$)/.exec(toml);
  assert.ok(block, "registered");
  assert.match(block[1], /^enabled = true$/m);
  assert.match(block[1], /^verify_jwt = false$/m);
  assert.match(block[1], /^import_map = "\.\/functions\/course-progress\/deno\.json"$/m);
  assert.match(block[1], /^entrypoint = "\.\/functions\/course-progress\/index\.ts"$/m);
  assert.equal(JSON.parse(read("supabase/functions/course-progress/deno.json")).verify_jwt, false);
});
