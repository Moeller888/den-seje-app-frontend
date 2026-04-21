import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json"
};

serve(async (req) => {

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! }
        }
      }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders
      });
    }

    const { data, error } = await supabase
      .from("question_instances")
      .select(`
        id,
        user_answer,
        teacher_score,
        feedback,
        questions (
          content
        )
      `)
      .eq("student_id", user.id)
      .not("teacher_score", "is", null)
      .order("updated_at", { ascending: false })
      .limit(5);

    if (error) {
      console.error("FETCH ERROR:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: corsHeaders
      });
    }

    return new Response(
      JSON.stringify({ data }),
      { headers: corsHeaders }
    );

  } catch (err: any) {

    console.error("FULL ERROR:", err);

    return new Response(
      JSON.stringify({ error: err?.message ?? "Unknown error" }),
      { status: 500, headers: corsHeaders }
    );
  }

});
