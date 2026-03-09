import { SUFFIX_REGISTRY, type Suffix } from "../objectiveTaxonomy.ts";
import type { QuestionMetaProjection } from "./types.ts";

function extractSuffix(objective: string): Suffix {
  const knownSuffixes = Object.keys(SUFFIX_REGISTRY)
    .sort((a, b) => b.length - a.length) as Suffix[];

  const match = knownSuffixes.find((suffix) =>
    objective.endsWith(suffix)
  );

  if (!match) {
    throw new Error(
      "[isObjectiveComplete] Unknown suffix in objective: " + objective
    );
  }

  return match;
}

export function isObjectiveComplete(
  objective: string,
  existing: QuestionMetaProjection[]
): boolean {
  const suffix = extractSuffix(objective);

  const registryEntry = SUFFIX_REGISTRY[suffix];

  if (!registryEntry) {
    throw new Error(
      "[isObjectiveComplete] Registry lookup failed for suffix: " + suffix
    );
  }

  const requiredLevels = registryEntry.cognitive;

  const activeByLevel = new Map<typeof requiredLevels[number], number>();

  for (const q of existing) {
    if (q.objective !== objective) continue;
    if (q.status !== "active") continue;

    activeByLevel.set(
      q.cognitive,
      (activeByLevel.get(q.cognitive) ?? 0) + 1
    );
  }

  for (const level of requiredLevels) {
    const count = activeByLevel.get(level) ?? 0;

    if (count !== 1) {
      return false;
    }
  }

  return true;
}
