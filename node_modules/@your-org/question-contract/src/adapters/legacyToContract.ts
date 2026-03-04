import type { QuestionContract } from "../schema/questionContract.ts";

interface LegacyQuestionRow {
  id: string;
  difficulty: number;
  learning_objective: string | null;
  answer_format: string;
  content: any;
}

export function legacyToContract(
  row: LegacyQuestionRow
): QuestionContract {

  const baseMeta = {
    schema_version: 1,
    domain: "history",
    logical_question_id: row.id,
    version: 1,
    status: "active" as const
  };

  const basePedagogy = {
    learning_objective: row.learning_objective ?? "unknown",
    difficulty_declared: Math.min(10, Math.max(1, row.difficulty)),
    cognitive_level: "recall" as const,
    tags: []
  };

  if (row.answer_format === "year") {

    return {
      meta: baseMeta,
      pedagogy: basePedagogy,
      content: {
        type: "number_input",
        prompt: row.content.question,
        context: null,
        unit: null,
        min: null,
        max: null
      },
      answer: {
        format: "year",
        value: Number(row.content.correct),
        tolerance: {
          absolute: row.content.tolerance ?? 0
        },
        normalization: null
      },
      quality: {
        author: "human",
        source: null,
        review_required: false
      }
    };
  }

  if (
    row.answer_format === "mc" &&
    Array.isArray(row.content.options)
  ) {

    const options = row.content.options.map(
      (text: string, index: number) => ({
        id: "opt_" + index,
        text
      })
    );

    const correctIndex = row.content.options.findIndex(
      (opt: string) => opt === row.content.correct
    );

    return {
      meta: baseMeta,
      pedagogy: basePedagogy,
      content: {
        type: "mc_single",
        prompt: row.content.question,
        context: null,
        options
      },
      answer: {
        format: "mc",
        value: "opt_" + correctIndex,
        tolerance: null,
        normalization: null
      },
      quality: {
        author: "human",
        source: null,
        review_required: false
      }
    };
  }

  return {
    meta: baseMeta,
    pedagogy: basePedagogy,
    content: {
      type: "text_input",
      prompt: row.content.question,
      context: null,
      placeholder: null,
      max_length: 500
    },
    answer: {
      format: "text",
      value: String(row.content.correct ?? ""),
      tolerance: null,
      normalization: {
        case_insensitive: true,
        trim: true
      }
    },
    quality: {
      author: "human",
      source: null,
      review_required: false
    }
  };
}
