import type { QuestionRepository } from "../repository/questionRepository.ts";
import { dryRunCompleteness } from "./dryRunCompleteness.ts";

export async function planProductionBatch(
  objectives: string[],
  repository: QuestionRepository,
) {
  const existing = await repository.fetchByObjectives(objectives);

  const result = dryRunCompleteness(objectives, existing);

  return result;
}
