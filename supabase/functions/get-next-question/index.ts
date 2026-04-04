import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
}

function debugResponse(payload) {
  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  })
}

function formatResponse(instance_id, q) {
  return {
    question_instance_id: instance_id,
    answer_format: q?.answer_format ?? null,
    type: q?.type ?? null,
    content: {
      question: q?.content?.question ?? null,
      options: q?.content?.options ?? null
    }
  }
}

serve(async (req) => {

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  try {

    const authHeader = req.headers.get("Authorization")

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: authHeader } }
      }
    )

    const { data: userData } = await supabaseAuth.auth.getUser()
    const student_id = userData.user.id

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    // 🔥 CHECK FOR EXISTING UNANSWERED INSTANCE
    const { data: openInstance } = await supabaseAdmin
      .from("question_instances")
      .select("id, question_id")
      .eq("student_id", student_id)
      .eq("answered", false)
      .limit(1)

    if (openInstance && openInstance.length > 0) {
      const existingInstanceId = openInstance[0].id
      const existingQuestionId = openInstance[0].question_id

      const { data: existingQuestion } = await supabaseAdmin
        .from("questions")
        .select("*")
        .eq("id", existingQuestionId)
        .limit(1)

      if (!existingQuestion || existingQuestion.length === 0) {
        return debugResponse({ step: "existing_question_not_found" })
      }

      return debugResponse(formatResponse(existingInstanceId, existingQuestion[0]))
    }

    // 🔥 HENT ALLEREDE SETE QUESTIONS
    const { data: seenRows } = await supabaseAdmin
      .from("question_instances")
      .select("question_id")
      .eq("student_id", student_id)

    const seenIds = new Set((seenRows ?? []).map(r => r.question_id))

    // 🔥 HENT SPØRGSMÅL
    const { data: questions } = await supabaseAdmin
      .from("questions")
      .select("*")
      .eq("is_active", true)

    // 🔥 FIND FØRSTE IKKE SET
    const q = questions?.find(q => !seenIds.has(q.id))

    if (!q) {
      return debugResponse({ step: "no_more_questions" })
    }

    const { data: insertData, error: insertError } = await supabaseAdmin
      .from("question_instances")
      .insert({
        student_id,
        question_id: q.id,
        correct_answer: q.content?.correct,
        difficulty_at_time: q.difficulty ?? 1,
        mastery_snapshot: q.difficulty ?? 1,
        answered: false,
        next_review_at: new Date().toISOString(),
        incorrect_attempts: 0
      })
      .select("id")

    if (insertError) {
      return debugResponse({
        step: "insert_error",
        message: insertError.message,
        code: insertError.code
      })
    }

    return debugResponse(formatResponse(insertData[0].id, q))

  } catch (err) {
    return debugResponse({
      step: "catch",
      message: err?.message
    })
  }

})
