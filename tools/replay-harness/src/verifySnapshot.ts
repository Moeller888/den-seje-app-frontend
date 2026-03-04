import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { legacyToContract } from "../../../packages/question-contract/src/adapters/legacyToContract.ts";
import { contentHash } from "../../../packages/question-contract/src/dedupe/contentHash.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const snapshot = JSON.parse(
  await Deno.readTextFile("./tools/replay-harness/snapshots/hash-snapshot.json")
);

const { data } = await supabase
  .from("questions")
  .select("id, difficulty, learning_objective, answer_format, content");

if (!data) throw new Error("No data");

let failures = 0;

for (const row of data) {
  const contract = legacyToContract(row as any);
  const hash = await contentHash(contract);

  if (snapshot[row.id] !== hash) {
    console.error("HASH MISMATCH:", row.id);
    failures++;
  }
}

if (failures > 0) {
  console.error("FAILED:", failures);
  Deno.exit(1);
}

console.log("All hashes match snapshot.");
