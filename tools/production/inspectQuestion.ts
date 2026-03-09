import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const { data, error } = await supabase
  .from("questions")
  .select("content")
  .eq("learning_objective","ww2_event_kursk_battle_start_year")
  .order("created_at",{ascending:false})
  .limit(1)
  .single();

if (error) {
  console.error(error);
} else {
  console.log(JSON.stringify(data,null,2));
}
