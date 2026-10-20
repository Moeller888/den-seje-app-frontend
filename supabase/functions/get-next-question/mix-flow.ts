// The server reads behind the format mix (get-next-question v2 / shadow), and nothing else.
//
// Three calls, in parallel, through the BACKEND client and always scoped to the verified student id:
//   1. get_question_candidates_for_student — the stratified per-pupil window of SERVABLE unserved
//      questions (migration 20261019150000; service_role only, it carries the answer key, which never
//      leaves the server);
//   2. the pupil's newest HISTORY_LIMIT question_instances with only the classifying fields of their
//      question (no content, no key: content->force_text is the one JSON key read) — the mix window;
//   3. advance_student_band — folds any new verdicts into the server-owned band and returns it
//      (./server-band.ts explains the model; the only write here, and only to student_band_state).
// It then orders the candidates (./format-mix.ts). Every error is thrown to index.ts's outer catch (a
// loud 500), never swallowed, and a malformed band result is an error, never a default band.
//
// This module is used only when QUESTION_MIX_ENGINE is "shadow" or "v2". Under "v1" (the default) it
// is never called, so deploying it before the migration is applied changes nothing.
//
// Pure TypeScript with no Deno or network imports; the client is passed in, so the Node unit suite
// drives it with a recording stub and with a real supabase-js client on a captured fetch.

import { parseServerBand, type ServerBand } from "./server-band.ts";
import { MIX_POLICY, planNextQuestions, toMixHistory, type MixCandidate, type MixPlan } from "./format-mix.ts";

export const CANDIDATES_RPC = "get_question_candidates_for_student";
export const BAND_RPC = "advance_student_band";
export const CANDIDATES_PER_GROUP = 20;
export const HISTORY_LIMIT = MIX_POLICY.windowSize;
export const HISTORY_SELECT =
  "created_at, questions ( answer_format, answer_type, difficulty_band, learning_objective, force_text:content->force_text )";

type Result = { data: unknown; error: unknown };
// The minimal surface of a supabase-js client that this module touches.
export type MixReadClient = {
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

export type MixFlowInput = {
  studentId: string;
  grade: number | null;
  domains: string[];
  wavePhase: string;
  lastMisconceptionType: string | null;
};

export type MixFlowResult = { plan: MixPlan<MixCandidate>; band: ServerBand };

export async function loadFormatMixPlan(client: MixReadClient, input: MixFlowInput): Promise<MixFlowResult> {
  if (typeof input.studentId !== "string" || input.studentId.length === 0) {
    throw new Error("format mix: missing student id");
  }

  const [candidates, history, bandResult] = await Promise.all([
    client.rpc(CANDIDATES_RPC, {
      p_student_id: input.studentId,
      p_grade: input.grade,
      p_domains: input.domains,
      p_per_group: CANDIDATES_PER_GROUP,
    }),
    client.from("question_instances")
      .select(HISTORY_SELECT)
      .eq("student_id", input.studentId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT),
    client.rpc(BAND_RPC, { p_student_id: input.studentId, p_grade: input.grade }),
  ]);

  if (candidates.error) throw candidates.error;
  if (history.error) throw history.error;
  if (bandResult.error) throw bandResult.error;

  const band = parseServerBand(bandResult.data);

  const plan = planNextQuestions({
    candidates: (Array.isArray(candidates.data) ? candidates.data : []) as MixCandidate[],
    history: toMixHistory(Array.isArray(history.data) ? history.data : []),
    targetBand: band.band,
    wavePhase: input.wavePhase,
    lastMisconceptionType: input.lastMisconceptionType,
  });

  return { plan, band };
}
