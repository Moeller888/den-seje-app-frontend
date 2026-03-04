import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateQuestion } from "../../packages/question-contract/src/validateQuestion.ts";
import { contentHash } from "../../packages/question-contract/src/dedupe/contentHash.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export type ProduceResult =
  | { status: "inserted"; id: string; hash: string }
  | { status: "duplicate"; hash: string };

export async function produce(contract: unknown): Promise<ProduceResult> {

  const result = validateQuestion(contract);

  if (!result.success || !result.data) {
    throw new Error(
      "Validation failed: " + JSON.stringify(result.issues, null, 2)
    );
  }

  const validated = result.data;

  const hash = await contentHash(validated);

  if (typeof hash !== "string") {
    throw new Error("contentHash did not return string");
  }

  // Hash duplicate check
  const { data: existing, error: lookupError } = await supabase
    .from("questions")
    .select("id")
    .eq("content_hash", hash)
    .limit(1);

  if (lookupError) {
    throw lookupError;
  }

  if (existing && existing.length > 0) {
    return { status: "duplicate", hash };
  }

  // Content-type aware mapping
  const contentType = validated.content.type;

  let contentPayload: any;

  if (contentType === "number_input") {

    contentPayload = {
      question: validated.content.prompt,
      correct: String(validated.answer.value),
      tolerance: 0
    };

  } else if (contentType === "text_input") {

    contentPayload = {
      question: validated.content.prompt,
      correct: String(validated.answer.value)
    };

  } else {
    throw new Error("Unsupported content type in produce()");
  }

  const insertPayload = {
    type: contentType,
    content: contentPayload,
    difficulty: validated.pedagogy.difficulty_declared,
    learning_objective: validated.pedagogy.learning_objective,
    answer_format: validated.answer.format,
    content_hash: hash,
    is_active: false,
    question_type: "auto"
  };

  const { data, error } = await supabase
    .from("questions")
    .insert(insertPayload)
    .select()
    .single();

  if (error) {

    // UNIQUE constraint duplicate
    if (error.code === "23505") {
      return { status: "duplicate", hash };
    }

    throw error;
  }

  return { status: "inserted", id: data.id, hash };
}
