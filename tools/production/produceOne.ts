import { produce } from "./produce.ts";

async function run() {
  console.log("🚀 Running produceOne runner...");

  const contract = {
    meta: {
      schema_version: 1,
      domain: "ww2",
      logical_question_id: "ww2_structural_refactor_test",
      version: 1,
      status: "draft"
    },
    pedagogy: {
      learning_objective: "ww2_structural_refactor_end_year",
      difficulty_declared: 3,
      cognitive_level: "recall",
      tags: ["ww2"]
    },
    content: {
      type: "number_input",
      prompt: "Hvilket år sluttede Anden Verdenskrig i Europa?",
      context: null,
      unit: null,
      min: null,
      max: null
    },
    answer: {
      format: "year",
      value: 1945,
      tolerance: { plus_minus: 0 }
    },
    quality: {
      author: "ai",
      review_required: true
    }
  };

  try {
    const result = await produce(contract);

    if (result.status === "duplicate") {
      console.log("⚠ Duplicate detected.");
      console.log("Hash:", result.hash);
      return;
    }

    console.log("🎉 Inserted:", result.id);
    console.log("Hash:", result.hash);

  } catch (err) {
    console.error("❌ Pipeline error:");
    console.error(err);
    Deno.exit(1);
  }
}

await run();
