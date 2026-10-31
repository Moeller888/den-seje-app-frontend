import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { publishableKey, serviceKey, serviceKeySource } from "../_shared/supabase-keys.ts";
import { isTextAnswerCorrect } from "../_shared/answer-evaluation.ts";
import { ADMIN_CLIENT_OPTIONS, isInstanceOwner, callProcessTextAnswer, callProcessQuestionAttempt } from "./text-answer-rpc.ts";
import { callProcessTextAnswerV2, callProcessQuestionAttemptV2, LEGACY_ANSWER_RPCS } from "./text-answer-rpc.ts";
import { updateOwnInstance, recordMisconceptionSignal, type InstanceWriteResult } from "./instance-writes.ts";
import { readInstanceForGrading } from "./instance-read.ts";
import { answerMode, replyForV2, isRevokedLegacyRpc, errorCodeOf, CLIENT_OUTDATED, UNEXPECTED_RESULT } from "./answer-v2.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json"
}

// Deploy diagnostic: which backend key source the answer RPCs will use. serviceKeySource()
// returns only a fixed word ("secret-keys", "legacy-service-role", "none" or
// "invalid-configuration") and never throws, so this line can neither leak a key nor break a request.
console.log(`[process-event] service-key source=${serviceKeySource()}`)

// The backend client for the grading read (instance + answer key + question — see ./instance-read.ts),
// the two privileged answer RPCs (process_text_answer and process_question_attempt — see
// ./text-answer-rpc.ts) and the server-owned question_instances writes (long-answer save,
// misconception signal — see ./instance-writes.ts), and nothing else.
// Built per call, only when one of those is about to run: no pupil Authorization header, no session.
// If the key cannot be resolved this throws — never a fallback to the user client.
function makeAdminClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, serviceKey(), ADMIN_CLIENT_OPTIONS)
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
      publishableKey(),
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

    // H5 (D-273, ./answer-v2.ts): round_no + submission_id select the protected _v2 path; neither
    // selects the legacy path, unchanged. One field alone, or a malformed one, is rejected here —
    // before anything is read or written, and never downgraded to the legacy path.
    const mode = answerMode(body)
    if (mode.kind === "invalid") {
      return new Response(JSON.stringify({ outcome: "invalid_request", reason: mode.reason, error: "Invalid request" }), {
        status: 400, headers: corsHeaders
      })
    }
    const h5 = mode.kind === "h5" ? mode : null

    // ── Fetch instance + question meta ───────────────────────────────────────
    // A backend read (./instance-read.ts): the answer key and the question content are server-only.
    // Nothing from the row is used or returned before the ownership check below.
    let instanceData: any
    let instanceError: any
    try {
      ({ data: instanceData, error: instanceError } = await readInstanceForGrading(
        makeAdminClient,
        question_instance_id
      ))
    } catch (keyError: any) {
      // serviceKey()'s messages name the variables, never their values.
      console.error("ADMIN CLIENT ERROR:", keyError?.message ?? keyError)
      return new Response(JSON.stringify({ error: "Server configuration error" }), {
        status: 500, headers: corsHeaders
      })
    }

    if (instanceError || !instanceData) {
      console.error("INSTANCE ERROR:", instanceError)
      // H5: a missing instance is the not_found outcome. A read error stays the 500 below.
      if (h5 && !instanceError) {
        return new Response(JSON.stringify({ outcome: "not_found", error: "Instance not found" }), {
          status: 404, headers: corsHeaders
        })
      }
      return new Response(JSON.stringify({ error: "Instance not found" }), {
        status: 500, headers: corsHeaders
      })
    }

    // Ownership before any answer path: the instance was read through the admin client, which
    // bypasses RLS, so a teacher or another pupil naming this id must be stopped here (403).
    if (!isInstanceOwner(instanceData.student_id, user.id)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: corsHeaders
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
    // Also with valid H5 fields: long answers are not covered by the answer history yet (H4 is open),
    // so they keep this teacher path unchanged and the fields are not used.
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
      // question_instances has no UPDATE policy, so the pupil's client would update 0 rows and
      // report success. The save goes through the admin client, scoped to the instance AND the
      // verified user.id, and must touch exactly one row (./instance-writes.ts). Nothing has been
      // awarded yet, so a failed save is a 500 — never a silent "pending".
      let saveResult: InstanceWriteResult
      try {
        saveResult = await updateOwnInstance(
          makeAdminClient,
          { instanceId: question_instance_id, studentId: user.id },
          { user_answer: answer }
        )
      } catch (keyError: any) {
        // serviceKey()'s messages name the variables, never their values.
        console.error("ADMIN CLIENT ERROR:", keyError?.message ?? keyError)
        return new Response(JSON.stringify({ error: "Server configuration error" }), {
          status: 500, headers: corsHeaders
        })
      }

      if (!saveResult.ok) {
        console.error("LONG SAVE ERROR:", JSON.stringify({
          instance_id: question_instance_id,
          reason: saveResult.reason,
          rows: saveResult.rows,
          code: saveResult.code,
        }))
        return new Response(JSON.stringify({ error: "Could not save answer" }), {
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

      // Exact match after normalisation against the correct answer or an explicit
      // accepted_answers variant — never a substring or fuzzy match (_shared/answer-evaluation.ts).
      const isCorrect = isTextAnswerCorrect(answer, correct_answer, questionContent?.accepted_answers)
      console.log("FLOW: SHORT TEXT →", isCorrect ? "correct" : "incorrect")

      // H5: process_text_answer_v2 checks the round and the submission, registers the attempt and
      // writes next_review_at and the misconception signal in ONE transaction — so nothing is written
      // here afterwards, and a replay changes nothing.
      if (h5) {
        let v2Data: unknown
        let v2Error: unknown
        try {
          ({ data: v2Data, error: v2Error } = await callProcessTextAnswerV2(
            makeAdminClient,
            {
              instanceId:        question_instance_id,
              userId:            user.id,
              answer,
              isCorrect,
              roundNo:           h5.roundNo,
              submissionId:      h5.submissionId,
              reviewText,
              misconceptionType,
            }
          ))
        } catch (keyError: any) {
          // serviceKey()'s messages name the variables, never their values.
          console.error("ADMIN CLIENT ERROR:", keyError?.message ?? keyError)
          return new Response(JSON.stringify({ error: "Server configuration error" }), {
            status: 500, headers: corsHeaders
          })
        }

        if (v2Error) {
          // No fallback to process_text_answer, and no database detail in the response.
          console.error("PROCESS TEXT ANSWER V2 ERROR:", JSON.stringify({ instance_id: question_instance_id, code: errorCodeOf(v2Error) }))
          return new Response(JSON.stringify(UNEXPECTED_RESULT), { status: 500, headers: corsHeaders })
        }

        const reply = replyForV2(v2Data, h5.roundNo)
        if (reply.problem) {
          console.error("PROCESS TEXT ANSWER V2 UNEXPECTED:", JSON.stringify({ instance_id: question_instance_id, problem: reply.problem }))
        }
        console.log("FLOW: SHORT TEXT V2 →", reply.body.outcome ?? "error")
        return new Response(JSON.stringify(reply.body), { status: reply.status, headers: corsHeaders })
      }

      // process_text_answer: atomically sets answered=true, was_correct,
      // next_review_at, and awards XP+coins if correct — with a CAS guard
      // on answered=false so rewards cannot be given twice even on retry.
      // It trusts p_user_id and p_is_correct, so it is called ONLY through a backend admin client
      // (no pupil Authorization header), with the verified user.id and the evaluator's result.
      // A broken key configuration fails here, loudly — never a fallback to the user client.
      let rpcResult: unknown
      let rpcError: any
      try {
        ({ data: rpcResult, error: rpcError } = await callProcessTextAnswer(
          makeAdminClient,
          {
            instanceId: question_instance_id,
            userId:     user.id,
            answer,
            isCorrect,
          }
        ))
      } catch (keyError: any) {
        // serviceKey()'s messages name the variables, never their values.
        console.error("ADMIN CLIENT ERROR:", keyError?.message ?? keyError)
        return new Response(JSON.stringify({ error: "Server configuration error" }), {
          status: 500, headers: corsHeaders
        })
      }

      // M2: once EXECUTE is revoked, a request without H5 fields comes from an outdated client.
      // The privilege check ran before the function body, so nothing was registered.
      if (rpcError && isRevokedLegacyRpc(rpcError, LEGACY_ANSWER_RPCS.text)) {
        console.error("LEGACY ANSWER PATH CLOSED:", JSON.stringify({ fn: LEGACY_ANSWER_RPCS.text }))
        return new Response(JSON.stringify(CLIENT_OUTDATED), { status: 426, headers: corsHeaders })
      }

      if (rpcError) {
        console.error("PROCESS TEXT ANSWER ERROR:", rpcError)
        return new Response(JSON.stringify({ error: rpcError.message }), {
          status: 500, headers: corsHeaders
        })
      }

      console.log("PROCESS TEXT ANSWER RESULT:", rpcResult)

      // Record the misconception signal if incorrect and available — through the admin client,
      // scoped to the instance and user.id. Non-fatal: the answer is already processed, so a failed
      // write is logged ("INSTANCE WRITE FAILED") and the normal response below is still returned.
      if (!isCorrect && misconceptionType) {
        await recordMisconceptionSignal(makeAdminClient, {
          instanceId: question_instance_id,
          studentId:  user.id,
          signal:     misconceptionType,
        })
      }

      // 'already_processed' means the instance was already answered — return
      // the same status without double-awarding. This handles network retries.
      return new Response(
        JSON.stringify({
          status: isCorrect ? "correct" : "incorrect",
          correct_answer,
          review_text: isCorrect ? null : reviewText,
          misconception_type: isCorrect ? null : misconceptionType,
        }),
        { status: 200, headers: corsHeaders }
      )
    }

    // ── PATH 3: MC / number → process_question_attempt RPC ──────────────────

    // H5: process_question_attempt_v2 grades, checks the round and the submission, registers the
    // attempt and writes the misconception signal in ONE transaction, so process-event writes nothing
    // afterwards — not on a replay, a refusal or an error either.
    // next_review_at: neither the legacy function nor _v2 sets it for MC/number. The legacy path's own
    // write below goes through the pupil's client and question_instances has no UPDATE policy, so it
    // changes no row (verified 2026-10-31); it is not repeated here. Reviving spaced repetition belongs
    // in the database transaction and is a separate decision. question_shown_at is not a _v2 parameter.
    if (h5) {
      console.log("FLOW: MC/NUMBER → process_question_attempt_v2")
      let v2Data: unknown
      let v2Error: unknown
      try {
        ({ data: v2Data, error: v2Error } = await callProcessQuestionAttemptV2(
          makeAdminClient,
          {
            studentId:         user.id,
            instanceId:        question_instance_id,
            answer,
            roundNo:           h5.roundNo,
            submissionId:      h5.submissionId,
            reviewText,
            misconceptionType,
          }
        ))
      } catch (keyError: any) {
        // serviceKey()'s messages name the variables, never their values.
        console.error("ADMIN CLIENT ERROR:", keyError?.message ?? keyError)
        return new Response(JSON.stringify({ error: "Server configuration error" }), {
          status: 500, headers: corsHeaders
        })
      }

      if (v2Error) {
        // No fallback to process_question_attempt, and no database detail in the response.
        console.error("RPC V2 ERROR:", JSON.stringify({ instance_id: question_instance_id, code: errorCodeOf(v2Error) }))
        return new Response(JSON.stringify(UNEXPECTED_RESULT), { status: 500, headers: corsHeaders })
      }

      const reply = replyForV2(v2Data, h5.roundNo)
      if (reply.problem) {
        console.error("RPC V2 UNEXPECTED:", JSON.stringify({ instance_id: question_instance_id, problem: reply.problem }))
      }
      console.log("DEBUG MC V2 RESULT:", { outcome: reply.body.outcome ?? "error" })
      return new Response(JSON.stringify(reply.body), { status: reply.status, headers: corsHeaders })
    }

    console.log("FLOW: MC/NUMBER → process_question_attempt")

    // process_question_attempt evaluates the answer itself and awards XP/coins, streak and quests
    // (or the reduced repeat award). It takes p_student_id as a parameter, so — like the short-text
    // award — it is called ONLY through the backend admin client, after the ownership check above,
    // with the verified user.id. Correctness, rewards and idempotency stay in the database function.
    // A broken key configuration fails here, loudly — never a fallback to the user client.
    let rpcData: any
    let rpcError: any
    try {
      ({ data: rpcData, error: rpcError } = await callProcessQuestionAttempt(
        makeAdminClient,
        {
          studentId:       user.id,
          instanceId:      question_instance_id,
          answer,
          questionShownAt: question_shown_at ?? Date.now(),
        }
      ))
    } catch (keyError: any) {
      // serviceKey()'s messages name the variables, never their values.
      console.error("ADMIN CLIENT ERROR:", keyError?.message ?? keyError)
      return new Response(JSON.stringify({ error: "Server configuration error" }), {
        status: 500, headers: corsHeaders
      })
    }

    // M2: see the short-text path above.
    if (rpcError && isRevokedLegacyRpc(rpcError, LEGACY_ANSWER_RPCS.mc)) {
      console.error("LEGACY ANSWER PATH CLOSED:", JSON.stringify({ fn: LEGACY_ANSWER_RPCS.mc }))
      return new Response(JSON.stringify(CLIENT_OUTDATED), { status: 426, headers: corsHeaders })
    }

    if (rpcError) {
      console.error("RPC ERROR:", rpcError)
      return new Response(JSON.stringify({ error: rpcError.message }), {
        status: 500, headers: corsHeaders
      })
    }

    const status = rpcData?.status ?? "pending"
    console.log("DEBUG MC RESULT:", { status })

    // Record the misconception signal if incorrect and available — through the admin client, scoped
    // to the instance and user.id. Non-fatal: the RPC has already marked the instance answered and
    // paid out, so a failed write is logged ("INSTANCE WRITE FAILED") and the response is unchanged.
    if (status === "incorrect" && misconceptionType) {
      await recordMisconceptionSignal(makeAdminClient, {
        instanceId: question_instance_id,
        studentId:  user.id,
        signal:     misconceptionType,
      })
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
        misconception_type: status === "incorrect" ? misconceptionType : null,
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
