import { aiGenerate } from "./aiGenerate.ts";

async function run() {
  console.log("🔎 Testing AI generation...");

  const objective = "ww2_poland_invasion_start_year";

  const result = await aiGenerate(objective);

  console.log("Raw AI output:");
  console.dir(result, { depth: null });

  if ((result as any)?.error) {
    console.error("❌ AI returned error:", result);
    Deno.exit(1);
  }

  console.log("✅ AI returned parsable JSON.");
}

await run();
