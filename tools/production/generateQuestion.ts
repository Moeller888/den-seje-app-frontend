import type { QuestionContract } from "../../packages/question-contract/src/schema/questionContract.ts";

function chooseCognitive(index: number): "recall" | "explain" | "analyze" {

  if (index % 3 === 0) return "analyze";
  if (index % 2 === 0) return "explain";

  return "recall";
}

function chooseType(cognitive: string): "number_input" | "short_text" | "essay" {

  if (cognitive === "recall") return "number_input";
  if (cognitive === "explain") return "short_text";
  if (cognitive === "analyze") return "essay";

  return "short_text";
}

export function generateQuestion(index: number): QuestionContract {

  const cognitive = chooseCognitive(index);
  const questionType = chooseType(cognitive);

  const logicalId = `ww2_europe_conflict_${index}_end_year`;
  const learningObjective = `ww2_europe_conflict_${index}_end_year`;

  let prompt = "";
  let answerFormat: "year" | "text" = "year";
  let answerValue: any = 1945;

  if (cognitive === "recall") {

    prompt = `Hvilket år sluttede Anden Verdenskrig i Europa? (${index})`;

    answerFormat = "year";
    answerValue = 1945;

  } else if (cognitive === "explain") {

    prompt = `Forklar hvorfor Anden Verdenskrig sluttede i Europa i 1945. (${index})`;

    answerFormat = "text";
    answerValue = "Germany surrendered in 1945";

  } else {

    prompt = `Analyser hvorfor afslutningen på Anden Verdenskrig i Europa i 1945 blev et vendepunkt i europæisk historie. (${index})`;

    answerFormat = "text";
    answerValue = "analysis";

  }

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
      cognitive_level: cognitive,
      tags: ["ww2", "europe"]
    },
    content: {
      type: questionType,
      prompt: prompt,
      context: null,
      unit: null,
      min: null,
      max: null
    },
    answer: {
      format: answerFormat,
      value: answerValue,
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
