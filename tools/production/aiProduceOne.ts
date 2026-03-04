import { aiGenerate } from "./aiGenerate.ts";
import { normalizeAIContract } from "./normalizeAIContract.ts";
import { produce } from "./produce.ts";

async function run() {

  console.log("🚀 AI → Normalize → Produce test");

  const learningObjective = "ww2_poland_invasion_start_year";

  // 1️⃣ AI generate
  const raw = await aiGenerate(learningObjective);

  console.log("\n🔎 Raw AI output:");
  console.dir(raw, { depth: null });

  if ((raw as any)?.error) {
    console.error("❌ AI error:", raw);
    Deno.exit(1);
  }

  // 2️⃣ Normalize
  const normalized = normalizeAIContract(raw, learningObjective, 0);

  console.log("\n🛠 Normalized contract:");
  console.dir(normalized, { depth: null });

  try {
    // 3️⃣ Produce (includes validation + hash + dedupe + insert)
    const result = await produce(normalized);

    if (result.status === "duplicate") {
      console.log("\n⚠ Duplicate detected.");
      console.log("Hash:", result.hash);
    } else {
      console.log("\n🎉 Inserted successfully.");
      console.log("ID:", result.id);
      console.log("Hash:", result.hash);
    }

  } catch (err) {
    console.error("\n❌ Pipeline failure:");
    console.error(err);
    Deno.exit(1);
  }
}

await run();
