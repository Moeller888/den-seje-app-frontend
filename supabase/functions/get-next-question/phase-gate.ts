// Phase gate for explicitly phased courses (D-362 / F-07, owner decisions 2026-11-13 and 2026-11-14).
//
// A question that carries metadata.pilot_phase belongs to a phased course: all ACTIVE questions with a phase in
// the same learning_objective. The course is taught in the fixed order
//     introduktion → forståelsestjek → selvstændig anvendelse
// and a question from a later phase is never served while the pupil may not yet leave an earlier phase.
//
// WHAT IS RECORDED PER QUESTION (owner decision 2026-11-14 — completion is not mastery):
//   attempted       answered at least once                                  (question_instances.answered)
//   secured         the LATEST answer is correct                           (question_instances.was_correct)
//   needs support   still wrong after MAX_REPEATS repeat rounds — the pupil may go on, the gap is recorded
//   first-time      the FIRST answer was correct (student_level_fold_log.was_correct, written once per instance by
//                   advance_student_level; a repeat never changes it)
// PER PHASE:
//   completed       every question is secured or needs support → the pupil may leave the phase (never locked in,
//                   never "no_questions")
//   all secured     every question secured
//   provisional indicator  all secured AND at least half first-time correct. INTERNAL and PROVISIONAL only: it is
//                   logged, never shown to the pupil or the teacher as mastery — what demonstrates real understanding
//                   (first answers, independent application, later recall) is not decided yet.
//
// A wrong answer is practised again in the SAME phase: first the phase's other new questions (spacing), then a phase
// repeat (request_repeat_phase_question_for_student: wrong answers only, oldest first, at most MAX_REPEATS).
//
// Inside the open phase the engine's own order is kept (level distance, wave, format mix) — except in
// "introduktion", which is narrative scaffolding and is served in its authored order (difficulty_level ascending).
// Questions without metadata.pilot_phase are never touched and cause no read. An unknown phase value is never served
// (fail closed) and is logged.
//
// CANDIDATE WINDOW: the engine's candidate list is capped (LEVEL_CANDIDATE_LIMIT = 50) across ALL the pupil's
// domains. With the pupil's level known, the gate fetches each phased course's own candidates (same RPC, that one
// domain), so a crowded window can never hide the current phase. Without a level (a route other than the level
// engine) it cannot prove a missing question unservable once the window is full, and then counts it as pending
// (conservative: holds later phases).
//
// Pure TypeScript with no Deno or network imports (the IO goes through a small injected client), so the Node
// unit suite tests exactly what the Edge Function runs.

export const PHASE_KEY = "pilot_phase";
export const PHASE_ORDER: readonly string[] = Object.freeze(["introduktion", "forståelsestjek", "selvstændig anvendelse"]);
// Phases served in authored order (difficulty_level ascending) instead of the engine's order.
export const AUTHORED_ORDER_PHASES: ReadonlySet<number> = new Set([0]);
// Owner decision 2026-11-14 (provisional pilot parameter): at most two repeats, i.e. up to three attempts.
export const MAX_REPEATS = 2;
// The engine's candidate cap (level-flow.ts LEVEL_CANDIDATE_LIMIT) and the per-course fetch size.
export const ENGINE_CANDIDATE_LIMIT = 50;
export const COURSE_FETCH_LIMIT = 100;

type Row = { id?: unknown; learning_objective?: unknown; metadata?: unknown; difficulty_level?: unknown; content?: unknown };

// null = not a phased question; -1 = a phase value outside PHASE_ORDER (never served); else 0-based rank.
export function phaseRank(metadata: unknown): number | null {
  if (typeof metadata !== "object" || metadata === null) return null;
  const v = (metadata as Record<string, unknown>)[PHASE_KEY];
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return -1;
  return PHASE_ORDER.indexOf(v.normalize("NFC"));
}

export type ItemHistory = { answered: boolean; wasCorrect: boolean | null; repeatCount: number; firstCorrect: boolean | null; open: boolean };
export type ItemStatus = "unserved" | "open" | "secured" | "retry" | "needs_support";

export function itemStatus(h: ItemHistory | undefined, maxRepeats = MAX_REPEATS): ItemStatus {
  if (!h) return "unserved";
  if (h.open) return "open";
  if (h.wasCorrect === true) return "secured";
  return h.repeatCount >= maxRepeats ? "needs_support" : "retry";
}

export type PhaseState = {
  rank: number; ids: string[]; statuses: Record<string, ItemStatus>;
  completed: boolean; allSecured: boolean; needsSupport: string[]; firstTimeCorrect: number; provisionalIndicator: boolean;
};
export type CourseState = { objective: string; current: number | null; phases: PhaseState[]; repeatIds: string[] };

// phaseRows: the ACTIVE phased questions of ONE objective; history: per question id; servable: ids the engine can
// still serve as NEW questions; windowFull: the servable set may be incomplete (capped window, no course fetch) —
// then an unserved row outside it is counted as pending instead of unservable.
export function courseState(objective: string, phaseRows: readonly Row[], history: ReadonlyMap<string, ItemHistory>, servable: ReadonlySet<string>, maxRepeats = MAX_REPEATS, windowFull = false): CourseState {
  const byRank = new Map<number, string[]>();
  for (const r of phaseRows) {
    const rank = phaseRank(r?.metadata);
    if (typeof r?.id !== "string" || rank === null || rank < 0) continue;
    if (!history.has(r.id) && !servable.has(r.id) && !windowFull) continue; // provably never answerable
    if (!byRank.has(rank)) byRank.set(rank, []);
    byRank.get(rank)!.push(r.id);
  }
  const phases: PhaseState[] = [...byRank.keys()].sort((a, b) => a - b).map((rank) => {
    const ids = byRank.get(rank)!;
    const statuses: Record<string, ItemStatus> = {};
    for (const id of ids) statuses[id] = itemStatus(history.get(id), maxRepeats);
    const vals = Object.values(statuses);
    const firstTimeCorrect = ids.filter((id) => history.get(id)?.firstCorrect === true).length;
    const allSecured = vals.every((s) => s === "secured");
    return {
      rank, ids, statuses, firstTimeCorrect, allSecured,
      completed: vals.every((s) => s === "secured" || s === "needs_support"),
      needsSupport: ids.filter((id) => statuses[id] === "needs_support"),
      provisionalIndicator: allSecured && firstTimeCorrect * 2 >= ids.length,
    };
  });
  const cur = phases.find((p) => !p.completed) ?? null;
  // Repeat only questions of the CURRENT phase whose latest answer is wrong and that may still be repeated, and only
  // once nothing of that phase is unserved or open (spacing: new questions of the phase come first).
  const repeatIds = cur && !Object.values(cur.statuses).some((s) => s === "unserved" || s === "open")
    ? cur.ids.filter((id) => cur.statuses[id] === "retry")
    : [];
  return { objective, current: cur ? cur.rank : null, phases, repeatIds };
}

export type GateResult<T> = { allowed: T[]; held: number; unknownPhase: string[]; courses: CourseState[]; repeatIds: string[] };

// Keeps the incoming order (authored order inside AUTHORED_ORDER_PHASES). A phased candidate is allowed only if its
// phase is its course's current phase; a course without a current phase is completed → nothing held.
export function gateByPhase<T extends Row>(candidates: readonly T[], courses: readonly CourseState[]): GateResult<T> {
  const current = new Map(courses.map((c) => [c.objective, c.current]));
  const allowed: T[] = [];
  const unknownPhase: string[] = [];
  let held = 0;
  for (const c of candidates) {
    const rank = phaseRank(c?.metadata);
    if (rank === null) { allowed.push(c); continue; }
    if (rank < 0) { unknownPhase.push(String(c?.id)); continue; }
    const lo = typeof c.learning_objective === "string" ? c.learning_objective : null;
    const cur = lo === null ? undefined : current.get(lo);
    if (cur === undefined || cur === null || rank <= cur) allowed.push(c);
    else held++;
  }
  // Authored order inside narrative phases: stable re-sort of just those candidates, in their own slots.
  const slots = allowed.map((c, i) => (AUTHORED_ORDER_PHASES.has(phaseRank(c?.metadata) ?? -9) ? i : -1)).filter((i) => i >= 0);
  const authored = slots.map((i) => allowed[i]).sort((a, b) => Number(a.difficulty_level ?? 0) - Number(b.difficulty_level ?? 0));
  slots.forEach((slot, k) => { allowed[slot] = authored[k]; });
  return { allowed, held, unknownPhase, courses: [...courses], repeatIds: courses.flatMap((c) => c.repeatIds) };
}

// ── IO ──────────────────────────────────────────────────────────────────────────────────────────────────────────
type Result = { data: unknown; error: unknown };
// The subset of a supabase-js client used here: chainable filters, awaitable; rpc for the per-course candidates.
export type PhaseQuery = PromiseLike<Result> & {
  eq: (column: string, value: unknown) => PhaseQuery;
  in: (column: string, values: unknown[]) => PhaseQuery;
};
export type PhaseReadClient = {
  from: (table: string) => { select: (columns: string) => PhaseQuery };
  rpc?: (fn: string, args: Record<string, unknown>) => PromiseLike<Result>;
};

// Pilot domains (the D-362 convention: `pilot_*`, which a teacher cannot assign — 20261109151000) are phased
// courses even when no NEW candidate of them is left: in the last phase only repeats remain, and the gate must still
// decide them. Regular domains never trigger a read.
export const isPilotDomain = (d: unknown): d is string => typeof d === "string" && d.startsWith("pilot_");

export type PhaseGateOptions = { level?: number | null };

export async function applyPhaseGate<T extends Row>(client: PhaseReadClient, studentId: string, candidates: readonly T[], scopeDomains: readonly string[] = [], options: PhaseGateOptions = {}): Promise<GateResult<T> & { applied: boolean; fetched: number }> {
  const objectives = [...new Set([
    ...candidates.filter((c) => phaseRank(c?.metadata) !== null && typeof c.learning_objective === "string").map((c) => c.learning_objective as string),
    ...scopeDomains.filter(isPilotDomain),
  ])];
  if (objectives.length === 0) return { allowed: [...candidates], held: 0, unknownPhase: [], courses: [], repeatIds: [], applied: false, fetched: 0 };
  if (typeof studentId !== "string" || studentId === "") throw new Error("phase gate: missing student id");

  // 0. Each phased course's own candidates (same level-engine RPC, that one domain): immune to the shared 50-window.
  let all: T[] = [...candidates];
  let windowFull = candidates.length >= ENGINE_CANDIDATE_LIMIT;
  let fetched = 0;
  const level = options.level;
  if (Number.isInteger(level) && typeof client.rpc === "function") {
    const seen = new Set(all.map((c) => c?.id));
    for (const o of objectives) {
      const r = await client.rpc("get_level_questions_for_student", { p_student_id: studentId, p_level: level, p_domains: [o], p_limit: COURSE_FETCH_LIMIT });
      if (r.error) throw r.error;
      for (const row of (Array.isArray(r.data) ? r.data as T[] : [])) {
        if (row && typeof row.id === "string" && !seen.has(row.id)) { seen.add(row.id); all.push(row); fetched++; }
      }
    }
    windowFull = false; // the course's own unserved questions are now all known (≤ COURSE_FETCH_LIMIT)
  }

  // 1. Every ACTIVE question of these objectives (the phased ones are picked in TS: metadata is jsonb). No content.
  const rows = await client.from("questions").select("id, learning_objective, metadata, difficulty_level").in("learning_objective", objectives).eq("is_active", true);
  if (rows.error) throw rows.error;
  const phaseRows = (Array.isArray(rows.data) ? rows.data as Row[] : []).filter((r) => phaseRank(r?.metadata) !== null);
  const ids = phaseRows.map((r) => r.id).filter((id): id is string => typeof id === "string");
  const history = new Map<string, ItemHistory>();
  if (ids.length > 0) {
    // 2. The VERIFIED pupil's own instances of those questions: state only, never the key.
    const inst = await client.from("question_instances").select("id, question_id, answered, was_correct, repeat_count").eq("student_id", studentId).in("question_id", ids);
    if (inst.error) throw inst.error;
    const instRows = Array.isArray(inst.data) ? inst.data as Record<string, unknown>[] : [];
    // 3. First-round verdicts (written once by advance_student_level; never changed by a repeat).
    const instIds = instRows.map((r) => r.id).filter((id): id is string => typeof id === "string");
    const first = new Map<string, boolean>();
    if (instIds.length > 0) {
      const fold = await client.from("student_level_fold_log").select("question_instance_id, was_correct").eq("student_id", studentId).in("question_instance_id", instIds);
      if (fold.error) throw fold.error;
      for (const f of (Array.isArray(fold.data) ? fold.data as Record<string, unknown>[] : [])) {
        if (typeof f.question_instance_id === "string" && typeof f.was_correct === "boolean") first.set(f.question_instance_id, f.was_correct);
      }
    }
    for (const r of instRows) {
      if (typeof r.question_id !== "string") continue;
      history.set(r.question_id, {
        answered: r.answered === true,
        open: r.answered !== true,
        wasCorrect: typeof r.was_correct === "boolean" ? r.was_correct : null,
        repeatCount: Number.isInteger(r.repeat_count) ? r.repeat_count as number : 0,
        firstCorrect: typeof r.id === "string" && first.has(r.id) ? first.get(r.id)! : null,
      });
    }
  }
  const servable = new Set(all.map((c) => c?.id).filter((id): id is string => typeof id === "string"));
  const courses = objectives.map((o) => courseState(o, phaseRows.filter((r) => r.learning_objective === o), history, servable, MAX_REPEATS, windowFull));
  return { ...gateByPhase(all, courses), applied: true, fetched };
}
