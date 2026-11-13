// Lærligverse (Arkivskabet): after an answer, the pupil's client asks the SERVER which course milestones are now
// earned; the database recomputes them from the pupil's own history and pays each at most once. The contract,
// the switch (LAERLIGVERSE_COURSE_REWARDS, off unless exactly "on") and the outcomes are in ./course-progress.ts.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.118.0"
import { publishableKey, serviceKey } from "../_shared/supabase-keys.ts"
import { ADMIN_CLIENT_OPTIONS, UNEXPECTED_RESULT, handleCourseProgress } from "./course-progress.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json"
}

// The backend client for award_course_milestones and nothing else. Built per call, only when the RPC is about to
// run: no pupil Authorization header, no session. If the key cannot be resolved this throws — never a fallback to
// the user client.
function makeAdminClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, serviceKey(), ADMIN_CLIENT_OPTIONS)
}

// The verified pupil: auth.getUser() with the caller's own JWT, exactly like get-next-question. Never a body id.
async function getUser(authorization: string) {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    publishableKey(),
    { global: { headers: { Authorization: authorization } } }
  )
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return { id: user.id }
}

serve(async (req) => {

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const reply = await handleCourseProgress(
      { method: req.method, authorization: req.headers.get("Authorization") ?? "", json: () => req.json() },
      {
        env: (name) => Deno.env.get(name),
        getUser,
        makeAdminClient,
        log: (message, detail) => console.error(`${message}:`, JSON.stringify(detail)),
      }
    )
    if (reply.status === 200) {
      // Only the outcome and the counts are logged — no pupil id, no objective text.
      console.log("COURSE PROGRESS:", { outcome: reply.body.outcome, milestones: (reply.body.awarded as unknown[]).length })
    }
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: corsHeaders })
  } catch (err: any) {
    console.error("COURSE PROGRESS FUNCTION ERROR:", err?.message ?? err)
    return new Response(JSON.stringify(UNEXPECTED_RESULT), { status: 500, headers: corsHeaders })
  }

})
