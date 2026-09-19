import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { publishableKey, serviceKey } from "../_shared/supabase-keys.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type"
};

serve(async (req) => {

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {

    // 🔐 auth
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      publishableKey(),
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! }
        }
      }
    );

    const { data: { user }, error: authError } =
      await supabaseUser.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders
      });
    }

    // 🔥 service role (admin power)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceKey()
    );

    // 🔥 reset pending
    const { error } = await supabase
      .from("question_instances")
      .update({
        teacher_score: 1,
        teacher_feedback: "Afvist (reset)",
        was_correct: false,
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id
      })
      .is("teacher_score", null);

    if (error) {
      console.error("RESET ERROR:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: corsHeaders
      });
    }

    return new Response(
      JSON.stringify({ ok: true }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );

  } catch (err) {

    console.error("RESET FAILED:", err);

    return new Response(
      JSON.stringify({ error: "Unexpected error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }

});
