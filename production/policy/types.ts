import type { CognitiveLevel } from "../progressionPolicy.ts";
import type { QuestionStatus } from "../../packages/question-contract/src/schema/enums.ts";

export interface QuestionMetaProjection {
  objective: string;
  cognitive: CognitiveLevel;
  status: QuestionStatus;
}
