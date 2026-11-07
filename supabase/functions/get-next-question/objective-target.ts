// Objective targeting for get-next-question (Lærligverse F4-B, D-329). OFF by default.
//
// WHAT. A world (Lærligverse) may ask for a question in ONE existing learning objective — the value of
// questions.learning_objective (today the domain, e.g. "world_war_2"). It never invents objective ids:
// finer objectives are LP-2/LP-13, an owner decision. With the Edge secret
// LAERLIGVERSE_OBJECTIVE_TARGETING unset (the default), or without `learning_objective` in the request,
// get-next-question runs exactly as before.
//
// THE RULES (all server-side; the request only names an intent):
//   1. The objective must be a syntactically valid id                                  → 400 otherwise.
//   2. It must lie inside the pupil's SERVER-DERIVED scope (profile domains ∩ subject, ./scope.ts):
//      targeting can only NARROW what the pupil may already be served, never widen it  → 403 otherwise.
//   3. An open instance from ANOTHER objective is never served as this objective's question, and it is
//      not released or changed either (no side effect on the ordinary quiz)             → 409.
//   3b. A request that lost the race for the one open instance (idx_one_open_question) to a concurrent
//      request is told so explicitly (409 open_question_exists), never "exhausted"; a retry gets it.
//   4. Targeting never reaches the REPEAT step. Narrowing the scope to one objective would otherwise
//      re-create the "mini-scope" that audit finding E2 closed (an exhausted mini-pool hands out repeats
//      while unanswered questions remain elsewhere). An exhausted objective is an explicit
//      { step: "no_questions", reason: "objective_exhausted" }.
//
// Pure TypeScript, no Deno or network imports, so the Node unit suite tests exactly what the function runs.

export type ObjectiveTargeting =
  | { readonly mode: "off" }
  | { readonly mode: "on"; readonly objective: string }
  | { readonly mode: "error"; readonly status: 400 | 403; readonly error: "invalid_learning_objective" | "learning_objective_not_allowed" };

/** Same alphabet as the domains in ./scope.ts. */
export const OBJECTIVE_ID = /^[a-z][a-z0-9_]{0,63}$/;

export function objectiveTargetingEnabled(flag: string | undefined | null): boolean {
  return flag === "on";
}

/**
 * @param flag            Deno.env.get("LAERLIGVERSE_OBJECTIVE_TARGETING")
 * @param requested       body.learning_objective (untrusted)
 * @param allowedDomains  the SERVER-DERIVED subject domains (scope.subjectDomains), never from the request
 */
export function resolveObjectiveTargeting(flag: string | undefined | null, requested: unknown, allowedDomains: readonly string[]): ObjectiveTargeting {
  // Flag off, or no objective asked for: today's behaviour, unchanged (the field is ignored).
  if (!objectiveTargetingEnabled(flag) || requested === undefined || requested === null) return { mode: "off" };
  if (typeof requested !== "string" || !OBJECTIVE_ID.test(requested)) {
    return { mode: "error", status: 400, error: "invalid_learning_objective" };
  }
  if (!allowedDomains.includes(requested)) {
    return { mode: "error", status: 403, error: "learning_objective_not_allowed" };
  }
  return { mode: "on", objective: requested };
}

/** Rule 3: may this open (due) instance be served for the targeted objective? */
export function openInstanceMatches(targeting: ObjectiveTargeting, questionObjective: unknown): boolean {
  return targeting.mode !== "on" || questionObjective === targeting.objective;
}
