import { findIncompleteObjectives } from "../policy/findIncompleteObjectives.ts";
import type { QuestionMetaProjection } from "../policy/types.ts";

export interface DryRunResult {
  totalObjectives: number;
  incompleteObjectives: string[];
}

export function dryRunCompleteness(
  objectives: string[],
  existing: QuestionMetaProjection[]
): DryRunResult {
  const incomplete = findIncompleteObjectives(objectives, existing);

  return {
    totalObjectives: objectives.length,
    incompleteObjectives: incomplete,
  };
}
