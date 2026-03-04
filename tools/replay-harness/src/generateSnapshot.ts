import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { legacyToContract } from "../../../packages/question-contract/src/adapters/legacyToContract.ts";
import { contentHash } from "../../../packages/question-contract/src/dedupe/contentHash.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const { data } = await supabase
  .from("questions")
  .select("id, difficulty, learning_objective, answer_format, content");

if (!data) throw new Error("No data");

const snapshot: Record<string, string> = {};

for (const row of data) {
  const contract = legacyToContract(row as any);
  const hash = await contentHash(contract);
  snapshot[row.id] = hash;
}

await Deno.writeTextFile(
  "./tools/replay-harness/snapshots/hash-snapshot.json",
  JSON.stringify(snapshot, null, 2)
);

console.log("Snapshot written.");
