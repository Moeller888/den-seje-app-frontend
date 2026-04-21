import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type"
};

function scoreToXP(score: number) {
  if (score === 1) return 0;
  if (score === 2) return 10;
  if (score === 3) return 25;
  if (score === 4) return 50;
  return 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 🔐 AUTH
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
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // 🔥 SERVICE ROLE
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 🔍 find student_id
    const { data: instance, error: instanceError } = await supabase
      .from("question_instances")
      .select("student_id")
      .eq("id", instance_id)
      .maybeSingle();

    if (instanceError || !instance) {
      throw new Error("Instance not found");
    }

    const student_id = instance.student_id;

    // 🔁 RPC (gem vurdering)
    const { error: rpcError } = await supabase.rpc("review_answer", {
      p_instance_id: instance_id,
      p_score: score,
      p_feedback: feedback ?? null,
      p_teacher_id: user.id
    });

    if (rpcError) {
      console.error("RPC ERROR:", rpcError);
      throw rpcError;
    }

    // 🔥 XP BONUS
    const xpToAdd = scoreToXP(score);

    if (xpToAdd > 0) {
      const { data: progress, error: progressError } = await supabase
        .from("student_progress")
        .select("xp")
        .eq("student_id", student_id)
        .maybeSingle();

      if (progressError) throw progressError;

      const currentXP = progress?.xp ?? 0;

      const { error: updateError } = await supabase
        .from("student_progress")
        .update({ xp: currentXP + xpToAdd })
        .eq("student_id", student_id);

      if (updateError) throw updateError;
    }

    return new Response(JSON.stringify({ ok: true, xp_awarded: xpToAdd }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    console.error("REVIEW ANSWER ERROR:", err);

    return new Response(
      JSON.stringify({ error: err?.message ?? "Unexpected error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});