// D-383 deployment order (F1): the four combinations of Edge Function and database, with the code that would really
// meet. "Old Edge" is the get-next-question production runs (a7450b0f, docs/operations/level-engine-rollout.md),
// materialised from git; "new Edge" is this tree. The database side is what the PGlite suite
// (course-items-out-of-ordinary-quiz-migration-run) proves each body does with a course round:
//   OLD database: the repeat RPCs REOPEN an answered course round (its answer is erased), the subject-switch release
//                 DELETES or closes an open course round, and levelled course items are level candidates;
//   NEW database: none of the three.
// Here each Edge version gets exactly the backend answers its database would give, and the test records what the
// pupil and the data would experience. The result decides the order: see the last test.
//
// HONEST LIMITS: the database answers are modelled from the PGlite runs, not served by PostgREST; the real stack
// runs only new Edge + new database (introduction lane) and new Edge + old database (the production-mirror lane, where
// the migration is not replayed). Old Edge against a real new database is not run anywhere: the isolated workflow
// serves one function version per lane.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadHandler, runCase } from "./helpers/gnq-parity-harness.mjs";
import { ENTRY, gitReader, graphFiles } from "../../tools/edge/gnq-release.mjs";

const PRODUCTION_EDGE = "a7450b0f";
const NEW_INDEX = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "supabase", "functions", "get-next-question", "index.ts");
function materialise(commit) {
  const read = gitReader(commit);
  const dir = mkdtempSync(join(tmpdir(), `gnq-${commit}-`));
  for (const f of graphFiles(read)) {
    const out = join(dir, "supabase", f);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, read(f));
  }
  return join(dir, "supabase", ENTRY);
}
// Production's Edge is read from git where the commit exists (a full clone): then it runs LIVE and must still equal the
// recorded fixture. CI checks out shallow, without a7450b0f: then the fixture — written by this test from the live run
// (UPDATE_COURSE_MATRIX_FIXTURE=1), like tests/fixtures/gnq-v179-parity.json — stands in for it. The new Edge always runs.
const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "course-items-old-edge-a7450b0f.json");
const haveCommit = (() => {
  try { execFileSync("git", ["cat-file", "-e", `${PRODUCTION_EDGE}^{commit}`], { stdio: "ignore" }); return true; } catch { return false; }
})();
const EDGE = {
  old: haveCommit ? (await loadHandler(materialise(PRODUCTION_EDGE))).handler : null,
  new: (await loadHandler(NEW_INDEX)).handler,
};

const Q = (id, metadata = {}) => ({
  id, content: { question: "Q " + id, options: ["a", "b"], correct: "a" }, answer_format: "mc", answer_type: "short",
  metadata, difficulty_band: 3, learning_objective: "vikings", difficulty_level: 3000,
});
const COURSE = Q("course", { learning_step: "guided_practice" });
const CANDIDATE_RPCS = ["get_unserved_questions_for_student", "get_question_candidates_for_student", "get_level_questions_for_student"];
const isOpenRead = (ops) => ops.some((o) => o[0] === "eq" && o[1] === "answered" && o[2] === false);

/** The backend answers a database version gives in one situation. */
function database(version, situation) {
  return (kind, name, ops, result) => {
    if (situation === "candidates" && kind === "rpc" && CANDIDATE_RPCS.includes(name)) {
      // The level candidates exclude course items in the NEW database; the shared classic RPCs return them in both.
      const rows = name === "get_level_questions_for_student" && version === "new" ? [] : [COURSE];
      return { data: rows, error: null };
    }
    if (situation === "repeat") {
      if (kind === "rpc" && CANDIDATE_RPCS.includes(name)) return { data: [], error: null };
      // OLD repeat bodies reopen the pupil's wrong course answer; NEW ones never do (and nothing else is left).
      if (kind === "rpc" && name.startsWith("request_repeat")) return { data: version === "old" ? "rep-course" : null, error: null };
      if (kind === "from" && name === "question_instances" && ops.some((o) => o[0] === "eq" && o[1] === "id" && o[2] === "rep-course")) {
        return { data: [{ id: "rep-course", repeat_count: 1, questions: { ...COURSE, is_active: true } }], error: null };
      }
    }
    if (situation === "open-course-round") {
      // The pupil left an open course round and asks the ordinary quiz in another subject. The OLD release deletes it
      // first (1 released, nothing due); the NEW release keeps it (0 released, it is due).
      if (kind === "rpc" && name === "release_open_question_outside") return { data: version === "old" ? 1 : 0, error: null };
      if (kind === "from" && name === "question_instances" && isOpenRead(ops)) {
        return { data: version === "old" ? [] : [{ id: "open-course", repeat_count: 0, next_review_at: "t", questions: { ...COURSE, is_active: true } }], error: null };
      }
      if (kind === "rpc" && CANDIDATE_RPCS.includes(name)) return { data: [], error: null };
    }
    return result;
  };
}

const ordinaryRequest = (edge, db, situation, level) =>
  runCase(EDGE[edge], { subject: "historie", scenario: situation === "repeat" ? "repeat" : "new", level, patch: database(db, situation) });
/** What one Edge version answers in the four situations (status and body: what the pupil gets). */
async function measure(edge, db) {
  const answers = {};
  for (const [key, situation, level] of [["classic", "candidates", undefined], ["level", "candidates", "v1"], ["repeat", "repeat", undefined], ["openRound", "open-course-round", undefined]]) {
    const r = await ordinaryRequest(edge, db, situation, level);
    answers[key] = { status: r.status, body: r.body };
  }
  return answers;
}
const fixture = existsSync(FIXTURE) ? JSON.parse(readFileSync(FIXTURE, "utf8")) : null;
const OLD_ANSWERS = {};
if (haveCommit) {
  for (const db of ["old", "new"]) OLD_ANSWERS[db] = await measure("old", db);
  if (process.env.UPDATE_COURSE_MATRIX_FIXTURE === "1") {
    writeFileSync(FIXTURE, JSON.stringify({ source: `${PRODUCTION_EDGE} (the get-next-question deployed in production, docs/operations/level-engine-rollout.md)`, answers: OLD_ANSWERS }, null, 1) + "\n");
  }
} else {
  assert.ok(fixture, `${PRODUCTION_EDGE} is not in this checkout and ${FIXTURE} is missing`);
  Object.assign(OLD_ANSWERS, fixture.answers);
}
const servedCourseBody = (a) => a.status === 200 && JSON.parse(a.body).content?.question === "Q course";

test("production's Edge: the live run equals the recorded fixture (where the commit is available)", { skip: !haveCommit && "shallow checkout: the fixture stands in" }, () => {
  assert.ok(fixture, "the fixture exists (UPDATE_COURSE_MATRIX_FIXTURE=1 writes it)");
  assert.match(fixture.source, new RegExp(`^${PRODUCTION_EDGE} `));
  assert.deepEqual(OLD_ANSWERS, fixture.answers);
});

const RESULTS = {};
for (const edge of ["old", "new"]) {
  for (const db of ["old", "new"]) {
    test(`${edge} Edge + ${db} database: what the ordinary quiz does with course items`, async () => {
      const a = edge === "old" ? OLD_ANSWERS[db] : await measure("new", db);
      const r = {
        classic: servedCourseBody(a.classic),
        level: servedCourseBody(a.level),
        repeatServed: servedCourseBody(a.repeat),
        // The reopen is the DATABASE's side effect (proven in PGlite): it happens before any Edge code sees the row.
        repeatReopened: db === "old",
        openRoundDeleted: db === "old",
        openRoundServedToQuiz: servedCourseBody(a.openRound),
      };
      RESULTS[`${edge}/${db}`] = r;
      if (edge === "new") {
        assert.equal(r.classic, false, "new Edge never serves a course candidate to the ordinary quiz");
        assert.equal(r.level, false);
        assert.equal(r.repeatServed, false, "new Edge does not serve a course round an old repeat body reopened");
        assert.equal(r.openRoundServedToQuiz, false);
      } else {
        assert.equal(r.classic, true, "production's Edge serves a course candidate (the gap D-383 closes)");
        assert.equal(r.level, db === "old", "the NEW database keeps levelled course items out even for old Edge");
        assert.equal(r.repeatServed, db === "old");
        assert.equal(r.openRoundServedToQuiz, db === "new", "old Edge serves an open course round the new database kept");
      }
    });
  }
}

test("the order: the migration first, then the Edge Function — and both before any course content reaches production", () => {
  assert.equal(Object.keys(RESULTS).length, 4);
  // Edge first (new Edge + old database): DATA IS DESTROYED — a reopened course answer, a deleted open course round.
  assert.deepEqual([RESULTS["new/old"].repeatReopened, RESULTS["new/old"].openRoundDeleted], [true, true]);
  // Database first (old Edge + new database): nothing is destroyed; old Edge can still SERVE a course item or an open
  // course round to the ordinary quiz until it is replaced — wrong context, but recorded, never lost.
  assert.deepEqual([RESULTS["old/new"].repeatReopened, RESULTS["old/new"].openRoundDeleted], [false, false]);
  assert.equal(RESULTS["old/new"].classic || RESULTS["old/new"].openRoundServedToQuiz, true);
  // Only new + new is free of both. Neither transition is harmless while course rounds exist, so the two steps must
  // follow each other before any course item is seeded or Lærligverse is switched on for pupils.
  const clean = (r) => !r.classic && !r.level && !r.repeatServed && !r.repeatReopened && !r.openRoundDeleted && !r.openRoundServedToQuiz;
  assert.deepEqual(Object.entries(RESULTS).filter(([, r]) => clean(r)).map(([k]) => k), ["new/new"]);
});
