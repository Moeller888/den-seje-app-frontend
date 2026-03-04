import { aiGenerate } from "./aiGenerate.ts";
import { normalizeAIContract } from "./normalizeAIContract.ts";
import { produce } from "./produce.ts";
import { logAudit } from "./auditLogger.ts";
import { qualityGate } from "./qualityGate.ts";

type ProductionPlanItem = {
  objective: string;
  difficulty: number;
  cognitive_level: "recall" | "explain" | "apply" | "analyze";
  content_type: "number_input" | "text_input";
  answer_format: "year" | "text";
};

const productionPlan: ProductionPlanItem[] = [

  // Poland
  {
    objective: "ww2_poland_invasion_start_year",
    difficulty: 2,
    cognitive_level: "recall",
    content_type: "number_input",
    answer_format: "year"
  },
  {
    objective: "ww2_poland_invasion_start_year",
    difficulty: 4,
    cognitive_level: "explain",
    content_type: "text_input",
    answer_format: "text"
  },
  {
    objective: "ww2_poland_invasion_start_year",
    difficulty: 6,
    cognitive_level: "analyze",
    content_type: "text_input",
    answer_format: "text"
  },

  // France fall
  {
    objective: "ww2_france_fall_start_year",
    difficulty: 2,
    cognitive_level: "recall",
    content_type: "number_input",
    answer_format: "year"
  },
  {
    objective: "ww2_france_fall_start_year",
    difficulty: 4,
    cognitive_level: "explain",
    content_type: "text_input",
    answer_format: "text"
  },
  {
    objective: "ww2_france_fall_start_year",
    difficulty: 6,
    cognitive_level: "analyze",
    content_type: "text_input",
    answer_format: "text"
  }

];

async function runBatch() {

  console.log("🚀 Starting AI production...");
  console.log("Plan items:", productionPlan.length);
  console.log("--------------------------------------------------");

  let inserted = 0;
  let duplicates = 0;
  let aiFailures = 0;
  let qualityFailures = 0;

  for (let i = 0; i < productionPlan.length; i++) {

    const plan = productionPlan[i];

    console.log(
      `\n➡ ${plan.objective} | diff=${plan.difficulty} | level=${plan.cognitive_level} | type=${plan.content_type}`
    );

    const raw = await aiGenerate(
      plan.objective,
      plan.difficulty,
      plan.cognitive_level
    );

    if ((raw as any)?.error) {
      console.log("⚠ AI failure:", raw);
      aiFailures++;
      continue;
    }

    let normalized;
    try {
      normalized = normalizeAIContract(
        raw as any,
        plan.objective,
        i,
        plan.difficulty,
        plan.cognitive_level,
        plan.content_type,
        plan.answer_format
      );
    } catch (err) {
      console.log("⚠ Normalize failure:", err);
      aiFailures++;
      continue;
    }

    try {
      qualityGate(normalized);
    } catch (err: any) {
      console.log("⚠ Quality rejected:", err.message);
      qualityFailures++;
      continue;
    }

    try {
      const result = await produce(normalized);

      if (result.status === "inserted") {
        inserted++;
        console.log("✅ Inserted:", result.id);

        await logAudit({
          timestamp: new Date().toISOString(),
          objective: plan.objective,
          difficulty: plan.difficulty,
          cognitive_level: plan.cognitive_level,
          content_type: plan.content_type,
          answer_format: plan.answer_format,
          raw,
          normalized,
          result
        });

      } else {
        duplicates++;
        console.log("⚠ Duplicate. Hash:", result.hash);
      }

    } catch (err) {
      console.error("❌ Fatal system error:");
      console.error(err);
      Deno.exit(1);
    }
  }

  console.log("\n==================================================");
  console.log("Batch complete.");
  console.log("Inserted:", inserted);
  console.log("Duplicates:", duplicates);
  console.log("AI Failures:", aiFailures);
  console.log("Quality Failures:", qualityFailures);
  console.log("==================================================");
}

await runBatch();
