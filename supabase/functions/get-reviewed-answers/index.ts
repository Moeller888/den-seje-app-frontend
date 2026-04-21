import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    // 🔥 KRITISK: brug Authorization header
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: {
            Authorization: req.headers.get("Authorization")!
          }
        }
      }
    );

    // 🔐 AUTH
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: corsHeaders }
      );
    }

    // 🔥 HENT REVIEWED ANSWERS
    const { data, error } = await supabase
      .from("question_instances")
      .select("user_answer, teacher_score, feedback")
      .eq("student_id", user.id)
      .not("teacher_score", "is", null)
      .order("updated_at", { ascending: false })
      .limit(5);

    if (error) throw error;

    return new Response(
      JSON.stringify({ data }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
      }
    );

  } catch (err) {

    console.error("GET REVIEWED ANSWERS ERROR:", err);

    return new Response(
      JSON.stringify({ error: "Unexpected error" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500
      }
    );
  }

});