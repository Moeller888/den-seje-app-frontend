type CognitiveLevel = "recall" | "explain" | "apply" | "analyze";
type ContentType = "number_input" | "text_input";
type AnswerFormat = "year" | "text";

export function normalizeAIContract(
  aiOutput: { prompt: string; answer: string; facit?: string; criteria?: string[] },
  learningObjective: string,
  index: number,
  difficulty: number,
  cognitiveLevel: CognitiveLevel,
  contentType: ContentType,
  answerFormat: AnswerFormat
) {

  if (!aiOutput?.prompt || !aiOutput?.answer) {
    throw new Error("AI output missing prompt or answer");
  }

  const logicalId =
    `ww2_ai_${learningObjective}_${difficulty}_${cognitiveLevel}_${index}`;

  let content: any;
  let answer: any;

  if (contentType === "number_input") {

    const year = Number(aiOutput.answer);

    if (Number.isNaN(year)) {
      throw new Error("Expected numeric year answer");
    }

    content = {
      type: "number_input",
      prompt: aiOutput.prompt,
      context: null,
      unit: null,
      min: null,
      max: null,
      facit: aiOutput.facit ?? null,
      criteria: aiOutput.criteria ?? null
    };

    answer = {
      format: "year",
      value: year,
      tolerance: {
        plus_minus: 0
      },
      normalization: null
    };

  } else if (contentType === "text_input") {

    content = {
      type: "text_input",
      prompt: aiOutput.prompt,
      context: null,
      placeholder: null,
      max_length: 300,
      facit: aiOutput.facit ?? null,
      criteria: aiOutput.criteria ?? null
    };

    answer = {
      format: "text",
      value: aiOutput.answer,
      tolerance: null,
      normalization: {
        case_insensitive: true,
        trim: true
      }
    };

  } else {
    throw new Error("Unsupported content type");
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
      difficulty_declared: difficulty,
      cognitive_level: cognitiveLevel,
      tags: ["ww2"]
    },
    content,
    answer,
    quality: {
      author: "ai",
      review_required: true
    }
  };
}
