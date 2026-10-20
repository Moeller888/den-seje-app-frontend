// The format mix: which unserved question get-next-question tries first, so pupils meet the
// interaction kinds (opgaveformer) their scope actually holds — not only multiple choice.
//
// WHERE IT SITS IN THE FLOW (index.ts), unchanged around it:
//   1. an open / due instance is served first (spaced repetition and an interrupted request win);
//   2. NEW questions: get_question_candidates_for_student returns a per-pupil, stratified candidate
//      window (migration 20261019150000) → planNextQuestions orders it → the first successful
//      server-side insert wins;
//   3. the repeat RPC, only when the scope is exhausted.
// Scope (subject, teacher's domains, grade), "not served before", the answer key, the reward and the
// mastery logic are all decided elsewhere and are not touched here: this file only ORDERS candidates
// the scope already allowed.
//
// THE DECISION, per request, from server-owned data only
//   history  the pupil's newest WINDOW question_instances (created_at = when first served; a reopened
//            repeat keeps its old created_at, so the window counts NEW questions only);
//   band     ./server-band.ts (never the request body).
// A non-base kind K becomes DUE when all of these hold:
//   * K is servable (../_shared/interaction-kinds.ts) and has a QUALIFIED candidate: a band within
//     bandTolerance of the pupil's band. A quota is never met with too-easy or too-hard items;
//   * at least `gap` new questions have been served since the last non-base question;
//   * K is a whole question behind its share: share(K) · (n + 1) − served(K) ≥ 1, where n is the
//     window length and share(K) = min(maxShare(K), totalShare / number of qualified kinds);
//   * the window's non-base total stays within totalShare · (n + 1).
// The most-behind due kind wins (registry order breaks ties). Otherwise the base kind (choice) is
// used; when the base kind has no candidate left, the most-behind servable kind is used regardless of
// quota — the limits steer variety, they never turn an answerable pool into "no questions".
//
// WITHIN THE CHOSEN KIND, in this order of precedence:
//   1. band tier: |band − pupil band| ≤ bandTolerance first;
//   2. NUZO wave score (./wave-order.ts, unchanged scoring, server band as target);
//   3. domains not among the last `domainMemory` served first (variety when several topics are set);
//   4. candidate order from SQL: md5(student_id || question_id) — deterministic, different per pupil.
// Every other candidate follows as fallback, should an insert lose a race.
//
// Pure TypeScript with no Deno or network imports, so the Node unit suite and the simulation run
// exactly what the Edge Function runs.

import {
  BASE_KIND,
  INTERACTION_KINDS,
  KIND_ORDER,
  classifyQuestion,
  isServableKind,
  type InteractionKind,
} from "../_shared/interaction-kinds.ts";
import { sortByWave } from "./wave-order.ts";

// Hypotheses tested in the simulation (tools/question-mix-sim), not fixed design decisions.
export const MIX_POLICY = Object.freeze({
  windowSize: 20,
  totalShare: 0.30,
  gap: 3,
  bandTolerance: 1,
  domainMemory: 3,
});

export type MixPolicy = {
  windowSize: number;
  totalShare: number;
  gap: number;
  bandTolerance: number;
  domainMemory: number;
};

// Which selection get-next-question runs. Set by the Edge secret QUESTION_MIX_ENGINE; anything else
// (unset included) is "v1" — today's behaviour. "shadow" serves v1 and only LOGS the v2 decision;
// "shadow" and "v2" need migration 20261019150000 applied first.
export type MixEngine = "v1" | "shadow" | "v2";
export function resolveMixEngine(value: unknown): MixEngine {
  return value === "v2" || value === "shadow" ? value : "v1";
}

export type MixCandidate = {
  id: string;
  content?: unknown;
  answer_format?: unknown;
  answer_type?: unknown;
  metadata?: unknown;
  difficulty_band?: unknown;
  learning_objective?: unknown;
};

// One recent question_instances row, newest first. `kind` may be null (unclassifiable row): it then
// counts toward the window length but toward no kind.
export type MixHistoryItem = { kind: InteractionKind | null; domain: string | null };

export type MixDecision = {
  kind: InteractionKind | null;
  reason: "due" | "base" | "base_exhausted" | "empty";
  targetBand: number;
  window: number;
  gapSinceNonBase: number | null;
  served: Partial<Record<InteractionKind, number>>;
  qualified: InteractionKind[];
  dropped: number;
};

export type MixPlan<T> = { ordered: T[]; decision: MixDecision };

// Shares are fractions (0.30 / 3 = 0.09999…); compare whole-question thresholds with a tolerance so a
// kind that is exactly one question behind is due.
const EPSILON = 1e-9;

function bandOf(c: MixCandidate): number | null {
  return Number.isInteger(c.difficulty_band) ? c.difficulty_band as number : null;
}

function domainOf(c: MixCandidate): string | null {
  return typeof c.learning_objective === "string" ? c.learning_objective : null;
}

function withinBand(c: MixCandidate, targetBand: number, tolerance: number): boolean {
  const band = bandOf(c);
  // An unbanded question carries no level information; it is neither preferred nor excluded.
  return band === null || Math.abs(band - targetBand) <= tolerance;
}

// History rows from question_instances with an embedded question, newest first → MixHistoryItem.
export function toMixHistory(rows: readonly unknown[] | null | undefined): MixHistoryItem[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    const r = row && typeof row === "object" ? row as Record<string, unknown> : {};
    const embedded = Array.isArray(r.questions) ? r.questions[0] : r.questions;
    const q = embedded && typeof embedded === "object" ? embedded as Record<string, unknown> : null;
    return {
      kind: q ? classifyQuestion(q) : null,
      domain: q && typeof q.learning_objective === "string" ? q.learning_objective : null,
    };
  });
}

// Orders one kind's candidates: band tier → wave score → fresh domain → incoming (hash) order.
function orderWithinKind<T extends MixCandidate>(
  list: T[],
  targetBand: number,
  wavePhase: string,
  lastMisconceptionType: string | null,
  recentDomains: Set<string>,
  policy: MixPolicy,
): T[] {
  const fresh = (c: T) => (domainOf(c) !== null && recentDomains.has(domainOf(c) as string) ? 1 : 0);
  const tier = (rows: T[]) => sortByWave(
    [...rows].sort((a, b) => fresh(a) - fresh(b)), // stable: hash order kept within equal freshness
    wavePhase,
    lastMisconceptionType,
    targetBand,
  ) as T[];
  const inBand = list.filter((c) => withinBand(c, targetBand, policy.bandTolerance));
  const outBand = list.filter((c) => !withinBand(c, targetBand, policy.bandTolerance));
  return [...tier(inBand), ...tier(outBand)];
}

export function planNextQuestions<T extends MixCandidate>(input: {
  candidates: readonly T[] | null | undefined;
  history: readonly MixHistoryItem[] | null | undefined;
  targetBand: number;
  wavePhase: string;
  lastMisconceptionType: string | null;
  policy?: MixPolicy;
}): MixPlan<T> {
  const policy = input.policy ?? MIX_POLICY;
  const targetBand = input.targetBand;
  const all: readonly T[] = Array.isArray(input.candidates) ? input.candidates : [];

  // 1. Only kinds the current client can show.
  const byKind = new Map<InteractionKind, T[]>();
  let dropped = 0;
  for (const c of all) {
    const kind = c && typeof c === "object" && typeof c.id === "string" ? classifyQuestion(c) : null;
    if (!isServableKind(kind)) { dropped++; continue; }
    if (!byKind.has(kind)) byKind.set(kind, []);
    byKind.get(kind)!.push(c);
  }

  // 2. The server-owned window.
  const history: readonly MixHistoryItem[] = Array.isArray(input.history) ? input.history : [];
  const window = history.slice(0, Math.max(0, policy.windowSize));
  const n = window.length;
  const served: Partial<Record<InteractionKind, number>> = {};
  let nonBaseServed = 0;
  let gapSinceNonBase: number | null = null;
  window.forEach((h, i) => {
    if (!h || h.kind === null) return;
    served[h.kind] = (served[h.kind] ?? 0) + 1;
    if (h.kind !== BASE_KIND) {
      nonBaseServed++;
      if (gapSinceNonBase === null) gapSinceNonBase = i;
    }
  });
  const recentDomains = new Set(
    window.slice(0, Math.max(0, policy.domainMemory)).map((h) => h?.domain).filter((d): d is string => typeof d === "string"),
  );

  // 3. Qualified non-base kinds and their deficits.
  const qualified = KIND_ORDER.filter((k) => k !== BASE_KIND && INTERACTION_KINDS[k].maxShare > 0
    && (byKind.get(k) ?? []).some((c) => withinBand(c, targetBand, policy.bandTolerance)));
  const deficit = (k: InteractionKind) => {
    const share = Math.min(INTERACTION_KINDS[k].maxShare, qualified.length > 0 ? policy.totalShare / qualified.length : 0);
    return share * (n + 1) - (served[k] ?? 0);
  };
  const gapOk = gapSinceNonBase === null || gapSinceNonBase >= policy.gap;
  const totalOk = nonBaseServed + 1 <= policy.totalShare * (n + 1) + EPSILON;

  let kind: InteractionKind | null = null;
  let reason: MixDecision["reason"] = "empty";
  if (gapOk && totalOk) {
    let best = 0;
    for (const k of qualified) {
      const d = deficit(k);
      if (d >= 1 - EPSILON && d > best + EPSILON) { kind = k; best = d; }
    }
    if (kind !== null) reason = "due";
  }
  if (kind === null && (byKind.get(BASE_KIND) ?? []).length > 0) {
    kind = BASE_KIND;
    reason = "base";
  }
  if (kind === null) {
    // No base candidates left: serve what the pool still holds rather than nothing.
    const rest = KIND_ORDER.filter((k) => k !== BASE_KIND && (byKind.get(k) ?? []).length > 0);
    if (rest.length > 0) {
      kind = rest.reduce((a, b) => (deficit(b) > deficit(a) ? b : a));
      reason = "base_exhausted";
    }
  }

  // 4. Chosen kind first, then the rest as insert-race fallback (base kind before the others).
  const order = (k: InteractionKind) =>
    orderWithinKind(byKind.get(k) ?? [], targetBand, input.wavePhase, input.lastMisconceptionType, recentDomains, policy);
  const ordered: T[] = [];
  if (kind !== null) ordered.push(...order(kind));
  for (const k of [BASE_KIND, ...KIND_ORDER.filter((x) => x !== BASE_KIND)]) {
    if (k !== kind) ordered.push(...order(k));
  }

  return {
    ordered,
    decision: { kind, reason, targetBand, window: n, gapSinceNonBase, served, qualified, dropped },
  };
}
