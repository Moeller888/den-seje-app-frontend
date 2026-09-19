import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { publishableKey, serviceKey } from "../_shared/supabase-keys.ts";

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
      publishableKey(),
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

    // 🔥 SERVICE ROLE
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceKey()
    );

    // 🔐 ROLE CHECK — must come BEFORE the instance lookup, the RPC and the XP write.
    //
    // The identity is `user.id`, taken from the verified JWT above. It is NEVER taken from the
    // request body: a caller who could supply their own teacher id would be asserting their own
    // authority, which is not authorisation at all.
    //
    // The role is read with the SERVICE client on purpose. Reading it through the caller's own
    // client would put the answer behind RLS policies the caller may influence; the service client
    // bypasses RLS, so the row that comes back is the row as it actually is.
    //
    // This restores a check that exists in the deployed function but had never been committed to
    // this repository. The database-side lockdown in
    // supabase/migrations/20260919000000_review_answer_execute_lockdown.sql is the second layer:
    // this one gives the caller a correct status code, that one holds even if this code is
    // bypassed entirely.
    const { data: callerProfile, error: callerProfileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    // A failed lookup is not "not a teacher" — it is an unknown answer, and an unknown answer must
    // never be treated as permission.
    if (callerProfileError) {
      console.error("ROLE LOOKUP ERROR:", callerProfileError);
      throw callerProfileError;
    }

    if (!callerProfile || (callerProfile.role !== "teacher" && callerProfile.role !== "super_admin")) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
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