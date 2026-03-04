import { z } from "zod";
export declare const questionSchema: z.ZodObject<{
    meta: z.ZodObject<{
        schema_version: z.ZodNumber;
        domain: z.ZodString;
        logical_question_id: z.ZodString;
        version: z.ZodNumber;
        status: z.ZodEnum<{
            draft: "draft";
            staged: "staged";
            active: "active";
            deprecated: "deprecated";
        }>;
    }, z.core.$strip>;
    pedagogy: z.ZodObject<{
        learning_objective: z.ZodString;
        difficulty_declared: z.ZodNumber;
        cognitive_level: z.ZodEnum<{
            recall: "recall";
            explain: "explain";
            apply: "apply";
            analyze: "analyze";
        }>;
        tags: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
    content: z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<"mc_single">;
        prompt: z.ZodString;
        context: z.ZodNullable<z.ZodString>;
        options: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            text: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"text_input">;
        prompt: z.ZodString;
        context: z.ZodNullable<z.ZodString>;
        placeholder: z.ZodNullable<z.ZodString>;
        max_length: z.ZodNumber;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"number_input">;
        prompt: z.ZodString;
        context: z.ZodNullable<z.ZodString>;
        unit: z.ZodNullable<z.ZodString>;
        min: z.ZodNullable<z.ZodNumber>;
        max: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>], "type">;
    answer: z.ZodObject<{
        format: z.ZodEnum<{
            number: "number";
            text: "text";
            mc: "mc";
            year: "year";
        }>;
        value: z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>;
        tolerance: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            plus_minus: z.ZodOptional<z.ZodNumber>;
            absolute: z.ZodOptional<z.ZodNumber>;
            relative: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>>;
        normalization: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            case_insensitive: z.ZodOptional<z.ZodBoolean>;
            trim: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$strip>>>;
    }, z.core.$strip>;
    constraints: z.ZodOptional<z.ZodObject<{
        max_length: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        min_length: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        regex: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, z.core.$strip>>;
    quality: z.ZodObject<{
        author: z.ZodEnum<{
            human: "human";
            ai: "ai";
        }>;
        source: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        review_required: z.ZodBoolean;
    }, z.core.$strip>;
}, z.core.$strip>;
