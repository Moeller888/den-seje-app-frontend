import type { QuestionContract } from "../../packages/question-contract/src/schema/questionContract.ts";

export function generateQuestion(index: number): QuestionContract {

  const logicalId = `ww2_europe_conflict_${index}_end_year`;
  const learningObjective = `ww2_europe_conflict_${index}_end_year`;

  return {
    meta: {
      schema_version: 1,
      domain: "ww2",
      logical_question_id: logicalId,
      version: 1,
      status: "draft"
    },
    pedagogy: {
      learning_objective: learningObjective,
      difficulty_declared: 3,
      cognitive_level: "recall",
      tags: ["ww2", "europe"]
    },
    content: {
      type: "number_input",
      prompt: `Hvilket år sluttede Anden Verdenskrig i Europa? (${index})`,
      context: null,
      unit: null,
      min: null,
      max: null
    },
    answer: {
      format: "year",
      value: 1945,
      tolerance: {
        plus_minus: 0
      }
    },
    quality: {
      author: "ai",
      review_required: true
    }
  };
}
