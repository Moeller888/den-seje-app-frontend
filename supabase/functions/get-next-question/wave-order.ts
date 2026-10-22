// NUZO wave ordering for question candidates — getWaveScore and sortByWave, MOVED VERBATIM out of
// index.ts (2026-10-19) so the format mix (./format-mix.ts), the Node unit suite and the selection
// simulation run exactly the ordering the Edge Function runs. Only `export` was added; the scoring
// itself is unchanged and is pinned by tests/unit/question-format-mix.test.mjs.
//
// Pure TypeScript with no Deno or network imports.

// NUZO wave scoring: higher score = preferred for this wave phase.
// Reads conceptual tension dimensions — not just difficulty.
// Uses: difficulty_type, cognitive_skill, misconception_type (recovery targeting),
//       insight_type (perspective_shift / reframing / conceptual_bridge),
//       challenge_role (reinforcement / challenge / deep_challenge).
// Optional: questionBand + targetBand give difficulty-band preference bonus (+6 exact, +3 adjacent).
// Questions without metadata score 0 — no preference, existing order preserved.
export function getWaveScore(
  metadata: any,
  wavePhase: string,
  lastMisconceptionType: string | null,
  questionBand: number | null = null,
  targetBand: number | null = null
): number {
  if (!metadata || typeof metadata !== "object") return 0;

  const difficultyType    = metadata.difficulty_type    ?? null;
  const cognitiveSkill    = metadata.cognitive_skill    ?? null;
  const misconceptionType = metadata.misconception_type ?? null;
  const insightType       = metadata.insight_type       ?? null;
  const challengeRole     = metadata.challenge_role     ?? null;
  let score = 0;

  switch (wavePhase) {
    case "recovery":
      // Genopbygning: prefer factual/recall to restore conceptual ground
      if (difficultyType === "factual") score += 10;
      if (cognitiveSkill === "recall")  score += 5;
      // Targeted recovery: same misconception type helps address root confusion
      if (lastMisconceptionType && misconceptionType === lastMisconceptionType) score += 8;
      // Prefer stabilisering-role objects — safe re-entry after destabilization
      if (challengeRole === "reinforcement") score += 6;
      // Prefer conceptual_bridge insights — gentler entry point, lower tension
      if (insightType === "conceptual_bridge") score += 4;
      break;

    case "reinforcement":
      // Stabilisering: consolidate unstable understanding, reduce cognitive load
      if (difficultyType === "conceptual")    score += 8;
      if (cognitiveSkill === "comprehension") score += 5;
      // Prefer reinforcement-role objects for direct role alignment
      if (challengeRole === "reinforcement") score += 5;
      // Prefer reframing insights — shift perspective without high tension
      if (insightType === "reframing") score += 4;
      break;

    case "deep_challenge":
      // Begrebsovergang: shift abstraction level, require synthesis
      if (difficultyType === "analytical") score += 10;
      if (difficultyType === "applied")    score += 7;
      if (cognitiveSkill === "synthesis" || cognitiveSkill === "evaluation") score += 5;
      // Prefer deep_challenge-role objects for direct role alignment
      if (challengeRole === "deep_challenge") score += 6;
      // Prefer perspective_shift insights — require reconsidering assumptions
      if (insightType === "perspective_shift") score += 5;
      break;

    case "challenge":
    default:
      // Tankespænding: balanced productive tension — conceptual without overwhelming
      if (difficultyType === "conceptual" || difficultyType === "applied") score += 3;
      // Prefer challenge-role objects
      if (challengeRole === "challenge") score += 4;
      // Prefer conceptual_bridge or reframing — introductory tension types
      if (insightType === "conceptual_bridge" || insightType === "reframing") score += 2;
      break;
  }

  // Difficulty-band preference: +6 for exact match, +3 for adjacent band
  if (questionBand !== null && targetBand !== null) {
    const diff = Math.abs(questionBand - targetBand);
    if (diff === 0) score += 6;
    else if (diff === 1) score += 3;
  }

  return score;
}

// targetBand: optional difficulty band target from adaptive difficulty engine.
// When provided, band-matching bonus is included in wave scores.
export function sortByWave(
  questions: any[],
  wavePhase: string,
  lastMisconceptionType: string | null,
  targetBand: number | null = null
): any[] {
  if (wavePhase === "challenge" && targetBand === null) return questions; // No reordering needed
  return [...questions].sort((a, b) => {
    const aBand = (a.difficulty_band as number | null) ?? null;
    const bBand = (b.difficulty_band as number | null) ?? null;
    const aScore = getWaveScore(a.metadata, wavePhase, lastMisconceptionType, aBand, targetBand);
    const bScore = getWaveScore(b.metadata, wavePhase, lastMisconceptionType, bBand, targetBand);
    return bScore - aScore; // Descending: highest score = first
  });
}
