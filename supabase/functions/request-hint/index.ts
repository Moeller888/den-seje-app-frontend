// Lærligverse L3: a pupil asks for the next hint of their open round; the SERVER logs it and returns the text.
// The contract, the switch (LAERLIGVERSE_HINTS, off unless exactly "on") and the outcomes are in ./hint-request.ts.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.118.0"
import { publishableKey, serviceKey } from "../_shared/supabase-keys.ts"
import {
  ADMIN_CLIENT_OPTIONS, HINTS_DISABLED, HINTS_ENV, UNEXPECTED_HINT_RESULT, callRequestQuestionHint, errorCodeOf,
  hintsEnabled, parseHintRequest, replyForHint,
} from "./hint-request.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json"
}

// The backend client for request_question_hint and nothing else. Built per call, only when the RPC is about to
// run: no pupil Authorization header, no session. If the key cannot be resolved this throws — never a fallback to
// the user client.
function makeAdminClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, serviceKey(), ADMIN_CLIENT_OPTIONS)
}

serve(async (req) => {

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  // Off (the default): nothing is built, read or written.
  if (!hintsEnabled(Deno.env.get(HINTS_ENV))) {
    return new Response(JSON.stringify(HINTS_DISABLED), { status: 404, headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders })
  }

  try {

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      publishableKey(),
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders })
    }

    const body = await req.json().catch(() => null)
    const parsed = parseHintRequest(body)
    if (!parsed.ok) {
      return new Response(JSON.stringify({ outcome: "invalid_request", reason: parsed.reason, error: "Invalid request" }), {
        status: 400, headers: corsHeaders
      })
    }

    let data: unknown
    let error: unknown
    try {
      ({ data, error } = await callRequestQuestionHint(makeAdminClient, user.id, parsed.request))
    } catch (keyError: any) {
      // serviceKey()'s messages name the variables, never their values.
      console.error("ADMIN CLIENT ERROR:", keyError?.message ?? keyError)
      return new Response(JSON.stringify({ error: "Server configuration error" }), { status: 500, headers: corsHeaders })
    }

    if (error) {
      console.error("HINT RPC ERROR:", JSON.stringify({ instance_id: parsed.request.instanceId, code: errorCodeOf(error) }))
      return new Response(JSON.stringify(UNEXPECTED_HINT_RESULT), { status: 500, headers: corsHeaders })
    }

    const reply = replyForHint(data, parsed.request)
    if (reply.problem) {
      console.error("HINT RPC UNEXPECTED:", JSON.stringify({ instance_id: parsed.request.instanceId, problem: reply.problem }))
    }
    // The text is never logged: only the outcome and the level.
    console.log("HINT:", { outcome: reply.body.outcome ?? "error", level: parsed.request.level })
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: corsHeaders })

  } catch (err: any) {
    console.error("HINT FUNCTION ERROR:", err?.message ?? err)
    return new Response(JSON.stringify(UNEXPECTED_HINT_RESULT), { status: 500, headers: corsHeaders })
  }

})
