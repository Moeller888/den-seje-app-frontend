// The teacher's per-domain progress (student-detail.html, "Domæneoversigt"): which answers count as
// evidence of the pupil's progress, and which are shown apart.
//
// OWNER PRINCIPLE (2026-11-05): Sandt/falsk is a comprehension check. A guess is right half the time, so
// its answers never enter the domain's precision; the teacher sees them in their own column,
// "Forståelsestjek", as answered/right. Every other format counts exactly as before (the server side is
// migration 20261105115000_true_false_mastery_exclusion, which keeps the same answers out of the level,
// the band and the teacher functions).
//
// Must equal the registry's kinds with guessFloor >= 0.5 (supabase/functions/_shared/interaction-kinds.ts)
// and the formats the SQL migration excludes — pinned by tests/unit/true-false-mastery-exclusion-run.test.mjs.
export const COMPREHENSION_CHECK_FORMATS = Object.freeze(["true_false"]);

export function isComprehensionCheck(answerFormat) {
  return typeof answerFormat === "string" && COMPREHENSION_CHECK_FORMATS.includes(answerFormat);
}

// instances: rows { is_correct, was_correct, questions: { learning_objective, answer_format } | null }.
// objectiveToDomain(lo) → domain key or null (rows without a domain are skipped, as before).
// Returns rows { domain, total, correct, checkTotal, checkCorrect }, most answered first; a domain that
// has only comprehension checks still gets a row (total 0), so the teacher sees them.
export function summariseDomainProgress(instances, objectiveToDomain) {
  const stats = {};
  if (!Array.isArray(instances) || typeof objectiveToDomain !== "function") return [];
  for (const inst of instances) {
    if (!inst || typeof inst !== "object") continue;
    const q = inst.questions && typeof inst.questions === "object" ? inst.questions : null;
    const domain = objectiveToDomain(q ? q.learning_objective ?? null : null);
    if (!domain) continue;
    if (!stats[domain]) stats[domain] = { total: 0, correct: 0, checkTotal: 0, checkCorrect: 0 };
    const right = inst.is_correct === true || inst.was_correct === true;
    if (isComprehensionCheck(q ? q.answer_format : null)) {
      stats[domain].checkTotal++;
      if (right) stats[domain].checkCorrect++;
    } else {
      stats[domain].total++;
      if (right) stats[domain].correct++;
    }
  }
  return Object.entries(stats)
    .map(([domain, s]) => ({ domain, ...s }))
    // Same order as before for every pupil without comprehension checks (stable sort on total).
    .sort((a, b) => (b.total - a.total) || (b.checkTotal - a.checkTotal));
}
