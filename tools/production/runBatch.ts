import { SupabaseQuestionRepository } from "../../production/repository/SupabaseQuestionRepository.ts";
import { produceDraftBatch } from "../../production/batch/produceDraftBatch.ts";
import { activateProductionBatch } from "../../production/batch/activateProductionBatch.ts";
import { aiGenerate } from "./aiGenerate.ts";
import { SUFFIX_REGISTRY } from "../../production/objectiveTaxonomy.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const repo = new SupabaseQuestionRepository();
const args = Deno.args;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

if (args.length === 0) {
  console.log("Usage:");
  console.log("  produce <objective>");
  console.log("  produce-missing");
  console.log("  activate <batchId>");
  console.log("  review");
  console.log("  review-batch <batchId>");
  Deno.exit(1);
}

const command = args[0];

async function generateQuestionWrapper(input: { objective: string; cognitive: string; avoid?: string[] }) {

  const { data } = await supabase
    .from("questions")
    .select("content")
    .order("created_at", { ascending: false })
    .limit(10);

  const recentPrompts =
    data?.map((q: any) => q.content?.question).filter(Boolean) ?? [];

  return await aiGenerate(
    input.objective,
    1,
    input.cognitive as any,
    recentPrompts
  );
}

if (command === "produce") {

  const objective = args[1];

  if (!objective) {
    console.error("No objective provided.");
    Deno.exit(1);
  }

  const result = await produceDraftBatch([objective], repo, generateQuestionWrapper);

  console.log(JSON.stringify(result, null, 2));
}

else if (command === "produce-missing") {

  console.log("Scanning for missing objectives...");

  const objectives = Object.keys(SUFFIX_REGISTRY);

  const result = await produceDraftBatch(objectives, repo, generateQuestionWrapper);

  console.log("\nPRODUCE MISSING RESULT\n");
  console.log(JSON.stringify(result, null, 2));
}

else if (command === "activate") {

  const batchId = args[1];

  if (!batchId) {
    console.error("No batchId provided.");
    Deno.exit(1);
  }

  const activated = await activateProductionBatch(batchId, repo);

  console.log(`Activated ${activated} questions.`);
}

else if (command === "review") {

  const drafts = await repo.fetchDraftQuestions();

  console.log("\nDRAFT QUESTIONS\n");

  for (const q of drafts) {
    console.log(`${q.id} | ${q.learning_objective} | ${q.cognitive_level} | ${q.difficulty} | ${q.prompt} | ${q.answer}`);
  }
}

else if (command === "review-batch") {

  const batchId = args[1];

  if (!batchId) {
    console.error("Provide batchId.");
    Deno.exit(1);
  }

  const drafts = await repo.fetchDraftQuestionsByBatch(batchId);

  console.log(`\nDRAFT QUESTIONS (batch ${batchId})\n`);

  for (const q of drafts) {
    console.log(`${q.id} | ${q.learning_objective} | ${q.cognitive_level} | ${q.difficulty} | ${q.prompt} | ${q.answer}`);
  }
}

else {
  console.error("Unknown command.");
  Deno.exit(1);
}
