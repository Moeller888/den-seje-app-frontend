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
  const subject: Subject = requestedSubject === "engelsk" ? "engelsk"
    : requestedSubject === "dansk" ? "dansk"
    : "historie";

  // Effective domain filter for this subject:
  //   engelsk  → only English questions (teacher history filter does not apply)
  //   dansk    → only Danish questions (teacher history filter does not apply)
  //   historie → teacher filter minus English and Danish, or all history domains when unfiltered
  let subjectDomains: string[];
  if (subject === "engelsk") {
    subjectDomains = [ENGLISH_DOMAIN];
  } else if (subject === "dansk") {
    subjectDomains = [DANISH_DOMAIN];
  } else {
    const assignedHistory = activeDomains !== null
      ? activeDomains.filter((d) => d !== ENGLISH_DOMAIN && d !== DANISH_DOMAIN)
      : [];
    subjectDomains = assignedHistory.length > 0 ? assignedHistory : [...HISTORY_DOMAINS];
  }

  const releaseDomains = subject === "engelsk" ? [ENGLISH_DOMAIN]
    : subject === "dansk" ? [DANISH_DOMAIN]
    : [...HISTORY_DOMAINS];

  return { subject, grade, activeDomains, subjectDomains, releaseDomains };
}

// D-383: a Lærligverse COURSE ITEM is a question whose metadata has the key `learning_step` (the D-338 step tag
// read by stepOf), whatever its value. The ordinary quiz (a request without learning_objective) never serves,
// repeats or resumes one, and neither does a targeted request outside the server sequence; only a request inside the
// server-directed sequence does (D-383 addendum 2026-11-23). The tag on the item decides, not the domain:
// pilot_* domains (D-362) are deliberately ordinary quiz. The same rule as public.question_is_course_item
// (migration 20261120150000), which keeps course items out of the level candidates and the repeat RPCs.
export const COURSE_ITEM_KEY = "learning_step";

export function isCourseItem(metadata: unknown): boolean {
  return typeof metadata === "object" && metadata !== null && !Array.isArray(metadata)
    && Object.prototype.hasOwnProperty.call(metadata, COURSE_ITEM_KEY);
}

// D-383 follow-up (migration 20261123100000): the two SHARED candidate RPCs filter course items BEFORE their limit, so
// they cannot crowd out the valid candidates. p_course_scope = the server's step inside the sequence (only that step's
// course items), "none" everywhere else (no course items). The candidate loop keeps its own check as well.
export const COURSE_SCOPE_NONE = "none";

export function courseScopeOf(sequenceStep: string | null): string {
  return typeof sequenceStep === "string" && sequenceStep.length > 0 ? sequenceStep : COURSE_SCOPE_NONE;
}

/** PostgREST's "no function matches these named arguments": a database without 20261123100000. */
export function isMissingCourseScope(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "PGRST202";
}

type ScopedRpcClient = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };

/**
 * One candidate RPC with p_course_scope. On a database that predates the parameter, exactly one explicit fallback to
 * the call without it (today's behaviour; the candidate loop still withholds course items), logged loudly. Any other
 * error is returned unchanged for the caller to throw.
 */
export async function rpcWithCourseScope(client: ScopedRpcClient, fn: string, args: Record<string, unknown>, scope: string): Promise<{ data: unknown; error: unknown }> {
  const scoped = await client.rpc(fn, { ...args, p_course_scope: scope });
  if (!isMissingCourseScope(scoped.error)) return scoped;
  console.error("COURSE_SCOPE_FALLBACK:", { rpc: fn });
  return await client.rpc(fn, args);
}
