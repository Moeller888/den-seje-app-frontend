import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
}

function formatResponse(instance_id, q) {
  return {
    instance_id,
    question: q.content?.question,
    correct: q.content?.correct,
    answer_format: q.answer_format
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

    // OPEN INSTANCE
    const { data: openRows } = await supabase
      .from("question_instances")
      .select("id, questions(content, answer_format)")
      .eq("student_id", student_id)
      .eq("answered", false)
      .limit(1)

    if (openRows?.length) {
      const inst = openRows[0]
      return new Response(JSON.stringify(
        formatResponse(inst.id, inst.questions)
      ), { headers: corsHeaders })
    }

    // PROGRESS
    const { data: progressRows } = await supabase
      .from("student_progress")
      .select("mastery_level")
      .eq("student_id", student_id)
      .limit(1)

    const mastery = progressRows?.[0]?.mastery_level ?? 1

    // QUESTION
    const { data: questions } = await supabase
      .from("questions")
      .select("*")
      .eq("is_active", true)
      .limit(1)

    const q = questions?.[0]
    if (!q) throw new Error("No question")

    const difficulty = q.difficulty ?? 1
    const correct = q.content?.correct

    let instance

    const { data, error } = await supabase
      .from("question_instances")
      .insert({
        student_id,
        question_id: q.id,
        correct_answer: correct,
        difficulty_at_time: difficulty,
        mastery_snapshot: mastery,
        answered: false,
        next_review_at: new Date().toISOString(),
        incorrect_attempts: 0
      })
      .select()
      .limit(1)

    if (error && error.code === "23505") {
      const { data: existing } = await supabase
        .from("question_instances")
        .select("id")
        .eq("student_id", student_id)
        .eq("question_id", q.id)
        .limit(1)

      instance = existing?.[0]
    } else if (error) {
      throw error
    } else {
      instance = data?.[0]
    }

    if (!instance) throw new Error("No instance")

    return new Response(JSON.stringify(
      formatResponse(instance.id, q)
    ), { headers: corsHeaders })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders
    })
  }

})
