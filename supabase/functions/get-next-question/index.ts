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

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Unauthorized")

    const student_id = user.id

    /* open instance */

    const { data: existing } = await supabase
      .from("question_instances")
      .select(`
        id,
        question_id,
        questions (
          content,
          answer_format
        )
      `)
      .eq("student_id", student_id)
      .eq("answered", false)
      .maybeSingle()

    if (existing) {

      const q = existing.questions

      return new Response(
        JSON.stringify({
          question_instance_id: existing.id,
          type: "open",
          content: { question: q.content.question },
          answer_format: q.answer_format
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200
        }
      )
    }

    /* progress */

    const { data: progress } = await supabase
      .from("student_progress")
      .select("*")
      .eq("student_id", student_id)
      .single()

    const mastery = progress.mastery_level

    /* cooldown */

    const { data: recentEvents } = await supabase
      .from("student_events")
      .select("payload")
      .eq("student_id", student_id)
      .eq("type", "QUESTION_SHOWN")
      .order("created_at", { ascending: false })
      .limit(10)

    const recentIds = recentEvents
      ? recentEvents.map(e => e.payload.question_id)
      : []

    /* due reviews */

    const { data: dueReviews } = await supabase
      .from("question_instances")
      .select(`
        id,
        question_id,
        questions (
          id,
          content,
          difficulty,
          answer_format
        )
      `)
      .eq("student_id", student_id)
      .lte("next_review_at", new Date().toISOString())
      .lt("incorrect_attempts", 3)
      .order("next_review_at", { ascending: true })
      .limit(20)

    if (dueReviews && dueReviews.length > 0) {

      const chosen = dueReviews[Math.floor(Math.random() * dueReviews.length)]

      await supabase.from("student_events").insert({
        student_id,
        type: "QUESTION_SHOWN",
        payload: {
          question_instance_id: chosen.id,
          question_id: chosen.question_id,
          difficulty: chosen.questions.difficulty,
          mastery_snapshot: mastery
        }
      })

      return new Response(
        JSON.stringify({
          question_instance_id: chosen.id,
          type: "open",
          content: { question: chosen.questions.content.question },
          answer_format: chosen.questions.answer_format
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200
        }
      )
    }

    /* candidate questions */

    let query = supabase
      .from("questions")
      .select("*")
      .lte("difficulty", mastery)
      .eq("is_active", true)

    if (recentIds.length > 0) {
      query = query.not("id", "in", `(${recentIds.join(",")})`)
    }

    const { data: candidates } = await query.limit(200)

    if (!candidates || candidates.length === 0) {
      throw new Error("No questions available")
    }

    /* fetch exposure counts */

    const { data: seen } = await supabase
      .from("question_instances")
      .select("question_id")

    const counts = {}

    if (seen) {
      for (const row of seen) {
        counts[row.question_id] = (counts[row.question_id] || 0) + 1
      }
    }

    /* sort by least seen */

    candidates.sort((a, b) => {
      const aSeen = counts[a.id] || 0
      const bSeen = counts[b.id] || 0
      return aSeen - bSeen
    })

    const pool = candidates.slice(0, 20)

    const question = pool[Math.floor(Math.random() * pool.length)]

    const { data: instance } = await supabase
      .from("question_instances")
      .insert({
        student_id,
        question_id: question.id,
        correct_answer: question.content.correct,
        difficulty_at_time: question.difficulty,
        mastery_snapshot: mastery,
        answered: false,
        next_review_at: new Date().toISOString(),
        incorrect_attempts: 0
      })
      .select()
      .single()

    await supabase.from("student_events").insert({
      student_id,
      type: "QUESTION_SHOWN",
      payload: {
        question_instance_id: instance.id,
        question_id: question.id,
        difficulty: question.difficulty,
        mastery_snapshot: mastery
      }
    })

    return new Response(
      JSON.stringify({
        question_instance_id: instance.id,
        type: "open",
        content: { question: question.content.question },
        answer_format: question.answer_format
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
      }
    )

  } catch (err) {

    return new Response(
      JSON.stringify({ error: err.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500
      }
    )
  }

})
