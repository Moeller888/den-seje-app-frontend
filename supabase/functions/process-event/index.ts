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

    const result = data;
    const correct = result?.correct

    // Only update next_review_at when the answer is definitively correct or incorrect.
    // Pending (correct === null/undefined) must not be made immediately due.
    if (correct === true || correct === false) {
      const nextReviewAt = new Date()
      if (correct === true) {
        // Correct → schedule 1 day from now
        nextReviewAt.setDate(nextReviewAt.getDate() + 1)
      } else {
        // Incorrect → retry in 10 minutes
        nextReviewAt.setMinutes(nextReviewAt.getMinutes() + 10)
      }

      const { error: updateError } = await supabase
        .from("question_instances")
        .update({ next_review_at: nextReviewAt.toISOString() })
        .eq("id", question_instance_id)

      if (updateError) {
        console.error("next_review_at update error:", updateError)
        throw updateError
      }

      console.log("next_review_at set to:", nextReviewAt.toISOString())
    }

    const { data: instanceData } = await supabase
      .from("question_instances")
      .select("correct_answer")
      .eq("id", question_instance_id)
      .limit(1)

    const correct_answer = (instanceData && instanceData.length > 0) ? instanceData[0].correct_answer : null

    return new Response(
      JSON.stringify({
        correct: result?.correct ?? false,
        correct_answer
      }),
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
