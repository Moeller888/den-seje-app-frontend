import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateQuestion } from "../../packages/question-contract/src/validateQuestion.ts";
import { contentHash } from "../../packages/question-contract/src/dedupe/contentHash.ts";
import { normalizePrompt } from "../utils/normalizePrompt.ts";
import type { QuestionRepository } from "./questionRepository.ts";
import type { QuestionMetaProjection } from "../policy/types.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export type ProduceResult =
  | { status: "inserted"; id: string; hash: string }
  | { status: "duplicate"; hash: string };

export type DraftQuestionPreview = {
  id: string;
  learning_objective: string;
  cognitive_level: string;
  difficulty: number;
  prompt: string;
  answer: string;
};

export class SupabaseQuestionRepository implements QuestionRepository {

  async fetchByObjectives(objectives: string[]): Promise<QuestionMetaProjection[]> {

    const { data, error } = await supabase
      .from("questions")
      .select("learning_objective, cognitive_level, is_active")
      .in("learning_objective", objectives);

    if (error) throw new Error(`Supabase fetch failed: ${error.message}`);
    if (!data) return [];

    return data
      .filter(row => row.cognitive_level !== null)
      .map(row => ({
        objective: row.learning_objective,
        cognitive: row.cognitive_level,
        status: row.is_active ? "active" : "draft",
      }));
  }

  async fetchDraftQuestions(): Promise<DraftQuestionPreview[]> {

    const { data, error } = await supabase
      .from("questions")
      .select("id, learning_objective, cognitive_level, difficulty, content, created_at")
      .eq("is_active", false)
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Supabase draft fetch failed: ${error.message}`);
    if (!data) return [];

    return data.map(row => ({
      id: row.id,
      learning_objective: row.learning_objective,
      cognitive_level: row.cognitive_level,
      difficulty: row.difficulty,
      prompt: row.content?.question ?? "[missing prompt]",
      answer: row.content?.correct ?? "[missing answer]"
    }));
  }

  async fetchDraftQuestionsByBatch(batchId: string): Promise<DraftQuestionPreview[]> {

    const { data, error } = await supabase
      .from("questions")
      .select("id, learning_objective, cognitive_level, difficulty, content, created_at")
      .eq("batch_id", batchId)
      .eq("is_active", false)
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Supabase batch fetch failed: ${error.message}`);
    if (!data) return [];

    return data.map(row => ({
      id: row.id,
      learning_objective: row.learning_objective,
      cognitive_level: row.cognitive_level,
      difficulty: row.difficulty,
      prompt: row.content?.question ?? "[missing prompt]",
      answer: row.content?.correct ?? "[missing answer]"
    }));
  }

  async insertValidatedQuestion(contract: unknown, batchId: string): Promise<ProduceResult> {

    const result = validateQuestion(contract);

    if (!result.success) {
      console.error(JSON.stringify(result.issues, null, 2));
      throw new Error("Validation failed");
    }

    const validated = result.data;

    const normalizedPrompt = normalizePrompt(validated.content.prompt);

    const hashInput = {
      ...validated,
      content: {
        ...validated.content,
        prompt: normalizedPrompt
      }
    };

    const hash = await contentHash(hashInput as any);

    const { data: existing } = await supabase
      .from("questions")
      .select("id")
      .eq("content_hash", hash)
      .limit(1);

    if (existing && existing.length > 0) {
      return { status: "duplicate", hash };
    }

    const contentType = validated.content.type;

    let contentPayload: any;

    if (contentType === "number_input") {
      contentPayload = {
        question: validated.content.prompt,
        correct: String(validated.answer.value),
        tolerance: 0,
        facit: (contract as any)?.content?.facit ?? null,
        criteria: (contract as any)?.content?.criteria ?? null
      };
    } else {
      contentPayload = {
        question: validated.content.prompt,
        correct: String(validated.answer.value),
        facit: (contract as any)?.content?.facit ?? null,
        criteria: (contract as any)?.content?.criteria ?? null
      };
    }

    const insertPayload = {
      type: contentType,
      content: contentPayload,
      difficulty: validated.pedagogy.difficulty_declared,
      learning_objective: validated.pedagogy.learning_objective,
      cognitive_level: validated.pedagogy.cognitive_level,
      answer_format: validated.answer.format,
      content_hash: hash,
      is_active: false,
      question_type: "auto",
      batch_id: batchId
    };

    try {

      const { data, error } = await supabase
        .from("questions")
        .insert(insertPayload)
        .select()
        .single();

      if (error) {

        if ((error as any).code === "23505") {
          return { status: "duplicate", hash };
        }

        throw error;
      }

      return { status: "inserted", id: data.id, hash };

    } catch (err: any) {

      if (err?.code === "23505") {
        return { status: "duplicate", hash };
      }

      throw err;
    }
  }

  async activateBatch(batchId: string): Promise<number> {

    const { data, error } = await supabase
      .from("questions")
      .update({ is_active: true })
      .eq("batch_id", batchId)
      .eq("is_active", false)
      .select();

    if (error) throw new Error(`Supabase activate failed: ${error.message}`);

    return data ? data.length : 0;
  }
}
