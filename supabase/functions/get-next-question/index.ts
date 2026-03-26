import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Unauthorized")

    const student_id = user.id

    // 1. OPEN INSTANCE
    const { data: openRows } = await supabase
      .from("question_instances")
      .select("id, questions(content, answer_format, type)")
      .eq("student_id", student_id)
      .eq("answered", false)
      .limit(1)

    if (openRows?.length) {
      const inst = openRows[0]
      return new Response(JSON.stringify(
        formatResponse(inst.id, inst.questions)
      ), { headers: corsHeaders })
    }

    // 2. GET SEEN IDS
    const { data: seenRows } = await supabase
      .from("question_instances")
      .select("question_id")
      .eq("student_id", student_id)

    const seenIds = new Set(seenRows?.map(r => r.question_id))

    // 3. GET ALL QUESTIONS (simple & safe)
    const { data: questions } = await supabase
      .from("questions")
      .select("*")
      .eq("is_active", true)

    const q = questions?.find(q => !seenIds.has(q.id))

    if (!q) {
      return new Response(JSON.stringify({ step: "no_question" }), {
        status: 500,
        headers: corsHeaders
      })
    }

    // 4. INSERT (duplicate-safe)
    const { data: insertData, error: insertError } = await supabase
      .from("question_instances")
      .insert({
        student_id,
        question_id: q.id,
        correct_answer: q.content?.correct,
        difficulty_at_time: q.difficulty ?? 1,
        mastery_snapshot: 1,
        answered: false,
        next_review_at: new Date().toISOString(),
        incorrect_attempts: 0
      })
      .select()
      .limit(1)

    if (insertError && insertError.code === "23505") {
      const { data: existing } = await supabase
        .from("question_instances")
        .select("id, questions(content, answer_format, type)")
        .eq("student_id", student_id)
        .eq("question_id", q.id)
        .limit(1)

      const inst = existing?.[0]

      return new Response(JSON.stringify(
        formatResponse(inst.id, inst.questions)
      ), { headers: corsHeaders })
    }

    if (insertError) {
      return new Response(JSON.stringify({
        step: "insert",
        error: insertError
      }), { status: 500, headers: corsHeaders })
    }

    const instance = insertData?.[0]

    return new Response(JSON.stringify(
      formatResponse(instance.id, q)
    ), { headers: corsHeaders })

  } catch (err) {
    return new Response(JSON.stringify({
      step: "catch",
      message: err?.message
    }), {
      status: 500,
      headers: corsHeaders
    })
  }

})
