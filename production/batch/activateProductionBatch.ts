import type { QuestionRepository } from "../repository/questionRepository.ts";

/**
 * Activates all draft questions belonging to a batch.
 * No policy logic.
 * No completeness logic.
 * Pure orchestration.
 */
export async function activateProductionBatch(
  batchId: string,
  repository: QuestionRepository,
): Promise<number> {
  if (!batchId) {
    throw new Error("activateProductionBatch requires a valid batchId.");
  }

  return repository.activateBatch(batchId);
}
