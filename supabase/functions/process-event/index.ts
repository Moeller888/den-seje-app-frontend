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

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders
      })
    }

    const body = await req.json().catch(() => null)

    if (!body) {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: corsHeaders
      })
    }

    const { question_instance_id, answer, question_shown_at } = body

    if (!question_instance_id || !answer) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: corsHeaders
      })
    }

    // 🔥 HENT INSTANCE (uden join)
    const { data: instance, error: instanceError } = await supabase
      .from("question_instances")
      .select("correct_answer, student_id, question_id")
      .eq("id", question_instance_id)
      .single()

    if (instanceError || !instance) {
      return new Response(JSON.stringify({ error: "Instance not found" }), {
        status: 400,
        headers: corsHeaders
      })
    }

    // 🔥 HENT QUESTION SEPARAT (robust!)
    const { data: question, error: questionError } = await supabase
      .from("questions")
      .select("answer_format, answer_type")
      .eq("id", instance.question_id)
      .single()

    if (questionError || !question) {
      return new Response(JSON.stringify({ error: "Question not found" }), {
        status: 400,
        headers: corsHeaders
      })
    }

    const correct_answer = instance.correct_answer
    const format = (question.answer_format || "").toLowerCase()
    const answerType = question.answer_type || "short"

    console.log("DEBUG answerType:", answerType)

    let status = "pending"

    // 🔥 LONG
    if (answerType === "long") {

      const words = countWords(answer)

      if (words < 20) {
        return new Response(
          JSON.stringify({
            status: "invalid",
            error: "Svar skal være mindst 20 ord"
          }),
          {
            status: 400,
            headers: corsHeaders
          }
        )
      }

      status = "pending"

    } else {

      // 🔥 SHORT

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

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: corsHeaders
          })
        }

        status = data?.status ?? "pending"
      }
    }

    const isCorrect =
      status === "correct"
        ? true
        : status === "incorrect"
        ? false
        : null

    await supabase
      .from("question_instances")
      .update({
        user_answer: answer,
        was_correct: isCorrect
      })
      .eq("id", question_instance_id)

    // 🔥 spaced repetition
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
      JSON.stringify({ status }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    )

  } catch (err) {

    console.error("CRASH:", err)

    return new Response(
      JSON.stringify({ error: err?.message || "Unknown error" }),
      {
        status: 500,
        headers: corsHeaders
      }
    )
  }

})