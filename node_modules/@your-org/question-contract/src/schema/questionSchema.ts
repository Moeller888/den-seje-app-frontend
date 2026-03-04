import { z } from "zod";
import {
  COGNITIVE_LEVELS,
  QUESTION_STATUS
} from "./enums.ts";

const mcOptionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1)
});

const mcSingleContentSchema = z.object({
  type: z.literal("mc_single"),
  prompt: z.string().min(1),
  context: z.string().nullable(),
  options: z.array(mcOptionSchema).min(3).max(6)
});

const textInputContentSchema = z.object({
  type: z.literal("text_input"),
  prompt: z.string().min(1),
  context: z.string().nullable(),
  placeholder: z.string().nullable(),
  max_length: z.number().int().positive().max(500)
});

const numberInputContentSchema = z.object({
  type: z.literal("number_input"),
  prompt: z.string().min(1),
  context: z.string().nullable(),
  unit: z.string().nullable(),
  min: z.number().nullable(),
  max: z.number().nullable()
});

const contentSchema = z.discriminatedUnion("type", [
  mcSingleContentSchema,
  textInputContentSchema,
  numberInputContentSchema
]);

const answerSchema = z.object({
  format: z.enum(["mc", "text", "number", "year"]),
  value: z.union([z.string(), z.number()]),
  tolerance: z
    .object({
      plus_minus: z.number().optional(),
      absolute: z.number().optional(),
      relative: z.number().optional()
    })
    .nullable()
    .optional(),
  normalization: z
    .object({
      case_insensitive: z.boolean().optional(),
      trim: z.boolean().optional()
    })
    .nullable()
    .optional()
});

const constraintsSchema = z
  .object({
    max_length: z.number().nullable().optional(),
    min_length: z.number().nullable().optional(),
    regex: z.string().nullable().optional()
  })
  .optional();

const qualitySchema = z.object({
  author: z.enum(["human", "ai"]),
  source: z.string().nullable().optional(),
  review_required: z.boolean()
});

export const questionSchema = z.object({
  meta: z.object({
    schema_version: z.number().int(),
    domain: z.string().min(1),
    logical_question_id: z.string().min(1),
    version: z.number().int().positive(),
    status: z.enum(QUESTION_STATUS)
  }),
  pedagogy: z.object({
    learning_objective: z.string().min(1),
    difficulty_declared: z.number().int().min(1).max(10),
    cognitive_level: z.enum(COGNITIVE_LEVELS),
    tags: z.array(z.string())
  }),
  content: contentSchema,
  answer: answerSchema,
  constraints: constraintsSchema,
  quality: qualitySchema
});
