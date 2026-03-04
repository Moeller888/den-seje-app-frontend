import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  Deno.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function inspectRow() {
  console.log("🔎 Fetching one row from questions...");

  const { data, error } = await supabase
    .from("questions")
    .select("*")
    .limit(1);

  if (error) {
    console.error("❌ Read failed:");
    console.error(error);
    Deno.exit(1);
  }

  if (!data || data.length === 0) {
    console.log("⚠ No rows found in questions table.");
    Deno.exit(0);
  }

  console.log("✅ Row fetched:");
  console.dir(data[0], { depth: null });
}

await inspectRow();
