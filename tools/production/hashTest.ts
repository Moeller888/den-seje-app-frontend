import { contentHash } from "../../packages/question-contract/src/dedupe/contentHash.ts";

async function run() {
  const baseContract = {
    meta: {
      schema_version: 1,
      domain: "ww2",
      logical_question_id: "hash_test_1",
      version: 1,
      status: "draft"
    },
    pedagogy: {
      learning_objective: "ww2_europe_conflict_end_year",
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
      tolerance: {
        plus_minus: 0
      }
    },
    quality: {
      author: "ai",
      review_required: true
    }
  };

  // Clone and change ONLY learning_objective
  const modifiedContract = {
    ...baseContract,
    pedagogy: {
      ...baseContract.pedagogy,
      learning_objective: "ww2_some_other_objective_end_year"
    }
  };

  const hash1 = await contentHash(baseContract);
  const hash2 = await contentHash(modifiedContract);

  console.log("Hash 1:", hash1);
  console.log("Hash 2:", hash2);

  if (hash1 === hash2) {
    console.log("✅ PASS: Hash is independent of learning_objective");
  } else {
    console.error("❌ FAIL: Hash changes when learning_objective changes");
    Deno.exit(1);
  }
}

await run();
