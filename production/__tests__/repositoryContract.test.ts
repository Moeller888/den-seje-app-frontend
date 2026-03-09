import type { QuestionRepository } from "../repository/questionRepository.ts";
import type { QuestionMetaProjection } from "../policy/types.ts";
import { dryRunCompleteness } from "../batch/dryRunCompleteness.ts";

class MockRepository implements QuestionRepository {
  constructor(private data: QuestionMetaProjection[]) {}

  async fetchByObjectives(_objectives: string[]): Promise<QuestionMetaProjection[]> {
    return this.data;
  }

  async insertDraftQuestion(): Promise<void> {
    // no-op
  }

  async activateBatch(): Promise<number> {
    return 0;
  }
}

Deno.test("Completeness depends only on repository interface", async () => {
  const objectives = ["HIST-01_start_year"];

  const mockData: QuestionMetaProjection[] = [
    {
      objective: "HIST-01_start_year",
      cognitive: "recall",
      status: "active",
    },
  ];

  const repo = new MockRepository(mockData);

  const existing = await repo.fetchByObjectives(objectives);

  const result = dryRunCompleteness(objectives, existing);

  if (result.incompleteObjectives.length !== 0) {
    throw new Error("Completeness improperly depends on Supabase.");
  }
});
