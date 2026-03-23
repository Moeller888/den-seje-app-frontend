import { qualityGate } from "../qualityGate.ts";
import { normalizeAIContract } from "../../tools/production/normalizeAIContract.ts";
import { isSemanticallyDuplicate } from "../dedupe/semanticDuplicateCheck.ts";
import type { QuestionRepository } from "../repository/questionRepository.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export async function produceDraftBatch(
  objectives: string[],
  repo: QuestionRepository,
  generateQuestion: (input: { objective: string; cognitive: string }) => Promise<any>
) {

  const { data } = await supabase
    .from("questions")
    .select("content")
    .limit(200);

  const existingPrompts: string[] =
    data?.map((q: any) => q.content?.question).filter(Boolean) ?? [];

  let produced = 0;
  let duplicates = 0;

  const batchId = crypto.randomUUID();

  for (const objective of objectives) {

    const cognitive = "recall";

    const ai = await generateQuestion({
      objective,
      cognitive
    });

    console.log("AI RAW:", ai);

    if (!ai || ai.error || !ai.prompt || !ai.answer) {
      console.error("AI generation failed:", ai);
      continue;
    }

    let contract;

    try {
      contract = normalizeAIContract(
        ai,
        objective,
        0,
        1,
        cognitive as any,
        "number_input",
        "year"
      );
    } catch (err) {
      console.error("Normalization failed:", err);
      continue;
    }

    if (isSemanticallyDuplicate(contract.content.prompt, existingPrompts)) {
      duplicates++;
      continue;
    }

    try {
      qualityGate(contract);
    } catch (err) {
      console.error("Quality gate failed:", err);
      continue;
    }

    const result = await repo.insertValidatedQuestion(contract, batchId);

    if (result.status === "duplicate") {
      duplicates++;
      continue;
    }

    produced++;
    existingPrompts.push(contract.content.prompt);
  }

  return {
    batchId,
    produced,
    duplicates,
    objectives
  };
}
