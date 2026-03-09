import type { QuestionRow } from "./types.ts";
import type { QuestionMetaProjection } from "../policy/types.ts";
import type { CognitiveLevel } from "../progressionPolicy.ts";
import { QuestionStatus } from "../../question-contract/mod.ts";

/**
 * Structural guard.
 * Validates DB shape against domain contract.
 */
function assertCognitiveLevel(value: string): CognitiveLevel {
  if (
    value === "recall" ||
    value === "explain" ||
    value === "analyze"
  ) {
    return value;
  }

  throw new Error(`Invalid cognitive level in DB: ${value}`);
}

/**
 * Structural guard for QuestionStatus.
 */
function assertQuestionStatus(value: string): QuestionStatus {
  if (Object.values(QuestionStatus).includes(value as QuestionStatus)) {
    return value as QuestionStatus;
  }

  throw new Error(`Invalid question status in DB: ${value}`);
}

export function mapRowToMetaProjection(
  row: QuestionRow,
): QuestionMetaProjection {
  return {
    objective: row.objective,
    cognitive: assertCognitiveLevel(row.cognitive_level),
    status: assertQuestionStatus(row.status),
  };
}
