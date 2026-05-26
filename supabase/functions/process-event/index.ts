import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json"
}

function normalize(str: string) {
  return (str || "")
    .toLowerCase()
    .trim()
    .replace(/[.,!?]/g, "")
    .replace(/\s+/g, " ")
}

function isTextCorrect(user: string, correct: string) {
  const u = normalize(user)
  const c = normalize(correct)
  if (!u || !c) return false
  if (u === c) return true
  if (u.includes(c) || c.includes(u)) return true
  return false
}

function countWords(text: string) {
  return (text || "")
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 0).length
}

// Extract review_text from metadata (preferred) or content (fallback)
function extractReviewText(metadata: any, content: any): string | null {
  if (metadata && typeof metadata.review_text === "string" && metadata.review_text.trim().length > 0) {
    return metadata.review_text.trim()
  }
  if (content && typeof content.review_text === "string" && content.review_text.trim().length > 0) {
    return content.review_text.trim()
  }
  return null
}

// Extract misconception_type from metadata (null-safe)
function extractMisconceptionType(metadata: any): string | null {
  if (metadata && typeof metadata.misconception_type === "string" && metadata.misconception_type.trim().length > 0) {
    return metadata.misconception_type.trim()
  }
  return null
}

serve(async (req) => {

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: corsHeaders
      })
    }

    const body = await req.json().catch(() => null)

    if (!body) {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400, headers: corsHeaders
      })
    }

    const { question_instance_id, answer, question_shown_at } = body

    if (!question_instance_id || !answer) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: corsHeaders
      })
    }

    // ── Fetch instance + question meta ───────────────────────────────────────
    const { data: instanceData, error: instanceError } = await supabase
      .from("question_instances")
      .select(`
        correct_answer,
        student_id,
        questions (
          answer_format,
          answer_type,
          content,
          metadata
        )
      `)
      .eq("id", question_instance_id)
      .maybeSingle()

    if (instanceError || !instanceData) {
      console.error("INSTANCE ERROR:", instanceError)
      return new Response(JSON.stringify({ error: "Instance not found" }), {
        status: 500, headers: corsHeaders
      })
    }

    const questionMeta    = instanceData.questions || {}
    const correct_answer  = instanceData.correct_answer
    const format          = (questionMeta.answer_format || "").toLowerCase()
    const answerType      = questionMeta.answer_type || "short"
    const questionContent = questionMeta.content ?? null
    const metadata        = questionMeta.metadata ?? null

    // Learning engine: extract review text and misconception type for feedback
    const reviewText        = extractReviewText(metadata, questionContent)
    const misconceptionType = extractMisconceptionType(metadata)

    console.log("DEBUG META:", { format, answerType, hasReviewText: !!reviewText, misconceptionType })

    // ── PATH 1: Long answer → save for teacher, no auto-grade ───────────────
    if (answerType === "long") {

      const words = countWords(answer)
      console.log("DEBUG wordCount:", words)

      if (words < 20) {
        return new Response(
          JSON.stringify({ status: "invalid", error: "Svar skal være mindst 20 ord" }),
          { status: 400, headers: corsHeaders }
        )
      }

      // Save the answer text so the teacher can see it. Do not mark answered=true
      // because the question should stay visible in the teacher queue.
      const { error: saveError } = await supabase
        .from("question_instances")
        .update({ user_answer: answer })
        .eq("id", question_instance_id)
        .eq("student_id", user.id)

      if (saveError) {
        console.error("LONG SAVE ERROR:", saveError)
        return new Response(JSON.stringify({ error: saveError.message }), {
          status: 500, headers: corsHeaders
        })
      }

      console.log("FLOW: LONG → pending")
      return new Response(
        JSON.stringify({ status: "pending", correct_answer: null, review_text: null }),
        { status: 200, headers: corsHeaders }
      )
    }

    // ── PATH 2: Short text → atomic process_text_answer RPC ─────────────────
    if (format.includes("text")) {

      const isCorrect = isTextCorrect(answer, correct_answer)
      console.log("FLOW: SHORT TEXT →", isCorrect ? "correct" : "incorrect")

      // process_text_answer: atomically sets answered=true, was_correct,
      // next_review_at, and awards XP+coins if correct — with a CAS guard
      // on answered=false so rewards cannot be given twice even on retry.
      const { data: rpcResult, error: rpcError } = await supabase.rpc(
        "process_text_answer",
        {
          p_instance_id: question_instance_id,
          p_user_id:     user.id,
          p_user_answer: answer,
          p_is_correct:  isCorrect
        }
      )

      if (rpcError) {
        console.error("PROCESS TEXT ANSWER ERROR:", rpcError)
        return new Response(JSON.stringify({ error: rpcError.message }), {
          status: 500, headers: corsHeaders
        })
      }

      console.log("PROCESS TEXT ANSWER RESULT:", rpcResult)

      // Fire-and-forget: record misconception signal if incorrect and available
      if (!isCorrect && misconceptionType) {
        supabase
          .from("question_instances")
          .update({ misconception_signal: misconceptionType })
          .eq("id", question_instance_id)
          .eq("student_id", user.id)
          .then(() => {})
      }

      // 'already_processed' means the instance was already answered — return
      // the same status without double-awarding. This handles network retries.
      return new Response(
        JSON.stringify({
          status: isCorrect ? "correct" : "incorrect",
          correct_answer,
          review_text: isCorrect ? null : reviewText,
        }),
        { status: 200, headers: corsHeaders }
      )
    }

    // ── PATH 3: MC / number → process_question_attempt RPC ──────────────────
    console.log("FLOW: MC/NUMBER → process_question_attempt")

    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "process_question_attempt",
      {
        p_student_id:            user.id,
        p_question_instance_id:  question_instance_id,
        p_answer:                answer,
        p_question_shown_at:     question_shown_at ?? Date.now()
      }
    )

    if (rpcError) {
      console.error("RPC ERROR:", rpcError)
      return new Response(JSON.stringify({ error: rpcError.message }), {
        status: 500, headers: corsHeaders
      })
    }

    const status = rpcData?.status ?? "pending"
    console.log("DEBUG MC RESULT:", { status })

    // Fire-and-forget: record misconception signal if incorrect and available
    if (status === "incorrect" && misconceptionType) {
      supabase
        .from("question_instances")
        .update({ misconception_signal: misconceptionType })
        .eq("id", question_instance_id)
        .eq("student_id", user.id)
        .then(() => {})
    }

    // Set next_review_at for spaced repetition scheduling.
    // The RPC handles answered=true + was_correct; this adds the review time.
    if (status === "correct" || status === "incorrect") {

      const nextReviewAt = new Date()
      if (status === "correct") {
        nextReviewAt.setDate(nextReviewAt.getDate() + 1)
      } else {
        nextReviewAt.setMinutes(nextReviewAt.getMinutes() + 10)
      }

      const { error: reviewError } = await supabase
        .from("question_instances")
        .update({ next_review_at: nextReviewAt.toISOString() })
        .eq("id", question_instance_id)
        .eq("student_id", user.id)

      if (reviewError) {
        console.error("REVIEW UPDATE ERROR:", reviewError)
        // Non-fatal: next_review_at is scheduling metadata, not a reward guard.
        // Log and continue rather than failing the entire response.
      }
    }

    return new Response(
      JSON.stringify({
        status,
        correct_answer: rpcData?.correct_answer ?? correct_answer,
        review_text: status === "incorrect" ? reviewText : null,
      }),
      { status: 200, headers: corsHeaders }
    )

  } catch (err: any) {
    console.error("FULL ERROR:", err)
    return new Response(
      JSON.stringify({ error: err?.message ?? "Unknown error" }),
      { status: 500, headers: corsHeaders }
    )
  }

})
