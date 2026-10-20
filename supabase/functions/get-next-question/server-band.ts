// The pupil's difficulty band, derived on the SERVER from data the pupil cannot write.
//
// WHY. get-next-question has always taken the target band from the request body
// (current_difficulty_band), which app.js computes and also persists to profiles.current_band — a
// column the pupil may update. The band steers which questions are preferred, so under the format
// mix (./format-mix.ts) it must be a server decision: a browser that sends band 1 must not be able to
// pull itself onto the easiest questions, nor make a quota fill itself with too-easy items.
//
// THE RULE — the same one app.js uses (adjustDifficultyBand), replayed over server-owned history:
//   seed   placement_sessions.band of a COMPLETED placement (written only by submit_placement, no client
//          access), otherwise the grade's start band (app.js GRADE_START_BAND), otherwise 2;
//   replay the pupil's most recent auto-graded verdicts (question_instances.was_correct, written only by
//          the answer path), oldest first: 3 correct in a row → +1 (max 5), 2 incorrect in a row → -1
//          (min 1), each step resets its counter.
// Only the last REPLAY_LIMIT verdicts are replayed, starting from the seed, so the result is bounded
// work per request and still converges: 3 answers per band step means 60 answers cover any climb.
// profiles.current_band, profiles.placement_band and the request body are deliberately NOT inputs.
//
// Pure TypeScript with no Deno or network imports.

export const GRADE_START_BAND: Readonly<Record<number, number>> = Object.freeze({
  3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 2, 9: 3,
});
export const DEFAULT_START_BAND = 2;
export const MIN_BAND = 1;
export const MAX_BAND = 5;
export const REPLAY_LIMIT = 60;
const UP_AFTER_CORRECT = 3;
const DOWN_AFTER_INCORRECT = 2;

export type PlacementSeed = { band?: unknown; completed_at?: unknown } | null | undefined;
export type Verdict = { was_correct?: unknown; answered_at?: unknown };

export type ServerBand = {
  band: number;
  seed: number;
  seedSource: "placement" | "grade" | "default";
  replayed: number;
};

function isBand(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= MIN_BAND && (value as number) <= MAX_BAND;
}

// verdicts: any order; rows without a boolean verdict (open, teacher-graded, repeat in progress) and
// without an answered_at are ignored.
export function deriveServerBand(
  grade: number | null,
  placement: PlacementSeed,
  verdicts: readonly Verdict[] | null | undefined,
): ServerBand {
  let seed = DEFAULT_START_BAND;
  let seedSource: ServerBand["seedSource"] = "default";

  if (placement && typeof placement === "object" && placement.completed_at && isBand(placement.band)) {
    seed = placement.band;
    seedSource = "placement";
  } else if (grade !== null && isBand(GRADE_START_BAND[grade])) {
    seed = GRADE_START_BAND[grade];
    seedSource = "grade";
  }

  const answered = (Array.isArray(verdicts) ? verdicts : [])
    .filter((v) => v && typeof v.was_correct === "boolean" && typeof v.answered_at === "string"
      && !Number.isNaN(Date.parse(v.answered_at as string)))
    .map((v) => ({ correct: v.was_correct as boolean, at: Date.parse(v.answered_at as string) }))
    .sort((a, b) => a.at - b.at)
    .slice(-REPLAY_LIMIT);

  let band = seed;
  let correctRun = 0;
  let incorrectRun = 0;
  for (const v of answered) {
    if (v.correct) {
      incorrectRun = 0;
      correctRun++;
      if (correctRun >= UP_AFTER_CORRECT && band < MAX_BAND) {
        band++;
        correctRun = 0;
      }
    } else {
      correctRun = 0;
      incorrectRun++;
      if (incorrectRun >= DOWN_AFTER_INCORRECT && band > MIN_BAND) {
        band--;
        incorrectRun = 0;
      }
    }
  }

  return { band, seed, seedSource, replayed: answered.length };
}
