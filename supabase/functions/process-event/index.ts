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

    if (authError || !user) throw new Error("Unauthorized")

    const body = await req.json().catch(() => null)

    if (!body) throw new Error("Invalid JSON body")

    const {
      question_instance_id,
      answer,
      question_shown_at
    } = body

    if (!question_instance_id || !answer) {
      throw new Error("Missing required fields")
    }

    // 🔥 RPC
    const { data, error } = await supabase.rpc(
      "process_question_attempt",
      {
        p_student_id: user.id,
        p_question_instance_id: question_instance_id,
        p_answer: answer,
        p_question_shown_at: question_shown_at ?? Date.now()
      }
    )

    if (error) {
      console.error("RPC ERROR:", error)
      throw error
    }

    const status = data?.status ?? "pending"

    const isCorrect =
      status === "correct"
        ? true
        : status === "incorrect"
        ? false
        : null

    // 🔥 UPDATE INSTANCE
    await supabase
      .from("question_instances")
      .update({
        user_answer: answer,
        was_correct: isCorrect
      })
      .eq("id", question_instance_id)

    // 🔥 NEXT REVIEW (kun ved MC)
    if (status === "correct" || status === "incorrect") {
      const nextReviewAt = new Date()

      if (status === "correct") {
        nextReviewAt.setDate(nextReviewAt.getDate() + 1)
      } else {
        nextReviewAt.setMinutes(nextReviewAt.getMinutes() + 10)
      }

      const { error: updateError } = await supabase
        .from("question_instances")
        .update({ next_review_at: nextReviewAt.toISOString() })
        .eq("id", question_instance_id)
        .eq("student_id", user.id)

      if (updateError) throw updateError
    }

    // 🔥 hent correct_answer
    const { data: instanceData } = await supabase
      .from("question_instances")
      .select("correct_answer")
      .eq("id", question_instance_id)
      .limit(1)

    const correct_answer = instanceData?.[0]?.correct_answer ?? null

    return new Response(
      JSON.stringify({
        status,
        correct_answer
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
      }
    )

  } catch (err: any) {

    console.error("FULL ERROR:", err)

    return new Response(
      JSON.stringify({
        error: err?.message ?? "Unknown error"
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500
      }
    )
  }

})
