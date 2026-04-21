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
    // 🔐 AUTH (user context)
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: { Authorization: req.headers.get("authorization")! }
        }
      }
    );

    const {
      data: { user },
      error: authError
    } = await supabaseUser.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders
      });
    }

    // 📦 BODY
    const body = await req.json().catch(() => null);

    if (!body) {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: corsHeaders
      });
    }

    const { instance_id, score, feedback } = body;

    if (!instance_id || score === undefined || score === null) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: instance_id, score" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // 🔥 SERVICE ROLE (privileged for RPC)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 🔁 CALL RPC
    const { error: rpcError } = await supabase.rpc("review_answer", {
      p_instance_id: instance_id,
      p_score: score,
      p_feedback: feedback ?? null,
      p_teacher_id: user.id
    });

    if (rpcError) {
      console.error("RPC ERROR:", rpcError);
      return new Response(JSON.stringify({ error: rpcError.message }), {
        status: 500,
        headers: corsHeaders
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("REVIEW ANSWER ERROR:", err);

    return new Response(
      JSON.stringify({ error: "Unexpected error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});
