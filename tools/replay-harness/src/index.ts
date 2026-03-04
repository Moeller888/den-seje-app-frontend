import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { legacyToContract } from "../../../packages/question-contract/src/adapters/index.ts";
import { contentHash } from "../../../packages/question-contract/src/dedupe/contentHash.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
);

console.log("Hash migration booted.");

// =============================
// LOAD SNAPSHOT
// =============================
const raw = await Deno.readTextFile(
  new URL("../snapshots/questions-export.json", import.meta.url)
);

const rows = JSON.parse(raw);

console.log("Loaded rows:", rows.length);

let updated = 0;

for (const row of rows) {
  const contract = legacyToContract(row);
  const hash = await contentHash(contract);

  const { error } = await supabase
    .from("questions")
    .update({ content_hash: hash })
    .eq("id", row.id);

  if (error) {
    console.error("FAILED UPDATE:", row.id);
    console.error(error);
  } else {
    console.log("UPDATED:", row.id);
    updated++;
  }
}

console.log("Updated:", updated, "/", rows.length);