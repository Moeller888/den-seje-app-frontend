import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { selectNextQuestion } from "../_domain/selection.ts"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json"
}

serve(async (req) => {

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {

    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders })
    }

    const supabase = createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: authHeader } } }
    )

    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return new Response("Invalid user", {
        status: 401,
        headers: corsHeaders
      })
    }

    const { data: openInstance } = await supabase
      .from("question_instances")
      .select("*")
      .eq("student_id", user.id)
      .eq("answered", false)
      .maybeSingle()

    if (openInstance) {

      const { data: question, error: questionError } = await supabase
        .from("questions")
        .select("type, question_type, content, answer_format")
        .eq("id", openInstance.question_id)
        .single()

      if (questionError || !question) {
        return new Response("Question not found", {
          status: 500,
          headers: corsHeaders
        })
      }

      const sanitizedContent = { ...question.content }
      delete sanitizedContent.correct

      return new Response(JSON.stringify({
        question_instance_id: openInstance.id,
        type: question.type,
        content: sanitizedContent,
        answer_format: question.answer_format
      }), { headers: corsHeaders })
    }

    const { data: progress } = await supabase
      .from("student_progress")
      .select("mastery_level, mastery_balance")
      .eq("student_id", user.id)
      .single()

    if (!progress) {
      return new Response("Progress not found", {
        status: 400,
        headers: corsHeaders
      })
    }

    const { data: questions, error: questionsError } = await supabase
      .from("questions")
      .select("*")
      .eq("is_active", true)
      .eq("question_type", "auto")

    if (questionsError) {
      return new Response(questionsError.message, {
        status: 500,
        headers: corsHeaders
      })
    }

    if (!questions || questions.length === 0) {
      return new Response("No auto-evaluable questions", {
        status: 404,
        headers: corsHeaders
      })
    }

    const question = selectNextQuestion({
      mastery_level: progress.mastery_level,
      mastery_balance: progress.mastery_balance,
      questions
    })

    if (!question) {
      return new Response("No suitable question found", {
        status: 500,
        headers: corsHeaders
      })
    }

    const { data: newInstance, error: insertError } = await supabase
      .from("question_instances")
      .insert({
        student_id: user.id,
        question_id: question.id,
        correct_answer: question.content.correct,
        difficulty_at_time: question.difficulty,
        mastery_snapshot: progress.mastery_level,
        answered: false
      })
      .select()
      .single()

    if (insertError || !newInstance) {
      return new Response(insertError?.message ?? "Insert failed", {
        status: 500,
        headers: corsHeaders
      })
    }

    const sanitizedContent = { ...question.content }
    delete sanitizedContent.correct

    return new Response(JSON.stringify({
      question_instance_id: newInstance.id,
      type: question.type,
      content: sanitizedContent,
      answer_format: question.answer_format
    }), { headers: corsHeaders })

  } catch (err: any) {
    return new Response(err?.message ?? "Server error", {
      status: 500,
      headers: corsHeaders
    })
  }

})
