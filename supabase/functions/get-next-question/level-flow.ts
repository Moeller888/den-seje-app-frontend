// The level engine (sværhedsskala 1–10.000) for get-next-question: which new questions are tried first
// when the Edge secret LEVEL_ENGINE is "v1". Unset (or anything else) = "off" = today's selection,
// byte-for-byte: nothing in this file is called.
//
// THE FLOW, per request, through the BACKEND client and always for the verified student id:
//   1. advance_student_level(student, subject, grade) — creates the pupil's level for the subject on
//      first use and folds every new first, auto-graded verdict into it exactly once (migration
//      20261029120000; the only write, and only to student_subject_level / student_level_fold_log);
//   2. get_level_questions_for_student(student, level, domains) — active, levelled, servable, never
//      served questions, nearest level first (no grade ceiling);
//   3. ordering: the candidates are re-expressed as a band RELATIVE to the pupil
//      (relativeBand: 3 = the pupil's own cell of the scale, ±1 per cell of 10000/35 levels), so the
//      existing orderings work unchanged with target band 3:
//        QUESTION_MIX_ENGINE "v2": planNextQuestions (./format-mix.ts) picks the interaction kind and
//          orders within it (band tier → wave → fresh domain → nearest level);
//        otherwise: orderByLevel — level tier (within one cell) first, the wave score within a tier.
//      Nearest level stays the last tie-breaker, because the SQL order is kept by the stable sorts.
// Every error is thrown to index.ts's outer catch (a loud 500), never swallowed; a malformed level
// result is an error, never a default level.
//
// Pure TypeScript with no Deno or network imports, so the Node unit suite tests exactly what the Edge
// Function runs.

import { sortByWave } from "./wave-order.ts";
import { HISTORY_LIMIT, HISTORY_SELECT } from "./mix-flow.ts";
import { planNextQuestions, toMixHistory, type MixCandidate, type MixEngine } from "./format-mix.ts";

export type LevelEngine = "off" | "v1";
export function resolveLevelEngine(value: unknown): LevelEngine {
  return value === "v1" ? "v1" : "off";
}

export const LEVEL_RPC = "advance_student_level";
export const LEVEL_CANDIDATES_RPC = "get_level_questions_for_student";
export const LEVEL_REPEAT_RPC = "request_repeat_level_question_for_student";
export const LEVEL_CANDIDATE_LIMIT = 50;
export const MIN_LEVEL = 1;
export const MAX_LEVEL = 10000;
export const CELL_WIDTH = 10000 / 35;
export const RELATIVE_TARGET_BAND = 3;

export type Subject = "historie" | "engelsk" | "dansk";

// The step rule of design §6 / owner decision B3 — the TS twin of advance_student_level, kept in
// lock-step by a parity test.
export function levelStep(answered: number): number {
  return Math.max(15, Math.round(150 / Math.sqrt(answered + 1)));
}

export function foldLevel(
  state: { level: number; answered: number },
  verdicts: readonly boolean[],
): { level: number; answered: number } {
  let { level, answered } = state;
  for (const correct of verdicts) {
    const step = levelStep(answered);
    level = correct ? Math.min(MAX_LEVEL, level + step) : Math.max(MIN_LEVEL, level - 3 * step);
    answered++;
  }
  return { level, answered };
}

export type ServerLevel = {
  level: number;
  seedLevel: number;
  seedSource: "placement" | "grade" | "default";
  answered: number;
  newlyFolded: number;
};

function isLevel(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= MIN_LEVEL && (value as number) <= MAX_LEVEL;
}

// The RPC returns a one-row set. Anything else is an error, never a guessed level.
export function parseServerLevel(data: unknown): ServerLevel {
  const row = Array.isArray(data) ? data[0] : data;
  const r = row && typeof row === "object" ? row as Record<string, unknown> : null;
  if (!r || !isLevel(r.level) || !isLevel(r.seed_level)
    || !["placement", "grade", "default"].includes(r.seed_source as string)
    || !Number.isInteger(r.answered) || (r.answered as number) < 0
    || !Number.isInteger(r.newly_folded) || (r.newly_folded as number) < 0) {
    throw new Error(`level engine: malformed ${LEVEL_RPC} result`);
  }
  return {
    level: r.level as number,
    seedLevel: r.seed_level as number,
    seedSource: r.seed_source as ServerLevel["seedSource"],
    answered: r.answered as number,
    newlyFolded: r.newly_folded as number,
  };
}

// 3 = the pupil's own cell, 2/4 = one cell below/above, 1/5 = two or more cells away.
export function relativeBand(questionLevel: number, pupilLevel: number): number {
  const cells = Math.round((questionLevel - pupilLevel) / CELL_WIDTH);
  return Math.min(5, Math.max(1, RELATIVE_TARGET_BAND + cells));
}

export type LevelCandidate = MixCandidate & { difficulty_level?: unknown };

// Re-expresses each candidate's band relative to the pupil. A candidate without a valid level is
// DROPPED: the level engine never serves a question without a difficulty_level (defence in depth —
// the SQL already excludes them).
export function toLevelRelative<T extends LevelCandidate>(candidates: readonly T[] | null | undefined, pupilLevel: number): T[] {
  if (!Array.isArray(candidates)) return [];
  return candidates
    .filter((c) => c && typeof c === "object" && typeof c.id === "string" && isLevel(c.difficulty_level))
    .map((c) => ({ ...c, difficulty_band: relativeBand(c.difficulty_level as number, pupilLevel) }));
}

// Without the format mix: level tier first (within one cell of the pupil), the NUZO wave score inside
// each tier, nearest level (the incoming order) as the stable tie-breaker.
export function orderByLevel<T extends LevelCandidate>(
  relative: readonly T[],
  wavePhase: string,
  lastMisconceptionType: string | null,
): T[] {
  const near = (c: T) => Math.abs((c.difficulty_band as number) - RELATIVE_TARGET_BAND) <= 1;
  const tier = (rows: T[]) => sortByWave(rows, wavePhase, lastMisconceptionType, RELATIVE_TARGET_BAND) as T[];
  return [...tier(relative.filter(near)), ...tier(relative.filter((c) => !near(c)))];
}

type Result = { data: unknown; error: unknown };
export type LevelReadClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<Result>;
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: unknown) => {
        order: (column: string, opts: { ascending: boolean }) => {
          limit: (count: number) => PromiseLike<Result>;
        };
      };
    };
  };
};

export type LevelFlowInput = {
  studentId: string;
  subject: Subject;
  grade: number | null;
  domains: string[];
  wavePhase: string;
  lastMisconceptionType: string | null;
  mixEngine: MixEngine;
};

export type LevelFlowResult = {
  ordered: LevelCandidate[];
  level: ServerLevel;
  mixKind: string | null;
};

export async function loadLevelPlan(client: LevelReadClient, input: LevelFlowInput): Promise<LevelFlowResult> {
  if (typeof input.studentId !== "string" || input.studentId.length === 0) {
    throw new Error("level engine: missing student id");
  }
  if (!["historie", "engelsk", "dansk"].includes(input.subject)) {
    throw new Error("level engine: invalid subject");
  }

  // 1. Fold first: the candidates are chosen around the level the newest answers produced.
  const levelResult = await client.rpc(LEVEL_RPC, {
    p_student_id: input.studentId,
    p_subject: input.subject,
    p_grade: input.grade,
  });
  if (levelResult.error) throw levelResult.error;
  const level = parseServerLevel(levelResult.data);

  // 2. Candidates around it (+ the mix window when the format mix is on).
  const [candidates, history] = await Promise.all([
    client.rpc(LEVEL_CANDIDATES_RPC, {
      p_student_id: input.studentId,
      p_level: level.level,
      p_domains: input.domains,
      p_limit: LEVEL_CANDIDATE_LIMIT,
    }),
    input.mixEngine === "v2"
      ? client.from("question_instances")
        .select(HISTORY_SELECT)
        .eq("student_id", input.studentId)
        .order("created_at", { ascending: false })
        .limit(HISTORY_LIMIT)
      : Promise.resolve({ data: [], error: null } as Result),
  ]);
  if (candidates.error) throw candidates.error;
  if (history.error) throw history.error;

  const relative = toLevelRelative(candidates.data as LevelCandidate[], level.level);

  // 3. Order.
  if (input.mixEngine === "v2") {
    const plan = planNextQuestions({
      candidates: relative,
      history: toMixHistory(Array.isArray(history.data) ? history.data : []),
      targetBand: RELATIVE_TARGET_BAND,
      wavePhase: input.wavePhase,
      lastMisconceptionType: input.lastMisconceptionType,
    });
    return { ordered: plan.ordered, level, mixKind: plan.decision.kind };
  }
  return { ordered: orderByLevel(relative, input.wavePhase, input.lastMisconceptionType), level, mixKind: null };
}

// Which selection and which repeat RPC a request uses, for the four flag combinations (+ "shadow").
export type SelectionRoute = {
  newQuestions: "v1" | "mix" | "level" | "level+mix";
  shadowMix: boolean;
  repeatRpc: string;
  repeatArgs: "student+grade+domains" | "student+domains";
  wireFormat: "map" | "servable";
};

export function chooseSelectionRoute(mixEngine: MixEngine, levelEngine: LevelEngine): SelectionRoute {
  const wireFormat = mixEngine === "v2" ? "servable" : "map";
  if (levelEngine === "v1") {
    return {
      newQuestions: mixEngine === "v2" ? "level+mix" : "level",
      shadowMix: false,
      repeatRpc: LEVEL_REPEAT_RPC,
      repeatArgs: "student+domains",
      wireFormat,
    };
  }
  return {
    newQuestions: mixEngine === "v2" ? "mix" : "v1",
    shadowMix: mixEngine === "shadow",
    repeatRpc: mixEngine === "v2" ? "request_repeat_question_servable_for_student" : "request_repeat_question_for_student",
    repeatArgs: "student+grade+domains",
    wireFormat,
  };
}
