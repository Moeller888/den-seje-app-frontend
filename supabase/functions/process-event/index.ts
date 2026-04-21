import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

function normalize(str) {
  return (str || "")
    .toLowerCase()
    .trim()
    .replace(/[.,!?]/g, "")
    .replace(/\s+/g, " ")
}

function isTextCorrect(user, correct) {
  const u = normalize(user)
  const c = normalize(correct)

  if (!u || !c) return false
  if (u === c) return true
  if (u.includes(c) || c.includes(u)) return true

  return false
}

function countWords(text) {
  return (text || "")
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 0).length
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

    console.log("DEBUG INPUT:", { question_instance_id, answer })

    if (!question_instance_id || !answer) {
      throw new Error("Missing required fields")
    }

    // 🔥 HENT DATA inkl. answer_type
    const { data: instanceData, error: instanceError } = await supabase
      .from("question_instances")
      .select(`
        correct_answer,
        student_id,
        questions (
          answer_format,
          answer_type
        )
      `)
      .eq("id", question_instance_id)
      .maybeSingle()

    if (instanceError || !instanceData) {
      throw new Error("Instance not found")
    }

    const correct_answer = instanceData.correct_answer
    const format = (instanceData.questions?.answer_format || "").toLowerCase()
    const answerType = instanceData.questions?.answer_type || "short"

    console.log("DEBUG answerType:", answerType)
    console.log("DEBUG format:", format)

    let status = "pending"

    // 🔥 LONG → kræver min. 20 ord
    if (answerType === "long") {

      const words = countWords(answer)
      console.log("DEBUG wordCount:", words)

      if (words < 20) {
        return new Response(
          JSON.stringify({
            status: "invalid",
            error: "Svar skal være mindst 20 ord"
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400
          }
        )
      }

      console.log("FLOW: LONG → pending")
      status = "pending"

    } else {

      console.log("FLOW: SHORT → evaluate")

      if (format.includes("text")) {

        const correct = isTextCorrect(answer, correct_answer)
        status = correct ? "correct" : "incorrect"

      } else {

        const { data, error } = await supabase.rpc(
          "process_question_attempt",
          {
            p_student_id: user.id,
            p_question_instance_id: question_instance_id,
            p_answer: answer,
            p_question_shown_at: question_shown_at ?? Date.now()
          }
        )

        if (error) throw error

        status = data?.status ?? "pending"
      }
    }

    const isCorrect =
      status === "correct"
        ? true
        : status === "incorrect"
        ? false
        : null

    console.log("DEBUG RESULT:", { status, isCorrect })

    const { error: updateError } = await supabase
      .from("question_instances")
      .update({
        user_answer: answer,
        was_correct: isCorrect
      })
      .eq("id", question_instance_id)

    if (updateError) {
      console.error("UPDATE ERROR:", updateError)
      throw updateError
    }

    // 🔥 spaced repetition kun for short
    if (status === "correct" || status === "incorrect") {

      const nextReviewAt = new Date()

      if (status === "correct") {
        nextReviewAt.setDate(nextReviewAt.getDate() + 1)
      } else {
        nextReviewAt.setMinutes(nextReviewAt.getMinutes() + 10)
      }

      await supabase
        .from("question_instances")
        .update({ next_review_at: nextReviewAt.toISOString() })
        .eq("id", question_instance_id)
        .eq("student_id", user.id)
    }

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

  } catch (err) {

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