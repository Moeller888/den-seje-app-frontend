// Which questions a pupil may be served — derived on the server, never taken from the request.
//
// WHY. get-next-question used to take the grade from the request body (selected_grade) and pass it,
// with the subject's domains, to get_unserved_questions and request_repeat_question. Both RPCs were
// also callable by the pupil directly, so a pupil could name any scope — in particular an empty one,
// which makes request_repeat_question believe the pool is exhausted and hand out repeats while
// unanswered questions remain (audit finding E2, 2026-10-16).
//
// THE RULE. The scope comes from the pupil's profile, which the pupil cannot write (only
// placement_band and current_band are client-updatable):
//   grade    profiles.selected_grade (not client-writable); null = no grade filter
//   domains  profiles.active_domains (the teacher's filter) intersected with the subject
// The only thing the request may contribute is the SUBJECT the pupil chose on spil.html —
// "historie" or "engelsk". That is a harmless intent: each maps to a whole, fixed set of domains, so
// it can never be used to shrink the pool to an artificial mini-scope.
//
// Pure TypeScript with no Deno or network imports, so the Node unit suite tests exactly what the
// Edge Function runs.

// Subjects (fag). English questions use learning_objective = "english"; every other domain is
// history. Must match teacher.js ALL_DOMAINS.
export const ENGLISH_DOMAIN = "english";
export const HISTORY_DOMAINS = Object.freeze([
  "prehistoric_denmark",
  "vikings",
  "middle_ages",
  "reformation_monarchy",
  "enlightenment",
  "revolutions_democracy",
  "industrialisation",
  "world_war_1",
  "world_war_2",
  "cold_war",
  "democracy_power",
]);

export type Subject = "historie" | "engelsk";

export type QuestionScope = {
  subject: Subject;
  grade: number | null;
  activeDomains: string[] | null;
  // Domains new questions and repeats are drawn from.
  subjectDomains: string[];
  // Subject-level domains for the fagskift release (never the teacher filter).
  releaseDomains: string[];
};

export function deriveQuestionScope(profile: unknown, requestedSubject: unknown): QuestionScope {
  const p = (typeof profile === "object" && profile !== null) ? profile as Record<string, unknown> : {};

  const grade = Number.isInteger(p.selected_grade) ? p.selected_grade as number : null;

  const activeDomains = Array.isArray(p.active_domains)
      && p.active_domains.length > 0
      && p.active_domains.every((d) => typeof d === "string")
    ? [...p.active_domains as string[]]
    : null;

  // Missing/unknown = "historie" (backwards compatible with clients that do not send a subject).
  const subject: Subject = requestedSubject === "engelsk" ? "engelsk" : "historie";

  // Effective domain filter for this subject:
  //   engelsk  → only English questions (teacher history filter does not apply)
  //   historie → teacher filter minus English, or all history domains when unfiltered
  let subjectDomains: string[];
  if (subject === "engelsk") {
    subjectDomains = [ENGLISH_DOMAIN];
  } else {
    const assignedHistory = activeDomains !== null
      ? activeDomains.filter((d) => d !== ENGLISH_DOMAIN)
      : [];
    subjectDomains = assignedHistory.length > 0 ? assignedHistory : [...HISTORY_DOMAINS];
  }

  const releaseDomains = subject === "engelsk" ? [ENGLISH_DOMAIN] : [...HISTORY_DOMAINS];

  return { subject, grade, activeDomains, subjectDomains, releaseDomains };
}
