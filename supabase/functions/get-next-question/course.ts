// Undervisningsforløb (D-362 / F-07, owner decisions 2026-11-15) — the pure part of get-next-question's course mode.
//
// ACCESS ≠ CURRENT COURSE. A pupil is in a course only when the request names it (`course`) AND the server finds an
// ACTIVE enrolment of the verified pupil in an ACTIVE catalogued course (public.course_enrolments ⋈ public.courses,
// migration 20261115130000). The client's `course` only selects; it never grants. profiles.active_domains is not an
// access path for courses: pilot_* entries there are ignored (./scope.ts), and NULL keeps meaning "all history".
//
// IN THE COURSE the scope is the course's own learning_objective, so regular history is never mixed in; the phase
// gate (./phase-gate.ts) orders it. OUTSIDE (no `course`) the request is exactly the regular quiz, with no extra read.
//
// AFTER THE COURSE (every phase completed): never the generic repeat on its own. The server records the FIRST
// completion once (record_course_completion; a later re-answer never moves it) and answers
//   { step: "course_complete", course, summary, acknowledged, choices }
// `acknowledged` = the pupil already saw the summary and chose (acknowledge_course_summary). The client shows the
// summary only when it is false, so a reload shows it again until the pupil chooses, and never after.
// course_action "practice" reopens ONE question whose latest answer is not right, with the existing generic repeat on
// the course scope (it takes wrong answers first) — and only when such a question exists, because with none left the
// generic repeat would reopen a RIGHT answer (2 XP + 1 coin each time, without new achievement: see
// tests/unit/f07-repetition-engine.test.mjs). p_max_repeats and the reward rules are unchanged.
//
// Pure TypeScript (no Deno, no network): the Node unit suite tests exactly what the Edge Function runs.
import type { CourseState, ItemStatus } from "./phase-gate.ts";

// The courses this code knows. The database catalogue is the authority (an enrolment must reference an ACTIVE row);
// this list only bounds what a request may name and which open rounds a regular historie request keeps.
export const COURSE_OBJECTIVES: readonly string[] = Object.freeze(["pilot_d362"]);
export const COURSE_ACTIONS: readonly string[] = Object.freeze(["practice"]);

export type CourseRequest =
  | { mode: "none"; keep: boolean }
  | { mode: "course"; course: string; action: "practice" | null }
  | { mode: "error"; status: 400; error: string };

export function parseCourseRequest(body: unknown, subject: string, targeted: boolean): CourseRequest {
  const b = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  if (b.course === undefined || b.course === null) {
    return b.course_action === undefined || b.course_action === null
      // keep_course_rounds: a new client of an ENROLLED pupil asks to keep an open course round while it serves
      // regular history. The server verifies the enrolment; a false claim keeps nothing. Absent = exactly as before.
      ? { mode: "none", keep: b.keep_course_rounds === true }
      : { mode: "error", status: 400, error: "course_action_without_course" };
  }
  if (typeof b.course !== "string" || !COURSE_OBJECTIVES.includes(b.course)) return { mode: "error", status: 400, error: "invalid_course" };
  if (subject !== "historie") return { mode: "error", status: 400, error: "course_subject" };
  if (targeted) return { mode: "error", status: 400, error: "course_and_objective" };
  const a = b.course_action;
  if (a !== undefined && a !== null && (typeof a !== "string" || !COURSE_ACTIONS.includes(a))) {
    return { mode: "error", status: 400, error: "invalid_course_action" };
  }
  return { mode: "course", course: b.course, action: a === "practice" ? "practice" : null };
}

// The enrolment read (backend client, scoped to the verified pupil). Anything but an active enrolment in an active
// catalogued course is "not available" — including a revoked one.
export type EnrolmentRow = {
  status?: unknown; completed_at?: unknown; summary_acknowledged_at?: unknown;
  courses?: unknown;
};
export type Enrolment = { course: string; title: string; topics: string[]; completedAt: string | null; acknowledged: boolean };

export function enrolmentFrom(course: string, rows: unknown): Enrolment | null {
  const row = Array.isArray(rows) && rows.length > 0 ? rows[0] as EnrolmentRow : null;
  if (!row || row.status !== "active") return null;
  const c = (Array.isArray(row.courses) ? row.courses[0] : row.courses) as { title?: unknown; topics?: unknown; is_active?: unknown } | null | undefined;
  if (!c || c.is_active !== true || typeof c.title !== "string") return null;
  return {
    course,
    title: c.title,
    topics: Array.isArray(c.topics) ? c.topics.filter((t): t is string => typeof t === "string") : [],
    completedAt: typeof row.completed_at === "string" ? row.completed_at : null,
    acknowledged: typeof row.summary_acknowledged_at === "string" && row.summary_acknowledged_at !== "",
  };
}

// Outcome of one question for the summary. Only what the pupil's answers document; mastery is not computed.
//   first_try          the first answer was right
//   after_repetition   right now, but not on the first answer
//   needs_support      not right after the allowed phase repeats
export type ItemOutcome = "first_try" | "after_repetition" | "needs_support";
export function itemOutcome(status: ItemStatus, firstCorrect: boolean | null, repeatCount: number): ItemOutcome | null {
  if (status === "secured") {
    if (firstCorrect === true) return "first_try";
    if (firstCorrect === false || repeatCount > 0) return "after_repetition";
    return "first_try"; // one answer only, and it is right (no first-round verdict logged: the level engine was off)
  }
  if (status === "needs_support" || status === "retry") return "needs_support";
  return null; // unserved / open: the course is not completed
}

export type CourseSummary = {
  total: number; completed: number; first_try_correct: number; correct_after_repetition: number;
  needs_support: number; items: { skill: string; outcome: ItemOutcome }[];
};

export function courseSummary(state: CourseState): CourseSummary {
  const items = state.phases.flatMap((p) => p.items).map((it, i) => ({ skill: it.skill ?? `Opgave ${i + 1}`, outcome: itemOutcome(it.status, it.firstCorrect, it.repeatCount) }));
  const done = items.filter((i): i is { skill: string; outcome: ItemOutcome } => i.outcome !== null);
  return {
    total: items.length,
    completed: done.length,
    first_try_correct: done.filter((i) => i.outcome === "first_try").length,
    correct_after_repetition: done.filter((i) => i.outcome === "after_repetition").length,
    needs_support: done.filter((i) => i.outcome === "needs_support").length,
    items: done,
  };
}

// Is there a question the pupil may practise? Exactly the ones whose latest answer is not right — the ones the
// generic repeat takes first. None → no practice (the generic repeat would reopen a right answer).
export function practiceAvailable(state: CourseState): boolean {
  return state.phases.some((p) => p.items.some((it) => it.status === "needs_support" || it.status === "retry"));
}

export const isCourseCompleted = (state: CourseState | undefined): state is CourseState =>
  state !== undefined && state.phases.length > 0 && state.current === null;

// The response after the course. choices: practice only when it can be carried out; history and hub always (the
// pupil's regular history is untouched by the course).
export function courseCompleteBody(e: Enrolment, state: CourseState, acknowledged: boolean) {
  return {
    step: "course_complete",
    course: { id: e.course, title: e.title, topics: e.topics },
    summary: courseSummary(state),
    acknowledged,
    choices: { practice: practiceAvailable(state), history: true, hub: true },
  };
}
