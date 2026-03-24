import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

import {
  getOne,
  assertQuestion,
  assertProgress,
  buildQuestionResponse,
  handleError,
} from "../_shared/foundation.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
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

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const student_id = user.id

    // ========================
    // OPEN INSTANCE
    // ========================

    const { data: openRows, error: openError } = await supabase
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
      .order("created_at", { ascending: false })
      .limit(1)

    if (openError) throw openError

    const openInstance = getOne(openRows)

    if (openInstance) {
      return new Response(
        JSON.stringify(
          buildQuestionResponse({
            instance_id: openInstance.id,
            question: openInstance.questions,
          })
        ),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      )
    }

    // ========================
    // PROGRESS (GET OR CREATE)
    // ========================

    const { data: progressRows, error: progressError } = await supabase
      .from("student_progress")
      .select("*")
      .eq("student_id", student_id)
      .limit(1)

    if (progressError) throw progressError

    let progress = getOne(progressRows)

    if (!progress) {
      const { data: createdRows, error: createError } = await supabase
        .from("student_progress")
        .insert({
          student_id,
          mastery_level: 1,
          xp: 0,
          coins: 0,
        })
        .select()
        .limit(1)

      if (createError) throw createError

      progress = getOne(createdRows)
    }

    const mastery = assertProgress(progress).mastery_level

    // ========================
    // SIMPLE QUESTION FETCH (STABIL BASELINE)
    // ========================

    const { data: questions, error: qError } = await supabase
      .from("questions")
      .select("*")
      .eq("is_active", true)
      .limit(1)

    if (qError) throw qError

    const question = getOne(questions)

    if (!question) {
      throw new Error("No questions available")
    }

    // ========================
    // CREATE INSTANCE
    // ========================

    const { data: instanceRows, error: insertError } = await supabase
      .from("question_instances")
      .insert({
        student_id,
        question_id: question.id,
        correct_answer: question.content.correct,
        difficulty_at_time: question.difficulty,
        mastery_snapshot: mastery,
        answered: false,
        next_review_at: new Date().toISOString(),
        incorrect_attempts: 0,
      })
      .select()
      .limit(1)

    if (insertError) throw insertError

    const instance = getOne(instanceRows)

    if (!instance) throw new Error("Failed to create instance")

    return new Response(
      JSON.stringify(
        buildQuestionResponse({
          instance_id: instance.id,
          question,
        })
      ),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    )

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    )
  }
})
