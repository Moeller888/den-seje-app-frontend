import type { CognitiveLevel, QuestionStatus } from "./enums.js";
export interface QuestionMeta {
    schema_version: number;
    domain: string;
    logical_question_id: string;
    version: number;
    status: QuestionStatus;
}
export interface QuestionPedagogy {
    learning_objective: string;
    difficulty_declared: number;
    cognitive_level: CognitiveLevel;
    tags: string[];
}
export interface McOption {
    id: string;
    text: string;
}
export interface McSingleContent {
    type: "mc_single";
    prompt: string;
    context: string | null;
    options: McOption[];
}
export interface TextInputContent {
    type: "text_input";
    prompt: string;
    context: string | null;
    placeholder: string | null;
    max_length: number;
}
export interface NumberInputContent {
    type: "number_input";
    prompt: string;
    context: string | null;
    unit: string | null;
    min: number | null;
    max: number | null;
}
export type QuestionContent = McSingleContent | TextInputContent | NumberInputContent;
export interface QuestionAnswer {
    format: "mc" | "text" | "number" | "year";
    value: string | number;
    tolerance?: {
        plus_minus?: number;
        absolute?: number;
        relative?: number;
    } | null;
    normalization?: {
        case_insensitive?: boolean;
        trim?: boolean;
    } | null;
}
export interface QuestionConstraints {
    max_length?: number | null;
    min_length?: number | null;
    regex?: string | null;
}
export interface QuestionQuality {
    author: "human" | "ai";
    source?: string | null;
    review_required: boolean;
}
export interface QuestionContract {
    meta: QuestionMeta;
    pedagogy: QuestionPedagogy;
    content: QuestionContent;
    answer: QuestionAnswer;
    constraints?: QuestionConstraints;
    quality: QuestionQuality;
}
