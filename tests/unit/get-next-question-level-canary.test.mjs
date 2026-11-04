// The per-pupil canary of the level engine (risk R2, docs/operations/level-engine-rollout.md §2.6).
//
// LEVEL_ENGINE = "canary" turns the engine on only for a verified pupil on the allowlist
// LEVEL_ENGINE_CANARY_STUDENT_IDS; everyone else, and every bad allowlist, gets the off path call for
// call. The parsing rules are tested on parseCanaryAllowlist / resolveLevelEngineForStudent; the
// behaviour on the real index.ts through the same harness as the release gate, where "the off path" is
// the same request with LEVEL_ENGINE unset (the release gate proves that equals version 179).
// The UUIDs below are synthetic; none is a real pupil.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  CANARY_ALLOWLIST_ENV, CANARY_MAX_RAW_LENGTH, CANARY_MAX_STUDENTS, LEVEL_ENGINE_CANARY,
  parseCanaryAllowlist, resolveLevelEngine, resolveLevelEngineForStudent,
} from "../../supabase/functions/get-next-question/level-flow.ts";
import {
  B_FUNCTIONS, LEVEL_TABLES, MIX_VALUES, OFF_VALUES, SCENARIOS, SUBJECTS, loadHandler, runCase,
} from "./helpers/gnq-parity-harness.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const loaded = loadHandler(join(ROOT, "supabase", "functions", "get-next-question", "index.ts"));
loaded.catch(() => {});

const ALLOWED = "1a2b3c4d-0000-4000-8000-00000000a001";
const ALLOWED_2 = "1a2b3c4d-0000-4000-8000-00000000a002";
const OUTSIDE = "1a2b3c4d-0000-4000-8000-00000000b001";
const VALID_LIST = JSON.stringify([ALLOWED, ALLOWED_2]);
const ELEVEN = Array.from({ length: 11 }, (_, i) => `1a2b3c4d-0000-4000-8000-${String(i + 1).padStart(12, "0")}`);
const UUID_ANYWHERE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// Every allowlist that must close to "off" for everyone, with the reason.
const CLOSED = Object.freeze([
  ["missing", undefined],
  ["empty string", ""],
  ["empty array", "[]"],
  ["not JSON", "not json"],
  ["truncated JSON", `["${ALLOWED}"`],
  ["JSON string, not array", JSON.stringify(ALLOWED)],
  ["JSON object", JSON.stringify({ ids: [ALLOWED] })],
  ["comma-separated, not JSON", `${ALLOWED},${ALLOWED_2}`],
  ["number entry", JSON.stringify([ALLOWED, 42])],
  ["null entry", JSON.stringify([ALLOWED, null])],
  ["nested array", JSON.stringify([[ALLOWED]])],
  ["not a UUID", JSON.stringify([ALLOWED, "stu-1"])],
  ["UUID without dashes", JSON.stringify([ALLOWED.replaceAll("-", "")])],
  ["UUID with braces", JSON.stringify([`{${ALLOWED}}`])],
  ["uppercase UUID", JSON.stringify([ALLOWED.toUpperCase()])],
  ["UUID one char short", JSON.stringify([ALLOWED.slice(0, -1)])],
  ["non-hex UUID", JSON.stringify([ALLOWED.replace(/a001$/, "g001")])],
  ["nil UUID", JSON.stringify(["00000000-0000-0000-0000-000000000000"])],
  ["leading space inside an entry", JSON.stringify([` ${ALLOWED}`])],
  ["trailing newline inside an entry", JSON.stringify([`${ALLOWED}\n`])],
  ["11 distinct UUIDs", JSON.stringify(ELEVEN)],
  ["11 distinct UUIDs incl. the pupil", JSON.stringify([ALLOWED, ...ELEVEN.slice(0, 10)])],
  ["longer than the raw limit", JSON.stringify(Array(30).fill(ALLOWED))],
]);

// ── 1–4. The allowlist parser ────────────────────────────────────────────────────────────────────────

test("allowlist: missing, empty and invalid JSON close (null)", () => {
  for (const raw of [undefined, null, "", "[]", "not json", `["${ALLOWED}"`, "{}", "null", "true", "1", JSON.stringify(ALLOWED),
    JSON.stringify({ ids: [ALLOWED] })]) {
    assert.equal(parseCanaryAllowlist(raw), null, String(raw));
  }
  // Only a string is read; a value that is not text (never the case for an Edge secret) closes too.
  assert.equal(parseCanaryAllowlist([ALLOWED]), null);
});

test("allowlist: any invalid UUID closes the whole list, never just drops the entry", () => {
  for (const [label, raw] of CLOSED.filter(([l]) => /UUID|entry|nested/.test(l) && !/11 distinct/.test(l))) {
    assert.equal(parseCanaryAllowlist(raw), null, label);
  }
});

test("allowlist: duplicates count once; JSON whitespace between entries is fine, inside an entry it is not", () => {
  assert.deepEqual([...parseCanaryAllowlist(JSON.stringify([ALLOWED, ALLOWED, ALLOWED_2, ALLOWED]))].sort(), [ALLOWED, ALLOWED_2]);
  assert.deepEqual([...parseCanaryAllowlist(`  [\n  "${ALLOWED}" ,\t"${ALLOWED_2}"\n]\n `)].sort(), [ALLOWED, ALLOWED_2]);
  assert.equal(parseCanaryAllowlist(JSON.stringify([` ${ALLOWED}`])), null);
  assert.equal(parseCanaryAllowlist(JSON.stringify([`${ALLOWED} `])), null);
  assert.equal(parseCanaryAllowlist(JSON.stringify([`\t${ALLOWED}`])), null);
  // Ten copies of one id are one pupil, well under the maximum.
  assert.equal(parseCanaryAllowlist(JSON.stringify(Array(10).fill(ALLOWED))).size, 1);
});

test(`allowlist: at most ${CANARY_MAX_STUDENTS} distinct UUIDs; more closes for everyone`, () => {
  assert.equal(CANARY_MAX_STUDENTS, 10);
  assert.equal(parseCanaryAllowlist(JSON.stringify(ELEVEN.slice(0, 10))).size, 10);
  assert.equal(parseCanaryAllowlist(JSON.stringify(ELEVEN)), null);
  // Ten distinct plus duplicates is still ten.
  assert.equal(parseCanaryAllowlist(JSON.stringify([...ELEVEN.slice(0, 10), ELEVEN[0], ELEVEN[9]])).size, 10);
  // The raw value has a hard length limit too, before JSON.parse.
  const atLimit = JSON.stringify(ELEVEN.slice(0, 10));
  assert.ok(atLimit.length <= CANARY_MAX_RAW_LENGTH);
  assert.equal(parseCanaryAllowlist(" ".repeat(CANARY_MAX_RAW_LENGTH - atLimit.length) + atLimit).size, 10);
  assert.equal(parseCanaryAllowlist(" ".repeat(CANARY_MAX_RAW_LENGTH - atLimit.length + 1) + atLimit), null);
  for (const [label, raw] of CLOSED) assert.equal(parseCanaryAllowlist(raw), null, label);
});

test("resolveLevelEngineForStudent: v1 and the off values keep their meaning and never read the allowlist", () => {
  for (const flag of [...OFF_VALUES.filter((v) => v !== LEVEL_ENGINE_CANARY), null, "Canary", "canary ", " canary", "CANARY"]) {
    assert.equal(resolveLevelEngineForStudent(flag, () => assert.fail(`allowlist read under ${flag}`), ALLOWED), resolveLevelEngine(flag));
    assert.equal(resolveLevelEngineForStudent(flag, () => assert.fail(`allowlist read under ${flag}`), ALLOWED), "off", String(flag));
  }
  assert.equal(resolveLevelEngineForStudent("v1", () => assert.fail("allowlist read under v1"), OUTSIDE), "v1");
  // canary: only the listed, verified id; a bad list closes for everyone, also the listed id.
  assert.equal(resolveLevelEngineForStudent("canary", () => VALID_LIST, ALLOWED), "v1");
  assert.equal(resolveLevelEngineForStudent("canary", () => VALID_LIST, ALLOWED_2), "v1");
  assert.equal(resolveLevelEngineForStudent("canary", () => VALID_LIST, OUTSIDE), "off");
  assert.equal(resolveLevelEngineForStudent("canary", () => VALID_LIST, ALLOWED.toUpperCase()), "off");
  assert.equal(resolveLevelEngineForStudent("canary", () => VALID_LIST, undefined), "off");
  assert.equal(resolveLevelEngineForStudent("canary", () => VALID_LIST, { id: ALLOWED }), "off");
  for (const [label, raw] of CLOSED) assert.equal(resolveLevelEngineForStudent("canary", () => raw, ALLOWED), "off", label);
  assert.equal(CANARY_ALLOWLIST_ENV, "LEVEL_ENGINE_CANARY_STUDENT_IDS");
});

// ── 5–8. The real index.ts ──────────────────────────────────────────────────────────────────────────

const touchesLevel = (r) => r.calls.some((c) => B_FUNCTIONS.includes(c.name) || LEVEL_TABLES.includes(c.name))
  || r.logs.some((l) => l.includes("LEVEL_ENGINE:"));
const roleReads = (r) => r.calls.filter((c) => c.kind === "from" && c.name === "profiles" && c.ops.some((o) => o[0] === "select" && o[1] === "role"));
const studentIdArgs = (r) => r.calls.flatMap((c) => c.ops ?? []).flatMap((o) =>
  o[0] === "args" ? [o[1]?.p_student_id] : o[0] === "eq" && (o[1] === "student_id" || o[1] === "id") && typeof o[2] === "string" && UUID_ANYWHERE.test(o[2]) ? [o[2]] : [],
).filter((v) => v !== undefined);

// 8. No personal data in any log line: no UUID at all (so neither the pupil, the allowlist nor any
// other id), no raw allowlist value, no allowlist variable name.
function assertNoPersonalData(r, label, raw) {
  for (const l of r.logs) {
    assert.doesNotMatch(l, UUID_ANYWHERE, `${label}: a UUID in the log: ${l.slice(0, 80)}`);
    assert.ok(!l.includes(CANARY_ALLOWLIST_ENV), `${label}: allowlist name in the log`);
    if (typeof raw === "string" && raw.length > 2) assert.ok(!l.includes(raw), `${label}: raw allowlist in the log`);
  }
}

test("off parity: every closed allowlist, and \"canary\" for a pupil outside a valid list, is the unset path call for call", async () => {
  const { handler } = await loaded;
  let runs = 0;
  const lists = [...CLOSED, ["valid list without this pupil", VALID_LIST]];
  for (const [label, raw] of lists) for (const user of [undefined, { id: OUTSIDE }, { id: ALLOWED }]) {
    // A listed pupil gets the engine only from a valid list; skip that one combination here (test 5).
    if (user?.id === ALLOWED && raw === VALID_LIST) continue;
    for (const mix of MIX_VALUES) for (const subject of SUBJECTS) for (const s of SCENARIOS) {
      const name = `${label} user=${user?.id ?? "stu-1"} mix=${mix} ${subject} ${s}`;
      const off = await runCase(handler, { mix, level: undefined, subject, scenario: s, user });
      const got = await runCase(handler, { mix, level: LEVEL_ENGINE_CANARY, canaryIds: raw, subject, scenario: s, user });
      assert.deepEqual(got, off, name);
      assert.equal(touchesLevel(got), false, `${name}: level engine touched`);
      assert.equal(roleReads(got).length, 0, `${name}: role read on the off path`);
      assertNoPersonalData(got, name, raw);
      runs++;
    }
  }
  assert.equal(runs, (lists.length * 3 - 1) * MIX_VALUES.length * SUBJECTS.length * SCENARIOS.length);
});

test("allowed pupil: \"canary\" takes the level path, exactly as \"v1\" does for that pupil, plus one own-profile role read", async () => {
  const { handler } = await loaded;
  for (const mix of MIX_VALUES) for (const subject of SUBJECTS) for (const s of SCENARIOS) {
    const name = `mix=${mix} ${subject} ${s}`;
    const user = { id: ALLOWED };
    const v1 = await runCase(handler, { mix, level: "v1", subject, scenario: s, user });
    const got = await runCase(handler, { mix, level: LEVEL_ENGINE_CANARY, canaryIds: VALID_LIST, subject, scenario: s, user });
    const reads = roleReads(got);
    assert.equal(reads.length, 1, `${name}: one role read`);
    assert.equal(reads[0].client, "user", `${name}: the role is read as the pupil (RLS), not the backend`);
    assert.deepEqual(reads[0].ops, [["select", "role"], ["eq", "id", ALLOWED], ["maybeSingle"]], name);
    assert.deepEqual({ ...got, calls: got.calls.filter((c) => !reads.includes(c)) }, v1, name);
    assertNoPersonalData(got, name, VALID_LIST);
  }
  // The level path itself: B's functions with the verified id, and the level log line.
  const got = await runCase(handler, { mix: undefined, level: LEVEL_ENGINE_CANARY, canaryIds: VALID_LIST, subject: "historie", scenario: "new", user: { id: ALLOWED } });
  assert.deepEqual(got.calls.filter((x) => x.kind === "rpc").map((x) => x.name),
    ["release_open_question_outside", "advance_student_level", "get_level_questions_for_student"]);
  assert.ok(got.logs.some((l) => l.startsWith("LOG LEVEL_ENGINE: ")));
  const repeat = await runCase(handler, { mix: undefined, level: LEVEL_ENGINE_CANARY, canaryIds: VALID_LIST, subject: "engelsk", scenario: "repeat", user: { id: ALLOWED_2 } });
  assert.ok(repeat.calls.some((x) => x.name === "request_repeat_level_question_for_student"));
  assert.ok(!repeat.calls.some((x) => x.name === "request_repeat_question_for_student"));
});

test("allowed id that is not a pupil (teacher, admin, no profile row, other role): off path, after the one role read", async () => {
  const { handler } = await loaded;
  for (const role of ["teacher", "super_admin", null, "", "Student"]) for (const s of SCENARIOS) {
    const name = `role=${role} ${s}`;
    const user = { id: ALLOWED };
    const off = await runCase(handler, { mix: undefined, level: undefined, subject: "historie", scenario: s, user, role });
    const got = await runCase(handler, { mix: undefined, level: LEVEL_ENGINE_CANARY, canaryIds: VALID_LIST, subject: "historie", scenario: s, user, role });
    const reads = roleReads(got);
    assert.equal(reads.length, 1, name);
    assert.deepEqual({ ...got, calls: got.calls.filter((c) => !reads.includes(c)) }, off, name);
    assert.equal(touchesLevel(got), false, name);
  }
});

test("a failed role read for an allowed pupil is a loud 500, never a silent level path", async () => {
  const { handler } = await loaded;
  const patch = (kind, name, ops, result) =>
    kind === "from" && name === "profiles" && ops.some((o) => o[0] === "select" && o[1] === "role") ? { data: null, error: { message: "role read failed" } } : result;
  const got = await runCase(handler, { mix: undefined, level: LEVEL_ENGINE_CANARY, canaryIds: VALID_LIST, subject: "historie", scenario: "new", user: { id: ALLOWED }, patch });
  assert.equal(got.status, 500);
  assert.equal(touchesLevel(got), false);
  assertNoPersonalData(got, "role error", VALID_LIST);
});

test("spoofing: an allowlisted id in the request body or in user/app metadata has no effect", async () => {
  const { handler } = await loaded;
  const spoofBody = {
    student_id: ALLOWED, studentId: ALLOWED, p_student_id: ALLOWED, user_id: ALLOWED, id: ALLOWED, sub: ALLOWED,
    user: { id: ALLOWED }, session_context: { wave_phase: "challenge", student_id: ALLOWED },
  };
  const spoofUser = {
    id: OUTSIDE, aud: "authenticated", role: "authenticated",
    user_metadata: { id: ALLOWED, student_id: ALLOWED, sub: ALLOWED }, app_metadata: { student_id: ALLOWED, canary: true },
  };
  for (const mix of MIX_VALUES) for (const s of SCENARIOS) {
    // A pupil outside the list claims to be a listed one: still the off path, with its own id.
    const offBody = await runCase(handler, { mix, level: undefined, subject: "historie", scenario: s, user: { id: OUTSIDE } });
    const viaBody = await runCase(handler, { mix, level: LEVEL_ENGINE_CANARY, canaryIds: VALID_LIST, subject: "historie", scenario: s, user: { id: OUTSIDE }, extraBody: spoofBody });
    const viaMeta = await runCase(handler, { mix, level: LEVEL_ENGINE_CANARY, canaryIds: VALID_LIST, subject: "historie", scenario: s, user: spoofUser });
    const offMeta = await runCase(handler, { mix, level: undefined, subject: "historie", scenario: s, user: spoofUser });
    for (const [label, got, off] of [["body", viaBody, offBody], ["metadata", viaMeta, offMeta]]) {
      assert.equal(touchesLevel(got), false, `${label} mix=${mix} ${s}`);
      assert.equal(roleReads(got).length, 0, `${label} mix=${mix} ${s}`);
      assert.ok(!studentIdArgs(got).includes(ALLOWED), `${label} mix=${mix} ${s}: the claimed id reached the backend`);
      if (label === "metadata") assert.deepEqual(got, off, `${label} mix=${mix} ${s}`);
    }
    // The body spoof changes nothing beyond what the unspoofed off request does (the body is ignored).
    const plain = await runCase(handler, { mix, level: LEVEL_ENGINE_CANARY, canaryIds: VALID_LIST, subject: "historie", scenario: s, user: { id: OUTSIDE } });
    assert.deepEqual(viaBody, plain, `body mix=${mix} ${s}`);
    assert.deepEqual(plain, offBody, `plain mix=${mix} ${s}`);
    // A listed pupil naming another pupil in the body: the level path, for its OWN id only.
    const own = await runCase(handler, { mix, level: LEVEL_ENGINE_CANARY, canaryIds: VALID_LIST, subject: "historie", scenario: s, user: { id: ALLOWED },
      extraBody: { ...spoofBody, student_id: OUTSIDE, p_student_id: OUTSIDE, user_id: OUTSIDE } });
    const ids = studentIdArgs(own);
    assert.ok(ids.length > 0, `own mix=${mix} ${s}`);
    assert.deepEqual([...new Set(ids)], [ALLOWED], `own mix=${mix} ${s}`);
  }
});

test("the negative control: the parity comparison does catch the canary when the pupil is listed", async () => {
  const { handler } = await loaded;
  const user = { id: ALLOWED };
  const off = await runCase(handler, { mix: undefined, level: undefined, subject: "historie", scenario: "new", user });
  const got = await runCase(handler, { mix: undefined, level: LEVEL_ENGINE_CANARY, canaryIds: VALID_LIST, subject: "historie", scenario: "new", user });
  assert.notDeepEqual(got, off);
  assert.ok(touchesLevel(got));
  // … and the personal-data check is not vacuous: a log line with the pupil's id would fail it.
  assert.throws(() => assertNoPersonalData({ logs: [`LOG x ${ALLOWED}`] }, "control", VALID_LIST));
  assert.throws(() => assertNoPersonalData({ logs: [`LOG x ${VALID_LIST}`] }, "control", VALID_LIST));
});
