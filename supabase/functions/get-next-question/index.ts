import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

import {
  getOne,
  assertQuestion,
  assertProgress,
  buildQuestionResponse,
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

    console.log("START get-next-question")

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

    console.log("USER:", user)

    if (authError || !user) {
      throw new Error("Unauthorized")
    }

    const student_id = user.id

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

    console.log("OPEN ROWS:", openRows)

    if (openError) throw openError

    const openInstance = getOne(openRows)

    if (openInstance) {
      console.log("OPEN INSTANCE FOUND")

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

    console.log("NO OPEN INSTANCE → FETCHING QUESTION")

    const { data: questions, error: qError } = await supabase
      .from("questions")
      .select("*")
      .eq("is_active", true)
      .limit(1)

    console.log("QUESTIONS:", questions)

    if (qError) throw qError

    const question = getOne(questions)

    console.log("QUESTION:", question)

    if (!question) {
      throw new Error("No questions available")
    }

    if (!question.content) {
      throw new Error("Missing content field")
    }

    if (!question.content.correct) {
      throw new Error("Missing correct answer")
    }

    const { data: instanceRows, error: insertError } = await supabase
      .from("question_instances")
      .insert({
        student_id,
        question_id: question.id,
        correct_answer: question.content.correct,
        difficulty_at_time: question.difficulty,
        mastery_snapshot: 1,
        answered: false,
        next_review_at: new Date().toISOString(),
        incorrect_attempts: 0,
      })
      .select()
      .limit(1)

    console.log("INSERT RESULT:", instanceRows)
    console.log("INSERT ERROR:", insertError)

    if (insertError) throw insertError

    const instance = getOne(instanceRows)

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

    console.error("FULL ERROR:", err)

    return new Response(
      JSON.stringify({
        error: err.message,
        stack: err.stack,
        full: err
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    )
  }
})
