// Undervisningsforløb (D-362 / F-07, owner decisions 2026-11-15): the pupil's course summary and the client's course
// choice. Pure DOM building — no network, no storage of its own. app.js wires it to get-next-question.
//
// What is shown comes ONLY from the server's course_complete payload, which get-next-question derives from the
// pupil's own answers (supabase/functions/get-next-question/course.ts). Nothing is hard-coded, mastery is never shown,
// and no reward is given for the summary itself.
//
// Choices: a button is shown only when the server says its action can be carried out (choices.practice etc.).

export const COURSE_CHOICE_KEY_PREFIX = "laerlig_course_choice_v1_";

const OUTCOME_TEXT = Object.freeze({
  first_try: "Rigtigt første gang",
  after_repetition: "Rigtigt efter øvelse",
  needs_support: "Svært endnu",
});

const nonNegInt = (v) => (Number.isInteger(v) && v >= 0 ? v : null);

// Validates the server payload. Returns null for anything malformed (the caller then shows its error state).
export function readCourseComplete(payload) {
  const p = payload && typeof payload === "object" ? payload : null;
  if (!p || p.step !== "course_complete") return null;
  const c = p.course && typeof p.course === "object" ? p.course : null;
  const s = p.summary && typeof p.summary === "object" ? p.summary : null;
  if (!c || typeof c.id !== "string" || typeof c.title !== "string" || c.title.trim() === "" || !s) return null;
  const counts = ["total", "completed", "first_try_correct", "correct_after_repetition", "needs_support"].map((k) => nonNegInt(s[k]));
  if (counts.some((x) => x === null)) return null;
  const items = Array.isArray(s.items)
    ? s.items.filter((i) => i && typeof i.skill === "string" && Object.hasOwn(OUTCOME_TEXT, i.outcome)).map((i) => ({ skill: i.skill, outcome: i.outcome }))
    : [];
  const ch = p.choices && typeof p.choices === "object" ? p.choices : {};
  return {
    course: { id: c.id, title: c.title, topics: Array.isArray(c.topics) ? c.topics.filter((t) => typeof t === "string") : [] },
    total: counts[0], completed: counts[1], firstTry: counts[2], afterRepetition: counts[3], needsSupport: counts[4],
    items,
    acknowledged: p.acknowledged === true,
    choices: { practice: ch.practice === true, history: ch.history !== false, hub: ch.hub !== false },
  };
}

function el(doc, tag, { id, className, text } = {}) {
  const e = doc.createElement(tag);
  if (id) e.id = id;
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

// Builds the summary. handlers: { onPractice, onContinue, onHub } — each called at most once per screen.
export function buildCourseSummary(doc, summary, handlers = {}) {
  if (!doc || typeof doc.createElement !== "function") throw new Error("buildCourseSummary: a document is required");
  const s = summary;
  const root = el(doc, "section", { id: "course-summary", className: "course-summary" });
  root.setAttribute("aria-labelledby", "course-summary-title");
  root.appendChild(el(doc, "h2", { id: "course-summary-title", text: `Du har gennemført forløbet om ${s.course.title}!` }));

  if (s.course.topics.length > 0) {
    root.appendChild(el(doc, "p", { className: "course-summary-lead", text: "Du har arbejdet med:" }));
    const topics = el(doc, "ul", { id: "course-summary-topics" });
    for (const t of s.course.topics) topics.appendChild(el(doc, "li", { text: t }));
    root.appendChild(topics);
  }

  const facts = el(doc, "ul", { id: "course-summary-facts" });
  facts.appendChild(el(doc, "li", { id: "course-summary-completed", text: `Du har svaret på ${s.completed} af ${s.total} opgaver.` }));
  facts.appendChild(el(doc, "li", { id: "course-summary-first-try", text: `Rigtigt første gang: ${s.firstTry}` }));
  facts.appendChild(el(doc, "li", { id: "course-summary-after-repetition", text: `Rigtigt efter øvelse: ${s.afterRepetition}` }));
  root.appendChild(facts);

  if (s.items.length > 0) {
    const list = el(doc, "ul", { id: "course-summary-items" });
    for (const i of s.items) {
      const li = el(doc, "li", { className: `course-item course-item-${i.outcome}` });
      li.textContent = `${i.skill}: ${OUTCOME_TEXT[i.outcome]}`;
      list.appendChild(li);
    }
    root.appendChild(list);
  }

  if (s.needsSupport > 0) {
    const names = s.items.filter((i) => i.outcome === "needs_support").map((i) => i.skill);
    root.appendChild(el(doc, "p", {
      id: "course-summary-support",
      text: `Noget var svært denne gang: ${names.join(", ")}. Det er helt i orden. Du kan øve det igen, eller spørge din lærer.`,
    }));
  }

  const buttons = el(doc, "div", { className: "course-summary-choices" });
  let used = false;
  const once = (fn) => () => { if (used) return; used = true; if (typeof fn === "function") fn(); };
  if (s.choices.practice && s.needsSupport > 0) {
    const b = el(doc, "button", { id: "course-practice-btn", className: "submit-btn", text: "Øv det, jeg er usikker på" });
    b.onclick = once(handlers.onPractice);
    buttons.appendChild(b);
  }
  if (s.choices.history) {
    const b = el(doc, "button", { id: "course-continue-btn", className: "submit-btn", text: "Fortsæt med historie" });
    b.onclick = once(handlers.onContinue);
    buttons.appendChild(b);
  }
  if (s.choices.hub) {
    const b = el(doc, "button", { id: "course-hub-btn", className: "submit-btn", text: "Gå til hub" });
    b.onclick = once(handlers.onHub);
    buttons.appendChild(b);
  }
  root.appendChild(buttons);
  return root;
}

// The offer at the start of a quiz session for an enrolled pupil whose summary is not yet acknowledged.
export function buildCourseOffer(doc, course, { onCourse, onRegular } = {}) {
  const root = el(doc, "section", { id: "course-offer", className: "course-summary" });
  root.appendChild(el(doc, "h2", { id: "course-offer-title", text: `Dit forløb: ${course.title}` }));
  root.appendChild(el(doc, "p", { text: "Du kan arbejde videre med forløbet eller tage almindelige historieopgaver. Dit forløb venter på dig." }));
  let used = false;
  const once = (fn) => () => { if (used) return; used = true; if (typeof fn === "function") fn(); };
  const a = el(doc, "button", { id: "course-start-btn", className: "submit-btn", text: "Gå til forløbet" });
  a.onclick = once(onCourse);
  const b = el(doc, "button", { id: "course-regular-btn", className: "submit-btn", text: "Almindelig historie" });
  b.onclick = once(onRegular);
  root.appendChild(a);
  root.appendChild(b);
  return root;
}

// The pupil's active enrolments as the client reads them (RLS: own rows only). A failed read or an unknown shape
// (an older backend without the table) is "no course" — the quiz then runs exactly as before.
export function readEnrolments(data, error) {
  if (error || !Array.isArray(data)) return [];
  return data
    .filter((r) => r && typeof r.course_id === "string" && r.status === "active")
    .map((r) => {
      const c = Array.isArray(r.courses) ? r.courses[0] : r.courses;
      return {
        id: r.course_id,
        title: c && typeof c.title === "string" ? c.title : r.course_id,
        acknowledged: typeof r.summary_acknowledged_at === "string" && r.summary_acknowledged_at !== "",
      };
    });
}

// A course round gets the "Gentagelse" label only in a course (round 2 and later). Regular quizzes are unchanged.
export function isCourseRepeat(question) {
  return !!question && typeof question.course_id === "string" && Number.isInteger(question.round_no) && question.round_no > 1;
}
