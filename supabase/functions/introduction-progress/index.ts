// Lærligverse LP-13 / K9 PROTOTYPE: register an introduction's explicit "completed", or the optional "presented"
// signal. Contract, switches (LAERLIGVERSE_INTRODUCTION, LAERLIGVERSE_PRESENTED — both off unless exactly "on") and
// outcomes: ./progress.ts.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.118.0"
import { publishableKey, serviceKey } from "../_shared/supabase-keys.ts"
import { DISABLED, UNEXPECTED, allowed, anyOn, errorCodeOf, flagsOf, parseProgressRequest, replyFor, rpcFor } from "./progress.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json"
}

const ADMIN_CLIENT_OPTIONS = { auth: { persistSession: false, autoRefreshToken: false } }

// The backend client for the one RPC; no pupil Authorization header, no session. If the key cannot be resolved this
// throws — never a fallback to the user client.
function makeAdminClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, serviceKey(), ADMIN_CLIENT_OPTIONS)
}

serve(async (req) => {

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  const flags = flagsOf((name) => Deno.env.get(name))
  // Off (the default): nothing is built, read or written.
  if (!anyOn(flags)) {
    return new Response(JSON.stringify(DISABLED), { status: 404, headers: corsHeaders })
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

    const parsed = parseProgressRequest(await req.json().catch(() => null))
    if (!parsed.ok) {
      return new Response(JSON.stringify({ outcome: "invalid_request", reason: parsed.reason, error: "Invalid request" }), { status: 400, headers: corsHeaders })
    }
    if (!allowed(parsed.request, flags)) {
      return new Response(JSON.stringify(DISABLED), { status: 404, headers: corsHeaders })
    }

    const { fn, args } = rpcFor(parsed.request, user.id)
    let data: unknown
    let error: unknown
    try {
      ({ data, error } = await makeAdminClient().rpc(fn, args))
    } catch (keyError: any) {
      console.error("ADMIN CLIENT ERROR:", keyError?.message ?? keyError)
      return new Response(JSON.stringify({ error: "Server configuration error" }), { status: 500, headers: corsHeaders })
    }
    if (error) {
      console.error("PROGRESS RPC ERROR:", JSON.stringify({ fn, code: errorCodeOf(error) }))
      return new Response(JSON.stringify(UNEXPECTED), { status: 500, headers: corsHeaders })
    }
    const reply = replyFor(data, parsed.request)
    if (reply.problem) console.error("PROGRESS RPC UNEXPECTED:", JSON.stringify({ fn, problem: reply.problem }))
    console.log("PROGRESS:", { kind: parsed.request.kind, outcome: reply.body.outcome ?? "error" })
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: corsHeaders })
  } catch (err: any) {
    console.error("PROGRESS FUNCTION ERROR:", err?.message ?? err)
    return new Response(JSON.stringify(UNEXPECTED), { status: 500, headers: corsHeaders })
  }

})
