import { isObjectiveComplete } from "./isObjectiveComplete.ts";
import type { QuestionMetaProjection } from "./types.ts";

export function findIncompleteObjectives(
  objectives: string[],
  existing: QuestionMetaProjection[]
): string[] {
  const incomplete: string[] = [];

  for (const objective of objectives) {
    const complete = isObjectiveComplete(objective, existing);

    if (!complete) {
      incomplete.push(objective);
    }
  }

  return incomplete;
}
