import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {

    console.log("START process-event")

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! }
        }
      }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    console.log("USER:", user)

    if (authError || !user) {
      throw new Error("Unauthorized")
    }

    const body = await req.json()

    console.log("BODY:", body)

    const {
      question_instance_id,
      answer,
      question_shown_at
    } = body

    if (!question_instance_id || !answer || !question_shown_at) {
      throw new Error("Missing required fields")
    }

    const { data, error } = await supabase.rpc(
      "process_question_attempt",
      {
        p_student_id: user.id,
        p_question_instance_id: question_instance_id,
        p_answer: answer,
        p_question_shown_at: question_shown_at
      }
    )

    console.log("RPC RESULT:", data)
    console.log("RPC ERROR:", error)

    if (error) {
      throw error
    }

    return new Response(
      JSON.stringify(data),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
      }
    )

  } catch (err) {

    console.error("FULL ERROR:", err)

    return new Response(
      JSON.stringify({
        error: err.message,
        full: err
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500
      }
    )
  }

})
