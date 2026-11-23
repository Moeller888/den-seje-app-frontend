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
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
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
const EDGE = {
  old: (await loadHandler(materialise(PRODUCTION_EDGE))).handler,
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

const servedCourse = (r) => r.status === 200 && JSON.parse(r.body).content?.question === "Q course";
const ordinaryRequest = (edge, db, situation, level) =>
  runCase(EDGE[edge], { subject: "historie", scenario: situation === "repeat" ? "repeat" : "new", level, patch: database(db, situation) });

const RESULTS = {};
for (const edge of ["old", "new"]) {
  for (const db of ["old", "new"]) {
    test(`${edge} Edge + ${db} database: what the ordinary quiz does with course items`, async () => {
      const r = {
        classic: servedCourse(await ordinaryRequest(edge, db, "candidates", undefined)),
        level: servedCourse(await ordinaryRequest(edge, db, "candidates", "v1")),
        repeatServed: servedCourse(await ordinaryRequest(edge, db, "repeat", undefined)),
        // The reopen is the DATABASE's side effect (proven in PGlite): it happens before any Edge code sees the row.
        repeatReopened: db === "old",
        openRoundDeleted: db === "old",
        openRoundServedToQuiz: servedCourse(await ordinaryRequest(edge, db, "open-course-round", undefined)),
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
