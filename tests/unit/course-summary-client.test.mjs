// D-362 / F-07 (owner 2026-11-15): js/course-summary.js — the pupil's course summary and course choice in the browser.
// Proves: only the server's figures are shown (nothing hard-coded, no mastery), a button only when its action can be
// carried out, each choice fires once, HTML in a label stays text, an older backend (no table) means "no course", and
// "Gentagelse" only for a repeated COURSE round. The wiring in app.js is pinned at source level.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as client from "../../js/course-summary.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const APP = readFileSync(join(ROOT, "app.js"), "utf8");

function fakeElement(tagName) {
  const attrs = new Map();
  const el = {
    tagName: tagName.toUpperCase(), id: "", className: "", children: [], _text: "", onclick: null,
    set textContent(v) { el._text = String(v); el.children = []; },
    get textContent() { return el._text; },
    set innerHTML(_v) { throw new Error("innerHTML must never be used"); },
    setAttribute(n, v) { attrs.set(n, String(v)); },
    getAttribute(n) { return attrs.has(n) ? attrs.get(n) : null; },
    appendChild(c) { el.children.push(c); return c; },
  };
  return el;
}
const doc = { createElement: (t) => fakeElement(t) };
const byId = (node, id) => {
  if (node.id === id) return node;
  for (const c of node.children ?? []) { const f = byId(c, id); if (f) return f; }
  return null;
};
const all = (node, tag, out = []) => { if (node.tagName === tag.toUpperCase()) out.push(node); for (const c of node.children ?? []) all(c, tag, out); return out; };

const PAYLOAD = {
  step: "course_complete",
  course: { id: "pilot_d362", title: "Grundloven af 1849", topics: ["Enevælde og indskrænket monarki", "Valgretten i 1849"] },
  summary: { total: 7, completed: 7, first_try_correct: 4, correct_after_repetition: 2, needs_support: 1,
    items: [{ skill: "Styreformen før 1849: enevælde", outcome: "first_try" }, { skill: "Magtens tredeling i § 2", outcome: "needs_support" }, { skill: "<b>x</b>", outcome: "after_repetition" }] },
  acknowledged: false,
  choices: { practice: true, history: true, hub: true },
};

test("readCourseComplete: the server payload or null; malformed figures are refused", () => {
  const s = client.readCourseComplete(PAYLOAD);
  assert.deepEqual([s.total, s.completed, s.firstTry, s.afterRepetition, s.needsSupport, s.acknowledged], [7, 7, 4, 2, 1, false]);
  assert.equal(client.readCourseComplete({ ...PAYLOAD, step: "no_questions" }), null);
  assert.equal(client.readCourseComplete({ ...PAYLOAD, summary: { ...PAYLOAD.summary, total: -1 } }), null);
  assert.equal(client.readCourseComplete({ ...PAYLOAD, summary: { ...PAYLOAD.summary, completed: "7" } }), null);
  assert.equal(client.readCourseComplete({ ...PAYLOAD, course: { id: "pilot_d362", title: " " } }), null);
  assert.equal(client.readCourseComplete(null), null);
  const odd = client.readCourseComplete({ ...PAYLOAD, summary: { ...PAYLOAD.summary, items: [{ skill: "A", outcome: "mastered" }] } });
  assert.deepEqual(odd.items, [], "an unknown outcome (e.g. mastery) is never shown");
});

test("the summary shows the server's figures, the topics and the tasks; no mastery; support text only when needed", () => {
  const root = client.buildCourseSummary(doc, client.readCourseComplete(PAYLOAD));
  assert.equal(byId(root, "course-summary-title").textContent, "Du har gennemført forløbet om Grundloven af 1849!");
  assert.deepEqual(all(byId(root, "course-summary-topics"), "li").map((l) => l.textContent), PAYLOAD.course.topics);
  assert.equal(byId(root, "course-summary-completed").textContent, "Du har svaret på 7 af 7 opgaver.");
  assert.equal(byId(root, "course-summary-first-try").textContent, "Rigtigt første gang: 4");
  assert.equal(byId(root, "course-summary-after-repetition").textContent, "Rigtigt efter øvelse: 2");
  assert.deepEqual(all(byId(root, "course-summary-items"), "li").map((l) => l.textContent),
    ["Styreformen før 1849: enevælde: Rigtigt første gang", "Magtens tredeling i § 2: Svært endnu", "<b>x</b>: Rigtigt efter øvelse"], "labels stay text");
  assert.match(byId(root, "course-summary-support").textContent, /Magtens tredeling i § 2/);
  const text = JSON.stringify(root, (k, v) => (k === "onclick" ? undefined : v));
  assert.equal(/mestr|mastery|du kan nu|du forstår/i.test(text), false, "never mastery or an undocumented claim");
  const none = client.buildCourseSummary(doc, client.readCourseComplete({ ...PAYLOAD, summary: { ...PAYLOAD.summary, needs_support: 0, items: [] }, choices: { practice: false, history: true, hub: true } }));
  assert.equal(byId(none, "course-summary-support"), null);
  assert.equal(byId(none, "course-practice-btn"), null, "no practice button when there is nothing to practise");
});

test("each choice is offered only when possible and fires once", () => {
  const calls = [];
  const root = client.buildCourseSummary(doc, client.readCourseComplete(PAYLOAD), {
    onPractice: () => calls.push("practice"), onContinue: () => calls.push("continue"), onHub: () => calls.push("hub"),
  });
  assert.deepEqual(all(root, "button").map((b) => b.textContent), ["Øv det, jeg er usikker på", "Fortsæt med historie", "Gå til hub"]);
  byId(root, "course-continue-btn").onclick();
  byId(root, "course-continue-btn").onclick();
  byId(root, "course-hub-btn").onclick();
  assert.deepEqual(calls, ["continue"], "one choice per screen (no double acknowledgement)");
  const noPractice = client.buildCourseSummary(doc, client.readCourseComplete({ ...PAYLOAD, choices: { practice: false, history: true, hub: true } }));
  assert.equal(byId(noPractice, "course-practice-btn"), null);
});

test("enrolments: an older backend or an error is 'no course'; only active rows", () => {
  assert.deepEqual(client.readEnrolments(null, { code: "42P01" }), []);
  assert.deepEqual(client.readEnrolments(undefined, null), []);
  assert.deepEqual(client.readEnrolments([{ course_id: "pilot_d362", status: "active", summary_acknowledged_at: null, courses: { title: "Grundloven af 1849" } }, { course_id: "pilot_x", status: "revoked" }], null),
    [{ id: "pilot_d362", title: "Grundloven af 1849", acknowledged: false }]);
});

test("\"Gentagelse\" only for a repeated course round", () => {
  assert.equal(client.isCourseRepeat({ course_id: "pilot_d362", round_no: 2 }), true);
  assert.equal(client.isCourseRepeat({ course_id: "pilot_d362", round_no: 1 }), false);
  assert.equal(client.isCourseRepeat({ round_no: 3, is_repeat: true }), false, "a regular repeat looks exactly as before");
  assert.equal(client.isCourseRepeat(null), false);
});

test("app.js wiring: course fields only for an enrolled pupil; the summary and the offer replace the question; ack before leaving", () => {
  assert.match(APP, /import \{ COURSE_CHOICE_KEY_PREFIX, buildCourseOffer, buildCourseSummary, isCourseRepeat, readCourseComplete, readEnrolments \} from "\.\/js\/course-summary\.js";/);
  assert.match(APP, /const courseFields = courseMode\s*\? \{ course: courseMode, \.\.\.\(pendingCourseAction \? \{ course_action: pendingCourseAction \} : \{\}\) \}\s*: \(courseEnrolments\.length > 0 \? \{ keep_course_rounds: true \} : \{\}\);/);
  assert.match(APP, /subject: currentSubject, \.\.\.courseFields \} \}\s*\);/, "the first request carries the course fields");
  assert.match(APP, /\{ body: \{ subject: currentSubject, \.\.\.courseFields \} \}/, "and so does the automatic retry (a 409 race keeps the course)");
  assert.match(APP, /if \(error && courseMode && error\?\.context\?\.status === 403\) \{/);
  assert.match(APP, /onContinue: async \(\) => \{ await acknowledgeCourse\(s\.course\.id\); leaveCourse\(s\.course\.id\); loadAndRenderQuestion\(\); \},/);
  assert.match(APP, /onHub: async \(\) => \{ await acknowledgeCourse\(s\.course\.id\); window\.location\.href = "hub\.html"; \},/);
  assert.match(APP, /if \(s\.acknowledged && !coursePracticeFlow\) \{/, "an acknowledged summary is not shown again (no loop)");
  assert.ok(APP.indexOf('if (question && question.step === "course_complete")') < APP.indexOf('if (question.step === "no_questions")'));
});
