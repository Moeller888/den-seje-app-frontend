// The pupil's difficulty band, owned by the SERVER.
//
// WHY. get-next-question has always taken the target band from the request body
// (current_difficulty_band), which app.js computes and persists to profiles.current_band — a column
// the pupil may update. Under the format mix (./format-mix.ts) the band decides which questions
// qualify, so it must be a server decision: a browser that sends band 1 must not be able to pull
// itself onto the easiest questions, nor make a quota fill itself with too-easy items.
//
// WHERE IT LIVES. public.advance_student_band (migration 20261019150000) folds every verdict the
// server has recorded (question_instances.was_correct) into public.student_band_state, EXACTLY ONCE,
// in (answered_at, id) order, behind a cursor. That keeps earned progression for ever — an earlier
// design that replayed only the newest N verdicts from the seed lost it: 12 correct answers reached
// band 5 and 60 further alternating answers dropped it back to 1, because the climb had left the
// window. A repeat that is answered again gets a new answered_at and is folded as the new attempt it
// is; question_instances keeps only the latest verdict, so only a stateful fold can count both.
//
// THIS FILE is the rule's TypeScript specification, used by the simulation and pinned against the
// SQL fold by tests/unit/question-format-mix-migration-run.test.mjs, plus the strict reader of the
// RPC result the Edge Function gets back. The rule is app.js's adjustDifficultyBand:
//   3 correct in a row → +1 (max 5), 2 incorrect in a row → −1 (min 1), each step resets its counter;
//   seed = a COMPLETED placement band, else the grade's start band (app.js GRADE_START_BAND), else 2.
// profiles.current_band, profiles.placement_band and the request body are deliberately NOT inputs.
//
// Pure TypeScript with no Deno or network imports.

export const GRADE_START_BAND: Readonly<Record<number, number>> = Object.freeze({
  3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 2, 9: 3,
});
export const DEFAULT_START_BAND = 2;
export const MIN_BAND = 1;
export const MAX_BAND = 5;
const UP_AFTER_CORRECT = 3;
const DOWN_AFTER_INCORRECT = 2;

export type SeedSource = "placement" | "grade" | "default";
export type PlacementSeed = { band?: unknown; completed_at?: unknown } | null | undefined;
export type Verdict = { id?: unknown; was_correct?: unknown; answered_at?: unknown };
export type FoldState = { band: number; correctRun: number; incorrectRun: number; folded: number };

export type ServerBand = {
  band: number;
  seed: number;
  seedSource: SeedSource;
  folded: number;
  newlyFolded: number;
};

function isBand(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= MIN_BAND && (value as number) <= MAX_BAND;
}

export function startBand(grade: number | null, placement: PlacementSeed): { seed: number; seedSource: SeedSource } {
  if (placement && typeof placement === "object" && placement.completed_at && isBand(placement.band)) {
    return { seed: placement.band, seedSource: "placement" };
  }
  if (grade !== null && isBand(GRADE_START_BAND[grade])) return { seed: GRADE_START_BAND[grade], seedSource: "grade" };
  return { seed: DEFAULT_START_BAND, seedSource: "default" };
}

export function initialFoldState(seed: number): FoldState {
  return { band: seed, correctRun: 0, incorrectRun: 0, folded: 0 };
}

// Folds verdicts into a state, in (answered_at, id) order — the SQL function's exact order. Rows
// without a boolean verdict or a parseable answered_at are skipped. Counters are capped at their
// thresholds (3 / 2) like the SQL column checks; that never changes a result, because a counter is only
// compared against its threshold and is reset by the opposite verdict.
export function foldBand(state: FoldState, verdicts: readonly Verdict[] | null | undefined): FoldState {
  const rows = (Array.isArray(verdicts) ? verdicts : [])
    .filter((v) => v && typeof v.was_correct === "boolean" && typeof v.answered_at === "string"
      && !Number.isNaN(Date.parse(v.answered_at as string)))
    .map((v) => ({ correct: v.was_correct as boolean, at: Date.parse(v.answered_at as string), id: String(v.id ?? "") }))
    .sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  let { band, correctRun, incorrectRun, folded } = state;
  for (const v of rows) {
    if (v.correct) {
      incorrectRun = 0;
      correctRun = Math.min(correctRun + 1, UP_AFTER_CORRECT);
      if (correctRun >= UP_AFTER_CORRECT && band < MAX_BAND) {
        band++;
        correctRun = 0;
      }
    } else {
      correctRun = 0;
      incorrectRun = Math.min(incorrectRun + 1, DOWN_AFTER_INCORRECT);
      if (incorrectRun >= DOWN_AFTER_INCORRECT && band > MIN_BAND) {
        band--;
        incorrectRun = 0;
      }
    }
    folded++;
  }
  return { band, correctRun, incorrectRun, folded };
}

// Reads the advance_student_band RPC result (a one-row table). Anything else is an error — the
// caller turns it into a loud 500, never a silent default band.
export function parseServerBand(data: unknown): ServerBand {
  const row = Array.isArray(data) ? (data.length === 1 ? data[0] : null) : data;
  if (!row || typeof row !== "object") throw new Error("advance_student_band: no result row");
  const r = row as Record<string, unknown>;
  const source = r.seed_source;
  if (!isBand(r.band) || !isBand(r.seed)
    || (source !== "placement" && source !== "grade" && source !== "default")
    || !Number.isInteger(r.folded) || (r.folded as number) < 0
    || !Number.isInteger(r.newly_folded) || (r.newly_folded as number) < 0) {
    throw new Error("advance_student_band: malformed result");
  }
  return { band: r.band, seed: r.seed, seedSource: source, folded: r.folded as number, newlyFolded: r.newly_folded as number };
}
