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
// "historie", "engelsk" or "dansk". That is a harmless intent: each maps to a whole, fixed set of domains, so
// it can never be used to shrink the pool to an artificial mini-scope.
//
// Pure TypeScript with no Deno or network imports, so the Node unit suite tests exactly what the
// Edge Function runs.

// Subjects (fag). English questions use learning_objective = "english", Danish questions
// learning_objective = "danish"; every other domain is history. Must match teacher.js ALL_DOMAINS.
export const ENGLISH_DOMAIN = "english";
export const DANISH_DOMAIN = "danish";
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

export type Subject = "historie" | "engelsk" | "dansk";

export type QuestionScope = {
  subject: Subject;
  grade: number | null;
  activeDomains: string[] | null;
  // Domains new questions and repeats are drawn from.
  subjectDomains: string[];
  // Domains whose open rounds the fagskift release keeps (release_open_question_outside): the subject's
  // fixed domains plus, for historie, the pupil's own server-assigned history domains.
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
  const subject: Subject = requestedSubject === "engelsk" ? "engelsk"
    : requestedSubject === "dansk" ? "dansk"
    : "historie";

  // Effective domain filter for this subject:
  //   engelsk  → only English questions (teacher history filter does not apply)
  //   dansk    → only Danish questions (teacher history filter does not apply)
  //   historie → teacher filter minus English and Danish, or all history domains when unfiltered
  let subjectDomains: string[];
  let assignedHistory: string[] = [];
  if (subject === "engelsk") {
    subjectDomains = [ENGLISH_DOMAIN];
  } else if (subject === "dansk") {
    subjectDomains = [DANISH_DOMAIN];
  } else {
    assignedHistory = activeDomains !== null
      ? activeDomains.filter((d) => d !== ENGLISH_DOMAIN && d !== DANISH_DOMAIN)
      : [];
    subjectDomains = assignedHistory.length > 0 ? assignedHistory : [...HISTORY_DOMAINS];
  }

  // The fagskift release (release_open_question_outside) closes or deletes the pupil's open round when its
  // question lies OUTSIDE these domains. For historie that set is the fixed HISTORY_DOMAINS PLUS the pupil's
  // own assigned history domains — so an open round in a domain the pupil is still assigned (e.g. the D-362
  // pilot domain pilot_d362, which is not in HISTORY_DOMAINS) survives a reload or a second
  // get-next-question call, and an old tab can still answer it (owner decision 2026-11-13, D-362 P1).
  // Only server-side profile data is added (active_domains is not client-writable). A domain the teacher
  // removes is no longer added, so its open round is released as before. For a regular pupil every assigned
  // domain is already in HISTORY_DOMAINS, so the result is exactly HISTORY_DOMAINS (unchanged behaviour).
  const releaseDomains = subject === "engelsk" ? [ENGLISH_DOMAIN]
    : subject === "dansk" ? [DANISH_DOMAIN]
    : [...HISTORY_DOMAINS, ...assignedHistory.filter((d, i, all) => !HISTORY_DOMAINS.includes(d) && all.indexOf(d) === i)];

  return { subject, grade, activeDomains, subjectDomains, releaseDomains };
}
