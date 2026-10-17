// Security regression: the question scope (grade + domains) is derived on the server from the pupil's
// profile — never from the request (audit finding E2, 2026-10-16). Offline — the real scope module the
// Edge Function runs, plus a source check of get-next-question.
//
// THE EXPLOIT THIS CLOSES
// request_repeat_question(p_grade, p_domains) was callable by the pupil with any scope. Naming an
// empty one ("no unserved question left here") made it hand out a repeat while unanswered questions
// remained — answer, ask again, without end, 2 XP each. get-next-question also took the grade from the
// request body. Now the grade is profiles.selected_grade, the domains are profiles.active_domains
// (the teacher's filter) intersected with the subject, and the request may only pick "historie" or
// "engelsk" — each a whole, fixed domain set that cannot be shrunk to a mini-scope.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { deriveQuestionScope, HISTORY_DOMAINS, ENGLISH_DOMAIN } from "../../supabase/functions/get-next-question/scope.ts";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const INDEX_CODE = stripComments(readFileSync(join(REPO, "supabase/functions/get-next-question/index.ts"), "utf8"));

test("the grade is the profile's, whatever the request says", () => {
  assert.equal(deriveQuestionScope({ selected_grade: 7 }, "historie").grade, 7);
  assert.equal(deriveQuestionScope({ selected_grade: null }, "historie").grade, null);
  // Malformed profile values never become a scope.
  assert.equal(deriveQuestionScope({ selected_grade: "1" }, "historie").grade, null);
  assert.equal(deriveQuestionScope({ selected_grade: 6.5 }, "historie").grade, null);
  assert.equal(deriveQuestionScope(null, "historie").grade, null);
});

test("the teacher's active domains are respected for historie", () => {
  const s = deriveQuestionScope({ active_domains: ["vikings", "english", "cold_war"] }, "historie");
  assert.deepEqual(s.subjectDomains, ["vikings", "cold_war"], "teacher filter minus English");
  assert.deepEqual(s.releaseDomains, [...HISTORY_DOMAINS], "fagskift uses subject-level domains, never the teacher filter");
});

test("an unfiltered pupil gets every history domain; engelsk gets English only", () => {
  assert.deepEqual(deriveQuestionScope({ active_domains: null }, "historie").subjectDomains, [...HISTORY_DOMAINS]);
  assert.deepEqual(deriveQuestionScope({ active_domains: [] }, "historie").subjectDomains, [...HISTORY_DOMAINS]);
  assert.deepEqual(deriveQuestionScope({ active_domains: ["english"] }, "historie").subjectDomains, [...HISTORY_DOMAINS],
    "an English-only teacher filter leaves historie unfiltered, as before");
  const en = deriveQuestionScope({ active_domains: ["vikings"] }, "engelsk");
  assert.deepEqual(en.subjectDomains, [ENGLISH_DOMAIN]);
  assert.deepEqual(en.releaseDomains, [ENGLISH_DOMAIN]);
});

test("the request cannot shrink the scope to an artificial mini-scope", () => {
  // Whatever a client sends as "subject", the result is one of the two whole, fixed domain sets.
  const allowed = [JSON.stringify([...HISTORY_DOMAINS]), JSON.stringify([ENGLISH_DOMAIN])];
  for (const subject of [undefined, null, "", "vikings", ["vikings"], { p_domains: ["nope"] }, "ENGELSK", 7]) {
    const s = deriveQuestionScope({ selected_grade: 7, active_domains: null }, subject);
    assert.ok(allowed.includes(JSON.stringify(s.subjectDomains)), `subject ${JSON.stringify(subject)} narrowed the scope`);
    assert.equal(s.grade, 7);
  }
  // A malformed teacher filter is ignored rather than turned into a scope.
  assert.deepEqual(deriveQuestionScope({ active_domains: [1, 2] }, "historie").subjectDomains, [...HISTORY_DOMAINS]);
});

// ── get-next-question wiring (source level) ─────────────────────────────────────────────────────
test("get-next-question takes the scope from the profile and ignores body.selected_grade", () => {
  assert.match(INDEX_CODE, /import \{ deriveQuestionScope \} from "\.\/scope\.ts";/);
  assert.match(INDEX_CODE, /\.from\("profiles"\)\s*\.select\("active_domains, selected_grade"\)\s*\.eq\("id", student_id\)/);
  assert.match(INDEX_CODE, /const scope = deriveQuestionScope\(profileData, body\?\.subject\);/);
  assert.equal(/body\?\.selected_grade|body\.selected_grade/.test(INDEX_CODE), false, "the request body never sets the grade");
  assert.equal(/body\?\.(p_)?domains|body\.(p_)?domains|active_domains:\s*body/.test(INDEX_CODE), false);
  assert.match(INDEX_CODE, /const selectedGrade  = scope\.grade;/);
  assert.match(INDEX_CODE, /const subjectDomains = scope\.subjectDomains;/);
});

test("new questions and repeats use the same server-derived scope, for the verified student", () => {
  assert.match(INDEX_CODE,
    /"get_unserved_questions_for_student",\s*\{\s*p_student_id: student_id,\s*p_grade:\s+selectedGrade,\s*p_domains:\s+subjectDomains,\s*\}/);
  assert.match(INDEX_CODE,
    /"request_repeat_question_for_student",\s*\{ p_student_id: student_id, p_grade: selectedGrade, p_domains: subjectDomains \}/);
  assert.match(INDEX_CODE, /const student_id = user\.id;/);
  assert.match(INDEX_CODE, /"release_open_question_outside",\s*\{ p_domains: scope\.releaseDomains \}/);
});
