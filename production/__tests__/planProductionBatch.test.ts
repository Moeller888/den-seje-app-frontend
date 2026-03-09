import type { QuestionRepository } from "../repository/questionRepository.ts";
import type { QuestionMetaProjection } from "../policy/types.ts";
import { planProductionBatch } from "../batch/planProductionBatch.ts";

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

Deno.test("planProductionBatch delegates to completeness correctly", async () => {
  const objectives = ["HIST-01_start_year"];

  const mockData: QuestionMetaProjection[] = [
    {
      objective: "HIST-01_start_year",
      cognitive: "recall",
      status: "active",
    },
  ];

  const repo = new MockRepository(mockData);

  const result = await planProductionBatch(objectives, repo);

  if (result.incompleteObjectives.length !== 0) {
    throw new Error("planProductionBatch contains hidden logic.");
  }

  if (result.totalObjectives !== 1) {
    throw new Error("Incorrect objective count.");
  }
});
