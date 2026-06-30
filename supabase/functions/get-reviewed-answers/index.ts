import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { withObservability } from "../_shared/monitoring.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// 157C reference wiring: the handler is wrapped by withObservability(), the single
// shared monitoring boundary. This is the canonical migration pattern for every Edge
// Function. When ENABLE_SENTRY_EDGE is off the wrapper is behaviourally inert (same
// responses, same latency, errors re-thrown unchanged). `ctx` carries the request_id
// and a fail-soft captureException() for richer handled-error reporting.
serve(withObservability("get-reviewed-answers", async (req, ctx) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    // 🔥 HENT KUN REVIEWED (med score)
    const { data, error } = await supabaseUser
      .from("question_instances")
      .select(`
        id,
        user_answer,
        teacher_feedback,
        teacher_score,
        reviewed_at
      `)
      .eq("student_id", user.id)
      .not("teacher_score", "is", null)
      .order("reviewed_at", { ascending: false })
      .limit(5);

    if (error) {
      console.error("QUERY ERROR:", error);
      ctx.captureException(error, { phase: "query" });
      return new Response(
        JSON.stringify({ error: error.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({ data }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (err: any) {
    console.error("FULL ERROR:", err);
    ctx.captureException(err, { phase: "catch" });

    return new Response(
      JSON.stringify({ error: err?.message ?? "Unknown error" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
}));
