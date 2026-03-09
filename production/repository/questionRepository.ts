import type { QuestionMetaProjection } from "../policy/types.ts";
import type { CognitiveLevel } from "../progressionPolicy.ts";

export interface QuestionRepository {
  fetchByObjectives(objectives: string[]): Promise<QuestionMetaProjection[]>;

  insertDraftQuestion(input: {
    objective: string;
    cognitive: CognitiveLevel;
    content: string;
    answer: string;
    contentHash: string;
    batchId: string;
  }): Promise<void>;

  activateBatch(batchId: string): Promise<number>;
}
